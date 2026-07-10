import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  AuthContext,
  type AuthContextValue,
} from "../auth/authContext";
import type { BillingApi } from "../billing/billingApi";
import { StatisticsPage } from "./StatisticsPage";
import type { StatisticsApi } from "./statisticsApi";

const session = { user: { id: "user-1", email: "marc@example.test" } } as Session;

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

function createStatisticsApi(overrides: Partial<StatisticsApi> = {}): StatisticsApi {
  return {
    loadSessions: async () => [
      {
        id: "session-1",
        user_id: "user-1",
        collection_id: "collection-1",
        mode: "world",
        country_code: null,
        category_id: "flags",
        total_questions: 10,
        is_ranked: true,
        challenge_type: "standard",
        challenge_key: null,
        duration_ms: 600000,
        correct_answers: 4,
        total_answers: 10,
        started_at: "2026-06-13T08:00:00.000Z",
        completed_at: "2026-06-13T08:10:00.000Z",
        created_at: "2026-06-13T08:00:00.000Z",
        updated_at: "2026-06-13T08:10:00.000Z",
        collections: { name: "Collection officielle" },
        categories: { name: "Drapeaux" },
      },
    ],
    ...overrides,
  };
}

function renderStatisticsPage(statisticsApi: StatisticsApi = createStatisticsApi()) {
  const billingApi: BillingApi = {
    loadCurrent: async () => ({
      planKey: "free",
      status: "inactive",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      premiumEnabled: false,
    }),
    startCheckout: async () => ({ url: "https://billing.example.test/checkout" }),
    openPortal: async () => ({ url: "https://billing.example.test/portal" }),
  };

  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>
          <StatisticsPage statisticsApi={statisticsApi} billingApi={billingApi} />
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StatisticsPage", () => {
  it("turns the weakest category into an actionable review priority", async () => {
    renderStatisticsPage();

    expect(await screen.findByRole("heading", { name: "Mon entraînement" }))
      .toBeVisible();
    expect(await screen.findByText("Priorité de révision")).toBeVisible();
    expect(screen.getAllByText("Drapeaux").length).toBeGreaterThan(0);
    expect(screen.getAllByText("À travailler").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /réviser maintenant/i }))
      .toHaveAttribute(
        "href",
        "/training?collection=collection-1&category=flags",
      );
    expect(screen.getByText("Gratuit")).toBeVisible();
    expect(screen.getByRole("heading", { name: /roadmap analyses/i })).toBeVisible();
  });

  it("shows a useful empty state when no sessions exist", async () => {
    renderStatisticsPage(
      createStatisticsApi({
        loadSessions: async () => [],
      }),
    );

    expect(await screen.findByText(/commence une première session/i))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: /réviser maintenant/i }))
      .toHaveAttribute("href", "/training");
  });
});
