export type TrainingDifficulty = "easy" | "medium" | "expert";
export type TrainingCoverage = "whole_country" | "selected_regions" | "drawn_zone";
export type TrainingZoneGeoJson = {
  type: "Polygon";
  coordinates: number[][][];
};

export type TrainingClue = {
  id: string;
  countryCode: string;
  countryName: string;
  categoryId: string;
  categoryName: string;
  categoryIcon?: string | null;
  difficulty: TrainingDifficulty;
  imageUrl: string | null;
  imageAlt: string;
  coverage: TrainingCoverage;
  regionIds: string[];
  regionNames: string[];
  zoneGeoJson: TrainingZoneGeoJson | null;
};

export type TrainingQuestion = {
  id: string;
  clue: TrainingClue;
  mode: "world" | "country";
  answerCode: string;
  answerLabel: string;
  parentCountryCode: string;
  parentCountryName: string;
};

export type TrainingAnswer = {
  selectedCode: string;
  correctCode: string;
  selectedLabel: string;
  correctLabel: string;
  isCorrect: boolean;
};

export type AnswerXpPreview = {
  estimatedDelta: number;
  difficulty: TrainingDifficulty;
};

export type CompletedTrainingSessionResult = {
  xpDelta: number;
  xpTotal: number;
  xpAwarded: boolean;
};

function shuffle<T>(items: T[], random: () => number) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
}

export function buildTrainingQuestions(
  clues: TrainingClue[],
  requestedCount: number,
  mode: "world" | "country" = "world",
  random: () => number = Math.random,
): TrainingQuestion[] {
  const safeCount = Math.max(0, Math.floor(requestedCount));
  return shuffle(clues, random)
    .slice(0, Math.min(safeCount, clues.length))
    .map<TrainingQuestion | null>((clue, index) => {
      if (mode === "country") {
        const [regionId] = clue.regionIds;
        const [regionName] = clue.regionNames;
        if (!regionId || !regionName) {
          return null;
        }
        return {
          id: `${clue.id}:${index}`,
          clue,
          mode: "country",
          answerCode: regionId,
          answerLabel: regionName,
          parentCountryCode: clue.countryCode,
          parentCountryName: clue.countryName,
        };
      }

      return {
        id: `${clue.id}:${index}`,
        clue,
        mode: "world",
        answerCode: clue.countryCode,
        answerLabel: clue.countryName,
        parentCountryCode: clue.countryCode,
        parentCountryName: clue.countryName,
      };
    })
    .filter((question): question is TrainingQuestion => question !== null);
}

export function resolveTrainingAnswer(
  question: TrainingQuestion,
  selectedCode: string,
  selectedLabel: string,
): TrainingAnswer {
  return {
    selectedCode,
    correctCode: question.answerCode,
    selectedLabel,
    correctLabel: question.answerLabel,
    isCorrect: selectedCode === question.answerCode,
  };
}

export function nextTrainingIndex(currentIndex: number, totalQuestions: number) {
  return Math.min(currentIndex + 1, totalQuestions);
}

export function countCorrectAnswers(answers: TrainingAnswer[]) {
  return answers.filter((answer) => answer.isCorrect).length;
}
