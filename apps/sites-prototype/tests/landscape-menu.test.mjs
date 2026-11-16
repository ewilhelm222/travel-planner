import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const planner = read('../public/planner.js'), css = read('../public/planner.css'), drag = read('../public/drag.mjs');

test('on wide screens only Add, the filter and the view switch sit above the board; the rest is in Manage', () => {
    const desktop = planner.slice(planner.indexOf('<section class="library-bar">'), planner.indexOf('<div id="status" role="status" aria-live="polite"></div><div id="message"'));
    for (const id of ['travelers', 'structure', 'settings', 'history', 'share', 'editors', 'offline-file', 'export', 'refresh', 'new-trip', 'paste-import', 'import'])
        assert.ok(!desktop.includes(`id="${id}"`), `${id} is not written straight into the toolbar`);
    for (const id of ['trip-select', 'add', 'density'])
        assert.ok(desktop.includes(`id="${id}"`), `${id} stays visible`);
    const menu = planner.slice(planner.indexOf('function manageMenu('), planner.indexOf('function render()'));
    for (const id of ['travelers', 'structure', 'settings', 'history', 'share', 'editors', 'offline-file', 'export', 'refresh', 'new-trip', 'paste-import', 'import'])
        assert.ok(menu.includes(`id="${id}"`), `${id} keeps its id inside the menu`);
    assert.match(menu, /state\.isOwner \? `<button class="secondary" id="settings"/, 'organizer-only controls are still organizer-only');
    assert.match(menu, /state\.canCreate \? `<button class="secondary" id="new-trip"/);
    assert.match(planner, /event\.key === 'Escape' && menu\?\.open && !document\.querySelector\('dialog\[open\]'\)/, 'Escape closes the menu');
});

test('a short, wide screen keeps the wide layout but gives the height to the days', () => {
    const start = css.indexOf('@media (min-width: 761px) and (max-height: 520px) {');
    assert.ok(start > 0);
    const block = css.slice(start);
    assert.match(block, /main \.library-bar ~ \.trip-header, \.view-title, #status:not\(\.reading-copy\)[^{]*\{ display: none; \}/, 'the poster bar and the status line fold away; an offline or expired notice does not');
    assert.match(block, /\.board-wrap:not\(\.ideas-closed\) > \.date-board \{ grid-auto-columns: minmax\(220px, calc\(\(100% - 12px\) \/ 2\)\); \}/, 'ideas plus two days');
    assert.match(block, /\.date-board \{ grid-auto-columns: minmax\(220px, calc\(\(100% - 24px\) \/ 3\)\)/, 'or three days with the ideas folded');
    assert.match(drag, /@media\(max-height:520px\)\{\.drop-dock h2\{display:none\}/, 'the drop panel is slimmer on a short screen');
    assert.match(planner, /const phone = \(\) => window\.matchMedia\?\.\('\(max-width:760px\)'\)\.matches;/, 'the phone/desktop switch itself is unchanged');
});
