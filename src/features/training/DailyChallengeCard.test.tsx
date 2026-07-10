import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DailyChallengeCard } from "./DailyChallengeCard";
import type { DailyChallenge } from "./trainingApi";

const baseChallenge: DailyChallenge = {
  status: "available",
  challengeId: "daily-1",
  challengeKey: "2026-07-03",
  collectionId: "collection-official",
  collectionName: "Collection officielle",
  categoryId: null,
  categoryName: "Toutes les catégories",
  mode: "world",
  questionCount: 10,
  secondsUntilReset: 45296,
  attemptStatus: "not_started",
};

function renderCard(challenge: DailyChallenge) {
  render(
    <MemoryRouter>
      <DailyChallengeCard
        challenge={challenge}
        leaderboardHref="/leaderboard?view=today&challenge=2026-07-03"
        onStart={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("DailyChallengeCard", () => {
  it("shows the compact ranked challenge content", () => {
    renderCard(baseChallenge);

    expect(screen.getByRole("heading", { name: "Défi quotidien (classé)" })).toBeVisible();
    expect(screen.getByText("10")).toBeVisible();
    expect(screen.getByText("Pays")).toBeVisible();
    expect(screen.getByText("Nouveau défi")).toBeVisible();
    expect(screen.getByText(/identique pour tous/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Classement" })).toHaveAttribute(
      "href",
      "/leaderboard?view=today&challenge=2026-07-03",
    );
    expect(screen.getByRole("button", { name: "Lancer" })).toBeVisible();
  });

  it("shows resume copy for an in-progress challenge", () => {
    renderCard({ ...baseChallenge, status: "in_progress", attemptStatus: "in_progress" });
    expect(screen.getByRole("button", { name: "Reprendre" })).toBeVisible();
  });

  it("hides the launch button once completed", () => {
    renderCard({ ...baseChallenge, status: "completed", attemptStatus: "completed" });
    expect(screen.queryByRole("button", { name: /lancer|reprendre/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Classement" })).toBeVisible();
  });
});
