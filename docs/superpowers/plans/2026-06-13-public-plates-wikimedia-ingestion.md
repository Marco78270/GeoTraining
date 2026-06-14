# Public Plates Wikimedia Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import real Wikimedia Commons-backed images for the 12 existing official `Plaques` clues and show those images in Atlas ahead of the SVG fallback.

**Architecture:** Extend the curated `scripts/official-plates/plates.v1.json` dataset with explicit Wikimedia image metadata, then upgrade the official plates importer so it downloads, uploads, and upserts `clue_images` idempotently. Keep Atlas behavior simple: prefer stored images, preserve the existing SVG fallback only when no real stored image is available.

**Tech Stack:** Node.js ESM scripts, Supabase Storage + Postgres via `@supabase/supabase-js`, React + TypeScript Atlas data mapping, Vitest, Docker Compose.

---

## File Map

- Modify: `E:\GeoTraining\scripts\official-plates\plates.v1.json`
  - Extend each of the 12 official plate entries with explicit Wikimedia image metadata.
- Modify: `E:\GeoTraining\scripts\official-plates\import-official-plates.mjs`
  - Add image download, content-type sniffing, storage upload, clue image upsert, and cleanup behavior.
- Modify: `E:\GeoTraining\src\features\atlas\atlasApi.ts`
  - Keep stored-image-first behavior explicit and retain plate fallback only as a last resort.
- Modify: `E:\GeoTraining\src\features\atlas\atlasApi.test.ts`
  - Add tests proving real official plate images win over fallback and fallback still exists if no stored image is present.
- Modify: `E:\GeoTraining\README.md`
  - Document the official plate import flow, required environment variables, and rerun command.

### Task 1: Lock the Atlas image-priority behavior with tests

**Files:**
- Modify: `E:\GeoTraining\src\features\atlas\atlasApi.test.ts`
- Verify against: `E:\GeoTraining\src\features\atlas\atlasApi.ts`

- [ ] **Step 1: Write the failing test for real-image priority**

Add this test near the existing Atlas API tests:

```ts
it("prefers the stored official plate image over the SVG fallback", async () => {
  const client: AtlasDataClient = {
    listPublishedClues: vi.fn().mockResolvedValue([
      {
        id: "clue-plate-fr",
        category_id: "f1000000-0000-0000-0000-000000000003",
        country_code: "FR",
        title: "Plaque - France",
        difficulty: "easy",
        coverage: "whole_country",
        characteristics: ["Fond blanc"],
        notes: "Reference officielle",
        google_maps_url: null,
        source_name: "Wikimedia Commons",
        source_url: "https://commons.wikimedia.org/wiki/File:France_license_plate_example.jpg",
        license_name: "CC BY-SA 4.0",
        license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
        attribution_text: "Example attribution",
        categories: { name: "Plaques" },
        countries: { name: "France" },
        clue_images: [
          {
            id: "stored-plate-1",
            storage_path: "official/plate-fr.jpg",
            alt_text: "Plaque france",
            sort_order: 0,
          },
        ],
        clue_regions: [],
      },
    ]),
    createSignedImageUrls: vi.fn().mockResolvedValue({
      "official/plate-fr.jpg": "https://example.test/plate-fr.jpg",
    }),
    loadWorld: vi.fn().mockResolvedValue({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { iso2: "FR", name: "France" },
          geometry: {
            type: "Polygon",
            coordinates: [[[-5, 41], [9, 41], [9, 51], [-5, 51], [-5, 41]]],
          },
        },
      ],
    }),
  };

  const result = await createAtlasApi(client).load("collection-officielle");
  const clue = result.countries[0]?.clues[0];

  expect(clue?.imageUrls).toEqual(["https://example.test/plate-fr.jpg"]);
  expect(clue?.images[0]).toEqual(
    expect.objectContaining({
      id: "stored-plate-1",
      storagePath: "official/plate-fr.jpg",
      url: "https://example.test/plate-fr.jpg",
    }),
  );
});
```

- [ ] **Step 2: Run the targeted test to verify it fails or is unimplemented**

Run:

```bash
npm test -- src/features/atlas/atlasApi.test.ts
```

Expected: either the new test fails because the returned image does not match the stored URL, or the file still lacks the new case.

- [ ] **Step 3: Make the minimal Atlas implementation change if the new test exposes ambiguous image selection**

If needed, keep the stored-image-first branch explicit in `src/features/atlas/atlasApi.ts`:

```ts
const resolvedImages =
  atlasImages.length > 0
    ? atlasImages
    : canUseOfficialFlagFallback(clue)
      ? [/* existing flag fallback */]
      : canUseOfficialPlateFallback(clue)
        ? [/* existing plate fallback */]
        : [];
```

Do not add new behavior beyond clarifying the priority order.

- [ ] **Step 4: Run the targeted test to verify it passes**

Run:

```bash
npm test -- src/features/atlas/atlasApi.test.ts
```

Expected: PASS with the new real-image-priority test green.

- [ ] **Step 5: Commit**

```bash
git add src/features/atlas/atlasApi.ts src/features/atlas/atlasApi.test.ts
git commit -m "test: lock official plate image priority"
```

### Task 2: Add curated Wikimedia metadata to the 12 official plate entries

**Files:**
- Modify: `E:\GeoTraining\scripts\official-plates\plates.v1.json`

- [ ] **Step 1: Add image fields to one entry first**

Use this exact field shape on the France entry, then repeat for the remaining 11 entries:

```json
{
  "id": "a6b26d8f-7b5c-4613-876c-1386ec09dc65",
  "countryCode": "FR",
  "coverage": "whole_country",
  "difficulty": "easy",
  "title": "Plaque - France",
  "characteristics": [
    "Format long blanc avant et arriere",
    "Bande bleue a gauche avec l'eurobande F",
    "Bande bleue a droite avec logo regional ou departemental"
  ],
  "notes": "Tres commune en Europe occidentale. La double bande bleue est un excellent indice pour la France moderne.",
  "sourceName": "Wikimedia Commons",
  "sourceUrl": "https://commons.wikimedia.org/wiki/File:REPLACE_ME.jpg",
  "licenseName": "CC BY-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
  "attributionText": "France plate reference image from Wikimedia Commons. Replace with final credit line matching the chosen file.",
  "imageUrl": "https://upload.wikimedia.org/REPLACE_ME.jpg",
  "imageAltText": "Plaque d'immatriculation France"
}
```

- [ ] **Step 2: Repeat the same field set for all 12 entries**

Each of the 12 entries must have:

```json
"sourceName": "Wikimedia Commons",
"sourceUrl": "https://commons.wikimedia.org/wiki/File:...",
"licenseName": "...",
"licenseUrl": "...",
"attributionText": "...",
"imageUrl": "https://upload.wikimedia.org/...",
"imageAltText": "..."
```

For the three US entries, keep existing `regionIds` and `regionNames` untouched.

- [ ] **Step 3: Validate the JSON syntax**

Run:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('scripts/official-plates/plates.v1.json','utf8')); console.log('plates.v1.json OK')"
```

Expected:

```text
plates.v1.json OK
```

- [ ] **Step 4: Commit**

```bash
git add scripts/official-plates/plates.v1.json
git commit -m "data: add wikimedia metadata for official plates"
```

### Task 3: Teach the plates importer to download and store real images

**Files:**
- Modify: `E:\GeoTraining\scripts\official-plates\import-official-plates.mjs`
- Reference pattern: `E:\GeoTraining\scripts\official-flags\import-official-flags.mjs`
- Reference pattern: `E:\GeoTraining\scripts\official-bollards\import-official-bollards.mjs`

- [ ] **Step 1: Write the failing script-level behavior check**

Before changing logic, add one non-runtime assertion by syntax-checking the current script:

```bash
node --check scripts/official-plates/import-official-plates.mjs
```

Expected: PASS now. This is the baseline before behavior changes.

- [ ] **Step 2: Add image helper functions**

Add helpers following the existing flags/bollards patterns:

```js
function sniffImageFormat(buffer) {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
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
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { extension: "webp", contentType: "image/webp" };
  }

  throw new Error("Format d'image non supporte pour l'import des plaques.");
}

async function fetchImage(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image plaque indisponible (${response.status}) pour ${url}.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const detected = sniffImageFormat(buffer);
  return { buffer, ...detected };
}

function buildImagePath(clueId, imageId, extension) {
  return `${OFFICIAL_COLLECTION_ID}/${clueId}/${imageId}.${extension}`;
}
```

- [ ] **Step 3: Load existing clue images instead of clue ids only**

Replace the current `loadExistingClues()` implementation with one that returns image rows too:

```js
async function loadExistingClues() {
  const { data, error } = await supabase
    .from("clues")
    .select("id, clue_images(id, storage_path)")
    .eq("collection_id", OFFICIAL_COLLECTION_ID)
    .eq("category_id", PLATES_CATEGORY_ID);
  if (error) throw error;
  return new Map(data.map((clue) => [clue.id, clue]));
}
```

- [ ] **Step 4: Add image replacement helpers**

Add helpers to remove stale image metadata and upload the curated image:

```js
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

async function uploadImage(entry, clueId, existingImage) {
  const imageId = existingImage?.id ?? crypto.randomUUID();
  const { buffer, extension, contentType } = await fetchImage(entry.imageUrl);
  const storagePath = buildImagePath(clueId, imageId, extension);

  const { error: uploadError } = await supabase.storage
    .from("clue-images")
    .upload(storagePath, buffer, { contentType, upsert: true });
  if (uploadError) throw uploadError;

  const { error: metadataError } = await supabase.from("clue_images").upsert({
    id: imageId,
    clue_id: clueId,
    storage_path: storagePath,
    alt_text: entry.imageAltText ?? entry.title,
    sort_order: 0,
  });
  if (metadataError) throw metadataError;
}
```

- [ ] **Step 5: Update the main import loop to upsert images**

Change the loop shape so each entry:

```js
const existing = existingClues.get(entry.id);

if (DRY_RUN) {
  if (existing) summary.updated += 1;
  else summary.created += 1;
  continue;
}

await upsertClue(entry, authorId);
await replaceRegions(entry.id, resolvedRegionIds);

const previousImage = existing?.clue_images?.[0] ?? null;
await uploadImage(entry, entry.id, previousImage);

if (existing?.clue_images) {
  for (const staleImage of existing.clue_images.slice(1)) {
    await deleteImage(staleImage);
  }
}
```

If the uploaded extension changes and the previous storage path no longer matches the new one, delete the obsolete object after the successful upsert:

```js
if (previousImage && previousImage.storage_path !== storagePath) {
  await deleteImage(previousImage);
}
```

Implement this carefully so the script does not delete the only image before the replacement upload succeeds.

- [ ] **Step 6: Validate the importer syntax after the changes**

Run:

```bash
node --check scripts/official-plates/import-official-plates.mjs
```

Expected: no syntax errors.

- [ ] **Step 7: Run a dry run**

Run:

```bash
npm run plates:import -- --dry-run
```

Expected: summary with `total: 12`, zero syntax/runtime crashes, and only region/source validation failures if the dataset still contains unresolved issues.

- [ ] **Step 8: Commit**

```bash
git add scripts/official-plates/import-official-plates.mjs
git commit -m "feat: import official plate images from wikimedia"
```

### Task 4: Document the operational flow

**Files:**
- Modify: `E:\GeoTraining\README.md`

- [ ] **Step 1: Add the official plates import section**

Document the rerun flow near the existing import/setup instructions:

```md
## Import des plaques officielles

La categorie publique `Plaques` utilise un dataset local versionne dans `scripts/official-plates/plates.v1.json`.

Variables requises :

- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PLATES_AUTHOR_ID` (optionnel)

Commande de verification :

```powershell
npm run plates:import -- --dry-run
```

Import reel :

```powershell
npm run plates:import
```

Le script telecharge les images Wikimedia configurees dans le dataset, les envoie dans le bucket `clue-images`, puis met a jour les metadonnees `clue_images` et la provenance sur les indices officiels.
```

- [ ] **Step 2: Run a quick Markdown sanity check**

Run:

```bash
rg -n "Import des plaques officielles|plates:import|Wikimedia" README.md
```

Expected: the new section appears with the command names and source reference.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document official plate image import"
```

### Task 5: Full verification and deployment refresh

**Files:**
- Verify: `E:\GeoTraining\scripts\official-plates\import-official-plates.mjs`
- Verify: `E:\GeoTraining\src\features\atlas\atlasApi.ts`
- Verify: `E:\GeoTraining\src\features\atlas\atlasApi.test.ts`
- Verify: `E:\GeoTraining\README.md`

- [ ] **Step 1: Run the focused tests**

```bash
npm test -- src/features/atlas/atlasApi.test.ts
```

Expected: PASS with both official plate fallback coverage and real-image priority coverage green.

- [ ] **Step 2: Run the production build**

```bash
npm run build
```

Expected: Vite build succeeds with exit code 0.

- [ ] **Step 3: Rebuild the Docker app**

```bash
docker compose up -d --build
```

Expected: the web app container rebuilds and restarts successfully.

- [ ] **Step 4: Run the real import once the dataset URLs are finalized**

```bash
npm run plates:import
```

Expected: summary shows `total: 12` and no failures for the final curated set.

- [ ] **Step 5: Spot-check the import summary**

Inspect:

```bash
Get-Content output\\official-plates-import-summary.json
```

Expected: `created` or `updated` counts reflect the 12 official plate clues and `failed` is `0`.

- [ ] **Step 6: Final commit**

```bash
git add scripts/official-plates/plates.v1.json scripts/official-plates/import-official-plates.mjs src/features/atlas/atlasApi.ts src/features/atlas/atlasApi.test.ts README.md output/official-plates-import-summary.json
git commit -m "feat: add real official plate images"
```

## Self-Review

- Spec coverage:
  - curated Wikimedia sourcing: covered by Tasks 2 and 3
  - 12 current clues only: covered by Task 2 dataset update
  - image upload into Storage and clue image metadata: covered by Task 3
  - Atlas real-image-first behavior with fallback safety net: covered by Task 1 and Task 5
  - documentation and rerun commands: covered by Task 4
- Placeholder scan:
  - no `TODO`, `TBD`, or “similar to” shortcuts remain in the plan body
- Type consistency:
  - the plan consistently uses `imageUrl`, `imageAltText`, `clue_images`, `storage_path`, and the existing clue id-based import flow
