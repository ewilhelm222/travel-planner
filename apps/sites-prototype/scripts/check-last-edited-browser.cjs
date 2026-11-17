/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
// Browser check for "Last edited by" on an activity and its link into History, against a disposable
// local dev server with synthetic data and the loopback-only test accounts (Seedy, Edie).
// Usage: node scripts/check-last-edited-browser.cjs <screenshot-dir> [origin]
// Requires the dev server (`npm run dev`) with PLANNER_CREATOR_EMAILS=seedy@sites.test in .dev.vars.
const O = process.argv[3] || 'http://127.0.0.1:5173', SHOTS = process.argv[2] || '.';
if (!['127.0.0.1', 'localhost'].includes(new URL(O).hostname)) throw new Error('Only run against disposable loopback data.');
let failed = 0;
const check = (name, ok, extra = '') => { if (!ok) failed++; console.log(ok ? 'ok   ' : 'FAIL ', name, extra); };
(async () => {
  const browser = await chromium.launch();
  async function run(label, viewport) {
    const context = async who => { const c = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block', hasTouch: label !== 'desktop' }); const p = await c.newPage(); p.on('pageerror', e => check(`no script error (${label}, ${who || 'seedy'}): ${e.message}`, false)); await p.goto(`${O}/signin-with-chatgpt?return_to=/${who ? `&local_user=${who}` : ''}`); return { c, p }; };
    const { c: ctx, p: page } = await context('');
    const call = (p, path, method, body) => p.evaluate(async ([path, method, body]) => { const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json() }; }, [path, method || 'GET', body]);
    const id = (await call(page, '/api/trips', 'POST', { template: 'thanksgiving' })).json.snapshot.trip.id;
    const patch = async (p, body) => { const cur = await call(p, '/api/trip?id=' + id); const r = await call(p, '/api/trip?id=' + id, 'PATCH', { ...body, revision: cur.json.snapshot.revision }); if (r.status !== 200) throw new Error(JSON.stringify(r.json)); };
    await call(page, '/api/editors?id=' + id, 'POST', { action: 'add', email: 'edie@sites.test' });
    const everyone = (await call(page, '/api/trip?id=' + id)).json.snapshot.trip.activities.find(a => a.id === 'option-5').participants;
    // Seedy adds a plan; Edie, an editor, then changes it. A second plan is only ever added.
    await patch(page, { action: 'add', activity: { id: 'campfire', title: 'Campfire & stories', date: '2026-11-25', time: 'Night', placeId: 'home', order: 0, participants: everyone, notes: 'Made-up note.', guestNotes: 'Bring a blanket.', guestLocation: 'Fire pit', fixed: false, optional: true, sourceKind: 'entered' } });
    await patch(page, { action: 'add', activity: { id: 'cocoa', title: 'Cocoa on the porch', date: '2026-11-25', time: 'Late', placeId: 'home', order: 1, participants: everyone, notes: '', guestNotes: 'Made-up plan.', guestLocation: '', fixed: false, optional: true, sourceKind: 'entered' } });
    const { c: edieCtx, p: edie } = await context('edie');
    await patch(edie, { action: 'edit', activityId: 'campfire', patch: { time: 'After dark', guestNotes: 'Bring a blanket and a mug.' } });
    const log = (await call(page, '/api/history?id=' + id)).json.changes, editId = log[0].id, addCocoa = log[1].id, createId = log.at(-1).id;
    check(`${label}: the log has Edie's edit newest`, log[0].actor === 'Edie' && log[1].actor === 'Seedy', log.slice(0, 2).map(c => c.actor).join());

    await page.goto(O + '/?trip=' + id);
    await page.waitForSelector('#itinerary .activity');
    await page.waitForLoadState('networkidle');
    const card = cid => `#itinerary .activity[data-detail="${cid}"]`;
    const openCard = async cid => { await page.evaluate(sel => { const c = document.querySelector(sel); c.scrollIntoView({ block: 'center' }); c.click(); }, card(cid)); await page.waitForFunction(() => document.querySelector('#activity-view')?.open); await page.waitForFunction(() => !document.querySelector('#view-last-edit')?.hidden, null, { timeout: 5000 }).catch(() => { }); };
    const note = () => page.$eval('#view-last-edit', e => ({ hidden: e.hidden, text: e.textContent, href: e.querySelector('a')?.getAttribute('href') || '' }));

    // ---------- The note in the activity view ----------
    await page.waitForSelector(`${card('campfire')} .edited-mark`);
    check(`${label}: only the card changed in the last day carries the small mark`, await page.evaluate(() => [...document.querySelectorAll('#itinerary .edited-mark')].map(m => m.closest('.activity').dataset.detail).join()) === 'campfire');
    check(`${label}: the mark says so in words`, /Edited recently: Last edited by Edie · just now/.test(await page.textContent(`${card('campfire')} .edited-mark`)));
    await page.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'center' }), card('campfire'));
    await page.screenshot({ path: `${SHOTS}/${label}-card-mark.jpg`, quality: 80 });
    await openCard('campfire');
    let n = await note();
    check(`${label}: view says who last edited it and when`, !n.hidden && /Last edited by Edie · just now/.test(n.text), n.text);
    check(`${label}: it links to that entry`, n.href === `/?trip=${id}&history=${editId}`, n.href);
    await page.$eval('#view-last-edit', e => e.scrollIntoView({ block: 'end' }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/${label}-view-note.jpg`, quality: 80 });
    check(`${label}: the link is at least 44px tall`, await page.$eval('#view-last-edit a', e => e.getBoundingClientRect().height >= 43.5));
    await page.keyboard.press('Escape');
    await openCard('cocoa');
    n = await note();
    check(`${label}: a plan never edited says who added it`, /Added by Seedy · just now/.test(n.text) && n.href.endsWith(`history=${addCocoa}`), n.text);
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector('#itinerary .activity[data-detail="option-1"]').click());
    await page.waitForFunction(() => !document.querySelector('#view-last-edit')?.hidden);
    n = await note();
    check(`${label}: a plan that came with the trip points at the trip's creation`, /Added with this trip by Seedy/.test(n.text) && n.href.endsWith(`history=${createId}`), n.text);
    await page.keyboard.press('Escape');

    // ---------- Following the link ----------
    await openCard('campfire');
    await page.click('#view-last-edit a');
    await page.waitForFunction(() => document.querySelector('#history-dialog')?.open);
    const linked = () => page.evaluate(() => { const e = document.querySelector('#history-dialog .history-entry.linked'); if (!e) return null; const r = e.getBoundingClientRect(), d = document.querySelector('#history-dialog').getBoundingClientRect(); return { id: e.id, focused: document.activeElement === e, open: !!e.querySelector('details[open]'), inView: r.top >= d.top && r.bottom <= d.bottom + 1, text: e.textContent, count: document.querySelectorAll('.history-entry.linked').length }; });
    let l = await linked();
    check(`${label}: History opens with that entry highlighted, opened, focused and in view`, l && l.id === `change-${editId}` && l.focused && l.open && l.inView && l.count === 1, JSON.stringify(l));
    check(`${label}: the entry shows the details and its undo`, /The change you followed/.test(l.text) && /Edie/.test(l.text) && /After dark/.test(l.text) && await page.$eval(`#change-${editId}`, e => !!e.querySelector('[data-undo]')));
    check(`${label}: the activity view closed underneath`, !(await page.evaluate(() => document.querySelector('#activity-view').open)));
    check(`${label}: the address names the entry`, await page.evaluate(() => location.search) === `?trip=${id}&history=${editId}`);
    await page.screenshot({ path: `${SHOTS}/${label}-history-entry.jpg`, quality: 80 });
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#history-dialog')?.open);
    l = await linked();
    check(`${label}: after a reload the same entry is highlighted and in view`, l && l.id === `change-${editId}` && l.inView, JSON.stringify(l));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#history-dialog')?.open);
    await page.waitForTimeout(100);
    check(`${label}: closing History takes the entry out of the address`, await page.evaluate(() => location.search) === `?trip=${id}`);
    // Opened directly, as a pasted link, by the other member.
    await edie.goto(`${O}/?trip=${id}&history=${addCocoa}`);
    await edie.waitForFunction(() => document.querySelector('#history-dialog')?.open);
    check(`${label}: a pasted link opens the entry for another member`, await edie.evaluate(cid => document.querySelector('.history-entry.linked')?.id === `change-${cid}`, addCocoa));
    await edie.goto(`${O}/?trip=${id}&history=99999999`);
    await edie.waitForFunction(() => document.querySelector('#history-dialog')?.open);
    check(`${label}: a link to an entry that is not in this trip says so`, /not in this trip’s history/.test(await edie.textContent('#history-message')) && !(await edie.$('.history-entry.linked')));
    // Back and Forward.
    await openCard('campfire');
    await page.click('#view-last-edit a');
    await page.waitForFunction(() => document.querySelector('#history-dialog')?.open);
    await page.goBack();
    await page.waitForFunction(() => !document.querySelector('#history-dialog')?.open);
    check(`${label}: Back closes History and returns to the plan`, await page.evaluate(() => location.search) === `?trip=${id}`);

    // ---------- Undo from there, and the note follows the log ----------
    await page.goForward();
    await page.waitForFunction(() => document.querySelector('#history-dialog')?.open && !!document.querySelector('.history-entry.linked'));
    await page.click(`#change-${editId} [data-undo]`);
    await page.waitForFunction(() => /Undid/.test(document.querySelector('#history-message')?.textContent || ''));
    await page.keyboard.press('Escape');
    await openCard('campfire');
    await page.waitForFunction(() => /Seedy/.test(document.querySelector('#view-last-edit')?.textContent || ''));
    n = await note();
    check(`${label}: after the undo the note names the undo, by Seedy`, /Last edited by Seedy · just now/.test(n.text) && !n.href.endsWith(`history=${editId}`), n.text);

    // ---------- The editor ----------
    await page.click('#activity-view [data-edit-activity]');
    await page.waitForFunction(() => document.querySelector('#editor')?.open);
    const inEditor = await page.$eval('#edit-last-edit', e => ({ hidden: e.hidden, text: e.textContent, target: e.querySelector('a')?.target, href: e.querySelector('a')?.getAttribute('href') }));
    check(`${label}: the editor shows the note, opening in a new tab so the draft is kept`, !inEditor.hidden && /Last edited by Seedy/.test(inEditor.text) && inEditor.target === '_blank' && /history=\d+$/.test(inEditor.href), JSON.stringify(inEditor));
    await page.$eval('#edit-last-edit', e => e.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: `${SHOTS}/${label}-editor-note.jpg`, quality: 80 });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Add activity|^\+ Add/.test(b.textContent))?.click());
    await page.waitForFunction(() => document.querySelector('#editor')?.open);
    check(`${label}: a new activity has no note`, await page.$eval('#edit-last-edit', e => e.hidden && !e.textContent));
    await page.keyboard.press('Escape');
    check(`${label}: no sideways scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

    // ---------- Offline: no note, nothing broken ----------
    await ctx.route('**/api/history**', r => r.abort());
    await patch(page, { action: 'edit', activityId: 'cocoa', patch: { time: 'Later' } });
    await page.reload();
    await page.waitForSelector('#itinerary .activity');
    await page.evaluate(() => document.querySelector('#itinerary .activity[data-detail="cocoa"]').click());
    await page.waitForFunction(() => document.querySelector('#activity-view')?.open);
    await page.waitForTimeout(400);
    check(`${label}: when History cannot be reached the view still opens, without a note`, await page.$eval('#activity-view', e => e.textContent.includes('Cocoa on the porch') && e.querySelector('#view-last-edit').hidden));
    await ctx.unroute('**/api/history**');

    // ---------- Read-only guest: what they see of History today is nothing, and that is unchanged ----------
    const share = (await call(page, '/api/share?id=' + id, 'POST', { action: 'rotate', base: { share: 1 } })).json;
    const g = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block' });
    const guest = await g.newPage();
    const asked = [];
    guest.on('request', r => asked.push(new URL(r.url()).pathname + new URL(r.url()).search));
    await guest.goto(share.url);
    await guest.waitForSelector('#itinerary .activity');
    await guest.evaluate(() => document.querySelector('.activity[data-detail="campfire"]').click());
    await guest.waitForTimeout(300);
    check(`${label} guest: no note in the view, no mark on any card, no History control`, await guest.evaluate(() => document.querySelector('#activity-view').open && !document.querySelector('.last-edit, .last-edit-link, .edited-mark, #history, #history-dialog') && !/Last edited|Added by|Edie|Seedy/.test(document.body.textContent)));
    check(`${label} guest: the page never asks for History`, !asked.some(u => u.includes('/api/history')), asked.filter(u => u.includes('history')).join());
    await guest.screenshot({ path: `${SHOTS}/${label}-guest-view.jpg`, quality: 80 });
    const refused = await guest.evaluate(async ([id, t]) => { const a = await fetch(`/api/history?id=${id}&last=activity`, { headers: { Authorization: 'Share ' + t } }); const b = await fetch(`/api/history?id=${id}`); return [a.status, b.status]; }, [id, new URL(share.url).hash.slice(1)]);
    check(`${label} guest: History is refused to a guest, with or without the link's token`, refused.join() === '401,401', refused.join());
    await g.close(); await edieCtx.close(); await ctx.close();
  }
  await run('desktop', { width: 1440, height: 900 });
  await run('phone', { width: 390, height: 844 });
  await run('landscape', { width: 844, height: 390 });
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
