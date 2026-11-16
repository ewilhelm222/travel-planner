# Multiple trips, events, and guest schedules

Status: deployed November 15, 2026 (America/Los_Angeles). The multi-event planner is deployed to the
existing Site. The organizer explicitly approved the public entry point on
November 11, 2026. Camp Earnest's guest link works without sign-in; private
planning and editing remain separately protected.

Merged into `main` since the original release: drag-and-drop (November 12),
the schedule-first phone layout and editors (November 15), and the Night Market
design documents (November 15). The safety net, structure editing, per-record revisions, stay-move preview,
schematic maps, and layout changes are now deployed from GitHub main; see
[Release provenance](#release-provenance) for the exact source and verification.

See [traveler management](travelers.md) for the latest roster feature and release
provenance. The organizer has reported successful phone editing and guest viewing
on desktop and phone.

## Working behavior

- A trip/event selector, new-plan form, file or pasted JSON import, and independent
  saved documents, ownership, revisions, and guest-sharing state.
- A horizontal date board for longer trips, with city sections, lodging context,
  participant-specific journeys, and a single shared activity record. Phones show
  one selected day, schedule first, with adding and managing below it; see
  [schedule-first.md](schedule-first.md) (merged). On desktop the poster is
  collapsed to a one-line trip bar once a trip has activities, long trips open
  in a seven-column week view, and both choices are remembered; see
  [layout.md](layout.md).
- Add, edit, move to another day, and delete activities. Drag-and-drop and keyboard
  moves between days, within a day, and to/from ideas are described in
  [drag-drop.md](drag-drop.md) (merged). Independent activities
  can be unscheduled ideas; no stay foreign key is required. Explicit fixed
  bookings protect date/time until deliberately made flexible.
- Optional activities communicate availability rather than attendance or RSVPs,
  shown as an "Optional" chip. An explicit **Whole-group activity** tick marks a
  card with a magenta band and those words; shared attendance alone does not.
  Invented items are labelled "Example · not a real plan" and are left out of
  the guest link. See [plain-words.md](plain-words.md) and
  [getting-in.md](getting-in.md) (built November 16, not yet deployed).
- Guest descriptions and meeting points are separate from private planning notes.
  Read the exact projection in Guest link → Preview before enabling a link.
- Private per-trip JSON and self-contained HTML export. Device reading copies are
  stored by trip/account, with timestamps; access denial or explicit sign-out
  clears copies. Expired sign-in preserves a read-only copy.

The China draft and Camp Earnest event are runtime records, not source fixtures.
The China source dates and visits remain tentative; invented groups, splits, and
sample bookings are labeled synthetic. Camp Earnest uses the organizer's supplied
range/traditions; invented alternatives and suggested date placements are labeled.
No China guest link has been enabled. The original Japan document remains intact
in its original table and can be recovered as a separate new-model trip.

## Access boundary

Sites' private access gate applies to every route, including static guest pages.
The requested no-account view therefore needs a public Site entry point. This
does **not** make trip data publicly enumerable: the deployed server separately
requires trusted ChatGPT identity plus trip ownership/editor membership for
private reads/writes, and only configured organizers may create/import trips.
Unrecognized signed-in accounts cannot retrieve another organizer's trip.

The initial audience change was rejected by automatic approval review. The
organizer subsequently explicitly approved a public entry point with protected
editing. Sites confirmed access mode `public`, access-policy revision 2. No editor
or invitation permissions were added. The Camp Earnest guest link was verified
in a browser without an organizer session. China sharing remains disabled.

Guest links use 256 random bits. Only a SHA-256 hash is stored in D1. The token is
in the URL fragment and is sent to the read endpoint in an Authorization header,
not a query string. Replacing or disabling a link invalidates the old token.
Responses use no-store, noindex, and no-referrer policies. The static guest page
does not request identity or send cookies for its data read.

The server projection explicitly permits the title, subtitle, range/time zone,
group display names, place display names, and activity details (dated, and
from November 16 also unscheduled ideas). Activity
notes come only from **guest descriptions** and locations only from **guest
meeting points**. Private notes/addresses, lodging records, journey notes,
examples (items marked "not a real plan"), source fields, owner identity,
editor lists, and token hashes are excluded. Unscheduled ideas are included
from the "within reach" change of November 16 ([within-reach.md](within-reach.md),
not yet deployed), with the same limited fields as dated activities. A guest token never authorizes a write or a private API read.

Anyone receiving a guest link can forward it. Revocation cannot recall a file or
copy someone already downloaded. This is explained beside the sharing controls.
Only the organizer manages links. The organizer can add and remove editors by
email; see [editors.md](editors.md) (merged). No invitation is sent. Editors
cannot change the trip's name, subtitle, dates or time zone.

## Storage and configuration

`planner_trips` holds one versioned JSON document per trip, its owner, optional
editor-email membership, and guest-token hash. Migration
`0001_certain_serpent_society.sql` adds it without changing the legacy table.
Every document update uses an atomic revision comparison and appends a row to
the `planner_changes` log in the same batch; History, conditional undo, trip
archive and a manual full backup are described in [safety-net.md](safety-net.md).
Conflicts are decided per record ([per-record-revisions.md](per-record-revisions.md)):
two planners saving different cards both succeed. Stay moves include a preview and warnings ([stay-move.md](stay-move.md)). An
automatic independent backup ([proposal](backup-proposal.md), not enabled)
remains future work.

Set `PLANNER_CREATOR_EMAILS` in Sites runtime configuration to the organizer's
authenticated email(s); there is no permissive production default. Local preview
uses an ignored `.dev.vars` entry with `seedy@sites.test`. Do not commit real
emails, runtime secrets, imports, databases, or guest-link tokens.

JSON imports accept version-2 trip content, assign a new trip ID/owner, validate
the date range, IDs, referenced places and groups, and normalize allowed fields.
Sharing starts disabled. Existing export wrappers with a `trip` property are
accepted. File import through the Chrome extension requires file-URL access;
Paste JSON provides a working alternative.

## Verification and remaining work

The original multi-event release passed eighteen Node tests; the traveler release
now passes 23. The API checks cover anonymous private-read rejection,
forged local identity-header rejection, independent trips, atomic competing saves,
cross-origin write rejection, limited guest projection, guest write rejection,
unknown tokens, token replacement/revocation, and stale sharing revisions.
Type checking and the production build pass.

Browser checks cover the 15-day China layout, city lanes for a synthetic split,
compact/expanded design, successful JSON/text imports, and a 390 px viewport
override (375 px content with scrollbar) with one selected day and no horizontal
overflow. Local guest browsing, day selection, and absence of write controls
were checked. A second authorized editing account is now
verified locally with test accounts ([editors.md](editors.md)), not yet with a
real second account on the hosted Site. Physical phones, actual China
connectivity, complete 200% zoom review, and backup restore remain unverified.

Hosted anonymous verification succeeded after approval: Camp Earnest loads its
schedule without sign-in, day selection works at a 390 px viewport override, the
page has no input/edit controls, and activity details are read-only. There was no
horizontal page overflow and exactly one day was visible on the phone layout.
The same browser's direct visit to `/api/trips` returned the sign-in-required
error. Command-line probes were denied at the hosting edge (403), so application
write-authorization evidence remains the local API tests and deployed guard code;
no live write was made during the hosted checks.

## Release provenance

### November 15, 2026 release (America/Los_Angeles)

Deployed at 19:45 PST on November 15 (2026-11-16T03:45:48Z).
GitHub is canonical. Sites is a separate repository, so commit IDs differ;
the app file contents were compared instead.

| Item | Provenance |
| --- | --- |
| GitHub source | `d477cfdc4be7b1698b276d9439ae038a4b4e1404`, app at `apps/sites-prototype` |
| Sites source | `93925161806d13eb702d1916dc247e954a580288` |
| Matching content tree | GitHub app subtree and Sites root tree both `97ec15fe75afac36021ddff904d059f0bfee86d0`; all 173 source files matched |
| Saved version | **12**, `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_0317b417c0548191a990228181ecc16c` |
| Deployment | `appgdep_6afa7c636c408191a9313f0e1077efbd`, succeeded |
| Runtime / offline shell | Environment revision 1; offline shell version 21 |
| Rollback version retained | **11**, `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_faf1a2767e7c8191b35ef0a62ba20db7`, source `f5476867c57aa00c2a584743fb5a55586d9d6668` |

Version 11 versus GitHub contained 127 identical files, 20 changed files, and
26 GitHub-only files. No Sites-only file or behavior requiring preservation
was found. The stale local checkout was clean, with no commits ahead of its
recorded origin/main, and was not used as release source.

Migrations applied in order, before the new Worker was uploaded:

1. `0002_change_log_and_archive.sql`: adds `planner_changes`, its unique
   trip/revision and trip/id indexes, and nullable `archived_at` /
   `archived_by` columns. No existing document is rewritten.
2. `0003_record_revisions.sql`: adds non-null `record_revisions` with
   constant default `'{}'`. Missing records start at revision 1; no existing
   document is rewritten.

Both are additive and leave the legacy Japan table intact. The old Worker
can read the expanded schema, so Sites' migrations-first deployment order
avoids exposing the new Worker to missing columns/tables. The new Worker
also retains strict trip-wide revision handling for older open pages.
After deployment, the new table and all three added columns were present;
both current trip rows remained active with their original ownership,
editor lists, guest hashes and sharing timestamps.

**Checks passed before deployment:** Node 24.22.1; 103 Node tests;
`npm run typecheck`; production build via the Sites build helper;
`npm run test:api`; and `npm run test:access`. API/access checks used a
disposable local D1 database and synthetic accounts/data, with migrations
0000–0003 applied locally.

**Verified live:**

- Signed-in organizer can load Camp Earnest and the China draft.
- Added a disposable activity, edited it, dragged it from Sunday to Monday,
  undid the move back to Sunday, and deleted it. History shows add, edit,
  move, undo and delete. The test activity is absent afterward.
- Desktop board inspected. At a 390 px viewport, organizer Camp Earnest and
  China, and the guest schedule, each show one selected day with no horizontal
  page overflow (375 px content width with scrollbar). Management follows the
  schedule on phones.
- Existing Camp Earnest guest link loads with read-only details, day navigation,
  no edit inputs/controls, and no sign-in requirement. A direct API read with
  only the existing guest token and no cookies returned HTTP 200. Guest output
  had empty stay/journey arrays and no editor list.
- A direct request to `/api/trips` without cookies or identity headers returned
  HTTP 401 with the sign-in-required error.
- Ownership, editor lists, guest hashes and sharing timestamps were unchanged
  before/after. The organizer made additional ordinary Camp Earnest edits
  during verification; final schedule equality to the earlier baseline is
  therefore not asserted.
- The original Japan row remains in `prototype_trips`, with unchanged revision
  and update timestamp. Neither migration touches that table.

**Waived or not verified:**

- The organizer explicitly waived the live backup/export and live-data
  migration rehearsal after explaining that the database contains test data
  held elsewhere. No pre-release trip JSON backups or full database export
  were created. Local migration/API checks are not a live-data restore trial.
- Neither current trip has an editor configured; a real editor account was
  not verified live. Synthetic organizer/editor/non-member access checks passed
  locally.
- Japan was not recovered as a new-model trip or opened in the current
  organizer UI; only its retained database row/metadata were checked.
- Physical phones, real China connectivity, a full 200% zoom review, and live
  backup restoration were not verified.

No Sites access mode, guest token/link, editor membership, invitations, emails,
or schedules were changed. The daily snapshot proposal remains disabled.

Rollback, if required, is to redeploy retained version 11. The added schema is
compatible with that version and need not be removed. No step-4 backup exists
because that requirement was waived; any data restoration would require the
organizer's separate copies. No rollback was performed.

Earlier releases: original multi-event release, Sites source
`85f4b51090f0cfa7a5fd7ba87b0d5869548a4b48`, saved version
`appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_b2b05f5f96d48191a75d132162c25e99`,
deployment `appgdep_6af4a0f948808191987ef09020f99802`, runtime environment
revision 1, offline shell version 10.

The first intermediate deployment of this work remained private. No invites,
emails, or source-control copies of the real itinerary data were created.
