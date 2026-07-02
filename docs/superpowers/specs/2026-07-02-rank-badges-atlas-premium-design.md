# GeoTrainer Atlas Rank Badges Design

Date: 2026-07-02
Status: Proposed

## Goal

Add a premium Atlas-style visual identity to the existing XP rank system so users can immediately understand:

- their current rank
- how prestigious that rank feels
- how far they are from the next rank

The design should feel closer to exploration, geography, and premium progression than to arcade or aggressive esport styling.

## Scope

This spec covers:

- the badge visual system for all ranks
- the progression UI between ranks
- where the badge and progression appear in the product
- the implementation shape for reusable rank UI components

This spec does not change:

- rank thresholds
- XP gain and loss rules
- premium entitlements
- leaderboard ranking formulas

## Product Intent

The current rank system is logically complete but visually flat. Users can see labels like `Bronze III` or `Or III`, but the system does not yet feel like a real progression ladder.

The new badge system should make the rank journey feel:

- collectible
- premium
- readable at a glance
- consistent across profile, training, leaderboard, and account menu

The experience should reward progress without overwhelming the dark Atlas interface.

## Visual Direction

The chosen direction is `Atlas / exploration premium`.

This means:

- geography-inspired shapes
- a globe / marker / cartographic language
- elegant metallic families per rank tier
- restrained glow effects
- no loud arcade neon
- no military insignia feel
- no generic trophy-cup progression

The visual reference should feel like a polished atlas platform with game-like prestige layered on top.

## Badge System

### Structure

The system will use 6 badge families, each with 3 internal variants:

- Bronze: III, II, I
- Argent: III, II, I
- Or: III, II, I
- Diamant: III, II, I
- Master: III, II, I
- Grand Master: III, II, I

This yields 18 visible rank states while preserving a coherent family identity.

### Why 6 families instead of 18 unrelated badges

This approach keeps the system readable and maintainable:

- users instantly understand which high-level family they are in
- the sub-tier progression still feels meaningful
- the app can display badges at very small sizes without visual noise
- implementation stays consistent across mobile and desktop

## Badge Visual Language

Every badge should share a common silhouette so the system feels like one collection.

Shared ingredients:

- central medallion or shield-like atlas frame
- globe or map-disc core
- location marker or navigational motif
- subtle halo or metallic edge light
- bottom support shape that can evolve with prestige

### Family identity

#### Bronze

- dark copper / bronze metal
- simplest frame
- minimal glow
- entry-level explorer feel

#### Argent

- silver-blue finish
- cleaner reflective frame
- slightly more refined geometry

#### Or

- warm gold
- stronger rim light
- more ceremonial finish without looking gaudy

#### Diamant

- cool cyan / crystal tone
- faceted or star-cut accents
- sharper premium clarity

#### Master

- violet / indigo prestige palette
- orbital or celestial detailing
- visibly elite but still restrained

#### Grand Master

- pale iridescent white / violet-metal blend
- most complete frame
- crown-like atlas surround
- top-end collector badge

### Internal tier progression

Inside each family:

- `III` is the lightest version
- `II` adds side ornaments or a second ring
- `I` is the most complete form within that family

The progression must remain visible even at small size. The design should avoid tiny details that disappear in a compact badge.

## Asset Strategy

The implementation should use code-native SVG badges, not raster PNGs, for the main product UI.

Reasons:

- sharp rendering at all sizes
- lighter than image assets
- easy to recolor and refine
- easier to test in small UI surfaces
- better fit for dark-theme responsive layouts

Optional future enhancement:

- a separate large promotional rank board or hero illustration can be generated later for marketing or onboarding

That larger visual is explicitly out of scope for the first implementation.

## UX Surfaces

### 1. Profile page

The profile page becomes the primary progression surface.

It should show:

- current badge
- current rank label
- current XP total
- next rank label
- progress bar
- remaining XP before next rank

Example copy:

- `Rang actuel : Or III`
- `1540 XP`
- `460 XP avant Or II`

The badge should be visually prominent here, larger than everywhere else.

### 2. Profile menu

The profile menu should show:

- a compact badge
- rank label
- XP total

This is not a progression dashboard. It is a quick identity snapshot.

### 3. Leaderboard

The leaderboard should show:

- compact badge next to username
- rank label only when space allows

On tight mobile layouts, the badge takes priority over verbose metadata.

### 4. Training completion

The training completion panel should show:

- XP gain or loss
- updated rank badge
- progress bar toward next rank
- remaining XP

This is where the user most directly feels progression after play.

### 5. Future ranking and premium surfaces

The same badge system should be reusable later for:

- premium profile highlighting
- classification summaries
- future reward or badge pages

## Progression Bar Rules

The progression bar should always represent progress inside the current rank bracket toward the next rank.

It should display:

- filled percentage for the current bracket
- text for remaining XP

Rules:

- if a next rank exists, show remaining XP explicitly
- if the user is at max rank, show a complete bar and a max-rank message
- the visual bar color should harmonize with the current badge family when feasible, but should remain readable and accessible

## Technical Design

### New ranking presentation module

Add a reusable rank presentation layer under the ranking feature.

Suggested pieces:

- `rankVisuals.ts` or equivalent:
  - maps rank key or family to colors, variants, and labels
- `RankBadge.tsx`:
  - reusable SVG badge component
  - supports `sm`, `md`, `lg` sizes
- `RankProgressCard.tsx`:
  - reusable panel showing badge, XP, next rank, progress bar, remaining XP

This avoids duplicating rank rendering logic across profile, training, and leaderboard.

### Data flow

The visual layer should consume existing rank helpers:

- `getRankForXp`
- `getNextRankProgress`

No new persistence is required.

The badge system is a presentation layer on top of existing XP state.

## Accessibility

Badges must not rely only on color.

Requirements:

- different silhouettes or visible ornaments between families
- readable rank text adjacent to the badge in major surfaces
- sufficient contrast on dark backgrounds
- progress bar should have accessible text equivalents

## Testing

The first implementation should include focused tests for:

- badge rendering by rank family
- tier progression rendering (`III`, `II`, `I`)
- profile progress card showing remaining XP
- training completion panel showing updated progress
- leaderboard compact badge display

No snapshot-heavy test strategy is required. Prefer semantic assertions on labels, aria text, and deterministic attributes.

## Risks

### Risk 1: badges too detailed

If the SVGs become too decorative, they will blur in small surfaces like leaderboard rows and menus.

Mitigation:

- design for compact readability first
- keep the large profile version as a scale-up of the same structure, not a different asset

### Risk 2: inconsistent badge placement

If each page renders rank information differently, the system will feel fragmented.

Mitigation:

- use shared components
- centralize badge and progress rendering rules

### Risk 3: progression copy becomes noisy

Too many numbers on every surface can make the experience feel heavy.

Mitigation:

- full progression detail on profile and training completion
- compact rank identity on menu and leaderboard

## Recommended Implementation Order

1. Create rank visual tokens and family mapping
2. Build reusable SVG badge component
3. Build reusable progress card
4. Integrate on profile page
5. Integrate in profile menu
6. Integrate in leaderboard
7. Integrate in training completion
8. Polish spacing and mobile behavior

## Success Criteria

This work is successful when:

- every rank has a distinct premium Atlas-style badge
- users can instantly identify their current rank visually
- users can always see remaining XP to the next rank on major progression surfaces
- the UI stays clean on mobile and desktop
- the design feels integrated into GeoTrainer rather than pasted in from a generic game
