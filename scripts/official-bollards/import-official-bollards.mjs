import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "../load-env.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const outputDir = path.join(repoRoot, "output");

loadLocalEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BOLLARDS_AUTHOR_ID = process.env.SUPABASE_BOLLARDS_AUTHOR_ID ?? null;

const BOLLARDS_COLLECTION_ID = "f0000000-0000-0000-0000-000000000001";
const BOLLARDS_CATEGORY_ID = "f1000000-0000-0000-0000-000000000002";
const BOLLARDS_CATEGORY_URL = "https://geometas.com/metas/categories/bollards/";
const SOURCE_NAME = "Geometas / OpenGuessr";
const SOURCE_URL = "https://geometas.com/metas/categories/bollards/";
const LICENSE_NAME = "Source credits listed on Geometas";
const LICENSE_URL = "https://geometas.com/metas/categories/bollards/";
const DRY_RUN = process.argv.includes("--dry-run");

const COUNTRY_ALIASES = new Map([
  ["United Kingdom (UK)", "United Kingdom"],
  ["Czech Republic", "Czechia"],
  ["Serbia", "Republic of Serbia"],
]);
const MEDIUM_BOLLARD_COUNTRIES = new Set([
  "AT",
  "BG",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "GB",
  "GR",
  "HR",
  "HU",
  "IT",
  "LT",
  "LV",
  "MX",
  "PL",
  "RS",
  "SE",
  "SI",
  "SK",
  "UY",
]);
const EXPERT_BOLLARD_COUNTRIES = new Set([
  "AL",
  "BD",
  "BT",
  "CH",
  "EC",
  "IS",
  "KH",
  "LK",
  "LU",
  "ME",
  "MK",
  "MY",
  "PE",
  "RU",
  "TH",
  "TR",
  "UA",
]);

const FETCH_RETRY_ATTEMPTS = 3;
const FETCH_RETRY_BASE_DELAY_MS = 1200;

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

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripTags(value) {
  return decodeHtml(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeCountryName(countryName) {
  const withoutFlag = countryName.replace(/^[^\p{L}\p{N}]+/u, "").trim();
  const aliased = COUNTRY_ALIASES.get(withoutFlag) ?? withoutFlag;
  return aliased.replace(/\s+/g, " ").trim();
}

function cleanGoogleMapsUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "goo.gl" && parsed.pathname.startsWith("/maps")) {
      return parsed.toString();
    }
    if (parsed.hostname === "maps.app.goo.gl") {
      return parsed.toString();
    }
    if (
      parsed.hostname.includes("google.") &&
      (parsed.pathname.includes("/maps") || parsed.hostname.includes("maps"))
    ) {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
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

  return { extension: "jpg", contentType: "image/jpeg" };
}

function buildImagePath(clueId, imageId, extension) {
  return `${BOLLARDS_COLLECTION_ID}/${clueId}/${imageId}.${extension}`;
}

function buildTitle(entry) {
  if (entry.variantCount === 1) {
    return `Bollard - ${entry.countryName}`;
  }
  return `Bollard - ${entry.countryName} - variante ${entry.variantIndex}`;
}

function getBollardDifficulty(countryCode) {
  if (EXPERT_BOLLARD_COUNTRIES.has(countryCode)) {
    return "expert";
  }
  if (MEDIUM_BOLLARD_COUNTRIES.has(countryCode)) {
    return "medium";
  }
  return "easy";
}

function buildCharacteristics(entry) {
  return [entry.description];
}

function buildNotes(entry) {
  return [
    "Collection officielle publique des bollards.",
    entry.googleMapsUrl
      ? "Lien Google Maps récupéré depuis la source Geometas."
      : "Aucun lien Google Maps exposé par la source Geometas pour cette fiche.",
  ].join(" ");
}

function attributionText(entry) {
  return [
    `${entry.countryName}.`,
    "Contenu importé depuis Geometas.",
    "La fiche source crédite notamment Plonk It et The Digital Labyrinth.",
  ].join(" ");
}

async function resolveAuthorId() {
  if (BOLLARDS_AUTHOR_ID) {
    return BOLLARDS_AUTHOR_ID;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Impossible de déterminer un auteur pour l'import officiel: ${formatError(error)}`,
    );
  }

  if (!data?.id) {
    throw new Error(
      "Aucun profil trouvé pour attribuer les indices officiels. Créez au moins un utilisateur, ou définissez SUPABASE_BOLLARDS_AUTHOR_ID.",
    );
  }

  return data.id;
}

async function ensureOfficialRecords() {
  const { data: collection, error: collectionError } = await supabase
    .from("collections")
    .select("id")
    .eq("id", BOLLARDS_COLLECTION_ID)
    .single();
  if (collectionError || !collection) {
    throw new Error("Collection publique 'Collection officielle' introuvable.");
  }

  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id")
    .eq("id", BOLLARDS_CATEGORY_ID)
    .single();
  if (categoryError || !category) {
    throw new Error("Catégorie publique 'Bollards' introuvable.");
  }
}

async function loadCountries() {
  const { data, error } = await supabase
    .from("countries")
    .select("code, name")
    .order("name");
  if (error) throw error;
  return new Map(
    data.map((country) => [country.name.toLocaleLowerCase("en-US"), country]),
  );
}

async function loadExistingClues() {
  const { data, error } = await supabase
    .from("clues")
    .select("id, clue_images(id, storage_path)")
    .eq("collection_id", BOLLARDS_COLLECTION_ID)
    .eq("category_id", BOLLARDS_CATEGORY_ID);
  if (error) throw error;
  return new Map(data.map((clue) => [clue.id, clue]));
}

async function fetchHtml(url) {
  const response = await fetchWithRetry(url);
  return response.text();
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
        throw new Error(`Impossible de charger ${url} (${response.status}).`);
      }

      lastError = new Error(`Tentative ${attempt}/${FETCH_RETRY_ATTEMPTS} en échec (${response.status}) pour ${url}.`);
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

function parseCategoryEntries(html) {
  const blocks = html.split('<div class="py-6 -mx-4 px-4 sm:-mx-8 sm:px-8">');
  const entries = [];

  for (const block of blocks) {
    const detailMatch = block.match(/href="(\/metas\/detail\/([a-f0-9-]+)\/)"/i);
    const imageMatch = block.match(/<img src="([^"]+)"/i);
    const descriptionMatch = block.match(
      /<a href="\/metas\/detail\/[a-f0-9-]+\/">([\s\S]*?)<\/a>/i,
    );
    const countryMatch = block.match(
      /<span[^>]*>([\s\S]*?)<\/span>/i,
    );

    if (!detailMatch || !imageMatch || !descriptionMatch || !countryMatch) {
      continue;
    }

    const countryName = normalizeCountryName(stripTags(countryMatch[1]));
    if (!countryName) continue;

    entries.push({
      clueId: detailMatch[2],
      detailUrl: new URL(detailMatch[1], "https://geometas.com").toString(),
      imageUrl: imageMatch[1],
      description: stripTags(descriptionMatch[1]),
      countryName,
    });
  }

  const counts = new Map();
  for (const entry of entries) {
    counts.set(entry.countryName, (counts.get(entry.countryName) ?? 0) + 1);
  }

  const seen = new Map();
  return entries.map((entry) => {
    const variantIndex = (seen.get(entry.countryName) ?? 0) + 1;
    seen.set(entry.countryName, variantIndex);
    return {
      ...entry,
      variantIndex,
      variantCount: counts.get(entry.countryName) ?? 1,
    };
  });
}

async function enrichEntry(entry) {
  const html = await fetchHtml(entry.detailUrl);
  const ogImageMatch = html.match(
    /<meta property="og:image" content="([^"]+)"/i,
  );
  const googleMapsMatch = html.match(
    /href="(https?:\/\/(?:www\.)?(?:goo\.gl\/maps\/[^"]+|maps\.app\.goo\.gl[^"]+|maps\.google\.[^"\/]+[^"]*|www\.google\.[^"\/]+\/maps[^"]*))"/i,
  );
  const streetViewMatch = html.match(
    /src="(https:\/\/www\.google\.com\/maps\/embed\/v1\/streetview[^"]+)"/i,
  );

  return {
    ...entry,
    imageUrl: ogImageMatch?.[1] ?? entry.imageUrl,
    googleMapsUrl: cleanGoogleMapsUrl(
      googleMapsMatch?.[1] ?? streetViewMatch?.[1] ?? null,
    ),
  };
}

function resolveCountryCode(countryByName, countryName) {
  const country = countryByName.get(countryName.toLocaleLowerCase("en-US"));
  if (!country) {
    throw new Error(`Pays introuvable dans la base: ${countryName}.`);
  }
  return country.code;
}

async function fetchImage(url) {
  const response = await fetchWithRetry(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const detected = sniffImageFormat(buffer);
  return {
    buffer,
    contentType: detected.contentType,
    extension: detected.extension,
  };
}

async function upsertClue(entry, authorId, countryCode) {
  const difficulty = getBollardDifficulty(countryCode);
  const payload = {
    id: entry.clueId,
    collection_id: BOLLARDS_COLLECTION_ID,
    category_id: BOLLARDS_CATEGORY_ID,
    country_code: countryCode,
    coverage: "whole_country",
    difficulty,
    status: "published",
    title: buildTitle(entry),
    characteristics: buildCharacteristics(entry),
    notes: buildNotes(entry),
    google_maps_url: entry.googleMapsUrl,
    source_name: SOURCE_NAME,
    source_url: entry.detailUrl,
    license_name: LICENSE_NAME,
    license_url: LICENSE_URL,
    attribution_text: attributionText(entry),
    author_id: authorId,
  };

  const legacyPayload = {
    id: entry.clueId,
    collection_id: BOLLARDS_COLLECTION_ID,
    category_id: BOLLARDS_CATEGORY_ID,
    country_code: countryCode,
    coverage: "whole_country",
    difficulty,
    status: "published",
    title: buildTitle(entry),
    characteristics: buildCharacteristics(entry),
    notes: buildNotes(entry),
    google_maps_url: entry.googleMapsUrl,
    author_id: authorId,
  };

  const { error } = await supabase.from("clues").upsert(payload);
  if (error) {
    if (!isMissingClueSourceMetadata(error)) throw error;
    const { error: legacyError } = await supabase.from("clues").upsert(legacyPayload);
    if (legacyError) throw legacyError;
  }

  return entry.clueId;
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

async function syncImage(clueId, entry, existingClue) {
  for (const image of existingClue?.clue_images ?? []) {
    await deleteImage(image);
  }

  const imageId = crypto.randomUUID();
  const { buffer, contentType, extension } = await fetchImage(entry.imageUrl);
  const storagePath = buildImagePath(clueId, imageId, extension);

  const { error: uploadError } = await supabase.storage
    .from("clue-images")
    .upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { error: metadataError } = await supabase.from("clue_images").insert({
    id: imageId,
    clue_id: clueId,
    storage_path: storagePath,
    alt_text: buildTitle(entry),
    sort_order: 0,
  });
  if (metadataError) throw metadataError;
}

async function scrapeEntries() {
  const categoryHtml = await fetchHtml(BOLLARDS_CATEGORY_URL);
  const entries = parseCategoryEntries(categoryHtml);
  const enrichedEntries = [];

  for (const entry of entries) {
    enrichedEntries.push(await enrichEntry(entry));
  }

  return enrichedEntries;
}

async function main() {
  await ensureOfficialRecords();
  const authorId = await resolveAuthorId();
  const countryByName = await loadCountries();
  const existingClues = await loadExistingClues();
  const entries = await scrapeEntries();

  const summary = {
    dryRun: DRY_RUN,
    total: entries.length,
    authorId,
    created: 0,
    updated: 0,
    failed: 0,
    googleMapsFound: 0,
    googleMapsMissing: 0,
    failures: [],
  };

  for (const entry of entries) {
    const existing = existingClues.get(entry.clueId);

    if (entry.googleMapsUrl) summary.googleMapsFound += 1;
    else summary.googleMapsMissing += 1;

    if (DRY_RUN) {
      if (existing) summary.updated += 1;
      else summary.created += 1;
      continue;
    }

    try {
      const countryCode = resolveCountryCode(countryByName, entry.countryName);
      const clueId = await upsertClue(entry, authorId, countryCode);
      await syncImage(clueId, entry, existing);
      if (existing) summary.updated += 1;
      else summary.created += 1;
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        clueId: entry.clueId,
        countryName: entry.countryName,
        detailUrl: entry.detailUrl,
        message: formatError(error),
      });
    }
  }

  await mkdir(outputDir, { recursive: true });
  const summaryPath = path.join(outputDir, "official-bollards-import-summary.json");
  await writeFile(summaryPath, JSON.stringify(summary, null, 2));

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Summary written to ${summaryPath}`);
}

await main();
