const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dateLabel = date => /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "Unscheduled ideas";

export function buildOfflineHtml(snapshot, { downloadedAt, exportedAt = new Date().toISOString() } = {}) {
  if (!snapshot?.trip || !Array.isArray(snapshot.trip.activities)) throw new Error("Download an itinerary before saving an offline file.");
  const trip = snapshot.trip;
  const people = new Map([...(trip.families || []), ...(trip.people || [])].map(p => [p.id, p.name]));
  const places = new Map((trip.places || []).map(p => [p.id, p]));
  const activities = [...trip.activities].sort((a,b) => String(a.date || "9999").localeCompare(String(b.date || "9999")) || (a.order ?? 0) - (b.order ?? 0));
  const dates = [...new Set(activities.map(a => a.date || ""))];
  const stayName = activity => (trip.stays || []).find(s => s.id === activity.stayId)?.name;
  const content = dates.map(date => `<section><h2>${escape(dateLabel(date))}</h2>${activities.filter(a => (a.date || "") === date).map(activity => {
    const place = places.get(activity.placeId);
    return `<article><div class="meta">${escape(activity.time || "Time to confirm")}${activity.fixed ? " · Fixed booking" : " · Flexible"}${activity.optional ? " · Optional" : ""}${activity.sourceKind === "synthetic" ? " · Synthetic" : activity.sourceKind === "tentative" ? " · Tentative" : ""}</div><h3>${escape(activity.title)}</h3>
      <p class="participants">${escape((activity.participants || []).map(id => people.get(id) || id).join(" · "))}</p>
      <p>${escape(place?.name || stayName(activity) || "")}</p><p lang="zh-Hans">${escape(place?.localName || "")}</p>
      <p class="address">${escape(place?.address || activity.address || "")}</p><p class="address" lang="zh-Hans">${escape(place?.localAddress || "")}</p><p class="notes">${escape(activity.notes)}</p>${activity.guestNotes ? `<p class="notes">Guest description: ${escape(activity.guestNotes)}</p>` : ""}${activity.guestLocation ? `<p>Guest meeting point: ${escape(activity.guestLocation)}</p>` : ""}</article>`;
  }).join("")}</section>`).join("");
  const stays = (trip.stays || []).map(stay => `<article><h3>${escape(stay.name)}</h3><p>${escape(stay.start)} → ${escape(stay.end)}</p><p>${escape(stay.lodging || "")}</p><p class="notes">${escape(stay.note || "")}</p></article>`).join("");
  const journeys = (trip.legs || []).map(leg => `<article><div class="meta">${escape(leg.date || "Date to be chosen")} · ${escape(leg.mode || "Travel")}</div><h3>${escape(leg.title)}</h3><p class="participants">${escape((leg.participants || []).map(id => people.get(id) || id).join(" · "))}</p><p class="notes">${escape(leg.notes || "")}</p></article>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(trip.title)} · Offline itinerary</title>
  <style>body{margin:auto;max-width:850px;padding:24px;font:16px/1.6 system-ui,sans-serif;color:#1a0f33;background:#fff6e8}h1,h2,h3{line-height:1.15;font-family:"Avenir Next","Inter Display","Helvetica Neue",Arial,sans-serif;font-weight:900;letter-spacing:-.02em}h1{font-size:40px;margin:8px 0}h2{margin-top:36px;border-bottom:3px solid #6b3df5;padding-bottom:8px;font-size:24px}h3{font-size:20px;margin:8px 0}header>p:first-child{font:12px ui-monospace,monospace;letter-spacing:1px;text-transform:uppercase;color:#5a4d7a}article{background:#ffffff;border:2px solid #e6dcf2;border-radius:20px;padding:18px 20px;margin:12px 0;break-inside:avoid}p{margin:6px 0;overflow-wrap:anywhere}.notice{border-left:6px solid #ff3d9a;padding:12px 16px;background:#ffe3f0;border-radius:0 16px 16px 0}.meta,.participants,.address{color:#5a4d7a;font-size:14px}.meta{font-family:ui-monospace,monospace;font-size:13px}.notes{white-space:pre-wrap}.stamp{font-size:13px;color:#5a4d7a}@media print{body{background:white;padding:0}article{border:1px solid #ccc;border-radius:0}.notice{background:white;border-left-color:black}}</style></head><body>
  <header><p>Waypoint · Saved itinerary</p><h1>${escape(trip.title)}</h1><p>${escape(trip.subtitle || "")}</p>
  <p class="stamp">Exported ${escape(exportedAt)} · Revision ${escape(snapshot.revision)}<br>Last downloaded ${escape(downloadedAt || "not recorded")} · Trip time zone: ${escape(trip.timezone || "not specified")}</p></header>
  <p class="notice">This is a private, read-only snapshot. It works without a login, internet connection, or browser storage. Changes made after export will not appear here. Save it to your phone's Files app and test opening it before departure. Share only with your travel group. You can also print or save this document as a PDF.</p>
  ${content}<section><h2>Where we're staying</h2>${stays || "<p>No stays recorded.</p>"}</section><section><h2>Journeys between places</h2>${journeys || "<p>No journeys recorded.</p>"}</section>
  <footer><p class="stamp">All times are as recorded in the itinerary. This file contains no external scripts, images, fonts, stylesheets, or live connections.</p></footer></body></html>`;
}
