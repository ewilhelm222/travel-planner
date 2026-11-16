import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { thanksgivingExample, applyTripChange, publicTrip, editorRestriction } from '../lib/trips.mjs';
const planner = readFileSync(new URL('../public/planner.js', import.meta.url), 'utf8');
const between = (from, to) => planner.slice(planner.indexOf(from), planner.indexOf(to, planner.indexOf(from)));

test('the form asks what, when and what kind first; everything else is under More details', () => {
    const form = between('function formData(a) {', 'function openEditor(');
    const at = text => { const i = form.indexOf(text); assert.ok(i >= 0, text); return i; };
    assert.ok(at('name="title"') < at('name="date"') && at('name="date"') < at('class="kind-choice"') && at('class="kind-choice"') < at('id="more-details"'));
    for (const field of ['placeId', 'guestLocation', 'guestNotes', 'address', 'notes', 'links'])
        assert.ok(at(`name="${field}"`) > at('id="more-details"'), `${field} is under More details`);
    assert.match(form, /hasMore \|\| state\.moreOpen \? 'open' : ''/, 'open when the activity already has details, or when this person keeps it open');
    assert.ok(!form.includes('name="highlight"'), 'no separate highlight tick');
});

test('the three kinds map onto the stored fields without losing a hand-set plan', () => {
    const kindOf = between('function kindOf(a, t) {', '// Quick add first');
    assert.match(kindOf, /everyone && a\.highlight && !a\.optional \? 'whole' : everyone && a\.optional && !a\.highlight \? 'open' : 'some'/);
    const draft = between('function draft() {', 'async function createTrip');
    assert.match(draft, /optional: some \? f\.elements\.optional\.checked : kind === 'open'/);
    assert.match(draft, /highlight: some \? f\.dataset\.kind === 'some' && f\.dataset\.highlight === 'true' : kind === 'whole'/);
    assert.match(draft, /participants: some \? \[\.\.\.f\.querySelectorAll\('\[name=participants\]:checked'\)\][^:]*: defaultParticipants\(state\.snapshot\.trip\)/);
});

test('a person added from the activity form is an ordinary traveler: private on the guest link, allowed for editors', () => {
    const t = thanksgivingExample(), person = { id: 'new-person', name: 'Robin', familyId: null, showOnGuest: false };
    const change = { action: 'traveler', person };
    assert.equal(editorRestriction(t, change), null, 'an editor may add them');
    let next = applyTripChange(t, change);
    next = applyTripChange(next, { action: 'add', activity: { ...t.activities[0], id: 'robin-plan', sourceKind: 'entered', participants: ['new-person'] } });
    const guest = JSON.stringify(publicTrip(next));
    assert.ok(!guest.includes('Robin') && !guest.includes('new-person'), 'their name and id stay off the guest link');
    assert.match(planner, /showOnGuest: false \};\n        const ticked =/, 'the form never opts a new person into the guest link');
    assert.match(planner, /attendanceFields\(\{ participants: \[\.\.\.ticked, person\.id\] \}/, 'what was ticked stays ticked, plus the new person');
});
