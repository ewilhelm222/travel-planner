# Deployment prompt — weather uncertainty

Deploy the merged weather-uncertainty PR from `ewilhelm222/travel-planner` to the
existing Waypoint Site, following the Sites workflow and repository AGENTS.md.
Resolve the PR's merge commit and pin its full GitHub SHA before packaging. Do
not assume the current branch or a newer main commit is the reviewed artifact.

- Canonical app subtree: `apps/sites-prototype`.
- Existing Site: `appgprj_6af3ef55c4f48191940aa66a59771eb3`.
- Existing URL: https://travel-planner-ewilhelm-prototype.tortuga-1566.chatgpt.site
- Preserve current Site audience and runtime configuration. No new migration,
  environment variable, external service, map key, share link or trip write.
- Read `docs/weather-communication.md`, `docs/weather.md`, and
  `docs/deployment-verification.md`. The release-history index may lag the
  live Site: inspect actual Site version/provenance and retain that rollback
  version before changing anything.

Use a clean checkout of the pinned SHA. Run npm test and typecheck; use the
supported build helper. The synthetic browser regression script is
`scripts/check-weather-browser.cjs` (requires Playwright, Chrome, loopback dev
server and a disposable local database with existing migrations). Review desktop
and phone summaries and dialogs. Record exact results and any unperformed checks.
Source shell version is v54 in planner.js and sw.js. Keep any later shell-version
change explicit rather than silently mixing code from another release.

Synchronize only the app subtree to the same Site's deployment checkout; retain
GitHub as canonical, exclude .dev.vars, credentials, local databases and runtime
state, and follow the Sites source helper for provenance and packaging. Save
and deploy with the audience-appropriate native tool. Follow a returned pending
deployment to its terminal status; retain the actual saved version/deployment IDs.

Verify served bytes against the pinned source for weather.mjs, planner.css,
planner.js, sw.js and unchanged guest assets. For guest HTML use only the narrow
Cloudflare challenge normalization in deployment-verification.md. Independently
verify CSP and signed-out API denials. Do not expose private trip data in logs.

Using an existing authorized owner session, read the existing trip only: verify
possible conditions, “Precip N% peak hourly”, high/low, Details, separate daily
rain/new-snow totals, less-than trace amounts where applicable, retrieval time,
and the probability explanation. Check Enter/Space, Escape and focus return,
phone portrait/landscape and week view. Do not edit a real itinerary to generate
weather cases; use local invented forecasts for edge cases. If no live trace or
snow case exists, record that limit. Use an existing guest link only if authorized;
do not create or rotate links. Verify guest Details omit private place labels,
addresses and coordinates. Check saved-forecast labeling on local simulated
refresh failure and confirm offline/session cleanup remains intact.

Record release evidence in docs/releases with the actual pinned source, Site
version, deployment result, shell version, checks and verification limits. Roll
back for an observed app regression using the retained prior version; known
Cloudflare-only injection is not itself an app regression. Report separately
anything that could not be verified. Return the live URL and release result.
