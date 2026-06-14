import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  AuthContext,
  type AuthContextValue,
} from "../auth/authContext";
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
        correct_answers: 8,
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
          <StatisticsPage statisticsApi={statisticsApi} />
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StatisticsPage", () => {
  it("renders the statistics heading and summary cards", async () => {
    renderStatisticsPage();

    expect(await screen.findByRole("heading", { name: /statistiques/i })).toBeVisible();
    expect(await screen.findByText("Précision moyenne")).toBeVisible();
    expect((await screen.findAllByText("80%")).length).toBeGreaterThan(0);
  });

  it("shows an empty state when no sessions exist", async () => {
    renderStatisticsPage(
      createStatisticsApi({
        loadSessions: async () => [],
      }),
    );

    expect(
      await screen.findByText(/aucune session enregistrée pour le moment/i),
    ).toBeInTheDocument();
  });
});
