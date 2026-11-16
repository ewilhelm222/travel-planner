import { getChatGPTUser } from "../../chatgpt-auth";
import { body, db, response, isCreator, snapshot, userView, failed } from "../../../lib/trip-store";
import { normalizeTrip, thanksgivingExample, upgradeLegacy } from "../../../lib/trips.mjs";
import { createSampleTrip } from "../../../lib/prototype.mjs";
export const dynamic = "force-dynamic";
export async function GET() { const user = await getChatGPTUser(); if (!user)
    return response({ error: "Sign in to see your trips." }, 401); try {
    const rows = await db().prepare("SELECT id, document, revision, updated_at, owner_id FROM planner_trips WHERE archived_at IS NULL AND (owner_id = ? OR EXISTS (SELECT 1 FROM json_each(editor_emails) WHERE lower(value) = ?)) ORDER BY updated_at DESC").bind(user.userId, user.email.toLowerCase()).all<{
        id: string;
        document: string;
        revision: number;
        updated_at: string;
        owner_id: string;
    }>();
    // Only the organizer sees, and can restore, trips they deleted.
    const archived = await db().prepare("SELECT id, document, archived_at FROM planner_trips WHERE owner_id = ? AND archived_at IS NOT NULL ORDER BY archived_at DESC").bind(user.userId).all<{
        id: string;
        document: string;
        archived_at: string;
    }>();
    return response({ user: userView(user), canCreate: isCreator(user), archived: archived.results.map(r => ({ id: r.id, title: JSON.parse(r.document).title, archivedAt: r.archived_at })), trips: rows.results.map(r => { const t = JSON.parse(r.document); return { id: r.id, title: t.title, subtitle: t.subtitle, kind: t.kind, start: t.start, end: t.end, revision: r.revision, role: r.owner_id === user.userId ? "organizer" : "editor" }; }) });
}
catch (e) {
    return failed(e);
} }
export async function POST(request: Request) {
    const user = await getChatGPTUser();
    if (!user)
        return response({ error: "Sign in to create a trip." }, 401);
    if (!isCreator(user))
        return response({ error: "Only an organizer can create trips." }, 403);
    try {
        const input = await body(request);
        let trip;
        if (input.template === "thanksgiving")
            trip = thanksgivingExample();
        else if (input.template === "legacy") {
            const old = await db().prepare("SELECT document FROM prototype_trips WHERE id = 'synthetic-trip'").first<{
                document: string;
            }>();
            trip = upgradeLegacy(old ? JSON.parse(old.document) : createSampleTrip());
        }
        else
            trip = input.trip;
        const id = crypto.randomUUID();
        try {
            trip = normalizeTrip(trip, id);
        }
        catch (e) {
            return response({ error: (e as Error).message }, 400);
        }
        const now = new Date().toISOString();
        await db().batch([
            db().prepare("INSERT INTO planner_trips (id,owner_id,document,revision,updated_at,updated_by) VALUES (?,?,?,1,?,?)").bind(id, user.userId, JSON.stringify(trip), now, user.displayName),
            db().prepare("INSERT INTO planner_changes (trip_id,revision,actor_id,actor_name,at,action,summary) VALUES (?,1,?,?,?,'create','Created this trip')").bind(id, user.userId, user.displayName, now),
        ]);
        return response({ user: userView(user), snapshot: { trip, revision: 1, revisions: {}, updatedAt: now, updatedBy: user.displayName } }, 201);
    }
    catch (e) {
        return failed(e);
    }
}
