// Direct manipulation for activity cards. The board is rendered as HTML strings,
// so this is a small DOM controller rather than a React drag library.
// Mouse/pen: press and move. Touch: press and hold (~0.4 s) to pick up, so a
// quick swipe still scrolls and a tap still opens the activity.
// While dragging, a dock of day chips appears; hovering a chip switches the
// visible day (the phone shows one day at a time) and dropping on it moves there.

const HOLD_MS = 350, TOUCH_SLOP = 8, MOUSE_SLOP = 6, DWELL_MS = 450, EDGE = 56;

// The drag visuals ship with this module so a stale or replaced stylesheet can never
// leave the floating card and day bar unstyled. Colours fall back if tokens are absent.
const CSS_TEXT = `
.drag-hint:not(:empty){font:12px var(--font-mono,monospace);color:var(--orchid,#cdb8ff);margin:8px 0 0}
.can-drag .activity{cursor:grab;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
body.is-dragging,body.is-dragging *{cursor:grabbing!important;-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}
.activity.drag-source{opacity:.35;outline:2px dashed currentColor;outline-offset:-2px;box-shadow:none;transform:none}
.drag-ghost{position:fixed!important;left:0!important;top:0!important;right:auto!important;bottom:auto!important;transform-origin:0 0;z-index:1000;pointer-events:none;margin:0!important;box-shadow:0 10px 30px rgba(0,0,0,.45),0 0 0 3px var(--lagoon,#3ee6c9)!important;opacity:.97;will-change:transform}
.agenda-day.drop-target,.ideas.drop-target{outline:3px solid var(--lagoon,#3ee6c9);outline-offset:-3px}
.agenda-day.drop-blocked-hover,.ideas.drop-blocked-hover{outline:3px dashed var(--ember,#ff7a45);outline-offset:-3px}
.drop-marker{height:0;border-top:4px solid var(--lagoon,#3ee6c9);margin:-10px 0 6px;position:relative}
.drop-marker::before{content:"";position:absolute;left:-2px;top:-8px;width:12px;height:12px;border-radius:50%;background:var(--lagoon,#3ee6c9)}
.drop-dock{position:fixed;left:0;right:0;bottom:0;z-index:999;box-sizing:border-box;background:var(--dusk,#22114d);color:var(--cream,#fff6e8);border-top:3px solid var(--lagoon,#3ee6c9);box-shadow:0 -12px 32px rgba(0,0,0,.45);padding:12px 12px calc(12px + env(safe-area-inset-bottom));font-family:var(--font-mono,monospace);-webkit-user-select:none;user-select:none}
.drop-dock h2{margin:0 0 2px;font:800 17px/1.2 var(--font-display,sans-serif);letter-spacing:.2px;color:var(--lagoon,#3ee6c9)}
.drop-dock p{margin:0 0 10px;font-size:12px;line-height:1.4;overflow-wrap:anywhere}
.drop-dock ol{display:flex;gap:8px;overflow-x:auto;list-style:none;margin:0;padding:0;scrollbar-width:none}
.drop-dock li{flex:0 0 auto;box-sizing:border-box;min-width:68px;min-height:60px;border:2px solid var(--orchid,#cdb8ff);border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:12px;padding:4px 10px;text-transform:uppercase}
.drop-dock li b{font:800 24px/1.1 var(--font-display,sans-serif);text-transform:none}
.drop-dock li.current{border-style:dashed}
.drop-dock li.current::after{content:"showing";font-size:9px;letter-spacing:.5px}
.drop-dock li.drop-active{background:var(--lagoon,#3ee6c9);color:var(--ink,#1a0f33);border-color:var(--lagoon,#3ee6c9);border-style:solid;transform:scale(1.06)}
.drop-dock li.drop-blocked{opacity:.45;border-style:dashed}
.drop-dock li.drop-blocked.drop-active{background:var(--ember,#ff7a45);color:var(--ink,#1a0f33);border-color:var(--ember,#ff7a45)}
.drop-dock .drop-cancel{display:none}
.drop-dock.touch ol.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));overflow:visible}
.drop-dock.touch .drop-cancel{display:flex;align-items:flex-start;justify-content:center;margin:10px -12px calc(-12px - env(safe-area-inset-bottom));padding:10px 12px;min-height:84px;box-sizing:border-box;border-top:1px dashed var(--orchid,#cdb8ff);font-size:12px;color:var(--orchid,#cdb8ff)}
.drop-dock.touch .drop-cancel.drop-active{background:rgba(255,255,255,.12);color:var(--cream,#fff6e8)}
.activity.just-moved{animation:waypoint-landed .8s ease-out}
.activity.drop-refused{animation:waypoint-refused .45s ease-in-out}
@keyframes waypoint-landed{0%{box-shadow:0 0 0 6px var(--lagoon,#3ee6c9)}100%{box-shadow:0 0 0 0 transparent}}
@keyframes waypoint-refused{0%,100%{transform:none}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
@media(prefers-reduced-motion:reduce){.activity.just-moved,.activity.drop-refused{animation:none}.drop-dock li.drop-active{transform:none}}
@media(max-height:520px){.drop-dock h2{display:none}.drop-dock.touch ol.grid{display:flex;overflow-x:auto}.drop-dock.touch .drop-cancel{min-height:44px;margin-top:6px}}
`;

/** The first card whose vertical midpoint is below `y`; null means "place last". */
export function beforeIdAt(items, y) {
  for (const item of items) if (y < item.top + item.height / 2) return item.id;
  return null;
}

export function enableDrag(options) {
  const { canDrag, onDrop, onDayHover, dock, describe, currentDay } = options, document = options.document;
  let pending = null, drag = null, suppressClick = false;
  if (document.head?.append && document.createElement && !document.getElementById?.('waypoint-drag-css')) {
    const style = document.createElement('style');
    style.id = 'waypoint-drag-css';
    style.textContent = CSS_TEXT;
    document.head.append(style);
  }

  const cardFrom = target => {
    const el = target?.closest?.('.activity[data-detail]');
    return el && el.closest('.can-drag') ? el : null;
  };

  function begin(card, x, y, touch) {
    if (!canDrag()) return;
    const rect = card.getBoundingClientRect(), info = describe(card.dataset.detail);
    if (!info) return;
    const ghost = card.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.removeAttribute('data-detail');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = `${Math.min(rect.width, 360)}px`;
    // Essentials inline as well: the floating card must never fall back into the page flow.
    Object.assign(ghost.style, { position: 'fixed', left: '0', top: '0', margin: '0', pointerEvents: 'none', zIndex: '1000', transformOrigin: '0 0' });
    document.body.append(ghost);
    document.getSelection?.()?.removeAllRanges?.();
    card.classList.add('drag-source');
    document.body.classList.add('is-dragging');
    const dockEl = renderDock(info, touch);
    drag = { card, id: card.dataset.detail, info, ghost, dockEl, dx: Math.min(x - rect.left, 340), dy: y - rect.top, gw: ghost.offsetWidth, gh: ghost.offsetHeight, x, y, target: null, marker: null, dwell: null, raf: 0, touch };
    navigator.vibrate?.(12);
    move(x, y);
    drag.raf = requestAnimationFrame(autoScroll);
  }

  function renderDock(info, touch) {
    const el = document.createElement('div'), chips = dock();
    el.className = `drop-dock${touch ? ' touch' : ''}`;
    el.setAttribute('role', 'status');
    Object.assign(el.style, { position: 'fixed', left: '0', right: '0', bottom: '0', zIndex: '999' });
    // On a phone a wrapping grid shows every day at once; long trips fall back to one scrolling row.
    el.innerHTML = `<h2>${info.fixed ? 'Fixed booking: reorder within its day' : 'Drop on a day'}</h2><p>Moving “${esc(info.title)}” · ${esc(info.note)}</p><ol class="${touch && chips.length <= 12 ? 'grid' : ''}">${dock().map(d => `<li data-drop-date="${esc(d.date ?? '')}" class="${d.current ? 'current' : ''} ${info.fixed && (d.date ?? null) !== info.date ? 'drop-blocked' : ''}"><span>${esc(d.top)}</span><b>${esc(d.big)}</b></li>`).join('')}</ol><div class="drop-cancel" data-drop-cancel>Slide here and let go to cancel</div>`;
    document.body.append(el);
    el.querySelector('.current')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    return el;
  }

  function locate(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const cancel = el.closest('[data-drop-cancel]');
    if (cancel) return { cancel: true, chip: cancel };
    const chip = el.closest('[data-drop-date]');
    if (chip && drag.dockEl.contains(chip)) return { date: chip.dataset.dropDate || null, beforeId: null, chip };
    if (el.closest('.drop-dock')) return null;
    if (el.closest('.ideas')) return { date: null, beforeId: null, zone: el.closest('.ideas') };
    const day = el.closest('.can-drag .agenda-day[data-date]');
    if (!day) return null;
    const cards = [...day.querySelectorAll('.activity[data-detail]')].filter(c => c !== drag.card);
    const items = cards.map(c => { const r = c.getBoundingClientRect(); return { id: c.dataset.detail, top: r.top, height: r.height }; });
    return { date: day.dataset.date, beforeId: beforeIdAt(items, y), zone: day };
  }

  function move(x, y) {
    drag.x = x; drag.y = y;
    const dockTop = drag.dockEl.getBoundingClientRect().top, overDock = y > dockTop - 8;
    let scale, gx, gy;
    if (drag.touch) {
      // A small copy rides just above the fingertip, so neither the finger nor the card hides the target.
      scale = Math.min(0.5, 150 / drag.gh);
      const w = drag.gw * scale, h = drag.gh * scale;
      gx = Math.max(8, Math.min(x - w / 2, window.innerWidth - w - 8));
      gy = Math.max(8, Math.min(y, overDock ? dockTop : Infinity) - h - 28);
    } else {
      // Over the day bar, shrink the floating card and lift it above the bar so the chips stay visible.
      scale = overDock ? 0.45 : 1;
      gx = x - drag.dx * scale;
      gy = overDock ? dockTop - drag.gh * scale - 12 : y - drag.dy * scale;
    }
    drag.ghost.style.transform = `translate(${gx}px, ${gy}px) scale(${scale}) rotate(-1.5deg)`;
    const t = locate(x, y), d = drag;
    const same = d.target && t && d.target.date === t.date && d.target.beforeId === t.beforeId && d.target.chip === t.chip;
    if (same) return;
    clearTarget();
    d.target = t;
    if (!t) return;
    if (t.cancel) { t.chip.classList.add('drop-active'); return; }
    const blocked = d.info.fixed && t.date !== d.info.date;
    (t.chip || t.zone).classList.add(blocked ? 'drop-blocked-hover' : 'drop-target');
    if (t.chip) {
      t.chip.classList.add('drop-active');
      // Hovering a day chip briefly shows that day, so the card can be placed precisely.
      if (t.date && t.date !== currentDay()) d.dwell = setTimeout(() => {
        if (drag !== d || d.target?.chip !== t.chip) return;
        onDayHover(t.date);
        for (const li of d.dockEl.querySelectorAll('[data-drop-date]')) li.classList.toggle('current', li.dataset.dropDate === t.date);
      }, DWELL_MS);
    } else if (!blocked && t.zone.matches('.agenda-day')) {
      d.marker = document.createElement('div');
      d.marker.className = 'drop-marker';
      d.marker.setAttribute('aria-hidden', 'true');
      const anchor = t.beforeId && t.zone.querySelector(`.activity[data-detail="${CSS.escape(t.beforeId)}"]`);
      if (anchor) anchor.before(d.marker);
      else (([...t.zone.querySelectorAll('.cards')].at(-1)) || t.zone).append(d.marker);
    }
  }

  function clearTarget() {
    const t = drag?.target;
    clearTimeout(drag?.dwell);
    drag?.marker?.remove();
    if (drag) drag.marker = null;
    if (t) { (t.chip || t.zone)?.classList.remove('drop-target', 'drop-blocked-hover', 'drop-active'); t.chip?.classList.remove('drop-active'); }
  }

  function autoScroll() {
    if (!drag) return;
    const { x, y } = drag, h = window.innerHeight, dockTop = drag.dockEl.getBoundingClientRect().top;
    const board = document.querySelector('#itinerary.can-drag');
    let scrolled = false;
    // Vertical page scroll near the top edge or just above the dock.
    if (y < EDGE) { window.scrollBy(0, -12); scrolled = true; }
    else if (y > dockTop - EDGE && y < dockTop) { window.scrollBy(0, 12); scrolled = true; }
    if (board && board.scrollWidth > board.clientWidth) {
      const r = board.getBoundingClientRect();
      if (y > r.top && y < r.bottom) {
        if (x < r.left + EDGE) { board.scrollLeft -= 14; scrolled = true; }
        else if (x > r.right - EDGE) { board.scrollLeft += 14; scrolled = true; }
      }
    }
    if (board && board.scrollHeight > board.clientHeight) {
      const r = board.getBoundingClientRect();
      const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, dockTop); // the dock may cover the board's lower edge
      if (x > r.left && x < r.right && bottom - top > EDGE * 3) {
        if (y < top + EDGE && y > top) { board.scrollTop -= 12; scrolled = true; }
        else if (y > bottom - EDGE && y < bottom) { board.scrollTop += 12; scrolled = true; }
      }
    }
    const chips = drag.dockEl.querySelector('ol');
    if (y > dockTop) {
      if (x < EDGE) { chips.scrollLeft -= 10; scrolled = true; }
      else if (x > window.innerWidth - EDGE) { chips.scrollLeft += 10; scrolled = true; }
    }
    if (scrolled) move(drag.x, drag.y);
    drag.raf = requestAnimationFrame(autoScroll);
  }

  function finish(commit) {
    const d = drag;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    clearTarget();
    drag = null;
    d.ghost.remove(); d.dockEl.remove();
    d.card.classList.remove('drag-source');
    document.body.classList.remove('is-dragging');
    // Swallow only the click the browser synthesizes from this same release.
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    if (commit && d.target && !d.target.cancel) onDrop({ activityId: d.id, date: d.target.date, beforeId: d.target.beforeId, viaChip: !!d.target.chip });
  }

  function cancelPending() { if (pending) { clearTimeout(pending.timer); pending = null; } }

  // Mouse and pen.
  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' || e.button !== 0 || drag) return;
    const card = cardFrom(e.target);
    if (card && canDrag()) pending = { card, x: e.clientX, y: e.clientY, mouse: true };
  });
  document.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    if (drag && !drag.touch) { e.preventDefault(); move(e.clientX, e.clientY); return; }
    if (pending?.mouse && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > MOUSE_SLOP) { const p = pending; pending = null; begin(p.card, e.clientX, e.clientY, false); }
  });
  document.addEventListener('pointerup', e => { if (e.pointerType === 'touch') return; cancelPending(); if (drag && !drag.touch) finish(true); });
  document.addEventListener('pointercancel', e => { if (e.pointerType === 'touch') return; cancelPending(); if (drag && !drag.touch) finish(false); });

  // Touch: hold to pick up; moving first means the person is scrolling.
  document.addEventListener('touchstart', e => {
    if (drag || e.touches.length !== 1) { cancelPending(); return; }
    const card = cardFrom(e.target);
    if (!card || !canDrag()) return;
    const t = e.touches[0];
    pending = { card, x: t.clientX, y: t.clientY, timer: setTimeout(() => { const p = pending; pending = null; if (p) begin(p.card, p.x, p.y, true); }, HOLD_MS) };
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (drag?.touch) { e.preventDefault(); move(t.clientX, t.clientY); return; }
    if (pending && !pending.mouse && Math.hypot(t.clientX - pending.x, t.clientY - pending.y) > TOUCH_SLOP) cancelPending();
  }, { passive: false });
  document.addEventListener('touchend', e => { cancelPending(); if (drag?.touch) { e.preventDefault(); finish(true); } }, { passive: false });
  document.addEventListener('touchcancel', () => { cancelPending(); if (drag?.touch) finish(false); });
  document.addEventListener('contextmenu', e => { if (drag || (pending && !pending.mouse)) e.preventDefault(); });
  document.addEventListener('selectstart', e => { if (drag || (pending && !pending.mouse)) e.preventDefault(); });

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && drag) { e.preventDefault(); e.stopPropagation(); drag.target = null; finish(false); } }, true);
  // A finished drag must not also open the activity editor.
  document.addEventListener('click', e => { if (suppressClick && cardFrom(e.target)) { e.preventDefault(); e.stopPropagation(); } }, true);

  return { get active() { return !!drag; }, cancel: () => finish(false) };
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
