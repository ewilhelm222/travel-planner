# One Manage menu, and a phone held sideways

Status: November 16, 2026. Built and checked locally with synthetic data; deployed in version 13. No data change. Step "PR 6" of the
[feedback plan](feedback-2026-11-15-plan.md) (item L1, and "no more controls
above the cards"). The narrower landscape correction followed in version 14. See [release history](releases/README.md) for dated live checks and remaining limits.

## One Manage menu (screens wider than a phone)

Above the board there are now only the trip selector, the **Show plans for**
filter, **Add activity**, **Manage ▾** and the week-view switch. Everything
else moved into the Manage menu, in the same three groups a phone already uses
under Plan & manage:

- *This plan*: Manage travelers; Places, stays & journeys; Trip details;
  History; Guest link; Editors.
- *Copies & updates*: Save offline trip; Download JSON; **Refresh**.
- *Trips & events*: New trip or event; Paste JSON; Import JSON; Archived trips.

Nothing was removed and no permission changed: organizer-only buttons are still
shown only to the organizer. The menu closes after a choice, on a click
elsewhere, and on Escape. At 1440 × 900 the board starts 52 px higher than
before (442 px instead of 494 px).

Worth knowing: **Refresh is now inside Manage** on a laptop.

## A phone held sideways

A phone on its side is wider than 760 px, so it gets the wide layout. Before,
its first screen was all buttons and no activities. Now, on any wide screen
shorter than 520 px:

- the trip selector, filter, Add activity and Manage share one row;
- the poster bar, the "Connected / Revision" line and the drag hint fold away
  (an "Offline" or "Sign-in expired" notice still shows);
- the day medallions are small;
- the board shows **Ideas plus two days**, or **three days** with Ideas folded;
- cards and day headings are tighter, and the stay line is one line;
- the drop panel that appears while dragging is a single row.

Measured at 844 × 390 with the synthetic six-day trip: the first card starts
289 px from the top (before: none on the first screen), with the cards of two
days and the ideas visible; three days with Ideas folded. The guest page keeps
a thin title bar and its read-only sentence; its first card starts at 301 px.

Press-and-hold drag was tried in landscape with simulated touch: a card moved
to another day and saved. The drop panel takes 162 px of the 390 px height.

## Correction, November 16: sideways phones are narrower than they look

The first version of this layout switched on at 761 px wide. On a real phone
the organizer still saw one day when the phone was turned. The cause: a phone's
browser reports less than the screen's width when sideways (Safari keeps the
notch areas out of the page, so an 844 px wide iPhone reports about 750 px; a
small iPhone reports 667 px). The simulated test used the full 844 px and
missed it.

Now the one-day phone layout is used only when the screen is narrower than
560 px, or narrower than 761 px **and upright**. Anything in landscape from
560 px wide gets the days side by side. The rule is written once for scripts
(`PHONE_QUERY` in `public/board.mjs`) and the same condition is used by every
style block. Day columns may be as narrow as 190 px so two fit beside Ideas on
the smallest phones. The offline shell cache is `waypoint-shell-v28`.

Checked in headless Chromium at 750 × 342, 724 × 327, 667 × 375 and 780 × 360
(sideways phones as their browsers report them): the wide layout with cards on
the first screen. At 390 × 664, at 390 × 300 (upright with the keyboard open)
and at 700 × 1000 (small tablet upright): still the one-day layout. Rotating a
loaded page switches both ways. Desktop is unchanged. Still not checked on a
physical phone.

## Checks

- `npm test`: 120 pass (2 new in `tests/landscape-menu.test.mjs`). Type check
  passes; lint has 0 errors.
- `npm run test:api`, `npm run test:access` and
  `scripts/check-drag-browser.cjs` pass locally (the drag script now reaches
  Refresh through the menu).
- Headless Chromium at 844 × 390, 1440 × 900 and 390 × 844: no script errors,
  no sideways page overflow, no control shorter than 32 px, the menu stays on
  screen, and the phone portrait layout is unchanged.

Not verified, and this change needs it most: **a real phone turned sideways**
(browser toolbars take more of the height than a simulated screen, and the
notch side needs a look), tablets, the hosted Site, and 200% zoom.
