import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { thanksgivingExample, publicTrip } from '../lib/trips.mjs';
import { activityViewHtml, showActivityView, enableViewDismiss, mapsControl, swipeCloses, SWIPE_CLOSE, PULL_SLOP, VIEW_ID, viewDialog } from '../public/activity-view.mjs';
import { enableDrag } from '../public/drag.mjs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const planner = read('../public/planner.js'), guest = read('../public/guest.mjs'), css = read('../public/planner.css');

// An invented plan with every field filled in.
function fixture() {
    const t = thanksgivingExample();
    Object.assign(t.places[0], { name: 'Lakeside camp', address: '1 Example Shore Road', appleMapsUrl: 'https://maps.apple.com/?q=example', navReviewed: true });
    t.activities.push({ ...t.activities[0], id: 'campfire', sourceKind: 'entered', title: 'Campfire & <ghost> stories', date: '2026-11-26', time: 'Night', placeId: t.places[0].id, optional: true, highlight: false, fixed: false, timing: 'day', guestLocation: 'Fire pit', guestNotes: 'Bring a blanket.\nStories start at dusk.', notes: 'PRIVATE firewood note', address: 'PRIVATE gate code lane', links: [{ label: 'PRIVATE sheet', url: 'https://example.com/sheet' }] });
    return t;
}
const find = (t, id) => t.activities.find(a => a.id === id);

// A stand-in for the parts of the page these modules touch: listeners in capture and bubble order, and permissive elements.
function element(props = {}) {
    return { classList: { add() { }, remove() { }, toggle() { } }, style: {}, dataset: {}, setAttribute() { }, removeAttribute() { }, append() { }, remove() { }, before() { }, focus() { this.focused = true; }, querySelector: () => null, querySelectorAll: () => [], closest: () => null, matches: () => false, scrollIntoView() { }, getBoundingClientRect: () => ({ left: 0, top: 0, right: 200, bottom: 80, width: 200, height: 80 }), cloneNode: () => element(), offsetWidth: 200, offsetHeight: 80, ...props };
}
function fakeDocument() {
    const listeners = [];
    const document = { head: element(), body: element(), createElement: () => element(), getElementById: () => null, querySelector: () => null, elementFromPoint: () => null,
        addEventListener(type, fn, options) { listeners.push({ type, fn, capture: options === true || options?.capture === true }); },
        // Capture listeners first; a stopped event never reaches the page's own (bubble) handlers.
        dispatch(type, event = {}) {
            const e = { preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...event };
            for (const capture of [true, false]) {
                for (const l of listeners.filter(l => l.type === type && l.capture === capture)) l.fn(e);
                if (e.stopped) break;
            }
            return e;
        } };
    return document;
}

test('the view shows every field an editor may read, with Edit and nothing destructive', () => {
    const t = fixture(), html = activityViewHtml(find(t, 'campfire'), t, { canEdit: true });
    assert.match(html, /<h2 id="activity-view-title" tabindex="-1">Campfire &amp; &lt;ghost&gt; stories<\/h2>/, 'the title, escaped');
    assert.match(html, /Thursday, Nov 26 · Night/);
    const at = part => { const i = html.indexOf(part); assert.ok(i >= 0, `${part} is in the view`); return i; };
    assert.ok(at('class="view-body"') < at('activity-view-title') && at('activity-view-title') < at('view-when') && at('view-when') < at('view-where') && at('view-where') < at('class="dialog-actions"'), 'title, then time, then place, all inside the part that scrolls');
    for (const shown of ['Fire pit', 'Lakeside camp', '1 Example Shore Road', 'Bring a blanket.\nStories start at dusk.', 'PRIVATE firewood note', 'PRIVATE gate code lane', 'PRIVATE sheet', 'Optional', 'Cedar family'])
        assert.ok(html.includes(shown), `${shown} is shown`);
    assert.match(html, /<a class="map-link" href="https:\/\/maps\.apple\.com\/\?q=example" target="_blank" rel="noopener noreferrer">Apple Maps/, 'the place\'s reviewed map link');
    assert.match(html, /<button type="button" class="primary" data-edit-activity="campfire">Edit<\/button>/);
    assert.ok(!/delete|remove/i.test(html), 'delete stays in the editor');
    assert.ok(!/<(input|textarea|select|form)\b/.test(html), 'nothing in the view can be typed into');
});

test('a map link is offered only when a person has reviewed it; an idea says it has no day', () => {
    const t = fixture();
    t.places[0].navReviewed = false;
    // An unreviewed link is never shown as a link. What is offered instead is a search of the address, worded as one.
    const unreviewed = activityViewHtml(find(t, 'campfire'), t);
    assert.ok(!unreviewed.includes('class="map-link"') && !unreviewed.includes(t.places[0].appleMapsUrl || 'no-link'));
    assert.ok([...unreviewed.matchAll(/class="map-link( [^"]*)?"/g)].every(m => m[0] === 'class="map-link search"'));
    const idea = { ...find(t, 'campfire'), date: null, time: '' };
    assert.match(activityViewHtml(idea, t), /An idea · no day yet/);
    const set = { ...find(t, 'campfire'), fixed: true, highlight: true };
    const html = activityViewHtml(set, t);
    assert.ok(html.includes('■ Set time') && html.includes('Whole-group activity'), 'timing and whole-group are said in words');
});

test('a read-only user sees no Edit control, and nothing private', () => {
    const t = fixture(), shown = publicTrip(t), a = find(shown, 'campfire');
    const html = activityViewHtml(a, shown, { guest: true, canEdit: false });
    assert.ok(!html.includes('data-edit-activity') && !/>\s*Edit\s*</.test(html), 'no Edit button');
    assert.ok(!html.includes('PRIVATE') && !html.includes('Example Shore') && !html.includes('map-link'), 'the guest projection carries no private fields to show');
    assert.ok(html.includes('Fire pit') && html.includes('Stories start at dusk.') && html.includes('Thursday, Nov 26 · Night'), 'the same view otherwise');
    assert.ok(!activityViewHtml(find(t, 'campfire'), t).includes('data-edit-activity'), 'Edit is drawn only when asked for');
    // The guest page never asks for it, has no editor to open, and no handler for the Edit button.
    assert.match(guest, /showActivityView\(document, trip\.activities\.find\(a => a\.id === b\.dataset\.detail\), trip, \{ guest: true, canEdit: false \}\)/);
    assert.ok(!guest.includes('editActivity') && !guest.includes('id="editor"') && !guest.includes('canEdit: true'));
    // The preview of the guest link inside the planner is the guests' view too.
    assert.match(planner, /showActivityView\(document, a, trip, \{ guest: preview, canEdit: !preview \}\)/);
});

test('tap opens the view and not the editor', () => {
    const tap = planner.slice(planner.indexOf('if (b.dataset.detail)'), planner.indexOf("if (b.id === 'close-editor')"));
    assert.match(tap, /^if \(b\.dataset\.detail\)\s+openView\(b\.dataset\.detail, \{ preview: !!b\.closest\('\.guest-preview'\) \}\);/, 'a card opens the view');
    const body = planner.slice(planner.indexOf('function openView('), planner.indexOf('enableViewDismiss({'));
    assert.ok(body.includes('showActivityView(') && !body.includes('openEditor') && !body.includes("$('#editor')"), 'opening the view never opens the editor');
    // Every way into the editor: the Edit button in the view, and the three "add" entry points. No card tap.
    const calls = [...planner.matchAll(/(?<!function )openEditor\(([^)]*)\)/g)].map(m => m[1]);
    assert.deepEqual(calls, ['id', '', "null, { date: b.dataset.addDate || null, placeId: b.dataset.addPlace || undefined, beforeId: b.dataset.before || '' }"]);
    // Showing it: a modal dialog, filled read-only, focus on the title.
    const title = element(), notes = element({ scrollTop: 40 });
    const dialog = element({ open: false, showModal() { this.open = true; this.modal = true; }, querySelector: sel => sel === 'h2' ? title : notes });
    const t = fixture(), document = { getElementById: id => id === VIEW_ID ? dialog : null };
    assert.equal(showActivityView(document, find(t, 'campfire'), t, { canEdit: false }), dialog);
    assert.ok(dialog.modal && title.focused && notes.scrollTop === 0 && dialog.dataset.activity === 'campfire');
    assert.ok(dialog.innerHTML.includes('Campfire') && !dialog.innerHTML.includes('data-edit-activity'));
    assert.equal(showActivityView(document, undefined, t), null, 'a card whose activity is gone opens nothing');
    assert.match(viewDialog(), /^<dialog id="activity-view" class="activity-view" aria-labelledby="activity-view-title"><\/dialog>$/);
    assert.ok(planner.includes('${viewDialog()}<dialog id="editor"') && guest.includes('const dialog = `${viewDialog()}<dialog id="stay-view"'), 'both pages use the one view');
});

test('Edit opens the editor for that activity, and saving or cancelling comes back to the view', () => {
    const edit = planner.slice(planner.indexOf('if (b.dataset.editActivity) {'), planner.indexOf("if (b.id === 'close-editor')"));
    assert.match(edit, /const id = b\.dataset\.editActivity;\s+viewing = null;\s+\$\(`#\$\{VIEW_ID\}`\)\.close\(\);\s+openEditor\(id\);\s+returnTo = id;/);
    assert.match(planner, /function openEditor\(id, preset = \{\}\) \{ returnTo = null;/, 'an editor opened any other way returns to the schedule');
    assert.match(planner, /if \(event\.target\.id === 'editor' && returnTo\) \{\s+const id = returnTo;\s+returnTo = null;\s+openView\(id\);/, 'cancel (×, Escape) returns to the view');
    assert.match(planner, /viewing = change\.action !== 'delete' && returnTo && returnTo === change\.activityId \? returnTo : null;/, 'a save returns to the view; a delete does not');
    assert.match(planner, /if \(viewing\)\s+openView\(viewing\);\s+\}\s+\/\/ ---- Activity view/, 'the redraw after a save reopens the view with the saved values');
    assert.match(planner, /id="delete">Delete activity<\/button>/, 'delete is still in the editor');
    assert.match(planner, /if \(event\.target\.id === VIEW_ID && !\$\('#editor'\)\?\.open\) \{\s+viewing = null;\s+focusCard\(/, 'closing the view hands focus back to the card');
    assert.equal(planner.match(/data-grow/g).length >= 3, true, 'the editor\'s description and notes boxes grow to show everything');
});

test('ending a drag does not open the view', async () => {
    const saved = { window: globalThis.window, raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame };
    globalThis.window = { innerWidth: 1200, innerHeight: 800, scrollBy() { } };
    globalThis.requestAnimationFrame = () => 0;
    globalThis.cancelAnimationFrame = () => { };
    try {
        const document = fakeDocument(), board = element();
        const card = element({ dataset: { detail: 'campfire' } });
        card.closest = sel => sel === '.activity[data-detail]' ? card : sel === '.can-drag' ? board : null;
        const drops = [];
        const drag = enableDrag({ document, canDrag: () => true, currentDay: () => '2026-11-26', onDayHover() { }, onDrop: d => drops.push(d), dock: () => [], describe: () => ({ title: 'Campfire', date: '2026-11-26', fixed: false, note: '' }) });
        // The page's own handler, as planner.js registers it: a click on a card opens the view.
        let opened = 0;
        document.addEventListener('click', e => { if (e.target.closest('.activity[data-detail]')) opened++; });
        const tick = ms => new Promise(resolve => setTimeout(resolve, ms));

        document.dispatch('click', { target: card });
        assert.equal(opened, 1, 'a plain click opens the view');

        // Mouse: press, move past the threshold, release. The browser then sends a click on the same card.
        document.dispatch('pointerdown', { pointerType: 'mouse', button: 0, target: card, clientX: 20, clientY: 20 });
        document.dispatch('pointermove', { pointerType: 'mouse', target: card, clientX: 60, clientY: 70 });
        assert.equal(drag.active, true, 'the card was picked up');
        document.dispatch('pointerup', { pointerType: 'mouse', target: card, clientX: 60, clientY: 70 });
        assert.equal(drag.active, false);
        assert.equal(document.dispatch('click', { target: card }).stopped, true, 'the click from the release is swallowed');
        assert.equal(opened, 1, 'so the view does not open');
        await tick(5);
        document.dispatch('click', { target: card });
        assert.equal(opened, 2, 'the next real click opens it again');

        // A press that never moves is a click, not a drag.
        document.dispatch('pointerdown', { pointerType: 'mouse', button: 0, target: card, clientX: 20, clientY: 20 });
        document.dispatch('pointermove', { pointerType: 'mouse', target: card, clientX: 22, clientY: 21 });
        document.dispatch('pointerup', { pointerType: 'mouse', target: card, clientX: 22, clientY: 21 });
        assert.equal(drag.active, false);
        document.dispatch('click', { target: card });
        assert.equal(opened, 3);

        // Touch: a quick tap is left alone; a long press picks up, and its release is not turned into a click.
        document.dispatch('touchstart', { touches: [{ clientX: 20, clientY: 20 }], target: card });
        assert.equal(document.dispatch('touchend', { touches: [], target: card }).defaultPrevented, undefined, 'a tap is not prevented, so the browser clicks');
        document.dispatch('touchstart', { touches: [{ clientX: 20, clientY: 20 }], target: card });
        await tick(420);
        assert.equal(drag.active, true, 'held long enough to pick up');
        document.dispatch('touchmove', { touches: [{ clientX: 40, clientY: 90 }], target: card });
        assert.equal(document.dispatch('touchend', { touches: [], target: card }).defaultPrevented, true, 'no click is synthesized from the drop');
        document.dispatch('click', { target: card });
        assert.equal(opened, 3, 'and a click that arrives anyway is swallowed');
        assert.equal(drops.length, 0, 'nothing was dropped on a day in this stand-in page');
    }
    finally {
        globalThis.window = saved.window;
        globalThis.requestAnimationFrame = saved.raf;
        globalThis.cancelAnimationFrame = saved.caf;
    }
});

test('the view is a bottom sheet on phones, dismissable by swipe, and shipped with the offline shell', () => {
    assert.equal(swipeCloses(SWIPE_CLOSE), true);
    assert.equal(swipeCloses(SWIPE_CLOSE - 1), false, 'a short pull springs back');
    assert.equal(swipeCloses(120, 100), false, 'a sideways drag is not a swipe down');
    assert.equal(swipeCloses(-200), false);
    const dismiss = read('../public/activity-view.mjs');
    assert.match(dismiss, /if \(scroller && scroller\.scrollTop > 0\)\s+return;/, 'scrolling the notes never closes the sheet');
    assert.match(dismiss, /e\.clientX < r\.left \|\| e\.clientX > r\.right \|\| e\.clientY < r\.top \|\| e\.clientY > r\.bottom/, 'a tap on the backdrop closes');
    assert.match(css, /@media \(max-width: 559px\), \(max-width: 760px\) and \(orientation: portrait\) \{\n  \/\* Phone: a sheet from the bottom edge[^\n]*\n  dialog\.activity-view \{ margin: auto 0 0; width: 100%;/);
    assert.match(css, /\.view-body \{ flex: 1 1 auto; min-height: 0; overflow-y: auto;/, 'the view scrolls inside itself');
    assert.ok(read('../public/sw.js').includes('"/activity-view.mjs"') && planner.includes("'/activity-view.mjs', '/history.mjs'"), 'cached for offline reading');
});

// ---- Layout of the view (November 19): reading order, one Maps control, one scroll area ----
// An invented plan with a picture, an address that gives searches and directions, and a one-line pitch.
function outing() {
    const t = thanksgivingExample();
    Object.assign(t.places[0], { name: 'Saltmarsh landing', address: '12 Example Causeway, Sampleton', locationText: '12 Example Causeway, Sampleton', appleMapsUrl: '', amapUrl: '', navReviewed: false });
    t.activities.push({ ...t.activities[0], id: 'mudflats', sourceKind: 'entered', title: 'Mud flats van safari', date: '2026-11-26', time: '2:30 PM', placeId: t.places[0].id, imageId: 'img-1', guestLocation: 'Top of the track', guestNotes: 'Come watch the van get stuck in the mud.', notes: 'PRIVATE tide note', address: '', links: [] });
    t.activities.push({ ...t.activities[0], id: 'bare', sourceKind: 'entered', title: 'Free afternoon', date: '2026-11-26', time: '', placeId: null, imageId: '', guestLocation: '', guestNotes: '', notes: '', address: '', links: [] });
    return t;
}
const order = (html, parts) => parts.map(part => { const i = html.indexOf(part); assert.ok(i >= 0, `${part} is in the view`); return i; });
const ascending = list => list.every((n, i) => !i || list[i - 1] < n);

test('the view reads in the order a person wants: who and what, when, description, photo, place, maps, last edited', () => {
    const t = outing(), html = activityViewHtml(find(t, 'mudflats'), t, { canEdit: true });
    const at = order(html, ['class="view-labels"', 'id="activity-view-title"', 'class="view-when"', 'Come watch the van get stuck in the mud.', 'class="view-image"', 'class="view-where"', 'Top of the track', 'Saltmarsh landing', '12 Example Causeway', '<details class="view-maps"', 'https://maps.apple.com/', 'PRIVATE tide note', 'id="view-last-edit"', 'class="dialog-actions"']);
    assert.ok(ascending(at), `in order: ${at.join(', ')}`);
    // The same order for a guest, who gets the description and the picture but no maps and no last-edited line.
    const shown = publicTrip(t), guestHtml = activityViewHtml(find(shown, 'mudflats'), shown, { guest: true });
    assert.ok(ascending(order(guestHtml, ['id="activity-view-title"', 'class="view-when"', 'Come watch the van get stuck in the mud.', 'class="view-image"', 'class="view-where"', 'Top of the track', 'class="dialog-actions"'])));
    assert.ok(!guestHtml.includes('view-maps') && !guestHtml.includes('map-link') && !guestHtml.includes('view-last-edit'));
});

test('map links are one small Maps control after the place, with all four destinations inside', () => {
    const t = outing(), html = activityViewHtml(find(t, 'mudflats'), t);
    assert.equal(html.match(/<details class="view-maps"/g).length, 1, 'one control');
    assert.ok(!/<details[^>]* open/.test(html), 'closed until asked for');
    const where = html.slice(html.indexOf('class="view-where"'), html.indexOf('</details>'));
    assert.ok(where.indexOf('12 Example Causeway') < where.indexOf('<details class="view-maps"'), 'after the place line');
    const inside = html.slice(html.indexOf('<details class="view-maps"'), html.indexOf('</details>')), outside = html.replace(inside, '');
    const q = encodeURIComponent('12 Example Causeway, Sampleton');
    for (const url of [`https://maps.apple.com/?q=${q}`, `https://www.google.com/maps/search/?api=1&amp;query=${q}`, `https://maps.apple.com/?daddr=${q}`, `https://www.google.com/maps/dir/?api=1&amp;destination=${q}`])
        assert.ok(inside.includes(`href="${url}"`), `${url} is reachable`);
    assert.equal(inside.match(/class="map-link search"/g).length, 4);
    assert.ok(!outside.includes('map-link'), 'no map link is drawn outside the control');
    assert.match(inside, /<summary><span class="view-maps-name">Maps<\/span>/);
    assert.equal(inside.match(/<p class="map-links map-search"/g).length, 2, 'two short rows, search and directions, each with Apple and Google');
    // The rows stay on one line each, and the control is small: never four stacked full-width buttons.
    assert.match(css, /\.view-where \.view-maps p\.map-links \{ display: flex; flex-wrap: nowrap;/);
    assert.match(css, /\.view-maps summary \{ display: inline-flex;/);
    // A reviewed link goes inside the same control, first.
    Object.assign(t.places[0], { appleMapsUrl: 'https://maps.apple.com/?q=checked', navReviewed: true });
    const reviewed = activityViewHtml(find(t, 'mudflats'), t), box = reviewed.slice(reviewed.indexOf('<details class="view-maps"'), reviewed.indexOf('</details>'));
    assert.ok(box.includes('Checked link') && box.indexOf('https://maps.apple.com/?q=checked') < box.indexOf('map-link search') && !reviewed.replace(box, '').includes('map-link'));
});

test('no maps control when the activity has no usable location', () => {
    const t = outing(), bare = activityViewHtml(find(t, 'bare'), t, { canEdit: true });
    assert.ok(!bare.includes('view-maps') && !bare.includes('map-link') && !bare.includes('<details'), 'no place and no address: nothing to offer');
    assert.ok(bare.includes('Location to confirm') && !bare.includes('view-image') && bare.includes('No notes yet.'));
    assert.equal(mapsControl({ reviewed: [], search: null, directions: null }, 'Anything'), '');
    // A place with no name, address or link gives nothing either; an activity's own private address does.
    Object.assign(t.places[0], { name: '', address: '', localAddress: '', locationText: '' });
    assert.ok(!activityViewHtml(find(t, 'mudflats'), t).includes('view-maps'));
    const own = activityViewHtml({ ...find(t, 'bare'), address: '3 Sample Lane' }, t);
    assert.equal(own.match(/class="map-link search"/g).length, 4);
    // Guests never get one, whatever the place has.
    const full = outing(), shown = publicTrip(full);
    assert.ok(!activityViewHtml(find(shown, 'mudflats'), shown, { guest: true }).includes('view-maps'));
});

test('the body is the single scroll container; only the × and Close/Edit stay put', () => {
    const t = outing(), html = activityViewHtml(find(t, 'mudflats'), t, { canEdit: true });
    // Top level of the dialog: grip, ×, the scrolling body, the footer. Nothing else.
    const body = html.indexOf('<div class="view-body"'), foot = html.indexOf('<div class="dialog-actions">');
    assert.match(html.slice(0, body), /^<div class="sheet-grip" aria-hidden="true"><\/div><button type="button" class="icon-button view-close" data-close="activity-view" aria-label="Close activity">×<\/button>$/);
    const inner = html.slice(body, foot);
    assert.equal((inner.match(/<div/g) || []).length, (inner.match(/<\/div>/g) || []).length, 'the body closes before the footer');
    for (const part of ['activity-view-title', 'view-when', 'view-notes', 'view-image', 'view-where', 'view-maps', 'view-last-edit'])
        assert.ok(inner.includes(part), `${part} scrolls with the body`);
    assert.match(html.slice(foot), /^<div class="dialog-actions"><button type="button" class="secondary" data-close="activity-view">Close<\/button><button type="button" class="primary" data-edit-activity="mudflats">Edit<\/button><\/div>$/);
    // The dialog never scrolls and never outgrows the visible window; the body takes what is left and scrolls.
    const rule = sel => { const m = css.match(new RegExp(`(?:^|\\n)\\s*${sel.replace(/[.[\]>()]/g, '\\$&')} \\{([^}]*)\\}`)); assert.ok(m, `${sel} has a rule`); return m[1]; };
    assert.match(rule('dialog.activity-view'), /overflow: hidden;.*max-height: calc\(100dvh - 32px\);/);
    assert.match(rule('dialog.activity-view[open]'), /display: flex; flex-direction: column;/);
    assert.match(rule('.view-body'), /flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain;/);
    assert.match(rule('.activity-view .dialog-actions'), /flex: 0 0 auto;/);
    const view = css.slice(css.indexOf('/* Activity view: tapping'), css.indexOf('/* The editor\'s longer text boxes'));
    assert.equal(view.match(/overflow(-y)?: (auto|scroll)/g).length, 1, 'one scroll area at every size, the sideways phone included');
    assert.ok(!/\dvh\b/.test(view.replace(/max-height: [^;]*vh[^;]*; (?=max-height: [^;]*dvh)/g, '')), 'every height is in dynamic viewport units; plain vh appears only as the older-browser fallback just before one');
    assert.match(view, /max-height: min\(88dvh, 100dvh - 48px\);/, 'the phone sheet');
    assert.match(view, /padding-bottom: max\(14px, env\(safe-area-inset-bottom\)\);/, 'the footer clears the home indicator');
    assert.match(view, /@media \(min-width: 560px\) and \(max-height: 520px\) and \(orientation: landscape\) \{\n  dialog\.activity-view \{[^}]*max-height: calc\(100dvh - 12px - env\(safe-area-inset-bottom\)\);/, 'sideways: all the height there is');
    assert.ok(!/grid-template-rows|grid-row/.test(view), 'no fixed rows for the content to be clipped by');
    assert.match(css, /html:has\(dialog:modal\) \{ overflow: hidden; \}/, 'the page behind does not scroll');
});

// A page with one open view whose body can scroll, enough for the dismiss and wheel handlers.
function sheetPage({ scrollTop = 0 } = {}) {
    const document = fakeDocument(), scroller = { scrollTop, clientHeight: 300 }, closed = [];
    const dialog = element({ id: VIEW_ID, open: true, close() { this.open = false; closed.push(true); }, querySelector: sel => sel === '.view-body' ? scroller : null });
    const inside = (inBody = true) => ({ closest: sel => sel === `#${VIEW_ID}` ? dialog : sel === '.view-body' && inBody ? scroller : null });
    enableViewDismiss({ document, sheet: () => true });
    const touch = (type, y, target = inside(), x = 100) => document.dispatch(type, { target, touches: [{ clientX: x, clientY: y }] });
    return { document, dialog, scroller, closed, inside, touch };
}

test('swipe down closes only from the top, and never fights with scrolling', () => {
    // From the top, a pull down follows the finger and closes.
    let p = sheetPage();
    p.touch('touchstart', 200); p.touch('touchmove', 200 + PULL_SLOP - 2);
    assert.equal(p.dialog.style.transform || '', '', 'a few pixels of wobble do not move the sheet');
    p.touch('touchmove', 330);
    assert.equal(p.dialog.style.transform, 'translateY(130px)');
    p.document.dispatch('touchend');
    assert.equal(p.closed.length, 1);
    // Scrolled down: the touch belongs to the content.
    p = sheetPage({ scrollTop: 40 });
    p.touch('touchstart', 200); p.touch('touchmove', 400); p.document.dispatch('touchend');
    assert.ok(p.dialog.open && !p.dialog.style.transform);
    // A touch that begins by scrolling up never becomes a pull, even if the finger comes back down.
    p = sheetPage();
    p.touch('touchstart', 300); p.touch('touchmove', 270); p.touch('touchmove', 480); p.document.dispatch('touchend');
    assert.ok(p.dialog.open && !p.dialog.style.transform, 'up then down is reading');
    // The content scrolled under the finger part-way through: the pull is dropped and the sheet put back.
    p = sheetPage();
    p.touch('touchstart', 200); p.touch('touchmove', 260);
    p.scroller.scrollTop = 12; p.touch('touchmove', 400); p.document.dispatch('touchend');
    assert.ok(p.dialog.open && !p.dialog.style.transform);
    // A short pull springs back.
    p = sheetPage();
    p.touch('touchstart', 200); p.touch('touchmove', 200 + SWIPE_CLOSE - 5); p.document.dispatch('touchend');
    assert.ok(p.dialog.open && !p.dialog.style.transform);
});

test('the wheel scrolls the body from the × and the footer too', () => {
    const p = sheetPage();
    p.document.dispatch('wheel', { target: p.inside(false), deltaY: 120, deltaMode: 0 });
    assert.equal(p.scroller.scrollTop, 120, 'over the footer, the body is scrolled for it');
    p.document.dispatch('wheel', { target: p.inside(false), deltaY: 3, deltaMode: 1 });
    assert.equal(p.scroller.scrollTop, 168, 'line-based wheels too');
    p.document.dispatch('wheel', { target: p.inside(true), deltaY: 120, deltaMode: 0 });
    assert.equal(p.scroller.scrollTop, 168, 'over the body the browser scrolls it; nothing is added');
    p.document.dispatch('wheel', { target: { closest: () => null }, deltaY: 120, deltaMode: 0 });
    assert.equal(p.scroller.scrollTop, 168, 'outside the view, nothing');
});

test('nothing in the view lets a person join or leave an activity; the roster is not tied to sign-ins', () => {
    // Join was asked for and is not built: a signed-in editor cannot be matched to a traveler (see docs/activity-view-layout.md).
    const t = outing();
    for (const options of [{ canEdit: true }, { guest: true }])
        assert.ok(!/data-join|data-leave|>\s*(Join|Leave)\s*</.test(activityViewHtml(find(options.guest ? publicTrip(t) : t, 'mudflats'), options.guest ? publicTrip(t) : t, options)));
    assert.deepEqual(Object.keys((t.people || [])[0] || { id: 1, name: 1, familyId: 1 }).filter(k => /mail|user|account/i.test(k)), [], 'a traveler record carries no sign-in');
});
