# Ideas beside the days

Status: November 16, 2026. Built and checked locally with synthetic data; deployed in version 13. No data change. Step "PR 5" of the
[feedback plan](feedback-2026-11-15-plan.md) (the rest of item C1, and L4). See [release history](releases/README.md) for dated live checks and remaining limits.

## What changed (screens wider than a phone)

- **Ideas are a column at the left of the board**, beside the days, instead of a
  section far below them. It stays put while the days scroll sideways.
- **Hide** folds the column to a narrow tab reading "Ideas · (count)"; clicking
  the tab opens it again. The choice is remembered on that device. A folded
  column still accepts a dragged card, which unschedules it.
- **Grouped by place** when the ideas belong to more than one place, in the
  trip's place order, with ideas that have no place under "Anywhere". With one
  place there are no headings.
- **Trips longer than four days open in the week view** (previously ten days or
  more), so a six-day stay shows every day and the ideas at once at 1440 px.
  **Larger cards** / **Fit a week** still switches, and the choice is still
  remembered. A device that already made a choice keeps it.
- The guest page has the same column (without Hide).

On a phone nothing moves: ideas still follow the selected day, as in
[within-reach.md](within-reach.md).

## How it works

One piece of markup serves both layouts: `.board-wrap` is a row on wide screens
and a column on phones. `ideaCards()` in `public/board.mjs` does the grouping
for planner, guest page and the guest preview. Drag-and-drop was not changed;
it already treats the whole ideas section as the "unschedule" target. The
offline shell cache is `waypoint-shell-v26`.

## Checks

- `npm test`: 118 pass (3 new in `tests/ideas-column.test.mjs`).
- `scripts/check-drag-browser.cjs` passes, including dragging a card onto the
  column to unschedule it (the script's pointer position was updated for the
  narrower target).
- Headless Chromium at 1440 × 900: week view shows the ideas column and all six
  days of the synthetic trip with no sideways page overflow; three-column view;
  folding, reopening and remembering; the guest page. 390 × 844: ideas after
  the day, signed in and as a guest.

Not verified: widths between 761 and 1000 px beyond a glance (the column takes
280 px there, leaving room for about one and a half days at 800 px; phone
landscape gets its own layout in the next step), the hosted Site, real data.
