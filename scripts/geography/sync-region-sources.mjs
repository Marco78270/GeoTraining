import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegionSourceCatalog } from "./normalize-geography.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const concurrency = 8;

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function fetchWithRetry(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }
  throw lastError;
}

async function mapWithConcurrency(items, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function consume() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, consume),
  );
  return results;
}

async function main() {
  const sourcesPath = path.join(scriptDirectory, "sources.json");
  const sources = JSON.parse(await readFile(sourcesPath, "utf8"));
  const worldSource = JSON.parse(
    await readFile(
      path.join(repositoryRoot, sources.naturalEarthAdmin0.cachePath),
      "utf8",
    ),
  );
  const indexPath = path.join(
    repositoryRoot,
    "scripts/geography/cache/geoBoundaries-ADM1-index.json",
  );
  const indexContent = await readFile(indexPath);
  const adm1Index = JSON.parse(indexContent.toString("utf8"));
  const overrides = JSON.parse(
    await readFile(
      path.join(repositoryRoot, sources.iso3166Overrides.path),
      "utf8",
    ),
  );
  const catalog = buildRegionSourceCatalog(
    worldSource,
    adm1Index,
    overrides.alpha3ToAlpha2,
    {
      excludedAdm0A3: new Set(Object.keys(overrides.excludedAdm0A3 ?? {})),
    },
  );

  const downloaded = await mapWithConcurrency(
    catalog.sources,
    async (source, index) => {
      const content = await fetchWithRetry(source.url);
      const cachePath = path.join(repositoryRoot, source.cachePath);
      await mkdir(path.dirname(cachePath), { recursive: true });
      await writeFile(cachePath, content);
      console.log(
        `[${index + 1}/${catalog.sources.length}] ${source.countryCode} ` +
          `${Math.ceil(content.length / 1024)} KiB`,
      );
      return {
        ...source,
        sha256: sha256(content),
      };
    },
  );

  sources.geoBoundariesAdm1Index = {
    name: "geoBoundaries gbOpen ADM1 API index",
    version: "current",
    url: "https://www.geoboundaries.org/api/current/gbOpen/ALL/ADM1/",
    license: "CC BY 4.0",
    sha256: sha256(indexContent),
    cachePath: "scripts/geography/cache/geoBoundaries-ADM1-index.json",
  };
  sources.geoBoundariesCountryAdm1 = downloaded;
  sources.geoBoundariesUnavailableAdm1 = catalog.unavailable;
  await writeFile(sourcesPath, `${JSON.stringify(sources, null, 2)}\n`, "utf8");

  console.log(
    `Synchronized ${downloaded.length} ADM1 sources; ` +
      `${catalog.unavailable.length} countries unavailable.`,
  );
}

await main();
