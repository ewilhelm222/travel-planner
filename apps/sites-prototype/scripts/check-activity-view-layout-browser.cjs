/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
// Browser check for the layout and scrolling of the read-only activity view and the editor at short and
// phone-sized windows, against a disposable local dev server with synthetic data.
// Usage: node scripts/check-activity-view-layout-browser.cjs <screenshot-dir> [origin]
// Requires the dev server (`npm run dev`) with PLANNER_CREATOR_EMAILS=seedy@sites.test in .dev.vars.
// Exits non-zero if any check fails. Chromium only: Safari's moving toolbars are stood in for by the
// smaller window they leave (390 × 664 upright, 844 × 340 sideways).
const O = process.argv[3] || 'http://127.0.0.1:5173', SHOTS = process.argv[2] || '.';
if (!['127.0.0.1', 'localhost'].includes(new URL(O).hostname)) throw new Error('Only run against disposable loopback data.');
let failed = 0;
const check = (name, ok, extra = '') => { if (!ok) failed++; console.log(ok ? 'ok   ' : 'FAIL ', name, extra); };
const PITCH = 'Come watch the van get stuck in the mud.';
const LONG = `${PITCH}\n\nWear boots you do not love. We park at the top of the track, walk the last stretch, and cheer from the bank while the tide goes out. Bring a flask; the kiosk is shut in winter.\n\nIf the van really does get stuck, everybody pushes. Dry socks are in the blue bag.`;
const SIZES = [
  { name: 'desktop-1280x600', viewport: { width: 1280, height: 600 } },
  { name: 'desktop-1440x900', viewport: { width: 1440, height: 900 } },
  { name: 'phone-portrait-390x844', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'phone-portrait-toolbars-390x664', viewport: { width: 390, height: 664 }, touch: true, portraitPhone: true },
  { name: 'phone-landscape-844x390', viewport: { width: 844, height: 390 }, touch: true },
  { name: 'phone-landscape-toolbars-844x340', viewport: { width: 844, height: 340 }, touch: true },
  { name: 'ipad-portrait-820x1180', viewport: { width: 820, height: 1180 }, touch: true },
  { name: 'ipad-landscape-1180x820', viewport: { width: 1180, height: 820 }, touch: true },
];
(async () => {
  const browser = await chromium.launch();
  const setup = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const page = await setup.newPage();
  await page.goto(O + '/signin-with-chatgpt?return_to=/');
  const created = await page.evaluate(async () => (await (await fetch('/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: 'thanksgiving' }) })).json()));
  const id = created.snapshot.trip.id;
  const api = body => page.evaluate(async ([id, body]) => { const r = await fetch('/api/trip?id=' + id, { method: body ? 'PATCH' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Waypoint-Participant-Model': 'people-v1' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json() }; }, [id, body]);
  const send = async body => { const cur = await api(); const r = await api({ ...body, revision: cur.json.snapshot.revision }); if (r.status !== 200) throw new Error(JSON.stringify(r.json)); return r; };
  // All invented. The place has an address and no reviewed link, so the view offers searches and directions.
  await send({ action: 'place-edit', placeId: 'home', patch: { name: 'Saltmarsh landing (made up)', address: '12 Example Causeway, Sampleton', locationText: '12 Example Causeway, Sampleton' } });
  const everyone = (await api()).json.snapshot.trip.activities.find(a => a.id === 'option-5').participants;
  const imageId = await page.evaluate(async id => {
    const c = Object.assign(document.createElement('canvas'), { width: 800, height: 600 }), g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 600); sky.addColorStop(0, '#2b4a8f'); sky.addColorStop(1, '#f3b27a');
    g.fillStyle = sky; g.fillRect(0, 0, 800, 600);
    g.fillStyle = '#6b4a2f'; g.fillRect(0, 420, 800, 180);
    g.fillStyle = '#e9e2d0'; g.fillRect(300, 330, 220, 100); g.fillStyle = '#222'; g.beginPath(); g.arc(350, 440, 26, 0, 7); g.arc(470, 440, 26, 0, 7); g.fill();
    const r = await fetch('/api/image?id=' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: c.toDataURL('image/jpeg', .7) }) });
    if (!r.ok) throw new Error('picture upload ' + r.status);
    return (await r.json()).imageId;
  }, id);
  const base = { date: '2026-11-26', order: 0, participants: everyone, fixed: false, optional: true, sourceKind: 'entered' };
  await send({ action: 'add', activity: { ...base, id: 'mudflats', title: 'Mud flats van safari', time: '2:30 PM', placeId: 'home', imageId, guestNotes: PITCH, guestLocation: 'Top of the track, by the green gate', notes: 'Tide table checked (invented note).', links: [] } });
  await send({ action: 'add', activity: { ...base, id: 'mudflats-long', title: 'Mud flats van safari, the long version', time: '3:30 PM', placeId: 'home', imageId, guestNotes: LONG, guestLocation: 'Top of the track, by the green gate', notes: 'Tide table checked (invented note).', links: [{ label: 'Tide sheet (example)', url: 'https://example.com/tides' }] } });
  await send({ action: 'add', activity: { ...base, id: 'bare', title: 'Free afternoon', time: '', placeId: null, guestNotes: '', guestLocation: '', notes: '', links: [] } });
  const cookies = await setup.cookies();
  await setup.close();

  for (const size of SIZES) {
    const ctx = await browser.newContext({ viewport: size.viewport, deviceScaleFactor: 2, serviceWorkers: 'block', hasTouch: !!size.touch, isMobile: !!size.touch });
    await ctx.addCookies(cookies);
    const p = await ctx.newPage();
    p.on('pageerror', e => check(`${size.name}: no script error: ${e.message}`, false));
    await p.goto(O + '/?trip=' + id);
    await p.waitForSelector('#itinerary .activity');
    if (await p.isVisible('#day')) await p.selectOption('#day', '2026-11-26').catch(() => { });
    const card = aid => `#itinerary .activity[data-detail="${aid}"]`;
    const openView = async aid => {
      await p.waitForSelector(card(aid));
      await p.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'center', inline: 'center' }), card(aid));
      await p.waitForTimeout(150);
      await p.evaluate(sel => document.querySelector(sel).click(), card(aid));
      await p.waitForSelector('#activity-view[open]');
      await p.waitForFunction(() => { const i = document.querySelector('#activity-view .view-image'); return !i || (i.complete && i.naturalWidth > 0); });
      await p.waitForTimeout(350);
    };
    // Where things are, in window coordinates. `seen` means wholly inside the window and above the footer.
    const measure = () => p.evaluate(() => {
      const d = document.querySelector('#activity-view'), q = s => d.querySelector(s), r = e => e ? e.getBoundingClientRect() : null;
      const vh = window.innerHeight, vw = window.innerWidth, foot = r(q('.dialog-actions')), body = q('.view-body');
      const inWindow = b => !!b && b.height > 0 && b.top >= -0.5 && b.bottom <= vh + 0.5 && b.left >= -0.5 && b.right <= vw + 0.5;
      const seen = s => { const b = r(q(s)); return inWindow(b) && b.bottom <= foot.top + 0.5; };
      const scrollers = [d, ...d.querySelectorAll('*')].filter(e => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1).map(e => e.id || e.className);
      const order = ['.view-labels', 'h2', '.view-when', '.view-notes', '.view-image', '.view-where', '.view-maps', '.last-edit'].map(s => q(s)).filter(Boolean);
      const inOrder = order.every((e, i) => !i || (order[i - 1].compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING));
      const buttons = [...d.querySelectorAll('.dialog-actions button')].map(r);
      return { vh, dialog: (b => ({ top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height) }))(r(d)), dialogInWindow: inWindow(r(d)), footerSeen: buttons.length > 0 && buttons.every(inWindow), closeSeen: inWindow(r(q('.icon-button'))),
        titleSeen: seen('h2'), whenSeen: seen('.view-when'), notesSeen: q('.view-notes') ? seen('.view-notes') : null, scrollers, inOrder,
        allInBody: ['h2', '.view-when', '.view-where', '.view-notes', '.view-image', '.last-edit'].every(s => !q(s) || body.contains(q(s))),
        mapLinks: d.querySelectorAll('a.map-link').length, mapLinksShown: [...d.querySelectorAll('a.map-link')].filter(a => a.checkVisibility()).length, bodyHeight: Math.round(body.clientHeight), bodyScroll: body.scrollHeight - body.clientHeight, pageScrollLocked: getComputedStyle(document.documentElement).overflowY === 'hidden' || getComputedStyle(document.body).overflowY === 'hidden' };
    });
    // One finger, moved in small steps like a real drag: `dy` then, optionally, back by `back`.
    const drag = async (x, y, dy, back = 0) => {
      const cdp = await ctx.newCDPSession(p), step = 10, move = async to => { for (let at = y; Math.abs(to - at) > 0; ) { at += Math.sign(to - at) * Math.min(step, Math.abs(to - at)); y = at; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }); await p.waitForTimeout(12); } };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await move(y + dy);
      if (back) await move(y + back);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(350);
      await cdp.detach();
    };
    const bodyTop = () => p.$eval('#activity-view .view-body', e => Math.round(e.scrollTop));

    // ---------- Photo, address and description ----------
    await openView('mudflats');
    await p.screenshot({ path: `${SHOTS}/${size.name}-full.png` });
    let m = await measure();
    console.log(`      ${size.name}:`, JSON.stringify(m));
    check(`${size.name}: the view fits the window`, m.dialogInWindow, JSON.stringify(m.dialog));
    check(`${size.name}: × and Close/Edit are on screen without scrolling`, m.footerSeen && m.closeSeen);
    check(`${size.name}: title and time are on screen without scrolling`, m.titleSeen && m.whenSeen);
    check(`${size.name}: the description is on screen without scrolling`, m.notesSeen === true);
    check(`${size.name}: order is tags, title, when, description, photo, place, maps, last edited`, m.inOrder);
    check(`${size.name}: one scroll area holds everything but the × and the footer`, m.allInBody && m.scrollers.every(s => /view-body/.test(s)), m.scrollers.join(','));
    check(`${size.name}: the page behind cannot scroll`, m.pageScrollLocked);
    check(`${size.name}: map links are folded away behind one control`, m.mapLinks >= 4 && m.mapLinksShown === 0 && await p.$eval('#activity-view', d => !!d.querySelector('.view-maps summary')).catch(() => false), `${m.mapLinksShown} of ${m.mapLinks} showing`);
    // Scrolling from anywhere: the pointer is over the title, then over the footer.
    if (m.bodyScroll > 0) {
      const pageY = await p.evaluate(() => window.scrollY);
      for (const [what, sel] of [['title', '#activity-view h2'], ['footer', '#activity-view .dialog-actions']]) {
        await p.$eval('#activity-view .view-body', e => { e.scrollTop = 0; });
        const b = await p.locator(sel).boundingBox();
        await p.mouse.move(b.x + Math.min(40, b.width / 2), b.y + b.height / 2);
        await p.mouse.wheel(0, 300);
        await p.waitForTimeout(250);
        check(`${size.name}: the wheel scrolls the view with the pointer over the ${what}`, (await bodyTop()) > 0);
      }
      check(`${size.name}: wheeling in the view does not move the page behind`, (await p.evaluate(() => window.scrollY)) === pageY);
      if (size.touch) {
        // A finger dragged up from the title scrolls; it does not pull the sheet.
        await p.$eval('#activity-view .view-body', e => { e.scrollTop = 0; });
        const b = await p.locator('#activity-view .view-when').boundingBox();
        await drag(Math.round(b.x + 60), Math.round(b.y + b.height / 2), -110);
        check(`${size.name}: a finger on the title scrolls the view`, (await bodyTop()) > 0 && await p.$eval('#activity-view', d => d.open && !d.style.transform));
        if (await p.$eval('#activity-view .sheet-grip', g => getComputedStyle(g).display !== 'none')) {
          // Scrolled down, a downward drag scrolls back up and leaves the sheet alone.
          await drag(Math.round(b.x + 60), Math.round(b.y + b.height / 2), 60);
          check(`${size.name}: pulling down while scrolled does not move or close the sheet`, await p.$eval('#activity-view', d => d.open && !d.style.transform));
          // Up then down in one touch is still reading.
          await p.$eval('#activity-view .view-body', e => { e.scrollTop = 0; });
          await drag(Math.round(b.x + 60), Math.round(b.y + b.height / 2), -40, 140);
          check(`${size.name}: a touch that starts by scrolling never drags the sheet`, await p.$eval('#activity-view', d => d.open && !d.style.transform));
          // At the top, a pull down from the title closes it.
          await p.$eval('#activity-view .view-body', e => { e.scrollTop = 0; });
          await drag(Math.round(b.x + 60), Math.round(b.y + b.height / 2), 150);
          check(`${size.name}: at the top, a swipe down closes the sheet`, !(await p.$eval('#activity-view', d => d.open)));
          await openView('mudflats');
        }
      }
    }
    // Everything can be reached: open Maps, scroll to the end, and the last thing is above the footer.
    await p.$eval('#activity-view .view-body', e => { e.scrollTop = 0; });
    const maps = await p.$('#activity-view .view-maps summary');
    if (maps) {
      await maps.evaluate(e => { e.scrollIntoView({ block: 'center' }); e.click(); });
      await p.waitForTimeout(200);
      const links = await p.$$eval('#activity-view .view-maps a.map-link', as => as.map(a => { const b = a.getBoundingClientRect(); return { text: a.textContent, href: a.href, top: Math.round(b.top), left: Math.round(b.left), width: b.width }; }));
      check(`${size.name}: Maps opens to Apple and Google, search and directions`, links.length === 4 && links.filter(l => /apple/i.test(l.href)).length === 2 && links.filter(l => /google/i.test(l.href)).length === 2 && links.filter(l => /dir|daddr|destination/i.test(l.href)).length === 2, links.map(l => l.text).join(' | '));
      check(`${size.name}: the four links are not four stacked rows`, new Set(links.map(l => l.top)).size <= 2, links.map(l => l.top).join(','));
      await p.screenshot({ path: `${SHOTS}/${size.name}-full-maps-open.png` });
    }
    await p.$eval('#activity-view .view-body', e => { e.scrollTop = e.scrollHeight; });
    await p.waitForTimeout(200);
    const end = await p.evaluate(() => { const d = document.querySelector('#activity-view'), body = d.querySelector('.view-body'), last = [...body.querySelectorAll('.last-edit:not([hidden]), .view-maps, .view-where, .view-notes, .view-section')].pop(), f = d.querySelector('.dialog-actions').getBoundingClientRect(), b = last.getBoundingClientRect(); return { ok: b.bottom <= f.top + 1 && b.top >= 0, contained: body.contains(last), last: last.className }; });
    check(`${size.name}: scrolled to the end, the last line is above the footer`, end.ok && end.contained, end.last);
    await p.screenshot({ path: `${SHOTS}/${size.name}-full-scrolled.png` });
    await p.keyboard.press('Escape');

    // ---------- A long description still leaves the footer in place ----------
    await openView('mudflats-long');
    m = await measure();
    check(`${size.name}: long description: fits the window, footer on screen, one scroll area`, m.dialogInWindow && m.footerSeen && m.scrollers.every(s => /view-body/.test(s)), m.scrollers.join(','));
    await p.keyboard.press('Escape');

    // ---------- No photo, no place, no description ----------
    await openView('bare');
    await p.screenshot({ path: `${SHOTS}/${size.name}-bare.png` });
    m = await measure();
    check(`${size.name}: bare activity: fits, footer on screen`, m.dialogInWindow && m.footerSeen && m.titleSeen);
    check(`${size.name}: bare activity: no map links and no Maps control`, m.mapLinks === 0 && !(await p.$('#activity-view .view-maps')));

    // ---------- The editor, from Edit ----------
    await p.evaluate(() => document.querySelector('#activity-view [data-edit-activity]').click());
    await p.waitForSelector('#editor[open]');
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${SHOTS}/${size.name}-editor.png` });
    const ed = await p.evaluate(async () => {
      const d = document.querySelector('#editor'), b = d.getBoundingClientRect(), vh = window.innerHeight;
      const scrollers = [d, ...d.querySelectorAll('*')].filter(e => !/TEXTAREA|SELECT/.test(e.tagName) && /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1).map(e => e.id || e.className || e.tagName);
      const save = d.querySelector('#save');
      save.scrollIntoView({ block: 'nearest' });
      await new Promise(r => setTimeout(r, 100));
      const s = save.getBoundingClientRect();
      return { fits: b.top >= -0.5 && b.bottom <= vh + 0.5, dialog: [Math.round(b.top), Math.round(b.bottom), vh], scrollers, saveReachable: s.top >= 0 && s.bottom <= vh + 0.5 };
    });
    check(`${size.name}: editor fits the window and scrolls as one area to Save`, ed.fits && ed.saveReachable && ed.scrollers.length <= 1, JSON.stringify(ed));
    if (ed.scrollers.length) {
      await p.$eval('#editor', d => { d.scrollTop = 0; });
      const b = await p.locator('#edit-title').boundingBox();
      await p.mouse.move(b.x + 30, b.y + b.height / 2);
      await p.mouse.wheel(0, 300);
      await p.waitForTimeout(250);
      check(`${size.name}: the wheel scrolls the editor with the pointer over its heading`, await p.$eval('#editor', d => d.scrollTop > 0));
    }
    await p.keyboard.press('Escape');
    await ctx.close();
  }
  await browser.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
