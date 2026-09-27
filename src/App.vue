<template>
  <Background v-if="store.config" />
  <div v-if="!store.config" class="center" style="height: 100%"><div class="spinner" /></div>
  <Setup v-else-if="!store.config.configured || store.route.name === 'setup'" />
  <div v-else class="shell" :style="{ '--card-w': cardW }">
    <header class="statusbar">
      <div class="brand"><Logo :size="30" />Cartridge</div>
      <nav class="tabs">
        <Btn b="LB" style="margin: 0 4px" />
        <button v-for="t in tabs" :key="t.name" class="tab" :class="{ active: activeTab === t.name }" @click="tab(t.name)">
          <Icon :name="t.icon" :size="18" />{{ t.label }}
          <span v-if="t.name === 'downloads' && activeDl.length" class="tab-badge">{{ activeDl.length }}</span>
        </button>
        <Btn b="RB" style="margin: 0 4px" />
      </nav>
      <div class="spacer" />
      <div class="sys">
        <div v-if="syncBusy" class="item sync-pill"><Icon name="mdiSync" :size="16" class="spin" />{{ syncLabel }}</div>
        <div v-if="activeDl.length" class="item">
          <svg width="22" height="22" viewBox="0 0 36 36" class="ring"><circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="4" /><circle cx="18" cy="18" r="15" fill="none" stroke="url(#rg)" stroke-width="4" stroke-linecap="round" :stroke-dasharray="`${dlPct * 0.943} 100`" transform="rotate(-90 18 18)" /><defs><linearGradient id="rg"><stop offset="0" stop-color="#a18fff" /><stop offset="1" stop-color="#e1a38d" /></linearGradient></defs></svg>
          {{ dlPct }}%
        </div>
        <div class="item" :title="store.connection.base"><span class="dot" :class="store.connection.route === 'local' ? 'ok' : store.connection.base ? 'remote' : 'bad'" />{{ store.connection.route === 'local' ? 'LAN' : store.connection.base ? 'Tunnel' : 'Offline' }}</div>
        <div v-if="battery" class="item"><Icon :name="batteryIcon" :size="18" />{{ battery.level }}%</div>
        <div class="clock">{{ clock }}</div>
      </div>
    </header>
    <main class="main" ref="mainEl">
      <component :is="views[store.route.name]" :key="viewKey" v-bind="store.route.params" />
    </main>
    <footer class="hintbar">
      <div class="left"><Btn b="START" />Menu<Btn b="SELECT" style="margin-left: 10px" />Downloads</div>
      <span v-for="h in store.hints" :key="h.b + h.label" class="hint"><Btn :b="h.b" />{{ h.label }}</span>
    </footer>
  </div>

  <QuickMenu v-if="store.quickMenu" />
  <Keyboard v-if="store.modal?.type === 'keyboard'" v-bind="store.modal.props" />
  <FolderPicker v-if="store.modal?.type === 'folder'" v-bind="store.modal.props" />
  <Menu v-if="store.modal?.type === 'menu'" v-bind="store.modal.props" />

  <div class="toasts" :class="{ shifted: store.quickMenu }">
    <div v-for="t in store.toasts" :key="t.id" class="toast" :class="t.kind"><span class="ti"><Icon :name="t.icon" :size="18" /></span>{{ t.msg }}</div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue';
import { store, loadConfig, loadLibrary, back, tab, go, call, toast } from './store.js';
import { pushLayer, focusFirst } from './nav.js';
import { setSoundEnabled, sfx } from './sfx.js';
import Icon from './components/Icon.vue';
import Btn from './components/Btn.vue';
import Logo from './components/Logo.vue';
import Background from './components/Background.vue';
import QuickMenu from './components/QuickMenu.vue';
import Keyboard from './components/Keyboard.vue';
import FolderPicker from './components/FolderPicker.vue';
import Menu from './components/Menu.vue';
import Setup from './views/Setup.vue';
import Home from './views/Home.vue';
import Gallery from './views/Gallery.vue';
import Consoles from './views/Consoles.vue';
import Game from './views/Game.vue';
import Downloads from './views/Downloads.vue';
import Settings from './views/Settings.vue';
import Search from './views/Search.vue';

const views = { home: Home, library: Gallery, consoles: Consoles, platform: Gallery, collection: Gallery, game: Game, downloads: Downloads, settings: Settings, search: Search };
const tabs = [
  { name: 'home', label: 'Home', icon: 'mdiHomeVariantOutline' },
  { name: 'library', label: 'Library', icon: 'mdiViewGridOutline' },
  { name: 'consoles', label: 'Consoles', icon: 'mdiGamepadSquareOutline' },
  { name: 'downloads', label: 'Downloads', icon: 'mdiTrayArrowDown' },
  { name: 'settings', label: 'Settings', icon: 'mdiCogOutline' },
];
const mainEl = ref(null);
const viewKey = computed(() => store.route.name + JSON.stringify(store.route.params));
const cardW = computed(() => ({ sm: '138px', md: '164px', lg: '200px' }[store.config.ui.gridSize] || '164px'));
const activeTab = computed(() => {
  const n = store.route.name;
  if (tabs.find((t) => t.name === n)) return n;
  return store.history.find((h) => tabs.find((t) => t.name === h.name))?.name || '';
});
const activeDl = computed(() => store.downloads.filter((d) => d.status === 'downloading' || d.status === 'queued'));
const dlPct = computed(() => {
  const t = activeDl.value.reduce((s, d) => s + (d.total || 0), 0);
  const r = activeDl.value.reduce((s, d) => s + (d.received || 0), 0);
  return t ? Math.floor((r / t) * 100) : 0;
});
const syncBusy = computed(() => ['running', 'scanning'].includes(store.sync.state));
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
  const i = Math.max(0, tabs.findIndex((t) => t.name === activeTab.value));
  tab(tabs[(i + dir + tabs.length) % tabs.length].name);
}
function viewHandler(action) {
  const h = store.viewHandlers[action];
  return h ? h() : false;
}

onMounted(async () => {
  tick(); clockT = setInterval(tick, 10000);
  navigator.getBattery?.().then((b) => {
    const upd = () => { battery.value = b.level === 1 && b.charging && !b.dischargingTime ? null : { level: Math.round(b.level * 100), charging: b.charging }; };
    // desktops report a permanently full "battery"; hide it there
    if (!(b.level === 1 && b.charging && b.chargingTime === 0)) { upd(); b.onlevelchange = upd; b.onchargingchange = upd; }
  }).catch(() => {});
  await loadConfig();
  setSoundEnabled(store.config.ui.sounds !== false);
  await loadLibrary();
  if (store.config.configured) call('server:status').then((c) => (store.connection = c)).catch(() => {});
  pushLayer(document.body, {
    back: () => { if (viewHandler('back') !== false) return; back(); },
    lb: () => (viewHandler('lb') !== false ? undefined : cycleTab(-1)),
    rb: () => (viewHandler('rb') !== false ? undefined : cycleTab(1)),
    y: () => (viewHandler('y') !== false ? undefined : store.route.name !== 'search' && go('search')),
    x: () => viewHandler('x'),
    lt: () => viewHandler('lt'),
    rt: () => viewHandler('rt'),
    select: () => (viewHandler('select') !== false ? undefined : tab('downloads')),
    start: () => { store.quickMenu = !store.quickMenu; },
  });
});
onBeforeUnmount(() => clearInterval(clockT));

// sync result toasts
watch(() => store.sync, (s) => {
  if (s.state === 'done') {
    if (s.firstSync) toast(`Library synced · ${s.total} games`, 'ok', 3400, 'mdiSync');
    else if (s.added) { toast(`${s.added} new game${s.added > 1 ? 's' : ''} from your server`, 'ok', 5000, 'mdiNewBox'); sfx.done(); }
    else if (store.manualSync) toast('Library is up to date', 'ok', 2400, 'mdiSync');
    store.manualSync = false;
  } else if (s.state === 'error' && store.manualSync) { store.manualSync = false; }
});
// finished downloads chime
watch(() => store.downloads.filter((d) => d.status === 'done').length, (n, o) => {
  if (n > (o || 0)) { const d = store.downloads.filter((x) => x.status === 'done').at(-1); toast(`${d?.name} is ready to play`, 'ok', 3800, 'mdiCheckCircle'); sfx.done(); }
});

// focus management on view change
watch(viewKey, async () => {
  store.viewHandlers = {};
  await nextTick();
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
</script>

<style scoped>
.tab-badge { position: absolute; top: 2px; right: 6px; min-width: 16px; height: 16px; border-radius: 8px; background: var(--peach); color: #1a1022; font-size: 10px; font-weight: 700; display: grid; place-items: center; padding: 0 4px; }
.sync-pill { padding: 5px 12px; border-radius: 999px; background: rgba(139, 116, 232, 0.18); color: #cfc4ff; }
</style>
