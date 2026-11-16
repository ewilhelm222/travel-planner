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
    // Venues that sit inside this place when it is used as an area.
    venues: pick((trip.places || []).filter(p => p.parentId === placeId)),
  };
  return { ...refs, total: refs.activities.length + refs.stays.length + refs.legs.length + refs.venues.length };
}
export function placeReferenceSummary(refs) {
  const part = (rows, one, many) => rows.length ? `${rows.length} ${rows.length === 1 ? one : many}` : "";
  return [part(refs.activities, "activity", "activities"), part(refs.stays, "stay", "stays"), part(refs.legs, "journey", "journeys"), part(refs.venues || [], "venue inside it", "venues inside it")].filter(Boolean).join(", ");
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

// Card pictures: small raster images only, already downscaled by the browser. SVG is refused (it can carry script).
export const MAX_IMAGE_BYTES = 160000;
export const MAX_IMAGES_PER_TRIP = 200;
const MAGIC = { "image/jpeg": [0xff, 0xd8, 0xff], "image/png": [0x89, 0x50, 0x4e, 0x47], "image/webp": [0x52, 0x49, 0x46, 0x46] };
/** Check a `data:` URL and return `{ mime, base64, bytes }`. Throws a plain-language error otherwise. */
export function parseImageDataUrl(value) {
  const match = typeof value === "string" ? /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value) : null;
  if (!match) throw new Error("Choose a JPEG, PNG or WebP picture.");
  const [, mime, base64] = match;
  const bytes = Math.floor(base64.length * 3 / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  if (bytes > MAX_IMAGE_BYTES) throw new Error("This picture is still too large after shrinking. Try a different one.");
  let head;
  try { head = atob(base64.slice(0, 16)); } catch { throw new Error("Choose a JPEG, PNG or WebP picture."); }
  if (!MAGIC[mime].every((byte, i) => head.charCodeAt(i) === byte) || (mime === "image/webp" && head.slice(8, 12) !== "WEBP")) throw new Error("That file is not the kind of picture it claims to be.");
  return { mime, base64, bytes };
}
/** The address a signed-in planner's browser loads a card picture from. */
export const imageUrl = (tripId, imageId) => `/api/image?id=${encodeURIComponent(tripId)}&image=${encodeURIComponent(imageId)}`;
