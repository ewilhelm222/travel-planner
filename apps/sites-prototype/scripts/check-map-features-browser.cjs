/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
// Browser check for the Map panel: links from text, directions, plans with no place, markers that lead to
// the list, the route in words, the guest map, and the fallback when the drawing cannot be made.
// Against a disposable local dev server with synthetic data. All places and addresses are made up.
// Usage: node scripts/check-map-features-browser.cjs <screenshot-dir> [origin]
// Requires the dev server (`npm run dev`) with PLANNER_CREATOR_EMAILS=seedy@sites.test in .dev.vars.
const O = process.argv[3] || 'http://127.0.0.1:5173', SHOTS = process.argv[2] || '.';
if (!['127.0.0.1', 'localhost'].includes(new URL(O).hostname)) throw new Error('Only run against disposable loopback data.');
let failed = 0;
const check = (name, ok, extra = '') => { if (!ok) failed++; console.log(ok ? 'ok   ' : 'FAIL ', name, extra); };
const DAY = '2026-11-25';
(async () => {
  const browser = await chromium.launch();
  const outside = [];
  async function run(label, viewport) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block', hasTouch: label !== 'desktop' });
    const page = await ctx.newPage();
    page.on('pageerror', e => check(`no script error (${label}): ${e.message}`, false));
    ctx.on('request', r => { if (!r.url().startsWith(O) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) outside.push(r.url()); });
    await page.goto(O + '/signin-with-chatgpt?return_to=/');
    const created = await page.evaluate(async () => (await (await fetch('/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: 'thanksgiving' }) })).json()));
    const id = created.snapshot.trip.id;
    const api = body => page.evaluate(async ([id, body]) => { const r = await fetch('/api/trip?id=' + id, { method: body ? 'PATCH' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json() }; }, [id, body]);
    const send = async body => { const cur = await api(); const r = await api({ ...body, revision: cur.json.snapshot.revision }); if (r.status !== 200) throw new Error(JSON.stringify(r.json)); return r; };
    await send({ action: 'place-edit', placeId: 'home', patch: { name: 'Lakeside camp (made up)', locationText: '45.5, -122.6', coordSystem: 'WGS84', appleMapsUrl: 'https://maps.apple.com/?q=Example+Shore+Road', navReviewed: true } });
    await send({ action: 'place-add', place: { id: 'bakery', name: 'Lantern Row bakery (made up)', locationText: '12 Lantern Row, Harbour Town' } });
    await send({ action: 'place-add', place: { id: 'pier', name: 'North Quay pier (made up)', address: '3 Tide Street, Harbour Town', locationText: '45.6, -122.4', coordSystem: 'WGS84' } });
    await send({ action: 'place-add', place: { id: 'hill', name: 'Beacon Hill (made up)' } });
    const everyone = (await api()).json.snapshot.trip.activities.find(a => a.id === 'option-5').participants;
    const add = (aid, title, time, placeId, order, extra = {}) => send({ action: 'add', activity: { id: aid, title, date: DAY, time, placeId, order, participants: everyone, notes: '', guestNotes: 'Made-up plan.', guestLocation: '', fixed: false, optional: true, sourceKind: 'entered', ...extra } });
    await add('buns', 'Morning buns run', '08:00', 'bakery', 0);
    await add('boat', 'Rowing boats', '10:30', 'pier', 1);
    await add('view', 'Sunset from the hill', '16:00', 'hill', 2);
    await add('tea', 'Tea somewhere', '17:30', null, 3, { address: '7 Kettle Lane, Harbour Town' });
    await send({ action: 'leg-add', leg: { id: 'ferry', title: 'Ferry to the pier', date: '2026-11-26', mode: 'Ferry', participants: everyone, from: 'home', to: 'pier', notes: '' } });
    await send({ action: 'leg-add', leg: { id: 'bus', title: 'Bus up the hill', date: '2026-11-27', mode: 'Bus', participants: everyone, from: 'pier', to: 'hill', notes: '' } });
    await page.goto(O + '/?trip=' + id);
    await page.waitForSelector('#itinerary .activity');
    await page.waitForLoadState('networkidle');
    const body = () => page.$eval('#maps-body', e => e.innerHTML);
    const view = v => page.evaluate(v => document.querySelector(`[data-map-view="${v}"]`).click(), v);
    const toMap = () => page.evaluate(() => document.querySelector('#maps').scrollIntoView({ block: 'start' }));

    // ---------- Signed-in planner: this day ----------
    await view('day');
    let html = await body();
    check(`${label}: day map draws four stops with markers that link to the list`, (html.match(/<a class="map-pin"/g) || []).length === 4 && html.includes('id="map-stop-4"'));
    check(`${label}: route is said in words`, /In itinerary order: 1\. Lantern Row bakery \(made up\) → 2\. Lakeside camp \(made up\) → 3\. North Quay pier/.test(await page.textContent('.map-route')));
    check(`${label}: typed address gives a search and directions`, html.includes('https://maps.apple.com/?q=12%20Lantern%20Row%2C%20Harbour%20Town') && html.includes('https://maps.apple.com/?daddr=12%20Lantern%20Row%2C%20Harbour%20Town'));
    check(`${label}: place with only an address is searched by name and address`, html.includes('Search this place and address in') && html.includes('query=North%20Quay%20pier%20(made%20up)%203%20Tide%20Street%2C%20Harbour%20Town'));
    check(`${label}: place with only a name is searched by name, no directions`, await page.$eval('#map-stop-4', e => e.textContent.includes('Search this place’s name in') && !e.textContent.includes('Directions')));
    check(`${label}: reviewed link is the only link for its place`, await page.$eval('#map-stop-2', e => e.querySelectorAll('a.map-link:not(.search)').length === 1 && !e.querySelector('a.search')));
    check(`${label}: no link carries coordinates`, !/href="[^"]*(45\.5|45\.6|122\.)/.test(html));
    check(`${label}: plan with no place is listed, can be opened, and its own address gives links`, await page.$eval('.map-unplaced', e => e.textContent.includes('Location to confirm (1)') && !!e.querySelector('button[data-detail="tea"]') && !!e.querySelector('a[href^="https://maps.apple.com/?daddr=7%20Kettle"]')));
    await toMap();
    await page.screenshot({ path: `${SHOTS}/${label}-day-map.jpg`, quality: 80 });
    if (label === 'phone') { await page.evaluate(() => document.querySelector('#map-stop-1').scrollIntoView({ block: 'start' })); await page.screenshot({ path: `${SHOTS}/${label}-day-list.jpg`, quality: 80 }); }
    check(`${label}: drawing fits the screen`, await page.$eval('.schematic-map', e => { const r = e.getBoundingClientRect(); return r.width <= window.innerWidth && r.height <= window.innerHeight; }));
    check(`${label}: no sideways scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    check(`${label}: link targets are at least 44px tall`, await page.$$eval('#maps a.map-link, #maps .map-activity', els => els.every(e => e.getBoundingClientRect().height >= 43.5)));

    // A marker leads to its entry: by tap or click, and by keyboard.
    await page.evaluate(() => document.querySelector('a.map-pin[href="#map-stop-3"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    check(`${label}: a marker moves focus to its list entry`, await page.evaluate(() => document.activeElement?.id === 'map-stop-3'));
    await page.evaluate(() => document.querySelector('a.map-pin[href="#map-stop-4"]').focus());
    await page.keyboard.press('Enter');
    check(`${label}: Enter on a focused marker does the same`, await page.evaluate(() => document.activeElement?.id === 'map-stop-4'));
    check(`${label}: the address bar is not changed by a marker`, !(await page.evaluate(() => location.hash)));

    // An activity in the list opens the read-only view, which carries the same links.
    await page.evaluate(() => document.querySelector('#maps .map-activity[data-detail="boat"]').click());
    await page.waitForFunction(() => document.querySelector('#activity-view')?.open);
    check(`${label}: activity opens from the map, with search and directions`, await page.$eval('#activity-view', e => e.textContent.includes('Rowing boats') && e.textContent.includes('Directions to this address in') && e.querySelectorAll('a.map-link.search').length === 4));
    await page.screenshot({ path: `${SHOTS}/${label}-activity-links.jpg`, quality: 80 });
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector('#maps .map-activity[data-detail="tea"]').click());
    await page.waitForFunction(() => document.querySelector('#activity-view')?.open);
    check(`${label}: a plan with no place shows its address links in the view`, await page.$eval('#activity-view', e => !!e.querySelector('a[href^="https://www.google.com/maps/dir/?api=1&destination=7%20Kettle"]')));
    await page.keyboard.press('Escape');

    // ---------- Whole trip ----------
    await view('trip');
    html = await body();
    check(`${label}: trip map positions the two places that share a known system`, /Positions use WGS84 coordinates as entered/.test(html) && (html.match(/class="map-node positioned"/g) || []).length === 2);
    check(`${label}: journeys are said in words`, (await page.textContent('.map-route')).includes('Journeys in date order: Lakeside camp (made up) → North Quay pier (made up) (Ferry · 2026-11-26); North Quay pier (made up) → Beacon Hill (made up) (Bus · 2026-11-27).'));
    check(`${label}: trip list has searches but no directions`, !html.includes('Directions to this address in') && html.includes('Search this place and address in'));
    await toMap();
    await page.screenshot({ path: `${SHOTS}/${label}-trip-map.jpg`, quality: 80 });
    check(`${label}: no sideways scroll on the trip map`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

    // ---------- Read-only guest ----------
    const share = await page.evaluate(async id => (await (await fetch('/api/share?id=' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rotate', base: { share: 1 } }) })).json()), id);
    const guest = await ctx.newPage();
    guest.on('pageerror', e => check(`no script error (${label} guest): ${e.message}`, false));
    await guest.goto(share.url);
    await guest.waitForSelector('#itinerary .activity');
    check(`${label} guest: a map panel is shown under the schedule`, await guest.evaluate(() => !!document.querySelector('#maps') && (document.querySelector('#itinerary').compareDocumentPosition(document.querySelector('#maps')) & Node.DOCUMENT_POSITION_FOLLOWING) > 0));
    const g = await guest.$eval('#maps', e => e.innerHTML);
    check(`${label} guest: the day's stops are drawn in plan order`, (g.match(/<a class="map-pin"/g) || []).length === 3 && /Drawn in plan order, not to scale or position/.test(g) && !/class="map-node positioned"/.test(g));
    const leak = g.match(/Lantern Row, Harbour|Tide Street|Kettle|\b45\.5\b|\b45\.6\b|\b122\.[46]|maps\.apple|google\.com|amap|data-place-edit|coordinates/);
    check(`${label} guest: no address, coordinates, link or edit control`, !leak, leak ? g.slice(Math.max(0, leak.index - 80), leak.index + 40) : '');
    check(`${label} guest: plan with no place is still listed`, /Location to confirm \(1\)/.test(g) && g.includes('data-detail="tea"'));
    await guest.evaluate(() => document.querySelector('#maps').scrollIntoView({ block: 'start' }));
    await guest.screenshot({ path: `${SHOTS}/${label}-guest-day-map.jpg`, quality: 80 });
    await guest.evaluate(() => document.querySelector('a.map-pin[href="#map-stop-2"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    check(`${label} guest: a marker moves focus to its list entry`, await guest.evaluate(() => document.activeElement?.id === 'map-stop-2'));
    await guest.evaluate(() => document.querySelector('#maps .map-activity[data-detail="boat"]').click());
    check(`${label} guest: an activity opens read-only from the map, with no link`, await guest.$eval('#activity-view', e => e.open && e.textContent.includes('Rowing boats') && !e.querySelector('a.map-link') && !e.querySelector('[data-edit-activity]')));
    await guest.keyboard.press('Escape');
    await guest.evaluate(() => document.querySelector('[data-map-view="trip"]').click());
    check(`${label} guest: whole trip says no stays are shared`, /No stays are shared on this guest link/.test(await guest.textContent('#maps-body')));
    check(`${label} guest: focus stays on the view button`, await guest.evaluate(() => document.activeElement?.dataset?.mapView === 'trip'));
    check(`${label} guest: no sideways scroll`, await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await ctx.close();
  }
  await run('desktop', { width: 1440, height: 900 });
  await run('phone', { width: 390, height: 844 });
  await run('landscape', { width: 844, height: 390 });
  check('nothing was requested from another site: no tiles, no lookup', outside.length === 0, outside.join(' '));
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
