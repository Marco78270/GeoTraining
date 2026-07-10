# E2E User Journey Clue Lifecycle Design

## Goal

Automate a realistic end-to-end user journey covering:

- login;
- clue creation;
- clue update;
- clue consultation in Atlas;
- deletion of the created clue;
- quiz launch from Training;
- browser-log analysis to surface potential product and integration issues.

## Context

The repository already has strong unit and component coverage across auth, clue editing, Atlas, collections, and training. It also has a minimal Playwright smoke test in `tests/e2e/smoke.spec.ts`.

What is missing is a robust user-journey test that validates how these features behave together in the browser, with enough instrumentation to catch:

- UI regressions not obvious in unit tests;
- console errors and unhandled page exceptions;
- failed or suspicious network responses;
- incoherent copy or broken actions exposed only in the real flow.

During context exploration, the current code already shows two likely user-facing inconsistencies:

- several strings in clue editor pages are visibly mojibake-encoded;
- clue deletion appears available in the data layer but not clearly exposed in the Atlas clue detail UI, even though deletion is part of the requested user journey.

## User Requirements

### 1. Realistic browser coverage

The automated test must follow the same path a normal user would take in the app:

1. sign in;
2. create a clue in a writable collection;
3. find and open the clue in Atlas;
4. edit the clue and verify the updated content is visible;
5. delete that clue;
6. launch a quiz and verify the training flow starts correctly.

### 2. Actionable diagnostics

The test must collect browser diagnostics so failures are easier to understand:

- `console.error`;
- uncaught `pageerror`;
- failed network requests;
- unexpected HTTP responses for app API calls and critical assets.

### 3. Product cleanup in scope

If the automated journey reveals obvious user-facing inconsistencies that block the flow or make it unreliable, those fixes are in scope for this change. Typical examples:

- broken labels or malformed French text;
- missing delete affordance for the tested lifecycle;
- brittle selectors caused by inaccessible or ambiguous UI text.

## Design

### Test Strategy

Add one dedicated Playwright spec for the clue lifecycle journey instead of expanding the existing smoke test. The new spec should:

- stay focused on one deterministic happy path;
- use accessible selectors and visible text whenever practical;
- create uniquely identifiable test data so the clue can be found safely;
- assert product-visible outcomes after each major step.

The smoke test remains as a fast entry check, while the new test becomes the main integration scenario.

### Environment Assumptions

The test will target the local Vite app launched by the existing Playwright global setup.

The test should assume a usable local dataset and authenticated test credentials are available through environment variables or a local fixture strategy already compatible with the repo. If no stable auth bootstrap exists yet, the implementation may introduce a small helper for that purpose, but should avoid broad new infrastructure.

### Browser Log Instrumentation

Create a reusable Playwright helper that records:

- console messages by level;
- page errors;
- request failures;
- selected non-OK responses.

Behavior:

- accumulate diagnostics during the scenario;
- ignore expected noise only if it is already understood and documented in code;
- fail the test at the end when unexpected critical diagnostics were captured;
- include the captured entries in the assertion message so debugging is direct.

### Scope of Product Fixes

The implementation may change product code where needed to make the lifecycle test both valid and meaningful.

In-scope product adjustments:

- fix malformed editor and clue-page copy;
- expose or complete clue deletion from the relevant user-facing screen;
- add stable accessible labels where the current UI is too ambiguous for robust automation.

Out of scope:

- broad redesign of Atlas or Training;
- unrelated refactors;
- multi-scenario e2e coverage for every edge case.

## UI and Flow Expectations

### Login

The user lands on the login page, signs in successfully, and reaches the authenticated application shell.

### Creation

The user opens the clue creation flow, provides the minimum valid information plus a test-specific title, publishes the clue, and returns to Atlas.

### Consultation

The user can locate the created clue in Atlas and see its title and core metadata in the detail panel.

### Update

The user edits the clue, changes at least one visible field such as the title or notes, saves, and then sees the updated value reflected in Atlas.

### Deletion

The user can delete the clue through the UI with an explicit confirmation step. After deletion:

- the clue no longer appears in Atlas;
- the UI does not keep showing stale detail state for the removed clue.

### Quiz Launch

The user opens Training, launches a session, and sees the first question state with the expected quiz UI elements.

The test does not need to complete the full quiz unless that becomes necessary for stability or to verify the training session actually started.

## Testing

### Automated Coverage

Add:

- one Playwright helper for diagnostics;
- one Playwright spec for the lifecycle scenario.

Keep assertions centered on:

- route transitions or equivalent visible screen state;
- success states after create and update;
- absence after deletion;
- training session start state after launch.

### Verification

Run the targeted Playwright scenario locally and inspect the captured diagnostics. If the flow reveals concrete product issues, fix them and rerun until:

- the scenario passes;
- no unexpected critical browser diagnostics remain.

## Risks and Mitigations

### Auth brittleness

Risk:
E2E auth may be unstable if it depends on manually prepared data.

Mitigation:
Prefer a narrow helper or documented env-based credentials rather than a large new bootstrap layer.

### Data collisions

Risk:
Repeated test runs may target the wrong clue if titles are reused.

Mitigation:
Generate a unique clue title per run and always select by that unique identifier.

### Hidden product gaps

Risk:
The full lifecycle may uncover missing UI affordances, especially around deletion.

Mitigation:
Treat those gaps as valid scope for this task when they are required for the approved journey.
