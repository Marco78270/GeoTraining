import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildCluePayload,
  buildDownloadUrl,
  buildImagePath,
  fetchImage,
  runOfficialImport,
  sniffImageFormat,
  validateDataset,
  validateEntry,
} from "./importer.mjs";

const COLLECTION_ID = "f0000000-0000-0000-0000-000000000001";
const CATEGORY_ID = "f1000000-0000-0000-0000-000000000004";
const AUTHOR_ID = "22222222-2222-4222-8222-222222222222";

const validEntry = {
  id: "11111111-1111-4111-8111-111111111111",
  countryCode: "FR",
  regionIds: [],
  difficulty: "easy",
  title: "Marquage au sol - France",
  characteristics: ["Lignes de rive blanches"],
  notes: "Indice reformule.",
  sourceName: "Wikimedia Commons",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Road.jpg",
  licenseName: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  attributionText: "Photo Example Author.",
  imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Road.jpg",
  imageAltText: "Route francaise avec marquage blanc",
};

test("accepts a complete country clue", () => {
  assert.equal(validateEntry(validEntry).coverage, "whole_country");
});

test("rejects an entry without an image", () => {
  assert.throws(() => validateEntry({ ...validEntry, imageUrl: "" }), {
    message: /imageUrl/,
  });
});

test("rejects an unsupported difficulty", () => {
  assert.throws(
    () => validateEntry({ ...validEntry, difficulty: "hard" }),
    { message: /difficulty/ },
  );
});

test("rejects invalid UUIDs, country codes, characteristics, and regions", () => {
  assert.throws(() => validateEntry({ ...validEntry, id: "not-an-id" }), /UUID/);
  assert.throws(
    () => validateEntry({ ...validEntry, countryCode: "France" }),
    /countryCode/,
  );
  assert.throws(
    () => validateEntry({ ...validEntry, characteristics: [] }),
    /characteristics/,
  );
  assert.throws(
    () => validateEntry({ ...validEntry, regionIds: [""] }),
    /regionIds/,
  );
});

test("uses selected_regions coverage when region ids exist", () => {
  assert.equal(
    validateEntry({ ...validEntry, regionIds: ["CO-SAP"] }).coverage,
    "selected_regions",
  );
});

test("rejects empty datasets and duplicate UUIDs", () => {
  assert.throws(() => validateDataset([]), /au moins une entree/);
  assert.throws(
    () => validateDataset([validEntry, { ...validEntry }]),
    /UUID duplique/,
  );
});

test("builds deterministic payloads and image paths", () => {
  const payload = buildCluePayload(
    validateEntry(validEntry),
    CATEGORY_ID,
    AUTHOR_ID,
    "draft",
  );

  assert.deepEqual(
    {
      coverage: payload.coverage,
      status: payload.status,
      difficulty: payload.difficulty,
    },
    {
      coverage: "whole_country",
      status: "draft",
      difficulty: "easy",
    },
  );
  assert.equal(
    buildImagePath(COLLECTION_ID, validEntry.id, validEntry.id, "jpg"),
    `${COLLECTION_ID}/${validEntry.id}/${validEntry.id}.jpg`,
  );
});

test("adds a Wikimedia thumbnail width without changing other URLs", () => {
  assert.match(buildDownloadUrl(validEntry.imageUrl), /width=1200/);
  assert.equal(
    buildDownloadUrl("https://example.com/image.jpg"),
    "https://example.com/image.jpg",
  );
});

test("sniffs PNG, JPEG, WebP, and SVG image contents", () => {
  assert.equal(
    sniffImageFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      .extension,
    "png",
  );
  assert.equal(sniffImageFormat(Buffer.from([0xff, 0xd8, 0xff])).extension, "jpg");
  assert.equal(
    sniffImageFormat(Buffer.from("RIFF0000WEBP")).extension,
    "webp",
  );
  assert.equal(
    sniffImageFormat(Buffer.from(" \n<?xml version=\"1.0\"?><svg></svg>")).extension,
    "svg",
  );
  assert.throws(() => sniffImageFormat(Buffer.from("not an image")), /non supporte/);
});

test("retries transient image statuses and returns sniffed data", async () => {
  let attempts = 0;
  const result = await fetchImage(validEntry.imageUrl, async () => {
    attempts += 1;
    if (attempts < 3) {
      return new Response("retry", { status: attempts === 1 ? 429 : 503 });
    }
    return new Response(Buffer.from([0xff, 0xd8, 0xff]), { status: 200 });
  }, {
    attempts: 3,
    baseDelayMs: 0,
    requestSpacingMs: 0,
    sleepImpl: async () => {},
  });

  assert.equal(attempts, 3);
  assert.equal(result.extension, "jpg");
  assert.equal(result.contentType, "image/jpeg");
});

test("does not retry permanent image errors", async () => {
  let attempts = 0;
  await assert.rejects(
    fetchImage(
      validEntry.imageUrl,
      async () => {
        attempts += 1;
        return new Response("missing", { status: 404 });
      },
      {
        attempts: 3,
        baseDelayMs: 0,
        requestSpacingMs: 0,
        sleepImpl: async () => {},
      },
    ),
    /404/,
  );
  assert.equal(attempts, 1);
});

test("dry-run reads geography but performs no writes", async () => {
  const fixture = await createFixture();
  const fake = createFakeSupabase();
  let imageDownloads = 0;

  try {
    const summary = await runOfficialImport({
      category: { id: CATEGORY_ID, name: "Marquages au sol" },
      datasetPath: fixture.datasetPath,
      summaryFileName: "summary.json",
      authorEnvName: "SUPABASE_META_AUTHOR_ID",
      authorId: AUTHOR_ID,
      dryRun: true,
      missingImagesOnly: false,
      supabase: fake.client,
      outputDir: fixture.directory,
      fetchImpl: async () => {
        imageDownloads += 1;
        return new Response(Buffer.from([0xff, 0xd8, 0xff]), { status: 200 });
      },
      requestSpacingMs: 0,
      retryBaseDelayMs: 0,
    });

    assert.equal(summary.created, 1);
    assert.equal(summary.failed, 0);
    assert.equal(fake.writes.length, 0);
    assert.equal(imageDownloads, 1);
    assert.ok(fake.reads.includes("countries"));
    assert.ok(fake.reads.includes("collections"));
    assert.ok(fake.reads.includes("categories"));
  } finally {
    await fixture.cleanup();
  }
});

test("dry-run rejects SVG images without writing", async () => {
  const fixture = await createFixture();
  const fake = createFakeSupabase();

  try {
    const summary = await runOfficialImport({
      category: { id: CATEGORY_ID, name: "Marquages au sol" },
      datasetPath: fixture.datasetPath,
      summaryFileName: "summary.json",
      authorEnvName: "SUPABASE_META_AUTHOR_ID",
      authorId: AUTHOR_ID,
      dryRun: true,
      missingImagesOnly: false,
      supabase: fake.client,
      outputDir: fixture.directory,
      fetchImpl: async () =>
        new Response(Buffer.from("<svg></svg>"), { status: 200 }),
      requestSpacingMs: 0,
      retryBaseDelayMs: 0,
    });

    assert.equal(summary.failed, 1);
    assert.match(summary.failures[0].message, /SVG.*non supporte/i);
    assert.equal(fake.writes.length, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("fails before processing when the official category is missing", async () => {
  const fixture = await createFixture();
  const fake = createFakeSupabase({ categoryExists: false });

  try {
    await assert.rejects(
      runOfficialImport({
        category: { id: CATEGORY_ID, name: "Marquages au sol" },
        datasetPath: fixture.datasetPath,
        summaryFileName: "summary.json",
        authorEnvName: "SUPABASE_META_AUTHOR_ID",
        authorId: AUTHOR_ID,
        dryRun: true,
        missingImagesOnly: false,
        supabase: fake.client,
        outputDir: fixture.directory,
      }),
      /Categorie officielle introuvable/,
    );
    assert.equal(fake.writes.length, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("publishes only after image and region reconciliation succeeds", async () => {
  const fixture = await createFixture({
    ...validEntry,
    regionIds: ["FR-IDF"],
  });
  const fake = createFakeSupabase({
    regions: [{ id: "FR-IDF", country_code: "FR" }],
  });

  try {
    const summary = await runOfficialImport({
      category: { id: CATEGORY_ID, name: "Marquages au sol" },
      datasetPath: fixture.datasetPath,
      summaryFileName: "summary.json",
      authorEnvName: "SUPABASE_META_AUTHOR_ID",
      authorId: AUTHOR_ID,
      dryRun: false,
      missingImagesOnly: false,
      supabase: fake.client,
      outputDir: fixture.directory,
      fetchImpl: async () =>
        new Response(Buffer.from([0xff, 0xd8, 0xff]), { status: 200 }),
      requestSpacingMs: 0,
      retryBaseDelayMs: 0,
    });

    assert.equal(summary.created, 1);
    assert.equal(summary.imagesImported, 1);
    assert.equal(summary.failed, 0);
    assert.deepEqual(
      fake.clueStatuses,
      ["draft", "published"],
    );
    assert.ok(
      fake.writes.indexOf("clue_regions:insert") <
        fake.writes.indexOf("clues:update:published"),
    );
    assert.ok(
      fake.writes.indexOf("storage:upload") <
        fake.writes.indexOf("clues:update:published"),
    );
    assert.equal(
      fake.uploadedPaths[0],
      `${COLLECTION_ID}/${validEntry.id}/${validEntry.id}.jpg`,
    );
    assert.equal(fake.clueImageUpserts[0].id, validEntry.id);
  } finally {
    await fixture.cleanup();
  }
});

test("reports image upload failures and leaves the clue unpublished", async () => {
  const fixture = await createFixture();
  const fake = createFakeSupabase({
    uploadError: { message: "upload refused" },
  });

  try {
    const summary = await runOfficialImport({
      category: { id: CATEGORY_ID, name: "Marquages au sol" },
      datasetPath: fixture.datasetPath,
      summaryFileName: "summary.json",
      authorEnvName: "SUPABASE_META_AUTHOR_ID",
      authorId: AUTHOR_ID,
      dryRun: false,
      missingImagesOnly: false,
      supabase: fake.client,
      outputDir: fixture.directory,
      fetchImpl: async () =>
        new Response(Buffer.from([0xff, 0xd8, 0xff]), { status: 200 }),
      requestSpacingMs: 0,
      retryBaseDelayMs: 0,
    });

    assert.equal(summary.failed, 1);
    assert.match(summary.failures[0].message, /upload/i);
    assert.equal(summary.failures[0].countryCode, "FR");
    assert.deepEqual(fake.clueStatuses, ["draft"]);
  } finally {
    await fixture.cleanup();
  }
});

test("removes the uploaded object when clue image metadata fails", async () => {
  const fixture = await createFixture();
  const fake = createFakeSupabase({
    clueImageUpsertError: { message: "metadata refused" },
  });

  try {
    const summary = await runOfficialImport({
      category: { id: CATEGORY_ID, name: "Marquages au sol" },
      datasetPath: fixture.datasetPath,
      summaryFileName: "summary.json",
      authorEnvName: "SUPABASE_META_AUTHOR_ID",
      authorId: AUTHOR_ID,
      dryRun: false,
      missingImagesOnly: false,
      supabase: fake.client,
      outputDir: fixture.directory,
      fetchImpl: async () =>
        new Response(Buffer.from([0xff, 0xd8, 0xff]), { status: 200 }),
      requestSpacingMs: 0,
      retryBaseDelayMs: 0,
    });

    assert.equal(summary.failed, 1);
    assert.match(summary.failures[0].message, /metadata refused/);
    assert.ok(fake.writes.includes("storage:upload"));
    assert.ok(fake.writes.includes("storage:remove"));
    assert.deepEqual(fake.removedPaths, [
      `${COLLECTION_ID}/${validEntry.id}/${validEntry.id}.jpg`,
    ]);
    assert.deepEqual(fake.clueStatuses, ["draft"]);
  } finally {
    await fixture.cleanup();
  }
});

test("rejects unresolved regions before any write", async () => {
  const fixture = await createFixture({
    ...validEntry,
    regionIds: ["FR-IDF", "FR-ARA"],
  });
  const fake = createFakeSupabase({
    regions: [{ id: "FR-IDF", country_code: "FR" }],
  });

  try {
    const summary = await runOfficialImport({
      category: { id: CATEGORY_ID, name: "Marquages au sol" },
      datasetPath: fixture.datasetPath,
      summaryFileName: "summary.json",
      authorEnvName: "SUPABASE_META_AUTHOR_ID",
      authorId: AUTHOR_ID,
      dryRun: false,
      missingImagesOnly: false,
      supabase: fake.client,
      outputDir: fixture.directory,
      fetchImpl: async () => {
        throw new Error("unresolved geography must stop before download");
      },
    });

    assert.equal(summary.failed, 1);
    assert.match(summary.failures[0].message, /FR-ARA/);
    assert.equal(fake.writes.length, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("rejects regions belonging to another country before any write", async () => {
  const fixture = await createFixture({
    ...validEntry,
    regionIds: ["FR-IDF"],
  });
  const fake = createFakeSupabase({
    regions: [{ id: "FR-IDF", country_code: "DE" }],
  });

  try {
    const summary = await runOfficialImport({
      category: { id: CATEGORY_ID, name: "Marquages au sol" },
      datasetPath: fixture.datasetPath,
      summaryFileName: "summary.json",
      authorEnvName: "SUPABASE_META_AUTHOR_ID",
      authorId: AUTHOR_ID,
      dryRun: false,
      missingImagesOnly: false,
      supabase: fake.client,
      outputDir: fixture.directory,
    });

    assert.equal(summary.failed, 1);
    assert.match(summary.failures[0].message, /FR.*FR-IDF/);
    assert.equal(fake.writes.length, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("missing-images-only skips entries that already have a primary image", async () => {
  const fixture = await createFixture();
  const fake = createFakeSupabase({
    existingClue: {
      id: validEntry.id,
      clue_images: [
        {
          id: validEntry.id,
          storage_path: `${COLLECTION_ID}/${validEntry.id}/primary.jpg`,
          sort_order: 0,
        },
      ],
    },
  });

  try {
    const summary = await runOfficialImport({
      category: { id: CATEGORY_ID, name: "Marquages au sol" },
      datasetPath: fixture.datasetPath,
      summaryFileName: "summary.json",
      authorEnvName: "SUPABASE_META_AUTHOR_ID",
      authorId: AUTHOR_ID,
      dryRun: false,
      missingImagesOnly: true,
      supabase: fake.client,
      outputDir: fixture.directory,
      fetchImpl: async () => {
        throw new Error("existing image must be skipped");
      },
    });

    assert.equal(summary.updated, 1);
    assert.equal(summary.imagesSkipped, 1);
    assert.equal(fake.writes.length, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("missing-images-only does not treat a non-primary image as primary", async () => {
  const fixture = await createFixture();
  const fake = createFakeSupabase({
    existingClue: {
      id: validEntry.id,
      clue_images: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          storage_path: `${COLLECTION_ID}/${validEntry.id}/33333333-3333-4333-8333-333333333333.jpg`,
          sort_order: 1,
        },
      ],
    },
  });
  let downloads = 0;

  try {
    const summary = await runOfficialImport({
      category: { id: CATEGORY_ID, name: "Marquages au sol" },
      datasetPath: fixture.datasetPath,
      summaryFileName: "summary.json",
      authorEnvName: "SUPABASE_META_AUTHOR_ID",
      authorId: AUTHOR_ID,
      dryRun: true,
      missingImagesOnly: true,
      supabase: fake.client,
      outputDir: fixture.directory,
      fetchImpl: async () => {
        downloads += 1;
        return new Response(Buffer.from([0xff, 0xd8, 0xff]), { status: 200 });
      },
      requestSpacingMs: 0,
      retryBaseDelayMs: 0,
    });

    assert.equal(summary.imagesImported, 1);
    assert.equal(summary.imagesSkipped, 0);
    assert.equal(downloads, 1);
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture(entry = validEntry) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "official-meta-"));
  const datasetPath = path.join(directory, "dataset.json");
  await writeFile(datasetPath, JSON.stringify([entry]), "utf8");
  return {
    directory,
    datasetPath,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

function createFakeSupabase(options = {}) {
  const writes = [];
  const reads = [];
  const clueStatuses = [];
  const clueImageUpserts = [];
  const uploadedPaths = [];
  const removedPaths = [];
  const state = {
    existingClue: options.existingClue ?? null,
    regions: options.regions ?? [],
  };

  const client = {
    from(table) {
      if (table === "collections") {
        return selectQuery(table, [{ id: COLLECTION_ID }]);
      }
      if (table === "categories") {
        return selectQuery(
          table,
          options.categoryExists === false ? [] : [{ id: CATEGORY_ID }],
        );
      }
      if (table === "countries") {
        return selectQuery(table, [{ code: "FR" }]);
      }
      if (table === "regions") {
        return selectQuery(table, state.regions);
      }
      if (table === "clues") {
        return {
          select() {
            reads.push(table);
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: state.existingClue,
                    error: null,
                  }),
                };
              },
            };
          },
          upsert(payload) {
            writes.push("clues:upsert");
            clueStatuses.push(payload.status);
            state.existingClue = {
              id: payload.id,
              clue_images: state.existingClue?.clue_images ?? [],
            };
            return Promise.resolve({ error: null });
          },
          update(payload) {
            return {
              eq: async () => {
                writes.push(`clues:update:${payload.status}`);
                clueStatuses.push(payload.status);
                return { error: null };
              },
            };
          },
        };
      }
      if (table === "clue_regions") {
        return mutationQuery(table, writes);
      }
      if (table === "clue_images") {
        return mutationQuery(table, writes, {
          upsertError: options.clueImageUpsertError,
          upserts: clueImageUpserts,
        });
      }
      throw new Error(`Unexpected table ${table}`);
    },
    storage: {
      from() {
        return {
          upload: async (storagePath) => {
            writes.push("storage:upload");
            uploadedPaths.push(storagePath);
            return { error: options.uploadError ?? null };
          },
          remove: async (storagePaths) => {
            writes.push("storage:remove");
            removedPaths.push(...storagePaths);
            return { error: null };
          },
        };
      },
    },
  };

  function selectQuery(table, data) {
    return {
      select() {
        reads.push(table);
        return {
          eq(_column, value) {
            return {
              maybeSingle: async () => ({
                data:
                  data.find(
                    (row) => row.code === value || row.id === value,
                  ) ?? null,
                error: null,
              }),
            };
          },
          in(_column, values) {
            return Promise.resolve({
              data: data.filter((row) => values.includes(row.id)),
              error: null,
            });
          },
        };
      },
    };
  }

  return {
    client,
    writes,
    reads,
    clueStatuses,
    clueImageUpserts,
    uploadedPaths,
    removedPaths,
  };
}

function mutationQuery(table, writes, options = {}) {
  const filteredDelete = {
    eq: async () => {
      writes.push(`${table}:delete`);
      return { error: null };
    },
    neq: async () => {
      writes.push(`${table}:delete`);
      return { error: null };
    },
  };
  return {
    delete() {
      return {
        eq: () => filteredDelete,
        neq: () => filteredDelete,
      };
    },
    insert: async () => {
      writes.push(`${table}:insert`);
      return { error: null };
    },
    upsert: async (payload) => {
      writes.push(`${table}:upsert`);
      options.upserts?.push(payload);
      return { error: options.upsertError ?? null };
    },
  };
}
