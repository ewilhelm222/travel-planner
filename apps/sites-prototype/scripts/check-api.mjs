import assert from 'node:assert/strict';
const origin = process.argv[2] || 'http://127.0.0.1:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Only run against disposable loopback data.');
const anon = (path, extra = {}) => fetch(origin + path, { redirect: 'manual', ...extra });
assert.equal((await anon('/api/trips')).status, 401);
assert.equal((await anon('/api/trip?id=synthetic-trip', { headers: { 'oai-authenticated-user-id': 'local_seedy', 'oai-authenticated-user-email': 'seedy@sites.test' } })).status, 401, 'Forged headers must not establish identity.');
const login = await anon('/signin-with-chatgpt?return_to=/');
const cookie = login.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
assert.ok(cookie);
const req = (path, method = 'GET', body, extra = {}) => fetch(origin + path, { method, headers: { Cookie: cookie, Origin: origin, 'X-Waypoint-Participant-Model':'people-v1', ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
const create = await req('/api/trips', 'POST', { template: 'thanksgiving' });
assert.equal(create.status, 201, await create.clone().text());
const initial = await create.json(), id = initial.snapshot.trip.id, path = `/api/trip?id=${id}`;
const second = await (await req('/api/trips', 'POST', { template: 'thanksgiving' })).json();
assert.notEqual(id, second.snapshot.trip.id);
assert.equal((await req('/api/trip?id=nonexistent')).status, 403);
const a = initial.snapshot.trip.activities[0], edit = notes => ({ revision: 1, activityId: a.id, patch: { notes } });
const writes = await Promise.all([req(path, 'PATCH', edit('PRIVATE A')), req(path, 'PATCH', edit('PRIVATE B'))]);
assert.deepEqual(writes.map(r => r.status).sort(), [200, 409]);
const saved = await (await req(path)).json();
assert.equal(saved.snapshot.revision, 2);
assert.equal((await (await req(`/api/trip?id=${second.snapshot.trip.id}`)).json()).snapshot.revision, 1);
assert.equal((await req(path, 'PATCH', { revision: 2, activityId: a.id, patch: { notes: 'bad origin' } }, { Origin: 'https://example.invalid' })).status, 403);
assert.equal((await anon(path, { method: 'PATCH', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(edit('unauthorized')) })).status, 401);
const sharePath = `/api/share?id=${id}`;
assert.equal((await anon(sharePath, { method: 'POST' })).status, 401);
const enabled = await (await req(sharePath, 'POST', { revision: 2, action: 'rotate' })).json();
const token = new URL(enabled.url).hash.slice(1);
const guest = await anon('/api/shared', { headers: { Authorization: `Share ${token}` } });
assert.equal(guest.status, 200);
assert.match(guest.headers.get('Cache-Control'), /no-store/);
const data = await guest.json();
assert.ok(!JSON.stringify(data).includes('PRIVATE'));
assert.deepEqual(data.trip.activities, [], 'examples are never sent to guests');
assert.equal((await anon('/api/shared', { method: 'PATCH', headers: { Authorization: `Share ${token}`, Origin: origin, 'Content-Type': 'application/json' }, body: '{}' })).status, 405);
assert.equal((await anon(path, { method: 'PATCH', headers: { Authorization: `Share ${token}`, Origin: origin, 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
assert.equal((await anon('/api/shared', { headers: { Authorization: `Share ${'x'.repeat(43)}` } })).status, 404);
const rotated = await (await req(sharePath, 'POST', { revision: enabled.revision, action: 'rotate' })).json();
assert.equal((await anon('/api/shared', { headers: { Authorization: `Share ${token}` } })).status, 404);
const nextToken = new URL(rotated.url).hash.slice(1);
assert.equal((await anon('/api/shared', { headers: { Authorization: `Share ${nextToken}` } })).status, 200);
const revoked = await req(sharePath, 'POST', { revision: rotated.revision, action: 'revoke' });
assert.equal(revoked.status, 200);
assert.equal((await anon('/api/shared', { headers: { Authorization: `Share ${nextToken}` } })).status, 404);
assert.equal((await req(sharePath, 'POST', { revision: 1, action: 'rotate' })).status, 409);
console.log('PASS: multi-trip isolation, private APIs, forged identity rejection, atomic saves, private-field projection, guest write rejection, and share rotation/revocation.');

let current=(await (await req(path)).json()).snapshot;
let family=await req(path,'PATCH',{action:'family',revision:current.revision,family:{id:'api-family',name:'Test household',color:'blue'}});assert.equal(family.status,200);current=(await family.json()).snapshot;
let person=await req(path,'PATCH',{action:'traveler',revision:current.revision,person:{id:'api-person',name:'PRIVATE PERSON',familyId:'api-family'}});assert.equal(person.status,200);current=(await person.json()).snapshot;
const competing=await Promise.all(['api-second','api-third'].map(id=>req(path,'PATCH',{action:'traveler',revision:current.revision,person:{id,name:'Other synthetic traveler'}})));assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);current=(await (await req(path)).json()).snapshot;
const legacy=await req(path,'PATCH',{revision:current.revision,activityId:a.id,patch:{participants:[]}},{'X-Waypoint-Participant-Model':''});assert.equal(legacy.status,409,'An older client must not silently drop individual assignments.');
let assign=await req(path,'PATCH',{revision:current.revision,activityId:a.id,patch:{participants:['api-person']}});assert.equal(assign.status,200);current=(await assign.json()).snapshot;
const newLink=await(await req(sharePath,'POST',{action:'rotate',revision:current.revision})).json();const rosterToken=new URL(newLink.url).hash.slice(1);
const privateRoster=await(await anon('/api/shared',{headers:{Authorization:`Share ${rosterToken}`}})).json();assert.ok(!JSON.stringify(privateRoster).includes('PRIVATE PERSON'));assert.ok(!JSON.stringify(privateRoster).includes('api-person'));
let publishName=await req(path,'PATCH',{action:'traveler',revision:newLink.revision,person:{id:'api-person',name:'Public display name',familyId:'api-family',showOnGuest:true}});assert.equal(publishName.status,200);current=(await publishName.json()).snapshot;
const publicRoster=await(await anon('/api/shared',{headers:{Authorization:`Share ${rosterToken}`}})).json();assert.equal(publicRoster.trip.people.find(p=>p.id==='api-person').name,'Public display name');
assert.equal((await anon(path,{method:'PATCH',headers:{Origin:origin,'Content-Type':'application/json',Authorization:`Share ${rosterToken}`},body:JSON.stringify({action:'traveler',revision:current.revision,person:{id:'bad',name:'Bad'}})})).status,401);
await req(sharePath,'POST',{action:'revoke',revision:current.revision});
console.log('PASS: roster persistence, atomic roster conflicts, legacy-client protection, private/public names, and anonymous roster-write rejection.');
// Drag-and-drop moves use the same atomic revision check as every other edit.
const movePath = `/api/trip?id=${second.snapshot.trip.id}`, moveTrip = second.snapshot.trip;
const [m1, m2] = moveTrip.activities.filter(x => x.date === '2026-11-26');
const competingMoves = await Promise.all([req(movePath, 'PATCH', { action: 'move', revision: 1, activityId: m1.id, date: '2026-11-27' }), req(movePath, 'PATCH', { action: 'move', revision: 1, activityId: m2.id, date: null })]);
assert.deepEqual(competingMoves.map(r => r.status).sort(), [200, 409]);
const afterMove = (await (await req(movePath)).json()).snapshot;
assert.equal(afterMove.revision, 2);
assert.equal(afterMove.trip.activities.filter(x => x.id === m1.id || x.id === m2.id).length, 2, 'A move never duplicates a record.');
assert.equal((await req(movePath, 'PATCH', { action: 'move', revision: 1, activityId: m1.id, date: '2026-11-28' })).status, 409, 'A stale move is rejected, not overwritten.');
const fixedSetup = await (await req(movePath, 'PATCH', { action: 'edit', revision: 2, activityId: m1.id, patch: { fixed: true } })).json();
const fixedMove = await req(movePath, 'PATCH', { action: 'move', revision: fixedSetup.snapshot.revision, activityId: m1.id, date: '2026-11-28' });
assert.equal(fixedMove.status, 400);
assert.match((await fixedMove.json()).error, /fixed booking/);
assert.equal((await anon(movePath, { method: 'PATCH', headers: { Authorization: `Share ${nextToken}`, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'move', revision: 3, activityId: m1.id, date: null }) })).status, 401);
console.log('PASS: multi-trip isolation, private APIs, forged identity rejection, atomic saves, private-field projection, guest write rejection, share rotation/revocation, and revision-checked drag moves.');
// Safety net: every save is logged with before/after, undo is conditional, and delete is a reversible archive.
const safe = await (await req('/api/trips', 'POST', { template: 'thanksgiving' })).json(), safeId = safe.snapshot.trip.id;
const safePath = `/api/trip?id=${safeId}`, historyPath = `/api/history?id=${safeId}`, archivePath = `/api/archive?id=${safeId}`;
const history = async () => (await (await req(historyPath)).json()).changes;
assert.deepEqual((await history()).map(c => c.action), ['create']);
const race = await Promise.all(['A', 'B'].map(n => req(safePath, 'PATCH', { action: 'edit', revision: 1, activityId: 'option-2', patch: { notes: `PRIVATE ${n}` } })));
assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
let log = await history();
assert.deepEqual(log.map(c => c.revision), [2, 1], 'the rejected save wrote no log row');
assert.equal(log[0].records.length, 1);
assert.equal(log[0].records[0].before.notes, 'Synthetic example. Replace before the real gathering.');
assert.match(log[0].records[0].after.notes, /^PRIVATE [AB]$/);
assert.equal(log[0].actor, 'Seedy');
assert.equal(log[0].canUndo, true);
// A later edit to a different card does not block undo; a later edit to the same card does.
assert.equal((await req(safePath, 'PATCH', { action: 'edit', revision: 2, activityId: 'option-5', patch: { time: '18:00' } })).status, 200);
const undone = await req(historyPath, 'POST', { action: 'undo', changeId: log[0].id });
assert.equal(undone.status, 200, await undone.clone().text());
const undoneTrip = (await undone.json()).snapshot;
assert.equal(undoneTrip.revision, 4);
assert.equal(undoneTrip.trip.activities.find(x => x.id === 'option-2').notes, 'Synthetic example. Replace before the real gathering.');
assert.equal(undoneTrip.trip.activities.find(x => x.id === 'option-5').time, '18:00', 'undo leaves other records alone');
log = await history();
assert.deepEqual([log[0].action, log[0].undoes, log.find(c => c.revision === 2).wasUndone], ['undo', log.find(c => c.revision === 2).id, true]);
const timeEdit = log.find(c => c.revision === 3);
assert.equal((await req(safePath, 'PATCH', { action: 'edit', revision: 4, activityId: 'option-5', patch: { notes: 'edited again' } })).status, 200);
const refused = await req(historyPath, 'POST', { action: 'undo', changeId: timeEdit.id });
assert.equal(refused.status, 409);
assert.match((await refused.json()).error, /“Thanksgiving dinner” has changed since this edit\. Nothing was changed\./);
assert.equal((await (await req(safePath)).json()).snapshot.revision, 5, 'a refused undo writes nothing');
assert.equal((await history()).find(c => c.id === timeEdit.id).canUndo, false);
assert.equal((await req(`/api/history?id=${id}`, 'POST', { action: 'undo', changeId: timeEdit.id })).status, 404, 'a change cannot be undone through another trip');
assert.equal((await anon(historyPath)).status, 401);
assert.equal((await anon(historyPath, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'undo', changeId: timeEdit.id }) })).status, 401);
// Removing a group needs the references acknowledged.
const blocked = await req(safePath, 'PATCH', { action: 'family-remove', revision: 5, familyId: 'birch' });
assert.equal(blocked.status, 400);
assert.equal((await blocked.json()).references.activities.length, 12);
assert.equal((await req(safePath, 'PATCH', { action: 'family-remove', revision: 5, familyId: 'birch', unassign: true })).status, 200);
// Archive: organizer-only soft delete that also ends the guest link; restore brings everything back.
const link = await (await req(`/api/share?id=${safeId}`, 'POST', { action: 'rotate', revision: 6 })).json(), safeToken = new URL(link.url).hash.slice(1);
assert.equal((await anon('/api/shared', { headers: { Authorization: `Share ${safeToken}` } })).status, 200);
assert.equal((await req(archivePath, 'POST', { action: 'archive', revision: 1 })).status, 409, 'a stale page cannot delete a trip');
assert.equal((await anon(archivePath, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{"action":"archive"}' })).status, 401);
assert.equal((await req(archivePath, 'POST', { action: 'archive', revision: link.revision })).status, 200);
assert.equal((await anon('/api/shared', { headers: { Authorization: `Share ${safeToken}` } })).status, 404);
assert.equal((await req(safePath)).status, 410);
assert.equal((await req(safePath, 'PATCH', { action: 'edit', revision: link.revision + 1, activityId: 'option-2', patch: { notes: 'x' } })).status, 410, 'an archived trip cannot be edited');
let listing = await (await req('/api/trips')).json();
assert.ok(!listing.trips.some(t => t.id === safeId) && listing.archived.some(t => t.id === safeId));
assert.equal((await req(archivePath, 'POST', { action: 'restore' })).status, 200);
listing = await (await req('/api/trips')).json();
assert.ok(listing.trips.some(t => t.id === safeId) && !listing.archived.some(t => t.id === safeId));
const restored = await (await req(safePath)).json();
assert.equal(restored.snapshot.trip.activities.length, 12);
assert.equal((await anon('/api/shared', { headers: { Authorization: `Share ${safeToken}` } })).status, 404, 'restoring does not revive the old guest link');
assert.deepEqual((await history()).slice(0, 3).map(c => c.action), ['restore', 'archive', 'share']);
assert.ok(!JSON.stringify(await history()).includes(safeToken), 'the log never contains a guest token');
console.log('PASS: change log written atomically with each save, conditional undo and its conflict, reference-checked group removal, and reversible organizer-only trip archive.');
// Full backup and tested restore: download, damage the live trip, restore the backup as a new trip.
const { restoreFromSnapshot } = await import('../public/backup.mjs');
const backupRes = await req(`/api/backup?id=${safeId}`);
assert.equal(backupRes.status, 200);
const backup = JSON.parse(JSON.stringify(await backupRes.json()));
assert.equal((await anon(`/api/backup?id=${safeId}`)).status, 401);
assert.equal(backup.revision, restored.snapshot.revision);
assert.ok(backup.changes.length >= 8 && backup.changes[0].action === 'create');
assert.ok(!/sites\.test|share_token|owner_id/.test(JSON.stringify(backup)), 'a backup holds no emails, owner ids or link tokens');
assert.equal((await req(safePath, 'PATCH', { action: 'delete', revision: backup.revision, activityId: 'option-5' })).status, 200);
const reimport = await req('/api/trips', 'POST', { trip: await restoreFromSnapshot(backup) });
assert.equal(reimport.status, 201);
const copy = (await reimport.json()).snapshot.trip;
assert.notEqual(copy.id, safeId, 'a restore never overwrites the live trip');
assert.deepEqual({ ...copy, id: safeId }, backup.trip, 'the restored trip matches the backup record for record');
assert.ok(copy.activities.some(x => x.id === 'option-5'), 'the activity deleted after the backup is present in the restore');
backup.trip.activities[0].title = 'tampered';
await assert.rejects(restoreFromSnapshot(backup), /damaged or was edited/);
console.log('PASS: organizer full backup download and a verified restore into a separate trip.');
// Trip structure: places, stays and journeys save through the same revision check and are logged.
{
    const made = await (await req('/api/trips', 'POST', { template: 'thanksgiving' })).json(), sp = `/api/trip?id=${made.snapshot.trip.id}`;
    const step = async (change, expect = 200) => { const r = await req(sp, 'PATCH', change); assert.equal(r.status, expect, await r.clone().text()); return r.json(); };
    let rev = (await step({ action: 'place-add', revision: 1, place: { id: 'api-place', name: 'Synthetic lookout', localName: '示例' } })).snapshot.revision;
    assert.equal((await req(sp, 'PATCH', { action: 'stay-add', revision: 1, stay: { id: 'late', placeId: 'api-place', start: '2026-11-26', end: '2026-11-27', participants: ['cedar'] } })).status, 409, 'a stale structure save is a conflict');
    rev = (await step({ action: 'stay-add', revision: rev, stay: { id: 'api-stay', placeId: 'api-place', start: '2026-11-26', end: '2026-11-27', lodging: 'Synthetic hut', participants: ['cedar'] } })).snapshot.revision;
    rev = (await step({ action: 'leg-add', revision: rev, leg: { id: 'api-leg', title: 'Synthetic drive', date: '2026-11-26', mode: 'Car', from: 'home', to: 'api-place', participants: ['cedar'] } })).snapshot.revision;
    rev = (await step({ action: 'edit', revision: rev, activityId: 'option-2', patch: { placeId: 'api-place', address: 'PRIVATE ADDRESS', links: [{ label: 'Trail', url: 'https://example.com/PRIVATE-LINK' }] } })).snapshot.revision;
    const refusedDelete = await step({ action: 'place-delete', revision: rev, placeId: 'api-place' }, 400);
    assert.equal(refusedDelete.references.total, 3);
    assert.equal((await req(sp, 'PATCH', { action: 'edit', revision: rev, activityId: 'option-2', patch: { links: [{ url: 'javascript:alert(1)' }] } })).status, 400);
    const link2 = await (await req(`/api/share?id=${made.snapshot.trip.id}`, 'POST', { action: 'rotate', revision: rev })).json();
    const guestView = JSON.stringify(await (await anon('/api/shared', { headers: { Authorization: `Share ${new URL(link2.url).hash.slice(1)}` } })).json());
    assert.ok(!/PRIVATE|Synthetic hut|Synthetic drive|"links"/.test(guestView), 'address, links, lodging and journeys stay out of the guest view');
    const moved = await step({ action: 'place-delete', revision: link2.revision, placeId: 'api-place', reassignTo: 'home' });
    assert.ok(!moved.snapshot.trip.places.some(p => p.id === 'api-place'));
    assert.equal(moved.snapshot.trip.activities.find(x => x.id === 'option-2').placeId, 'home');
    assert.equal(moved.snapshot.trip.stays.find(x => x.id === 'api-stay').placeId, 'home');
    const entries = (await (await req(`/api/history?id=${made.snapshot.trip.id}`)).json()).changes;
    assert.equal(entries[0].records.length, 4, 'the place, the activity, the stay and the journey are all logged');
    const back = await req(`/api/history?id=${made.snapshot.trip.id}`, 'POST', { action: 'undo', changeId: entries[0].id });
    assert.equal(back.status, 200);
    assert.equal((await back.json()).snapshot.trip.activities.find(x => x.id === 'option-2').placeId, 'api-place', 'undo restores the place and every reference');
    assert.equal((await anon(sp, { method: 'PATCH', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'place-add', revision: 1, place: { id: 'x', name: 'x' } }) })).status, 401);
    console.log('PASS: place, stay and journey edits with revision checks, explicit place reassignment, private address/links, and undo of a place delete.');
}
// Per-record revisions: different cards save side by side; the same card still conflicts; older pages keep the strict rule.
{
    const made = await (await req('/api/trips', 'POST', { template: 'thanksgiving' })).json(), tid = made.snapshot.trip.id, tp = `/api/trip?id=${tid}`;
    assert.deepEqual(made.snapshot.revisions, {});
    const edit = (activityId, patch, base) => req(tp, 'PATCH', { action: 'edit', activityId, patch, base });
    // Eight planners save eight different cards at the same moment, all from the freshly loaded trip.
    const ids = ['option-1', 'option-2', 'option-3', 'option-4', 'option-5', 'option-6', 'option-7', 'option-8'];
    const together = await Promise.all(ids.map(x => edit(x, { notes: `note for ${x}` }, { [`activity:${x}`]: 1 })));
    assert.deepEqual(together.map(r => r.status), ids.map(() => 200), 'edits to different cards never conflict');
    let now = (await (await req(tp)).json()).snapshot;
    assert.equal(now.revision, 9, 'each save is its own version');
    for (const x of ids) {
        assert.equal(now.trip.activities.find(a => a.id === x).notes, `note for ${x}`, 'no save was lost');
        assert.equal(now.revisions[`activity:${x}`], 2);
    }
    assert.equal((await (await req(`/api/history?id=${tid}`)).json()).changes.length, 9, 'one log row per save');
    // Two planners save the same card at the same moment: exactly one wins.
    const same = await Promise.all(['A', 'B'].map(n => edit('option-9', { notes: n }, { 'activity:option-9': 1 })));
    assert.deepEqual(same.map(r => r.status).sort(), [200, 409]);
    const lost = await same.find(r => r.status === 409).json();
    assert.match(lost.error, /“Leftovers & a movie” was changed by another planner after you opened it/);
    assert.equal(lost.conflicts[0].key, 'activity:option-9');
    // A stale card is refused however long ago; an unrelated card opened at the same time is fine.
    assert.equal((await edit('option-1', { notes: 'stale' }, { 'activity:option-1': 1 })).status, 409);
    assert.equal((await edit('option-12', { notes: 'fine' }, { 'activity:option-12': 1 })).status, 200);
    assert.equal((await edit('option-12', { notes: 'x' }, { 'activity:option-12': 0 })).status, 400);
    assert.equal((await edit('option-12', { notes: 'x' }, 'nonsense')).status, 400);
    // An older page sends only the trip-wide revision and is held to the old all-or-nothing rule.
    assert.equal((await req(tp, 'PATCH', { action: 'edit', revision: 1, activityId: 'option-10', patch: { notes: 'old page' } })).status, 409);
    assert.equal((await req(tp, 'PATCH', { action: 'edit', activityId: 'option-10', patch: { notes: 'no revision at all' } })).status, 400);
    // Drag: neighbours are renumbered without a new revision, so their open forms still save.
    const dragged = await (await req(tp, 'PATCH', { action: 'move', activityId: 'option-3', date: '2026-11-27', beforeId: 'option-6', base: { 'activity:option-3': 2 } })).json();
    assert.equal(dragged.snapshot.revisions['activity:option-6'], 2);
    assert.equal(dragged.snapshot.revisions['activity:option-3'], 3);
    assert.equal((await edit('option-6', { title: 'Hike, renamed after the drag' }, { 'activity:option-6': 2 })).status, 200);
    // Guest link and trip delete have their own records.
    const sp2 = `/api/share?id=${tid}`, shareState = await (await req(sp2)).json();
    assert.equal(shareState.shareRevision, 1);
    const on = await req(sp2, 'POST', { action: 'rotate', base: { share: 1 } });
    assert.equal(on.status, 200, 'card edits do not block enabling the guest link');
    assert.equal((await req(sp2, 'POST', { action: 'rotate', base: { share: 1 } })).status, 409, 'a second organizer tab cannot silently replace the link');
    assert.equal((await req(sp2, 'POST', { action: 'revoke', base: { share: 2 } })).status, 200);
    assert.equal((await req(tp, 'PATCH', { action: 'metadata', patch: { subtitle: 'changed' }, base: { trip: 1 } })).status, 200);
    assert.equal((await req(`/api/archive?id=${tid}`, 'POST', { action: 'archive', base: { trip: 1 } })).status, 409, 'a page showing old trip details cannot delete the trip');
    assert.equal((await req(`/api/archive?id=${tid}`, 'POST', { action: 'archive', base: { trip: 2 } })).status, 200);
    console.log('PASS: per-record revisions: parallel saves to different cards, single winner on one card, strict rule for older pages, drag without neighbour conflicts, separate guest-link and trip records.');
}
// Stay move: confirmed activities shift with the stay; fixed and mixed ones cannot be moved this way; undo restores everything.
{
    const { parallelTripInput } = await import('../tests/fixtures/parallel-trip.mjs');
    const made = await (await req('/api/trips', 'POST', { trip: parallelTripInput() })).json(), tid = made.snapshot.trip.id, tp = `/api/trip?id=${tid}`;
    const move = (shiftActivityIds, base) => req(tp, 'PATCH', { action: 'stay-move', stayId: 'cedar-kyoto', days: 1, shiftActivityIds, base });
    for (const blocked of ['shared-dinner', 'shared-walk', 'museum'])
        assert.equal((await move([blocked], { 'stay:cedar-kyoto': 1 })).status, 400, `${blocked} must not move with Cedar's stay`);
    // Another planner makes the garden a fixed booking after the preview: the confirmed move is refused by its base revision.
    assert.equal((await req(tp, 'PATCH', { action: 'edit', activityId: 'solo-garden', patch: { fixed: true }, base: { 'activity:solo-garden': 1 } })).status, 200);
    assert.equal((await move(['solo-garden', 'cedar-arrival'], { 'stay:cedar-kyoto': 1, 'activity:solo-garden': 1, 'activity:cedar-arrival': 1 })).status, 409);
    assert.equal((await move(['solo-garden'], { 'stay:cedar-kyoto': 1, 'activity:solo-garden': 2 })).status, 400, 'and by the rules even with a fresh revision');
    const ok = await move(['cedar-arrival', 'cy-only'], { 'stay:cedar-kyoto': 1, 'activity:cedar-arrival': 1, 'activity:cy-only': 1 });
    assert.equal(ok.status, 200, await ok.clone().text());
    const after = (await ok.json()).snapshot;
    assert.deepEqual([after.trip.stays[0].start, after.trip.stays[0].end], ['2027-04-13', '2027-04-15']);
    assert.equal(after.trip.activities.find(x => x.id === 'cedar-arrival').date, '2027-04-13');
    assert.equal(after.trip.activities.find(x => x.id === 'solo-garden').date, '2027-04-13', 'the fixed booking stayed');
    assert.equal(after.trip.activities.find(x => x.id === 'museum').date, '2027-04-13');
    assert.deepEqual(after.trip.stays.slice(1).map(x => x.start), ['2027-04-13', '2027-04-13', '2027-04-14'], 'other stays untouched');
    const entry = (await (await req(`/api/history?id=${tid}`)).json()).changes[0];
    assert.match(entry.summary, /Moved a stay 1 day later .* with 2 flexible activities/);
    assert.equal(entry.records.length, 3);
    const undone2 = await (await req(`/api/history?id=${tid}`, 'POST', { action: 'undo', changeId: entry.id })).json();
    assert.equal(undone2.snapshot.trip.stays[0].start, '2027-04-12');
    assert.equal(undone2.snapshot.trip.activities.find(x => x.id === 'cy-only').date, '2027-04-13');
    assert.equal(undone2.snapshot.trip.activities.find(x => x.id === 'cedar-arrival').date, '2027-04-12');
    console.log('PASS: stay move shifts only confirmed flexible activities, refuses fixed/mixed/stale ones, and undoes as one step.');
}
// Maps: place locations are validated and stored as entered; guests never receive them.
{
    const made = await (await req('/api/trips', 'POST', { template: 'thanksgiving' })).json(), tid = made.snapshot.trip.id, tp = `/api/trip?id=${tid}`;
    const edit = (patch, base = { 'place:home': 1 }) => req(tp, 'PATCH', { action: 'place-edit', placeId: 'home', patch, base });
    assert.equal((await edit({ lat: '45.5', lng: '-122.6' })).status, 400, 'coordinates need an explicit system');
    assert.equal((await edit({ lat: '45.5', lng: '-122.6', coordSystem: 'GCJ02', amapUrl: 'https://example.com/not-amap' })).status, 400);
    const ok = await edit({ lat: '45.5', lng: '-122.6', coordSystem: 'GCJ02', coordSource: 'PRIVATE SOURCE', amapUrl: 'https://surl.amap.com/PRIVATE', navReviewed: true });
    assert.equal(ok.status, 200, await ok.clone().text());
    const home = (await ok.json()).snapshot.trip.places[0];
    assert.deepEqual([home.lat, home.lng, home.coordSystem, home.navReviewed], [45.5, -122.6, 'GCJ02', true], 'stored exactly as entered, never converted');
    const shareOn = await (await req(`/api/share?id=${tid}`, 'POST', { action: 'rotate', base: { share: 1 } })).json();
    const guestMap = JSON.stringify(await (await anon('/api/shared', { headers: { Authorization: `Share ${new URL(shareOn.url).hash.slice(1)}` } })).json());
    assert.ok(!/45\.5|GCJ02|PRIVATE|amap/.test(guestMap), 'coordinates, their source and map links are not in the guest view');
    console.log('PASS: place coordinates need an explicit system, map links must be on the provider\'s site, and none of it reaches guests.');
}

// Guest projection of an entered plan: guest description only, never private notes; examples are left out.
{
    const made = await (await req('/api/trips', 'POST', { template: 'thanksgiving' })).json(), tid = made.snapshot.trip.id, t = `/api/trip?id=${tid}`;
    const added = await req(t, 'PATCH', { action: 'add', revision: 1, activity: { id: 'api-entered', title: 'Entered plan', date: '2026-11-27', time: 'Morning', placeId: 'home', order: 99, participants: ['cedar'], notes: 'PRIVATE entered note', address: 'PRIVATE entered address', guestNotes: 'Shown to guests', guestLocation: 'Front gate', fixed: false, optional: true, sourceKind: 'entered' } });
    assert.equal(added.status, 200, await added.clone().text());
    const on = await (await req(`/api/share?id=${tid}`, 'POST', { revision: 2, action: 'rotate' })).json();
    const shown = await (await anon('/api/shared', { headers: { Authorization: `Share ${new URL(on.url).hash.slice(1)}` } })).json();
    assert.deepEqual(shown.trip.activities.map(x => x.id), ['api-entered'], 'only the entered plan is shared; the examples are not');
    assert.equal(shown.trip.activities[0].notes, 'Shown to guests');
    assert.equal(shown.trip.activities[0].address, 'Front gate');
    assert.ok(!JSON.stringify(shown).includes('PRIVATE'));
    console.log('PASS: guests receive entered plans with guest fields only, and no examples.');
}
