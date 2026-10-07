// CAE, the Cartridge Animation Engine (0.9.47; grew from 0.9.37's motion.js). Rules in docs/cae.md. In short:
// - Heavy, not phone-like: things have weight. Movement is critically damped (no bounce) and short (8 to 24 px); only
//   a press let go gets a hint of give. Big surfaces (pages, sheets) take a little longer than small ones (presses,
//   focus), never the other way round. Closing is quicker than opening.
// - Interruptible: every move starts from where the thing is now, with its speed kept (springs), so presses in a row
//   blend and nothing snaps. Any new input finishes a picture still flying (skipMorph).
// - Cheap: transform and opacity only; one frame loop for everything script moves (the ticker), asleep when nothing
//   moves; the governor below slows or stops the rest while you're idle or a game is in front.
// Parts: 0 the ticker, 1 spring curves for CSS, 2 springs for script, 3 shared element flights, 4 sliding pills,
// 5 the governor.

// ---------- 0. one frame loop (0.9.47): every script-driven motion registers here, so there is at most one
// requestAnimationFrame, it stops when nothing moves, and it never runs while Cartridge is in the background
const jobs = new Set();
let tickRaf = 0, tickLast = 0;
function tick(now) {
  tickRaf = 0;
  const dt = Math.min(0.05, (now - (tickLast || now)) / 1000); tickLast = now;
  for (const j of [...jobs]) { let keep = false; try { keep = j(now, dt) !== false; } catch { keep = false; } if (!keep) jobs.delete(j); }
  if (jobs.size) tickRaf = requestAnimationFrame(tick); else tickLast = 0;
}
// run fn(now, dt) every frame until it returns false; returns a stop function
export function frame(fn) {
  jobs.add(fn);
  if (!tickRaf) { tickLast = 0; tickRaf = requestAnimationFrame(tick); }
  return () => jobs.delete(fn);
}

// ---------- 1. spring curves for CSS
// x'' = -k (x - 1) - c x', from 0 at rest; k = (2π / response)², c = 4π ζ / response
// 0.9.56 (owner: "animations don't feel snappy or fluid anymore, extremely sluggish"): a spring let go from rest starts
// slowly (zero speed at the start), so every move eased in and only reached full speed a third of the way through. The
// critically damped ones now start at their natural speed (v0 = ω): the curve is 1 - e^(-ωt), at full speed the moment
// it starts, never past the target, settled about a third sooner. Springs with give (damping < 1) still start from rest.
export function springCurve({ damping = 1, response = 0.35, samples = 48, kick = damping >= 1 } = {}) {
  const k = (2 * Math.PI / response) ** 2, c = (4 * Math.PI * damping) / response, dt = 1 / 1000;
  let x = 0, v = kick ? 2 * Math.PI / response : 0, t = 0;
  const pts = [];
  while (t < 3) {
    for (let i = 0; i < 4; i++) { const a = -k * (x - 1) - c * v; v += a * dt; x += v * dt; t += dt; }
    pts.push(x);
    if (Math.abs(1 - x) < 0.0015 && Math.abs(v) < 0.02) break;
  }
  const dur = Math.round(t * 1000);
  const step = Math.max(1, Math.floor(pts.length / samples));
  const out = [];
  for (let i = 0; i < pts.length; i += step) out.push(+pts[i].toFixed(4));
  out[out.length - 1] = 1;
  return { easing: `linear(0, ${out.join(', ')})`, duration: dur };
}
// The profiles (CAE 0.9.47, owner: "smooth and fluid but heavy, for a handheld or a PC, not a phone"). Damping 1 is
// critical: it arrives and stops, no overshoot. The old names stay so every rule using them keeps working.
export const SPRINGS = {
  spring: { damping: 1, response: 0.34 },          // settle: most movement
  'spring-snappy': { damping: 1, response: 0.22 }, // snap: presses, rings, chips, focus
  'spring-soft': { damping: 1, response: 0.46 },   // heavy: pages, sheets, big surfaces
  'spring-bounce': { damping: 0.86, response: 0.36 }, // after momentum only (a flick)
  // a press let go, a toggle's knob, a pill reaching its choice: a hint of give (0.9.38 had 0.72, which read as a
  // phone's bounce; 0.86 overshoots about 1%)
  'spring-pop': { damping: 0.86, response: 0.36 },
};
// CAE's named timings for script (0.9.52): timing('fade-slow') -> { duration, easing } for element.animate(), read
// from the same CSS tokens the stylesheets use (--fade-in, --fade-slow, --spring...), so script and CSS never drift apart
export function timing(name, root = document.documentElement) {
  const cs = getComputedStyle(root), get = (n) => cs.getPropertyValue('--' + n).trim();
  const deref = (v, n = 0) => (n > 6 ? v : v.replace(/var\(--([\w-]+)(?:,[^)]*)?\)/g, (_, k) => deref(get(k), n + 1)));
  let v = deref(get(name));
  if (/^spring/.test(name)) v = deref(get(name + '-d')) + ' ' + v;
  const ms = v.match(/(\d*\.?\d+)(ms|s)\b/), d = ms ? parseFloat(ms[1]) * (ms[2] === 's' ? 1000 : 1) : 200;
  const easing = v.replace(/(\d*\.?\d+)(ms|s)\b/, '').trim() || 'ease-out';
  return { duration: d, easing };
}
export function installSprings(root = document.documentElement) {
  if (!CSS.supports?.('transition-timing-function', 'linear(0, 1)')) return; // older engines keep the cubic curves
  for (const [name, p] of Object.entries(SPRINGS)) {
    const s = springCurve(p);
    root.style.setProperty('--' + name, s.easing);
    root.style.setProperty('--' + name + '-d', s.duration + 'ms');
  }
}

// ---------- 2. a spring for values moved by script, interruptible with velocity kept
// springTo(state, target, { response, damping }) steps the value each frame towards target; calling it again while it
// runs only moves the target, so the motion carries on from its current position and speed. Runs on the ticker.
export function springTo(st, target, { response = 0.3, damping = 1, apply, done } = {}) {
  st.target = target; st.k = (2 * Math.PI / response) ** 2; st.c = (4 * Math.PI * damping) / response; st.apply = apply; st.done = done;
  if (st.v == null) st.v = 0;
  if (st.raf) return st;
  // from rest it starts at its natural speed (0.9.56, as springCurve): a glide never eases in; already moving, it keeps its speed
  if (damping >= 1 && !st.v && st.x != null) st.v = Math.sqrt(st.k) * (target - st.x);
  st.raf = 1; // running (nav.js reads it)
  st.stop = frame((now, dt0) => {
    if (!st.raf) return false;
    let dt = dt0 || 1 / 60;
    // small fixed steps: steady at any frame rate (60, 90, 144 Hz), also when a slow frame comes in without the GPU
    while (dt > 0) { const h = Math.min(dt, 0.004); const a = -st.k * (st.x - st.target) - st.c * st.v; st.v += a * h; st.x += st.v * h; dt -= h; }
    if (Math.abs(st.x - st.target) < 0.5 && Math.abs(st.v) < 8) { st.x = st.target; st.v = 0; st.raf = 0; st.apply?.(st.x); st.done?.(); return false; }
    st.apply?.(st.x);
    return true;
  });
  return st;
}
export function stopSpring(st) { if (st?.raf) st.stop?.(); if (st) { st.raf = 0; st.v = 0; } }

// ---------- 3. shared element transitions
// 0.9.38: the picture flies as one element (FLIP) instead of a View Transition. A View Transition snapshots the
// whole screen, so it was kept to the GPU, and handhelds in Game Mode (software rendering) never saw it. One picture
// moved by transform alone costs the compositor almost nothing, so it now runs everywhere, light effects included.
const reduced = () => document.body.classList.contains('motion-reduce') || matchMedia('(prefers-reduced-motion: reduce)').matches;
let running = null;
const imgOf = (el) => el?.querySelector?.('img') || (el?.tagName === 'IMG' ? el : null);
// fromEl flies to the element toSel finds after change() has run (Vue's DOM update awaited); with nothing to land
// on, the page's own arrival is all there is. Returns at once; change() always runs, with or without the flight.
export function morph(fromEl, change, toSel, nextTick) {
  const img = imgOf(fromEl);
  if (reduced() || !img || !fromEl.isConnected) { change(); return; }
  skipMorph();
  const a = fromEl.getBoundingClientRect(), src = img.currentSrc || img.src;
  change();
  (async () => {
    await nextTick(); await nextTick();
    const to = toSel ? document.querySelector(toSel) : null;
    const b = to?.getBoundingClientRect();
    if (!b || b.width < 8 || b.height < 8 || !a.width) return;
    const fly = document.createElement('img');
    fly.className = 'morph-fly'; fly.src = src; fly.alt = '';
    Object.assign(fly.style, { left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px', borderRadius: getComputedStyle(to).borderRadius, transformOrigin: '0 0' });
    document.body.appendChild(fly);
    to.style.visibility = 'hidden';
    // 0.9.45 (owner: the picture landed off its place, then snapped there, both ways): the target is read again every
    // frame. It moves while the flight runs (the new page settles in, a list scrolls the card into view), and the
    // old flight was aimed at where it was in the first frame. A critically damped spring (no overshoot) carries the
    // picture from where it was picked to wherever the target is now, so the last frame is exactly on it.
    const w = (2 * Math.PI) / SPRINGS.spring.response, dur = 6 / w; // x(t) = 1 - e^(-wt) (0.9.56: starts at full speed), done at 99.75%
    const t0 = performance.now();
    let stop = null, alive = true;
    const end = () => { if (!alive) return; alive = false; stop?.(); to.style.visibility = ''; fly.remove(); if (running?.end === end) running = null; };
    const step = (now) => {
      if (!alive) return false;
      const t = (now - t0) / 1000, p = t >= dur ? 1 : Math.min(1, (1 - Math.exp(-w * t)) / 0.9975); // the last bit folded in: it ends on the target, never a few pixels short
      const c = to.isConnected ? to.getBoundingClientRect() : b;
      if (c.width >= 8 && c.height >= 8) {
        const x = a.left + (c.left - a.left) * p, y = a.top + (c.top - a.top) * p, wd = a.width + (c.width - a.width) * p, ht = a.height + (c.height - a.height) * p;
        Object.assign(fly.style, { left: c.left + 'px', top: c.top + 'px', width: c.width + 'px', height: c.height + 'px', transform: `translate(${x - c.left}px, ${y - c.top}px) scale(${wd / c.width}, ${ht / c.height})` });
      }
      if (p >= 1) { end(); dispatchEvent(new Event('cae-settle')); return false; } // landed: a soft rumble (nav.js)
      return true;
    };
    running = { end };
    stop = frame(step);
  })();
}
// any new input ends a flight at once (the page is already there underneath): never a wait
export function skipMorph() { const r = running; running = null; if (r) r.end(); }

// ---------- 4. the sliding pill (0.9.38): in every segmented row (.seg), the chosen option's fill is one element that
// glides to the next choice on a spring, stretching to its width, instead of one fill vanishing and another appearing.
// Watches class changes on .seg buttons only; transform and size of one small box, nothing else repaints.
export function slidingPills(root = document.body) {
  const place = (seg, still) => {
    const on = seg.querySelector(':scope > button.on');
    let ink = seg.querySelector(':scope > .seg-ink');
    if (!on) { if (ink) ink.style.opacity = '0'; return; }
    if (!ink) { ink = document.createElement('i'); ink.className = 'seg-ink'; ink.setAttribute('aria-hidden', 'true'); seg.prepend(ink); still = true; }
    if (still) ink.classList.remove('live');
    Object.assign(ink.style, { opacity: '1', width: on.offsetWidth + 'px', height: on.offsetHeight + 'px', transform: `translate(${on.offsetLeft}px, ${on.offsetTop}px)` });
    seg.classList.add('inked');
    if (still) requestAnimationFrame(() => ink.classList.add('live')); // first placing never slides in from the corner
  };
  const all = (still) => root.querySelectorAll('.seg').forEach((seg) => place(seg, still));
  let queued = new Set(), raf = 0;
  const flush = () => { raf = 0; for (const seg of queued) if (seg.isConnected) place(seg); queued = new Set(); };
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'attributes') { const seg = m.target.parentElement; if (seg?.classList?.contains('seg') && m.target.tagName === 'BUTTON') queued.add(seg); }
      else for (const n of m.addedNodes) { if (n.nodeType !== 1) continue; if (n.classList.contains('seg')) queued.add(n); else if (n.querySelector) n.querySelectorAll('.seg').forEach((x) => queued.add(x)); if (n.parentElement?.classList?.contains('seg') && n.tagName === 'BUTTON') queued.add(n.parentElement); }
    }
    if (queued.size && !raf) raf = requestAnimationFrame(flush);
  }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', () => all(true));
  all(true);
  return () => all(true);
}

// ---------- 5. the governor (0.9.47, owner: "near-zero footprint while a game runs"): three states.
// active: you're using Cartridge; everything runs. idle: nothing pressed for a minute; the slow decorative loops
// (background drift, cover drift, clock clouds and stars, picture drift) pause and the controller is read at 60 Hz
// instead of 120. away: another app is in front (a game) or the window is hidden; main says so (event background),
// CSS animations pause (body.away), the background stops drawing and the controller is read 4 times a second.
// Any input wakes it at once; nothing waits on a timer to come back.
export const governor = { mode: 'active', away: false };
let lastIn = typeof performance !== 'undefined' ? performance.now() : 0;
const setMode = (m) => { if (governor.mode === m) return; governor.mode = m; document.body.classList.toggle('cae-idle', m === 'idle'); };
export function governorInput() { lastIn = performance.now(); if (governor.mode === 'idle') setMode('active'); }
export function governorAway(v) { governor.away = !!v; setMode(v ? 'away' : performance.now() - lastIn > IDLE_MS ? 'idle' : 'active'); }
const IDLE_MS = 60000;
export function startGovernor() {
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, governorInput, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => setMode(document.hidden || governor.away ? 'away' : 'active'));
  setInterval(() => { if (governor.mode !== 'away' && performance.now() - lastIn > IDLE_MS) setMode('idle'); }, 5000);
}
