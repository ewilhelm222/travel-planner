import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { thanksgivingExample, applyTripChange, publicTrip, normalizeTrip, editorRestriction } from '../lib/trips.mjs';
import { diffTrips, summarize, undoChange } from '../public/history.mjs';
const planner = readFileSync(new URL('../public/planner.js', import.meta.url), 'utf8');

test('keeping an example makes it a real plan and nothing else changes', () => {
    const t = thanksgivingExample(), change = { action: 'confirm', activityId: 'option-2' };
    const next = applyTripChange(t, change), records = diffTrips(t, next);
    assert.deepEqual(records.map(r => r.id), ['option-2'], 'one record');
    assert.deepEqual({ ...next.activities[1], sourceKind: 'synthetic' }, t.activities[1], 'only the label changed');
    assert.equal(summarize(change, records), 'Kept “Neighborhood walk” as a real plan');
    assert.deepEqual(publicTrip(next).activities.map(a => a.id), ['option-2'], 'and it now reaches the guest link');
    assert.throws(() => applyTripChange(next, change), /already a real plan/);
    assert.throws(() => applyTripChange(t, { action: 'confirm', activityId: 'nope' }), /not found/);
    assert.throws(() => applyTripChange(t, { action: 'edit', activityId: 'option-2', patch: { sourceKind: 'entered' } }), /Unsupported edit/, 'still not changeable through an ordinary edit');
    assert.equal(editorRestriction(t, change), null, 'editors may do it, as they may delete or rewrite the item');
});

test('removing all examples is one logged change, leaves real plans alone, and can be undone', () => {
    let t = applyTripChange(thanksgivingExample(), { action: 'confirm', activityId: 'option-5' });
    t.activities.find(a => a.id === 'option-7').sourceKind = 'tentative';
    t = normalizeTrip(t, t.id);
    const change = { action: 'examples-remove' }, next = applyTripChange(t, change), records = diffTrips(t, next);
    assert.deepEqual(next.activities.map(a => a.id), ['option-5', 'option-7'], 'the kept plan and the tentative one stay');
    assert.equal(records.length, 10);
    assert.ok(records.every(r => r.kind === 'activity' && r.after === null));
    assert.equal(summarize(change, records), 'Removed 10 examples');
    assert.deepEqual(normalizeTrip(undoChange(next, records), t.id), t, 'undo puts every example back where it was');
    assert.throws(() => applyTripChange(next, change), /no examples to remove/);
});

test('the planner offers both, only while editing is possible', () => {
    assert.match(planner, /id="confirm-real" hidden>Keep as a real plan/);
    assert.match(planner, /\$\('#confirm-real'\)\.hidden = !id \|\| !writable\(\) \|\| a\.sourceKind === 'entered';/);
    assert.match(planner, /action: 'examples-remove', base: base\(\.\.\.ids\.map\(id => recordKey\('activity', id\)\)\)/, 'the bulk removal names every card it relies on, so a stale page is refused');
    assert.match(planner, /'trip-delete', 'remove-examples',/);
});
