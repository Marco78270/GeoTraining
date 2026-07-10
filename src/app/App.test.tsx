import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import {
  AuthContext,
  type AuthContextValue,
} from "../features/auth/authContext";
import type { ClueApi } from "../features/clues/clueApi";
import type { CollectionApi } from "../features/collections/collectionApi";
import { App } from "./App";

vi.mock("../features/atlas/AtlasMap", () => ({
  AtlasMap: () => <div aria-label="Carte mondiale interactive" />,
}));

vi.mock("../features/training/TrainingMap", () => ({
  TrainingMap: () => <div aria-label="Carte d'entraînement interactive" />,
}));

vi.mock("../features/admin/AdminPage", () => ({
  AdminPage: () => <p role="alert">Accès administrateur requis.</p>,
}));

vi.mock("../features/clues/ClueEditor", () => ({
  ClueEditor: () => <h1>Éditeur d'indice</h1>,
}));

vi.mock("../features/profile/ProfilePage", () => ({
  ProfilePage: () => <h1>Mon profil</h1>,
}));

vi.mock("../features/pricing/PricingPage", () => ({
  PricingPage: () => <h1>Tarification</h1>,
}));

vi.mock("../features/leaderboard/LeaderboardPage", () => ({
  LeaderboardPage: () => <h1>Classement</h1>,
}));

const anonymousAuth: AuthContextValue = {
  session: null,
  user: null,
  loading: false,
  configurationError: null,
  sessionError: null,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => ({ error: null }),
};

function renderApp(
  auth: AuthContextValue = anonymousAuth,
  initialPath = "/",
) {
  const collectionApi = {
    listCollections: vi.fn().mockResolvedValue([]),
  } as unknown as CollectionApi;
  const clueApi = {
    loadForEdit: vi.fn().mockResolvedValue({
      id: "clue-1",
      collectionId: "collection-1",
      categoryId: "category-1",
      countryCode: "AU",
      coverage: "whole_country",
      regionIds: [],
      zoneGeoJson: null,
      difficulty: "easy",
      title: "Indice test",
      characteristics: [],
      notes: "",
      googleMapsUrl: "",
      existingImages: [],
    }),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as ClueApi;

  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[initialPath]}>
          <App collectionApi={collectionApi} clueApi={clueApi} />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

it("redirects anonymous visitors to login and renders the brand", async () => {
  renderApp();

  expect(screen.getByText("GeoTrainer")).toBeInTheDocument();
  expect(screen.getByText("Atlas")).toBeInTheDocument();
  expect(
    await screen.findByRole("heading", { name: "Se connecter" }),
  ).toBeVisible();
});

it("lands authenticated visitors on Atlas", async () => {
  const session = { user: { id: "user-1" } } as Session;

  renderApp({
    ...anonymousAuth,
    session,
    user: session.user,
  });

  expect(await screen.findByRole("heading", { name: "Atlas" })).toBeVisible();
});

it("opens the protected clue editor from its creation route", async () => {
  const session = { user: { id: "user-1" } } as Session;

  renderApp(
    {
      ...anonymousAuth,
      session,
      user: session.user,
    },
    "/clues/new",
  );

  expect(
    await screen.findByRole("heading", { name: "Éditeur d'indice" }),
  ).toBeVisible();
});

it("opens the protected clue editor from its edit route", async () => {
  const session = { user: { id: "user-1" } } as Session;

  renderApp(
    {
      ...anonymousAuth,
      session,
      user: session.user,
    },
    "/clues/clue-1/edit",
  );

  expect(
    await screen.findByRole("heading", { name: "Éditeur d'indice" }),
  ).toBeVisible();
});

it("opens the protected training page route", async () => {
  const session = { user: { id: "user-1" } } as Session;

  renderApp(
    {
      ...anonymousAuth,
      session,
      user: session.user,
    },
    "/training",
  );

  expect(
    await screen.findByRole("heading", { name: /^Entraînement$/i }),
  ).toBeVisible();
});

it("opens the protected admin page route", async () => {
  const session = { user: { id: "user-1" } } as Session;

  renderApp(
    {
      ...anonymousAuth,
      session,
      user: session.user,
    },
    "/admin",
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Accès administrateur requis.",
  );
});

it("opens the protected profile page route", async () => {
  const session = { user: { id: "user-1" } } as Session;

  renderApp(
    {
      ...anonymousAuth,
      session,
      user: session.user,
    },
    "/profile",
  );

  expect(
    await screen.findByRole("heading", { name: "Mon profil" }),
  ).toBeVisible();
});

it("opens the protected statistics page route", async () => {
  const session = { user: { id: "user-1" } } as Session;

  renderApp(
    {
      ...anonymousAuth,
      session,
      user: session.user,
    },
    "/statistics",
  );

  expect(
    await screen.findByRole("heading", { name: "Mon entraînement", level: 1 }),
  ).toBeVisible();
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
});

it("opens the protected leaderboard page route", async () => {
  const session = { user: { id: "user-1" } } as Session;

  renderApp(
    {
      ...anonymousAuth,
      session,
      user: session.user,
    },
    "/leaderboard",
  );

  expect(
    await screen.findByRole("heading", { name: "Classement" }),
  ).toBeVisible();
});

it("opens the protected pricing page route", async () => {
  const session = { user: { id: "user-1" } } as Session;

  renderApp(
    {
      ...anonymousAuth,
      session,
      user: session.user,
    },
    "/pricing",
  );

  expect(
    await screen.findByRole("heading", { name: "Tarification" }),
  ).toBeVisible();
});
