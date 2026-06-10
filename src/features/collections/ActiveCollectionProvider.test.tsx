import { render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  ActiveCollectionProvider,
} from "./ActiveCollectionProvider";
import { useActiveCollection } from "./activeCollectionContext";
import type { CollectionApi } from "./collectionApi";

function Probe() {
  const { activeCollection, setActiveCollectionId } = useActiveCollection();
  return (
    <>
      <output>{activeCollection?.name ?? "aucune"}</output>
      <button type="button" onClick={() => setActiveCollectionId("collection-2")}>
        Changer
      </button>
    </>
  );
}

function Wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe("ActiveCollectionProvider", () => {
  it("revalidates localStorage and falls back to the first visible collection", async () => {
    const values = new Map([["geotrainer.activeCollectionId", "inaccessible"]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const api = {
      listCollections: vi.fn().mockResolvedValue([
        { id: "collection-1", name: "STOP", role: "owner" },
        { id: "collection-2", name: "Bollards", role: "editor" },
      ]),
    } as unknown as CollectionApi;

    render(
      <ActiveCollectionProvider api={api} storage={storage}>
        <Probe />
      </ActiveCollectionProvider>,
      { wrapper: Wrapper },
    );

    expect(await screen.findByText("STOP")).toBeVisible();
    expect(storage.getItem("geotrainer.activeCollectionId")).toBe(
      "collection-1",
    );
  });

  it("persists a newly selected visible collection", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const api = {
      listCollections: vi.fn().mockResolvedValue([
        { id: "collection-1", name: "STOP", role: "owner" },
        { id: "collection-2", name: "Bollards", role: "editor" },
      ]),
    } as unknown as CollectionApi;

    render(
      <ActiveCollectionProvider api={api} storage={storage}>
        <Probe />
      </ActiveCollectionProvider>,
      { wrapper: Wrapper },
    );

    await screen.findByText("STOP");
    screen.getByRole("button", { name: "Changer" }).click();

    await waitFor(() => {
      expect(screen.getByText("Bollards")).toBeVisible();
      expect(storage.getItem("geotrainer.activeCollectionId")).toBe(
        "collection-2",
      );
    });
  });
});
