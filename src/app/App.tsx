import "../styles/global.css";
import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { RequireSession } from "../features/auth/RequireSession";
import { useAuth } from "../features/auth/authContext";
import { ActiveCollectionProvider } from "../features/collections/ActiveCollectionProvider";
import type { CollectionApi } from "../features/collections/collectionApi";
import { getClueApi, type ClueApi } from "../features/clues/clueApi";

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
const LeaderboardPage = lazy(async () => {
  const module = await import("../features/leaderboard/LeaderboardPage");
  return { default: module.LeaderboardPage };
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
const ProfilePage = lazy(async () => {
  const module = await import("../features/profile/ProfilePage");
  return { default: module.ProfilePage };
});
const PricingPage = lazy(async () => {
  const module = await import("../features/pricing/PricingPage");
  return { default: module.PricingPage };
});

function RootRedirect() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <main className="session-loading" role="status">
        Chargement de votre session...
      </main>
    );
  }

  return <Navigate to={session ? "/atlas" : "/login"} replace />;
}

function PageLoadingFallback() {
  return (
    <main className="session-loading" role="status">
      Chargement du module...
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

function CollectionWorkspaceRoute({ api }: { api?: CollectionApi }) {
  return (
    <CollectionWorkspace api={api}>
      <Outlet />
    </CollectionWorkspace>
  );
}

export function App({
  collectionApi,
  clueApi,
}: {
  collectionApi?: CollectionApi;
  clueApi?: ClueApi;
}) {
  const resolvedClueApi = clueApi ?? getClueApi();

  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<RequireSession />}>
        <Route
          element={<CollectionWorkspaceRoute api={collectionApi} />}
        >
          <Route path="/atlas" element={<AtlasPage />} />
          <Route
            path="/collections"
            element={<CollectionsPage api={collectionApi} />}
          />
          <Route path="/training" element={<TrainingPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route
            path="/clues/new"
            element={
              <ClueEditorPage
                clueApi={resolvedClueApi}
                collectionApi={collectionApi}
              />
            }
          />
          <Route
            path="/clues/:clueId/edit"
            element={
              <ClueEditorPage
                clueApi={resolvedClueApi}
                collectionApi={collectionApi}
              />
            }
          />
        </Route>
        <Route
          path="/invitations/:token"
          element={<AcceptInvitationPage api={collectionApi} />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
