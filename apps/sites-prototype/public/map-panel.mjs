// The Map panel's markup, shared by the signed-in planner and the read-only guest page.
// Pure: strings in, strings out. The guest page passes the guest projection, which holds place
// names only, so a guest map is always drawn in plan order and carries no address, coordinates or link.
import { escape } from './board.mjs';
import { participantRecord } from './participants.mjs';
import { tripMap, dayMap, mapSvg, mapCaption, routeText, placeLinks, activityLinks, describeLocation, dayEmbed, embedUrl } from './maps.mjs';

/** One labelled row of outside links. Reviewed links are solid; searches and directions are dashed and say what they are. */
export function linkRow(group, name) {
    if (!group?.links?.length)
        return '';
    return `<span class="map-links map-search"><span class="map-search-label">${escape(group.label)}</span>${group.links.map(l => `<a class="map-link search" href="${escape(l.url)}" target="_blank" rel="noopener noreferrer">${escape(l.label)} ↗<span class="sr-only"> ${group.kind === 'directions' ? 'directions to' : 'search for'} ${escape(name)}, not a checked link</span></a>`).join('')}</span>`;
}
const reviewedRow = (links, name) => links.map(l => `<a class="map-link" href="${escape(l.url)}" target="_blank" rel="noopener noreferrer">${escape(l.label)} ↗<span class="sr-only"> for ${escape(name)}, reviewed link</span></a>`).join('');

/** Everything under a place's name in the list: local name, address, saved location, and its links. */
export function placeDetails(p, { guest = false, canEdit = false, directions = false } = {}) {
    const local = p.localName ? `<span lang="zh-Hans" class="map-local">${escape(p.localName)}</span>` : '';
    if (guest)
        return local;
    const l = describeLocation(p), links = placeLinks(p);
    const where = l.kind === 'coordinates' ? `${escape(l.text)} · ${escape(l.note)}${p.coordSource ? ` · source: ${escape(p.coordSource)}` : ''}` : l.kind === 'address' ? `Map address: ${escape(l.text)} · not positioned on the drawing` : 'No location for the map yet';
    return `${local}${p.address || p.localAddress ? `<small>${escape(p.address)}${p.address && p.localAddress ? ' · ' : ''}<span lang="zh-Hans">${escape(p.localAddress)}</span></small>` : ''}<small>${where}</small>${linkRow(links.search, p.name)}${directions ? linkRow(links.directions, p.name) : ''}<span class="map-links">${reviewedRow(links.reviewed, p.name) || '<small>No reviewed map link yet</small>'}${canEdit ? `<button type="button" class="text-button" data-place-edit="${escape(p.id)}" aria-label="Edit place ${escape(p.name)}">Edit place</button>` : ''}</span>`;
}

/**
 * The body of the Map panel for one view. `view` is "day" or "trip". `dayName` formats a date.
 * If the drawing cannot be made, the numbered list and its links are still shown, with a sentence saying so.
 * `embedKey` turns on Google Maps for the day; `mapStyle` "schematic" and `embedFailed` put the schematic back.
 */
export function mapBodyHtml(trip, { view = 'day', filter = 'all', day, compact = false, guest = false, canEdit = false, dayName = d => d, draw = mapSvg, embedKey = '', mapStyle = 'google', embedFailed = false } = {}) {
    const whole = view === 'trip', who = filter === 'all' ? 'everyone' : (participantRecord(trip, filter)?.name || 'the selected travelers');
    const model = whole ? tripMap(trip, { filter, compact }) : dayMap(trip, { filter, day, compact });
    const title = whole ? `Whole trip for ${who}: ${model.nodes.length} place${model.nodes.length === 1 ? '' : 's'}` : `${dayName(day)} for ${who}: ${model.stops.length} stop${model.stops.length === 1 ? '' : 's'}`;
    const empty = whole ? guest ? 'No stays are shared on this guest link, so there is no whole-trip map. Choose “This day” to see the day’s stops.' : 'No stays or journeys for this selection yet. Add them under “Places, stays & journeys”.' : `Nothing with a place on ${dayName(day)} for this selection.`;
    const details = p => placeDetails(p, { guest, canEdit, directions: !whole });
    const list = whole
        ? model.nodes.map(n => `<li id="map-stop-${n.n}" tabindex="-1"><span class="map-stop" aria-hidden="true">${n.n}</span><div><strong>${escape(n.name)}</strong>${n.detail ? `<small>Staying ${escape(n.detail)}</small>` : ''}${details(n.place)}</div></li>`).join('')
        : model.stops.map(s => `<li id="map-stop-${s.n}" tabindex="-1"><span class="map-stop" aria-hidden="true">${s.n}</span><div><strong>${escape(s.name)}</strong><span class="map-acts">${s.activities.map(a => `<button type="button" class="text-button map-activity" data-detail="${escape(a.id)}">${escape(a.time || 'Time to confirm')} · ${escape(a.title)}</button>`).join('')}</span>${details(s.place)}</div></li>`).join('');
    // Plans with no place are never dropped: each can be opened, and one with its own address still gets map links.
    const loose = !whole && model.unplaced.length ? `<div class="map-unplaced"><p><strong>Location to confirm (${model.unplaced.length}).</strong> ${guest ? 'These are in the day’s plan; where they happen is not set yet.' : 'These are in the day’s plan but cannot be drawn until they have a place. Open one and choose Edit to give it a place.'}</p><ul class="map-unplaced-list">${model.unplaced.map(a => { const links = activityLinks(a, { guest }); return `<li><button type="button" class="text-button map-activity" data-detail="${escape(a.id)}">${escape(a.time || 'Time to confirm')} · ${escape(a.title)}</button>${links.search ? `<small>${escape(a.address)}</small>${linkRow(links.search, a.title)}${linkRow(links.directions, a.title)}` : ''}</li>`; }).join('')}</ul></div>` : whole && model.missing ? `<p class="map-unplaced">${model.missing} stay${model.missing === 1 ? '' : 's'} or journey${model.missing === 1 ? '' : 's'} for this selection ${model.missing === 1 ? 'has' : 'have'} a place still to confirm and ${model.missing === 1 ? 'is' : 'are'} not drawn.</p>` : '';
    let drawing = '';
    if (model.nodes.length > 1) {
        try {
            drawing = `${draw(model, `${title}. ${mapCaption(model)}`, { scale: compact ? 1.7 : 1, anchors: true })}<p class="map-caption">${escape(mapCaption(model))}${model.reason && !guest ? ` ${escape(model.reason)}` : ''}</p>`;
        }
        catch {
            drawing = `<p class="map-caption map-failed" role="status">The drawing could not be shown on this device. The ${whole ? 'places' : 'stops'} and their links are listed below in order.</p>`;
        }
    }
    else if (model.nodes.length)
        drawing = `<p class="map-caption map-nothing">Nothing to draw yet: a map needs at least two places${whole ? '' : ' on this day'}.${guest ? '' : ' A place is positioned from its coordinates. A typed address is used for map-app searches, not for the drawing. Use Edit place to add either.'}</p>`;
    // Google Maps for the day, when the organizer has configured a key and every stop has something Google
    // can place. Never for the whole trip. The guest page is given a key, and its stops a location, only when
    // the organizer switched the Google map on for the guest link; otherwise it has neither and draws the schematic. The frame has no
    // address until the page gives it one as it scrolls into view, so nothing is sent before then.
    const embed = !whole && embedKey ? dayEmbed(model) : null, url = embed?.ok ? embedUrl(embed, embedKey) : '';
    if (url && mapStyle !== 'schematic' && !embedFailed) {
        drawing = `<div class="map-google" id="map-google"><iframe class="map-frame" id="map-frame" title="${escape(`Google Maps: ${title}`)}" data-src="${escape(url)}" referrerpolicy="strict-origin" allowfullscreen></iframe><p class="map-caption">Google Maps, ${embed.mode === 'place' ? 'this stop' : `directions through the ${embed.count} stops in itinerary order`}. The stops’ addresses or coordinates are sent to Google to show it. ${embed.mode === 'place' ? '' : 'The route and times are Google’s suggestion, not part of the plan. '}It does not load in mainland China. <button type="button" class="text-button" data-map-style="schematic">Show the schematic instead</button></p></div>`;
    }
    else if (url)
        drawing += `<p class="map-caption map-switch">${embedFailed ? '<span role="status">Google Maps did not load, so this is the schematic.</span> ' : ''}<button type="button" class="text-button" data-map-style="google">${embedFailed ? 'Try Google Maps again' : 'Show this day on Google Maps'}</button></p>`;
    else if (embed && embed.reason && model.nodes.length)
        drawing += `<p class="map-caption map-switch">${escape(guest ? embed.reason.replace(/ Add one under Edit place\.$/, '') : embed.reason)}</p>`;
    const route = routeText(model);
    return `<p class="map-title" id="map-view-title">${escape(title)}</p>${model.nodes.length ? `${drawing}${route ? `<p class="map-route">${escape(route)}</p>` : ''}<ol class="map-list" aria-label="${whole ? 'Places in plan order' : 'Stops in itinerary order'}">${list}</ol>` : `<p class="empty-lane">${escape(empty)}</p>`}${loose}`;
}

/** The whole panel: heading, the two view buttons, and the body. */
export function mapSectionHtml(trip, options = {}) {
    const view = options.view === 'trip' ? 'trip' : 'day';
    const tab = (v, label) => `<button type="button" class="secondary" data-map-view="${v}" aria-pressed="${view === v}">${label}</button>`;
    return `<section class="maps" id="maps" aria-labelledby="maps-title"><div class="maps-head"><h2 id="maps-title">Map</h2><div class="map-tabs" role="group" aria-label="Map view">${tab('day', 'This day')}${tab('trip', 'Whole trip')}</div></div><div id="maps-body">${mapBodyHtml(trip, { ...options, view })}</div></section>`;
}

/** A tap on a marker moves to its entry in the list and puts keyboard focus there. Returns true when handled. */
export function followPin(document, event) {
    const pin = event.target.closest?.('a.map-pin');
    if (!pin)
        return false;
    event.preventDefault();
    const entry = document.getElementById((pin.getAttribute('href') || '').slice(1));
    entry?.scrollIntoView({ block: 'nearest' });
    entry?.focus({ preventScroll: true });
    return true;
}

const GOOGLE_PROBE = 'https://www.google.com/maps/embed/v1/place', GOOGLE_PROBE_MS = 6000, EMBED_WAIT_MS = 12000;
let embedTimer = 0, embedWatch = null;
/**
 * Give the Google frame its address only when it scrolls into view, and call `onFail` when Google cannot
 * be reached (offline, blocked, or unreachable as in mainland China) so the page can draw the schematic.
 * A frame reports "loaded" even when it only shows a network error, so reachability is asked first with a
 * request that carries no key, no location, no cookie and no referrer. An error that Google draws inside
 * its own frame (a wrong or restricted key) cannot be seen from here; "Show the schematic instead" covers
 * that. Used by the planner and the guest page; call it after each redraw of the Map panel.
 */
export function watchEmbed(document, onFail) {
    clearTimeout(embedTimer);
    embedWatch?.disconnect();
    embedWatch = null;
    const frame = document.querySelector('#map-frame');
    if (!frame?.dataset?.src || frame.src)
        return;
    const fail = () => { clearTimeout(embedTimer); if (frame.isConnected) onFail(); };
    const start = async () => {
        embedWatch?.disconnect();
        embedWatch = null;
        const control = new AbortController(), probe = setTimeout(() => control.abort(), GOOGLE_PROBE_MS);
        try {
            await fetch(GOOGLE_PROBE, { mode: 'no-cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: control.signal });
        }
        catch {
            return fail();
        }
        finally {
            clearTimeout(probe);
        }
        if (!frame.isConnected)
            return;
        embedTimer = setTimeout(fail, EMBED_WAIT_MS);
        frame.addEventListener('load', () => clearTimeout(embedTimer), { once: true });
        frame.src = frame.dataset.src;
    };
    if (!('IntersectionObserver' in globalThis))
        return start();
    embedWatch = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) start(); }, { rootMargin: '50px' });
    embedWatch.observe(frame);
}
