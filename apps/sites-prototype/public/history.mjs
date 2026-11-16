// Pure change-history rules shared by the server (authoritative log and undo)
// and the planner (History list). No DOM or database access.

/** Record collections kept in a trip document, with the singular kind used in the log. */
export const COLLECTIONS = [["activities", "activity"], ["stays", "stay"], ["legs", "journey"], ["places", "place"], ["people", "traveler"], ["families", "group"]];
const TRIP_FIELDS = ["title", "subtitle", "kind", "start", "end", "timezone"];
// Empty values and absent fields compare equal, so adding an optional field to the
// trip format never makes old records look edited (in the log or to undo).
const blank = v => v === null || v === undefined || v === "" || v === false || (Array.isArray(v) && !v.length);
const tidy = v => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().filter(k => !blank(v[k])).map(k => [k, v[k]])) : v;
const same = (a, b) => JSON.stringify(tidy(a)) === JSON.stringify(tidy(b));
const tripFields = trip => Object.fromEntries(TRIP_FIELDS.map(k => [k, trip[k] ?? null]));

/**
 * Every record that differs between two versions of a trip, as
 * `{ kind, id, before, after }` (plus `at` for a removed one). `before` is null for an added record and
 * `after` is null for a removed one. The trip's own details are one record of kind "trip".
 */
export function diffTrips(before, after) {
  const records = [];
  if (!same(tripFields(before), tripFields(after))) records.push({ kind: "trip", id: "trip", before: tripFields(before), after: tripFields(after) });
  for (const [key, kind] of COLLECTIONS) {
    const old = new Map((before[key] || []).map(r => [r.id, r])), next = new Map((after[key] || []).map(r => [r.id, r]));
    // `at` remembers where a removed record sat, so undo can put it back in the same place.
    for (const [id, record] of old) if (!next.has(id)) records.push({ kind, id, before: record, after: null, at: before[key].indexOf(record) });
    for (const [id, record] of next) {
      if (!old.has(id)) records.push({ kind, id, before: null, after: record });
      else if (!same(old.get(id), record)) records.push({ kind, id, before: old.get(id), after: record });
    }
  }
  return records;
}

const label = record => (record?.title || record?.name || "").slice(0, 80);
const quote = record => `“${label(record)}”`;

/** One plain sentence for the History list. `change` is the request that caused the records to change. */
export function summarize(change, records) {
  const action = change?.action || "edit";
  const first = kind => records.find(r => r.kind === kind);
  const main = records.find(r => r.id === (change?.activityId || change?.activity?.id)) || records[0];
  if (action === "undo") return `Undid: ${change.summary || "an earlier change"}`;
  if (action === "create") return "Created this trip";
  if (action === "archive") return "Deleted (archived) this trip";
  if (action === "restore") return "Restored this trip from the archive";
  if (action === "share") return change.enabled ? "Enabled or replaced the guest link" : "Disabled the guest link";
  if (!records.length) return "Saved with no changes";
  if (action === "move" && main) return main.after?.date === main.before?.date ? `Reordered ${quote(main.after)} on ${main.after.date || "the ideas list"}` : `Moved ${quote(main.after)} from ${main.before?.date || "ideas"} to ${main.after?.date || "ideas"}`;
  if (action === "add" && main) return `Added activity ${quote(main.after)}`;
  if (action === "delete" && main) return `Deleted activity ${quote(main.before)}`;
  if (action === "metadata") return "Changed the trip details";
  if (action === "traveler" && first("traveler")) return `${first("traveler").before ? "Changed" : "Added"} traveler ${quote(first("traveler").after)}`;
  if (action === "family" && first("group")) return `${first("group").before ? "Changed" : "Added"} group ${quote(first("group").after)}`;
  if (action === "traveler-remove" && first("traveler")) return `Removed traveler ${quote(first("traveler").before)}${records.length > 1 ? ` and took them off ${records.length - 1} plan${records.length > 2 ? "s" : ""}` : ""}`;
  if (action === "family-remove" && first("group")) return `Removed group ${quote(first("group").before)}${records.length > 1 ? ` and updated ${records.length - 1} other record${records.length > 2 ? "s" : ""}` : ""}`;
  if (main) return `${main.before && main.after ? "Changed" : main.after ? "Added" : "Removed"} ${main.kind} ${quote(main.after || main.before)}`;
  return "Changed the plan";
}

/** Field-level differences of one logged record, for display. */
export function fieldChanges(record) {
  const keys = [...new Set([...Object.keys(record.before || {}), ...Object.keys(record.after || {})])].filter(k => k !== "id");
  return keys.filter(k => !same(record.before?.[k] ?? null, record.after?.[k] ?? null)).map(field => ({ field, before: record.before?.[field] ?? null, after: record.after?.[field] ?? null }));
}

const collectionOf = kind => COLLECTIONS.find(([, k]) => k === kind)?.[0];
function current(trip, record) {
  if (record.kind === "trip") return tripFields(trip);
  return (trip[collectionOf(record.kind)] || []).find(r => r.id === record.id) ?? null;
}

/**
 * Which logged records no longer match what the change left behind.
 * An empty list means the change can be undone without touching anyone's later work.
 */
export function undoConflicts(trip, records) {
  return records.filter(record => !collectionOf(record.kind) && record.kind !== "trip" ? true : !same(current(trip, record), record.after)).map(record => ({ kind: record.kind, id: record.id, label: label(current(trip, record) || record.after || record.before) }));
}

/**
 * Put every record of one logged change back to its `before` state.
 * Throws when any of those records has changed since, so later edits are never rewound.
 * The caller validates the result (normalizeTrip) before saving it.
 */
export function undoChange(trip, records) {
  if (!records?.length) throw new Error("This entry has nothing to undo.");
  const conflicts = undoConflicts(trip, records);
  if (conflicts.length)
    throw Object.assign(new Error(`Not undone: ${conflicts.map(c => c.label ? `“${c.label}”` : `a ${c.kind}`).join(", ")} ${conflicts.length === 1 ? "has" : "have"} changed since this edit. Nothing was changed.`), { conflicts });
  const next = structuredClone(trip);
  for (const record of records) {
    if (record.kind === "trip") { Object.assign(next, record.before); continue; }
    const key = collectionOf(record.kind), rows = next[key] ||= [], index = rows.findIndex(r => r.id === record.id);
    if (record.before === null) rows.splice(index, 1);
    else if (index < 0) rows.splice(Number.isSafeInteger(record.at) ? Math.min(record.at, rows.length) : rows.length, 0, structuredClone(record.before));
    else rows[index] = structuredClone(record.before);
  }
  return next;
}
