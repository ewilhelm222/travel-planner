/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
// Browser check for the read-only activity view, against a disposable local dev server with synthetic data.
// Usage: node scripts/check-activity-view-browser.cjs <screenshot-dir> [origin]
// Requires the dev server (`npm run dev`) with PLANNER_CREATOR_EMAILS=seedy@sites.test in .dev.vars.
// Exits non-zero if any check fails.
const O = process.argv[3] || 'http://127.0.0.1:5173', SHOTS = process.argv[2] || '.';
if (!['127.0.0.1', 'localhost'].includes(new URL(O).hostname)) throw new Error('Only run against disposable loopback data.');
let failed = 0;
const check = (name, ok, extra = '') => { if (!ok) failed++; console.log(ok ? 'ok   ' : 'FAIL ', name, extra); };
const STORY = 'Bring a blanket and a mug. The fire is lit at dusk and the first story starts when the marshmallows run out.\n\nThis year: the lighthouse keeper who answers the fog horn, the canoe that comes back on its own, and whatever the youngest storyteller invents on the spot. Stories get gentler as the night goes on, so nobody has to walk back alone in the dark.\n\nQuiet hours start at ten. Whoever tells the last story puts the fire out.';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', e => check('no script error (desktop): ' + e.message, false));
  await page.goto(O + '/signin-with-chatgpt?return_to=/');
  const created = await page.evaluate(async () => (await (await fetch('/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: 'thanksgiving' }) })).json()));
  const id = created.snapshot.trip.id;
  const api = body => page.evaluate(async ([id, body]) => { const r = await fetch('/api/trip?id=' + id, { method: body ? 'PATCH' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json() }; }, [id, body]);
  const send = async body => { const cur = await api(); const r = await api({ ...body, revision: cur.json.snapshot.revision }); if (r.status !== 200) throw new Error(JSON.stringify(r.json)); return r; };
  // Entered (not example) plans, so the guest page shows them too. All invented.
  await send({ action: 'place-edit', placeId: 'home', patch: { name: 'Lakeside camp (made up)', address: '1 Example Shore Road', appleMapsUrl: 'https://maps.apple.com/?q=Example+Shore+Road', navReviewed: true } });
  const everyone = (await api()).json.snapshot.trip.activities.find(a => a.id === 'option-5').participants;
  await send({ action: 'add', activity: { id: 'campfire', title: 'Campfire & ghost stories', date: '2026-11-26', time: 'Night', placeId: 'home', order: 0, participants: everyone, notes: 'Check the firewood on Wednesday (invented note).', guestNotes: STORY, guestLocation: 'Fire pit', links: [{ label: 'Fire safety sheet', url: 'https://example.com/fire' }], fixed: false, optional: true, sourceKind: 'entered' } });
  await send({ action: 'add', activity: { id: 'idea-view', title: 'Board game afternoon', date: null, time: '', placeId: 'home', order: 0, participants: everyone, notes: '', guestNotes: 'Bring a favourite game.', guestLocation: '', fixed: false, optional: true, sourceKind: 'entered' } });
  await page.goto(O + '/?trip=' + id);
  await page.waitForSelector('#itinerary.can-drag .activity');
  const open = (p, sel) => p.evaluate(sel => !!document.querySelector(sel)?.open, sel);
  const viewOpen = (p = page) => open(p, '#activity-view'), editorOpen = (p = page) => open(p, '#editor');
  const card = '#itinerary .activity[data-detail="campfire"]';
  const show = sel => page.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'center', inline: 'center' }), sel);

  // ---------- Desktop, mouse and keyboard ----------
  await show(card);
  await page.click(card);
  check('click opens the view, not the editor', await viewOpen() && !(await editorOpen()));
  check('the view shows the whole description', (await page.textContent('#activity-view .view-notes')).includes('puts the fire out'));
  check('focus moved into the view', await page.evaluate(() => document.querySelector('#activity-view').contains(document.activeElement)));
  check('place, address and reviewed map link shown', await page.$eval('#activity-view .view-where', e => e.textContent.includes('Fire pit') && e.textContent.includes('1 Example Shore Road') && !!e.querySelector('a.map-link[href^="https://maps.apple.com/"]')));
  check('no delete in the view', await page.$$eval('#activity-view button', b => !b.some(x => /delete/i.test(x.textContent))));
  await page.screenshot({ path: SHOTS + '/desktop-editor.jpg', quality: 82 });
  await page.keyboard.press('Escape');
  check('Escape closes the view', !(await viewOpen()));
  check('focus returns to the card', await page.evaluate(() => document.activeElement?.dataset?.detail === 'campfire'));
  await page.keyboard.press('Enter');
  check('Enter opens the view', await viewOpen() && !(await editorOpen()));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Space');
  check('Space opens the view', await viewOpen());
  await page.mouse.click(8, 8);
  check('backdrop click closes the view', !(await viewOpen()));
  // Edit, cancel, save.
  await page.click(card);
  await page.click('#activity-view [data-edit-activity]');
  check('Edit opens the editor for the same activity', await editorOpen() && !(await viewOpen()) && await page.$eval('#edit-form', f => f.dataset.id === 'campfire' && f.elements.title.value === 'Campfire & ghost stories'));
  check('the editor shows the whole description without clipping', await page.$eval('#edit-form [name=guestNotes]', t => t.scrollHeight <= t.clientHeight + 2));
  await page.screenshot({ path: SHOTS + '/desktop-editor-form.jpg', quality: 82 });
  await page.keyboard.press('Escape');
  // The view comes back on the editor's close event, which the browser delivers just after the key press.
  await page.waitForFunction(() => document.querySelector('#activity-view').open, null, { timeout: 2000 }).catch(() => { });
  check('cancelling the editor returns to the view', await viewOpen() && !(await editorOpen()));
  await page.click('#activity-view [data-edit-activity]');
  await page.fill('#edit-form [name=title]', 'Campfire, cocoa & ghost stories');
  await page.click('#save');
  await page.waitForFunction(() => /Saved for everyone/.test(document.querySelector('#message').textContent));
  check('saving returns to the view with the saved values', await viewOpen() && !(await editorOpen()) && (await page.textContent('#activity-view-title')) === 'Campfire, cocoa & ghost stories');
  await page.click('#activity-view .dialog-actions [data-close]');
  check('Close closes the view; schedule shows the saved title', !(await viewOpen()) && (await page.textContent(card + ' strong')) === 'Campfire, cocoa & ghost stories');
  // Add activity still goes straight to the editor and back to the schedule.
  await page.click('#add');
  check('Add activity opens the editor directly', await editorOpen() && !(await viewOpen()));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  check('cancelling a new activity returns to the schedule', !(await viewOpen()) && !(await editorOpen()));
  // Ideas column.
  await page.click('.idea-cards .activity[data-detail="idea-view"]');
  check('an idea opens the view', await viewOpen() && !(await editorOpen()) && (await page.textContent('#activity-view .view-when')).includes('no day yet'));
  await page.keyboard.press('Escape');
  // A mouse drag moves the card and opens nothing.
  await show(card);
  const from = await page.locator(card).boundingBox(), to = await page.locator('.agenda-day[data-date="2026-11-27"] .activity[data-detail]').first().boundingBox();
  await page.mouse.move(from.x + 60, from.y + 30); await page.mouse.down(); await page.mouse.move(from.x + 75, from.y + 45, { steps: 3 });
  await page.mouse.move(to.x + 60, to.y + 10, { steps: 12 }); await page.waitForTimeout(150);
  check('dragging shows the drop bar', await page.isVisible('.drop-dock'));
  await page.mouse.up();
  await page.waitForFunction(() => /Saved for everyone/.test(document.querySelector('#message').textContent));
  await page.waitForTimeout(300);
  check('a finished mouse drag moved the card and opened neither view nor editor', !(await viewOpen()) && !(await editorOpen()) && await page.$eval(card, e => e.closest('.agenda-day').dataset.date === '2026-11-27'));
  // A drag dropped back on its own card still opens nothing.
  await show(card);
  const self = await page.locator(card).boundingBox();
  await page.mouse.move(self.x + 60, self.y + 30); await page.mouse.down(); await page.mouse.move(self.x + 90, self.y + 60, { steps: 4 }); await page.mouse.move(self.x + 62, self.y + 32, { steps: 4 }); await page.mouse.up();
  await page.waitForTimeout(300);
  check('a drag released over its own card opens nothing', !(await viewOpen()) && !(await editorOpen()));
  // The guest preview inside the share dialog shows the guests' view, without Edit.
  await page.click('#manage-menu summary'); await page.click('#share');
  await page.waitForSelector('#share-dialog[open]');

  // ---------- Guest link (read-only) ----------
  const cur = await api();
  const share = await page.evaluate(async ([id, rev]) => (await (await fetch('/api/share?id=' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rotate', revision: rev }) })).json()), [id, cur.json.snapshot.revision]);
  const guestUrl = O + new URL(share.url).pathname + new URL(share.url).hash;
  await page.keyboard.press('Escape');
  await page.click('#manage-menu summary'); await page.click('#share');
  await page.waitForSelector('#share-dialog[open] summary');
  await page.click('#share-dialog summary');
  await page.click('#share-dialog .guest-preview .activity[data-detail="campfire"]');
  check('guest preview opens the guests\' view with no Edit', await viewOpen() && !(await page.$('#activity-view [data-edit-activity]')) && !(await page.textContent('#activity-view')).includes('invented note'));
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');

  const guestCheck = async (name, viewport, extra = {}) => {
    const gctx = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block', ...extra });
    const g = await gctx.newPage();
    g.on('pageerror', e => check(`no script error (guest ${name}): ` + e.message, false));
    await g.goto(guestUrl);
    await g.waitForSelector('#day');
    if (await g.isVisible('#day')) await g.selectOption('#day', '2026-11-27');
    const gc = '#itinerary .agenda-day[data-date="2026-11-27"] .activity[data-detail="campfire"]';
    await g.waitForSelector(gc);
    await g.locator(gc).scrollIntoViewIfNeeded();
    if (extra.hasTouch) await g.tap(gc); else await g.click(gc);
    check(`guest ${name}: tap opens the view`, await viewOpen(g));
    check(`guest ${name}: no Edit control, no editor on the page`, !(await g.$('#activity-view [data-edit-activity]')) && !(await g.$('#editor')) && await g.$$eval('#activity-view button', b => b.every(x => !/edit|delete/i.test(x.textContent + (x.getAttribute('aria-label') || '')))));
    check(`guest ${name}: private fields absent`, await g.$eval('#activity-view', e => !/invented note|Example Shore|Fire safety/.test(e.textContent)));
    check(`guest ${name}: no sideways overflow`, await g.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await g.waitForTimeout(250);
    await g.screenshot({ path: `${SHOTS}/${name}-guest.jpg`, quality: 82 });
    await g.keyboard.press('Escape');
    check(`guest ${name}: Escape closes, focus back on the card`, !(await viewOpen(g)) && await g.evaluate(() => document.activeElement?.dataset?.detail === 'campfire'));
    await gctx.close();
  };
  await guestCheck('desktop', { width: 1440, height: 900 });
  await guestCheck('phone-portrait', { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  await guestCheck('phone-landscape', { width: 844, height: 390 }, { hasTouch: true, isMobile: true });
  // A guest cannot save even by calling the API: the server decides, not the missing button.
  const anon = await browser.newContext({ serviceWorkers: 'block' });
  const denied = await (await anon.newPage()).request.fetch(O + '/api/trip?id=' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Share ' + new URL(share.url).hash.slice(1) }, data: JSON.stringify({ action: 'edit', activityId: 'campfire', patch: { title: 'Changed by a guest' } }), maxRedirects: 0 });
  check('server refuses a save without a signed-in editor', denied.status() !== 200 && (await api()).json.snapshot.trip.activities.find(a => a.id === 'campfire').title === 'Campfire, cocoa & ghost stories', `(status ${denied.status()})`);
  await anon.close();

  // ---------- Phone, touch ----------
  const phone = async (name, viewport) => {
    const pctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
    await pctx.addCookies(await ctx.cookies());
    const p = await pctx.newPage();
    p.on('pageerror', e => check(`no script error (${name}): ` + e.message, false));
    await p.goto(O + '/?trip=' + id);
    await p.waitForSelector('#itinerary.can-drag .activity', { state: 'attached' });
    if (await p.isVisible('#day')) { await p.selectOption('#day', '2026-11-27'); await p.waitForTimeout(200); }
    const cdp = await pctx.newCDPSession(p);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const pc = '#itinerary .agenda-day[data-date="2026-11-27"] .activity[data-detail="campfire"]';
    const center = async () => { await p.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'center', inline: 'center' }), pc); await p.waitForTimeout(100); return p.locator(pc).boundingBox(); };
    let b = await center();
    await p.touchscreen.tap(b.x + 60, b.y + 30);
    await p.waitForTimeout(350);
    check(`${name}: tap opens the view, not the editor`, await viewOpen(p) && !(await editorOpen(p)));
    check(`${name}: Edit is offered to an editor`, await p.isVisible('#activity-view [data-edit-activity]'));
    const box = await p.locator('#activity-view').boundingBox();
    check(`${name}: the view fits the screen and the Edit button is on screen`, box.y >= 0 && box.y + box.height <= viewport.height + 1 && await p.$eval('#activity-view [data-edit-activity]', e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
    check(`${name}: long notes scroll inside the view`, await p.$eval('#activity-view .view-body', e => getComputedStyle(e).overflowY === 'auto' && e.scrollHeight >= e.clientHeight));
    check(`${name}: no sideways overflow`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await p.screenshot({ path: `${SHOTS}/${name}-editor.jpg`, quality: 82 });
    if (viewport.width < 560) {
      check(`${name}: laid out as a bottom sheet`, Math.abs(box.y + box.height - viewport.height) < 2 && box.y > 40 && box.width === viewport.width);
      // A short downward nudge springs back; a real swipe down closes.
      const t = await p.locator('#activity-view-title').boundingBox();
      await touch('touchStart', t.x + 40, t.y + 10); for (let i = 1; i <= 3; i++) await touch('touchMove', t.x + 40, t.y + 10 + i * 10); await touch('touchEnd');
      await p.waitForTimeout(200);
      check(`${name}: a small pull does not close`, await viewOpen(p));
      await touch('touchStart', t.x + 40, t.y + 10); for (let i = 1; i <= 8; i++) { await touch('touchMove', t.x + 40, t.y + 10 + i * 25); await p.waitForTimeout(16); } await touch('touchEnd');
      await p.waitForTimeout(200);
      check(`${name}: swipe down closes the sheet`, !(await viewOpen(p)));
      b = await center();
      await p.touchscreen.tap(b.x + 60, b.y + 30); await p.waitForTimeout(350);
      // Scrolling the notes back up from the middle must not close the sheet.
      const scrollable = await p.$eval('#activity-view .view-body', e => { e.scrollTop = 60; return e.scrollTop > 0; });
      if (scrollable) {
        const nb = await p.locator('#activity-view .view-body').boundingBox();
        await touch('touchStart', nb.x + 40, nb.y + 20); for (let i = 1; i <= 8; i++) { await touch('touchMove', nb.x + 40, nb.y + 20 + i * 4); await p.waitForTimeout(16); } await touch('touchEnd');
        await p.waitForTimeout(200);
        check(`${name}: pulling inside scrolled notes does not close`, await viewOpen(p));
      }
      await p.touchscreen.tap(viewport.width / 2, 20);
      await p.waitForTimeout(200);
      check(`${name}: backdrop tap closes the sheet`, !(await viewOpen(p)));
    } else {
      await p.keyboard.press('Escape');
    }
    // Edit from the view on a phone, then cancel: back in the view.
    b = await center();
    await p.touchscreen.tap(b.x + 60, b.y + 30); await p.waitForTimeout(350);
    await p.tap('#activity-view [data-edit-activity]');
    check(`${name}: Edit opens the editor`, await editorOpen(p) && !(await viewOpen(p)));
    await p.tap('#close-editor'); await p.waitForTimeout(200);
    check(`${name}: closing the editor returns to the view`, await viewOpen(p) && !(await editorOpen(p)));
    await p.keyboard.press('Escape'); await p.waitForTimeout(100);
    // A quick swipe over a card scrolls and opens nothing.
    b = await center();
    await touch('touchStart', b.x + 60, b.y + 30); for (let i = 1; i <= 6; i++) { await touch('touchMove', b.x + 60, b.y + 30 - i * 12); await p.waitForTimeout(16); } await touch('touchEnd');
    await p.waitForTimeout(350);
    check(`${name}: a swipe over a card opens nothing`, !(await viewOpen(p)) && !(await editorOpen(p)) && !(await p.$('.drop-dock')));
    // Long-press and let go without moving: picked up, put down, nothing opened.
    b = await center();
    await touch('touchStart', b.x + 60, b.y + 30); await p.waitForTimeout(600);
    check(`${name}: long-press picks the card up`, !!(await p.$('.drop-dock')));
    await touch('touchEnd'); await p.waitForTimeout(450);
    check(`${name}: releasing a long-press opens nothing`, !(await viewOpen(p)) && !(await editorOpen(p)) && !(await p.$('.drop-dock')));
    // Long-press, drag to another day chip, drop: the card moves and nothing opens.
    b = await center();
    await touch('touchStart', b.x + 60, b.y + 30); await p.waitForTimeout(600); await touch('touchMove', b.x + 62, b.y + 34);
    const chip = await p.locator('.drop-dock li[data-drop-date="2026-11-28"]').boundingBox();
    for (let i = 1; i <= 10; i++) { await touch('touchMove', b.x + 62 + (chip.x + chip.width / 2 - b.x - 62) * i / 10, b.y + 34 + (chip.y + chip.height / 2 - b.y - 34) * i / 10); await p.waitForTimeout(16); }
    await p.waitForTimeout(120);
    await touch('touchEnd');
    await p.waitForFunction(() => /Saved for everyone/.test(document.querySelector('#message').textContent));
    await p.waitForTimeout(450);
    check(`${name}: a finished touch drag moved the card and opened neither view nor editor`, !(await viewOpen(p)) && !(await editorOpen(p)) && (await api()).json.snapshot.trip.activities.find(a => a.id === 'campfire').date === '2026-11-28');
    await send({ action: 'move', activityId: 'campfire', date: '2026-11-27', beforeId: null });
    await pctx.close();
  };
  await phone('phone-portrait', { width: 390, height: 844 });
  await phone('phone-landscape', { width: 844, height: 390 });
  await browser.close();
  console.log(failed ? `${failed} check(s) FAILED` : 'All activity view checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
