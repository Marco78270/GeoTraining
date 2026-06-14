import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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

test("official GeoGuessr meta categories are seeded idempotently", () => {
  const migrationFile = readdirSync("supabase/migrations").find((file) =>
    file.endsWith("_add_official_meta_categories.sql"),
  );

  assert.ok(
    migrationFile,
    "La migration add_official_meta_categories doit exister.",
  );

  const migration = readFileSync(
    `supabase/migrations/${migrationFile}`,
    "utf8",
  );

  assert.match(migration, /f1000000-0000-0000-0000-000000000004/i);
  assert.match(migration, /f1000000-0000-0000-0000-000000000005/i);
  assert.match(migration, /f1000000-0000-0000-0000-000000000006/i);
  assert.match(migration, /f0000000-0000-0000-0000-000000000001/i);
  assert.match(migration, /Marquages au sol/);
  assert.match(migration, /Poteaux électriques/);
  assert.match(migration, /Google Car/);
  assert.match(migration, /'road'/);
  assert.match(migration, /'pole'/);
  assert.match(migration, /'car'/);
  assert.match(migration, /#F2C94C/i);
  assert.match(migration, /#A78BFA/i);
  assert.match(migration, /#38BDF8/i);
  assert.match(migration, /on conflict \(id\) do update/i);
});
