import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { credentialsSchema, type Credentials } from "./authSchema";
import type { AuthActionResult } from "./authContext";

type AuthFormProps = {
  mode: "login" | "register";
  action: (email: string, password: string) => AuthActionResult;
  configurationError?: string | null;
  sessionError?: string | null;
  onSuccess?: () => void;
};

type FieldErrors = Partial<Record<keyof Credentials, string>>;

export function AuthForm({
  mode,
  action,
  configurationError,
  sessionError,
  onSuccess,
}: AuthFormProps) {
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const isLogin = mode === "login";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccess(false);

    const formData = new FormData(event.currentTarget);
    const parsed = credentialsSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "email" || field === "password") {
          errors[field] ??= issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setPending(true);
    let error: Error | null;

    try {
      ({ error } = await action(parsed.data.email, parsed.data.password));
    } catch (caughtError) {
      error =
        caughtError instanceof Error
          ? caughtError
          : new Error("Une erreur réseau inattendue est survenue.");
    } finally {
      setPending(false);
    }

    if (error) {
      setFormError(error.message);
      return;
    }

    setSuccess(true);
    onSuccess?.();
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="brand" aria-label="GeoTrainer Atlas">
          <span className="brand-mark" aria-hidden="true">
            ◎
          </span>
          <strong>GeoTrainer</strong>
          <span>Atlas</span>
        </div>
        <div>
          <p className="eyebrow">Votre atlas GeoGuessr privé</p>
          <h1 id="auth-title">
            {isLogin ? "Se connecter" : "Créer un compte"}
          </h1>
          <p className="auth-intro">
            {isLogin
              ? "Retrouvez vos collections d'indices et vos entraînements."
              : "Créez vos collections et partagez-les avec vos collaborateurs."}
          </p>
        </div>

        {configurationError ? (
          <p className="notice notice-error" role="alert">
            Configuration requise : {configurationError}
          </p>
        ) : null}
        {!configurationError && sessionError ? (
          <p className="notice notice-error" role="alert">
            Session indisponible : {sessionError}
          </p>
        ) : null}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label htmlFor={`${mode}-email`}>Email</label>
          <input
            id={`${mode}-email`}
            name="email"
            type="email"
            autoComplete="email"
            aria-describedby={
              fieldErrors.email ? `${mode}-email-error` : undefined
            }
            aria-invalid={Boolean(fieldErrors.email)}
          />
          {fieldErrors.email ? (
            <p id={`${mode}-email-error`} className="field-error">
              {fieldErrors.email}
            </p>
          ) : null}

          <label htmlFor={`${mode}-password`}>Mot de passe</label>
          <input
            id={`${mode}-password`}
            name="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            aria-describedby={
              fieldErrors.password ? `${mode}-password-error` : undefined
            }
            aria-invalid={Boolean(fieldErrors.password)}
          />
          {fieldErrors.password ? (
            <p id={`${mode}-password-error`} className="field-error">
              {fieldErrors.password}
            </p>
          ) : null}

          {formError ? (
            <p className="notice notice-error" role="alert">
              {formError}
            </p>
          ) : null}
          {success && !isLogin ? (
            <p className="notice notice-success" role="status">
              Compte créé. Consultez votre email pour confirmer votre inscription.
            </p>
          ) : null}

          <button
            className="primary-button"
            type="submit"
            disabled={pending || Boolean(configurationError)}
          >
            {pending
              ? isLogin
                ? "Connexion en cours…"
                : "Création en cours…"
              : isLogin
                ? "Se connecter"
                : "Créer mon compte"}
          </button>
        </form>

        <p className="auth-switch">
          {isLogin ? "Pas encore de compte ?" : "Déjà un compte ?"}{" "}
          <Link to={isLogin ? "/register" : "/login"}>
            {isLogin ? "Créer un compte" : "Se connecter"}
          </Link>
        </p>
      </section>
    </main>
  );
}
