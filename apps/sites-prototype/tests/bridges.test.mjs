import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeTrip, applyTripChange, publicTrip, thanksgivingExample } from '../lib/trips.mjs';
import { board } from '../public/board.mjs';
import { travelPlan, splitDay, endOfBeforePart, boardSequence } from '../public/bridges.mjs';
import { moveActivity } from '../public/move.mjs';
import { tripMap, dayMap } from '../public/maps.mjs';
import { japanTrip, japanTripInput } from './fixtures/japan-trip.mjs';
import { parallelTrip } from './fixtures/parallel-trip.mjs';

// Made-up data throughout. `change` edits the fixture before it is normalized.
const trip = (change = () => { }) => { const input = japanTripInput(); change(input); return normalizeTrip(input, 'japan-demo'); };
const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const routes = plan => plan.moves.map(m => `${m.from}>${m.to}`);
// The board as a flat list of what stands side by side: day columns, parts of a travel day, and bridges.
const columns = html => [...html.matchAll(/<section class="agenda-day" data-date="([^"]+)" data-selected="[^"]*"(?: data-part="(\w+)")?|<div class="bridge" data-bridge-dates="([^"]*)"/g)].map(m => m[3] !== undefined ? `bridge:${m[3]}` : m[2] ? `${m[1]}:${m[2]}` : m[1]);
const columnHtml = (html, date, part) => { const start = html.indexOf(`<section class="agenda-day" data-date="${date}" data-selected="false"${part ? ` data-part="${part}"` : ''}`); return html.slice(start, html.indexOf('</section><', html.indexOf('add-here', start)) < 0 ? undefined : html.indexOf('<section class="agenda-day"', start + 10) < 0 ? undefined : html.indexOf('<section class="agenda-day"', start + 10)); };
const cardIds = html => [...html.matchAll(/data-detail="([^"]+)"/g)].map(m => m[1]);

test('a change of stay area gets a gap and a bridge that carries the transport', () => {
    const t = japanTrip(), plan = travelPlan(t), html = board(t);
    assert.deepEqual(routes(plan), ['tokyo>kyoto', 'kyoto>osaka'], 'areas come from the stays\' places; the two Kyoto stays are one area');
    assert.deepEqual(plan.moves.map(m => m.legs.map(l => l.id)), [['tokyo-kyoto'], ['kyoto-osaka']], 'journeys between venues (stations) count for the areas they sit in');
    assert.deepEqual(columns(html), ['2027-05-03', '2027-05-04', '2027-05-05:before', 'bridge:2027-05-05', '2027-05-05:after', '2027-05-06', '2027-05-07:before', 'bridge:2027-05-07', '2027-05-07:after', '2027-05-08']);
    const bridge = html.slice(html.indexOf('<div class="bridge"'), html.indexOf('</div>', html.indexOf('<div class="bridge"')));
    for (const text of ['data-bridge="2027-05-05~2027-05-05~tokyo~kyoto"', '<span class="bridge-mode">Train</span>', '<strong>Hikari Sample 505</strong>', '10:12 → 12:27', '<span class="bridge-place">Tokyo</span>', '<span class="bridge-place">Kyoto</span>', 'Everyone', '>Notes</span>'])
        assert.ok(bridge.includes(text), `the bridge shows ${text}`);
    assert.ok(!bridge.includes('Car 7'), 'notes are opened from the bridge, not printed on it');
    assert.equal((html.match(/data-leg="tokyo-kyoto"/g) || []).length, 0, 'the journey is on the bridge, not repeated as a block under the day');
});

test('a day trip that returns to the same stay gets no bridge and no gap; its journeys stay items in the day', () => {
    const t = japanTrip(), plan = travelPlan(t), html = board(t);
    assert.ok(!plan.bridgeLegIds.has('nara-out') && !plan.bridgeLegIds.has('nara-back'));
    assert.ok(!routes(plan).some(r => r.includes('nara')));
    const day = columnHtml(html, '2027-05-06');
    assert.ok(day.includes('class="journeys" data-leg="nara-out"') && day.includes('class="journeys" data-leg="nara-back"'));
    assert.ok(!columns(html).some(c => c.startsWith('2027-05-06:') || c === 'bridge:2027-05-06'), 'one ordinary column');
    // A side trip on the morning of a move is not mistaken for the move.
    const side = trip(i => i.legs.push({ id: 'yokohama-out', title: 'Out', mode: 'Train', date: '2027-05-05', from: 'tokyo', to: 'nara', participants: ['everyone'] }, { id: 'yokohama-back', title: 'Back', mode: 'Train', date: '2027-05-05', from: 'nara', to: 'tokyo', participants: ['everyone'] }));
    assert.deepEqual(travelPlan(side).moves[0].legs.map(l => l.id), ['tokyo-kyoto']);
});

test('changing lodging inside one area gets a small line between the two stays, not a gap', () => {
    const t = japanTrip(), plan = travelPlan(t), day = columnHtml(board(t), '2027-05-06');
    assert.deepEqual(plan.lodging, [{ date: '2027-05-06', area: 'kyoto', from: 'stay-kyoto-machiya', to: 'stay-kyoto-ryokan' }]);
    const out = day.indexOf('data-stay-view="stay-kyoto-machiya"'), line = day.indexOf('class="lodging-change"'), into = day.indexOf('data-stay-view="stay-kyoto-ryokan"');
    assert.ok(out > 0 && out < line && line < into, 'check-out, the change, then the new lodging');
    assert.match(day, /Change of lodging · same area, no travel day/);
    // A venue inside the area is still the same area.
    const venue = trip(i => { i.stays[2].placeId = 'fushimi'; });
    assert.deepEqual(routes(travelPlan(venue)), ['tokyo>kyoto', 'kyoto>osaka']);
    assert.equal(travelPlan(venue).lodging.length, 1);
});

test('a travel day reads in time order: the old stay and check-out, the transport, then the new stay', () => {
    const t = japanTrip(), html = board(t);
    const before = columnHtml(html, '2027-05-05', 'before'), after = columnHtml(html, '2027-05-05', 'after');
    assert.deepEqual(cardIds(before), ['travel-breakfast', 'tokyo-board'], 'cards at the place being left, and the unplaced card ordered ahead of them');
    assert.deepEqual(cardIds(after), ['kyoto-arrive', 'kyoto-gion'], 'saved arrival-first, shown after the journey');
    assert.ok(before.includes('class="lodging checkout" data-stay-view="stay-tokyo"') && !after.includes('stay-tokyo'), 'check-out is with the morning');
    assert.ok(after.includes('class="lodging" data-stay-view="stay-kyoto-machiya"') && !before.includes('stay-kyoto'));
    assert.match(before, /<p class="day-part">1 of 2 · Leaving Tokyo<\/p>/);
    assert.match(after, /<p class="day-part">2 of 2 · Arriving in Kyoto<\/p>/);
    assert.ok(html.indexOf('data-part="before"') < html.indexOf('class="bridge"') && html.indexOf('class="bridge"') < html.indexOf('data-part="after"'));
    assert.ok(!before.includes('data-weather=') && after.includes('data-weather="2027-05-05"'), 'the forecast is for the stay reached that day');
    assert.match(before, /data-add-place="tokyo"/, 'adding in the first part starts at the place being left');
    assert.match(after, /class="add-here" data-add-date="2027-05-05" data-add-place="kyoto"/);
    assert.deepEqual(dayMap(t, { day: '2027-05-05' }).stops.map(s => s.id), ['tokyo-station', 'kyoto-station', 'kyoto'], 'the day map follows the same order');
});

test('a move with no transport entered still gets the gap and a bridge, with a quiet prompt', () => {
    const t = trip(i => { i.legs = i.legs.filter(l => l.id !== 'tokyo-kyoto'); }), plan = travelPlan(t), html = board(t);
    assert.deepEqual([plan.moves[0].legs.length, plan.moves[0].split, plan.moves[0].dep, plan.moves[0].arr], [0, '2027-05-05', '2027-05-05', '2027-05-05']);
    assert.deepEqual(columns(html).slice(2, 5), ['2027-05-05:before', 'bridge:2027-05-05', '2027-05-05:after']);
    assert.match(html, /<button type="button" class="bridge-card quiet" data-bridge="2027-05-05~2027-05-05~tokyo~kyoto"[^>]*>.*?How are we getting there\? Not entered yet\..*?>Add<\/span>/);
    assert.deepEqual(tripMap(t).edges.filter(e => e.kind === 'order').map(e => `${e.from}>${e.to}`), ['tokyo>kyoto', 'kyoto>osaka'], 'the whole-trip map connects stay locations, leaving station endpoints out');
    // The guest link never carries journeys. With stays shared, a guest sees that the group moves, and nothing to open.
    const shared = trip(i => i.stays.forEach(s => { s.showOnGuest = true; })), guest = board(publicTrip(shared), { guest: true });
    assert.equal(publicTrip(shared).legs.length, 0);
    assert.ok(guest.includes('class="bridge-card quiet" role="group"') && !guest.includes('data-bridge=') && !guest.includes('Hikari') && !guest.includes('Not entered yet'));
    assert.ok(!board(publicTrip(japanTrip()), { guest: true }).includes('class="bridge"'), 'no shared stays, no bridge');
});

test('overnight travel: the bridge sits between the day it leaves and the day it arrives; neither day is split', () => {
    const t = trip(i => {
        i.stays[1].start = '2027-05-06'; i.stays.splice(2, 1); i.stays[1].end = '2027-05-07';
        Object.assign(i.legs.find(l => l.id === 'tokyo-kyoto'), { time: '22:10', arrivalDate: '2027-05-06', arrivalTime: '06:40' });
    }), plan = travelPlan(t), html = board(t);
    assert.deepEqual([plan.moves[0].dep, plan.moves[0].arr, plan.moves[0].split], ['2027-05-05', '2027-05-06', null]);
    assert.deepEqual(columns(html).slice(2, 5), ['2027-05-05', 'bridge:2027-05-05 2027-05-06', '2027-05-06']);
    assert.match(html, /Wed 5, 22:10 → Thu 6, 06:40/);
    assert.match(columnHtml(html, '2027-05-05'), /data-by-bridge/, 'the columns either side name their place in full');
    // The same with no journey entered: stays one night apart.
    const bare = trip(i => { i.stays[1].start = '2027-05-06'; i.stays.splice(2, 1); i.stays[1].end = '2027-05-07'; i.legs = []; });
    assert.deepEqual(columns(board(bare)).slice(2, 5), ['2027-05-05', 'bridge:2027-05-05 2027-05-06', '2027-05-06']);
});

test('drag and drop around a bridge: both parts of a travel day are drop targets for that day, the bridge is not', async () => {
    const t = japanTrip(), html = board(t), drag = await source('public/drag.mjs');
    assert.match(drag, /el\.closest\('\.can-drag \.agenda-day\[data-date\]'\)/, 'a drop target is a day column');
    assert.match(drag, /part: day\.dataset\.part \|\| null/, 'and it says which part of a travel day it is');
    const bridge = html.slice(html.indexOf('<div class="bridge"'), html.indexOf('<section', html.indexOf('<div class="bridge"')));
    assert.ok(!bridge.includes('data-date=') && !bridge.includes('agenda-day'), 'the bridge is outside every day column, so it cannot take a card');
    const parts = (trip, date = '2027-05-05') => { const s = splitDay(trip, travelPlan(trip).moves.filter(m => m.split === date), trip.activities.filter(a => a.date === date)); return [s.before.map(a => a.id), s.after.map(a => a.id)]; };
    // An idea placed in Kyoto, dropped on the day: it belongs after the journey wherever it is put in the order.
    const kyoto = moveActivity(t, { activityId: 'idea-tea', date: '2027-05-05', beforeId: 'travel-breakfast' }).trip;
    assert.deepEqual(parts(kyoto), [['travel-breakfast', 'tokyo-board'], ['kyoto-arrive', 'idea-tea', 'kyoto-gion']]);
    // An unplaced idea dropped below the last card of the first part stays in that part.
    const moves = travelPlan(t).moves.filter(m => m.split === '2027-05-05'), day = t.activities.filter(a => a.date === '2027-05-05');
    assert.equal(endOfBeforePart(t, moves, day, 'idea-onsen'), 'tokyo-board');
    assert.deepEqual(parts(moveActivity(t, { activityId: 'idea-onsen', date: '2027-05-05', beforeId: 'tokyo-board' }).trip)[0], ['travel-breakfast', 'idea-onsen', 'tokyo-board']);
    // A Tokyo card dropped there goes after the last Tokyo card.
    assert.equal(endOfBeforePart(t, moves, day, 'tokyo-market'), 'kyoto-gion');
    assert.deepEqual(parts(moveActivity(t, { activityId: 'tokyo-market', date: '2027-05-05', beforeId: 'kyoto-gion' }).trip), [['travel-breakfast', 'tokyo-board', 'tokyo-market'], ['kyoto-arrive', 'kyoto-gion']]);
    // Dropped on a card in the second part, an unplaced idea is ordered after the journey.
    assert.deepEqual(parts(moveActivity(t, { activityId: 'idea-onsen', date: '2027-05-05', beforeId: 'kyoto-gion' }).trip)[1], ['kyoto-arrive', 'idea-onsen', 'kyoto-gion']);
    // The days either side still take cards as before.
    assert.equal(moveActivity(t, { activityId: 'tokyo-board', date: '2027-05-04' }).trip.activities.find(a => a.id === 'tokyo-board').date, '2027-05-04');
    assert.equal(moveActivity(t, { activityId: 'kyoto-arrive', date: '2027-05-06' }).trip.activities.find(a => a.id === 'kyoto-arrive').date, '2027-05-06');
    const planner = await source('public/planner.js');
    assert.match(planner, /if \(part === 'before' && beforeId === null && date\)/);
});

test('moving a stay adds, moves and removes bridges, because they are read from the stays', () => {
    const bare = trip(i => { i.legs = []; });
    const at = t => travelPlan(t).moves.map(m => `${m.from}>${m.to} ${m.dep}/${m.arr}`);
    assert.deepEqual(at(bare), ['tokyo>kyoto 2027-05-05/2027-05-05', 'kyoto>osaka 2027-05-07/2027-05-07']);
    const later = applyTripChange(bare, { action: 'stay-move', stayId: 'stay-osaka', days: 1, shiftActivityIds: [] });
    assert.deepEqual(at(later)[1], 'kyoto>osaka 2027-05-07/2027-05-08', 'the bridge now sits between the 7th and the 8th');
    assert.deepEqual(columns(board(later)).slice(-3), ['2027-05-07', 'bridge:2027-05-07 2027-05-08', '2027-05-08']);
    const same = applyTripChange(bare, { action: 'stay-edit', stayId: 'stay-osaka', patch: { placeId: 'kyoto' } });
    assert.deepEqual(at(same), ['tokyo>kyoto 2027-05-05/2027-05-05'], 'a stay moved into the same area loses its bridge');
    const added = applyTripChange(same, { action: 'stay-edit', stayId: 'stay-osaka', patch: { placeId: 'nara' } });
    assert.deepEqual(at(added)[1], 'kyoto>nara 2027-05-07/2027-05-07');
    const gone = applyTripChange(bare, { action: 'stay-delete', stayId: 'stay-tokyo' });
    assert.deepEqual(at(gone), ['kyoto>osaka 2027-05-07/2027-05-07']);
});

test('edges: first and last day, a chain of journeys, groups travelling separately, and the person filter', () => {
    // Flights in and out are not a change of stay: ordinary items, the arrival first and the departure last.
    const t = japanTrip(), html = board(t), first = columnHtml(html, '2027-05-03'), last = html.slice(html.lastIndexOf('<section class="agenda-day"'));
    assert.ok(first.indexOf('data-leg="flight-in"') > 0 && first.indexOf('data-leg="flight-in"') < first.indexOf('agenda-city'));
    assert.ok(last.indexOf('data-leg="flight-out"') > last.lastIndexOf('data-detail='));
    // A move on the first day of the trip, and one that leaves on the last day and arrives after it.
    const edge = trip(i => { i.start = '2027-05-05'; i.end = '2027-05-07'; i.activities = []; i.legs = i.legs.filter(l => l.id === 'tokyo-kyoto'); i.stays[3].start = '2027-05-08'; i.stays[3].end = '2027-05-09'; });
    assert.deepEqual(columns(board(edge)), ['2027-05-05:before', 'bridge:2027-05-05', '2027-05-05:after', '2027-05-06', '2027-05-07', 'bridge:2027-05-07']);
    // A flight and then a train are one bridge with two journeys.
    const chain = trip(i => { i.legs = [{ id: 'hop-1', title: 'Flight', mode: 'Flight', date: '2027-05-05', time: '08:00', from: 'tokyo', to: 'nara', participants: ['everyone'] }, { id: 'hop-2', title: 'Train', mode: 'Train', date: '2027-05-05', time: '11:00', from: 'nara', to: 'kyoto-station', participants: ['everyone'] }]; });
    assert.deepEqual(travelPlan(chain).moves[0].legs.map(l => l.id), ['hop-1', 'hop-2']);
    assert.equal((board(chain).match(/class="bridge-leg"/g) || []).length, 2);
    // Two groups moving on the same day between different places: one gap, a bridge card each, named.
    const split = trip(i => {
        i.stays = [{ id: 'c1', placeId: 'tokyo', start: '2027-05-03', end: '2027-05-05', participants: ['cedar'] }, { id: 'c2', placeId: 'kyoto', start: '2027-05-05', end: '2027-05-08', participants: ['cedar'] },
            { id: 'm1', placeId: 'kyoto', start: '2027-05-03', end: '2027-05-05', participants: ['maple'] }, { id: 'm2', placeId: 'osaka', start: '2027-05-05', end: '2027-05-08', participants: ['maple'] }];
        i.legs = [{ id: 'cedar-train', title: 'Cedar train', mode: 'Train', date: '2027-05-05', from: 'tokyo', to: 'kyoto', participants: ['cedar'] }];
    });
    const both = travelPlan(split);
    assert.deepEqual(both.moves.map(m => [m.from, m.to, m.participants, m.legs.length]), [['kyoto', 'osaka', ['maple'], 0], ['tokyo', 'kyoto', ['cedar'], 1]]);
    assert.equal(boardSequence(split, ['2027-05-05'], both).filter(x => x.kind === 'bridge').length, 1);
    const html2 = board(split);
    assert.equal((html2.match(/data-bridge="/g) || []).length, 2);
    assert.ok(html2.includes('<span class="bridge-who">Cedar family</span>') && html2.includes('<span class="bridge-who">Maple family</span>'));
    // "Show plans for" one family: only that family's move.
    assert.deepEqual(routes(travelPlan(split, { filter: 'maple' })), ['kyoto>osaka']);
    assert.equal((board(split, { filter: 'cedar' }).match(/data-bridge="/g) || []).length, 1);
    // The parallel-stay fixture: only Cedar changes area, on the 14th.
    assert.deepEqual(travelPlan(parallelTrip()).moves.map(m => [m.id, m.legs.map(l => l.id)]), [['2027-04-14~2027-04-14~kyoto~osaka', ['cedar-train']]]);
    assert.deepEqual(travelPlan(parallelTrip(), { filter: 'maple' }).moves, []);
});

test('a trip that stays in one place is laid out exactly as before', async () => {
    const html = board(thanksgivingExample()), css = await source('public/planner.css');
    assert.ok(!html.includes('class="bridge"') && !html.includes('data-part=') && !html.includes('data-by-bridge') && !html.includes('lodging-change'));
    assert.match(css, /\.date-board:has\(> \.bridge\) \{ display: flex;/, 'the board only becomes a row when it carries a bridge');
    assert.ok((await source('public/sw.js')).includes('"/bridges.mjs"') && (await source('public/planner.js')).includes("'/bridges.mjs'"), 'cached for offline reading');
});
