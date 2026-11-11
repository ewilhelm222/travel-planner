# Travel planner guidance

Read `docs/design.md` before visual or interaction changes. The organizer
requested a bolder second direction, **Waypoint — Departure Board**, after
reviewing Field Atlas. Use `docs/design/departure/tokens.css` and the new
reference for this proposed direction. The first study is archived in
`docs/design-field-atlas.md`; do not mistake its earlier adoption for approval
of the new study or silently switch an ongoing implementation.

`docs/plan.md` governs confirmed requirements and data behavior. Design studies
illustrate proposals; they do not establish completed features or approved
schema changes. Read `docs/prototype.md` for implementation status and checks.

Apply the visual system incrementally while preserving authentication,
concurrent-edit protection, exports, and the offline/session lifecycle. Keep
critical text readable, use explicit participant and booking labels alongside
color, and provide keyboard and phone controls. Validate the parallel-stay
layout before replacing the current board. Keep real itinerary data private
and use synthetic fixtures in source control.
