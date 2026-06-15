import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
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
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const DEFAULT_ALLOWED_IMAGE_HOSTS = new Set([
  "commons.wikimedia.org",
  "upload.wikimedia.org",
]);

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
  validateRemoteImageUrl(entry.imageUrl);

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

export function buildImageId(clueId, buffer) {
  const digest = createHash("sha256")
    .update(clueId)
    .update("\0")
    .update(buffer)
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export function validateRemoteImageUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") {
    throw new Error("imageUrl doit utiliser HTTPS.");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "host.docker.internal" ||
    hostname === "gateway.docker.internal" ||
    isPrivateIpAddress(hostname)
  ) {
    throw new Error(`Adresse image interdite: ${hostname}.`);
  }
  return parsed;
}

export async function fetchImage(
  url,
  fetchImpl = fetch,
  {
    attempts = 6,
    baseDelayMs = 3000,
    requestSpacingMs = 1500,
    timeoutMs = 30000,
    allowedImageHosts = DEFAULT_ALLOWED_IMAGE_HOSTS,
    lookupImpl = dnsLookup,
    sleepImpl = sleep,
  } = {},
) {
  await sleepImpl(requestSpacingMs);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const fetched = await fetchFollowingSafeRedirects(
        buildDownloadUrl(url),
        fetchImpl,
        timeoutMs,
        allowedImageHosts,
        lookupImpl,
      );
      try {
        const { response } = fetched;
        if (!response.ok) {
          await releaseResponseBody(response);
          const retryable =
            RETRYABLE_STATUSES.has(response.status) || response.status >= 500;
          if (!retryable || attempt === attempts) {
            throw new PermanentFetchError(
              `Image indisponible (${response.status}) pour ${url}.`,
            );
          }
          lastError = new Error(
            `Tentative ${attempt}/${attempts} en echec (${response.status}) pour ${url}.`,
          );
          await sleepImpl(baseDelayMs * 2 ** (attempt - 1));
          continue;
        }

        const declaredLength = Number(response.headers.get("content-length"));
        if (
          Number.isFinite(declaredLength) &&
          declaredLength > MAX_IMAGE_BYTES
        ) {
          await releaseResponseBody(response);
          throw new PermanentFetchError(
            "Image refusee: taille superieure a 10 MiB.",
          );
        }
        const buffer = await readResponseBuffer(response);
        return { buffer, ...sniffImageFormat(buffer) };
      } finally {
        fetched.finish();
      }
    } catch (error) {
      if (error instanceof PermanentFetchError) throw error;
      lastError = error;
      if (attempt === attempts) break;
      await sleepImpl(baseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw lastError ?? new Error(`Impossible de charger ${url}.`);
}

async function fetchFollowingSafeRedirects(
  url,
  fetchImpl,
  timeoutMs,
  allowedImageHosts,
  lookupImpl,
) {
  let currentUrl = await validateResolvedImageUrl(
    url,
    allowedImageHosts,
    lookupImpl,
  );
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`Image download timeout after ${timeoutMs}ms.`)),
      timeoutMs,
    );
    let response;
    try {
      response = await fetchImpl(currentUrl.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "image/webp,image/png,image/jpeg,image/svg+xml",
          "User-Agent": IMPORT_USER_AGENT,
        },
      });
    } catch (error) {
      clearTimeout(timer);
      throw error;
    }
    if (response.status < 300 || response.status >= 400) {
      return {
        response,
        finish: () => clearTimeout(timer),
      };
    }
    clearTimeout(timer);
    await releaseResponseBody(response);
    const location = response.headers.get("location");
    if (!location) {
      throw new PermanentFetchError("Redirection image sans en-tete Location.");
    }
    currentUrl = await validateResolvedImageUrl(
      new URL(location, currentUrl).toString(),
      allowedImageHosts,
      lookupImpl,
    );
  }
  throw new PermanentFetchError("Trop de redirections pour l'image.");
}

async function releaseResponseBody(response) {
  if (!response.body) return;
  try {
    await response.body.cancel();
    return;
  } catch {
    // Some response mocks/implementations cannot cancel an already-consumed body.
  }
  try {
    await response.arrayBuffer();
  } catch {
    // Releasing the connection is best effort; preserve the original HTTP error.
  }
}

async function validateResolvedImageUrl(
  value,
  allowedImageHosts,
  lookupImpl,
) {
  const parsed = validateRemoteImageUrl(value);
  const allowedHosts = new Set(
    [...allowedImageHosts].map((hostname) => hostname.toLowerCase()),
  );
  if (!allowedHosts.has(parsed.hostname.toLowerCase())) {
    throw new PermanentFetchError(
      `Hote image non autorise: ${parsed.hostname}.`,
    );
  }

  // fetch cannot pin a resolved IP. The trusted-domain allowlist is the
  // rebinding barrier; resolving every hop is defense in depth.
  const addresses = await lookupImpl(parsed.hostname, {
    all: true,
    verbatim: true,
  });
  if (
    !Array.isArray(addresses) ||
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateIpAddress(address))
  ) {
    throw new PermanentFetchError(
      `Resolution DNS interdite pour ${parsed.hostname}.`,
    );
  }
  return parsed;
}

async function readResponseBuffer(response) {
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new PermanentFetchError(
        "Image refusee: taille superieure a 10 MiB.",
      );
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel("image too large");
        throw new PermanentFetchError(
          "Image refusee: taille superieure a 10 MiB.",
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
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
  allowedImageHosts = DEFAULT_ALLOWED_IMAGE_HOSTS,
  lookupImpl = dnsLookup,
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
  const normalizedAuthorId =
    typeof authorId === "string" ? authorId.trim() : authorId ?? null;
  if (!dryRun && (!normalizedAuthorId || !UUID_PATTERN.test(normalizedAuthorId))) {
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
    authorId: normalizedAuthorId,
    created: 0,
    updated: 0,
    imagesImported: 0,
    imagesSkipped: 0,
    failed: 0,
    failures: [],
    warnings: [],
  };

  for (const entry of entries) {
    let snapshot = null;
    let mutationStarted = false;
    let uploadedPath = null;
    try {
      await resolveGeography(supabase, entry);
      snapshot = await loadExistingSnapshot(supabase, entry.id);
      const primaryImage = findPrimaryImage(snapshot?.images);

      if (missingImagesOnly && primaryImage) {
        if (snapshot) summary.updated += 1;
        else summary.created += 1;
        summary.imagesSkipped += 1;
        continue;
      }

      const image = await fetchImage(entry.imageUrl, fetchImpl, {
        baseDelayMs: retryBaseDelayMs,
        requestSpacingMs,
        allowedImageHosts,
        lookupImpl,
      });
      assertImportableImage(image);

      if (dryRun) {
        if (snapshot) summary.updated += 1;
        else summary.created += 1;
        summary.imagesImported += 1;
        continue;
      }

      const imageId = buildImageId(entry.id, image.buffer);
      const draftPayload = buildCluePayload(
        entry,
        category.id,
        normalizedAuthorId,
        "draft",
      );
      mutationStarted = true;
      if (snapshot) {
        await expectNoError(
          supabase.from("clues").update({ status: "draft" }).eq("id", entry.id),
          "passage en brouillon",
        );
        await expectNoError(
          supabase.from("clue_regions").delete().eq("clue_id", entry.id),
          "suppression des anciennes regions",
        );
      }
      await expectNoError(
        supabase.from("clues").upsert(draftPayload),
        "upsert du brouillon",
      );
      await replaceRegions(supabase, entry.id, entry.regionIds);

      const storagePath = buildImagePath(
        OFFICIAL_COLLECTION_ID,
        entry.id,
        imageId,
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
      uploadedPath = storagePath;

      await expectNoError(
        supabase.from("clue_images").upsert(
          {
            id: imageId,
            clue_id: entry.id,
            storage_path: storagePath,
            alt_text: entry.imageAltText.trim(),
            sort_order: 0,
          },
          { onConflict: "clue_id,sort_order" },
        ),
        "upsert des metadonnees image",
      );

      await expectNoError(
        supabase
          .from("clues")
          .update({ status: "published" })
          .eq("id", entry.id),
        "publication de l'indice",
      );

      if (snapshot) summary.updated += 1;
      else summary.created += 1;
      summary.imagesImported += 1;
      await cleanupAfterPublication({
        supabase,
        entry,
        snapshot,
        currentPath: storagePath,
        warnings: summary.warnings,
      });
    } catch (error) {
      let finalError = error;
      if (mutationStarted) {
        try {
          await rollbackImport({
            supabase,
            clueId: entry.id,
            snapshot,
            uploadedPath,
          });
        } catch (rollbackError) {
          finalError = new Error(
            `${formatError(error)}; restauration impossible: ${formatError(rollbackError)}`,
          );
        }
      }
      summary.failed += 1;
      summary.failures.push({
        clueId: entry.id,
        countryCode: entry.countryCode,
        title: entry.title,
        message: formatError(finalError),
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

async function loadExistingSnapshot(supabase, clueId) {
  const result = await supabase
    .from("clues")
    .select(
      "id, collection_id, category_id, country_code, coverage, difficulty, status, title, characteristics, notes, source_name, source_url, license_name, license_url, attribution_text, author_id, clue_images(id, clue_id, storage_path, alt_text, sort_order)",
    )
    .eq("id", clueId)
    .maybeSingle();
  if (result.error) {
    throw new Error(`Lecture de l'indice impossible: ${formatError(result.error)}`);
  }
  if (!result.data) return null;
  const { clue_images: images = [], ...clue } = result.data;
  const regionResult = await supabase
    .from("clue_regions")
    .select("region_id")
    .eq("clue_id", clueId);
  if (regionResult.error) {
    throw new Error(
      `Lecture des regions existantes impossible: ${formatError(regionResult.error)}`,
    );
  }
  return {
    clue: structuredClone(clue),
    regionIds: (regionResult.data ?? []).map((row) => row.region_id),
    images: structuredClone(images),
  };
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

function findPrimaryImage(images) {
  if (!Array.isArray(images)) return null;
  return images.find((image) => image.sort_order === 0) ?? null;
}

async function rollbackImport({
  supabase,
  clueId,
  snapshot,
  uploadedPath,
}) {
  const rollbackErrors = [];
  const previousPaths = new Set(
    snapshot?.images.map((image) => image.storage_path) ?? [],
  );
  if (snapshot) {
    const originalStatus = snapshot.clue.status;
    let criticalRestoreSucceeded = true;
    await collectRollbackError(rollbackErrors, async () => {
      await expectNoError(
        supabase.from("clue_regions").delete().eq("clue_id", clueId),
        "suppression des regions temporaires",
      );
    }, () => {
      criticalRestoreSucceeded = false;
    });
    await collectRollbackError(rollbackErrors, async () => {
      const {
        id: _id,
        status: _status,
        ...originalClueFields
      } = snapshot.clue;
      await expectNoError(
        supabase
          .from("clues")
          .update({ ...originalClueFields, status: "draft" })
          .eq("id", clueId),
        "restauration de l'indice en brouillon",
      );
    }, () => {
      criticalRestoreSucceeded = false;
    });
    await collectRollbackError(rollbackErrors, async () => {
      if (snapshot.regionIds.length > 0) {
        await expectNoError(
          supabase.from("clue_regions").insert(
            snapshot.regionIds.map((regionId) => ({
              clue_id: clueId,
              region_id: regionId,
            })),
          ),
          "restauration des regions",
        );
      }
    }, () => {
      criticalRestoreSucceeded = false;
    });
    await collectRollbackError(rollbackErrors, async () => {
      await expectNoError(
        supabase.from("clue_images").delete().eq("clue_id", clueId),
        "suppression des metadonnees image temporaires",
      );
      if (snapshot.images.length > 0) {
        await expectNoError(
          supabase.from("clue_images").insert(snapshot.images),
          "restauration des metadonnees image",
        );
      }
    }, () => {
      criticalRestoreSucceeded = false;
    });
    if (uploadedPath && !previousPaths.has(uploadedPath)) {
      await collectRollbackError(rollbackErrors, async () => {
        const result = await supabase.storage
          .from("clue-images")
          .remove([uploadedPath]);
        if (result.error) throw result.error;
      }, () => {
        criticalRestoreSucceeded = false;
      });
    }
    if (criticalRestoreSucceeded) {
      await collectRollbackError(rollbackErrors, async () => {
        await expectNoError(
          supabase
            .from("clues")
            .update({ status: originalStatus })
            .eq("id", clueId),
          "restauration du statut de l'indice",
        );
      });
    }
  } else {
    await collectRollbackError(rollbackErrors, async () => {
      await expectNoError(
        supabase.from("clues").delete().eq("id", clueId),
        "suppression du nouvel indice incomplet",
      );
    });
  }

  if (!snapshot && uploadedPath && !previousPaths.has(uploadedPath)) {
    await collectRollbackError(rollbackErrors, async () => {
      const result = await supabase.storage
        .from("clue-images")
        .remove([uploadedPath]);
      if (result.error) throw result.error;
    });
  }

  if (rollbackErrors.length > 0) {
    throw new Error(rollbackErrors.join("; "));
  }
}

async function cleanupAfterPublication({
  supabase,
  entry,
  snapshot,
  currentPath,
  warnings,
}) {
  if (!snapshot) return;
  const oldPrimary = findPrimaryImage(snapshot.images);
  if (oldPrimary && oldPrimary.storage_path !== currentPath) {
    await recordCleanupWarning(warnings, entry, async () => {
      const result = await supabase.storage
        .from("clue-images")
        .remove([oldPrimary.storage_path]);
      if (result.error) throw result.error;
    }, `ancienne image primaire ${oldPrimary.storage_path}`);
  }

  for (const image of snapshot.images.filter((item) => item.sort_order !== 0)) {
    const metadataDeleted = await recordCleanupWarning(
      warnings,
      entry,
      async () => {
        await expectNoError(
          supabase.from("clue_images").delete().eq("id", image.id),
          `suppression metadata ${image.id}`,
        );
      },
      `metadata image additionnelle ${image.storage_path}`,
    );
    if (!metadataDeleted) continue;
    await recordCleanupWarning(warnings, entry, async () => {
      const result = await supabase.storage
        .from("clue-images")
        .remove([image.storage_path]);
      if (result.error) throw result.error;
    }, `objet image additionnelle ${image.storage_path}`);
  }
}

async function collectRollbackError(errors, operation, onError) {
  try {
    await operation();
  } catch (error) {
    errors.push(formatError(error));
    onError?.();
  }
}

async function recordCleanupWarning(warnings, entry, operation, target) {
  try {
    await operation();
    return true;
  } catch (error) {
    warnings.push({
      clueId: entry.id,
      countryCode: entry.countryCode,
      target,
      message: formatError(error),
    });
    return false;
  }
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

class PermanentFetchError extends Error {}

function isPrivateIpAddress(hostname) {
  const ipv4 = hostname.split(".").map(Number);
  if (
    ipv4.length === 4 &&
    ipv4.every(
      (part) => Number.isInteger(part) && part >= 0 && part <= 255,
    )
  ) {
    const [first, second] = ipv4;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first >= 224
    );
  }

  const normalized = hostname.toLowerCase();
  if (!normalized.includes(":")) return false;
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("::ffff:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/u.test(normalized)
  );
}
