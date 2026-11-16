import { access, body, db, response, snapshot, userView, failed, transact } from "../../../lib/trip-store";
import { editorDiffRestriction, normalizeTrip } from "../../../lib/trips.mjs";
import { diffTrips, undoChange, undoConflicts } from "../../../public/history.mjs";
import { advance } from "../../../public/revisions.mjs";
export const dynamic = "force-dynamic";
type Change = { id: number; revision: number; actor_name: string; at: string; action: string; summary: string; records: string; undoes: number | null };
const parse = (c: Change) => JSON.parse(c.records) as { kind: string; id: string; before: unknown; after: unknown; rev?: number; incidental?: boolean }[];
// Recent changes for any member of the trip. The log holds private planning details, never guest-link tokens or emails.
export async function GET(request: Request) { try {
    const a = await access(request);
    if (a.error)
        return a.error;
    const rows = await db().prepare("SELECT id,revision,actor_name,at,action,summary,records,undoes FROM planner_changes WHERE trip_id=? ORDER BY id DESC LIMIT 100").bind(a.row!.id).all<Change>();
    const { trip, revisions } = snapshot(a.row!), undone = new Set(rows.results.map(c => c.undoes));
    return response({ revision: a.row!.revision, revisions, changes: rows.results.map(c => {
        const records = parse(c);
        return { id: c.id, revision: c.revision, actor: c.actor_name, at: c.at, action: c.action, summary: c.summary, records, undoes: c.undoes, wasUndone: undone.has(c.id), canUndo: records.length > 0 && !undoConflicts(trip, records, revisions).length };
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
    const summary = `Undid: ${change.summary}`.replace(/^Undid: Undid: /, "Restored: ");
    return await transact(a.row!, current => {
        const { trip: before, revisions } = snapshot(current);
        let trip;
        try {
            // Allowed only while every record the change touched is still at the revision it produced.
            trip = normalizeTrip(undoChange(before, parse(change), revisions), current.id);
        }
        catch (e) {
            return response({ error: (e as Error).message, conflicts: (e as { conflicts?: unknown }).conflicts || [] }, 409);
        }
        const restricted = a.isOwner ? null : editorDiffRestriction(before, trip);
        if (restricted)
            return response({ error: restricted }, 403);
        const next = advance(revisions, diffTrips(before, trip));
        return {
            user: a.user!, action: "undo", summary, records: next.records, undoes: change.id,
            set: { document: JSON.stringify(trip), record_revisions: JSON.stringify(next.revisions) },
            respond: saved => response({ user: userView(a.user!), isOwner: a.isOwner, role: a.role, summary, snapshot: { trip, revision: saved.revision, revisions: next.revisions, updatedAt: saved.now, updatedBy: a.user!.displayName } }),
        };
    });
}
catch (e) {
    return failed(e);
} }
