// Per-record revision rules, shared by the server (authoritative), the planner
// (which sends the revisions it is relying on) and the tests. No DOM or database access.
import { COLLECTIONS } from "./history.mjs";

export const recordKey = (kind, id) => kind === "trip" ? "trip" : `${kind}:${id}`;
/** A record with no entry is at revision 1: trips saved before per-record revisions need no rewrite. */
export const revisionOf = (revisions, key) => Number.isSafeInteger(revisions?.[key]) ? revisions[key] : 1;
/** The `base` a client sends: the current revision of each record it is about to change. */
export const baseFor = (revisions, ...keys) => Object.fromEntries(keys.filter(Boolean).map(key => [key, revisionOf(revisions, key)]));

function find(trip, key) {
  if (key === "trip") return { kind: "trip", record: trip };
  const [kind, ...rest] = key.split(":"), id = rest.join(":"), collection = COLLECTIONS.find(([, k]) => k === kind)?.[0];
  return { kind, record: collection ? (trip[collection] || []).find(r => r.id === id) ?? null : null };
}

/**
 * Compare the revisions a client relied on with the current ones.
 * Returns the records that changed (or were deleted) since; empty means the save may proceed.
 */
export function staleRecords(trip, revisions, base) {
  if (!base || typeof base !== "object" || Array.isArray(base)) throw new Error("A saved revision is required.");
  const stale = [];
  for (const [key, seen] of Object.entries(base)) {
    if (!Number.isSafeInteger(seen) || seen < 1) throw new Error("A saved revision is required.");
    const now = revisionOf(revisions, key);
    if (now === seen) continue;
    const { kind, record } = find(trip, key);
    stale.push({ key, kind, seen, current: now, deleted: key !== "trip" && key !== "share" && !record, label: kind === "trip" ? "The trip details" : kind === "share" ? "The guest link" : record?.title || record?.name || "" });
  }
  return stale;
}
export function staleMessage(stale) {
  const name = s => s.kind === "trip" || s.kind === "share" ? s.label : s.label ? `“${s.label}”` : `That ${s.kind}`;
  const first = stale[0], what = stale.length === 1 ? `${name(first)} ${first.kind === "trip" ? "were" : "was"} ${first.deleted ? "deleted" : "changed"}` : `${stale.map(name).join(", ")} were changed`;
  return `${what} by another planner after you opened it. Nothing was overwritten and your draft is still here; copy it if you need it, then load the latest plan.`;
}

/** A card whose position in its day changed and nothing else: never a conflict, never a revision bump. */
export const orderOnly = record => !!record.before && !!record.after && Object.keys({ ...record.before, ...record.after }).every(k => k === "order" || JSON.stringify(record.before[k] ?? null) === JSON.stringify(record.after[k] ?? null));

/**
 * Give every changed record its next revision. Returns the new map and the log
 * records annotated with `rev` (the revision the change produced) or `incidental`.
 * Deleted records keep a raised entry, so a restored record is never mistaken for the old one.
 */
export function advance(revisions, records) {
  const next = { ...(revisions || {}) };
  const logged = records.map(record => {
    if (orderOnly(record)) return { ...record, incidental: true };
    const key = recordKey(record.kind, record.id);
    next[key] = record.before === null && !(key in next) ? 1 : revisionOf(next, key) + 1;
    return { ...record, rev: next[key] };
  });
  return { revisions: next, records: logged };
}
