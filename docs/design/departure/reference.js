/* A local visual study. No requests, persistence, or production itinerary writes. */
const $ = (selector) => document.querySelector(selector);
const familyNames = { all: 'Everyone', cedar: 'Cedar', maple: 'Maple', birch: 'Birch' };
const modal = $('#detail');
let offline = false;
const overviewTitle = $('#trip-title').innerHTML;
$('#focus-plan').addEventListener('click', () => {
  const compact = document.body.classList.toggle('compact');
  $('#trip-title').innerHTML = compact ? 'Kyoto & Osaka<span class="rust">*</span>' : overviewTitle;
  $('#focus-plan').setAttribute('aria-pressed', String(compact));
  $('#focus-plan').textContent = compact ? 'Open trip story ↗' : 'Focus on the plan ↓';
});

function renderFamily() {
  const selected = $('#family-filter').value;
  document.querySelectorAll('[data-families]').forEach((element) => {
    element.hidden = selected !== 'all' && !element.dataset.families.split(' ').includes(selected);
  });
  $('#filter-status').textContent = selected === 'all'
    ? 'All three families · shared plans appear once'
    : `${familyNames[selected]} family · shared plans keep all participant labels`;
  const routeText = {
    all: 'Everyone: Cedar + Maple in Kyoto; Birch in Osaka. Shared dinner in Kyoto on 13 June.',
    cedar: 'Cedar: stay in Kyoto, 12–14 June. Join Maple and Birch at the shared dinner on 13 June.',
    maple: 'Maple: stay in Kyoto, 12–14 June. Join Cedar and Birch at the shared dinner on 13 June.',
    birch: 'Birch: stay in Osaka, 12–14 June. Visit Kyoto for dinner on 13 June, then return to Osaka. Times to confirm.'
  };
  $('#route-filter-status').textContent = routeText[selected];
}

function renderDay() {
  document.querySelectorAll('.day').forEach((element) => {
    element.dataset.mobileHidden = String(element.dataset.day !== $('#day-filter').value);
  });
}

function showDetail(title, body, eyebrow = 'THE PLAN, UP CLOSE') {
  $('#detail-title').textContent = title;
  $('#detail-eyebrow').textContent = eyebrow;
  $('#detail-body').innerHTML = body; // Only authored constants below; never itinerary/user input.
  modal.showModal();
}

const details = {
  market: ['Eat your way through Kyoto', '<p>Saturday 12 June · afternoon · Kyoto</p><p><span class="chip cedar">Cedar</span> <span class="chip maple">Maple</span></p><p>Wander the market. Follow whatever smells good. Keep this flexible; no exact time is required.</p><p class="detail-note">Detail pattern: date, local time or day period, place, participants, editing responsibility, notes, and reviewed directions. Local-script addresses belong beside English names.</p>'],
  arrival: ['Touch down. Head out.', '<p>Saturday 12 June · 16:00 · Osaka</p><p><span class="chip birch">Birch</span></p><p>Stay in Osaka. Lodging is context; it does not restrict which city an activity can happen in.</p>'],
  walk: ['Take the scenic route', '<p>Sunday 13 June · morning · Kyoto</p><p><span class="chip cedar">Cedar</span></p><p>A garden walk, with time to get a little lost. Flexible activity; exact location still to be chosen.</p><p class="detail-note">Location to confirm. The planner should never invent an address, coordinates, or journey time.</p>'],
  dinner: ['EVERYONE. ONE TABLE.', '<p>Sunday 13 June · 18:30 local time · Kyoto</p><p><span class="chip cedar">Cedar</span> <span class="chip maple">Maple</span> <span class="chip birch">Birch</span></p><p>Fixed sample booking · planning responsibility: Cedar.</p><p>Birch is sleeping in Osaka and visiting Kyoto for dinner. The activity appears once, with all participants, in every relevant family view.</p><p class="warning">Moving a stay leaves this booking in place and flags affected participants for review.</p>'],
  museum: ['Make something.', '<p>Monday 14 June · 10:00 local time · Kyoto</p><p><span class="chip maple">Maple</span></p><p>A fictional fixed booking to demonstrate the visual state. Real booking status must be explicitly entered.</p>'],
  water: ['Follow the river', '<p>Monday 14 June · afternoon · Osaka</p><p><span class="chip birch">Birch</span></p><p>A riverside stroll and a long lunch. No reservation or exact time required.</p>']
};

document.querySelectorAll('[data-detail]').forEach((card) => card.addEventListener('click', () => {
  const [title, body] = details[card.dataset.detail];
  showDetail(title, body, offline ? 'OFFLINE · SAVED DETAILS' : 'THE PLAN, UP CLOSE');
}));
$('#close-detail').addEventListener('click', () => modal.close());
$('#family-filter').addEventListener('change', renderFamily);
$('#day-filter').addEventListener('change', renderDay);
function setView(route) {
  $('#board-tab').setAttribute('aria-pressed', String(!route));
  $('#route-tab').setAttribute('aria-pressed', String(route));
  $('#itinerary').hidden = route;
  $('#route-view').hidden = !route;
  $('.mobile-date').hidden = route;
}
$('#board-tab').addEventListener('click', () => setView(false));
$('#route-tab').addEventListener('click', () => setView(true));
$('#move-preview').addEventListener('click', () => showDetail('Move Cedar’s Kyoto stay +1 day?', '<p>Preview only · no itinerary changes.</p><ul><li><strong>Moving:</strong> Cedar’s stay, from 12–14 to 13–15 June.</li><li><strong>Offer to shift:</strong> the Cedar-only flexible garden walk, from 13 to 14 June.</li><li><strong>Keep fixed:</strong> the shared dinner stays at 18:30 on 13 June. Review whether Cedar can still attend.</li><li><strong>Resolve together:</strong> the market plan includes Maple, whose stay is not moving. Leave its date unchanged for review.</li><li><strong>Leave alone:</strong> Maple’s workshop and Birch’s stay and travel.</li></ul><p class="warning">A production confirmation must list affected people, record revisions, and the explicit choice about flexible activities. This reference has no Apply action.</p>', 'PREVIEW THE RIPPLE EFFECT'));
$('#save-info').addEventListener('click', () => showDetail('Take the plan with you.', '<p class="detail-note">This button demonstrates the reading-copy entry point. The working download remains in the live prototype.</p><p>The production action saves a self-contained HTML itinerary with names, addresses, notes, lodging, travel, revision, and download time. It must read without a network, hosted fonts, photos, login, or map tiles.</p><p>Browser reading copy, downloaded file, and online shared trip need separate, accurate state labels. A saved copy is never a promise that the service will be reachable in China.</p>', 'A READING COPY FOR THE ROAD'));
$('#idea-info').addEventListener('click', () => showDetail('Possibilities, before plans.', '<p>Tea & a quiet courtyard · a bookshop detour.</p><p>Ideas are unscheduled activities. They can have participants, notes, links, and an uncertain location before they have a date.</p><p class="detail-note">Production: open the ideas tray, then move an idea onto a day or use an accessible “Choose a day” action. This visual reference does not create records.</p>', 'ROOM TO WANDER'));
$('#offline-demo').addEventListener('click', () => {
  offline = !offline;
  document.body.classList.toggle('demo-offline', offline);
  $('#offline-banner').hidden = !offline;
  $('#offline-demo').setAttribute('aria-pressed', String(offline));
  $('#offline-demo').textContent = offline ? 'Return to online state' : 'Preview offline state';
  document.querySelectorAll('.online-action').forEach((button) => { button.disabled = offline; });
});
renderFamily();
renderDay();
