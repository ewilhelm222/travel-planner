import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { thanksgivingExample, applyTripChange, publicTrip, normalizeTrip } from '../lib/trips.mjs';
import { board, card, areaId, orderedPlaces, ideaCards } from '../public/board.mjs';
import { placeReferences, placeReferenceSummary } from '../public/structure.mjs';
import { diffTrips, undoChange } from '../public/history.mjs';
const add = (trip, id, name, parentId) => applyTripChange(trip, { action: 'place-add', place: { id, name, ...(parentId ? { parentId } : {}) } });
const base = () => { let t = add(thanksgivingExample(), 'lodge', 'The Lodge', 'home'); t = add(t, 'town', 'Town'); return add(t, 'museum', 'Museum <one>', 'town'); };

test('a place can sit inside an area, one level deep', () => {
    const t = base();
    assert.deepEqual(t.places.map(p => [p.id, p.parentId]), [['home', null], ['lodge', 'home'], ['town', null], ['museum', 'town']]);
    assert.throws(() => add(t, 'room', 'A room', 'lodge'), /cannot be nested further/);
    assert.throws(() => applyTripChange(t, { action: 'place-edit', placeId: 'home', patch: { parentId: 'town' } }), /cannot be nested further/, 'an area that has venues cannot itself be put inside another');
    assert.throws(() => applyTripChange(t, { action: 'place-edit', placeId: 'town', patch: { parentId: 'town' } }), /Choose an area/);
    assert.throws(() => add(t, 'x', 'X', 'nowhere'), /Choose an area/);
    const old = thanksgivingExample(); for (const p of old.places) delete p.parentId;
    assert.deepEqual(diffTrips(old, applyTripChange(old, { action: 'edit', activityId: 'option-1', patch: { title: 'X' } })).map(r => r.id), ['option-1'], 'places saved before this are not logged as changed');
    assert.equal(areaId(t, 'museum'), 'town');
    assert.equal(areaId(t, 'town'), 'town');
    assert.equal(areaId(t, null), null);
    assert.deepEqual(orderedPlaces(t).map(p => `${p.depth}:${p.id}`), ['0:home', '1:lodge', '0:town', '1:museum']);
});

test('the board groups a day by area and names the venue on the card', () => {
    let t = base();
    t = applyTripChange(t, { action: 'edit', activityId: 'option-2', patch: { placeId: 'lodge' } });
    t = applyTripChange(t, { action: 'edit', activityId: 'option-3', patch: { placeId: 'museum' } });
    const html = board(t, { day: t.start }), day = html.slice(html.indexOf('data-date="2026-11-26"'), html.indexOf('data-date="2026-11-27"'));
    assert.deepEqual([...day.matchAll(/<section class="agenda-city"><h3 title="([^"]*)"/g)].map(m => m[1]), ['Our shared base · location to confirm', 'Town'], 'one section per area; the lodge is not a section of its own');
    assert.ok(card(t.activities[1], t).includes('<span class="card-venue">At The Lodge</span>'));
    assert.ok(card(t.activities[2], t).includes('At Museum &lt;one&gt;'));
    assert.ok(card(t.activities[3], t).includes('<span class="card-venue">At Our shared base · location to confirm</span>'), 'a plan at the area itself names the area');
    const guest = publicTrip({ ...t, activities: t.activities.map(a => ({ ...a, sourceKind: 'entered' })) });
    assert.deepEqual(guest.places.map(p => p.parentId), [null, 'home', null, 'town']);
    assert.ok(board(guest, { guest: true }).includes('At The Lodge'), 'guests see the same grouping and venue names');
    const idea = id => ({ ...t.activities[0], id, date: null });
    assert.deepEqual([...ideaCards([{ ...idea('a'), placeId: 'museum' }, { ...idea('b'), placeId: 'home' }, { ...idea('c'), placeId: 'town' }], t).matchAll(/idea-place">([^<]*)</g)].map(m => m[1]), ['Our shared base · location to confirm', 'Town'], 'ideas are grouped by area too');
});

test('deleting an area is never silent about its venues, and undo brings everything back', () => {
    let t = base();
    t = applyTripChange(t, { action: 'edit', activityId: 'option-3', patch: { placeId: 'museum' } });
    const refs = placeReferences(t, 'town');
    assert.deepEqual([refs.venues.map(v => v.id), refs.total], [['museum'], 1]);
    assert.equal(placeReferenceSummary(refs), '1 venue inside it');
    assert.throws(() => applyTripChange(t, { action: 'place-delete', placeId: 'town' }), /still used by 1 venue inside it/);
    const toArea = applyTripChange(t, { action: 'place-delete', placeId: 'town', reassignTo: 'home' });
    assert.equal(toArea.places.find(p => p.id === 'museum').parentId, 'home', 'the venue moves into the chosen area');
    const toNothing = applyTripChange(t, { action: 'place-delete', placeId: 'town', reassignTo: null });
    assert.equal(toNothing.places.find(p => p.id === 'museum').parentId, null, 'or becomes an area of its own');
    const toVenue = applyTripChange(t, { action: 'place-delete', placeId: 'town', reassignTo: 'museum' });
    assert.equal(toVenue.places.find(p => p.id === 'museum').parentId, null, 'a venue chosen as the target cannot sit inside itself');
    assert.deepEqual(normalizeTrip(undoChange(toArea, diffTrips(t, toArea)), t.id), t);
    assert.equal(get(toNothing, 'option-3').placeId, 'museum', 'plans at the venue are untouched');
});
const get = (trip, id) => trip.activities.find(a => a.id === id);

test('the forms list venues under their area and offer "Inside"', () => {
    const planner = readFileSync(new URL('../public/planner.js', import.meta.url), 'utf8');
    assert.match(planner, /name="\$\{prefix\}parentId"/);
    assert.match(planner, /\$\{p\.depth \? `\$\{p\.areaName\} › ` : ''\}\$\{placeLabel\(p\)\}/);
    assert.match(planner, /parentId: form\.elements\.newPlaceparentId\.value \|\| null/);
    assert.match(planner, /if \(\['placeId', 'from', 'to', 'parentId'\]\.includes\(field\)\)/, 'History names the area');
});
