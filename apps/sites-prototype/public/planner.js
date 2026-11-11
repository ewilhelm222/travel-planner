(async () => {
  "use strict";
  const { responsePolicy } = await import("/reading-copy.mjs");
  const { buildOfflineHtml } = await import("/offline-export.mjs");
  const KEY = "waypoint-downloaded-trip-v1";
  const app = document.querySelector("#app");
  const state = { user: null, snapshot: null, downloadedAt: null, online: navigator.onLine, filter: "all", busy: false, message: "", offlineReady: false, offlineIssue: false, needsSignIn: false };
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dateLabel = (date, options) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...options });
  const icon = (name, size = 18) => {
    const paths = { arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>', train: '<rect x="5" y="3" width="14" height="15" rx="4"/><path d="M5 10h14M9 18l-2 3m8-3 2 3M9 14h.01M15 14h.01"/>', pin: '<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>', refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 13 2M5 16a8 8 0 0 0 13 2"/>', lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>', check: '<path d="m5 12 4 4L19 6"/>', leaf: '<path d="M20 4C7 2 2 8 6 15s15 5 14-11Z"/><path d="M4 21 16 9"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>', compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5 5-3Z"/>' };
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.pin}</svg>`;
  };

  function restore() {
    try {
      const cached = JSON.parse(localStorage.getItem(KEY));
      if (cached?.snapshot?.trip?.schemaVersion === 1 && cached.user?.id && cached.downloadedAt) Object.assign(state, cached);
    } catch { /* An unavailable or invalid local copy is not authoritative. */ }
  }

  function remember() {
    const downloadedAt = new Date().toISOString();
    try {
      localStorage.setItem(KEY, JSON.stringify({ user: state.user, snapshot: state.snapshot, downloadedAt }));
      state.downloadedAt = downloadedAt;
    } catch { state.message = "This browser could not keep an offline copy. Your trip is still saved online."; state.downloadedAt = null; }
  }

  async function clearDownloaded() {
    localStorage.removeItem(KEY);
    if ("caches" in window) await Promise.all((await caches.keys()).filter(k => k.startsWith("waypoint-")).map(k => caches.delete(k)));
    if ("serviceWorker" in navigator) await Promise.all((await navigator.serviceWorker.getRegistrations()).filter(r => new URL(r.scope).origin === location.origin).map(r => r.unregister()));
    state.snapshot = null; state.user = null; state.downloadedAt = null;
  }

  async function request(method = "GET", body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const result = await fetch("/api/trip", { method, cache: "no-store", credentials: "same-origin", signal: controller.signal,
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
      const policy = responsePolicy(result.status, result.headers.get("Content-Type") || "");
      if (policy) {
        if (policy.clearCopy) await clearDownloaded();
        state.needsSignIn = policy.needsSignIn;
        state.online = false;
        const error = new Error(policy.message); error.status = result.status === 403 ? 403 : 401; throw error;
      }
      if (!result.headers.get("Content-Type")?.includes("application/json")) throw new Error("The server response could not be read. Keep the downloaded copy and try again later.");
      const data = await result.json();
      if (!result.ok) { const error = new Error(data.error || "The request failed."); error.status = result.status; throw error; }
      return data;
    } finally { clearTimeout(timer); }
  }

  async function updateOfflineReadiness() {
    if (!("caches" in window)) return;
    try {
      const cache = await caches.open("waypoint-shell-v5");
      state.offlineReady = (await Promise.all(["/offline.html", "/planner.js", "/planner.css", "/reading-copy.mjs", "/offline-export.mjs"].map(path => cache.match(path)))).every(Boolean);
      if (state.offlineReady) state.offlineIssue = false;
      updateStatus();
    } catch { state.offlineReady = false; updateStatus(); }
  }

  async function offlineShell() {
    if (!("serviceWorker" in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const installing = registration.installing;
      if (installing) installing.addEventListener("statechange", () => {
        if (installing.state === "redundant") { state.offlineIssue = true; updateStatus(); }
      });
      await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error("Offline setup timed out")), 10000))]);
      await updateOfflineReadiness();
    } catch (error) { console.warn("Offline setup unavailable", error.message); state.offlineReady = false; state.offlineIssue = true; updateStatus(); }
  }

  async function load(method = "GET") {
    state.busy = true; updateStatus();
    try {
      const data = await request(method);
      // An account switch replaces, rather than merges, the previous reading copy.
      if (state.user && state.user.id !== data.user.id) localStorage.removeItem(KEY);
      state.user = data.user; state.snapshot = data.snapshot; state.online = true; state.needsSignIn = false; state.message = "";
      if (state.snapshot) remember();
      render(); offlineShell();
    } catch (error) {
      if (!error.status) state.online = false;
      state.message = error.status ? error.message : (state.snapshot ? "Connection interrupted. Showing your downloaded copy; editing is paused." : "Connect to the internet to download this trip for the first time.");
      render();
    } finally { state.busy = false; updateStatus(); }
  }

  function familyPills(activity) {
    const families = state.snapshot.trip.families;
    return activity.participants.map(id => { const family = families.find(f => f.id === id); return `<span class="person ${escape(family.color)}" title="${escape(family.name)}">${escape(family.name.split(" ")[0])}</span>`; }).join("");
  }

  function card(activity) {
    return `<button class="activity ${activity.fixed ? "reserved" : ""}" data-edit="${escape(activity.id)}" aria-label="Open ${escape(activity.title)}">
      <span class="card-meta"><span>${escape(activity.time || "Any time")}</span>${activity.fixed ? `<span class="booking">${icon("lock", 11)} Fixed booking</span>` : `<span class="kind">${escape(activity.type)}</span>`}</span>
      <strong>${escape(activity.title)}</strong><span class="card-note">${escape(activity.notes)}</span>
      <span class="card-bottom"><span class="people">${familyPills(activity)}</span><span class="open-card">↗</span></span></button>`;
  }

  function staySection(stay, index) {
    const trip = state.snapshot.trip;
    const days = [];
    for (let date = stay.start; date < stay.end;) {
      days.push(date); const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1); date = next.toISOString().slice(0,10);
    }
    const journey = trip.legs.find(l => l.from === stay.id);
    return `<section class="stay" aria-label="${escape(stay.name)} stay"><div class="stay-heading"><div class="stay-number">0${index + 1}</div><div><h2>${escape(stay.name)}</h2><p>${escape(stay.note)}</p></div><span class="stay-duration">${days.length} ${days.length === 1 ? "night" : "nights"}</span></div>
      <div class="lodging">${icon("pin", 15)} ${escape(stay.lodging)}<span>${dateLabel(stay.start, {month:"short",day:"numeric"})} – ${dateLabel(stay.end, {month:"short",day:"numeric"})}</span></div>
      <div class="days">${days.map(date => {
        const activities = trip.activities.filter(a => a.stayId === stay.id && a.date === date && (state.filter === "all" || a.participants.includes(state.filter))).sort((a,b) => a.order - b.order || a.id.localeCompare(b.id));
        return `<section class="day"><div class="day-heading"><div><span>${dateLabel(date,{weekday:"long"})}</span><h3>${dateLabel(date,{month:"short",day:"numeric"})}</h3></div><span class="activity-count">${activities.length} ${activities.length === 1 ? "plan" : "plans"}</span></div><div class="cards">${activities.map(card).join("") || '<div class="empty-day">Room to wander.<br><span>No plans for this family today.</span></div>'}</div></section>`;
      }).join("")}</div></section>${journey ? `<div class="bridge"><div class="bridge-icon">${icon("train", 23)}</div><div><span class="eyebrow">THE JOURNEY BETWEEN</span><h3>${escape(journey.title)}</h3><p>${escape(journey.notes)}</p></div><span class="bridge-arrow">${icon("arrow", 28)}</span></div>` : ""}`;
  }

  function render() {
    const trip = state.snapshot?.trip;
    app.innerHTML = `<div class="topbar"><a class="brand" href="/">${icon("compass", 27)}<span>waypoint<span class="brand-dot">.</span></span></a><span class="private-label">${icon("lock", 13)} PRIVATE TRIP</span><div class="account">${state.user ? `<span class="avatar">${escape(state.user.name.slice(0,1).toUpperCase())}</span><span class="account-name">${escape(state.user.name)}</span>${state.needsSignIn ? '<a class="sign-in-link" href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in to update</a>' : ""}<button class="text-button" id="sign-out">Sign out</button>` : '<a href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in</a>'}</div></div>
      <main><div class="prototype-note"><span class="sample-dot"></span> A working prototype <span class="note-divider">/</span> Fictional families and plans. No real bookings.</div>
      <header class="trip-header"><div><span class="eyebrow">A TRIP TO MAKE YOUR OWN</span><h1>${escape(trip?.title || "Good trips start here")}<span class="title-dot">.</span></h1><p class="trip-subtitle">${escape(trip?.subtitle || "A shared plan, with room for everyone.")}</p>${trip ? `<div class="trip-facts"><span>${icon("pin",15)} Japan</span><span>April 12–15, 2027</span><span>2 families</span><span>3 nights</span></div>` : ""}</div><div class="route-sketch" aria-label="Sample itinerary: Kyoto to Osaka"><span class="route-city">Kyoto</span><svg viewBox="0 0 180 70" aria-hidden="true"><path d="M12 53C40 53 42 13 90 18S140 55 168 20" fill="none" stroke="#a7b2a2" stroke-width="2" stroke-dasharray="4 5"/><circle cx="12" cy="53" r="5" fill="#48634e"/><circle cx="168" cy="20" r="5" fill="#c77950"/></svg><span class="route-city right">Osaka</span><span class="sketch-caption">One journey. A little room to wander.</span></div></header>
      <div class="toolbar"><div class="view-title">${icon("compass",18)} Itinerary board</div><div class="filter" role="group" aria-label="Show travelers"><button data-filter="all" aria-pressed="${state.filter === "all"}">Everyone</button>${(trip?.families || []).map(f => `<button data-filter="${escape(f.id)}" aria-pressed="${state.filter === f.id}"><span class="family-dot ${escape(f.color)}"></span>${escape(f.name)}</button>`).join("")}</div><div class="tools"><button class="icon-button" id="refresh" title="Load latest plan" aria-label="Load latest plan">${icon("refresh")}</button>${trip ? `<button class="secondary" id="offline-file">${icon("download",15)} Save offline trip</button><button class="secondary" id="export">JSON</button>` : ""}</div></div>
      <div id="status" role="status" aria-live="polite"></div><p class="layout-link"><a href="/parallel-stays.html">Explore a split-stay board layout ↗</a></p><div id="message" role="alert"></div>
      ${trip ? `<div class="board">${trip.stays.map(staySection).join("")}</div><div class="board-end">${icon("leaf",20)}<span>Leave a little space for the unexpected.</span></div>` : `<section class="welcome"><div class="welcome-icon">${icon("compass",36)}</div><h2>A small trip, a useful first step.</h2><p>Open a sample itinerary to try family views, shared notes, and saving a reading copy for later.</p><button class="primary" id="start-demo" ${!state.online || !state.user ? "disabled" : ""}>Start the sample trip ${icon("arrow",17)}</button></section>`}
      <footer><span>WAYPOINT <span>·</span> Built for the people you travel with.</span><span>Prototype 01</span></footer></main>
      <dialog id="editor" aria-labelledby="edit-title"><form id="edit-form"><div class="dialog-heading"><span class="eyebrow">ACTIVITY DETAILS</span><button type="button" class="icon-button" id="close-editor" aria-label="Close activity">${icon("close",20)}</button></div><h2 id="edit-title">A little detail goes a long way.</h2><div id="editor-fields"></div><p id="edit-message" role="alert"></p><div class="dialog-actions"><button type="button" class="text-button" id="copy-draft" hidden>Copy my draft</button><button type="button" class="secondary" id="reload-after-conflict" hidden>Load latest plan</button><button type="submit" class="primary" id="save">Save changes ${icon("check",16)}</button></div></form></dialog>`;
    updateStatus();
  }

  function updateStatus() {
    const target = document.querySelector("#status"); if (!target) return;
    const downloaded = state.downloadedAt ? new Date(state.downloadedAt).toLocaleString([], { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }) : null;
    target.innerHTML = `<span class="connection ${state.online ? "" : "offline"}"><span></span>${state.busy ? "Updating…" : state.needsSignIn ? "Sign-in expired · reading only" : state.online ? "Connected" : "Offline · reading only"}</span><span>${state.snapshot ? `Revision ${state.snapshot.revision} · ` : ""}${downloaded ? `Downloaded ${escape(downloaded)}${state.offlineReady ? " · Ready to read offline" : state.offlineIssue ? " · Browser offline setup unavailable; use Save offline trip" : state.online ? " · Offline setup pending" : ""}` : "No downloaded itinerary yet"}</span>`;
    document.querySelector("#message").textContent = state.message;
    document.querySelector("#refresh").disabled = state.busy || !navigator.onLine;
    const start = document.querySelector("#start-demo"); if (start) start.disabled = state.busy || !navigator.onLine || !state.user;
  }

  function downloadFile(contents, mime, filename) {
    const url = URL.createObjectURL(new Blob([contents], { type: mime }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function openEditor(id) {
    const activity = state.snapshot.trip.activities.find(a => a.id === id); if (!activity) return;
    const dialog = document.querySelector("#editor"), form = document.querySelector("#edit-form");
    form.dataset.id = id; form.dataset.revision = state.snapshot.revision;
    const disabled = !state.online || state.busy;
    document.querySelector("#editor-fields").innerHTML = `${activity.fixed ? `<p class="fixed-note">${icon("lock",14)} This sample booking has a fixed date and time.</p>` : ""}<label>Activity<input name="title" value="${escape(activity.title)}" maxlength="160" required ${disabled ? "disabled" : ""}></label><div class="field-row"><label>Day<input name="date" type="date" value="${escape(activity.date)}" required ${disabled || activity.fixed ? "disabled" : ""}></label><label>Time or part of day<input name="time" value="${escape(activity.time)}" maxlength="80" ${disabled || activity.fixed ? "disabled" : ""}></label></div><label>Notes<textarea name="notes" rows="5" maxlength="4000" ${disabled ? "disabled" : ""}>${escape(activity.notes)}</textarea></label><div class="activity-location">${icon("pin",16)} ${escape(activity.address)}</div><div class="people">${familyPills(activity)}</div>`;
    document.querySelector("#save").disabled = disabled;
    document.querySelector("#edit-message").textContent = disabled ? "This is your downloaded copy. Connect to make changes." : "Shared plans are saved once for everyone attending.";
    document.querySelector("#reload-after-conflict").hidden = true;
    document.querySelector("#copy-draft").hidden = true;
    dialog.showModal();
  }

  document.addEventListener("click", async event => {
    const button = event.target.closest("button"); if (!button) return;
    if (button.dataset.filter) { state.filter = button.dataset.filter; render(); }
    if (button.dataset.edit) openEditor(button.dataset.edit);
    if (button.id === "refresh") load();
    if (button.id === "start-demo") load("POST");
    if (button.id === "close-editor") document.querySelector("#editor").close();
    if (button.id === "reload-after-conflict") {
      if (confirm("Your unsaved draft will close. Copy it first if you want to keep it. Load the latest plan?")) { document.querySelector("#editor").close(); load(); }
    }
    if (button.id === "copy-draft") {
      const form = document.querySelector("#edit-form"); const text = [form.elements.title.value, form.elements.date.value, form.elements.time.value, form.elements.notes.value].join("\n\n");
      try { await navigator.clipboard.writeText(text); document.querySelector("#edit-message").textContent = "Draft copied. You can now load the latest plan."; }
      catch { document.querySelector("#edit-message").textContent = "Select and copy your notes before loading the latest plan."; }
    }
    if (button.id === "offline-file") {
      try {
        downloadFile(buildOfflineHtml(state.snapshot, { downloadedAt: state.downloadedAt }), "text/html;charset=utf-8", "waypoint-offline-trip.html");
        state.message = "Offline trip saved. Keep the HTML file in your phone's Files app and test opening it before departure. It is a private snapshot, not a live plan; you can also print it to PDF.";
      } catch (error) { state.message = error.message; }
      updateStatus();
    }
    if (button.id === "export") {
      const data = { schemaVersion: 1, exportedAt: new Date().toISOString(), downloadedAt: state.downloadedAt, revision: state.snapshot.revision, trip: state.snapshot.trip };
      downloadFile(JSON.stringify(data,null,2), "application/json", "waypoint-sample-trip.json");
    }
    if (button.id === "sign-out") {
      button.disabled = true;
      try { await clearDownloaded(); location.assign("/signout-with-chatgpt?return_to=%2F"); }
      catch { button.disabled = false; state.message = "Could not clear this device's downloaded copy. Try again before signing out."; updateStatus(); }
    }
  });

  document.addEventListener("submit", async event => {
    if (event.target.id !== "edit-form") return;
    event.preventDefault(); if (!state.online || state.busy || !navigator.onLine) return;
    const form = event.target, activity = state.snapshot.trip.activities.find(a => a.id === form.dataset.id);
    const patch = { title: form.elements.title.value, notes: form.elements.notes.value, ...(!activity.fixed ? { date: form.elements.date.value, time: form.elements.time.value } : {}) };
    state.busy = true; document.querySelector("#save").disabled = true;
    try {
      const result = await request("PATCH", { activityId: activity.id, revision: Number(form.dataset.revision), patch });
      state.user = result.user; state.snapshot = result.snapshot; state.message = "Saved. Everyone attending sees this same activity."; remember();
      document.querySelector("#editor").close(); render();
    } catch (error) {
      if (!error.status) state.online = false;
      document.querySelector("#edit-message").textContent = error.status ? error.message : "The save was not confirmed. Your draft is still here. Load the latest plan to check before trying again.";
      if (error.status === 409 || !error.status || error.status >= 500) {
        document.querySelector("#reload-after-conflict").hidden = false; document.querySelector("#copy-draft").hidden = false;
      } else if (error.status === 401) {
        document.querySelector("#copy-draft").hidden = false;
        document.querySelector("#reload-after-conflict").hidden = false;
      } else if (error.status === 403) { document.querySelector("#editor").close(); render(); }
      else document.querySelector("#save").disabled = false;
    } finally { state.busy = false; updateStatus(); }
  });

  window.addEventListener("offline", () => { state.online = false; state.message = "Your downloaded plan is available. Editing will resume after reconnecting and refreshing."; const save = document.querySelector("#save"); if (save) save.disabled = true; updateStatus(); });
  window.addEventListener("online", () => { if (!document.querySelector("#editor")?.open) load(); else { state.message = "Connection returned. Keep your draft, then load the latest plan before editing again."; updateStatus(); } });
  restore(); state.online = navigator.onLine; render();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", updateOfflineReadiness);
    navigator.serviceWorker.addEventListener("message", event => {
      if (event.data?.type === "waypoint-offline-failed") {
        console.warn("Offline assets unavailable", JSON.stringify(event.data.assets));
        state.offlineIssue = true; state.offlineReady = false; updateStatus();
      }
    });
  }
  updateOfflineReadiness();
  load();
})();
