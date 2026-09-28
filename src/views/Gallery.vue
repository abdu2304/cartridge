<template>
  <div class="plat-view" ref="el">
    <div v-if="mode === 'platform' && !platform" class="center">Console not found<button class="btn" data-focus @click="back()">Back</button></div>
    <template v-else>
      <header class="ph-head">
        <div class="sys-switch">
          <Btn v-if="mode !== 'all'" b="LB" />
          <PIcon v-if="mode === 'platform'" :p="platform" :size="52" />
          <div v-else-if="headArt" class="hicon art"><img :src="headArt" /></div>
          <div v-else class="hicon"><Icon :name="headIcon" :size="30" /></div>
          <div style="min-width: 0">
            <div v-if="mode !== 'platform'" class="eyebrow">{{ eyebrow }}</div>
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
          <button v-if="mode === 'all' && allCollections().length" class="btn small" data-focus @click="pickCollection"><Icon name="mdiBookmarkMultipleOutline" :size="18" />Collections</button>
          <template v-if="collection?.mine && !collection.smart">
            <button class="btn small" data-focus @click="renameCol"><Icon name="mdiPencil" :size="18" />Rename</button>
            <button v-if="!collection.favorite" class="btn small" data-focus @click="deleteCol"><Icon name="mdiDeleteOutline" :size="18" />Delete</button>
          </template>
        </div>
      </header>

      <div class="toolbar">
        <!-- compact: what to show and the order are each one button with a menu -->
        <button class="btn small" :class="{ primary: filter !== 'all' }" data-focus @click="pickShow"><Icon name="mdiEyeOutline" :size="18" />{{ filters.find((f) => f.v === filter)?.l }}</button>
        <button class="btn small" data-focus @click="pickSort"><Icon name="mdiSortVariant" :size="18" />{{ sorts.find((x) => x.v === sort)?.l }}</button>
        <button class="btn small" data-focus @click="search"><Icon name="mdiMagnify" :size="18" />{{ q ? `“${q}”` : 'Filter' }}</button>
        <button v-if="q" class="btn small" data-focus @click="q = ''"><Icon name="mdiClose" :size="18" /></button>
        <button class="btn small" :class="{ primary: nFilters }" data-focus @click="moreFilters"><Icon name="mdiFilterVariant" :size="18" />{{ nFilters ? `Filters · ${nFilters}` : 'Filters' }}</button>
        <div style="flex: 1" />
        <template v-if="selecting">
          <span class="muted small">{{ picked.size }} selected</span>
          <button class="btn small" data-focus :disabled="!picked.size" @click="bulk('download')"><Icon name="mdiDownload" :size="18" />Download</button>
          <button class="btn small" data-focus :disabled="!picked.size" @click="bulk('collection')"><Icon name="mdiBookmarkPlusOutline" :size="18" />Add to collection</button>
          <button v-if="collection?.mine && !collection.smart" class="btn small" data-focus :disabled="!picked.size" @click="bulk('uncollect')"><Icon name="mdiBookmarkRemoveOutline" :size="18" />Remove</button>
          <button class="btn small" data-focus :disabled="!picked.size" @click="bulk('steam')"><Icon name="mdiSteam" :size="18" />Add to Steam</button>
          <button class="btn small" data-focus @click="stopSelect"><Icon name="mdiCheck" :size="18" />Done</button>
        </template>
        <template v-else>
          <button v-if="list.length" class="btn small" data-focus @click="moreActions"><Icon name="mdiDotsHorizontal" :size="18" />More</button>
        </template>
      </div>

      <div class="body">
        <div class="grid-pane" data-scroll ref="gridEl">
          <div v-if="!list.length" class="empty">No games match.</div>
          <!-- collections, series and genres that span consoles: one section per console -->
          <template v-else-if="groups">
            <section v-for="g in groups" :key="g.key" class="con-sec">
              <div class="con-head"><PIcon :p="g.p" :size="30" /><b>{{ g.name }}</b><span class="count">{{ g.items.length }}</span></div>
              <div class="game-grid">
                <GameCard v-for="r in g.items" :key="r.id" :rom="r" :selected="selecting ? picked.has(r.id) : null" @open="open" @focused="focusRom" />
              </div>
            </section>
          </template>
          <div v-else class="game-grid">
            <GameCard v-for="r in shown" :key="r.id" :rom="r" :show-platform="mode !== 'platform'" :selected="selecting ? picked.has(r.id) : null" @open="open" @focused="focusRom" />
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
import { store, go, back, platformById, romsOf, allRoms, collections, allCollections, collectionById, romsOfCollection, romsOfGenre, genres, visible, score, addToCollection, askText, pickFolder, call, download, toast, choose, confirm, bytes, year, isNew, cover, setBg, backdropOf, downloadFor, visiblePlatforms, romById } from '../store.js';
import { addGames } from '../steam.js';
import { useView } from '../useView.js';
import { ensureFocus } from '../nav.js';
import Icon from '../components/Icon.vue';
import Btn from '../components/Btn.vue';
import PIcon from '../components/PIcon.vue';
import GameCard from '../components/GameCard.vue';

const props = defineProps({ platformId: Number, collectionId: String, genre: String });
const mode = computed(() => (props.platformId ? 'platform' : props.collectionId ? 'collection' : props.genre ? 'genre' : 'all'));
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
// Show and Sort menus, and More (Surprise me, Select, Get all)
async function pickShow() {
  const v = await choose({ title: 'Show', options: filters.map((f) => ({ label: f.l, value: f.v, icon: f.icon, selected: filter.value === f.v })) });
  if (v) filter.value = v;
}
async function pickSort() {
  const v = await choose({ title: 'Sort by', options: sorts.map((x) => ({ label: x.l, value: x.v, icon: x.icon, selected: sort.value === x.v })) });
  if (v) sort.value = v;
}
async function moreActions() {
  const canGetAll = missingCount.value && filter.value !== 'installed' && mode.value !== 'all';
  const v = await choose({ title: title.value, options: [
    { label: 'Surprise me', sub: 'Open a random game from this list', value: 'surprise', icon: 'mdiDiceMultipleOutline' },
    { label: 'Select games', sub: 'Download, collect or add many to Steam', value: 'select', icon: 'mdiCheckboxMultipleMarkedOutline' },
    ...(canGetAll ? [{ label: `Get all ${missingCount.value}`, sub: 'Download every game here not on this device', value: 'all', icon: 'mdiDownloadMultiple' }] : []),
  ] });
  if (v === 'surprise') surprise();
  else if (v === 'select') selecting.value = true;
  else if (v === 'all') downloadAll();
}
const filters = [{ v: 'all', l: 'All', icon: 'mdiViewGridOutline' }, { v: 'installed', l: 'On device', icon: 'mdiCheckCircleOutline' }, { v: 'missing', l: 'Not downloaded', icon: 'mdiCloudOutline' }, { v: 'new', l: 'New', icon: 'mdiNewBox' }];
const sorts = [{ v: 'name', l: 'A–Z', icon: 'mdiSortAlphabeticalAscending' }, { v: 'new', l: 'Recently added', icon: 'mdiClockOutline' }, { v: 'year', l: 'Release', icon: 'mdiCalendarOutline' }, { v: 'rating', l: 'Rating', icon: 'mdiStarOutline' }, { v: 'size', l: 'Size', icon: 'mdiHarddisk' }];

const platform = computed(() => platformById(props.platformId));
const collection = computed(() => collectionById(props.collectionId));
const title = computed(() => (mode.value === 'platform' ? platform.value?.display_name : mode.value === 'collection' ? collection.value?.name || 'Collection' : mode.value === 'genre' ? props.genre : 'All games'));
const eyebrow = computed(() => {
  if (mode.value === 'all') return 'Library';
  if (mode.value === 'genre') return 'Genre';
  const c = collection.value;
  return c?.series ? 'Series' : c?.auto ? 'Made by Cartridge' : c?.smart ? 'Smart collection' : 'Collection';
});
// a series shows its first game's cover in the header instead of a plain icon
const headArt = computed(() => { if (!collection.value?.series) return ''; const r = source.value.find((x) => x.path_cover_small || x.url_cover); return r ? cover(r) : ''; });
const headIcon = computed(() => (mode.value === 'all' ? 'mdiViewGridOutline' : mode.value === 'genre' ? 'mdiTagOutline' : collection.value?.favorite ? 'mdiStar' : collection.value?.icon || 'mdiBookmarkMultipleOutline'));
const source = computed(() => {
  if (mode.value === 'platform') return romsOf(props.platformId);
  if (mode.value === 'collection') return romsOfCollection(props.collectionId);
  if (mode.value === 'genre') return romsOfGenre(props.genre);
  const all = allRoms();
  return consoleFilter.value ? all.filter((r) => r.platform_id === consoleFilter.value) : all;
});
// ---------- extra filters (Filters button): genre, decade, players, rating, play status, hidden
const ext = ref({ genre: '', decade: 0, couch: false, rated: false, status: '', hidden: false });
const nFilters = computed(() => ['genre', 'decade', 'couch', 'rated', 'status', 'hidden'].filter((k) => ext.value[k]).length);
const decadeOf = (r) => { const y = Number(year(r.year)); return y ? Math.floor(y / 10) * 10 : 0; };
const STATUS = [
  { v: 'backlog', l: 'Backlog', test: (u) => u?.backlog }, { v: 'playing', l: 'Playing', test: (u) => u?.playing || u?.status === 'incomplete' },
  { v: 'finished', l: 'Finished', test: (u) => u?.status === 'finished' }, { v: 'completed_100', l: 'Completed 100%', test: (u) => u?.status === 'completed_100' },
  { v: 'none', l: 'No status yet', test: (u) => !u || (!u.backlog && !u.playing && !u.status) },
];
function extFilter(items) {
  const e = ext.value;
  if (!e.hidden) items = items.filter(visible);
  if (e.genre) items = items.filter((r) => (r.genres || []).includes(e.genre));
  if (e.decade) items = items.filter((r) => decadeOf(r) === e.decade);
  if (e.couch) items = items.filter((r) => (r.modes || []).some((m) => /split screen|co-operative|^multiplayer$/i.test(m)));
  if (e.rated) items = items.filter((r) => score(r) >= 80);
  if (e.status) { const t = STATUS.find((x) => x.v === e.status).test; items = items.filter((r) => t(r.user)); }
  return items;
}
async function moreFilters() {
  const e = ext.value;
  const v = await choose({
    title: 'Filters',
    options: [
      { label: 'Genre', sub: e.genre || 'Any', value: 'genre', icon: 'mdiTagOutline' },
      { label: 'Decade', sub: e.decade ? `${e.decade}s` : 'Any', value: 'decade', icon: 'mdiCalendarRange' },
      { label: 'Couch multiplayer only', sub: e.couch ? 'On' : 'Off', value: 'couch', icon: 'mdiAccountGroupOutline', selected: e.couch },
      { label: 'Rated 80 or higher', sub: e.rated ? 'On' : 'Off', value: 'rated', icon: 'mdiStarOutline', selected: e.rated },
      { label: 'Play status', sub: STATUS.find((x) => x.v === e.status)?.l || 'Any', value: 'status', icon: 'mdiProgressCheck' },
      { label: 'Show hidden games', sub: e.hidden ? 'On' : 'Off', value: 'hidden', icon: 'mdiEyeOffOutline', selected: e.hidden },
      ...(nFilters.value ? [{ label: 'Clear all filters', value: 'clear', icon: 'mdiClose' }] : []),
    ],
  });
  if (v == null) return;
  if (v === 'clear') { ext.value = { genre: '', decade: 0, couch: false, rated: false, status: '', hidden: false }; return; }
  if (['couch', 'rated', 'hidden'].includes(v)) { ext.value = { ...e, [v]: !e[v] }; return moreFilters(); }
  let pick;
  if (v === 'genre') pick = await choose({ title: 'Genre', options: [{ label: 'Any genre', value: '', selected: !e.genre }, ...genres().map((g) => ({ label: g.name, sub: `${g.rom_ids.length}`, value: g.name, selected: e.genre === g.name }))] });
  if (v === 'decade') { const ds = [...new Set(source.value.map(decadeOf).filter(Boolean))].sort(); pick = await choose({ title: 'Decade', options: [{ label: 'Any decade', value: 0, selected: !e.decade }, ...ds.map((d) => ({ label: `${d}s`, value: d, selected: e.decade === d }))] }); }
  if (v === 'status') pick = await choose({ title: 'Play status', options: [{ label: 'Any', value: '', selected: !e.status }, ...STATUS.map((x) => ({ label: x.l, value: x.v, selected: e.status === x.v }))] });
  if (pick !== null && pick !== undefined) ext.value = { ...e, [v]: pick };
  return moreFilters();
}
const installedCount = computed(() => source.value.filter((r) => store.installed[r.id]).length);
const list = computed(() => {
  let items = extFilter(source.value);
  if (filter.value === 'installed') items = items.filter((r) => store.installed[r.id]);
  if (filter.value === 'missing') items = items.filter((r) => !store.installed[r.id]);
  if (filter.value === 'new') items = items.filter(isNew);
  if (q.value) { const s = q.value.toLowerCase(); items = items.filter((r) => r.name.toLowerCase().includes(s) || (r.fs_name || '').toLowerCase().includes(s)); }
  items = [...items];
  if (sort.value === 'name') items.sort((a, b) => a.name.localeCompare(b.name));
  if (sort.value === 'new') items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  if (sort.value === 'year') items.sort((a, b) => (a.year || 9e15) - (b.year || 9e15));
  if (sort.value === 'size') items.sort((a, b) => (b.fs_size_bytes || 0) - (a.fs_size_bytes || 0));
  if (sort.value === 'rating') items.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
  return items;
});
// Render in pages so a 5,000-game library stays smooth on the Deck
const shown = computed(() => list.value.slice(0, limit.value));
// sections by console, biggest first, keeping the chosen sort inside each (only when there are 2+ consoles)
const groups = computed(() => {
  if (!['collection', 'genre'].includes(mode.value)) return null;
  const by = new Map();
  for (const r of shown.value) {
    const k = r.platform_id;
    if (!by.has(k)) by.set(k, { key: k, name: r.platform_display_name, p: { slug: r.platform_slug, fs_slug: r.platform_fs_slug }, items: [] });
    by.get(k).items.push(r);
  }
  return by.size > 1 ? [...by.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name)) : null;
});
watch([filter, sort, q, consoleFilter, ext], () => { limit.value = PAGE; gridEl.value?.scrollTo({ top: 0 }); });
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
  } else if (mode.value === 'genre') {
    const gs = genres();
    const i = gs.findIndex((g) => g.name === props.genre);
    const n = gs[(i + dir + gs.length) % gs.length];
    if (n) store.route = { ...store.route, params: { genre: n.name } };
  } else {
    const cs = allCollections();
    const i = cs.findIndex((c) => c.id === props.collectionId);
    const n = cs[(i + dir + cs.length) % cs.length];
    if (n) store.route = { ...store.route, params: { collectionId: n.id } };
  }
}

useView(
  {
    lb: () => (mode.value === 'all' ? false : neighbor(-1)),
    rb: () => (mode.value === 'all' ? false : neighbor(1)),
    y: () => search(),
    x: () => {
      const key = document.activeElement?.dataset?.key || '';
      if (!key.startsWith('rom-')) return;
      const r = romById(key.slice(4));
      if (r && !store.installed[r.id]) download(r); else if (r) toast('Already on this device', 'info', 1800);
    },
    select: () => { filter.value = filters[(filters.findIndex((f) => f.v === filter.value) + 1) % filters.length].v; },
    back: () => { if (selecting.value) { stopSelect(); return; } return false; },
  },
  () => [{ b: 'A', label: 'Details' }, { b: 'X', label: 'Download' }, { b: 'Y', label: 'Filter' },
    ...(mode.value === 'all' ? [] : [{ b: 'LB', label: mode.value === 'platform' ? '/ RB  Console' : mode.value === 'genre' ? '/ RB  Genre' : '/ RB  Collection' }]),
    { b: 'LT+RT', label: 'Tabs' }, ...(mode.value === 'all' ? [] : [{ b: 'B', label: 'Back' }])],
);

function open(r) {
  if (selecting.value) { const s = new Set(picked.value); s.has(r.id) ? s.delete(r.id) : s.add(r.id); picked.value = s; return; }
  go('game', { romId: r.id });
}
// ---------- select many (Select button): A picks games, then act on all of them at once
const selecting = ref(false);
const picked = ref(new Set());
function stopSelect() { selecting.value = false; picked.value = new Set(); }
async function bulk(what) {
  const roms = [...picked.value].map((id) => romById(id)).filter(Boolean);
  if (what === 'download') {
    const todo = roms.filter((r) => !store.installed[r.id]);
    if (!todo.length) { toast('Those are all on this device already', 'info', 2200); return; }
    const size = todo.reduce((s, r) => s + (r.fs_size_bytes || 0), 0);
    if (!(await confirm(`Download ${todo.length} game${todo.length === 1 ? '' : 's'}?`, `${bytes(size)} total`, 'Download'))) return;
    for (const r of todo) await download(r, { checkSpace: todo.length === 1 });
  }
  if (what === 'collection' && !(await addToCollection(roms.map((r) => r.id)))) return;
  if (what === 'uncollect') {
    try { await call('col:remove', { rid: collection.value.rid, romIds: roms.map((r) => r.id) }); toast(`Removed ${roms.length} from ${collection.value.name}`, 'ok', 2400); } catch (e) { toast(e.message, 'error', 5000); return; }
  }
  if (what === 'steam' && !(await addGames(roms))) return;
  stopSelect();
}
// ---------- Surprise me: a random game from what's shown
function surprise() { const l = list.value; if (l.length) go('game', { romId: l[Math.floor(Math.random() * l.length)].id }); }
// ---------- your own collection: rename or delete
async function renameCol() {
  const n = await askText({ title: 'Rename collection', value: collection.value.name });
  if (!n || !n.trim()) return;
  try { await call('col:rename', { rid: collection.value.rid, name: n.trim() }); } catch (e) { toast(e.message, 'error', 5000); }
}
async function deleteCol() {
  const c = collection.value;
  if (!(await confirm(`Delete ${c.name}?`, 'The collection is removed from RomM. The games themselves stay.', 'Delete', true))) return;
  try { await call('col:delete', { rid: c.rid }); toast(`${c.name} deleted`, 'ok', 2200); back(); } catch (e) { toast(e.message, 'error', 5000); }
}
async function search() {
  const v = await askText({ title: `Filter ${title.value}`, value: q.value, placeholder: 'Game name' });
  if (v !== null && v !== undefined) q.value = v.trim();
}
async function pickConsole() {
  const v = await choose({ title: 'Show games from', options: [{ label: 'All consoles', value: 0, icon: 'mdiViewGridOutline', selected: !consoleFilter.value }, ...visiblePlatforms().map((p) => ({ label: p.display_name, sub: `${p.rom_count}`, value: p.id, selected: consoleFilter.value === p.id }))] });
  if (v !== null && v !== undefined) consoleFilter.value = v || null;
}
async function pickCollection() {
  const v = await choose({ title: 'Collections', options: allCollections().map((c) => ({ label: c.name, sub: `${c.rom_ids.length}`, value: c.id, icon: c.favorite ? 'mdiStar' : c.smart ? 'mdiAutoFix' : c.icon || 'mdiBookmarkOutline' })) });
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
  for (const r of todo) await download(r, { checkSpace: false }); // the confirm above already showed the space
}

onMounted(async () => {
  await nextTick();
  ensureFocus(gridEl.value || el.value);
  if (mode.value === 'platform' && platform.value) call('bios:list', { platformId: platform.value.id }).then((b) => (bios.value = b || [])).catch(() => {});
});
</script>

<style scoped>
.plat-view { position: absolute; inset: 0; display: grid; grid-template-rows: auto auto 1fr; padding: 8px 36px 0; animation: viewIn 0.16s ease-out; }
.ph-head { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin: 6px 0 14px; }
.sys-switch { display: flex; align-items: center; gap: 16px; min-width: 0; }
.sys-switch h1 { font-size: 30px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hicon { width: 52px; height: 52px; border-radius: 9px; display: grid; place-items: center; background: rgba(var(--primary-rgb), 0.2); color: var(--primary-t); flex: none; }
.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.small { font-size: 12.5px; }
.body { display: grid; grid-template-columns: 1fr 340px; gap: 24px; min-height: 0; }
.grid-pane { overflow-y: auto; padding: 22px 12px 60px; margin: 0 -12px; }
.more { display: grid; place-items: center; padding: 30px; }
.detail { align-self: start; margin-top: 12px; padding: 18px; max-height: calc(100% - 30px); overflow: hidden; }
.detail-in { display: flex; flex-direction: column; gap: 12px; }
.d-cover { width: 150px; aspect-ratio: 2/3; border-radius: 8px; overflow: hidden; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6); background: #1a1e2a; }
.d-cover img { width: 100%; height: 100%; object-fit: cover; }
.noart { height: 100%; display: grid; place-items: center; padding: 10px; text-align: center; color: var(--muted); font-size: 13px; }
.detail h2 { font-size: 22px; line-height: 1.15; }
.d-sum { margin: 0; color: #c3c9d4; font-size: 13.5px; line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; }
.d-hints { display: flex; gap: 16px; color: var(--muted); font-size: 12.5px; }
.fadeup-enter-active, .fadeup-leave-active { transition: opacity 0.16s, transform 0.22s var(--ease); }
.fadeup-enter-from { opacity: 0; transform: translateY(8px); }
.fadeup-leave-to { opacity: 0; }
@media (max-width: 1100px) { .body { grid-template-columns: 1fr; } .detail { display: none; } }
.con-sec { margin-bottom: 26px; }
.con-head { display: flex; align-items: center; gap: 12px; margin: 4px 0 4px; font-family: var(--display); font-size: 18px; }
.con-head b { font-weight: 700; }
.con-head .count { color: var(--muted); font-size: 13px; font-family: var(--font); }
.hicon.art { overflow: hidden; padding: 0; }
.hicon.art img { width: 100%; height: 100%; object-fit: cover; }
/* room above each console's games so a highlighted (raised, zoomed) card never covers its header */
.con-sec .game-grid { padding-top: 14px; }
</style>
