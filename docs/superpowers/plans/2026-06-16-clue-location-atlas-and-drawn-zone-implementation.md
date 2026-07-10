# Clue Location Atlas And Drawn Zone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the clue editor's region checklist with Atlas-based region selection and add a new `drawn_zone` coverage mode backed by stored GeoJSON polygons.

**Architecture:** Extend the clue data model with a dedicated `clue_zones` table and a third coverage enum value, then split clue location UI into focused map-driven editor components. Reuse existing MapLibre and geography-loading patterns so the new workflow remains compatible with Atlas rendering and the current training rules.

**Tech Stack:** React 19, TypeScript, Vitest, TanStack Query, MapLibre GL, Supabase Postgres migrations, pgTAP SQL tests.

---

## File Structure

### New files

- `supabase/migrations/20260616xxxxxx_add_drawn_zone_clue_coverage.sql`
  - Add `drawn_zone` to `public.coverage_mode`
  - Create `public.clue_zones`
  - Add validation / publication protection for zone-backed clues
- `src/features/clues/clueLocationTypes.ts`
  - Shared location-focused frontend types for region and zone selection
- `src/features/clues/ClueLocationMap.tsx`
  - Dedicated MapLibre component for country zoom, region toggling, and polygon drawing
- `src/features/clues/ClueLocationStep.tsx`
  - Extracted location step UI from `ClueEditor.tsx`
- `src/features/clues/clueLocationUtils.ts`
  - GeoJSON helpers and editor-side location utilities
- `src/features/clues/clueLocationUtils.test.ts`
  - Unit tests for polygon and selection helpers

### Modified files

- `src/lib/database.types.ts`
  - Extend generated TS view of coverage enum and `clue_zones`
- `src/features/clues/clueSchema.ts`
  - Add `drawn_zone` validation and mutually exclusive `regionIds` / `zoneGeoJson`
- `src/features/clues/clueApi.ts`
  - Persist, replace, load, and clean up `clue_zones`
- `src/features/clues/clueApi.test.ts`
  - API tests for create/update mode switching and cleanup
- `src/features/clues/ClueEditor.tsx`
  - Remove inline region checklist logic and delegate to `ClueLocationStep`
- `src/features/clues/ClueEditor.test.tsx`
  - Update editor expectations from checklist to map-driven location state
- `src/features/geography/geographyApi.ts`
  - Reuse or extend region/country GeoJSON loading if needed by clue editor map
- `src/features/atlas/atlasApi.ts`
  - Load zone geometry alongside clue rows
- `src/features/atlas/AtlasMap.tsx`
  - Render polygon overlay for selected clue in Atlas
- `src/features/atlas/atlasApi.test.ts`
  - Validate Atlas output for zone-backed clues
- `supabase/tests/rls.test.sql`
  - Add coverage-mode and zone-table publication rules

---

### Task 1: Extend database coverage model with `drawn_zone`

**Files:**
- Create: `supabase/migrations/20260616xxxxxx_add_drawn_zone_clue_coverage.sql`
- Modify: `supabase/tests/rls.test.sql`
- Modify: `src/lib/database.types.ts`

- [ ] **Step 1: Write the failing SQL assertions for zone-backed clues**

Add tests near the existing clue publication assertions in `supabase/tests/rls.test.sql` to cover:

```sql
select throws_ok(
  $$ update public.clues
     set coverage = 'drawn_zone', status = 'published'
     where id = '50000000-0000-0000-0000-000000000001' $$,
  null,
  null,
  'drawn-zone clue cannot publish without a stored zone'
);

insert into public.clue_zones (clue_id, geojson)
values (
  '50000000-0000-0000-0000-000000000001',
  jsonb_build_object(
    'type', 'Polygon',
    'coordinates', jsonb_build_array(
      jsonb_build_array(
        jsonb_build_array(2.20, 48.80),
        jsonb_build_array(2.45, 48.80),
        jsonb_build_array(2.45, 48.92),
        jsonb_build_array(2.20, 48.80)
      )
    )
  )
);

select lives_ok(
  $$ update public.clues
     set coverage = 'drawn_zone', status = 'published'
     where id = '50000000-0000-0000-0000-000000000001' $$,
  'drawn-zone clue publishes when its polygon exists'
);
```

- [ ] **Step 2: Run migration validation tests to confirm failure**

Run:

```bash
npm run test:migrations
```

Expected: FAIL because `drawn_zone` and `clue_zones` do not exist yet.

- [ ] **Step 3: Create the migration with enum, table, and integrity rules**

Create `supabase/migrations/20260616xxxxxx_add_drawn_zone_clue_coverage.sql` with:

```sql
alter type public.coverage_mode add value if not exists 'drawn_zone';

create table public.clue_zones (
  clue_id uuid primary key references public.clues(id) on delete cascade,
  geojson jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint clue_zones_geojson_type_check
    check (geojson ->> 'type' = 'Polygon'),
  constraint clue_zones_geojson_coordinates_check
    check (jsonb_typeof(geojson -> 'coordinates') = 'array')
);

create trigger clue_zones_set_updated_at
before update on public.clue_zones
for each row execute function public.set_updated_at();
```

Also extend clue integrity rules so:

```sql
-- whole_country => no clue_regions, no clue_zones
-- selected_regions => at least one clue_regions, no clue_zones
-- drawn_zone => one clue_zones row, no clue_regions
```

Update read/write RLS policies for `public.clue_zones` by mirroring `public.clue_regions`.

- [ ] **Step 4: Update local database types to match the new schema**

Modify `src/lib/database.types.ts` so it includes:

```ts
type CoverageMode = "whole_country" | "selected_regions" | "drawn_zone";
```

and:

```ts
clue_zones: {
  Row: {
    clue_id: string;
    geojson: Json;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    clue_id: string;
    geojson: Json;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    clue_id?: string;
    geojson?: Json;
    created_at?: string;
    updated_at?: string;
  };
  Relationships: [
    {
      foreignKeyName: "clue_zones_clue_id_fkey";
      columns: ["clue_id"];
      isOneToOne: true;
      referencedRelation: "clues";
      referencedColumns: ["id"];
    },
  ];
};
```

- [ ] **Step 5: Run migration validation tests again**

Run:

```bash
npm run test:migrations
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260616xxxxxx_add_drawn_zone_clue_coverage.sql supabase/tests/rls.test.sql src/lib/database.types.ts
git commit -m "feat: add drawn zone clue coverage"
```

---

### Task 2: Extend clue schema validation for zone-backed location payloads

**Files:**
- Create: `src/features/clues/clueLocationTypes.ts`
- Modify: `src/features/clues/clueSchema.ts`
- Test: `src/features/clues/clueLocationUtils.test.ts`

- [ ] **Step 1: Write the failing schema tests for `drawn_zone`**

Create `src/features/clues/clueLocationUtils.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { parseClueForm } from "./clueSchema";

function baseForm() {
  return {
    collectionId: "collection-1",
    categoryIds: ["category-1"],
    countryCode: "FR",
    coverage: "drawn_zone" as const,
    regionIds: [],
    zoneGeoJson: {
      type: "Polygon",
      coordinates: [[[2.2, 48.8], [2.45, 48.8], [2.45, 48.92], [2.2, 48.8]]],
    },
    difficulty: "medium" as const,
    title: "Zone test",
    characteristics: [],
    notes: "",
    googleMapsUrl: "",
    images: [new File(["x"], "a.jpg", { type: "image/jpeg" })],
  };
}

describe("clueSchema drawn_zone", () => {
  it("accepts a polygon for drawn_zone", () => {
    expect(parseClueForm(baseForm())).toEqual(
      expect.objectContaining({
        coverage: "drawn_zone",
        zoneGeoJson: expect.objectContaining({ type: "Polygon" }),
      }),
    );
  });

  it("rejects drawn_zone without polygon", () => {
    expect(() =>
      parseClueForm({ ...baseForm(), zoneGeoJson: null }),
    ).toThrow(/zone/i);
  });

  it("rejects selected_regions with zoneGeoJson", () => {
    expect(() =>
      parseClueForm({
        ...baseForm(),
        coverage: "selected_regions",
        regionIds: ["FR-IDF"],
      }),
    ).toThrow(/région|zone/i);
  });
});
```

- [ ] **Step 2: Run the new test to verify failure**

Run:

```bash
npm run test -- src/features/clues/clueLocationUtils.test.ts
```

Expected: FAIL because `zoneGeoJson` and `drawn_zone` are not supported in `clueSchema.ts`.

- [ ] **Step 3: Add shared location types**

Create `src/features/clues/clueLocationTypes.ts`:

```ts
export type ClueZoneGeoJson = {
  type: "Polygon";
  coordinates: number[][][];
};

export function isPolygonGeoJson(value: unknown): value is ClueZoneGeoJson {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown; coordinates?: unknown };
  return candidate.type === "Polygon" && Array.isArray(candidate.coordinates);
}
```

- [ ] **Step 4: Extend clue schema types and validation**

Modify `src/features/clues/clueSchema.ts` to:

```ts
export type ClueCoverage = "whole_country" | "selected_regions" | "drawn_zone";
```

and extend input types:

```ts
zoneGeoJson: ClueZoneGeoJson | null;
```

Validation rules:

```ts
if (input.coverage === "selected_regions" && regionIds.length === 0) {
  throw new ClueValidationError("regionIds", "Sélectionnez au moins une région.");
}

if (input.coverage === "drawn_zone" && !isPolygonGeoJson(input.zoneGeoJson)) {
  throw new ClueValidationError("zoneGeoJson", "Dessinez une zone valide.");
}

if (input.coverage !== "selected_regions") {
  regionIds = [];
}

if (input.coverage !== "drawn_zone") {
  zoneGeoJson = null;
}
```

- [ ] **Step 5: Re-run schema tests**

Run:

```bash
npm run test -- src/features/clues/clueLocationUtils.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/clues/clueLocationTypes.ts src/features/clues/clueSchema.ts src/features/clues/clueLocationUtils.test.ts
git commit -m "feat: validate drawn zone clue locations"
```

---

### Task 3: Extend clue API create/update/load flows for zones

**Files:**
- Modify: `src/features/clues/clueApi.ts`
- Modify: `src/features/clues/clueApi.test.ts`

- [ ] **Step 1: Write the failing API tests for zone persistence**

Add tests to `src/features/clues/clueApi.test.ts`:

```ts
it("creates a drawn-zone clue and stores its polygon", async () => {
  const events: string[] = [];
  const dataClient = client(events);
  const api = createClueApi(dataClient, () => "image-1");

  await api.create({
    ...form(),
    coverage: "drawn_zone",
    regionIds: [],
    zoneGeoJson: {
      type: "Polygon",
      coordinates: [[[2.2, 48.8], [2.45, 48.8], [2.45, 48.92], [2.2, 48.8]]],
    },
    images: [image("stop.jpg", "image/jpeg")],
  });

  expect(dataClient.insertZone).toHaveBeenCalledWith(
    "clue-1",
    expect.objectContaining({ type: "Polygon" }),
  );
  expect(dataClient.insertRegions).not.toHaveBeenCalled();
});
```

and:

```ts
it("replaces previous regions with a drawn zone on update", async () => {
  const events: string[] = [];
  const dataClient = client(events);
  const api = createClueApi(dataClient, () => "image-1");

  await api.update({
    ...form(),
    clueId: "clue-1",
    previousCoverage: "selected_regions",
    coverage: "drawn_zone",
    regionIds: [],
    zoneGeoJson: {
      type: "Polygon",
      coordinates: [[[2.2, 48.8], [2.45, 48.8], [2.45, 48.92], [2.2, 48.8]]],
    },
    existingImages: [{
      id: "stored-1",
      storagePath: "collection-1/clue-1/stored-1.jpg",
      altText: "STOP 1",
      sortOrder: 0,
    }],
    removedImageIds: [],
    images: [],
  });

  expect(dataClient.replaceRegions).toHaveBeenCalledWith("clue-1", []);
  expect(dataClient.upsertZone).toHaveBeenCalledWith(
    "clue-1",
    expect.objectContaining({ type: "Polygon" }),
  );
});
```

- [ ] **Step 2: Run the clue API tests to verify failure**

Run:

```bash
npm run test -- src/features/clues/clueApi.test.ts
```

Expected: FAIL because the client contract does not yet include zone methods.

- [ ] **Step 3: Extend the data client contract and create flow**

Modify `src/features/clues/clueApi.ts`:

```ts
insertZone(clueId: string, geojson: ClueZoneGeoJson): Promise<void>;
upsertZone(clueId: string, geojson: ClueZoneGeoJson): Promise<void>;
deleteZone(clueId: string): Promise<void>;
```

Then in create:

```ts
if (input.coverage === "selected_regions") {
  stage = "regions";
  await client.insertRegions(clue.id, input.regionIds);
}

if (input.coverage === "drawn_zone" && input.zoneGeoJson) {
  stage = "regions";
  await client.insertZone(clue.id, input.zoneGeoJson);
}
```

- [ ] **Step 4: Extend update flow and edit preload**

In update:

```ts
if (input.coverage === "selected_regions") {
  await client.replaceRegions(input.clueId, input.regionIds);
  await client.deleteZone(input.clueId);
} else if (input.coverage === "drawn_zone" && input.zoneGeoJson) {
  await client.replaceRegions(input.clueId, []);
  await client.upsertZone(input.clueId, input.zoneGeoJson);
} else {
  await client.replaceRegions(input.clueId, []);
  await client.deleteZone(input.clueId);
}
```

Also extend `loadForEdit` select clause with `clue_zones(geojson)` and return `zoneGeoJson`.

- [ ] **Step 5: Implement Supabase zone persistence methods**

In the Supabase client:

```ts
async insertZone(clueId, geojson) {
  const { error } = await supabase.from("clue_zones").insert({ clue_id: clueId, geojson });
  throwIfError(error, "clue_zone_failed");
}

async upsertZone(clueId, geojson) {
  const { error } = await supabase.from("clue_zones").upsert({ clue_id: clueId, geojson });
  throwIfError(error, "clue_zone_failed");
}

async deleteZone(clueId) {
  const { error } = await supabase.from("clue_zones").delete().eq("clue_id", clueId);
  throwIfError(error, "clue_zone_failed");
}
```

- [ ] **Step 6: Re-run clue API tests**

Run:

```bash
npm run test -- src/features/clues/clueApi.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/clues/clueApi.ts src/features/clues/clueApi.test.ts
git commit -m "feat: persist drawn zone clue locations"
```

---

### Task 4: Replace the editor region checklist with an Atlas-based location step

**Files:**
- Create: `src/features/clues/ClueLocationStep.tsx`
- Create: `src/features/clues/ClueLocationMap.tsx`
- Modify: `src/features/clues/ClueEditor.tsx`
- Modify: `src/features/clues/ClueEditor.test.tsx`
- Modify: `src/features/geography/geographyApi.ts`

- [ ] **Step 1: Write the failing editor tests for map-driven location state**

Add tests to `src/features/clues/ClueEditor.test.tsx` that assert:

```ts
it("shows the Atlas location step instead of region checkboxes", async () => {
  const user = userEvent.setup();
  renderEditor();
  await reachLocationStep(user);

  expect(screen.queryByLabelText("Ile-de-France")).not.toBeInTheDocument();
  expect(screen.getByText(/atlas|carte/i)).toBeVisible();
});

it("supports the drawn zone coverage option", async () => {
  const user = userEvent.setup();
  renderEditor();
  await reachLocationStep(user);
  await user.selectOptions(screen.getByLabelText("Pays"), "FR");

  expect(screen.getByLabelText("Zone dessinée")).toBeVisible();
});
```

- [ ] **Step 2: Run the editor tests to verify failure**

Run:

```bash
npm run test -- src/features/clues/ClueEditor.test.tsx
```

Expected: FAIL because the checklist is still rendered and no dedicated location map exists.

- [ ] **Step 3: Extract the location step component**

Create `src/features/clues/ClueLocationStep.tsx` with props similar to:

```ts
type ClueLocationStepProps = {
  countries: Country[];
  countryCode: string;
  coverage: ClueCoverage;
  selectedRegionIds: Set<string>;
  zoneGeoJson: ClueZoneGeoJson | null;
  regionsLoading: boolean;
  onCountryChange(countryCode: string): void;
  onCoverageChange(coverage: ClueCoverage): void;
  onRegionToggle(regionId: string): void;
  onZoneChange(zone: ClueZoneGeoJson | null): void;
};
```

Render:

- country selector
- coverage mode radios
- map area
- compact location summary

- [ ] **Step 4: Implement the dedicated map component**

Create `src/features/clues/ClueLocationMap.tsx` by adapting patterns from `src/features/atlas/AtlasMap.tsx` and `src/features/training/TrainingMap.tsx`:

```ts
export type ClueLocationMapProps = {
  countryCode: string | null;
  coverage: ClueCoverage;
  selectedRegionIds: string[];
  zoneGeoJson: ClueZoneGeoJson | null;
  onRegionToggle(regionId: string): void;
  onZoneDraftChange(zone: ClueZoneGeoJson | null): void;
};
```

Behaviors:

- load the selected country and regional GeoJSON
- if `selected_regions`, allow clicking region fills
- if `drawn_zone`, allow point-by-point polygon drawing
- show `Annuler le dernier point` and `Recommencer`

- [ ] **Step 5: Wire the editor to the new location state**

Modify `src/features/clues/ClueEditor.tsx` so it replaces the inline step-2 block with:

```tsx
<ClueLocationStep
  countries={countries}
  countryCode={countryCode}
  coverage={coverage}
  selectedRegionIds={selectedRegionIds}
  zoneGeoJson={zoneGeoJson}
  regionsLoading={regionsLoading}
  onCountryChange={selectCountry}
  onCoverageChange={setCoverage}
  onRegionToggle={toggleRegion}
  onZoneChange={setZoneGeoJson}
/>
```

and update validation:

```ts
if (coverage === "selected_regions" && regionIds.length === 0) {
  return "Sélectionnez au moins une région.";
}
if (coverage === "drawn_zone" && !zoneGeoJson) {
  return "Dessinez une zone avant de continuer.";
}
```

- [ ] **Step 6: Extend geography helpers if the map component needs explicit country geometry loaders**

If needed, add:

```ts
export function loadCountryGeoJson(
  countryCode: string,
  fetcher: GeoJsonFetcher = fetch,
): Promise<FeatureCollection> {
  const normalizedCode = normalizeCountryCode(countryCode);
  return loadGeoJson(`/geography/countries/${normalizedCode}.geojson`, fetcher);
}
```

to `src/features/geography/geographyApi.ts`.

- [ ] **Step 7: Re-run the editor tests**

Run:

```bash
npm run test -- src/features/clues/ClueEditor.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/clues/ClueLocationStep.tsx src/features/clues/ClueLocationMap.tsx src/features/clues/ClueEditor.tsx src/features/clues/ClueEditor.test.tsx src/features/geography/geographyApi.ts
git commit -m "feat: use atlas-based clue location editor"
```

---

### Task 5: Render saved drawn zones in Atlas

**Files:**
- Modify: `src/features/atlas/atlasApi.ts`
- Modify: `src/features/atlas/AtlasMap.tsx`
- Modify: `src/features/atlas/atlasApi.test.ts`

- [ ] **Step 1: Write the failing Atlas test for zone-backed clues**

Add a test to `src/features/atlas/atlasApi.test.ts`:

```ts
it("exposes drawn zone geometry for Atlas rendering", async () => {
  const client: AtlasDataClient = {
    listPublishedClues: vi.fn().mockResolvedValue([
      {
        id: "clue-zone-1",
        category_id: "category-bollards",
        country_code: "KE",
        title: "Zone Kenya",
        difficulty: "medium",
        coverage: "drawn_zone",
        characteristics: [],
        notes: null,
        google_maps_url: null,
        source_name: null,
        source_url: null,
        license_name: null,
        license_url: null,
        attribution_text: null,
        categories: { name: "Bollards" },
        countries: { name: "Kenya" },
        clue_images: [],
        clue_regions: [],
        clue_zones: {
          geojson: {
            type: "Polygon",
            coordinates: [[[36.8, -1.4], [37.0, -1.4], [37.0, -1.2], [36.8, -1.4]]],
          },
        },
      },
    ]),
    createSignedImageUrls: vi.fn().mockResolvedValue({}),
    loadWorld: vi.fn().mockResolvedValue(world),
  };

  const result = await createAtlasApi(client).load("collection-1");
  expect(result.countries[0]?.clues[0]).toEqual(
    expect.objectContaining({
      coverage: "drawn_zone",
      zoneGeoJson: expect.objectContaining({ type: "Polygon" }),
    }),
  );
});
```

- [ ] **Step 2: Run the Atlas tests to verify failure**

Run:

```bash
npm run test -- src/features/atlas/atlasApi.test.ts
```

Expected: FAIL because clue rows do not yet load `clue_zones`.

- [ ] **Step 3: Extend Atlas clue typing and data loading**

Modify `src/features/atlas/atlasApi.ts`:

```ts
export type AtlasClue = {
  ...
  zoneGeoJson: ClueZoneGeoJson | null;
};
```

and extend clue row queries:

```ts
"..., clue_regions(region_id, regions(name)), clue_zones(geojson)"
```

Map the data:

```ts
zoneGeoJson: clue.clue_zones?.geojson ?? null,
```

- [ ] **Step 4: Render selected clue polygon in Atlas**

Modify `src/features/atlas/AtlasMap.tsx` so it accepts:

```ts
selectedZoneGeoJson?: ClueZoneGeoJson | null;
```

Add a GeoJSON source / fill / line layer, and update it when the selected clue changes:

```ts
map.addSource("selected-clue-zone", {
  type: "geojson",
  data: emptyFeatureCollection,
});
```

and:

```ts
source.setData(
  selectedZoneGeoJson
    ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: selectedZoneGeoJson }] }
    : { type: "FeatureCollection", features: [] },
);
```

- [ ] **Step 5: Pass the selected clue zone from Atlas page to Atlas map**

Modify the `AtlasPage.tsx` callsite:

```tsx
<AtlasMap
  ...
  selectedZoneGeoJson={selectedClue?.zoneGeoJson ?? null}
/>
```

- [ ] **Step 6: Re-run Atlas tests**

Run:

```bash
npm run test -- src/features/atlas/atlasApi.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/atlas/atlasApi.ts src/features/atlas/AtlasMap.tsx src/features/atlas/AtlasPage.tsx src/features/atlas/atlasApi.test.ts
git commit -m "feat: render drawn clue zones in atlas"
```

---

### Task 6: Full regression pass for clue editing and Atlas display

**Files:**
- Modify: `src/features/clues/ClueEditor.test.tsx`
- Modify: `src/features/clues/clueApi.test.ts`
- Modify: `src/features/atlas/atlasApi.test.ts`
- Modify: `src/features/training/trainingApi.test.ts` (only if coverage typing requires it)

- [ ] **Step 1: Add regression tests for edit-mode preload of drawn zones**

Add one test to `src/features/clues/ClueEditor.test.tsx`:

```ts
it("preloads an existing drawn-zone clue in edit mode", async () => {
  renderEditor(dependencies(), {
    mode: "edit",
    initialClue: {
      ...existingInitialClue,
      coverage: "drawn_zone",
      regionIds: [],
      zoneGeoJson: {
        type: "Polygon",
        coordinates: [[[2.2, 48.8], [2.45, 48.8], [2.45, 48.92], [2.2, 48.8]]],
      },
    },
  });

  await userEvent.setup().click(screen.getByRole("button", { name: "Continuer" }));
  await userEvent.setup().click(screen.getByRole("button", { name: "Continuer" }));
  expect(screen.getByLabelText("Zone dessinée")).toBeChecked();
});
```

- [ ] **Step 2: Run the focused frontend test suite**

Run:

```bash
npm run test -- src/features/clues/ClueEditor.test.tsx src/features/clues/clueApi.test.ts src/features/atlas/atlasApi.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/clues/ClueEditor.test.tsx src/features/clues/clueApi.test.ts src/features/atlas/atlasApi.test.ts src/features/training/trainingApi.test.ts
git commit -m "test: cover atlas and drawn zone clue locations"
```

---

## Spec Coverage Check

- Atlas-based region selection in editor: covered by Task 4
- Third `drawn_zone` mode: covered by Tasks 1, 2, 3, and 4
- GeoJSON polygon persistence: covered by Tasks 1 and 3
- Atlas polygon display: covered by Task 5
- Create/edit mode transitions and cleanup: covered by Tasks 3 and 6
- Training stays country-only for drawn zones: no new quiz interaction is introduced, and no task expands training answer logic

## Placeholder Scan

- No `TODO`, `TBD`, or deferred references
- Each task includes concrete files, commands, and code examples
- Commands are explicit and runnable in this repo

## Type Consistency Check

- Coverage mode name is consistently `drawn_zone`
- Polygon payload is consistently `zoneGeoJson`
- Persistence table is consistently `clue_zones`
- Atlas clue output uses `zoneGeoJson` to mirror editor/API naming
