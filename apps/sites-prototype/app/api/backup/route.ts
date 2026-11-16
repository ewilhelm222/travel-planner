import { access, db, response, snapshot, failed } from "../../../lib/trip-store";
import { buildSnapshot } from "../../../public/backup.mjs";
export const dynamic = "force-dynamic";
// Organizer-only, on-demand full-trip backup: the document, its revision and the whole change log.
// This is a manual download. No scheduled or automatic backup exists; see docs/backup-proposal.md.
export async function GET(request: Request) { try {
    const a = await access(request);
    if (a.error)
        return a.error;
    if (!a.isOwner)
        return response({ error: "Only the organizer downloads a full backup." }, 403);
    const changes = await db().prepare("SELECT id,revision,actor_name,at,action,summary,records,undoes FROM planner_changes WHERE trip_id=? ORDER BY id").bind(a.row!.id).all<{ id: number; revision: number; actor_name: string; at: string; action: string; summary: string; records: string; undoes: number | null }>();
    return response(await buildSnapshot({ ...snapshot(a.row!), changes: changes.results.map(c => ({ id: c.id, revision: c.revision, actor: c.actor_name, at: c.at, action: c.action, summary: c.summary, records: JSON.parse(c.records), undoes: c.undoes })) }));
}
catch (e) {
    return failed(e);
} }
