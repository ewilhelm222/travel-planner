import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { thanksgivingExample, applyTripChange, publicTrip } from '../lib/trips.mjs';
import { board, swipeStep } from '../public/board.mjs';
import { diffTrips, summarize, undoChange } from '../public/history.mjs';
import { advance } from '../public/revisions.mjs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const dayIds = (trip, date) => trip.activities.filter(a => a.date === date).sort((a, b) => a.order - b.order).map(a => a.id);
const fresh = (id, extra = {}) => ({ ...thanksgivingExample().activities[2], id, title: `New ${id}`, sourceKind: 'entered', order: 500, ...extra });

test('every card on the planner board has an "Add here" before it; the guest board has none', () => {
    const t = thanksgivingExample(), html = board(t, { day: t.start });
    assert.equal(html.match(/class="insert-here"/g).length, t.activities.filter(a => a.date).length);
    assert.match(html, /<button type="button" class="insert-here" data-add-date="2026-11-26" data-add-place="home" data-before="option-3" aria-label="Add an activity before Cook together">/);
    assert.ok(html.indexOf('data-before="option-3"') < html.indexOf('data-detail="option-3"'), 'it sits just before its card');
    assert.ok(!board(publicTrip(t), { guest: true }).includes('insert-here'));
});

test('adding "here" places the new activity before the named card and logs one real change', () => {
    const t = thanksgivingExample(), change = { action: 'add', beforeId: 'option-3', activity: fresh('between') };
    const next = applyTripChange(t, change);
    assert.deepEqual(dayIds(next, '2026-11-26'), ['option-2', 'between', 'option-3', 'option-4', 'option-5']);
    const records = diffTrips(t, next), logged = advance({}, records).records;
    assert.equal(summarize(change, records), 'Added activity “New between”');
    assert.deepEqual(logged.filter(r => !r.incidental).map(r => r.id), ['between'], 'neighbours are only renumbered, which is never a conflict');
    assert.deepEqual(dayIds(undoChange(next, logged), '2026-11-26'), dayIds(t, '2026-11-26'), 'undo removes it and restores the order');
    assert.deepEqual(dayIds(applyTripChange(t, { action: 'add', beforeId: 'option-2', activity: fresh('first') }), '2026-11-26')[0], 'first');
    assert.deepEqual(dayIds(applyTripChange(t, { action: 'add', activity: fresh('plain') }), '2026-11-26').at(-1), 'plain', 'without a position it still goes last');
    assert.deepEqual(dayIds(applyTripChange(t, { action: 'add', beforeId: 'option-3', activity: fresh('moved', { date: '2026-11-27' }) }), '2026-11-27').at(-1), 'moved', 'a position on another day is ignored');
    assert.deepEqual(dayIds(applyTripChange(t, { action: 'add', beforeId: 'gone', activity: fresh('late') }), '2026-11-26').at(-1), 'late', 'a card deleted meanwhile does not block the add');
    const planner = read('../public/planner.js');
    assert.match(planner, /f\.dataset\.before && p\.date === f\.dataset\.beforeDate \? \{ beforeId: f\.dataset\.before \} : \{\}/, 'the position is dropped if the day was changed in the form');
});

test('a flick changes the day only when it is quick, long enough, mostly sideways, and not from the screen edge', () => {
    const base = { dx: -120, dy: 10, ms: 220, startX: 200, width: 390 };
    assert.equal(swipeStep(base), 1, 'flick left: next day');
    assert.equal(swipeStep({ ...base, dx: 120 }), -1, 'flick right: previous day');
    assert.equal(swipeStep({ ...base, dx: -50 }), 0, 'too short');
    assert.equal(swipeStep({ ...base, dy: 80 }), 0, 'a diagonal scroll');
    assert.equal(swipeStep({ ...base, ms: 900 }), 0, 'a slow drag, left to press-and-hold');
    assert.equal(swipeStep({ ...base, startX: 10 }), 0, 'from the left edge: the browser\'s own back gesture');
    assert.equal(swipeStep({ ...base, startX: 380 }), 0, 'from the right edge');
});

test('flicking is wired only for the one-day phone view, on the day itself, for planner and guest', () => {
    const planner = read('../public/planner.js'), guest = read('../public/guest.mjs');
    assert.match(planner, /phone\(\) && !state\.allDays && state\.snapshot && !document\.querySelector\('dialog\[open\]'\) && event\.target\.closest\?\.\('#itinerary'\)/);
    assert.match(planner, /document\.body\.classList\.contains\('is-dragging'\)/);
    assert.match(guest, /phone\(\) && !allDays && !document\.querySelector\('dialog\[open\]'\) && e\.target\.closest\?\.\('#itinerary'\)/);
    assert.equal((planner.match(/\{ passive: true \}/g) || []).length >= 4, true, 'the listeners never block scrolling');
});
