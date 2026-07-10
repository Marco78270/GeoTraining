import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { getAdminApi } from "../admin/adminApi";
import { AuthContext, type AuthContextValue } from "../auth/authContext";
import type { ClueApi } from "../clues/clueApi";
import {
  ActiveCollectionContext,
  type ActiveCollectionContextValue,
} from "../collections/activeCollectionContext";
import type { AtlasApi } from "./atlasApi";
import { AtlasPage } from "./AtlasPage";

vi.mock("../admin/adminApi", () => ({
  getAdminApi: vi.fn(),
}));

vi.mock("./AtlasMap", () => ({
  AtlasMap: ({
    markers,
    selectedCountryCode,
    selectedRegionId,
    onCountrySelect,
    onRegionSelect,
    onViewportChange,
    hasWholeCountryCoverage,
    coveredRegionIds = [],
    visibleZones = [],
  }: ComponentProps<typeof import("./AtlasMap").AtlasMap>) => (
    <div data-testid="atlas-map">
      <output aria-label="Nombre de marqueurs">{markers.length}</output>
      <output aria-label="Difficultes pays">
        {markers.map((marker) => `${marker.code}:${marker.difficulty}`).join(",")}
      </output>
      <output aria-label="Pays selectionne">
        {selectedCountryCode ?? "monde"}
      </output>
      <output aria-label="Couverture nationale">
        {hasWholeCountryCoverage ? "oui" : "non"}
      </output>
      <output aria-label="Regions couvertes">
        {coveredRegionIds.join(",")}
      </output>
      <output aria-label="Zones dessinees visibles">
        {visibleZones.map((zone) => zone.id).join(",")}
      </output>
      <output aria-label="Region selectionnee">
        {selectedRegionId ?? "aucune"}
      </output>
      <button
        type="button"
        onClick={() => {
          onCountrySelect("KE");
          onViewportChange("country");
        }}
      >
        Selectionner le Kenya
      </button>
      <button
        type="button"
        onClick={() => {
          onCountrySelect("KE");
          onViewportChange("country");
          onRegionSelect?.("KE-30");
        }}
      >
        Selectionner Nairobi County
      </button>
    </div>
  ),
}));

const getCurrentPlatformRole = vi.fn().mockResolvedValue(null);

vi.mocked(getAdminApi).mockReturnValue({
  getCurrentPlatformRole,
} as unknown as ReturnType<typeof getAdminApi>);

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
  visibility: "private" as const,
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

const atlasData = {
  categories: [
    {
      id: "category-bollards",
      name: "Bollards",
      shortName: "Bollards",
      total: 3,
      countries: 1,
      icon: "sign",
      color: "#20D4E6",
    },
  ],
  countries: [
    {
      code: "KE",
      name: "Kenya",
      coordinates: [37.9, 0.2] as [number, number],
      difficulty: "medium" as const,
      counts: { "category-bollards": 2 },
      regions: ["Nairobi County", "Mombasa County"],
      clues: [
        {
          id: "clue-1",
          categoryId: "category-bollards",
          title: "Bollards Kenyan",
          difficulty: "medium" as const,
          coverage: "whole_country" as const,
          zoneGeoJson: null,
          characteristics: ["Peinture noire et blanche"],
          notes: "Typique du Kenya",
          googleMapsUrl: "https://www.google.com/maps/@-0.1048,34.759,3a,75y",
          regionIds: [],
          images: [
            {
              id: "stored-1",
              storagePath: "collection-1/clue-1/stored-1.png",
              altText: "Bollard kenyan",
              url: "https://example.test/kenya.png",
            },
          ],
          imageUrls: ["https://example.test/kenya.png"],
          imageAlts: ["Bollard kenyan"],
          regions: [],
        },
        {
          id: "clue-2",
          categoryId: "category-bollards",
          title: "Bollards Nairobi",
          difficulty: "easy" as const,
          coverage: "selected_regions" as const,
          zoneGeoJson: null,
          characteristics: ["Jaune"],
          notes: null,
          googleMapsUrl: null,
          regionIds: ["KE-30", "KE-40"],
          images: [
            {
              id: "stored-2",
              storagePath: "collection-1/clue-2/stored-2.png",
              altText: "Bollard Nairobi",
              url: "https://example.test/nairobi.png",
            },
          ],
          imageUrls: ["https://example.test/nairobi.png"],
          imageAlts: ["Bollard Nairobi"],
          regions: ["Nairobi County", "Mombasa County"],
        },
        {
          id: "clue-zone-1",
          categoryId: "category-bollards",
          title: "Bollards zone dessinee",
          difficulty: "expert" as const,
          coverage: "drawn_zone" as const,
          zoneGeoJson: {
            type: "Polygon" as const,
            coordinates: [
              [
                [36.7, -1.5],
                [37.2, -1.5],
                [37.2, -1],
                [36.7, -1],
                [36.7, -1.5],
              ],
            ],
          },
          characteristics: ["Zone precise"],
          notes: null,
          googleMapsUrl: null,
          regionIds: [],
          images: [],
          imageUrls: [],
          imageAlts: [],
          regions: [],
        },
      ],
    },
  ],
};

const atlasApi: AtlasApi = {
  load: vi.fn().mockResolvedValue(atlasData),
};

const clueApi: Pick<ClueApi, "delete"> = {
  delete: vi.fn().mockResolvedValue(undefined),
};

function renderAtlas(
  api: AtlasApi = atlasApi,
  suppliedClueApi: Pick<ClueApi, "delete"> = clueApi,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>
          <ActiveCollectionContext.Provider value={collectionValue}>
            <AtlasPage atlasApi={api} clueApi={suppliedClueApi} />
          </ActiveCollectionContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderAtlasWithCollection(
  collectionOverride: Partial<(typeof collectionValue)["activeCollection"]> = {},
  api: AtlasApi = atlasApi,
  suppliedClueApi: Pick<ClueApi, "delete"> = clueApi,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const currentCollection = { ...collection, ...collectionOverride };
  const currentValue = {
    ...collectionValue,
    collections: [currentCollection],
    activeCollection: currentCollection,
    activeCollectionId: currentCollection.id,
  };
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>
          <ActiveCollectionContext.Provider value={currentValue}>
            <AtlasPage atlasApi={api} clueApi={suppliedClueApi} />
          </ActiveCollectionContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("affiche les categories et indices publies de la collection active", async () => {
  const user = userEvent.setup();
  renderAtlas();

  expect(
    (await screen.findAllByRole("button", { name: /Bollards/i })).length,
  ).toBeGreaterThan(0);
  expect(screen.getByLabelText("Nombre de marqueurs")).toHaveTextContent("1");
  expect(screen.getByLabelText("Zones dessinees visibles")).toHaveTextContent(
    "clue-zone-1",
  );

  await user.click(screen.getByRole("button", { name: "Selectionner le Kenya" }));

  expect(screen.getByRole("heading", { name: "Kenya" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Bollards Kenyan" })).toBeVisible();
  expect(screen.getByRole("img", { name: "Bollard kenyan" })).toHaveAttribute(
    "src",
    "https://example.test/kenya.png",
  );
  expect(
    screen.getByRole("link", { name: "Ouvrir dans Google Maps" }),
  ).toHaveAttribute(
    "href",
    "https://www.google.com/maps/@-0.1048,34.759,3a,75y",
  );
  expect(
    screen.getByRole("link", { name: "Modifier l’indice" }),
  ).toHaveAttribute("href", "/clues/clue-1/edit");
});

it("agrege la couverture regionale du pays selectionne", async () => {
  const user = userEvent.setup();
  renderAtlas();

  await user.click(await screen.findByRole("button", { name: "Selectionner le Kenya" }));

  expect(screen.getByLabelText("Couverture nationale")).toHaveTextContent("oui");
  expect(screen.getByLabelText("Regions couvertes")).toHaveTextContent("KE-30,KE-40");
});

it("masque la liste des indices regionaux dans le panneau de droite", async () => {
  const user = userEvent.setup();
  renderAtlas();

  await user.click(await screen.findByRole("button", { name: "Selectionner le Kenya" }));

  expect(screen.getByRole("heading", { name: "Bollards Kenyan" })).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Indices régionaux" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Nairobi County, Mombasa County" }),
  ).not.toBeInTheDocument();
});

it("selectionne un indice regional depuis la carte", async () => {
  const user = userEvent.setup();
  renderAtlas();

  await user.click(
    await screen.findByRole("button", { name: "Selectionner Nairobi County" }),
  );

  expect(screen.getByRole("heading", { name: "Kenya" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Bollards Nairobi" })).toBeVisible();
  expect(screen.getByLabelText("Region selectionnee")).toHaveTextContent("KE-30");
});

it("active la region de l'indice avant de demander le zoom", async () => {
  const user = userEvent.setup();
  const regionalFirstApi: AtlasApi = {
    load: vi.fn().mockResolvedValue({
      ...atlasData,
      countries: [
        {
          ...atlasData.countries[0],
          clues: [atlasData.countries[0].clues[1], atlasData.countries[0].clues[0]],
        },
      ],
    }),
  };

  renderAtlas(regionalFirstApi);

  await user.click(await screen.findByRole("button", { name: "Selectionner le Kenya" }));

  expect(screen.getByRole("heading", { name: "Bollards Nairobi" })).toBeVisible();
  expect(screen.getByLabelText("Region selectionnee")).toHaveTextContent("aucune");

  await user.click(
    screen.getByRole("button", { name: "Zoomer sur Kenya · Nairobi County" }),
  );

  expect(screen.getByLabelText("Region selectionnee")).toHaveTextContent("KE-30");
});

it("affiche un etat vide lorsque la collection ne contient aucun indice", async () => {
  renderAtlas({
    load: vi.fn().mockResolvedValue({ categories: [], countries: [] }),
  });

  expect(
    await screen.findByRole("status", { name: "Atlas vide" }),
  ).toHaveTextContent("Aucun indice publié");
});

it("ouvre l'editeur d'indice depuis l'action principale", async () => {
  renderAtlas();

  expect(
    await screen.findByRole("link", { name: "Ajouter un indice" }),
  ).toHaveAttribute("href", "/clues/new");
});

it("masque les actions d'ecriture pour une collection publique", async () => {
  const user = userEvent.setup();
  renderAtlasWithCollection({
    id: "collection-public",
    name: "Collection officielle",
    visibility: "public_readonly",
    role: null,
  });

  expect(screen.queryByRole("link", { name: "Ajouter un indice" })).not.toBeInTheDocument();
  expect(
    await screen.findByText(/Collection publique en lecture seule/i),
  ).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Selectionner le Kenya" }));

  expect(screen.getByText("Officielle")).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Modifier l’indice" }),
  ).not.toBeInTheDocument();
});

it("autorise un admin de plateforme a modifier une collection publique", async () => {
  const user = userEvent.setup();
  getCurrentPlatformRole.mockResolvedValueOnce("admin");
  renderAtlasWithCollection({
    id: "collection-public",
    name: "Collection officielle",
    visibility: "public_readonly",
    role: null,
  });

  expect(
    await screen.findByRole("link", { name: "Ajouter un indice" }),
  ).toHaveAttribute("href", "/clues/new");

  await user.click(screen.getByRole("button", { name: "Selectionner le Kenya" }));

  expect(
    screen.getByRole("link", { name: "Modifier l’indice" }),
  ).toHaveAttribute("href", "/clues/clue-1/edit");
});

it("supprime un indice apres confirmation puis recharge l'atlas", async () => {
  const user = userEvent.setup();
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  const deleteClue = vi.fn().mockResolvedValue(undefined);
  const refreshedAtlasApi: AtlasApi = {
    load: vi
      .fn()
      .mockResolvedValueOnce(atlasData)
      .mockResolvedValueOnce({ categories: [], countries: [] }),
  };

  renderAtlas(refreshedAtlasApi, { delete: deleteClue });

  await user.click(await screen.findByRole("button", { name: "Selectionner le Kenya" }));
  await user.click(screen.getByRole("button", { name: "Supprimer l’indice" }));

  expect(confirmSpy).toHaveBeenCalled();
  expect(deleteClue).toHaveBeenCalledWith("clue-1");
  await waitFor(() =>
    expect(screen.getByRole("status", { name: "Aucun pays" })).toBeVisible(),
  );
  expect(screen.getByLabelText("Pays selectionne")).toHaveTextContent("monde");
  expect(screen.getByLabelText("Region selectionnee")).toHaveTextContent("aucune");
  expect(vi.mocked(refreshedAtlasApi.load)).toHaveBeenCalledTimes(2);

  confirmSpy.mockRestore();
});

it("n'appelle pas la suppression si la confirmation est refusee", async () => {
  const user = userEvent.setup();
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
  const deleteClue = vi.fn().mockResolvedValue(undefined);

  renderAtlas(atlasApi, { delete: deleteClue });

  await user.click(await screen.findByRole("button", { name: "Selectionner le Kenya" }));
  await user.click(screen.getByRole("button", { name: "Supprimer l’indice" }));

  expect(confirmSpy).toHaveBeenCalled();
  expect(deleteClue).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Bollards Kenyan" })).toBeVisible();

  confirmSpy.mockRestore();
});
