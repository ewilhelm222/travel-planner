import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { thanksgivingExample, applyTripChange } from '../lib/trips.mjs';
import { card } from '../public/board.mjs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../public/planner.css'), planner = read('../public/planner.js'), dragCss = read('../public/drag.mjs');
const IMAGE = '0b0e7c1e-1111-4222-8333-444455556666', BROKEN = '0b0e7c1e-9999-4222-8333-444455556666';
// The rule that drops a picture that fails to load, exactly as the planner registers it.
const dropFailed = planner.match(/document\.addEventListener\('error', event => \{\s*if \(event\.target\.classList\?\.contains\('card-image'\)[^]*?\}, true\);/)?.[0];

// A day column and the ideas column as the planner draws them, with made-up activities: one card with a
// picture, one without, one whose picture cannot be loaded, and the same three as ideas.
function fixture() {
    let t = thanksgivingExample();
    t = applyTripChange(t, { action: 'edit', activityId: 'option-2', patch: { imageId: IMAGE } });
    t = applyTripChange(t, { action: 'edit', activityId: 'option-4', patch: { imageId: BROKEN } });
    const cards = ['option-2', 'option-3', 'option-4'].map(id => card(t.activities.find(a => a.id === id), t)).join('');
    return { t, cards };
}

test('the laptop week view and the ideas column no longer leave the picture out; a sideways phone and print still do', () => {
    assert.ok(!/\.dense \.card-image\s*\{[^}]*display:\s*none/.test(css), 'the week view shows pictures');
    assert.ok(!/\.ideas \.card-image\s*\{[^}]*display:\s*none/.test(css), 'the ideas column shows pictures');
    assert.match(css, /@media \(min-width: 761px\) and \(max-height: 520px\), \(min-width: 560px\) and \(max-height: 520px\) and \(orientation: landscape\) \{ \.card-image \{ display: none; \} \}/);
    assert.match(css, /@media print \{ \.card-image \{ display: none; \} \}/);
    const base = css.match(/^\.card-image \{[^}]*\}/m)[0];
    assert.match(base, /aspect-ratio: 16 \/ 9; object-fit: cover;/, 'a fixed shape, cropped to fill');
    assert.match(base, /pointer-events: none; -webkit-user-drag: none;/, 'a press on the picture is a press on the card, so the browser never drags the image itself');
    assert.match(css, /\.dense \.card-image, \.dense \.board-wrap > \.ideas \.card-image \{[^}]*aspect-ratio: 2 \/ 1;/);
    // The phone thumbnail is as it was.
    assert.match(css, /\.schedule-first \.activity:has\(\.card-image\) \{ position: relative; padding-right: 86px; min-height: 84px; \}/);
    assert.match(css, /\.schedule-first \.activity \.card-image \{ position: absolute; top: 12px; right: 14px; width: 60px; height: 60px; margin: 0; aspect-ratio: 1; border-radius: 12px; flex: none; \}/);
});

test('a card with a picture carries one lazy image with empty alt text; a card without one carries no placeholder', () => {
    const { t } = fixture(), withPicture = card(t.activities.find(a => a.id === 'option-2'), t), without = card(t.activities.find(a => a.id === 'option-3'), t);
    assert.equal(withPicture.match(/<img /g).length, 1);
    assert.match(withPicture, /<img class="card-image" src="\/api\/image\?[^"]+" alt="" loading="lazy" decoding="async">/, 'decorative: the title beside it names the activity');
    assert.ok(!/<img|card-image|placeholder/.test(without));
    assert.ok(dropFailed, 'the planner drops a card picture that fails to load');
    assert.ok(!/card-image/.test(dragCss), 'drag handling is untouched by pictures');
});

// The real stylesheet in a real browser. Skipped where Playwright is not installed; the checks above still run.
let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* not installed here */ }
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAFklEQVR4nGP8z8Dwn4EIwESMolGFAAB5qgIKq4QO4QAAAABJRU5ErkJggg==', 'base64');
async function openBoard(browser, { width, height, dense, slow }) {
    const { cards } = fixture(), page = await browser.newPage({ viewport: { width, height } });
    let release; const gate = new Promise(r => { release = r; });
    await page.route('http://waypoint.test/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><style>${css.replace(/@font-face\s*\{[^}]*\}/g, '')}</style></head><body class="${dense ? 'dense' : ''}"><main><div class="board-wrap"><section class="ideas"><div class="idea-cards">${cards.replaceAll('loading="lazy"', '')}</div></section><div class="date-board"><section class="agenda-day" data-selected="true"><section class="agenda-city"><div class="cards">${cards.replaceAll('loading="lazy"', '')}</div></section></section></div></div></main><script>${dropFailed}</script></body></html>` });
        if (url.pathname !== '/api/image') return route.fulfill({ status: 404, body: '' });
        if (slow) await gate;
        return url.searchParams.get('image') === IMAGE ? route.fulfill({ contentType: 'image/png', body: PNG }) : route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    await page.goto('http://waypoint.test/', { waitUntil: slow ? 'commit' : 'load' });
    await page.waitForSelector('.cards .activity');
    const measure = () => page.evaluate(() => Object.fromEntries(['.cards', '.idea-cards'].map(column => [column, [...document.querySelectorAll(`${column} .activity`)].map(card => {
        const img = card.querySelector('.card-image'), c = card.getBoundingClientRect(), r = img?.getBoundingClientRect(), s = getComputedStyle(card);
        return { id: card.dataset.detail, width: c.width, height: c.height, title: card.querySelector('strong').getBoundingClientRect().width, padding: `${s.paddingTop} ${s.paddingRight}`, images: card.querySelectorAll('img').length,
            picture: img && getComputedStyle(img).display !== 'none' ? { width: r.width, height: r.height, flush: Math.abs(r.top - c.top) < 1 && Math.abs(r.left - c.left) < 1 && Math.abs(r.right - c.right) < 1, fit: getComputedStyle(img).objectFit, pointer: getComputedStyle(img).pointerEvents } : null };
    })])));
    return { page, measure, release };
}

test('at laptop width a card with a picture shows the thumbnail, a card without one has no box, and a failed picture leaves the plain card', { skip: !chromium && 'Playwright is not installed' }, async () => {
    const browser = await chromium.launch();
    try {
        for (const dense of [true, false]) {
            const { page, measure } = await openBoard(browser, { width: 1440, height: 900, dense });
            await page.waitForFunction(() => document.querySelectorAll('img').length === 2 && [...document.querySelectorAll('img')].every(i => i.complete));
            const m = await measure(), view = dense ? 'week view' : 'larger cards';
            for (const [column, [withPicture, plain, failed]] of Object.entries(m)) {
                const where = `${view}, ${column}`;
                assert.ok(withPicture.picture, `${where}: the picture is shown`);
                assert.ok(withPicture.picture.flush, `${where}: it fills the top of the card edge to edge`);
                assert.equal(withPicture.picture.fit, 'cover');
                assert.equal(withPicture.picture.pointer, 'none');
                const ratio = withPicture.picture.width / withPicture.picture.height, expected = !dense && column === '.cards' ? 16 / 9 : 2;
                assert.ok(Math.abs(ratio - expected) < .03, `${where}: fixed shape, got ${ratio.toFixed(2)}`);
                assert.equal(withPicture.title, plain.title, `${where}: the title keeps the full width of the card`);
                assert.equal(plain.images, 0, `${where}: a card without a picture has no image element`);
                assert.equal(plain.picture, null);
                assert.equal(failed.images, 0, `${where}: the failed picture is removed`);
                assert.equal(failed.padding, plain.padding, `${where}: and the card is laid out like one that never had a picture`);
                assert.equal(withPicture.padding, plain.padding);
            }
            // Pressing on the picture reaches the card itself, so the card's own click and drag handling applies.
            const hit = await page.evaluate(() => { const r = document.querySelector('.cards .card-image').getBoundingClientRect(), el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return `${el.tagName}.${el.className.trim().split(/\s+/)[0]}`; });
            assert.equal(hit, 'BUTTON.activity');
            await page.close();
        }
    } finally { await browser.close(); }
});

test('a slow picture holds its place: the card is the same size before and after it arrives', { skip: !chromium && 'Playwright is not installed' }, async () => {
    const browser = await chromium.launch();
    try {
        const { page, measure, release } = await openBoard(browser, { width: 1440, height: 900, dense: true, slow: true });
        const before = await measure();
        assert.ok(before['.cards'][0].picture.height > 40, 'the space is reserved while the picture loads');
        release();
        await page.waitForFunction(() => document.querySelectorAll('img').length === 2 && [...document.querySelectorAll('img')].every(i => i.complete && i.naturalWidth));
        const after = await measure();
        assert.equal(after['.cards'][0].height, before['.cards'][0].height);
        assert.equal(after['.idea-cards'][0].height, before['.idea-cards'][0].height);
    } finally { await browser.close(); }
});

test('a sideways phone hides the picture rather than squeeze a short screen, and a phone held upright keeps its 60 px thumbnail', { skip: !chromium && 'Playwright is not installed' }, async () => {
    const browser = await chromium.launch();
    try {
        const sideways = await openBoard(browser, { width: 844, height: 390, dense: false });
        await sideways.page.waitForFunction(() => document.querySelectorAll('img').length === 2);
        const m = await sideways.measure();
        assert.ok([...m['.cards'], ...m['.idea-cards']].every(c => c.picture === null));
        const upright = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const { cards } = fixture();
        await upright.setContent(`<style>${css.replace(/@font-face\s*\{[^}]*\}/g, '')}</style><main class="schedule-first"><section class="agenda-day" data-selected="true"><div class="cards">${cards.replaceAll(/src="[^"]*"/g, '')}</div></section></main>`);
        const thumb = await upright.evaluate(() => { const i = document.querySelector('.card-image'), r = i.getBoundingClientRect(), s = getComputedStyle(i); return { width: r.width, height: r.height, position: s.position, padding: getComputedStyle(i.closest('.activity')).paddingRight }; });
        assert.deepEqual(thumb, { width: 60, height: 60, position: 'absolute', padding: '86px' });
    } finally { await browser.close(); }
});
