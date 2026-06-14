export type TrainingDifficulty = "easy" | "medium" | "expert";

export type TrainingClue = {
  id: string;
  countryCode: string;
  countryName: string;
  categoryId: string;
  categoryName: string;
  difficulty: TrainingDifficulty;
  imageUrl: string | null;
  imageAlt: string;
};

export type TrainingQuestion = {
  id: string;
  clue: TrainingClue;
  promptCountryCode: string;
};

export type TrainingAnswer = {
  selectedCode: string;
  correctCode: string;
  isCorrect: boolean;
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
  random: () => number = Math.random,
): TrainingQuestion[] {
  const safeCount = Math.max(0, Math.floor(requestedCount));
  return shuffle(clues, random)
    .slice(0, Math.min(safeCount, clues.length))
    .map((clue, index) => ({
      id: `${clue.id}:${index}`,
      clue,
      promptCountryCode: clue.countryCode,
    }));
}

export function resolveTrainingAnswer(
  question: TrainingQuestion,
  selectedCode: string,
): TrainingAnswer {
  return {
    selectedCode,
    correctCode: question.clue.countryCode,
    isCorrect: selectedCode === question.clue.countryCode,
  };
}

export function nextTrainingIndex(currentIndex: number, totalQuestions: number) {
  return Math.min(currentIndex + 1, totalQuestions);
}

export function countCorrectAnswers(answers: TrainingAnswer[]) {
  return answers.filter((answer) => answer.isCorrect).length;
}
