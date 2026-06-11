import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { getSupabaseClient } from "../../lib/supabase";
import {
  parseClueForm,
  type ClueFormInput,
  type ParsedClueForm,
} from "./clueSchema";

type Tables = Database["public"]["Tables"];
type DraftInsert = Tables["clues"]["Insert"];
type ImageInsert = Tables["clue_images"]["Insert"];

export type ClueCreationStage =
  | "validation"
  | "draft"
  | "upload"
  | "metadata"
  | "regions"
  | "publication";

export class ClueCreationError extends Error {
  constructor(
    public readonly code: string,
    public readonly stage: ClueCreationStage,
    options: {
      cause: unknown;
      cleanupFailed?: boolean;
    },
  ) {
    super("Impossible d'enregistrer l'indice.", { cause: options.cause });
    this.name = "ClueCreationError";
    this.cleanupFailed = options.cleanupFailed ?? false;
  }

  readonly cleanupFailed: boolean;
}

export type ClueDataClient = {
  insertDraft(input: DraftInsert): Promise<{ id: string }>;
  uploadImage(
    path: string,
    file: File,
    options: { contentType: string; upsert: false },
  ): Promise<void>;
  insertImage(input: ImageInsert): Promise<void>;
  insertRegions(clueId: string, regionIds: string[]): Promise<void>;
  publishClue(clueId: string): Promise<void>;
  removeImages(paths: string[]): Promise<void>;
  deleteClue(clueId: string): Promise<void>;
};

const extensionByMimeType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function draftInput(input: ParsedClueForm): DraftInsert {
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
  };
}

export function createClueApi(
  client: ClueDataClient,
  createId: () => string = () => crypto.randomUUID(),
) {
  return {
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
            alt_text: `${input.title} - image ${index + 1}`,
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

    async publishClue(clueId) {
      const { error } = await supabase
        .from("clues")
        .update({ status: "published" })
        .eq("id", clueId);
      throwIfError(error, "clue_publish_failed");
    },

    async removeImages(paths) {
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
