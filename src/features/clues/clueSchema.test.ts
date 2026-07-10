import { describe, expect, it } from "vitest";
import {
  MAX_CLUE_IMAGE_BYTES,
  parseClueEditForm,
  parseClueForm,
  type ClueFormInput,
} from "./clueSchema";
import type { ClueZoneGeoJson } from "./clueLocationTypes";

function image(
  name = "stop.webp",
  type = "image/webp",
  size = 1_024,
) {
  return new File([new Uint8Array(size)], name, { type });
}

function validZone(): ClueZoneGeoJson {
  return {
    type: "Polygon",
    coordinates: [
      [
        [2.2, 48.8],
        [2.3, 48.8],
        [2.35, 48.9],
        [2.2, 48.8],
      ],
    ],
  };
}

function validInput(
  overrides: Partial<ClueFormInput> = {},
): ClueFormInput {
  return {
    collectionId: "collection-1",
    categoryIds: ["category-1"],
    countryCode: "FR",
    coverage: "whole_country",
    regionIds: [],
    zoneGeoJson: null,
    difficulty: "easy",
    title: "Panneau STOP français",
    characteristics: ["Bordure blanche"],
    notes: "",
    googleMapsUrl: "",
    images: [image()],
    ...overrides,
  };
}

describe("parseClueForm", () => {
  it("accepte de une à six images JPEG, PNG ou WebP de 10 Mo maximum", () => {
    expect(
      parseClueForm(
        validInput({
          images: [
            image("one.jpg", "image/jpeg"),
            image("two.png", "image/png"),
            image("three.webp", "image/webp", MAX_CLUE_IMAGE_BYTES),
          ],
        }),
      ).images,
    ).toHaveLength(3);
  });

  it.each([
    { images: [], message: "Ajoutez au moins une image." },
    {
      images: Array.from({ length: 7 }, (_, index) => image(`${index}.png`, "image/png")),
      message: "Ajoutez au maximum 6 images.",
    },
    {
      images: [image("stop.gif", "image/gif")],
      message: "Seuls les fichiers JPEG, PNG et WebP sont acceptés.",
    },
    {
      images: [image("large.jpg", "image/jpeg", MAX_CLUE_IMAGE_BYTES + 1)],
      message: "Chaque image doit peser 10 Mo maximum.",
    },
  ])("refuse les images invalides", ({ images, message }) => {
    expect(() => parseClueForm(validInput({ images }))).toThrow(message);
  });

  it("exige une collection, exactement une catégorie, un pays et une difficulté valide", () => {
    expect(() => parseClueForm(validInput({ collectionId: "" }))).toThrow(
      "Sélectionnez une collection.",
    );
    expect(() => parseClueForm(validInput({ categoryIds: [] }))).toThrow(
      "Sélectionnez exactement une catégorie.",
    );
    expect(() =>
      parseClueForm(validInput({ categoryIds: ["one", "two"] })),
    ).toThrow("Sélectionnez exactement une catégorie.");
    expect(() => parseClueForm(validInput({ countryCode: "" }))).toThrow(
      "Sélectionnez un pays.",
    );
    expect(() =>
      parseClueForm({
        ...validInput(),
        difficulty: "legendary" as ClueFormInput["difficulty"],
      }),
    ).toThrow("Sélectionnez une difficulté valide.");
  });

  it("vide explicitement les régions pour un indice pays entier", () => {
    expect(
      parseClueForm(
        validInput({
          coverage: "whole_country",
          regionIds: ["FR-IDF", "FR-OCC"],
        }),
      ).regionIds,
    ).toEqual([]);
  });

  it("exige au moins une région pour une couverture régionale", () => {
    expect(() =>
      parseClueForm(
        validInput({ coverage: "selected_regions", regionIds: [] }),
      ),
    ).toThrow("Sélectionnez au moins une région.");

    expect(
      parseClueForm(
        validInput({
          coverage: "selected_regions",
          regionIds: ["FR-IDF"],
        }),
      ).regionIds,
    ).toEqual(["FR-IDF"]);
  });

  it("ignore la zone dessinée quand le mode n'est pas libre", () => {
    expect(
      parseClueForm(
        validInput({
          coverage: "whole_country",
          zoneGeoJson: validZone(),
        }),
      ).zoneGeoJson,
    ).toBeNull();
  });

  it("exige une zone dessinée valide pour la couverture libre", () => {
    expect(() =>
      parseClueForm(
        validInput({
          coverage: "drawn_zone",
          zoneGeoJson: null,
        }),
      ),
    ).toThrow("Dessinez une zone valide sur l'atlas.");

    expect(
      parseClueForm(
        validInput({
          coverage: "drawn_zone",
          zoneGeoJson: validZone(),
        }),
      ).zoneGeoJson,
    ).toEqual(validZone());
  });

  it("accepte un lien Google Maps HTTP(S) valide et le normalise", () => {
    expect(
      parseClueForm(
        validInput({
          googleMapsUrl:
            "  https://www.google.com/maps/@-0.1048,34.759,3a,75y  ",
        }),
      ).googleMapsUrl,
    ).toBe("https://www.google.com/maps/@-0.1048,34.759,3a,75y");
  });

  it("refuse un lien Google Maps invalide", () => {
    expect(() =>
      parseClueForm(validInput({ googleMapsUrl: "maps.google.com" })),
    ).toThrow("Ajoutez une URL HTTP(S) valide pour Google Maps.");
  });

  it("accepte une édition sans nouvelle image si une image existante reste", () => {
    expect(
      parseClueEditForm({
        ...validInput({ images: [] }),
        clueId: "clue-1",
        previousCategoryId: "category-1",
        previousCoverage: "whole_country",
        existingImages: [
          {
            id: "stored-1",
            storagePath: "collection-1/clue-1/stored-1.jpg",
            altText: "Stored image",
            sortOrder: 0,
          },
        ],
        removedImageIds: [],
      }).existingImages,
    ).toHaveLength(1);
  });

  it("refuse une édition qui supprime la dernière image restante", () => {
    expect(() =>
      parseClueEditForm({
        ...validInput({ images: [] }),
        clueId: "clue-1",
        previousCategoryId: "category-1",
        previousCoverage: "whole_country",
        existingImages: [
          {
            id: "stored-1",
            storagePath: "collection-1/clue-1/stored-1.jpg",
            altText: "Stored image",
            sortOrder: 0,
          },
        ],
        removedImageIds: ["stored-1"],
      }),
    ).toThrow("Ajoutez au moins une image.");
  });
});
