import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { thanksgivingExample, applyTripChange, publicTrip } from '../lib/trips.mjs';
import { card, board } from '../public/board.mjs';
import { parseImageDataUrl, imageUrl, MAX_IMAGE_BYTES } from '../public/structure.mjs';
import { diffTrips } from '../public/history.mjs';
import { buildOfflineHtml } from '../public/offline-export.mjs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const b64 = bytes => Buffer.from(bytes).toString('base64');
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1], PNG = [0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13];
const IMAGE = '0b0e7c1e-1111-4222-8333-444455556666';

test('only small JPEG, PNG or WebP pictures are accepted, and the bytes must match the type', () => {
    assert.deepEqual(parseImageDataUrl(`data:image/jpeg;base64,${b64(JPEG)}`), { mime: 'image/jpeg', base64: b64(JPEG), bytes: 12 });
    assert.equal(parseImageDataUrl(`data:image/png;base64,${b64(PNG)}`).mime, 'image/png');
    assert.equal(parseImageDataUrl(`data:image/webp;base64,${b64([...Buffer.from('RIFF'), 1, 2, 3, 4, ...Buffer.from('WEBP')])}`).mime, 'image/webp');
    for (const bad of [undefined, '', 'https://example.com/a.jpg', `data:image/svg+xml;base64,${b64(Buffer.from('<svg/>'))}`, `data:text/html;base64,${b64(Buffer.from('<p>'))}`, `data:image/jpeg;base64,not base64!`])
        assert.throws(() => parseImageDataUrl(bad), /JPEG, PNG or WebP/);
    assert.throws(() => parseImageDataUrl(`data:image/png;base64,${b64(JPEG)}`), /not the kind of picture it claims/);
    assert.throws(() => parseImageDataUrl(`data:image/jpeg;base64,${b64([...JPEG, ...new Array(MAX_IMAGE_BYTES).fill(1)])}`), /too large/);
    assert.equal(imageUrl('trip id', 'a&b'), '/api/image?id=trip%20id&image=a%26b');
});

test('an activity points at its picture by id; old activities have none and are not logged as changed', () => {
    let t = thanksgivingExample();
    assert.ok(t.activities.every(a => a.imageId === ''));
    const old = thanksgivingExample(); for (const a of old.activities) delete a.imageId;
    assert.deepEqual(diffTrips(old, applyTripChange(old, { action: 'edit', activityId: 'option-1', patch: { title: 'X' } })).map(r => r.id), ['option-1']);
    t = applyTripChange(t, { action: 'edit', activityId: 'option-2', patch: { imageId: IMAGE } });
    assert.equal(t.activities[1].imageId, IMAGE);
    assert.equal(applyTripChange(t, { action: 'edit', activityId: 'option-2', patch: { imageId: 'not an id / <script>' } }).activities[1].imageId, '', 'anything that is not a plain id is dropped');
    assert.equal(applyTripChange(t, { action: 'edit', activityId: 'option-2', patch: { imageId: '' } }).activities[1].imageId, '', 'removing is an ordinary edit');
});

test('signed-in cards show the picture; the guest link, its cards and the offline file never do', () => {
    let t = thanksgivingExample();
    t.activities.forEach(a => { a.sourceKind = 'entered'; });
    t = applyTripChange(t, { action: 'edit', activityId: 'option-2', patch: { imageId: IMAGE } });
    const html = card(t.activities[1], t);
    assert.match(html, new RegExp(`<img class="card-image" src="/api/image\\?id=thanksgiving-example&amp;image=${IMAGE}" alt="" loading="lazy" decoding="async">`));
    assert.ok(!card(t.activities[2], t).includes('card-image'));
    const guest = publicTrip(t);
    assert.ok(!JSON.stringify(guest).includes(IMAGE) && !('imageId' in guest.activities[1]));
    assert.ok(!board(guest, { guest: true }).includes('card-image') && !card(t.activities[1], t, true).includes('card-image'));
    assert.ok(!buildOfflineHtml({ trip: t, revision: 1 }).includes('<img'), 'the offline file stays free of images and outside requests');
});

test('the picture route checks trip membership, serves only that trip\'s pictures, and has a migration', () => {
    const route = read('../app/api/image/route.ts'), guest = read('../public/guest.mjs'), shared = read('../app/api/shared/route.ts');
    assert.equal(route.match(/const a = await access\(request\);/g).length, 2, 'both reading and adding go through the trip access check');
    assert.match(route, /WHERE id = \? AND trip_id = \?/);
    assert.match(route, /"X-Content-Type-Options": "nosniff"/);
    assert.match(route, /parseImageDataUrl\(input\?\.data\)/);
    assert.ok(!guest.includes('/api/image') && !shared.includes('planner_images'), 'the guest page and guest data never touch pictures');
    const migration = readdirSync(new URL('../drizzle/', import.meta.url)).find(f => f.startsWith('0004_'));
    assert.equal(migration, '0004_card_pictures.sql');
    assert.match(read(`../drizzle/${migration}`), /CREATE TABLE `planner_images`/);
    assert.match(read('../drizzle/meta/_journal.json'), /"tag": "0004_card_pictures"/);
    const planner = read('../public/planner.js');
    assert.match(planner, /createImageBitmap\(file, \{ imageOrientation: 'from-image' \}\)/, 'photos are turned the right way up before shrinking');
    assert.match(planner, /\[\[800, \.72\], \[640, \.62\], \[480, \.55\]\]/);
});
