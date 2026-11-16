import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { thanksgivingExample, publicTrip } from '../lib/trips.mjs';
import { activityViewHtml, showActivityView, swipeCloses, SWIPE_CLOSE, VIEW_ID, viewDialog } from '../public/activity-view.mjs';
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
    assert.ok(html.indexOf('activity-view-title') < html.indexOf('view-when') && html.indexOf('view-when') < html.indexOf('view-where') && html.indexOf('view-where') < html.indexOf('view-body'), 'title, then time, then place, then the notes that scroll');
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
    assert.ok(!activityViewHtml(find(t, 'campfire'), t).includes('map-link'));
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
    assert.deepEqual(calls, ['id', '', 'null, { date: b.dataset.addDate || null, placeId: b.dataset.addPlace || undefined }']);
    // Showing it: a modal dialog, filled read-only, focus on the title.
    const title = element(), notes = element({ scrollTop: 40 });
    const dialog = element({ open: false, showModal() { this.open = true; this.modal = true; }, querySelector: sel => sel === 'h2' ? title : notes });
    const t = fixture(), document = { getElementById: id => id === VIEW_ID ? dialog : null };
    assert.equal(showActivityView(document, find(t, 'campfire'), t, { canEdit: false }), dialog);
    assert.ok(dialog.modal && title.focused && notes.scrollTop === 0 && dialog.dataset.activity === 'campfire');
    assert.ok(dialog.innerHTML.includes('Campfire') && !dialog.innerHTML.includes('data-edit-activity'));
    assert.equal(showActivityView(document, undefined, t), null, 'a card whose activity is gone opens nothing');
    assert.match(viewDialog(), /^<dialog id="activity-view" class="activity-view" aria-labelledby="activity-view-title"><\/dialog>$/);
    assert.ok(planner.includes('${viewDialog()}<dialog id="editor"') && guest.includes('const dialog = viewDialog();'), 'both pages use the one view');
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
    assert.match(css, /\.view-body \{ flex: 1 1 auto; min-height: 72px; overflow-y: auto;/, 'long notes scroll inside the view');
    assert.ok(read('../public/sw.js').includes('"/activity-view.mjs"') && planner.includes("'/activity-view.mjs', '/history.mjs'"), 'cached for offline reading');
});
