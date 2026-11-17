// The weather line under each date: rules and drawing, shared by the planner and the guest view.
// The server sends metric values per day (see lib/weather.mjs); this module only reads and draws them.
// Precipitation comes first: rain, snow, mixed or dry, the chance, and the amount when it matters.
// Temperature follows, smaller. A day with no forecast shows a quiet dash, never a guess.
import { escape } from './board.mjs';

// Thresholds, in the service's metric units.
const SNOW_CM = 0.1;        // any measurable snow is a snow day
const RAIN_MM = 1;          // less than this with a low chance still reads as dry
const LIKELY = 30;          // chance (%) at which a day with no measurable amount reads as wet
const AMOUNT_RAIN_MM = 10;  // rain amount is shown from here (about 0.4 in)
const HEAVY_RAIN_MM = 25;   // "Heavy rain" from here (about 1 in)
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * What kind of day it is, from one day's forecast:
 *   { kind: 'rain' | 'snow' | 'mixed' | 'dry', heavy, chance, rainMm, snowCm }
 * `chance` is null when the service gave none.
 */
export function classify(day) {
    const rainMm = num(day?.rainMm) ?? 0, snowCm = num(day?.snowCm) ?? 0, chance = num(day?.chance), high = num(day?.high);
    const snowy = snowCm >= SNOW_CM, likely = chance !== null && chance >= LIKELY;
    let kind = 'dry';
    if (snowy)
        kind = rainMm >= RAIN_MM ? 'mixed' : 'snow';
    else if (rainMm >= RAIN_MM || (likely && rainMm > 0))
        kind = 'rain';
    else if (likely)
        // Likely, but no amount given: the weather code or a freezing day says which.
        kind = SNOW_CODES.has(day?.code) || (high !== null && high <= 1) ? 'snow' : 'rain';
    return { kind, heavy: kind === 'rain' && rainMm >= HEAVY_RAIN_MM, chance, rainMm, snowCm };
}

/** 'us' (°F, inches) for a United States locale, otherwise 'metric' (°C, mm, cm). */
export function unitsFor(locale) {
    try {
        return new Intl.Locale(locale).maximize().region === 'US' ? 'us' : 'metric';
    }
    catch {
        return 'metric';
    }
}
const short = n => n < 2 ? String(Math.max(0.1, Math.round(n * 10) / 10)) : String(Math.round(n));
const snowAmount = (cm, units) => units === 'us' ? `${short(cm / 2.54)} in` : `${short(cm)} cm`;
const rainAmount = (mm, units) => units === 'us' ? `${short(mm / 25.4)} in` : `${Math.round(mm)} mm`;
const degrees = (c, units) => Math.round(units === 'us' ? c * 9 / 5 + 32 : c);
const WORDS = { rain: 'Rain', snow: 'Snow', mixed: 'Rain & snow', dry: 'Dry' };

/** The words of the line: `{ kind, heavy, precip, temp, spoken }`. `temp` is '' when the service gave none. */
export function weatherWords(day, units = 'metric') {
    const c = classify(day), wet = c.kind !== 'dry';
    let precip = c.heavy ? 'Heavy rain' : WORDS[c.kind];
    // A dry day stays quiet: its chance is only mentioned when it is not negligible.
    if (c.chance !== null && (wet || c.chance >= 20))
        precip += wet ? ` ${Math.round(c.chance)}%` : ` · ${Math.round(c.chance)}%`;
    let amount = '';
    if (c.kind === 'snow' && c.snowCm >= SNOW_CM)
        amount = snowAmount(c.snowCm, units);
    else if (c.kind === 'mixed')
        amount = `${snowAmount(c.snowCm, units)} snow`;
    else if (c.kind === 'rain' && c.rainMm >= AMOUNT_RAIN_MM)
        amount = rainAmount(c.rainMm, units);
    if (amount)
        precip += ` · ${amount}`;
    const high = num(day?.high), low = num(day?.low);
    const temp = high !== null && low !== null ? `${degrees(high, units)}°/${degrees(low, units)}°` : '';
    const chanceSpoken = c.chance === null ? '' : `, ${Math.round(c.chance)} percent chance of precipitation`;
    const spoken = `Forecast: ${c.heavy ? 'heavy rain' : c.kind === 'mixed' ? 'rain and snow' : c.kind}${chanceSpoken}${amount ? `, about ${amount.replace(' in', ' inches').replace(' cm', ' centimetres').replace(' mm', ' millimetres')}` : ''}.${temp ? ` High ${degrees(high, units)}, low ${degrees(low, units)} degrees ${units === 'us' ? 'Fahrenheit' : 'Celsius'}.` : ''}`;
    return { kind: c.kind, heavy: c.heavy, precip, temp, spoken };
}

// Line icons in the current text colour. Each is decorative beside its word; `label` gives it a text alternative where it stands alone.
const SHAPES = {
    rain: '<path d="M5 9.5a3 3 0 0 1 .4-6 4 4 0 0 1 7.6 1 2.5 2.5 0 0 1-.5 5z"/><path d="M5.5 12l-1 2.5M8.5 12l-1 2.5M11.5 12l-1 2.5"/>',
    snow: '<path d="M8 1.5v13M2.4 4.75l11.2 6.5M13.6 4.75L2.4 11.25"/><path d="M6.3 2.6L8 4.2l1.7-1.6M6.3 13.4L8 11.8l1.7 1.6"/>',
    mixed: '<path d="M5 9.5a3 3 0 0 1 .4-6 4 4 0 0 1 7.6 1 2.5 2.5 0 0 1-.5 5z"/><path d="M5 12l-1 2.5"/><path d="M10.5 11.2v3.6M8.9 12.1l3.2 1.8M12.1 12.1l-3.2 1.8"/>',
    dry: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>',
};
export function weatherIcon(kind, label = '') {
    return `<svg class="weather-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${escape(label)}"` : 'aria-hidden="true"'}>${label ? `<title>${escape(label)}</title>` : ''}${SHAPES[kind] || SHAPES.dry}</svg>`;
}

/** When the forecast was fetched, in the reader's own time: "Nov 17, 3:10 PM". */
export const updatedLabel = (iso, locale) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };

/**
 * The inside of one day's weather line. `day` is that date's forecast or nothing.
 * `state` is 'loading' while the first answer is on its way: the line is then empty, and the same height.
 */
export function weatherLine(day, { units = 'metric', loading = false } = {}) {
    if (loading)
        return '';
    if (!day)
        return '<span class="weather-none" aria-hidden="true">—</span><span class="sr-only">No forecast for this day</span>';
    const w = weatherWords(day, units);
    // The icon's text alternative is the spoken sentence that follows it; the visible words repeat it for sighted readers.
    return `<span class="weather-precip ${w.kind}${w.heavy ? ' heavy' : ''}" aria-hidden="true">${weatherIcon(w.kind)}<span>${escape(w.precip)}</span></span>${w.temp ? `<span class="weather-temp" aria-hidden="true">${escape(w.temp)}</span>` : ''}<span class="sr-only">${escape(w.spoken)}</span>`;
}
/** The note under the schedule saying when the forecast was fetched and where it came from. */
export const weatherNote = () => '<p class="weather-note" id="weather-note" hidden></p>';

/**
 * Fill every weather line, day chip and the note on the page from `weather` (the server's answer, or null).
 * Nothing is redrawn around them, and the lines keep their height, so the columns do not move.
 */
export function applyWeather(document, weather, { units = 'metric', loading = false, locale } = {}) {
    const days = weather?.days || {}, updated = weather?.updatedAt ? updatedLabel(weather.updatedAt, locale) : '';
    for (const line of document.querySelectorAll?.('.day-weather[data-weather]') || []) {
        const day = days[line.dataset.weather];
        line.innerHTML = weatherLine(day, { units, loading: loading && !day });
        // Where and when, on hover or long-press; the note under the schedule says the same for everyone.
        if (day)
            line.title = `${day.where ? `Forecast for ${day.where}. ` : ''}${updated ? `Updated ${updated}. ` : ''}Weather data by Open-Meteo.com`;
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
        const dates = Object.keys(days).sort();
        note.hidden = !dates.length;
        note.innerHTML = dates.length ? `Forecast for where each day’s stay is${updated ? `, updated ${escape(updated)}` : ''}. Days without one are outside the forecast range or have no usable stay location. Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo.com</a>.` : '';
    }
}
