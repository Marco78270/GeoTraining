# Public Flags Ingestion Design

## Goal

Populate the official public collection `Drapeaux des pays` with one published clue per country from the current geography catalog, using real flag images stored in Supabase Storage.

## Source Strategy

- Use FlagCDN / Flagpedia as the automated upstream source for the initial import.
- Persist attribution metadata on each clue so the official collection keeps a visible provenance trail.
- Keep the ingestion idempotent so it can be re-run after fixes, new countries, or source refreshes.

## Data Model

Add nullable provenance fields on `public.clues`:

- `source_name`
- `source_url`
- `license_name`
- `license_url`
- `attribution_text`

These fields are optional for private clues and filled for public official clues.

## Import Flow

1. Read the countries catalog from Supabase.
2. Resolve the official public collection and its `Drapeaux` category.
3. For each country:
   - build the upstream flag URL from the ISO-3166 alpha-2 code;
   - download the PNG flag image;
   - create or update a published clue titled `Drapeau - <Country>`;
   - upload the image into the existing `clue-images` bucket with the standard clue path convention;
   - upsert one `clue_images` row;
   - store source and license metadata on the clue.
4. Print a summary with created, updated, skipped, and failed countries.

## Operational Constraints

- The ingestion script requires `SUPABASE_SERVICE_ROLE_KEY` because it must write both database rows and Storage objects for the official collection.
- The script must be safe to run multiple times without creating duplicate clues for a country in the same category.
- Failures on one country must not abort the entire import.

## UI

- Atlas detail panels should display the source and license when present.
- Existing private clue creation and editing flows remain unchanged.

## Verification

- Typecheck must pass.
- Build must pass.
- The import script should support a dry run mode to validate country resolution before uploading files.
