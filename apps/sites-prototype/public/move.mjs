// Pure move/reorder rules shared by the planner (optimistic preview) and the
// server (authoritative save). No DOM access, so both sides and the tests agree.

export const FIXED_MOVE_ERROR = "This plan has a set time, like a fixed booking. Choose “That day” in its form first, then change its day or time.";

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.id).localeCompare(String(b.id));

/**
 * Move one activity to `date` (null = unscheduled idea), placed before
 * `beforeId` in that day's order, or last when `beforeId` is absent.
 * The activity keeps its identity, participants, place, and time: a shared
 * activity stays one record and moves for every participant.
 * Only `date` and the `order` of activities on the destination day change.
 */
export function moveActivity(trip, { activityId, date = null, beforeId = null } = {}) {
  if (typeof activityId !== "string") throw new Error("Choose an activity to move.");
  if (date !== null && typeof date !== "string") throw new Error("Choose a day within this trip, or leave it unscheduled.");
  if (beforeId !== null && typeof beforeId !== "string") throw new Error("Choose where to place the activity.");
  if (date !== null && (date < trip.start || date > trip.end)) throw new Error("Choose a day within this trip, or leave it unscheduled.");
  const next = structuredClone(trip);
  const moving = next.activities.find(a => a.id === activityId);
  if (!moving) throw new Error("Activity not found. It may have been deleted; load the latest plan.");
  const from = moving.date ?? null;
  if (beforeId === activityId && from === date) return { trip, changed: false, from, to: date, activity: trip.activities.find(a => a.id === activityId) };
  if (moving.fixed && from !== date) throw new Error(FIXED_MOVE_ERROR);
  const before = trip.activities.filter(a => (a.date ?? null) === date).sort(byOrder).map(a => a.id);
  const lane = next.activities.filter(a => (a.date ?? null) === date && a.id !== activityId).sort(byOrder);
  const at = beforeId && beforeId !== activityId ? lane.findIndex(a => a.id === beforeId) : -1;
  lane.splice(at < 0 ? lane.length : at, 0, moving);
  moving.date = date;
  lane.forEach((a, index) => { a.order = Math.min(index, 1000); });
  const changed = from !== date || lane.map(a => a.id).join("\n") !== before.join("\n");
  return { trip: changed ? next : trip, changed, from, to: date, activity: changed ? moving : trip.activities.find(a => a.id === activityId) };
}

/** Neighbour-relative target for keyboard reordering within the visible cards of one day. */
export function stepTarget(visibleIds, activityId, step) {
  const i = visibleIds.indexOf(activityId);
  if (i < 0) return null;
  const j = i + step;
  if (j < 0 || j >= visibleIds.length) return null;
  // Moving up: insert before the previous card. Moving down: before the card after the next one.
  return { beforeId: step < 0 ? visibleIds[j] : visibleIds[j + 1] ?? null };
}
