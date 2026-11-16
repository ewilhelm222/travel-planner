import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { tripRole, withTiming } from "./trips.mjs";
import { staleRecords, staleMessage } from "../public/revisions.mjs";
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
    record_revisions: string;
    updated_at: string;
    updated_by: string;
    share_token_hash: string | null;
    shared_at: string | null;
    archived_at: string | null;
    archived_by: string | null;
};
export async function row(id: string) { return db().prepare("SELECT * FROM planner_trips WHERE id = ?").bind(id).first<Row>(); }
export function revisionMap(r: { record_revisions?: string | null }): Record<string, number> {
    try {
        const value = JSON.parse(r.record_revisions || "{}");
        return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    }
    catch {
        return {};
    }
}
// `revision` is the trip-wide version counter; `revisions` holds each record's own revision.
export const snapshot = (r: Row) => ({ trip: withTiming(JSON.parse(r.document)), revision: r.revision, revisions: revisionMap(r), updatedAt: r.updated_at, updatedBy: r.updated_by });
// Archived (soft-deleted) trips are closed to everyone except the organizer's archive controls.
export async function access(request: Request, options: { archived?: boolean } = {}) {
    const user = await getChatGPTUser();
    if (!user)
        return { error: response({ error: "Sign in to view or edit your trips." }, 401) };
    const r = await row(new URL(request.url).searchParams.get("id") || "");
    const role = tripRole(r, user);
    if (!r || !role || (r.archived_at && role !== "organizer"))
        return { error: response({ error: "This trip is unavailable to this account." }, 403) };
    if (r.archived_at && !options.archived)
        return { error: response({ error: "This trip was deleted and is in your archive. Restore it from “Archived trips” to open it." }, 410) };
    return { user, row: r, role, isOwner: role === "organizer" };
}
type Actor = { userId: string; displayName: string };
export type LoggedRecord = { kind: string; id: string; before: unknown; after: unknown };
/**
 * The only way a trip row changes. One D1 batch (a single transaction) appends the
 * change-log row and updates the trip, both guarded by the same expected revision,
 * so a change is never saved without its log entry and a stale save writes neither.
 * `set` lists extra columns to assign; returns null when the revision no longer matches.
 */
export async function commit(o: { id: string; expected: number; user: Actor; action: string; summary: string; records?: LoggedRecord[]; undoes?: number | null; set?: Record<string, string | null>; archived?: boolean }) {
    const now = new Date().toISOString(), guard = `id=? AND revision=? AND archived_at IS ${o.archived ? "NOT NULL" : "NULL"}`;
    const columns = Object.keys(o.set || {});
    if (columns.some(c => !/^[a-z_]+$/.test(c)))
        throw new Error("Invalid column.");
    const [, updated] = await db().batch<{ revision: number }>([
        db().prepare(`INSERT INTO planner_changes (trip_id,revision,actor_id,actor_name,at,action,summary,records,undoes) SELECT id,revision+1,?,?,?,?,?,?,? FROM planner_trips WHERE ${guard}`).bind(o.user.userId, o.user.displayName, now, o.action, o.summary.slice(0, 300), JSON.stringify(o.records || []), o.undoes ?? null, o.id, o.expected),
        db().prepare(`UPDATE planner_trips SET ${columns.map(c => `${c}=?,`).join("")}revision=revision+1,updated_at=?,updated_by=? WHERE ${guard} RETURNING revision`).bind(...columns.map(c => o.set![c]), now, o.user.displayName, o.id, o.expected),
    ]);
    const saved = updated.results?.[0];
    return saved ? { revision: saved.revision, now } : null;
}
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

/**
 * Stale-write check. A current planner sends `base`: the revision of each record it relied on,
 * and only a change to one of those records is a conflict. A page loaded before per-record
 * revisions sends only the trip-wide `revision` and keeps the old strict rule.
 * Returns a response to send, or null when the save may proceed.
 */
export function staleCheck(input: { base?: unknown; revision?: unknown }, r: Row) {
    if (input.base !== undefined) {
        let stale;
        try {
            stale = staleRecords(JSON.parse(r.document), revisionMap(r), input.base);
        }
        catch (e) {
            return response({ error: (e as Error).message }, 400);
        }
        return stale.length ? response({ error: staleMessage(stale), conflicts: stale }, 409) : null;
    }
    if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 1)
        return response({ error: "A saved revision is required." }, 400);
    return r.revision === input.revision ? null : conflict();
}
type Planned = Omit<Parameters<typeof commit>[0], "id" | "expected"> & { respond: (saved: { revision: number; now: string }) => Response };
/**
 * Read, decide, write, and try again if someone else saved in between. `plan` sees the
 * latest row each time and returns either a response (refuse) or what to commit. Because the
 * per-record check is repeated on every attempt, a save to a different record succeeds on the
 * retry and a save to the same record is refused; two writers can never both replace one record.
 */
export async function transact(first: Row, plan: (current: Row) => Planned | Response | Promise<Planned | Response>, options: { archived?: boolean } = {}) {
    let current: Row | null = first;
    for (let attempt = 0; attempt < 8; attempt++) {
        if (attempt)
            current = await row(first.id);
        if (!current || !!current.archived_at !== !!options.archived)
            return conflict();
        const planned = await plan(current);
        if (planned instanceof Response)
            return planned;
        const { respond, ...change } = planned;
        const saved = await commit({ ...change, id: current.id, expected: current.revision });
        if (saved)
            return respond(saved);
    }
    return conflict();
}
