<template>
  <div class="scrim" ref="el" @click.self="closeModal(null)">
    <div class="dialog art-picker">
      <div class="ap-head">
        <h2>{{ titles[kind] }}</h2>
        <span class="muted small">{{ romName }}</span>
      </div>
      <div class="ap-games">
        <span class="muted small">SteamGridDB match</span>
        <button v-for="g in games" :key="g.id" class="chipbtn" :class="{ on: g.id === gameId }" data-focus @click="load(g.id)">{{ g.name }}<template v-if="g.year"> · {{ g.year }}</template></button>
        <button class="chipbtn" data-focus @click="searchOther"><Icon name="mdiMagnify" :size="16" />Search another name</button>
      </div>
      <div v-if="busy" class="center" style="height: 260px"><div class="spinner" /></div>
      <div v-else-if="error" class="empty" style="padding: 40px 0">{{ error }}</div>
      <div v-else-if="!images.length" class="empty" style="padding: 40px 0">No {{ nouns[kind] }} on SteamGridDB for this match. Try another match or name.</div>
      <div v-else class="ap-grid" :class="kind" data-scroll>
        <button v-for="(im, i) in images" :key="im.url" class="ap-item" data-focus :data-autofocus="i === 0 ? '' : undefined" @click="closeModal(im.url)">
          <img :src="img(im.thumb)" loading="lazy" decoding="async" />
          <span v-if="im.style" class="ap-style">{{ im.style }}</span>
        </button>
      </div>
      <div class="ap-foot muted small"><Btn b="A" />Use this<Btn b="B" style="margin-left: 12px" />Cancel</div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, nextTick } from 'vue';
import { pushLayer, focusFirst } from '../nav.js';
import { closeModal, call, img, askText, store } from '../store.js';
import Icon from './Icon.vue';
import Btn from './Btn.vue';

// Pick a cover, logo or background for one game from SteamGridDB. Resolves with the image URL.
const props = defineProps({ kind: { type: String, default: 'grid' }, romName: String, query: String });
const titles = { grid: 'Change cover', logo: 'Change logo', hero: 'Change background', icon: 'Change icon' };
const nouns = { grid: 'covers', logo: 'logos', hero: 'backgrounds', icon: 'icons' };
const el = ref(null);
const games = ref([]);
const gameId = ref(null);
const images = ref([]);
const busy = ref(true);
const error = ref('');
const query = props.query || props.romName;

async function load(gid) {
  busy.value = true; error.value = '';
  try {
    const r = await call('art:search', { name: query, kind: props.kind, gameId: gid || null });
    games.value = r.games; gameId.value = r.gameId; images.value = r.images;
  } catch (e) { error.value = e.message || String(e); }
  busy.value = false;
  await nextTick();
  focusFirst(el.value, '.ap-item[data-autofocus]') || focusFirst(el.value);
}
async function searchOther() {
  // the text prompt replaces this modal, so reopen with the result
  const saved = store.modal;
  const v = await askText({ title: 'Search SteamGridDB', value: query, placeholder: 'Game name', mode: 'game' });
  store.modal = { ...saved, props: { ...saved.props, query: v && v.trim() ? v.trim() : query } };
}

let layer;
onMounted(() => {
  layer = pushLayer(el.value, { back: () => closeModal(null), lb() {}, rb() {}, x() {}, y() {}, select() {}, start() {}, lt() {}, rt() {} });
  load(null);
});
onBeforeUnmount(() => layer.pop());
</script>

<style>
.dialog.art-picker { width: min(980px, 94vw); max-width: none; height: min(720px, 90vh); }
.ap-head { display: flex; align-items: baseline; gap: 14px; }
.ap-games { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.chipbtn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 999px; background: rgba(255, 255, 255, 0.07); border: 1px solid var(--line-2); font-size: 13px; color: var(--text); }
.chipbtn.on { background: var(--primary); border-color: var(--primary-l); color: #fff; }
.ap-grid { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: grid; gap: 16px; padding: 8px; align-content: start; grid-auto-rows: max-content; }
.ap-grid.grid { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }
.ap-grid.grid .ap-item img { aspect-ratio: 2 / 3; }
.ap-grid.hero { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.ap-grid.hero .ap-item img { aspect-ratio: 96 / 31; }
.ap-grid.icon { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
.ap-grid.icon .ap-item img { aspect-ratio: 1; border-radius: 22%; object-fit: cover; }
.ap-grid.logo { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.ap-grid.logo .ap-item { background: repeating-conic-gradient(#2a2e3a 0% 25%, #20232d 0% 50%) 50% / 20px 20px; padding: 14px; }
.ap-grid.logo .ap-item img { aspect-ratio: 16 / 7; }
.ap-grid.logo .ap-item img { object-fit: contain; }
.ap-item { position: relative; display: block; width: 100%; min-height: 0; border-radius: 6px; overflow: hidden; background: #161a25; transition: transform 0.14s ease-out; }
.ap-item img { width: 100%; height: auto; object-fit: cover; display: block; }
.ap-item:focus { transform: scale(1.04); }
.ap-style { position: absolute; left: 6px; bottom: 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; padding: 2px 6px; border-radius: 4px; background: rgba(0, 0, 0, 0.6); color: #cfd3dc; }
.ap-foot { display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
</style>
