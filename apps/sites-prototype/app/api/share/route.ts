import { access, body, db, response, snapshot, failed, conflict } from "../../../lib/trip-store";
import { publicTrip, newShareToken, tokenHash } from "../../../lib/trips.mjs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try {
    const a = await access(request);
    if (a.error)
        return a.error;
    if (a.row!.owner_id !== a.user!.userId)
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
    if (a.row!.owner_id !== a.user!.userId)
        return response({ error: "Only the organizer manages sharing." }, 403);
    const input = await body(request, 2000);
    if (!["rotate", "revoke"].includes(input.action))
        return response({ error: "Choose create/replace or disable link." }, 400);
    if (input.revision !== a.row!.revision)
        return conflict();
    const token = input.action === "rotate" ? newShareToken() : null;
    const hash = token ? await tokenHash(token) : null;
    const now = new Date().toISOString();
    const r = await db().prepare("UPDATE planner_trips SET share_token_hash=?,shared_at=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? RETURNING revision").bind(hash, token ? now : null, now, a.row!.id, input.revision).first<{
        revision: number;
    }>();
    if (!r)
        return conflict();
    return response({ enabled: !!token, url: token ? `${new URL(request.url).origin}/view#${token}` : null, revision: r.revision });
}
catch (e) {
    return failed(e);
} }
