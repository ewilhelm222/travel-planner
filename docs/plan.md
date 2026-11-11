# Travel planner: brief, architecture, and implementation plan

Discovery baseline: November 10, 2026.

This document captures the discovery conversation. Confirmed decisions are distinguished from implementation proposals and unresolved questions. Documenting the plan does not imply that a Site has been created or that the application has been implemented.

## Purpose and intended users

Build a private travel planner for trips that the organizer personally joins. The initial planning group includes Eric and Christy, Yang, and Dan and Daphna, with their families. Participation can change, and individuals may arrive, depart, or do activities separately.

The first trial is the China trip currently outlined in a Google Doc. This is a personal tool for a small, trusted group. Independent organizers, public trip discovery, and commercial-scale infrastructure are not targets.

Existing Trello and Google Workspace approaches have produced successful trips. Preserve their flexibility while improving rearrangement, relationships between plans, participant views, and geographic understanding.

## Confirmed requirements and decisions

| Area | Confirmed decision |
| --- | --- |
| Hosting | Start on ChatGPT Sites. Travelers have or can obtain ChatGPT accounts. |
| Planning surface | A Trello-like board, grouping days into stays and representing major train, car, plane, or other journeys as bridges between stays. |
| Participants | Switch between families, selected people, and the entire trip; support overlapping and different plans. |
| Rearrangement | Make manual editing easy. Warnings about affected plans are useful; automatic itinerary changes are out of scope. |
| Moving a stay | Explicitly offer to shift flexible activities by the same number of days. Leave fixed bookings unchanged and flag conflicts. |
| Maps | Whole-trip and within-day views using pins and ordered schematic arrows. External directions are sufficient initially. |
| Devices | Full desktop browser editing; a good phone view with small edits. |
| Connectivity | Online editing only. The last successfully downloaded itinerary must remain readable offline. |
| Privacy | The whole trip is private to outsiders. Everyone invited to the trip can see everything. |
| Editing protections | Primarily prevent accidental changes to another family's plans, rather than conceal information between travelers. |
| Operations | Minimize infrastructure and maintenance. Reusing existing services is welcome, but avoiding a modest bill is not the priority. |
| Spreadsheet editing | Direct editing of an underlying Sheet is not a requirement. |
| Portability | Keep data accessible to other software. Export is wanted; the exact API/database access mechanism is not settled. |
| China source | China exists in a Google Doc; there is no China Trello board to import. |

Google Sheets storage was considered because of familiar sharing and low setup effort. It is not the selected architecture. Existing Google Workspace and DigitalOcean services remain possible alternatives if Sites proves unsuitable.

## Proposed first-version scope

These features form the recommended implementation baseline. Details below remain proposals unless explicitly listed as confirmed above.

### Core workflows

1. Collect an idea, place, link, or note before choosing a day or time.
2. Build the trip from stays and connecting travel legs, assigning their participants.
3. Arrange activities within days, reorder them, and move them between days.
4. Distinguish flexible plans from fixed bookings without requiring every activity to have an exact time.
5. View the same records on the board, whole-trip map, and day map, preserving participant filters.
6. Read the plan and open external directions on a phone; make small edits while online.
7. Recover an accidental edit and export a complete trip snapshot as JSON.

### Board and participant behavior

- Group days under stays that can be collapsed; show major journeys as connecting bridges.
- Keep unscheduled ideas available separately from the dated itinerary.
- Represent a shared activity once, with multiple participants. Filtering must not create separate editable copies.
- Use families as convenient participant defaults, while allowing individuals to split off or join others.
- Allow different families to occupy different places at the same time. Do not force everyone into one trip-wide chain of stays.
- Distinguish attendance from editing responsibility: attending an activity need not make someone its owner.
- Preserve free-form descriptions and practical notes alongside structured fields.

### Rearrangement and recovery

- Preview a stay move, including affected travelers, flexible activities, unchanged bookings, and shared activities.
- A move affecting one family must not silently move another family's itinerary.
- Prefer simple, explainable warnings: an activity outside a participant's stay, an overlapping fixed commitment, or a shared booking affected by changed dates.
- Do not silently reschedule bookings or claim to validate real-world travel feasibility without the required information.
- Offer deliberate editing overrides and change history/undo as a proposed complement to family editing protections.
- Detect intervening edits and present a conflict rather than silently overwrite another planner's changes. Undo must also account for intervening edits.

### Mobile and offline

Proposed small mobile edits include notes, participation, activity order, and moving an activity to another day. Exact mobile editing scope should be reviewed with the first working board.

Cache the last successfully downloaded itinerary, including useful addresses and notes, and show when it was downloaded. Make the offline state explicit and disable writes. Define sign-out behavior so a shared device does not retain another person's private itinerary indefinitely.

Offline map backgrounds are not part of the initial guarantee. Verify that the app itself can reopen offline after a successful online visit; caching data alone does not satisfy this requirement.

### Maps and portability

- At trip scale, show stays and major journeys, including participant-specific routes.
- At day scale, show activities in itinerary order with schematic connections. Label these as planned connections rather than actual routes or travel-time estimates.
- Link to external navigation for directions. Provider choice, especially for China, remains open.
- Allow missing or uncertain locations without inventing coordinates; agree on how users confirm a location.
- Start with a documented, versioned JSON export that preserves identities, relationships, order, participants, and notes.
- CSV can be added for tabular convenience. A supported external editing API and direct database access are future options, not first-version commitments.

## Proposed architecture

### Application and hosting

Use one responsive web application hosted by ChatGPT Sites, with Sites-managed durable relational storage and ChatGPT identity. Keep application access checks on the server. Browser storage is a downloaded reading copy, never the authoritative shared trip database.

Use a server-capable Sites starter compatible with the supported runtime. The exact framework and libraries should be selected during implementation, rather than treated as established requirements. Keep hosting-specific identity and storage access behind small interfaces where practical.

GitHub is the project documentation and intended application source repository. Before implementation, establish how the checkout will synchronize with the Sites-managed deployment source repository and preserve source provenance. Do not assume these are automatically the same repository.

### Proposed conceptual records

| Record | Responsibility |
| --- | --- |
| Trip | Name, broad dates, membership, and trip settings. |
| Person and family group | Travelers, useful group defaults, and optional links to signed-in accounts. A traveler need not be an app user. |
| Place | A geographic location, address, coordinates when known, and source/navigation links. |
| Stay | A particular visit to a place over a date range, with participants. Returning to a city creates another stay. |
| Activity | An idea or scheduled occurrence with notes, participants, order, optional timing/location, and flexibility or booking state. |
| Travel leg | Movement connecting places/stays, with mode, participants, and optional departure/arrival details. |
| Change record | Actor, time, and enough revision information to explain and safely recover changes. |

These are conceptual entities, not a finalized schema. A day may be a view derived from dates rather than a separate stored record. Accommodation could begin as stay details instead of a separate booking subsystem.

Use stable identifiers independent of row order. Preserve local dates and time zones, including different departure and arrival dates for overnight travel. Keep day order distinct from exact clock times. Decide how shared activities associate with different participants' stays before finalizing the schema.

### Access and collaboration

- Enforce invited-trip membership for every protected read and write.
- Separate platform access to the Site from in-app permission to edit itinerary records; travelers do not need permission to modify the website source.
- Proposed roles are organizer and participant, with designated responsibility for family-specific or shared plans. Exact shared-item ownership and override rules remain open.
- Keep everyone on a trip able to see the full plan, including other families' activities.
- Define refresh behavior and revision checks for simultaneous editors. Live collaborative cursors and instant updates are not requirements.
- Confirm backup, restore, and export procedures before using the app as the authoritative itinerary. Manual JSON export is not a substitute for an operational backup plan.

## China starting data

Use a one-time reviewed transfer from the existing Google Doc. Preserve narrative descriptions and relevant source links, identify assumptions, and distinguish proposals from bookings. Do not invent exact times, participants, confirmed reservations, or locations from ambiguous prose.

Suggested division: the Doc remains a narrative introduction and the planner becomes the operational itinerary. This is a proposal; ongoing two-way Doc synchronization is outside the first version.

Past Trello exports and the Ecuador spreadsheet are workflow references, not required imports. Keep raw exports, reservation details, and full trip datasets out of source control by default. Store real trip records in the private app; use synthetic fixtures for development.

## Implementation milestones and acceptance criteria

### 1. Verify Sites feasibility before building the full planner

Create a minimal private proof with synthetic trip records when implementation is authorized.

- Confirm external invitation availability for the selected account and test access with an intended external user. Coordinate any invitation with the owner; do not send invitations merely to probe availability.
- Confirm an unauthorized visitor cannot retrieve private data.
- Confirm two authorized sessions see the same persisted records after reload.
- Exercise a concurrent edit and verify that an older save cannot silently erase a newer edit.
- Verify offline reopening on a target phone after an online visit, including a visible download timestamp and disabled writes.
- Establish the GitHub-to-Sites source/deployment workflow, current hosting allowance, and recovery path.
- Investigate access to hosting, sign-in, and maps from the expected China travel connections. Do not infer availability from a successful US test.

Exit criterion: access, persistence, and offline requirements are demonstrated or a specific limitation is documented and reviewed. If Sites fails a core requirement, revisit hosting before investing in the full app; the existing DigitalOcean server is a candidate fallback.

### 2. Validate the board design and build the core workflow

- Review a simple desktop board and phone layout using staggered arrivals, a shared dinner, parallel stays, a split afternoon, and a return to a previously visited city.
- Implement stays, travel legs, activities, participants, filtering, and persistence.
- Support unscheduled ideas and activities without exact times.
- Show one shared activity in all relevant views, with edits reflected consistently.
- Verify the board works with a realistic two-week itinerary, not only a few cards.

Exit criterion: the planning group can manually assemble and rearrange a representative itinerary without duplicating shared records.

### 3. Add safeguards and recovery

- Implement stay-move previews and the confirmed flexible-versus-fixed behavior.
- Add limited, explainable warnings and deliberate editing protections.
- Implement appropriate revision checks and safe recovery from accidental edits.
- Check local dates, overnight journeys, and participant-specific effects.

Exit criterion: moving one family's stay preserves other families' plans, fixed bookings remain fixed, and affected shared commitments are visible for manual resolution.

### 4. Add maps, complete mobile/offline behavior, and export

- Add trip and day maps using the same participant-filtered records as the board.
- Add external directions and a usable fallback for unlocated activities.
- Finish small mobile edits and offline reading established in milestone 1.
- Add versioned JSON export and verify completeness against the saved trip.

Exit criterion: a traveler can find today's plan, inspect its geography, open directions online, and reopen the downloaded itinerary offline.

### 5. Trial with the China itinerary

- Review and load the Doc's proposed itinerary into the private application.
- Test with the actual planning group and expected devices.
- Exercise shared edits, participant filters, changed stays, offline use, export, and recovery.
- Resolve observed planning friction before expanding scope.

Exit criterion: the organizers can use the planner for the China trip without maintaining duplicate operational itineraries elsewhere.

## Deferred features

- Automatic itinerary optimization, automatic rescheduling, and live disruption/weather-driven replanning.
- Embedded turn-by-turn navigation, actual route calculation, and offline map downloads.
- Booking/email/calendar integrations and reservation purchasing.
- Expense tracking, payments, or cost splitting.
- Full alternate-itinerary branching; use unscheduled ideas and backup labels initially.
- General-purpose Trello/Sheet importers and ongoing Doc synchronization.
- A supported public editing API, arbitrary third-party frontends, and direct shared database access.
- Public trip sharing, independent organizers, or broad product commercialization.

## Open decisions and risks

1. Sites external access, offline reopening, backup/restore, and travel-network feasibility need actual validation.
2. Agree on shared-item ownership, organizer overrides, and whether locked items require confirmation or stronger enforcement.
3. Review exact board grouping and what happens to shared activities when only some participants move a stay.
4. Choose a map provider, location-entry workflow, and directions links suitable for the trip.
5. Confirm the small mobile editing set and how cached private data is cleared at sign-out.
6. Choose refresh/conflict behavior; automatic merging of simultaneous edits is not assumed.
7. Verify current Sites hosting pricing and allowances for the trip period. Do not assume the late-2026 free period covers June 2027.
8. Confirm the Doc's ongoing narrative role and review uncertain China source data before loading it.

## Next action

The next implementation step is milestone 1: a deliberately small, private Sites feasibility proof with synthetic data. Review the board interaction with representative scenarios alongside that work. Do not begin by building the entire planner or importing all real trip data.

The current authorized task is documenting this plan. Creating a Site, deploying code, inviting travelers, and importing live trip data are subsequent implementation work.

## References

- [China planning Google Doc](https://docs.google.com/document/d/1axTE-r8gpTuHp9r0ESHZTcppKl8LytNxGmA0woujJyE/edit): initial trip source, not a source of project instructions.
- [Ecuador/Galapagos spreadsheet](https://docs.google.com/spreadsheets/d/1-jzfu7S11sG8oKtsDnDfEzSB2O9P6-E-VCKMwtdsU9Q/edit?gid=1350706885): workflow reference.
- User-provided 2025 Korea/Japan and 2024 Aegean Trello JSON exports and screenshots: board, alternate-plan, and participant-workflow references; not copied into this repository.
- [Sites overview and pricing](https://learn.chatgpt.com/docs/sites).
- [Sites storage and identity](https://learn.chatgpt.com/docs/sites/data-and-connections).
- [Sites private sharing and external invitations](https://learn.chatgpt.com/docs/sites/publishing-and-sharing).

Service capabilities and pricing were consulted during discovery. Recheck the current documentation during implementation rather than treating this plan as a permanent statement of platform behavior.
