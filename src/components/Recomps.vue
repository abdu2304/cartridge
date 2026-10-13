<template>
  <div class="rc">
    <!-- Recomps (0.9.65): native PC ports of console games, grouped by the console the game came from. Shown on the
         Steam card in Consoles and in Settings → Emulators → Recomps (kept out of Update All, owner) -->
    <div class="rc-bar">
      <div class="seg"><button v-for="f in FILTERS" :key="f.v" data-focus :data-key="'rcf-' + f.v" :class="{ on: filter === f.v }" @click="filter = f.v">{{ f.l }}<span v-if="f.v !== 'all' && counts[f.v]" class="count-dot">{{ counts[f.v] }}</span></button></div>
      <button class="btn small" data-focus :disabled="refreshing" @click="refresh"><Icon name="mdiSync" :size="18" :class="{ spin: refreshing }" />Check for New</button>
    </div>
    <p v-if="data" class="muted small rc-note">{{ note }}</p>
    <div v-if="!data" class="muted small"><Icon name="mdiSync" :size="16" class="spin" /> Reading the list…</div>
    <template v-else>
      <div v-if="!groups.length" class="muted small rc-empty">{{ filter === 'mine' ? 'No recomps installed yet. Pick one from All.' : filter === 'yours' ? 'None of the games in your library has a recomp in the list yet.' : 'The list is empty.' }}</div>
      <section v-for="g in groups" :key="g.key" class="rc-con">
        <div class="con-head"><PIcon v-if="SLUG[g.key]" :p="{ slug: SLUG[g.key], fs_slug: SLUG[g.key] }" :size="30" /><b>{{ g.name }}</b><span class="muted small">{{ g.items.length }}</span></div>
        <button v-for="e in g.items" :key="e.id" class="lrow rc-row" data-focus :data-key="'rc-' + e.id" @click="open(e)">
          <img v-if="coverOf(e)" class="rc-cover" :src="coverOf(e)" alt="" loading="lazy" />
          <span v-else class="rc-cover rc-none"><Icon name="mdiGamepadVariantOutline" :size="22" /></span>
          <span class="l-mid"><b>{{ e.name }}</b><span class="l-sub">{{ subOf(e) }}</span></span>
          <span class="l-end"><span class="status" :class="statusOf(e).cls"><Icon v-if="statusOf(e).icon" :name="statusOf(e).icon" :size="14" />{{ statusOf(e).text }}</span></span>
        </button>
      </section>
      <!-- not in the list: the same GitHub card as emulators (0.9.64): typed, searched or sent from the phone -->
      <section class="rc-con rc-link">
        <div class="con-head"><Icon name="mdiGithub" :size="26" /><b>From a Link</b></div>
        <p class="muted small">A recomp that isn’t in the list: paste its GitHub or GitLab link, say which game it’s for, and it’s added here like the others. Linux builds first, Windows through Proton, nothing else.</p>
        <LinkInput v-model="link" />
        <div class="row rc-link-row">
          <button class="btn" data-focus :disabled="!link" @click="pickConsole"><Icon name="mdiGamepadSquareOutline" :size="18" />{{ linkCon ? data.consoles[linkCon] : 'Console' }}</button>
          <button class="btn" data-focus :disabled="!link" @click="pickTitle"><Icon name="mdiFormatTitle" :size="18" />{{ linkTitle || 'Game' }}</button>
          <button class="btn primary" data-focus :disabled="!link || !linkCon || busy" @click="addLink"><Icon name="mdiPlus" :size="18" />Add</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { store, call, toast, openModal, choose, askText, romById, cover, bgJob } from '../store.js';
import Icon from './Icon.vue';
import PIcon from './PIcon.vue';
import LinkInput from './LinkInput.vue';

const props = defineProps({ embedded: Boolean, console: String });
// console folder keys to RomM slugs, for the console pictures (as EmuGet's SLUG)
const SLUG = { arcade: 'arcade', nes: 'nes', snes: 'snes', n64: 'n64', gb: 'gb', gbc: 'gbc', gba: 'gba', gamecube: 'ngc', nds: 'nds', wii: 'wii', genesis: 'genesis-slash-megadrive', psx: 'psx', ps2: 'ps2', ps4: 'ps4', xbox360: 'xbox360' };
const FILTERS = [{ v: 'all', l: 'All' }, { v: 'yours', l: 'For Your Games' }, { v: 'mine', l: 'Installed' }];
const ORIGIN = { recomp: 'Recompiled', decomp: 'Decompiled', recreation: 'Rebuilt', reimplementation: 'Rebuilt', disassembly: 'Disassembled' };
const data = ref(null), filter = ref('all'), refreshing = ref(false), busy = ref(false);
const link = ref(''), linkCon = ref(''), linkTitle = ref('');
let off = null;
async function load() { data.value = await call('recomps:list').catch(() => ({ entries: [], consoles: {} })); }
onMounted(() => { load(); off = window.cart.on('recomp-progress', (m) => { if (m.step === 'unpack') setTimeout(load, 1500); }); });
onBeforeUnmount(() => off?.());
const counts = computed(() => ({ yours: (data.value?.entries || []).filter((e) => e.roms.length).length, mine: (data.value?.entries || []).filter((e) => e.installed).length }));
const note = computed(() => {
  const n = data.value?.entries.length || 0;
  return `${n} recomps and native ports from PCGamingWiki’s list, checked for new ones once a day. Each needs your own copy of the game. They live in ${short(data.value?.folder)}.`;
});
const short = (p) => String(p || '').replace(store.info?.home || '\0', '~');
const groups = computed(() => {
  const d = data.value;
  if (!d) return [];
  const list = d.entries.filter((e) => (filter.value === 'mine' ? e.installed : filter.value === 'yours' ? e.roms.length : true) && (!props.console || e.games.some((g) => g.console === props.console)));
  const by = {};
  for (const e of list) (by[e.games[0]?.console || 'other'] ||= []).push(e);
  // installed first, then ones for your games, then A to Z
  const rank = (e) => (e.installed ? 0 : e.roms.length ? 1 : e.builds === 'none' || e.builds === 'site' ? 3 : 2);
  return Object.keys(d.consoles).filter((k) => by[k]).map((k) => ({ key: k, name: d.consoles[k], items: by[k].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)) }));
});
function coverOf(e) { const r = e.roms.length && romById(e.roms[0]); return r ? cover(r) : ''; }
function subOf(e) {
  const g = e.games.map((x) => x.title).join(', ');
  return [g, ORIGIN[e.origin] || '', e.from === 'found' ? 'Found on PCGamingWiki' : e.from === 'link' ? 'Added from a link' : ''].filter(Boolean).join(' · ');
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
async function open(e) { await openModal('recomp', { id: e.id }); load(); }
async function refresh() {
  refreshing.value = true;
  try { const r = await call('recomps:refresh'); toast(r.found ? `${r.found} new ${r.found === 1 ? 'recomp' : 'recomps'} found` : r.catalogue ? 'The list is up to date' : 'Nothing new', 'info', 2500, 'mdiCheck'); }
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
    const r = await call('recomps:addLink', { link: link.value, console: linkCon.value, title: linkTitle.value });
    toast(r.known ? 'That one is already in the list' : 'Added', 'ok', 2000, 'mdiCheck');
    link.value = ''; linkTitle.value = ''; await load();
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
</style>
