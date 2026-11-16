import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeTrip, applyTripChange } from '../lib/trips.mjs';
import { previewStayMove, applyStayMove, addDays, daysBetween } from '../public/stay-move.mjs';
import { diffTrips, summarize, undoChange } from '../public/history.mjs';
import { advance } from '../public/revisions.mjs';
const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
import { parallelTrip } from './fixtures/parallel-trip.mjs';
const ids = rows => rows.map(r => r.id).sort();

test('preview: flexible plans whose travelers all move are offered; nothing is changed', () => {
    const trip = parallelTrip(), before = structuredClone(trip);
    const preview = previewStayMove(trip, 'cedar-kyoto', 1);
    assert.deepEqual(trip, before, 'a preview never changes the trip');
    assert.deepEqual(preview.stay.to, { start: '2027-04-13', end: '2027-04-15' });
    assert.deepEqual(ids(preview.shift), ['cedar-arrival', 'checkout-coffee', 'cy-only', 'solo-garden'], 'Cedar-only plans, including one for a single Cedar traveler and the check-out morning');
    assert.deepEqual(preview.shift.find(a => a.id === 'solo-garden'), { id: 'solo-garden', title: 'Cedar: a garden morning', date: '2027-04-13', to: '2027-04-14' });
    for (const other of ['museum', 'birch-market', 'cedar-osaka-day', 'cedar-idea', 'cedar-later'])
        assert.ok(![...preview.shift, ...preview.fixed, ...preview.mixed, ...preview.blocked].some(a => a.id === other), `${other} is outside this stay's place, dates or travelers`);
});

test('preview: fixed bookings stay put and mixed-participant activities are flagged', () => {
    const preview = previewStayMove(parallelTrip(), 'cedar-kyoto', 1);
    assert.deepEqual(ids(preview.fixed), ['cedar-tea', 'shared-dinner'], 'fixed bookings are never offered for moving, even Cedar-only ones');
    assert.equal(preview.fixed.find(a => a.id === 'cedar-tea').outside, true, 'a booking left behind outside the new dates is flagged');
    assert.equal(preview.fixed.find(a => a.id === 'shared-dinner').outside, false);
    assert.deepEqual(ids(preview.mixed), ['cy-mo', 'shared-walk'], 'shared with Maple travelers who are not moving');
    assert.deepEqual(ids(preview.journeys), ['cedar-train'], 'only the moving group\'s travel is listed for review');
    assert.deepEqual(ids(preview.overlaps), ['cedar-osaka'], 'the new nights collide with Cedar\'s next stay');
    assert.deepEqual(previewStayMove(parallelTrip(), 'cedar-kyoto', -1).overlaps, []);
});

test('preview: a stay for one person treats their family\'s plans as shared, not theirs to move', () => {
    const trip = applyTripChange(parallelTrip(), { action: 'stay-add', stay: { id: 'cy-kyoto', placeId: 'kyoto', start: '2027-04-12', end: '2027-04-14', participants: ['cy'] } });
    const preview = previewStayMove(trip, 'cy-kyoto', 1);
    assert.deepEqual(ids(preview.shift), ['cy-only']);
    assert.ok(preview.mixed.some(a => a.id === 'solo-garden'), 'a whole-family plan is not moved by one member\'s stay');
});

test('preview: activities that would leave the trip are blocked, and bad moves are refused', () => {
    const trip = parallelTrip();
    const early = previewStayMove(trip, 'cedar-kyoto', -2);
    assert.deepEqual(early.stay.to.start, '2027-04-10');
    assert.deepEqual(early.blocked, []);
    const edge = applyTripChange(trip, { action: 'metadata', patch: { start: '2027-04-12' } });
    assert.throws(() => previewStayMove(edge, 'cedar-kyoto', -1), /outside this trip's dates/);
    const late = applyTripChange(trip, { action: 'metadata', patch: { end: '2027-04-16' } });
    const shifted = previewStayMove(late, 'cedar-osaka', 2);
    assert.deepEqual(shifted.stay.to, { start: '2027-04-16', end: '2027-04-18' });
    assert.throws(() => previewStayMove(trip, 'cedar-kyoto', 0), /different from the current one/);
    assert.throws(() => previewStayMove(trip, 'cedar-kyoto', 1.5), /different from the current one/);
    assert.throws(() => previewStayMove(trip, 'nope', 1), /Stay not found/);
    assert.equal(addDays('2027-02-28', 1), '2027-03-01');
    assert.equal(daysBetween('2027-04-12', '2027-04-10'), -2);
    assert.equal(daysBetween('2027-03-13', '2027-03-15'), 2, 'local dates, unaffected by daylight-saving changes');
});

test('apply: only the stay and the confirmed activities move; everyone else is untouched', () => {
    const trip = parallelTrip();
    const moved = applyTripChange(trip, { action: 'stay-move', stayId: 'cedar-kyoto', days: 1, shiftActivityIds: ['solo-garden', 'cedar-arrival'] });
    const changed = diffTrips(trip, moved);
    assert.deepEqual(changed.map(r => `${r.kind}:${r.id}`).sort(), ['activity:cedar-arrival', 'activity:solo-garden', 'stay:cedar-kyoto']);
    assert.deepEqual([moved.stays[0].start, moved.stays[0].end], ['2027-04-13', '2027-04-15']);
    assert.equal(moved.activities.find(a => a.id === 'solo-garden').date, '2027-04-14');
    assert.equal(moved.activities.find(a => a.id === 'cy-only').date, '2027-04-13', 'an unticked activity keeps its day');
    assert.equal(moved.activities.find(a => a.id === 'shared-dinner').date, '2027-04-13');
    assert.equal(moved.activities.find(a => a.id === 'cedar-tea').date, '2027-04-12');
    assert.deepEqual(moved.stays.slice(1), trip.stays.slice(1), 'other groups\' stays are untouched');
    assert.deepEqual(moved.legs, trip.legs, 'journeys are never changed by a stay move');
    assert.match(summarize({ action: 'stay-move', days: 1 }, changed), /Moved a stay 1 day later \(2027-04-12 → 2027-04-13\) with 2 flexible activities/);
    const none = applyTripChange(trip, { action: 'stay-move', stayId: 'cedar-kyoto', days: 1, shiftActivityIds: [] });
    assert.deepEqual(diffTrips(trip, none).map(r => r.kind), ['stay'], 'moving the stay alone is allowed');
});

test('apply: nothing moves that was not offered, and a changed plan needs a new preview', () => {
    const trip = parallelTrip();
    for (const id of ['shared-dinner', 'cedar-tea', 'shared-walk', 'museum', 'cedar-osaka-day', 'missing'])
        assert.throws(() => applyTripChange(trip, { action: 'stay-move', stayId: 'cedar-kyoto', days: 1, shiftActivityIds: [id] }), /The plan changed since this preview, so nothing was moved/, `${id} cannot be moved by a stay move`);
    assert.throws(() => applyTripChange(trip, { action: 'stay-move', stayId: 'cedar-kyoto', days: 1 }), /Confirm which activities move/);
    assert.throws(() => applyStayMove(trip, { stayId: 'cedar-kyoto', days: 1, shiftActivityIds: ['solo-garden', 'solo-garden'] }), /Confirm which activities move/);
    // Someone books the garden after the preview was shown: the confirmed move is refused whole.
    const booked = applyTripChange(trip, { action: 'edit', activityId: 'solo-garden', patch: { fixed: true } });
    assert.throws(() => applyTripChange(booked, { action: 'stay-move', stayId: 'cedar-kyoto', days: 1, shiftActivityIds: ['solo-garden', 'cedar-arrival'] }), /Preview the move again/);
});

test('a stay move is one History entry and one undo', () => {
    const trip = parallelTrip();
    const moved = applyTripChange(trip, { action: 'stay-move', stayId: 'cedar-kyoto', days: 1, shiftActivityIds: ['solo-garden', 'cedar-arrival', 'cy-only', 'checkout-coffee'] });
    const logged = advance({}, diffTrips(trip, moved));
    assert.equal(logged.records.length, 5);
    assert.ok(logged.records.every(r => r.rev === 2), 'the stay and each moved activity get a new revision');
    assert.deepEqual(normalizeTrip(undoChange(moved, logged.records, logged.revisions), 'parallel'), trip);
});

test('the planner previews before saving and sends the revisions of what it moves', async () => {
    const script = await source('public/planner.js');
    assert.match(script, /<strong>Nothing has been changed yet\.<\/strong>/);
    assert.match(script, /openStayMove\(stay\.id, daysBetween\(stay\.start, to\)/, 'Preview move only opens the preview');
    assert.ok(!/stay-move-preview[\s\S]{0,400}request\(/.test(script), 'previewing makes no request');
    assert.match(script, /action: 'stay-move', stayId, days: Number\(form\.dataset\.days\), shiftActivityIds: ids, base: base\(recordKey\('stay', stayId\), \.\.\.ids\.map\(id => recordKey\('activity', id\)\)\)/);
    assert.match(script, /Cancel · change nothing/);
});
