import { db, response, snapshot, failed, type Row } from "../../../lib/trip-store";
import { tokenHash } from "../../../lib/trips.mjs";
import { weatherPlan } from "../../../lib/weather.mjs";
import { weatherCache } from "../../../lib/weather-cache";
export const dynamic = "force-dynamic";
// The same weather line for the guest link, with the guest token in the Authorization header as for the
// guest schedule. Guests receive each stay's location rounded to two decimals (about a kilometre) and the
// days it is for, so that their browser can ask the forecast service: the owner's choice, November 18, 2026.
// No place name or address is sent.
export async function GET(request: Request) { try {
    const token = request.headers.get("Authorization")?.match(/^Share ([A-Za-z0-9_-]{43})$/)?.[1];
    const r = token ? await db().prepare("SELECT * FROM planner_trips WHERE share_token_hash = ? AND archived_at IS NULL").bind(await tokenHash(token)).first<Row>() : null;
    if (!r)
        return response({ error: "This guest link is unavailable or has been disabled." }, 404);
    return response(await weatherPlan(snapshot(r).trip, { cache: weatherCache }));
}
catch (e) {
    return failed(e);
} }
