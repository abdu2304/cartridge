<template>
  <div class="bg-stage" :class="['bg-' + mode, { xmb: painted }]">
    <template v-if="painted">
      <div class="xmb-grad" :style="BG_BASE[mode] ? { background: BG_BASE[mode], opacity: 1 } : null" />
      <div v-if="DARK_BASE.has(mode)" class="bg-darken" />
      <canvas v-if="RENDERERS[mode]" ref="cv" class="xmb-waves" />
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
import { store } from '../store.js';
import { RENDERERS, DARK_BASE, BG_BASE } from '../bgRenderers.js';
import { paletteOf, lightEffects } from '../themes.js';
import { lastInput } from '../nav.js';

const mode = computed(() => {
  const m = store.config?.ui?.bgStyle || 'waves';
  return RENDERERS[m] || ['solid', 'art', 'wallpaper'].includes(m) ? m : 'waves';
});
const painted = computed(() => !!RENDERERS[mode.value] || mode.value === 'solid');
const light = computed(() => lightEffects(store.config?.ui, store.info));
const reduce = computed(() => store.config?.ui?.motion === 'reduce');
watch(light, (v) => document.body.classList.toggle('light-fx', v), { immediate: true });
// console backgrounds bring their own colours: a neutral vignette instead of the theme's tint
watch(mode, (m) => document.body.classList.toggle('bg-console', !!BG_BASE[m]), { immediate: true });

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
  const k = [mode.value, w, h, pal.accent, pal.warm, light.value].join('|');
  if (k === key && frame) return true;
  key = k;
  c.width = w; c.height = h;
  ctx = c.getContext('2d', { alpha: true, desynchronized: true });
  frame = RENDERERS[mode.value](ctx, w, h, S, pal, light.value);
  return true;
}
function loop(t) {
  raf = requestAnimationFrame(loop);
  const gap = light.value ? 50 : 33; // ~30fps (20 in light mode) is plenty for a slow ambient drift
  if (t - last < gap) return;
  // without the GPU, give every frame to the interface while you move around; the background
  // picks up again a moment after you stop
  if (light.value && t - lastInput < 900) return;
  last = t;
  if (!setup()) return;
  frame((t - t0) / 1000);
}
function start() {
  cancelAnimationFrame(raf); last = 0; key = ''; frame = null;
  if (!RENDERERS[mode.value]) return;
  if (reduce.value) { nextTick(() => { if (setup()) frame(12); }); return; } // one still frame
  raf = requestAnimationFrame(loop);
}
const restart = async () => { cancelAnimationFrame(raf); await nextTick(); start(); };
watch([mode, reduce, light, () => store.config?.ui?.theme, () => store.config?.ui?.customColor, () => store.config?.ui?.surface, () => JSON.stringify(store.config?.ui?.colors || {})], restart, { immediate: true });
const onResize = () => { if (reduce.value) restart(); };
window.addEventListener('resize', onResize);
const vis = () => (document.hidden ? cancelAnimationFrame(raf) : start());
document.addEventListener('visibilitychange', vis);
onBeforeUnmount(() => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', vis); window.removeEventListener('resize', onResize); });

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
