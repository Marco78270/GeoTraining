import "../styles/global.css";
import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AtlasPage } from "../features/atlas/AtlasPage";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { RequireSession } from "../features/auth/RequireSession";
import { useAuth } from "../features/auth/authContext";
import { AcceptInvitationPage } from "../features/collections/AcceptInvitationPage";
import { ActiveCollectionProvider } from "../features/collections/ActiveCollectionProvider";
import type { CollectionApi } from "../features/collections/collectionApi";
import { CollectionsPage } from "../features/collections/CollectionsPage";

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

function CollectionWorkspace({
  api,
  children,
}: {
  api?: CollectionApi;
  children: ReactNode;
}) {
  return (
    <ActiveCollectionProvider api={api}>{children}</ActiveCollectionProvider>
  );
}

export function App({ collectionApi }: { collectionApi?: CollectionApi }) {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<RequireSession />}>
        <Route
          path="/atlas"
          element={
            <CollectionWorkspace api={collectionApi}>
              <AtlasPage />
            </CollectionWorkspace>
          }
        />
        <Route
          path="/collections"
          element={
            <CollectionWorkspace api={collectionApi}>
              <CollectionsPage api={collectionApi} />
            </CollectionWorkspace>
          }
        />
        <Route
          path="/invitations/:token"
          element={<AcceptInvitationPage api={collectionApi} />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
