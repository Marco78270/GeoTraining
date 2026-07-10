# Atlas Rank Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Atlas-themed SVG badge for every XP rank and a reusable progression card across profile, menu, leaderboard, and ranked quiz completion.

**Architecture:** Keep XP thresholds in `rankProgression.ts` as the single source of truth. Add a small visual metadata module and two presentational React components that consume existing rank keys and progress calculations; page components only compose those primitives. All SVG is code-native, accessible, and rendered without network assets.

**Tech Stack:** React 19, TypeScript, inline SVG, Vitest, Testing Library, CSS.

---

### Task 1: Rank visual metadata

**Files:**
- Create: `src/features/ranking/rankVisuals.ts`
- Test: `src/features/ranking/rankVisuals.test.ts`

- [ ] **Step 1: Write the failing visual metadata tests**

Test all 18 rank keys, the six family palettes, and III/II/I ornament levels through `getRankVisual(key)`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run test -- src/features/ranking/rankVisuals.test.ts`
Expected: FAIL because `rankVisuals.ts` does not exist.

- [ ] **Step 3: Implement immutable visual metadata**

Export `RankFamily`, `RankVisual`, and `getRankVisual`. Resolve the family and division from the existing `RankKey`, and return family colors plus division ornament count. Keep the values independent from XP thresholds.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm run test -- src/features/ranking/rankVisuals.test.ts`
Expected: PASS.

### Task 2: Reusable badge and progress card

**Files:**
- Create: `src/features/ranking/RankBadge.tsx`
- Create: `src/features/ranking/RankBadge.test.tsx`
- Create: `src/features/ranking/RankProgressCard.tsx`
- Create: `src/features/ranking/RankProgressCard.test.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Write failing component tests**

Assert that `RankBadge` exposes the full rank label, renders division ornaments, and supports compact/large sizes. Assert that `RankProgressCard` renders current rank, next rank, total XP, remaining XP, and an accessible progressbar.

- [ ] **Step 2: Run component tests and verify RED**

Run: `npm run test -- src/features/ranking/RankBadge.test.tsx src/features/ranking/RankProgressCard.test.tsx`
Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the SVG badge and card**

Build a geography-inspired badge with a globe, latitude/longitude lines, location pin, family-colored frame, and one to three division markers. Compose it inside `RankProgressCard`, using `getNextRankProgress(xp)` and semantic progress markup.

- [ ] **Step 4: Add responsive styles**

Add isolated `.rank-badge-*` and `.rank-progress-card-*` rules. Keep SVG colors in CSS custom properties and avoid page-specific dimensions inside the badge.

- [ ] **Step 5: Run component tests and verify GREEN**

Run: `npm run test -- src/features/ranking/RankBadge.test.tsx src/features/ranking/RankProgressCard.test.tsx`
Expected: PASS.

### Task 3: Profile and account menu integration

**Files:**
- Modify: `src/features/profile/ProfilePage.tsx`
- Modify: `src/features/profile/ProfilePage.test.tsx`
- Modify: `src/features/admin/ProfileMenu.tsx`
- Modify: `src/features/admin/ProfileMenu.test.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Add failing integration assertions**

On the profile, assert the large rank badge and exact remaining-XP progress. In the menu, assert the compact badge and accessible rank label.

- [ ] **Step 2: Run profile/menu tests and verify RED**

Run: `npm run test -- src/features/profile/ProfilePage.test.tsx src/features/admin/ProfileMenu.test.tsx`
Expected: FAIL because the new badge/card is absent.

- [ ] **Step 3: Replace duplicated profile progression markup**

Render `RankProgressCard` in `ProfilePage` and `RankBadge` in `ProfileMenu`, preserving all existing profile and billing behavior.

- [ ] **Step 4: Run profile/menu tests and verify GREEN**

Run: `npm run test -- src/features/profile/ProfilePage.test.tsx src/features/admin/ProfileMenu.test.tsx`
Expected: PASS.

### Task 4: Leaderboard and training completion integration

**Files:**
- Modify: `src/features/leaderboard/LeaderboardPage.tsx`
- Modify: `src/features/leaderboard/LeaderboardPage.test.tsx`
- Modify: `src/features/training/TrainingPage.tsx`
- Modify: `src/features/training/TrainingPage.test.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Add failing integration assertions**

Assert a compact SVG badge beside ranked leaderboard users. Assert the ranked completion panel shows the updated badge, progressbar, and remaining XP after XP is awarded.

- [ ] **Step 2: Run leaderboard/training tests and verify RED**

Run: `npm run test -- src/features/leaderboard/LeaderboardPage.test.tsx src/features/training/TrainingPage.test.tsx`
Expected: FAIL because those surfaces still use text-only rank output.

- [ ] **Step 3: Integrate shared components**

Use `RankBadge` for leaderboard rows and `RankProgressCard` for ranked quiz completion. Preserve promotion/relegation messaging and links.

- [ ] **Step 4: Run leaderboard/training tests and verify GREEN**

Run: `npm run test -- src/features/leaderboard/LeaderboardPage.test.tsx src/features/training/TrainingPage.test.tsx`
Expected: PASS.

### Task 5: Verification and deployment build

**Files:**
- Verify only.

- [ ] **Step 1: Run all focused ranking tests**

Run: `npm run test -- src/features/ranking src/features/profile/ProfilePage.test.tsx src/features/admin/ProfileMenu.test.tsx src/features/leaderboard/LeaderboardPage.test.tsx src/features/training/TrainingPage.test.tsx`
Expected: PASS.

- [ ] **Step 2: Run static checks**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS, or report pre-existing unrelated failures separately.

- [ ] **Step 3: Build and restart Docker**

Run: `docker compose up -d --build`
Expected: application image builds and services reach running state.

- [ ] **Step 4: Inspect service status**

Run: `docker compose ps`
Expected: GeoTrainer and proxy services are up.
