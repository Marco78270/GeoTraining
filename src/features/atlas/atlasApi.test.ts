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
        google_maps_url: "https://www.google.com/maps/@-0.1048,34.759,3a,75y",
        source_name: null,
        source_url: null,
        license_name: null,
        license_url: null,
        attribution_text: null,
        categories: { name: "Bollards" },
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
      icon: null,
      color: null,
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
          googleMapsUrl: "https://www.google.com/maps/@-0.1048,34.759,3a,75y",
        }),
      ],
    }),
  ]);
});

it("genere un visuel de fallback pour les plaques officielles sans image stockee", async () => {
  const client: AtlasDataClient = {
    listPublishedClues: vi.fn().mockResolvedValue([
      {
        id: "clue-plate-fr",
        category_id: "f1000000-0000-0000-0000-000000000003",
        country_code: "FR",
        title: "Plaque - France",
        difficulty: "easy",
        coverage: "whole_country",
        characteristics: ["Fond blanc", "Double bande bleue"],
        notes: "Reference officielle",
        google_maps_url: null,
        source_name: "Plonk It Guide / GeoTrainer editorial seed",
        source_url: "https://www.plonkit.net/guide/france",
        license_name: "Editorial reference",
        license_url: "https://www.plonkit.net/guide",
        attribution_text: "France. Editorial seed.",
        categories: { name: "Plaques" },
        countries: { name: "France" },
        clue_images: [],
        clue_regions: [],
      },
    ]),
    createSignedImageUrls: vi.fn().mockResolvedValue({}),
    loadWorld: vi.fn().mockResolvedValue({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { iso2: "FR", name: "France" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-5, 41],
                [9, 41],
                [9, 51],
                [-5, 51],
                [-5, 41],
              ],
            ],
          },
        },
      ],
    }),
  };

  const result = await createAtlasApi(client).load("collection-officielle");
  const clue = result.countries[0]?.clues[0];

  expect(clue?.imageUrls).toHaveLength(1);
  expect(clue?.imageUrls[0]).toContain("data:image/svg+xml");
  expect(clue?.imageAlts[0]).toBe("Plaque de France");
});

it("prefere l'image de plaque stockee au fallback SVG officiel", async () => {
  const client: AtlasDataClient = {
    listPublishedClues: vi.fn().mockResolvedValue([
      {
        id: "clue-plate-fr",
        category_id: "f1000000-0000-0000-0000-000000000003",
        country_code: "FR",
        title: "Plaque - France",
        difficulty: "easy",
        coverage: "whole_country",
        characteristics: ["Fond blanc"],
        notes: "Reference officielle",
        google_maps_url: null,
        source_name: "Wikimedia Commons",
        source_url:
          "https://commons.wikimedia.org/wiki/File:AA-229-AA_ref_License_plate_of_France.png",
        license_name: "See Wikimedia Commons file page",
        license_url:
          "https://commons.wikimedia.org/wiki/File:AA-229-AA_ref_License_plate_of_France.png",
        attribution_text: "Example attribution",
        categories: { name: "Plaques" },
        countries: { name: "France" },
        clue_images: [
          {
            id: "stored-plate-1",
            storage_path: "official/plate-fr.jpg",
            alt_text: "Plaque france",
            sort_order: 0,
          },
        ],
        clue_regions: [],
      },
    ]),
    createSignedImageUrls: vi.fn().mockResolvedValue({
      "official/plate-fr.jpg": "https://example.test/plate-fr.jpg",
    }),
    loadWorld: vi.fn().mockResolvedValue({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { iso2: "FR", name: "France" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-5, 41],
                [9, 41],
                [9, 51],
                [-5, 51],
                [-5, 41],
              ],
            ],
          },
        },
      ],
    }),
  };

  const result = await createAtlasApi(client).load("collection-officielle");
  const clue = result.countries[0]?.clues[0];

  expect(clue?.imageUrls).toEqual(["https://example.test/plate-fr.jpg"]);
  expect(clue?.images[0]).toEqual(
    expect.objectContaining({
      id: "stored-plate-1",
      storagePath: "official/plate-fr.jpg",
      url: "https://example.test/plate-fr.jpg",
    }),
  );
});
