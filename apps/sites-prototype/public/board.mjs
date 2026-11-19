import { matchesSelection, participantRecord } from "./participants.mjs";
import { areaId, travelPlan, boardSequence, splitDay } from "./bridges.mjs";
export { areaId };
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
// "At …" names the place chosen for the activity, whether that is a venue or the area itself: an idea has no
// day heading to say it, and a chosen place should always be visible. No place chosen, no line.
export function card(a, trip, guest = false) {
    const where = guest ? a.address : a.guestLocation, example = a.sourceKind === 'synthetic', timing = timingOf(a), venue = trip.places?.find(p => p.id === a.placeId);
    return `<button class="activity ${a.participants.length > 1 ? 'shared' : ''} ${a.fixed ? 'reserved' : ''} ${a.highlight ? 'rendezvous' : ''} ${example ? 'example' : ''}" data-detail="${escape(a.id)}">${a.imageId ? guest ? `<img class="card-image" data-image="${escape(a.imageId)}" alt="" hidden>` : `<img class="card-image" src="/api/image?id=${encodeURIComponent(trip.id)}&amp;image=${encodeURIComponent(a.imageId)}" alt="" loading="lazy" decoding="async">` : ''}${a.highlight ? '<span class="shared-label"><span class="shared-dot" aria-hidden="true">●</span> Whole-group activity</span>' : ''}${example ? '<span class="example-label">Example · not a real plan</span>' : a.sourceKind === 'tentative' ? '<span class="example-label">Tentative · to confirm</span>' : ''}<span class="card-meta"><span>${escape(a.time || (!a.date ? 'No day yet' : timing === 'anytime' ? 'Any time' : 'Time to confirm'))}</span>${timing === 'set' ? '<span class="booking">■ Set time</span>' : timing === 'anytime' && a.date ? '<span class="anyday">Any day</span>' : ''}</span><strong>${escape(a.title)}</strong>${venue ? `<span class="card-venue">At ${escape(venue.name)}</span>` : ''}${where ? `<span class="card-where">Meet · ${escape(where)}</span>` : ''}<span class="card-note">${escape(guest ? a.notes : (a.guestNotes || a.notes))}</span><span class="card-bottom"><span class="people">${a.optional ? '<span class="optional-chip">Optional</span>' : ''}${a.participants.map(id => { const f = participantRecord(trip, id); return f ? `<span class="person ${escape(f.color)}">${escape(f.name)}</span>` : ''; }).join('')}</span><span class="open-card" aria-hidden="true">→</span></span></button>`;
}
export const isExample = a => a.sourceKind === 'synthetic';
export function board(trip, { filter = 'all', day, guest = false, hideExamples = false } = {}) {
    const selected = a => matchesSelection(a, filter, trip) && !(hideExamples && isExample(a));
    const placeName = id => trip.places?.find(p => p.id === id)?.name || trip.stays.find(s => s.id === id)?.name || 'Location to confirm';
    const area = id => areaId(trip, id), stayArea = s => area(s.placeId || s.id), shown = s => !s.participants || selected(s);
    const names = (ids, joiner) => (ids || []).map(id => participantRecord(trip, id)?.name || id).join(joiner);
    const plan = travelPlan(trip, { filter }), dates = days(trip), sequence = boardSequence(trip, dates, plan);
    // Columns on either side of a bridge name their place in full, so the two ends can be told apart.
    const beside = new Set(sequence.flatMap((item, i) => item.kind === 'bridge' ? [sequence[i - 1], sequence[i + 1]] : []).filter(Boolean));
    const stayLine = (s, out) => `<button type="button" class="lodging${out ? ' checkout' : ''}" data-stay-view="${escape(s.id)}" aria-label="${out ? 'Check-out day. ' : ''}Stay details: ${escape(s.lodging || s.name || placeName(s.placeId || s.id))}"><span class="lodging-text">⌂ ${out ? 'Check-out day · ' : ''}${escape(names(s.participants, ' + '))} · ${escape(s.lodging || s.name || 'Lodging to confirm')}</span><span class="edit-hint" aria-hidden="true">Details</span></button>`;
    // A journey that is not a change of stay (a day trip, the flight in or out) is an ordinary item in its day.
    const journey = l => `<button type="button" class="journeys" data-leg="${escape(l.id)}" aria-label="Journey details: ${escape(l.title)}"><strong>${escape(l.mode || 'Journey')} · ${escape(l.title)}</strong>${l.from || l.to ? `<span class="journey-line">${escape(l.from ? placeName(l.from) : 'Start to confirm')} → ${escape(l.to ? placeName(l.to) : 'End to confirm')}</span>` : ''}<span class="journey-line">${escape(l.time || 'Departure time to confirm')}${l.arrivalDate && l.arrivalDate !== l.date ? ` → ${escape(l.arrivalDate)} ${escape(l.arrivalTime)}` : l.arrivalTime ? ` → ${escape(l.arrivalTime)}` : ''}</span>${l.notes ? `<span class="journey-line">${escape(l.notes)}</span>` : ''}<span class="journey-line">${escape(names(l.participants, ' · '))}</span><span class="edit-hint" aria-hidden="true">Edit</span></button>`;
    const header = (date, part, label) => `<header class="agenda-date"><span class="weekday"><span class="wd-long">${dateLabel(date, { weekday: 'long' })}</span><abbr class="wd-short" title="${dateLabel(date, { weekday: 'long' })}">${dateLabel(date, { weekday: 'short' })}</abbr></span><h2>${`<span class="date-number">${dateLabel(date, { day: "numeric" })}</span><span class="date-month">${dateLabel(date, { month: "short" })}</span>`}</h2>${part === 'before' ? '<p class="day-weather none" aria-hidden="true"></p>' : `<p class="day-weather" data-weather="${date}"></p>`}${part ? `<p class="day-part">${label}</p>` : ''}</header>`;
    // One column: a whole day, or one part of a travel day. `staying` and `leaving` are the stay lines it carries.
    function column(item, { staying, leaving, activities, journeys, dayCount }) {
        const { date, part } = item, changes = plan.lodging.filter(c => c.date === date);
        const cardArea = a => area(a.placeId || a.stayId || null);
        // In one part of a travel day the sections follow the cards' own order, so breakfast before check-out reads first.
        const places = part && activities.length ? [...new Set([...activities.map(cardArea), ...leaving.map(stayArea), ...staying.map(stayArea)])] : [...new Set([...leaving.map(stayArea), ...staying.map(stayArea), ...activities.map(cardArea)])];
        // The flight or drive in to a stay that starts today reads first; other journeys follow the day's cards.
        const arriving = part ? [] : journeys.filter(l => l.to && !l.from && staying.some(s => s.start === date && stayArea(s) === area(l.to)));
        const label = part === 'before' ? `1 of 2 · Leaving ${escape([...new Set(item.moves.map(m => placeName(m.from)))].join(', '))}` : part === 'after' ? `2 of 2 · Arriving in ${escape([...new Set(item.moves.map(m => placeName(m.to)))].join(', '))}` : '';
        const sections = places.map(place => {
            const out = leaving.filter(s => stayArea(s) === place), into = staying.filter(s => stayArea(s) === place), cards = activities.filter(a => area(a.placeId || a.stayId || null) === place);
            const change = changes.some(c => c.area === place && out.some(s => s.id === c.from) && into.some(s => s.id === c.to));
            return `<section class="agenda-city"><h3 title="${escape(placeName(place))}">${escape(placeName(place))}</h3>${out.map(s => stayLine(s, true)).join('')}${change ? '<p class="lodging-change"><span aria-hidden="true">↓</span> Change of lodging · same area, no travel day</p>' : ''}${into.map(s => stayLine(s, false)).join('')}<div class="cards">${cards.map(a => `${guest ? '' : `<button type="button" class="insert-here" data-add-date="${date}" data-add-place="${escape(a.placeId || '')}" data-before="${escape(a.id)}" aria-label="Add an activity before ${escape(a.title)}"><span aria-hidden="true">+ Add here</span></button>`}${card(a, trip, guest)}`).join('') || (activities.length ? '<p class="empty-lane">Open time here.</p>' : '')}</div></section>`;
        }).join('');
        const empty = dayCount || part === 'before' ? '' : '<p class="empty-day">Room to wander.<br><span>No dated activities for this selection.</span></p>';
        const add = guest ? '' : `<button type="button" class="add-here" data-add-date="${date}" data-add-place="${escape((part === 'before' ? leaving[0] : staying[0] || leaving[0])?.placeId || '')}">+ Add<span class="add-here-day"> to ${dateLabel(date, { weekday: 'long' })} ${dateLabel(date, { day: 'numeric' })}</span></button>`;
        return `<section class="agenda-day" data-date="${date}" data-selected="${date === day}"${part ? ` data-part="${part}"` : ''}${beside.has(item) ? ' data-by-bridge' : ''}>${header(date, part, label)}${arriving.map(journey).join('')}${sections}${empty}${journeys.filter(l => !arriving.includes(l)).map(journey).join('')}${add}</section>`;
    }
    return sequence.map(item => {
        if (item.kind === 'bridge')
            return bridgeHtml(trip, item, { day, guest, placeName, names });
        const { date } = item, activities = trip.activities.filter(a => a.date === date && selected(a)).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
        const staying = trip.stays.filter(s => date >= s.start && date < s.end && shown(s));
        // A stay covers its nights, so its last morning has no stay line of its own: show it as the check-out day.
        const leaving = trip.stays.filter(s => s.end === date && shown(s));
        const journeys = guest ? [] : trip.legs.filter(l => l.date === date && selected(l) && !plan.bridgeLegIds.has(l.id));
        if (item.kind === 'day')
            return column(item, { staying, leaving, activities, journeys, dayCount: activities.length });
        // A travel day in two parts: the stays being left on one side of the bridge, everything else on the other.
        const departing = leaving.filter(s => item.moves.some(m => m.fromStays.includes(s))), halves = splitDay(trip, item.moves, activities), before = item.part === 'before';
        const leavingFrom = l => l.from && item.moves.some(m => m.from === area(l.from));
        return column(item, before
            ? { staying: [], leaving: departing, activities: halves.before, journeys: journeys.filter(leavingFrom), dayCount: activities.length }
            : { staying, leaving: leaving.filter(s => !departing.includes(s)), activities: halves.after, journeys: journeys.filter(l => !leavingFrom(l)), dayCount: activities.length });
    }).join('');
}
// The bridge in the gap between two columns: one card per move, carrying its transport.
const when = (date, time) => [date ? `${dateLabel(date, { weekday: 'short' })} ${dateLabel(date, { day: 'numeric' })}` : '', time].filter(Boolean).join(', ');
export function legTimes(l) {
    const overnight = l.arrivalDate && l.arrivalDate !== l.date;
    return `${overnight ? when(l.date, l.time || 'time to confirm') : l.time || 'Time to confirm'}${overnight ? ` → ${when(l.arrivalDate, l.arrivalTime)}` : l.arrivalTime ? ` → ${l.arrivalTime}` : ''}`;
}
function bridgeHtml(trip, item, { day, guest, placeName, names }) {
    const cards = item.moves.map(m => {
        const route = `<span class="bridge-route"><span class="bridge-place">${escape(placeName(m.from))}</span><span class="bridge-arrow" aria-hidden="true">→</span><span class="bridge-place">${escape(placeName(m.to))}</span></span>`;
        const who = m.participants.length ? `<span class="bridge-who">${escape(names(m.participants, ' · '))}</span>` : '';
        const legs = m.legs.map(l => `<span class="bridge-leg"><span class="bridge-mode">${escape(l.mode || 'Journey')}</span><strong>${escape(l.title)}</strong><span class="bridge-times">${escape(legTimes(l))}</span></span>`).join('');
        const label = `Travel: ${placeName(m.from)} to ${placeName(m.to)}. ${m.legs.length ? m.legs.map(l => `${l.mode || 'Journey'}, ${l.title}, ${legTimes(l)}`).join('; ') : 'No transport entered yet'}.`;
        // Journeys are never sent to the guest link, so a guest sees that the group moves, and between where.
        if (guest)
            return `<div class="bridge-card quiet" role="group" aria-label="${escape(`Travel: ${placeName(m.from)} to ${placeName(m.to)}`)}"><span class="bridge-mode">Travel</span>${route}${who}</div>`;
        return `<button type="button" class="bridge-card${m.legs.length ? '' : ' quiet'}" data-bridge="${escape(m.id)}" aria-label="${escape(label)} Open details.">${legs || '<span class="bridge-mode">Travel</span>'}${route}${who}${m.legs.length ? '' : '<span class="bridge-prompt">How are we getting there? Not entered yet.</span>'}<span class="edit-hint" aria-hidden="true">${m.legs.some(l => l.notes) ? 'Notes' : m.legs.length ? 'Details' : 'Add'}</span></button>`;
    }).join('');
    return `<div class="bridge" data-bridge-dates="${item.dates.join(' ')}" data-selected="${item.dates.includes(day)}">${cards}</div>`;
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
    // Side by side the board is a grid, or a row when it carries travel bridges; a phone stacks it as a block.
    if (style.display !== 'grid' && style.display !== 'flex')
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
