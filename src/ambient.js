// Ambient motion at a few frames a second (0.9.86, PC playtest). The slow decorative drifts (Home's header picture,
// Start's tile pans, the clock's clouds) move well under a pixel a frame, yet as CSS animations they made Chromium
// draw every frame: on a 4K TV at 120 Hz that was most of a CPU core for nothing anyone could see (measured: Home 55%
// to 10%, Start 91% to 25%). Here one timer moves them a few times a second along the same eased path, each step
// still under a pixel. They hold still as before: behind a game (body.away), in a hidden window, with Reduce motion
// or reduced motion asked by the system, without the GPU (light-fx), and while Start is being arranged.
//   v-ambient="{ kind: 'drift' | 'pan' | 'cloud', period, delay, reverse }"
// kinds: drift = translate along x (Home's header, after it settles), pan = translate and scale (Start's big tiles,
// one clock for all of them), cloud = translateX in px (StartClock).
const KINDS = {
  drift: { fps: 4, ease: true, apply: (el, p) => { el.style.translate = `${(-1.6 * p).toFixed(3)}% 0`; } },
  pan: { fps: 12, ease: true, apply: (el, p) => { el.style.translate = `${(2.5 - 5 * p).toFixed(3)}% ${(1 - 2 * p).toFixed(3)}%`; el.style.scale = (1 + 0.05 * p).toFixed(4); } },
  cloud: { fps: 2, ease: false, apply: (el, p) => { el.style.transform = `translateX(${(-24 + 48 * p).toFixed(2)}px)`; } },
};
const items = new Map(); // el -> { k, period, start, reverse }
let timers = {};

// the curve of CAE's --ease-in-out token (cubic-bezier), solved for x
let curve = null;
function ease(x) {
  if (!curve) {
    const m = /cubic-bezier\(([^)]+)\)/.exec(getComputedStyle(document.documentElement).getPropertyValue('--ease-in-out') || '');
    const v = m ? m[1].split(',').map(Number) : [0.42, 0, 0.58, 1];
    curve = v.length === 4 && v.every((n) => !Number.isNaN(n)) ? v : [0.42, 0, 0.58, 1];
  }
  const [x1, y1, x2, y2] = curve, B = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let lo = 0, hi = 1, t = x;
  for (let i = 0; i < 20; i++) { t = (lo + hi) / 2; if (B(t, x1, x2) < x) lo = t; else hi = t; }
  return B(t, y1, y2);
}
const still = () => document.hidden || document.body.classList.contains('away') || document.body.classList.contains('motion-reduce') || document.body.classList.contains('light-fx') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const reduced = () => document.body.classList.contains('motion-reduce') || matchMedia('(prefers-reduced-motion: reduce)').matches;
function tick(fps) {
  if (reduced()) { for (const el of items.keys()) el.style.translate = el.style.scale = el.style.transform = ''; return; } // back at rest
  if (still()) return;
  const now = performance.now() / 1000;
  for (const [el, it] of items) {
    if (KINDS[it.k].fps !== fps) continue;
    if (el.closest('.st-board.editing')) { el.style.translate = el.style.scale = el.style.transform = ''; continue; }
    const t = now - it.start;
    if (t < 0) continue;
    let p = (t / it.period) % 2; p = p > 1 ? 2 - p : p; // there and back, as alternate
    if (it.reverse) p = 1 - p;
    KINDS[it.k].apply(el, KINDS[it.k].ease ? ease(p) : p);
  }
}
function arm() {
  const want = new Set([...items.values()].map((it) => KINDS[it.k].fps));
  for (const f of Object.keys(timers)) if (!want.has(Number(f))) { clearInterval(timers[f]); delete timers[f]; }
  for (const f of want) if (!timers[f]) timers[f] = setInterval(() => tick(f), 1000 / f);
}
function add(el, v) {
  const o = v || {}, k = KINDS[o.kind] ? o.kind : 'drift';
  // pan: one clock for every tile, so tiles side by side move together (Start's panDelay did this before)
  const start = k === 'pan' ? 0 : performance.now() / 1000 + (o.delay || 0) / 1000;
  items.set(el, { k, period: o.period || 60, start, reverse: !!o.reverse });
  arm(); tick(KINDS[k].fps);
}
export const vAmbient = {
  mounted(el, b) { if (b.value) add(el, b.value); },
  updated(el, b) { if (JSON.stringify(b.value) !== JSON.stringify(b.oldValue)) { items.delete(el); el.style.translate = el.style.scale = el.style.transform = ''; if (b.value) add(el, b.value); } },
  unmounted(el) { items.delete(el); arm(); },
};
