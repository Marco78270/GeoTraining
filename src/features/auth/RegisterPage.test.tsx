import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { RegisterPage } from "./RegisterPage";

it("submits a valid email and password", async () => {
  const user = userEvent.setup();
  const signUp = vi.fn().mockResolvedValue({ error: null });

  render(
    <MemoryRouter>
      <RegisterPage signUp={signUp} />
    </MemoryRouter>,
  );

  await user.type(screen.getByLabelText("Email"), "marco@example.com");
  await user.type(screen.getByLabelText("Mot de passe"), "secret123");
  await user.click(screen.getByRole("button", { name: "Créer mon compte" }));

  expect(signUp).toHaveBeenCalledWith("marco@example.com", "secret123");
  expect(
    await screen.findByText(
      "Compte créé. Consultez votre email pour confirmer votre inscription.",
    ),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Se connecter" })).toHaveAttribute(
    "href",
    "/login",
  );
});
