<template>
  <div class="set-view" ref="el">
    <nav class="rail">
      <div class="eyebrow" style="padding: 0 14px 10px">Settings</div>
      <button v-for="s in sections" :key="s.id" class="rail-item" :class="{ on: sec === s.id }" data-focus :data-key="'sec-' + s.id" @focus="sec = s.id" @click="enter">
        <Icon :name="s.icon" :size="20" />{{ s.label }}
      </button>
    </nav>
    <section class="pane" data-scroll ref="paneEl">
      <Transition name="fadeup" mode="out-in">
        <div :key="sec" class="pane-in">
          <template v-if="sec === 'conn'">
            <h1>Connection</h1>
            <div class="card-s glass">
              <div class="kv"><span>Local</span><span class="mono">{{ srv.localUrl || '—' }}</span></div>
              <div class="kv"><span>Remote</span><span class="mono">{{ srv.remoteUrl || '—' }}</span></div>
              <div class="kv"><span>Using now</span><span class="row" style="gap: 8px"><span class="dot" :class="store.connection.route === 'local' ? 'ok' : 'remote'" />{{ store.connection.base || 'Not connected' }}</span></div>
              <div class="kv"><span>Signed in</span><span>{{ srv.auth === 'token' ? 'API token' : srv.username }}</span></div>
            </div>
            <div class="row"><span class="lbl">Route</span><div class="seg"><button v-for="m in modes" :key="m.v" data-focus :class="{ on: srv.mode === m.v }" @click="setMode(m.v)">{{ m.l }}</button></div></div>
            <div class="row wrap">
              <button class="btn" data-focus @click="go('setup')"><Icon name="mdiPencil" />Edit connection</button>
              <button class="btn" data-focus @click="reconnect"><Icon name="mdiLanConnect" />Reconnect</button>
              <button class="btn danger" data-focus @click="signOut"><Icon name="mdiLogout" />Sign out</button>
            </div>
          </template>

          <template v-else-if="sec === 'sync'">
            <h1>Library &amp; sync</h1>
            <div class="card-s glass">
              <div class="kv"><span>Last sync</span><span>{{ ago(store.lib?.syncedAt) }}</span></div>
              <div class="kv"><span>Library</span><span>{{ total }} games · {{ store.lib?.platforms.filter((p) => p.rom_count).length || 0 }} systems</span></div>
              <div v-if="busy" class="kv"><span>Status</span><span class="row" style="gap: 8px"><Icon name="mdiSync" :size="16" class="spin" />{{ store.sync.label }}</span></div>
            </div>
            <div class="row wrap">
              <button class="btn primary" data-focus :disabled="busy" @click="resync()"><Icon name="mdiSync" />Resync now</button>
              <button class="btn" data-focus :disabled="busy" @click="scanServer()"><Icon name="mdiRadar" />Scan server for new ROMs</button>
              <button class="btn" data-focus @click="rescan"><Icon name="mdiHarddisk" />Rescan this device</button>
            </div>
            <Toggle :model-value="store.config.sync.onLaunch" label="Resync when Cartridge starts" desc="Picks up games you added to RomM since last time" @update:model-value="(v) => saveConfig({ sync: { onLaunch: v } })" />
            <div class="row"><span class="lbl">Auto resync</span><div class="seg"><button v-for="m in every" :key="m.v" data-focus :class="{ on: store.config.sync.everyMinutes === m.v }" @click="saveConfig({ sync: { everyMinutes: m.v } })">{{ m.l }}</button></div></div>
            <p class="muted small">“Scan server” asks RomM to look through its own folders for files you copied in, then resyncs. It needs username &amp; password sign-in.</p>
          </template>

          <template v-else-if="sec === 'storage'">
            <h1>Storage</h1>
            <div class="pathrow glass">
              <div style="min-width: 0"><div class="lbl2">ROMs folder</div><div class="mono">{{ store.config.romsRoot || 'Not set' }}</div><div v-if="space" class="muted small">{{ bytes(space.free) }} free of {{ bytes(space.total) }}</div></div>
              <div class="row">
                <button class="btn small" data-focus @click="detect"><Icon name="mdiAutoFix" :size="18" />Auto-detect</button>
                <button class="btn small" data-focus @click="browseRoot"><Icon name="mdiFolderOpen" :size="18" />Browse</button>
              </div>
            </div>
            <div class="pathrow glass">
              <div style="min-width: 0"><div class="lbl2">BIOS folder</div><div class="mono">{{ store.config.biosPath || 'Not set' }}</div></div>
              <button class="btn small" data-focus @click="browseBios"><Icon name="mdiFolderOpen" :size="18" />Browse</button>
            </div>
            <div class="space-bar" v-if="space"><div class="bar"><i :style="{ width: (1 - space.free / space.total) * 100 + '%' }" /></div></div>
          </template>

          <template v-else-if="sec === 'folders'">
            <h1>Console folders</h1>
            <div class="row" style="justify-content: space-between">
              <p class="muted small" style="margin: 0; max-width: 520px">Matched inside your ROMs folder using ES-DE folder names. Pick any system to point it somewhere else.</p>
              <div class="seg">
                <button data-focus :class="{ on: !showAll }" @click="showAll = false">On server</button>
                <button data-focus :class="{ on: showAll }" @click="loadAll">All supported</button>
              </div>
            </div>
            <div class="plist">
              <button v-for="p in folderList" :key="p.slug" class="prow" data-focus :data-key="'pf-' + p.slug" @click="editPath(p)">
                <PIcon :p="p" :size="30" />
                <div class="pn">{{ p.display_name || p.name }}<span v-if="p.rom_count && !showAll" class="muted small"> · {{ p.rom_count }}</span></div>
                <div class="mono pp">{{ p.target?.path || '—' }}</div>
                <span class="chip" :class="p.target?.source === 'custom' ? 'primary' : p.target?.exists ? 'green' : ''">{{ p.target?.source === 'custom' ? 'Custom' : p.target?.exists ? 'Found' : p.target?.path ? 'Will create' : 'Not set' }}</span>
              </button>
            </div>
          </template>

          <template v-else-if="sec === 'dl'">
            <h1>Downloads</h1>
            <div class="row"><span class="lbl">At once</span><div class="seg"><button v-for="n in [1, 2, 3, 4]" :key="n" data-focus :class="{ on: dls.concurrency === n }" @click="saveConfig({ downloads: { concurrency: n } })">{{ n }}</button></div></div>
            <Toggle :model-value="dls.esdeM3uFolders" label="ES-DE multi-disc folders" desc="Save multi-disc games as “Game.m3u/” so ES-DE shows one entry" @update:model-value="(v) => saveConfig({ downloads: { esdeM3uFolders: v } })" />
            <Toggle :model-value="dls.flattenSingleFile" label="Flatten single-file folders" desc="If a game is a folder with one file on the server, save just the file" @update:model-value="(v) => saveConfig({ downloads: { flattenSingleFile: v } })" />
          </template>

          <template v-else-if="sec === 'ui'">
            <h1>Look &amp; feel</h1>
            <div class="row"><span class="lbl">Box art size</span><div class="seg"><button v-for="s in sizes" :key="s.v" data-focus :class="{ on: ui.gridSize === s.v }" @click="saveConfig({ ui: { gridSize: s.v } })">{{ s.l }}</button></div></div>
            <div class="row"><span class="lbl">Background</span><div class="seg"><button v-for="b in bgs" :key="b.v" data-focus :class="{ on: (ui.bgStyle || 'waves') === b.v }" @click="saveConfig({ ui: { bgStyle: b.v } })">{{ b.l }}</button></div></div>
            <Toggle :model-value="ui.sounds !== false" label="UI sounds" desc="Soft clicks when you move and select" @update:model-value="setSounds" />
            <Toggle :model-value="ui.hideEmpty" label="Hide empty systems" @update:model-value="(v) => saveConfig({ ui: { hideEmpty: v } })" />
            <div class="row"><button class="btn" data-focus @click="call('app:fullscreen')"><Icon name="mdiFullscreen" />Toggle fullscreen</button><button class="btn" data-focus @click="clearCache"><Icon name="mdiImageRemove" />Clear image cache</button></div>
          </template>

          <template v-else>
            <h1>About</h1>
            <div class="about glass">
              <Logo :size="64" />
              <div><div style="font-family: var(--display); font-size: 26px; font-weight: 700">Cartridge</div><div class="muted">Version {{ store.info.version }} · a RomM client for the couch</div></div>
            </div>
            <div class="card-s glass">
              <div class="kv"><span>Game Mode</span><span>{{ store.info.gamescope ? 'Yes (gamescope)' : 'No (desktop)' }}</span></div>
              <div class="kv"><span>Controller</span><span>{{ input.padName || 'Press any button' }}</span></div>
              <div class="kv"><span>Data</span><span class="mono">{{ store.info.userData }}</span></div>
            </div>
            <div class="card-s glass">
              <div style="font-weight: 500">Steam library artwork</div>
              <div class="muted small">After adding Cartridge to Steam as a non-Steam game, this puts the Cartridge cover, banner and logo on its library page. Restart Steam afterwards.</div>
              <div class="row"><button class="btn" data-focus @click="applyArt"><Icon name="mdiImageFrame" />Apply Steam artwork</button></div>
            </div>
            <div class="row"><button class="btn danger" data-focus @click="call('app:quit')"><Icon name="mdiPower" />Quit Cartridge</button></div>
          </template>
        </div>
      </Transition>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { store, call, go, saveConfig, pickFolder, choose, confirm, toast, bytes, ago, resync, scanServer, allRoms } from '../store.js';
import { useView } from '../useView.js';
import { input, focusFirst } from '../nav.js';
import { setSoundEnabled } from '../sfx.js';
import Icon from '../components/Icon.vue';
import Logo from '../components/Logo.vue';
import Toggle from '../components/Toggle.vue';
import PIcon from '../components/PIcon.vue';

const el = ref(null);
const paneEl = ref(null);
const sec = ref(store.settingsSection || 'conn');
const sections = [
  { id: 'conn', label: 'Connection', icon: 'mdiServerNetwork' },
  { id: 'sync', label: 'Library & sync', icon: 'mdiSync' },
  { id: 'storage', label: 'Storage', icon: 'mdiHarddisk' },
  { id: 'folders', label: 'Console folders', icon: 'mdiFolderMultipleOutline' },
  { id: 'dl', label: 'Downloads', icon: 'mdiTrayArrowDown' },
  { id: 'ui', label: 'Look & feel', icon: 'mdiPaletteOutline' },
  { id: 'about', label: 'About', icon: 'mdiInformationOutline' },
];
const showAll = ref(false);
const supported = ref([]);
const space = ref(null);
const srv = computed(() => store.config.server);
const dls = computed(() => store.config.downloads);
const ui = computed(() => store.config.ui);
const busy = computed(() => ['running', 'scanning'].includes(store.sync.state));
const total = computed(() => allRoms().length);
const modes = [{ v: 'auto', l: 'Auto' }, { v: 'local', l: 'Local' }, { v: 'remote', l: 'Remote' }];
const sizes = [{ v: 'sm', l: 'Small' }, { v: 'md', l: 'Medium' }, { v: 'lg', l: 'Large' }];
const bgs = [{ v: 'waves', l: 'XMB waves' }, { v: 'art', l: 'Game artwork' }];
const every = [{ v: 0, l: 'Off' }, { v: 30, l: '30 min' }, { v: 60, l: '1 h' }, { v: 180, l: '3 h' }];
const folderList = computed(() => (store.libVersion, showAll.value ? supported.value : store.lib?.platforms || []));

useView({ back: () => { if (!document.activeElement?.closest('.rail')) { focusFirst(el.value, `[data-key="sec-${sec.value}"]`); return; } return false; } },
  [{ b: 'A', label: 'Select' }, { b: 'B', label: 'Back' }, { b: 'LB', label: '/ RB  Tabs' }]);
watch(sec, (v) => { store.settingsSection = v; });

function enter() { focusFirst(paneEl.value); }
async function setMode(mode) { await saveConfig({ server: { mode } }); reconnect(); }
async function reconnect() {
  try { const r = await call('server:reconnect'); toast(`Connected · ${r.base}`, 'ok', 2600, 'mdiLanConnect'); } catch (e) { toast(e.message, 'error'); }
}
async function signOut() {
  if (!(await confirm('Sign out?', 'Games on this device stay where they are.', 'Sign out', true))) return;
  await call('library:reset');
  await saveConfig({ server: { password: '', token: '' }, configured: false });
}
async function rescan() { await call('installed:rescan'); toast('Device rescanned', 'ok', 2000, 'mdiHarddisk'); }
async function afterPath() {
  if (showAll.value) await loadAll();
  space.value = await call('fs:space', store.config.romsRoot);
  await call('installed:rescan');
}
async function detect() {
  const d = await call('fs:detect');
  if (!d.roots.length) { toast('No EmuDeck / ES-DE roms folder found', 'error'); return; }
  const pick = await choose({ title: 'Detected ROM folders', options: d.roots.map((r) => ({ label: r.path, sub: r.source, value: r.path, icon: 'mdiFolderSearchOutline', selected: r.path === store.config.romsRoot })) });
  if (!pick) return;
  const patch = { romsRoot: pick };
  if (!store.config.biosPath && d.bios) patch.biosPath = d.bios;
  await saveConfig(patch);
  await afterPath();
}
async function browseRoot() {
  const p = await pickFolder({ title: 'Choose your ROMs folder', start: store.config.romsRoot || undefined });
  if (!p) return;
  await saveConfig({ romsRoot: p });
  await afterPath();
}
async function browseBios() {
  const p = await pickFolder({ title: 'Choose your BIOS folder', start: store.config.biosPath || undefined });
  if (p) await saveConfig({ biosPath: p });
}
async function editPath(p) {
  const choice = await choose({
    title: p.display_name || p.name, message: p.target?.path || 'No folder',
    options: [
      { label: 'Browse for a folder…', value: 'browse', icon: 'mdiFolderOpen' },
      { label: 'Use automatic match', value: 'auto', icon: 'mdiAutoFix', selected: p.target?.source !== 'custom' },
      { label: 'Cancel', value: null, icon: 'mdiClose' },
    ],
  });
  if (choice === 'browse') {
    const dir = await pickFolder({ title: `Folder for ${p.display_name || p.name}`, start: p.target?.exists ? p.target.path : store.config.romsRoot || undefined });
    if (!dir) return;
    store.config = await call('config:setPath', { slug: p.slug, path: dir });
  } else if (choice === 'auto') store.config = await call('config:setPath', { slug: p.slug, path: null });
  else return;
  await afterPath();
}
async function loadAll() {
  showAll.value = true;
  const list = await call('platforms:supported');
  supported.value = list.map((p) => ({ ...p, display_name: p.display_name || p.name })).sort((a, b) => a.display_name.localeCompare(b.display_name));
}
async function setSounds(v) { await saveConfig({ ui: { sounds: v } }); setSoundEnabled(v); }
async function applyArt() {
  try { const r = await call('steam:applyArt'); toast(`Artwork applied to ${r.length} Steam shortcut${r.length > 1 ? 's' : ''}. Restart Steam to see it.`, 'ok', 5000, 'mdiImageFrame'); }
  catch (e) { toast(e.message, 'error', 5000); }
}
async function clearCache() { await call('app:clearCache'); toast('Image cache cleared', 'ok', 2000); }

onMounted(async () => { space.value = await call('fs:space', store.config.romsRoot); });
</script>

<style scoped>
.set-view { position: absolute; inset: 0; display: grid; grid-template-columns: 270px 1fr; gap: 10px; padding: 16px 36px 0; animation: viewIn 0.35s var(--ease); }
.rail { display: flex; flex-direction: column; gap: 4px; padding-top: 10px; }
.rail-item { display: flex; align-items: center; gap: 14px; padding: 13px 16px; border-radius: 12px; color: var(--muted); font-weight: 500; transition: background 0.15s, color 0.15s; }
.rail-item.on { color: #fff; background: rgba(255, 255, 255, 0.06); }
.rail-item:focus { background: rgba(139, 116, 232, 0.25); color: #fff; }
.pane { overflow-y: auto; padding: 6px 12px 60px 24px; }
.pane-in { display: flex; flex-direction: column; gap: 16px; max-width: 860px; }
.pane h1 { font-size: 34px; font-weight: 700; margin: 4px 0 6px; }
.card-s { padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; }
.kv { display: flex; gap: 16px; font-size: 14px; min-width: 0; }
.kv > span:first-child { width: 110px; color: var(--muted); flex: none; }
.lbl { width: 130px; color: var(--muted); font-size: 13.5px; flex: none; }
.lbl2 { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 4px; font-weight: 600; }
.small { font-size: 12.5px; }
.wrap { flex-wrap: wrap; }
.pathrow { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 18px; }
.plist { display: flex; flex-direction: column; gap: 6px; }
.prow { display: grid; grid-template-columns: 30px 210px 1fr auto; align-items: center; gap: 14px; padding: 10px 14px; border-radius: 12px; background: rgba(255, 255, 255, 0.045); }
.prow:focus { background: rgba(139, 116, 232, 0.2); }
.pn { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp { color: var(--muted); }
.about { display: flex; align-items: center; gap: 18px; padding: 22px; }
.fadeup-enter-active, .fadeup-leave-active { transition: opacity 0.15s, transform 0.2s var(--ease); }
.fadeup-enter-from { opacity: 0; transform: translateX(10px); }
.fadeup-leave-to { opacity: 0; }
</style>
