import type {
  AuthChangeEvent,
  Session,
} from "@supabase/supabase-js";
import {
  type PropsWithChildren,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getSupabaseClient,
  SupabaseConfigurationError,
} from "../../lib/supabase";
import {
  AuthContext,
  type AuthActionResult,
  type AuthContextValue,
} from "./authContext";

export type { AuthActionResult, AuthContextValue } from "./authContext";

export type AuthClient = {
  getSession: () => Promise<{
    data: { session: Session | null };
    error: Error | null;
  }>;
  onAuthStateChange: (
    callback: (event: AuthChangeEvent | string, session: Session | null) => void,
  ) => { data: { subscription: { unsubscribe: () => void } } };
  signInWithPassword: (credentials: {
    email: string;
    password: string;
  }) => AuthActionResult;
  signUp: (credentials: {
    email: string;
    password: string;
  }) => AuthActionResult;
  signOut: () => AuthActionResult;
};

const unconfiguredAction = async (): AuthActionResult => ({
  error: new SupabaseConfigurationError(
    "Supabase n'est pas configuré pour cette application.",
  ),
});

function resolveAuthClient(client?: AuthClient): {
  client: AuthClient | null;
  error: string | null;
} {
  if (client) {
    return { client, error: null };
  }

  try {
    return { client: getSupabaseClient().auth, error: null };
  } catch (error) {
    return {
      client: null,
      error:
        error instanceof Error
          ? error.message
          : "La configuration Supabase est invalide.",
    };
  }
}

export function AuthProvider({
  children,
  client: suppliedClient,
}: PropsWithChildren<{ client?: AuthClient }>) {
  const [resolved] = useState(() => resolveAuthClient(suppliedClient));
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(resolved.client));

  useEffect(() => {
    if (!resolved.client) {
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | undefined;

    void resolved.client.getSession().then(({ data }) => {
      if (!active) {
        return;
      }

      setSession(data.session);
      setLoading(false);
      const result = resolved.client?.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
      });
      unsubscribe = result?.data.subscription.unsubscribe;
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [resolved.client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configurationError: resolved.error,
      signIn: resolved.client
        ? (email, password) =>
            resolved.client!.signInWithPassword({ email, password })
        : unconfiguredAction,
      signUp: resolved.client
        ? (email, password) => resolved.client!.signUp({ email, password })
        : unconfiguredAction,
      signOut: resolved.client
        ? () => resolved.client!.signOut()
        : unconfiguredAction,
    }),
    [loading, resolved.client, resolved.error, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
