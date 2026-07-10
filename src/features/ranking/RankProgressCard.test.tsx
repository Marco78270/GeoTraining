import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RankProgressCard } from "./RankProgressCard";

describe("RankProgressCard", () => {
  it("shows current rank, next rank, total XP, and remaining XP", () => {
    render(<RankProgressCard xp={190} />);

    expect(screen.getByText("Bronze II")).toBeVisible();
    expect(screen.getByText("190 XP")).toBeVisible();
    expect(screen.getByText("70 XP avant Bronze I")).toBeVisible();
    expect(screen.getByRole("progressbar", { name: /progression vers bronze i/i }))
      .toHaveAttribute("aria-valuenow", "50");
  });

  it("announces the maximum rank without a fake next threshold", () => {
    render(<RankProgressCard xp={16000} />);

    expect(screen.getByText("Grand Master I")).toBeVisible();
    expect(screen.getByText("Rang maximum atteint")).toBeVisible();
    expect(screen.getByRole("progressbar", { name: /rang maximum/i }))
      .toHaveAttribute("aria-valuenow", "100");
  });
});
