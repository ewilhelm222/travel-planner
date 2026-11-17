import { access, body, db, response, failed } from "../../../lib/trip-store";
import { parseImageDataUrl, MAX_IMAGES_PER_TRIP } from "../../../public/structure.mjs";
export const dynamic = "force-dynamic";
// Card pictures. Only people who can open the trip can fetch or add one, and only a picture that belongs
// to that trip is ever returned. The guest link has no access to this route. A picture row is written once
// and never changed; which activity shows it is an ordinary activity field, saved and logged with the trip.
export async function GET(request: Request) { try {
    const a = await access(request);
    if (a.error)
        return a.error;
    const imageId = new URL(request.url).searchParams.get("image") || "";
    const row = await db().prepare("SELECT mime, data FROM planner_images WHERE id = ? AND trip_id = ?").bind(imageId, a.row!.id).first<{ mime: string; data: string }>();
    if (!row)
        return response({ error: "Picture not found." }, 404);
    const bytes = Uint8Array.from(atob(row.data), c => c.charCodeAt(0));
    // Private to this signed-in browser; the id never points at different bytes, so it may be kept for a while.
    return new Response(bytes, { headers: { "Content-Type": row.mime, "Cache-Control": "private, max-age=604800, immutable", "Vary": "Cookie", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } });
}
catch (e) {
    return failed(e);
} }
export async function POST(request: Request) { try {
    const a = await access(request);
    if (a.error)
        return a.error;
    const input = await body(request, 260000);
    let image;
    try {
        image = parseImageDataUrl(input?.data);
    }
    catch (e) {
        return response({ error: (e as Error).message }, 400);
    }
    const count = await db().prepare("SELECT COUNT(*) AS n FROM planner_images WHERE trip_id = ?").bind(a.row!.id).first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_IMAGES_PER_TRIP)
        return response({ error: `This trip already has ${MAX_IMAGES_PER_TRIP} pictures, which is the limit.` }, 400);
    const imageId = crypto.randomUUID();
    await db().prepare("INSERT INTO planner_images (id, trip_id, mime, data, bytes, created_at, created_by) VALUES (?,?,?,?,?,?,?)").bind(imageId, a.row!.id, image.mime, image.base64, image.bytes, new Date().toISOString(), a.user!.displayName).run();
    return response({ imageId, bytes: image.bytes }, 201);
}
catch (e) {
    return failed(e);
} }
