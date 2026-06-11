import { useLocation, useNavigate } from "react-router-dom";
import { AuthForm } from "./AuthForm";
import {
  useOptionalAuth,
  type AuthActionResult,
} from "./authContext";

type ReturnLocation = {
  pathname?: unknown;
  search?: unknown;
  hash?: unknown;
};

function getSafeReturnPath(from: ReturnLocation | undefined) {
  if (
    typeof from?.pathname !== "string" ||
    !from.pathname.startsWith("/") ||
    from.pathname.startsWith("//")
  ) {
    return "/atlas";
  }

  const search =
    typeof from.search === "string" && from.search.startsWith("?")
      ? from.search
      : "";
  const hash =
    typeof from.hash === "string" && from.hash.startsWith("#") ? from.hash : "";

  return `${from.pathname}${search}${hash}`;
}

export function LoginPage({
  signIn: suppliedSignIn,
}: {
  signIn?: (email: string, password: string) => AuthActionResult;
}) {
  const auth = useOptionalAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = getSafeReturnPath(
    (location.state as { from?: ReturnLocation } | null)?.from,
  );

  return (
    <AuthForm
      mode="login"
      action={
        suppliedSignIn ??
        auth?.signIn ??
        (async () => ({ error: new Error("Authentification indisponible.") }))
      }
      configurationError={suppliedSignIn ? null : auth?.configurationError}
      sessionError={suppliedSignIn ? null : auth?.sessionError}
      onSuccess={() => navigate(from, { replace: true })}
    />
  );
}
