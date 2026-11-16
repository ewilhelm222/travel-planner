import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { thanksgivingExample, applyTripChange, editorRestriction, editorDiffRestriction } from '../lib/trips.mjs';
const read = name => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('the poster is collapsed by default once a trip has activities, and the choice is remembered', async () => {
    const script = await read('planner.js');
    assert.match(script, /state\.compact = typeof state\.compactChoice === 'boolean' \? state\.compactChoice : !!t\?\.activities\.length;/);
    assert.match(script, /state\.compactChoice = !state\.compact;\s+persist\(\);/);
    assert.equal(script.match(/compactChoice: state\.compactChoice, denseChoice: state\.denseChoice/g).length, 2, 'both saved-state writers keep the choices');
    const desktop = script.slice(script.indexOf('<header class="trip-header">'), script.indexOf('<footer>', script.indexOf('<header class="trip-header">')));
    assert.ok(desktop.indexOf('id="itinerary"') < desktop.indexOf('id="drag-hint"'), 'the drag and filter notes sit below the board on desktop');
    assert.ok(desktop.indexOf('id="message"') < desktop.indexOf('id="itinerary"'), 'save and error messages stay above the board');
});

test('the board scrolls sideways only, so journey cards at the foot of a day are not cut off', async () => {
    const css = await read('planner.css');
    const rule = css.match(/\n\.date-board \{[^}]+\}/)[0];
    assert.match(rule, /overflow-x: auto/);
    assert.ok(!/max-height|overflow-y/.test(rule), 'no height cap and no vertical scrollbar inside the board');
    assert.ok(!/\.date-board[^{]*\{[^}]*max-height: \d/.test(css.replace(/max-height: none/g, '')), 'no other rule caps the board height');
});

test('a denser week view exists for long trips and keeps the essential labels', async () => {
    const script = await read('planner.js'), css = await read('planner.css');
    assert.match(script, /state\.dense = !!t && \(typeof state\.denseChoice === 'boolean' \? state\.denseChoice : dates\.length > 4\);/, 'trips longer than four days start in the week view');
    assert.match(script, /id="density" aria-pressed="\$\{state\.dense\}"/);
    assert.match(css, /\.dense \.date-board \{ --col-min: 172; --gap: 10px; --cols-default: 7; \}/, 'narrow day columns: seven on a laptop, fewer when the board is narrower');
    const dense = css.slice(css.indexOf('/* Denser desktop week view'));
    const hidden = dense.match(/([^{}]+)\{ display: none; \}/g).join(' ');
    for (const kept of ['.card-meta', '.booking', '.kind', '.people', '.person', 'strong', '.shared-label'])
        assert.ok(!new RegExp(`\\.dense \\${kept}[ ,{]`).test(hidden), `${kept} stays visible in the week view`);
    assert.match(dense, /@media \(min-width: 1000px\)/, 'the week view never applies on a phone');
    assert.match(css, /@media \(max-width: 999px\) \{ #density \{ display: none; \} \}/);
});

test('editors may write guest descriptions but not the trip\'s name, dates or time zone', () => {
    const trip = thanksgivingExample();
    for (const patch of [{ title: 'Renamed' }, { subtitle: 'x' }, { start: '2026-11-24' }, { end: '2026-11-30' }, { timezone: 'Asia/Tokyo' }, { kind: 'trip' }])
        assert.match(editorRestriction(trip, { action: 'metadata', patch }), /Only the organizer changes the trip's name, subtitle, dates, time zone or kind/);
    assert.equal(editorRestriction(trip, { action: 'edit', activityId: 'option-2', patch: { guestNotes: 'Bring boots', guestLocation: 'Front gate' } }), null, 'guest text on an activity is allowed');
    assert.equal(editorRestriction(trip, { action: 'stay-edit', stayId: 'shared-base', patch: { lodging: 'x' } }), null);
    assert.equal(editorRestriction(trip, { action: 'place-add', place: { id: 'p', name: 'P' } }), null);
});

test('an editor cannot undo the organizer\'s change to trip details', () => {
    const trip = thanksgivingExample(), renamed = applyTripChange(trip, { action: 'metadata', patch: { title: 'Organizer\'s new name', end: '2026-11-30' } });
    assert.match(editorDiffRestriction(renamed, trip), /Only the organizer changes the trip's name/);
    assert.equal(editorDiffRestriction(trip, applyTripChange(trip, { action: 'edit', activityId: 'option-2', patch: { guestNotes: 'x' } })), null);
});

test('the planner hides Trip details from editors and says what they can do', async () => {
    const script = await read('planner.js');
    assert.equal(script.match(/\$\{state\.isOwner \? `<button class="secondary" id="settings" \$\{off\}>Trip details<\/button>` : ''\}/g).length, 2, 'desktop and phone');
    assert.match(script, /The organizer manages the trip’s name and dates, the guest link, and who can edit\./);
    assert.match(script, /<strong>Editors cannot<\/strong> change the trip’s name, subtitle, dates or time zone,/);
});
