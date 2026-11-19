# All days in one scroll (phones)

Status: November 16, 2026. Built and checked locally with synthetic data; deployed in version 15. No data change. Step "PR 10" of the
[feedback plan](feedback-2026-11-15-plan.md) (item L3). See [release history](releases/README.md) for dated live checks and remaining limits.

On an upright phone the day rail now has an **All days** stop, next to Ideas.

- Tap it and every day is shown, one under another, each with its own heading,
  stay line, cards and "+ Add to (day)". Tap it again to return to one day at a
  time. The choice is remembered on that device.
- The day rail stays pinned at the top. Tapping a day scrolls to it. As you
  scroll, the rail highlights the day on screen, and the "This day" map and the
  global Add activity follow that day.
- Ideas and the map come after the last day, as before.
- Press-and-hold drag works as before; hovering a day in the drop panel
  scrolls to that day.
- The guest page has the same stop and remembers the choice the same way. That
  preference is the only thing the guest page stores in the browser.

It is offered only in the upright phone layout. Sideways and on a laptop the
days are already side by side.

The offline shell cache is `waypoint-shell-v33`.

## Checks

- `npm test`: 132 pass in the combined release (3 new in `tests/all-days.test.mjs`).
- Headless Chromium at 390 × 844, signed in and as a guest: one day by
  default; all six days after the toggle; tapping a day puts its heading just
  under the rail; scrolling changes the highlighted day; the choice survives a
  reload; "+ Add" inside a day still fills in that day; switching back; the
  stop is hidden sideways. No script errors, no sideways overflow.
- `scripts/check-drag-browser.cjs`, `npm run test:api`, type check and the
  production build pass.

Not verified: a physical phone (the pinned rail under Safari's toolbar, and
how scrolling feels on a long trip), the hosted Site.
