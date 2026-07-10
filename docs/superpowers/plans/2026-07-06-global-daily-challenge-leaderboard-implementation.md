# Global Daily Challenge Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace category leaderboards with a single mixed-category daily competition offering a per-day ranking and a cumulative points ranking, while loading real XP and premium state in the profile menu.

**Architecture:** `daily_challenges` and `daily_challenge_attempts` become the only competitive source. A mixed daily challenge stores no category ID, selects ten balanced official clues deterministically, and exposes dedicated day/global leaderboard RPCs; React maps those RPCs into a two-tab leaderboard page. Profile identity is loaded through the existing shared React Query profile key instead of reading cache opportunistically.

**Tech Stack:** React 19, TypeScript, TanStack Query, Supabase Postgres RPC, Vitest, pgTAP, Vite, Docker Compose.

---

## File Map

### Database

- Create via `npx supabase migration new global_daily_challenge_leaderboards`: the CLI-generated `supabase/migrations/*_global_daily_challenge_leaderboards.sql`
  - Makes `daily_challenges.category_id` nullable for mixed challenges.
  - Replaces daily generation with deterministic balanced category selection.
  - Adds authoritative daily points calculation.
  - Replaces category-scoped daily leaderboard RPCs with day/global RPCs.
- Modify: `supabase/tests/rls.test.sql`
  - Adds mixed-generation, free exclusion, daily ordering and cumulative-points tests.
- Modify: `scripts/validate-migrations.test.mjs`
  - Guards the mixed challenge schema and new RPC signatures without requiring a local database.
- Modify: `src/lib/database.types.ts`
  - Updates nullable mixed-category returns and leaderboard RPC return types.

### Training

- Modify: `src/features/training/trainingApi.ts`
  - Maps nullable category metadata and the global daily label.
- Modify: `src/features/training/trainingApi.test.ts`
  - Covers mixed daily payloads.
- Modify: `src/features/training/DailyChallengeCard.tsx`
  - Presents the mixed-category challenge and new leaderboard URL.
- Modify: `src/features/training/DailyChallengeCard.test.tsx`
  - Verifies mixed copy and URL.
- Modify: `src/features/training/TrainingPage.tsx`
  - Uses the date-only leaderboard route and preserves XP cache synchronization.
- Modify: `src/features/training/TrainingPage.test.tsx`
  - Covers daily URL and XP cache behavior.

### Leaderboard

- Rewrite: `src/features/leaderboard/leaderboardApi.ts`
  - Exposes `listDaily`, `listGlobal`, `loadMyDailyProgress`, and `loadMyGlobalProgress` only.
- Rewrite: `src/features/leaderboard/leaderboardApi.test.ts`
  - Tests both result models and exact RPC calls.
- Rewrite: `src/features/leaderboard/LeaderboardPage.tsx`
  - Removes categories and adds `Aujourd'hui` / `General` tabs.
- Rewrite: `src/features/leaderboard/LeaderboardPage.test.tsx`
  - Covers tabs, podium, pagination, current player and empty/error states.

### Profile

- Modify: `src/features/admin/ProfileMenu.tsx`
  - Loads the shared profile query and displays loading/error states honestly.
- Modify: `src/features/admin/ProfileMenu.test.tsx`
  - Proves a cache miss loads real XP and premium status.
- Reuse unchanged: `src/features/profile/profileApi.ts`
  - Remains the source for profile, XP and billing state.

### Styling and navigation

- Modify: `src/styles/global.css`
  - Adds leaderboard tabs and daily/global metric layouts.
- Modify: `src/app/App.test.tsx`
  - Keeps the protected `/leaderboard` route assertion aligned with the new heading.

## Task 1: Add Mixed Daily Challenge Generation

**Files:**
- Create: CLI-generated `supabase/migrations/*_global_daily_challenge_leaderboards.sql`
- Modify: `supabase/tests/rls.test.sql`
- Modify: `scripts/validate-migrations.test.mjs`

- [ ] **Step 1: Create the migration with the Supabase CLI**

Run:

```powershell
$env:SUPABASE_DISABLE_TELEMETRY='1'
npx supabase migration new global_daily_challenge_leaderboards
```

Expected: CLI prints one exact migration path ending in `_global_daily_challenge_leaderboards.sql`. Use that generated path for every migration edit and commit in this plan.

- [ ] **Step 2: Write failing migration-validation tests**

Extend `scripts/validate-migrations.test.mjs` to locate the generated migration by suffix and assert these exact structural decisions:

```js
test("global daily challenge mixes official categories", () => {
  const sql = readMigration("global_daily_challenge_leaderboards");
  assert.match(sql, /alter column category_id drop not null/i);
  assert.match(sql, /partition by clue\.category_id/i);
  assert.match(sql, /category_round/i);
  assert.match(sql, /compute_daily_leaderboard_points/i);
  assert.match(sql, /get_global_daily_leaderboard/i);
  assert.doesNotMatch(sql, /training_sessions[\s\S]+get_daily_challenge_leaderboard/i);
});
```

- [ ] **Step 3: Run validation and confirm RED**

Run: `npm run test:migrations`

Expected: FAIL because the generated migration is still empty.

- [ ] **Step 4: Make category nullable and redefine daily generation**

Add to the generated migration:

```sql
alter table public.daily_challenges
  alter column category_id drop not null;

create or replace function public.compute_daily_leaderboard_points(
  p_correct_answers integer,
  p_duration_ms bigint
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select
    10
    + greatest(0, least(10, coalesce(p_correct_answers, 0))) * 100
    + greatest(
        0,
        90 - floor(greatest(0, coalesce(p_duration_ms, 0))::numeric / 3334)::integer
      );
$$;
```

Recreate `get_or_create_daily_challenge()` with the existing Paris-day calculation and lock behavior, but replace category rotation with this selection model:

```sql
with eligible as (
  select
    collection.id as collection_id,
    collection.name as collection_name,
    clue.id as clue_id,
    clue.category_id,
    row_number() over (
      partition by collection.id, clue.category_id
      order by md5(challenge_day::text || clue.id::text), clue.id
    ) as category_round
  from public.collections as collection
  join public.clues as clue on clue.collection_id = collection.id
  where collection.is_official
    and clue.status = 'published'
    and exists (
      select 1 from public.clue_images as image where image.clue_id = clue.id
    )
), eligible_collections as (
  select collection_id, min(collection_name) as collection_name
  from eligible
  group by collection_id
  having count(*) >= 10
), selected_collection as (
  select *
  from eligible_collections
  order by md5(challenge_day::text || collection_id::text), collection_id
  limit 1
), balanced as (
  select eligible.*
  from eligible
  join selected_collection using (collection_id)
  order by
    eligible.category_round,
    md5(challenge_day::text || eligible.category_id::text),
    md5(challenge_day::text || eligible.clue_id::text),
    eligible.clue_id
  limit 10
)
select * from balanced;
```

Insert the challenge with `category_id = null`, `mode = 'world'`, `question_count = 10`, and insert the ten balanced rows into `daily_challenge_items` using a deterministic final position ordered by `md5(challenge_day::text || 'final' || clue_id::text), clue_id`.

Every RPC returning challenge metadata must use:

```sql
null::uuid as category_id,
'Toutes les categories'::text as category_name
```

Use `left join public.categories` wherever an older challenge with a non-null category must remain readable.

- [ ] **Step 5: Add pgTAP coverage for generation**

In `supabase/tests/rls.test.sql`, create at least three official categories with enough published image-backed clues, call `get_or_create_daily_challenge()` twice for the same Paris date, and assert:

```sql
select is((select count(*) from public.daily_challenge_items where challenge_id = :challenge_id), 10::bigint);
select ok((select count(distinct clue.category_id) >= 2 from public.daily_challenge_items item join public.clues clue on clue.id = item.clue_id where item.challenge_id = :challenge_id));
select is((select count(distinct id) from public.daily_challenges where challenge_date = :challenge_date), 1::bigint);
```

Also assert unpublished clues and clues without images are absent.

- [ ] **Step 6: Run migration tests**

Run: `npm run test:migrations`

Expected: PASS.

Run when the local Supabase stack is available: `npx supabase test db`

Expected: pgTAP passes with the updated plan count. If the project remains production-only, validate later in a transaction through `npx supabase db query --linked` before applying the migration.

- [ ] **Step 7: Commit database generation work**

```powershell
git add supabase/migrations/*_global_daily_challenge_leaderboards.sql supabase/tests/rls.test.sql scripts/validate-migrations.test.mjs
git commit -m "feat: generate mixed daily challenges"
```

## Task 2: Add Daily and Global Leaderboard RPCs

**Files:**
- Modify: CLI-generated `supabase/migrations/*_global_daily_challenge_leaderboards.sql`
- Modify: `supabase/tests/rls.test.sql`
- Modify: `src/lib/database.types.ts`

- [ ] **Step 1: Write failing pgTAP scenarios**

Add fixtures containing:

- two completed premium attempts for the same day with different accuracy and duration;
- one completed free attempt;
- premium attempts on a second day;
- one profile with `leaderboard_visible = false`.

Assert daily order, free exclusion, cumulative points and private personal progress. The critical point invariant is:

```sql
select is(
  public.compute_daily_leaderboard_points(8, 30000),
  892,
  'eight correct plus speed and participation totals 892 points'
);
select ok(
  public.compute_daily_leaderboard_points(9, 300000)
    > public.compute_daily_leaderboard_points(8, 1000),
  'one more correct always beats the maximum speed advantage'
);
```

- [ ] **Step 2: Confirm RED against current RPCs**

Run: `npm run test:migrations`

Expected: FAIL because global RPC declarations and signatures are absent.

- [ ] **Step 3: Replace the daily leaderboard signatures**

Drop the category-scoped overloads and define:

```sql
drop function if exists public.get_daily_challenge_leaderboard(uuid, uuid, text, integer, integer);
drop function if exists public.get_my_daily_challenge_leaderboard_progress(uuid, uuid, text);

create function public.get_daily_challenge_leaderboard(
  p_challenge_key text,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  rank bigint,
  correct_answers integer,
  accuracy_percent numeric,
  duration_ms bigint,
  daily_points integer,
  completed_at timestamptz,
  xp_total bigint,
  total_count bigint
)
language sql stable security definer set search_path = '';
```

Its query must join `daily_challenge_attempts -> daily_challenges -> collections -> profiles`, filter `challenge_date::text = p_challenge_key`, `is_premium`, completed/non-null score and official collection, then rank by correct answers descending, duration ascending, completion time, username, user ID.

- [ ] **Step 4: Add global leaderboard and personal-progress RPCs**

Define:

```sql
create function public.get_global_daily_leaderboard(
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  rank bigint,
  total_points bigint,
  participation_count bigint,
  correct_answers bigint,
  total_answers bigint,
  accuracy_percent numeric,
  total_duration_ms bigint,
  xp_total bigint,
  total_count bigint
);

create function public.get_my_daily_challenge_leaderboard_progress(p_challenge_key text)
returns table (rank bigint, correct_answers integer, accuracy_percent numeric, duration_ms bigint, daily_points integer, visible boolean);

create function public.get_my_global_daily_leaderboard_progress()
returns table (rank bigint, total_points bigint, participation_count bigint, correct_answers bigint, total_answers bigint, accuracy_percent numeric, total_duration_ms bigint, visible boolean);
```

Global aggregation must sum `compute_daily_leaderboard_points`, correct answers, question counts and duration per user. Public rows require `leaderboard_visible`; personal RPCs return the authenticated user's own aggregate even when hidden, with `rank = null` when excluded publicly.

Revoke all four RPCs from `public, anon, authenticated`, then grant execute only to `authenticated`. Keep `security definer`, empty search paths, and use `(select auth.uid())` in personal RPCs.

- [ ] **Step 5: Update generated TypeScript database types manually**

In `src/lib/database.types.ts`:

- make `get_or_create_daily_challenge` and `start_daily_challenge_attempt` category IDs nullable;
- replace the daily leaderboard arguments and returns exactly as above;
- add `get_global_daily_leaderboard` and `get_my_global_daily_leaderboard_progress`.

- [ ] **Step 6: Run typecheck and migration validation**

Run: `npm run test:migrations && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit leaderboard database work**

```powershell
git add supabase/migrations/*_global_daily_challenge_leaderboards.sql supabase/tests/rls.test.sql src/lib/database.types.ts scripts/validate-migrations.test.mjs
git commit -m "feat: add daily and cumulative leaderboards"
```

## Task 3: Map Mixed Daily Challenge Payloads

**Files:**
- Modify: `src/features/training/trainingApi.ts`
- Modify: `src/features/training/trainingApi.test.ts`
- Modify: `src/features/training/DailyChallengeCard.tsx`
- Modify: `src/features/training/DailyChallengeCard.test.tsx`
- Modify: `src/features/training/TrainingPage.tsx`
- Modify: `src/features/training/TrainingPage.test.tsx`

- [ ] **Step 1: Write failing mixed-payload tests**

Change daily fixtures to return `category_id: null` and `category_name: "Toutes les categories"`. Assert the mapped domain model has `categoryId: null`, the card displays `Toutes les categories`, and its link is `/leaderboard?view=today&challenge=2026-07-03`.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```powershell
npm test -- src/features/training/trainingApi.test.ts src/features/training/DailyChallengeCard.test.tsx src/features/training/TrainingPage.test.tsx
```

Expected: FAIL because `categoryId` is required and links still contain `category=`.

- [ ] **Step 3: Update domain types and mapping**

In `trainingApi.ts`, change only daily types:

```ts
export type DailyChallenge = {
  // existing fields
  categoryId: string | null;
  categoryName: string;
};

export type DailyAttempt = {
  // existing fields
  categoryId: string | null;
  categoryName: string;
};
```

Keep individual question category names/icons unchanged so each image can still identify its source category after answering.

- [ ] **Step 4: Update daily copy and route**

`DailyChallengeCard` must describe: `10 questions melangeant les categories officielles` and preserve the server label. In `TrainingPage`, build the link only from the challenge key:

```tsx
leaderboardHref={`/leaderboard?view=today&challenge=${encodeURIComponent(dailyChallenge.challengeKey)}`}
```

The completed-session link uses the same date-only route for secure daily sessions.

- [ ] **Step 5: Run focused tests**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 6: Commit training integration**

```powershell
git add src/features/training/trainingApi.ts src/features/training/trainingApi.test.ts src/features/training/DailyChallengeCard.tsx src/features/training/DailyChallengeCard.test.tsx src/features/training/TrainingPage.tsx src/features/training/TrainingPage.test.tsx
git commit -m "feat: present mixed daily challenge"
```

## Task 4: Replace the Leaderboard API

**Files:**
- Rewrite: `src/features/leaderboard/leaderboardApi.ts`
- Rewrite: `src/features/leaderboard/leaderboardApi.test.ts`

- [ ] **Step 1: Write failing API mapping tests**

Define two explicit models:

```ts
export type DailyLeaderboardEntry = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  rank: number;
  correctAnswers: number;
  accuracyPercent: number;
  durationMs: number;
  dailyPoints: number;
  completedAt: string;
  xpTotal: number;
};

export type GlobalDailyLeaderboardEntry = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  rank: number;
  totalPoints: number;
  participationCount: number;
  correctAnswers: number;
  totalAnswers: number;
  accuracyPercent: number;
  totalDurationMs: number;
  xpTotal: number;
};
```

Tests must assert number conversion, page clamping, and exact RPC calls without collection/category arguments.

- [ ] **Step 2: Confirm RED**

Run: `npm test -- src/features/leaderboard/leaderboardApi.test.ts`

Expected: FAIL because the API still exposes category methods.

- [ ] **Step 3: Implement the reduced data client**

`LeaderboardDataClient` exposes exactly:

```ts
listDailyEntries(challengeKey: string, limit: number, offset: number): Promise<DailyRow[]>;
listGlobalEntries(limit: number, offset: number): Promise<GlobalRow[]>;
loadMyDailyProgress(challengeKey: string): Promise<MyDailyRow | null>;
loadMyGlobalProgress(): Promise<MyGlobalRow | null>;
```

Map RPCs:

```ts
supabase.rpc("get_daily_challenge_leaderboard", {
  p_challenge_key: challengeKey,
  p_limit: limit,
  p_offset: offset,
});
supabase.rpc("get_global_daily_leaderboard", {
  p_limit: limit,
  p_offset: offset,
});
supabase.rpc("get_my_daily_challenge_leaderboard_progress", {
  p_challenge_key: challengeKey,
});
supabase.rpc("get_my_global_daily_leaderboard_progress");
```

Remove `listCategories`, `list`, and `loadMyProgress` from the frontend API.

- [ ] **Step 4: Run API tests and typecheck**

Run: `npm test -- src/features/leaderboard/leaderboardApi.test.ts && npm run typecheck`

Expected: API tests pass; typecheck may still fail in `LeaderboardPage` until Task 5, but no failures may remain in `leaderboardApi.ts`.

- [ ] **Step 5: Commit API rewrite**

```powershell
git add src/features/leaderboard/leaderboardApi.ts src/features/leaderboard/leaderboardApi.test.ts
git commit -m "refactor: expose daily leaderboard API only"
```

## Task 5: Rebuild the Leaderboard Page Around Two Daily Views

**Files:**
- Rewrite: `src/features/leaderboard/LeaderboardPage.tsx`
- Rewrite: `src/features/leaderboard/LeaderboardPage.test.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/app/App.test.tsx`

- [ ] **Step 1: Write failing page tests**

Cover:

- heading `Classement du defi quotidien`;
- no category combobox or category list;
- default `Aujourd'hui` tab and `General` tab;
- `challenge` date forwarded to the daily API;
- daily columns score/10, precision, chrono, points;
- global columns points, participations, precision, XP/rank;
- current-user highlight and personal progress when hidden;
- pagination independently in both views;
- loading, empty and error states.

- [ ] **Step 2: Confirm RED**

Run: `npm test -- src/features/leaderboard/LeaderboardPage.test.tsx src/app/App.test.tsx`

Expected: FAIL because the current page requires categories.

- [ ] **Step 3: Implement tab and URL state**

Use `view=today|global`, defaulting invalid/missing values to `today`. Preserve `challenge` only for today and `page` for both. Use Paris date formatting when no challenge parameter is supplied:

```ts
function parisDayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
```

Render tab buttons with `aria-selected` and a tablist. Reset page to 1 when switching views.

- [ ] **Step 4: Render view-specific podium and table metrics**

Keep shared avatar and rank badge components. Daily ranking renders `correctAnswers / 10`, percent, total duration and daily points. Global ranking renders total points, participation count, aggregate percent and XP rank. Do not render category names or selectors.

- [ ] **Step 5: Add responsive styling**

Add `.leaderboard-view-tabs`, selected/focus states, and mobile table labels for both metric sets. Preserve existing dark theme and existing mobile card conversion.

- [ ] **Step 6: Run page and route tests**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 7: Commit page rewrite**

```powershell
git add src/features/leaderboard/LeaderboardPage.tsx src/features/leaderboard/LeaderboardPage.test.tsx src/styles/global.css src/app/App.test.tsx
git commit -m "feat: unify daily leaderboard views"
```

## Task 6: Load Real Profile State in the Account Menu

**Files:**
- Modify: `src/features/admin/ProfileMenu.tsx`
- Modify: `src/features/admin/ProfileMenu.test.tsx`

- [ ] **Step 1: Write failing cache-miss tests**

Inject a `ProfileApi` and assert its `load()` is called when no profile exists in cache. The resolved fixture must contain `xpTotal: 39` and active premium billing; assert `39 XP` and `Premium mensuel`. Add loading and error assertions proving the menu never substitutes `0 XP` / `Gratuit` before a successful response.

- [ ] **Step 2: Confirm RED**

Run: `npm test -- src/features/admin/ProfileMenu.test.tsx`

Expected: FAIL because the component only calls `queryClient.getQueryData`.

- [ ] **Step 3: Replace the cache read with a shared query**

Add optional injection:

```ts
export function ProfileMenu({
  email,
  onSignOut,
  platformRole,
  profileApi = getProfileApi(),
}: Props & { profileApi?: ProfileApi }) {
  const profileQuery = useQuery({
    queryKey: profileKeys.current(),
    queryFn: () => profileApi.load(),
  });
}
```

Use `profileQuery.data` for username/avatar/XP/billing. While loading, show `Chargement du profil...`; on error show `Profil indisponible` and retain email/sign-out navigation without displaying fabricated plan or XP values.

- [ ] **Step 4: Run profile menu and profile tests**

Run:

```powershell
npm test -- src/features/admin/ProfileMenu.test.tsx src/features/profile/ProfilePage.test.tsx src/features/profile/profileApi.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit profile loading fix**

```powershell
git add src/features/admin/ProfileMenu.tsx src/features/admin/ProfileMenu.test.tsx
git commit -m "fix: load real XP in profile menu"
```

## Task 7: Production Migration and End-to-End Verification

**Files:**
- Modify only if verification finds a defect in files listed above.

- [ ] **Step 1: Run complete targeted validation**

```powershell
npm run test:migrations
npm test -- src/features/training src/features/leaderboard src/features/profile src/features/admin/ProfileMenu.test.tsx src/app/App.test.tsx
npm run typecheck
npx eslint src/features/training src/features/leaderboard src/features/profile src/features/admin/ProfileMenu.tsx src/features/admin/ProfileMenu.test.tsx
npm run build
```

Expected: all commands exit 0. Existing unrelated failures must be reported separately and must not be hidden.

- [ ] **Step 2: Validate SQL transactionally on the linked database before migration**

Use `npx supabase db query --linked` with `begin; ... rollback;` to create temporary mixed fixtures or invoke pure point functions without persisting data. Confirm:

- 10 questions;
- at least two categories where production data permits;
- same challenge ID/order on repeated calls;
- a 9-correct slow result scores above an 8-correct fast result;
- free attempts are absent from both leaderboard functions.

- [ ] **Step 3: Apply the migration**

Run: `npx supabase db push --yes`

Expected: only the generated `global_daily_challenge_leaderboards` migration is applied.

- [ ] **Step 4: Verify production data without exposing identities**

Run aggregate read-only queries proving:

- the latest generated challenge has ten items and multiple categories;
- daily leaderboard row count equals eligible visible premium attempts;
- global points equal the sum of authoritative per-attempt points;
- `marc.roger@outlook.fr` retains `xp_total = 39` and premium enabled.

- [ ] **Step 5: Rebuild Docker**

Run: `docker compose up -d --build`

Expected: app image builds and both app/Caddy containers run.

Run: `docker compose ps`

Expected: `geotrainer-atlas` and `caddy` are up with expected ports.

- [ ] **Step 6: Browser QA**

Authenticated desktop and mobile checks:

1. Open account menu and verify real premium plan and XP.
2. Open `/leaderboard`; verify no category selector.
3. Switch between `Aujourd'hui` and `General`.
4. Verify podium/table metrics change with the tab.
5. Open daily card and verify its leaderboard link targets the same date.
6. Confirm free-account final dialog remains and free results are absent from rankings.

- [ ] **Step 7: Commit verification-only corrections**

```powershell
git add src supabase scripts
git commit -m "fix: finalize global daily competition"
```

## Self-Review

- [ ] Daily generation contains exactly ten deterministic questions.
- [ ] Categories are balanced before any category receives another question.
- [ ] `daily_challenges.category_id` is null for mixed challenges and historical rows remain readable.
- [ ] Training XP remains independent from leaderboard points.
- [ ] Only premium daily attempts enter day/global rankings.
- [ ] One extra correct answer always beats the maximum speed advantage.
- [ ] Category leaderboard UI and API calls are removed.
- [ ] Day and global tabs have separate metrics, progress and pagination.
- [ ] Hidden users receive personal progress but are absent publicly.
- [ ] Profile menu performs a real shared query and never fabricates 0 XP/free state.
- [ ] Existing 39 XP are displayed without replaying XP events.
- [ ] Migration, tests, typecheck, lint, build, production query, Docker and browser QA are covered.
