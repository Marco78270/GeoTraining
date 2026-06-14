import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildCluePayload,
  buildDownloadUrl,
  buildImageId,
  buildImagePath,
  fetchImage,
  runOfficialImport,
  sniffImageFormat,
  validateRemoteImageUrl,
  validateDataset,
  validateEntry,
} from "./importer.mjs";

const COLLECTION_ID = "f0000000-0000-0000-0000-000000000001";
const CATEGORY_ID = "f1000000-0000-0000-0000-000000000004";
const AUTHOR_ID = "22222222-2222-4222-8222-222222222222";
const publicLookup = async () => [
  { address: "198.51.100.10", family: 4 },
];

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

test("derives a stable version-5-compatible image UUID from clue and content", () => {
  const buffer = Buffer.from([0xff, 0xd8, 0xff, 0x01]);
  const first = buildImageId(validEntry.id, buffer);
  const same = buildImageId(validEntry.id, buffer);
  const changed = buildImageId(
    validEntry.id,
    Buffer.from([0xff, 0xd8, 0xff, 0x02]),
  );

  assert.equal(first, same);
  assert.notEqual(first, changed);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("rejects unsafe and non-HTTPS image URLs", () => {
  for (const url of [
    "http://example.com/image.jpg",
    "https://localhost/image.jpg",
    "https://127.0.0.1/image.jpg",
    "https://10.0.0.1/image.jpg",
    "https://169.254.1.2/image.jpg",
    "https://[::1]/image.jpg",
    "https://[::ffff:127.0.0.1]/image.jpg",
    "https://host.docker.internal/image.jpg",
    "https://metadata.google.internal/image.jpg",
  ]) {
    assert.throws(() => validateRemoteImageUrl(url), /interdite|HTTPS/i);
  }
  assert.equal(
    validateRemoteImageUrl("https://fcdn.example.com/image.jpg").hostname,
    "fcdn.example.com",
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
    lookupImpl: publicLookup,
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
        lookupImpl: publicLookup,
        sleepImpl: async () => {},
      },
    ),
    /404/,
  );
  assert.equal(attempts, 1);
});

test("rejects redirects to unsafe image URLs", async () => {
  await assert.rejects(
    fetchImage(
      validEntry.imageUrl,
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://127.0.0.1/private.jpg" },
        }),
      {
        attempts: 1,
        requestSpacingMs: 0,
        lookupImpl: publicLookup,
        sleepImpl: async () => {},
      },
    ),
    /interdite/i,
  );
});

test("rejects image hosts outside the strict allowlist before DNS lookup", async () => {
  let lookupCalls = 0;
  await assert.rejects(
    fetchImage(
      "https://images.example.com/photo.jpg",
      async () => new Response(Buffer.from([0xff, 0xd8, 0xff])),
      {
        attempts: 1,
        requestSpacingMs: 0,
        lookupImpl: async () => {
          lookupCalls += 1;
          return publicLookup();
        },
        sleepImpl: async () => {},
      },
    ),
    /hote.*autorise/i,
  );
  assert.equal(lookupCalls, 0);
});

test("rejects allowed image hosts resolving to private addresses", async () => {
  await assert.rejects(
    fetchImage(
      validEntry.imageUrl,
      async () => new Response(Buffer.from([0xff, 0xd8, 0xff])),
      {
        attempts: 1,
        requestSpacingMs: 0,
        lookupImpl: async () => [{ address: "10.0.0.5", family: 4 }],
        sleepImpl: async () => {},
      },
    ),
    /DNS.*interdite/i,
  );
});

test("rejects redirects to hosts outside the image allowlist", async () => {
  await assert.rejects(
    fetchImage(
      validEntry.imageUrl,
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://images.example.com/photo.jpg" },
        }),
      {
        attempts: 1,
        requestSpacingMs: 0,
        lookupImpl: publicLookup,
        sleepImpl: async () => {},
      },
    ),
    /hote.*autorise/i,
  );
});

test("cancels redirect response bodies before following Location", async () => {
  let cancelled = 0;
  let calls = 0;
  const result = await fetchImage(
    validEntry.imageUrl,
    async () => {
      calls += 1;
      if (calls === 1) {
        return responseWithCancelSpy({
          status: 302,
          headers: { Location: "https://upload.wikimedia.org/photo.jpg" },
          onCancel: () => {
            cancelled += 1;
          },
        });
      }
      return new Response(Buffer.from([0xff, 0xd8, 0xff]));
    },
    {
      attempts: 1,
      requestSpacingMs: 0,
      lookupImpl: publicLookup,
      sleepImpl: async () => {},
    },
  );
  assert.equal(result.extension, "jpg");
  assert.equal(cancelled, 1);
});

test("cancels retry and permanent HTTP error bodies", async () => {
  let retryCancelled = 0;
  let errorCancelled = 0;
  let attempts = 0;
  await fetchImage(
    validEntry.imageUrl,
    async () => {
      attempts += 1;
      if (attempts === 1) {
        return responseWithCancelSpy({
          status: 503,
          onCancel: () => {
            retryCancelled += 1;
          },
        });
      }
      return new Response(Buffer.from([0xff, 0xd8, 0xff]));
    },
    {
      attempts: 2,
      baseDelayMs: 0,
      requestSpacingMs: 0,
      lookupImpl: publicLookup,
      sleepImpl: async () => {},
    },
  );
  await assert.rejects(
    fetchImage(
      validEntry.imageUrl,
      async () =>
        responseWithCancelSpy({
          status: 404,
          onCancel: () => {
            errorCancelled += 1;
          },
        }),
      {
        attempts: 1,
        requestSpacingMs: 0,
        lookupImpl: publicLookup,
        sleepImpl: async () => {},
      },
    ),
    /404/,
  );
  assert.equal(retryCancelled, 1);
  assert.equal(errorCancelled, 1);
});

test("accepts Wikimedia hosts resolving to public addresses", async () => {
  const result = await fetchImage(
    "https://upload.wikimedia.org/photo.jpg",
    async () => new Response(Buffer.from([0xff, 0xd8, 0xff])),
    {
      attempts: 1,
      requestSpacingMs: 0,
      lookupImpl: publicLookup,
      sleepImpl: async () => {},
    },
  );
  assert.equal(result.extension, "jpg");
});

test("rejects images larger than ten MiB from headers or body", async () => {
  await assert.rejects(
    fetchImage(
      validEntry.imageUrl,
      async () =>
        new Response(Buffer.from([0xff, 0xd8, 0xff]), {
          status: 200,
          headers: { "Content-Length": String(10 * 1024 * 1024 + 1) },
        }),
      {
        attempts: 1,
        requestSpacingMs: 0,
        lookupImpl: publicLookup,
        sleepImpl: async () => {},
      },
    ),
    /10 MiB/i,
  );

  const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0);
  oversized[0] = 0xff;
  oversized[1] = 0xd8;
  oversized[2] = 0xff;
  await assert.rejects(
    fetchImage(validEntry.imageUrl, async () => new Response(oversized), {
      attempts: 1,
      requestSpacingMs: 0,
      lookupImpl: publicLookup,
      sleepImpl: async () => {},
    }),
    /10 MiB/i,
  );
});

test("cancels the response body when Content-Length exceeds the limit", async () => {
  let cancelled = 0;
  await assert.rejects(
    fetchImage(
      validEntry.imageUrl,
      async () =>
        responseWithCancelSpy({
          status: 200,
          headers: { "Content-Length": String(10 * 1024 * 1024 + 1) },
          onCancel: () => {
            cancelled += 1;
          },
        }),
      {
        attempts: 1,
        requestSpacingMs: 0,
        lookupImpl: publicLookup,
        sleepImpl: async () => {},
      },
    ),
    /10 MiB/i,
  );
  assert.equal(cancelled, 1);
});

test("aborts image downloads after the configured timeout", async () => {
  await assert.rejects(
    fetchImage(
      validEntry.imageUrl,
      async (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => {
            reject(options.signal.reason);
          });
        }),
      {
        attempts: 1,
        timeoutMs: 5,
        requestSpacingMs: 0,
        lookupImpl: publicLookup,
        sleepImpl: async () => {},
      },
    ),
    /timeout|timed out|aborted/i,
  );
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
      lookupImpl: publicLookup,
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
      lookupImpl: publicLookup,
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
      lookupImpl: publicLookup,
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
    const expectedImageId = buildImageId(
      validEntry.id,
      Buffer.from([0xff, 0xd8, 0xff]),
    );
    assert.equal(
      fake.uploadedPaths[0],
      `${COLLECTION_ID}/${validEntry.id}/${expectedImageId}.jpg`,
    );
    assert.equal(fake.clueImageUpserts[0].id, expectedImageId);
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
      lookupImpl: publicLookup,
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
      lookupImpl: publicLookup,
    });

    assert.equal(summary.failed, 1);
    assert.match(summary.failures[0].message, /metadata refused/);
    assert.ok(fake.writes.includes("storage:upload"));
    assert.ok(fake.writes.includes("storage:remove"));
    const expectedImageId = buildImageId(
      validEntry.id,
      Buffer.from([0xff, 0xd8, 0xff]),
    );
    assert.deepEqual(fake.removedPaths, [
      `${COLLECTION_ID}/${validEntry.id}/${expectedImageId}.jpg`,
    ]);
    assert.deepEqual(fake.clueStatuses, ["draft"]);
  } finally {
    await fixture.cleanup();
  }
});

test("rolls back a published clue after metadata failure without deleting its valid image", async () => {
  const fixture = await createFixture({
    ...validEntry,
    regionIds: ["FR-IDF"],
    title: "Nouveau titre",
  });
  const oldPrimaryPath =
    `${COLLECTION_ID}/${validEntry.id}/44444444-4444-4444-8444-444444444444.jpg`;
  const oldAdditionalPath =
    `${COLLECTION_ID}/${validEntry.id}/55555555-5555-4555-8555-555555555555.png`;
  const fake = createStatefulSupabase({
    clue: {
      ...buildStoredClue({
        status: "published",
        title: "Ancien titre",
        coverage: "selected_regions",
      }),
    },
    regions: ["FR-ARA"],
    images: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        clue_id: validEntry.id,
        storage_path: oldPrimaryPath,
        alt_text: "Ancienne image",
        sort_order: 0,
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        clue_id: validEntry.id,
        storage_path: oldAdditionalPath,
        alt_text: "Image additionnelle",
        sort_order: 1,
      },
    ],
    storagePaths: [oldPrimaryPath, oldAdditionalPath],
    failPrimaryMetadataOnce: true,
  });

  try {
    const summary = await runOfficialImport({
      category: { id: CATEGORY_ID, name: "Marquages au sol" },
      datasetPath: fixture.datasetPath,
      summaryFileName: "summary.json",
      authorEnvName: "SUPABASE_META_AUTHOR_ID",
      authorId: AUTHOR_ID,
      supabase: fake.client,
      outputDir: fixture.directory,
      fetchImpl: async () =>
        new Response(Buffer.from([0xff, 0xd8, 0xff, 0x42]), { status: 200 }),
      requestSpacingMs: 0,
      retryBaseDelayMs: 0,
      lookupImpl: publicLookup,
    });

    assert.equal(summary.failed, 1);
    assert.equal(fake.state.clue.status, "published");
    assert.equal(fake.state.clue.title, "Ancien titre");
    assert.deepEqual([...fake.state.regions], ["FR-ARA"]);
    assert.deepEqual(fake.state.images, [
      {
        id: "44444444-4444-4444-8444-444444444444",
        clue_id: validEntry.id,
        storage_path: oldPrimaryPath,
        alt_text: "Ancienne image",
        sort_order: 0,
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        clue_id: validEntry.id,
        storage_path: oldAdditionalPath,
        alt_text: "Image additionnelle",
        sort_order: 1,
      },
    ]);
    assert.ok(fake.state.storagePaths.has(oldPrimaryPath));
    assert.ok(fake.state.storagePaths.has(oldAdditionalPath));
    assert.equal(fake.state.storagePaths.size, 2);
  } finally {
    await fixture.cleanup();
  }
});

test("rolls back after publication failure even after primary metadata changed", async () => {
  const fixture = await createFixture();
  const oldPath =
    `${COLLECTION_ID}/${validEntry.id}/99999999-9999-4999-8999-999999999999.jpg`;
  const fake = createStatefulSupabase({
    clue: buildStoredClue({ status: "published", title: "Original" }),
    images: [
      {
        id: "99999999-9999-4999-8999-999999999999",
        clue_id: validEntry.id,
        storage_path: oldPath,
        alt_text: "Original",
        sort_order: 0,
      },
    ],
    storagePaths: [oldPath],
    failPublicationOnce: true,
  });

  try {
    const summary = await runOfficialImport({
      category: { id: CATEGORY_ID, name: "Marquages au sol" },
      datasetPath: fixture.datasetPath,
      summaryFileName: "summary.json",
      authorEnvName: "SUPABASE_META_AUTHOR_ID",
      authorId: AUTHOR_ID,
      supabase: fake.client,
      outputDir: fixture.directory,
      fetchImpl: async () =>
        new Response(Buffer.from([0xff, 0xd8, 0xff, 0x55]), { status: 200 }),
      requestSpacingMs: 0,
      retryBaseDelayMs: 0,
      lookupImpl: publicLookup,
    });

    assert.equal(summary.failed, 1);
    assert.equal(fake.state.clue.status, "published");
    assert.equal(fake.state.clue.title, "Original");
    assert.equal(fake.state.images.length, 1);
    assert.equal(fake.state.images[0].storage_path, oldPath);
    assert.deepEqual([...fake.state.storagePaths], [oldPath]);
  } finally {
    await fixture.cleanup();
  }
});

test("reports post-publication cleanup failures as warnings", async () => {
  const fixture = await createFixture();
  const oldPrimaryPath =
    `${COLLECTION_ID}/${validEntry.id}/66666666-6666-4666-8666-666666666666.jpg`;
  const additionalPath =
    `${COLLECTION_ID}/${validEntry.id}/77777777-7777-4777-8777-777777777777.webp`;
  const fake = createStatefulSupabase({
    clue: buildStoredClue({ status: "published" }),
    images: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        clue_id: validEntry.id,
        storage_path: oldPrimaryPath,
        alt_text: "Old",
        sort_order: 0,
      },
      {
        id: "77777777-7777-4777-8777-777777777777",
        clue_id: validEntry.id,
        storage_path: additionalPath,
        alt_text: "Extra",
        sort_order: 1,
      },
    ],
    storagePaths: [oldPrimaryPath, additionalPath],
    storageRemoveFailures: [oldPrimaryPath, additionalPath],
  });

  try {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const summary = await runOfficialImport({
      category: { id: CATEGORY_ID, name: "Marquages au sol" },
      datasetPath: fixture.datasetPath,
      summaryFileName: "summary.json",
      authorEnvName: "SUPABASE_META_AUTHOR_ID",
      authorId: AUTHOR_ID,
      supabase: fake.client,
      outputDir: fixture.directory,
      fetchImpl: async () => new Response(png, { status: 200 }),
      requestSpacingMs: 0,
      retryBaseDelayMs: 0,
      lookupImpl: publicLookup,
    });

    const newImageId = buildImageId(validEntry.id, png);
    assert.equal(summary.failed, 0);
    assert.equal(summary.updated, 1);
    assert.equal(summary.warnings.length, 2);
    assert.equal(fake.state.clue.status, "published");
    assert.equal(fake.state.images.length, 1);
    assert.equal(fake.state.images[0].id, newImageId);
    assert.equal(
      fake.state.images[0].storage_path,
      `${COLLECTION_ID}/${validEntry.id}/${newImageId}.png`,
    );
    assert.ok(fake.state.storagePaths.has(oldPrimaryPath));
    assert.ok(fake.state.storagePaths.has(additionalPath));
  } finally {
    await fixture.cleanup();
  }
});

test("reimports identical content idempotently with one primary object", async () => {
  const fixture = await createFixture();
  const fake = createStatefulSupabase();
  const image = Buffer.from([0xff, 0xd8, 0xff, 0x33]);
  const importOptions = {
    category: { id: CATEGORY_ID, name: "Marquages au sol" },
    datasetPath: fixture.datasetPath,
    summaryFileName: "summary.json",
    authorEnvName: "SUPABASE_META_AUTHOR_ID",
    authorId: AUTHOR_ID,
    supabase: fake.client,
    outputDir: fixture.directory,
    fetchImpl: async () => new Response(image, { status: 200 }),
    requestSpacingMs: 0,
    retryBaseDelayMs: 0,
    lookupImpl: publicLookup,
  };

  try {
    const first = await runOfficialImport(importOptions);
    const second = await runOfficialImport(importOptions);
    const imageId = buildImageId(validEntry.id, image);
    const expectedPath =
      `${COLLECTION_ID}/${validEntry.id}/${imageId}.jpg`;

    assert.equal(first.created, 1);
    assert.equal(second.updated, 1);
    assert.equal(second.failed, 0);
    assert.equal(fake.state.images.length, 1);
    assert.equal(fake.state.images[0].id, imageId);
    assert.deepEqual([...fake.state.storagePaths], [expectedPath]);
  } finally {
    await fixture.cleanup();
  }
});

test("can replace regional coverage with whole-country coverage", async () => {
  const fixture = await createFixture(validEntry);
  const oldPath =
    `${COLLECTION_ID}/${validEntry.id}/88888888-8888-4888-8888-888888888888.jpg`;
  const fake = createStatefulSupabase({
    clue: buildStoredClue({
      coverage: "selected_regions",
      status: "published",
    }),
    regions: ["FR-IDF"],
    images: [
      {
        id: "88888888-8888-4888-8888-888888888888",
        clue_id: validEntry.id,
        storage_path: oldPath,
        alt_text: "Old",
        sort_order: 0,
      },
    ],
    storagePaths: [oldPath],
    enforceGeographyConstraint: true,
  });

  try {
    const summary = await runOfficialImport({
      category: { id: CATEGORY_ID, name: "Marquages au sol" },
      datasetPath: fixture.datasetPath,
      summaryFileName: "summary.json",
      authorEnvName: "SUPABASE_META_AUTHOR_ID",
      authorId: AUTHOR_ID,
      supabase: fake.client,
      outputDir: fixture.directory,
      fetchImpl: async () =>
        new Response(Buffer.from([0xff, 0xd8, 0xff, 0x44]), { status: 200 }),
      requestSpacingMs: 0,
      retryBaseDelayMs: 0,
      lookupImpl: publicLookup,
    });

    assert.equal(summary.failed, 0);
    assert.equal(fake.state.clue.coverage, "whole_country");
    assert.deepEqual([...fake.state.regions], []);
  } finally {
    await fixture.cleanup();
  }
});

test("restores selected-region coverage after a failed whole-country import", async () => {
  const fixture = await createFixture(validEntry);
  const oldPath =
    `${COLLECTION_ID}/${validEntry.id}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`;
  const fake = createStatefulSupabase({
    clue: buildStoredClue({
      coverage: "selected_regions",
      status: "published",
      title: "Regional original",
    }),
    regions: ["FR-IDF"],
    images: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        clue_id: validEntry.id,
        storage_path: oldPath,
        alt_text: "Regional original",
        sort_order: 0,
      },
    ],
    storagePaths: [oldPath],
    enforceGeographyConstraint: true,
    failPublicationOnce: true,
  });

  try {
    const summary = await runOfficialImport({
      category: { id: CATEGORY_ID, name: "Marquages au sol" },
      datasetPath: fixture.datasetPath,
      summaryFileName: "summary.json",
      authorEnvName: "SUPABASE_META_AUTHOR_ID",
      authorId: AUTHOR_ID,
      supabase: fake.client,
      outputDir: fixture.directory,
      fetchImpl: async () =>
        new Response(Buffer.from([0xff, 0xd8, 0xff, 0x66]), { status: 200 }),
      requestSpacingMs: 0,
      retryBaseDelayMs: 0,
      lookupImpl: publicLookup,
    });

    assert.equal(summary.failed, 1);
    assert.equal(fake.state.clue.status, "published");
    assert.equal(fake.state.clue.coverage, "selected_regions");
    assert.equal(fake.state.clue.title, "Regional original");
    assert.deepEqual([...fake.state.regions], ["FR-IDF"]);
    assert.equal(fake.state.images.length, 1);
    assert.equal(fake.state.images[0].storage_path, oldPath);
    assert.deepEqual([...fake.state.storagePaths], [oldPath]);
  } finally {
    await fixture.cleanup();
  }
});

test("does not republish when a critical rollback step fails", async () => {
  const fixture = await createFixture(validEntry);
  const oldPath =
    `${COLLECTION_ID}/${validEntry.id}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg`;
  const fake = createStatefulSupabase({
    clue: buildStoredClue({
      coverage: "selected_regions",
      status: "published",
    }),
    regions: ["FR-IDF"],
    images: [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        clue_id: validEntry.id,
        storage_path: oldPath,
        alt_text: "Old",
        sort_order: 0,
      },
    ],
    storagePaths: [oldPath],
    failPublicationOnce: true,
    failRegionRestoreOnce: true,
  });

  try {
    const summary = await runOfficialImport({
      category: { id: CATEGORY_ID, name: "Marquages au sol" },
      datasetPath: fixture.datasetPath,
      summaryFileName: "summary.json",
      authorEnvName: "SUPABASE_META_AUTHOR_ID",
      authorId: AUTHOR_ID,
      supabase: fake.client,
      outputDir: fixture.directory,
      fetchImpl: async () =>
        new Response(Buffer.from([0xff, 0xd8, 0xff, 0x77])),
      requestSpacingMs: 0,
      retryBaseDelayMs: 0,
      lookupImpl: publicLookup,
    });
    assert.equal(summary.failed, 1);
    assert.match(summary.failures[0].message, /restauration impossible/i);
    assert.equal(fake.state.clue.status, "draft");
    assert.equal(fake.publishedUpdateCount, 1);
  } finally {
    await fixture.cleanup();
  }
});

test("does not republish when removing the new rollback object fails", async () => {
  const fixture = await createFixture(validEntry);
  const oldPath =
    `${COLLECTION_ID}/${validEntry.id}/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg`;
  const uploadedImage = Buffer.from([0xff, 0xd8, 0xff, 0x88]);
  const uploadedImageId = buildImageId(validEntry.id, uploadedImage);
  const uploadedPath =
    `${COLLECTION_ID}/${validEntry.id}/${uploadedImageId}.jpg`;
  const fake = createStatefulSupabase({
    clue: buildStoredClue({ status: "published" }),
    images: [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        clue_id: validEntry.id,
        storage_path: oldPath,
        alt_text: "Old",
        sort_order: 0,
      },
    ],
    storagePaths: [oldPath],
    failPublicationOnce: true,
    storageRemoveFailures: [uploadedPath],
  });

  try {
    const summary = await runOfficialImport({
      category: { id: CATEGORY_ID, name: "Marquages au sol" },
      datasetPath: fixture.datasetPath,
      summaryFileName: "summary.json",
      authorEnvName: "SUPABASE_META_AUTHOR_ID",
      authorId: AUTHOR_ID,
      supabase: fake.client,
      outputDir: fixture.directory,
      fetchImpl: async () => new Response(uploadedImage),
      requestSpacingMs: 0,
      retryBaseDelayMs: 0,
      lookupImpl: publicLookup,
    });
    assert.equal(summary.failed, 1);
    assert.match(summary.failures[0].message, /restauration impossible/i);
    assert.equal(fake.state.clue.status, "draft");
    assert.equal(fake.publishedUpdateCount, 1);
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
      lookupImpl: publicLookup,
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

function responseWithCancelSpy({ status, headers, onCancel }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    body: {
      cancel: async () => {
        onCancel();
      },
    },
    arrayBuffer: async () => new ArrayBuffer(0),
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
          delete() {
            return {
              eq: async () => {
                writes.push("clues:delete");
                state.existingClue = null;
                return { error: null };
              },
            };
          },
        };
      }
      if (table === "clue_regions") {
        return {
          ...mutationQuery(table, writes),
          select() {
            reads.push(table);
            return {
              eq: async () => ({ data: [], error: null }),
            };
          },
        };
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

function buildStoredClue(overrides = {}) {
  return {
    id: validEntry.id,
    collection_id: COLLECTION_ID,
    category_id: CATEGORY_ID,
    country_code: validEntry.countryCode,
    coverage: "whole_country",
    difficulty: validEntry.difficulty,
    status: "published",
    title: validEntry.title,
    characteristics: [...validEntry.characteristics],
    notes: validEntry.notes,
    source_name: validEntry.sourceName,
    source_url: validEntry.sourceUrl,
    license_name: validEntry.licenseName,
    license_url: validEntry.licenseUrl,
    attribution_text: validEntry.attributionText,
    author_id: AUTHOR_ID,
    ...overrides,
  };
}

function createStatefulSupabase(options = {}) {
  const state = {
    clue: options.clue ? structuredClone(options.clue) : null,
    regions: new Set(options.regions ?? []),
    images: structuredClone(options.images ?? []),
    storagePaths: new Set(options.storagePaths ?? []),
  };
  let failPrimaryMetadataOnce = options.failPrimaryMetadataOnce ?? false;
  let failPublicationOnce = options.failPublicationOnce ?? false;
  let failRegionRestoreOnce = options.failRegionRestoreOnce ?? false;
  let publishedUpdateCount = 0;
  const storageRemoveFailures = new Set(options.storageRemoveFailures ?? []);

  const client = {
    from(table) {
      if (["collections", "categories", "countries", "regions"].includes(table)) {
        return geographyQuery(table);
      }
      if (table === "clues") return cluesQuery();
      if (table === "clue_regions") return clueRegionsQuery();
      if (table === "clue_images") return clueImagesQuery();
      throw new Error(`Unexpected table ${table}`);
    },
    storage: {
      from() {
        return {
          upload: async (storagePath) => {
            state.storagePaths.add(storagePath);
            return { error: null };
          },
          remove: async (paths) => {
            const failed = paths.find((item) => storageRemoveFailures.has(item));
            if (failed) return { error: { message: `cleanup failed: ${failed}` } };
            for (const item of paths) state.storagePaths.delete(item);
            return { error: null };
          },
        };
      },
    },
  };

  function geographyQuery(table) {
    const rows = {
      collections: [{ id: COLLECTION_ID }],
      categories: [{ id: CATEGORY_ID }],
      countries: [{ code: "FR" }],
      regions: [
        { id: "FR-IDF", country_code: "FR" },
        { id: "FR-ARA", country_code: "FR" },
      ],
    }[table];
    return {
      select() {
        return {
          eq(_column, value) {
            return {
              maybeSingle: async () => ({
                data:
                  rows.find((row) => row.id === value || row.code === value) ??
                  null,
                error: null,
              }),
            };
          },
          in(_column, values) {
            return Promise.resolve({
              data: rows.filter((row) => values.includes(row.id)),
              error: null,
            });
          },
        };
      },
    };
  }

  function cluesQuery() {
    return {
      select() {
        return {
          eq() {
            return {
              maybeSingle: async () => ({
                data: state.clue
                  ? {
                      ...structuredClone(state.clue),
                      clue_images: structuredClone(state.images),
                    }
                  : null,
                error: null,
              }),
            };
          },
        };
      },
      upsert: async (payload) => {
        if (
          options.enforceGeographyConstraint &&
          payload.coverage === "whole_country" &&
          state.regions.size > 0
        ) {
          return {
            error: {
              message: "whole-country clues cannot have selected regions",
            },
          };
        }
        state.clue = structuredClone(payload);
        return { error: null };
      },
      update(payload) {
        return {
          eq: async () => {
            if (
              options.enforceGeographyConstraint &&
              payload.coverage === "selected_regions" &&
              state.clue?.coverage === "whole_country" &&
              state.regions.size > 0
            ) {
              return {
                error: {
                  message: "whole-country clues cannot have selected regions",
                },
              };
            }
            if (payload.status === "published" && failPublicationOnce) {
              publishedUpdateCount += 1;
              failPublicationOnce = false;
              return { error: { message: "publication refused" } };
            }
            if (payload.status === "published") publishedUpdateCount += 1;
            state.clue = { ...state.clue, ...structuredClone(payload) };
            return { error: null };
          },
        };
      },
      delete() {
        return {
          eq: async () => {
            state.clue = null;
            state.regions.clear();
            state.images = [];
            return { error: null };
          },
        };
      },
    };
  }

  function clueRegionsQuery() {
    return {
      select() {
        return {
          eq: async () => ({
            data: [...state.regions].map((region_id) => ({ region_id })),
            error: null,
          }),
        };
      },
      delete() {
        return {
          eq: async () => {
            state.regions.clear();
            return { error: null };
          },
        };
      },
      insert: async (rows) => {
        if (failRegionRestoreOnce) {
          failRegionRestoreOnce = false;
          return { error: { message: "region restore refused" } };
        }
        if (
          options.enforceGeographyConstraint &&
          state.clue?.coverage !== "selected_regions"
        ) {
          return {
            error: {
              message: "whole-country clues cannot have selected regions",
            },
          };
        }
        for (const row of rows) state.regions.add(row.region_id);
        return { error: null };
      },
    };
  }

  function clueImagesQuery() {
    return {
      upsert: async (payload) => {
        if (failPrimaryMetadataOnce) {
          failPrimaryMetadataOnce = false;
          return { error: { message: "metadata refused" } };
        }
        state.images = [
          ...state.images.filter((image) => image.sort_order !== payload.sort_order),
          structuredClone(payload),
        ].sort((left, right) => left.sort_order - right.sort_order);
        return { error: null };
      },
      insert: async (rows) => {
        state.images.push(...structuredClone(Array.isArray(rows) ? rows : [rows]));
        state.images.sort((left, right) => left.sort_order - right.sort_order);
        return { error: null };
      },
      delete() {
        let clueId = null;
        const chain = {
          eq(column, value) {
            if (column === "clue_id") clueId = value;
            if (column === "id") {
              state.images = state.images.filter((image) => image.id !== value);
              return Promise.resolve({ error: null });
            }
            return chain;
          },
          neq(column, value) {
            state.images = state.images.filter(
              (image) =>
                image.clue_id !== clueId || image[column] === value,
            );
            return Promise.resolve({ error: null });
          },
          then(resolve) {
            state.images = state.images.filter(
              (image) => image.clue_id !== clueId,
            );
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
        return chain;
      },
    };
  }

  return {
    client,
    state,
    get publishedUpdateCount() {
      return publishedUpdateCount;
    },
  };
}
