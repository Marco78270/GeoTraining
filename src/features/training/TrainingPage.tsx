import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bookmark,
  Flag,
  Globe2,
  GraduationCap,
  Map as MapIcon,
  MapPinned,
  Play,
  Search,
  ShieldCheck,
  Signpost,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth/authContext";
import { ProfileMenu } from "../admin/ProfileMenu";
import { useActiveCollection } from "../collections/activeCollectionContext";
import { collectionKeys } from "../collections/collectionKeys";
import { CollectionPicker } from "../collections/CollectionPicker";
import { TrainingMap } from "./TrainingMap";
import { getTrainingApi, type TrainingApi } from "./trainingApi";
import {
  buildTrainingQuestions,
  countCorrectAnswers,
  nextTrainingIndex,
  resolveTrainingAnswer,
  type TrainingAnswer,
  type TrainingClue,
  type TrainingDifficulty,
  type TrainingQuestion,
} from "./trainingSession";

type TrainingSessionState = {
  sessionId: string;
  mode: "world" | "country";
  questions: TrainingQuestion[];
  currentIndex: number;
  answers: TrainingAnswer[];
};

const difficultyOrder: TrainingDifficulty[] = ["easy", "medium", "expert"];
const difficultyLabels: Record<TrainingDifficulty, string> = {
  easy: "Facile",
  medium: "Moyen",
  expert: "Expert",
};
const emptyTrainingClues: TrainingClue[] = [];

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
export function TrainingPage({
  trainingApi: suppliedTrainingApi,
}: {
  trainingApi?: TrainingApi;
}) {
  const { signOut, user } = useAuth();
  const {
    collections,
    activeCollection,
    activeCollectionId,
    setActiveCollectionId,
    isLoading: collectionsLoading,
    error: collectionsError,
  } = useActiveCollection();
  const [trainingApi] = useState(() => suppliedTrainingApi ?? getTrainingApi());
  const [mode, setMode] = useState<"world" | "country">("world");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedRegionCountryCode, setSelectedRegionCountryCode] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulties, setDifficulties] = useState<Set<TrainingDifficulty>>(
    () => new Set(difficultyOrder),
  );
  const [session, setSession] = useState<TrainingSessionState | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const isPublicReadOnly = activeCollection?.visibility === "public_readonly";

  const cluesQuery = useQuery({
    queryKey: activeCollectionId
      ? [...collectionKeys.clues(activeCollectionId), "training"]
      : ["training", "inactive"],
    queryFn: () => trainingApi.loadPlayableClues(activeCollectionId!),
    enabled: Boolean(activeCollectionId),
  });

  const clues = cluesQuery.data ?? emptyTrainingClues;
  const categories = useMemo(
    () =>
      [
        ...new Map(
          clues.map((clue) => [
            clue.categoryId,
            { id: clue.categoryId, name: clue.categoryName },
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
  const isFinished = Boolean(
    session && session.currentIndex >= session.questions.length,
  );
  const selectedCategory =
    categories.find((category) => category.id === selectedCategoryId) ?? null;
  const safeQuestionCount = Math.min(
    Math.max(questionCount, 1),
    Math.max(playableClues.length, 1),
  );
  const coveredCountries = useMemo(
    () => new Set(playableClues.map((clue) => clue.countryCode)).size,
    [playableClues],
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

  function formatCountryLabel(code: string) {
    const name = countryNameByCode.get(code);
    return name ? `${name} (${code})` : code;
  }

  function formatAnswerLabel(code: string, label: string) {
    if (mode === "country") {
      return label;
    }
    return `${label} (${code})`;
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
    setSession(null);
    setStartError(null);
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
      const persisted = await trainingApi.createSession({
        collectionId: activeCollectionId,
        categoryId: selectedCategoryId || null,
        mode,
        countryCode: mode === "country" ? effectiveRegionCountryCode : null,
        totalQuestions: questions.length,
      });
      setStartError(null);
      setSession({
        sessionId: persisted.id,
        mode,
        questions,
        currentIndex: 0,
        answers: [],
      });
    } catch {
      setStartError("Impossible de lancer la session d'entraînement.");
    }
  }

  async function submitAnswer(selectedCode: string) {
    if (!session || !currentQuestion || currentAnswer) {
      return;
    }

    const selectedLabel =
      mode === "country"
        ? regionNameById.get(selectedCode) ?? selectedCode
        : countryNameByCode.get(selectedCode) ?? selectedCode;
    const answer = resolveTrainingAnswer(
      currentQuestion,
      selectedCode,
      selectedLabel,
    );
    try {
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
    if (nextIndex >= session.questions.length) {
      try {
        await trainingApi.completeSession(session.sessionId, {
          totalAnswers: session.answers.length,
          correctAnswers: countCorrectAnswers(session.answers),
        });
      } catch {
        setStartError("Impossible de finaliser la session.");
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

  return (
    <main className="app-shell training-page atlas-module-page">
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
                    <Flag aria-hidden="true" />
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
            <TrainingMap
              viewport={mode}
              countryCode={mode === "country" ? effectiveRegionCountryCode : null}
              markers={mapMarkers}
              selectedCode={currentAnswer?.selectedCode ?? null}
              correctCode={currentAnswer?.correctCode ?? null}
              disabled={!currentQuestion || Boolean(currentAnswer)}
              onSelect={(countryCode) => void submitAnswer(countryCode)}
            />

            {!currentQuestion && !isFinished ? (
              <div className="training-map-overlay">
                <strong>Préparez votre session</strong>
                <p>
                  Réglez les filtres à gauche, puis lancez l'entraînement sans
                  quitter la carte.
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
              <span className="stat-icon stat-icon-green">
                <Globe2 />
              </span>
              <div>
                <span>Pays couverts</span>
                <strong>{coveredCountries}</strong>
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
            <div className="detail-heading">
              <div>
                <h1>Session terminée</h1>
                <p>
                  Résultat :{" "}
                  <strong>
                    {countCorrectAnswers(session.answers)} /{" "}
                    {session.questions.length}
                  </strong>
                </p>
              </div>
            </div>

            <section className="detail-section">
              <h2>Réponses</h2>
              <ul className="training-results-list">
                {session.answers.map((answer, index) => (
                  <li key={`${answer.correctCode}:${index}`}>
                    {formatAnswerLabel(answer.selectedCode, answer.selectedLabel)} /{" "}
                    {formatAnswerLabel(answer.correctCode, answer.correctLabel)}
                  </li>
                ))}
              </ul>
            </section>

            <button
              type="button"
              className="zoom-country-button"
              onClick={() => setSession(null)}
            >
              Rejouer
            </button>
          </aside>
        ) : currentQuestion && session ? (
          <aside className="atlas-details training-question-panel">
            <div className="detail-heading">
              <div>
                <h1>Question {session.currentIndex + 1}</h1>
                <p>
                  Catégorie : <strong>{currentQuestion.clue.categoryName}</strong>
                </p>
                <p>
                  Mode : <strong>{session.mode === "world" ? "Pays" : "Régions"}</strong>
                </p>
              </div>
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

            <section className="detail-section">
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
              <section className="detail-section detail-regions">
                <h2>Réponse</h2>
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

            {startError ? (
              <p role="alert" className="atlas-state atlas-state-error">
                {startError}
              </p>
            ) : null}

            <button
              type="button"
              className="zoom-country-button"
              onClick={() => void goToNextQuestion()}
              disabled={!currentAnswer}
            >
              Question suivante
            </button>
          </aside>
        ) : (
          <aside className="atlas-details training-question-panel">
            <div className="detail-heading">
              <div>
                <h1>Prêt à lancer</h1>
                <p>
                  Collection :{" "}
                  <strong>{activeCollection?.name ?? "Aucune collection"}</strong>
                </p>
                {isPublicReadOnly ? (
                  <span className="official-badge">
                    <ShieldCheck aria-hidden="true" />
                    Officielle
                  </span>
                ) : null}
              </div>
            </div>

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

            <section className="detail-section detail-regions">
              <h2>{mode === "world" ? "Pays couverts" : "Régions couvertes"}</h2>
              <div>
                {mapMarkers.length > 0 ? (
                  mapMarkers.map((marker) => (
                    <span key={marker.code}>{marker.name}</span>
                  ))
                ) : (
                  <span>
                    {mode === "world"
                      ? "Aucun pays disponible"
                      : "Aucune région disponible"}
                  </span>
                )}
              </div>
            </section>

            <section className="detail-section">
              <h2>Consigne</h2>
              <p>
                Lancez la session puis cliquez sur le bon pays directement sur la
                carte centrale.
              </p>
            </section>

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
              Lancer
            </button>
          </aside>
        )}
      </div>
    </main>
  );
}
