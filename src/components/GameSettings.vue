<template>
  <div class="scrim" ref="el" @click.self="closeModal(null)">
    <div class="dialog gs">
      <div class="gs-head">
        <img v-if="art" class="gs-cover" :src="art" />
        <div style="min-width: 0">
          <div class="eyebrow">{{ d?.name ? d.name + (d.version ? ' ' + d.version : '') + ' · ' : '' }}Game Settings</div>
          <h2>{{ name }}</h2>
          <p class="muted small">Only for this game, saved in {{ d?.name || 'the emulator' }}’s own per-game settings. Anything left on “{{ d?.name || 'Emulator' }}’s own” follows your normal settings.</p>
        </div>
      </div>
      <div v-if="!d" class="muted"><Icon name="mdiSync" :size="16" class="spin" /> Reading its settings…</div>
      <!-- 0.9.63: the version wasn't known, so settings whose choices changed between versions are shown but not changed -->
      <div v-else-if="d.versionUnknown && d.items?.some((x) => x.locked)" class="gs-warn muted small"><Icon name="mdiInformationOutline" :size="16" />Cartridge couldn’t tell which version of {{ d.name }} you have, so settings whose choices changed between its versions are locked. Change those in {{ d.name }} itself.</div>
      <div v-else-if="d.why" class="muted small">{{ d.why }}</div>
      <div v-else-if="!(d.items || []).length" class="muted small">{{ d.name || 'This emulator' }} has no per-game settings Cartridge can change for this game yet.</div>
      <!-- sections as tabs on L1/R1 (0.9.24, owner: the menu style across the board) -->
      <div v-if="d && tabs.length > 1" class="gs-tabs"><Btn b="LB" /><div class="seg"><button v-for="t in tabs" :key="t" tabindex="-1" :class="{ on: t === tab }" @click="tab = t">{{ t }}</button></div><Btn b="RB" /></div>
      <div v-else-if="!d" />
      <div v-if="d" class="gs-list" data-scroll :key="tab">
        <button v-if="tab === 'Steam' && fg" class="lrow" data-focus :disabled="busy" @click="pickFg">
          <span class="l-mid"><b>Frame Generation</b><span class="l-sub">{{ fg.own ? 'This game’s own' : `Follows ${fg.consoleOwn ? 'its console' : 'your default'}: ${FGL[fg.uses]}` }}. Its Steam shortcut changes at once.</span></span>
          <span class="l-end"><span class="status" :class="{ ok: fg.own }">{{ fg.own ? FGL[fg.own] : 'Default' }}</span></span>
        </button>
        <div v-if="tab === 'Steam' && !fg" class="lrow" data-focus tabindex="0"><span class="l-mid"><b>Frame Generation</b><span class="l-sub">{{ fgWhy || 'Looking…' }}</span></span></div>
        <!-- 0.9.62 (owner: advanced settings too): the emulator's own debug and expert settings, kept apart -->
        <div v-if="tab === 'Advanced'" class="gs-warn muted small"><Icon name="mdiAlertOutline" :size="16" />For testing and fixing problems. Some of these can stop the game starting; “{{ d.name }}’s own” puts any of them back.</div>
        <template v-for="(it, i) in shown" :key="it.id">
        <div v-if="it.group && it.group !== shown[i - 1]?.group" class="gs-group">{{ it.group }}</div>
        <button class="lrow" :class="{ 'gs-locked': it.locked }" data-focus data-expand :data-key="'gs-' + it.id" :disabled="busy" @click="pick(it)">
          <span class="l-mid"><b>{{ it.label }}</b><span class="l-sub">{{ it.locked ? `Its choices differ between ${d.name} versions: change it in ${d.name}` : it.sub || (it.game != null ? 'This game’s own' : `${d.name}’s own${it.base != null ? ': ' + labelOf(it, it.base) : ''}`) }}</span><span v-if="it.desc" class="l-sub gs-desc">{{ it.desc }}</span></span>
          <span class="l-end"><span class="status" :class="{ ok: it.game != null }">{{ it.game != null ? labelOf(it, it.game) : 'Default' }}</span></span>
        </button>
        </template>
      </div>
      <div class="row" style="justify-content: flex-end">
        <button v-if="d?.items?.some((x) => x.game != null)" class="btn" data-focus :disabled="busy" @click="resetAll"><Icon name="mdiRestore" />Back to {{ d.name }}’s Own</button>
        <button class="btn" data-focus @click="closeModal(null)">Done</button>
      </div>
    </div>
  </div>
</template>

<script setup>
// A game's emulator settings (0.9.23, owner: edit a game's settings in Cartridge, from the emulator's own
// per-game settings). The settings that matter most per emulator, written to its per-game file
// (electron/gameSettings.js); each pick is saved straight away.
import { computed, onMounted, onBeforeUnmount, ref, nextTick, watch } from 'vue';
import { pushLayer, focusFirst } from '../nav.js';
import { store, call, closeModal, toast, choose, romById, cover, askText } from '../store.js';
import Icon from './Icon.vue';
import Btn from './Btn.vue';
import { frameGenFor } from '../steam.js';

const props = defineProps({ romId: Number, name: String, tab: String, at: String });
const el = ref(null), d = ref(null), busy = ref(false);
const rom = computed(() => romById(props.romId));
const art = computed(() => (rom.value ? cover(rom.value) : ''));
const tab = ref(props.tab || ''); // back from a picker: the tab you were on (0.9.46: it fell to Steam, the only tab before the list loaded)
const tabs = computed(() => { const t = [...new Set((d.value?.items || []).map((x) => x.tab || 'General'))]; const a = t.indexOf('Advanced'); if (a >= 0) t.splice(a, 0, 'Steam'); else t.push('Steam'); return t; }); // Advanced stays last (0.9.62) // Steam always: frame generation says why when it can't apply (0.9.28)
const shown = computed(() => (d.value?.items || []).filter((x) => (x.tab || 'General') === tab.value));
watch(tabs, (t) => { if (d.value && !t.includes(tab.value)) tab.value = t[0] || ''; }, { immediate: true }); // only once the list is in: before it, Steam is the only tab
function stepTab(n) { const t = tabs.value; if (t.length < 2) return; tab.value = t[(t.indexOf(tab.value) + n + t.length) % t.length]; nextTick(() => el.value && focusFirst(el.value.querySelector('.gs-list') || el.value)); }
// frame generation for this game (0.9.24): the same pick as Settings → Steam → Frame generation
const FGL = { lsfg: 'Lossless Scaling (lsfg-vk)', mako: 'mako-run', off: 'Off' };
const fg = ref(null), fgWhy = ref('');
async function loadFg() {
  const f = await frameGenFor(props.romId);
  if (f.why) { fg.value = null; fgWhy.value = f.why; } else { fg.value = f; fgWhy.value = ''; }
}
async function pickFg() {
  const f = fg.value;
  const v = await choose({ title: 'Frame Generation', message: 'For this game only. Its Steam shortcut is updated at once.', sheet: true, options: [
    { label: 'Follow the Default', value: '__base', icon: 'mdiArrowULeftTop', selected: !f.own },
    ...(f.found.lsfg ? [{ label: FGL.lsfg, value: 'lsfg', selected: f.own === 'lsfg' }] : []),
    ...(f.found.mako ? [{ label: FGL.mako, value: 'mako', selected: f.own === 'mako' }] : []),
    { label: 'Off', value: 'off', icon: 'mdiClose', selected: f.own === 'off' },
  ] });
  reopen('fg');
  if (!v) return;
  busy.value = true;
  try { await call('steam:setFrameGen', { scope: 'game', id: props.romId, value: v === '__base' ? null : v }); await loadFg(); toast('Saved. Its Steam shortcut is being updated.', 'ok', 2800, 'mdiCheck'); }
  catch (e) { toast(e.message, 'error', 5000); }
  busy.value = false;
}
const labelOf = (it, v) => it.options.find((o) => String(o.value) === String(v))?.label || String(v);
let saved = null, layer;
// the picker takes the one modal slot: this sheet comes back after it
function reopen(at) { if (store.modal?.type !== 'gamesettings') store.modal = { type: 'gamesettings', props: { romId: props.romId, name: props.name, tab: tab.value, at: at || '' }, resolve: saved || (() => {}) }; }
async function pick(it) {
  // a locked setting (its version unknown): its own value can still go back to the emulator's, nothing else
  if (it.locked) { if (it.game == null) return toast(`${it.label} is changed in ${d.value.name} itself: its choices differ between versions.`, 'info', 4500, 'mdiInformationOutline'); const v = await choose({ title: it.label, message: `${d.value.name} versions number this setting differently, so Cartridge only puts it back.`, options: [{ label: `Back to ${d.value.name}’s Own`, value: 'base', icon: 'mdiRestore' }] }); reopen('gs-' + it.id); if (v === 'base') await save([{ id: it.id, value: null }]); return; }
  const cur = it.game;
  // the emulator's own first, then Type a Number or a Value (0.9.62, owner: type any number in its range), then the choices
  const range = it.num ? `${Math.abs(it.num.min) >= 1e6 && Math.abs(it.num.max) >= 1e6 ? 'Any number' : Math.abs(it.num.max) >= 1e6 ? `${it.num.min} or more` : `${it.num.min} to ${it.num.max}`}${it.num.unit ? ' ' + it.num.unit : ''}` : '';
  const v = await choose({ title: it.label, message: it.desc || it.sub || '', sheet: true, options: [
    { label: `${d.value.name}’s own`, sub: it.base != null ? `Now ${labelOf(it, it.base)}` : 'Follows your normal settings', value: '__base', icon: 'mdiArrowULeftTop', selected: cur == null, raw: true },
    ...(it.num ? [{ label: 'Type a Number', sub: `${range}${cur != null && !it.options.some((o) => String(o.value) === String(cur)) ? ' · now ' + cur : ''}`, value: '__num', icon: 'mdiNumeric', raw: true }] : []),
    ...(it.type === 'text' ? [{ label: 'Type a Value', sub: cur != null ? 'Now ' + cur : it.base != null ? `${d.value.name}’s own is ${it.base}` : '', value: '__text', icon: 'mdiFormTextbox', raw: true }] : []),
    ...it.options.map((o) => ({ label: o.label, value: o.value, selected: cur != null && String(cur) === String(o.value), raw: true })),
  ] });
  // a number of your own (0.9.29): the keyboard first, then this window again
  let value = v;
  if (v === '__num' || v === '__text') {
    const t = await askText({ title: it.label, value: cur != null ? String(cur) : it.base != null ? String(it.base) : '', placeholder: v === '__num' ? range : it.sub || '' });
    value = t != null && String(t).trim() ? String(t).trim() : null;
  }
  reopen('gs-' + it.id);
  if (value == null) return;
  await save([{ id: it.id, value: value === '__base' ? null : value }]);
}
async function save(changes) {
  busy.value = true;
  try { d.value = await call('gamesettings:set', { romId: props.romId, changes }); toast('Saved. It applies the next time the game starts.', 'ok', 2500, 'mdiTune'); }
  catch (e) { toast(e.message, 'error', 6000); }
  busy.value = false;
}
async function resetAll() { await save((d.value.items || []).filter((x) => x.game != null).map((x) => ({ id: x.id, value: null }))); }
onMounted(async () => {
  saved = store.modal?.resolve;
  layer = pushLayer(el.value, { back: () => closeModal(null), start: () => closeModal(null), lb: () => stepTab(-1), rb: () => stepTab(1), x() {}, y() {}, select() {}, lt() {}, rt() {} });
  loadFg();
  d.value = await call('gamesettings:get', { romId: props.romId }).catch((e) => ({ why: e.message, items: [] }));
  await nextTick();
  if (!el.value) return; // closed (or reopened) while its settings were loading (0.9.63, owner's log: a null querySelector)
  // back from a picker: the row you picked from, else the first
  const back = props.at && el.value.querySelector(props.at === 'fg' ? '.gs-list .lrow' : `[data-key="${CSS.escape(props.at)}"]`);
  if (back) { back.focus({ preventScroll: true }); back.scrollIntoView({ block: 'center' }); } else focusFirst(el.value);
});
onBeforeUnmount(() => layer?.pop());
</script>

<style scoped>
.gs { width: min(960px, 94vw); max-height: 88vh; display: flex; flex-direction: column; gap: var(--s-3); }
.gs-locked .l-mid b { opacity: 0.6; }
.gs-head { display: flex; gap: var(--s-4); align-items: flex-start; }
.gs-head h2 { margin: 2px 0 6px; font-size: var(--t-xl); line-height: 1.15; }
.gs-head p { margin: 0; line-height: 1.45; }
.gs-cover { width: 64px; aspect-ratio: 2 / 3; object-fit: cover; border-radius: var(--r-md); flex: none; box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45); }
.gs-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding: 4px; }
.gs-list > * { flex: none; }
.gs-group { flex: none; padding: 10px 4px 2px; font-size: var(--t-xs); font-weight: 700; color: var(--muted); letter-spacing: 0.02em; }
.gs-tabs { display: flex; align-items: center; gap: 10px; align-self: flex-start; max-width: 100%; }
.gs-tabs .seg { flex-wrap: wrap; }
.gs-warn { flex: none; display: flex; gap: 8px; align-items: flex-start; padding: 6px 4px 8px; line-height: 1.4; }
.gs-list .lrow:not(.expanded) .gs-desc { display: none; } /* hold A on a row for what the setting does */ /* 0.9.61: Dolphin has eight tabs; on a narrow window they wrap rather than run off */
</style>
