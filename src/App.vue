<template>
  <Background v-if="store.config" />
  <div v-if="!store.config" class="center" style="height: 100%"><div class="spinner" /></div>
  <Welcome v-else-if="store.welcoming || (!store.config.configured && !store.config.welcomed)" />
  <Setup v-else-if="!store.config.configured || store.route.name === 'setup'" />
  <div v-else class="shell" :style="{ '--card-w': cardW }">
    <header class="statusbar" :class="{ 'has-back': store.history.length }">
      <button v-if="store.history.length" class="backbtn" aria-label="Back" @click="back()"><Icon name="mdiArrowLeft" :size="22" /></button>
      <div class="brand"><Logo :size="28" />
        <!-- 0.9.49 (owner): the hello slides out of the gap between the logo and the tabs, letter by letter like the
             opening, then tucks back in -->
        <div v-if="greet" class="greet" :class="{ out: greet.out }" :style="{ maxWidth: greet.max + 'px' }" aria-live="polite"><span v-for="(c, i) in greet.text" :key="i" :style="{ '--i': i }">{{ c === ' ' ? '\u00a0' : c }}</span></div>
      </div>
      <!-- 0.9.19 (owner: make the top bar much better, with the taste skill; photos of the frontend
           they liked): every tab is its icon, the current one also its name, which opens out as you
           arrive; one short line slides under it. LT/RT only while a controller is in use. -->
      <nav class="tabs" ref="tabsEl">
        <Btn v-if="padMode" b="LT" class="tab-trig" />
        <button v-for="t in tabs" :key="t.name" class="tab" :class="{ active: activeTab === t.name }" :data-tab="t.name" :title="t.label" :aria-label="t.label" @click="tab(t.name)">
          <Icon :name="t.icon" :size="21" class="tab-ico" />
          <span class="tab-label"><span>{{ t.label }}</span></span>
          <span v-if="t.name === 'downloads' && activeDl.length" class="tab-badge">{{ activeDl.length }}</span>
        </button>
        <Btn v-if="padMode" b="RT" class="tab-trig" />
        <i class="tab-ink" :style="ink" />
      </nav>
      <div class="spacer" />
      <label class="top-search" :class="{ on: store.route.name === 'search', open: store.route.name === 'search' || !!store.lastSearch }">
        <Icon name="mdiMagnify" :size="20" style="flex: none" />
        <input ref="searchEl" data-focus data-nofirst data-key="top-search" :value="store.lastSearch" :readonly="builtinKb()" placeholder="Search games" autocomplete="off" spellcheck="false" @input="onSearch" @click="searchOsk" />
        <button v-if="store.lastSearch" class="clear" tabindex="-1" @mousedown.prevent @click="clearSearch"><Icon name="mdiClose" :size="16" /></button>
        <Btn v-else-if="padMode" b="Y" /><!-- the Y hint only while a controller is in use, like LT/RT -->
      </label>
      <div class="sys">
        <!-- 0.9.38 (owner: "Syncing 12/21" was long; make it like the Steam ring): the library sync is a ring too,
             filling round the sync arrows; it closes the circle and settles away when the sync is done -->
        <Transition name="ring-out"><div v-if="syncBusy || syncEnding" class="item steam-ring sync-ring" :class="{ wait: syncPct == null && !syncEnding, done: syncEnding }" :title="syncLabel" :aria-label="syncLabel">
          <svg class="sr-ring" viewBox="0 0 36 36"><circle class="sr-arc" cx="18" cy="18" r="15.5" pathLength="100" :stroke-dasharray="`${syncEnding ? 100 : syncPct ?? 22} 100`" /></svg>
          <Icon :name="syncEnding ? 'mdiCheck' : 'mdiSync'" :size="16" class="sr-logo" />
        </div></Transition>
        <!-- 0.9.29 (owner): adding to Steam is a ring filling round the Steam logo, one fixed size, so nothing in the
             bar moves (the wide "Steam artwork 18/43" pill pushed the search into the Dock); no track, the arc grows -->
        <div v-if="steam.progress" class="item steam-ring" :class="{ wait: steamPct == null }" :title="steamProgressLabel(steam.progress)" :aria-label="steamProgressLabel(steam.progress)">
          <svg class="sr-ring" viewBox="0 0 36 36"><circle class="sr-arc" cx="18" cy="18" r="15.5" pathLength="100" :stroke-dasharray="`${steamPct ?? 22} 100`" /></svg>
          <Icon name="mdiSteam" :size="17" class="sr-logo" />
        </div>
        <div v-if="activeDl.length" class="item">
          <svg width="22" height="22" viewBox="0 0 36 36" class="ring"><circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="4" /><circle cx="18" cy="18" r="15" fill="none" stroke="url(#rg)" stroke-width="4" stroke-linecap="round" :stroke-dasharray="`${dlPct * 0.943} 100`" transform="rotate(-90 18 18)" /><defs><linearGradient id="rg"><stop offset="0" style="stop-color: var(--primary-l)" /><stop offset="1" style="stop-color: var(--peach)" /></linearGradient></defs></svg>
          {{ dlPct }}%
        </div>
        <div v-if="store.connection.base" class="item net" :title="store.connection.route === 'local' ? 'Home network (LAN)' : 'Internet (Tunnel)'" :aria-label="store.connection.route === 'local' ? 'LAN' : 'Tunnel'"><Icon :name="store.connection.route === 'local' ? 'mdiHomeOutline' : 'mdiEarth'" :size="20" /></div>
        <div v-else class="item net bad"><Icon name="mdiCloudOffOutline" :size="18" />Offline</div>
        <div v-if="battery" class="item"><Icon :name="batteryIcon" :size="18" />{{ battery.level }}%</div>
        <div class="clock">{{ clock }}</div>
      </div>
    </header>
    <main class="main" ref="mainEl" data-zone :data-dir="store.navDir" :data-page="store.route?.name">
      <component :is="views[store.route.name]" :key="viewKey" v-bind="store.route.params" />
    </main>
    <footer class="hintbar">
      <div class="left"><span class="hint"><Btn b="START" />Menu</span><span class="hint"><Btn b="SELECT" />Downloads</span></div>
      <span v-for="h in store.hints" :key="h.b + h.label" class="hint"><Btn :b="h.b" />{{ h.label }}</span>
    </footer>
  </div>

  <QuickMenu v-if="store.quickMenu" />
  <!-- 0.9.37 (apple-design: interruptible, anchored to where it came from): every pop-up opens from the button that
       asked for it and closes back towards it; one slot, so a pop-up that hands over to another cross-fades -->
  <Transition name="modal" @enter="modalFrom" @after-enter="modalIn" @before-leave="modalFrom">
    <Keyboard v-if="store.modal?.type === 'keyboard' && builtinKb()" v-bind="store.modal.props" />
    <TextPrompt v-else-if="store.modal?.type === 'keyboard'" v-bind="store.modal.props" />
    <FolderPicker v-else-if="store.modal?.type === 'folder'" v-bind="store.modal.props" />
    <Menu v-else-if="store.modal?.type === 'menu'" v-bind="store.modal.props" />
    <ColorPicker v-else-if="store.modal?.type === 'color'" v-bind="store.modal.props" />
    <SteamCollections v-else-if="store.modal?.type === 'steam-collections'" :key="JSON.stringify(store.modal.props.selected) + (store.modal.props.extra || []).join()" v-bind="store.modal.props" />
    <SteamPreview v-else-if="store.modal?.type === 'steam-preview'" v-bind="store.modal.props" />
    <SteamEmu v-else-if="store.modal?.type === 'steam-emu'" :key="JSON.stringify(store.modal.props)" v-bind="store.modal.props" />
    <ArtPicker v-else-if="store.modal?.type === 'art'" :key="store.modal.props.query || ''" v-bind="store.modal.props" />
    <GameTimeline v-else-if="store.modal?.type === 'timeline'" v-bind="store.modal.props" />
    <GameAbout v-else-if="store.modal?.type === 'gameabout'" v-bind="store.modal.props" />
    <ConsoleCollection v-else-if="store.modal?.type === 'consolecol'" v-bind="store.modal.props" />
    <LinkSetup v-else-if="store.modal?.type === 'linksetup'" v-bind="store.modal.props" />
    <SaveGame v-else-if="store.modal?.type === 'savegame'" :key="'sg' + store.modal.props.romId" v-bind="store.modal.props" />
    <SaveLocations v-else-if="store.modal?.type === 'savelocations'" key="savelocations" />
    <ManualViewer v-else-if="store.modal?.type === 'manual'" v-bind="store.modal.props" />
    <PatchesSheet v-else-if="store.modal?.type === 'patches'" v-bind="store.modal.props" />
    <AddonsSheet v-else-if="store.modal?.type === 'addons'" :key="'addons' + store.modal.props.romId" v-bind="store.modal.props" />
    <GameAddons v-else-if="store.modal?.type === 'gameaddons'" :key="'ga' + store.modal.props.romId" v-bind="store.modal.props" />
    <ShadVersions v-else-if="store.modal?.type === 'shadversions'" v-bind="store.modal.props" />
    <WhatsNew v-else-if="store.modal?.type === 'whatsnew'" v-bind="store.modal.props" />
    <EmuPaths v-else-if="store.modal?.type === 'emupaths'" v-bind="store.modal.props" />
    <AddonDetail v-else-if="store.modal?.type === 'addondetail'" v-bind="store.modal.props" />
    <Licenses v-else-if="store.modal?.type === 'licenses'" />
    <Installer v-else-if="store.modal?.type === 'installer'" />
    <ImageSearch v-else-if="store.modal?.type === 'imgsearch'" v-bind="store.modal.props" />
    <GameSettings v-else-if="store.modal?.type === 'gamesettings'" :key="'gs' + store.modal.props.romId" v-bind="store.modal.props" />
  </Transition>
  <FirstTour v-if="store.tour" v-bind="store.tour.props" />
  <CloudSync v-if="store.cloudSync" />
  <IdleScreen v-if="store.config?.configured" />
  <PerfOverlay v-if="store.config?.ui?.perfOverlay && !store.away" />

  <div class="pops">
    <TransitionGroup name="pop">
      <div v-for="p in store.pops" :key="p.id" class="pop glass">
        <div class="pop-icon"><img v-if="p.icon" :src="p.icon" /><Grade v-else :g="p.grade" :size="40" /></div>
        <div class="pop-body">
          <div class="pop-kind"><Grade :g="p.grade" :size="16" />{{ p.grade ? GRADE[p.grade] + ' trophy unlocked' : 'Achievement unlocked' }}<template v-if="p.points"> · {{ p.points }} G</template></div>
          <div class="pop-name">{{ p.name }}</div>
          <div class="pop-game">{{ p.game }}</div>
        </div>
      </div>
    </TransitionGroup>
  </div>
  <div class="toasts" :class="{ shifted: store.quickMenu }">
    <div v-for="t in store.toasts" :key="t.id" class="toast" :class="t.kind"><span class="ti"><Icon :name="t.icon" :size="18" /></span><span class="toast-msg">{{ t.msg }}</span></div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick, defineAsyncComponent } from 'vue';
import { store, loadConfig, loadLibrary, loadArt, back, tab, go, call, toast, choose, saveConfig, builtinKb, askText, GRADE, activeTabs, TAB_DEFS, romById, isFavourite, download, playGame } from './store.js';
import { pushLayer, focusFirst, input, gameEnded } from './nav.js';
import { governorAway } from './motion.js';
import { setSoundEnabled, setSoundStyle, sfx } from './sfx.js';
import { applyTheme, CARD_SIZES, dockOf } from './themes.js';
import { setPointerPref, setRumble, setBackground } from './nav.js';
import { detectPad } from './pad.js';
import Icon from './components/Icon.vue';
import Btn from './components/Btn.vue';
import Logo from './components/Logo.vue';
import Background from './components/Background.vue';
import Welcome from './views/Welcome.vue';
import QuickMenu from './components/QuickMenu.vue';
import TextPrompt from './components/TextPrompt.vue';
import Keyboard from './components/Keyboard.vue';
import Grade from './components/Grade.vue';
import FolderPicker from './components/FolderPicker.vue';
import Menu from './components/Menu.vue';
import ArtPicker from './components/ArtPicker.vue';
import GameTimeline from './components/GameTimeline.vue';
import GameAbout from './components/GameAbout.vue';
import ConsoleCollection from './components/ConsoleCollection.vue';
import LinkSetup from './components/LinkSetup.vue';
import SaveGame from './components/SaveGame.vue';
import SaveLocations from './components/SaveLocations.vue';
import FirstTour from './components/FirstTour.vue';
import CloudSync from './components/CloudSync.vue';
// the manual reader brings pdf.js: loaded the first time a manual opens, not at start
const ManualViewer = defineAsyncComponent(() => import('./components/ManualViewer.vue'));
import PatchesSheet from './components/PatchesSheet.vue';
import AddonsSheet from './components/AddonsSheet.vue';
import GameAddons from './components/GameAddons.vue';
import WhatsNew from './components/WhatsNew.vue';
import EmuPaths from './components/EmuPaths.vue';
import AddonDetail from './components/AddonDetail.vue';
import Licenses from './components/Licenses.vue';
import Installer from './components/Installer.vue';
import ImageSearch from './components/ImageSearch.vue';
import ShadVersions from './components/ShadVersions.vue';
import GameSettings from './components/GameSettings.vue';
import IdleScreen from './components/IdleScreen.vue';
import PerfOverlay from './components/PerfOverlay.vue';
import SteamCollections from './components/SteamCollections.vue';
import SteamPreview from './components/SteamPreview.vue';
import SteamEmu from './components/SteamEmu.vue';
import { steamReport, steam, steamProgressLabel } from './steam.js';
import ColorPicker from './components/ColorPicker.vue';
import Setup from './views/Setup.vue';
import Home from './views/Home.vue';
import Start from './views/Start.vue';
import Gallery from './views/Gallery.vue';
import Consoles from './views/Consoles.vue';
import Game from './views/Game.vue';
import Downloads from './views/Downloads.vue';
import SteamMissing from './views/SteamMissing.vue';
import SteamConsole from './views/SteamConsole.vue';
import Settings from './views/Settings.vue';
import Search from './views/Search.vue';
import Achievements from './views/Achievements.vue';
import RaGame from './views/RaGame.vue';
import TrophyGame from './views/TrophyGame.vue';
import Genres from './views/Genres.vue';
import Collections from './views/Collections.vue';
import EmuSetup from './views/EmuSetup.vue';
import ShortcutHealth from './views/ShortcutHealth.vue';
import FrameGen from './views/FrameGen.vue';

const views = { start: Start, achievements: Achievements, 'ra-game': RaGame, 'trophy-game': TrophyGame, home: Home, library: Gallery, consoles: Consoles, platform: Gallery, collection: Gallery, genre: Gallery, genres: Genres, collections: Collections, game: Game, downloads: Downloads, settings: Settings, search: Search, 'steam-console': SteamConsole, 'steam-missing': SteamMissing, 'emu-setup': EmuSetup, 'steam-health': ShortcutHealth, 'frame-gen': FrameGen };
// the tabs you picked in Look & Feel → Top bar, in your order
const tabs = computed(() => activeTabs().map((name) => ({ name, ...TAB_DEFS[name] })));
const steamPct = computed(() => { const p = steam.progress; return p?.total ? Math.max(4, Math.min(100, ((p.done + 1) / p.total) * 100)) : null; });
const mainEl = ref(null);
const searchEl = ref(null);
// Search box in the top bar: typing jumps to the Search view and filters live
function onSearch(e) {
  store.lastSearch = e.target.value;
  if (store.route.name !== 'search' && e.target.value.trim()) go('search');
}
async function searchOsk() {
  if (!builtinKb()) return;
  const r = searchEl.value?.getBoundingClientRect(); // the keyboard grows out of the search box (0.9.24)
  const v = await askText({ title: 'Search games', value: store.lastSearch, placeholder: 'Game name', mode: 'game', from: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null });
  if (v == null) return;
  store.lastSearch = v;
  if (v.trim() && store.route.name !== 'search') go('search');
  await nextTick();
  toResults();
}
function clearSearch() { store.lastSearch = ''; searchEl.value?.focus(); }
function focusSearch() {
  if (builtinKb()) { searchOsk(); return; }
  if (store.route.name !== 'search') go('search');
  nextTick(() => { searchEl.value?.focus(); searchEl.value?.select(); });
}
function toResults() {
  const first = mainEl.value?.querySelector('.card[data-focus]');
  if (first) first.focus(); else searchEl.value?.blur();
}
const viewKey = computed(() => store.route.name + JSON.stringify(store.route.params));
const cardW = computed(() => (CARD_SIZES[store.config.ui.gridSize] || CARD_SIZES.md).w);
// the white pill behind the current tab (transform and width, so moving it costs no layout)
const tabsEl = ref(null), ink = ref({ opacity: 0 });
// the hello (0.9.49): in the gap between the logo and a centred Dock when it fits there, else the old toast
const greet = ref(null);
function sayHello(text) {
  const brand = document.querySelector('.statusbar .brand'), tabs = tabsEl.value;
  const b = document.body.classList, room = brand && tabs && b.contains('bar-center') && !b.contains('bar-left') ? tabs.getBoundingClientRect().left - brand.getBoundingClientRect().right - 28 : 0;
  const need = text.length * 9.5; // about the width of the text at the bar's size
  if (room < need || matchMedia('(prefers-reduced-motion: reduce)').matches) { toast(text, 'info', 2600, 'mdiHandWave'); return; }
  greet.value = { text, out: false, max: room };
  setTimeout(() => { if (greet.value) greet.value.out = true; }, 2600 + text.length * 35);
  setTimeout(() => (greet.value = null), 3500 + text.length * 35);
}
const padMode = computed(() => input.mode === 'pad');
function placeInk() {
  const nav = tabsEl.value, el = nav?.querySelector(`[data-tab="${activeTab.value}"]`);
  if (!el) { ink.value = { opacity: 0 }; return; }
  // the bar on the left (0.9.24): the pill moves down the column instead of along the row
  if (document.body.classList.contains('bar-left')) { ink.value = { transform: `translateY(${el.offsetTop}px)`, opacity: 1 }; return; }
  const x = el.offsetLeft, w = el.offsetWidth;
  ink.value = { width: w + 'px', transform: `translateX(${x}px)`, opacity: 1 };
}
// where the bar sits and how it looks (Look & Feel → Text and Cards → Top Bar)
// touch scrolling (0.9.26): Cartridge's engine unless the browser's was picked in Look & Feel → Controls
watch(() => store.config?.ui?.touchScroll, (v) => document.documentElement.classList.toggle('touch-native', v === 'browser'), { immediate: true });
// 0.9.28 (owner): the Dock (the bar of tabs) sits at the bottom, centred, as a pill unless chosen otherwise;
// the strip of button hints is hidden unless turned on; the Dock's colour (pill style)
watch(() => [store.config?.ui?.barPos || 'bottom', store.config?.ui?.barAlign || 'center', store.config?.ui?.barStyle || 'pill', store.config?.ui?.hints === true || !!store.forceHints, dockOf(store.config?.ui)], ([pos, align, style, hints, dock]) => { // unpicked: Glass with Glass elements, white with Light, else black (themes.dockOf)
  const b = document.body.classList;
  b.toggle('bar-top', pos === 'top'); b.toggle('hints-on', hints);
  for (const c of ['white', 'black', 'accent', 'glass']) b.toggle('dock-' + c, dock === c);
  b.toggle('bar-bottom', pos === 'bottom'); b.toggle('bar-left', pos === 'left');
  b.toggle('bar-center', align === 'center'); b.toggle('bar-pill', style === 'pill'); b.toggle('bar-circle', style === 'circle');
  nextTick(placeInkSoon);
}, { immediate: true });
// the name opens out over 300 ms: a ResizeObserver on the tabs keeps the pill hugging it every frame
function placeInkSoon() { placeInk(); for (const t of [120, 320]) setTimeout(placeInk, t); }
const inkWatch = typeof ResizeObserver === 'function' ? new ResizeObserver(() => placeInk()) : null;
watch(tabsEl, (nav) => { inkWatch?.disconnect(); if (nav) { inkWatch?.observe(nav); for (const b of nav.querySelectorAll('.tab')) inkWatch?.observe(b); } });
const activeTab = computed(() => {
  const n = store.route.name;
  if (tabs.value.find((t) => t.name === n)) return n;
  return store.history.find((h) => tabs.value.find((t) => t.name === h.name))?.name || '';
});
const activeDl = computed(() => store.downloads.filter((d) => d.status === 'downloading' || d.status === 'queued'));
const dlPct = computed(() => {
  const t = activeDl.value.reduce((s, d) => s + (d.total || 0), 0);
  const r = activeDl.value.reduce((s, d) => s + (d.received || 0), 0);
  return t ? Math.floor((r / t) * 100) : 0;
});
const syncBusy = computed(() => ['running', 'scanning'].includes(store.sync.state));
const syncPct = computed(() => { const s = store.sync; return s.state === 'running' && s.total ? Math.max(4, Math.min(100, ((s.done + 1) / s.total) * 100)) : null; });
// the ring closes and shows a tick for a moment after the sync, instead of vanishing mid-arc
const syncEnding = ref(false);
let syncEndT;
watch(syncBusy, (v, was) => { clearTimeout(syncEndT); if (v) syncEnding.value = false; else if (was) { syncEnding.value = true; syncEndT = setTimeout(() => (syncEnding.value = false), 900); } });
const syncLabel = computed(() => {
  const s = store.sync;
  if (s.state === 'scanning') return (s.label || 'Scanning server').slice(0, 42);
  return s.total ? `Syncing ${s.done + 1}/${s.total}` : 'Syncing…';
});

// clock + battery (the Deck reports battery through Chromium)
const clock = ref('');
const battery = ref(null);
const batteryIcon = computed(() => {
  const b = battery.value; if (!b) return 'mdiBattery';
  if (b.charging) return 'mdiBatteryCharging';
  const lvl = Math.round(b.level / 10) * 10;
  return lvl >= 100 ? 'mdiBattery' : lvl <= 10 ? 'mdiBatteryAlertVariantOutline' : `mdiBattery${lvl}`;
});
let clockT;
function tick() { clock.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

function cycleTab(dir) {
  const list = tabs.value;
  if (!list.length) return; // nothing to switch to yet (still starting)
  const i = list.findIndex((t) => t.name === activeTab.value);
  // on a page whose tab is switched off, RT goes to the first tab and LT to the last
  tab(list[i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length].name);
}
function viewHandler(action) {
  const h = store.viewHandlers[action];
  return h ? h() : false;
}

watch([() => activeTab.value, () => tabs.value.length, padMode], () => nextTick(() => { placeInkSoon(); if (inkWatch && tabsEl.value) for (const b of tabsEl.value.querySelectorAll('.tab')) inkWatch.observe(b); }));
window.addEventListener('resize', () => nextTick(placeInk));
onMounted(async () => {
  // 0.9.38 (owner: LT/RT still dead at launch until another button): the app's own layer (LT/RT, Start, Y...)
  // was added only after the config and the whole library had loaded, seconds on a big library, so a
  // trigger pulled before then had nothing to go to; other buttons still moved focus on their own
  pushLayer(document.body, {
    back: () => { if (viewHandler('back') !== false) return; back(); },
    // Bumpers only switch sections inside a page (Achievements, consoles, collections). Top tabs are LT / RT.
    lb: () => { viewHandler('lb'); },
    rb: () => { viewHandler('rb'); },
    y: () => (viewHandler('y') !== false ? undefined : focusSearch()),
    accept: (a) => (a === searchEl.value ? toResults() : viewHandler('accept')),
    hold: () => viewHandler('hold'),
    // the page can take the D-pad over (0.9.19: Start moves a picked-up tile); otherwise focus moves
    up: () => viewHandler('up'), down: () => viewHandler('down'), left: () => viewHandler('left'), right: () => viewHandler('right'),
    x: () => viewHandler('x'),
    rsleft: () => { viewHandler('rsleft'); }, rsright: () => { viewHandler('rsright'); }, // right stick: Start's pages
    // Triggers always move between the top tabs; bumpers belong to the page (consoles, collections)
    lt: () => (viewHandler('lt') !== false ? undefined : cycleTab(-1)), // a page can keep LT/RT (0.9.24: Start's page overview)
    rt: () => (viewHandler('rt') !== false ? undefined : cycleTab(1)),
    select: () => (viewHandler('select') !== false ? undefined : tab('downloads')),
    // the keyboard's own (0.9.37): Ctrl+F or / searches from anywhere, 1 to 9 jump to a tab, F1 or ? lists the keys
    search: () => focusSearch(),
    help: () => keysHelp(),
    ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ['tab' + n, () => { const t = tabs.value[n - 1]; if (t) tab(t.name); }])),
    start: () => { if (viewHandler('start') !== false) return; store.quickMenu = !store.quickMenu; },
  });
  tick(); clockT = setInterval(tick, 10000);
  navigator.getBattery?.().then((b) => {
    const upd = () => { battery.value = b.level === 1 && b.charging && !b.dischargingTime ? null : { level: Math.round(b.level * 100), charging: b.charging }; };
    // desktops report a permanently full "battery"; hide it there
    if (!(b.level === 1 && b.charging && b.chargingTime === 0)) { upd(); b.onlevelchange = upd; b.onchargingchange = upd; }
  }).catch(() => {});
  await loadConfig();
  setSoundEnabled(store.config.ui.sounds !== false);
  setSoundStyle(store.config.ui.soundPack, store.config.ui.volume);
  setRumble(store.config.ui.rumble);
  applyTheme(store.config.ui);
  detectPad();
  // Game Mode (0.9.24, owner: touch still showed a cursor): the screen's touches arrive as a mouse there and
  // nobody uses a mouse in Game Mode, so Auto means Touch: no cursor, and drags scroll
  setPointerPref(store.config.ui.pointer || (store.info?.gamescope ? 'touch' : 'auto'));
  // 0.9.28 (owner: Home flashed before Start): the opening page is picked before the library loads, not after
  {
    const ui0 = store.config.ui, first = ui0.openOn || 'start';
    if (store.route.name === 'home') store.route = { name: activeTabs().includes(first) || (first === 'start' && !ui0.startAdded) ? first : activeTabs()[0], params: {} };
  }
  await loadLibrary();
  loadArt();
  // 0.9.19: Start joins the top bar once for people who had picked their own tabs
  const ui = store.config.ui;
  if (!ui.startAdded) { const t = Array.isArray(ui.tabs) && ui.tabs.length ? (ui.tabs.includes('start') ? ui.tabs : ['start', ...ui.tabs]) : undefined; saveConfig({ ui: { startAdded: Date.now(), ...(t ? { tabs: t } : {}) } }); }
  // the menu Cartridge opens on (Look & Feel → Open on, 0.9.19); one taken off the top bar: the first tab
  const openOn = ui.openOn || 'start'; // 0.9.23 (owner): Start by default
  if (store.route.name === 'home' && openOn !== 'home') tab(activeTabs().includes(openOn) ? openOn : activeTabs()[0]);
  // opened from a Steam shortcut whose game is gone (--game <id>), or a second launch handing over
  const openGame = (id) => { if (id && store.lib) { store.quickMenu = false; go('game', { romId: Number(id) }); } };
  call('app:startGame').then(openGame).catch(() => {});
  window.cart.on('open-game', openGame);
  // another app in front in Game Mode (0.9.21, owner: still laggy in the background): gamescope never
  // hides or blurs the window, so stop the pad, the animated background and every CSS animation here
  window.cart.on('game-run', (g) => gameEnded(g?.state === 'ended'));
  window.cart.on('background', (b) => { setBackground(b?.away); governorAway(b?.away); store.away = !!b?.away; document.body.classList.toggle('away', !!b?.away); });
  // background jobs (0.9.32): what's running now, and every change after; the Downloads page lists them
  window.cart.on('bg-job', (j) => { if (j.gone) delete store.bgJobs[j.key]; else store.bgJobs[j.key] = j; });
  call('jobs:list').then((l) => { for (const j of l || []) store.bgJobs[j.key] = j; }).catch(() => {});
  window.cart.on('addon-progress', (m) => {
    if (!m?.key) return;
    store.addonJobs[m.key] = { ...(store.addonJobs[m.key] || {}), ...m, at: Date.now() };
    if (m.state === 'done' || m.state === 'error') setTimeout(() => { if (store.addonJobs[m.key]?.state === m.state) delete store.addonJobs[m.key]; }, 12000);
  });
  window.cart.on('toast', (t) => t?.text && toast(t.text, t.kind || 'info', 4500, t.icon));
  // Cartridge Save Sync in the background (0.9.51): a word when saves moved after a game, and when two devices
  // changed the same save (it waits for you in Settings → Saves and Sync)
  window.cart.on('savesync', (p) => {
    // away from the server (0.9.52): once, when the first save is held, and when they go up
    if (p?.state === 'held' && p.held && p.held.at - p.held.since < 2000) return toast('RomM can’t be reached from here. Your saves stay on this device and go up when it can.', 'info', 6000, 'mdiCloudOffOutline');
    if (p?.state === 'released') { const c = p.counts || {}; return toast(c.conflict ? `Back in touch with RomM. ${c.conflict === 1 ? 'A save' : `${c.conflict} saves`} changed on two devices: choose in Settings → Saves and Sync.` : `Back in touch with RomM${c.up ? `: ${c.up} ${c.up === 1 ? 'save' : 'saves'} sent` : ''}.`, c.conflict ? 'info' : 'ok', 5000, 'mdiCloudCheckOutline'); }
    if (p?.state !== 'done' || !['after', 'back', 'scheduled'].includes(p.why)) return;
    const c = p.counts || {};
    if (c.conflict) toast(`${c.conflict === 1 ? 'A save' : `${c.conflict} saves`} changed on two devices. Choose which to keep in Settings → Saves and Sync.`, 'info', 7000, 'mdiCallSplit');
    else if (c.up || c.down) toast([c.up && `${c.up} ${c.up === 1 ? 'save' : 'saves'} sent to RomM`, c.down && `${c.down} brought here`].filter(Boolean).join(' · '), 'ok', 3200, 'mdiCloudCheckOutline');
  });
  // main asks for a page (0.9.37: a download caught on an add-on site shows its progress in Downloads)
  window.cart.on('nav', (n) => { if (!n?.tab) return; if (n.closeModal && store.modal) { const r = store.modal.resolve; store.modal = null; try { r?.(null); } catch {} } tab(n.tab); });
  setTimeout(steamReport, 2500);
  // 0.9: a new install goes through emulator Setup once, after connecting to RomM (the welcome does it since 0.9.15)
  if (store.config.configured && !store.config.setupDone && !store.welcoming) go('emu-setup', { first: true });
  // a hello with the name from the welcome
  const nm = (store.config.ui.name || '').trim();
  if (nm && store.config.configured && !store.welcoming) { const h = new Date().getHours(); setTimeout(() => sayHello(`Good ${h < 5 || h >= 18 ? 'evening' : h < 12 ? 'morning' : 'afternoon'}, ${nm}`), 1200); }
  // anything waiting for you (a moved emulator, games out of their collections, missing BIOS) shows as
  // a dot on Settings and a list in Settings → Emulators, not a pop-up (0.9.3)
  setTimeout(() => { if (store.config.configured) call('issues:list').then((l) => (store.issues = l.length)).catch(() => {}); }, 8000);
  setTimeout(setupNotice, 3500);
  gpuCheck();
  if (store.config.configured) call('server:status').then((c) => (store.connection = c)).catch(() => {});
});
// connected for the first time (the RomM step just finished): emulators next
watch(() => store.config?.configured, (v, was) => { if (v && !was && !store.config.setupDone && !store.welcoming) go('emu-setup', { first: true }); });
// People who set up before 0.9 skipped Emulator setup: tell them about it once
// GPU Always (0.9.29): the first start with it asks whether it looks right. No answer (a blank window)
// and main goes back to Auto by itself after 25 s.
async function gpuCheck() {
  const g = await call('app:graphics').catch(() => null);
  if (!g?.trial) return;
  const v = await choose({ title: 'Is Cartridge Drawing Correctly?', message: 'Cartridge is using the GPU in Game Mode. If anything looks wrong, go back. With no answer it goes back to Auto by itself in a few seconds.', options: [
    { label: 'Keep GPU Always', value: 'keep', icon: 'mdiCheck' },
    { label: 'Go Back to Auto', value: 'auto', icon: 'mdiRestore' },
  ] });
  if (v === 'keep') { await call('app:gpuKeep', { keep: true }); store.config.gpuKept = true; toast('GPU Always kept', 'ok', 2500, 'mdiCheck'); }
  else if (v === 'auto') call('app:gpuKeep', { keep: false });
}
async function setupNotice() {
  // 0.9.15: people who were set up before get the new welcome offered once (it includes the system scan)
  if (store.config?.configured && !store.config.welcomed && !store.config.ui.welcomeNotice && !store.modal && !store.welcoming) {
    saveConfig({ ui: { welcomeNotice: Date.now(), setupNotice: store.config.ui.setupNotice || Date.now() } });
    const w = await choose({ title: 'New: a Fresh Welcome and System Scan', message: 'Take a look? It starts from your current settings: nothing is reset or signed out, and you can leave at any point.\n\nIt\'s always in Settings → About.', options: [
      { label: 'Take a look', value: 'go', icon: 'mdiHandWave' },
      { label: 'Not now', value: 'later', icon: 'mdiClockOutline' },
    ] });
    if (w === 'go') store.welcoming = true;
    return;
  }
  if (store.config?.setupDone !== 'before 0.9' || store.config.ui.setupNotice || store.modal) return;
  saveConfig({ ui: { setupNotice: Date.now() } });
  const v = await choose({ title: 'New: Emulator setup', message: 'Cartridge can now find your emulators wherever they are, even renamed AppImages, and check each console before its games go into Steam: the emulator, its launch options, BIOS and folder access.\n\nIt’s always in Settings → Emulators.', options: [
    { label: 'Open Emulator setup', value: 'open', icon: 'mdiRadar' },
    { label: 'Later', value: 'later', icon: 'mdiClockOutline' },
  ] });
  if (v === 'open') go('emu-setup');
}
onBeforeUnmount(() => clearInterval(clockT));

watch(() => store.config?.ui && JSON.stringify(store.config.ui), () => { applyTheme(store.config.ui); setSoundStyle(store.config.ui.soundPack, store.config.ui.volume); setRumble(store.config.ui.rumble); });

// sync result toasts
watch(() => store.sync, (s) => {
  if (s.state === 'done') {
    if (s.firstSync) toast(`Library synced · ${s.total} games`, 'ok', 3400, 'mdiSync');
    else if (s.added) { toast(`${s.added} new game${s.added > 1 ? 's' : ''} from your server`, 'ok', 5000, 'mdiNewBox'); sfx.done(); }
    else if (store.manualSync) toast('Library is up to date', 'ok', 2400, 'mdiSync');
    store.manualSync = false;
  } else if (s.state === 'error' && store.manualSync) { store.manualSync = false; }
});
// finished downloads chime (once per download)
const announced = new Set();
let dlPrimed = false;
watch(() => store.downloads.map((d) => d.id + d.status).join(), () => {
  for (const d of store.downloads) {
    if (d.status !== 'done' || announced.has(d.id)) continue;
    announced.add(d.id);
    if (dlPrimed) {
      if (d.notice === 'stale') toast(`${d.name} is ready. RomM's checksum for it looks out of date, so a rescan in RomM would fix that.`, 'info', 6000, 'mdiCheckCircle');
      else if (d.notice === 'pkg') toast(`${d.name} is downloaded. Open it and press Install in ${d.installIn || 'RPCS3'} to play it.`, 'ok', 6000, 'mdiPackageDown');
      else toast(`${d.name} is ready to play`, 'ok', 3800, 'mdiCheckCircle');
      sfx.done();
    }
  }
  dlPrimed = true;
});

// focus management on view change
watch(viewKey, async () => {
  store.viewHandlers = {};
  await nextTick();
  if (document.activeElement === searchEl.value) return;
  const key = store.route.focusKey;
  const root = mainEl.value;
  if (!root) return;
  if (key) {
    for (let i = 0; i < 30; i++) {
      const el = root.querySelector(`[data-key="${CSS.escape(key)}"]`);
      if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center', inline: 'center' }); return; }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  focusFirst(root);
});

// every key and mouse button, one list (0.9.37, owner: overhaul keyboard and mouse controls)
function keysHelp() {
  const K = [
    ['Arrow Keys', 'Move around'], ['Enter or Space', 'Select (A); hold for more'], ['Escape, Backspace or Alt+Left', 'Back (B)'],
    ['Tab and Shift+Tab', 'Next and previous thing on screen'], ['Ctrl+Tab, Page Up and Down', 'Switch tabs (LT and RT)'], ['1 to 9', 'Jump to a tab'],
    ['Q and E', 'Sections inside a page (LB and RB)'], ['X', 'Download, or the page’s main action'], ['Y', 'Search, or More on a game'],
    ['Ctrl+F or /', 'Search from anywhere'], ['Ctrl+J', 'Downloads (Select)'], ['M', 'Quick Menu (Start)'], ['Home and End', 'First and last in a list'],
    ['Right-click a game', 'Its quick actions'], ['Mouse back button', 'Back'], ['F1 or ?', 'This list'],
  ];
  choose({ title: 'Keyboard and Mouse', message: 'A controller, the keyboard, a mouse and touch all work everywhere, and you can switch any time.', options: K.map(([k, d]) => ({ label: k, sub: d, value: null, raw: true })) });
}
// right-click a game card (0.9.37): its quick actions where the pointer is
async function cardMenu(e) {
  const card = e.target.closest?.('.card[data-key^="rom-"]');
  if (!card || e.defaultPrevented) return;
  e.preventDefault();
  const rom = romById(Number(card.dataset.key.slice(4)));
  if (!rom) return;
  card.focus({ preventScroll: true });
  const here = !!store.installed?.[rom.id], fav = isFavourite(rom.id);
  const v = await choose({ title: rom.name, options: [
    { label: 'Open', value: 'open', icon: 'mdiArrowRight' },
    here ? { label: 'Ready to Play', sub: 'Through Steam', value: 'play', icon: 'mdiPlay' } : { label: 'Download', value: 'dl', icon: 'mdiDownload' },
    { label: fav ? 'Remove from Favourites' : 'Add to Favourites', value: 'fav', icon: fav ? 'mdiHeart' : 'mdiHeartOutline' },
  ] });
  if (v === 'open') go('game', { romId: rom.id });
  else if (v === 'dl') download(rom);
  else if (v === 'play') playGame(rom.id).catch((err) => toast(err.message, 'error', 5000));
  else if (v === 'fav') call('fav:set', { romId: rom.id, on: !fav }).then(() => toast(fav ? 'Removed from favourites' : 'Added to favourites', 'ok', 2200, 'mdiHeartOutline')).catch((err) => toast(err.message, 'error', 6000));
}
onMounted(() => document.addEventListener('contextmenu', cardMenu));
// where a pop-up came from (0.9.37): the focused or pressed thing when it opened, read before it takes focus
let modalTrigger = null;
watch(() => store.modal, (m, was) => { if (m && !was) { const r = document.activeElement?.getBoundingClientRect?.(); modalTrigger = r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; } }, { flush: 'pre' });
// 0.9.41 (owner: the More sheet popped out twice): a dialog's own entry animation (pop, sheet-up) is held off only while
// the pop-up transition runs; when its classes came off, that animation started and the sheet arrived a second time.
// Marked once in, it never plays
function modalIn(el) { el.classList?.add('modal-in'); }
function modalFrom(el) {
  const d = el.querySelector?.('.dialog, .sheet, .menu, .m-sheet') || el.firstElementChild;
  if (!d || !modalTrigger) return;
  const r = d.getBoundingClientRect(), w = r.width || 1, h = r.height || 1;
  // the origin is the trigger, kept within reach of the box so the scale reads as coming from it, not flying in
  const ox = Math.max(-0.25 * w, Math.min(1.25 * w, modalTrigger.x - r.left)), oy = Math.max(-0.25 * h, Math.min(1.25 * h, modalTrigger.y - r.top));
  d.style.transformOrigin = `${ox}px ${oy}px`;
}
</script>

<style scoped>
/* the hello in the Dock's gap (0.9.49): it opens from the logo while its letters rise in (as the opening's name), holds,
   then the letters drop and it closes back into the logo */
.brand { position: relative; }
.greet { position: absolute; left: calc(100% + 14px); top: 50%; display: flex; white-space: nowrap; overflow: hidden; translate: 0 -50%; font-family: var(--display); font-size: var(--t-md); font-weight: 700; letter-spacing: -0.01em; color: var(--text); pointer-events: none;
  clip-path: inset(-20% 100% -20% 0); animation: greet-open var(--spring-soft-d) var(--spring-soft) forwards; }
.greet span { opacity: 0; transform: translateY(12px); filter: blur(5px); animation: greet-char var(--spring-soft-d) var(--spring-soft) forwards; animation-delay: calc(0.12s + var(--i) * 0.035s); }
.greet.out { animation: greet-close var(--d-slow) var(--ease-in) 0.25s forwards; clip-path: inset(-20% 0 -20% 0); }
.greet.out span { opacity: 1; transform: none; filter: none; animation: greet-drop var(--d-slow) var(--ease-in) forwards; animation-delay: calc(var(--i) * 0.012s); }
@keyframes greet-open { to { clip-path: inset(-20% 0 -20% 0); } }
@keyframes greet-close { to { clip-path: inset(-20% 100% -20% 0); } }
@keyframes greet-char { to { opacity: 1; transform: none; filter: none; } }
@keyframes greet-drop { to { opacity: 0; transform: translateY(8px); filter: blur(4px); } }

.tab-trig { margin: 0 4px; }
/* search (0.9.19): a round button with Y until it's used, then it opens into a field */
.top-search { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; width: 40px; height: 40px; padding: 0 10px 0 11px; border-radius: 20px; background: rgba(255, 255, 255, 0.07); color: rgba(255, 255, 255, 0.7); cursor: text; overflow: hidden; transition: width var(--spring-d) var(--spring), background var(--tint), color var(--tint); }
.top-search:hover { background: rgba(255, 255, 255, 0.11); }
/* a round button with the mouse or touch; room for the Y hint with a controller */
:global(body.pad-mode .top-search:not(.open):not(:focus-within)) { width: 70px; }
/* closed (0.9.21, owner: it looked off): no pill, the magnifier like the tab icons and the Y hint like
   LT/RT; the field keeps no space; it opens into the pill as before */
.top-search:not(.open):not(:focus-within) { gap: 0; background: transparent; color: rgba(255, 255, 255, 0.5); padding: 0 10px; }
.top-search:not(.open):not(:focus-within):hover { background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.86); }
.top-search:not(.open):not(:focus-within) :deep(.pb) { margin-left: 8px; transform: scale(0.88); opacity: 0.55; }
.top-search.open, .top-search:focus-within { width: min(300px, 26vw); background: rgba(255, 255, 255, 0.14); color: var(--text); }
.top-search:not(.open):not(:focus-within) input { width: 0; flex: 0; opacity: 0; }
.top-search:focus-within { box-shadow: 0 0 0 2px var(--focus, #fff); }
.top-search input { flex: 1; min-width: 0; height: 100%; font: inherit; font-size: var(--t-sm); color: var(--text); background: none; border: 0; outline: none; }
.top-search input:focus { box-shadow: none !important; }
.top-search input::placeholder { color: rgba(255, 255, 255, 0.5); }
.top-search .clear { background: none; border: 0; color: var(--muted); padding: 4px; display: grid; place-items: center; }
.top-search :deep(.pb) { transform: scale(0.85); opacity: 0.8; }
.backbtn { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: rgba(255, 255, 255, 0.08); margin-right: -4px; transition: background var(--tint); }
.backbtn:hover { background: rgba(255, 255, 255, 0.14); }
.backbtn:active { background: rgba(255, 255, 255, 0.2); transform: scale(0.96); }
.pops { position: fixed; top: 76px; right: 24px; z-index: 80; display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
.pop { display: flex; gap: 14px; align-items: center; width: 380px; padding: 12px 16px 12px 12px; border-radius: var(--r-lg); background: rgba(18, 20, 32, 0.92); box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.12); }
.pop-icon { width: 60px; height: 60px; border-radius: var(--r-md); overflow: hidden; flex: none; display: grid; place-items: center; background: rgba(0, 0, 0, 0.35); }
.pop-icon img { width: 100%; height: 100%; object-fit: cover; }
.pop-body { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.pop-kind { display: flex; gap: 6px; align-items: center; font-size: var(--t-xs); letter-spacing: 0.04em; color: #cfd6e4; }
.pop-name { font-family: var(--display); font-weight: 700; font-size: var(--t-md);  overflow-wrap: anywhere; }
.pop-game { font-size: var(--t-xs); color: var(--muted);  overflow-wrap: anywhere; }
.pop-enter-active, .pop-leave-active { transition: opacity var(--fade-slow), transform var(--spring-d) var(--spring); }
.pop-enter-from { opacity: 0; transform: translateX(40px); }
.pop-leave-to { opacity: 0; transform: translateY(-12px); }
.steam-ring { position: relative; flex: none; width: 30px; height: 30px; padding: 0; display: grid; place-items: center; }
.steam-ring .sr-ring { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
.sr-arc { fill: none; stroke: var(--text); stroke-width: 3; stroke-linecap: round; transition: stroke-dasharray var(--fade-slow); }
.steam-ring.wait .sr-ring { animation: sr-spin var(--loop-spin) infinite; }
@keyframes sr-spin { to { transform: rotate(270deg); } }
.sr-logo { opacity: 0.9; }
/* the sync ring (0.9.38): the Steam ring's look, its arc on the spring; done = a tick, then it settles away */
.sync-ring .sr-arc { transition: stroke-dasharray var(--spring-soft-d, 600ms) var(--spring-soft, var(--ease-out)); }
.sync-ring .sr-logo { transition: transform var(--spring-d, 300ms) var(--spring-bounce, var(--ease-out)); }
.sync-ring.done .sr-logo { transform: scale(1.12); }
.ring-out-enter-active { transition: opacity var(--fade-in), transform var(--spring-d, 300ms) var(--spring, var(--ease-out)); }
.ring-out-leave-active { transition: opacity var(--fade-slow), transform var(--spring-d) var(--spring); }
.ring-out-enter-from, .ring-out-leave-to { opacity: 0; transform: scale(0.7); }
</style>
