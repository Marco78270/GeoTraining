import { useLocation, useNavigate } from "react-router-dom";
import { AuthForm } from "./AuthForm";
import {
  useOptionalAuth,
  type AuthActionResult,
} from "./authContext";

export function LoginPage({
  signIn: suppliedSignIn,
}: {
  signIn?: (email: string, password: string) => AuthActionResult;
}) {
  const auth = useOptionalAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ??
    "/atlas";

  return (
    <AuthForm
      mode="login"
      action={
        suppliedSignIn ??
        auth?.signIn ??
        (async () => ({ error: new Error("Authentification indisponible.") }))
      }
      configurationError={suppliedSignIn ? null : auth?.configurationError}
      onSuccess={() => navigate(from, { replace: true })}
    />
  );
}
