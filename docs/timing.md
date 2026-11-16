# Timing levels: set time, that day, any day

Status: November 16, 2026. Built and checked locally with synthetic data; not
deployed. **The first change in this series that adds a stored field.** No
database migration, and no stored trip is rewritten by deploying it. Step
"PR 9" of the [feedback plan](feedback-2026-11-15-plan.md) (item T2).

## For planners

The "Fixed booking" tick is replaced by one choice, **How firm is the timing?**

| Choice | Meaning | On the card |
| --- | --- | --- |
| **Set time** | A booking or a fixed start. Day and time are protected: it cannot be dragged to another day, and a stay move leaves it where it is. This is what "Fixed booking" was. | ■ Set time |
| **That day** | Happens on that day; the time can stay loose ("after lunch"). The usual choice once a day is picked. | nothing extra |
| **Any day of the stay** | Truly flexible. It either sits in Ideas, or is pencilled onto a day. | Any day |

- An activity with no day is always "any day"; the choice is greyed out and
  says so.
- **Typing a clock time** ("17:30", "6 pm") in a new activity switches the
  choice to Set time for you. Clearing it switches back. Once you pick a level
  yourself the form stops suggesting.
- A plan already saved with a set time opens with its day and time locked.
  Choose **That day** to change them, as "clear Fixed booking first" worked
  before.
- Dragging an idea onto a day pencils it in as "Any day"; it is not promoted to
  a commitment. Open it and choose That day or Set time when it firms up.
- A **stay move** carries "That day" and "Any day" plans along (the organizer's
  decision of November 16) and leaves set times, exactly as it treated
  flexible and fixed plans before.
- The guest link shows the same words.

## Data

- New optional field on an activity: `timing`, one of `set`, `day`, `anytime`.
- The existing `fixed` field stays and remains what protects a plan: `fixed`
  is true exactly when the level is `set`. Drag rules, stay moves, exports and
  backups read `fixed` as before.
- **Existing trips:** nothing is rewritten. When a trip is read, an activity
  without a level is given one: `fixed` becomes `set`, a dated one becomes
  `day`, an undated one becomes `anytime`. The level is stored the next time
  that trip is saved. Because the level is filled in on reading, the first
  save after the upgrade logs only the card that was really changed, not every
  card.
- **A page left open on the old version** keeps working: it sends only `fixed`,
  and the server keeps the level in step. Such a page saving an unrelated edit
  does not flatten an "any day" plan.
- JSON exported before this change imports as before.
- Rolling back to the previous version is safe: it ignores the extra field,
  and `fixed` still carries the protection.

The offline shell cache is `waypoint-shell-v33` in the combined release.

## Checks

- `npm test`: 6 new tests in `tests/timing.test.mjs`: reading an old trip,
  protection, an old page's saves, ideas and moves, stay moves, wording).
- `npm run test:api`, `npm run test:access` and
  `scripts/check-drag-browser.cjs` pass locally; those scripts still set
  `fixed` the old way, which exercises the compatibility path.
- Headless Chromium against the local server: the suggestion from a typed
  time, the no-day case, saving each level, the lock on a saved set time, and
  the card labels. No script errors.

Not verified: a trip actually stored by the previous version on the hosted
Site (covered here by unit tests only), and physical phones.
