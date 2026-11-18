// The mapping features added after the first maps pass: links that work from text, directions,
// plans with no place, markers that lead to the list, the route in words, the guest map, and the
// fallback when the drawing cannot be made. All data is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyTripChange, publicTrip, thanksgivingExample } from '../lib/trips.mjs';
import { parallelTrip } from './fixtures/parallel-trip.mjs';
import { tripMap, dayMap, mapSvg, placeLinks, activityLinks, textSearchLinks, textDirectionLinks, placeAddressText, routeText } from '../public/maps.mjs';
import { mapBodyHtml, mapSectionHtml, placeDetails, linkRow, followPin } from '../public/map-panel.mjs';
import { activityViewHtml } from '../public/activity-view.mjs';
const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const place = (trip, placeId, patch) => applyTripChange(trip, { action: 'place-edit', placeId, patch });
const enc = encodeURIComponent, DAY = '2027-04-13';

test('a place always has a way out to a map app, chosen from the best text it has', () => {
    const bare = parallelTrip().places.find(p => p.id === 'kyoto');
    // Name only: a search of the name, and no directions (a name is not an address).
    let links = placeLinks(bare);
    assert.deepEqual([links.search.kind, links.search.label, links.directions, links.reviewed], ['name', 'Search this place’s name in', null, []]);
    assert.equal(links.search.links[0].url, `https://maps.apple.com/?q=${enc('Kyoto')}`);
    // An address: the local-script name and address are preferred, and directions go to the address alone.
    const addressed = place(parallelTrip(), 'kyoto', { address: '3 Tide Street', localName: '潮街馆', localAddress: '潮街3号' }).places[0];
    links = placeLinks(addressed);
    assert.equal(links.search.kind, 'place');
    assert.equal(links.search.links[1].url, `https://www.google.com/maps/search/?api=1&query=${enc('潮街馆 潮街3号')}`);
    assert.deepEqual(links.directions.links.map(l => l.url), [`https://maps.apple.com/?daddr=${enc('潮街3号')}`, `https://www.google.com/maps/dir/?api=1&destination=${enc('潮街3号')}`]);
    // A typed map address wins and is passed exactly.
    const typed = place({ ...parallelTrip(), places: [addressed, ...parallelTrip().places.slice(1)] }, 'kyoto', { locationText: '12 Lantern Row, Harbour Town' }).places[0];
    links = placeLinks(typed);
    assert.equal(links.search.kind, 'address');
    assert.equal(links.search.links[0].url, `https://maps.apple.com/?q=${enc('12 Lantern Row, Harbour Town')}`);
    assert.equal(links.directions.links[0].url, `https://maps.apple.com/?daddr=${enc('12 Lantern Row, Harbour Town')}`);
    assert.equal(placeAddressText(typed), '12 Lantern Row, Harbour Town');
});

test('reviewed links stay first: with one, no guessed search or directions are offered beside it', () => {
    const reviewed = place(parallelTrip(), 'kyoto', { address: '3 Tide Street', amapUrl: 'https://surl.amap.com/synthetic', navReviewed: true }).places[0];
    const links = placeLinks(reviewed);
    assert.deepEqual(links.reviewed.map(l => l.label), ['Amap 高德']);
    assert.deepEqual([links.search, links.directions], [null, null]);
    // A map address the person typed themselves is still searchable.
    const both = placeLinks({ ...reviewed, locationText: '12 Lantern Row' });
    assert.equal(both.search.kind, 'address');
    assert.equal(both.directions, null);
    const html = placeDetails(reviewed, { canEdit: true, directions: true });
    assert.ok(html.includes('class="map-link" href="https://surl.amap.com/synthetic"') && !html.includes('map-link search'));
});

test('no link is ever built from coordinates, and none for Amap', async () => {
    const located = place(parallelTrip(), 'kyoto', { locationText: '35.0116, 135.7681', coordSystem: 'GCJ02' }).places[0];
    const html = placeDetails(located, { canEdit: true, directions: true }) + JSON.stringify(placeLinks(located));
    assert.ok(!/35\.0116|135\.7681/.test(html.replace(/35\.0116° N, 135\.7681° E/g, '')), 'the numbers appear only as text, never in a link');
    assert.equal(placeLinks(located).directions, null);
    assert.deepEqual(textSearchLinks('  '), []);
    assert.deepEqual(textDirectionLinks(''), []);
    const code = await source('public/maps.mjs') + await source('public/map-panel.mjs');
    assert.ok(!/uri\.amap\.com|amap\.com\/(marker|navigation|search)|ll=|sll=|center=/.test(code));
    const panel = await source('public/map-panel.mjs');
    assert.ok(!/XMLHttpRequest|<img|tile/i.test(panel) && (panel.match(/fetch\(/g) || []).length === 1, 'the panel loads nothing but the Google day map and its reachability question (tests/google-embed.test.mjs)');
    assert.equal((panel.match(/<iframe/g) || []).length, 1, 'the only frame is the Google day map, drawn when a key is configured (tests/google-embed.test.mjs)');
});

test('an activity with no place stays usable: it can be opened, and its own address gives links', () => {
    let trip = applyTripChange(parallelTrip(), { action: 'add', activity: { id: 'no-place', title: 'Tea somewhere', date: DAY, placeId: null, participants: ['cedar'], order: 99, address: '7 Kettle Lane, Harbour Town' } });
    trip = applyTripChange(trip, { action: 'add', activity: { id: 'nowhere', title: 'To be decided', date: DAY, placeId: null, participants: ['cedar'], order: 100 } });
    const links = activityLinks(trip.activities.find(a => a.id === 'no-place'));
    assert.equal(links.search.links[0].url, `https://maps.apple.com/?q=${enc('7 Kettle Lane, Harbour Town')}`);
    assert.equal(links.directions.links[1].url, `https://www.google.com/maps/dir/?api=1&destination=${enc('7 Kettle Lane, Harbour Town')}`);
    assert.deepEqual(activityLinks(trip.activities.find(a => a.id === 'nowhere')), { reviewed: [], search: null, directions: null });
    const html = mapBodyHtml(trip, { view: 'day', filter: 'cedar', day: DAY, canEdit: true });
    assert.match(html, /Location to confirm \(2\)/);
    assert.ok(html.includes('data-detail="no-place"') && html.includes('data-detail="nowhere"'), 'each can be opened from the map');
    assert.ok(html.includes(`https://maps.apple.com/?daddr=${enc('7 Kettle Lane, Harbour Town')}`));
    // The activity view offers the same links when there is no place.
    const view = activityViewHtml(trip.activities.find(a => a.id === 'no-place'), trip, { canEdit: true });
    assert.ok(view.includes(`https://maps.apple.com/?q=${enc('7 Kettle Lane, Harbour Town')}`) && view.includes('Directions to this address in'));
    // Guests are sent no address, and get no link even if one were present.
    assert.deepEqual(activityLinks({ address: '7 Kettle Lane' }, { guest: true }), { reviewed: [], search: null, directions: null });
    assert.ok(!mapBodyHtml(publicTrip(trip), { view: 'day', day: DAY, guest: true }).includes('Kettle'));
});

test('the day list opens each activity and offers directions; the trip list offers searches only', () => {
    const trip = place(parallelTrip(), 'kyoto', { address: '3 Tide Street' });
    const day = mapBodyHtml(trip, { view: 'day', day: DAY, canEdit: true });
    const shown = trip.activities.filter(a => a.date === DAY && a.placeId);
    for (const a of shown)
        assert.ok(day.includes(`data-detail="${a.id}"`), a.id);
    assert.match(day, /Directions to this address in/);
    const whole = mapBodyHtml(trip, { view: 'trip', canEdit: true });
    assert.ok(!/Directions to this address in/.test(whole) && /Search this place and address in/.test(whole));
    assert.match(whole, /data-place-edit="kyoto"/);
    assert.ok(!mapBodyHtml(trip, { view: 'trip', canEdit: false }).includes('data-place-edit'), 'no Edit place without edit rights');
});

test('markers lead to their entry in the list, by tap or keyboard', () => {
    const model = dayMap(parallelTrip(), { day: DAY });
    const plain = mapSvg(model, 'Day');
    assert.ok(!/href=/.test(plain) && plain.includes('role="img"'), 'unchanged unless asked for');
    const svg = mapSvg(model, 'Day', { anchors: true });
    assert.ok(svg.includes('role="group"'));
    const hrefs = [...svg.matchAll(/<a class="map-pin" href="(#map-stop-\d+)" aria-label="([^"]+)">/g)];
    assert.equal(hrefs.length, model.nodes.length);
    assert.ok(hrefs.every(h => /^Stop [\d,]+: .+\. Go to its details in the list\.$/.test(h[2])));
    assert.ok(!/href="(?!#map-stop-)/.test(svg), 'the only references are to the page itself');
    const html = mapBodyHtml(parallelTrip(), { view: 'day', day: DAY });
    for (const [, href] of hrefs)
        assert.ok(html.includes(`<li id="${href.slice(1)}" tabindex="-1">`), href);
    // A place visited twice is one marker carrying both numbers; it leads to the first visit.
    let round = applyTripChange(thanksgivingExample(), { action: 'place-add', place: { id: 'trail', name: 'Synthetic trail' } });
    round = applyTripChange(round, { action: 'edit', activityId: 'option-3', patch: { placeId: 'trail' } });
    const loop = mapBodyHtml(round, { view: 'day', day: '2026-11-26' });
    assert.ok(loop.includes('href="#map-stop-1" aria-label="Stop 1,3:') && loop.includes('id="map-stop-3"'));
    // followPin moves focus to the entry and reports that it handled the click.
    let focused = null, prevented = false;
    const entry = { scrollIntoView() { }, focus() { focused = 'map-stop-2'; } };
    const pin = { getAttribute: () => '#map-stop-2' };
    assert.equal(followPin({ getElementById: id => id === 'map-stop-2' ? entry : null }, { target: { closest: s => s === 'a.map-pin' ? pin : null }, preventDefault() { prevented = true; } }), true);
    assert.deepEqual([focused, prevented], ['map-stop-2', true]);
    assert.equal(followPin({}, { target: { closest: () => null } }), false);
});

test('the route is also said in words', () => {
    assert.equal(routeText(tripMap(parallelTrip(), { filter: 'cedar' })), 'Journeys in date order: Kyoto → Osaka (Train · 2027-04-14).');
    const day = dayMap(parallelTrip(), { day: DAY });
    assert.equal(routeText(day), `In itinerary order: ${day.stops.map(s => `${s.n}. ${s.name}`).join(' → ')}.`);
    assert.equal(routeText(tripMap(thanksgivingExample())), '', 'one place has no route');
    const noJourneys = tripMap({ ...parallelTrip(), legs: [] });
    assert.match(routeText(noJourneys), /^Places in date order: .+ → .+\. No journeys between them are entered yet\.$/);
    assert.ok(mapBodyHtml(parallelTrip(), { view: 'trip', filter: 'cedar' }).includes('<p class="map-route">Journeys in date order: Kyoto → Osaka (Train · 2027-04-14).</p>'));
});

test('if the drawing cannot be made, the list and its links are still there', () => {
    const trip = place(parallelTrip(), 'kyoto', { address: '3 Tide Street' });
    const html = mapBodyHtml(trip, { view: 'day', day: DAY, canEdit: true, draw: () => { throw new Error('no SVG here'); } });
    assert.ok(!html.includes('<svg'));
    assert.match(html, /The drawing could not be shown on this device\. The stops and their links are listed below in order\./);
    assert.ok(html.includes('<ol class="map-list"') && html.includes('map-link search') && html.includes('class="map-route"'));
    const ok = mapBodyHtml(trip, { view: 'day', day: DAY });
    assert.ok(ok.includes('<svg') && !ok.includes('could not be shown'));
});

test('guests get the same map, drawn only from what the guest link already sends', () => {
    let trip = place(parallelTrip(), 'kyoto', { locationText: '35.0116, 135.7681', coordSystem: 'WGS84', address: 'PRIVATE Tide Street', amapUrl: 'https://surl.amap.com/PRIVATE', navReviewed: true });
    trip = place(trip, 'osaka', { locationText: '34.6937, 135.5023', coordSystem: 'WGS84' });
    assert.equal(dayMap(trip, { day: DAY }).mode, 'position', 'signed-in people see positions');
    const shared = publicTrip(trip);
    const model = dayMap(shared, { day: DAY });
    assert.equal(model.mode, 'order', 'guests see plan order: no coordinates are sent');
    const html = mapSectionHtml(shared, { view: 'day', day: DAY, guest: true });
    assert.ok(html.includes('<svg') && html.includes('data-map-view="trip"'));
    assert.ok(!/PRIVATE|35\.0116|amap|maps\.apple|google\.com|data-place-edit|coordinates|Edit place|No reviewed map link/.test(html), 'no address, coordinates, link, edit control or talk of coordinates');
    for (const a of shared.activities.filter(x => x.date === DAY && x.placeId))
        assert.ok(html.includes(`data-detail="${a.id}"`));
    assert.deepEqual(placeLinks(trip.places[0], { guest: true }), { reviewed: [], search: null, directions: null });
    // Journeys are not shared, and stays only when the organizer ticked them.
    const whole = mapBodyHtml(shared, { view: 'trip', guest: true });
    assert.match(whole, /No stays are shared on this guest link/);
    const withStay = publicTrip({ ...trip, stays: trip.stays.map(s => ({ ...s, showOnGuest: true })) });
    assert.ok(mapBodyHtml(withStay, { view: 'trip', guest: true }).includes('<ol class="map-list"'));
    assert.equal(linkRow(null, 'x'), '');
});

test('both pages use the shared panel, and it is in the offline shell', async () => {
    const planner = await source('public/planner.js'), guest = await source('public/guest.mjs'), sw = await source('public/sw.js'), css = await source('public/planner.css');
    assert.match(planner, /mapSectionHtml\(t, mapOptions\(\)\)/);
    assert.match(planner, /canEdit: true, dayName/);
    assert.match(planner, /if \(followPin\(document, event\)\)/);
    assert.match(guest, /mapSectionHtml\(trip, \{ view: mapView, filter, day, compact: layout, guest: true, dayName, embedKey:/);
    assert.match(guest, /if \(followPin\(document, e\)\)/);
    assert.equal(guest.match(/\$\{schedule\}\$\{map\}/g).length, 2, 'under the schedule on phone and desktop');
    assert.ok(sw.includes('"/map-panel.mjs"'));
    assert.match(css, /@media \(orientation: landscape\) and \(max-height: 500px\) \{ \.schematic-map \{ max-height: 78vh/);
    assert.match(css, /\.map-pin:focus-visible circle/);
});
