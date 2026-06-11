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
  googleMapsUrl: string;
  images: File[];
};

export type PersistedClueImage = {
  id: string;
  storagePath: string;
  altText: string | null;
  sortOrder: number;
};

export type ClueEditInput = ClueFormInput & {
  clueId: string;
  existingImages: PersistedClueImage[];
  removedImageIds: string[];
};

export type ParsedClueForm = Omit<
  ClueFormInput,
  | "categoryIds"
  | "countryCode"
  | "title"
  | "characteristics"
  | "notes"
  | "googleMapsUrl"
> & {
  categoryId: string;
  countryCode: string;
  title: string;
  characteristics: string[];
  notes: string | null;
  googleMapsUrl: string | null;
};

export type ParsedClueEditForm = ParsedClueForm & {
  clueId: string;
  existingImages: PersistedClueImage[];
  removedImageIds: string[];
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

function optionalHttpUrl(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("invalid_protocol");
    }
    return normalized;
  } catch {
    throw new ClueValidationError(
      "googleMapsUrl",
      "Ajoutez une URL HTTP(S) valide pour Google Maps.",
    );
  }
}

function validateNewImages(images: File[]) {
  if (images.length > MAX_CLUE_IMAGES) {
    throw new ClueValidationError(
      "images",
      `Ajoutez au maximum ${MAX_CLUE_IMAGES} images.`,
    );
  }
  if (images.some((file) => !acceptedImageTypes.has(file.type))) {
    throw new ClueValidationError(
      "images",
      "Seuls les fichiers JPEG, PNG et WebP sont acceptés.",
    );
  }
  if (images.some((file) => file.size > MAX_CLUE_IMAGE_BYTES)) {
    throw new ClueValidationError(
      "images",
      "Chaque image doit peser 10 Mo maximum.",
    );
  }
}

function parseBaseClueForm(input: ClueFormInput): Omit<ParsedClueForm, "images"> {
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
    googleMapsUrl: optionalHttpUrl(input.googleMapsUrl),
  };
}

export function parseClueForm(input: ClueFormInput): ParsedClueForm {
  validateNewImages(input.images);
  if (input.images.length === 0) {
    throw new ClueValidationError("images", "Ajoutez au moins une image.");
  }

  return {
    ...parseBaseClueForm(input),
    images: input.images,
  };
}

export function parseClueEditForm(input: ClueEditInput): ParsedClueEditForm {
  validateNewImages(input.images);

  const removedImageIds = new Set(
    input.removedImageIds.map((imageId) => imageId.trim()).filter(Boolean),
  );
  const existingImages = input.existingImages.filter(
    (image) => !removedImageIds.has(image.id),
  );
  const finalImageCount = existingImages.length + input.images.length;

  if (finalImageCount === 0) {
    throw new ClueValidationError("images", "Ajoutez au moins une image.");
  }
  if (finalImageCount > MAX_CLUE_IMAGES) {
    throw new ClueValidationError(
      "images",
      `Ajoutez au maximum ${MAX_CLUE_IMAGES} images.`,
    );
  }

  return {
    clueId: input.clueId.trim(),
    ...parseBaseClueForm(input),
    existingImages,
    removedImageIds: [...removedImageIds],
    images: input.images,
  };
}
