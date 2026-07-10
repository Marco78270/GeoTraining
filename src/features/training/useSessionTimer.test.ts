import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDuration, useSessionTimer } from "./useSessionTimer";

describe("useSessionTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats short durations as mm:ss", () => {
    expect(formatDuration(5000)).toBe("00:05");
    expect(formatDuration(65000)).toBe("01:05");
  });

  it("derives elapsed time from the server started_at timestamp", () => {
    vi.setSystemTime(new Date("2026-06-29T12:00:05Z"));

    const { result } = renderHook(() =>
      useSessionTimer({
        startedAt: "2026-06-29T12:00:00Z",
        completedDurationMs: null,
      }),
    );

    expect(result.current.elapsedMs).toBe(5000);
    expect(result.current.label).toBe("00:05");

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.elapsedMs).toBe(6000);
    expect(result.current.label).toBe("00:06");
  });

  it("does not pause when visibility changes", () => {
    vi.setSystemTime(new Date("2026-06-29T12:00:05Z"));

    const { result } = renderHook(() =>
      useSessionTimer({
        startedAt: "2026-06-29T12:00:00Z",
        completedDurationMs: null,
      }),
    );

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.label).toBe("00:07");
  });

  it("stops on the completed server duration", () => {
    vi.setSystemTime(new Date("2026-06-29T12:00:05Z"));

    const { result, rerender } = renderHook(
      ({
        startedAt,
        completedDurationMs,
      }: {
        startedAt: string | null;
        completedDurationMs: number | null;
      }) => useSessionTimer({ startedAt, completedDurationMs }),
      {
        initialProps: {
          startedAt: "2026-06-29T12:00:00Z",
          completedDurationMs: null as number | null,
        },
      },
    );

    expect(result.current.label).toBe("00:05");

    rerender({
      startedAt: "2026-06-29T12:00:00Z",
      completedDurationMs: 42000,
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.elapsedMs).toBe(42000);
    expect(result.current.label).toBe("00:42");
  });
});
