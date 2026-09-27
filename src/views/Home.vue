<template>
  <div class="home" ref="el">
    <div v-if="!store.lib" class="center first-sync">
      <Logo :size="72" />
      <h2>{{ syncing ? 'Syncing your library' : 'No library yet' }}</h2>
      <div class="muted">{{ syncing ? store.sync.label : store.sync.error || 'Pull your games from RomM to get started.' }}</div>
      <div v-if="syncing && store.sync.total" class="bar" style="width: 320px"><i :style="{ width: (store.sync.done / store.sync.total) * 100 + '%' }" /></div>
      <button v-if="!syncing" class="btn primary xl" data-focus @click="resync()"><Icon name="mdiSync" />Sync now</button>
    </div>
    <template v-else>
      <section class="hero">
        <Transition name="hero" mode="out-in">
          <div v-if="heroRom" :key="'r' + heroRom.id" class="hero-in">
            <div class="eyebrow row" style="gap: 8px"><PIcon :p="{ slug: heroRom.platform_slug, fs_slug: heroRom.platform_fs_slug }" :size="18" />{{ heroRom.platform_display_name }}</div>
            <h1 class="hero-title">{{ heroRom.name }}</h1>
            <div class="meta">
              <span v-if="isNew(heroRom)" class="chip new">NEW</span>
              <span v-if="store.installed[heroRom.id]" class="chip green"><Icon name="mdiCheckCircle" :size="14" />On this device</span>
              <span v-else-if="heroDl" class="chip primary"><Icon name="mdiDownload" :size="14" />{{ heroDl }}</span>
              <span v-if="year(heroRom.year)">{{ year(heroRom.year) }}</span>
              <span v-if="heroRom.genres.length">{{ heroRom.genres.join(' · ') }}</span>
              <span v-if="heroRom.developer">{{ heroRom.developer }}</span>
              <span>{{ bytes(heroRom.fs_size_bytes) }}</span>
              <span v-if="heroRom.rating" class="row" style="gap: 4px; color: var(--gold)"><Icon name="mdiStar" :size="15" />{{ rating(heroRom.rating) }}</span>
            </div>
            <p class="summary">{{ heroRom.summary }}</p>
          </div>
          <div v-else-if="heroSys" :key="'s' + heroSys.id" class="hero-in">
            <div class="eyebrow">System</div>
            <h1 class="hero-title">{{ heroSys.display_name }}</h1>
            <div class="meta">
              <span>{{ heroSys.rom_count }} games on your server</span>
              <span class="chip green" v-if="sysOnDevice(heroSys)">{{ sysOnDevice(heroSys) }} on this device</span>
              <span class="mono" style="max-width: 520px">{{ heroSys.target?.path || 'No folder set' }}</span>
            </div>
          </div>
          <div v-else-if="heroCol" :key="'c' + heroCol.id" class="hero-in">
            <div class="eyebrow">{{ heroCol.smart ? 'Smart collection' : 'Collection' }}</div>
            <h1 class="hero-title">{{ heroCol.name }}</h1>
            <div class="meta"><span>{{ heroCol.rom_ids.length }} games</span><span v-if="heroCol.description">{{ heroCol.description }}</span></div>
          </div>
          <div v-else key="welcome" class="hero-in">
            <div class="eyebrow">Welcome back</div>
            <h1 class="hero-title"><span class="grad-text">{{ total }}</span> games ready to pull</h1>
            <div class="meta"><span>{{ visiblePlatforms().length }} consoles</span><span>{{ installedCount }} on this device</span><span>{{ bytes(totalSize) }} on your server</span><span>Synced {{ ago(store.lib.syncedAt) }}</span></div>
          </div>
        </Transition>
      </section>

      <section class="shelves" ref="shelvesEl" @focusin="onShelfFocus">
        <div v-for="s in shelves" :key="s.id" class="shelf-wrap" :data-shelf="s.id">
          <div class="shelf-title"><Icon :name="s.icon" :size="20" />{{ s.title }}<span class="count">{{ s.count }}</span></div>
          <div class="shelf" data-hscroll>
            <template v-if="s.type === 'sys'">
              <SysTile v-for="p in s.items" :key="p.id" :p="p" @open="openSys" @focused="focusSys" />
            </template>
            <template v-else-if="s.type === 'col'">
              <CollTile v-for="c in s.items" :key="c.id" :c="c" @open="(c) => go('collection', { collectionId: c.id })" @focused="focusCol" />
            </template>
            <template v-else>
              <GameCard v-for="r in s.items" :key="r.id" :rom="r" :show-platform="true" @open="openGame" @focused="focusRom" />
            </template>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, nextTick, onMounted, watch } from 'vue';
import { collections, store, go, allRoms, visiblePlatforms, romsOf, isNew, setBg, backdropOf, bytes, year, ago, rating, resync, downloadFor, download, romById, toast } from '../store.js';
import { useView } from '../useView.js';
import { ensureFocus } from '../nav.js';
import Icon from '../components/Icon.vue';
import Logo from '../components/Logo.vue';
import PIcon from '../components/PIcon.vue';
import GameCard from '../components/GameCard.vue';
import SysTile from '../components/SysTile.vue';
import CollTile from '../components/CollTile.vue';

const el = ref(null);
const shelvesEl = ref(null);
const heroRom = ref(null);
const heroSys = ref(null);
const heroCol = ref(null);
const syncing = computed(() => ['running', 'scanning'].includes(store.sync.state));
const total = computed(() => allRoms().length);
const totalSize = computed(() => allRoms().reduce((s, r) => s + (r.fs_size_bytes || 0), 0));
const installedCount = computed(() => Object.keys(store.installed).length);
const heroDl = computed(() => {
  const d = heroRom.value && downloadFor(heroRom.value.id);
  if (!d || !['queued', 'downloading'].includes(d.status)) return '';
  return d.status === 'queued' ? 'Queued' : `Downloading ${d.total ? Math.floor((d.received / d.total) * 100) : 0}%`;
});
const sysOnDevice = (p) => romsOf(p.id).filter((r) => store.installed[r.id]).length;

let discoverSeed = null;
const shelves = computed(() => {
  const roms = allRoms();
  const out = [];
  // Mirrors RomM's home: recently added, random picks, then your stuff
  const recent = [...roms].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 30);
  out.push({ id: 'recent', title: 'Recently added', icon: 'mdiClockOutline', count: '', items: recent });
  if (!discoverSeed || discoverSeed.v !== store.libVersion) {
    const pool = roms.filter((r) => r.path_cover_small || r.url_cover);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    discoverSeed = { v: store.libVersion, items: pool.slice(0, 24) };
  }
  if (discoverSeed.items.length) out.push({ id: 'picks', title: 'Picks for you', icon: 'mdiDiceMultipleOutline', count: '', items: discoverSeed.items });
  const onDevice = roms.filter((r) => store.installed[r.id]).sort((a, b) => a.name.localeCompare(b.name));
  if (onDevice.length) out.push({ id: 'device', title: 'On this device', icon: 'mdiCheckCircleOutline', count: onDevice.length, items: onDevice.slice(0, 40) });
  const fresh = roms.filter(isNew).sort((a, b) => (store.lib.firstSeen[b.id] || 0) - (store.lib.firstSeen[a.id] || 0));
  if (fresh.length) out.push({ id: 'new', title: 'New since last sync', icon: 'mdiNewBox', count: fresh.length, items: fresh.slice(0, 40) });
  if (collections().length) out.push({ id: 'col', type: 'col', title: 'Collections', icon: 'mdiBookmarkMultipleOutline', count: collections().length, items: collections() });
  out.push({ id: 'sys', type: 'sys', title: 'Consoles', icon: 'mdiGamepadSquareOutline', count: visiblePlatforms().length, items: visiblePlatforms() });
  return out;
});

function focusRom(r) { heroRom.value = r; heroSys.value = null; heroCol.value = null; setBg(backdropOf(r)); }
function focusSys(p) {
  heroSys.value = p; heroRom.value = null; heroCol.value = null;
  const withArt = romsOf(p.id).find((r) => r.shot) || romsOf(p.id).find((r) => r.path_cover_large);
  setBg(backdropOf(withArt));
}
function focusCol(c) {
  heroSys.value = null; heroRom.value = null; heroCol.value = c;
  const r = c.rom_ids.map((id) => romById(id)).find((x) => x && (x.shot || x.path_cover_large));
  setBg(backdropOf(r));
}
function openGame(r) { go('game', { romId: r.id }); }
function openSys(p) { go('platform', { platformId: p.id }); }

function onShelfFocus(e) {
  const wrap = e.target.closest('.shelf-wrap');
  if (!wrap || !shelvesEl.value) return;
  shelvesEl.value.scrollTo({ top: wrap.offsetTop - 4, behavior: 'smooth' });
}

useView(
  {
    x: () => {
      const key = document.activeElement?.dataset?.key || '';
      if (!key.startsWith('rom-')) return;
      const r = romById(key.slice(4));
      if (r && !store.installed[r.id]) download(r); else if (r) toast('Already on this device', 'info', 1800);
    },
  },
  [{ b: 'A', label: 'Open' }, { b: 'X', label: 'Download' }, { b: 'Y', label: 'Search' }, { b: 'LB', label: '/ RB  Tabs' }],
);

watch(() => store.libVersion, async () => { await nextTick(); ensureFocus(el.value); });
onMounted(async () => { await nextTick(); ensureFocus(el.value); });
</script>

<style scoped>
.home { position: absolute; inset: 0; display: grid; grid-template-rows: minmax(250px, 38%) 1fr; animation: viewIn 0.35s var(--ease); }
.first-sync { grid-row: 1 / -1; align-content: center; }
.first-sync h2 { font-size: 30px; color: var(--text); }
.hero { position: relative; padding: 18px 44px 10px; display: flex; align-items: flex-end; }
.hero-in { max-width: 900px; display: flex; flex-direction: column; gap: 12px; }
.hero-title { font-size: clamp(34px, 4.4vw, 58px); font-weight: 700; line-height: 1.02; letter-spacing: -0.02em; text-shadow: 0 6px 30px rgba(0, 0, 0, 0.5); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.meta { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; color: #cfd4de; font-size: 14px; }
.meta > span:not(.chip):not(:first-child)::before { content: ''; }
.summary { margin: 0; max-width: 720px; color: #c3c9d4; line-height: 1.55; font-size: 14.5px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.shelves { position: relative; overflow-y: auto; padding: 0 44px 60vh; scroll-behavior: smooth; mask-image: linear-gradient(180deg, #000 calc(100% - 40px), transparent); }
.shelf-wrap { margin-bottom: 14px; }
.shelf { padding: 22px 44px 18px; margin: -12px -44px 0; scroll-padding: 0 44px; }
.hero-enter-active, .hero-leave-active { transition: opacity 0.22s, transform 0.3s var(--ease); }
.hero-enter-from { opacity: 0; transform: translateY(10px); }
.hero-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
