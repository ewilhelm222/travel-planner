import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { thanksgivingExample, applyTripChange, publicTrip, upgradeLegacy } from '../lib/trips.mjs';
import { createSampleTrip } from '../lib/prototype.mjs';
import { placeReferences, parseLinks, formatLinks, normalizeLinks } from '../public/structure.mjs';
import { diffTrips, undoChange } from '../public/history.mjs';
import { board } from '../public/board.mjs';
import { buildOfflineHtml } from '../public/offline-export.mjs';
const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const base = () => applyTripChange(thanksgivingExample(), { action: 'place-add', place: { id: 'trailhead', name: 'Synthetic trailhead', localName: '示例步道', address: '1 Example Road', localAddress: '示例路1号' } });

test('places can be added and edited, and are validated', () => {
    const trip = base();
    const { id, name, localName, address, localAddress } = trip.places.find(p => p.id === 'trailhead');
    assert.deepEqual({ id, name, localName, address, localAddress }, { id: 'trailhead', name: 'Synthetic trailhead', localName: '示例步道', address: '1 Example Road', localAddress: '示例路1号' });
    const edited = applyTripChange(trip, { action: 'place-edit', placeId: 'trailhead', patch: { name: 'Renamed trailhead' } });
    assert.equal(edited.places.find(p => p.id === 'trailhead').name, 'Renamed trailhead');
    assert.equal(edited.places.find(p => p.id === 'trailhead').localName, '示例步道', 'fields not in the patch are kept');
    assert.throws(() => applyTripChange(trip, { action: 'place-add', place: { id: 'trailhead', name: 'Duplicate' } }), /new place identifier/);
    assert.throws(() => applyTripChange(trip, { action: 'place-add', place: { id: 'blank', name: '  ' } }), /Give the place a name/);
    assert.throws(() => applyTripChange(trip, { action: 'place-edit', placeId: 'trailhead', patch: { name: '' } }), /Give the place a name/);
    assert.throws(() => applyTripChange(trip, { action: 'place-edit', placeId: 'trailhead', patch: { id: 'other' } }), /Unsupported edit/);
    assert.throws(() => applyTripChange(trip, { action: 'place-add', place: { id: 'extra', name: 'X', secret: 1 } }), /Unsupported edit/);
    assert.throws(() => applyTripChange(trip, { action: 'place-edit', placeId: 'missing', patch: { name: 'X' } }), /Place not found/);
});

test('deleting a place in use is refused until its references are explicitly reassigned', () => {
    let trip = base();
    trip = applyTripChange(trip, { action: 'leg-add', leg: { id: 'drive', title: 'Drive to the trail', date: '2026-11-27', mode: 'Car', from: 'home', to: 'trailhead', participants: ['cedar'] } });
    const refs = placeReferences(trip, 'home');
    assert.deepEqual([refs.activities.length, refs.stays.length, refs.legs.length], [12, 1, 1]);
    assert.throws(() => applyTripChange(trip, { action: 'place-delete', placeId: 'home' }), e => /still used by 12 activities, 1 stay, 1 journey\. Choose where to move them/.test(e.message) && e.references.total === 14);
    assert.throws(() => applyTripChange(trip, { action: 'place-delete', placeId: 'home', reassignTo: 'home' }), /different place/);
    assert.throws(() => applyTripChange(trip, { action: 'place-delete', placeId: 'home', reassignTo: 'nowhere' }), /different place/);
    const moved = applyTripChange(trip, { action: 'place-delete', placeId: 'home', reassignTo: 'trailhead' });
    assert.ok(!moved.places.some(p => p.id === 'home'));
    assert.ok(moved.activities.every(a => a.placeId === 'trailhead') && moved.activities.length === 12, 'no activity is lost');
    assert.equal(moved.stays[0].placeId, 'trailhead');
    assert.deepEqual([moved.legs[0].from, moved.legs[0].to], ['trailhead', 'trailhead']);
    const cleared = applyTripChange(trip, { action: 'place-delete', placeId: 'home', reassignTo: null });
    assert.ok(cleared.activities.every(a => a.placeId === null), 'null is an explicit choice: location to confirm');
    // An unused place needs no reassignment, and the whole delete can be undone in one step.
    const unused = applyTripChange(base(), { action: 'place-delete', placeId: 'trailhead' });
    assert.deepEqual(unused, thanksgivingExample());
    assert.deepEqual(undoChange(moved, diffTrips(trip, moved)), trip);
});

test('stays can be added, edited and deleted with place, dates, lodging and participants', () => {
    const trip = base();
    const stay = { id: 'cabin', name: 'Cabin night', placeId: 'trailhead', start: '2026-11-27', end: '2026-11-28', lodging: 'Synthetic cabin', note: '', participants: ['cedar', 'maple'] };
    const added = applyTripChange(trip, { action: 'stay-add', stay });
    assert.deepEqual(added.stays.find(s => s.id === 'cabin'), { ...stay, groupInfo: '', checkOutTime: '', showOnGuest: false });
    const edited = applyTripChange(added, { action: 'stay-edit', stayId: 'cabin', patch: { end: '2026-11-29', participants: ['cedar'], lodging: 'Bigger cabin' } });
    assert.deepEqual([edited.stays[1].end, edited.stays[1].participants, edited.stays[1].lodging], ['2026-11-29', ['cedar'], 'Bigger cabin']);
    assert.deepEqual(edited.activities, trip.activities, 'editing a stay never moves activities');
    assert.throws(() => applyTripChange(added, { action: 'stay-edit', stayId: 'cabin', patch: { end: '2026-11-27' } }), /valid check-in and check-out/);
    assert.throws(() => applyTripChange(added, { action: 'stay-edit', stayId: 'cabin', patch: { placeId: 'nowhere' } }), /Choose a place from this trip/);
    assert.throws(() => applyTripChange(added, { action: 'stay-edit', stayId: 'cabin', patch: { placeId: null } }), /Choose the place for this stay/);
    assert.throws(() => applyTripChange(added, { action: 'stay-edit', stayId: 'cabin', patch: { participants: ['stranger'] } }), /participants from this trip/);
    assert.throws(() => applyTripChange(trip, { action: 'stay-add', stay: { ...stay, id: 'shared-base' } }), /new stay identifier/);
    assert.deepEqual(applyTripChange(added, { action: 'stay-delete', stayId: 'cabin' }), trip);
    assert.throws(() => applyTripChange(trip, { action: 'stay-delete', stayId: 'cabin' }), /Stay not found/);
});

test('journeys can be added, edited and deleted with mode, from/to, dates and participants', () => {
    const trip = base();
    const added = applyTripChange(trip, { action: 'leg-add', leg: { id: 'sleeper', title: 'Night train', date: '2026-11-27', arrivalDate: '2026-11-28', time: '22:10', arrivalTime: '06:40', mode: 'Train', from: 'home', to: 'trailhead', participants: ['birch'], notes: 'Synthetic' } });
    assert.deepEqual(added.legs[0], { id: 'sleeper', title: 'Night train', date: '2026-11-27', arrivalDate: '2026-11-28', time: '22:10', arrivalTime: '06:40', mode: 'Train', participants: ['birch'], notes: 'Synthetic', from: 'home', to: 'trailhead' });
    const edited = applyTripChange(added, { action: 'leg-edit', legId: 'sleeper', patch: { mode: 'Bus', to: null, participants: ['birch', 'maple'] } });
    assert.deepEqual([edited.legs[0].mode, edited.legs[0].to, edited.legs[0].participants], ['Bus', null, ['birch', 'maple']]);
    assert.throws(() => applyTripChange(added, { action: 'leg-edit', legId: 'sleeper', patch: { date: '2026-12-25', arrivalDate: '2026-12-25' } }), /day within this trip/);
    assert.throws(() => applyTripChange(added, { action: 'leg-edit', legId: 'sleeper', patch: { arrivalDate: '2026-11-26' } }), /cannot arrive before it leaves/);
    assert.throws(() => applyTripChange(added, { action: 'leg-edit', legId: 'sleeper', patch: { from: 'nowhere' } }), /Choose a place from this trip/);
    assert.throws(() => applyTripChange(added, { action: 'leg-edit', legId: 'sleeper', patch: { title: '' } }), /short title/);
    assert.deepEqual(applyTripChange(added, { action: 'leg-delete', legId: 'sleeper' }), trip);
    assert.throws(() => applyTripChange(trip, { action: 'leg-delete', legId: 'sleeper' }), /Journey not found/);
});

test('an activity address and links are editable, validated, and kept out of the guest view', () => {
    const trip = applyTripChange(thanksgivingExample(), { action: 'edit', activityId: 'option-5', patch: { address: 'PRIVATE 12 Synthetic Lane', links: [{ label: 'Menu', url: 'https://example.com/private-menu' }, { label: '', url: 'http://example.org/x' }] } });
    const dinner = trip.activities.find(a => a.id === 'option-5');
    assert.equal(dinner.address, 'PRIVATE 12 Synthetic Lane');
    assert.deepEqual(dinner.links, [{ label: 'Menu', url: 'https://example.com/private-menu' }, { label: '', url: 'http://example.org/x' }]);
    assert.deepEqual(trip.activities[0].links, [], 'links are optional');
    const guest = JSON.stringify(publicTrip(trip));
    assert.ok(!guest.includes('PRIVATE') && !guest.includes('private-menu') && !guest.includes('example.org') && !guest.includes('"links"'));
    assert.ok(!board(publicTrip(trip), { guest: true }).includes('example.com'));
    const offline = buildOfflineHtml({ trip, revision: 2 }, { downloadedAt: '2026-11-16T00:00:00Z' });
    assert.ok(offline.includes('PRIVATE 12 Synthetic Lane') && offline.includes('Menu · https://example.com/private-menu'), 'the private offline copy keeps them');
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'example.com', 'ftp://example.com/x', ''])
        assert.throws(() => applyTripChange(trip, { action: 'edit', activityId: 'option-5', patch: { links: [{ label: 'x', url }] } }), /complete web address/);
    assert.throws(() => normalizeLinks(Array.from({ length: 11 }, () => ({ url: 'https://example.com' }))), /up to 10 links/);
    assert.deepEqual(parseLinks('Tickets https://example.com/t?a=1\n\n  https://example.com/plain  \nMap: https://example.com/m'), [{ label: 'Tickets', url: 'https://example.com/t?a=1' }, { label: '', url: 'https://example.com/plain' }, { label: 'Map', url: 'https://example.com/m' }]);
    assert.equal(formatLinks(parseLinks('Tickets https://example.com/t')), 'Tickets https://example.com/t');
    assert.deepEqual(parseLinks('not a link'), [{ label: '', url: 'not a link' }], 'a bad line reaches the server check instead of vanishing');
});

test('a trip saved before links existed is not reported as changed', () => {
    const trip = thanksgivingExample(), old = structuredClone(trip);
    for (const a of old.activities)
        delete a.links;
    assert.deepEqual(diffTrips(old, trip), [], 'a missing optional field equals an empty one');
    const next = applyTripChange(old, { action: 'edit', activityId: 'option-1', patch: { time: 'Late' } });
    assert.deepEqual(diffTrips(old, next).map(r => r.id), ['option-1'], 'only the edited card is logged');
    assert.ok(upgradeLegacy(createSampleTrip()).activities.every(a => Array.isArray(a.links)));
});

test('the board opens stay details and journeys; the guest view has neither', () => {
    let trip = base();
    trip = applyTripChange(trip, { action: 'leg-add', leg: { id: 'drive', title: 'Drive <b>north</b>', date: '2026-11-27', mode: 'Car', from: 'home', to: 'trailhead', participants: ['cedar'] } });
    const html = board(trip, {});
    assert.match(html, /<button type="button" class="lodging" data-stay-view="shared-base"/);
    assert.match(html, /<button type="button" class="journeys" data-leg="drive"/);
    assert.ok(html.includes('Our shared base · location to confirm → Synthetic trailhead'), 'a journey shows where it goes');
    assert.ok(!html.includes('<b>north</b>'), 'titles are escaped');
    const guest = board(publicTrip(trip), { guest: true });
    assert.ok(!guest.includes('data-stay') && !guest.includes('data-leg') && !guest.includes('Synthetic shared house'));
});

test('the planner offers inline place creation, structure editing and a Save label for trip details', async () => {
    const script = await source('public/planner.js');
    assert.match(script, /<option value="__new">＋ Add new place…<\/option>/);
    assert.match(script, /action: 'place-add', base: \{\}, place/, 'adding a place relies on no existing record, so it cannot conflict with the open draft');
    assert.equal(script.match(/id="structure"/g).length, 2, 'desktop toolbar and phone manage section');
    for (const id of ['place-form', 'stay-form', 'leg-form'])
        assert.ok(script.includes(`<form id="${id}"`));
    assert.match(script, /\$\('#create-submit'\)\.textContent = 'Save'/);
    assert.match(script, /for \(const k of \['title', 'subtitle', 'start', 'end', 'timezone', 'kind'\]\)/);
    assert.match(script, /rel="noopener noreferrer"/);
    assert.match(script, /reassignTo: to === '__none' \? null : to/, 'a place in use is only deleted with a chosen destination');
});
