import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Session } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import {
  AuthProvider,
  type AuthClient,
} from "./AuthProvider";
import { useAuth } from "./authContext";

function Probe() {
  const { loading, user, sessionError, signOut } = useAuth();

  return (
    <>
      <p>{loading ? "chargement" : user?.id ?? "anonyme"}</p>
      {sessionError ? <p role="alert">{sessionError}</p> : null}
      <button type="button" onClick={() => void signOut()}>
        Déconnexion test
      </button>
    </>
  );
}

it("loads the initial session, follows auth changes, and cleans the subscription", async () => {
  const initialSession = {
    user: { id: "initial-user" },
  } as Session;
  const nextSession = {
    user: { id: "next-user" },
  } as Session;
  const unsubscribe = vi.fn();
  let authChange:
    | ((event: string, session: Session | null) => void)
    | undefined;
  const client: AuthClient = {
    getSession: vi.fn().mockResolvedValue({
      data: { session: initialSession },
      error: null,
    }),
    onAuthStateChange: vi.fn((callback) => {
      authChange = callback;
      return { data: { subscription: { unsubscribe } } };
    }),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };

  const { unmount } = render(
    <AuthProvider client={client}>
      <Probe />
    </AuthProvider>,
  );

  expect(await screen.findByText("initial-user")).toBeVisible();

  authChange?.("SIGNED_IN", nextSession);
  expect(await screen.findByText("next-user")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Déconnexion test" }));
  await waitFor(() => expect(client.signOut).toHaveBeenCalledOnce());

  unmount();
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it("keeps an auth event received before getSession resolves", async () => {
  const staleSession = {
    user: { id: "stale-user" },
  } as Session;
  const freshSession = {
    user: { id: "fresh-user" },
  } as Session;
  let resolveSession:
    | ((value: {
        data: { session: Session | null };
        error: Error | null;
      }) => void)
    | undefined;
  let authChange:
    | ((event: string, session: Session | null) => void)
    | undefined;
  const client: AuthClient = {
    getSession: vi.fn(
      () =>
        new Promise<{
          data: { session: Session | null };
          error: Error | null;
        }>((resolve) => {
          resolveSession = resolve;
        }),
    ),
    onAuthStateChange: vi.fn((callback) => {
      authChange = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  };

  render(
    <AuthProvider client={client}>
      <Probe />
    </AuthProvider>,
  );

  expect(client.onAuthStateChange).toHaveBeenCalledOnce();
  authChange?.("SIGNED_IN", freshSession);
  expect(await screen.findByText("fresh-user")).toBeVisible();

  resolveSession?.({ data: { session: staleSession }, error: null });

  await waitFor(() => {
    expect(screen.getByText("fresh-user")).toBeVisible();
    expect(screen.queryByText("stale-user")).not.toBeInTheDocument();
  });
});

it("stops loading and exposes a getSession rejection", async () => {
  const unsubscribe = vi.fn();
  const client: AuthClient = {
    getSession: vi.fn().mockRejectedValue(new Error("Session indisponible")),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe } },
    })),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  };

  const { unmount } = render(
    <AuthProvider client={client}>
      <Probe />
    </AuthProvider>,
  );

  expect(await screen.findByText("anonyme")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("Session indisponible");

  unmount();
  expect(unsubscribe).toHaveBeenCalledOnce();
});
