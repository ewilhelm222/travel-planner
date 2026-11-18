// Google Maps Embed for the day map (owner decision, November 17, 2026). All places, addresses and
// the key below are made up; the key has the shape of a real one and unlocks nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { applyTripChange, publicTrip, thanksgivingExample, normalizeTrip, editorRestriction, editorDiffRestriction, EDITOR_TRIP_DETAILS } from '../lib/trips.mjs';
import { diffTrips, fieldChanges, undoChange } from '../public/history.mjs';
import { parallelTrip } from './fixtures/parallel-trip.mjs';
import { dayMap, tripMap, dayEmbed, embedUrl, embedLocation, validEmbedKey, EMBED_MAX_WAYPOINTS } from '../public/maps.mjs';
import { mapBodyHtml, mapSectionHtml } from '../public/map-panel.mjs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const KEY = 'AIzaSy' + 'TESTONLYnotARealKey0123456789abcd', DAY = '2027-04-13', enc = encodeURIComponent;
const place = (trip, placeId, patch) => applyTripChange(trip, { action: 'place-edit', placeId, patch });
// Kyoto by typed address, Osaka by WGS-84 coordinates: both usable.
const usable = () => place(place(parallelTrip(), 'kyoto', { locationText: '12 Lantern Row, Harbour Town' }), 'osaka', { locationText: '34.6937, 135.5023', coordSystem: 'WGS84' });
const frameSrc = html => (html.match(/<iframe[^>]* data-src="([^"]+)"/) || [])[1]?.replaceAll('&amp;', '&') || '';

test('what is sent for a place is what was entered: a typed address, WGS-84 coordinates, or its address', () => {
    assert.equal(embedLocation({ locationText: ' 12 Lantern Row, Harbour Town ', address: 'other' }), '12 Lantern Row, Harbour Town');
    assert.equal(embedLocation({ lat: 34.6937, lng: 135.5023, coordSystem: 'WGS84', address: '3 Tide Street' }), '34.6937,135.5023', 'coordinates as entered, when they are in the system Google expects');
    assert.equal(embedLocation({ name: 'Pier', localAddress: '潮街3号', address: '3 Tide Street' }), '潮街3号');
    assert.equal(embedLocation({ name: 'Pier', address: '3 Tide Street' }), '3 Tide Street');
    // Coordinates in another system are never sent: Google would misplace them, and converting is guesswork.
    for (const coordSystem of ['GCJ02', 'BD09', 'unknown'])
        assert.equal(embedLocation({ name: 'Pier', lat: 39.9163, lng: 116.3972, coordSystem }), null, coordSystem);
    assert.equal(embedLocation({ name: 'Pier', lat: 39.9163, lng: 116.3972, coordSystem: 'GCJ02', address: '3 Tide Street' }), '3 Tide Street', 'the address is used instead');
    assert.equal(embedLocation({ name: 'Beacon Hill' }), null, 'a bare name is not a usable location');
    assert.equal(embedLocation(null), null);
});

test('one stop is shown in place mode', () => {
    const trip = place(thanksgivingExample(), 'home', { locationText: '1 Example Shore Road' });
    const embed = dayEmbed(dayMap(trip, { day: '2026-11-26' }));
    assert.deepEqual(embed, { ok: true, mode: 'place', q: '1 Example Shore Road', count: 1 });
    assert.equal(embedUrl(embed, KEY), `https://www.google.com/maps/embed/v1/place?key=${KEY}&q=${enc('1 Example Shore Road')}`);
    const html = mapBodyHtml(trip, { view: 'day', day: '2026-11-26', embedKey: KEY });
    assert.equal(frameSrc(html), embedUrl(embed, KEY));
    assert.ok(!html.includes('Nothing to draw yet'), 'one stop is no longer an empty map');
});

test('several stops are shown in directions mode, in itinerary order', () => {
    let trip = usable();
    trip = applyTripChange(trip, { action: 'place-add', place: { id: 'pier', name: 'North Quay pier', address: '3 Tide Street & Co #4' } });
    trip = applyTripChange(trip, { action: 'add', activity: { id: 'late', title: 'Late walk', date: DAY, placeId: 'pier', participants: ['cedar'], order: 999 } });
    const model = dayMap(trip, { day: DAY }), embed = dayEmbed(model);
    assert.equal(embed.mode, 'directions');
    const expected = model.stops.map(s => embedLocation(s.place));
    assert.deepEqual([embed.origin, ...embed.waypoints, embed.destination], expected, 'origin, waypoints, destination follow the numbered stops');
    assert.ok(expected.length >= 3 && embed.count === expected.length);
    const url = new URL(embedUrl(embed, KEY));
    assert.equal(url.origin + url.pathname, 'https://www.google.com/maps/embed/v1/directions');
    assert.deepEqual([url.searchParams.get('origin'), url.searchParams.get('destination')], [expected[0], expected.at(-1)]);
    assert.deepEqual(url.searchParams.get('waypoints').split('|'), expected.slice(1, -1), 'each waypoint survives encoding, separated by |');
    assert.ok(embedUrl(embed, KEY).includes(enc('3 Tide Street & Co #4')), 'an address is passed as entered, encoded');
    // Two stops: no waypoints parameter at all.
    const two = dayEmbed({ kind: 'day', stops: model.stops.slice(0, 2) });
    assert.ok(!embedUrl(two, KEY).includes('waypoints'));
    // A place visited twice in a day appears twice, in order.
    let round = place(thanksgivingExample(), 'home', { locationText: '1 Example Shore Road' });
    round = applyTripChange(round, { action: 'place-add', place: { id: 'trail', name: 'Synthetic trail', locationText: '9 Trailhead Lane' } });
    round = applyTripChange(round, { action: 'edit', activityId: 'option-3', patch: { placeId: 'trail' } });
    const loop = dayEmbed(dayMap(round, { day: '2026-11-26' }));
    assert.deepEqual([loop.origin, loop.waypoints, loop.destination], ['1 Example Shore Road', ['9 Trailhead Lane'], '1 Example Shore Road']);
});

test('the schematic is the fallback: no key, a stop with no usable location, too many stops, or the person\'s choice', () => {
    const trip = usable(), options = { view: 'day', day: DAY, canEdit: true };
    // No key configured: exactly the panel as it was, with no mention of Google.
    const none = mapBodyHtml(trip, options);
    assert.ok(none.includes('<svg') && !/<iframe|Google Maps did|on Google Maps|data-map-style/.test(none));
    assert.equal(mapBodyHtml(trip, { ...options, embedKey: '' }), none);
    assert.equal(mapBodyHtml(trip, { ...options, embedKey: 'not a key' }), none, 'a malformed key behaves as no key');
    // A stop Google cannot place: schematic, with the reason and the place named.
    const gcj = place(trip, 'osaka', { locationText: '34.6937, 135.5023', coordSystem: 'GCJ02' });
    const blocked = mapBodyHtml(gcj, { ...options, embedKey: KEY });
    assert.ok(blocked.includes('<svg') && !blocked.includes('<iframe'));
    assert.match(blocked, /Shown as a schematic, not on Google Maps, because “Osaka” has no address and coordinates in a system Google Maps would misplace\. Add one under Edit place\./);
    const bare = mapBodyHtml(place(trip, 'osaka', { locationText: '', coordSystem: '' }), { ...options, embedKey: KEY });
    assert.match(bare, /because “Osaka” has no address or WGS-84 coordinates/);
    assert.ok(!KEY || !blocked.includes(KEY), 'the key is not put in a page that shows no Google map');
    // Too many stops for one embed.
    const many = { kind: 'day', stops: Array.from({ length: EMBED_MAX_WAYPOINTS + 3 }, (_, i) => ({ n: i + 1, name: `Stop ${i}`, place: { address: `${i} Row` } })) };
    assert.match(dayEmbed(many).reason, /at most 22 stops in one map and this day has 23/);
    assert.equal(dayEmbed({ kind: 'day', stops: many.stops.slice(0, 22) }).ok, true);
    assert.equal(embedUrl(dayEmbed(many), KEY), '');
    // The person chose the schematic, or Google did not load: the schematic, with a way back.
    const chosen = mapBodyHtml(trip, { ...options, embedKey: KEY, mapStyle: 'schematic' });
    assert.ok(chosen.includes('<svg') && !chosen.includes('<iframe') && chosen.includes('data-map-style="google">Show this day on Google Maps'));
    const failed = mapBodyHtml(trip, { ...options, embedKey: KEY, embedFailed: true });
    assert.ok(failed.includes('<svg') && !failed.includes('<iframe'));
    assert.match(failed, /<span role="status">Google Maps did not load, so this is the schematic\.<\/span> <button type="button" class="text-button" data-map-style="google">Try Google Maps again/);
    // No stops at all: nothing to embed.
    assert.deepEqual(dayEmbed(dayMap(trip, { day: '2027-04-17' })), { ok: false, reason: '' });
});

test('the Google map keeps the numbered list, the route in words and the links under it', () => {
    const html = mapBodyHtml(usable(), { view: 'day', day: DAY, canEdit: true, embedKey: KEY });
    assert.ok(html.includes('<iframe class="map-frame" id="map-frame"') && !html.includes('<svg'));
    assert.ok(html.indexOf('<iframe') < html.indexOf('<ol class="map-list"'));
    assert.ok(html.includes('id="map-stop-1"') && html.includes('class="map-route"') && html.includes('data-place-edit'));
    assert.match(html, /The stops’ addresses or coordinates are sent to Google to show it\./);
    assert.match(html, /The route and times are Google’s suggestion, not part of the plan\./);
    assert.match(html, /It does not load in mainland China\./);
    assert.match(html, /data-map-style="schematic">Show the schematic instead/);
    assert.match(html, /<iframe[^>]* title="Google Maps: [^"]+"/, 'the frame is named for screen readers');
    assert.match(html, /<iframe[^>]* referrerpolicy="strict-origin"/, 'Google is told the site, which a restricted key needs, and never the trip address');
    assert.ok(!/<iframe[^>]* src=/.test(html), 'the frame has no address until the page gives it one, so nothing is sent before it is in view');
});

test('the whole-trip view never uses Google, and guests do only when the organizer switched it on', () => {
    const trip = usable();
    const whole = mapSectionHtml(trip, { view: 'trip', embedKey: KEY, canEdit: true });
    assert.ok(whole.includes('<svg') && !/<iframe|google\.com\/maps\/embed/.test(whole));
    assert.equal(tripMap(trip).kind, 'trip');
    // Off, which is how every existing trip reads: guests are sent no location, so there is nothing to give Google.
    assert.equal(trip.guestMap, false);
    const shared = publicTrip(trip);
    assert.equal(shared.guestMap, false);
    assert.ok(shared.places.every(p => !('mapQuery' in p)));
    assert.ok(!/Lantern|34\.6937|mapQuery/.test(JSON.stringify(shared)));
    assert.equal(dayEmbed(dayMap(shared, { day: DAY })).ok, false);
    const off = mapSectionHtml(shared, { view: 'day', day: DAY, guest: true, embedKey: '' });
    assert.ok(off.includes('<svg') && !/<iframe|Google|data-map-style/.test(off));
});

test('switched on by the organizer, the guest link gets the day map and only the one line per stop it needs', () => {
    let trip = place(usable(), 'kyoto', { address: 'PRIVATE street address', coordSource: 'PRIVATE source', amapUrl: 'https://surl.amap.com/PRIVATE', navReviewed: true });
    trip = applyTripChange(trip, { action: 'place-add', place: { id: 'unused', name: 'Not on any shared day', locationText: 'PRIVATE unused address' } });
    trip = applyTripChange(trip, { action: 'place-add', place: { id: 'idea-place', name: 'Idea place', locationText: 'PRIVATE idea address' } });
    trip = applyTripChange(trip, { action: 'add', activity: { id: 'idea', title: 'An idea', date: null, placeId: 'idea-place', participants: ['cedar'], order: 0 } });
    const on = applyTripChange(trip, { action: 'metadata', patch: { guestMap: true } });
    assert.equal(on.guestMap, true);
    const shared = publicTrip(on), byId = id => shared.places.find(p => p.id === id);
    assert.equal(shared.guestMap, true);
    assert.deepEqual(byId('kyoto'), { id: 'kyoto', name: byId('kyoto').name, localName: byId('kyoto').localName, parentId: null, mapQuery: '12 Lantern Row, Harbour Town' }, 'the typed map address, and nothing else new');
    assert.equal(byId('osaka').mapQuery, '34.6937,135.5023', 'WGS-84 coordinates as entered');
    assert.ok(!('mapQuery' in byId('unused')) && !('mapQuery' in byId('idea-place')), 'only places a shared, dated activity happens at');
    assert.ok(!/PRIVATE|coordSystem|coordSource|amap|locationText|"lat"|"address"/.test(JSON.stringify(shared.places)), 'no address field, system, source or link');
    // Coordinates in another system are still never sent, to guests or to Google.
    const gcj = publicTrip(place(on, 'osaka', { locationText: '34.6937, 135.5023', coordSystem: 'GCJ02' }));
    assert.ok(!('mapQuery' in gcj.places.find(p => p.id === 'osaka')));
    assert.match(mapSectionHtml(gcj, { view: 'day', day: DAY, guest: true, embedKey: KEY }), /Shown as a schematic, not on Google Maps, because “Osaka” has no address or WGS-84 coordinates\.<\/p>/, 'the guest is told why, without being told to edit');
    // The guest page draws the same embed the planner would.
    const html = mapSectionHtml(shared, { view: 'day', day: DAY, guest: true, embedKey: KEY });
    assert.equal(frameSrc(html), frameSrc(mapSectionHtml(on, { view: 'day', day: DAY, embedKey: KEY, canEdit: true })));
    assert.ok(html.includes('<ol class="map-list"') && html.includes('data-map-style="schematic"'));
    assert.ok(!/data-place-edit|Map address|Search this|Directions to this address|No reviewed map link/.test(html), 'the list under it stays the guest list: names only, no links, no edit');
    // With the switch on but no key configured, guests keep the schematic.
    assert.ok(!mapSectionHtml(shared, { view: 'day', day: DAY, guest: true, embedKey: '' }).includes('<iframe'));
    // Switching it off again takes the locations back out.
    const back = publicTrip(applyTripChange(on, { action: 'metadata', patch: { guestMap: false } }));
    assert.ok(!JSON.stringify(back).includes('mapQuery') && back.guestMap === false);
});

test('only the organizer can switch it, it is logged and can be undone, and old trips are untouched', () => {
    const trip = usable(), on = applyTripChange(trip, { action: 'metadata', patch: { guestMap: true } });
    assert.equal(editorRestriction(trip, { action: 'metadata', patch: { guestMap: true } }), EDITOR_TRIP_DETAILS);
    assert.equal(editorDiffRestriction(trip, on), EDITOR_TRIP_DETAILS, 'an editor cannot flip it through undo either');
    const records = diffTrips(trip, on);
    assert.deepEqual(records.map(r => r.kind), ['trip']);
    assert.deepEqual(fieldChanges(records[0]).map(f => [f.field, f.after]), [['guestMap', true]]);
    assert.equal(undoChange(on, records).guestMap, false);
    // A trip stored before this field existed reads as off and is not rewritten.
    const old = structuredClone(trip);
    delete old.guestMap;
    assert.deepEqual(diffTrips(old, normalizeTrip(old, old.id)), []);
    assert.equal(normalizeTrip({ ...old, guestMap: 'yes' }, old.id).guestMap, false, 'only true is on');
    // The key reaches a guest link only then, and the guest page is allowed to frame Google and nothing else.
    const sharedRoute = read('../app/api/shared/route.ts'), guestPage = read('../public/guest.mjs'), view = read('../public/view.html'), planner = read('../public/planner.js');
    assert.match(sharedRoute, /mapsEmbedKey: trip\.guestMap \? mapsEmbedKey\(\) : ""/);
    assert.match(guestPage, /mapsKey = typeof data\.mapsEmbedKey === 'string' \? data\.mapsEmbedKey : '';/);
    assert.ok(!/localStorage\.setItem\([^)]*mapsKey/.test(guestPage), 'the guest page does not keep the key');
    assert.match(view, /connect-src 'self' https:\/\/www\.google\.com https:\/\/api\.open-meteo\.com; frame-src https:\/\/www\.google\.com; img-src 'self' blob:;/);
    assert.match(view, /default-src 'self'; script-src 'self'; style-src 'self';/, 'scripts and styles are still the Site\'s own only');
    assert.match(planner, /<input type="checkbox" id="guest-map" \$\{state\.snapshot\.trip\.guestMap \? 'checked' : ''\}/);
    assert.match(planner, /Anyone holding the guest link can then read those locations\./);
    assert.match(planner, /action: 'metadata', base: base\('trip'\), patch: \{ guestMap: on \}/);
});

test('the key comes from runtime configuration, reaches members only, and is never kept on the device', () => {
    const store = read('../lib/trip-store.ts'), route = read('../app/api/trip/route.ts'), planner = read('../public/planner.js');
    assert.match(store, /\(env as unknown as Record<string, string>\)\.GOOGLE_MAPS_EMBED_KEY \|\| ""\)\.trim\(\); return validEmbedKey\(key\) \? key : "";/);
    assert.match(route, /const a = await access\(request\);\s+if \(a\.error\)\s+return a\.error;\s+return response\(\{ user: userView\(a\.user!\), snapshot: snapshot\(a\.row!\), isOwner: a\.isOwner, role: a\.role, mapsEmbedKey: mapsEmbedKey\(\) \}\);/, 'only after the membership check');
    assert.equal((store + route + read('../app/api/trips/route.ts') + read('../app/api/history/route.ts')).match(/mapsEmbedKey\(\)/g).length, 1, 'sent from one place only');
    assert.match(planner, /mapsKey = typeof result\.mapsEmbedKey === 'string' \? result\.mapsEmbedKey : '';/);
    assert.ok(!/localStorage\.setItem\([^)]*mapsKey/.test(planner) && !/mapsKey: /.test(planner), 'not written to the downloaded copy');
    assert.match(planner, /embedKey: state\.online && !state\.needsSignIn \? mapsKey : ''/, 'offline or signed out: the schematic');
    assert.equal(validEmbedKey(KEY), true);
    for (const bad of ['', 'short', 'has spaces in it and is long enough to pass length', 'x'.repeat(80), null, 42, 'abc"onload="alert(1)aaaaaaaaaaaaaaaaaaaaa'])
        assert.equal(validEmbedKey(bad), false, String(bad));
    assert.equal(embedUrl({ ok: true, mode: 'place', q: 'x' }, 'bad key'), '');
});

test('no API key is committed anywhere in the repository', () => {
    // Google browser keys start with "AIza" followed by 35 more characters. The only string of that
    // shape allowed in source is this file's made-up one, which is assembled from two pieces.
    const root = new URL('../../../', import.meta.url), found = [];
    const skip = new Set(['node_modules', '.git', 'dist', '.next', '.vinext', '.wrangler', '.sites-runtime', 'vendor']);
    const walk = dir => { for (const name of readdirSync(dir)) { if (skip.has(name)) continue; const path = new URL(`${name}`, dir), s = statSync(path); if (s.isDirectory()) walk(new URL(`${name}/`, dir)); else if (s.size < 2e6 && /\.(m?js|cjs|ts|tsx|json|md|html|css|sql|toml|ya?ml|txt|example)$|^\.[a-z.]+$/i.test(name) && !/^\.dev\.vars|^\.env/.test(name)) { const hit = readFileSync(path, 'utf8').match(/AIza[0-9A-Za-z_-]{35}/); if (hit) found.push(path.pathname.slice(root.pathname.length)); } } };
    walk(root);
    assert.deepEqual(found, []);
    assert.match(read('../.gitignore') + read('../../../.gitignore'), /\.dev\.vars|\.env/, 'local configuration files are ignored by git');
});

test('both pages fall back by themselves when Google does not load, and remember the person\'s choice', () => {
    const planner = read('../public/planner.js'), guestPage = read('../public/guest.mjs'), panel = read('../public/map-panel.mjs');
    assert.match(panel, /const fail = \(\) => \{ clearTimeout\(embedTimer\); if \(frame\.isConnected\) onFail\(\); \};/);
    assert.match(panel, /embedTimer = setTimeout\(fail, EMBED_WAIT_MS\);/);
    // Reachability is asked first, with nothing about the trip, the key or the person in the request.
    assert.match(panel, /await fetch\(GOOGLE_PROBE, \{ mode: 'no-cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: control\.signal \}\);\s+\}\s+catch \{\s+return fail\(\);/);
    assert.match(panel, /GOOGLE_PROBE = 'https:\/\/www\.google\.com\/maps\/embed\/v1\/place'/);
    assert.equal((panel.match(/fetch\(/g) || []).length, 1, 'that question is the only request the panel makes');
    assert.match(panel, /frame\.addEventListener\('load', \(\) => clearTimeout\(embedTimer\), \{ once: true \}\);/);
    assert.match(panel, /new IntersectionObserver\(entries => \{ if \(entries\.some\(e => e\.isIntersecting\)\) start\(\); \}/, 'the frame is given its address only when it comes into view');
    assert.match(panel, /if \(!frame\?\.dataset\?\.src \|\| frame\.src\)\s+return;/);
    assert.match(planner, /const armEmbed = \(\) => watchEmbed\(document, \(\) => \{ embedFailed = true; refreshMaps\(\); \}\);/);
    assert.match(guestPage, /watchEmbed\(document, \(\) => \{ embedFailed = true; render\(\); \}\);/);
    assert.match(planner, /state\.mapStyle = b\.dataset\.mapStyle === 'schematic' \? 'schematic' : 'google';\s+embedFailed = false;\s+persist\(\);/);
    assert.match(guestPage, /localStorage\.setItem\('waypoint-guest-map-style', mapStyle\)/);
    assert.equal(planner.match(/mapView: state\.mapView, mapStyle: state\.mapStyle,/g).length, 2);
    assert.match(read('../public/planner.css'), /\.map-frame \{ display: block; width: 100%; max-width: 760px; aspect-ratio: 16 \/ 10;/);
});
