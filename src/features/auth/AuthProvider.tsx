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
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    if (!resolved.client) {
      return;
    }

    let active = true;
    let authEventVersion = 0;
    const { data } = resolved.client.onAuthStateChange(
      (_event, nextSession) => {
        if (!active) {
          return;
        }

        authEventVersion += 1;
        setSession(nextSession);
        setSessionError(null);
        setLoading(false);
      },
    );

    void resolved.client
      .getSession()
      .then(({ data: sessionData, error }) => {
        if (!active) {
          return;
        }

        if (error && authEventVersion === 0) {
          setSessionError(error.message);
        } else if (authEventVersion === 0) {
          setSession(sessionData.session);
        }
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        if (authEventVersion === 0) {
          setSessionError(
            error instanceof Error
              ? error.message
              : "Impossible de charger la session.",
          );
        }
        setLoading(false);
      });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [resolved.client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configurationError: resolved.error,
      sessionError,
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
    [loading, resolved.client, resolved.error, session, sessionError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
