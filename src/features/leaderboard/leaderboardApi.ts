import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { getSupabaseClient } from "../../lib/supabase";

type DailyRow = Database["public"]["Functions"]["get_daily_challenge_leaderboard"]["Returns"][number];
type GlobalRow = Database["public"]["Functions"]["get_global_daily_leaderboard"]["Returns"][number];
type DailyProgressRow = Database["public"]["Functions"]["get_my_daily_challenge_leaderboard_progress"]["Returns"][number];
type GlobalProgressRow = Database["public"]["Functions"]["get_my_global_daily_leaderboard_progress"]["Returns"][number];

export type DailyLeaderboardEntry = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  rank: number;
  correctAnswers: number;
  accuracyPercent: number;
  durationMs: number;
  dailyPoints: number;
  completedAt: string;
  xpTotal: number;
};

export type GlobalLeaderboardEntry = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  rank: number;
  totalPoints: number;
  participationCount: number;
  correctAnswers: number;
  totalAnswers: number;
  accuracyPercent: number;
  totalDurationMs: number;
  xpTotal: number;
};

export type DailyLeaderboardProgress = {
  rank: number | null;
  correctAnswers: number | null;
  accuracyPercent: number | null;
  durationMs: number | null;
  dailyPoints: number | null;
  visible: boolean;
};

export type GlobalLeaderboardProgress = {
  rank: number | null;
  totalPoints: number;
  participationCount: number;
  correctAnswers: number;
  totalAnswers: number;
  accuracyPercent: number | null;
  totalDurationMs: number;
  visible: boolean;
};

export type LeaderboardDataClient = {
  listDailyEntries(challengeKey: string, limit: number, offset: number): Promise<DailyRow[]>;
  listGlobalEntries(limit: number, offset: number): Promise<GlobalRow[]>;
  loadMyDailyProgress(challengeKey: string): Promise<DailyProgressRow | null>;
  loadMyGlobalProgress(): Promise<GlobalProgressRow | null>;
};

const number = (value: number | string | null | undefined) => Number(value ?? 0);

function pageBounds(page: number, pageSize: number) {
  const safePage = Math.max(1, Math.trunc(page) || 1);
  const safePageSize = Math.min(50, Math.max(1, Math.trunc(pageSize) || 25));
  return { safePage, safePageSize, offset: (safePage - 1) * safePageSize };
}

export function createLeaderboardApi(client: LeaderboardDataClient) {
  return {
    async listDaily(challengeKey: string, page = 1, pageSize = 25) {
      const { safePage, safePageSize, offset } = pageBounds(page, pageSize);
      const rows = await client.listDailyEntries(challengeKey, safePageSize, offset);
      return {
        entries: rows.map((row): DailyLeaderboardEntry => ({
          userId: row.user_id,
          username: row.username,
          avatarUrl: row.avatar_url,
          rank: number(row.rank),
          correctAnswers: number(row.correct_answers),
          accuracyPercent: number(row.accuracy_percent),
          durationMs: number(row.duration_ms),
          dailyPoints: number(row.daily_points),
          completedAt: row.completed_at,
          xpTotal: number(row.xp_total),
        })),
        totalCount: number(rows[0]?.total_count),
        page: safePage,
        pageSize: safePageSize,
      };
    },

    async listGlobal(page = 1, pageSize = 25) {
      const { safePage, safePageSize, offset } = pageBounds(page, pageSize);
      const rows = await client.listGlobalEntries(safePageSize, offset);
      return {
        entries: rows.map((row): GlobalLeaderboardEntry => ({
          userId: row.user_id,
          username: row.username,
          avatarUrl: row.avatar_url,
          rank: number(row.rank),
          totalPoints: number(row.total_points),
          participationCount: number(row.participation_count),
          correctAnswers: number(row.correct_answers),
          totalAnswers: number(row.total_answers),
          accuracyPercent: number(row.accuracy_percent),
          totalDurationMs: number(row.total_duration_ms),
          xpTotal: number(row.xp_total),
        })),
        totalCount: number(rows[0]?.total_count),
        page: safePage,
        pageSize: safePageSize,
      };
    },

    async loadMyDailyProgress(challengeKey: string): Promise<DailyLeaderboardProgress> {
      const row = await client.loadMyDailyProgress(challengeKey);
      return {
        rank: row?.rank == null ? null : number(row.rank),
        correctAnswers: row?.correct_answers == null ? null : number(row.correct_answers),
        accuracyPercent: row?.accuracy_percent == null ? null : number(row.accuracy_percent),
        durationMs: row?.duration_ms == null ? null : number(row.duration_ms),
        dailyPoints: row?.daily_points == null ? null : number(row.daily_points),
        visible: row?.visible ?? true,
      };
    },

    async loadMyGlobalProgress(): Promise<GlobalLeaderboardProgress> {
      const row = await client.loadMyGlobalProgress();
      return {
        rank: row?.rank == null ? null : number(row.rank),
        totalPoints: number(row?.total_points),
        participationCount: number(row?.participation_count),
        correctAnswers: number(row?.correct_answers),
        totalAnswers: number(row?.total_answers),
        accuracyPercent: row?.accuracy_percent == null ? null : number(row.accuracy_percent),
        totalDurationMs: number(row?.total_duration_ms),
        visible: row?.visible ?? true,
      };
    },
  };
}

function throwIfError(error: { message: string; code?: string } | null, code: string) {
  if (error) throw Object.assign(new Error(error.message), { code: error.code ?? code });
}

export function createSupabaseLeaderboardDataClient(supabase: SupabaseClient<Database>): LeaderboardDataClient {
  return {
    async listDailyEntries(challengeKey, limit, offset) {
      const { data, error } = await supabase.rpc("get_daily_challenge_leaderboard", {
        p_challenge_key: challengeKey, p_limit: limit, p_offset: offset,
      });
      throwIfError(error, "daily_leaderboard_entries_load_failed");
      return data ?? [];
    },
    async listGlobalEntries(limit, offset) {
      const { data, error } = await supabase.rpc("get_global_daily_leaderboard", {
        p_limit: limit, p_offset: offset,
      });
      throwIfError(error, "global_leaderboard_entries_load_failed");
      return data ?? [];
    },
    async loadMyDailyProgress(challengeKey) {
      const { data, error } = await supabase.rpc("get_my_daily_challenge_leaderboard_progress", {
        p_challenge_key: challengeKey,
      });
      throwIfError(error, "daily_leaderboard_progress_load_failed");
      return data?.[0] ?? null;
    },
    async loadMyGlobalProgress() {
      const { data, error } = await supabase.rpc("get_my_global_daily_leaderboard_progress", {});
      throwIfError(error, "global_leaderboard_progress_load_failed");
      return data?.[0] ?? null;
    },
  };
}

let defaultApi: ReturnType<typeof createLeaderboardApi> | undefined;
export function getLeaderboardApi() {
  defaultApi ??= createLeaderboardApi(createSupabaseLeaderboardDataClient(getSupabaseClient()));
  return defaultApi;
}
export type LeaderboardApi = ReturnType<typeof createLeaderboardApi>;
