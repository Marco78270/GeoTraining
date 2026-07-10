import { describe, expect, it, vi } from "vitest";
import { createAdminApi, createSupabaseAdminDataClient } from "./adminApi";

describe("adminApi", () => {
  it("returns the current platform role", async () => {
    const client = {
      getCurrentRole: vi.fn().mockResolvedValue("super_admin"),
      listUsers: vi.fn(),
      setRole: vi.fn(),
      removeRole: vi.fn(),
      deleteUser: vi.fn(),
    };

    await expect(
      createAdminApi(client).getCurrentPlatformRole(),
    ).resolves.toBe("super_admin");
  });

  it("lists users with optional platform roles", async () => {
    const client = {
      getCurrentRole: vi.fn(),
      listUsers: vi.fn().mockResolvedValue([
        {
          id: "user-1",
          display_name: "Marc",
          avatar_url: null,
          email: "marc.roger@outlook.fr",
          user_roles: { role: "super_admin" },
        },
        {
          id: "user-2",
          display_name: "Alice",
          avatar_url: null,
          email: "alice@example.com",
          user_roles: null,
        },
      ]),
      setRole: vi.fn(),
      removeRole: vi.fn(),
      deleteUser: vi.fn(),
    };

    await expect(createAdminApi(client).listPlatformUsers()).resolves.toEqual([
      {
        id: "user-1",
        displayName: "Marc",
        avatarUrl: null,
        email: "marc.roger@outlook.fr",
        role: "super_admin",
      },
      {
        id: "user-2",
        displayName: "Alice",
        avatarUrl: null,
        email: "alice@example.com",
        role: null,
      },
    ]);
  });

  it("delegates user deletion to the admin client", async () => {
    const client = {
      getCurrentRole: vi.fn(),
      listUsers: vi.fn(),
      setRole: vi.fn(),
      removeRole: vi.fn(),
      deleteUser: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      createAdminApi(client).deletePlatformUser("user-9"),
    ).resolves.toBeUndefined();
    expect(client.deleteUser).toHaveBeenCalledWith("user-9");
  });

  it("delegates removeRole to the admin edge function", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      auth: { getUser: vi.fn() },
      rpc,
      from: vi.fn(),
    };

    await expect(
      createSupabaseAdminDataClient(supabase as never).removeRole("user-2"),
    ).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("manage_platform_role", {
      target_user_id: "user-2",
      target_role: null,
    });
  });

  it("delegates setRole to the platform role rpc", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      auth: { getUser: vi.fn() },
      rpc,
      from: vi.fn(),
    };

    await expect(
      createSupabaseAdminDataClient(supabase as never).setRole("user-2", "admin"),
    ).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("manage_platform_role", {
      target_user_id: "user-2",
      target_role: "admin",
    });
  });
});
