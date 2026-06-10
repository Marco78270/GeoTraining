import {
  BarChart3,
  Bookmark,
  ChevronDown,
  CircleUserRound,
  Globe2,
  GraduationCap,
  LogOut,
  Map,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth/authContext";
import { useActiveCollection } from "../collections/activeCollectionContext";
import { CollectionPicker } from "../collections/CollectionPicker";
import { AtlasMap } from "./AtlasMap";
import {
  atlasCategories,
  atlasCountries,
  difficultyLabels,
  type Difficulty,
} from "./atlasDemoData";

const difficultyOrder: Difficulty[] = ["easy", "medium", "expert"];
const continentOrder = ["Europe", "Asie", "Amériques", "Océanie", "Afrique"] as const;

function filterCountries(
  categoryId: string,
  difficulties: ReadonlySet<Difficulty>,
  continents: ReadonlySet<string>,
) {
  return atlasCountries.filter(
    (country) =>
      difficulties.has(country.difficulty) &&
      continents.has(country.continent) &&
      (country.counts[categoryId] ?? 0) > 0,
  );
}

function StopSign({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? "stop-sign stop-sign-small" : "stop-sign"} aria-hidden="true">
      STOP
    </span>
  );
}

function DemoVisual({
  tone,
  variant = "hero",
}: {
  tone: string;
  variant?: "hero" | "street" | "city";
}) {
  return (
    <div className={`demo-visual demo-visual-${variant} demo-tone-${tone}`}>
      <div className="demo-sky" />
      <div className="demo-building demo-building-left" />
      <div className="demo-building demo-building-right" />
      <div className="demo-road" />
      <div className="demo-sign-post">
        <StopSign small={variant !== "hero"} />
      </div>
    </div>
  );
}

export function AtlasPage() {
  const { signOut, user } = useAuth();
  const {
    collections,
    activeCollection,
    activeCollectionId,
    setActiveCollectionId,
    isLoading,
    error,
  } = useActiveCollection();
  const [activeCategoryId, setActiveCategoryId] = useState("stop");
  const [activeDifficulties, setActiveDifficulties] = useState<Set<Difficulty>>(
    () => new Set(difficultyOrder),
  );
  const [activeContinents, setActiveContinents] = useState<Set<string>>(
    () => new Set(continentOrder),
  );
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(null);
  const [viewport, setViewport] = useState<"world" | "country">("world");
  const [quizNotice, setQuizNotice] = useState(false);

  const activeCategory =
    atlasCategories.find((category) => category.id === activeCategoryId) ??
    atlasCategories[0];
  const markers = useMemo(
    () => filterCountries(activeCategory.id, activeDifficulties, activeContinents),
    [activeCategory.id, activeContinents, activeDifficulties],
  );
  const selectedCountry =
    markers.find((country) => country.code === selectedCountryCode) ??
    markers[0] ??
    null;

  function reconcileSelection(nextMarkers: typeof markers) {
    if (selectedCountryCode && !nextMarkers.some((country) => country.code === selectedCountryCode)) {
      setSelectedCountryCode(nextMarkers[0]?.code ?? null);
      setViewport(nextMarkers.length > 0 ? "country" : "world");
    }
  }

  function toggleDifficulty(difficulty: Difficulty) {
    const next = new Set(activeDifficulties);
    if (next.has(difficulty) && next.size > 1) {
      next.delete(difficulty);
    } else {
      next.add(difficulty);
    }
    setActiveDifficulties(next);
    reconcileSelection(filterCountries(activeCategory.id, next, activeContinents));
  }

  function toggleContinent(continent: string) {
    const next = new Set(activeContinents);
    if (next.has(continent) && next.size > 1) {
      next.delete(continent);
    } else {
      next.add(continent);
    }
    setActiveContinents(next);
    reconcileSelection(filterCountries(activeCategory.id, activeDifficulties, next));
  }

  function selectCategory(categoryId: string) {
    setActiveCategoryId(categoryId);
    reconcileSelection(filterCountries(categoryId, activeDifficulties, activeContinents));
  }

  function showWorld() {
    setSelectedCountryCode(null);
    setViewport("world");
  }

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
          <span aria-disabled="true"><GraduationCap />Entraînement <small>Bientôt</small></span>
          <span aria-disabled="true"><BarChart3 />Statistiques <small>Bientôt</small></span>
        </nav>
        <div className="atlas-account">
          <CircleUserRound aria-hidden="true" />
          <span>{user?.email ?? "Utilisateur"}</span>
          <ChevronDown aria-hidden="true" />
          <button type="button" onClick={() => void signOut()} aria-label="Se déconnecter">
            <LogOut aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="atlas-workspace">
        <aside className="atlas-sidebar" aria-label="Filtres de l’Atlas">
          <label className="atlas-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Rechercher un pays ou un indice</span>
            <input placeholder="Rechercher un pays ou un indice" />
          </label>

          <CollectionPicker
            collections={collections}
            value={activeCollectionId}
            onChange={setActiveCollectionId}
            disabled={isLoading}
          />
          {isLoading ? <p className="atlas-state">Chargement des collections…</p> : null}
          {error ? <p className="atlas-state atlas-state-error">Impossible de charger les collections.</p> : null}
          {!isLoading && !activeCollection ? (
            <div className="atlas-empty-collection">
              <p>Créez une collection privée pour enregistrer vos propres indices.</p>
              <Link to="/collections">Créer une collection</Link>
            </div>
          ) : null}

          <section className="atlas-filter-section">
            <h2>Catégories</h2>
            <div className="category-filters">
              {atlasCategories.map((category) => {
                const Icon = category.icon;
                const active = activeCategory.id === category.id;
                return (
                  <button
                    type="button"
                    key={category.id}
                    className={active ? "active" : ""}
                    aria-pressed={active}
                    onClick={() => selectCategory(category.id)}
                  >
                    {category.id === "stop" ? <StopSign small /> : <Icon aria-hidden="true" />}
                    <span>{category.name}</span>
                    <span className="category-check" aria-hidden="true">{active ? "✓" : ""}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="atlas-filter-section atlas-region-filters">
            <h2>Régions</h2>
            <div>
              {continentOrder.map((continent) => (
                <button
                  type="button"
                  key={continent}
                  className={activeContinents.has(continent) ? "active" : ""}
                  aria-pressed={activeContinents.has(continent)}
                  onClick={() => toggleContinent(continent)}
                >
                  <Globe2 aria-hidden="true" />{continent}
                </button>
              ))}
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

          <Link className="add-clue-button" to="/collections">
            <Plus aria-hidden="true" />Ajouter un indice
          </Link>
        </aside>

        <section className="atlas-center">
          <div
            className="atlas-demo-notice"
            role="status"
            aria-label="Données de démonstration"
          >
            <Sparkles aria-hidden="true" />
            <p>
              <strong>Données de démonstration.</strong> La carte, les compteurs, les
              galeries et les notes ci-dessous sont des exemples. Les imports de{" "}
              <b>{activeCollection?.name ?? "votre collection"}</b> ne sont pas encore
              affichés dans cet aperçu.
            </p>
          </div>
          <div className="atlas-map-panel">
            <AtlasMap
              markers={markers}
              selectedCountryCode={selectedCountryCode}
              viewport={viewport}
              onCountrySelect={setSelectedCountryCode}
              onViewportChange={setViewport}
            />
            {viewport === "country" ? (
              <button type="button" className="world-view-button" onClick={showWorld}>
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
              <div><span>Indices démo</span><strong>{activeCategory.total}</strong></div>
            </article>
            <article>
              <span className="stat-icon stat-icon-green"><Globe2 /></span>
              <div><span>Pays démo</span><strong>{activeCategory.countries}</strong></div>
            </article>
            <article>
              <span className="stat-icon stat-icon-red"><StopSign small /></span>
              <div><span>Catégorie active</span><strong>{activeCategory.shortName}</strong></div>
            </article>
          </div>
        </section>

        {selectedCountry ? (
          <aside className="atlas-details" aria-label="Détail du pays">
          <div className="detail-heading">
            <div>
              <h1>{selectedCountry.name}</h1>
              <p>Catégorie : <strong>{activeCategory.name}</strong></p>
            </div>
            <span className={`difficulty-badge ${selectedCountry.difficulty}`}>
              <ShieldCheck aria-hidden="true" />
              {difficultyLabels[selectedCountry.difficulty]}
            </span>
          </div>
          <div className="demo-label"><Sparkles aria-hidden="true" /> galerie démo</div>
          <DemoVisual tone={selectedCountry.visualTone} />
          <div className="detail-thumbnails">
            <DemoVisual tone={selectedCountry.visualTone} variant="street" />
            <DemoVisual tone={selectedCountry.visualTone} variant="city" />
          </div>

          <section className="detail-section">
            <h2>Caractéristiques</h2>
            <ul>
              {selectedCountry.characteristics.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
          <section className="detail-section">
            <h2>Notes GeoGuessr démo</h2>
            <ul>
              {selectedCountry.notes.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
          <section className="detail-section detail-regions">
            <h2>Régions couvertes</h2>
            <div>{selectedCountry.regions.map((region) => <span key={region}>{region}</span>)}</div>
          </section>
          <button
            type="button"
            className="zoom-country-button"
            onClick={() => setViewport("country")}
          >
            <Target aria-hidden="true" />Zoomer sur {selectedCountry.name}
          </button>
          <button
            type="button"
            className="quiz-button"
            onClick={() => setQuizNotice(true)}
          >
            <GraduationCap aria-hidden="true" />Lancer un quiz
          </button>
          {quizNotice ? <p className="quiz-notice" role="status">Le mode entraînement arrive bientôt.</p> : null}
          </aside>
        ) : (
          <aside
            className="atlas-details atlas-empty-results"
            role="status"
            aria-label="Aucun pays"
          >
            <Globe2 aria-hidden="true" />
            <h2>Aucun pays ne correspond aux filtres</h2>
            <p>Réactivez une région, une difficulté ou choisissez une autre catégorie.</p>
          </aside>
        )}
      </div>
    </main>
  );
}
