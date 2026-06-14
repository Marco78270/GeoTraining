import { describe, expect, it, vi } from "vitest";
import {
  createTrainingApi,
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
        difficulty: "easy",
        categories: { name: "Drapeaux" },
        countries: { name: "France" },
        clue_images: [
          {
            storage_path: "collection-1/clue-1/image-1.png",
            alt_text: "Drapeau France",
            sort_order: 0,
          },
        ],
      },
    ]),
    createSignedImageUrls: vi.fn().mockResolvedValue({
      "collection-1/clue-1/image-1.png": "https://example.test/france.png",
    }),
    insertSession: vi.fn().mockResolvedValue(sessionRow),
    insertAnswer: vi.fn().mockResolvedValue(undefined),
    updateSession: vi.fn().mockResolvedValue(undefined),
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

  it("creates a training session and records an answer", async () => {
    const client = createClient();
    const api = createTrainingApi(client);

    const session = await api.createSession({
      collectionId: "collection-1",
      categoryId: "category-1",
      totalQuestions: 10,
    });

    await api.recordAnswer({
      sessionId: session.id,
      clueId: "clue-1",
      selectedCode: "FR",
      correctCode: "FR",
      isCorrect: true,
    });

    expect(client.insertSession).toHaveBeenCalledWith({
      collectionId: "collection-1",
      categoryId: "category-1",
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

  it("updates totals when completing a session", async () => {
    const client = createClient();
    const api = createTrainingApi(client);

    await api.completeSession("session-1", {
      totalAnswers: 8,
      correctAnswers: 5,
    });

    expect(client.updateSession).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        total_answers: 8,
        correct_answers: 5,
      }),
    );
  });
});
