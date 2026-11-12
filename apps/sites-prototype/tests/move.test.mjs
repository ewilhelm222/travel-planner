import { test } from "node:test";
import assert from "node:assert/strict";
import { moveActivity, stepTarget, FIXED_MOVE_ERROR } from "../public/move.mjs";
import { beforeIdAt } from "../public/drag.mjs";
import { thanksgivingExample, applyTripChange, publicTrip } from "../lib/trips.mjs";
import { board } from "../public/board.mjs";

const dayIds = (trip, date) => trip.activities.filter(a => a.date === date).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map(a => a.id);

test("moving a shared activity to another day moves the one record for everyone", () => {
  const trip = thanksgivingExample(), before = structuredClone(trip);
  const walk = trip.activities.find(a => a.title === "Neighborhood walk");
  const { trip: next, changed, from, to } = moveActivity(trip, { activityId: walk.id, date: "2026-11-27" });
  assert.equal(changed, true);
  assert.equal(from, "2026-11-26");
  assert.equal(to, "2026-11-27");
  const moved = next.activities.filter(a => a.id === walk.id);
  assert.equal(moved.length, 1, "No copies are created.");
  assert.equal(moved[0].date, "2026-11-27");
  assert.deepEqual(moved[0].participants, ["cedar", "maple", "birch"]);
  assert.equal(next.activities.length, trip.activities.length);
  assert.equal(dayIds(next, "2026-11-27").at(-1), walk.id, "Without a target position it lands last.");
  assert.deepEqual(trip, before, "The input trip is not mutated (safe for optimistic rollback).");
  // Every group, including ones hidden by a filter, sees the moved card.
  for (const filter of ["cedar", "maple", "birch"]) assert.ok(board(next, { filter, day: "2026-11-27" }).includes(`data-detail="${walk.id}"`));
});

test("dropping before a card sets day order; other fields are untouched", () => {
  const trip = thanksgivingExample();
  const [first, second, third] = dayIds(trip, "2026-11-27");
  const { trip: next } = moveActivity(trip, { activityId: third, date: "2026-11-27", beforeId: first });
  assert.deepEqual(dayIds(next, "2026-11-27").slice(0, 3), [third, first, second]);
  const strip = t => t.activities.map(({ order, ...rest }) => rest);
  assert.deepEqual(strip(next), strip(trip), "Only order changes on a same-day reorder.");
  // Another day keeps its order.
  assert.deepEqual(dayIds(next, "2026-11-26"), dayIds(trip, "2026-11-26"));
});

test("reordering relative to a visible card keeps hidden activities in place", () => {
  const trip = thanksgivingExample();
  const ids = dayIds(trip, "2026-11-26");
  // Pretend ids[1] is hidden by a participant filter; move ids[3] before visible ids[2].
  const { trip: next } = moveActivity(trip, { activityId: ids[3], date: "2026-11-26", beforeId: ids[2] });
  assert.deepEqual(dayIds(next, "2026-11-26"), [ids[0], ids[1], ids[3], ids[2]]);
});

test("a drop onto the card's current place is a no-op", () => {
  const trip = thanksgivingExample();
  const ids = dayIds(trip, "2026-11-26");
  assert.equal(moveActivity(trip, { activityId: ids[0], date: "2026-11-26", beforeId: ids[1] }).changed, false);
  assert.equal(moveActivity(trip, { activityId: ids[0], date: "2026-11-26", beforeId: ids[0] }).changed, false);
  assert.equal(moveActivity(trip, { activityId: ids.at(-1), date: "2026-11-26" }).changed, false);
});

test("fixed bookings cannot change day by drag, but can be reordered within their day", () => {
  const trip = thanksgivingExample();
  const dinner = trip.activities.find(a => a.title === "Thanksgiving dinner");
  dinner.fixed = true;
  assert.throws(() => moveActivity(trip, { activityId: dinner.id, date: "2026-11-27" }), new RegExp(FIXED_MOVE_ERROR.slice(0, 30)));
  assert.throws(() => moveActivity(trip, { activityId: dinner.id, date: null }), /fixed booking/);
  const first = dayIds(trip, "2026-11-26")[0];
  const { trip: next, changed } = moveActivity(trip, { activityId: dinner.id, date: "2026-11-26", beforeId: first });
  assert.equal(changed, true);
  assert.equal(dayIds(next, "2026-11-26")[0], dinner.id);
  assert.equal(next.activities.find(a => a.id === dinner.id).time, dinner.time);
  // The server path enforces the same rule.
  assert.throws(() => applyTripChange(trip, { action: "move", activityId: dinner.id, date: "2026-11-27" }), /fixed booking/);
});

test("ideas can be scheduled by drop and unscheduled back to ideas", () => {
  const trip = thanksgivingExample();
  const walk = trip.activities.find(a => a.title === "Neighborhood walk");
  const unscheduled = applyTripChange(trip, { action: "move", activityId: walk.id, date: null });
  assert.equal(unscheduled.activities.find(a => a.id === walk.id).date, null);
  assert.ok(!publicTrip(unscheduled).activities.some(a => a.id === walk.id), "Unscheduled ideas leave the guest view.");
  const first = dayIds(unscheduled, "2026-11-28")[0];
  const scheduled = applyTripChange(unscheduled, { action: "move", activityId: walk.id, date: "2026-11-28", beforeId: first });
  assert.equal(dayIds(scheduled, "2026-11-28")[0], walk.id);
});

test("server move validates input and returns a normalized document", () => {
  const trip = thanksgivingExample();
  const id = trip.activities[0].id;
  assert.throws(() => applyTripChange(trip, { action: "move", activityId: "missing", date: "2026-11-26" }), /not found/);
  assert.throws(() => applyTripChange(trip, { action: "move", activityId: id, date: "2026-12-25" }), /within this trip/);
  assert.throws(() => applyTripChange(trip, { action: "move", activityId: id, date: 5 }), /within this trip/);
  assert.throws(() => applyTripChange(trip, { action: "move", activityId: id, date: "2026-11-26", beforeId: { x: 1 } }), /place/);
  const next = applyTripChange(trip, { action: "move", activityId: id, date: "2026-11-29" });
  assert.equal(next.schemaVersion, 2);
  assert.equal(next.id, trip.id);
  assert.equal(next.activities.find(a => a.id === id).date, "2026-11-29");
});

test("keyboard steps and pointer positions map to drop targets", () => {
  assert.deepEqual(stepTarget(["a", "b", "c"], "c", -1), { beforeId: "b" });
  assert.deepEqual(stepTarget(["a", "b", "c"], "a", 1), { beforeId: "c" });
  assert.deepEqual(stepTarget(["a", "b", "c"], "b", 1), { beforeId: null });
  assert.equal(stepTarget(["a", "b"], "a", -1), null);
  const items = [{ id: "a", top: 0, height: 100 }, { id: "b", top: 120, height: 100 }];
  assert.equal(beforeIdAt(items, 10), "a");
  assert.equal(beforeIdAt(items, 60), "b");
  assert.equal(beforeIdAt(items, 230), null);
});
