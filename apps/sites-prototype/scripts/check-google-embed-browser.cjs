/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
// Browser check for the Google Maps day map, against a disposable local dev server with synthetic data.
// Google itself is not contacted: requests to it are answered here, so the check is repeatable and sends
// nothing outside. The frame's contents in the screenshots are therefore a stand-in, not a real map.
// Usage: node scripts/check-google-embed-browser.cjs <screenshot-dir> [origin]
// Requires the dev server (`npm run dev`) with PLANNER_CREATOR_EMAILS=seedy@sites.test and any
// well-formed GOOGLE_MAPS_EMBED_KEY in .dev.vars. The key is never printed.
const O = process.argv[3] || 'http://127.0.0.1:5173', SHOTS = process.argv[2] || '.';
if (!['127.0.0.1', 'localhost'].includes(new URL(O).hostname)) throw new Error('Only run against disposable loopback data.');
let failed = 0;
const check = (name, ok, extra = '') => { if (!ok) failed++; console.log(ok ? 'ok   ' : 'FAIL ', name, extra); };
const PROBE = 'https://www.google.com/maps/embed/v1/place';
const hideKey = url => url.replace(/key=[^&]+/, 'key=…');
(async () => {
  const browser = await chromium.launch();
  async function run(label, viewport) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block', hasTouch: label !== 'desktop' });
    const google = [], other = [];
    let reachable = true;
    await ctx.route(/^https:\/\/www\.google\.com\//, route => {
      const req = route.request(), url = req.url();
      google.push({ url, referer: req.headers().referer || '', cookie: req.headers().cookie || '' });
      if (!reachable) return route.abort('connectionreset');
      if (url === PROBE) return route.fulfill({ status: 400, contentType: 'text/plain', body: 'no key' });
      if (url.includes('/maps/embed/')) { const u = new URL(url); return route.fulfill({ contentType: 'text/html', body: `<body style="margin:0;font:16px system-ui;background:#dfe8dc;color:#1a0f33;display:grid;place-items:center;height:100vh;text-align:center"><div><strong>Stand-in for the Google map</strong><br>${u.pathname.split('/').pop()} mode<br><small>(Google is not contacted by this check)</small></div></body>` }); }
      return route.fulfill({ status: 200, contentType: 'image/x-icon', body: '' });
    });
    ctx.on('request', r => { const u = r.url(); if (!u.startsWith(O) && !u.startsWith('https://www.google.com/') && !/^(blob|data|about):/.test(u)) other.push(u); });
    const page = await ctx.newPage();
    page.on('pageerror', e => check(`no script error (${label}): ${e.message}`, false));
    await page.goto(O + '/signin-with-chatgpt?return_to=/');
    const created = await page.evaluate(async () => (await (await fetch('/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: 'thanksgiving' }) })).json()));
    const id = created.snapshot.trip.id;
    const api = body => page.evaluate(async ([id, body]) => { const r = await fetch('/api/trip?id=' + id, { method: body ? 'PATCH' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json() }; }, [id, body]);
    const send = async body => { const cur = await api(); const r = await api({ ...body, revision: cur.json.snapshot.revision }); if (r.status !== 200) throw new Error(JSON.stringify(r.json)); return r; };
    check(`${label}: a key is configured for this run`, !!(await api()).json.mapsEmbedKey);
    await send({ action: 'place-edit', placeId: 'home', patch: { name: 'Lakeside camp (made up)', locationText: '1 Example Shore Road, Harbour Town' } });
    await send({ action: 'place-add', place: { id: 'bakery', name: 'Lantern Row bakery (made up)', locationText: '12 Lantern Row, Harbour Town' } });
    await send({ action: 'place-add', place: { id: 'pier', name: 'North Quay pier (made up)', locationText: '45.6, -122.4', coordSystem: 'WGS84' } });
    await send({ action: 'place-add', place: { id: 'hill', name: 'Beacon Hill (made up)' } });
    const everyone = (await api()).json.snapshot.trip.activities.find(a => a.id === 'option-5').participants;
    const add = (aid, title, time, placeId, order, date = '2026-11-25') => send({ action: 'add', activity: { id: aid, title, date, time, placeId, order, participants: everyone, notes: '', guestNotes: 'Made-up plan.', guestLocation: '', fixed: false, optional: true, sourceKind: 'entered' } });
    await add('buns', 'Morning buns run', '08:00', 'bakery', 0);
    await add('boat', 'Rowing boats', '10:30', 'pier', 1);
    await page.goto(O + '/?trip=' + id);
    await page.waitForSelector('#itinerary .activity');
    await page.waitForLoadState('networkidle');
    const frame = () => page.evaluate(() => { const f = document.querySelector('#map-frame'); return f ? { src: f.getAttribute('src') || '', data: f.dataset.src || '', policy: f.getAttribute('referrerpolicy'), title: f.title } : null; });
    const toMap = async () => { await page.evaluate(() => document.querySelector('#maps').scrollIntoView({ block: 'start' })); };
    const loaded = () => page.waitForFunction(() => !!document.querySelector('#map-frame')?.getAttribute('src'), null, { timeout: 8000 }).then(() => true, () => false);
    const pick = day => page.evaluate(day => document.querySelector(`.medallion[data-day="${day}"]`).click(), day);
    const embeds = () => google.filter(g => g.url !== PROBE);

    // ---------- Nothing is sent until the map is in view ----------
    await page.evaluate(() => window.scrollTo(0, 0));
    let f = await frame();
    // Only meaningful where the map starts below the screen; on a short day on a phone it is in view at once.
    const below = await page.evaluate(() => document.querySelector('#map-frame').getBoundingClientRect().top > window.innerHeight + 100);
    check(`${label}: ${below ? 'before the map is in view the frame has no address and Google has been asked nothing' : 'the map is in view from the start on this screen, so it loads at once'}`, below ? !!f && !f.src && google.length === 0 : true, JSON.stringify(google.map(g => hideKey(g.url))));

    // ---------- A day with several stops: directions, in itinerary order ----------
    await toMap();
    check(`${label}: the frame loads once in view`, await loaded());
    f = await frame();
    const u = new URL(f.src);
    check(`${label}: several stops use directions mode`, u.origin + u.pathname === 'https://www.google.com/maps/embed/v1/directions', hideKey(f.src));
    check(`${label}: origin, waypoint and destination follow the numbered stops, as entered`, u.searchParams.get('origin') === '12 Lantern Row, Harbour Town' && u.searchParams.get('waypoints') === '1 Example Shore Road, Harbour Town' && u.searchParams.get('destination') === '45.6,-122.4', [u.searchParams.get('origin'), u.searchParams.get('waypoints'), u.searchParams.get('destination')].join(' / '));
    const order = await page.$$eval('#maps-body .map-list li strong', l => l.map(e => e.textContent));
    check(`${label}: the numbered stop list is still under the map, in the same order`, order.join('|') === 'Lantern Row bakery (made up)|Lakeside camp (made up)|North Quay pier (made up)' && await page.evaluate(() => (document.querySelector('#map-frame').compareDocumentPosition(document.querySelector('.map-list')) & Node.DOCUMENT_POSITION_FOLLOWING) > 0));
    check(`${label}: the caption says what is sent to Google and that it does not load in China`, /sent to Google/.test(await page.textContent('.map-google .map-caption')) && /does not load in mainland China/.test(await page.textContent('.map-google .map-caption')) && /Google’s suggestion, not part of the plan/.test(await page.textContent('.map-google .map-caption')));
    check(`${label}: the frame is named and sends only the site as referrer`, /^Google Maps: /.test(f.title) && f.policy === 'strict-origin' && embeds().every(g => g.referer === O + '/'), embeds().map(g => g.referer).join());
    check(`${label}: the reachability question carries no key, location, cookie or referrer`, google.some(g => g.url === PROBE) && google.filter(g => g.url === PROBE).every(g => !g.referer && !g.cookie));
    check(`${label}: the frame fits the screen`, await page.$eval('#map-frame', e => { const r = e.getBoundingClientRect(); return r.width <= window.innerWidth && r.height <= window.innerHeight && r.height >= 200; }));
    check(`${label}: no sideways scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/${label}-directions.jpg`, quality: 80 });

    // ---------- A day with one stop: place mode ----------
    await pick('2026-11-26');
    await toMap();
    check(`${label}: the one-stop day loads`, await loaded());
    f = await frame();
    check(`${label}: one stop uses place mode with the address as typed`, f.src.startsWith('https://www.google.com/maps/embed/v1/place?') && new URL(f.src).searchParams.get('q') === '1 Example Shore Road, Harbour Town', hideKey(f.src));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/${label}-place.jpg`, quality: 80 });

    // ---------- The person can choose the schematic, and it is remembered ----------
    await pick('2026-11-25');
    await toMap();
    await loaded();
    await page.click('[data-map-style="schematic"]');
    await page.waitForTimeout(500);
    const before = embeds().length;
    check(`${label}: "Show the schematic instead" puts the schematic back and keeps the list`, await page.evaluate(() => !document.querySelector('#map-frame') && !!document.querySelector('#maps-body svg.schematic-map') && document.querySelectorAll('.map-list li').length === 3 && document.activeElement?.dataset?.mapStyle === 'google'));
    await page.reload();
    await page.waitForSelector('#itinerary .activity');
    await toMap();
    await page.waitForTimeout(500);
    check(`${label}: the choice survives a reload, and Google is not asked again`, await page.evaluate(() => !document.querySelector('#map-frame') && !!document.querySelector('svg.schematic-map')) && embeds().length === before);
    await page.click('[data-map-style="google"]');
    check(`${label}: "Show this day on Google Maps" brings it back`, await loaded());

    // ---------- Whole trip shows stay locations on Google ----------
    await page.evaluate(() => document.querySelector('[data-map-view="trip"]').click());
    check(`${label}: the whole-trip view uses Google for stay locations`, await page.evaluate(() => !!document.querySelector('#maps-body iframe') && /Whole trip for everyone/.test(document.querySelector('#maps-body').textContent) && /stay location/.test(document.querySelector('#maps-body').textContent)));
    await page.evaluate(() => document.querySelector('[data-map-view="day"]').click());

    // ---------- A stop with no usable location: schematic, with the reason ----------
    await add('view', 'Sunset from the hill', '16:00', 'hill', 2);
    await page.reload();
    await page.waitForSelector('#itinerary .activity');
    await toMap();
    await page.waitForTimeout(400);
    check(`${label}: a stop with only a name keeps the day on the schematic and says why`, await page.evaluate(() => !document.querySelector('#map-frame') && !!document.querySelector('svg.schematic-map') && /Shown as a schematic, not on Google Maps, because “Beacon Hill \(made up\)” has no address or WGS-84 coordinates/.test(document.querySelector('#maps-body').textContent)));
    await page.screenshot({ path: `${SHOTS}/${label}-no-usable-location.jpg`, quality: 80 });
    await send({ action: 'place-edit', placeId: 'hill', patch: { locationText: '39.9163, 116.3972', coordSystem: 'GCJ02' } });
    await page.reload();
    await page.waitForSelector('#itinerary .activity');
    await toMap();
    await page.waitForTimeout(400);
    check(`${label}: GCJ-02 coordinates are not sent to Google`, await page.evaluate(() => !document.querySelector('#map-frame') && /coordinates in a system Google Maps would misplace/.test(document.querySelector('#maps-body').textContent)) && !google.some(g => g.url.includes('39.9163')));
    await send({ action: 'place-edit', placeId: 'hill', patch: { locationText: '9 Beacon Lane, Harbour Town', coordSystem: '' } });

    // ---------- Google cannot be reached: the schematic comes back by itself ----------
    reachable = false;
    const sentBefore = embeds().length;
    await page.reload();
    await page.waitForSelector('#itinerary .activity');
    await toMap();
    const fell = await page.waitForFunction(() => /Google Maps did not load, so this is the schematic/.test(document.querySelector('#maps-body')?.textContent || ''), null, { timeout: 10000 }).then(() => true, () => false);
    check(`${label}: when Google is unreachable the schematic is shown, with the list and a way to try again`, fell && await page.evaluate(() => !document.querySelector('#map-frame') && !!document.querySelector('svg.schematic-map') && document.querySelectorAll('.map-list li').length === 4 && !!document.querySelector('[data-map-style="google"]')));
    check(`${label}: no location was sent while Google was unreachable`, embeds().length === sentBefore);
    await page.screenshot({ path: `${SHOTS}/${label}-unreachable.jpg`, quality: 80 });
    reachable = true;
    await page.click('[data-map-style="google"]');
    check(`${label}: "Try Google Maps again" works once it is reachable`, await loaded());
    f = await frame();
    check(`${label}: four stops give two waypoints separated by |`, new URL(f.src).searchParams.get('waypoints') === '1 Example Shore Road, Harbour Town|45.6,-122.4' && new URL(f.src).searchParams.get('destination') === '9 Beacon Lane, Harbour Town', hideKey(f.src));

    // ---------- Offline copy and guests ----------
    check(`${label}: the key is not kept in this device's downloaded copy`, await page.evaluate(async id => { const key = (await (await fetch('/api/trip?id=' + id)).json()).mapsEmbedKey; return !!key && !Object.keys(localStorage).some(k => (localStorage.getItem(k) || '').includes(key)); }, id));
    const share = await page.evaluate(async id => (await (await fetch('/api/share?id=' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rotate', base: { share: 1 } }) })).json()), id);
    const count = google.length;
    const guest = await ctx.newPage();
    await guest.goto(share.url);
    await guest.waitForSelector('#itinerary .activity');
    await guest.evaluate(() => document.querySelector('#maps').scrollIntoView({ block: 'start' }));
    await guest.waitForTimeout(600);
    check(`${label} guest: with the switch off, the guest page keeps the schematic and never contacts Google`, await guest.evaluate(() => !document.querySelector('iframe') && !!document.querySelector('#maps svg.schematic-map') && !/Google/.test(document.querySelector('#maps').textContent)) && google.length === count);
    const sentOff = await guest.evaluate(async t => await (await fetch('/api/shared', { headers: { Authorization: 'Share ' + t } })).text(), new URL(share.url).hash.slice(1));
    check(`${label} guest: with the switch off the guest link carries no key and no location`, /"mapsEmbedKey":""/.test(sentOff) && !/mapQuery|Lantern Row, Harbour|Example Shore|45\.6,/.test(sentOff));

    // ---------- The organizer switches the Google map on for the guest link ----------
    await page.evaluate(() => document.querySelector('#share').click());
    await page.waitForSelector('#guest-map');
    check(`${label}: the guest-link dialog explains the switch before it is ticked`, await page.$eval('.guest-map-choice', e => !e.querySelector('#guest-map').checked && /Anyone holding the guest link can then read those locations/.test(e.textContent) && /does not load in mainland China/.test(e.textContent)));
    await page.$eval('.guest-map-choice', e => e.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/${label}-guest-switch.jpg`, quality: 80 });
    await page.check('#guest-map');
    await page.waitForFunction(() => /Saved\. Guests now get the Google day map/.test(document.querySelector('#guest-map-message')?.textContent || ''));
    check(`${label}: ticking it saves, stays ticked and says so`, await page.$eval('#guest-map', e => e.checked) && (await api()).json.snapshot.trip.guestMap === true);
    await page.evaluate(() => document.querySelector('#share-dialog').close());
    await guest.reload();
    await guest.waitForSelector('#itinerary .activity');
    await guest.evaluate(() => document.querySelector('#maps').scrollIntoView({ block: 'start' }));
    const gLoaded = await guest.waitForFunction(() => !!document.querySelector('#map-frame')?.getAttribute('src'), null, { timeout: 8000 }).then(() => true, () => false);
    check(`${label} guest: switched on, the Google day map loads on the guest page`, gLoaded);
    const gSrc = gLoaded ? await guest.$eval('#map-frame', e => e.getAttribute('src')) : '';
    const gu = gSrc ? new URL(gSrc) : null;
    check(`${label} guest: several stops in directions mode, in the guest's itinerary order`, !!gu && gu.pathname.endsWith('/directions') && gu.searchParams.get('origin') === '12 Lantern Row, Harbour Town' && gu.searchParams.get('destination') === '9 Beacon Lane, Harbour Town' && gu.searchParams.get('waypoints') === '45.6,-122.4', gSrc ? hideKey(gSrc) : '');
    check(`${label} guest: the page's security policy lets the Google frame load and nothing else from outside`, await guest.evaluate(() => { try { return !!document.querySelector('#map-frame').contentWindow; } catch { return true; } }) && embeds().some(g => g.url === gSrc && g.referer === O + '/') && other.length === 0);
    check(`${label} guest: the guest link's token is not in what Google is sent`, embeds().every(g => !g.url.includes(new URL(share.url).hash.slice(1)) && !g.referer.includes('#')));
    check(`${label} guest: the list under the map is still names only, with no link or edit control`, await guest.$eval('#maps', e => e.querySelectorAll('.map-list li').length === 3 && !e.querySelector('a.map-link') && !e.querySelector('[data-place-edit]') && !/Map address|Harbour Town/.test(e.querySelector('.map-list').textContent)));
    check(`${label} guest: the caption says the locations go to Google`, /sent to Google/.test(await guest.textContent('.map-google .map-caption')));
    await guest.waitForTimeout(300);
    await guest.screenshot({ path: `${SHOTS}/${label}-guest-google.jpg`, quality: 80 });
    check(`${label} guest: no sideways scroll`, await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await guest.click('[data-map-style="schematic"]');
    check(`${label} guest: a guest can choose the schematic`, await guest.evaluate(() => !document.querySelector('#map-frame') && !!document.querySelector('#maps svg.schematic-map') && document.activeElement?.dataset?.mapStyle === 'google'));
    await guest.click('[data-map-style="google"]');
    await guest.waitForFunction(() => !!document.querySelector('#map-frame')?.getAttribute('src'), null, { timeout: 8000 }).catch(() => { });
    reachable = false;
    await guest.reload();
    await guest.waitForSelector('#itinerary .activity');
    await guest.evaluate(() => document.querySelector('#maps').scrollIntoView({ block: 'start' }));
    check(`${label} guest: when Google is unreachable the guest page shows the schematic by itself`, await guest.waitForFunction(() => /Google Maps did not load, so this is the schematic/.test(document.querySelector('#maps-body')?.textContent || '') && !!document.querySelector('#maps svg.schematic-map'), null, { timeout: 10000 }).then(() => true, () => false));
    reachable = true;
    // Whole trip on the guest page stays as it was.
    await guest.evaluate(() => document.querySelector('[data-map-view="trip"]').click());
    check(`${label} guest: whole trip never uses Google`, await guest.evaluate(() => !document.querySelector('#maps-body iframe')));
    // Switched off again: the locations and the key are withdrawn.
    await page.evaluate(() => document.querySelector('#share').click());
    await page.waitForSelector('#guest-map');
    await page.uncheck('#guest-map');
    await page.waitForFunction(() => /Guests see the schematic/.test(document.querySelector('#guest-map-message')?.textContent || ''));
    const sentBack = await guest.evaluate(async t => await (await fetch('/api/shared', { headers: { Authorization: 'Share ' + t } })).text(), new URL(share.url).hash.slice(1));
    check(`${label} guest: switched off again, the guest link carries no key and no location`, /"mapsEmbedKey":""/.test(sentBack) && !/mapQuery/.test(sentBack));
    check(`${label}: nothing was requested from any other site`, other.length === 0, other.join(' '));
    await ctx.close();
  }
  await run('desktop', { width: 1440, height: 900 });
  await run('phone', { width: 390, height: 844 });
  await run('landscape', { width: 844, height: 390 });
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
