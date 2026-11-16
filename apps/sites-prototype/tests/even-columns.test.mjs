import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { thanksgivingExample, normalizeTrip } from '../lib/trips.mjs';
import { board, columnsThatFit } from '../public/board.mjs';
const css = readFileSync(new URL('../public/planner.css', import.meta.url), 'utf8');

test('every day header carries the long and the short weekday, for all seven days', () => {
    const t = normalizeTrip({ ...thanksgivingExample(), start: '2026-11-22', end: '2026-11-28', stays: [], activities: [] }, 'week');
    const html = board(t, { day: t.start });
    assert.deepEqual([...html.matchAll(/<span class="wd-long">(\w+)<\/span><abbr class="wd-short" title="(\w+)">(\w+)<\/abbr>/g)].map(m => `${m[1]}/${m[2]}/${m[3]}`),
        ['Sunday/Sunday/Sun', 'Monday/Monday/Mon', 'Tuesday/Tuesday/Tue', 'Wednesday/Wednesday/Wed', 'Thursday/Thursday/Thu', 'Friday/Friday/Fri', 'Saturday/Saturday/Sat']);
});

test('headers never wrap, narrow columns use the short weekday, and the stay line is one line', () => {
    assert.match(css, /\n\.agenda-date \{ flex-wrap: nowrap; \}/);
    assert.match(css, /\.agenda-date > \.weekday \{ min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; \}/);
    assert.match(css, /@container \(max-width: 259px\) \{\n\s+\.wd-long \{ display: none; \}\n\s+\.wd-short \{ display: inline; \}/);
    assert.match(css, /\.lodging-text \{ flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; \}/);
    assert.match(css, /\.agenda-city h3 \{ white-space: nowrap; overflow: hidden; text-overflow: ellipsis; \}/);
    const html = board(thanksgivingExample(), {});
    assert.match(html, /<h3 title="Our shared base · location to confirm">/, 'a clipped place name is still available in full');
    assert.match(html, /<span class="lodging-text">⌂ [^<]+<\/span><span class="edit-hint" aria-hidden="true">Details<\/span>/);
});

test('a whole number of columns fills the board, and scrolling snaps to a column', () => {
    assert.equal(columnsThatFit(506, 190, 12), 2, 'sideways phone, ideas open');
    assert.equal(columnsThatFit(662, 190, 12), 3, 'sideways phone, ideas folded');
    assert.equal(columnsThatFit(385, 280, 24), 1, 'narrowest desktop beside the ideas');
    assert.equal(columnsThatFit(609, 280, 24), 2, 'narrowest desktop with the ideas folded');
    assert.equal(columnsThatFit(1158, 172, 10), 6, 'week view beside the ideas at 1440');
    assert.equal(columnsThatFit(100, 300, 24), 1, 'never zero');
    assert.match(css, /grid-auto-columns: calc\(\(100% - \(var\(--cols, var\(--cols-default\)\) - 1\) \* var\(--gap\)\) \/ var\(--cols, var\(--cols-default\)\)\); scroll-snap-type: x mandatory;/);
    assert.match(css, /\.is-dragging \.date-board \{ scroll-snap-type: none; \}/, 'snapping pauses while a card is dragged');
});
