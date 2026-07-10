import { describe, expect, it } from "vitest";
import { createLatestMapUpdateGuard } from "./latestMapUpdate";

describe("createLatestMapUpdateGuard", () => {
  it("rejects an older map update after a newer update has started", () => {
    const guard = createLatestMapUpdateGuard();
    const neutralUpdate = guard.begin();
    const correctionUpdate = guard.begin();

    expect(correctionUpdate.isCurrent()).toBe(true);
    expect(neutralUpdate.isCurrent()).toBe(false);
  });

  it("invalidates the current update when the map is disposed", () => {
    const guard = createLatestMapUpdateGuard();
    const update = guard.begin();

    guard.invalidate();

    expect(update.isCurrent()).toBe(false);
  });
});
