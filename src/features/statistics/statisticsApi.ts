import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { getSupabaseClient } from "../../lib/supabase";

type SessionRow = Database["public"]["Tables"]["training_sessions"]["Row"];

export type StatisticsSession = SessionRow & {
  collections: { name: string } | null;
  categories: { name: string } | null;
};

export type StatisticsDataClient = {
  listSessions(): Promise<StatisticsSession[]>;
};

export function createStatisticsApi(client: StatisticsDataClient) {
  return {
    async loadSessions() {
      return client.listSessions();
    },
  };
}

function throwIfError(
  error: { message: string; code?: string } | null,
  fallbackCode: string,
) {
  if (error) {
    throw Object.assign(new Error(error.message), {
      code: error.code ?? fallbackCode,
    });
  }
}

export function createSupabaseStatisticsDataClient(
  supabase: SupabaseClient<Database>,
): StatisticsDataClient {
  return {
    async listSessions() {
      const { data, error } = await supabase
        .from("training_sessions")
        .select(
          "*, collections(name), categories(name)",
        )
        .order("started_at", { ascending: false });
      throwIfError(error, "statistics_sessions_load_failed");
      return (data ?? []) as StatisticsSession[];
    },
  };
}

let defaultApi: ReturnType<typeof createStatisticsApi> | undefined;

export function getStatisticsApi() {
  defaultApi ??= createStatisticsApi(
    createSupabaseStatisticsDataClient(getSupabaseClient()),
  );
  return defaultApi;
}

export type StatisticsApi = ReturnType<typeof createStatisticsApi>;
