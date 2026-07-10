# Daily Challenge Card Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the loose daily challenge presentation with the approved compact ranked card while preserving every challenge state and action.

**Architecture:** Keep `DailyChallengeCard` as the sole behavior component and change only its semantic markup and dedicated CSS selectors. Reuse the existing challenge data and countdown helper; no API, database, or routing change is required.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library, Docker Compose.

---

### Task 1: Lock the approved content and behavior

**Files:**
- Modify: `src/features/training/DailyChallengeCard.test.tsx`
- Test: `src/features/training/DailyChallengeCard.test.tsx`

- [ ] **Step 1: Update the fresh challenge assertion**

Assert the exact approved title, concise description, metric labels, and both actions:

```tsx
expect(screen.getByRole("heading", { name: "Défi quotidien (classé)" })).toBeVisible();
expect(screen.getByText(/identique pour tous/i)).toBeVisible();
expect(screen.getByText("Nouveau défi")).toBeVisible();
expect(screen.getByRole("button", { name: "Lancer" })).toBeVisible();
expect(screen.getByRole("link", { name: "Classement" })).toBeVisible();
```

- [ ] **Step 2: Run the focused test and observe the expected failure**

Run: `npm test -- src/features/training/DailyChallengeCard.test.tsx`

Expected: FAIL because the current component still renders the old heading, copy, and action labels.

### Task 2: Implement the compact card markup

**Files:**
- Modify: `src/features/training/DailyChallengeCard.tsx`
- Test: `src/features/training/DailyChallengeCard.test.tsx`

- [ ] **Step 1: Replace the title and concise supporting copy**

Use the exact title `Défi quotidien (classé)` and the sentence:

```tsx
<p className="daily-challenge-card__body">
  Un défi identique pour tous, composé d'indices issus des catégories officielles.
</p>
```

- [ ] **Step 2: Convert metadata into compact metric tiles**

Keep the semantic `dl`, rename `Réinitialisation` to `Nouveau défi`, and shorten the displayed values to `10`, `Pays`, and the countdown.

- [ ] **Step 3: Normalize action labels**

Use `Lancer`, `Reprendre`, and `Classement`, while still hiding the launch action after completion.

- [ ] **Step 4: Run the focused test**

Run: `npm test -- src/features/training/DailyChallengeCard.test.tsx`

Expected: all DailyChallengeCard tests PASS.

### Task 3: Apply the approved responsive styling

**Files:**
- Modify: `src/styles/global.css`
- Test: `src/features/training/DailyChallengeCard.test.tsx`

- [ ] **Step 1: Add the compact header and metrics grid**

Style `.daily-challenge-card__meta` as three equal columns with bordered, tinted metric tiles. Give `dt` muted small text and `dd` strong compact values.

- [ ] **Step 2: Balance both actions**

Style `.daily-challenge-card__actions` as two equal columns and make each control fill its column with the same minimum height.

- [ ] **Step 3: Preserve narrow mobile readability**

At the existing mobile breakpoint, keep metrics in a compact grid when possible and stack the actions only below the available width.

- [ ] **Step 4: Run component and Training regression tests**

Run: `npm test -- src/features/training/DailyChallengeCard.test.tsx src/features/training/TrainingPage.test.tsx`

Expected: all selected tests PASS.

### Task 4: Verify and deploy locally

**Files:**
- No source changes expected.

- [ ] **Step 1: Run static verification**

Run: `npm run lint && npm run typecheck && npm run build`

Expected: all commands exit with code 0.

- [ ] **Step 2: Rebuild Docker**

Run: `docker compose up -d --build`

Expected: `geotrainer-atlas` is recreated and reaches `healthy`.

- [ ] **Step 3: Validate desktop and mobile rendering**

Open `/training` with an authenticated premium account, verify the two balanced actions on desktop, then verify the compact mobile layout without horizontal overflow.
