import { sampleParallelTrip, deriveBoard, previewStayShift } from "./parallel-layout.mjs";
const trip = sampleParallelTrip();
const names = new Map(trip.families.map(f => [f.id, f.name]));
const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const title = id => trip.activities.find(a => a.id === id).title;
function render() {
  document.querySelector("#parallel-board").innerHTML = deriveBoard(trip, document.querySelector("#family").value).map(day => `<section class="parallel-day"><p class="eyebrow">${new Date(day.date + "T12:00:00Z").toLocaleDateString("en-US",{weekday:"long",timeZone:"UTC"})}</p><h2>${day.date}</h2>${day.cities.map(city => `<section class="city-lane"><h3>${city.name}</h3><p>Sleeping here: ${city.staying.map(id => names.get(id)).join(" · ") || "No selected family"}</p>${city.activities.map(a => `<article class="${a.participants.length > 1 ? "shared" : ""} ${a.fixed ? "reserved" : ""}" data-activity="${a.id}"><span class="study-meta">${a.time} ${a.fixed ? "· Fixed booking" : "· Flexible"}</span><h4>${escape(a.title)}</h4><p class="study-meta">${a.participants.map(id => names.get(id)).join(" · ")}</p></article>`).join("") || '<p class="empty-lane">No planned activities here.</p>'}</section>`).join("")}${day.journeys.length ? `<div class="journeys">${day.journeys.map(j => escape(j.title)).join("<br>")}</div>` : ""}</section>`).join("");
}
document.querySelector("#family").addEventListener("change", render);
document.querySelector("#preview").addEventListener("click", () => {
  const move = previewStayShift(trip, "cedar-kyoto", 1), target = document.querySelector("#move-preview");
  target.hidden = false;
  target.innerHTML = `<h2>A preview, never an automatic reshuffle.</h2><ul><li><strong>Offer to shift Cedar-only flexible plans:</strong> ${move.shift.map(a => `${escape(title(a.id))} → ${a.date}`).join("; ")}</li><li><strong>Keep fixed bookings unchanged:</strong> ${move.fixed.map(id => escape(title(id))).join("; ")}</li><li><strong>Ask about mixed participants:</strong> ${move.mixed.map(id => escape(title(id))).join("; ")}</li><li><strong>Review connected travel manually:</strong> ${move.journeys.map(escape).join("; ")}</li></ul><p>No changes have been applied. Maple and Birch retain their own stays and activities.</p>`;
});
render();
