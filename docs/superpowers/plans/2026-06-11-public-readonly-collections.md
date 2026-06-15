# Public Readonly Collections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native public readonly collections, expose them in the app, and prepare the first official collection `Drapeaux des pays`.

**Architecture:** Extend the collection domain with a `visibility` field at the database and frontend model layers, broaden read access through RLS for public collections, and gate write actions in the UI when the active collection is public. Seed the first public collection and category through Supabase migrations so the app can consume them immediately.

**Tech Stack:** React, TypeScript, TanStack Query, Supabase Postgres, Supabase RLS, Vitest

---

### Task 1: Add Collection Visibility To The Database Schema

**Files:**
- Create: `supabase/migrations/20260611xxxxxx_add_collection_visibility.sql`
- Modify: `src/lib/database.types.ts`
- Test: `supabase/tests/rls.test.sql`

- [ ] **Step 1: Write the failing schema/RLS expectations**

Add assertions in `supabase/tests/rls.test.sql` for:
- `collections.visibility` exists
- the enum/type supports public readonly visibility
- public collections are readable by another authenticated user
- public collections are not writable by another authenticated user

- [ ] **Step 2: Review the current schema and policies**

Read:
- `supabase/migrations/202606100001_core_schema.sql`
- `supabase/migrations/202606100002_rls_and_storage.sql`

Confirm the current membership-only assumptions before editing.

- [ ] **Step 3: Add the visibility enum and column**

Create a migration that:
- defines a collection visibility enum
- adds `visibility` to `public.collections`
- sets default to `private`

Expected SQL shape:

```sql
create type public.collection_visibility as enum ('private', 'public_readonly');

alter table public.collections
  add column visibility public.collection_visibility not null default 'private';
```

- [ ] **Step 4: Broaden read helpers for public collections**

In the migration, add or replace helper functions so reads can succeed when:
- user is a member, or
- collection visibility is `public_readonly`

Keep write helpers membership/owner-based.

- [ ] **Step 5: Update RLS policies for read-only public access**

Adjust policies on:
- `collections`
- `categories`
- `clues`
- `clue_regions`
- `clue_images`
- storage read access for `clue-images`

So that public collections are readable without membership, while writes remain restricted.

- [ ] **Step 6: Update generated database types**

Modify `src/lib/database.types.ts` so `collections.Row`, `Insert`, and `Update` include `visibility`.

- [ ] **Step 7: Verify the migration and types**

Run:
- `npm run typecheck`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations src/lib/database.types.ts supabase/tests/rls.test.sql
git commit -m "feat: add public readonly collection visibility"
```

### Task 2: Expose Public Collections In The Frontend Collection API

**Files:**
- Modify: `src/features/collections/collectionApi.ts`
- Modify: `src/features/collections/collectionApi.test.ts`

- [ ] **Step 1: Write the failing frontend API test**

Add a test proving `listCollections()` returns visibility and can include a public collection row.

Test intent:

```ts
expect(result).toEqual([
  expect.objectContaining({
    id: "collection-public",
    visibility: "public_readonly",
  }),
]);
```

- [ ] **Step 2: Extend collection summary types**

Update `CollectionSummary` so it carries:
- `visibility`
- existing `role`

If needed, allow `role` to be `null` or a derived label for public collections, but do not invent owner/editor semantics where none exist.

- [ ] **Step 3: Update Supabase list mapping**

Modify `listCollections` handling so public collections can be returned even if they are not sourced from a membership join. If required, replace the current membership-only query with a query or RPC that can return:
- private collections the user belongs to
- public readonly collections

- [ ] **Step 4: Keep create/update/delete semantics unchanged**

Ensure:
- creating a collection still creates a private collection by default
- ownership flows remain unchanged

- [ ] **Step 5: Run targeted tests**

Run:
- `npm test -- src/features/collections/collectionApi.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/collections/collectionApi.ts src/features/collections/collectionApi.test.ts
git commit -m "feat: expose public collections in collection api"
```

### Task 3: Surface Public Readonly State In Collection UI

**Files:**
- Modify: `src/features/collections/CollectionPicker.tsx`
- Modify: `src/features/collections/CollectionPicker.test.tsx`
- Modify: `src/features/collections/CollectionsPage.tsx`
- Modify: `src/features/collections/ActiveCollectionProvider.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Write failing UI tests for public labels**

Add tests that public collections:
- appear in the picker
- display a public/readonly label in the collection page

- [ ] **Step 2: Update picker copy**

Render a label such as:
- `(publique)` or `(lecture seule)`

for `visibility === "public_readonly"`.

- [ ] **Step 3: Update collections page messaging**

When a public collection is selected, show:
- that it is shared with all users
- that edition is unavailable for standard users

- [ ] **Step 4: Preserve active selection behavior**

Ensure `ActiveCollectionProvider` can still auto-select:
- requested collection first
- otherwise first visible collection

without assuming every visible collection has an owner/editor membership row.

- [ ] **Step 5: Add minimal styling**

Add compact styles in `src/styles/global.css` for the public readonly badge/message.

- [ ] **Step 6: Verify tests**

Run:
- `npm test -- src/features/collections/CollectionPicker.test.tsx`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/collections/CollectionPicker.tsx src/features/collections/CollectionPicker.test.tsx src/features/collections/CollectionsPage.tsx src/features/collections/ActiveCollectionProvider.tsx src/styles/global.css
git commit -m "feat: show public readonly collections in ui"
```

### Task 4: Disable Write Actions When A Public Collection Is Active

**Files:**
- Modify: `src/features/collections/CollectionsPage.tsx`
- Modify: `src/features/atlas/AtlasPage.tsx`
- Modify: `src/features/atlas/AtlasPage.test.tsx`
- Modify: `src/features/clues/ClueEditor.tsx`
- Modify: `src/features/clues/ClueEditor.test.tsx`

- [ ] **Step 1: Write failing behavior tests**

Add tests verifying:
- `Ajouter un indice` is hidden or disabled for a public collection
- category management actions are hidden or disabled for a public collection

- [ ] **Step 2: Gate Atlas write entry points**

Update `AtlasPage` so public collections do not offer:
- add clue
- edit clue

to standard users.

- [ ] **Step 3: Gate collections management actions**

Update `CollectionsPage` so public collections do not offer:
- rename/delete collection
- add/edit/delete categories
- invitation/editor management actions

- [ ] **Step 4: Guard the clue editor**

If the user somehow opens the clue editor on a public collection without permission, render a clear readonly error state instead of a writable form.

- [ ] **Step 5: Verify targeted tests**

Run:
- `npm test -- src/features/atlas/AtlasPage.test.tsx src/features/clues/ClueEditor.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/collections/CollectionsPage.tsx src/features/atlas/AtlasPage.tsx src/features/atlas/AtlasPage.test.tsx src/features/clues/ClueEditor.tsx src/features/clues/ClueEditor.test.tsx
git commit -m "feat: enforce readonly ui for public collections"
```

### Task 5: Seed The First Public Collection And Category

**Files:**
- Create: `supabase/migrations/20260611xxxxxx_seed_public_flags_collection.sql`
- Modify: `README.md`

- [ ] **Step 1: Write the seed expectations**

Document and, if practical, assert that after migration:
- `Drapeaux des pays` exists
- it is `public_readonly`
- category `Drapeaux` exists in that collection

- [ ] **Step 2: Create deterministic seed SQL**

Insert:
- one public collection named `Drapeaux des pays`
- one category `Drapeaux`

Make the migration idempotent with `where not exists` or `on conflict do nothing` style patterns.

- [ ] **Step 3: Decide asset/data placeholder strategy**

If full flag assets are not yet committed, seed only the collection and category now, and document that clue rows will be imported in the next tranche.

- [ ] **Step 4: Update README**

Document:
- public readonly collections
- the first official collection
- any manual follow-up for populating flag clues if assets are deferred

- [ ] **Step 5: Verify build**

Run:
- `npm run build`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations README.md
git commit -m "feat: seed public flags collection"
```

### Task 6: End-To-End Verification Pass

**Files:**
- Modify: any touched files if fixes are required

- [ ] **Step 1: Run focused frontend tests**

Run:
- `npm test -- src/features/collections/collectionApi.test.ts`
- `npm test -- src/features/collections/CollectionPicker.test.tsx`
- `npm test -- src/features/atlas/AtlasPage.test.tsx`
- `npm test -- src/features/clues/ClueEditor.test.tsx`

Expected: PASS

- [ ] **Step 2: Run typecheck**

Run:
- `npm run typecheck`

Expected: PASS

- [ ] **Step 3: Run production build**

Run:
- `npm run build`

Expected: PASS

- [ ] **Step 4: Sanity check public collection UX**

Manually verify in the app:
- public collection appears in picker
- public collection can be opened in atlas
- write actions are absent or blocked

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "feat: add public readonly collections"
```
