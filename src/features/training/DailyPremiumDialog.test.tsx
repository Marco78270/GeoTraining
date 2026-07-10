import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DailyPremiumDialog } from "./DailyPremiumDialog";

describe("DailyPremiumDialog", () => {
  it("renders premium benefits and actions", () => {
    render(
      <MemoryRouter>
        <DailyPremiumDialog open onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/résultat sauvegardé/i)).toBeInTheDocument();
    expect(screen.getByText(/classement quotidien/i)).toBeInTheDocument();
    expect(screen.getByText(/xp et rangs/i)).toBeInTheDocument();
    expect(screen.getByText(/statistiques et historique/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /passer premium - 1,99 eur \/ mois/i }),
    ).toHaveAttribute("href", "/pricing");
    expect(
      screen.getByRole("button", { name: /continuer gratuitement/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/coach ia bientôt disponible/i)).toBeInTheDocument();
  });

  it("supports escape to close", () => {
    const onClose = vi.fn();

    render(
      <MemoryRouter>
        <DailyPremiumDialog open onClose={onClose} />
      </MemoryRouter>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
