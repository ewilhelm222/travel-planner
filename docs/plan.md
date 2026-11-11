# Travel planner: brief, architecture, and implementation plan

Discovery baseline: November 10, 2026.

This document captures the discovery conversation. Confirmed decisions are distinguished from implementation proposals and unresolved questions. Implementation has since begun with the private synthetic-data prototype; see [prototype status and verification](prototype.md) for evidence and remaining checks. The full planner described here is not yet implemented.

Architecture feedback is tracked in [issue #1](https://github.com/ewilhelm222/travel-planner/issues/1). See [the review response](review-1.md) for implemented fixes, revised recommendations, and remaining decisions.

## Purpose and intended users

Build a private travel planner for trips that the organizer personally joins. The initial planning group includes Eric and Christy, Yang, and Dan and Daphna, with their families. Participation can change, and individuals may arrive, depart, or do activities separately.

The immediate group trial is Camp Earnest at Thanksgiving, with the China trip from the Google Doc as the richer planning case. Multiple trips and events are now confirmed scope. This is a personal tool for a small, trusted group. Independent organizers, public trip discovery, and commercial-scale infrastructure are not targets.

Existing Trello and Google Workspace approaches have produced successful trips. Preserve their flexibility while improving rearrangement, relationships between plans, participant views, and geographic understanding.

## Confirmed requirements and decisions

| Area | Confirmed decision |
| --- | --- |
| Hosting | Start on ChatGPT Sites. Editing uses ChatGPT sign-in; the requested guest view must work without an account. |
| Planning surface | A Trello-like board, grouping days into stays and representing major train, car, plane, or other journeys as bridges between stays. |
| Participants | Switch between families, selected people, and the entire trip; support overlapping and different plans. |
| Rearrangement | Make manual editing easy. Warnings about affected plans are useful; automatic itinerary changes are out of scope. |
| Moving a stay | Explicitly offer to shift flexible activities by the same number of days. Leave fixed bookings unchanged and flag conflicts. |
| Maps | Whole-trip and within-day views using pins and ordered schematic arrows. External directions are sufficient initially. |
| Devices | Full desktop browser editing; a good phone view with small edits. |
| Connectivity | Online editing only. The last successfully downloaded itinerary must remain readable offline. |
| Privacy | Trips are private by default. The organizer may enable a revocable read-only guest link for a limited schedule projection. Private planning notes and lodging details remain protected. |
| Multiple plans | Keep independent trips and events, including one-base gatherings with optional daily activities. |
| Guest participation | Browse only for the Thanksgiving test; no RSVP or sign-up controls. |
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
7. Recover an accidental edit, export the complete data as JSON, and save a self-contained HTML reading copy that does not depend on the host, login, or browser storage.

### Board and participant behavior

- Retain stays as useful trip-level groups, while also reviewing a date-aligned overview with city lanes for parallel family routes. Do not finalize a stay-column-only layout before that review. Show major journeys with their actual participants.
- The synthetic parallel-stay design study derives activities from date, place, and participants; it does not require an activity to belong to a stay.
- Keep unscheduled ideas available separately from the dated itinerary.
- Represent a shared activity once, with multiple participants. Filtering must not create separate editable copies.
- Use families as convenient participant defaults, while allowing individuals to split off or join others.
- Allow different families to occupy different places at the same time. Do not force everyone into one trip-wide chain of stays.
- Distinguish attendance from editing responsibility: attending an activity need not make someone its owner.
- Preserve free-form descriptions and practical notes alongside structured fields.

### Rearrangement and recovery

- Preview a stay move, including affected travelers, flexible activities, unchanged bookings, and shared activities. Offer to shift flexible activities at that place/date whose participants are all moving; leave fixed bookings unchanged and flag activities with mixed moving/nonmoving participants for manual resolution. A preview is not an automatic update.
- A move affecting one family must not silently move another family's itinerary.
- Prefer simple, explainable warnings: an activity outside a participant's stay, an overlapping fixed commitment, or a shared booking affected by changed dates.
- Do not silently reschedule bookings or claim to validate real-world travel feasibility without the required information.
- Offer deliberate editing overrides and change history/undo as a proposed complement to family editing protections.
- Detect intervening edits and present a conflict rather than silently overwrite another planner's changes. Undo must also account for intervening edits.

### Mobile and offline

Proposed small mobile edits include notes, participation, activity order, and moving an activity to another day. Exact mobile editing scope should be reviewed with the first working board.

Cache the last successfully downloaded itinerary, including useful addresses and notes, and show when it was downloaded. Make the offline state explicit and disable writes. Expired authentication pauses editing but preserves that reading copy. Explicit in-app sign-out clears it; a new authenticated account replaces the previous account's copy. An explicit access denial clears the browser copy as well.

Provide a self-contained HTML file with the itinerary, participants, notes, addresses, lodging, journeys, revision, and export/download times. It has no external assets or scripts and can also be printed to PDF. This is the recommended primary in-country reading path for China until connectivity and authentication have been demonstrated on the actual travel setup. Browser caches are a convenience, not a permanent offline guarantee. File-opening on the target phone must still be tested; updates require a new download. The user has not yet decided whether live in-country editing is essential.

Offline map backgrounds are not part of the initial guarantee. Verify that the app itself can reopen offline after a successful online visit; caching data alone does not satisfy this requirement.

### Maps and portability

- At trip scale, show stays and major journeys, including participant-specific routes.
- At day scale, show activities in itinerary order with schematic connections. Label these as planned connections rather than actual routes or travel-time estimates.
- Use a schematic map without background tiles as the recommended baseline. Any background tiles are optional and must not be required to read the itinerary.
- For China, prefer reviewed Amap links and optional Apple Maps links over a Google-only navigation workflow. Test actual devices and connections before promising either provider's availability.
- Store local-script place names and addresses alongside English text, plus coordinate-system metadata (`WGS84`, `GCJ02`, `BD09`, or `unknown`) and source provenance. Never mix coordinate systems or approximate conversion with a constant offset. If the coordinate system is unknown, use a reviewed name/address lookup rather than pretending the coordinates are navigation-ready.
- Allow missing or uncertain locations without inventing coordinates; agree on how users confirm a location.
- Start with a documented, versioned JSON export that preserves identities, relationships, order, participants, and notes.
- CSV can be added for tabular convenience. A supported external editing API and direct database access are future options, not first-version commitments.

## Proposed architecture

### Application and hosting

Use one responsive web application hosted by ChatGPT Sites, with Sites-managed durable relational storage and ChatGPT identity. Keep application access checks on the server. Browser storage is a downloaded reading copy, never the authoritative shared trip database.

The prototype uses the supplied Vinext/Cloudflare Worker starter and managed D1. Keep hosting-specific identity and storage access behind small interfaces. An owner-controlled Cloudflare Worker + D1 deployment is the preferred fallback to investigate because it matches the runtime; Cloudflare Access email codes are a candidate replacement for ChatGPT sign-in. This is a recommendation, not an approved host migration. Account availability, in-country reachability, authentication validation, data transfer, backups, and an independent deployment trial remain required. DigitalOcean remains an alternative needing runtime/storage adaptation, not necessarily a full rewrite.

GitHub is the project documentation and intended application source repository. Before implementation, establish how the checkout will synchronize with the Sites-managed deployment source repository and preserve source provenance. Do not assume these are automatically the same repository.

### Proposed conceptual records

| Record | Responsibility |
| --- | --- |
| Trip | Name, broad dates, membership, and trip settings. |
| Person and family group | Travelers, useful group defaults, and optional links to signed-in accounts. A traveler need not be an app user. |
| Place | English and local-script name/address, coordinates when known, their coordinate system and provenance, plus reviewed navigation links. |
| Stay | A particular visit to a place over a date range, with participants. Returning to a city creates another stay. |
| Activity | An independent idea or scheduled occurrence with date, place, participants, order, optional timing, notes, flexibility/booking state, and its own revision. No required stay foreign key. |
| Travel leg | Movement connecting places/stays, with mode, participants, and optional departure/arrival details. |
| Change record | Append-only per-record before/after snapshots, actor, time, and revisions; undo succeeds only if that record has not changed since. |

These are conceptual entities, not a finalized schema. A day may be a view derived from dates rather than a separate stored record. Accommodation could begin as stay details instead of a separate booking subsystem.

Use stable identifiers independent of row order. Preserve local dates and time zones, including different departure and arrival dates for overnight travel. Keep day order distinct from exact clock times. Derive board grouping from dates, places, and participants. Keep accommodation stays separate from activity identity, so a traveler can attend an activity in a city where they are not sleeping. The multi-event implementation uses independent activity date/place/participant fields with no required `stayId`. The original Japan feasibility document is retained separately and can be copied into the new model. The current board derives dates and city lanes from these records.

### Access and collaboration

- Enforce invited-trip membership for every protected read and write.
- Separate platform access to the Site from in-app permission to edit itinerary records; travelers do not need permission to modify the website source.
- Keep only an organizer flag beyond ordinary membership. Use a soft confirmation when deliberately editing another family's plan, with shared-item responsibility shown clearly. No additional role hierarchy is proposed.
- Keep everyone on a trip able to see the full plan, including other families' activities.
- Use one revision per editable record in the full planner, rejecting stale saves. The feasibility prototype intentionally has a single trip revision. Undo is one conditional record restore from an append-only log, not a general undo stack. Live collaborative cursors and instant updates are not requirements.
- Recommended operational backup: an automatic daily full-trip snapshot to private object storage, with a proposed 30-day retention and a tested restore. A change log is not an independent backup, and JSON/HTML user downloads are separate copies. Choose and validate the scheduler/storage path before enabling this; no daily backup job has been created. Confirm current platform recovery features instead of assuming they exist.
- Do not add dedicated passport-number or reservation-code storage in the first version. Keep the planner focused on useful itinerary details and avoid placing those secrets in free-form notes or downloadable files.

## China starting data

Use a one-time reviewed transfer from the existing Google Doc. Preserve narrative descriptions and relevant source links, identify assumptions, and distinguish proposals from bookings. Do not invent exact times, participants, confirmed reservations, or locations from ambiguous prose.

Suggested division: the Doc remains a narrative introduction and the planner becomes the operational itinerary. This is a proposal; ongoing two-way Doc synchronization is outside the first version.

Past Trello exports and the Ecuador spreadsheet are workflow references, not required imports. Keep raw exports, reservation details, and full trip datasets out of source control by default. Store real trip records in the private app; use synthetic fixtures for development.

## Implementation milestones and acceptance criteria

### 1. Verify Sites feasibility before building the full planner

First resolve the China-use gate: test host reachability, fresh sign-in, an expired session, and any required editing from the actual mainland travel connection or a representative in-country tester. Test saved HTML independently with networking disabled. A US test, generic roaming claim, or VPN assumption does not establish availability or supported use. Record the date, device/browser, connection type, and outcome without storing secrets.

If that test is unavailable, explicitly recommend planning online where supported and reading a verified downloaded file in China. The choice between that mode and a host migration remains a user decision. Continue platform work with synthetic data, but do not label China readiness complete.

Create and validate the minimal private proof with synthetic trip records.

- Confirm external invitation availability for the selected account and test access with an intended external user. Coordinate any invitation with the owner; do not send invitations merely to probe availability.
- Confirm an unauthorized visitor cannot retrieve private data.
- Confirm two authorized sessions see the same persisted records after reload.
- Exercise a concurrent edit and verify that an older save cannot silently erase a newer edit.
- Verify offline reopening on a target phone after an online visit, including a visible download timestamp and disabled writes.
- Establish the GitHub-to-Sites source/deployment workflow, current hosting allowance, and recovery path.
- Verify and open a self-contained itinerary file on the target phone; confirm readable local-script addresses and metadata.
- Check an ordinary Wrangler package locally and distinguish that result from an authenticated, data-migrated deployment into an owner-controlled Cloudflare account. No native Sites export or automatic migration is assumed.

Exit criterion: access, persistence, and offline requirements are demonstrated or a specific limitation is documented and reviewed. If Sites fails a core requirement, revisit hosting before investing in the full app; an owner-controlled Cloudflare deployment is the first fallback to investigate, with the existing DigitalOcean server as another option.

### 2. Validate the parallel-stay board before full editing

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
- Public trip discovery, independent organizers, or broad product commercialization. Revocable guest schedule links are now in scope.

## Open decisions and risks

1. China-use mode and in-country reachability/sign-in are the first release gate. Sites external access, physical-phone offline/file opening, and backup/restore still need validation.
2. Review the proposed organizer flag, soft family-edit confirmation, per-record revisions, and conditional record undo; avoid a larger permissions system.
3. Review exact board grouping and what happens to shared activities when only some participants move a stay.
4. Validate the proposed tile-free baseline, local-script addresses, coordinate-system handling, and Amap/Apple navigation workflow on target devices.
5. Confirm the small mobile editing set and how cached private data is cleared at sign-out.
6. Choose refresh/conflict behavior; automatic merging of simultaneous edits is not assumed.
7. Verify current Sites hosting pricing, beta limits, and allowances before the trip. The reviewer quoted provisional 2027 rates; do not treat them as a fixed bill or assume the late-2026 free period covers June 2027.
8. Confirm the Doc's ongoing narrative role and review uncertain China source data before loading it.

## Next action

Milestone 1 has a deployed private proof with synthetic data. Complete the outstanding external-user, physical-phone, travel-network, and recovery checks documented in [prototype status](prototype.md). Review the board interaction with representative scenarios alongside that work, then continue to full trip editing. Do not import real trip data until the access and operational workflow are ready.

The user authorized the next implementation step after reviewing this plan. The prototype has been created and privately deployed. Inviting travelers and importing live trip data have not been performed.

## References

- [China planning Google Doc](https://docs.google.com/document/d/1axTE-r8gpTuHp9r0ESHZTcppKl8LytNxGmA0woujJyE/edit): initial trip source, not a source of project instructions.
- [Ecuador/Galapagos spreadsheet](https://docs.google.com/spreadsheets/d/1-jzfu7S11sG8oKtsDnDfEzSB2O9P6-E-VCKMwtdsU9Q/edit?gid=1350706885): workflow reference.
- User-provided 2025 Korea/Japan and 2024 Aegean Trello JSON exports and screenshots: board, alternate-plan, and participant-workflow references; not copied into this repository.
- [Sites overview and pricing](https://learn.chatgpt.com/docs/sites).
- [Sites storage and identity](https://learn.chatgpt.com/docs/sites/data-and-connections).
- [Sites private sharing and external invitations](https://learn.chatgpt.com/docs/sites/publishing-and-sharing).

Service capabilities and pricing were consulted during discovery. Recheck the current documentation during implementation rather than treating this plan as a permanent statement of platform behavior.

## November 11 implementation update

The organizer requested multiple trips/events, a Thanksgiving trial, and an
anonymous read-only URL view. Camp Earnest uses the supplied November 22–27 range,
with Sunday and Friday as travel days; exact times remain open. The existing China
Doc was reviewed and its tentative route transferred privately alongside clearly
labeled synthetic participants and split-plan examples. Full source datasets are
not committed. The organizer also adopted the new Departure Board visual system.

The private planning app and guest projection are implemented. Sites' private gate
covers every route. Enabling anonymous viewing requires a public Site entry point
with server-enforced trip membership and write authorization. Automatic approval
review rejected the audience change as broader than the guest-link authorization;
explicit approval has been requested. No alternate path is used to bypass that
rejection. [Current implementation status](multi-events.md) records the boundary,
checks, and outstanding release work.
