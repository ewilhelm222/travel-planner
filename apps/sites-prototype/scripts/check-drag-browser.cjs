const { chromium } = require('playwright');
// Browser check for drag-and-drop against a disposable local dev server with synthetic data.
// Usage: node scripts/check-drag-browser.cjs <screenshot-dir> [origin]
// Requires the dev server (`npm run dev`) with PLANNER_CREATOR_EMAILS=seedy@sites.test in .dev.vars.
const O = process.argv[3] || 'http://127.0.0.1:5173', SHOTS = process.argv[2] || '.';
if (!['127.0.0.1', 'localhost'].includes(new URL(O).hostname)) throw new Error('Only run against disposable loopback data.');
const log = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.launch();
  // ---------- Desktop ----------
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1300 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('PAGEERROR', e.message));
  await page.goto(O + '/signin-with-chatgpt?return_to=/');
  const created = await page.evaluate(async () => (await (await fetch('/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: 'thanksgiving' }) })).json()));
  const id = created.snapshot.trip.id; log('trip', id);
  const api = (body) => page.evaluate(async ([id, body]) => { const r = await fetch('/api/trip?id=' + id, { method: body ? 'PATCH' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json() }; }, [id, body]);
  await page.goto(O + '/?trip=' + id);
  await page.waitForSelector('#itinerary.can-drag .activity');
  const toBoard = () => page.evaluate(() => { document.querySelector('.toolbar').scrollIntoView(); });

  log('hint:', await page.textContent('#drag-hint'));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: SHOTS + '/desktop-0-top.png' });
  await toBoard();
  await page.screenshot({ path: SHOTS + '/desktop-1-before.png' });
  const box = async sel => (await page.locator(sel).first().boundingBox());
  const drag = async (fromSel, toSel, dy = 10, shot) => {
    await page.evaluate(sel => { const it = document.querySelector('#itinerary'); it.scrollTop = 0; document.querySelector('.toolbar').scrollIntoView(); const el = document.querySelector(sel), r = el.getBoundingClientRect(), b = it.getBoundingClientRect(); if (r.left < b.left || r.right > b.right) it.scrollLeft += r.left - b.left - 20; if (r.top + 80 > innerHeight - 140) el.scrollIntoView({ block: 'center' }); }, fromSel);
    const a = await box(fromSel);
    await page.mouse.move(a.x + 60, a.y + 30); await page.mouse.down(); await page.mouse.move(a.x + 70, a.y + 40, { steps: 3 });
    const b = await box(toSel);
    const frac = dy < 1 ? dy : null;
    await page.mouse.move(b.x + 60, b.y + (frac ? b.height * frac : dy), { steps: 12 });
    for (let k = 0; k < 2; k++) { await page.waitForTimeout(80); const c = await box(toSel); await page.mouse.move(c.x + 60, c.y + (frac ? c.height * frac : dy), { steps: 2 }); }
    await page.waitForTimeout(120);
    if (process.env.DBG) log('DBG', JSON.stringify(b), await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el?.tagName + '.' + el?.className + ' scrollY=' + scrollY + ' boardTop=' + document.querySelector('#itinerary').scrollTop; }, [b.x + 60, b.y + dy]));
    if (shot) await shot();
    await page.mouse.up();
  };
  const dayCards = async date => page.$$eval(`.agenda-day[data-date="${date}"] .activity[data-detail]`, els => els.map(e => e.querySelector('strong').textContent));
  log('Nov 26 before:', await dayCards('2026-11-26'));
  log('Nov 27 before:', await dayCards('2026-11-27'));
  // Drag "Neighborhood walk" (Nov 26) between the 1st and 2nd cards of Nov 27.
  await drag('.activity[data-detail="option-2"]', '.agenda-day[data-date="2026-11-27"] .activity[data-detail="option-6"]', 0.65, async () => {
    log('mid-drag: dock?', await page.isVisible('.drop-dock'), 'target?', await page.$eval('.agenda-day[data-date="2026-11-27"]', e => e.className), 'marker?', !!(await page.$('.drop-marker')));
    log('dock text:', await page.textContent('.drop-dock p'));
    await page.screenshot({ path: SHOTS + '/desktop-2-dragging.png' });
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: SHOTS + '/desktop-3-after-drop.png' });
  await page.waitForFunction(() => /Saved for everyone/.test(document.querySelector('#message').textContent));
  log('message:', await page.textContent('#message'));
  log('Nov 26 after:', await dayCards('2026-11-26'));
  log('Nov 27 after:', await dayCards('2026-11-27'));
  log('editor opened after drag?', await page.evaluate(() => document.querySelector('#editor').open));
  const server = await api();
  log('server rev', server.json.snapshot.revision, 'walk date', server.json.snapshot.trip.activities.find(a => a.id === 'option-2').date, 'copies', server.json.snapshot.trip.activities.filter(a => a.id === 'option-2').length);
  // Click still opens editor
  await page.click('.activity[data-detail="option-3"]');
  log('click opens editor:', await page.evaluate(() => document.querySelector('#editor').open));
  await page.click('#close-editor');
  await toBoard();
  // Reorder within Nov 26: drag "Thanksgiving dinner" (option-5) to the top of the day.
  await drag('.activity[data-detail="option-4"]', '.agenda-day[data-date="2026-11-26"] .activity[data-detail]', 8);
  await page.waitForFunction(() => /Reordered/.test(document.querySelector('#message').textContent));
  log('reorder msg:', await page.textContent('#message'));
  log('Nov 26 after reorder:', await dayCards('2026-11-26'));
  // Filter + shared message: filter to Maple, then keyboard move Shift+ArrowRight.
  await page.selectOption('#family', 'maple');
  await page.focus('.activity[data-detail="option-3"]');
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForFunction(() => /Saved for everyone/.test(document.querySelector('#message').textContent));
  log('keyboard msg:', await page.textContent('#message'));
  log('focused after keyboard:', await page.evaluate(() => document.activeElement?.dataset?.detail));
  await page.selectOption('#family', 'all');
  // Drag to ideas (unschedule).
  await toBoard();
  await page.evaluate(() => document.querySelector('.activity[data-detail="option-1"]').scrollIntoView({ block: 'center', inline: 'nearest' }));
  const s9 = await box('.activity[data-detail="option-1"]');
  await page.mouse.move(s9.x + 40, s9.y + 40); await page.mouse.down(); await page.mouse.move(s9.x + 50, s9.y + 60);
  await page.evaluate(() => document.querySelector('.ideas').scrollIntoView({ block: 'center' }));
  await page.mouse.move(s9.x + 55, s9.y + 65);
  const ideas = await box('.ideas');
  await page.mouse.move(ideas.x + 200, ideas.y + 30, { steps: 8 });
  await page.screenshot({ path: SHOTS + '/desktop-4-to-ideas.png' });
  await page.mouse.up();
  await page.waitForFunction(() => /to Unscheduled ideas.*Saved/.test(document.querySelector('#message').textContent));
  log('ideas msg:', await page.textContent('#message'), '| ideas:', await page.$$eval('.idea-cards .activity strong', e => e.map(x => x.textContent)));
  // Fixed booking: make dinner fixed via API, reload, drag to another day.
  let cur = await api();
  await api({ action: 'edit', revision: cur.json.snapshot.revision, activityId: 'option-5', patch: { fixed: true } });
  await page.click('#refresh'); await page.waitForTimeout(800);
  await toBoard();
  await drag('.activity[data-detail="option-5"]', '.agenda-day[data-date="2026-11-28"] .activity[data-detail]', 20, async () => {
    log('fixed hover class:', await page.$eval('.agenda-day[data-date="2026-11-28"]', e => e.className), '| dock:', await page.textContent('.drop-dock p'));
    await page.screenshot({ path: SHOTS + '/desktop-5-fixed-blocked.png' });
  });
  await page.waitForTimeout(150);
  log('fixed msg:', await page.textContent('#message'));
  cur = await api(); log('fixed date on server:', cur.json.snapshot.trip.activities.find(a => a.id === 'option-5').date);
  // Conflict: someone else saves meanwhile; the page's revision is stale.
  await api({ action: 'edit', revision: cur.json.snapshot.revision, activityId: 'option-1', patch: { notes: 'Edited elsewhere (synthetic)' } });
  let patchSeen = null; await toBoard();
  page.on('response', r => { if (r.request().method() === 'PATCH') patchSeen = r.status(); });
  await drag('.activity[data-detail="option-10"]', '.agenda-day[data-date="2026-11-26"] .activity[data-detail]', 10);
  await page.waitForTimeout(1500); log('after conflict drag msg:', await page.textContent('#message'), 'PATCH', patchSeen);
  await page.waitForFunction(() => /Not moved/.test(document.querySelector('#message').textContent), null, { timeout: 8000 });
  log('PATCH status', patchSeen, '| conflict msg:', await page.textContent('#message'));
  log('option-10 back on', await page.$eval('.activity[data-detail="option-10"]', e => e.closest('.agenda-day').dataset.date));
  await page.screenshot({ path: SHOTS + '/desktop-6-conflict.png' });
  cur = await api(); log('server option-10 date', cur.json.snapshot.trip.activities.find(a => a.id === 'option-10').date, 'note kept', cur.json.snapshot.trip.activities.find(a => a.id === 'option-1').notes);
  // Escape cancels.
  await toBoard();
  await page.evaluate(() => document.querySelector('.activity[data-detail="option-11"]').scrollIntoView({ block: 'center', inline: 'nearest' }));
  const e1 = await box('.activity[data-detail="option-11"]');
  await page.mouse.move(e1.x + 40, e1.y + 40); await page.mouse.down(); await page.mouse.move(e1.x - 200, e1.y + 40, { steps: 6 });
  await page.keyboard.press('Escape'); await page.mouse.up();
  log('after escape dock gone?', !(await page.$('.drop-dock')), 'option-11 day', await page.$eval('.activity[data-detail="option-11"]', e => e.closest('.agenda-day').dataset.date));

  // ---------- Guest view ----------
  const share = await page.evaluate(async ([id, rev]) => (await (await fetch('/api/share?id=' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rotate', revision: rev }) })).json()), [id, cur.json.snapshot.revision]);
  const gctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const g = await gctx.newPage();
  await g.goto(O + new URL(share.url).pathname + new URL(share.url).hash);
  await g.waitForSelector('#day'); await g.selectOption('#day', '2026-11-27'); await g.waitForSelector('.agenda-day[data-selected="true"] .activity');
  log('guest can-drag elements:', await g.$$eval('.can-drag', e => e.length), 'hint:', await g.$$eval('#drag-hint', e => e.length));
  const gc = await g.locator('.agenda-day[data-selected="true"] .activity').first().boundingBox();
  const gcdp = await gctx.newCDPSession(g);
  await gcdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gc.x + 40, y: gc.y + 30 }] });
  await g.waitForTimeout(700);
  await gcdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: gc.x + 40, y: gc.y + 90 }] });
  log('guest long-press dock?', !!(await g.$('.drop-dock')));
  await gcdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await gctx.close();

  // ---------- Phone ----------
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await pctx.addCookies(await ctx.cookies());
  const p = await pctx.newPage();
  p.on('pageerror', e => log('PAGEERROR', e.message));
  await p.goto(O + '/?trip=' + id);
  await p.waitForSelector('#itinerary.can-drag .activity', { state: 'attached' });
  await p.selectOption('#day', '2026-11-26'); await p.waitForTimeout(200);
  log('phone hint:', await p.textContent('#drag-hint'));
  const cdp = await pctx.newCDPSession(p);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await p.locator('.agenda-day[data-selected="true"]').scrollIntoViewIfNeeded();
  await p.evaluate(() => window.scrollBy(0, -120));
  await p.screenshot({ path: SHOTS + '/phone-1-before.png' });
  // Quick swipe scrolls, no pickup.
  let first = await p.locator('.agenda-day[data-selected="true"] .activity').first().boundingBox();
  const y0 = await p.evaluate(() => scrollY);
  await touch('touchStart', first.x + 40, first.y + 60);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', first.x + 40, first.y + 60 - i * 25); await p.waitForTimeout(16); }
  await touch('touchEnd');
  await p.waitForTimeout(400);
  log('swipe: scrolled by', (await p.evaluate(() => scrollY)) - y0, 'dock?', !!(await p.$('.drop-dock')), 'editor?', await p.evaluate(() => document.querySelector('#editor').open));
  // Tap opens editor.
  first = await p.locator('.agenda-day[data-selected="true"] .activity').first().boundingBox();
  await p.touchscreen.tap(first.x + 40, first.y + 30);
  await p.waitForTimeout(200);
  log('tap opens editor:', await p.evaluate(() => document.querySelector('#editor').open));
  await p.click('#close-editor');
  // Long-press, drag to dock chip for Nov 28, hover (switches day), then drop on a card position.
  const cardSel = '.agenda-day[data-selected="true"] .activity[data-detail="option-4"]';
  await p.locator(cardSel).scrollIntoViewIfNeeded();
  const lp = await p.locator(cardSel).boundingBox();
  await touch('touchStart', lp.x + 60, lp.y + 40);
  await p.waitForTimeout(600);
  await touch('touchMove', lp.x + 62, lp.y + 45);
  log('picked up:', !!(await p.$('.drop-dock')), 'dock:', await p.textContent('.drop-dock p'));
  const chip = await p.locator('.drop-dock li[data-drop-date="2026-11-28"]').boundingBox();
  for (let i = 1; i <= 10; i++) { await touch('touchMove', lp.x + 62 + (chip.x + chip.width / 2 - lp.x - 62) * i / 10, lp.y + 45 + (chip.y + chip.height / 2 - lp.y - 45) * i / 10); await p.waitForTimeout(16); }
  await p.waitForTimeout(150);
  await p.screenshot({ path: SHOTS + '/phone-2-hover-day-chip.png' });
  await p.waitForTimeout(600);
  log('visible day after dwell:', await p.$eval('.agenda-day[data-selected="true"]', e => e.dataset.date), 'select:', await p.$eval('#day', e => e.value));
  // Move up into the Nov 28 day's first card to place it on top.
  const target = await p.locator('.agenda-day[data-date="2026-11-28"] .activity[data-detail]').first().boundingBox();
  log('target card visible at y', Math.round(target.y));
  const ty = Math.max(target.y + 10, 80);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', chip.x + chip.width / 2 + (target.x + 80 - chip.x - chip.width / 2) * i / 10, chip.y + (ty - chip.y) * i / 10); await p.waitForTimeout(16); }
  await p.waitForTimeout(800);
  await p.screenshot({ path: SHOTS + '/phone-3-placing.png' });
  await touch('touchEnd');
  await p.waitForFunction(() => /Saved for everyone/.test(document.querySelector('#message').textContent));
  log('phone msg:', await p.textContent('#message'));
  log('Nov 28 now:', await p.$$eval('.agenda-day[data-date="2026-11-28"] .activity strong', e => e.map(x => x.textContent)));
  log('editor opened by drop?', await p.evaluate(() => document.querySelector('#editor').open));
  await p.locator('#message').scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -60));
  await p.screenshot({ path: SHOTS + '/phone-4-after.png' });
  log('h-overflow:', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
