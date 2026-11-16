import { access, body, db, response, failed } from "../../../lib/trip-store";
import { editorEmail, editorList, MAX_EDITORS } from "../../../lib/trips.mjs";
export const dynamic = "force-dynamic";
const organizerOnly = () => response({ error: "Only the organizer manages editors." }, 403);
// The editor list is shown to, and changed by, the organizer alone. Nothing here sends an invitation.
export async function GET(request: Request) { try {
    const a = await access(request);
    if (a.error)
        return a.error;
    if (!a.isOwner)
        return organizerOnly();
    return response({ editors: editorList(a.row!), max: MAX_EDITORS });
}
catch (e) {
    return failed(e);
} }
export async function POST(request: Request) { try {
    const a = await access(request);
    if (a.error)
        return a.error;
    if (!a.isOwner)
        return organizerOnly();
    const input = await body(request, 2000);
    if (!["add", "remove"].includes(input.action))
        return response({ error: "Choose add or remove." }, 400);
    let email: string;
    try {
        email = editorEmail(input.email);
    }
    catch (e) {
        return response({ error: (e as Error).message }, 400);
    }
    if (input.action === "add" && email === a.user!.email.toLowerCase())
        return response({ error: "You already organize this trip." }, 400);
    // Single atomic statements: two organizer tabs cannot drop each other's change.
    const saved = input.action === "add"
        ? await db().prepare("UPDATE planner_trips SET editor_emails = json_insert(editor_emails, '$[#]', ?) WHERE id = ? AND owner_id = ? AND json_array_length(editor_emails) < ? AND NOT EXISTS (SELECT 1 FROM json_each(planner_trips.editor_emails) WHERE lower(value) = ?) RETURNING editor_emails").bind(email, a.row!.id, a.user!.userId, MAX_EDITORS, email).first<{ editor_emails: string }>()
        : await db().prepare("UPDATE planner_trips SET editor_emails = (SELECT json_group_array(value) FROM json_each(planner_trips.editor_emails) WHERE lower(value) <> ?) WHERE id = ? AND owner_id = ? RETURNING editor_emails").bind(email, a.row!.id, a.user!.userId).first<{ editor_emails: string }>();
    if (saved)
        return response({ editors: editorList(saved), max: MAX_EDITORS });
    const current = editorList((await db().prepare("SELECT editor_emails FROM planner_trips WHERE id = ?").bind(a.row!.id).first<{ editor_emails: string }>()) || {});
    if (input.action === "add" && current.includes(email))
        return response({ editors: current, max: MAX_EDITORS });
    return response({ error: input.action === "add" ? `A trip can have up to ${MAX_EDITORS} editors.` : "The editor list was not changed. Refresh and try again." }, 400);
}
catch (e) {
    return failed(e);
} }
