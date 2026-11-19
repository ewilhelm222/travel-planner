# Add and Ideas within reach

Status: November 16, 2026. Built and checked locally with synthetic data; deployed in version 13. No database migration and no stored trip is rewritten. Step "PR 4" of
the [feedback plan](feedback-2026-11-15-plan.md) (items C2, M1, S1, S4, part of
C1, and the decision that guests see ideas). See [release history](releases/README.md) for dated live checks and remaining limits.

## What changed

- **Add where you are.** Every day ends with **+ Add to (day)**. The form
  opens with that day and the place of that day's stay already chosen. The
  Ideas list ends with **+ Add an idea**, which opens the form with no day.
  The global **Add activity** button is unchanged. These buttons appear only
  while editing is possible.
- **Ideas before the map.** The order under the days is now Ideas, then Map. On
  a phone the Ideas list starts right under the selected day instead of about
  1,300 px down, and the day rail begins with an **Ideas** stop showing how many
  there are; tapping it jumps to the list.
- **No empty map.** When fewer than two places can be drawn, the map panel says
  so in one sentence instead of drawing one dot in an empty box. The list of
  stops, with addresses and **Edit place**, stays.
- **Stay details.** The stay line on the board now opens a reading view: place,
  check-in and check-out, who, lodging, address and notes, with **Edit stay**
  inside it. The pill on the line says "Details" and the line has a clear
  outline on hover and keyboard focus.
- **Check-out day.** The day a stay ends used to show no stay at all. It now
  shows "⌂ Check-out day · …", which opens the same details.
- **Guests see ideas.** The guest link now includes unscheduled ideas, below the
  days, with the Ideas stop on a phone.

## Guest link: what is and is not shared

For an idea, guests receive exactly what they receive for a dated activity:
title, time text, the Optional and whole-group marks, group labels, the guest
description and the guest meeting point. Private notes, the private address,
links, and anything marked as an example are not sent. Stays, the stay details
view, journeys and maps are still not on the guest link.

**Before deploying, read through the existing ideas.** They were written while
ideas were private; their titles become visible to everyone holding the link.
The Guest link dialog's text and its "Preview exactly what guests will see"
now include ideas.

## One departure from the plan

The plan proposed a "search this place in a map app" link next to an address on
the map. [maps.md](maps.md) has a rule that only links a person has reviewed
are offered on the map, so that link was not added there. The sentence shown
for an empty map points to **Edit place**, where the unreviewed search helper
already is.

## How it works

- `board()` adds the Add button and the check-out line; neither is rendered for
  guests. `dayChooser()` takes an optional ideas count.
- `openEditor(id, preset)` accepts a day and a place for a new activity.
- `publicTrip()` no longer drops undated activities. It is still an allow-list
  of fields.
- The stay reading view is a cream reading dialog (`#stay-view`); it changes
  nothing and works on the offline reading copy.
- The offline shell cache is `waypoint-shell-v25`.

## Checks

- `npm test`: 115 pass (4 new in `tests/within-reach.test.mjs`; five older
  tests updated for the new order, the stay line and ideas reaching guests).
  Type check passes; lint has 0 errors.
- `npm run test:api`, `npm run test:access` and
  `scripts/check-drag-browser.cjs` pass locally, including dragging to and from
  Ideas and phone press-and-hold.
- Headless Chromium at 390 × 844 and 1440 × 900: Add from a day pre-fills day
  and place; Add an idea saves into Ideas; the check-out line and stay details
  open, and Edit stay leads to the form; the guest page lists ideas, opens
  their details, and has no inputs or Add buttons. No script errors, no
  sideways overflow.

Not verified: the hosted Site, physical phones, real trip data.
