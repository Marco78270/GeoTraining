import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import {
  AuthContext,
  type AuthContextValue,
} from "../features/auth/authContext";
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

  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[initialPath]}>
          <App collectionApi={collectionApi} />
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
    await screen.findByRole("alert"),
  ).toHaveTextContent("Impossible de charger cet indice pour modification.");
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
    await screen.findByRole("heading", { name: /Entraînement/i }),
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
    await screen.findByRole("heading", { name: /statistiques/i }),
  ).toBeVisible();
});
