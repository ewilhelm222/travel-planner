// Stay-move preview for the real planner, ported from the read-only study in
// parallel-layout.mjs. Pure: it never changes the trip it is given.
import { isWholeTripGroup, peopleOf } from "./participants.mjs";

export function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

// Who a list of participant ids stands for. A group stands for itself (members who are
// not listed by name) and for each named member; a person stands for themselves only.
function everyone(trip, ids) {
  const who = new Set();
  const addGroup = g => { who.add(`group:${g.id}`); for (const p of peopleOf(trip)) if (p.familyId === g.id) who.add(p.id); };
  for (const id of ids || []) {
    const group = trip.families.find(g => g.id === id);
    if (!group) { who.add(id); continue; }
    if (isWholeTripGroup(group)) {
      who.add(`group:${group.id}`);
      trip.families.filter(g => !isWholeTripGroup(g)).forEach(addGroup);
      peopleOf(trip).forEach(p => who.add(p.id));
    }
    else addGroup(group);
  }
  return who;
}

/**
 * What moving one stay by `days` would mean. Nothing is changed.
 *  - shift:    flexible activities at the stay's place and dates whose participants all move
 *  - fixed:    fixed bookings there, left where they are
 *  - mixed:    activities shared with travelers who are not moving, left for a person to resolve
 *  - blocked:  flexible activities that would land outside the trip's dates, left where they are
 *  - journeys: travel to or from the place around the stay, to review by hand
 *  - overlaps: other stays for some of the same travelers that the new dates would overlap
 */
export function previewStayMove(trip, stayId, days) {
  const stay = (trip.stays || []).find(s => s.id === stayId);
  if (!stay) throw new Error("Stay not found. It may have been deleted; load the latest plan.");
  if (!Number.isSafeInteger(days) || days === 0 || Math.abs(days) > 120) throw new Error("Choose a new check-in day different from the current one.");
  const to = { start: addDays(stay.start, days), end: addDays(stay.end, days) };
  if (to.start < trip.start || to.start > trip.end) throw new Error("The new check-in day is outside this trip's dates. Change the trip dates first.");
  const moving = everyone(trip, stay.participants), involves = ids => [...everyone(trip, ids)].some(x => moving.has(x)), allMove = ids => [...everyone(trip, ids)].every(x => moving.has(x));
  const result = { stay: { id: stay.id, placeId: stay.placeId, participants: stay.participants, from: { start: stay.start, end: stay.end }, to }, days, shift: [], fixed: [], mixed: [], blocked: [], journeys: [], overlaps: [] };
  const inside = date => date >= to.start && date <= to.end;
  for (const a of trip.activities) {
    // The check-out day counts: plans that morning at this place belong to this visit.
    if (!a.date || a.date < stay.start || a.date > stay.end || !stay.placeId || a.placeId !== stay.placeId || !involves(a.participants)) continue;
    const date = addDays(a.date, days), entry = { id: a.id, title: a.title, date: a.date };
    if (a.fixed) result.fixed.push({ ...entry, outside: !inside(a.date) });
    else if (!allMove(a.participants)) result.mixed.push({ ...entry, outside: !inside(a.date) });
    else if (date < trip.start || date > trip.end) result.blocked.push({ ...entry, to: date });
    else result.shift.push({ ...entry, to: date });
  }
  result.journeys = (trip.legs || []).filter(l => involves(l.participants) && ((l.from === stay.placeId || l.to === stay.placeId) ? l.date >= addDays(stay.start, -1) && l.date <= addDays(stay.end, 1) : l.date === stay.start || l.date === stay.end)).map(l => ({ id: l.id, title: l.title, date: l.date }));
  result.overlaps = trip.stays.filter(s => s.id !== stay.id && involves(s.participants) && s.start < to.end && to.start < s.end).map(s => ({ id: s.id, placeId: s.placeId, start: s.start, end: s.end }));
  return result;
}

/**
 * Apply a confirmed move: the stay's dates, plus only the activities the person ticked.
 * Every ticked activity must still be shiftable in the trip as it is now, so a card that
 * became a fixed booking or gained a non-moving traveler since the preview is never moved.
 */
export function applyStayMove(trip, { stayId, days, shiftActivityIds }) {
  const preview = previewStayMove(trip, stayId, days);
  if (!Array.isArray(shiftActivityIds) || shiftActivityIds.some(id => typeof id !== "string") || new Set(shiftActivityIds).size !== shiftActivityIds.length)
    throw new Error("Confirm which activities move with the stay.");
  const allowed = new Map(preview.shift.map(a => [a.id, a.to]));
  if (shiftActivityIds.some(id => !allowed.has(id)))
    throw new Error("The plan changed since this preview, so nothing was moved. Preview the move again.");
  const next = structuredClone(trip), stay = next.stays.find(s => s.id === stayId);
  stay.start = preview.stay.to.start;
  stay.end = preview.stay.to.end;
  for (const a of next.activities) if (shiftActivityIds.includes(a.id)) a.date = allowed.get(a.id);
  return next;
}
