<template>
  <div class="scrim" ref="el" @click.self="leave">
    <div class="dialog ga">
      <div class="ga-head">
        <img v-if="art" class="ga-cover" :src="art" />
        <div class="ga-title">
          <div class="eyebrow">Game Add-ons{{ patches?.emuName ? ' · ' + patches.emuName : '' }}</div>
          <h2>{{ name }}</h2>
        </div>
      </div>
      <div v-if="tabs.length > 1" class="ga-tabs"><Btn b="LB" /><div class="seg strip"><button v-for="t in tabs" :key="t.k" data-focus :data-key="'ga-' + t.k" :class="{ on: tab === t.k }" @click="pick(t.k)">{{ t.l }}</button></div><Btn b="RB" /></div>

      <!-- each part stays alive once opened, so ticks and lists survive moving between tabs -->
      <div ref="body" class="ga-body">
        <AddonsSheet v-if="seen.addons" ref="ads" v-show="tab === 'mods' || tab === 'tex'" :rom-id="romId" :name="name" embedded :kind="tab === 'mods' ? 'mods' : 'tex'" :on-reopen="reopen" />
        <div v-if="seen.patches && !patches && patchTab" class="muted"><Icon name="mdiSync" :size="16" class="spin" /> Reading {{ PATCH_EMU_OF(slug) }}’s list…</div>
        <PatchesSheet v-if="patches" v-show="patchTab" ref="pt" v-bind="patches" :name="name" :rom-id="romId" embedded :section="sectionOf(tab)" @reload="loadPatches" />
        <template v-if="tab === 'updates'">
          <div class="ga-up">
            <div class="muted small">From Sony’s own update list, installed into RPCS3 one after another, oldest first. Patches made for a game’s last update need it.</div>
            <div v-if="!up" class="muted"><Icon name="mdiSync" :size="16" class="spin" /> Checking Sony’s update list…</div>
            <template v-else>
              <div class="ga-ver"><span>{{ up.serial }}</span><span>Installed: <b>{{ up.have || 'unknown' }}</b></span><span v-if="up.latest">Newest: <b>{{ up.latest }}</b></span></div>
              <div v-if="up.error" class="muted">Couldn’t check Sony’s update list: {{ up.error }}</div>
              <div v-else-if="!up.todo.length" class="status ok" style="align-self: flex-start"><Icon name="mdiCheck" :size="14" />Up to date</div>
              <div v-else class="ga-list" data-scroll>
                <div v-for="p in up.todo" :key="p.version" class="ga-row"><Icon name="mdiPackageUp" :size="22" /><span class="ga-mid"><b>Update {{ p.version }}</b><span class="ga-sub">{{ bytes(p.size) }}</span></span></div>
              </div>
              <div v-if="upRun" class="ga-run"><Icon name="mdiSync" :size="18" class="spin" /><span>{{ upText }}</span></div>
              <div class="row" style="justify-content: flex-end">
                <button class="btn" data-focus :disabled="!!upRun" @click="loadUp(true)"><Icon name="mdiRefresh" />Check again</button>
                <button v-if="up.todo?.length" class="btn primary" data-focus :disabled="!!upRun" @click="installUp"><Icon name="mdiPackageDown" />Install {{ up.todo.length }} update{{ up.todo.length === 1 ? '' : 's' }} · {{ bytes(up.size) }}</button>
              </div>
            </template>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
// Game Add-ons (0.9.21, owner: game updates, patches and add-ons in one place, one tab each). Only the tabs
// the game's console has are shown; LB/RB move between them. Mods and Texture Packs are AddonsSheet,
// Patches (Dolphin: one tab per kind of code) is PatchesSheet, Game Updates is Sony's list for PS3.
import { computed, nextTick, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { pushLayer, focusFirst } from '../nav.js';
import { store, call, closeModal, toast, bytes, romById, cover, bgJob } from '../store.js';
import Icon from './Icon.vue';
import Btn from './Btn.vue';
import AddonsSheet from './AddonsSheet.vue';
import PatchesSheet from './PatchesSheet.vue';

const props = defineProps({ romId: Number, name: String, tab: String });
const el = ref(null), body = ref(null), pt = ref(null), ads = ref(null);
const rom = computed(() => romById(props.romId));
const slug = computed(() => `${rom.value?.platform_slug || ''} ${rom.value?.platform_fs_slug || ''}`);
const art = computed(() => (rom.value ? cover(rom.value) : ''));
// 0.9.52: Nexus Mods (PS3 too) and ROM hacks (cartridge consoles) also live in the Mods tab
const ADDONS = /\b(ps2|psx|ngc|gamecube|wii|psp|3ds|n3ds|switch|wiiu|ps4|ps3|nes|famicom|snes|sfam|n64|gb|gbc|gba|nds|genesis-slash-megadrive|sms|gamegear|turbografx16--1)\b/i, TEXTURES = /\b(ps2|psx|ngc|gamecube|wii|psp|3ds|n3ds)\b/i;
const PATCHES = [[/ps3/i, 'RPCS3'], [/ps4/i, 'shadPS4'], [/\bps2\b/i, 'PCSX2'], [/\b(ngc|gamecube|gc|wii)\b/i, 'Dolphin'], [/\bpsp\b/i, 'PPSSPP'], [/\bwiiu\b/i, 'Cemu']];
const PATCH_EMU_OF = (s) => (PATCHES.find(([re]) => re.test(s)) || [])[1] || '';
// Dolphin's kinds of code, as its game properties shows them
const DOLPHIN = [{ k: 'p:OnFrame', l: 'Patches' }, { k: 'p:ActionReplay', l: 'AR Codes' }, { k: 'p:Gecko', l: 'Gecko Codes' }, { k: 'p:GraphicMods', l: 'Graphics Mods' }];
const sectionOf = (k) => (k.startsWith('p:') ? k.slice(2) : '');
const patches = ref(null);
const tabs = computed(() => {
  const s = slug.value, out = [];
  // Texture Packs only where the emulator replaces textures (Switch and Wii U emulators take mods only)
  if (ADDONS.test(s)) out.push({ k: 'mods', l: 'Mods' });
  if (TEXTURES.test(s)) out.push({ k: 'tex', l: 'Texture Packs' });
  const pe = PATCH_EMU_OF(s);
  if (pe === 'Dolphin') out.push(...DOLPHIN);
  // 0.9.24; Cheats 0.9.32 (Mega Cheats): Cemu's graphic packs, as its own window groups them. 0.9.37 (owner: "they're
  // not there"): once the packs are read, only the groups this game has, each with its count (Graphics always)
  else if (pe === 'Cemu') {
    const all = [['Graphics', 'Graphics'], ['Enhancements', 'Enhancements'], ['Mods', 'Graphic Pack Mods'], ['Workarounds', 'Workarounds'], ['Cheats', 'Cheats']];
    // 0.9.63 (owner: R1 to Graphics "hides everything else"): every group showed until the packs were read, then the
    // empty ones went. Now the packs are read as the window opens and the tabs appear once, already counted
    const l = patches.value?.list;
    if (l) for (const [k, label] of all) { const n = l.filter((p) => p.section === k).length; if (n || k === 'Graphics') out.push({ k: 'p:' + k, l: n ? `${label} · ${n}` : label }); }
  }
  else if (pe === 'shadPS4') out.push({ k: 'p:shadPS4', l: 'shadPS4 Patches' }, { k: 'p:GoldHEN', l: 'GoldHEN' }); // 0.9.23: its two lists, LB/RB between them
  else if (pe) out.push({ k: 'p', l: pe === 'PPSSPP' ? 'Cheats' : 'Patches' });
  if (/ps3/i.test(s)) out.push({ k: 'updates', l: 'Game Updates' });
  return out;
});
const first = () => (tabs.value.find((t) => t.k === props.tab || (props.tab === 'patches' && t.k.startsWith('p'))) || tabs.value[0] || {}).k || '';
const tab = ref(first());
const patchTab = computed(() => tab.value === 'p' || tab.value.startsWith('p:'));
const seen = reactive({ addons: false, patches: false, updates: false });
function show(k) {
  tab.value = k;
  if (k === 'mods' || k === 'tex') seen.addons = true;
  if (patchTab.value && !seen.patches) { seen.patches = true; loadPatches(); }
  if (k === 'updates' && !seen.updates) { seen.updates = true; loadUp(); }
}
function pick(k) { show(k); }
function step(d) {
  const t = tabs.value, i = t.findIndex((x) => x.k === tab.value), n = t[(i + d + t.length) % t.length].k;
  show(n);
  nextTick(() => focusFirst(el.value, `[data-key="ga-${n}"]`));
}
async function loadPatches() {
  try { patches.value = await call('patches:list', { romId: props.romId }); }
  catch (e) { patches.value = { emuName: PATCH_EMU_OF(slug.value), list: [], why: e.message }; }
}

// PS3 game updates
const up = ref(null), upRun = ref(false), upText = ref('');
async function loadUp(fresh = false) {
  up.value = null;
  up.value = (await call('ps3up:game', { romId: props.romId, fresh }).catch((e) => ({ error: e.message, todo: [] }))) || { error: 'This game’s serial couldn’t be read.', todo: [] };
}
let upCalling = false;
// 0.9.32: updates installing from an earlier visit show here again, and finish on their own
watch(() => bgJob('ps3:' + props.romId), (j) => { if (j) { upRun.value = true; upText.value = `${j.text || 'Downloading'}${j.pct != null ? ' · ' + j.pct + '%' : ''}`; } else if (upRun.value && !upCalling) { upRun.value = false; loadUp(); } }, { immediate: true });
async function installUp() {
  upRun.value = true; upText.value = 'Starting'; upCalling = true;
  try { const r = await call('ps3up:install', { romId: props.romId }); toast(`${props.name} updated${r.version ? ' to ' + r.version : ''}`, 'ok', 3500, 'mdiPackageUp'); } catch (e) { toast(e.message, 'error', 6000); }
  upCalling = false; upRun.value = false; loadUp();
}

// the add-ons tab asks before removing, which takes the one modal slot: come back to the same tab
let saved = null;
function reopen() { if (store.modal?.type !== 'gameaddons') store.modal = { type: 'gameaddons', props: { romId: props.romId, name: props.name, tab: tab.value }, resolve: saved || (() => {}) }; }
// ticks on the Patches tabs change nothing until Apply; B once warns, B again leaves without them
let warned = false;
function leave() {
  if (pt.value?.changed && !warned) { warned = true; return toast('Your patch changes aren’t applied yet. Press Apply, or B again to leave without them.', 'info', 4000); }
  closeModal(null);
}
let off = null, layer;
onMounted(() => {
  saved = store.modal?.resolve;
  off = window.cart.on('ps3-update', (m) => { if (m.romId !== props.romId) return; upText.value = m.state === 'downloading' ? `Downloading ${m.version} · ${m.pct}%` : m.state === 'installing' ? `Installing ${m.version || ''} in RPCS3` : m.state === 'done' ? 'Done' : upText.value; });
  layer = pushLayer(el.value, { back: leave, lb: () => tabs.value.length > 1 && step(-1), rb: () => tabs.value.length > 1 && step(1), x() {}, y() {}, select() {}, lt() {}, rt() {},
    // the right stick moves between mod sites on the Mods tab (0.9.52)
    rsleft: () => { if (tab.value === 'mods') ads.value?.stepSource(-1); }, rsright: () => { if (tab.value === 'mods') ads.value?.stepSource(1); } });
  show(tab.value);
  if (PATCH_EMU_OF(slug.value) === 'Cemu' && !seen.patches) { seen.patches = true; loadPatches().then(() => { if (props.tab === 'patches' && !patchTab.value) { const t = tabs.value.find((x) => x.k.startsWith('p:')); if (t) { show(t.k); nextTick(() => focusFirst(el.value, `[data-key="ga-${t.k}"]`)); } } }); }
  nextTick(() => focusFirst(el.value, `[data-key="ga-${tab.value}"]`));
});
onBeforeUnmount(() => { layer?.pop(); off?.(); });
</script>

<style scoped>
.ga { width: min(860px, 94vw); height: min(88vh, 900px); display: flex; flex-direction: column; gap: var(--s-4); }
.ga-head { display: flex; align-items: center; gap: var(--s-4); }
.ga-cover { width: 56px; height: 56px; object-fit: cover; border-radius: var(--r-sm); flex: none; }
.ga-title { min-width: 0; }
.ga h2 { margin: 2px 0 0; font-size: var(--t-xl); line-height: 1.15;  overflow-wrap: anywhere; }
.ga-tabs { display: flex; align-items: center; gap: var(--s-2); min-width: 0; }
.ga-tabs > :not(.seg) { flex: none; }


.ga-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.ga-up { display: flex; flex-direction: column; gap: var(--s-3); min-height: 0; flex: 1; }
.ga-ver { display: flex; flex-wrap: wrap; gap: var(--s-4); font-size: var(--t-sm); opacity: 0.85; }
.ga-list { overflow-y: auto; min-height: 0; flex: 1; display: flex; flex-direction: column; gap: var(--s-2); padding: 2px; }
.ga-row { flex: none; display: flex; align-items: center; gap: var(--s-3); padding: var(--s-3) var(--s-4); border-radius: var(--r-md); background: var(--s1); }
.ga-mid { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.ga-sub { font-size: var(--t-sm); opacity: 0.75; }
.ga-run { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-2) var(--s-3); border-radius: var(--r-md); background: var(--s2); }
.small { font-size: var(--t-sm); }
</style>
