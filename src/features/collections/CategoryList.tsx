import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  CollectionError,
  getCollectionApi,
  type CollectionApi,
} from "./collectionApi";
import { collectionKeys } from "./collectionKeys";

export function CategoryList({
  collectionId,
  api: suppliedApi,
}: {
  collectionId: string;
  api?: CollectionApi;
}) {
  const [api] = useState(() => suppliedApi ?? getCollectionApi());
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("sign");
  const [color, setColor] = useState("#20D4E6");
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: collectionKeys.categories(collectionId),
    queryFn: () => api.listCategories(collectionId),
  });
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: collectionKeys.categories(collectionId),
    });
  const create = useMutation({
    mutationFn: (input: Parameters<CollectionApi["createCategory"]>[0]) =>
      api.createCategory(input),
    onSuccess: async () => {
      setName("");
      setFormError(null);
      await refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({
      id,
      nextName,
      nextIcon,
      nextColor,
    }: {
      id: string;
      nextName: string;
      nextIcon: string | null;
      nextColor: string | null;
    }) =>
      api.updateCategory(id, {
        name: nextName,
        icon: nextIcon,
        color: nextColor,
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (categoryId: string) => api.deleteCategory(categoryId),
    onSuccess: refresh,
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setFormError("Le nom de la catégorie est obligatoire.");
      return;
    }
    try {
      await create.mutateAsync({ collectionId, name, icon, color });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Impossible d'ajouter la catégorie.",
      );
    }
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Organisation</p>
          <h2>Catégories</h2>
        </div>
      </div>

      <form className="inline-form category-form" onSubmit={submit}>
        <label>
          <span>Nom de la catégorie</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          <span>Icône</span>
          <input value={icon} onChange={(event) => setIcon(event.target.value)} />
        </label>
        <label>
          <span>Couleur</span>
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
          />
        </label>
        <button className="primary-button" type="submit" disabled={create.isPending}>
          {create.isPending ? "Ajout…" : "Ajouter la catégorie"}
        </button>
      </form>
      {formError ? (
        <p className="notice notice-error" role="alert">
          {formError}
        </p>
      ) : null}

      {query.isLoading ? <p role="status">Chargement des catégories…</p> : null}
      {query.error ? (
        <p className="notice notice-error" role="alert">
          Impossible de charger les catégories.
        </p>
      ) : null}
      {query.data?.length === 0 ? <p>Aucune catégorie.</p> : null}
      <ul className="category-list">
        {query.data?.map((category) => (
          <li key={category.id}>
            <span
              className="category-swatch"
              style={{ backgroundColor: category.color ?? "#20D4E6" }}
              aria-hidden="true"
            />
            <span>{category.icon ?? "indice"}</span>
            <strong>{category.name}</strong>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const nextName = window.prompt(
                  "Nouveau nom de la catégorie",
                  category.name,
                );
                if (nextName?.trim()) {
                  update.mutate({
                    id: category.id,
                    nextName,
                    nextIcon: category.icon,
                    nextColor: category.color,
                  });
                }
              }}
            >
              Renommer
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={() => remove.mutate(category.id)}
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
      {create.error instanceof CollectionError &&
      create.error.code === "23505" ? (
        <p className="notice notice-error" role="alert">
          Une catégorie porte déjà ce nom.
        </p>
      ) : null}
    </section>
  );
}
