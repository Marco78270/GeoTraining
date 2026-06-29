# Ranked Quiz and Category Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chronometrer les quiz eligibles avec l'heure serveur et afficher un classement par categorie officielle base sur les 10 derniers quiz de chaque joueur.

**Architecture:** Supabase cree et finalise les sessions par RPC afin de calculer les scores et durees cote serveur. Des RPC de lecture agregent uniquement les sessions officielles eligibles et retournent un DTO public sans email; React affiche le chrono, la progression personnelle et un classement pagine.

**Tech Stack:** React 19, TypeScript, React Query, Supabase Postgres/RPC/RLS, Vitest, Testing Library, Docker Compose.

---

## Dependency

Execute first: `docs/superpowers/plans/2026-06-29-user-profile-implementation.md`.

## File Map

- Create via CLI: `supabase/migrations/*_ranked_training_and_leaderboard.sql` - official marker, ranked timing and RPCs.
- Modify: `supabase/tests/rls.test.sql` - RPC privacy, timing and ranking tests.
- Modify: `src/lib/database.types.ts` - schema and function result types.
- Modify: `src/features/training/trainingApi.ts` and tests - server start/complete RPCs.
- Modify: `src/features/training/TrainingPage.tsx` and tests - live timer and ranked result.
- Create: `src/features/leaderboard/leaderboardApi.ts` and test - leaderboard data access.
- Create: `src/features/leaderboard/LeaderboardPage.tsx` and test - category rankings.
- Modify: `src/app/App.tsx` and test - protected route.
- Modify: Atlas, Collections, Training, Statistics and Admin page headers - leaderboard link.
- Modify: `src/styles/global.css` - desktop/mobile leaderboard and timer styles.

### Task 1: Ranked session and leaderboard database contract

**Files:**
- Create via CLI: `supabase/migrations/*_ranked_training_and_leaderboard.sql`
- Modify: `supabase/tests/rls.test.sql`
- Modify: `src/lib/database.types.ts`

- [ ] **Step 1: Generate the migration**

```powershell
npx supabase migration new ranked_training_and_leaderboard
```

Expected: a single CLI-generated file ending in `_ranked_training_and_leaderboard.sql`.

- [ ] **Step 2: Add failing database tests**

Cover:

```sql
select has_column('public', 'collections', 'is_official');
select has_column('public', 'training_sessions', 'is_ranked');
select has_column('public', 'training_sessions', 'duration_ms');
select has_function('public', 'start_training_session');
select has_function('public', 'complete_training_session');
select has_function('public', 'get_category_leaderboard');
select has_function('public', 'get_my_category_progress');
```

Seed at least four users and twelve sessions to prove: only official sessions count, only the latest ten count, fewer than three sessions has no public rank, hidden profiles are omitted, score wins before time, and returned rows contain no email.

- [ ] **Step 3: Add schema and indexes**

Implement:

```sql
alter table public.collections
  add column if not exists is_official boolean not null default false;

update public.collections
set is_official = (name = 'Collection officielle' and visibility = 'public_readonly');

create unique index if not exists collections_single_official_idx
on public.collections (is_official)
where is_official;

alter table public.training_sessions
  add column if not exists is_ranked boolean not null default false,
  add column if not exists duration_ms bigint;

alter table public.training_sessions
  add constraint training_sessions_duration_positive
  check (duration_ms is null or duration_ms > 0);

create index if not exists training_sessions_ranked_category_user_completed_idx
on public.training_sessions (category_id, user_id, completed_at desc)
where is_ranked and completed_at is not null;
```

- [ ] **Step 4: Implement secure start and completion RPCs**

`public.start_training_session(...)` must validate `auth.uid()`, category ownership, training mode and question count, then insert with server `started_at`. It sets `is_ranked` only when the collection is official and `category_id` is not null.

`public.complete_training_session(p_session_id uuid)` must:

```sql
select count(*), count(*) filter (where is_correct)
into answer_count, correct_count
from public.training_answers
where session_id = p_session_id
  and user_id = auth.uid();

update public.training_sessions
set total_answers = answer_count,
    correct_answers = correct_count,
    completed_at = clock_timestamp(),
    duration_ms = greatest(
      1,
      floor(extract(epoch from (clock_timestamp() - started_at)) * 1000)::bigint
    )
where id = p_session_id
  and user_id = auth.uid()
  and completed_at is null;
```

Both functions must use `security definer`, `set search_path = ''`, fully qualified relations, explicit authentication/ownership checks, `revoke execute from public, anon`, and `grant execute to authenticated`.

Revoke direct INSERT/UPDATE on `training_sessions` from `authenticated` after the app switches to the RPCs. Keep SELECT and DELETE under existing owner RLS.

- [ ] **Step 5: Implement leaderboard RPCs**

Create:

```sql
public.list_official_leaderboard_categories()
public.get_category_leaderboard(p_category_id uuid, p_limit integer, p_offset integer)
public.get_my_category_progress(p_category_id uuid)
```

Use `row_number() over (partition by user_id, category_id order by completed_at desc)` to keep the latest ten. Aggregate:

```sql
round(100.0 * sum(correct_answers) / nullif(sum(total_answers), 0), 2) as accuracy_percent,
round(sum(duration_ms)::numeric / nullif(sum(total_answers), 0))::bigint as average_ms_per_answer
```

Public leaderboard rows require at least three retained sessions and `profiles.leaderboard_visible = true`. Rank by accuracy descending, average milliseconds ascending, quiz count descending, username ascending. Return only `user_id`, `username`, `avatar_url`, `rank`, `accuracy_percent`, `average_ms_per_answer`, `quiz_count` and total result count.

The personal progress RPC must return the same metrics for `auth.uid()` even when the profile is hidden or has fewer than three sessions, plus `remaining_quizzes = greatest(0, 3 - quiz_count)`.

- [ ] **Step 6: Update types and validate**

Add columns and RPC return types to `database.types.ts`. Run:

```powershell
npm run test:migrations
npm run typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```powershell
git add supabase/migrations supabase/tests/rls.test.sql src/lib/database.types.ts
git commit -m "feat: add ranked training database contract"
```

### Task 2: Training API server timing

**Files:**
- Modify: `src/features/training/trainingApi.ts`
- Modify: `src/features/training/trainingApi.test.ts`

- [ ] **Step 1: Write failing API tests**

Replace expectations for direct session insert/update with RPC-backed calls. Assert that completion ignores client score/time inputs and returns the server row:

```ts
await expect(api.completeSession("session-1")).resolves.toMatchObject({
  id: "session-1",
  correct_answers: 8,
  total_answers: 10,
  duration_ms: 42000,
});
```

- [ ] **Step 2: Change the data client contract**

Use:

```ts
startSession(input: CreateTrainingSessionInput): Promise<TrainingSessionRow>;
completeSession(sessionId: string): Promise<TrainingSessionRow>;
```

The Supabase client calls `rpc("start_training_session", ...)` and `rpc("complete_training_session", ...)`. Remove direct insert/update methods from the training client.

- [ ] **Step 3: Keep answer recording unchanged and make completion idempotent in UI**

The page must disable Next/Finish while completion is pending and retry the same session ID after a network error. Do not create a replacement session.

- [ ] **Step 4: Test and commit**

```powershell
npm test -- src/features/training/trainingApi.test.ts
npm run typecheck
git add src/features/training/trainingApi.ts src/features/training/trainingApi.test.ts
git commit -m "feat: use server-timed training sessions"
```

### Task 3: Training timer UI

**Files:**
- Create: `src/features/training/useSessionTimer.ts`
- Create: `src/features/training/useSessionTimer.test.ts`
- Modify: `src/features/training/TrainingPage.tsx`
- Modify: `src/features/training/TrainingPage.test.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Write failing timer tests with fake timers**

Test formatting, elapsed time from server `started_at`, no pause on visibility change, and stopping on completion:

```ts
vi.setSystemTime(new Date("2026-06-29T12:00:05Z"));
expect(formatDuration(5000)).toBe("00:05");
expect(formatDuration(65000)).toBe("01:05");
```

- [ ] **Step 2: Implement `useSessionTimer`**

Accept `startedAt` and `completedDurationMs`. While active, update every 250 ms from `Date.now() - Date.parse(startedAt)`; do not track document visibility. Once completed, show the server duration.

- [ ] **Step 3: Add the timer to active and completed quiz states**

Display `Chrono 01:23` beside progress. On the result screen show total duration and `duration_ms / total_answers` formatted as seconds per question. Add a link to `/leaderboard?category=<categoryId>` only for ranked sessions.

- [ ] **Step 4: Preserve mobile priority**

On mobile keep the timer in the compact question heading, never above the map or image. Use tabular numerals to avoid layout shifts.

- [ ] **Step 5: Test and commit**

```powershell
npm test -- src/features/training/useSessionTimer.test.ts src/features/training/TrainingPage.test.tsx
npm run typecheck
git add src/features/training src/styles/global.css
git commit -m "feat: show ranked quiz timer"
```

### Task 4: Leaderboard API

**Files:**
- Create: `src/features/leaderboard/leaderboardApi.ts`
- Create: `src/features/leaderboard/leaderboardApi.test.ts`

- [ ] **Step 1: Write failing mapping and pagination tests**

Define and test:

```ts
export type LeaderboardEntry = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  rank: number;
  accuracyPercent: number;
  averageMsPerAnswer: number;
  quizCount: number;
};

export type LeaderboardProgress = {
  rank: number | null;
  accuracyPercent: number | null;
  averageMsPerAnswer: number | null;
  quizCount: number;
  remainingQuizzes: number;
  visible: boolean;
};
```

- [ ] **Step 2: Implement RPC calls**

Expose `listCategories()`, `list(categoryId, page, pageSize)` and `loadMyProgress(categoryId)`. Clamp page size to 50 and use a default of 25. Convert numeric Postgres values explicitly with `Number(...)`.

- [ ] **Step 3: Test and commit**

```powershell
npm test -- src/features/leaderboard/leaderboardApi.test.ts
npm run typecheck
git add src/features/leaderboard
git commit -m "feat: add category leaderboard API"
```

### Task 5: Leaderboard page

**Files:**
- Create: `src/features/leaderboard/LeaderboardPage.tsx`
- Create: `src/features/leaderboard/LeaderboardPage.test.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Write failing page tests**

Cover category selection, podium, current user highlight, pagination, hidden profile notice and remaining quiz messages for counts 0, 1 and 2.

Expected wording:

```tsx
expect(screen.getByText("Encore 2 quiz à terminer pour apparaître dans ce classement")).toBeInTheDocument();
```

- [ ] **Step 2: Implement query-string category selection**

Read `category` from `useSearchParams`; select the first available category only when the parameter is absent or invalid. Query keys include category and page.

- [ ] **Step 3: Implement desktop UI**

Render a personal summary, three-card podium and accessible table with columns Rang, Joueur, Precision, Temps/question, Quiz. The user's own row uses `aria-current="true"` and a visible highlight.

- [ ] **Step 4: Implement mobile UI**

Under 760px replace the table row presentation with stacked cards using CSS, keep rank/name/accuracy above secondary time/count information, and avoid horizontal scrolling.

- [ ] **Step 5: Test and commit**

```powershell
npm test -- src/features/leaderboard/LeaderboardPage.test.tsx
npm run typecheck
npm run lint
git add src/features/leaderboard src/styles/global.css
git commit -m "feat: add category leaderboard page"
```

### Task 6: Route and global navigation

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/features/atlas/AtlasPage.tsx`
- Modify: `src/features/collections/CollectionsPage.tsx`
- Modify: `src/features/training/TrainingPage.tsx`
- Modify: `src/features/statistics/StatisticsPage.tsx`
- Modify: `src/features/admin/AdminPage.tsx`
- Modify corresponding page tests.

- [ ] **Step 1: Add failing route and header tests**

Assert protected rendering for `/leaderboard` and one `Classement` navigation link in every authenticated page header.

- [ ] **Step 2: Add lazy route**

```tsx
const LeaderboardPage = lazy(async () => {
  const module = await import("../features/leaderboard/LeaderboardPage");
  return { default: module.LeaderboardPage };
});
```

Register `<Route path="/leaderboard" element={<LeaderboardPage />} />`.

- [ ] **Step 3: Add the navigation item**

Use Lucide `Trophy` and label `Classement` consistently in every top bar. Preserve current active-link styling and mobile wrapping.

- [ ] **Step 4: Test and commit**

```powershell
npm test -- src/app/App.test.tsx src/features/atlas/AtlasPage.test.tsx src/features/collections/CollectionsPage.test.tsx src/features/training/TrainingPage.test.tsx src/features/statistics/StatisticsPage.test.tsx src/features/admin/AdminPage.test.tsx
npm run typecheck
git add src/app src/features
git commit -m "feat: expose leaderboard navigation"
```

### Task 7: Full verification and production deployment

**Files:**
- No new source files.

- [ ] **Step 1: Run complete validation**

```powershell
npm test
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: all commands pass; the existing MapLibre chunk warning is acceptable.

- [ ] **Step 2: Review and apply the remote migration**

```powershell
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
```

Expected: only the ranked training migration is applied. Do not start local Supabase.

- [ ] **Step 3: Rebuild Docker**

```powershell
docker compose up -d --build
docker compose ps
```

Expected: application and Caddy containers are `Up`.

- [ ] **Step 4: HTTP smoke checks**

```powershell
(Invoke-WebRequest -UseBasicParsing http://localhost:5173/profile).StatusCode
(Invoke-WebRequest -UseBasicParsing http://localhost:5173/leaderboard).StatusCode
(Invoke-WebRequest -UseBasicParsing http://localhost:5173/training).StatusCode
```

Expected: `200` for all routes.

- [ ] **Step 5: Functional smoke checks with two users**

Verify:

- official categorized sessions display a running timer and count toward progress;
- private collection sessions do not count;
- after 1 and 2 sessions the remaining count is correct;
- the third session produces a rank;
- a higher accuracy ranks first regardless of speed;
- equal accuracy is ordered by average time per answer;
- disabling profile visibility removes the public row but preserves personal progress;
- no email appears in network leaderboard responses or UI.

