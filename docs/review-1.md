# Response to architecture review #1

Source: [Architecture review: holes and suggested changes to docs/plan.md](https://github.com/ewilhelm222/travel-planner/issues/1).

This response separates implemented fixes, recommendations added to the plan, and checks that require another account, device, connection, or hosting account. The review is useful evidence, not an instruction to silently migrate hosts, invite people, or expand the product.

## Summary of disposition

| Feedback | Disposition |
| --- | --- |
| 1. China access first; retain offline data through session expiry | China-use gate moved to the top of milestone 1. Fixed expiry handling in the actual client and worker. Live China reachability remains unverified. |
| 2. Independent offline file | Implemented **Save offline trip**: one self-contained HTML file, with no scripts or external assets, printable to PDF. Actual phone file-opening test remains required. |
| 3. Cloudflare fallback | Preferred fallback to investigate is now an owner-controlled Worker + D1 deployment with alternative sign-in. Local Wrangler packaging passes. An account deployment, identity replacement, and data migration are not yet verified. |
| 4. Source of truth | Reaffirmed GitHub as canonical; Sites-managed Git is the deployment mirror. A release sync already exists. It is not an automatic GitHub Actions pipeline. |
| 5. Simpler safeguards | Plan now specifies per-record revisions, conditional record undo from an append-only log, an organizer flag, and soft family-edit confirmation. Daily object-storage snapshots are recommended, with restore testing; not implemented or scheduled. |
| 6. Independent activities | Updated the conceptual model to date/place/participants, with no required stay attachment. Demonstrated in the design study and tests. Existing editable prototype records remain unchanged pending schema review. |
| 7. Parallel-stay board | Implemented a separate read-only synthetic study with staggered arrivals, parallel cities, a shared dinner, split activities, filtering, and a stay-move preview. |
| 8. China maps | Added recommendations for tile-free schematics, local-script names/addresses, explicit coordinate systems and provenance, and Amap/Apple options. No untested navigation integration is presented as complete. |
| 9. Cost, beta, and sensitive identifiers | Pricing/limits remain a pre-trip check. Recommend no dedicated passport-number or reservation-code storage and no such secrets in notes/downloads. No real trip data was added. |

## 1. China use: a decision, not an assumption

The critical distinction is between planning before departure and relying on a live authenticated app during the trip. The implementation plan now makes the latter a first gate, instead of leaving it among the last platform checks.

The user has not yet decided whether live editing on ordinary mainland connections is essential. The current recommendation is:

- Continue planning in Sites where the service is supported and reachable.
- Before departure, save and open the itinerary file on each phone. Use that as the dependable in-country reading copy; browser caching is an additional convenience.
- If live editing in China is required, test the exact host, identity provider, and intended connection before selecting a host. Changing to Cloudflare removes the ChatGPT identity dependency only after a different identity system is implemented; it does not prove network reachability.

| Approach | Benefit | Limitation |
| --- | --- | --- |
| Sites for planning + saved HTML/PDF for travel | Smallest operational burden; file reading needs neither login nor connectivity | Snapshot can become stale; updates require a new download. Changes must be communicated to offline travelers. |
| Owner-controlled Worker + tested alternative login | Potentially supports live collaborative updates without ChatGPT sign-in | Requires setup, authentication validation, data transfer, backups, and real in-country testing; no availability guarantee follows from the host name alone. |
| Existing DigitalOcean server | Uses an existing service with control over runtime and login | Requires server administration and adaptation of D1/runtime dependencies. A full rewrite is not established. |

Do not characterize a VPN or roaming SIM as a guaranteed or universally supported solution. The official OpenAI **API** supported-country list is about API access, not a measurement of a Sites domain or a complete statement of ChatGPT/Sites behavior. The review's categorical claims about all domains, all connections, and reauthentication have not been independently tested here. This does not reduce the need for the release gate.

The acceptance record should include test date, location/connection type, device/browser, fresh and expired login behavior, a shared save if required, and saved-file reading with networking disabled. Record outcomes without credentials or precise personal location.

## 2. What the offline fix changes

Before this review, the client deleted its stored reading copy for both HTTP 401 and HTTP 403, and for a non-JSON sign-in response. That was a real defect: an expired session could erase the very copy needed while traveling.

Now:

- HTTP 401 or a successful HTML sign-in response retains the downloaded itinerary, marks the app read-only, and offers sign-in to update it.
- Explicit in-app sign-out still clears the downloaded copy and caches. A different authenticated account replaces the old copy.
- An explicit access denial (403) still clears the browser copy. An already exported file is an independent user-held copy and cannot be recalled by the app.
- The service worker can return its cached shell when navigation hits an expired-session gate. It refuses to install HTML sign-in pages in place of JavaScript or CSS, and accepts only the known same-origin HTML clean-URL redirect after verifying the offline-shell marker.
- **Save offline trip** exports the last confirmed snapshot, not an unsaved draft. The file contains all recorded activities, participants, notes, lodging, journeys, addresses, time zone, revision, and download/export timestamps. It supports optional local-script place data when present.
- The HTML file uses inline styling, escaped text, and a restrictive content-security policy. It contains no scripts, fonts, images, API calls, or login requirement. It can be printed or saved as PDF using a normal document viewer.

WebKit's documented seven-day rule is based on days of Safari use without interaction with the site, with different treatment for home-screen web apps. It is not a universal seven-calendar-day eviction rule for every iPhone browser. The broader conclusion is correct: browser storage must not be the sole offline guarantee.

The browser successfully downloaded the synthetic HTML. Automated checks validate completeness, Unicode addresses, untrusted-text escaping, and absence of external dependencies. Opening a `file:` URL in the automated browser was blocked by that browser's URL policy; no alternate route was used to bypass it. The actual phone's Files/document viewer still needs a manual test. We do not claim that every mobile viewer will handle the file identically.

## 3. Runtime portability and identity

The prototype already builds a standard Worker entrypoint with an ordinary generated Wrangler configuration and a D1 binding. A local `wrangler deploy --dry-run` succeeded without creating or changing Cloudflare account resources. That establishes packaging compatibility, not an independent hosted migration.

The remaining migration trial must:

1. Use an owner-controlled account and a reviewed private Access policy.
2. Replace Sites-dispatch identity with validated alternative identity, such as Cloudflare Access email-code login. Do not trust caller-supplied `oai-authenticated-user-*` headers on an independent deployment.
3. Provision D1, apply the schema, transfer a synthetic trip, and verify saves and stale-write rejection.
4. Verify asset/offline behavior and sign-out at the new host.
5. Test the actual China connection and backup/restore path.

Cloudflare documents email-code login for approved addresses. The visitor must also be able to receive the code, so email access is another dependency to test. We did not change the selected host or assume the owner already has a suitable Cloudflare account.

There is no need to rely on an unverified community claim about a one-click native Sites export. This project already retains its source and produces Worker artifacts. The authentication replacement and database transfer are still real work.

## 4. Release source and synchronization rule

**GitHub is canonical.** Edit and review the app in `apps/sites-prototype/`, test and build there, then synchronize those files into the existing Sites deployment checkout. The Sites helper commits/pushes the exact mirrored source and packages its matching build before publication. Record the Sites source commit and saved deployment in the verification notes.

If someone edits through Sites separately, reconcile that change back into GitHub before the next release. Do not overwrite divergent work or treat two repositories as simultaneously authoritative. No automatic GitHub-triggered deployment has been configured. Lack of such a pipeline is different from GitHub being unable to serve as the source of truth.

## 5. Safeguards and backups

The full-planner recommendation is deliberately small:

- Each editable record has a revision; stale writes fail.
- Each successful edit appends before/after snapshots to a change log in the same transaction.
- Undo restores one record only when its revision still matches the edit being undone. Otherwise show a conflict; do not rewind other people's work.
- One organizer flag, ordinary membership, and a soft confirmation when editing another family's item. No extended role hierarchy.
- A daily private full-trip object-storage snapshot, with a proposed 30-day retention and a tested restore. A per-edit log is not an independent backup.

The current feasibility app still has one trip-document revision. Changing it to per-record revisions and adding conditional undo belong with the full schema, rather than adding a second temporary data model now. No backup automation was silently created. Options for the next implementation are a Sites-supported scheduled authenticated snapshot path, or a Worker Cron Trigger if the owner-controlled fallback is selected. Validate scheduler, storage, retention, and recovery before claiming automatic backups exist.

## 6–7. Activities, stays, and parallel routes

The plan now recommends activity identity independent of lodging stays. Each activity records date, place, participants, and order; board views derive their grouping. A family may sleep in Osaka and attend a Kyoto dinner without duplicating that dinner or assigning it to someone else's hotel stay.

The new [parallel-stay study](https://travel-planner-ewilhelm-prototype.tortuga-1566.chatgpt.site/parallel-stays.html) is read-only and uses separate synthetic data. It aligns dates with city lanes and shows lodging separately. Filtering keeps one canonical shared activity. The move preview offers Cedar-only flexible shifts, leaves fixed bookings unchanged, flags mixed-participant activities, and lists travel needing review. It applies no changes.

This is an option to compare with the existing stay-grouped board, not a finalized replacement. Review it before adding full trip editing or choosing the final storage schema. The earlier platform proof has already happened; we cannot move it backward in time, but can avoid extending its simplistic layout into the real planner.

## 8–9. Maps and data boundaries

The recommended baseline is schematic points/arrows with no background tile dependency. Map backgrounds are optional. Store the local-script name/address alongside English, and coordinate-system/provenance metadata for any coordinates. Amap documents GCJ-02; treat it distinctly from WGS84 and BD09. Do not apply a guessed constant offset. Use a verified conversion or a reviewed name/address lookup when needed.

For China, review Amap links and optional Apple Maps links on actual devices instead of implementing a Google-only flow. No provider's reachability, data accuracy, or routing quality has been established by this review.

Sites pricing and beta limits must be rechecked before the trip. The rates quoted in the issue were provisional, and should not become a hard budget assumption. Keep passport numbers and booking codes outside the first-version data model; the shared app and its exports should focus on itinerary details.

## Verification and next decisions

Implemented checks include the real client expiry/sign-out lifecycle, offline HTML completeness and escaping, cached-shell behavior on a login gate, parallel-city grouping, and non-mutating stay previews. Existing fixed-booking, input-validation, shared-record, and concurrent-save checks remain in place. See [prototype verification](prototype.md) for current deployment results.

Still needed from the travel setup: whether live edits in China are essential, a target-phone file-opening/offline trial, an invited-account trial, China connection testing, and the chosen backup/restore trial. Keep issue #1 open until these are either completed or explicitly accepted as limitations.

## Primary references checked

- [Sites documentation](https://learn.chatgpt.com/docs/sites) and the installed Sites runtime/source workflow.
- [OpenAI API supported countries](https://developers.openai.com/api/docs/supported-countries), with the API-versus-Sites distinction above.
- [WebKit storage-policy explanation](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/).
- [Cloudflare Access email-code login](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).
- [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/).
- [Amap coordinate system](https://lbs.amap.com/faq/advisory/others/39838) and [coordinate conversion documentation](https://lbs.amap.com/api/javascript-api-v2/guide/transform/convertfrom).
- [Amap direction links](https://lbs.amap.com/api/uri-api/guide/travel/route) and [Apple Maps URLs](https://developer.apple.com/documentation/mapkit/unified-map-urls).
