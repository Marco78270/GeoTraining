import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Session } from "@supabase/supabase-js";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import {
  AuthContext,
  type AuthContextValue,
} from "../features/auth/authContext";
import { App } from "./App";

const anonymousAuth: AuthContextValue = {
  session: null,
  user: null,
  loading: false,
  configurationError: null,
  sessionError: null,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => ({ error: null }),
};

function renderApp(
  auth: AuthContextValue = anonymousAuth,
  initialPath = "/",
) {
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

it("redirects anonymous visitors to login and renders the brand", async () => {
  renderApp();

  expect(screen.getByText("GeoTrainer")).toBeInTheDocument();
  expect(screen.getByText("Atlas")).toBeInTheDocument();
  expect(
    await screen.findByRole("heading", { name: "Se connecter" }),
  ).toBeVisible();
});

it("lands authenticated visitors on Atlas and allows signing out", async () => {
  const user = userEvent.setup();
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const session = { user: { id: "user-1" } } as Session;

  renderApp({
    ...anonymousAuth,
    session,
    user: session.user,
    signOut,
  });

  expect(await screen.findByRole("heading", { name: "Atlas" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Se déconnecter" }));
  expect(signOut).toHaveBeenCalledOnce();
});
