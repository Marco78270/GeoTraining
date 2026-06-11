import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { collectionKeys } from "./collectionKeys";
import { subscribeToCollection } from "./collectionRealtime";

describe("subscribeToCollection", () => {
  it("uses safe filtered events, polls all keys, and cleans up", () => {
    vi.useFakeTimers();
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

    expect(realtime.channel).toHaveBeenCalledTimes(1);
    expect(subscriptions).toHaveLength(6);
    expect(subscriptions.every(({ event }) => event !== "DELETE" && event !== "*"))
      .toBe(true);
    expect(subscriptions).toEqual(
      ["categories", "clues", "collection_members"].flatMap((table) =>
        ["INSERT", "UPDATE"].map((event) => ({
          event,
          schema: "public",
          table,
          filter: "collection_id=eq.collection-1",
        })),
      ),
    );

    handlers.forEach((handler) => handler());
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

    invalidate.mockClear();
    vi.advanceTimersByTime(25_000);
    expect(invalidate).toHaveBeenCalledTimes(4);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: collectionKeys.list(),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: collectionKeys.categories("collection-1"),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: collectionKeys.clues("collection-1"),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: collectionKeys.members("collection-1"),
    });

    cleanup();
    expect(realtime.removeChannel).toHaveBeenCalledWith(channel);
    invalidate.mockClear();
    vi.advanceTimersByTime(25_000);
    expect(invalidate).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
