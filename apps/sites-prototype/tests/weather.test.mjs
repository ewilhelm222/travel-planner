import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { thanksgivingExample, applyTripChange, publicTrip } from '../lib/trips.mjs';
import { board } from '../public/board.mjs';
import { classify, weatherWords, weatherLine, weatherIcon, unitsFor, applyWeather, chooseWeather, fetchWeather, parseForecast, localDate, forecastUrl, FORECAST_URL } from '../public/weather.mjs';
import { weatherPlan, stayLocation, stayLocations, memoryCache, retry, GEOCODE_URL } from '../lib/weather.mjs';
retry.delayMs = 0;
// The two halves together, as a visit runs them: the server works out where (`cache` is its lookup cache),
// then the browser asks the forecast service (`memo` is the page's one-hour memory).
async function tripWeather(trip, { fetch, cache = memoryCache(), now, names = false, memo = new Map() }) {
    return fetchWeather(await weatherPlan(trip, { fetch, cache, names }), { fetch, now, memo });
}

const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
// Synthetic trip: Nov 25–29, one stay at "home" from Nov 25 to Nov 30. The place gets an invented location.
const located = patch => applyTripChange(thanksgivingExample(), { action: 'place-edit', placeId: 'home', patch });
const withCoordinates = () => located({ locationText: '38.2541, -120.3519', coordSystem: 'WGS84' });
// A mocked forecast service: sixteen local days from `first`, each row [chance, rain mm, snow cm, high °C, low °C].
const ROWS = { rain: [80, 14, 0, 11, 4], snow: [90, 0, 9, 0, -6], mixed: [70, 6, 3, 3, -1], dry: [5, 0, 0, 14, 2], heavy: [95, 40, 0, 12, 7] };
function forecastBody(first, kinds, timezone = 'America/Los_Angeles') {
    const dates = Array.from({ length: 16 }, (_, i) => { const d = new Date(`${first}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
    const rows = dates.map((_, i) => ROWS[kinds[i] || 'dry']);
    return { timezone, daily: { time: dates, weather_code: rows.map(() => 3), precipitation_probability_max: rows.map(r => r[0]), precipitation_sum: rows.map(r => r[1] + r[2]), rain_sum: rows.map(r => r[1]), showers_sum: rows.map(() => 0), snowfall_sum: rows.map(r => r[2]), temperature_2m_max: rows.map(r => r[3]), temperature_2m_min: rows.map(r => r[4]) } };
}
function service({ forecast, places = {}, fail = false } = {}) {
    const calls = [];
    const fetch = async (url, init) => {
        calls.push({ url: String(url), init });
        if (fail)
            throw new Error('network down');
        if (String(url).startsWith(GEOCODE_URL)) {
            const q = new URL(url).searchParams.get('q');
            return Response.json(places[q] ? [{ lat: String(places[q][0]), lon: String(places[q][1]), display_name: 'somewhere' }] : []);
        }
        return Response.json(forecast);
    };
    return { fetch, calls };
}
const NOW = () => new Date('2026-11-20T18:00:00Z');
const day = kind => { const [chance, rainMm, snowCm, high, low] = ROWS[kind]; return { chance, rainMm, snowCm, high, low, code: 3 }; };

test('rain, snow, mixed and dry days are told apart, with heavy rain marked', () => {
    assert.equal(classify(day('rain')).kind, 'rain');
    assert.equal(classify(day('snow')).kind, 'snow');
    assert.equal(classify(day('mixed')).kind, 'mixed');
    assert.equal(classify(day('dry')).kind, 'dry');
    assert.equal(classify(day('heavy')).heavy, true);
    assert.equal(classify(day('rain')).heavy, false);
    assert.equal(classify({ chance: 10, rainMm: 0.3, snowCm: 0, high: 12, low: 3 }).kind, 'dry', 'a trace with a low chance is still a dry day');
    assert.equal(classify({ chance: 60, rainMm: 0, snowCm: 0, high: 9, low: 2, code: 61 }).kind, 'rain', 'likely, no amount yet');
    assert.equal(classify({ chance: 60, rainMm: 0, snowCm: 0, high: -2, low: -9, code: 3 }).kind, 'snow', 'likely on a freezing day reads as snow');
    assert.equal(classify({ chance: 60, rainMm: 0, snowCm: 0, high: 6, low: 0, code: 73 }).kind, 'snow', 'the weather code says snow');
    assert.equal(classify({ chance: null, rainMm: 0, snowCm: 0.4, high: 1, low: -3 }).kind, 'snow', 'any measurable snow is a snow day');
});

test('the words lead with precipitation, its chance and the amount for snow or heavy rain; temperature comes after', () => {
    assert.deepEqual(weatherWords(day('snow'), 'us'), { kind: 'snow', heavy: false, precip: 'Snow 90% · 4 in', temp: '32°/21°', spoken: 'Forecast: snow, 90 percent chance of precipitation, about 4 inches. High 32, low 21 degrees Fahrenheit.' });
    assert.equal(weatherWords(day('snow'), 'metric').precip, 'Snow 90% · 9 cm');
    assert.equal(weatherWords(day('rain'), 'us').precip, 'Rain 80% · 0.6 in');
    assert.equal(weatherWords({ ...day('rain'), rainMm: 4 }, 'us').precip, 'Rain 80%', 'ordinary rain has no amount');
    assert.equal(weatherWords(day('heavy'), 'us').precip, 'Heavy rain 95% · 1.6 in');
    assert.equal(weatherWords(day('heavy'), 'metric').precip, 'Heavy rain 95% · 40 mm');
    assert.equal(weatherWords(day('mixed'), 'us').precip, 'Rain & snow 70% · 1.2 in snow');
    assert.equal(weatherWords(day('dry'), 'us').precip, 'Dry', 'a dry day is quiet: no chance shown when it is negligible');
    assert.equal(weatherWords({ ...day('dry'), chance: 25 }, 'us').precip, 'Dry · 25%');
    assert.equal(weatherWords(day('dry'), 'metric').temp, '14°/2°');
    assert.equal(weatherWords({ ...day('dry'), high: null }, 'us').temp, '', 'no temperature is shown rather than half of one');
    assert.equal(unitsFor('en-US'), 'us');
    assert.equal(unitsFor('en-GB'), 'metric');
    assert.equal(unitsFor('not a locale'), 'metric');
});

test('each kind of day renders with precipitation first, an icon and a spoken alternative', () => {
    for (const kind of ['rain', 'snow', 'mixed', 'dry']) {
        const html = weatherLine(day(kind), { units: 'us' });
        assert.match(html, new RegExp(`^<span class="weather-precip ${kind}" aria-hidden="true"><svg class="weather-icon"`), `${kind} leads the line`);
        assert.ok(html.indexOf('weather-precip') < html.indexOf('weather-temp'), 'temperature comes after precipitation');
        assert.match(html, /<span class="sr-only">Forecast: /, 'the icon and words have a text alternative');
    }
    assert.match(weatherLine(day('snow'), { units: 'us' }), />Snow 90% · 4 in<\/span><\/span><span class="weather-temp" aria-hidden="true">32°\/21°<\/span>/);
    assert.match(weatherLine(day('heavy'), { units: 'us' }), /class="weather-precip rain heavy"/);
    assert.match(weatherIcon('snow', 'Snow'), /role="img" aria-label="Snow"><title>Snow<\/title>/, 'an icon standing alone is labelled');
    assert.match(weatherIcon('rain'), /aria-hidden="true"/);
    assert.equal(weatherLine(null, { loading: true }), '', 'loading is an empty line');
    assert.equal(weatherLine(null), '<span class="weather-none" aria-hidden="true">—</span><span class="sr-only">No forecast for this day</span>', 'no forecast is a quiet dash, not an error');
    assert.ok(!/error|fail|unavailable/i.test(weatherLine(null)));
});

test('every day header carries the weather line, in the planner and for guests, and its height is fixed', async () => {
    const trip = withCoordinates();
    for (const html of [board(trip, { day: '2026-11-26' }), board(publicTrip(trip), { day: '2026-11-26', guest: true })]) {
        assert.equal((html.match(/<p class="day-weather" data-weather="/g) || []).length, 5, 'one line per day');
        assert.match(html, /<\/h2><p class="day-weather" data-weather="2026-11-25"><\/p><\/header>/, 'directly under the date, inside the header');
    }
    const css = await source('public/planner.css');
    assert.match(css, /\.day-weather \{[^}]*height: 24px;[^}]*overflow: hidden;[^}]*white-space: nowrap;/, 'one line of fixed height when the trip has a forecast');
    assert.match(css, /body:not\(\.has-weather\) \.day-weather \{ display: none; \}/, 'and no line at all when it has none');
    assert.ok(!JSON.stringify(publicTrip(trip)).includes('38.2541'), 'the stay location still never reaches the guest trip');
});

test('the page fills lines, day chips and the note in place', () => {
    const el = (dataset, label) => { const attrs = { ...(label ? { 'aria-label': label } : {}) }, classes = new Set(); return { classes, classList: { toggle: (c, on) => on ? classes.add(c) : classes.delete(c) }, dataset, innerHTML: '', title: '', hidden: true, added: '', removeAttribute(n) { if (n === 'title') this.title = ''; }, getAttribute: n => attrs[n], setAttribute(n, v) { attrs[n] = v; }, querySelector: () => null, insertAdjacentHTML(_, html) { this.added = html; } }; };
    const lines = [el({ weather: '2026-11-25' }), el({ weather: '2026-11-26' }), el({ weather: '2026-11-27' })], chips = [el({ day: '2026-11-25' }, 'Wednesday, November 25'), el({ day: '2026-11-26' }, 'Thursday, November 26')], note = el({});
    const body = el({}), document = { body, querySelectorAll: s => s.startsWith('.day-weather') ? lines : chips, querySelector: () => note };
    applyWeather(document, { days: { '2026-11-25': { ...day('snow'), where: 'Pine <Flat>' }, '2026-11-26': day('dry') }, updatedAt: '2026-11-20T18:00:00Z' }, { units: 'us', locale: 'en-US' });
    assert.match(lines[0].innerHTML, /Snow 90% · 4 in/);
    assert.match(lines[0].title, /^Snow 90% · 4 in · 32°\/21°\nForecast for Pine <Flat>\. Updated Nov 20, .*Weather data by Open-Meteo\.com$/, 'hovering gives the whole line, which a narrow column may cut short, then where and when');
    assert.match(lines[1].title, /^Dry · 57°\/36°\n/);
    assert.match(lines[1].innerHTML, /weather-precip dry/);
    assert.match(lines[2].innerHTML, /weather-none/, 'a day without a forecast gets the quiet dash');
    assert.equal(lines[2].title, '');
    assert.ok(body.classes.has('has-weather') && lines[2].classes.has('none') && !lines[0].classes.has('none'), 'the lines take room because some day has a forecast');
    assert.match(chips[0].added, /class="medallion-weather snow"/, 'a snowy day is marked on its chip');
    assert.match(chips[0].getAttribute('aria-label'), /^Wednesday, November 25\. Forecast: snow, 90 percent/, 'and said in its label');
    assert.equal(chips[1].added, '', 'a dry day leaves its chip alone');
    assert.equal(note.hidden, false);
    assert.match(note.innerHTML, /updated Nov 20, .*Weather data by <a href="https:\/\/open-meteo\.com\/"/);
    applyWeather(document, null, { loading: true });
    assert.deepEqual(lines.map(l => l.innerHTML), ['', '', ''], 'loading leaves the lines empty');
    assert.equal(note.hidden, true);
    assert.equal(chips[0].getAttribute('aria-label'), 'Wednesday, November 25', 'the chip label is put back');
    assert.ok(!body.classes.has('has-weather'), 'while loading for the first time no room is taken');
    applyWeather(document, null, { loading: true, reserve: true });
    assert.ok(body.classes.has('has-weather'), 'a trip that had a forecast last time keeps the room while it loads');
    // No forecast for any day: the line is given back, and a signed-in person is told why.
    assert.equal(applyWeather(document, { days: {}, updatedAt: null, why: { reason: 'not-found', text: 'Camp <X>' } }, { reserve: true }), false);
    assert.ok(!body.classes.has('has-weather'), 'no forecast at all: the line is reclaimed');
    assert.equal(note.hidden, false);
    assert.match(note.innerHTML, /^No forecast: the weather lookup could not find “Camp &lt;X&gt;”\. Add an address or coordinates/);
    applyWeather(document, { days: {}, updatedAt: null }, {});
    assert.equal(note.hidden, true, 'guests get no reason');
});

test('a stay with coordinates gets its forecast; only rounded coordinates are sent', async () => {
    const trip = withCoordinates(), s = service({ forecast: forecastBody('2026-11-20', { 5: 'rain', 6: 'snow', 7: 'mixed', 8: 'dry' }) });
    assert.deepEqual(stayLocation(trip, trip.stays[0]), { kind: 'coordinates', lat: 38.25, lng: -120.35 });
    const w = await tripWeather(trip, { fetch: s.fetch, cache: memoryCache(), now: NOW, names: true });
    assert.deepEqual(Object.keys(w.days), ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
    assert.deepEqual(['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'].map(d => classify(w.days[d]).kind), ['rain', 'snow', 'mixed', 'dry']);
    assert.equal(w.days['2026-11-25'].where, trip.places[0].name);
    assert.equal('why' in w, false);
    assert.equal(w.updatedAt, '2026-11-20T18:00:00.000Z', 'when the forecast was fetched');
    assert.deepEqual(await weatherPlan(trip, { fetch: s.fetch, names: true }), { points: [{ lat: 38.25, lng: -120.35, where: trip.places[0].name }], dates: { '2026-11-25': 0, '2026-11-26': 0, '2026-11-27': 0, '2026-11-28': 0, '2026-11-29': 0 } }, 'the server answers with rounded points only, and asks no forecast itself');
    assert.deepEqual((await weatherPlan(trip, { fetch: s.fetch })).points, [{ lat: 38.25, lng: -120.35 }], 'guests get the rounded point and no place name');
    assert.deepEqual({ referrerPolicy: s.calls[0].init.referrerPolicy, credentials: s.calls[0].init.credentials }, { referrerPolicy: 'no-referrer', credentials: 'omit' }, 'the browser sends no referrer and no cookies');
    assert.equal(s.calls[0].url, forecastUrl({ lat: 38.25, lng: -120.35 }));
    assert.equal(s.calls.length, 1, 'one request for the one location');
    const url = new URL(s.calls[0].url);
    assert.equal(url.origin + url.pathname, FORECAST_URL);
    assert.deepEqual(Object.fromEntries(url.searchParams), { latitude: '38.25', longitude: '-120.35', daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,rain_sum,showers_sum,snowfall_sum', timezone: 'auto', forecast_days: '16' });
    for (const private_ of [trip.title, 'Cedar', 'Synthetic', trip.id, 'option-1', '38.2541'])
        assert.ok(!decodeURIComponent(s.calls[0].url).includes(private_), `"${private_}" is not sent`);
    const guest = await tripWeather(trip, { fetch: s.fetch, cache: memoryCache(), now: NOW });
    assert.equal('where' in guest.days['2026-11-25'], false, 'guests are not told the place');
    assert.deepEqual({ ...w.days['2026-11-26'], where: undefined }, { ...guest.days['2026-11-26'], where: undefined }, 'guests see the same forecast');
});

test('a page asks once an hour per location, and a different location is asked separately', async () => {
    let clock = NOW().getTime();
    const now = () => new Date(clock), trip = withCoordinates(), s = service({ forecast: forecastBody('2026-11-20', {}) }), memo = new Map();
    await tripWeather(trip, { fetch: s.fetch, now, memo });
    await tripWeather(trip, { fetch: s.fetch, now, memo });
    assert.equal(s.calls.length, 1, 'the second request is answered from the page’s memory');
    clock += 61 * 60 * 1000;
    await tripWeather(trip, { fetch: s.fetch, now, memo });
    assert.equal(s.calls.length, 2, 'after an hour the forecast is fetched again');
    await tripWeather(located({ locationText: '39.5, -120.2', coordSystem: 'WGS84' }), { fetch: s.fetch, now, memo });
    assert.equal(s.calls.length, 3);
});

test('a stay with only an address is looked up for the weather, and the result is never stored', async () => {
    const trip = located({ locationText: '12 Lantern Row, Pine Flat, CA' });
    assert.deepEqual(stayLocation(trip, trip.stays[0]), { kind: 'address', text: '12 Lantern Row, Pine Flat, CA' });
    const before = JSON.stringify(trip), cache = memoryCache();
    const s = service({ forecast: forecastBody('2026-11-20', { 5: 'snow' }), places: { 'Pine Flat, CA': [38.254123, -120.351987] } });
    const w = await tripWeather(trip, { fetch: s.fetch, cache, now: NOW });
    assert.equal(classify(w.days['2026-11-25']).kind, 'snow');
    assert.deepEqual(s.calls.map(c => new URL(c.url).searchParams.get('q') || new URL(c.url).searchParams.get('latitude')), ['12 Lantern Row, Pine Flat, CA', 'Pine Flat, CA', '38.25'], 'the full address first, then the part after the first comma, then the forecast');
    assert.ok(s.calls.slice(0, 2).every(c => c.url.startsWith(GEOCODE_URL) && !/api_?key|token/i.test(c.url) && !c.url.includes(encodeURIComponent(trip.title))), 'the lookup carries the address and no key or trip detail');
    assert.equal(JSON.stringify(trip), before, 'the trip is untouched: no coordinates are written to the place');
    await weatherPlan(trip, { fetch: s.fetch, cache });
    assert.equal(s.calls.length, 3, 'the looked-up point is cached');
    // An older place with only its address field, and coordinates in another system, are used as they are.
    assert.deepEqual(stayLocation(located({ address: '5 Mill Lane, Pine Flat' }), trip.stays[0]), { kind: 'address', text: '5 Mill Lane, Pine Flat' });
    assert.deepEqual(stayLocation(located({ locationText: '39.9163, 116.3972', coordSystem: 'GCJ02' }), trip.stays[0]), { kind: 'coordinates', lat: 39.92, lng: 116.4 }, 'used as typed, never converted');
    const none = service({ forecast: forecastBody('2026-11-20', {}) });
    const lost = await tripWeather(trip, { fetch: none.fetch, cache: memoryCache(), now: NOW, names: true });
    assert.deepEqual(lost.days, {}, 'an address nobody can find gives no weather');
    assert.deepEqual(lost.why, { reason: 'not-found', text: '12 Lantern Row, Pine Flat, CA' }, 'and a signed-in person is told which text was not found');
    assert.equal('why' in await tripWeather(trip, { fetch: none.fetch, cache: memoryCache(), now: NOW }), false, 'guests are not');
    assert.ok(none.calls.every(c => c.url.startsWith(GEOCODE_URL)), 'and no forecast is asked for');
});

test('a venue without a location uses the area it sits in', () => {
    let trip = located({ locationText: '38.2541, -120.3519', coordSystem: 'WGS84' });
    trip = applyTripChange(trip, { action: 'place-add', place: { id: 'cabin', name: 'Cabin', parentId: 'home' } });
    trip = applyTripChange(trip, { action: 'stay-edit', stayId: 'shared-base', patch: { placeId: 'cabin' } });
    assert.deepEqual(stayLocation(trip, trip.stays[0]), { kind: 'coordinates', lat: 38.25, lng: -120.35 });
});

test('a place with only a name is looked up by the area name, then its own', async () => {
    let trip = applyTripChange(thanksgivingExample(), { action: 'place-edit', placeId: 'home', patch: { name: 'Pine Flat' } });
    trip = applyTripChange(trip, { action: 'place-add', place: { id: 'camp', name: 'Camp Made-Up', parentId: 'home' } });
    trip = applyTripChange(trip, { action: 'stay-edit', stayId: 'shared-base', patch: { placeId: 'camp' } });
    assert.deepEqual(stayLocations(trip, trip.stays[0]), [{ kind: 'name', text: 'Pine Flat' }, { kind: 'name', text: 'Camp Made-Up' }]);
    const s = service({ forecast: forecastBody('2026-11-20', { 5: 'rain' }), places: { 'Pine Flat': [38.25, -120.35] } });
    s.fetch = (inner => async (url, init) => { const r = await inner(url, init); return String(url).startsWith(GEOCODE_URL) ? Response.json((await r.json()).map(x => ({ ...x, display_name: 'Pine Flat, Sample County, California, United States' }))) : r; })(s.fetch);
    const w = await tripWeather(trip, { fetch: s.fetch, cache: memoryCache(), now: NOW, names: true });
    assert.equal(classify(w.days['2026-11-25']).kind, 'rain');
    assert.equal(w.days['2026-11-25'].where, 'Pine Flat, Sample County, California', 'the tooltip names what the lookup matched, so a wrong match can be noticed');
    assert.equal(s.calls.length, 2, 'one lookup, one forecast');
    // The area is unknown to the lookup: the venue's own name is tried next.
    const venue = service({ forecast: forecastBody('2026-11-20', {}), places: { 'Camp Made-Up': [38.3, -120.3] } });
    assert.equal(Object.keys((await tripWeather(trip, { fetch: venue.fetch, cache: memoryCache(), now: NOW })).days).length, 5);
    // An address is preferred to a name, and coordinates to both.
    trip = applyTripChange(trip, { action: 'place-edit', placeId: 'home', patch: { locationText: '1 Mill Lane, Pine Flat' } });
    assert.deepEqual(stayLocations(trip, trip.stays[0]).map(x => x.kind), ['address', 'name', 'name']);
    // A venue with a street address inside an area with coordinates: the coordinates are used, with no lookup at all.
    trip = applyTripChange(trip, { action: 'place-edit', placeId: 'camp', patch: { address: '9 Camp Road' } });
    trip = applyTripChange(trip, { action: 'place-edit', placeId: 'home', patch: { locationText: '38.012595, -120.227007', coordSystem: 'WGS84' } });
    assert.deepEqual(stayLocations(trip, trip.stays[0])[0], { kind: 'coordinates', lat: 38.01, lng: -120.23 });
    const direct = service({ forecast: forecastBody('2026-11-20', {}) });
    assert.equal(Object.keys((await tripWeather(trip, { fetch: direct.fetch, cache: memoryCache(), now: NOW })).days).length, 5);
    assert.ok(direct.calls.length === 1 && direct.calls[0].url.startsWith(FORECAST_URL), 'only the forecast is asked for');
});

test('no location: nothing is fetched and no weather is shown', async () => {
    const s = service({ forecast: forecastBody('2026-11-20', {}) });
    const trip = { ...thanksgivingExample() };
    trip.stays = trip.stays.map(x => ({ ...x, placeId: null }));
    assert.equal(stayLocation(trip, trip.stays[0]), null);
    assert.deepEqual(await tripWeather(trip, { fetch: s.fetch, cache: memoryCache(), now: NOW }), { days: {}, updatedAt: null });
    assert.deepEqual((await tripWeather(trip, { fetch: s.fetch, cache: memoryCache(), now: NOW, names: true })).why, { reason: 'no-location' });
    assert.deepEqual((await tripWeather({ ...trip, stays: [] }, { fetch: s.fetch, cache: memoryCache(), now: NOW, names: true })).why, { reason: 'no-stay' });
    assert.equal(s.calls.length, 0);
});

test('dates outside the forecast range have no weather, never an invented one', async () => {
    // The service answers Nov 5–20: the whole trip (Nov 25–29) is beyond it.
    const far = service({ forecast: forecastBody('2026-11-05', {}) });
    const beyond = await tripWeather(withCoordinates(), { fetch: far.fetch, cache: memoryCache(), now: () => new Date('2026-11-05T18:00:00Z'), names: true });
    assert.deepEqual(beyond.days, {});
    assert.deepEqual(beyond.why, { reason: 'out-of-range' });
    // The service answers Nov 12–27: Nov 28 and 29 are past the range.
    const part = service({ forecast: forecastBody('2026-11-12', {}) });
    assert.deepEqual(Object.keys((await tripWeather(withCoordinates(), { fetch: part.fetch, cache: memoryCache(), now: () => new Date('2026-11-12T18:00:00Z') })).days), ['2026-11-25', '2026-11-26', '2026-11-27']);
    // A day the service left blank is not read as a dry day.
    const body = forecastBody('2026-11-20', {});
    for (const k of ['precipitation_sum', 'rain_sum', 'snowfall_sum']) body.daily[k][6] = null;
    assert.equal('2026-11-26' in parseForecast(body, 'x').days, false);
    assert.equal(parseForecast({ error: true, reason: 'bad' }, 'x'), null);
});

test('a failed lookup shows nothing, raises nothing, and says it is worth asking again', async () => {
    const down = service({ fail: true });
    assert.deepEqual(await tripWeather(withCoordinates(), { fetch: down.fetch, now: NOW }), { days: {}, updatedAt: null, failed: true, why: { reason: 'forecast-failed', detail: 'Error' } });
    assert.equal(down.calls.length, 1);
    assert.deepEqual(await tripWeather(withCoordinates(), { fetch: async () => new Response('busy', { status: 429 }), now: NOW }), { days: {}, updatedAt: null, failed: true, why: { reason: 'forecast-failed', detail: 'HTTP 429' } }, 'what the service answered is kept');
    assert.deepEqual((await tripWeather(withCoordinates(), { fetch: async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }), now: NOW })).days, {});
    assert.equal((await tripWeather(withCoordinates(), { fetch: async () => Response.json({ error: true }), now: NOW })).why.detail, 'unreadable answer');
    // The address lookup, on the server: tried three times, then left alone for a couple of minutes.
    let clock = 0;
    const cache = memoryCache(() => clock), addressed = located({ locationText: '1 Mill Lane, Pine Flat' });
    const plan = await weatherPlan(addressed, { fetch: down.fetch, cache, names: true });
    assert.deepEqual(plan, { points: [], dates: {}, failed: true, why: { reason: 'lookup-failed', detail: 'Error' } });
    assert.deepEqual(await fetchWeather(plan, { fetch: down.fetch, now: NOW }), { days: {}, updatedAt: null, failed: true, why: { reason: 'lookup-failed', detail: 'Error' } });
    const asked = down.calls.length;
    await weatherPlan(addressed, { fetch: down.fetch, cache });
    assert.equal(down.calls.length, asked, 'the failure is remembered for a couple of minutes');
    clock = 3 * 60 * 1000;
    const up = service({ forecast: forecastBody('2026-11-20', {}), places: { '1 Mill Lane, Pine Flat': [38.25, -120.35] } });
    assert.equal((await weatherPlan(addressed, { fetch: up.fetch, cache })).points.length, 1, 'then it is tried again');
    const broken = { get: async () => { throw new Error('cache down'); }, put: async () => { throw new Error('cache down'); } };
    assert.equal(Object.keys((await tripWeather(addressed, { fetch: up.fetch, cache: broken, now: NOW })).days).length, 5, 'a broken cache does not stop the forecast');
    let n = 0;
    await weatherPlan(addressed, { fetch: async () => { n++; return new Response('busy', { status: 429 }); }, cache: memoryCache() });
    assert.ok(n >= 3, 'a refused lookup is tried again before giving up');
});

test('day boundaries are the stay’s local days, not the server’s', async () => {
    // 06:30 UTC on Nov 26 is still the evening of Nov 25 in California, and already Nov 26 afternoon in Tokyo.
    const now = () => new Date('2026-11-26T06:30:00Z');
    assert.equal(localDate(now(), 'America/Los_Angeles'), '2026-11-25');
    assert.equal(localDate(now(), 'Asia/Tokyo'), '2026-11-26');
    assert.equal(localDate(now(), 'UTC'), '2026-11-26');
    // The service's days are the location's local days (timezone=auto); a cached answer may still begin on a day that has ended there.
    const california = service({ forecast: forecastBody('2026-11-24', { 1: 'snow' }, 'America/Los_Angeles') });
    const west = await tripWeather(withCoordinates(), { fetch: california.fetch, cache: memoryCache(), now });
    assert.deepEqual(Object.keys(west.days), ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'], 'Nov 25 is still today in California');
    assert.equal(classify(west.days['2026-11-25']).kind, 'snow');
    const tokyo = service({ forecast: forecastBody('2026-11-24', { 1: 'snow' }, 'Asia/Tokyo') });
    const east = await tripWeather(located({ locationText: '35.01, 135.77', coordSystem: 'WGS84' }), { fetch: tokyo.fetch, cache: memoryCache(), now });
    assert.deepEqual(Object.keys(east.days), ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'], 'Nov 25 is over in Japan, so it has no forecast');
    assert.equal(new URL(california.calls[0].url).searchParams.get('timezone'), 'auto', 'the service works out the zone from the location');
});

test('a check-out morning uses the stay being left; the weather routes change no authorization', async () => {
    let trip = withCoordinates();
    trip = applyTripChange(trip, { action: 'stay-edit', stayId: 'shared-base', patch: { end: '2026-11-29' } });
    const s = service({ forecast: forecastBody('2026-11-20', { 9: 'rain' }) });
    assert.equal(classify((await tripWeather(trip, { fetch: s.fetch, cache: memoryCache(), now: NOW })).days['2026-11-29']).kind, 'rain');
    const member = await source('app/api/weather/route.ts'), guest = await source('app/api/shared-weather/route.ts');
    assert.match(member, /const a = await access\(request\);\s+if \(a\.error\)\s+return a\.error;/, 'members: the same access check as the trip itself');
    assert.match(guest, /share_token_hash = \? AND archived_at IS NULL/, 'guests: the same token check as the guest schedule');
    assert.ok(!/names: true/.test(guest), 'guests get no place name');
    for (const code of [member, guest, await source('lib/weather.mjs'), await source('lib/weather-cache.ts')])
        assert.ok(!/commit\(|transact\(|api_?key|apikey|wgs2gcj|gcj2wgs|open-meteo\.com\/v1/i.test(code), 'nothing is saved, no key is used, nothing is converted, and the server asks for no forecast');
    const sw = await source('public/sw.js');
    assert.match(sw, /"\/weather\.mjs"/, 'the offline shell carries the module');
});

test('the browser keeps the last forecast it saw and shows it when the service does not answer', () => {
    const good = { days: { '2026-11-24': day('dry'), '2026-11-25': day('snow') }, updatedAt: '2026-11-20T18:00:00Z' }, now = Date.parse('2026-11-20T21:00:00Z');
    assert.deepEqual(chooseWeather(good, null, { now }), { data: good, keep: { data: good }, retry: false });
    const failed = { days: {}, updatedAt: null, failed: true, why: { reason: 'forecast-failed', detail: 'HTTP 429' } };
    const stood = chooseWeather(failed, { data: good }, { now, today: '2026-11-20' });
    assert.deepEqual(stood.data, good, 'the kept forecast stands in, update time and all');
    assert.equal(stood.retry, true);
    assert.deepEqual(chooseWeather(null, { data: good }, { now, today: '2026-11-20' }).data, good, 'also when the request itself fails');
    assert.deepEqual(Object.keys(chooseWeather(failed, { data: good }, { now, today: '2026-11-25' }).data.days), ['2026-11-25'], 'days that are over are dropped');
    assert.deepEqual(chooseWeather(failed, { data: good }, { now: now + 25 * 3600 * 1000, today: '2026-11-20' }), { data: failed, keep: null, retry: true }, 'a forecast more than a day old is not shown');
    assert.deepEqual(chooseWeather(failed, null, { now }), { data: failed, keep: null, retry: true });
    const none = { days: {}, updatedAt: null, why: { reason: 'out-of-range' } };
    assert.deepEqual(chooseWeather(none, { data: good }, { now, today: '2026-11-20' }), { data: none, keep: null, retry: false }, 'a real “no forecast” replaces the kept one');
});

test('the forecast is asked for by the reader’s browser, and the guest page is allowed to', async () => {
    const view = await source('public/view.html'), guest = await source('public/guest.mjs'), planner = await source('public/planner.js');
    assert.match(view, /connect-src 'self' https:\/\/www\.google\.com https:\/\/api\.open-meteo\.com;/, 'the guest page may connect to the forecast service and nothing else new');
    assert.match(view, /<meta name="referrer" content="no-referrer">/);
    assert.match(guest, /answer = await fetchWeather\(await r\.json\(\), \{ memo: weatherMemo \}\);\s+delete answer\.why;/, 'guests are never told why there is no forecast');
    assert.match(planner, /answer = await fetchWeather\(await r\.json\(\), \{ memo: weatherMemo \}\);/);
    assert.ok(FORECAST_URL.startsWith('https://api.open-meteo.com/'));
    // Nothing but the rounded point and the fixed list of values is in the request.
    assert.equal(forecastUrl({ lat: 38.012595, lng: -120.227007 }), 'https://api.open-meteo.com/v1/forecast?latitude=38.01&longitude=-120.23&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,rain_sum,showers_sum,snowfall_sum&timezone=auto&forecast_days=16');
    assert.deepEqual(await fetchWeather({ points: [], dates: {}, why: { reason: 'no-location' } }, { fetch: async () => { throw new Error('not asked'); } }), { days: {}, updatedAt: null, why: { reason: 'no-location' } });
    assert.deepEqual(await fetchWeather(null, {}), { days: {}, updatedAt: null });
});

test('the weather stays on screen when the plan is saved, and is asked for again in the background', async () => {
    const planner = await source('public/planner.js');
    const show = planner.slice(planner.indexOf('function showWeather()'), planner.indexOf('async function loadWeather()'));
    assert.match(show, /const have = !!state\.snapshot && weather\.trip === state\.snapshot\.trip\.id;/, 'shown for the trip, whatever its revision: moving a card does not blank the lines');
    assert.match(show, /loadWeather\(\);\s+\}\s*$/, 'every redraw, including the one after a move, asks again if the plan has moved on');
    const refresh = planner.slice(planner.indexOf('function refreshBoard('), planner.indexOf('function refreshBoard(') + 700);
    assert.match(refresh, /it\.innerHTML = board\([^;]+;\s+showWeather\(\);/, 'the redraw after a move fills the lines again');
});
