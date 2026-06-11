import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");

function assertFeatureCollection(collection, label) {
  if (
    !collection ||
    collection.type !== "FeatureCollection" ||
    !Array.isArray(collection.features)
  ) {
    throw new Error(`${label} is not a GeoJSON FeatureCollection`);
  }
}

function geometryToPolygons(geometry) {
  if (geometry?.type === "Polygon") {
    return [geometry.coordinates];
  }
  if (geometry?.type === "MultiPolygon") {
    return geometry.coordinates;
  }
  throw new Error(`Unsupported geometry type: ${geometry?.type ?? "missing"}`);
}

function roundPosition(position) {
  return position.map((coordinate) => Number(coordinate.toFixed(5)));
}

function positionsEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function simplifyRing(ring) {
  const positions = [];
  for (const position of ring.map(roundPosition)) {
    if (!positionsEqual(positions.at(-1) ?? [], position)) {
      positions.push(position);
    }
  }
  if (positions.length > 0 && !positionsEqual(positions[0], positions.at(-1))) {
    positions.push([...positions[0]]);
  }
  if (positions.length < 4) {
    return ring.map((position) => [...position]);
  }
  return positions;
}

function simplifyGeometry(geometry) {
  if (geometry?.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geometry.coordinates.map(simplifyRing),
    };
  }
  if (geometry?.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geometry.coordinates.map((polygon) => polygon.map(simplifyRing)),
    };
  }
  throw new Error(`Unsupported geometry type: ${geometry?.type ?? "missing"}`);
}

function mergeGeometries(geometries) {
  const polygons = geometries.flatMap(geometryToPolygons);
  return polygons.length === 1
    ? { type: "Polygon", coordinates: polygons[0] }
    : { type: "MultiPolygon", coordinates: polygons };
}

export function normalizeWorldCollection(
  collection,
  iso3ToIso2Overrides = {},
  options = {},
) {
  assertFeatureCollection(collection, "Natural Earth source");
  const countries = new Map();
  const excludedAdm0A3 = options.excludedAdm0A3 ?? new Set();
  const canonicalNames = options.canonicalNames ?? {};

  for (const feature of collection.features) {
    const properties = feature.properties ?? {};
    if (excludedAdm0A3.has(properties.ADM0_A3)) {
      continue;
    }
    const iso2 = /^[A-Z]{2}$/.test(properties.ISO_A2 ?? "")
      ? properties.ISO_A2
      : iso3ToIso2Overrides[properties.ADM0_A3];
    if (!iso2) {
      throw new Error(
        `Cannot map Natural Earth country ${properties.ADMIN ?? "unknown"} ` +
          `(${properties.ADM0_A3 ?? "unknown"}) to ISO2`,
      );
    }
    if (!feature.geometry) {
      throw new Error(`Natural Earth country ${properties.ADMIN ?? iso2} has no geometry`);
    }

    const existing = countries.get(iso2);
    if (existing) {
      existing.geometries.push(simplifyGeometry(feature.geometry));
    } else {
      countries.set(iso2, {
        name: canonicalNames[iso2] ?? properties.ADMIN ?? iso2,
        geometries: [simplifyGeometry(feature.geometry)],
      });
    }
  }

  return {
    type: "FeatureCollection",
    features: [...countries.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([iso2, country]) => ({
        type: "Feature",
        properties: { iso2, name: country.name },
        geometry: mergeGeometries(country.geometries),
      })),
  };
}

export function createRegionId(countryCode, sourceId, name) {
  const digest = createHash("sha256")
    .update(`${countryCode}\0${sourceId}\0${name}`)
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
  return `${countryCode}-${digest}`;
}

export function normalizeRegionCollection(collection, countryCode, sourceCountryCode) {
  assertFeatureCollection(collection, "geoBoundaries source");
  const normalizedCountryCode = countryCode.trim().toUpperCase();

  return {
    type: "FeatureCollection",
    features: collection.features
      .filter((feature) => feature.properties?.shapeGroup === sourceCountryCode)
      .map((feature) => {
        const properties = feature.properties ?? {};
        if (!feature.geometry || !properties.shapeID || !properties.shapeName) {
          throw new Error(`Invalid geoBoundaries ADM1 feature for ${sourceCountryCode}`);
        }
        return {
          type: "Feature",
          properties: {
            id: new RegExp(`^${normalizedCountryCode}-[A-Z0-9]{1,8}$`).test(
              properties.shapeISO ?? "",
            )
              ? properties.shapeISO
              : createRegionId(
                  normalizedCountryCode,
                  properties.shapeID,
                  properties.shapeName,
                ),
            countryCode: normalizedCountryCode,
            name: properties.shapeName,
            sourceId: properties.shapeID,
          },
          geometry: simplifyGeometry(feature.geometry),
        };
      })
      .sort((left, right) => left.properties.id.localeCompare(right.properties.id)),
  };
}

function escapeSql(value) {
  return value.replaceAll("'", "''");
}

export function buildGeographySeedSql(
  worldCollection,
  regionCollections = [],
  legacyRegionIdMappings = {},
) {
  assertFeatureCollection(worldCollection, "Normalized world output");
  const rows = [...worldCollection.features]
    .sort((left, right) =>
      left.properties.iso2.localeCompare(right.properties.iso2),
    )
    .map(
      (feature) =>
        `  ('${escapeSql(feature.properties.iso2)}', ` +
        `'${escapeSql(feature.properties.name)}', '/geography/world.geojson')`,
    );

  const statements = [
    "-- Generated by scripts/geography/normalize-geography.mjs.",
    "insert into public.countries (code, name, geojson_path)",
    "values",
    rows.join(",\n"),
    "on conflict (code) do update",
    "set",
    "  name = excluded.name,",
    "  geojson_path = excluded.geojson_path;",
  ];

  const regionRows = regionCollections
    .flatMap((collection) => {
      assertFeatureCollection(collection, "Normalized region output");
      return collection.features;
    })
    .sort((left, right) => left.properties.id.localeCompare(right.properties.id))
    .map(
      (feature) =>
        `  ('${escapeSql(feature.properties.id)}', ` +
        `'${escapeSql(feature.properties.countryCode)}', ` +
        `'${escapeSql(feature.properties.name)}', ` +
        `'/geography/regions/${escapeSql(feature.properties.countryCode)}.geojson')`,
    );

  if (regionRows.length > 0) {
    statements.push(
      "",
      "insert into public.regions (id, country_code, name, geojson_path)",
      "values",
      regionRows.join(",\n"),
      "on conflict (id) do update",
      "set",
      "  country_code = excluded.country_code,",
      "  name = excluded.name,",
      "  geojson_path = excluded.geojson_path;",
    );
  }

  for (const [legacyId, canonicalId] of Object.entries(legacyRegionIdMappings)) {
    statements.push(
      "",
      "insert into public.clue_regions (clue_id, region_id)",
      `select clue_id, '${escapeSql(canonicalId)}'`,
      "from public.clue_regions",
      `where region_id = '${escapeSql(legacyId)}'`,
      "on conflict (clue_id, region_id) do nothing;",
      "",
      `delete from public.clue_regions where region_id = '${escapeSql(legacyId)}';`,
      "",
      `delete from public.regions where id = '${escapeSql(legacyId)}';`,
    );
  }

  return `${statements.join("\n")}\n`;
}

async function sha256(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

async function readSources() {
  return JSON.parse(await readFile(path.join(scriptDirectory, "sources.json"), "utf8"));
}

async function readIsoOverrides(sources) {
  const metadata = sources.iso3166Overrides;
  const filePath = path.join(repositoryRoot, metadata.path);
  await verifyFile(filePath, metadata.sha256, metadata.name);
  const overrides = JSON.parse(await readFile(filePath, "utf8"));
  return {
    alpha3ToAlpha2: overrides.alpha3ToAlpha2,
    canonicalNames: overrides.canonicalNames,
    excludedAdm0A3: new Set(Object.keys(overrides.excludedAdm0A3 ?? {})),
  };
}

async function verifyFile(filePath, expectedHash, label) {
  const actualHash = await sha256(filePath);
  if (actualHash !== expectedHash) {
    throw new Error(`${label} checksum mismatch: expected ${expectedHash}, got ${actualHash}`);
  }
}

async function generateWorld(sources, isoOverrides) {
  const sourcePath = path.join(repositoryRoot, sources.naturalEarthAdmin0.cachePath);
  await verifyFile(
    sourcePath,
    sources.naturalEarthAdmin0.sha256,
    sources.naturalEarthAdmin0.name,
  );
  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  const normalized = normalizeWorldCollection(
    source,
    isoOverrides.alpha3ToAlpha2,
    {
      canonicalNames: isoOverrides.canonicalNames,
      excludedAdm0A3: isoOverrides.excludedAdm0A3,
    },
  );
  const outputPath = path.join(repositoryRoot, sources.naturalEarthAdmin0.outputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(normalized)}\n`, "utf8");
  return normalized.features.length;
}

async function generateRegions(sources) {
  const outputs = [];
  for (const source of sources.geoBoundariesCountryAdm1 ?? []) {
    const sourcePath = path.join(repositoryRoot, source.cachePath);
    await verifyFile(sourcePath, source.sha256, source.name);
    const collection = JSON.parse(await readFile(sourcePath, "utf8"));
    const normalized = normalizeRegionCollection(
      collection,
      source.countryCode,
      source.sourceCountryCode,
    );
    const outputPath = path.join(repositoryRoot, source.outputPath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(normalized)}\n`, "utf8");
    outputs.push(normalized);
  }
  return outputs;
}

async function main() {
  const sources = await readSources();
  const isoOverrides = await readIsoOverrides(sources);
  const verifyOnly = process.argv.includes("--verify");
  const sqlOutputIndex = process.argv.indexOf("--sql-output");
  const sqlOutput =
    sqlOutputIndex >= 0 ? process.argv[sqlOutputIndex + 1] : undefined;
  if (verifyOnly) {
    const outputPath = path.join(repositoryRoot, sources.naturalEarthAdmin0.outputPath);
    await verifyFile(
      outputPath,
      sources.naturalEarthAdmin0.outputSha256,
      "Normalized world output",
    );
    const output = JSON.parse(await readFile(outputPath, "utf8"));
    assertFeatureCollection(output, "Normalized world output");
    if (output.features.some((feature) => !/^[A-Z]{2}$/.test(feature.properties?.iso2))) {
      throw new Error("Normalized world output contains an invalid ISO2 code");
    }
    let regionCount = 0;
    for (const source of sources.geoBoundariesCountryAdm1 ?? []) {
      await verifyFile(
        path.join(repositoryRoot, source.outputPath),
        source.outputSha256,
        `${source.countryCode} normalized region output`,
      );
      const regions = JSON.parse(
        await readFile(path.join(repositoryRoot, source.outputPath), "utf8"),
      );
      assertFeatureCollection(regions, `${source.countryCode} region output`);
      regionCount += regions.features.length;
    }
    console.log(
      `Verified ${output.features.length} world features and ${regionCount} region features`,
    );
    return;
  }

  const sourcePath = path.join(repositoryRoot, sources.naturalEarthAdmin0.cachePath);
  await verifyFile(
    sourcePath,
    sources.naturalEarthAdmin0.sha256,
    sources.naturalEarthAdmin0.name,
  );
  const count = await generateWorld(sources, isoOverrides);
  const regionCollections = await generateRegions(sources);
  if (sqlOutput) {
    const world = JSON.parse(
      await readFile(
        path.join(repositoryRoot, sources.naturalEarthAdmin0.outputPath),
        "utf8",
      ),
    );
    const migrationPath = path.resolve(repositoryRoot, sqlOutput);
    await writeFile(
      migrationPath,
      buildGeographySeedSql(
        world,
        regionCollections,
        sources.legacyRegionIdMappings,
      ),
      "utf8",
    );
  }
  const regionCount = regionCollections.reduce(
    (total, collection) => total + collection.features.length,
    0,
  );
  console.log(`Generated ${count} world features and ${regionCount} region features`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
