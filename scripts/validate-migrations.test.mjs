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

test("secure daily challenge migration defines locked tables and RPC boundaries", () => {
  const migrationFile = readdirSync("supabase/migrations").find((file) =>
    file.endsWith("_secure_daily_challenge.sql"),
  );

  assert.ok(
    migrationFile,
    "La migration secure_daily_challenge doit exister.",
  );

  const migration = readFileSync(
    `supabase/migrations/${migrationFile}`,
    "utf8",
  );

  assert.match(
    migration,
    /create table public\.daily_challenges\s*\([\s\S]*challenge_date date not null unique[\s\S]*collection_id uuid not null references public\.collections\(id\)[\s\S]*category_id uuid not null references public\.categories\(id\)[\s\S]*mode text not null default 'world' check \(mode = 'world'\)[\s\S]*question_count integer not null default 10 check \(question_count = 10\)[\s\S]*created_at timestamptz not null default clock_timestamp\(\)[\s\S]*\);/i,
  );
  assert.match(
    migration,
    /create table public\.daily_challenge_items\s*\([\s\S]*challenge_id uuid not null references public\.daily_challenges\(id\) on delete cascade[\s\S]*position smallint not null check \(position between 1 and 10\)[\s\S]*clue_id uuid not null references public\.clues\(id\)[\s\S]*primary key \(challenge_id, position\)[\s\S]*unique \(challenge_id, clue_id\)[\s\S]*\);/i,
  );
  assert.match(
    migration,
    /create table public\.daily_challenge_attempts\s*\([\s\S]*id uuid primary key default gen_random_uuid\(\)[\s\S]*challenge_id uuid not null references public\.daily_challenges\(id\)[\s\S]*user_id uuid not null references auth\.users\(id\) on delete cascade[\s\S]*is_premium boolean not null[\s\S]*started_at timestamptz not null default clock_timestamp\(\)[\s\S]*completed_at timestamptz[\s\S]*current_position smallint not null default 1 check \(current_position between 1 and 11\)[\s\S]*correct_answers integer[\s\S]*duration_ms bigint[\s\S]*xp_delta integer[\s\S]*unique \(challenge_id, user_id\)[\s\S]*\);/i,
  );
  assert.match(
    migration,
    /create table public\.daily_attempt_steps\s*\([\s\S]*attempt_id uuid not null references public\.daily_challenge_attempts\(id\) on delete cascade[\s\S]*position smallint not null check \(position between 1 and 10\)[\s\S]*is_correct boolean not null[\s\S]*answered_at timestamptz not null default clock_timestamp\(\)[\s\S]*primary key \(attempt_id, position\)[\s\S]*\);/i,
  );

  assert.match(migration, /alter table public\.daily_challenges enable row level security/i);
  assert.match(migration, /alter table public\.daily_challenge_items enable row level security/i);
  assert.match(migration, /alter table public\.daily_challenge_attempts enable row level security/i);
  assert.match(migration, /alter table public\.daily_attempt_steps enable row level security/i);
  assert.match(
    migration,
    /create policy "users can read own daily challenge attempts"[\s\S]*on public\.daily_challenge_attempts for select[\s\S]*to authenticated[\s\S]*using \(\(select auth\.uid\(\)\) = user_id\);/i,
  );

  assert.match(
    migration,
    /revoke all on public\.daily_challenges from public, anon, authenticated;/i,
  );
  assert.match(
    migration,
    /revoke all on public\.daily_challenge_items from public, anon, authenticated;/i,
  );
  assert.match(
    migration,
    /revoke all on public\.daily_challenge_attempts from public, anon, authenticated;/i,
  );
  assert.match(
    migration,
    /revoke all on public\.daily_attempt_steps from public, anon, authenticated;/i,
  );
  assert.match(
    migration,
    /grant select on public\.daily_challenge_attempts to authenticated;/i,
  );

  assert.match(migration, /set search_path = ''/i);
  assert.match(
    migration,
    /revoke all on function public\.get_or_create_daily_challenge\(\) from public, anon, authenticated;/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.start_daily_challenge_attempt\(\) from public, anon, authenticated;/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.submit_daily_challenge_answer\(uuid, smallint, text\) from public, anon, authenticated;/i,
  );
});

test("training session RPC keeps a single PostgREST signature", () => {
  const migrationFile = readdirSync("supabase/migrations").find((file) =>
    file.endsWith("_remove_legacy_training_session_rpc.sql"),
  );

  assert.ok(
    migrationFile,
    "La migration remove_legacy_training_session_rpc doit exister.",
  );

  const migration = readFileSync(
    `supabase/migrations/${migrationFile}`,
    "utf8",
  );

  assert.match(
    migration,
    /drop function if exists public\.start_training_session\(\s*uuid,\s*uuid,\s*public\.training_mode,\s*text,\s*integer\s*\);/i,
  );
});

test("daily challenge does not block a new day after an unfinished attempt", () => {
  const migrationFile = readdirSync("supabase/migrations").find((file) =>
    file.endsWith("_allow_new_daily_attempt_after_expired_day.sql"),
  );

  assert.ok(
    migrationFile,
    "La migration allow_new_daily_attempt_after_expired_day doit exister.",
  );

  const migration = readFileSync(
    `supabase/migrations/${migrationFile}`,
    "utf8",
  );

  assert.match(migration, /create function public\.start_daily_challenge_attempt\(\)/i);
  assert.doesNotMatch(migration, /daily_previous_attempt_in_progress/i);
});

test("daily challenge resume restores progress and supports XP idempotency", () => {
  const migrationFile = readdirSync("supabase/migrations").find((file) =>
    file.endsWith("_fix_daily_challenge_resume.sql"),
  );

  assert.ok(
    migrationFile,
    "La migration fix_daily_challenge_resume doit exister.",
  );

  const migration = readFileSync(
    `supabase/migrations/${migrationFile}`,
    "utf8",
  );

  assert.match(migration, /create unique index xp_events_daily_attempt_id_key\s+on public\.xp_events \(daily_attempt_id\);/i);
  assert.match(migration, /started_at timestamptz/i);
  assert.match(migration, /answered_steps jsonb/i);
  assert.match(migration, /from public\.daily_attempt_steps as step/i);
});

test("global daily challenge mixes official categories and exposes daily-only rankings", () => {
  const migrationFile = readdirSync("supabase/migrations").find((file) =>
    file.endsWith("_global_daily_challenge_leaderboards.sql"),
  );

  assert.ok(
    migrationFile,
    "La migration global_daily_challenge_leaderboards doit exister.",
  );

  const migration = readFileSync(
    `supabase/migrations/${migrationFile}`,
    "utf8",
  );

  assert.match(migration, /alter column category_id drop not null/i);
  assert.match(migration, /partition by[\s\S]*clue\.category_id/i);
  assert.match(migration, /category_round/i);
  assert.match(migration, /compute_daily_leaderboard_points/i);
  assert.match(migration, /get_global_daily_leaderboard/i);
  assert.match(migration, /get_my_global_daily_leaderboard_progress/i);
  assert.match(migration, /'Toutes les categories'/i);
  assert.doesNotMatch(
    migration,
    /create (?:or replace )?function public\.get_daily_challenge_leaderboard[\s\S]+from public\.training_sessions/i,
  );
});

test("preproduction database lint fixes preserve XP idempotency and complete collection rows", () => {
  const migrationFile = readdirSync("supabase/migrations").find((file) =>
    file.endsWith("_fix_preproduction_database_lint.sql"),
  );

  assert.ok(migrationFile, "La migration de stabilisation preproduction doit exister.");
  const migration = readFileSync(`supabase/migrations/${migrationFile}`, "utf8");

  assert.match(
    migration,
    /add constraint xp_events_training_session_id_key\s+unique \(training_session_id\)/i,
  );
  assert.match(migration, /select collection\.\*\s+into strict created_collection/i);
  assert.match(migration, /revoke all on function public\.create_collection\(text, text\)/i);
});

test("production edge functions keep their authentication boundaries explicit", () => {
  const config = readFileSync("supabase/config.toml", "utf8");
  const adminFunction = readFileSync(
    "supabase/functions/admin-user-management/index.ts",
    "utf8",
  );

  assert.match(
    config,
    /\[functions\.stripe-webhook\][\s\S]*verify_jwt\s*=\s*false/i,
  );
  for (const functionName of [
    "admin-user-management",
    "billing-session",
    "send-collection-invite",
  ]) {
    assert.match(
      config,
      new RegExp(`\\[functions\\.${functionName}\\]\\s*verify_jwt\\s*=\\s*true`, "i"),
    );
  }
  assert.match(adminFunction, /ADMIN_ALLOWED_ORIGINS/);
  assert.match(adminFunction, /admin_origin_not_allowed/);
  assert.doesNotMatch(
    adminFunction,
    /"Access-Control-Allow-Origin":\s*origin\s*\?\?\s*"\*"/,
  );
});

test("the HTTPS reverse proxy sends baseline browser security headers", () => {
  const caddyfile = readFileSync("docker/caddy/Caddyfile", "utf8");

  assert.match(caddyfile, /Strict-Transport-Security/i);
  assert.match(caddyfile, /Content-Security-Policy/i);
  assert.match(caddyfile, /frame-ancestors 'none'/i);
  assert.match(caddyfile, /object-src 'none'/i);
});
