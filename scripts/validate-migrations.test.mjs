import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("UPDATE OF trigger columns use commas instead of OR", () => {
  const migration = readFileSync(
    "supabase/migrations/202606100001_core_schema.sql",
    "utf8",
  );

  assert.doesNotMatch(
    migration,
    /update\s+of\s+[a-z_]+\s+or\s+(?!delete\b)[a-z_]+\s+on/gi,
  );
  assert.match(
    migration,
    /before update of country_code, coverage on public\.clues/i,
  );
  assert.match(
    migration,
    /before update of clue_id, storage_path or delete on public\.clue_images/i,
  );
});

test("auth bootstrap backfills profiles and protects trigger functions", () => {
  const migration = readFileSync(
    "supabase/migrations/202606100001_core_schema.sql",
    "utf8",
  );

  assert.match(
    migration,
    /insert into public\.profiles \(id, display_name, avatar_url\)[\s\S]+from auth\.users[\s\S]+on conflict \(id\) do nothing;/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.handle_new_user\(\) from public, anon, authenticated;/i,
  );
});
