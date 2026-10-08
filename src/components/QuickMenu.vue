<template>
  <div class="qm-scrim" @click.self="close">
    <!-- 0.9.49 (owner: the Quick Menu "feels left behind"): a floating panel like the Dock and the sheets, with the time,
         where you are connected, the library and downloads at a glance, quick switches, then the actions -->
    <aside class="qm" ref="el" aria-label="Quick Menu">
      <header class="qm-head">
        <Logo :size="30" />
        <div class="qm-hl">
          <div class="qm-title">Quick Menu</div>
          <div class="qm-net" :class="net.cls"><Icon :name="net.icon" :size="15" />{{ net.label }}</div>
        </div>
        <div class="qm-clock">{{ clock }}</div>
      </header>

      <button v-if="store.update.state === 'ready'" class="qm-item upd" data-focus data-autofocus @click="call('update:install')"><Icon name="mdiUpdate" :size="22" /><div><b>Restart to Update</b><small>Cartridge {{ store.update.version }} is downloaded</small></div></button>

      <div class="qm-stats">
        <button class="qm-stat" data-focus :disabled="busy" :data-autofocus="store.update.state === 'ready' ? undefined : ''" @click="run(refreshLibrary)">
          <span class="qm-stat-top"><Icon name="mdiSync" :size="18" :class="{ spin: busy }" />Library</span>
          <b>{{ total.toLocaleString() }}</b>
          <small>{{ busy ? store.sync.label || 'Syncing' : `${systems} systems · synced ${ago(store.lib?.syncedAt)}` }}</small>
        </button>
        <button class="qm-stat" data-focus @click="nav('downloads')">
          <span class="qm-stat-top"><Icon name="mdiDownload" :size="18" />Downloads</span>
          <b>{{ activeCount || 'None' }}</b>
          <small>{{ activeCount ? (dlPct != null ? `${dlPct}% of the current one` : 'waiting') : 'Queue and history' }}</small>
          <i v-if="activeCount && dlPct != null" class="qm-bar"><i :style="{ width: dlPct + '%' }" /></i>
        </button>
      </div>

      <div class="qm-quick">
        <button class="qm-tog" data-focus :aria-pressed="!!store.config.ui.sounds" @click="toggleSounds"><Icon :name="store.config.ui.sounds ? 'mdiVolumeHigh' : 'mdiVolumeOff'" :size="22" /><span>Sounds</span></button>
        <button class="qm-tog" data-focus :aria-pressed="!!store.config.ui.perfOverlay" @click="togglePerf"><Icon name="mdiSpeedometer" :size="22" /><span>Performance</span></button>
        <button class="qm-tog" data-focus @click="shot"><Icon name="mdiCamera" :size="22" /><span>Screenshot</span></button>
        <button class="qm-tog" data-focus @click="call('app:fullscreen')"><Icon name="mdiFullscreen" :size="22" /><span>Fullscreen</span></button>
      </div>

      <div class="qm-list">
        <button class="qm-item" data-focus @click="rescan"><Icon name="mdiHarddisk" :size="22" /><div><b>Rescan This Device</b><small>Refresh which games are installed</small></div></button>
        <button class="qm-item" data-focus @click="checkUpdate"><Icon name="mdiCloudDownloadOutline" :size="22" /><div><b>Check for Updates</b><small>{{ updLabel }}</small></div></button>
        <button class="qm-item" data-focus @click="nav('settings')"><Icon name="mdiCog" :size="22" /><div><b>Settings</b><small>Library, emulators, Steam, look</small></div></button>
      </div>

      <button class="qm-item quit" data-focus @click="call('app:quit')"><Icon name="mdiPower" :size="22" /><div><b>Quit Cartridge</b></div></button>
    </aside>
  </div>
</template>
<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { store, call, refreshLibrary, tab, ago, saveConfig, toast } from '../store.js';
import { pushLayer, focusFirst } from '../nav.js';
import { setSoundEnabled } from '../sfx.js';
import Icon from './Icon.vue';
import Logo from './Logo.vue';

const el = ref(null);
const busy = computed(() => ['running', 'scanning'].includes(store.sync.state));
const total = computed(() => (store.libVersion, store.lib ? Object.values(store.lib.roms).reduce((s, l) => s + l.length, 0) : 0));
const systems = computed(() => store.lib?.platforms.filter((p) => p.rom_count).length || 0);
const active = computed(() => store.downloads.filter((d) => ['queued', 'downloading'].includes(d.status)));
const activeCount = computed(() => active.value.length);
const dlPct = computed(() => { const d = active.value.find((x) => x.status === 'downloading'); return d && d.total ? Math.min(100, Math.round(((d.received || 0) / d.total) * 100)) : null; });
const net = computed(() => {
  const c = store.connection;
  if (!c.base) return { label: store.config.localOnly ? 'Without RomM' : 'Offline', icon: 'mdiCloudOffOutline', cls: 'off' };
  let host = ''; try { host = new URL(c.base).host; } catch {}
  return c.route === 'local' ? { label: `Home network · ${host}`, icon: 'mdiHomeOutline', cls: 'lan' } : { label: `Internet · ${host}`, icon: 'mdiEarth', cls: 'web' };
});
const fmt = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const clock = ref(fmt());
const tick = setInterval(() => (clock.value = fmt()), 10000);
const close = () => (store.quickMenu = false);
function run(fn) { close(); fn(); }
function nav(n) { close(); tab(n); }
const updLabel = computed(() => {
  const u = store.update;
  return { checking: 'Checking…', downloading: `Downloading ${u.version || ''} · ${u.percent || 0}%`, ready: `${u.version} ready`, current: `Up to date · ${store.info.version}`, error: 'Could not check' }[u.state] || `Version ${store.info.versionName || store.info.version}`;
});
async function checkUpdate() { try { await call('update:check'); } catch (e) { toast(e.message, 'info', 3000); } }
async function shot() {
  close();
  await new Promise((r) => setTimeout(r, 450));
  try { const f = await call('app:screenshot'); toast(`Screenshot saved: ${f.split('/').pop()}`, 'ok', 3000, 'mdiCamera'); } catch (e) { toast(e.message, 'error'); }
}
async function rescan() { await call('installed:rescan'); toast('Device rescanned', 'ok', 2000, 'mdiHarddisk'); }
async function toggleSounds() { const v = !store.config.ui.sounds; await saveConfig({ ui: { sounds: v } }); setSoundEnabled(v); }
const togglePerf = () => saveConfig({ ui: { perfOverlay: !store.config.ui.perfOverlay } });
let layer;
onMounted(() => {
  layer = pushLayer(el.value, { back: close, start: close, lb() {}, rb() {}, x() {}, y() {}, select() {}, lt() {}, rt() {} });
  focusFirst(el.value);
});
onBeforeUnmount(() => { layer.pop(); clearInterval(tick); });
</script>
<style scoped>
.qm-scrim { position: fixed; inset: 0; z-index: 45; background: rgba(3, 4, 7, 0.45); animation: fade var(--fade-in); }
.qm { position: absolute; top: var(--s-4); right: var(--s-4); bottom: var(--s-4); width: min(420px, calc(100vw - 2 * var(--s-4))); padding: var(--s-4); display: flex; flex-direction: column; gap: var(--s-3); background: var(--s1); border-radius: var(--r-lg); box-shadow: var(--shadow-pop); animation: qm-in var(--spring-d) var(--spring); overflow-y: auto; overscroll-behavior: contain; }
@keyframes qm-in { from { transform: translateX(48px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .qm { animation: fade var(--fade-in); } }
.qm-head { display: flex; align-items: center; gap: var(--s-3); padding: 2px 4px var(--s-1); }
.qm-hl { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.qm-title { font-family: var(--display); font-weight: 600; font-size: var(--t-lg); line-height: 1.1; }
.qm-net { display: flex; align-items: center; gap: 5px; font-size: var(--t-xs); color: var(--muted); overflow-wrap: anywhere; }
.qm-net.off { color: var(--danger-t, #ffa39c); }
.qm-clock { font-family: var(--display); font-size: var(--t-xl); font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }

.qm-stats { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-2); }
.qm-stat { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; padding: var(--s-3); border-radius: var(--r-md); background: var(--s2); text-align: left; overflow: hidden; transition: background var(--d-fast), color var(--d-fast); }
.qm-stat-top { display: flex; align-items: center; gap: 6px; font-size: var(--t-xs); font-weight: 600; color: var(--muted); }
.qm-stat b { font-family: var(--display); font-size: var(--t-xl); font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.15; }
.qm-stat small { font-size: var(--t-xs); color: var(--muted); overflow-wrap: anywhere; }
.qm-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255, 255, 255, 0.08); }
.qm-bar i { display: block; height: 100%; background: var(--green, #2fb36a); transition: width var(--progress); }

.qm-quick { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--s-2); }
.qm-tog { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-width: 0; aspect-ratio: 1; padding: var(--s-2) 4px; border-radius: var(--r-md); background: var(--s2); font-size: var(--t-xs); font-weight: 600; color: var(--muted); transition: background var(--d-fast), color var(--d-fast); }
.qm-tog span { overflow-wrap: anywhere; text-align: center; line-height: 1.2; }
.qm-tog[aria-pressed='true'] { background: var(--sel-bg); box-shadow: var(--sel-under); color: var(--on-sel); }

.qm-list { display: flex; flex-direction: column; gap: 4px; }
.qm-item { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: var(--r-md); text-align: left; transition: background var(--d-fast), color var(--d-fast); }
.qm-item div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.qm-item b { font-weight: 600; font-size: var(--t-sm); }
.qm-item small { color: var(--muted); font-size: var(--t-xs); overflow-wrap: anywhere; }
.qm-item.quit { margin-top: auto; color: var(--danger-t, #ffa39c); }
.qm-item.upd { background: var(--grad); color: var(--on-primary); }
.qm-item.upd small { color: inherit; opacity: 0.8; }
:is(.qm-item, .qm-stat, .qm-tog):hover { background: var(--s3); }
:is(.qm-item, .qm-stat, .qm-tog):focus { background: var(--focus); color: var(--on-focus); box-shadow: none; }
:is(.qm-item, .qm-stat, .qm-tog):focus :is(small, .qm-stat-top) { color: var(--on-focus-dim); }
.qm-stat[disabled] { opacity: 0.6; }

/* Plain: a solid panel lit from above, raised tiles with a hairline edge (dark colours; Light and OLED have their own) */
:global(body.style-plain:not(.theme-light):not(.theme-oled) .qm) { box-shadow: var(--pl-top), var(--pl-edge), var(--shadow-pop); }
:global(body.style-plain:not(.theme-light):not(.theme-oled) :is(.qm-stat, .qm-tog):not(:focus)) { box-shadow: var(--pl-top), var(--pl-edge); }
/* Glass: the panel is a glass sheet (like the pop-ups); tiles sit on it as hairline glass, focus is lit glass */
:global(body.elements-glass .qm) { background: var(--lg-pane); -webkit-backdrop-filter: var(--lg-blur); backdrop-filter: var(--lg-blur); box-shadow: var(--lg-bevel), var(--lg-drop); }
:global(body.elements-glass :is(.qm-stat, .qm-tog, .qm-item):not(:focus)) { background: rgba(255, 255, 255, 0.035); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06); }
:global(body.elements-glass.theme-light :is(.qm-stat, .qm-tog, .qm-item):not(:focus)) { background: rgba(255, 255, 255, 0.4); box-shadow: inset 0 0 0 1px rgba(30, 30, 45, 0.06); }
:global(body.elements-glass .qm-item.quit:not(:focus)), :global(body.elements-glass .qm-list .qm-item:not(:focus)) { background: transparent; box-shadow: none; }
:global(body.elements-glass .qm-tog[aria-pressed='true']:not(:focus)) { background: var(--lg-sel); }
:global(body.elements-glass.theme-light .qm-tog[aria-pressed='true']:not(:focus)) { background: rgba(255, 255, 255, 0.9); }
:global(body.elements-glass :is(.qm-stat, .qm-tog, .qm-item):focus) { background: var(--lg-lit); color: var(--lg-on-lit); box-shadow: var(--lg-bevel), var(--lg-lit-glow); }
:global(body.elements-glass :is(.qm-stat, .qm-tog, .qm-item):focus :is(small, .qm-stat-top)) { color: color-mix(in srgb, var(--lg-on-lit) 74%, transparent); }
:global(body.elements-glass.light-fx .qm) { -webkit-backdrop-filter: none; backdrop-filter: none; }
</style>
