# Travel Planner

A private, collaborative travel planner for trips with family and friends. Plan stays, connecting journeys, and daily activities through a shared board and maps, with views for different travelers.

## Status

The planner now supports multiple trips and events, independent dated activities,
unscheduled ideas, optional activity choices, participant filters, a phone agenda,
JSON import/export, offline reading, and organizer-managed guest links. The adopted
visual system is **Departure Board**.

[Open the planner](https://travel-planner-ewilhelm-prototype.tortuga-1566.chatgpt.site) · [Current implementation and access status](docs/multi-events.md) · [Source](apps/sites-prototype)

The tentative China draft and Camp Earnest event are stored in the private app,
with synthetic additions labeled. Real itinerary datasets and guest-link tokens
are excluded from this repository. Anonymous hosted access is awaiting explicit
approval of the Site's public entry point; private planning is already deployed.

## Project plan

See [Waypoint — Departure Board: current design direction and visual references](docs/design.md) for the photo-inspired visual system, responsive layouts, reusable tokens, and interaction guidance. Start there before changing the planner's design.

See [the product brief, architecture, and implementation plan](docs/plan.md) for confirmed requirements, proposed behavior, open decisions, and acceptance criteria.

The first release gate is deciding the China-use mode and testing the actual travel connections. A saved-file/phone trial and external-user check remain required. Review the parallel-stay board before extending full trip editing and maps.
