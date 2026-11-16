import { access, body, response, snapshot, userView, failed, staleCheck, transact } from "../../../lib/trip-store";
import { applyTripChange, editorRestriction } from "../../../lib/trips.mjs";
import { diffTrips, summarize } from "../../../public/history.mjs";
import { advance } from "../../../public/revisions.mjs";
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
    const legacyClient = request.headers.get("X-Waypoint-Participant-Model") !== "people-v1";
    // transact() repeats this against the latest saved trip if another save lands first.
    return await transact(a.row!, current => {
        const { trip: before, revisions } = snapshot(current);
        // Stale-write rejection comes first, for every role: per record, or trip-wide for an older page.
        const stale = staleCheck(input, current);
        if (stale)
            return stale;
        if (before.people?.length && input.patch && "participants" in input.patch && legacyClient)
            return response({ error: "Reload the planner before changing participants. This trip now has individual travelers; your draft is still here." }, 409);
        // Editors save through the same checks as the organizer, minus guest-visibility choices.
        const restricted = a.isOwner ? null : editorRestriction(before, input);
        if (restricted)
            return response({ error: restricted }, 400);
        let trip;
        try {
            // Applied to the latest trip, never to the caller's older copy.
            trip = applyTripChange(before, input);
        }
        catch (e) {
            return response({ error: (e as Error).message, references: (e as { references?: unknown }).references }, 400);
        }
        const changed = diffTrips(before, trip), next = advance(revisions, changed);
        return {
            user: a.user!, action: typeof input.action === "string" ? input.action.slice(0, 40) : "edit", summary: summarize(input, changed), records: next.records,
            set: { document: JSON.stringify(trip), record_revisions: JSON.stringify(next.revisions) },
            respond: saved => response({ user: userView(a.user!), isOwner: a.isOwner, role: a.role, snapshot: { trip, revision: saved.revision, revisions: next.revisions, updatedAt: saved.now, updatedBy: a.user!.displayName } }),
        };
    });
}
catch (e) {
    return failed(e);
} }
// The old global single-trip write endpoint is deliberately retired.
