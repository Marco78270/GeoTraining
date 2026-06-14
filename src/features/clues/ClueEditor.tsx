import {
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  LoaderCircle,
  MapPin,
  Send,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useActiveCollection } from "../collections/activeCollectionContext";
import {
  getCollectionApi,
  type Category,
  type CollectionApi,
} from "../collections/collectionApi";
import {
  listCountries,
  listRegions,
  type Country,
  type GeographyDataClient,
  type Region,
} from "../geography/geographyApi";
import {
  ClueCreationError,
  getClueApi,
  type ClueApi,
} from "./clueApi";
import {
  ClueValidationError,
  MAX_CLUE_IMAGE_BYTES,
  MAX_CLUE_IMAGES,
  type ClueCoverage,
  type ClueDifficulty,
  type PersistedClueImage,
} from "./clueSchema";

const steps = [
  "Images",
  "Catégorie",
  "Localisation",
  "Détails",
  "Difficulté et publication",
];
const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type InitialClue = {
  id: string;
  collectionId: string;
  categoryId: string;
  countryCode: string;
  coverage: ClueCoverage;
  regionIds: string[];
  difficulty: ClueDifficulty;
  title: string;
  characteristics: string[];
  notes: string;
  googleMapsUrl: string;
  existingImages: PersistedClueImage[];
};

type ClueEditorProps = {
  clueApi?: ClueApi;
  collectionApi?: CollectionApi;
  geographyClient?: GeographyDataClient;
  mode?: "create" | "edit";
  initialClue?: InitialClue;
  onCreated?(clueId: string): void;
  onCancel?(): void;
};

function errorMessage(error: unknown) {
  if (error instanceof ClueCreationError) {
    if (
      error.stage === "validation" &&
      error.cause instanceof ClueValidationError
    ) {
      return error.cause.message;
    }
    return error.message;
  }
  return "Impossible d'enregistrer l'indice.";
}

export function ClueEditor({
  clueApi: suppliedClueApi,
  collectionApi: suppliedCollectionApi,
  geographyClient,
  mode = "create",
  initialClue,
  onCreated,
  onCancel,
}: ClueEditorProps) {
  const {
    collections,
    activeCollectionId,
    setActiveCollectionId,
  } = useActiveCollection();
  const [clueApi] = useState(() => suppliedClueApi ?? getClueApi());
  const [collectionApi] = useState(
    () => suppliedCollectionApi ?? getCollectionApi(),
  );
  const [step, setStep] = useState(0);
  const [requestedCollectionId, setRequestedCollectionId] = useState<string | null>(
    initialClue?.collectionId ?? null,
  );
  const [categoryId, setCategoryId] = useState(initialClue?.categoryId ?? "");
  const [categoryState, setCategoryState] = useState<{
    collectionId: string;
    rows: Category[];
  }>({ collectionId: "", rows: [] });
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryCode, setCountryCode] = useState(initialClue?.countryCode ?? "");
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [coverage, setCoverage] = useState<ClueCoverage>(
    initialClue?.coverage ?? "whole_country",
  );
  const [selectedRegionIds, setSelectedRegionIds] = useState<Set<string>>(
    () => new Set(initialClue?.regionIds ?? []),
  );
  const [images, setImages] = useState<File[]>([]);
  const [existingImages] = useState<PersistedClueImage[]>(
    initialClue?.existingImages ?? [],
  );
  const [removedImageIds, setRemovedImageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [title, setTitle] = useState(initialClue?.title ?? "");
  const [characteristics, setCharacteristics] = useState(
    initialClue?.characteristics.join("\n") ?? "",
  );
  const [notes, setNotes] = useState(initialClue?.notes ?? "");
  const [googleMapsUrl, setGoogleMapsUrl] = useState(
    initialClue?.googleMapsUrl ?? "",
  );
  const [difficulty, setDifficulty] = useState<ClueDifficulty>(
    initialClue?.difficulty ?? "easy",
  );
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState(false);
  const writableCollections = useMemo(
    () =>
      collections.filter(
        (collection) =>
          collection.visibility !== "public_readonly" ||
          collection.role === "owner",
      ),
    [collections],
  );
  const immutableIdentity = mode === "edit";
  const preferredCollectionId = requestedCollectionId ?? activeCollectionId ?? "";
  const preferredCollection = collections.find(
    (collection) => collection.id === preferredCollectionId,
  );
  const collectionId =
    immutableIdentity ||
    (preferredCollection &&
      (preferredCollection.visibility !== "public_readonly" ||
        preferredCollection.role === "owner"))
      ? preferredCollectionId
      : writableCollections[0]?.id ?? "";
  const activeCollection = collections.find((collection) => collection.id === collectionId);
  const readOnlyCollection =
    activeCollection?.visibility === "public_readonly" &&
    activeCollection.role !== "owner";
  const categories =
    categoryState.collectionId === collectionId ? categoryState.rows : [];

  useEffect(() => {
    let current = true;
    listCountries(geographyClient)
      .then((rows) => {
        if (current) setCountries(rows);
      })
      .catch(() => {
        if (current) setLoadError("Impossible de charger les pays.");
      });
    return () => {
      current = false;
    };
  }, [geographyClient]);

  useEffect(() => {
    let current = true;
    if (!collectionId || readOnlyCollection) {
      return () => undefined;
    }
    collectionApi
      .listCategories(collectionId)
      .then((rows) => {
        if (current) setCategoryState({ collectionId, rows });
      })
      .catch(() => {
        if (current) setLoadError("Impossible de charger les catégories.");
      });
    return () => {
      current = false;
    };
  }, [collectionApi, collectionId, readOnlyCollection]);

  useEffect(() => {
    let current = true;
    if (!countryCode) return () => undefined;
    listRegions(countryCode, geographyClient)
      .then((rows) => {
        if (current) {
          setRegions(rows);
          if (rows.length === 0) {
            setCoverage("whole_country");
            setSelectedRegionIds(new Set());
          }
        }
      })
      .catch(() => {
        if (current) setLoadError("Impossible de charger les régions.");
      })
      .finally(() => {
        if (current) setRegionsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [countryCode, geographyClient]);

  const regionIds = useMemo(() => [...selectedRegionIds], [selectedRegionIds]);
  const visibleExistingImages = useMemo(
    () => existingImages.filter((image) => !removedImageIds.has(image.id)),
    [existingImages, removedImageIds],
  );
  const totalImageCount = visibleExistingImages.length + images.length;

  function validateCurrentStep() {
    if (step === 0) {
      if (totalImageCount === 0) return "Ajoutez au moins une image.";
      if (totalImageCount > MAX_CLUE_IMAGES) {
        return `Ajoutez au maximum ${MAX_CLUE_IMAGES} images.`;
      }
      if (images.some((file) => !acceptedTypes.has(file.type))) {
        return "Seuls les fichiers JPEG, PNG et WebP sont acceptés.";
      }
      if (images.some((file) => file.size > MAX_CLUE_IMAGE_BYTES)) {
        return "Chaque image doit peser 10 Mo maximum.";
      }
    }
    if (step === 1 && (!collectionId || !categoryId)) {
      return "Sélectionnez une collection et une catégorie.";
    }
    if (step === 2) {
      if (!countryCode) return "Sélectionnez un pays.";
      if (coverage === "selected_regions" && regionIds.length === 0) {
        return "Sélectionnez au moins une région.";
      }
    }
    if (step === 3 && !title.trim()) return "Ajoutez un titre.";
    return "";
  }

  function continueToNextStep() {
    const message = validateCurrentStep();
    if (message) {
      setFormError(message);
      return;
    }
    setFormError("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function selectCollection(nextCollectionId: string) {
    setCategoryId("");
    setCategoryState({ collectionId: "", rows: [] });
    setRequestedCollectionId(nextCollectionId);
    setActiveCollectionId(nextCollectionId || null);
  }

  function selectCountry(nextCountryCode: string) {
    setRegions([]);
    setRegionsLoading(Boolean(nextCountryCode));
    setSelectedRegionIds(new Set());
    setCountryCode(nextCountryCode);
  }

  function toggleExistingImageRemoval(imageId: string) {
    setRemovedImageIds((current) => {
      const next = new Set(current);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return next;
    });
  }

  function toggleRegion(regionId: string) {
    setSelectedRegionIds((current) => {
      const next = new Set(current);
      if (next.has(regionId)) next.delete(regionId);
      else next.add(regionId);
      return next;
    });
  }

  async function publish() {
    setFormError("");
    setLoading(true);
    setSuccess(false);
    try {
      const payload = {
        collectionId,
        categoryIds: categoryId ? [categoryId] : [],
        countryCode,
        coverage,
        regionIds: coverage === "whole_country" ? [] : regionIds,
        difficulty,
        title,
        characteristics: characteristics.split("\n"),
        notes,
        googleMapsUrl,
        images,
      };
      const result =
        mode === "edit" && initialClue
          ? await clueApi.update({
              ...payload,
              clueId: initialClue.id,
              previousCoverage: initialClue.coverage,
              existingImages,
              removedImageIds: [...removedImageIds],
            })
          : await clueApi.create(payload);
      setSuccess(true);
      onCreated?.(result.id);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="clue-editor" aria-label="Éditeur d’indice">
      <header className="clue-editor-header">
        <div>
          <span className="clue-editor-kicker">
            {mode === "edit" ? "Modification d’indice" : "Nouvel indice privé"}
          </span>
          <h1>{mode === "edit" ? "Modifier un indice" : "Ajouter un indice"}</h1>
          <p>Documentez un détail visuel puis associez-le à sa localisation.</p>
        </div>
        {onCancel ? (
          <button type="button" className="clue-editor-close" onClick={onCancel}>
            Fermer
          </button>
        ) : null}
      </header>

      <ol className="clue-steps" aria-label="Étapes de création">
        {steps.map((label, index) => (
          <li
            key={label}
            className={index === step ? "active" : index < step ? "done" : ""}
          >
            <span>{index < step ? <Check aria-hidden="true" /> : index + 1}</span>
            <small>{label}</small>
          </li>
        ))}
      </ol>

      <div className="clue-editor-body">
        {step === 0 ? (
          <div className="clue-step-panel">
            <ImagePlus aria-hidden="true" className="clue-step-icon" />
            <h2>1. Images</h2>
            <p>Ajoutez de 1 à 6 photos au format JPEG, PNG ou WebP.</p>
            <label className="clue-upload-zone">
              <span>Images de l’indice</span>
              <input
                type="file"
                aria-label="Images de l’indice"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(event) => setImages([...event.target.files ?? []])}
              />
              <strong>Choisir des images</strong>
              <small>10 Mo maximum par image</small>
            </label>
            {visibleExistingImages.length > 0 ? (
              <div className="clue-file-summary">
                {visibleExistingImages.map((image) => (
                  <span key={image.id}>
                    {image.altText ?? image.id}
                    <button
                      type="button"
                      onClick={() => toggleExistingImageRemoval(image.id)}
                    >
                      Retirer
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            {images.length > 0 ? (
              <div className="clue-file-summary">
                {images.map((file) => (
                  <span key={`${file.name}-${file.lastModified}`}>{file.name}</span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="clue-step-panel">
            <h2>2. Catégorie</h2>
            <p>Un indice appartient à une seule catégorie de votre collection.</p>
            <label>
              Collection
              <select
                value={collectionId}
                disabled={immutableIdentity}
                onChange={(event) => selectCollection(event.target.value)}
              >
                <option value="">Choisir une collection</option>
                {writableCollections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Catégorie
              <select
                value={categoryId}
                disabled={immutableIdentity}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">Choisir une catégorie</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="clue-step-panel">
            <MapPin aria-hidden="true" className="clue-step-icon" />
            <h2>3. Localisation</h2>
            <p>Sélectionnez le pays entier ou seulement certaines régions.</p>
            <label>
              Pays
              <select
                value={countryCode}
                disabled={immutableIdentity}
                onChange={(event) => selectCountry(event.target.value)}
              >
                <option value="">Choisir un pays</option>
                {countries.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="clue-coverage">
              <legend>Couverture</legend>
              <label>
                <input
                  type="radio"
                  name="coverage"
                  checked={coverage === "whole_country"}
                  onChange={() => setCoverage("whole_country")}
                />
                Pays entier
              </label>
              <label>
                <input
                  type="radio"
                  name="coverage"
                  checked={coverage === "selected_regions"}
                  disabled={
                    Boolean(countryCode) &&
                    !regionsLoading &&
                    regions.length === 0
                  }
                  onChange={() => setCoverage("selected_regions")}
                />
                Certaines régions
              </label>
            </fieldset>
            {countryCode && !regionsLoading && regions.length === 0 ? (
              <p className="clue-inline-note">
                Aucune division administrative disponible pour ce pays.
              </p>
            ) : null}
            {regions.length > 0 ? (
              <fieldset className="clue-region-grid">
                <legend>Régions</legend>
                {regions.map((region) => (
                  <label key={region.id}>
                    <input
                      type="checkbox"
                      checked={
                        coverage === "whole_country" ||
                        selectedRegionIds.has(region.id)
                      }
                      disabled={coverage === "whole_country"}
                      onChange={() => toggleRegion(region.id)}
                    />
                    {region.name}
                  </label>
                ))}
              </fieldset>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="clue-step-panel">
            <h2>4. Détails</h2>
            <p>Ajoutez les informations utiles à mémoriser pendant l’entraînement.</p>
            <label>
              Titre
              <input
                value={title}
                maxLength={160}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label>
              Caractéristiques
              <textarea
                value={characteristics}
                onChange={(event) => setCharacteristics(event.target.value)}
                placeholder="Une caractéristique par ligne"
              />
            </label>
            <label>
              Notes
              <textarea
                value={notes}
                maxLength={5000}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            <label>
              Lien Google Maps
              <input
                type="url"
                value={googleMapsUrl}
                placeholder="https://www.google.com/maps/..."
                onChange={(event) => setGoogleMapsUrl(event.target.value)}
              />
            </label>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="clue-step-panel clue-review">
            <h2>5. Difficulté et publication</h2>
            <p>Vérifiez votre indice avant de l’enregistrer dans la collection privée.</p>
            <fieldset className="clue-difficulty">
              <legend>Difficulté</legend>
              {(["easy", "medium", "expert"] as const).map((value) => (
                <label key={value} className={value}>
                  <input
                    type="radio"
                    name="difficulty"
                    checked={difficulty === value}
                    onChange={() => setDifficulty(value)}
                  />
                  {value === "easy" ? "Facile" : value === "medium" ? "Moyen" : "Expert"}
                </label>
              ))}
            </fieldset>
            <div className="clue-review-card">
              <span>{totalImageCount} image{totalImageCount > 1 ? "s" : ""}</span>
              <strong>{title}</strong>
              <span>
                {countries.find((country) => country.code === countryCode)?.name}
                {coverage === "selected_regions"
                  ? ` · ${regionIds.length} région${regionIds.length > 1 ? "s" : ""}`
                  : " · pays entier"}
              </span>
            </div>
            <button
              type="button"
              className="clue-publish-button"
              disabled={loading || readOnlyCollection}
              onClick={() => void publish()}
            >
              {loading ? (
                <LoaderCircle className="spin" aria-hidden="true" />
              ) : (
                <Send aria-hidden="true" />
              )}
              {mode === "edit" ? "Mettre à jour l’indice" : "Publier l’indice"}
            </button>
            {readOnlyCollection ? (
              <p className="clue-inline-note">
                Cette collection est en lecture seule. Choisissez une collection privée pour publier un indice.
              </p>
            ) : null}
            {success ? (
              <p className="clue-success" role="status">
                {mode === "edit"
                  ? "L’indice a été mis à jour."
                  : "L’indice a été publié."}
              </p>
            ) : null}
          </div>
        ) : null}

        {loadError ? <p role="alert">{loadError}</p> : null}
        {formError ? <p className="clue-form-error" role="alert">{formError}</p> : null}
      </div>

      <footer className="clue-editor-footer">
        <button
          type="button"
          disabled={step === 0 || loading}
          onClick={() => {
            setFormError("");
            setStep((current) => Math.max(0, current - 1));
          }}
        >
          <ChevronLeft aria-hidden="true" />
          Retour
        </button>
        {step < steps.length - 1 ? (
          <button type="button" className="primary" onClick={continueToNextStep}>
            Continuer
            <ChevronRight aria-hidden="true" />
          </button>
        ) : null}
      </footer>
    </section>
  );
}
