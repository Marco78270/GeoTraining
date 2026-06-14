import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bookmark,
  CalendarRange,
  Flame,
  Globe2,
  GraduationCap,
  ListChecks,
  Map as MapIcon,
  Target,
  Trophy,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ProfileMenu } from "../admin/ProfileMenu";
import { useAuth } from "../auth/authContext";
import {
  getStatisticsApi,
  type StatisticsApi,
  type StatisticsSession,
} from "./statisticsApi";

const emptyStatisticsSessions: StatisticsSession[] = [];

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
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
        const previousKey = cursor.toISOString().slice(0, 10);
        if (!uniqueDays.has(previousKey)) {
          break;
        }
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

function getBestStreak(dayKeys: string[]) {
  const sorted = [...new Set(dayKeys)].sort();
  if (sorted.length === 0) return 0;

  let best = 1;
  let current = 1;

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = new Date(sorted[index - 1]);
    const next = new Date(sorted[index]);
    const diffInDays = Math.round(
      (next.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffInDays === 1) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }

  return best;
}

export function StatisticsPage({
  statisticsApi: suppliedApi,
}: {
  statisticsApi?: StatisticsApi;
}) {
  const { signOut, user } = useAuth();
  const [statisticsApi] = useState(() => suppliedApi ?? getStatisticsApi());
  const sessionsQuery = useQuery({
    queryKey: ["statistics", "sessions"],
    queryFn: () => statisticsApi.loadSessions(),
  });

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
    const averageAccuracy =
      totalAnswers > 0 ? (totalCorrect / totalAnswers) * 100 : 0;
    const bestSession = completed.reduce<typeof completed[number] | null>(
      (best, session) =>
        !best ||
        session.correct_answers / Math.max(session.total_answers, 1) >
          best.correct_answers / Math.max(best.total_answers, 1)
          ? session
          : best,
      null,
    );

    const activityDays = completed.map((session) =>
      getDayKey(session.completed_at ?? session.started_at),
    );

    const byCategory = new globalThis.Map<
      string,
      { label: string; sessions: number; correct: number; answers: number }
    >();
    const byCollection = new globalThis.Map<
      string,
      { label: string; sessions: number; correct: number; answers: number }
    >();

    for (const session of completed) {
      const categoryKey = session.category_id ?? "all";
      const categoryEntry = byCategory.get(categoryKey) ?? {
        label: session.categories?.name ?? "Toutes les catégories",
        sessions: 0,
        correct: 0,
        answers: 0,
      };
      categoryEntry.sessions += 1;
      categoryEntry.correct += session.correct_answers;
      categoryEntry.answers += session.total_answers;
      byCategory.set(categoryKey, categoryEntry);

      const collectionKey = session.collection_id;
      const collectionEntry = byCollection.get(collectionKey) ?? {
        label: session.collections?.name ?? "Collection",
        sessions: 0,
        correct: 0,
        answers: 0,
      };
      collectionEntry.sessions += 1;
      collectionEntry.correct += session.correct_answers;
      collectionEntry.answers += session.total_answers;
      byCollection.set(collectionKey, collectionEntry);
    }

    const categoryBreakdown = [...byCategory.values()]
      .map((entry) => ({
        ...entry,
        accuracy: entry.answers > 0 ? (entry.correct / entry.answers) * 100 : 0,
      }))
      .sort((left, right) => right.sessions - left.sessions)
      .slice(0, 5);

    const collectionBreakdown = [...byCollection.values()]
      .map((entry) => ({
        ...entry,
        accuracy: entry.answers > 0 ? (entry.correct / entry.answers) * 100 : 0,
      }))
      .sort((left, right) => right.sessions - left.sessions)
      .slice(0, 5);

    const trendKeys = getPastDayKeys(7);
    const trend = trendKeys.map((key) => {
      const sessionsForDay = completed.filter((session) =>
        getDayKey(session.completed_at ?? session.started_at) === key,
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
        label: new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(
          new Date(key),
        ),
        sessions: sessionsForDay.length,
        accuracy: answers > 0 ? (correct / answers) * 100 : 0,
      };
    });

    return {
      totalSessions: sessions.length,
      completedSessions: completed.length,
      averageAccuracy,
      totalAnswers,
      totalCorrect,
      bestSession,
      categoryBreakdown,
      collectionBreakdown,
      currentStreak: getCurrentStreak(activityDays),
      bestStreak: getBestStreak(activityDays),
      activeDays: new Set(activityDays).size,
      trend,
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

      <div className="collections-layout statistics-layout">
        <aside className="panel collections-sidebar statistics-sidebar">
          <p className="eyebrow">Progression</p>
          <h1>Statistiques</h1>
          <p className="admin-sidebar-note">
            Une lecture plus claire de ta régularité, de ta précision et des
            collections où tu progresses le plus vite.
          </p>

          <section className="atlas-filter-section">
            <h2>Résumé</h2>
            <div className="statistics-summary-list">
              <span>Sessions jouées</span>
              <strong>{metrics.totalSessions}</strong>
              <span>Sessions terminées</span>
              <strong>{metrics.completedSessions}</strong>
              <span>Réponses validées</span>
              <strong>{metrics.totalAnswers}</strong>
              <span>Jours actifs</span>
              <strong>{metrics.activeDays}</strong>
            </div>
          </section>

          <section className="atlas-filter-section">
            <h2>Séries</h2>
            <div className="statistics-summary-list">
              <span>Série actuelle</span>
              <strong>{metrics.currentStreak} jour(x)</strong>
              <span>Meilleure série</span>
              <strong>{metrics.bestStreak} jour(x)</strong>
            </div>
          </section>
        </aside>

        <section className="statistics-content">
          {sessionsQuery.isLoading ? (
            <section className="panel">
              <p role="status">Chargement des statistiques...</p>
            </section>
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
              <div className="atlas-stats statistics-cards">
                <article>
                  <span className="stat-icon stat-icon-blue">
                    <ListChecks />
                  </span>
                  <div>
                    <span>Sessions terminées</span>
                    <strong>{metrics.completedSessions}</strong>
                  </div>
                </article>
                <article>
                  <span className="stat-icon stat-icon-green">
                    <Target />
                  </span>
                  <div>
                    <span>Précision moyenne</span>
                    <strong>{formatPercent(metrics.averageAccuracy)}</strong>
                  </div>
                </article>
                <article>
                  <span className="stat-icon stat-icon-red">
                    <Trophy />
                  </span>
                  <div>
                    <span>Meilleure session</span>
                    <strong>
                      {metrics.bestSession
                        ? `${metrics.bestSession.correct_answers}/${metrics.bestSession.total_answers}`
                        : "-"}
                    </strong>
                  </div>
                </article>
              </div>

              <div className="statistics-grid statistics-grid-wide">
                <section className="panel">
                  <div className="detail-heading">
                    <div>
                      <h2>Rythme récent</h2>
                      <p>Activité sur les 7 derniers jours.</p>
                    </div>
                    <span className="official-badge statistics-mini-badge">
                      <CalendarRange aria-hidden="true" />
                      7 jours
                    </span>
                  </div>
                  <div className="statistics-trend-chart" aria-label="Tendance récente">
                    {metrics.trend.map((day) => (
                      <article key={day.key} className="statistics-trend-day">
                        <span className="statistics-trend-label">{day.label}</span>
                        <div className="statistics-trend-bar-shell">
                          <div
                            className="statistics-trend-bar"
                            style={{ height: `${Math.max(day.sessions * 24, 10)}px` }}
                          />
                        </div>
                        <strong>{day.sessions}</strong>
                        <span className="statistics-trend-meta">
                          {day.sessions > 0 ? formatPercent(day.accuracy) : "-"}
                        </span>
                      </article>
                    ))}
                  </div>
                </section>
              </div>

              <div className="statistics-grid">
                <section className="panel">
                  <div className="detail-heading">
                    <div>
                      <h2>Dernières sessions</h2>
                      <p>Les entraînements les plus récents.</p>
                    </div>
                  </div>
                  {sessions.length === 0 ? (
                    <p className="atlas-state">Aucune session enregistrée pour le moment.</p>
                  ) : (
                    <div className="statistics-session-list">
                      {sessions.slice(0, 8).map((session) => {
                        const accuracy =
                          session.total_answers > 0
                            ? (session.correct_answers / session.total_answers) * 100
                            : 0;
                        return (
                          <article key={session.id} className="statistics-session-card">
                            <div>
                              <strong>{session.collections?.name ?? "Collection"}</strong>
                              <span>
                                {session.categories?.name ?? "Toutes les catégories"}
                              </span>
                            </div>
                            <div>
                              <strong>
                                {session.correct_answers}/{session.total_answers}
                              </strong>
                              <span>{formatPercent(accuracy)}</span>
                            </div>
                            <time>{formatDate(session.completed_at ?? session.started_at)}</time>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="panel">
                  <div className="detail-heading">
                    <div>
                      <h2>Par catégorie</h2>
                      <p>Les catégories les plus travaillées.</p>
                    </div>
                  </div>
                  {metrics.categoryBreakdown.length === 0 ? (
                    <p className="atlas-state">
                      Les catégories apparaîtront après tes premières sessions.
                    </p>
                  ) : (
                    <div className="statistics-breakdown-list">
                      {metrics.categoryBreakdown.map((entry) => (
                        <article key={entry.label} className="statistics-breakdown-card">
                          <div>
                            <strong>{entry.label}</strong>
                            <span>{entry.sessions} session(s)</span>
                          </div>
                          <div>
                            <strong>{formatPercent(entry.accuracy)}</strong>
                            <span>
                              {entry.correct}/{entry.answers} bonnes réponses
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="panel">
                  <div className="detail-heading">
                    <div>
                      <h2>Par collection</h2>
                      <p>Les espaces où tu t'entraînes le plus.</p>
                    </div>
                  </div>
                  {metrics.collectionBreakdown.length === 0 ? (
                    <p className="atlas-state">
                      Les collections apparaîtront après tes premières sessions.
                    </p>
                  ) : (
                    <div className="statistics-breakdown-list">
                      {metrics.collectionBreakdown.map((entry) => (
                        <article key={entry.label} className="statistics-breakdown-card">
                          <div>
                            <strong>{entry.label}</strong>
                            <span>{entry.sessions} session(s)</span>
                          </div>
                          <div>
                            <strong>{formatPercent(entry.accuracy)}</strong>
                            <span>
                              {entry.correct}/{entry.answers} bonnes réponses
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="panel statistics-highlight-panel">
                  <div className="detail-heading">
                    <div>
                      <h2>Lecture rapide</h2>
                      <p>Quelques repères pour la suite.</p>
                    </div>
                    <span className="official-badge statistics-mini-badge">
                      <Flame aria-hidden="true" />
                      Coaching
                    </span>
                  </div>
                  <div className="statistics-highlight-list">
                    <article>
                      <strong>
                        {metrics.averageAccuracy >= 80
                          ? "Très bon niveau actuel"
                          : metrics.averageAccuracy >= 60
                            ? "Bonne base à stabiliser"
                            : "Base en construction"}
                      </strong>
                      <p>
                        {metrics.averageAccuracy >= 80
                          ? "Ta précision moyenne est déjà solide. Le prochain levier sera la régularité."
                          : metrics.averageAccuracy >= 60
                            ? "Tu tiens un niveau cohérent. Quelques sessions ciblées peuvent faire monter la courbe vite."
                            : "Le plus rentable maintenant est d'enchaîner des sessions courtes et fréquentes."}
                      </p>
                    </article>
                    <article>
                      <strong>Collection à travailler</strong>
                      <p>
                        {metrics.collectionBreakdown[0]
                          ? `Tu joues surtout sur ${metrics.collectionBreakdown[0].label}. C'est un bon candidat pour des objectifs plus fins.`
                          : "Dès que tu auras plusieurs sessions, cette zone te suggérera où concentrer tes efforts."}
                      </p>
                    </article>
                  </div>
                </section>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
