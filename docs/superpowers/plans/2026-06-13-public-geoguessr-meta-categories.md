# Public GeoGuessr Meta Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three image-backed categories to the public official collection: road markings, utility poles, and Google Car clues for frequently encountered GeoGuessr countries and relevant regions.

**Architecture:** Add the three categories through one idempotent migration. Build a small shared Node.js ingestion library for dataset validation, country/region resolution, image downloading, Supabase Storage upload, and clue reconciliation; keep one thin command and one versioned JSON dataset per category. Existing Atlas, training, and statistics data flows remain unchanged except for registering the `car` icon.

**Tech Stack:** Node.js ESM, Supabase Postgres and Storage, `@supabase/supabase-js`, React 19, TypeScript, Lucide React, Vitest, Node test runner, Docker Compose.

---

## File Map

- Create through Supabase CLI: timestamped `supabase/migrations/*_add_official_meta_categories.sql`
  - Insert the three categories into the existing official collection.
- Create: `scripts/official-meta/importer.mjs`
  - Shared validation and import workflow.
- Create: `scripts/official-meta/importer.test.mjs`
  - Unit tests for dataset validation, coverage, image requirements, paths, and summary behavior.
- Create: `scripts/official-road-markings/import-official-road-markings.mjs`
- Create: `scripts/official-road-markings/road-markings.v1.json`
- Create: `scripts/official-utility-poles/import-official-utility-poles.mjs`
- Create: `scripts/official-utility-poles/utility-poles.v1.json`
- Create: `scripts/official-google-car/import-official-google-car.mjs`
- Create: `scripts/official-google-car/google-car.v1.json`
- Modify: `package.json`
  - Add import and test commands.
- Modify: `src/features/atlas/AtlasPage.tsx`
  - Register the `car` icon.
- Modify: `src/features/atlas/AtlasPage.test.tsx`
  - Protect category icon rendering.
- Modify: `README.md`
  - Document datasets, commands, variables, licensing, and safe production workflow.
- Verify: `output/official-road-markings-import-summary.json`
- Verify: `output/official-utility-poles-import-summary.json`
- Verify: `output/official-google-car-import-summary.json`

## Stable Identifiers

```js
export const OFFICIAL_COLLECTION_ID =
  "f0000000-0000-0000-0000-000000000001";

export const OFFICIAL_META_CATEGORIES = {
  roadMarkings: {
    id: "f1000000-0000-0000-0000-000000000004",
    name: "Marquages au sol",
    icon: "road",
    color: "#F2C94C",
  },
  utilityPoles: {
    id: "f1000000-0000-0000-0000-000000000005",
    name: "Poteaux électriques",
    icon: "pole",
    color: "#A78BFA",
  },
  googleCar: {
    id: "f1000000-0000-0000-0000-000000000006",
    name: "Google Car",
    icon: "car",
    color: "#38BDF8",
  },
};
```

### Task 1: Add the official categories migration

**Files:**
- Create through Supabase CLI: timestamped `supabase/migrations/*_add_official_meta_categories.sql`
- Test: `scripts/validate-migrations.test.mjs`

- [ ] **Step 1: Generate the migration filename through Supabase CLI**

Run:

```powershell
npx supabase migration new add_official_meta_categories
```

Expected: one new timestamped SQL file under `supabase/migrations`.

- [ ] **Step 2: Write a failing migration validation assertion**

Add the generated filename to the expected migration set in `scripts/validate-migrations.test.mjs`, and assert the SQL contains all three category UUIDs and `on conflict (id) do update`.

- [ ] **Step 3: Run the migration test**

Run:

```powershell
npm run test:migrations
```

Expected: FAIL because the generated migration is empty.

- [ ] **Step 4: Insert the categories idempotently**

Use:

```sql
insert into public.categories (id, collection_id, name, icon, color)
values
  (
    'f1000000-0000-0000-0000-000000000004',
    'f0000000-0000-0000-0000-000000000001',
    'Marquages au sol',
    'road',
    '#F2C94C'
  ),
  (
    'f1000000-0000-0000-0000-000000000005',
    'f0000000-0000-0000-0000-000000000001',
    'Poteaux électriques',
    'pole',
    '#A78BFA'
  ),
  (
    'f1000000-0000-0000-0000-000000000006',
    'f0000000-0000-0000-0000-000000000001',
    'Google Car',
    'car',
    '#38BDF8'
  )
on conflict (id) do update
set
  name = excluded.name,
  icon = excluded.icon,
  color = excluded.color;
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run test:migrations
```

Expected: PASS.

Commit:

```powershell
git add supabase/migrations scripts/validate-migrations.test.mjs
git commit -m "feat: add official geoguessr meta categories"
```

### Task 2: Build and test the shared dataset validator

**Files:**
- Create: `scripts/official-meta/importer.mjs`
- Create: `scripts/official-meta/importer.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests for valid and invalid entries**

Test these exact cases with `node:test`:

```js
test("accepts a complete country clue", () => {
  const result = validateEntry({
    id: "11111111-1111-4111-8111-111111111111",
    countryCode: "FR",
    regionIds: [],
    difficulty: "easy",
    title: "Marquage au sol - France",
    characteristics: ["Lignes de rive blanches"],
    notes: "Indice reformulé.",
    sourceName: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Road.jpg",
    licenseName: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attributionText: "Photo Example Author.",
    imageUrl:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Road.jpg",
    imageAltText: "Route française avec marquage blanc",
  });

  assert.equal(result.coverage, "whole_country");
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

test("uses regional coverage when region ids exist", () => {
  const result = validateEntry({
    ...validEntry,
    regionIds: ["CO-SAP"],
  });
  assert.equal(result.coverage, "regions");
});
```

- [ ] **Step 2: Add the test command and verify RED**

Add:

```json
"test:official-meta": "node --test scripts/official-meta/importer.test.mjs"
```

Run:

```powershell
npm run test:official-meta
```

Expected: FAIL because `validateEntry` does not exist.

- [ ] **Step 3: Implement strict validation**

Export:

```js
export function validateEntry(entry) {
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

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.id)) {
    throw new Error("id doit être un UUID valide.");
  }
  if (!/^[A-Z]{2}$/.test(entry.countryCode)) {
    throw new Error("countryCode doit être un code ISO alpha-2.");
  }
  if (!["easy", "medium", "expert"].includes(entry.difficulty)) {
    throw new Error("difficulty doit être easy, medium ou expert.");
  }
  if (!Array.isArray(entry.characteristics) || entry.characteristics.length === 0) {
    throw new Error("characteristics doit contenir au moins une valeur.");
  }

  const regionIds = entry.regionIds ?? [];
  if (!Array.isArray(regionIds) || regionIds.some((id) => typeof id !== "string" || !id.trim())) {
    throw new Error("regionIds doit être une liste d'identifiants non vides.");
  }

  return {
    ...entry,
    regionIds,
    coverage: regionIds.length > 0 ? "regions" : "whole_country",
  };
}
```

- [ ] **Step 4: Add dataset-level validation**

Export:

```js
export function validateDataset(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("Le dataset doit contenir au moins une entrée.");
  }

  const validated = entries.map(validateEntry);
  const ids = new Set();
  for (const entry of validated) {
    if (ids.has(entry.id)) {
      throw new Error(`UUID dupliqué: ${entry.id}.`);
    }
    ids.add(entry.id);
  }
  return validated;
}
```

Add tests for an empty dataset and duplicate UUID.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run test:official-meta
```

Expected: PASS.

Commit:

```powershell
git add scripts/official-meta package.json
git commit -m "test: add official meta dataset validation"
```

### Task 3: Implement the shared Supabase import workflow

**Files:**
- Modify: `scripts/official-meta/importer.mjs`
- Modify: `scripts/official-meta/importer.test.mjs`

- [ ] **Step 1: Write failing tests for deterministic storage and coverage helpers**

Cover:

```js
assert.equal(
  buildImagePath(
    "f0000000-0000-0000-0000-000000000001",
    "11111111-1111-4111-8111-111111111111",
    "jpg",
  ),
  "f0000000-0000-0000-0000-000000000001/11111111-1111-4111-8111-111111111111/primary.jpg",
);

assert.deepEqual(
  {
    coverage: buildCluePayload(validatedEntry, categoryId, authorId).coverage,
    status: buildCluePayload(validatedEntry, categoryId, authorId).status,
    difficulty: buildCluePayload(validatedEntry, categoryId, authorId).difficulty,
  },
  {
    coverage: "whole_country",
    status: "published",
    difficulty: "easy",
  },
);
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm run test:official-meta
```

Expected: FAIL because import helpers do not exist.

- [ ] **Step 3: Implement reusable image handling**

Move the proven image behavior from `scripts/official-plates/import-official-plates.mjs` into four focused exports:

- `sniffImageFormat(buffer)` recognizes PNG from its eight-byte signature, JPEG from `FF D8 FF`, WebP from `RIFF....WEBP`, and SVG from either the XML declaration or an opening `<svg` tag; it returns `{ extension, contentType }` and throws for every other format.
- `buildDownloadUrl(url)` parses the URL and sets Wikimedia's `width` query parameter to `1200` for `commons.wikimedia.org/wiki/Special:FilePath/` links.
- `buildImagePath(collectionId, clueId, extension)` returns `${collectionId}/${clueId}/primary.${extension}`.
- `fetchImage(url, fetchImpl)` waits for the configured request spacing, retries status `408`, `425`, `429`, and `>= 500` with exponential delay, reads the response into a `Buffer`, calls `sniffImageFormat`, and returns `{ buffer, extension, contentType }`.

Use the existing user agent:

```js
"GeoTrainerAtlas/1.0 (https://github.com/Marco78270/GeoTraining)"
```

- [ ] **Step 4: Implement country and region resolution**

The workflow must:

```js
const { data: country } = await supabase
  .from("countries")
  .select("code")
  .eq("code", entry.countryCode)
  .maybeSingle();
```

For regions:

```js
const { data: regions } = await supabase
  .from("regions")
  .select("id")
  .in("id", entry.regionIds);
```

Throw when the country is absent or when the returned region IDs do not exactly match the requested set.

- [ ] **Step 5: Implement idempotent clue reconciliation**

Export:

```js
export async function runOfficialImport({
  category,
  datasetPath,
  summaryFileName,
  authorEnvName,
  dryRun,
  missingImagesOnly,
  supabase,
})
```

For each entry:

1. validate;
2. resolve geography;
3. upsert `clues` by stable UUID;
4. delete and recreate `clue_regions`;
5. upload the image with `upsert: true`;
6. upsert one `clue_images` row at `sort_order = 0`;
7. remove stale additional image rows;
8. record `created`, `updated`, `imagesImported`, `imagesSkipped`, or `failed`.

Do not publish before the image upload succeeds. If the clue must be created before Storage can reference it, create it with `status: "draft"` and update it to `published` only after image and region reconciliation.

- [ ] **Step 6: Verify failure reporting**

Add a test with an injected fake Supabase client where one image upload fails. Assert:

```js
assert.equal(summary.failed, 1);
assert.match(summary.failures[0].message, /upload/i);
assert.equal(summary.failures[0].countryCode, "FR");
```

- [ ] **Step 7: Verify and commit**

Run:

```powershell
npm run test:official-meta
node --check scripts/official-meta/importer.mjs
```

Expected: PASS and no syntax error.

Commit:

```powershell
git add scripts/official-meta
git commit -m "feat: add shared official clue importer"
```

### Task 4: Add thin commands for all three categories

**Files:**
- Create: `scripts/official-road-markings/import-official-road-markings.mjs`
- Create: `scripts/official-utility-poles/import-official-utility-poles.mjs`
- Create: `scripts/official-google-car/import-official-google-car.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create one thin entrypoint per category**

Each command loads local environment values, creates a service-role Supabase client, and calls `runOfficialImport`.

Road markings configuration:

```js
category: {
  id: "f1000000-0000-0000-0000-000000000004",
  name: "Marquages au sol",
},
datasetPath: new URL("./road-markings.v1.json", import.meta.url),
summaryFileName: "official-road-markings-import-summary.json",
authorEnvName: "SUPABASE_META_AUTHOR_ID",
```

Repeat with category IDs `f1000000-0000-0000-0000-000000000005` and `f1000000-0000-0000-0000-000000000006`.

- [ ] **Step 2: Add package commands**

```json
"road-markings:import": "node scripts/official-road-markings/import-official-road-markings.mjs",
"utility-poles:import": "node scripts/official-utility-poles/import-official-utility-poles.mjs",
"google-car:import": "node scripts/official-google-car/import-official-google-car.mjs"
```

- [ ] **Step 3: Syntax-check all entrypoints**

Run:

```powershell
node --check scripts/official-road-markings/import-official-road-markings.mjs
node --check scripts/official-utility-poles/import-official-utility-poles.mjs
node --check scripts/official-google-car/import-official-google-car.mjs
```

Expected: no syntax errors.

- [ ] **Step 4: Commit**

```powershell
git add package.json scripts/official-road-markings scripts/official-utility-poles scripts/official-google-car
git commit -m "feat: add official meta import commands"
```

### Task 5: Curate the road markings dataset

**Files:**
- Create: `scripts/official-road-markings/road-markings.v1.json`

- [ ] **Step 1: Research 20 to 25 strong country clues**

Use Plonk It and MetaGuessr only to identify candidate distinctions. Verify each distinction with at least one independent source when practical.

Prioritize:

```text
FR GB IE ES PT IT DE DK NO SE FI PL CZ HU RO RS GR TR
US CA MX BR AR UY CL CO PE AU NZ ZA JP
```

- [ ] **Step 2: Select one reusable real photo per entry**

For Wikimedia, record the file page, direct `Special:FilePath` URL, displayed license, author attribution, and accessible alt text.

Reject the entry if the image does not visibly demonstrate the described marking.

- [ ] **Step 3: Assign difficulty**

Use:

```text
easy   = visually distinctive and strongly country-specific
medium = reliable with one contextual comparison
expert = subtle, variable, or shared across nearby countries
```

Target a balanced distribution close to 8 easy, 9 medium, and 6 expert entries, adjusted to the final dataset size.

- [ ] **Step 4: Validate locally**

Run:

```powershell
npm run road-markings:import -- --dry-run
```

Expected: every row validates; Supabase and image sources may be read, but no database or Storage write occurs.

- [ ] **Step 5: Commit**

```powershell
git add scripts/official-road-markings/road-markings.v1.json
git commit -m "data: add official road markings clues"
```

### Task 6: Curate the utility poles dataset

**Files:**
- Create: `scripts/official-utility-poles/utility-poles.v1.json`

- [ ] **Step 1: Research 20 to 25 high-value pole clues**

Prioritize countries where material, holes, paint, insulators, crossarms, or support shape are meaningful:

```text
FR ES PT IT PL RO HU CZ SK RS TR
BR AR UY CL MX GT CO EC PE
JP KR TW TH PH ID MY BD LK
GH KE UG ZA AU NZ
```

- [ ] **Step 2: Keep the category boundary explicit**

Do not add:

- roadside bollards;
- signposts without electrical equipment;
- generic poles whose country cannot be supported by the cited characteristics.

- [ ] **Step 3: Attach regional coverage only when justified**

Examples may include a specific Brazilian state or an island region only when the visual form is documented as local and the corresponding `regionIds` exist.

- [ ] **Step 4: Validate locally**

Run:

```powershell
npm run utility-poles:import -- --dry-run
```

Expected: all entries validate, all images are present, and all requested regions resolve.

- [ ] **Step 5: Commit**

```powershell
git add scripts/official-utility-poles/utility-poles.v1.json
git commit -m "data: add official utility pole clues"
```

### Task 7: Curate the Google Car dataset

**Files:**
- Create: `scripts/official-google-car/google-car.v1.json`

- [ ] **Step 1: Start from legally imageable candidates**

Candidate concepts include:

- visible roof rack or bars;
- visible mirror or antenna;
- colored vehicle body;
- distinctive tape or camera rig;
- characteristic low-camera presentation.

Do not use screenshots from Google Street View, Google Maps, Plonk It, or MetaGuessr unless a specific reuse license is documented.

- [ ] **Step 2: Prefer regional entries where the clue is local**

Before adding a regional clue, verify the exact ID:

```powershell
Select-String -Path public/geography/regions/*.geojson -Pattern '"id":"CO-SAP"'
```

If the location has no compatible `public.regions` entry, either represent it honestly at country level or omit it. Do not create geography solely for this dataset.

- [ ] **Step 3: Accept a smaller final set**

The dataset may contain fewer than 20 entries. Every retained entry must have:

- a real reusable image;
- a visible car/camera characteristic;
- source and license metadata;
- a country or resolvable region;
- a defensible difficulty.

- [ ] **Step 4: Validate locally**

Run:

```powershell
npm run google-car:import -- --dry-run
```

Expected: all retained entries validate with no missing images or unresolved geography.

- [ ] **Step 5: Commit**

```powershell
git add scripts/official-google-car/google-car.v1.json
git commit -m "data: add official google car clues"
```

### Task 8: Register and test the Google Car icon

**Files:**
- Modify: `src/features/atlas/AtlasPage.tsx`
- Modify: `src/features/atlas/AtlasPage.test.tsx`

- [ ] **Step 1: Write a failing category icon test**

Extend Atlas fixture categories with:

```ts
{
  id: "f1000000-0000-0000-0000-000000000006",
  name: "Google Car",
  shortName: "Google Car",
  icon: "car",
  color: "#38BDF8",
  total: 1,
  countries: 1,
}
```

Assert the Google Car category button contains `.lucide-car-front` and remains selectable:

```ts
const googleCarButton = screen.getByRole("button", { name: /Google Car/i });
expect(googleCarButton.querySelector(".lucide-car-front")).not.toBeNull();
await user.click(googleCarButton);
expect(googleCarButton).toHaveAttribute("aria-pressed", "true");
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm test -- src/features/atlas/AtlasPage.test.tsx
```

Expected: FAIL because `car` falls back to `Signpost`.

- [ ] **Step 3: Register Lucide `CarFront`**

Import `CarFront` and add:

```ts
const categoryIcons = {
  sign: Signpost,
  milestone: Milestone,
  road: Route,
  pole: UtilityPole,
  fence: Fence,
  leaf: Leaf,
  car: CarFront,
} as const;
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm test -- src/features/atlas/AtlasPage.test.tsx
```

Expected: PASS.

Commit:

```powershell
git add src/features/atlas/AtlasPage.tsx src/features/atlas/AtlasPage.test.tsx
git commit -m "feat: add google car category icon"
```

### Task 9: Document the production import workflow

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

- [ ] **Step 1: Add environment documentation**

Document:

```env
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_META_AUTHOR_ID=
```

State explicitly that the service-role key is server-side only and must never use a `VITE_` prefix.

- [ ] **Step 2: Add all import commands**

Document normal and dry-run commands:

```powershell
npm run road-markings:import -- --dry-run
npm run utility-poles:import -- --dry-run
npm run google-car:import -- --dry-run

npm run road-markings:import
npm run utility-poles:import
npm run google-car:import
```

- [ ] **Step 3: Document source policy**

Explain that Plonk It and MetaGuessr are research references, while imported images require explicit reusable licensing and are copied to Supabase Storage with attribution metadata.

- [ ] **Step 4: Commit**

```powershell
git add README.md .env.example
git commit -m "docs: document official meta category imports"
```

### Task 10: Apply the migration to production

**Files:**
- Verify: generated migration

- [ ] **Step 1: Check migration state**

Run:

```powershell
npx supabase migration list
```

Expected: the new local migration is absent from remote history.

- [ ] **Step 2: Push only the pending migration**

Run:

```powershell
npx supabase db push
```

Review the prompt and confirm that only intended pending migrations are listed.

Expected: migration applied successfully.

- [ ] **Step 3: Verify through the Supabase API**

Run each importer with `--dry-run`. Expected: the official collection and all three categories are found.

### Task 11: Run the real imports

**Files:**
- Verify: `output/official-road-markings-import-summary.json`
- Verify: `output/official-utility-poles-import-summary.json`
- Verify: `output/official-google-car-import-summary.json`

- [ ] **Step 1: Import road markings**

Run:

```powershell
npm run road-markings:import
```

Expected: `failed: 0`, every created or updated clue has one imported image.

- [ ] **Step 2: Import utility poles**

Run:

```powershell
npm run utility-poles:import
```

Expected: `failed: 0`.

- [ ] **Step 3: Import Google Car**

Run:

```powershell
npm run google-car:import
```

Expected: `failed: 0`; total may be lower than the other categories.

- [ ] **Step 4: Verify idempotence**

Run all three commands a second time.

Expected:

- no duplicate clues;
- no duplicate image rows;
- entries reported as updated or skipped;
- `failed: 0`.

### Task 12: Full verification and deployment

**Files:**
- Verify all touched files.

- [ ] **Step 1: Run focused importer tests**

```powershell
npm run test:official-meta
npm run test:migrations
```

Expected: PASS.

- [ ] **Step 2: Run application verification**

```powershell
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: all tests pass, lint and typecheck exit 0, production build succeeds.

- [ ] **Step 3: Rebuild Docker**

```powershell
docker compose up -d --build
docker compose ps
```

Expected: application and Caddy containers are running.

- [ ] **Step 4: Perform visual acceptance checks**

In the Atlas:

1. select `Collection officielle`;
2. verify all three new categories are listed;
3. verify countries are tinted by easy/medium/expert difficulty;
4. open at least one clue per category;
5. verify the real image, source, license, notes, and difficulty;
6. open one regional clue and click another region;
7. verify the selected clue changes without changing the current zoom;
8. launch a training session for each new category.

- [ ] **Step 5: Commit any verification-only fixes**

```powershell
git status --short
git add scripts/official-meta scripts/official-road-markings scripts/official-utility-poles scripts/official-google-car src/features/atlas README.md .env.example package.json
git commit -m "fix: finalize official meta category imports"
```

Do not commit generated `output/*.json` summaries unless the repository intentionally versions them.
