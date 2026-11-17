// "Last edited by" on an activity: taken from the change log, linked to its History entry,
// and absent for guests. All names and data are made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyTripChange, publicTrip, thanksgivingExample } from '../lib/trips.mjs';
import { diffTrips, relativeTime, lastEditText, lastEditHtml, historyHref, recentlyEdited } from '../public/history.mjs';
import { advance } from '../public/revisions.mjs';
import { LAST_EDITS_SQL, TRIP_CREATED_SQL, lastEdits } from '../lib/last-edits.mjs';
import { activityViewHtml } from '../public/activity-view.mjs';
import { board } from '../public/board.mjs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const planner = read('../public/planner.js'), guest = read('../public/guest.mjs'), route = read('../app/api/history/route.ts'), css = read('../public/planner.css');
const NOW = Date.parse('2026-11-17T18:00:00Z');
const ago = ms => new Date(NOW - ms).toISOString(), MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

// A small copy of the change log, written the way the server writes it: each save is diffed, given
// per-record revisions, and stored as one row.
async function log() {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec("CREATE TABLE planner_changes (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, trip_id text NOT NULL, revision integer NOT NULL, actor_id text NOT NULL, actor_name text NOT NULL, at text NOT NULL, action text NOT NULL, summary text NOT NULL, records text DEFAULT '[]' NOT NULL, undoes integer)");
    const insert = db.prepare('INSERT INTO planner_changes (trip_id,revision,actor_id,actor_name,at,action,summary,records) VALUES (?,?,?,?,?,?,?,?)');
    let trip = thanksgivingExample(), revisions = {}, revision = 1;
    insert.run('t1', 1, 'u1', 'Seedy', ago(9 * DAY), 'create', 'Created this trip', '[]');
    const save = (actor, at, change, { legacy = false } = {}) => {
        const next = applyTripChange(trip, change), stepped = advance(revisions, diffTrips(trip, next));
        // Rows from before per-record revisions carry neither `rev` nor `incidental`.
        const records = legacy ? stepped.records.map(r => { const o = { ...r }; delete o.rev; delete o.incidental; return o; }) : stepped.records;
        trip = next;
        revisions = stepped.revisions;
        return Number(insert.run('t1', ++revision, actor, actor, at, change.action || 'edit', 'x', JSON.stringify(records)).lastInsertRowid);
    };
    const result = () => lastEdits(db.prepare(LAST_EDITS_SQL).all('t1', 'activity'), db.prepare(TRIP_CREATED_SQL).get('t1'), trip.activities.map(a => a.id));
    return { db, save, result, insert, trip: () => trip };
}

test('the note picks the newest log entry that really changed that activity', async () => {
    const l = await log();
    const first = l.save('Edie', ago(3 * DAY), { action: 'edit', activityId: 'option-2', patch: { time: 'Late morning' } });
    const second = l.save('Otto', ago(2 * HOUR), { action: 'edit', activityId: 'option-2', patch: { notes: 'Bring boots (made up).' } });
    const other = l.save('Edie', ago(HOUR), { action: 'edit', activityId: 'option-3', patch: { title: 'Cook together, slowly' } });
    const last = l.result();
    assert.deepEqual(last['option-2'], { id: second, actor: 'Otto', at: ago(2 * HOUR), added: false }, 'the later of two edits, not the earlier and not another card\'s');
    assert.notEqual(last['option-2'].id, first);
    assert.deepEqual(last['option-3'], { id: other, actor: 'Edie', at: ago(HOUR), added: false });
});

test('a drag that only renumbers neighbours does not count as editing them', async () => {
    const l = await log();
    const edit = l.save('Edie', ago(DAY), { action: 'edit', activityId: 'option-3', patch: { time: 'Noon' } });
    // Otto moves option-4 to the top of the day: option-2 and option-3 are only renumbered.
    const move = l.save('Otto', ago(HOUR), { action: 'move', activityId: 'option-4', date: '2026-11-26', beforeId: 'option-2' });
    let last = l.result();
    assert.equal(last['option-3'].id, edit, 'still Edie\'s edit');
    assert.equal(last['option-3'].actor, 'Edie');
    assert.equal(last['option-2'].withTrip, true, 'a card nobody edited is not attributed to the person who dragged another card');
    // The dragged card itself is a reorder within the day; its own entry is the move only if something but its position changed.
    assert.ok(last['option-4'].withTrip || last['option-4'].id === move);
    // The same holds for rows written before per-record revisions, which have no `incidental` flag.
    const legacy = l.save('Otto', ago(30 * MIN), { action: 'move', activityId: 'option-5', date: '2026-11-26', beforeId: 'option-2' }, { legacy: true });
    last = l.result();
    assert.equal(last['option-3'].id, edit);
    assert.notEqual(last['option-2'].id, legacy);
    // Moving a card to another day is a real change to that card.
    const toDay = l.save('Otto', ago(10 * MIN), { action: 'move', activityId: 'option-3', date: '2026-11-27', beforeId: null });
    assert.deepEqual(l.result()['option-3'], { id: toDay, actor: 'Otto', at: ago(10 * MIN), added: false });
});

test('never edited since it was added: who added it; or the trip\'s creation; or nothing when unknown', async () => {
    const l = await log();
    const added = l.save('Edie', ago(4 * DAY), { action: 'add', activity: { id: 'campfire', title: 'Campfire', date: '2026-11-26', placeId: 'home', participants: ['cedar'], order: 50 } });
    let last = l.result();
    assert.deepEqual(last.campfire, { id: added, actor: 'Edie', at: ago(4 * DAY), added: true });
    assert.equal(lastEditText(last.campfire, NOW), 'Added by Edie · 4 days ago');
    // Came with the trip and untouched: the entry that created the trip.
    assert.deepEqual(last['option-1'], { id: 1, actor: 'Seedy', at: ago(9 * DAY), added: true, withTrip: true });
    assert.equal(lastEditText(last['option-1'], NOW), 'Added with this trip by Seedy · on Nov 8');
    // Once edited, it is "Last edited", by the editor.
    const edit = l.save('Otto', ago(5 * MIN), { action: 'edit', activityId: 'campfire', patch: { time: 'Dusk' } });
    last = l.result();
    assert.equal(lastEditText(last.campfire, NOW), 'Last edited by Otto · 5 minutes ago');
    assert.equal(last.campfire.id, edit);
    // A trip whose log does not reach back to its creation: nothing is claimed.
    assert.deepEqual(lastEdits([], null, ['option-1']), {});
    assert.equal(lastEditText(undefined, NOW), '');
    assert.equal(lastEditHtml(null, 't1'), '');
    // A deleted activity is not reported, and another trip's log is not read.
    l.save('Otto', ago(MIN), { action: 'delete', activityId: 'campfire' });
    assert.ok(!('campfire' in l.result()));
    l.insert.run('t2', 2, 'u9', 'Stranger', ago(MIN), 'edit', 'x', JSON.stringify([{ kind: 'activity', id: 'option-1', before: { id: 'option-1', title: 'a' }, after: { id: 'option-1', title: 'b' }, rev: 2 }]));
    assert.equal(l.result()['option-1'].actor, 'Seedy');
});

test('an undo is the newest change to the activity it restores', async () => {
    const l = await log();
    l.save('Edie', ago(2 * HOUR), { action: 'edit', activityId: 'option-2', patch: { time: 'Late' } });
    const undo = l.save('Seedy', ago(HOUR), { action: 'edit', activityId: 'option-2', patch: { time: 'Morning' } });
    assert.deepEqual(l.result()['option-2'], { id: undo, actor: 'Seedy', at: ago(HOUR), added: false });
});

test('relative time reads naturally and falls back to the date', () => {
    const t = ms => relativeTime(ago(ms), NOW);
    assert.deepEqual([t(0), t(59000), t(MIN), t(45 * MIN), t(HOUR), t(23 * HOUR), t(DAY), t(47 * HOUR), t(2 * DAY), t(6 * DAY), t(7 * DAY)],
        ['just now', 'just now', '1 minute ago', '45 minutes ago', '1 hour ago', '23 hours ago', 'yesterday', 'yesterday', '2 days ago', '6 days ago', 'on Nov 10']);
    assert.equal(t(400 * DAY), 'on Oct 13, 2025');
    assert.equal(relativeTime('not a date', NOW), '');
    assert.equal(t(-5 * MIN), 'just now', 'a clock that is a little ahead does not print a negative time');
    assert.equal(lastEditText({ id: 3, actor: '', at: ago(HOUR), added: false }, NOW), 'Last edited · 1 hour ago', 'no name, no "by"');
});

test('the note links to that entry in History by address', () => {
    assert.equal(historyHref('trip 1', 42), '/?trip=trip%201&history=42');
    const html = lastEditHtml({ id: 42, actor: 'Edie <b>', at: ago(2 * HOUR), added: false }, 'abc', { now: NOW });
    assert.match(html, /^<a class="last-edit-link" href="\/\?trip=abc&amp;history=42" data-history-change="42" title="[^"]+">/);
    assert.ok(html.includes('Last edited by Edie &lt;b&gt; · 2 hours ago') && html.includes('see this change'));
    assert.ok(!html.includes('target='), 'in the view it opens in place');
    const inEditor = lastEditHtml({ id: 42, actor: 'Edie', at: ago(2 * HOUR), added: false }, 'abc', { now: NOW, newTab: true });
    assert.ok(inEditor.includes('target="_blank" rel="noopener"') && inEditor.includes('in a new tab'), 'in the editor it must not discard the draft');
});

test('History opens at the linked entry: from a click, from the address, after a reload, and with Back', () => {
    assert.match(planner, /history\.pushState\(null, '', historyHref\(state\.selected, changeId\)\);\s+await openHistory\('', changeId\);/);
    assert.match(planner, /load\(\)\.then\(\(\) => \{ const id = linkedChange\(\); if \(id !== null && state\.snapshot && state\.online\) return openHistory\('', id\); \}\)/, 'a pasted or reloaded address opens the entry');
    assert.match(planner, /<li class="history-entry" id="change-\$\{c\.id\}" tabindex="-1">/);
    assert.match(planner, /entry\.classList\.add\('linked'\);\s+entry\.querySelector\('details'\)\?\.setAttribute\('open', ''\);[\s\S]{0,200}entry\.scrollIntoView\(\{ block: 'center' \}\);\s+entry\.focus\(/);
    assert.match(planner, /if \(event\.target\.id === 'history-dialog' && linkedChange\(\) !== null\)\s+history\.replaceState\(null, '', state\.selected \? `\/\?trip=\$\{state\.selected\}` : '\/'\);/, 'closing History takes the entry out of the address');
    assert.match(planner, /window\.addEventListener\('popstate'/);
    assert.match(planner, /change && !change\.target && event\.button === 0 && !event\.metaKey && !event\.ctrlKey/, 'a new-tab click is left to the browser');
    assert.match(planner, /That change is not in this trip’s history/);
    // The server finds an entry older than the newest hundred, only within this trip.
    assert.match(route, /WHERE id=\? AND trip_id=\?"\)\.bind\(wanted, a\.row!\.id\)/);
    assert.match(css, /\.history-entry\.linked \{ outline: 3px solid var\(--magenta\)/);
    assert.match(planner, /The change you followed/, 'the highlight is also said in words');
});

test('the note sits in the activity view and the editor; cards get at most a small mark', () => {
    const t = thanksgivingExample(), a = t.activities[1];
    const view = activityViewHtml(a, t, { canEdit: true });
    assert.equal((view.match(/<p class="last-edit" id="view-last-edit" hidden><\/p>/g) || []).length, 1);
    assert.ok(view.indexOf('view-last-edit') > view.indexOf('class="view-body"') && view.indexOf('view-last-edit') < view.indexOf('class="dialog-actions"'), 'under the notes, above the buttons');
    assert.match(planner, /<p class="last-edit" id="edit-last-edit" hidden><\/p><p id="edit-message" role="alert">/);
    assert.match(planner, /fill\(\$\('#edit-last-edit'\), form\?\.dataset\.new === 'true' \? null : form\?\.dataset\.id, true\);/, 'not on a new activity; new tab from the editor');
    assert.ok(!board(t, {}).includes('edited-mark') && !board(t, {}).includes('Last edited'), 'the card markup itself is unchanged');
    assert.equal(recentlyEdited({ id: 1, at: ago(2 * HOUR), added: false }, NOW), true);
    assert.equal(recentlyEdited({ id: 1, at: ago(25 * HOUR), added: false }, NOW), false, 'only for a day');
    assert.equal(recentlyEdited({ id: 1, at: ago(2 * HOUR), added: true }, NOW), false, 'a newly added card is not "edited"');
    assert.equal(recentlyEdited(null, NOW), false);
    assert.match(planner, /<span class="edited-mark"><span aria-hidden="true">✎ <\/span>Edited<span class="sr-only"> recently: \$\{escape\(lastEditText\(entry\)\)\}<\/span><\/span>/, 'words, not colour alone');
});

test('it comes from the change log only: nothing new is stored', () => {
    assert.match(LAST_EDITS_SQL, /FROM planner_changes c, json_each\(c\.records\) r/);
    assert.ok(!/\b(INSERT|UPDATE|DELETE|ALTER|DROP)\b|CREATE TABLE/i.test(LAST_EDITS_SQL + TRIP_CREATED_SQL), 'read-only queries');
    assert.match(route, /params\.get\("last"\) === "activity"/);
    const t = thanksgivingExample();
    assert.ok(t.activities.every(a => !('updatedBy' in a) && !('lastEditedBy' in a) && !('editedAt' in a)), 'no per-activity copy of who and when');
    assert.match(planner, /lastEdits\.revision === state\.snapshot\.revision \? lastEdits\.map\[id\] \|\| null : null/, 'never shown for a plan newer than the answer');
    assert.match(LAST_EDITS_SQL, /c\.actor_name AS actor/, 'the display name is the one History already records');
});

test('guests see no note, no mark and no History, as today', () => {
    const t = thanksgivingExample(), shared = publicTrip(t), a = shared.activities[0] || { ...t.activities[0], sourceKind: 'entered' };
    const html = activityViewHtml(a, shared, { guest: true });
    assert.ok(!/last-edit|Last edited|Added by|history=/.test(html));
    assert.ok(!/last-edit|lastEdit|edited-mark|\/api\/history|history\.mjs/.test(guest), 'the guest page never asks for it and has no code to show it');
    assert.ok(!/actor|updatedBy|lastEdit/.test(JSON.stringify(shared)), 'the guest projection names no editor');
    // History, including this, is refused without trip membership: access() runs before anything is read.
    assert.match(route, /export async function GET\(request: Request\) \{ try \{\s+const a = await access\(request\);\s+if \(a\.error\)\s+return a\.error;\s+const params/);
    assert.ok(!/planner_changes|last-edits/.test(read('../app/api/shared/route.ts')));
    // The planner's own "preview what guests see" uses the guest view too.
    assert.match(planner, /showActivityView\(document, a, trip, \{ guest: preview, canEdit: !preview \}\);/);
});
