# Travelers and family groups

Implemented November 11, 2026. Open **Manage travelers** in a trip to add or edit
display names and optionally assign a family/group. Create or rename groups in
the same panel. A roster entry does not send an invitation, create an account,
or grant editing access.

An activity can reference a whole-trip group, a family, individual people, or a
mixture. Group assignments follow current membership. “Everyone” includes new
and ungrouped travelers. A person's filter includes individual assignments and
plans assigned to their group; a family's filter includes its members' individual
plans. Shared activities stay one record and retain all attendee labels.

The activity form checks and disables individuals already covered by a selected
group. Uncheck that group to select only part of the family. The saved assignment
keeps group identity rather than replacing it with today's member list. Existing
group-only trips need no destructive migration or manual reassignment.

## Guest names and access

Traveler display names are private by default. **Show display name on guest link**
opts a person into the guest filter and participant labels. Private individual
references are projected as generic labels such as “Some members of Cedar family,”
preserving group filtering without exposing their names, IDs, or counts. Titles
and guest descriptions are still shared as authored. Group names retain their
existing guest visibility. Roster privacy does not alter the private-trip access
policy or editor membership. Only the organizer can change whether a name is
shown to guests; [editors](editors.md) can otherwise update the roster.

## Data and safeguards

The version-2 document gains an optional `people` array with stable `id`, `name`,
nullable `familyId`, and `showOnGuest` fields. People and group IDs must be unique
across the trip. A maximum of 200 people and 20 groups is supported. References
must belong to that trip. JSON export/import preserves the roster; private HTML
exports also list travelers. Guest HTML receives only the permitted projection.

Roster updates use the same atomic trip-revision check as activity changes. A
rejected draft stays in the form, with copy and reload actions. The panel offers
a JSON backup download before edits. When a roster exists, participant writes
require `X-Waypoint-Participant-Model: people-v1`; older open tabs receive a reload
conflict instead of silently erasing individual assignments. No live trip records
were seeded, rewritten, or used for mutation testing in this release.

Next recommended work before inviting additional editors: a change log with safe
undo, then an independent scheduled backup with a tested restore. JSON downloads
are useful copies but are not automated backup or undo.

## Verification

- 23 Node tests pass, including group-only compatibility, membership/filter
  behavior, identity preservation, validation, guest-name privacy, and exports.
- API checks pass for persistence, concurrent roster edits (one success/one
  conflict), older-client rejection, opt-in guest names, and denied anonymous
  roster writes, alongside the existing sharing/access tests.
- Type checking and the production build pass. Local browser checks added and
  edited synthetic people, changed a family, saved an individual-only activity,
  and verified it appeared once in that person's view. The roster panel fit a
  390 px viewport override (375 px content) without horizontal overflow.
- Hosted verification opened Manage travelers on the existing the single-stay event trip
  without changing its roster. The existing anonymous guest link still loaded
  with no editable fields or roster-management controls.
- The organizer separately reported successful phone editing and desktop/phone
  guest viewing before this release. That is user-reported evidence, not an agent
  physical-device test.

The newer visual/day-navigator changes already present in Sites source commit
`e84cead06f69b1166eb5692e262521c574119f20` were reconciled into GitHub while adding
this feature. The live source calls that visual system Night Market. It was
preserved; the earlier design studies remain available in repository docs.

## Release

- Sites source: `525c8bee42f7510110fbb9d1e387721ecb79417a`.
- Saved version: `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_b896184288e08191bb063f1283b86112`.
- Deployment: `appgdep_6af4e2cad78481919a21016059766f6f`, succeeded.
- Existing public entry point, guest links, ownership, and editor permissions
  are preserved. Offline shell version: 12. No new database migration is needed.
