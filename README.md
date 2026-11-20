# Travel Planner

A private, collaborative travel planner for trips with family and friends. Plan stays, connecting journeys, and daily activities through a shared board and maps, with views for different travelers.

## Status

The planner supports multiple trips and events, independent dated activities,
unscheduled ideas, optional activity choices, participant filters, JSON
import/export, offline reading, organizer-managed guest links, and a traveler
roster with family/group and individual activity assignments. The adopted visual
system, also used by the published interface, is **Night Market**.

Live application: **saved version 27**, deployed November 19, 2026, from
GitHub app commit `62c5bf52aa97fb7a92f151765e1d6b94a92b3276`; offline shell
**v53**, runtime revision **2**. Documentation merges do not redeploy the Site.
See [release history and verification limits](docs/releases/README.md).

Deployed features include History/undo and manual backup, structure editing,
per-record revisions, stay-move previews, maps, schedule-first phone controls,
short activity forms, All days, pictures and two-level places. Later releases
added browser-side weather, full weather tooltip text, the description-first
activity view, and [travel bridges](docs/travel-bridge.md). A daily automatic
backup remains [proposed](docs/backup-proposal.md) and is not enabled.

Desktop organizer/guest checks are documented per release. Physical phones,
touch dragging, screen-reader behavior and travel connectivity remain open;
failed viewport overrides do not count as phone verification.

[Open the planner](https://travel-planner-ewilhelm-prototype.tortuga-1566.chatgpt.site) · [Current implementation and access status](docs/multi-events.md) · [What is deployed](docs/multi-events.md#release-provenance) · [Managing travelers](docs/travelers.md) · [Drag-and-drop](docs/drag-drop.md) · [Schedule-first phone layout](docs/schedule-first.md) · [Editors and what they may change](docs/editors.md) · [Source](apps/sites-prototype)

The tentative multi-area draft and the single-stay event are stored in the private app,
with synthetic additions labeled. Real itinerary datasets and guest-link tokens
are excluded from this repository. The organizer approved the public Site entry
point; enabled guest links now work without sign-in. Private trip data and editing
remain protected by the application's server-side authorization.

## Project plan

See [Waypoint — Night Market: current design direction and visual references](docs/design-night-market.md) for the photo-inspired visual system, responsive layouts, reusable tokens, and interaction guidance. Start there before changing the planner's design. Two earlier studies are kept for comparison: [Departure Board](docs/design.md) and [Field Atlas](docs/design-field-atlas.md).

See [the product brief, architecture, and implementation plan](docs/plan.md) for confirmed requirements, proposed behavior, open decisions, and acceptance criteria.

The first release gate is still deciding the China-use mode and testing the actual travel connections. A saved-file/phone trial, an external-user check and a backup-restore trial on the hosted Site remain required. None of the work above changes that, and nothing here claims China readiness.
