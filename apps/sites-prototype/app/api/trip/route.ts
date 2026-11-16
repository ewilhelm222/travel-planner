import { access, body, commit, response, snapshot, userView, failed, conflict } from "../../../lib/trip-store";
import { diffTrips, summarize } from "../../../public/history.mjs";
import { applyTripChange, editorRestriction } from "../../../lib/trips.mjs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try {
    const a = await access(request);
    if (a.error)
        return a.error;
    return response({ user: userView(a.user!), snapshot: snapshot(a.row!), isOwner: a.isOwner, role: a.role });
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
    // Editors save through the same revision check as the organizer, minus guest-visibility choices.
    const restricted = a.isOwner ? null : editorRestriction(snapshot(a.row!).trip, input);
    if (restricted)
        return response({ error: restricted }, 400);
    const before = snapshot(a.row!).trip;
    let trip;
    try {
        trip = applyTripChange(before, input);
    }
    catch (e) {
        return response({ error: (e as Error).message, references: (e as { references?: unknown }).references }, 400);
    }
    // The change-log row and the document update are one batch; see commit().
    const records = diffTrips(before, trip);
    const saved = await commit({ id: a.row!.id, expected: input.revision, user: a.user!, action: typeof input.action === "string" ? input.action.slice(0, 40) : "edit", summary: summarize(input, records), records, set: { document: JSON.stringify(trip) } });
    if (!saved)
        return conflict();
    return response({ user: userView(a.user!), isOwner: a.isOwner, role: a.role, snapshot: { trip, revision: saved.revision, updatedAt: saved.now, updatedBy: a.user!.displayName } });
}
catch (e) {
    return failed(e);
} }
// The old global single-trip write endpoint is deliberately retired.
