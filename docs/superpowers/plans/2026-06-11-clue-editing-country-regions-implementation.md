# Clue Editing And Country Region Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit an existing clue, including individual image management, and show aggregated regional coverage when zooming into a country on the Atlas.

**Architecture:** Reuse the current `ClueEditor` as a shared create/edit component and extend `clueApi` with an update path that reconciles metadata, region links, and persisted images. Extend Atlas clue data with coverage and region ids, then compute country-region coverage client-side in `AtlasPage` and render a conditional region overlay in `AtlasMap`.

**Tech Stack:** React, TypeScript, React Router, TanStack Query, Supabase, MapLibre GL JS, Vitest, Testing Library.

---

## File Structure

```text
src/
  app/
    App.tsx                         route for clue editing
  features/
    atlas/
      AtlasPage.tsx                detail-panel edit action + regional aggregation
      AtlasPage.test.tsx
      AtlasMap.tsx                 country-region overlay
      AtlasMap.test.tsx
      atlasApi.ts                  clue coverage metadata for Atlas
      atlasApi.test.ts
    clues/
      ClueEditor.tsx               create/edit form state + mixed image manager
      ClueEditor.test.tsx
      ClueEditorPage.tsx           create/edit route wrapper
      clueApi.ts                   update flow + image reconciliation
      clueApi.test.ts
      clueSchema.ts                shared validation for create/edit
      clueSchema.test.ts
    geography/
      geographyApi.ts              cached region GeoJSON loader already present, reused in map
  lib/
    database.types.ts              typed clue rows if new fields are used
```

### Task 1: Extend Atlas clue data with editable and regional metadata

**Files:**
- Modify: `src/features/atlas/atlasApi.ts`
- Modify: `src/features/atlas/atlasApi.test.ts`

- [ ] **Step 1: Write the failing Atlas data test**

In `src/features/atlas/atlasApi.test.ts`, extend the mocked published clue row and expectation to include:

```ts
{
  coverage: "selected_regions",
  clue_regions: [
    {
      region_id: "KE-30",
      regions: { name: "Nairobi County" },
    },
  ],
}
```

and assert:

```ts
expect.objectContaining({
  coverage: "selected_regions",
  regionIds: ["KE-30"],
  regions: ["Nairobi County"],
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm test -- src/features/atlas/atlasApi.test.ts
```

Expected: FAIL because `AtlasClue` and the query transform do not yet expose `coverage` or `regionIds`.

- [ ] **Step 3: Implement the minimal Atlas clue shape**

Update `src/features/atlas/atlasApi.ts` so `AtlasClue` includes:

```ts
coverage: "whole_country" | "selected_regions";
regionIds: string[];
```

Change `PublishedClueRow` to include:

```ts
coverage: "whole_country" | "selected_regions";
clue_regions: Array<{
  region_id: string;
  regions: { name: string } | null;
}>;
```

Update the Supabase select string to:

```ts
"id, category_id, country_code, title, difficulty, coverage, characteristics, notes, google_maps_url, countries(name), clue_images(storage_path, alt_text, sort_order), clue_regions(region_id, regions(name))"
```

Populate the transformed clue object with:

```ts
coverage: clue.coverage,
regionIds: clue.clue_regions.map((item) => item.region_id),
regions,
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
npm test -- src/features/atlas/atlasApi.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/features/atlas/atlasApi.ts src/features/atlas/atlasApi.test.ts
git commit -m "feat: expose Atlas clue coverage metadata"
```

### Task 2: Add an editable clue model and update API flow

**Files:**
- Modify: `src/features/clues/clueSchema.ts`
- Modify: `src/features/clues/clueSchema.test.ts`
- Modify: `src/features/clues/clueApi.ts`
- Modify: `src/features/clues/clueApi.test.ts`

- [ ] **Step 1: Write the failing update API tests**

Add a new test in `src/features/clues/clueApi.test.ts` that models:

```ts
await api.update({
  clueId: "clue-1",
  collectionId: "collection-1",
  categoryIds: ["category-1"],
  countryCode: "KE",
  coverage: "selected_regions",
  regionIds: ["KE-30"],
  difficulty: "medium",
  title: "Bollards Kenyan",
  characteristics: ["Peinture jaune"],
  notes: "Nairobi et ses environs",
  googleMapsUrl: "https://www.google.com/maps/@-1.286389,36.817223,3a,75y",
  existingImages: [
    {
      id: "stored-1",
      storagePath: "collection-1/clue-1/stored-1.jpg",
      altText: "Bollard 1",
    },
  ],
  removedImageIds: [],
  images: [image("new.jpg", "image/jpeg")],
});
```

Assert that the client receives:

```ts
updateClue("clue-1", expect.objectContaining({
  country_code: "KE",
  coverage: "selected_regions",
  title: "Bollards Kenyan",
}))
```

and that new uploads, region replacement, and image metadata insertions happen.

- [ ] **Step 2: Run the API test to verify it fails**

Run:

```powershell
npm test -- src/features/clues/clueApi.test.ts
```

Expected: FAIL because `update(...)` and the extra client methods do not exist.

- [ ] **Step 3: Extend the validation model for editing**

In `src/features/clues/clueSchema.ts`, define edit-specific types:

```ts
export type PersistedClueImage = {
  id: string;
  storagePath: string;
  altText: string | null;
  sortOrder: number;
};

export type ClueEditInput = ClueFormInput & {
  clueId: string;
  existingImages: PersistedClueImage[];
  removedImageIds: string[];
};
```

Add a helper that validates the final image count from:

```ts
const remainingExisting = input.existingImages.filter(
  (image) => !new Set(input.removedImageIds).has(image.id),
);
const finalImageCount = remainingExisting.length + input.images.length;
```

Reject edits where `finalImageCount === 0` with:

```ts
throw new ClueValidationError("images", "Ajoutez au moins une image.");
```

- [ ] **Step 4: Implement the update flow**

In `src/features/clues/clueApi.ts`, extend `ClueDataClient` with:

```ts
updateClue(clueId: string, input: DraftInsert): Promise<void>;
replaceRegions(clueId: string, regionIds: string[]): Promise<void>;
deleteImageMetadata(imageIds: string[]): Promise<void>;
updateImageSortOrders(
  updates: Array<{ id: string; sort_order: number; alt_text: string | null }>
): Promise<void>;
```

Implement:

```ts
async update(rawInput: ClueEditInput): Promise<{ id: string }>
```

with this order:

1. validate edit payload
2. `updateClue(...)`
3. `replaceRegions(...)`
4. upload new images and insert metadata
5. delete removed storage objects
6. delete removed image metadata
7. recompute and persist `sort_order` for remaining existing + new images

Return:

```ts
return { id: rawInput.clueId };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```powershell
npm test -- src/features/clues/clueSchema.test.ts src/features/clues/clueApi.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/features/clues/clueSchema.ts src/features/clues/clueSchema.test.ts src/features/clues/clueApi.ts src/features/clues/clueApi.test.ts
git commit -m "feat: add clue update and image reconciliation flow"
```

### Task 3: Reuse the clue editor in edit mode

**Files:**
- Modify: `src/features/clues/ClueEditor.tsx`
- Modify: `src/features/clues/ClueEditor.test.tsx`
- Modify: `src/features/clues/ClueEditorPage.tsx`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Write the failing editor test**

Add a test in `src/features/clues/ClueEditor.test.tsx` that renders:

```tsx
<ClueEditor
  mode="edit"
  initialClue={{
    id: "clue-1",
    collectionId: "collection-1",
    categoryId: "category-stop",
    countryCode: "FR",
    coverage: "selected_regions",
    regionIds: ["FR-IDF"],
    difficulty: "medium",
    title: "STOP français",
    characteristics: ["Octogone rouge"],
    notes: "Présent sur les routes.",
    googleMapsUrl: "https://www.google.com/maps/@48.8566,2.3522,3a,75y",
    existingImages: [
      {
        id: "stored-1",
        storagePath: "collection-1/clue-1/stored-1.jpg",
        altText: "STOP 1",
        sortOrder: 0,
      },
    ],
  }}
/>
```

Assert:

```ts
expect(screen.getByDisplayValue("STOP français")).toBeVisible();
expect(screen.getByDisplayValue("Présent sur les routes.")).toBeVisible();
expect(screen.getByText("STOP 1")).toBeVisible();
```

and after publish:

```ts
expect(deps.clueApi.update).toHaveBeenCalled();
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm test -- src/features/clues/ClueEditor.test.tsx
```

Expected: FAIL because edit props, persisted-image rendering, and `clueApi.update(...)` handling do not exist.

- [ ] **Step 3: Implement edit mode in the editor**

In `src/features/clues/ClueEditor.tsx`, add props:

```ts
mode?: "create" | "edit";
initialClue?: {
  id: string;
  collectionId: string;
  categoryId: string;
  countryCode: string;
  coverage: ClueCoverage;
  regionIds: string[];
  difficulty: ClueDifficulty;
  title: string;
  characteristics: string[];
  notes: string;
  googleMapsUrl: string;
  existingImages: PersistedClueImage[];
};
```

Store persisted images separately:

```ts
const [existingImages, setExistingImages] = useState<PersistedClueImage[]>(...);
const [removedImageIds, setRemovedImageIds] = useState<Set<string>>(() => new Set());
```

Render persisted images in step 1 with a remove button:

```tsx
{existingImages
  .filter((image) => !removedImageIds.has(image.id))
  .map((image) => (
    <button
      key={image.id}
      type="button"
      onClick={() => toggleExistingImageRemoval(image.id)}
    >
      Retirer {image.altText ?? image.id}
    </button>
  ))}
```

Switch publish behavior:

```ts
if (mode === "edit" && initialClue) {
  await clueApi.update({ ...payload, clueId: initialClue.id, existingImages, removedImageIds: [...removedImageIds] });
} else {
  await clueApi.create(payload);
}
```

- [ ] **Step 4: Wire route-level edit mode**

In `src/app/App.tsx`, add a route:

```tsx
<Route path="/clues/:clueId/edit" element={<ClueEditorPage collectionApi={collectionApi} />} />
```

In `src/features/clues/ClueEditorPage.tsx`, read:

```ts
const { clueId } = useParams();
```

and support:

- create mode when `clueId` is absent
- edit mode when `clueId` is present

For this slice, pass edit-mode data from the routed location state:

```ts
const location = useLocation();
const initialClue = location.state?.initialClue ?? null;
```

If an edit route is opened without state, render:

```tsx
<p role="alert">Impossible de charger cet indice pour modification.</p>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```powershell
npm test -- src/features/clues/ClueEditor.test.tsx src/app/App.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/features/clues/ClueEditor.tsx src/features/clues/ClueEditor.test.tsx src/features/clues/ClueEditorPage.tsx src/app/App.tsx src/app/App.test.tsx
git commit -m "feat: add clue editor edit mode"
```

### Task 4: Add the edit action to Atlas and refresh after save

**Files:**
- Modify: `src/features/atlas/AtlasPage.tsx`
- Modify: `src/features/atlas/AtlasPage.test.tsx`

- [ ] **Step 1: Write the failing Atlas edit-action test**

In `src/features/atlas/AtlasPage.test.tsx`, after selecting the Kenya clue, assert:

```ts
expect(
  screen.getByRole("link", { name: "Modifier l’indice" }),
).toHaveAttribute("href", "/clues/clue-1/edit");
```

and assert location state is present with `initialClue`.

Use `MemoryRouter` history inspection or assert the rendered anchor contains the correct path and add a `state` expectation through a spy wrapper if needed.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm test -- src/features/atlas/AtlasPage.test.tsx
```

Expected: FAIL because the edit action does not exist.

- [ ] **Step 3: Implement the edit action**

In `src/features/atlas/AtlasPage.tsx`, add near the clue title:

```tsx
<Link
  className="zoom-country-button"
  to={`/clues/${selectedClue.id}/edit`}
  state={{
    initialClue: {
      id: selectedClue.id,
      collectionId: activeCollectionId,
      categoryId: selectedClue.categoryId,
      countryCode: selectedCountry.code,
      coverage: selectedClue.coverage,
      regionIds: selectedClue.regionIds,
      difficulty: selectedClue.difficulty,
      title: selectedClue.title,
      characteristics: selectedClue.characteristics,
      notes: selectedClue.notes ?? "",
      googleMapsUrl: selectedClue.googleMapsUrl ?? "",
      existingImages: selectedClue.images.map((image, index) => ({
        id: image.id,
        storagePath: image.storagePath,
        altText: image.altText,
        sortOrder: index,
      })),
    },
  }}
>
  Modifier l’indice
</Link>
```

If `AtlasClue` does not yet expose image ids and storage paths, extend it in `atlasApi.ts` as:

```ts
images: Array<{
  id: string;
  storagePath: string;
  altText: string | null;
  url: string;
}>;
```

and derive current UI `imageUrls` / `imageAlts` from that array.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
npm test -- src/features/atlas/AtlasPage.test.tsx src/features/atlas/atlasApi.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/features/atlas/AtlasPage.tsx src/features/atlas/AtlasPage.test.tsx src/features/atlas/atlasApi.ts src/features/atlas/atlasApi.test.ts
git commit -m "feat: open clue editing from Atlas"
```

### Task 5: Aggregate selected-country regional coverage in Atlas

**Files:**
- Modify: `src/features/atlas/AtlasPage.tsx`
- Modify: `src/features/atlas/AtlasPage.test.tsx`

- [ ] **Step 1: Write the failing aggregation test**

In `src/features/atlas/AtlasPage.test.tsx`, use a selected country with multiple clues:

```ts
clues: [
  {
    id: "clue-1",
    coverage: "whole_country",
    regionIds: [],
    regions: [],
    ...
  },
  {
    id: "clue-2",
    coverage: "selected_regions",
    regionIds: ["KE-30", "KE-40"],
    regions: ["Nairobi County", "Mombasa County"],
    ...
  },
]
```

Assert that the props passed into the mocked `AtlasMap` include:

```ts
hasWholeCountryCoverage === true
coveredRegionIds === ["KE-30", "KE-40"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm test -- src/features/atlas/AtlasPage.test.tsx
```

Expected: FAIL because `AtlasPage` does not compute or pass regional overlay data.

- [ ] **Step 3: Implement the aggregation**

In `src/features/atlas/AtlasPage.tsx`, derive:

```ts
const selectedCountryCoverage = useMemo(() => {
  if (!selectedCountry) {
    return { hasWholeCountryCoverage: false, coveredRegionIds: [] as string[] };
  }

  const hasWholeCountryCoverage = selectedCountry.clues.some(
    (clue) => clue.categoryId === activeCategory?.id && clue.coverage === "whole_country",
  );

  const coveredRegionIds = [
    ...new Set(
      selectedCountry.clues.flatMap((clue) =>
        clue.categoryId === activeCategory?.id && clue.coverage === "selected_regions"
          ? clue.regionIds
          : [],
      ),
    ),
  ];

  return { hasWholeCountryCoverage, coveredRegionIds };
}, [selectedCountry, activeCategory]);
```

Pass both values into `AtlasMap`.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
npm test -- src/features/atlas/AtlasPage.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/features/atlas/AtlasPage.tsx src/features/atlas/AtlasPage.test.tsx
git commit -m "feat: aggregate Atlas country regional coverage"
```

### Task 6: Render the region overlay in AtlasMap

**Files:**
- Modify: `src/features/atlas/AtlasMap.tsx`
- Modify: `src/features/atlas/AtlasMap.test.tsx`
- Modify: `src/features/geography/geographyApi.ts` (only if a helper export is needed)

- [ ] **Step 1: Write the failing map test**

Add a test in `src/features/atlas/AtlasMap.test.tsx` that renders:

```tsx
<AtlasMap
  markers={[...]}
  selectedCountryCode="KE"
  viewport="country"
  hasWholeCountryCoverage
  coveredRegionIds={["KE-30", "KE-40"]}
  onCountrySelect={vi.fn()}
  onViewportChange={vi.fn()}
/>
```

Mock `fetch` for `/geography/regions/KE.geojson` and assert that the map setup attempts to create:

```ts
"country-regions"
"country-regions-fill"
"country-regions-line"
```

or, if the existing test harness asserts source/layer registration via spies, use those spy names directly.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm test -- src/features/atlas/AtlasMap.test.tsx
```

Expected: FAIL because `AtlasMap` does not accept region-overlay props or load regional geometry.

- [ ] **Step 3: Implement the country-region overlay**

Add props to `AtlasMap`:

```ts
hasWholeCountryCoverage?: boolean;
coveredRegionIds?: string[];
```

On country viewport with a selected country:

1. fetch `/geography/regions/${selectedCountryCode}.geojson`
2. add or update source `country-regions`
3. add fill layer `country-regions-fill`
4. add line layer `country-regions-line`

Use fill paint:

```ts
"fill-color": [
  "case",
  ["match", ["get", "id"], coveredRegionIds, true, false],
  "#20d4e6",
  hasWholeCountryCoverage,
  "#173c57",
  "#10293d",
]
```

and opacity:

```ts
"fill-opacity": [
  "case",
  ["match", ["get", "id"], coveredRegionIds, true, false],
  0.62,
  hasWholeCountryCoverage,
  0.38,
  0.16,
]
```

If the fetch fails, swallow the error and leave the base country map visible.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
npm test -- src/features/atlas/AtlasMap.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/features/atlas/AtlasMap.tsx src/features/atlas/AtlasMap.test.tsx src/features/geography/geographyApi.ts
git commit -m "feat: render Atlas country region overlays"
```

### Task 7: Run focused regression checks and update documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the feature notes to the README**

Document:

- clue editing route: `/clues/:clueId/edit`
- existing clue images can be kept, removed, and supplemented
- country zoom now shows whole-country plus region coverage

Suggested snippet:

```md
## Atlas editing and region zoom

- Edit an existing clue from the Atlas detail panel
- Keep or remove existing clue images individually
- Add new images during clue editing
- Zoom into a country to inspect aggregated regional coverage from filtered clues
```

- [ ] **Step 2: Run the focused test suite**

Run:

```powershell
npm test -- src/features/clues/clueSchema.test.ts src/features/clues/clueApi.test.ts src/features/clues/ClueEditor.test.tsx src/features/atlas/atlasApi.test.ts src/features/atlas/AtlasPage.test.tsx src/features/atlas/AtlasMap.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run typecheck and build**

Run:

```powershell
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 4: Run whitespace sanity check**

Run:

```powershell
git diff --check
```

Expected: no output.

- [ ] **Step 5: Commit**

```powershell
git add README.md
git commit -m "docs: describe clue editing and country region zoom"
```

## Completion Criteria

- Existing clues can be opened from Atlas in edit mode
- The clue editor can update metadata without creating a new clue
- Existing images can be kept or removed individually while new ones are added
- Atlas clue data contains coverage and stable region ids
- Country zoom computes coverage from all filtered clues of the selected country
- Whole-country coverage and explicit regional coverage are rendered together
- Region GeoJSON failures do not crash the map
- `npm test -- src/features/clues/clueSchema.test.ts src/features/clues/clueApi.test.ts src/features/clues/ClueEditor.test.tsx src/features/atlas/atlasApi.test.ts src/features/atlas/AtlasPage.test.tsx src/features/atlas/AtlasMap.test.tsx`, `npm run typecheck`, and `npm run build` pass
