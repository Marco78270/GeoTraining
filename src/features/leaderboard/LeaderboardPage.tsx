import { useQuery } from "@tanstack/react-query";
import { BarChart3, Bookmark, Globe2, GraduationCap, Map as MapIcon, Trophy } from "lucide-react";
import { Link, NavLink, useSearchParams } from "react-router-dom";
import { ProfileMenu } from "../admin/ProfileMenu";
import { useAuth } from "../auth/authContext";
import { getRankForXp } from "../ranking/rankProgression";
import { RankBadge } from "../ranking/RankBadge";
import {
  getLeaderboardApi,
  type DailyLeaderboardEntry,
  type GlobalLeaderboardEntry,
  type LeaderboardApi,
} from "./leaderboardApi";

type View = "today" | "global";

function parisDay() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatPercent(value: number | null) {
  return value == null ? "-" : `${value.toFixed(1)} %`;
}

function formatDuration(value: number | null) {
  if (value == null) return "-";
  const seconds = Math.round(value / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /function .* does not exist|permission denied/i.test(message)
    ? "Le backend Supabase du classement n'est pas encore actif sur ce projet."
    : "Impossible de charger le classement.";
}

function Avatar({ entry }: { entry: DailyLeaderboardEntry | GlobalLeaderboardEntry }) {
  return entry.avatarUrl ? (
    <img className="leaderboard-avatar leaderboard-avatar-sm" src={entry.avatarUrl} alt="" loading="lazy" />
  ) : (
    <span className="leaderboard-avatar leaderboard-avatar-fallback leaderboard-avatar-sm" aria-hidden="true">
      {entry.username.charAt(0).toUpperCase()}
    </span>
  );
}

function Player({ entry }: { entry: DailyLeaderboardEntry | GlobalLeaderboardEntry }) {
  const rank = getRankForXp(entry.xpTotal);
  return (
    <div className="leaderboard-player">
      <Avatar entry={entry} />
      <div className="leaderboard-player-copy">
        <strong>{entry.username}</strong>
        <span className="leaderboard-rank-badge">
          <RankBadge rankKey={rank.key} label={rank.label} size="compact" />
          <span>{rank.label}</span>
        </span>
      </div>
    </div>
  );
}

export function LeaderboardPage({ leaderboardApi = getLeaderboardApi() }: { leaderboardApi?: LeaderboardApi }) {
  const { signOut, user } = useAuth();
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "global" ? "global" : "today";
  const challengeKey = params.get("challenge") || parisDay();
  const page = Math.max(1, Number(params.get("page")) || 1);

  const dailyEntriesQuery = useQuery({
    queryKey: ["leaderboard", "today", challengeKey, page],
    queryFn: () => leaderboardApi.listDaily(challengeKey, page, 25),
    enabled: view === "today",
  });
  const globalEntriesQuery = useQuery({
    queryKey: ["leaderboard", "global", page],
    queryFn: () => leaderboardApi.listGlobal(page, 25),
    enabled: view === "global",
  });
  const dailyProgressQuery = useQuery({
    queryKey: ["leaderboard", "today", "progress", challengeKey, user?.id],
    queryFn: () => leaderboardApi.loadMyDailyProgress(challengeKey),
    enabled: Boolean(user?.id && view === "today"),
  });
  const globalProgressQuery = useQuery({
    queryKey: ["leaderboard", "global", "progress", user?.id],
    queryFn: () => leaderboardApi.loadMyGlobalProgress(),
    enabled: Boolean(user?.id && view === "global"),
  });

  const entriesQuery = view === "today" ? dailyEntriesQuery : globalEntriesQuery;
  const progressQuery = view === "today" ? dailyProgressQuery : globalProgressQuery;
  const entries: Array<DailyLeaderboardEntry | GlobalLeaderboardEntry> = entriesQuery.data?.entries ?? [];
  const totalCount = entriesQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / 25));
  const dailyProgress = view === "today" ? dailyProgressQuery.data : null;
  const globalProgress = view === "global" ? globalProgressQuery.data : null;

  function navigate(nextView: View, nextPage = 1) {
    const next = new URLSearchParams({ view: nextView, page: String(nextPage) });
    if (nextView === "today") next.set("challenge", challengeKey);
    setParams(next, { replace: true });
  }

  return (
    <main className="app-shell atlas-module-page leaderboard-page-shell">
      <header className="topbar atlas-topbar">
        <Link className="brand brand-link" to="/atlas" aria-label="GeoTrainer Atlas">
          <Globe2 className="brand-globe" aria-hidden="true" /><strong>GeoTrainer</strong><span>Atlas</span>
        </Link>
        <nav className="atlas-nav" aria-label="Navigation principale">
          <NavLink to="/atlas"><MapIcon />Atlas</NavLink>
          <NavLink to="/collections"><Bookmark />Collections</NavLink>
          <NavLink to="/training"><GraduationCap />Entraînement</NavLink>
          <NavLink to="/statistics"><BarChart3 />Statistiques</NavLink>
          <NavLink to="/leaderboard"><Trophy />Classement</NavLink>
        </nav>
        <ProfileMenu email={user?.email} onSignOut={() => void signOut()} />
      </header>

      <div className="collections-layout leaderboard-layout">
        <aside className="panel collections-sidebar leaderboard-sidebar">
          <p className="eyebrow">Compétition officielle</p>
          <h1>Classement</h1>
          <p className="admin-sidebar-note">
            Le défi quotidien mélange 10 indices publics identiques pour tous les joueurs.
          </p>
          <div className="leaderboard-view-tabs" role="tablist" aria-label="Période du classement">
            <button role="tab" aria-selected={view === "today"} className={view === "today" ? "is-active" : ""} onClick={() => navigate("today")}>Aujourd'hui</button>
            <button role="tab" aria-selected={view === "global"} className={view === "global" ? "is-active" : ""} onClick={() => navigate("global")}>Général</button>
          </div>

          <section className="atlas-filter-section leaderboard-progress-card">
            <h2>Votre résultat</h2>
            {progressQuery.isLoading ? <p>Chargement...</p> : null}
            {progressQuery.error ? <p className="notice notice-error">{errorMessage(progressQuery.error)}</p> : null}
            {dailyProgress ? (
              <div className="statistics-summary-list leaderboard-summary-list">
                <span>Rang</span><strong>{dailyProgress.rank ?? "-"}</strong>
                <span>Bonnes réponses</span><strong>{dailyProgress.correctAnswers ?? 0} / 10</strong>
                <span>Chrono</span><strong>{formatDuration(dailyProgress.durationMs)}</strong>
                <span>Points</span><strong>{dailyProgress.dailyPoints ?? 0}</strong>
              </div>
            ) : null}
            {globalProgress ? (
              <div className="statistics-summary-list leaderboard-summary-list">
                <span>Rang</span><strong>{globalProgress.rank ?? "-"}</strong>
                <span>Points cumulés</span><strong>{globalProgress.totalPoints}</strong>
                <span>Défis terminés</span><strong>{globalProgress.participationCount}</strong>
                <span>Précision</span><strong>{formatPercent(globalProgress.accuracyPercent)}</strong>
              </div>
            ) : null}
            {!progressQuery.isLoading && !progressQuery.error && !progressQuery.data ? (
              <p className="atlas-state">Terminez un défi premium pour apparaître ici.</p>
            ) : null}
          </section>
        </aside>

        <section className="leaderboard-content">
          <section className="panel leaderboard-hero">
            <div className="leaderboard-hero-copy">
              <span className="statistics-kicker">{view === "today" ? `Défi du ${challengeKey}` : "Saison complète"}</span>
              <h2>{view === "today" ? "Classement du jour" : "Classement général"}</h2>
              <p>{view === "today"
                ? "Une réponse correcte vaut toujours plus que le bonus de vitesse."
                : "Les points de tous vos défis quotidiens premium sont cumulés."}</p>
            </div>
            <Trophy className="leaderboard-hero-icon" aria-hidden="true" />
          </section>

          <section className="panel leaderboard-table-panel">
            <div className="detail-heading"><div><h2>Joueurs classés</h2><p>{totalCount} participant(s)</p></div></div>
            {entriesQuery.isLoading ? <p role="status">Chargement du classement...</p> : null}
            {entriesQuery.error ? <p role="alert" className="notice notice-error">{errorMessage(entriesQuery.error)}</p> : null}
            {!entriesQuery.isLoading && !entriesQuery.error && entries.length === 0 ? <p className="atlas-state">Aucun résultat classé pour le moment.</p> : null}
            {entries.length > 0 ? (
              <>
                <div className="leaderboard-table-wrapper">
                  <table className="leaderboard-table">
                    <thead><tr><th>Rang</th><th>Joueur</th><th>{view === "today" ? "Score" : "Points"}</th><th>Précision</th><th>{view === "today" ? "Chrono" : "Défis"}</th></tr></thead>
                    <tbody>{entries.map((entry) => {
                      const daily = view === "today" ? entry as DailyLeaderboardEntry : null;
                      const global = view === "global" ? entry as GlobalLeaderboardEntry : null;
                      return <tr key={entry.userId} className={entry.userId === user?.id ? "is-current-user" : ""}>
                        <td data-label="Rang">#{entry.rank}</td>
                        <td data-label="Joueur"><Player entry={entry} /></td>
                        <td data-label={view === "today" ? "Score" : "Points"}>{daily ? `${daily.correctAnswers} / 10` : global?.totalPoints}</td>
                        <td data-label="Précision">{formatPercent(entry.accuracyPercent)}</td>
                        <td data-label={view === "today" ? "Chrono" : "Défis"}>{daily ? formatDuration(daily.durationMs) : global?.participationCount}</td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>
                <div className="leaderboard-pagination">
                  <button className="secondary-button" disabled={page <= 1} onClick={() => navigate(view, page - 1)}>Page précédente</button>
                  <span>Page {page} / {totalPages}</span>
                  <button className="secondary-button" disabled={page >= totalPages} onClick={() => navigate(view, page + 1)}>Page suivante</button>
                </div>
              </>
            ) : null}
          </section>
        </section>
      </div>
    </main>
  );
}
