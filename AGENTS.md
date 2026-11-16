# Travel planner guidance

Read `docs/design-night-market.md` before visual or interaction changes. The
organizer adopted **Waypoint — Night Market** on November 11, 2026 and it is
applied to the app. Use `docs/design/night-market/tokens.css` and its references
for ongoing implementation. The superseded Departure Board study remains in
`docs/design.md` and the earlier Field Atlas study in `docs/design-field-atlas.md`.

`docs/plan.md` governs confirmed requirements and data behavior. Every save goes
through `commit()`/`transact()` in `apps/sites-prototype/lib/trip-store.ts` so it is
logged and checked per record (`docs/safety-net.md`, `docs/per-record-revisions.md`). Design studies
illustrate proposals; they do not establish completed features or approved
schema changes. Read `docs/prototype.md` for implementation status and checks.

Apply the visual system incrementally while preserving authentication,
concurrent-edit protection, exports, and the offline/session lifecycle. Keep
critical text readable, use explicit participant and booking labels alongside
color, and provide keyboard and phone controls. Validate the parallel-stay
layout before replacing the current board. Keep real itinerary data private
and use synthetic fixtures in source control.
