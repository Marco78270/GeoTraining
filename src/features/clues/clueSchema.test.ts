import { describe, expect, it } from "vitest";
import {
  MAX_CLUE_IMAGE_BYTES,
  parseClueForm,
  type ClueFormInput,
} from "./clueSchema";

function image(
  name = "stop.webp",
  type = "image/webp",
  size = 1_024,
) {
  return new File([new Uint8Array(size)], name, { type });
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
    difficulty: "easy",
    title: "Panneau STOP français",
    characteristics: ["Bordure blanche"],
    notes: "",
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
});
