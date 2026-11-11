import { access, body, db, response, snapshot, userView, failed, conflict } from "../../../lib/trip-store";
import { applyTripChange } from "../../../lib/trips.mjs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try {
    const a = await access(request);
    if (a.error)
        return a.error;
    return response({ user: userView(a.user!), snapshot: snapshot(a.row!), isOwner: a.row!.owner_id === a.user!.userId });
}
catch (e) {
    return failed(e);
} }
export async function PATCH(request: Request) { try {
    const a = await access(request);
    if (a.error)
        return a.error;
    const input = await body(request);
    if (!Number.isSafeInteger(input.revision) || input.revision < 1)
        return response({ error: "A saved revision is required." }, 400);
    if (a.row!.revision !== input.revision)
        return conflict();
    if(snapshot(a.row!).trip.people?.length && input.patch && "participants" in input.patch && request.headers.get("X-Waypoint-Participant-Model")!=="people-v1")
        return response({error:"Reload the planner before changing participants. This trip now has individual travelers; your draft is still here."},409);
    let trip;
    try {
        trip = applyTripChange(snapshot(a.row!).trip, input);
    }
    catch (e) {
        return response({ error: (e as Error).message }, 400);
    }
    const now = new Date().toISOString();
    const r = await db().prepare("UPDATE planner_trips SET document=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=? RETURNING revision").bind(JSON.stringify(trip), now, a.user!.displayName, a.row!.id, input.revision).first<{
        revision: number;
    }>();
    if (!r)
        return conflict();
    return response({ user: userView(a.user!), isOwner: a.row!.owner_id === a.user!.userId, snapshot: { trip, revision: r.revision, updatedAt: now, updatedBy: a.user!.displayName } });
}
catch (e) {
    return failed(e);
} }
// The old global single-trip write endpoint is deliberately retired.
