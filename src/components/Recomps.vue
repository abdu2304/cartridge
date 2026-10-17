<template>
  <div class="rc">
    <!-- Recomps (0.9.70, owner: "a curated list ... cartridge verified"): the PC ports Cartridge checked and sets up
         for you, game by game; below them, ones you add from a GitHub link (Unverified, set up by their own steps) -->
    <div v-if="!data" class="muted small"><Icon name="mdiSync" :size="16" class="spin" /> Reading the list…</div>
    <template v-else>
      <section class="rc-con">
        <div class="con-head"><Icon name="mdiCheckDecagramOutline" :size="26" /><b>Cartridge Verified</b><span class="muted small">{{ verified.length }}</span></div>
        <p class="muted small rc-note">Each one checked by Cartridge, game by game: it installs the port, takes your own copy from your library, writes the port’s settings and starts it, Linux or Windows build alike. They live in {{ short(data.folder) }}.</p>
        <button v-for="e in verified" :key="e.id" class="lrow rc-row" data-focus :data-key="'rc-' + e.id" @click="open(e)">
          <img v-if="coverOf(e)" class="rc-cover" :src="coverOf(e)" alt="" loading="lazy" />
          <span v-else class="rc-cover rc-none"><Icon name="mdiGamepadVariantOutline" :size="22" /></span>
          <span class="l-mid"><b>{{ e.name }}</b><span class="l-sub">{{ vSub(e) }}</span></span>
          <span class="l-end"><span class="status" :class="vStatus(e).cls"><Icon v-if="vStatus(e).icon" :name="vStatus(e).icon" :size="14" />{{ vStatus(e).text }}</span></span>
        </button>
      </section>
      <section class="rc-con">
        <div class="con-head"><Icon name="mdiGithub" :size="26" /><b>From a GitHub Link</b><span v-if="links.length" class="muted small">{{ links.length }}</span></div>
        <p class="muted small">Unverified: a port Cartridge hasn’t checked. Paste its GitHub or GitLab link and say which game it’s for. Cartridge installs it and keeps its versions; it sets itself up by its own steps. Linux builds first, Windows through Proton.</p>
        <button v-for="e in links" :key="e.id" class="lrow rc-row" data-focus :data-key="'rc-' + e.id" @click="open(e)">
          <img v-if="coverOf(e)" class="rc-cover" :src="coverOf(e)" alt="" loading="lazy" />
          <span v-else class="rc-cover rc-none"><Icon name="mdiGamepadVariantOutline" :size="22" /></span>
          <span class="l-mid"><b>{{ e.name }}</b><span class="l-sub">{{ subOf(e) }}</span></span>
          <span class="l-end"><span class="status" :class="statusOf(e).cls"><Icon v-if="statusOf(e).icon" :name="statusOf(e).icon" :size="14" />{{ statusOf(e).text }}</span></span>
        </button>
        <LinkInput v-model="link" />
        <!-- Check It (0.9.69, as for emulators): what the project offers before anything is added -->
        <p v-if="check" class="small rc-note rc-check" :class="{ warn: check.bad }">{{ check.text }}</p>
        <p v-if="guessed" class="muted small rc-note">{{ guessed }}</p>
        <div class="row rc-link-row">
          <button class="btn" data-focus :disabled="!link" @click="pickConsole"><Icon name="mdiGamepadSquareOutline" :size="18" />{{ linkCon ? data.consoles[linkCon] : 'Console' }}</button>
          <button class="btn" data-focus :disabled="!link" @click="pickTitle"><Icon name="mdiFormatTitle" :size="18" />{{ linkTitle || 'Game' }}</button>
          <button class="btn primary" data-focus :disabled="!link || !linkCon || busy" @click="addLink"><Icon name="mdiPlus" :size="18" />Add</button>
        </div>
      </section>
      <div class="rc-bar">
        <Toggle :model-value="store.config.recomps?.daily !== false" label="Check for Updates Every Day" desc="Once a day, quietly: new and fixed recipes from Cartridge, and new releases of what you have installed. Updates are never installed by themselves." @update:model-value="(v) => saveConfig({ recomps: { ...(store.config.recomps || {}), daily: v } })" />
        <button class="btn small" data-focus :disabled="refreshing" @click="refresh"><Icon name="mdiSync" :size="18" :class="{ spin: refreshing }" />Check Now</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { store, call, toast, openModal, choose, askText, romById, cover, bgJob, saveConfig } from '../store.js';
import Toggle from './Toggle.vue';
import Icon from './Icon.vue';
import LinkInput from './LinkInput.vue';

const props = defineProps({ embedded: Boolean, console: String });
const ORIGIN = { recomp: 'Recompiled', decomp: 'Decompiled', recreation: 'Rebuilt', reimplementation: 'Rebuilt', disassembly: 'Disassembled' };
const data = ref(null), refreshing = ref(false), busy = ref(false);
const link = ref(''), linkCon = ref(''), linkTitle = ref(''), guessed = ref(''), linkDesc = ref(''), check = ref(null);
const mb = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);
function checkText(p) {
  if (p.known) return { text: 'That project is already in the list.', bad: false };
  const head = [p.repo.split(':')[1], p.stars != null ? `${p.stars.toLocaleString()} stars` : '', p.fork ? 'a fork' : ''].filter(Boolean).join(' · ');
  if (p.error) return { text: `${head}. Its releases couldn’t be read: ${p.error}`, bad: true };
  if (!p.tag) return { text: `${head}. It has no releases, so there’s nothing Cartridge can install.`, bad: true };
  if (!p.kind) return { text: `${head}. Newest release ${p.tag} has no Linux or Windows build, so Cartridge can’t install it.`, bad: true };
  return { text: `${head}. Newest release ${p.tag}: ${p.kind === 'windows' ? 'a Windows build, run through Proton' : 'a Linux build'} (${p.file}${p.size ? ', ' + mb(p.size) : ''}).`, bad: false };
}
// 0.9.66 (agreed plan): the console and game guessed from the project's name and description; you check them, then Add
let guessT = 0;
watch(link, (v) => {
  clearTimeout(guessT); guessed.value = ''; check.value = null;
  if (!/(github|gitlab)\.com\/[\w.-]+\/[\w.-]+|^[\w.-]+\/[\w.-]+$/i.test(String(v || '').trim())) return;
  guessT = setTimeout(async () => {
    call('recomps:preview', { link: v }).then((p) => { if (link.value === v && p) check.value = checkText(p); }).catch((er) => { if (link.value === v) check.value = { text: er.message, bad: true }; });
    const g = await call('recomps:guess', { link: v }).catch(() => null);
    if (!g || link.value !== v) return;
    linkDesc.value = g.description || '';
    if (g.console && !linkCon.value) linkCon.value = g.console;
    if (g.title && !linkTitle.value) linkTitle.value = g.title;
    if (g.console || g.title) guessed.value = 'Guessed from the project’s name and description. Check both before adding.';
  }, 700);
});
let off = null;
async function load() { data.value = await call('recomps:list').catch(() => ({ entries: [], consoles: {} })); }
onMounted(() => { load(); off = window.cart.on('recomp-progress', (m) => { if (m.step === 'unpack') setTimeout(load, 1500); }); });
onBeforeUnmount(() => off?.());
const short = (p) => String(p || '').replace(store.info?.home || '\0', '~');
// ready ones first, then ones for games in your library, then A to Z
const rankV = (e) => (e.state === 'play' || e.state === 'update' ? 0 : e.installed ? 1 : e.roms.length ? 2 : 3);
const verified = computed(() => (data.value?.entries || []).filter((e) => e.from === 'verified' && (!props.console || e.games.some((g) => g.console === props.console))).sort((a, b) => rankV(a) - rankV(b) || a.name.localeCompare(b.name)));
const links = computed(() => (data.value?.entries || []).filter((e) => e.from !== 'verified' && (!props.console || e.games.some((g) => g.console === props.console))).sort((a, b) => (b.installed ? 1 : 0) - (a.installed ? 1 : 0) || a.name.localeCompare(b.name)));
const VSTATE = { get: ['Get', 'none', 'mdiDownload'], game: ['Needs Your Copy', 'warn', 'mdiGamepadVariantOutline'], setup: ['Set Up', 'warn', 'mdiCogOutline'], play: ['Ready', 'ok', 'mdiCheck'], update: ['Update', 'warn', 'mdiUpdate'], broken: ['Repair', 'warn', 'mdiWrenchOutline'] };
function vStatus(e) {
  const job = bgJob('recomp:' + e.id) || bgJob('recompprep:' + e.id);
  if (job) return { text: job.pct != null ? `${job.pct}%` : job.text || 'Working', cls: 'none', icon: 'mdiSync' };
  const [text, cls, icon] = VSTATE[e.state] || VSTATE.get;
  return { text: e.state === 'get' && e.roms.length ? 'Your Game' : text, cls, icon: e.state === 'get' && e.roms.length ? 'mdiGamepadVariant' : icon };
}
function vSub(e) {
  const con = data.value?.consoles?.[e.games[0]?.console] || '';
  return [con, `By ${e.by.split(/[,(]/)[0].trim()}`, e.builds.some((b) => b.os === 'linux') ? 'Linux build' : 'Windows build, through Proton'].filter(Boolean).join(' · ');
}
function coverOf(e) { const r = e.roms.length && romById(e.roms[0]); return r ? cover(r) : ''; }
function subOf(e) {
  const g = e.games.map((x) => x.title).join(', ');
  return [g, ORIGIN[e.origin] || '', e.from === 'kept' ? 'Installed from the old list' : 'Added from a link'].filter(Boolean).join(' · ');
}
function statusOf(e) {
  const job = bgJob('recomp:' + e.id);
  if (job) return { text: job.pct != null ? `${job.pct}%` : job.text || 'Working', cls: 'none', icon: 'mdiSync' };
  if (e.installed && !e.installed.here) return { text: 'Missing', cls: 'warn', icon: 'mdiAlertOutline' };
  if (e.update) return { text: 'Update', cls: 'warn', icon: 'mdiUpdate' };
  if (e.installed && !e.installed.ready) return { text: 'Set Up', cls: 'warn', icon: 'mdiCogOutline' };
  if (e.installed) return { text: e.installed.kind === 'windows' ? 'Installed · Proton' : 'Installed', cls: 'ok', icon: 'mdiCheck' };
  if (e.builds === 'none') return { text: 'Build It Yourself', cls: 'none', icon: 'mdiHammerWrench' };
  if (e.builds === 'site') return { text: 'On Its Own Site', cls: 'none', icon: 'mdiWeb' };
  if (e.builds === 'windows') return { text: 'Windows · Proton', cls: 'none', icon: null };
  return { text: e.roms.length ? 'Your Game' : 'Get', cls: 'none', icon: e.roms.length ? 'mdiGamepadVariant' : 'mdiDownload' };
}
async function open(e) { await openModal(e.from === 'verified' ? 'verified' : 'recomp', { id: e.id }); load(); }
async function refresh() {
  refreshing.value = true;
  try { const r = await call('recomps:refresh'); toast(`Checked: ${r.recipes} verified ${r.recipes === 1 ? 'game' : 'games'}, ${r.checked} installed ${r.checked === 1 ? 'one' : 'ones'} looked at`, 'info', 3000, 'mdiCheck'); }
  catch (er) { toast(er.message, 'error'); }
  refreshing.value = false; load();
}
async function pickConsole() {
  const v = await choose({ title: 'Which Console Is the Game From?', options: Object.entries(data.value.consoles).map(([k, n]) => ({ label: n, value: k, raw: true })) });
  if (v) linkCon.value = v;
}
async function pickTitle() {
  const v = await askText({ title: 'Which Game Is It For?', value: linkTitle.value, placeholder: 'The game’s name', mode: 'game' });
  if (typeof v === 'string') linkTitle.value = v.trim();
}
async function addLink() {
  busy.value = true;
  try {
    const r = await call('recomps:addLink', { link: link.value, console: linkCon.value, title: linkTitle.value, description: linkDesc.value });
    toast(r.known ? 'That one is already in the list' : 'Added', 'ok', 2000, 'mdiCheck');
    link.value = ''; linkTitle.value = ''; linkCon.value = ''; guessed.value = ''; linkDesc.value = ''; check.value = null; await load();
    const e = data.value.entries.find((x) => x.id === r.id);
    if (e) open(e);
  } catch (er) { toast(er.message, 'error'); }
  busy.value = false;
}
</script>

<style scoped>
.rc { display: flex; flex-direction: column; gap: var(--s-3); }
.rc-bar { display: flex; gap: var(--s-2); align-items: center; flex-wrap: wrap; justify-content: space-between; }
.rc-note { margin: 0; }
.rc-con { display: flex; flex-direction: column; gap: 4px; }
.rc-con .con-head { display: flex; align-items: center; gap: var(--s-2); margin: var(--s-2) 0 2px; }
.rc-row { flex: none; }
.rc-cover { width: 44px; height: 44px; border-radius: var(--r-sm); object-fit: cover; flex: none; }
.rc-none { display: grid; place-items: center; background: var(--s2); color: var(--muted); }
.rc-row .l-mid b, .rc-row .l-sub { overflow-wrap: anywhere; }
.rc-link { gap: var(--s-2); margin-top: var(--s-3); }
.rc-link-row { gap: var(--s-2); flex-wrap: wrap; }
.rc-empty { padding: var(--s-3) 0; }
.rc-check { overflow-wrap: anywhere; }
.rc-check.warn { color: var(--danger-t, #ffa39c); }
</style>
