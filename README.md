# Travel Planner

A private, collaborative travel planner for trips with family and friends. Plan stays, connecting journeys, and daily activities through a shared board and maps, with views for different travelers.

## Status

The planner now supports multiple trips and events, independent dated activities,
unscheduled ideas, optional activity choices, participant filters, a phone agenda,
JSON import/export, offline reading, organizer-managed guest links, and a traveler
roster with family/group and individual activity assignments. The adopted visual
system, also used by the published interface, is **Night Market**.

[Open the planner](https://travel-planner-ewilhelm-prototype.tortuga-1566.chatgpt.site) · [Current implementation and access status](docs/multi-events.md) · [Managing travelers](docs/travelers.md) · [Schedule-first phone layout](docs/schedule-first.md) · [Editors](docs/editors.md) · [Source](apps/sites-prototype)

The tentative China draft and Camp Earnest event are stored in the private app,
with synthetic additions labeled. Real itinerary datasets and guest-link tokens
are excluded from this repository. The organizer approved the public Site entry
point; enabled guest links now work without sign-in. Private trip data and editing
remain protected by the application's server-side authorization.

## Project plan

See [Waypoint — Night Market: current design direction and visual references](docs/design-night-market.md) for the photo-inspired visual system, responsive layouts, reusable tokens, and interaction guidance. Start there before changing the planner's design. Two earlier studies are kept for comparison: [Departure Board](docs/design.md) and [Field Atlas](docs/design-field-atlas.md).

See [the product brief, architecture, and implementation plan](docs/plan.md) for confirmed requirements, proposed behavior, open decisions, and acceptance criteria.

The first release gate is deciding the China-use mode and testing the actual travel connections. A saved-file/phone trial and external-user check remain required. Review the parallel-stay board before extending full trip editing and maps.
