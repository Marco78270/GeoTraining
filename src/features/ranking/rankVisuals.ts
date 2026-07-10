import type { RankKey } from "./rankProgression";

export type RankFamily =
  | "bronze"
  | "argent"
  | "or"
  | "diamant"
  | "master"
  | "grand_master";

export type RankVisual = {
  readonly key: RankKey;
  readonly family: RankFamily;
  readonly division: 1 | 2 | 3;
  readonly ornamentCount: 1 | 2 | 3;
  readonly primary: string;
  readonly secondary: string;
  readonly glow: string;
};

type RankPalette = Pick<RankVisual, "primary" | "secondary" | "glow">;

const rankPalettes = Object.freeze({
  bronze: Object.freeze({
    primary: "#c68a58",
    secondary: "#6f422b",
    glow: "#f0b67f",
  }),
  argent: Object.freeze({
    primary: "#d9e5ef",
    secondary: "#70869a",
    glow: "#f4fbff",
  }),
  or: Object.freeze({
    primary: "#f1c84b",
    secondary: "#8f6517",
    glow: "#fff0a3",
  }),
  diamant: Object.freeze({
    primary: "#72e4ff",
    secondary: "#237eaa",
    glow: "#c9f7ff",
  }),
  master: Object.freeze({
    primary: "#bd8cff",
    secondary: "#6741a3",
    glow: "#e9d7ff",
  }),
  grand_master: Object.freeze({
    primary: "#f4f0ff",
    secondary: "#8b70d6",
    glow: "#ffffff",
  }),
} satisfies Record<RankFamily, RankPalette>);

export function getRankVisual(key: RankKey): RankVisual {
  const separatorIndex = key.lastIndexOf("_");
  const family = key.slice(0, separatorIndex) as RankFamily;
  const division = Number(key.slice(separatorIndex + 1)) as 1 | 2 | 3;
  const ornamentCount = (4 - division) as 1 | 2 | 3;

  return Object.freeze({
    key,
    family,
    division,
    ornamentCount,
    ...rankPalettes[family],
  });
}
