import { describe, expect, it } from "vitest";
import { formatDailyCountdown } from "./dailyChallenge";

describe("formatDailyCountdown", () => {
  it("formats zero seconds", () => {
    expect(formatDailyCountdown(0)).toBe("00:00:00");
  });

  it("formats under a minute", () => {
    expect(formatDailyCountdown(59)).toBe("00:00:59");
  });

  it("formats one hour exactly", () => {
    expect(formatDailyCountdown(3600)).toBe("01:00:00");
  });

  it("formats almost one day", () => {
    expect(formatDailyCountdown(86399)).toBe("23:59:59");
  });
});
