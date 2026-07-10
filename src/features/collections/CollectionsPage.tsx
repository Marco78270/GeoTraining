import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bookmark,
  Globe2,
  GraduationCap,
  Map,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ProfileMenu } from "../admin/ProfileMenu";
import {
  canAdministerCollection,
  canWriteCollectionContent,
  usePlatformRole,
} from "../admin/platformRole";
import { useAuth } from "../auth/authContext";
import { useActiveCollection } from "./activeCollectionContext";
import {
  getCollectionApi,
  type CollectionApi,
  type CollectionSummary,
} from "./collectionApi";
import { collectionKeys } from "./collectionKeys";
import { CategoryList } from "./CategoryList";
import { CollectionPicker } from "./CollectionPicker";
import { InviteEditorDialog } from "./InviteEditorDialog";

export function CollectionsPage({ api: suppliedApi }: { api?: CollectionApi }) {
  const [api] = useState(() => suppliedApi ?? getCollectionApi());
  const platformRole = usePlatformRole();
  const {
    collections,
    activeCollection,
    activeCollectionId,
    setActiveCollectionId,
    isLoading,
    error,
  } = useActiveCollection();
  const { signOut, user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: collectionKeys.list() });
  const create = useMutation({
    mutationFn: (input: Parameters<CollectionApi["createCollection"]>[0]) =>
      api.createCollection(input),
    onSuccess: async ({ collection }) => {
      setName("");
      setDescription("");
      await refresh();
      setActiveCollectionId(collection.id);
    },
  });
  const rename = useMutation({
    mutationFn: ({
      collection,
      nextName,
    }: {
      collection: CollectionSummary;
      nextName: string;
    }) =>
      api.updateCollection(collection.id, {
        name: nextName,
        description: collection.description,
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (collectionId: string) => api.deleteCollection(collectionId),
    onSuccess: async () => {
      setActiveCollectionId(null);
      await refresh();
    },
  });
  const isPublicReadOnly = activeCollection?.visibility === "public_readonly";
  const canAdministerActiveCollection = canAdministerCollection(
    activeCollection,
    platformRole,
  );
  const canEditActiveCollection = canWriteCollectionContent(
    activeCollection,
    platformRole,
  );

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
          <NavLink to="/statistics">
            <BarChart3 />
            Statistiques
          </NavLink>
          <NavLink to="/leaderboard">
            <Trophy />
            Classement
          </NavLink>
        </nav>
        <ProfileMenu
          email={user?.email}
          onSignOut={() => {
            void signOut();
          }}
        />
      </header>

      <div className="collections-layout">
        <aside className="panel collections-sidebar">
          <p className="eyebrow">Collections</p>
          <h1>Collections</h1>
          {isLoading ? <p role="status">Chargement des collections...</p> : null}
          {error ? (
            <p className="notice notice-error" role="alert">
              Impossible de charger vos collections.
            </p>
          ) : null}
          <CollectionPicker
            collections={collections}
            value={activeCollectionId}
            onChange={setActiveCollectionId}
            disabled={isLoading}
            platformRole={platformRole}
          />
          <form
            className="stack-form"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate({ name, description });
            }}
          >
            <h2>Nouvelle collection</h2>
            <label>
              <span>Nom</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <button
              className="primary-button"
              type="submit"
              disabled={create.isPending}
            >
              {create.isPending ? "Création..." : "Créer la collection"}
            </button>
          </form>
          {create.error ? (
            <p className="notice notice-error" role="alert">
              {create.error.message}
            </p>
          ) : null}
        </aside>

        <div className="collections-content">
          {!isLoading && collections.length === 0 ? (
            <section className="panel empty-state">
              <h2>Votre première collection</h2>
              <p>Créez un espace privé pour classer vos indices GeoGuessr.</p>
            </section>
          ) : null}
          {activeCollection ? (
            <>
              <section className="panel collection-header">
                <div>
                  <p className="eyebrow">
                    {isPublicReadOnly
                      ? canAdministerActiveCollection
                        ? "Publique · Administration"
                        : "Publique · Lecture seule"
                      : activeCollection.role === "owner"
                        ? "Propriétaire"
                        : "Éditeur"}
                  </p>
                  <div className="collection-title-row">
                    <h2>{activeCollection.name}</h2>
                    {isPublicReadOnly ? (
                      <span className="official-badge">
                        <ShieldCheck aria-hidden="true" />
                        Officielle
                      </span>
                    ) : null}
                  </div>
                  <p>{activeCollection.description || "Aucune description."}</p>
                  {isPublicReadOnly && !canAdministerActiveCollection ? (
                    <p className="notice" role="status">
                      Cette collection est visible par tous les utilisateurs, mais seule l'administration peut la modifier.
                    </p>
                  ) : null}
                </div>
                {canAdministerActiveCollection ? (
                  <div className="button-row">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        const nextName = window.prompt(
                          "Nouveau nom de la collection",
                          activeCollection.name,
                        );
                        if (nextName?.trim()) {
                          rename.mutate({
                            collection: activeCollection,
                            nextName,
                          });
                        }
                      }}
                    >
                      Renommer
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Supprimer définitivement ${activeCollection.name} ?`,
                          )
                        ) {
                          remove.mutate(activeCollection.id);
                        }
                      }}
                    >
                      Supprimer
                    </button>
                  </div>
                ) : null}
              </section>
              <CategoryList
                key={activeCollection.id}
                collectionId={activeCollection.id}
                readOnly={!canEditActiveCollection}
                api={api}
              />
              <InviteEditorDialog
                collectionId={activeCollection.id}
                isOwner={canAdministerActiveCollection}
                api={api}
              />
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
