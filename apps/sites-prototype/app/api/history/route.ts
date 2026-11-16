import { access, body, commit, db, response, snapshot, userView, failed } from "../../../lib/trip-store";
import { editorDiffRestriction, normalizeTrip } from "../../../lib/trips.mjs";
import { diffTrips, undoChange, undoConflicts } from "../../../public/history.mjs";
export const dynamic = "force-dynamic";
type Change = { id: number; revision: number; actor_name: string; at: string; action: string; summary: string; records: string; undoes: number | null };
const parse = (c: Change) => JSON.parse(c.records) as { kind: string; id: string; before: unknown; after: unknown }[];
// Recent changes for any member of the trip. The log holds private planning details, never guest-link tokens or emails.
export async function GET(request: Request) { try {
    const a = await access(request);
    if (a.error)
        return a.error;
    const rows = await db().prepare("SELECT id,revision,actor_name,at,action,summary,records,undoes FROM planner_changes WHERE trip_id=? ORDER BY id DESC LIMIT 100").bind(a.row!.id).all<Change>();
    const trip = snapshot(a.row!).trip, undone = new Set(rows.results.map(c => c.undoes));
    return response({ revision: a.row!.revision, changes: rows.results.map(c => {
        const records = parse(c);
        return { id: c.id, revision: c.revision, actor: c.actor_name, at: c.at, action: c.action, summary: c.summary, records, undoes: c.undoes, wasUndone: undone.has(c.id), canUndo: records.length > 0 && !undoConflicts(trip, records).length };
    }) });
}
catch (e) {
    return failed(e);
} }
// Undo one logged change. It succeeds only when every record that change touched is still
// exactly as the change left it; otherwise nothing is written and the caller sees a conflict.
export async function POST(request: Request) { try {
    const a = await access(request);
    if (a.error)
        return a.error;
    const input = await body(request, 2000);
    if (input.action !== "undo" || !Number.isSafeInteger(input.changeId))
        return response({ error: "Choose a change to undo." }, 400);
    const change = await db().prepare("SELECT id,revision,actor_name,at,action,summary,records,undoes FROM planner_changes WHERE id=? AND trip_id=?").bind(input.changeId, a.row!.id).first<Change>();
    if (!change)
        return response({ error: "That change is not in this trip's history." }, 404);
    const before = snapshot(a.row!).trip;
    let trip;
    try {
        trip = normalizeTrip(undoChange(before, parse(change)), a.row!.id);
    }
    catch (e) {
        return response({ error: (e as Error).message, conflicts: (e as { conflicts?: unknown }).conflicts || [] }, 409);
    }
    const restricted = a.isOwner ? null : editorDiffRestriction(before, trip);
    if (restricted)
        return response({ error: restricted }, 403);
    const summary = `Undid: ${change.summary}`.replace(/^Undid: Undid: /, "Restored: ");
    const saved = await commit({ id: a.row!.id, expected: a.row!.revision, user: a.user!, action: "undo", summary, records: diffTrips(before, trip), undoes: change.id, set: { document: JSON.stringify(trip) } });
    if (!saved)
        return response({ error: "Not undone: someone saved a change at the same moment. Nothing was changed; open History again to retry.", conflicts: [] }, 409);
    return response({ user: userView(a.user!), isOwner: a.isOwner, role: a.role, summary, snapshot: { trip, revision: saved.revision, updatedAt: saved.now, updatedBy: a.user!.displayName } });
}
catch (e) {
    return failed(e);
} }
