import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const OFFICIAL_COLLECTION_ID =
  "f0000000-0000-0000-0000-000000000001";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const POSTGRES_UUID_PATTERN =
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
const DIFFICULTIES = new Set(["easy", "medium", "expert"]);
const RETRYABLE_STATUSES = new Set([408, 425, 429]);
const IMPORT_USER_AGENT =
  "GeoTrainerAtlas/1.0 (https://github.com/Marco78270/GeoTraining)";

export function validateEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("Chaque entree doit etre un objet.");
  }

  const requiredStrings = [
    "id",
    "countryCode",
    "title",
    "notes",
    "sourceName",
    "sourceUrl",
    "licenseName",
    "licenseUrl",
    "attributionText",
    "imageUrl",
    "imageAltText",
  ];

  for (const field of requiredStrings) {
    if (typeof entry[field] !== "string" || !entry[field].trim()) {
      throw new Error(`${field} est requis.`);
    }
  }

  if (!UUID_PATTERN.test(entry.id)) {
    throw new Error("id doit etre un UUID valide.");
  }
  if (!/^[A-Z]{2}$/u.test(entry.countryCode)) {
    throw new Error("countryCode doit etre un code ISO alpha-2.");
  }
  if (!DIFFICULTIES.has(entry.difficulty)) {
    throw new Error("difficulty doit etre easy, medium ou expert.");
  }
  if (
    !Array.isArray(entry.characteristics) ||
    entry.characteristics.length === 0 ||
    entry.characteristics.some(
      (value) => typeof value !== "string" || !value.trim(),
    )
  ) {
    throw new Error(
      "characteristics doit contenir au moins une valeur non vide.",
    );
  }

  const regionIds = entry.regionIds ?? [];
  if (
    !Array.isArray(regionIds) ||
    regionIds.some((id) => typeof id !== "string" || !id.trim())
  ) {
    throw new Error(
      "regionIds doit etre une liste d'identifiants non vides.",
    );
  }

  for (const field of ["sourceUrl", "licenseUrl", "imageUrl"]) {
    try {
      new URL(entry[field]);
    } catch {
      throw new Error(`${field} doit etre une URL HTTP(S) valide.`);
    }
    if (!/^https?:/iu.test(entry[field])) {
      throw new Error(`${field} doit etre une URL HTTP(S) valide.`);
    }
  }

  return {
    ...entry,
    id: entry.id.trim(),
    countryCode: entry.countryCode.trim(),
    characteristics: entry.characteristics.map((value) => value.trim()),
    regionIds: [...new Set(regionIds.map((id) => id.trim()))],
    coverage:
      regionIds.length > 0 ? "selected_regions" : "whole_country",
  };
}

export function validateDataset(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("Le dataset doit contenir au moins une entree.");
  }

  const validated = entries.map(validateEntry);
  const ids = new Set();
  for (const entry of validated) {
    if (ids.has(entry.id)) {
      throw new Error(`UUID duplique: ${entry.id}.`);
    }
    ids.add(entry.id);
  }
  return validated;
}

export function buildCluePayload(
  entry,
  categoryId,
  authorId,
  status = "published",
) {
  if (!POSTGRES_UUID_PATTERN.test(categoryId)) {
    throw new Error("category.id doit etre un UUID valide.");
  }
  if (!UUID_PATTERN.test(authorId)) {
    throw new Error("authorId doit etre un UUID valide.");
  }
  if (!["draft", "published"].includes(status)) {
    throw new Error("status doit etre draft ou published.");
  }

  return {
    id: entry.id,
    collection_id: OFFICIAL_COLLECTION_ID,
    category_id: categoryId,
    country_code: entry.countryCode,
    coverage: entry.coverage,
    difficulty: entry.difficulty,
    status,
    title: entry.title.trim(),
    characteristics: entry.characteristics,
    notes: entry.notes.trim(),
    source_name: entry.sourceName.trim(),
    source_url: entry.sourceUrl.trim(),
    license_name: entry.licenseName.trim(),
    license_url: entry.licenseUrl.trim(),
    attribution_text: entry.attributionText.trim(),
    author_id: authorId,
  };
}

export function sniffImageFormat(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("Le contenu image doit etre un Buffer.");
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
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
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { extension: "webp", contentType: "image/webp" };
  }

  const textPrefix = buffer
    .subarray(0, Math.min(buffer.length, 512))
    .toString("utf8")
    .replace(/^\uFEFF/u, "")
    .trimStart();
  if (
    textPrefix.startsWith("<svg") ||
    /^<\?xml[\s\S]*?<svg(?:\s|>)/iu.test(textPrefix)
  ) {
    return { extension: "svg", contentType: "image/svg+xml" };
  }

  throw new Error("Format d'image non supporte.");
}

export function buildDownloadUrl(url) {
  const parsed = new URL(url);
  if (
    parsed.hostname === "commons.wikimedia.org" &&
    parsed.pathname.includes("/wiki/Special:FilePath/")
  ) {
    parsed.searchParams.set("width", "1200");
  }
  return parsed.toString();
}

export function buildImagePath(collectionId, clueId, imageId, extension) {
  return `${collectionId}/${clueId}/${imageId}.${extension}`;
}

export async function fetchImage(
  url,
  fetchImpl = fetch,
  {
    attempts = 6,
    baseDelayMs = 3000,
    requestSpacingMs = 1500,
    sleepImpl = sleep,
  } = {},
) {
  await sleepImpl(requestSpacingMs);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(buildDownloadUrl(url), {
        headers: {
          Accept: "image/webp,image/png,image/jpeg,image/svg+xml",
          "User-Agent": IMPORT_USER_AGENT,
        },
      });
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await sleepImpl(baseDelayMs * 2 ** (attempt - 1));
      continue;
    }

    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      return { buffer, ...sniffImageFormat(buffer) };
    }

    const retryable =
      RETRYABLE_STATUSES.has(response.status) || response.status >= 500;
    if (!retryable || attempt === attempts) {
      throw new Error(`Image indisponible (${response.status}) pour ${url}.`);
    }

    lastError = new Error(
      `Tentative ${attempt}/${attempts} en echec (${response.status}) pour ${url}.`,
    );
    await sleepImpl(baseDelayMs * 2 ** (attempt - 1));
  }

  throw lastError ?? new Error(`Impossible de charger ${url}.`);
}

export async function runOfficialImport({
  category,
  datasetPath,
  summaryFileName,
  authorEnvName,
  dryRun = false,
  missingImagesOnly = false,
  supabase,
  authorId = process.env[authorEnvName],
  outputDir = defaultOutputDir(),
  fetchImpl = fetch,
  requestSpacingMs = 1500,
  retryBaseDelayMs = 3000,
}) {
  if (!supabase) {
    throw new Error("Le client Supabase est requis.");
  }
  if (
    !category ||
    !POSTGRES_UUID_PATTERN.test(category.id) ||
    !category.name?.trim()
  ) {
    throw new Error("La categorie officielle est invalide.");
  }
  if (!authorEnvName?.trim()) {
    throw new Error("authorEnvName est requis.");
  }
  if (!authorId || !UUID_PATTERN.test(authorId)) {
    throw new Error(`${authorEnvName} doit contenir un UUID valide.`);
  }

  const entries = validateDataset(
    JSON.parse(await readFile(fileURLToPathIfNeeded(datasetPath), "utf8")),
  );
  await ensureOfficialRecords(supabase, category);
  const summary = {
    dryRun,
    missingImagesOnly,
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
      await resolveGeography(supabase, entry);
      const existing = await loadExistingClue(supabase, entry.id);
      const primaryImage = findPrimaryImage(existing?.clue_images);

      if (missingImagesOnly && primaryImage) {
        if (existing) summary.updated += 1;
        else summary.created += 1;
        summary.imagesSkipped += 1;
        continue;
      }

      const image = await fetchImage(entry.imageUrl, fetchImpl, {
        baseDelayMs: retryBaseDelayMs,
        requestSpacingMs,
      });
      assertImportableImage(image);

      if (dryRun) {
        if (existing) summary.updated += 1;
        else summary.created += 1;
        summary.imagesImported += 1;
        continue;
      }

      const draftPayload = buildCluePayload(
        entry,
        category.id,
        authorId,
        "draft",
      );
      await expectNoError(
        supabase.from("clues").upsert(draftPayload),
        "upsert du brouillon",
      );
      await replaceRegions(supabase, entry.id, entry.regionIds);

      const storagePath = buildImagePath(
        OFFICIAL_COLLECTION_ID,
        entry.id,
        entry.id,
        image.extension,
      );
      const uploadResult = await supabase.storage
        .from("clue-images")
        .upload(storagePath, image.buffer, {
          contentType: image.contentType,
          upsert: true,
        });
      if (uploadResult.error) {
        throw new Error(`Echec upload image: ${formatError(uploadResult.error)}`);
      }

      try {
        await expectNoError(
          supabase.from("clue_images").upsert(
            {
              id: entry.id,
              clue_id: entry.id,
              storage_path: storagePath,
              alt_text: entry.imageAltText.trim(),
              sort_order: 0,
            },
            { onConflict: "clue_id,sort_order" },
          ),
          "upsert des metadonnees image",
        );
      } catch (error) {
        const cleanupResult = await supabase.storage
          .from("clue-images")
          .remove([storagePath]);
        if (cleanupResult.error) {
          throw new Error(
            `${formatError(error)}; nettoyage de l'image impossible: ${formatError(cleanupResult.error)}`,
          );
        }
        throw error;
      }
      await deleteAdditionalImages(supabase, entry.id);
      await removeReplacedStorageObject(
        supabase,
        primaryImage?.storage_path,
        storagePath,
      );

      await expectNoError(
        supabase
          .from("clues")
          .update({ status: "published" })
          .eq("id", entry.id),
        "publication de l'indice",
      );

      if (existing) summary.updated += 1;
      else summary.created += 1;
      summary.imagesImported += 1;
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        clueId: entry.id,
        countryCode: entry.countryCode,
        title: entry.title,
        message: formatError(error),
      });
    }
  }

  await mkdir(outputDir, { recursive: true });
  const summaryPath = path.join(outputDir, summaryFileName);
  await writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  return summary;
}

async function ensureOfficialRecords(supabase, category) {
  const collectionResult = await supabase
    .from("collections")
    .select("id")
    .eq("id", OFFICIAL_COLLECTION_ID)
    .maybeSingle();
  if (collectionResult.error) {
    throw new Error(
      `Lecture de la collection officielle impossible: ${formatError(collectionResult.error)}`,
    );
  }
  if (collectionResult.data?.id !== OFFICIAL_COLLECTION_ID) {
    throw new Error("Collection officielle introuvable.");
  }

  const categoryResult = await supabase
    .from("categories")
    .select("id")
    .eq("id", category.id)
    .maybeSingle();
  if (categoryResult.error) {
    throw new Error(
      `Lecture de la categorie officielle impossible: ${formatError(categoryResult.error)}`,
    );
  }
  if (categoryResult.data?.id !== category.id) {
    throw new Error(`Categorie officielle introuvable: ${category.name}.`);
  }
}

async function resolveGeography(supabase, entry) {
  const countryResult = await supabase
    .from("countries")
    .select("code")
    .eq("code", entry.countryCode)
    .maybeSingle();
  if (countryResult.error) {
    throw new Error(`Lecture du pays impossible: ${formatError(countryResult.error)}`);
  }
  if (countryResult.data?.code !== entry.countryCode) {
    throw new Error(`Pays introuvable: ${entry.countryCode}.`);
  }

  if (entry.regionIds.length === 0) return;
  const regionResult = await supabase
    .from("regions")
    .select("id, country_code")
    .in("id", entry.regionIds);
  if (regionResult.error) {
    throw new Error(
      `Lecture des regions impossible: ${formatError(regionResult.error)}`,
    );
  }
  const returned = new Set((regionResult.data ?? []).map((region) => region.id));
  const missing = entry.regionIds.filter((id) => !returned.has(id));
  if (returned.size !== entry.regionIds.length || missing.length > 0) {
    throw new Error(`Regions introuvables: ${missing.join(", ") || "inconnues"}.`);
  }
  const wrongCountry = (regionResult.data ?? []).filter(
    (region) => region.country_code !== entry.countryCode,
  );
  if (wrongCountry.length > 0) {
    throw new Error(
      `Regions hors du pays ${entry.countryCode}: ${wrongCountry
        .map((region) => region.id)
        .join(", ")}.`,
    );
  }
}

async function loadExistingClue(supabase, clueId) {
  const result = await supabase
    .from("clues")
    .select("id, clue_images(id, storage_path, sort_order)")
    .eq("id", clueId)
    .maybeSingle();
  if (result.error) {
    throw new Error(`Lecture de l'indice impossible: ${formatError(result.error)}`);
  }
  return result.data;
}

async function replaceRegions(supabase, clueId, regionIds) {
  await expectNoError(
    supabase.from("clue_regions").delete().eq("clue_id", clueId),
    "suppression des regions",
  );
  if (regionIds.length === 0) return;
  await expectNoError(
    supabase.from("clue_regions").insert(
      regionIds.map((regionId) => ({
        clue_id: clueId,
        region_id: regionId,
      })),
    ),
    "insertion des regions",
  );
}

async function deleteAdditionalImages(supabase, clueId) {
  await expectNoError(
    supabase
      .from("clue_images")
      .delete()
      .eq("clue_id", clueId)
      .neq("sort_order", 0),
    "suppression des images additionnelles",
  );
}

async function removeReplacedStorageObject(supabase, previousPath, nextPath) {
  if (!previousPath || previousPath === nextPath) return;
  const result = await supabase.storage
    .from("clue-images")
    .remove([previousPath]);
  if (result.error) {
    throw new Error(
      `Suppression de l'ancienne image impossible: ${formatError(result.error)}`,
    );
  }
}

function findPrimaryImage(images) {
  if (!Array.isArray(images)) return null;
  return images.find((image) => image.sort_order === 0) ?? null;
}

function assertImportableImage(image) {
  if (image.extension === "svg" || image.contentType === "image/svg+xml") {
    throw new Error(
      "Le format SVG est reconnu mais non supporte par le bucket clue-images; utilisez JPEG, PNG ou WebP.",
    );
  }
}

async function expectNoError(query, operation) {
  const result = await query;
  if (result.error) {
    throw new Error(`${operation}: ${formatError(result.error)}`);
  }
  return result.data;
}

function fileURLToPathIfNeeded(value) {
  return value instanceof URL ? fileURLToPath(value) : value;
}

function defaultOutputDir() {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, "..", "..", "output");
}

function formatError(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message =
      "message" in error && typeof error.message === "string"
        ? error.message
        : JSON.stringify(error);
    const code =
      "code" in error && typeof error.code === "string"
        ? ` [${error.code}]`
        : "";
    return `${message}${code}`;
  }
  return "Erreur inconnue.";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
