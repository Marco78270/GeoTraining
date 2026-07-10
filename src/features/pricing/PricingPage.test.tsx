import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthContext, type AuthContextValue } from "../auth/authContext";
import { PricingPage } from "./PricingPage";

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

describe("PricingPage", () => {
  it("affiche la comparaison free/premium et l'état courant", async () => {
    const billingApi = {
      loadCurrent: async () => ({
        planKey: "free" as const,
        status: "inactive" as const,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        premiumEnabled: false,
      }),
      startCheckout: async () => ({
        url: "https://billing.example.test/checkout",
      }),
      openPortal: async () => ({
        url: "https://billing.example.test/portal",
      }),
    };

    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthContext.Provider value={authValue}>
          <MemoryRouter initialEntries={["/pricing"]}>
            <PricingPage billingApi={billingApi} />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: /offres geotrainer/i })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Gratuit" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Premium" })).toBeVisible();
    expect(screen.getAllByText(/1,99 eur \/ mois/i).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /activer premium 1,99 eur \/ mois/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /gérer mon abonnement/i }),
    ).toBeDisabled();
  });
});
