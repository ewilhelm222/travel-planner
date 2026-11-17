/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium, devices } = require('playwright');
// Browser check for pictures on cards at laptop, tablet and phone sizes, against a disposable local dev
// server with synthetic data. The pictures are drawn on a canvas here; nothing real is uploaded.
// Usage: node scripts/check-card-pictures-browser.cjs <screenshot-dir> [origin] [name-prefix]
// Requires the dev server (`npm run dev`) with PLANNER_CREATOR_EMAILS=seedy@sites.test in .dev.vars.
const O = process.argv[3] || 'http://127.0.0.1:5173', SHOTS = process.argv[2] || '.', PRE = process.argv[4] || 'after';
if (!['127.0.0.1', 'localhost'].includes(new URL(O).hostname)) throw new Error('Only run against disposable loopback data.');
const log = (...a) => console.log(...a);
let failures = 0;
const check = (ok, what) => { log(ok ? 'ok  ' : 'FAIL', what); if (!ok) failures++; };
// Cards given a picture; the rest of each day keeps none, so every day shows a mix. option-5 is the
// whole-group dinner, option-8 and option-11 become ideas (one with a picture, one without).
const WITH_PICTURE = ['option-2', 'option-4', 'option-5', 'option-6', 'option-8', 'option-9', 'option-10'];
const IDEAS = ['option-8', 'option-11'];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('PAGEERROR', e.message));
  await page.goto(O + '/signin-with-chatgpt?return_to=/');
  const created = await page.evaluate(async () => (await (await fetch('/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: 'thanksgiving' }) })).json()));
  const id = created.snapshot.trip.id; log('trip', id);
  const api = body => page.evaluate(async ([id, body]) => { const r = await fetch('/api/trip?id=' + id, { method: body ? 'PATCH' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json() }; }, [id, body]);
  const edit = async (activityId, patch) => { const c = await api(); const r = await api({ action: 'edit', revision: c.json.snapshot.revision, activityId, patch }); if (r.status !== 200) throw new Error(`edit ${activityId}: ${r.status} ${JSON.stringify(r.json)}`); };
  // Made-up pictures: a sky, a sun and hills in a different palette each time.
  const upload = n => page.evaluate(async ([id, n]) => {
    const c = Object.assign(document.createElement('canvas'), { width: 640, height: 480 }), g = c.getContext('2d'), hue = (n * 67) % 360;
    const sky = g.createLinearGradient(0, 0, 0, 480); sky.addColorStop(0, `hsl(${hue} 70% 30%)`); sky.addColorStop(1, `hsl(${(hue + 50) % 360} 85% 68%)`);
    g.fillStyle = sky; g.fillRect(0, 0, 640, 480);
    g.fillStyle = `hsl(${(hue + 180) % 360} 90% 78%)`; g.beginPath(); g.arc(150 + n * 50, 150, 56, 0, 7); g.fill();
    for (let k = 0; k < 3; k++) { g.fillStyle = `hsl(${(hue + 120 + k * 20) % 360} 45% ${22 + k * 9}%)`; g.beginPath(); g.moveTo(0, 480); for (let x = 0; x <= 640; x += 40) g.lineTo(x, 330 + k * 40 - 60 * Math.sin((x + n * 90 + k * 130) / 110)); g.lineTo(640, 480); g.fill(); }
    const r = await fetch('/api/image?id=' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: c.toDataURL('image/jpeg', .7) }) });
    if (!r.ok) throw new Error('picture upload ' + r.status);
    return (await r.json()).imageId;
  }, [id, n]);
  for (const [n, activityId] of WITH_PICTURE.entries()) await edit(activityId, { imageId: await upload(n) });
  for (const activityId of IDEAS) await edit(activityId, { date: null });
  await edit('option-3', { title: 'Cook together: pies, stuffing and the long-simmering cranberry sauce' });

  const loaded = p => p.waitForFunction(() => document.querySelector('.activity') && [...document.querySelectorAll('img.card-image')].every(i => getComputedStyle(i).display === 'none' || (i.complete && i.naturalWidth)), null, { timeout: 15000 });
  const open = async (p, opts = {}) => {
    await p.goto(O + '/?trip=' + id); await p.waitForSelector('.activity');
    if (opts.roomy) { await p.click('#density'); await p.waitForSelector('body:not(.dense) .activity, :not(.dense) > .activity'); }
    // The board is drawn again once the saved trip arrives, so let it settle before asking for every picture.
    await p.waitForLoadState('networkidle'); await p.waitForTimeout(300);
    await p.evaluate(() => { for (const i of document.querySelectorAll('img.card-image')) i.loading = 'eager'; });
    await loaded(p);
    await p.evaluate(() => (document.querySelector('.toolbar') || document.querySelector('#itinerary')).scrollIntoView());
  };
  // What a card looks like to the layout: is its picture shown, how big, and does it squeeze the title.
  const measure = (p, sel) => p.$$eval(sel, els => els.map(e => { const i = e.querySelector('.card-image'), s = e.querySelector('strong').getBoundingClientRect(), c = e.getBoundingClientRect(), r = i?.getBoundingClientRect(); return { id: e.dataset.detail, card: Math.round(c.width), title: Math.round(s.width), picture: i && getComputedStyle(i).display !== 'none' ? `${Math.round(r.width)}x${Math.round(r.height)}` : null, flush: !i || getComputedStyle(i).display === 'none' || (Math.abs(r.top - c.top) < 1 && Math.abs(r.left - c.left) < 1 && Math.abs(r.right - c.right) < 1), padRight: getComputedStyle(e).paddingRight }; }));
  const shot = async (p, name) => { await p.screenshot({ path: `${SHOTS}/${PRE}-${name}.png` }); log('shot', name); };

  // ---------- Laptop, week view (the default for a trip longer than four days) ----------
  await open(page);
  await shot(page, 'laptop-1440-week');
  const week = await measure(page, '#itinerary .activity[data-detail]'), ideas = await measure(page, '.ideas .activity[data-detail]');
  log('1440 week:', JSON.stringify(week)); log('1440 ideas:', JSON.stringify(ideas));
  check(week.filter(c => WITH_PICTURE.includes(c.id)).every(c => c.picture), 'week view at 1440: every card with a picture shows it');
  check(week.filter(c => !WITH_PICTURE.includes(c.id)).every(c => !c.picture && c.padRight === '12px'), 'week view at 1440: cards without a picture keep their padding and have no box');
  check(ideas.find(c => c.id === 'option-8')?.picture && !ideas.find(c => c.id === 'option-11')?.picture, 'ideas column at 1440: picture on the idea that has one only');
  check(week.concat(ideas).every(c => c.title >= 84), 'no title is squeezed below 84 px');
  check(week.concat(ideas).every(c => c.flush), 'every picture sits flush with the top and sides of its card');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways page scroll at 1440');

  // ---------- Dragging a card by its picture moves the card, with no browser image drag ----------
  await page.evaluate(() => { window.__nativeDrags = 0; document.addEventListener('dragstart', () => { window.__nativeDrags++; }, true); });
  const pic = await page.locator('.activity[data-detail="option-2"] .card-image').boundingBox(), to = await page.locator('.agenda-day[data-date="2026-11-28"] .activity[data-detail="option-10"]').boundingBox();
  if (pic && to) {
    await page.mouse.move(pic.x + pic.width / 2, pic.y + pic.height / 2); await page.mouse.down(); await page.mouse.move(pic.x + pic.width / 2 + 12, pic.y + pic.height / 2 + 12, { steps: 3 });
    await page.mouse.move(to.x + 60, to.y + to.height * .7, { steps: 12 }); await page.waitForTimeout(200); await page.mouse.move(to.x + 61, to.y + to.height * .7, { steps: 2 }); await page.waitForTimeout(150);
    check(await page.isVisible('.drop-dock'), 'picking a card up by its picture starts the card drag');
    await shot(page, 'laptop-1440-dragging-by-picture');
    await page.mouse.up();
    await page.waitForFunction(() => /Saved for everyone/.test(document.querySelector('#message')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
    check((await api()).json.snapshot.trip.activities.find(a => a.id === 'option-2').date === '2026-11-28', 'the card dragged by its picture landed on the new day');
    check(await page.evaluate(() => window.__nativeDrags) === 0, 'the browser never started an image drag');
    check(await page.evaluate(() => !document.querySelector('#activity-view')?.open && !document.querySelector('#editor')?.open), 'the drag did not open the activity');
    await edit('option-2', { date: '2026-11-26' });
  } else check(false, 'a picture to drag by was on screen');
  // A click on the picture still opens the read-only view, as anywhere else on the card.
  await open(page);
  if (await page.locator('.activity[data-detail="option-6"] .card-image').isVisible()) {
    await page.locator('.activity[data-detail="option-6"] .card-image').click();
    check(await page.evaluate(() => !!document.querySelector('#activity-view')?.open), 'clicking the picture opens the activity view');
    await page.keyboard.press('Escape');
  } else check(false, 'a picture to click was on screen');

  // ---------- A picture that fails to load leaves the plain card ----------
  await page.route('**/api/image?**', r => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await open(page);
  await page.waitForFunction(() => !document.querySelector('img.card-image'));
  const broken = await measure(page, '#itinerary .activity[data-detail], .ideas .activity[data-detail]');
  check(broken.every(c => !c.picture && c.padRight === '12px'), 'failed pictures: every card falls back to the plain layout');
  await shot(page, 'laptop-1440-pictures-failed');
  await page.unroute('**/api/image?**');

  // ---------- Laptop, roomy three-day view ----------
  await open(page, { roomy: true });
  await shot(page, 'laptop-1440-roomy');
  log('1440 roomy ideas:', JSON.stringify(await measure(page, '.ideas .activity[data-detail]')));
  await page.click('#density');

  // ---------- Narrowest desktop (week view starts at 1000 px) and below ----------
  for (const [w, h, name] of [[1000, 800, 'desktop-1000-week'], [1280, 800, 'laptop-1280-week'], [800, 1100, 'tablet-800-portrait'], [844, 390, 'phone-landscape-844']]) {
    await page.setViewportSize({ width: w, height: h });
    await open(page);
    await shot(page, name);
    const m = await measure(page, '#itinerary .activity[data-detail], .ideas .activity[data-detail]');
    log(name + ':', JSON.stringify(m));
    check(m.every(c => c.title >= 84), `${name}: no title is squeezed below 84 px`);
    check(m.every(c => c.flush), `${name}: every picture shown sits flush with its card`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no sideways page scroll`);
  }
  await ctx.close();

  // ---------- Phone portrait: unchanged ----------
  const phone = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block', storageState: await (async () => { const c = await browser.newContext(); const p = await c.newPage(); await p.goto(O + '/signin-with-chatgpt?return_to=/'); const s = await c.storageState(); await c.close(); return s; })() });
  const pp = await phone.newPage();
  await pp.goto(O + '/?trip=' + id); await pp.waitForSelector('.activity');
  await pp.evaluate(() => { for (const i of document.querySelectorAll('img.card-image')) i.loading = 'eager'; });
  await loaded(pp);
  await pp.click('.medallion[data-day="2026-11-26"]'); await pp.waitForSelector('.agenda-day[data-date="2026-11-26"][data-selected=true]');
  await pp.evaluate(() => { for (const i of document.querySelectorAll('img.card-image')) i.loading = 'eager'; });
  await loaded(pp);
  await pp.evaluate(() => document.querySelector('.agenda-day[data-date="2026-11-26"]')?.scrollIntoView());
  await shot(pp, 'phone-portrait-390');
  const pm = await measure(pp, '.agenda-day[data-date="2026-11-26"] .activity[data-detail]');
  log('phone:', JSON.stringify(pm));
  check(pm.filter(c => c.picture).every(c => c.picture === '60x60'), 'phone portrait: the 60 px thumbnail is unchanged');
  await phone.close();
  await browser.close();
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
