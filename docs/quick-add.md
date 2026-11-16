# Quick add: a shorter activity form

Status: November 16, 2026. Built and checked locally with synthetic data; not
deployed. No data change: the same fields are stored as before. Step "PR 7" of
the [feedback plan](feedback-2026-11-15-plan.md) (items C4, W2, W4).

## What changed

The activity form now starts with only what a quick contribution needs:

1. **Activity** (the title), **Day**, **Time or part of day**.
2. **What kind of plan is this?** One choice instead of three unrelated ticks:
   - **Open to everyone · optional** (the starting choice in a gathering);
   - **Whole-group activity** (everyone together; the card with the pink band);
   - **For some people, or set it yourself**, which reveals the list of people
     and the Optional tick.
3. **More details**, folded: place, guest meeting point, guest description,
   private address, private notes, links. It opens by itself when the activity
   already has any of these, and the form remembers on each device whether you
   left it open.

Inside the people list, **＋ Add a person who is not listed…** adds a traveler
without leaving the form. What you had ticked stays ticked and the new person
is ticked too. Their name is private on the guest link, as for any new
traveler; only the organizer can change that, in Manage travelers.

On a 390 × 844 phone a new activity's form fits on one screen down to More
details.

## What did not change

- Stored fields are still `optional`, `highlight` and `participants`. "Open"
  saves optional, for everyone. "Whole-group" saves not optional, highlighted,
  for everyone. "Some" saves exactly what is ticked.
- An existing activity that is for everyone but neither optional nor
  whole-group opens as "For some people, or set it yourself" with everyone
  ticked, and saves back unchanged.
- "Fixed booking" is still a tick here; the timing step replaces it.

## Checks

- `npm test`: 123 pass (3 new in `tests/quick-add.test.mjs`).
- Headless Chromium, phone and desktop, against the local server: a new
  activity saves as optional for everyone; four existing activities of
  different kinds open on the right choice and save back byte-for-byte
  unchanged; switching to whole-group, then to one newly added person, then
  back to open saves the expected fields each time. No script errors.

Not verified: the hosted Site, a physical phone.
