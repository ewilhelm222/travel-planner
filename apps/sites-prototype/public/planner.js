(async () => {
    'use strict';
    const { escape, dateLabel, days, preferredDay, board, dayChooser, isExample, ideaCards, timingOf, TIMINGS, TIMING_LABELS, PHONE_QUERY, dayInView, pressDay, fitColumns, areaId, orderedPlaces, swipeStep } = await import('/board.mjs');
    const { usefulFilterChoices, matchesSelection, defaultParticipants, includesPerson, peopleOf, isWholeTripGroup, participantRecord, participantReferences, referenceSummary } = await import('/participants.mjs');
    const { fieldChanges, lastEditHtml, lastEditText, recentlyEdited, historyHref } = await import('/history.mjs');
    const { baseFor, recordKey } = await import('/revisions.mjs');
    const { previewStayMove, daysBetween } = await import('/stay-move.mjs');
    const { appleSearchUrl, COORD_SYSTEMS, COORD_LABELS, parseLocation, locationInput, describeLocation } = await import('/maps.mjs');
    const { mapBodyHtml, mapSectionHtml, followPin } = await import('/map-panel.mjs');
    const { isSnapshot, restoreFromSnapshot } = await import('/backup.mjs');
    const { placeReferences, placeReferenceSummary, parseLinks, formatLinks, LEG_MODES, parseImageDataUrl, imageUrl } = await import('/structure.mjs');
    const { responsePolicy } = await import('/reading-copy.mjs');
    const { buildOfflineHtml } = await import('/offline-export.mjs');
    const { moveActivity, stepTarget } = await import('/move.mjs');
    const { enableDrag } = await import('/drag.mjs');
    const { VIEW_ID, viewDialog, showActivityView, focusCard, enableViewDismiss } = await import('/activity-view.mjs');
    const { applyWeather, weatherNote, unitsFor } = await import('/weather.mjs');
    const KEY = 'waypoint-library-v2', OLD_KEY = 'waypoint-downloaded-trip-v1';
    const app = document.querySelector('#app');
    const state = { user: null, snapshot: null, library: [], archived: [], copies: {}, canCreate: false, isOwner: false, selected: new URLSearchParams(location.search).get('trip'), filter: 'all', day: null, compact: true, online: navigator.onLine, busy: false, message: '', downloadedAt: null, offlineReady: false, needsSignIn: false };
    const $ = s => document.querySelector(s);
    const writable = () => state.online && !state.needsSignIn && !state.busy;
    // Each save names the records it relies on and the revision they had when the form opened.
    // Only a change to one of those records is a conflict; other people's edits elsewhere are not.
    const base = (...keys) => baseFor(state.snapshot?.revisions || {}, ...keys);
    const baseAttr = (...keys) => escape(JSON.stringify(base(...keys)));
    const formBase = form => JSON.parse(form.dataset.base || '{}');
    function restore() {
        try {
            let saved = JSON.parse(localStorage.getItem(KEY));
            if (!saved) {
                const old = JSON.parse(localStorage.getItem(OLD_KEY));
                if (old?.user?.id && old?.snapshot?.trip) {
                    const t = old.snapshot.trip;
                    t.start = t.stays[0]?.start;
                    t.end = t.stays.at(-1)?.end;
                    t.places = t.stays.map(s => ({ id: s.id, name: s.name }));
                    t.activities = t.activities.map(a => ({ ...a, placeId: a.stayId, guestNotes: "", guestLocation: "" }));
                    saved = { user: old.user, selected: t.id, library: [{ id: t.id, title: t.title }], copies: { [t.id]: old } };
                }
            }
            if (saved?.user?.id) {
                Object.assign(state, saved);
                // Each visit opens on today while the trip is under way, otherwise on its first day.
                state.day = null;
                const selected = new URLSearchParams(location.search).get('trip');
                if (selected)
                    state.selected = selected;
                const copy = state.copies[state.selected];
                if (copy)
                    Object.assign(state, copy);
                else {
                    state.snapshot = null;
                    state.downloadedAt = null;
                }
            }
        }
        catch { }
    }
    function persist() {
        try {
            localStorage.setItem(KEY, JSON.stringify({ user: state.user, library: state.library, copies: state.copies, selected: state.selected, filter: state.filter, day: state.day, compactChoice: state.compactChoice, denseChoice: state.denseChoice, mapView: state.mapView, hideExamples: state.hideExamples, ideasClosed: state.ideasClosed, moreOpen: state.moreOpen, allDays: state.allDays }));
        }
        catch { }
    }
    function remember() {
        state.downloadedAt = new Date().toISOString();
        state.copies[state.selected] = { snapshot: state.snapshot, downloadedAt: state.downloadedAt, isOwner: state.isOwner };
        try {
            localStorage.setItem(KEY, JSON.stringify({ user: state.user, library: state.library, copies: state.copies, selected: state.selected, filter: state.filter, day: state.day, compactChoice: state.compactChoice, denseChoice: state.denseChoice, mapView: state.mapView, hideExamples: state.hideExamples, ideasClosed: state.ideasClosed, moreOpen: state.moreOpen, allDays: state.allDays }));
        }
        catch {
            state.message = 'This browser could not keep a reading copy. Save an offline HTML file.';
        }
    }
    async function clearDownloaded() {
        localStorage.removeItem(KEY);
        localStorage.removeItem(OLD_KEY);
        if ('caches' in window)
            await Promise.all((await caches.keys()).filter(k => k.startsWith('waypoint-')).map(k => caches.delete(k)));
        if ('serviceWorker' in navigator)
            await Promise.all((await navigator.serviceWorker.getRegistrations()).map(r => r.unregister()));
        state.snapshot = null;
        state.copies = {};
        state.library = [];
        state.user = null;
    }
    async function request(path, method = 'GET', body) {
        const control = new AbortController(), timer = setTimeout(() => control.abort(), 12000);
        try {
            const r = await fetch(path, { method, cache: 'no-store', credentials: 'same-origin', signal: control.signal, ...(body ? { headers: { 'Content-Type': 'application/json', 'X-Waypoint-Participant-Model': 'people-v1' }, body: JSON.stringify(body) } : {}) });
            const policy = responsePolicy(r.status, r.headers.get('Content-Type') || '');
            if (policy) {
                if (policy.clearCopy)
                    await clearDownloaded();
                state.needsSignIn = policy.needsSignIn;
                state.online = false;
                throw Object.assign(new Error(policy.message), { status: r.status === 403 ? 403 : 401 });
            }
            const data = await r.json();
            if (!r.ok)
                throw Object.assign(new Error(data.error || 'Request failed.'), { status: r.status });
            return data;
        }
        finally {
            clearTimeout(timer);
        }
    }
    const endpoint = path => `${path}?id=${encodeURIComponent(state.selected)}`;
    async function readiness() {
        try {
            const cache = await caches.open('waypoint-shell-v45');
            state.offlineReady = (await Promise.all(['/offline.html', '/planner.js', '/planner.css', '/reading-copy.mjs', '/offline-export.mjs', '/board.mjs', '/participants.mjs', '/move.mjs', '/drag.mjs', '/activity-view.mjs', '/history.mjs', '/backup.mjs', '/structure.mjs', '/revisions.mjs', '/stay-move.mjs', '/maps.mjs', '/weather.mjs'].map(p => cache.match(p, { ignoreVary: true })))).every(Boolean);
            status();
        }
        catch { }
    }
    async function shell() {
        if (!('serviceWorker' in navigator))
            return;
        try {
            await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
            await readiness();
        }
        catch { }
    }
    async function load() {
        state.busy = true;
        status();
        try {
            const library = await request('/api/trips');
            if (state.user && state.user.id !== library.user.id) {
                await clearDownloaded();
                state.selected = null;
            }
            state.user = library.user;
            state.library = library.trips;
            state.archived = library.archived || [];
            state.canCreate = library.canCreate;
            state.selected = state.library.some(t => t.id === state.selected) ? state.selected : state.library[0]?.id;
            state.online = true;
            state.needsSignIn = false;
            state.message = '';
            if (state.selected) {
                const result = await request(endpoint('/api/trip'));
                state.snapshot = result.snapshot;
                state.isOwner = result.isOwner;
                state.day = preferredDay(state.snapshot.trip, state.day);
                remember();
            }
            else
                state.snapshot = null;
            render();
            shell();
        }
        catch (e) {
            state.online = false;
            state.message = e.message;
            render();
        }
        finally {
            state.busy = false;
            status();
        }
    }
    function status() {
        if (!$('#status'))
            return;
        $('#status').className = !state.online || state.needsSignIn ? 'reading-copy' : '';
        $('#status').innerHTML = `<span>${state.busy ? 'Updating…' : state.needsSignIn ? 'Sign-in expired · reading only' : state.online ? 'Connected' : 'Offline · reading copy'}</span><span>${state.snapshot ? `Revision ${state.snapshot.revision} · ` : ''}${state.downloadedAt ? `Downloaded ${escape(new Date(state.downloadedAt).toLocaleString())}` : state.snapshot ? 'No downloaded itinerary yet' : ''}${state.offlineReady ? ' · Ready to read offline' : ''}</span>`;
        if ($('#state-flag'))
            $('#state-flag').textContent = state.needsSignIn ? 'Sign-in expired · reading only' : !state.online ? 'Offline · reading copy' : '';
        // Who is editing, or why editing is paused. The address is shown because several people may share one sign-in.
        if ($('#edit-state')) {
            const who = state.user ? state.user.email || state.user.name : '', paused = state.needsSignIn ? 'Sign-in expired · reading only' : !state.online ? 'Offline · reading copy' : '';
            $('#edit-state').textContent = !state.user ? '' : paused ? (phone() ? '' : paused) : `● ${state.snapshot ? 'Editing' : 'Signed in'} as ${who}`;
        }
        $('#message').textContent = state.message;
        for (const id of ['new-trip', 'add', 'structure', 'settings', 'history', 'archived-open', 'trip-delete', 'share', 'editors', 'editor-add', 'travelers', 'roster-save', 'family-save', 'import', 'paste-import', 'example', 'recover']) {
            const control = $('#' + id);
            if (control)
                control.disabled = !writable();
        }
        if ($('#refresh'))
            $('#refresh').disabled = state.busy || !navigator.onLine;
        const canMove = writable() && !!state.snapshot;
        for (const el of [$('#itinerary'), $('.idea-cards')]) el?.classList?.toggle('can-drag', canMove);
        if ($('#drag-hint')) $('#drag-hint').textContent = canMove ? (phone() ? 'To move a plan: press and hold its card until it lifts, then slide it onto a day in the panel that appears at the bottom.' : 'Drag a card to another day, between cards to reorder, or onto ideas to unschedule. Keyboard: focus a card, then Shift + arrow keys.') : '';
    }
    // No trip to show. A signed-in account that is not on any trip is told so, with the exact
    // address the organizer has to add, instead of being asked to sign in again.
    function welcome() {
        if (state.user && !state.canCreate)
            return `<section class="welcome" id="itinerary" tabindex="-1"><h2>You are signed in, but not on a trip yet.</h2><p>You are signed in as <strong class="account-email">${escape(state.user.email || state.user.name)}</strong>.</p><p>Nothing is wrong with your sign-in. The organizer needs to add exactly this address under Editors. When they say it is done, choose Check again.</p><button class="primary" id="check-again">Check again</button><button class="secondary" data-sign-out="1">Use a different account</button></section>`;
        return `<section class="welcome" id="itinerary" tabindex="-1"><h2>Start with something to explore.</h2><p>Keep separate trips and gatherings here. Each has its own activities, saved revision, and optional guest link.</p>${state.canCreate ? '<button class="primary" id="example">Add a synthetic gathering example</button><button class="secondary" id="recover">Recover the Japan prototype</button>' : '<p>Sign in with an organizer or invited editor account to plan.</p>'}</section>`;
    }
    // Wide screens: everything except Add, the filter and the view switch lives in one menu, so the
    // schedule is not pushed down by a wall of buttons. The buttons keep their ids and behaviour.
    function manageMenu(t, off) {
        const group = (title, buttons) => buttons ? `<div class="manage-menu-group"><h3>${title}</h3><div class="tools">${buttons}</div></div>` : '';
        return `<details class="manage-menu" id="manage-menu"><summary class="secondary">Manage<span aria-hidden="true"> ▾</span></summary><div class="manage-pop">${t ? group('This plan', `<button class="secondary" id="travelers" ${off}>Manage travelers</button><button class="secondary" id="structure" ${off}>Places, stays &amp; journeys</button>${state.isOwner ? `<button class="secondary" id="settings" ${off}>Trip details</button>` : ''}<button class="secondary" id="history" ${off}>History</button>${state.isOwner ? `<button class="secondary" id="share" ${off}>Guest link</button><button class="secondary" id="editors" ${off}>Editors</button>` : ''}`) + group('Copies &amp; updates', '<button class="secondary" id="offline-file">Save offline trip</button><button class="secondary" id="export">Download JSON</button><button class="secondary" id="refresh">Refresh</button>') : ''}${group('Trips &amp; events', (state.canCreate ? `<button class="secondary" id="new-trip" ${off}>New trip or event</button><button class="secondary" id="paste-import" ${off}>Paste JSON</button><label class="secondary file-label">Import JSON<input id="import" type="file" accept="application/json,.json" ${off}></label>` : '') + archivedButton(off, false))}</div></details>`;
    }
    function render() {
        const t = state.snapshot?.trip;
        const dates = t ? days(t) : [];
        if (t)
            state.day = preferredDay(t, state.day);
        // The poster is collapsed once a trip has activities, so the schedule is on the first screen;
        // trips longer than four days start in the denser week view. Either can be switched, and the choice is remembered.
        state.compact = typeof state.compactChoice === 'boolean' ? state.compactChoice : !!t?.activities.length;
        state.dense = !!t && (typeof state.denseChoice === 'boolean' ? state.denseChoice : dates.length > 4);
        const phoneLayout = phone();
        state.layout = phoneLayout;
        // Only filter choices that change what is shown are offered; with none, the filter is left out.
        const choices = t ? usefulFilterChoices(t) : [];
        if (state.filter !== 'all' && !choices.some(f => f.id === state.filter))
            state.filter = 'all';
        const filterSelect = choices.length ? `<select id="family"><option value="all">Everyone</option>${choices.map(f => `<option value="${escape(f.id)}" ${state.filter === f.id ? 'selected' : ''}>${escape(f.name)}</option>`).join('')}</select>` : '';
        const examples = t ? t.activities.filter(isExample).length : 0;
        const examplesToggle = examples ? `<label class="check-label examples-toggle"><input type="checkbox" id="hide-examples" ${state.hideExamples ? 'checked' : ''}> Hide examples (${examples} ${examples === 1 ? 'item is' : 'items are'} marked “not a real plan”)</label>` : '';
        const off = !writable() ? 'disabled' : '';
        const roleNote = t && !state.isOwner ? '<p class="role-note">You are an editor of this trip. You can add, change, move and delete activities (including what guests see about them), and update travelers, places, stays and journeys. The organizer manages the trip’s name and dates, the guest link, and who can edit.</p>' : '';
        // Phone: the schedule comes first; everything for editing and managing follows it.
        const phonePage = () => `<a class="skip-link" href="#itinerary">Skip to itinerary</a><header class="topbar slim" id="top"><a class="brand" href="/">Waypoint<span class="brand-dot">↗</span></a>${state.needsSignIn ? '<a class="sign-in-link" href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in to update</a>' : !state.user ? '<a class="sign-in-link" href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in</a>' : ''}<a class="jump-link" href="#manage">Plan &amp; manage ↓</a></header><main class="compact schedule-first${state.allDays ? ' all-days' : ''}">
<h1 class="sr-only">${escape(t?.title || 'Waypoint trips and events')}</h1><div id="state-flag" role="status"></div><p class="edit-state" id="edit-state" role="status"></p>
<section class="trip-bar" aria-label="Trip and traveler selection"><label>Trip<select id="trip-select" ${!state.library.length ? 'disabled' : ''}>${state.library.map(x => `<option value="${escape(x.id)}" ${x.id === state.selected ? 'selected' : ''}>${escape(x.title)}</option>`).join('')}</select></label>${filterSelect ? `<label>Show plans for${filterSelect}</label>` : ''}</section>
<div id="message" role="alert"></div>
${t ? `${rail(t, state.day)}<div id="itinerary" tabindex="-1" class="date-board">${board(t, { filter: state.filter, day: state.day, compact: state.compact, hideExamples: state.hideExamples })}</div>${weatherNote()}${ideasSection(t)}${mapsSection(t)}` : welcome()}
<section class="manage" id="manage" aria-labelledby="manage-title"><h2 id="manage-title">Plan &amp; manage</h2>${t ? `<p class="manage-trip">${escape(t.title)} · ${escape(t.start)} – ${escape(t.end)} · ${escape(t.timezone)}</p>
<div class="manage-group"><h3>This plan</h3><div class="tools"><button class="primary wide" id="add" ${off}>Add activity</button><button class="secondary" id="travelers" ${off}>Manage travelers</button><button class="secondary" id="structure" ${off}>Places, stays &amp; journeys</button>${state.isOwner ? `<button class="secondary" id="settings" ${off}>Trip details</button>` : ''}<button class="secondary" id="history" ${off}>History</button>${state.isOwner ? `<button class="secondary" id="share" ${off}>Guest link</button><button class="secondary" id="editors" ${off}>Editors</button>` : ''}</div>${roleNote}<p id="drag-hint" class="drag-hint"></p><p id="filter-status" role="status" aria-live="polite">${state.filter === 'all' ? 'Everyone · shared plans appear once' : 'Selected group · all shared attendee labels remain visible'}</p>${examplesToggle}</div>
<div class="manage-group"><h3>Copies &amp; updates</h3><div class="tools"><button class="secondary" id="offline-file">Save offline trip</button><button class="secondary" id="export">Download JSON</button><button class="secondary wide" id="refresh">Refresh</button></div><div id="status" role="status" aria-live="polite"></div></div>` : '<div id="status" role="status" aria-live="polite"></div>'}
${state.canCreate ? `<div class="manage-group"><h3>Trips &amp; events</h3><div class="tools"><button class="secondary wide" id="new-trip" ${off}>New trip or event</button><button class="secondary" id="paste-import" ${off}>Paste JSON</button><label class="secondary file-label">Import JSON<input id="import" type="file" accept="application/json,.json" ${off}></label></div></div>` : ''}${archivedButton(off, true)}
<div class="manage-group"><h3>Account</h3><p class="manage-account">${state.user ? `<span class="account-name">${escape(state.user.name)}</span><span class="private-label">● Private planning</span><button class="text-button" id="sign-out">Sign out</button>` : '<a href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in</a>'}</p></div>
<a class="jump-link back-top" href="#top">↑ Back to the schedule</a></section>
<footer><span>Waypoint <span class="title-dot">×</span> Make plans. Take detours.</span><span>Guest links are optional and read-only.</span></footer></main>
`;
        app.innerHTML = `${phoneLayout ? phonePage() : `<a class="skip-link" href="#itinerary">Skip to itinerary</a><header class="topbar"><a class="brand" href="/">Waypoint<span class="brand-dot">↗</span></a><span class="private-label edit-state" id="edit-state" role="status"></span><div class="account">${state.user ? `<span class="account-name">${escape(state.user.name)}</span><button class="text-button" id="sign-out">Sign out</button>` : '<a href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in</a>'}${state.needsSignIn ? '<a href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in to update</a>' : ''}</div></header><main class="${state.compact ? 'compact' : ''} ${state.dense ? 'dense' : ''}">
<section class="library-bar"><label>Trips & events<select id="trip-select" ${!state.library.length ? 'disabled' : ''}>${state.library.map(x => `<option value="${escape(x.id)}" ${x.id === state.selected ? 'selected' : ''}>${escape(x.title)}</option>`).join('')}</select></label>${t ? '' : manageMenu(t, off)}</section>
<header class="trip-header"><div><button class="story-toggle" id="story-toggle">${state.compact ? "Open the poster" : "Focus on the plan"}</button><span class="eyebrow">${t?.kind === 'event' ? 'TIME TOGETHER' : 'Lose each other all day. Find each other at night.'}</span><h1>${escape(t?.title || 'A plan for every gathering')}<span class="title-dot">.</span></h1><p class="trip-subtitle">${escape(t?.subtitle || 'Choose a trip, bring an idea, and leave a little room to wander.')}</p>${t ? `<div class="trip-facts"><span>${escape(t.start)} – ${escape(t.end)}</span><span>${escape(t.timezone)}</span><span>${t.families.length} ${t.families.length === 1 ? "group" : "groups"}</span></div>` : ''}</div><aside class="story-art" aria-label="Decorative crossing routes"><svg viewBox="0 0 520 420" aria-hidden="true"><circle cx="268" cy="214" r="150" fill="none" stroke="#6b3df5" stroke-width="1.5"/><circle cx="268" cy="214" r="196" fill="none" stroke="#6b3df5" stroke-width="1.5" stroke-dasharray="3 12"/><path d="M40 330 C120 300 150 180 268 214 S420 150 480 60" fill="none" stroke="#3ee6c9" stroke-width="22" stroke-linecap="round"/><path d="M60 70 C150 90 170 240 268 214 S400 330 470 360" fill="none" stroke="#cdb8ff" stroke-width="22" stroke-linecap="round"/><circle cx="268" cy="214" r="30" fill="#ff3d9a"/><circle cx="268" cy="214" r="11" fill="#2d1480"/><circle cx="40" cy="330" r="14" fill="#2d1480" stroke="#3ee6c9" stroke-width="6"/><circle cx="60" cy="70" r="14" fill="#2d1480" stroke="#cdb8ff" stroke-width="6"/><circle cx="480" cy="60" r="14" fill="#2d1480" stroke="#3ee6c9" stroke-width="6"/><circle cx="470" cy="360" r="14" fill="#2d1480" stroke="#cdb8ff" stroke-width="6"/></svg><p>Split up. Meet up.</p></aside></header>
${t ? `<div class="toolbar"><span class="view-title">Daily plans</span>${filterSelect ? `<label class="traveler-select">Show plans for${filterSelect}</label>` : ''}<div class="tools"><button class="primary" id="add" ${off}>Add activity</button>${manageMenu(t, off)}<button class="secondary" id="density" aria-pressed="${state.dense}" title="${state.dense ? 'Show three larger day columns' : 'Show seven narrower day columns'}">${state.dense ? 'Larger cards' : 'Fit a week'}</button></div></div>` : ''}
<div id="status" role="status" aria-live="polite"></div><div id="message" role="alert"></div>
${t ? `${rail(t, state.day)}<div class="board-wrap${state.ideasClosed ? ' ideas-closed' : ''}">${ideasSection(t)}<div id="itinerary" tabindex="-1" class="date-board">${board(t, { filter: state.filter, day: state.day, compact: state.compact, hideExamples: state.hideExamples })}</div></div><div class="board-notes"><p id="drag-hint" class="drag-hint"></p><p id="filter-status" role="status" aria-live="polite">${state.filter === 'all' ? 'Everyone · shared plans appear once' : 'Selected group · all shared attendee labels remain visible'}</p>${weatherNote()}${examplesToggle}${roleNote}</div>${mapsSection(t)}` : welcome()}
<footer><span>Waypoint <span class="title-dot">×</span> Make plans. Take detours.</span><span>Guest links are optional and read-only.</span></footer></main>
`}${viewDialog()}<dialog id="editor" class="form-dialog" aria-labelledby="edit-title"><form id="edit-form"><div class="dialog-heading"><span class="eyebrow"></span><button type="button" class="icon-button" id="close-editor" aria-label="Close activity">×</button></div><h2 id="edit-title">Activity</h2><div id="editor-fields"></div><p class="last-edit" id="edit-last-edit" hidden></p><p id="edit-message" role="alert"></p><div class="dialog-actions"><button type="button" class="text-button" id="copy-draft" hidden>Copy my draft</button><button type="button" class="secondary" id="reload-after-conflict" hidden>Load latest plan</button><button type="button" class="text-button" id="delete">Delete activity</button><button type="submit" class="primary" id="save">Save changes</button></div></form></dialog>
<dialog id="roster-dialog" class="form-dialog" aria-labelledby="roster-title"></dialog><dialog id="history-dialog" aria-labelledby="history-title"></dialog><dialog id="stay-view" aria-labelledby="stay-view-title"></dialog><dialog id="structure-dialog" class="form-dialog" aria-labelledby="structure-title"></dialog><dialog id="archived-dialog" aria-labelledby="archived-title"></dialog><dialog id="editors-dialog" class="form-dialog" aria-labelledby="editors-title"></dialog><dialog id="create-dialog" class="form-dialog" aria-labelledby="create-title"><form id="create-form"><h2 id="create-title">New trip or event</h2><label>Name<input name="title" required maxlength="160"></label><label>Subtitle <small>(optional; shown under the name, and to guests)</small><input name="subtitle" maxlength="500"></label><div class="field-row"><label>First day<input type="date" name="start" required></label><label>Last day<input type="date" name="end" required></label></div><label>Time zone<input name="timezone" value="America/Los_Angeles" required></label><label>Kind<select name="kind"><option value="event">Gathering / event</option><option value="trip">Trip</option></select></label><p id="create-error" role="alert"></p><div class="dialog-actions"><button type="button" class="text-button danger" id="trip-delete" hidden>Delete this trip…</button><button type="button" class="secondary" data-close="create-dialog">Cancel</button><button class="primary" id="create-submit">Create</button></div></form></dialog>
<dialog id="import-dialog" class="form-dialog" aria-labelledby="import-title"><form id="import-form"><h2 id="import-title">Import a trip or event</h2><label>Trip JSON<textarea id="import-json" rows="14" required maxlength="250000" spellcheck="false"></textarea></label><p>Creates a separate private trip. Guest sharing starts disabled. A full backup file is checked for damage first.</p><p id="import-error" role="alert"></p><div class="dialog-actions"><button type="button" class="secondary" data-close="import-dialog">Cancel</button><button class="primary">Import trip</button></div></form></dialog><dialog id="share-dialog" aria-labelledby="share-title"><h2 id="share-title">A link for your guests</h2><p>Anyone holding this link can browse the dated activities and the unscheduled ideas, with group names, opted-in traveler display names, guest descriptions, meeting points, and the pictures on those cards. They cannot edit.</p><p>Private planning notes, journey notes, source links, and editor identities are excluded. A stay appears only if you ticked “Show this stay on the guest link” in it, and never with its private note or address. So is anything marked “Example · not a real plan”. Downloaded copies cannot be recalled.</p><div id="share-body"></div><p id="share-error" role="alert"></p><div class="dialog-actions"><button class="secondary" data-close="share-dialog">Close</button></div></dialog>`;
        status();
        fitColumns($('#itinerary'));
        if (t) {
            const selected = document.querySelector(`[data-date="${state.day}"]`);
            if (selected)
                $('#itinerary').scrollLeft = selected.offsetLeft - $('#itinerary').offsetLeft;
            revealDay();
        }
        // Cards changed in the last day get their mark, and the log is asked again if the plan has moved on.
        showLastEdits();
        loadLastEdits();
        // The weather lines are filled in place from the last answer, and asked for again when the plan or the hour has moved on.
        showWeather();
        loadWeather();
        // A redraw replaces the dialogs: put an open activity view back, with the values just loaded or saved.
        if (viewing)
            openView(viewing);
    }
    // ---- Activity view: a tap shows the activity; the editor opens only from its Edit button ----
    // `viewing` is the activity whose view is open. `returnTo` is set while the editor was opened from the
    // view, so that saving or cancelling comes back to it instead of dropping to the schedule.
    let viewing = null, returnTo = null, viewScope = '';
    function openView(id, { preview = false } = {}) {
        // In "Preview exactly what guests will see" the view is the guests' one: their fields, no Edit.
        const trip = preview ? state.sharePreview : state.snapshot?.trip, a = trip?.activities.find(x => x.id === id);
        viewing = a && !preview ? id : null;
        if (!a)
            return;
        viewScope = preview ? '.guest-preview' : '';
        showActivityView(document, a, trip, { guest: preview, canEdit: !preview });
        showLastEdits();
    }
    // ---- Weather under each date: fetched by the server for where each day's stay is; never stored ----
    // `weather.data` answers for one saved revision of one trip. A failed request leaves the lines as they were.
    let weather = { key: null, at: 0, data: null }, weatherLoading = false;
    const weatherKey = () => state.snapshot ? `${state.snapshot.trip.id}:${state.snapshot.revision}` : null;
    function showWeather() {
        const current = weather.key === weatherKey();
        applyWeather(document, current ? weather.data : null, { units: unitsFor(navigator.language), loading: !current && state.online && !state.needsSignIn });
    }
    async function loadWeather() {
        const key = weatherKey();
        if (!key || !state.online || state.needsSignIn || weatherLoading || (weather.key === key && Date.now() - weather.at < 30 * 60 * 1000))
            return;
        weatherLoading = true;
        let data = null;
        try {
            const r = await fetch(`/api/weather?id=${encodeURIComponent(state.snapshot.trip.id)}`, { cache: 'no-store', credentials: 'same-origin' });
            if (r.ok && (r.headers.get('Content-Type') || '').includes('application/json'))
                data = await r.json();
        }
        catch { /* no weather */ }
        weather = { key, at: Date.now(), data };
        weatherLoading = false;
        showWeather();
        // The plan was saved while this was on its way: ask once more for what is now on screen.
        if (weatherKey() !== key)
            loadWeather();
    }
    // ---- "Last edited by": read from the change log, never stored; shown to signed-in members only ----
    // `lastEdits.map` answers for one saved revision of one trip. After any save it is asked for again,
    // and until the answer arrives nothing is shown rather than something out of date.
    let lastEdits = { trip: null, revision: 0, map: {} }, lastEditsLoading = false;
    const lastEditOf = id => state.snapshot && lastEdits.trip === state.snapshot.trip.id && lastEdits.revision === state.snapshot.revision ? lastEdits.map[id] || null : null;
    async function loadLastEdits() {
        const snap = state.snapshot;
        if (!snap || !state.online || state.needsSignIn || lastEditsLoading || (lastEdits.trip === snap.trip.id && lastEdits.revision === snap.revision))
            return;
        lastEditsLoading = true;
        try {
            // A plain request: if it fails (offline, signed out) the note is simply absent, and nothing else changes.
            const r = await fetch(`/api/history?id=${encodeURIComponent(snap.trip.id)}&last=activity`, { cache: 'no-store', credentials: 'same-origin' });
            if (r.ok && (r.headers.get('Content-Type') || '').includes('application/json')) {
                const data = await r.json();
                lastEdits = { trip: snap.trip.id, revision: data.revision, map: data.last || {} };
            }
        }
        catch { /* no note */ }
        lastEditsLoading = false;
        showLastEdits();
        // Someone saved while this was on its way: ask once more for the revision now on screen.
        if (state.snapshot && lastEdits.trip === state.snapshot.trip.id && lastEdits.revision < state.snapshot.revision)
            loadLastEdits();
    }
    function showLastEdits() {
        const trip = state.snapshot?.trip;
        if (!trip)
            return;
        const fill = (el, id, newTab) => { if (el) { el.innerHTML = lastEditHtml(lastEditOf(id), trip.id, { newTab }); el.hidden = !el.innerHTML; } };
        const view = $(`#${VIEW_ID}`);
        fill(view?.querySelector('#view-last-edit'), view?.dataset.activity, false);
        const form = $('#edit-form');
        fill($('#edit-last-edit'), form?.dataset.new === 'true' ? null : form?.dataset.id, true);
        // Cards changed in the last day carry a small "Edited" mark; who and when is in the view. Never in the guest preview.
        for (const card of document.querySelectorAll('#itinerary .activity[data-detail], .idea-cards .activity[data-detail]')) {
            const entry = lastEditOf(card.dataset.detail), mark = card.querySelector('.edited-mark');
            if (!recentlyEdited(entry))
                mark?.remove();
            else if (!mark)
                card.insertAdjacentHTML('beforeend', `<span class="edited-mark"><span aria-hidden="true">✎ </span>Edited<span class="sr-only"> recently: ${escape(lastEditText(entry))}</span></span>`);
        }
    }
    // Follow a "see this change" link without leaving the page: the address changes, so it can be copied and survives a reload.
    async function openHistoryAt(changeId) {
        viewing = null;
        if ($(`#${VIEW_ID}`)?.open)
            $(`#${VIEW_ID}`).close();
        history.pushState(null, '', historyHref(state.selected, changeId));
        await openHistory('', changeId);
    }
    const linkedChange = () => { const v = new URLSearchParams(location.search).get('history'); return v && /^\d+$/.test(v) ? Number(v) : null; };
    enableViewDismiss({ document, sheet: () => phone() });
    // Long descriptions are shown whole in the editor too, where the browser cannot size the box itself.
    function growTextareas() {
        if (globalThis.CSS?.supports?.('field-sizing', 'content'))
            return;
        for (const box of document.querySelectorAll('#edit-form textarea[data-grow]')) {
            box.style.height = 'auto';
            if (box.scrollHeight)
                box.style.height = `${box.scrollHeight + 4}px`;
        }
    }
    // Keep the selected day's medallion in view on long trips.
    function revealDay() {
        const rail = $('.medallions'), chosen = rail?.querySelector('[aria-pressed=true]');
        if (chosen)
            rail.scrollLeft = chosen.offsetLeft - rail.offsetLeft - (rail.clientWidth - chosen.offsetWidth) / 2;
    }
    function relayout() {
        if (state.layout === phone())
            return;
        if (document.querySelector('dialog[open]'))
            return void (state.layoutStale = true);
        state.layoutStale = false;
        render();
    }
    // ---- Maps: tile-free schematics drawn from the same filtered records as the board ----
    // The panel itself is drawn by map-panel.mjs, which the guest page shares.
    const mapOptions = () => ({ view: state.mapView === 'trip' ? 'trip' : 'day', filter: state.filter, day: state.day, compact: phone(), canEdit: true, dayName });
    const mapsBody = t => mapBodyHtml(t, mapOptions());
    const mapsSection = t => mapSectionHtml(t, mapOptions());
    function refreshMaps() {
        if ($('#maps-body') && state.snapshot)
            $('#maps-body').innerHTML = mapsBody(state.snapshot.trip);
    }
    const ideaList = t => t.activities.filter(a => !a.date && matchesSelection(a, state.filter, t) && !(state.hideExamples && isExample(a)));
    function ideas(t) { return ideaCards(ideaList(t), t) || '<p>No unscheduled ideas yet.</p>'; }
    const rail = (t, day) => dayChooser(t, day, { ideas: ideaList(t).length, allDays: !!state.allDays });
    const allDaysView = () => phone() && !!state.allDays;
    // Beside the days on wide screens (and it can be folded to a narrow tab there); below the selected day on a phone.
    const ideasToggleLabel = t => state.ideasClosed ? `Ideas · ${ideaList(t).length}` : 'Hide';
    const ideasSection = t => `<section class="ideas" id="ideas"><button type="button" class="ideas-toggle" id="ideas-toggle" aria-expanded="${!state.ideasClosed}" aria-controls="idea-cards">${ideasToggleLabel(t)}</button><h2>Ideas <span>· not scheduled yet</span></h2><div class="idea-cards" id="idea-cards">${ideas(t)}</div><button type="button" class="add-here" data-add-date="">+ Add an idea</button></section>`;
    // ---- Drag-and-drop and keyboard moves (one shared record, same revision-checked save) ----
    const phone = () => window.matchMedia?.(PHONE_QUERY).matches;
    const dayName = date => date ? dateLabel(date, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Unscheduled ideas';
    const groupNames = a => a.participants.map(id => participantRecord(state.snapshot.trip, id)?.name || id).join(', ');
    function showDay(date) {
        state.day = date;
        persist();
        const it = $('#itinerary');
        for (const section of it?.querySelectorAll('.agenda-day') || [])
            section.dataset.selected = String(section.dataset.date === date);
        if ($('#day'))
            $('#day').value = date;
        if ($('.day-rail')) { $('.day-rail').outerHTML = rail(state.snapshot.trip, date); revealDay(); }
        refreshMaps();
        const column = it?.querySelector(`[data-date="${date}"]`);
        if (column && allDaysView())
            column.scrollIntoView({ block: 'start' });
        if (column && !phone())
            it.scrollTo({ left: column.offsetLeft - it.offsetLeft, behavior: 'smooth' });
    }
    // All-days phone view: every day is on the page, so choosing a day scrolls to it, and scrolling keeps the
    // rail, the map and "Add activity" pointed at the day on screen.
    function jumpToDay(date) {
        state.day = date;
        persist();
        pressDay(document, date);
        refreshMaps();
        document.querySelector(`#itinerary .agenda-day[data-date="${date}"]`)?.scrollIntoView({ block: 'start' });
    }
    // One-day phone view: flick left or right on the day to go to the next or previous day.
    let flick = null;
    document.addEventListener('touchstart', event => {
        const t = event.touches[0];
        flick = event.touches.length === 1 && phone() && !state.allDays && state.snapshot && !document.querySelector('dialog[open]') && event.target.closest?.('#itinerary') ? { x: t.clientX, y: t.clientY, at: Date.now() } : null;
    }, { passive: true });
    document.addEventListener('touchend', event => {
        const start = flick, t = event.changedTouches[0];
        flick = null;
        if (!start || !t || document.body.classList.contains('is-dragging') || document.querySelector('dialog[open]'))
            return;
        const step = swipeStep({ dx: t.clientX - start.x, dy: t.clientY - start.y, ms: Date.now() - start.at, startX: start.x, width: window.innerWidth });
        const dates = days(state.snapshot.trip), next = dates[dates.indexOf(state.day) + step];
        if (step && next) {
            state.day = next;
            persist();
            render();
            $('#itinerary')?.classList.add(step > 0 ? 'flick-next' : 'flick-prev');
        }
    }, { passive: true });
    document.addEventListener('touchcancel', () => { flick = null; }, { passive: true });
    let spying = 0;
    window.addEventListener('scroll', () => {
        if (spying || !allDaysView() || !state.snapshot || document.body.classList.contains('is-dragging'))
            return;
        spying = requestAnimationFrame(() => {
            spying = 0;
            const date = dayInView(document);
            if (date && date !== state.day) {
                state.day = date;
                pressDay(document, date);
                refreshMaps();
            }
        });
    }, { passive: true });
    function refreshBoard(movedId, { focus = false, refused = false } = {}) {
        const t = state.snapshot.trip, it = $('#itinerary');
        if (!it)
            return render();
        const left = it.scrollLeft, top = it.scrollTop;
        it.innerHTML = board(t, { filter: state.filter, day: state.day, compact: state.compact, hideExamples: state.hideExamples });
        showWeather();
        it.scrollLeft = left;
        it.scrollTop = top;
        if ($('.idea-cards'))
            $('.idea-cards').innerHTML = ideas(t);
        if ($('#ideas-toggle'))
            $('#ideas-toggle').textContent = ideasToggleLabel(t);
        refreshMaps();
        if ($('#day'))
            $('#day').value = state.day;
        if ($('.day-rail')) { $('.day-rail').outerHTML = rail(t, state.day); revealDay(); }
        const el = movedId && document.querySelector(`#itinerary [data-detail="${CSS.escape(movedId)}"], .idea-cards [data-detail="${CSS.escape(movedId)}"]`);
        if (el) {
            el.classList.add(refused ? 'drop-refused' : 'just-moved');
            if (focus)
                el.focus();
            el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
        showLastEdits();
        loadLastEdits();
    }
    async function moveCard({ activityId, date, beforeId = null, follow = false, focus = false }) {
        if (!writable() || !state.snapshot)
            return;
        const previous = state.snapshot, a = previous.trip.activities.find(x => x.id === activityId);
        if (!a)
            return;
        if (a.fixed && (a.date ?? null) !== date) {
            state.message = `“${a.title}” has a set time, so it stays on ${dayName(a.date)}. To change its day, open it, choose Edit and then “That day”, then move it.`;
            refreshBoard(activityId, { refused: true, focus });
            status();
            return;
        }
        let result;
        try {
            result = moveActivity(previous.trip, { activityId, date, beforeId });
        }
        catch (e) {
            state.message = e.message;
            status();
            return;
        }
        if (!result.changed)
            return;
        // Optimistic: show the card in its new place now; the server confirms or we roll back.
        state.snapshot = { ...previous, trip: result.trip };
        if (follow && date)
            state.day = date;
        refreshBoard(activityId, { focus });
        state.busy = true;
        state.message = `Saving: “${a.title}” → ${dayName(date)}…`;
        status();
        const shared = a.participants.length > 1 || a.participants.some(id => state.snapshot.trip.families.some(g => g.id === id && isWholeTripGroup(g)));
        try {
            const saved = await request(endpoint('/api/trip'), 'PATCH', { action: 'move', base: baseFor(previous.revisions || {}, recordKey('activity', activityId)), activityId, date, beforeId });
            state.snapshot = saved.snapshot;
            remember();
            const where = result.from === date ? `Reordered “${a.title}” on ${dayName(date)}.` : `Moved “${a.title}” from ${dayName(result.from)} to ${dayName(date)}.`;
            state.message = `${where}${shared && result.from !== date ? ` One shared plan, moved for ${groupNames(a)}${state.filter !== 'all' ? ' — including travelers hidden by the “Show plans for” filter' : ''}.` : ''} Saved for everyone viewing this trip.`;
        }
        catch (e) {
            if (e.status === 403) { render(); return; }
            state.snapshot = previous;
            state.busy = false;
            refreshBoard(activityId, { refused: true });
            if (e.status === 409) {
                await load();
                state.message = `Not moved: someone else changed “${a.title}” first. Nothing was overwritten — the latest plan is now shown. Move it again if it is still needed.`;
            }
            else
                state.message = `Not moved: ${e.message} “${a.title}” is back where it was.`;
        }
        finally {
            state.busy = false;
            status();
        }
    }
    enableDrag({
        document,
        canDrag: () => writable() && !!state.snapshot && !document.querySelector('dialog[open]'),
        currentDay: () => state.day,
        onDayHover: showDay,
        onDrop: drop => moveCard({ ...drop, follow: drop.viaChip }),
        describe: id => {
            const a = state.snapshot?.trip.activities.find(x => x.id === id);
            if (!a)
                return null;
            const note = a.fixed ? `Set time · can only be reordered within ${dayName(a.date)}` : a.participants.length > 1 || a.participants.some(id => state.snapshot.trip.families.some(g => g.id === id && isWholeTripGroup(g))) ? `Shared plan · moves for ${groupNames(a)}${state.filter !== 'all' ? ' (including travelers hidden by the filter)' : ''}` : groupNames(a);
            return { title: a.title, date: a.date ?? null, fixed: a.fixed, note: `${note}${phone() ? ' · Pause on a day to open it and place the card between others.' : ''}` };
        },
        dock: () => [...days(state.snapshot.trip).map(d => ({ date: d, top: dateLabel(d, { weekday: 'short' }), big: dateLabel(d, { day: 'numeric' }), current: d === state.day })), { date: null, top: 'Unschedule', big: 'Ideas', current: false }]
    });
    document.addEventListener('keydown', event => {
        const keys = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 };
        if (!event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || !(event.key in keys))
            return;
        const cardEl = event.target.closest?.('.can-drag .activity[data-detail]');
        if (!cardEl || !writable() || document.querySelector('dialog[open]'))
            return;
        event.preventDefault();
        const t = state.snapshot.trip, a = t.activities.find(x => x.id === cardEl.dataset.detail);
        if (!a?.date)
            return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            const dates = days(t), date = dates[dates.indexOf(a.date) + keys[event.key]];
            if (date)
                moveCard({ activityId: a.id, date, follow: true, focus: true });
            return;
        }
        const visible = [...cardEl.closest('.agenda-day').querySelectorAll('.activity[data-detail]')].map(c => c.dataset.detail);
        const target = stepTarget(visible, a.id, keys[event.key]);
        if (target)
            moveCard({ activityId: a.id, date: a.date, beforeId: target.beforeId, focus: true });
    });
    function attendanceFields(a, t, disabled, legend, allowAdd = false) {
        return `<fieldset><legend>${legend || 'Who'}</legend><p class="form-hint">Select a group to include its current members, or select individual travelers.</p>${t.families.map(g => `<label class="check-label"><input type="checkbox" name="participants" data-group="1" value="${escape(g.id)}" ${a.participants.includes(g.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''}>${escape(g.name)}${isWholeTripGroup(g) ? ' · whole trip' : ''}</label>`).join('')}${peopleOf(t).length ? '<h3>Individual travelers</h3>' : ''}${peopleOf(t).map(p => `<label class="check-label"><input type="checkbox" name="participants" data-person="${escape(p.id)}" data-explicit="${a.participants.includes(p.id)}" value="${escape(p.id)}" ${a.participants.includes(p.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${escape(p.name)}<small data-included="${escape(p.id)}"></small></span></label>`).join('')}${allowAdd && !disabled ? `<button type="button" class="text-button" id="person-inline-open">＋ Add a person who is not listed…</button><fieldset class="inline-place" id="person-inline" hidden><legend>New person</legend><label>Display name<input name="newPersonName" maxlength="80" autocomplete="off"></label><label>Family / group<select name="newPersonGroup"><option value="">No family group</option>${t.families.filter(g => !isWholeTripGroup(g)).map(g => `<option value="${escape(g.id)}">${escape(g.name)}</option>`).join('')}</select></label><p id="person-inline-message" role="alert"></p><button type="button" class="secondary" id="person-inline-save">Add this person</button><p class="form-hint">Adds them to this trip’s travelers straight away. Their name stays off the guest link unless the organizer chooses to show it. Your activity is saved separately with the Save button.</p></fieldset>` : ''}</fieldset>`;
    }
    function updateAttendance(form = $('#edit-form')) {
        if (!form?.querySelectorAll)
            return;
        const groups = [...form.querySelectorAll('[data-group]:checked')].map(x => x.value);
        for (const input of form.querySelectorAll('[name=participants][data-person]')) {
            const person = peopleOf(state.snapshot.trip).find(p => p.id === input.value);
            const implied = includesPerson(groups, person, state.snapshot.trip);
            input.checked = implied || input.dataset.explicit === 'true';
            input.disabled = !writable() || implied;
            form.querySelector(`[data-included="${input.value}"]`).textContent = implied ? 'Included through the selected group' : '';
        }
    }
    function openRoster(defaultFamily = '') {
        const t = state.snapshot.trip;
        $('#roster-dialog').innerHTML = `<div class="dialog-heading"><span class="eyebrow">People on this trip</span><button type="button" class="icon-button" data-close="roster-dialog" aria-label="Close travelers">×</button></div><h2 id="roster-title">Travelers & groups</h2><p>Plan for people by display name. Adding a traveler does not invite them or grant editing access.</p><button type="button" class="secondary" id="roster-backup">Save JSON backup</button><div class="roster-grid"><section><h3>Travelers (${peopleOf(t).length})</h3><ul class="roster-list">${peopleOf(t).map(p => `<li><span><strong>${escape(p.name)}</strong><small>${escape(t.families.find(g => g.id === p.familyId)?.name || 'No family group')} · ${p.showOnGuest ? 'Name shown to guests' : 'Name private'}</small></span><span class="row-actions"><button type="button" class="secondary" data-person="${escape(p.id)}" aria-label="Edit traveler ${escape(p.name)}">Edit</button><button type="button" class="text-button danger" data-remove-person="${escape(p.id)}" aria-label="Remove traveler ${escape(p.name)}">Remove</button></span></li>`).join('') || '<li>No individual travelers yet. Existing group assignments still work.</li>'}</ul><form id="traveler-form"><h3 id="traveler-form-title">Add traveler</h3><label>Display name<input name="name" required maxlength="80" autocomplete="off"></label><label>Family / group<select name="familyId"><option value="">No family group</option>${t.families.filter(g => !isWholeTripGroup(g)).map(g => `<option value="${escape(g.id)}">${escape(g.name)}</option>`).join('')}</select></label><label class="check-label"><input name="showOnGuest" type="checkbox" ${state.isOwner ? '' : 'disabled'}>Show display name on guest link</label>${state.isOwner ? '' : '<p class="form-hint">Only the organizer changes this setting.</p>'}<p class="form-hint">Private by default. This controls the guest filter and participant labels. Activity titles and guest descriptions are still shared as written.</p><p class="form-hint">Changing a family/group changes which group-based plans include this traveler. Everyone always includes the whole trip.</p><div class="dialog-actions"><button type="button" class="secondary" id="roster-new">New traveler</button><button class="primary" id="roster-save">Save traveler</button></div></form></section><section><h3>Families / groups</h3><ul class="roster-list">${t.families.map(g => `<li><span><strong>${escape(g.name)}</strong><small>${isWholeTripGroup(g) ? 'Automatically includes every traveler' : `${peopleOf(t).filter(p => p.familyId === g.id).length} travelers`}</small></span><span class="row-actions"><button type="button" class="secondary" data-family-edit="${escape(g.id)}" aria-label="Edit group ${escape(g.name)}">Edit</button>${isWholeTripGroup(g) ? '' : `<button type="button" class="text-button danger" data-remove-family="${escape(g.id)}" aria-label="Remove group ${escape(g.name)}">Remove</button>`}</span></li>`).join('')}</ul><form id="family-form"><h3 id="family-form-title">Add family / group</h3><label>Group name<input name="name" required maxlength="80"></label><label>Accent<select name="color"><option value="green">Lagoon</option><option value="orange">Ember</option><option value="blue">Orchid</option></select></label><p class="form-hint">Group names appear in an enabled guest view. Create a group, then assign travelers to it above.</p><div class="dialog-actions"><button type="button" class="secondary" id="family-new">New group</button><button class="primary" id="family-save">Save group</button></div></form></section></div><p id="roster-message" role="status" aria-live="polite"></p><div class="dialog-actions"><button type="button" class="secondary" id="roster-copy" hidden>Copy roster draft</button><button type="button" class="secondary" id="roster-reload" hidden>Load latest plan</button><button type="button" class="secondary" data-close="roster-dialog">Done</button></div>`;
        $('#traveler-form').elements.familyId.value = defaultFamily;
        $('#roster-dialog').showModal();
        status();
    }
    // Organizer only: who else may edit this trip. Adding an address never sends anything.
    function showEditors(data, message = '') {
        const dialog = $('#editors-dialog');
        dialog.innerHTML = `<div class="dialog-heading"><span class="eyebrow">Who can edit</span><button type="button" class="icon-button" data-close="editors-dialog" aria-label="Close editors">×</button></div><h2 id="editors-title">Editors for this trip</h2><p><strong>Editors can</strong> open this trip in the planner and add, change, move and delete activities and ideas, including their guest descriptions and meeting points. They can also update travelers, places, stays and journeys.</p><p><strong>Editors cannot</strong> change the trip’s name, subtitle, dates or time zone, manage the guest link, choose which traveler names guests see, see or change this list, or create, import, delete or restore trips. Those stay with you as organizer.</p><h3>Current editors (${data.editors.length})</h3><ul class="roster-list">${data.editors.map(email => `<li><span><strong>${escape(email)}</strong><small>Can edit this trip</small></span><button type="button" class="secondary" data-remove-editor="${escape(email)}" aria-label="Remove editor ${escape(email)}">Remove</button></li>`).join('') || '<li>No editors yet. Only you can change this trip.</li>'}</ul><form id="editor-form"><label>Editor's sign-in email<input name="email" type="email" required maxlength="254" autocomplete="off" autocapitalize="none" spellcheck="false"></label><p class="form-hint">No invitation or email is sent. Tell the person yourself: they open the planner and sign in with exactly this email address, and this trip appears in their trip list. Up to ${data.max} editors.</p><p class="form-hint"><strong>Add the address here before you send anyone the link.</strong> Tell them the sign-in step emails a one-time code, not a password, and that the email may land in spam. Several people can share one address; History then shows one name for all of them.</p><p class="form-hint">Removing someone ends their access the next time their planner contacts the server. A copy they already saved or downloaded cannot be recalled.</p><p id="editors-message" role="status" aria-live="polite">${escape(message)}</p><div class="dialog-actions"><button type="button" class="secondary" data-close="editors-dialog">Done</button><button class="primary" id="editor-add">Add editor</button></div></form>`;
        if (!dialog.open)
            dialog.showModal();
        status();
    }
    async function changeEditors(action, email) {
        try {
            const data = await request(endpoint('/api/editors'), 'POST', { action, email });
            showEditors(data, action === 'add' ? `${email.trim().toLowerCase()} can now edit this trip. No email was sent.` : `${email} can no longer open or edit this trip.`);
        }
        catch (e) {
            if ($('#editors-message'))
                $('#editors-message').textContent = e.message;
            else
                throw e;
        }
    }
    // ---- Safety net: history with conditional undo, removing travelers/groups, deleting (archiving) a trip ----
    const archivedButton = (off, phoneLayout) => !state.archived.length ? '' : phoneLayout ? `<div class="manage-group"><h3>Deleted trips</h3><div class="tools"><button class="secondary wide" id="archived-open" ${off}>Archived trips (${state.archived.length})</button></div></div>` : `<button class="secondary" id="archived-open" ${off}>Archived trips (${state.archived.length})</button>`;
    const FIELD_LABELS = { title: 'Title', name: 'Name', subtitle: 'Subtitle', date: 'Day', time: 'Time', placeId: 'Place', order: 'Position in the day', fixed: 'Set time (protected)', timing: 'Timing', optional: 'Optional', highlight: 'Whole-group activity', participants: 'Participants', notes: 'Private notes', guestNotes: 'Guest description', guestLocation: 'Guest meeting point', address: 'Address', start: 'Start', end: 'End', timezone: 'Time zone', kind: 'Kind', familyId: 'Family / group', showOnGuest: 'Shown to guests', groupInfo: 'For the group', checkOutTime: 'Check-out time', color: 'Accent', lodging: 'Lodging', note: 'Note', mode: 'Mode', from: 'From', to: 'To', arrivalDate: 'Arrival day', arrivalTime: 'Arrival time', localName: 'Local name', localAddress: 'Local address', locationText: 'Location for the map', parentId: 'Inside', sourceKind: 'Source', allTravelers: 'Whole-trip group', links: 'Links', imageId: 'Picture', lat: 'Latitude', lng: 'Longitude', coordSystem: 'Coordinate system', coordSource: 'Coordinate source', amapUrl: 'Amap link', appleMapsUrl: 'Apple Maps link', navReviewed: 'Map links reviewed' };
    function historyValue(field, value) {
        const t = state.snapshot.trip, name = id => participantRecord(t, id)?.name || 'someone since removed';
        if (value === null || value === undefined || value === '')
            return '—';
        if (typeof value === 'boolean')
            return value ? 'Yes' : 'No';
        if (field === 'participants' && Array.isArray(value))
            return value.map(name).join(', ') || 'No one';
        if (field === 'familyId')
            return name(value);
        if (field === 'imageId')
            return 'A picture';
        if (field === 'timing')
            return TIMING_LABELS[value] || String(value);
        if (['placeId', 'from', 'to', 'parentId'].includes(field))
            return t.places.find(p => p.id === value)?.name || 'a place since removed';
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        return text.length > 140 ? `${text.slice(0, 140)}…` : text;
    }
    function historyEntry(c) {
        const details = c.records.map(r => {
            const label = (r.after || r.before)?.title || (r.after || r.before)?.name || '';
            const what = `${r.kind === 'trip' ? 'Trip details' : `${r.kind[0].toUpperCase()}${r.kind.slice(1)}`}${label && r.kind !== 'trip' ? ` “${escape(label)}”` : ''}`;
            if (!r.before || !r.after)
                return `<li><strong>${what}</strong> ${r.after ? 'added' : 'removed'}</li>`;
            return `<li><strong>${what}</strong><ul>${fieldChanges(r).map(f => `<li>${escape(FIELD_LABELS[f.field] || f.field)}: <span class="was">${escape(historyValue(f.field, f.before))}</span> → <span class="now">${escape(historyValue(f.field, f.after))}</span></li>`).join('')}</ul></li>`;
        }).join('');
        const state_ = c.wasUndone ? '<span class="history-tag">Undone</span>' : !c.records.length ? '' : c.canUndo ? `<button type="button" class="secondary" data-undo="${c.id}" aria-label="Undo: ${escape(c.summary)}">Undo</button>` : '<span class="history-tag" title="A record this change touched has been edited again since.">Changed since · can’t undo</span>';
        return `<li class="history-entry" id="change-${c.id}" tabindex="-1"><div class="history-line"><span><strong>${escape(c.summary)}</strong><small>${escape(c.actor)} · ${escape(new Date(c.at).toLocaleString())} · revision ${c.revision}</small></span>${state_}</div>${details ? `<details><summary>What changed (${c.records.length})</summary><ul class="history-records">${details}</ul></details>` : ''}</li>`;
    }
    // `focusId` is the entry a link pointed at: it is scrolled into view, opened and outlined.
    async function openHistory(message = '', focusId = null) {
        const data = await request(`${endpoint('/api/history')}${focusId ? `&change=${focusId}` : ''}`);
        const dialog = $('#history-dialog');
        if (focusId && data.linked === 'missing')
            message = 'That change is not in this trip’s history. The link may be for another trip.';
        const older = data.linked === 'older' ? data.changes.pop() : null;
        dialog.innerHTML = `<div class="dialog-heading"><span class="eyebrow">Safety net</span><button type="button" class="icon-button" data-close="history-dialog" aria-label="Close history">×</button></div><h2 id="history-title">History</h2><p>Every saved change, newest first. <strong>Undo</strong> puts back just the records that one change touched, and only while they are still exactly as that change left them. If someone has edited them again since, nothing is changed and you are told.</p><p id="history-message" role="alert">${escape(message)}</p>${data.revision !== state.snapshot.revision ? '<p class="form-hint">This trip has newer saved changes than the plan on your screen. Close this and choose Refresh to see them.</p>' : ''}<ol class="history-list">${data.changes.map(historyEntry).join('') || '<li>No changes recorded yet. History starts with the first change saved after this feature was installed.</li>'}${older ? `<li class="history-older">Older than the newest 100 changes:</li>${historyEntry(older)}` : ''}</ol><div class="dialog-actions">${state.isOwner ? '<button type="button" class="secondary" id="full-backup">Download full backup</button>' : ''}<button type="button" class="secondary" data-close="history-dialog">Done</button></div>`;
        if (!dialog.open)
            dialog.showModal();
        const entry = focusId && dialog.querySelector(`#change-${focusId}`);
        if (entry) {
            entry.classList.add('linked');
            entry.querySelector('details')?.setAttribute('open', '');
            entry.insertAdjacentHTML('afterbegin', '<span class="history-linked-label">The change you followed</span>');
            entry.scrollIntoView({ block: 'center' });
            entry.focus({ preventScroll: true });
        }
    }
    async function undo(changeId) {
        state.busy = true;
        status();
        try {
            const result = await request(endpoint('/api/history'), 'POST', { action: 'undo', changeId });
            state.snapshot = result.snapshot;
            remember();
            state.busy = false;
            state.message = `${result.summary}. Saved for everyone viewing this trip.`;
            render();
            await openHistory(`${result.summary}.`);
        }
        catch (e) {
            state.busy = false;
            if (e.status === 409) {
                // Show the latest plan behind the dialog so the conflict can be looked at.
                await load();
                await openHistory(e.message);
            }
            else if ($('#history-message'))
                $('#history-message').textContent = e.message;
            else
                throw e;
        }
        finally {
            state.busy = false;
            status();
        }
    }
    async function removeFromRoster(kind, id) {
        const t = state.snapshot.trip, group = kind === 'family';
        const record = (group ? t.families : peopleOf(t)).find(r => r.id === id);
        if (!record)
            return;
        const refs = participantReferences(t, id);
        const question = refs.total
            ? `“${record.name}” is used by ${referenceSummary(refs)}.\n\nRemove “${record.name}” and take them off those plans? The plans themselves stay${group ? ', and travelers in this group stay on the trip without a group' : ''}. You can undo this from History.`
            : `Remove “${record.name}” from this trip? Nothing else refers to them. You can undo this from History.`;
        if (!confirm(question))
            return;
        state.busy = true;
        status();
        try {
            const result = await request(endpoint('/api/trip'), 'PATCH', { action: group ? 'family-remove' : 'traveler-remove', base: base(recordKey(group ? 'group' : 'traveler', id)), [group ? 'familyId' : 'personId']: id, unassign: refs.total > 0 });
            state.snapshot = result.snapshot;
            if (state.filter === id)
                state.filter = 'all';
            remember();
            state.busy = false;
            render();
            openRoster();
            $('#roster-message').textContent = `Removed “${record.name}”. Undo is available in History.`;
        }
        catch (e) {
            $('#roster-message').textContent = e.message;
            $('#roster-reload').hidden = false;
        }
        finally {
            state.busy = false;
            status();
        }
    }
    function openArchived(message = '') {
        const dialog = $('#archived-dialog');
        dialog.innerHTML = `<div class="dialog-heading"><span class="eyebrow">Deleted trips</span><button type="button" class="icon-button" data-close="archived-dialog" aria-label="Close archived trips">×</button></div><h2 id="archived-title">Archived trips</h2><p>Deleting a trip only archives it. Its plan, history and editor list are kept, and only you can see or restore it. Its guest link was switched off and stays off after a restore until you enable a new one.</p><ul class="roster-list">${state.archived.map(x => `<li><span><strong>${escape(x.title)}</strong><small>Deleted ${escape(new Date(x.archivedAt).toLocaleString())}</small></span><button type="button" class="secondary" data-restore-trip="${escape(x.id)}" aria-label="Restore ${escape(x.title)}">Restore</button></li>`).join('') || '<li>No archived trips.</li>'}</ul><p id="archived-message" role="status" aria-live="polite">${escape(message)}</p><div class="dialog-actions"><button type="button" class="secondary" data-close="archived-dialog">Done</button></div>`;
        if (!dialog.open)
            dialog.showModal();
    }
    async function archiveTrip() {
        const t = state.snapshot.trip;
        if (!confirm(`Delete “${t.title}”?\n\nIt disappears for you and every editor, and its guest link stops working. Nothing is erased: you can restore it from “Archived trips”.`))
            return;
        await request(endpoint('/api/archive'), 'POST', { action: 'archive', base: base('trip') });
        $('#create-dialog').close();
        delete state.copies[state.selected];
        state.selected = null;
        state.snapshot = null;
        history.replaceState(null, '', '/');
        await load();
        state.message = `“${t.title}” was deleted. Restore it any time from “Archived trips”.`;
        status();
    }
    async function restoreTrip(id) {
        await request(`/api/archive?id=${encodeURIComponent(id)}`, 'POST', { action: 'restore' });
        state.selected = id;
        state.filter = 'all';
        state.day = null;
        history.replaceState(null, '', `/?trip=${id}`);
        await load();
        state.message = 'Trip restored. Its guest link stays off until you enable a new one.';
        status();
    }
    // ---- Trip structure: places, stays and journeys (same revision-checked save as activities) ----
    const placeLabel = p => `${p.name}${p.localName ? ` ${p.localName}` : ''}`;
    // Venues are listed under their area, named "Area › Venue" so the choice reads the same wherever it is shown.
    const placeChoice = p => `${p.depth ? `${p.areaName} › ` : ''}${placeLabel(p)}`;
    const placeOptions = (t, selected, empty) => `<option value="">${empty}</option>${orderedPlaces(t).map(p => `<option value="${escape(p.id)}" ${selected === p.id ? 'selected' : ''}>${escape(placeChoice(p))}</option>`).join('')}`;
    // "Inside": the one level of nesting. A place that already has venues stays an area.
    const insideField = (t, p, prefix, disabled) => {
        const hasVenues = !!p.id && t.places.some(x => x.parentId === p.id), areas = t.places.filter(x => !x.parentId && x.id !== p.id);
        return `<label>Inside <small>(optional)</small><select name="${prefix}parentId" ${disabled} ${hasVenues ? 'disabled' : ''}><option value="">Nothing · it is an area of its own</option>${areas.map(x => `<option value="${escape(x.id)}" ${p.parentId === x.id ? 'selected' : ''}>${escape(placeLabel(x))}</option>`).join('')}</select><small>${hasVenues ? 'Other places sit inside this one, so it stays an area.' : 'Choose a city or camp to make this a venue inside it, for example a museum in a city or a lodge at a camp.'}</small></label>`;
    };
    const placeName = id => state.snapshot.trip.places.find(p => p.id === id)?.name || 'Location to confirm';
    const names = ids => (ids || []).map(id => participantRecord(state.snapshot.trip, id)?.name || id).join(' + ') || 'No one yet';
    const placeFields = (p, prefix, disabled) => `<label>Place name<input name="${prefix}name" value="${escape(p.name || '')}" maxlength="160" ${prefix ? '' : 'required'} ${disabled}></label><label>Name in local script <small>(optional)</small><input name="${prefix}localName" value="${escape(p.localName || '')}" maxlength="160" lang="zh-Hans" ${disabled}></label><label>Address <small>(private, optional)</small><input name="${prefix}address" value="${escape(p.address || '')}" maxlength="500" ${disabled}></label><label>Address in local script <small>(optional)</small><input name="${prefix}localAddress" value="${escape(p.localAddress || '')}" maxlength="500" lang="zh-Hans" ${disabled}></label>`;
    function structureDialog(eyebrow, title, body, back) {
        const dialog = $('#structure-dialog');
        dialog.innerHTML = `<div class="dialog-heading"><span class="eyebrow">${eyebrow}</span><button type="button" class="icon-button" data-close="structure-dialog" aria-label="Close">×</button></div><h2 id="structure-title">${title}</h2>${body}`;
        dialog.dataset.back = back ? 'list' : '';
        dialog.scrollTop = 0;
        if (!dialog.open)
            dialog.showModal();
        status();
    }
    const formActions = (kind, isNew, back) => `<p id="structure-message" role="alert"></p><div class="dialog-actions"><button type="button" class="secondary" id="structure-reload" hidden>Load latest plan</button>${isNew ? '' : `<button type="button" class="text-button danger" id="${kind}-delete" ${writable() ? '' : 'disabled'}>Delete ${kind === 'leg' ? 'journey' : kind}</button>`}<button type="button" class="secondary" ${back ? 'data-structure-back="1"' : 'data-close="structure-dialog"'}>${back ? 'Back' : 'Cancel'}</button><button class="primary" id="structure-save" ${writable() ? '' : 'disabled'}>Save</button></div>`;
    function openStructure(message = '') {
        const t = state.snapshot.trip, off = writable() ? '' : 'disabled';
        const row = (main, small, attr, label) => `<li><span><strong>${main}</strong><small>${small}</small></span><button type="button" class="secondary" ${attr} aria-label="Edit ${label}">Edit</button></li>`;
        structureDialog('The shape of the trip', 'Places, stays &amp; journeys', `<p>Places are where things happen. A place can be an area (a city, a camp) or a venue inside one. A stay is where a group sleeps between two dates. A journey moves a group between places. Stays and journeys can also be opened from the board.</p><p id="structure-message" role="alert">${escape(message)}</p>
<h3>Places (${t.places.length})<button type="button" class="secondary" id="structure-add-place" ${off}>Add place</button></h3><ul class="roster-list">${orderedPlaces(t).map(p => { const refs = placeReferences(t, p.id); return row(`${p.depth ? '↳ ' : ''}${escape(placeLabel(p))}`, `${escape(p.address || 'No address yet')} · ${refs.total ? `used by ${escape(placeReferenceSummary(refs))}` : 'not used yet'}`, `data-place-edit="${escape(p.id)}"`, `place ${escape(p.name)}`); }).join('') || '<li>No places yet.</li>'}</ul>
<h3>Stays (${t.stays.length})<button type="button" class="secondary" id="structure-add-stay" ${off}>Add stay</button></h3><ul class="roster-list">${[...t.stays].sort((a, b) => a.start.localeCompare(b.start)).map(s => row(`${escape(placeName(s.placeId))} · ${escape(s.start)} → ${escape(s.end)}`, `${escape(names(s.participants))} · ${escape(s.lodging || s.name || 'Lodging to confirm')}`, `data-stay="${escape(s.id)}" data-from-list="1"`, `stay at ${escape(placeName(s.placeId))}`)).join('') || '<li>No stays yet.</li>'}</ul>
<h3>Journeys (${t.legs.length})<button type="button" class="secondary" id="structure-add-leg" ${off}>Add journey</button></h3><ul class="roster-list">${[...t.legs].sort((a, b) => a.date.localeCompare(b.date)).map(l => row(`${escape(l.date)} · ${escape(l.mode || 'Journey')} · ${escape(l.title)}`, `${escape(l.from ? placeName(l.from) : 'Start to confirm')} → ${escape(l.to ? placeName(l.to) : 'End to confirm')} · ${escape(names(l.participants))}`, `data-leg="${escape(l.id)}" data-from-list="1"`, `journey ${escape(l.title)}`)).join('') || '<li>No journeys yet.</li>'}</ul>
<div class="dialog-actions"><button type="button" class="secondary" data-close="structure-dialog">Done</button></div>`);
    }
    // Says back how the typed map location was understood, and shows the coordinate questions only for coordinates.
    function readLocation() {
        const form = $('#place-form'), out = $('#location-read');
        if (!form || !out)
            return;
        let read, error = '';
        try {
            read = parseLocation(form.elements.locationText.value);
        }
        catch (e) {
            read = { kind: 'error' };
            error = e.message;
        }
        const pair = read.kind === 'coordinates' ? describeLocation({ lat: read.lat, lng: read.lng, coordSystem: '' }).text : '';
        out.className = `location-read ${read.kind}`;
        out.textContent = read.kind === 'coordinates' ? `Read as coordinates: ${pair}. Say below which coordinate system they use.`
            : read.kind === 'address' ? 'Read as an address or place name. The map list and the activity will offer Apple Maps and Google Maps searches for exactly this text. It is not drawn by position, because the planner does not look addresses up.'
                : read.kind === 'error' ? error : 'Nothing entered yet. The place is still listed on the map, without a position or search links.';
        $('#coord-fields').hidden = read.kind !== 'coordinates';
    }
    function openPlace(id) {
        const t = state.snapshot.trip, p = t.places.find(x => x.id === id) || { id: crypto.randomUUID(), name: '' }, disabled = writable() ? '' : 'disabled';
        const refs = placeReferences(t, p.id), others = t.places.filter(x => x.id !== p.id);
        structureDialog('Place', id ? 'Edit place' : 'Add place', `<form id="place-form" data-id="${escape(p.id)}" data-new="${!id}" data-base="${id ? baseAttr(recordKey('place', id)) : '{}'}">${placeFields(p, '', disabled)}${insideField(t, id ? p : {}, '', disabled)}<fieldset class="inline-place"><legend>Location for the map <small>(optional)</small></legend><label>Street address, place name or GPS coordinates<input name="locationText" maxlength="500" autocomplete="off" autocapitalize="off" spellcheck="false" value="${escape(locationInput(p))}" data-initial="${escape(locationInput(p))}" placeholder="12 Lantern Row, Harbour Town" aria-describedby="location-help location-read" ${disabled}></label><p class="form-hint" id="location-help">Either is fine. Type an address or the place’s name as you would in a map app, or paste coordinates as latitude, longitude (for example 39.9163, 116.3972). It is kept exactly as you type it.</p><p class="location-read" id="location-read" role="status"></p><div id="coord-fields" hidden><label>Coordinate system<select name="coordSystem" ${disabled}><option value="">Choose…</option>${COORD_SYSTEMS.map(c => `<option value="${c}" ${p.coordSystem === c ? 'selected' : ''}>${escape(COORD_LABELS[c])}</option>`).join('')}</select><small>Numbers are stored exactly as entered and are never converted between systems. If you are not sure, choose Unknown: the place is listed but not positioned.</small></label><label>Where the coordinates came from<input name="coordSource" maxlength="300" value="${escape(p.coordSource || '')}" placeholder="e.g. Amap share link, checked 16 Nov" ${disabled}></label></div></fieldset><fieldset class="inline-place"><legend>Reviewed map links <small>(optional)</small></legend><p class="form-hint">Find the place in the map app, use Share, and paste the link here. Open it once to check it shows the right place.</p><label>Amap 高德 link<input name="amapUrl" type="url" maxlength="500" value="${escape(p.amapUrl || '')}" placeholder="https://surl.amap.com/…" ${disabled}></label><label>Apple Maps link<input name="appleMapsUrl" type="url" maxlength="500" value="${escape(p.appleMapsUrl || '')}" placeholder="https://maps.apple.com/…" ${disabled}></label>${appleSearchUrl(p) ? `<p class="form-hint"><a href="${escape(appleSearchUrl(p))}" target="_blank" rel="noopener noreferrer">Search Apple Maps by this place’s name ↗</a> An unreviewed search to help you find it; paste the link you checked above.</p>` : ''}<label class="check-label"><input type="checkbox" name="navReviewed" ${p.navReviewed ? 'checked' : ''} ${disabled}> I opened these links and they show the right place</label><p class="form-hint">Only reviewed links are offered on the map. Changing a link clears this tick.</p></fieldset>${id ? `<p class="form-hint">${refs.total ? `Used by ${escape(placeReferenceSummary(refs))}.` : 'Nothing uses this place yet.'}</p><div class="reassign" id="place-reassign" hidden><p><strong>This place is in use.</strong> Deleting it will not delete those plans. Choose where they should point instead.</p><label>Move ${escape(placeReferenceSummary(refs))} to<select name="reassignTo"><option value="">Choose…</option>${others.map(x => `<option value="${escape(x.id)}">${escape(placeLabel(x))}</option>`).join('')}<option value="__none">No place · “Location to confirm”</option></select></label><button type="button" class="secondary" id="place-delete-confirm">Move them and delete this place</button></div>` : ''}${formActions('place', !id, true)}</form>`, true);
        readLocation();
    }
    // Reading view of a stay, opened from the board. Editing is one step further, on purpose.
    function openStayView(id) {
        const t = state.snapshot.trip, s = t.stays.find(x => x.id === id);
        if (!s)
            return;
        const p = t.places.find(x => x.id === s.placeId), row = (label, value, attrs = '') => value ? `<dt>${label}</dt><dd ${attrs}>${value}</dd>` : '';
        const address = p ? [escape(p.address), p.localAddress ? `<span lang="zh-Hans">${escape(p.localAddress)}</span>` : ''].filter(Boolean).join('<br>') : '';
        $('#stay-view').innerHTML = `<div class="dialog-heading"><span class="eyebrow">Stay</span><button type="button" class="icon-button" data-close="stay-view" aria-label="Close stay details">×</button></div><h2 id="stay-view-title">${escape(p?.name || 'Location to confirm')}${p?.localName ? ` <span lang="zh-Hans">${escape(p.localName)}</span>` : ''}</h2><dl class="stay-facts">${row('Check-in', escape(dayName(s.start)))}${row('Check-out', escape(dayName(s.end)))}${row('Who', escape(names(s.participants)))}${row('Check-out time', escape(s.checkOutTime))}${row('Lodging', escape(s.lodging || s.name))}${row('Address', address)}${row('For the group', escape(s.groupInfo), 'class="stay-note"')}${row('Private notes', escape(s.note), 'class="stay-note"')}</dl>${s.lodging || s.note || s.groupInfo || address ? '' : '<p>No lodging details have been added yet.</p>'}<p class="form-hint">${s.showOnGuest ? 'This stay is shown on the guest link: the place, dates, who is staying, lodging line, check-out time and “For the group”. The address and the private notes are not.' : 'Private to people who sign in. None of this is on the guest link.'}</p><div class="dialog-actions"><button type="button" class="secondary" data-close="stay-view">Close</button><button type="button" class="primary" data-stay="${escape(s.id)}">Edit stay</button></div>`;
        $('#stay-view').showModal();
    }
    function openStay(id, back = false) {
        const t = state.snapshot.trip, s = t.stays.find(x => x.id === id) || { id: crypto.randomUUID(), name: '', placeId: t.places[0]?.id || '', start: state.day || t.start, end: '', lodging: '', note: '', participants: defaultParticipants(t) }, disabled = writable() ? '' : 'disabled';
        structureDialog('Stay', id ? 'Edit stay' : 'Add stay', `<form id="stay-form" data-id="${escape(s.id)}" data-new="${!id}" data-base="${id ? baseAttr(recordKey('stay', id)) : '{}'}"><label>Place<select name="placeId" required ${disabled}>${placeOptions(t, s.placeId, 'Choose a place…')}</select></label>${t.places.length ? '' : '<p class="form-hint">Add a place first (Back → Add place).</p>'}<div class="field-row"><label>Check-in<input type="date" name="start" value="${escape(s.start)}" required ${disabled}></label><label>Check-out<input type="date" name="end" value="${escape(s.end)}" required ${disabled}></label></div><p class="form-hint">The stay covers each night from check-in up to, not including, check-out. Changing these dates here does not move any activities${id ? '; use “Move this stay” below to bring flexible plans along' : ''}.</p><label>Lodging<input name="lodging" value="${escape(s.lodging)}" maxlength="500" ${disabled}><small>The line shown on the board, for example the name of the house.</small></label><label>For the group<textarea name="groupInfo" rows="4" maxlength="4000" placeholder="Address, laundry, what to bring, house rules…" ${disabled}>${escape(s.groupInfo || '')}</textarea><small>For everyone on the trip. This is the text guests see if the stay is shown on the guest link. Do not put door codes or passwords here.</small></label><label>Check-out time <small>(optional)</small><input name="checkOutTime" value="${escape(s.checkOutTime || '')}" maxlength="80" placeholder="e.g. by 10:00" ${disabled}></label><label>Short label <small>(optional)</small><input name="name" value="${escape(s.name)}" maxlength="160" ${disabled}></label><label>Private note<textarea name="note" rows="3" maxlength="4000" placeholder="Door codes, Wi-Fi password, who sleeps where…" ${disabled}>${escape(s.note)}</textarea><small>Only for people who sign in. Never on the guest link, whatever is ticked below.</small></label><label class="check-label"><input type="checkbox" name="showOnGuest" ${s.showOnGuest ? 'checked' : ''} ${state.isOwner ? disabled : 'disabled'}> Show this stay on the guest link</label><p class="form-hint">${state.isOwner ? '' : 'Only the organizer changes this setting. '}When ticked, guests see the place, the dates, who is staying, the lodging line, the check-out time and the “For the group” text. They never see the private note.</p>${attendanceFields({ participants: s.participants || [] }, t, !writable(), 'Who is staying')}${id ? `<fieldset class="inline-place" id="stay-move"><legend>Move this stay</legend><p class="form-hint">Shifts check-in and check-out together and offers to bring this group’s flexible plans at this place along. You see a preview first; nothing changes until you confirm. Plans with a set time and plans shared with other travelers are never moved.</p><label>New check-in day<input type="date" name="newStart" min="${escape(t.start)}" max="${escape(t.end)}" ${disabled}></label><button type="button" class="secondary" id="stay-move-preview" data-back="${back ? 1 : ''}" ${disabled}>Preview move</button></fieldset>` : ''}${formActions('stay', !id, back)}</form>`, back);
        updateAttendance($('#stay-form'));
    }
    function openLeg(id, back = false) {
        const t = state.snapshot.trip, l = t.legs.find(x => x.id === id) || { id: crypto.randomUUID(), title: '', date: state.day || t.start, arrivalDate: '', time: '', arrivalTime: '', mode: 'Train', participants: defaultParticipants(t), notes: '', from: '', to: '' }, disabled = writable() ? '' : 'disabled';
        const modes = LEG_MODES.includes(l.mode) || !l.mode ? LEG_MODES : [l.mode, ...LEG_MODES];
        structureDialog('Journey', id ? 'Edit journey' : 'Add journey', `<form id="leg-form" data-id="${escape(l.id)}" data-new="${!id}" data-base="${id ? baseAttr(recordKey('journey', id)) : '{}'}"><label>Title<input name="title" value="${escape(l.title)}" maxlength="160" required placeholder="e.g. Morning train to the coast" ${disabled}></label><div class="field-row"><label>Mode<select name="mode" ${disabled}>${modes.map(m => `<option ${m === l.mode ? 'selected' : ''}>${escape(m)}</option>`).join('')}</select></label><label>Departure day<select name="date" ${disabled}>${days(t).map(d => `<option value="${d}" ${l.date === d ? 'selected' : ''}>${dateLabel(d, { weekday: 'short', month: 'short', day: 'numeric' })}</option>`).join('')}</select></label></div><div class="field-row"><label>From<select name="from" ${disabled}>${placeOptions(t, l.from, 'Start to confirm')}</select></label><label>To<select name="to" ${disabled}>${placeOptions(t, l.to, 'End to confirm')}</select></label></div><div class="field-row"><label>Departure time<input name="time" value="${escape(l.time)}" maxlength="80" ${disabled}></label><label>Arrival time<input name="arrivalTime" value="${escape(l.arrivalTime)}" maxlength="80" ${disabled}></label></div><label>Arrival day <small>(only if different, e.g. overnight)</small><input type="date" name="arrivalDate" value="${escape(l.arrivalDate && l.arrivalDate !== l.date ? l.arrivalDate : '')}" min="${escape(t.start)}" ${disabled}></label><label>Private notes<textarea name="notes" rows="3" maxlength="4000" ${disabled}>${escape(l.notes)}</textarea><small>Journeys are not shown on the guest link.</small></label>${attendanceFields({ participants: l.participants || [] }, t, !writable(), 'Who is travelling')}${formActions('leg', !id, back)}</form>`, back);
        updateAttendance($('#leg-form'));
    }
    // ---- Stay move: preview first, apply only what was confirmed ----
    function openStayMove(stayId, days, back) {
        const t = state.snapshot.trip, p = previewStayMove(t, stayId, days), off = writable() ? '' : 'disabled';
        const list = (rows, line) => `<ul class="move-list">${rows.map(r => `<li>${line(r)}</li>`).join('')}</ul>`;
        const outside = r => r.outside ? ' <span class="move-flag">⚠ now outside the moved stay</span>' : '';
        const section = (cls, title, note, body) => `<section class="move-group ${cls}"><h3>${title}</h3><p class="form-hint">${note}</p>${body}</section>`;
        structureDialog('Stay move · preview', `Move the stay at ${escape(placeName(p.stay.placeId))}?`, `<form id="stay-move-form" data-id="${escape(stayId)}" data-days="${days}" data-from-list="${back ? 1 : ''}">
<p class="move-summary"><strong>${escape(names(p.stay.participants))}</strong><br>${escape(dayName(p.stay.from.start))} → ${escape(dayName(p.stay.from.end))} <span class="was">currently</span><br>${escape(dayName(p.stay.to.start))} → ${escape(dayName(p.stay.to.end))} <strong>after the move (${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ${days > 0 ? 'later' : 'earlier'})</strong></p>
<p class="move-notice" role="status"><strong>Nothing has been changed yet.</strong> Only the stay and the activities ticked below will move, and only when you choose Confirm move. Everyone else's stays and plans are left alone.</p>
${section('shift', `Will move with the stay (${p.shift.length})`, 'Plans at this place without a set time (“That day” and “Any day”) whose travelers are all on this stay. Untick any that should keep their day.', p.shift.length ? list(p.shift, r => `<label class="check-label"><input type="checkbox" name="shift" value="${escape(r.id)}" checked ${off}><span>${escape(r.title)}<small>${escape(dayName(r.date))} → ${escape(dayName(r.to))}</small></span></label>`) : '<p>No flexible activities to move.</p>')}
${p.fixed.length ? section('fixed', `■ Set times · stay where they are (${p.fixed.length})`, 'Plans with a set time are never moved automatically. Rebook, or switch one to “That day” and move it yourself.', list(p.fixed, r => `${escape(r.title)}<small>${escape(dayName(r.date))}</small>${outside(r)}`)) : ''}
${p.mixed.length ? section('mixed', `Shared with travelers who are not moving · stay where they are (${p.mixed.length})`, 'These include someone who is not on this stay, so moving them would change another group’s day. Decide each one by hand.', list(p.mixed, r => `${escape(r.title)}<small>${escape(dayName(r.date))} · ${escape(names(t.activities.find(a => a.id === r.id).participants))}</small>${outside(r)}`)) : ''}
${p.blocked.length ? section('mixed', `Cannot move · would fall outside the trip (${p.blocked.length})`, 'Left where they are. Change the trip dates or move them by hand.', list(p.blocked, r => `${escape(r.title)}<small>${escape(dayName(r.date))}</small>`)) : ''}
${p.journeys.length ? section('review', `Journeys to review (${p.journeys.length})`, 'Travel around this stay is not changed. Check whether it still fits.', list(p.journeys, r => `${escape(r.title)}<small>${escape(dayName(r.date))}</small>`)) : ''}
${p.overlaps.length ? section('review', `⚠ Overlaps another stay (${p.overlaps.length})`, 'After the move, some of the same travelers would be booked in two places on the same night. The move is still allowed.', list(p.overlaps, r => `${escape(placeName(r.placeId))}<small>${escape(dayName(r.start))} → ${escape(dayName(r.end))}</small>`)) : ''}
<p id="structure-message" role="alert"></p><div class="dialog-actions"><button type="button" class="secondary" id="structure-reload" hidden>Load latest plan</button><button type="button" class="secondary" data-stay="${escape(stayId)}" ${back ? 'data-from-list="1"' : ''}>Cancel · change nothing</button><button class="primary" id="structure-save" ${off}>Confirm move</button></div></form>`, back);
    }
    async function confirmStayMove(form) {
        const stayId = form.dataset.id, ids = [...form.querySelectorAll('[name=shift]:checked')].map(x => x.value);
        await saveStructure({ action: 'stay-move', stayId, days: Number(form.dataset.days), shiftActivityIds: ids, base: base(recordKey('stay', stayId), ...ids.map(id => recordKey('activity', id))) }, `Stay moved${ids.length ? ` with ${ids.length} flexible ${ids.length === 1 ? 'activity' : 'activities'}` : '; no activities were moved'}. Undo is available in History.`);
    }
    const checked = form => [...form.querySelectorAll('[name=participants]:checked')].filter(x => !x.disabled).map(x => x.value);
    // The map location is sent only when it was edited, so opening and saving an older place (stored
    // as two numbers) changes nothing. The system is sent only for coordinates; an address has none.
    function placeLocationDraft(form) {
        const box = form.elements.locationText, typed = box.value.trim();
        let kind = 'error';
        try {
            kind = parseLocation(typed).kind;
        }
        catch { /* the server explains what is wrong */ }
        return { ...(typed === box.dataset.initial ? {} : { locationText: typed }), coordSystem: kind === 'address' || kind === 'empty' ? '' : form.elements.coordSystem.value };
    }
    function structureDraft(form) {
        const v = name => form.elements[name].value;
        if (form.id === 'place-form')
            return { name: v('name'), localName: v('localName'), address: v('address'), localAddress: v('localAddress'), parentId: v('parentId') || null, ...placeLocationDraft(form), coordSource: v('coordSource'), amapUrl: v('amapUrl'), appleMapsUrl: v('appleMapsUrl'), navReviewed: form.elements.navReviewed.checked };
        if (form.id === 'stay-form')
            return { name: v('name'), placeId: v('placeId') || null, start: v('start'), end: v('end'), lodging: v('lodging'), note: v('note'), groupInfo: v('groupInfo'), checkOutTime: v('checkOutTime'), showOnGuest: form.elements.showOnGuest.checked, participants: checked(form) };
        return { title: v('title'), mode: v('mode'), date: v('date'), arrivalDate: v('arrivalDate') || v('date'), time: v('time'), arrivalTime: v('arrivalTime'), from: v('from') || null, to: v('to') || null, notes: v('notes'), participants: checked(form) };
    }
    async function saveStructure(change, done) {
        const back = $('#structure-dialog').dataset.back === 'list';
        state.busy = true;
        status();
        try {
            const result = await request(endpoint('/api/trip'), 'PATCH', change);
            state.snapshot = result.snapshot;
            remember();
            state.busy = false;
            state.message = `${done} Saved for everyone viewing this trip.`;
            render();
            if (back)
                openStructure(done);
        }
        catch (e) {
            if ($('#structure-message')) {
                $('#structure-message').textContent = e.message;
                if ($('#structure-reload'))
                    $('#structure-reload').hidden = e.status !== 409;
            }
            else
                throw e;
        }
        finally {
            state.busy = false;
            status();
        }
    }
    async function submitStructure(form) {
        const kind = form.id.replace('-form', ''), noun = kind === 'leg' ? 'journey' : kind, record = structureDraft(form), base = formBase(form);
        await saveStructure(form.dataset.new === 'true' ? { action: `${kind}-add`, base, [kind]: { ...record, id: form.dataset.id } } : { action: `${kind}-edit`, base, [`${kind}Id`]: form.dataset.id, patch: record }, `${noun[0].toUpperCase()}${noun.slice(1)} saved.`);
    }
    async function deleteStructure(kind, extra = {}) {
        const form = $(`#${kind}-form`);
        await saveStructure({ action: `${kind}-delete`, base: formBase(form), [`${kind}Id`]: form.dataset.id, ...extra }, `${kind === 'leg' ? 'Journey' : kind === 'stay' ? 'Stay' : 'Place'} deleted. Undo is available in History.`);
    }
    // Card pictures. The browser shrinks the photo first (long side 800 px, then smaller if needed), so a
    // phone photo of several megabytes becomes a few tens of kilobytes before anything is sent.
    async function shrinkPicture(file) {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        for (const [side, quality] of [[800, .72], [640, .62], [480, .55]]) {
            const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const data = canvas.toDataURL('image/jpeg', quality);
            try {
                parseImageDataUrl(data);
                return data;
            }
            catch { }
        }
        throw new Error('This picture is still too large after shrinking. Try a different one.');
    }
    async function choosePicture(input) {
        const form = $('#edit-form'), file = input.files?.[0], say = text => { $('#picture-message').textContent = text; };
        if (!file)
            return;
        say('Shrinking and saving the picture…');
        try {
            const data = await shrinkPicture(file);
            const result = await request(endpoint('/api/image'), 'POST', { data });
            form.elements.imageId.value = result.imageId;
            $('#picture-preview').src = data;
            $('#picture-preview').hidden = false;
            $('#picture-remove').hidden = false;
            say(`Picture ready (${Math.round(result.bytes / 1000)} KB). Choose Save to put it on the card.`);
        }
        catch (e) {
            say(e.message === 'The source image could not be decoded.' || e.name === 'InvalidStateError' ? 'That file could not be read as a picture.' : e.message);
        }
        input.value = '';
    }
    // Activity form: add a traveler without leaving the form. What is already ticked stays ticked.
    async function saveInlinePerson() {
        const form = $('#edit-form'), name = form.elements.newPersonName.value.trim();
        if (!name) {
            $('#person-inline-message').textContent = 'Give the person a display name.';
            form.elements.newPersonName.focus();
            return;
        }
        const person = { id: crypto.randomUUID(), name, familyId: form.elements.newPersonGroup.value || null, showOnGuest: false };
        const ticked = [...form.querySelectorAll('[name=participants]:checked')].filter(x => !x.disabled).map(x => x.value);
        try {
            const result = await request(endpoint('/api/trip'), 'PATCH', { action: 'traveler', base: {}, person });
            state.snapshot = result.snapshot;
            remember();
            $('#attendance-slot').innerHTML = attendanceFields({ participants: [...ticked, person.id] }, state.snapshot.trip, false, 'Who', true);
            updateAttendance();
            $('#edit-message').textContent = `“${name}” was added to this trip and ticked. Your activity is not saved yet.`;
            status();
            form.querySelector(`[name=participants][value="${CSS.escape(person.id)}"]`)?.focus();
        }
        catch (e) {
            $('#person-inline-message').textContent = e.message;
        }
    }
    // Activity form: add a place without leaving the form or losing the draft.
    async function saveInlinePlace() {
        const form = $('#edit-form'), name = form.elements.newPlacename.value.trim();
        if (!name) {
            $('#place-inline-message').textContent = 'Give the new place a name.';
            form.elements.newPlacename.focus();
            return;
        }
        const place = { id: crypto.randomUUID(), name, localName: form.elements.newPlacelocalName.value, address: form.elements.newPlaceaddress.value, localAddress: form.elements.newPlacelocalAddress.value, parentId: form.elements.newPlaceparentId.value || null };
        try {
            const result = await request(endpoint('/api/trip'), 'PATCH', { action: 'place-add', base: {}, place });
            state.snapshot = result.snapshot;
            remember();
            // The draft stays as typed, and still relies on the activity as it was when the form opened.
            const select = form.elements.placeId, saved = result.snapshot.trip.places.find(p => p.id === place.id);
            select.querySelector('[value="__new"]').insertAdjacentHTML('beforebegin', `<option value="${escape(saved.id)}">${escape(placeChoice(orderedPlaces(result.snapshot.trip).find(p => p.id === saved.id)))}</option>`);
            select.value = saved.id;
            $('#place-inline').hidden = true;
            for (const key of ['newPlacename', 'newPlacelocalName', 'newPlaceaddress', 'newPlacelocalAddress'])
                form.elements[key].value = '';
            $('#edit-message').textContent = `“${saved.name}” was added to this trip and selected. Your activity is not saved yet.`;
            status();
            select.focus();
        }
        catch (e) {
            $('#place-inline-message').textContent = e.message;
        }
    }
    function editPerson(id) {
        const form = $('#traveler-form');
        const p = peopleOf(state.snapshot.trip).find(p => p.id === id);
        form.reset();
        form.dataset.id = p?.id || '';
        form.dataset.base = JSON.stringify(p ? base(recordKey('traveler', p.id)) : {});
        form.elements.name.value = p?.name || '';
        form.elements.familyId.value = p?.familyId || '';
        form.elements.showOnGuest.checked = p?.showOnGuest === true;
        $('#traveler-form-title').textContent = p ? 'Edit traveler' : 'Add traveler';
        form.elements.name.focus();
    }
    function editFamily(id) {
        const form = $('#family-form');
        const g = state.snapshot.trip.families.find(g => g.id === id);
        form.reset();
        form.dataset.id = g?.id || '';
        form.dataset.base = JSON.stringify(g ? base(recordKey('group', g.id)) : {});
        form.elements.name.value = g?.name || '';
        form.elements.color.value = g?.color || 'green';
        $('#family-form-title').textContent = g ? 'Edit family / group' : 'Add family / group';
        form.elements.name.focus();
    }
    function rosterDraft() {
        return { traveler: { id: $('#traveler-form').dataset.id || '', name: $('#traveler-form').elements.name.value, familyId: $('#traveler-form').elements.familyId.value, showOnGuest: $('#traveler-form').elements.showOnGuest.checked }, family: { id: $('#family-form').dataset.id || '', name: $('#family-form').elements.name.value, color: $('#family-form').elements.color.value } };
    }
    async function saveRoster(form) {
        const person = form.id === 'traveler-form';
        const values = rosterDraft();
        const record = person ? values.traveler : values.family;
        record.id ||= crypto.randomUUID();
        if (person)
            record.familyId ||= null;
        state.busy = true;
        status();
        try {
            const result = await request(endpoint('/api/trip'), 'PATCH', { action: person ? 'traveler' : 'family', base: formBase(form), [person ? 'person' : 'family']: record });
            state.snapshot = result.snapshot;
            remember();
            state.busy = false;
            render();
            openRoster(person ? (record.familyId || '') : record.id);
            $('#roster-message').textContent = person ? 'Traveler saved. Editing permissions have not changed.' : 'Group saved. You can now add travelers to it.';
            if (person)
                $('#traveler-form').elements.name.focus();
        }
        catch (e) {
            $('#roster-message').textContent = e.message;
            $('#roster-copy').hidden = false;
            $('#roster-reload').hidden = false;
        }
        finally {
            state.busy = false;
            status();
        }
    }
    // Which of the three plain choices an activity is. Anything else (a subset of people, or everyone but neither
    // optional nor whole-group) is "some", where the people and the Optional tick are set by hand.
    function kindOf(a, t) {
        const all = defaultParticipants(t), everyone = a.participants.length === all.length && all.every(id => a.participants.includes(id));
        return everyone && a.highlight && !a.optional ? 'whole' : everyone && a.optional && !a.highlight ? 'open' : 'some';
    }
    // Quick add first: what, when, and who. Place, guest text, notes and links are under "More details".
    function formData(a) {
        const t = state.snapshot.trip, disabled = !writable(), off = disabled ? 'disabled' : '', kind = kindOf(a, t);
        const choice = (value, label, hint) => `<label class="check-label kind-option"><input type="radio" name="kind" value="${value}" ${kind === value ? 'checked' : ''} ${off}><span>${label}<small>${hint}</small></span></label>`;
        const hasMore = !!(a.address || a.guestNotes || a.guestLocation || a.notes || a.imageId || (a.links || []).length);
        return `<label>Activity<input name="title" value="${escape(a.title)}" maxlength="160" required ${off}></label><div class="field-row"><label>Day<select name="date" ${off}><option value="">Unscheduled idea</option>${days(t).map(d => `<option value="${d}" ${a.date === d ? 'selected' : ''}>${dateLabel(d, { weekday: 'short', month: 'short', day: 'numeric' })}</option>`).join('')}</select></label><label>Time or part of day<input name="time" value="${escape(a.time)}" maxlength="80" placeholder="e.g. after lunch, 17:00" ${off}></label></div><label>How firm is the timing?<select name="timing" ${off}>${TIMINGS.map(v => `<option value="${v}" ${timingOf(a) === v ? 'selected' : ''}>${TIMING_LABELS[v]}${v === 'set' ? ' · protected from moves' : v === 'day' ? ' · time can stay loose' : ''}</option>`).join('')}</select><small id="timing-hint"></small></label>
<fieldset class="kind-choice"><legend>What kind of plan is this?</legend>${choice('open', 'Open to everyone · optional', 'Anyone can join; nobody has to.')}${choice('whole', 'Whole-group activity', 'Everyone together. Shown with a pink band.')}${choice('some', 'For some people, or set it yourself', 'Choose who it is for and whether it is optional.')}</fieldset>
<div id="some-panel" ${kind === 'some' ? '' : 'hidden'}><label class="check-label"><input type="checkbox" name="optional" ${a.optional ? 'checked' : ''} ${off}> Optional · offered as a choice, not a commitment</label><div id="attendance-slot">${attendanceFields(a, t, disabled, 'Who', true)}</div></div>
<details class="more-details" id="more-details" ${hasMore || state.moreOpen ? 'open' : ''}><summary>More details <small>place, meeting point, notes, links</small></summary><label>Place<select name="placeId" ${off}><option value="">Location to confirm</option>${orderedPlaces(t).map(p => `<option value="${escape(p.id)}" ${a.placeId === p.id ? 'selected' : ''}>${escape(placeChoice(p))}</option>`).join('')}${disabled ? '' : '<option value="__new">＋ Add new place…</option>'}</select></label><fieldset class="inline-place" id="place-inline" hidden><legend>New place</legend>${placeFields({}, 'newPlace', '')}${insideField(t, {}, 'newPlace', '')}<p id="place-inline-message" role="alert"></p><button type="button" class="secondary" id="place-inline-save">Add this place</button><p class="form-hint">Adds the place to the trip straight away. Your activity is saved separately with the Save button below.</p></fieldset><label>Guest meeting point<input name="guestLocation" maxlength="500" value="${escape(a.guestLocation)}" ${off}><small>Shown on the card as “Meet · …”, and on the guest link.</small></label><label>Guest description<textarea name="guestNotes" rows="3" maxlength="4000" data-grow ${off}>${escape(a.guestNotes)}</textarea><small>Visible if you enable this event's guest link.</small></label><label>Address <small>(private)</small><input name="address" maxlength="500" value="${escape(a.address || '')}" ${off}><small>For this activity only. Never shown on the guest link; use Guest meeting point for that.</small></label><label>Private planning notes<textarea name="notes" rows="4" maxlength="4000" data-grow ${off}>${escape(a.notes)}</textarea><small>Excluded from the guest link.</small></label>${(a.links || []).length ? `<ul class="link-list" aria-label="Saved links">${a.links.map(l => `<li><a href="${escape(l.url)}" target="_blank" rel="noopener noreferrer">${escape(l.label || l.url)} ↗</a></li>`).join('')}</ul>` : ''}<label>Links <small>(private, optional)</small><textarea name="links" rows="2" maxlength="6000" spellcheck="false" placeholder="Tickets https://example.com/…" ${off}>${escape(formatLinks(a.links))}</textarea><small>One per line: an optional label, then the web address. Excluded from the guest link.</small></label><div class="picture-field"><span class="picture-title">Picture <small>(optional)</small></span><input type="hidden" name="imageId" value="${escape(a.imageId || '')}"><img id="picture-preview" alt="Picture for this activity" ${a.imageId ? `src="${escape(imageUrl(t.id, a.imageId))}"` : 'hidden'}><div class="tools">${disabled ? '' : '<label class="secondary file-label">Choose a picture<input type="file" id="picture-file" accept="image/jpeg,image/png,image/webp,image/*"></label>'}<button type="button" class="text-button" id="picture-remove" ${a.imageId && !disabled ? '' : 'hidden'}>Remove picture</button></div><p id="picture-message" role="status" aria-live="polite"></p><small>Shown at the top of the card. The picture is made smaller on this device before it is saved. It is also shown on the guest link, if one is enabled, so choose pictures you are happy for guests to see and pass on.</small></div></details>`;
    }
    function openEditor(id, preset = {}) { returnTo = null; const a = state.snapshot.trip.activities.find(a => a.id === id) || { id: crypto.randomUUID(), date: 'date' in preset ? preset.date : state.day, time: '', title: '', placeId: preset.placeId || state.snapshot.trip.places[0]?.id || null, participants: defaultParticipants(state.snapshot.trip), notes: '', guestNotes: '', guestLocation: '', fixed: false, optional: state.snapshot.trip.kind === 'event', order: state.snapshot.trip.activities.length, sourceKind: 'entered' }; const form = $('#edit-form'); form.dataset.id = a.id; form.dataset.new = String(!id); form.dataset.lastPlace = a.placeId || ''; form.dataset.before = !id && preset.beforeId ? preset.beforeId : ''; form.dataset.beforeDate = preset.date || ''; form.dataset.kind = kindOf(a, state.snapshot.trip); form.dataset.wasSet = String(!!id && a.fixed === true); form.dataset.timingTouched = ''; form.dataset.timingBefore = ''; form.dataset.timingSuggested = ''; form.dataset.highlight = String(a.highlight === true); form.dataset.base = JSON.stringify(id ? base(recordKey('activity', a.id)) : {}); $('#editor-fields').innerHTML = formData(a); $('#delete').hidden = !id || !writable(); $('#save').disabled = !writable(); $('#copy-draft').hidden = true; $('#reload-after-conflict').hidden = true; $('#edit-message').textContent = !writable() ? 'Downloaded reading copy. Connect and refresh before editing.' : a.sourceKind === 'tentative' ? 'Tentative source plan. Times, hosts, and bookings need review.' : a.sourceKind === 'synthetic' ? 'This is an example, not a real plan. Edit it to make it yours, or delete it.' : ''; lockTiming(); updateAttendance(); $('#editor').showModal(); growTextareas(); showLastEdits(); }
    // Timing level and the fields it governs. No day means "any day" (it lives in Ideas). A plan saved with a set
    // time keeps its day and time locked until another level is chosen, which is what the server enforces too.
    const CLOCK = /\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s?(am|pm)\b/i;
    function lockTiming() {
        const f = $('#edit-form');
        if (!f?.elements.timing)
            return;
        const timing = f.elements.timing, noDay = !f.elements.date.value;
        if (noDay) {
            if (timing.value !== 'anytime') {
                f.dataset.timingBefore = timing.value;
                timing.value = 'anytime';
            }
        }
        else if (f.dataset.timingBefore) {
            timing.value = f.dataset.timingBefore;
            f.dataset.timingBefore = '';
        }
        timing.disabled = !writable() || noDay;
        const locked = f.dataset.wasSet === 'true' && timing.value === 'set';
        f.elements.date.disabled = !writable() || locked;
        f.elements.time.disabled = !writable() || locked;
        $('#timing-hint').textContent = noDay ? 'No day yet, so it stays in Ideas.' : locked ? 'Day and time are protected. Choose “That day” to change them.' : timing.value === 'set' ? 'It will not move when cards are dragged or a stay is moved.' : timing.value === 'anytime' ? 'Pencilled in on this day; it can go on any day of the stay.' : '';
    }
    // Typing a clock time suggests "Set time", until the person picks a level themselves.
    function suggestTiming() {
        const f = $('#edit-form');
        if (!f?.elements.timing || f.dataset.timingTouched === 'true' || f.dataset.wasSet === 'true' || !f.elements.date.value)
            return;
        const clock = CLOCK.test(f.elements.time.value);
        if (clock && f.elements.timing.value !== 'set') {
            f.dataset.timingSuggested = f.elements.timing.value;
            f.elements.timing.value = 'set';
        }
        else if (!clock && f.dataset.timingSuggested) {
            f.elements.timing.value = f.dataset.timingSuggested;
            f.dataset.timingSuggested = '';
        }
        lockTiming();
    }
    function draft() {
        const f = $('#edit-form'), kind = f.elements.kind.value, some = kind === 'some';
        // "Open" and "whole-group" always mean everyone; "some" keeps what is ticked, and keeps an existing highlight only if it was already a hand-set plan.
        return { title: f.elements.title.value, date: f.elements.date.value || null, time: f.elements.time.value, placeId: f.elements.placeId.value || null, address: f.elements.address.value, links: parseLinks(f.elements.links.value), notes: f.elements.notes.value, guestNotes: f.elements.guestNotes.value, guestLocation: f.elements.guestLocation.value, imageId: f.elements.imageId.value, timing: f.elements.date.value ? f.elements.timing.value : 'anytime', fixed: !!f.elements.date.value && f.elements.timing.value === 'set', optional: some ? f.elements.optional.checked : kind === 'open', highlight: some ? f.dataset.kind === 'some' && f.dataset.highlight === 'true' : kind === 'whole', participants: some ? [...f.querySelectorAll('[name=participants]:checked')].filter(x => !x.disabled).map(x => x.value) : defaultParticipants(state.snapshot.trip) };
    }
    async function createTrip(data) { const r = await request('/api/trips', 'POST', data); state.selected = r.snapshot.trip.id; state.filter = 'all'; state.day = null; history.replaceState(null, '', `/?trip=${state.selected}`); await load(); }
    // A full backup is checked against its checksum first; then it restores as a separate new trip.
    async function importable(parsed) { return isSnapshot(parsed) ? restoreFromSnapshot(parsed) : parsed.trip || parsed; }
    function download(contents, mime, filename) { const url = URL.createObjectURL(new Blob([contents], { type: mime })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    async function sharing() { const data = await request(endpoint('/api/share')); state.shareRevision = data.shareRevision; state.sharePreview = data.preview; $('#share-body').innerHTML = `<p>${data.enabled ? 'A guest link is enabled. Replacing it disables the previous link.' : 'No guest link is enabled.'}</p><button class="primary" id="share-rotate">${data.enabled ? 'Replace guest link' : 'Enable guest link'}</button>${data.enabled ? '<button class="secondary" id="share-revoke">Disable guest link</button>' : ''}<details><summary>Preview exactly what guests will see</summary><div class="guest-preview">${board(data.preview, { day: state.day, guest: true })}<h3>Ideas · not scheduled yet</h3>${ideaCards(data.preview.activities.filter(a => !a.date), data.preview, true) || '<p>No ideas to show.</p>'}</div></details>`; for (const img of document.querySelectorAll('.guest-preview img.card-image[data-image]')) { img.src = imageUrl(state.selected, img.dataset.image); img.hidden = false; } $('#share-error').textContent = ''; $('#share-dialog').showModal(); }
    // The Manage menu closes after a choice, on a click elsewhere, and on Escape.
    document.addEventListener('click', event => {
        // A marker on the map drawing goes to its entry in the list below.
        if (followPin(document, event))
            return;
        // "See this change" opens History at that entry. A link meant for a new tab, or a modified click, is left to the browser.
        const change = event.target.closest?.('a[data-history-change]');
        if (change && !change.target && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
            event.preventDefault();
            openHistoryAt(Number(change.dataset.historyChange)).catch(e => { state.message = e.message; status(); });
            return;
        }
        const menu = $('#manage-menu');
        if (menu?.open && !event.target.closest('#manage-menu summary') && !event.target.closest('#manage-menu .file-label'))
            menu.open = false;
    });
    document.addEventListener('keydown', event => {
        const menu = $('#manage-menu');
        if (event.key === 'Escape' && menu?.open && !document.querySelector('dialog[open]')) {
            menu.open = false;
            menu.querySelector('summary').focus();
        }
    });
    document.addEventListener('click', async (event) => {
        const b = event.target.closest('button');
        if (!b)
            return;
        try {
            if (b.dataset.close)
                $(`#${b.dataset.close}`).close();
            if (b.dataset.detail)
                openView(b.dataset.detail, { preview: !!b.closest('.guest-preview') });
            // The one way from the view into the editor. Delete and the other destructive actions stay in the editor.
            if (b.dataset.editActivity) {
                const id = b.dataset.editActivity;
                viewing = null;
                $(`#${VIEW_ID}`).close();
                openEditor(id);
                returnTo = id;
            }
            if (b.id === 'close-editor')
                $('#editor').close();
            if (b.id === 'add')
                openEditor();
            // Add where you are: the day (and its stay's place) or the ideas list is already filled in.
            if (b.dataset.addDate !== undefined)
                openEditor(null, { date: b.dataset.addDate || null, placeId: b.dataset.addPlace || undefined, beforeId: b.dataset.before || '' });
            if (b.dataset.stayView)
                openStayView(b.dataset.stayView);
            if (b.id === 'refresh')
                await load();
            if (b.id === 'paste-import') {
                $('#import-json').value = '';
                $('#import-error').textContent = '';
                $('#import-dialog').showModal();
            }
            if (b.dataset.mapView) {
                state.mapView = b.dataset.mapView;
                persist();
                $('#maps').outerHTML = mapsSection(state.snapshot.trip);
                document.querySelector(`[data-map-view="${state.mapView}"]`)?.focus();
            }
            if (b.id === 'ideas-toggle') {
                state.ideasClosed = !state.ideasClosed;
                persist();
                $('.board-wrap')?.classList.toggle('ideas-closed', state.ideasClosed);
                b.setAttribute('aria-expanded', String(!state.ideasClosed));
                b.textContent = ideasToggleLabel(state.snapshot.trip);
                fitColumns($('#itinerary'));
            }
            if (b.id === 'density') {
                state.denseChoice = !state.dense;
                persist();
                render();
                $('#density')?.focus();
            }
            if (b.id === 'story-toggle') {
                state.compactChoice = !state.compact;
                persist();
                render();
                $('#story-toggle')?.focus();
            }
            if (b.dataset.day && allDaysView())
                jumpToDay(b.dataset.day);
            else if (b.dataset.day) {
                state.day = b.dataset.day;
                persist();
                render();
                document.querySelector(`.medallion[data-day="${state.day}"]`)?.focus();
            }
            if (b.dataset.dayMode) {
                state.allDays = !state.allDays;
                persist();
                render();
                if (state.allDays)
                    jumpToDay(state.day);
                document.querySelector('.all-stop')?.focus();
            }
            if (b.id === 'new-trip') {
                $('#create-form').reset();
                $('#create-form').dataset.edit = '';
                $('#trip-delete').hidden = true;
                $('#create-submit').textContent = 'Create';
                $('#create-error').textContent = '';
                $('#create-title').textContent = 'New trip or event';
                $('#create-dialog').showModal();
            }
            if (b.id === 'example')
                await createTrip({ template: 'thanksgiving' });
            if (b.id === 'recover')
                await createTrip({ template: 'legacy' });
            if (b.id === 'travelers')
                openRoster();
            if (b.dataset.person)
                editPerson(b.dataset.person);
            if (b.dataset.familyEdit)
                editFamily(b.dataset.familyEdit);
            if (b.id === 'roster-new')
                editPerson();
            if (b.id === 'family-new')
                editFamily();
            if (b.id === 'roster-reload' && confirm('Copy your unsaved roster draft first. Load the latest plan and close this form?')) {
                $('#roster-dialog').close();
                await load();
            }
            if (b.id === 'roster-copy') {
                await navigator.clipboard.writeText(JSON.stringify(rosterDraft(), null, 2));
                $('#roster-message').textContent = 'Roster draft copied.';
            }
            if (b.id === 'settings') {
                const t = state.snapshot.trip;
                const f = $('#create-form');
                for (const k of ['title', 'subtitle', 'start', 'end', 'timezone', 'kind'])
                    f.elements[k].value = t[k];
                f.dataset.edit = 'true';
                f.dataset.base = JSON.stringify(base('trip'));
                $('#trip-delete').hidden = !state.isOwner;
                $('#create-submit').textContent = 'Save';
                $('#create-error').textContent = '';
                $('#create-title').textContent = 'Trip details';
                $('#create-dialog').showModal();
            }
            if (b.id === 'structure' || b.dataset.structureBack)
                openStructure();
            if (b.id === 'structure-add-place')
                openPlace();
            if (b.id === 'structure-add-stay')
                openStay(null, true);
            if (b.id === 'structure-add-leg')
                openLeg(null, true);
            if (b.dataset.placeEdit)
                openPlace(b.dataset.placeEdit);
            if (b.dataset.stay) {
                if ($('#stay-view').open)
                    $('#stay-view').close();
                openStay(b.dataset.stay, !!b.dataset.fromList);
            }
            if (b.dataset.leg)
                openLeg(b.dataset.leg, !!b.dataset.fromList);
            if (b.id === 'stay-move-preview') {
                const form = $('#stay-form'), stay = state.snapshot.trip.stays.find(x => x.id === form.dataset.id), to = form.elements.newStart.value;
                try {
                    if (!to)
                        throw new Error('Choose the new check-in day first.');
                    openStayMove(stay.id, daysBetween(stay.start, to), !!b.dataset.back);
                }
                catch (e) {
                    $('#structure-message').textContent = e.message;
                }
            }
            if (b.id === 'place-inline-save')
                await saveInlinePlace();
            if (b.id === 'picture-remove') {
                $('#edit-form').elements.imageId.value = '';
                $('#picture-preview').hidden = true;
                b.hidden = true;
                $('#picture-message').textContent = 'Picture removed. Choose Save to take it off the card.';
            }
            if (b.id === 'person-inline-open') {
                $('#person-inline').hidden = false;
                $('#edit-form').elements.newPersonName.focus();
            }
            if (b.id === 'person-inline-save')
                await saveInlinePerson();
            if ((b.id === 'stay-delete' || b.id === 'leg-delete') && confirm(`Delete this ${b.id === 'leg-delete' ? 'journey' : 'stay'}? Activities are not affected. You can undo this from History.`))
                await deleteStructure(b.id.replace('-delete', ''));
            if (b.id === 'place-delete') {
                if (placeReferences(state.snapshot.trip, $('#place-form').dataset.id).total) {
                    $('#place-reassign').hidden = false;
                    $('#place-form').elements.reassignTo.focus();
                }
                else if (confirm('Delete this place? Nothing uses it. You can undo this from History.'))
                    await deleteStructure('place');
            }
            if (b.id === 'place-delete-confirm') {
                const to = $('#place-form').elements.reassignTo.value;
                if (!to)
                    $('#structure-message').textContent = 'Choose where to move the plans that use this place.';
                else
                    await deleteStructure('place', { reassignTo: to === '__none' ? null : to });
            }
            if (b.id === 'structure-reload' && confirm('Your unsaved changes in this form will be lost. Load the latest plan?')) {
                $('#structure-dialog').close();
                await load();
            }
            if (b.id === 'history')
                await openHistory();
            if (b.id === 'full-backup') {
                const backup = await request(endpoint('/api/backup'));
                download(JSON.stringify(backup, null, 2), 'application/json', `waypoint-backup-${backup.takenAt.slice(0, 10)}-rev${backup.revision}.json`);
                $('#history-message').textContent = `Full backup saved: revision ${backup.revision} with ${backup.changes.length} history entries. Keep it somewhere private. To restore, use Import JSON; it becomes a separate new trip.`;
            }
            if (b.dataset.undo)
                await undo(Number(b.dataset.undo));
            if (b.dataset.removePerson)
                await removeFromRoster('person', b.dataset.removePerson);
            if (b.dataset.removeFamily)
                await removeFromRoster('family', b.dataset.removeFamily);
            if (b.id === 'archived-open')
                openArchived();
            if (b.dataset.restoreTrip)
                await restoreTrip(b.dataset.restoreTrip);
            if (b.id === 'trip-delete')
                await archiveTrip();
            if (b.id === 'share')
                await sharing();
            if (b.id === 'editors')
                showEditors(await request(endpoint('/api/editors')));
            if (b.dataset.removeEditor && confirm(`Remove ${b.dataset.removeEditor}? They will no longer be able to open or edit this trip.`))
                await changeEditors('remove', b.dataset.removeEditor);
            if (b.id === 'share-rotate' || b.id === 'share-revoke') {
                b.disabled = true;
                const result = await request(endpoint('/api/share'), 'POST', { action: b.id === 'share-rotate' ? 'rotate' : 'revoke', base: { share: state.shareRevision } });
                await load();
                await sharing();
                if (result.url)
                    $('#share-body').insertAdjacentHTML('afterbegin', `<label>Your read-only link<input id="guest-url" value="${escape(result.url)}" readonly></label><button class="secondary" id="copy-link">Copy link</button><a href="${escape(result.url)}" target="_blank" rel="noreferrer">Open guest view ↗</a>`);
            }
            if (b.id === 'copy-link') {
                await navigator.clipboard.writeText($('#guest-url').value);
                $('#share-error').textContent = 'Guest link copied.';
            }
            if (b.id === 'export' || b.id === 'roster-backup')
                download(JSON.stringify({ schemaVersion: 2, revision: state.snapshot.revision, downloadedAt: state.downloadedAt, trip: state.snapshot.trip }, null, 2), 'application/json', `${state.selected}.json`);
            if (b.id === 'offline-file')
                download(buildOfflineHtml(state.snapshot, { downloadedAt: state.downloadedAt }), 'text/html;charset=utf-8', 'waypoint-offline-trip.html');
            if (b.id === 'check-again') {
                await load();
                if (!state.library.length) {
                    state.message = `Checked at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}: this address is still not on a trip.`;
                    status();
                }
            }
            if (b.id === 'sign-out' || b.dataset.signOut) {
                await clearDownloaded();
                location.assign('/signout-with-chatgpt?return_to=%2F');
            }
            if (b.id === 'reload-after-conflict') {
                if (confirm('Your unsaved draft will close. Copy it first if you want to keep it. Load latest?')) {
                    // Opened from the activity view: come back to it, now showing the latest saved values.
                    const back = returnTo;
                    returnTo = null;
                    $('#editor').close();
                    viewing = back;
                    await load();
                    if (viewing && !$(`#${VIEW_ID}`)?.open)
                        viewing = null;
                }
            }
            if (b.id === 'copy-draft') {
                await navigator.clipboard.writeText(JSON.stringify(draft(), null, 2));
                $('#edit-message').textContent = 'Draft copied.';
            }
            if (b.id === 'delete' && confirm('Delete this activity? Save its notes first if you want to keep them.'))
                await saveChange({ action: 'delete', activityId: $('#edit-form').dataset.id, base: formBase($('#edit-form')) });
        }
        catch (e) {
            state.message = e.message;
            if ($('#share-dialog')?.open)
                $('#share-error').textContent = e.message;
            status();
            b.disabled = false;
        }
    });
    async function saveChange(change) {
        state.busy = true;
        $('#save').disabled = true;
        try {
            const result = await request(endpoint('/api/trip'), 'PATCH', change);
            state.snapshot = result.snapshot;
            remember();
            // Opened from the activity view: the redraw below reopens it with the saved values. A delete has nothing to show.
            viewing = change.action !== 'delete' && returnTo && returnTo === change.activityId ? returnTo : null;
            returnTo = null;
            $('#editor').close();
            state.message = 'Saved for everyone viewing this trip.';
            state.busy = false;
            // Phone: the editor is opened from below the schedule, so show the saved card in place.
            const savedId = change.action === 'delete' ? null : change.activity?.id || change.activityId;
            const saved = phone() && savedId ? result.snapshot.trip.activities.find(a => a.id === savedId) : null;
            if (saved?.date)
                state.day = saved.date;
            render();
            const el = saved && document.querySelector(`#itinerary [data-detail="${CSS.escape(saved.id)}"], .idea-cards [data-detail="${CSS.escape(saved.id)}"]`);
            if (el) {
                el.classList.add('just-moved');
                el.scrollIntoView({ block: 'center' });
            }
        }
        catch (e) {
            $('#edit-message').textContent = e.message;
            $('#copy-draft').hidden = false;
            $('#reload-after-conflict').hidden = false;
            $('#save').disabled = true;
        }
        finally {
            state.busy = false;
            status();
        }
    }
    document.addEventListener('submit', async (event) => {
        if (!['edit-form', 'create-form', 'import-form', 'traveler-form', 'family-form', 'editor-form', 'place-form', 'stay-form', 'leg-form', 'stay-move-form'].includes(event.target.id))
            return;
        event.preventDefault();
        if (!writable())
            return;
        const f = event.target;
        if (f.id === 'editor-form') {
            await changeEditors('add', f.elements.email.value);
            return;
        }
        if (f.id === 'stay-move-form') {
            await confirmStayMove(f);
            return;
        }
        if (['place-form', 'stay-form', 'leg-form'].includes(f.id)) {
            await submitStructure(f);
            return;
        }
        if (['traveler-form', 'family-form'].includes(f.id)) {
            await saveRoster(f);
            return;
        }
        if (f.id === 'import-form') {
            const button = f.querySelector('button.primary');
            button.disabled = true;
            try {
                await createTrip({ trip: await importable(JSON.parse($('#import-json').value)) });
            }
            catch (e) {
                $('#import-error').textContent = e.message;
                button.disabled = false;
            }
            return;
        }
        if (f.id === 'edit-form') {
            const p = draft();
            if (p.placeId === '__new') {
                $('#edit-message').textContent = 'Choose “Add this place” to save the new place first, or pick another place.';
                return;
            }
            const fresh = f.dataset.new === 'true';
            await saveChange(fresh ? { action: 'add', base: {}, ...(f.dataset.before && p.date === f.dataset.beforeDate ? { beforeId: f.dataset.before } : {}), activity: { ...p, id: f.dataset.id, order: state.snapshot.trip.activities.length, sourceKind: 'entered' } } : { action: 'edit', base: formBase(f), activityId: f.dataset.id, patch: p });
        }
        else {
            const fields = Object.fromEntries(new FormData(f));
            try {
                if (f.dataset.edit === 'true') {
                    await request(endpoint('/api/trip'), 'PATCH', { action: 'metadata', base: formBase(f), patch: fields });
                    f.dataset.edit = '';
                    $('#create-dialog').close();
                    await load();
                }
                else {
                    await createTrip({ trip: { ...fields, families: [{ id: 'everyone', name: 'Everyone', color: 'green' }], places: [], stays: [], activities: [], legs: [] } });
                }
            }
            catch (e) {
                $('#create-error').textContent = e.message;
            }
        }
    });
    document.addEventListener('change', async (event) => {
        const el = event.target;
        try {
            if (el.id === 'trip-select') {
                state.selected = el.value;
                state.filter = 'all';
                state.day = null;
                history.replaceState(null, '', `/?trip=${state.selected}`);
                if (state.online)
                    await load();
                else {
                    const copy = state.copies[state.selected];
                    state.snapshot = copy?.snapshot || null;
                    state.downloadedAt = copy?.downloadedAt || null;
                    render();
                }
            }
            if (el.id === 'family') {
                state.filter = el.value;
                persist();
                render();
                $('#family').focus();
            }
            if (el.id === 'hide-examples') {
                state.hideExamples = el.checked;
                persist();
                render();
                $('#hide-examples')?.focus();
            }
            if (el.id === 'day' && allDaysView())
                jumpToDay(el.value);
            else if (el.id === 'day') {
                state.day = el.value;
                persist();
                render();
                $('#day').focus();
            }
            if (el.name === 'participants') {
                if (el.dataset.person)
                    el.dataset.explicit = String(el.checked);
                updateAttendance(el.form);
            }
            if (el.name === 'placeId' && el.form?.id === 'edit-form') {
                $('#place-inline').hidden = el.value !== '__new';
                if (el.value === '__new') {
                    // A new place starts inside the area of the place that was chosen before, which is the usual case.
                    el.form.elements.newPlaceparentId.value = areaId(state.snapshot.trip, el.form.dataset.lastPlace || '') || '';
                    el.form.elements.newPlacename.focus();
                }
                else
                    el.form.dataset.lastPlace = el.value;
            }
            if (el.form?.id === 'edit-form' && el.name === 'timing') {
                el.form.dataset.timingTouched = 'true';
                lockTiming();
            }
            if (el.form?.id === 'edit-form' && el.name === 'date')
                lockTiming();
            if (el.id === 'picture-file')
                await choosePicture(el);
            if (el.name === 'kind' && el.form?.id === 'edit-form')
                $('#some-panel').hidden = el.value !== 'some';
            if (['amapUrl', 'appleMapsUrl'].includes(el.name) && el.form?.id === 'place-form')
                el.form.elements.navReviewed.checked = false;
            if (el.id === 'import' && el.files[0]) {
                if (el.files[0].size > 5000000)
                    throw new Error('Import must be under 5 MB.');
                await createTrip({ trip: await importable(JSON.parse(await el.files[0].text())) });
            }
        }
        catch (e) {
            state.message = e.message;
            status();
        }
    });
    window.addEventListener('offline', () => {
        state.online = false;
        state.message = 'Your downloaded plan is available. Editing is paused.';
        if ($('#editor')?.open) {
            $('#save').disabled = true;
        }
        status();
    });
    window.addEventListener('online', () => {
        if (!$('#editor')?.open && !$('#roster-dialog')?.open)
            load();
    });
    document.addEventListener('input', event => {
        if (event.target.name === 'time' && event.target.form?.id === 'edit-form')
            suggestTiming();
        if (event.target.name === 'locationText' && event.target.form?.id === 'place-form')
            readLocation();
        if (event.target.matches?.('#edit-form textarea[data-grow]'))
            growTextareas();
    });
    // A card picture that cannot be loaded (offline, or signed out) is dropped rather than shown broken.
    document.addEventListener('error', event => {
        if (event.target.classList?.contains('card-image') || event.target.classList?.contains('view-image'))
            event.target.remove();
    }, true);
    // Remember whether this person likes the full form open.
    document.addEventListener('toggle', event => {
        if (event.target.id === 'more-details') {
            state.moreOpen = event.target.open;
            persist();
            growTextareas();
        }
    }, true);
    if ('serviceWorker' in navigator)
        navigator.serviceWorker.addEventListener('controllerchange', readiness);
    window.matchMedia?.(PHONE_QUERY).addEventListener?.('change', relayout);
    window.addEventListener('resize', () => fitColumns($('#itinerary')));
    document.addEventListener('close', event => {
        // Closing the view (button, Escape, backdrop, swipe) hands focus back to the card it came from.
        if (event.target.id === VIEW_ID && !$('#editor')?.open) {
            viewing = null;
            focusCard(document, event.target.dataset.activity, viewScope);
        }
        // Cancelling an editor that was opened from the view returns to the view, not to the schedule.
        if (event.target.id === 'editor' && returnTo) {
            const id = returnTo;
            returnTo = null;
            openView(id);
        }
        // Leaving History drops the entry from the address, so a reload goes back to the plan.
        if (event.target.id === 'history-dialog' && linkedChange() !== null)
            history.replaceState(null, '', state.selected ? `/?trip=${state.selected}` : '/');
        if (state.layoutStale)
            relayout();
    }, true);
    // Back and Forward move between the plan and a linked History entry.
    window.addEventListener('popstate', () => {
        const id = linkedChange();
        if (id !== null && state.snapshot)
            openHistory('', id).catch(() => { });
        else if ($('#history-dialog')?.open)
            $('#history-dialog').close();
    });
    restore();
    state.online = navigator.onLine;
    render();
    // Opened from a link to one History entry: show it once the trip has loaded.
    load().then(() => { const id = linkedChange(); if (id !== null && state.snapshot && state.online) return openHistory('', id); }).catch(() => { });
})();
