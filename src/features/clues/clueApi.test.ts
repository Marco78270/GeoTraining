import { describe, expect, it, vi } from "vitest";
import {
  ClueCreationError,
  createClueApi,
  type ClueDataClient,
} from "./clueApi";
import type { ClueFormInput } from "./clueSchema";

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
    notes: "Souvent accompagné d'une ligne au sol.",
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
  it("crée le brouillon, charge les images privées, lie les enfants puis publie", async () => {
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
      notes: "Souvent accompagné d'une ligne au sol.",
    });
    expect(dataClient.insertImage).toHaveBeenNthCalledWith(1, {
      id: "image-1",
      clue_id: "clue-1",
      storage_path: "collection-1/clue-1/image-1.jpg",
      alt_text: "Panneau STOP - image 1",
      sort_order: 0,
    });
  });

  it("ne crée aucune région explicite pour un pays entier", async () => {
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

  it("supprime les objets chargés et le brouillon si une étape enfant échoue", async () => {
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

  it("conserve l'erreur principale même si le nettoyage échoue", async () => {
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
});
