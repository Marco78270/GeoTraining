# Training V1 Clickable World Map Design

## Goal

Deliver a first playable training flow where the user sees one clue image and answers by clicking the correct country on the world map.

## Scope

The v1 training mode includes:

- authenticated access only;
- active collection selection through the existing collection workspace;
- one training mode: `world`;
- one answer method: click a country on the world map;
- optional category filter;
- optional difficulty filter;
- configurable number of questions;
- one published clue per question;
- end-of-session score and quick recap;
- persistence in `training_sessions` and `training_answers`.

The v1 explicitly excludes:

- region-level answers;
- free-text answers;
- multiple-choice answers;
- timer / speed scoring;
- advanced statistics dashboards;
- multiplayer or sharing.

## User Flow

1. The user opens `/training`.
2. The page loads the active collection and the published clues available for training.
3. The user chooses:
   - category;
   - difficulty filters;
   - number of questions.
4. The user starts the session.
5. For each question:
   - show the main clue image;
   - keep the correct country hidden;
   - let the user click a country on the world map;
   - lock the answer after the first click;
   - highlight both the selected country and the correct country;
   - show immediate feedback;
   - continue with `Question suivante`.
6. At the end, show:
   - score;
   - total correct answers;
   - quick list of guessed vs expected countries;
   - replay action.

## Data and Selection Rules

- Only `published` clues are eligible.
- Only clues with a resolvable country on the world map are eligible.
- A session samples clues from the active collection after applying the selected filters.
- The same clue should not appear twice in one session unless the eligible pool is smaller than the requested question count.
- The correct answer is always `clue.country_code`.

## Architecture

### Training page

Add a dedicated page component for `/training` with three UI states:

- setup;
- in-progress session;
- completed session.

### Training API

Create a training-focused API module that:

- loads the eligible published clues for the active collection;
- creates a `training_sessions` row on start;
- records one `training_answers` row per answered question;
- updates session counters and completion timestamp.

### Session engine

Create a small client-side session engine that:

- builds the ordered question list;
- tracks current question index;
- stores the selected answer for the current question;
- computes correctness;
- advances only after explicit user action.

### Training map

Reuse the existing world geography and map foundation, but provide a dedicated training interaction layer:

- neutral state before answer;
- selected country state after click;
- correct country reveal state after validation;
- disabled interaction once answered.

## UX Decisions

- The page should feel visually aligned with Atlas.
- The clue title should be hidden during the question to avoid giving away the answer.
- The main clue image is enough for v1; secondary images can be ignored at first.
- Immediate feedback is shown after each click.
- The user cannot change an answer after validation.

## Error Handling

- If no active collection exists, show a guided empty state.
- If the filtered pool is empty, show a clear message and prevent session start.
- If saving an answer fails, keep the UI stable and show an actionable error.
- If the session cannot be created, the quiz must not start in a half-persisted state.

## Persistence

### `training_sessions`

At session start:

- create one row with `mode = 'world'`;
- store `collection_id`;
- store optional `category_id`;
- store `total_questions`.

At each answer:

- increment `total_answers`;
- increment `correct_answers` when needed.

At completion:

- set `completed_at`.

### `training_answers`

For each answered question, insert:

- `session_id`;
- `clue_id`;
- `selected_code`;
- `correct_code`;
- `is_correct`.

## Testing

- unit tests for clue selection and session progression;
- unit tests for score computation;
- UI tests for:
  - empty pool handling;
  - map answer submission;
  - next-question flow;
  - final score screen.

## Delivery Order

1. Training route and page shell.
2. Training API and persistence.
3. Session engine.
4. Clickable world-map answer flow.
5. Result screen and tests.
