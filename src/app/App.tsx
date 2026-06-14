import "../styles/global.css";
import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { RequireSession } from "../features/auth/RequireSession";
import { useAuth } from "../features/auth/authContext";
import { ActiveCollectionProvider } from "../features/collections/ActiveCollectionProvider";
import type { CollectionApi } from "../features/collections/collectionApi";

const AtlasPage = lazy(async () => {
  const module = await import("../features/atlas/AtlasPage");
  return { default: module.AtlasPage };
});
const CollectionsPage = lazy(async () => {
  const module = await import("../features/collections/CollectionsPage");
  return { default: module.CollectionsPage };
});
const TrainingPage = lazy(async () => {
  const module = await import("../features/training/TrainingPage");
  return { default: module.TrainingPage };
});
const StatisticsPage = lazy(async () => {
  const module = await import("../features/statistics/StatisticsPage");
  return { default: module.StatisticsPage };
});
const ClueEditorPage = lazy(async () => {
  const module = await import("../features/clues/ClueEditorPage");
  return { default: module.ClueEditorPage };
});
const AcceptInvitationPage = lazy(async () => {
  const module = await import("../features/collections/AcceptInvitationPage");
  return { default: module.AcceptInvitationPage };
});
const AdminPage = lazy(async () => {
  const module = await import("../features/admin/AdminPage");
  return { default: module.AdminPage };
});

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

function PageLoadingFallback() {
  return (
    <main className="session-loading" role="status">
      Chargement du module…
    </main>
  );
}

function CollectionWorkspace({
  api,
  children,
}: {
  api?: CollectionApi;
  children: ReactNode;
}) {
  return (
    <ActiveCollectionProvider api={api}>
      <Suspense fallback={<PageLoadingFallback />}>{children}</Suspense>
    </ActiveCollectionProvider>
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
          path="/training"
          element={
            <CollectionWorkspace api={collectionApi}>
              <TrainingPage />
            </CollectionWorkspace>
          }
        />
        <Route
          path="/statistics"
          element={
            <CollectionWorkspace api={collectionApi}>
              <StatisticsPage />
            </CollectionWorkspace>
          }
        />
        <Route
          path="/admin"
          element={
            <CollectionWorkspace api={collectionApi}>
              <AdminPage />
            </CollectionWorkspace>
          }
        />
        <Route
          path="/clues/new"
          element={
            <CollectionWorkspace api={collectionApi}>
              <ClueEditorPage collectionApi={collectionApi} />
            </CollectionWorkspace>
          }
        />
        <Route
          path="/clues/:clueId/edit"
          element={
            <CollectionWorkspace api={collectionApi}>
              <ClueEditorPage collectionApi={collectionApi} />
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
