// "Last edited by": read from the change log (planner_changes), the same rows History shows.
// Nothing is stored for it. One query finds, for every record of one kind in a trip, the newest
// log entry that really changed it.
//
// A record in a log entry counts as an edit unless it was only renumbered by someone else's drag:
// entries written since per-record revisions mark those `incidental`; in older entries (no `rev`)
// the same thing is recognised by comparing before and after without `order`.
// SQLite returns the other selected columns from the row that holds MAX(c.id).
export const LAST_EDITS_SQL = `SELECT MAX(c.id) AS id, c.actor_name AS actor, c.at AS at, c.action AS action, json_extract(r.value,'$.id') AS rid, json_type(r.value,'$.before') AS was
FROM planner_changes c, json_each(c.records) r
WHERE c.trip_id = ? AND json_extract(r.value,'$.kind') = ?
  AND json_extract(r.value,'$.incidental') IS NULL
  AND (json_extract(r.value,'$.rev') IS NOT NULL
    OR json_type(r.value,'$.before') IS NOT 'object' OR json_type(r.value,'$.after') IS NOT 'object'
    OR json_remove(json_extract(r.value,'$.before'),'$.order') <> json_remove(json_extract(r.value,'$.after'),'$.order'))
GROUP BY rid`;
/** The entry that created the trip, for records that came with it and were never edited since. */
export const TRIP_CREATED_SQL = "SELECT id, actor_name AS actor, at FROM planner_changes WHERE trip_id = ? AND action = 'create' ORDER BY id LIMIT 1";

/**
 * Shape the rows for the page: `{ [recordId]: { id, actor, at, added } }` for records that still exist.
 * `added` is true when the newest entry is the one that added the record (it has not been edited since).
 * A record with no entry of its own came with the trip, if the trip's creation is in the log:
 * it gets that entry with `withTrip`. Otherwise it is left out, and the page shows nothing.
 */
export function lastEdits(rows, created, ids) {
    const found = new Map((rows || []).map(r => [r.rid, { id: r.id, actor: r.actor || "", at: r.at, added: r.was !== "object" }]));
    const out = {};
    for (const id of ids) {
        if (found.has(id))
            out[id] = found.get(id);
        else if (created)
            out[id] = { id: created.id, actor: created.actor || "", at: created.at, added: true, withTrip: true };
    }
    return out;
}
