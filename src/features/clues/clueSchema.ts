export const MAX_CLUE_IMAGES = 6;
export const MAX_CLUE_IMAGE_BYTES = 10 * 1024 * 1024;

const acceptedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const difficulties = new Set(["easy", "medium", "expert"]);

export type ClueDifficulty = "easy" | "medium" | "expert";
export type ClueCoverage = "whole_country" | "selected_regions";

export type ClueFormInput = {
  collectionId: string;
  categoryIds: string[];
  countryCode: string;
  coverage: ClueCoverage;
  regionIds: string[];
  difficulty: ClueDifficulty;
  title: string;
  characteristics: string[];
  notes: string;
  images: File[];
};

export type ParsedClueForm = Omit<
  ClueFormInput,
  "categoryIds" | "countryCode" | "title" | "characteristics" | "notes"
> & {
  categoryId: string;
  countryCode: string;
  title: string;
  characteristics: string[];
  notes: string | null;
};

export class ClueValidationError extends Error {
  constructor(
    public readonly field: keyof ClueFormInput,
    message: string,
  ) {
    super(message);
    this.name = "ClueValidationError";
  }
}

function requireValue(
  value: string,
  field: keyof ClueFormInput,
  message: string,
) {
  const normalized = value.trim();
  if (!normalized) {
    throw new ClueValidationError(field, message);
  }
  return normalized;
}

export function parseClueForm(input: ClueFormInput): ParsedClueForm {
  const collectionId = requireValue(
    input.collectionId,
    "collectionId",
    "Sélectionnez une collection.",
  );
  if (input.categoryIds.length !== 1 || !input.categoryIds[0]?.trim()) {
    throw new ClueValidationError(
      "categoryIds",
      "Sélectionnez exactement une catégorie.",
    );
  }
  const countryCode = requireValue(
    input.countryCode,
    "countryCode",
    "Sélectionnez un pays.",
  ).toUpperCase();
  if (!difficulties.has(input.difficulty)) {
    throw new ClueValidationError(
      "difficulty",
      "Sélectionnez une difficulté valide.",
    );
  }
  if (input.images.length === 0) {
    throw new ClueValidationError("images", "Ajoutez au moins une image.");
  }
  if (input.images.length > MAX_CLUE_IMAGES) {
    throw new ClueValidationError(
      "images",
      `Ajoutez au maximum ${MAX_CLUE_IMAGES} images.`,
    );
  }
  if (input.images.some((file) => !acceptedImageTypes.has(file.type))) {
    throw new ClueValidationError(
      "images",
      "Seuls les fichiers JPEG, PNG et WebP sont acceptés.",
    );
  }
  if (input.images.some((file) => file.size > MAX_CLUE_IMAGE_BYTES)) {
    throw new ClueValidationError(
      "images",
      "Chaque image doit peser 10 Mo maximum.",
    );
  }

  const regionIds =
    input.coverage === "whole_country"
      ? []
      : [...new Set(input.regionIds.map((regionId) => regionId.trim()).filter(Boolean))];
  if (input.coverage === "selected_regions" && regionIds.length === 0) {
    throw new ClueValidationError(
      "regionIds",
      "Sélectionnez au moins une région.",
    );
  }

  return {
    collectionId,
    categoryId: input.categoryIds[0].trim(),
    countryCode,
    coverage: input.coverage,
    regionIds,
    difficulty: input.difficulty,
    title: requireValue(input.title, "title", "Ajoutez un titre."),
    characteristics: input.characteristics
      .map((characteristic) => characteristic.trim())
      .filter(Boolean),
    notes: input.notes.trim() || null,
    images: input.images,
  };
}
