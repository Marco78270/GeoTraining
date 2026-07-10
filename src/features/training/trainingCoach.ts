import type {
  TrainingAnswer,
  TrainingClue,
  TrainingDifficulty,
  TrainingQuestion,
} from "./trainingSession";

export type TrainingCoachFeedback = {
  title: string;
  summary: string;
  insights: string[];
};

export type TrainingSessionCoachSummary = {
  title: string;
  summary: string;
  highlights: string[];
};

const difficultyGuidance: Record<TrainingDifficulty, string> = {
  easy: "Sur un indice facile, l'objectif est de verrouiller vite un marqueur évident avant de confirmer le pays.",
  medium:
    "Sur un indice moyen, compare d'abord deux ou trois pays plausibles au lieu de chercher un détail parfait tout de suite.",
  expert:
    "Sur un indice expert, un seul détail ne suffit souvent pas: croise forme, support et contexte avant de cliquer.",
};

function buildCategoryGuidance(clue: TrainingClue) {
  const category = clue.categoryName.toLowerCase();

  if (category.includes("drapeau")) {
    return "Pour les drapeaux, pense d'abord aux couleurs dominantes, puis à la présence d'un blason, d'une étoile ou d'une bande atypique.";
  }

  if (category.includes("plaque")) {
    return "Pour les plaques, regarde la taille du format, les bandeaux, la palette de couleurs et la typographie avant le texte.";
  }

  if (category.includes("bollard")) {
    return "Pour les bollards, compare la forme du poteau, les anneaux de couleur, la matière et le type de route autour.";
  }

  if (category.includes("poteau")) {
    return "Pour les poteaux électriques, observe la matière, le nombre de traverses, la fixation des câbles et la densité du réseau.";
  }

  if (category.includes("marquage")) {
    return "Pour les marquages au sol, priorise la couleur des lignes, leur espacement et la manière dont elles structurent la chaussée.";
  }

  if (category.includes("google car") || category.includes("voiture")) {
    return "Pour le Google Car, isole la couleur du capot, la forme du rack caméra et les éléments récurrents visibles en bas de l'image.";
  }

  return "Choisis un ancrage visuel simple, puis vérifie qu'il reste cohérent avec le support et l'environnement.";
}

function buildModeGuidance(question: TrainingQuestion, answer: TrainingAnswer) {
  if (question.mode === "country") {
    return answer.isCorrect
      ? `Bonne lecture régionale: tu as bien isolé ${answer.correctLabel} dans ${question.parentCountryName}.`
      : `Tu étais déjà dans l'exercice régional sur ${question.parentCountryName}: la prochaine fois, compare les différences fines entre régions avant de valider.`;
  }

  return answer.isCorrect
    ? `Tu as correctement reconnu ${answer.correctLabel}. Garde en tête le détail qui t'a permis de valider ce pays.`
    : `Bonne cible à retenir: ${answer.correctLabel}. Quand plusieurs pays se ressemblent, élimine d'abord par continent ou grande zone avant d'affiner.`;
}

export function buildTrainingCoachFeedback(
  question: TrainingQuestion,
  answer: TrainingAnswer,
): TrainingCoachFeedback {
  const insights = [
    buildModeGuidance(question, answer),
    buildCategoryGuidance(question.clue),
    difficultyGuidance[question.clue.difficulty],
  ];

  return {
    title: answer.isCorrect ? "Coach GeoTrainer" : "Coach GeoTrainer",
    summary: answer.isCorrect
      ? "Bon réflexe. Essaie maintenant de retenir pourquoi cette réponse était la bonne."
      : "On s'en sert pour progresser: l'idée est de transformer cette erreur en repère réutilisable.",
    insights,
  };
}

export function buildTrainingSessionCoachSummary(
  questions: TrainingQuestion[],
  answers: TrainingAnswer[],
): TrainingSessionCoachSummary {
  const total = Math.min(questions.length, answers.length);
  const correct = answers.filter((answer) => answer.isCorrect).length;
  const successRate = total > 0 ? Math.round((correct / total) * 100) : 0;

  const wrongQuestions = questions.filter((_, index) => answers[index] && !answers[index].isCorrect);
  const hardestWrong = wrongQuestions.sort(
    (left, right) =>
      ["easy", "medium", "expert"].indexOf(right.clue.difficulty) -
      ["easy", "medium", "expert"].indexOf(left.clue.difficulty),
  )[0];

  const strongestQuestion = questions.find((_, index) => answers[index]?.isCorrect) ?? null;
  const regionMistakes = wrongQuestions.filter((question) => question.mode === "country").length;

  const highlights: string[] = [];

  if (strongestQuestion) {
    highlights.push(
      `Point fort du jour: ${strongestQuestion.clue.categoryName} sur ${strongestQuestion.parentCountryName}.`,
    );
  }

  if (hardestWrong) {
    highlights.push(
      `Priorité de révision: ${hardestWrong.clue.categoryName} - ${hardestWrong.answerLabel}, niveau ${hardestWrong.clue.difficulty === "easy" ? "facile" : hardestWrong.clue.difficulty === "medium" ? "moyen" : "expert"}.`,
    );
  }

  if (regionMistakes > 0) {
    highlights.push(
      `Tu as eu ${regionMistakes} erreur(s) en mode régions: un prochain quiz ciblé sur un seul pays peut faire gagner vite en précision.`,
    );
  } else if (total > 0) {
    highlights.push(
      "Les erreurs restantes semblent surtout venir du repérage pays: garde un premier filtre continent ou zone avant d'affiner.",
    );
  }

  return {
    title: "Bilan coach GeoTrainer",
    summary:
      successRate >= 80
        ? "Très bonne session. Le plus rentable maintenant est de consolider les détails qui t'ont permis de réussir."
        : successRate >= 50
          ? "Session solide, avec encore quelques repères à stabiliser avant que cela devienne automatique."
          : "Session utile pour progresser: on a maintenant une base claire sur quoi retravailler en priorité.",
    highlights,
  };
}
