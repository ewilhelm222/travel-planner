// The weather line under each date: fetching, rules and drawing, shared by the planner and the guest view.
// The server says where each day's weather is for (rounded coordinates, see lib/weather.mjs); the reader's own
// browser asks the forecast service, Open-Meteo, because that service refuses the host's shared addresses.
// Only the rounded coordinates go to it. Values are metric and converted for display.
// Precipitation comes first: rain, snow, mixed or dry, the chance, and the amount when it matters.
// Temperature follows, smaller. A day with no forecast shows a quiet dash, never a guess.
import { escape } from './board.mjs';

// Probabilities and model amounts answer different questions. Never infer snow from temperature alone.
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const RAIN_CODES = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82]);
const ICE_CODES = new Set([56, 57, 66, 67]);
const STORM_CODES = new Set([95, 96, 99]);
const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
const probability = v => num(v) !== null && v >= 0 && v <= 100 ? v : null;

export function classify(day) {
    const rainMm = num(day?.rainMm), snowCm = num(day?.snowCm), chance = probability(day?.chance);
    const snow = snowCm > 0 || SNOW_CODES.has(day?.code), rain = rainMm > 0 || RAIN_CODES.has(day?.code);
    const kind = STORM_CODES.has(day?.code) ? 'storm' : ICE_CODES.has(day?.code) ? 'ice' : snow && rain ? 'mixed' : snow ? 'snow' : rain ? 'rain' : chance >= 20 ? 'precip' : 'dry';
    return { kind, chance, rainMm, snowCm };
}

/** 'us' (°F, inches) for a United States locale, otherwise 'metric' (°C, mm, cm). */
export function unitsFor(locale) {
    try { return new Intl.Locale(locale).maximize().region === 'US' ? 'us' : 'metric'; }
    catch { return 'metric'; }
}
// Show small positive quantities without rounding them up into a larger forecast.
export function weatherAmount(value, type, units) {
    if (num(value) === null) return 'Unavailable';
    const n = units === 'us' ? value / (type === 'snow' ? 2.54 : 25.4) : value;
    const unit = units === 'us' ? 'in' : type === 'snow' ? 'cm' : 'mm';
    if (n === 0) return `0 ${unit}`;
    const precision = units === 'us' && type === 'rain' ? 2 : 1;
    const minimum = precision === 2 ? 0.01 : 0.1;
    if (n < minimum) return `<${minimum} ${unit} (trace)`;
    return `${Number(n.toFixed(precision))} ${unit}`;
}
const degrees = (c, units) => Math.round(units === 'us' ? c * 9 / 5 + 32 : c);
const CONDITIONS = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog possible', 48: 'Freezing fog possible' };
const WORDS = { rain: 'Rain possible', snow: 'Snow possible', mixed: 'Rain / snow possible', precip: 'Precipitation possible', ice: 'Freezing rain possible', storm: 'Thunderstorms possible' };

export function weatherWords(day, units = 'metric') {
    const c = classify(day);
    let condition = WORDS[c.kind] || CONDITIONS[day?.code] || 'Conditions unavailable';
    if (c.snowCm > 0 && c.snowCm < (units === 'us' ? 0.254 : 0.1))
        condition = c.kind === 'mixed' ? 'Rain / trace snow possible' : c.kind === 'snow' ? 'Trace snow possible' : condition;
    const precip = c.chance === null ? 'Precip chance unavailable' : `Precip ${Math.round(c.chance)}% peak hourly`;
    const high = num(day?.high), low = num(day?.low), unit = units === 'us' ? 'F' : 'C';
    const temp = [high !== null ? `H ${degrees(high, units)}°` : '', low !== null ? `L ${degrees(low, units)}°` : ''].filter(Boolean).join(' / ');
    const spoken = `Forecast: ${condition}. ${c.chance === null ? 'Precipitation chance unavailable.' : `Peak hourly precipitation chance ${Math.round(c.chance)} percent; not an all-day probability.`}${high !== null ? ` High ${degrees(high, units)} degrees ${unit}.` : ''}${low !== null ? ` Low ${degrees(low, units)} degrees ${unit}.` : ''}`;
    return { kind: c.kind, condition, precip, temp, spoken };
}

// Line icons in the current text colour. Each is decorative beside its word; `label` gives it a text alternative where it stands alone.
const SHAPES = {
    cloud: '<path d="M4 12a3.5 3.5 0 0 1 0-7 4.5 4.5 0 0 1 8 1 3 3 0 0 1 0 6z"/>',
    fog: '<path d="M2 5h12M1 8h14M3 11h10"/>',
    precip: '<path d="M8 2C6 5 3 8 3 10a5 5 0 0 0 10 0c0-2-3-5-5-8z"/>',
    storm: '<path d="M4 8a3 3 0 0 1 0-6 4 4 0 0 1 7 1 2.5 2.5 0 0 1 1 5M8 7l-3 4h4l-2 4"/>',
    ice: '<path d="M3 4h10M5 7l-1 3M9 7l-1 3M12 12v3M10.5 13.5h3"/>',
    rain: '<path d="M5 9.5a3 3 0 0 1 .4-6 4 4 0 0 1 7.6 1 2.5 2.5 0 0 1-.5 5z"/><path d="M5.5 12l-1 2.5M8.5 12l-1 2.5M11.5 12l-1 2.5"/>',
    snow: '<path d="M8 1.5v13M2.4 4.75l11.2 6.5M13.6 4.75L2.4 11.25"/><path d="M6.3 2.6L8 4.2l1.7-1.6M6.3 13.4L8 11.8l1.7 1.6"/>',
    mixed: '<path d="M5 9.5a3 3 0 0 1 .4-6 4 4 0 0 1 7.6 1 2.5 2.5 0 0 1-.5 5z"/><path d="M5 12l-1 2.5"/><path d="M10.5 11.2v3.6M8.9 12.1l3.2 1.8M12.1 12.1l-3.2 1.8"/>',
    dry: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>',
};
export function weatherIcon(kind, label = '') {
    return `<svg class="weather-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${escape(label)}"` : 'aria-hidden="true"'}>${label ? `<title>${escape(label)}</title>` : ''}${SHAPES[kind] || SHAPES.precip}</svg>`;
}

/** When the forecast was fetched, in the reader's own time: "Nov 17, 3:10 PM". */
export const updatedLabel = (iso, locale) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };

/**
 * The inside of one day's weather line. `day` is that date's forecast or nothing.
 * `state` is 'loading' while the first answer is on its way: the line is then empty, and the same height.
 */
const iconFor = day => {
    const kind = classify(day).kind;
    if (kind !== 'dry') return kind;
    return [0, 1].includes(day?.code) ? 'dry' : [2, 3].includes(day?.code) ? 'cloud' : [45, 48].includes(day?.code) ? 'fog' : 'precip';
};
export function weatherLine(day, { units = 'metric', loading = false, saved = false, date = '' } = {}) {
    if (loading) return '';
    if (!day) return '<span class="weather-none" aria-hidden="true">—</span><span class="sr-only">No forecast for this day</span>';
    const w = weatherWords(day, units);
    return `<button type="button" class="weather-summary ${w.kind}" aria-haspopup="dialog"><span class="weather-condition" aria-hidden="true">${weatherIcon(iconFor(day))}<span>${escape(w.condition)}</span></span><span class="weather-precip" aria-hidden="true">${escape(w.precip)}</span><span class="weather-bottom" aria-hidden="true"><span class="weather-temp">${escape(w.temp)}</span><span class="weather-more">${saved ? 'Saved · ' : ''}Details</span></span><span class="sr-only">${date ? `Weather for ${escape(date)}. ` : ''}${saved ? 'Saved forecast. ' : ''}${escape(w.spoken)} Open weather details.</span></button>`;
}

export const PROBABILITY_HELP = 'Peak hourly chance is the highest chance of more than 0.1 mm of precipitation in any one hour at this location on this local date. It is not the chance of precipitation at any time during the whole day, the percentage of the day it will rain, or the amount. Rain and snow share this probability; it is not a separate snow chance.';
export function weatherDetails(day, { date, units = 'metric', updatedAt, locale, now = Date.now() } = {}) {
    const w = weatherWords(day, units), unit = units === 'us' ? '°F' : '°C';
    const dateLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    const fetched = updatedLabel(updatedAt, locale), age = now - Date.parse(updatedAt);
    const daysAhead = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${day.today || date}T00:00:00Z`)) / 86400000);
    const row = (label, value) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`;
    return `<div class="dialog-heading"><h2 id="weather-details-title">Weather · ${escape(dateLabel)}</h2><button type="button" class="icon-button" data-weather-close aria-label="Close weather details">×</button></div><p>${escape(w.condition)}${day.where ? ` · ${escape(day.where)}` : ''}</p><dl class="weather-values">${row('High / low', [num(day.high) !== null ? `${degrees(day.high, units)}${unit}` : 'Unavailable', num(day.low) !== null ? `${degrees(day.low, units)}${unit}` : 'Unavailable'].join(' / '))}${row('Peak hourly precipitation chance', classify(day).chance === null ? 'Unavailable' : `${Math.round(day.chance)}%`)}${row('Rain forecast · daily total', weatherAmount(day.rainMm, 'rain', units))}${row('New snow forecast · daily total', weatherAmount(day.snowCm, 'snow', units))}</dl><p>The percentage describes the likeliest hour, not the whole day. Rain and snow amounts are separate model estimates.</p><details class="weather-explanation"><summary>How to read this forecast</summary><p>${PROBABILITY_HELP}</p><p>A brief shower can register measurable precipitation. Even a high chance does not mean steady rain. Neither the percentage nor the daily total tells you when it will happen or how long it will last. Amounts are model estimates, not guaranteed totals or amounts conditional on rain occurring. New snow is snowfall, not snow already on the ground.</p></details><p>${daysAhead >= 7 ? 'A week or more ahead: use this as an outlook and check again closer to the day. ' : ''}Timing, amounts and rain versus snow can change. This forecast is for the stay, not every activity; nearby mountain elevations can have different weather.</p><p class="weather-freshness">${age >= 2 * 3600000 ? 'Older forecast · ' : ''}${fetched ? `Forecast retrieved ${escape(fetched)} (your local time).` : 'Retrieval time unavailable.'} This is the retrieval time, not the model issue time.</p><p>Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo.com</a>.</p><div class="dialog-actions"><button type="button" class="secondary" data-weather-close>Close</button></div>`;
}

// One delegated handler survives board redraws and works on the planner and guest page alike.
const weatherViews = new WeakMap();
function wireWeather(document, weather, options) {
    if (!document.addEventListener) return;
    const existing = weatherViews.get(document);
    if (existing) { existing.weather = weather; existing.options = options; return; }
    const state = { weather, options };
    weatherViews.set(document, state);
    document.addEventListener('click', event => {
        const trigger = event.target.closest?.('.weather-summary');
        if (!trigger) return;
        const date = trigger.closest('[data-weather]')?.dataset.weather, day = state.weather?.days?.[date];
        if (!day || document.querySelector('dialog[open]')) return;
        const dialog = document.createElement('dialog');
        dialog.className = 'weather-details';
        dialog.setAttribute('aria-labelledby', 'weather-details-title');
        dialog.innerHTML = weatherDetails(day, { ...state.options, date, updatedAt: state.weather.updatedAt });
        (document.querySelector('#app, #guest-app') || document.body).append(dialog);
        dialog.addEventListener('click', e => { if (e.target.closest('[data-weather-close]')) dialog.close(); });
        dialog.addEventListener('close', () => {
            dialog.remove();
            const replacement = [...document.querySelectorAll('.day-weather[data-weather]')].find(line => line.dataset.weather === date)?.querySelector('.weather-summary');
            (trigger.isConnected ? trigger : replacement)?.focus();
        }, { once: true });
        dialog.showModal();
        dialog.querySelector('[data-weather-close]').focus({ preventScroll: true });
        dialog.scrollTop = 0;
    });
}
/** The note under the schedule saying when the forecast was fetched and where it came from. */
export const weatherNote = () => '<p class="weather-note" id="weather-note" hidden></p>';

// Why a signed-in person sees no forecast at all, in a sentence they can act on. Guests are told nothing.
const WHY = {
    'no-stay': () => 'No forecast: this trip has no stay to take a location from.',
    'no-location': () => 'No forecast: the stay has no place to look up. Choose a place for the stay under Places, stays & journeys.',
    'not-found': why => `No forecast: the weather lookup could not find “${escape(why.text || '')}”. Add an address or coordinates to that place under Places, stays & journeys.`,
    'lookup-failed': why => `No forecast: the place lookup service did not answer${why.detail ? ` (${escape(why.detail)})` : ''}. It will be tried again in a few minutes.`,
    'forecast-failed': why => `No forecast: the forecast service did not answer this device${why.detail ? ` (${escape(why.detail)})` : ''}. It will be tried again in a few minutes.`,
    'out-of-range': () => 'No forecast yet: these dates are outside the 16-day forecast range.',
};

/**
 * Fill every weather line, day chip and the note on the page from `weather` (the server's answer, or null).
 * Nothing is redrawn around them. The lines take up room only when some day has a forecast (the page gets
 * the class `has-weather`); then every header keeps its line, so the columns stay level. With no forecast
 * at all the line is given back to the schedule. `reserve` keeps the room while the answer is on its way,
 * for a trip that had a forecast last time, so the columns do not jump when it arrives.
 */
export function applyWeather(document, weather, { units = 'metric', loading = false, reserve = false, locale } = {}) {
    wireWeather(document, weather, { units, locale });
    const days = weather?.days || {}, updated = weather?.updatedAt ? updatedLabel(weather.updatedAt, locale) : '', any = Object.keys(days).length > 0;
    document.body?.classList?.toggle('has-weather', any || (loading && reserve));
    for (const line of document.querySelectorAll?.('.day-weather[data-weather]') || []) {
        const day = days[line.dataset.weather];
        line.innerHTML = weatherLine(day, { units, date: line.dataset.weather, loading: loading && !day, saved: weather?.saved === true || Date.now() - Date.parse(weather?.updatedAt) >= 2 * 3600000 });
        line.classList?.toggle('none', !day && !loading);
        // On hover: the whole line in words first, since a narrow column cuts it short, then where and when.
        // The note under the schedule says where and when for everyone.
        if (day) {
            const w = weatherWords(day, units);
            line.title = `${w.condition} · ${w.precip}${w.temp ? ` · ${w.temp}` : ''}\n${day.where ? `Forecast for ${day.where}. ` : ''}${updated ? `Updated ${updated}. ` : ''}${PROBABILITY_HELP} Weather data by Open-Meteo.com`;
        }
        else
            line.removeAttribute('title');
    }
    // Day chips: a mark only on wet or snowy days, so dry days stay as they were.
    for (const chip of document.querySelectorAll?.('.medallion[data-day]') || []) {
        chip.querySelector('.medallion-weather')?.remove();
        const base = chip.dataset.label || chip.getAttribute('aria-label') || '';
        chip.dataset.label = base;
        const day = days[chip.dataset.day], w = day ? weatherWords(day, units) : null;
        if (w && w.kind !== 'dry') {
            chip.insertAdjacentHTML('beforeend', `<span class="medallion-weather ${w.kind}" aria-hidden="true">${weatherIcon(w.kind)}</span>`);
            chip.setAttribute('aria-label', `${base}. ${w.spoken}`);
        }
        else
            chip.setAttribute('aria-label', base);
    }
    const note = document.querySelector('#weather-note');
    if (note) {
        const why = !any && weather?.why && WHY[weather.why.reason] ? WHY[weather.why.reason](weather.why) : '';
        note.hidden = !any && !why;
        note.innerHTML = any ? `${weather.saved ? 'Saved forecast · ' : ''}Forecast for each day’s stay${updated ? ` · retrieved ${escape(updated)}` : ''}. Percentages are peak hourly precipitation chances, not all-day probabilities. Tap a forecast for amounts and uncertainty. Days without one are outside the forecast range or have no usable stay location. Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo.com</a>.` : why;
    }
    return any;
}

/**
 * What to show when the server's answer may be empty because a weather service did not answer.
 * `answer` is what the server just said (null if the request itself failed); `kept` is `{ data }`, the last
 * answer with a forecast that this browser saw. A kept forecast less than a day old stands in for a failed
 * one, minus days that are over (`today`, YYYY-MM-DD where the trip is); it still carries its own update
 * time, so it is never passed off as fresh. Returns `{ data, keep, retry }`: what to draw, what to keep for
 * next time (null to forget), and whether to ask again shortly.
 */
export function chooseWeather(answer, kept, { now = Date.now(), today = '' } = {}) {
    const has = d => !!d && Object.keys(d.days || {}).length > 0;
    if (has(answer))
        return { data: answer, keep: { data: answer }, retry: false };
    const failed = !answer || answer.failed === true;
    if (!failed)
        // A real "no forecast" (no location, out of range): nothing is kept.
        return { data: answer, keep: null, retry: false };
    const old = kept?.data, age = old?.updatedAt ? now - Date.parse(old.updatedAt) : Infinity;
    if (has(old) && age >= 0 && age < 24 * 60 * 60 * 1000) {
        const days = Object.fromEntries(Object.entries(old.days).filter(([date]) => date >= today));
        if (Object.keys(days).length)
            return { data: { ...old, days, saved: true }, keep: kept, retry: true };
    }
    return { data: answer, keep: null, retry: true };
}

export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
export const FORECAST_DAYS = 16;
const FRESH_MS = 60 * 60 * 1000;
const DAILY = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max', 'precipitation_sum', 'rain_sum', 'showers_sum', 'snowfall_sum'];
/** The one request made for a point: its rounded coordinates, the daily values wanted, and "work out the time zone". */
export const forecastUrl = point => `${FORECAST_URL}?latitude=${Number(point.lat).toFixed(2)}&longitude=${Number(point.lng).toFixed(2)}&daily=${DAILY.join(',')}&timezone=auto&forecast_days=${FORECAST_DAYS}`;

/** Today's date (YYYY-MM-DD) in a time zone: the day boundary a stay's forecast is cut at. */
export function localDate(now, timeZone) {
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    }
    catch {
        return new Date(now).toISOString().slice(0, 10);
    }
}

/** Read the forecast service's answer into `{ timezone, fetchedAt, days: { date: day } }`, or null if it is not one. */
export function parseForecast(data, fetchedAt) {
    const d = data?.daily, dates = d?.time;
    if (!Array.isArray(dates) || typeof data.timezone !== 'string')
        return null;
    const at = (name, i) => num(d[name]?.[i]);
    const days = {};
    dates.forEach((date, i) => {
        if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
            return;
        const rain = at('rain_sum', i), showers = at('showers_sum', i), snow = at('snowfall_sum', i), total = at('precipitation_sum', i);
        // A day the service left blank is not a dry day: it is no forecast.
        if (total === null && rain === null && snow === null)
            return;
        days[date] = { chance: at('precipitation_probability_max', i), rainMm: rain !== null && showers !== null ? rain + showers : null, snowCm: snow, precipMm: total, high: at('temperature_2m_max', i), low: at('temperature_2m_min', i), code: at('weather_code', i) };
    });
    return { timezone: data.timezone, fetchedAt, days };
}

/**
 * Ask the forecast service for the points in the server's `plan` and answer per day:
 *   { days: { date: { ...day, where? } }, updatedAt, why?, failed? }
 * One request per point, sent without a referrer; a point asked within the last hour is answered from
 * `memo` (a Map kept by the page). Days are each point's own local days: a day that has ended there, a day
 * past the forecast range, and a point whose request failed are simply absent. With no day at all, `why`
 * says so (the plan's own reason, or "forecast-failed" with what the service answered, or "out-of-range")
 * and `failed` says it is worth asking again. This never throws.
 */
export async function fetchWeather(plan, { fetch: fetchFn = globalThis.fetch, now = () => new Date(), memo = new Map() } = {}) {
    const result = { days: {}, updatedAt: null };
    const points = Array.isArray(plan?.points) ? plan.points : [];
    if (!points.length) {
        if (plan?.failed)
            result.failed = true;
        if (plan?.why)
            result.why = plan.why;
        return result;
    }
    let detail = '';
    const forecasts = await Promise.all(points.map(async point => {
        const url = forecastUrl(point), hit = memo.get(url);
        if (hit && now().getTime() - hit.at < FRESH_MS)
            return hit.forecast;
        try {
            const response = await fetchFn(url, { referrerPolicy: 'no-referrer', credentials: 'omit', cache: 'no-store', signal: globalThis.AbortSignal?.timeout?.(10000) });
            if (!response.ok)
                throw Object.assign(new Error('refused'), { detail: `HTTP ${response.status}` });
            const forecast = parseForecast(await response.json(), now().toISOString());
            if (!forecast)
                throw Object.assign(new Error('unreadable'), { detail: 'unreadable answer' });
            memo.set(url, { at: now().getTime(), forecast });
            return forecast;
        }
        catch (e) {
            detail ||= String(e?.detail || e?.name || 'error').slice(0, 40);
            return null;
        }
    }));
    for (const [date, i] of Object.entries(plan.dates || {})) {
        const forecast = forecasts[i], day = forecast?.days[date];
        // The day boundary is the stay's own: a day that has ended there is no longer forecast.
        if (!day || date < localDate(now(), forecast.timezone))
            continue;
        result.days[date] = { ...day, today: localDate(now(), forecast.timezone), ...(points[i].where ? { where: points[i].where } : {}) };
        if (!result.updatedAt || forecast.fetchedAt < result.updatedAt)
            result.updatedAt = forecast.fetchedAt;
    }
    if (!Object.keys(result.days).length) {
        if (forecasts.some(f => !f)) {
            result.failed = true;
            result.why = { reason: 'forecast-failed', detail };
        }
        else
            result.why = { reason: 'out-of-range' };
    }
    return result;
}
