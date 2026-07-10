# Mobile Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve GeoTrainer phone usability while preserving the current desktop presentation.

**Architecture:** Reuse the existing React markup and add only semantic cell labels required by the mobile card layout. Keep all visual adaptations in the shared responsive stylesheet under a phone-only media query.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library, Vite, Docker Compose

---

### Task 1: Mobile category cards

**Files:**
- Modify: `src/features/collections/CategoryList.test.tsx`
- Modify: `src/features/collections/CategoryList.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Write the failing test**

Assert that the category metrics expose `data-label` values for Indices, Pays, Publies and Completude.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/collections/CategoryList.test.tsx`

Expected: FAIL because the current cells have no mobile labels.

- [ ] **Step 3: Write minimal implementation**

Add `data-label` attributes to metric and action cells, then switch the table to stacked cards below 42rem while preserving normal table display on desktop.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/collections/CategoryList.test.tsx`

Expected: PASS.

### Task 2: Compact shared mobile surfaces

**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: Add scoped phone styles**

Keep `.atlas-topbar` in a compact row, reduce brand and navigation dimensions, remove sticky sidebars, reduce panel padding, and use touch-friendly full-width actions where appropriate.

- [ ] **Step 2: Compact the clue editor**

Reduce topbar, header, workflow switch and upload-zone height; make text inputs 16px to avoid mobile browser zoom; keep publish and wizard actions sticky above the safe area.

- [ ] **Step 3: Verify desktop isolation**

Confirm all new rules live inside `@media (max-width: 42rem)` or narrower selectors.

### Task 3: Verification and deployment

**Files:**
- Test: `src/features/collections/CategoryList.test.tsx`
- Test: `src/features/clues/ClueEditor.test.tsx`

- [ ] **Step 1: Run automated checks**

Run: `npm run lint`

Run: `npm test -- src/features/collections/CategoryList.test.tsx src/features/clues/ClueEditor.test.tsx`

Run: `npm run build`

Expected: all commands succeed.

- [ ] **Step 2: Validate a phone viewport**

Open the running application at 390x844 and verify the compact header, category cards, and clue editor controls have no horizontal overflow.

- [ ] **Step 3: Rebuild deployment**

Run: `docker compose up -d --build`

Expected: application and proxy containers are running.
