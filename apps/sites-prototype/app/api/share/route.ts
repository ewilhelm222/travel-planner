import { access, body, response, snapshot, failed, staleCheck, transact, revisionMap } from "../../../lib/trip-store";
import { publicTrip, newShareToken, tokenHash } from "../../../lib/trips.mjs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try {
    const a = await access(request);
    if (a.error)
        return a.error;
    if (!a.isOwner)
        return response({ error: "Only the organizer manages sharing." }, 403);
    return response({ enabled: !!a.row!.share_token_hash, preview: publicTrip(snapshot(a.row!).trip), revision: a.row!.revision, shareRevision: revisionMap(a.row!).share ?? 1 });
}
catch (e) {
    return failed(e);
} }
export async function POST(request: Request) { try {
    const a = await access(request);
    if (a.error)
        return a.error;
    if (!a.isOwner)
        return response({ error: "Only the organizer manages sharing." }, 403);
    const input = await body(request, 2000);
    if (!["rotate", "revoke"].includes(input.action))
        return response({ error: "Choose create/replace or disable link." }, 400);
    const token = input.action === "rotate" ? newShareToken() : null;
    const hash = token ? await tokenHash(token) : null;
    // The guest link has its own revision ("share"), so editing a card never blocks it,
    // while two organizer tabs still cannot silently replace each other's link.
    return await transact(a.row!, current => {
        const stale = staleCheck(input, current);
        if (stale)
            return stale;
        const revisions = { ...revisionMap(current), share: (revisionMap(current).share ?? 1) + 1 }, now = new Date().toISOString();
        // Logged without the token or its hash: History only records that the link changed.
        return {
            user: a.user!, action: "share", summary: token ? "Enabled or replaced the guest link" : "Disabled the guest link",
            set: { share_token_hash: hash, shared_at: token ? now : null, record_revisions: JSON.stringify(revisions) },
            respond: saved => response({ enabled: !!token, url: token ? `${new URL(request.url).origin}/view#${token}` : null, revision: saved.revision, shareRevision: revisions.share }),
        };
    });
}
catch (e) {
    return failed(e);
} }
