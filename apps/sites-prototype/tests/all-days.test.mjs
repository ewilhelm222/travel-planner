import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { thanksgivingExample } from '../lib/trips.mjs';
import { dayChooser, dayInView, pressDay } from '../public/board.mjs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const planner = read('../public/planner.js'), guest = read('../public/guest.mjs'), css = read('../public/planner.css');

test('the day rail offers an All days stop and every day keeps its own button', () => {
    const t = thanksgivingExample(), rail = dayChooser(t, t.start, { ideas: 2, allDays: false });
    assert.match(rail, /<button type="button" class="medallion all-stop" data-day-mode="all" aria-pressed="false" aria-label="Show all days in one scroll">/);
    assert.deepEqual([...rail.matchAll(/class="medallion" data-day="(\d{4}-\d\d-\d\d)" aria-pressed="(true|false)"/g)].map(m => m[1] + m[2]), ['2026-11-25true', '2026-11-26false', '2026-11-27false', '2026-11-28false', '2026-11-29false']);
    assert.match(dayChooser(t, t.start, { allDays: true }), /all-stop" data-day-mode="all" aria-pressed="true"/);
    assert.ok(!dayChooser(t, t.start).includes('all-stop'), 'not offered where the caller does not support it');
});

test('the day on screen is the last one whose section has passed under the pinned rail', () => {
    const section = (date, top) => ({ dataset: { date }, getBoundingClientRect: () => ({ top }) });
    const doc = tops => ({ querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 74 }) }), querySelectorAll: () => tops.map(([d, y]) => section(d, y)) });
    assert.equal(dayInView(doc([['a', -900], ['b', 84], ['c', 700]])), 'b');
    assert.equal(dayInView(doc([['a', 300], ['b', 900]])), null, 'above the first day nothing is current');
    assert.equal(dayInView(doc([['a', -2000], ['b', -900], ['c', 60]])), 'c');
    const pressed = {}, medallion = day => ({ dataset: { day }, setAttribute: (k, v) => { pressed[day] = v; } });
    pressDay({ querySelectorAll: () => [medallion('a'), medallion('b')], querySelector: () => null }, 'b');
    assert.deepEqual(pressed, { a: 'false', b: 'true' });
});

test('all days is a remembered phone-only view for planner and guest; choosing a day scrolls instead of hiding', () => {
    assert.match(planner, /<main class="compact schedule-first\$\{state\.allDays \? ' all-days' : ''\}">/);
    assert.equal(planner.match(/allDays: state\.allDays \}/g).length, 2, 'both saved-state writers keep the choice');
    assert.match(planner, /if \(b\.dataset\.day && allDaysView\(\)\)\n\s+jumpToDay\(b\.dataset\.day\);/);
    assert.match(planner, /document\.body\.classList\.contains\('is-dragging'\)/, 'scroll tracking pauses during a drag');
    assert.match(guest, /localStorage\.setItem\('waypoint-guest-all-days'/);
    assert.match(guest, /<main class="compact schedule-first\$\{allDays \? ' all-days' : ''\}">/);
    assert.match(css, /\.schedule-first\.all-days \.agenda-day\[data-selected=false\] \{ display: block; \}/);
    assert.match(css, /\n\.all-stop \{ display: none;/, 'hidden on wide screens, where the days are already side by side');
});
