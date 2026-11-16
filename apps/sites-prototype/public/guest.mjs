import { usefulFilterChoices, participantRecord } from "./participants.mjs";
import { escape, preferredDay, board, dayChooser } from './board.mjs';
import { buildOfflineHtml } from './offline-export.mjs';
const app = document.querySelector('#guest-app'), token = location.hash.slice(1);
let trip, revision, updatedAt, day, filter = 'all';
const phone = () => window.matchMedia?.('(max-width:760px)').matches;
let layout;
function render() {
    layout = phone();
    const choices = usefulFilterChoices(trip);
    if (filter !== 'all' && !choices.some(f => f.id === filter))
        filter = 'all';
    const filterLabel = choices.length ? `<label class="traveler-select">Show plans for<select id="family"><option value="all">Everyone</option>${choices.map(f => `<option value="${escape(f.id)}" ${f.id === filter ? 'selected' : ''}>${escape(f.name)}</option>`).join('')}</select></label>` : '';
    // Read-only, said in a sentence, with the way to the planner for people the organizer has added.
    const banner = '<p class="guest-banner" role="note"><strong>You are viewing a read-only copy.</strong> To add or change plans, ask the organizer to add you, then <a href="/" target="_top" rel="noreferrer">sign in to the planner</a>.</p>';
    const guide = 'Browse the options. Optional activities are choices, not sign-ups. No changes can be made from this view.';
    const meta = `Revision ${revision} · Last updated ${escape(new Date(updatedAt).toLocaleString())}. Refresh to check for changes.`;
    const schedule = `${dayChooser(trip, day)}<div class="date-board" id="itinerary" tabindex="-1">${board(trip, { filter, day, guest: true })}</div>`;
    const dialog = `<dialog id="detail" aria-labelledby="detail-title"><button class="icon-button" id="close" aria-label="Close details">×</button><h2 id="detail-title"></h2><div id="detail-body"></div></dialog>`;
    // Phone: the schedule comes first, matching the signed-in planner; reading-copy and refresh controls follow it.
    app.innerHTML = layout
        ? `<a class="skip-link" href="#itinerary">Skip to itinerary</a><header class="topbar slim" id="top"><span class="brand">Waypoint<span class="brand-dot">↗</span></span><span class="private-label">● Guest view · read only</span></header><main class="compact schedule-first"><section class="trip-bar" aria-label="Schedule and traveler selection"><h1 class="trip-name">${escape(trip.title)}</h1>${filterLabel}</section>${banner}${schedule}<section class="manage" id="manage" aria-labelledby="manage-title"><h2 id="manage-title">About this schedule</h2><p class="manage-trip">${escape(trip.title)} · ${escape(trip.start)} – ${escape(trip.end)} · ${escape(trip.timezone)}</p>${trip.subtitle ? `<p>${escape(trip.subtitle)}</p>` : ''}<p role="status" id="guest-status">${guide}</p><div class="manage-group"><h3>Copies &amp; updates</h3><div class="tools"><button class="secondary" id="refresh">Refresh</button><button class="secondary" id="download">Save a reading copy</button></div><p class="study-meta">${meta}</p></div><a class="jump-link back-top" href="#top">↑ Back to the schedule</a></section><footer>Read-only guest link · No account or RSVP required. Keep the link within your group.</footer></main>${dialog}`
        : `<a class="skip-link" href="#itinerary">Skip to itinerary</a><header class="topbar"><span class="brand">Waypoint<span class="brand-dot">↗</span></span><span class="private-label">● Guest view · read only</span></header><main class="compact"><header class="trip-header"><div><span class="eyebrow">An invitation to explore</span><h1>${escape(trip.title)}<span class="title-dot">.</span></h1><p class="trip-subtitle">${escape(trip.subtitle)}</p><p class="trip-facts">${escape(trip.start)} – ${escape(trip.end)} · ${escape(trip.timezone)}</p></div></header><div class="toolbar">${filterLabel}<button class="secondary" id="refresh">Refresh</button><button class="secondary" id="download">Save a reading copy</button></div>${banner}<p role="status" id="guest-status">${guide}</p><p class="study-meta">${meta}</p>${schedule}<footer>Read-only guest link · No account or RSVP required. Keep the link within your group.</footer></main>${dialog}`;
    const selected = document.querySelector(`[data-date="${day}"]`);
    if (selected)
        document.querySelector('#itinerary').scrollLeft = selected.offsetLeft - document.querySelector('#itinerary').offsetLeft;
    const rail = document.querySelector('.medallions'), chosen = rail?.querySelector('[aria-pressed=true]');
    if (chosen)
        rail.scrollLeft = chosen.offsetLeft - rail.offsetLeft - (rail.clientWidth - chosen.offsetWidth) / 2;
}
window.matchMedia?.('(max-width:760px)').addEventListener?.('change', () => { if (trip && layout !== phone() && !document.querySelector('dialog[open]')) render(); });
async function load() { try {
    const r = await fetch('/api/shared', { headers: { Authorization: `Share ${token}` }, cache: 'no-store', credentials: 'omit' });
    const data = await r.json();
    if (!r.ok)
        throw new Error(data.error);
    ({ trip, revision, updatedAt } = data);
    day = preferredDay(trip, day);
    render();
}
catch (e) {
    if (trip) {
        document.querySelector('#guest-status').textContent = 'Could not refresh. You are reading the previously loaded copy; the guest link may have been disabled.';
    }
    else
        app.innerHTML = `<main class="welcome"><span class="wordmark">Waypoint</span><h1>This guest link is unavailable.</h1><p>${escape(e.message || 'Ask the organizer for a current link.')}</p><p>No private trip data is available here.</p></main>`;
} }
document.addEventListener('change', e => { if (e.target.id === 'family') {
    filter = e.target.value;
    render();
    document.querySelector('#family').focus();
} if (e.target.id === 'day') {
    day = e.target.value;
    render();
    document.querySelector('#day').focus();
} });
document.addEventListener('click', async (e) => { if (e.target.closest('.skip-link')) {
    e.preventDefault();
    document.querySelector('#itinerary').focus();
    return;
} const b = e.target.closest('button'); if (!b)
    return; if (b.dataset.day) {
    day = b.dataset.day;
    render();
    document.querySelector(`.medallion[data-day="${day}"]`)?.focus();
} if (b.id === 'refresh')
    await load(); if (b.id === 'close')
    document.querySelector('#detail').close(); if (b.dataset.detail) {
    const a = trip.activities.find(a => a.id === b.dataset.detail);
    document.querySelector('#detail-title').textContent = a.title;
    document.querySelector('#detail-body').innerHTML = `<p>${escape(a.date)} · ${escape(a.time || 'Time to confirm')}</p>${[a.highlight && 'Whole-group activity', a.optional && 'Optional', a.fixed && 'Fixed booking'].some(Boolean) ? `<p>${[a.highlight && 'Whole-group activity', a.optional && 'Optional', a.fixed && 'Fixed booking'].filter(Boolean).join(' · ')}</p>` : ''}<p class="guest-notes">${escape(a.notes)}</p><p>${escape(a.address || 'Meeting point to confirm')}</p><p>${a.participants.map(id => escape(participantRecord(trip,id)?.name||'Some travelers')).join(' · ')}</p>`;
    document.querySelector('#detail').showModal();
} if (b.id === 'download') {
    const html = buildOfflineHtml({ trip, revision }, { downloadedAt: new Date().toISOString() });
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'waypoint-guest-itinerary.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
} });
load();
