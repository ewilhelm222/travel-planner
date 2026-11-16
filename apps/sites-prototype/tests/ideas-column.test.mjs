import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { thanksgivingExample } from '../lib/trips.mjs';
import { ideaCards } from '../public/board.mjs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const planner = read('../public/planner.js'), guest = read('../public/guest.mjs'), css = read('../public/planner.css');

test('ideas are grouped under a place heading only when they belong to more than one place', () => {
    const t = thanksgivingExample();
    t.places.push({ id: 'town', name: 'Town <centre>' });
    const idea = (id, placeId) => ({ ...t.activities[0], id, date: null, placeId, title: id });
    assert.ok(!ideaCards([idea('a', 'home'), idea('b', 'home')], t).includes('idea-place'), 'one place: a plain list');
    const html = ideaCards([idea('a', 'town'), idea('b', null), idea('c', 'home')], t);
    assert.deepEqual([...html.matchAll(/<h3 class="idea-place">([^<]*)</g)].map(m => m[1]), ['Our shared base · location to confirm', 'Town &lt;centre&gt;', 'Anywhere'], 'in the trip\'s place order, unplaced last, names escaped');
    assert.ok(html.indexOf('data-detail="c"') < html.indexOf('data-detail="a"') && html.indexOf('data-detail="a"') < html.indexOf('data-detail="b"'));
    assert.equal(ideaCards([], t), '');
});

test('on wide screens the ideas sit beside the days and can be folded; the choice is remembered', () => {
    assert.match(planner, /<div class="board-wrap\$\{state\.ideasClosed \? ' ideas-closed' : ''\}">\$\{ideasSection\(t\)\}<div id="itinerary"/);
    assert.match(planner, /id="ideas-toggle" aria-expanded="\$\{!state\.ideasClosed\}" aria-controls="idea-cards"/);
    assert.equal(planner.match(/ideasClosed: state\.ideasClosed/g).length, 2, 'both saved-state writers keep the choice');
    assert.match(css, /\.board-wrap\.ideas-closed > \.ideas > :not\(\.ideas-toggle\) \{ display: none; \}/);
    assert.match(css, /@media \(min-width: 761px\) \{\n  \.board-wrap \{ display: flex;/);
    assert.match(guest, /<div class="board-wrap">\$\{ideas\}<div class="date-board" id="itinerary"/, 'guests get the same column');
    assert.match(css, /\.board-wrap > \.ideas \{ order: 2; \}/, 'on a phone the ideas still follow the day');
});

test('a folded ideas column is still a drop target, and the phone layout keeps ideas after the day', () => {
    const drag = read('../public/drag.mjs');
    assert.match(drag, /el\.closest\('\.ideas'\)/, 'dropping anywhere on the ideas section unschedules');
    const phonePage = planner.slice(planner.indexOf('const phonePage = '), planner.indexOf('app.innerHTML = `${phoneLayout'));
    assert.ok(!phonePage.includes('board-wrap') && phonePage.indexOf('id="itinerary"') < phonePage.indexOf('${ideasSection(t)}'));
});
