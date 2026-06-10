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
  const { loading, user, signOut } = useAuth();

  return (
    <>
      <p>{loading ? "chargement" : user?.id ?? "anonyme"}</p>
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
