import { describe, expect, it } from "vitest";
import {
  getNextRankProgress,
  getRankForXp,
  rankThresholds,
} from "./rankProgression";

describe("rankProgression", () => {
  it("maps XP thresholds to the expected global ranks", () => {
    expect(getRankForXp(0)).toMatchObject({
      key: "bronze_3",
      label: "Bronze III",
      minXp: 0,
    });
    expect(getRankForXp(119)).toMatchObject({
      key: "bronze_3",
      label: "Bronze III",
    });
    expect(getRankForXp(120)).toMatchObject({
      key: "bronze_2",
      label: "Bronze II",
      minXp: 120,
    });
    expect(getRankForXp(15500)).toMatchObject({
      key: "grand_master_1",
      label: "Grand Master I",
      minXp: 15500,
    });
  });

  it("never resolves below Bronze III when XP is negative, fractional, or invalid", () => {
    expect(getRankForXp(-200)).toMatchObject({
      key: "bronze_3",
      label: "Bronze III",
      minXp: 0,
    });
    expect(getRankForXp(119.9)).toMatchObject({
      key: "bronze_3",
      label: "Bronze III",
    });
    expect(getRankForXp(Number.NaN)).toMatchObject({
      key: "bronze_3",
      label: "Bronze III",
    });
  });

  it("returns progress toward the next threshold with stable rank keys", () => {
    expect(getNextRankProgress(0)).toEqual({
      currentKey: "bronze_3",
      currentLabel: "Bronze III",
      nextKey: "bronze_2",
      nextLabel: "Bronze II",
      progressPercent: 0,
      currentXp: 0,
      nextXp: 120,
      remainingXp: 120,
    });

    expect(getNextRankProgress(190)).toEqual({
      currentKey: "bronze_2",
      currentLabel: "Bronze II",
      nextKey: "bronze_1",
      nextLabel: "Bronze I",
      progressPercent: 50,
      currentXp: 190,
      nextXp: 260,
      remainingXp: 70,
    });
  });

  it("supports rank downgrades when XP drops below a threshold", () => {
    expect(getRankForXp(1100)).toMatchObject({
      key: "argent_1",
      label: "Argent I",
    });
    expect(getRankForXp(1099)).toMatchObject({
      key: "argent_2",
      label: "Argent II",
    });
  });

  it("reports complete progress at the top rank", () => {
    expect(getNextRankProgress(20000)).toEqual({
      currentKey: "grand_master_1",
      currentLabel: "Grand Master I",
      nextKey: null,
      nextLabel: null,
      progressPercent: 100,
      currentXp: 20000,
      nextXp: null,
      remainingXp: 0,
    });
  });

  it("keeps the exported threshold ladder immutable and ordered", () => {
    expect(rankThresholds).toHaveLength(18);
    expect(rankThresholds[0]).toMatchObject({
      key: "bronze_3",
      label: "Bronze III",
      minXp: 0,
    });
    expect(rankThresholds.at(-1)).toMatchObject({
      key: "grand_master_1",
      label: "Grand Master I",
      minXp: 15500,
    });
    expect(() =>
      (rankThresholds as unknown as Array<(typeof rankThresholds)[number]>).push(
        {
          key: "bronze_3",
          label: "Bronze III",
          minXp: 0,
        },
      ),
    ).toThrow();
  });
});
