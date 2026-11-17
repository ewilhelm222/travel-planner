// "Location for the map" accepts an address or place name as well as coordinates.
// All data here is made up: the addresses do not exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyTripChange, publicTrip, normalizeTrip } from '../lib/trips.mjs';
import { parallelTrip } from './fixtures/parallel-trip.mjs';
import { parseLocation, normalizePlaceGeo, locationInput, locationAddress, describeLocation, searchLinks, reviewedLinks, tripMap, dayMap } from '../public/maps.mjs';
import { activityViewHtml } from '../public/activity-view.mjs';
import { buildOfflineHtml } from '../public/offline-export.mjs';
import { diffTrips, fieldChanges } from '../public/history.mjs';
const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const place = (trip, placeId, patch) => applyTripChange(trip, { action: 'place-edit', placeId, patch });
const ADDRESS = '12 Lantern Row, Harbour Town';

test('typed text is read as coordinates only when it is a complete pair in decimal degrees', () => {
    const pair = { kind: 'coordinates', lat: 39.9163, lng: 116.3972 };
    for (const typed of ['39.9163, 116.3972', '39.9163,116.3972', '39.9163 116.3972', '  39.9163 ; 116.3972 ', '39.9163，116.3972', '39.9163° N, 116.3972° E', '39.9163N 116.3972E', 'N 39.9163 E 116.3972', 'n39.9163 e116.3972', '116.3972 E, 39.9163 N', '+39.9163, +116.3972'])
        assert.deepEqual(parseLocation(typed), pair, typed);
    assert.deepEqual(parseLocation('-33.8568, 151.2153'), { kind: 'coordinates', lat: -33.8568, lng: 151.2153 });
    assert.deepEqual(parseLocation('33.8568 S, 70.5 W'), { kind: 'coordinates', lat: -33.8568, lng: -70.5 }, 'S and W are negative');
    assert.deepEqual(parseLocation(''), { kind: 'empty' });
    assert.deepEqual(parseLocation('   '), { kind: 'empty' });
    assert.deepEqual(parseLocation(null), { kind: 'empty' });
});

test('anything with words in it is an address or place name, kept as typed', () => {
    for (const typed of [ADDRESS, 'Harbour Town Lighthouse', '221B Lantern Row', '4 Rue E', '灯笼巷12号', 'Kiosk 7, North Quay 39.9', 'N'.repeat(2) + ' Pier'])
        assert.deepEqual(parseLocation(typed), { kind: 'address', text: typed }, typed);
    assert.deepEqual(parseLocation(`  ${ADDRESS}  `), { kind: 'address', text: ADDRESS }, 'only the outer spaces go');
});

test('numbers that are not a usable pair are refused with a reason, never searched or guessed', () => {
    assert.throws(() => parseLocation('35'), /not a complete pair/);
    assert.throws(() => parseLocation('35, 135, 12'), /not a complete pair/);
    assert.throws(() => parseLocation('39.9 N, 116.4 N'), /not a complete pair/);
    assert.throws(() => parseLocation('-39.9 S, 116 E'), /not a complete pair/, 'a minus sign and a compass letter disagree');
    assert.throws(() => parseLocation('95, 135'), /Latitude must be a number between -90 and 90/);
    assert.throws(() => parseLocation('35, 200'), /Longitude must be a number between -180 and 180/);
    assert.throws(() => parseLocation('39°54′20″N 116°23′29″E'), /degrees, minutes and seconds/);
    assert.throws(() => parseLocation('39,9163 116,3972'), /full stop for decimals/);
});

test('an address is saved exactly as typed, with no coordinates and no coordinate system', () => {
    const trip = place(parallelTrip(), 'kyoto', { locationText: `  ${ADDRESS} ` }), kyoto = trip.places.find(p => p.id === 'kyoto');
    assert.deepEqual([kyoto.locationText, kyoto.lat, kyoto.lng, kyoto.coordSystem], [ADDRESS, null, null, '']);
    assert.equal(locationInput(kyoto), ADDRESS, 'the form shows it back unchanged');
    assert.equal(locationAddress(kyoto), ADDRESS);
    assert.deepEqual(describeLocation(kyoto).kind, 'address');
    assert.equal(describeLocation(kyoto).text, ADDRESS);
    // Round trip: what was saved normalizes to itself.
    assert.deepEqual(normalizeTrip(trip, trip.id), trip);
    assert.deepEqual(normalizePlaceGeo(kyoto), { locationText: ADDRESS, lat: null, lng: null, coordSystem: '', coordSource: '', amapUrl: '', appleMapsUrl: '', navReviewed: false });
    // A system chosen by mistake does not stick to an address.
    assert.equal(place(parallelTrip(), 'kyoto', { locationText: ADDRESS, coordSystem: 'GCJ02' }).places[0].coordSystem, '');
});

test('typed coordinates keep the text as typed and still need an explicit system', () => {
    const typed = '35.0116° N, 135.7681° E';
    assert.throws(() => place(parallelTrip(), 'kyoto', { locationText: typed }), /Say which coordinate system these numbers use, or choose Unknown/);
    const kyoto = place(parallelTrip(), 'kyoto', { locationText: typed, coordSystem: 'GCJ02' }).places[0];
    assert.deepEqual([kyoto.locationText, kyoto.lat, kyoto.lng, kyoto.coordSystem], [typed, 35.0116, 135.7681, 'GCJ02'], 'the numbers are read, not converted');
    assert.equal(locationInput(kyoto), typed);
    assert.deepEqual(describeLocation(kyoto), { kind: 'coordinates', text: '35.0116° N, 135.7681° E', note: 'GCJ-02' });
    assert.equal(describeLocation({ lat: -33.8568, lng: -70.5, coordSystem: 'unknown' }).text, '33.8568° S, 70.5° W');
    assert.throws(() => place(parallelTrip(), 'kyoto', { locationText: '95, 135', coordSystem: 'WGS84' }), /Latitude must be a number/);
});

test('a place saved with coordinates before this change is untouched and keeps working', () => {
    // As stored by the first maps pass: two numbers and a system, no typed text.
    const before = place(parallelTrip(), 'kyoto', { lat: 35.0116, lng: 135.7681, coordSystem: 'WGS84', coordSource: 'Synthetic test value' });
    const stored = structuredClone(before);
    for (const p of stored.places)
        delete p.locationText;
    assert.deepEqual(diffTrips(stored, normalizeTrip(stored, stored.id)), [], 'reading an older trip changes nothing');
    const kyoto = normalizeTrip(stored, stored.id).places[0];
    assert.deepEqual([kyoto.locationText, kyoto.lat, kyoto.lng, kyoto.coordSystem, kyoto.coordSource], ['', 35.0116, 135.7681, 'WGS84', 'Synthetic test value']);
    assert.equal(locationInput(kyoto), '35.0116, 135.7681', 'the form shows the stored pair');
    // Another edit to the place leaves the location alone.
    const renamed = place(stored, 'kyoto', { name: 'Kyoto renamed', coordSystem: 'WGS84' }).places[0];
    assert.deepEqual([renamed.lat, renamed.lng, renamed.coordSystem, renamed.locationText], [35.0116, 135.7681, 'WGS84', '']);
    assert.deepEqual(fieldChanges(diffTrips(normalizeTrip(stored, stored.id), place(stored, 'kyoto', { name: 'Kyoto renamed' }))[0]).map(f => f.field), ['name']);
    // It is still positioned on the map exactly as before.
    const both = place(stored, 'osaka', { lat: 34.6937, lng: 135.5023, coordSystem: 'WGS84' });
    assert.equal(tripMap(both, { filter: 'all' }).mode, 'position');
});

test('switching between an address and coordinates replaces one with the other', () => {
    const located = place(parallelTrip(), 'kyoto', { lat: 35.0116, lng: 135.7681, coordSystem: 'WGS84' });
    const address = place(located, 'kyoto', { locationText: ADDRESS, coordSystem: '' }).places[0];
    assert.deepEqual([address.locationText, address.lat, address.lng, address.coordSystem], [ADDRESS, null, null, '']);
    const back = place({ ...located, places: located.places.map(p => p.id === 'kyoto' ? address : p) }, 'kyoto', { locationText: '35.0116, 135.7681', coordSystem: 'WGS84' }).places[0];
    assert.deepEqual([back.locationText, back.lat, back.lng, back.coordSystem], ['35.0116, 135.7681', 35.0116, 135.7681, 'WGS84']);
    const cleared = place({ ...located, places: located.places.map(p => p.id === 'kyoto' ? back : p) }, 'kyoto', { locationText: '', coordSystem: '' }).places[0];
    assert.deepEqual([cleared.locationText, cleared.lat, cleared.lng, cleared.coordSystem], ['', null, null, '']);
    // A planner page loaded before this change still sends two numbers; they replace a typed address.
    const withAddress = { ...located, places: located.places.map(p => p.id === 'kyoto' ? address : p) };
    const old = place(withAddress, 'kyoto', { lat: '34.9', lng: '135.7', coordSystem: 'WGS84' }).places[0];
    assert.deepEqual([old.locationText, old.lat, old.lng], ['', 34.9, 135.7]);
});

test('an address is offered as map-app searches of exactly the typed text, apart from reviewed links', () => {
    const typed = 'Café Lanterne & Co, 12 Lantern Row #4';
    const kyoto = place(parallelTrip(), 'kyoto', { locationText: typed }).places[0];
    const links = searchLinks(kyoto);
    assert.deepEqual(links.map(l => l.label), ['Apple Maps', 'Google Maps']);
    assert.equal(links[0].url, `https://maps.apple.com/?q=${encodeURIComponent(typed)}`);
    assert.equal(links[1].url, `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(typed)}`);
    for (const l of links)
        assert.equal(decodeURIComponent(new URL(l.url).searchParams.get(l.label === 'Apple Maps' ? 'q' : 'query')), typed, 'the query survives encoding unchanged');
    assert.deepEqual(reviewedLinks(kyoto), [], 'a search is never presented as a reviewed link');
    // No search is built from coordinates, in any system, or from nothing.
    assert.deepEqual(searchLinks(place(parallelTrip(), 'kyoto', { locationText: '35.0116, 135.7681', coordSystem: 'WGS84' }).places[0]), []);
    assert.deepEqual(searchLinks(place(parallelTrip(), 'kyoto', { lat: 35.0116, lng: 135.7681, coordSystem: 'GCJ02' }).places[0]), []);
    assert.deepEqual(searchLinks(parallelTrip().places[0]), []);
    assert.deepEqual(searchLinks(null), []);
});

test('an address never positions a place on the drawing', () => {
    let trip = place(parallelTrip(), 'kyoto', { locationText: ADDRESS });
    trip = place(trip, 'osaka', { locationText: '3 Tide Street, Harbour Town' });
    const model = tripMap(trip, { filter: 'all' });
    assert.equal(model.mode, 'order', 'two addresses are drawn in plan order, not by position');
    assert.ok(model.nodes.every(n => !n.positioned));
    const mixed = tripMap(place(trip, 'osaka', { locationText: '34.6937, 135.5023', coordSystem: 'WGS84' }), { filter: 'all' });
    assert.equal(mixed.mode, 'order', 'one located place is not enough to position anything');
    const day = trip.activities.find(a => a.date && a.placeId)?.date;
    assert.ok(dayMap(trip, { filter: 'all', day }).nodes.every(n => !n.positioned));
});

test('the code looks nothing up: no geocoding request, key or coordinate conversion', async () => {
    const code = await source('public/maps.mjs') + await source('lib/trips.mjs') + await source('public/planner.js') + await source('public/activity-view.mjs') + await source('app/api/trip/route.ts');
    assert.ok(!/nominatim|geocod(e|ing)\s*\(|api\.mapbox|maps\.googleapis|restapi\.amap|api_?key|apikey/i.test(code));
    assert.ok(!/fetch\(/.test(await source('public/maps.mjs')), 'the map rules make no network request');
    assert.ok(!/wgs2gcj|gcj2wgs|gcj2bd|bd2gcj|6378245|0\.00669342/i.test(code));
});

test('the typed location is private: guests never receive it, the private offline copy lists it as text', () => {
    const trip = place(parallelTrip(), 'kyoto', { locationText: ADDRESS });
    assert.ok(!JSON.stringify(publicTrip(trip)).includes('Lantern'));
    const a = trip.activities.find(x => x.placeId === 'kyoto');
    const guestView = activityViewHtml(publicTrip(trip).activities.find(x => x.id === a.id), publicTrip(trip), { guest: true });
    assert.ok(!/Lantern|maps\.apple\.com|google\.com\/maps/.test(guestView));
    // Even if a guest page were handed a private place, the guest view draws no address or search.
    assert.ok(!/Lantern|maps\.apple\.com|google\.com\/maps/.test(activityViewHtml(a, trip, { guest: true })));
    const view = activityViewHtml(a, trip, { canEdit: true });
    assert.ok(view.includes(`https://maps.apple.com/?q=${encodeURIComponent(ADDRESS)}`));
    assert.match(view, /Search this address in/);
    assert.match(view, /not a checked link/);
    const html = buildOfflineHtml({ trip, revision: 3 }, { downloadedAt: '2026-11-17T00:00:00Z' });
    assert.ok(html.includes(`Address for map apps: ${ADDRESS}`));
    assert.ok(!/<a |<script|<img/.test(html));
});

test('the place form has one box for either form, says how it was read, and sends it only when edited', async () => {
    const script = await source('public/planner.js');
    assert.match(script, /<legend>Location for the map <small>\(optional\)<\/small><\/legend><label>Street address, place name or GPS coordinates<input name="locationText"/);
    assert.match(script, /Either is fine\./);
    assert.ok(!/name="lat"|name="lng"/.test(script), 'the separate latitude and longitude boxes are gone');
    assert.match(script, /typed === box\.dataset\.initial \? \{\} : \{ locationText: typed \}/);
    assert.match(script, /\$\('#coord-fields'\)\.hidden = read\.kind !== 'coordinates'/);
    assert.match(script, /locationText: 'Location for the map'/, 'History names the field in words');
});
