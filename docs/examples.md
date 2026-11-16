# Keeping or removing examples

Status: November 16, 2026. Built and checked locally with synthetic data; not
deployed. No database migration; no stored trip is rewritten. Step "PR 8" of
the [feedback plan](feedback-2026-11-15-plan.md) (item X2).

Until now an invented item ("Example · not a real plan") kept its label
forever, even after someone corrected it, and examples could only be deleted
one at a time.

## What changed

- **Keep as a real plan.** Open an example (or a "Tentative" item) and choose
  this button. The label goes, the card looks like any other, and it is shown
  on the guest link from then on. Nothing else about the item changes. Save any
  other edits first; the button does not save what you typed in the form.
- **Remove all examples…** sits beside **Hide examples** (under the board; on a
  phone under Plan & manage). It asks first, says how many, and removes every
  example in one step. Real plans and "Tentative" items are not touched.
- Both are in **History** ("Kept “…” as a real plan", "Removed N examples") and
  can be undone there. Undoing the removal puts every example back where it
  was.

Editors may do both, as they may already edit or delete these items.

## How it works

Two new save actions, `confirm` and `examples-remove`, go through the same
logged, per-record-checked path as every other save. The bulk removal names
every card it relies on, so a page that is out of date is refused instead of
removing something that has since changed. An item's kind still cannot be
changed through an ordinary edit. The offline shell cache is
`waypoint-shell-v30`.

## Checks

- `npm test`: 126 pass (3 new in `tests/examples.test.mjs`), including undo of
  a ten-item removal restoring the trip exactly.
- `npm run test:api` and `npm run test:access` pass locally.
- Headless Chromium against the local server: keep one example, confirm the
  button is absent for a real plan, remove the remaining examples, see both
  entries in History, undo the removal. No script errors.

Not verified: the hosted Site, real trip data.
