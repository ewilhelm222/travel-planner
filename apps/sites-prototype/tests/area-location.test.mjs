import test from 'node:test';
import assert from 'node:assert/strict';
import { thanksgivingExample, applyTripChange, publicTrip } from '../lib/trips.mjs';
import { board, card, ideaCards } from '../public/board.mjs';

// Invented places: one area ("Maple Hollow") that heads the day columns, with a lodging and a venue inside it.
const trip = () => {
    let t = applyTripChange(thanksgivingExample(), { action: 'place-edit', placeId: 'home', patch: { name: 'Maple Hollow' } });
    t = applyTripChange(t, { action: 'place-add', place: { id: 'cabin', name: 'Camp Sample', parentId: 'home' } });
    return applyTripChange(t, { action: 'place-add', place: { id: 'falls', name: 'Hidden Falls', parentId: 'home' } });
};
const plan = (t, id, date, placeId) => applyTripChange(t, { action: 'add', activity: { id, title: id, date, time: '', placeId, order: 0, participants: t.families.map(f => f.id), notes: '', guestNotes: '', guestLocation: '', fixed: false, optional: true, sourceKind: 'entered' } });
const get = (t, id) => t.activities.find(a => a.id === id);
const line = html => html.match(/<span class="card-venue">([^<]*)<\/span>/)?.[1] ?? null;

test('an idea placed at the top-level area says where it is', () => {
    const t = plan(trip(), 'thrift', null, 'home');
    assert.equal(get(t, 'thrift').placeId, 'home', 'the chosen place is saved');
    assert.equal(line(card(get(t, 'thrift'), t)), 'At Maple Hollow');
    const ideas = ideaCards(t.activities.filter(a => !a.date), t);
    assert.ok(!ideas.includes('idea-place'), 'with one area in use the Ideas column has no place heading, so the card is the only place to say it');
    assert.ok(ideas.includes('<span class="card-venue">At Maple Hollow</span>'));
});

test('a scheduled activity placed at the top-level area says where it is', () => {
    const t = plan(trip(), 'bakery', '2026-11-27', 'home');
    assert.equal(line(card(get(t, 'bakery'), t)), 'At Maple Hollow');
    const html = board(t, { day: t.start }), at = html.indexOf('data-detail="bakery"');
    assert.ok(at > 0 && html.slice(at, html.indexOf('</button>', at)).includes('At Maple Hollow'), 'in the day column too');
});

test('lodging, venue and no place keep their lines; the line follows the card to a day and back', () => {
    let t = plan(plan(plan(plan(trip(), 'thrift', null, 'home'), 'games', null, 'cabin'), 'swim', null, 'falls'), 'stars', null, null);
    assert.equal(line(card(get(t, 'games'), t)), 'At Camp Sample');
    assert.equal(line(card(get(t, 'swim'), t)), 'At Hidden Falls');
    assert.equal(line(card(get(t, 'stars'), t)), null, 'no place chosen: no line');
    assert.equal(line(card({ ...get(t, 'stars'), placeId: 'gone' }, t)), null, 'a place that no longer exists: no line');
    t = applyTripChange(t, { action: 'move', activityId: 'thrift', date: '2026-11-28', beforeId: null });
    assert.deepEqual([get(t, 'thrift').placeId, line(card(get(t, 'thrift'), t))], ['home', 'At Maple Hollow']);
    t = applyTripChange(t, { action: 'move', activityId: 'thrift', date: null, beforeId: null });
    assert.deepEqual([get(t, 'thrift').date, get(t, 'thrift').placeId, line(card(get(t, 'thrift'), t))], [null, 'home', 'At Maple Hollow']);
    const guest = publicTrip(t);
    assert.equal(line(card(get(guest, 'thrift'), guest, true)), 'At Maple Hollow', 'the guest link shows the same line');
});
