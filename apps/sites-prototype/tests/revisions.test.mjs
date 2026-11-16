import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { thanksgivingExample, applyTripChange, normalizeTrip } from '../lib/trips.mjs';
import { diffTrips, undoChange, undoConflicts } from '../public/history.mjs';
import { advance, baseFor, orderOnly, recordKey, revisionOf, staleMessage, staleRecords } from '../public/revisions.mjs';
const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
// The server's save, without the database: check the caller's base against the latest
// trip, apply the change to the latest trip, and raise the revision of what changed.
function save(state, change, base) {
    const stale = staleRecords(state.trip, state.revisions, base);
    if (stale.length)
        throw Object.assign(new Error(staleMessage(stale)), { stale });
    const trip = applyTripChange(state.trip, change), next = advance(state.revisions, diffTrips(state.trip, trip));
    return { trip, revisions: next.revisions, records: next.records };
}
// An existing trip straight after the migration: an empty map, every record at revision 1.
const fresh = () => ({ trip: thanksgivingExample(), revisions: {} });
const act = id => recordKey('activity', id);

test('a trip saved before this change needs no rewrite: every record starts at revision 1', () => {
    const state = fresh();
    assert.equal(revisionOf(state.revisions, act('option-2')), 1);
    assert.deepEqual(baseFor(state.revisions, act('option-2'), 'trip'), { 'activity:option-2': 1, trip: 1 });
    const saved = save(state, { action: 'edit', activityId: 'option-2', patch: { time: '10:00' } }, { 'activity:option-2': 1 });
    assert.deepEqual(saved.revisions, { 'activity:option-2': 2 }, 'only the edited card moves on');
    assert.equal(saved.records[0].rev, 2);
});

test('two planners editing different cards from the same starting point both save', () => {
    const opened = fresh();
    const first = save(opened, { action: 'edit', activityId: 'option-2', patch: { time: '10:00' } }, baseFor(opened.revisions, act('option-2')));
    // The second planner still holds the revisions from before the first save.
    const second = save(first, { action: 'edit', activityId: 'option-5', patch: { notes: 'Bring pie' } }, baseFor(opened.revisions, act('option-5')));
    assert.equal(second.trip.activities.find(a => a.id === 'option-2').time, '10:00', 'the first edit is kept');
    assert.equal(second.trip.activities.find(a => a.id === 'option-5').notes, 'Bring pie');
    assert.deepEqual(second.revisions, { 'activity:option-2': 2, 'activity:option-5': 2 });
});

test('a stale save to the same card is still refused and names the card', () => {
    const opened = fresh();
    const first = save(opened, { action: 'edit', activityId: 'option-2', patch: { time: '10:00' } }, baseFor(opened.revisions, act('option-2')));
    assert.throws(() => save(first, { action: 'edit', activityId: 'option-2', patch: { notes: 'mine' } }, baseFor(opened.revisions, act('option-2'))),
        e => /^“Neighborhood walk” was changed by another planner after you opened it\. Nothing was overwritten and your draft is still here/.test(e.message) && e.stale[0].current === 2 && e.stale[0].seen === 1);
    const removed = save(first, { action: 'delete', activityId: 'option-2' }, baseFor(first.revisions, act('option-2')));
    assert.throws(() => save(removed, { action: 'edit', activityId: 'option-2', patch: { notes: 'mine' } }, baseFor(first.revisions, act('option-2'))), /That activity was deleted by another planner/);
    assert.equal(removed.revisions['activity:option-2'], 3, 'a deleted record keeps a raised revision');
    assert.throws(() => staleRecords(opened.trip, opened.revisions, null), /saved revision is required/);
    assert.throws(() => staleRecords(opened.trip, opened.revisions, { 'activity:option-2': 'x' }), /saved revision is required/);
});

test('dragging renumbers neighbours without raising their revisions or blocking their open forms', () => {
    const opened = fresh();
    const moved = save(opened, { action: 'move', activityId: 'option-2', date: '2026-11-27', beforeId: 'option-6' }, baseFor(opened.revisions, act('option-2')));
    assert.deepEqual(moved.revisions, { 'activity:option-2': 2 }, 'only the dragged card has a new revision');
    const renumbered = moved.records.filter(r => r.incidental);
    assert.ok(renumbered.length >= 2 && renumbered.every(orderOnly) && renumbered.every(r => r.rev === undefined));
    // Someone had option-6 open before the drag; their save still goes through and keeps the new position.
    const edited = save(moved, { action: 'edit', activityId: 'option-6', patch: { title: 'A much longer hike' } }, baseFor(opened.revisions, act('option-6')));
    const hike = edited.trip.activities.find(a => a.id === 'option-6');
    assert.equal(hike.title, 'A much longer hike');
    assert.equal(hike.order, moved.trip.activities.find(a => a.id === 'option-6').order);
    // A pure reorder within one day raises nothing at all.
    const reordered = save(opened, { action: 'move', activityId: 'option-4', date: '2026-11-26', beforeId: 'option-2' }, baseFor(opened.revisions, act('option-4')));
    assert.deepEqual(reordered.revisions, {});
});

test('undo is allowed while the record is at the revision the change produced', () => {
    const opened = fresh();
    const edit = save(opened, { action: 'edit', activityId: 'option-2', patch: { title: 'Long walk' } }, baseFor(opened.revisions, act('option-2')));
    // Later: another card is edited, and the walk is dragged within its day (position only).
    let later = save(edit, { action: 'edit', activityId: 'option-5', patch: { notes: 'x' } }, baseFor(edit.revisions, act('option-5')));
    later = save(later, { action: 'move', activityId: 'option-2', date: '2026-11-26', beforeId: null }, baseFor(later.revisions, act('option-2')));
    assert.deepEqual(undoConflicts(later.trip, edit.records, later.revisions), []);
    const undone = normalizeTrip(undoChange(later.trip, edit.records, later.revisions), later.trip.id), walk = undone.activities.find(a => a.id === 'option-2');
    assert.equal(walk.title, 'Neighborhood walk');
    assert.equal(walk.order, later.trip.activities.find(a => a.id === 'option-2').order, 'only the field the change altered is put back; the later reorder stays');
    const again = save(later, { action: 'edit', activityId: 'option-2', patch: { notes: 'edited again' } }, baseFor(later.revisions, act('option-2')));
    assert.throws(() => undoChange(again.trip, edit.records, again.revisions), /“Long walk” has changed since this edit\. Nothing was changed\./);
});

test('undoing a drag puts neighbours back only where nobody has moved them since', () => {
    const opened = fresh();
    const moved = save(opened, { action: 'move', activityId: 'option-2', date: '2026-11-27', beforeId: 'option-6' }, baseFor(opened.revisions, act('option-2')));
    assert.deepEqual(normalizeTrip(undoChange(moved.trip, moved.records, moved.revisions), 'thanksgiving-example'), opened.trip, 'an immediate undo restores the day exactly');
    // A neighbour is edited and another is dragged afterwards: neither blocks the undo.
    let later = save(moved, { action: 'edit', activityId: 'option-6', patch: { notes: 'edited later' } }, baseFor(moved.revisions, act('option-6')));
    later = save(later, { action: 'move', activityId: 'option-8', date: '2026-11-27', beforeId: 'option-2' }, baseFor(later.revisions, act('option-8')));
    const undone = normalizeTrip(undoChange(later.trip, moved.records, later.revisions), 'thanksgiving-example');
    assert.equal(undone.activities.find(a => a.id === 'option-2').date, '2026-11-26');
    assert.equal(undone.activities.find(a => a.id === 'option-6').notes, 'edited later');
    assert.equal(undone.activities.length, 12);
});

test('undo of a delete and of an add follow the same revision rule', () => {
    const opened = fresh();
    const removed = save(opened, { action: 'delete', activityId: 'option-3' }, baseFor(opened.revisions, act('option-3')));
    const back = save({ trip: normalizeTrip(undoChange(removed.trip, removed.records, removed.revisions), 'thanksgiving-example'), revisions: removed.revisions }, { action: 'edit', activityId: 'option-3', patch: { notes: 'restored' } }, baseFor(removed.revisions, act('option-3')));
    assert.equal(back.trip.activities.findIndex(a => a.id === 'option-3'), 2, 'restored in its original place');
    const added = save(opened, { action: 'add', activity: { id: 'new-1', title: 'Pie run', date: '2026-11-26', participants: ['cedar'] } }, {});
    assert.equal(added.revisions['activity:new-1'], 1);
    const worked = save(added, { action: 'edit', activityId: 'new-1', patch: { notes: 'notes' } }, baseFor(added.revisions, act('new-1')));
    assert.throws(() => undoChange(worked.trip, added.records, worked.revisions), /changed since/, 'an added card someone has since edited is not deleted by undo');
    assert.ok(!undoChange(added.trip, added.records, added.revisions).activities.some(a => a.id === 'new-1'));
});

test('removing a traveler raises the revision of every plan it touched', () => {
    let state = fresh();
    state = save(state, { action: 'traveler', person: { id: 'ana', name: 'Ana Synthetic', familyId: 'cedar' } }, {});
    state = save(state, { action: 'edit', activityId: 'option-2', patch: { participants: ['ana', 'maple'] } }, baseFor(state.revisions, act('option-2')));
    const opened = state;
    const removed = save(state, { action: 'traveler-remove', personId: 'ana', unassign: true }, baseFor(state.revisions, recordKey('traveler', 'ana')));
    assert.equal(removed.revisions['activity:option-2'], opened.revisions['activity:option-2'] + 1);
    assert.equal(removed.revisions['traveler:ana'], 2);
    assert.throws(() => save(removed, { action: 'edit', activityId: 'option-2', patch: { participants: ['ana'] } }, baseFor(opened.revisions, act('option-2'))), /“Neighborhood walk” was changed by another planner/, 'a form opened before the removal cannot put the traveler back');
});

test('trip details, places, stays and journeys each have their own revision', () => {
    const opened = fresh();
    const renamed = save(opened, { action: 'metadata', patch: { title: 'Renamed' } }, baseFor(opened.revisions, 'trip'));
    assert.deepEqual(renamed.revisions, { trip: 2 });
    const stay = save(renamed, { action: 'stay-edit', stayId: 'shared-base', patch: { lodging: 'Synthetic lodge' } }, baseFor(opened.revisions, recordKey('stay', 'shared-base')));
    assert.deepEqual(stay.revisions, { trip: 2, 'stay:shared-base': 2 }, 'a stay edit opened before the rename still saves');
    assert.throws(() => save(stay, { action: 'metadata', patch: { subtitle: 'x' } }, baseFor(opened.revisions, 'trip')), /The trip details were changed by another planner/);
    assert.throws(() => save(stay, { action: 'stay-edit', stayId: 'shared-base', patch: { lodging: 'Other' } }, baseFor(opened.revisions, recordKey('stay', 'shared-base'))), /changed by another planner/);
});

test('the server checks per record, retries after a competing save, and holds older pages to the old rule', async () => {
    const store = await source('lib/trip-store.ts'), trip = await source('app/api/trip/route.ts');
    assert.match(store, /if \(input\.base !== undefined\) \{[\s\S]+staleRecords\(JSON\.parse\(r\.document\), revisionMap\(r\), input\.base\)/);
    assert.match(store, /return r\.revision === input\.revision \? null : conflict\(\)/, 'no base: the trip-wide revision must match exactly');
    assert.match(store, /for \(let attempt = 0; attempt < 8; attempt\+\+\) \{\s+if \(attempt\)\s+current = await row\(first\.id\);/, 'a lost race re-reads the trip and re-runs every check');
    assert.match(trip, /trip = applyTripChange\(before, input\)/);
    assert.ok(trip.indexOf('snapshot(current)') < trip.indexOf('applyTripChange(before, input)'), 'the change is applied to the latest trip');
    assert.match(trip, /record_revisions: JSON\.stringify\(next\.revisions\)/, 'the map is written in the same statement as the document');
    const migration = await source('drizzle/0003_record_revisions.sql');
    assert.equal(migration.trim(), "ALTER TABLE `planner_trips` ADD `record_revisions` text DEFAULT '{}' NOT NULL;", 'the migration only adds a column with a default');
    const script = await source('public/planner.js');
    assert.ok(!/revision: (state\.snapshot|previous|Number)/.test(script.replace(/schemaVersion: 2, revision: state\.snapshot\.revision/, '')), 'the planner no longer sends the trip-wide revision with saves');
    assert.match(script, /form\.dataset\.base = JSON\.stringify\(id \? base\(recordKey\('activity', a\.id\)\) : \{\}\)/, 'an activity form remembers the revision of its own card');
});
