<template>
  <div class="mv" ref="el">
    <header class="mv-top">
      <b>{{ name }}</b><span class="muted">Manual{{ pages ? ` · page ${page} of ${pages}` : '' }}</span>
      <div class="spacer" />
      <span class="hint"><Btn b="LB" /><Btn b="RB" />Page</span>
      <span class="hint"><Btn b="X" />{{ fit ? 'Zoom in' : 'Fit' }}</span>
      <span class="hint"><Btn b="RS" />Scroll</span>
      <button class="btn small" data-focus @click="closeModal(null)"><Icon name="mdiClose" :size="18" />Close</button>
    </header>
    <div v-if="error" class="center">{{ error }}</div>
    <div v-else-if="!pages" class="center"><div class="spinner" /></div>
    <div class="mv-pages" ref="scroller" data-scroll tabindex="0" :class="{ fit }" @scroll.passive="onScroll">
      <canvas v-for="n in pages" :key="n" :ref="(c) => (canvases[n] = c)" class="mv-page" :data-page="n" />
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, nextTick } from 'vue';
import { pushLayer, glideBy } from '../nav.js';
import { call, closeModal } from '../store.js';
import Icon from './Icon.vue';
import Btn from './Btn.vue';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// A game's manual from RomM, read with the controller: up/down scroll, LB/RB turn pages, X zooms,
// B closes. Pages are drawn as they come into view.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const props = defineProps({ romId: Number, name: String });
const el = ref(null), scroller = ref(null);
const pages = ref(0), page = ref(1), error = ref(''), fit = ref(true);
const canvases = {};
let doc = null, layer = null, io = null;
const drawn = new Set();
async function draw(n) {
  if (drawn.has(n) || !doc || !canvases[n]) return;
  drawn.add(n);
  const p = await doc.getPage(n);
  const width = scroller.value.clientWidth * (fit.value ? 0.62 : 0.94);
  const v1 = p.getViewport({ scale: 1 });
  const scale = (width / v1.width) * Math.min(2, window.devicePixelRatio || 1);
  const vp = p.getViewport({ scale });
  const c = canvases[n];
  c.width = vp.width; c.height = vp.height;
  c.style.width = width + 'px';
  await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
}
function redrawAll() { drawn.clear(); for (const n of Object.keys(canvases)) { const c = canvases[n]; if (c && isNear(c)) draw(Number(n)); } }
const isNear = (c) => { const r = c.getBoundingClientRect(); return r.bottom > -innerHeight && r.top < innerHeight * 2; };
function onScroll() {
  const mid = innerHeight / 2;
  for (let n = 1; n <= pages.value; n++) { const r = canvases[n]?.getBoundingClientRect(); if (r && r.top <= mid && r.bottom >= mid) { page.value = n; break; } }
}
function go(d) { const n = Math.max(1, Math.min(pages.value, page.value + d)); canvases[n]?.scrollIntoView({ block: 'start' }); page.value = n; }
async function toggleFit() { fit.value = !fit.value; await nextTick(); redrawAll(); }
onMounted(async () => {
  layer = pushLayer(el.value, {
    back: () => closeModal(null), up: () => glideBy(scroller.value, 0, -innerHeight * 0.3), down: () => glideBy(scroller.value, 0, innerHeight * 0.3),
    left: () => glideBy(scroller.value, -innerWidth * 0.2, 0), right: () => glideBy(scroller.value, innerWidth * 0.2, 0), lb: () => go(-1), rb: () => go(1), x: toggleFit, y() {}, start: () => closeModal(null), select() {}, lt() {}, rt() {}, accept() {},
  });
  try {
    const data = await call('rom:manual', { romId: props.romId });
    doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
    pages.value = doc.numPages;
    await nextTick();
    if (!scroller.value) return; // closed while the manual loaded
    io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && draw(Number(e.target.dataset.page))), { root: scroller.value, rootMargin: '100% 0px' });
    for (const n of Object.keys(canvases)) if (canvases[n]) io.observe(canvases[n]);
    scroller.value.focus();
  } catch (e) { error.value = e.message; }
});
onBeforeUnmount(() => { layer?.pop(); io?.disconnect(); doc?.destroy?.(); });
</script>

<style scoped>
.mv { position: fixed; inset: 0; z-index: 60; background: var(--s0); display: flex; flex-direction: column; animation: fade var(--d-med); }
.mv-top { display: flex; align-items: center; gap: var(--s-4); padding: var(--s-3) var(--s-5); background: var(--s1); }
.mv-top b { font-family: var(--display); font-size: var(--t-lg);  overflow-wrap: anywhere; }
.mv-top .hint { display: flex; align-items: center; gap: 6px; font-size: var(--t-sm); color: var(--muted); }
.spacer { flex: 1; }
.mv-pages { flex: 1; overflow: auto; display: flex; flex-direction: column; align-items: center; gap: var(--s-4); padding: var(--s-5) 0 var(--s-8); outline: none; }
.mv-page { flex: none; background: #fff; box-shadow: var(--shadow-card); border-radius: 2px; min-height: 200px; }
.center { flex: 1; }
</style>
