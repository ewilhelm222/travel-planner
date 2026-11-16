import { access, body, response, failed, staleCheck, transact } from "../../../lib/trip-store";
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
    const now = new Date().toISOString();
    if (input.action === "restore")
        return await transact(a.row!, () => ({ user: a.user!, action: "restore", summary: "Restored this trip from the archive", archived: true, set: { archived_at: null, archived_by: null }, respond: saved => response({ archived: false, revision: saved.revision }) }), { archived: true });
    // Deleting relies on the trip's own details record (or, from an older page, the trip-wide revision).
    return await transact(a.row!, current => staleCheck(input, current) || { user: a.user!, action: "archive", summary: "Deleted (archived) this trip", set: { archived_at: now, archived_by: a.user!.displayName, share_token_hash: null, shared_at: null }, respond: saved => response({ archived: true, revision: saved.revision }) });
}
catch (e) {
    return failed(e);
} }
