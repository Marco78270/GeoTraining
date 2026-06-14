# Public Plates Expansion Europe and US Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the official public `Plaques` category from the initial 12 curated clues to a broad reference set covering European country plates and all 50 US state plates with real imported images, provenance metadata, and consistent Atlas behavior.

**Architecture:** Keep the current repo-versioned ingestion model. Extend `scripts/official-plates/plates.v1.json` into a much larger curated dataset, keep `scripts/official-plates/import-official-plates.mjs` as the single importer, and reuse existing Atlas rendering so official plates continue to flow through the same clue/image pipeline as flags and bollards.

**Tech Stack:** Node.js ESM scripts, Supabase Postgres + Storage via `@supabase/supabase-js`, React + TypeScript Atlas data mapping, Vitest, Docker Compose.

---

## File Map

- Modify: `E:\GeoTraining\scripts\official-plates\plates.v1.json`
  - Expand the official plate dataset with Europe-wide country entries and all 50 US state entries.
- Modify: `E:\GeoTraining\scripts\official-plates\import-official-plates.mjs`
  - Keep the importer idempotent and resilient for the larger dataset, including clearer failure reporting and safe reruns.
- Modify: `E:\GeoTraining\README.md`
  - Document the expanded official plates workflow and rerun expectations.
- Modify: `E:\GeoTraining\src\features\atlas\atlasApi.test.ts`
  - Keep official plate image priority and fallback behavior protected as the dataset grows.
- Verify: `E:\GeoTraining\public\geography\regions\US.geojson`
  - Reference only; confirm region id format still matches the dataset.
- Verify: `E:\GeoTraining\output\official-plates-import-summary.json`
  - Inspect import outcomes after the real run.

### Task 1: Lock the current importer and Atlas baseline before expanding the dataset

**Files:**
- Verify: `E:\GeoTraining\scripts\official-plates\import-official-plates.mjs`
- Verify: `E:\GeoTraining\src\features\atlas\atlasApi.test.ts`

- [ ] **Step 1: Syntax-check the current plates importer**

Run:

```bash
node --check scripts/official-plates/import-official-plates.mjs
```

Expected: no syntax errors.

- [ ] **Step 2: Run the Atlas plate tests as the current baseline**

Run:

```bash
npm test -- src/features/atlas/atlasApi.test.ts
```

Expected: PASS, including the stored-image-first official plate behavior already introduced.

- [ ] **Step 3: Commit only if baseline fixes were needed**

```bash
git add scripts/official-plates/import-official-plates.mjs src/features/atlas/atlasApi.test.ts
git commit -m "test: stabilize plates expansion baseline"
```

Only commit if Step 1 or Step 2 revealed a real issue that needed a fix.

### Task 2: Build the expanded curated dataset structure

**Files:**
- Modify: `E:\GeoTraining\scripts\official-plates\plates.v1.json`

- [ ] **Step 1: Preserve the existing entry schema exactly**

Every new entry added to `plates.v1.json` must follow this shape:

```json
{
  "id": "11111111-2222-4333-8444-555555555555",
  "countryCode": "FR",
  "coverage": "whole_country",
  "difficulty": "easy",
  "title": "Plaque - France",
  "characteristics": [
    "Format representatif",
    "Couleurs distinctives",
    "Indice visuel utile en GeoGuessr"
  ],
  "notes": "Court texte editorial utile a l'apprentissage.",
  "sourceName": "Wikimedia Commons",
  "sourceUrl": "https://commons.wikimedia.org/wiki/File:Example.jpg",
  "licenseName": "See Wikimedia Commons file page",
  "licenseUrl": "https://commons.wikimedia.org/wiki/File:Example.jpg",
  "attributionText": "Example attribution from Wikimedia Commons file page.",
  "imageUrl": "https://commons.wikimedia.org/wiki/Special:FilePath/Example.jpg",
  "imageAltText": "Plaque d'immatriculation France"
}
```

For US state entries, add `regionIds` and `regionNames`:

```json
"coverage": "selected_regions",
"regionIds": ["US-CA"],
"regionNames": ["California"]
```

- [ ] **Step 2: Add Europe country-level entries**

Add one entry per supported European country where a representative national plate clue is useful.

Use this editorial checklist for each entry:

- country exists in Supabase `countries`;
- title uses `Plaque - <Country>`;
- `coverage` is `whole_country`;
- difficulty is one of `easy`, `medium`, `hard`;
- image is open-license and representative;
- characteristics are concise and training-oriented;
- notes explain the actual GeoGuessr value, not generic trivia.

Expected result after this step: the dataset contains the original 12 entries plus a substantially larger set of European country entries.

- [ ] **Step 3: Add all 50 US state entries**

For every US state:

- `countryCode` must be `US`;
- `coverage` must be `selected_regions`;
- `regionIds` must contain exactly one state id such as `US-TX`;
- `regionNames` must match the state label used in the geography dataset;
- difficulty must reflect recognizability of the plate, not state fame.

Use stable UUIDs for every new state clue rather than slug ids, to remain compatible with the existing `clues.id` type.

- [ ] **Step 4: Validate the JSON syntax**

Run:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('scripts/official-plates/plates.v1.json','utf8')); console.log('plates.v1.json OK')"
```

Expected:

```text
plates.v1.json OK
```

- [ ] **Step 5: Commit the expanded dataset**

```bash
git add scripts/official-plates/plates.v1.json
git commit -m "data: expand official plates dataset for europe and us"
```

### Task 3: Make the importer robust for the larger official plates batch

**Files:**
- Modify: `E:\GeoTraining\scripts\official-plates\import-official-plates.mjs`

- [ ] **Step 1: Keep existing image import behavior intact**

Preserve these invariants while editing:

```js
const existing = existingClues.get(entry.id);
await upsertClue(entry, authorId);
await replaceRegions(entry.id, resolvedRegionIds);
const previousImage = existing?.clue_images?.[0] ?? null;
```

The expansion should improve robustness, not change the public data model.

- [ ] **Step 2: Add clearer region resolution failures for large US coverage**

If the importer currently throws a generic region resolution error, shape it like this:

```js
throw new Error(
  `Aucune region resolue pour ${entry.id}. Verifiez les IDs ou noms de regions.`,
);
```

For single-state entries, include the requested region id in the message when possible:

```js
throw new Error(
  `Region inconnue dans le dataset: ${regionId}.`,
);
```

Expected outcome: failed US states are easy to repair from the summary output.

- [ ] **Step 3: Keep retry and backoff active for upstream images**

Preserve or clarify the existing retry flow:

```js
const FETCH_RETRY_ATTEMPTS = 4;
const FETCH_RETRY_BASE_DELAY_MS = 1200;
```

and:

```js
function shouldRetryStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}
```

Do not lower resilience here; the larger batch increases the chance of `429` responses.

- [ ] **Step 4: Confirm the importer still removes stale duplicate images safely**

The loop should continue to:

```js
if (existing?.clue_images) {
  for (const staleImage of existing.clue_images.slice(1)) {
    await deleteImage(staleImage);
  }
}
```

and must not delete the primary image before the replacement upload succeeds.

- [ ] **Step 5: Syntax-check the importer after edits**

Run:

```bash
node --check scripts/official-plates/import-official-plates.mjs
```

Expected: no syntax errors.

- [ ] **Step 6: Commit the importer hardening**

```bash
git add scripts/official-plates/import-official-plates.mjs
git commit -m "feat: harden official plates importer for large batch"
```

### Task 4: Keep Atlas behavior protected while the public category grows

**Files:**
- Modify: `E:\GeoTraining\src\features\atlas\atlasApi.test.ts`
- Verify against: `E:\GeoTraining\src\features\atlas\atlasApi.ts`

- [ ] **Step 1: Add one regression test for a stored official plate image**

Use a test in this style:

```ts
it("prefers a stored official plate image when the collection grows", async () => {
  const client: AtlasDataClient = {
    listPublishedClues: vi.fn().mockResolvedValue([
      {
        id: "clue-plate-texas",
        category_id: "f1000000-0000-0000-0000-000000000003",
        country_code: "US",
        title: "Plaque - United States - Texas",
        difficulty: "medium",
        coverage: "selected_regions",
        characteristics: ["Fond blanc"],
        notes: "Reference officielle",
        google_maps_url: null,
        source_name: "Wikimedia Commons",
        source_url: "https://commons.wikimedia.org/wiki/File:Texas_example.png",
        license_name: "See Wikimedia Commons file page",
        license_url: "https://commons.wikimedia.org/wiki/File:Texas_example.png",
        attribution_text: "Example attribution",
        categories: { name: "Plaques" },
        countries: { name: "United States" },
        clue_images: [
          {
            id: "stored-texas-1",
            storage_path: "official/plate-texas.png",
            alt_text: "Texas plate",
            sort_order: 0
          }
        ],
        clue_regions: []
      }
    ]),
    createSignedImageUrls: vi.fn().mockResolvedValue({
      "official/plate-texas.png": "https://example.test/plate-texas.png"
    }),
    loadWorld: vi.fn().mockResolvedValue({
      type: "FeatureCollection",
      features: []
    })
  };

  const atlas = await createAtlasApi(client).load("collection-officielle");
  expect(atlas.countries[0]?.clues[0]?.imageUrls).toEqual([
    "https://example.test/plate-texas.png"
  ]);
});
```

- [ ] **Step 2: Run the targeted Atlas test file**

Run:

```bash
npm test -- src/features/atlas/atlasApi.test.ts
```

Expected: PASS with both fallback and stored-image tests green.

- [ ] **Step 3: Commit only if the test exposed an implementation gap**

```bash
git add src/features/atlas/atlasApi.ts src/features/atlas/atlasApi.test.ts
git commit -m "test: protect atlas behavior for expanded official plates"
```

Commit only if a code or test change was needed.

### Task 5: Run the expanded import in controlled phases

**Files:**
- Verify: `E:\GeoTraining\scripts\official-plates\plates.v1.json`
- Verify: `E:\GeoTraining\output\official-plates-import-summary.json`

- [ ] **Step 1: Run a dry run against the expanded dataset**

Run:

```bash
npm run plates:import -- --dry-run
```

Expected: summary prints the expanded `total`, with no JSON or script crashes. Allowed failures at this stage are only data-resolution issues such as missing `regions` rows or broken source mappings.

- [ ] **Step 2: Inspect the dry-run summary for missing regions**

Run:

```bash
Get-Content output\official-plates-import-summary.json
```

Expected: any unresolved US states are clearly listed by region id so the dataset or database can be repaired.

- [ ] **Step 3: Run the real import**

Run:

```bash
npm run plates:import
```

Expected: summary shows a large number of `created` and `updated` entries and only a manageable set of failures, ideally zero after final curation.

- [ ] **Step 4: Inspect the real import summary**

Run:

```bash
Get-Content output\official-plates-import-summary.json
```

Expected: failures, if any, are actionable and attributable to specific countries or states.

- [ ] **Step 5: Commit the import summary only if the repository policy wants generated evidence tracked**

```bash
git add output/official-plates-import-summary.json
git commit -m "chore: record official plates import summary"
```

Skip this commit if generated summaries are normally left out of git in this repo.

### Task 6: Document the expanded official plates workflow

**Files:**
- Modify: `E:\GeoTraining\README.md`

- [ ] **Step 1: Add or update the public plates section**

Document:

- the purpose of the official `Plaques` category;
- where the dataset lives;
- the required environment variables;
- the dry-run and real import commands;
- the fact that the batch now includes Europe and the 50 US states;
- the need to rerun after fixing upstream source or region issues.

Use this shape:

```md
## Collection publique des plaques

La collection officielle `Plaques` est alimentee par le dataset versionne `scripts/official-plates/plates.v1.json`.

Le dataset couvre les pays europeens pris en charge par l'application ainsi que les 50 Etats americains.

Variables requises :

- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PLATES_AUTHOR_ID` (optionnel)

Verification sans ecriture :

```powershell
npm run plates:import -- --dry-run
```

Import reel :

```powershell
npm run plates:import
```
```

- [ ] **Step 2: Sanity-check the README section**

Run:

```bash
rg -n "Collection publique des plaques|plates:import|50 Etats|Europe" README.md
```

Expected: the updated documentation appears in a single coherent section.

- [ ] **Step 3: Commit the README update**

```bash
git add README.md
git commit -m "docs: describe expanded official plates import"
```

### Task 7: Final verification and rebuild

**Files:**
- Verify: `E:\GeoTraining\scripts\official-plates\import-official-plates.mjs`
- Verify: `E:\GeoTraining\src\features\atlas\atlasApi.test.ts`
- Verify: `E:\GeoTraining\README.md`

- [ ] **Step 1: Re-run the focused test**

```bash
npm test -- src/features/atlas/atlasApi.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the production build**

```bash
npm run build
```

Expected: build succeeds with exit code 0.

- [ ] **Step 3: Rebuild the Docker app**

```bash
docker compose up -d --build
```

Expected: the app rebuilds and the containers restart successfully.

- [ ] **Step 4: Final commit for any remaining code and data changes**

```bash
git add scripts/official-plates/plates.v1.json scripts/official-plates/import-official-plates.mjs src/features/atlas/atlasApi.ts src/features/atlas/atlasApi.test.ts README.md
git commit -m "feat: expand official plates across europe and us"
```

## Self-Review

- Spec coverage:
  - Europe country-level expansion: covered by Task 2
  - all 50 US states: covered by Task 2 and Task 5
  - difficulty assignment: covered by Task 2 editorial checklist
  - resilient importer behavior: covered by Task 3 and Task 5
  - Atlas stability: covered by Task 4 and Task 7
  - docs and rerun flow: covered by Task 6
- Placeholder scan:
  - no `TODO`, `TBD`, or vague "implement later" markers remain
  - commands and target files are concrete
- Type consistency:
  - dataset fields consistently use `countryCode`, `coverage`, `regionIds`, `regionNames`, `imageUrl`, and provenance keys already used by the current importer
