# Dark forms

Status: November 16, 2026. Built and checked locally with synthetic data; deployed in version 13. Styles only: no data, saving or access change. Step "PR 3" of the
[feedback plan](feedback-2026-11-15-plan.md) (item D1). The organizer chose
"forms only" on November 16. See [release history](releases/README.md) for dated live checks and remaining limits.

The Add activity form used to switch the whole phone screen from dark purple to
cream. Dialogs you type into are now dark: the activity form, travelers and
groups, places, stays and journeys (including the stay-move preview), trip
details, new trip, import, and editors. Dialogs you read stay cream: History,
the guest link and its preview, archived trips, and the guest's activity
detail.

How: those six dialogs carry the class `form-dialog`; the rules are at the end
of `public/planner.css` and use existing Night Market tokens. Message boxes
inside dark forms keep their coloured left edge on a dark fill. The offline
shell cache is `waypoint-shell-v24`.

Checks: `npm test` 111 pass (1 new in `tests/dark-forms.test.mjs`). Headless
Chromium at 390 × 844 and 1440 × 900 opened every form and reading dialog,
including a fixed booking (disabled day and time), the stay-move preview and
the travelers panel: no script errors. Contrast figures are in the
[design guide amendment](design-night-market.md#amendment--november-16-2026).

Not verified: a physical phone at night, the hosted Site, 200% zoom, and the
native date picker and select menus on iOS and Android, which the browser draws
itself.
