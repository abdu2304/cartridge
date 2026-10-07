<template>
  <div class="bg-stage" :class="['bg-' + mode, { xmb: painted }]">
    <template v-if="painted">
      <div class="xmb-grad" :style="baseOf(mode) ? { background: baseOf(mode), opacity: 1 } : null" />
      <div v-if="DARK_BASE.has(mode)" class="bg-darken" />
      <canvas v-if="rendererOf(mode)" ref="cv" class="xmb-waves" />
      <!-- the interface paints this itself once it's up (see .shell below): one full-screen layer fewer -->
      <div class="xmb-vignette" />
    </template>
    <template v-else-if="mode === 'wallpaper'">
      <div v-if="wallUrl" class="layer on wall" :style="{ backgroundImage: `url('${wallUrl}')` }" />
      <div v-else class="xmb-grad" />
      <div class="wall-dim" :style="{ opacity: wallDim }" />
    </template>
    <template v-else>
      <div v-for="(l, i) in layers" :key="i" class="layer" :class="{ on: l.on, blur: l.blur }" :style="l.src ? { backgroundImage: `url('${l.src}')` } : {}" />
      <div class="shade" />
    </template>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch, onBeforeUnmount, nextTick } from 'vue';
import { store, allRoms, cover } from '../store.js';
import { RENDERERS, DARK_BASE, BG_BASE, LEGACY_ART, artPan, setInk } from '../bgRenderers.js';
import { consoleColors } from '../consoleColors.js';
import { paletteOf, lightEffects } from '../themes.js';
import { lastInput } from '../nav.js';

const mode = computed(() => {
  let m = (store.welcoming && !store.welcomeBg && 'ribbons') || store.config?.ui?.bgStyle || 'solid'; // the welcome is on Ribbons until one is picked in its Look step
  if (LEGACY_ART[m]) m = 'art:' + LEGACY_ART[m]; // retired in 0.9.15: that console's own art instead
  return RENDERERS[m] || m.startsWith('art:') || ['solid', 'art', 'wallpaper'].includes(m) ? m : 'solid';
});
// art:<console> (0.9.15, A): a pan over that console's covers in your library, in its colour
const artCache = new Map();
function rendererOf(m) {
  if (RENDERERS[m]) return RENDERERS[m];
  if (!m?.startsWith('art:')) return null;
  const slug = m.slice(4);
  if (!artCache.has(slug)) {
    const urls = allRoms().filter((r) => r.platform_slug === slug || r.platform_fs_slug === slug).map((r) => cover(r)).filter(Boolean);
    const col = consoleColors({ slug }) || ['#9a9aaa'];
    const n = parseInt(col[0].replace('#', '').padEnd(6, '0').slice(0, 6), 16);
    artCache.set(slug, artPan(urls, `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`));
  }
  return artCache.get(slug);
}
const baseOf = (m) => BG_BASE[m] || (m?.startsWith('art:') ? BG_BASE.art : '');
const painted = computed(() => !!rendererOf(mode.value) || mode.value === 'solid');
const light = computed(() => lightEffects(store.config?.ui, store.info));
const reduce = computed(() => store.config?.ui?.motion === 'reduce');
watch(light, (v) => document.body.classList.toggle('light-fx', v), { immediate: true });
// console backgrounds bring their own colours: a neutral vignette instead of the theme's tint
watch(mode, (m) => document.body.classList.toggle('bg-console', !!baseOf(m)), { immediate: true });

// ---------- animated canvas backgrounds
// Drawn at full sharpness with the GPU. Without it (software rendering) they draw at a lower
// frame rate so the rest of the interface stays smooth. Not at a lower resolution below 4K:
// stretching a smaller canvas to the screen on every frame costs the software compositor more
// than drawing it full size (measured: about 30% of each frame while moving around).
const cv = ref(null);
let raf = 0, last = 0, ctx = null, frame = null, key = '';
const t0 = performance.now();
function scale() {
  const dpr = window.devicePixelRatio || 1;
  if (light.value) return innerWidth * dpr > 2600 ? 0.5 : 1;
  return Math.min(dpr, 2);
}
function setup() {
  const c = cv.value;
  if (!c) return false;
  const S = scale();
  const w = Math.floor(innerWidth * S), h = Math.floor(innerHeight * S);
  const pal = paletteOf(store.config?.ui);
  const k = [mode.value, w, h, pal.accent, pal.warm, pal.ink, light.value].join('|');
  if (k === key && frame) return true;
  key = k;
  c.width = w; c.height = h;
  ctx = c.getContext('2d', { alpha: true, desynchronized: true });
  setInk(pal.ink);
  frame = rendererOf(mode.value)(ctx, w, h, S, pal, light.value);
  return true;
}
// 0.9.56 (owner: the background stopping after a while felt broken; "only when a game is launched"): it never stops
// for being idle any more. It stops only while a game or another app is in front (store.away, blur, a hidden window)
// and starts again as soon as Cartridge is back. If drawing gets expensive (a slow device, a 4K screen) the rate halves.
let cost = 0, tv = 0, prevT = 0;
function stop() { cancelAnimationFrame(raf); raf = 0; prevT = 0; }
function next() { raf = requestAnimationFrame(loop); }
function loop(t) {
  const dt = prevT ? Math.min(100, t - prevT) : 16; prevT = t;
  tv += dt;
  next();
  const gap = (light.value ? 50 : 33) * (cost > 8 ? 2 : 1); // ~30fps (20 in light mode) is plenty for a slow ambient drift
  if (t - last < gap) return;
  // without the GPU, give every frame to the interface while you move around; the background
  // picks up again a moment after you stop
  if (light.value && t - lastInput < 900) return;
  last = t;
  if (!setup()) return;
  const s = performance.now();
  frame(tv / 1000);
  cost = cost * 0.9 + (performance.now() - s) * 0.1;
}
function start() {
  stop(); last = 0; key = ''; frame = null;
  if (!rendererOf(mode.value)) return;
  // one still frame: reduced motion, and (0.9.28, owner: choppy on handhelds) light effects, where repainting a
  // full-screen canvas without the GPU took frames from the interface
  if (reduce.value || light.value) { nextTick(() => { if (setup()) frame(12); }); return; }
  raf = requestAnimationFrame(loop);
}
const restart = async () => { stop(); await nextTick(); start(); };
watch([mode, reduce, light, () => store.config?.ui?.theme, () => store.config?.ui?.customColor, () => store.config?.ui?.surface, () => store.config?.ui?.style, () => JSON.stringify(store.config?.ui?.colors || {})], restart, { immediate: true });
// art backgrounds pick up the library once it's loaded or changes
watch(() => store.libVersion, () => { artCache.clear(); if (mode.value.startsWith('art:')) restart(); });
const onResize = () => { if (reduce.value || light.value) restart(); };
window.addEventListener('resize', onResize);
const vis = () => (document.hidden ? stop() : start());
document.addEventListener('visibilitychange', vis);
// not in front (a game is running from Steam, or another window is): no drawing at all (0.9.3, Ally)
const away = () => stop();
window.addEventListener('blur', away);
window.addEventListener('focus', start);
watch(() => store.away, (a) => (a ? stop() : start()));
onBeforeUnmount(() => { stop(); document.removeEventListener('visibilitychange', vis); window.removeEventListener('resize', onResize); window.removeEventListener('blur', away); window.removeEventListener('focus', start); });

// ---------- your own wallpaper
const wallUrl = computed(() => (store.config?.ui?.wallpaper ? 'romimg://img/?wp=1&t=' + store.config.ui.wallpaper : ''));
const wallDim = computed(() => ({ low: 0.25, medium: 0.45, high: 0.65 }[store.config?.ui?.wallDim || 'medium']));

// ---------- game art mode: two layers crossfade on focus
const layers = reactive([{ src: '', on: false, blur: false }, { src: '', on: false, blur: false }]);
let cur = 0;
watch(() => [store.bg?.src, mode.value], () => {
  if (mode.value !== 'art') return;
  const b = store.bg;
  const src = b?.src || '';
  if (src === layers[cur].src && layers[cur].on) return;
  const next = 1 - cur;
  if (!src) { layers[cur].on = false; return; }
  const im = new Image();
  im.onload = () => { layers[next].src = src; layers[next].blur = !!b.blur; layers[next].on = true; layers[cur].on = false; cur = next; };
  im.src = src;
});
</script>

<style>
.bg-stage.xmb { background: var(--xmb-base, #170838); }
.xmb-grad { position: absolute; inset: 0; background: var(--xmb); }
.bg-darken { position: absolute; inset: 0; background: linear-gradient(170deg, rgba(var(--tint-rgb), 0.35), rgba(var(--tint-rgb), 0.8) 70%); }
.bg-dots .bg-darken { background: linear-gradient(170deg, rgba(var(--tint-rgb), 0.15), rgba(var(--tint-rgb), 0.6) 80%); }
.xmb-waves { position: absolute; inset: 0; width: 100%; height: 100%; }
.xmb-vignette { position: absolute; inset: 0; background: radial-gradient(120% 100% at 50% 40%, transparent 55%, rgba(var(--tint-rgb), 0.5) 100%), linear-gradient(0deg, rgba(var(--tint-rgb), 0.5), transparent 35%); }
.surface-oled .xmb-vignette { background: radial-gradient(120% 100% at 50% 40%, transparent 45%, rgba(0, 0, 0, 0.85) 100%), linear-gradient(0deg, #000 2%, transparent 45%); }
/* same vignette, painted as the interface's background: without the GPU every full-screen layer is
   blended again on each frame, so this saves one while moving around */
body:has(.xmb-vignette) .shell { background: radial-gradient(120% 100% at 50% 40%, transparent 55%, rgba(var(--tint-rgb), 0.5) 100%), linear-gradient(0deg, rgba(var(--tint-rgb), 0.5), transparent 35%); }
body.surface-oled:has(.xmb-vignette) .shell { background: radial-gradient(120% 100% at 50% 40%, transparent 45%, rgba(0, 0, 0, 0.85) 100%), linear-gradient(0deg, #000 2%, transparent 45%); }
body:has(.shell) .xmb-vignette { display: none; }
body.bg-console .xmb-vignette, body.bg-console:has(.xmb-vignette) .shell { background: radial-gradient(120% 100% at 50% 40%, transparent 55%, rgba(0, 0, 0, 0.45) 100%), linear-gradient(0deg, rgba(0, 0, 0, 0.45), transparent 35%); }
.bg-stage .layer.wall { inset: 0; transform: none; filter: none; }
.wall-dim { position: absolute; inset: 0; background: linear-gradient(90deg, #000 0%, rgba(0, 0, 0, 0.6) 50%, rgba(0, 0, 0, 0.35) 100%); }
</style>
<style>
.surface-oled .xmb-grad { opacity: 0.3; }
.surface-oled .bg-stage .shade { background: linear-gradient(90deg, #000 0%, rgba(0, 0, 0, 0.8) 45%, rgba(0, 0, 0, 0.55) 100%), linear-gradient(0deg, #000 6%, transparent 60%); }
</style>
