<template>
  <div class="home" ref="el">
    <div v-if="!store.lib" class="center first-sync">
      <Logo :size="72" />
      <h2>{{ syncing ? 'Syncing your library' : 'No library yet' }}</h2>
      <div class="muted">{{ syncing ? store.sync.label : store.sync.error || 'Pull your games from RomM to get started.' }}</div>
      <div v-if="syncing && store.sync.total" class="bar live" style="width: 320px"><i :style="{ width: (store.sync.done / store.sync.total) * 100 + '%' }" /></div>
      <button v-if="!syncing" class="btn primary xl" data-focus @click="resync()"><Icon name="mdiSync" />Sync now</button>
    </div>
    <template v-else>
      <section class="hero" ref="heroEl">
        <MediaBar v-if="store.config.ui.mediaBar !== false" :src="heroArt" />
        <Transition name="hero">
          <div v-if="heroRom" :key="'r' + heroRom.id" class="hero-in">
            <div class="eyebrow row" style="gap: 8px"><PIcon :p="{ slug: heroRom.platform_slug, fs_slug: heroRom.platform_fs_slug }" :size="18" />{{ heroRom.platform_display_name }}</div>
            <GameLogo :logo="store.config.ui.logos !== false ? logoOf(heroRom) : null" :name="heroRom.name" cls="hero-title" :area="32000" :max-w="420" :max-h="logoMaxH" />
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
            <div class="eyebrow">{{ heroCol.genre ? 'Genre' : heroCol.series ? 'Series' : heroCol.auto ? 'Made by Cartridge' : heroCol.smart ? 'Smart collection' : 'Collection' }}</div>
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
            <template v-else-if="s.type === 'ra'">
              <template v-for="(a, i) in s.items" :key="a.key">
              <!-- a timeline: the day where it changes, then each unlock with its time -->
              <div v-if="a.t && (i === 0 || dayOf(s.items[i - 1].t) !== dayOf(a.t))" class="ach-day"><span>{{ dayLabel(a.t) }}</span></div>
              <button class="ra-home glass" data-focus @click="a.open()" @focus="focusRa(a)">
                <span v-if="a.t" class="ach-when">{{ whenLabel(a.t) }}</span>
                <span class="ach-img"><img v-if="a.badge" :src="a.badge" loading="lazy" /><Grade v-else :g="a.grade" :size="40" /><span class="ach-src"><img v-if="a.kind === 'ra'" :src="raLogo" class="ach-ra" /><Grade v-else :g="a.grade || null" :size="16" /></span></span>
                <div class="ra-home-t">{{ a.title }}</div>
                <div class="ra-home-g">{{ a.game }}</div>
                <div class="ra-home-p" :class="'k-' + a.kind"><template v-if="a.kind === 'ra'">{{ a.pts }}</template><template v-else-if="a.grade">{{ GRADE[a.grade] }}</template><template v-else>{{ a.pts }}</template></div>
              </button>
              </template>
            </template>
            <template v-else-if="s.type === 'genre'">
              <GenreTile v-for="c in s.items" :key="c.id" :g="c" @open="openCol" @focused="focusCol" />
            </template>
            <template v-else-if="s.type === 'col'">
              <CollTile v-for="c in s.items" :key="c.id" :c="c" wide @open="openCol" @focused="focusCol" />
            </template>
            <template v-else>
              <GameCard v-for="r in s.items" :key="r.id" :rom="r" :show-platform="true" :extra="s.sub ? s.sub(r) : ''" @open="openGame" @focused="focusRom" />
            </template>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, nextTick, onMounted, onBeforeUnmount, watch } from 'vue';
import { img, cover, collections, autoLists, seriesLists, genres, visible, store, go, allRoms, visiblePlatforms, romsOf, isNew, setBg, backdropOf, bytes, year, ago, rating, resync, downloadFor, download, romById, toast, logoOf, call, GRADE, loadPlay, playtimeText } from '../store.js';
import { useView } from '../useView.js';
import { ensureFocus, glideTo } from '../nav.js';
import Icon from '../components/Icon.vue';
import Logo from '../components/Logo.vue';
import PIcon from '../components/PIcon.vue';
import GameCard from '../components/GameCard.vue';
import SysTile from '../components/SysTile.vue';
import CollTile from '../components/CollTile.vue';
import GenreTile from '../components/GenreTile.vue';
import GameLogo from '../components/GameLogo.vue';
import Grade from '../components/Grade.vue';
import raLogo from '../assets/ra-logo.png';
import MediaBar from '../components/MediaBar.vue';

const el = ref(null);
const shelvesEl = ref(null);
// The hero sits in a fixed-height row. A tall logo plus a wrapped info line could push the top of
// it (the console name) up under the top bar, so the logo shrinks until everything fits.
const heroEl = ref(null);
const logoMaxH = ref(140);
function fitHero() {
  const h = heroEl.value, inner = h?.querySelector('.hero-in:not(.hero-leave-active)');
  if (!h || !inner) return;
  const cs = getComputedStyle(h);
  const avail = h.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const logo = inner.querySelector('.game-logo, .hero-title');
  const logoH = logo ? logo.getBoundingClientRect().height / (parseFloat(getComputedStyle(document.body).zoom) || 1) : 0;
  const over = inner.scrollHeight - avail;
  if (over > 0) logoMaxH.value = Math.max(48, Math.floor(Math.min(logoMaxH.value, logoH) - over - 2));
  else if (over < -12 && logoMaxH.value < 140) logoMaxH.value = Math.min(140, logoMaxH.value + Math.floor(-over - 8));
}
let ro;
onMounted(() => { if (window.ResizeObserver) { ro = new ResizeObserver(() => requestAnimationFrame(fitHero)); if (heroEl.value) ro.observe(heroEl.value); } });
onBeforeUnmount(() => ro?.disconnect());
const heroRom = ref(null);
const heroSys = ref(null);
const heroCol = ref(null);
// Media bar art: a screenshot of the highlighted game (or its cover), or art from the highlighted console/collection
const artOf = (r) => (r ? (store.art?.[r.id]?.hero ? img(store.art[r.id].hero) : r.shot ? img(r.shot) : cover(r, true)) : '');
const heroArt = computed(() => {
  if (heroRom.value) return artOf(heroRom.value);
  if (heroSys.value) return artOf(romsOf(heroSys.value.id).find((r) => r.shot) || romsOf(heroSys.value.id)[0]);
  if (heroCol.value) return artOf(heroCol.value.rom_ids.map((id) => romById(id)).find((r) => r && r.shot));
  return '';
});
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
// Newest achievements as a Home row: RetroAchievements and emulator trophies, one timeline
const raRecent = ref([]);
const raDate = (d) => { const t = new Date(String(d).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(d) ? '' : 'Z')).getTime(); return isNaN(t) ? 0 : t; };
async function loadAch() {
  const ui = store.config.ui;
  const mode = ui.homeAch || (ui.raOnHome === false ? 'trophies' : 'all');
  if (mode === 'off') { raRecent.value = []; return; }
  const out = [];
  const jobs = [];
  if (mode !== 'trophies' && store.config.ra?.user) jobs.push(call('ra:overview').then((o) => {
    for (const a of o.recent || []) out.push({ kind: 'ra', key: 'ra' + a.id + a.date, t: raDate(a.date), badge: img(a.badge), title: a.title, game: a.game, pts: `${a.points} pts${a.hardcore ? ' · HC' : ''}`, romId: a.romId, open: () => go('ra-game', { gameId: a.gameId }) });
  }).catch(() => {}));
  if (mode !== 'ra') jobs.push(call('trophies:overview').then((o) => {
    const romOf = new Map((o.games || []).map((g) => [g.key, g.romId]));
    for (const t of o.recent || []) out.push({ kind: 'tro', key: 'tr' + t.key + t.id, t: t.time || 0, badge: t.icon, grade: t.grade, title: t.name, game: t.game, pts: t.points ? `${t.points} G` : '', romId: romOf.get(t.key), open: () => go('trophy-game', { tkey: t.key }) });
  }).catch(() => {}));
  await Promise.all(jobs);
  raRecent.value = out.sort((a, b) => b.t - a.t).slice(0, 24);
}
loadAch();
watch(() => store.trophyVer, loadAch);
// When each was unlocked: "Today", "Yesterday", a weekday this week, else the date; on the tile
// "12 min ago" today and the time on other days
const dayOf = (t) => new Date(t).toDateString();
function dayLabel(t) {
  const d = new Date(t), now = new Date(), day = 864e5;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (t >= start) return 'Today';
  if (t >= start - day) return 'Yesterday';
  if (t >= start - 6 * day) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
function whenLabel(t) {
  const m = Math.round((Date.now() - t) / 6e4);
  if (dayLabel(t) === 'Today') return m < 1 ? 'Just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
  return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function focusRa(a) {
  heroRom.value = a.romId ? romById(a.romId) : null; heroSys.value = null; heroCol.value = null;
  if (heroRom.value) setBg(backdropOf(heroRom.value));
}
// Last played times from Steam's shortcuts (games added to Steam by Cartridge or matched to it)
const played = ref({});
const lastPlay = (r) => Math.max(played.value[r.id] || 0, store.play[r.id]?.last || 0, r.user?.played || 0); // Steam, RetroArch or RomM, whichever is newer
call('steam:played').then((m) => { played.value = m || {}; }).catch(() => {});
loadPlay();
const minsOf = (r) => store.play[r.id]?.min || 0;
const DONE = new Set(['finished', 'completed_100', 'retired', 'never_playing']);
const shelves = computed(() => {
  const roms = allRoms().filter(visible);
  const out = [];
  // Mirrors RomM's home: recently added, random picks, then your stuff
  const playing = roms.filter((r) => r.user?.playing || r.user?.status === 'incomplete').sort((a, b) => lastPlay(b) - lastPlay(a));
  if (playing.length) out.push({ id: 'playing', title: 'Continue playing', icon: 'mdiPlayCircleOutline', count: playing.length, items: playing.slice(0, 30) });
  // started (played a while, or marked in RomM) but not finished, and not already above
  const inPlaying = new Set(playing.map((r) => r.id));
  const started = roms.filter((r) => !inPlaying.has(r.id) && !DONE.has(r.user?.status) && (minsOf(r) >= 30 || r.user?.status === 'incomplete')).sort((a, b) => lastPlay(b) - lastPlay(a));
  if (started.length) out.push({ id: 'started', title: 'Finish what you started', icon: 'mdiFlagCheckered', count: started.length, items: started.slice(0, 30) });
  const lastPlayed = roms.filter(lastPlay).sort((a, b) => lastPlay(b) - lastPlay(a));
  // which device it was last played on (this one or another one in RomM)
  if (lastPlayed.length) out.push({ id: 'played', title: 'Recently played', icon: 'mdiHistory', count: '', items: lastPlayed.slice(0, 30), sub: (r) => store.play[r.id]?.device || '' });
  const most = roms.filter(minsOf).sort((a, b) => minsOf(b) - minsOf(a));
  if (most.length) out.push({ id: 'most', title: 'Most played', icon: 'mdiChartBar', count: '', items: most.slice(0, 30), sub: (r) => playtimeText(minsOf(r)) });
  const recent = [...roms].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 30);
  out.push({ id: 'recent', title: 'Recently added', icon: 'mdiClockOutline', count: '', items: recent });
  if (!discoverSeed || discoverSeed.v !== store.libVersion) {
    const pool = roms.filter((r) => r.path_cover_small || r.url_cover);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    discoverSeed = { v: store.libVersion, items: pool.slice(0, 24) };
  }
  if (discoverSeed.items.length) out.push({ id: 'picks', title: 'Picks for you', icon: 'mdiDiceMultipleOutline', count: '', items: discoverSeed.items });
  // smart shelves, each only when it has enough games to be worth a row
  const short = roms.filter((r) => r.hours > 0 && r.hours <= 5 && !DONE.has(r.user?.status)).sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.hours - b.hours);
  if (short.length >= 4) out.push({ id: 'short', title: 'Short games', icon: 'mdiTimerSandComplete', count: short.length, items: short.slice(0, 30), sub: (r) => `${String(Math.round(r.hours * 2) / 2).replace(/\.5$/, '½')} h to beat` });
  const unplayed = roms.filter((r) => (r.rating || 0) >= 80 && !lastPlay(r) && !minsOf(r) && !r.user?.status).sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.votes || 0) - (a.votes || 0));
  if (unplayed.length >= 4) out.push({ id: 'toprated', title: "Top rated you haven't played", icon: 'mdiStarCircleOutline', count: '', items: unplayed.slice(0, 30) });
  const multi = roms.filter((r) => (r.modes || []).some((m) => /split.?screen|co-?op|multiplayer/i.test(m))).sort((a, b) => (b.rating || 0) - (a.rating || 0));
  if (multi.length >= 4) out.push({ id: 'multi', title: 'Local multiplayer', icon: 'mdiAccountGroupOutline', count: multi.length, items: multi.slice(0, 30) });
  const onDevice = roms.filter((r) => store.installed[r.id]).sort((a, b) => a.name.localeCompare(b.name));
  if (onDevice.length) out.push({ id: 'device', title: 'On this device', icon: 'mdiCheckCircleOutline', count: onDevice.length, items: onDevice.slice(0, 40) });
  const fresh = roms.filter(isNew).sort((a, b) => (store.lib.firstSeen[b.id] || 0) - (store.lib.firstSeen[a.id] || 0));
  if (fresh.length) out.push({ id: 'new', title: 'New since last sync', icon: 'mdiNewBox', count: fresh.length, items: fresh.slice(0, 40) });
  if (raRecent.value.length) out.push({ id: 'ra', type: 'ra', title: 'Latest achievements', icon: 'mdiTrophyOutline', count: '', items: raRecent.value });
  const backlog = roms.filter((r) => r.user?.backlog).sort((a, b) => a.name.localeCompare(b.name));
  if (backlog.length) out.push({ id: 'backlog', title: 'Backlog', icon: 'mdiBookClockOutline', count: backlog.length, items: backlog.slice(0, 40) });
  const fav = collections().find((c) => c.favorite && c.mine && !c.smart);
  const favRoms = fav ? fav.rom_ids.map((id) => romById(id)).filter((r) => r && visible(r)) : [];
  if (favRoms.length) out.push({ id: 'fav', title: 'Favourites', icon: 'mdiHeartOutline', count: favRoms.length, items: favRoms.slice(0, 40) });
  const cols = [...collections().filter((c) => c !== fav), ...autoLists()];
  if (cols.length) out.push({ id: 'col', type: 'col', title: 'Collections', icon: 'mdiBookmarkMultipleOutline', count: cols.length, items: cols });
  if (genres().length) out.push({ id: 'genres', type: 'genre', title: 'Genres', icon: 'mdiTagMultipleOutline', count: genres().length, items: genres() });
  if (seriesLists().length) out.push({ id: 'series', type: 'col', title: 'Series', icon: 'mdiBookshelf', count: seriesLists().length, items: seriesLists().slice(0, 30) });
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
function openCol(c) { if (c.genre) go('genre', { genre: c.name }); else go('collection', { collectionId: c.id }); }
function openSys(p) { go('platform', { platformId: p.id }); }

function onShelfFocus(e) {
  const wrap = e.target.closest('.shelf-wrap');
  if (!wrap || !shelvesEl.value) return;
  if (!document.body.classList.contains('pad-mode')) return; // only snap rows when using a controller
  glideTo(shelvesEl.value, wrap.offsetTop - 4);
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
  [{ b: 'A', label: 'Open' }, { b: 'X', label: 'Download' }, { b: 'Y', label: 'Search' }, { b: 'LT+RT', label: 'Tabs' }],
);

watch(() => [heroRom.value?.id, heroSys.value?.id, heroCol.value?.id, heroRom.value && store.logos[heroRom.value.id]], async () => {
  await nextTick();
  for (const t of [0, 180, 600]) setTimeout(() => requestAnimationFrame(fitHero), t);
});
watch(() => store.libVersion, async () => { await nextTick(); ensureFocus(el.value); });
onMounted(async () => { await nextTick(); ensureFocus(el.value); });
</script>

<style scoped>
.home { position: absolute; inset: 0; display: grid; grid-template-rows: minmax(250px, 38%) 1fr; animation: viewIn 0.16s ease-out; }
.first-sync { grid-row: 1 / -1; align-content: center; }
.first-sync h2 { font-size: 30px; color: var(--text); }
.hero { position: relative; padding: 18px 44px 10px; display: flex; align-items: flex-end; min-height: 0; overflow: hidden; }
.hero-in { position: relative; z-index: 1; max-width: 760px; display: flex; flex-direction: column; gap: 12px; }
.hero-leave-active { left: 44px; bottom: 10px; }
.hero-title { font-size: clamp(34px, 4.4vw, 58px); font-weight: 700; line-height: 1.02; letter-spacing: -0.02em; text-shadow: 0 6px 30px rgba(0, 0, 0, 0.5); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.meta { display: flex; align-items: center; gap: 14px; flex-wrap: nowrap; white-space: nowrap; overflow: hidden; min-width: 0; color: #cfd4de; font-size: 14px; }
.meta > span:not(.chip):not(:first-child)::before { content: ''; }
.summary { margin: 0; max-width: 720px; color: #c3c9d4; line-height: 1.55; font-size: 14.5px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.shelves { position: relative; overflow-y: auto; padding: 0 44px 60vh; }
.shelf-wrap { margin-bottom: 14px; }
.shelf { padding: 22px 44px 18px; margin: -12px -44px 0; scroll-padding: 0 44px; }
.hero-enter-active { transition: opacity 0.14s ease-out; }
.hero-leave-active { transition: opacity 0.1s ease-in; position: absolute; }
.hero-enter-from, .hero-leave-to { opacity: 0; }
.ra-home { flex: none; width: 150px; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px 10px 12px; border-radius: 12px; text-align: center; transition: transform 0.14s ease-out; }
.ra-home:focus { transform: scale(1.05); }
.ach-img { position: relative; width: 72px; height: 72px; display: grid; place-items: center; }
.ach-img > img { width: 72px; height: 72px; border-radius: 12px; object-fit: cover; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45); }
.ach-src { position: absolute; right: -6px; bottom: -6px; height: 22px; min-width: 22px; padding: 0 3px; border-radius: 7px; background: rgba(12, 12, 22, 0.92); display: grid; place-items: center; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5); }
.ach-ra { height: 12px; width: auto; }
.ra-home-p.k-tro { color: #cfe0ff; }
.ra-home-t { font-family: var(--display); font-weight: 600; font-size: 13.5px; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ra-home-g { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.ra-home-p { font-size: 11px; color: var(--gold); font-weight: 600; }
.ra-home { position: relative; padding-top: 28px; }
.ach-when { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); padding: 2px 8px; border-radius: 999px; background: rgba(0, 0, 0, 0.35); font-size: 10.5px; font-weight: 600; color: rgba(255, 255, 255, 0.78); white-space: nowrap; }
.ach-day { flex: none; align-self: stretch; display: flex; align-items: center; padding: 0 2px 0 6px; }
.ach-day span { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 700; color: var(--primary-t); padding: 8px 0; border-right: 2px solid color-mix(in srgb, var(--primary-t) 50%, transparent); padding-right: 8px; }
</style>
