import {
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  type PropsWithChildren,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getSupabaseClient } from "../../lib/supabase";
import {
  getCollectionApi,
  type CollectionApi,
} from "./collectionApi";
import { collectionKeys } from "./collectionKeys";
import { subscribeToCollection } from "./collectionRealtime";
import {
  ActiveCollectionContext,
  type ActiveCollectionContextValue,
} from "./activeCollectionContext";

const STORAGE_KEY = "geotrainer.activeCollectionId";

export function ActiveCollectionProvider({
  children,
  api: suppliedApi,
  realtime,
  storage,
}: PropsWithChildren<{
  api?: CollectionApi;
  realtime?: Parameters<typeof subscribeToCollection>[0];
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}>) {
  const [api] = useState(() => suppliedApi ?? getCollectionApi());
  const persistence =
    storage ??
    (typeof window !== "undefined" &&
    typeof window.localStorage?.getItem === "function"
      ? window.localStorage
      : null);
  const [requestedId, setRequestedId] = useState<string | null>(() =>
    persistence?.getItem(STORAGE_KEY) ?? null,
  );
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: collectionKeys.list(),
    queryFn: api.listCollections,
  });
  const collections = useMemo(() => query.data ?? [], [query.data]);
  const activeCollection =
    collections.find((item) => item.id === requestedId) ??
    collections[0] ??
    null;

  useEffect(() => {
    if (activeCollection) {
      persistence?.setItem(STORAGE_KEY, activeCollection.id);
    } else if (!query.isLoading) {
      persistence?.removeItem(STORAGE_KEY);
    }
  }, [activeCollection, persistence, query.isLoading]);

  useEffect(() => {
    if (!activeCollection) {
      return;
    }
    let client = realtime;
    if (!client) {
      try {
        client = getSupabaseClient();
      } catch {
        return;
      }
    }
    return subscribeToCollection(client, queryClient, activeCollection.id);
  }, [activeCollection, queryClient, realtime]);

  const value = useMemo<ActiveCollectionContextValue>(
    () => ({
      collections,
      activeCollection,
      activeCollectionId: activeCollection?.id ?? null,
      setActiveCollectionId: setRequestedId,
      isLoading: query.isLoading,
      error: query.error,
    }),
    [activeCollection, collections, query.error, query.isLoading],
  );

  return (
    <ActiveCollectionContext.Provider value={value}>
      {children}
    </ActiveCollectionContext.Provider>
  );
}
