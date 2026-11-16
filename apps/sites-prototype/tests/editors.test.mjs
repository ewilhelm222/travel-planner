import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { thanksgivingExample, applyTripChange, canEdit, tripRole, editorList, editorEmail, editorRestriction, MAX_EDITORS } from '../lib/trips.mjs';
// Server routes decide access with these functions; scripts/check-access.mjs repeats the same cases over HTTP
// with three signed-in local accounts (organizer, editor, outsider) against the real database queries.
const organizer = { userId: 'org-id', email: 'organizer@example.invalid' };
const editor = { userId: 'ed-id', email: 'Editor@Example.invalid' };
const outsider = { userId: 'out-id', email: 'outsider@example.invalid' };
const row = (emails = ['editor@example.invalid']) => ({ owner_id: 'org-id', editor_emails: JSON.stringify(emails) });
const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('roles come from trip membership: organizer by account, editor by sign-in email', () => {
    assert.equal(tripRole(row(), organizer), 'organizer');
    assert.equal(tripRole(row(), editor), 'editor', 'email match ignores case');
    assert.equal(tripRole(row(['EDITOR@example.invalid']), editor), 'editor', 'a stored mixed-case address still matches');
    assert.equal(tripRole(row(), outsider), null);
    assert.equal(tripRole(row(), null), null);
    assert.equal(tripRole(null, organizer), null);
    assert.equal(tripRole(row(), { userId: 'other', email: 'organizer@example.invalid' }), null, 'sharing the organizer\'s email text is not ownership');
    assert.equal(tripRole({ owner_id: 'org-id', editor_emails: 'not json' }, editor), null, 'a damaged list grants nothing');
    assert.equal(tripRole({ owner_id: 'org-id', editor_emails: '{"editor@example.invalid":true}' }, editor), null);
});

test('a non-member cannot read or write; an editor can', () => {
    assert.equal(canEdit(row(), outsider), false);
    assert.equal(canEdit(row([]), editor), false);
    assert.equal(canEdit(row(), editor), true);
    assert.equal(canEdit(row(), organizer), true);
});

test('removing an editor revokes access', () => {
    const before = row(['editor@example.invalid', 'second@example.invalid']);
    assert.equal(canEdit(before, editor), true);
    const after = row(editorList(before).filter(e => e !== editorEmail(' EDITOR@example.invalid ')));
    assert.equal(canEdit(after, editor), false);
    assert.equal(canEdit(after, { userId: 's', email: 'second@example.invalid' }), true, 'other editors are unaffected');
});

test('an editor can add, edit, move and delete activities through the shared change path', () => {
    const trip = thanksgivingExample();
    const add = { action: 'add', activity: { id: 'by-editor', title: 'Added by an editor', date: trip.start, time: 'Noon', placeId: 'home', order: 99, participants: ['cedar'], notes: '', guestNotes: '', guestLocation: '', fixed: false, optional: true } };
    assert.equal(editorRestriction(trip, add), null);
    let next = applyTripChange(trip, add);
    assert.equal(next.activities.filter(a => a.id === 'by-editor').length, 1);
    for (const change of [{ action: 'edit', activityId: 'by-editor', patch: { title: 'Renamed' } }, { action: 'move', activityId: 'by-editor', date: trip.end }, { action: 'delete', activityId: 'by-editor' }]) {
        assert.equal(editorRestriction(next, change), null);
        next = applyTripChange(next, change);
    }
    assert.ok(!next.activities.some(a => a.id === 'by-editor'));
});

test('an editor cannot change which traveler names guests see', () => {
    const trip = { ...thanksgivingExample(), people: [{ id: 'p1', name: 'Synthetic person', familyId: null, showOnGuest: false }, { id: 'p2', name: 'Shown person', familyId: null, showOnGuest: true }] };
    const traveler = person => ({ action: 'traveler', person });
    assert.match(editorRestriction(trip, traveler({ id: 'p1', name: 'Synthetic person', showOnGuest: true })), /Only the organizer/);
    assert.match(editorRestriction(trip, traveler({ id: 'p2', name: 'Shown person', showOnGuest: false })), /Only the organizer/);
    assert.match(editorRestriction(trip, traveler({ id: 'new', name: 'New person', showOnGuest: true })), /Only the organizer/);
    assert.equal(editorRestriction(trip, traveler({ id: 'p1', name: 'Renamed', showOnGuest: false })), null);
    assert.equal(editorRestriction(trip, traveler({ id: 'p2', name: 'Renamed', showOnGuest: true })), null);
    assert.equal(editorRestriction(trip, traveler({ id: 'new', name: 'New person' })), null);
});

test('editor emails are validated and normalized', () => {
    assert.equal(editorEmail('  Friend@Example.INVALID '), 'friend@example.invalid');
    for (const bad of ['', 'friend', 'friend@', '@example.invalid', 'a@b', 'two@example.invalid, three@example.invalid', 'a b@example.invalid', null, 42, `${'x'.repeat(250)}@example.invalid`])
        assert.throws(() => editorEmail(bad), /complete email/);
    assert.ok(MAX_EDITORS >= 1);
});

test('the server refuses editors for sharing, the editor list and trip creation, and still checks revisions', async () => {
    const share = await source('app/api/share/route.ts'), editors = await source('app/api/editors/route.ts'), trips = await source('app/api/trips/route.ts'), trip = await source('app/api/trip/route.ts'), store = await source('lib/trip-store.ts');
    assert.match(store, /const role = tripRole\(r, user\);\s+if \(!r \|\| !role \|\| \(r\.archived_at && role !== "organizer"\)\)\s+return \{ error: response\(\{ error: "This trip is unavailable to this account\." \}, 403\) \}/, 'every trip request starts from membership');
    assert.equal(share.match(/if \(!a\.isOwner\)\s+return response\(\{ error: "Only the organizer manages sharing\." \}, 403\)/g).length, 2, 'reading and changing the guest link are organizer-only');
    assert.equal(editors.match(/if \(!a\.isOwner\)\s+return organizerOnly\(\)/g).length, 2, 'reading and changing the editor list are organizer-only');
    assert.match(editors, /organizerOnly = \(\) => response\(\{ error: "Only the organizer manages editors\." \}, 403\)/);
    assert.match(trips, /if \(!isCreator\(user\)\)\s+return response\(\{ error: "Only an organizer can create trips\." \}, 403\)/);
    const archive = await source('app/api/archive/route.ts'), history = await source('app/api/history/route.ts');
    assert.ok(!/export async function DELETE|DELETE FROM/i.test(share + editors + trips + trip + archive + history + store), 'no route erases a trip or its history');
    assert.match(archive, /if \(!a\.isOwner\)\s+return response\(\{ error: "Only the organizer can delete or restore a trip\." \}, 403\)/, 'archiving and restoring are organizer-only');
    assert.match(store, /return r\.revision === input\.revision \? null : conflict\(\)/, 'an older page is held to the trip-wide revision');
    assert.match(store, /return stale\.length \? response\(\{ error: staleMessage\(stale\), conflicts: stale \}, 409\) : null/, 'a stale record is a conflict for every role');
    assert.match(store, /guard = `id=\? AND revision=\? AND archived_at IS \$\{o\.archived \? "NOT NULL" : "NULL"\}`/, 'the save itself is conditional on the revision');
    assert.match(store, /UPDATE planner_trips SET .*WHERE \$\{guard\} RETURNING revision/);
    assert.ok(!/UPDATE planner_trips/.test(trip + share + archive + history), 'documents are only written through commit()');
    assert.ok(trip.indexOf('staleCheck(input, current)') > 0 && trip.indexOf('staleCheck(input, current)') < trip.indexOf('editorRestriction('), 'the revision check runs before role rules');
});

test('the planner offers Editors and Guest link only to the organizer', async () => {
    const script = await source('public/planner.js');
    assert.equal(script.match(/\$\{state\.isOwner \? `<button class="secondary" id="share"[^`]*id="editors"[^`]*` : ''\}/g).length, 2, 'phone and desktop layouts both gate the two buttons');
    assert.equal(script.match(/id="editors"/g).length, 2);
    assert.match(script, /No invitation or email is sent/);
});
