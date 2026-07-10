import { useId, type CSSProperties } from "react";
import type { RankKey, RankTier } from "./rankProgression";
import { getRankVisual } from "./rankVisuals";

export type RankBadgeSize = "compact" | "medium" | "large";

export function RankBadge({
  rankKey,
  label,
  size = "medium",
  className = "",
}: {
  rankKey: RankKey;
  label: RankTier;
  size?: RankBadgeSize;
  className?: string;
}) {
  const visual = getRankVisual(rankKey);
  const gradientId = `rank-glow-${useId().replaceAll(":", "")}`;
  const style = {
    "--rank-primary": visual.primary,
    "--rank-secondary": visual.secondary,
    "--rank-glow": visual.glow,
  } as CSSProperties;

  return (
    <svg
      aria-label={`Rang ${label}`}
      className={`rank-badge rank-badge--${size} rank-badge--${visual.family} ${className}`.trim()}
      role="img"
      style={style}
      viewBox="0 0 120 136"
    >
      <defs>
        <radialGradient id={gradientId} cx="50%" cy="42%" r="58%">
          <stop offset="0" stopColor="var(--rank-glow)" stopOpacity="0.88" />
          <stop offset="0.54" stopColor="var(--rank-primary)" stopOpacity="0.38" />
          <stop offset="1" stopColor="var(--rank-secondary)" stopOpacity="0.06" />
        </radialGradient>
      </defs>

      <path
        className="rank-badge-frame"
        d="M60 4 104 20v49c0 28-17 50-44 63C33 119 16 97 16 69V20Z"
      />
      <path
        className="rank-badge-inner"
        d="M60 12 96 25v43c0 23-13 42-36 54-23-12-36-31-36-54V25Z"
        fill={`url(#${gradientId})`}
      />

      <circle className="rank-badge-globe" cx="60" cy="62" r="27" />
      <ellipse className="rank-badge-grid" cx="60" cy="62" rx="12" ry="27" />
      <path className="rank-badge-grid" d="M34 55h52M34 69h52" />
      <path className="rank-badge-grid" d="M40 43c10 8 30 8 40 0M40 81c10-8 30-8 40 0" />
      <path
        className="rank-badge-pin"
        d="M60 29c-9 0-16 7-16 16 0 12 16 27 16 27s16-15 16-27c0-9-7-16-16-16Zm0 22a6 6 0 1 1 0-12 6 6 0 0 1 0 12Z"
      />

      <g className="rank-badge-ornaments" aria-hidden="true">
        {Array.from({ length: visual.ornamentCount }, (_, index) => {
          const center = (visual.ornamentCount - 1) / 2;
          const x = 60 + (index - center) * 17;
          return (
            <path
              data-rank-ornament
              d={`M${x} 103l6 6-6 6-6-6Z`}
              key={x}
            />
          );
        })}
      </g>
    </svg>
  );
}
