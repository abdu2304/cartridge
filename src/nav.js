// Controller-first spatial navigation + gamepad/keyboard input.
// Layers: the top layer receives input. A layer = { el: scope element, handlers: {action: fn} }.
// Actions: up down left right accept back x y lb rb lt rt select start
import { reactive } from 'vue';
import { sfx } from './sfx.js';

export const input = reactive({ mode: 'pad', padName: '' }); // 'pad' | 'mouse'
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

function focusables(scope) {
  return [...scope.querySelectorAll('[data-focus]')].filter((el) => {
    if (el.disabled) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

export function focusFirst(scope, selector) {
  const layer = topLayer();
  const root = scope || layer?.el || document.body;
  const pref = selector ? root.querySelector(selector) : root.querySelector('[data-autofocus]');
  const el = pref || focusables(root)[0];
  if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  return el;
}

function inScope(el, scope) { return el && scope.contains(el) && el.hasAttribute?.('data-focus'); }

function move(dir) {
  const layer = topLayer();
  const scope = layer?.el || document.body;
  const cur = document.activeElement;
  if (!inScope(cur, scope)) { focusFirst(scope); return; }
  // Group hint: elements inside [data-nav-row] prefer staying in the same row for left/right
  const c = cur.getBoundingClientRect();
  const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of focusables(scope)) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    let primary, secondary;
    if (dir === 'right') { if (r.left < c.right - 4 && x <= cx + 1) continue; primary = x - cx; secondary = overlapGap(c.top, c.bottom, r.top, r.bottom); }
    else if (dir === 'left') { if (r.right > c.left + 4 && x >= cx - 1) continue; primary = cx - x; secondary = overlapGap(c.top, c.bottom, r.top, r.bottom); }
    else if (dir === 'down') { if (r.top < c.bottom - 4 && y <= cy + 1) continue; primary = y - cy; secondary = overlapGap(c.left, c.right, r.left, r.right); }
    else { if (r.bottom > c.top + 4 && y >= cy - 1) continue; primary = cy - y; secondary = overlapGap(c.left, c.right, r.left, r.right); }
    if (primary <= 0) continue;
    const score = primary + secondary * 3 + (secondary > 0 ? 5000 : 0); // prefer aligned targets
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) {
    sfx.move();
    best.focus({ preventScroll: true });
    scrollIntoViewSmart(best);
  } else if (dir === 'up' || dir === 'down') {
    // Nothing further: scroll the container so hidden content becomes reachable
    const sc = cur.closest('[data-scroll]');
    if (sc) sc.scrollBy({ top: dir === 'down' ? 200 : -200, behavior: 'smooth' });
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
    if (r.left < rr.left + pad) row.scrollBy({ left: r.left - rr.left - pad, behavior: 'smooth' });
    else if (r.right > rr.right - pad) row.scrollBy({ left: r.right - rr.right + pad, behavior: 'smooth' });
  }
  const sc = el.closest('[data-scroll]');
  if (!sc) return;
  const s = sc.getBoundingClientRect();
  const vpad = Math.min(120, s.height * 0.2);
  if (r.top < s.top + vpad) sc.scrollBy({ top: r.top - s.top - vpad, behavior: 'smooth' });
  else if (r.bottom > s.bottom - vpad) sc.scrollBy({ top: r.bottom - s.bottom + vpad, behavior: 'smooth' });
}

export function dispatch(action) {
  const layer = topLayer();
  input.mode = 'pad';
  document.body.classList.add('pad-mode');
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
  dispatch(a);
});
window.addEventListener('mousemove', () => {
  if (input.mode !== 'mouse') { input.mode = 'mouse'; document.body.classList.remove('pad-mode'); }
}, { passive: true });

// ---------------- gamepad
const BTN = { 0: 'accept', 1: 'back', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 6: 'lt', 7: 'rt', 8: 'select', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const REPEATABLE = new Set(['up', 'down', 'left', 'right', 'lt', 'rt']);
const state = {}; // key -> { down, next }
const DELAY = 380, RATE = 85;

function press(key, isDown, now) {
  const s = state[key] || (state[key] = { down: false, next: 0 });
  if (isDown && !s.down) { s.down = true; s.next = now + DELAY; dispatch(key); }
  else if (isDown && s.down && REPEATABLE.has(key) && now >= s.next) { s.next = now + RATE; dispatch(key); }
  else if (!isDown) s.down = false;
}

function poll() {
  const now = performance.now();
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  const merged = {};
  for (const gp of pads) {
    input.padName = gp.id;
    gp.buttons.forEach((b, i) => { const a = BTN[i]; if (a && (b.pressed || b.value > 0.5)) merged[a] = true; });
    const [ax, ay] = gp.axes;
    if (ax < -0.55) merged.left = true;
    if (ax > 0.55) merged.right = true;
    if (ay < -0.55) merged.up = true;
    if (ay > 0.55) merged.down = true;
  }
  if (document.hasFocus()) for (const key of new Set([...Object.values(BTN)])) press(key, !!merged[key], now);
  requestAnimationFrame(poll);
}
requestAnimationFrame(poll);

export function ensureFocus(root) {
  if (!root) return;
  const a = document.activeElement;
  if (a && root.contains(a) && a.hasAttribute('data-focus')) return;
  if (layers.length > 1) return; // a modal is open
  focusFirst(root);
}
export function jump(dir, n = 4) { for (let i = 0; i < n; i++) move(dir); }
