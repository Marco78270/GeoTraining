import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CATEGORY_URL = "https://geometas.com/metas/categories/google_car/";
const DETAIL_BASE_URL = "https://geometas.com";
const OUTPUT_FILE = new URL("./google-car.v1.json", import.meta.url);
const SUMMARY_FILE = new URL(
  "../../output/official-google-car-sync-summary.json",
  import.meta.url,
);

const COUNTRY_ALIASES = new Map([
  ["curacao", "CW"],
  ["curaçao", "CW"],
  ["czech republic", "CZ"],
  ["usa", "US"],
  ["united states", "US"],
  ["united states of america", "US"],
  ["uk", "GB"],
  ["u.k.", "GB"],
  ["uae", "AE"],
  ["united arab emirates uae", "AE"],
  ["serbia", "RS"],
]);

const USER_AGENT =
  "GeoTrainerAtlas/1.0 (https://github.com/Marco78270/GeoTraining)";

async function main() {
  const countries = await loadCountryMap();
  const categoryHtml = await fetchHtml(CATEGORY_URL);
  const detailUrls = [
    ...new Set(
      [...categoryHtml.matchAll(/href="(?<href>\/metas\/detail\/[^"]+\/)"/giu)]
        .map((match) => new URL(match.groups.href, DETAIL_BASE_URL).toString()),
    ),
  ];

  const entries = [];
  const skipped = [];

  for (const detailUrl of detailUrls) {
    try {
      const entry = await parseDetailPage(detailUrl, countries);
      if (entry) entries.push(entry);
    } catch (error) {
      skipped.push({
        detailUrl,
        message: formatError(error),
      });
    }
  }

  entries.sort((left, right) =>
    left.countryCode.localeCompare(right.countryCode) ||
    left.title.localeCompare(right.title),
  );

  await writeFile(OUTPUT_FILE, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  await mkdir(path.dirname(fileURLToPath(SUMMARY_FILE)), { recursive: true });
  await writeFile(
    SUMMARY_FILE,
    `${JSON.stringify(
      {
        sourceUrl: CATEGORY_URL,
        totalLinks: detailUrls.length,
        generated: entries.length,
        skipped: skipped.length,
        skippedDetails: skipped,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        sourceUrl: CATEGORY_URL,
        totalLinks: detailUrls.length,
        generated: entries.length,
        skipped: skipped.length,
      },
      null,
      2,
    ),
  );
}

async function parseDetailPage(detailUrl, countries) {
  const html = await fetchHtml(detailUrl);
  const id = detailUrl.match(/\/detail\/(?<id>[0-9a-f-]+)\//iu)?.groups.id;
  if (!id) throw new Error("UUID introuvable dans l'URL.");

  const title = decodeHtml(
    html.match(/<h1[^>]*>\s*(?<value>[\s\S]*?)\s*<\/h1>/iu)?.groups.value ?? "",
  ).trim();
  const description = decodeHtml(
    html.match(/<meta\s+name="description"\s+content="(?<value>[^"]*)"/iu)
      ?.groups.value ?? "",
  ).trim();
  const imageUrl = decodeHtml(
    html.match(/<meta\s+property="og:image"\s+content="(?<value>[^"]+)"/iu)
      ?.groups.value ?? "",
  ).trim();
  const googleMapsUrl = decodeHtml(
    html.match(/<a\s+href="(?<value>https:\/\/goo\.gl\/maps\/[^"]+)"/iu)
      ?.groups.value ??
      html.match(/src="(?<value>https:\/\/www\.google\.com\/maps\/embed\/v1\/streetview[^"]+)"/iu)
        ?.groups.value ??
      "",
  ).trim();
  const streetViewCoordinates = html.match(
    /location=(?<lat>-?\d+(?:\.\d+)?),(?<lng>-?\d+(?:\.\d+)?)/iu,
  )?.groups;
  const countryName = extractCountryName(html, title);
  const countryCode = resolveCountryCode(countryName, countries);

  if (!countryCode) {
    throw new Error(`Pays introuvable dans l'atlas: ${countryName || "inconnu"}.`);
  }
  if (!title) throw new Error("Titre introuvable.");
  if (!description) throw new Error("Description introuvable.");
  if (!imageUrl) throw new Error("Image principale introuvable.");

  const normalizedTitle = title.replace(/\s+-\s+Geometas$/iu, "");
  const displayCountryName = countries.byCode.get(countryCode) ?? countryName;
  const difficulty = inferDifficulty(description, normalizedTitle);

  return {
    id,
    countryCode,
    title: normalizedTitle,
    difficulty,
    characteristics: buildCharacteristics(description, displayCountryName),
    notes: buildNotes(description, streetViewCoordinates),
    sourceName: "Geometas - Google Car",
    sourceUrl: detailUrl,
    licenseName: "Geometas source page",
    licenseUrl: detailUrl,
    attributionText: `${normalizedTitle}. Reference image and metadata imported from Geometas.`,
    imageUrl,
    imageAltText: `${normalizedTitle} - Google car meta`,
    googleMapsUrl: googleMapsUrl || detailUrl,
    regionIds: [],
  };
}

function extractCountryName(html, title) {
  const tagMatches = [...html.matchAll(/<span[^>]*>\s*(?<value>[^<]*?)\s*<\/span>/giu)]
    .map((match) => decodeHtml(match.groups.value).trim())
    .filter(Boolean);
  const countryTag = tagMatches.find((value) => /[\u{1F1E6}-\u{1F1FF}]/u.test(value));
  if (countryTag) {
    return countryTag.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "").trim();
  }
  return title.split(":")[0]?.trim() ?? "";
}

function resolveCountryCode(countryName, countries) {
  const normalized = normalizeName(countryName);
  return COUNTRY_ALIASES.get(normalized) ?? countries.byName.get(normalized) ?? null;
}

function buildCharacteristics(description, countryName) {
  const normalized = description.replace(/\s+/gu, " ").trim();
  const sentences = normalized
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 3);
  return sentences.length > 0
    ? sentences
    : [`Google car visible pour ${countryName}.`];
}

function buildNotes(description, coordinates) {
  const parts = [description.trim()];
  if (coordinates?.lat && coordinates?.lng) {
    parts.push(`Street View reference: ${coordinates.lat}, ${coordinates.lng}.`);
  }
  parts.push("Indice officiel public importe depuis Geometas.");
  return parts.join("\n\n");
}

function inferDifficulty(description, title) {
  const text = `${title} ${description}`.toLowerCase();
  if (
    /\b(always|almost always|very unique|unique|distinctive|easy|obvious)\b/u.test(
      text,
    )
  ) {
    return "easy";
  }
  if (/\b(sometimes|can be|similar|subtle|hard|rare|may|might)\b/u.test(text)) {
    return "expert";
  }
  return "medium";
}

async function loadCountryMap() {
  const migrationDir = new URL("../../supabase/migrations/", import.meta.url);
  const files = [
    "20260611074439_geography_seed.sql",
    "20260618170000_add_curacao_geography.sql",
  ];
  const byName = new Map();
  const byCode = new Map();

  for (const file of files) {
    const sql = await readFile(new URL(file, migrationDir), "utf8");
    for (const match of sql.matchAll(
      /\('(?<code>[A-Z]{2})',\s*(?:'(?<plain>(?:''|[^'])*)'|U&'(?<unicode>(?:''|[^'])*)')\s*,/gu,
    )) {
      const code = match.groups.code;
      const name = decodeSqlString(match.groups.plain ?? match.groups.unicode ?? "");
      byName.set(normalizeName(name), code);
      byCode.set(code, name);
    }
  }

  for (const [name, code] of COUNTRY_ALIASES) {
    byName.set(name, code);
  }

  return { byName, byCode };
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} pour ${url}.`);
  }
  return response.text();
}

function decodeSqlString(value) {
  return value
    .replace(/''/gu, "'")
    .replace(/\\(?<hex>[0-9a-f]{4})/giu, (_match, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    );
}

function normalizeName(value) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/gu, "and")
    .replace(/[^a-z0-9]+/giu, " ")
    .trim()
    .toLowerCase();
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, '"')
    .replace(/&#x27;/gu, "'")
    .replace(/&#39;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/<[^>]+>/gu, "")
    .replace(/\s+/gu, " ");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

await main();
