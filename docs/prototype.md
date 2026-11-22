# Sites prototype: setup and verification

## Current result

The multi-event planner is deployed with the Night Market design. See
[multiple trips, guest links, and current access status](multi-events.md) for the
current implementation and [the schedule-first phone layout](schedule-first.md)
for the phone arrangement. Tapping an activity opens a read-only view, with
Edit for people who sign in: see [tap to read, Edit to change](activity-view.md).
A change of stay area is drawn as a travel bridge between the columns: see
[travel bridges](travel-bridge.md) (deployed in version 26).
The sections below preserve the initial feasibility
proof and its verification history.

## Pending deployment: stay-only whole-trip Google map

Implemented in GitHub on November 19, 2026; not deployed in this change.
Whole trip uses Google Maps for the selected travelers’ unique stay locations,
excluding day trips and journey-only endpoints. This day and guest-sharing
boundaries remain unchanged. Browser shell v53. No schema or runtime changes.
See [Google map behavior](google-maps-embed.md).

Validation: 243 Node tests passed, 3 browser tests skipped (Playwright unavailable);
type check, production build and diff whitespace checks passed. A real Google
frame and phone rendering still need deployment verification.

## Pending deployment: weather uncertainty

Implemented in source on November 21, 2026; publication is separate. Weather
now identifies peak hourly probability, possible conditions and explicit high/low.
Touch/keyboard Details separates daily rain/new snowfall totals and uncertainty;
trace amounts do not round up, clouds are not drawn as sunshine, and temperature
alone does not imply snow. Source shell v54. No new schema, service or runtime
configuration. See [research and validation](weather-communication.md) and the
[deployment prompt](deploy-weather-uncertainty.md).

Validation: 245 Node tests passed, 3 unrelated browser tests skipped; typecheck,
production build and lint (0 errors) passed. The dedicated local synthetic weather
browser suite passed at desktop, week, phone portrait and phone landscape sizes,
including guest privacy, keyboard/focus and cached fallback. Physical phones,
screen readers and production verification remain outstanding.

## Original feasibility result

[Open the private prototype](https://travel-planner-ewilhelm-prototype.tortuga-1566.chatgpt.site).

The working name is **Waypoint**; naming is not a confirmed product decision. All itinerary content is fictional: two sample families in the editable board, and three sample families in the read-only layout study, visiting Kyoto and Osaka. No real reservations or multi-area trip data have been loaded, and no invitations have been sent.

The initial Site is owner-private. Its observed access mode is `custom`, with one allowed account, no groups, and no external visitors. External invitation capability is enabled for the owner. Do not make it public to work around sign-in issues.

[Architecture review response](review-1.md) records the disposition of all feedback in issue #1.

## Night Market design adoption — November 11, 2026

The organizer adopted [Night Market](design-night-market.md) and it is applied to
`planner.css`, the guest view, the parallel-stay study, the offline shell, and
the reading copy; the offline shell cache was version 11 at the time and has
since moved on. A round day-medallion
rail mirrors the existing day select. Record data, APIs, authentication, and
concurrency handling are unchanged. Verification is listed in the design guide.
The published Site already carries this styling; see
[travelers.md](travelers.md) for how it was reconciled into this repository.

## Field Atlas design adoption — November 11, 2026

The organizer adopted [the designer's Field Atlas direction](design.md) for
ongoing work. Root `AGENTS.md` points future implementation work to that overview
and its tokens, while the product plan continues to govern data behavior.

The first visual pass applies those tokens to the editable prototype, existing
parallel-stay study, and self-contained HTML export. It adds local serif display
type, warm paper and forest ink, mist shared cards, explicit Flexible / Fixed
booking labels, larger metadata, 44 px controls, visible focus, a skip link,
full-height phone activity details, and a sand reading-copy band. Offline shell
version 6 carries the updated assets. No new network assets are required.

This pass retains the current stay-grouped editable board. The date-aligned board,
selected-day phone agenda, compact trip-story preference, and larger interaction
changes in the design reference remain future work, subject to the layout review.

Verification: all 12 existing Node tests and the loopback API checks passed; the
production build passed. Browser checks covered desktop rendering, a 390 px
viewport override (375 px content width with scrollbar), no horizontal overflow,
44 px button heights, dialog Escape/focus restoration, family filtering with all
shared attendee labels retained, and reopening the restyled cached shell after
stopping the server. The hosted owner session showed the new theme and reported
Ready to read offline. No physical-phone or China-connectivity claim is made.
The full two-week layout, complete keyboard-only workflow, and 200% browser zoom
still need review with the forthcoming board layout.

- Sites source commit: `3d0b5fbb89828ac3441e4a524c2ce1efcbb3099e`.
- Saved version: `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_7f25c46cbb5081918f4469d14e062e4c`.
- Deployment: `appgdep_6af47e23eb2881919277c86b078d49c6`, reported `succeeded`.

## What is implemented

- Stays with grouped days and a major train journey between them.
- Everyone/Cedar/Maple family views. Shared dinner is one record visible in both family views.
- Editing an existing activity's title, notes, day, and time; fixed bookings retain their date/time.
- One shared, versioned document in managed D1 storage, initialized explicitly by the signed-in user's **Start the sample trip** action.
- Atomic revision checking: competing saves of the same revision cannot both succeed. The rejected edit stays in its dialog, with draft-copy and explicit refresh actions.
- A service worker caches the static offline shell and assets. A separate downloaded snapshot includes the download time and last confirmed revision. Authenticated HTML and API responses are not cached by the service worker.
- Offline reading, disabled writes when offline, versioned JSON export, and a self-contained **Save offline trip** HTML download. The HTML includes all recorded notes, lodging, journeys, participants, addresses, revision, and timestamps, and can be printed to PDF.
- Expired authentication preserves the reading copy and pauses editing; explicit sign-out still clears it. An explicit access denial clears the browser copy. Static offline modules remain available when the server returns a sign-in page instead of code.
- A separate [parallel-stay study](https://travel-planner-ewilhelm-prototype.tortuga-1566.chatgpt.site/parallel-stays.html) aligns dates and city lanes using independent activities, staggered arrivals, a shared dinner, and a non-mutating stay-move preview.
- In-app sign-out clears the device's downloaded data and app caches before navigating to Sites sign-out.

At the end of the original feasibility pass, adding/deleting activities, full drag-and-drop, stay-move previews, per-person participation, family editing protections, undo/history, maps, real-data loading, and operational backup/restore were future work. Consult the current status above for features added since then.

## Source and deployment

Current deployed application: **version 26**, shell **v52**, runtime revision **2**.
See [the release index](releases/README.md), [version 26](releases/2026-11-19-v26.md)
and the [Cloudflare-aware deployment checks](deployment-verification.md).
Documentation commits after the pinned release do not change the live Site;
GitHub main and the deployed app commit must be reported separately.


- Canonical project source: `apps/sites-prototype/` in this GitHub repository.
- Platform: the supplied Sites Vinext/Cloudflare Worker starter; managed D1 binding `DB`.
- Site ID: `appgprj_6af3ef55c4f48191940aa66a59771eb3` (also in the tracked hosting manifest).
- Initial deployed Sites source commit: `a1b6bbe555338dc87ea1eedaccca7b66f0372eb8`.
- Initial saved version: `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_c990ab214808819181238a96562852ca`.
- Initial deployment: `appgdep_6af3f2aff5cc8191a3f0ba7609c866af`, reported `succeeded`.

GitHub and the Sites-managed source repository are separate. The initial deployment copied this app into a separate temporary checkout and used the Sites source helper to commit, push, package, and deploy it. The GitHub repository's origin was preserved. For updates, make changes here, test/build here, synchronize the app into the same Site's deployment checkout, then use the Sites workflow. Never copy credentials, local database files, or other runtime state into either repository.

The initial deployment archive was built from the matching source and submitted through `save_version_and_deploy_private`. Production schema migrations are applied by Sites during publication. The app performs no runtime schema creation. The current single-document schema deliberately tests storage and conflicts; it is not the final multi-record planner schema. GitHub remains canonical; reconcile any separate Sites edits back here before the next release. An ordinary generated Worker artifact passed `wrangler deploy --dry-run`, but independent Cloudflare identity, data migration, account deployment, and reachability remain unverified. Never deploy the existing Sites identity-header trust model unchanged to an unprotected host.

## Local development

Use Node.js 22.13 or newer and npm. Run from `apps/sites-prototype/`:

```sh
npm ci
npm run db:generate
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_moaning_goblin_queen.sql
npm run dev
```

Apply the migration once per new local database; do not replay it against an already initialized one. For future schema changes, generate a new migration rather than modify an applied migration. Keep local database state ignored.

The portable preview simulates ChatGPT sign-in on loopback only. Visit the printed local URL; the mock user is `Seedy`. This simulation is absent from hosted builds and is not evidence of a second real person's access.

Checks:

```sh
npm test
npm run typecheck
npm run test:api -- http://127.0.0.1:5173
```

The API smoke check is restricted to loopback and synthetic records. It performs concurrent note edits and restores the original note. Use the actual development-server origin. Stop the dev server before testing the offline fallback, then reload a previously downloaded plan in the same browser.

This machine initially lacked npm. For the first build only, npm was downloaded into a temporary tool directory and the bundled Codex Node runtime was used; no global toolchain was installed. Subsequent development can use an ordinary Node/npm installation. Follow the Sites skill's helpers for deployment rather than invoking an ad hoc hosting command.

## Verification performed

| Check | Evidence and scope |
| --- | --- |
| Production build | Passed using the Sites build helper. |
| Type check | `tsc --noEmit` passed. |
| Domain checks | Twelve Node tests passed, covering domain invariants plus self-contained HTML completeness/escaping, expiry policy, actual-client expiry/sign-out behavior, independent parallel-city grouping, non-mutating previews, and cached-shell/module behavior on auth gates. |
| Unauthenticated API | Local API returns 401 before database access. |
| Concurrent writes | Local D1 integration check sends simultaneous saves of one revision; exactly one returns 200 and one 409. Subsequent read confirms only one change persisted. |
| Other rejected writes | Integration check rejects fixed-time changes and a foreign-origin mutation. |
| Draft preservation | Two browser tabs edit the shared dinner. The stale tab shows a conflict, retains its draft, and disables another save until refresh. Both use the local mock identity. |
| Family views | Browser check shows the Cedar view excludes the Maple-only museum while retaining shared dinner. |
| Offline reopening | Local server stopped entirely; a full browser reload opens the service-worker shell and downloaded itinerary. Activity notes remain readable and form/save controls are disabled. |
| Narrow layout | Browser preview checked without horizontal overflow at an observed CSS viewport of 653 px. A requested narrower in-app viewport was not applied by the browser surface; a 390 px viewport and a physical phone remain unverified. |
| Hosted access gate | A signed-out in-app browser shows the ChatGPT sign-in gate. No private itinerary appears there. |
| Hosted signed-in flow | Existing owner session in Chrome can initialize the sample trip, save a note, and reload the persisted change. |
| Hosting and schema | Private deployment succeeded; hosted initialization/read/write confirms D1 schema and binding work. |
| Offline review regression | After adding ES modules, a stopped-server reload exposed cache matching affected by differing Origin headers. Static cache matching was corrected; another full stopped-server reload succeeded with the new modules and download control. |
| Offline file | Browser downloaded the actual self-contained HTML; file contents were checked for completeness and no scripts. Automated browser `file:` navigation is disallowed, so target-phone file opening is not claimed. |
| Parallel stays | Browser filter shows Birch sleeping in Osaka while attending the single shared Kyoto dinner. Move preview lists solo shifts, fixed bookings, mixed participation, and connected travel separately. |
| Worker portability | Wrangler local dry-run packaged the standard Worker and D1 binding. No independent account resources were created, and alternative authentication/data migration were not tested. |
| External invitations | `get_site` reports capability enabled. No invitation sent and no second person's access tested. |

The in-app browser's hosted login reached a security-verification page; that path was not bypassed. Hosted owner verification succeeded in the existing Chrome session instead.

## Remaining checks before real trip data

**First gate:** decide whether live editing in China is essential and test host, fresh/expired sign-in, and any required saves from the actual travel connection or an in-country tester. No host migration, roaming assumption, or VPN assumption substitutes for that test. The recommended interim mode is planning where supported and reading a verified saved file in China.

1. With the owner's chosen recipient and explicit instruction to invite them, test an external ChatGPT account's access and edits. Verify an uninvited signed-in account is rejected.
2. On a physical phone, sign in, save the self-contained trip HTML, and open it from Files with connectivity disabled. Also download the browser copy, reopen the page offline, and inspect notes. Reconnect and verify a fresh read precedes editing. Repeat against the hosted Site, not just localhost.
3. Verify sign-out and account-switch cleanup on the target browsers. Downloads exported by the user are independent files and cannot be cleared by app sign-out.
4. Test the hosting/sign-in/maps combination from the expected China travel connections. No claim of mainland-China availability has been established.
5. Confirm platform backup and restore procedures and current hosting allowance/pricing. JSON export is available, but operational recovery is not yet validated.
6. Review board density and shared-activity behavior with staggered arrivals, parallel stays, and a realistic two-week itinerary before finalizing the record schema.

The feasibility milestone is partially complete, not fully signed off. The next product work is the reviewed board's actual editing workflow, after resolving any platform failures exposed by the outstanding checks.

## Review #1 release

- Sites source commit: `b2327090508e5aa01ad81c5bc327c5ecd324ebe7`.
- Saved version: `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_07f9cc007c408191ae13e6edc9e520b9`.
- Deployment: `appgdep_6af3fd3c3dc481919d3ae4cc6b661195`, reported `succeeded`.
- Hosted verification: **Save offline trip** and the parallel-stay study are present; the study's move preview works without changing the saved trip. The final browser shell reports **Ready to read offline** after validating the expected same-origin clean-URL redirect for its HTML shell.
- Twelve automated tests pass. The original API smoke checks still pass. A local full offline reload was repeated after adding cached modules. Target-phone file opening, an invited account, China reachability, and operational restore remain unverified.
