# Daily Challenge Card Polish

## Objective

Improve the readability and visual hierarchy of the daily challenge card on the Training page without changing challenge behavior.

## Approved Design

- Display the exact title `Défi quotidien (classé)`.
- Keep the official badge aligned in the header.
- Replace the loose definition list presentation with three compact metric tiles: question count, mode, and reset countdown.
- Use one short supporting sentence: the challenge is identical for everyone and draws from official categories.
- Present the launch and leaderboard actions as two equal-width buttons.
- Preserve existing states: launch, resume, completed, and leaderboard navigation.
- Keep the current dark Atlas theme and cyan primary action.

## Responsive Behavior

- Desktop and tablet: three metric tiles and two actions on one row.
- Narrow mobile: metric tiles remain readable and actions may stack only when the available width requires it.

## Testing

- Preserve component behavior tests for launch, resume, and completed states.
- Assert the approved title and shortened copy.
- Validate the rendered card at desktop and mobile widths after the Docker rebuild.
