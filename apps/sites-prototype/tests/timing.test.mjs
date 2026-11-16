import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { thanksgivingExample, applyTripChange, normalizeTrip, publicTrip, withTiming } from '../lib/trips.mjs';
import { timingOf, card } from '../public/board.mjs';
import { diffTrips } from '../public/history.mjs';
import { previewStayMove } from '../public/stay-move.mjs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const get = (trip, id) => trip.activities.find(a => a.id === id);
const edit = (trip, id, patch) => applyTripChange(trip, { action: 'edit', activityId: id, patch });
// A trip exactly as stored before timing levels existed.
const stored = () => { const t = thanksgivingExample(); for (const a of t.activities) delete a.timing; t.activities[4].fixed = true; t.activities[0].date = null; return t; };

test('a trip saved before timing levels reads as set, that day, or any day, with nothing rewritten', () => {
    const old = stored(), read = withTiming(old);
    assert.deepEqual([get(read, 'option-5').timing, get(read, 'option-2').timing, get(read, 'option-1').timing], ['set', 'day', 'anytime']);
    assert.ok(old.activities.every(a => !('timing' in a)), 'the stored document itself is untouched');
    const next = edit(read, 'option-2', { title: 'Renamed' });
    assert.deepEqual(diffTrips(read, next).map(r => r.id), ['option-2'], 'the first save after the upgrade logs only the card that changed');
    assert.equal(withTiming(next), next, 'a trip that already has levels is returned as is');
});

test('the level decides protection: only a set time is fixed', () => {
    let t = thanksgivingExample();
    assert.ok(t.activities.every(a => a.timing === 'day' && a.fixed === false));
    t = edit(t, 'option-2', { timing: 'set' });
    assert.deepEqual([get(t, 'option-2').timing, get(t, 'option-2').fixed], ['set', true]);
    assert.throws(() => edit(t, 'option-2', { time: '09:15' }), /set time/, 'a set time is protected');
    assert.throws(() => applyTripChange(t, { action: 'move', activityId: 'option-2', date: '2026-11-27' }), /set time/);
    t = edit(t, 'option-2', { timing: 'day', time: '09:15', date: '2026-11-27' });
    assert.deepEqual([get(t, 'option-2').timing, get(t, 'option-2').fixed, get(t, 'option-2').date], ['day', false, '2026-11-27'], 'choosing another level in the same save unlocks it');
    t = edit(t, 'option-2', { timing: 'anytime' });
    assert.deepEqual([get(t, 'option-2').timing, get(t, 'option-2').date], ['anytime', '2026-11-27'], 'any day, pencilled onto a day');
    assert.throws(() => edit(t, 'option-2', { timing: 'whenever' }), /how firm/);
});

test('an older open page that only knows "fixed" keeps working', () => {
    let t = edit(thanksgivingExample(), 'option-3', { fixed: true });
    assert.equal(get(t, 'option-3').timing, 'set');
    t = edit(t, 'option-3', { fixed: false });
    assert.equal(get(t, 'option-3').timing, 'day');
    t = edit(t, 'option-3', { timing: 'anytime' });
    t = edit(t, 'option-3', { title: 'Same level', fixed: false });
    assert.equal(get(t, 'option-3').timing, 'anytime', 'an old page saving something else does not flatten "any day"');
    const added = applyTripChange(t, { action: 'add', activity: { ...get(t, 'option-4'), id: 'old-add', fixed: true, timing: undefined } });
    assert.equal(get(added, 'old-add').timing, 'set');
});

test('ideas are always "any day"; moving keeps the level honest', () => {
    let t = edit(thanksgivingExample(), 'option-2', { date: null });
    assert.equal(get(t, 'option-2').timing, 'anytime');
    t = applyTripChange(t, { action: 'move', activityId: 'option-2', date: '2026-11-28' });
    assert.deepEqual([get(t, 'option-2').timing, get(t, 'option-2').fixed], ['anytime', false], 'an idea dropped on a day is pencilled in, not promised');
    t = applyTripChange(t, { action: 'move', activityId: 'option-3', date: '2026-11-28' });
    assert.equal(get(t, 'option-3').timing, 'day', 'a "that day" plan moved to another day is still a "that day" plan');
    assert.equal(timingOf({ date: null, fixed: true, timing: 'set' }), 'anytime');
    assert.equal(timingOf({ date: '2026-11-28', fixed: false, timing: 'set' }), 'day');
});

test('a stay move carries "that day" and "any day" plans and leaves set times', () => {
    let t = thanksgivingExample();
    t = edit(t, 'option-2', { timing: 'anytime' });
    t = edit(t, 'option-5', { timing: 'set' });
    t = normalizeTrip({ ...t, end: '2026-12-02' }, t.id);
    const p = previewStayMove(t, 'shared-base', 1), ids = rows => rows.map(r => r.id);
    assert.ok(ids(p.shift).includes('option-2') && ids(p.shift).includes('option-3'));
    assert.deepEqual(ids(p.fixed), ['option-5']);
});

test('cards, the guest link and the form say the level in words', () => {
    let t = thanksgivingExample();
    t.activities.forEach(a => { a.sourceKind = 'entered'; });
    t = edit(edit(t, 'option-2', { timing: 'anytime' }), 'option-5', { timing: 'set' });
    assert.ok(card(get(t, 'option-5'), t).includes('■ Set time'));
    assert.ok(card(get(t, 'option-2'), t).includes('<span class="anyday">Any day</span>'));
    assert.ok(!/Set time|Any day/.test(card(get(t, 'option-3'), t)), 'a "that day" plan needs no label');
    assert.deepEqual(publicTrip(t).activities.filter(a => a.timing !== 'day').map(a => [a.id, a.timing, a.fixed]), [['option-2', 'anytime', false], ['option-5', 'set', true]]);
    const planner = read('../public/planner.js');
    assert.match(planner, /<select name="timing"/);
    assert.ok(!planner.includes('name="fixed"'), 'a choice, not a tick box');
    assert.match(planner, /timing: f\.elements\.date\.value \? f\.elements\.timing\.value : 'anytime', fixed: !!f\.elements\.date\.value && f\.elements\.timing\.value === 'set'/);
    assert.match(planner, /f\.dataset\.timingTouched === 'true' \|\| f\.dataset\.wasSet === 'true'/, 'a typed clock time only suggests a set time');
});
