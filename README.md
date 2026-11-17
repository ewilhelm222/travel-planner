# Travel Planner

A private, collaborative travel planner for trips with family and friends. Plan stays, connecting journeys, and daily activities through a shared board and maps, with views for different travelers.

## Status

The planner supports multiple trips and events, independent dated activities,
unscheduled ideas, optional activity choices, participant filters, JSON
import/export, offline reading, organizer-managed guest links, and a traveler
roster with family/group and individual activity assignments. The adopted visual
system, also used by the published interface, is **Night Market**.

Merged into `main` (November 12–15, 2026): **drag-and-drop** moves on desktop
and phone, the **schedule-first** phone layout, and **editors** the organizer
can add by sign-in email.

Merged and deployed on November 15, 2026 (Pacific time; see
[release provenance](docs/multi-events.md#release-provenance)): [the safety net](docs/safety-net.md) (History, undo, remove, delete
and restore a trip, full backup), [editing places, stays and
journeys](docs/structure.md), [per-record
revisions](docs/per-record-revisions.md), [moving a stay with a
preview](docs/stay-move.md), [schematic maps](docs/maps.md), and [layout
changes](docs/layout.md). Built on November 16 from the
[family feedback plan](docs/feedback-2026-11-15-plan.md) and not yet deployed:
[sign-in and read-only messages](docs/getting-in.md),
[plain wording](docs/plain-words.md), [dark forms](docs/dark-forms.md),
[Add and Ideas within reach](docs/within-reach.md), [Ideas beside the
days](docs/ideas-column.md), and [one Manage menu and a sideways-phone
layout](docs/landscape-and-menu.md). Built after that and not yet deployed:
[a shorter activity form](docs/quick-add.md), [timing levels](docs/timing.md),
and [all days in one scroll on phones](docs/all-days.md). Built on November 17 and not yet deployed:
[five additions](docs/release-nov17.md) (stay information for the group,
two-level places, add between cards, flick between days, pictures on cards). A daily automatic backup is
[proposed](docs/backup-proposal.md) and not enabled.

[Open the planner](https://travel-planner-ewilhelm-prototype.tortuga-1566.chatgpt.site) · [Current implementation and access status](docs/multi-events.md) · [What is deployed](docs/multi-events.md#release-provenance) · [Managing travelers](docs/travelers.md) · [Drag-and-drop](docs/drag-drop.md) · [Schedule-first phone layout](docs/schedule-first.md) · [Editors and what they may change](docs/editors.md) · [Source](apps/sites-prototype)

The tentative China draft and Camp Earnest event are stored in the private app,
with synthetic additions labeled. Real itinerary datasets and guest-link tokens
are excluded from this repository. The organizer approved the public Site entry
point; enabled guest links now work without sign-in. Private trip data and editing
remain protected by the application's server-side authorization.

## Project plan

See [Waypoint — Night Market: current design direction and visual references](docs/design-night-market.md) for the photo-inspired visual system, responsive layouts, reusable tokens, and interaction guidance. Start there before changing the planner's design. Two earlier studies are kept for comparison: [Departure Board](docs/design.md) and [Field Atlas](docs/design-field-atlas.md).

See [the product brief, architecture, and implementation plan](docs/plan.md) for confirmed requirements, proposed behavior, open decisions, and acceptance criteria.

The first release gate is still deciding the China-use mode and testing the actual travel connections. A saved-file/phone trial, an external-user check and a backup-restore trial on the hosted Site remain required. None of the work above changes that, and nothing here claims China readiness.
