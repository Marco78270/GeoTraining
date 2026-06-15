# Training V1 Clickable World Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first playable training mode where the user answers one clue at a time by clicking the correct country on the world map, with session persistence in Supabase.

**Architecture:** Add a dedicated `/training` route inside the existing authenticated collection workspace, create a focused training API over published clues plus `training_sessions` / `training_answers`, and implement a small client-side session engine to drive setup, question flow, and completion. Reuse the existing world geography and map stack, but with a training-specific interaction layer that locks answers after the first click and reveals selected vs expected countries.

**Tech Stack:** React 19, TypeScript, React Router, TanStack Query, Supabase JS, MapLibre GL, Vitest, Testing Library.

---

## File Structure

- Create: `E:\GeoTraining\src\features\training\trainingApi.ts`
  - Loads eligible published clues and persists training sessions / answers.
- Create: `E:\GeoTraining\src\features\training\trainingSession.ts`
  - Pure session-selection and progression helpers for deterministic testing.
- Create: `E:\GeoTraining\src\features\training\TrainingPage.tsx`
  - Setup screen, question flow, completion screen.
- Create: `E:\GeoTraining\src\features\training\TrainingMap.tsx`
  - Training-specific clickable world-map interaction layer.
- Create: `E:\GeoTraining\src\features\training\trainingApi.test.ts`
  - Tests for clue loading and persistence helpers.
- Create: `E:\GeoTraining\src\features\training\trainingSession.test.ts`
  - Tests for question ordering, score, and progression.
- Create: `E:\GeoTraining\src\features\training\TrainingPage.test.tsx`
  - UI tests for setup, answer flow, and completion.
- Modify: `E:\GeoTraining\src\app\App.tsx`
  - Register `/training` route.
- Modify: `E:\GeoTraining\src\features\atlas\AtlasPage.tsx`
  - Replace placeholder nav item with a real link to `/training`.
- Modify: `E:\GeoTraining\src\styles\global.css`
  - Add training page styles aligned with Atlas.

## Task 1: Add Training Route And Page Shell

**Files:**
- Create: `E:\GeoTraining\src\features\training\TrainingPage.tsx`
- Modify: `E:\GeoTraining\src\app\App.tsx`
- Modify: `E:\GeoTraining\src\features\atlas\AtlasPage.tsx`
- Test: `E:\GeoTraining\src\features\training\TrainingPage.test.tsx`

- [ ] **Step 1: Write the failing route test**

```tsx
it("opens the protected training page route", async () => {
  renderAppAt("/training");
  expect(await screen.findByRole("heading", { name: /entrainement/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/App.test.tsx src/features/training/TrainingPage.test.tsx`
Expected: FAIL because `/training` is not registered and `TrainingPage` does not exist.

- [ ] **Step 3: Add the minimal route and page shell**

```tsx
// src/app/App.tsx
<Route
  path="/training"
  element={
    <CollectionWorkspace api={collectionApi}>
      <TrainingPage />
    </CollectionWorkspace>
  }
/>
```

```tsx
// src/features/training/TrainingPage.tsx
export function TrainingPage() {
  return (
    <main className="app-shell training-page">
      <h1>Entrainement</h1>
      <p>Chargement du mode entrainement…</p>
    </main>
  );
}
```

- [ ] **Step 4: Replace the Atlas placeholder navigation item**

```tsx
<NavLink to="/training"><GraduationCap />Entraînement</NavLink>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/app/App.test.tsx src/features/training/TrainingPage.test.tsx`
Expected: PASS

## Task 2: Create Training Session Engine

**Files:**
- Create: `E:\GeoTraining\src\features\training\trainingSession.ts`
- Test: `E:\GeoTraining\src\features\training\trainingSession.test.ts`

- [ ] **Step 1: Write failing pure-logic tests**

```ts
it("builds a deduplicated question list capped by the requested count", () => {
  const result = buildTrainingQuestions(clues, 5, () => 0.5);
  expect(result).toHaveLength(5);
  expect(new Set(result.map((question) => question.clue.id)).size).toBe(5);
});

it("marks the answer as correct when the clicked country matches", () => {
  const result = resolveTrainingAnswer(question, "FR");
  expect(result.isCorrect).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/training/trainingSession.test.ts`
Expected: FAIL because helpers do not exist.

- [ ] **Step 3: Implement the minimal session helpers**

```ts
export function buildTrainingQuestions(clues, requestedCount, random = Math.random) {
  const pool = shuffle([...clues], random);
  return pool.slice(0, Math.min(requestedCount, pool.length)).map((clue, index) => ({
    id: `${clue.id}:${index}`,
    clue,
    promptCountryCode: clue.countryCode,
  }));
}

export function resolveTrainingAnswer(question, selectedCode) {
  return {
    selectedCode,
    correctCode: question.clue.countryCode,
    isCorrect: selectedCode === question.clue.countryCode,
  };
}
```

- [ ] **Step 4: Add progression and score helpers**

```ts
export function nextTrainingIndex(currentIndex, totalQuestions) {
  return Math.min(currentIndex + 1, totalQuestions);
}

export function countCorrectAnswers(answers) {
  return answers.filter((answer) => answer.isCorrect).length;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/features/training/trainingSession.test.ts`
Expected: PASS

## Task 3: Add Training API And Persistence

**Files:**
- Create: `E:\GeoTraining\src\features\training\trainingApi.ts`
- Test: `E:\GeoTraining\src\features\training\trainingApi.test.ts`

- [ ] **Step 1: Write failing API tests**

```ts
it("loads published clues eligible for world-map training", async () => {
  await expect(api.loadPlayableClues("collection-1")).resolves.toEqual([
    expect.objectContaining({ id: "clue-1", countryCode: "FR" }),
  ]);
});

it("creates a training session and records an answer", async () => {
  const session = await api.createSession({ collectionId: "collection-1", totalQuestions: 10 });
  await api.recordAnswer({
    sessionId: session.id,
    clueId: "clue-1",
    selectedCode: "FR",
    correctCode: "FR",
    isCorrect: true,
  });
  expect(insertAnswer).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/training/trainingApi.test.ts`
Expected: FAIL because the API module does not exist.

- [ ] **Step 3: Implement clue loading**

```ts
type TrainingClue = {
  id: string;
  countryCode: string;
  countryName: string;
  categoryId: string;
  difficulty: "easy" | "medium" | "expert";
  imageUrl: string | null;
  imageAlt: string;
};

async function loadPlayableClues(collectionId: string): Promise<TrainingClue[]> {
  // select published clues with clue_images and countries(name)
}
```

- [ ] **Step 4: Implement session creation and answer persistence**

```ts
async function createSession(input) {
  return supabase.from("training_sessions").insert({
    collection_id: input.collectionId,
    mode: "world",
    category_id: input.categoryId ?? null,
    total_questions: input.totalQuestions,
  }).select().single();
}

async function recordAnswer(input) {
  await supabase.from("training_answers").insert({
    session_id: input.sessionId,
    clue_id: input.clueId,
    selected_code: input.selectedCode,
    correct_code: input.correctCode,
    is_correct: input.isCorrect,
  });
}
```

- [ ] **Step 5: Update session counters and completion**

```ts
async function updateSessionProgress(sessionId, updates) {
  await supabase.from("training_sessions").update(updates).eq("id", sessionId);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/features/training/trainingApi.test.ts`
Expected: PASS

## Task 4: Build Training Setup And Session Flow

**Files:**
- Modify: `E:\GeoTraining\src\features\training\TrainingPage.tsx`
- Modify: `E:\GeoTraining\src\features\collections\collectionKeys.ts`
- Test: `E:\GeoTraining\src\features\training\TrainingPage.test.tsx`

- [ ] **Step 1: Write failing UI tests for setup and start**

```tsx
it("prevents starting when the filtered clue pool is empty", async () => {
  render(<TrainingPage trainingApi={emptyApi} />);
  expect(await screen.findByText(/aucun indice jouable/i)).toBeInTheDocument();
});

it("starts a session from the setup form", async () => {
  render(<TrainingPage trainingApi={api} />);
  await user.click(await screen.findByRole("button", { name: /lancer/i }));
  expect(await screen.findByText(/question 1/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/training/TrainingPage.test.tsx`
Expected: FAIL because the setup and session flow are not implemented.

- [ ] **Step 3: Add setup form state**

```tsx
const [selectedCategoryId, setSelectedCategoryId] = useState("");
const [questionCount, setQuestionCount] = useState(10);
const [difficulties, setDifficulties] = useState<Set<Difficulty>>(new Set(["easy", "medium", "expert"]));
```

- [ ] **Step 4: Load eligible clues and build the session**

```tsx
const playableClues = useMemo(() => filterTrainingClues(rawClues, selectedCategoryId, difficulties), [rawClues, selectedCategoryId, difficulties]);

async function startSession() {
  const questions = buildTrainingQuestions(playableClues, questionCount);
  const persisted = await trainingApi.createSession({ collectionId: activeCollectionId, categoryId: selectedCategoryId || null, totalQuestions: questions.length });
  setSession({ sessionId: persisted.id, questions, currentIndex: 0, answers: [] });
}
```

- [ ] **Step 5: Add setup, playing, and completed sections**

```tsx
if (!session) return <TrainingSetup ... />;
if (isCompleted) return <TrainingResults ... />;
return <TrainingQuestionView ... />;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/features/training/TrainingPage.test.tsx`
Expected: PASS for setup/start coverage

## Task 5: Add Clickable World-Map Answer Interaction

**Files:**
- Create: `E:\GeoTraining\src\features\training\TrainingMap.tsx`
- Modify: `E:\GeoTraining\src\features\training\TrainingPage.tsx`
- Test: `E:\GeoTraining\src\features\training\TrainingPage.test.tsx`

- [ ] **Step 1: Write the failing answer-flow test**

```tsx
it("locks the answer after the first clicked country and reveals the result", async () => {
  render(<TrainingPage trainingApi={api} />);
  await startSession();
  await user.click(await screen.findByRole("button", { name: /france/i }));
  expect(await screen.findByText(/bonne reponse/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /question suivante/i })).toBeEnabled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/training/TrainingPage.test.tsx`
Expected: FAIL because there is no clickable map answer flow.

- [ ] **Step 3: Implement the training map interface**

```tsx
type TrainingMapProps = {
  countries: Array<{ code: string; name: string }>;
  selectedCode: string | null;
  correctCode: string | null;
  disabled: boolean;
  onSelect: (countryCode: string) => void;
};
```

- [ ] **Step 4: Add answer handling in the page**

```tsx
async function submitAnswer(selectedCode: string) {
  if (!currentQuestion || currentAnswer) return;
  const answer = resolveTrainingAnswer(currentQuestion, selectedCode);
  await trainingApi.recordAnswer({ sessionId: session.sessionId, clueId: currentQuestion.clue.id, ...answer });
  setSession((current) => ({ ...current, answers: [...current.answers, answer] }));
}
```

- [ ] **Step 5: Reveal selected and correct countries after validation**

```tsx
<TrainingMap
  selectedCode={currentAnswer?.selectedCode ?? null}
  correctCode={currentAnswer?.correctCode ?? null}
  disabled={Boolean(currentAnswer)}
  onSelect={submitAnswer}
/>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/features/training/TrainingPage.test.tsx`
Expected: PASS for answer locking and feedback

## Task 6: Add Next-Question Progression And Final Results

**Files:**
- Modify: `E:\GeoTraining\src\features\training\TrainingPage.tsx`
- Test: `E:\GeoTraining\src\features\training\TrainingPage.test.tsx`

- [ ] **Step 1: Write the failing completion-flow test**

```tsx
it("shows the final score after the last answered question", async () => {
  render(<TrainingPage trainingApi={api} />);
  await finishWholeSession();
  expect(await screen.findByText(/score final/i)).toBeInTheDocument();
  expect(screen.getByText("1 / 1")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/training/TrainingPage.test.tsx`
Expected: FAIL because there is no completion screen.

- [ ] **Step 3: Add explicit next-question progression**

```tsx
function goToNextQuestion() {
  setSession((current) => ({ ...current, currentIndex: current.currentIndex + 1 }));
}
```

- [ ] **Step 4: Persist completion and render the score**

```tsx
const correctCount = countCorrectAnswers(session.answers);
await trainingApi.completeSession(session.sessionId, {
  totalAnswers: session.answers.length,
  correctAnswers: correctCount,
});
```

```tsx
<section>
  <h2>Score final</h2>
  <p>{correctCount} / {session.questions.length}</p>
</section>
```

- [ ] **Step 5: Add a quick recap list**

```tsx
<ul>
  {session.answers.map((answer, index) => (
    <li key={`${answer.correctCode}:${index}`}>
      {answer.selectedCode} / {answer.correctCode}
    </li>
  ))}
</ul>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/features/training/TrainingPage.test.tsx`
Expected: PASS for session completion

## Task 7: Style And Verify The Feature

**Files:**
- Modify: `E:\GeoTraining\src\styles\global.css`
- Test: `E:\GeoTraining\src\features\training\TrainingPage.test.tsx`

- [ ] **Step 1: Add focused training styles**

```css
.training-page {}
.training-layout {}
.training-setup {}
.training-question {}
.training-results {}
```

- [ ] **Step 2: Keep the layout aligned with Atlas**

```css
.training-page .panel {
  background: rgba(8, 20, 38, 0.88);
  border: 1px solid rgba(120, 170, 255, 0.16);
}
```

- [ ] **Step 3: Run targeted tests**

Run: `npm test -- src/features/training/TrainingPage.test.tsx src/features/training/trainingApi.test.ts src/features/training/trainingSession.test.ts src/app/App.test.tsx`
Expected: PASS

- [ ] **Step 4: Run typecheck and build**

Run: `npm run typecheck`
Expected: PASS

Run: `npm run build`
Expected: PASS

## Self-Review

- Spec coverage check:
  - `/training` route covered in Task 1.
  - setup / playing / completed states covered in Tasks 4 and 6.
  - clickable world-map answer flow covered in Task 5.
  - `training_sessions` and `training_answers` persistence covered in Task 3 and Task 6.
  - final score and recap covered in Task 6.
- Placeholder scan: no `TODO`, `TBD`, or deferred implementation markers remain.
- Type consistency check: `TrainingPage` depends on `trainingApi.ts` and `trainingSession.ts`, and the answer shape consistently uses `selectedCode`, `correctCode`, and `isCorrect`.
