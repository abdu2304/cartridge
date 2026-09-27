<template>
  <div class="qm-scrim" @click.self="close">
    <aside class="qm" ref="el">
      <div class="qm-head">
        <Logo :size="34" />
        <div>
          <div class="qm-title">Quick Menu</div>
          <div class="muted" style="font-size: 12px">{{ store.connection.base || 'Offline' }}</div>
        </div>
      </div>
      <div class="qm-sync glass">
        <div class="row" style="justify-content: space-between">
          <span class="eyebrow">Library</span>
          <span class="muted" style="font-size: 12px">Synced {{ ago(store.lib?.syncedAt) }}</span>
        </div>
        <div v-if="busy" class="row" style="gap: 10px; font-size: 13px"><Icon name="mdiSync" class="spin" :size="18" />{{ store.sync.label || 'Working…' }}</div>
        <div class="muted" v-else style="font-size: 13px">{{ total }} games across {{ store.lib?.platforms.filter((p) => p.rom_count).length || 0 }} systems</div>
      </div>
      <button v-if="store.update.state === 'ready'" class="qm-item upd" data-focus data-autofocus @click="call('update:install')"><Icon name="mdiUpdate" /><div><b>Restart to update</b><small>Cartridge {{ store.update.version }} is downloaded</small></div></button>
      <button class="qm-item" data-focus :data-autofocus="store.update.state === 'ready' ? undefined : ''" :disabled="busy" @click="run(() => resync())"><Icon name="mdiSync" /><div><b>Resync library</b><small>Pull new and changed games from RomM</small></div></button>
      <button class="qm-item" data-focus :disabled="busy" @click="run(scanServer)"><Icon name="mdiRadar" /><div><b>Scan server for new ROMs</b><small>RomM rescans its folders, then Cartridge resyncs</small></div></button>
      <button class="qm-item" data-focus @click="rescan"><Icon name="mdiHarddisk" /><div><b>Rescan this device</b><small>Refresh which games are installed</small></div></button>
      <button class="qm-item" data-focus @click="toggleSounds"><Icon :name="store.config.ui.sounds ? 'mdiVolumeHigh' : 'mdiVolumeOff'" /><div><b>UI sounds</b><small>{{ store.config.ui.sounds ? 'On' : 'Off' }}</small></div></button>
      <button class="qm-item" data-focus @click="nav('downloads')"><Icon name="mdiDownload" /><div><b>Downloads</b><small>{{ activeCount ? `${activeCount} active` : 'Queue and history' }}</small></div></button>
      <button class="qm-item" data-focus @click="nav('settings')"><Icon name="mdiCog" /><div><b>Settings</b><small>Server, folders, sync</small></div></button>
      <button class="qm-item" data-focus @click="checkUpdate"><Icon name="mdiCloudDownloadOutline" /><div><b>Check for updates</b><small>{{ updLabel }}</small></div></button>
      <button class="qm-item" data-focus @click="call('app:fullscreen')"><Icon name="mdiFullscreen" /><div><b>Toggle fullscreen</b></div></button>
      <button class="qm-item danger" data-focus @click="call('app:quit')"><Icon name="mdiPower" /><div><b>Quit Cartridge</b></div></button>
    </aside>
  </div>
</template>
<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { store, call, resync, scanServer, tab, ago, saveConfig, toast } from '../store.js';
import { pushLayer, focusFirst } from '../nav.js';
import { setSoundEnabled } from '../sfx.js';
import Icon from './Icon.vue';
import Logo from './Logo.vue';

const el = ref(null);
const busy = computed(() => ['running', 'scanning'].includes(store.sync.state));
const total = computed(() => (store.libVersion, store.lib ? Object.values(store.lib.roms).reduce((s, l) => s + l.length, 0) : 0));
const activeCount = computed(() => store.downloads.filter((d) => ['queued', 'downloading'].includes(d.status)).length);
const close = () => (store.quickMenu = false);
function run(fn) { close(); fn(); }
function nav(n) { close(); tab(n); }
const updLabel = computed(() => {
  const u = store.update;
  return { checking: 'Checking…', downloading: `Downloading ${u.version || ''} · ${u.percent || 0}%`, ready: `${u.version} ready`, current: `Up to date · ${store.info.version}`, error: 'Could not check' }[u.state] || `Version ${store.info.version}`;
});
async function checkUpdate() { try { await call('update:check'); } catch (e) { toast(e.message, 'info', 3000); } }
async function rescan() { await call('installed:rescan'); toast('Device rescanned', 'ok', 2000, 'mdiHarddisk'); }
async function toggleSounds() { const v = !store.config.ui.sounds; await saveConfig({ ui: { sounds: v } }); setSoundEnabled(v); }
let layer;
onMounted(() => {
  layer = pushLayer(el.value, { back: close, start: close, lb() {}, rb() {}, x() {}, y() {}, select() {}, lt() {}, rt() {} });
  focusFirst(el.value);
});
onBeforeUnmount(() => layer.pop());
</script>
<style scoped>
.qm-scrim { position: fixed; inset: 0; z-index: 45; background: rgba(3, 4, 7, 0.5); animation: fade 0.2s; }
.qm { position: absolute; top: 0; right: 0; bottom: 0; width: 400px; padding: 26px 20px; display: flex; flex-direction: column; gap: 8px; background: rgba(14, 16, 24, 0.94); border-left: 1px solid var(--line-2); backdrop-filter: blur(30px); box-shadow: -30px 0 80px rgba(0, 0, 0, 0.6); animation: slide 0.3s var(--ease); overflow-y: auto; }
@keyframes slide { from { transform: translateX(60px); opacity: 0; } }
.qm-head { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.qm-title { font-family: var(--display); font-weight: 600; font-size: 20px; }
.qm-sync { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.qm-item { display: flex; align-items: center; gap: 14px; padding: 13px 14px; border-radius: 12px; transition: background 0.15s; }
.qm-item div { display: flex; flex-direction: column; gap: 2px; }
.qm-item b { font-weight: 500; font-size: 14.5px; }
.qm-item small { color: var(--muted); font-size: 12px; }
.qm-item:hover { background: rgba(255, 255, 255, 0.06); }
.qm-item:focus { background: rgba(139, 116, 232, 0.22); }
.qm-item.danger { color: #ffa39c; }
.qm-item.upd { background: var(--grad); color: #150f25; }
.qm-item.upd small { color: #2b1f45; }
.qm-item[disabled] { opacity: 0.4; }
</style>
