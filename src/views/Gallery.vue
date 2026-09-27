<template>
  <div class="plat-view" ref="el">
    <div v-if="mode === 'platform' && !platform" class="center">Console not found<button class="btn" data-focus @click="back()">Back</button></div>
    <template v-else>
      <header class="ph-head">
        <div class="sys-switch">
          <Btn v-if="mode !== 'all'" b="LB" />
          <PIcon v-if="mode === 'platform'" :p="platform" :size="52" />
          <div v-else class="hicon"><Icon :name="mode === 'all' ? 'mdiViewGridOutline' : collection?.favorite ? 'mdiStar' : 'mdiBookmarkMultipleOutline'" :size="30" /></div>
          <div style="min-width: 0">
            <div v-if="mode !== 'platform'" class="eyebrow">{{ mode === 'all' ? 'Library' : collection?.smart ? 'Smart collection' : 'Collection' }}</div>
            <h1>{{ title }}</h1>
            <div class="muted row" style="gap: 8px; font-size: 13px">
              <span>{{ source.length }} games</span><span>·</span><span style="color: var(--green-l)">{{ installedCount }} on device</span>
              <template v-if="mode === 'platform'"><span>·</span>
                <span class="row" style="gap: 6px"><span class="dot" :class="platform.target?.exists ? 'ok' : ''" /><span class="mono" style="max-width: 340px">{{ platform.target?.path || 'No folder set' }}</span></span>
              </template>
            </div>
          </div>
          <Btn v-if="mode !== 'all'" b="RB" />
        </div>
        <div class="row">
          <template v-if="mode === 'platform'">
            <button class="btn small" data-focus @click="changeFolder"><Icon name="mdiFolderCog" :size="18" />Folder</button>
            <button v-if="bios.length" class="btn small" data-focus @click="getBios"><Icon name="mdiChip" :size="18" />BIOS · {{ bios.length }}</button>
          </template>
          <button v-if="mode === 'all'" class="btn small" data-focus @click="pickConsole"><Icon name="mdiGamepadSquareOutline" :size="18" />{{ consoleFilter ? platformById(consoleFilter)?.display_name : 'All consoles' }}</button>
          <button v-if="mode === 'all' && collections().length" class="btn small" data-focus @click="pickCollection"><Icon name="mdiBookmarkMultipleOutline" :size="18" />Collections</button>
        </div>
      </header>

      <div class="toolbar">
        <div class="seg"><button v-for="f in filters" :key="f.v" data-focus :class="{ on: filter === f.v }" @click="filter = f.v">{{ f.l }}</button></div>
        <div class="seg"><button v-for="s in sorts" :key="s.v" data-focus :class="{ on: sort === s.v }" @click="sort = s.v">{{ s.l }}</button></div>
        <button class="btn small" data-focus @click="search"><Icon name="mdiMagnify" :size="18" />{{ q ? `“${q}”` : 'Filter' }}</button>
        <button v-if="q" class="btn small" data-focus @click="q = ''"><Icon name="mdiClose" :size="18" /></button>
        <div style="flex: 1" />
        <button v-if="missingCount && filter !== 'installed' && mode !== 'all'" class="btn small" data-focus @click="downloadAll"><Icon name="mdiDownloadMultiple" :size="18" />Get all {{ missingCount }}</button>
      </div>

      <div class="body">
        <div class="grid-pane" data-scroll ref="gridEl">
          <div v-if="!list.length" class="empty">No games match.</div>
          <div v-else class="game-grid">
            <GameCard v-for="r in shown" :key="r.id" :rom="r" :show-platform="mode !== 'platform'" @open="open" @focused="focusRom" />
          </div>
          <div v-if="shown.length < list.length" ref="moreEl" class="more"><div class="spinner" /></div>
        </div>
        <aside class="detail glass" v-if="cur">
          <Transition name="fadeup" mode="out-in">
            <div :key="cur.id" class="detail-in">
              <div class="d-cover"><img v-if="coverSrc" :src="coverSrc" /><div v-else class="noart">{{ cur.name }}</div></div>
              <h2>{{ cur.name }}</h2>
              <div class="row" style="gap: 8px; flex-wrap: wrap">
                <span v-if="isNew(cur)" class="chip new">NEW</span>
                <span v-if="store.installed[cur.id]" class="chip green"><Icon name="mdiCheckCircle" :size="14" />On device</span>
                <span v-else-if="curDl" class="chip primary">{{ curDl }}</span>
                <span v-else class="chip">{{ bytes(cur.fs_size_bytes) }}</span>
                <span v-if="year(cur.year)" class="chip">{{ year(cur.year) }}</span>
                <span v-for="r in cur.regions.slice(0, 2)" :key="r" class="chip">{{ r }}</span>
              </div>
              <div class="muted" style="font-size: 13px">{{ [mode !== 'platform' ? cur.platform_display_name : '', cur.genres.join(', '), cur.developer].filter(Boolean).join(' · ') }}</div>
              <p class="d-sum">{{ cur.summary || 'No description.' }}</p>
              <div class="d-hints"><span class="hint"><Btn b="A" />Details</span><span class="hint" v-if="!store.installed[cur.id]"><Btn b="X" />Download</span></div>
            </div>
          </Transition>
        </aside>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, nextTick, watch } from 'vue';
import { store, go, back, platformById, romsOf, allRoms, collections, collectionById, romsOfCollection, askText, pickFolder, call, download, toast, choose, confirm, bytes, year, isNew, cover, setBg, backdropOf, downloadFor, visiblePlatforms, romById } from '../store.js';
import { useView } from '../useView.js';
import { ensureFocus, jump } from '../nav.js';
import Icon from '../components/Icon.vue';
import Btn from '../components/Btn.vue';
import PIcon from '../components/PIcon.vue';
import GameCard from '../components/GameCard.vue';

const props = defineProps({ platformId: Number, collectionId: String });
const mode = computed(() => (props.platformId ? 'platform' : props.collectionId ? 'collection' : 'all'));
const el = ref(null);
const gridEl = ref(null);
const moreEl = ref(null);
const filter = ref('all');
const sort = ref(mode.value === 'all' ? 'new' : 'name');
const q = ref('');
const bios = ref([]);
const cur = ref(null);
const consoleFilter = ref(null);
const PAGE = 120;
const limit = ref(PAGE);
const filters = [{ v: 'all', l: 'All' }, { v: 'installed', l: 'On device' }, { v: 'missing', l: 'Not downloaded' }, { v: 'new', l: 'New' }];
const sorts = [{ v: 'name', l: 'A–Z' }, { v: 'new', l: 'Recently added' }, { v: 'year', l: 'Release' }, { v: 'size', l: 'Size' }];

const platform = computed(() => platformById(props.platformId));
const collection = computed(() => collectionById(props.collectionId));
const title = computed(() => (mode.value === 'platform' ? platform.value?.display_name : mode.value === 'collection' ? collection.value?.name || 'Collection' : 'All games'));
const source = computed(() => {
  if (mode.value === 'platform') return romsOf(props.platformId);
  if (mode.value === 'collection') return romsOfCollection(props.collectionId);
  const all = allRoms();
  return consoleFilter.value ? all.filter((r) => r.platform_id === consoleFilter.value) : all;
});
const installedCount = computed(() => source.value.filter((r) => store.installed[r.id]).length);
const list = computed(() => {
  let items = source.value;
  if (filter.value === 'installed') items = items.filter((r) => store.installed[r.id]);
  if (filter.value === 'missing') items = items.filter((r) => !store.installed[r.id]);
  if (filter.value === 'new') items = items.filter(isNew);
  if (q.value) { const s = q.value.toLowerCase(); items = items.filter((r) => r.name.toLowerCase().includes(s) || (r.fs_name || '').toLowerCase().includes(s)); }
  items = [...items];
  if (sort.value === 'name') items.sort((a, b) => a.name.localeCompare(b.name));
  if (sort.value === 'new') items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  if (sort.value === 'year') items.sort((a, b) => (a.year || 9e15) - (b.year || 9e15));
  if (sort.value === 'size') items.sort((a, b) => (b.fs_size_bytes || 0) - (a.fs_size_bytes || 0));
  return items;
});
// Render in pages so a 5,000-game library stays smooth on the Deck
const shown = computed(() => list.value.slice(0, limit.value));
watch([filter, sort, q, consoleFilter], () => { limit.value = PAGE; gridEl.value?.scrollTo({ top: 0 }); });
let io;
watch(moreEl, (m) => { io?.disconnect(); if (m) { io = new IntersectionObserver((e) => { if (e[0].isIntersecting) limit.value += PAGE; }, { root: gridEl.value, rootMargin: '600px' }); io.observe(m); } });
onBeforeUnmount(() => io?.disconnect());

const missingCount = computed(() => list.value.filter((r) => !store.installed[r.id]).length);
const coverSrc = computed(() => cur.value && cover(cur.value, true));
const curDl = computed(() => {
  const d = cur.value && downloadFor(cur.value.id);
  if (!d || !['queued', 'downloading'].includes(d.status)) return '';
  return d.status === 'queued' ? 'Queued' : `Downloading ${d.total ? Math.floor((d.received / d.total) * 100) : 0}%`;
});

function focusRom(r) { cur.value = r; setBg(backdropOf(r)); }
function neighbor(dir) {
  if (mode.value === 'all') return;
  if (mode.value === 'platform') {
    const vis = visiblePlatforms();
    const i = vis.findIndex((p) => p.id === props.platformId);
    const n = vis[(i + dir + vis.length) % vis.length];
    if (n) store.route = { ...store.route, params: { platformId: n.id } };
  } else {
    const cs = collections();
    const i = cs.findIndex((c) => c.id === props.collectionId);
    const n = cs[(i + dir + cs.length) % cs.length];
    if (n) store.route = { ...store.route, params: { collectionId: n.id } };
  }
}

useView(
  {
    lb: () => (mode.value === 'all' ? false : neighbor(-1)),
    rb: () => (mode.value === 'all' ? false : neighbor(1)),
    lt: () => jump('up'), rt: () => jump('down'),
    y: () => search(),
    x: () => {
      const key = document.activeElement?.dataset?.key || '';
      if (!key.startsWith('rom-')) return;
      const r = romById(key.slice(4));
      if (r && !store.installed[r.id]) download(r); else if (r) toast('Already on this device', 'info', 1800);
    },
    select: () => { filter.value = filters[(filters.findIndex((f) => f.v === filter.value) + 1) % filters.length].v; },
  },
  () => [{ b: 'A', label: 'Details' }, { b: 'X', label: 'Download' }, { b: 'Y', label: 'Filter' }, { b: 'LT', label: '/ RT  Page' },
    ...(mode.value === 'all' ? [{ b: 'LB', label: '/ RB  Tabs' }] : [{ b: 'LB', label: mode.value === 'platform' ? '/ RB  Console' : '/ RB  Collection' }, { b: 'B', label: 'Back' }])],
);

function open(r) { go('game', { romId: r.id }); }
async function search() {
  const v = await askText({ title: `Filter ${title.value}`, value: q.value, placeholder: 'Game name' });
  if (v !== null && v !== undefined) q.value = v.trim();
}
async function pickConsole() {
  const v = await choose({ title: 'Show games from', options: [{ label: 'All consoles', value: 0, icon: 'mdiViewGridOutline', selected: !consoleFilter.value }, ...visiblePlatforms().map((p) => ({ label: p.display_name, sub: `${p.rom_count}`, value: p.id, selected: consoleFilter.value === p.id }))] });
  if (v !== null && v !== undefined) consoleFilter.value = v || null;
}
async function pickCollection() {
  const v = await choose({ title: 'Collections', options: collections().map((c) => ({ label: c.name, sub: `${c.rom_ids.length}`, value: c.id, icon: c.favorite ? 'mdiStar' : c.smart ? 'mdiAutoFix' : 'mdiBookmarkOutline' })) });
  if (v) go('collection', { collectionId: v });
}
async function changeFolder() {
  const p = platform.value;
  const choice = await choose({
    title: `${p.display_name} folder`, message: p.target?.path || 'No folder set',
    options: [
      { label: 'Browse for a folder…', value: 'browse', icon: 'mdiFolderOpen' },
      { label: 'Use automatic match', value: 'auto', icon: 'mdiAutoFix', selected: p.target?.source === 'auto' },
      { label: 'Cancel', value: null, icon: 'mdiClose' },
    ],
  });
  if (choice === 'browse') {
    const dir = await pickFolder({ title: `Folder for ${p.display_name}`, start: p.target?.exists ? p.target.path : store.config.romsRoot || undefined });
    if (dir) store.config = await call('config:setPath', { slug: p.slug, path: dir });
  } else if (choice === 'auto') store.config = await call('config:setPath', { slug: p.slug, path: null });
}
async function getBios() {
  if (!store.config.biosPath) { toast('Set a BIOS folder in Settings first', 'error'); return; }
  const ok = await confirm(`Download ${bios.value.length} BIOS file${bios.value.length > 1 ? 's' : ''}?`, `${bios.value.map((b) => `${b.file_name}  ·  ${bytes(b.file_size_bytes)}`).join('\n')}\n\n→ ${store.config.biosPath}`, 'Download');
  if (!ok) return;
  try {
    const r = await call('bios:download', { platformId: platform.value.id, slug: platform.value.slug });
    const n = r.files.filter((f) => !f.skipped).length;
    toast(`BIOS · ${n} downloaded, ${r.files.length - n} already there`, 'ok', 3400, 'mdiChip');
  } catch (e) { toast(e.message, 'error'); }
}
async function downloadAll() {
  const todo = list.value.filter((r) => !store.installed[r.id]);
  const size = todo.reduce((s, r) => s + (r.fs_size_bytes || 0), 0);
  const space = mode.value === 'platform' ? await call('fs:space', platform.value.target?.path) : null;
  if (!(await confirm(`Download ${todo.length} games?`, `${bytes(size)} total${space ? `\n${bytes(space.free)} free on that drive` : ''}`, 'Download all'))) return;
  for (const r of todo) await download(r);
}

onMounted(async () => {
  await nextTick();
  ensureFocus(gridEl.value || el.value);
  if (mode.value === 'platform' && platform.value) call('bios:list', { platformId: platform.value.id }).then((b) => (bios.value = b || [])).catch(() => {});
});
</script>

<style scoped>
.plat-view { position: absolute; inset: 0; display: grid; grid-template-rows: auto auto 1fr; padding: 8px 36px 0; animation: viewIn 0.35s var(--ease); }
.ph-head { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin: 6px 0 14px; }
.sys-switch { display: flex; align-items: center; gap: 16px; min-width: 0; }
.sys-switch h1 { font-size: 30px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hicon { width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center; background: rgba(139, 116, 232, 0.2); color: #cfc4ff; flex: none; }
.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.body { display: grid; grid-template-columns: 1fr 340px; gap: 24px; min-height: 0; }
.grid-pane { overflow-y: auto; padding: 22px 12px 60px; margin: 0 -12px; }
.more { display: grid; place-items: center; padding: 30px; }
.detail { align-self: start; margin-top: 12px; padding: 18px; max-height: calc(100% - 30px); overflow: hidden; }
.detail-in { display: flex; flex-direction: column; gap: 12px; }
.d-cover { width: 150px; aspect-ratio: 3/4; border-radius: 12px; overflow: hidden; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6); background: #1a1e2a; }
.d-cover img { width: 100%; height: 100%; object-fit: cover; }
.noart { height: 100%; display: grid; place-items: center; padding: 10px; text-align: center; color: var(--muted); font-size: 13px; }
.detail h2 { font-size: 22px; line-height: 1.15; }
.d-sum { margin: 0; color: #c3c9d4; font-size: 13.5px; line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; }
.d-hints { display: flex; gap: 16px; color: var(--muted); font-size: 12.5px; }
.fadeup-enter-active, .fadeup-leave-active { transition: opacity 0.16s, transform 0.22s var(--ease); }
.fadeup-enter-from { opacity: 0; transform: translateY(8px); }
.fadeup-leave-to { opacity: 0; }
@media (max-width: 1100px) { .body { grid-template-columns: 1fr; } .detail { display: none; } }
</style>
