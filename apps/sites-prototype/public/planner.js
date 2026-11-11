(async () => {
    'use strict';
    const { escape, dateLabel, days, preferredDay, board, card, dayChooser } = await import('/board.mjs');
    const { responsePolicy } = await import('/reading-copy.mjs');
    const { buildOfflineHtml } = await import('/offline-export.mjs');
    const { moveActivity, stepTarget } = await import('/move.mjs');
    const { enableDrag } = await import('/drag.mjs');
    const KEY = 'waypoint-library-v2', OLD_KEY = 'waypoint-downloaded-trip-v1';
    const app = document.querySelector('#app');
    const state = { user: null, snapshot: null, library: [], copies: {}, canCreate: false, isOwner: false, selected: new URLSearchParams(location.search).get('trip'), filter: 'all', day: null, compact:true, online: navigator.onLine, busy: false, message: '', downloadedAt: null, offlineReady: false, needsSignIn: false };
    const $ = s => document.querySelector(s);
    const writable = () => state.online && !state.needsSignIn && !state.busy;
    function restore() { try {
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
            const selected = new URLSearchParams(location.search).get('trip');
            if (selected)
                state.selected = selected;
            const copy = state.copies[state.selected];
            if (copy)
                Object.assign(state, copy);
            else {state.snapshot = null;state.downloadedAt=null;}
        }
    }
    catch { } }
    function persist() { try {
        localStorage.setItem(KEY, JSON.stringify({ user: state.user, library: state.library, copies: state.copies, selected: state.selected, filter: state.filter, day: state.day, compact:state.compact }));
    }
    catch { } }
    function remember() { state.downloadedAt = new Date().toISOString(); state.copies[state.selected] = { snapshot: state.snapshot, downloadedAt: state.downloadedAt, isOwner: state.isOwner }; try {
        localStorage.setItem(KEY, JSON.stringify({ user: state.user, library: state.library, copies: state.copies, selected: state.selected, filter: state.filter, day: state.day, compact:state.compact }));
    }
    catch {
        state.message = 'This browser could not keep a reading copy. Save an offline HTML file.';
    } }
    async function clearDownloaded() { localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY); if ('caches' in window)
        await Promise.all((await caches.keys()).filter(k => k.startsWith('waypoint-')).map(k => caches.delete(k))); if ('serviceWorker' in navigator)
        await Promise.all((await navigator.serviceWorker.getRegistrations()).map(r => r.unregister())); state.snapshot = null; state.copies = {}; state.library = []; state.user = null; }
    async function request(path, method = 'GET', body) { const control = new AbortController(), timer = setTimeout(() => control.abort(), 12000); try {
        const r = await fetch(path, { method, cache: 'no-store', credentials: 'same-origin', signal: control.signal, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
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
    } }
    const endpoint = path => `${path}?id=${encodeURIComponent(state.selected)}`;
    async function readiness() { try {
        const cache = await caches.open('waypoint-shell-v11');
        state.offlineReady = (await Promise.all(['/offline.html', '/planner.js', '/planner.css', '/reading-copy.mjs', '/offline-export.mjs', '/board.mjs', '/move.mjs', '/drag.mjs'].map(p => cache.match(p, { ignoreVary: true })))).every(Boolean);
        status();
    }
    catch { } }
    async function shell() { if (!('serviceWorker' in navigator))
        return; try {
        await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        await readiness();
    }
    catch { } }
    async function load() { state.busy = true; status(); try {
        const library = await request('/api/trips');
        if (state.user && state.user.id !== library.user.id) {
            await clearDownloaded();
            state.selected = null;
        }
        state.user = library.user;
        state.library = library.trips;
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
    } }
    function status() { if (!$('#status'))
        return; $('#status').className = !state.online || state.needsSignIn ? 'reading-copy' : ''; $('#status').innerHTML = `<span>${state.busy ? 'Updating…' : state.needsSignIn ? 'Sign-in expired · reading only' : state.online ? 'Connected' : 'Offline · reading copy'}</span><span>${state.snapshot ? `Revision ${state.snapshot.revision} · ` : ''}${state.downloadedAt ? `Downloaded ${escape(new Date(state.downloadedAt).toLocaleString())}` : 'No downloaded itinerary yet'}${state.offlineReady ? ' · Ready to read offline' : ''}</span>`; $('#message').textContent = state.message; for (const id of ['new-trip', 'add', 'settings', 'share', 'import', 'paste-import', 'example', 'recover']) {
        const control = $('#' + id);
        if (control)
            control.disabled = !writable();
    } if ($('#refresh'))
        $('#refresh').disabled = state.busy || !navigator.onLine; const canMove = writable() && !!state.snapshot; for (const el of [$('#itinerary'), $('.idea-cards')])
        el?.classList?.toggle('can-drag', canMove); if ($('#drag-hint'))
        $('#drag-hint').textContent = canMove ? (phone() ? 'To move a plan, press and hold its card, then drop it on a day in the bar that appears.' : 'Drag a card to another day, between cards to reorder, or onto ideas to unschedule. Keyboard: focus a card, then Shift + arrow keys.') : ''; }
    function render() {
        const t = state.snapshot?.trip;
        const dates = t ? days(t) : [];
        if (t)
            state.day = preferredDay(t, state.day);
        app.innerHTML = `<a class="skip-link" href="#itinerary">Skip to itinerary</a><header class="topbar"><a class="brand" href="/">waypoint<span class="brand-dot">↗</span></a><span class="private-label">PRIVATE PLANNING</span><div class="account">${state.user ? `<span class="account-name">${escape(state.user.name)}</span><button class="text-button" id="sign-out">Sign out</button>` : '<a href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in</a>'}${state.needsSignIn ? '<a href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in to update</a>' : ''}</div></header><main class="${state.compact ? 'compact' : ''}">
<section class="library-bar"><label>Trips & events<select id="trip-select" ${!state.library.length ? 'disabled' : ''}>${state.library.map(x => `<option value="${escape(x.id)}" ${x.id === state.selected ? 'selected' : ''}>${escape(x.title)}</option>`).join('')}</select></label>${state.canCreate ? `<button class="secondary" id="new-trip" ${!writable() ? 'disabled' : ''}>New trip or event</button><button class="secondary" id="paste-import" ${!writable()?"disabled":""}>Paste JSON</button><label class="secondary file-label">Import JSON<input id="import" type="file" accept="application/json,.json" ${!writable() ? 'disabled' : ''}></label>` : ''}</section>
<header class="trip-header"><div><button class="story-toggle" id="story-toggle">${state.compact ? "Open trip story ↗" : "Focus on the plan ↓"}</button><span class="eyebrow">${t?.kind === 'event' ? 'TIME TOGETHER' : 'INDEPENDENT PLANS. SHARED ADVENTURES.'}</span><h1>${escape(t?.title || 'A plan for every gathering')}<span class="title-dot">*</span></h1><p class="trip-subtitle">${escape(t?.subtitle || 'Choose a trip, bring an idea, and leave a little room to wander.')}</p>${t ? `<div class="trip-facts"><span>${escape(t.start)} – ${escape(t.end)}</span><span>${escape(t.timezone)}</span><span>${t.families.length} ${t.families.length===1?"group":"groups"}</span></div>` : ''}</div><aside class="story-art" aria-label="Decorative branching route"><svg viewBox="0 0 220 200" aria-hidden="true"><path d="M15 180V115H90V50H195M90 115H165V155H205" fill="none" stroke="currentColor" stroke-width="14"/><path d="m165 15 35 35-35 35" fill="none" stroke="currentColor" stroke-width="14"/><path d="M5 170H25V190H5ZM155 145H175V165H155Z" fill="var(--blue)"/></svg><p>GO YOUR OWN WAY.<br>MEET FOR DINNER.</p></aside></header>
${t ? `<div class="toolbar"><span class="view-title">Daily plans</span><label class="traveler-select">Travelers<select id="family"><option value="all">Everyone</option>${t.families.map(f => `<option value="${escape(f.id)}" ${state.filter === f.id ? 'selected' : ''}>${escape(f.name)}</option>`).join('')}</select></label><div class="tools"><button class="secondary" id="add" ${!writable() ? 'disabled' : ''}>Add activity</button><button class="secondary" id="settings" ${!writable() ? 'disabled' : ''}>Trip details</button>${state.isOwner ? `<button class="secondary" id="share" ${!writable() ? 'disabled' : ''}>Guest link</button>` : ''}<button class="secondary" id="offline-file">Save offline trip</button><button class="secondary" id="export">JSON</button><button class="secondary" id="refresh">Refresh</button></div></div>` : ''}
<div id="status" role="status" aria-live="polite"></div><p id="drag-hint" class="drag-hint"></p><p id="filter-status" role="status" aria-live="polite">${t ? (state.filter === 'all' ? 'Everyone · shared plans appear once' : 'Selected group · all shared attendee labels remain visible') : ''}</p><div id="message" role="alert"></div>
${t ? `${dayChooser(t, state.day)}<div id="itinerary" tabindex="-1" class="date-board">${board(t, { filter: state.filter, day: state.day, compact:state.compact })}</div><section class="ideas"><h2>Not on the itinerary. Yet.</h2><div class="idea-cards">${ideas(t)}</div></section>` : `<section class="welcome" id="itinerary" tabindex="-1"><h2>Start with something to explore.</h2><p>Keep separate trips and gatherings here. Each has its own activities, saved revision, and optional guest link.</p>${state.canCreate ? '<button class="primary" id="example">Add a synthetic gathering example</button><button class="secondary" id="recover">Recover the Japan prototype</button>' : '<p>Sign in with an organizer or invited editor account to plan.</p>'}</section>`}
<footer><span>WAYPOINT ↗ Make plans. Take detours.</span><span>Guest links are optional and read-only.</span></footer></main>
<dialog id="editor" aria-labelledby="edit-title"><form id="edit-form"><div class="dialog-heading"><span class="eyebrow">THE PLAN, UP CLOSE</span><button type="button" class="icon-button" id="close-editor" aria-label="Close activity">×</button></div><h2 id="edit-title">Activity details</h2><div id="editor-fields"></div><p id="edit-message" role="alert"></p><div class="dialog-actions"><button type="button" class="text-button" id="copy-draft" hidden>Copy my draft</button><button type="button" class="secondary" id="reload-after-conflict" hidden>Load latest plan</button><button type="button" class="text-button" id="delete">Delete activity</button><button type="submit" class="primary" id="save">Save changes</button></div></form></dialog>
<dialog id="create-dialog" aria-labelledby="create-title"><form id="create-form"><h2 id="create-title">New trip or event</h2><label>Name<input name="title" required maxlength="160"></label><div class="field-row"><label>First day<input type="date" name="start" required></label><label>Last day<input type="date" name="end" required></label></div><label>Time zone<input name="timezone" value="America/Los_Angeles" required></label><label>Kind<select name="kind"><option value="event">Gathering / event</option><option value="trip">Trip</option></select></label><p id="create-error" role="alert"></p><div class="dialog-actions"><button type="button" class="secondary" data-close="create-dialog">Cancel</button><button class="primary">Create</button></div></form></dialog>
<dialog id="import-dialog" aria-labelledby="import-title"><form id="import-form"><h2 id="import-title">Import a trip or event</h2><label>Trip JSON<textarea id="import-json" rows="14" required maxlength="250000" spellcheck="false"></textarea></label><p>Creates a separate private trip. Guest sharing starts disabled.</p><p id="import-error" role="alert"></p><div class="dialog-actions"><button type="button" class="secondary" data-close="import-dialog">Cancel</button><button class="primary">Import trip</button></div></form></dialog><dialog id="share-dialog" aria-labelledby="share-title"><h2 id="share-title">A link for your guests</h2><p>Anyone holding this link can browse the dated activities, group names, guest descriptions, and meeting points. They cannot edit.</p><p>Private planning notes, lodging details, unscheduled ideas, journey notes, source links, and editor identities are excluded. Downloaded copies cannot be recalled.</p><div id="share-body"></div><p id="share-error" role="alert"></p><div class="dialog-actions"><button class="secondary" data-close="share-dialog">Close</button></div></dialog>`;
        status();
        if (t) {
            const selected = document.querySelector(`[data-date="${state.day}"]`);
            if (selected)
                $('#itinerary').scrollLeft = selected.offsetLeft - $('#itinerary').offsetLeft;
        }
    }
    function ideas(t) { return t.activities.filter(a => !a.date && (state.filter === 'all' || a.participants.includes(state.filter))).map(a => card(a, t)).join('') || '<p>No unscheduled ideas yet.</p>'; }
    // ---- Drag-and-drop and keyboard moves (one shared record, same revision-checked save) ----
    const phone = () => window.matchMedia?.('(max-width:760px)').matches;
    const dayName = date => date ? dateLabel(date, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Unscheduled ideas';
    const groupNames = a => a.participants.map(id => state.snapshot.trip.families.find(f => f.id === id)?.name || id).join(', ');
    function showDay(date) {
        state.day = date;
        persist();
        const it = $('#itinerary');
        for (const section of it?.querySelectorAll('.agenda-day') || [])
            section.dataset.selected = String(section.dataset.date === date);
        if ($('#day'))
            $('#day').value = date;
        const column = it?.querySelector(`[data-date="${date}"]`);
        if (column && !phone())
            it.scrollTo({ left: column.offsetLeft - it.offsetLeft, behavior: 'smooth' });
    }
    function refreshBoard(movedId, { focus = false, refused = false } = {}) {
        const t = state.snapshot.trip, it = $('#itinerary');
        if (!it)
            return render();
        const left = it.scrollLeft, top = it.scrollTop;
        it.innerHTML = board(t, { filter: state.filter, day: state.day });
        it.scrollLeft = left;
        it.scrollTop = top;
        if ($('.idea-cards'))
            $('.idea-cards').innerHTML = ideas(t);
        if ($('#day'))
            $('#day').value = state.day;
        const el = movedId && document.querySelector(`#itinerary [data-detail="${CSS.escape(movedId)}"], .idea-cards [data-detail="${CSS.escape(movedId)}"]`);
        if (el) {
            el.classList.add(refused ? 'drop-refused' : 'just-moved');
            if (focus)
                el.focus();
            el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }
    async function moveCard({ activityId, date, beforeId = null, follow = false, focus = false }) {
        if (!writable() || !state.snapshot)
            return;
        const previous = state.snapshot, a = previous.trip.activities.find(x => x.id === activityId);
        if (!a)
            return;
        if (a.fixed && (a.date ?? null) !== date) {
            state.message = `“${a.title}” is a fixed booking, so it stays on ${dayName(a.date)}. To change its day, open it, clear “Fixed booking”, then move it.`;
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
        const shared = a.participants.length > 1;
        try {
            const saved = await request(endpoint('/api/trip'), 'PATCH', { action: 'move', revision: previous.revision, activityId, date, beforeId });
            state.snapshot = saved.snapshot;
            remember();
            const where = result.from === date ? `Reordered “${a.title}” on ${dayName(date)}.` : `Moved “${a.title}” from ${dayName(result.from)} to ${dayName(date)}.`;
            state.message = `${where}${shared && result.from !== date ? ` One shared plan, moved for ${groupNames(a)}${state.filter !== 'all' ? ' — including groups hidden by the Travelers filter' : ''}.` : ''} Saved for everyone viewing this trip.`;
        }
        catch (e) {
            state.snapshot = previous;
            state.busy = false;
            refreshBoard(activityId, { refused: true });
            if (e.status === 409) {
                await load();
                state.message = `Not moved: someone else saved a change to this trip first. Nothing was overwritten — the latest plan is now shown. Move “${a.title}” again if it is still needed.`;
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
            const note = a.fixed ? `Fixed booking · can only be reordered within ${dayName(a.date)}` : a.participants.length > 1 ? `Shared plan · moves for ${groupNames(a)}${state.filter !== 'all' ? ' (including groups hidden by the filter)' : ''}` : groupNames(a);
            return { title: a.title, date: a.date ?? null, fixed: a.fixed, note: `${note}${phone() ? ' · hold over a day to open it' : ''}` };
        },
        dock: () => [...days(state.snapshot.trip).map(d => ({ date: d, top: dateLabel(d, { weekday: 'short' }), big: dateLabel(d, { day: 'numeric' }), current: d === state.day })), { date: null, top: 'Unschedule', big: 'Ideas', current: false }]
    });
    document.addEventListener('keydown', event => {
        const keys = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 };
        if (!event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || !(event.key in keys))
            return;
        const cardEl = event.target.closest?.('.can-drag .activity[data-detail]');
        if (!cardEl || !writable())
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
    function formData(a) { const t = state.snapshot.trip; const disabled = !writable(); return `<label>Activity<input name="title" value="${escape(a.title)}" maxlength="160" required ${disabled ? 'disabled' : ''}></label><div class="field-row"><label>Day<select name="date" ${disabled ? 'disabled' : ''}><option value="">Unscheduled idea</option>${days(t).map(d => `<option value="${d}" ${a.date === d ? 'selected' : ''}>${dateLabel(d, { weekday: 'short', month: 'short', day: 'numeric' })}</option>`).join('')}</select></label><label>Time or part of day<input name="time" value="${escape(a.time)}" maxlength="80" ${disabled ? 'disabled' : ''}></label></div><label>Place<select name="placeId" ${disabled ? 'disabled' : ''}><option value="">Location to confirm</option>${t.places.map(p => `<option value="${escape(p.id)}" ${a.placeId === p.id ? 'selected' : ''}>${escape(p.name)} ${escape(p.localName)}</option>`).join('')}</select></label><label class="check-label"><input type="checkbox" name="fixed" ${a.fixed ? 'checked' : ''} ${disabled ? 'disabled' : ''}> Fixed booking · protect date and time</label><label class="check-label"><input type="checkbox" name="optional" ${a.optional ? 'checked' : ''} ${disabled ? 'disabled' : ''}> Optional · offered as a choice, not a commitment</label><label class="check-label"><input type="checkbox" name="highlight" ${a.highlight?"checked":""} ${disabled?"disabled":""}> Highlight a shared moment</label><fieldset><legend>${a.optional ? 'Available to' : 'Participants'}</legend>${t.families.map(f => `<label class="check-label"><input type="checkbox" name="participants" value="${escape(f.id)}" ${a.participants.includes(f.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''}>${escape(f.name)}</label>`).join('')}</fieldset><label>Guest description<textarea name="guestNotes" rows="3" maxlength="4000" ${disabled ? 'disabled' : ''}>${escape(a.guestNotes)}</textarea><small>Visible if you enable this event's guest link.</small></label><label>Guest meeting point<input name="guestLocation" maxlength="500" value="${escape(a.guestLocation)}" ${disabled ? 'disabled' : ''}></label><label>Private planning notes<textarea name="notes" rows="4" maxlength="4000" ${disabled ? 'disabled' : ''}>${escape(a.notes)}</textarea><small>Excluded from the guest link.</small></label>`; }
    function openEditor(id) { const a = state.snapshot.trip.activities.find(a => a.id === id) || { id: crypto.randomUUID(), date: state.day, time: '', title: '', placeId: state.snapshot.trip.places[0]?.id || null, participants: state.snapshot.trip.families.map(f => f.id), notes: '', guestNotes: '', guestLocation: '', fixed: false, optional: state.snapshot.trip.kind === 'event', order: state.snapshot.trip.activities.length, sourceKind: 'entered' }; const form = $('#edit-form'); form.dataset.id = a.id; form.dataset.new = String(!id); form.dataset.revision = state.snapshot.revision; $('#editor-fields').innerHTML = formData(a); $('#delete').hidden = !id || !writable(); $('#save').disabled = !writable(); $('#copy-draft').hidden = true; $('#reload-after-conflict').hidden = true; $('#edit-message').textContent = !writable() ? 'Downloaded reading copy. Connect and refresh before editing.' : a.sourceKind === 'tentative' ? 'Tentative source plan. Times, hosts, and bookings need review.' : a.sourceKind === 'synthetic' ? 'Synthetic detail for testing.' : ''; lockTiming(); $('#editor').showModal(); }
    function lockTiming() { const f = $('#edit-form'); if (!f?.elements.fixed)
        return; f.elements.date.disabled = !writable() || f.elements.fixed.checked; f.elements.time.disabled = !writable() || f.elements.fixed.checked; }
    function draft() { const f = $('#edit-form'); return { title: f.elements.title.value, date: f.elements.date.value || null, time: f.elements.time.value, placeId: f.elements.placeId.value || null, notes: f.elements.notes.value, guestNotes: f.elements.guestNotes.value, guestLocation: f.elements.guestLocation.value, fixed: f.elements.fixed.checked, optional: f.elements.optional.checked, highlight:f.elements.highlight.checked, participants: [...f.querySelectorAll('[name=participants]:checked')].map(x => x.value) }; }
    async function createTrip(data) { const r = await request('/api/trips', 'POST', data); state.selected = r.snapshot.trip.id; state.filter = 'all'; state.day = null; history.replaceState(null, '', `/?trip=${state.selected}`); await load(); }
    function download(contents, mime, filename) { const url = URL.createObjectURL(new Blob([contents], { type: mime })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    async function sharing() { const data = await request(endpoint('/api/share')); $('#share-body').innerHTML = `<p>${data.enabled ? 'A guest link is enabled. Replacing it disables the previous link.' : 'No guest link is enabled.'}</p><button class="primary" id="share-rotate">${data.enabled ? 'Replace guest link' : 'Enable guest link'}</button>${data.enabled ? '<button class="secondary" id="share-revoke">Disable guest link</button>' : ''}<details><summary>Preview exactly what guests will see</summary><div class="guest-preview">${board(data.preview, { day: state.day, guest: true })}</div></details>`; $('#share-error').textContent = ''; $('#share-dialog').showModal(); }
    document.addEventListener('click', async (event) => {
        const b = event.target.closest('button');
        if (!b)
            return;
        try {
            if (b.dataset.close)
                $(`#${b.dataset.close}`).close();
            if (b.dataset.detail)
                openEditor(b.dataset.detail);
            if (b.id === 'close-editor')
                $('#editor').close();
            if (b.id === 'add')
                openEditor();
            if (b.id === 'refresh')
                await load();
            if(b.id==='paste-import'){$('#import-json').value='';$('#import-error').textContent='';$('#import-dialog').showModal();}
            if (b.id === 'story-toggle') {state.compact=!state.compact;persist();render();}
        if (b.id === 'new-trip') {
                $('#create-form').reset();
                $('#create-form').dataset.edit = '';
                $('#create-title').textContent = 'New trip or event';
                $('#create-dialog').showModal();
            }
            if (b.id === 'example')
                await createTrip({ template: 'thanksgiving' });
            if (b.id === 'recover')
                await createTrip({ template: 'legacy' });
            if (b.id === 'settings') {
                const t = state.snapshot.trip;
                const f = $('#create-form');
                for (const k of ['title', 'start', 'end', 'timezone', 'kind'])
                    f.elements[k].value = t[k];
                f.dataset.edit = 'true';
                $('#create-title').textContent = 'Trip details';
                $('#create-dialog').showModal();
            }
            if (b.id === 'share')
                await sharing();
            if (b.id === 'share-rotate' || b.id === 'share-revoke') {
                b.disabled = true;
                const result = await request(endpoint('/api/share'), 'POST', { action: b.id === 'share-rotate' ? 'rotate' : 'revoke', revision: state.snapshot.revision });
                await load();
                await sharing();
                if (result.url)
                    $('#share-body').insertAdjacentHTML('afterbegin', `<label>Your read-only link<input id="guest-url" value="${escape(result.url)}" readonly></label><button class="secondary" id="copy-link">Copy link</button><a href="${escape(result.url)}" target="_blank" rel="noreferrer">Open guest view ↗</a>`);
            }
            if (b.id === 'copy-link') {
                await navigator.clipboard.writeText($('#guest-url').value);
                $('#share-error').textContent = 'Guest link copied.';
            }
            if (b.id === 'export')
                download(JSON.stringify({ schemaVersion: 2, revision: state.snapshot.revision, downloadedAt: state.downloadedAt, trip: state.snapshot.trip }, null, 2), 'application/json', `${state.selected}.json`);
            if (b.id === 'offline-file')
                download(buildOfflineHtml(state.snapshot, { downloadedAt: state.downloadedAt }), 'text/html;charset=utf-8', 'waypoint-offline-trip.html');
            if (b.id === 'sign-out') {
                await clearDownloaded();
                location.assign('/signout-with-chatgpt?return_to=%2F');
            }
            if (b.id === 'reload-after-conflict') {
                if (confirm('Your unsaved draft will close. Copy it first if you want to keep it. Load latest?')) {
                    $('#editor').close();
                    await load();
                }
            }
            if (b.id === 'copy-draft') {
                await navigator.clipboard.writeText(JSON.stringify(draft(), null, 2));
                $('#edit-message').textContent = 'Draft copied.';
            }
            if (b.id === 'delete' && confirm('Delete this activity? Save its notes first if you want to keep them.'))
                await saveChange({ action: 'delete', activityId: $('#edit-form').dataset.id, revision: Number($('#edit-form').dataset.revision) });
        }
        catch (e) {
            state.message = e.message;
            if ($('#share-dialog')?.open)
                $('#share-error').textContent = e.message;
            status();
            b.disabled = false;
        }
    });
    async function saveChange(change) { state.busy = true; $('#save').disabled = true; try {
        const result = await request(endpoint('/api/trip'), 'PATCH', change);
        state.snapshot = result.snapshot;
        remember();
        $('#editor').close();
        state.message = 'Saved for everyone viewing this trip.';
        state.busy = false;
        render();
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
    } }
    document.addEventListener('submit', async (event) => { if (!['edit-form', 'create-form', 'import-form'].includes(event.target.id))
        return; event.preventDefault(); if (!writable())
        return; const f = event.target; if(f.id==='import-form'){const button=f.querySelector('button.primary');button.disabled=true;try{const parsed=JSON.parse($('#import-json').value);await createTrip({trip:parsed.trip||parsed});}catch(e){$('#import-error').textContent=e.message;button.disabled=false;}return;} if (f.id === 'edit-form') {
        const p = draft();
        const fresh = f.dataset.new === 'true';
        await saveChange(fresh ? { action: 'add', revision: Number(f.dataset.revision), activity: { ...p, id: f.dataset.id, order: state.snapshot.trip.activities.length, sourceKind: 'entered' } } : { action: 'edit', revision: Number(f.dataset.revision), activityId: f.dataset.id, patch: p });
    }
    else {
        const fields = Object.fromEntries(new FormData(f));
        try {
            if (f.dataset.edit === 'true') {
                await request(endpoint('/api/trip'), 'PATCH', { action: 'metadata', revision: state.snapshot.revision, patch: fields });
                f.dataset.edit = '';
                $('#create-dialog').close();
                await load();
            }
            else {
                await createTrip({ trip: { ...fields, subtitle: '', families: [{ id: 'everyone', name: 'Everyone', color: 'green' }], places: [], stays: [], activities: [], legs: [] } });
            }
        }
        catch (e) {
            $('#create-error').textContent = e.message;
        }
    } });
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
            if (el.id === 'day') {
                state.day = el.value;
                persist();
                render();
                $('#day').focus();
            }
            if (el.name === 'fixed')
                lockTiming();
            if (el.id === 'import' && el.files[0]) {
                if (el.files[0].size > 250000)
                    throw new Error('Import must be under 250 KB.');
                const parsed = JSON.parse(await el.files[0].text());
                await createTrip({ trip: parsed.trip || parsed });
            }
        }
        catch (e) {
            state.message = e.message;
            status();
        }
    });
    window.addEventListener('offline', () => { state.online = false; state.message = 'Your downloaded plan is available. Editing is paused.'; if ($('#editor')?.open) {
        $('#save').disabled = true;
    } status(); });
    window.addEventListener('online', () => { if (!$('#editor')?.open)
        load(); });
    if ('serviceWorker' in navigator)
        navigator.serviceWorker.addEventListener('controllerchange', readiness);
    restore();
    state.online = navigator.onLine;
    render();
    load();
})();
