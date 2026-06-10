import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand brand-link" to="/atlas">
          <span className="brand-mark" aria-hidden="true">
            ◎
          </span>
          <strong>GeoTrainer</strong>
          <span>Atlas</span>
        </Link>
        <nav className="topbar-actions" aria-label="Navigation principale">
          <Link to="/atlas">Atlas</Link>
          <strong>Collections</strong>
          <span>{user?.email}</span>
          <button className="secondary-button" type="button" onClick={() => void signOut()}>
            Se déconnecter
          </button>
        </nav>
      </header>

      <div className="collections-layout">
        <aside className="panel collections-sidebar">
          <p className="eyebrow">Espace privé</p>
          <h1>Collections</h1>
          {isLoading ? <p role="status">Chargement des collections…</p> : null}
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
            <button className="primary-button" type="submit" disabled={create.isPending}>
              {create.isPending ? "Création…" : "Créer la collection"}
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
                    {activeCollection.role === "owner"
                      ? "Propriétaire"
                      : "Éditeur"}
                  </p>
                  <h2>{activeCollection.name}</h2>
                  <p>{activeCollection.description || "Aucune description."}</p>
                </div>
                {activeCollection.role === "owner" ? (
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
              <CategoryList collectionId={activeCollection.id} api={api} />
              <InviteEditorDialog
                collectionId={activeCollection.id}
                isOwner={activeCollection.role === "owner"}
                api={api}
              />
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
