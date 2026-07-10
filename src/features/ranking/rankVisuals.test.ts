import { describe, expect, it } from "vitest";
import { rankThresholds } from "./rankProgression";
import { getRankVisual } from "./rankVisuals";

describe("rankVisuals", () => {
  it("resolves visual metadata for every rank key", () => {
    const visuals = rankThresholds.map(({ key }) => getRankVisual(key));

    expect(visuals).toHaveLength(18);
    expect(visuals.map(({ key }) => key)).toEqual(
      rankThresholds.map(({ key }) => key),
    );
    expect(new Set(visuals.map(({ family }) => family))).toEqual(
      new Set(["bronze", "argent", "or", "diamant", "master", "grand_master"]),
    );
  });

  it("uses one, two, and three ornaments for divisions III, II, and I", () => {
    expect(getRankVisual("bronze_3").ornamentCount).toBe(1);
    expect(getRankVisual("bronze_2").ornamentCount).toBe(2);
    expect(getRankVisual("bronze_1").ornamentCount).toBe(3);
  });

  it("gives each family a stable Atlas palette", () => {
    expect(getRankVisual("bronze_1")).toMatchObject({
      family: "bronze",
      primary: "#c68a58",
    });
    expect(getRankVisual("grand_master_1")).toMatchObject({
      family: "grand_master",
      primary: "#f4f0ff",
    });
  });
});
