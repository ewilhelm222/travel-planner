# Getting in: sign-in and read-only messages

Status: November 16, 2026. Built and checked locally with synthetic data and
local test accounts; not deployed. No database migration and no change to who
may read or edit anything. This is step "PR 1" of the
[feedback plan](feedback-2026-11-15-plan.md) (items A1 to A4).

## What changed

- **Signed in, but not on a trip.** Someone who signs in before the organizer
  has added their address used to see an empty page that told them to "sign in"
  and said "No downloaded itinerary yet". They now see: "You are signed in, but
  not on a trip yet", the exact address they are signed in with, what the
  organizer has to do, a **Check again** button and **Use a different
  account**. Check again reports the time it looked if nothing has changed.
- **Who is editing.** The planner shows "● Editing as (address)" at the top on
  desktop and above the trip selector on a phone. It shows the sign-in address
  rather than a name because several family members share one sign-in. When
  editing is paused it says why (offline, or sign-in expired).
- **Guest page.** A sentence under the title: "You are viewing a read-only
  copy. To add or change plans, ask the organizer to add you, then sign in to
  the planner." The link opens the planner, which asks for sign-in as usual.
  Everyone holding the guest link sees this sentence; people who have not been
  added reach the "not on a trip yet" screen and nothing else.
- **Editors dialog.** A reminder to add the address before sending the link,
  that the sign-in email is a one-time code and may land in spam, and that a
  shared address shows as one name in History.

## For the organizer before the trip

1. Open **Editors** and add each sign-in address, including the shared one.
2. Then send the link, with: use this exact address; the email is a code, not a
   password; look in spam.

The sign-in page, its email and its sender belong to the hosting platform and
cannot be changed from the app.

## How it works

- `GET /api/trips` now includes the caller's own sign-in address in `user`.
  Trip responses, backups and the guest view still contain no addresses.
- The address is kept in the browser's saved planner state with the rest of
  the reading copy and is cleared by Sign out.
- The offline shell cache is `waypoint-shell-v22`.

## Checks

- `npm test`: 106 pass (3 new in `tests/getting-in.test.mjs`). Type check
  passes; lint has 0 errors.
- Headless Chromium at 390 × 844 and 1440 × 900 with local test accounts: a
  signed-in non-member sees the new screen with their address and the Check
  again result; the organizer sees "Editing as"; the guest page shows the
  sentence, has no inputs and no sideways overflow, and its link opens the
  planner.

Not verified: the hosted Site, a real second account, physical phones, and the
address the hosting platform reports for a real person.
