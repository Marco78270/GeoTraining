# Clue Editing And Country Region Zoom Design

## Goal

Add two connected capabilities to GeoTrainer Atlas:

1. users can edit an existing clue without recreating it
2. country zoom shows regional coverage aggregated from all filtered clues for the selected country

This work should preserve the current private collection workflow, reuse the existing clue editor as much as possible, and avoid adding unnecessary API round trips.

## Product Scope

### In Scope

- Edit an existing clue from the Atlas detail panel
- Pre-fill the existing clue form with persisted clue data
- Update clue metadata:
  - category
  - country
  - whole-country vs selected-regions coverage
  - difficulty
  - title
  - characteristics
  - notes
  - Google Maps URL
- Manage clue images individually during edit:
  - keep existing images by default
  - remove an existing image
  - add new images
  - preserve image order
- Show country-region coverage based on all currently filtered clues for the selected country
- Distinguish visually between:
  - country-wide coverage
  - region-specific coverage

### Out of Scope

- Bulk editing multiple clues
- Drag-and-drop image reordering
- Multiple selected clues in the right-side detail panel
- Region zoom for training mode
- New backend aggregation endpoints

## User Experience

### Clue Editing

From the Atlas right panel, the user can click `Modifier` on the currently displayed clue.

That opens the existing clue editor UI in edit mode:

- the current clue data is preloaded
- existing images are shown as persisted assets
- each existing image can be removed individually
- new images can be added alongside remaining existing ones
- publication updates the same clue instead of creating a new one

The editor keeps the current step structure because it already matches the product mental model:

1. Images
2. Category
3. Location
4. Details
5. Difficulty and publish

The main visual change is that step 1 becomes a mixed media manager:

- existing images appear as editable cards
- newly added files appear in the same list
- removed persisted images are visually marked as removed or disappear immediately

### Country Region Zoom

When the user clicks `Zoomer sur {country}`, the map switches to country mode.

In country mode:

- the base country geometry remains visible
- a regional GeoJSON overlay is loaded for that country
- all clues matching the active filters for that country contribute to coverage
- whole-country clues are rendered as a country-wide coverage state
- region-targeted clues are rendered as highlighted regions on top

This produces a combined visual answer:

- "there is at least one clue that applies to the whole country"
- "these specific regions are additionally covered by filtered clues"

## Recommended Technical Approach

Reuse current front-end primitives instead of introducing a parallel editing page or a new specialized country endpoint.

### Why

- `ClueEditor` already contains the required UX flow and validation rules
- `AtlasPage` already has the selected clue and selected country context
- `atlasApi.load()` already returns enough clue-level data to compute aggregated coverage on the client
- this keeps token, query, and maintenance costs lower than adding custom database views or extra fetch paths

## Architecture

### 1. Clue Editor Modes

`ClueEditor` becomes a dual-purpose component:

- create mode
- edit mode

Create mode stays the default and should not change current behavior.

Edit mode accepts an initial clue payload that contains:

- clue id
- collection id
- category id
- country code
- coverage mode
- region ids
- difficulty
- title
- characteristics
- notes
- Google Maps URL
- existing image descriptors

The editor state should normalize this payload into the same local fields already used for creation so the form remains mostly shared.

### 2. Clue Persistence

`clueApi` gains an update flow separate from create.

The update flow should:

1. validate edited form data with the same schema layer used by create
2. update clue metadata in `clues`
3. replace `clue_regions` when coverage is regional
4. keep remaining existing images
5. upload newly added images
6. insert metadata rows for new images
7. delete removed image rows and storage objects
8. normalize sort order across all remaining and added images

The update path should not create a new clue id.

### 3. Atlas Data Shape

`atlasApi.load()` should expose enough structure to support both the detail panel and region aggregation.

Each clue should include:

- `coverage`
- `regionIds`
- `regionNames`

The current region list only contains names. For regional highlighting, ids are the stable key and should be included in the Atlas clue model.

### 4. Region Coverage Aggregation

Country coverage should be computed on the client from the already filtered clue list.

For the selected country:

- `hasWholeCountryCoverage = any clue.coverage === "whole_country"`
- `coveredRegionIds = union of all clue.regionIds where coverage === "selected_regions"`

This aggregation should be derived from the same active filters already applied in Atlas:

- selected category
- selected difficulty values
- search filtering

No extra query is needed.

### 5. Atlas Map Region Layer

`AtlasMap` should support a second overlay in country viewport:

- load `/geography/regions/{countryCode}.geojson`
- render a region fill layer
- render separate styles for:
  - neutral regions
  - covered regions
  - selected-country whole-coverage backdrop

If the geography file is unavailable for a country, the app should keep the country zoom and fail gracefully without crashing:

- keep the country map visible
- show no region overlay
- optionally keep the text panel coverage summary only

## File-Level Design

### Clue Editing

- `src/features/clues/ClueEditor.tsx`
  - add edit mode support
  - merge persisted and new image state
  - show existing image controls
- `src/features/clues/ClueEditorPage.tsx`
  - support route-driven create vs edit use
- `src/features/clues/clueApi.ts`
  - add `update(...)`
  - add image reconciliation logic
- `src/features/clues/clueSchema.ts`
  - support edit validation constraints if needed
- `src/features/clues/*.test.tsx|ts`
  - cover prefill, update flow, image reconciliation

### Atlas Region Zoom

- `src/features/atlas/atlasApi.ts`
  - return coverage metadata and region ids
- `src/features/atlas/AtlasPage.tsx`
  - add edit action
  - compute aggregated regional coverage
  - pass regional overlay props into map
- `src/features/atlas/AtlasMap.tsx`
  - add country-region GeoJSON overlay support
  - style whole-country and region-level coverage distinctly
- `src/features/geography/geographyApi.ts`
  - reuse or extend existing region GeoJSON loader/query helpers

## Data Flow

### Edit Flow

1. User opens Atlas
2. User selects a country and sees a clue
3. User clicks `Modifier`
4. App loads the clue into `ClueEditor`
5. User changes metadata and image set
6. `clueApi.update(...)` reconciles:
   - metadata
   - region links
   - persisted images kept
   - persisted images removed
   - new images uploaded
7. Atlas query invalidates and refreshes
8. Updated clue remains visible on the map and in the detail panel

### Country Region Flow

1. Atlas filters produce a filtered clue set
2. Selected country is derived from visible markers
3. `AtlasPage` aggregates whole-country and regional coverage from that country's filtered clues
4. `AtlasMap` receives:
   - selected country code
   - viewport mode
   - `hasWholeCountryCoverage`
   - `coveredRegionIds`
5. `AtlasMap` loads and renders the country region overlay when available

## Image Reconciliation Rules

To keep editing predictable:

- Existing images keep their ids and storage paths unless removed
- New uploads get new ids and storage paths
- If the user removes an existing image, both:
  - the `clue_images` row
  - the corresponding storage object
  must be deleted
- Sort order is recomputed from the final visible image list
- At least one total image must remain after editing

This means validation should be based on the final combined image set, not just the newly uploaded files.

## Error Handling

### Editing

- If metadata update fails, show a blocking editor error and keep form state
- If a new image upload fails, report the failure and avoid partial silent success
- If cleanup of removed images fails after metadata changes, surface a clear error and log enough context for diagnosis
- If the clue becomes invalid after edits, preserve local form values and show field-level or step-level validation feedback

### Region Overlay

- If region GeoJSON is missing or cannot be loaded:
  - do not hide the country map
  - do not crash Atlas
  - fall back to country-only zoom

## Testing Strategy

### Unit / Component Tests

- `ClueEditor` create mode remains unchanged
- `ClueEditor` edit mode preloads fields correctly
- existing images render in edit mode
- removing an existing image updates local state
- adding new images in edit mode works with existing images
- publish in edit mode calls `clueApi.update(...)`
- validation rejects final image count of zero

### API Tests

- `clueApi.update(...)` updates clue metadata
- replaces regional links correctly
- uploads only new images
- deletes only removed existing images
- recomputes `sort_order`
- preserves unchanged persisted images

### Atlas Tests

- `atlasApi` includes coverage mode and region ids
- `AtlasPage` computes aggregated region coverage from filtered clues
- whole-country and region-specific coverage can coexist
- `AtlasMap` renders region overlay props correctly
- missing region GeoJSON fails gracefully

## Performance Notes

To keep the app lightweight:

- do not refetch all clue details separately for edit if Atlas already has enough metadata; only fetch more if image metadata is incomplete
- keep region aggregation client-side and memoized
- load region GeoJSON only when entering country viewport
- cache country region GeoJSON by country code through the existing geography query layer

## Risks And Mitigations

### Risk: image update logic becomes brittle

Mitigation:

- model persisted images and new uploads explicitly as separate item kinds in local state
- centralize reconciliation in `clueApi.update(...)`
- test deletion, addition, and mixed reorder cases directly

### Risk: region overlays complicate the map state machine

Mitigation:

- keep the current world marker logic untouched
- add region overlay only as a conditional country-viewport concern
- avoid mixing marker filtering and overlay geometry loading logic

## Acceptance Criteria

- A user can open an existing clue and edit it without recreating it
- Existing images can be kept, removed individually, and supplemented with new uploads
- The edited clue remains on the same atlas flow after refresh
- Clicking `Zoomer sur {country}` shows region-level coverage for all filtered clues in that country
- Whole-country coverage and explicit region coverage are both visible when both exist
- Failures in region loading do not remove the country map or crash the page
