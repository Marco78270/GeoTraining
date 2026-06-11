import { describe, expect, it, vi } from "vitest";
import {
  ClueCreationError,
  createClueApi,
  type ClueDataClient,
} from "./clueApi";
import type { ClueEditInput, ClueFormInput } from "./clueSchema";

function image(name: string, type: string) {
  return new File(["image"], name, { type });
}

function form(): ClueFormInput {
  return {
    collectionId: "collection-1",
    categoryIds: ["category-1"],
    countryCode: "FR",
    coverage: "selected_regions",
    regionIds: ["FR-IDF", "FR-OCC"],
    difficulty: "medium",
    title: "Panneau STOP",
    characteristics: ["Contour blanc"],
    notes: "Souvent accompagne d'une ligne au sol.",
    googleMapsUrl: "https://www.google.com/maps/@48.8566,2.3522,3a,75y",
    images: [
      image("front.jpg", "image/jpeg"),
      image("side.webp", "image/webp"),
    ],
  };
}

function client(events: string[]): ClueDataClient {
  return {
    insertDraft: vi.fn(async () => {
      events.push("draft");
      return { id: "clue-1" };
    }),
    uploadImage: vi.fn(async (path, file, options) => {
      events.push(`upload:${path}`);
      expect(file).toBeInstanceOf(File);
      expect(options).toEqual({ contentType: file.type, upsert: false });
    }),
    insertImage: vi.fn(async (input) => {
      events.push(`metadata:${input.storage_path}`);
    }),
    insertRegions: vi.fn(async (_clueId, regionIds) => {
      events.push(`regions:${regionIds.join(",")}`);
    }),
    updateClue: vi.fn(async () => {
      events.push("update");
    }),
    replaceRegions: vi.fn(async (_clueId, regionIds) => {
      events.push(`replaceRegions:${regionIds.join(",")}`);
    }),
    deleteImageMetadata: vi.fn(async (imageIds) => {
      events.push(`deleteImageMetadata:${imageIds.join(",")}`);
    }),
    updateImageSortOrders: vi.fn(async (updates) => {
      events.push(
        `sort:${updates
          .map((update: { id: string; sort_order: number }) => `${update.id}:${update.sort_order}`)
          .join(",")}`,
      );
    }),
    publishClue: vi.fn(async () => {
      events.push("publish");
    }),
    removeImages: vi.fn(async (paths) => {
      events.push(`remove:${paths.join(",")}`);
    }),
    deleteClue: vi.fn(async () => {
      events.push("delete");
    }),
  };
}

describe("createClueApi", () => {
  it("cree le brouillon, charge les images privees, lie les enfants puis publie", async () => {
    const events: string[] = [];
    const dataClient = client(events);
    const ids = ["image-1", "image-2"];
    const api = createClueApi(dataClient, () => ids.shift()!);

    await expect(api.create(form())).resolves.toEqual({ id: "clue-1" });

    expect(events).toEqual([
      "draft",
      "upload:collection-1/clue-1/image-1.jpg",
      "metadata:collection-1/clue-1/image-1.jpg",
      "upload:collection-1/clue-1/image-2.webp",
      "metadata:collection-1/clue-1/image-2.webp",
      "regions:FR-IDF,FR-OCC",
      "publish",
    ]);
    expect(dataClient.insertDraft).toHaveBeenCalledWith({
      collection_id: "collection-1",
      category_id: "category-1",
      country_code: "FR",
      coverage: "selected_regions",
      difficulty: "medium",
      status: "draft",
      title: "Panneau STOP",
      characteristics: ["Contour blanc"],
      notes: "Souvent accompagne d'une ligne au sol.",
      google_maps_url: "https://www.google.com/maps/@48.8566,2.3522,3a,75y",
    });
    expect(dataClient.insertImage).toHaveBeenNthCalledWith(1, {
      id: "image-1",
      clue_id: "clue-1",
      storage_path: "collection-1/clue-1/image-1.jpg",
      alt_text: "Panneau STOP - image 1",
      sort_order: 0,
    });
  });

  it("ne cree aucune region explicite pour un pays entier", async () => {
    const events: string[] = [];
    const dataClient = client(events);
    const api = createClueApi(dataClient, () => "image-1");

    await api.create({
      ...form(),
      coverage: "whole_country",
      regionIds: ["FR-IDF"],
      images: [image("stop.png", "image/png")],
    });

    expect(dataClient.insertRegions).not.toHaveBeenCalled();
    expect(events.at(-1)).toBe("publish");
  });

  it("supprime les objets charges et le brouillon si une etape enfant echoue", async () => {
    const events: string[] = [];
    const dataClient = client(events);
    vi.mocked(dataClient.insertRegions).mockImplementationOnce(async () => {
      events.push("regions:failed");
      throw new Error("region insert failed");
    });
    const originalForm = form();
    const api = createClueApi(
      dataClient,
      (() => {
        const ids = ["image-1", "image-2"];
        return () => ids.shift()!;
      })(),
    );

    await expect(api.create(originalForm)).rejects.toMatchObject({
      name: "ClueCreationError",
      code: "clue_create_failed",
      stage: "regions",
      message: "Impossible d'enregistrer l'indice.",
    });

    expect(dataClient.removeImages).toHaveBeenCalledWith([
      "collection-1/clue-1/image-1.jpg",
      "collection-1/clue-1/image-2.webp",
    ]);
    expect(dataClient.deleteClue).toHaveBeenCalledWith("clue-1");
    expect(dataClient.publishClue).not.toHaveBeenCalled();
    expect(originalForm.regionIds).toEqual(["FR-IDF", "FR-OCC"]);
    expect(originalForm.images).toHaveLength(2);
  });

  it("conserve l'erreur principale meme si le nettoyage echoue", async () => {
    const events: string[] = [];
    const dataClient = client(events);
    vi.mocked(dataClient.uploadImage).mockRejectedValueOnce(
      new Error("upload failed"),
    );
    vi.mocked(dataClient.deleteClue).mockRejectedValueOnce(
      new Error("delete failed"),
    );

    const error = await createClueApi(dataClient, () => "image-1")
      .create({ ...form(), images: [image("stop.jpg", "image/jpeg")] })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ClueCreationError);
    expect(error).toMatchObject({
      code: "clue_create_failed",
      stage: "upload",
      cleanupFailed: true,
    });
    expect((error as ClueCreationError).cause).toEqual(
      new Error("upload failed"),
    );
  });

  it("met a jour un indice existant, conserve ses images et ajoute les nouvelles", async () => {
    const events: string[] = [];
    const dataClient = client(events);
    const api = createClueApi(
      dataClient,
      (() => {
        const ids = ["image-3"];
        return () => ids.shift()!;
      })(),
    );

    const input: ClueEditInput = {
      ...form(),
      clueId: "clue-1",
      countryCode: "KE",
      regionIds: ["KE-30"],
      title: "Bollards Kenyan",
      characteristics: ["Peinture jaune"],
      notes: "Nairobi et ses environs",
      googleMapsUrl: "https://www.google.com/maps/@-1.286389,36.817223,3a,75y",
      existingImages: [
        {
          id: "stored-1",
          storagePath: "collection-1/clue-1/stored-1.jpg",
          altText: "Bollard 1",
          sortOrder: 0,
        },
      ],
      removedImageIds: [],
      images: [image("new.jpg", "image/jpeg")],
    };

    await expect(api.update(input)).resolves.toEqual({ id: "clue-1" });

    expect(dataClient.updateClue).toHaveBeenCalledWith(
      "clue-1",
      expect.objectContaining({
        country_code: "KE",
        coverage: "selected_regions",
        title: "Bollards Kenyan",
      }),
    );
    expect(dataClient.replaceRegions).toHaveBeenCalledWith("clue-1", ["KE-30"]);
    expect(dataClient.uploadImage).toHaveBeenCalledWith(
      "collection-1/clue-1/image-3.jpg",
      expect.any(File),
      { contentType: "image/jpeg", upsert: false },
    );
    expect(dataClient.insertImage).toHaveBeenCalledWith({
      id: "image-3",
      clue_id: "clue-1",
      storage_path: "collection-1/clue-1/image-3.jpg",
      alt_text: "Bollards Kenyan - image 2",
      sort_order: 1,
    });
    expect(dataClient.updateImageSortOrders).toHaveBeenCalledWith([
      {
        id: "stored-1",
        clue_id: "clue-1",
        storage_path: "collection-1/clue-1/stored-1.jpg",
        sort_order: 0,
        alt_text: "Bollard 1",
      },
      {
        id: "image-3",
        clue_id: "clue-1",
        storage_path: "collection-1/clue-1/image-3.jpg",
        sort_order: 1,
        alt_text: "Bollards Kenyan - image 2",
      },
    ]);
  });
});
