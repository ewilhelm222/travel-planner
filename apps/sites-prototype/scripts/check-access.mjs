import assert from 'node:assert/strict';
// Trip-membership checks against a disposable local dev server with synthetic data.
// Usage: node scripts/check-access.mjs [origin]. Needs PLANNER_CREATOR_EMAILS=seedy@sites.test in .dev.vars.
// Seedy is the configured organizer; Edie becomes an editor; Otto is signed in but never a member.
const origin = process.argv[2] || 'http://127.0.0.1:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Only run against disposable loopback data.');
const anon = (path, extra = {}) => fetch(origin + path, { redirect: 'manual', ...extra });
async function signIn(who) {
    const login = await anon(`/signin-with-chatgpt?return_to=/${who ? `&local_user=${who}` : ''}`);
    const cookie = login.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
    assert.ok(cookie);
    return (path, method = 'GET', body, extra = {}) => fetch(origin + path, { method, headers: { Cookie: cookie, Origin: origin, 'X-Waypoint-Participant-Model': 'people-v1', ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
const seedy = await signIn(), edie = await signIn('edie'), otto = await signIn('otto');
const json = async r => r.json();
const created = await seedy('/api/trips', 'POST', { template: 'thanksgiving' });
assert.equal(created.status, 201, await created.clone().text());
const id = (await json(created)).snapshot.trip.id, trip = `/api/trip?id=${id}`, editors = `/api/editors?id=${id}`, share = `/api/share?id=${id}`;
const activity = (n, extra = {}) => ({ id: `access-${n}`, title: `Synthetic access check ${n}`, date: '2026-11-27', time: 'Afternoon', placeId: 'home', order: 50, participants: ['cedar'], notes: '', guestNotes: '', guestLocation: '', fixed: false, optional: true, sourceKind: 'synthetic', ...extra });
const listed = async who => (await json(await who('/api/trips'))).trips.find(t => t.id === id);

// Signed in is not enough: before being added, Edie has no access at all.
for (const who of [edie, otto]) {
    assert.equal((await who(trip)).status, 403, 'a non-member cannot read');
    assert.equal((await who(trip, 'PATCH', { action: 'add', revision: 1, activity: activity('denied') })).status, 403, 'a non-member cannot write');
    assert.equal(await listed(who), undefined, 'a non-member does not see the trip listed');
}
assert.equal((await json(await edie('/api/trips'))).canCreate, false);

// The organizer manages the list. Nothing is emailed; the address is only stored.
assert.deepEqual((await json(await seedy(editors))).editors, []);
assert.equal((await anon(editors)).status, 401);
assert.equal((await seedy(editors, 'POST', { action: 'add', email: 'not-an-email' })).status, 400);
assert.equal((await seedy(editors, 'POST', { action: 'add', email: 'seedy@sites.test' })).status, 400, 'the organizer is not also an editor');
assert.equal((await seedy(editors, 'POST', { action: 'add', email: 'edie@sites.test' }, { Origin: 'https://example.invalid' })).status, 403, 'cross-site requests cannot change editors');
const added = await seedy(editors, 'POST', { action: 'add', email: ' Edie@Sites.Test ' });
assert.equal(added.status, 200, await added.clone().text());
assert.deepEqual((await json(added)).editors, ['edie@sites.test'], 'addresses are stored trimmed and lower-case');
assert.deepEqual((await json(await seedy(editors, 'POST', { action: 'add', email: 'edie@sites.test' }))).editors, ['edie@sites.test'], 'adding twice keeps one entry');
assert.equal((await json(await seedy(trip))).snapshot.revision, 1, 'changing editors does not disturb the saved plan');

// An editor can open the trip and add, edit, move and delete activities through the revisioned save path.
assert.equal((await listed(edie)).role, 'editor');
const opened = await edie(trip);
assert.equal(opened.status, 200);
const view = await json(opened);
assert.equal(view.isOwner, false);
assert.equal(view.role, 'editor');
assert.ok(!JSON.stringify(view).includes('sites.test'), 'the trip response carries no editor or organizer emails');
let saved = await edie(trip, 'PATCH', { action: 'add', revision: 1, activity: activity(1) });
assert.equal(saved.status, 200, await saved.clone().text());
saved = await json(saved);
assert.equal(saved.snapshot.revision, 2);
assert.equal(saved.snapshot.updatedBy, 'Edie');
assert.ok(saved.snapshot.trip.activities.some(a => a.id === 'access-1'), 'editor can add an activity');
assert.ok((await json(await seedy(trip))).snapshot.trip.activities.some(a => a.id === 'access-1'), 'the organizer sees the editor\'s activity');
saved = await json(await edie(trip, 'PATCH', { action: 'edit', revision: 2, activityId: 'access-1', patch: { title: 'Edited by an editor', time: 'Evening' } }));
assert.equal(saved.snapshot.trip.activities.find(a => a.id === 'access-1').title, 'Edited by an editor');
saved = await json(await edie(trip, 'PATCH', { action: 'move', revision: 3, activityId: 'access-1', date: '2026-11-28' }));
assert.equal(saved.snapshot.trip.activities.find(a => a.id === 'access-1').date, '2026-11-28');

// Stale revisions still conflict, whoever saves.
assert.equal((await edie(trip, 'PATCH', { action: 'add', revision: 2, activity: activity(2) })).status, 409, 'a stale editor save is rejected');
const race = await Promise.all([seedy(trip, 'PATCH', { action: 'add', revision: 4, activity: activity(3) }), edie(trip, 'PATCH', { action: 'add', revision: 4, activity: activity(4) })]);
assert.deepEqual(race.map(r => r.status).sort(), [200, 409], 'organizer and editor saving the same revision: exactly one wins');
const afterRace = (await json(await seedy(trip))).snapshot;
assert.equal(afterRace.revision, 5);
assert.equal(afterRace.trip.activities.filter(a => ['access-3', 'access-4'].includes(a.id)).length, 1);
saved = await edie(trip, 'PATCH', { action: 'delete', revision: 5, activityId: 'access-1' });
assert.equal(saved.status, 200);
assert.ok(!(await json(saved)).snapshot.trip.activities.some(a => a.id === 'access-1'));

// Organizer-only: guest link, editor list, guest-name visibility, creating/importing, deleting.
assert.equal((await edie(share)).status, 403);
assert.equal((await edie(share, 'POST', { action: 'rotate', revision: 6 })).status, 403, 'an editor cannot enable a guest link');
assert.equal((await edie(share, 'POST', { action: 'revoke', revision: 6 })).status, 403);
assert.equal((await edie(editors)).status, 403, 'an editor cannot see the editor list');
assert.equal((await edie(editors, 'POST', { action: 'add', email: 'otto@sites.test' })).status, 403, 'an editor cannot add editors');
assert.equal((await edie(editors, 'POST', { action: 'remove', email: 'edie@sites.test' })).status, 403);
assert.equal((await otto(trip)).status, 403, 'a refused add grants nothing');
assert.equal((await edie('/api/trips', 'POST', { template: 'thanksgiving' })).status, 403, 'an editor cannot create a trip');
assert.equal((await edie('/api/trips', 'POST', { trip: afterRace.trip })).status, 403, 'an editor cannot import a trip');
assert.ok([404, 405].includes((await edie(trip, 'DELETE')).status), 'there is no delete-trip operation');
assert.equal((await edie(trip, 'PATCH', { action: 'traveler', revision: 6, person: { id: 'access-person', name: 'Synthetic traveler', familyId: null, showOnGuest: true } })).status, 400, 'an editor cannot publish a traveler name to guests');
assert.equal((await edie(trip, 'PATCH', { action: 'traveler', revision: 6, person: { id: 'access-person', name: 'Synthetic traveler', familyId: null, showOnGuest: false } })).status, 200);
const state = await json(await seedy(share));
assert.equal(state.enabled, false, 'sharing is still off');
assert.equal(state.revision, 7);
assert.deepEqual((await json(await seedy(editors))).editors, ['edie@sites.test']);

// Removing an editor revokes access immediately.
assert.deepEqual((await json(await seedy(editors, 'POST', { action: 'remove', email: 'EDIE@sites.test' }))).editors, []);
assert.equal((await edie(trip)).status, 403, 'a removed editor cannot read');
assert.equal((await edie(trip, 'PATCH', { action: 'add', revision: 7, activity: activity(5) })).status, 403, 'a removed editor cannot write');
assert.equal(await listed(edie), undefined);
assert.equal((await json(await seedy(trip))).snapshot.revision, 7, 'nothing changed after removal');
console.log('PASS: editors add/edit/move/delete through revisioned saves; non-members and removed editors are refused; sharing, the editor list, guest-name visibility and trip creation stay organizer-only; stale revisions conflict.');
// Safety net: editors may read history and undo ordinary edits; deleting and restoring a trip stay with the organizer.
{
    const made = await json(await seedy('/api/trips', 'POST', { template: 'thanksgiving' })), tid = made.snapshot.trip.id;
    const t = `/api/trip?id=${tid}`, h = `/api/history?id=${tid}`, ar = `/api/archive?id=${tid}`;
    assert.equal((await edie(h)).status, 403, 'a non-member cannot read history');
    await seedy(`/api/editors?id=${tid}`, 'POST', { action: 'add', email: 'edie@sites.test' });
    assert.equal((await seedy(t, 'PATCH', { action: 'edit', revision: 1, activityId: 'option-2', patch: { time: '10:00' } })).status, 200);
    const changes = (await json(await edie(h))).changes;
    assert.equal(changes[0].actor, 'Seedy');
    assert.ok(!JSON.stringify(changes).includes('sites.test'), 'history shows display names, never emails');
    assert.equal((await otto(h)).status, 403);
    assert.equal((await otto(h, 'POST', { action: 'undo', changeId: changes[0].id })).status, 403, 'a non-member cannot undo');
    const undo = await edie(h, 'POST', { action: 'undo', changeId: changes[0].id });
    assert.equal(undo.status, 200, 'an editor can undo an ordinary edit');
    let rev = (await json(undo)).snapshot.revision;
    // The organizer publishes a name; an editor cannot reverse that choice through undo.
    rev = (await json(await seedy(t, 'PATCH', { action: 'traveler', revision: rev, person: { id: 'undo-person', name: 'Synthetic traveler' } }))).snapshot.revision;
    rev = (await json(await seedy(t, 'PATCH', { action: 'traveler', revision: rev, person: { id: 'undo-person', name: 'Synthetic traveler', showOnGuest: true } }))).snapshot.revision;
    const publish = (await json(await edie(h))).changes[0];
    assert.equal((await edie(h, 'POST', { action: 'undo', changeId: publish.id })).status, 403, 'guest-name visibility stays with the organizer');
    assert.equal((await edie(ar, 'POST', { action: 'archive', revision: rev })).status, 403, 'an editor cannot delete a trip');
    assert.equal((await otto(ar, 'POST', { action: 'archive', revision: rev })).status, 403);
    assert.equal((await seedy(ar, 'POST', { action: 'archive', revision: rev })).status, 200);
    assert.equal((await edie(t)).status, 403, 'an archived trip is closed to its editors');
    assert.equal((await edie(ar, 'POST', { action: 'restore' })).status, 403, 'an editor cannot restore a trip');
    assert.equal((await json(await edie('/api/trips'))).archived.length, 0, 'editors do not see the organizer\'s archive');
    assert.equal((await seedy(ar, 'POST', { action: 'restore' })).status, 200);
    assert.equal((await edie(t)).status, 200, 'restoring keeps the editor list');
    console.log('PASS: history and undo follow trip membership and the guest-name rule; delete and restore are organizer-only.');
}
// Per-record revisions across two accounts: organizer and editor save different cards at once; the same card still has one winner.
{
    const made = await json(await seedy('/api/trips', 'POST', { template: 'thanksgiving' })), tid = made.snapshot.trip.id, t = `/api/trip?id=${tid}`;
    await seedy(`/api/editors?id=${tid}`, 'POST', { action: 'add', email: 'edie@sites.test' });
    const edit = (who, activityId, notes) => who(t, 'PATCH', { action: 'edit', activityId, patch: { notes }, base: { [`activity:${activityId}`]: 1 } });
    const apart = await Promise.all([edit(seedy, 'option-1', 'organizer'), edit(edie, 'option-2', 'editor')]);
    assert.deepEqual(apart.map(r => r.status), [200, 200], 'organizer and editor on different cards both save');
    const after = (await json(await seedy(t))).snapshot.trip.activities;
    assert.deepEqual([after.find(a => a.id === 'option-1').notes, after.find(a => a.id === 'option-2').notes], ['organizer', 'editor']);
    const clash = await Promise.all([edit(seedy, 'option-3', 'organizer'), edit(edie, 'option-3', 'editor')]);
    assert.deepEqual(clash.map(r => r.status).sort(), [200, 409], 'the same card has exactly one winner');
    assert.equal((await edit(otto, 'option-4', 'outsider')).status, 403, 'per-record saves still require membership');
    console.log('PASS: organizer and editor save different cards concurrently; one winner on the same card; non-members refused.');
}
// Decided November 16: trip details are the organizer's; guest text on an activity is open to editors.
{
    const made = await json(await seedy('/api/trips', 'POST', { template: 'thanksgiving' })), tid = made.snapshot.trip.id, t = `/api/trip?id=${tid}`, h = `/api/history?id=${tid}`;
    await seedy(`/api/editors?id=${tid}`, 'POST', { action: 'add', email: 'edie@sites.test' });
    for (const patch of [{ title: 'Editor rename' }, { end: '2026-11-30' }, { subtitle: 'x' }, { timezone: 'Asia/Tokyo' }]) {
        const refused = await edie(t, 'PATCH', { action: 'metadata', patch, base: { trip: 1 } });
        assert.equal(refused.status, 400);
        assert.match((await json(refused)).error, /Only the organizer changes the trip's name/);
    }
    assert.equal((await edie(t, 'PATCH', { action: 'edit', activityId: 'option-2', patch: { guestNotes: 'Bring boots', guestLocation: 'Front gate' }, base: { 'activity:option-2': 1 } })).status, 200, 'an editor may write guest text on an activity');
    assert.equal((await seedy(t, 'PATCH', { action: 'metadata', patch: { title: 'Organizer rename' }, base: { trip: 1 } })).status, 200);
    const rename = (await json(await edie(h))).changes[0];
    assert.equal((await edie(h, 'POST', { action: 'undo', changeId: rename.id })).status, 403, 'an editor cannot undo the organizer\'s rename');
    assert.equal((await json(await seedy(t))).snapshot.trip.title, 'Organizer rename');
    console.log('PASS: editors are refused trip name/date/time-zone changes (directly and through undo) and may write guest descriptions.');
}
