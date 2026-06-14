import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import {
  AuthContext,
  type AuthContextValue,
} from "../auth/authContext";
import { AdminPage } from "./AdminPage";

const authValue: AuthContextValue = {
  session: null,
  user: { id: "user-1", email: "marc.roger@outlook.fr" } as AuthContextValue["user"],
  loading: false,
  configurationError: null,
  sessionError: null,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => ({ error: null }),
};

function renderAdminPage(api: unknown) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={authValue}>
        <MemoryRouter>
          <AdminPage api={api as never} />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

it("renders platform users for a super admin", async () => {
  const api = {
    getCurrentPlatformRole: vi.fn().mockResolvedValue("super_admin"),
    listPlatformUsers: vi.fn().mockResolvedValue([
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
        role: "admin",
      },
    ]),
    setPlatformRole: vi.fn().mockResolvedValue(undefined),
    removePlatformRole: vi.fn().mockResolvedValue(undefined),
  };

  renderAdminPage(api);

  expect(await screen.findByText("Marc")).toBeVisible();
  expect(screen.getByText("Alice")).toBeVisible();
  expect(screen.getByText("alice@example.com")).toBeVisible();
});

it("blocks non-admin users", async () => {
  const api = {
    getCurrentPlatformRole: vi.fn().mockResolvedValue(null),
    listPlatformUsers: vi.fn().mockResolvedValue([]),
    setPlatformRole: vi.fn(),
    removePlatformRole: vi.fn(),
  };

  renderAdminPage(api);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Accès administrateur requis.",
  );
});

it("lets a super admin assign a role", async () => {
  const api = {
    getCurrentPlatformRole: vi.fn().mockResolvedValue("super_admin"),
    listPlatformUsers: vi.fn().mockResolvedValue([
      {
        id: "user-2",
        displayName: "Alice",
        avatarUrl: null,
        email: "alice@example.com",
        role: null,
      },
    ]),
    setPlatformRole: vi.fn().mockResolvedValue(undefined),
    removePlatformRole: vi.fn().mockResolvedValue(undefined),
  };

  renderAdminPage(api);

  await screen.findByText("Alice");
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  await waitFor(() =>
    expect(api.setPlatformRole).toHaveBeenCalledWith("user-2", "admin"),
  );
});

it("does not allow removing the root super admin", async () => {
  const api = {
    getCurrentPlatformRole: vi.fn().mockResolvedValue("super_admin"),
    listPlatformUsers: vi.fn().mockResolvedValue([
      {
        id: "user-1",
        displayName: "Marc",
        avatarUrl: null,
        email: "marc.roger@outlook.fr",
        role: "super_admin",
      },
    ]),
    setPlatformRole: vi.fn().mockResolvedValue(undefined),
    removePlatformRole: vi.fn().mockResolvedValue(undefined),
  };

  renderAdminPage(api);

  expect(
    await screen.findByRole("button", { name: "Supervision racine" }),
  ).toBeDisabled();
});
