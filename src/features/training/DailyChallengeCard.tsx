import { Link } from "react-router-dom";
import { formatDailyCountdown } from "./dailyChallenge";
import type { DailyChallenge } from "./trainingApi";

export function DailyChallengeCard({
  challenge,
  onStart,
  leaderboardHref,
}: {
  challenge: DailyChallenge;
  onStart: () => void;
  leaderboardHref: string;
}) {
  const actionLabel =
    challenge.status === "in_progress" || challenge.attemptStatus === "in_progress"
      ? "Reprendre"
      : challenge.status === "completed" || challenge.attemptStatus === "completed"
        ? null
        : "Lancer";

  return (
    <section className="panel daily-challenge-card">
      <div className="daily-challenge-card__header">
        <div>
          <span className="daily-challenge-card__eyebrow">Défi officiel</span>
          <h2>Défi quotidien (classé)</h2>
        </div>
        <span className="official-badge">Officiel</span>
      </div>

      <dl className="daily-challenge-card__meta">
        <div>
          <dt>Questions</dt>
          <dd>{challenge.questionCount}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>{challenge.mode === "world" ? "Pays" : "Régions"}</dd>
        </div>
        <div>
          <dt>Nouveau défi</dt>
          <dd>{formatDailyCountdown(challenge.secondsUntilReset)}</dd>
        </div>
      </dl>

      <p className="daily-challenge-card__body">
        Un défi identique pour tous, composé d'indices issus des catégories officielles.
      </p>

      <div className="daily-challenge-card__actions">
        {actionLabel ? (
          <button className="primary-button" type="button" onClick={onStart}>
            {actionLabel}
          </button>
        ) : null}
        <Link className="secondary-button" to={leaderboardHref}>
          Classement
        </Link>
      </div>
    </section>
  );
}
