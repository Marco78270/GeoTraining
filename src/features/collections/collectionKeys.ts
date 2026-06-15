export const collectionKeys = {
  all: ["collections"] as const,
  list: () => [...collectionKeys.all, "list"] as const,
  categories: (collectionId: string) =>
    [...collectionKeys.all, collectionId, "categories"] as const,
  clues: (collectionId: string) =>
    [...collectionKeys.all, collectionId, "clues"] as const,
  members: (collectionId: string) =>
    [...collectionKeys.all, collectionId, "members"] as const,
};
