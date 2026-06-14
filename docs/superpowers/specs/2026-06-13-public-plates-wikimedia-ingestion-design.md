# Public Plates Wikimedia Ingestion Design

## Goal

Populate the official public `Plaques` category with real open-license plate reference images for the 12 clues already present in the official collection, using Wikimedia Commons-backed sources stored in Supabase Storage.

## Scope

This V1 covers the 12 existing official plate clues only:

- France
- Spain
- Portugal
- Italy
- Germany
- United Kingdom
- Ireland
- Netherlands
- Belgium
- United States - California
- United States - New York
- United States - Texas

Later countries and regions can be added on the same ingestion path without changing the overall architecture.

## Source Strategy

- Use Wikimedia Commons as the upstream source of truth for reusable plate imagery.
- Keep the source mapping explicit and versioned in the repository rather than discovering files dynamically at import time.
- Store both the direct image URL used for download and the Wikimedia page URL used for attribution.
- Persist clear source and license metadata on each imported clue so official content remains auditable from the UI.

## Why This Approach

The project already has an idempotent import pattern for official categories. A repo-versioned dataset is the most stable extension of that pattern for plates because:

- it keeps source choices reviewable in git;
- it avoids fragile runtime search against Wikimedia APIs;
- it makes import reruns deterministic;
- it lets us manually curate good representative images instead of trusting automatic matching.

## Data Model

No schema change is required for this V1.

The existing `public.clues` provenance fields are sufficient:

- `source_name`
- `source_url`
- `license_name`
- `license_url`
- `attribution_text`

The existing `public.clue_images` table and `clue-images` Storage bucket remain the canonical place for rendered Atlas images.

## Dataset Structure

The existing `scripts/official-plates/plates.v1.json` file will be extended so each entry includes image provenance fields in addition to clue metadata.

Each entry should carry:

- clue id
- country code
- coverage
- optional region ids / region names
- title
- difficulty
- characteristics
- notes
- Wikimedia image download URL
- Wikimedia page URL
- source display name
- license display name
- license URL
- attribution text
- optional alt text override

The dataset remains the only curated source for plate-image selection in V1.

## Import Flow

1. Resolve the official collection and the `Plaques` category.
2. Load the local plate dataset from the repository.
3. Validate country and region references exactly as today.
4. For each dataset entry:
   - create or update the published clue metadata;
   - download the configured Wikimedia image;
   - detect the real image format from bytes instead of trusting headers alone;
   - upload the image into `clue-images` using the standard clue storage path convention;
   - upsert one `clue_images` row with deterministic ordering;
   - replace `clue_regions` for region-scoped US clues.
5. Remove or replace obsolete image metadata when an existing imported plate image is superseded by a new source path.
6. Print and persist an import summary with created, updated, failed, and skipped entries.

## Image Handling Rules

- The import must support at least PNG and JPEG, and ideally WebP if encountered.
- MIME type must be derived from file bytes when upstream headers are vague.
- Storage paths must remain deterministic so reruns update the same clue cleanly.
- If an entry already has one imported image, rerunning the import should replace it rather than creating duplicates.
- Failures on one clue must not abort the full import.

## UI Behavior

- Atlas should display the real imported plate image whenever one exists.
- The current SVG fallback can remain as a last-resort safety net for any official plate clue that still has no stored image.
- Atlas detail panels should continue displaying source and license metadata from the clue.

## Error Handling

The import should fail an entry, not the whole batch, when:

- the country code is unknown;
- the configured region cannot be resolved;
- the Wikimedia image URL is unavailable;
- the downloaded file is not a supported image format;
- Storage upload fails;
- image metadata upsert fails.

Each failure must include the clue id, the human label, and the formatted error message in the summary output.

## Verification

- `node --check scripts/official-plates/import-official-plates.mjs`
- targeted tests for Atlas plate-image fallback and real-image priority
- `npm run build`
- `docker compose up -d --build`

## Non-Goals

This V1 does not attempt to:

- discover plate images automatically from Wikimedia search;
- expand the category beyond the current 12 clues;
- introduce multiple official images per plate clue;
- create new schema for source catalogs;
- remove the fallback rendering entirely.

## Follow-Up

Once the 12 current clues are backed by real images, the next extension is to grow the dataset country by country using the same structure, then add more region-level US plates or other region-scoped countries as the geography catalog expands.
