import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bookmark,
  Globe2,
  GraduationCap,
  Map,
  MapPinned,
  Plus,
  Search,
  ShieldCheck,
  Signpost,
  Target,
  Trophy,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ProfileMenu } from "../admin/ProfileMenu";
import {
  canWriteCollectionContent,
  usePlatformRole,
} from "../admin/platformRole";
import { useAuth } from "../auth/authContext";
import { useActiveCollection } from "../collections/activeCollectionContext";
import { getCategoryIcon } from "../collections/categoryIcons";
import { collectionKeys } from "../collections/collectionKeys";
import { CollectionPicker } from "../collections/CollectionPicker";
import { getClueApi, type ClueApi } from "../clues/clueApi";
import {
  getAtlasApi,
  type AtlasApi,
  type AtlasCategory,
  type AtlasCountry,
  type Difficulty,
} from "./atlasApi";
import {
  preloadAtlasExperience,
  preloadAtlasMapModule,
  scheduleMapAssetPreload,
} from "../geography/mapAssetPreload";

const AtlasMap = lazy(async () => {
  const module = await preloadAtlasMapModule();
  return { default: module.AtlasMap };
});

const difficultyOrder: Difficulty[] = ["easy", "medium", "expert"];
const difficultyLabels: Record<Difficulty, string> = {
  easy: "Facile",
  medium: "Moyen",
  expert: "Expert",
};
const emptyCategories: AtlasCategory[] = [];
const emptyCountries: AtlasCountry[] = [];

function CategoryIcon({ category }: { category: AtlasCategory }) {
  const Icon = getCategoryIcon(category.icon).Icon;
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
  clueApi: suppliedClueApi,
}: {
  atlasApi?: AtlasApi;
  clueApi?: Pick<ClueApi, "delete">;
}) {
  const { signOut, user } = useAuth();
  const platformRole = usePlatformRole();
  const {
    collections,
    activeCollection,
    activeCollectionId,
    setActiveCollectionId,
    isLoading: collectionsLoading,
    error: collectionsError,
  } = useActiveCollection();
  const [atlasApi] = useState(() => suppliedAtlasApi ?? getAtlasApi());
  const [clueApi] = useState(() => suppliedClueApi ?? getClueApi());
  const isPublicReadOnly = activeCollection?.visibility === "public_readonly";
  const canEditActiveCollection = canWriteCollectionContent(
    activeCollection,
    platformRole,
  );
  const [activeCategoryId, setActiveCategoryId] = useState("");
  const [activeDifficulties, setActiveDifficulties] = useState<Set<Difficulty>>(
    () => new Set(difficultyOrder),
  );
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(
    null,
  );
  const [selectedClueId, setSelectedClueId] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  useEffect(() => scheduleMapAssetPreload(preloadAtlasExperience), []);
  const [viewport, setViewport] = useState<"world" | "country">("world");
  const [countryFocusToken, setCountryFocusToken] = useState(0);
  const [search, setSearch] = useState("");
  const [isDeletingClue, setIsDeletingClue] = useState(false);

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
  const safeSelectedImageIndex = selectedClue
    ? Math.min(selectedImageIndex, Math.max(selectedClue.imageUrls.length - 1, 0))
    : 0;
  const selectedImageUrl = selectedClue?.imageUrls[safeSelectedImageIndex] ?? null;
  const selectedImageAlt =
    selectedClue?.imageAlts[safeSelectedImageIndex] ?? selectedClue?.title ?? "";
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
  const visibleZones = useMemo(
    () =>
      markers.flatMap((country) =>
        country.clues.flatMap((clue) =>
          clue.coverage === "drawn_zone" && clue.zoneGeoJson
            ? [
                {
                  id: clue.id,
                  geoJson: clue.zoneGeoJson,
                  difficulty: clue.difficulty,
                  selected: clue.id === selectedClue?.id,
                },
              ]
            : [],
        ),
      ),
    [markers, selectedClue?.id],
  );

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
    setSelectedImageIndex(0);
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
    setSelectedImageIndex(0);
    setViewport("country");
  }

  async function handleDeleteClue() {
    if (!selectedClue) return;

    const confirmed = window.confirm(
      `Supprimer définitivement l’indice "${selectedClue.title}" ?`,
    );
    if (!confirmed) return;

    setIsDeletingClue(true);
    try {
      await clueApi.delete(selectedClue.id);
      setSelectedClueId(null);
      setSelectedCountryCode(null);
      setSelectedRegionId(null);
      setSelectedImageIndex(0);
      setViewport("world");
      await query.refetch();
    } finally {
      setIsDeletingClue(false);
    }
  }

  const totalClues = activeCategory?.total ?? 0;
  const totalCountries = activeCategory?.countries ?? 0;
  const mapFallback = (
    <div className="atlas-map-frame atlas-map-loading" role="status">
      Chargement de la carte...
    </div>
  );

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
          <NavLink to="/leaderboard"><Trophy />Classement</NavLink>
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
            platformRole={platformRole}
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
                    <span className="category-check" aria-hidden="true">{active ? "✓" : ""}</span>
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
            <Suspense fallback={mapFallback}>
              <AtlasMap
                markers={markers}
                selectedCountryCode={effectiveSelectedCountryCode}
                selectedRegionId={effectiveSelectedRegionId}
                viewport={effectiveSelectedCountryCode ? viewport : "world"}
                focusRequestToken={countryFocusToken}
                hasWholeCountryCoverage={
                  selectedCountryCoverage.hasWholeCountryCoverage
                }
                coveredRegionIds={selectedCountryCoverage.coveredRegionIds}
                visibleZones={visibleZones}
                onCountrySelect={selectCountry}
                onRegionSelect={selectRegion}
                onViewportChange={setViewport}
              />
            </Suspense>
            {viewport === "country" ? (
              <button
                type="button"
                className="world-view-button"
                onClick={() => {
                  setSelectedCountryCode(null);
                  setSelectedClueId(null);
                  setSelectedRegionId(null);
                  setSelectedImageIndex(0);
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
              <>
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
                      zoneGeoJson: selectedClue.zoneGeoJson,
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
                <button
                  type="button"
                  className="zoom-country-button"
                  onClick={() => {
                    void handleDeleteClue();
                  }}
                  disabled={isDeletingClue}
                >
                  {isDeletingClue ? "Suppression…" : "Supprimer l’indice"}
                </button>
              </>
            ) : null}
            {selectedImageUrl ? (
              <figure className="atlas-clue-gallery">
                <img
                  className="atlas-clue-image"
                  src={selectedImageUrl}
                  alt={selectedImageAlt}
                />
                {selectedClue.imageUrls.length > 1 ? (
                  <figcaption>
                    Image {safeSelectedImageIndex + 1} / {selectedClue.imageUrls.length}
                  </figcaption>
                ) : null}
              </figure>
            ) : null}
            {selectedClue.imageUrls.length > 1 ? (
              <div className="detail-thumbnails" aria-label="Images de l'indice">
                {selectedClue.imageUrls.map((url, index) => (
                  <button
                    key={url}
                    type="button"
                    className={index === safeSelectedImageIndex ? "active" : ""}
                    onClick={() => setSelectedImageIndex(index)}
                    aria-label={`Afficher l'image ${index + 1}`}
                  >
                    <img
                      src={url}
                      alt={selectedClue.imageAlts[index] ?? selectedClue.title}
                    />
                  </button>
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
              <h2>Couverture</h2>
              <div>
                {selectedClue.coverage === "drawn_zone" ? (
                  <span>Zone dessinée</span>
                ) : selectedClue.regions.length > 0 ? (
                  selectedClue.regions.map((region) => <span key={region}>{region}</span>)
                ) : (
                  <span>Pays entier</span>
                )}
              </div>
            </section>
            <button
              type="button"
              className="zoom-country-button"
              onClick={() => {
                if (selectedClue?.coverage === "selected_regions") {
                  setSelectedRegionId(selectedClue.regionIds[0] ?? null);
                }
                setViewport("country");
                setCountryFocusToken((current) => current + 1);
              }}
            >
              <Target aria-hidden="true" />
              Zoomer sur{" "}
              {selectedClue.regions[0]
                ? `${selectedCountry.name} · ${selectedClue.regions[0]}`
                : selectedClue.coverage === "drawn_zone"
                  ? `${selectedCountry.name} · zone dessinée`
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
