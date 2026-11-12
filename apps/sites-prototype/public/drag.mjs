// Direct manipulation for activity cards. The board is rendered as HTML strings,
// so this is a small DOM controller rather than a React drag library.
// Mouse/pen: press and move. Touch: press and hold (~0.4 s) to pick up, so a
// quick swipe still scrolls and a tap still opens the activity.
// While dragging, a dock of day chips appears; hovering a chip switches the
// visible day (the phone shows one day at a time) and dropping on it moves there.

const HOLD_MS = 420, TOUCH_SLOP = 10, MOUSE_SLOP = 6, DWELL_MS = 450, EDGE = 56;

/** The first card whose vertical midpoint is below `y`; null means "place last". */
export function beforeIdAt(items, y) {
  for (const item of items) if (y < item.top + item.height / 2) return item.id;
  return null;
}

export function enableDrag(options) {
  const { canDrag, onDrop, onDayHover, dock, describe, currentDay } = options, document = options.document;
  let pending = null, drag = null, suppressClick = false;

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
    document.body.append(ghost);
    card.classList.add('drag-source');
    document.body.classList.add('is-dragging');
    const dockEl = renderDock(info);
    drag = { card, id: card.dataset.detail, info, ghost, dockEl, dx: Math.min(x - rect.left, 340), dy: y - rect.top + (touch ? 28 : 0), x, y, target: null, marker: null, dwell: null, raf: 0, touch };
    navigator.vibrate?.(12);
    move(x, y);
    drag.raf = requestAnimationFrame(autoScroll);
  }

  function renderDock(info) {
    const el = document.createElement('div');
    el.className = 'drop-dock';
    el.setAttribute('role', 'status');
    el.innerHTML = `<p><strong>Moving “${esc(info.title)}”</strong> · ${esc(info.note)}</p><ol>${dock().map(d => `<li data-drop-date="${esc(d.date ?? '')}" class="${d.current ? 'current' : ''} ${info.fixed && (d.date ?? null) !== info.date ? 'drop-blocked' : ''}"><span>${esc(d.top)}</span><b>${esc(d.big)}</b></li>`).join('')}</ol>`;
    document.body.append(el);
    el.querySelector('.current')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    return el;
  }

  function locate(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
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
    // Over the day bar, shrink the floating card and lift it above the bar so the chips stay visible.
    const dockTop = drag.dockEl.getBoundingClientRect().top, overDock = y > dockTop - 8;
    const scale = overDock ? 0.45 : drag.touch ? 0.85 : 1, h = drag.ghost.offsetHeight * scale;
    const gx = x - drag.dx * scale, gy = overDock ? dockTop - h - 12 : y - drag.dy * scale;
    drag.ghost.style.transform = `translate(${gx}px, ${gy}px) scale(${scale}) rotate(-1.5deg)`;
    const t = locate(x, y), d = drag;
    const same = d.target && t && d.target.date === t.date && d.target.beforeId === t.beforeId && d.target.chip === t.chip;
    if (same) return;
    clearTarget();
    d.target = t;
    if (!t) return;
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
    if (commit && d.target) onDrop({ activityId: d.id, date: d.target.date, beforeId: d.target.beforeId, viaChip: !!d.target.chip });
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

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && drag) { e.preventDefault(); e.stopPropagation(); drag.target = null; finish(false); } }, true);
  // A finished drag must not also open the activity editor.
  document.addEventListener('click', e => { if (suppressClick && cardFrom(e.target)) { e.preventDefault(); e.stopPropagation(); } }, true);

  return { get active() { return !!drag; }, cancel: () => finish(false) };
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
