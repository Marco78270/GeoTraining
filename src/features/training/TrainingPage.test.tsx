import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { render, screen } from "@testing-library/react";
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
    viewport,
    countryCode,
    markers,
    selectedCode,
    correctCode,
    disabled,
    onSelect,
  }: {
    viewport: "world" | "country";
    countryCode: string | null;
    markers: Array<{ code: string; name: string; difficulty: string }>;
    selectedCode: string | null;
    correctCode: string | null;
    disabled: boolean;
    onSelect: (countryCode: string) => void;
  }) => (
    <div>
      <output aria-label="Vue carte">{viewport}</output>
      <output aria-label="Pays carte">{countryCode ?? "aucun"}</output>
      <output aria-label="Pays couverts carte">
        {markers.map((marker) => `${marker.name}:${marker.difficulty}`).join(",")}
      </output>
      <output aria-label="Pays choisi">{selectedCode ?? "aucun"}</output>
      <output aria-label="Pays correct">{correctCode ?? "aucun"}</output>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect(markers[0]?.code ?? "FR")}
      >
        selectionner
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
        coverage: "whole_country",
        regionIds: [],
        regionNames: [],
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

  it("treats clues without images as non-playable", async () => {
    renderTrainingPage(
      createTrainingApi({
        loadPlayableClues: async () => [],
      }),
    );

    expect(screen.queryByText(/Drapeaux/i)).not.toBeInTheDocument();
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

  it("allows switching to region mode when a single-region clue exists", async () => {
    const user = userEvent.setup();
    renderTrainingPage(
      createTrainingApi({
        loadPlayableClues: async () => [
          {
            id: "clue-1",
            countryCode: "US",
            countryName: "United States of America",
            categoryId: "plates",
            categoryName: "Plaques",
            difficulty: "expert",
            imageUrl: "https://example.test/us-ky.png",
            imageAlt: "Kentucky plate",
            coverage: "selected_regions",
            regionIds: ["US-KY"],
            regionNames: ["Kentucky"],
          },
        ],
        createSession: async () => ({
          id: "session-1",
          user_id: "user-1",
          collection_id: "collection-1",
          mode: "country",
          country_code: "US",
          category_id: "plates",
          total_questions: 1,
          correct_answers: 0,
          total_answers: 0,
          started_at: "2026-06-12T08:00:00.000Z",
          completed_at: null,
          created_at: "2026-06-12T08:00:00.000Z",
          updated_at: "2026-06-12T08:00:00.000Z",
        }),
      }),
    );

    await user.click(await screen.findByRole("button", { name: /r.gions/i }));

    expect(screen.getByLabelText("Vue carte")).toHaveTextContent("country");
    expect(screen.getByText("Kentucky")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /lancer/i }));
    expect(await screen.findByText(/mode :/i)).toBeInTheDocument();
  });

  it("locks the answer after the first clicked country and reveals the result", async () => {
    const user = userEvent.setup();
    renderTrainingPage();

    await user.click(await screen.findByRole("button", { name: /lancer/i }));
    await user.click(await screen.findByRole("button", { name: "selectionner" }));

    expect(await screen.findByText(/Bonne r/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /question suivante/i }),
    ).toBeEnabled();
    expect(screen.getByLabelText("Pays choisi")).toHaveTextContent("FR");
    expect(screen.getByLabelText("Pays correct")).toHaveTextContent("FR");
    expect(screen.getByText("Choisi : France (FR)")).toBeInTheDocument();
    expect(screen.getByText("Correct : France (FR)")).toBeInTheDocument();
  });

  it("shows a region-specific instruction and answer in region mode", async () => {
    const user = userEvent.setup();
    renderTrainingPage(
      createTrainingApi({
        loadPlayableClues: async () => [
          {
            id: "clue-1",
            countryCode: "US",
            countryName: "United States of America",
            categoryId: "plates",
            categoryName: "Plaques",
            difficulty: "expert",
            imageUrl: "https://example.test/us-ct.png",
            imageAlt: "Connecticut plate",
            coverage: "selected_regions",
            regionIds: ["US-CT"],
            regionNames: ["Connecticut"],
          },
        ],
        createSession: async () => ({
          id: "session-1",
          user_id: "user-1",
          collection_id: "collection-1",
          mode: "country",
          country_code: "US",
          category_id: "plates",
          total_questions: 1,
          correct_answers: 0,
          total_answers: 0,
          started_at: "2026-06-12T08:00:00.000Z",
          completed_at: null,
          created_at: "2026-06-12T08:00:00.000Z",
          updated_at: "2026-06-12T08:00:00.000Z",
        }),
      }),
    );

    await user.click(await screen.findByRole("button", { name: /r.gions/i }));
    await user.click(screen.getByRole("button", { name: /lancer/i }));

    expect(
      await screen.findByText(/cliquez sur la bonne r.gion sur la carte/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "selectionner" }));

    expect(await screen.findByText("Choisi : Connecticut")).toBeInTheDocument();
    expect(screen.getByText("Correct : Connecticut")).toBeInTheDocument();
  });

  it("shows the final score after the last answered question", async () => {
    const user = userEvent.setup();
    renderTrainingPage();

    await user.click(await screen.findByRole("button", { name: /lancer/i }));
    await user.click(await screen.findByRole("button", { name: "selectionner" }));
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

  it("shows covered countries and difficulty markers like the atlas summary", async () => {
    renderTrainingPage(
      createTrainingApi({
        loadPlayableClues: async () => [
          {
            id: "clue-1",
            countryCode: "TW",
            countryName: "Taiwan",
            categoryId: "bollards",
            categoryName: "Bollards",
            difficulty: "expert",
            imageUrl: "https://example.test/tw.png",
            imageAlt: "Taiwan",
            coverage: "whole_country",
            regionIds: [],
            regionNames: [],
          },
          {
            id: "clue-2",
            countryCode: "FR",
            countryName: "France",
            categoryId: "bollards",
            categoryName: "Bollards",
            difficulty: "easy",
            imageUrl: "https://example.test/fr.png",
            imageAlt: "France",
            coverage: "whole_country",
            regionIds: [],
            regionNames: [],
          },
        ],
      }),
    );

    expect(await screen.findByText("France")).toBeInTheDocument();
    expect(screen.getByText("Taiwan")).toBeInTheDocument();
    expect(screen.getByLabelText("Pays couverts carte")).toHaveTextContent(
      "France:easy,Taiwan:expert",
    );
  });
});
