import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { getSupabaseClient } from "../../lib/supabase";
import {
  defaultBillingStatus,
  readCurrentBillingStatus,
  type BillingStatus,
} from "../billing/billingApi";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export type UserProfile = {
  id: string;
  username: string;
  avatarUrl: string | null;
  email: string;
  usernameChangedAt: string | null;
  leaderboardVisible: boolean;
  xpTotal: number;
  billing: BillingStatus;
};

export const profileKeys = {
  all: ["profile"] as const,
  current: () => [...profileKeys.all, "current"] as const,
};

export type ProfileDataClient = {
  getCurrentUser(): Promise<{ id: string; email: string | null }>;
  getProfile(userId: string): Promise<ProfileRow>;
  getBillingStatus(): Promise<BillingStatus>;
  updateProfile(userId: string, input: ProfileUpdate): Promise<ProfileRow>;
  updateEmail(email: string): Promise<void>;
  uploadAvatar(path: string, file: Blob): Promise<void>;
  removeAvatar(paths: string[]): Promise<void>;
  getPublicAvatarUrl(path: string): string;
};

type ProfileApiErrorCode =
  | "username_taken"
  | "username_cooldown"
  | "profile_update_failed"
  | "avatar_upload_failed"
  | "email_update_failed";

export class ProfileApiError extends Error {
  constructor(
    public readonly code: ProfileApiErrorCode,
    cause: unknown,
    message = "Impossible de mettre a jour le profil.",
  ) {
    super(message, { cause });
    this.name = "ProfileApiError";
  }
}

function toUserProfile(
  row: ProfileRow,
  fallbackEmail: string | null,
  billing: BillingStatus = defaultBillingStatus,
): UserProfile {
  return {
    id: row.id,
    username: row.display_name,
    avatarUrl: row.avatar_url,
    email: row.email ?? fallbackEmail ?? "",
    usernameChangedAt: row.username_changed_at,
    leaderboardVisible: row.leaderboard_visible,
    xpTotal: Number(row.xp_total ?? 0),
    billing,
  };
}

function trimOrThrow(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ProfileApiError(
      "profile_update_failed",
      new Error("empty_value"),
      "La valeur ne peut pas etre vide.",
    );
  }

  return trimmed;
}

function mapProfileError(
  cause: unknown,
  fallback: ProfileApiErrorCode,
): ProfileApiError {
  const error = cause as { code?: string; message?: string } | undefined;
  const message = error?.message ?? "";

  if (error?.code === "23505") {
    return new ProfileApiError("username_taken", cause);
  }

  if (
    error?.code === "P0001" ||
    message.includes("username can only be changed once every 30 days")
  ) {
    return new ProfileApiError("username_cooldown", cause);
  }

  return new ProfileApiError(fallback, cause);
}

export function extractAvatarStoragePath(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const marker = "/storage/v1/object/public/avatars/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) {
      return null;
    }

    const storagePath = parsed.pathname.slice(markerIndex + marker.length);
    return storagePath ? decodeURIComponent(storagePath) : null;
  } catch {
    return null;
  }
}

export function createProfileApi(
  client: ProfileDataClient,
  options: { createObjectId?: () => string } = {},
) {
  const createObjectId = options.createObjectId ?? (() => crypto.randomUUID());

  async function loadContext() {
    const user = await client.getCurrentUser();
    const [profile, billing] = await Promise.all([
      client.getProfile(user.id),
      client.getBillingStatus(),
    ]);
    return { user, profile, billing };
  }

  return {
    async load(): Promise<UserProfile> {
      const { user, profile, billing } = await loadContext();
      return toUserProfile(profile, user.email, billing);
    },

    async updateUsername(username: string): Promise<UserProfile> {
      const { user, billing } = await loadContext();

      try {
        const profile = await client.updateProfile(user.id, {
          display_name: trimOrThrow(username),
        });
        return toUserProfile(profile, user.email, billing);
      } catch (cause) {
        throw mapProfileError(cause, "profile_update_failed");
      }
    },

    async updateLeaderboardVisibility(visible: boolean): Promise<UserProfile> {
      const { user, billing } = await loadContext();

      try {
        const profile = await client.updateProfile(user.id, {
          leaderboard_visible: visible,
        });
        return toUserProfile(profile, user.email, billing);
      } catch (cause) {
        throw mapProfileError(cause, "profile_update_failed");
      }
    },

    async requestEmailChange(email: string): Promise<void> {
      try {
        await client.updateEmail(trimOrThrow(email));
      } catch (cause) {
        throw mapProfileError(cause, "email_update_failed");
      }
    },

    async replaceAvatar(
      file: Blob,
      extension: "webp",
    ): Promise<UserProfile> {
      const { user, profile: previousProfile, billing } = await loadContext();
      const path = `${user.id}/${createObjectId()}.${extension}`;

      try {
        await client.uploadAvatar(path, file);
      } catch (cause) {
        throw mapProfileError(cause, "avatar_upload_failed");
      }

      const nextUrl = client.getPublicAvatarUrl(path);

      try {
        const profile = await client.updateProfile(user.id, {
          avatar_url: nextUrl,
        });
        const previousPath = extractAvatarStoragePath(previousProfile.avatar_url);
        if (previousPath && previousPath !== path) {
          await client.removeAvatar([previousPath]);
        }
        return toUserProfile({ ...profile, avatar_url: nextUrl }, user.email, billing);
      } catch (cause) {
        try {
          await client.removeAvatar([path]);
        } catch {
          // Best effort cleanup only.
        }
        throw mapProfileError(cause, "profile_update_failed");
      }
    },

    async removeAvatar(): Promise<UserProfile> {
      const { user, profile: previousProfile, billing } = await loadContext();

      try {
        const profile = await client.updateProfile(user.id, {
          avatar_url: null,
        });
        const previousPath = extractAvatarStoragePath(previousProfile.avatar_url);
        if (previousPath) {
          await client.removeAvatar([previousPath]);
        }
        return toUserProfile(profile, user.email, billing);
      } catch (cause) {
        throw mapProfileError(cause, "profile_update_failed");
      }
    },
  };
}

type SupabaseErrorLike = {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

function throwIfError(error: SupabaseErrorLike | null, fallbackCode: string) {
  if (!error) {
    return;
  }

  throw Object.assign(new Error(error.message), {
    code: error.code ?? fallbackCode,
    details: error.details,
    hint: error.hint,
  });
}

export function createSupabaseProfileDataClient(
  supabase: SupabaseClient<Database>,
): ProfileDataClient {
  return {
    async getCurrentUser() {
      const { data, error } = await supabase.auth.getUser();
      throwIfError(error, "profile_user_lookup_failed");

      if (!data.user) {
        throw new Error("Utilisateur non connecte.");
      }

      return {
        id: data.user.id,
        email: data.user.email ?? null,
      };
    },

    async getProfile(userId) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      throwIfError(error, "profile_load_failed");

      if (!data) {
        throw new Error("Profil introuvable.");
      }

      return data;
    },

    async getBillingStatus() {
      return readCurrentBillingStatus(supabase);
    },

    async updateProfile(userId, input) {
      const { data, error } = await supabase
        .from("profiles")
        .update(input)
        .eq("id", userId)
        .select("*")
        .single();
      throwIfError(error, "profile_update_failed");

      if (!data) {
        throw new Error("Profil introuvable.");
      }

      return data;
    },

    async updateEmail(email) {
      const { error } = await supabase.auth.updateUser({ email });
      throwIfError(error, "email_update_failed");
    },

    async uploadAvatar(path, file) {
      const { error } = await supabase.storage.from("avatars").upload(path, file, {
        contentType: "image/webp",
        upsert: false,
      });
      throwIfError(error, "avatar_upload_failed");
    },

    async removeAvatar(paths) {
      if (paths.length === 0) {
        return;
      }

      const { error } = await supabase.storage.from("avatars").remove(paths);
      throwIfError(error, "avatar_remove_failed");
    },

    getPublicAvatarUrl(path) {
      return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    },
  };
}

let defaultProfileApi: ReturnType<typeof createProfileApi> | undefined;

export function getProfileApi() {
  defaultProfileApi ??= createProfileApi(
    createSupabaseProfileDataClient(getSupabaseClient()),
  );
  return defaultProfileApi;
}

export type ProfileApi = ReturnType<typeof createProfileApi>;
