import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { getSupabaseClient } from "../../lib/supabase";
import {
  parseClueEditForm,
  parseClueForm,
  type ClueEditInput,
  type ClueFormInput,
  type ParsedClueEditForm,
  type ParsedClueForm,
} from "./clueSchema";

type Tables = Database["public"]["Tables"];
type DraftInsert = Tables["clues"]["Insert"];
type ImageInsert = Tables["clue_images"]["Insert"];

export type ClueCreationStage =
  | "validation"
  | "draft"
  | "update"
  | "upload"
  | "metadata"
  | "regions"
  | "publication";

function toFriendlyClueErrorMessage(cause: unknown) {
  if (!(cause instanceof Error)) return "Impossible d'enregistrer l'indice.";

  if (
    cause.message.includes(
      "published clue category_id and country_code are immutable",
    ) ||
    cause.message.includes(
      "clue category_id and country_code are immutable after children exist",
    )
  ) {
    return "Pour un indice existant, le pays et la catégorie ne peuvent plus être modifiés.";
  }

  return "Impossible d'enregistrer l'indice.";
}

export class ClueCreationError extends Error {
  constructor(
    public readonly code: string,
    public readonly stage: ClueCreationStage,
    options: {
      cause: unknown;
      cleanupFailed?: boolean;
    },
  ) {
    super(toFriendlyClueErrorMessage(options.cause), { cause: options.cause });
    this.name = "ClueCreationError";
    this.cleanupFailed = options.cleanupFailed ?? false;
  }

  readonly cleanupFailed: boolean;
}

export type ClueDataClient = {
  insertDraft(input: DraftInsert): Promise<{ id: string }>;
  loadForEdit(clueId: string): Promise<{
    id: string;
    collectionId: string;
    categoryId: string;
    countryCode: string;
    coverage: "whole_country" | "selected_regions";
    regionIds: string[];
    difficulty: "easy" | "medium" | "expert";
    title: string;
    characteristics: string[];
    notes: string;
    googleMapsUrl: string;
    existingImages: Array<{
      id: string;
      storagePath: string;
      altText: string | null;
      sortOrder: number;
    }>;
  } | null>;
  updateClue(clueId: string, input: DraftInsert): Promise<void>;
  uploadImage(
    path: string,
    file: File,
    options: { contentType: string; upsert: false },
  ): Promise<void>;
  insertImage(input: ImageInsert): Promise<void>;
  insertRegions(clueId: string, regionIds: string[]): Promise<void>;
  replaceRegions(clueId: string, regionIds: string[]): Promise<void>;
  deleteImageMetadata(imageIds: string[]): Promise<void>;
  updateImageSortOrders(
    updates: Array<{
      id: string;
      clue_id: string;
      storage_path: string;
      sort_order: number;
      alt_text: string | null;
    }>,
  ): Promise<void>;
  publishClue(clueId: string): Promise<void>;
  removeImages(paths: string[]): Promise<void>;
  deleteClue(clueId: string): Promise<void>;
};

const extensionByMimeType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function draftInput(input: ParsedClueForm | ParsedClueEditForm): DraftInsert {
  return {
    collection_id: input.collectionId,
    category_id: input.categoryId,
    country_code: input.countryCode,
    coverage: input.coverage,
    difficulty: input.difficulty,
    status: "draft",
    title: input.title,
    characteristics: input.characteristics,
    notes: input.notes,
    google_maps_url: input.googleMapsUrl,
  };
}

function draftInputWithCoverage(
  input: ParsedClueForm | ParsedClueEditForm,
  coverage: DraftInsert["coverage"],
): DraftInsert {
  return {
    ...draftInput(input),
    coverage,
  };
}

function createImageAltText(title: string, index: number) {
  return `${title} - image ${index + 1}`;
}

export function createClueApi(
  client: ClueDataClient,
  createId: () => string = () => crypto.randomUUID(),
) {
  return {
    async loadForEdit(clueId: string) {
      return client.loadForEdit(clueId);
    },

    async create(rawInput: ClueFormInput): Promise<{ id: string }> {
      let input: ParsedClueForm;
      try {
        input = parseClueForm(rawInput);
      } catch (cause) {
        throw new ClueCreationError("clue_validation_failed", "validation", {
          cause,
        });
      }

      let stage: ClueCreationStage = "draft";
      let clueId: string | null = null;
      const uploadedPaths: string[] = [];

      try {
        const clue = await client.insertDraft(draftInput(input));
        clueId = clue.id;

        for (const [index, file] of input.images.entries()) {
          const imageId = createId();
          const extension = extensionByMimeType[file.type];
          const storagePath = `${input.collectionId}/${clue.id}/${imageId}.${extension}`;

          stage = "upload";
          await client.uploadImage(storagePath, file, {
            contentType: file.type,
            upsert: false,
          });
          uploadedPaths.push(storagePath);

          stage = "metadata";
          await client.insertImage({
            id: imageId,
            clue_id: clue.id,
            storage_path: storagePath,
            alt_text: createImageAltText(input.title, index),
            sort_order: index,
          });
        }

        if (input.coverage === "selected_regions") {
          stage = "regions";
          await client.insertRegions(clue.id, input.regionIds);
        }

        stage = "publication";
        await client.publishClue(clue.id);
        return { id: clue.id };
      } catch (cause) {
        let cleanupFailed = false;
        if (uploadedPaths.length > 0) {
          try {
            await client.removeImages(uploadedPaths);
          } catch {
            cleanupFailed = true;
          }
        }
        if (clueId) {
          try {
            await client.deleteClue(clueId);
          } catch {
            cleanupFailed = true;
          }
        }
        throw new ClueCreationError("clue_create_failed", stage, {
          cause,
          cleanupFailed,
        });
      }
    },

    async update(rawInput: ClueEditInput): Promise<{ id: string }> {
      let input: ParsedClueEditForm;
      try {
        input = parseClueEditForm(rawInput);
      } catch (cause) {
        throw new ClueCreationError("clue_validation_failed", "validation", {
          cause,
        });
      }

      let stage: ClueCreationStage = "update";
      const uploadedPaths: string[] = [];
      const insertedImageIds: string[] = [];
      const keptImages = input.existingImages;
      const nextImages = [...keptImages];
      const switchesToWholeCountry =
        input.previousCoverage === "selected_regions" &&
        input.coverage === "whole_country";
      const hasImageStructureChanges =
        input.images.length > 0 || input.removedImageIds.length > 0;

      try {
        await client.updateClue(
          input.clueId,
          switchesToWholeCountry
            ? draftInputWithCoverage(input, "selected_regions")
            : draftInput(input),
        );

        stage = "regions";
        await client.replaceRegions(
          input.clueId,
          input.coverage === "selected_regions" ? input.regionIds : [],
        );

        if (switchesToWholeCountry) {
          stage = "update";
          await client.updateClue(input.clueId, draftInput(input));
        }

        for (const [index, file] of input.images.entries()) {
          const imageId = createId();
          const extension = extensionByMimeType[file.type];
          const storagePath = `${input.collectionId}/${input.clueId}/${imageId}.${extension}`;
          const altText = createImageAltText(input.title, keptImages.length + index);

          stage = "upload";
          await client.uploadImage(storagePath, file, {
            contentType: file.type,
            upsert: false,
          });
          uploadedPaths.push(storagePath);

          stage = "metadata";
          await client.insertImage({
            id: imageId,
            clue_id: input.clueId,
            storage_path: storagePath,
            alt_text: altText,
            sort_order: keptImages.length + index,
          });
          insertedImageIds.push(imageId);
          nextImages.push({
            id: imageId,
            storagePath,
            altText,
            sortOrder: keptImages.length + index,
          });
        }

        const removedImages = rawInput.existingImages.filter((image) =>
          input.removedImageIds.includes(image.id),
        );
        if (removedImages.length > 0) {
          await client.removeImages(removedImages.map((image) => image.storagePath));
          await client.deleteImageMetadata(removedImages.map((image) => image.id));
        }

        if (hasImageStructureChanges) {
          stage = "metadata";
          await client.updateImageSortOrders(
            nextImages.map((image, index) => ({
              id: image.id,
              clue_id: input.clueId,
              storage_path: image.storagePath,
              sort_order: index,
              alt_text: image.altText,
            })),
          );
        }

        stage = "publication";
        await client.publishClue(input.clueId);

        return { id: input.clueId };
      } catch (cause) {
        let cleanupFailed = false;
        if (uploadedPaths.length > 0) {
          try {
            await client.removeImages(uploadedPaths);
          } catch {
            cleanupFailed = true;
          }
        }
        if (insertedImageIds.length > 0) {
          try {
            await client.deleteImageMetadata(insertedImageIds);
          } catch {
            cleanupFailed = true;
          }
        }
        throw new ClueCreationError("clue_create_failed", stage, {
          cause,
          cleanupFailed,
        });
      }
    },
  };
}

function throwIfError(
  error: { message: string; code?: string } | null,
  fallbackCode: string,
) {
  if (error) {
    throw Object.assign(new Error(error.message), {
      code: error.code ?? fallbackCode,
    });
  }
}

export function createSupabaseClueDataClient(
  supabase: SupabaseClient<Database>,
): ClueDataClient {
  return {
    async loadForEdit(clueId) {
      const { data, error } = await supabase
        .from("clues")
        .select(
          "id, collection_id, category_id, country_code, coverage, difficulty, title, characteristics, notes, google_maps_url, clue_images(id, storage_path, alt_text, sort_order), clue_regions(region_id)",
        )
        .eq("id", clueId)
        .single();
      throwIfError(error, "clue_load_failed");
      if (!data) return null;
      return {
        id: data.id,
        collectionId: data.collection_id,
        categoryId: data.category_id,
        countryCode: data.country_code,
        coverage: data.coverage,
        difficulty: data.difficulty,
        title: data.title,
        characteristics: data.characteristics,
        notes: data.notes ?? "",
        googleMapsUrl: data.google_maps_url ?? "",
        regionIds: (data.clue_regions ?? []).map((region) => region.region_id),
        existingImages: [...(data.clue_images ?? [])]
          .sort((left, right) => left.sort_order - right.sort_order)
          .map((image) => ({
            id: image.id,
            storagePath: image.storage_path,
            altText: image.alt_text,
            sortOrder: image.sort_order,
          })),
      };
    },

    async insertDraft(input) {
      const { data, error } = await supabase
        .from("clues")
        .insert(input)
        .select("id")
        .single();
      throwIfError(error, "clue_draft_failed");
      if (!data) {
        throw new Error("Le brouillon créé n'a pas été retourné.");
      }
      return data;
    },

    async updateClue(clueId, input) {
      const { error } = await supabase.from("clues").update(input).eq("id", clueId);
      throwIfError(error, "clue_update_failed");
    },

    async uploadImage(path, file, options) {
      const { error } = await supabase.storage
        .from("clue-images")
        .upload(path, file, options);
      throwIfError(error, "clue_upload_failed");
    },

    async insertImage(input) {
      const { error } = await supabase.from("clue_images").insert(input);
      throwIfError(error, "clue_image_metadata_failed");
    },

    async insertRegions(clueId, regionIds) {
      const { error } = await supabase.from("clue_regions").insert(
        regionIds.map((regionId) => ({
          clue_id: clueId,
          region_id: regionId,
        })),
      );
      throwIfError(error, "clue_regions_failed");
    },

    async replaceRegions(clueId, regionIds) {
      const { error: deleteError } = await supabase
        .from("clue_regions")
        .delete()
        .eq("clue_id", clueId);
      throwIfError(deleteError, "clue_regions_failed");
      if (regionIds.length === 0) return;
      await this.insertRegions(clueId, regionIds);
    },

    async deleteImageMetadata(imageIds) {
      if (imageIds.length === 0) return;
      const { error } = await supabase
        .from("clue_images")
        .delete()
        .in("id", imageIds);
      throwIfError(error, "clue_image_metadata_cleanup_failed");
    },

    async updateImageSortOrders(updates) {
      if (updates.length === 0) return;
      const { error } = await supabase.from("clue_images").upsert(updates);
      throwIfError(error, "clue_image_sort_failed");
    },

    async publishClue(clueId) {
      const { error } = await supabase
        .from("clues")
        .update({ status: "published" })
        .eq("id", clueId);
      throwIfError(error, "clue_publish_failed");
    },

    async removeImages(paths) {
      if (paths.length === 0) return;
      const { error } = await supabase.storage.from("clue-images").remove(paths);
      throwIfError(error, "clue_image_cleanup_failed");
    },

    async deleteClue(clueId) {
      const { error } = await supabase.from("clues").delete().eq("id", clueId);
      throwIfError(error, "clue_cleanup_failed");
    },
  };
}

let defaultApi: ReturnType<typeof createClueApi> | undefined;

export function getClueApi() {
  defaultApi ??= createClueApi(
    createSupabaseClueDataClient(getSupabaseClient()),
  );
  return defaultApi;
}

export type ClueApi = ReturnType<typeof createClueApi>;
