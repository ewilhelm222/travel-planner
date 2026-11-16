import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { thanksgivingExample, publicTrip } from '../lib/trips.mjs';
import { card, preferredDay, days } from '../public/board.mjs';
const read = name => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('a visit opens on today while the trip is under way, otherwise on the first day', t => {
    const trip = thanksgivingExample();
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-27T20:00:00Z') });
    assert.equal(preferredDay(trip, null), '2026-11-27');
    assert.equal(preferredDay(trip, '2026-11-28'), '2026-11-28', 'a day chosen during the visit is kept');
    t.mock.timers.setTime(new Date('2026-11-13T20:00:00Z').getTime());
    assert.equal(preferredDay(trip, null), days(trip)[0]);
    t.mock.timers.setTime(new Date('2026-12-05T20:00:00Z').getTime());
    assert.equal(preferredDay(trip, null), days(trip)[0]);
});

test('cards carry time, title, people and the meeting point without opening', () => {
    const trip = thanksgivingExample();
    trip.activities[1].guestLocation = 'Front <porch>';
    trip.activities.forEach(a => { a.sourceKind = 'entered'; });
    const html = card(trip.activities[1], trip);
    for (const part of ['Morning', 'Neighborhood walk', 'Cedar family', 'Meet · Front &lt;porch&gt;'])
        assert.ok(html.includes(part), part);
    const guest = publicTrip(trip);
    assert.ok(card(guest.activities[1], guest, true).includes('Meet · Front &lt;porch&gt;'), 'guest cards use the guest meeting point');
    trip.activities[1].guestLocation = '';
    assert.ok(!card(trip.activities[1], trip).includes('card-where'));
});

test('the phone page puts the schedule before every management control', async () => {
    const script = await read('planner.js');
    const phonePage = script.slice(script.indexOf('const phonePage = '), script.indexOf('app.innerHTML = `${phoneLayout'));
    assert.ok(phonePage.length > 500);
    const at = text => { const i = phonePage.indexOf(text); assert.ok(i >= 0, `${text} is present`); return i; };
    const schedule = at('id="itinerary"');
    assert.ok(at('id="trip-select"') < schedule && at('${dayChooser(t, state.day)}') < schedule);
    assert.ok(at('class="ideas"') > schedule && at('class="ideas"') < at('id="manage"'), 'ideas stay reachable right after the day');
    for (const id of ['add', 'travelers', 'settings', 'share', 'offline-file', 'export', 'refresh', 'status', 'drag-hint', 'new-trip', 'paste-import', 'import', 'sign-out'])
        assert.ok(at(`id="${id}"`) > at('id="manage"'), `${id} sits in the manage section below the schedule`);
    assert.ok(at('href="#manage"') < schedule, 'a small jump link reaches the manage section');
    const guest = await read('guest.mjs');
    const guestPhone = guest.slice(guest.indexOf('? `<a class="skip-link"'), guest.indexOf(': `<a class="skip-link"'));
    assert.ok(guestPhone.indexOf('${schedule}') < guestPhone.indexOf('id="refresh"'), 'guest view uses the same order');
});

test('the offline shell version matches between the page and the service worker', async () => {
    const version = text => text.match(/waypoint-shell-v(\d+)/)[1];
    assert.equal(version(await read('planner.js')), version(await read('sw.js')));
});
