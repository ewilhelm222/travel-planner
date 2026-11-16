import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { thanksgivingExample, applyTripChange, publicTrip, editorRestriction, editorDiffRestriction, STAY_GUEST_RULE } from '../lib/trips.mjs';
import { board } from '../public/board.mjs';
import { diffTrips } from '../public/history.mjs';
import { buildOfflineHtml } from '../public/offline-export.mjs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const withInfo = (extra = {}) => applyTripChange(thanksgivingExample(), { action: 'stay-edit', stayId: 'shared-base', patch: { groupInfo: 'Bring boots. Laundry in the barn.', checkOutTime: 'by 10:00', note: 'PRIVATE door code 4711', lodging: 'Hill House', ...extra } });

test('a stay keeps text for the group apart from its private note; old stays read as empty and unshared', () => {
    const old = thanksgivingExample().stays[0];
    assert.deepEqual([old.groupInfo, old.checkOutTime, old.showOnGuest], ['', '', false]);
    const before = thanksgivingExample(); for (const s of before.stays) { delete s.groupInfo; delete s.checkOutTime; delete s.showOnGuest; }
    assert.deepEqual(diffTrips(before, applyTripChange(before, { action: 'edit', activityId: 'option-1', patch: { title: 'X' } })).map(r => r.id), ['option-1'], 'a stay saved before these fields existed is not logged as changed');
    const t = withInfo();
    assert.deepEqual([t.stays[0].groupInfo, t.stays[0].checkOutTime, t.stays[0].showOnGuest], ['Bring boots. Laundry in the barn.', 'by 10:00', false]);
});

test('guests see a stay only when the organizer ticked it, and never its private note or the address', () => {
    const hidden = withInfo();
    assert.deepEqual(publicTrip(hidden).stays, [], 'writing the text shares nothing by itself');
    const shown = withInfo({ showOnGuest: true });
    shown.places[0].address = 'PRIVATE 1 Hidden Lane';
    const guest = publicTrip(shown), text = JSON.stringify(guest);
    assert.deepEqual(guest.stays.map(s => [s.id, s.lodging, s.groupInfo, s.checkOutTime, s.start, s.end]), [['shared-base', 'Hill House', 'Bring boots. Laundry in the barn.', 'by 10:00', '2026-11-25', '2026-11-30']]);
    assert.ok(!text.includes('PRIVATE') && !('note' in guest.stays[0]));
    const html = board(guest, { guest: true });
    assert.match(html, /class="lodging" data-stay-view="shared-base"/, 'the guest board shows the shared stay line');
    assert.ok(!html.includes('add-here') && !html.includes('PRIVATE'));
    assert.ok(buildOfflineHtml({ trip: shown, revision: 1 }).includes('For the group: Bring boots.'), 'the private reading copy has it, with the note');
    assert.ok(!buildOfflineHtml({ trip: guest, revision: 1 }).includes('PRIVATE'), 'a guest reading copy does not have the note');
});

test('editors may write the text for the group; only the organizer shares or unshares a stay', () => {
    const t = withInfo(), shared = withInfo({ showOnGuest: true });
    assert.equal(editorRestriction(t, { action: 'stay-edit', stayId: 'shared-base', patch: { groupInfo: 'New text', showOnGuest: false } }), null);
    assert.equal(editorRestriction(shared, { action: 'stay-edit', stayId: 'shared-base', patch: { groupInfo: 'New text', showOnGuest: true } }), null, 'editing a shared stay without changing the tick is allowed');
    assert.equal(editorRestriction(t, { action: 'stay-edit', stayId: 'shared-base', patch: { showOnGuest: true } }), STAY_GUEST_RULE);
    assert.equal(editorRestriction(shared, { action: 'stay-edit', stayId: 'shared-base', patch: { showOnGuest: false } }), STAY_GUEST_RULE);
    assert.equal(editorRestriction(t, { action: 'stay-add', stay: { id: 'x', showOnGuest: true } }), STAY_GUEST_RULE);
    assert.equal(editorDiffRestriction(shared, t), STAY_GUEST_RULE, 'an editor cannot reverse the choice through undo either');
    assert.equal(editorDiffRestriction(t, withInfo({ groupInfo: 'Other' })), null);
});

test('the forms say what is shared, and the guest page can open a shared stay', () => {
    const planner = read('../public/planner.js'), guest = read('../public/guest.mjs');
    assert.match(planner, /name="showOnGuest" \$\{s\.showOnGuest \? 'checked' : ''\} \$\{state\.isOwner \? disabled : 'disabled'\}> Show this stay on the guest link/);
    assert.match(planner, /They never see the private note\./);
    assert.match(planner, /A stay appears only if you ticked “Show this stay on the guest link”/);
    assert.match(guest, /if \(b\.dataset\.stayView\)/);
    assert.ok(!/s\.note/.test(guest), 'the guest page never reads a note');
});
