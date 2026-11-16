import { access, body, commit, response, failed, conflict } from "../../../lib/trip-store";
export const dynamic = "force-dynamic";
// Organizer-only soft delete. Nothing is erased: the trip, its history and its editor list stay in
// the database, hidden from everyone until the organizer restores it. The guest link is switched off.
export async function POST(request: Request) { try {
    const a = await access(request, { archived: true });
    if (a.error)
        return a.error;
    if (!a.isOwner)
        return response({ error: "Only the organizer can delete or restore a trip." }, 403);
    const input = await body(request, 2000);
    if (!["archive", "restore"].includes(input.action))
        return response({ error: "Choose delete or restore." }, 400);
    const archived = !!a.row!.archived_at;
    if (archived === (input.action === "archive"))
        return response({ archived, revision: a.row!.revision });
    if (input.action === "archive" && input.revision !== a.row!.revision)
        return conflict();
    const now = new Date().toISOString();
    const saved = input.action === "archive"
        ? await commit({ id: a.row!.id, expected: a.row!.revision, user: a.user!, action: "archive", summary: "Deleted (archived) this trip", set: { archived_at: now, archived_by: a.user!.displayName, share_token_hash: null, shared_at: null } })
        : await commit({ id: a.row!.id, expected: a.row!.revision, user: a.user!, action: "restore", summary: "Restored this trip from the archive", archived: true, set: { archived_at: null, archived_by: null } });
    if (!saved)
        return conflict();
    return response({ archived: input.action === "archive", revision: saved.revision });
}
catch (e) {
    return failed(e);
} }
