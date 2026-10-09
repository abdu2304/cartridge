<template>
  <div class="scrim" ref="el" @click.self="closeModal(null)">
    <div class="dialog fp">
      <div>
        <div class="eyebrow">{{ have.length ? 'Download More Files' : 'Choose What to Download' }}</div>
        <h2>{{ name }}</h2>
        <p class="muted small">{{ have.length ? `${have.length} of ${files.length} files are on this device. Tick the others you want: they go into the same folder.` : `This game is made of ${files.length} files. Tick the ones you want.` }}</p>
      </div>
      <button class="lrow fp-all" data-focus @click="toggleAll">
        <Icon :name="all ? 'mdiCheckboxMarked' : some ? 'mdiMinusBox' : 'mdiCheckboxBlankOutline'" :size="24" />
        <span class="l-mid"><b>Select All</b><span class="l-sub">{{ bytes(total) }} in all{{ have.length ? ', not counting what’s here' : '' }}</span></span>
      </button>
      <div class="fp-list" data-scroll>
        <template v-for="f in files" :key="f.file_name">
          <!-- already downloaded (Download More Files, 0.9.65): ticked and greyed, never picked again -->
          <div v-if="haveSet.has(f.file_name)" class="lrow fp-have">
            <Icon name="mdiCheckboxMarked" :size="24" />
            <span class="l-mid"><b>{{ f.file_name }}</b><span class="l-sub">On This Device{{ f.size ? ' · ' + bytes(f.size) : '' }}</span></span>
          </div>
          <button v-else class="lrow" :class="{ on: picked.has(f.file_name) }" data-focus @click="toggle(f.file_name)">
            <Icon :name="picked.has(f.file_name) ? 'mdiCheckboxMarked' : 'mdiCheckboxBlankOutline'" :size="24" />
            <span class="l-mid"><b>{{ f.file_name }}</b><span class="l-sub">{{ kindOf(f.file_name) }}{{ f.size ? ' · ' + bytes(f.size) : '' }}</span></span>
          </button>
        </template>
      </div>
      <div class="row" style="justify-content: flex-end; align-items: center">
        <span class="muted small">{{ picked.size ? `${picked.size} of ${open.length} · ${bytes(chosen)}` : 'Nothing ticked yet' }}</span>
        <button class="btn" data-focus @click="closeModal(null)">Cancel</button>
        <button class="btn primary" data-focus :disabled="!picked.size" @click="closeModal([...picked])"><Icon name="mdiDownload" />Download</button>
      </div>
    </div>
  </div>
</template>

<script setup>
// Which of a game's files to download (0.9.63, owner: "if a ROM has multiple files ask the user before download which
// one they want and an option to select all"). Nothing starts ticked; returns the picked file names, or null.
import { computed, onMounted, onBeforeUnmount, reactive, ref, nextTick } from 'vue';
import { pushLayer, focusFirst } from '../nav.js';
import { closeModal, bytes } from '../store.js';
import Icon from './Icon.vue';

const props = defineProps({ name: String, files: { type: Array, default: () => [] }, have: { type: Array, default: () => [] } });
const haveSet = computed(() => new Set(props.have));
const open = computed(() => props.files.filter((f) => !haveSet.value.has(f.file_name)));
const el = ref(null), picked = reactive(new Set());
const total = computed(() => open.value.reduce((a, f) => a + (f.size || 0), 0));
const chosen = computed(() => props.files.filter((f) => picked.has(f.file_name)).reduce((a, f) => a + (f.size || 0), 0));
const all = computed(() => picked.size === open.value.length), some = computed(() => picked.size > 0);
const toggle = (n) => (picked.has(n) ? picked.delete(n) : picked.add(n));
const toggleAll = () => { if (all.value) picked.clear(); else for (const f of open.value) picked.add(f.file_name); };
// what a file is, from its name (a PS4 package, an update, a disc), so the choice is clear without knowing extensions
function kindOf(n) {
  const e = (String(n).split('.').pop() || '').toLowerCase(), u = /\b(update|patch|v\d+(\.\d+)+|\[v\d+\])/i.test(n), dlc = /\b(dlc|add-?on)\b/i.test(n);
  const base = { pkg: 'Package', zip: 'Zip archive', '7z': '7z archive', rar: 'RAR archive', iso: 'Disc image', chd: 'Compressed disc', cue: 'Disc track list', bin: 'Disc data', m3u: 'Disc list', nsp: 'Switch package', xci: 'Switch cartridge', nsz: 'Compressed Switch package', wua: 'Wii U archive', vpk: 'Vita package', cia: '3DS package', exe: 'Program' }[e] || (e ? e.toUpperCase() + ' file' : 'File');
  return dlc ? base + ' · DLC' : u ? base + ' · Update' : base;
}
let layer;
onMounted(async () => {
  layer = pushLayer(el.value, { back: () => closeModal(null), start: () => closeModal(null), x: toggleAll, lb() {}, rb() {}, y() {}, select() {}, lt() {}, rt() {} });
  await nextTick(); focusFirst(el.value);
});
onBeforeUnmount(() => layer?.pop());
</script>

<style scoped>
.fp { width: min(720px, 94vw); max-height: 88vh; display: flex; flex-direction: column; gap: var(--s-3); }
.fp h2 { margin: 2px 0 6px; font-size: var(--t-xl); line-height: 1.15; overflow-wrap: anywhere; }
.fp-list { overflow-y: auto; min-height: 0; flex: 1; display: flex; flex-direction: column; gap: 4px; padding: 2px; }
.fp-list .lrow, .fp-all { flex: none; }
.fp .l-mid b { overflow-wrap: anywhere; }
.fp-have { opacity: 0.5; cursor: default; }
</style>
