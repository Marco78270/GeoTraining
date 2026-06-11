import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  buildGeographySeedSql,
  createRegionId,
  normalizeRegionCollection,
  normalizeWorldCollection,
} from "./normalize-geography.mjs";

const polygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
};

test("normalizes Natural Earth countries to ISO2 features", () => {
  const source = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          ADMIN: "France",
          ISO_A2: "-99",
          ISO_A3: "-99",
          ADM0_A3: "FRA",
        },
        geometry: polygon,
      },
      {
        type: "Feature",
        properties: {
          ADMIN: "United States of America",
          ISO_A2: "US",
          ISO_A3: "USA",
          ADM0_A3: "USA",
        },
        geometry: polygon,
      },
    ],
  };

  const result = normalizeWorldCollection(source, { FRA: "FR", USA: "US" });

  assert.deepEqual(
    result.features.map(({ properties }) => properties),
    [
      { iso2: "FR", name: "France" },
      { iso2: "US", name: "United States of America" },
    ],
  );
  assert.ok(result.features.every(({ geometry }) => geometry));
});

test("uses canonical names when merged territories appear first", () => {
  const source = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { ADMIN: "Northern Cyprus", ADM0_A3: "CYN", ISO_A2: "-99" },
        geometry: polygon,
      },
      {
        type: "Feature",
        properties: { ADMIN: "Cyprus", ADM0_A3: "CYP", ISO_A2: "CY" },
        geometry: polygon,
      },
    ],
  };

  const result = normalizeWorldCollection(
    source,
    { CYN: "CY" },
    { canonicalNames: { CY: "Cyprus" } },
  );

  assert.equal(result.features[0].properties.name, "Cyprus");
  assert.equal(result.features.length, 1);
});

test("explicitly excludes territories without an assigned application ISO2 code", () => {
  const source = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { ADMIN: "Kosovo", ADM0_A3: "KOS", ISO_A2: "-99" },
        geometry: polygon,
      },
    ],
  };

  const result = normalizeWorldCollection(
    source,
    {},
    { excludedAdm0A3: new Set(["KOS"]) },
  );

  assert.equal(result.features.length, 0);
});

test("fails when a country cannot be mapped to ISO2", () => {
  const source = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { ADMIN: "Unknown", ADM0_A3: "XXX", ISO_A2: "-99" },
        geometry: polygon,
      },
    ],
  };

  assert.throws(
    () => normalizeWorldCollection(source, {}),
    /Cannot map Natural Earth country Unknown \(XXX\) to ISO2/,
  );
});

test("reduces coordinate precision and consecutive duplicate points", () => {
  const source = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { ADMIN: "France", ADM0_A3: "FRA", ISO_A2: "FR" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0.123456789, 0],
              [0.123456789, 0],
              [1, 0],
              [1, 1],
              [0.123456789, 0],
            ],
          ],
        },
      },
    ],
  };

  const result = normalizeWorldCollection(source);
  const ring = result.features[0].geometry.coordinates[0];

  assert.deepEqual(ring[0], [0.12346, 0]);
  assert.equal(ring.length, 4);
});

test("preserves tiny polygon rings that would collapse after rounding", () => {
  const tinyRing = [
    [0.000001, 0.000001],
    [0.000002, 0.000001],
    [0.000002, 0.000002],
    [0.000001, 0.000001],
  ];
  const source = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { ADMIN: "Tiny", ADM0_A3: "TNY", ISO_A2: "TY" },
        geometry: { type: "Polygon", coordinates: [tinyRing] },
      },
    ],
  };

  const result = normalizeWorldCollection(source);

  assert.deepEqual(result.features[0].geometry.coordinates[0], tinyRing);
});

test("creates deterministic application region ids", () => {
  assert.equal(createRegionId("FR", "FRA-ADM1-123", "Île-de-France"), "FR-42719266F1");
  assert.equal(createRegionId("FR", "FRA-ADM1-123", "Île-de-France"), "FR-42719266F1");
  assert.notEqual(
    createRegionId("FR", "FRA-ADM1-123", "Île-de-France"),
    createRegionId("FR", "FRA-ADM1-124", "Île-de-France"),
  );
});

test("normalizes geoBoundaries regions without inventing ISO 3166-2 codes", () => {
  const source = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          shapeName: "Île-de-France",
          shapeID: "FRA-ADM1-123",
          shapeGroup: "FRA",
          shapeType: "ADM1",
        },
        geometry: polygon,
      },
    ],
  };

  const result = normalizeRegionCollection(source, "FR", "FRA");

  assert.equal(result.features[0].properties.countryCode, "FR");
  assert.match(result.features[0].properties.id, /^FR-[A-F0-9]{10}$/);
  assert.equal(result.features[0].properties.sourceId, "FRA-ADM1-123");
  assert.equal(result.features[0].properties.name, "Île-de-France");
});

test("keeps an explicit valid ISO 3166-2 region code", () => {
  const source = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          shapeName: "Île-de-France",
          shapeISO: "FR-IDF",
          shapeID: "FRA-ADM1-123",
          shapeGroup: "FRA",
          shapeType: "ADM1",
        },
        geometry: polygon,
      },
    ],
  };

  const result = normalizeRegionCollection(source, "FR", "FRA");

  assert.equal(result.features[0].properties.id, "FR-IDF");
});

test("generates deterministic SQL with escaped geography names", () => {
  const world = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { iso2: "CI", name: "Côte d'Ivoire" },
        geometry: polygon,
      },
      {
        type: "Feature",
        properties: { iso2: "FR", name: "France" },
        geometry: polygon,
      },
    ],
  };
  const regional = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          id: "FR-IDF",
          countryCode: "FR",
          name: "Île-de-France",
          sourceId: "FRA-ADM1-123",
        },
        geometry: polygon,
      },
    ],
  };
  const sql = buildGeographySeedSql(world, [regional]);

  assert.match(sql, /\('CI', 'Côte d''Ivoire', '\/geography\/world\.geojson'\)/);
  assert.match(sql, /on conflict \(code\) do update/);
  assert.match(
    sql,
    /\('FR-IDF', 'FR', 'Île-de-France', '\/geography\/regions\/FR\.geojson'\)/,
  );
  assert.ok(sql.indexOf("'CI'") < sql.indexOf("'FR'"));
});

test("keeps the active Supabase seed and generated paths coherent", () => {
  const seed = readFileSync("supabase/seed.sql", "utf8");
  const migration = readFileSync(
    "supabase/migrations/20260611074439_geography_seed.sql",
    "utf8",
  );

  assert.doesNotMatch(seed, /insert into public\.(countries|regions)/i);
  assert.match(
    migration,
    /insert into public\.clue_regions \(clue_id, region_id\)[\s\S]+select clue_id, 'FR-20R'[\s\S]+where region_id = 'FR-COR'[\s\S]+on conflict \(clue_id, region_id\) do nothing/,
  );
  assert.match(
    migration,
    /delete from public\.clue_regions where region_id = 'FR-COR'/,
  );
  assert.match(migration, /delete from public\.regions where id = 'FR-COR'/);

  const paths = [...migration.matchAll(/'(\/geography\/[^']+\.geojson)'/g)].map(
    (match) => `public${match[1]}`,
  );
  assert.ok(paths.length > 0);
  assert.ok(paths.every((filePath) => existsSync(filePath)));
});
