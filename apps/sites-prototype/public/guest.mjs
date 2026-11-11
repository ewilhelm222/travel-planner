import { escape, preferredDay, board, dayChooser } from './board.mjs';
import { buildOfflineHtml } from './offline-export.mjs';
const app = document.querySelector('#guest-app'), token = location.hash.slice(1);
let trip, revision, updatedAt, day, filter = 'all';
function render() { app.innerHTML = `<a class="skip-link" href="#itinerary">Skip to itinerary</a><header class="topbar"><span class="brand">waypoint<span class="brand-dot">↗</span></span><span class="private-label">GUEST VIEW · READ ONLY</span></header><main class="compact"><header class="trip-header"><div><span class="eyebrow">AN INVITATION TO EXPLORE</span><h1>${escape(trip.title)}<span class="title-dot">*</span></h1><p class="trip-subtitle">${escape(trip.subtitle)}</p><p class="trip-facts">${escape(trip.start)} – ${escape(trip.end)} · ${escape(trip.timezone)}</p></div></header><div class="toolbar"><label>Travelers<select id="family"><option value="all">Everyone</option>${trip.families.map(f => `<option value="${escape(f.id)}" ${f.id === filter ? 'selected' : ''}>${escape(f.name)}</option>`).join('')}</select></label><button class="secondary" id="refresh">Refresh</button><button class="secondary" id="download">Save a reading copy</button></div><p role="status" id="guest-status">Browse the options. Optional activities are choices, not sign-ups. No changes can be made from this view.</p><p class="study-meta">Revision ${revision} · Last updated ${escape(new Date(updatedAt).toLocaleString())}. Refresh to check for changes.</p>${dayChooser(trip, day)}<div class="date-board" id="itinerary" tabindex="-1">${board(trip, { filter, day, guest: true })}</div><footer>Read-only guest link · No account or RSVP required. Keep the link within your group.</footer></main><dialog id="detail" aria-labelledby="detail-title"><button class="icon-button" id="close" aria-label="Close details">×</button><h2 id="detail-title"></h2><div id="detail-body"></div></dialog>`; const selected = document.querySelector(`[data-date="${day}"]`); if (selected)
    document.querySelector('#itinerary').scrollLeft = selected.offsetLeft - document.querySelector('#itinerary').offsetLeft; }
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
        app.innerHTML = `<main class="welcome"><span class="wordmark">WAYPOINT</span><h1>This guest link is unavailable.</h1><p>${escape(e.message || 'Ask the organizer for a current link.')}</p><p>No private trip data is available here.</p></main>`;
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
    return; if (b.id === 'refresh')
    await load(); if (b.id === 'close')
    document.querySelector('#detail').close(); if (b.dataset.detail) {
    const a = trip.activities.find(a => a.id === b.dataset.detail);
    document.querySelector('#detail-title').textContent = a.title;
    document.querySelector('#detail-body').innerHTML = `<p>${escape(a.date)} · ${escape(a.time || 'Time to confirm')}</p><p>${a.optional ? 'Optional · available to join' : 'Planned activity'}${a.fixed ? ' · Fixed booking' : ''}</p><p class="guest-notes">${escape(a.notes)}</p><p>${escape(a.address || 'Meeting point to confirm')}</p><p>${a.participants.map(id => escape(trip.families.find(f => f.id === id)?.name)).join(' · ')}</p>`;
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
