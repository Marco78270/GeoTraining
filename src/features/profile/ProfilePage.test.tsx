import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Session } from "@supabase/supabase-js";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthContext,
  type AuthContextValue,
} from "../auth/authContext";
import type { ProfileApi } from "./profileApi";
import { ProfileApiError } from "./profileApi";
import { ProfilePage } from "./ProfilePage";
import { defaultBillingStatus } from "../billing/billingApi";

vi.mock("./avatarImage", () => ({
  prepareAvatar: vi.fn(async (file: File) => file),
}));

const authValue: AuthContextValue = {
  session: { user: { id: "user-1", email: "marc@example.test" } } as Session,
  user: { id: "user-1", email: "marc@example.test" } as Session["user"],
  loading: false,
  configurationError: null,
  sessionError: null,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => ({ error: null }),
};

function createApi(): ProfileApi {
  return {
    load: vi.fn(async () => ({
      id: "user-1",
      username: "Marco78270",
      avatarUrl: null,
      email: "marc@example.test",
      usernameChangedAt: "2026-06-01T10:00:00.000Z",
      leaderboardVisible: true,
      xpTotal: 0,
      billing: defaultBillingStatus,
    })),
    updateUsername: vi.fn(async (username: string) => ({
      id: "user-1",
      username,
      avatarUrl: null,
      email: "marc@example.test",
      usernameChangedAt: "2026-06-30T10:00:00.000Z",
      leaderboardVisible: true,
      xpTotal: 0,
      billing: defaultBillingStatus,
    })),
    updateLeaderboardVisibility: vi.fn(async (leaderboardVisible: boolean) => ({
      id: "user-1",
      username: "Marco78270",
      avatarUrl: null,
      email: "marc@example.test",
      usernameChangedAt: "2026-06-01T10:00:00.000Z",
      leaderboardVisible,
      xpTotal: 0,
      billing: defaultBillingStatus,
    })),
    requestEmailChange: vi.fn(async () => {}),
    replaceAvatar: vi.fn(async () => ({
      id: "user-1",
      username: "Marco78270",
      avatarUrl: "https://cdn.example.test/avatar.webp",
      email: "marc@example.test",
      usernameChangedAt: "2026-06-01T10:00:00.000Z",
      leaderboardVisible: true,
      xpTotal: 0,
      billing: defaultBillingStatus,
    })),
    removeAvatar: vi.fn(async () => ({
      id: "user-1",
      username: "Marco78270",
      avatarUrl: null,
      email: "marc@example.test",
      usernameChangedAt: "2026-06-01T10:00:00.000Z",
      leaderboardVisible: true,
      xpTotal: 0,
      billing: defaultBillingStatus,
    })),
  };
}

function renderPage(api: ProfileApi) {
  const queryClient = new QueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authValue}>
        <MemoryRouter initialEntries={["/profile"]}>
          <ProfilePage api={api} />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("charge le profil courant", async () => {
    const api = createApi();
    renderPage(api);

    expect(await screen.findByDisplayValue("Marco78270")).toBeInTheDocument();
    expect(screen.getByDisplayValue("marc@example.test")).toBeInTheDocument();
    expect(screen.getAllByText("Gratuit").length).toBeGreaterThan(0);
    expect(screen.getByText("Bronze III")).toBeInTheDocument();
    expect(screen.getByText(/xp totale/i)).toBeInTheDocument();
    expect(screen.getAllByText(/premium/i).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("checkbox", {
        name: /apparaitre dans les classements/i,
      }),
    ).toBeChecked();
  });

  it("affiche un rang plus eleve et le badge premium quand le profil a beaucoup d'xp", async () => {
    const api = createApi();
    vi.mocked(api.load).mockResolvedValueOnce({
      id: "user-1",
      username: "Marco78270",
      avatarUrl: null,
      email: "marc@example.test",
      usernameChangedAt: "2026-06-01T10:00:00.000Z",
      leaderboardVisible: true,
      xpTotal: 1540,
      billing: {
        ...defaultBillingStatus,
        planKey: "premium_monthly",
        status: "active",
        premiumEnabled: true,
      },
    });
    renderPage(api);

    expect(await screen.findByText("Or III")).toBeInTheDocument();
    expect(screen.getByText("1540 XP")).toBeInTheDocument();
    expect(screen.getByLabelText("Rang Or III")).toBeVisible();
    expect(screen.getByText("460 XP avant Or II")).toBeVisible();
    expect(
      screen.getByRole("progressbar", { name: /progression vers or ii/i }),
    ).toHaveAttribute("aria-valuenow", "8");
    expect(screen.getAllByText(/premium/i).length).toBeGreaterThan(0);
  });

  it("enregistre un nouveau nom d'utilisateur", async () => {
    const user = userEvent.setup();
    const api = createApi();
    renderPage(api);

    const input = await screen.findByDisplayValue("Marco78270");
    await user.clear(input);
    await user.type(input, "Marc Geo");
    await user.click(screen.getByRole("button", { name: /enregistrer le nom/i }));

    await waitFor(() => {
      expect(api.updateUsername).toHaveBeenCalledWith("Marc Geo");
    });
  });

  it("affiche le message de cooldown quand le pseudo est verrouille", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.updateUsername).mockRejectedValueOnce(
      new ProfileApiError("username_cooldown", new Error("cooldown")),
    );
    renderPage(api);

    const input = await screen.findByDisplayValue("Marco78270");
    await user.clear(input);
    await user.type(input, "Marc Geo");
    await user.click(screen.getByRole("button", { name: /enregistrer le nom/i }));

    expect(
      await screen.findByText(/une modification est possible tous les 30 jours/i),
    ).toBeVisible();
  });

  it("annonce qu'un email de confirmation va etre envoye", async () => {
    const user = userEvent.setup();
    const api = createApi();
    renderPage(api);

    const input = await screen.findByDisplayValue("marc@example.test");
    await user.clear(input);
    await user.type(input, "next@example.test");
    await user.click(screen.getByRole("button", { name: /mettre a jour l'email/i }));

    await waitFor(() => {
      expect(api.requestEmailChange).toHaveBeenCalledWith("next@example.test");
    });
    expect(
      await screen.findByText(/supabase va envoyer un email de confirmation/i),
    ).toBeVisible();
  });

  it("prepare puis envoie une image choisie pour l'avatar", async () => {
    const api = createApi();
    renderPage(api);

    const input = (await screen.findByLabelText(/choisir un avatar/i)) as HTMLInputElement;
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });

    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(api.replaceAvatar).toHaveBeenCalled();
    });
  });

  it("accepte aussi une image collee depuis le presse-papiers", async () => {
    const api = createApi();
    renderPage(api);

    const avatarInput = await screen.findByLabelText(/choisir un avatar/i);
    const dropZone = avatarInput.closest("label");
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    const pasteEvent = new Event("paste", { bubbles: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => file,
          },
        ],
      },
    });

    expect(dropZone).not.toBeNull();
    fireEvent(dropZone as HTMLElement, pasteEvent);

    await waitFor(() => {
      expect(api.replaceAvatar).toHaveBeenCalled();
    });
  });

  it("retire l'avatar courant", async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.load).mockResolvedValueOnce({
      id: "user-1",
      username: "Marco78270",
      avatarUrl: "https://cdn.example.test/avatar.webp",
      email: "marc@example.test",
      usernameChangedAt: "2026-06-01T10:00:00.000Z",
      leaderboardVisible: true,
      xpTotal: 0,
      billing: defaultBillingStatus,
    });
    renderPage(api);

    await user.click(await screen.findByRole("button", { name: /retirer l'avatar/i }));

    await waitFor(() => {
      expect(api.removeAvatar).toHaveBeenCalled();
    });
  });

  it("met a jour la visibilite dans le classement", async () => {
    const user = userEvent.setup();
    const api = createApi();
    renderPage(api);

    await user.click(
      await screen.findByRole("checkbox", {
        name: /apparaitre dans les classements/i,
      }),
    );

    await waitFor(() => {
      expect(api.updateLeaderboardVisibility).toHaveBeenCalledWith(false);
    });
  });
});
