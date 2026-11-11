// Runs against the loopback development server and synthetic data only.
import assert from "node:assert/strict";
const origin = process.argv[2] || "http://localhost:5173";
const url = new URL(origin);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Only run the smoke check against loopback.");
const unauthenticated = await fetch(`${origin}/api/trip`, { redirect: "manual" });
assert.equal(unauthenticated.status, 401, "Anonymous reads must be rejected.");
const login = await fetch(`${origin}/signin-with-chatgpt?return_to=/`, { redirect: "manual" });
const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
assert.ok(cookie, "Local sign-in must provide a development cookie.");
const request = (method = "GET", body, extra = {}) => fetch(`${origin}/api/trip`, {
  method, headers: { Cookie: cookie, Origin: origin, ...(body ? { "Content-Type": "application/json" } : {}), ...extra },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const init = await request("POST"); assert.equal(init.status, 200);
const initial = await init.json(); const revision = initial.snapshot.revision;
const activity = initial.snapshot.trip.activities.find(a => a.id === "a1");
const edit = notes => ({ revision, activityId: activity.id, patch: { notes } });
const writes = await Promise.all([request("PATCH", edit("Concurrent edit A")), request("PATCH", edit("Concurrent edit B"))]);
assert.deepEqual(writes.map(r => r.status).sort(), [200, 409], "Exactly one concurrent writer must win.");
const saved = await (await request()).json();
assert.equal(saved.snapshot.revision, revision + 1);
assert.ok(["Concurrent edit A", "Concurrent edit B"].includes(saved.snapshot.trip.activities.find(a => a.id === activity.id).notes));
const invalid = await request("PATCH", { revision: saved.snapshot.revision, activityId: "a5", patch: { time: "20:00" } });
assert.equal(invalid.status, 400, "Fixed times must not move.");
const foreignOrigin = await request("PATCH", { revision: saved.snapshot.revision, activityId: activity.id, patch: { notes: "Bad origin" } }, { Origin: "https://example.invalid" });
assert.equal(foreignOrigin.status, 403, "Cross-origin mutations must be rejected.");
const restored = await request("PATCH", { revision: saved.snapshot.revision, activityId: activity.id, patch: { notes: activity.notes } });
assert.equal(restored.status, 200);
const secondSession = await fetch(`${origin}/api/trip`, { headers: { Cookie: cookie } });
const final = await secondSession.json();
assert.equal(final.snapshot.trip.activities.find(a => a.id === activity.id).notes, activity.notes);
assert.equal(final.snapshot.revision, revision + 2);
console.log("PASS: anonymous access, shared persistence, atomic concurrent saves, fixed bookings, cross-origin protection, and readback.");
