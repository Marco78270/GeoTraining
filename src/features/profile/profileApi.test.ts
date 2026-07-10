import { describe, expect, it, vi } from "vitest";
import type { Database } from "../../lib/database.types";
import { defaultBillingStatus } from "../billing/billingApi";
import {
  createProfileApi,
  extractAvatarStoragePath,
  ProfileApiError,
} from "./profileApi";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

function profileRow(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "user-1",
    display_name: "Marco78270",
    avatar_url: "https://cdn.example.test/storage/v1/object/public/avatars/user-1/current.webp",
    email: "marc@example.test",
    username_changed_at: "2026-06-01T10:00:00.000Z",
    leaderboard_visible: true,
    xp_total: "0",
    created_at: "2026-06-01T10:00:00.000Z",
    updated_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

function client() {
  return {
    getCurrentUser: vi.fn(async () => ({
      id: "user-1",
      email: "marc@example.test",
    })),
    getProfile: vi.fn(async () => profileRow()),
    getBillingStatus: vi.fn(async () => defaultBillingStatus),
    updateProfile: vi.fn(async () => profileRow()),
    updateEmail: vi.fn(async () => {}),
    uploadAvatar: vi.fn(async () => {}),
    removeAvatar: vi.fn(async () => {}),
    getPublicAvatarUrl: vi.fn((path: string) =>
      `https://cdn.example.test/storage/v1/object/public/avatars/${path}`,
    ),
  };
}

describe("createProfileApi", () => {
  it("charge le profil courant", async () => {
    const dataClient = client();

    await expect(createProfileApi(dataClient).load()).resolves.toEqual({
      id: "user-1",
      username: "Marco78270",
      avatarUrl:
        "https://cdn.example.test/storage/v1/object/public/avatars/user-1/current.webp",
      email: "marc@example.test",
      usernameChangedAt: "2026-06-01T10:00:00.000Z",
      leaderboardVisible: true,
      xpTotal: 0,
      billing: defaultBillingStatus,
    });

    expect(dataClient.getProfile).toHaveBeenCalledWith("user-1");
  });

  it("trim le nom d'utilisateur avant mise a jour", async () => {
    const dataClient = client();
    vi.mocked(dataClient.updateProfile).mockResolvedValueOnce(
      profileRow({ display_name: "Marc Geo" }),
    );

    await expect(
      createProfileApi(dataClient).updateUsername("  Marc Geo  "),
    ).resolves.toMatchObject({
      username: "Marc Geo",
      billing: defaultBillingStatus,
    });

    expect(dataClient.updateProfile).toHaveBeenCalledWith("user-1", {
      display_name: "Marc Geo",
    });
  });

  it("met a jour la visibilite du classement", async () => {
    const dataClient = client();
    vi.mocked(dataClient.updateProfile).mockResolvedValueOnce(
      profileRow({ leaderboard_visible: false }),
    );

    await expect(
      createProfileApi(dataClient).updateLeaderboardVisibility(false),
    ).resolves.toMatchObject({
      leaderboardVisible: false,
      billing: defaultBillingStatus,
    });

    expect(dataClient.updateProfile).toHaveBeenCalledWith("user-1", {
      leaderboard_visible: false,
    });
  });

  it("demande un changement d'email apres trim", async () => {
    const dataClient = client();

    await expect(
      createProfileApi(dataClient).requestEmailChange("  next@example.test "),
    ).resolves.toBeUndefined();

    expect(dataClient.updateEmail).toHaveBeenCalledWith("next@example.test");
  });

  it("remplace l'avatar puis nettoie l'ancien objet", async () => {
    const dataClient = client();
    const api = createProfileApi(dataClient, {
      createObjectId: () => "avatar-2",
    });

    await expect(
      api.replaceAvatar(new Blob(["avatar"], { type: "image/webp" }), "webp"),
    ).resolves.toEqual({
      id: "user-1",
      username: "Marco78270",
      avatarUrl:
        "https://cdn.example.test/storage/v1/object/public/avatars/user-1/avatar-2.webp",
      email: "marc@example.test",
      usernameChangedAt: "2026-06-01T10:00:00.000Z",
      leaderboardVisible: true,
      xpTotal: 0,
      billing: defaultBillingStatus,
    });

    expect(dataClient.uploadAvatar).toHaveBeenCalledWith(
      "user-1/avatar-2.webp",
      expect.any(Blob),
    );
    expect(dataClient.updateProfile).toHaveBeenCalledWith("user-1", {
      avatar_url:
        "https://cdn.example.test/storage/v1/object/public/avatars/user-1/avatar-2.webp",
    });
    expect(dataClient.removeAvatar).toHaveBeenCalledWith(["user-1/current.webp"]);
  });

  it("supprime l'upload si la mise a jour du profil echoue", async () => {
    const dataClient = client();
    vi.mocked(dataClient.updateProfile).mockRejectedValueOnce(
      Object.assign(new Error("duplicate key"), { code: "23505" }),
    );

    const error = await createProfileApi(dataClient, {
      createObjectId: () => "avatar-2",
    })
      .replaceAvatar(new Blob(["avatar"], { type: "image/webp" }), "webp")
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ProfileApiError);
    expect(error).toMatchObject({
      code: "username_taken",
      cause: expect.objectContaining({ message: "duplicate key" }),
    });
    expect(dataClient.removeAvatar).toHaveBeenCalledWith(["user-1/avatar-2.webp"]);
  });

  it("retire l'avatar courant du profil puis du storage", async () => {
    const dataClient = client();
    vi.mocked(dataClient.updateProfile).mockResolvedValueOnce(
      profileRow({ avatar_url: null }),
    );

    await expect(createProfileApi(dataClient).removeAvatar()).resolves.toEqual({
      id: "user-1",
      username: "Marco78270",
      avatarUrl: null,
      email: "marc@example.test",
      usernameChangedAt: "2026-06-01T10:00:00.000Z",
      leaderboardVisible: true,
      xpTotal: 0,
      billing: defaultBillingStatus,
    });

    expect(dataClient.updateProfile).toHaveBeenCalledWith("user-1", {
      avatar_url: null,
    });
    expect(dataClient.removeAvatar).toHaveBeenCalledWith(["user-1/current.webp"]);
  });
});

describe("extractAvatarStoragePath", () => {
  it("extrait le chemin storage du bucket avatars", () => {
    expect(
      extractAvatarStoragePath(
        "https://cdn.example.test/storage/v1/object/public/avatars/user-1/avatar.webp",
      ),
    ).toBe("user-1/avatar.webp");
  });

  it("ignore les urls externes ou d'autres buckets", () => {
    expect(
      extractAvatarStoragePath(
        "https://cdn.example.test/storage/v1/object/public/clue-images/user-1/avatar.webp",
      ),
    ).toBeNull();
    expect(extractAvatarStoragePath("https://example.test/avatar.webp")).toBeNull();
  });
});
