<template>
  <div :class="embedded ? 'pt-host' : 'scrim'" ref="el" @click.self="!embedded && closeModal(null)">
    <div class="pt" :class="{ dialog: !embedded }">
      <div>
        <template v-if="!embedded">
          <div class="eyebrow">{{ emuName === 'PPSSPP' ? 'Cheats' : emuName === 'Dolphin' ? 'Patches and cheats' : 'Patches' }} · {{ emuName }}</div>
          <h2>{{ name }}</h2>
        </template>
        <div class="muted small">{{ [serial, version ? (emuName === 'PCSX2' ? 'CRC ' : 'version ') + version : ''].filter(Boolean).join(' · ') }}</div>
        <div class="muted small">{{ emuName === 'PPSSPP' ? 'Cheats' : 'Patches' }} you turn on here stay on in {{ emuName }}, as if you ticked them there.<template v-if="emuName === 'PPSSPP' || emuName === 'Dolphin'"> Cheats also turn on {{ emuName }}’s Enable cheats setting.</template></div>
      </div>
      <!-- Dolphin (0.9.21, owner): one page per kind, LB/RB between them; each says how many are on -->
      <div v-if="tabs.length > 1 && !embedded" class="pt-tabs"><Btn b="LB" /><div class="seg"><button v-for="t in tabs" :key="t.k" data-focus :class="{ on: tab === t.k }" @click="tab = t.k">{{ t.l }}<span v-if="t.on" class="pt-count">{{ t.on }}</span></button></div><Btn b="RB" /></div>
      <div v-if="!list.length" class="muted" style="padding: 12px 2px">{{ why || `${emuName} has no patches for this game.` }}</div>
      <div v-else-if="!shown.length" class="muted" style="padding: 12px 2px">{{ EMPTY[tab] || 'Nothing here for this game.' }}</div>
      <div v-else class="pt-list" data-scroll>
        <template v-for="p in shown" :key="p.key">
        <button class="pt-row" :class="{ on: want[p.key], locked: p.by === 'emulator' }" data-focus data-expand @click="flip(p)">
          <span class="box"><Icon v-if="want[p.key]" name="mdiCheck" :size="18" /></span>
          <span class="pt-mid">
            <b>{{ emuName === 'Cemu' && p.name ? p.name : p.description }}</b>
            <span class="pt-sub">{{ [p.by === 'emulator' ? `On in ${emuName}` : '', emuName === 'Cemu' && p.name ? String(p.description || '').split('\n')[0] : '', emuName === 'Cemu' && choicesOf(p).length > 1 ? `${choicesOf(p).length} options` : '', p.version === 'All' ? 'Any version' : '', p.author ? 'by ' + p.author : '', p.notes].filter(Boolean).join(' · ') }}</span>
          </span>
        </button>
        <!-- 0.9.28 (owner: Cemu's resolution pack and others ask for a choice): its choices under it; 0.9.32 (owner:
             Mega Cheats has a dozen options) shown off or on, and picking one turns the pack on -->
          <div v-if="choicesOf(p).length" class="pt-presets" :class="{ off: !want[p.key] }">
            <div v-for="c in choicesOf(p)" :key="c.cat" class="pt-cat">
              <span class="pt-cat-l">{{ c.cat || 'Choice' }}</span>
              <div class="pt-chips"><button v-for="o in c.opts" :key="o" class="pt-chip" :class="{ on: (choice[p.key] || {})[c.cat] === o }" data-focus @click="choose(p, c.cat, o)">{{ o }}</button></div>
            </div>
          </div>
        </template>
      </div>
      <div v-if="otherNote" class="muted small">{{ otherNote }}</div>
      <div v-if="!embedded" class="row" style="justify-content: flex-end">
        <button class="btn" data-focus @click="closeModal(null)">{{ list.length ? 'Cancel' : 'Close' }}</button>
        <button v-if="list.length" class="btn primary" data-focus :disabled="!changed" @click="closeModal(changes())"><Icon name="mdiCheck" />Apply</button>
      </div>
      <div v-else-if="list.length || DL[emuName]" class="row" style="justify-content: flex-end">
        <!-- the emulator's own download (0.9.32 Cemu's community graphic packs, 0.9.33 RPCS3's and shadPS4's patches), newest now -->
        <button v-if="DL[emuName]" class="btn" data-focus :disabled="packsBusy" style="margin-right: auto" @click="packsDownload"><Icon :name="packsBusy ? 'mdiSync' : 'mdiDownload'" :class="{ spin: packsBusy }" />{{ packsBusy ? DL[emuName].busy : DL[emuName].label }}</button>
        <span v-if="changed" class="muted small" :style="DL[emuName] ? '' : 'margin-right: auto'">{{ changes().length }} change{{ changes().length === 1 ? '' : 's' }} to apply</span>
        <button class="btn" data-focus :disabled="!changed || busy" @click="undo">Undo</button>
        <button class="btn primary" data-focus :disabled="!changed || busy" @click="apply"><Icon name="mdiCheck" />Apply</button>
      </div>
    </div>
  </div>
</template>

<script setup>
// The emulator's own patches for one game (0.9.3 D7). Ticks change nothing until Apply; a patch
// turned on in the emulator itself can't be turned off here. Opened from the game page.
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue';
import { pushLayer, focusFirst } from '../nav.js';
import { call, closeModal, toast } from '../store.js';
import Icon from './Icon.vue';
import Btn from './Btn.vue';

// embedded (0.9.21): the Patches tabs of Game Add-ons (GameAddons.vue); section picks Dolphin's kind,
// and Apply saves here (ticks on every tab), since the sheet stays open
const props = defineProps({ name: String, emuName: { type: String, default: 'RPCS3' }, serial: String, version: String, why: String, list: { type: Array, default: () => [] }, embedded: Boolean, section: String, romId: Number, other: Object, ids: Array });
// Cemu (0.9.37): packs for this game that only list other regions' title IDs, which Cemu won't load for this copy
const otherNote = computed(() => {
  if (props.emuName !== 'Cemu' || !props.other) return '';
  const n = props.section ? props.other[props.section] || 0 : Object.values(props.other).reduce((a, b) => a + b, 0);
  return n ? `${n} more pack${n === 1 ? '' : 's'} for this game ${n === 1 ? 'is' : 'are'} made for another region’s copy only, so Cemu won’t load ${n === 1 ? 'it' : 'them'} for yours${props.ids?.length ? ` (title ID ${props.ids[0]})` : ''}.` : '';
});
const want = reactive(Object.fromEntries(props.list.map((p) => [p.key, p.on])));
const was = reactive(Object.fromEntries(props.list.map((p) => [p.key, p.on])));
// Dolphin's kinds of code, as its game properties shows them (patches, Action Replay, Gecko, graphics mods)
const KINDS = [{ k: 'OnFrame', l: 'Patches' }, { k: 'ActionReplay', l: 'AR Codes' }, { k: 'Gecko', l: 'Gecko Codes' }, { k: 'GraphicMods', l: 'Graphics Mods' }];
const EMPTY = { OnFrame: 'Dolphin has no patches for this game.', ActionReplay: 'No Action Replay codes for this game.', Gecko: 'No Gecko codes for this game.', GraphicMods: 'No graphics mods for this game. Mods go in Dolphin’s Load/GraphicMods folder.' };
// 0.9.23: shadPS4's two patch lists (its own and GoldHEN's) are tabs too, named after the list
const kinds = computed(() => (props.list.some((p) => KINDS.some((k) => k.k === p.section)) ? KINDS : [...new Set(props.list.map((p) => p.section).filter(Boolean))].map((k) => ({ k, l: k === 'shadPS4' ? 'shadPS4 Patches' : k }))));
const tabs = computed(() => (props.list.some((p) => p.section) ? kinds.value.map((t) => ({ ...t, on: props.list.filter((p) => p.section === t.k && want[p.key]).length })) : []));
const tab = ref((props.list.find((p) => p.section) || {}).section || 'OnFrame');
const shown = computed(() => (tabs.value.length ? props.list.filter((p) => p.section === (props.embedded ? props.section : tab.value)) : props.list));
const step = (d) => { const K = kinds.value; const i = K.findIndex((t) => t.k === tab.value); tab.value = K[(i + d + K.length) % K.length].k; requestAnimationFrame(() => focusFirst(el.value.querySelector('.pt-list') || el.value)); };
// a pack's choices (Cemu presets): categories with more than one option, and what's picked for each
const choicesOf = (p) => Object.entries(p.presets || {}).filter(([, v]) => v.length > 1).map(([cat, opts]) => ({ cat, opts }));
const pickedOf = (p) => Object.fromEntries(Object.entries(p.presets || {}).map(([k, v]) => [k, (p.chosen || {})[k] || v[0]]));
const choice = reactive(Object.fromEntries(props.list.filter((p) => p.presets).map((p) => [p.key, pickedOf(p)])));
const choiceWas = Object.fromEntries(Object.entries(choice).map(([k, v]) => [k, JSON.stringify(v)]));
const presetsMoved = (p) => p.presets && JSON.stringify(choice[p.key]) !== choiceWas[p.key];
function choose(p, cat, o) { choice[p.key] = { ...(choice[p.key] || {}), [cat]: o }; if (!want[p.key] && p.by !== 'emulator') want[p.key] = true; }
const changed = computed(() => props.list.some((p) => want[p.key] !== was[p.key] || (want[p.key] && presetsMoved(p))));
const changes = () => props.list.filter((p) => want[p.key] !== was[p.key] || (want[p.key] && presetsMoved(p))).map((p) => ({ key: p.key, on: want[p.key], ...(p.presets ? { presets: { ...choice[p.key] } } : {}) }));
const busy = ref(false), packsBusy = ref(false);
const emit = defineEmits(['reload']);
const DL = {
  Cemu: { label: 'Download Latest Community Graphic Packs', busy: 'Downloading Graphic Packs…' },
  RPCS3: { label: 'Download Latest Patches', busy: 'Downloading RPCS3’s Patches…' },
  shadPS4: { label: 'Download Latest Patches', busy: 'Downloading shadPS4 and GoldHEN Patches…' },
};
async function packsDownload() {
  packsBusy.value = true;
  try {
    const r = await call('patches:download', { romId: props.romId });
    toast(r.emu === 'Cemu' ? (r.updated ? `Cemu's graphic packs are now ${r.version}` : `Cemu's graphic packs are up to date${r?.version ? ' (' + r.version + ')' : ''}`)
      : r.emu === 'RPCS3' ? (r.updated ? 'RPCS3’s patch list is the newest now' : 'RPCS3’s patch list is up to date')
      : `shadPS4 and GoldHEN patches downloaded${r.partly ? '. ' + r.partly : ''}`, r.partly ? 'info' : 'ok', 4000, 'mdiDownload');
    emit('reload');
  }
  catch (e) { toast(e.message, 'error', 6000); }
  packsBusy.value = false;
}
function undo() { for (const p of props.list) want[p.key] = was[p.key]; }
async function apply() {
  busy.value = true;
  try {
    const r = await call('patches:apply', { romId: props.romId, changes: changes() });
    for (const p of props.list) { was[p.key] = want[p.key]; if (choice[p.key]) choiceWas[p.key] = JSON.stringify(choice[p.key]); }
    toast(r.count ? `Saved in ${props.emuName}. They apply next time the game starts.` : 'Nothing changed', 'ok', 3500, 'mdiPuzzleOutline');
  } catch (e) { toast(e.message, 'error', 7000); }
  busy.value = false;
}
defineExpose({ changed, apply });
function flip(p) {
  if (p.by === 'emulator') return toast(`Turned on in ${props.emuName}. Turn it off there.`, 'info', 3500);
  want[p.key] = !want[p.key];
}
const el = ref(null);
let layer;
onMounted(() => {
  if (props.embedded) return;
  layer = pushLayer(el.value, { back: () => closeModal(null), start: () => changed.value && closeModal(changes()), lb() { if (tabs.value.length) step(-1); }, rb() { if (tabs.value.length) step(1); }, x() {}, y() {}, select() {}, lt() {}, rt() {} });
  focusFirst(el.value);
});
onBeforeUnmount(() => layer?.pop());
</script>

<style scoped>
.pt { width: min(760px, 94vw); max-height: 88vh; display: flex; flex-direction: column; gap: var(--s-4); }
.pt-host { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.pt-host > .pt { width: auto; max-height: none; min-height: 0; flex: 1; }
.pt-tabs { display: flex; align-items: center; gap: var(--s-2); }
.pt-tabs .seg { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
.pt-tabs .seg button { flex: none; white-space: nowrap; }
.pt-count { margin-left: 6px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; display: inline-grid; place-items: center; font-size: 11px; font-weight: 800; background: var(--sel, rgba(255,255,255,.18)); }
.pt h2 { margin: 2px 0 6px; font-size: var(--t-xl); line-height: 1.15; }
.small { font-size: var(--t-sm); }
.pt-list { overflow-y: auto; min-height: 0; flex: 1; display: flex; flex-direction: column; gap: var(--s-2); padding: 2px; }
.pt-row { flex: none; display: flex; align-items: center; gap: var(--s-3); text-align: left; padding: var(--s-3) var(--s-4); border-radius: var(--r-md); background: var(--s1); color: inherit; border: 0; font: inherit; }
.pt-row:focus { background: var(--focus); color: var(--on-focus); outline: none; box-shadow: none; } /* the plain white box, no ring for the list edge to cut (0.9.16) */
.pt-row.locked { opacity: 0.75; }
.box { flex: none; width: 26px; height: 26px; border-radius: var(--r-sm); border: 2px solid currentColor; display: grid; place-items: center; opacity: 0.85; }
.pt-row.on .box { background: currentColor; }
.pt-row.on .box .icon { color: var(--s0); }
.pt-row.on:focus .box .icon { color: var(--focus); }
.pt-mid { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pt-sub { font-size: var(--t-sm); opacity: 0.75;  overflow-wrap: anywhere; }
.pt-presets.off { opacity: 0.6; }
.pt-presets { flex: none; display: flex; flex-direction: column; gap: 8px; margin: -4px 0 4px 44px; padding: 10px 12px; border-radius: var(--r-md); background: rgba(255, 255, 255, 0.04); }
.pt-cat { display: flex; flex-direction: column; gap: 6px; }
.pt-cat-l { font-size: var(--t-xs); color: var(--muted); font-weight: 600; }
.pt-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pt-chip { padding: 6px 12px; border-radius: 999px; border: 0; background: var(--s2); color: inherit; font: inherit; font-size: var(--t-sm); }
.pt-chip.on { background: var(--sel); color: var(--on-sel); font-weight: 650; }
.pt-chip:focus { background: var(--focus); color: var(--on-focus); outline: none; }
</style>
