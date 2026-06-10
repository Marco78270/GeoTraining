import "../styles/global.css";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { RequireSession } from "../features/auth/RequireSession";
import { useAuth } from "../features/auth/authContext";

function AtlasPlaceholder() {
  const { signOut, user } = useAuth();

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ◎
          </span>
          <strong>GeoTrainer</strong>
          <span>Atlas</span>
        </div>
        <div className="topbar-actions">
          <span>{user?.email}</span>
          <button type="button" className="secondary-button" onClick={() => void signOut()}>
            Se déconnecter
          </button>
        </div>
      </header>
      <section className="atlas-placeholder">
        <p className="eyebrow">Espace protégé</p>
        <h1>Atlas</h1>
        <p>La carte interactive sera ajoutée dans la prochaine étape.</p>
      </section>
    </main>
  );
}

function RootRedirect() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <main className="session-loading" role="status">
        Chargement de votre session…
      </main>
    );
  }

  return <Navigate to={session ? "/atlas" : "/login"} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<RequireSession />}>
        <Route path="/atlas" element={<AtlasPlaceholder />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
