import type { QueryClient } from "@tanstack/react-query";
import { collectionKeys } from "./collectionKeys";

type RealtimeChannel = {
  on(
    type: "postgres_changes",
    filter: {
      event: "*";
      schema: "public";
      table: string;
      filter?: string;
    },
    callback: () => void,
  ): RealtimeChannel;
  subscribe(): RealtimeChannel;
};

export type CollectionRealtimeClient = {
  channel(name: string): RealtimeChannel;
  removeChannel(channel: RealtimeChannel): Promise<unknown> | unknown;
};

export function subscribeToCollection(
  realtime: CollectionRealtimeClient,
  queryClient: QueryClient,
  collectionId: string,
) {
  const channel = realtime.channel(`collection:${collectionId}`);
  const invalidate = (queryKey: readonly unknown[]) => () => {
    void queryClient.invalidateQueries({ queryKey });
  };
  const invalidateMembership = () => {
    void queryClient.invalidateQueries({
      queryKey: collectionKeys.members(collectionId),
    });
    void queryClient.invalidateQueries({ queryKey: collectionKeys.list() });
  };

  channel
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "categories",
        filter: `collection_id=eq.${collectionId}`,
      },
      invalidate(collectionKeys.categories(collectionId)),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "clues",
        filter: `collection_id=eq.${collectionId}`,
      },
      invalidate(collectionKeys.clues(collectionId)),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "collection_members",
        filter: `collection_id=eq.${collectionId}`,
      },
      invalidateMembership,
    )
    .subscribe();

  return () => {
    void realtime.removeChannel(channel);
  };
}
