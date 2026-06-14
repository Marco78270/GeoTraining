import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  AuthContext,
  type AuthContextValue,
} from "../auth/authContext";
import {
  ActiveCollectionContext,
  type ActiveCollectionContextValue,
} from "../collections/activeCollectionContext";
import type { TrainingApi } from "./trainingApi";
import { TrainingPage } from "./TrainingPage";

vi.mock("./TrainingMap", () => ({
  TrainingMap: ({
    selectedCode,
    correctCode,
    disabled,
    onSelect,
  }: {
    selectedCode: string | null;
    correctCode: string | null;
    disabled: boolean;
    onSelect: (countryCode: string) => void;
  }) => (
    <div>
      <output aria-label="Pays choisi">{selectedCode ?? "aucun"}</output>
      <output aria-label="Pays correct">{correctCode ?? "aucun"}</output>
      <button type="button" disabled={disabled} onClick={() => onSelect("FR")}>
        FR
      </button>
    </div>
  ),
}));

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
  setActiveCollectionId: () => undefined,
  isLoading: false,
  error: null,
};

const session = { user: { id: "user-1", email: "marc@example.test" } } as Session;

const authValue: AuthContextValue = {
  session,
  user: session.user,
  loading: false,
  configurationError: null,
  sessionError: null,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => ({ error: null }),
};

function createTrainingApi(overrides: Partial<TrainingApi> = {}): TrainingApi {
  return {
    loadPlayableClues: async () => [
      {
        id: "clue-1",
        countryCode: "FR",
        countryName: "France",
        categoryId: "flags",
        categoryName: "Drapeaux",
        difficulty: "easy",
        imageUrl: "https://example.test/fr.png",
        imageAlt: "France",
      },
    ],
    createSession: async () => ({
      id: "session-1",
      user_id: "user-1",
      collection_id: "collection-1",
      mode: "world",
      country_code: null,
      category_id: "flags",
      total_questions: 1,
      correct_answers: 0,
      total_answers: 0,
      started_at: "2026-06-12T08:00:00.000Z",
      completed_at: null,
      created_at: "2026-06-12T08:00:00.000Z",
      updated_at: "2026-06-12T08:00:00.000Z",
    }),
    recordAnswer: async () => undefined,
    completeSession: async () => undefined,
    ...overrides,
  };
}

function renderTrainingPage(trainingApi: TrainingApi = createTrainingApi()) {
  renderTrainingPageWithCollection(collectionValue, trainingApi);
}

function renderTrainingPageWithCollection(
  activeCollectionValue: ActiveCollectionContextValue,
  trainingApi: TrainingApi = createTrainingApi(),
) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>
          <ActiveCollectionContext.Provider value={activeCollectionValue}>
            <TrainingPage trainingApi={trainingApi} />
          </ActiveCollectionContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TrainingPage", () => {
  it("renders the training heading", async () => {
    renderTrainingPage();

    expect((await screen.findAllByText(/Entra/i)).length).toBeGreaterThan(0);
  });

  it("prevents starting when the filtered clue pool is empty", async () => {
    renderTrainingPage(
      createTrainingApi({
        loadPlayableClues: async () => [],
      }),
    );

    expect(
      await screen.findByText(/aucun indice jouable/i),
    ).toBeInTheDocument();
  });

  it("starts a session from the setup form", async () => {
    const user = userEvent.setup();
    renderTrainingPage();

    await user.click(await screen.findByRole("button", { name: /lancer/i }));

    expect(await screen.findByText(/question 1/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Drapeaux/i).length).toBeGreaterThan(0);
  });

  it("locks the answer after the first clicked country and reveals the result", async () => {
    const user = userEvent.setup();
    renderTrainingPage();

    await user.click(await screen.findByRole("button", { name: /lancer/i }));
    await user.click(await screen.findByRole("button", { name: "FR" }));

    expect(await screen.findByText(/Bonne r/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /question suivante/i }),
    ).toBeEnabled();
    expect(screen.getByLabelText("Pays choisi")).toHaveTextContent("FR");
    expect(screen.getByLabelText("Pays correct")).toHaveTextContent("FR");
  });

  it("shows the final score after the last answered question", async () => {
    const user = userEvent.setup();
    renderTrainingPage();

    await user.click(await screen.findByRole("button", { name: /lancer/i }));
    await user.click(await screen.findByRole("button", { name: "FR" }));
    await user.click(
      await screen.findByRole("button", { name: /question suivante/i }),
    );

    expect(await screen.findByText(/score final/i)).toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
  });

  it("surfaces the public readonly collection label in training filters", async () => {
    renderTrainingPageWithCollection({
      ...collectionValue,
      collections: [
        {
          ...collection,
          id: "collection-public",
          name: "Collection officielle",
          owner_id: null,
          visibility: "public_readonly",
          role: null,
        },
      ],
      activeCollection: {
        ...collection,
        id: "collection-public",
        name: "Collection officielle",
        owner_id: null,
        visibility: "public_readonly",
        role: null,
      },
      activeCollectionId: "collection-public",
    });

    expect(
      await screen.findByRole("option", {
        name: /Collection officielle/i,
      }),
    ).toBeVisible();
    expect(screen.getByText("Officielle")).toBeVisible();
  });
});
