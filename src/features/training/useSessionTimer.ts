import { useEffect, useMemo, useState } from "react";

export function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function useSessionTimer({
  startedAt,
  completedDurationMs,
}: {
  startedAt: string | null;
  completedDurationMs: number | null;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (completedDurationMs !== null || !startedAt) {
      return;
    }

    const updateElapsed = () => {
      setNowMs(Date.now());
    };

    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 250);
    return () => window.clearInterval(intervalId);
  }, [startedAt, completedDurationMs]);

  const elapsedMs = useMemo(() => {
    if (completedDurationMs !== null) return completedDurationMs;
    if (!startedAt) return 0;
    return Math.max(0, nowMs - Date.parse(startedAt));
  }, [completedDurationMs, nowMs, startedAt]);

  return useMemo(
    () => ({
      elapsedMs,
      label: formatDuration(elapsedMs),
    }),
    [elapsedMs],
  );
}
