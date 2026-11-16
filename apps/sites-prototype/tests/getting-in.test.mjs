import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const planner = read('../public/planner.js'), guest = read('../public/guest.mjs'), route = read('../app/api/trips/route.ts'), tripRoute = read('../app/api/trip/route.ts');

test('a signed-in account that is on no trip is told so, with its address, instead of being asked to sign in', () => {
    const welcome = planner.slice(planner.indexOf('function welcome()'), planner.indexOf('function render()'));
    assert.match(welcome, /state\.user && !state\.canCreate/);
    assert.match(welcome, /You are signed in, but not on a trip yet/);
    assert.match(welcome, /escape\(state\.user\.email \|\| state\.user\.name\)/, 'the address is shown, escaped');
    assert.match(welcome, /id="check-again"/);
    assert.match(welcome, /data-sign-out="1"/);
    assert.ok(!/Sign in with/.test(welcome.split('return `')[1]), 'the signed-in branch does not say "sign in"');
    assert.match(planner, /state\.snapshot \? 'No downloaded itinerary yet' : ''/, 'no "downloaded itinerary" line when there is no trip');
});

test('the trip list tells the caller their own address; a trip response still carries no emails', () => {
    assert.match(route, /user: \{ \.\.\.userView\(user\), email: user\.email \}/);
    assert.ok(!/email/.test(tripRoute), 'the trip route does not handle addresses');
});

test('the planner says who is editing and the guest page says it is read-only and where to sign in', () => {
    assert.match(planner, /id="edit-state"/);
    assert.match(planner, /'Editing' : 'Signed in'\} as \$\{who\}/);
    assert.match(guest, /You are viewing a read-only copy/);
    assert.match(guest, /<a href="\/" target="_top"/, 'a plain top-level link to the planner; sign-in is handled there');
    assert.equal(guest.match(/\$\{banner\}/g).length, 2, 'on both the phone and the desktop guest page');
    assert.ok(!/fetch\([^)]*signin/.test(guest), 'sign-in is never started by fetch');
});
