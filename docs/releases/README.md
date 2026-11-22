# Release history and current deployment

Current live application: **version 29**, shell **v55**, runtime environment
revision **2**, deployed from pinned merged PR #51 commit
`b020aae515df0f331bc88b4d479bc56a2007d713`. Actual prior live version **28**
is retained for rollback. See [version 29](2026-11-22-v29.md) for provenance,
completed checks and remaining live-browser limits. Earlier consolidation and
its historical limits are preserved below.

| Versions | Record | Scope |
| --- | --- | --- |
| 12 and earlier | [Original provenance](../multi-events.md#release-provenance) and [prototype](../prototype.md) | Initial planner and safety/structure releases |
| 13–21 | [Historical archive](2026-11-16-to-17-v13-v21.md) | Feedback/layout, pictures and migration 0004, map/history additions, server weather and diagnostics |
| 22 | [November 17](2026-11-17-v22.md) | Guest-map switch and server-weather resilience; five HTTP 429 observations |
| 23 | [November 18](2026-11-18-v23.md) | Browser requests forecasts; live desktop forecast after automatic retry |
| 24 | [November 18](2026-11-18-v24.md) | Complete weather title text; shell v50; initial rollback then successful redeployment |
| 25 | [November 19](2026-11-19-v25.md) | Activity-view layout and weather persistence; shell v51 |
| 26 | [November 19](2026-11-19-v26.md) | Travel bridges and split days; shell v52 |

Version 27/28 actual retained provenance and version 28 documentation PR #50
are identified in the [version 29 record](2026-11-22-v29.md).

Use the [deployment verification procedure](../deployment-verification.md).
The app-owned guest HTML comparison excludes only the narrowly identified
Cloudflare challenge script; assets, CSP and authorization checks stay separate.

## Historical version 26 verification limits

All existing organizer trips and the existing guest page loaded in version 26.
Desktop bridges, split-day order, reading view, unsaved Edit journey form and
offline readiness passed. The single-stay board had no bridge or split day.
Live planner weather and a real planner Google map were verified in earlier
releases; guest weather and a real guest Google map remain unverified.
Phone portrait/landscape overrides did not apply; physical-phone, touch-dragging,
screen-reader and mainland-China behavior are not established. Local synthetic
tests are not a substitute for these checks.

The owner confirmed creating the test trip's guest link during preflight before
version 26 deployed. Metadata stayed stable afterward; there is no unexplained
sharing change. Do not copy private trip labels, tokens or hash values here.

## Consolidation provenance

This index consolidates documentation PRs #14, #20, #23, #27, #30, #32, #33,
#36, #39, #42 and #44. Cumulative versions 13–21 appear once, using #33's
complete history; unique feature-status corrections are retained in their
feature documents. Version 23 is reconstructed from retained check logs and
the deployment chat, whose documentation work was interrupted. Versions 22,
24, 25 and 26 retain their individual source/version/deployment IDs and limits.

Historical “not checked” results remain historical. Current status summaries
point to later evidence without pretending those older checks were performed.
Private labels and exact live forecast values are omitted; synthetic design
fixtures in the feature documents remain illustrative.
