import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ProfileMenu } from "./ProfileMenu";
import { profileKeys } from "../profile/profileApi";
import { defaultBillingStatus } from "../billing/billingApi";
import type { ProfileApi, UserProfile } from "../profile/profileApi";

function renderMenu(options?: {
  profile?: {
    id: string;
    username: string;
    avatarUrl: string | null;
        email: string;
        usernameChangedAt: string | null;
        leaderboardVisible: boolean;
        xpTotal: number;
        billing: typeof defaultBillingStatus;
      };
  loadProfile?: () => Promise<UserProfile>;
}) {
  const queryClient = new QueryClient();
  if (options?.profile) {
    queryClient.setQueryData(profileKeys.current(), options.profile);
  }

  const onSignOut = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProfileMenu
          email="marc@example.test"
          platformRole="admin"
          onSignOut={onSignOut}
          profileApi={{ load: options?.loadProfile ?? (() => new Promise(() => undefined)) } as ProfileApi}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { onSignOut };
}

describe("ProfileMenu", () => {
  it("affiche le pseudo public dans le trigger et garde l'email dans le menu", async () => {
    const user = userEvent.setup();
    renderMenu({
      profile: {
        id: "user-1",
        username: "Marco78270",
        avatarUrl: "https://cdn.example.test/avatar.webp",
        email: "marc@example.test",
        usernameChangedAt: null,
        leaderboardVisible: true,
        xpTotal: 1540,
        billing: defaultBillingStatus,
      },
    });

    expect(screen.getByRole("button", { name: /Marco78270/i })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Marco78270/i }));

    expect(screen.getByText("marc@example.test")).toBeVisible();
    expect(screen.getByText("Gratuit")).toBeVisible();
    expect(screen.getByText("Or III")).toBeVisible();
    expect(screen.getByText("1540 XP")).toBeVisible();
    expect(screen.getByLabelText("Rang Or III")).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: /mon profil/i }),
    ).toHaveAttribute("href", "/profile");
    expect(
      screen.getByRole("menuitem", { name: /classement/i }),
    ).toHaveAttribute("href", "/leaderboard");
    expect(
      screen.getByRole("menuitem", { name: /premium 1,99 eur \/ mois/i }),
    ).toHaveAttribute("href", "/pricing");
  });

  it("retombe sur l'email si le profil n'est pas encore en cache et permet toujours la deconnexion", async () => {
    const user = userEvent.setup();
    const { onSignOut } = renderMenu();

    await user.click(screen.getByRole("button", { name: /marc@example.test/i }));
    await user.click(screen.getByRole("menuitem", { name: /se déconnecter/i }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("charge le vrai XP et l'offre premium sans exiger une visite de la page profil", async () => {
    const user = userEvent.setup();
    renderMenu({
      loadProfile: async () => ({
        id: "user-1", username: "Marco78270", avatarUrl: null,
        email: "marc@example.test", usernameChangedAt: null,
        leaderboardVisible: true, xpTotal: 39,
        billing: { ...defaultBillingStatus, planKey: "premium_monthly", premiumEnabled: true },
      }),
    });

    expect(await screen.findByRole("button", { name: /Marco78270/i })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Marco78270/i }));
    expect(screen.getByText("39 XP")).toBeVisible();
    expect(screen.getByText("Premium mensuel")).toBeVisible();
  });
});
