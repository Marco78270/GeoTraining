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
        coverage: "selected_regions",
        characteristics: ["Peinture noire et blanche"],
        notes: "Typique du Kenya",
        google_maps_url:
          "https://www.google.com/maps/@-0.1048,34.759,3a,75y",
        countries: { name: "Kenya" },
        clue_images: [
          {
            id: "stored-1",
            storage_path: "collection-1/clue-1/image.png",
            alt_text: "Bollard kenyan",
            sort_order: 0,
          },
        ],
        clue_regions: [
          {
            region_id: "KE-30",
            regions: { name: "Nairobi County" },
          },
        ],
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
          coverage: "selected_regions",
          regionIds: ["KE-30"],
          regions: ["Nairobi County"],
          images: [
            expect.objectContaining({
              id: "stored-1",
              storagePath: "collection-1/clue-1/image.png",
              altText: "Bollard kenyan",
              url: "https://example.test/image.png",
            }),
          ],
          imageUrls: ["https://example.test/image.png"],
          googleMapsUrl:
            "https://www.google.com/maps/@-0.1048,34.759,3a,75y",
        }),
      ],
    }),
  ]);
});
