<template>
  <div class="st">
    <div class="st-hero">
      <SyncthingLogo :size="56" />
      <div class="st-hero-txt">
        <h1>Syncthing</h1>
        <p class="muted small">Keeps your saves the same on all your devices. Cartridge finds every game's saves and reads what Syncthing shares; it only sets Syncthing up when you make this your main device, and never edits a save itself.</p>
      </div>
    </div>

    <div v-if="!props.page" class="st-tabs-row"><Btn b="LB" /><div class="seg st-tabs">
      <button v-for="t in TABS_ALL" :key="t.v" data-focus :data-key="'st-' + t.v" :class="{ on: view === t.v }" @click="setView(t.v)">{{ t.l }}</button>
    </div><Btn b="RB" /></div>

    <!-- This Device -->
    <template v-if="view === 'here'">
      <div v-if="!s" class="muted small"><Icon name="mdiSync" :size="14" class="spin" /> Looking for Syncthing…</div>
      <div v-else-if="!s.running" class="st-card">
        <b>{{ s.installed ? 'Syncthing Is Installed' : 'No Syncthing on This Device' }}</b>
        <p class="muted small">{{ s.why }}</p>
        <template v-if="s.needsKey">
          <TextField v-model="pasteKey" label="Its API key" placeholder="Paste it from Syncthing → Actions → Settings → General" password icon="mdiKeyVariant" />
          <div class="row"><button class="btn primary" data-focus :disabled="!pasteKey || busy" @click="useKey"><Icon name="mdiCheck" />Use This Key</button></div>
        </template>
        <p v-if="!s.installed" class="muted small">On SteamOS and Bazzite, install “SyncThingy” or “Syncthing Tray” from the Discover store, or the syncthing package on other systems. Cartridge finds it by itself.</p>
      </div>
      <template v-else>
        <SaveSync />
        <div class="st-card st-me">
          <div class="st-stats">
            <div><b>{{ online(L?.devices) }}<small>/{{ (L?.devices || s.devices).length }}</small></b><span>Devices Online</span></div>
            <div><b>{{ (L?.folders || s.folders).length }}</b><span>Folders</span></div>
            <div><b>{{ upToDate }}</b><span>Up to Date</span></div>
          </div>
          <div class="kv"><span>This device</span><span>{{ L?.name || 'This device' }}</span></div>
          <div v-if="L?.version" class="kv"><span>Version</span><span>{{ L.version }}{{ L.os ? ' · ' + L.os : '' }}</span></div>
          <div v-if="L?.uptime" class="kv"><span>Running for</span><span>{{ dur(L.uptime) }}</span></div>
          <div class="kv"><span>Address</span><span class="mono">{{ L?.address || s.address }}</span></div>
          <button v-if="L?.me" class="lrow st-id" data-focus @click="copy(L.me, 'Device ID copied')">
            <Icon name="mdiIdentifier" :size="22" />
            <span class="l-mid"><b>Device ID</b><span class="l-sub mono">{{ L.me }}</span></span>
            <span class="l-end"><Icon name="mdiContentCopy" :size="18" /></span>
          </button>
          <!-- 0.9.28 (owner: syncing stopped in Game Mode): a user service keeps Syncthing running in both modes -->
          <button class="lrow" data-focus :disabled="busy" @click="toggleService">
            <Icon name="mdiGamepadVariantOutline" :size="22" />
            <span class="l-mid"><b>Keep Running in Game Mode</b><span class="l-sub">Starts Syncthing with your session, so saves sync in Game Mode as well as on the desktop</span></span>
            <span class="l-end"><span class="status" :class="{ ok: svcOn }">{{ svcOn ? 'On' : 'Off' }}</span></span>
          </button>
        </div>

        <template v-if="(L?.devices || s.devices).length">
          <div class="sec-title">Devices</div>
          <div class="devs">
            <div v-for="d in L?.devices || s.devices" :key="d.id || d.name" class="dev" data-focus tabindex="0">
              <span class="dot" :class="{ on: d.online }" />
              <b>{{ d.name }}</b>
              <span>{{ d.online ? 'Online' + (d.client ? ' · ' + d.client : '') : d.paused ? 'Paused' : d.seen ? 'Seen ' + ago(d.seen) : 'Not seen yet' }}</span>
            </div>
          </div>
        </template>

        <template v-if="(L?.folders || s.folders).length">
          <div class="sec-title">Folders</div>
          <template v-for="f in L?.folders || s.folders" :key="f.id">
            <button class="lrow" data-focus :data-key="'sf-' + f.id" @click="toggle(f)">
              <Icon :name="f.saves ? 'mdiContentSaveOutline' : f.textures ? 'mdiTextureBox' : 'mdiFolderOutline'" :size="22" />
              <div class="l-mid"><b>{{ f.label || f.id }}</b><span class="l-sub mono">{{ short(f.path) }}{{ f.saves ? ` · ${f.saves} saves` : f.textures ? ' · textures' : '' }}</span></div>
              <span v-if="f.paused" class="status">Paused</span>
              <span v-else-if="f.done != null" class="status" :class="f.done >= 100 ? 'ok' : 'warn'">{{ f.done >= 100 ? 'Up to Date' : f.done + '%' }}</span>
              <Icon :name="open === f.id ? 'mdiChevronUp' : 'mdiChevronDown'" :size="22" />
            </button>
            <div v-if="open === f.id" class="files">
              <div v-if="!list" class="muted small"><Icon name="mdiSync" :size="14" class="spin" /> Reading Syncthing’s list…</div>
              <div v-else-if="list.error" class="muted small">{{ list.error }}</div>
              <template v-else>
                <div class="row files-head">
                  <span class="muted small" style="flex: 1">{{ list.total }} files · {{ bytes(list.size) }}<template v-if="list.last"> · last change {{ ago(list.last.at) }}</template></span>
                  <button class="btn" data-focus @click="rescan(f)"><Icon name="mdiRefresh" />Rescan</button>
                </div>
                <div v-for="x in list.files" :key="x.path" class="file" data-focus tabindex="0">
                  <span class="mono"><b v-if="x.game || x.kind === 'Textures'" class="file-game" :class="{ tex: x.kind === 'Textures' }">{{ x.game ? x.game + ' · ' : '' }}{{ x.kind }}</b>{{ x.path }}</span><span class="muted">{{ bytes(x.size) }}</span><span class="muted">{{ ago(x.at) }}</span>
                </div>
                <div v-if="list.total > list.files.length" class="muted small">And {{ list.total - list.files.length }} more.</div>
              </template>
            </div>
          </template>
        </template>
      </template>
    </template>

    <!-- Main Server -->
    <template v-else-if="view === 'server'">
      <template v-if="!srvCfg || editing">
        <div class="st-card">
          <b>Your Main Syncthing</b>
          <p class="muted small">The Syncthing that every device syncs with, often a home server or NAS. Cartridge shows which devices are connected to it and what it shares. Find the API key in its web page under Actions → Settings → General.</p>
          <TextField v-model="addr" label="Address" placeholder="192.168.1.10:8384" icon="mdiServerNetwork" mode="url" fkey="st-addr" />
          <TextField v-model="key" label="API key" placeholder="Paste its API key" password icon="mdiKeyVariant" />
          <div class="row" style="justify-content: flex-end">
            <button v-if="srvCfg" class="btn" data-focus @click="editing = false">Cancel</button>
            <button class="btn primary" data-focus :disabled="busy || !addr || !key" @click="saveServer"><Icon :name="busy ? 'mdiSync' : 'mdiLinkVariant'" :class="{ spin: busy }" />Connect</button>
          </div>
        </div>
      </template>
      <template v-else>
        <div v-if="!R" class="muted small"><Icon name="mdiSync" :size="14" class="spin" /> Asking {{ srvCfg.address }}…</div>
        <div v-else-if="R.error" class="st-card">
          <b>Couldn’t Reach It</b>
          <p class="muted small">{{ R.error }}</p>
          <div class="row"><button class="btn" data-focus @click="loadServer"><Icon name="mdiRefresh" />Try Again</button><button class="btn" data-focus @click="edit">Change</button></div>
        </div>
        <template v-else>
          <div class="st-card st-me">
            <div class="st-stats">
              <div><b>{{ online(R.devices) }}<small>/{{ R.devices.length }}</small></b><span>Connected</span></div>
              <div><b>{{ R.folders.length }}</b><span>Folders</span></div>
              <div><b>{{ R.folders.filter((f) => f.done >= 100).length }}</b><span>Up to Date</span></div>
            </div>
            <div class="kv"><span>Server</span><span>{{ R.name || R.short }}</span></div>
            <div v-if="R.version" class="kv"><span>Version</span><span>{{ R.version }}{{ R.os ? ' · ' + R.os : '' }}</span></div>
            <div v-if="R.uptime" class="kv"><span>Running for</span><span>{{ dur(R.uptime) }}</span></div>
            <div class="kv"><span>Address</span><span class="mono">{{ R.address }}</span></div>
          </div>
          <div class="sec-title">Connected Devices</div>
          <div class="devs">
            <div v-for="d in R.devices" :key="d.id" class="dev" data-focus tabindex="0">
              <span class="dot" :class="{ on: d.online }" />
              <b>{{ d.name }}<span v-if="d.id === L?.me" class="you"> · This device</span></b>
              <span>{{ d.online ? 'Connected' + (d.client ? ' · ' + d.client : '') : d.paused ? 'Paused' : d.seen ? 'Seen ' + ago(d.seen) : 'Not seen yet' }}</span>
            </div>
          </div>
          <div class="sec-title">Its Folders</div>
          <!-- 0.9.29 (owner): its folders open like This Device's, each file with its game and whether it's textures or a save -->
          <template v-for="f in R.folders" :key="f.id">
            <button class="lrow" data-focus :data-key="'sv-' + f.id" @click="toggle(f, true)">
              <Icon :name="f.saves ? 'mdiContentSaveOutline' : f.textures ? 'mdiTextureBox' : 'mdiFolderOutline'" :size="22" />
              <div class="l-mid"><b>{{ f.label }}</b><span class="l-sub">Shared with {{ f.devices }} {{ f.devices === 1 ? 'device' : 'devices' }}{{ f.saves ? ` · ${f.saves} saves` : f.textures ? ' · textures' : '' }}</span></div>
              <span v-if="f.paused" class="status">Paused</span>
              <span v-else-if="f.done != null" class="status" :class="f.done >= 100 ? 'ok' : 'warn'">{{ f.done >= 100 ? 'Up to Date' : f.done + '%' }}</span>
              <Icon :name="open === 'srv:' + f.id ? 'mdiChevronUp' : 'mdiChevronDown'" :size="22" />
            </button>
            <div v-if="open === 'srv:' + f.id" class="files">
              <div v-if="!list" class="muted small"><Icon name="mdiSync" :size="14" class="spin" /> Reading its list…</div>
              <div v-else-if="list.error" class="muted small">{{ list.error }}</div>
              <template v-else>
                <div class="muted small files-head">{{ list.total }} files · {{ bytes(list.size) }}<template v-if="list.last"> · last change {{ ago(list.last.at) }}</template></div>
                <div v-for="x in list.files" :key="x.path" class="file" data-focus tabindex="0">
                  <span class="mono"><b v-if="x.game || x.kind === 'Textures'" class="file-game" :class="{ tex: x.kind === 'Textures' }">{{ x.game ? x.game + ' · ' : '' }}{{ x.kind }}</b>{{ x.path }}</span><span class="muted">{{ bytes(x.size) }}</span><span class="muted">{{ ago(x.at) }}</span>
                </div>
                <div v-if="list.total > list.files.length" class="muted small">And {{ list.total - list.files.length }} more.</div>
              </template>
            </div>
          </template>
          <div class="row" style="justify-content: flex-end">
            <button class="btn" data-focus @click="loadServer"><Icon name="mdiRefresh" />Refresh</button>
            <button class="btn" data-focus @click="edit">Change</button>
            <button class="btn" data-focus @click="forget">Forget</button>
          </div>
        </template>
      </template>
    </template>

    <!-- Games (0.9.29, owner: first): every game with a save on this device, matched by the save's own ID, with
         what Syncthing keeps in step; synced folders' games too -->
    <template v-else>
      <p class="muted small" style="margin: 0">Every save on this device, matched to its game by the save's own serial or title ID, and whether Syncthing keeps it in step. Cartridge only reads them.</p>
      <TextField v-model="q" placeholder="Find a game" icon="mdiMagnify" mode="game" fkey="st-find" />
      <div v-if="!SV" class="muted small"><Icon name="mdiSync" :size="14" class="spin" /> Looking for saves…</div>
      <template v-else>
        <div class="muted small">{{ found.length }} {{ found.length === 1 ? 'game' : 'games' }} · {{ SV.length }} {{ SV.length === 1 ? 'save' : 'saves' }} on this device<template v-if="G && !G.error"> · {{ G.files }} synced files</template></div>
        <!-- 0.9.32 (owner): two rows like Game Add-ons: which console, then what it is -->
        <div v-if="cons.length > 1 && !q" class="st-cons" data-hscroll>
          <button class="st-con" :class="{ on: !fCon }" data-focus @click="fCon = ''"><span>All Consoles</span><em>{{ found.length }}</em></button>
          <button v-for="c in cons" :key="c.slug" class="st-con" :class="{ on: fCon === c.slug }" data-focus @click="fCon = c.slug"><PIcon :p="c.p" :size="24" /><span>{{ c.name }}</span><em>{{ c.n }}</em></button>
        </div>
        <!-- 0.9.57 (owner): always there, for every console; kinds a console has nothing of are dimmed -->
        <div class="st-cons" data-hscroll>
          <button class="st-con" :class="{ on: !fKind }" data-focus @click="fKind = ''"><span>Everything</span></button>
          <button v-for="k in kinds" :key="k.v" class="st-con" :class="{ on: fKind === k.v, none: !k.n }" data-focus @click="fKind = k.v"><Icon :name="k.icon" :size="18" /><span>{{ k.l }}</span><em>{{ k.n }}</em></button>
        </div>
        <div v-if="!shown.length" class="muted small">{{ q ? `Nothing for “${q}”.` : 'No saves were found for your games yet. Play a game once and they show here.' }}</div>
        <button v-for="g in shown" :key="g.id" class="lrow st-game" data-focus @click="go('game', { romId: g.id })">
          <img v-if="g.art" class="st-cover" :src="g.art" loading="lazy" />
          <span v-else class="st-cover" />
          <span class="l-mid">
            <b>{{ g.name }}</b>
            <span class="st-chips">
              <span v-for="x in g.local" :key="'l' + x.path" class="chip" :class="{ ok: x.synced }"><Icon :name="x.synced ? 'mdiSync' : 'mdiContentSaveOutline'" :size="14" />{{ x.emuName }}{{ x.sub ? ' · ' + x.sub : '' }} · {{ bytes(x.size || 0) }} · {{ ago(x.at) }}{{ x.synced ? ' · Synced' : '' }}{{ x.conflicts ? ` · ${x.conflicts} conflict ${x.conflicts === 1 ? 'copy' : 'copies'}` : '' }}</span>
              <span v-for="x in g.saves" :key="'s' + x.folder" class="chip"><Icon name="mdiCloudSyncOutline" :size="14" />{{ x.label }} · {{ x.files }} {{ x.files === 1 ? 'file' : 'files' }} · {{ ago(x.at) }}</span>
              <span v-for="x in g.textures" :key="'t' + x.folder" class="chip tex"><Icon name="mdiTextureBox" :size="14" />{{ x.label }} · {{ bytes(x.size) }}</span>
              <span v-for="x in g.patches" :key="'p' + x.folder" class="chip pat"><Icon name="mdiBandage" :size="14" />{{ x.label }} · {{ x.files }} {{ x.files === 1 ? 'file' : 'files' }}</span>
              <span v-for="x in g.updates" :key="'u' + x.folder" class="chip upd"><Icon name="mdiPackageUp" :size="14" />{{ x.label }} · {{ bytes(x.size) }}</span>
              <span v-for="x in g.mods" :key="'m' + x.folder" class="chip mod"><Icon name="mdiPuzzleOutline" :size="14" />{{ x.label }} · {{ x.files }} {{ x.files === 1 ? 'file' : 'files' }}</span>
            </span>
          </span>
          <span class="l-end"><span class="status" :class="{ ok: g.local.some((x) => x.synced) || g.saves.length }">{{ g.local.some((x) => x.synced) || g.saves.length ? 'Synced' : g.platform }}</span></span>
        </button>
        <template v-if="loose.length && !q">
          <div class="sec-title">Saves Not Matched to a Game <span class="count">{{ loose.length }}</span></div>
          <div v-for="x in loose.slice(0, 40)" :key="x.path" class="lrow" data-focus tabindex="0">
            <Icon :name="x.shared ? 'mdiSdCard' : 'mdiContentSaveOutline'" :size="22" />
            <span class="l-mid"><b>{{ x.label || x.keys?.title || x.keys?.serial || x.keys?.switch || x.keys?.name || 'Save' }}</b><span class="l-sub">{{ x.emuName }}{{ x.sub ? ' · ' + x.sub : '' }} · {{ bytes(x.size || 0) }} · {{ ago(x.at) }}{{ x.shared ? ' · a memory card for several games' : '' }}</span></span>
            <span v-if="x.synced" class="status ok">Synced</span>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>
<script setup>
// Settings → Syncthing (0.9.19 card, own tab 0.9.21; 0.9.23, owner: a proper integration with its logo,
// a main server, which games have saves and textures synced). Read only, see electron/syncthing.js
import { ref, computed, onMounted, watch } from 'vue';
import { store, call, ago, bytes, toast, go, confirm, romById, cover } from '../store.js';
import Icon from './Icon.vue';
import TextField from './TextField.vue';
import SyncthingLogo from './SyncthingLogo.vue';
import SaveSync from './SaveSync.vue';
import Btn from './Btn.vue';
import PIcon from './PIcon.vue';
// 0.9.29 (owner): Games first, then Main Server, then This Device; when this device is the main server
// (set up by Cartridge, config.syncthing.role 'main') the two are one tab
const isMain = computed(() => store.config.syncthing?.role === 'main');
const TABS_ALL = computed(() => (isMain.value ? [{ v: 'games', l: 'Games' }, { v: 'here', l: 'This Device · Main Server' }] : [{ v: 'games', l: 'Games' }, { v: 'server', l: 'Main Server' }, { v: 'here', l: 'This Device' }]));
// page: the page Settings shows (0.9.57: Syncthing's pages are in Settings' own row, so one L1/R1 for all of them)
const props = defineProps({ page: { type: String, default: '' } });
const s = ref(null), L = ref(null), open = ref(''), list = ref(null), view = ref(props.page || 'games'), SV = ref(null);
const R = ref(null), G = ref(null), q = ref(''), addr = ref(''), key = ref(''), busy = ref(false), editing = ref(false), pasteKey = ref('');
const srvCfg = computed(() => store.config.syncthing?.server || null);
const short = (p) => String(p || '').replace(store.info?.home || '\0', '~');
const online = (l) => (l || []).filter((d) => d.online).length;
const upToDate = computed(() => (L.value?.folders || s.value?.folders || []).filter((f) => f.done >= 100).length);
const dur = (sec) => { const h = Math.floor(sec / 3600), d = Math.floor(h / 24); return d ? `${d} ${d === 1 ? 'day' : 'days'}` : h ? `${h} h` : `${Math.max(1, Math.round(sec / 60))} min` };
// saves on this device (saves:list) and files in synced folders (sync:games), one row per game
const found = computed(() => {
  const by = new Map();
  const row = (id) => { if (!by.has(id)) { const r = romById(id); if (!r) return null; by.set(id, { id: r.id, name: r.name, platform: r.platform_display_name || '', slug: r.platform_slug || '', pid: r.platform_id, art: cover(r), local: [], saves: [], textures: [], patches: [], updates: [], mods: [], at: 0 }); } return by.get(id); };
  for (const x of SV.value || []) for (const id of x.romIds || []) { const g = row(id); if (g) { g.local.push(x); g.at = Math.max(g.at, x.at || 0); } }
  for (const [id, v] of Object.entries(G.value?.games || {})) { const g = row(Number(id)); if (g) { for (const k of KINDS) g[k.v === 'saves' ? 'saves' : k.v].push(...(v[k.v] || [])); g.at = Math.max(g.at, ...KINDS.flatMap((k) => (v[k.v] || []).map((x) => x.at))); } }
  return [...by.values()].sort((a, b) => b.at - a.at);
});
const loose = computed(() => (SV.value || []).filter((x) => !(x.romIds || []).length).sort((a, b) => (b.at || 0) - (a.at || 0)));
const KINDS = [{ v: 'saves', l: 'Saves', icon: 'mdiContentSaveOutline' }, { v: 'textures', l: 'Textures', icon: 'mdiTextureBox' }, { v: 'patches', l: 'Patches', icon: 'mdiBandage' }, { v: 'updates', l: 'Updates', icon: 'mdiPackageUp' }, { v: 'mods', l: 'Mods', icon: 'mdiPuzzleOutline' }];
const has = (g, k) => (k === 'saves' ? g.local.length || g.saves.length : g[k].length) > 0;
const fCon = ref(''), fKind = ref('');
// the consoles and kinds that are there, each with how many games
const cons = computed(() => { const m = new Map(); for (const g of found.value) { const c = m.get(g.slug) || { slug: g.slug, name: g.platform, p: { slug: g.slug, fs_slug: g.slug, id: g.pid }, n: 0 }; c.n++; m.set(g.slug, c); } return [...m.values()].sort((a, b) => a.name.localeCompare(b.name)); });
const kinds = computed(() => KINDS.map((k) => ({ ...k, n: found.value.filter((g) => (!fCon.value || g.slug === fCon.value) && has(g, k.v)).length })));
const shown = computed(() => {
  const k = q.value.trim().toLowerCase();
  let l = k ? found.value.filter((g) => g.name.toLowerCase().includes(k) || g.platform.toLowerCase().includes(k)) : found.value;
  if (fCon.value && !k) l = l.filter((g) => g.slug === fCon.value);
  if (fKind.value) l = l.filter((g) => has(g, fKind.value));
  return l;
});

onMounted(async () => {
  loadGames();
  s.value = (await call('sync:status').catch(() => null)) || { installed: false, running: false, why: 'Couldn’t check.' };
  if (s.value.running) { L.value = await call('sync:local').catch(() => null); loadSynced(); }
});
async function useKey() {
  busy.value = true;
  try { s.value = await call('sync:setKey', { key: pasteKey.value }); L.value = await call('sync:local').catch(() => null); toast('Connected to Syncthing', 'ok', 2500, 'mdiCheck'); }
  catch (e) { toast(e.message, 'error', 6000); }
  busy.value = false;
}
// L1/R1 move between This Device, Main Server and Games (0.9.24, owner)
function step(d) { const T = TABS_ALL.value, i = T.findIndex((t) => t.v === view.value); setView(T[(i + d + T.length) % T.length].v); }
defineExpose({ step });
watch(() => props.page, (v) => { if (v) setView(v); }, { immediate: true });
function setView(v) {
  view.value = v;
  if (v === 'server' && srvCfg.value && !R.value) loadServer();
  if (v === 'games' && !SV.value) loadGames();
}
async function loadServer() { R.value = null; R.value = await call('sync:server').catch((e) => ({ error: e.message })); }
async function loadGames() { SV.value = await call('saves:list').catch(() => []); }
// files in synced folders, only while Syncthing runs here
async function loadSynced() { G.value = await call('sync:games').catch((e) => ({ error: e.message })); }
function edit() { addr.value = srvCfg.value?.address || ''; key.value = srvCfg.value?.apikey || ''; editing.value = true; }
async function saveServer() {
  busy.value = true;
  try { await call('sync:setServer', { address: addr.value, apikey: key.value }); store.config.syncthing = { ...(store.config.syncthing || {}), server: { address: addr.value.trim(), apikey: key.value.trim() } }; editing.value = false; toast('Connected', 'ok', 2200, 'mdiCheck'); loadServer(); }
  catch (e) { toast(e.message, 'error', 6000); }
  busy.value = false;
}
async function forget() {
  if (!(await confirm('Forget the main server?', 'Cartridge stops showing it. Nothing changes in Syncthing.', 'Forget'))) return;
  await call('sync:setServer', null).catch(() => {});
  store.config.syncthing = { ...(store.config.syncthing || {}), server: null }; R.value = null; addr.value = key.value = '';
}
async function toggle(f, server = false) {
  const k = (server ? 'srv:' : '') + f.id;
  if (open.value === k) { open.value = ''; return; }
  open.value = k; list.value = null;
  const r = await call('sync:browse', server ? { id: f.id, server: true } : f.id).catch((e) => ({ error: e.message }));
  if (open.value === k) list.value = r;
}
async function rescan(f) {
  try { await call('sync:rescan', f.id); toast('Syncthing is rescanning it', 'ok', 2200, 'mdiRefresh'); } catch (e) { toast(e.message, 'error'); }
}
async function copy(text, msg) { try { await call('clip:write', { text }); toast(msg, 'ok', 2200, 'mdiContentCopy'); } catch (e) { toast(e.message, 'error'); } }

const svcOn = ref(false);
call('sync:serviceState').then((r) => { svcOn.value = !!r?.on; }).catch(() => {});
async function toggleService() {
  busy.value = true;
  try { const r = await call('sync:service', { enable: !svcOn.value }); svcOn.value = r.on; toast(r.on ? 'Syncthing now runs in Game Mode too' : 'Syncthing only runs the way you start it', 'ok', 3000, 'mdiSync'); }
  catch (e) { toast(e.message, 'error', 6000); }
  busy.value = false;
}
</script>
<style scoped>
.st { display: flex; flex-direction: column; gap: var(--s-3); }
.small { font-size: var(--t-sm); }
.mono { font-family: ui-monospace, monospace; }
.st-hero { display: flex; gap: var(--s-4); align-items: center; }
.st-hero h1 { margin: 0 0 4px; }
.st-hero-txt { flex: 1; min-width: 0; }
.st-hero p { margin: 0; max-width: 120ch; line-height: 1.45; } /* 0.9.32 (owner): uses the width, not three squeezed lines */
.st-tabs-row { display: flex; align-items: center; gap: 10px; align-self: flex-start; }
.st-card { display: flex; flex-direction: column; gap: var(--s-2); padding: var(--s-4); border-radius: var(--r-lg); background: var(--s1); }
.st-card > b { font-family: var(--display); font-size: var(--t-lg); }
.st-card p { margin: 0; line-height: 1.45; }
.st-stats { display: flex; gap: var(--s-6); padding-bottom: var(--s-2); }
.st-stats > div { display: flex; flex-direction: column; }
.st-stats b { font-family: var(--display); font-size: var(--t-2xl, 32px); line-height: 1; font-stretch: var(--display-stretch, normal); }
.st-stats small { font-size: 0.5em; color: var(--muted); }
.st-stats span { font-size: var(--t-xs); color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 6px; }
.st-id .l-sub { overflow-wrap: anywhere; white-space: normal; }
.devs { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--s-2); }
.dev { position: relative; display: flex; flex-direction: column; gap: 4px; padding: var(--s-3) var(--s-4) var(--s-3) calc(var(--s-4) + 16px); border-radius: var(--r-md); background: var(--s1); }
.dev b { font-family: var(--display); font-size: var(--t-md); }
.dev b .you { font-family: inherit; font-weight: 500; color: var(--muted); font-size: var(--t-sm); }
.dev > span:last-child { font-size: var(--t-sm); color: var(--muted); }
.dot { position: absolute; left: var(--s-4); top: calc(var(--s-3) + 8px); width: 8px; height: 8px; border-radius: 50%; background: var(--muted); opacity: 0.5; }
.dot.on { background: #4ade80; opacity: 1; }
.dev:focus-visible, .pad-mode .dev:focus { background: var(--focus); color: var(--on-focus); }
.dev:focus-visible > span:last-child, .pad-mode .dev:focus > span:last-child, .pad-mode .dev:focus .you { color: var(--on-focus-dim); }
.files { display: flex; flex-direction: column; gap: 2px; padding: 0 0 var(--s-3) 46px; }
.files-head { padding: 4px 0 6px; align-items: center; }
.file { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: var(--s-4); padding: 6px 10px; border-radius: var(--r-sm); font-size: var(--t-sm); }
.file .mono {  overflow-wrap: anywhere; }
.file-game { font-family: var(--body); font-weight: 700; margin-right: 8px; color: #9fe0b5; }
.file-game.tex { color: #b9c7ff; }
.file:focus-visible, .pad-mode .file:focus { background: var(--focus); color: var(--on-focus); }
.file:focus-visible .muted, .pad-mode .file:focus .muted { color: var(--on-focus-dim); }
.st-cover { width: 40px; aspect-ratio: 3 / 4; object-fit: cover; border-radius: var(--r-sm); background: var(--s2); flex: none; }
.st-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: var(--r-sm); background: var(--s2); font-size: var(--t-xs); color: var(--muted); }
.chip.tex { color: #b9c7ff; }
.chip.pat { color: #ffd59b; }
.chip.upd { color: #a8e6ff; }
.chip.mod { color: #e3b8ff; }
.st-cons { display: flex; gap: 8px; overflow-x: auto; padding: 6px 6px 8px; margin: 0 -6px; scrollbar-width: none; }
.st-con { flex: none; display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; background: var(--s1); box-shadow: var(--weight-edge); font-weight: 600; font-size: var(--t-sm); }
.st-con em { font-style: normal; color: var(--muted); font-weight: 500; }
.st-con.on { background: var(--sel-bg); box-shadow: var(--sel-under); color: var(--on-sel); }
.st-con.on em, .st-con.on :deep(svg) { color: var(--on-sel-dim); }
.st-con.none:not(.on):not(:focus) { opacity: 0.5; }
.st-con:focus-visible, .pad-mode .st-con:focus { background: var(--focus); color: var(--on-focus); box-shadow: none; outline: none; }
.pad-mode .st-con:focus em { color: var(--on-focus-dim); }
.chip.ok { color: #9be8b4; }
.pad-mode .st-game:focus .chip, .st-game:focus-visible .chip { background: rgba(0, 0, 0, 0.12); color: var(--on-focus-dim); }
</style>
