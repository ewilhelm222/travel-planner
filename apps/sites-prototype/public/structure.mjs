// Pure helpers for places, stays, journeys and activity links, shared by the
// server rules, the planner forms and the tests.
export const LEG_MODES = ["Train", "Car", "Plane", "Bus", "Ferry", "Walk", "Other"];
export const MAX_LINKS = 10;

/** Everything that points at a place: activities, stays, and journeys (from or to). */
export function placeReferences(trip, placeId) {
  const pick = rows => rows.map(r => ({ id: r.id, title: r.title || r.name || r.lodging || r.id }));
  const refs = {
    activities: pick((trip.activities || []).filter(a => a.placeId === placeId)),
    stays: pick((trip.stays || []).filter(s => s.placeId === placeId)),
    legs: pick((trip.legs || []).filter(l => l.from === placeId || l.to === placeId)),
  };
  return { ...refs, total: refs.activities.length + refs.stays.length + refs.legs.length };
}
export function placeReferenceSummary(refs) {
  const part = (rows, one, many) => rows.length ? `${rows.length} ${rows.length === 1 ? one : many}` : "";
  return [part(refs.activities, "activity", "activities"), part(refs.stays, "stay", "stays"), part(refs.legs, "journey", "journeys")].filter(Boolean).join(", ");
}

const webUrl = value => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && value.length <= 500;
  } catch { return false; }
};
/** Keep only well-formed web links: `{ label, url }`, http(s) only, at most MAX_LINKS. Throws on a bad one. */
export function normalizeLinks(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_LINKS) throw new Error(`An activity can have up to ${MAX_LINKS} links.`);
  return value.map(link => {
    const url = typeof link?.url === "string" ? link.url.trim() : "";
    if (!webUrl(url)) throw new Error("Each link needs a complete web address starting with http:// or https://.");
    return { label: typeof link.label === "string" ? link.label.trim().slice(0, 120) : "", url };
  });
}
/** One link per line: an optional label, then the address. Blank lines are ignored. */
export function parseLinks(text) {
  return String(text || "").split("\n").map(line => line.trim()).filter(Boolean).map(line => {
    const at = line.search(/https?:\/\/\S+$/i);
    return at < 0 ? { label: "", url: line } : { label: line.slice(0, at).replace(/[\s|:·-]+$/, "").trim(), url: line.slice(at) };
  });
}
export const formatLinks = links => (links || []).map(l => l.label ? `${l.label} ${l.url}` : l.url).join("\n");
