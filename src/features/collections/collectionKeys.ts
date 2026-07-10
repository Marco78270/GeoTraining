export const collectionKeys = {
  all: ["collections"] as const,
  list: () => [...collectionKeys.all, "list"] as const,
  categories: (collectionId: string) =>
    [...collectionKeys.all, collectionId, "categories"] as const,
  categoryStats: (collectionId: string) =>
    [...collectionKeys.all, collectionId, "category-stats"] as const,
  clueFilters: (collectionId: string) =>
    [...collectionKeys.all, collectionId, "clue-filters"] as const,
  clueLibraries: (collectionId: string) =>
    [...collectionKeys.all, collectionId, "clue-library"] as const,
  clueLibrary: (
    collectionId: string,
    filters: Record<string, string | number | undefined>,
  ) => [...collectionKeys.clueLibraries(collectionId), filters] as const,
  clues: (collectionId: string) =>
    [...collectionKeys.all, collectionId, "clues"] as const,
  members: (collectionId: string) =>
    [...collectionKeys.all, collectionId, "members"] as const,
};
