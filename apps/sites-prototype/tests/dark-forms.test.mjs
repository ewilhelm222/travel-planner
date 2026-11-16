import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const planner = read('../public/planner.js'), guest = read('../public/guest.mjs'), css = read('../public/planner.css');

test('dialogs you type into are dark; dialogs you read stay cream', () => {
    for (const id of ['editor', 'roster-dialog', 'structure-dialog', 'editors-dialog', 'create-dialog', 'import-dialog'])
        assert.ok(planner.includes(`<dialog id="${id}" class="form-dialog"`), id);
    for (const id of ['history-dialog', 'archived-dialog', 'share-dialog'])
        assert.ok(planner.includes(`<dialog id="${id}" aria-labelledby`), `${id} stays a reading dialog`);
    assert.ok(!guest.includes('form-dialog'), 'the guest activity detail is for reading');
    assert.match(css, /dialog\.form-dialog \{ background: var\(--dusk\); color: var\(--cream\); color-scheme: dark; \}/);
    assert.match(css, /dialog\.form-dialog input, dialog\.form-dialog textarea, dialog\.form-dialog select \{ background-color: var\(--night\); color: var\(--cream\)/);
});
