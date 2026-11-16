import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyTripChange, publicTrip, thanksgivingExample } from '../lib/trips.mjs';
import { parallelTrip } from './fixtures/parallel-trip.mjs';
import { tripMap, dayMap, mapSvg, mapCaption, normalizePlaceGeo, reviewedLinks, appleSearchUrl, mapUrl, COORD_SYSTEMS } from '../public/maps.mjs';
import { board } from '../public/board.mjs';
import { buildOfflineHtml } from '../public/offline-export.mjs';
import { diffTrips } from '../public/history.mjs';
const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const place = (trip, placeId, patch) => applyTripChange(trip, { action: 'place-edit', placeId, patch });
const located = (system = 'WGS84') => place(place(parallelTrip(), 'kyoto', { lat: 35.0116, lng: 135.7681, coordSystem: system, coordSource: 'Synthetic test value' }), 'osaka', { lat: '34.6937', lng: '135.5023', coordSystem: system });

test('a place stores optional coordinates with an explicit system and provenance', () => {
    const kyoto = located().places.find(p => p.id === 'kyoto'), osaka = located().places.find(p => p.id === 'osaka');
    assert.deepEqual([kyoto.lat, kyoto.lng, kyoto.coordSystem, kyoto.coordSource], [35.0116, 135.7681, 'WGS84', 'Synthetic test value']);
    assert.deepEqual([osaka.lat, osaka.lng], [34.6937, 135.5023], 'typed text becomes numbers, unchanged');
    assert.deepEqual(COORD_SYSTEMS, ['WGS84', 'GCJ02', 'BD09', 'unknown']);
    const none = parallelTrip().places[0];
    assert.deepEqual([none.lat, none.lng, none.coordSystem], [null, null, ''], 'coordinates are optional');
    const trip = parallelTrip();
    assert.throws(() => place(trip, 'kyoto', { lat: 35, lng: 135 }), /Say which coordinate system these numbers use, or choose Unknown/);
    assert.throws(() => place(trip, 'kyoto', { lat: 35, lng: 135, coordSystem: 'EPSG:3857' }), /Say which coordinate system/);
    assert.throws(() => place(trip, 'kyoto', { lat: 35, coordSystem: 'WGS84' }), /both latitude and longitude/);
    assert.throws(() => place(trip, 'kyoto', { lat: 95, lng: 135, coordSystem: 'WGS84' }), /Latitude must be a number between -90 and 90/);
    assert.throws(() => place(trip, 'kyoto', { lat: 35, lng: '135°46′E', coordSystem: 'WGS84' }), /Longitude must be a number/);
    assert.equal(place(trip, 'kyoto', { lat: 35, lng: 135, coordSystem: 'unknown' }).places[0].coordSystem, 'unknown');
    const cleared = place(located(), 'kyoto', { lat: null, lng: null });
    assert.deepEqual([cleared.places[0].lat, cleared.places[0].coordSystem], [null, '']);
});

test('coordinates are never converted: every system is stored and shown exactly as entered', async () => {
    for (const system of ['WGS84', 'GCJ02', 'BD09', 'unknown']) {
        const kyoto = located(system).places[0];
        assert.deepEqual([kyoto.lat, kyoto.lng, kyoto.coordSystem], [35.0116, 135.7681, system]);
    }
    const relabel = place(located('WGS84'), 'kyoto', { coordSystem: 'GCJ02' }).places[0];
    assert.deepEqual([relabel.lat, relabel.lng], [35.0116, 135.7681], 'changing the label does not move the numbers');
    const code = await source('public/maps.mjs') + await source('lib/trips.mjs') + await source('public/planner.js');
    assert.ok(!/wgs2gcj|gcj2wgs|gcj2bd|bd2gcj|transform(Lat|Lng|Lon)|6378245|0\.00669342|x_pi|3000\.0 \* Math\.PI/i.test(code), 'no coordinate conversion code or constants exist');
    assert.ok(!/uri\.amap\.com|amap\.com\/(marker|navigation|search)/.test(code.replace(/placeholder="[^"]*"/g, '')), 'no Amap link is generated from stored data');
});

test('the trip map follows the board\'s traveler filter', () => {
    const trip = located();
    const all = tripMap(trip, { filter: 'all' });
    assert.deepEqual(all.nodes.map(n => n.id), ['kyoto', 'osaka']);
    assert.equal(all.mode, 'position');
    assert.equal(all.system, 'WGS84');
    assert.deepEqual(all.edges.map(e => `${e.from}>${e.to}`), ['osaka>kyoto', 'kyoto>osaka'], 'both groups\' journeys, in date order');
    const cedar = tripMap(trip, { filter: 'cedar' });
    assert.deepEqual(cedar.edges.map(e => [e.from, e.to, e.label]), [['kyoto', 'osaka', 'Train · 2027-04-14']], 'Cedar\'s route only');
    assert.match(cedar.nodes[0].detail, /2027-04-12 → 2027-04-14/);
    const birch = tripMap(trip, { filter: 'birch' });
    assert.deepEqual(birch.nodes.map(n => n.id), ['osaka'], 'Birch never stays in Kyoto');
    assert.deepEqual(birch.edges, []);
    assert.deepEqual(tripMap(trip, { filter: 'cy' }).nodes.map(n => n.id), ['kyoto', 'osaka'], 'a person sees their family\'s stays, as on the board');
    const kyoto = all.nodes[0], osaka = all.nodes[1];
    assert.ok(kyoto.x > osaka.x && kyoto.y < osaka.y, 'Kyoto is drawn north-east of Osaka');
});

test('the day map lists the filtered day\'s stops in itinerary order and keeps unplaced plans visible', () => {
    let trip = located();
    trip = applyTripChange(trip, { action: 'add', activity: { id: 'no-place', title: 'Somewhere to be decided', date: '2027-04-13', placeId: null, participants: ['cedar'], order: 99 } });
    const day = dayMap(trip, { filter: 'cedar', day: '2027-04-13' });
    const shownOnBoard = trip.activities.filter(a => a.date === '2027-04-13' && (a.participants.includes('cedar') || a.participants.includes('cy'))).length;
    assert.equal(day.stops.reduce((n, s) => n + s.activities.length, 0) + day.unplaced.length, shownOnBoard, 'exactly the activities the board shows for this filter and day');
    assert.deepEqual(day.unplaced.map(a => a.id), ['no-place'], 'an activity without a place is listed, not dropped or given invented coordinates');
    assert.ok(day.stops.every((s, i) => s.n === i + 1));
    assert.ok(day.stops.some(s => s.id === 'osaka') && day.stops.some(s => s.id === 'kyoto'));
    assert.equal(day.edges.length, day.stops.length - 1);
    assert.deepEqual(dayMap(trip, { filter: 'birch', day: '2027-04-13' }).stops.flatMap(s => s.activities.map(a => a.id)).sort(), ['birch-market', 'shared-dinner']);
    assert.deepEqual(dayMap(trip, { filter: 'all', day: '2027-04-17' }).stops, []);
    // Out and back in one day: one point on the drawing carrying both stop numbers.
    let round = applyTripChange(thanksgivingExample(), { action: 'place-add', place: { id: 'trail', name: 'Synthetic trail' } });
    round = applyTripChange(round, { action: 'edit', activityId: 'option-3', patch: { placeId: 'trail' } });
    const loop = dayMap(round, { day: '2026-11-26' });
    assert.deepEqual(loop.stops.map(s => s.id), ['home', 'trail', 'home']);
    assert.deepEqual(loop.nodes.map(n => [n.id, n.n]), [['home', '1,3'], ['trail', '2']]);
});

test('positions are used only for one known system; otherwise places are drawn in plan order', () => {
    assert.equal(tripMap(located('GCJ02')).system, 'GCJ02');
    const mixed = tripMap(place(located('WGS84'), 'osaka', { coordSystem: 'GCJ02' }));
    assert.equal(mixed.mode, 'order');
    assert.match(mixed.reason, /different coordinate systems \(WGS84, GCJ02\).*Converting between systems would be guesswork/);
    assert.ok(mixed.nodes.every(n => n.positioned === false));
    const unknown = tripMap(located('unknown'));
    assert.equal(unknown.mode, 'order');
    assert.match(unknown.reason, /2 places have coordinates in an unknown system and are not positioned by them/);
    const bare = tripMap(parallelTrip());
    assert.equal(bare.mode, 'order');
    assert.match(mapCaption(bare), /Drawn in plan order, not to scale or position/);
    const one = tripMap(place(parallelTrip(), 'kyoto', { lat: 35, lng: 135, coordSystem: 'WGS84' }));
    assert.equal(one.mode, 'order', 'one located place is not enough to place the others');
    assert.match(mapCaption(tripMap(located())), /Positions use WGS84 coordinates as entered\. Arrows are planned connections, not routes or travel times\./);
});

test('the drawing is self-contained SVG with escaped text and no map tiles', () => {
    let trip = place(located(), 'kyoto', { name: 'Kyoto <script>alert(1)</script>' });
    const svg = mapSvg(tripMap(trip), 'Whole trip');
    assert.match(svg, /^<svg class="schematic-map" viewBox="0 0 640 360" role="img" aria-label="Whole trip">/);
    assert.ok(!/<script|<image|href=|url\(http|<foreignObject/i.test(svg), 'no scripts, images or external references');
    assert.ok(svg.includes('Kyoto &lt;script&gt;'));
    assert.equal((svg.match(/<circle/g) || []).length, 2);
    assert.equal((svg.match(/class="map-edge journey"/g) || []).length, 2);
    assert.ok(!/NaN|undefined/.test(svg));
    assert.ok(!/NaN|undefined/.test(mapSvg(dayMap(trip, { day: '2027-04-13' }), 'Day')));
    assert.ok(!/NaN|undefined/.test(mapSvg(tripMap(thanksgivingExample()), 'One place')));
});

test('map links are offered only after a person reviewed them, and only on the providers\' own sites', () => {
    const trip = parallelTrip();
    const saved = place(trip, 'kyoto', { amapUrl: 'https://surl.amap.com/synthetic', appleMapsUrl: 'https://maps.apple.com/?q=Kyoto' }).places[0];
    assert.equal(saved.navReviewed, false);
    assert.deepEqual(reviewedLinks(saved), [], 'an unreviewed link is stored but never offered');
    const reviewed = place(trip, 'kyoto', { amapUrl: 'https://surl.amap.com/synthetic', appleMapsUrl: 'https://maps.apple.com/?q=Kyoto', navReviewed: true });
    assert.deepEqual(reviewedLinks(reviewed.places[0]).map(l => l.label), ['Amap 高德', 'Apple Maps']);
    const changed = place(reviewed, 'kyoto', { amapUrl: 'https://surl.amap.com/other' }).places[0];
    assert.equal(changed.navReviewed, false, 'changing a link makes it unreviewed again');
    assert.equal(place(reviewed, 'kyoto', { name: 'Kyoto renamed' }).places[0].navReviewed, true, 'other edits keep the review');
    assert.equal(place(trip, 'kyoto', { navReviewed: true }).places[0].navReviewed, false, 'nothing to review without a link');
    for (const bad of ['http://surl.amap.com/x', 'https://amap.com.evil.example/x', 'https://example.com/amap.com', 'javascript:alert(1)'])
        assert.throws(() => mapUrl('amap', bad), /Amap link must start with https/);
    for (const bad of ['https://maps.google.com/?q=x', 'http://maps.apple.com/?q=x', 'https://maps.apple.com.evil.example/'])
        assert.throws(() => mapUrl('apple', bad), /Apple Maps link must start with https:\/\/maps\.apple\.com/);
    assert.equal(mapUrl('amap', 'https://www.amap.com/place/B000A8UIN8'), 'https://www.amap.com/place/B000A8UIN8');
    assert.equal(appleSearchUrl({ name: 'Forbidden City', localName: '故宫', localAddress: '景山前街4号' }), `https://maps.apple.com/?q=${encodeURIComponent('故宫 景山前街4号')}`, 'the search helper uses names and addresses only, never coordinates');
    assert.equal(appleSearchUrl({}), '');
    assert.deepEqual(normalizePlaceGeo({}), { lat: null, lng: null, coordSystem: '', coordSource: '', amapUrl: '', appleMapsUrl: '', navReviewed: false });
});

test('location details stay out of the guest view and are kept in the private offline copy', () => {
    const trip = place(located(), 'kyoto', { amapUrl: 'https://surl.amap.com/PRIVATE', navReviewed: true });
    const guest = JSON.stringify(publicTrip(trip));
    assert.ok(!/35\.0116|coordSystem|amap|Synthetic test value/.test(guest));
    assert.ok(!board(publicTrip(trip), { guest: true }).includes('amap'));
    const html = buildOfflineHtml({ trip, revision: 3 }, { downloadedAt: '2026-11-16T00:00:00Z' });
    assert.ok(html.includes('Coordinates: 35.0116, 135.7681 (WGS84) · source: Synthetic test value'));
    assert.ok(html.includes('Amap (reviewed): https://surl.amap.com/PRIVATE'));
    assert.ok(!/<a |<script|<img/.test(html), 'the offline file stays free of links, scripts and images');
});

test('a trip saved before places had locations is unchanged by the new fields', () => {
    const trip = thanksgivingExample(), old = structuredClone(trip);
    for (const p of old.places)
        for (const key of ['lat', 'lng', 'coordSystem', 'coordSource', 'amapUrl', 'appleMapsUrl', 'navReviewed'])
            delete p[key];
    assert.deepEqual(diffTrips(old, trip), []);
    assert.deepEqual(diffTrips(old, applyTripChange(old, { action: 'edit', activityId: 'option-1', patch: { time: 'Late' } })).map(r => r.id), ['option-1']);
});

test('the planner draws both maps from the current filter and day', async () => {
    const script = await source('public/planner.js');
    assert.match(script, /tripMap\(t, \{ filter: state\.filter, compact: phone\(\) \}\) : dayMap\(t, \{ filter: state\.filter, day: state\.day, compact: phone\(\) \}\)/);
    assert.equal(script.match(/\$\{ideasSection\(t\)\}\$\{mapsSection\(t\)\}/g).length, 1, 'on a phone: below the schedule and the ideas');
    assert.ok(script.indexOf('<div class="board-notes">') < script.lastIndexOf('${mapsSection(t)}'), 'on desktop: below the board, where the ideas sit beside the days');
    assert.match(script, /No reviewed map link yet/);
    assert.match(script, /el\.form\.elements\.navReviewed\.checked = false/);
    assert.ok((await source('public/sw.js')).includes('"/maps.mjs"'), 'maps work from the offline shell');
});
