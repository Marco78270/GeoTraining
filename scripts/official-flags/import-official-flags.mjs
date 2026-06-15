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
const FLAGS_AUTHOR_ID = process.env.SUPABASE_FLAGS_AUTHOR_ID ?? null;

const FLAGS_COLLECTION_ID = "f0000000-0000-0000-0000-000000000001";
const FLAGS_CATEGORY_ID = "f1000000-0000-0000-0000-000000000001";
const DRY_RUN = process.argv.includes("--dry-run");

const SOURCE_NAME = "FlagCDN / Flagpedia";
const SOURCE_URL = "https://flagcdn.com/";
const LICENSE_NAME = "Public domain flags via Flagpedia";
const LICENSE_URL = "https://flagpedia.net/terms";
const MEDIUM_FLAG_COUNTRIES = new Set([
  "BA",
  "BD",
  "BE",
  "BG",
  "BO",
  "CM",
  "DO",
  "EC",
  "EE",
  "GA",
  "GH",
  "GT",
  "HN",
  "JO",
  "KE",
  "KG",
  "KW",
  "LB",
  "LT",
  "LU",
  "LV",
  "MD",
  "MG",
  "MK",
  "MM",
  "MN",
  "MU",
  "NP",
  "PA",
  "PY",
  "RS",
  "SI",
  "SK",
  "SV",
  "TZ",
  "UY",
  "ZW",
]);
const EXPERT_FLAG_COUNTRIES = new Set([
  "AD",
  "AG",
  "AM",
  "AZ",
  "BB",
  "BF",
  "BI",
  "BJ",
  "BN",
  "BT",
  "BW",
  "CF",
  "CG",
  "CI",
  "DJ",
  "ER",
  "FM",
  "GD",
  "GM",
  "GN",
  "GQ",
  "GW",
  "GY",
  "KM",
  "KN",
  "LC",
  "LI",
  "LS",
  "ML",
  "MR",
  "MW",
  "NA",
  "NE",
  "PG",
  "RW",
  "SC",
  "SL",
  "SM",
  "SN",
  "SR",
  "TD",
  "TG",
  "TL",
  "TM",
  "VC",
  "VU",
  "ZM",
]);

if (!SUPABASE_URL) {
  throw new Error("VITE_SUPABASE_URL est requis.");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY est requis pour l'import officiel.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function buildFlagUrl(countryCode) {
  return `https://flagcdn.com/w320/${countryCode.toLowerCase()}.png`;
}

function buildImagePath(clueId, imageId) {
  return `${FLAGS_COLLECTION_ID}/${clueId}/${imageId}.png`;
}

function getFlagDifficulty(countryCode) {
  if (EXPERT_FLAG_COUNTRIES.has(countryCode)) {
    return "expert";
  }
  if (MEDIUM_FLAG_COUNTRIES.has(countryCode)) {
    return "medium";
  }
  return "easy";
}

function clueTitle(countryName) {
  return `Drapeau - ${countryName}`;
}

function attributionText(countryName, countryCode) {
  return [
    `${countryName} (${countryCode}).`,
    "Image imported from FlagCDN / Flagpedia.",
    "Flagpedia states that flag images are in the public domain and that vector sources are based on Wikimedia Commons.",
  ].join(" ");
}

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
    const candidate = error;
    if ("message" in candidate && typeof candidate.message === "string") {
      const details =
        "details" in candidate && typeof candidate.details === "string"
          ? ` (${candidate.details})`
          : "";
      const hint =
        "hint" in candidate && typeof candidate.hint === "string"
          ? ` Hint: ${candidate.hint}`
          : "";
      const code =
        "code" in candidate && typeof candidate.code === "string"
          ? ` [${candidate.code}]`
          : "";
      return `${candidate.message}${details}${hint}${code}`;
    }
    try {
      return JSON.stringify(candidate);
    } catch {
      return String(candidate);
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

async function resolveAuthorId() {
  if (FLAGS_AUTHOR_ID) {
    return FLAGS_AUTHOR_ID;
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
      "Aucun profil trouvé pour attribuer les indices officiels. Créez au moins un utilisateur, ou définissez SUPABASE_FLAGS_AUTHOR_ID.",
    );
  }

  return data.id;
}

async function ensureOfficialRecords() {
  const { data: collection, error: collectionError } = await supabase
    .from("collections")
    .select("id")
    .eq("id", FLAGS_COLLECTION_ID)
    .single();
  if (collectionError || !collection) {
    throw new Error("Collection publique 'Collection officielle' introuvable.");
  }

  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id")
    .eq("id", FLAGS_CATEGORY_ID)
    .single();
  if (categoryError || !category) {
    throw new Error("Catégorie publique 'Drapeaux' introuvable.");
  }
}

async function loadCountries() {
  const { data, error } = await supabase
    .from("countries")
    .select("code, name")
    .order("name");
  if (error) throw error;
  return data;
}

async function loadExistingClues() {
  const { data, error } = await supabase
    .from("clues")
    .select("id, country_code, clue_images(id, storage_path)")
    .eq("collection_id", FLAGS_COLLECTION_ID)
    .eq("category_id", FLAGS_CATEGORY_ID);
  if (error) throw error;
  return new Map(data.map((clue) => [clue.country_code, clue]));
}

async function fetchFlag(countryCode) {
  const response = await fetch(buildFlagUrl(countryCode));
  if (!response.ok) {
    throw new Error(`Drapeau indisponible (${response.status}) pour ${countryCode}.`);
  }
  const contentType = response.headers.get("content-type") ?? "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType };
}

async function upsertClue(country, authorId) {
  const difficulty = getFlagDifficulty(country.code);
  const payload = {
    collection_id: FLAGS_COLLECTION_ID,
    category_id: FLAGS_CATEGORY_ID,
    country_code: country.code,
    coverage: "whole_country",
    difficulty,
    status: "published",
    title: clueTitle(country.name),
    characteristics: [`Drapeau national de ${country.name}`],
    notes: "Collection officielle publique des drapeaux des pays.",
    source_name: SOURCE_NAME,
    source_url: SOURCE_URL,
    license_name: LICENSE_NAME,
    license_url: LICENSE_URL,
    attribution_text: attributionText(country.name, country.code),
    author_id: authorId,
  };
  const legacyPayload = {
    collection_id: FLAGS_COLLECTION_ID,
    category_id: FLAGS_CATEGORY_ID,
    country_code: country.code,
    coverage: "whole_country",
    difficulty,
    status: "published",
    title: clueTitle(country.name),
    characteristics: [`Drapeau national de ${country.name}`],
    notes: "Collection officielle publique des drapeaux des pays.",
    author_id: authorId,
  };

  const { data: existing, error: existingError } = await supabase
    .from("clues")
    .select("id")
    .eq("collection_id", FLAGS_COLLECTION_ID)
    .eq("category_id", FLAGS_CATEGORY_ID)
    .eq("country_code", country.code)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const { error } = await supabase
      .from("clues")
      .update(payload)
      .eq("id", existing.id);
    if (error) {
      if (!isMissingClueSourceMetadata(error)) throw error;
      const { error: legacyError } = await supabase
        .from("clues")
        .update(legacyPayload)
        .eq("id", existing.id);
      if (legacyError) throw legacyError;
    }
    return existing.id;
  }

  const { data, error } = await supabase
    .from("clues")
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    if (!isMissingClueSourceMetadata(error)) throw error;
    const legacyResult = await supabase
      .from("clues")
      .insert(legacyPayload)
      .select("id")
      .single();
    if (legacyResult.error || !legacyResult.data) {
      throw (
        legacyResult.error ??
        new Error(`Impossible de creer l'indice pour ${country.code}.`)
      );
    }
    return legacyResult.data.id;
  }
  if (!data) {
    throw new Error(`Impossible de creer l'indice pour ${country.code}.`);
  }
  return data.id;
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

async function uploadImage(clueId, country, existingImage) {
  const imageId = existingImage?.id ?? crypto.randomUUID();
  const storagePath = buildImagePath(clueId, imageId);
  const { buffer, contentType } = await fetchFlag(country.code);

  const { error: uploadError } = await supabase.storage
    .from("clue-images")
    .upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { error: metadataError } = await supabase.from("clue_images").upsert({
    id: imageId,
    clue_id: clueId,
    storage_path: storagePath,
    alt_text: `Drapeau de ${country.name}`,
    sort_order: 0,
  });
  if (metadataError) throw metadataError;
}

async function main() {
  await ensureOfficialRecords();
  const authorId = await resolveAuthorId();
  const countries = await loadCountries();
  const existingClues = await loadExistingClues();

  const summary = {
    dryRun: DRY_RUN,
    total: countries.length,
    authorId,
    created: 0,
    updated: 0,
    failed: 0,
    failures: [],
  };

  for (const country of countries) {
    const existing = existingClues.get(country.code);

    if (DRY_RUN) {
      if (existing) summary.updated += 1;
      else summary.created += 1;
      continue;
    }

    try {
      const clueId = await upsertClue(country, authorId);
      const currentImages = existing?.clue_images ?? [];
      const primaryImage = currentImages[0] ?? null;
      for (const image of currentImages.slice(1)) {
        await deleteImage(image);
      }
      await uploadImage(clueId, country, primaryImage);
      if (existing) summary.updated += 1;
      else summary.created += 1;
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        countryCode: country.code,
        countryName: country.name,
        message: formatError(error),
      });
    }
  }

  await mkdir(outputDir, { recursive: true });
  const summaryPath = path.join(outputDir, "official-flags-import-summary.json");
  await writeFile(summaryPath, JSON.stringify(summary, null, 2));

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Summary written to ${summaryPath}`);
}

await main();
