import { describe, expect, it } from "vitest";
import {
  buildTrainingQuestions,
  countCorrectAnswers,
  nextTrainingIndex,
  resolveTrainingAnswer,
  type TrainingClue,
} from "./trainingSession";

const clues: TrainingClue[] = [
  {
    id: "clue-1",
    countryCode: "FR",
    countryName: "France",
    categoryId: "category-1",
    categoryName: "Panneaux",
    difficulty: "easy",
    imageUrl: "https://example.test/fr.png",
    imageAlt: "France",
    coverage: "whole_country",
    regionIds: [],
    regionNames: [],
  },
  {
    id: "clue-2",
    countryCode: "KE",
    countryName: "Kenya",
    categoryId: "category-1",
    categoryName: "Panneaux",
    difficulty: "medium",
    imageUrl: "https://example.test/ke.png",
    imageAlt: "Kenya",
    coverage: "whole_country",
    regionIds: [],
    regionNames: [],
  },
  {
    id: "clue-3",
    countryCode: "JP",
    countryName: "Japon",
    categoryId: "category-1",
    categoryName: "Panneaux",
    difficulty: "expert",
    imageUrl: "https://example.test/jp.png",
    imageAlt: "Japon",
    coverage: "whole_country",
    regionIds: [],
    regionNames: [],
  },
  {
    id: "clue-4",
    countryCode: "BR",
    countryName: "Bresil",
    categoryId: "category-1",
    categoryName: "Panneaux",
    difficulty: "easy",
    imageUrl: "https://example.test/br.png",
    imageAlt: "Bresil",
    coverage: "whole_country",
    regionIds: [],
    regionNames: [],
  },
  {
    id: "clue-5",
    countryCode: "US",
    countryName: "Etats-Unis",
    categoryId: "category-1",
    categoryName: "Panneaux",
    difficulty: "medium",
    imageUrl: "https://example.test/us.png",
    imageAlt: "Etats-Unis",
    coverage: "whole_country",
    regionIds: [],
    regionNames: [],
  },
];

describe("trainingSession", () => {
  it("builds a deduplicated question list capped by the requested count", () => {
    const result = buildTrainingQuestions(clues, 5, "world", () => 0.5);

    expect(result).toHaveLength(5);
    expect(new Set(result.map((question) => question.clue.id)).size).toBe(5);
  });

  it("marks the answer as correct when the clicked country matches", () => {
    const [question] = buildTrainingQuestions([clues[0]], 1, "world", () => 0.5);

    const result = resolveTrainingAnswer(question, "FR", "France");

    expect(result.isCorrect).toBe(true);
    expect(result.correctCode).toBe("FR");
    expect(result.correctLabel).toBe("France");
  });

  it("advances the current question index without exceeding the total", () => {
    expect(nextTrainingIndex(0, 5)).toBe(1);
    expect(nextTrainingIndex(5, 5)).toBe(5);
  });

  it("counts only correct answers", () => {
    expect(
      countCorrectAnswers([
        {
          selectedCode: "FR",
          correctCode: "FR",
          selectedLabel: "France",
          correctLabel: "France",
          isCorrect: true,
        },
        {
          selectedCode: "KE",
          correctCode: "JP",
          selectedLabel: "Kenya",
          correctLabel: "Japon",
          isCorrect: false,
        },
        {
          selectedCode: "BR",
          correctCode: "BR",
          selectedLabel: "Bresil",
          correctLabel: "Bresil",
          isCorrect: true,
        },
      ]),
    ).toBe(2);
  });
});
