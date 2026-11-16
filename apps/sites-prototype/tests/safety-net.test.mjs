import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { thanksgivingExample, applyTripChange, normalizeTrip, editorDiffRestriction, publicTrip } from '../lib/trips.mjs';
import { diffTrips, summarize, undoChange, undoConflicts, fieldChanges } from '../public/history.mjs';
import { participantReferences } from '../public/participants.mjs';
const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
// What the server does for one saved change: apply it, and log the before/after of each changed record.
const save = (trip, change) => { const next = applyTripChange(trip, change); return { trip: next, records: diffTrips(trip, next), summary: summarize(change, diffTrips(trip, next)) }; };
const withPeople = () => {
    let trip = thanksgivingExample();
    trip = applyTripChange(trip, { action: 'traveler', person: { id: 'ana', name: 'Ana Synthetic', familyId: 'cedar' } });
    return applyTripChange(trip, { action: 'traveler', person: { id: 'ben', name: 'Ben Synthetic', familyId: null } });
};

test('the log records before and after for exactly the records a change touched', () => {
    const trip = thanksgivingExample();
    const edit = save(trip, { action: 'edit', activityId: 'option-2', patch: { time: '10:00', notes: 'Bring boots' } });
    assert.equal(edit.records.length, 1);
    assert.deepEqual([edit.records[0].kind, edit.records[0].id], ['activity', 'option-2']);
    assert.equal(edit.records[0].before.time, 'Morning');
    assert.equal(edit.records[0].after.time, '10:00');
    assert.deepEqual(fieldChanges(edit.records[0]).map(f => f.field).sort(), ['notes', 'time']);
    assert.match(edit.summary, /Changed activity “Neighborhood walk”/);
    const added = save(trip, { action: 'add', activity: { id: 'new-1', title: 'Pie run', date: '2026-11-26', participants: ['cedar'] } });
    assert.deepEqual(added.records.map(r => [r.id, r.before]), [['new-1', null]]);
    const removed = save(trip, { action: 'delete', activityId: 'option-3' });
    assert.deepEqual(removed.records.map(r => [r.id, r.after]), [['option-3', null]]);
    assert.match(removed.summary, /Deleted activity “Cook together”/);
    const meta = save(trip, { action: 'metadata', patch: { title: 'Renamed gathering' } });
    assert.deepEqual(meta.records.map(r => r.kind), ['trip']);
    assert.equal(meta.records[0].before.title, 'Thanksgiving, together');
    assert.deepEqual(diffTrips(trip, structuredClone(trip)), [], 'an unchanged trip logs no records');
});

test('undo restores one change when its records are untouched since', () => {
    const trip = thanksgivingExample();
    const edit = save(trip, { action: 'edit', activityId: 'option-2', patch: { title: 'Long walk', time: '10:00' } });
    const other = save(edit.trip, { action: 'edit', activityId: 'option-5', patch: { notes: 'Someone else, later' } });
    assert.deepEqual(undoConflicts(other.trip, edit.records), []);
    const undone = normalizeTrip(undoChange(other.trip, edit.records), trip.id);
    assert.equal(undone.activities.find(a => a.id === 'option-2').title, 'Neighborhood walk');
    assert.equal(undone.activities.find(a => a.id === 'option-5').notes, 'Someone else, later', 'a later edit to another card is kept');
});

test('undo is refused, and changes nothing, when the record was edited again', () => {
    const trip = thanksgivingExample();
    const edit = save(trip, { action: 'edit', activityId: 'option-2', patch: { time: '10:00' } });
    const later = save(edit.trip, { action: 'edit', activityId: 'option-2', patch: { notes: 'Edited again by someone else' } });
    const before = structuredClone(later.trip);
    assert.throws(() => undoChange(later.trip, edit.records), e => /“Neighborhood walk” has changed since this edit\. Nothing was changed\./.test(e.message) && e.conflicts.length === 1);
    assert.deepEqual(later.trip, before);
    // Undoing the newer edit first clears the way, one record restore at a time.
    const step = normalizeTrip(undoChange(later.trip, later.records), trip.id);
    assert.deepEqual(normalizeTrip(undoChange(step, edit.records), trip.id), trip);
});

test('undo brings back a deleted activity and removes an added one, unless they changed', () => {
    const trip = thanksgivingExample();
    const removed = save(trip, { action: 'delete', activityId: 'option-3' });
    assert.deepEqual(normalizeTrip(undoChange(removed.trip, removed.records), trip.id).activities.find(a => a.id === 'option-3'), trip.activities.find(a => a.id === 'option-3'));
    const added = save(trip, { action: 'add', activity: { id: 'new-1', title: 'Pie run', date: '2026-11-26', participants: ['cedar'] } });
    assert.ok(!undoChange(added.trip, added.records).activities.some(a => a.id === 'new-1'));
    const edited = applyTripChange(added.trip, { action: 'edit', activityId: 'new-1', patch: { notes: 'now with notes' } });
    assert.throws(() => undoChange(edited, added.records), /changed since/, 'an added card someone has since worked on is not deleted by undo');
    assert.throws(() => undoChange(trip, removed.records.map(r => ({ ...r, id: 'option-4', before: trip.activities[3] }))), /changed since/, 'undoing a delete never overwrites an existing record');
});

test('undoing a move restores the day and the order of the cards it renumbered', () => {
    const trip = thanksgivingExample();
    const move = save(trip, { action: 'move', activityId: 'option-2', date: '2026-11-27', beforeId: 'option-6' });
    assert.ok(move.records.length > 1, 'the cards whose position changed are logged too');
    assert.match(move.summary, /Moved “Neighborhood walk” from 2026-11-26 to 2026-11-27/);
    assert.deepEqual(normalizeTrip(undoChange(move.trip, move.records), trip.id), trip);
});

test('an undo is itself logged and can be undone', () => {
    const trip = thanksgivingExample();
    const edit = save(trip, { action: 'edit', activityId: 'option-2', patch: { time: '10:00' } });
    const undone = undoChange(edit.trip, edit.records), undoRecords = diffTrips(edit.trip, undone);
    assert.equal(summarize({ action: 'undo', summary: edit.summary }, undoRecords), `Undid: ${edit.summary}`);
    assert.deepEqual(undoChange(undone, undoRecords), edit.trip);
});

test('removing a traveler or group is refused while plans refer to them, until confirmed', () => {
    let trip = withPeople();
    trip = applyTripChange(trip, { action: 'edit', activityId: 'option-2', patch: { participants: ['ana', 'maple'] } });
    assert.equal(participantReferences(trip, 'ana').total, 1);
    assert.throws(() => applyTripChange(trip, { action: 'traveler-remove', personId: 'ana' }), e => /“Ana Synthetic” is still used by 1 activity/.test(e.message) && e.references.activities[0].id === 'option-2');
    const removed = save(trip, { action: 'traveler-remove', personId: 'ana', unassign: true });
    assert.ok(!removed.trip.people.some(p => p.id === 'ana'));
    assert.deepEqual(removed.trip.activities.find(a => a.id === 'option-2').participants, ['maple'], 'the plan stays; only the traveler is taken off it');
    assert.match(removed.summary, /Removed traveler “Ana Synthetic” and took them off 1 plan/);
    assert.deepEqual(normalizeTrip(undoChange(removed.trip, removed.records), trip.id), trip, 'undo restores the traveler and their assignment');
    // An unreferenced traveler needs no confirmation.
    assert.ok(!applyTripChange(trip, { action: 'traveler-remove', personId: 'ben' }).people.some(p => p.id === 'ben'));
    assert.throws(() => applyTripChange(trip, { action: 'traveler-remove', personId: 'nobody' }), /Traveler not found/);
});

test('removing a group checks plans, stays and members; the whole-trip group cannot be removed', () => {
    const trip = withPeople();
    const refs = participantReferences(trip, 'cedar');
    assert.equal(refs.activities.length, 12);
    assert.equal(refs.stays.length, 1);
    assert.deepEqual(refs.members.map(m => m.id), ['ana']);
    assert.throws(() => applyTripChange(trip, { action: 'family-remove', familyId: 'cedar' }), /still used by 12 activities, 1 stay, 1 traveler in this group/);
    const removed = applyTripChange(trip, { action: 'family-remove', familyId: 'cedar', unassign: true });
    assert.ok(!removed.families.some(g => g.id === 'cedar'));
    assert.equal(removed.people.find(p => p.id === 'ana').familyId, null, 'members stay on the trip without a group');
    assert.ok(removed.activities.every(a => !a.participants.includes('cedar')) && removed.activities.length === 12);
    const everyone = applyTripChange(trip, { action: 'family', family: { id: 'everyone', name: 'Everyone', color: 'green' } });
    assert.throws(() => applyTripChange(everyone, { action: 'family-remove', familyId: 'everyone', unassign: true }), /cannot be removed/);
});

test('an editor cannot use undo to change which names guests see', () => {
    const trip = withPeople();
    const shown = applyTripChange(trip, { action: 'traveler', person: { id: 'ana', name: 'Ana Synthetic', familyId: 'cedar', showOnGuest: true } });
    assert.match(editorDiffRestriction(shown, trip), /Only the organizer/);
    assert.equal(editorDiffRestriction(trip, applyTripChange(trip, { action: 'edit', activityId: 'option-1', patch: { notes: 'x' } })), null);
});

test('every write path appends its log row in the same batch as the trip update', async () => {
    const store = await source('lib/trip-store.ts');
    const batch = store.slice(store.indexOf('await db().batch'), store.indexOf('const saved = updated.results'));
    assert.match(batch, /INSERT INTO planner_changes .* FROM planner_trips WHERE \$\{guard\}/, 'the log row is only written when the revision still matches');
    assert.match(batch, /UPDATE planner_trips SET .* WHERE \$\{guard\} RETURNING revision/);
    assert.match(store, /const saved = await commit\(\{ \.\.\.change, id: current\.id, expected: current\.revision \}\)/, 'transact() writes only through commit()');
    for (const route of ['trip', 'share', 'archive', 'history'])
        assert.match(await source(`app/api/${route}/route.ts`), /await transact\(/, `${route} saves through transact()`);
    assert.match(await source('app/api/trips/route.ts'), /db\(\)\.batch\(\[\s+db\(\)\.prepare\("INSERT INTO planner_trips[\s\S]+INSERT INTO planner_changes/, 'creating a trip logs it in one batch');
    const migration = await source('drizzle/0002_change_log_and_archive.sql');
    assert.match(migration, /CREATE TABLE `planner_changes`/);
    assert.match(migration, /UNIQUE INDEX `planner_changes_trip_revision_unique` ON `planner_changes` \(`trip_id`,`revision`\)/, 'one log row per trip revision');
    assert.ok(!/DROP|DELETE/i.test(migration), 'the migration only adds; existing trips are untouched');
    const all = (await Promise.all(['lib/trip-store.ts', 'app/api/trip/route.ts', 'app/api/history/route.ts', 'app/api/archive/route.ts', 'app/api/share/route.ts', 'app/api/trips/route.ts'].map(source))).join('\n');
    assert.ok(!/(UPDATE|DELETE FROM) planner_changes/i.test(all), 'the log is append-only');
});

test('history, undo and archive are closed to guests; the guest projection carries no history', async () => {
    const history = await source('app/api/history/route.ts'), archive = await source('app/api/archive/route.ts'), shared = await source('app/api/shared/route.ts');
    assert.equal(history.match(/const a = await access\(request\);\s+if \(a\.error\)\s+return a\.error;/g).length, 2, 'reading history and undoing both require trip membership');
    assert.match(history, /editorDiffRestriction\(before, trip\)/);
    assert.match(archive, /access\(request, \{ archived: true \}\)/);
    assert.match(shared, /share_token_hash = \? AND archived_at IS NULL/, 'an archived trip has no guest view');
    assert.match(archive, /share_token_hash: null/, 'archiving switches the guest link off');
    assert.deepEqual(Object.keys(publicTrip(thanksgivingExample())).filter(k => /history|change|archiv/i.test(k)), []);
});

test('the planner offers History to members, and delete/restore only to the organizer', async () => {
    const script = await source('public/planner.js');
    assert.equal(script.match(/id="history"/g).length, 2, 'History is on the desktop toolbar and in the phone manage section');
    assert.match(script, /\$\('#trip-delete'\)\.hidden = !state\.isOwner/);
    assert.match(script, /data-remove-person=/);
    assert.match(script, /isWholeTripGroup\(g\) \? '' : `<button type="button" class="text-button danger" data-remove-family=/, 'the whole-trip group has no Remove button');
    assert.match(script, /unassign: refs\.total > 0/, 'removal is only forced after the references were shown and confirmed');
});
