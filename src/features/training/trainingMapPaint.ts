import type { Map as MapLibreMap } from "maplibre-gl";

type PaintPropertyValue = Parameters<MapLibreMap["setPaintProperty"]>[2];

const difficultyFillColors = {
  easy: "#4fd38a",
  medium: "#f4c84f",
  expert: "#f06b6b",
} as const;

export function buildTrainingRegionFillColorPaint(
  selectedCode: string | null,
  correctCode: string | null,
  showHints: boolean,
): PaintPropertyValue {
  if (!showHints) {
    return [
      "case",
      ["==", ["id"], selectedCode ?? ""],
      ["case", ["==", ["id"], correctCode ?? ""], "#38d47a", "#ef5b5b"],
      ["==", ["id"], correctCode ?? ""],
      "#38d47a",
      "#173c57",
    ];
  }

  return [
    "case",
    ["==", ["id"], selectedCode ?? ""],
    ["case", ["==", ["id"], correctCode ?? ""], "#38d47a", "#ef5b5b"],
    ["==", ["id"], correctCode ?? ""],
    "#38d47a",
    ["boolean", ["feature-state", "hasData"], false],
    [
      "match",
      ["feature-state", "difficulty"],
      "easy",
      difficultyFillColors.easy,
      "medium",
      difficultyFillColors.medium,
      "expert",
      difficultyFillColors.expert,
      "#173c57",
    ],
    "#10293d",
  ];
}

export function buildTrainingRegionFillOpacityPaint(
  selectedCode: string | null,
  correctCode: string | null,
  showHints: boolean,
): PaintPropertyValue {
  if (!showHints) {
    return [
      "case",
      ["==", ["id"], selectedCode ?? ""],
      0.82,
      ["==", ["id"], correctCode ?? ""],
      0.72,
      0.42,
    ];
  }

  return [
    "case",
    ["==", ["id"], selectedCode ?? ""],
    0.82,
    ["==", ["id"], correctCode ?? ""],
    0.72,
    ["boolean", ["feature-state", "hasData"], false],
    0.62,
    0.16,
  ];
}

export { difficultyFillColors };
