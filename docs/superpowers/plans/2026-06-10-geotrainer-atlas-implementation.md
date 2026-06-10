# GeoTrainer Atlas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production-ready version of GeoTrainer Atlas with private collaborative collections, user-imported geographic clues, an interactive world/region map, and country or region training modes.

**Architecture:** A Vite React TypeScript SPA uses feature-focused modules, React Router, TanStack Query, MapLibre GL JS, and a typed Supabase client. Supabase owns authentication, PostgreSQL data, RLS authorization, private clue images, invitations, and realtime invalidation. Geographic metadata lives in PostgreSQL while simplified GeoJSON is loaded on demand from versioned static assets.

**Tech Stack:** React, TypeScript, Vite, React Router, TanStack Query, Supabase, MapLibre GL JS, React Hook Form, Zod, CSS Modules, Vitest, Testing Library, Playwright.

---

## Delivery Slices

1. **Secure workspace:** authentication, collections, categories, invitations, and RLS.
2. **Atlas:** geographic catalog, clue import, private images, map exploration, and responsive detail panels.
3. **Training:** world and country sessions, correction flow, statistics, E2E coverage, and CI.

## File Structure

```text
src/
  app/                 routing, providers, application shell
  components/          shared accessible UI primitives
  features/
    auth/              login, registration, session guard
    collections/       collections, categories, invitations, members
    clues/             clue editor, image upload, clue queries
    geography/         countries, regions, GeoJSON loading
    atlas/             filters, map, detail gallery
    training/          session setup, questions, scoring, correction
    statistics/        session summaries
  lib/                 Supabase client, query keys, errors, validation
  styles/              tokens and global layout
supabase/
  migrations/          schema, RLS, storage, database tests
  seed.sql              development fixtures
scripts/geography/     deterministic geography normalization
public/geography/      simplified world and ADM1 GeoJSON
tests/e2e/             browser journeys
```

### Task 1: Scaffold the React application and test harness

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `vitest.setup.ts`
- Create: `playwright.config.ts`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`
- Modify: `.gitignore`

- [ ] **Step 1: Verify the supported Node runtime**

Run:

```powershell
node --version
```

Expected: Node `20.19+` or `22.12+`, as required by Vite 8.

- [ ] **Step 2: Scaffold Vite React TypeScript**

Run:

```powershell
npm create vite@latest . -- --template react-ts --no-interactive
npm install
npm install react-router-dom @tanstack/react-query @supabase/supabase-js maplibre-gl react-hook-form @hookform/resolvers zod lucide-react clsx
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test
```

Expected: dependencies install successfully and the existing `README.md`, `docs/`, and `.gitignore` remain present.

- [ ] **Step 3: Add test scripts**

Set `package.json` scripts to:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "typecheck": "tsc -b --pretty false"
}
```

- [ ] **Step 4: Write the failing shell test**

Create `src/app/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { App } from "./App";

it("renders the GeoTrainer Atlas brand", () => {
  render(<App />);
  expect(screen.getByText("GeoTrainer")).toBeInTheDocument();
  expect(screen.getByText("Atlas")).toBeInTheDocument();
});
```

- [ ] **Step 5: Run the test and confirm failure**

Run:

```powershell
npm test -- src/app/App.test.tsx
```

Expected: FAIL because the application shell has not been implemented.

- [ ] **Step 6: Implement the minimal shell and visual tokens**

`src/app/App.tsx`:

```tsx
import "../styles/global.css";

export function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <strong>GeoTrainer <span>Atlas</span></strong>
      </header>
    </main>
  );
}
```

Define dark navy surfaces, cyan accent, status colors, spacing, radii, typography, and focus rings in `tokens.css`; import it from `global.css`.

- [ ] **Step 7: Verify the scaffold**

Run:

```powershell
npm test
npm run typecheck
npm run build
```

Expected: all commands pass.

- [ ] **Step 8: Commit**

```powershell
git add package.json package-lock.json vite.config.ts playwright.config.ts vitest.setup.ts src .gitignore
git commit -m "chore: scaffold GeoTrainer React application"
```

### Task 2: Create the Supabase schema, storage, and authorization rules

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/202606100001_core_schema.sql`
- Create: `supabase/migrations/202606100002_rls_and_storage.sql`
- Create: `supabase/tests/rls.test.sql`
- Create: `supabase/seed.sql`
- Create: `.env.example`

- [ ] **Step 1: Initialize local Supabase**

Run:

```powershell
npx supabase init
```

Expected: `supabase/config.toml` is created.

- [ ] **Step 2: Write schema assertions first**

In `supabase/tests/rls.test.sql`, use pgTAP to assert:

```sql
select plan(8);
select has_table('public', 'collections');
select has_table('public', 'collection_members');
select has_table('public', 'categories');
select has_table('public', 'clues');
select has_table('public', 'clue_regions');
select has_table('public', 'training_sessions');
select has_table('public', 'training_answers');
select policies_are('public', 'collections', array[
  'members can read collections',
  'owners can update collections',
  'owners can delete collections'
]);
select * from finish();
```

- [ ] **Step 3: Confirm the database test fails**

Run:

```powershell
npx supabase start
npx supabase test db
```

Expected: FAIL because the tables and policies do not exist.

- [ ] **Step 4: Implement the core schema**

Create enums `collection_role`, `coverage_mode`, `clue_difficulty`, `invitation_status`, and `training_mode`. Create:

```sql
profiles(id uuid primary key references auth.users on delete cascade, display_name text, created_at timestamptz);
collections(id uuid primary key, owner_id uuid references profiles, name text, description text, created_at timestamptz, updated_at timestamptz);
collection_members(collection_id uuid references collections on delete cascade, user_id uuid references profiles on delete cascade, role collection_role, primary key(collection_id,user_id));
collection_invitations(id uuid primary key, collection_id uuid references collections on delete cascade, email citext, token_hash text unique, expires_at timestamptz, status invitation_status);
categories(id uuid primary key, collection_id uuid references collections on delete cascade, name text, icon text, color text);
countries(code text primary key, name text, geojson_path text);
regions(id text primary key, country_code text references countries, name text, geojson_path text);
clues(id uuid primary key, collection_id uuid references collections on delete cascade, category_id uuid references categories, country_code text references countries, difficulty clue_difficulty, coverage coverage_mode, characteristics text[], notes text, author_id uuid references profiles, created_at timestamptz, updated_at timestamptz);
clue_regions(clue_id uuid references clues on delete cascade, region_id text references regions, primary key(clue_id,region_id));
clue_images(id uuid primary key, clue_id uuid references clues on delete cascade, storage_path text unique, sort_order integer);
training_sessions(id uuid primary key, user_id uuid references profiles, collection_id uuid references collections, mode training_mode, country_code text references countries, total_questions integer, correct_answers integer, created_at timestamptz, completed_at timestamptz);
training_answers(id uuid primary key, session_id uuid references training_sessions on delete cascade, clue_id uuid references clues, selected_code text, correct_code text, is_correct boolean);
```

Add constraints:

- owner membership is created with each collection;
- category and clue must belong to the same collection;
- `selected_regions` requires at least one `clue_regions` row before publication;
- editors cannot modify collection ownership or memberships;
- `updated_at` is maintained by a trigger.

- [ ] **Step 5: Implement RLS and private storage**

Create helper functions `is_collection_member(uuid)` and `is_collection_owner(uuid)` as `security definer` functions with a fixed `search_path`. Enable RLS on all user-owned tables.

Policies must enforce:

```sql
-- Read: owner or editor.
using (public.is_collection_member(collection_id))

-- Content writes: owner or editor.
with check (public.is_collection_member(collection_id))

-- Collection update/delete and member management: owner only.
using (public.is_collection_owner(id))
```

Create private bucket `clue-images`. Storage paths use:

```text
{collection_id}/{clue_id}/{image_id}.{extension}
```

Storage policies parse the first path segment and require collection membership.

- [ ] **Step 6: Verify schema and RLS**

Run:

```powershell
npx supabase db reset
npx supabase test db
```

Expected: all pgTAP assertions pass.

- [ ] **Step 7: Commit**

```powershell
git add supabase .env.example
git commit -m "feat: add Supabase schema and collection authorization"
```

### Task 3: Add typed Supabase access and email/password authentication

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `src/lib/database.types.ts`
- Create: `src/app/AppProviders.tsx`
- Create: `src/features/auth/AuthProvider.tsx`
- Create: `src/features/auth/LoginPage.tsx`
- Create: `src/features/auth/RegisterPage.tsx`
- Create: `src/features/auth/RequireSession.tsx`
- Test: `src/features/auth/LoginPage.test.tsx`

- [ ] **Step 1: Generate database types**

Run:

```powershell
npx supabase gen types typescript --local | Set-Content src/lib/database.types.ts
```

- [ ] **Step 2: Write a failing login test**

```tsx
it("submits email and password", async () => {
  const signIn = vi.fn().mockResolvedValue({ error: null });
  render(<LoginPage signIn={signIn} />);
  await userEvent.type(screen.getByLabelText("Email"), "marco@example.com");
  await userEvent.type(screen.getByLabelText("Mot de passe"), "secret123");
  await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));
  expect(signIn).toHaveBeenCalledWith("marco@example.com", "secret123");
});
```

- [ ] **Step 3: Confirm failure**

Run:

```powershell
npm test -- src/features/auth/LoginPage.test.tsx
```

Expected: FAIL because `LoginPage` does not exist.

- [ ] **Step 4: Implement authentication**

Use `supabase.auth.signInWithPassword`, `signUp`, `signOut`, `getSession`, and `onAuthStateChange`. Validate email and an eight-character minimum password with Zod. Route unauthenticated users to `/login`; authenticated users land on `/atlas`.

- [ ] **Step 5: Verify authentication components**

Run:

```powershell
npm test -- src/features/auth
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src
git commit -m "feat: add email password authentication"
```

### Task 4: Build private collections, categories, and editable sharing

**Files:**
- Create: `src/features/collections/collectionApi.ts`
- Create: `src/features/collections/CollectionsPage.tsx`
- Create: `src/features/collections/CollectionPicker.tsx`
- Create: `src/features/collections/CategoryList.tsx`
- Create: `src/features/collections/InviteEditorDialog.tsx`
- Create: `src/features/collections/AcceptInvitationPage.tsx`
- Create: `supabase/functions/send-collection-invite/index.ts`
- Test: `src/features/collections/collectionApi.test.ts`

- [ ] **Step 1: Write failing collection service tests**

Cover:

```ts
it("creates a collection and returns its owner membership");
it("lists only collections visible to the current user");
it("creates one category per submitted name");
it("rejects an invitation when the signed-in email differs");
```

- [ ] **Step 2: Confirm failure**

Run:

```powershell
npm test -- src/features/collections
```

- [ ] **Step 3: Implement collection queries and mutations**

Expose:

```ts
listCollections(): Promise<CollectionSummary[]>
createCollection(input: CreateCollectionInput): Promise<Collection>
createCategory(input: CreateCategoryInput): Promise<Category>
inviteEditor(collectionId: string, email: string): Promise<void>
acceptInvitation(token: string): Promise<void>
removeEditor(collectionId: string, userId: string): Promise<void>
```

Use an Edge Function for invitation email. Store only a SHA-256 token hash; send the raw token once in the invitation URL. Require the authenticated email to equal the invited email.

- [ ] **Step 4: Implement the collection UI**

Provide create, rename, select, invite, remove editor, and category CRUD. Preserve the active collection ID in `localStorage`, but revalidate membership before using it.

- [ ] **Step 5: Subscribe to relevant changes**

Use one Supabase Realtime channel scoped to the active collection. Invalidate TanStack Query keys for categories, clues, and members when matching rows change.

- [ ] **Step 6: Verify**

Run:

```powershell
npm test -- src/features/collections
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/features/collections supabase/functions
git commit -m "feat: add private collaborative collections"
```

### Task 5: Import and serve countries and first-level regions

**Files:**
- Create: `scripts/geography/normalize-geography.mjs`
- Create: `scripts/geography/sources.json`
- Create: `public/geography/world.geojson`
- Create: `public/geography/regions/<ISO2>.geojson`
- Create: `supabase/migrations/202606100003_geography_seed.sql`
- Create: `src/features/geography/geographyApi.ts`
- Test: `src/features/geography/geographyApi.test.ts`

- [ ] **Step 1: Define deterministic source metadata**

`sources.json` records:

- Natural Earth Admin 0 countries for the simplified world layer;
- geoBoundaries CGAZ ADM1 for first-level region polygons;
- ISO 3166-1 and ISO 3166-2 codes used by application records;
- source URL, version date, license, and SHA-256 checksum.

- [ ] **Step 2: Write failing normalization tests**

Test that the script:

```ts
expect(country.code).toMatch(/^[A-Z]{2}$/);
expect(region.countryCode).toBe(country.code);
expect(region.id).toMatch(new RegExp(`^${country.code}-`));
expect(feature.geometry).toBeDefined();
```

- [ ] **Step 3: Implement normalization**

The script simplifies polygons for web display, removes unused properties, emits one world file and one ADM1 file per country, and generates SQL inserts for `countries` and `regions`. It must fail when a feature cannot be mapped to a stable application identifier.

- [ ] **Step 4: Implement geography loaders**

Expose:

```ts
listCountries(): Promise<Country[]>
listRegions(countryCode: string): Promise<Region[]>
loadWorldGeoJson(): Promise<FeatureCollection>
loadRegionGeoJson(countryCode: string): Promise<FeatureCollection>
```

Cache immutable GeoJSON requests through TanStack Query with a 24-hour stale time.

- [ ] **Step 5: Verify**

Run:

```powershell
node scripts/geography/normalize-geography.mjs --verify
npm test -- src/features/geography
npx supabase db reset
```

Expected: checksums match, tests pass, and geography rows are seeded.

- [ ] **Step 6: Commit**

```powershell
git add scripts public/geography supabase/migrations src/features/geography
git commit -m "feat: add country and region geography catalog"
```

### Task 6: Add clue creation, region selection, and private image upload

**Files:**
- Create: `src/features/clues/clueSchema.ts`
- Create: `src/features/clues/clueApi.ts`
- Create: `src/features/clues/ClueEditorDialog.tsx`
- Create: `src/features/clues/steps/ImageStep.tsx`
- Create: `src/features/clues/steps/CategoryStep.tsx`
- Create: `src/features/clues/steps/LocationStep.tsx`
- Create: `src/features/clues/steps/NotesStep.tsx`
- Test: `src/features/clues/clueSchema.test.ts`
- Test: `src/features/clues/LocationStep.test.tsx`

- [ ] **Step 1: Write failing location rule tests**

```ts
it("treats whole_country as covering every region");
it("requires at least one region for selected_regions");
it("clears explicit regions when whole_country is selected");
it("allows one category only");
```

- [ ] **Step 2: Confirm failure**

Run:

```powershell
npm test -- src/features/clues
```

- [ ] **Step 3: Implement validation**

Accept JPEG, PNG, and WebP only, maximum 10 MB per image and six images per clue. Require collection, one category, country, and either `whole_country` or a non-empty region list.
Require one difficulty value among `easy`, `medium`, and `expert`.

- [ ] **Step 4: Implement atomic clue creation**

Create the clue first, upload files to the private bucket, insert `clue_images`, then insert `clue_regions`. If any upload fails, delete uploaded objects and the incomplete clue. Return structured errors without clearing the editor form.

- [ ] **Step 5: Implement the five-step editor**

The location step contains a country list and its official first-level divisions. Selecting `Pays entier` checks and disables all visible regions; switching back restores independent region selection. The final step includes the difficulty selector shown in the Atlas filters.

- [ ] **Step 6: Verify**

Run:

```powershell
npm test -- src/features/clues
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/features/clues
git commit -m "feat: add clue editor and private image uploads"
```

### Task 7: Build the desktop Atlas layout and interactive map

**Files:**
- Create: `src/features/atlas/AtlasPage.tsx`
- Create: `src/features/atlas/AtlasSidebar.tsx`
- Create: `src/features/atlas/AtlasMap.tsx`
- Create: `src/features/atlas/CountryDetailPanel.tsx`
- Create: `src/features/atlas/atlasApi.ts`
- Create: `src/features/atlas/atlasStyles.module.css`
- Test: `src/features/atlas/AtlasPage.test.tsx`

- [ ] **Step 1: Write failing interaction tests**

Cover:

```tsx
it("updates map coverage when the active category changes");
it("opens the country panel when a country is selected");
it("loads ADM1 geometry only after entering a country");
it("filters the gallery to the selected country or region");
```

- [ ] **Step 2: Confirm failure**

Run:

```powershell
npm test -- src/features/atlas
```

- [ ] **Step 3: Implement Atlas data aggregation**

Query clue counts grouped by country and region for the active collection/category/difficulty filters. Return:

```ts
type Coverage = {
  countryCode: string;
  clueCount: number;
  coveredRegionIds: string[];
};
```

- [ ] **Step 4: Implement MapLibre layers**

Render:

- dark basemap background;
- country polygons with coverage-based fill;
- hover and selected outlines;
- clue-count markers;
- ADM1 polygons after entering a country;
- zoom, recenter, and fullscreen controls.

Map interactions update URL state such as `/atlas?country=FR&region=FR-IDF&category=<uuid>`.

- [ ] **Step 5: Match the validated composition**

Use the permanent left sidebar, dominant central map, and permanent right detail panel from visual option A. The right panel displays signed image URLs, notes, coverage, edit action, and `Lancer un entraînement`.

- [ ] **Step 6: Verify**

Run:

```powershell
npm test -- src/features/atlas
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/features/atlas
git commit -m "feat: build interactive GeoTrainer Atlas"
```

### Task 8: Implement world and country training sessions

**Files:**
- Create: `src/features/training/trainingApi.ts`
- Create: `src/features/training/trainingEngine.ts`
- Create: `src/features/training/TrainingSetupPage.tsx`
- Create: `src/features/training/TrainingSessionPage.tsx`
- Create: `src/features/training/CorrectionPanel.tsx`
- Test: `src/features/training/trainingEngine.test.ts`

- [ ] **Step 1: Write failing engine tests**

```ts
it("uses all covered countries in world mode");
it("excludes whole-country clues in region mode");
it("does not repeat a clue inside one session");
it("scores exact ISO country or region matches");
it("rejects setup with fewer than four answerable clues");
```

- [ ] **Step 2: Confirm failure**

Run:

```powershell
npm test -- src/features/training
```

- [ ] **Step 3: Implement deterministic session generation**

Use a seeded Fisher-Yates shuffle so tests and resumed sessions are stable. World mode expects country codes. Country mode includes only `selected_regions` clues and expects region IDs.

- [ ] **Step 4: Implement setup and play screens**

Setup selects collection, category, mode, country when applicable, and question count. The session displays one signed image and accepts a map selection. After submission, freeze the answer and show selected/correct polygons, notes, score, and next action.

- [ ] **Step 5: Persist progress**

Insert a session at start, one answer per question, and update totals at completion. A refresh resumes the first unanswered question.

- [ ] **Step 6: Verify**

Run:

```powershell
npm test -- src/features/training
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/features/training
git commit -m "feat: add country and region training modes"
```

### Task 9: Add statistics, responsive behavior, and accessibility

**Files:**
- Create: `src/features/statistics/StatisticsPage.tsx`
- Create: `src/components/Drawer.tsx`
- Modify: `src/features/atlas/atlasStyles.module.css`
- Modify: `src/styles/global.css`
- Test: `src/components/Drawer.test.tsx`

- [ ] **Step 1: Write failing accessibility tests**

Assert that drawers trap focus, Escape closes them, controls have accessible names, selected map context is announced, and reduced-motion preferences disable nonessential transitions.

- [ ] **Step 2: Implement statistics**

Display total sessions, success rate, performance by category, and weakest countries or regions using the current user's completed sessions only.

- [ ] **Step 3: Implement responsive layout**

At desktop widths, retain the three-column validated layout. On tablet and mobile, keep the map visible and move filters and detail content into separate drawers.

- [ ] **Step 4: Verify keyboard and responsive behavior**

Run:

```powershell
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src
git commit -m "feat: add statistics and responsive accessible layout"
```

### Task 10: Add end-to-end journeys and CI

**Files:**
- Create: `tests/e2e/auth.setup.ts`
- Create: `tests/e2e/collections.spec.ts`
- Create: `tests/e2e/clues.spec.ts`
- Create: `tests/e2e/atlas.spec.ts`
- Create: `tests/e2e/training.spec.ts`
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`

- [ ] **Step 1: Write browser journeys**

Cover:

1. registration and login;
2. private collection and category creation;
3. editor invitation acceptance;
4. whole-country clue import;
5. multi-region clue import;
6. Atlas category filtering and country drill-down;
7. world training;
8. country-region training;
9. denied access from a non-member account.

- [ ] **Step 2: Run E2E tests and confirm any missing wiring**

Run:

```powershell
npx supabase start
npm run dev -- --host 127.0.0.1
npm run test:e2e
```

Expected: all journeys pass against local Supabase.

- [ ] **Step 3: Add CI**

The workflow installs dependencies with `npm ci`, starts Supabase, runs database tests, unit tests, typecheck, production build, and Playwright tests. Cache npm and Playwright browsers.

- [ ] **Step 4: Document local setup**

Document:

```powershell
npm install
npx supabase start
Copy-Item .env.example .env.local
npm run dev
```

Include Supabase project linking, migration deployment, environment variables, geography regeneration, and test commands. Never commit service-role keys.

- [ ] **Step 5: Run final verification**

Run:

```powershell
npx supabase test db
npm test
npm run typecheck
npm run build
npm run test:e2e
git diff --check
```

Expected: every command passes and Git reports no whitespace errors.

- [ ] **Step 6: Commit**

```powershell
git add tests .github README.md
git commit -m "test: add GeoTrainer end to end coverage and CI"
```

## Completion Criteria

- All acceptance criteria in `docs/superpowers/specs/2026-06-10-geotrainer-atlas-design.md` have an automated test or an explicit browser verification.
- RLS tests prove owner, editor, and outsider behavior.
- Images cannot be fetched without a valid signed URL and collection membership.
- Country and region identifiers are stable across database rows and GeoJSON.
- Desktop matches validated composition A; tablet and mobile retain every function through drawers.
- `npm test`, `npm run typecheck`, `npm run build`, `npm run test:e2e`, and `npx supabase test db` pass.

## Official References

- Vite setup: https://vite.dev/guide/
- Supabase React quickstart: https://supabase.com/docs/guides/getting-started/quickstarts/reactjs
- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/
