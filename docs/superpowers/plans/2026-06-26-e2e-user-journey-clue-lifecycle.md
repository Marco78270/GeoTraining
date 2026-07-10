# E2E User Journey Clue Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a robust Playwright end-to-end journey for login, clue lifecycle, clue deletion, and quiz launch, with browser diagnostics and the product fixes required to make that journey reliable.

**Architecture:** Extend the existing Playwright setup with a small diagnostics helper and a dedicated lifecycle spec. Adjust the product only where the journey exposes concrete gaps: malformed French copy, missing UI affordances for clue deletion, and any selector or feedback issues that make the real workflow brittle.

**Tech Stack:** React 19, TypeScript, Vite, Supabase Auth/Data, TanStack Query, Playwright, Vitest/Testing Library.

---

## File Structure

- Modify: `E:/GeoTraining/playwright.config.ts`
  - Add environment-aware e2e settings if needed for auth credentials or longer lifecycle timeouts.
- Create: `E:/GeoTraining/tests/e2e/helpers/browserDiagnostics.ts`
  - Centralize console, page error, request failure, and suspicious-response collection.
- Create: `E:/GeoTraining/tests/e2e/clue-lifecycle.spec.ts`
  - Main end-to-end user journey spec.
- Modify: `E:/GeoTraining/tests/e2e/smoke.spec.ts`
  - Keep it minimal and non-overlapping if needed after adding the new flow.
- Modify: `E:/GeoTraining/src/features/clues/ClueEditorPage.tsx`
  - Fix visible mojibake copy and ensure stable accessible text for loading/error states.
- Modify: `E:/GeoTraining/src/features/clues/ClueEditor.tsx`
  - Fix visible mojibake copy and, if needed, expose stable labels used by the lifecycle test.
- Modify: `E:/GeoTraining/src/features/auth/AuthForm.tsx`
  - Fix visible mojibake copy on auth screens that would surface during login.
- Modify: `E:/GeoTraining/src/features/auth/authContext.ts`
  - Fix the thrown developer-facing error string for consistency if touched by test logs.
- Modify: `E:/GeoTraining/src/features/clues/clueApi.ts`
  - Add clue deletion support in the API surface if the UI needs a first-class delete action.
- Modify: `E:/GeoTraining/src/features/atlas/AtlasPage.tsx`
  - Add the clue deletion affordance in the clue detail panel and reset stale UI state after removal.
- Modify: `E:/GeoTraining/src/features/clues/clueApi.test.ts`
  - Cover clue deletion behavior if new API behavior is added.
- Modify: `E:/GeoTraining/src/features/atlas/AtlasPage.test.tsx`
  - Cover the new delete action and post-delete UI state.

### Task 1: Map the existing clue lifecycle and auth hooks

**Files:**
- Modify: `E:/GeoTraining/docs/superpowers/plans/2026-06-26-e2e-user-journey-clue-lifecycle.md`
- Inspect: `E:/GeoTraining/src/features/auth/AuthForm.tsx`
- Inspect: `E:/GeoTraining/src/features/clues/ClueEditor.tsx`
- Inspect: `E:/GeoTraining/src/features/clues/clueApi.ts`
- Inspect: `E:/GeoTraining/src/features/atlas/AtlasPage.tsx`
- Inspect: `E:/GeoTraining/src/features/training/TrainingPage.tsx`

- [ ] **Step 1: Record the concrete selectors and gaps before coding**

Document the journey assumptions inline while reading code:

```text
Login uses Email + Mot de passe fields from AuthForm.
Creation uses the five-step ClueEditor flow.
Consultation and edit happen from Atlas detail panel.
Deletion is required by the user journey but not clearly exposed in Atlas detail UI yet.
Training can be considered "started" once the first question panel is visible.
```

- [ ] **Step 2: Verify the current missing piece for deletion**

Run: `rg -n "deleteClue|Supprimer l’indice|Supprimer l'indice|remove.mutate\\(|delete\\(" src/features`

Expected: Atlas has collection deletion, but clue-detail deletion is missing or incomplete, confirming the required product change.

- [ ] **Step 3: Commit planning checkpoint**

```bash
git add docs/superpowers/plans/2026-06-26-e2e-user-journey-clue-lifecycle.md
git commit -m "docs: add clue lifecycle e2e implementation plan"
```

### Task 2: Add browser diagnostics support for Playwright

**Files:**
- Create: `E:/GeoTraining/tests/e2e/helpers/browserDiagnostics.ts`
- Modify: `E:/GeoTraining/tests/e2e/clue-lifecycle.spec.ts`

- [ ] **Step 1: Write the failing helper usage in the new spec**

```ts
import { expect, test } from "@playwright/test";
import { attachBrowserDiagnostics } from "./helpers/browserDiagnostics";

test("runs the clue lifecycle without browser errors", async ({ page }) => {
  const diagnostics = attachBrowserDiagnostics(page);
  await page.goto("/");
  await diagnostics.assertClean();
});
```

- [ ] **Step 2: Run the focused Playwright spec to verify it fails**

Run: `npx playwright test tests/e2e/clue-lifecycle.spec.ts --project=chromium`

Expected: FAIL because `./helpers/browserDiagnostics` or `diagnostics.assertClean()` does not exist yet.

- [ ] **Step 3: Write the minimal diagnostics helper**

```ts
import { expect, type Page, type Response } from "@playwright/test";

type DiagnosticEntry = {
  type: "console" | "pageerror" | "requestfailed" | "response";
  message: string;
};

function shouldTrackResponse(response: Response) {
  const url = response.url();
  if (response.ok()) return false;
  return (
    url.includes("/auth/") ||
    url.includes("/rest/v1/") ||
    url.includes("/storage/v1/") ||
    url.includes("/functions/v1/") ||
    url.endsWith(".geojson") ||
    url.includes("/geography/")
  );
}

export function attachBrowserDiagnostics(page: Page) {
  const entries: DiagnosticEntry[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      entries.push({
        type: "console",
        message: message.text(),
      });
    }
  });

  page.on("pageerror", (error) => {
    entries.push({
      type: "pageerror",
      message: error.message,
    });
  });

  page.on("requestfailed", (request) => {
    entries.push({
      type: "requestfailed",
      message: `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? "unknown failure"}`,
    });
  });

  page.on("response", (response) => {
    if (!shouldTrackResponse(response)) return;
    entries.push({
      type: "response",
      message: `${response.status()} ${response.request().method()} ${response.url()}`,
    });
  });

  return {
    entries,
    async assertClean() {
      expect(
        entries,
        entries.length === 0
          ? "No browser diagnostics captured."
          : `Unexpected browser diagnostics:\\n${entries
              .map((entry) => `- [${entry.type}] ${entry.message}`)
              .join("\\n")}`,
      ).toEqual([]);
    },
  };
}
```

- [ ] **Step 4: Run the focused Playwright spec to verify the helper works**

Run: `npx playwright test tests/e2e/clue-lifecycle.spec.ts --project=chromium`

Expected: FAIL later in the scenario, but no longer due to missing diagnostics helper.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/helpers/browserDiagnostics.ts tests/e2e/clue-lifecycle.spec.ts
git commit -m "test: add playwright browser diagnostics helper"
```

### Task 3: Repair visible mojibake and stabilize user-facing copy

**Files:**
- Modify: `E:/GeoTraining/src/features/auth/AuthForm.tsx`
- Modify: `E:/GeoTraining/src/features/auth/authContext.ts`
- Modify: `E:/GeoTraining/src/features/clues/ClueEditor.tsx`
- Modify: `E:/GeoTraining/src/features/clues/ClueEditorPage.tsx`

- [ ] **Step 1: Write or update focused UI tests around visible copy if coverage is missing**

Add or extend assertions like:

```ts
expect(screen.getByRole("heading", { name: "Créer un compte" })).toBeVisible();
expect(screen.getByLabelText("Éditeur d'indice")).toBeVisible();
expect(screen.getByText("Retour à l’Atlas")).toBeVisible();
```

- [ ] **Step 2: Run the relevant unit tests to verify they fail against malformed strings**

Run: `npm test -- src/features/auth/LoginPage.test.tsx src/features/clues/ClueEditor.test.tsx src/features/clues/ClueEditorPage.test.tsx`

Expected: FAIL where old malformed strings are asserted or visible text no longer matches.

- [ ] **Step 3: Replace malformed visible strings with proper French copy**

Examples to apply consistently:

```ts
throw new Error("Une erreur réseau inattendue est survenue.");
// ...
{isLogin ? "Créer un compte" : "Déjà un compte ?"}
// ...
<section aria-label="Éditeur d'indice">
// ...
<span>Images de l’indice</span>
// ...
<h2>2. Catégorie</h2>
// ...
<h2>4. Détails</h2>
// ...
<h2>5. Difficulté et publication</h2>
// ...
{mode === "edit" ? "Mettre à jour l’indice" : "Publier l’indice"}
// ...
<nav aria-label="Navigation de l’éditeur">
// ...
<p role="status">Chargement de l’indice…</p>
// ...
<Link ...>Retour à l’Atlas</Link>
```

- [ ] **Step 4: Run the targeted unit tests to verify they pass**

Run: `npm test -- src/features/auth/LoginPage.test.tsx src/features/clues/ClueEditor.test.tsx src/features/clues/ClueEditorPage.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/AuthForm.tsx src/features/auth/authContext.ts src/features/clues/ClueEditor.tsx src/features/clues/ClueEditorPage.tsx
git commit -m "fix: repair french copy in auth and clue editor flows"
```

### Task 4: Add clue deletion to the Atlas clue detail lifecycle

**Files:**
- Modify: `E:/GeoTraining/src/features/clues/clueApi.ts`
- Modify: `E:/GeoTraining/src/features/clues/clueApi.test.ts`
- Modify: `E:/GeoTraining/src/features/atlas/AtlasPage.tsx`
- Modify: `E:/GeoTraining/src/features/atlas/AtlasPage.test.tsx`

- [ ] **Step 1: Write the failing API and UI tests for clue deletion**

Add API test intent:

```ts
it("deletes a clue with its images and optional zone data", async () => {
  await api.delete({
    clueId: "clue-1",
    existingImages: [
      { id: "img-1", storagePath: "collection/clue/img-1.jpg", altText: null, sortOrder: 0 },
    ],
    coverage: "drawn_zone",
  });

  expect(dataClient.deleteZone).toHaveBeenCalledWith("clue-1");
  expect(dataClient.removeImages).toHaveBeenCalledWith(["collection/clue/img-1.jpg"]);
  expect(dataClient.deleteImageMetadata).toHaveBeenCalledWith(["img-1"]);
  expect(dataClient.deleteClue).toHaveBeenCalledWith("clue-1");
});
```

Add Atlas UI test intent:

```tsx
it("allows deleting the selected clue and clears stale detail state", async () => {
  window.confirm = vi.fn(() => true);
  render(<AtlasPage atlasApi={atlasApi} />);
  await user.click(screen.getByText("France"));
  await user.click(screen.getByRole("button", { name: "Supprimer l’indice" }));
  expect(await screen.findByRole("status", { name: "Aucun pays" })).toBeVisible();
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/features/clues/clueApi.test.ts src/features/atlas/AtlasPage.test.tsx`

Expected: FAIL because no clue deletion method is exposed and Atlas has no clue delete button yet.

- [ ] **Step 3: Implement the minimal clue deletion API**

Add an API surface shaped like:

```ts
export type DeleteClueInput = {
  clueId: string;
  coverage: "whole_country" | "selected_regions" | "drawn_zone";
  existingImages: Array<{
    id: string;
    storagePath: string;
    altText: string | null;
    sortOrder: number;
  }>;
};

async delete(input: DeleteClueInput): Promise<void> {
  if (input.coverage === "drawn_zone") {
    await client.deleteZone(input.clueId);
  }
  if (input.existingImages.length > 0) {
    await client.removeImages(input.existingImages.map((image) => image.storagePath));
    await client.deleteImageMetadata(input.existingImages.map((image) => image.id));
  }
  await client.deleteClue(input.clueId);
}
```

- [ ] **Step 4: Expose deletion from Atlas detail and clear selection state after success**

Implement a clue-detail mutation with confirmation and post-delete cleanup:

```ts
const deleteClue = useMutation({
  mutationFn: (input: DeleteClueInput) => clueApi.delete(input),
  onSuccess: async () => {
    setSelectedClueId(null);
    setSelectedCountryCode(null);
    setSelectedRegionId(null);
    setSelectedImageIndex(0);
    setViewport("world");
    await query.refetch();
  },
});
```

Render a button such as:

```tsx
<button
  type="button"
  className="danger-button"
  onClick={() => {
    if (window.confirm(`Supprimer définitivement l’indice ${selectedClue.title} ?`)) {
      deleteClue.mutate({
        clueId: selectedClue.id,
        coverage: selectedClue.coverage,
        existingImages: selectedClue.images.map((image, index) => ({
          id: image.id,
          storagePath: image.storagePath,
          altText: image.altText,
          sortOrder: index,
        })),
      });
    }
  }}
>
  Supprimer l’indice
</button>
```

- [ ] **Step 5: Run the focused tests to verify they pass**

Run: `npm test -- src/features/clues/clueApi.test.ts src/features/atlas/AtlasPage.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/clues/clueApi.ts src/features/clues/clueApi.test.ts src/features/atlas/AtlasPage.tsx src/features/atlas/AtlasPage.test.tsx
git commit -m "feat: support clue deletion from atlas detail"
```

### Task 5: Build the Playwright clue lifecycle scenario

**Files:**
- Create: `E:/GeoTraining/tests/e2e/clue-lifecycle.spec.ts`
- Modify: `E:/GeoTraining/playwright.config.ts`

- [ ] **Step 1: Write the failing full e2e scenario**

Use a unique clue title and environment-based credentials:

```ts
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const uniqueId = Date.now();
const title = `E2E clue ${uniqueId}`;
const updatedTitle = `E2E clue updated ${uniqueId}`;

test("login, create, edit, consult, delete, and launch a quiz", async ({ page }) => {
  test.skip(!email || !password, "E2E credentials are required.");
  const diagnostics = attachBrowserDiagnostics(page);

  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(page.getByRole("link", { name: "GeoTrainer Atlas" })).toBeVisible();
  // continue through create -> consult -> edit -> delete -> training launch

  await diagnostics.assertClean();
});
```

- [ ] **Step 2: Run the spec to verify the first meaningful failure**

Run: `npx playwright test tests/e2e/clue-lifecycle.spec.ts --project=chromium`

Expected: FAIL at the first unimplemented or unstable lifecycle step, giving the next concrete change to make.

- [ ] **Step 3: Implement the scenario step by step**

Use visible assertions after each milestone:

```ts
await expect(page.getByRole("heading", { name: "Modifier un indice" })).toBeVisible();
await expect(page.getByText(updatedTitle)).toBeVisible();
await expect(page.getByRole("button", { name: "Supprimer l’indice" })).toBeVisible();
await expect(page.getByRole("heading", { name: "Question 1 / 1" })).toBeVisible();
```

Recommended browser steps:

```text
1. Login.
2. Open "/clues/new" from the add button.
3. Upload one small deterministic image fixture.
4. Select a writable collection and one category.
5. Pick one country with stable data, prefer "France" if available.
6. Fill title and notes.
7. Publish and return to Atlas.
8. Search the created clue title and open the matching country.
9. Edit title or notes, save, and verify the update in Atlas.
10. Delete the clue and verify it disappears.
11. Go to Training and launch a session from the current collection.
12. Verify first-question UI state.
13. Assert browser diagnostics are clean.
```

- [ ] **Step 4: Tune Playwright configuration only if the lifecycle needs it**

If necessary, add:

```ts
use: {
  baseURL: "http://127.0.0.1:5173",
  trace: "on-first-retry",
  screenshot: "only-on-failure",
  video: "retain-on-failure",
}
```

Keep the config narrow; do not add broad waits or retries unless the failure evidence justifies it.

- [ ] **Step 5: Run the focused Playwright scenario to verify it passes**

Run: `npx playwright test tests/e2e/clue-lifecycle.spec.ts --project=chromium`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts tests/e2e/clue-lifecycle.spec.ts
git commit -m "test: add clue lifecycle e2e journey"
```

### Task 6: Run final verification and summarize residual risk

**Files:**
- Inspect: `E:/GeoTraining/tests/e2e/clue-lifecycle.spec.ts`
- Inspect: `E:/GeoTraining/tests/e2e/helpers/browserDiagnostics.ts`

- [ ] **Step 1: Run unit tests for touched feature areas**

Run: `npm test -- src/features/auth/LoginPage.test.tsx src/features/clues/ClueEditor.test.tsx src/features/clues/ClueEditorPage.test.tsx src/features/clues/clueApi.test.ts src/features/atlas/AtlasPage.test.tsx`

Expected: PASS

- [ ] **Step 2: Run the final targeted Playwright scenario**

Run: `npx playwright test tests/e2e/clue-lifecycle.spec.ts --project=chromium`

Expected: PASS

- [ ] **Step 3: Run a production build sanity check**

Run: `npm run build`

Expected: successful TypeScript + Vite build

- [ ] **Step 4: Commit final verification checkpoint**

```bash
git add tests/e2e src/features playwright.config.ts
git commit -m "chore: verify clue lifecycle e2e coverage"
```

## Self-Review

- Spec coverage:
  - full lifecycle journey is covered by Tasks 4 and 5;
  - browser diagnostics are covered by Task 2;
  - visible product inconsistencies are covered by Task 3;
  - verification is covered by Task 6.
- Placeholder scan:
  - removed generic TODO wording; each task includes file scope, commands, and concrete code intent.
- Type consistency:
  - plan consistently uses `clueApi.delete`, `DeleteClueInput`, and `attachBrowserDiagnostics`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-26-e2e-user-journey-clue-lifecycle.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
