import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext } from "react";

export type AuthActionResult = Promise<{ error: Error | null }>;

export type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configurationError: string | null;
  sessionError: string | null;
  signIn: (email: string, password: string) => AuthActionResult;
  signUp: (email: string, password: string) => AuthActionResult;
  signOut: () => AuthActionResult;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth doit être utilisé dans AuthProvider.");
  }

  return context;
}

export function useOptionalAuth() {
  return useContext(AuthContext);
}
