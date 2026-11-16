import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { thanksgivingExample, applyTripChange, normalizeTrip } from '../lib/trips.mjs';
import { diffTrips, summarize } from '../public/history.mjs';
import { buildSnapshot, verifySnapshot, restoreFromSnapshot, expiredSnapshots, isSnapshot, SNAPSHOT_FORMAT } from '../public/backup.mjs';
const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
async function sample() {
    const first = thanksgivingExample(), change = { action: 'edit', activityId: 'option-2', patch: { notes: 'Synthetic private note 北京' } };
    const trip = applyTripChange(first, change), records = diffTrips(first, trip);
    return buildSnapshot({ trip, revision: 2, updatedAt: '2026-11-16T10:00:00.000Z', updatedBy: 'Synthetic organizer', changes: [{ id: 1, revision: 2, actor: 'Synthetic organizer', at: '2026-11-16T10:00:00.000Z', action: 'edit', summary: summarize(change, records), records, undoes: null }] }, '2026-11-16T12:00:00.000Z');
}

test('a full snapshot holds the whole trip, its revision and its change log, and verifies', async () => {
    const snapshot = await sample();
    assert.equal(snapshot.format, SNAPSHOT_FORMAT);
    assert.equal(snapshot.revision, 2);
    assert.equal(snapshot.trip.activities.length, 12);
    assert.equal(snapshot.changes[0].records[0].before.notes, 'Synthetic example. Replace before the real gathering.');
    assert.match(snapshot.sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(await verifySnapshot(JSON.parse(JSON.stringify(snapshot))), snapshot);
    assert.ok(!/editor|owner|token|@/i.test(JSON.stringify({ ...snapshot, trip: null, changes: null })), 'no emails, owner identity or guest-link token fields');
});

test('restore: a snapshot written to a file and read back reproduces the trip exactly', async () => {
    const snapshot = await sample();
    const file = JSON.stringify(snapshot, null, 2);
    const restored = await restoreFromSnapshot(JSON.parse(file));
    assert.deepEqual(restored, snapshot.trip);
    // The import path re-validates and assigns a new trip id; everything else is identical.
    const imported = normalizeTrip(restored, 'new-trip-id');
    assert.deepEqual({ ...imported, id: snapshot.trip.id }, snapshot.trip);
    assert.equal(imported.activities.find(a => a.id === 'option-2').notes, 'Synthetic private note 北京');
});

test('a damaged, edited, truncated or foreign file is refused before anything is restored', async () => {
    const snapshot = await sample();
    const edited = structuredClone(snapshot);
    edited.trip.activities[0].title = 'Quietly altered';
    await assert.rejects(restoreFromSnapshot(edited), /damaged or was edited/);
    const truncated = structuredClone(snapshot);
    truncated.trip.activities.pop();
    await assert.rejects(restoreFromSnapshot(truncated), /damaged or was edited/);
    await assert.rejects(restoreFromSnapshot({ ...snapshot, changes: [] }), /damaged or was edited/);
    await assert.rejects(restoreFromSnapshot({ ...snapshot, version: 99 }), /format version 99/);
    await assert.rejects(restoreFromSnapshot({ schemaVersion: 2, trip: snapshot.trip }), /not a Waypoint full-trip backup/);
    assert.equal(isSnapshot({ schemaVersion: 2, trip: snapshot.trip }), false, 'an ordinary JSON export still imports the ordinary way');
    await assert.rejects(buildSnapshot({ trip: null }), /no trip to back up/);
});

test('the proposed 30-day retention keeps recent daily snapshots and never touches other files', () => {
    const names = ['trip-a/2026-10-01.json', 'trip-a/2026-10-17.json', 'trip-a/2026-10-18.json', 'trip-a/2026-11-16.json', 'trip-b/2026-09-30.json', 'trip-a/manual-note.txt', 'trip-a/latest.json'];
    assert.deepEqual(expiredSnapshots(names, '2026-11-16'), ['trip-a/2026-10-01.json', 'trip-b/2026-09-30.json']);
    assert.deepEqual(expiredSnapshots(names, '2026-11-16', 7).length, 4);
});

test('the full backup is an organizer-only manual download, and no schedule exists', async () => {
    const route = await source('app/api/backup/route.ts');
    assert.match(route, /if \(!a\.isOwner\)\s+return response\(\{ error: "Only the organizer downloads a full backup\." \}, 403\)/);
    assert.ok(!/export async function (POST|PUT|PATCH|DELETE)/.test(route), 'the backup route only reads');
    assert.ok(!/editor_emails|owner_id|share_token_hash/.test(route));
    const worker = await source('worker/index.ts');
    assert.ok(!/scheduled\s*\(/.test(worker), 'no cron handler has been added');
    assert.equal(JSON.parse(await source('.openai/hosting.json')).r2, null, 'no object storage has been attached');
    const script = await source('public/planner.js');
    assert.match(script, /state\.isOwner \? '<button type="button" class="secondary" id="full-backup">/);
    assert.match(script, /isSnapshot\(parsed\) \? restoreFromSnapshot\(parsed\)/, 'importing a backup verifies its checksum first');
});
