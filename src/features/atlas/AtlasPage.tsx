import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bookmark,
  Fence,
  Globe2,
  GraduationCap,
  Leaf,
  Map,
  MapPinned,
  Milestone,
  Plus,
  Route,
  Search,
  ShieldCheck,
  Signpost,
  Target,
  UtilityPole,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ProfileMenu } from "../admin/ProfileMenu";
import { useAuth } from "../auth/authContext";
import { useActiveCollection } from "../collections/activeCollectionContext";
import { collectionKeys } from "../collections/collectionKeys";
import { CollectionPicker } from "../collections/CollectionPicker";
import {
  getAtlasApi,
  type AtlasApi,
  type AtlasCategory,
  type AtlasCountry,
  type Difficulty,
} from "./atlasApi";
import { AtlasMap } from "./AtlasMap";

const difficultyOrder: Difficulty[] = ["easy", "medium", "expert"];
const difficultyLabels: Record<Difficulty, string> = {
  easy: "Facile",
  medium: "Moyen",
  expert: "Expert",
};
const emptyCategories: AtlasCategory[] = [];
const emptyCountries: AtlasCountry[] = [];
const categoryIcons = {
  sign: Signpost,
  milestone: Milestone,
  road: Route,
  pole: UtilityPole,
  fence: Fence,
  leaf: Leaf,
} as const;

function CategoryIcon({ category }: { category: AtlasCategory }) {
  const Icon =
    categoryIcons[category.icon as keyof typeof categoryIcons] ?? Signpost;
  return <Icon aria-hidden="true" />;
}

function filterCountries(
  countries: AtlasCountry[],
  categoryId: string,
  difficulties: ReadonlySet<Difficulty>,
  search: string,
) {
  const normalizedSearch = search.trim().toLocaleLowerCase("fr");
  return countries
    .map((country) => {
      const visibleClues = country.clues.filter(
        (clue) =>
          clue.categoryId === categoryId &&
          difficulties.has(clue.difficulty) &&
          (!normalizedSearch ||
            country.name.toLocaleLowerCase("fr").includes(normalizedSearch) ||
            clue.title.toLocaleLowerCase("fr").includes(normalizedSearch)),
      );
      if (visibleClues.length === 0) return null;
      const difficulty = visibleClues.reduce<Difficulty>((current, clue) => {
        const rank = difficultyOrder.indexOf(clue.difficulty);
        const currentRank = difficultyOrder.indexOf(current);
        return rank > currentRank ? clue.difficulty : current;
      }, visibleClues[0].difficulty);
      return {
        ...country,
        clues: visibleClues,
        difficulty,
      };
    })
    .filter((country): country is AtlasCountry => country !== null);
}

export function AtlasPage({
  atlasApi: suppliedAtlasApi,
}: {
  atlasApi?: AtlasApi;
}) {
  const { signOut, user } = useAuth();
  const {
    collections,
    activeCollection,
    activeCollectionId,
    setActiveCollectionId,
    isLoading: collectionsLoading,
    error: collectionsError,
  } = useActiveCollection();
  const [atlasApi] = useState(() => suppliedAtlasApi ?? getAtlasApi());
  const isPublicReadOnly = activeCollection?.visibility === "public_readonly";
  const canEditActiveCollection =
    activeCollection?.role === "owner";
  const [activeCategoryId, setActiveCategoryId] = useState("");
  const [activeDifficulties, setActiveDifficulties] = useState<Set<Difficulty>>(
    () => new Set(difficultyOrder),
  );
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(
    null,
  );
  const [selectedClueId, setSelectedClueId] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<"world" | "country">("world");
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: activeCollectionId
      ? collectionKeys.clues(activeCollectionId)
      : ["atlas", "inactive"],
    queryFn: () => atlasApi.load(activeCollectionId!),
    enabled: Boolean(activeCollectionId),
  });
  const categories = query.data?.categories ?? emptyCategories;
  const countries = query.data?.countries ?? emptyCountries;
  const activeCategory =
    categories.find((category) => category.id === activeCategoryId) ??
    categories[0] ??
    null;

  const markers = useMemo(
    () =>
      activeCategory
        ? filterCountries(
            countries,
            activeCategory.id,
            activeDifficulties,
            search,
          )
        : [],
    [activeCategory, activeDifficulties, countries, search],
  );
  const effectiveSelectedCountryCode = markers.some(
    (country) => country.code === selectedCountryCode,
  )
    ? selectedCountryCode
    : null;
  const selectedCountry =
    markers.find((country) => country.code === effectiveSelectedCountryCode) ??
    markers[0] ??
    null;
  const selectedClue =
    selectedCountry?.clues.find((clue) => clue.id === selectedClueId) ??
    selectedCountry?.clues[0] ??
    null;
  const effectiveSelectedRegionId =
    selectedRegionId && selectedClue?.regionIds.includes(selectedRegionId)
      ? selectedRegionId
      : null;
  const selectedCountryCoverage = useMemo(() => {
    if (!selectedCountry || !activeCategory) {
      return {
        hasWholeCountryCoverage: false,
        coveredRegionIds: [] as string[],
      };
    }

    return {
      hasWholeCountryCoverage: selectedCountry.clues.some(
        (clue) =>
          clue.categoryId === activeCategory.id &&
          clue.coverage === "whole_country",
      ),
      coveredRegionIds: [
        ...new Set(
          selectedCountry.clues.flatMap((clue) =>
            clue.categoryId === activeCategory.id &&
            clue.coverage === "selected_regions"
              ? clue.regionIds
              : [],
          ),
        ),
      ],
    };
  }, [activeCategory, selectedCountry]);

  function toggleDifficulty(difficulty: Difficulty) {
    setActiveDifficulties((current) => {
      const next = new Set(current);
      if (next.has(difficulty) && next.size > 1) next.delete(difficulty);
      else next.add(difficulty);
      return next;
    });
  }

  function selectCategory(categoryId: string) {
    setActiveCategoryId(categoryId);
    setSelectedCountryCode(null);
    setSelectedClueId(null);
    setSelectedRegionId(null);
    setViewport("world");
  }

  function selectCountry(code: string) {
    setSelectedCountryCode(code);
    setSelectedClueId(null);
    setSelectedRegionId(null);
  }

  function selectRegion(regionId: string) {
    if (!selectedCountry) {
      return;
    }
    const matchingClue = selectedCountry.clues.find((clue) =>
      clue.regionIds.includes(regionId),
    );
    if (!matchingClue) {
      return;
    }
    setSelectedClueId(matchingClue.id);
    setSelectedRegionId(regionId);
    setViewport("country");
  }

  const totalClues = activeCategory?.total ?? 0;
  const totalCountries = activeCategory?.countries ?? 0;

  return (
    <main className="app-shell atlas-app">
      <h1 className="sr-only">Atlas</h1>
      <header className="topbar atlas-topbar">
        <Link className="brand brand-link" to="/atlas" aria-label="GeoTrainer Atlas">
          <Globe2 className="brand-globe" aria-hidden="true" />
          <strong>GeoTrainer</strong>
          <span>Atlas</span>
        </Link>
        <nav className="atlas-nav" aria-label="Navigation principale">
          <NavLink to="/atlas"><Map />Atlas</NavLink>
          <NavLink to="/collections"><Bookmark />Collections</NavLink>
          <NavLink to="/training"><GraduationCap />Entraînement</NavLink>
          <NavLink to="/statistics"><BarChart3 />Statistiques</NavLink>
        </nav>
        <ProfileMenu
          email={user?.email}
          onSignOut={() => {
            void signOut();
          }}
        />
      </header>

      <div className="atlas-workspace">
        <aside className="atlas-sidebar" aria-label="Filtres de l’Atlas">
          <label className="atlas-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Rechercher un pays ou un indice</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un pays ou un indice"
            />
          </label>

          <CollectionPicker
            collections={collections}
            value={activeCollectionId}
            onChange={setActiveCollectionId}
            disabled={collectionsLoading}
          />
          {collectionsLoading ? <p className="atlas-state">Chargement des collections…</p> : null}
          {collectionsError ? <p className="atlas-state atlas-state-error">Impossible de charger les collections.</p> : null}
          {!collectionsLoading && !activeCollection ? (
            <div className="atlas-empty-collection">
              <p>Créez une collection privée pour enregistrer vos propres indices.</p>
              <Link to="/collections">Créer une collection</Link>
            </div>
          ) : null}

          <section className="atlas-filter-section">
            <h2>Catégories</h2>
            <div className="category-filters">
              {categories.map((category) => {
                const active = activeCategory?.id === category.id;
                return (
                  <button
                    type="button"
                    key={category.id}
                    className={active ? "active" : ""}
                    aria-pressed={active}
                    onClick={() => selectCategory(category.id)}
                  >
                    <CategoryIcon category={category} />
                    <span>{category.name}</span>
                    <span className="category-check" aria-hidden="true">{active ? "?" : ""}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="atlas-filter-section atlas-difficulty-filters">
            <h2>Difficulté</h2>
            <div>
              {difficultyOrder.map((difficulty) => (
                <button
                  type="button"
                  key={difficulty}
                  className={`${difficulty} ${activeDifficulties.has(difficulty) ? "active" : ""}`}
                  aria-pressed={activeDifficulties.has(difficulty)}
                  onClick={() => toggleDifficulty(difficulty)}
                >
                  <span aria-hidden="true" />{difficultyLabels[difficulty]}
                </button>
              ))}
            </div>
          </section>

          {!isPublicReadOnly || canEditActiveCollection ? (
            <Link className="add-clue-button" to="/clues/new">
              <Plus aria-hidden="true" />Ajouter un indice
            </Link>
          ) : (
            <p className="atlas-state">Collection publique en lecture seule.</p>
          )}
        </aside>

        <section className="atlas-center">
          {query.isLoading ? (
            <div className="atlas-demo-notice" role="status">
              Chargement de vos indices…
            </div>
          ) : null}
          {query.error ? (
            <div className="atlas-demo-notice atlas-state-error" role="alert">
              Impossible de charger les indices de cette collection.
            </div>
          ) : null}
          {!query.isLoading && !query.error && countries.length === 0 ? (
            <div
              className="atlas-demo-notice"
              role="status"
              aria-label="Atlas vide"
            >
              Aucun indice publié dans cette collection. Ajoutez votre premier
              indice pour le voir apparaître sur la carte.
            </div>
          ) : null}
          <div className="atlas-map-panel">
            <AtlasMap
              markers={markers}
              selectedCountryCode={effectiveSelectedCountryCode}
              selectedRegionId={effectiveSelectedRegionId}
              viewport={effectiveSelectedCountryCode ? viewport : "world"}
              hasWholeCountryCoverage={
                selectedCountryCoverage.hasWholeCountryCoverage
              }
              coveredRegionIds={selectedCountryCoverage.coveredRegionIds}
              onCountrySelect={selectCountry}
              onRegionSelect={selectRegion}
              onViewportChange={setViewport}
            />
            {viewport === "country" ? (
              <button
                type="button"
                className="world-view-button"
                onClick={() => {
                  setSelectedCountryCode(null);
                  setSelectedClueId(null);
                  setSelectedRegionId(null);
                  setViewport("world");
                }}
              >
                <Globe2 aria-hidden="true" />Vue monde
              </button>
            ) : null}
            <div className="map-legend" aria-label="Légende des difficultés">
              {difficultyOrder.map((difficulty) => (
                <span key={difficulty} className={difficulty}>
                  <i />{difficultyLabels[difficulty]}
                </span>
              ))}
            </div>
          </div>

          <div className="atlas-stats">
            <article>
              <span className="stat-icon stat-icon-blue"><Bookmark /></span>
              <div><span>Indices enregistrés</span><strong>{totalClues}</strong></div>
            </article>
            <article>
              <span className="stat-icon stat-icon-green"><Globe2 /></span>
              <div><span>Pays couverts</span><strong>{totalCountries}</strong></div>
            </article>
            <article>
              <span className="stat-icon stat-icon-red"><Signpost /></span>
              <div><span>Catégorie active</span><strong>{activeCategory?.shortName ?? "—"}</strong></div>
            </article>
          </div>
        </section>

        {selectedCountry && selectedClue && activeCategory ? (
          <aside className="atlas-details" aria-label="Détail du pays">
            <div className="detail-heading">
              <div>
                <h1>{selectedCountry.name}</h1>
                <p>Catégorie : <strong>{activeCategory.name}</strong></p>
                {isPublicReadOnly ? (
                  <span className="official-badge">
                    <ShieldCheck aria-hidden="true" />
                    Officielle
                  </span>
                ) : null}
              </div>
              <span className={`difficulty-badge ${selectedClue.difficulty}`}>
                <ShieldCheck aria-hidden="true" />
                {difficultyLabels[selectedClue.difficulty]}
              </span>
            </div>

            <h2 className="atlas-clue-title">{selectedClue.title}</h2>
            {activeCollectionId && (!isPublicReadOnly || canEditActiveCollection) ? (
              <Link
                className="zoom-country-button"
                to={`/clues/${selectedClue.id}/edit`}
                state={{
                  initialClue: {
                    id: selectedClue.id,
                    collectionId: activeCollectionId,
                    categoryId: selectedClue.categoryId,
                    countryCode: selectedCountry.code,
                    coverage: selectedClue.coverage,
                    regionIds: selectedClue.regionIds,
                    difficulty: selectedClue.difficulty,
                    title: selectedClue.title,
                    characteristics: selectedClue.characteristics,
                    notes: selectedClue.notes ?? "",
                    googleMapsUrl: selectedClue.googleMapsUrl ?? "",
                    existingImages: selectedClue.images.map((image, index) => ({
                      id: image.id,
                      storagePath: image.storagePath,
                      altText: image.altText,
                      sortOrder: index,
                    })),
                  },
                }}
              >
                Modifier l’indice
              </Link>
            ) : null}
            {selectedClue.imageUrls[0] ? (
              <img
                className="atlas-clue-image"
                src={selectedClue.imageUrls[0]}
                alt={selectedClue.imageAlts[0] ?? selectedClue.title}
              />
            ) : null}
            {selectedClue.imageUrls.length > 1 ? (
              <div className="detail-thumbnails">
                {selectedClue.imageUrls.slice(1).map((url, index) => (
                  <img
                    key={url}
                    src={url}
                    alt={selectedClue.imageAlts[index + 1] ?? selectedClue.title}
                  />
                ))}
              </div>
            ) : null}

            <section className="detail-section">
              <h2>Caractéristiques</h2>
              {selectedClue.characteristics.length > 0 ? (
                <ul>
                  {selectedClue.characteristics.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : <p>Aucune caractéristique renseignée.</p>}
            </section>
            <section className="detail-section">
              <h2>Notes GeoGuessr</h2>
              <p>{selectedClue.notes || "Aucune note renseignée."}</p>
            </section>
            {selectedClue.sourceName || selectedClue.licenseName ? (
              <section className="detail-section">
                <h2>Source</h2>
                {selectedClue.attributionText ? <p>{selectedClue.attributionText}</p> : null}
                {selectedClue.sourceName ? (
                  <p>
                    Source :{" "}
                    {selectedClue.sourceUrl ? (
                      <a href={selectedClue.sourceUrl} target="_blank" rel="noreferrer">
                        {selectedClue.sourceName}
                      </a>
                    ) : (
                      selectedClue.sourceName
                    )}
                  </p>
                ) : null}
                {selectedClue.licenseName ? (
                  <p>
                    Licence :{" "}
                    {selectedClue.licenseUrl ? (
                      <a href={selectedClue.licenseUrl} target="_blank" rel="noreferrer">
                        {selectedClue.licenseName}
                      </a>
                    ) : (
                      selectedClue.licenseName
                    )}
                  </p>
                ) : null}
              </section>
            ) : null}
            {selectedClue.googleMapsUrl ? (
              <a
                className="zoom-country-button"
                href={selectedClue.googleMapsUrl}
                target="_blank"
                rel="noreferrer"
              >
                <MapPinned aria-hidden="true" />
                Ouvrir dans Google Maps
              </a>
            ) : null}
            <section className="detail-section detail-regions">
              <h2>Régions couvertes</h2>
              <div>
                {selectedClue.regions.length > 0
                  ? selectedClue.regions.map((region) => <span key={region}>{region}</span>)
                  : <span>Pays entier</span>}
              </div>
            </section>
            <button
              type="button"
              className="zoom-country-button"
              onClick={() => setViewport("country")}
            >
              <Target aria-hidden="true" />
              Zoomer sur{" "}
              {selectedClue.regions[0]
                ? `${selectedCountry.name} · ${selectedClue.regions[0]}`
                : selectedCountry.name}
            </button>
          </aside>
        ) : (
          <aside
            className="atlas-details atlas-empty-results"
            role="status"
            aria-label="Aucun pays"
          >
            <Globe2 aria-hidden="true" />
            <h2>Aucun pays sélectionné</h2>
            <p>
              Choisissez une catégorie contenant des indices, puis cliquez sur
              un pays de la carte.
            </p>
          </aside>
        )}
      </div>
    </main>
  );
}
