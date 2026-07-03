# Secure Daily Challenge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the client-generated daily preset with one server-locked 10-question country challenge per Paris day, one resumable attempt per user, Premium XP/ranking, and a free-plan completion upsell.

**Architecture:** Supabase owns challenge generation, ordered items, attempt uniqueness, sequential answer validation, and Premium result persistence. React consumes a dedicated daily API and isolated card/dialog components; the standard quiz flow remains unchanged. Historical daily `training_sessions` remain readable while new attempts feed revised daily leaderboard RPCs.

**Tech Stack:** PostgreSQL/Supabase RPC and RLS, generated TypeScript database types, React 19, TanStack Query, Vitest, Testing Library, pgTAP, Docker Compose.

---

### Task 1: Daily schema and RLS boundary

**Files:**
- Create via CLI: migration ending in `secure_daily_challenge.sql`
- Modify: `supabase/tests/rls.test.sql`
- Modify: `scripts/validate-migrations.test.mjs`

- [ ] **Step 1: Create the migration**

Run `npx supabase migration new secure_daily_challenge`, then resolve it with:

```powershell
$migration = (Get-ChildItem supabase/migrations/*_secure_daily_challenge.sql).FullName
```

- [ ] **Step 2: Write a failing static migration test**

Add a test that discovers the suffix and asserts `daily_challenges`, `daily_challenge_items`, `daily_challenge_attempts`, `daily_attempt_steps`, RLS, `set search_path = ''`, and revoked RPC execution. Run `npm run test:migrations`; expect failure because the migration is empty.

- [ ] **Step 3: Create the schema**

Implement these exact constraints:

```sql
create table public.daily_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_date date not null unique,
  collection_id uuid not null references public.collections(id),
  category_id uuid not null references public.categories(id),
  mode text not null default 'world' check (mode = 'world'),
  question_count integer not null default 10 check (question_count = 10),
  created_at timestamptz not null default clock_timestamp()
);

create table public.daily_challenge_items (
  challenge_id uuid not null references public.daily_challenges(id) on delete cascade,
  position smallint not null check (position between 1 and 10),
  clue_id uuid not null references public.clues(id),
  primary key (challenge_id, position),
  unique (challenge_id, clue_id)
);

create table public.daily_challenge_attempts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.daily_challenges(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  is_premium boolean not null,
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  current_position smallint not null default 1 check (current_position between 1 and 11),
  correct_answers integer,
  duration_ms bigint,
  xp_delta integer,
  unique (challenge_id, user_id)
);

create table public.daily_attempt_steps (
  attempt_id uuid not null references public.daily_challenge_attempts(id) on delete cascade,
  position smallint not null check (position between 1 and 10),
  is_correct boolean not null,
  answered_at timestamptz not null default clock_timestamp(),
  primary key (attempt_id, position)
);
```

Enable RLS on all tables. Authenticated users may select only their own attempt row. Revoke all direct writes and all direct access to items/steps from `anon` and `authenticated`.

- [ ] **Step 4: Add pgTAP tests and verify**

Extend the test plan and prove table existence, RLS, direct insert denial, own-attempt visibility, and cross-user invisibility. Run `npm run test:migrations`; expect pass.

- [ ] **Step 5: Commit**

```powershell
git add -- $migration scripts/validate-migrations.test.mjs supabase/tests/rls.test.sql
git commit -m "feat: add secure daily challenge schema"
```

### Task 2: Generate one deterministic Paris-day challenge

**Files:**
- Modify: migration ending in `secure_daily_challenge.sql`
- Modify: `supabase/tests/rls.test.sql`

- [ ] **Step 1: Write failing pgTAP generation tests**

Seed one official category with 9 illustrated clues and one with 12. Assert `get_or_create_daily_challenge()` skips the first, returns `question_count = 10` and `mode = 'world'`, creates ten unique ordered items, and returns the same challenge/items on a second call.

- [ ] **Step 2: Run tests and verify RED**

Run `npm run test:migrations`; when an isolated database is available also run `npx supabase test db`. Expect missing-RPC failures.

- [ ] **Step 3: Implement generation RPC**

Create an authenticated `SECURITY DEFINER` function with an empty search path. Compute:

```sql
challenge_day := (clock_timestamp() at time zone 'Europe/Paris')::date;
perform pg_advisory_xact_lock(hashtextextended(challenge_day::text, 0));
```

Choose only categories in official collections with at least ten published clues having a `clue_images` row. Sort eligible category IDs and rotate by days since `date '2026-01-01'`. Lock ten clues ordered by `md5(challenge_day::text || clue.id::text)`. Return only challenge ID/key, category ID/name, mode, question count, seconds until next Paris midnight, and attempt status.

- [ ] **Step 4: Lock execution and verify GREEN**

Revoke from `PUBLIC` and `anon`, grant to `authenticated`, then run migration tests.

- [ ] **Step 5: Commit**

```powershell
git add -- $migration supabase/tests/rls.test.sql
git commit -m "feat: generate a locked daily challenge"
```

### Task 3: Unique attempt, answer validation, completion, and XP

**Files:**
- Modify: migration ending in `secure_daily_challenge.sql`
- Modify: `supabase/tests/rls.test.sql`

- [ ] **Step 1: Write failing attempt tests**

Prove that start creates one attempt, second start resumes it, completed start raises `daily_attempt_already_completed`, another user's attempt is inaccessible, skipped/replayed answers fail, free completion purges steps and leaves result columns null, Premium completion persists score/chrono and applies normal XP plus 10, and an unfinished previous-day attempt blocks today's start.

- [ ] **Step 2: Verify RED**

Run migration tests; expect missing attempt-RPC failures.

- [ ] **Step 3: Implement start/resume**

Create `start_daily_challenge_attempt()` deriving `auth.uid()`, calling the challenge generator, rejecting an older unfinished attempt, deriving Premium via `public.has_premium_access()`, and using the `(challenge_id, user_id)` unique constraint. Return ordered questions from the locked items, image storage metadata, difficulty, and current progress. Do not return correct country codes.

- [ ] **Step 4: Implement sequential answer RPC**

Create `submit_daily_challenge_answer(uuid, smallint, text)` returning position, selected/correct country after validation, correctness, completion state, score, duration, XP delta/total, and `xp_awarded`. Lock the attempt `for update`, verify owner and exact current position, insert one step, and increment position.

- [ ] **Step 5: Finalize in the tenth-answer transaction**

Premium: calculate existing per-answer difficulty XP, add `10`, clamp total XP, persist score/duration/XP, and add one XP event associated with a new nullable `daily_attempt_id`. Free: return the computed result, mark completion, delete steps, and leave score/duration/XP null.

- [ ] **Step 6: Update daily leaderboard RPCs**

Read only completed Premium attempts; order by score descending, duration ascending, completion time ascending. Preserve the frontend DTO and expose no email or answers.

- [ ] **Step 7: Verify and commit**

Run migration tests (plus pgTAP when available), then:

```powershell
git add -- $migration supabase/tests/rls.test.sql
git commit -m "feat: secure daily attempts and premium xp"
```

### Task 4: TypeScript daily API

**Files:**
- Modify: `src/lib/database.types.ts`
- Modify: `src/features/training/trainingApi.ts`
- Modify: `src/features/training/trainingApi.test.ts`
- Create: `src/features/training/dailyChallenge.ts`
- Create: `src/features/training/dailyChallenge.test.ts`

- [ ] **Step 1: Write failing API tests**

Specify and test:

```ts
loadDailyChallenge(): Promise<DailyChallenge | null>;
startDailyAttempt(): Promise<DailyAttempt>;
submitDailyAnswer(input: DailyAnswerInput): Promise<DailyAnswerResult>;
```

Test `formatDailyCountdown(seconds)` at 0, 59, 3600, and 86399.

- [ ] **Step 2: Verify RED**

Run `npm run test -- src/features/training/trainingApi.test.ts src/features/training/dailyChallenge.test.ts`.

- [ ] **Step 3: Add exact generated database contracts**

Generate types from the linked project after migration application, or add exact table/RPC types matching the migration before push. `DailyChallengeQuestion` must not contain answer fields.

- [ ] **Step 4: Implement API mapping and errors**

Add immutable DTOs for `available`, `in_progress`, and `completed`. Map business errors to `already_completed`, `previous_attempt_in_progress`, and `unavailable`. Use only the three new RPCs for daily gameplay.

- [ ] **Step 5: Verify and commit**

Run focused tests and `npm run typecheck`, then commit the five files with `feat: add daily challenge client api`.

### Task 5: Daily card and free completion dialog

**Files:**
- Create: `src/features/training/DailyChallengeCard.tsx`
- Create: `src/features/training/DailyChallengeCard.test.tsx`
- Create: `src/features/training/DailyPremiumDialog.tsx`
- Create: `src/features/training/DailyPremiumDialog.test.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Write failing component tests**

Assert `Lancer le défi`, `Reprendre le défi`, no launch button when completed, ten questions, country mode, category, and countdown. Assert the dialog shows saved results, ranking, XP/ranks, statistics, `/pricing`, `Passer Premium - 1,99 EUR / mois`, and `Continuer gratuitement`, without claiming the future AI coach exists.

- [ ] **Step 2: Verify RED**

Run the two new component test files; expect missing imports.

- [ ] **Step 3: Implement accessible components**

Keep fetching outside these components. Use `role="dialog"`, `aria-modal="true"`, labelled heading, close/Escape support, and retain the result screen behind the dialog.

- [ ] **Step 4: Style mobile and verify GREEN**

Make actions full-width below 560px and prevent viewport overflow. Run focused tests, typecheck, and lint.

- [ ] **Step 5: Commit**

Commit the components, tests, and CSS with `feat: add daily challenge interface`.

### Task 6: Replace client generation in TrainingPage

**Files:**
- Modify: `src/features/training/TrainingPage.tsx`
- Modify: `src/features/training/TrainingPage.test.tsx`
- Modify: `src/features/training/trainingSession.ts`
- Modify: `src/features/training/trainingSession.test.ts`

- [ ] **Step 1: Write failing integration tests**

Test server challenge loading for free/Premium, start/resume with server questions, answer submission through the daily RPC, no second launch, Premium XP/rank/leaderboard, and free completion dialog. Assert the old client date/hash selection no longer controls gameplay.

- [ ] **Step 2: Verify RED**

Run TrainingPage and trainingSession tests.

- [ ] **Step 3: Integrate dedicated daily state**

Use query key `['training', 'daily-challenge']`. Standard sessions retain existing methods. Daily sessions use only `startDailyAttempt` and `submitDailyAnswer`; hydrate session questions/current position from the server. Never send `correctCode` or `isCorrect` from the browser.

- [ ] **Step 4: Add completion surfaces**

Premium shows performance XP, explicit `+10 XP`, `RankProgressCard`, and daily leaderboard link. Free preserves the local result and opens `DailyPremiumDialog` once.

- [ ] **Step 5: Remove obsolete generation**

Delete `hashDailyKey`, browser-date category selection, `pendingChallengeKey`, and the Premium visibility gate. Keep legacy row mapping only for historical data.

- [ ] **Step 6: Verify and commit**

Run focused tests, typecheck, and lint. Commit the four files with `feat: use server daily challenge flow`.

### Task 7: Production verification and Docker deployment

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the final rules**

Document ten identical country questions, one attempt, Paris reset, free non-persistent result, Premium XP/ranking, the upsell, and migration command.

- [ ] **Step 2: Run all checks**

```powershell
npm run test
npm run test:migrations
npm run typecheck
npm run lint
```

Expected: every command exits 0.

- [ ] **Step 3: Review and push the production migration**

Inspect `npx supabase migration list`, confirm only the intended migration is pending, run available database advisors, then `npx supabase db push`. Do not start a local Supabase stack.

- [ ] **Step 4: Smoke-test free and Premium accounts**

Verify identical category/order, one attempt, resume, free cleanup and upsell, Premium `+10 XP`, rank progress, and daily leaderboard entry.

- [ ] **Step 5: Rebuild Docker**

```powershell
docker compose up -d --build
docker compose ps
```

Expected: application and Caddy containers are running.

- [ ] **Step 6: Commit documentation**

Commit `README.md` with `docs: describe secure daily challenge`.
