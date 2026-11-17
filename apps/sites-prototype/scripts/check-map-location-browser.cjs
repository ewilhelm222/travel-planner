/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
// Browser check for "Location for the map" accepting an address or coordinates, against a disposable
// local dev server with synthetic data. All addresses are made up.
// Usage: node scripts/check-map-location-browser.cjs <screenshot-dir> [origin]
// Requires the dev server (`npm run dev`) with PLANNER_CREATOR_EMAILS=seedy@sites.test in .dev.vars.
// Exits non-zero if any check fails.
const O = process.argv[3] || 'http://127.0.0.1:5173', SHOTS = process.argv[2] || '.';
if (!['127.0.0.1', 'localhost'].includes(new URL(O).hostname)) throw new Error('Only run against disposable loopback data.');
let failed = 0;
const check = (name, ok, extra = '') => { if (!ok) failed++; console.log(ok ? 'ok   ' : 'FAIL ', name, extra); };
const ADDRESS = '12 Lantern Row, Harbour Town';
(async () => {
  const browser = await chromium.launch();
  const outside = [];
  async function run(label, viewport) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block', hasTouch: viewport.width < 800 });
    const page = await ctx.newPage();
    page.on('pageerror', e => check(`no script error (${label}): ${e.message}`, false));
    page.on('request', r => { if (!r.url().startsWith(O)) outside.push(r.url()); });
    await page.goto(O + '/signin-with-chatgpt?return_to=/');
    const created = await page.evaluate(async () => (await (await fetch('/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: 'thanksgiving' }) })).json()));
    const id = created.snapshot.trip.id;
    const api = body => page.evaluate(async ([id, body]) => { const r = await fetch('/api/trip?id=' + id, { method: body ? 'PATCH' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json() }; }, [id, body]);
    const send = async body => { const cur = await api(); const r = await api({ ...body, revision: cur.json.snapshot.revision }); if (r.status !== 200) throw new Error(JSON.stringify(r.json)); return r; };
    const place = async pid => (await api()).json.snapshot.trip.places.find(p => p.id === pid);
    // An older place: two numbers and a system, as the first maps pass stored them. Plus a second place and entered plans.
    await send({ action: 'place-edit', placeId: 'home', patch: { name: 'Lakeside camp (made up)', lat: 45.5, lng: -122.6, coordSystem: 'WGS84', coordSource: 'Synthetic test value' } });
    await send({ action: 'place-add', place: { id: 'bakery', name: 'Lantern Row bakery (made up)' } });
    const everyone = (await api()).json.snapshot.trip.activities.find(a => a.id === 'option-5').participants;
    await send({ action: 'add', activity: { id: 'buns', title: 'Morning buns run', date: '2026-11-25', time: '08:00', placeId: 'bakery', order: 0, participants: everyone, notes: 'Made-up note.', guestNotes: 'Fresh buns for everyone.', guestLocation: 'Bakery door', fixed: false, optional: true, sourceKind: 'entered' } });
    await page.goto(O + '/?trip=' + id);
    await page.waitForSelector('#itinerary .activity');
    await page.waitForLoadState('networkidle');
    const openPlace = async pid => { await page.evaluate(pid => document.querySelector(`#maps [data-place-edit="${pid}"]`).click(), pid); await page.waitForSelector('#place-form'); };
    const read = () => page.$eval('#location-read', e => e.textContent);
    const box = '#place-form [name=locationText]';
    const save = async () => { await page.evaluate(() => { document.querySelector('#structure-message').textContent = ''; }); await page.click('#structure-save'); await page.waitForFunction(() => !document.querySelector('#structure-dialog')?.open || !!document.querySelector('#structure-message')?.textContent, null, { timeout: 5000 }); };
    await page.evaluate(() => document.querySelector('[data-map-view="day"]').click());

    // ---- An older place opens with its stored pair and saves untouched ----
    await openPlace('home');
    check(`${label}: one box, no separate latitude and longitude`, await page.$eval('#place-form', f => !!f.elements.locationText && !f.elements.lat && !f.elements.lng));
    check(`${label}: older coordinates shown in the box`, await page.inputValue(box) === '45.5, -122.6');
    check(`${label}: read back as coordinates, system shown`, /Read as coordinates: 45\.5° N, 122\.6° W/.test(await read()) && await page.isVisible('#coord-fields') && await page.inputValue('#place-form [name=coordSystem]') === 'WGS84');
    check(`${label}: help says either form is fine`, /Either is fine/.test(await page.textContent('#location-help')));
    await page.fill('#place-form [name=localName]', '湖畔营地');
    await save();
    let home = await place('home');
    check(`${label}: saving another field leaves the stored coordinates exactly as they were`, home.lat === 45.5 && home.lng === -122.6 && home.coordSystem === 'WGS84' && home.locationText === '' && home.localName === '湖畔营地', JSON.stringify(home));

    // ---- An address ----
    await page.keyboard.press('Escape');
    await openPlace('bakery');
    check(`${label}: empty state explained`, /Nothing entered yet/.test(await read()) && !(await page.isVisible('#coord-fields')));
    await page.fill(box, ADDRESS);
    check(`${label}: typed address is read as an address; no coordinate system asked`, /Read as an address or place name/.test(await read()) && !(await page.isVisible('#coord-fields')));
    await page.$eval('#structure-dialog', d => { d.scrollTop = d.querySelector('[name=locationText]').closest('fieldset').offsetTop - 80; });
    await page.screenshot({ path: `${SHOTS}/${label}-form-address.jpg`, quality: 82 });
    // Half a pair is refused with a reason and the draft is kept.
    await page.fill(box, '45.52');
    check(`${label}: half a pair is explained while typing`, /not a complete pair/.test(await read()));
    await save();
    check(`${label}: half a pair is refused on save, draft kept`, /not a complete pair/.test(await page.textContent('#structure-message')) && await page.inputValue(box) === '45.52');
    await page.fill(box, '45.52° N, 122.68° W');
    check(`${label}: coordinates with compass letters are read`, /Read as coordinates: 45\.52° N, 122\.68° W/.test(await read()) && await page.isVisible('#coord-fields'));
    await save();
    check(`${label}: coordinates without a system are refused`, /Say which coordinate system/.test(await page.textContent('#structure-message')));
    await page.selectOption('#place-form [name=coordSystem]', 'WGS84');
    await page.$eval('#structure-dialog', d => { d.scrollTop = d.querySelector('[name=locationText]').closest('fieldset').offsetTop - 80; });
    await page.screenshot({ path: `${SHOTS}/${label}-form-coordinates.jpg`, quality: 82 });
    await save();
    let bakery = await place('bakery');
    check(`${label}: typed coordinates saved as typed, numbers read from them`, bakery.locationText === '45.52° N, 122.68° W' && bakery.lat === 45.52 && bakery.lng === -122.68 && bakery.coordSystem === 'WGS84', JSON.stringify(bakery));
    await page.keyboard.press('Escape');
    await openPlace('bakery');
    check(`${label}: the form shows the text back exactly`, await page.inputValue(box) === '45.52° N, 122.68° W');
    await page.fill(box, ADDRESS);
    await save();
    bakery = await place('bakery');
    check(`${label}: switching to an address drops the coordinates and their system`, bakery.locationText === ADDRESS && bakery.lat === null && bakery.lng === null && bakery.coordSystem === '', JSON.stringify(bakery));
    await page.keyboard.press('Escape');

    // ---- Shown back on the map list and in the activity view ----
    await page.evaluate(() => document.querySelector('[data-map-view="day"]').click());
    const row = await page.$eval('#maps-body', e => [...e.querySelectorAll('.map-list li')].find(li => li.textContent.includes('Lantern Row bakery'))?.innerHTML || '');
    check(`${label}: map list shows the address and both searches`, row.includes(`Map address: ${ADDRESS}`) && row.includes('https://maps.apple.com/?q=' + encodeURIComponent(ADDRESS)) && row.includes('https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent(ADDRESS)), row.slice(0, 300));
    const homeRow = await page.evaluate(() => { document.querySelector('[data-map-view="trip"]').click(); return [...document.querySelectorAll('#maps-body .map-list li')].find(li => li.textContent.includes('Lakeside camp'))?.textContent || ''; });
    check(`${label}: older coordinates read in words, with system and source`, homeRow.includes('45.5° N, 122.6° W · WGS-84 · source: Synthetic test value'), homeRow);
    check(`${label}: no link is built from coordinates; the place is searched by name instead`, await page.evaluate(() => { const li = [...document.querySelectorAll('#maps-body .map-list li')].find(li => li.textContent.includes('Lakeside camp')); return li.textContent.includes('Search this place’s name in') && [...li.querySelectorAll('a')].every(a => !/45\.5|122\.6/.test(a.href)); }));
    await page.evaluate(() => { document.querySelector('[data-map-view="day"]').click(); document.querySelector('#maps').scrollIntoView({ block: 'start' }); });
    await page.screenshot({ path: `${SHOTS}/${label}-map-list.jpg`, quality: 82 });
    check(`${label}: no sideways scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.evaluate(() => { const c = document.querySelector('#itinerary .activity[data-detail="buns"]'); c.scrollIntoView({ block: 'center' }); c.click(); });
    await page.waitForFunction(() => document.querySelector('#activity-view')?.open);
    check(`${label}: activity view offers the searches, marked as searches`, await page.$eval('#activity-view .view-where', (e, a) => e.textContent.includes(a) && e.textContent.includes('Search this address in') && e.querySelectorAll('a.map-link.search').length === 4 && [...e.querySelectorAll('a.map-link')].every(l => l.classList.contains('search')), ADDRESS));
    await page.screenshot({ path: `${SHOTS}/${label}-activity-view.jpg`, quality: 82 });
    await page.keyboard.press('Escape');

    // ---- History names the field; guests get none of it ----
    const history = await page.evaluate(async id => (await (await fetch('/api/history?id=' + id)).json()).changes[0], id);
    check(`${label}: the change is logged per record`, history.records.length === 1 && history.records[0].kind === 'place' && history.records[0].after.locationText === ADDRESS);
    const share = await page.evaluate(async id => (await (await fetch('/api/share?id=' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rotate', base: { share: 1 } }) })).json()), id);
    const guest = await ctx.newPage();
    await guest.goto(share.url);
    await guest.waitForSelector('#itinerary .activity');
    const sent = JSON.stringify(await guest.evaluate(async t => (await (await fetch('/api/shared', { headers: { Authorization: 'Share ' + t } })).json()), new URL(share.url).hash.slice(1)));
    check(`${label}: guest data carries no typed location, coordinates or search`, !/Lantern Row, Harbour|locationText|45\.5|maps\.apple|google\.com\/maps/.test(sent));
    await guest.evaluate(() => document.querySelector('.activity[data-detail="buns"]').click());
    check(`${label}: guest view of the activity has no address or search link`, await guest.$eval('#activity-view', e => e.open && !e.textContent.includes('Harbour Town') && !e.querySelector('a.search')));
    await ctx.close();
  }
  await run('desktop', { width: 1440, height: 900 });
  await run('phone', { width: 390, height: 844 });
  check('nothing was requested from another site (no lookup of the address)', outside.length === 0, outside.join(' '));
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
