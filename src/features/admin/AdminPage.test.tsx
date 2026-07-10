import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    deletePlatformUser: vi.fn().mockResolvedValue(undefined),
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
    deletePlatformUser: vi.fn(),
  };

  renderAdminPage(api);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Accès administrateur requis.",
  );
});

it("lets a super admin assign a role", async () => {
  const user = userEvent.setup();
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
    deletePlatformUser: vi.fn().mockResolvedValue(undefined),
  };

  renderAdminPage(api);

  await screen.findByText("Alice");
  await user.selectOptions(
    screen.getByRole("combobox", { name: /rôle de alice/i }),
    "admin",
  );
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
    deletePlatformUser: vi.fn().mockResolvedValue(undefined),
  };

  renderAdminPage(api);

  expect(
    await screen.findByRole("combobox", { name: /rôle de marc/i }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Compte racine protégé" }),
  ).toBeDisabled();
});

it("clarifies that removing a user only removes the admin role", async () => {
  const user = userEvent.setup();
  const api = {
    getCurrentPlatformRole: vi.fn().mockResolvedValue("super_admin"),
    listPlatformUsers: vi.fn().mockResolvedValue([
      {
        id: "user-2",
        displayName: "Alice",
        avatarUrl: null,
        email: "alice@example.com",
        role: "admin",
      },
      {
        id: "user-3",
        displayName: "Bob",
        avatarUrl: null,
        email: "bob@example.com",
        role: null,
      },
    ]),
    setPlatformRole: vi.fn().mockResolvedValue(undefined),
    removePlatformRole: vi.fn().mockResolvedValue(undefined),
    deletePlatformUser: vi.fn().mockResolvedValue(undefined),
  };

  renderAdminPage(api);

  expect(
    await screen.findByText(
      /Le retrait enlève uniquement le rôle administrateur, sans supprimer le compte utilisateur\./i,
    ),
  ).toBeVisible();
  await screen.findByText("Alice");

  await user.selectOptions(
    screen.getByRole("combobox", { name: /rôle de alice/i }),
    "standard",
  );
  await user.click(screen.getAllByRole("button", { name: "Enregistrer" })[0]);
  expect(
    await screen.findByRole("dialog", { name: /retirer ce rôle administrateur \?/i }),
  ).toBeVisible();
  expect(
    screen.getByText(
      /Le compte restera actif, mais il repassera immédiatement en utilisateur standard\./i,
    ),
  ).toBeVisible();

  await user.click(screen.getByRole("button", { name: /confirmer le retrait/i }));

  await waitFor(() => {
    expect(api.removePlatformRole).toHaveBeenCalledWith("user-2");
  });

  const aliceCard = screen.getByText("Alice").closest('[role="listitem"]');
  expect(aliceCard).not.toBeNull();
  expect(within(aliceCard as HTMLElement).getByText("Standard")).toBeVisible();
  expect(
    await screen.findByText(/Le rôle administrateur a bien été retiré\./i),
  ).toBeVisible();
});

it("links the statistics page from the admin navigation", async () => {
  const api = {
    getCurrentPlatformRole: vi.fn().mockResolvedValue("super_admin"),
    listPlatformUsers: vi.fn().mockResolvedValue([]),
    setPlatformRole: vi.fn().mockResolvedValue(undefined),
    removePlatformRole: vi.fn().mockResolvedValue(undefined),
    deletePlatformUser: vi.fn().mockResolvedValue(undefined),
  };

  renderAdminPage(api);

  expect(await screen.findByRole("link", { name: /statistiques/i })).toHaveAttribute(
    "href",
    "/statistics",
  );
});

it("lets a super admin delete a removable user", async () => {
  const user = userEvent.setup();
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
    deletePlatformUser: vi.fn().mockResolvedValue(undefined),
  };

  renderAdminPage(api);

  await user.click(await screen.findByRole("button", { name: /supprimer le compte/i }));
  expect(
    await screen.findByRole("dialog", { name: /supprimer ce compte utilisateur \?/i }),
  ).toBeVisible();
  expect(
    screen.getByText(
      /Le compte sera supprimé de la plateforme\. Si cet utilisateur possède encore des collections, des indices ou des invitations, l'opération sera refusée avec un message explicite\./i,
    ),
  ).toBeVisible();

  await user.click(screen.getByRole("button", { name: /confirmer la suppression/i }));

  await waitFor(() => {
    expect(api.deletePlatformUser).toHaveBeenCalledWith("user-2");
  });

  expect(
    await screen.findByText(/Le compte utilisateur a bien été supprimé\./i),
  ).toBeVisible();
});

it("cancels a destructive admin action when the dialog is dismissed", async () => {
  const user = userEvent.setup();
  const api = {
    getCurrentPlatformRole: vi.fn().mockResolvedValue("super_admin"),
    listPlatformUsers: vi.fn().mockResolvedValue([
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
    deletePlatformUser: vi.fn().mockResolvedValue(undefined),
  };

  renderAdminPage(api);

  await screen.findByText("Alice");
  await user.selectOptions(
    screen.getByRole("combobox", { name: /rôle de alice/i }),
    "standard",
  );
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));
  expect(await screen.findByRole("dialog")).toBeVisible();

  await user.click(screen.getByRole("button", { name: /annuler/i }));

  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  expect(api.removePlatformRole).not.toHaveBeenCalled();
});
