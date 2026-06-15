import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { getAdminApi } from "../admin/adminApi";
import {
  AuthContext,
  type AuthContextValue,
} from "../auth/authContext";
import {
  ActiveCollectionContext,
  type ActiveCollectionContextValue,
} from "./activeCollectionContext";
import { CollectionsPage } from "./CollectionsPage";

vi.mock("../admin/adminApi", () => ({
  getAdminApi: vi.fn(),
}));

vi.mock("./CategoryList", () => ({
  CategoryList: ({ readOnly }: { readOnly?: boolean }) => (
    <div>Categories {readOnly ? "readonly" : "editable"}</div>
  ),
}));

vi.mock("./InviteEditorDialog", () => ({
  InviteEditorDialog: ({ isOwner }: { isOwner?: boolean }) => (
    <div>Invitations {isOwner ? "owner" : "viewer"}</div>
  ),
}));

const getCurrentPlatformRole = vi.fn().mockResolvedValue(null);

vi.mocked(getAdminApi).mockReturnValue({
  getCurrentPlatformRole,
} as unknown as ReturnType<typeof getAdminApi>);

const session = {
  user: { id: "user-1", email: "marc@example.test" },
} as Session;

const authValue: AuthContextValue = {
  session,
  user: session.user,
  loading: false,
  configurationError: null,
  sessionError: null,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => ({ error: null }),
};

const publicCollection = {
  id: "collection-public",
  name: "Collection officielle",
  description: "Collection partagée",
  owner_id: null,
  visibility: "public_readonly" as const,
  created_at: "2026-06-10T00:00:00.000Z",
  updated_at: "2026-06-10T00:00:00.000Z",
  role: null,
};

const activeCollectionValue: ActiveCollectionContextValue = {
  collections: [publicCollection],
  activeCollection: publicCollection,
  activeCollectionId: publicCollection.id,
  setActiveCollectionId: vi.fn(),
  isLoading: false,
  error: null,
};

function renderCollectionsPage(
  value: ActiveCollectionContextValue = activeCollectionValue,
) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>
          <ActiveCollectionContext.Provider value={value}>
            <CollectionsPage />
          </ActiveCollectionContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CollectionsPage", () => {
  it("shows an official badge for the public readonly collection", async () => {
    renderCollectionsPage();

    expect(await screen.findByText("Officielle")).toBeVisible();
    expect(
      screen.getByText(/visible par tous les utilisateurs/i),
    ).toBeVisible();
    expect(screen.getByText("Categories readonly")).toBeVisible();
    expect(screen.getByText("Invitations viewer")).toBeVisible();
  });

  it("allows the public collection owner to administer the official collection", async () => {
    const ownedPublicCollection = {
      ...publicCollection,
      owner_id: "user-1",
      role: "owner" as const,
    };

    renderCollectionsPage({
      ...activeCollectionValue,
      collections: [ownedPublicCollection],
      activeCollection: ownedPublicCollection,
      activeCollectionId: ownedPublicCollection.id,
    });

    expect(await screen.findByText("Officielle")).toBeVisible();
    expect(screen.getByText("Categories editable")).toBeVisible();
    expect(screen.getByText("Invitations owner")).toBeVisible();
    expect(screen.getByRole("button", { name: "Renommer" })).toBeVisible();
  });

  it("allows a platform admin to edit public categories without becoming owner", async () => {
    getCurrentPlatformRole.mockResolvedValueOnce("admin");
    renderCollectionsPage();

    expect(await screen.findByText("Officielle")).toBeVisible();
    expect(await screen.findByText("Categories editable")).toBeVisible();
    expect(await screen.findByText("Invitations owner")).toBeVisible();
    expect(await screen.findByRole("button", { name: "Renommer" })).toBeVisible();
  });
});
