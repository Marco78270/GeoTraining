import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  AuthContext,
  type AuthContextValue,
} from "../auth/authContext";
import {
  ActiveCollectionContext,
  type ActiveCollectionContextValue,
} from "../collections/activeCollectionContext";
import type { BillingApi } from "../billing/billingApi";
import { profileKeys, type UserProfile } from "../profile/profileApi";
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
    showHints,
    onSelect,
  }: {
    viewport: "world" | "country";
    countryCode: string | null;
    markers: Array<{ code: string; name: string; difficulty: string }>;
    selectedCode: string | null;
    correctCode: string | null;
    disabled: boolean;
    showHints?: boolean;
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
      <output aria-label="Indices visibles">
        {showHints === false ? "non" : "oui"}
      </output>
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

function createSessionRow(
  overrides: Partial<Awaited<ReturnType<TrainingApi["createSession"]>>> = {},
) {
  return {
    id: "session-1",
    user_id: "user-1",
    collection_id: "collection-1",
    mode: "world" as const,
    country_code: null,
    category_id: "flags",
    total_questions: 1,
    is_ranked: false,
    challenge_type: "standard",
    challenge_key: null,
    duration_ms: null,
    correct_answers: 0,
    total_answers: 0,
    started_at: "2026-06-12T08:00:00.000Z",
    completed_at: null,
    created_at: "2026-06-12T08:00:00.000Z",
    updated_at: "2026-06-12T08:00:00.000Z",
    ...overrides,
  };
}

function createCompletedSessionRow(
  overrides: Partial<Awaited<ReturnType<TrainingApi["completeSession"]>>> = {},
) {
  return {
    ...createSessionRow({
      correct_answers: 1,
      total_answers: 1,
      duration_ms: 12000,
      completed_at: "2026-06-12T08:00:12.000Z",
    }),
    xpDelta: 0,
    xpTotal: 0,
    xpAwarded: false,
    ...overrides,
  };
}

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
        zoneGeoJson: null,
      },
    ],
    createSession: async () => createSessionRow(),
    recordAnswer: async () => undefined,
    completeSession: async () => createCompletedSessionRow(),
    loadDailyChallengeProgress: async () => ({
      completedSessions: 0,
      bestAccuracyPercent: null,
      bestDurationMs: null,
      latestCompletedAt: null,
    }),
    loadDailyChallenge: async () => null,
    startDailyAttempt: async () => ({
      attemptId: "attempt-1",
      challengeId: "daily-1",
      challengeKey: "2026-07-03",
      collectionId: "collection-public",
      collectionName: "Collection officielle",
      categoryId: "flags",
      categoryName: "Drapeaux",
      mode: "world",
      questionCount: 1,
      currentPosition: 1,
      isPremium: false,
      questions: [],
    }),
    submitDailyAnswer: async () => ({
      position: 1,
      selectedCode: "FR",
      selectedLabel: "France",
      correctCode: "FR",
      correctLabel: "France",
      isCorrect: true,
      completed: false,
      currentPosition: 2,
      correctAnswers: 1,
      totalQuestions: 1,
      durationMs: null,
      xpDelta: 0,
      xpTotal: null,
      xpAwarded: false,
    }),
    ...overrides,
  };
}

function renderTrainingPage(
  trainingApi: TrainingApi = createTrainingApi(),
  options?: { billingApi?: BillingApi; queryClient?: QueryClient },
) {
  return renderTrainingPageWithCollection(collectionValue, trainingApi, options);
}

function renderTrainingPageWithCollection(
  activeCollectionValue: ActiveCollectionContextValue,
  trainingApi: TrainingApi = createTrainingApi(),
  options?: { billingApi?: BillingApi; queryClient?: QueryClient },
) {
  const billingApi: BillingApi =
    options?.billingApi ?? {
      loadCurrent: async () => ({
        planKey: "free",
        status: "inactive",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        premiumEnabled: false,
      }),
      startCheckout: async () => ({ url: "https://billing.example.test/checkout" }),
      openPortal: async () => ({ url: "https://billing.example.test/portal" }),
    };

  const queryClient = options?.queryClient ?? new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider
      client={queryClient}
    >
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>
          <ActiveCollectionContext.Provider value={activeCollectionValue}>
            <TrainingPage trainingApi={trainingApi} billingApi={billingApi} />
          </ActiveCollectionContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return queryClient;
}

function renderTrainingPageWithLiveCollection(
  initialCollections: ActiveCollectionContextValue["collections"],
  initialActiveCollectionId: string,
  trainingApi: TrainingApi = createTrainingApi(),
  options?: { billingApi?: BillingApi },
) {
  const billingApi: BillingApi =
    options?.billingApi ?? {
      loadCurrent: async () => ({
        planKey: "free",
        status: "inactive",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        premiumEnabled: false,
      }),
      startCheckout: async () => ({ url: "https://billing.example.test/checkout" }),
      openPortal: async () => ({ url: "https://billing.example.test/portal" }),
    };

  function LiveCollectionHarness() {
    const [activeCollectionId, setActiveCollectionId] = useState<string | null>(
      initialActiveCollectionId,
    );
    const activeCollection =
      initialCollections.find((item) => item.id === activeCollectionId) ?? null;

    return (
      <ActiveCollectionContext.Provider
        value={{
          collections: initialCollections,
          activeCollection,
          activeCollectionId,
          setActiveCollectionId,
          isLoading: false,
          error: null,
        }}
      >
        <TrainingPage trainingApi={trainingApi} billingApi={billingApi} />
      </ActiveCollectionContext.Provider>
    );
  }

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
          <LiveCollectionHarness />
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TrainingPage", () => {
  it("renders the training heading", async () => {
    renderTrainingPage();

    expect((await screen.findAllByText(/Entra/i)).length).toBeGreaterThan(0);
    expect(screen.getByText("Gratuit")).toBeVisible();
    expect(screen.getAllByRole("link", { name: /voir les offres|découvrir le premium/i }).length)
      .toBeGreaterThan(0);
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

  it("shows the backend reason when a training session cannot start", async () => {
    const user = userEvent.setup();
    renderTrainingPage(
      createTrainingApi({
        createSession: async () => {
          throw Object.assign(new Error("training_collection_not_accessible"), {
            code: "P0001",
          });
        },
      }),
    );

    await user.click(
      await screen.findByRole("button", { name: /lancer l'entra.nement/i }),
    );

    expect(
      await screen.findByText(/collection sélectionnée n'est plus accessible/i),
    ).toBeInTheDocument();
  });

  it("shows an unknown session start error instead of hiding it", async () => {
    const user = userEvent.setup();
    renderTrainingPage(
      createTrainingApi({
        createSession: async () => {
          throw new Error("La session d'entraînement n'a pas été retournée.");
        },
      }),
    );

    await user.click(
      await screen.findByRole("button", { name: /lancer l'entra.nement/i }),
    );

    expect(
      await screen.findByText(/la session d'entraînement n'a pas été retournée/i),
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

  it("shows free coach feedback after validating an answer", async () => {
    const user = userEvent.setup();
    renderTrainingPage();

    await user.click(await screen.findByRole("button", { name: /lancer/i }));
    await user.click(screen.getByRole("button", { name: /selectionner/i }));

    expect(await screen.findByText(/coach geotrainer/i)).toBeInTheDocument();
    expect(
      screen.getByText(/retenir pourquoi cette réponse était la bonne/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/coach gratuit/i)).toBeInTheDocument();
  });

  it("shows an estimated xp preview after validating an answer in a ranked session", async () => {
    const user = userEvent.setup();
    renderTrainingPage(
      createTrainingApi({
        createSession: async () =>
          createSessionRow({
            is_ranked: true,
          }),
      }),
    );

    await user.click(await screen.findByRole("button", { name: /lancer/i }));
    await user.click(screen.getByRole("button", { name: /selectionner/i }));

    expect(await screen.findByText(/xp estim.e/i)).toBeInTheDocument();
    expect(screen.getByText("+6")).toBeInTheDocument();
    expect(screen.getByText(/si la session reste class.e officielle/i))
      .toBeInTheDocument();
  });

  it("allows switching to region mode when a single-region clue exists", async () => {
    const user = userEvent.setup();
    renderTrainingPage(
      createTrainingApi({
        loadDailyChallenge: async () => ({
          challengeId: "daily-1",
          challengeKey: "2026-07-03",
          collectionId: "collection-public",
          collectionName: "Collection officielle",
          categoryId: "plates",
          categoryName: "Plaques",
          mode: "world",
          questionCount: 10,
          secondsUntilReset: 3600,
          status: "available",
          attemptStatus: "not_started",
        }),
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
            zoneGeoJson: null,
          },
        ],
        createSession: async () =>
          createSessionRow({
            mode: "country",
            country_code: "US",
            category_id: "plates",
          }),
      }),
    );

    await user.click(await screen.findByRole("button", { name: /r.gions/i }));

    expect(screen.getByLabelText("Vue carte")).toHaveTextContent("country");
    expect(screen.getByLabelText("Pays couverts carte")).toHaveTextContent(
      "Kentucky:expert",
    );

    await user.click(
      screen.getByRole("button", { name: /lancer l'entra.nement/i }),
    );
    expect(await screen.findByText(/mode :/i)).toBeInTheDocument();
  });

  it("locks the answer after the first clicked country and reveals the result", async () => {
    const user = userEvent.setup();
    renderTrainingPage();

    await user.click(await screen.findByRole("button", { name: /lancer/i }));

    expect(await screen.findByLabelText("Indices visibles")).toHaveTextContent(
      "non",
    );

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
            zoneGeoJson: null,
          },
        ],
        createSession: async () =>
          createSessionRow({
            mode: "country",
            country_code: "US",
            category_id: "plates",
          }),
      }),
    );

    await user.click(await screen.findByRole("button", { name: /r.gions/i }));
    await user.click(screen.getByRole("button", { name: /lancer/i }));

    expect(await screen.findByRole("heading", { name: "Trouver la région" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Connecticut" }))
      .not.toBeInTheDocument();
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
    expect(screen.getByText(/bilan coach geotrainer/i)).toBeInTheDocument();
    expect(screen.getAllByText(/coach gratuit/i).length).toBeGreaterThan(0);
  });

  it("shows the ranked summary after completion", async () => {
    const user = userEvent.setup();
    renderTrainingPage(
      createTrainingApi({
        createSession: async () =>
          createSessionRow({
            category_id: "flags",
            is_ranked: true,
            started_at: "2026-06-12T08:00:00.000Z",
          }),
        completeSession: async () =>
          createCompletedSessionRow({
            category_id: "flags",
            is_ranked: true,
            correct_answers: 1,
            total_answers: 1,
            duration_ms: 42000,
            completed_at: "2026-06-12T08:00:42.000Z",
            xpDelta: 24,
            xpTotal: 1540,
            xpAwarded: true,
          }),
      }),
    );
    await user.click(await screen.findByRole("button", { name: /lancer/i }));
    await user.click(await screen.findByRole("button", { name: "selectionner" }));
    await user.click(
      await screen.findByRole("button", { name: /question suivante/i }),
    );

    expect(screen.getByText("Chrono total 00:42")).toBeInTheDocument();
    expect(screen.getByText(/42.0 s\/question/i)).toBeInTheDocument();
    expect(screen.getByText(/delta xp/i)).toBeInTheDocument();
    expect(screen.getByText("+24")).toBeInTheDocument();
    expect(screen.getByText("1540 XP")).toBeInTheDocument();
    expect(screen.getByText("Or III")).toBeInTheDocument();
    expect(screen.getByLabelText("Rang Or III")).toBeVisible();
    expect(screen.getByText("460 XP avant Or II")).toBeVisible();
    expect(
      screen.getByRole("progressbar", { name: /progression vers or ii/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /voir le classement/i }),
    ).toHaveAttribute("href", "/leaderboard?view=global");
  });

  it("shows the official rank promotion after crossing a threshold", async () => {
    const user = userEvent.setup();
    renderTrainingPage(
      createTrainingApi({
        createSession: async () =>
          createSessionRow({
            category_id: "flags",
            is_ranked: true,
            started_at: "2026-06-12T08:00:00.000Z",
          }),
        completeSession: async () =>
          createCompletedSessionRow({
            category_id: "flags",
            is_ranked: true,
            correct_answers: 1,
            total_answers: 1,
            duration_ms: 42000,
            completed_at: "2026-06-12T08:00:42.000Z",
            xpDelta: 15,
            xpTotal: 1505,
            xpAwarded: true,
          }),
      }),
    );

    await user.click(await screen.findByRole("button", { name: /lancer/i }));
    await user.click(await screen.findByRole("button", { name: "selectionner" }));
    await user.click(
      await screen.findByRole("button", { name: /question suivante/i }),
    );

    expect(await screen.findByText(/promotion : or iii/i)).toBeInTheDocument();
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
            zoneGeoJson: null,
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
            zoneGeoJson: null,
          },
        ],
      }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Pays couverts carte")).toHaveTextContent(
        "France:easy,Taiwan:expert",
      );
    });
  });

  it("renders the daily challenge card for premium users on official collections", async () => {
    const premiumBillingApi: BillingApi = {
      loadCurrent: async () => ({
        planKey: "premium_yearly",
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        premiumEnabled: true,
      }),
      startCheckout: async () => ({ url: "https://billing.example.test/checkout" }),
      openPortal: async () => ({ url: "https://billing.example.test/portal" }),
    };

    renderTrainingPageWithCollection(
      {
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
      },
      createTrainingApi({
        loadDailyChallenge: async () => ({
          challengeId: "daily-1",
          challengeKey: "2026-07-03",
          collectionId: "collection-public",
          collectionName: "Collection officielle",
          categoryId: "plates",
          categoryName: "Plaques",
          mode: "world",
          questionCount: 10,
          secondsUntilReset: 3600,
          status: "available",
          attemptStatus: "not_started",
        }),
      }),
      {
        billingApi: premiumBillingApi,
      },
    );

    expect(await screen.findByRole("button", { name: "Lancer" })).toBeInTheDocument();
    const dailyCard = screen.getByRole("heading", {
      name: "Défi quotidien (classé)",
    }).closest("section");
    expect(dailyCard).not.toBeNull();
    expect(within(dailyCard!).getByRole("link", { name: "Classement" })).toHaveAttribute(
      "href",
      "/leaderboard?view=today&challenge=2026-07-03",
    );
    expect(
      screen.getByRole("heading", { name: /entra.nement classique/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /lancer l'entra.nement/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/indices issus des catégories officielles/i)).toBeVisible();
  });

  it("shows an unavailable message instead of a hard error when the daily challenge is absent", async () => {
    renderTrainingPageWithCollection(
      {
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
      },
      createTrainingApi({
        loadDailyChallenge: async () => null,
      }),
    );

    expect(
      await screen.findByText(/Le défi quotidien n'est pas disponible pour le moment./i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/temporairement indisponible/i)).not.toBeInTheDocument();
  });

  it("logs daily challenge loading errors with diagnostic details", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      renderTrainingPageWithCollection(
        {
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
        },
        createTrainingApi({
          loadDailyChallenge: async () => {
            const error = new Error("rpc failed") as Error & {
              code?: string;
              details?: string;
              hint?: string;
            };
            error.code = "XX000";
            error.details = "unexpected rpc failure";
            error.hint = "refresh";
            throw error;
          },
        }),
      );

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          "Daily challenge load failed",
          expect.objectContaining({
            userId: session.user.id,
            message: "rpc failed",
            code: "XX000",
            details: "unexpected rpc failure",
            hint: "refresh",
          }),
        );
      });
      expect(
        screen.getByText(/r.sum. du d.fi quotidien n'a pas pu .tre charg./i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /lancer le d.fi quotidien/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /r.*essayer/i })).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: /entra.nement classique/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /lancer l'entra.nement/i }),
      ).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("starts the server-owned daily challenge from the official collection", async () => {
    const user = userEvent.setup();
    const createSession = vi.fn(async () => createSessionRow());
    const startDailyAttempt = vi.fn(async () => ({
      attemptId: "attempt-1",
      challengeId: "daily-1",
      challengeKey: "2026-07-03",
      collectionId: "collection-public",
      collectionName: "Collection officielle",
      categoryId: "plates",
      categoryName: "Plaques",
      mode: "world" as const,
      questionCount: 1,
      currentPosition: 1,
      isPremium: true,
      questions: [
        {
          position: 1,
          clueId: "clue-2",
          imageUrl: "https://example.test/us-tx.png",
          imageAlt: "Texas plate",
          difficulty: "expert" as const,
          categoryName: "Plaques",
          categoryIcon: "sign",
        },
      ],
    }));

    renderTrainingPageWithCollection(
      {
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
      },
      createTrainingApi({
        createSession,
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
            zoneGeoJson: null,
          },
          {
            id: "clue-2",
            countryCode: "US",
            countryName: "United States of America",
            categoryId: "plates",
            categoryName: "Plaques",
            difficulty: "expert",
            imageUrl: "https://example.test/us-tx.png",
            imageAlt: "Texas plate",
            coverage: "selected_regions",
            regionIds: ["US-TX"],
            regionNames: ["Texas"],
            zoneGeoJson: null,
          },
        ],
        loadDailyChallenge: async () => ({
          status: "available",
          challengeId: "daily-1",
          challengeKey: "2026-07-03",
          collectionId: "collection-public",
          collectionName: "Collection officielle",
          categoryId: "plates",
          categoryName: "Plaques",
          mode: "world",
          questionCount: 10,
          secondsUntilReset: 45296,
          attemptStatus: "not_started",
        }),
        startDailyAttempt,
      }),
      {
        billingApi: {
          loadCurrent: async () => ({
            planKey: "premium_yearly",
            status: "active",
            cancelAtPeriodEnd: false,
            currentPeriodEnd: null,
            premiumEnabled: true,
          }),
          startCheckout: async () => ({
            url: "https://billing.example.test/checkout",
          }),
          openPortal: async () => ({
            url: "https://billing.example.test/portal",
          }),
        },
      },
    );

    await screen.findByRole("button", { name: "Lancer" });
    await user.click(screen.getByRole("button", { name: "Lancer" }));

    expect(await screen.findByText(/question 1/i)).toBeInTheDocument();
    expect(screen.getAllByText(/plaques/i).length).toBeGreaterThan(0);
    expect(startDailyAttempt).toHaveBeenCalledTimes(1);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("updates the shared profile XP when a premium daily challenge completes", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData<UserProfile>(profileKeys.current(), {
      id: "user-1",
      username: "Marc",
      avatarUrl: null,
      email: "marc@example.test",
      usernameChangedAt: null,
      leaderboardVisible: true,
      xpTotal: 100,
      billing: {
        planKey: "premium_monthly",
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        premiumEnabled: true,
      },
    });

    renderTrainingPage(
      createTrainingApi({
        loadDailyChallenge: async () => ({
          status: "available",
          challengeId: "daily-1",
          challengeKey: "2026-07-05",
          collectionId: "collection-public",
          collectionName: "Collection officielle",
          categoryId: "plates",
          categoryName: "Plaques",
          mode: "world",
          questionCount: 1,
          secondsUntilReset: 3600,
          attemptStatus: "not_started",
        }),
        startDailyAttempt: async () => ({
          attemptId: "attempt-1",
          challengeId: "daily-1",
          challengeKey: "2026-07-05",
          collectionId: "collection-public",
          collectionName: "Collection officielle",
          categoryId: "plates",
          categoryName: "Plaques",
          mode: "world",
          questionCount: 1,
          currentPosition: 1,
          isPremium: true,
          questions: [{
            position: 1,
            clueId: "clue-1",
            imageUrl: "https://example.test/plate.png",
            imageAlt: "Plaque",
            difficulty: "medium",
            categoryName: "Plaques",
            categoryIcon: "sign",
          }],
        }),
        submitDailyAnswer: async () => ({
          position: 1,
          selectedCode: "FR",
          selectedLabel: "France",
          correctCode: "FR",
          correctLabel: "France",
          isCorrect: true,
          completed: true,
          currentPosition: 2,
          correctAnswers: 1,
          totalQuestions: 1,
          durationMs: 12000,
          xpDelta: 24,
          xpTotal: 124,
          xpAwarded: true,
        }),
      }),
      { queryClient },
    );

    await user.click(await screen.findByRole("button", { name: "Lancer" }));
    await user.click(await screen.findByRole("button", { name: "selectionner" }));

    await waitFor(() => {
      expect(queryClient.getQueryData<UserProfile>(profileKeys.current())?.xpTotal)
        .toBe(124);
    });
  });

  it("restores the daily timer and score when resuming an attempt", async () => {
    const user = userEvent.setup();
    const startedAt = new Date(Date.now() - 65_000).toISOString();
    const questions = [1, 2, 3].map((position) => ({
      position,
      clueId: `clue-${position}`,
      imageUrl: `https://example.test/${position}.png`,
      imageAlt: `Indice ${position}`,
      difficulty: "medium" as const,
      categoryName: "Bollards",
      categoryIcon: "bollard",
    }));

    renderTrainingPage(
      createTrainingApi({
        loadDailyChallenge: async () => ({
          status: "in_progress",
          challengeId: "daily-1",
          challengeKey: "2026-07-05",
          collectionId: "collection-1",
          collectionName: "Collection officielle",
          categoryId: "bollards",
          categoryName: "Bollards",
          mode: "world",
          questionCount: 3,
          secondsUntilReset: 3600,
          attemptStatus: "in_progress",
        }),
        startDailyAttempt: async () => ({
          attemptId: "attempt-1",
          challengeId: "daily-1",
          challengeKey: "2026-07-05",
          collectionId: "collection-1",
          collectionName: "Collection officielle",
          categoryId: "bollards",
          categoryName: "Bollards",
          mode: "world",
          questionCount: 3,
          currentPosition: 3,
          isPremium: true,
          startedAt,
          answeredSteps: [
            { position: 1, isCorrect: true },
            { position: 2, isCorrect: false },
          ],
          questions,
        }),
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Reprendre" }));

    expect(await screen.findByText(/question 3 \/ 3/i)).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.queryByText("Chrono 00:00")).not.toBeInTheDocument();
  });

  it("can launch the daily challenge directly even when the summary query fails", async () => {
    const user = userEvent.setup();
    const createSession = vi.fn(async () => createSessionRow());
    const startDailyAttempt = vi.fn(async () => ({
      attemptId: "attempt-1",
      challengeId: "daily-1",
      challengeKey: "2026-07-05",
      collectionId: "collection-public",
      collectionName: "Collection officielle",
      categoryId: "plates",
      categoryName: "Plaques",
      mode: "world" as const,
      questionCount: 1,
      currentPosition: 1,
      isPremium: false,
      questions: [
        {
          position: 1,
          clueId: "clue-2",
          imageUrl: "https://example.test/us-tx.png",
          imageAlt: "Texas plate",
          difficulty: "expert" as const,
          categoryName: "Plaques",
          categoryIcon: "sign",
        },
      ],
    }));

    renderTrainingPageWithCollection(
      {
        ...collectionValue,
        collections: [
          collection,
          {
            ...collection,
            id: "collection-public",
            name: "Collection officielle",
            owner_id: null,
            visibility: "public_readonly",
            role: null,
          },
        ],
        activeCollection: collection,
        activeCollectionId: collection.id,
      },
      createTrainingApi({
        createSession,
        loadDailyChallenge: async () => {
          const error = new Error("rpc failed") as Error & {
            code?: string;
            details?: string;
            hint?: string;
          };
          error.code = "XX000";
          error.details = "unexpected rpc failure";
          error.hint = "refresh";
          throw error;
        },
        startDailyAttempt,
      }),
    );

    await user.click(
      await screen.findByRole("button", { name: /lancer le d.fi quotidien/i }),
    );

    expect(await screen.findByText(/question 1/i)).toBeInTheDocument();
    expect(screen.getAllByText(/plaques/i).length).toBeGreaterThan(0);
    expect(startDailyAttempt).toHaveBeenCalledTimes(1);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("restores the standard training selection after leaving the daily challenge", async () => {
    const user = userEvent.setup();

    renderTrainingPageWithLiveCollection(
      [
        collection,
        {
          ...collection,
          id: "collection-public",
          name: "Collection officielle",
          owner_id: null,
          visibility: "public_readonly",
          role: null,
        },
      ],
      collection.id,
      createTrainingApi({
        loadPlayableClues: async (collectionId?: string) =>
          collectionId === "collection-public"
            ? [
                {
                  id: "clue-2",
                  countryCode: "US",
                  countryName: "United States of America",
                  categoryId: "plates",
                  categoryName: "Plaques",
                  difficulty: "expert",
                  imageUrl: "https://example.test/us-tx.png",
                  imageAlt: "Texas plate",
                  coverage: "selected_regions",
                  regionIds: ["US-TX"],
                  regionNames: ["Texas"],
                  zoneGeoJson: null,
                },
              ]
            : [
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
                  zoneGeoJson: null,
                },
              ],
        loadDailyChallenge: async () => ({
          status: "available",
          challengeId: "daily-1",
          challengeKey: "2026-07-03",
          collectionId: "collection-public",
          collectionName: "Collection officielle",
          categoryId: "plates",
          categoryName: "Plaques",
          mode: "world",
          questionCount: 10,
          secondsUntilReset: 45296,
          attemptStatus: "not_started",
        }),
        startDailyAttempt: async () => ({
          attemptId: "attempt-1",
          challengeId: "daily-1",
          challengeKey: "2026-07-03",
          collectionId: "collection-public",
          collectionName: "Collection officielle",
          categoryId: "plates",
          categoryName: "Plaques",
          mode: "world",
          questionCount: 1,
          currentPosition: 1,
          isPremium: false,
          questions: [
            {
              position: 1,
              clueId: "clue-2",
              imageUrl: "https://example.test/us-tx.png",
              imageAlt: "Texas plate",
              difficulty: "expert",
              categoryName: "Plaques",
              categoryIcon: "sign",
            },
          ],
        }),
        submitDailyAnswer: async () => ({
          position: 1,
          selectedCode: "FR",
          selectedLabel: "France",
          correctCode: "FR",
          correctLabel: "France",
          isCorrect: true,
          completed: true,
          currentPosition: 2,
          correctAnswers: 1,
          totalQuestions: 1,
          durationMs: null,
          xpDelta: 0,
          xpTotal: null,
          xpAwarded: false,
        }),
      }),
    );

    expect(screen.getByRole("combobox")).toHaveValue("collection-1");
    await user.click(await screen.findByRole("button", { name: "Lancer" }));
    await screen.findByText(/question 1/i);
    await user.click(screen.getByRole("button", { name: /selectionner/i }));
    await user.click(
      await screen.findByRole("button", { name: /question suivante/i }),
    );
    await user.click(await screen.findByRole("button", { name: /rejouer/i }));

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toHaveValue("collection-1");
    });
    expect(
      screen.getByRole("button", { name: /lancer l'entra.nement/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/drapeaux/i).length).toBeGreaterThan(0);
  });

  it("does not persist a region session when no playable question can be built", async () => {
    const user = userEvent.setup();
    const createSession = vi.fn(async () => createSessionRow());

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
            imageUrl: "https://example.test/us-tx.png",
            imageAlt: "Texas plate",
            coverage: "selected_regions",
            regionIds: ["US-TX"],
            regionNames: [],
            zoneGeoJson: null,
          },
        ],
        createSession,
      }),
    );

    await user.click(screen.getByRole("button", { name: "Régions" }));
    await user.click(screen.getByRole("button", { name: /Lancer l'entra.nement/i }));

    expect(createSession).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Aucun indice jouable ne correspond aux filtres."),
    ).toBeInTheDocument();
  });
});
