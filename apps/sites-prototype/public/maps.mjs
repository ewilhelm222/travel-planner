// Tile-free schematic maps and place location rules. Pure: no DOM, no network.
// Shared by the server (validation), the planner (drawing) and the tests.
//
// Coordinate systems are recorded, never converted. WGS84 (GPS), GCJ02 (Amap,
// Apple Maps inside mainland China) and BD09 (Baidu) differ by up to several hundred
// metres, and there is no simple offset between them. This file contains no conversion.
import { matchesSelection } from "./participants.mjs";

export const COORD_SYSTEMS = ["WGS84", "GCJ02", "BD09", "unknown"];
export const COORD_LABELS = { WGS84: "WGS-84 · GPS and most maps outside mainland China", GCJ02: "GCJ-02 · Amap, Tencent, Apple Maps in mainland China", BD09: "BD-09 · Baidu Maps", unknown: "Unknown · I am not sure where these numbers came from" };
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const text = (v, max) => typeof v === "string" ? v.trim().slice(0, max) : "";

function number(value, limit, name) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : typeof value === "string" && /^\s*[-+]?\d{1,3}(\.\d+)?\s*$/.test(value) ? Number(value) : NaN;
  if (!Number.isFinite(n) || Math.abs(n) > limit) throw new Error(`${name} must be a number between ${-limit} and ${limit}, in decimal degrees (for example ${name === "Latitude" ? "39.9163" : "116.3972"}).`);
  return Math.round(n * 1e6) / 1e6;
}
/** A reviewed map link must be https and on the provider's own site. Empty is allowed. */
export function mapUrl(kind, value) {
  const url = text(value, 500);
  if (!url) return "";
  let host = "", protocol = "";
  try { ({ hostname: host, protocol } = new URL(url)); } catch { /* handled below */ }
  const ok = protocol === "https:" && (kind === "amap" ? host === "amap.com" || host.endsWith(".amap.com") : host === "maps.apple.com");
  if (!ok) throw new Error(kind === "amap" ? "The Amap link must start with https:// and be on amap.com (for example a link from Amap's Share button)." : "The Apple Maps link must start with https://maps.apple.com/.");
  return url;
}
/**
 * Read what a person typed into "Location for the map". Three answers, never a guess:
 *   { kind: "empty" }
 *   { kind: "coordinates", lat, lng }  for a pair in decimal degrees, e.g. "39.9163, 116.3972" or "39.9163° N 116.3972° E"
 *   { kind: "address", text }          for anything with words in it: a street address or a place name
 * Text made only of numbers and compass marks that is not a valid pair is refused with a reason,
 * rather than being searched for as if it were an address. Nothing is converted between systems.
 */
export function parseLocation(value) {
  const typed = text(value, 500);
  if (!typed) return { kind: "empty" };
  // Compass letters (on their own or attached to a number) and degree marks are set aside before asking "are there words here?".
  const bare = typed.replace(/[°º˚]/g, " ").replace(/(?<!\p{L})[NSEW](?!\p{L})/giu, " ");
  if (/\p{L}/u.test(bare)) return { kind: "address", text: typed };
  if (/['′’"″”]/.test(typed)) throw new Error("These look like coordinates in degrees, minutes and seconds. Enter decimal degrees instead (for example 39.9163, 116.3972), or type the address.");
  const flat = typed.replace(/[°º˚]/g, " ").replace(/[,;，；、]/g, " ").replace(/\s+/g, " ").trim(), n = "([-+]?\\d{1,3}(?:\\.\\d+)?)", c = "([NSEW])";
  const bad = () => new Error("This looks like coordinates, but not a complete pair. Enter latitude then longitude in decimal degrees (for example 39.9163, 116.3972), or type the address or place name.");
  // A compass letter may come before its number ("N 39.9 E 116.4") or after it ("39.9 N, 116.4 E"), attached or not.
  const before = flat.match(new RegExp(`^${c} ?${n} ${c}? ?${n}$`, "i")), after = flat.match(new RegExp(`^${n} ?${c}? ${n} ?${c}?$`, "i"));
  const values = before ? [{ token: before[2], letter: before[1] }, { token: before[4], letter: before[3] }] : after ? [{ token: after[1], letter: after[2] }, { token: after[3], letter: after[4] }] : null;
  // "39,9163 116,3972": decimal commas cannot be told apart from separators, so say so.
  if (!values) throw /^[-+]?\d+ \d+ [-+]?\d+ \d+$/.test(flat) ? new Error("Use a full stop for decimals and a comma between the two numbers (for example 39.9163, 116.3972).") : bad();
  for (const v of values) v.letter = (v.letter || "").toUpperCase();
  let [a, b] = values;
  // "116.3972 E, 39.9163 N" is longitude first, and says so; without letters the order is latitude, longitude.
  if (/[EW]/.test(a.letter) && (!b.letter || /[NS]/.test(b.letter))) [a, b] = [b, a];
  if (/[EW]/.test(a.letter) || /[NS]/.test(b.letter)) throw bad();
  const signed = (v, negative) => { const n = Number(v.token); if (v.letter && n < 0) throw bad(); return v.letter === negative ? -n : n; };
  return { kind: "coordinates", lat: number(signed(a, "S"), 90, "Latitude"), lng: number(signed(b, "W"), 180, "Longitude") };
}
/**
 * The location part of a place: an optional typed location (an address or place name, or
 * coordinates), the system the coordinates are in, where they came from, and map links a person
 * has opened and checked. `locationText` is kept exactly as typed. When it holds coordinates,
 * `lat`/`lng` are read from it; when it holds an address there are no coordinates at all, because
 * an address is never turned into a point here. A place saved before `locationText` existed keeps
 * its `lat`/`lng` untouched. Coordinates always come with an explicit system (which may be "unknown").
 */
export function normalizePlaceGeo(place) {
  const locationText = text(place.locationText, 500), typed = parseLocation(locationText);
  let lat, lng;
  if (typed.kind === "coordinates") ({ lat, lng } = typed);
  else if (typed.kind === "address") lat = lng = null;
  else { lat = number(place.lat, 90, "Latitude"); lng = number(place.lng, 180, "Longitude"); }
  if ((lat === null) !== (lng === null)) throw new Error("Enter both latitude and longitude, or leave both empty.");
  if (lat !== null && !COORD_SYSTEMS.includes(place.coordSystem)) throw new Error("Say which coordinate system these numbers use, or choose Unknown. They are never converted or guessed.");
  const amapUrl = mapUrl("amap", place.amapUrl), appleMapsUrl = mapUrl("apple", place.appleMapsUrl);
  return { locationText, lat, lng, coordSystem: lat === null ? "" : place.coordSystem, coordSource: text(place.coordSource, 300), amapUrl, appleMapsUrl, navReviewed: place.navReviewed === true && !!(amapUrl || appleMapsUrl) };
}
/** The address or place name typed as the map location, or "" when the place has coordinates or nothing. */
export const locationAddress = place => { if (!place?.locationText) return ""; try { const l = parseLocation(place.locationText); return l.kind === "address" ? l.text : ""; } catch { return ""; } };
/** What to put back in the "Location for the map" box: the text as typed, or an older place's stored pair. */
export const locationInput = place => place?.locationText || (hasCoordinates(place) ? `${place.lat}, ${place.lng}` : "");
const SYSTEM_NAMES = { WGS84: "WGS-84", GCJ02: "GCJ-02", BD09: "BD-09" };
const degrees = (n, positive, negative) => `${Math.abs(n)}° ${n < 0 ? negative : positive}`;
/**
 * The saved location in words, for people: `{ kind, text, note }`. Coordinates read as
 * "39.9163° N, 116.3972° E" with their system; an address reads as typed.
 */
export function describeLocation(place) {
  const address = locationAddress(place);
  if (address) return { kind: "address", text: address, note: "Address for map apps. Not positioned on the drawing, because an address is not turned into coordinates." };
  if (!hasCoordinates(place)) return { kind: "empty", text: "", note: "" };
  return { kind: "coordinates", text: `${degrees(place.lat, "N", "S")}, ${degrees(place.lng, "E", "W")}`, note: place.coordSystem === "unknown" ? "coordinate system unknown, not positioned" : SYSTEM_NAMES[place.coordSystem] || place.coordSystem };
}
/**
 * Map-app searches for a typed address: the text goes to the map app exactly as typed, and only
 * when a person follows the link. These are searches, not checked links; nothing is looked up
 * by the planner itself. No link is built from coordinates, and none for Amap (its link format
 * was never checked from here).
 */
export function searchLinks(place) {
  const query = locationAddress(place);
  if (!query) return [];
  const q = encodeURIComponent(query);
  return [{ label: "Apple Maps", url: `https://maps.apple.com/?q=${q}` }, { label: "Google Maps", url: `https://www.google.com/maps/search/?api=1&query=${q}` }];
}
/** Links to offer for getting there: only ones a person marked as opened and checked. */
export function reviewedLinks(place) {
  if (!place || place.navReviewed !== true) return [];
  return [place.amapUrl && { label: "Amap 高德", url: place.amapUrl }, place.appleMapsUrl && { label: "Apple Maps", url: place.appleMapsUrl }].filter(Boolean);
}
/** A name/address search to help a person find the place and then save a checked link. Not a reviewed link. */
export function appleSearchUrl(place) {
  const query = [place.localName || place.name, place.localAddress || place.address].filter(Boolean).join(" ");
  return query ? `https://maps.apple.com/?q=${encodeURIComponent(query)}` : "";
}
const providers = (search, q) => [{ label: "Apple Maps", url: `https://maps.apple.com/?${search ? "q" : "daddr"}=${q}` }, { label: "Google Maps", url: search ? `https://www.google.com/maps/search/?api=1&query=${q}` : `https://www.google.com/maps/dir/?api=1&destination=${q}` }];
/** Map-app searches for any text a person typed, exactly as typed. Empty text gives no links. */
export const textSearchLinks = value => { const t = text(value, 500); return t ? providers(true, encodeURIComponent(t)) : []; };
/** Map-app directions to a typed address, starting wherever the map app says the person is. Never from coordinates. */
export const textDirectionLinks = value => { const t = text(value, 500); return t ? providers(false, encodeURIComponent(t)) : []; };
/** The address text a place has for a map app: the typed map address first, else its local-script or English address. */
export const placeAddressText = place => locationAddress(place) || text(place?.localAddress, 500) || text(place?.address, 500);
/**
 * Every outside link to offer for a place, in the order to show them, each group with its own wording:
 *   reviewed    links a person opened and checked (unchanged; when present they are the only directions offered)
 *   search      map-app searches: of the typed map address, else of the place's address, else of its name
 *   directions  map-app directions to the address, only when there is an address and no reviewed link
 * Text only: nothing here is built from coordinates, and nothing is looked up by the planner.
 * In the guest projection a place has no address or links, so guests get no groups at all (`guest`).
 */
export function placeLinks(place, { guest = false } = {}) {
  if (!place || guest) return { reviewed: [], search: null, directions: null };
  const reviewed = reviewedLinks(place), typed = locationAddress(place), address = placeAddressText(place);
  const byName = [place.localName || place.name, address].filter(Boolean).join(" ");
  // A typed map address is always searchable as typed. The name-based fallback is offered only when nothing better exists.
  const search = typed ? { label: "Search this address in", kind: "address", links: textSearchLinks(typed) }
    : reviewed.length ? null
    : address ? { label: "Search this place and address in", kind: "place", links: textSearchLinks(byName) }
    : place.name ? { label: "Search this place’s name in", kind: "name", links: textSearchLinks(byName) } : null;
  const directions = address && !reviewed.length ? { label: "Directions to this address in", kind: "directions", links: textDirectionLinks(address) } : null;
  return { reviewed, search, directions };
}
/** The same for an activity that has no place yet but does have its own private address. */
export function activityLinks(activity, { guest = false } = {}) {
  const address = guest ? "" : text(activity?.address, 500);
  if (!address) return { reviewed: [], search: null, directions: null };
  return { reviewed: [], search: { label: "Search this address in", kind: "address", links: textSearchLinks(address) }, directions: { label: "Directions to this address in", kind: "directions", links: textDirectionLinks(address) } };
}
// ---- Google Maps Embed for the day map (owner decision, November 17, 2026) ----
// Used only when a key is configured. What is sent to Google is what a person entered: a typed
// address, or coordinates recorded as WGS-84, which is the system Google's embed expects. Coordinates
// in GCJ-02, BD-09 or an unknown system are never sent, because Google would draw them in the wrong
// place and converting them would be guesswork. A bare place name is not sent either.
export const EMBED_MAX_WAYPOINTS = 20;
/** A browser key as Google issues them; anything else is treated as "no key configured". */
export const validEmbedKey = key => typeof key === "string" && /^[A-Za-z0-9_-]{30,60}$/.test(key);
/** The text to give Google for a place, or null when the place has nothing usable. */
export function embedLocation(place) {
  if (!place) return null;
  // The guest projection carries the finished text and nothing else about the location.
  if (typeof place.mapQuery === "string") return place.mapQuery || null;
  const typed = locationAddress(place);
  if (typed) return typed;
  if (hasCoordinates(place) && place.coordSystem === "WGS84") return `${place.lat},${place.lng}`;
  return text(place.localAddress, 500) || text(place.address, 500) || null;
}
/**
 * How a day would be shown in a Google embed: one stop in place mode, several in directions mode
 * (first stop, the stops between as waypoints, last stop, in itinerary order). `{ ok: false, reason }`
 * when it cannot be: no stops, a stop with no usable location, or more waypoints than the embed takes.
 */
export function dayEmbed(model) {
  const stops = model?.kind === "day" ? model.stops : [];
  if (!stops.length) return { ok: false, reason: "" };
  const missing = stops.filter(s => !embedLocation(s.place));
  if (missing.length) {
    const names = [...new Set(missing.map(s => `“${s.name}”`))], other = missing.some(s => hasCoordinates(s.place));
    return { ok: false, reason: `Shown as a schematic, not on Google Maps, because ${names.join(", ")} ${names.length === 1 ? "has" : "have"} no address${other ? " and coordinates in a system Google Maps would misplace" : " or WGS-84 coordinates"}. Add one under Edit place.` };
  }
  const at = stops.map(s => embedLocation(s.place));
  if (at.length === 1) return { ok: true, mode: "place", q: at[0], count: 1 };
  if (at.length - 2 > EMBED_MAX_WAYPOINTS) return { ok: false, reason: `Shown as a schematic: Google Maps takes at most ${EMBED_MAX_WAYPOINTS + 2} stops in one map and this day has ${at.length}.` };
  return { ok: true, mode: "directions", origin: at[0], destination: at.at(-1), waypoints: at.slice(1, -1), count: at.length };
}
/** The embed address. The key travels in it, as Google's embed requires; it is never stored in a trip or in source. */
export function embedUrl(embed, key) {
  if (!embed?.ok || !validEmbedKey(key)) return "";
  const e = encodeURIComponent;
  return embed.mode === "place" ? `https://www.google.com/maps/embed/v1/place?key=${e(key)}&q=${e(embed.q)}`
    : `https://www.google.com/maps/embed/v1/directions?key=${e(key)}&origin=${e(embed.origin)}&destination=${e(embed.destination)}${embed.waypoints.length ? `&waypoints=${embed.waypoints.map(e).join("|")}` : ""}`;
}
/** The order of travel in words, for people who cannot see or use the drawing. Empty when there is nothing to say. */
export function routeText(model) {
  const name = id => model.nodes.find(n => n.id === id)?.name || "a place to confirm";
  if (model.kind === "day") return model.stops.length > 1 ? `In itinerary order: ${model.stops.map(s => `${s.n}. ${s.name}`).join(" → ")}.` : "";
  const journeys = model.edges.filter(e => e.kind === "journey");
  if (journeys.length) return `Journeys in date order: ${journeys.map(e => `${name(e.from)} → ${name(e.to)}${e.label ? ` (${e.label})` : ""}`).join("; ")}.`;
  return model.nodes.length > 1 ? `Places in date order: ${model.nodes.map(n => n.name).join(" → ")}. No journeys between them are entered yet.` : "";
}
export const hasCoordinates = place => typeof place?.lat === "number" && typeof place?.lng === "number";

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.id).localeCompare(String(b.id));

/**
 * Decide how to place nodes. Real positions are used only when at least two places have
 * coordinates in one and the same known system. Otherwise the places are laid out in plan
 * order, and the reason is given. Systems are never mixed on one drawing.
 */
function layout(nodes, compact = false) {
  const located = nodes.filter(n => hasCoordinates(n.place) && n.place.coordSystem !== "unknown");
  const systems = [...new Set(located.map(n => n.place.coordSystem))];
  const unknown = nodes.filter(n => hasCoordinates(n.place) && n.place.coordSystem === "unknown").length;
  let mode = "order", system = "", reason = "";
  if (systems.length > 1) reason = `These places use different coordinate systems (${systems.join(", ")}), so they are drawn in plan order instead of by position. Converting between systems would be guesswork.`;
  else if (located.length >= 2) { mode = "position"; system = systems[0]; }
  else reason = nodes.length > 1 ? "Fewer than two of these places have coordinates in a known system, so they are drawn in plan order, not by position." : "";
  if (unknown) reason += `${reason ? " " : ""}${unknown} ${unknown === 1 ? "place has" : "places have"} coordinates in an unknown system and ${unknown === 1 ? "is" : "are"} not positioned by them.`;
  const W = 640, pad = 64;
  let H = 360;
  if (mode === "position") {
    const lat0 = located.reduce((s, n) => s + n.place.lat, 0) / located.length, k = Math.cos(lat0 * Math.PI / 180) || 1;
    const xs = located.map(n => n.place.lng * k), ys = located.map(n => n.place.lat);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    // Places without usable coordinates get their own band along the bottom, clear of the positioned ones.
    const rest = nodes.filter(n => !located.includes(n)), band = rest.length ? 110 : 0, top = H - band;
    const scale = Math.min((W - 2 * pad) / (maxX - minX || 1), (top - 2 * pad) / (maxY - minY || 1));
    const offX = (W - (maxX - minX) * scale) / 2, offY = (top - (maxY - minY) * scale) / 2;
    located.forEach((n, i) => { n.x = offX + (xs[i] - minX) * scale; n.y = top - (offY + (ys[i] - minY) * scale); n.positioned = true; });
    rest.forEach((n, i) => { n.x = rest.length === 1 ? pad + 40 : pad + 40 + i * (W - 2 * pad - 80) / (rest.length - 1); n.y = H - 34; n.positioned = false; });
  }
  else {
    const perRow = compact ? 2 : 4, rows = Math.max(1, Math.ceil(nodes.length / perRow));
    H = Math.max(H, 2 * pad + (rows - 1) * 150);
    nodes.forEach((n, i) => { const row = Math.floor(i / perRow), col = i % perRow, cols = Math.min(perRow, nodes.length - row * perRow), at = row % 2 ? cols - 1 - col : col; n.x = cols === 1 ? W / 2 : pad + at * (W - 2 * pad) / (cols - 1); n.y = rows === 1 ? H / 2 : pad + row * (H - 2 * pad) / (rows - 1); n.positioned = false; });
  }
  return { mode, system, reason, width: W, height: H };
}

const node = (trip, placeId) => { const place = (trip.places || []).find(p => p.id === placeId); return place ? { id: place.id, place, name: place.name, localName: place.localName || "" } : null; };

/** Whole trip: the places the selected travelers stay at or travel between, and their journeys in date order. */
export function tripMap(trip, { filter = "all", compact = false } = {}) {
  const shown = record => matchesSelection(record, filter, trip);
  const stays = (trip.stays || []).filter(shown).sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  const legs = (trip.legs || []).filter(shown).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const ids = [];
  const add = id => { if (id && !ids.includes(id)) ids.push(id); };
  // Plan order: by the date each place first appears for the selected travelers.
  [...stays.map(s => ({ date: s.start, ids: [s.placeId] })), ...legs.map(l => ({ date: l.date, ids: [l.from, l.to] }))].sort((a, b) => a.date.localeCompare(b.date)).forEach(e => e.ids.forEach(add));
  const nodes = ids.map(id => node(trip, id)).filter(Boolean);
  nodes.forEach((n, i) => { n.n = i + 1; n.detail = stays.filter(s => s.placeId === n.id).map(s => `${s.start} → ${s.end}`).join(", "); });
  let edges = legs.filter(l => l.from && l.to && l.from !== l.to).map(l => ({ from: l.from, to: l.to, label: `${l.mode || "Journey"} · ${l.date}`, kind: "journey" }));
  // With no journeys entered, connect consecutive stays so the order of the trip is still visible.
  if (!edges.length) edges = stays.slice(1).map((s, i) => ({ from: stays[i].placeId, to: s.placeId, label: "", kind: "order" })).filter(e => e.from && e.to && e.from !== e.to);
  const missing = stays.filter(s => !s.placeId).length + legs.filter(l => !l.from || !l.to).length;
  return { kind: "trip", nodes, edges, missing, ...layout(nodes, compact) };
}

/** One day: the selected travelers' activities in itinerary order, grouped into stops by place. */
export function dayMap(trip, { filter = "all", day, compact = false } = {}) {
  const activities = (trip.activities || []).filter(a => a.date === day && matchesSelection(a, filter, trip)).sort(byOrder);
  const stops = [], unplaced = [];
  for (const a of activities) {
    const n = a.placeId ? node(trip, a.placeId) : null;
    if (!n) { unplaced.push(a); continue; }
    const last = stops.at(-1);
    if (last && last.id === n.id) last.activities.push(a);
    else stops.push({ ...n, activities: [a] });
  }
  // A place visited twice in a day is one point on the drawing with two stop numbers.
  const nodes = [];
  stops.forEach((stop, i) => { stop.n = i + 1; const seen = nodes.find(n => n.id === stop.id); if (seen) seen.numbers.push(stop.n); else nodes.push({ id: stop.id, place: stop.place, name: stop.name, localName: stop.localName, numbers: [stop.n] }); });
  nodes.forEach(n => { n.n = n.numbers.join(","); });
  const edges = stops.slice(1).map((s, i) => ({ from: stops[i].id, to: s.id, label: "", kind: "order" }));
  return { kind: "day", day, stops, nodes, edges, unplaced, ...layout(nodes, compact) };
}

/**
 * Inline SVG for a model from tripMap or dayMap. No tiles, images, fonts or scripts.
 * `scale` enlarges markers and text for narrow screens, where the drawing is shown smaller.
 * `anchors` makes each marker a same-page link to its entry in the list under the drawing (`#map-stop-N`),
 * so a tap or the Tab key reaches the details; the only references are to the page itself.
 */
export function mapSvg(model, title, { scale = 1, anchors = false } = {}) {
  const at = id => model.nodes.find(n => n.id === id);
  const r = 16 * Math.min(scale, 1.5), font = 13 * scale, small = 11 * scale, max = Math.round(24 / scale) + 2;
  const short = s => s.length > max ? `${s.slice(0, max - 1)}…` : s;
  // Keep a centred label inside the drawing by estimating its width.
  const clamp = (x, label, size) => { const half = label.length * size * 0.33 + 6; return Math.max(half, Math.min(model.width - half, x)); };
  const pairs = new Map();
  const edges = model.edges.map(e => {
    const a = at(e.from), b = at(e.to);
    if (!a || !b) return "";
    // Journeys between the same two places (there and back, or repeated) bow to alternate sides.
    const [lo, hi] = e.from < e.to ? [a, b] : [b, a], key = `${lo.id}|${hi.id}`, k = pairs.get(key) || 0;
    pairs.set(key, k + 1);
    const dx = hi.x - lo.x, dy = hi.y - lo.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const bow = (Math.floor(k / 2) + 1) * 34 * scale * (k % 2 ? -1 : 1), mx = (a.x + b.x) / 2 + nx * bow, my = (a.y + b.y) / 2 + ny * bow;
    const trim = (p, q) => { const d = Math.hypot(q.x - p.x, q.y - p.y) || 1; return { x: p.x + (q.x - p.x) / d * (r + 4), y: p.y + (q.y - p.y) / d * (r + 4) }; };
    const s = trim(a, { x: mx, y: my }), t = trim(b, { x: mx, y: my });
    // On a narrow screen only the mode is written on the line; the date is in the list below.
    const label = e.label ? short(scale > 1 ? e.label.split(" · ")[0] : e.label) : "", lx = (a.x + b.x) / 2 + nx * bow * 0.75, ly = (a.y + b.y) / 2 + ny * bow * 0.75 + small * 0.35;
    return `<path class="map-edge ${e.kind}" d="M${s.x.toFixed(1)} ${s.y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${t.x.toFixed(1)} ${t.y.toFixed(1)}" marker-end="url(#map-arrow)"/>${label ? `<text class="map-edge-label" font-size="${small}" x="${clamp(lx, label, small * 1.8).toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle">${escape(label)}</text>` : ""}`;
  }).join("");
  const nodes = model.nodes.map(n => { const label = short(n.name), below = n.y <= model.height - (r + font + 14); const first = String(n.n).split(",")[0], open = anchors ? `<a class="map-pin" href="#map-stop-${escape(first)}" aria-label="${escape(`Stop ${n.n}: ${n.name}. Go to its details in the list.`)}">` : ""; return `${open}<g class="map-node ${n.positioned ? "positioned" : "ordered"}"><circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${r}"/><text class="map-number" font-size="${font}" x="${n.x.toFixed(1)}" y="${(n.y + font * 0.36).toFixed(1)}" text-anchor="middle">${escape(n.n)}</text><text class="map-label" font-size="${font}" x="${clamp(n.x, label, font * 1.8).toFixed(1)}" y="${(n.y + (below ? r + font + 4 : -(r + 8))).toFixed(1)}" text-anchor="middle">${escape(label)}</text></g>${anchors ? "</a>" : ""}`; }).join("");
  return `<svg class="schematic-map" viewBox="0 0 ${model.width} ${model.height}" role="${anchors ? "group" : "img"}" aria-label="${escape(title)}"><defs><marker id="map-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z"/></marker></defs>${edges}${nodes}</svg>`;
}
/** One plain sentence saying what kind of drawing this is. */
export function mapCaption(model) {
  const basis = model.mode === "position" ? `Positions use ${model.system} coordinates as entered${model.nodes.some(n => !n.positioned) ? "; places along the bottom edge have no usable coordinates" : ""}.` : "Drawn in plan order, not to scale or position.";
  return `Schematic only, with no map background. ${basis} Arrows are planned connections, not routes or travel times.`;
}
