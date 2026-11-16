import { access, body, commit, response, snapshot, failed, conflict } from "../../../lib/trip-store";
import { publicTrip, newShareToken, tokenHash } from "../../../lib/trips.mjs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try {
    const a = await access(request);
    if (a.error)
        return a.error;
    if (!a.isOwner)
        return response({ error: "Only the organizer manages sharing." }, 403);
    return response({ enabled: !!a.row!.share_token_hash, preview: publicTrip(snapshot(a.row!).trip), revision: a.row!.revision });
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
    if (input.revision !== a.row!.revision)
        return conflict();
    const token = input.action === "rotate" ? newShareToken() : null;
    const hash = token ? await tokenHash(token) : null;
    const now = new Date().toISOString();
    // Logged without the token or its hash: History only records that the link changed.
    const r = await commit({ id: a.row!.id, expected: input.revision, user: a.user!, action: "share", summary: token ? "Enabled or replaced the guest link" : "Disabled the guest link", set: { share_token_hash: hash, shared_at: token ? now : null } });
    if (!r)
        return conflict();
    return response({ enabled: !!token, url: token ? `${new URL(request.url).origin}/view#${token}` : null, revision: r.revision });
}
catch (e) {
    return failed(e);
} }
