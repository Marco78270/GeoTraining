import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
      <button type="button" onClick={() => onCountrySelect("FR")}>
        Sélectionner la France
      </button>
      <button type="button" onClick={() => onViewportChange("country")}>
        Zoomer sur la France
      </button>
      <button type="button" onClick={() => onViewportChange("world")}>
        Vue monde simulée
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

const collectionValue: ActiveCollectionContextValue = {
  collections: [
    {
      id: "collection-1",
      name: "Mes indices",
      description: null,
      owner_id: "user-1",
      created_at: "2026-06-10T00:00:00.000Z",
      updated_at: "2026-06-10T00:00:00.000Z",
      role: "owner",
    },
  ],
  activeCollection: {
    id: "collection-1",
    name: "Mes indices",
    description: null,
    owner_id: "user-1",
    created_at: "2026-06-10T00:00:00.000Z",
    updated_at: "2026-06-10T00:00:00.000Z",
    role: "owner",
  },
  activeCollectionId: "collection-1",
  setActiveCollectionId: vi.fn(),
  isLoading: false,
  error: null,
};

function renderAtlas() {
  render(
    <MemoryRouter>
      <AuthContext.Provider value={authValue}>
        <ActiveCollectionContext.Provider value={collectionValue}>
          <AtlasPage />
        </ActiveCollectionContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

it("change la couverture affichée avec la catégorie active", async () => {
  const user = userEvent.setup();
  renderAtlas();

  expect(screen.getByText("248")).toBeVisible();
  expect(screen.getByText("Indices démo")).toBeVisible();
  await user.click(screen.getByRole("button", { name: /Plaques/i }));

  expect(screen.getByText("132")).toBeVisible();
  expect(
    screen.getByText("Plaques d’immatriculation", { selector: "strong" }),
  ).toBeVisible();
});

it("distingue clairement les données de démonstration des imports de la collection", () => {
  renderAtlas();

  const notice = screen.getByRole("status", { name: "Données de démonstration" });
  expect(notice).toHaveTextContent(
    "La carte, les compteurs, les galeries et les notes ci-dessous sont des exemples",
  );
  expect(notice).toHaveTextContent("Mes indices");
});

it("permet de filtrer les cinq continents présents", () => {
  renderAtlas();

  for (const continent of ["Europe", "Asie", "Amériques", "Océanie", "Afrique"]) {
    expect(screen.getByRole("button", { name: continent })).toBeVisible();
  }
});

it("ouvre le détail du pays sélectionné depuis la carte", async () => {
  const user = userEvent.setup();
  renderAtlas();

  await user.click(
    screen.getByRole("button", { name: "Sélectionner la France" }),
  );

  expect(screen.getByRole("heading", { name: "France" })).toBeVisible();
  expect(screen.getByText("Île-de-France")).toBeVisible();
});

it("filtre les marqueurs selon la difficulté", async () => {
  const user = userEvent.setup();
  renderAtlas();

  expect(screen.getByLabelText("Nombre de marqueurs")).toHaveTextContent("8");
  await user.click(screen.getByRole("button", { name: "Expert" }));

  expect(screen.getByLabelText("Nombre de marqueurs")).toHaveTextContent("6");
});

it("permet de zoomer sur un pays puis de revenir à la vue monde", async () => {
  const user = userEvent.setup();
  renderAtlas();

  await user.click(
    screen.getByRole("button", { name: "Sélectionner la France" }),
  );
  await user.click(screen.getByRole("button", { name: "Zoomer sur la France" }));

  expect(screen.getByRole("button", { name: "Vue monde" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Vue monde" }));

  expect(screen.queryByRole("button", { name: "Vue monde" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Pays sélectionné")).toHaveTextContent("monde");
});

it("sélectionne explicitement le premier marqueur visible si le pays courant est filtré", async () => {
  const user = userEvent.setup();
  renderAtlas();

  await user.click(screen.getByRole("button", { name: "Sélectionner la France" }));
  expect(screen.getByLabelText("Pays sélectionné")).toHaveTextContent("FR");

  await user.click(screen.getByRole("button", { name: "Europe" }));

  expect(screen.getByLabelText("Pays sélectionné")).toHaveTextContent("US");
  expect(screen.getByRole("heading", { name: "États-Unis" })).toBeVisible();
});

it("affiche un état vide quand aucun pays ne correspond aux filtres", async () => {
  const user = userEvent.setup();
  renderAtlas();

  await user.click(screen.getByRole("button", { name: "Marquages routiers" }));
  await user.click(screen.getByRole("button", { name: "Facile" }));
  await user.click(screen.getByRole("button", { name: "Moyen" }));
  await user.click(screen.getByRole("button", { name: "Europe" }));
  await user.click(screen.getByRole("button", { name: "Asie" }));
  await user.click(screen.getByRole("button", { name: "Océanie" }));
  await user.click(screen.getByRole("button", { name: "Afrique" }));

  expect(screen.getByRole("status", { name: "Aucun pays" })).toHaveTextContent(
    "Aucun pays ne correspond aux filtres",
  );
  expect(screen.queryByRole("heading", { name: "France" })).not.toBeInTheDocument();
});
