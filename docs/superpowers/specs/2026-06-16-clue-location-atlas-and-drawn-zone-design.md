# Clue Location Atlas And Drawn Zone Design

## Goal

Replace the clue editor's region checklist with an Atlas-driven location workflow, and add a third coverage mode that lets the user draw and save a custom polygon zone as GeoJSON.

## Context

The current clue editor supports two coverage modes:

- `whole_country`
- `selected_regions`

For `selected_regions`, the editor loads a flat list of regions and asks the user to tick checkboxes. That works functionally, but it is disconnected from the rest of the product, where Atlas and Training are both map-centric. The requested change is to make location selection visual and coherent with the rest of the app.

The existing code already provides a strong base:

- `src/features/clues/ClueEditor.tsx` owns the creation/edit flow.
- `src/features/geography/geographyApi.ts` exposes countries and regions.
- `src/features/atlas/AtlasMap.tsx` and `src/features/training/TrainingMap.tsx` already handle map rendering, region highlighting, and click interaction.
- The database currently stores regional coverage through `coverage = 'selected_regions'` plus `public.clue_regions`.

## User Requirements

### 1. Atlas instead of region list

In the clue location step, the user should choose the country, then interact directly with the map to define the clue location instead of using a region checklist.

### 2. Third location mode

In addition to `Pays entier` and `Régions`, the user should be able to choose a third option and draw a free polygon zone.

### 3. Drawn zone must be real data

The drawn area must be stored as real geometry, not only as a visual overlay or a derived list of regions. The chosen format is GeoJSON polygon data attached to the clue.

## Product Design

### Location Modes

The location step becomes a three-mode selector:

1. `Pays entier`
2. `Régions sur l'Atlas`
3. `Zone dessinée`

The user flow is:

1. Choose the country.
2. Choose the coverage mode.
3. Define the area on the map according to the selected mode.

### Mode 1: Pays entier

Behavior remains the same conceptually:

- the clue covers the full country;
- no region rows are stored;
- no drawn geometry is stored;
- the map zooms to the selected country and shows it as fully covered.

### Mode 2: Régions sur l'Atlas

The region checklist is removed from the editor UI and replaced with map interaction:

- when a country is selected, the map loads that country's regional GeoJSON;
- each region becomes clickable on the map;
- clicking toggles the region selection;
- selected regions are visually highlighted;
- a compact summary remains visible under the map, such as:
  - selected count,
  - selected region names,
  - clear selection action.

Important behavior:

- if the user switches from `Pays entier` to `Régions`, the initial selection starts empty;
- if every region of the country is selected, the UI may suggest switching back to `Pays entier`, but does not force it automatically in v1;
- only valid regions for the chosen country can be selected.

### Mode 3: Zone dessinée

The user draws a polygon directly on the map:

- click to place vertices;
- each new click adds a point;
- the current path is previewed live;
- double-click or a dedicated `Terminer` button closes the polygon;
- `Annuler le dernier point` and `Recommencer` actions are available;
- once completed, the polygon fill is shown on the map.

Constraints for v1:

- one polygon per clue;
- no holes;
- no multipolygon editing;
- drawing is constrained to the selected country context in the UI, but the stored geometry remains the polygon the user drew;
- the polygon must contain at least 3 distinct points before it can be completed.

This keeps the feature practical without introducing a full GIS editor.

## Data Model Design

### Coverage Enum

The existing `public.coverage_mode` enum must expand from:

- `whole_country`
- `selected_regions`

to:

- `whole_country`
- `selected_regions`
- `drawn_zone`

### New Geometry Storage

Add a dedicated storage structure for clue-drawn geometry.

Recommended approach:

- create a new table `public.clue_zones`
- one row per clue max in v1
- store the polygon as `jsonb` GeoJSON

Proposed shape:

- `clue_id uuid primary key references public.clues(id) on delete cascade`
- `geojson jsonb not null`
- `created_at timestamptz`
- `updated_at timestamptz`

Why a dedicated table instead of a nullable `geojson` column on `clues`:

- keeps geometry concerns isolated from the main clue row;
- mirrors the current split between clue core data and clue regional children;
- scales better if we later support multiple polygons or advanced geometry metadata.

### Data Rules

Validation rules:

- `whole_country` => no `clue_regions`, no `clue_zones`
- `selected_regions` => at least one `clue_regions` row, no `clue_zones`
- `drawn_zone` => one `clue_zones` row, no `clue_regions`

The clue publication rules should extend accordingly so a published clue cannot enter an invalid hybrid state.

## UI Architecture

### Editor Structure

The current step layout in `ClueEditor.tsx` is already good enough, but the location step is becoming too rich to keep inline. The location UI should be extracted into a focused component, for example:

- `src/features/clues/ClueLocationStep.tsx`

Responsibilities:

- country selection;
- coverage mode selection;
- region or polygon interaction state;
- rendering the map and location summary.

### Map Component

Introduce a dedicated editor map component, for example:

- `src/features/clues/ClueLocationMap.tsx`

Responsibilities:

- render selected country boundaries;
- render country regions when relevant;
- manage region click selection;
- manage polygon drawing interaction;
- emit structured callbacks back to the form state.

This component should reuse patterns from `TrainingMap.tsx` rather than duplicating ad hoc map logic inside `ClueEditor.tsx`.

### State Shape In Editor

The editor state should evolve from:

- `coverage`
- `selectedRegionIds`

to:

- `coverage`
- `selectedRegionIds`
- `drawnZoneGeoJson`
- transient drawing state for the current polygon being edited

For edit mode:

- existing region-based clues preload their selected regions;
- existing drawn-zone clues preload their polygon and display it immediately on the map.

## API Design

### Create Flow

The create payload should evolve so it can carry either:

- `regionIds` for `selected_regions`
- `zoneGeoJson` for `drawn_zone`

The parser and schema validation must enforce mutually exclusive payloads.

### Update Flow

The update flow should mirror the same exclusivity and support switching safely:

- regions -> whole country
- regions -> drawn zone
- drawn zone -> regions
- drawn zone -> whole country
- whole country -> regions
- whole country -> drawn zone

On every transition, the old location children must be replaced cleanly:

- remove `clue_regions` when leaving `selected_regions`
- remove `clue_zones` when leaving `drawn_zone`

## Atlas Behavior After Save

The feature should not stop at editing. Saved location data must remain meaningful in Atlas.

### For `selected_regions`

Current Atlas behavior already supports regional highlighting and can continue to work after the input method changes from checklist to map clicks.

### For `drawn_zone`

Atlas should display the saved polygon overlay when the clue is selected.

In v1:

- the clue still belongs to a country;
- the country remains the primary selection unit in Atlas lists and Training summaries;
- the polygon is an additional overlay in Atlas detail view.

This gives immediate user value without changing quiz answer logic yet.

## Training Behavior

The new drawn-zone mode should not expand quiz complexity in the first iteration.

### v1 Rule

Training continues to support:

- country-answer questions
- region-answer questions only for clues with `coverage = 'selected_regions'` and a single region target

For `drawn_zone` clues:

- they are playable in country mode;
- they are not used in region-answer mode in v1.

This avoids inventing a new “click the polygon” quiz interaction before the editor and Atlas flow are stable.

## Error Handling

### Editor Validation

Location step errors should be explicit:

- no country selected
- `selected_regions` with zero selected regions
- `drawn_zone` without completed polygon
- invalid polygon with fewer than 3 points

### Save Consistency

The create/update API should treat location data atomically:

- if clue core row updates but zone persistence fails, the whole operation should fail cleanly;
- when possible, cleanup logic should mirror the existing image cleanup discipline in `clueApi.ts`.

## Testing Strategy

### Unit / Component Tests

Add or extend tests for:

- location mode switching in editor
- region selection by map click
- drawn polygon creation and reset
- edit-mode preload for existing region clues
- edit-mode preload for existing drawn-zone clues
- schema validation for mutually exclusive `regionIds` / `zoneGeoJson`

### API Tests

Extend clue API tests for:

- create clue with `drawn_zone`
- update clue from `selected_regions` to `drawn_zone`
- update clue from `drawn_zone` to `selected_regions`
- cleanup of stale zone rows or stale region rows when switching modes

### Database / Migration Tests

Extend SQL tests for:

- valid publication with `drawn_zone`
- invalid publication with `drawn_zone` and no geometry
- invalid mix of `drawn_zone` plus `clue_regions`
- valid deletion cascade from clue to `clue_zones`

## Scope Boundaries

### Included

- Atlas-based region selection in clue editor
- new `drawn_zone` coverage mode
- GeoJSON polygon persistence
- Atlas display for saved polygons
- create/edit support

### Explicitly Not Included In This Iteration

- multipolygon editing
- polygon hole editing
- snapping polygons to region boundaries
- polygon-based quiz answer mode
- advanced GIS operations such as polygon intersection analytics

## Recommendation

Implement in this order:

1. replace region checklist with Atlas region selection
2. add `drawn_zone` schema and API support
3. add polygon drawing UI in the editor
4. render saved polygon overlays in Atlas

This sequence keeps the existing regional feature working while introducing the new geometry path in controlled steps.
