import { matchesSelection, participantRecord } from "./participants.mjs";
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
    const where = guest ? a.address : a.guestLocation, example = a.sourceKind === 'synthetic';
    return `<button class="activity ${a.participants.length > 1 ? 'shared' : ''} ${a.fixed ? 'reserved' : ''} ${a.highlight ? 'rendezvous' : ''} ${example ? 'example' : ''}" data-detail="${escape(a.id)}">${a.highlight ? '<span class="shared-label"><span class="shared-dot" aria-hidden="true">●</span> Whole-group activity</span>' : ''}${example ? '<span class="example-label">Example · not a real plan</span>' : a.sourceKind === 'tentative' ? '<span class="example-label">Tentative · to confirm</span>' : ''}<span class="card-meta"><span>${escape(a.time || (a.date ? 'Time to confirm' : 'No day yet'))}</span>${a.fixed ? '<span class="booking">■ Fixed booking</span>' : ''}</span><strong>${escape(a.title)}</strong>${where ? `<span class="card-where">Meet · ${escape(where)}</span>` : ''}<span class="card-note">${escape(guest ? a.notes : (a.guestNotes || a.notes))}</span><span class="card-bottom"><span class="people">${a.optional ? '<span class="optional-chip">Optional</span>' : ''}${a.participants.map(id => { const f = participantRecord(trip, id); return f ? `<span class="person ${escape(f.color)}">${escape(f.name)}</span>` : ''; }).join('')}</span><span class="open-card" aria-hidden="true">→</span></span></button>`;
}
export const isExample = a => a.sourceKind === 'synthetic';
export function board(trip, { filter = 'all', day, guest = false, hideExamples = false } = {}) {
    const selected = a => matchesSelection(a, filter, trip) && !(hideExamples && isExample(a));
    const placeName = id => trip.places?.find(p => p.id === id)?.name || trip.stays.find(s => s.id === id)?.name || 'Location to confirm';
    return days(trip).map(date => { const activities = trip.activities.filter(a => a.date === date && selected(a)).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)); const stays = trip.stays.filter(s => date >= s.start && date < s.end && (!s.participants || selected(s)));
        // A stay covers its nights, so its last morning has no stay line of its own: show it as the check-out day.
        const leaving = guest ? [] : trip.stays.filter(s => s.end === date && (!s.participants || selected(s)));
        const stayLine = (s, out) => `<button type="button" class="lodging${out ? ' checkout' : ''}" data-stay-view="${escape(s.id)}" aria-label="${out ? 'Check-out day. ' : ''}Stay details: ${escape(s.lodging || s.name || placeName(s.placeId || s.id))}">⌂ ${out ? 'Check-out day · ' : ''}${escape((s.participants || []).map(id => participantRecord(trip, id)?.name || id).join(' + '))} · ${escape(s.lodging || s.name || 'Lodging to confirm')}<span class="edit-hint" aria-hidden="true">Details</span></button>`;
        const places = [...new Set([...stays.map(s => s.placeId || s.id), ...leaving.map(s => s.placeId || s.id), ...activities.map(a => a.placeId || a.stayId || null)])]; return `<section class="agenda-day" data-date="${date}" data-selected="${date === day}"><header class="agenda-date"><span>${dateLabel(date, { weekday: 'long' })}</span><h2>${`<span class="date-number">${dateLabel(date, { day: "numeric" })}</span><span class="date-month">${dateLabel(date, { month: "short" })}</span>`}</h2></header>${places.map(place => `<section class="agenda-city"><h3>${escape(placeName(place))}</h3>${guest ? '' : stays.filter(s => (s.placeId || s.id) === place).map(s => stayLine(s, false)).join('') + leaving.filter(s => (s.placeId || s.id) === place).map(s => stayLine(s, true)).join('')}<div class="cards">${activities.filter(a => (a.placeId || a.stayId || null) === place).map(a => card(a, trip, guest)).join('') || (activities.length ? '<p class="empty-lane">Open time here.</p>' : '')}</div></section>`).join('')}${activities.length ? '' : '<p class="empty-day">Room to wander.<br><span>No dated activities for this selection.</span></p>'}${guest ? '' : `<button type="button" class="add-here" data-add-date="${date}" data-add-place="${escape((stays[0] || leaving[0])?.placeId || '')}">+ Add<span class="add-here-day"> to ${dateLabel(date, { weekday: 'long' })} ${dateLabel(date, { day: 'numeric' })}</span></button>`}${guest ? '' : trip.legs.filter(l => l.date === date && selected(l)).map(l => `<button type="button" class="journeys" data-leg="${escape(l.id)}" aria-label="Journey details: ${escape(l.title)}"><strong>${escape(l.mode || 'Journey')} · ${escape(l.title)}</strong>${l.from || l.to ? `<span class="journey-line">${escape(l.from ? placeName(l.from) : 'Start to confirm')} → ${escape(l.to ? placeName(l.to) : 'End to confirm')}</span>` : ''}<span class="journey-line">${escape(l.time || 'Departure time to confirm')}${l.arrivalDate && l.arrivalDate !== l.date ? ` → ${escape(l.arrivalDate)} ${escape(l.arrivalTime)}` : l.arrivalTime ? ` → ${escape(l.arrivalTime)}` : ''}</span>${l.notes ? `<span class="journey-line">${escape(l.notes)}</span>` : ''}<span class="journey-line">${escape(l.participants.map(id => participantRecord(trip, id)?.name || id).join(" · "))}</span><span class="edit-hint" aria-hidden="true">Edit</span></button>`).join('')}</section>`; }).join('');
}
// `ideas` (a count) adds a first stop that jumps to the unscheduled ideas; phones show it, wider screens have the ideas beside the days.
export function dayChooser(trip, day, { ideas } = {}) { const marked = new Set(trip.activities.filter(a => a.highlight).map(a => a.date)); return `<nav class="day-rail" aria-label="Choose a day"><label class="day-chooser">Choose a day<select id="day">${days(trip).map(d => `<option value="${d}" ${d === day ? 'selected' : ''}>${dateLabel(d, { weekday: 'short', month: 'short', day: 'numeric' })}</option>`).join('')}</select></label><div class="medallions">${ideas === undefined ? '' : `<a class="medallion ideas-stop" href="#ideas" aria-label="Ideas, not scheduled yet: ${ideas}"><span class="medallion-day">Ideas</span><span class="medallion-num">${ideas}</span></a>`}${days(trip).map(d => `<button type="button" class="medallion" data-day="${d}" aria-pressed="${d === day}" aria-label="${dateLabel(d, { weekday: 'long', month: 'long', day: 'numeric' })}"><span class="medallion-day">${dateLabel(d, { weekday: 'short' })}</span><span class="medallion-num">${dateLabel(d, { day: 'numeric' })}</span>${marked.has(d) ? '<span class="medallion-mark" aria-hidden="true">●</span>' : ''}</button>`).join('')}</div></nav>`; }
// Ideas as cards, under a heading per place when they belong to more than one place.
export function ideaCards(list, trip, guest = false) {
    const keys = [...new Set(list.map(a => a.placeId || ''))];
    if (keys.length < 2)
        return list.map(a => card(a, trip, guest)).join('');
    const order = [...(trip.places || []).map(p => p.id), ''].filter(k => keys.includes(k));
    return order.map(k => `<h3 class="idea-place">${escape(k ? trip.places.find(p => p.id === k)?.name || 'Location to confirm' : 'Anywhere')}</h3>${list.filter(a => (a.placeId || '') === k).map(a => card(a, trip, guest)).join('')}`).join('');
}
