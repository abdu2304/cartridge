<template>
  <div :class="embedded ? 'ad-host' : 'scrim'" ref="el" @click.self="!embedded && closeModal(null)">
    <div class="ad" :class="{ dialog: !embedded }">
      <div>
        <template v-if="!embedded">
          <div class="eyebrow">Add-ons{{ emu ? ' · ' + emu.name + (emu.flatpak ? ' (Flatpak)' : '') : '' }}</div>
          <h2>{{ name }}</h2>
        </template>
        <div v-if="emus.length > 1" class="seg" style="margin: 4px 0 8px"><button v-for="e in emus" :key="e.emuRoot" data-focus :class="{ on: emu?.emuRoot === e.emuRoot }" @click="pickEmu(e)">{{ e.name }}{{ e.flatpak ? ' (Flatpak)' : '' }}</button></div>
        <!-- 0.9.32 (owner: the lines between the emulator and the list were cluttered): one card of facts -->
        <div v-if="emu" class="ad-facts">
          <div class="ad-fact"><span>Emulator</span><b>{{ emu.name }}{{ emu.flatpak ? ' (Flatpak)' : '' }}</b></div>
          <div class="ad-fact"><span>Folder</span><b class="mono">{{ emu.folder ? short(emu.folder) : short(emu.root) }}</b><em v-if="!emu.folder">This game’s ID couldn’t be read</em></div>
          <div v-if="emu.rule" class="ad-fact"><span>Takes</span><b>{{ emu.rule.what }}</b><em>Needs {{ emu.rule.needs }}; anything else is refused</em></div>
          <div v-if="d?.version && wants('mods')" class="ad-fact"><span>Your Copy</span><b>{{ verText }}</b><em>Mods made for another version may not load</em></div>
          <div v-if="!emu.mods && wants('tex')" class="ad-fact"><span>Custom Textures</span><b>{{ emu.on ? 'On' : 'Off' }}</b><em v-if="!emu.on">Turned on when a pack is installed</em></div>
          <div v-if="here && wants(here.mods ? 'mods' : 'tex')" class="ad-fact ok"><span>In Place</span><b>{{ here.mods ? 'Mods' : 'A texture pack' }} · {{ here.files.toLocaleString() }} files</b><em>{{ here.by === 'cartridge' ? 'Installed by Cartridge' : here.by === 'both' ? 'Partly installed by Cartridge' : 'Added outside Cartridge' }}</em></div>
        </div>
      </div>

      <div v-if="!d" class="muted"><Icon name="mdiSync" :size="16" class="spin" /> Looking for add-ons…</div>
      <div v-else class="ad-list" data-scroll>
        <div v-if="run" class="ad-run"><Icon name="mdiSync" :size="18" class="spin" /><span>{{ runText }}</span><button class="btn small" data-focus @click="cancel">Cancel</button></div>

        <template v-if="mine.length || (here && here.by !== 'cartridge' && wants(here.mods ? 'mods' : 'tex'))">
          <div class="ad-h">Installed</div>
          <!-- 0.9.37 (owner: delete installed mods and texture packs): what was added outside Cartridge too -->
          <button v-if="here && here.by !== 'cartridge' && wants(here.mods ? 'mods' : 'tex')" class="ad-row" data-focus @click="clearAll">
            <Icon name="mdiFolderRemoveOutline" :size="22" />
            <span class="ad-mid"><b>Everything in {{ emu?.name }}’s Folder for This Game</b><span class="ad-sub">{{ here.files.toLocaleString() }} files · {{ here.by === 'both' ? 'some added outside Cartridge' : 'added outside Cartridge' }} · goes to the Trash</span></span>
            <span class="ad-end">Delete</span>
          </button>
          <button v-for="r in mine" :key="r.key" class="ad-row" data-focus data-expand @click="remove(r)">
            <Icon name="mdiCheckCircle" :size="22" />
            <span class="ad-mid"><b>{{ r.name }}</b><span class="ad-sub">{{ [r.emuName, bytes(r.bytes), r.count + ' files'].join(' · ') }}</span></span>
            <span class="ad-end">Delete</span>
          </button>
        </template>

        <template v-if="featured.length && wants('tex')">
          <div class="ad-h">Featured packs</div>
          <button v-for="f in featured" :key="f.id" class="ad-row" data-focus data-expand @click="openPage(f)">
            <Icon name="mdiStarFourPointsOutline" :size="22" />
            <span class="ad-mid"><b>{{ f.name }}</b><span class="ad-sub">by {{ f.authors[0] }} · download it from its page, then Install a Download below</span></span>
            <span class="ad-end">Open Page</span>
          </button>
        </template>
        <!-- 0.9.52 (owner): every mod site for this game, the right stick moves between them (chips for touch and mouse) -->
        <div v-if="srcs.length > 1" class="ad-srcs"><Btn class="ad-rs" b="RS" /><div class="seg ad-src-seg"><button v-for="x in srcs" :key="x.id" data-focus :data-key="'src-' + x.id" :class="{ on: src === x.id }" @click="setSrc(x.id)">{{ x.name }}<span v-if="x.beta" class="ad-beta">Beta</span></button></div></div>
        <div class="ad-hrow">
          <div class="ad-h">{{ src === 'nexus' ? 'Mods from Nexus Mods' : src === 'rh' ? 'ROM hacks from Romhacking.net' : kind === 'mods' ? 'Mods from GameBanana' : kind === 'tex' ? 'Texture packs' : d.source === 'ps2' ? (d.gbGame ? 'PS2 texture packs and GameBanana' : 'PS2 texture packs') : 'From GameBanana' }}</div>
          <!-- 0.9.32 (owner): sort, most downloaded first -->
          <div v-if="src !== 'rh' && packs.some((p) => p.source === 'gb' || p.source === 'nexus')" class="seg ad-sort"><button v-for="o in SORTS" :key="o.v" data-focus :class="{ on: sort === o.v }" @click="setSort(o.v)">{{ o.l }}</button></div>
        </div>
        <div v-if="d.as && !d.error" class="muted small ad-as">Showing {{ srcName }}’s mods for “{{ d.as }}”. <button class="btn small" data-focus @click="useName('')">Use the Full Name</button></div>
        <template v-if="d.error && (kind !== 'tex' || d.source === 'ps2')">
          <div class="muted small">{{ d.error }}</div>
          <!-- 0.9.56 (owner): found under a shorter name; one press shows its mods, installed by this game's rules -->
          <button v-if="d.suggest" class="ad-row ad-sugg" data-focus @click="useName(d.suggest.as)">
            <Icon name="mdiMagnify" :size="22" />
            <span class="ad-mid"><b>Found on {{ srcName }}: {{ d.suggest.name }}</b><span class="muted small">Show its mods for this game. They install the same way, into this game’s folder.</span></span>
          </button>
        </template>
        <div v-else-if="!packs.length && src === 'nexus'" class="muted small">No mods for this game on Nexus Mods.</div>
        <div v-else-if="!packs.length && src === 'rh'" class="muted small">No ROM hacks for this game on Romhacking.net.</div>
        <div v-else-if="!packs.length" class="muted small">{{ !d.emus?.length ? 'No emulator for this console is set up here.' : kind === 'tex' ? (d.source === 'ps2' ? 'No texture packs for this game in the catalog yet.' : 'There’s no texture pack catalog for this console yet. A pack you put in the folder above is used once custom textures are on.') : 'No mods for this game on GameBanana.' }}</div>
        <template v-for="p in packs" :key="p.source + p.id">
          <button class="ad-row" data-focus data-expand :disabled="!!run" @click="act(p)">
            <img v-if="p.preview || p.previews?.[0]" class="ad-img" :src="p.preview || p.previews[0]" loading="lazy" />
            <Icon v-else name="mdiPuzzleOutline" :size="22" />
            <span class="ad-mid"><b>{{ p.name }}</b><span class="ad-sub">{{ subOf(p) }}</span></span>
            <span class="ad-end">{{ has(p) ? 'Installed' : 'Details' }}</span>
          </button>
          <template v-if="open === p.id">
            <div v-if="!files" class="muted small ad-files"><Icon name="mdiSync" :size="14" class="spin" /> Loading files…</div>
            <div v-else-if="!files.length" class="muted small ad-files">No zip, 7z or rar files in this mod.</div>
            <button v-for="f in files" :key="f.id" class="ad-row ad-file" data-focus data-expand :disabled="!!run" @click="install(p, f)">
              <Icon name="mdiFileDownloadOutline" :size="20" />
              <span class="ad-mid"><b>{{ f.name }}</b><span class="ad-sub">{{ [bytes(f.size), f.description].filter(Boolean).join(' · ') }}</span></span>
              <span class="ad-end">Install</span>
            </button>
          </template>
        </template>
        <p v-if="packs.some((p) => p.source === 'ps2')" class="muted small">Packs from the EmuCoreX texture catalog, each credited to its creator. Checked against the catalog’s checksum before anything is installed.</p>
        <p v-if="packs.some((p) => p.source === 'gb')" class="muted small">Mods made by GameBanana’s community. Check a mod’s page for which version of the game it needs.</p>
        <p v-if="src === 'nexus' && packs.length" class="muted small">Mods made by Nexus Mods’ community. Some are made for a game’s PC version: check a mod’s page says it’s for your emulator. Premium members download in one press with their key (Settings → Emulators → Game Add-ons); everyone else downloads on the mod’s page, and Cartridge installs it.</p>
        <p v-if="src === 'rh' && packs.length" class="muted small">Hacks and translations from Romhacking.net’s archive. {{ d.hackMode?.retroarch ? 'RetroArch applies a hack as the game loads, so your game file is never changed.' : 'Cartridge makes a patched copy beside your game; the original is never changed.' }} Each hack names the exact copy of the game it needs.</p>
      </div>

      <div class="row" style="justify-content: flex-end; flex-wrap: wrap">
        <button v-if="emu" class="btn" data-focus :disabled="!!run" @click="fromFile"><Icon name="mdiFolderZipOutline" />Install a Download</button>
        <button v-if="emu && !emu.mods && !emu.on && wants('tex')" class="btn" data-focus @click="texOn"><Icon name="mdiTextureBox" />Turn textures on</button>
        <button v-if="emu" class="btn" data-focus @click="copy"><Icon name="mdiContentCopy" />Copy folder path</button>
        <button v-if="!embedded" class="btn" data-focus @click="closeModal(null)">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup>
// A game's add-ons (0.9.17): installed ones (Remove), and what can be downloaded for the emulator
// picked above: PS2 texture packs from the EmuCoreX catalog, other consoles' mods from GameBanana.
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { pushLayer, focusFirst } from '../nav.js';
import { store, call, closeModal, toast, bytes, confirm, pickFolder, openModal, tab, saveConfig, choose } from '../store.js';
import Icon from './Icon.vue';
import Btn from './Btn.vue';

// embedded (0.9.21): one tab of Game Add-ons (GameAddons.vue); kind 'tex' is the texture pack catalog
// (EmuCoreX, PS2), kind 'mods' is GameBanana (owner: GameBanana is for mods, keep the two apart)
const props = defineProps({ romId: Number, name: String, embedded: Boolean, kind: { type: String, default: '' }, onReopen: Function });
const el = ref(null), d = ref(null), emu = ref(null), open = ref(null), files = ref(null), run = ref(null);
const emus = computed(() => d.value?.emus || []);
const isTex = (p) => p.source === 'ps2';
const wants = (k) => !props.kind || props.kind === k;
const ofKind = (p) => wants(isTex(p) ? 'tex' : 'mods');
// the mods engine's sources for this tab (0.9.52): Mods = GameBanana, Nexus Mods, ROM hacks; Texture Packs = the PS2 catalog
const srcs = computed(() => (d.value?.sources || []).filter((x) => (props.kind === 'tex' ? x.kind === 'tex' : !props.kind || x.kind === 'mods' || x.kind === 'hacks')));
const src = ref(props.kind === 'tex' ? 'ps2' : 'gb');
const packs = computed(() => (d.value?.packs || []).filter((p) => (p.source === 'nexus' || p.source === 'rh' ? p.source === src.value : src.value !== 'nexus' && src.value !== 'rh' && ofKind(p))));
const featured = computed(() => d.value?.featured || []);
// 0.9.32 (owner: clicking a download on the site did nothing): the page opens in a Cartridge window;
// a .zip/.7z/.rar downloaded there shows in Downloads and installs for this game
async function openPage(f) { await browse(f.page, f.name); }
async function browse(url, name) {
  if (!emu.value) return toast('No emulator for this game is set up here.', 'info');
  try { await call('addons:browse', { url, name, romId: props.romId, emuRoot: emu.value.emuRoot, kind: props.kind || 'tex' }); toast('Click a download on the page: Cartridge installs it for this game. Escape or Back to Cartridge closes the page.', 'info', 6000, 'mdiDownload'); }
  catch (e) { toast(e.message, 'error', 5000); }
}
// 0.9.23 (owner: Cartridge installs packs itself): a pack downloaded from any site, put in the right folder
// for this emulator the same way as the catalog's
async function fromFile() {
  if (!emu.value) return;
  const f = await pickFolder({ title: 'Pick the download', subtitle: 'A .zip, .7z or .rar texture pack or mod', start: store.info?.home ? store.info.home + '/Downloads' : undefined, files: ['zip', '7z', 'rar'] });
  reopen();
  if (!f) return;
  const name = f.split('/').pop().replace(/\.(zip|7z|rar)$/i, '');
  await install({ source: 'local', id: name, name, file: f, kind: props.kind || 'tex', authors: [] }, null);
}
const mine = computed(() => (d.value?.installed || []).filter((r) => (r.source === 'rh' ? src.value === 'rh' : (!emu.value || r.emuRoot === emu.value.emuRoot) && ofKind(r))));
const short = (p) => String(p || '').replace(store.info?.home || '\0', '~');
const has = (p) => mine.value.some((r) => String(r.id) === String(p.id));
const big = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));
const subOf = (p) => [p.authors?.[0] ? 'by ' + p.authors.join(', ') : '', p.downloads ? big(p.downloads) + ' downloads' : '', p.likes ? big(p.likes) + ' likes' : '', p.size ? bytes(p.size) : '', p.files ? p.files.toLocaleString() + ' textures' : '', p.version, p.category].filter(Boolean).join(' · ');
const SORTS = [{ v: 'downloads', l: 'Most Downloaded' }, { v: 'updated', l: 'Recently Updated' }, { v: 'newest', l: 'Newest' }, { v: 'liked', l: 'Most Liked' }];
const sort = ref(store.config.ui?.modSort || 'downloads');
function setSort(v) { if (sort.value === v) return; sort.value = v; saveConfig({ ui: { modSort: v } }); load(); }
const verText = computed(() => { const v = d.value?.version; if (!v) return ''; return [v.display ? 'Version ' + v.display : v.update ? 'Update ' + v.update : 'The base game', v.text || (v.number != null ? 'v' + v.number : ''), v.titleId].filter(Boolean).join(' · '); });
const runText = computed(() => { const r = run.value; if (!r) return ''; return r.state === 'download' ? `Downloading ${r.pct != null ? r.pct + '%' : ''}` : r.state === 'join' ? 'Joining the parts…' : r.state === 'install' ? `Installing ${r.pct || 0}%` : 'Starting…'; });

// what is already in the game's folder (0.9.19), Cartridge's or not
const present = ref([]);
const here = computed(() => present.value.find((x) => x.emu === emu.value?.id) || null);
function setSrc(id) { if (src.value === id) return; src.value = id; open.value = null; asName.value = ''; load(); }
// the right stick (and , .) steps through the sources, looping
function stepSource(dir) {
  const l = srcs.value; if (l.length < 2) return false;
  const i = l.findIndex((x) => x.id === src.value), n = l[(i + dir + l.length) % l.length].id;
  setSrc(n); requestAnimationFrame(() => focusFirst(el.value, `[data-key="src-${n}"]`));
  return true;
}
defineExpose({ stepSource });
// the shorter name a site knows the game by, picked from its suggestion (0.9.56); a different source starts fresh
const asName = ref('');
const srcName = computed(() => (src.value === 'nexus' ? 'Nexus Mods' : src.value === 'rh' ? 'Romhacking.net' : 'GameBanana'));
function useName(n) { asName.value = n; load(); }
async function load() {
  call('addons:present', { romIds: [props.romId] }).then((m) => { present.value = m?.[props.romId] || []; }).catch(() => {});
  const keep = d.value?.sources;
  if (d.value) d.value = { ...d.value, packs: [], error: '' };
  try { d.value = await call('addons:available', { romId: props.romId, sort: sort.value, source: src.value === 'nexus' || src.value === 'rh' ? src.value : '', as: asName.value }); if (!d.value.sources?.length && keep) d.value.sources = keep; } catch (e) { d.value = { emus: [], packs: [], installed: [], error: e.message }; }
  // a console with no emulator folder for mods (SNES, NES...) opens on its ROM hacks
  if (!d.value.emus?.length && src.value === 'gb' && (d.value.sources || []).some((x) => x.id === 'rh')) { src.value = 'rh'; return load(); }
  if (!emu.value) emu.value = (d.value.source === 'ps2' ? emus.value.find((e) => e.id === 'pcsx2') : null) || emus.value[0] || null;
  else emu.value = emus.value.find((e) => e.emuRoot === emu.value.emuRoot) || emus.value[0] || null;
}
function pickEmu(e) { emu.value = e; }
// A opens the add-on in full (0.9.24): its text, pictures, size and maker, and Install at the bottom
async function act(p) {
  const r = await openModal('addondetail', { p: JSON.parse(JSON.stringify(p)), installed: has(p), kind: p.source === 'rh' ? 'hacks' : props.kind, hackMode: d.value?.hackMode || null });
  reopen();
  if (!r) return;
  if (r.hack) return useHack(p, r.hack);
  if (has(p)) return toast('Already installed. Remove it from the list above.', 'info', 3000);
  if (r.page) return browse(p.url, p.name);
  if (r.file) return install(p, r.file);
  if (r.install && p.source === 'ps2') return install(p, null);
}
async function install(p, f) {
  if (!emu.value) return toast('No emulator for this game is set up here.', 'info');
  run.value = { state: 'start' };
  // 0.9.52: a Nexus Mods file without Premium opens its page in Cartridge's window instead (the download there installs)
  if (p.source === 'nexus') {
    try {
      const r = await call('addons:install', { romId: props.romId, emuRoot: emu.value.emuRoot, pack: JSON.parse(JSON.stringify(p)), file: f ? JSON.parse(JSON.stringify(f)) : null });
      // 0.9.57: why the page opens (a key only downloads for Premium), and the sign-in only the first time
      if (r?.page) { run.value = null; return toast(r.signedIn ? 'Press Slow Download on the page: Cartridge installs the file for this game.' : `Nexus Mods only lets Premium accounts download with ${r.keyed ? 'an API key' : 'Cartridge'}. Sign in on the page once (Cartridge remembers it), then press Slow Download: Cartridge installs the file for this game.`, 'info', 9000, 'mdiDownload'); }
      toast(`Installed in ${emu.value.name}: ${r.files.toLocaleString()} files`, 'ok', 5000, 'mdiPuzzleOutline');
    } catch (e) { if (!/abort/i.test(e.message)) toast(e.message, 'error', 6000); }
    run.value = null; load(); return;
  }
  // 0.9.28 (owner): Install goes to Downloads, where the pack shows with its game, downloading then unpacking
  const job = call('addons:install', { romId: props.romId, emuRoot: emu.value.emuRoot, pack: JSON.parse(JSON.stringify(p)), file: f ? JSON.parse(JSON.stringify(f)) : null });
  closeModal(null); tab('downloads');
  try {
    const r = await job;
    toast(`Installed in ${emu.value.name}: ${r.files.toLocaleString()} files${r.patches ? ', in its patches (turn it on in the game’s Patches)' : r.graphicMods ? ', in its Graphics Mods (turn it on in the game’s Graphics Mods)' : r.autoOn ? '. Custom textures are on now.' : r.textures ? '. Turn custom textures on to see them.' : ''}`, 'ok', 5000, 'mdiPuzzleOutline');
    open.value = null;
  } catch (e) { if (!/abort/i.test(e.message)) toast(e.message, 'error', 6000); }
  finally { run.value = null; load(); }
}
// a ROM hack (0.9.52): its download read for patches, one picked when there are several (headered or not, versions),
// then used with RetroArch (a patch beside the game) or as a patched copy beside the original
async function useHack(p, mode) {
  run.value = { state: 'start' };
  try {
    const prep = await call('hacks:prepare', { romId: props.romId, item: JSON.parse(JSON.stringify(p)) });
    let i = prep.patches.find((x) => x.supported)?.i;
    const usable = prep.patches.filter((x) => x.supported);
    if (usable.length > 1) {
      run.value = null;
      i = await choose({ title: 'Which Patch?', message: [prep.romInfo && 'This hack needs: ' + prep.romInfo, 'The download has more than one patch. Most hacks offer one for each copy of the game.'].filter(Boolean).join('\n\n'), options: usable.map((x) => ({ label: x.name.split('/').pop(), sub: x.kind.toUpperCase() + ' patch', value: x.i, icon: 'mdiFileDocumentOutline', raw: true })) });
      reopen();
      if (i == null) return;
      run.value = { state: 'install' };
    }
    if (i == null) throw new Error('This hack’s patches are xdelta or PPF, which Cartridge doesn’t apply. Its page has the patch to use with a separate tool.');
    const r = await call('hacks:apply', { romId: props.romId, id: prep.id, index: i, mode });
    toast(r.mode === 'soft' ? `${p.name} is on: RetroArch applies it when the game starts` : `Patched copy made beside your game: ${r.file.split('/').pop()}. Upload it to RomM from Settings → Library to add it to your library.`, 'ok', 8000, 'mdiPuzzleOutline');
  } catch (e) { toast(e.message, 'error', 8000); }
  finally { run.value = null; load(); }
}
async function remove(r) {
  if (!(await confirm('Delete this add-on?', `${r.name}\n\nOnly the ${r.count} files Cartridge put in ${r.emuName}’s folder are deleted.`, 'Delete', true))) return reopen();
  try { await call('addons:remove', { key: r.key }); toast('Add-on deleted', 'ok', 2500); } catch (e) { toast(e.message, 'error', 5000); }
  reopen(); load();
}
async function clearAll() {
  if (!(await confirm('Delete everything in its folder?', `${here.value.files.toLocaleString()} files in ${emu.value.name}’s ${here.value.mods ? 'mods' : 'textures'} folder for this game, including what was added outside Cartridge. The folder goes to the Trash, so it can be put back.`, 'Delete', true))) return reopen();
  try { await call('addons:clear', { romId: props.romId, emu: emu.value.id }); toast('Moved to the Trash', 'ok', 3000, 'mdiDelete'); } catch (e) { toast(e.message, 'error', 6000); }
  reopen(); load();
}
// confirm() uses the one modal slot: come back to this sheet afterwards
const resolveSaved = () => store.modal?.resolve;
let saved = null;
function reopen() { if (props.embedded) return props.onReopen?.(); if (store.modal?.type !== 'addons') store.modal = { type: 'addons', props: { romId: props.romId, name: props.name }, resolve: saved || (() => {}) }; }
async function texOn() {
  try { await call('addons:setTextures', { root: emu.value.emuRoot, on: true }); toast(`Custom textures on in ${emu.value.name}`, 'ok', 3000, 'mdiTextureBox'); load(); }
  catch (e) { toast(e.message, 'error', 5000); }
}
async function copy() { try { await call('clip:write', { text: emu.value.folder || emu.value.root }); toast('Folder path copied', 'ok', 2000, 'mdiContentCopy'); } catch (e) { toast(e.message, 'error'); } }
const cancel = () => call('addons:cancel').catch(() => {});
let off = null, layer;
onMounted(async () => {
  saved = resolveSaved();
  off = window.cart.on('addon-progress', (m) => { if (m.romId === props.romId && run.value && m.state !== 'done' && m.state !== 'error') run.value = m; });
  if (!props.embedded) layer = pushLayer(el.value, { back: () => closeModal(null), lb() {}, rb() {}, x() {}, y() {}, select() {}, lt() {}, rt() {}, rsleft: () => stepSource(-1), rsright: () => stepSource(1) });
  await load();
  if (!props.embedded) focusFirst(el.value);
});
onBeforeUnmount(() => { layer?.pop(); off?.(); });
</script>

<style scoped>
.ad-ver { display: flex; align-items: center; gap: 8px; font-size: var(--t-sm); color: var(--muted); }
.ad-ver b { color: var(--text); }
.ad { width: min(820px, 94vw); max-height: 88vh; display: flex; flex-direction: column; gap: var(--s-4); }
.ad-host { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.ad-host > .ad { width: auto; max-height: none; min-height: 0; flex: 1; }
.ad h2 { margin: 2px 0 6px; font-size: var(--t-xl); line-height: 1.15; }
.small { font-size: var(--t-sm); }
.mono { font-family: ui-monospace, monospace; word-break: break-all; }
.ad-list { overflow-y: auto; min-height: 0; flex: 1; display: flex; flex-direction: column; gap: var(--s-2); padding: 2px; }
.ad-h { font-weight: 600; margin-top: var(--s-2); }
.ad-hrow { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); flex-wrap: wrap; margin-top: var(--s-2); }
.ad-hrow .ad-h { margin-top: 0; }
.ad-sort button { font-size: var(--t-xs); }
.ad-srcs { display: flex; align-items: center; gap: var(--s-2); margin-top: var(--s-1); }
.ad-src-seg { flex-wrap: wrap; }
:global(body:not(.pad-mode) .ad-rs) { display: none; } /* the stick hint only with a controller */
.ad-beta { margin-left: 6px; padding: 1px 6px; border-radius: 999px; font-size: var(--t-xs); background: color-mix(in srgb, currentColor 14%, transparent); }
.ad-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 2px 18px; margin: 6px 0 4px; padding: 12px 16px; border-radius: var(--r-md); background: rgba(255, 255, 255, 0.04); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06); }
.ad-fact { display: flex; flex-direction: column; gap: 1px; min-width: 0; padding: 4px 0; }
.ad-fact > span { font-size: var(--t-xs); color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
.ad-fact > b { font-size: var(--t-sm); font-weight: 600; overflow-wrap: anywhere; }
.ad-fact > em { font-style: normal; font-size: var(--t-xs); color: var(--muted); }
.ad-fact.ok > b { color: #8be0a4; }
.ad-here { display: flex; align-items: center; gap: 8px; color: #8be0a4; font-size: var(--t-sm); font-weight: 500; margin-top: 4px; }
.ad-row { flex: none; display: flex; align-items: center; gap: var(--s-3); text-align: left; padding: var(--s-3) var(--s-4); border-radius: var(--r-md); background: var(--s1); color: inherit; border: 0; font: inherit; }
.ad-row:focus { background: var(--focus); color: var(--on-focus); outline: none; box-shadow: none; }
.ad-file { margin-left: var(--s-5); }
.ad-files { margin-left: var(--s-5); }
.ad-img { width: 64px; height: 36px; object-fit: cover; border-radius: var(--r-sm); flex: none; }
.ad-mid { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.ad-sugg:focus .muted { color: var(--on-focus-dim); }
.ad-as { display: flex; align-items: center; gap: var(--s-2); flex-wrap: wrap; }
.ad-sub { font-size: var(--t-sm); opacity: 0.75;  overflow-wrap: anywhere; }
.ad-end { flex: none; font-size: var(--t-sm); opacity: 0.85; }
.ad-run { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-2) var(--s-3); border-radius: var(--r-md); background: var(--s2); }
.ad-run span { flex: 1; }
</style>
