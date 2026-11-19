# Add between cards, and swipe between days

Status: November 17, 2026. Built and checked locally with synthetic data; deployed in version 16. No data change. From the [feedback plan](feedback-2026-11-15-plan.md)
(items C3 and L2). See [release history](releases/README.md) for dated live checks and remaining limits.

## Add here, between two cards

On a laptop, move the pointer into the gap above any card: a dashed line and a
**+ Add here** pill appear. Click, and the activity form opens with that day
and place filled in. When saved, the new activity sits exactly there, before
the card below the gap. The button is also reachable with the Tab key.

- It takes no room, so cards do not move when it appears.
- If you change the day in the form, the activity simply goes to the end of the
  day you chose.
- It appears only where a pointer can hover (not on phones or tablets) and only
  while editing is possible. The **+ Add to (day)** button at the foot of each
  day is unchanged and is the way to add on a phone.
- The guest page has none of this.

In History it is one entry, "Added activity …". The cards below it are only
renumbered, which never blocks someone else's save and is put back by Undo.

## Swipe between days

On an upright phone showing one day at a time, flick left on the day for the
next day and right for the previous one. The day slides in briefly.

A flick counts only when it is quick (under 0.7 s), at least 70 px long, and
clearly sideways. So:

- scrolling up and down does nothing sideways;
- a slow press still lifts a card for press-and-hold drag;
- a flick that starts within 24 px of the screen's edge is left to the
  browser's own back/forward gesture;
- flicking the day rail still just scrolls the rail;
- nothing happens in the "All days" view, while a form is open, or sideways on
  a phone, where the days are already side by side.

It works the same on the guest page.

## Checks

- `npm test`: 147 pass (4 new in `tests/insert-and-swipe.test.mjs`), including
  the placement rules, undo, and each case in which a flick must not count.
- Headless Chromium against the local server: hovering the gap shows the pill
  with the gap between cards still 14 px; clicking opens the form with the day,
  place and position; the saved activity lands between the two cards. With
  simulated touch at 390 × 844, signed in and as a guest: flick left twice and
  right once moves 22 → 23 → 24 → 23; a vertical scroll, an edge flick, a slow
  drag and a flick on the day rail leave the day alone; nothing happens in All
  days; press-and-hold still lifts a card and ending the drag does not change
  the day.

Not verified: a physical phone. Whether the flick distance feels right, and how
it sits with Safari's edge gesture, can only be judged in the hand.

The offline shell cache is `waypoint-shell-v37`.
