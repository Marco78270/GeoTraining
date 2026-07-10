import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../auth/authContext";
import type { LeaderboardApi } from "./leaderboardApi";
import { LeaderboardPage } from "./LeaderboardPage";

const session = { user: { id: "u1", email: "marc@example.test" } } as Session;
const auth: AuthContextValue = {
  session, user: session.user, loading: false, configurationError: null, sessionError: null,
  signIn: async () => ({ error: null }), signUp: async () => ({ error: null }),
  signOut: async () => ({ error: null }),
};

function api(): LeaderboardApi {
  return {
    listDaily: vi.fn().mockResolvedValue({
      entries: [{ userId: "u1", username: "Marc", avatarUrl: null, rank: 1,
        correctAnswers: 8, accuracyPercent: 80, durationMs: 65000, dailyPoints: 837,
        completedAt: "2026-07-06T10:00:00Z", xpTotal: 1540 }],
      totalCount: 1, page: 1, pageSize: 25,
    }),
    listGlobal: vi.fn().mockResolvedValue({
      entries: [{ userId: "u1", username: "Marc", avatarUrl: null, rank: 2,
        totalPoints: 2450, participationCount: 3, correctAnswers: 24, totalAnswers: 30,
        accuracyPercent: 80, totalDurationMs: 190000, xpTotal: 1540 }],
      totalCount: 1, page: 1, pageSize: 25,
    }),
    loadMyDailyProgress: vi.fn().mockResolvedValue({
      rank: 1, correctAnswers: 8, accuracyPercent: 80, durationMs: 65000,
      dailyPoints: 837, visible: true,
    }),
    loadMyGlobalProgress: vi.fn().mockResolvedValue({
      rank: 2, totalPoints: 2450, participationCount: 3, correctAnswers: 24,
      totalAnswers: 30, accuracyPercent: 80, totalDurationMs: 190000, visible: true,
    }),
  };
}

function renderPage(service: LeaderboardApi, path = "/leaderboard?view=today&challenge=2026-07-06") {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AuthContext.Provider value={auth}><MemoryRouter initialEntries={[path]}>
      <LeaderboardPage leaderboardApi={service} />
    </MemoryRouter></AuthContext.Provider>
  </QueryClientProvider>);
}

describe("LeaderboardPage", () => {
  it("shows today's mixed daily ranking", async () => {
    const service = api();
    renderPage(service);
    expect(await screen.findByRole("heading", { name: "Classement du jour" })).toBeVisible();
    expect((await screen.findAllByText("8 / 10")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("1:05").length).toBeGreaterThan(0);
    expect(service.listDaily).toHaveBeenCalledWith("2026-07-06", 1, 25);
  });

  it("switches to the cumulative global ranking", async () => {
    const user = userEvent.setup();
    const service = api();
    renderPage(service);
    await user.click(screen.getByRole("tab", { name: "Général" }));
    expect(await screen.findByRole("heading", { name: "Classement général" })).toBeVisible();
    await waitFor(() => expect(service.listGlobal).toHaveBeenCalledWith(1, 25));
    expect(screen.getAllByText("2450").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
  });
});
