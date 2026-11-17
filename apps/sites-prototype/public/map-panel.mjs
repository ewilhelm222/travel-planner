// The Map panel's markup, shared by the signed-in planner and the read-only guest page.
// Pure: strings in, strings out. The guest page passes the guest projection, which holds place
// names only, so a guest map is always drawn in plan order and carries no address, coordinates or link.
import { escape } from './board.mjs';
import { participantRecord } from './participants.mjs';
import { tripMap, dayMap, mapSvg, mapCaption, routeText, placeLinks, activityLinks, describeLocation } from './maps.mjs';

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
 */
export function mapBodyHtml(trip, { view = 'day', filter = 'all', day, compact = false, guest = false, canEdit = false, dayName = d => d, draw = mapSvg } = {}) {
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
