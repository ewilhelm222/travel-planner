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
  [getting-in.md](getting-in.md) (deployed in version 13).
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
deployed in version 13), with the same limited fields as dated activities. A guest token never authorizes a write or a private API read.

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

Card pictures (deployed in version 16) live in their own table,
`planner_images`, added by migration `0004_card_pictures.sql`; see
[pictures.md](pictures.md). They are not part of the trip document, the change
log or the exports. A guest sees the picture on a card they can see, fetched
with the guest token from `/api/shared-image`.

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

### November 17, 2026 map locations, guest map and Last edited (version 18)

Deployed at 11:15 PST on November 17 (2026-11-17T19:15:31.557624+00:00).
This release contains merged PRs 24–26:
[map location as address or coordinates](map-location.md),
[map features and guest map](maps.md), and [Last edited by](last-edited.md).

| Item | Provenance |
| --- | --- |
| GitHub source | `02ee6138443a4e39c637f2a9218172ae21aad4cc`, exact pinned main |
| Sites source | `8148ba1950fe44214104b53b251b0c2784450636` |
| Matching content tree | GitHub app subtree and Sites root both `8b28a369d86930f4db88d8dc4da5cad12633f928`; 205 tracked files |
| Saved version | **18**, `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_7667775ba73881918083eb07955ac9a9` |
| Deployment | `appgdep_6afca7ca9e508191b1dcf3aec334aa45`, **succeeded** |
| Runtime / offline shell | Environment revision 1; `waypoint-shell-v44` |
| Rollback retained | **17**, `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_c6f11970c81c8191bfb284fcee6e20bb` |

**Starting state and source:** before preparation, Sites confirmed the successful
version 17 deployment from GitHub `08db9f454f62da6410ae69cdcd6c3dd7b8ae2ca5`,
Sites source `9d851a54bb14cf6ee52c8fa29ba66fe744e1ae38`. Its published shell
was v41. GitHub main was exactly the requested pin and was checked again before
deployment. A fresh sparse clone was populated through the GitHub connector,
with the exact signed commit, all app blobs and tree verified. No earlier checkout
supplied release source. Sites had no extra tracked files. The synchronized,
pushed Sites source was clean and its root tree matched the app subtree exactly.

**Data and configuration:** all `drizzle/` files (0000–0004 and metadata) and the
hosting manifest are unchanged from version 17. No migration was run, replayed
or generated. No stored trip was rewritten by deployment. `locationText` is
optional inside the existing trip document; Last edited reads the existing log
and stores nothing. No new environment variable, secret, key, binding or external
service was configured. No trip data was imported, edited or exported, including
test edits. No access policy, guest links, tokens, editor lists, runtime settings
or creator allowlist were changed. No invitations or emails were sent.

**Required checks:**

| Step / check | Result |
| --- | --- |
| 1: `npm run install:ci` | **Passed**, locked dependencies; Node 24.22.1 |
| 2: `npm test` | **Passed**, 198 total, 195 passed, 3 Playwright layout tests skipped, 0 failures |
| 3: `npm run typecheck` | **Passed** |
| 3: `npm run lint` | **Passed**, 0 errors, 5 warnings |
| 3: `npm run build` | **Passed** |
| 3: Sites production build helper | **Passed** |
| 4: Pushed app content tree matches GitHub | **Passed**, exact tree above |
| 5: Save version 18 and deploy, retain version 17 | **Passed** |
| 6: Published `sw.js` contains v44 and lists `/map-panel.mjs` | **Passed** |
| 6: `sw.js`, `map-panel.mjs`, `maps.mjs`, `history.mjs`, `planner.js`, `guest.mjs` served as JavaScript and match pin | **Passed**, HTTP 200, `text/javascript`, byte-for-byte matches |
| 7: Signed-out `/api/trips` | **Passed**, 401 |
| 7: Signed-out `/api/trip?id=x` | **Passed**, 401 |
| 7: Signed-out `/api/history?id=x` | **Passed**, 401 |
| 7: Signed-out `/api/history?id=x&last=activity` | **Passed**, 401 |
| 8: Owner Edit place has one Location for the map box; older coordinates shown as lat, lng; cancel | **Not checked** |
| 8: Map panel has This day / Whole trip; marker moves to list entry | **Not checked** |
| 8: Last edited link opens specific History entry; address has history parameter; reload retains it | **Not checked** |
| 8: Signed-in `/api/history?id=<trip>&last=activity` returns 200 and last object | **Not checked**; hosted query remains unverified |
| 8: Existing guest link loads with names-only map, no Last edited/Edited/address/map links | **Not checked** |
| 9: Documentation-only release PR and deployment status dates | **Completed in this PR; not merged** |

Browser controls were unavailable. No owner browser session, substitute identity,
or guest link was used. Live checks were cookie-free HTTP requests to static
assets and the four private API guards; these do not verify signed-in behavior
or rendering. The signed-in new history query was not executed, so no status or
error message for that query is asserted. No check failed. Access policy was
unchanged, environment revision remains 1, and no scheduled jobs exist.
A physical phone, map links on phones, real China connectivity, a screen reader,
200% zoom and a second real account were not tested. No China-readiness claim
is made. API integration and browser scripts were not rerun.

**Rollback:** no rollback was performed. If a deployment or live check fails,
redeploy retained version **17**, with no database rollback. An address entered
under version 18 would be dropped the next time that trip is saved by version 17;
coordinates are unaffected. This deployment made no such edits.

This documentation-only PR retains release entries 13–17 from the earlier
release-record PRs below. No real emails, guest tokens, itinerary content,
pictures, databases, keys or secrets were added to source.


### November 16, 2026 laptop pictures and area locations (version 17)

Deployed at 18:30 PST on November 16 (2026-11-17T02:30:18.408662+00:00; November 17 UTC).
This deploys PRs 21 and 22: [pictures in laptop week view and Ideas](pictures.md#pictures-in-the-laptop-week-view-and-the-ideas-column)
and [top-level place labels](place-levels.md).

| Item | Provenance |
| --- | --- |
| GitHub source | `08db9f454f62da6410ae69cdcd6c3dd7b8ae2ca5`, main at release start |
| Required merge ancestry | `08db9f4` resolves to that exact deployed GitHub commit; GitHub compare reported identical |
| Sites source | `9d851a54bb14cf6ee52c8fa29ba66fe744e1ae38` |
| Matching content tree | GitHub `apps/sites-prototype` and Sites root both `e23a5fc780abf505c28a59f7ea4a7406a57d7e00`; 197 tracked files |
| Saved version | **17**, `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_c6f11970c81c8191bfb284fcee6e20bb` |
| Deployment | `appgdep_6afbbc312928819190a9a9620dab670d`, **succeeded** |
| Runtime / offline shell | Environment revision 1; `waypoint-shell-v41` in both `public/sw.js` and `public/planner.js` |
| Rollback retained | **16**, `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_eedfe44a8d8481918e4ec397876a3b10` |

**Before deployment:** Sites confirmed version 16's successful deployment, from
GitHub `f94798ba73120c2e394f6df5235df685f04b9ef7`. That version already carried
PR 19 and migration 0004. The live database overview contains `planner_images`.
All files under `drizzle/` are byte-for-byte unchanged from version 16.
No migration was added or manually replayed; Sites retains its applied-migration
history. No database backup, rehearsal or data rollback was needed.

A fresh sparse clone was populated from pinned main through the GitHub connector,
verifying the exact signed commit, app blobs and tree. No older checkout supplied
source. Sites had no extra tracked files. Source was synchronized, pushed,
packaged and saved before deployment; its clean root tree matched GitHub exactly.

**Checks before deployment:** Node 24.22.1; `npm run install:ci` passed;
`npm test`: **166 total, 163 passed, 3 skipped, 0 failed**. The three browser
layout tests skipped because Playwright is not installed. `npm run typecheck`,
`npm run build`, and the Sites production build helper all passed.

**Live verification:** browser controls were unavailable; no owner session or
guest link was opened, no trip was edited, and no sample trip was created.
Static asset checks are not evidence of rendering or interaction.

| Requested check | Result |
| --- | --- |
| Owner page loads, sign-in works and offline copy reports ready with v41 | **Not checked**; published v41 scripts verified separately |
| About 1440 px, trip over four days: picture bands in week view and Ideas; no empty boxes without pictures | **Not checked** |
| Larger cards retain pictures across the top | **Not checked** |
| Upright phone retains 60 px thumbnail at right | **Not checked** |
| Drag by picture moves card, click opens read-only view, undo move | **Not checked**; no live moves made |
| Top-level place appears as card location | **Not checked live**; automated area-location tests passed |
| Existing guest link opens with prior content, without regeneration | **Not checked**; link was not changed |

**Additional live checks passed:** cookie-free downloads of `sw.js`,
`planner.js`, `planner.css`, `board.mjs` and `guest.mjs` matched pinned
source bytes. Cookie-free `/api/trips` and `/api/image` returned 401;
`/api/shared-image` with no Authorization returned 404. Sites reported
successful deployment; the public access mode and full access policy were
unchanged, environment revision remains 1, and no scheduled jobs exist.
No check failed. A physical phone, a second real account, real China
connectivity and 200% zoom were not tested.

No access policy, runtime configuration, guest links, tokens or editor lists
were changed. No real trip data, pictures, databases or credentials were added
to source; no imports, invitations or emails were sent. This record retains the
version 13–16 entries from the still-open PR 20 below; no PR was merged.

If anything fails, redeploy retained saved version **16** and stop.
No database rollback is needed. No rollback was performed.


### November 16, 2026 activity view and November 17 additions (version 16)

Deployed at 16:24 PST on November 16 (2026-11-17T00:24:48.943728+00:00). This deploys merged
PRs 18 and 19 together: [read-only activity view](activity-view.md) and the
[five additions](release-nov17.md): stay information, two-level places, insert
between cards, flick between days and pictures on cards.

| Item | Provenance |
| --- | --- |
| GitHub source | `f94798ba73120c2e394f6df5235df685f04b9ef7`, app at `apps/sites-prototype` |
| Sites source | `814ca464e3c19672c88d111899a921c704a704f0` |
| Matching content tree | GitHub app subtree and Sites root both `a918ec4506e44b2c40987391478cf29dbd20d569`; 194 tracked files |
| Saved version | **16**, `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_eedfe44a8d8481918e4ec397876a3b10` |
| Deployment | `appgdep_6afb9ec9791081919ab0649522ccc464`, succeeded |
| Runtime / offline shell | Environment revision 1; `waypoint-shell-v40` |
| Migration applied | `0004_card_pictures.sql`: new `planner_images` table and trip-id index |
| Rollback retained | **15**, `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_3344090464888191a651b402da161d7b` |

**Before deployment:** version 15 was live, from GitHub
`79a6867333d5da7a9dc16dba9263748c504d63f4`. Its PRs 16 and 17 were already
deployed, so section G did not apply. A fresh sparse clone was populated through
the GitHub connector from the pinned revision. The signed commit, all app blobs,
and app tree were verified; no old checkout supplied source. There were no
Sites-only tracked files. The hosting manifest, existing SQL migrations
0000–0003, snapshots and existing journal entries were unchanged.

**Checks before deployment:** Node 24.22.1; locked dependency installation through
the Sites helper; `npm test` **158 passed, 0 failed**; `npm run typecheck`
passed; production build through the Sites build helper passed. Pushed source
was clean and its root tree exactly matched the requested GitHub app tree.
API/access integration scripts and local browser scripts were not rerun.

**Migration and data:** Sites applied migrations before uploading the new
Worker, as required by [release-nov17.md](release-nov17.md). Migration 0004
creates only a new table and index; no existing table or stored trip is altered.
The previous Worker can run against this schema. The live schema now contains
`planner_images`. A read-only before/after comparison of both existing trip
rows confirmed identical IDs, owner IDs, editor lists, guest hashes, sharing
times, revision/update metadata, archive metadata and per-record revisions.
The database viewer truncates trip documents; full document contents were not
compared. No backup or migration rehearsal was performed, as requested. No trips,
activities or pictures were created, imported, edited or deleted. No access,
runtime configuration, guest links, tokens or editors were changed; no invitations
or emails were sent.

**Live verification:** browser controls were unavailable. Browser behavior was
not inferred from static files. Each requested check is recorded below.

| Requested check | Result |
| --- | --- |
| A: Card → cream read-only view → Edit dark form → Cancel returns to view | Not checked |
| A: Add activity, Add to day and Add an idea open editor directly | Not checked |
| A: Drag to another day and back saves; release opens nothing | Not checked |
| B: Hover gap shows dashed Add here without moving cards; form day prefilled | Not checked |
| B: Disposable insert lands between cards, delete, History records both | Not checked; no live edits performed |
| C: Add place has Inside choice; cancel | Not checked |
| C: Stay editor has group info, check-out time, private note and unchanged guest checkbox; cancel | Not checked |
| D: Disposable picture upload shows preview/Picture ready, save | Not checked; no live edits or uploads performed |
| D: Picture visible on card and read-only view, absent in week view | Not checked |
| D: History records Picture | Not checked |
| D: Delete disposable picture activity | Not checked; none created |
| E: 390 × 664 card opens bottom sheet; Close/swipe down dismisses | Not checked |
| E: Flick left/right changes day; vertical scrolling does not; flick blocked with view open | Not checked |
| E: No Add here between cards on upright phone | Not checked |
| F: Guest at portrait and desktop loads signed out with read-only sentence and no inputs/Add/Edit | Not checked |
| F: Guest card opens read-only view without Edit | Not checked |
| F: Guest stay lines absent unless explicitly shared | Not checked |
| F: Guest image requests use Authorization header with no token in URL | Not checked |
| F: Cookie-free /api/image and /api/trips return 401 | Passed; direct HTTP requests |
| F: /api/shared-image without Authorization returns 404 | Passed; direct HTTP request |
| G: Earlier PR 16/17 browser checks | Not checked; not required because version 15 already deployed those changes |
| No sideways page overflow at requested sizes | Not checked |
| Physical phone | Not checked |

**Additional checks passed:** cookie-free downloads of `sw.js`, `board.mjs`,
`planner.css`, `planner.js`, `guest.mjs` and `activity-view.mjs`
matched pinned source bytes. Sites reported deployment success. Public access
and the access-policy revision were unchanged; environment revision remains 1;
no scheduled jobs exist. These checks do not verify rendering, interactions,
signed-in access or guest-link rendering. No check failed. A second real account,
physical phone, real China connectivity, 200% zoom, and image storage limits were
not tested.

PR 14's README had a merge conflict with main. This replacement release-record
PR is based on the deployed main commit and retains entries 13–15 below.
README lists all changes through release-nov17 as deployed.

If anything goes wrong, redeploy retained saved version **15** and stop.
The additive image table can remain; no database rollback is needed.


### November 16, 2026 quick-add, timing, All days and even columns (version 15)

Deployed at 13:27 PST on November 16 (2026-11-16T21:27:22Z). This deploys
merged PRs 16 and 17 together: [quick add](quick-add.md),
[timing levels](timing.md), [All days](all-days.md), and
[even day columns](even-columns.md).

| Item | Provenance |
| --- | --- |
| GitHub source | `79a6867333d5da7a9dc16dba9263748c504d63f4`, app at `apps/sites-prototype` |
| Sites source | `fb172ffa6b76c13d8efc440091c3a370ac8918da` |
| Matching content tree | GitHub app subtree and Sites root tree both `bf416a0e6081114de9def004b0e318d2675e6654`; 183 tracked files |
| Saved version | **15**, `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_3344090464888191a651b402da161d7b` |
| Deployment | `appgdep_6afb7532ac448191af6baa9eb3ae11c7`, succeeded |
| Runtime / offline shell | Environment revision 1; `waypoint-shell-v34` |
| Rollback version retained | **14**, `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_b74fb149223081918e2dacfaa0a59cc8` |

Before starting, Sites confirmed version 14's saved source and successful
deployment. A fresh sparse clone was populated from the pinned GitHub revision
through the connected service, with the signed commit, all 183 app blobs and
the tree verified. No older checkout supplied source files. There were no
Sites-only files before synchronization. The four additional files are the
quick-add, timing, All-days and even-columns tests.

**Data and compatibility:** `timing` is an optional activity field with
`set`, `day` and `anytime` levels. `fixed` remains the protection flag.
Missing levels are supplied when the trip is read; deployment itself does not
rewrite a stored trip. The previous app ignores the added field. `drizzle/`
is byte-for-byte unchanged from version 14 and still ends at `0003`.
No database migration, backup or database rollback was prepared. No trip was
created, imported, deleted or edited during this release. No guest links,
tokens, editor membership, invitations or emails were changed.

**Checks before deployment:** Node 24.22.1; locked dependencies installed
through the Sites installer; `npm test` **135 passed, 0 failed**;
`npm run typecheck` passed; production build through the Sites build helper
passed. The pushed Sites root tree matched the requested tree exactly.
No local preview server, substitute browser automation, or disposable live
edits were used. API/access integration scripts were not rerun.

**Live verification:** browser controls were unavailable. Every browser check
below is **not checked**, rather than inferred from source files or earlier
release results.

| Requested check | Result |
| --- | --- |
| A: Existing cards unchanged apart from Fixed booking → Set time; no Flexible label | **Not checked** |
| A: Save an existing activity unchanged; History names only that activity | **Not checked** |
| A: Quick form fields, folded More details, typed 17:30 suggests Set time, clearing reverses it, cancel | **Not checked** |
| A: Disposable optional activity, Any day edit, delete, and all three History entries | **Not checked**; no live edits performed |
| A: Existing set-time plan locks day/time, explains That day, and refuses cross-day drag | **Not checked** |
| A: Some-people choice reveals people list and Add a person control without adding anyone | **Not checked** |
| B: 390 × 664 shows one day with full weekday | **Not checked** |
| B: All days toggle, day scroll/jump, highlighted day while scrolling, one-day return and reload persistence | **Not checked** |
| C: 750 × 340 shows Ideas plus two day columns and first-screen cards; All days absent | **Not checked** |
| C: Visible headers have one line/equal heights, including Wednesday; short weekday in narrow columns | **Not checked** |
| C: Place, stay line and first card align across visible columns | **Not checked** |
| C: No partly visible rightmost column; uneven sideways scroll settles to whole columns | **Not checked** |
| C: Hide Ideas gives three whole columns; reopen gives two | **Not checked** |
| C: Repeat header/alignment/whole-column checks at 667 × 375 and 930 × 430 | **Not checked** |
| C: Loaded-page rotation switches upright and sideways layouts both ways | **Not checked** |
| D: 761 × 900 has one whole day beside Ideas, two folded, and full weekdays on one line | **Not checked** |
| D: Desktop week view has short weekdays, aligned cards and whole columns; drag out and back both save/log | **Not checked** |
| E: Camp Earnest guest at 390 × 664 without organizer session: All days works, read-only sentence, no inputs/Add | **Not checked** |
| E: Guest at 750 × 340: side-by-side days, single-line headers and whole columns | **Not checked** |
| E: Cookie-free /api/trips returns 401 | **Passed** by direct HTTP request with no cookies or identity headers |
| No sideways page overflow at every requested size | **Not checked** |
| Physical phone | **Not checked** |

**Additional live checks passed:** `sw.js`, `board.mjs`,
`planner.css`, `planner.js` and `guest.mjs` downloaded without cookies
match the pinned source bytes. Sites reported successful deployment; access
mode and access-policy revision remained unchanged, runtime environment revision
remained 1, and there are no scheduled jobs. These checks do not verify visual
layout, interaction, signed-in behavior or guest rendering. No check failed.

The existing release-record branch was merged cleanly with GitHub main,
retaining the version 13 and 14 entries below. README now lists every change
through even-columns as deployed.

If anything goes wrong, redeploy retained saved version **14** and stop.
No database rollback is required or authorized for this release.


### November 16, 2026 landscape correction (version 14)

Deployed at 12:12 PST on November 16 (2026-11-16T20:12:54Z).
This is the [Correction, November 16](landscape-and-menu.md#correction-november-16-sideways-phones-are-narrower-than-they-look):
sideways phones from 560 px wide use the side-by-side board, including browsers
that report less than 761 px. The one-day layout remains for widths below
560 px, or widths below 761 px in portrait orientation.

| Item | Provenance |
| --- | --- |
| GitHub source | `ee9e1d74ce312b62df1b11e29ec28d65920fc75f`, app at `apps/sites-prototype` |
| Sites source | `c9cab81c53072c7a58e9a0a0979c60ff4d641c1e` |
| Matching content tree | GitHub app subtree and Sites root tree both `72329b1de4838eef098c9df7fe9e124fdc48ac5f`; 179 tracked files |
| Saved version | **14**, `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_b74fb149223081918e2dacfaa0a59cc8` |
| Deployment | `appgdep_6afb63bea4f08191811dbc1f58770f9e`, succeeded |
| Runtime / offline shell | Environment revision 1; `waypoint-shell-v28` |
| Rollback version retained | **13**, `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_11f00386f47881919c87cb68817e03e8` |

A fresh sparse clone was populated from the pinned revision through the connected
GitHub service. The signed commit object, all 179 app blobs and their tree were
verified against GitHub; no older local checkout supplied app source. Before
synchronization there were no Sites-only files. Compared with version 13,
the app changes are `public/board.mjs`, `public/guest.mjs`,
`public/planner.css`, `public/planner.js`, `public/sw.js`, and the Ideas-column
and landscape-menu tests.

**No database migration:** `drizzle/` is byte-for-byte unchanged from version
13 and still ends at `0003`. No stored trip was rewritten. No backup,
migration rehearsal or database rollback was prepared, as instructed. No trips,
guest links, editor membership, Sites access policy, runtime configuration,
invitations, emails or schedules were changed. The daily snapshot proposal
remains disabled.

**Checks run before deployment:** Node 24.22.1, locked dependency installation
through the Sites installer, `npm test` **120 passed, 0 failed**,
`npm run typecheck` passed, and the production build through the Sites build
helper passed. The pushed Sites root tree matched the requested app tree.
No local preview server or substitute browser automation was used.

**Verification on this live release:**

| Requested check | Result |
| --- | --- |
| Organizer at 750 × 340: Ideas and at least two day columns side by side, cards on first screen | **Not checked** |
| Organizer at 667 × 375: side-by-side columns and cards on first screen | **Not checked** |
| Organizer at 390 × 664: one day, day rail, + Add to the day | **Not checked** |
| Organizer at 390 × 300: still one day with keyboard-height viewport | **Not checked** |
| Desktop unchanged: Ideas column, Manage menu, all days | **Not checked** |
| Loaded-page rotation upright → sideways → upright switches layout each way | **Not checked** |
| Camp Earnest guest at 750 × 340 without organizer session: side-by-side days, read-only sentence, no inputs or Add buttons | **Not checked** |
| No sideways page overflow at each requested size | **Not checked** |
| Physical phone | **Not checked** |

Browser/computer controls were unavailable in this session, so the viewport,
signed-in, guest-browser and rotation checks could not be performed. The
version 13 browser results below are historical evidence only and are not
claimed for version 14. The correction note's local Chromium results are also
not live verification.

**Additional live check passed:** cookie-free HTTP downloads of `sw.js`,
`board.mjs`, `planner.css`, `planner.js` and `guest.mjs` exactly matched
the pinned source bytes. This confirms the deployed v28 assets, not their
rendered layout. Sites reported successful deployment; no check failed.

If anything goes wrong with this release, redeploy retained saved version
**13** and stop. No database rollback is part of this release.


### November 16, 2026 release (America/Los_Angeles)

Deployed at 07:09 PST on November 16 (2026-11-16T15:09:11Z). This release
deploys the six interface changes in [getting-in.md](getting-in.md),
[plain-words.md](plain-words.md), [dark-forms.md](dark-forms.md),
[within-reach.md](within-reach.md), [ideas-column.md](ideas-column.md), and
[landscape-and-menu.md](landscape-and-menu.md).

| Item | Provenance |
| --- | --- |
| GitHub source | `73a1adb40bf7ae039ca95c9e1402550212b5d077`, app at `apps/sites-prototype` |
| Sites source | `fd2986bc62f5bc597c5e8cefcdcd5d76ecb381a8` |
| Matching content tree | GitHub app subtree and Sites root tree both `8b8d1d23bdc222a61ad02762d82ef01d35b2c25b`; 179 tracked files |
| Saved version | **13**, `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_11f00386f47881919c87cb68817e03e8` |
| Deployment | `appgdep_6afb1c8ff4048191bc02f146539f0cc0`, succeeded |
| Runtime / offline shell | Environment revision 1; `waypoint-shell-v27` |
| Rollback version retained | **12**, `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_0317b417c0548191a990228181ecc16c` |

The source was obtained anew from the pinned GitHub revision, using the
organizer's authenticated Chrome session to download its ZIP because command-line
GitHub authentication was unavailable. Every file produced the expected full
repository tree. GitHub's signed commit object was verified against the exact
commit ID, and a fresh shallow clone was made from those newly downloaded Git
objects. No older checkout supplied source files.

Before synchronization there were **no Sites-only files**. The six GitHub-only
files were the tests for these six interface changes. After synchronization and
push, the Sites root tree matched the expected app subtree exactly.

**No database migration:** `drizzle/` is byte-for-byte unchanged from version
12 and still ends at `0003`. No migration was added, no stored trip was
rewritten as part of deployment, and no database backup, migration rehearsal,
or database rollback was prepared, as instructed. The only live data writes
during verification were adding and deleting the disposable test activity.

**Checks run before deployment:** locked dependencies installed through the
Sites installer with Node 24.22.1; `npm test` **120 passed, 0 failed**;
`npm run typecheck` passed; production build through the Sites build helper
passed. Source was clean after the build. API/access integration suites were
not rerun for this interface release.

**Live verification:**

| Requested check | Result |
| --- | --- |
| Organizer header shows “Editing as” and the sign-in address | **Passed**; actual address checked in the browser, not recorded here |
| Desktop toolbar contains trip selector, Show plans for, Add activity, Manage and week-view switch; other tools are in Manage | **Passed** |
| Manage contains Manage travelers, History, Guest link, Editors, Refresh, and the other management/import/export controls | **Passed** |
| Ideas column is left of the days; Hide folds it and the choice survives reload | **Passed**; expanded again after checking |
| Every day ends with + Add; dark form opens with that day selected; cancel without saving | **Passed**; six day buttons checked, Sunday preselection and dark fill checked, then closed without saving |
| Stay line opens cream Stay details with Edit stay; last stay day says Check-out day | **Passed** |
| Cards omit Flexible; whole-group card is cream with a pink top band and Whole-group activity words | **Passed**; inspected on the live desktop board |
| History opens and is cream | **Passed** |
| Signed-in 390 px: one day, Ideas first in the rail, + Add to the day below cards, no sideways page overflow | **Passed**; 390 px viewport, 375 px content width with scrollbar |
| Signed-in 844 × 390: activity cards visible without scrolling | **Passed**; three cards intersected the first viewport |
| Camp Earnest guest link in a browser with no organizer session loads without sign-in; read-only sentence and planner sign-in link | **Passed** in a fresh Chrome Incognito window |
| Guest page has no inputs, Add controls or stay lines; no Example cards | **Passed** |
| Guest page lists unscheduled ideas | **Not checked with a nonempty list**; Camp Earnest had no unscheduled ideas during verification |
| Cookie-free /api/trips returns 401 | **Passed** in Incognito and by a direct cookie-free HTTP request (HTTP 401) |
| Add disposable activity from a day's + Add, confirm it appears, delete it, confirm both History entries | **Passed**; activity absent afterward, add and delete at revisions 43 and 44 |

No requested live check failed. Physical phones, real China connectivity,
200% zoom, tablets, and a second real account were **not checked**. No guest
token, editor membership, Sites access policy, runtime configuration, invitation,
email or schedule was changed. No trip was created, imported or deleted.
The daily snapshot proposal remains disabled.

If this release needs rollback, redeploy retained saved version **12**, then
stop. No database rollback is part of this release.


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
