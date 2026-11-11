# Multiple trips, events, and guest schedules

Status: November 11, 2026. The Departure Board design and multi-event planner are
deployed to the existing Site. The organizer explicitly approved the public entry
point on November 11, 2026. Camp Earnest's guest link now works without sign-in;
private planning and editing remain separately protected.

## Working behavior

- A trip/event selector, new-plan form, file or pasted JSON import, and independent
  saved documents, ownership, revisions, and guest-sharing state.
- A horizontal date board for longer trips, with city sections, lodging context,
  participant-specific journeys, and a single shared activity record. Phones show
  one selected day. Compact mode defaults on and its preference is remembered.
- Add, edit, move to another day, and delete activities. Drag-and-drop and keyboard
  moves between days, within a day, and to/from ideas are described in
  [drag-drop.md](drag-drop.md) (branch, not yet deployed). Independent activities
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
Only the organizer manages links; there is no editor-invitation UI yet.

## Storage and configuration

`planner_trips` holds one versioned JSON document per trip, its owner, optional
editor-email membership, and guest-token hash. Migration
`0001_certain_serpent_society.sql` adds it without changing the legacy table.
Every document update uses an atomic revision comparison. Per-record revisions,
conditional undo, move-stay warnings, and independent backups remain future work.

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

Eighteen Node tests pass. The API checks cover anonymous private-read rejection,
forged local identity-header rejection, independent trips, atomic competing saves,
cross-origin write rejection, limited guest projection, guest write rejection,
unknown tokens, token replacement/revocation, and stale sharing revisions.
Type checking and the production build pass.

Browser checks cover the 15-day China layout, city lanes for a synthetic split,
compact/expanded design, successful JSON/text imports, and a 390 px viewport
override (375 px content with scrollbar) with one selected day and no horizontal
overflow. Local guest browsing, day selection, and absence of write controls
were checked. Physical phones, actual China connectivity, a second authorized
editing account, complete 200% zoom review, and backup restore remain unverified.

Hosted anonymous verification succeeded after approval: Camp Earnest loads its
schedule without sign-in, day selection works at a 390 px viewport override, the
page has no input/edit controls, and activity details are read-only. There was no
horizontal page overflow and exactly one day was visible on the phone layout.
The same browser's direct visit to `/api/trips` returned the sign-in-required
error. Command-line probes were denied at the hosting edge (403), so application
write-authorization evidence remains the local API tests and deployed guard code;
no live write was made during the hosted checks.

## Release provenance

- Sites source: `85f4b51090f0cfa7a5fd7ba87b0d5869548a4b48`.
- Saved version: `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_b2b05f5f96d48191a75d132162c25e99`.
- Deployment: `appgdep_6af4a0f948808191987ef09020f99802`, succeeded.
- Runtime environment revision: 1. Browser offline shell: version 10.

The first intermediate deployment of this work remained private. No invites,
emails, or source-control copies of the real itinerary data were created.
