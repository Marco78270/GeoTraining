# Mobile Usability Design

## Goal

Make the main GeoTrainer workflows comfortable on phones without changing the desktop layout or duplicating React pages.

## Responsive approach

The existing components remain the single source of truth. Mobile behavior is applied below 42rem through scoped CSS and small semantic markup additions.

- The shared module header stays compact and keeps its navigation horizontally scrollable.
- Collection categories become stacked cards instead of a wide table.
- The clue editor reduces decorative spacing, keeps controls at touch-friendly sizes, and keeps the primary action visible.
- Statistics and collection panels use denser spacing and avoid unnecessary sticky or wide content.

## Accessibility

Table cells receive explicit mobile labels, controls remain at least 44px high, focus styles are preserved, and horizontal navigation remains keyboard-scrollable.

## Verification

Component tests cover the semantic category labels. Lint, targeted tests, production build, a phone viewport smoke test, and Docker rebuild validate the change.
