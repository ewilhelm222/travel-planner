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
  if (action === "stay-move" && first("stay")) { const n = records.filter(r => r.kind === "activity").length, d = change.days; return `Moved a stay ${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} ${d > 0 ? "later" : "earlier"} (${first("stay").before.start} → ${first("stay").after.start})${n ? ` with ${n} flexible activit${n === 1 ? "y" : "ies"}` : ", moving no activities"}`; }
  if (action === "confirm" && main) return `Kept ${quote(main.after)} as a real plan`;
  if (action === "examples-remove") return `Removed ${records.length} example${records.length === 1 ? "" : "s"}`;
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
const keyOf = record => record.kind === "trip" ? "trip" : `${record.kind}:${record.id}`;
const revisionNow = (revisions, record) => Number.isSafeInteger(revisions?.[keyOf(record)]) ? revisions[keyOf(record)] : 1;

/**
 * Which logged records have been changed again since the change being undone.
 * A record logged with its revision (`rev`) is unchanged while it is still at that
 * revision. Older log rows have no `rev` and are compared by content instead.
 * Cards a drag merely renumbered (`incidental`) never block an undo.
 * An empty list means the change can be undone without touching anyone's later work.
 */
export function undoConflicts(trip, records, revisions) {
  return records.filter(record => {
    if (record.incidental) return false;
    if (!collectionOf(record.kind) && record.kind !== "trip") return true;
    if (Number.isSafeInteger(record.rev) && revisions) return revisionNow(revisions, record) !== record.rev;
    return !same(current(trip, record), record.after);
  }).map(record => ({ kind: record.kind, id: record.id, label: label(current(trip, record) || record.after || record.before) }));
}

/**
 * Put back what one logged change altered: only the fields it changed, on only the
 * records it touched. Throws when any of those records has changed since, so later
 * edits are never rewound. The caller validates the result (normalizeTrip) before saving it.
 */
export function undoChange(trip, records, revisions) {
  if (!records?.length) throw new Error("This entry has nothing to undo.");
  const conflicts = undoConflicts(trip, records, revisions);
  if (conflicts.length)
    throw Object.assign(new Error(`Not undone: ${conflicts.map(c => c.label ? `“${c.label}”` : `a ${c.kind}`).join(", ")} ${conflicts.length === 1 ? "has" : "have"} changed since this edit. Nothing was changed.`), { conflicts });
  const next = structuredClone(trip);
  const revert = (target, record) => { for (const { field } of fieldChanges(record)) target[field] = structuredClone(record.before[field] ?? (Array.isArray(record.after[field]) ? [] : typeof record.after[field] === "boolean" ? false : typeof record.after[field] === "string" ? "" : null)); };
  for (const record of records) {
    if (record.kind === "trip") { revert(next, record); continue; }
    const key = collectionOf(record.kind), rows = next[key] ||= [], index = rows.findIndex(r => r.id === record.id);
    if (record.incidental) {
      // Restore a renumbered card's position only if nobody has moved it since.
      if (index >= 0 && rows[index].order === record.after.order) rows[index].order = record.before.order;
    }
    else if (record.before === null) { if (index >= 0) rows.splice(index, 1); }
    else if (record.after === null) { if (index < 0) rows.splice(Number.isSafeInteger(record.at) ? Math.min(record.at, rows.length) : rows.length, 0, structuredClone(record.before)); else throw Object.assign(new Error("Not undone: a record with that identifier exists again. Nothing was changed."), { conflicts: [{ kind: record.kind, id: record.id, label: label(rows[index]) }] }); }
    else if (index >= 0) revert(rows[index], record);
  }
  return next;
}
