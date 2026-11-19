// Travel bridges: where the board shows the group moving from one stay area to another.
// Everything here is derived from the stays, places and journeys as stored. Nothing is saved, and nothing is
// guessed from names: two stays are "the same area" exactly when their places share an area (the place itself,
// or the area it sits inside).
import { matchesSelection } from "./participants.mjs";
import { travelersOf } from "./stay-move.mjs";

// Places come in at most two levels: an area (a city, a camp) and venues inside it.
export const areaId = (trip, placeId) => trip.places?.find(p => p.id === placeId)?.parentId || placeId || null;

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.id).localeCompare(String(b.id));
const byDeparture = (a, b) => a.date.localeCompare(b.date) || String(a.time || "").localeCompare(String(b.time || "")) || a.id.localeCompare(b.id);
const nextDay = date => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

/**
 * The journeys that carry a group from area `from` to area `to`: a direct journey (an end left "to confirm"
 * counts as matching), or a chain through other places (a flight and then a train). A journey out to somewhere
 * else and back, a day trip, is never on such a path.
 */
function connecting(trip, legs, from, to) {
  const at = id => id ? areaId(trip, id) : null;
  const direct = legs.filter(l => (l.from || l.to) && (!l.from || at(l.from) === from) && (!l.to || at(l.to) === to));
  const hops = legs.filter(l => l.from && l.to && at(l.from) !== at(l.to) && at(l.to) !== from && at(l.from) !== to);
  const reach = (start, ends) => {
    const seen = new Set([start]);
    for (let grew = true; grew;) {
      grew = false;
      for (const l of hops) { const [a, b] = ends(l); if (seen.has(a) && !seen.has(b)) { seen.add(b); grew = true; } }
    }
    return seen;
  };
  const onward = reach(from, l => [at(l.from), at(l.to)]), back = reach(to, l => [at(l.to), at(l.from)]);
  const chain = onward.has(to) ? hops.filter(l => onward.has(at(l.from)) && back.has(at(l.to))) : [];
  return [...new Set([...direct, ...chain])].sort(byDeparture);
}

/**
 * Where the selected travelers change stay.
 *  - moves:   a change to a different area. Each gets a gap and a bridge on the board. `legs` are the journeys
 *             that carry it (none entered yet is allowed). `split` is the day the board shows in two parts, when
 *             the group leaves and arrives on the same day; otherwise the bridge sits after the `dep` day.
 *  - lodging: a change of lodging inside one area on one day. No gap; a small line between the two stays.
 *  - bridgeLegIds: journeys shown on a bridge, so the day does not list them a second time.
 */
export function travelPlan(trip, { filter = "all" } = {}) {
  const shown = r => !r.participants || matchesSelection(r, filter, trip);
  const stays = (trip.stays || []).filter(shown), legs = (trip.legs || []).filter(shown);
  const stayArea = s => areaId(trip, s.placeId || s.id);
  const cache = new Map();
  const who = r => { if (!cache.has(r)) cache.set(r, travelersOf(trip, r.participants)); return cache.get(r); };
  // A stay or journey with nobody ticked is read as being for whoever is on the trip.
  const shares = (a, b) => !who(a).size || !who(b).size || [...who(a)].some(x => who(b).has(x));
  const moves = new Map(), lodging = [];
  for (const b of stays) for (const a of stays) {
    if (a === b || a.end > b.start || !shares(a, b)) continue;
    // Only consecutive stays: skip the pair when the same travelers sleep somewhere else in between.
    if (stays.some(c => c !== a && c !== b && c.start >= a.end && c.end <= b.start && shares(c, a) && shares(c, b))) continue;
    const from = stayArea(a), to = stayArea(b);
    if (from === to) {
      if (a.end === b.start && (a.lodging || a.name || "") !== (b.lodging || b.name || "")) lodging.push({ date: a.end, area: from, from: a.id, to: b.id });
      continue;
    }
    const carried = connecting(trip, legs.filter(l => l.date >= a.end && l.date <= b.start && shares(l, a) && shares(l, b)), from, to);
    const dep = carried.length ? carried[0].date : a.end;
    const arr = carried.length ? carried.map(l => l.arrivalDate || l.date).sort().at(-1) : b.start;
    const id = [dep, arr < dep ? dep : arr, from, to].join("~");
    const move = moves.get(id) || { id, from, to, dep, arr: arr < dep ? dep : arr, split: arr <= dep ? dep : null, legs: [], fromStays: [], toStays: [] };
    for (const l of carried) if (!move.legs.includes(l)) move.legs.push(l);
    if (!move.fromStays.includes(a)) move.fromStays.push(a);
    if (!move.toStays.includes(b)) move.toStays.push(b);
    moves.set(id, move);
  }
  const list = [...moves.values()].sort((a, b) => a.dep.localeCompare(b.dep) || a.arr.localeCompare(b.arr) || a.id.localeCompare(b.id));
  for (const m of list) {
    m.legs.sort(byDeparture);
    // Who is moving, for the label: the travelers on the journeys when entered, otherwise those of the new stay.
    m.participants = [...new Set((m.legs.length ? m.legs : m.toStays).flatMap(r => r.participants || []))];
  }
  return { moves: list, lodging, bridgeLegIds: new Set(list.flatMap(m => m.legs.map(l => l.id))) };
}

/** Whether an activity (or anything with participants) includes someone who is on this move. */
function onMove(trip, move, record) {
  const mine = travelersOf(trip, record.participants);
  if (!mine.size) return true;
  return [...move.fromStays, ...move.toStays].some(s => { const them = travelersOf(trip, s.participants); return !them.size || [...mine].some(x => them.has(x)); });
}
const anchor = (trip, moves, a) => {
  const at = areaId(trip, a.placeId || null);
  if (!at) return null;
  const mine = moves.filter(m => onMove(trip, m, a));
  return mine.some(m => m.from === at) ? "before" : mine.some(m => m.to === at) ? "after" : null;
};

/**
 * A travel day in time order. `activities` are that day's cards in their saved order; `moves` are the moves
 * that leave and arrive that day. A card at the place being left belongs before the journey and a card at the
 * place being reached belongs after it, whatever order they were saved in. A card with no place, or somewhere
 * else, goes before the journey only when it is ordered ahead of a card at the place being left.
 */
export function splitDay(trip, moves, activities) {
  const list = [...activities].sort(byOrder), anchors = list.map(a => anchor(trip, moves, a)), last = anchors.lastIndexOf("before");
  const side = anchors.map((s, i) => s || (i < last ? "before" : "after"));
  return { before: list.filter((_, i) => side[i] === "before"), after: list.filter((_, i) => side[i] === "after") };
}

/**
 * Dropping a card below the last card of the "before" part of a travel day. The day has one saved order, so
 * this returns the card to place it in front of (null = last in the day) that keeps it on that side: after the
 * last card at the place being left when the dropped card is there too, otherwise just ahead of that card.
 */
export function endOfBeforePart(trip, moves, activities, activityId) {
  const moving = activities.find(a => a.id === activityId) || (trip.activities || []).find(a => a.id === activityId);
  const rest = [...activities].filter(a => a.id !== activityId).sort(byOrder), last = rest.map(a => anchor(trip, moves, a)).lastIndexOf("before");
  if (last < 0) return rest[0]?.id ?? null;
  return moving && anchor(trip, moves, moving) === "before" ? rest[last + 1]?.id ?? null : rest[last].id;
}

/**
 * The board in order: day columns, the two parts of a travel day, and the bridges between them.
 * Items are `{ kind: "day", date }`, `{ kind: "part", date, part: "before" | "after", moves }` and
 * `{ kind: "bridge", moves, dates }`, where `dates` are the days the bridge belongs with (for the one-day phone view).
 */
export function boardSequence(trip, dates, plan) {
  const first = dates[0], last = dates.at(-1), out = [];
  const bridge = (moves, days) => out.push({ kind: "bridge", moves, dates: days.filter(d => dates.includes(d)) });
  // A journey that left before the first day shown and arrives during the trip.
  const early = plan.moves.filter(m => !m.split && m.dep < first && m.arr >= first);
  if (early.length) bridge(early, [first]);
  for (const date of dates) {
    const split = plan.moves.filter(m => m.split === date);
    if (split.length) {
      out.push({ kind: "part", date, part: "before", moves: split });
      bridge(split, [date]);
      out.push({ kind: "part", date, part: "after", moves: split });
    }
    else out.push({ kind: "day", date });
    const leaving = plan.moves.filter(m => !m.split && m.dep === date && date <= last);
    if (leaving.length) bridge(leaving, [date, nextDay(date)]);
  }
  return out;
}
