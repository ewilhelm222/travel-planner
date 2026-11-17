// The read-only view of one activity, shared by the signed-in planner and the guest page.
// Tapping a card opens this; the editor opens only from its Edit button, which is drawn only
// when `canEdit` is true. Hiding the button is a convenience, not the protection: every save
// is still authorized on the server.
import { escape, dateLabel, timingOf } from './board.mjs';
import { participantRecord } from './participants.mjs';
import { locationAddress, placeLinks, activityLinks } from './maps.mjs';
import { linkRow } from './map-panel.mjs';

export const VIEW_ID = 'activity-view';
/** The empty dialog both pages put in their markup. Cream reading surface, not a form. */
export const viewDialog = () => `<dialog id="${VIEW_ID}" class="activity-view" aria-labelledby="activity-view-title"></dialog>`;

const section = (label, body, cls = '') => body ? `<section class="view-section ${cls}"><h3>${label}</h3>${body}</section>` : '';

/**
 * What the view says. `guest` reads the guest projection, where `notes` and `address` are already the
 * guest description and meeting point and nothing private was sent. Signed-in people see every field
 * the activity has, with the private ones named as private.
 * Signed-in people also get an empty line for "Last edited by", which the planner fills from the change log;
 * the guest view has no such line, because guests have no access to History.
 */
export function activityViewHtml(a, trip, { guest = false, canEdit = false } = {}) {
    const timing = timingOf(a), example = a.sourceKind === 'synthetic', tentative = a.sourceKind === 'tentative';
    const place = (trip.places || []).find(p => p.id === a.placeId) || null;
    const meet = guest ? a.address : a.guestLocation;
    const description = guest ? a.notes : a.guestNotes;
    const when = a.date
        ? `${escape(dateLabel(a.date, { weekday: 'long', month: 'short', day: 'numeric' }))} · ${escape(a.time || (timing === 'anytime' ? 'Any time' : 'Time to confirm'))}`
        : `An idea · no day yet${a.time ? ` · ${escape(a.time)}` : ''}`;
    const firm = timing === 'set' ? '<span class="booking">■ Set time</span>' : timing === 'anytime' && a.date ? '<span class="anyday">Any day of the stay</span>' : '';
    const labels = `${a.highlight ? '<span class="shared-label"><span class="shared-dot" aria-hidden="true">●</span> Whole-group activity</span>' : ''}${example ? '<span class="example-label">Example · not a real plan</span>' : tentative ? '<span class="example-label">Tentative · to confirm</span>' : ''}`;
    // Reviewed links first. Searches and directions are private, like the addresses they are made from: the guest
    // projection carries no address, so a guest sees none. An activity with no place uses its own private address.
    const groups = place ? placeLinks(place, { guest }) : activityLinks(a, { guest }), links = groups.reviewed, linkName = place?.name || a.title;
    const mapAddress = guest ? '' : locationAddress(place);
    const outside = [groups.search, groups.directions].map(g => linkRow(g, linkName).replace(/^<span class="map-links map-search">(.*)<\/span>$/s, '<p class="map-links map-search">$1</p>')).join('');
    const area = place?.parentId ? (trip.places || []).find(p => p.id === place.parentId) : null;
    // The picture, if the card has one: signed-in people load it directly, the guest page fills it in with its token.
    const picture = a.imageId ? guest ? `<img class="view-image" data-image="${escape(a.imageId)}" alt="" hidden>` : `<img class="view-image" src="/api/image?id=${encodeURIComponent(trip.id)}&amp;image=${encodeURIComponent(a.imageId)}" alt="">` : '';
    const placeLine = place ? `${area ? `${escape(area.name)} › ` : ''}${escape(place.name)}${place.localName ? ` <span lang="zh-Hans">${escape(place.localName)}</span>` : ''}` : '';
    const placeAddress = place && (place.address || place.localAddress) ? `<span class="view-address">${escape(place.address)}${place.address && place.localAddress ? ' · ' : ''}${place.localAddress ? `<span lang="zh-Hans">${escape(place.localAddress)}</span>` : ''}</span>` : '';
    const where = `${meet ? `<p class="view-meet"><span class="view-key">Meet</span><span>${escape(meet)}</span></p>` : ''}${placeLine || placeAddress ? `<p class="view-place"><span class="view-key">Place</span><span>${placeLine}${placeAddress}</span></p>` : ''}${!guest && a.address ? `<p class="view-place"><span class="view-key">Address <small>· private</small></span><span>${escape(a.address)}</span></p>` : ''}${mapAddress && mapAddress !== place.address ? `<p class="view-place"><span class="view-key">Map address <small>· private</small></span><span>${escape(mapAddress)}</span></p>` : ''}${outside}${links.length ? `<p class="map-links">${links.map(l => `<a class="map-link" href="${escape(l.url)}" target="_blank" rel="noopener noreferrer">${escape(l.label)} ↗<span class="sr-only"> map for ${escape(place.name)}</span></a>`).join('')}</p>` : ''}${meet || placeLine || (!guest && a.address) ? '' : `<p class="view-place"><span class="view-key">${guest ? 'Meet' : 'Place'}</span><span>${guest ? 'Meeting point to confirm' : 'Location to confirm'}</span></p>`}`;
    const who = `<span class="people"><span class="sr-only">For </span>${a.optional ? '<span class="optional-chip">Optional</span>' : ''}${(a.participants || []).map(id => { const f = participantRecord(trip, id); return f ? `<span class="person ${escape(f.color)}">${escape(f.name)}</span>` : guest ? '<span class="person">Some travelers</span>' : ''; }).join('')}</span>`;
    const privateLinks = !guest && (a.links || []).length ? `<ul class="link-list">${a.links.map(l => `<li><a href="${escape(l.url)}" target="_blank" rel="noopener noreferrer">${escape(l.label || l.url)} ↗</a></li>`).join('')}</ul>` : '';
    const text = value => value ? `<p class="view-notes">${escape(value)}</p>` : '';
    const body = `${section(guest ? 'Notes' : 'Description <small>· shown to guests</small>', text(description))}${guest ? '' : section('Planning notes <small>· private</small>', text(a.notes))}${section('Links <small>· private</small>', privateLinks)}${description || (!guest && a.notes) ? '' : '<p class="view-empty">No notes yet.</p>'}`;
    return `<div class="sheet-grip" aria-hidden="true"></div><div class="view-head"><div class="view-labels">${labels}${who}</div><button type="button" class="icon-button" data-close="${VIEW_ID}" aria-label="Close activity">×</button></div><h2 id="activity-view-title" tabindex="-1">${escape(a.title)}</h2><p class="view-when">${when}${firm}</p><div class="view-where">${where}</div><div class="view-body" tabindex="0" role="group" aria-label="Activity details">${picture}${body}${guest ? '' : '<p class="last-edit" id="view-last-edit" hidden></p>'}</div><div class="dialog-actions"><button type="button" class="secondary" data-close="${VIEW_ID}">Close</button>${canEdit ? `<button type="button" class="primary" data-edit-activity="${escape(a.id)}">Edit</button>` : ''}</div>`;
}

/** Fill and show the view. Focus goes to the title, so a screen reader starts with what was opened. */
export function showActivityView(document, a, trip, options = {}) {
    const dialog = document.getElementById(VIEW_ID);
    if (!dialog || !a)
        return null;
    dialog.innerHTML = activityViewHtml(a, trip, options);
    dialog.dataset.activity = a.id;
    dialog.style.transform = '';
    if (!dialog.open)
        dialog.showModal();
    dialog.querySelector('.view-body').scrollTop = 0;
    dialog.querySelector('h2').focus({ preventScroll: true });
    return dialog;
}

/** Put focus back on the card the view was opened from, wherever a redraw has put it since. */
export function focusCard(document, id, within = '') {
    const card = id && document.querySelector(`${within} .activity[data-detail="${globalThis.CSS?.escape ? CSS.escape(id) : id}"]`.trim());
    (card || document.querySelector('#itinerary'))?.focus({ preventScroll: true });
    return card || null;
}

export const SWIPE_CLOSE = 90;
/** A downward pull closes the sheet once it has travelled far enough; anything else springs back. */
export const swipeCloses = (dy, dx = 0) => dy >= SWIPE_CLOSE && dy > Math.abs(dx) * 1.5;

/**
 * Dismissal that a native dialog does not give: a tap on the backdrop, and on phones a swipe down.
 * Escape and the Close buttons are native or handled by the page. Listens on the document, so it
 * survives the page redrawing its markup. `sheet()` says whether the view is laid out as a bottom sheet.
 */
export function enableViewDismiss({ document, sheet = () => false, onClose }) {
    const view = target => { const d = target?.closest?.(`#${VIEW_ID}`); return d?.open ? d : null; };
    const close = d => { d.style.transform = ''; d.close(); onClose?.(); };
    document.addEventListener('click', e => {
        // A click on the backdrop is reported on the dialog itself, outside its box.
        if (e.target?.id !== VIEW_ID || !e.target.open)
            return;
        const r = e.target.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
            close(e.target);
    });
    let pull = null;
    document.addEventListener('touchstart', e => {
        const d = view(e.target);
        pull = null;
        if (!d || !sheet() || e.touches.length !== 1)
            return;
        // Inside the notes, a pull only counts when they are already scrolled to the top.
        const scroller = e.target.closest('.view-body');
        if (scroller && scroller.scrollTop > 0)
            return;
        pull = { d, x: e.touches[0].clientX, y: e.touches[0].clientY, dy: 0, dx: 0 };
    }, { passive: true });
    document.addEventListener('touchmove', e => {
        if (!pull)
            return;
        pull.dy = e.touches[0].clientY - pull.y;
        pull.dx = e.touches[0].clientX - pull.x;
        if (pull.dy < 0)
            return void (pull.d.style.transform = '');
        pull.d.style.transform = `translateY(${Math.round(pull.dy)}px)`;
    }, { passive: true });
    const end = cancelled => {
        const p = pull;
        pull = null;
        if (!p)
            return;
        if (!cancelled && swipeCloses(p.dy, p.dx))
            close(p.d);
        else
            p.d.style.transform = '';
    };
    document.addEventListener('touchend', () => end(false));
    document.addEventListener('touchcancel', () => end(true));
}
