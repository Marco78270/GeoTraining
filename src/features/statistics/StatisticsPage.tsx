import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  Bookmark,
  Brain,
  CalendarRange,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Globe2,
  GraduationCap,
  ListChecks,
  Map as MapIcon,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ProfileMenu } from "../admin/ProfileMenu";
import { useAuth } from "../auth/authContext";
import {
  formatBillingPlan,
  hasPremiumFeatureAccess,
  type BillingApi,
} from "../billing/billingApi";
import { useBillingStatus } from "../billing/useBillingStatus";
import {
  getStatisticsApi,
  type StatisticsApi,
  type StatisticsSession,
} from "./statisticsApi";

const emptyStatisticsSessions: StatisticsSession[] = [];

type MasteryStatus = "weak" | "progressing" | "mastered";

type CategoryMastery = {
  id: string;
  collectionId: string;
  label: string;
  collectionLabel: string;
  sessions: number;
  correct: number;
  answers: number;
  accuracy: number;
  recentAccuracy: number;
  previousAccuracy: number;
  trend: number;
  errors: number;
  status: MasteryStatus;
};

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatSignedPercent(value: number) {
  const rounded = Math.round(value);
  if (rounded > 0) return `+${rounded} pts`;
  return `${rounded} pts`;
}

function formatDate(value: string | null) {
  if (!value) return "En cours";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getDayKey(value: string) {
  return value.slice(0, 10);
}

function getPastDayKeys(days: number) {
  const today = new Date();
  return Array.from({ length: days }, (_, index) => {
    const value = new Date(today);
    value.setDate(today.getDate() - (days - index - 1));
    return value.toISOString().slice(0, 10);
  });
}

function getAccuracy(correct: number, answers: number) {
  return answers > 0 ? (correct / answers) * 100 : 0;
}

function getMasteryStatus(accuracy: number, answers: number): MasteryStatus {
  if (answers >= 20 && accuracy >= 80) return "mastered";
  if (answers >= 10 && accuracy >= 60) return "progressing";
  return "weak";
}

function getMasteryLabel(status: MasteryStatus) {
  if (status === "mastered") return "Maîtrisé";
  if (status === "progressing") return "En progression";
  return "À travailler";
}

function getCurrentStreak(dayKeys: string[]) {
  if (dayKeys.length === 0) return 0;
  const uniqueDays = new Set(dayKeys);
  let streak = 0;
  const cursor = new Date();

  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (!uniqueDays.has(key)) {
      if (streak === 0) {
        cursor.setDate(cursor.getDate() - 1);
        if (!uniqueDays.has(cursor.toISOString().slice(0, 10))) break;
        streak += 1;
        continue;
      }
      break;
    }
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function buildCategoryMastery(sessions: StatisticsSession[]) {
  const grouped = new Map<
    string,
    {
      id: string;
      collectionId: string;
      label: string;
      collectionLabel: string;
      sessions: StatisticsSession[];
    }
  >();

  for (const session of sessions) {
    if (!session.category_id || session.total_answers === 0) continue;
    const key = `${session.collection_id}:${session.category_id}`;
    const entry = grouped.get(key) ?? {
      id: session.category_id,
      collectionId: session.collection_id,
      label: session.categories?.name ?? "Catégorie",
      collectionLabel: session.collections?.name ?? "Collection",
      sessions: [],
    };
    entry.sessions.push(session);
    grouped.set(key, entry);
  }

  return [...grouped.values()]
    .map<CategoryMastery>((entry) => {
      const chronological = [...entry.sessions].sort(
        (left, right) =>
          new Date(left.completed_at ?? left.started_at).getTime() -
          new Date(right.completed_at ?? right.started_at).getTime(),
      );
      const splitIndex = Math.max(1, Math.floor(chronological.length / 2));
      const previous = chronological.slice(0, splitIndex);
      const recent = chronological.slice(splitIndex);
      const effectiveRecent = recent.length > 0 ? recent : previous;
      const correct = chronological.reduce(
        (sum, session) => sum + session.correct_answers,
        0,
      );
      const answers = chronological.reduce(
        (sum, session) => sum + session.total_answers,
        0,
      );
      const previousAccuracy = getAccuracy(
        previous.reduce((sum, session) => sum + session.correct_answers, 0),
        previous.reduce((sum, session) => sum + session.total_answers, 0),
      );
      const recentAccuracy = getAccuracy(
        effectiveRecent.reduce(
          (sum, session) => sum + session.correct_answers,
          0,
        ),
        effectiveRecent.reduce((sum, session) => sum + session.total_answers, 0),
      );
      const accuracy = getAccuracy(correct, answers);

      return {
        id: entry.id,
        collectionId: entry.collectionId,
        label: entry.label,
        collectionLabel: entry.collectionLabel,
        sessions: chronological.length,
        correct,
        answers,
        accuracy,
        recentAccuracy,
        previousAccuracy,
        trend: chronological.length > 1 ? recentAccuracy - previousAccuracy : 0,
        errors: answers - correct,
        status: getMasteryStatus(accuracy, answers),
      };
    })
    .sort((left, right) => left.accuracy - right.accuracy);
}

export function StatisticsPage({
  statisticsApi: suppliedApi,
  billingApi,
}: {
  statisticsApi?: StatisticsApi;
  billingApi?: BillingApi;
}) {
  const { signOut, user } = useAuth();
  const [statisticsApi] = useState(() => suppliedApi ?? getStatisticsApi());
  const billingQuery = useBillingStatus(billingApi);
  const sessionsQuery = useQuery({
    queryKey: ["statistics", "sessions"],
    queryFn: () => statisticsApi.loadSessions(),
  });
  const billing = billingQuery.data;
  const hasAdvancedStatistics = billing
    ? hasPremiumFeatureAccess(billing, "advanced_statistics")
    : false;

  const sessions = sessionsQuery.data ?? emptyStatisticsSessions;
  const metrics = useMemo(() => {
    const completed = sessions.filter((session) => Boolean(session.completed_at));
    const totalAnswers = completed.reduce(
      (sum, session) => sum + session.total_answers,
      0,
    );
    const totalCorrect = completed.reduce(
      (sum, session) => sum + session.correct_answers,
      0,
    );
    const categoryMastery = buildCategoryMastery(completed);
    const priority = categoryMastery.find((entry) => entry.status !== "mastered") ??
      categoryMastery[0] ??
      null;
    const activityDays = completed.map((session) =>
      getDayKey(session.completed_at ?? session.started_at),
    );
    const trend = getPastDayKeys(14).map((key) => {
      const sessionsForDay = completed.filter(
        (session) => getDayKey(session.completed_at ?? session.started_at) === key,
      );
      const answers = sessionsForDay.reduce(
        (sum, session) => sum + session.total_answers,
        0,
      );
      const correct = sessionsForDay.reduce(
        (sum, session) => sum + session.correct_answers,
        0,
      );
      return {
        key,
        label: new Intl.DateTimeFormat("fr-FR", {
          day: "2-digit",
          month: "2-digit",
        }).format(new Date(key)),
        answers,
        accuracy: getAccuracy(correct, answers),
      };
    });

    return {
      completedSessions: completed.length,
      totalAnswers,
      averageAccuracy: getAccuracy(totalCorrect, totalAnswers),
      currentStreak: getCurrentStreak(activityDays),
      categoryMastery,
      priority,
      trend,
      maxDailyAnswers: Math.max(...trend.map((day) => day.answers), 1),
      masteredCount: categoryMastery.filter(
        (entry) => entry.status === "mastered",
      ).length,
      totalErrors: totalAnswers - totalCorrect,
    };
  }, [sessions]);

  return (
    <main className="app-shell atlas-module-page statistics-page">
      <header className="topbar atlas-topbar">
        <Link className="brand brand-link" to="/atlas" aria-label="GeoTrainer Atlas">
          <Globe2 className="brand-globe" aria-hidden="true" />
          <strong>GeoTrainer</strong>
          <span>Atlas</span>
        </Link>
        <nav className="atlas-nav" aria-label="Navigation principale">
          <NavLink to="/atlas"><MapIcon />Atlas</NavLink>
          <NavLink to="/collections"><Bookmark />Collections</NavLink>
          <NavLink to="/training"><GraduationCap />Entraînement</NavLink>
          <NavLink to="/statistics"><BarChart3 />Statistiques</NavLink>
          <NavLink to="/leaderboard"><Trophy />Classement</NavLink>
        </nav>
        <ProfileMenu
          email={user?.email}
          onSignOut={() => void signOut()}
        />
      </header>

      <div className="collections-layout statistics-layout">
        <aside className="panel collections-sidebar statistics-sidebar">
          <p className="eyebrow">Progression</p>
          <h1>Mon entraînement</h1>
          <p className="admin-sidebar-note">
            Cette page met en avant ce qui mérite une révision, pas seulement le
            nombre de parties jouées.
          </p>

          <section className="atlas-filter-section">
            <h2>Vue rapide</h2>
            <div className="statistics-summary-list">
              <span>Précision globale</span>
              <strong>{formatPercent(metrics.averageAccuracy)}</strong>
              <span>Questions répondues</span>
              <strong>{metrics.totalAnswers}</strong>
              <span>Catégories maîtrisées</span>
              <strong>{metrics.masteredCount}/{metrics.categoryMastery.length}</strong>
              <span>Série actuelle</span>
              <strong>{metrics.currentStreak} jour(s)</strong>
            </div>
          </section>
          <section className="atlas-filter-section premium-upsell-card">
            <h2>Plan</h2>
            <div className="statistics-summary-list">
              <span>Offre actuelle</span>
              <strong>{formatBillingPlan(billing?.planKey ?? "free")}</strong>
              <span>Défi quotidien</span>
              <strong>{hasAdvancedStatistics ? "Débloqué" : "Premium"}</strong>
            </div>
            <p className="admin-sidebar-note">
              {hasAdvancedStatistics
                ? "Le premium actif débloque déjà le défi quotidien; les analyses avancées restent en préparation."
                : "Le premium actuel est centré sur le défi quotidien. Les futures analyses de cette page ne sont pas encore incluses."}
            </p>
          </section>
        </aside>

        <section className="statistics-content">
          {sessionsQuery.isLoading ? (
            <section className="panel"><p role="status">Chargement des statistiques...</p></section>
          ) : null}
          {sessionsQuery.error ? (
            <section className="panel">
              <p className="notice notice-error" role="alert">
                Impossible de charger les statistiques.
              </p>
            </section>
          ) : null}

          {!sessionsQuery.isLoading && !sessionsQuery.error ? (
            <>
              <section className="statistics-priority panel">
                <div className="statistics-priority-icon" aria-hidden="true">
                  <Brain />
                </div>
                <div className="statistics-priority-copy">
                  <span className="statistics-kicker">Priorité de révision</span>
                  {metrics.priority ? (
                    <>
                      <h2>{metrics.priority.label}</h2>
                      <p>
                        {formatPercent(metrics.priority.accuracy)} de réussite sur {metrics.priority.answers} questions,
                        avec {metrics.priority.errors} erreur(s). C’est actuellement le meilleur levier de progression.
                      </p>
                      <div className="statistics-priority-meta">
                        <span>{metrics.priority.collectionLabel}</span>
                        <span>{getMasteryLabel(metrics.priority.status)}</span>
                        <span>{formatSignedPercent(metrics.priority.trend)} récemment</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <h2>Commence une première session</h2>
                      <p>Quelques réponses suffisent pour construire une recommandation personnalisée.</p>
                    </>
                  )}
                </div>
                <Link
                  className="statistics-review-button"
                  to={
                    metrics.priority
                      ? `/training?collection=${encodeURIComponent(metrics.priority.collectionId)}&category=${encodeURIComponent(metrics.priority.id)}`
                      : "/training"
                  }
                >
                  Réviser maintenant <ArrowRight aria-hidden="true" />
                </Link>
              </section>

              <div className="atlas-stats statistics-cards">
                <article>
                  <span className="stat-icon stat-icon-blue"><ListChecks /></span>
                  <div><span>Sessions terminées</span><strong>{metrics.completedSessions}</strong></div>
                </article>
                <article>
                  <span className="stat-icon stat-icon-green"><CheckCircle2 /></span>
                  <div><span>Catégories maîtrisées</span><strong>{metrics.masteredCount}</strong></div>
                </article>
                <article>
                  <span className="stat-icon stat-icon-red"><CircleAlert /></span>
                  <div><span>Erreurs à travailler</span><strong>{metrics.totalErrors}</strong></div>
                </article>
              </div>

              <section className="panel statistics-mastery-panel">
                <div className="detail-heading">
                  <div>
                    <h2>Maîtrise par catégorie</h2>
                    <p>Les catégories les plus faibles apparaissent en premier.</p>
                  </div>
                  <span className="official-badge statistics-mini-badge">
                    <Target aria-hidden="true" />Objectif 80%
                  </span>
                </div>
                {metrics.categoryMastery.length === 0 ? (
                  <p className="atlas-state">Les catégories apparaîtront après tes premières sessions terminées.</p>
                ) : (
                  <div className="statistics-mastery-list">
                    {metrics.categoryMastery.map((entry) => {
                      const TrendIcon = entry.trend >= 0 ? TrendingUp : TrendingDown;
                      return (
                        <article key={`${entry.collectionId}:${entry.id}`} className={`statistics-mastery-card ${entry.status}`}>
                          <div className="statistics-mastery-main">
                            <strong>{entry.label}</strong>
                            <span>{entry.collectionLabel} · {entry.answers} questions</span>
                          </div>
                          <div className="statistics-mastery-progress">
                            <div><span style={{ width: `${entry.accuracy}%` }} /></div>
                            <strong>{formatPercent(entry.accuracy)}</strong>
                          </div>
                          <span className={`statistics-mastery-status ${entry.status}`}>
                            {getMasteryLabel(entry.status)}
                          </span>
                          <span className={`statistics-mastery-trend ${entry.trend < 0 ? "down" : ""}`}>
                            <TrendIcon aria-hidden="true" />{formatSignedPercent(entry.trend)}
                          </span>
                          <Link
                            className="statistics-mastery-action"
                            aria-label={`Réviser ${entry.label}`}
                            to={`/training?collection=${encodeURIComponent(entry.collectionId)}&category=${encodeURIComponent(entry.id)}`}
                          >
                            <ArrowRight aria-hidden="true" />
                          </Link>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="panel statistics-trend-panel">
                <div className="detail-heading">
                  <div>
                    <h2>Rythme sur 14 jours</h2>
                    <p>Volume quotidien et précision obtenue.</p>
                  </div>
                  <span className="official-badge statistics-mini-badge">
                    <CalendarRange aria-hidden="true" />14 jours
                  </span>
                </div>
                <div className="statistics-trend-chart" aria-label="Tendance récente">
                  {metrics.trend.map((day) => (
                    <article key={day.key} className="statistics-trend-day">
                      <span className="statistics-trend-label">{day.label}</span>
                      <div className="statistics-trend-bar-shell">
                        <div
                          className="statistics-trend-bar"
                          style={{
                            height: `${Math.max(
                              (day.answers / metrics.maxDailyAnswers) * 100,
                              day.answers > 0 ? 8 : 0,
                            )}%`,
                          }}
                        />
                      </div>
                      <strong>{day.answers}</strong>
                      <span className="statistics-trend-meta">
                        {day.answers > 0 ? formatPercent(day.accuracy) : "-"}
                      </span>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel statistics-premium-panel">
                <div className="detail-heading">
                  <div>
                    <h2>Roadmap analyses</h2>
                    <p>
                      Cette zone montre ce qui est prévu ensuite, sans le présenter
                      comme déjà inclus dans l'offre premium actuelle.
                    </p>
                  </div>
                  <span className="official-badge statistics-mini-badge">
                    <Brain aria-hidden="true" />
                    Roadmap
                  </span>
                </div>
                <div
                  className={`statistics-premium-grid ${
                    hasAdvancedStatistics ? "enabled" : "locked"
                  }`}
                >
                  <article>
                    <strong>Comparaison 30 jours</strong>
                    <span>Comparer précision, volume et régularité sur une période plus longue.</span>
                  </article>
                  <article>
                    <strong>Catégories qui régressent</strong>
                    <span>Détecter les zones qui glissent avant qu'elles ne deviennent un vrai point faible.</span>
                  </article>
                  <article>
                    <strong>Révision intelligente</strong>
                    <span>Prioriser les prochaines sessions selon le meilleur gain pédagogique attendu.</span>
                  </article>
                </div>
              </section>

              <section className="panel">
                <div className="detail-heading">
                  <div><h2>Dernières sessions</h2><p>Les résultats les plus récents.</p></div>
                  <Clock3 aria-hidden="true" />
                </div>
                {sessions.length === 0 ? (
                  <p className="atlas-state">Aucune session enregistrée pour le moment.</p>
                ) : (
                  <div className="statistics-session-list">
                    {sessions.slice(0, 6).map((session) => (
                      <article key={session.id} className="statistics-session-card">
                        <div>
                          <strong>{session.categories?.name ?? "Toutes les catégories"}</strong>
                          <span>{session.collections?.name ?? "Collection"}</span>
                        </div>
                        <div>
                          <strong>{session.correct_answers}/{session.total_answers}</strong>
                          <span>{formatPercent(getAccuracy(session.correct_answers, session.total_answers))}</span>
                        </div>
                        <time>{formatDate(session.completed_at ?? session.started_at)}</time>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
