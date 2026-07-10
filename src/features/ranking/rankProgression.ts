export type RankKey =
  | "bronze_3"
  | "bronze_2"
  | "bronze_1"
  | "argent_3"
  | "argent_2"
  | "argent_1"
  | "or_3"
  | "or_2"
  | "or_1"
  | "diamant_3"
  | "diamant_2"
  | "diamant_1"
  | "master_3"
  | "master_2"
  | "master_1"
  | "grand_master_3"
  | "grand_master_2"
  | "grand_master_1";

export type RankTier =
  | "Bronze III"
  | "Bronze II"
  | "Bronze I"
  | "Argent III"
  | "Argent II"
  | "Argent I"
  | "Or III"
  | "Or II"
  | "Or I"
  | "Diamant III"
  | "Diamant II"
  | "Diamant I"
  | "Master III"
  | "Master II"
  | "Master I"
  | "Grand Master III"
  | "Grand Master II"
  | "Grand Master I";

export type RankDefinition = {
  readonly key: RankKey;
  readonly label: RankTier;
  readonly minXp: number;
};

export type NextRankProgress = {
  currentKey: RankKey;
  currentLabel: RankTier;
  nextKey: RankKey | null;
  nextLabel: RankTier | null;
  progressPercent: number;
  currentXp: number;
  nextXp: number | null;
  remainingXp: number;
};

const rankThresholdValues = [
  { key: "bronze_3", label: "Bronze III", minXp: 0 },
  { key: "bronze_2", label: "Bronze II", minXp: 120 },
  { key: "bronze_1", label: "Bronze I", minXp: 260 },
  { key: "argent_3", label: "Argent III", minXp: 480 },
  { key: "argent_2", label: "Argent II", minXp: 760 },
  { key: "argent_1", label: "Argent I", minXp: 1100 },
  { key: "or_3", label: "Or III", minXp: 1500 },
  { key: "or_2", label: "Or II", minXp: 2000 },
  { key: "or_1", label: "Or I", minXp: 2600 },
  { key: "diamant_3", label: "Diamant III", minXp: 3300 },
  { key: "diamant_2", label: "Diamant II", minXp: 4100 },
  { key: "diamant_1", label: "Diamant I", minXp: 5000 },
  { key: "master_3", label: "Master III", minXp: 6200 },
  { key: "master_2", label: "Master II", minXp: 7600 },
  { key: "master_1", label: "Master I", minXp: 9200 },
  { key: "grand_master_3", label: "Grand Master III", minXp: 11000 },
  { key: "grand_master_2", label: "Grand Master II", minXp: 13000 },
  { key: "grand_master_1", label: "Grand Master I", minXp: 15500 },
] as const satisfies readonly RankDefinition[];

export const rankThresholds = Object.freeze(
  rankThresholdValues.map((rank) => Object.freeze({ ...rank })),
) as readonly RankDefinition[];

function cloneRank(rank: RankDefinition): RankDefinition {
  return { ...rank };
}

export function clampXp(xp: number) {
  if (!Number.isFinite(xp)) {
    return 0;
  }

  return Math.max(0, Math.trunc(xp));
}

export function getRankForXp(xp: number): RankDefinition {
  const safeXp = clampXp(xp);
  const resolvedRank =
    [...rankThresholds].reverse().find((rank) => safeXp >= rank.minXp) ??
    rankThresholds[0];

  return cloneRank(resolvedRank);
}

export function getNextRankProgress(xp: number): NextRankProgress {
  const safeXp = clampXp(xp);
  const currentIndex = [...rankThresholds]
    .map((rank) => rank.key)
    .findIndex((key) => key === getRankForXp(safeXp).key);
  const current = rankThresholds[currentIndex] ?? rankThresholds[0];
  const next = rankThresholds[currentIndex + 1] ?? null;

  if (!next) {
    return {
      currentKey: current.key,
      currentLabel: current.label,
      nextKey: null,
      nextLabel: null,
      progressPercent: 100,
      currentXp: safeXp,
      nextXp: null,
      remainingXp: 0,
    };
  }

  const span = next.minXp - current.minXp;
  const progressPercent = Math.min(
    100,
    Math.max(0, ((safeXp - current.minXp) / span) * 100),
  );

  return {
    currentKey: current.key,
    currentLabel: current.label,
    nextKey: next.key,
    nextLabel: next.label,
    progressPercent,
    currentXp: safeXp,
    nextXp: next.minXp,
    remainingXp: Math.max(0, next.minXp - safeXp),
  };
}
