import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RankBadge } from "./RankBadge";

describe("RankBadge", () => {
  it("renders an accessible Atlas badge for the full rank label", () => {
    render(<RankBadge rankKey="diamant_2" label="Diamant II" />);

    const badge = screen.getByLabelText("Rang Diamant II");
    expect(badge).toHaveClass("rank-badge", "rank-badge--medium");
    expect(badge.querySelectorAll("[data-rank-ornament]")).toHaveLength(2);
  });

  it("supports compact and large surfaces", () => {
    const { rerender } = render(
      <RankBadge rankKey="bronze_3" label="Bronze III" size="compact" />,
    );
    expect(screen.getByLabelText("Rang Bronze III")).toHaveClass(
      "rank-badge--compact",
    );

    rerender(<RankBadge rankKey="grand_master_1" label="Grand Master I" size="large" />);
    expect(screen.getByLabelText("Rang Grand Master I")).toHaveClass(
      "rank-badge--large",
    );
  });
});
