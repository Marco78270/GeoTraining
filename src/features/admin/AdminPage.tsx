import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bookmark,
  CircleAlert,
  Globe2,
  GraduationCap,
  Map,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth/authContext";
import { ProfileMenu } from "./ProfileMenu";
import {
  getAdminApi,
  type AdminApi,
  type PlatformRole,
} from "./adminApi";
import { adminKeys } from "./adminKeys";

type RoleSelectValue = PlatformRole | "standard";

type PendingAdminAction =
  | {
      type: "remove-role";
      userId: string;
      email: string | null;
      displayName: string | null;
      role: PlatformRole | null;
    }
  | {
      type: "delete-user";
      userId: string;
      email: string | null;
      displayName: string | null;
      role: PlatformRole | null;
    };

export function AdminPage({ api = getAdminApi() }: { api?: AdminApi }) {
  const rootSuperAdminEmail = "marc.roger@outlook.fr";
  const [selectedRoleByUser, setSelectedRoleByUser] = useState<
    Record<string, RoleSelectValue>
  >({});
  const { signOut, user } = useAuth();
  const queryClient = useQueryClient();
  const [actionNotice, setActionNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAdminAction | null>(null);

  const clearSelectedRole = (userId: string) => {
    setSelectedRoleByUser((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });
  };

  const roleQuery = useQuery({
    queryKey: adminKeys.role(),
    queryFn: () => api.getCurrentPlatformRole(),
  });
  const usersQuery = useQuery({
    queryKey: adminKeys.users(),
    queryFn: () => api.listPlatformUsers(),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: adminKeys.role() });
    await queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    await queryClient.refetchQueries({ queryKey: adminKeys.users(), type: "active" });
  };

  const setRole = useMutation({
    mutationFn: ({
      userId,
      role,
    }: {
      userId: string;
      role: PlatformRole;
    }) => api.setPlatformRole(userId, role),
    onSuccess: async (_, variables) => {
      setSelectedRoleByUser((current) => ({
        ...current,
        [variables.userId]: variables.role,
      }));
      setActionNotice({
        tone: "success",
        message: "Le rôle administrateur a été mis à jour.",
      });
      await refresh();
    },
    onError: (error, variables) => {
      clearSelectedRole(variables.userId);
      setActionNotice({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Impossible de mettre à jour le rôle.",
      });
    },
  });

  const removeRole = useMutation({
    mutationFn: (userId: string) => api.removePlatformRole(userId),
    onSuccess: async (_, userId) => {
      setSelectedRoleByUser((current) => ({
        ...current,
        [userId]: "standard",
      }));
      setActionNotice({
        tone: "success",
        message: "Le rôle administrateur a bien été retiré.",
      });
      await refresh();
    },
    onError: (error, userId) => {
      clearSelectedRole(userId);
      setActionNotice({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Impossible de retirer le rôle.",
      });
    },
  });

  const deleteUser = useMutation({
    mutationFn: (userId: string) => api.deletePlatformUser(userId),
    onSuccess: async () => {
      setActionNotice({
        tone: "success",
        message: "Le compte utilisateur a bien été supprimé.",
      });
      await refresh();
    },
    onError: (error) => {
      setActionNotice({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Impossible de supprimer ce compte.",
      });
    },
  });

  const isAccessDenied =
    !roleQuery.isLoading &&
    roleQuery.data !== "admin" &&
    roleQuery.data !== "super_admin";
  const destructiveActionPending =
    removeRole.isPending || deleteUser.isPending || setRole.isPending;

  const confirmPendingAction = () => {
    if (!pendingAction) return;

    if (pendingAction.type === "remove-role") {
      removeRole.mutate(pendingAction.userId);
      setPendingAction(null);
      return;
    }

    deleteUser.mutate(pendingAction.userId);
    setPendingAction(null);
  };

  return (
    <main className="app-shell atlas-module-page">
      <header className="topbar atlas-topbar">
        <Link className="brand brand-link" to="/atlas" aria-label="GeoTrainer Atlas">
          <Globe2 className="brand-globe" aria-hidden="true" />
          <strong>GeoTrainer</strong>
          <span>Atlas</span>
        </Link>
        <nav className="atlas-nav" aria-label="Navigation principale">
          <NavLink to="/atlas">
            <Map />
            Atlas
          </NavLink>
          <NavLink to="/collections">
            <Bookmark />
            Collections
          </NavLink>
          <NavLink to="/training">
            <GraduationCap />
            Entraînement
          </NavLink>
          <NavLink to="/leaderboard">
            <Trophy />
            Classement
          </NavLink>
          <NavLink to="/admin">
            <ShieldCheck />
            Administration
          </NavLink>
          <NavLink to="/statistics">
            <BarChart3 />
            Statistiques
          </NavLink>
        </nav>
        <ProfileMenu
          email={user?.email}
          platformRole={roleQuery.data ?? null}
          onSignOut={() => {
            void signOut();
          }}
        />
      </header>

      <div className="collections-layout admin-layout">
        <aside className="panel collections-sidebar admin-sidebar">
          <p className="eyebrow">Plateforme</p>
          <h1>Gestion utilisateurs</h1>
          <p>
            Rôle actuel :{" "}
            {roleQuery.data === "super_admin"
              ? "Super-admin"
              : roleQuery.data === "admin"
                ? "Admin"
                : "Vérification..."}
          </p>
          <p>
            {usersQuery.isLoading
              ? "Chargement des comptes..."
              : `${(usersQuery.data ?? []).length} compte(s) inscrit(s).`}
          </p>
          <div className="atlas-filter-section">
            <h2>Accès</h2>
            <p className="admin-sidebar-note">
              Les admins peuvent consulter la liste complète des inscrits. Les
              super-admins peuvent en plus attribuer et retirer les rôles.
            </p>
            <p className="admin-sidebar-note">
              Le retrait enlève uniquement le rôle administrateur, sans supprimer
              le compte utilisateur.
            </p>
          </div>
        </aside>

        <section className="panel admin-panel">
          {roleQuery.isLoading || usersQuery.isLoading ? (
            <p role="status">Chargement de l'administration...</p>
          ) : null}

          {actionNotice ? (
            <p
              className={`notice ${actionNotice.tone === "error" ? "notice-error" : "notice-success"}`}
              role={actionNotice.tone === "error" ? "alert" : "status"}
            >
              {actionNotice.message}
            </p>
          ) : null}

          {isAccessDenied ? (
            <p className="notice notice-error" role="alert">
              Accès administrateur requis.
            </p>
          ) : null}

          {!isAccessDenied && !roleQuery.isLoading && !usersQuery.isLoading ? (
            <div
              className="admin-users-list"
              role="list"
              aria-label="Utilisateurs inscrits"
            >
              {(usersQuery.data ?? []).map((userItem) => {
                const isRootSuperAdmin =
                  userItem.email?.toLowerCase() === rootSuperAdminEmail &&
                  userItem.role === "super_admin";
                const isCurrentUser = userItem.id === user?.id;
                const canDeleteUser = !isRootSuperAdmin && !isCurrentUser;
                const selectedRole =
                  selectedRoleByUser[userItem.id] ?? userItem.role ?? "standard";
                const roleLabel =
                  selectedRole === "super_admin"
                    ? "Super-admin"
                    : selectedRole === "admin"
                      ? "Admin"
                      : "Standard";
                const roleHasChanged = selectedRole !== (userItem.role ?? "standard");

                return (
                  <article
                    key={userItem.id}
                    className="admin-user-card"
                    role="listitem"
                  >
                    <div className="admin-user-main">
                      <strong>
                        {userItem.displayName || userItem.email || "Utilisateur"}
                      </strong>
                      <span>{userItem.email ?? "Email indisponible"}</span>
                    </div>
                    <span className="atlas-chip">{roleLabel}</span>
                    {roleQuery.data === "super_admin" ? (
                      <div className="admin-user-actions">
                        <select
                          aria-label={`Rôle de ${userItem.displayName || userItem.email || "cet utilisateur"}`}
                          value={selectedRole}
                          onChange={(event) =>
                            setSelectedRoleByUser((current) => ({
                              ...current,
                              [userItem.id]: event.target.value as RoleSelectValue,
                            }))
                          }
                          disabled={isRootSuperAdmin}
                        >
                          <option value="standard">Utilisateur standard</option>
                          <option value="admin">Admin</option>
                          <option value="super_admin">Super-admin</option>
                        </select>
                        <button
                          type="button"
                          className="text-button"
                          disabled={
                            destructiveActionPending || isRootSuperAdmin || !roleHasChanged
                          }
                          onClick={() => {
                            if (selectedRole === "standard") {
                              setPendingAction({
                                type: "remove-role",
                                userId: userItem.id,
                                email: userItem.email,
                                displayName: userItem.displayName,
                                role: userItem.role,
                              });
                              return;
                            }

                            setRole.mutate({
                              userId: userItem.id,
                              role: selectedRole,
                            });
                          }}
                        >
                          Enregistrer
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          disabled={!canDeleteUser}
                          onClick={() =>
                            setPendingAction({
                              type: "delete-user",
                              userId: userItem.id,
                              email: userItem.email,
                              displayName: userItem.displayName,
                              role: userItem.role,
                            })
                          }
                        >
                          {isRootSuperAdmin
                            ? "Compte racine protégé"
                            : isCurrentUser
                              ? "Impossible de se supprimer"
                              : "Supprimer le compte"}
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>

      {pendingAction ? (
        <div className="clue-preview-backdrop" role="presentation">
          <section
            className="clue-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-confirmation-title"
          >
            <header>
              <div>
                <span>Confirmation requise</span>
                <h2 id="admin-confirmation-title">
                  {pendingAction.type === "remove-role"
                    ? "Retirer ce rôle administrateur ?"
                    : "Supprimer ce compte utilisateur ?"}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Fermer la confirmation"
                onClick={() => setPendingAction(null)}
              >
                ×
              </button>
            </header>

            <div className="clue-preview-meta">
              <CircleAlert aria-hidden="true" />
              <strong>
                {pendingAction.displayName || pendingAction.email || "Utilisateur"}
              </strong>
              {pendingAction.email ? <span>{pendingAction.email}</span> : null}
            </div>

            <p>
              {pendingAction.type === "remove-role"
                ? "Le compte restera actif, mais il repassera immédiatement en utilisateur standard."
                : "Le compte sera supprimé de la plateforme. Si cet utilisateur possède encore des collections, des indices ou des invitations, l'opération sera refusée avec un message explicite."}
            </p>

            {pendingAction.role ? (
              <p>
                Rôle actuel :{" "}
                <strong>
                  {pendingAction.role === "super_admin" ? "Super-admin" : "Admin"}
                </strong>
              </p>
            ) : null}

            <footer>
              <button
                type="button"
                className="clue-delete-button"
                onClick={confirmPendingAction}
                disabled={destructiveActionPending}
              >
                {pendingAction.type === "remove-role"
                  ? "Confirmer le retrait"
                  : "Confirmer la suppression"}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setPendingAction(null)}
                disabled={destructiveActionPending}
              >
                Annuler
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
