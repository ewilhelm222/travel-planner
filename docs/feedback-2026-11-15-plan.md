# Plan from the November 15 feedback sessions

Status: November 16, 2026; organizer decisions added the same day. **A plan only.** No app code, schema, deployment or
live data was changed to produce it. Nothing here is an approved feature or
schema change until the organizer says so ([plan.md](plan.md) still governs).

Source: the organizer's private write-up of two informal, coached family test
sessions on November 15, 2026, covering three perspectives. They are called the
**first younger participant**, the **second younger participant** and the
**adult participant** here. The sessions were voice-transcribed and speakers
were not reliably separated, so everything attributed below is a paraphrase and
"who said it" is a best reading. No names, family details or transcript text are
in this file.

## Decisions recorded November 16, 2026

The organizer answered the questions this plan first ended with. The item
details below were written before these answers; where they differ, this
section wins.

| Topic | Decision | Effect on the plan |
| --- | --- | --- |
| Sign-in link on the guest page (A2) | **Yes.** | In PR 1 as proposed. |
| Wording list and quieter whole-group card (W1) | **Approved.** | In PR 2; the Night Market guide is amended in the same PR. |
| Dark theme (D1) | **Forms only.** | Dialogs that are mainly a form go dark: activity, traveler and group, place, stay, journey, stay move, trip details, new trip, import, and add editor. Dialogs that are mainly for reading stay cream: History, guest link and its preview, archived trips, the guest activity detail and the new stay reading view. |
| Invented items on the guest link (X3) | **Leave them off.** | In PR 2. |
| Door codes and Wi-Fi | **In the private stay note.** | No new field needed for this trip. They are therefore also in the private offline file, the JSON export, History and backups; see section 6. |
| Stay information on the guest link (S3) | **Allowed.** (An earlier reading of the first answer as "not needed" was corrected the same day.) | S2 and S3 stay in the plan as PR 11, after the trip. Because door codes live in the private stay note, the shared text is still a separate field with its own per-stay switch, so ticking it can never publish the note. |
| Ideas on the guest link (C1) | **Yes, guests should see ideas.** | A change to the documented guest boundary. Added to PR 4; see "Ideas on the guest link" in section 6. |
| Place nesting (P2) | **One level is enough.** | P2 as proposed. |
| Ideas from people without accounts (A4) | **Not wanted.** | Removed from P2. The guest link stays read-only. |
| "That day" items and a stay move (T2) | **Carried along with the stay.** | As proposed: they move like flexible items and are listed in the preview; only "Set time" items are protected. |
| Structure versus freedom | **The proposed balance is right.** | No change. |
| Shared sign-in | **Three family members share one sign-in address; the organizer uses another. This is intended.** | "Signed in as" and "Editing as" show the address rather than a person's name. History will show one name for those three people's edits; accepted. |

The shared address was **not** on the editor list at the first sign-in. That
confirms A1 as the cause of the "no itinerary" report: the account was signed
in but not yet on any trip, and the page gave no hint of that.

## The short version

1. **Most of the feedback applies to the app as it is today.** The repository
   records `main` (including pull requests 7 to 12) as deployed on the evening
   of November 15 ([release provenance](multi-events.md#release-provenance)).
   At least two sessions described things that only exist in that build (the
   schematic map, the "Edit" pill on the stay line), so very little can be
   written off as "already fixed since the test".
2. **The biggest problem is not on the source document's priority list:
   getting in.** Two of three participants got stuck between the guest link and
   being able to add something. One cause is reproduced below: a person who
   signs in before their exact email is on the editor list is told, while
   signed in, to "sign in", and sees "No downloaded itinerary yet".
3. **Invented activities did the most damage to trust.** The fix that matters
   is taking them out of the real trip (the organizer can do that today, with
   no code). Better labels are second. Today an invented item cannot be
   "confirmed as real": its "Synthetic" label is permanent, and it is also
   shown on the guest link.
4. **Several requests are already in the app but nobody could tell.** New
   activities already default to everyone, already default to optional for a
   gathering, and already pre-fill the selected day. Unscheduled ideas exist
   but sit roughly two screens down. These are wording and placement fixes,
   not new features.
5. **Before Camp Earnest (November 22 to 27) only small, no-schema changes
   should ship**: access messages, wording and the pink card, a dark edit form,
   and "add" and "ideas" within reach. Timing levels, shared stay information,
   place hierarchy and gestures change stored data or gestures that already
   work, and should wait until after the trip.
6. **Putting door codes or Wi-Fi passwords on the guest link is not
   recommended.** A forwardable link that cannot be recalled is the wrong place
   for them. See [Privacy notes](#6-privacy-notes).

## How this was checked

- Read `AGENTS.md`, `README.md`, [plan.md](plan.md),
  [multi-events.md](multi-events.md), [design-night-market.md](design-night-market.md)
  and the feature notes, then the app source in `apps/sites-prototype`.
- Built and ran `main` (commit `8b1a6a3`) locally with a **synthetic** six-day
  gathering made for this check: one whole-trip group, one family group, three
  travelers, one place, one stay that ends on the last day, eight activities
  (some labelled synthetic, one fixed and highlighted, two unscheduled), an
  editor and a guest link. No real data was used.
- Looked at it in headless Chromium at phone portrait (390 × 844, touch), phone
  landscape (844 × 390, touch) and desktop (1440 × 900), signed in as organizer,
  as an editor, as a signed-in non-member, and through the guest link.

Not checked: the hosted Site, a physical phone, the real Camp Earnest data, the
ChatGPT sign-in emails themselves, and which build each participant actually
had open. `README.md` still says pull requests 7 to 12 are "not yet deployed",
which contradicts the release record; one of the two should be corrected.

**Limits of the evidence.** Three people, coached, informal, in one family, on
one evening. That is enough to find things that are confusing; it is not enough
to rank preferences. Where only one person asked for something, it says so.

## Every feedback point against today's app

"Addressed" means the current build already does it. "Partly" means the
function exists but the participant could not find or read it, or it covers
only some screens. Item codes point to [section 4](#4-item-details).

| # | Feedback point | Today | Item |
| --- | --- | --- | --- |
| 1 | Unscheduled ideas should be a visible, hideable column beside the days, grouped by destination | **Partly.** Ideas exist and can be dragged to and from days, but sit below the board and the map: about 1,300 px down on a phone, 2,100 px on desktop. Not grouped. The adult did not find them at all. | C1 |
| 2 | "Add" inside each day column, pre-filling the day | **Partly.** One global button. It pre-fills the *selected* day, which on a phone is the visible day, but on desktop is the ringed medallion rather than the column being looked at. On a phone the button is about 1,800 px down, under the map and the ideas. | C2 |
| 3 | Add between cards, click where it goes | **Open.** | C3 |
| 4 | Swipe between days in portrait | **Open.** Day medallions only. | L2 |
| 5 | Continuous vertical scroll through all days | **Open.** | L3 |
| 6 | Two or three day columns in landscape | **Partly, and poorly.** A phone on its side is wider than 760 px, so it gets the desktop page: about two columns, but the first screen is entirely toolbar and medallions with no activity visible, signed in or as a guest. | L1 |
| 7 | Keep drag between days | **Addressed.** Keep; every change below must not break it. | (keep) |
| 8 | Three timing levels instead of fixed/flexible | **Open.** One free-text time plus a "Fixed booking" tick. Every card that is not fixed says "○ Flexible" on desktop, including something that must happen that night. | T1, T2 |
| 9 | Typing a time should make it fixed | **Open** (confirmed: the tick stays off). | T2 |
| 10 | Free-text times such as "after lunch" are good | **Addressed.** Keep. | (keep) |
| 11 | Places need two levels, plus a meeting point | **Partly.** Places are one flat list. A free-text "Guest meeting point" exists per activity. | P1, P2 |
| 12 | Meeting point did not visibly change the place shown | **Partly.** It shows as "Meet · …" on phone cards only; desktop cards never show it. | P1 |
| 13 | Stay details from the day header: address, access, Wi-Fi, rooms, laundry, check-out | **Partly.** A stay has two private text fields (lodging, note). Clicking the stay line opens the *edit form*, not a reading view. | S1, S2 |
| 14 | Stay details visible to guests by click-through | **Open, deliberately.** The guest link receives no stay information at all. | S3 |
| 15 | The header "Edit" control edits only the header; hover highlight too faint | **Open.** The hover is a dark purple on a darker purple. | S1 |
| 16 | "Private details to add" led nowhere | **Open.** That is text typed into the lodging field, displayed as a label. | S1 |
| 17 | Departure day has no stay header; check-out info belongs somewhere | **Open** (reproduced: the last day shows only an empty dashed box, because a stay covers nights and ends on check-out day). | S4 |
| 18 | Whole-group activities should default to everyone | **Addressed.** New activities start with the whole-trip group ticked. | W2 |
| 19 | Informal ones optional; "everyone, optional" | **Addressed in data, not in reading.** New activities in a gathering start optional and for everyone; the card says so in small grey type that was read as description. | W1, W2 |
| 20 | Replace "shared moment" / "the rendezvous" | **Open.** | W1 |
| 21 | Tone down the pink | **Open.** The highlighted card is solid magenta with a glow. | W1 |
| 22 | Pink card's meaning not obvious | **Open.** | W1 |
| 23 | "Optional · available to join" reads like description text | **Open.** | W1 |
| 24 | Time above the title | **Addressed** in the current build on phone and desktop; worth confirming with the adult participant which build was seen. | (confirm) |
| 25 | Avoid piling controls above the cards | **Open on desktop and landscape** (ten or more buttons above the board). Addressed on phone portrait. | L1, C2 |
| 26 | Dark theme for the Add activity form | **Open, and by design.** Night Market specifies cream dialogs; on a phone the dialog is full-screen, so the whole screen turns cream. | D1 |
| 27 | Read-only status and signed-in state prominent | **Partly.** "Guest view · read only" is 10 to 11 px grey-violet text. The guest page has no way to sign in. | A2, A3 |
| 28 | Stay on the same itinerary through sign-in | **Partly.** An editor of one trip lands on it. The reported "lost" itinerary matches a different, reproduced fault (next row). | A1 |
| 29 | After sign-in: "no downloaded itinerary yet", trip not found until refresh | **Open** (reproduced for a signed-in account not yet on the editor list). | A1 |
| 30 | Sign-in email in spam; which account; autofill; passwords | **Outside the app** (ChatGPT sign-in). Can only be eased with guidance. | A4 |
| 31 | Distinguish invented content from real commitments | **Partly.** "· Synthetic" in small grey type at the end of a line; hidden completely in the desktop week view; cannot be changed once set; shown to guests. One participant did not know the word. | X1, X2, X3 |
| 32 | Adding a person who is not on the roster is hard | **Open.** It means leaving the activity form for Manage travelers. | W4 |
| 33 | "Everyone" versus the family filter is confusing; no visible difference | **Open.** With one family that contains everybody, the two filter choices show the same thing. | W3 |
| 34 | Age-range audience | **Open.** A person can belong to only one group. | W5 |
| 35 | A restricted or secret activity | **Open, and against a confirmed decision** (everyone on a trip sees the whole plan). | W6 |
| 36 | Add someone "so they can pay" | **Out of scope** (expenses are a deferred feature in plan.md). A note does the job. | (none) |
| 37 | A daily habit appears only once (repeating activities) | **Open.** | T3 |
| 38 | Map looked like a placeholder; an address showed nothing | **Partly.** Working as designed (schematic, drawn from coordinates, never from a typed address), but with one place it is one dot in an empty box. | M1 |
| 39 | Maps and transit-style overlay following card order | **Partly.** Day and trip schematics exist. A richer map is later work. | M2 |
| 40 | Full-trip view | **Addressed on desktop** ("Fit a week"); it only opens by default for trips of ten days or more. | L4 |
| 41 | Food: only group meal times and "help cook" | **No feature needed.** A content rule for whoever enters meals. | (content) |
| 42 | Schedule feels obligatory, dense, and makes the stay look short | **Open**, addressed indirectly by X1, C1 and W1. | X1, C1, W1 |
| 43 | Voting or sign-up on every activity; cards changing colour as people join | **Withdrawn** by the adult participant in the same session. Also against the confirmed "no RSVP" decision. | (do not build) |
| 44 | Pictures on cards | **Deferred** by the participant who raised it. | (later) |
| 45 | The page behind the Add panel still scrolls; laptop columns feel like a familiar card board; purple theme recognised at once | **Positives.** Keep. | (keep) |

## 1. Features to build, modify, and remove or tone down

### Build (new)

| Item | What | Size |
| --- | --- | --- |
| A1 | A clear "you are signed in as …, but this account is not on a trip yet" screen | S |
| A2 | A way from the guest link to signing in, and a visible "editing as …" state | S |
| C2 | "Add" at the foot of every day and of Ideas, pre-filled | S |
| C4 | A short "quick add" form: title, optional time, who; everything else under "More details" | S to M |
| X2 | "Keep as a real plan" and "Remove" for invented items; "Remove all examples" | S to M |
| S1 | A reading view of stay details opened from the stay line | S |
| S4 | A "check-out day" header on the day a stay ends | S |
| W4 | "Add a person" from inside the activity form | S to M |
| L3 | "All days" continuous scroll on a phone | S to M |
| L2 | Swipe between days on a phone | M |
| T3 | "Also add to these days" when creating an activity (repeats as separate copies) | M |
| S2, S3 | Stay information for the group, with an organizer choice about the guest link | M |
| P2 | Two-level places (area, then venue) | M |
| C3 | Insert between cards on desktop | M |
| W5 | People in more than one group (for audiences such as an age range) | M |
| M2 | Richer destination map and route overlay | L |

### Modify (exists, needs changing)

| Item | What | Size |
| --- | --- | --- |
| C1 | Move Ideas next to the days: a hideable column on desktop and landscape, an "Ideas" stop on the phone day rail; group by place; rename | M |
| D1 | Dialogs and forms in the dark theme | S to M |
| W1 | Functional labels; "Optional" as a clear chip; the whole-group card no longer solid pink | S |
| W2 | Replace the three tick boxes with one plain choice about the kind of activity | S |
| W3 | Hide filter choices that change nothing; relabel the filter | S |
| X1 | Replace "Synthetic" with plain words and a distinct look, visible in every view | S |
| X3 | Leave invented items out of the guest link | S |
| T1 | Stop labelling every card "Flexible" | S |
| T2 | Three timing levels as one choice | M |
| P1 | Show the meeting point on desktop cards too | S |
| L1 | A proper phone-landscape layout | S to M |
| L4 | Open short trips in the week view on desktop | S |
| M1 | Shrink the map to one line when there is nothing to draw; put it below Ideas | S |
| A3 | Make "Guest view · read only" readable and say what to do about it | S |

### Remove or tone down

| What | Why |
| --- | --- |
| Invented activities in the real Camp Earnest trip (data, not code) | Strongest negative reaction in the sessions |
| The solid magenta card and its glow | Called too much by the adult; first reaction of a younger participant was the colour |
| "The rendezvous", "Highlight a shared moment", "The plan, up close", "Not on the itinerary. Yet." | Called twee; meaning not obvious |
| "○ Flexible" on every unfixed card | Misleading for things that must happen that day |
| The word "Synthetic" | Not understood without explanation |
| The always-open map panel above Ideas and Add on a phone | Pushes the two things contributors need off the screen |
| Do not build: voting, sign-ups, interest counts, colour-by-attendance | Requested, then withdrawn in the same session |
| Do not build (for now): pictures on cards, meal planning, payments, hidden activities | Deferred, out of scope, or against a confirmed decision |

## 2. Design and UI changes by screen

These need matching edits to [design-night-market.md](design-night-market.md)
and `docs/design/night-market/tokens.css`, because two of them reverse written
rules of the adopted design (cream dialogs; magenta for the one shared moment).
The organizer adopted that design, so the organizer should approve the
amendment.

### All screens

- **Dialogs and forms go dark (D1).** Dusk surface, cream text, inputs with a
  dark fill and an orchid border, lagoon focus ring. Activity cards stay cream;
  nobody objected to those. The design guide's contrast pairs already cover
  cream and orchid text on the dark grounds; the on-cream ink colours used for
  links and warnings inside dialogs must switch to their on-dark versions.
- **Whole-group card (W1).** A cream card like the others with a magenta band
  and the words "Whole-group activity". Magenta stays for the primary button
  and the day-rail dot. No glow.
- **Words.** "Whole-group activity" (was "The rendezvous" / "Highlight a shared
  moment"); "Ideas · not scheduled yet" (was "Not on the itinerary. Yet.");
  "Activity" as the form title with no eyebrow line (was "The plan, up close");
  "Example · not a real plan" (was "Synthetic"); "Optional" as a chip beside the
  people labels, and nothing at all for an ordinary planned activity (was
  "Optional · available to join" / "Planned activity").
- **Timing words (T1).** No "Flexible" label. A set time shows "■ 17:00 · set
  time"; a loose one shows just "Night" or "After lunch".
- **Stay line (S1).** Reads as one clickable row with a lagoon outline on hover
  and focus, and a "Details" pill instead of "Edit".
- Colour is still never the only signal: every state above has words.

### Phone, portrait

- Schedule stays first (keep). Under the selected day's cards: a full-width
  **Add to Monday 23** button (C2).
- The day rail gains a first stop, **Ideas**, so unscheduled items are one tap
  from any day and can receive "Add an idea" (C1).
- Order below the day becomes Ideas, then Map (collapsed to a line when there
  is nothing to draw), then Plan & manage (M1).
- A **Day / All days** switch (L3); in All days, the medallions jump to a day.
- Later: swipe left and right between days (L2).
- The quick-add form fits one screen without scrolling (C4).

### Phone, landscape

- Treated as a phone, not a desktop (L1): the slim top bar, tools behind
  **Plan & manage**, the medallion rail, then two or three day columns filling
  the height, with Ideas as an optional first column.
- Today's first screen in landscape shows no activity at all; the target is the
  top of at least two days' cards on the first screen.
- Drag between visible columns directly; the "drop on a day" panel remains for
  days that are off screen.

### Desktop

- **Ideas column (C1)** pinned at the left of the board, collapsible to a narrow
  tab, remembered per device, grouped by place.
- **Add** at the foot of each day column and of Ideas (C2); later, an insert
  line between cards on hover (C3). Nothing new above the cards.
- The toolbar shrinks: Add activity, the Travelers filter and the view switch
  stay; the other buttons move into a "Manage" menu (L1 does this for
  landscape; the same change serves desktop).
- Meeting point shown on cards (P1).
- Trips of seven days or fewer open in the week view so the whole stay is
  visible at once (L4).
- Keep the page scrolling behind an open form, which the adult participant
  liked; if the form later becomes a side panel, keep that property.

### Guest view

- A readable banner: "You are viewing a read-only copy. To add or change
  plans, ask the organizer to add you, then sign in." with a **Sign in** link
  (A2, A3).
- The same wording, dark detail dialog, whole-group card, All-days switch and
  landscape layout as the signed-in planner.
- Invented items are left out (X3).
- Ideas are shown (decided November 16), below the days on a phone and as a
  column on wider screens, with the same limited details as dated activities.
- No stay details and no add controls.

## 3. Data-model changes and migration

Rules that apply to every change here:

- Every save keeps going through `commit()` / `transact()` in
  `lib/trip-store.ts`, so it is logged, undoable and checked per record.
- New fields are optional with a default, so **no stored trip is rewritten by a
  migration** and no database migration is needed. `normalizeTrip` fills the
  default the next time that trip is saved.
- Each new field has to be added in five places or it silently disappears: the
  validator (`normalizeTrip`), the list of fields an edit may touch, the
  History labels, the private exports, and, only if intended, the guest
  projection (`publicTrip`), which is an explicit allow-list.
- Pages left open on the old version keep working because edits are partial;
  the server keeps old and new fields consistent (noted per change).
- The offline shell cache version is bumped with each release, as before.
- JSON exports made before a change must still import after it.

| Change | Fields | How existing trips migrate | Notes |
| --- | --- | --- | --- |
| **Timing level (T2)** | `activity.timing`: `set` (date and time, protected), `day` (that day, loose time), `anytime` (any day of the stay) | Derived when missing: `fixed: true` becomes `set`; dated and not fixed becomes `day`; no date becomes `anytime`. Nothing moves and nothing changes on screen except the label. | Keep `fixed` and keep it in step with `timing` on the server (`fixed` is true exactly when `timing` is `set`), so drag rules, stay moves, exports and old open pages keep working. An `anytime` item may be pencilled onto a day or sit in Ideas under its place. |
| **Confirming an invented item (X2)** | No new field. `sourceKind` becomes changeable by one dedicated action (`synthetic` or `tentative` to `entered`). | None. | Today the field cannot be changed after creation. Bulk removal is one logged change listing every removed record, so it can be undone from History. |
| **Guest projection of invented items (X3)** | None. | None; guests simply stop receiving them. | Organizer decision: leave out (recommended) or show with the new label. |
| **Stay information (S2)** | `stay.groupInfo` (text for everyone on the trip: address, check-out time, laundry, what to bring) beside the existing private `note`; optional `stay.checkOutTime` text | Empty by default. Existing `lodging` and `note` are untouched and stay private. | Mirrors the pattern activities already use (guest description beside private notes). Six separate fields for Wi-Fi, codes, rooms and so on are not recommended yet: free text is enough for one camp and avoids building a secrets store. |
| **Stay on the guest link (S3)** | `stay.showOnGuest` (boolean) | `false` for every existing stay, so the guest link is unchanged until the organizer ticks it per stay. | When ticked, guests get the place, dates, lodging name and `groupInfo` only. Never `note`. |
| **Place hierarchy (P2)** | `place.parentId` (optional, one level only) | `null` for every existing place: all current places become top-level areas. | The board groups a day by the top-level place and shows the venue on the card. The meeting point stays free text on the activity. Deleting an area that has venues must be refused or reassigned, like deleting a place in use today. |
| **Participation kind (W2)** | None. Still `optional`, `highlight` and `participants`. | None. | The form presents them as one choice; choosing "Whole-group activity" ticks everyone. |
| **People in several groups (W5)** | `person.groupIds` (list) replacing the single `familyId` | `groupIds` becomes `[familyId]`, or empty. | Touches filters, guest name projection and stay moves. Only worth doing if audiences such as an age range are really wanted; ticking individuals works today. |
| **Repeats (T3)** | None. Separate ordinary activities created in one logged save. | None. | Copies are independent afterwards, which keeps moves, undo and conflicts simple. A true recurring record is a much larger change and is not proposed. |
| **Ideas grouped by place (C1)** | None. Uses the existing `placeId`. | None. | |
| **Access, wording, theme, layout (A, W1, D1, L)** | None. | None. | |

## 4. Item details

Strength: **strong** means two or three perspectives, or one with a hard stop
(could not continue); **medium** means one perspective, clearly stated;
**light** means one mention in passing.

### A. Getting in and knowing your state

**A1. Signed in, but not on a trip.** Build. Size S.
- *Evidence:* first younger participant, strong: after signing in they were
  told there was no downloaded itinerary and could not find the trip until
  switching and refreshing.
- *Today:* reproduced. A signed-in account that is not yet on the editor list
  sees an empty, disabled trip selector, a heading inviting them to "start with
  something to explore", the instruction "Sign in with an organizer or invited
  editor account" (while signed in), and "Connected · No downloaded itinerary
  yet". Nothing says which email they are signed in with, and nothing updates
  when the organizer adds them; they must reload. Once on the list, the trip
  opens straight away.
- *Proposed:* "You are signed in as (email). This account has not been added to
  a trip yet. Ask the organizer to add exactly this address." with **Check
  again** and **Use a different account**. Replace "No downloaded itinerary
  yet" with nothing when there is no trip.
- *Depends on:* nothing. *Risks:* showing the signed-in email on screen is the
  point, but confirm that is acceptable on a shared family device.
- *Open question:* was the participant added as an editor before or after they
  signed in, and with the same address the Site reports? That decides whether
  this is the whole cause.

**A2. From the guest link to editing.** Build. Size S.
- *Evidence:* second younger participant, strong: saw the read-only label,
  ignored it, then could not work out how to add anything. Source document
  lists it as an opportunity but gives it no priority.
- *Today:* the guest page has no sign-in link at all. The signed-in page shows a
  small "Private planning" mark and the name; the note saying "you are an
  editor" is at the bottom of the page.
- *Proposed:* a "Sign in to add or change plans" link on the guest page leading
  to the planner, where A1 handles the not-yet-added case; on the signed-in
  page, a header chip "Editing as (name)" or "Reading copy".
- *Risks:* every holder of the guest link sees the invitation to sign in,
  including people the organizer does not intend to make editors. They cannot
  get in, but they will ask. *Open question:* is that acceptable?

**A3. Read-only status that reads.** Modify. Size S. Part of A2: larger text, a
sentence instead of a tag, same place on every screen.

**A4. Sign-in friction itself.** No app change. Size S (guidance only).
- *Evidence:* both younger participants, strong: code email in spam; unsure
  which account; autofill and password confusion.
- *Today:* sign-in belongs to the hosting platform. The app cannot change the
  email, the sender or the form.
- *Proposed:* a three-line "before you start" note the organizer sends with the
  link (which email to use, check spam, it is a code not a password), and the
  same text in the Editors dialog. Add editors **before** sending the link.
- *Open question for the organizer:* should younger family members need an
  account at all? The alternative, letting guest-link holders submit ideas
  without signing in, would make an unrecallable link writable and reverses the
  confirmed "browse only" decision. It is listed as P2 for a decision, not
  recommended before the trip.

### X. Invented content

**X1. Plain label, visible everywhere.** Modify. Size S.
- *Evidence:* first younger participant, strong (invented items contradicted
  remembered traditions, including one placed on the wrong weekday; the view
  that software should not invent human activities; did not understand
  "synthetic"). Second younger participant questioned them too.
- *Today:* "· Synthetic" in 11 to 12 px grey at the end of the optional line;
  hidden in the desktop week view; the same on the guest link.
- *Proposed:* "Example · not a real plan", a dashed outline, shown in every
  density, plus a "Hide examples" switch.

**X2. Confirm or remove.** Build. Size S to M.
- *Today:* an invented item can be edited or deleted, but stays "Synthetic"
  forever, even after a family member corrects it. There is no bulk removal.
- *Proposed:* on the card and in the form, **Keep as a real plan** and
  **Remove**; in Plan & manage, **Remove all examples** with a count and a
  confirmation, undoable from History.
- *Risk:* bulk removal of many records in one save needs its own test for
  undo.

**X3. Keep examples off the guest link.** Modify. Size S. Organizer decision.

**Organizer action today, no code:** delete the invented items from the real
Camp Earnest trip, or correct them, before anyone else is shown it. Deleting
works now and is undoable. Principle for future trips: empty days stay empty
("Room to wander" already says this well); examples belong in the separate
example trip.

### C. Contributing

**C1. Ideas beside the days.** Modify. Size M.
- *Evidence:* adult participant, strong (never found the list; expected a
  hideable column near the days, tied to a place). First younger participant,
  strong but indirect (did not know which day things belonged on and did not
  want to choose; became engaged when adding their own ideas).
- *Today:* a full-width section below the board and map. Drag to and from it
  works. Excluded from the guest link.
- *Proposed:* see section 2. Group by place using the existing place field.
- *Depends on:* the board and drag code (`board.mjs`, `drag.mjs`); retest the
  browser drag script. *Risks:* on desktop a pinned column takes one of three
  or seven columns; it must collapse. *Open question:* should guests see ideas?
  Today they do not, by design.

**C2. Add where you are.** Build. Size S.
- *Evidence:* adult participant, strong (expected "add a card" at the foot of
  each column; disliked re-entering the day; no more controls above the
  cards).
- *Today:* see table rows 2 and 25.
- *Proposed:* a quiet "+ Add" at the foot of each day column and of Ideas,
  pre-filling day and place. The global button stays.

**C3. Insert between cards.** Build. Size M. Adult participant, medium
("ideally"). Needs a new activity to be saved at a position; today new items go
to the end. Desktop only. After C2 has been used for a while.

**C4. Quick add.** Build. Size S to M.
- *Evidence:* the source document's own principle (make quick contribution
  separate from organizer scheduling); the first younger participant's
  difficulty with the audience controls.
- *Today:* one form with more than a dozen inputs for everyone.
- *Proposed:* title, time (optional), who (defaults to everyone), kind. The
  rest under **More details**, remembered open for people who use it.

### D. Theme

**D1. Dark dialogs.** Modify. Size S to M.
- *Evidence:* second younger participant, strong (the light form hurt
  night-adapted eyes); source document P0.
- *Today:* every dialog is cream by the written design; full-screen on phones.
- *Proposed:* see section 2. Styles only, about ten dialogs plus the guest
  detail dialog.
- *Risks:* reverses a rule in the adopted design guide; History is long reading
  and was intended to be on cream. *Open question:* all dialogs dark
  (recommended, consistent), or only forms?

### W. Words, participation and audiences

**W1. Labels and the pink card.** Modify. Size S.
- *Evidence:* adult participant, strong (both phrases twee; pink too much;
  meaning unclear with one such card; the optional line was missed). Second
  younger participant's first reaction was the colour.
- *Proposed:* see section 2. *Risk:* magenta as "the one shared moment" is the
  centre of the Night Market idea; this keeps the dot and the band but gives up
  the glowing card.

**W2. One choice instead of three ticks.** Modify. Size S.
- *Evidence:* adult participant, medium (whole-group should default to
  everyone); first younger participant, strong (assigning people was hard;
  asked for "everyone, optional").
- *Today:* the defaults they asked for are already there. The form shows
  "Fixed booking", "Optional" and "Highlight a shared moment" as three
  unrelated ticks, and the audience list is headed "Available to" or
  "Participants" depending on one of them.
- *Proposed:* "What kind of plan is this?" with **Open to everyone, optional**
  (default for a gathering), **Whole-group activity** (ticks everyone), **For
  some people** (reveals the list).

**W3. Filter that makes sense.** Modify. Size S. Both younger participants,
medium. Hide a filter choice that would show exactly what "Everyone" shows;
hide the filter entirely when there is nothing to choose; label it "Show plans
for".

**W4. Add a person in place.** Build. Size S to M. First younger participant,
medium. Same pattern as the existing "add new place" inside the form. Editors
may already add travelers; the new person's name stays private on the guest
link by default, as now.

**W5. Audiences such as an age range.** Build, later. Size M. First younger
participant, light. Needs people in more than one group. Until then, tick
individuals.

**W6. Hidden activities.** Not recommended. First younger participant, light.
It contradicts the confirmed decision that everyone on a trip sees the whole
plan, and it would complicate exports, History and the guest link. Raise with
the organizer only if it comes up again.

### T. Timing

**T1. Drop "Flexible".** Modify. Size S. Adult participant, strong (a
must-happen-that-night item labelled flexible is misleading). Label change
only.

**T2. Three levels.** Modify. Size M.
- *Evidence:* adult participant, strong; source document P1.
- *Proposed:* one choice in the form: **Set time** (protected from moves, as
  "Fixed booking" is now), **That day** (default once a day is chosen),
  **Any day of the stay**. Typing a clock time suggests Set time.
- *Depends on:* C1 (where "any day" items live). *Risks:* today ticking
  "Fixed" locks the day and time inputs, so "typing a time ticks Fixed" cannot
  simply be bolted on; drag and stay-move rules read `fixed` and must keep
  working. *Open question:* should a "That day" item be skipped by a stay
  move? Recommended: it moves like a flexible item but is listed in the
  preview, as now.

**T3. Repeats.** Build. Size M. Second younger participant, medium (a daily
habit appeared once). "Also add to: every day / chosen days" at creation,
making separate copies.

### P. Places

**P1. Meeting point on desktop cards.** Modify. Size S. Adult participant,
medium.

**P2. Area, then venue.** Build. Size M. Adult participant, strong; source
document P2. Not needed for a single-camp week, where meeting points cover it.
Needed before China (city, then venue). *Open question:* is one level of
nesting enough (recommended), or is region above city also wanted?

### S. Stays

**S1. Stay details as a reading view.** Build. Size S.
- *Evidence:* adult participant, strong (wanted reference information from the
  day header; the Edit control and its highlight were unclear; a hint about
  private details led nowhere).
- *Proposed:* clicking the stay line opens details (place, address, dates, who,
  lodging, notes) with an **Edit** button inside. Signed-in people only. No
  data change.

**S2. Information for the group.** Build. Size M. One new text field for things
everyone on the trip should know, separate from the private note.

**S3. Stay information on the guest link.** Build. Size M with S2. Off by
default, per stay, organizer only. See [section 6](#6-privacy-notes) first.

**S4. Check-out day.** Build. Size S. Adult participant, light (looked odd,
then accepted). The day a stay ends shows "Check-out day · (place)" opening the
same details.

### L. Layout and gestures

**L1. Phone landscape.** Modify. Size S to M. Adult participant, strong.
Mostly styles plus the rule that decides "phone or desktop", which also selects
the drag behaviour, so the drag script must be rerun. Must be tried on a real
phone.

**L2. Swipe between days.** Build. Size M. Second younger participant and
source document. *Risks:* competes with press-and-hold drag, with the sideways
scroll of the day rail, and with the browser's own edge swipe for "back".

**L3. All days in one scroll.** Build. Size S to M. Second younger participant
only, offered as an alternative to buttons. The board already renders every
day, so this is mainly a display switch. It also suits the comment that the
planner is good for reading something already set. *Note:* L2 and L3 came from
the same person as alternatives; do L3 first and see whether L2 is still
wanted.

**L4. Week view for short trips.** Modify. Size S. Interest in a whole-trip
view was general; the view exists but a six-day trip opens showing four
columns.

### M. Maps

**M1. No empty map.** Modify. Size S. Second younger participant, medium (looked
like a placeholder; an address showed nothing). Collapse to one line when fewer
than two stops can be drawn, say why, and offer the existing "search this place
in a map app" link next to an address. Typed addresses are deliberately not
looked up, because that would send them to an outside service.

**M2. Destination map and route overlay.** Build, later. Size L. Adult
participant, strong interest, explicitly after the board is right. Depends on
P2 and on the unresolved China map checks in [maps.md](maps.md).

## 5. Sequence

Today is November 16; the stay begins November 22. The organizer deploys by
hand and has no local checkout, and a phone has been caught once pairing a new
script with an old cached stylesheet. So: **small releases, no stored-data
changes, last deployment by about November 19, nothing new during the stay.**

### Before anything is built (organizer, today)

- Remove or correct the invented activities in the real trip.
- Add each tester's exact sign-in address under Editors before sending them
  back, and send the three-line sign-in note (A4).
- Decide where door codes and Wi-Fi will live for this trip
  ([section 6](#6-privacy-notes)); the recommendation is the private stay note.
- Read through the existing unscheduled ideas, because guests will see their
  titles once PR 4 ships.

### P0: can ship before Camp Earnest (no data change)

| Step | Contents | Size | Needs from the organizer |
| --- | --- | --- | --- |
| PR 1 | **Getting in:** A1, A2, A3, and the A4 text | S | Decided: yes |
| PR 2 | **Plain words:** W1, T1, X1, X3, P1, W3 | S | Decided: approved; examples off the guest link |
| PR 3 | **Dark forms:** D1 (forms only) and the design guide amendment | S to M | Decided: forms only |
| PR 4 | **Add and Ideas within reach:** C2, M1 (map below Ideas, collapsed when empty), the phone "Ideas" stop from C1, ideas on the guest link, S1, S4 | M | Read through existing ideas before it is deployed |

PR 4 is the one to drop if time is short; PRs 1 and 2 are the ones not to
drop. Each is independent and can be deployed alone. All four should be checked
on a physical phone before the trip, which has not yet been done for any
release.

### P1: after the trip, in this order

| Step | Contents | Size | Depends on |
| --- | --- | --- | --- |
| PR 5 | Ideas column on desktop and landscape, grouped by place (rest of C1); L4 | M | PR 4 |
| PR 6 | Phone landscape layout and the slimmer toolbar (L1) | S to M | PR 5 |
| PR 7 | Quick add and the one-choice participation control (C4, W2, W4) | M | PR 3 |
| PR 8 | Confirm or remove examples (X2) | S to M | PR 2 |
| PR 9 | Three timing levels (T2), first stored-data change | M | PR 5, PR 7 |
| PR 10 | All-days scroll on phones (L3) | S to M | PR 6 |
| PR 11 | Stay information for the group, with a per-stay guest-link switch (S2, S3) | M | PR 4 (the stay reading view) |

### P2: later, before or alongside China

Repeats (T3); two-level places (P2); insert between cards (C3); swipe (L2), if
still wanted after L3; people in several groups (W5); richer maps (M2);
pictures on cards.

### Where this differs from the source document's priorities

| Source document | This plan | Why |
| --- | --- | --- |
| Sign-in and read-only state: listed as an opportunity, given no priority | **P0, first** | Two of three people could not get from viewing to contributing, and one cause is reproduced. No other improvement is reachable by someone who is stuck here. |
| Mark AI placeholders: P0 | **Remove them from the real trip today; relabel in P0; add "confirm" in P1** | A better label on an item that contradicts a family tradition is still the wrong item. Also, the label can never be cleared today, and guests see it. |
| Visible unscheduled column: P0 | **Split.** The phone "Ideas" stop and reordering are P0; the desktop column is P1 | The full column changes the board and drag targets a few days before first real use. Getting Ideas above the map is most of the benefit. |
| Contextual add: P0 | **P0, but foot-of-day only**; between-cards is P2 | The adult said "ideally" for between cards. On a phone the real problem is that Add is three screens down. |
| Consistent edit theme: P0 | **P0, with a caveat** | Agreed, but it reverses a written rule of the adopted design, so it needs the organizer's yes, not just a style edit. |
| Whole-group wording and defaults: P1 | **Wording P0; defaults need no work** | The defaults already exist. The cost is a few labels, and wording was criticised as strongly as anything. |
| Three-level timing: P1 | **Label fix P0; the levels P1** | Removing "Flexible" removes the misleading part now. The full change alters stored data and the drag rules. |
| Swipe and landscape: P1, together | **Landscape P1; all-days scroll before swipe; swipe P2** | Landscape is poor today (first screen has no activities). Swipe fights existing gestures, and the same participant offered scrolling as an alternative. |
| Lodging info: P1; rooms and check-out notes: P2 | **Reading view P0; group information P1; guest exposure only after a privacy decision** | "How do I get in" is the most time-critical information of the whole trip, and a reading view for signed-in people needs no data change. Putting it on the guest link is the risky part and should not be rushed. |
| Clearer edit highlighting: P2 | **P0, inside the stay reading view** | It is a two-line style change that travels with S1. |
| Venue hierarchy, maps and transit: P2 | **P2** | Agreed. Not needed for one camp; needed for China. |
| (not in the source priorities) Repeating activities | **P2** | One participant, but a natural expectation for daily habits. |
| (not in the source priorities) Quick-add form | **P1** | Follows directly from the source's own principle of separating quick contribution from organizing. |

### Disagreements and withdrawals

- **Withdrawn:** voting or sign-ups on activities and colour-by-attendance were
  floated and then withdrawn by the adult participant. Not planned.
- **Deferred by the requester:** pictures on cards; maps and route overlays
  until the board is right.
- **Structure versus freedom:** the adult participant wants more precise
  scheduling (set times, timing levels, insert-in-order); the first younger
  participant found any schedule oppressive and did not want to pick days. The
  plan serves both by keeping commitments few and clearly marked (W1, T2) and
  making Ideas the default place for everything else (C1, C4). The organizer
  should check that this balance is the intended one.
- **Who an activity is for:** the adult wants whole-group as a default; the
  first younger participant asked why people cannot simply go where they like,
  and also asked for narrower audiences (an age range, a private item). "Open
  to everyone, optional" as the default answers the first two; the narrower
  audiences are P2 or not recommended.
- **Scroll or swipe:** one participant, two alternatives; see L2 and L3.
- **Guest link information:** the adult wants stay details visible to guests by
  click-through; the confirmed requirement in plan.md is that lodging details
  remain protected. This is a decision for the organizer, not a detail of
  implementation.

## 6. Privacy notes

What the guest link is: a link anyone can forward, that works without an
account, cannot be recalled once opened or saved, and can be saved as a file by
any holder. Today it carries dated activities, group names, opted-in traveler
names, guest descriptions and meeting points, and nothing about stays,
journeys, ideas or private notes ([access boundary](multi-events.md#access-boundary)).
[plan.md](plan.md) lists "private planning notes and lodging details remain
protected" as a confirmed decision, so anything below is a change to that
decision.

| Information | Recommendation | Why |
| --- | --- | --- |
| **Door and gate codes, alarm codes, key locations** | **Never on the guest link.** Signed-in people only, in the private stay note, or not in the planner at all. | A leaked link becomes access to the building. Revoking the link does not revoke a code somebody already read. |
| **Wi-Fi password** | Same as door codes. | Lower stakes, same reasoning; easy to share in person. |
| **Street address of the lodging** | Off by default; the organizer may opt in per stay. | Address together with dates tells any holder when the family is there, and that their homes are empty. |
| **Room allocation** | Signed-in only. | It lists who sleeps where, including children, by name. It also overrides the per-person choice about showing names to guests. |
| **Check-out time, laundry, what to bring, house rules** | Reasonable to share when the organizer opts in. | Useful, and harmless if forwarded. |
| **Lodging name** | Organizer opt-in per stay. | Often identifies the address. |
| **Unscheduled ideas** | **Decided November 16: shown to guests.** See below. | Guests should see the menu of possibilities, not only the commitments. |
| **Names of people added from the activity form (W4)** | Private by default, as now. | Keeps the existing opt-in rule. |
| **Invented items** | Leave out. | Guests should not read examples as plans. |

**Ideas on the guest link (decided November 16).** Guests will receive each
idea's title, time text, optional mark, group labels, guest description and
meeting point, exactly the fields they already receive for dated activities.
Private notes, private address and links stay excluded, and invented items stay
out. Three things follow:

- Ideas already in a trip were written while ideas were private. Their
  **titles** become visible to every link holder on the day this ships, so the
  organizer should read through the existing ideas first.
- Editors can add ideas, so from then on anything an editor adds as an idea is
  visible to guests at once, as a dated activity already is.
- The share dialog, its preview and [multi-events.md](multi-events.md) currently
  state that unscheduled ideas are excluded; all three change in the same
  release.

Further points:

- **Signed-in is not the same as secret.** Anything in a stay note is included
  in the private "Save offline trip" file and the JSON export, which sit in a
  phone's downloads afterwards, and in History snapshots and backups
  permanently. plan.md already advises keeping reservation codes and similar
  secrets out of notes and downloadable files; door codes are the same kind of
  thing. If codes do go in the stay note, consider leaving a marked "access
  details" block out of the offline file.
- **If stay information is ever shared with guests, make it a separate field
  with its own switch (S2, S3),** never the existing note. Otherwise a code
  typed into the private note months earlier would be published by ticking one
  box.
- **The share dialog and its preview must be updated in the same release.** It
  currently promises that lodging details are excluded.
- **A sign-in link on the guest page (A2)** reveals nothing, but tells every
  holder that an editing side exists.
- **Editors can write what guests see** (decided November 16, see
  [editors.md](editors.md)). If guests can ever see stay information, decide
  whether editors or only the organizer may write it and switch it on.
  Recommended: editors may write it, only the organizer switches it on, as with
  traveler names.
- **Looking up typed addresses to draw the map** would send private addresses
  to an outside service. Not proposed.
- **Ideas from people without accounts** would make the guest link writable.
  Not proposed for now.

## Questions still open

None. Both sets of questions were answered on November 16; see
[Decisions](#decisions-recorded-november-16-2026).
