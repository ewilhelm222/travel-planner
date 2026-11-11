# Sites prototype: setup and verification

## Current result

[Open the private prototype](https://travel-planner-ewilhelm-prototype.tortuga-1566.chatgpt.site).

The working name is **Waypoint**; naming is not a confirmed product decision. All itinerary content is fictional: two sample families visiting Kyoto and Osaka. No real reservations or China trip data have been loaded, and no invitations have been sent.

The initial Site is owner-private. Its observed access mode is `custom`, with one allowed account, no groups, and no external visitors. External invitation capability is enabled for the owner. Do not make it public to work around sign-in issues.

## What is implemented

- Stays with grouped days and a major train journey between them.
- Everyone/Cedar/Maple family views. Shared dinner is one record visible in both family views.
- Editing an existing activity's title, notes, day, and time; fixed bookings retain their date/time.
- One shared, versioned document in managed D1 storage, initialized explicitly by the signed-in user's **Start the sample trip** action.
- Atomic revision checking: competing saves of the same revision cannot both succeed. The rejected edit stays in its dialog, with draft-copy and explicit refresh actions.
- A service worker caches the static offline shell and assets. A separate downloaded snapshot includes the download time and last confirmed revision. Authenticated HTML and API responses are not cached by the service worker.
- Offline reading, disabled writes when offline, and versioned JSON export.
- In-app sign-out clears the device's downloaded data and app caches before navigating to Sites sign-out.

This is a feasibility prototype. Adding/deleting activities, full drag-and-drop, stay-move previews, per-person participation, family editing protections, undo/history, maps, real-data loading, and operational backup/restore are still future work.

## Source and deployment

- Canonical project source: `apps/sites-prototype/` in this GitHub repository.
- Platform: the supplied Sites Vinext/Cloudflare Worker starter; managed D1 binding `DB`.
- Site ID: `appgprj_6af3ef55c4f48191940aa66a59771eb3` (also in the tracked hosting manifest).
- Initial deployed Sites source commit: `a1b6bbe555338dc87ea1eedaccca7b66f0372eb8`.
- Initial saved version: `appgprj_6af3ef55c4f48191940aa66a59771eb3~appgver_c990ab214808819181238a96562852ca`.
- Initial deployment: `appgdep_6af3f2aff5cc8191a3f0ba7609c866af`, reported `succeeded`.

GitHub and the Sites-managed source repository are separate. The initial deployment copied this app into a separate temporary checkout and used the Sites source helper to commit, push, package, and deploy it. The GitHub repository's origin was preserved. For updates, make changes here, test/build here, synchronize the app into the same Site's deployment checkout, then use the Sites workflow. Never copy credentials, local database files, or other runtime state into either repository.

The initial deployment archive was built from the matching source and submitted through `save_version_and_deploy_private`. Production schema migrations are applied by Sites during publication. The app performs no runtime schema creation. The current single-document schema deliberately tests storage and conflicts; it is not the final multi-record planner schema.

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
| Domain checks | Four Node tests passed: shared-record identity, immutable fixed timing, bounded moves, and input/calendar validation. |
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
| External invitations | `get_site` reports capability enabled. No invitation sent and no second person's access tested. |

The in-app browser's hosted login reached a security-verification page; that path was not bypassed. Hosted owner verification succeeded in the existing Chrome session instead.

## Remaining checks before real trip data

1. With the owner's chosen recipient and explicit instruction to invite them, test an external ChatGPT account's access and edits. Verify an uninvited signed-in account is rejected.
2. On a physical phone, sign in, download the plan, disable connectivity, reopen the page, and inspect notes. Reconnect and verify a fresh read precedes editing. Repeat against the hosted Site, not just localhost.
3. Verify sign-out and account-switch cleanup on the target browsers. Downloads exported by the user are independent files and cannot be cleared by app sign-out.
4. Test the hosting/sign-in/maps combination from the expected China travel connections. No claim of mainland-China availability has been established.
5. Confirm platform backup and restore procedures and current hosting allowance/pricing. JSON export is available, but operational recovery is not yet validated.
6. Review board density and shared-activity behavior with staggered arrivals, parallel stays, and a realistic two-week itinerary before finalizing the record schema.

The feasibility milestone is partially complete, not fully signed off. The next product work is the reviewed board's actual editing workflow, after resolving any platform failures exposed by the outstanding checks.
