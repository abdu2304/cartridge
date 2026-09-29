// Controller-first spatial navigation + gamepad/keyboard input.
// Layers: the top layer receives input. A layer = { el: scope element, handlers: {action: fn} }.
// Actions: up down left right accept back x y lb rb lt rt select start
import { reactive } from 'vue';
import { sfx } from './sfx.js';

export const input = reactive({ mode: 'pad', padName: '' }); // 'pad' | 'mouse'
document.body.classList.add('pad-mode'); // the starting mode needs its class too (row snapping relies on it)
// While a direction is held down, focus jumps several times a second. Smooth scrolling can't keep
// up with that (each new animation restarts the last), so scroll instantly during a hold.
let lastRepeat = 0;
export let lastInput = 0; // for the background: it pauses while you navigate in light-effects mode
export const scrollMode = () => (performance.now() - lastRepeat < 250 ? 'auto' : 'smooth');
// A short, snappy scroll (about 120 ms, easing out) instead of the browser's slow smooth scroll.
// Presses in quick succession add up; while a direction is held it jumps instantly.
const anims = new WeakMap();
export function glideBy(sc, dx = 0, dy = 0) {
  if (!sc || (!dx && !dy)) return;
  const a = anims.get(sc);
  const tx = (a ? a.tx : sc.scrollLeft) + dx, ty = (a ? a.ty : sc.scrollTop) + dy;
  if (a) cancelAnimationFrame(a.raf);
  if (scrollMode() === 'auto' || document.body.classList.contains('motion-reduce')) { anims.delete(sc); sc.scrollLeft = tx; sc.scrollTop = ty; return; }
  const sx = sc.scrollLeft, sy = sc.scrollTop, t0 = performance.now(), D = 120;
  const st = { tx, ty, raf: 0 };
  const step = (t) => {
    const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3);
    sc.scrollLeft = sx + (tx - sx) * e; sc.scrollTop = sy + (ty - sy) * e;
    if (k < 1) st.raf = requestAnimationFrame(step); else anims.delete(sc);
  };
  anims.set(sc, st);
  st.raf = requestAnimationFrame(step);
}
export const glideTo = (sc, top) => sc && glideBy(sc, 0, top - (anims.get(sc)?.ty ?? sc.scrollTop));
const layers = [];

export function pushLayer(el, handlers = {}) {
  const layer = { el, handlers, lastFocus: document.activeElement };
  layers.push(layer);
  return {
    set handlers(h) { layer.handlers = h; },
    get handlers() { return layer.handlers; },
    pop() {
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
      const lf = layer.lastFocus;
      if (lf && document.contains(lf)) lf.focus({ preventScroll: true });
    },
  };
}

const topLayer = () => layers[layers.length - 1];

function focusables(scope, withRects = false) {
  const out = [];
  for (const el of scope.querySelectorAll('[data-focus]')) {
    if (el.disabled) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) out.push(withRects ? [el, r] : el);
  }
  return out;
}

export function focusFirst(scope, selector) {
  const layer = topLayer();
  const root = scope || layer?.el || document.body;
  const pref = selector ? root.querySelector(selector) : root.querySelector('[data-autofocus]');
  const all = focusables(root);
  // prefer content over the top-bar search box when nothing specific is asked for
  const el = pref || all.find((e) => !e.hasAttribute('data-nofirst')) || all[0];
  if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  return el;
}

function inScope(el, scope) { return el && scope.contains(el) && el.hasAttribute?.('data-focus'); }

// Moving up and down keeps to the column you started in (a short item in between doesn't pull you
// sideways); moving left or right sets a new column.
let colX = null, colFrom = null;
function move(dir) {
  const layer = topLayer();
  const scope = layer?.el || document.body;
  const cur = document.activeElement;
  if (!inScope(cur, scope)) { focusFirst(scope); return; }
  const c = cur.getBoundingClientRect();
  const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
  const vertical = dir === 'up' || dir === 'down';
  if (!vertical || colFrom !== cur) colX = cx;
  const wantX = colX;
  let best = null, bestScore = Infinity;
  for (const [el, r] of focusables(scope, true)) {
    if (el === cur) continue;
    if ((dir === 'left' || dir === 'right') && el.hasAttribute('data-nofirst') && !cur.hasAttribute('data-nofirst')) continue; // the end of a row never jumps up to the search box
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    let primary, secondary;
    if (dir === 'right') { if (r.left < c.right - 4 && x <= cx + 1) continue; primary = x - cx; secondary = overlapGap(c.top, c.bottom, r.top, r.bottom); }
    else if (dir === 'left') { if (r.right > c.left + 4 && x >= cx - 1) continue; primary = cx - x; secondary = overlapGap(c.top, c.bottom, r.top, r.bottom); }
    else if (dir === 'down') { if (r.top < c.bottom - 4 && y <= cy + 1) continue; primary = y - cy; secondary = overlapGap(c.left, c.right, r.left, r.right); }
    else { if (r.bottom > c.top + 4 && y >= cy - 1) continue; primary = cy - y; secondary = overlapGap(c.left, c.right, r.left, r.right); }
    if (primary <= 0) continue;
    let score = primary + secondary * 3 + (secondary > 0 ? 5000 : 0); // prefer aligned targets
    if (vertical) score += Math.abs(x - wantX) * 0.35; // then the one nearest your column
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) {
    sfx.move();
    best.focus({ preventScroll: true });
    colFrom = vertical ? best : null;
    scrollIntoViewSmart(best);
  } else if (vertical) {
    // Nothing further: scroll the container so hidden content becomes reachable
    const sc = cur.closest('[data-scroll]');
    if (sc) glideBy(sc, 0, dir === 'down' ? 200 : -200);
  }
}

function overlapGap(a1, a2, b1, b2) {
  if (b2 < a1) return a1 - b2;
  if (b1 > a2) return b1 - a2;
  return 0;
}

function scrollIntoViewSmart(el) {
  const r = el.getBoundingClientRect();
  // horizontal shelves: keep a card's worth of lookahead visible
  const row = el.closest('[data-hscroll]');
  if (row) {
    const rr = row.getBoundingClientRect();
    const pad = Math.min(160, rr.width * 0.18);
    if (r.left < rr.left + pad) glideBy(row, r.left - rr.left - pad, 0);
    else if (r.right > rr.right - pad) glideBy(row, r.right - rr.right + pad, 0);
  }
  const sc = el.closest('[data-scroll]');
  if (!sc) return;
  const s = sc.getBoundingClientRect();
  // nothing focusable above this one: show the top of the page too (a game's banner, a page header)
  const first = [...sc.querySelectorAll('[data-focus]')].find((x) => !x.disabled && x.offsetParent !== null);
  if (first === el) { glideTo(sc, 0); return; }
  const vpad = Math.min(120, s.height * 0.2);
  if (r.top < s.top + vpad) glideBy(sc, 0, r.top - s.top - vpad);
  else if (r.bottom > s.bottom - vpad) glideBy(sc, 0, r.bottom - s.bottom + vpad);
}

export function dispatch(action) {
  lastInput = performance.now();
  const layer = topLayer();
  setMode('pad');
  const h = layer?.handlers?.[action];
  if (action === 'accept') sfx.accept();
  else if (action === 'back') sfx.back();
  else if (['lb', 'rb'].includes(action)) sfx.tab();
  if (h && h(document.activeElement) !== false) return;
  if (['up', 'down', 'left', 'right'].includes(action)) return move(action);
  if (action === 'accept') {
    const el = document.activeElement;
    if (layer && inScope(el, layer.el)) el.click();
    else focusFirst();
  }
}

// ---------------- keyboard
const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Enter: 'accept', ' ': 'accept', Escape: 'back', Backspace: 'back',
  q: 'lb', e: 'rb', x: 'x', y: 'y', '/': 'y', Tab: 'select', m: 'start',
  PageUp: 'lt', PageDown: 'rt',
};
window.addEventListener('keydown', (ev) => {
  const t = ev.target;
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && !t.readOnly;
  if (typing && !['Escape', 'Enter', 'ArrowUp', 'ArrowDown'].includes(ev.key)) return;
  const a = KEYMAP[ev.key];
  if (!a) return;
  ev.preventDefault();
  if (ev.repeat) lastRepeat = performance.now();
  dispatch(a);
});
// ---------------- pointer: touch vs mouse
// 'auto' follows whatever was used last; 'touch' never shows a cursor; 'mouse' always does.
let pointerPref = 'auto';
let lastTouch = 0;
export function setPointerPref(p) { pointerPref = p || 'auto'; if (p === 'touch') setMode('touch'); if (p === 'mouse') setMode('mouse'); }
function setMode(m) {
  if (input.mode === m) return;
  input.mode = m;
  const b = document.body.classList;
  b.toggle('pad-mode', m === 'pad');
  b.toggle('touch-mode', m === 'touch');
  b.toggle('mouse-mode', m === 'mouse');
}
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' || e.pointerType === 'pen') { lastTouch = performance.now(); if (pointerPref !== 'mouse') setMode('touch'); }
  else if (pointerPref !== 'touch') setMode('mouse');
}, { passive: true, capture: true });
window.addEventListener('mousemove', (e) => {
  if (pointerPref === 'touch') return;
  if (performance.now() - lastTouch < 1000) return; // synthetic mouse events that follow a tap
  if (e.movementX === 0 && e.movementY === 0) return;
  setMode('mouse');
}, { passive: true });

// ---------------- gamepad
// Read on its own 8 ms timer, not once per drawn frame: without the GPU a slow frame would
// otherwise delay the press. Hold-to-repeat starts after 220 ms and speeds up the longer you hold.
const BTN = { 0: 'accept', 1: 'back', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 6: 'lt', 7: 'rt', 8: 'select', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const REPEATABLE = new Set(['up', 'down', 'left', 'right', 'lt', 'rt']);
const ACTIONS = [...new Set(Object.values(BTN))];
const state = {}; // key -> { down, next, n }
const DELAY = 220, RATE = 70, FAST = 40;

function press(key, isDown, now) {
  const s = state[key] || (state[key] = { down: false, next: 0, n: 0 });
  if (isDown && !s.down) { s.down = true; s.n = 0; s.next = now + DELAY; dispatch(key); }
  else if (isDown && s.down && REPEATABLE.has(key) && now >= s.next) { s.n++; s.next = now + (s.n > 6 ? FAST : RATE); lastRepeat = now; dispatch(key); }
  else if (!isDown) s.down = false;
}
// Triggers go by how far they are pulled, never the "pressed" flag: on Linux a trigger can read as
// half pulled (0.5, "pressed") until it first moves, which made the first LT/RT press do nothing.
// A trigger only counts once it has been seen at rest.
const armed = {}; // pad index + trigger -> seen at rest
function trigger(gp, which, v) {
  const k = gp.index + which;
  if (v < 0.6) armed[k] = true;
  return !!armed[k] && v > 0.6;
}
export const padLive = { pads: [] }; // for Settings → About → Controller test
function poll() {
  const now = performance.now();
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  const merged = {};
  for (const gp of pads) {
    input.padName = gp.id;
    gp.buttons.forEach((b, i) => {
      const a = BTN[i];
      if (!a || a === 'lt' || a === 'rt') return;
      if (b.pressed || b.value > 0.5) merged[a] = true;
    });
    if (gp.mapping === 'standard' || gp.buttons.length > 7) {
      if (trigger(gp, 'lt', gp.buttons[6]?.value ?? 0)) merged.lt = true;
      if (trigger(gp, 'rt', gp.buttons[7]?.value ?? 0)) merged.rt = true;
    }
    // pads the browser doesn't map: triggers are axes 2 and 5 resting at -1
    if (gp.mapping !== 'standard' && gp.axes.length >= 6) {
      if (trigger(gp, 'lta', (gp.axes[2] + 1) / 2)) merged.lt = true;
      if (trigger(gp, 'rta', (gp.axes[5] + 1) / 2)) merged.rt = true;
    }
    const [ax, ay] = gp.axes;
    if (ax < -0.55) merged.left = true;
    if (ax > 0.55) merged.right = true;
    if (ay < -0.55) merged.up = true;
    if (ay > 0.55) merged.down = true;
  }
  padLive.pads = pads;
  if (document.hasFocus()) for (const key of ACTIONS) press(key, !!merged[key], now);
}
setInterval(poll, 8);

export function ensureFocus(root) {
  if (!root) return;
  const a = document.activeElement;
  if (a && root.contains(a) && a.hasAttribute('data-focus')) return;
  if (layers.length > 1) return; // a modal is open
  focusFirst(root);
}
export function jump(dir, n = 4) { for (let i = 0; i < n; i++) move(dir); }

// ---------------- touch and drag scrolling
// Real touches scroll natively (touch-action pan-x/pan-y in styles.css): the browser's own
// scrolling is composited, so it tracks your finger and glides like a phone even without the GPU.
// Game Mode can deliver touches as mouse events instead; those, and mouse drags, go through the
// drag below: it follows the finger once per frame and keeps momentum on release. A drag swallows
// the click that ends it, so a swipe never opens a game.
export const lastPointer = { type: '' }; // for the controller test
const DRAG_START = 10;
let drag = null, glide = 0, pend = 0, pendRaf = 0;
function scrollerFor(el, axis) {
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (axis === 'x' && /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1) return n;
    if (axis === 'y' && /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return null;
}
function stopGlide() { cancelAnimationFrame(glide); glide = 0; }
function flush() {
  pendRaf = 0;
  if (!drag?.sc || !pend) return;
  if (drag.axis === 'x') drag.sc.scrollLeft += pend; else drag.sc.scrollTop += pend;
  pend = 0;
}
window.addEventListener('pointerdown', (e) => {
  lastPointer.type = e.pointerType;
  stopGlide();
  // real touches and pens: the browser scrolls natively
  if (e.pointerType === 'touch' || e.pointerType === 'pen') { drag = null; return; }
  if (e.button !== 0 || e.target.closest('input, textarea, [data-nodrag]')) { drag = null; return; }
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, axis: null, sc: null, target: e.target, hist: [] };
}, { capture: true, passive: true });
window.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.axis) {
    if (Math.abs(dx) < DRAG_START && Math.abs(dy) < DRAG_START) return;
    const want = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    drag.axis = want;
    drag.sc = scrollerFor(drag.target, want) || scrollerFor(drag.target, want === 'x' ? 'y' : 'x');
    if (drag.sc && !scrollerFor(drag.target, want)) drag.axis = want === 'x' ? 'y' : 'x';
    if (!drag.sc) { drag = null; return; }
    const a = anims.get(drag.sc); if (a) { cancelAnimationFrame(a.raf); anims.delete(drag.sc); }
    document.body.classList.add('dragging');
  }
  const m = drag.axis === 'x' ? drag.lx - e.clientX : drag.ly - e.clientY;
  drag.lx = e.clientX; drag.ly = e.clientY;
  pend += m;
  if (!pendRaf) pendRaf = requestAnimationFrame(flush);
  const now = performance.now();
  drag.hist.push([now, m]);
  while (drag.hist.length && now - drag.hist[0][0] > 100) drag.hist.shift();
}, { capture: true, passive: true });
function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  flush();
  const d = drag; drag = null;
  if (!d.axis) return;
  document.body.classList.remove('dragging');
  const eat = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
  window.addEventListener('click', eat, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 80);
  // momentum like a phone: starts at your finger's speed and eases out over about a second
  const span = d.hist.length > 1 ? d.hist[d.hist.length - 1][0] - d.hist[0][0] : 0;
  let v = span > 0 ? d.hist.reduce((s, h) => s + h[1], 0) / span : 0; // px per ms
  if (Math.abs(v) < 0.05) return;
  v = Math.max(-6, Math.min(6, v));
  let last = performance.now();
  const step = (t) => {
    const dt = Math.min(32, t - last); last = t;
    if (d.axis === 'x') d.sc.scrollLeft += v * dt; else d.sc.scrollTop += v * dt;
    v *= Math.pow(0.9965, dt);
    glide = Math.abs(v) > 0.015 ? requestAnimationFrame(step) : 0;
  };
  glide = requestAnimationFrame(step);
}
window.addEventListener('pointerup', endDrag, { capture: true, passive: true });
window.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.id) { drag = null; document.body.classList.remove('dragging'); } }, { capture: true, passive: true });
window.addEventListener('wheel', stopGlide, { passive: true });
window.addEventListener('touchstart', stopGlide, { passive: true });
// With touch, a tap should open things without also yanking the view around to "focus" them.
window.addEventListener('mousedown', (e) => {
  if (input.mode === 'touch' && !e.target.closest('input, textarea')) e.preventDefault();
}, { capture: true });
