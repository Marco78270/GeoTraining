import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import { getAdminApi } from "../admin/adminApi";
import {
  ActiveCollectionContext,
  type ActiveCollectionContextValue,
} from "../collections/activeCollectionContext";
import type { CollectionApi } from "../collections/collectionApi";
import type { GeographyDataClient } from "../geography/geographyApi";
import type { ClueApi } from "./clueApi";
import { ClueEditor } from "./ClueEditor";

vi.mock("../admin/adminApi", () => ({
  getAdminApi: vi.fn(),
}));

const getCurrentPlatformRole = vi.fn().mockResolvedValue(null);

vi.mocked(getAdminApi).mockReturnValue({
  getCurrentPlatformRole,
} as unknown as ReturnType<typeof getAdminApi>);

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

function dependencies() {
  const clueApi = {
    create: vi.fn().mockResolvedValue({ id: "clue-1" }),
    update: vi.fn().mockResolvedValue({ id: "clue-1" }),
  } as unknown as ClueApi;
  const collectionApi = {
    listCategories: vi.fn().mockResolvedValue([
      {
        id: "category-stop",
        collection_id: collection.id,
        name: "Panneaux STOP",
        icon: "sign",
        color: "#20D4E6",
        created_at: "2026-06-11T00:00:00.000Z",
        updated_at: "2026-06-11T00:00:00.000Z",
      },
    ]),
  } as unknown as CollectionApi;
  const geographyClient: GeographyDataClient = {
    listCountries: vi.fn().mockResolvedValue([
      {
        code: "FR",
        name: "France",
        geojson_path: "/geography/world.geojson",
        created_at: "2026-06-11T00:00:00.000Z",
        updated_at: "2026-06-11T00:00:00.000Z",
      },
    ]),
    listRegions: vi.fn().mockResolvedValue([
      {
        id: "FR-IDF",
        country_code: "FR",
        name: "Ile-de-France",
        geojson_path: "/geography/regions/FR.geojson",
        created_at: "2026-06-11T00:00:00.000Z",
        updated_at: "2026-06-11T00:00:00.000Z",
      },
      {
        id: "FR-OCC",
        country_code: "FR",
        name: "Occitanie",
        geojson_path: "/geography/regions/FR.geojson",
        created_at: "2026-06-11T00:00:00.000Z",
        updated_at: "2026-06-11T00:00:00.000Z",
      },
    ]),
  };
  return { clueApi, collectionApi, geographyClient };
}

function renderEditor(
  deps = dependencies(),
  props: Partial<Parameters<typeof ClueEditor>[0]> = {},
  context: ActiveCollectionContextValue = collectionContext,
) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
      <ActiveCollectionContext.Provider value={context}>
        <ClueEditor {...deps} {...props} />
      </ActiveCollectionContext.Provider>
    </QueryClientProvider>,
  );
  return deps;
}

async function reachLocationStep(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(
    screen.getByLabelText("Images de l’indice"),
    new File(["photo"], "stop.jpg", { type: "image/jpeg" }),
  );
  await user.click(screen.getByRole("button", { name: "Continuer" }));
  await screen.findByRole("option", { name: "Panneaux STOP" });
  await user.selectOptions(
    screen.getByLabelText("Catégorie"),
    "category-stop",
  );
  await user.click(screen.getByRole("button", { name: "Continuer" }));
}

it("affiche cinq étapes et gère pays entier ou régions indépendantes", async () => {
  const user = userEvent.setup();
  const { geographyClient } = renderEditor();

  expect(screen.getByRole("heading", { name: "1. Images" })).toBeVisible();
  expect(screen.getAllByRole("listitem")).toHaveLength(5);
  await reachLocationStep(user);

  expect(screen.getByRole("heading", { name: "3. Localisation" })).toBeVisible();
  await screen.findByRole("option", { name: "France" });
  await user.selectOptions(screen.getByLabelText("Pays"), "FR");
  await screen.findByLabelText("Ile-de-France");
  expect(geographyClient.listRegions).toHaveBeenCalledWith("FR");

  await user.click(screen.getByLabelText("Certaines régions"));
  await user.click(screen.getByLabelText("Ile-de-France"));
  await user.click(screen.getByLabelText("Pays entier"));

  expect(screen.getByLabelText("Ile-de-France")).toBeChecked();
  expect(screen.getByLabelText("Occitanie")).toBeChecked();
  expect(screen.getByLabelText("Ile-de-France")).toBeDisabled();
  expect(screen.getByLabelText("Occitanie")).toBeDisabled();

  await user.click(screen.getByLabelText("Certaines régions"));
  expect(screen.getByLabelText("Ile-de-France")).toBeChecked();
  expect(screen.getByLabelText("Occitanie")).not.toBeChecked();
});

it("publie après la dernière étape et conserve le formulaire en cas d'erreur", async () => {
  const user = userEvent.setup();
  const deps = dependencies();
  vi.mocked(deps.clueApi.create).mockRejectedValueOnce(
    new Error("storage unavailable"),
  );
  renderEditor(deps);

  await reachLocationStep(user);
  await screen.findByRole("option", { name: "France" });
  await user.selectOptions(screen.getByLabelText("Pays"), "FR");
  await user.click(screen.getByRole("button", { name: "Continuer" }));

  expect(screen.getByRole("heading", { name: "4. Détails" })).toBeVisible();
  await user.type(screen.getByLabelText("Titre"), "STOP français");
  await user.type(
    screen.getByLabelText("Caractéristiques"),
    "Octogone rouge\nBordure blanche",
  );
  await user.type(screen.getByLabelText("Notes"), "Présent sur les routes.");
  await user.type(
    screen.getByLabelText("Lien Google Maps"),
    "https://www.google.com/maps/@48.8566,2.3522,3a,75y",
  );
  await user.click(screen.getByRole("button", { name: "Continuer" }));

  expect(
    screen.getByRole("heading", { name: "5. Difficulté et publication" }),
  ).toBeVisible();
  await user.click(screen.getByLabelText("Moyen"));
  await user.click(screen.getByRole("button", { name: "Publier l’indice" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Impossible d'enregistrer l'indice.",
  );
  expect(screen.getByText("STOP français")).toBeVisible();
  expect(deps.clueApi.create).toHaveBeenCalledWith(
    expect.objectContaining({
      collectionId: "collection-1",
      categoryIds: ["category-stop"],
      countryCode: "FR",
      coverage: "whole_country",
      regionIds: [],
      difficulty: "medium",
      title: "STOP français",
      characteristics: ["Octogone rouge", "Bordure blanche"],
      notes: "Présent sur les routes.",
      googleMapsUrl: "https://www.google.com/maps/@48.8566,2.3522,3a,75y",
    }),
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Publier l’indice" })).toBeEnabled();
  });
}, 10_000);

it("préremplit un indice en mode édition et appelle update", async () => {
  const user = userEvent.setup();
  const deps = dependencies();
  renderEditor(deps, {
    mode: "edit",
    initialClue: {
      id: "clue-1",
      collectionId: "collection-1",
      categoryId: "category-stop",
      countryCode: "FR",
      coverage: "selected_regions",
      regionIds: ["FR-IDF"],
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
    },
  });

  expect(screen.getByText("STOP 1")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Continuer" }));
  await user.click(screen.getByRole("button", { name: "Continuer" }));
  await user.click(screen.getByRole("button", { name: "Continuer" }));
  expect(screen.getByDisplayValue("STOP français")).toBeVisible();
  expect(screen.getByDisplayValue("Présent sur les routes.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Continuer" }));
  await user.click(screen.getByRole("button", { name: "Mettre à jour l’indice" }));

  expect(deps.clueApi.update).toHaveBeenCalledWith(
    expect.objectContaining({
      clueId: "clue-1",
      previousCoverage: "selected_regions",
      existingImages: [
        expect.objectContaining({
          id: "stored-1",
          altText: "STOP 1",
        }),
      ],
      removedImageIds: [],
    }),
  );
});

it("verrouille la collection, la catégorie et le pays en mode édition", async () => {
  const user = userEvent.setup();
  const deps = dependencies();
  renderEditor(deps, {
    mode: "edit",
    initialClue: {
      id: "clue-1",
      collectionId: "collection-1",
      categoryId: "category-stop",
      countryCode: "FR",
      coverage: "selected_regions",
      regionIds: ["FR-IDF"],
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
    },
  });

  await user.click(screen.getByRole("button", { name: "Continuer" }));

  expect(screen.getByLabelText("Collection")).toBeDisabled();
  expect(screen.getByLabelText("Catégorie")).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "Continuer" }));

  expect(screen.getByLabelText("Pays")).toBeDisabled();
});

it("désactive la couverture régionale lorsqu'un pays n'a aucune région", async () => {
  const user = userEvent.setup();
  const deps = dependencies();
  deps.geographyClient.listCountries = vi.fn().mockResolvedValue([
    {
      code: "AQ",
      name: "Antarctica",
      geojson_path: "/geography/world.geojson",
      created_at: "2026-06-11T00:00:00.000Z",
      updated_at: "2026-06-11T00:00:00.000Z",
    },
  ]);
  deps.geographyClient.listRegions = vi.fn().mockResolvedValue([]);
  renderEditor(deps);

  await reachLocationStep(user);
  await screen.findByRole("option", { name: "Antarctica" });
  await user.selectOptions(screen.getByLabelText("Pays"), "AQ");

  expect(
    await screen.findByText(/aucune division administrative disponible/i),
  ).toBeVisible();
  expect(screen.getByLabelText("Certaines régions")).toBeDisabled();
});

it("autorise un admin de plateforme a publier dans une collection publique", async () => {
  const user = userEvent.setup();
  const deps = dependencies();
  getCurrentPlatformRole.mockResolvedValueOnce("super_admin");
  const publicCollection = {
    ...collection,
    id: "collection-public",
    name: "Collection officielle",
    owner_id: null,
    visibility: "public_readonly" as const,
    role: null,
  };
  deps.collectionApi.listCategories = vi.fn().mockResolvedValue([
    {
      id: "category-stop",
      collection_id: publicCollection.id,
      name: "Panneaux STOP",
      icon: "sign",
      color: "#20D4E6",
      created_at: "2026-06-11T00:00:00.000Z",
      updated_at: "2026-06-11T00:00:00.000Z",
    },
  ]);

  renderEditor(
    deps,
    {},
    {
      ...collectionContext,
      collections: [publicCollection],
      activeCollection: publicCollection,
      activeCollectionId: publicCollection.id,
    },
  );

  await user.upload(
    screen.getByLabelText("Images de l’indice"),
    new File(["photo"], "stop.jpg", { type: "image/jpeg" }),
  );
  await user.click(screen.getByRole("button", { name: "Continuer" }));

  expect(await screen.findByRole("option", { name: "Panneaux STOP" })).toBeVisible();
  expect(screen.getByLabelText("Collection")).toHaveValue("collection-public");
});
