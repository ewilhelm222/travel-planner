/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
// Browser check for the weather line under each date, against a disposable local dev server with a synthetic
// trip. The forecast shown is made up: the page's request to /api/weather is answered here, so no weather
// service is contacted by the screenshots. The real route is also called once, to see that it answers quietly.
// Usage: node scripts/check-weather-browser.cjs <screenshot-dir> [origin]
// Requires the dev server (`npm run dev`) with PLANNER_CREATOR_EMAILS=seedy@sites.test in .dev.vars.
const O = process.argv[3] || 'http://127.0.0.1:5173', SHOTS = process.argv[2] || '.';
if (!['127.0.0.1', 'localhost'].includes(new URL(O).hostname)) throw new Error('Only run against disposable loopback data.');
let failed = 0;
const check = (name, ok, extra = '') => { if (!ok) failed++; console.log(ok ? 'ok   ' : 'FAIL ', name, extra); };
// Nov 25 rain, Nov 26 snow, Nov 27 rain and snow, Nov 28 dry, Nov 29 no forecast. The server's answer (where
// to ask) and the forecast service's answer are both made up here; the browser does the rest.
const DATES = ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'];
const ROWS = [[80, 31, 0, 9, 3], [90, 0, 11, 0, -6], [70, 6, 3, 3, -1], [5, 0, 0, 12, 1]];
const FORECAST = { timezone: 'America/Los_Angeles', daily: { time: DATES, weather_code: ROWS.map(() => 3), precipitation_probability_max: ROWS.map(r => r[0]), precipitation_sum: ROWS.map(r => r[1] + r[2]), rain_sum: ROWS.map(r => r[1]), showers_sum: ROWS.map(() => 0), snowfall_sum: ROWS.map(r => r[2]), temperature_2m_max: ROWS.map(r => r[3]), temperature_2m_min: ROWS.map(r => r[4]) } };
const PLAN = { points: [{ lat: 38.25, lng: -120.35, where: 'Pine Flat cabin (made up)' }], dates: Object.fromEntries([...DATES, '2026-11-29'].map(d => [d, 0])) };
const METEO = 'https://api.open-meteo.com/**';
(async () => {
  const browser = await chromium.launch();
  async function run(label, viewport, { dense } = {}) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block', hasTouch: viewport.width < 1000, locale: 'en-US' });
    const page = await ctx.newPage();
    page.on('pageerror', e => check(`no script error (${label}): ${e.message}`, false));
    await page.goto(O + '/signin-with-chatgpt?return_to=/');
    const created = await page.evaluate(async () => (await (await fetch('/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: 'thanksgiving' }) })).json()));
    const id = created.snapshot.trip.id;
    const api = (path, body) => page.evaluate(async ([path, body]) => { const r = await fetch(path, { method: body ? (path.startsWith('/api/share') ? 'POST' : 'PATCH') : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json() }; }, [path, body]);
    const rev = async () => (await api('/api/trip?id=' + id)).json.snapshot.revision;
    await api('/api/trip?id=' + id, { action: 'place-edit', placeId: 'home', patch: { name: 'Pine Flat cabin (made up)', locationText: '38.25, -120.35', coordSystem: 'WGS84', coordSource: 'Synthetic test value' }, revision: await rev() });

    // The real route: reachable or not, the weather service never produces an error for the page.
    const real = await api('/api/weather?id=' + id);
    check(`${label}: the weather route answers with one rounded point for the five days, and asks no forecast itself`, real.status === 200 && JSON.stringify(real.json) === JSON.stringify(PLAN), JSON.stringify(real.json).slice(0, 200));

    // Before any answer: measure the header while the forecast is still on its way.
    let release;
    const held = new Promise(r => { release = r; });
    const asked = [];
    await page.route(METEO, async route => { asked.push(route.request()); await held; await route.fulfill({ json: FORECAST, headers: { 'Access-Control-Allow-Origin': '*' } }); });
    await page.goto(O + '/?trip=' + id);
    await page.waitForSelector('#itinerary .agenda-day');
    if (dense === false) await page.evaluate(() => document.querySelector('#density[aria-pressed=true]')?.click());
    const measure = () => page.$$eval('#itinerary .agenda-day', days => days.filter(x => x.offsetParent).map(x => { const h = x.querySelector('.agenda-date').getBoundingClientRect(), w = x.querySelector('.day-weather').getBoundingClientRect(), c = x.querySelector('.agenda-city')?.getBoundingClientRect(); return { header: Math.round(h.height), line: Math.round(w.height), under: Math.round(w.top - x.querySelector('.agenda-date h2').getBoundingClientRect().bottom), city: c ? Math.round(c.top - h.top) : null, clipped: x.querySelector('.day-weather').scrollWidth > x.querySelector('.day-weather').clientWidth + 1, text: x.querySelector('.day-weather').innerText.trim() }; }));
    const first = await measure();
    check(`${label}: before the first forecast, the line takes no room`, first.every(x => x.line === 0 && x.text === ''), JSON.stringify(first.map(x => [x.line, x.text])));
    release();
    await page.waitForSelector('.day-weather .weather-precip');
    // The trip is now known to have a forecast: on the next visit the room is kept while it loads, so nothing jumps.
    let release2;
    const held2 = new Promise(r => { release2 = r; });
    check(`${label}: the browser asked the forecast service for the rounded point only, with no referrer or cookie`, asked.length === 1 && /latitude=38\.25&longitude=-120\.35&daily=/.test(asked[0].url()) && !asked[0].headers().referer && !asked[0].headers().cookie, asked.map(r => r.url()).join(' '));
    await page.unroute(METEO);
    await page.route(METEO, async route => { await held2; await route.fulfill({ json: FORECAST, headers: { 'Access-Control-Allow-Origin': '*' } }); });
    await page.reload();
    await page.waitForSelector('#itinerary .agenda-day');
    if (dense === false) await page.evaluate(() => document.querySelector('#density[aria-pressed=true]')?.click());
    const before = await measure();
    check(`${label}: while loading again, every line is empty and keeps its room`, before.every(x => x.text === '' && x.line > 0), JSON.stringify(before.map(x => [x.line, x.text])));
    release2();
    await page.waitForSelector('.day-weather .weather-precip');
    const after = await measure();
    console.log('     ', JSON.stringify(after.map(x => x.text.replace(/\n/g, ' | '))));
    check(`${label}: header and first place start at the same height with and without a forecast`, JSON.stringify(before.map(x => [x.header, x.city])) === JSON.stringify(after.map(x => [x.header, x.city])), JSON.stringify([before, after].map(m => m.map(x => [x.header, x.city]))));
    check(`${label}: every column's header is the same height`, new Set(after.map(x => x.header)).size === 1 && new Set(after.map(x => x.city)).size === 1);
    check(`${label}: the weather line is one fixed-height line under the date`, after.every(x => x.line === after[0].line && x.line >= 22 && x.line <= 24 && x.under >= 0));
    if (viewport.width < 600) {
      // Phone portrait shows one day at a time: step through the days.
      for (const [date, name, want] of [['2026-11-25', 'wet', /Heavy rain 80% · 1\.2 in/], ['2026-11-26', 'snowy', /Snow 90% · 4 in/], ['2026-11-28', 'dry', /^Dry/], ['2026-11-29', 'unavailable', /^—/]]) {
        await page.click(`.medallion[data-day="${date}"]`);
        await page.waitForSelector(`.agenda-day[data-date="${date}"][data-selected=true] .day-weather > *`, { state: 'attached' });
        const text = await page.$eval(`.agenda-day[data-date="${date}"] .day-weather`, e => e.innerText.trim());
        check(`${label}: ${name} day reads "${text.replace(/\n/g, ' | ')}"`, want.test(text));
        if (name === 'unavailable') check(`${label}: a day with no forecast gives its line back`, await page.$eval(`.agenda-day[data-date="${date}"] .day-weather`, e => e.getBoundingClientRect().height === 0));
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: `${SHOTS}/${label}-${name}.jpg`, quality: 85 });
      }
    }
    else {
      const texts = after.map(x => x.text);
      check(`${label}: precipitation leads each line`, /^Heavy rain 80%/.test(texts[0]) && /^Snow 90% · 4 in/.test(texts[1]) && /^Rain & snow 70%/.test(texts[2] || 'Rain & snow 70%'));
      await page.$eval('#itinerary', e => e.scrollIntoView({ block: 'start' }));
      await page.evaluate(() => scrollBy(0, -150));
      await page.screenshot({ path: `${SHOTS}/${label}.jpg`, quality: 85 });
      if (after.length < 5) {
        await page.$eval('#itinerary', e => { e.scrollLeft = e.scrollWidth; });
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${SHOTS}/${label}-later-days.jpg`, quality: 85 });
      }
    }
    check(`${label}: wet and snowy days are marked on the day chips, dry and unknown days are not`, await page.$$eval('.medallion[data-day]', chips => chips.map(c => c.querySelector('.medallion-weather')?.className.split(' ')[1] || '').join(',')) === 'rain,snow,mixed,,');
    check(`${label}: the chip says it in words`, /Forecast: snow, 90 percent/.test(await page.getAttribute('.medallion[data-day="2026-11-26"]', 'aria-label')));
    check(`${label}: no sideways page scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    check(`${label}: the line carries when the forecast was updated`, /Forecast for Pine Flat cabin \(made up\)\. Updated /.test(await page.getAttribute('.day-weather[data-weather="2026-11-26"]', 'title')));
    const note = await page.$eval('#weather-note', e => ({ text: e.textContent, shown: !!e.offsetParent }));
    check(`${label}: the note under the schedule says when and from where`, /updated .*Open-Meteo\.com/.test(note.text) && (note.shown || viewport.height <= 520), note.text);

    // No forecast for any day: the line is given back in every column, and the organizer is told why.
    await page.unroute(METEO);
    await page.route(METEO, route => route.fulfill({ status: 429, body: 'busy', headers: { 'Access-Control-Allow-Origin': '*' } }));
    // The service stops answering: the forecast this browser saw last stands in, with its own update time.
    await page.evaluate(id => { const k = 'waypoint-weather:' + id, v = JSON.parse(localStorage.getItem(k)); v.data.updatedAt = new Date(Date.now() - 3600e3).toISOString(); localStorage.setItem(k, JSON.stringify(v)); }, id);
    await page.reload();
    await page.waitForSelector('.day-weather .weather-precip', { state: 'attached' });
    check(`${label}: when the service does not answer, the last forecast seen is still shown`, /Snow 90%|Heavy rain 80%/.test(await page.$eval('#itinerary', e => e.textContent)) && /updated/.test(await page.textContent('#weather-note')));
    // A browser that never saw a forecast has nothing to show.
    await page.evaluate(id => localStorage.removeItem('waypoint-weather:' + id), id);
    await page.reload();
    await page.waitForFunction(() => /No forecast/.test(document.querySelector('#weather-note')?.textContent || ''));
    if (dense === false) await page.evaluate(() => document.querySelector('#density[aria-pressed=true]')?.click());
    const none = await measure();
    check(`${label}: with no forecast at all the line is reclaimed in every column`, none.every(x => x.line === 0) && none.every(x => x.header === first[0].header && x.city === first[0].city), JSON.stringify(none.map(x => [x.line, x.header])));
    check(`${label}: the organizer is told why`, /did not answer this device \(HTTP 429\)/.test(await page.textContent('#weather-note')));
    if (viewport.width >= 600) {
      await page.$eval('#itinerary', e => e.scrollIntoView({ block: 'start' }));
      await page.evaluate(() => scrollBy(0, -150));
    }
    await page.screenshot({ path: `${SHOTS}/${label}-none.jpg`, quality: 85 });

    // The guest link shows the same line. The local, disposable trip gets a guest link for this check only.
    const share = await api('/api/share?id=' + id, { action: 'rotate', revision: await rev(), base: { share: 1 } });
    if (share.status === 200) {
      const guest = await ctx.newPage();
      await guest.route(METEO, route => route.fulfill({ json: FORECAST, headers: { 'Access-Control-Allow-Origin': '*' } }));
      guest.on('console', m => { if (/Content Security Policy/i.test(m.text())) check(`${label}: guest page policy allows the forecast request: ${m.text()}`, false); });
      const realGuest = await page.evaluate(async url => { const r = await fetch('/api/shared-weather', { headers: { Authorization: 'Share ' + url.split('#')[1] } }); return { status: r.status, json: await r.json() }; }, share.json.url);
      check(`${label}: guest weather route answers with the rounded point and no place name`, realGuest.status === 200 && JSON.stringify(realGuest.json.points) === '[{"lat":38.25,"lng":-120.35}]' && !JSON.stringify(realGuest.json).includes('Pine'));
      check(`${label}: guest weather route refuses a wrong token`, (await page.evaluate(async () => (await fetch('/api/shared-weather', { headers: { Authorization: 'Share ' + 'A'.repeat(43) } })).status)) === 404);
      await guest.goto(share.json.url);
      await guest.waitForSelector('.day-weather .weather-precip');
      const day = viewport.width < 600 ? '2026-11-25' : '2026-11-26';
      check(`${label}: guests see the same weather line`, /Snow 90% · 4 in|Heavy rain 80%/.test(await guest.$eval(`.agenda-day[data-date="${day}"] .day-weather`, e => e.innerText)));
      check(`${label}: guests are not told the place`, !/Pine/.test(await guest.getAttribute(`.day-weather[data-weather="${day}"]`, 'title')));
      // The forecast service refuses a guest: nothing is said about it.
      await guest.unroute(METEO);
      await guest.route(METEO, route => route.fulfill({ status: 429, body: 'busy', headers: { 'Access-Control-Allow-Origin': '*' } }));
      await guest.evaluate(() => localStorage.removeItem('waypoint-guest-weather'));
      await guest.reload();
      await guest.waitForSelector('#itinerary .agenda-day');
      await guest.waitForTimeout(600);
      check(`${label}: a guest whose forecast is refused sees no line and no reason`, await guest.$eval('#weather-note', e => e.hidden) && await guest.$$eval('.day-weather', ls => ls.every(l => l.getBoundingClientRect().height === 0)));
      await guest.$eval('#itinerary', e => e.scrollIntoView({ block: 'start' }));
      await guest.evaluate(() => scrollBy(0, -150));
      await guest.screenshot({ path: `${SHOTS}/${label}-guest.jpg`, quality: 85 });
    }
    else
      check(`${label}: guest link for the check`, false, JSON.stringify(share.json));
    await ctx.close();
  }
  await run('desktop', { width: 1440, height: 900 }, { dense: false });
  await run('desktop-week', { width: 1440, height: 900 });
  await run('phone-landscape', { width: 844, height: 390 });
  await run('phone', { width: 390, height: 844 });
  await browser.close();
  console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
  process.exit(failed ? 1 : 0);
})();
