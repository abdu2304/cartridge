<template>
  <div class="bg-stage" :class="{ xmb: mode === 'waves' }">
    <template v-if="mode === 'waves'">
      <div class="xmb-grad" />
      <canvas ref="cv" class="xmb-waves" />
      <div class="xmb-vignette" />
    </template>
    <template v-else>
      <div v-for="(l, i) in layers" :key="i" class="layer" :class="{ on: l.on, blur: l.blur }" :style="l.src ? { backgroundImage: `url('${l.src}')` } : {}" />
      <div class="shade" />
      <div class="grain" />
    </template>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch, onBeforeUnmount, nextTick } from 'vue';
import { store } from '../store.js';

const mode = computed(() => store.config?.ui?.bgStyle || 'waves');

// ---------- PSP XMB style: purple gradient + slow translucent ribbons
const cv = ref(null);
let raf = 0, last = 0;
const WAVES = [
  // amplitude, wavelength, speed, vertical position, thickness, alpha
  { a: 0.09, k: 1.6, s: 0.10, y: 0.58, h: 0.16, al: 0.10 },
  { a: 0.07, k: 2.3, s: -0.07, y: 0.62, h: 0.10, al: 0.08 },
  { a: 0.11, k: 1.1, s: 0.05, y: 0.55, h: 0.22, al: 0.06 },
  { a: 0.05, k: 3.1, s: 0.13, y: 0.64, h: 0.05, al: 0.12 },
];
function draw(t) {
  raf = requestAnimationFrame(draw);
  if (t - last < 33) return; // ~30fps is plenty and easy on the Deck
  last = t;
  const c = cv.value;
  if (!c) return;
  const dpr = 0.6;
  const w = Math.floor(innerWidth * dpr), h = Math.floor(innerHeight * dpr);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  const time = t / 1000;
  for (const wv of WAVES) {
    const top = [], bot = [];
    for (let x = 0; x <= w; x += 8) {
      const u = x / w;
      const base = wv.y * h + Math.sin(u * Math.PI * wv.k + time * wv.s * 6) * wv.a * h + Math.sin(u * Math.PI * wv.k * 0.5 - time * wv.s * 3) * wv.a * 0.5 * h;
      const thick = wv.h * h * (0.55 + 0.45 * Math.sin(u * Math.PI * 1.3 + time * wv.s * 4));
      top.push([x, base - thick / 2]);
      bot.push([x, base + thick / 2]);
    }
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, `rgba(255,255,255,0)`);
    grad.addColorStop(0.3, `rgba(255,255,255,${wv.al})`);
    grad.addColorStop(0.7, `rgba(255,255,255,${wv.al * 1.3})`);
    grad.addColorStop(1, `rgba(255,255,255,0)`);
    g.beginPath();
    top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    for (let i = bot.length - 1; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]);
    g.closePath();
    g.fillStyle = grad;
    g.fill();
    // bright edge line, like the XMB ribbon highlight
    g.beginPath();
    top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.strokeStyle = `rgba(255,255,255,${wv.al * 1.6})`;
    g.lineWidth = 1.2;
    g.stroke();
  }
}
function start() { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }
watch(mode, async (m) => { cancelAnimationFrame(raf); if (m === 'waves') { await nextTick(); start(); } }, { immediate: true });
const vis = () => (document.hidden ? cancelAnimationFrame(raf) : mode.value === 'waves' && start());
document.addEventListener('visibilitychange', vis);
onBeforeUnmount(() => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', vis); });

// ---------- Game art mode: two layers crossfade on focus
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
.bg-stage.xmb { background: #1a0b33; }
.xmb-grad {
  position: absolute; inset: -10%;
  background:
    radial-gradient(120% 90% at 85% 0%, #b16cf0 0%, transparent 55%),
    radial-gradient(90% 80% at 0% 100%, #3a1170 0%, transparent 60%),
    linear-gradient(160deg, #6a2fc2 0%, #4a1b92 38%, #2b0f5e 70%, #170838 100%);
  animation: xmbShift 24s ease-in-out infinite alternate;
}
@keyframes xmbShift { from { filter: hue-rotate(-8deg) brightness(0.95); transform: translate3d(0, 0, 0); } to { filter: hue-rotate(10deg) brightness(1.05); transform: translate3d(-2%, 1%, 0); } }
.xmb-waves { position: absolute; inset: 0; width: 100%; height: 100%; filter: blur(0.6px); mix-blend-mode: screen; }
.xmb-vignette { position: absolute; inset: 0; background: radial-gradient(120% 100% at 50% 40%, transparent 55%, rgba(8, 3, 20, 0.55) 100%), linear-gradient(0deg, rgba(10, 4, 24, 0.55), transparent 35%); }
</style>
