import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";

function renderLogin(signIn = vi.fn().mockResolvedValue({ error: null })) {
  render(
    <MemoryRouter>
      <LoginPage signIn={signIn} />
    </MemoryRouter>,
  );

  return signIn;
}

describe("LoginPage", () => {
  it("submits email and password", async () => {
    const user = userEvent.setup();
    const signIn = renderLogin();

    await user.type(screen.getByLabelText("Email"), "marco@example.com");
    await user.type(screen.getByLabelText("Mot de passe"), "secret123");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(signIn).toHaveBeenCalledWith("marco@example.com", "secret123");
  });

  it("shows accessible validation errors", async () => {
    const user = userEvent.setup();
    const signIn = renderLogin();

    await user.type(screen.getByLabelText("Email"), "adresse-invalide");
    await user.type(screen.getByLabelText("Mot de passe"), "court");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByText("Saisissez une adresse email valide.")).toBeVisible();
    expect(
      screen.getByText("Le mot de passe doit contenir au moins 8 caractères."),
    ).toBeVisible();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("displays a Supabase error and restores the submit button", async () => {
    const user = userEvent.setup();
    let resolveSignIn:
      | ((value: { error: Error | null }) => void)
      | undefined;
    const signIn = vi.fn(
      () =>
        new Promise<{ error: Error | null }>((resolve) => {
          resolveSignIn = resolve;
        }),
    );
    renderLogin(signIn);

    await user.type(screen.getByLabelText("Email"), "marco@example.com");
    await user.type(screen.getByLabelText("Mot de passe"), "secret123");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(screen.getByRole("button", { name: "Connexion en cours…" })).toBeDisabled();

    resolveSignIn?.({ error: new Error("Identifiants invalides") });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Identifiants invalides",
    );
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeEnabled();
  });

  it("recovers from a rejected network request", async () => {
    const user = userEvent.setup();
    renderLogin(
      vi.fn().mockRejectedValue(new Error("Réseau indisponible")),
    );

    await user.type(screen.getByLabelText("Email"), "marco@example.com");
    await user.type(screen.getByLabelText("Mot de passe"), "secret123");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Réseau indisponible",
    );
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeEnabled();
  });

  it("links to registration", () => {
    renderLogin();

    expect(screen.getByRole("link", { name: "Créer un compte" })).toHaveAttribute(
      "href",
      "/register",
    );
  });

  it("restores pathname, query, and hash after login", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn().mockResolvedValue({ error: null });

    function Destination() {
      const location = useLocation();
      return <p>{`${location.pathname}${location.search}${location.hash}`}</p>;
    }

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/login",
            state: {
              from: {
                pathname: "/atlas",
                search: "?collection=stop",
                hash: "#france",
              },
            },
          },
        ]}
      >
        <Routes>
          <Route path="/login" element={<LoginPage signIn={signIn} />} />
          <Route path="/atlas" element={<Destination />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("Email"), "marco@example.com");
    await user.type(screen.getByLabelText("Mot de passe"), "secret123");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByText("/atlas?collection=stop#france")).toBeVisible();
  });

  it("does not redirect to an external location from route state", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn().mockResolvedValue({ error: null });

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/login",
            state: {
              from: {
                pathname: "//malicious.example",
                search: "?steal=true",
              },
            },
          },
        ]}
      >
        <Routes>
          <Route path="/login" element={<LoginPage signIn={signIn} />} />
          <Route path="/atlas" element={<h1>Atlas sûr</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("Email"), "marco@example.com");
    await user.type(screen.getByLabelText("Mot de passe"), "secret123");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByRole("heading", { name: "Atlas sûr" })).toBeVisible();
  });
});
