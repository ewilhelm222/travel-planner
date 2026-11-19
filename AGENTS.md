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
schema changes. Tapping an activity opens its read-only view; the editor opens
only from that view's Edit button (`docs/activity-view.md`). The view is one scroll
area with only the × and Close/Edit fixed, description before place, and map links
folded into one Maps control (`docs/activity-view-layout.md`). A place's map location is an address or
coordinates as typed; nothing is geocoded or converted (`docs/map-location.md`).
The day map uses Google Maps Embed when `GOOGLE_MAPS_EMBED_KEY` is set in runtime
configuration, and the schematic otherwise; the key is never committed. Guests
get the Google map, and the stop locations it needs, only if the organizer ticks
it on the guest link (`docs/google-maps-embed.md`).
The weather line under each date is for the stay's location: the server sends
rounded coordinates (to guests too) and the reader's browser asks the forecast
service; an address is looked up for the weather only and never stored (`docs/weather.md`).
"Last edited by" is read from the change log, never stored, and never shown to
guests (`docs/last-edited.md`). Read `docs/prototype.md` for implementation status and checks.

Apply the visual system incrementally while preserving authentication,
concurrent-edit protection, exports, and the offline/session lifecycle. Keep
critical text readable, use explicit participant and booking labels alongside
color, and provide keyboard and phone controls. Validate the parallel-stay
layout before replacing the current board. Keep real itinerary data private
and use synthetic fixtures in source control.
