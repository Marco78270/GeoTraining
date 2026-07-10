import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "../load-env.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const outputDir = path.join(repoRoot, "output");
const defaultDatasetPaths = [
  path.join(__dirname, "plates.v1.json"),
  path.join(__dirname, "plates.europe.v1.json"),
  path.join(__dirname, "plates.us-states.v1.json"),
  path.join(__dirname, "plates.geometas.v1.json"),
];

loadLocalEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PLATES_AUTHOR_ID = process.env.SUPABASE_PLATES_AUTHOR_ID ?? null;

const OFFICIAL_COLLECTION_ID = "f0000000-0000-0000-0000-000000000001";
const PLATES_CATEGORY_ID = "f1000000-0000-0000-0000-000000000003";
const DRY_RUN = process.argv.includes("--dry-run");
const MISSING_IMAGES_ONLY = process.argv.includes("--missing-images-only");
const GEOMETAS_ONLY = process.argv.includes("--geometas-only");
const datasetPaths = GEOMETAS_ONLY
  ? [path.join(__dirname, "plates.geometas.v1.json")]
  : defaultDatasetPaths;
const FETCH_RETRY_ATTEMPTS = 6;
const FETCH_RETRY_BASE_DELAY_MS = 3000;
const FETCH_REQUEST_SPACING_MS = 1500;
const WIKIMEDIA_THUMBNAIL_WIDTH = 1200;
const IMPORT_USER_AGENT =
  "GeoTrainerAtlas/1.0 (https://github.com/Marco78270/GeoTraining)";

if (!SUPABASE_URL) {
  throw new Error("VITE_SUPABASE_URL est requis.");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY est requis pour l'import officiel.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  if (!error) {
    return "Erreur inconnue.";
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object") {
    if ("message" in error && typeof error.message === "string") {
      const details =
        "details" in error && typeof error.details === "string"
          ? ` (${error.details})`
          : "";
      const hint =
        "hint" in error && typeof error.hint === "string"
          ? ` Hint: ${error.hint}`
          : "";
      const code =
        "code" in error && typeof error.code === "string"
          ? ` [${error.code}]`
          : "";
      return `${error.message}${details}${hint}${code}`;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function isMissingClueSourceMetadata(error) {
  if (!error?.message) return false;
  return (
    error.message.includes("source_name") ||
    error.message.includes("source_url") ||
    error.message.includes("license_name") ||
    error.message.includes("license_url") ||
    error.message.includes("attribution_text")
  );
}

function sniffImageFormat(buffer) {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { extension: "png", contentType: "image/png" };
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }

  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { extension: "webp", contentType: "image/webp" };
  }

  if (
    buffer.length >= 5 &&
    buffer[0] === 0x3c &&
    buffer[1] === 0x3f &&
    buffer[2] === 0x78 &&
    buffer[3] === 0x6d &&
    buffer[4] === 0x6c
  ) {
    return { extension: "svg", contentType: "image/svg+xml" };
  }

  if (
    buffer.length >= 4 &&
    buffer[0] === 0x3c &&
    buffer[1] === 0x73 &&
    buffer[2] === 0x76 &&
    buffer[3] === 0x67
  ) {
    return { extension: "svg", contentType: "image/svg+xml" };
  }

  throw new Error("Format d'image non supporte pour l'import des plaques.");
}

async function fetchImage(url) {
  await sleep(FETCH_REQUEST_SPACING_MS);
  const response = await fetchWithRetry(buildDownloadUrl(url), {
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/svg+xml",
      "User-Agent": IMPORT_USER_AGENT,
    },
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  const detected = sniffImageFormat(buffer);
  return { buffer, ...detected };
}

function buildDownloadUrl(url) {
  const parsed = new URL(url);
  if (
    parsed.hostname === "commons.wikimedia.org" &&
    parsed.pathname.includes("/wiki/Special:FilePath/")
  ) {
    parsed.searchParams.set("width", String(WIKIMEDIA_THUMBNAIL_WIDTH));
  }
  return parsed.toString();
}

function buildImagePath(clueId, imageId, extension) {
  return `${OFFICIAL_COLLECTION_ID}/${clueId}/${imageId}.${extension}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function fetchWithRetry(url, options) {
  let lastError = null;

  for (let attempt = 1; attempt <= FETCH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }

      if (!shouldRetryStatus(response.status) || attempt === FETCH_RETRY_ATTEMPTS) {
        throw new Error(`Image plaque indisponible (${response.status}) pour ${url}.`);
      }

      lastError = new Error(
        `Tentative ${attempt}/${FETCH_RETRY_ATTEMPTS} en echec (${response.status}) pour ${url}.`,
      );
    } catch (error) {
      lastError = error;
      if (attempt === FETCH_RETRY_ATTEMPTS) {
        break;
      }
    }

    await sleep(FETCH_RETRY_BASE_DELAY_MS * attempt);
  }

  throw lastError ?? new Error(`Impossible de charger ${url}.`);
}

async function resolveAuthorId() {
  if (PLATES_AUTHOR_ID) {
    return PLATES_AUTHOR_ID;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Impossible de determiner un auteur pour l'import officiel: ${formatError(error)}.`,
    );
  }

  if (!data?.id) {
    throw new Error(
      "Aucun profil trouve pour attribuer les indices officiels. Creez au moins un utilisateur, ou definissez SUPABASE_PLATES_AUTHOR_ID.",
    );
  }

  return data.id;
}

async function ensureOfficialRecords() {
  const { data: collection, error: collectionError } = await supabase
    .from("collections")
    .select("id")
    .eq("id", OFFICIAL_COLLECTION_ID)
    .single();
  if (collectionError || !collection) {
    throw new Error("Collection publique 'Collection officielle' introuvable.");
  }

  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id")
    .eq("id", PLATES_CATEGORY_ID)
    .single();
  if (categoryError || !category) {
    throw new Error("Categorie publique 'Plaques' introuvable.");
  }
}

async function loadDataset() {
  const nestedEntries = await Promise.all(
    datasetPaths.map(async (datasetPath) => {
      const raw = await readFile(datasetPath, "utf8");
      return JSON.parse(raw);
    }),
  );

  const entries = nestedEntries.flat();
  const seenIds = new Set();

  for (const entry of entries) {
    if (seenIds.has(entry.id)) {
      throw new Error(`ID duplique dans les datasets plaques: ${entry.id}.`);
    }
    seenIds.add(entry.id);
  }

  return entries;
}

async function loadCountries() {
  const { data, error } = await supabase
    .from("countries")
    .select("code, name")
    .order("name");
  if (error) throw error;
  return new Set(data.map((country) => country.code));
}

async function loadRegions() {
  const { data, error } = await supabase
    .from("regions")
    .select("id, country_code, name");
  if (error) throw error;
  return {
    byId: new Map(data.map((region) => [region.id, region])),
    byCountryAndName: new Map(
      data.map((region) => [
        `${region.country_code}:${region.name.toLocaleLowerCase("en-US")}`,
        region,
      ]),
    ),
  };
}

async function loadExistingClues() {
  const { data, error } = await supabase
    .from("clues")
    .select("id, clue_images(id, storage_path)")
    .eq("collection_id", OFFICIAL_COLLECTION_ID)
    .eq("category_id", PLATES_CATEGORY_ID);
  if (error) throw error;
  return new Map(data.map((clue) => [clue.id, clue]));
}

async function replaceRegions(clueId, regionIds) {
  const { error: deleteError } = await supabase
    .from("clue_regions")
    .delete()
    .eq("clue_id", clueId);
  if (deleteError) throw deleteError;

  if (regionIds.length === 0) {
    return;
  }

  const { error: insertError } = await supabase.from("clue_regions").insert(
    regionIds.map((regionId) => ({
      clue_id: clueId,
      region_id: regionId,
    })),
  );
  if (insertError) throw insertError;
}

async function deleteImage(image) {
  const { error: removeRowError } = await supabase
    .from("clue_images")
    .delete()
    .eq("id", image.id);
  if (removeRowError) throw removeRowError;

  const { error: removeObjectError } = await supabase.storage
    .from("clue-images")
    .remove([image.storage_path]);
  if (removeObjectError) throw removeObjectError;
}

async function uploadImage(entry, clueId, existingImage) {
  if (!entry.imageUrl) {
    throw new Error(`Aucune image configuree pour ${entry.id}.`);
  }

  const imageId = existingImage?.id ?? crypto.randomUUID();
  const { buffer, extension, contentType } = await fetchImage(entry.imageUrl);
  const storagePath = buildImagePath(clueId, imageId, extension);

  const { error: uploadError } = await supabase.storage
    .from("clue-images")
    .upload(storagePath, buffer, { contentType, upsert: true });
  if (uploadError) throw uploadError;

  const { error: metadataError } = await supabase.from("clue_images").upsert({
    id: imageId,
    clue_id: clueId,
    storage_path: storagePath,
    alt_text: entry.imageAltText ?? entry.title,
    sort_order: 0,
  });
  if (metadataError) throw metadataError;

  return { imageId, storagePath };
}

async function upsertClue(entry, authorId) {
  const payload = {
    id: entry.id,
    collection_id: OFFICIAL_COLLECTION_ID,
    category_id: PLATES_CATEGORY_ID,
    country_code: entry.countryCode,
    coverage: entry.coverage,
    difficulty: entry.difficulty,
    status: "published",
    title: entry.title,
    characteristics: entry.characteristics,
    notes: entry.notes,
    source_name: entry.sourceName,
    source_url: entry.sourceUrl,
    license_name: entry.licenseName,
    license_url: entry.licenseUrl,
    attribution_text: entry.attributionText,
    google_maps_url: entry.googleMapsUrl ?? null,
    author_id: authorId,
  };

  const legacyPayload = {
    id: entry.id,
    collection_id: OFFICIAL_COLLECTION_ID,
    category_id: PLATES_CATEGORY_ID,
    country_code: entry.countryCode,
    coverage: entry.coverage,
    difficulty: entry.difficulty,
    status: "published",
    title: entry.title,
    characteristics: entry.characteristics,
    notes: entry.notes,
    google_maps_url: entry.googleMapsUrl ?? null,
    author_id: authorId,
  };

  const { error } = await supabase.from("clues").upsert(payload);
  if (error) {
    if (!isMissingClueSourceMetadata(error)) throw error;
    const { error: legacyError } = await supabase.from("clues").upsert(legacyPayload);
    if (legacyError) throw legacyError;
  }
}

function resolveRegionIds(entry, regions) {
  if (entry.coverage !== "selected_regions") {
    return [];
  }

  const resolvedRegionIds = [];
  const requestedIds = Array.isArray(entry.regionIds) ? entry.regionIds : [];
  const requestedNames = Array.isArray(entry.regionNames) ? entry.regionNames : [];

  for (const regionId of requestedIds) {
    const region = regions.byId.get(regionId);
    if (region) {
      resolvedRegionIds.push(region.id);
    }
  }

  for (const regionName of requestedNames) {
    const region = regions.byCountryAndName.get(
      `${entry.countryCode}:${regionName.toLocaleLowerCase("en-US")}`,
    );
    if (region && !resolvedRegionIds.includes(region.id)) {
      resolvedRegionIds.push(region.id);
    }
  }

  return resolvedRegionIds;
}

function validateEntry(entry, countryCodes, regions, resolvedRegionIds) {
  if (!countryCodes.has(entry.countryCode)) {
    throw new Error(`Pays inconnu dans le dataset: ${entry.countryCode}.`);
  }

  if (entry.coverage === "selected_regions") {
    if (
      (!Array.isArray(entry.regionIds) || entry.regionIds.length === 0) &&
      (!Array.isArray(entry.regionNames) || entry.regionNames.length === 0)
    ) {
      throw new Error(`Aucune region definie pour ${entry.id}.`);
    }
    if (resolvedRegionIds.length === 0) {
      const requestedIds = Array.isArray(entry.regionIds) ? entry.regionIds.join(", ") : "";
      const requestedNames = Array.isArray(entry.regionNames)
        ? entry.regionNames.join(", ")
        : "";
      const requestedDetails = [requestedIds, requestedNames].filter(Boolean).join(" | ");
      throw new Error(
        `Aucune region resolue pour ${entry.id}. Verifiez les IDs ou noms de regions${
          requestedDetails ? ` (${requestedDetails})` : ""
        }.`,
      );
    }
  }

  if (typeof entry.imageUrl !== "string" || entry.imageUrl.trim().length === 0) {
    throw new Error(`Aucune image Wikimedia definie pour ${entry.id}.`);
  }
}

async function main() {
  await ensureOfficialRecords();
  const authorId = await resolveAuthorId();
  const [entries, countryCodes, regions, existingClues] = await Promise.all([
    loadDataset(),
    loadCountries(),
    loadRegions(),
    loadExistingClues(),
  ]);

  const summary = {
    dryRun: DRY_RUN,
    missingImagesOnly: MISSING_IMAGES_ONLY,
    geometasOnly: GEOMETAS_ONLY,
    total: entries.length,
    authorId,
    created: 0,
    updated: 0,
    imagesImported: 0,
    imagesSkipped: 0,
    failed: 0,
    failures: [],
  };

  for (const entry of entries) {
    try {
      const resolvedRegionIds = resolveRegionIds(entry, regions);
      validateEntry(entry, countryCodes, regions, resolvedRegionIds);
      const existing = existingClues.get(entry.id);
      const previousImages = existing?.clue_images ?? [];
      const previousImage = previousImages[0] ?? null;

      if (DRY_RUN) {
        if (existingClues.has(entry.id)) summary.updated += 1;
        else summary.created += 1;
        if (MISSING_IMAGES_ONLY && previousImage) summary.imagesSkipped += 1;
        else summary.imagesImported += 1;
        continue;
      }

      await upsertClue(entry, authorId);
      await replaceRegions(entry.id, resolvedRegionIds);
      if (MISSING_IMAGES_ONLY && previousImage) {
        summary.imagesSkipped += 1;
        summary.updated += 1;
        continue;
      }

      const uploadedImage = await uploadImage(entry, entry.id, previousImage);
      summary.imagesImported += 1;

      if (
        previousImage &&
        previousImage.storage_path !== uploadedImage.storagePath
      ) {
        const { error: removeObjectError } = await supabase.storage
          .from("clue-images")
          .remove([previousImage.storage_path]);
        if (removeObjectError) throw removeObjectError;
      }

      for (const staleImage of previousImages.slice(1)) {
        await deleteImage(staleImage);
      }

      if (existingClues.has(entry.id)) summary.updated += 1;
      else summary.created += 1;
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        clueId: entry.id,
        title: entry.title,
        message: formatError(error),
      });
    }
  }

  await mkdir(outputDir, { recursive: true });
  const summaryPath = path.join(outputDir, "official-plates-import-summary.json");
  await writeFile(summaryPath, JSON.stringify(summary, null, 2));

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Summary written to ${summaryPath}`);
}

await main();
