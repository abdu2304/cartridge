// The Glass engine (0.9.47, owner: rebuild Glass with real refraction, Glass mode only, dark and light).
// Liquid Glass in CSS, from the liquid-glass and liquid-glass-design skills: a lens, not a blur.
// - Refraction: each glass surface (the Dock, search, pop-ups, sheets, toasts, the game page's buttons over art) gets
//   an SVG filter used as its backdrop-filter: the background is blurred (frost), then displaced by a lens map
//   (feDisplacementMap) so it bends at the rim the way light does through curved glass (Snell's law, small-angle:
//   the offset follows the surface slope). The glass is thick in the middle and tapers at the rounded edge, so the
//   middle stays calm and the rim magnifies what's behind it.
// - Light: the rim's specular highlight comes from the top left and stays there (0.9.56: it used to follow the pointer
//   and the focus, which read as white shapes moving round everything).
// - Cost: a lens map is made once per size (rounded to 8 px) and kept (at most 32); nothing runs per frame. While
//   frames come slower than 50 a second during movement, the engine steps down to plain frost (body.lg-lite) for a
//   minute, then tries again. Off without the GPU path (light effects), with reduced motion or reduced transparency,
//   and in Plain (body.elements-glass absent). The CSS that uses it is at the end of styles.css (Glass engine).
import { frame, governor } from './motion.js';

const SEL = '.bar-pill.dock-glass .tabs, .top-search, .dialog, .toast, .g-actions .btn:not(.primary)';
const NS = 'http://www.w3.org/2000/svg';
let defs = null, on = false;
const filters = new Map(); // key -> { id, used }
const seen = new WeakMap(); // element -> key
let ro = null, mo = null;

// The lens: R and G hold the x/y offset (128 = none). d is the distance in from the edge of a rounded rectangle;
// within the bezel the surface curves down to the rim (a quarter circle), its slope sets how far the view is pulled.
function lensMap(w, h, r, bezel) {
  const s = 0.5, W = Math.max(2, Math.ceil(w * s)), H = Math.max(2, Math.ceil(h * s));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), im = g.createImageData(W, H), d = im.data;
  const hw = w / 2, hh = h / 2, rr = Math.min(r, hw, hh);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = (x + 0.5) / s, py = (y + 0.5) / s;
      const qx = Math.abs(px - hw) - (hw - rr), qy = Math.abs(py - hh) - (hh - rr);
      const dist = -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr);
      let nx = 0, ny = 0;
      if (dist >= 0 && dist < bezel) {
        const u = 1 - dist / bezel; // 0 inside, 1 at the rim
        const slope = u / Math.sqrt(Math.max(1e-3, 1 - u * u * 0.96)); // the quarter circle's slope, capped
        const m = Math.min(1, slope * 0.55);
        let gx = 0, gy = 0;
        if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy) || 1; gx = qx / l; gy = qy / l; } else if (qx > qy) gx = 1; else gy = 1;
        nx = -Math.sign(px - hw) * gx * m; ny = -Math.sign(py - hh) * gy * m; // towards the middle: the rim magnifies
      }
      const i = (y * W + x) * 4;
      d[i] = 128 + nx * 127; d[i + 1] = 128 + ny * 127; d[i + 2] = 128; d[i + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0);
  return c.toDataURL();
}

function ensureDefs() {
  if (defs) return defs;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:fixed;width:0;height:0;pointer-events:none';
  defs = document.createElementNS(NS, 'defs'); svg.appendChild(defs); document.body.appendChild(svg);
  return defs;
}
// frost (blur), strength (how far the rim pulls) and bezel by the kind of surface: big sheets frost more so text on
// them reads; controls refract more, as the skill's controls-and-navigation glass does. 0.9.56: a narrower, gentler
// bend (owner: shapes sliding round the glass while scrolling); what's behind still curves at the very edge
function paramsOf(el, w, h) {
  const big = el.classList.contains('dialog'), small = Math.min(w, h);
  return { frost: big ? 14 : el.classList.contains('tabs') ? 7 : 5, bezel: Math.max(6, Math.min(big ? 18 : 12, small * 0.22)), scale: big ? 18 : Math.min(20, small * 0.35) };
}
// 0.9.54 (owner: dark Glass looked milky): dark glass keeps the colours behind it rich but not loud (saturate 1.45,
// contrast 1.05, as its CSS backdrop); Light keeps 1.6. A theme change gives every piece its new filter (key 'd'/'l').
const tone = () => (document.body.classList.contains('theme-light') ? { k: 'l', sat: 1.6, con: 1 } : { k: 'd', sat: 1.45, con: 1.05 });
function filterFor(el) {
  // 0.9.49: the layout size, not getBoundingClientRect: a pop-up measured while it arrives (scaled to 0.9) got a filter
  // smaller than itself, and the part outside showed the page sharp along its edges (the keyboard, owner's photos)
  const bw = el.offsetWidth, bh = el.offsetHeight;
  if (bw < 24 || bh < 16) return null;
  const w = Math.ceil(bw / 8) * 8, h = Math.ceil(bh / 8) * 8;
  const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2);
  const p = paramsOf(el, w, h), t = tone();
  const key = `${w}x${h}r${Math.round(r)}f${p.frost}${t.k}`;
  let f = filters.get(key);
  if (!f) {
    if (filters.size >= 32) { const old = [...filters.entries()].sort((a, b2) => a[1].used - b2[1].used)[0]; document.getElementById(old[1].id)?.remove(); filters.delete(old[0]); }
    const id = 'lgf-' + key.replace(/[^a-z0-9]/gi, '');
    const node = document.createElementNS(NS, 'filter');
    node.setAttribute('id', id); const pad = 24; // a margin round the region, so a rounding or a sub-pixel move never leaves an edge unfiltered
    node.setAttribute('x', String(-pad)); node.setAttribute('y', String(-pad)); node.setAttribute('width', String(w + 2 * pad)); node.setAttribute('height', String(h + 2 * pad));
    node.setAttribute('filterUnits', 'userSpaceOnUse'); node.setAttribute('color-interpolation-filters', 'sRGB');
    // the blur fades to see-through within a few frost widths of the edge, and where a backdrop filter's result is
    // see-through the page shows unfiltered: sharp strips round every sheet (0.9.49, the keyboard). The frost is made
    // opaque again (alpha only, the colours are kept), before and after the lens bends it.
    node.innerHTML = `<feGaussianBlur in="SourceGraphic" stdDeviation="${p.frost}" result="soft"/>`
      + `<feComponentTransfer in="soft" result="frost"><feFuncA type="table" tableValues="1 1"/></feComponentTransfer>`
      // the lens over a neutral grey (no bend): where the lens picture isn't drawn (it loads after the first frame,
      // and Chromium leaves it out of some backdrop filters) the frost stays put instead of the whole view shifting
      // half the bend up and left, which showed the page's edge as a band along the top and left of every glass piece
      + `<feFlood flood-color="rgb(128,128,128)" result="still"/>`
      + `<feImage href="${lensMap(w, h, r, p.bezel)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="lensPic"/>`
      + `<feComposite in="lensPic" in2="still" operator="over" result="lens"/>`
      + `<feDisplacementMap in="frost" in2="lens" scale="${p.scale}" xChannelSelector="R" yChannelSelector="G" result="bent"/>`
      + `<feColorMatrix in="bent" type="saturate" values="${t.sat}" result="sat"/>`
      + `<feComponentTransfer in="sat">${t.con === 1 ? '' : ['R', 'G', 'B'].map((c) => `<feFunc${c} type="linear" slope="${t.con}" intercept="${((1 - t.con) / 2).toFixed(3)}"/>`).join('')}<feFuncA type="table" tableValues="1 1"/></feComponentTransfer>`;
    ensureDefs().appendChild(node);
    f = { id, used: 0 };
    filters.set(key, f);
  }
  f.used = performance.now();
  return { key, id: f.id };
}
function fit(el) {
  if (!on || !el.isConnected) return;
  const f = filterFor(el);
  if (!f) { el.style.removeProperty('--lg-refract'); seen.delete(el); return; }
  if (seen.get(el) === f.key) return;
  seen.set(el, f.key);
  el.style.setProperty('--lg-refract', `url(#${f.id})`);
}
function scan(root = document.body) {
  if (!on) return;
  const list = root.matches?.(SEL) ? [root] : [];
  for (const el of root.querySelectorAll?.(SEL) || []) list.push(el);
  for (const el of list) { if (!seen.has(el)) { seen.set(el, ''); ro.observe(el); } fit(el); }
}
const allowed = () => {
  const b = document.body.classList;
  return b.contains('elements-glass') && !b.contains('light-fx') && !b.contains('motion-reduce') && !matchMedia('(prefers-reduced-transparency: reduce)').matches;
};
function enable(v) {
  if (v === on) return;
  on = v;
  document.body.classList.toggle('lg-refract', on);
  if (on) scan();
}

// ---- the light (0.9.56, owner: white shapes moving round the focused thing in dark Glass "that don't correspond to
// anything"): the rim's highlight used to turn towards the pointer or the focus, so every glass edge on screen swung its
// light as you moved. The light is fixed now, from the top left (--lg-angle's default, 135deg), like a lamp in the room.

// ---- the step down: slow frames while things move -> plain frost for a minute
let sampling = false, liteUntil = 0;
export function glassSample() {
  if (!on || sampling || governor.mode === 'away') return;
  sampling = true;
  let n = 0, sum = 0, last = 0;
  frame((now) => {
    if (last) { sum += now - last; n++; }
    last = now;
    if (n < 40) return true;
    sampling = false;
    if (sum / n > 20) { liteUntil = performance.now() + 60000; document.body.classList.add('lg-lite'); setTimeout(() => { if (performance.now() >= liteUntil) document.body.classList.remove('lg-lite'); }, 60500); }
    return false;
  });
}

export function startGlass() {
  ro = new ResizeObserver((es) => { for (const e of es) fit(e.target); });
  mo = new MutationObserver((ms) => {
    if (!on) return;
    for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { scan(n); if (n.classList?.contains('scrim') || n.classList?.contains('view')) glassSample(); }
  });
  mo.observe(document.body, { childList: true, subtree: true });
  // the body's classes say whether Glass, light effects or reduced motion are on
  new MutationObserver(() => { enable(allowed()); if (on) scan(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  enable(allowed());
  let lastScroll = 0;
  addEventListener('scroll', () => { const t = performance.now(); if (on && t - lastScroll > 5000) { lastScroll = t; glassSample(); } }, { capture: true, passive: true });
}
