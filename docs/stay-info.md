# Stay information for the group

Status: November 17, 2026. Built and checked locally with synthetic data; deployed in version 16. Adds three optional fields to a stay. No database migration; no
stored trip is rewritten. Step "PR 11" of the
[feedback plan](feedback-2026-11-15-plan.md) (items S2 and S3), approved by the
organizer on November 16. See [release history](releases/README.md) for dated live checks and remaining limits.

## For planners

A stay now has two separate texts:

- **For the group**: address, laundry, what to bring, house rules. For everyone
  on the trip.
- **Private note**: door codes, Wi-Fi password, who sleeps where. Only for
  people who sign in.

and a **Check-out time**, plus one tick box, **Show this stay on the guest
link**, which only the organizer can change.

The stay details view (the stay line on the board) shows all of it to signed-in
people and says whether the stay is on the guest link.

## What guests see

Nothing about a stay, unless the organizer ticks the box in that stay. Then,
for that stay only: the place name, the dates, who is staying (using the same
name rules as activities), the lodging line, the check-out time and the "For
the group" text. The stay line appears on the guest board and opens these
details.

Guests never receive the private note or the place's address, whatever is
ticked. The two texts are separate fields precisely so that a code typed into
the private note cannot be published by ticking the box.

Before ticking the box, read the lodging line and the "For the group" text: the
lodging line was private until now. The Guest link dialog's wording and its
preview reflect shared stays.

Editors can write both texts. They cannot share or unshare a stay, directly or
by undoing the organizer's change.

## Data

New optional stay fields: `groupInfo` (text), `checkOutTime` (short text),
`showOnGuest` (true or false). A stay saved before they existed reads as empty
and not shared, and is not logged as changed. The private offline file includes
the new text; a reading copy saved from the guest link contains only what the
guest link shows. The offline shell cache is `waypoint-shell-v35`.

## Checks

`npm test`: 139 pass (4 new in `tests/stay-info.test.mjs`): old stays, the
guest projection with and without the tick, the editor rules including undo,
and the wording. Browser checks are recorded with the combined release in
[release-nov17.md](release-nov17.md).
