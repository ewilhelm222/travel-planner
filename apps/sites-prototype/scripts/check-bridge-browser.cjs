/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
const path = require('path');
// Browser check for travel bridges against a disposable local dev server. The trip is the made-up Japan demo in
// tests/fixtures/japan-trip.mjs; the forecast service is never contacted.
// Usage: node scripts/check-bridge-browser.cjs <screenshot-dir> [origin]
// Requires the dev server (`npm run dev`) with PLANNER_CREATOR_EMAILS=seedy@sites.test in .dev.vars.
const O = process.argv[3] || 'http://127.0.0.1:5173', SHOTS = process.argv[2] || '.';
if (!['127.0.0.1', 'localhost'].includes(new URL(O).hostname)) throw new Error('Only run against disposable loopback data.');
let failed = 0;
const check = (name, ok, extra = '') => { if (!ok) failed++; console.log(ok ? 'ok   ' : 'FAIL ', name, extra); };
(async () => {
  const { japanTripInput } = await import(path.join(__dirname, '../tests/fixtures/japan-trip.mjs'));
  const browser = await chromium.launch();
  const open = async (viewport, touch) => {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block', hasTouch: touch, locale: 'en-US' });
    const page = await ctx.newPage();
    page.on('pageerror', e => check(`no script error: ${e.message}`, false));
    await page.route('https://api.open-meteo.com/**', r => r.abort());
    await page.goto(O + '/signin-with-chatgpt?return_to=/');
    return page;
  };
  const shot = (page, name, opts = {}) => page.screenshot({ path: `${SHOTS}/${name}.jpg`, type: 'jpeg', quality: 82, ...opts });
  const show = async (page, id, date) => {
    await page.goto(O + '/?trip=' + id);
    await page.waitForSelector('#itinerary .activity');
    // Twice: the board is redrawn once more when "last edited" and the weather answer arrive.
    for (let i = 0; i < 2; i++) {
      await page.waitForTimeout(500);
      await page.evaluate(date => {
        const it = document.querySelector('#itinerary'), column = date && it.querySelector(`.agenda-day[data-date="${date}"]`);
        (document.querySelector('.toolbar') || it).scrollIntoView();
        if (column && getComputedStyle(it).display !== 'block') it.scrollLeft = column.offsetLeft - it.offsetLeft;
      }, date);
    }
    await page.waitForTimeout(300);
  };
  const columns = page => page.$$eval('#itinerary > *', els => els.map(e => e.classList.contains('bridge') ? 'bridge' : `${e.dataset.date.slice(8)}${e.dataset.part ? ':' + e.dataset.part : ''}`));
  const partOf = (page, id) => page.$eval(`#itinerary [data-detail="${id}"]`, e => { const day = e.closest('.agenda-day'); return `${day.dataset.date.slice(8)}:${day.dataset.part || 'whole'}`; }).catch(() => 'not on a day');

  // ---------- Desktop ----------
  const page = await open({ width: 1440, height: 1000 }, false);
  const create = body => page.evaluate(async body => (await (await fetch('/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()).snapshot.trip.id, body);
  const japan = await create({ trip: japanTripInput() }), single = await create({ template: 'thanksgiving' });
  const api = (id, body) => page.evaluate(async ([id, body]) => { const r = await fetch('/api/trip?id=' + id, { method: body ? 'PATCH' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json() }; }, [id, body]);
  const revision = async id => (await api(id)).json.snapshot.revision;

  await show(page, japan, '2027-05-04');
  check('columns: travel days are in two parts with a bridge between', (await columns(page)).join(' ') === '03 04 05:before bridge 05:after 06 07:before bridge 07:after 08', (await columns(page)).join(' '));
  check('the board with bridges lays out as a row', await page.$eval('#itinerary', e => getComputedStyle(e).display) === 'flex');
  const widths = await page.$$eval('#itinerary > .agenda-day', els => [...new Set(els.map(e => Math.round(e.getBoundingClientRect().width)))]);
  check('day columns and parts share one width', widths.length === 1, String(widths));
  check('the bridge names both places in full', await page.$eval('.bridge-route', e => [...e.querySelectorAll('.bridge-place')].every(p => p.scrollWidth <= p.clientWidth + 1) && e.textContent.includes('Tokyo') && e.textContent.includes('Kyoto')));
  check('place headings beside a bridge are not cut short', await page.$$eval('.agenda-day[data-by-bridge] .agenda-city h3', els => els.every(e => e.scrollWidth <= e.clientWidth + 1)));
  await shot(page, 'desktop-after');
  // Open the bridge: notes are readable, and Edit goes to the ordinary journey form.
  await page.click('.bridge-card[data-bridge]');
  check('the bridge opens a reading view with the notes', /Car 7, seats 3A to 3D/.test(await page.textContent('#travel-view')) && await page.$eval('#travel-view', d => d.open));
  await shot(page, 'desktop-bridge-open');
  await page.click('#travel-view [data-leg="tokyo-kyoto"]');
  check('Edit opens the existing journey form', await page.$eval('#leg-form', f => f.dataset.id === 'tokyo-kyoto' && f.elements.title.value === 'Hikari Sample 505') && !(await page.$eval('#travel-view', d => d.open)));
  await page.click('#structure-dialog [data-close="structure-dialog"]');

  // Drag and drop around the bridge.
  const box = sel => page.locator(sel).first().boundingBox();
  const drag = async (fromSel, to, during) => {
    await page.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'center', inline: 'nearest' }), fromSel);
    const a = await box(fromSel);
    await page.mouse.move(a.x + 40, a.y + 20); await page.mouse.down(); await page.mouse.move(a.x + 52, a.y + 32, { steps: 3 });
    const p = await to();
    await page.mouse.move(p.x, p.y, { steps: 14 }); await page.waitForTimeout(150); await page.mouse.move(p.x + 1, p.y + 1, { steps: 2 }); await page.waitForTimeout(150);
    if (during) await during();
    await page.mouse.up();
    await page.waitForTimeout(250);
  };
  const saved = () => page.waitForFunction(() => /Saved for everyone|Not moved/.test(document.querySelector('#message').textContent));
  const below = sel => async () => { const b = await box(sel); return { x: b.x + 60, y: b.y + b.height + 14 }; };
  const centre = sel => async () => { const b = await box(sel); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  // 1. Over the bridge nothing is a target, and letting go there moves nothing.
  const before = await revision(japan);
  await drag('.activity[data-detail="idea-onsen"]', centre('.bridge'), async () => {
    check('the bridge is not a drop target', await page.evaluate(() => !document.querySelector('.drop-target, .drop-marker')));
  });
  check('dropping on the bridge changes nothing', await revision(japan) === before && await partOf(page, 'idea-onsen') === 'not on a day');
  // 2. An unplaced idea dropped under the last card of the first part stays in that part.
  await drag('.activity[data-detail="idea-onsen"]', below('.agenda-day[data-part="before"][data-date="2027-05-05"] .activity[data-detail="tokyo-board"]'), async () => {
    check('the first part of the travel day is a drop target', await page.$eval('.agenda-day[data-part="before"][data-date="2027-05-05"]', e => e.classList.contains('drop-target')));
    await shot(page, 'desktop-dragging');
  });
  await saved();
  check('unplaced card dropped on the first part stays before the journey', await partOf(page, 'idea-onsen') === '05:before', await partOf(page, 'idea-onsen'));
  // 3. A Kyoto idea dropped on the first part is shown after the journey, and the message says why.
  await drag('.activity[data-detail="idea-tea"]', centre('.agenda-day[data-part="before"][data-date="2027-05-05"] .activity[data-detail="tokyo-board"]'));
  await saved();
  check('a card placed in Kyoto is shown after the journey', await partOf(page, 'idea-tea') === '05:after', await partOf(page, 'idea-tea'));
  check('and the message explains it', /shown after the journey/.test(await page.textContent('#message')), await page.textContent('#message'));
  // 4. The second part and the days either side take cards as usual.
  await drag('.activity[data-detail="tokyo-market"]', centre('.agenda-day[data-part="after"][data-date="2027-05-05"] .activity[data-detail="kyoto-arrive"]'));
  await saved();
  check('a Tokyo card dropped on the second part is shown before the journey', await partOf(page, 'tokyo-market') === '05:before', await partOf(page, 'tokyo-market'));
  await drag('.activity[data-detail="idea-okonomiyaki"]', centre('.agenda-day[data-date="2027-05-06"] .activity[data-detail="kyoto-dinner"]'));
  await saved();
  check('the day after the bridge takes a card', await partOf(page, 'idea-okonomiyaki') === '06:whole');
  await drag('.activity[data-detail="tokyo-market"]', centre('.agenda-day[data-date="2027-05-04"] .activity[data-detail="tokyo-lights"]'));
  await saved();
  check('the day before the bridge takes a card', await partOf(page, 'tokyo-market') === '04:whole');
  check('no dialog opened after dragging', await page.evaluate(() => !document.querySelector('dialog[open]')));

  // A move with no transport: the gap and a quiet bridge stay; the prompt starts the ordinary journey form.
  await api(japan, { action: 'leg-delete', legId: 'kyoto-osaka', revision: await revision(japan) });
  await show(page, japan, '2027-05-06');
  check('with no transport the bridge is still there', (await columns(page)).slice(6, 9).join(' ') === '07:before bridge 07:after' && /Not entered yet/.test(await page.textContent('.bridge-card.quiet')));
  await shot(page, 'desktop-no-transport');
  await page.click('.bridge-card.quiet');
  await page.click('#travel-view [data-bridge-add]');
  check('the prompt opens the journey form with the two places and the day filled in', await page.$eval('#leg-form', f => [f.elements.from.value, f.elements.to.value, f.elements.date.value].join(' ')) === 'kyoto osaka 2027-05-07');
  await page.click('#structure-dialog [data-close="structure-dialog"]');
  // Stay move with preview: push Osaka a day later through the real dialog. The bridge follows.
  await page.click('.lodging[data-stay-view="stay-osaka"]');
  await page.click('#stay-view [data-stay="stay-osaka"]');
  await page.fill('#stay-form [name="newStart"]', '2027-05-08');
  await page.click('#stay-move-preview');
  await page.waitForSelector('#stay-move-form');
  await shot(page, 'desktop-stay-move-preview');
  await page.click('#stay-move-form button.primary');
  await page.waitForFunction(() => !document.querySelector('#structure-dialog').open);
  await page.waitForTimeout(300);
  check('after the stay move the bridge sits between the 7th and the 8th', (await columns(page)).slice(-3).join(' ') === '07 bridge 08', (await columns(page)).join(' '));
  // "Show plans for" one family keeps the bridges of the stays that family is on.
  await page.selectOption('#filter', 'maple').catch(() => { });
  await page.waitForTimeout(300);
  check('person filter: bridges remain for a family on every stay', (await columns(page)).filter(c => c === 'bridge').length === 2);

  // A trip that stays in one place: no bridge, and still the grid.
  await show(page, single);
  check('single-stay trip: no bridge, no parts, grid layout', await page.evaluate(() => !document.querySelector('.bridge, [data-part], [data-by-bridge]') && getComputedStyle(document.querySelector('#itinerary')).display === 'grid'));
  await shot(page, 'single-stay-desktop-after');
  await page.context().close();

  // ---------- Phone, landscape: Ideas stay put, day columns and bridges scroll past ----------
  const fresh = async page => page.evaluate(async trip => (await (await fetch('/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trip }) })).json()).snapshot.trip.id, japanTripInput());
  const wide = await open({ width: 844, height: 390 }, true), wideTrip = await fresh(wide);
  await show(wide, wideTrip, '2027-05-05');
  const ideasLeft = await wide.$eval('.ideas', e => e.getBoundingClientRect().left);
  await shot(wide, 'phone-landscape-after');
  await wide.$eval('#itinerary', it => { it.scrollLeft += 500; });
  await wide.waitForTimeout(400);
  check('landscape: Ideas stay fixed while the bridge scrolls with the days', await wide.$eval('.ideas', e => e.getBoundingClientRect().left) === ideasLeft && await wide.$eval('#itinerary', e => getComputedStyle(e).display) === 'flex');
  check('landscape: no sideways page scroll', await wide.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await wide.context().close();

  // ---------- Phone, portrait: one day at a time, the bridge is a divider between the parts ----------
  const tall = await open({ width: 390, height: 844 }, true), tallTrip = await fresh(tall);
  await show(tall, tallTrip);
  const visible = () => tall.$$eval('#itinerary > *', els => els.filter(e => e.offsetParent).map(e => e.classList.contains('bridge') ? 'bridge' : `${e.dataset.date.slice(8)}${e.dataset.part ? ':' + e.dataset.part : ''}`).join(' '));
  check('portrait: a day with no move shows no bridge', await visible() === '03', await visible());
  await tall.click('.medallion[data-day="2027-05-05"]');
  await tall.waitForTimeout(300);
  check('portrait: the travel day shows its two parts with the bridge between', await visible() === '05:before bridge 05:after', await visible());
  check('portrait: no sideways page scroll', await tall.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await tall.$eval('#itinerary', e => window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 70));
  await tall.waitForTimeout(300);
  await shot(tall, 'phone-portrait-after');
  await tall.$eval('.bridge', e => window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 330));
  await tall.waitForTimeout(300);
  await shot(tall, 'phone-portrait-bridge');
  await tall.click('.bridge-card[data-bridge]');
  check('portrait: the bridge opens', await tall.$eval('#travel-view', d => d.open));
  await shot(tall, 'phone-portrait-bridge-open');
  await tall.context().close();
  await browser.close();
  console.log(failed ? `${failed} check(s) failed` : 'All bridge checks passed');
  process.exit(failed ? 1 : 0);
})();
