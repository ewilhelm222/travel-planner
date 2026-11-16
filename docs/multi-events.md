# Multiple trips, events, and guest schedules

Status: updated November 16, 2026. The multi-event planner is deployed to the
existing Site. The organizer explicitly approved the public entry point on
November 11, 2026. Camp Earnest's guest link works without sign-in; private
planning and editing remain separately protected.

Merged into `main` since the original release: drag-and-drop (November 12),
the schedule-first phone layout and editors (November 15), and the Night Market
design documents (November 15). Six further pull requests opened on November 16
add the safety net, structure editing, per-record revisions, the stay move,
maps, and the layout changes; see [Release provenance](#release-provenance) for
what is and is not recorded as deployed.

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
- Optional activities communicate availability rather than attendance or RSVPs.
  An explicit shared-moment highlight supplies the acid-yellow rendezvous card;
  shared attendance alone does not turn every card yellow.
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
group display names, place display names, and dated activity details. Activity
notes come only from **guest descriptions** and locations only from **guest
meeting points**. Private notes/addresses, lodging records, journey notes,
unscheduled ideas, source fields, owner identity, editor lists, and token hashes
are excluded. A guest token never authorizes a write or a private API read.

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
two planners saving different cards both succeed. Move-stay warnings and an automatic independent backup
([proposal](backup-proposal.md), not enabled) remain future work.

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

GitHub `main` is the canonical source. The organizer deploys to Sites after
merging, from their own device. This section records what the repository can
show, and marks what it cannot.

| What | State as of November 16, 2026 |
| --- | --- |
| GitHub `main` | Commit `58ca4bc` (November 15): merges of drag-and-drop ([#3](https://github.com/ewilhelm222/travel-planner/pull/3), [#4](https://github.com/ewilhelm222/travel-planner/pull/4)), schedule-first ([#5](https://github.com/ewilhelm222/travel-planner/pull/5)), editors ([#6](https://github.com/ewilhelm222/travel-planner/pull/6)) and Night Market docs ([#2](https://github.com/ewilhelm222/travel-planner/pull/2)). Offline shell version 15. Migrations `0000`–`0001`. |
| Last deployment **recorded in this repository** | The traveler release of November 11: Sites source `525c8bee42f7510110fbb9d1e387721ecb79417a`, saved version `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_b896184288e08191bb063f1283b86112`, deployment `appgdep_6af4e2cad78481919a21016059766f6f`, offline shell version 12 ([travelers.md](travelers.md)). |
| Deployments after that | **Not recorded here.** [drag-drop.md](drag-drop.md) mentions a hosted trial of drag-and-drop on November 12, so at least one later deployment happened, but its identifiers were not written down, and nothing in the repository shows whether schedule-first and editors are live. |
| Open pull requests of November 16 | Not deployed. They add migrations `0002` (change log, archive columns) and `0003` (record revisions), both additive, and move the offline shell to version 21. |

**To fill in after the next deploy** (the organizer has these; an agent session
cannot read them): the Sites source commit, the saved version, the deployment
id, the `main` commit it was built from, and which migrations Sites applied. A
quick way to see what is live: open the planner, and the offline shell version
is the number in `waypoint-shell-v…` in the page's `/sw.js`.

Earlier releases: original multi-event release, Sites source
`85f4b51090f0cfa7a5fd7ba87b0d5869548a4b48`, saved version
`appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_b2b05f5f96d48191a75d132162c25e99`,
deployment `appgdep_6af4a0f948808191987ef09020f99802`, runtime environment
revision 1, offline shell version 10.

The first intermediate deployment of this work remained private. No invites,
emails, or source-control copies of the real itinerary data were created.
