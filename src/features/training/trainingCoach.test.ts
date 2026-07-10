import { describe, expect, it } from "vitest";
import {
  buildTrainingCoachFeedback,
  buildTrainingSessionCoachSummary,
} from "./trainingCoach";
import type { TrainingAnswer, TrainingQuestion } from "./trainingSession";

function createQuestion(overrides: Partial<TrainingQuestion> = {}): TrainingQuestion {
  return {
    id: "question-1",
    mode: "world",
    answerCode: "AR",
    answerLabel: "Argentine",
    parentCountryCode: "AR",
    parentCountryName: "Argentine",
    clue: {
      id: "clue-1",
      countryCode: "AR",
      countryName: "Argentine",
      categoryId: "plates",
      categoryName: "Plaques",
      difficulty: "medium",
      imageUrl: "https://example.test/argentina.png",
      imageAlt: "Plaque Argentine",
      coverage: "whole_country",
      regionIds: [],
      regionNames: [],
      zoneGeoJson: null,
    },
    ...overrides,
  };
}

function createAnswer(overrides: Partial<TrainingAnswer> = {}): TrainingAnswer {
  return {
    selectedCode: "CL",
    correctCode: "AR",
    selectedLabel: "Chili",
    correctLabel: "Argentine",
    isCorrect: false,
    ...overrides,
  };
}

describe("trainingCoach", () => {
  it("returns contextual guidance for a wrong world answer", () => {
    const feedback = buildTrainingCoachFeedback(createQuestion(), createAnswer());

    expect(feedback.summary).toMatch(/progresser/i);
    expect(feedback.insights).toHaveLength(3);
    expect(feedback.insights[0]).toMatch(/argentine/i);
    expect(feedback.insights[1]).toMatch(/plaques/i);
    expect(feedback.insights[2]).toMatch(/indice moyen/i);
  });

  it("adapts guidance for region mode and correct answers", () => {
    const feedback = buildTrainingCoachFeedback(
      createQuestion({
        mode: "country",
        answerCode: "US-TX",
        answerLabel: "Texas",
        parentCountryCode: "US",
        parentCountryName: "United States of America",
      }),
      createAnswer({
        selectedCode: "US-TX",
        correctCode: "US-TX",
        selectedLabel: "Texas",
        correctLabel: "Texas",
        isCorrect: true,
      }),
    );

    expect(feedback.summary).toMatch(/retenir/i);
    expect(feedback.insights[0]).toMatch(/texas/i);
    expect(feedback.insights[0]).toMatch(/united states of america/i);
  });

  it("builds a session summary with strengths and revision priority", () => {
    const summary = buildTrainingSessionCoachSummary(
      [
        createQuestion({
          clue: {
            ...createQuestion().clue,
            categoryName: "Drapeaux",
            difficulty: "easy",
          },
        }),
        createQuestion({
          mode: "country",
          answerCode: "US-TX",
          answerLabel: "Texas",
          parentCountryCode: "US",
          parentCountryName: "United States of America",
          clue: {
            ...createQuestion().clue,
            categoryName: "Plaques",
            difficulty: "expert",
          },
        }),
      ],
      [
        createAnswer({
          selectedCode: "AR",
          correctCode: "AR",
          selectedLabel: "Argentine",
          correctLabel: "Argentine",
          isCorrect: true,
        }),
        createAnswer({
          selectedCode: "US-CA",
          correctCode: "US-TX",
          selectedLabel: "California",
          correctLabel: "Texas",
          isCorrect: false,
        }),
      ],
    );

    expect(summary.title).toMatch(/bilan coach/i);
    expect(summary.summary).toMatch(/session solide|progresser/i);
    expect(summary.highlights.join(" ")).toMatch(/point fort du jour/i);
    expect(summary.highlights.join(" ")).toMatch(/priorité de révision/i);
    expect(summary.highlights.join(" ")).toMatch(/mode régions/i);
  });
});
