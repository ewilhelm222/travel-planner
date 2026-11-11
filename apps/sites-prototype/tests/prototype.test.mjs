import { test } from "node:test";
import assert from "node:assert/strict";
import { createSampleTrip, validateChange, applyChange } from "../lib/prototype.mjs";

test("shared dinner is one record seen by both families", () => {
  const trip = createSampleTrip();
  const dinner = trip.activities.find(a => a.id === "a5");
  assert.equal(trip.activities.filter(a => a.id === dinner.id).length, 1);
  assert.deepEqual(dinner.participants, ["cedar", "maple"]);
  const changed = applyChange(trip, dinner.id, { notes: "Meet in the lobby first." });
  assert.equal(changed.activities.find(a => a.id === dinner.id).notes, "Meet in the lobby first.");
  assert.notEqual(dinner.notes, "Meet in the lobby first.");
});

test("fixed booking timing cannot change, but notes can", () => {
  const trip = createSampleTrip();
  assert.throws(() => applyChange(trip, "a5", { date: "2027-04-12" }), /fixed booking/);
  assert.throws(() => applyChange(trip, "a5", { time: "19:30" }), /fixed booking/);
  assert.equal(applyChange(trip, "a5", { notes: "Updated note" }).activities.find(a => a.id === "a5").time, "18:30");
});

test("moving a flexible activity stays within its visit and leaves others alone", () => {
  const trip = createSampleTrip();
  const changed = applyChange(trip, "a1", { date: "2027-04-13" });
  assert.equal(changed.activities[0].date, "2027-04-13");
  assert.deepEqual(changed.activities.slice(1), trip.activities.slice(1));
  assert.throws(() => applyChange(trip, "a1", { date: "2027-04-14" }), /within this stay/);
});

test("edits require a revision, restrict fields, and reject invalid calendar dates", () => {
  assert.match(validateChange({ activityId: "a1", patch: { title: "New" } }), /revision/);
  const edit = patch => ({ revision: 1, activityId: "a1", patch });
  assert.match(validateChange(edit({ participants: ["outsider"] })), /unsupported/);
  assert.match(validateChange(edit({ date: "2027-02-30" })), /valid date/);
  assert.match(validateChange(edit({ title: " " })), /title/);
  assert.equal(validateChange(edit({ notes: "A rainy-day alternative." })), null);
});
