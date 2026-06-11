import { expect, it, vi } from "vitest";
import {
  createAtlasApi,
  type AtlasDataClient,
  type WorldFeatureCollection,
} from "./atlasApi";

const world: WorldFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { iso2: "KE", name: "Kenya" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [33.9, -4.7],
            [41.9, -4.7],
            [41.9, 5.1],
            [33.9, 5.1],
            [33.9, -4.7],
          ],
        ],
      },
    },
  ],
};

it("construit l'Atlas depuis les catégories et indices publiés", async () => {
  const client: AtlasDataClient = {
    listCategories: vi.fn().mockResolvedValue([
      {
        id: "category-bollards",
        collection_id: "collection-1",
        name: "Bollards",
        icon: "sign",
        color: "#20D4E6",
        created_at: "2026-06-11T00:00:00.000Z",
        updated_at: "2026-06-11T00:00:00.000Z",
      },
    ]),
    listPublishedClues: vi.fn().mockResolvedValue([
      {
        id: "clue-1",
        category_id: "category-bollards",
        country_code: "KE",
        title: "Bollards Kenyan",
        difficulty: "medium",
        characteristics: ["Peinture noire et blanche"],
        notes: "Typique du Kenya",
        countries: { name: "Kenya" },
        clue_images: [
          {
            storage_path: "collection-1/clue-1/image.png",
            alt_text: "Bollard kenyan",
            sort_order: 0,
          },
        ],
        clue_regions: [],
      },
    ]),
    createSignedImageUrls: vi.fn().mockResolvedValue({
      "collection-1/clue-1/image.png": "https://example.test/image.png",
    }),
    loadWorld: vi.fn().mockResolvedValue(world),
  };

  const result = await createAtlasApi(client).load("collection-1");

  expect(result.categories).toEqual([
    expect.objectContaining({
      id: "category-bollards",
      name: "Bollards",
      total: 1,
      countries: 1,
    }),
  ]);
  expect(result.countries).toEqual([
    expect.objectContaining({
      code: "KE",
      name: "Kenya",
      coordinates: [37.9, 0.19999999999999973],
      counts: { "category-bollards": 1 },
      clues: [
        expect.objectContaining({
          title: "Bollards Kenyan",
          imageUrls: ["https://example.test/image.png"],
        }),
      ],
    }),
  ]);
});
