<template>
  <div class="aa" ref="el">
    <div v-if="loading" class="center" style="height: 300px"><div class="spinner" /></div>

    <!-- nothing yet from either source -->
    <section v-else-if="!items.length && !unlocks.length" class="aa-empty glass">
      <div class="eyebrow">Achievements</div>
      <h1 class="big">Nothing here yet</h1>
      <p class="muted">RetroAchievements and the trophies your emulators keep (RPCS3, shadPS4, Xenia, Vita3K, KytyPS5) all show up here together.</p>
      <div class="row" style="gap: 12px; flex-wrap: wrap">
        <button v-if="!raOn" class="btn primary" data-focus @click="openSettings"><img class="ra-mark" :src="raLogo" alt="" />Sign in to RetroAchievements</button>
        <button class="btn" data-focus @click="openSettings"><Grade g="P" :size="18" />Find Emulator Trophies</button>
      </div>
    </section>

    <template v-else>
      <!-- 0.9.49 (owner): one page, as RetroAchievements looked (latest unlocks, then recently played), with a calm
           summary on top: big numbers, small labels, no profile picture, no Sign Out or Refresh (it refreshes itself) -->
      <header class="aa-top">
        <div class="aa-heading">
          <h1>Achievements</h1>
          <span class="aa-sync"><Icon :name="syncIcon" :size="14" :class="{ spin: store.trophySync?.state === 'running' }" />{{ syncText }}</span>
        </div>
        <div class="aa-stats">
          <div v-if="ra" class="aa-stat">
            <img class="ra-mark" :src="raLogo" alt="" />
            <b>{{ fmt(ra.points) }}</b><span>points</span>
            <span v-if="ra.softPoints" class="aa-stat-sub">{{ fmt(ra.softPoints) }} softcore</span>
          </div>
          <div v-if="trophyCount" class="aa-stat aa-grades">
            <span v-for="g in ['P', 'G', 'S', 'B']" :key="g" class="aa-g"><Grade :g="g" :size="20" /><b>{{ tro.summary[g] }}</b></span>
            <span class="aa-stat-sub">{{ fmt(trophyCount) }} trophies</span>
          </div>
          <div v-if="tro?.summary?.gamerscoreMax" class="aa-stat"><Grade :size="20" /><b>{{ fmt(tro.summary.gamerscore) }}</b><span>Gamerscore</span></div>
          <div class="aa-stat"><Icon name="mdiCrown" :size="20" class="mastered" /><b>{{ masteredCount }}</b><span>of {{ items.length }} games complete</span></div>
        </div>
      </header>

      <div v-if="shadNoKey" class="aa-note"><Icon name="mdiInformationOutline" :size="20" /><span>PS4 trophies need shadPS4's trophy key.</span><button class="btn small" data-focus @click="keyGuide"><Icon name="mdiHelpCircleOutline" :size="18" />How to Set It</button></div>

      <template v-if="unlocks.length">
        <div class="shelf-title">Latest unlocks</div>
        <div class="shelf aa-latest" data-hscroll>
          <button v-for="u in unlocks.slice(0, 15)" :key="u.key" class="aa-unlock glass" data-focus @click="u.open()" @focus="u.bg && setBg({ src: u.bg, blur: true })">
            <span class="aa-uicon"><img v-if="u.badge" :src="u.badge" loading="lazy" alt="" /><Grade v-else :g="u.grade" :size="36" /></span>
            <span class="aa-ubody">
              <span class="aa-utitle"><Grade v-if="u.grade" :g="u.grade" :size="16" />{{ u.title }}</span>
              <span class="aa-udesc">{{ u.desc }}</span>
              <span class="aa-umeta"><span v-if="u.pts" class="pts">{{ u.pts }}</span><span>{{ when(u.t) }}</span></span>
              <span class="aa-ugame">{{ u.game }} · <ConsoleMark :slug="u.slug" :label="u.console" /></span>
            </span>
          </button>
        </div>
      </template>

      <div class="aa-gh">
        <div class="shelf-title" style="margin: 0">Recently played<span class="count">{{ shown.length }}</span></div>
        <div class="spacer" />
        <button class="btn small" :class="{ primary: show !== 'all' }" data-focus @click="pickShow"><Icon name="mdiEyeOutline" :size="18" />{{ show === 'all' ? 'All Consoles' : show }}</button>
        <button class="btn small" data-focus @click="pickSort"><Icon name="mdiSortVariant" :size="18" />{{ SORTS.find((x) => x.v === sort).l }}</button>
        <div class="seg aa-view"><button v-for="v in VIEWS" :key="v.v" data-focus :class="{ on: view === v.v }" @click="setView(v.v)"><Icon :name="v.icon" :size="18" />{{ v.l }}</button></div>
      </div>

      <!-- Grid: three columns of cards (RetroAchievements' layout) -->
      <div v-if="view === 'grid'" class="aa-grid">
        <button v-for="g in shown" :key="g.key" class="aa-card glass" data-focus :data-key="'aa-' + g.key" @click="g.open()" @focus="g.bg && setBg({ src: g.bg, blur: true })">
          <GameIcon class="aa-gi" :title="g.code ? '' : g.title" :rom-id="g.romId" :fallback="g.icon" :size="72" :grade="g.kind === 'tro' ? 'G' : null" />
          <span class="aa-c-body">
            <span class="aa-c-title">{{ g.title }}</span>
            <span class="aa-c-sub"><ConsoleMark :slug="g.slug" :label="g.console" /><template v-if="g.t"> · {{ when(g.t) }}</template></span>
            <span class="bar aa-bar" :class="g.kind"><i :style="{ width: g.pct + '%' }" /></span>
            <span class="aa-c-prog"><b>{{ g.earned }}</b> / {{ g.total }} · {{ g.pct }}%<template v-if="g.extra"> · {{ g.extra }}</template></span>
          </span>
          <Icon v-if="g.mastered" name="mdiCrown" :size="24" class="mastered" /><Grade v-else-if="g.plat" g="P" :size="22" />
        </button>
      </div>
      <!-- Stack: one game per line -->
      <div v-else class="aa-list">
        <button v-for="g in shown" :key="g.key" class="aa-row" data-focus :data-key="'aa-' + g.key" @click="g.open()" @focus="g.bg && setBg({ src: g.bg, blur: true })">
          <GameIcon class="aa-gi" :title="g.code ? '' : g.title" :rom-id="g.romId" :fallback="g.icon" :size="44" :grade="g.kind === 'tro' ? 'G' : null" />
          <span class="aa-r-title">{{ g.title }}</span>
          <span class="aa-r-con"><ConsoleMark :slug="g.slug" :label="g.console" /></span>
          <span class="aa-r-n">{{ g.earned }}/{{ g.total }}</span>
          <span class="bar aa-bar" :class="g.kind"><i :style="{ width: g.pct + '%' }" /></span>
          <span class="aa-r-pct">{{ g.pct }}%</span>
          <Icon v-if="g.mastered" name="mdiCrown" :size="20" class="mastered" /><Grade v-else-if="g.plat" g="P" :size="20" /><span v-else class="aa-r-gap" />
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
// The one Achievements page (0.9.49, owner: "keep them all in All", styled like the RetroAchievements tab):
// RetroAchievements and emulator trophies together. Latest unlocks as cards, then recently played games sorted
// as RetroAchievements sorts them (latest first), as a Grid of cards or a Stack of rows (ui.achView). Games are
// named in text (never a logo picture: they were hard to read in Light and dark). Sign-in, hidden games and trophy
// folders live in Settings → Achievements; the page refreshes itself (trophy changes and RetroAchievements' cache).
import { computed, onMounted, ref, watch } from 'vue';
import { store, call, img, go, setBg, when, choose, consoleName, consoleSlug, saveConfig } from '../store.js';
import ConsoleMark from '../components/ConsoleMark.vue';
import { useView } from '../useView.js';
// 0.9.51 (owner: Change Icon stopped working here): the game's icon is GameIcon again, as on the pages before 0.9.49,
// so an icon picked in a game's More shows, and a wide picture is fitted inside the square instead of cut
import GameIcon from '../components/GameIcon.vue';
import { focusFirst } from '../nav.js';
import Icon from '../components/Icon.vue';
import Grade from '../components/Grade.vue';
import raLogo from '../assets/ra-logo.png';

const el = ref(null);
const ra = ref(null), tro = ref(null), loading = ref(true);
const raOn = computed(() => !!store.config.ra?.user && !!store.config.ra?.key);
const fmt = (n) => (n || 0).toLocaleString();
const raDate = (d) => { const t = new Date(String(d || '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(d || '') ? '' : 'Z')).getTime(); return isNaN(t) ? 0 : t; };
const CONSOLE = { rpcs3: 'PlayStation 3', shadps4: 'PlayStation 4', xenia: 'Xbox 360', vita3k: 'PlayStation Vita', kytyps5: 'PlayStation 5', recomp: 'Recomps' };
const romOfTro = (key) => tro.value?.games?.find((g) => g.key === key)?.romId || null;
const pctOf = (e, t) => (t ? Math.round((e / t) * 100) : 0);
const trophyCount = computed(() => (tro.value?.anySource ? ['P', 'G', 'S', 'B'].reduce((s, g) => s + (tro.value.summary?.[g] || 0), 0) : 0));

const unlocks = computed(() => {
  const out = [];
  for (const a of ra.value?.recent || []) out.push({ key: 'ra' + a.id + a.date, t: raDate(a.date), badge: img(a.badge), bg: a.gameIcon ? img(a.gameIcon) : '', title: a.title, desc: a.desc, pts: `${a.points} pts${a.hardcore ? ' · HC' : ''}`, game: a.game, console: consoleName({ romId: a.romId, fallback: a.console }), slug: consoleSlug({ romId: a.romId, name: a.console }), open: () => go('ra-game', { gameId: a.gameId }) });
  for (const t of tro.value?.recent || []) out.push({ key: 'tr' + t.key + t.id, t: t.time || 0, badge: t.icon, grade: t.grade, title: t.name, desc: t.desc, pts: t.points ? `${t.points} G` : '', game: t.game, console: consoleName({ romId: romOfTro(t.key), src: t.src, fallback: CONSOLE[t.src] || t.short }), slug: consoleSlug({ romId: romOfTro(t.key), src: t.src }), open: () => go('trophy-game', { tkey: t.key }) });
  return out.sort((a, b) => b.t - a.t).slice(0, 30);
});
const items = computed(() => {
  const out = [];
  for (const g of ra.value?.played || []) out.push({ key: 'ra' + g.gameId, kind: 'ra', title: g.title, console: consoleName({ romId: g.romId, fallback: g.console || 'Other' }), slug: consoleSlug({ romId: g.romId, name: g.console }), icon: img(g.icon), bg: img(g.boxart || g.icon), romId: g.romId, t: raDate(g.lastPlayed), earned: g.earned, total: g.total, pct: pctOf(g.earned, g.total), extra: g.possible ? `${g.score} / ${g.possible} pts` : '', mastered: !!(g.total && g.earned >= g.total), open: () => go('ra-game', { gameId: g.gameId }) });
  for (const g of tro.value?.games || []) {
    if (g.hidden) continue;
    out.push({ key: 'tr' + g.key, kind: 'tro', title: g.title, code: g.code, console: consoleName({ romId: g.romId, src: g.src, fallback: CONSOLE[g.src] || g.short }), slug: consoleSlug({ romId: g.romId, src: g.src }), icon: g.icon || (g.cover ? img(g.cover) : ''), bg: g.cover ? img(g.cover) : '', romId: g.romId, t: g.last || 0, earned: g.earned, total: g.total, pct: pctOf(g.earned, g.total), extra: g.kind === 'gamerscore' ? `${g.score} / ${g.possible} G` : '', mastered: !!(g.total && g.earned >= g.total), plat: !!g.grades?.P, open: () => go('trophy-game', { tkey: g.key }) });
  }
  return out;
});
const masteredCount = computed(() => items.value.filter((g) => g.mastered).length);
const show = ref('all'), sort = ref('latest');
const SORTS = [{ v: 'latest', l: 'Latest', icon: 'mdiClockOutline' }, { v: 'most', l: 'Most Complete', icon: 'mdiProgressCheck' }, { v: 'least', l: 'Least Complete', icon: 'mdiProgressClock' }, { v: 'unlocked', l: 'Most Unlocked', icon: 'mdiTrophyOutline' }, { v: 'console', l: 'By Console', icon: 'mdiGamepadVariantOutline' }, { v: 'name', l: 'A to Z', icon: 'mdiSortAlphabeticalAscending' }];
const VIEWS = [{ v: 'grid', l: 'Grid', icon: 'mdiViewGridOutline' }, { v: 'stack', l: 'Stack', icon: 'mdiViewAgendaOutline' }];
const view = computed(() => (store.config.ui?.achView === 'stack' ? 'stack' : 'grid'));
const setView = (v) => saveConfig({ ui: { achView: v } });
const shown = computed(() => {
  const l = items.value.filter((g) => show.value === 'all' || g.console === show.value);
  if (sort.value === 'most') return [...l].sort((a, b) => b.pct - a.pct || b.t - a.t);
  if (sort.value === 'least') return [...l].sort((a, b) => a.pct - b.pct || b.t - a.t);
  if (sort.value === 'unlocked') return [...l].sort((a, b) => b.earned - a.earned || b.t - a.t);
  if (sort.value === 'console') return [...l].sort((a, b) => a.console.localeCompare(b.console) || b.t - a.t);
  if (sort.value === 'name') return [...l].sort((a, b) => a.title.localeCompare(b.title));
  return [...l].sort((a, b) => b.t - a.t);
});
// Show and Sort as one sheet with two tabs (0.9.3 K, G4 B)
async function showSort(tab) {
  const cons = [...new Set(items.value.map((g) => g.console))].sort((a, b) => a.localeCompare(b));
  const v = await choose({ title: 'Show and sort', tab, tabs: [
    { label: 'Show', options: [{ label: 'All consoles', value: 'all', icon: 'mdiViewGridOutline', selected: show.value === 'all' }, ...cons.map((c) => ({ label: c, value: c, icon: 'mdiGamepadVariantOutline', selected: show.value === c, raw: true }))].map((o) => ({ ...o, value: 'f:' + o.value })) },
    { label: 'Sort by', options: SORTS.map((x) => ({ label: x.l, value: 's:' + x.v, icon: x.icon, selected: sort.value === x.v })) },
  ] });
  if (v?.startsWith('f:')) show.value = v.slice(2);
  else if (v?.startsWith('s:')) sort.value = v.slice(2);
}
const pickShow = () => showSort(0), pickSort = () => showSort(1);

const syncIcon = computed(() => ({ running: 'mdiSync', ok: 'mdiCloudCheckOutline', error: 'mdiCloudAlertOutline', off: 'mdiCloudOffOutline' }[store.trophySync?.state] || 'mdiCloudOutline'));
const syncText = computed(() => {
  const s = store.trophySync || {};
  if (s.state === 'running') return 'Syncing with RomM';
  if (s.state === 'ok') return 'Synced with RomM ' + when(s.at);
  if (s.state === 'error') return s.error;
  if (s.state === 'off') return 'Trophy sync is off';
  return 'On this device';
});
// shadPS4 without its trophy key records no trophies (0.9.3 E7)
const shadNoKey = computed(() => (tro.value?.sources || []).some((s) => s.id === 'shadps4' && s.note === 'nokey'));
async function keyGuide() {
  await choose({ title: 'shadPS4 trophy key', message: 'shadPS4 needs your trophy key to read and record PS4 trophies.\n\n1. Open shadPS4 (its launcher) on this device.\n2. Add your trophy key in its settings (it is saved in keys.json).\n3. Open a PS4 game once, then come back.\n\nCartridge never stores or downloads keys.', options: [{ label: 'OK', value: 'ok', icon: 'mdiCheck' }] });
}
function openSettings() { store.settingsSection = 'ra'; go('settings'); }

async function load(force = false) {
  await Promise.all([
    raOn.value ? call('ra:overview', { force }).then((d) => (ra.value = d)).catch(() => {}) : (ra.value = null),
    call('trophies:overview').then((d) => { tro.value = d; if (d.sync) store.trophySync = d.sync; }).catch(() => {}),
  ]);
  loading.value = false;
}
watch(() => store.trophyVer, () => load());
watch(() => store.trophySync?.state, (s, o) => { if (o === 'running' && s === 'ok') load(); });
useView({ y: pickSort }, [{ b: 'A', label: 'Open' }, { b: 'Y', label: 'Sort' }]);
onMounted(async () => {
  await load();
  focusFirst(el.value);
  // refreshes itself (owner: no Refresh button): RetroAchievements' newest, and a trophy sync, once per visit
  call('trophies:sync').catch(() => {});
  if (raOn.value) call('ra:overview', { force: true }).then((d) => (ra.value = d)).catch(() => {});
});
</script>

<style scoped>
.big { font-size: var(--t-xl); }
.aa-empty { max-width: 820px; margin: 20px auto; padding: 28px 30px; display: flex; flex-direction: column; gap: var(--s-3); border-radius: var(--r-lg); }
.ra-mark { height: 18px; width: auto; }
/* the top: title and sync line, then the totals as big numbers with small labels */
.aa-top { display: flex; flex-direction: column; gap: var(--s-3); margin: 4px 0 var(--s-4); }
.aa-heading { display: flex; align-items: baseline; gap: var(--s-3); flex-wrap: wrap; }
.aa-heading h1 { font-size: var(--t-xl); margin: 0; }
.aa-sync { display: inline-flex; align-items: center; gap: 6px; font-size: var(--t-sm); color: var(--text-2, var(--muted)); }
.aa-stats { display: flex; gap: var(--s-2); flex-wrap: wrap; }
.aa-stat { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: var(--r-md); background: var(--s1); box-shadow: inset 0 0 0 1px var(--line, rgba(255, 255, 255, 0.06)); color: var(--text); flex-wrap: wrap; }
.aa-stat b { font-family: var(--display); font-size: var(--t-lg); font-weight: 700; line-height: 1; }
.aa-stat > span { font-size: var(--t-sm); color: var(--text-2, var(--muted)); }
.aa-stat .aa-stat-sub { font-size: var(--t-xs); color: var(--text-2, var(--muted)); padding-left: 6px; border-left: 1px solid var(--line, rgba(255, 255, 255, 0.12)); }
.aa-grades { gap: 12px; }
.aa-g { display: inline-flex; align-items: center; gap: 5px; }
.aa-g b { font-size: var(--t-md); }
.aa-note { display: flex; align-items: center; gap: var(--s-2); padding: 10px 14px; margin-bottom: var(--s-3); border-radius: var(--r-md); background: var(--s1); }
.aa-latest { margin-bottom: var(--s-4); }
.aa-unlock { flex: none; width: 360px; display: flex; gap: 14px; padding: 14px; border-radius: var(--r-md); text-align: left; transition: transform var(--spring-snappy-d) var(--spring-snappy); }
.aa-unlock:focus { transform: scale(1.03); }
.aa-uicon { width: 64px; height: 64px; border-radius: var(--r-md); flex: none; display: grid; place-items: center; background: var(--tile-bg, rgba(0, 0, 0, 0.25)); box-shadow: var(--tile-shadow, 0 6px 16px rgba(0, 0, 0, 0.4)); overflow: hidden; }
.aa-uicon img { width: 100%; height: 100%; object-fit: cover; }
.aa-ubody { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.aa-utitle { font-family: var(--display); font-weight: 600; font-size: var(--t-md); display: flex; gap: 6px; align-items: center; overflow-wrap: anywhere; }
.aa-udesc { font-size: var(--t-xs); color: var(--text-2, var(--muted)); overflow-wrap: anywhere; }
.aa-umeta { display: flex; gap: 10px; align-items: center; font-size: var(--t-xs); color: var(--text-2, var(--muted)); }
.aa-umeta .pts { color: var(--score, #9be38a); font-weight: 600; }
.aa-ugame { font-size: var(--t-xs); color: var(--text-2, var(--muted)); overflow-wrap: anywhere; }
.aa-gh { display: flex; align-items: center; gap: var(--s-2); margin: 0 0 var(--s-3); flex-wrap: wrap; }
.aa-gh .spacer { flex: 1; }
.aa-view button { display: inline-flex; align-items: center; gap: 6px; }
/* Grid */
.aa-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; padding-bottom: 30px; }
.aa-card { display: flex; gap: 14px; align-items: center; padding: 12px 14px; border-radius: var(--r-md); text-align: left; position: relative; transition: transform var(--spring-snappy-d) var(--spring-snappy); min-width: 0; }
.aa-card:focus { transform: scale(1.02); }
.aa-art { width: 72px; height: 72px; border-radius: var(--r-md); flex: none; display: grid; place-items: center; overflow: hidden; background: var(--tile-bg, rgba(0, 0, 0, 0.25)); color: var(--muted); }
.aa-art img { width: 100%; height: 100%; object-fit: cover; }
.aa-art.small { width: 44px; height: 44px; border-radius: var(--r-sm); }
.aa-gi { flex: none; }
.aa-c-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.aa-c-title { font-family: var(--display); font-weight: 600; font-size: var(--t-md); overflow-wrap: anywhere; }
.aa-c-sub { font-size: var(--t-xs); color: var(--text-2, var(--muted)); overflow-wrap: anywhere; }
.aa-c-prog { font-size: var(--t-xs); color: var(--text-2, var(--muted)); }
/* focus is the ring and the lift, not a fill, so the lines keep their colours (0.9.49: they turned dark on the dark card) */
/* Stack */
.aa-list { display: flex; flex-direction: column; gap: 4px; padding-bottom: 30px; }
.aa-row { display: grid; grid-template-columns: 44px minmax(0, 1fr) 120px 64px minmax(80px, 180px) 48px 24px; align-items: center; gap: var(--s-3); padding: 8px 12px; border-radius: var(--r-md); text-align: left; }
.aa-row:focus { background: var(--focus); color: var(--on-focus); }
.aa-row:focus .aa-r-con, .aa-row:focus .aa-r-n { color: var(--on-focus-dim); }
.aa-r-title { font-family: var(--display); font-weight: 600; font-size: var(--t-md); overflow-wrap: anywhere; }
.aa-r-con, .aa-r-n { font-size: var(--t-sm); color: var(--text-2, var(--muted)); overflow-wrap: anywhere; }
.aa-r-pct { font-size: var(--t-sm); font-weight: 700; text-align: right; }
.aa-bar { height: 6px; display: block; }
.aa-bar.ra i { background: linear-gradient(90deg, #f5c542, #ffdf80); }
.aa-bar.tro i { background: linear-gradient(90deg, #7fa8ff, #cfe0ff); }
.mastered { color: var(--gold); flex: none; }
@media (max-width: 1500px) { .aa-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 900px) { .aa-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 1100px) { .aa-row { grid-template-columns: 44px minmax(0, 1fr) 90px 56px 80px 44px 24px; } }
</style>
