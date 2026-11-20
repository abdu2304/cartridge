<template>
  <!-- Captures (0.9.95, owner's pick): every screenshot and clip your games made, from Steam and the emulators'
       own folders, newest first; one game's from its More. A opens one big (left and right step through, X shows it
       in its folder, Y opens its game), B goes back. Read only: nothing here moves or deletes a capture. Shared
       dialog, segment and button styles, so Plain and Glass each keep their own look. -->
  <div class="scrim" ref="el" @click.self="closeModal(null)">
    <div class="dialog cap" role="dialog" aria-labelledby="cap-title">
      <div class="cap-head">
        <div style="min-width: 0; flex: 1">
          <div class="eyebrow">Captures</div>
          <h2 id="cap-title">{{ name || 'All Your Games' }}</h2>
          <p class="muted small">{{ sub }}</p>
        </div>
        <div v-if="hasVideo" class="seg cap-seg">
          <button v-for="f in FILTERS" :key="f.v" data-focus :class="{ on: filter === f.v }" @click="filter = f.v">{{ f.l }}</button>
        </div>
      </div>
      <div class="cap-body" data-scroll>
        <div v-if="!list" class="muted small cap-empty"><Icon name="mdiSync" :size="18" class="spin" /> Looking through Steam and your emulators’ folders…</div>
        <div v-else-if="!shown.length" class="cap-empty">
          <Icon name="mdiImageMultipleOutline" :size="40" />
          <b>No captures yet</b>
          <p class="muted small">Take one while you play: Steam + R1 on a Steam Deck, F12 in Steam on a PC, or your emulator’s own screenshot key. They show up here, matched to their game.</p>
        </div>
        <div v-else class="cap-grid">
          <button v-for="(c, i) in shown.slice(0, limit)" :key="c.id" class="cap-tile" data-focus :aria-label="label(c)" @click="openAt(i)">
            <img :src="thumb(c)" alt="" loading="lazy" decoding="async" @error="($event.target.style.visibility = 'hidden')" />
            <span v-if="c.kind === 'video'" class="cap-play"><Icon name="mdiPlay" :size="22" /></span>
            <span class="cap-cap"><b>{{ romId != null ? ago(c.at) : c.game || c.source }}</b><small>{{ romId != null ? c.source : ago(c.at) }}</small></span>
          </button>
        </div>
        <button v-if="list && shown.length > limit" class="btn cap-more" data-focus @click="limit += 120">Show More ({{ shown.length - limit }})</button>
      </div>
      <div class="row cap-foot">
        <button class="btn" data-focus @click="reload"><Icon name="mdiRefresh" :size="18" />Look Again</button>
        <button class="btn" data-focus @click="closeModal(null)">Done</button>
      </div>
      <!-- one capture, big -->
      <div v-if="cur" class="cap-view" ref="viewEl">
        <div class="cap-stage">
          <video v-if="cur.kind === 'video'" :key="cur.id" :src="full(cur)" controls autoplay playsinline />
          <img v-else :key="cur.id" :src="full(cur)" alt="" />
        </div>
        <div class="cap-info">
          <div style="min-width: 0; flex: 1">
            <b>{{ cur.game || cur.source }}</b>
            <span class="muted small">{{ cur.source }} · {{ when(cur.at) }} · {{ at + 1 }} of {{ shown.length }}</span>
            <span class="muted small cap-where">{{ cur.where }}/{{ cur.file }}</span>
          </div>
          <div class="row cap-acts">
            <button class="btn small" data-focus @click="step(-1)" :disabled="at === 0" aria-label="Previous"><Icon name="mdiChevronLeft" :size="20" /></button>
            <button class="btn small" data-focus @click="step(1)" :disabled="at >= shown.length - 1" aria-label="Next"><Icon name="mdiChevronRight" :size="20" /></button>
            <button class="btn small" data-focus @click="showFile"><Icon name="mdiFolderOutline" :size="18" />Show in Folder</button>
            <button v-if="cur.romId != null && romId == null" class="btn small" data-focus @click="openGame"><Icon name="mdiGamepadVariantOutline" :size="18" />Open Game</button>
            <button class="btn small" data-focus @click="closeView"><Icon name="mdiClose" :size="18" />Close</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue';
import { pushLayer, focusFirst } from '../nav.js';
import { call, closeModal, toast, ago, go } from '../store.js';
import Icon from './Icon.vue';

const props = defineProps({ romId: { type: Number, default: null }, name: { type: String, default: '' } });
const FILTERS = [{ v: 'all', l: 'All' }, { v: 'image', l: 'Screenshots' }, { v: 'video', l: 'Clips' }];
const el = ref(null), viewEl = ref(null), list = ref(null), filter = ref('all'), limit = ref(120), at = ref(-1);
const hasVideo = computed(() => (list.value || []).some((c) => c.kind === 'video'));
const shown = computed(() => (list.value || []).filter((c) => filter.value === 'all' || c.kind === filter.value));
const cur = computed(() => (at.value >= 0 ? shown.value[at.value] || null : null));
const sub = computed(() => {
  if (!list.value) return 'Screenshots and clips from Steam and your emulators.';
  const n = list.value.length, v = list.value.filter((c) => c.kind === 'video').length;
  if (!n) return 'Screenshots and clips from Steam and your emulators.';
  return `${n - v} ${n - v === 1 ? 'screenshot' : 'screenshots'}${v ? ` and ${v} ${v === 1 ? 'clip' : 'clips'}` : ''}, newest first. Cartridge only shows them; they stay where they are.`;
});
const thumb = (c) => 'romimg://img/?cap=' + c.id + (c.kind === 'video' ? '' : '&w=480');
const full = (c) => 'romimg://img/?cap=' + c.id + (c.kind === 'video' ? '' : '&w=1920');
const when = (t) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const label = (c) => `${c.game || c.source}, ${c.kind === 'video' ? 'clip' : 'screenshot'}, ${ago(c.at)}`;
async function load(fresh) {
  try { list.value = await call('captures:list', { romId: props.romId, fresh }); } catch (e) { list.value = []; toast(e.message, 'error', 5000); }
}
async function reload() { list.value = null; await load(true); await nextTick(); focusFirst(el.value); }
let viewLayer = null, lastTile = null;
async function openAt(i) {
  lastTile = document.activeElement; at.value = i; await nextTick();
  viewLayer = pushLayer(viewEl.value, { back: closeView, left: () => step(-1), right: () => step(1), x: showFile, y: () => { if (cur.value?.romId != null && props.romId == null) openGame(); }, lb: () => step(-1), rb: () => step(1), start: closeView, select() {}, lt() {}, rt() {} });
  focusFirst(viewEl.value);
}
function step(d) { const n = at.value + d; if (n >= 0 && n < shown.value.length) at.value = n; }
function closeView() { viewLayer?.pop(); viewLayer = null; at.value = -1; nextTick(() => (lastTile?.isConnected ? lastTile.focus({ preventScroll: false }) : focusFirst(el.value))); }
async function showFile() { if (!cur.value) return; try { await call('captures:show', { id: cur.value.id }); } catch (e) { toast(e.message, 'error', 4000); } }
function openGame() { const id = cur.value?.romId; if (id == null) return; viewLayer?.pop(); viewLayer = null; closeModal(null); go('game', { romId: id }); }
let layer;
onMounted(async () => {
  const none = () => {};
  layer = pushLayer(el.value, { back: () => closeModal(null), start: () => closeModal(null), lb: none, rb: none, x: none, y: none, select: none, lt: none, rt: none });
  focusFirst(el.value);
  await load(false); await nextTick(); focusFirst(el.value);
});
onBeforeUnmount(() => { viewLayer?.pop(); layer?.pop(); });
</script>

<style scoped>
.cap { position: relative; width: min(1180px, 96vw); height: min(860px, 90vh); display: flex; flex-direction: column; gap: var(--s-4); overflow: hidden; }
.cap-head { display: flex; gap: var(--s-4); align-items: flex-end; flex-wrap: wrap; }
.cap-head h2 { margin: 2px 0 6px; font-size: var(--t-xl); line-height: 1.15; overflow-wrap: anywhere; }
.cap-head p { margin: 0; line-height: 1.45; }
.cap-seg { flex: none; }
.cap-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 6px; }
.cap-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(clamp(160px, 18vw, 260px), 1fr)); gap: var(--s-3); }
.cap-tile { position: relative; display: block; aspect-ratio: 16 / 9; padding: 0; border: 0; border-radius: var(--r-md); overflow: hidden; background: var(--s2); text-align: left; color: #fff; }
.cap-tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cap-tile:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
:global(.pad-mode .cap-tile:focus) { outline: 3px solid var(--focus); outline-offset: 2px; }
.cap-cap { position: absolute; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; padding: 18px 10px 8px; background: linear-gradient(transparent, rgba(0, 0, 0, 0.78)); }
.cap-cap b { font-size: var(--t-sm); font-weight: 600; line-height: 1.25; overflow-wrap: anywhere; }
.cap-cap small { font-size: var(--t-xs); opacity: 0.8; }
.cap-play { position: absolute; top: 8px; right: 8px; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: rgba(0, 0, 0, 0.6); }
.cap-more { margin: var(--s-4) auto 0; display: flex; }
.cap-empty { display: flex; flex-direction: column; align-items: center; gap: var(--s-2); text-align: center; padding: var(--s-6) var(--s-4); max-width: 520px; margin: 0 auto; }
.cap-empty p { margin: 0; line-height: 1.45; }
.cap-foot { justify-content: flex-end; gap: var(--s-2); flex-wrap: wrap; }
/* one capture, big: over the whole dialog */
.cap-view { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; gap: var(--s-3); padding: var(--s-4); background: var(--s1); border-radius: inherit; }
.cap-stage { flex: 1 1 auto; min-height: 0; display: grid; place-items: center; border-radius: var(--r-md); background: #000; overflow: hidden; }
.cap-stage img, .cap-stage video { width: 100%; height: 100%; object-fit: contain; display: block; } /* a small capture fills the stage too */
.cap-info { display: flex; gap: var(--s-4); align-items: center; flex-wrap: wrap; }
.cap-info > div:first-child { display: flex; flex-direction: column; gap: 2px; }
.cap-info b { overflow-wrap: anywhere; }
.cap-where { overflow-wrap: anywhere; }
.cap-acts { gap: var(--s-2); flex-wrap: wrap; justify-content: flex-end; }
:global(body.elements-glass .cap-view) { background: color-mix(in srgb, var(--s1) 78%, transparent); backdrop-filter: blur(28px) saturate(1.2); } /* Glass: frosted over the grid; Plain stays solid */
</style>
