import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import {
  AuthContext,
  type AuthContextValue,
} from "../auth/authContext";
import {
  ActiveCollectionContext,
  type ActiveCollectionContextValue,
} from "../collections/activeCollectionContext";
import type { AtlasApi } from "./atlasApi";
import { AtlasPage } from "./AtlasPage";

vi.mock("./AtlasMap", () => ({
  AtlasMap: ({
    markers,
    selectedCountryCode,
    onCountrySelect,
    onViewportChange,
  }: ComponentProps<typeof import("./AtlasMap").AtlasMap>) => (
    <div data-testid="atlas-map">
      <output aria-label="Nombre de marqueurs">{markers.length}</output>
      <output aria-label="Pays sélectionné">
        {selectedCountryCode ?? "monde"}
      </output>
      <button
        type="button"
        onClick={() => {
          onCountrySelect("KE");
          onViewportChange("country");
        }}
      >
        Sélectionner le Kenya
      </button>
    </div>
  ),
}));

const authValue: AuthContextValue = {
  session: null,
  user: {
    id: "user-1",
    email: "marco@example.com",
  } as AuthContextValue["user"],
  loading: false,
  configurationError: null,
  sessionError: null,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => ({ error: null }),
};

const collection = {
  id: "collection-1",
  name: "Mes indices",
  description: null,
  owner_id: "user-1",
  created_at: "2026-06-10T00:00:00.000Z",
  updated_at: "2026-06-10T00:00:00.000Z",
  role: "owner" as const,
};

const collectionValue: ActiveCollectionContextValue = {
  collections: [collection],
  activeCollection: collection,
  activeCollectionId: collection.id,
  setActiveCollectionId: vi.fn(),
  isLoading: false,
  error: null,
};

const atlasApi: AtlasApi = {
  load: vi.fn().mockResolvedValue({
    categories: [
      {
        id: "category-bollards",
        name: "Bollards",
        shortName: "Bollards",
        total: 1,
        countries: 1,
        icon: "sign",
        color: "#20D4E6",
      },
    ],
    countries: [
      {
        code: "KE",
        name: "Kenya",
        coordinates: [37.9, 0.2],
        difficulty: "medium",
        counts: { "category-bollards": 1 },
        regions: [],
        clues: [
          {
            id: "clue-1",
            categoryId: "category-bollards",
            title: "Bollards Kenyan",
            difficulty: "medium",
            characteristics: ["Peinture noire et blanche"],
            notes: "Typique du Kenya",
            imageUrls: ["https://example.test/kenya.png"],
            imageAlts: ["Bollard kenyan"],
            regions: [],
          },
        ],
      },
    ],
  }),
};

function renderAtlas(api: AtlasApi = atlasApi) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>
          <ActiveCollectionContext.Provider value={collectionValue}>
            <AtlasPage atlasApi={api} />
          </ActiveCollectionContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("affiche les catégories et indices publiés de la collection active", async () => {
  const user = userEvent.setup();
  renderAtlas();

  expect(await screen.findByRole("button", { name: /Bollards/i })).toBeVisible();
  expect(screen.getByLabelText("Nombre de marqueurs")).toHaveTextContent("1");

  await user.click(screen.getByRole("button", { name: "Sélectionner le Kenya" }));

  expect(screen.getByRole("heading", { name: "Kenya" })).toBeVisible();
  expect(screen.getByText("Bollards Kenyan")).toBeVisible();
  expect(screen.getByRole("img", { name: "Bollard kenyan" })).toHaveAttribute(
    "src",
    "https://example.test/kenya.png",
  );
});

it("affiche un état vide lorsque la collection ne contient aucun indice", async () => {
  renderAtlas({
    load: vi.fn().mockResolvedValue({ categories: [], countries: [] }),
  });

  expect(
    await screen.findByRole("status", { name: "Atlas vide" }),
  ).toHaveTextContent("Aucun indice publié");
});

it("ouvre l'éditeur d'indice depuis l'action principale", async () => {
  renderAtlas();

  expect(
    await screen.findByRole("link", { name: "Ajouter un indice" }),
  ).toHaveAttribute("href", "/clues/new");
});
