<template>
  <Transition name="idle">
    <div v-if="on" ref="el" class="idle" @pointerdown.stop.prevent="wake" @pointermove="onMove">
      <TransitionGroup name="slide">
        <div v-for="s in shown" :key="s.k" class="idle-img" :class="{ blur: s.blur, still: calm }" :style="{ backgroundImage: `url('${s.src}')` }" />
      </TransitionGroup>
      <div class="idle-shade" />
      <div class="idle-clock">
        <div class="t">{{ time }}</div>
        <div class="d">{{ date }}</div>
      </div>
      <Transition name="cap" mode="out-in">
        <div v-if="cur" :key="cur.k" class="idle-cap">
          <div class="n">{{ cur.name }}</div>
          <div class="p">{{ cur.platform }}</div>
        </div>
      </Transition>
      <div class="idle-hint"><Logo :size="22" />Press any button</div>
    </div>
  </Transition>
</template>

<script setup>
// Idle screen for the TV: after a few minutes without input, your games' artwork drifts by with the
// clock (Settings → Look & feel → Idle screen). Any button, key, touch or mouse movement wakes it,
// and that first press only wakes it.
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue';
import { store, allRoms, visible, backdropOf } from '../store.js';
import { pushLayer, lastInput } from '../nav.js';
import Logo from './Logo.vue';

const on = ref(false);
const el = ref(null);
const shown = ref([]);
const cur = computed(() => shown.value[shown.value.length - 1] || null);
const now = ref(new Date());
const time = computed(() => now.value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
const date = computed(() => now.value.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }));
const calm = computed(() => document.body.classList.contains('light-fx') || store.config?.ui?.motion === 'reduce');
const minutes = computed(() => { const v = store.config?.ui?.idle ?? '5'; return v === 'off' ? 0 : Number(v) || 0; });

let seen = performance.now(), layer = null, slideT = 0, clockT = 0, pool = [], at = 0, moveFrom = null;
const bump = () => { seen = performance.now(); };
function pickPool() {
  const list = allRoms().filter(visible).map((r) => ({ r, b: backdropOf(r) })).filter((x) => x.b && x.b.src);
  // screenshots and backgrounds first (covers blurred look softer), then shuffle
  const sharp = list.filter((x) => !x.b.blur), soft = list.filter((x) => x.b.blur);
  const use = sharp.length >= 6 ? sharp : [...sharp, ...soft];
  for (let i = use.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [use[i], use[j]] = [use[j], use[i]]; }
  return use.slice(0, 40);
}
function next() {
  if (!pool.length) return;
  const x = pool[at++ % pool.length];
  shown.value = [...shown.value.slice(-1), { k: Date.now() + '-' + at, src: x.b.src, blur: x.b.blur, name: x.r.name, platform: x.r.platform_display_name }];
}
async function sleep() {
  if (on.value || !store.config?.configured) return;
  pool = pickPool();
  if (!pool.length) return;
  on.value = true; at = 0; shown.value = []; next();
  slideT = setInterval(next, 12000);
  await nextTick();
  const w = () => { wake(); };
  layer = pushLayer(el.value, { up: w, down: w, left: w, right: w, accept: w, back: w, x: w, y: w, lb: w, rb: w, lt: w, rt: w, select: w, start: w });
}
function wake() {
  bump();
  if (!on.value) return;
  on.value = false;
  clearInterval(slideT);
  layer?.pop(); layer = null;
}
function onMove(e) {
  // a tiny nudge of the mouse (or a TV remote's pointer jitter) doesn't wake it
  if (!moveFrom) { moveFrom = [e.clientX, e.clientY]; return; }
  if (Math.hypot(e.clientX - moveFrom[0], e.clientY - moveFrom[1]) > 24) { moveFrom = null; wake(); }
}
function tick() {
  now.value = new Date();
  if (on.value || !minutes.value || document.visibilityState !== 'visible') return;
  const quiet = performance.now() - Math.max(seen, lastInput);
  if (quiet > minutes.value * 60000) sleep();
}
const keyWake = (e) => { if (on.value) { e.preventDefault(); e.stopImmediatePropagation(); wake(); } else bump(); };
const ptr = () => { if (!on.value) bump(); };
onMounted(() => {
  clockT = setInterval(tick, 5000);
  window.addEventListener('keydown', keyWake, true);
  window.addEventListener('pointerdown', ptr, true);
  window.addEventListener('pointermove', ptr, true);
  window.addEventListener('wheel', ptr, true);
});
onBeforeUnmount(() => {
  clearInterval(clockT); clearInterval(slideT); layer?.pop();
  window.removeEventListener('keydown', keyWake, true);
  window.removeEventListener('pointerdown', ptr, true);
  window.removeEventListener('pointermove', ptr, true);
  window.removeEventListener('wheel', ptr, true);
});
watch(minutes, bump);
defineExpose({ sleep, wake });
</script>

<style scoped>
.idle { position: fixed; inset: 0; z-index: 900; background: #05060a; overflow: hidden; cursor: none; }
.idle-img { position: absolute; inset: -4%; background-size: cover; background-position: center; animation: drift 14s linear forwards; }
.idle-img.blur { filter: blur(18px) saturate(1.2) brightness(0.8); inset: -8%; }
.idle-img.still { animation: none; }
@keyframes drift { from { transform: scale(1.02) translate3d(0, 0, 0); } to { transform: scale(1.1) translate3d(-1.5%, -1%, 0); } }
.idle-shade { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(0, 0, 0, 0.78) 0%, rgba(0, 0, 0, 0.1) 45%, rgba(0, 0, 0, 0.35) 100%); }
.idle-clock { position: absolute; left: 56px; bottom: 52px; color: #fff; text-shadow: 0 4px 24px rgba(0, 0, 0, 0.6); }
.idle-clock .t { font-family: var(--display); font-size: 96px; font-weight: 700; line-height: 1; letter-spacing: -0.03em; }
.idle-clock .d { font-size: 22px; font-weight: 500; opacity: 0.85; margin-top: 8px; }
.idle-cap { position: absolute; right: 56px; bottom: 56px; text-align: right; color: #fff; max-width: 40vw; text-shadow: 0 3px 18px rgba(0, 0, 0, 0.7); }
.idle-cap .n { font-family: var(--display); font-size: 26px; font-weight: 700; }
.idle-cap .p { font-size: 14px; opacity: 0.75; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600; margin-top: 4px; }
.idle-hint { position: absolute; top: 34px; right: 44px; display: flex; align-items: center; gap: 10px; color: rgba(255, 255, 255, 0.55); font-size: 14px; font-weight: 500; }
.idle-enter-active, .idle-leave-active { transition: opacity 0.8s ease; }
.idle-enter-from, .idle-leave-to { opacity: 0; }
.slide-enter-active { transition: opacity 1.6s ease; }
.slide-leave-active { transition: opacity 1.6s ease; }
.slide-enter-from, .slide-leave-to { opacity: 0; }
.cap-enter-active, .cap-leave-active { transition: opacity 0.6s ease, transform 0.6s ease; }
.cap-enter-from { opacity: 0; transform: translateY(8px); }
.cap-leave-to { opacity: 0; }
</style>
