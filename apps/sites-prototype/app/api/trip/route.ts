import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { applyChange, createSampleTrip, TRIP_ID, validateChange } from "../../../lib/prototype.mjs";

export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" } });

async function readTrip() {
  if (!env.DB) throw new Error("Database unavailable");
  const row = await env.DB.prepare("SELECT document, revision, updated_at, updated_by FROM prototype_trips WHERE id = ?").bind(TRIP_ID).first<{ document: string; revision: number; updated_at: string; updated_by: string }>();
  return row ? { trip: JSON.parse(row.document), revision: row.revision, updatedAt: row.updated_at, updatedBy: row.updated_by } : null;
}

function validOrigin(request: Request) {
  return request.headers.get("Origin") === new URL(request.url).origin && request.headers.get("Sec-Fetch-Site") !== "cross-site";
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return response({ error: "Sign in to view this trip." }, 401);
  try { return response({ user: { id: user.userId, name: user.displayName }, snapshot: await readTrip() }); }
  catch (error) { console.error("Trip read failed", error); return response({ error: "The itinerary could not be loaded. Try again shortly." }, 503); }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return response({ error: "Sign in to start the sample trip." }, 401);
  if (!validOrigin(request)) return response({ error: "Open the planner to make changes." }, 403);
  try {
    if (!env.DB) throw new Error("Database unavailable");
    await env.DB.prepare("INSERT INTO prototype_trips (id, document, revision, updated_at, updated_by) VALUES (?, ?, 1, ?, ?) ON CONFLICT(id) DO NOTHING")
      .bind(TRIP_ID, JSON.stringify(createSampleTrip()), new Date().toISOString(), user.displayName).run();
    return response({ user: { id: user.userId, name: user.displayName }, snapshot: await readTrip() });
  } catch (error) { console.error("Trip initialization failed", error); return response({ error: "The sample trip could not be started." }, 503); }
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return response({ error: "Sign in to edit this trip." }, 401);
  if (!validOrigin(request)) return response({ error: "Open the planner to make changes." }, 403);
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) return response({ error: "Expected a JSON edit." }, 415);
  let change;
  try {
    const text = await request.text();
    if (text.length > 12000) return response({ error: "This edit is too large." }, 413);
    change = JSON.parse(text);
  } catch { return response({ error: "The edit could not be read." }, 400); }
  const invalid = validateChange(change);
  if (invalid) return response({ error: invalid }, 400);
  try {
    const snapshot = await readTrip();
    if (!snapshot) return response({ error: "Start the sample trip first." }, 404);
    if (snapshot.revision !== change.revision) return response({ error: "Another planner saved a change. Your draft is still here; load the latest plan before editing again." }, 409);
    let next;
    try { next = applyChange(snapshot.trip, change.activityId, change.patch); }
    catch (error) { return response({ error: error instanceof Error ? error.message : "Invalid edit." }, 400); }
    const updatedAt = new Date().toISOString();
    // Atomic compare-and-swap; concurrent writers cannot both save the same revision.
    const result = await env.DB!.prepare("UPDATE prototype_trips SET document = ?, revision = revision + 1, updated_at = ?, updated_by = ? WHERE id = ? AND revision = ? RETURNING revision")
      .bind(JSON.stringify(next), updatedAt, user.displayName, TRIP_ID, change.revision).first<{ revision: number }>();
    if (!result) return response({ error: "Another planner saved a change. Your draft is still here; load the latest plan before editing again." }, 409);
    return response({ user: { id: user.userId, name: user.displayName }, snapshot: { trip: next, revision: result.revision, updatedAt, updatedBy: user.displayName } });
  } catch (error) { console.error("Trip update failed", error); return response({ error: "This change was not confirmed. Refresh to check the saved plan before trying again." }, 503); }
}
