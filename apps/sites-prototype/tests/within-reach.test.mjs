import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { thanksgivingExample, publicTrip } from '../lib/trips.mjs';
import { board, card, dayChooser } from '../public/board.mjs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const planner = read('../public/planner.js'), guest = read('../public/guest.mjs');

test('every day ends with an Add that carries its day and its stay\'s place; guests get none', () => {
    const t = thanksgivingExample(), html = board(t, { day: t.start });
    assert.equal(html.match(/class="add-here"/g).length, 5, 'one per day');
    assert.match(html, /data-add-date="2026-11-26" data-add-place="home">\+ Add<span class="add-here-day"> to Thursday 26<\/span>/);
    assert.ok(!board(publicTrip(t), { guest: true }).includes('add-here'));
    assert.match(planner, /openEditor\(null, \{ date: b\.dataset\.addDate \|\| null, placeId: b\.dataset\.addPlace \|\| undefined, beforeId: b\.dataset\.before \|\| '' \}\)/);
    assert.match(planner, /date: 'date' in preset \? preset\.date : state\.day/, 'the ideas Add opens with no day; the global Add keeps the selected day');
    assert.match(planner, /data-add-date="">\+ Add an idea/);
});

test('the day a stay ends shows a check-out line that opens the same stay details', () => {
    const t = thanksgivingExample();
    t.stays[0].end = '2026-11-29';
    const html = board(t, { day: t.start }), last = html.slice(html.indexOf('data-date="2026-11-29"'));
    assert.match(last, /class="lodging checkout" data-stay-view="shared-base"[^>]*><span class="lodging-text">⌂ Check-out day · /);
    assert.equal(html.match(/class="lodging" data-stay-view="shared-base"/g).length, 4, 'the nights keep their ordinary stay line');
    assert.ok(!board(publicTrip(t), { guest: true }).includes('Check-out'));
    assert.match(planner, /function openStayView\(id\)/);
    assert.match(planner, /<dialog id="stay-view" aria-labelledby="stay-view-title">/, 'a reading dialog, so it stays cream');
    assert.match(planner, /data-stay="\$\{escape\(s\.id\)\}">Edit stay/);
});

test('guests see ideas with guest fields only, and never examples', () => {
    const t = thanksgivingExample();
    t.activities.push({ ...t.activities[0], id: 'idea-1', date: null, time: '', sourceKind: 'entered', title: 'Bookshop', notes: 'PRIVATE', address: 'PRIVATE', guestNotes: 'Bring a list', guestLocation: 'Front door', links: [{ label: 'PRIVATE', url: 'https://example.com/' }] });
    t.activities.push({ ...t.activities[0], id: 'idea-2', date: null, sourceKind: 'synthetic', title: 'Invented idea' });
    const shown = publicTrip(t), text = JSON.stringify(shown);
    assert.deepEqual(shown.activities.map(a => a.id), ['idea-1']);
    assert.ok(!text.includes('PRIVATE') && !text.includes('Invented idea'));
    assert.ok(card(shown.activities[0], shown, true).includes('No day yet'));
    assert.match(guest, /Ideas <span>· not scheduled yet<\/span>/);
    assert.match(read('../public/activity-view.mjs'), /An idea · no day yet/, 'said in the activity view the guest page opens');
    assert.match(planner, /browse the dated activities and the unscheduled ideas/);
    assert.ok(!/lodging details, unscheduled ideas/.test(planner), 'the share dialog no longer says ideas are excluded');
});

test('ideas come before the map, the rail can jump to them, and an empty map is one sentence', () => {
    const t = thanksgivingExample();
    assert.ok(!dayChooser(t, t.start).includes('ideas-stop'));
    assert.match(dayChooser(t, t.start, { ideas: 3 }), /<a class="medallion ideas-stop" href="#ideas" aria-label="Ideas, not scheduled yet: 3">/);
    const panel = read('../public/map-panel.mjs');
    assert.match(panel, /if \(model\.nodes\.length > 1\) \{/);
    assert.match(panel, /Nothing to draw yet: a map needs at least two places/);
});
