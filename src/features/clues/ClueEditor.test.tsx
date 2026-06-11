import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import {
  ActiveCollectionContext,
  type ActiveCollectionContextValue,
} from "../collections/activeCollectionContext";
import type { CollectionApi } from "../collections/collectionApi";
import type { GeographyDataClient } from "../geography/geographyApi";
import type { ClueApi } from "./clueApi";
import { ClueEditor } from "./ClueEditor";

const collection = {
  id: "collection-1",
  name: "Mes panneaux",
  description: null,
  owner_id: "user-1",
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
        name: "Île-de-France",
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

function renderEditor(deps = dependencies()) {
  render(
    <ActiveCollectionContext.Provider value={collectionContext}>
      <ClueEditor {...deps} />
    </ActiveCollectionContext.Provider>,
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
  await screen.findByLabelText("Île-de-France");
  expect(geographyClient.listRegions).toHaveBeenCalledWith("FR");

  await user.click(screen.getByLabelText("Certaines régions"));
  await user.click(screen.getByLabelText("Île-de-France"));
  await user.click(screen.getByLabelText("Pays entier"));

  expect(screen.getByLabelText("Île-de-France")).toBeChecked();
  expect(screen.getByLabelText("Occitanie")).toBeChecked();
  expect(screen.getByLabelText("Île-de-France")).toBeDisabled();
  expect(screen.getByLabelText("Occitanie")).toBeDisabled();

  await user.click(screen.getByLabelText("Certaines régions"));
  expect(screen.getByLabelText("Île-de-France")).toBeChecked();
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
  await user.click(screen.getByRole("button", { name: "Continuer" }));

  expect(screen.getByRole("heading", { name: "5. Difficulté et publication" })).toBeVisible();
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
    }),
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Publier l’indice" })).toBeEnabled();
  });
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
