import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { collectionKeys } from "./collectionKeys";
import { subscribeToCollection } from "./collectionRealtime";

describe("subscribeToCollection", () => {
  it("uses one channel, invalidates targeted keys, and cleans up", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const handlers: Array<() => void> = [];
    const subscriptions: Array<{
      event: string;
      table: string;
      filter?: string;
    }> = [];
    const channel = {
      on: vi.fn((_type, filter, handler) => {
        subscriptions.push(filter);
        handlers.push(handler);
        return channel;
      }),
      subscribe: vi.fn(() => channel),
    };
    const realtime = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    };

    const cleanup = subscribeToCollection(
      realtime,
      queryClient,
      "collection-1",
    );
    handlers.forEach((handler) => handler());

    expect(realtime.channel).toHaveBeenCalledTimes(1);
    expect(
      subscriptions.filter(
        (subscription) =>
          subscription.table === "collection_members" &&
          subscription.event === "DELETE",
      ),
    ).toEqual([{ event: "DELETE", schema: "public", table: "collection_members" }]);
    expect(
      subscriptions.filter(
        (subscription) =>
          subscription.table === "collection_members" &&
          subscription.event !== "DELETE",
      ),
    ).toEqual([
      {
        event: "INSERT",
        schema: "public",
        table: "collection_members",
        filter: "collection_id=eq.collection-1",
      },
      {
        event: "UPDATE",
        schema: "public",
        table: "collection_members",
        filter: "collection_id=eq.collection-1",
      },
    ]);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: collectionKeys.categories("collection-1"),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: collectionKeys.clues("collection-1"),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: collectionKeys.members("collection-1"),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: collectionKeys.list(),
    });

    cleanup();
    expect(realtime.removeChannel).toHaveBeenCalledWith(channel);
  });
});
