# Travel planner guidance

Read `docs/design.md` before visual or interaction changes. The organizer
adopted **Waypoint — Departure Board** on November 11, 2026. Use
`docs/design/departure/tokens.css` and its references for ongoing implementation.
The earlier Field Atlas study remains archived in `docs/design-field-atlas.md`, and
a proposed Night Market alternative is documented in `docs/design-night-market.md`.

`docs/plan.md` governs confirmed requirements and data behavior. Design studies
illustrate proposals; they do not establish completed features or approved
schema changes. Read `docs/prototype.md` for implementation status and checks.

Apply the visual system incrementally while preserving authentication,
concurrent-edit protection, exports, and the offline/session lifecycle. Keep
critical text readable, use explicit participant and booking labels alongside
color, and provide keyboard and phone controls. Validate the parallel-stay
layout before replacing the current board. Keep real itinerary data private
and use synthetic fixtures in source control.
