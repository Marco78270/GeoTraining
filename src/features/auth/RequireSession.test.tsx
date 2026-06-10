import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { AuthContext, type AuthContextValue } from "./authContext";
import { RequireSession } from "./RequireSession";

const baseAuthValue: AuthContextValue = {
  session: null,
  user: null,
  loading: false,
  configurationError: null,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => ({ error: null }),
};

function LoginDestination() {
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from;

  return <p>Connexion depuis {from?.pathname ?? "inconnu"}</p>;
}

function renderProtected(value: AuthContextValue, path = "/atlas") {
  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginDestination />} />
          <Route element={<RequireSession />}>
            <Route path="/atlas" element={<h1>Atlas protégé</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("RequireSession", () => {
  it("announces loading accessibly", () => {
    renderProtected({ ...baseAuthValue, loading: true });

    expect(screen.getByRole("status")).toHaveTextContent("Chargement de votre session");
  });

  it("redirects anonymous users and preserves the requested location", () => {
    renderProtected(baseAuthValue);

    expect(screen.getByText("Connexion depuis /atlas")).toBeVisible();
  });

  it("renders protected routes for authenticated users", () => {
    const session = {
      user: { id: "user-1" },
    } as Session;

    renderProtected({
      ...baseAuthValue,
      session,
      user: session.user,
    });

    expect(screen.getByRole("heading", { name: "Atlas protégé" })).toBeVisible();
  });
});
