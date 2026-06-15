import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { getSupabaseClient } from "../../lib/supabase";

type Tables = Database["public"]["Tables"];
export type PlatformRole = Database["public"]["Enums"]["platform_role"];

export type PlatformUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
  role: PlatformRole | null;
};

export type AdminDataClient = {
  getCurrentRole(): Promise<PlatformRole | null>;
  listUsers(): Promise<
    Array<
      Pick<
        Tables["profiles"]["Row"],
        "id" | "display_name" | "avatar_url" | "email"
      > & {
        user_roles:
          | Pick<Tables["user_roles"]["Row"], "role">
          | Array<Pick<Tables["user_roles"]["Row"], "role">>
          | null;
      }
    >
  >;
  setRole(userId: string, role: PlatformRole): Promise<void>;
  removeRole(userId: string): Promise<void>;
};

export function createAdminApi(client: AdminDataClient) {
  return {
    getCurrentPlatformRole() {
      return client.getCurrentRole();
    },
    async listPlatformUsers(): Promise<PlatformUser[]> {
      const rows = await client.listUsers();
      return rows.map((row) => {
        const relation = Array.isArray(row.user_roles)
          ? row.user_roles[0] ?? null
          : row.user_roles;

        return {
          id: row.id,
          displayName: row.display_name,
          avatarUrl: row.avatar_url,
          email: row.email,
          role: relation?.role ?? null,
        };
      });
    },
    async setPlatformRole(userId: string, role: PlatformRole) {
      await client.setRole(userId, role);
    },
    async removePlatformRole(userId: string) {
      await client.removeRole(userId);
    },
  };
}

export function createSupabaseAdminDataClient(
  supabase: SupabaseClient<Database>,
): AdminDataClient {
  return {
    async getCurrentRole() {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        return null;
      }

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (error) {
        throw error;
      }

      return data?.role ?? null;
    },
    async listUsers() {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, email, user_roles(role)")
        .order("display_name");
      if (error) {
        throw error;
      }

      return (data ?? []) as Array<
        Pick<
          Tables["profiles"]["Row"],
          "id" | "display_name" | "avatar_url" | "email"
        > & {
            user_roles:
              | Pick<Tables["user_roles"]["Row"], "role">
              | Array<Pick<Tables["user_roles"]["Row"], "role">>
              | null;
          }
      >;
    },
    async setRole(userId, role) {
      const { error } = await supabase
        .from("user_roles")
        .upsert({ user_id: userId, role });
      if (error) {
        throw error;
      }
    },
    async removeRole(userId) {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);
      if (error) {
        throw error;
      }
    },
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;

export const getAdminApi = () =>
  createAdminApi(createSupabaseAdminDataClient(getSupabaseClient()));
