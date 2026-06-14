import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import {
  ActiveCollectionContext,
  type ActiveCollectionContextValue,
} from "../collections/activeCollectionContext";
import type { CollectionApi } from "../collections/collectionApi";
import type { ClueApi } from "./clueApi";
import { ClueEditorPage } from "./ClueEditorPage";

const collectionApi = {
  listCategories: vi.fn().mockResolvedValue([
    {
      id: "category-stop",
      collection_id: "collection-1",
      name: "Panneaux STOP",
      icon: "sign",
      color: "#20D4E6",
      created_at: "2026-06-11T00:00:00.000Z",
      updated_at: "2026-06-11T00:00:00.000Z",
    },
  ]),
} as unknown as CollectionApi;

const collection = {
  id: "collection-1",
  name: "Mes panneaux",
  description: null,
  owner_id: "user-1",
  visibility: "private" as const,
  created_at: "2026-06-11T00:00:00.000Z",
  updated_at: "2026-06-11T00:00:00.000Z",
  role: "owner" as const,
};

const collectionContext: ActiveCollectionContextValue = {
  collections: [collection],
  activeCollection: collection,
  activeCollectionId: collection.id,
  setActiveCollectionId: vi.fn(),
  isLoading: false,
  error: null,
};

it("recharge un indice en édition depuis le clueId quand l'état de navigation est absent", async () => {
  const clueApi = {
    loadForEdit: vi.fn().mockResolvedValue({
      id: "clue-1",
      collectionId: "collection-1",
      categoryId: "category-stop",
      countryCode: "FR",
      coverage: "whole_country",
      regionIds: [],
      difficulty: "medium",
      title: "STOP français",
      characteristics: ["Octogone rouge"],
      notes: "Présent sur les routes.",
      googleMapsUrl: "https://www.google.com/maps/@48.8566,2.3522,3a,75y",
      existingImages: [
        {
          id: "stored-1",
          storagePath: "collection-1/clue-1/stored-1.jpg",
          altText: "STOP 1",
          sortOrder: 0,
        },
      ],
    }),
    create: vi.fn(),
    update: vi.fn(),
  } as unknown as ClueApi;

  render(
    <ActiveCollectionContext.Provider value={collectionContext}>
      <MemoryRouter initialEntries={["/clues/clue-1/edit"]}>
        <Routes>
          <Route
            path="/clues/:clueId/edit"
            element={<ClueEditorPage clueApi={clueApi} collectionApi={collectionApi} />}
          />
        </Routes>
      </MemoryRouter>
    </ActiveCollectionContext.Provider>,
  );

  expect(screen.getByRole("status")).toHaveTextContent("Chargement de l’indice");

  await waitFor(() => {
    expect(clueApi.loadForEdit).toHaveBeenCalledWith("clue-1");
  });
  expect(await screen.findByText("STOP 1")).toBeVisible();
});
