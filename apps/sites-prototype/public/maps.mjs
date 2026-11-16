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
 * The location part of a place: optional coordinates, the system they are in, where they
 * came from, and map links a person has opened and checked. Coordinates always come as a
 * pair, and always with an explicit system (which may be "unknown").
 */
export function normalizePlaceGeo(place) {
  const lat = number(place.lat, 90, "Latitude"), lng = number(place.lng, 180, "Longitude");
  if ((lat === null) !== (lng === null)) throw new Error("Enter both latitude and longitude, or leave both empty.");
  if (lat !== null && !COORD_SYSTEMS.includes(place.coordSystem)) throw new Error("Say which coordinate system these numbers use, or choose Unknown. They are never converted or guessed.");
  const amapUrl = mapUrl("amap", place.amapUrl), appleMapsUrl = mapUrl("apple", place.appleMapsUrl);
  return { lat, lng, coordSystem: lat === null ? "" : place.coordSystem, coordSource: text(place.coordSource, 300), amapUrl, appleMapsUrl, navReviewed: place.navReviewed === true && !!(amapUrl || appleMapsUrl) };
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
 */
export function mapSvg(model, title, { scale = 1 } = {}) {
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
  const nodes = model.nodes.map(n => { const label = short(n.name), below = n.y <= model.height - (r + font + 14); return `<g class="map-node ${n.positioned ? "positioned" : "ordered"}"><circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${r}"/><text class="map-number" font-size="${font}" x="${n.x.toFixed(1)}" y="${(n.y + font * 0.36).toFixed(1)}" text-anchor="middle">${escape(n.n)}</text><text class="map-label" font-size="${font}" x="${clamp(n.x, label, font * 1.8).toFixed(1)}" y="${(n.y + (below ? r + font + 4 : -(r + 8))).toFixed(1)}" text-anchor="middle">${escape(label)}</text></g>`; }).join("");
  return `<svg class="schematic-map" viewBox="0 0 ${model.width} ${model.height}" role="img" aria-label="${escape(title)}"><defs><marker id="map-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z"/></marker></defs>${edges}${nodes}</svg>`;
}
/** One plain sentence saying what kind of drawing this is. */
export function mapCaption(model) {
  const basis = model.mode === "position" ? `Positions use ${model.system} coordinates as entered${model.nodes.some(n => !n.positioned) ? "; places along the bottom edge have no usable coordinates" : ""}.` : "Drawn in plan order, not to scale or position.";
  return `Schematic only, with no map background. ${basis} Arrows are planned connections, not routes or travel times.`;
}
