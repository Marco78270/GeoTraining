import { describe, expect, it } from "vitest";
import {
  buildTrainingRegionFillColorPaint,
  buildTrainingRegionFillOpacityPaint,
} from "./trainingMapPaint";

describe("TrainingMap paint expressions", () => {
  it("does not include difficulty colors while a region quiz question is active", () => {
    const fillColor = buildTrainingRegionFillColorPaint(null, null, false);
    const fillOpacity = buildTrainingRegionFillOpacityPaint(null, null, false);

    expect(JSON.stringify(fillColor)).not.toContain("difficulty");
    expect(JSON.stringify(fillColor)).not.toContain("#4fd38a");
    expect(JSON.stringify(fillColor)).not.toContain("#f4c84f");
    expect(JSON.stringify(fillColor)).not.toContain("#f06b6b");
    expect(JSON.stringify(fillOpacity)).not.toContain("hasData");
  });

  it("keeps only correction colors visible after an answer", () => {
    const fillColor = buildTrainingRegionFillColorPaint("CA-QC", "CA-ON", false);

    expect(JSON.stringify(fillColor)).toContain("#ef5b5b");
    expect(JSON.stringify(fillColor)).toContain("#38d47a");
    expect(JSON.stringify(fillColor)).not.toContain("difficulty");
  });

  it("keeps difficulty colors available before launching a session", () => {
    const fillColor = buildTrainingRegionFillColorPaint(null, null, true);

    expect(JSON.stringify(fillColor)).toContain("difficulty");
    expect(JSON.stringify(fillColor)).toContain("#4fd38a");
    expect(JSON.stringify(fillColor)).toContain("#f4c84f");
    expect(JSON.stringify(fillColor)).toContain("#f06b6b");
  });
});
