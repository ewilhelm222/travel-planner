import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { tripRole } from "./trips.mjs";
export const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } });
export const db = () => { if (!env.DB)
    throw new Error("Database unavailable"); return env.DB; };
export const isCreator = (user: {
    email: string;
}) => ((env as unknown as Record<string, string>).PLANNER_CREATOR_EMAILS || "").toLowerCase().split(",").map(s => s.trim()).includes(user.email.toLowerCase());
export const validOrigin = (request: Request) => request.headers.get("Origin") === new URL(request.url).origin && request.headers.get("Sec-Fetch-Site") !== "cross-site";
export async function body(request: Request, max = 250000) { if (!validOrigin(request))
    throw Object.assign(new Error("Open the planner to make changes."), { status: 403 }); if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    throw Object.assign(new Error("Expected JSON."), { status: 415 }); const text = await request.text(); if (text.length > max)
    throw Object.assign(new Error("This request is too large."), { status: 413 }); try {
    return JSON.parse(text);
}
catch {
    throw Object.assign(new Error("Invalid JSON."), { status: 400 });
} }
export type Row = {
    id: string;
    owner_id: string;
    editor_emails: string;
    document: string;
    revision: number;
    updated_at: string;
    updated_by: string;
    share_token_hash: string | null;
    shared_at: string | null;
};
export async function row(id: string) { return db().prepare("SELECT * FROM planner_trips WHERE id = ?").bind(id).first<Row>(); }
export const snapshot = (r: Row) => ({ trip: JSON.parse(r.document), revision: r.revision, updatedAt: r.updated_at, updatedBy: r.updated_by });
export async function access(request: Request) { const user = await getChatGPTUser(); if (!user)
    return { error: response({ error: "Sign in to view or edit your trips." }, 401) }; const r = await row(new URL(request.url).searchParams.get("id") || ""); const role = tripRole(r, user); if (!r || !role)
    return { error: response({ error: "This trip is unavailable to this account." }, 403) }; return { user, row: r, role, isOwner: role === "organizer" }; }
export const userView = (u: {
    userId: string;
    displayName: string;
}) => ({ id: u.userId, name: u.displayName });
export const failed = (error: unknown) => { const e = error as {
    status?: number;
    message?: string;
}; if (e.status)
    return response({ error: e.message }, e.status); console.error("Planner operation failed", error); return response({ error: "The operation was not confirmed. Refresh and try again." }, 503); };
export const conflict = () => response({ error: "Another planner saved a change. Your draft is still here; load the latest plan before editing again." }, 409);
