import { createContext, useContext } from "react";
import type { CollectionSummary } from "./collectionApi";

export type ActiveCollectionContextValue = {
  collections: CollectionSummary[];
  activeCollection: CollectionSummary | null;
  activeCollectionId: string | null;
  setActiveCollectionId(id: string | null): void;
  isLoading: boolean;
  error: Error | null;
};

export const ActiveCollectionContext =
  createContext<ActiveCollectionContextValue | null>(null);

export function useActiveCollection() {
  const context = useContext(ActiveCollectionContext);
  if (!context) {
    throw new Error(
      "useActiveCollection doit être utilisé dans ActiveCollectionProvider.",
    );
  }
  return context;
}
