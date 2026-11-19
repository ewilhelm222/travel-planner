# Plain words: labels, the whole-group card, examples and the filter

Status: November 16, 2026. Built and checked locally with synthetic data; deployed in version 13. No database migration and no change to stored trips. This is step
"PR 2" of the [feedback plan](feedback-2026-11-15-plan.md) (items W1, T1, X1,
X3, P1, W3). The organizer approved the wording and the quieter card on
November 16; the Night Market guide carries the
[amendment](design-night-market.md#amendment--november-16-2026). See [release history](releases/README.md) for dated live checks and remaining limits.

## What changed

| Before | Now |
| --- | --- |
| "● The rendezvous" on a solid magenta, glowing card | "● Whole-group activity" on a cream card with a magenta band across the top |
| "Highlight a shared moment" tick in the form | "Whole-group activity · everyone together" |
| "○ Flexible" on every card that was not a fixed booking | Nothing. "■ Fixed booking" is still shown, in words |
| "Optional · available to join" as a line of small grey text | An **Optional** chip beside the people labels |
| "Planned activity" | Nothing |
| "· Synthetic" at the end of a grey line, hidden in the week view | "Example · not a real plan" at the top of the card with a dashed outline, in every view |
| Examples shown on the guest link | **Examples are not sent to guests at all** |
| "Not on the itinerary. Yet." | "Ideas · not scheduled yet" |
| "The plan, up close · Activity details" | "Activity" |
| Meeting point shown on phone cards only | "Meet · …" on every card (not in the week view, where cards show titles only) |
| "Travelers" filter listing every group and person | "Show plans for", listing only choices that would hide something; left out when there are none |

Also new: **Hide examples** under the board (on a phone, under Plan & manage),
shown only when a trip contains examples. It is a per-device view choice and
changes nothing for anyone else.

The private offline file uses the same words. History calls the tick
"Whole-group activity".

## Things the organizer should know before deploying

- **The guest link will lose every item currently marked as an example**
  ("Synthetic"). On a trip where most dated items were generated, the guest
  page will look much emptier. Items marked "Tentative" and everything typed in
  by a person are still shown.
- **An example cannot yet be turned into a real plan.** Editing it keeps the
  label. Until "Keep as a real plan" is built (plan step PR 8), the way to keep
  one is to add it again as a new activity and delete the example.
- The "synthetic gathering example" trip is made entirely of examples, so its
  guest link shows no activities. That is intended.
- The filter disappears when it would make no difference, for example when
  every plan is for everyone. It returns as soon as one plan is for a subset.

## How it works

- `card()` in `public/board.mjs` builds the labels; planner and guest share it.
- `publicTrip()` in `lib/trips.mjs` skips activities whose `sourceKind` is
  `synthetic`. The guest view was already an allow-list; this narrows it.
- `usefulFilterChoices()` in `public/participants.mjs` keeps a filter choice
  only if some activity, stay or journey would be hidden by it.
- No field was added, renamed or rewritten. Every save still goes through the
  same logged, per-record-checked path.
- The offline shell cache is `waypoint-shell-v23`.

## Checks

- `npm test`: 110 pass (4 new in `tests/plain-words.test.mjs`; four older tests
  updated because they relied on examples reaching guests or on the old
  labels). Type check passes; lint has 0 errors.
- `npm run test:api` and `npm run test:access` pass against a disposable local
  database, with a new check that guests receive an entered plan with guest
  fields only and no examples.
- `scripts/check-drag-browser.cjs` passes: desktop drag, keyboard moves with
  the filter on, fixed bookings, conflicts, the guest page (no drag), and phone
  press-and-hold drag.
- Headless Chromium at 390 × 844 and 1440 × 900 (three-column and week views):
  labels as in the table, Hide examples on and off, the guest page without
  examples, no sideways overflow, no script errors.

Not verified: the hosted Site, physical phones, real trip data, and 200%
browser zoom.
