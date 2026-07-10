import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bookmark,
  Globe2,
  GraduationCap,
  Map as MapIcon,
  MapPinned,
  Play,
  Search,
  ShieldCheck,
  Signpost,
  Trophy,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/authContext";
import { ProfileMenu } from "../admin/ProfileMenu";
import {
  formatBillingPlan,
  type BillingApi,
} from "../billing/billingApi";
import { useBillingStatus } from "../billing/useBillingStatus";
import { useActiveCollection } from "../collections/activeCollectionContext";
import { getCategoryIcon } from "../collections/categoryIcons";
import { collectionKeys } from "../collections/collectionKeys";
import { CollectionPicker } from "../collections/CollectionPicker";
import {
  preloadTrainingExperience,
  preloadTrainingMapModule,
  scheduleMapAssetPreload,
} from "../geography/mapAssetPreload";
import { profileKeys, type UserProfile } from "../profile/profileApi";
import {
  getTrainingApi,
  type DailyAttempt,
  type TrainingApi,
} from "./trainingApi";
import { useSessionTimer } from "./useSessionTimer";
import {
  buildTrainingQuestions,
  countCorrectAnswers,
  nextTrainingIndex,
  resolveTrainingAnswer,
  type AnswerXpPreview,
  type CompletedTrainingSessionResult,
  type TrainingAnswer,
  type TrainingClue,
  type TrainingDifficulty,
  type TrainingQuestion,
} from "./trainingSession";
import {
  buildTrainingCoachFeedback,
  buildTrainingSessionCoachSummary,
} from "./trainingCoach";
import { getRankForXp } from "../ranking/rankProgression";
import { RankProgressCard } from "../ranking/RankProgressCard";
import { DailyChallengeCard } from "./DailyChallengeCard";
import { DailyPremiumDialog } from "./DailyPremiumDialog";

const TrainingMap = lazy(async () => {
  const module = await preloadTrainingMapModule();
  return { default: module.TrainingMap };
});

type TrainingSessionState = {
  sessionId: string;
  mode: "world" | "country";
  categoryId: string | null;
  collectionId: string | null;
  isRanked: boolean;
  challengeType: "standard" | "daily";
  challengeKey: string | null;
  dailyAttemptId: string | null;
  startedAt: string;
  completedDurationMs: number | null;
  questions: TrainingQuestion[];
  currentIndex: number;
  answers: TrainingAnswer[];
  completedResult: CompletedTrainingSessionResult | null;
};

type StandardTrainingSnapshot = {
  activeCollectionId: string | null;
  selectedCategoryId: string;
  questionCount: number;
  mode: "world" | "country";
  selectedRegionCountryCode: string;
  difficulties: TrainingDifficulty[];
};

const difficultyOrder: TrainingDifficulty[] = ["easy", "medium", "expert"];
const difficultyLabels: Record<TrainingDifficulty, string> = {
  easy: "Facile",
  medium: "Moyen",
  expert: "Expert",
};
const emptyTrainingClues: TrainingClue[] = [];

function estimateAnswerXp(
  difficulty: TrainingDifficulty,
  isCorrect: boolean,
): number {
  if (difficulty === "easy") {
    return isCorrect ? 6 : -9;
  }
  if (difficulty === "expert") {
    return isCorrect ? 15 : -6;
  }
  return isCorrect ? 10 : -10;
}

function buildAnswerXpPreview(
  difficulty: TrainingDifficulty,
  isCorrect: boolean,
): AnswerXpPreview {
  return {
    difficulty,
    estimatedDelta: estimateAnswerXp(difficulty, isCorrect),
  };
}

function filterClues(
  clues: TrainingClue[],
  mode: "world" | "country",
  regionCountryCode: string,
  categoryId: string,
  difficulties: ReadonlySet<TrainingDifficulty>,
) {
  return clues.filter(
    (clue) =>
      (mode !== "country" || clue.countryCode === regionCountryCode) &&
      (!categoryId || clue.categoryId === categoryId) &&
      difficulties.has(clue.difficulty) &&
      (mode !== "country" ||
        (clue.coverage === "selected_regions" && clue.regionIds.length === 1)),
  );
}

function highestDifficulty(
  clues: TrainingClue[],
  difficulties: ReadonlySet<TrainingDifficulty>,
) {
  return clues.reduce<TrainingDifficulty>((current, clue) => {
    if (!difficulties.has(clue.difficulty)) {
      return current;
    }
    return difficultyOrder.indexOf(clue.difficulty) >
      difficultyOrder.indexOf(current)
      ? clue.difficulty
      : current;
  }, clues[0]?.difficulty ?? "easy");
}

function buildDailyAttemptQuestions(attempt: DailyAttempt): TrainingQuestion[] {
  return attempt.questions.map((question) => ({
    id: `daily:${attempt.attemptId}:${question.position}`,
    clue: {
      id: question.clueId,
      countryCode: "",
      countryName: "",
      categoryId: attempt.categoryId ?? "daily-mixed",
      categoryName: question.categoryName,
      categoryIcon: question.categoryIcon,
      difficulty: question.difficulty,
      imageUrl: question.imageUrl,
      imageAlt: question.imageAlt,
      coverage: "whole_country",
      regionIds: [],
      regionNames: [],
      zoneGeoJson: null,
    },
    mode: "world",
    answerCode: "",
    answerLabel: "",
    parentCountryCode: "",
    parentCountryName: "",
  }));
}

function buildDailyAttemptAnswers(attempt: DailyAttempt): TrainingAnswer[] {
  return [...(attempt.answeredSteps ?? [])]
    .sort((left, right) => left.position - right.position)
    .map((step) => ({
      selectedCode: "",
      correctCode: "",
      selectedLabel: "",
      correctLabel: "",
      isCorrect: step.isCorrect,
    }));
}

function describeSessionStartError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: string }).message ?? "")
        : "";
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: string }).code ?? "")
      : "";

  if (message.includes("training_collection_not_accessible")) {
    return "La collection sélectionnée n'est plus accessible. Rechargez la page puis réessayez.";
  }
  if (message.includes("training_category_not_accessible")) {
    return "La catégorie sélectionnée n'est plus accessible dans cette collection.";
  }
  if (message.includes("training_country_code_required")) {
    return "Sélectionnez un pays avant de lancer un entraînement par régions.";
  }
  if (code === "PGRST202" || code === "PGRST203") {
    return "Le service d'entraînement est en cours de rechargement. Réessayez dans quelques secondes.";
  }
  if (code === "42501" || message.toLowerCase().includes("permission denied")) {
    return "Votre session n'autorise pas encore le lancement. Déconnectez-vous puis reconnectez-vous.";
  }

  return code
    ? `Impossible de lancer la session d'entraînement (${code}).`
    : message
      ? `Impossible de lancer la session d'entraînement. ${message}`
      : "Impossible de lancer la session d'entraînement. Erreur cliente inconnue.";
}

export function TrainingPage({
  trainingApi: suppliedTrainingApi,
  billingApi,
}: {
  trainingApi?: TrainingApi;
  billingApi?: BillingApi;
}) {
  const { signOut, user } = useAuth();
  const queryClient = useQueryClient();

  async function syncProfileXp(xpTotal: number | null, xpAwarded: boolean) {
    if (!xpAwarded || xpTotal === null) {
      return;
    }

    queryClient.setQueryData<UserProfile>(profileKeys.current(), (profile) =>
      profile ? { ...profile, xpTotal } : profile,
    );
    await queryClient.invalidateQueries({ queryKey: profileKeys.current() });
  }
  const [searchParams] = useSearchParams();
  const requestedCollectionId = searchParams.get("collection") ?? "";
  const requestedCategoryId = searchParams.get("category") ?? "";
  const {
    collections,
    activeCollection,
    activeCollectionId,
    setActiveCollectionId,
    isLoading: collectionsLoading,
    error: collectionsError,
  } = useActiveCollection();
  const [trainingApi] = useState(() => suppliedTrainingApi ?? getTrainingApi());
  const billingQuery = useBillingStatus(billingApi);
  const [mode, setMode] = useState<"world" | "country">("world");
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    requestedCategoryId,
  );
  const [selectedRegionCountryCode, setSelectedRegionCountryCode] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulties, setDifficulties] = useState<Set<TrainingDifficulty>>(
    () => new Set(difficultyOrder),
  );
  const [session, setSession] = useState<TrainingSessionState | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [isDailyPremiumDialogOpen, setIsDailyPremiumDialogOpen] = useState(false);
  const standardTrainingSnapshotRef = useRef<StandardTrainingSnapshot | null>(null);

  useEffect(() => scheduleMapAssetPreload(preloadTrainingExperience), []);
  const [isCompletingSession, setIsCompletingSession] = useState(false);
  const isPublicReadOnly = activeCollection?.visibility === "public_readonly";
  const billing = billingQuery.data;
  const hasPremiumPlan = Boolean(billing?.premiumEnabled);

  useEffect(() => {
    if (
      requestedCollectionId &&
      requestedCollectionId !== activeCollectionId &&
      collections.some((collection) => collection.id === requestedCollectionId)
    ) {
      setActiveCollectionId(requestedCollectionId);
    }
  }, [
    activeCollectionId,
    collections,
    requestedCollectionId,
    setActiveCollectionId,
  ]);

  const cluesQuery = useQuery({
    queryKey: activeCollectionId
      ? [...collectionKeys.clues(activeCollectionId), "training"]
      : ["training", "inactive"],
    queryFn: () => trainingApi.loadPlayableClues(activeCollectionId!),
    enabled: Boolean(activeCollectionId),
  });
  const dailyChallengeQuery = useQuery({
    queryKey: ["training", "daily-challenge", user?.id ?? null],
    queryFn: () => trainingApi.loadDailyChallenge(),
    enabled: Boolean(user?.id),
    retry: 1,
    retryDelay: 0,
  });

  useEffect(() => {
    if (!dailyChallengeQuery.error) {
      return;
    }

    const error = dailyChallengeQuery.error as {
      code?: string;
      details?: string;
      hint?: string;
      message?: string;
    };

    console.error("Daily challenge load failed", {
      userId: user?.id ?? null,
      message: error.message ?? String(dailyChallengeQuery.error),
      code: error.code ?? null,
      details: error.details ?? null,
      hint: error.hint ?? null,
      error: dailyChallengeQuery.error,
    });
  }, [dailyChallengeQuery.error, user?.id]);

  const clues = cluesQuery.data ?? emptyTrainingClues;
  const categories = useMemo(
    () =>
      [
        ...new Map(
          clues.map((clue) => [
            clue.categoryId,
            {
              id: clue.categoryId,
              name: clue.categoryName,
              icon: clue.categoryIcon,
            },
          ]),
        ).values(),
      ],
    [clues],
  );
  const regionCapableCountries = useMemo(
    () =>
      [...new Map(
        clues
          .filter(
            (clue) =>
              clue.coverage === "selected_regions" && clue.regionIds.length === 1,
          )
          .map((clue) => [
            clue.countryCode,
            { code: clue.countryCode, name: clue.countryName },
          ]),
      ).values()].sort((left, right) => left.name.localeCompare(right.name, "fr")),
    [clues],
  );
  const effectiveRegionCountryCode =
    mode === "country"
      ? selectedRegionCountryCode || regionCapableCountries[0]?.code || ""
      : "";
  const playableClues = useMemo(
    () =>
      filterClues(
        clues,
        mode,
        effectiveRegionCountryCode,
        selectedCategoryId,
        difficulties,
      ),
    [clues, mode, effectiveRegionCountryCode, selectedCategoryId, difficulties],
  );
  const currentQuestion = session?.questions[session.currentIndex] ?? null;
  const currentAnswer = session?.answers[session.currentIndex] ?? null;
  const currentAnswerXpPreview =
    session?.isRanked && currentQuestion && currentAnswer
      ? buildAnswerXpPreview(
          currentQuestion.clue.difficulty,
          currentAnswer.isCorrect,
        )
      : null;
  const currentCoachFeedback =
    currentQuestion && currentAnswer
      ? buildTrainingCoachFeedback(currentQuestion, currentAnswer)
      : null;
  const timer = useSessionTimer({
    startedAt: session?.startedAt ?? null,
    completedDurationMs: session?.completedDurationMs ?? null,
  });
  const isFinished = Boolean(
    session && session.currentIndex >= session.questions.length,
  );
  const sessionCoachSummary =
    isFinished && session
      ? buildTrainingSessionCoachSummary(session.questions, session.answers)
      : null;
  const answeredCount = session?.answers.length ?? 0;
  const liveScore = session ? countCorrectAnswers(session.answers) : 0;
  const finalScore = session ? countCorrectAnswers(session.answers) : 0;
  const finalSuccessRate =
    session && session.questions.length > 0
      ? Math.round((finalScore / session.questions.length) * 100)
      : 0;
  const progressPercent = session
    ? Math.min(100, Math.round((answeredCount / session.questions.length) * 100))
    : 0;
  const secondsPerQuestion =
    session?.completedDurationMs && session.answers.length > 0
      ? session.completedDurationMs / 1000 / session.answers.length
      : null;
  const completedXpResult = session?.completedResult ?? null;
  const finalRank =
    completedXpResult?.xpAwarded ? getRankForXp(completedXpResult.xpTotal) : null;
  const previousRank =
    completedXpResult?.xpAwarded
      ? getRankForXp(completedXpResult.xpTotal - completedXpResult.xpDelta)
      : null;
  const selectedCategory =
    categories.find((category) => category.id === selectedCategoryId) ?? null;
  const safeQuestionCount = Math.min(
    Math.max(questionCount, 1),
    Math.max(playableClues.length, 1),
  );
  const countryNameByCode = useMemo(
    () =>
      new Map(clues.map((clue) => [clue.countryCode, clue.countryName] as const)),
    [clues],
  );
  const coveredCountryList = useMemo(
    () =>
      [...countryNameByCode.entries()]
        .filter(([code]) => playableClues.some((clue) => clue.countryCode === code))
        .sort((left, right) => left[1].localeCompare(right[1], "fr")),
    [countryNameByCode, playableClues],
  );
  const regionNameById = useMemo(
    () =>
      new Map(
        clues.flatMap((clue) =>
          clue.regionIds.map((regionId, index) => [
            regionId,
            clue.regionNames[index] ?? regionId,
          ] as const),
        ),
      ),
    [clues],
  );
  const dailyChallenge = dailyChallengeQuery.data ?? null;
  const mapMarkers = useMemo(
    () =>
      mode === "world"
        ? coveredCountryList.map(([code, name]) => ({
            code,
            name,
            difficulty: highestDifficulty(
              playableClues.filter((clue) => clue.countryCode === code),
              difficulties,
            ),
          }))
        : [...new Map(
            playableClues.flatMap((clue) =>
              clue.regionIds.map((regionId, index) => [
                regionId,
                {
                  code: regionId,
                  name: clue.regionNames[index] ?? regionId,
                  difficulty: clue.difficulty,
                },
              ]),
            ),
          ).values()].sort((left, right) => left.name.localeCompare(right.name, "fr")),
    [mode, coveredCountryList, playableClues, difficulties],
  );

  function formatAnswerLabel(code: string, label: string) {
    if (mode === "country") {
      return label;
    }
    return `${label} (${code})`;
  }

  function formatQuestionPrompt(question: TrainingQuestion) {
    if (question.mode === "country") {
      return `Trouver la région`;
    }
    return `Trouver le pays`;
  }

  function formatQuestionContext(
    question: TrainingQuestion,
    answer?: TrainingAnswer,
  ) {
    if (question.mode === "country") {
      const regionLabel = question.answerLabel || answer?.correctLabel || "";
      return [question.parentCountryName, regionLabel].filter(Boolean).join(" - ");
    }
    return question.answerLabel || answer?.correctLabel || question.clue.categoryName;
  }

  function formatXpDelta(value: number) {
    return value >= 0 ? `+${value}` : `${value}`;
  }

  function closeDailyPremiumDialog() {
    setIsDailyPremiumDialogOpen(false);
  }

  function toggleDifficulty(difficulty: TrainingDifficulty) {
    setDifficulties((current) => {
      const next = new Set(current);
      if (next.has(difficulty) && next.size > 1) next.delete(difficulty);
      else next.add(difficulty);
      return next;
    });
  }

  function resetTraining() {
    const shouldRestoreStandardSnapshot = session?.challengeType === "daily";

    setSession(null);
    setStartError(null);
    setIsCompletingSession(false);
    closeDailyPremiumDialog();

    if (shouldRestoreStandardSnapshot && standardTrainingSnapshotRef.current) {
      const snapshot = standardTrainingSnapshotRef.current;
      setActiveCollectionId(snapshot.activeCollectionId);
      setSelectedCategoryId(snapshot.selectedCategoryId);
      setQuestionCount(snapshot.questionCount);
      setMode(snapshot.mode);
      setSelectedRegionCountryCode(snapshot.selectedRegionCountryCode);
      setDifficulties(new Set(snapshot.difficulties));
      standardTrainingSnapshotRef.current = null;
    }
  }

  async function startSession() {
    if (!activeCollectionId || playableClues.length === 0) {
      setStartError("Aucun indice jouable ne correspond aux filtres.");
      return;
    }

    try {
      const questions = buildTrainingQuestions(
        playableClues,
        safeQuestionCount,
        mode,
      );
      if (questions.length === 0) {
        setStartError("Aucun indice jouable ne correspond aux filtres.");
        return;
      }
      const persisted = await trainingApi.createSession({
        collectionId: activeCollectionId,
        categoryId: selectedCategoryId || null,
        mode,
        countryCode: mode === "country" ? effectiveRegionCountryCode : null,
        totalQuestions: questions.length,
        challengeType: "standard",
        challengeKey: null,
      });
      setStartError(null);
      setSession({
        sessionId: persisted.id,
        mode,
        categoryId: persisted.category_id,
        collectionId: persisted.collection_id,
        isRanked: persisted.is_ranked,
        challengeType: "standard",
        challengeKey: null,
        dailyAttemptId: null,
        startedAt: persisted.started_at,
        completedDurationMs: persisted.duration_ms,
        questions,
        currentIndex: 0,
        answers: [],
        completedResult: null,
      });
    } catch (error) {
      console.error("Training session start failed", error);
      setStartError(describeSessionStartError(error));
    }
  }

  async function startDailySession() {
    try {
      standardTrainingSnapshotRef.current = {
        activeCollectionId,
        selectedCategoryId,
        questionCount,
        mode,
        selectedRegionCountryCode,
        difficulties: [...difficulties],
      };

      const attempt = await trainingApi.startDailyAttempt();
      const targetCollectionId =
        dailyChallenge?.collectionId ?? attempt.collectionId ?? activeCollectionId;
      setSelectedCategoryId(attempt.categoryId ?? "");
      setDifficulties(new Set(difficultyOrder));
      setQuestionCount(attempt.questionCount);
      setMode("world");
      setSelectedRegionCountryCode("");
      if (targetCollectionId && activeCollectionId !== targetCollectionId) {
        setActiveCollectionId(targetCollectionId);
      }
      setStartError(null);
      closeDailyPremiumDialog();
      setSession({
        sessionId: attempt.attemptId,
        mode: "world",
        categoryId: attempt.categoryId,
        collectionId: targetCollectionId,
        isRanked: attempt.isPremium,
        challengeType: "daily",
        challengeKey: attempt.challengeKey,
        dailyAttemptId: attempt.attemptId,
        startedAt: attempt.startedAt ?? new Date().toISOString(),
        completedDurationMs: null,
        questions: buildDailyAttemptQuestions(attempt),
        currentIndex: Math.max(0, attempt.currentPosition - 1),
        answers: buildDailyAttemptAnswers(attempt),
        completedResult: null,
      });
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code ?? "")
          : "";
      if (code === "already_completed") {
        setStartError("Votre défi quotidien est déjà terminé aujourd'hui.");
      } else if (code === "previous_attempt_in_progress") {
        setStartError("Terminez d'abord le défi quotidien précédent avant d'en lancer un nouveau.");
      } else if (code === "unavailable") {
        setStartError("Le défi quotidien n'est pas disponible pour le moment.");
      } else {
        setStartError("Impossible de lancer le défi quotidien.");
      }
      await queryClient.invalidateQueries({
        queryKey: ["training", "daily-challenge"],
      });
    }
  }

  async function submitAnswer(selectedCode: string) {
    if (!session || !currentQuestion || currentAnswer) {
      return;
    }

    const selectedLabel =
      session.mode === "country"
        ? regionNameById.get(selectedCode) ?? selectedCode
        : countryNameByCode.get(selectedCode) ?? selectedCode;
    try {
      if (session.challengeType === "daily" && session.dailyAttemptId) {
        const result = await trainingApi.submitDailyAnswer({
          attemptId: session.dailyAttemptId,
          position: session.currentIndex + 1,
          selectedCode,
        });
        const answer: TrainingAnswer = {
          selectedCode: result.selectedCode,
          correctCode: result.correctCode,
          selectedLabel: result.selectedLabel,
          correctLabel: result.correctLabel,
          isCorrect: result.isCorrect,
        };
        const completedDurationMs =
          result.completed
            ? (result.durationMs ??
              Math.max(0, Date.now() - Date.parse(session.startedAt)))
            : null;
        setStartError(null);
        setSession((current) =>
          current
            ? {
                ...current,
                completedDurationMs:
                  completedDurationMs ?? current.completedDurationMs,
                answers: [...current.answers, answer],
                completedResult: result.completed
                  ? {
                      xpDelta: result.xpDelta,
                      xpTotal: result.xpTotal ?? 0,
                      xpAwarded: result.xpAwarded,
                    }
                  : current.completedResult,
              }
            : current,
        );
        if (result.completed) {
          await syncProfileXp(result.xpTotal, result.xpAwarded);
          await queryClient.invalidateQueries({
            queryKey: ["training", "daily-challenge"],
          });
          await queryClient.invalidateQueries({
            queryKey: ["leaderboard", "daily-entries"],
          });
          await queryClient.invalidateQueries({
            queryKey: ["leaderboard", "daily-progress"],
          });
        }
        return;
      }

      const answer = resolveTrainingAnswer(
        currentQuestion,
        selectedCode,
        selectedLabel,
      );
      await trainingApi.recordAnswer({
        sessionId: session.sessionId,
        clueId: currentQuestion.clue.id,
        ...answer,
      });
      setStartError(null);
      setSession((current) =>
        current
          ? {
              ...current,
              answers: [...current.answers, answer],
            }
          : current,
      );
    } catch {
      setStartError("Impossible d'enregistrer la réponse.");
    }
  }

  async function goToNextQuestion() {
    if (!session) {
      return;
    }

    const nextIndex = nextTrainingIndex(
      session.currentIndex,
      session.questions.length,
    );

    if (session.challengeType === "daily") {
      setSession((current) =>
        current
          ? {
              ...current,
              currentIndex: nextIndex,
            }
          : current,
      );
      if (nextIndex >= session.questions.length && !session.isRanked) {
        setIsDailyPremiumDialogOpen(true);
      }
      return;
    }

    if (nextIndex >= session.questions.length) {
      try {
        setIsCompletingSession(true);
        const completed = await trainingApi.completeSession(session.sessionId);
        await syncProfileXp(completed.xpTotal, completed.xpAwarded);
        setSession((current) =>
          current
            ? {
                ...current,
                completedDurationMs: completed.duration_ms,
                collectionId: completed.collection_id,
                isRanked: completed.is_ranked,
                categoryId: completed.category_id,
                challengeType:
                  completed.challenge_type === "daily" ? "daily" : "standard",
                challengeKey: completed.challenge_key,
                completedResult: {
                  xpDelta: completed.xpDelta,
                  xpTotal: completed.xpTotal,
                  xpAwarded: completed.xpAwarded,
                },
              }
            : current,
        );
        setIsCompletingSession(false);
      } catch {
        setIsCompletingSession(false);
        setStartError("Impossible de finaliser la session.");
        return;
      }
    }

    setSession((current) =>
      current
        ? {
            ...current,
            currentIndex: nextIndex,
          }
        : current,
    );
  }

  const setupNotice =
    !activeCollection && !collectionsLoading
      ? "Choisissez ou créez une collection avant de lancer un entraînement."
      : cluesQuery.isLoading
        ? "Chargement des indices jouables..."
        : cluesQuery.error
          ? "Impossible de charger les indices d'entraînement."
          : playableClues.length === 0
            ? "Aucun indice jouable ne correspond aux filtres actuels."
            : `${playableClues.length} indice(s) prêts pour l'entraînement.`;

  const trainingPageClassName = [
    "app-shell",
    "training-page",
    "atlas-module-page",
    currentQuestion && session && !isFinished ? "training-quiz-active" : "",
    currentAnswer ? "training-quiz-answered" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const mapFallback = (
    <div className="training-map-frame atlas-map-frame atlas-map-loading" role="status">
      Chargement de la carte...
    </div>
  );

  return (
    <main className={trainingPageClassName}>
      <h1 className="sr-only">Entraînement</h1>
      <header className="topbar atlas-topbar">
        <Link
          className="brand brand-link"
          to="/atlas"
          aria-label="GeoTrainer Atlas"
        >
          <Globe2 className="brand-globe" aria-hidden="true" />
          <strong>GeoTrainer</strong>
          <span>Atlas</span>
        </Link>
        <nav className="atlas-nav" aria-label="Navigation principale">
          <NavLink to="/atlas">
            <MapIcon />
            Atlas
          </NavLink>
          <NavLink to="/collections">
            <Bookmark />
            Collections
          </NavLink>
          <NavLink to="/training">
            <GraduationCap />
            Entraînement
          </NavLink>
          <NavLink to="/statistics">
            <BarChart3 />
            Statistiques
          </NavLink>
          <NavLink to="/leaderboard">
            <Trophy />
            Classement
          </NavLink>
        </nav>
        <ProfileMenu
          email={user?.email}
          onSignOut={() => {
            void signOut();
          }}
        />
      </header>

      <div className="atlas-workspace training-workspace">
        <aside
          className="atlas-sidebar training-sidebar"
          aria-label="Filtres de l'entraînement"
        >
          <label className="atlas-search training-mode-badge">
            <Search aria-hidden="true" />
            <span>Mode entraînement</span>
          </label>

          <CollectionPicker
              collections={collections}
              value={activeCollectionId}
              onChange={(id) => {
                setActiveCollectionId(id);
                resetTraining();
              }}
            disabled={collectionsLoading}
          />
          {collectionsLoading ? (
            <p className="atlas-state">Chargement des collections...</p>
          ) : null}
          {collectionsError ? (
            <p className="atlas-state atlas-state-error">
              Impossible de charger les collections.
            </p>
          ) : null}
          {!collectionsLoading && !activeCollection ? (
            <div className="atlas-empty-collection">
              <p>Créez une collection privée pour enregistrer vos propres indices.</p>
              <Link to="/collections">Créer une collection</Link>
            </div>
          ) : null}

          <section className="atlas-filter-section">
            <h2>Mode</h2>
            <div className="category-filters">
              <button
                type="button"
                className={mode === "world" ? "active" : ""}
                aria-pressed={mode === "world"}
                onClick={() => {
                  setMode("world");
                  resetTraining();
                }}
              >
                <Globe2 aria-hidden="true" />
                <span>Pays</span>
                <span className="category-check" aria-hidden="true">
                  {mode === "world" ? "✓" : ""}
                </span>
              </button>
              <button
                type="button"
                className={mode === "country" ? "active" : ""}
                aria-pressed={mode === "country"}
                disabled={regionCapableCountries.length === 0}
                onClick={() => {
                    setMode("country");
                    if (!selectedRegionCountryCode && regionCapableCountries[0]) {
                      setSelectedRegionCountryCode(regionCapableCountries[0].code);
                    }
                  resetTraining();
                }}
              >
                <MapPinned aria-hidden="true" />
                <span>Régions</span>
                <span className="category-check" aria-hidden="true">
                  {mode === "country" ? "✓" : ""}
                </span>
              </button>
            </div>
          </section>

          {mode === "country" ? (
            <section className="atlas-filter-section training-count-filter">
              <h2>Pays des régions</h2>
              <label className="training-question-count">
                <span>Pays ciblé</span>
                <select
                  value={effectiveRegionCountryCode}
                   onChange={(event) => {
                      setSelectedRegionCountryCode(event.target.value);
                      resetTraining();
                    }}
                >
                  {regionCapableCountries.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          ) : null}

          <section className="atlas-filter-section">
            <h2>Catégories</h2>
            <div className="category-filters">
              <button
                type="button"
                className={selectedCategoryId === "" ? "active" : ""}
                aria-pressed={selectedCategoryId === ""}
                onClick={() => {
                  setSelectedCategoryId("");
                  resetTraining();
                }}
              >
                <Signpost aria-hidden="true" />
                <span>Toutes les catégories</span>
                <span className="category-check" aria-hidden="true">
                  {selectedCategoryId === "" ? "✓" : ""}
                </span>
              </button>
              {categories.map((category) => {
                const active = selectedCategoryId === category.id;
                const Icon = getCategoryIcon(category.icon).Icon;
                return (
                  <button
                    type="button"
                    key={category.id}
                    className={active ? "active" : ""}
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedCategoryId(category.id);
                      resetTraining();
                    }}
                  >
                    <Icon aria-hidden="true" />
                    <span>{category.name}</span>
                    <span className="category-check" aria-hidden="true">
                      {active ? "✓" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="atlas-filter-section atlas-difficulty-filters">
            <h2>Difficulté</h2>
            <div>
              {difficultyOrder.map((difficulty) => (
                <button
                  type="button"
                  key={difficulty}
                  className={`${difficulty} ${
                    difficulties.has(difficulty) ? "active" : ""
                  }`}
                  aria-pressed={difficulties.has(difficulty)}
                   onClick={() => {
                     toggleDifficulty(difficulty);
                     resetTraining();
                   }}
                >
                  <span aria-hidden="true" />
                  {difficultyLabels[difficulty]}
                </button>
              ))}
            </div>
          </section>

          <section className="atlas-filter-section training-count-filter">
            <h2>Questions</h2>
            <label className="training-question-count">
              <span>Nombre de questions</span>
              <input
                type="number"
                min={1}
                max={Math.max(playableClues.length, 1)}
                value={safeQuestionCount}
                onChange={(event) => {
                  setQuestionCount(Math.max(1, Number(event.target.value) || 1));
                  resetTraining();
                }}
              />
            </label>
            <p className="atlas-state">
              Maximum actuel : {Math.max(playableClues.length, 1)}
            </p>
          </section>

          <section className="atlas-filter-section premium-upsell-card">
            <h2>Plan</h2>
            <div className="statistics-summary-list">
              <span>Offre actuelle</span>
              <strong>{formatBillingPlan(billing?.planKey ?? "free")}</strong>
              <span>Tarif premium</span>
              <strong>1,99 EUR / mois</strong>
              <span>Défi quotidien</span>
              <strong>Inclus</strong>
              <span>Classement du jour</span>
              <strong>{hasPremiumPlan ? "Débloqué" : "Inclus avec Premium"}</strong>
            </div>
            <p className="atlas-state">
              {hasPremiumPlan
                ? "Le premium actif ajoute l'XP, les rangs et le classement quotidien sur le défi officiel."
                : "Le défi quotidien reste jouable gratuitement, mais le premium active l'XP, les rangs et le classement quotidien."}
            </p>
            {!hasPremiumPlan ? (
              <Link className="text-button premium-upsell-link" to="/pricing">
                Voir l'offre à 1,99 EUR / mois
              </Link>
            ) : null}
          </section>
        </aside>

        <section className="atlas-center training-center">
          {isFinished && session ? (
            <div className="atlas-demo-notice" role="status">
              Score final : {countCorrectAnswers(session.answers)} /{" "}
              {session.questions.length}
            </div>
          ) : (
            <div className="atlas-demo-notice" role="status">
              {setupNotice}
            </div>
          )}

          <div className="atlas-map-panel training-map-panel-wrapper">
            <Suspense fallback={mapFallback}>
              <TrainingMap
                viewport={mode}
                countryCode={mode === "country" ? effectiveRegionCountryCode : null}
                markers={mapMarkers}
                selectedCode={currentAnswer?.selectedCode ?? null}
                correctCode={currentAnswer?.correctCode ?? null}
                disabled={!currentQuestion || Boolean(currentAnswer)}
                showHints={!currentQuestion}
                onSelect={(countryCode) => void submitAnswer(countryCode)}
              />
            </Suspense>

            {!currentQuestion && !isFinished ? (
              <div className="training-map-overlay">
                <strong>Préparez votre session</strong>
                <p>
                  Réglez les filtres à gauche, puis lancez l'entraînement sans
                  quitter la carte.
                </p>
              </div>
            ) : null}
            {currentQuestion && !isFinished ? (
              <div
                className={`training-map-overlay training-map-overlay-quiz ${
                  currentAnswer
                    ? currentAnswer.isCorrect
                      ? "correct"
                      : "wrong"
                    : ""
                }`}
              >
                <strong>
                  {currentAnswer
                    ? currentAnswer.isCorrect
                      ? "Réussi"
                      : "Correction affichée"
                    : "Question en cours"}
                </strong>
                <p>
                  {currentAnswer
                    ? "La carte indique maintenant la bonne zone."
                    : session?.mode === "country"
                      ? "Cliquez sur la bonne région."
                      : "Cliquez sur le bon pays."}
                </p>
              </div>
            ) : null}
          </div>

          <div className="atlas-stats training-stats">
            <article>
              <span className="stat-icon stat-icon-blue">
                <Bookmark />
              </span>
              <div>
                <span>Indices jouables</span>
                <strong>{playableClues.length}</strong>
              </div>
            </article>
            <article>
              <span className="stat-icon stat-icon-red">
                <Play />
              </span>
              <div>
                <span>Questions prévues</span>
                <strong>{safeQuestionCount}</strong>
              </div>
            </article>
          </div>
        </section>

        {isFinished && session ? (
          <aside className="atlas-details training-question-panel">
            <div className="detail-heading training-results-heading">
              <div>
                <h1>Session terminée</h1>
                <p>
                  Résultat :{" "}
                  <strong>
                    {finalScore} / {session.questions.length}
                  </strong>
                </p>
                <p className="training-timer-text">Chrono total {timer.label}</p>
              </div>
            </div>

            <section className="training-score-card" aria-label="Score final">
              <span>Bilan</span>
              <strong>{finalSuccessRate}%</strong>
              <p>
                {finalScore} bonne(s) réponse(s) sur {session.questions.length}.
              </p>
              {secondsPerQuestion !== null ? (
                <p>{secondsPerQuestion.toFixed(1)} s/question</p>
              ) : null}
            </section>

            {completedXpResult?.xpAwarded && finalRank && previousRank ? (
              <section className="detail-section" aria-label="Progression officielle">
                <h2>Progression officielle</h2>
                <div className="training-xp-delta">
                  <span>Delta XP</span>
                  <strong>{formatXpDelta(completedXpResult.xpDelta)}</strong>
                </div>
                {previousRank.key !== finalRank.key ? (
                  <p className="official-badge">
                    {completedXpResult.xpDelta >= 0
                      ? `Promotion : ${finalRank.label}`
                      : `Relégation : ${finalRank.label}`}
                  </p>
                ) : null}
                <RankProgressCard
                  className="training-rank-progress-card"
                  heading="Nouveau classement"
                  xp={completedXpResult.xpTotal}
                />
              </section>
            ) : null}

            {sessionCoachSummary ? (
              <section className="detail-section training-session-coach-card">
                <div className="training-coach-heading">
                  <div>
                    <h2>{sessionCoachSummary.title}</h2>
                    <p>{sessionCoachSummary.summary}</p>
                  </div>
                  <span className="official-badge">
                    Coach gratuit
                  </span>
                </div>
                <ul className="training-coach-list">
                  {sessionCoachSummary.highlights.map((highlight) => (
                    <li key={highlight}>{highlight}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="detail-section">
              <h2>Réponses</h2>
              <ul className="training-results-list">
                {session.answers.map((answer, index) => {
                  const question = session.questions[index];
                  return (
                    <li
                      key={`${answer.correctCode}:${index}`}
                      className={answer.isCorrect ? "correct" : "wrong"}
                    >
                      <span>
                        Question {index + 1}
                        {question ? ` - ${formatQuestionContext(question, answer)}` : ""}
                      </span>
                      <strong>
                        {answer.isCorrect ? "Réussi" : "À revoir"}
                      </strong>
                      <small>
                        Choisi :{" "}
                        {formatAnswerLabel(
                          answer.selectedCode,
                          answer.selectedLabel,
                        )}
                      </small>
                      <small>
                        Correct :{" "}
                        {formatAnswerLabel(
                          answer.correctCode,
                          answer.correctLabel,
                        )}
                      </small>
                    </li>
                  );
                })}
              </ul>
            </section>

            <button
              type="button"
              className="zoom-country-button training-next-button"
              onClick={() => resetTraining()}
            >
              Rejouer
            </button>
            {session.isRanked && session.categoryId ? (
              <Link
                className="zoom-country-button training-next-button"
                to={
                  session.challengeType === "daily" && session.challengeKey
                    ? `/leaderboard?view=today&challenge=${encodeURIComponent(session.challengeKey)}`
                    : "/leaderboard?view=global"
                }
              >
                {session.challengeType === "daily" && session.challengeKey
                  ? "Voir le classement du jour"
                  : "Voir le classement"}
              </Link>
            ) : null}
          </aside>
        ) : currentQuestion && session ? (
          <aside className="atlas-details training-question-panel">
            <div className="detail-heading training-question-heading">
              <div>
                <span className="training-step-kicker">
                  Question {session.currentIndex + 1} / {session.questions.length}
                </span>
                <h1>{formatQuestionPrompt(currentQuestion)}</h1>
                <p>
                  Catégorie : <strong>{currentQuestion.clue.categoryName}</strong>
                </p>
                <p>
                  Mode : <strong>{session.mode === "world" ? "Pays" : "Régions"}</strong>
                </p>
              </div>
              <div className="training-heading-metrics">
                <span className="training-live-score">
                  {liveScore}/{answeredCount || 0}
                </span>
                <span className="training-live-timer">Chrono {timer.label}</span>
              </div>
            </div>

            <div className="training-progress" aria-label="Progression du quiz">
              <span style={{ width: `${progressPercent}%` }} />
            </div>

            {currentQuestion.clue.imageUrl ? (
              <img
                className="atlas-clue-image"
                src={currentQuestion.clue.imageUrl}
                alt={currentQuestion.clue.imageAlt}
              />
            ) : (
              <section className="detail-section">
                <h2>Image</h2>
                <p>Image indisponible pour cet indice.</p>
              </section>
            )}

            <section className="detail-section training-instruction-card">
              <h2>Consigne</h2>
                <p>
                  {currentAnswer
                    ? currentAnswer.isCorrect
                      ? "Bonne réponse"
                      : "Mauvaise réponse"
                    : session.mode === "country"
                      ? "Cliquez sur la bonne région sur la carte."
                      : "Cliquez sur le bon pays sur la carte."}
                </p>
              </section>

            {currentAnswer ? (
              <section
                className={`detail-section detail-regions training-answer-card ${
                  currentAnswer.isCorrect ? "correct" : "wrong"
                }`}
              >
                <h2>{currentAnswer.isCorrect ? "Réponse validée" : "Correction"}</h2>
                <div>
                  <span>
                    Choisi :{" "}
                    {formatAnswerLabel(
                      currentAnswer.selectedCode,
                      currentAnswer.selectedLabel,
                    )}
                  </span>
                  <span>
                    Correct :{" "}
                    {formatAnswerLabel(
                      currentAnswer.correctCode,
                      currentAnswer.correctLabel,
                    )}
                  </span>
                </div>
              </section>
            ) : null}

            {currentAnswerXpPreview ? (
              <section className="detail-section" aria-label="XP estimée">
                <h2>XP estimée</h2>
                <div className="training-summary-grid">
                  <span>Variation</span>
                  <strong>{formatXpDelta(currentAnswerXpPreview.estimatedDelta)}</strong>
                  <span>Difficulté</span>
                  <strong>{difficultyLabels[currentAnswerXpPreview.difficulty]}</strong>
                </div>
                <p className="atlas-state">
                  Estimation locale uniquement, si la session reste classée officielle.
                </p>
              </section>
            ) : null}

            {currentCoachFeedback ? (
              <section className="detail-section training-coach-card">
                <div className="training-coach-heading">
                  <div>
                    <h2>{currentCoachFeedback.title}</h2>
                    <p>{currentCoachFeedback.summary}</p>
                  </div>
                  <span className="official-badge">
                    Coach gratuit
                  </span>
                </div>
                <ul className="training-coach-list">
                  {currentCoachFeedback.insights.map((insight) => (
                    <li key={insight}>{insight}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {startError ? (
              <p role="alert" className="atlas-state atlas-state-error">
                {startError}
              </p>
            ) : null}

            <button
              type="button"
              className="zoom-country-button training-next-button"
              onClick={() => void goToNextQuestion()}
              disabled={!currentAnswer || isCompletingSession}
            >
              {isCompletingSession ? "Finalisation..." : "Question suivante"}
            </button>
          </aside>
        ) : (
          <aside className="atlas-details training-question-panel">
            <div className="detail-heading">
              <div>
                <h1>Entraînement classique</h1>
                <p>
                  Collection :{" "}
                  <strong>{activeCollection?.name ?? "Aucune collection"}</strong>
                </p>
                <p>Accessible à tous, sans attendre le défi du jour.</p>
                {isPublicReadOnly ? (
                  <span className="official-badge">
                    <ShieldCheck aria-hidden="true" />
                    Officielle
                  </span>
                ) : null}
              </div>
            </div>

            <div className="training-readiness-card">
              <span>Session prête</span>
              <strong>{safeQuestionCount} questions</strong>
              <small>
                {playableClues.length} indice(s) jouable(s) avec les filtres actuels.
              </small>
            </div>

            {startError ? (
              <p role="alert" className="atlas-state atlas-state-error">
                {startError}
              </p>
            ) : null}

            <button
              type="button"
              className="zoom-country-button training-launch-button"
              onClick={() => void startSession()}
              disabled={!activeCollectionId || cluesQuery.isLoading}
            >
              <Play aria-hidden="true" />
              Lancer l'entraînement
            </button>

            <section className="detail-section">
              <h2>Résumé</h2>
              <div className="training-summary-grid">
                <span>Catégorie</span>
                <strong>{selectedCategory?.name ?? "Toutes les catégories"}</strong>
                <span>Mode</span>
                <strong>{mode === "world" ? "Pays" : "Régions"}</strong>
                <span>Difficultés</span>
                <strong>
                  {difficultyOrder
                    .filter((difficulty) => difficulties.has(difficulty))
                    .map((difficulty) => difficultyLabels[difficulty])
                    .join(", ")}
                </strong>
                <span>Questions</span>
                <strong>{safeQuestionCount}</strong>
                <span>Indices jouables</span>
                <strong>{playableClues.length}</strong>
              </div>
            </section>

            <section className="detail-section">
              <h2>Consigne</h2>
              <p>
                Lancez la session puis cliquez directement sur la bonne zone de
                la carte centrale. Le résultat s'affiche aussitôt, avec la bonne
                réponse en surbrillance.
              </p>
            </section>

            <section className="detail-section training-premium-preview">
              <h2>Défi quotidien avec XP</h2>
              <div className="training-summary-grid">
                <span>Défi quotidien</span>
                <strong>Inclus</strong>
                <span>Classement du jour</span>
                <strong>{hasPremiumPlan ? "Débloqué" : "Premium"}</strong>
              </div>
              {dailyChallengeQuery.isLoading ? (
                <p className="atlas-state">Chargement du défi quotidien...</p>
              ) : null}
              {dailyChallengeQuery.error ? (
                <div className="training-daily-unavailable">
                  <p className="atlas-state">
                    Le résumé du défi quotidien n'a pas pu être chargé. Vous pouvez
                    tout de même tenter un lancement direct.
                  </p>
                  <div className="training-daily-unavailable-actions">
                    <button
                      type="button"
                      className="zoom-country-button"
                      onClick={() => void startDailySession()}
                    >
                      Lancer le défi quotidien
                    </button>
                    <button
                      type="button"
                      className="zoom-country-button"
                      onClick={() => void dailyChallengeQuery.refetch()}
                    >
                      Réessayer
                    </button>
                  </div>
                </div>
              ) : null}
              {!dailyChallengeQuery.isLoading &&
              !dailyChallengeQuery.error &&
              !dailyChallenge ? (
                <p className="atlas-state">
                  Le défi quotidien n'est pas disponible pour le moment.
                </p>
              ) : null}
              {dailyChallenge ? (
                <DailyChallengeCard
                  challenge={dailyChallenge}
                  leaderboardHref={`/leaderboard?view=today&challenge=${encodeURIComponent(dailyChallenge.challengeKey)}`}
                  onStart={() => void startDailySession()}
                />
              ) : null}
              <p className="atlas-state">
                Le défi quotidien utilise toujours la même série de 10 questions pour
                tous les joueurs, avec remise à zéro à minuit heure de Paris.
              </p>
              {!hasPremiumPlan ? (
                <Link className="text-button premium-upsell-link" to="/pricing">
                  Découvrir le Premium
                </Link>
              ) : null}
            </section>
          </aside>
        )}
      </div>
      <DailyPremiumDialog
        open={isDailyPremiumDialogOpen}
        onClose={closeDailyPremiumDialog}
      />
    </main>
  );
}
