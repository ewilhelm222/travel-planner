import { matchesSelection, participantRecord } from "./participants.mjs";
// One day at a time (phone, upright) or days side by side. Must match the media queries in planner.css.
export const PHONE_QUERY = '(max-width: 559px), (max-width: 760px) and (orientation: portrait)';
// How firm an activity's timing is. "set": day and time are protected (stored as `fixed`). "day": on that day, time
// loose. "anytime": any day of the stay, whether it sits in Ideas or is pencilled onto a day. `fixed` decides set or
// not; `timing` only tells "day" from "anytime". Records saved before this existed read as "set" or "day".
export const TIMINGS = ['set', 'day', 'anytime'];
export const TIMING_LABELS = { set: 'Set time', day: 'That day', anytime: 'Any day of the stay' };
export function timingOf(a) {
    if (!a?.date)
        return 'anytime';
    if (a.fixed === true)
        return 'set';
    return a.timing === 'anytime' ? 'anytime' : 'day';
}
// Places come in at most two levels: an area (a city, a camp) and venues inside it. The board groups a day by area.
export const areaId = (trip, placeId) => trip.places?.find(p => p.id === placeId)?.parentId || placeId || null;
// Areas in the trip's order, each followed by its venues.
export function orderedPlaces(trip) {
    const places = trip.places || [], top = places.filter(p => !p.parentId || !places.some(x => x.id === p.parentId));
    return top.flatMap(area => [{ ...area, depth: 0 }, ...places.filter(p => p.parentId === area.id).map(p => ({ ...p, depth: 1, areaName: area.name }))]);
}
export const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const dateLabel = (date, options = { month: "short", day: "numeric" }) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...options });
export function days(trip) {
    const result = [];
    const end = trip.end || trip.stays.at(-1)?.end;
    for (let date = trip.start || trip.stays[0]?.start; date && date <= end && result.length < 121;) {
        result.push(date);
        const next = new Date(`${date}T12:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        date = next.toISOString().slice(0, 10);
    }
    return result;
}
export function preferredDay(trip, previous) {
    const dates = days(trip);
    if (dates.includes(previous))
        return previous;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: trip.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return dates.includes(today) ? today : dates[0];
}
// One card for planner and guest. State is always in words: a whole-group activity, an example that is
// not a real plan, a fixed booking, optional. An ordinary planned activity carries no extra label.
export function card(a, trip, guest = false) {
    const where = guest ? a.address : a.guestLocation, example = a.sourceKind === 'synthetic', timing = timingOf(a), venue = trip.places?.find(p => p.id === a.placeId && p.parentId);
    return `<button class="activity ${a.participants.length > 1 ? 'shared' : ''} ${a.fixed ? 'reserved' : ''} ${a.highlight ? 'rendezvous' : ''} ${example ? 'example' : ''}" data-detail="${escape(a.id)}">${!guest && a.imageId ? `<img class="card-image" src="/api/image?id=${encodeURIComponent(trip.id)}&amp;image=${encodeURIComponent(a.imageId)}" alt="" loading="lazy" decoding="async">` : ''}${a.highlight ? '<span class="shared-label"><span class="shared-dot" aria-hidden="true">●</span> Whole-group activity</span>' : ''}${example ? '<span class="example-label">Example · not a real plan</span>' : a.sourceKind === 'tentative' ? '<span class="example-label">Tentative · to confirm</span>' : ''}<span class="card-meta"><span>${escape(a.time || (!a.date ? 'No day yet' : timing === 'anytime' ? 'Any time' : 'Time to confirm'))}</span>${timing === 'set' ? '<span class="booking">■ Set time</span>' : timing === 'anytime' && a.date ? '<span class="anyday">Any day</span>' : ''}</span><strong>${escape(a.title)}</strong>${venue ? `<span class="card-venue">At ${escape(venue.name)}</span>` : ''}${where ? `<span class="card-where">Meet · ${escape(where)}</span>` : ''}<span class="card-note">${escape(guest ? a.notes : (a.guestNotes || a.notes))}</span><span class="card-bottom"><span class="people">${a.optional ? '<span class="optional-chip">Optional</span>' : ''}${a.participants.map(id => { const f = participantRecord(trip, id); return f ? `<span class="person ${escape(f.color)}">${escape(f.name)}</span>` : ''; }).join('')}</span><span class="open-card" aria-hidden="true">→</span></span></button>`;
}
export const isExample = a => a.sourceKind === 'synthetic';
export function board(trip, { filter = 'all', day, guest = false, hideExamples = false } = {}) {
    const selected = a => matchesSelection(a, filter, trip) && !(hideExamples && isExample(a));
    const placeName = id => trip.places?.find(p => p.id === id)?.name || trip.stays.find(s => s.id === id)?.name || 'Location to confirm';
    return days(trip).map(date => { const activities = trip.activities.filter(a => a.date === date && selected(a)).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)); const stays = trip.stays.filter(s => date >= s.start && date < s.end && (!s.participants || selected(s)));
        // A stay covers its nights, so its last morning has no stay line of its own: show it as the check-out day.
        const leaving = trip.stays.filter(s => s.end === date && (!s.participants || selected(s)));
        const stayLine = (s, out) => `<button type="button" class="lodging${out ? ' checkout' : ''}" data-stay-view="${escape(s.id)}" aria-label="${out ? 'Check-out day. ' : ''}Stay details: ${escape(s.lodging || s.name || placeName(s.placeId || s.id))}"><span class="lodging-text">⌂ ${out ? 'Check-out day · ' : ''}${escape((s.participants || []).map(id => participantRecord(trip, id)?.name || id).join(' + '))} · ${escape(s.lodging || s.name || 'Lodging to confirm')}</span><span class="edit-hint" aria-hidden="true">Details</span></button>`;
        const area = id => areaId(trip, id);
        const places = [...new Set([...stays.map(s => area(s.placeId || s.id)), ...leaving.map(s => area(s.placeId || s.id)), ...activities.map(a => area(a.placeId || a.stayId || null))])]; return `<section class="agenda-day" data-date="${date}" data-selected="${date === day}"><header class="agenda-date"><span class="weekday"><span class="wd-long">${dateLabel(date, { weekday: 'long' })}</span><abbr class="wd-short" title="${dateLabel(date, { weekday: 'long' })}">${dateLabel(date, { weekday: 'short' })}</abbr></span><h2>${`<span class="date-number">${dateLabel(date, { day: "numeric" })}</span><span class="date-month">${dateLabel(date, { month: "short" })}</span>`}</h2></header>${places.map(place => `<section class="agenda-city"><h3 title="${escape(placeName(place))}">${escape(placeName(place))}</h3>${stays.filter(s => area(s.placeId || s.id) === place).map(s => stayLine(s, false)).join('') + leaving.filter(s => area(s.placeId || s.id) === place).map(s => stayLine(s, true)).join('')}<div class="cards">${activities.filter(a => area(a.placeId || a.stayId || null) === place).map(a => `${guest ? '' : `<button type="button" class="insert-here" data-add-date="${date}" data-add-place="${escape(a.placeId || '')}" data-before="${escape(a.id)}" aria-label="Add an activity before ${escape(a.title)}"><span aria-hidden="true">+ Add here</span></button>`}${card(a, trip, guest)}`).join('') || (activities.length ? '<p class="empty-lane">Open time here.</p>' : '')}</div></section>`).join('')}${activities.length ? '' : '<p class="empty-day">Room to wander.<br><span>No dated activities for this selection.</span></p>'}${guest ? '' : `<button type="button" class="add-here" data-add-date="${date}" data-add-place="${escape((stays[0] || leaving[0])?.placeId || '')}">+ Add<span class="add-here-day"> to ${dateLabel(date, { weekday: 'long' })} ${dateLabel(date, { day: 'numeric' })}</span></button>`}${guest ? '' : trip.legs.filter(l => l.date === date && selected(l)).map(l => `<button type="button" class="journeys" data-leg="${escape(l.id)}" aria-label="Journey details: ${escape(l.title)}"><strong>${escape(l.mode || 'Journey')} · ${escape(l.title)}</strong>${l.from || l.to ? `<span class="journey-line">${escape(l.from ? placeName(l.from) : 'Start to confirm')} → ${escape(l.to ? placeName(l.to) : 'End to confirm')}</span>` : ''}<span class="journey-line">${escape(l.time || 'Departure time to confirm')}${l.arrivalDate && l.arrivalDate !== l.date ? ` → ${escape(l.arrivalDate)} ${escape(l.arrivalTime)}` : l.arrivalTime ? ` → ${escape(l.arrivalTime)}` : ''}</span>${l.notes ? `<span class="journey-line">${escape(l.notes)}</span>` : ''}<span class="journey-line">${escape(l.participants.map(id => participantRecord(trip, id)?.name || id).join(" · "))}</span><span class="edit-hint" aria-hidden="true">Edit</span></button>`).join('')}</section>`; }).join('');
}
// `ideas` (a count) adds a first stop that jumps to the unscheduled ideas; phones show it, wider screens have the ideas beside the days.
export function dayChooser(trip, day, { ideas, allDays } = {}) { const marked = new Set(trip.activities.filter(a => a.highlight).map(a => a.date)); return `<nav class="day-rail" aria-label="Choose a day"><label class="day-chooser">Choose a day<select id="day">${days(trip).map(d => `<option value="${d}" ${d === day ? 'selected' : ''}>${dateLabel(d, { weekday: 'short', month: 'short', day: 'numeric' })}</option>`).join('')}</select></label><div class="medallions">${ideas === undefined ? '' : `<a class="medallion ideas-stop" href="#ideas" aria-label="Ideas, not scheduled yet: ${ideas}"><span class="medallion-day">Ideas</span><span class="medallion-num">${ideas}</span></a>`}${allDays === undefined ? '' : `<button type="button" class="medallion all-stop" data-day-mode="all" aria-pressed="${allDays === true}" aria-label="Show all days in one scroll"><span class="medallion-day">All</span><span class="medallion-num">days</span></button>`}${days(trip).map(d => `<button type="button" class="medallion" data-day="${d}" aria-pressed="${d === day}" aria-label="${dateLabel(d, { weekday: 'long', month: 'long', day: 'numeric' })}"><span class="medallion-day">${dateLabel(d, { weekday: 'short' })}</span><span class="medallion-num">${dateLabel(d, { day: 'numeric' })}</span>${marked.has(d) ? '<span class="medallion-mark" aria-hidden="true">●</span>' : ''}</button>`).join('')}</div></nav>`; }
// Ideas as cards, under a heading per place when they belong to more than one place.
export function ideaCards(list, trip, guest = false) {
    const key = a => areaId(trip, a.placeId) || '', keys = [...new Set(list.map(key))];
    if (keys.length < 2)
        return list.map(a => card(a, trip, guest)).join('');
    const order = [...(trip.places || []).map(p => p.id), ''].filter(k => keys.includes(k));
    return order.map(k => `<h3 class="idea-place">${escape(k ? trip.places.find(p => p.id === k)?.name || 'Location to confirm' : 'Anywhere')}</h3>${list.filter(a => key(a) === k).map(a => card(a, trip, guest)).join('')}`).join('');
}
// All-days phone view: the day whose section has reached the top of the screen, just under the pinned day rail.
export function dayInView(document) {
    const line = (document.querySelector('.day-rail')?.getBoundingClientRect().bottom || 0) + 24;
    let found = null;
    for (const section of document.querySelectorAll('#itinerary .agenda-day[data-date]')) {
        if (section.getBoundingClientRect().top > line)
            break;
        found = section.dataset.date;
    }
    return found;
}
// Mark a day as current on the rail and in the labelled select without redrawing the page.
export function pressDay(document, date) {
    for (const m of document.querySelectorAll('.medallion[data-day]'))
        m.setAttribute('aria-pressed', String(m.dataset.day === date));
    const select = document.querySelector('#day');
    if (select)
        select.value = date;
    const rail = document.querySelector('.medallions'), chosen = rail?.querySelector('.medallion[data-day][aria-pressed=true]');
    if (chosen)
        rail.scrollLeft = chosen.offsetLeft - rail.offsetLeft - (rail.clientWidth - chosen.offsetWidth) / 2;
}
// Day columns side by side: size them so a whole number fills the board, so the right-most one is never cut
// off mid-word. The narrowest acceptable column (--col-min) and the gap come from the stylesheet.
export function columnsThatFit(width, min, gap) {
    return Math.max(1, Math.floor((width + gap) / (min + gap)));
}
export function fitColumns(board) {
    if (!board || typeof getComputedStyle !== 'function')
        return;
    const style = getComputedStyle(board);
    if (style.display !== 'grid')
        return void board.style.removeProperty('--cols');
    board.style.setProperty('--cols', String(columnsThatFit(board.clientWidth, parseFloat(style.getPropertyValue('--col-min')) || 300, parseFloat(style.columnGap) || 0)));
}
// One-day phone view: a quick, mostly horizontal flick moves to the next (1) or previous (-1) day; anything
// else is 0. Flicks that start at the screen edge are left to the browser's own back/forward gesture, and a
// slow press is left to press-and-hold drag.
export function swipeStep({ dx, dy, ms, startX, width }) {
    if (ms > 700 || Math.abs(dx) < 70 || Math.abs(dx) < 2.5 * Math.abs(dy) || startX < 24 || startX > width - 24)
        return 0;
    return dx < 0 ? 1 : -1;
}
