import { db, response, snapshot, failed, type Row } from "../../../lib/trip-store";
import { publicTrip, tokenHash } from "../../../lib/trips.mjs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try {
    const token = request.headers.get("Authorization")?.match(/^Share ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!token)
        return response({ error: "This guest link is unavailable or has been disabled." }, 404);
    const r = await db().prepare("SELECT * FROM planner_trips WHERE share_token_hash = ?").bind(await tokenHash(token)).first<Row>();
    if (!r)
        return response({ error: "This guest link is unavailable or has been disabled." }, 404);
    return response({ trip: publicTrip(snapshot(r).trip), revision: r.revision, updatedAt: r.updated_at });
}
catch (e) {
    return failed(e);
} }
