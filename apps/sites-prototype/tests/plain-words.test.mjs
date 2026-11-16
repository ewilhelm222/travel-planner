import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { thanksgivingExample, publicTrip } from '../lib/trips.mjs';
import { board, card } from '../public/board.mjs';
import { filterChoices, usefulFilterChoices } from '../public/participants.mjs';
import { buildOfflineHtml } from '../public/offline-export.mjs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const entered = () => { const t = thanksgivingExample(); t.activities.forEach(a => { a.sourceKind = 'entered'; }); return t; };

test('cards use functional words: no "Flexible", no "rendezvous", Optional as a chip, nothing extra for a planned activity', () => {
    const t = entered(), dinner = t.activities.find(a => a.highlight), walk = t.activities.find(a => a.optional), supper = t.activities.find(a => !a.optional && !a.highlight);
    const all = t.activities.map(a => card(a, t)).join('');
    for (const gone of ['○ Flexible', 'class="kind"', 'The rendezvous', 'available to join', 'Planned activity', 'Synthetic'])
        assert.ok(!all.includes(gone), gone);
    assert.ok(card(dinner, t).includes('Whole-group activity'));
    assert.ok(card(walk, t).includes('<span class="optional-chip">Optional</span>'));
    assert.ok(!card(supper, t).includes('optional-chip') && !card(supper, t).includes('example-label'));
    dinner.fixed = true;
    assert.ok(card(dinner, t).includes('■ Set time'), 'a set time is still said in words');
});

test('an example is labelled in words on its card, can be hidden, and never reaches the guest link', () => {
    const t = thanksgivingExample();
    assert.ok(card(t.activities[0], t).includes('Example · not a real plan'));
    assert.ok(card(t.activities[0], t).includes('class="activity   example"') || /class="activity[^"]*\bexample\b/.test(card(t.activities[0], t)));
    assert.ok(!board(t, { day: t.start, hideExamples: true }).includes('data-detail='), 'hiding examples hides every example card');
    assert.deepEqual(publicTrip(t).activities, [], 'a trip of examples shows guests no activities');
    t.activities[1].sourceKind = 'entered';
    t.activities[2].sourceKind = 'tentative';
    const guest = publicTrip(t);
    assert.deepEqual(guest.activities.map(a => a.id), [t.activities[1].id, t.activities[2].id], 'entered and tentative items are still shared');
    assert.ok(!JSON.stringify(guest).includes('synthetic'));
    assert.ok(buildOfflineHtml({ trip: t, revision: 1 }).includes('Example, not a real plan'), 'the private reading copy keeps examples, labelled');
    assert.ok(!buildOfflineHtml({ trip: t, revision: 1 }).includes('· Flexible'));
});

test('the filter only offers choices that change what is shown', () => {
    const t = entered();
    assert.equal(usefulFilterChoices(t).length, 0, 'every plan is for all three families, so no family filter helps');
    t.activities[0].participants = ['cedar'];
    assert.deepEqual(usefulFilterChoices(t).map(f => f.id).sort(), ['birch', 'maple'], 'only the choices that would hide something');
    assert.equal(filterChoices(t).length, 3, 'the full list is unchanged for other uses');
});

test('wording in the planner, guest page and share dialog', () => {
    const planner = read('../public/planner.js'), guest = read('../public/guest.mjs'), css = read('../public/planner.css');
    for (const gone of ['Highlight a shared moment', 'THE PLAN, UP CLOSE', 'Not on the itinerary. Yet.', 'Synthetic detail for testing'])
        assert.ok(!planner.includes(gone), gone);
    assert.match(planner, /Whole-group activity., .Everyone together\. Shown with a pink band\./);
    assert.match(planner, /<h2>Ideas <span>· not scheduled yet<\/span><\/h2>/);
    assert.match(planner, /So is anything marked “Example · not a real plan”/);
    assert.match(planner, /Show plans for/);
    const view = read('../public/activity-view.mjs');
    assert.ok(!guest.includes('available to join') && !view.includes('available to join') && view.includes('Whole-group activity'), 'the activity view shared by guest page and planner');
    assert.ok(!/\.activity\.rendezvous \{[^}]*background: var\(--magenta\)/.test(css), 'the whole-group card is no longer solid magenta');
    assert.ok(!/\.activity\.rendezvous \{[^}]*var\(--glow\)/.test(css), 'and has no glow');
});
