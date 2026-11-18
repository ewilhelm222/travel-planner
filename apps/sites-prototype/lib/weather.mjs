// Where each day's weather is for, worked out on the server.
//
// For each day the forecast is for where that day's stay is. A stay's place (or the area it sits in) gives
// the location: coordinates as typed, or an address or place name, which is looked up for the weather only.
// The lookup result is cached here and never written to the trip, so the map rules are unchanged: a place
// with only an address is still not positioned on the map, and its coordinates are still never converted.
//
// The server answers with points only: coordinates rounded to two decimals (about a kilometre) and the days
// each is for. The reader's own browser then asks the forecast service (public/weather.mjs). The forecast
// service refuses requests from this host's shared addresses (HTTP 429), so the server cannot ask for them;
// the owner chose this on November 18, 2026, for signed-in people and guests, knowing that the guest page
// therefore receives each stay's rounded location.
//
// From the server, only the typed address or place name goes out, to the address lookup. No trip name,
// person, note or identifier is sent.
//   Address lookup: OpenStreetMap Nominatim public server (at most one request a second, results cached).
import { hasCoordinates, placeAddressText } from "../public/maps.mjs";

export const GEOCODE_URL = "https://nominatim.openstreetmap.org/search";
const NONE_TTL = 60 * 60;                       // seconds: "not found" is remembered for an hour
export const GEOCODE_TTL = 30 * 24 * 60 * 60;   // an address keeps its looked-up point for 30 days
export const FAILURE_TTL = 2 * 60;              // a failed lookup is not retried for two minutes
// A refused or failed lookup is tried again a couple of times before giving up.
export const retry = { attempts: 3, delayMs: 300 };
const TIMEOUT_MS = 6000;

/** A small in-memory cache with expiry: `get(key)` and `put(key, value, ttlSeconds)`. */
export function memoryCache(clock = () => Date.now(), limit = 500) {
    const rows = new Map();
    return {
        async get(key) {
            const row = rows.get(key);
            if (!row || row.until <= clock()) {
                rows.delete(key);
                return null;
            }
            return row.value;
        },
        async put(key, value, ttl) {
            if (rows.size >= limit)
                rows.delete(rows.keys().next().value);
            rows.set(key, { value, until: clock() + ttl * 1000 });
        },
    };
}

/**
 * Where a stay is, for the forecast: the things to try, in order. Each is `{ kind: "coordinates", lat, lng }`,
 * `{ kind: "address", text }` or `{ kind: "name", text }`. The stay's own place is asked first, then the area it
 * sits in: coordinates of either first, then an address of either, then the area's name and the place's name
 * ("Twain Harte" is enough for a forecast). Coordinates are used as typed whatever their system: nothing is
 * converted, and the difference between systems (under a kilometre) is far below what a forecast can tell
 * apart. They are rounded to two decimals (about a kilometre) before being sent.
 */
export function stayLocations(trip, stay) {
    const place = trip.places?.find(p => p.id === stay?.placeId), area = place?.parentId ? trip.places.find(p => p.id === place.parentId) : null;
    const found = [];
    // Coordinates need no lookup, so the place's or the area's come before any address.
    for (const p of [place, area])
        if (hasCoordinates(p))
            found.push({ kind: "coordinates", lat: Math.round(p.lat * 100) / 100, lng: Math.round(p.lng * 100) / 100 });
    for (const p of [place, area]) {
        const text = p ? placeAddressText(p) : "";
        if (text)
            found.push({ kind: "address", text });
    }
    for (const p of [area, place])
        if (p?.name)
            found.push({ kind: "name", text: p.name });
    return found;
}
/** The first thing that would be tried for a stay, or null when it has no place at all. */
export const stayLocation = (trip, stay) => stayLocations(trip, stay)[0] || null;

async function getJson(fetchFn, url, headers) {
    let last;
    for (let attempt = 0; attempt < retry.attempts; attempt++) {
        if (attempt && retry.delayMs)
            await new Promise(done => setTimeout(done, retry.delayMs * attempt));
        try {
            const response = await fetchFn(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
            if (response.ok)
                return await response.json();
            last = Object.assign(new Error(`Weather service answered ${response.status}`), { detail: `HTTP ${response.status}` });
            // A refusal that will not change (bad request, not found) is not asked again.
            if (response.status < 500 && response.status !== 429 && response.status !== 403 && response.status !== 408)
                break;
        }
        catch (e) {
            last = e;
        }
    }
    throw last;
}

// Cached step. `produce` returns a value, or null for "asked, and there is none". The answer is
// `{ value }`, `{ none: true }` (remembered for an hour) or `{ failed: true, detail }` (not asked again for two minutes).
// With `keep` longer than `ttl`, a value is fresh for `ttl` seconds and kept for `keep`: when it has gone stale
// and cannot be refreshed, the kept value is used rather than nothing.
async function cached(cache, key, ttl, produce, { keep = ttl, clock = () => Date.now() } = {}) {
    let old = null;
    try {
        const hit = await cache.get(key);
        if (hit && (!hit.value || !hit.freshUntil || hit.freshUntil > clock()))
            return hit;
        old = hit;
    }
    catch { /* a cache that cannot be read is skipped */ }
    let answer;
    try {
        const value = await produce();
        answer = value ? { value, freshUntil: clock() + ttl * 1000, keepUntil: clock() + keep * 1000 } : { none: true };
    }
    catch (e) {
        // A failed lookup is no weather, never an error. What went wrong is kept in a word or two, for the organizer.
        answer = { failed: true, detail: String(e?.detail || e?.name || "error").slice(0, 40) };
        // The last good answer stands in, and the service is left alone for a couple of minutes.
        if (old?.value && old.keepUntil > clock())
            answer = { ...old, freshUntil: clock() + FAILURE_TTL * 1000 };
    }
    try {
        await cache.put(key, answer, answer.value ? Math.max(1, Math.round((answer.keepUntil - clock()) / 1000)) : answer.none ? NONE_TTL : FAILURE_TTL);
    }
    catch { /* nor is a cache that cannot be written */ }
    return answer;
}

/**
 * Turn a typed address or place name into a point, for the weather only. The whole text is tried first;
 * for an address, if nothing is found, the part after the first comma (usually the town) is tried once.
 * Answers `{ value: { lat, lng, label } }`, `{ none: true }` or `{ failed: true }`.
 */
export async function lookupAddress(text, { fetch: fetchFn, cache, tail = true }) {
    const key = `geo:${text.toLowerCase().replace(/\s+/g, " ")}`;
    return cached(cache, key, GEOCODE_TTL, async () => {
        const rest = tail && text.includes(",") ? text.slice(text.indexOf(",") + 1).trim() : "";
        for (const q of [text, rest].filter(Boolean)) {
            const rows = await getJson(fetchFn, `${GEOCODE_URL}?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, { "User-Agent": "trip-planner-weather/1.0", "Accept-Language": "en" });
            const lat = Number(rows?.[0]?.lat), lng = Number(rows?.[0]?.lon);
            if (Array.isArray(rows) && rows.length && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)
                // What the lookup matched, in a few words, so a wrong match can be noticed.
                return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100, label: String(rows[0].display_name || "").split(",").slice(0, 3).map(x => x.trim()).filter(Boolean).join(", ").slice(0, 120) };
        }
        return null;
    });
}

/**
 * Where to ask the weather for, for every day of a trip:
 *   { points: [{ lat, lng, where? }], dates: { "2026-11-22": 0, ... }, why?, failed? }
 * `dates` gives each day the index of its point. A day takes the first stay covering that night that has a
 * point, else a stay being left that morning. Coordinates are rounded to two decimals. This never throws.
 * `names` (members only) adds the place each point is for and, when there is no point at all, `why`:
 * `{ reason, text?, detail? }` with reason "no-stay", "no-location", "not-found" or "lookup-failed".
 * `failed` says a lookup service did not answer, so it is worth asking again.
 */
export async function weatherPlan(trip, { fetch: fetchFn = fetch, cache = memoryCache(), names = false } = {}) {
    const result = { points: [], dates: {} };
    let why = { reason: "no-stay" };
    try {
        const stays = (trip?.stays || []).map(stay => ({ stay })), index = new Map();
        // Lookups go one after another, as the lookup service asks.
        for (const s of stays) {
            s.why = { reason: "no-location" };
            for (const t of stayLocations(trip, s.stay)) {
                let point = t;
                if (t.kind !== "coordinates") {
                    const found = await lookupAddress(t.text, { fetch: fetchFn, cache, tail: t.kind === "address" });
                    point = found.value;
                    if (!point) {
                        // Keep the first thing that went wrong: it is the one a person can fix.
                        if (s.why.reason === "no-location")
                            s.why = found.failed ? { reason: "lookup-failed", detail: found.detail } : { reason: "not-found", text: t.text };
                        continue;
                    }
                }
                const key = `${point.lat.toFixed(2)},${point.lng.toFixed(2)}`;
                if (!index.has(key)) {
                    index.set(key, result.points.length);
                    result.points.push({ lat: Number(point.lat.toFixed(2)), lng: Number(point.lng.toFixed(2)), ...(names ? { where: point.label || trip.places?.find(p => p.id === s.stay.placeId)?.name || "" } : {}) });
                }
                s.point = index.get(key);
                break;
            }
        }
        if (stays.length)
            why = stays[0].why;
        for (let date = trip.start, n = 0; date && date <= trip.end && n < 121; n++) {
            const here = [...stays.filter(s => date >= s.stay.start && date < s.stay.end), ...stays.filter(s => s.stay.end === date)].find(s => s.point !== undefined);
            if (here)
                result.dates[date] = here.point;
            const next = new Date(`${date}T12:00:00Z`);
            next.setUTCDate(next.getUTCDate() + 1);
            date = next.toISOString().slice(0, 10);
        }
    }
    catch { /* no weather */ }
    if (!result.points.length) {
        if (why.reason === "lookup-failed")
            result.failed = true;
        if (names)
            result.why = why;
    }
    return result;
}
