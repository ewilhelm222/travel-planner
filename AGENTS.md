# Travel planner guidance

Read `docs/design.md` before visual or interaction changes. The organizer has
adopted its **Waypoint — Field Atlas** direction for ongoing implementation.
Use `docs/design/tokens.css` for colors, type, spacing, and shapes; inspect the
reference images and interactive study when changing layout.

`docs/plan.md` governs confirmed requirements and data behavior. Design studies
illustrate proposals; they do not establish completed features or approved
schema changes. Read `docs/prototype.md` for implementation status and checks.

Apply the visual system incrementally while preserving authentication,
concurrent-edit protection, exports, and the offline/session lifecycle. Keep
critical text readable, use explicit participant and booking labels alongside
color, and provide keyboard and phone controls. Validate the parallel-stay
layout before replacing the current board. Keep real itinerary data private
and use synthetic fixtures in source control.
