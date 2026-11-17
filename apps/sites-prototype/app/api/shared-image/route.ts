import { db, response, snapshot, failed, type Row } from "../../../lib/trip-store";
import { publicTrip, tokenHash } from "../../../lib/trips.mjs";
export const dynamic = "force-dynamic";
// A card picture for the guest link. The guest token travels in the Authorization header, as for the
// guest schedule, never in the address. A picture is returned only if an activity that guests can see
// currently shows it: a removed picture, a private one, or another trip's is "not found".
export async function GET(request: Request) { try {
    const token = request.headers.get("Authorization")?.match(/^Share ([A-Za-z0-9_-]{43})$/)?.[1];
    const missing = () => response({ error: "This picture is unavailable." }, 404);
    if (!token)
        return missing();
    const r = await db().prepare("SELECT * FROM planner_trips WHERE share_token_hash = ? AND archived_at IS NULL").bind(await tokenHash(token)).first<Row>();
    const imageId = new URL(request.url).searchParams.get("image") || "";
    if (!r || !imageId || !publicTrip(snapshot(r).trip).activities.some((a: { imageId?: string }) => a.imageId === imageId))
        return missing();
    const row = await db().prepare("SELECT mime, data FROM planner_images WHERE id = ? AND trip_id = ?").bind(imageId, r.id).first<{ mime: string; data: string }>();
    if (!row)
        return missing();
    const bytes = Uint8Array.from(atob(row.data), c => c.charCodeAt(0));
    // Not stored by the browser, so disabling or replacing the link ends access to pictures as it does to the schedule.
    return new Response(bytes, { headers: { "Content-Type": row.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } });
}
catch (e) {
    return failed(e);
} }
