# Global XP, Ranking and Premium Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-validated global XP system with rank thresholds, ranked-only XP attribution, profile/menu/leaderboard rank display, and a distinct premium badge on the profile.

**Architecture:** Extend the existing ranked training flow in Supabase so quiz finalization computes a single authoritative XP delta, writes an immutable `xp_events` audit row, and updates `profiles.xp_total` transactionally. Reuse that XP total in a shared rank-threshold module consumed by profile, account menu, leaderboard rows, and training completion UI; keep per-answer XP feedback client-side as estimated only.

**Tech Stack:** React, TypeScript, TanStack Query, Supabase Postgres RPC, Supabase Auth, Vitest, Vite

---

## File map

### Database and server

- Create: `supabase/migrations/20260702xxxxxx_add_global_xp_and_rank_progression.sql`
  - Adds `profiles.xp_total`
  - Creates `xp_events`
  - Creates XP helper functions
  - Extends ranked session finalization with XP result payload
- Modify: `supabase/tests/rls.test.sql`
  - Adds pgTAP coverage for XP write path and read guards
- Modify: `src/lib/database.types.ts`
  - Adds generated types for `xp_total`, `xp_events`, and any new RPC returns

### Shared frontend domain logic

- Create: `src/features/ranking/rankProgression.ts`
  - Central rank threshold config and `xp -> rank` helpers
- Create: `src/features/ranking/rankProgression.test.ts`
  - Threshold, floor, next-rank progress and downgrade tests

### Training integration

- Modify: `src/features/training/trainingApi.ts`
  - Map new completion payload fields
- Modify: `src/features/training/trainingSession.ts`
  - Add result/session shape for XP delta, rank before/after, estimated per-answer feedback
- Modify: `src/features/training/TrainingPage.tsx`
  - Show estimated XP per answer and official XP/rank result at completion
- Modify: `src/features/training/TrainingPage.test.tsx`
  - Covers ranked XP feedback and final result panel
- Modify: `src/features/training/trainingApi.test.ts`
  - Covers RPC result mapping

### Profile, menu and leaderboard

- Modify: `src/features/profile/profileApi.ts`
  - Load `xp_total` and map rank-ready profile payload
- Modify: `src/features/profile/ProfilePage.tsx`
  - Show XP, current rank, next-rank progress, premium badge
- Modify: `src/features/profile/ProfilePage.test.tsx`
  - Covers XP/rank and premium badge rendering
- Modify: `src/features/admin/ProfileMenu.tsx`
  - Compact rank and XP preview in account menu
- Modify: `src/features/admin/ProfileMenu.test.tsx`
  - Covers rank preview in the menu
- Modify: `src/features/leaderboard/leaderboardApi.ts`
  - Include rank metadata in row mapping if returned by RPC
- Modify: `src/features/leaderboard/LeaderboardPage.tsx`
  - Render rank badge next to each player and optionally in progress panel
- Modify: `src/features/leaderboard/LeaderboardPage.test.tsx`
  - Covers rank rendering without changing leaderboard ordering

### Styling

- Modify: `src/styles/global.css`
  - Rank badge visuals, XP progress block, premium badge styling, compact menu layout

## Task 1: Add database XP foundation and secure finalization output

**Files:**
- Create: `supabase/migrations/20260702xxxxxx_add_global_xp_and_rank_progression.sql`
- Modify: `supabase/tests/rls.test.sql`
- Modify: `src/lib/database.types.ts`

- [ ] **Step 1: Write the failing migration-oriented test cases into `supabase/tests/rls.test.sql`**

Add these assertions near the existing ranked training coverage:

```sql
select plan(220);

select has_column('public', 'profiles', 'xp_total');
select col_not_null('public', 'profiles', 'xp_total');
select col_default_is('public', 'profiles', 'xp_total', '0');

select has_table('public', 'xp_events');
select has_column('public', 'xp_events', 'training_session_id');
select col_is_pk('public', 'xp_events', 'id');

select has_function('public', 'complete_training_session');

-- later in the file, after the ranked session fixture setup:
select is(
  (select xp_total from public.profiles where id = auth.uid()),
  0::bigint,
  'xp starts at zero'
);
```

- [ ] **Step 2: Run a focused static check to confirm the new assertions fail before the migration exists**

Run: `rg -n "xp_total|xp_events" supabase/tests/rls.test.sql`

Expected: the new assertions are present in the test file, but no migration exists yet with those identifiers.

- [ ] **Step 3: Create the migration with schema additions and helper functions**

Create `supabase/migrations/20260702xxxxxx_add_global_xp_and_rank_progression.sql` with this structure:

```sql
alter table public.profiles
  add column if not exists xp_total bigint not null default 0;

create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  training_session_id uuid not null references public.training_sessions(id) on delete cascade,
  total_delta integer not null,
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  before_xp bigint not null,
  after_xp bigint not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (training_session_id)
);

create or replace function public.compute_ranked_answer_xp(
  p_difficulty public.clue_difficulty,
  p_is_correct boolean
)
returns integer
language sql
immutable
as $$
  select case
    when p_difficulty = 'easy' and p_is_correct then 6
    when p_difficulty = 'easy' and not p_is_correct then -9
    when p_difficulty = 'medium' and p_is_correct then 10
    when p_difficulty = 'medium' and not p_is_correct then -10
    when p_difficulty = 'expert' and p_is_correct then 15
    when p_difficulty = 'expert' and not p_is_correct then -6
    else 0
  end
$$;
```

- [ ] **Step 4: Extend session finalization with transactional XP write logic**

Inside the same migration, replace or extend `public.complete_training_session(...)` so it:

```sql
-- sketch of the required core inside the function body
select ts.*, c.is_official
into v_session
from public.training_sessions ts
join public.collections c on c.id = ts.collection_id
where ts.id = p_session_id
for update;

if v_session.is_ranked and v_session.completed_at is null and v_session.total_answers > 0 and v_session.challenge_type in ('standard', 'daily') and v_session.collection_id is not null and v_session.category_id is not null and v_session.is_ranked and v_session_duration_ms > 0 and v_session_is_official then
  select coalesce(sum(public.compute_ranked_answer_xp(cl.difficulty, ta.is_correct)), 0),
         count(*) filter (where ta.is_correct),
         count(*) filter (where not ta.is_correct)
  into v_total_delta, v_correct_count, v_wrong_count
  from public.training_answers ta
  join public.clues cl on cl.id = ta.clue_id
  where ta.session_id = p_session_id;

  select xp_total into v_before_xp
  from public.profiles
  where id = v_session.user_id
  for update;

  v_after_xp := greatest(0, v_before_xp + v_total_delta);

  insert into public.xp_events (
    user_id,
    training_session_id,
    total_delta,
    correct_count,
    wrong_count,
    before_xp,
    after_xp
  ) values (
    v_session.user_id,
    p_session_id,
    v_total_delta,
    v_correct_count,
    v_wrong_count,
    v_before_xp,
    v_after_xp
  )
  on conflict (training_session_id) do nothing;

  if found then
    update public.profiles
    set xp_total = v_after_xp,
        updated_at = timezone('utc', now())
    where id = v_session.user_id;
  end if;
end if;
```

- [ ] **Step 5: Return XP payload fields from `complete_training_session`**

Make the RPC return, in addition to the existing session row fields:

```sql
xp_delta integer,
xp_total bigint,
xp_awarded boolean
```

If you prefer not to mutate the table return type, create a dedicated composite return row inside the function query:

```sql
select
  ts.*,
  coalesce(xe.total_delta, 0) as xp_delta,
  p.xp_total as xp_total,
  (xe.id is not null) as xp_awarded
from public.training_sessions ts
join public.profiles p on p.id = ts.user_id
left join public.xp_events xe on xe.training_session_id = ts.id
where ts.id = p_session_id;
```

- [ ] **Step 6: Add RLS and execution guards**

In the migration, include:

```sql
alter table public.xp_events enable row level security;

create policy "users can read own xp events"
on public.xp_events
for select
to authenticated
using (auth.uid() = user_id);

revoke all on public.xp_events from anon;
grant select on public.xp_events to authenticated;
```

Do not add direct insert/update/delete policies for clients; the server function remains the only writer.

- [ ] **Step 7: Update generated type definitions**

After the migration shape is known, update `src/lib/database.types.ts` so it includes:

```ts
profiles: {
  Row: {
    xp_total: number;
  };
}

xp_events: {
  Row: {
    id: string;
    user_id: string;
    training_session_id: string;
    total_delta: number;
    correct_count: number;
    wrong_count: number;
    before_xp: number;
    after_xp: number;
    created_at: string;
  };
}
```

and ensure the `complete_training_session` function return type includes `xp_delta`, `xp_total`, and `xp_awarded`.

- [ ] **Step 8: Run static verification and targeted tests**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: PASS. The migration is referenced by types and no TypeScript or lint error is introduced yet.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260702*_add_global_xp_and_rank_progression.sql supabase/tests/rls.test.sql src/lib/database.types.ts
git commit -m "feat: add global xp persistence foundation"
```

## Task 2: Add shared rank progression helpers

**Files:**
- Create: `src/features/ranking/rankProgression.ts`
- Create: `src/features/ranking/rankProgression.test.ts`

- [ ] **Step 1: Write the failing rank helper test**

Create `src/features/ranking/rankProgression.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getRankForXp, getNextRankProgress } from "./rankProgression";

describe("rankProgression", () => {
  it("maps xp thresholds to global ranks", () => {
    expect(getRankForXp(0).label).toBe("Bronze III");
    expect(getRankForXp(1000).label).not.toBe("Bronze III");
  });

  it("never resolves below Bronze III", () => {
    expect(getRankForXp(-200).label).toBe("Bronze III");
  });

  it("returns progress toward the next threshold", () => {
    expect(getNextRankProgress(0)).toMatchObject({
      currentLabel: "Bronze III",
    });
  });
});
```

- [ ] **Step 2: Run the test to confirm failure**

Run: `npm run test -- src/features/ranking/rankProgression.test.ts`

Expected: FAIL because the module does not exist yet.

- [ ] **Step 3: Implement the shared threshold module**

Create `src/features/ranking/rankProgression.ts`:

```ts
export type RankTier =
  | "Bronze III"
  | "Bronze II"
  | "Bronze I"
  | "Argent III"
  | "Argent II"
  | "Argent I"
  | "Or III"
  | "Or II"
  | "Or I"
  | "Diamant III"
  | "Diamant II"
  | "Diamant I"
  | "Master III"
  | "Master II"
  | "Master I"
  | "Grand Master III"
  | "Grand Master II"
  | "Grand Master I";

export type RankDefinition = {
  key: string;
  label: RankTier;
  minXp: number;
};

export const rankThresholds: RankDefinition[] = [
  { key: "bronze_3", label: "Bronze III", minXp: 0 },
  { key: "bronze_2", label: "Bronze II", minXp: 120 },
  { key: "bronze_1", label: "Bronze I", minXp: 260 },
  { key: "argent_3", label: "Argent III", minXp: 480 },
  { key: "argent_2", label: "Argent II", minXp: 760 },
  { key: "argent_1", label: "Argent I", minXp: 1100 },
  { key: "or_3", label: "Or III", minXp: 1500 },
  { key: "or_2", label: "Or II", minXp: 2000 },
  { key: "or_1", label: "Or I", minXp: 2600 },
  { key: "diamant_3", label: "Diamant III", minXp: 3300 },
  { key: "diamant_2", label: "Diamant II", minXp: 4100 },
  { key: "diamant_1", label: "Diamant I", minXp: 5000 },
  { key: "master_3", label: "Master III", minXp: 6200 },
  { key: "master_2", label: "Master II", minXp: 7600 },
  { key: "master_1", label: "Master I", minXp: 9200 },
  { key: "grand_master_3", label: "Grand Master III", minXp: 11000 },
  { key: "grand_master_2", label: "Grand Master II", minXp: 13000 },
  { key: "grand_master_1", label: "Grand Master I", minXp: 15500 },
];

export function clampXp(xp: number) {
  return Math.max(0, Math.trunc(xp) || 0);
}

export function getRankForXp(xp: number) {
  const safeXp = clampXp(xp);
  return (
    [...rankThresholds].reverse().find((rank) => safeXp >= rank.minXp) ??
    rankThresholds[0]
  );
}

export function getNextRankProgress(xp: number) {
  const safeXp = clampXp(xp);
  const current = getRankForXp(safeXp);
  const currentIndex = rankThresholds.findIndex((rank) => rank.key === current.key);
  const next = rankThresholds[currentIndex + 1] ?? null;

  if (!next) {
    return {
      currentLabel: current.label,
      nextLabel: null,
      progressPercent: 100,
      currentXp: safeXp,
      nextXp: null,
      remainingXp: 0,
    };
  }

  const span = next.minXp - current.minXp;
  const progress = Math.min(100, Math.max(0, ((safeXp - current.minXp) / span) * 100));
  return {
    currentLabel: current.label,
    nextLabel: next.label,
    progressPercent: progress,
    currentXp: safeXp,
    nextXp: next.minXp,
    remainingXp: Math.max(0, next.minXp - safeXp),
  };
}
```

- [ ] **Step 4: Run the rank helper tests**

Run: `npm run test -- src/features/ranking/rankProgression.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ranking/rankProgression.ts src/features/ranking/rankProgression.test.ts
git commit -m "feat: add global rank progression helpers"
```

## Task 3: Extend training completion payload and estimated XP feedback

**Files:**
- Modify: `src/features/training/trainingApi.ts`
- Modify: `src/features/training/trainingSession.ts`
- Modify: `src/features/training/TrainingPage.tsx`
- Modify: `src/features/training/trainingApi.test.ts`
- Modify: `src/features/training/TrainingPage.test.tsx`

- [ ] **Step 1: Write the failing API mapping test**

Add to `src/features/training/trainingApi.test.ts`:

```ts
it("maps ranked session completion with xp payload", async () => {
  const completeSession = vi.fn(async () => ({
    id: "session-1",
    xp_delta: 24,
    xp_total: 1540,
    xp_awarded: true,
  }));

  const api = createTrainingApi({
    listPublishedClues: vi.fn(),
    createSignedImageUrls: vi.fn(),
    startSession: vi.fn(),
    insertAnswer: vi.fn(),
    completeSession,
    getDailyChallengeProgress: vi.fn(),
  });

  await expect(api.completeSession("session-1")).resolves.toMatchObject({
    xpDelta: 24,
    xpTotal: 1540,
    xpAwarded: true,
  });
});
```

- [ ] **Step 2: Run the focused test to confirm failure**

Run: `npm run test -- src/features/training/trainingApi.test.ts`

Expected: FAIL because `xpDelta` and related fields are not mapped yet.

- [ ] **Step 3: Extend the session shapes**

Update `src/features/training/trainingSession.ts` with fields like:

```ts
export type CompletedTrainingSession = TrainingSessionRow & {
  xpDelta: number;
  xpTotal: number;
  xpAwarded: boolean;
};

export type AnswerXpPreview = {
  estimatedDelta: number;
  difficulty: TrainingClue["difficulty"];
};
```

- [ ] **Step 4: Map XP payload in `trainingApi.ts`**

Inside `completeSession(sessionId)` mapping:

```ts
return {
  ...(session as TrainingSessionRow),
  xpDelta: Number((session as { xp_delta?: number }).xp_delta ?? 0),
  xpTotal: Number((session as { xp_total?: number }).xp_total ?? 0),
  xpAwarded: Boolean((session as { xp_awarded?: boolean }).xp_awarded),
};
```

- [ ] **Step 5: Add estimated per-answer XP helper in `TrainingPage.tsx`**

Create a local helper near the component:

```ts
function estimateAnswerXp(difficulty: "easy" | "medium" | "expert", isCorrect: boolean) {
  if (difficulty === "easy") return isCorrect ? 6 : -9;
  if (difficulty === "expert") return isCorrect ? 15 : -6;
  return isCorrect ? 10 : -10;
}
```

Use it only for UI feedback after each answer, never for persistence.

- [ ] **Step 6: Render completion XP and rank transition**

In `TrainingPage.tsx`, enrich the result panel:

```tsx
{isFinished && completedSession?.xpAwarded ? (
  <section className="detail-section">
    <h2>Progression</h2>
    <div className="training-summary-grid">
      <span>Delta XP</span>
      <strong>{completedSession.xpDelta >= 0 ? `+${completedSession.xpDelta}` : completedSession.xpDelta}</strong>
      <span>XP totale</span>
      <strong>{completedSession.xpTotal}</strong>
    </div>
  </section>
) : null}
```

Then derive `rankBefore`/`rankAfter` with `getRankForXp(completedSession.xpTotal - completedSession.xpDelta)` and `getRankForXp(completedSession.xpTotal)` to show:

```tsx
{rankBefore.label !== rankAfter.label ? (
  <p className="official-badge">
    {completedSession.xpDelta >= 0
      ? `Promotion: ${rankAfter.label}`
      : `Relégation: ${rankAfter.label}`}
  </p>
) : null}
```

- [ ] **Step 7: Add UI test coverage**

In `TrainingPage.test.tsx`, add:

```ts
it("shows official ranked xp after completing an official ranked session", async () => {
  // use a ranked official session fixture
  expect(await screen.findByText(/delta xp/i)).toBeInTheDocument();
  expect(screen.getByText("+24")).toBeInTheDocument();
  expect(screen.getByText("1540")).toBeInTheDocument();
});
```

- [ ] **Step 8: Run training tests**

Run:

```bash
npm run test -- src/features/training/trainingApi.test.ts
npm run test -- src/features/training/TrainingPage.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/training/trainingApi.ts src/features/training/trainingSession.ts src/features/training/TrainingPage.tsx src/features/training/trainingApi.test.ts src/features/training/TrainingPage.test.tsx
git commit -m "feat: surface ranked xp progression in training"
```

## Task 4: Load XP in profile API and build profile progression UI

**Files:**
- Modify: `src/features/profile/profileApi.ts`
- Modify: `src/features/profile/ProfilePage.tsx`
- Modify: `src/features/profile/ProfilePage.test.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Write the failing profile API test**

Add to `src/features/profile/profileApi.test.ts`:

```ts
expect(await createProfileApi(dataClient).load()).resolves.toMatchObject({
  xpTotal: 0,
});
```

and use a fixture row including:

```ts
xp_total: 1540,
```

- [ ] **Step 2: Run the profile API test to confirm failure**

Run: `npm run test -- src/features/profile/profileApi.test.ts`

Expected: FAIL because `xpTotal` is not mapped yet.

- [ ] **Step 3: Extend `UserProfile` and mapping**

In `profileApi.ts`:

```ts
export type UserProfile = {
  id: string;
  username: string;
  avatarUrl: string | null;
  email: string;
  usernameChangedAt: string | null;
  leaderboardVisible: boolean;
  xpTotal: number;
  billing: BillingStatus;
};
```

and in `toUserProfile(...)`:

```ts
xpTotal: row.xp_total,
```

- [ ] **Step 4: Build profile rank UI**

Import the shared helpers into `ProfilePage.tsx`:

```ts
import { getNextRankProgress, getRankForXp } from "../ranking/rankProgression";
```

Inside the component:

```ts
const currentXp = profile?.xpTotal ?? 0;
const currentRank = getRankForXp(currentXp);
const rankProgress = getNextRankProgress(currentXp);
```

Render a dedicated section:

```tsx
<section className="panel profile-rank-card">
  <p className="eyebrow">Progression</p>
  <h2>{currentRank.label}</h2>
  <div className="profile-billing-summary">
    <div>
      <span>XP totale</span>
      <strong>{currentXp}</strong>
    </div>
    <div>
      <span>Prochain rang</span>
      <strong>{rankProgress.nextLabel ?? "Maximum atteint"}</strong>
    </div>
  </div>
  <div className="profile-rank-progress">
    <div style={{ width: `${rankProgress.progressPercent}%` }} />
  </div>
  <p className="profile-trust-note">
    <Sparkles aria-hidden="true" />
    <span>
      {rankProgress.nextLabel
        ? `${rankProgress.remainingXp} XP restantes avant ${rankProgress.nextLabel}.`
        : "Vous avez atteint le rang maximum actuel."}
    </span>
  </p>
</section>
```

- [ ] **Step 5: Replace the current premium text badge with a visual premium badge**

Still in `ProfilePage.tsx`, keep premium separate from rank:

```tsx
<span className={`profile-premium-badge ${profile?.billing.premiumEnabled ? "is-active" : ""}`}>
  <CreditCard aria-hidden="true" />
  Premium
</span>
```

Show it near the profile hero badges, not inside the rank block.

- [ ] **Step 6: Add profile UI test**

In `ProfilePage.test.tsx`, assert:

```ts
expect(await screen.findByText("Bronze III")).toBeInTheDocument();
expect(screen.getByText(/xp totale/i)).toBeInTheDocument();
expect(screen.getByText(/premium/i)).toBeInTheDocument();
```

Use an XP-rich fixture to assert a higher tier too:

```ts
xpTotal: 1540
```

- [ ] **Step 7: Add styles**

In `src/styles/global.css` add:

```css
.profile-rank-card,
.profile-rank-progress,
.profile-premium-badge {
  /* follow existing dark theme token usage */
}

.profile-rank-progress {
  height: 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.08);
  overflow: hidden;
}

.profile-rank-progress > div {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #19d3ff 0%, #5b8cff 100%);
}

.profile-premium-badge.is-active {
  border-color: rgba(255, 215, 64, 0.45);
  background: rgba(255, 215, 64, 0.12);
  color: #ffe48b;
}
```

- [ ] **Step 8: Run profile tests**

Run:

```bash
npm run test -- src/features/profile/profileApi.test.ts
npm run test -- src/features/profile/ProfilePage.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/profile/profileApi.ts src/features/profile/ProfilePage.tsx src/features/profile/ProfilePage.test.tsx src/styles/global.css
git commit -m "feat: add profile xp rank and premium badge"
```

## Task 5: Add rank preview in the account menu

**Files:**
- Modify: `src/features/admin/ProfileMenu.tsx`
- Modify: `src/features/admin/ProfileMenu.test.tsx`

- [ ] **Step 1: Write the failing menu test**

Add a test that seeds cached profile data with XP:

```ts
expect(screen.getByText("Bronze III")).toBeInTheDocument();
expect(screen.getByText(/xp/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run the test to verify failure**

Run: `npm run test -- src/features/admin/ProfileMenu.test.tsx`

Expected: FAIL because the menu does not render rank data.

- [ ] **Step 3: Implement compact rank preview**

In `ProfileMenu.tsx`:

```ts
import { getRankForXp } from "../ranking/rankProgression";
```

Extend the cached profile shape:

```ts
const cachedProfile = queryClient.getQueryData<{
  username: string;
  avatarUrl: string | null;
  xpTotal?: number;
  billing?: { planKey: "free" | "premium_monthly" | "premium_yearly" };
}>(profileKeys.current());

const rank = getRankForXp(cachedProfile?.xpTotal ?? 0);
```

Render inside the popover:

```tsx
<div className="profile-menu-rank">
  <strong>{rank.label}</strong>
  <span>{cachedProfile?.xpTotal ?? 0} XP</span>
</div>
```

- [ ] **Step 4: Run the menu test**

Run: `npm run test -- src/features/admin/ProfileMenu.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/ProfileMenu.tsx src/features/admin/ProfileMenu.test.tsx
git commit -m "feat: add rank preview to profile menu"
```

## Task 6: Show player rank in the leaderboard without changing sorting

**Files:**
- Modify: `src/features/leaderboard/leaderboardApi.ts`
- Modify: `src/features/leaderboard/LeaderboardPage.tsx`
- Modify: `src/features/leaderboard/LeaderboardPage.test.tsx`

- [ ] **Step 1: Write the failing leaderboard rendering test**

Add to `src/features/leaderboard/LeaderboardPage.test.tsx`:

```ts
expect(await screen.findAllByText(/bronze iii|or iii|diamant/i)).not.toHaveLength(0);
```

Use mocked entries containing XP totals once the API surface is extended.

- [ ] **Step 2: Run the test to confirm failure**

Run: `npm run test -- src/features/leaderboard/LeaderboardPage.test.tsx`

Expected: FAIL because entries do not carry or render rank yet.

- [ ] **Step 3: Extend leaderboard row types**

If you decide to compute the rank client-side, add `xpTotal` to `LeaderboardEntry`:

```ts
export type LeaderboardEntry = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  rank: number;
  accuracyPercent: number;
  averageMsPerAnswer: number;
  quizCount: number;
  xpTotal?: number;
  completedAt?: string | null;
};
```

Map it from RPC return when available.

- [ ] **Step 4: Render rank beside each player**

In `LeaderboardPage.tsx`, inside the player row:

```tsx
{entry.xpTotal !== undefined ? (
  <span className="official-badge leaderboard-rank-badge">
    {getRankForXp(entry.xpTotal).label}
  </span>
) : null}
```

Do not alter the existing sort logic or labels around accuracy.

- [ ] **Step 5: Run leaderboard tests**

Run:

```bash
npm run test -- src/features/leaderboard/leaderboardApi.test.ts
npm run test -- src/features/leaderboard/LeaderboardPage.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/leaderboard/leaderboardApi.ts src/features/leaderboard/LeaderboardPage.tsx src/features/leaderboard/LeaderboardPage.test.tsx src/styles/global.css
git commit -m "feat: show global rank in leaderboard"
```

## Task 7: Final verification and documentation touch-up

**Files:**
- Modify: `README.md` (only if there is already a progression/premium section worth updating)
- Review: `docs/superpowers/specs/2026-07-02-global-xp-ranking-premium-badge-design.md`

- [ ] **Step 1: Add or update concise product documentation**

If `README.md` already documents ranking/premium, add a short section like:

```md
### Progression globale

- XP globale uniquement sur les quiz classes de la collection officielle
- Rangs derives de seuils XP
- Badge Premium distinct du rang joueur
```

Skip this change if it would create noisy unrelated churn.

- [ ] **Step 2: Run full project verification**

Run:

```bash
npm run typecheck
npm run lint
npm run build
```

Expected: PASS. Existing large-chunk Vite warnings are acceptable if unchanged in nature.

- [ ] **Step 3: Rebuild Docker deployment**

Run:

```bash
docker compose up -d --build
```

Expected: Atlas container rebuilds and restarts successfully.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: describe global xp and premium rank system"
```

## Self-review

### Spec coverage

- XP globale et plancher a 0: Task 1 + Task 2
- quiz classes officiels uniquement: Task 1
- gain/perte par difficulte: Task 1 + Task 3
- rangs globaux et seuils V1: Task 2
- affichage profil: Task 4
- badge premium distinct: Task 4
- menu compte: Task 5
- leaderboard avec rang mais tri inchange: Task 6
- feedback par reponse et validation finale: Task 3
- historique XP donnees sans UI detaillee obligatoire: Task 1

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” steps remain
- Each task has explicit files, commands, and code sketches
- The only configurable part left intentionally open is the exact threshold/grille tuning, but the plan ships concrete starter values

### Type consistency

- `xpTotal` is the frontend property name
- `xp_total` stays the database/RPC field name
- `xpDelta` maps from `xp_delta`
- `getRankForXp` and `getNextRankProgress` are the shared helper names used consistently

Plan complete and saved to `docs/superpowers/plans/2026-07-02-global-xp-ranking-premium-badge-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
