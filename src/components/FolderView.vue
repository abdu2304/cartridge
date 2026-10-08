<template>
  <div class="scrim" ref="el" @click.self="closeModal(null)">
    <div class="dialog fv">
      <div class="fv-head">
        <div class="eyebrow">{{ title || 'Folder' }}</div>
        <h2>{{ name }}</h2>
        <button class="lrow fv-path" data-focus @click="copy"><Icon name="mdiFolderOutline" :size="20" /><div class="l-mid"><span class="l-sub">Where It Is</span><b class="mono">{{ short(d?.path || path) }}</b></div><span class="muted small">Copy</span></button>
      </div>
      <div class="fv-body" data-scroll>
        <div v-if="!d" class="muted small fv-wait">{{ err || 'Reading the folder…' }}</div>
        <div v-else-if="!d.entries.length" class="muted small fv-wait">This folder is empty.</div>
        <template v-else>
          <button v-if="depth" class="lrow fv-row" data-focus data-autofocus @click="up"><Icon name="mdiArrowUp" :size="22" /><div class="l-mid"><b>Up a Folder</b><span class="l-sub mono">{{ short(d.parent) }}</span></div></button>
          <button v-for="(e, i) in d.entries" :key="e.name" class="lrow fv-row" :class="{ file: !e.dir }" data-focus :data-autofocus="!depth && i === 0 ? '' : undefined" @click="e.dir ? into(e) : null">
            <Icon :name="e.dir ? 'mdiFolderOutline' : 'mdiFileOutline'" :size="22" />
            <div class="l-mid"><b class="mono">{{ e.name }}</b><span class="l-sub">{{ e.broken ? 'Can’t be read' : e.dir ? (e.link ? 'Folder (a link)' : 'Folder') : bytes(e.size) }}{{ e.at ? ' · ' + when(e.at) : '' }}</span></div>
            <Icon v-if="e.dir" name="mdiChevronRight" :size="20" />
          </button>
          <div v-if="d.more" class="muted small">Only the first 500 are shown.</div>
        </template>
      </div>
      <div class="row fv-foot"><span class="muted small">{{ depth ? 'B to go up' : 'B to close' }}</span><button class="btn" data-focus @click="closeModal(null)">Close</button></div>
    </div>
  </div>
</template>

<script setup>
// Cartridge's own folder sheet (0.9.60, owner: "Open Folder" in a game's saves opened another app, a search tool on his
// device). Read only: what's in a folder, how big and how new, and the folders inside to look into. B goes up a folder
// until the one it opened on, then closes.
import { computed, onMounted, onBeforeUnmount, ref, nextTick } from 'vue';
import { pushLayer, focusFirst } from '../nav.js';
import { store, call, closeModal, toast, bytes, ago } from '../store.js';
import Icon from './Icon.vue';

const props = defineProps({ path: String, title: String });
const el = ref(null), d = ref(null), err = ref(''), trail = ref([]);
const depth = computed(() => trail.value.length);
const name = computed(() => String(d.value?.path || props.path || '').split('/').filter(Boolean).pop() || '/');
const short = (p) => String(p || '').replace(store.info?.home || '\u0000', '~');
const when = (t) => (Date.now() - t < 7 * 86400e3 ? ago(t) : new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }));
async function load(p) {
  err.value = '';
  try { d.value = await call('fs:look', { path: p }); } catch (e) { err.value = e.message; d.value = null; }
  await nextTick(); focusFirst(el.value, '[data-autofocus]');
}
function into(e) { trail.value.push(d.value.path); load(d.value.path + '/' + e.name); }
function up() { const back = trail.value.pop(); load(back); }
async function copy() { await call('clip:write', { text: d.value?.path || props.path }); toast('Location copied', 'ok', 1800, 'mdiContentCopy'); }
let layer;
onMounted(() => {
  layer = pushLayer(el.value, { back: () => (depth.value ? up() : closeModal(null)), start: () => closeModal(null), x() {}, y() {}, select() {}, lb() {}, rb() {}, lt() {}, rt() {} });
  load(props.path);
});
onBeforeUnmount(() => layer?.pop());
</script>

<style scoped>
.fv { width: min(720px, 94vw); max-height: 90vh; display: flex; flex-direction: column; gap: var(--s-3); overflow: hidden; }
.fv-head { flex: none; display: flex; flex-direction: column; gap: 6px; }
.fv-head h2 { margin: 0; font-size: var(--t-xl); line-height: 1.15; overflow-wrap: anywhere; }
.fv-path { flex: none; }
.mono { font-family: ui-monospace, monospace; font-size: var(--t-xs); font-weight: 500; overflow-wrap: anywhere; }
.fv-row .l-mid b.mono { font-size: var(--t-sm); }
.small { font-size: var(--t-sm); margin: 0; }
.fv-body { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--s-2); padding: 4px; margin: -4px; }
.fv-row { flex: none; }
.fv-wait { padding: var(--s-3) 0; }
.fv-foot { flex: none; justify-content: space-between; align-items: center; }
</style>
