# Performance And Public Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce initial frontend payload while making the public default flags collection first-class across Atlas, Collections, and Training.

**Architecture:** Split route-level pages behind `React.lazy` with a lightweight authenticated shell fallback, while keeping the existing dynamic `maplibre` imports inside map components. In parallel, harden the public flags collection seed/import path and make the collection presentation/read flow more explicit so public readonly content behaves predictably everywhere.

**Tech Stack:** React 19, React Router 7, Vite, Vitest, Supabase, MapLibre

---

### Task 1: Route-Level Lazy Loading

**Files:**
- Modify: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`

- [ ] Add lazy imports for `AtlasPage`, `CollectionsPage`, `TrainingPage`, `ClueEditorPage`, and `AcceptInvitationPage`.
- [ ] Wrap authenticated route elements in a shared `Suspense` fallback that matches the existing session-loading visual style.
- [ ] Update route tests only where lazy rendering changes assertions or timing.

### Task 2: Public Flags Collection Hardening

**Files:**
- Modify: `supabase/migrations/20260611231500_seed_public_flags_collection.sql`
- Modify: `scripts/official-flags/import-official-flags.mjs`
- Modify: `src/features/collections/collectionApi.ts`
- Test: `src/features/collections/collectionApi.test.ts`

- [ ] Fix visible text and metadata strings for the seeded public collection.
- [ ] Make the import script more tolerant of legacy schemas and duplicate runs.
- [ ] Ensure collection listing continues to surface public readonly collections reliably even when optional columns are missing.

### Task 3: Public Collection UX Readiness

**Files:**
- Modify: `src/features/collections/CollectionPicker.tsx`
- Modify: `src/features/atlas/AtlasPage.tsx`
- Modify: `src/features/training/TrainingPage.tsx`
- Test: `src/features/atlas/AtlasPage.test.tsx`
- Test: `src/features/training/TrainingPage.test.tsx`

- [ ] Clarify public readonly labeling where the active collection is shared.
- [ ] Verify Atlas and Training can operate cleanly when the selected collection is the public flags collection.
- [ ] Keep write actions hidden or disabled for public readonly content.

### Task 4: Verification

**Files:**
- No code changes required unless a verification failure reveals a bug.

- [ ] Run `npm test -- src/app src/features/collections src/features/atlas src/features/training`
- [ ] Run `npm run typecheck`
- [ ] Run `npm run build`
