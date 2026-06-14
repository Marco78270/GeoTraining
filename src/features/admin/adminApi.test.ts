import { describe, expect, it, vi } from "vitest";
import { createAdminApi } from "./adminApi";

describe("adminApi", () => {
  it("returns the current platform role", async () => {
    const client = {
      getCurrentRole: vi.fn().mockResolvedValue("super_admin"),
      listUsers: vi.fn(),
      setRole: vi.fn(),
      removeRole: vi.fn(),
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
});
