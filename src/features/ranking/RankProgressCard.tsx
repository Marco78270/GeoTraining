import { getNextRankProgress } from "./rankProgression";
import { RankBadge } from "./RankBadge";

export function RankProgressCard({
  xp,
  className = "",
  heading = "Progression",
}: {
  xp: number;
  className?: string;
  heading?: string;
}) {
  const progress = getNextRankProgress(xp);
  const progressLabel = progress.nextLabel
    ? `Progression vers ${progress.nextLabel}`
    : "Rang maximum atteint";

  return (
    <section className={`rank-progress-card ${className}`.trim()}>
      <RankBadge
        rankKey={progress.currentKey}
        label={progress.currentLabel}
        size="large"
      />
      <div className="rank-progress-card__content">
        <span className="rank-progress-card__eyebrow">{heading}</span>
        <h2>{progress.currentLabel}</h2>
        <span className="rank-progress-card__xp-label">XP totale</span>
        <strong className="rank-progress-card__xp">{progress.currentXp} XP</strong>
        <div
          aria-label={progressLabel}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(progress.progressPercent)}
          className="rank-progress-card__bar"
          role="progressbar"
        >
          <span style={{ width: `${progress.progressPercent}%` }} />
        </div>
        <p className="rank-progress-card__remaining">
          {progress.nextLabel
            ? `${progress.remainingXp} XP avant ${progress.nextLabel}`
            : "Rang maximum atteint"}
        </p>
      </div>
    </section>
  );
}
