# Public Plates Expansion Europe and US Design

## Goal

Populate the official public `Plaques` category with a broad reference set covering:

- one official clue per supported European country plate pattern;
- one official clue per US state plate pattern for all 50 states.

The result should make the official collection usable as a serious GeoGuessr training base rather than a small starter sample.

## Scope

This expansion keeps the existing public official collection model and extends only the `Plaques` sub-category.

Included in scope:

- expanding the curated plates dataset beyond the initial 12 entries;
- adding broad Europe coverage where a country-level plate clue is meaningful;
- adding all 50 US states as region-scoped clues under country `US`;
- assigning a difficulty level to every new clue;
- importing real open-license images and provenance metadata for the new entries;
- keeping Atlas behavior stable for existing official and private clues.

Out of scope:

- dynamic upstream discovery at runtime;
- non-open-license images;
- extra UI surfaces dedicated only to plate administration;
- multiple official plate variants per country or state in this pass;
- schema changes unless a hard blocker is discovered.

## Why This Approach

The project already has a good ingestion path for official categories:

- repo-versioned dataset;
- deterministic import script;
- Supabase Storage-backed images;
- Atlas rendering that can consume either stored images or fallback visuals.

The most reliable way to scale from 12 clues to a reference collection is to stay on that pattern and grow the curated dataset rather than invent a second import path.

This keeps the expansion:

- reviewable in git;
- rerunnable after fixes;
- easy to audit when a source image changes;
- compatible with public official moderation expectations.

## Coverage Model

### Europe

Europe should be covered primarily at country level:

- one clue per country where the national plate pattern is a useful training signal;
- `coverage: "whole_country"` for those entries;
- country code resolved against the existing `countries` catalog.

The target set should prioritize:

- EU and EEA countries;
- UK and Ireland;
- Balkan and Eastern European countries already present in the geography catalog;
- other European countries supported by the current country table and region assets.

Small states can be included when a clean open-license representative plate image exists and the country is already present in the geography catalog.

### United States

The US should be covered with one clue per state:

- `countryCode: "US"`
- `coverage: "selected_regions"`
- exactly one region id per clue, matching the state code such as `US-CA`

This preserves the current training model where the user can descend from country level to regional targeting without needing a second category or special-case logic.

## Difficulty Model

Each clue must carry one of the existing difficulty values:

- `easy`
- `medium`
- `hard`

Difficulty should be assigned editorially using recognition strength rather than political or administrative importance.

Recommended heuristics:

- `easy`: very distinctive color scheme, typography, or layout;
- `medium`: recognizable with some confidence but confusable with nearby formats;
- `hard`: visually subtle, generic, or easily mistaken for another country or state.

For US states, the rating should reflect GeoGuessr usefulness:

- very iconic state plates can be `easy`;
- common but less unique designs can be `medium`;
- near-generic white plates should be `hard`.

## Data Sources

The curated dataset remains the source of truth for official plate ingestion.

Preferred source strategy:

- use Wikimedia Commons file pages as the canonical attribution page;
- use direct file paths or rasterized variants for the downloaded asset;
- persist source and license metadata on each clue;
- prefer images that are clean, frontal, and representative of the plate pattern the clue is teaching.

If an image is technically valid but poor for training, it should be replaced in the dataset rather than accepted as-is.

## Dataset Structure

The existing `scripts/official-plates/plates.v1.json` dataset remains the control file for import.

Each entry should include:

- stable clue id;
- country code;
- coverage type;
- optional region ids and region names;
- title;
- difficulty;
- characteristics;
- notes;
- source name;
- source URL;
- license name;
- license URL;
- attribution text;
- image URL;
- optional image alt text.

The file may become large, but keeping one authoritative dataset is still preferable to fragmenting the import logic during this phase.

## Import Behavior

The importer should continue to behave idempotently:

1. Resolve the official collection and `Plaques` category.
2. Load countries and regions from Supabase.
3. Load the local dataset.
4. For each entry:
   - validate country and region references;
   - create or update the clue metadata;
   - replace region bindings for region-scoped entries;
   - download and validate the configured image;
   - upload the image into `clue-images`;
   - keep one clean canonical image per clue;
   - preserve provenance metadata on the clue.
5. Persist a machine-readable summary of successes and failures.

The import must continue processing even if some entries fail due to:

- missing region rows in Supabase;
- upstream rate limiting;
- broken source URLs;
- unsupported image payloads;
- temporary storage errors.

## Operational Constraints

This expansion is large enough that operational behavior matters:

- the script should remain safe to rerun after partial failure;
- failure summaries must be detailed enough to resume curation quickly;
- source throttling, especially from Wikimedia, should be handled with retry and backoff;
- the import should not create duplicate clues or duplicate image rows.

Because the repo and remote database may drift, region resolution errors should be explicit and human-readable, especially for US states.

## Atlas and Training Impact

No new Atlas architecture is required for this expansion.

Expected behavior after import:

- official plate clues appear in the public official collection;
- country-level Europe clues highlight the relevant country;
- US state-level clues remain compatible with region targeting;
- stored images display in Atlas detail panels when available;
- difficulty colors and filtering remain driven by existing application logic.

This work should not reintroduce the earlier issue where country selection causes the map to disappear.

## Verification

Minimum verification for the expansion:

- `node --check scripts/official-plates/import-official-plates.mjs`
- targeted tests covering Atlas image priority and fallback behavior
- `npm run build`
- `docker compose up -d --build`

Content verification should also include:

- sample manual inspection of imported Europe clues;
- sample manual inspection of imported US state clues;
- validation that difficulty filters still behave correctly on the Atlas page.

## Risks and Mitigations

### Risk: source inconsistency

Some states or countries may only have mediocre reference images.

Mitigation:

- keep the dataset curated by hand;
- reject weak sources when they would make training worse;
- allow partial completion with explicit failure tracking.

### Risk: remote region catalog mismatch

The remote `regions` table may not yet contain every expected US state row even if the frontend GeoJSON exists.

Mitigation:

- keep importer errors explicit;
- seed or repair missing region records separately if needed;
- do not weaken validation to "best effort" silent imports.

### Risk: Wikimedia throttling

Bulk imports can trigger `429` responses.

Mitigation:

- keep retry and backoff behavior;
- support reruns after partial completion;
- avoid unnecessary re-downloads when unchanged data can be detected later.

## Non-Goals

This design does not attempt to:

- build a generic ingestion framework for every future category;
- add multiple example images per plate clue;
- infer plate difficulty automatically;
- store every historical plate variant;
- add a dedicated admin UI for official plate curation.

## Follow-Up

Once Europe and all 50 US states are covered, the next logical extensions are:

- add more region-scoped plate metas for countries where subnational variation matters;
- broaden official collections for other categories using the same provenance model;
- surface clearer Atlas coverage indicators for countries and regions that already have official training material.
