import { AuthForm } from "./AuthForm";
import {
  useOptionalAuth,
  type AuthActionResult,
} from "./authContext";

export function RegisterPage({
  signUp: suppliedSignUp,
}: {
  signUp?: (email: string, password: string) => AuthActionResult;
}) {
  const auth = useOptionalAuth();

  return (
    <AuthForm
      mode="register"
      action={
        suppliedSignUp ??
        auth?.signUp ??
        (async () => ({ error: new Error("Authentification indisponible.") }))
      }
      configurationError={suppliedSignUp ? null : auth?.configurationError}
      sessionError={suppliedSignUp ? null : auth?.sessionError}
    />
  );
}
