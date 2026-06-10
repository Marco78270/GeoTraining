import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { collectionKeys } from "./collectionKeys";
import { subscribeToCollection } from "./collectionRealtime";

describe("subscribeToCollection", () => {
  it("uses one channel, invalidates targeted keys, and cleans up", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const handlers: Array<() => void> = [];
    const channel = {
      on: vi.fn((_type, _filter, handler) => {
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
  });
});
