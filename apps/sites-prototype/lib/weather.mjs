// Weather for the day headers, fetched on the server.
//
// For each day the forecast is for where that day's stay is. A stay's place (or the area it sits in) gives
// the location: coordinates as typed, or an address or place name, which is looked up for the weather only.
// The lookup result is cached here and never written to the trip, so the map rules are unchanged: a place
// with only an address is still not positioned on the map, and its coordinates are still never converted.
//
// Only this leaves the planner: rounded coordinates to the forecast service, and the typed address text to
// the address lookup. No trip name, person, date range of the trip, note or identifier is sent.
//
// Services (no key, no account):
//   Forecast: Open-Meteo, https://open-meteo.com/ (16 days; free for non-commercial use, attribution asked).
//   Address lookup: OpenStreetMap Nominatim public server (at most one request a second, results cached).
import { hasCoordinates, placeAddressText } from "../public/maps.mjs";

export const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
export const GEOCODE_URL = "https://nominatim.openstreetmap.org/search";
export const FORECAST_DAYS = 16;
export const FORECAST_TTL = 60 * 60;            // seconds: a forecast is reused for an hour
export const GEOCODE_TTL = 30 * 24 * 60 * 60;   // an address keeps its looked-up point for 30 days
export const FAILURE_TTL = 5 * 60;              // a failed lookup is not retried for five minutes
const TIMEOUT_MS = 6000;
const DAILY = ["weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_probability_max", "precipitation_sum", "rain_sum", "showers_sum", "snowfall_sum"];
const num = v => typeof v === "number" && Number.isFinite(v) ? v : null;

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

/** Today's date (YYYY-MM-DD) in a time zone: the day boundary a stay's forecast is cut at. */
export function localDate(now, timeZone) {
    try {
        return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    }
    catch {
        return new Date(now).toISOString().slice(0, 10);
    }
}

/**
 * Where a stay is, for the forecast: `{ kind: "coordinates", lat, lng }`, `{ kind: "address", text }` or null.
 * The stay's own place is asked first, then the area it sits in. Coordinates are used as typed whatever
 * their system: nothing is converted, and the difference between systems (under a kilometre) is far below
 * what a forecast can tell apart. They are rounded to two decimals (about a kilometre) before being sent.
 */
export function stayLocation(trip, stay) {
    const place = trip.places?.find(p => p.id === stay?.placeId), area = place?.parentId ? trip.places.find(p => p.id === place.parentId) : null;
    for (const p of [place, area]) {
        if (!p)
            continue;
        if (hasCoordinates(p))
            return { kind: "coordinates", lat: Math.round(p.lat * 100) / 100, lng: Math.round(p.lng * 100) / 100 };
        const text = placeAddressText(p);
        if (text)
            return { kind: "address", text };
    }
    return null;
}

async function getJson(fetchFn, url, headers) {
    const response = await fetchFn(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok)
        throw new Error(`Weather service answered ${response.status}`);
    return response.json();
}

// Cached step: a stored `{ failed: true }` means "do not ask again yet" and reads as no answer.
async function cached(cache, key, ttl, produce) {
    try {
        const hit = await cache.get(key);
        if (hit)
            return hit.failed ? null : hit;
    }
    catch { /* a cache that cannot be read is skipped */ }
    let value = null;
    try {
        value = await produce();
    }
    catch { /* a failed lookup is no weather, never an error */ }
    try {
        await cache.put(key, value || { failed: true }, value ? ttl : FAILURE_TTL);
    }
    catch { /* nor is a cache that cannot be written */ }
    return value;
}

/**
 * Turn a typed address or place name into a point, for the weather only. The whole text is tried first;
 * if nothing is found, the part after the first comma (usually the town) is tried once.
 */
export async function lookupAddress(text, { fetch: fetchFn, cache }) {
    const key = `geo:${text.toLowerCase().replace(/\s+/g, " ")}`;
    return cached(cache, key, GEOCODE_TTL, async () => {
        const tail = text.includes(",") ? text.slice(text.indexOf(",") + 1).trim() : "";
        for (const q of [text, tail].filter(Boolean)) {
            const rows = await getJson(fetchFn, `${GEOCODE_URL}?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, { "User-Agent": "trip-planner-weather/1.0", "Accept-Language": "en" });
            const lat = Number(rows?.[0]?.lat), lng = Number(rows?.[0]?.lon);
            if (Array.isArray(rows) && rows.length && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)
                return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
        }
        return null;
    });
}

/** Read the forecast service's answer into `{ timezone, fetchedAt, days: { date: day } }`, or null if it is not one. */
export function parseForecast(data, fetchedAt) {
    const d = data?.daily, dates = d?.time;
    if (!Array.isArray(dates) || typeof data.timezone !== "string")
        return null;
    const at = (name, i) => num(d[name]?.[i]);
    const days = {};
    dates.forEach((date, i) => {
        if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
            return;
        const rain = at("rain_sum", i), showers = at("showers_sum", i), snow = at("snowfall_sum", i), total = at("precipitation_sum", i);
        // A day the service left blank is not a dry day: it is no forecast.
        if (total === null && rain === null && snow === null)
            return;
        days[date] = { chance: at("precipitation_probability_max", i), rainMm: (rain ?? 0) + (showers ?? 0), snowCm: snow ?? 0, precipMm: total ?? 0, high: at("temperature_2m_max", i), low: at("temperature_2m_min", i), code: at("weather_code", i) };
    });
    return { timezone: data.timezone, fetchedAt, days };
}

/** The forecast for a point. Days are the point's own local days: the service is asked to work out its time zone. */
export async function forecastFor(point, { fetch: fetchFn, cache, now = () => new Date() }) {
    const lat = point.lat.toFixed(2), lng = point.lng.toFixed(2);
    return cached(cache, `forecast:${lat},${lng}`, FORECAST_TTL, async () => parseForecast(await getJson(fetchFn, `${FORECAST_URL}?latitude=${lat}&longitude=${lng}&daily=${DAILY.join(",")}&timezone=auto&forecast_days=${FORECAST_DAYS}`), now().toISOString()));
}

/**
 * Weather for every day of a trip that has one: `{ days: { date: { ...day, where? } }, updatedAt }`.
 * A day takes the first stay covering that night that has a forecast for the date, else a stay being
 * left that morning. Days already over where the stay is, days past the forecast range, stays with no
 * usable location and failed lookups are simply absent. This never throws.
 * `names` adds the place name the forecast is for (members only; guests are not told).
 */
export async function tripWeather(trip, { fetch: fetchFn = fetch, cache = memoryCache(), now = () => new Date(), names = false } = {}) {
    const result = { days: {}, updatedAt: null };
    try {
        const stays = (trip?.stays || []).map(stay => ({ stay, location: stayLocation(trip, stay) })).filter(s => s.location);
        // One forecast per distinct point. Address lookups go one after another, as the lookup service asks.
        const forecasts = new Map();
        for (const s of stays) {
            const point = s.location.kind === "coordinates" ? s.location : await lookupAddress(s.location.text, { fetch: fetchFn, cache });
            if (!point)
                continue;
            s.key = `${point.lat.toFixed(2)},${point.lng.toFixed(2)}`;
            if (!forecasts.has(s.key))
                forecasts.set(s.key, forecastFor(point, { fetch: fetchFn, cache, now }));
        }
        for (const s of stays)
            s.forecast = s.key ? await forecasts.get(s.key) : null;
        for (let date = trip.start; date && date <= trip.end && Object.keys(result.days).length < 121;) {
            const here = [...stays.filter(s => date >= s.stay.start && date < s.stay.end), ...stays.filter(s => s.stay.end === date)];
            // The day boundary is the stay's own: a day that has ended there is no longer forecast.
            const found = here.find(s => s.forecast?.days[date] && date >= localDate(now(), s.forecast.timezone));
            if (found) {
                result.days[date] = { ...found.forecast.days[date], ...(names ? { where: trip.places?.find(p => p.id === found.stay.placeId)?.name || "" } : {}) };
                if (!result.updatedAt || found.forecast.fetchedAt < result.updatedAt)
                    result.updatedAt = found.forecast.fetchedAt;
            }
            const next = new Date(`${date}T12:00:00Z`);
            next.setUTCDate(next.getUTCDate() + 1);
            date = next.toISOString().slice(0, 10);
        }
    }
    catch { /* no weather */ }
    return result;
}
