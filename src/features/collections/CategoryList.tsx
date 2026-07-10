import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  ImageOff,
  Images,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getClueApi, type ClueApi } from "../clues/clueApi";
import {
  CollectionError,
  getCollectionApi,
  type CollectionApi,
  type ClueLibraryItem,
} from "./collectionApi";
import { categoryIconOptions, getCategoryIcon } from "./categoryIcons";
import { collectionKeys } from "./collectionKeys";
import { SearchableFilter } from "./SearchableFilter";
import {
  matchFilterValues,
  type SearchableFilterOption,
} from "./searchableFilterUtils";

function useDebouncedValue<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debouncedValue;
}

function IconPicker({
  value,
  onChange,
  legend,
}: {
  value: string;
  onChange: (value: string) => void;
  legend: string;
}) {
  return (
    <fieldset className="category-icon-picker">
      <legend>{legend}</legend>
      <div className="category-icon-grid">
        {categoryIconOptions.map(({ value: optionValue, label, Icon }) => (
          <button
            key={optionValue}
            type="button"
            className={optionValue === value ? "is-selected" : undefined}
            aria-pressed={optionValue === value}
            onClick={() => onChange(optionValue)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const difficultyLabels = {
  easy: "Facile",
  medium: "Moyen",
  expert: "Expert",
} as const;

function CollectionClueLibrary({
  collectionId,
  readOnly,
  api,
  clueApi,
}: {
  collectionId: string;
  readOnly: boolean;
  api: CollectionApi;
  clueApi: ClueApi;
}) {
  const queryClient = useQueryClient();
  const [categorySearch, setCategorySearch] = useState("");
  const [categorySelection, setCategorySelection] = useState("");
  const [countrySearch, setCountrySearch] = useState("");
  const [countrySelection, setCountrySelection] = useState("");
  const [statusSearch, setStatusSearch] = useState("");
  const [statusSelection, setStatusSelection] = useState("");
  const [search, setSearch] = useState("");
  const [selectedClue, setSelectedClue] = useState<ClueLibraryItem | null>(null);
  const filterDraft = useMemo(() => ({
    search,
    categorySearch,
    categorySelection,
    countrySearch,
    countrySelection,
    statusSearch,
    statusSelection,
  }), [search, categorySearch, categorySelection, countrySearch, countrySelection, statusSearch, statusSelection]);
  const debouncedFilters = useDebouncedValue(filterDraft, 250);
  const [pagination, setPagination] = useState(() => ({
    filters: debouncedFilters,
    page: 1,
  }));
  const page = pagination.filters === debouncedFilters ? pagination.page : 1;
  const filtersAreDebouncing =
    search !== debouncedFilters.search ||
    categorySearch !== debouncedFilters.categorySearch ||
    categorySelection !== debouncedFilters.categorySelection ||
    countrySearch !== debouncedFilters.countrySearch ||
    countrySelection !== debouncedFilters.countrySelection ||
    statusSearch !== debouncedFilters.statusSearch ||
    statusSelection !== debouncedFilters.statusSelection;
  const filtersQuery = useQuery({
    queryKey: collectionKeys.clueFilters(collectionId),
    queryFn: () => api.listClueFilters(collectionId),
  });
  const categoryOptions = useMemo<SearchableFilterOption[]>(
    () =>
      filtersQuery.data?.categories.map(({ id, name }) => ({
        value: id,
        label: name,
      })) ?? [],
    [filtersQuery.data?.categories],
  );
  const countryOptions = useMemo<SearchableFilterOption[]>(
    () =>
      filtersQuery.data?.countries.map(({ code, name }) => ({
        value: code,
        label: name,
      })) ?? [],
    [filtersQuery.data?.countries],
  );
  const statusOptions = useMemo<SearchableFilterOption[]>(() => {
    const availableStatuses = filtersQuery.data?.statuses ?? [];
    return [
      { value: "published", label: "Publié" },
      { value: "draft", label: "Brouillon" },
    ].filter((option) => availableStatuses.includes(option.value as "draft" | "published"));
  }, [filtersQuery.data?.statuses]);
  const categoryIds = useMemo(
    () => debouncedFilters.categorySelection
      ? [debouncedFilters.categorySelection]
      : matchFilterValues(categoryOptions, debouncedFilters.categorySearch),
    [categoryOptions, debouncedFilters.categorySearch, debouncedFilters.categorySelection],
  );
  const countryCodes = useMemo(
    () => debouncedFilters.countrySelection
      ? [debouncedFilters.countrySelection]
      : matchFilterValues(countryOptions, debouncedFilters.countrySearch),
    [countryOptions, debouncedFilters.countrySearch, debouncedFilters.countrySelection],
  );
  const statuses = useMemo(
    () =>
      (debouncedFilters.statusSelection
        ? [debouncedFilters.statusSelection]
        : matchFilterValues(statusOptions, debouncedFilters.statusSearch)) as
        | ("draft" | "published")[]
        | undefined,
    [statusOptions, debouncedFilters.statusSearch, debouncedFilters.statusSelection],
  );
  const queryInput = {
    collectionId,
    categoryIds,
    countryCodes,
    statuses,
    search: debouncedFilters.search.trim() || undefined,
    page,
    pageSize: 24,
  } as const;
  const cluesQuery = useQuery({
    queryKey: collectionKeys.clueLibrary(collectionId, {
      search: queryInput.search,
      categoryIds: queryInput.categoryIds?.join("\u0000"),
      countryCodes: queryInput.countryCodes?.join("\u0000"),
      statuses: queryInput.statuses?.join("\u0000"),
      page: queryInput.page,
      pageSize: queryInput.pageSize,
    }),
    queryFn: () => api.listClues(queryInput),
    placeholderData: keepPreviousData,
  });
  const result = cluesQuery.data;
  const deleteClue = useMutation({
    mutationFn: (clueId: string) => clueApi.delete(clueId),
    onSuccess: async () => {
      setSelectedClue(null);
      setPagination({ filters: debouncedFilters, page: 1 });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: collectionKeys.clueLibraries(collectionId),
        }),
        queryClient.invalidateQueries({
          queryKey: collectionKeys.clueFilters(collectionId),
        }),
        queryClient.invalidateQueries({
          queryKey: collectionKeys.categoryStats(collectionId),
        }),
        queryClient.invalidateQueries({
          queryKey: collectionKeys.clues(collectionId),
        }),
      ]);
    },
  });

  function changeFilter(setter: (value: string) => void, value: string) {
    setter(value);
  }

  return (
    <section className="panel clue-library">
      <div className="clue-library-heading">
        <div>
          <p className="eyebrow">Contenu</p>
          <h2>Bibliothèque d’indices</h2>
          <p>Parcourez les photos déjà ajoutées avant de créer un doublon.</p>
        </div>
        <span className="clue-library-count">
          <Images aria-hidden="true" />
          {result?.total ?? 0} indice{result?.total === 1 ? "" : "s"}
        </span>
      </div>

      <div className="clue-library-filters">
        <label className="clue-library-search">
          <span>Rechercher</span>
          <span className="clue-library-search-field">
            <Search aria-hidden="true" />
            <input
              value={search}
              placeholder="Titre de l’indice"
              onChange={(event) => changeFilter(setSearch, event.target.value)}
            />
            {search ? (
              <button
                type="button"
                aria-label="Effacer la recherche par titre"
                onClick={() => changeFilter(setSearch, "")}
              >
                <X aria-hidden="true" />
              </button>
            ) : null}
          </span>
        </label>
        <SearchableFilter
          label="Filtrer par catégorie"
          searchText={categorySearch}
          selectedValue={categorySelection}
          placeholder="Toutes les catégories"
          allLabel="Toutes les catégories"
          options={categoryOptions}
          onSearchTextChange={(value) => {
            setCategorySelection("");
            setCategorySearch(value);
          }}
          onSelect={(value) => {
            setCategorySelection(value);
            setCategorySearch("");
          }}
        />
        <SearchableFilter
          label="Filtrer par pays"
          searchText={countrySearch}
          selectedValue={countrySelection}
          placeholder="Tous les pays"
          allLabel="Tous les pays"
          options={countryOptions}
          onSearchTextChange={(value) => {
            setCountrySelection("");
            setCountrySearch(value);
          }}
          onSelect={(value) => {
            setCountrySelection(value);
            setCountrySearch("");
          }}
        />
        <SearchableFilter
          label="Filtrer par statut"
          searchText={statusSearch}
          selectedValue={statusSelection}
          placeholder="Tous les statuts"
          allLabel="Tous les statuts"
          options={statusOptions}
          onSearchTextChange={(value) => {
            setStatusSelection("");
            setStatusSearch(value);
          }}
          onSelect={(value) => {
            setStatusSelection(value);
            setStatusSearch("");
          }}
        />
      </div>

      {filtersQuery.isLoading || cluesQuery.isLoading ? (
        <p className="clue-library-state" role="status">Chargement des indices...</p>
      ) : null}
      {filtersQuery.error || cluesQuery.error ? (
        <p className="notice notice-error" role="alert">
          Impossible de charger la bibliothèque d’indices.
        </p>
      ) : null}
      {result?.total === 0 ? (
        <div className="clue-library-empty">
          <ImageOff aria-hidden="true" />
          <strong>Aucun indice ne correspond à ces filtres.</strong>
        </div>
      ) : null}

      {result?.items.length ? (
        <div className="clue-library-grid">
          {result.items.map((clue) => {
            const cover = clue.images[0];
            return (
              <button
                key={clue.id}
                type="button"
                className="clue-library-card"
                aria-label={`Voir ${clue.title}`}
                onClick={() => setSelectedClue(clue)}
              >
                <span className="clue-library-cover">
                  {cover?.url ? (
                    <img src={cover.url} alt={cover.altText ?? clue.title} loading="lazy" />
                  ) : (
                    <span className="clue-library-placeholder"><ImageOff aria-hidden="true" /></span>
                  )}
                  <span className={`clue-status-badge ${clue.status}`}>
                    {clue.status === "published" ? "Publié" : "Brouillon"}
                  </span>
                  {clue.images.length > 1 ? (
                    <span className="clue-image-count"><Images aria-hidden="true" />{clue.images.length}</span>
                  ) : null}
                </span>
                <span className="clue-library-card-body">
                  <strong>{clue.title}</strong>
                  <span>{clue.countryName} · {clue.categoryName}</span>
                  <small className={clue.difficulty}>{difficultyLabels[clue.difficulty]}</small>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {result && result.totalPages > 1 ? (
        <nav className="clue-library-pagination" aria-label="Pagination des indices">
          <button type="button" disabled={filtersAreDebouncing || page <= 1} onClick={() => setPagination({ filters: debouncedFilters, page: page - 1 })}>
            <ChevronLeft aria-hidden="true" /> Précédent
          </button>
          <span>Page {page} sur {result.totalPages}</span>
          <button type="button" disabled={filtersAreDebouncing || page >= result.totalPages} onClick={() => setPagination({ filters: debouncedFilters, page: page + 1 })}>
            Suivant <ChevronRight aria-hidden="true" />
          </button>
        </nav>
      ) : null}

      {selectedClue ? (
        <div className="clue-preview-backdrop" role="presentation">
          <section className="clue-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="clue-preview-title">
            <header>
              <div>
                <span>{selectedClue.countryName} · {selectedClue.categoryName}</span>
                <h2 id="clue-preview-title">{selectedClue.title}</h2>
              </div>
              <button type="button" aria-label="Fermer l’aperçu" onClick={() => setSelectedClue(null)}>
                <X aria-hidden="true" />
              </button>
            </header>
            <div className="clue-preview-images">
              {selectedClue.images.length ? selectedClue.images.map((image) => (
                image.url ? <img key={image.id} src={image.url} alt={image.altText ?? selectedClue.title} /> : null
              )) : <span className="clue-library-placeholder"><ImageOff aria-hidden="true" /></span>}
            </div>
            <div className="clue-preview-meta">
              <span className={`clue-status-badge ${selectedClue.status}`}>
                {selectedClue.status === "published" ? "Publié" : "Brouillon"}
              </span>
              <span className={`clue-difficulty-badge ${selectedClue.difficulty}`}>
                {difficultyLabels[selectedClue.difficulty]}
              </span>
            </div>
            {selectedClue.characteristics.length ? (
              <ul>{selectedClue.characteristics.map((item) => <li key={item}>{item}</li>)}</ul>
            ) : null}
            {selectedClue.notes ? <p>{selectedClue.notes}</p> : null}
            {deleteClue.error ? (
              <p className="notice notice-error" role="alert">
                Impossible de supprimer cet indice.
              </p>
            ) : null}
            <footer>
              {!readOnly ? (
                <button
                  type="button"
                  className="clue-delete-button"
                  disabled={deleteClue.isPending}
                  onClick={() => {
                    const confirmed = window.confirm(
                      `Supprimer définitivement l’indice « ${selectedClue.title} » et toutes ses images ?`,
                    );
                    if (confirmed) deleteClue.mutate(selectedClue.id);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  {deleteClue.isPending ? "Suppression..." : "Supprimer"}
                </button>
              ) : null}
              {selectedClue.google_maps_url ? (
                <a href={selectedClue.google_maps_url} target="_blank" rel="noreferrer">
                  Google Maps <ExternalLink aria-hidden="true" />
                </a>
              ) : null}
              {!readOnly ? <Link to={`/clues/${selectedClue.id}/edit`}>Modifier</Link> : null}
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export function CategoryList({
  collectionId,
  readOnly = false,
  api: suppliedApi,
  clueApi: suppliedClueApi,
}: {
  collectionId: string;
  readOnly?: boolean;
  api?: CollectionApi;
  clueApi?: ClueApi;
}) {
  const [api] = useState(() => suppliedApi ?? getCollectionApi());
  const [clueApi] = useState(() => suppliedClueApi ?? getClueApi());
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("sign");
  const [color, setColor] = useState("#20D4E6");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingIcon, setEditingIcon] = useState("sign");
  const [editingColor, setEditingColor] = useState("#20D4E6");
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: collectionKeys.categories(collectionId),
    queryFn: () => api.listCategories(collectionId),
  });
  const statsQuery = useQuery({
    queryKey: collectionKeys.categoryStats(collectionId),
    queryFn: () => api.listCategoryStats(collectionId),
  });
  const statsByCategory = useMemo(
    () => new Map(statsQuery.data?.map((stats) => [stats.categoryId, stats])),
    [statsQuery.data],
  );
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: collectionKeys.categories(collectionId),
      }),
      queryClient.invalidateQueries({
        queryKey: collectionKeys.categoryStats(collectionId),
      }),
      queryClient.invalidateQueries({
        queryKey: collectionKeys.clueFilters(collectionId),
      }),
      queryClient.invalidateQueries({
        queryKey: collectionKeys.clueLibraries(collectionId),
      }),
    ]);
  };
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

  function startEditing(category: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
  }) {
    setEditingId(category.id);
    setEditingName(category.name);
    setEditingIcon(getCategoryIcon(category.icon).value);
    setEditingColor(category.color ?? "#20D4E6");
  }

  async function saveEdition(categoryId: string) {
    if (!editingName.trim()) return;
    await update.mutateAsync({
      id: categoryId,
      nextName: editingName.trim(),
      nextIcon: editingIcon,
      nextColor: editingColor,
    });
    setEditingId(null);
  }

  return (
    <>
      <section className="panel category-management">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Organisation</p>
          <h2>Catégories</h2>
        </div>
      </div>

      {readOnly ? (
        <p className="notice" role="status">
          Cette collection publique est en lecture seule.
        </p>
      ) : (
        <details className="category-create-panel">
          <summary>Ajouter une catégorie</summary>
          <form className="inline-form category-form" onSubmit={submit}>
            <label>
              <span>Nom de la catégorie</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <IconPicker value={icon} onChange={setIcon} legend="Icône" />
            <label>
              <span>Couleur</span>
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </label>
            <button className="primary-button" type="submit" disabled={create.isPending}>
              {create.isPending ? "Ajout..." : "Ajouter"}
            </button>
          </form>
        </details>
      )}
      {formError ? <p className="notice notice-error" role="alert">{formError}</p> : null}

      {query.isLoading || statsQuery.isLoading ? (
        <p role="status">Chargement des catégories...</p>
      ) : null}
      {query.error || statsQuery.error ? (
        <p className="notice notice-error" role="alert">
          Impossible de charger les catégories.
        </p>
      ) : null}
      {query.data?.length === 0 ? <p>Aucune catégorie.</p> : null}

      {query.data?.length ? (
        <div className="category-table-wrapper">
          <table className="category-table">
            <thead>
              <tr>
                <th>Catégorie</th>
                <th>Indices</th>
                <th>Pays</th>
                <th>Publiés</th>
                <th>Complétude</th>
                {!readOnly ? <th><span className="sr-only">Actions</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {query.data.map((category) => {
                const selectedIcon = getCategoryIcon(category.icon);
                const Icon = selectedIcon.Icon;
                const stats = statsByCategory.get(category.id);
                const completeness = stats?.completeness ?? 0;
                const isEditing = editingId === category.id;

                if (isEditing) {
                  return (
                    <tr key={category.id} className="category-table-edit-row">
                      <td colSpan={readOnly ? 5 : 6}>
                        <div className="category-edit-card">
                          <label>
                            <span>Nom</span>
                            <input value={editingName} onChange={(event) => setEditingName(event.target.value)} />
                          </label>
                          <IconPicker value={editingIcon} onChange={setEditingIcon} legend="Icône" />
                          <label>
                            <span>Couleur</span>
                            <input type="color" value={editingColor} onChange={(event) => setEditingColor(event.target.value)} />
                          </label>
                          <div className="category-edit-actions">
                            <button
                              type="button"
                              className="primary-button"
                              disabled={update.isPending || !editingName.trim()}
                              onClick={() => void saveEdition(category.id)}
                            >
                              Enregistrer
                            </button>
                            <button type="button" className="text-button" onClick={() => setEditingId(null)}>
                              Annuler
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={category.id}>
                    <td data-label="Catégorie">
                      <span className="category-table-name">
                        <span className="category-table-icon" style={{ color: category.color ?? "#20D4E6" }}>
                          <Icon aria-hidden="true" />
                        </span>
                        <span><strong>{category.name}</strong><small>{selectedIcon.label}</small></span>
                      </span>
                    </td>
                    <td data-label="Indices">{stats?.clueCount ?? 0}</td>
                    <td data-label="Pays">{stats?.countryCount ?? 0}</td>
                    <td data-label="Publiés">{stats?.publishedCount ?? 0}</td>
                    <td data-label="Complétude">
                      <span className={`category-completeness ${completeness === 100 ? "complete" : "incomplete"}`}>
                        {completeness === 100 ? <CheckCircle2 aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
                        {completeness}%
                      </span>
                    </td>
                    {!readOnly ? (
                      <td data-label="Actions">
                        <span className="category-table-actions">
                          <button type="button" aria-label={`Modifier ${category.name}`} onClick={() => startEditing(category)}>
                            <Pencil aria-hidden="true" />
                          </button>
                          <button type="button" className="danger" aria-label={`Supprimer ${category.name}`} onClick={() => remove.mutate(category.id)}>
                            <Trash2 aria-hidden="true" />
                          </button>
                        </span>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {create.error instanceof CollectionError && create.error.code === "23505" ? (
        <p className="notice notice-error" role="alert">
          Une catégorie porte déjà ce nom.
        </p>
      ) : null}
      </section>
      <CollectionClueLibrary
        collectionId={collectionId}
        readOnly={readOnly}
        api={api}
        clueApi={clueApi}
      />
    </>
  );
}
