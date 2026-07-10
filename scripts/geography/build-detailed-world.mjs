import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const worldPath = path.join(repositoryRoot, "public/geography/world.geojson");
const regionsDirectory = path.join(repositoryRoot, "public/geography/regions");
const outputPath = path.join(repositoryRoot, "public/geography/world-detailed.geojson");
const DETAILED_COUNTRY_MAX_DEGREES = 2;

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
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

function mergeGeometries(geometries) {
  const polygons = geometries.flatMap(geometryToPolygons);
  if (polygons.length === 0) return null;
  return polygons.length === 1
    ? { type: "Polygon", coordinates: polygons[0] }
    : { type: "MultiPolygon", coordinates: polygons };
}

function geometryBounds(geometry) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function visit(value) {
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      minX = Math.min(minX, value[0]);
      maxX = Math.max(maxX, value[0]);
      minY = Math.min(minY, value[1]);
      maxY = Math.max(maxY, value[1]);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(visit);
    }
  }

  visit(geometry?.coordinates);
  return Number.isFinite(minX)
    ? {
        width: maxX - minX,
        height: maxY - minY,
      }
    : null;
}

function shouldUseDetailedGeometry(fallbackGeometry) {
  const bounds = geometryBounds(fallbackGeometry);
  if (!bounds) return true;
  return Math.max(bounds.width, bounds.height) < DETAILED_COUNTRY_MAX_DEGREES;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  const world = await readJson(worldPath);
  assertFeatureCollection(world, "world.geojson");

  const countries = new Map(
    world.features.map((feature) => [
      feature.properties?.iso2,
      {
        name: feature.properties?.name,
        fallbackGeometry: feature.geometry,
        regionGeometries: [],
      },
    ]),
  );

  for (const fileName of (await readdir(regionsDirectory)).sort()) {
    if (!fileName.endsWith(".geojson")) continue;

    const countryCode = path.basename(fileName, ".geojson");
    const collection = await readJson(path.join(regionsDirectory, fileName));
    assertFeatureCollection(collection, fileName);

    const country = countries.get(countryCode);
    if (!country) continue;

    for (const feature of collection.features) {
      if (feature.properties?.countryCode !== countryCode) continue;
      if (!feature.geometry) continue;
      country.regionGeometries.push(feature.geometry);
    }
  }

  const detailedWorld = {
    type: "FeatureCollection",
    features: [...countries.entries()]
      .filter(([code]) => /^[A-Z]{2}$/.test(code ?? ""))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([code, country]) => ({
        type: "Feature",
        properties: {
          iso2: code,
          name: country.name,
        },
        geometry: shouldUseDetailedGeometry(country.fallbackGeometry)
          ? mergeGeometries(country.regionGeometries) ?? country.fallbackGeometry
          : country.fallbackGeometry,
      })),
  };
  const detailedCountries = detailedWorld.features.filter((feature) =>
    shouldUseDetailedGeometry(countries.get(feature.properties.iso2)?.fallbackGeometry),
  );

  await writeFile(outputPath, `${JSON.stringify(detailedWorld)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        outputPath,
        countries: detailedWorld.features.length,
        detailedCountries: detailedCountries.filter(
          (feature) =>
            countries.get(feature.properties.iso2)?.regionGeometries.length > 0,
        ).length,
        detailedThresholdDegrees: DETAILED_COUNTRY_MAX_DEGREES,
      },
      null,
      2,
    ),
  );
}

await main();
