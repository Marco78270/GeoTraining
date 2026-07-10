# Searchable Clue Library Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de saisir du texte dans tous les filtres de la bibliothèque d'indices tout en conservant une liste déroulante, avec filtrage des cartes après 250 ms.

**Architecture:** Un composant combobox contrôlé et accessible gère la saisie, les suggestions, le clavier et l'effacement. `CategoryList` transforme chaque saisie différée en liste d'identifiants correspondants, puis l'API applique ces listes côté Supabase avec des clauses `in`, afin de conserver la pagination serveur.

**Tech Stack:** React 19, TypeScript, TanStack Query, Supabase JS, Vitest, Testing Library, CSS.

---

## Task 1: Add normalized option matching

**Files:**
- Create: `src/features/collections/searchableFilter.ts`
- Create: `src/features/collections/searchableFilter.test.ts`

- [ ] **Step 1: Write the failing normalization tests**

Cover blank input, case-insensitive matching, accent-insensitive matching, partial labels, and no result. Use value/label options so technical IDs never depend on translated labels.

```ts
expect(matchFilterValues(options, "mex")).toEqual(["MX"]);
expect(matchFilterValues(options, "cote")).toEqual(["CI"]);
expect(matchFilterValues(options, "")).toBeUndefined();
expect(matchFilterValues(options, "inconnu")).toEqual([]);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- src/features/collections/searchableFilter.test.ts`

Expected: FAIL because `searchableFilter.ts` and `matchFilterValues` do not exist.

- [ ] **Step 3: Implement the minimal matching helpers**

Export a `SearchableFilterOption` type, a normalization helper using Unicode NFD plus combining-mark removal, `filterOptions`, and `matchFilterValues`. Blank input must mean no filter (`undefined`); nonblank input with no match must return `[]`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- src/features/collections/searchableFilter.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/collections/searchableFilter.ts src/features/collections/searchableFilter.test.ts
git commit -m "test: add normalized clue filter matching"
```

## Task 2: Build the accessible searchable dropdown

**Files:**
- Create: `src/features/collections/SearchableFilter.tsx`
- Create: `src/features/collections/SearchableFilter.test.tsx`
- Modify: `src/styles/global.css:775-821`
- Modify: `src/styles/global.css:5476-5485`

- [ ] **Step 1: Write failing interaction tests**

Test that the control:
- opens from typing and from the disclosure button;
- filters suggestions while typing;
- selects a suggestion with click, Arrow keys and Enter;
- closes with Escape;
- clears through an explicit button;
- exposes `role="combobox"`, `role="listbox"`, `aria-expanded`, `aria-controls`, and an associated visible label.

- [ ] **Step 2: Run the component test and verify it fails**

Run: `npm test -- src/features/collections/SearchableFilter.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the controlled component**

Accept `label`, `value`, `placeholder`, `allLabel`, `options`, and `onChange`. Keep focus in the text field while navigating suggestions, make the full option list available when opened with an empty query, and call `onChange("")` from the clear action. Do not introduce a UI dependency.

- [ ] **Step 4: Add desktop and mobile styles**

Position the listbox below its field with a bounded height and internal scrolling. Keep a minimum 44 px touch target, visible focus states, and a single-column layout under the existing mobile breakpoint. Ensure the popup overlays cards instead of changing the filter panel height.

- [ ] **Step 5: Run the focused tests**

Run: `npm test -- src/features/collections/SearchableFilter.test.tsx src/features/collections/searchableFilter.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/collections/SearchableFilter.tsx src/features/collections/SearchableFilter.test.tsx src/styles/global.css
git commit -m "feat: add searchable collection filter control"
```

## Task 3: Extend the clue library query to multiple matching values

**Files:**
- Modify: `src/features/collections/collectionApi.ts:56-68`
- Modify: `src/features/collections/collectionApi.ts:265-277`
- Modify: `src/features/collections/collectionApi.ts:702-718`
- Modify: `src/features/collections/collectionApi.test.ts:468-529`

- [ ] **Step 1: Update API tests first**

Replace singular filter expectations with `categoryIds`, `countryCodes`, and `statuses`. Add a test proving that an empty array returns an empty paginated result without calling `listClueRows`.

```ts
expect(listClueRows).toHaveBeenCalledWith(expect.objectContaining({
  categoryIds: ["bollards"],
  countryCodes: ["MX"],
  statuses: ["published"],
}));
```

- [ ] **Step 2: Run the API test and verify it fails**

Run: `npm test -- src/features/collections/collectionApi.test.ts`

Expected: FAIL because `ClueLibraryQuery` and `listClueRows` still accept singular values.

- [ ] **Step 3: Change the query contracts**

Replace `categoryId`, `countryCode`, and `status` in `ClueLibraryQuery` and `ClueLibraryDataQuery` with their plural array forms. Keep `search`, pagination, and result shapes unchanged.

- [ ] **Step 4: Apply array filters in the Supabase client**

Use `.in("category_id", input.categoryIds)`, `.in("country_code", input.countryCodes)`, and `.in("status", input.statuses)` only for non-empty arrays. Return an empty result before querying if any supplied array is empty, preventing an invalid or ambiguous Supabase request.

- [ ] **Step 5: Run the API tests**

Run: `npm test -- src/features/collections/collectionApi.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/collections/collectionApi.ts src/features/collections/collectionApi.test.ts
git commit -m "feat: support multi-value clue library filters"
```

## Task 4: Integrate live searchable filters into the library

**Files:**
- Modify: `src/features/collections/CategoryList.tsx:73-98`
- Modify: `src/features/collections/CategoryList.tsx:141-192`
- Modify: `src/features/collections/CategoryList.test.tsx:119-180`

- [ ] **Step 1: Replace the existing select test with failing live-filter tests**

Use fake timers or `waitFor` with the 250 ms boundary. Verify:
- title search is deferred by 250 ms;
- typing `mex` sends `countryCodes: ["MX"]`;
- typing a partial category sends all matching category IDs;
- typing `pub` sends `statuses: ["published"]`;
- typing an unmatched value renders the empty state without a broad fallback query;
- selecting a suggestion still applies the same filter;
- every filter change resets `page` to 1.

- [ ] **Step 2: Run the component test and verify it fails**

Run: `npm test -- src/features/collections/CategoryList.test.tsx`

Expected: FAIL because the page still renders native selects and singular query fields.

- [ ] **Step 3: Add a reusable 250 ms debounced value hook locally**

Replace `useDeferredValue` with a deterministic 250 ms debounce for title, category, country, and status text. Keep immediate input rendering while only the debounced values affect the React Query key and API request.

- [ ] **Step 4: Derive filter options and matching IDs**

Map metadata to `{ value, label }` options, including localized `Publié` and `Brouillon` labels. Use `matchFilterValues` on debounced text. Memoize option arrays and matched arrays so React Query keys remain stable between unrelated renders.

- [ ] **Step 5: Replace the three native selects**

Render `SearchableFilter` for category, country, and status. Preserve the existing title search field, adding a clear action if text is nonempty so all four fields have equivalent reset behavior. Keep labels and all-values placeholders in French.

- [ ] **Step 6: Run focused collection tests**

Run: `npm test -- src/features/collections/CategoryList.test.tsx src/features/collections/SearchableFilter.test.tsx src/features/collections/searchableFilter.test.ts src/features/collections/collectionApi.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/collections/CategoryList.tsx src/features/collections/CategoryList.test.tsx
git commit -m "feat: filter clue library while typing"
```

## Task 5: Verify quality, responsive behavior, and deployment build

**Files:**
- Modify only if verification reveals a defect in the files above.

- [ ] **Step 1: Run static validation**

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

Run: `npm run lint`

Expected: PASS with no ESLint errors.

- [ ] **Step 2: Run the full unit suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Build the production bundle**

Run: `npm run build`

Expected: PASS and Vite emits the production assets.

- [ ] **Step 4: Rebuild Docker as required by the project workflow**

Run: `docker compose up -d --build`

Expected: the application and Caddy containers are rebuilt and running.

- [ ] **Step 5: Perform browser QA on `/collections`**

At desktop and mobile widths, verify category, country, and status typing; suggestion selection; keyboard navigation; clear buttons; no-result behavior; pagination reset; popup stacking; and that cards visibly update after the 250 ms delay.

- [ ] **Step 6: Inspect container status**

Run: `docker compose ps`

Expected: project services report a running/healthy state with their expected ports.

- [ ] **Step 7: Commit any verification-only corrections**

```bash
git add src/features/collections src/styles/global.css
git commit -m "fix: finalize searchable clue library filters"
```

## Self-review

- [ ] Every field supports typing; category, country, and status retain dropdown suggestions.
- [ ] Filtering happens after 250 ms without blocking input rendering.
- [ ] Matching ignores case and accents.
- [ ] Empty text means all values; unmatched text means no results, never a broad query.
- [ ] Server pagination and image signing remain unchanged.
- [ ] Keyboard, focus, mobile touch targets, and ARIA semantics are covered.
- [ ] No database migration or new runtime dependency is required.
- [ ] All tests, typecheck, lint, production build, Docker rebuild, and browser QA are included.
