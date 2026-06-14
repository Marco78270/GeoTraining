import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bookmark,
  Globe2,
  GraduationCap,
  Map,
  ShieldCheck,
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

export function AdminPage({ api = getAdminApi() }: { api?: AdminApi }) {
  const rootSuperAdminEmail = "marc.roger@outlook.fr";
  const [selectedRoleByUser, setSelectedRoleByUser] = useState<
    Record<string, PlatformRole>
  >({});
  const { signOut, user } = useAuth();
  const queryClient = useQueryClient();

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
  };

  const setRole = useMutation({
    mutationFn: ({
      userId,
      role,
    }: {
      userId: string;
      role: PlatformRole;
    }) => api.setPlatformRole(userId, role),
    onSuccess: refresh,
  });

  const removeRole = useMutation({
    mutationFn: (userId: string) => api.removePlatformRole(userId),
    onSuccess: refresh,
  });

  const isAccessDenied =
    !roleQuery.isLoading &&
    roleQuery.data !== "admin" &&
    roleQuery.data !== "super_admin";

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
          <NavLink to="/admin">
            <ShieldCheck />
            Administration
          </NavLink>
          <span aria-disabled="true">
            <BarChart3 />
            Statistiques <small>Bientôt</small>
          </span>
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
          </div>
        </aside>

        <section className="panel admin-panel">
          {roleQuery.isLoading || usersQuery.isLoading ? (
            <p role="status">Chargement de l'administration...</p>
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
                const roleLabel =
                  userItem.role === "super_admin"
                    ? "Super-admin"
                    : userItem.role === "admin"
                      ? "Admin"
                      : "Standard";
                const isRootSuperAdmin =
                  userItem.email?.toLowerCase() === rootSuperAdminEmail &&
                  userItem.role === "super_admin";

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
                          value={selectedRoleByUser[userItem.id] ?? "admin"}
                          onChange={(event) =>
                            setSelectedRoleByUser((current) => ({
                              ...current,
                              [userItem.id]: event.target.value as PlatformRole,
                            }))
                          }
                        >
                          <option value="admin">Admin</option>
                          <option value="super_admin">Super-admin</option>
                        </select>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            setRole.mutate({
                              userId: userItem.id,
                              role: selectedRoleByUser[userItem.id] ?? "admin",
                            })
                          }
                        >
                          Enregistrer
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          disabled={isRootSuperAdmin}
                          onClick={() => removeRole.mutate(userItem.id)}
                        >
                          {isRootSuperAdmin ? "Supervision racine" : "Retirer"}
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
    </main>
  );
}
