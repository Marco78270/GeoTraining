import { describe, expect, it, vi } from "vitest";
import {
  createTrainingApi,
  createSupabaseTrainingDataClient,
  type DailyAnswerInput,
  type TrainingDataClient,
} from "./trainingApi";

const sessionRow = {
  id: "session-1",
  user_id: "user-1",
  collection_id: "collection-1",
  mode: "world" as const,
  country_code: null,
  category_id: "category-1",
  total_questions: 10,
  is_ranked: true,
  challenge_type: "standard",
  challenge_key: null,
  duration_ms: 42000,
  correct_answers: 0,
  total_answers: 0,
  started_at: "2026-06-12T08:00:00.000Z",
  completed_at: null,
  created_at: "2026-06-12T08:00:00.000Z",
  updated_at: "2026-06-12T08:00:00.000Z",
};

function createClient(
  overrides: Partial<TrainingDataClient> = {},
): TrainingDataClient {
  return {
    listPublishedClues: vi.fn().mockResolvedValue([
      {
        id: "clue-1",
        category_id: "category-1",
        country_code: "FR",
        title: "Drapeau - France",
        coverage: "whole_country",
        difficulty: "easy",
        source_name: "FlagCDN / Flagpedia",
        source_url: null,
        categories: { name: "Drapeaux" },
        countries: { name: "France" },
        clue_images: [
          {
            storage_path: "collection-1/clue-1/image-1.png",
            alt_text: "Drapeau France",
            sort_order: 0,
          },
        ],
        clue_regions: [],
        clue_zones: null,
      },
    ]),
    createSignedImageUrls: vi.fn().mockResolvedValue({
      "collection-1/clue-1/image-1.png": "https://example.test/france.png",
    }),
    startSession: vi.fn().mockResolvedValue(sessionRow),
    insertAnswer: vi.fn().mockResolvedValue(undefined),
    completeSession: vi.fn().mockResolvedValue({
      ...sessionRow,
      correct_answers: 8,
      total_answers: 10,
      completed_at: "2026-06-12T08:00:42.000Z",
    }),
    getDailyChallengeProgress: vi.fn().mockResolvedValue({
      completedSessions: 2,
      bestAccuracyPercent: 90,
      bestDurationMs: 42000,
      latestCompletedAt: "2026-06-12T08:00:42.000Z",
    }),
    loadDailyChallenge: vi.fn().mockResolvedValue({
      status: "available",
      challengeId: "daily-1",
      challengeKey: "2026-07-03",
      collectionId: "collection-official",
      collectionName: "Collection officielle",
      categoryId: null,
      categoryName: "Toutes les categories",
      mode: "world",
      questionCount: 10,
      secondsUntilReset: 45296,
      attemptStatus: "not_started",
    }),
    startDailyAttempt: vi.fn().mockResolvedValue({
      attemptId: "attempt-1",
      challengeId: "daily-1",
      challengeKey: "2026-07-03",
      collectionId: "collection-official",
      collectionName: "Collection officielle",
      categoryId: null,
      categoryName: "Toutes les categories",
      mode: "world",
      questionCount: 10,
      currentPosition: 1,
      isPremium: false,
      questions: [
        {
          position: 1,
          clueId: "clue-1",
          imageUrl: "https://example.test/france.png",
          imageAlt: "Drapeau France",
          difficulty: "easy",
          categoryName: "Bollards",
          categoryIcon: "bollard",
        },
      ],
    }),
    submitDailyAnswer: vi.fn().mockResolvedValue({
      position: 1,
      selectedCode: "FR",
      selectedLabel: "France",
      correctCode: "FR",
      correctLabel: "France",
      isCorrect: true,
      completed: false,
      currentPosition: 2,
      correctAnswers: 1,
      totalQuestions: 10,
      durationMs: null,
      xpDelta: 0,
      xpTotal: null,
      xpAwarded: false,
    }),
    ...overrides,
  };
}

describe("trainingApi", () => {
  it("loads published clues eligible for world-map training", async () => {
    const api = createTrainingApi(createClient());

    await expect(api.loadPlayableClues("collection-1")).resolves.toEqual([
      expect.objectContaining({
        id: "clue-1",
        countryCode: "FR",
        countryName: "France",
        categoryName: "Drapeaux",
        imageUrl: "https://example.test/france.png",
      }),
    ]);
  });

  it("excludes a non-flag clue when no playable image can be resolved", async () => {
    const api = createTrainingApi(
      createClient({
        listPublishedClues: vi.fn().mockResolvedValue([
          {
            id: "clue-bollard-1",
            category_id: "category-bollards",
            country_code: "KE",
            title: "Bollard - Kenya",
            coverage: "whole_country",
            difficulty: "medium",
            source_name: null,
            source_url: null,
            categories: { name: "Bollards" },
            countries: { name: "Kenya" },
            clue_images: [
              {
                storage_path: "collection-1/clue-bollard-1/image-1.png",
                alt_text: "Bollard kenyan",
                sort_order: 0,
              },
            ],
            clue_regions: [],
            clue_zones: null,
          },
        ]),
        createSignedImageUrls: vi.fn().mockResolvedValue({}),
      }),
    );

    await expect(api.loadPlayableClues("collection-1")).resolves.toEqual([]);
  });

  it("keeps sourced public clues playable with a fallback image when signed URLs are unavailable", async () => {
    const api = createTrainingApi(
      createClient({
        listPublishedClues: vi.fn().mockResolvedValue([
          {
            id: "clue-bollard-1",
            category_id: "category-bollards",
            country_code: "KE",
            title: "Bollard - Kenya",
            coverage: "whole_country",
            difficulty: "medium",
            source_name: "GeoMetas",
            source_url: "https://geometas.com/metas/detail/example/",
            categories: { name: "Bollards" },
            countries: { name: "Kenya" },
            clue_images: [],
            clue_regions: [],
            clue_zones: null,
          },
        ]),
        createSignedImageUrls: vi.fn().mockResolvedValue({}),
      }),
    );

    await expect(api.loadPlayableClues("collection-1")).resolves.toEqual([
      expect.objectContaining({
        id: "clue-bollard-1",
        countryCode: "KE",
        categoryName: "Bollards",
        imageUrl: expect.stringContaining("data:image/svg+xml"),
      }),
    ]);
  });

  it("loads drawn-zone clues for country-mode training data without regional answers", async () => {
    const zoneGeoJson = {
      type: "Polygon" as const,
      coordinates: [
        [
          [-101, 38],
          [-98, 38],
          [-98, 41],
          [-101, 41],
          [-101, 38],
        ],
      ],
    };
    const api = createTrainingApi(
      createClient({
        listPublishedClues: vi.fn().mockResolvedValue([
          {
            id: "clue-zone-1",
            category_id: "category-plates",
            country_code: "US",
            title: "Plaque - zone USA",
            coverage: "drawn_zone",
            difficulty: "expert",
            source_name: "Wikimedia Commons",
            source_url: "https://commons.wikimedia.org/wiki/File:Example.png",
            categories: { name: "Plaques" },
            countries: { name: "United States of America" },
            clue_images: [],
            clue_regions: [],
            clue_zones: { geojson: zoneGeoJson },
          },
        ]),
        createSignedImageUrls: vi.fn().mockResolvedValue({}),
      }),
    );

    await expect(api.loadPlayableClues("collection-1")).resolves.toEqual([
      expect.objectContaining({
        id: "clue-zone-1",
        coverage: "drawn_zone",
        regionIds: [],
        zoneGeoJson,
        imageUrl: expect.stringContaining("commons.wikimedia.org/wiki/Special:FilePath/"),
      }),
    ]);
  });

  it("creates a training session and records an answer", async () => {
    const client = createClient();
    const api = createTrainingApi(client);

    const session = await api.createSession({
      collectionId: "collection-1",
      categoryId: "category-1",
      mode: "world",
      countryCode: null,
      totalQuestions: 10,
    });

    await api.recordAnswer({
      sessionId: session.id,
      clueId: "clue-1",
      selectedCode: "FR",
      correctCode: "FR",
      isCorrect: true,
    });

    expect(client.startSession).toHaveBeenCalledWith({
      collectionId: "collection-1",
      categoryId: "category-1",
      mode: "world",
      countryCode: null,
      totalQuestions: 10,
    });
    expect(client.insertAnswer).toHaveBeenCalledWith({
      sessionId: "session-1",
      clueId: "clue-1",
      selectedCode: "FR",
      correctCode: "FR",
      isCorrect: true,
    });
  });

  it("completes a session from the server-side RPC result", async () => {
    const client = createClient();
    const api = createTrainingApi(client);

    await expect(api.completeSession("session-1")).resolves.toMatchObject({
      id: "session-1",
      correct_answers: 8,
      total_answers: 10,
      duration_ms: 42000,
    });

    expect(client.completeSession).toHaveBeenCalledWith("session-1");
  });

  it("maps ranked session completion with xp payload", async () => {
    const completeSession = vi.fn().mockResolvedValue({
      ...sessionRow,
      correct_answers: 8,
      total_answers: 10,
      duration_ms: 42000,
      completed_at: "2026-06-12T08:00:42.000Z",
      xp_delta: 24,
      xp_total: "1540",
      xp_awarded: true,
    });
    const api = createTrainingApi(
      createClient({
        completeSession,
      }),
    );

    await expect(api.completeSession("session-1")).resolves.toMatchObject({
      xpDelta: 24,
      xpTotal: 1540,
      xpAwarded: true,
    });
  });

  it("loads the current user's daily challenge progress snapshot", async () => {
    const client = createClient();
    const api = createTrainingApi(client);

    await expect(
      api.loadDailyChallengeProgress("collection-1", "2026-07-02"),
    ).resolves.toEqual({
      completedSessions: 2,
      bestAccuracyPercent: 90,
      bestDurationMs: 42000,
      latestCompletedAt: "2026-06-12T08:00:42.000Z",
    });

    expect(client.getDailyChallengeProgress).toHaveBeenCalledWith(
      "collection-1",
      "2026-07-02",
    );
  });

  it("loads the server-owned daily challenge summary", async () => {
    const client = createClient();
    const api = createTrainingApi(client);

    await expect(api.loadDailyChallenge()).resolves.toEqual({
      status: "available",
      challengeId: "daily-1",
      challengeKey: "2026-07-03",
      collectionId: "collection-official",
      collectionName: "Collection officielle",
      categoryId: null,
      categoryName: "Toutes les categories",
      mode: "world",
      questionCount: 10,
      secondsUntilReset: 45296,
      attemptStatus: "not_started",
    });
  });

  it("treats an unavailable daily challenge as a normal empty state", async () => {
    const api = createTrainingApi(
      createClient({
        loadDailyChallenge: vi
          .fn()
          .mockRejectedValue(
            Object.assign(new Error("unavailable"), {
              code: "daily_challenge_unavailable",
            }),
          ),
      }),
    );

    await expect(api.loadDailyChallenge()).resolves.toBeNull();
  });

  it("treats a plpgsql business exception for unavailable daily challenge as a normal empty state", async () => {
    const api = createTrainingApi(
      createClient({
        loadDailyChallenge: vi
          .fn()
          .mockRejectedValue(
            Object.assign(new Error("daily_challenge_unavailable"), {
              code: "P0001",
            }),
          ),
      }),
    );

    await expect(api.loadDailyChallenge()).resolves.toBeNull();
  });

  it("treats a missing daily challenge RPC as a normal empty state", async () => {
    const api = createTrainingApi(
      createClient({
        loadDailyChallenge: vi
          .fn()
          .mockRejectedValue(
            Object.assign(new Error("Could not find the function public.get_or_create_daily_challenge"), {
              code: "PGRST202",
              details: "Searched for the function public.get_or_create_daily_challenge in the schema cache.",
            }),
          ),
      }),
    );

    await expect(api.loadDailyChallenge()).resolves.toBeNull();
  });

  it("starts a daily attempt with locked questions from the server", async () => {
    const client = createClient();
    const api = createTrainingApi(client);

    await expect(api.startDailyAttempt()).resolves.toEqual({
      attemptId: "attempt-1",
      challengeId: "daily-1",
      challengeKey: "2026-07-03",
      collectionId: "collection-official",
      collectionName: "Collection officielle",
      categoryId: null,
      categoryName: "Toutes les categories",
      mode: "world",
      questionCount: 10,
      currentPosition: 1,
      isPremium: false,
      questions: [
        {
          position: 1,
          clueId: "clue-1",
          imageUrl: "https://example.test/france.png",
          imageAlt: "Drapeau France",
          difficulty: "easy",
          categoryName: "Bollards",
          categoryIcon: "bollard",
        },
      ],
    });

    expect(client.startDailyAttempt).toHaveBeenCalledWith();
  });

  it("submits a daily answer through the dedicated RPC", async () => {
    const client = createClient();
    const api = createTrainingApi(client);
    const input: DailyAnswerInput = {
      attemptId: "attempt-1",
      position: 1,
      selectedCode: "FR",
    };

    await expect(api.submitDailyAnswer(input)).resolves.toEqual({
      position: 1,
      selectedCode: "FR",
      selectedLabel: "France",
      correctCode: "FR",
      correctLabel: "France",
      isCorrect: true,
      completed: false,
      currentPosition: 2,
      correctAnswers: 1,
      totalQuestions: 10,
      durationMs: null,
      xpDelta: 0,
      xpTotal: null,
      xpAwarded: false,
    });

    expect(client.submitDailyAnswer).toHaveBeenCalledWith(input);
  });

  it("maps daily business errors to stable client codes", async () => {
    const api = createTrainingApi(
      createClient({
        startDailyAttempt: vi
          .fn()
          .mockRejectedValue(Object.assign(new Error("already done"), { code: "daily_attempt_already_completed" })),
      }),
    );

    await expect(api.startDailyAttempt()).rejects.toMatchObject({
      code: "already_completed",
    });
  });

  it("keeps the Supabase client context when calling an RPC", async () => {
    const call = vi.fn().mockResolvedValue({
      data: [sessionRow],
      error: null,
    });
    const supabase = {
      rest: { call },
      rpc(this: { rest: { call: typeof call } }, fn: string, args?: unknown) {
        return this.rest.call(fn, args);
      },
    };

    const result = await createSupabaseTrainingDataClient(
      supabase as never,
    ).startSession({
      collectionId: "collection-1",
      categoryId: "flags",
      mode: "world",
      countryCode: null,
      totalQuestions: 1,
      challengeType: "standard",
      challengeKey: null,
    });

    expect(result.id).toBe("session-1");
    expect(call).toHaveBeenCalledWith("start_training_session", {
      p_collection_id: "collection-1",
      p_category_id: "flags",
      p_mode: "world",
      p_country_code: null,
      p_total_questions: 1,
      p_challenge_type: "standard",
      p_challenge_key: null,
    });
  });

  it("degrade proprement quand Supabase refuse la signature des images", async () => {
    const supabase = {
      rpc: vi.fn(),
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrls: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "row-level security policy", code: "403" },
          }),
        }),
      },
    };

    const result = await createSupabaseTrainingDataClient(
      supabase as never,
    ).createSignedImageUrls(["collection-1/clue-1/image.png"]);

    expect(result).toEqual({});
  });
});
