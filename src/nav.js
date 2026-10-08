// Controller-first spatial navigation + gamepad/keyboard input.
// Layers: the top layer receives input. A layer = { el: scope element, handlers: {action: fn} }.
// Actions: up down left right accept back x y lb rb lt rt select start
import { springTo, stopSpring, skipMorph, governor, governorInput } from './motion.js';
import { reactive } from 'vue';
import { sfx } from './sfx.js';

export const input = reactive({ mode: 'pad', padName: '', keys: false }); // 'pad' | 'mouse'; keys: in pad mode, the last press was a keyboard's (0.9.38, for the tour's hints)
document.body.classList.add('pad-mode'); // the starting mode needs its class too (row snapping relies on it)
// While a direction is held down, focus jumps several times a second. Smooth scrolling can't keep
// up with that (each new animation restarts the last), so scroll instantly during a hold.
let lastRepeat = 0;
export let lastInput = 0; // for the background: it pauses while you navigate in light-effects mode
export const scrollMode = () => (performance.now() - lastRepeat < 250 ? 'auto' : 'smooth');
// A short, snappy scroll (about 120 ms, easing out) instead of the browser's slow smooth scroll.
// Presses in quick succession add up; while a direction is held it jumps instantly.
const anims = new WeakMap();
// A pressed with a controller shows the same squeeze a held mouse or finger gets (:active), 0.9.17
function pressFx(el) {
  if (!el?.classList) return;
  el.classList.add('pressed');
  setTimeout(() => el.classList.remove('pressed'), 110);
  shine(el);
}
// 0.9.44 (liquid-glass skill: interactive glass shimmers when pressed): a light sweep across a glass button, longer
// than the squeeze, so it gets its own class; only drawn in Glass (styles.css .lg-shine)
function shine(el) {
  const b = el?.closest?.('.btn');
  if (!b || !document.body.classList.contains('elements-glass')) return;
  b.classList.remove('lg-shine'); void b.offsetWidth; b.classList.add('lg-shine');
  clearTimeout(b._shine); b._shine = setTimeout(() => b.classList.remove('lg-shine'), 650);
}
if (typeof document !== 'undefined') document.addEventListener('pointerdown', (e) => shine(e.target), true);
export function glideBy(sc, dx = 0, dy = 0) {
  if (!sc || (!dx && !dy)) return;
  let a = anims.get(sc);
  const tx = (a ? a.tx : sc.scrollLeft) + dx, ty = (a ? a.ty : sc.scrollTop) + dy;
  if (scrollMode() === 'auto' || document.body.classList.contains('motion-reduce')) { if (a) { stopSpring(a.sx); stopSpring(a.sy); } anims.delete(sc); sc.scrollLeft = tx; sc.scrollTop = ty; return; }
  // 0.9.37 (apple-design: interruptible, velocity kept): a critically damped spring per axis. A press while it still
  // moves only moves the target, so held or quick presses blend into one glide instead of stopping and restarting.
  // Between rows a little softer than along a row (0.9.15, owner: up/down felt rough).
  if (!a) { a = { sx: { x: sc.scrollLeft }, sy: { x: sc.scrollTop } }; anims.set(sc, a); }
  else { if (!a.sx.raf) a.sx.x = sc.scrollLeft; if (!a.sy.raf) a.sy.x = sc.scrollTop; } // moved by hand since: start from where it is
  a.tx = tx; a.ty = ty;
  const rows = Math.abs(dy) >= Math.abs(dx);
  const end = () => { if (!a.sx.raf && !a.sy.raf) anims.delete(sc); };
  if (dx || a.sx.raf) springTo(a.sx, tx, { response: rows ? 0.3 : 0.2, apply: (v) => { sc.scrollLeft = v; }, done: end });
  if (dy || a.sy.raf) springTo(a.sy, ty, { response: rows ? 0.3 : 0.2, apply: (v) => { sc.scrollTop = v; }, done: end });
}
export const glideTo = (sc, top) => sc && glideBy(sc, 0, top - (anims.get(sc)?.ty ?? sc.scrollTop));
// 0.9.38: a glide still running would carry on over whatever the box shows next (Settings' pane between sections)
export function stopScroll(sc) { const a = sc && anims.get(sc); if (a) { stopSpring(a.sx); stopSpring(a.sy); anims.delete(sc); } }
const layers = [];

export function pushLayer(el, handlers = {}) {
  const layer = { el, handlers, lastFocus: document.activeElement };
  layers.push(layer);
  return {
    set handlers(h) { layer.handlers = h; },
    get handlers() { return layer.handlers; },
    // hand a press to the layer underneath (0.9.37: the tour lets the app do what it teaches)
    below(action) { const i = layers.indexOf(layer); for (let j = i - 1; j >= 0; j--) { const h = layers[j].handlers?.[action]; if (h) return h(document.activeElement); } },
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

// Focus never falls through (0.9.47, owner: "highlights have disappeared", "I don't know what I'm selecting"): a focused
// button that turns disabled while it works (busy), or a row that re-renders away, drops focus to <body> without any
// event. Nothing was highlighted and A only woke focus up. Checked every 150 ms in pad mode: back to the same button
// once it's enabled again (up to 20 s), else the nearest focusable in the top layer, where the old one was.
let kept = null;
function keepFocus() {
  const a = document.activeElement;
  if (a && a !== document.body) {
    if (a.hasAttribute?.('data-focus')) { const r = a.getBoundingClientRect(); if (r.width) kept = { el: a, x: r.left + r.width / 2, y: r.top + r.height / 2, t: performance.now() }; }
    return;
  }
  if (!kept || input.mode !== 'pad' || !document.hasFocus()) return;
  const l = topLayer();
  if (!l) return;
  const { el } = kept;
  if (el.isConnected && !el.disabled && el.offsetParent !== null && inScope(el, l.el)) { el.focus({ preventScroll: true }); return; }
  if (el.isConnected && el.disabled && l.el.contains(el) && performance.now() - kept.t < 20000) return; // still busy: wait for it
  // 0.9.49 (owner: opening Missing from Steam unfolded the search first): while a new page loads it has nothing to
  // focus, and the nearest thing was the Dock's search, which opens on focus. On the page itself, only the page is a
  // fallback; nothing there yet means wait for it (up to the 20 s above)
  const main = l.el === document.body ? document.querySelector('main.main') : null;
  if (main && main.contains(el) === false && !el.isConnected && performance.now() - kept.t < 20000 && !focusables(main).length) return;
  let best = null, bd = Infinity;
  for (const [c, r] of focusables(main || l.el, true)) { const d = Math.hypot(r.left + r.width / 2 - kept.x, r.top + r.height / 2 - kept.y); if (d < bd) { bd = d; best = c; } }
  if (!best && main && performance.now() - kept.t < 20000) return; // the page is still loading
  kept = null;
  best?.focus({ preventScroll: true });
}
if (typeof window !== 'undefined') setInterval(keepFocus, 150);

// Moving up and down keeps to the column you started in (a short item in between doesn't pull you
// sideways); moving left or right sets a new column.
let colX = null, colFrom = null;
function move(dir) {
  const layer = topLayer();
  const scope = layer?.el || document.body;
  const cur = document.activeElement;
  // the focused button went away (it swapped for another, a list reloaded): stay in the part of the
  // screen you were in instead of jumping to the first item on the page (Settings' list: A4)
  if (!inScope(cur, scope)) { focusFirst(lastZone && document.contains(lastZone) && scope.contains(lastZone) ? lastZone : scope); return; }
  const c = cur.getBoundingClientRect();
  const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
  const vertical = dir === 'up' || dir === 'down';
  if (!vertical || colFrom !== cur) colX = cx;
  const wantX = colX;
  let best = null, bestScore = Infinity;
  // Zones (0.9.2): the D-pad never leaves the part of the screen you're in. The page is a zone, so
  // up never lands on the top bar (LT/RT and Y reach that); Settings' right side is one too, left
  // with B, like other console menus.
  // a pop-up is a zone of its own (0.9.60: without one, down in a pop-up's list went to its Close button whenever the next
  // card was still below the visible part of the list; owner's photo of Where Your Saves Are)
  const zone = cur.closest('[data-zone]') || (layer && layer.el !== document.body ? layer.el : null);
  // Up and down stay inside the list you're scrolling while it has more in that direction. The row
  // above can be scrolled behind a toolbar, which otherwise looked nearer (Library: A3).
  const sc = vertical ? cur.closest('[data-scroll]') : null;
  const inList = sc && zone?.contains(sc) && sc !== zone && focusables(sc, true).some(([el, r]) => el !== cur && (dir === 'up' ? r.bottom <= c.top + 4 : r.top >= c.bottom - 4));
  const cands = focusables(scope, true).filter(([el]) => el !== cur && !(zone && !zone.contains(el)) && !(inList && !sc.contains(el)));
  if (vertical) best = pickRow(dir, cur, c, cands, wantX);
  else {
    // left and right stay in the row you're in (owner, 0.9.16): at its end nothing happens, never a
    // jump to the row above or below
    for (const [el, r] of cands) {
      if (el.hasAttribute('data-nofirst') && !cur.hasAttribute('data-nofirst')) continue; // the end of a row never jumps up to the search box
      if (overlapGap(c.top, c.bottom, r.top, r.bottom) > 0) continue;
      const x = r.left + r.width / 2;
      let primary;
      if (dir === 'right') { if (r.left < c.right - 4 && x <= cx + 1) continue; primary = x - cx; }
      else { if (r.right > c.left + 4 && x >= cx - 1) continue; primary = cx - x; }
      if (primary <= 0) continue;
      const score = primary + Math.abs((r.top + r.height / 2) - cy) * 0.5;
      if (score < bestScore) { bestScore = score; best = el; }
    }
  }
  // columns of cards ([data-columns]): left and right go to the other column's nearest card, level or not
  const colsH = !vertical && !best ? cur.closest('[data-columns]') : null;
  if (colsH) {
    let d = Infinity;
    for (const [el, r] of cands) {
      if (!colsH.contains(el) || (dir === 'right' ? r.left < c.right - 4 : r.right > c.left + 4)) continue;
      const dy = Math.abs(r.top + r.height / 2 - cy) + Math.abs((dir === 'right' ? r.left - c.right : c.left - r.right)) * 0.25;
      if (dy < d) { d = dy; best = el; }
    }
  }
  // In a pop-up's long list, right with nothing to the right jumps to the button at its bottom right (Apply,
  // Done...), so a long list never has to be walked to its end (0.9.24, owner). Pages aren't pop-ups.
  if (!best && dir === 'right' && layer && layer.el !== document.body && cur.closest('[data-scroll]')) {
    const out = focusables(scope).filter((el) => !el.closest('[data-scroll]'));
    best = out[out.length - 1] || null;
  }
  if (best) {
    sfx.move();
    rumble();
    best.focus({ preventScroll: true });
    colFrom = vertical ? best : null;
    scrollIntoViewSmart(best);
  } else if (vertical) {
    // Nothing further: scroll the container so hidden content becomes reachable
    const sc = cur.closest('[data-scroll]');
    const room = sc ? (dir === 'down' ? sc.scrollHeight - sc.clientHeight - sc.scrollTop : sc.scrollTop) > 1 : false;
    if (room) glideBy(sc, 0, dir === 'down' ? 200 : -200);
    else edgeBump(cur);
  } else edgeBump(cur);
}
// the end of a list: one soft settle the first time you push against it, not a buzz while the direction is held
let edgeEl = null, edgeAt = 0;
function edgeBump(cur) { const t = performance.now(); if (cur !== edgeEl || t - edgeAt > 900) rumble('settle'); edgeEl = cur; edgeAt = t; }
if (typeof addEventListener !== 'undefined') addEventListener('cae-settle', () => rumble('settle'));

// Up and down (0.9.16, owner): always the very next row, never one further down because it happened
// to line up better. Landing in a game row (a sideways shelf) goes to its first game; in another
// row, to its first item (Ready to play, not More); within one grid of cards the column is kept.
function pickRow(dir, cur, c, cands, wantX) {
  const below = dir === 'down';
  const pool = cands.filter(([, r]) => (below ? r.top >= c.bottom - 8 : r.bottom <= c.top + 8));
  if (!pool.length) return null;
  // columns of cards of different heights ([data-columns], 0.9.49, owner: on the Emulators page down from RetroArch went
  // to RPCS3 in the other column): up and down stay in the column you're in, while it has more
  const cols = cur.closest('[data-columns]');
  if (cols) {
    const same = pool.filter(([el, r]) => cols.contains(el) && r.left < c.right - 4 && r.right > c.left + 4);
    if (same.length) return same.reduce((m, x) => ((below ? x[1].top < m[1].top - 1 : x[1].bottom > m[1].bottom + 1) ? x : m))[0];
  }
  const edge = below ? Math.min(...pool.map(([, r]) => r.top)) : Math.max(...pool.map(([, r]) => r.bottom));
  const ref = pool.find(([, r]) => (below ? r.top : r.bottom) === edge)[1];
  const tol = Math.max(8, ref.height * 0.5);
  const band = pool.filter(([, r]) => (below ? r.top < edge + tol : r.bottom > edge - tol));
  // a sideways game row: its first game, and the row scrolled back to the start
  const row = band[0][0].closest('[data-hscroll]');
  if (row && band.every(([el]) => row.contains(el)) && row !== cur.closest('[data-hscroll]')) {
    const first = focusables(row).find((el) => !el.disabled);
    if (first) { if (row.scrollLeft > 0) glideBy(row, -row.scrollLeft, 0); return first; }
  }
  // the same grid of cards as where you are: straight up or down. [data-grid] (0.9.23) does it across
  // separate rows too (the on-screen keyboard's rows, which went to each row's first key)
  const kgrid = cur.closest('[data-grid]');
  const grid = cur.parentElement;
  const inGrid = kgrid ? band.filter(([el]) => kgrid.contains(el)) : band.filter(([el]) => el.parentElement === grid);
  if (kgrid && inGrid.length) { let best = null, d = Infinity; for (const [el, r] of inGrid) { const dx = Math.abs(r.left + r.width / 2 - wantX); if (dx < d) { d = dx; best = el; } } return best; }
  if (inGrid.length && focusables(grid).length > inGrid.length) {
    let best = null, d = Infinity;
    for (const [el, r] of inGrid) { const dx = Math.abs(r.left + r.width / 2 - wantX); if (dx < d) { d = dx; best = el; } }
    return best;
  }
  // anything else: the row's first item
  return band.reduce((m, x) => (x[1].left < m[1].left - 2 ? x : m))[0];
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
  // the first item, or anything in a page's header row ([data-top]): the whole header shows (0.9.16)
  if (first === el || el.closest('[data-top]')) { glideTo(sc, 0); return; }
  const vpad = Math.min(120, s.height * 0.2);
  if (r.top < s.top + vpad) glideBy(sc, 0, r.top - s.top - vpad);
  else if (r.bottom > s.bottom - vpad) glideBy(sc, 0, r.bottom - s.bottom + vpad);
}

export function dispatch(action, { keepMode = false } = {}) {
  lastInput = performance.now();
  skipMorph(); // a picture still flying never holds up the next press
  const layer = topLayer();
  if (!keepMode) setMode('pad'); // a touch gesture (0.9.26) keeps touch mode: no focus rings appear
  const h = layer?.handlers?.[action];
  if (action === 'accept') { sfx.accept(); rumble(true); }
  else if (action === 'back') sfx.back();
  else if (['lb', 'rb'].includes(action)) { sfx.tab(); rumble('tab'); }
  else if (['lt', 'rt'].includes(action)) { rumble('tab'); if (!startLog.done) startLog.fired.push(`${action} ${Math.round(performance.now() - startLog.t0)} ms${layer ? '' : ' (nothing to take it)'}`); }
  // hold A to read it all, B to fold it back (0.9.29, owner: patch names and descriptions that trail off):
  // anything marked data-expand opens as a card with its whole text
  if (action === 'back' && layer) { const open = layer.el.querySelector('.expanded[data-expand]'); if (open) { open.classList.remove('expanded'); open.focus({ preventScroll: true }); return; } }
  if (action === 'hold' && document.activeElement?.hasAttribute?.('data-expand') && !document.activeElement.hasAttribute('data-hold')) {
    const el = document.activeElement;
    for (const o of (layer?.el || document).querySelectorAll('.expanded[data-expand]')) if (o !== el) o.classList.remove('expanded');
    // 0.9.46 (owner: a row that already showed all of its text still took two presses of B to leave): open it only
    // if opening shows more. Measured straight after (one layout, nothing painted in between); no taller, no card.
    if (!el.classList.contains('expanded')) {
      const h = el.getBoundingClientRect().height;
      el.classList.add('expanded');
      if (el.getBoundingClientRect().height <= h + 2) { el.classList.remove('expanded'); return; }
    } else el.classList.remove('expanded');
    rumble(true);
    return;
  }
  if (h && h(document.activeElement) !== false) return;
  // A held on something that has a held meaning (data-hold, 0.9.19: Start's tiles): it tells itself
  if (action === 'hold') { document.activeElement?.dispatchEvent(new CustomEvent('cart-hold', { bubbles: true })); return; }
  if (['up', 'down', 'left', 'right'].includes(action)) return move(action);
  if (action === 'accept') {
    const el = document.activeElement;
    if (layer && inScope(el, layer.el)) { pressFx(el); el.click(); }
    else { keepFocus(); if (!document.activeElement || document.activeElement === document.body) focusFirst(); } // focus fell through: show where you are first (0.9.47)
  }
}

// ---------------- keyboard
// 0.9.37 (owner: overhaul keyboard and mouse): the controller's buttons on the keys people expect on a desktop, plus
// desktop habits on top: Tab and Shift+Tab step through what's on screen, Ctrl+Tab and Ctrl+Page Up/Down change tab,
// 1 to 9 jump to a tab, Ctrl+F or / search, Ctrl+J downloads, Alt+Left and the mouse's back button go back, Home and
// End go to the first and last thing, F1 or ? lists every key. A, B, X, Y stay on Enter, Escape, X and Y.
const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Enter: 'accept', ' ': 'accept', Escape: 'back', Backspace: 'back', BrowserBack: 'back',
  q: 'lb', e: 'rb', x: 'x', y: 'y', '/': 'search', m: 'start',
  PageUp: 'lt', PageDown: 'rt', ',': 'rsleft', '.': 'rsright', // , and . flick the right stick (Start's pages)
  Home: 'first', End: 'last', F1: 'help', '?': 'help', ContextMenu: 'y',
};
function keyAction(ev) {
  const k = ev.key, ctrl = ev.ctrlKey || ev.metaKey;
  if (k === 'Tab') return ctrl ? (ev.shiftKey ? 'lt' : 'rt') : ev.altKey ? null : ev.shiftKey ? 'prev' : 'next';
  if (ctrl && (k === 'PageDown' || k === 'PageUp')) return k === 'PageDown' ? 'rt' : 'lt';
  if (ctrl && (k === 'f' || k === 'F')) return 'search';
  if (ctrl && (k === 'j' || k === 'J')) return 'select';
  if (ev.altKey && k === 'ArrowLeft') return 'back';
  if (ev.shiftKey && k === 'F10') return 'y';
  if (ctrl || ev.altKey) return null; // everything else with a modifier is the system's or the text field's
  if (/^[1-9]$/.test(k)) return 'tab' + k;
  return KEYMAP[k] || null;
}
// Tab and Shift+Tab: the next or previous thing in reading order, within the top layer (and its zone)
function stepFocus(dir) {
  const layer = topLayer(), root = layer?.el || document.body;
  const zone = document.activeElement?.closest?.('[data-zone]');
  const scope = zone && root.contains(zone) ? zone : root;
  const all = [...scope.querySelectorAll('[data-focus]')].filter((x) => !x.disabled && x.offsetParent !== null);
  if (!all.length) return;
  const i = all.indexOf(document.activeElement), at = i < 0 ? (dir > 0 ? -1 : all.length) : i;
  const el = all[(at + dir + all.length) % all.length];
  el.focus({ preventScroll: true }); scrollIntoViewSmart(el);
}
// Home and End: the first or last thing in the list you're in
function edgeFocus(last) {
  const sc = document.activeElement?.closest?.('[data-scroll], [data-hscroll], [data-zone]') || topLayer()?.el || document.body;
  const all = [...sc.querySelectorAll('[data-focus]')].filter((x) => !x.disabled && x.offsetParent !== null);
  const el = last ? all[all.length - 1] : all[0];
  if (el) { el.focus({ preventScroll: true }); scrollIntoViewSmart(el); }
}
// A on something with a held meaning ([data-hold]): a press opens it on release, a hold of 450 ms
// does the held thing instead (0.9.19, owner: hold a Start tile to arrange the menu)
const HOLD_MS = 450;
const holdable = () => { const el = document.activeElement, l = topLayer(); return !!((el?.hasAttribute?.('data-hold') || el?.hasAttribute?.('data-expand')) && l && inScope(el, l.el)); };
let keyHold = null;
window.addEventListener('keydown', (ev) => {
  const t = ev.target;
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && !t.readOnly;
  if (typing && !['Escape', 'Enter', 'ArrowUp', 'ArrowDown'].includes(ev.key)) return;
  let a = keyAction(ev);
  if (!a) return;
  ev.preventDefault();
  if (!input.keys) input.keys = true;
  if (a === 'search' && !topLayer()?.handlers?.search) a = 'y'; // a pop-up without search: / is its Y, as before
  if (a === 'next' || a === 'prev') { setMode('pad'); stepFocus(a === 'next' ? 1 : -1); return; }
  if (a === 'first' || a === 'last') { const h = topLayer()?.handlers?.[a]; setMode('pad'); if (h) h(document.activeElement); else edgeFocus(a === 'last'); return; }
  if (a === 'accept' && (keyHold || (!ev.repeat && holdable()))) {
    if (!keyHold) keyHold = { fired: false, t: setTimeout(() => { keyHold.fired = true; dispatch('hold'); }, HOLD_MS) };
    return;
  }
  if (ev.repeat) lastRepeat = performance.now();
  dispatch(a);
});
window.addEventListener('keyup', (ev) => {
  if (KEYMAP[ev.key] !== 'accept' || !keyHold) return;
  if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
  clearTimeout(keyHold.t);
  const fired = keyHold.fired; keyHold = null;
  if (!fired) dispatch('accept');
});
// the mouse's back button (button 3) goes back, like a browser (0.9.37)
window.addEventListener('mouseup', (e) => { if (e.button === 3) { e.preventDefault(); dispatch('back', { keepMode: true }); } }, true);
window.addEventListener('mousedown', (e) => { if (e.button === 3 || e.button === 4) e.preventDefault(); }, true); // never Chromium's own history
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
// Game Mode hands the screen's touches over as a mouse (0.9.23, owner: touch still showed a cursor). A
// finger lands somewhere new: the pointer jumps there in one move, or presses without moving first,
// where a real mouse glides up to what it clicks. Those count as touch, and so does the drag after them.
let lastMove = { t: 0, x: -1, y: -1, jump: false }, fingerDown = false;
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' || e.pointerType === 'pen') { lastTouch = performance.now(); if (pointerPref !== 'mouse') setMode('touch'); return; }
  const now = performance.now();
  const far = lastMove.x < 0 || Math.hypot(e.clientX - lastMove.x, e.clientY - lastMove.y) > 24;
  const finger = pointerPref !== 'mouse' && (input.mode === 'touch' || input.mode === 'pad') && (lastMove.jump || far || now - lastMove.t > 600);
  if (finger) { fingerDown = true; lastTouch = now; setMode('touch'); }
  else if (pointerPref !== 'touch') setMode('mouse');
}, { passive: true, capture: true });
window.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse' && fingerDown) { fingerDown = false; lastTouch = performance.now(); } }, { passive: true, capture: true });
window.addEventListener('mousemove', (e) => {
  const now = performance.now(), d = Math.hypot(e.movementX, e.movementY);
  lastMove = { t: now, x: e.clientX, y: e.clientY, jump: d > 40 && now - lastMove.t > 120 };
  if (pointerPref === 'touch') return;
  if (fingerDown || now - lastTouch < 1000) return; // a finger dragging, or synthetic mouse events that follow a tap
  if (e.movementX === 0 && e.movementY === 0) return;
  if (input.mode !== 'mouse' && d > 40) return; // the pointer warping to where a finger landed
  setMode('mouse');
}, { passive: true });

// ---------------- gamepad
// Read on its own 8 ms timer, not once per drawn frame: without the GPU a slow frame would
// otherwise delay the press. Hold-to-repeat starts after 220 ms and speeds up the longer you hold.
const BTN = { 0: 'accept', 1: 'back', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 6: 'lt', 7: 'rt', 8: 'select', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const REPEATABLE = new Set(['up', 'down', 'left', 'right', 'lt', 'rt']);
const ACTIONS = [...new Set([...Object.values(BTN), 'rsleft', 'rsright'])]; // the right stick's flicks (0.9.23: Start's pages)
const state = {}; // key -> { down, next, n }
const DELAY = 220, RATE = 70, FAST = 40;

function press(key, isDown, now) {
  const s = state[key] || (state[key] = { down: false, next: 0, n: 0 });
  if (key === 'accept' && (s.hold || (isDown && !s.down && holdable()))) {
    if (isDown && !s.down) { s.down = true; s.hold = now; s.held = false; }
    else if (isDown && !s.held && now - s.hold >= HOLD_MS) { s.held = true; dispatch('hold'); }
    else if (!isDown) { s.down = false; if (!s.held) dispatch('accept'); s.hold = 0; }
    return;
  }
  if (isDown && !s.down) { s.down = true; s.n = 0; s.next = now + DELAY; dispatch(key); }
  else if (isDown && s.down && REPEATABLE.has(key) && now >= s.next) { s.n++; s.next = now + (s.n > 6 ? FAST : RATE); lastRepeat = now; dispatch(key); }
  else if (!isDown) s.down = false;
}
// Triggers go by how far they are pulled, never the "pressed" flag: on Linux a trigger can read as
// half pulled (0.5, "pressed") until it first moves, which made the first LT/RT press do nothing.
// A trigger only counts once it has been seen at rest.
// 0.9.21 (owner: LT/RT still did nothing at launch until another button was pressed): Chromium hides a
// pad until its first press, so a trigger pulled first is seen pulled in the very first reading and was
// never armed. A pad's first reading (within 400 ms of it appearing) counts as having been at rest.
const armed = {}; // pad index + trigger -> seen at rest
const firstSeen = {}; // pad index + id -> when it first showed up
function trigger(gp, which, v) {
  const k = gp.index + which, p = gp.index + gp.id;
  if (!firstSeen[p]) firstSeen[p] = performance.now();
  if (v < 0.6 || performance.now() - firstSeen[p] < 400) armed[k] = true;
  if (!startLog.done) startLog.note(gp, which, v, !!armed[k]);
  return !!armed[k] && v > 0.6;
}
// 0.9.38 (owner: LT/RT still dead at launch until another button; it works every time here, with a simulated
// pad): what the triggers read in the first seconds, written once to the log, so a report from the device says
// whether the pad showed up, what a trigger at rest reads and whether it was ever armed
const startLog = { done: false, t0: performance.now(), seen: {}, fired: [],
  note(gp, which, v, armedNow) {
    const k = gp.index + which, x = this.seen[k] || (this.seen[k] = { id: gp.id.slice(0, 40), map: gp.mapping || 'none', first: Math.round(v * 100) / 100, at: Math.round(performance.now() - this.t0), max: 0, armedAt: null });
    x.max = Math.max(x.max, Math.round(v * 100) / 100); if (armedNow && x.armedAt == null) x.armedAt = Math.round(performance.now() - this.t0);
    if (performance.now() - this.t0 > 20000) this.flush();
  },
  flush() {
    if (this.done) return; this.done = true;
    const line = 'triggers at start: ' + (Object.entries(this.seen).map(([k, x]) => `${k} ${x.id} (${x.map}) seen ${x.at} ms, first ${x.first}, max ${x.max}, armed ${x.armedAt ?? 'never'}`).join('; ') || 'no pad') + `; LT/RT pressed ${this.fired.join(', ') || 'never'}`;
    try { window.cart?.call('app:log', { text: line }); } catch {}
  },
};
export const padLive = { pads: [] }; // for Settings → About → Controller test
const stickHeld = {}; // pad index -> direction -> held (stick hysteresis)
// Rumble when moving (0.9.3 B3, Look & Feel): a tiny pulse on the pad you last used. Steam Input
// passes it through in Game Mode only when the pad has motors and Steam's own rumble is on.
const RUMBLE = { low: 0.12, medium: 0.25, high: 0.45 };
let rumbleLevel = 'none', lastPad = -1;
export function setRumble(v) { rumbleLevel = RUMBLE[v] ? v : 'none'; }
// kind: false (moving), true (A), 'tab' (0.9.21, owner: haptics when switching between menus in the bars:
// LB/RB and LT/RT): a short, firmer click on both motors, so a page change feels different from a step.
// 'settle' (CAE 0.9.47, owner: "the slight rumble when the spring settles"): a soft tap on the heavy motor only, when
// something comes to rest: a tile snapping into its place on Start, a cover landing on the game page, a list
// reaching its end. At most one every 250 ms.
let settledAt = 0;
export function rumble(strong = false) {
  const m = RUMBLE[rumbleLevel];
  if (!m || lastPad < 0) return;
  if (strong === 'settle') { const t = performance.now(); if (t - settledAt < 250) return; settledAt = t; }
  const gp = navigator.getGamepads?.()[lastPad];
  const fx = strong === 'settle' ? { duration: 22, weakMagnitude: 0, strongMagnitude: m * 0.55 } : strong === 'tab' ? { duration: 26, weakMagnitude: Math.min(1, m * 1.2), strongMagnitude: m * 0.9 } : { duration: strong ? 32 : 18, weakMagnitude: m, strongMagnitude: strong ? m * 0.6 : 0 };
  try { gp?.vibrationActuator?.playEffect('dual-rumble', fx)?.catch?.(() => {}); } catch {}
}
// the part of the screen focus was last in (a [data-zone]), for when the focused element goes away
let lastZone = null;
document.addEventListener('focusin', (e) => { lastZone = e.target.closest?.('[data-zone]') || null; }, true);
const rsHeld = {};
let inBackground = false, gsKnown = false; // declared before the poll loop starts (it reads them at once)
// what the right stick scrolls: the scrolling box around the focus, else the first one in the top pop-up or the page
function stickTarget() {
  const scrolls = (n) => n && n.scrollHeight > n.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(n).overflowY);
  for (let n = document.activeElement; n && n !== document.body; n = n.parentElement) if (scrolls(n)) return n;
  const base = topLayer()?.el || document.querySelector('main.main');
  return [...(base?.querySelectorAll('[data-scroll], .view') || [])].find(scrolls) || null;
}
function stickScroll(v) {
  const sc = stickTarget();
  if (!sc) return;
  const k = (Math.abs(v) - 0.25) / 0.75; // 0 at the dead zone, 1 pushed all the way
  sc.scrollTop += Math.sign(v) * (2 + k * k * 22); // up to ~3000 px/s at the 8 ms poll, gentle near the middle
}
let rsY = 0;
function poll() {
  rsY = 0;
  const now = performance.now();
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  const merged = {};
  for (const gp of pads) {
    input.padName = gp.id;
    if (gp.buttons.some((b) => b.pressed) || gp.axes.some((a) => Math.abs(a) > 0.25)) { governorInput(); if (gp.buttons.some((b) => b.pressed) || gp.axes.slice(0, 2).some((a) => Math.abs(a) > 0.55)) { lastPad = gp.index; if (input.keys) input.keys = false; } }
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
    // Left stick (0.9.3 K, B1): only the stronger axis counts, so a slightly diagonal push never moves
    // two ways at once, and a direction lets go only below 0.35 after passing 0.55, so a stick
    // resting near the edge doesn't flicker into double moves.
    // Right stick left and right (0.9.23, owner: Start's pages): a flick, past 0.7 and back under 0.4
    const rx = gp.mapping === 'standard' ? gp.axes[2] ?? 0 : gp.axes.length >= 6 ? gp.axes[3] ?? 0 : 0;
    const rh = rsHeld[gp.index] || (rsHeld[gp.index] = {});
    rh.l = rx < -0.7 || (rh.l && rx < -0.4); rh.r = rx > 0.7 || (rh.r && rx > 0.4);
    if (rh.l) merged.rsleft = true;
    if (rh.r) merged.rsright = true;
    // Right stick up and down (0.9.41, owner: read the rest of What's New): scrolls, faster the further it's pushed
    const ry = gp.mapping === 'standard' ? gp.axes[3] ?? 0 : gp.axes.length >= 6 ? gp.axes[4] ?? 0 : 0;
    if (Math.abs(ry) > 0.25 && Math.abs(ry) > Math.abs(rx)) rsY = ry;
    const [ax = 0, ay = 0] = gp.axes;
    const held = stickHeld[gp.index] || (stickHeld[gp.index] = {});
    const horiz = Math.abs(ax) >= Math.abs(ay);
    for (const [dir, v, on] of [['left', -ax, horiz], ['right', ax, horiz], ['up', -ay, !horiz], ['down', ay, !horiz]]) {
      held[dir] = on && (v > 0.55 || (held[dir] && v > 0.35));
      if (held[dir]) merged[dir] = true;
    }
  }
  padLive.pads = pads;
  if (rsY && inFront()) stickScroll(rsY);
  if (inFront()) for (const key of ACTIONS) press(key, !!merged[key], now);
  else for (const key of ACTIONS) if (state[key]) state[key].down = !!merged[key]; // a press held while away doesn't fire on return
}
// Every 8 ms while Cartridge is in front; when it isn't (a game is running, or you switched away)
// only a few times a second, so it costs the system nothing in the background (A14)
// CAE governor (0.9.47): 60 Hz once idle for a minute (a press still lands within a frame), back to 120 Hz on any input
(function loop() { poll(); setTimeout(loop, !inFront() ? 250 : governor.mode === 'idle' ? 16 : 8); })();
// Game Mode: Steam's menu is in front while Cartridge keeps its window focus (main.js watchGamescopeFocus)
export function setBackground(v) { inBackground = !!v; gsKnown = true; }
// Outside Game Mode (0.9.29, owner: "on a PC with a controller, after the game closes the controls don't work"):
// the pad is read only while the window has focus, and after a game Steam keeps it. Main watches the game it
// started and says when it ended; from then the pad works even before the window gets its focus back, until
// Cartridge loses a focus it had (you switched to something else) or another game starts.
let returned = false, returnedAt = 0;
export function gameEnded(v) { returned = !!v; returnedAt = v ? performance.now() : 0; if (v) watchReturn(); }
// 0.9.34: main's own focus attempts after a game blur the window on purpose (refocus); those mustn't switch the pad
// off again, so only a blur well after the return counts as you switching away
window.addEventListener('blur', () => { if (performance.now() - returnedAt > 10000) returned = false; });
// After a game (0.9.34, owner: the pad is seen but does nothing): for 20 s, note whether the pad sends anything and
// what Cartridge thinks of its window, then write one line to the log, so a device report says where it stops
function watchReturn() {
  const t0 = performance.now(), seen = new Map();
  let changes = 0, firstInput = null, samples = 0;
  const tick = () => {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    for (const gp of pads) {
      const sig = gp.buttons.map((b) => (b.pressed ? 1 : 0)).join('') + gp.axes.map((a) => Math.round(a * 4)).join(',');
      if (seen.has(gp.index) && seen.get(gp.index) !== sig) { changes++; if (firstInput == null) firstInput = Math.round(performance.now() - t0); }
      seen.set(gp.index, sig);
    }
    if (++samples < 80) return setTimeout(tick, 250);
    const line = `after the game: pads ${pads.length} [${pads.map((p) => p.id.slice(0, 40)).join('; ')}], input changes ${changes}${firstInput != null ? ' (first after ' + firstInput + ' ms)' : ''}, focus ${document.hasFocus()}, visible ${document.visibilityState}, in front ${inFront()}, gamescope ${gsKnown ? (inBackground ? 'away' : 'front') : 'unknown'}`;
    try { window.cart?.call('app:log', { text: line }); } catch {}
  };
  setTimeout(tick, 250);
}
// In Game Mode gamescope says when Cartridge is in front, which is truer than window focus: after a game
// the window can be in front without focus, and the pad went dead (0.9.24)
function inFront() { return gsKnown ? !inBackground : (document.hasFocus() || returned) && !inBackground; }

export function ensureFocus(root) {
  if (!root) return;
  const a = document.activeElement;
  if (a && root.contains(a) && a.hasAttribute('data-focus')) return;
  if (layers.length > 1) return; // a modal is open
  focusFirst(root);
}
export function jump(dir, n = 4) { for (let i = 0; i < n; i++) move(dir); }

// 0.9.28 (owner's photos: Home shifted off the left edge, rows clipped at the sides): scrollIntoView also scrolls
// boxes that clip (overflow hidden), which are never meant to move, so a focused card dragged a whole page sideways.
// Any such box that moves is put straight back.
document.addEventListener('scroll', (e) => {
  const t = e.target;
  if (!(t instanceof Element) || (!t.scrollLeft && !t.scrollTop)) return;
  const cs = getComputedStyle(t);
  if (t.scrollLeft && (cs.overflowX === 'hidden' || cs.overflowX === 'clip')) t.scrollLeft = 0;
  if (t.scrollTop && (cs.overflowY === 'hidden' || cs.overflowY === 'clip')) t.scrollTop = 0;
}, { capture: true, passive: true });

// ---------------- touch and drag scrolling
// 0.9.26, the touch update (owner: "touch never worked, only taps"). Touches reach Cartridge in one of
// three ways depending on the system: as real touches the browser scrolls itself, as real touches it
// doesn't scroll (seen on some X11/XWayland setups), or as a mouse (Game Mode's touch modes). One engine
// handles all three: when the browser starts scrolling a touch itself it says so (pointercancel, or a
// scroll event) and the engine steps back; otherwise, once the finger has clearly moved, the engine
// scrolls the nearest scrollable box itself, once per frame, with momentum on release. A drag swallows
// the click that ends it, so a swipe never opens a game. Gestures: swipe in from the left edge = Back,
// swipe along the top bar = next or previous tab.
export const lastPointer = { type: '' }; // for the controller test
export const touchInfo = { touch: 0, pen: 0, mouse: 0, touchEvents: 0, moves: 0, native: 0, ours: 0, gestures: 0, last: '' }; // Settings → About → Touch check
window.cartTouch = touchInfo; // readable from the dev tools when checking a device
const DRAG_START = 10, TOUCH_START = 18, EDGE = 28;
const nativeTouch = () => document.documentElement.classList.contains('touch-native');
let drag = null, glide = 0, pend = 0, pendRaf = 0, nativeAt = 0;
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
// the browser scrolled something by itself while a finger was down: it has this touch
document.addEventListener('scroll', () => { if (drag?.touch && !drag.axis) nativeAt = performance.now(); }, { capture: true, passive: true });
window.addEventListener('touchstart', () => { touchInfo.touchEvents++; }, { capture: true, passive: true });
const eatClick = () => {
  const eat = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
  window.addEventListener('click', eat, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 120);
};
window.addEventListener('pointerdown', (e) => {
  lastPointer.type = e.pointerType;
  touchInfo[e.pointerType] = (touchInfo[e.pointerType] || 0) + 1;
  stopGlide();
  const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
  if (!touch && e.button !== 0) { drag = null; return; }
  if (e.target.closest('input, textarea, [data-nodrag]')) { drag = null; return; }
  const fingerish = touch || input.mode === 'touch';
  drag = {
    id: e.pointerId, touch, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, axis: null, sc: null, target: e.target, hist: [], t0: performance.now(),
    // gestures: from the very left edge (Back), or on the top bar's tabs (next or previous tab)
    gesture: fingerish && e.clientX <= EDGE ? 'edge' : fingerish && e.target.closest('.statusbar .tabs') ? 'tabs' : null,
  };
  nativeAt = 0;
}, { capture: true, passive: true });
// 0.9.28 (owner: "touch still only swipes on Start"): Start's page swipe only compares where the finger went
// down and came up, so on that device the moves in between never reached the engine (none arrive, or they come
// under another pointer, a touch, or a mouse with the button held). Moves are taken from all of those now, and
// a swipe with no moves at all still scrolls when the finger lifts (swipeJump).
function feed(x, y) {
  if (!drag) return;
  touchInfo.moves++;
  const dx = x - drag.x, dy = y - drag.y;
  if (drag.gesture) { drag.lx = x; drag.ly = y; return; }
  if (!drag.axis) {
    const need = drag.touch && nativeTouch() ? TOUCH_START : DRAG_START; // the browser's own scrolling gets its slop first
    if (Math.abs(dx) < need && Math.abs(dy) < need) return;
    if (drag.touch && nativeAt) { drag = null; touchInfo.native++; return; } // the browser is scrolling it
    const want = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    drag.axis = want;
    drag.sc = scrollerFor(drag.target, want) || scrollerFor(drag.target, want === 'x' ? 'y' : 'x');
    if (drag.sc && !scrollerFor(drag.target, want)) drag.axis = want === 'x' ? 'y' : 'x';
    if (!drag.sc) { drag = null; return; }
    const a = anims.get(drag.sc); if (a) { stopSpring(a.sx); stopSpring(a.sy); anims.delete(drag.sc); }
    document.body.classList.add('dragging');
    touchInfo.ours++; touchInfo.last = drag.touch ? 'touch, scrolled by Cartridge' : 'mouse-style drag, scrolled by Cartridge';
    // catch up with the finger: everything it moved before the drag was recognised
    pend += drag.axis === 'x' ? drag.x - drag.lx : drag.y - drag.ly;
  }
  if (drag.jump) { drag.lx = x; drag.ly = y; return; } // a move-less swipe: swipeJump glides it
  const m = drag.axis === 'x' ? drag.lx - x : drag.ly - y;
  drag.lx = x; drag.ly = y;
  if (!m) return;
  pend += m;
  if (!pendRaf) pendRaf = requestAnimationFrame(flush);
  const now = performance.now();
  drag.hist.push([now, m]);
  while (drag.hist.length && now - drag.hist[0][0] > 100) drag.hist.shift();
}
window.addEventListener('pointermove', (e) => { if (drag && (e.pointerId === drag.id || e.pointerType === 'touch' || e.buttons & 1)) feed(e.clientX, e.clientY); }, { capture: true, passive: true });
window.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t && drag) feed(t.clientX, t.clientY); }, { capture: true, passive: true });
window.addEventListener('mousemove', (e) => { if (drag && e.buttons & 1) feed(e.clientX, e.clientY); }, { capture: true, passive: true });
function finishGesture(d) {
  const dx = d.lx - d.x, dy = d.ly - d.y, quick = performance.now() - d.t0 < 900;
  if (d.gesture === 'edge' && dx > 80 && Math.abs(dy) < dx * 0.6 && quick) { eatClick(); touchInfo.gestures++; touchInfo.last = 'swipe from the edge: Back'; dispatch('back', { keepMode: true }); }
  else if (d.gesture === 'tabs' && Math.abs(dx) > 60 && Math.abs(dy) < Math.abs(dx) * 0.6 && quick) { eatClick(); touchInfo.gestures++; touchInfo.last = 'swipe on the top bar: tab'; dispatch(dx < 0 ? 'rt' : 'lt', { keepMode: true }); }
}
// the browser took a gesture's touch for scrolling (pointercancel): touch events still arrive, so follow those
function followTouches(d) {
  const mv = (ev) => { const t = ev.touches[0]; if (t) { d.lx = t.clientX; d.ly = t.clientY; } };
  const end = () => { window.removeEventListener('touchmove', mv, true); window.removeEventListener('touchend', end, true); window.removeEventListener('touchcancel', end, true); finishGesture(d); };
  window.addEventListener('touchmove', mv, { capture: true, passive: true });
  window.addEventListener('touchend', end, { capture: true, passive: true });
  window.addEventListener('touchcancel', end, { capture: true, passive: true });
}
function endDrag(e) {
  if (!drag) return; // any pointer's up ends it: on some systems the moves and the up come under another pointer
  drag.jump = !drag.axis && !drag.gesture && !drag.hist.length; // nothing moved it yet
  if (drag.jump) pend = 0;
  if (e.type === 'touchend') { const t = e.changedTouches?.[0]; if (t) feed(t.clientX, t.clientY); }
  else feed(e.clientX, e.clientY); // the last position, in case no move came before it
  if (drag?.jump) pend = 0;
  if (!drag) return; // nothing there to scroll
  flush();
  const d = drag; drag = null;
  if (d.gesture) return finishGesture(d);
  if (!d.axis) return;
  if (d.jump) return swipeJump(d); // no moves arrived: scroll by the whole swipe now
  document.body.classList.remove('dragging');
  eatClick();
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
window.addEventListener('touchend', endDrag, { capture: true, passive: true });
window.addEventListener('mouseup', endDrag, { capture: true, passive: true });
// a swipe whose moves never arrived: glide the scroller by what the finger covered, plus some momentum
function swipeJump(d) {
  document.body.classList.remove('dragging');
  eatClick();
  const dist = d.axis === 'x' ? d.x - d.lx : d.y - d.ly, ms = Math.max(60, performance.now() - d.t0);
  const total = dist + Math.max(-1200, Math.min(1200, (dist / ms) * 280));
  touchInfo.last = 'swipe without moves, scrolled when the finger lifted';
  glideBy(d.sc, d.axis === 'x' ? total : 0, d.axis === 'y' ? total : 0);
}
// the browser took the touch over for its own scrolling: it scrolls, the engine steps back
window.addEventListener('pointercancel', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (drag.touch && !drag.axis && !drag.gesture) { touchInfo.native++; touchInfo.last = 'touch, scrolled by the browser'; }
  if (drag.gesture && drag.touch) followTouches(drag);
  drag = null; document.body.classList.remove('dragging');
}, { capture: true, passive: true });
window.addEventListener('wheel', stopGlide, { passive: true });
window.addEventListener('touchstart', stopGlide, { passive: true });
// pictures and links never start the browser's own drag-and-drop: on a touch screen that stole the swipe
window.addEventListener('dragstart', (e) => { if (!e.target.closest?.('[draggable="true"]')) e.preventDefault(); }, { capture: true });
// With touch, a tap should open things without also yanking the view around to "focus" them.
window.addEventListener('mousedown', (e) => {
  if (input.mode === 'touch' && !e.target.closest('input, textarea')) e.preventDefault();
}, { capture: true });
