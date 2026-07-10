import { describe, expect, it, vi } from "vitest";
import { createLeaderboardApi, type LeaderboardDataClient } from "./leaderboardApi";

function client(): LeaderboardDataClient {
  return {
    listDailyEntries: vi.fn().mockResolvedValue([{
      user_id: "u1", username: "Marc", avatar_url: null, rank: 1,
      correct_answers: 8, accuracy_percent: 80, duration_ms: 65432,
      daily_points: 837, completed_at: "2026-07-06T10:00:00Z", xp_total: "39", total_count: 4,
    }]),
    listGlobalEntries: vi.fn().mockResolvedValue([{
      user_id: "u1", username: "Marc", avatar_url: null, rank: 2,
      total_points: "2450", participation_count: 3, correct_answers: "24",
      total_answers: "30", accuracy_percent: 80, total_duration_ms: "190000",
      xp_total: "39", total_count: 12,
    }]),
    loadMyDailyProgress: vi.fn().mockResolvedValue({
      rank: 1, correct_answers: 8, accuracy_percent: 80, duration_ms: 65432,
      daily_points: 837, visible: true,
    }),
    loadMyGlobalProgress: vi.fn().mockResolvedValue({
      rank: 2, total_points: "2450", participation_count: 3,
      correct_answers: "24", total_answers: "30", accuracy_percent: 80,
      total_duration_ms: "190000", visible: true,
    }),
  };
}

describe("leaderboardApi", () => {
  it("maps the daily and global rankings", async () => {
    const dataClient = client();
    const api = createLeaderboardApi(dataClient);

    await expect(api.listDaily("2026-07-06")).resolves.toMatchObject({
      totalCount: 4,
      entries: [{ correctAnswers: 8, dailyPoints: 837, xpTotal: 39 }],
    });
    await expect(api.listGlobal()).resolves.toMatchObject({
      totalCount: 12,
      entries: [{ totalPoints: 2450, participationCount: 3, xpTotal: 39 }],
    });
    expect(dataClient.listDailyEntries).toHaveBeenCalledWith("2026-07-06", 25, 0);
    expect(dataClient.listGlobalEntries).toHaveBeenCalledWith(25, 0);
  });

  it("maps personal progress without inventing a public rank", async () => {
    const dataClient = client();
    dataClient.loadMyDailyProgress = vi.fn().mockResolvedValue({
      rank: null, correct_answers: 7, accuracy_percent: 70, duration_ms: 70000,
      daily_points: 720, visible: false,
    });
    const api = createLeaderboardApi(dataClient);

    await expect(api.loadMyDailyProgress("2026-07-06")).resolves.toEqual({
      rank: null, correctAnswers: 7, accuracyPercent: 70, durationMs: 70000,
      dailyPoints: 720, visible: false,
    });
  });
});
