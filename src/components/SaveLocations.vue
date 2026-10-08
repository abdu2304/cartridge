<template>
  <div class="scrim" ref="el" @click.self="closeModal(null)">
    <div class="dialog sl">
      <div class="sl-head">
        <div class="eyebrow">Cartridge Save Sync</div>
        <h2>Where Your Saves Are</h2>
        <p class="muted small">Every place your emulators keep saves on this device, read from their own settings. Only the folders in use are synced. Old copies and anything the search finds are shown here and left alone until you choose.</p>
      </div>
      <div class="row sl-acts">
        <button class="btn" :class="{ primary: !d?.search }" data-focus data-autofocus :disabled="searching" @click="search"><Icon name="mdiFolderSearchOutline" :class="{ spin: searching }" />{{ searching ? 'Searching…' : 'Search for Saves' }}</button>
        <span class="muted small sl-note">{{ searchNote }}</span>
      </div>

      <div class="sl-body" data-scroll>
        <div v-if="!d" class="muted sl-wait">{{ err || 'Looking at your emulators…' }}</div>
        <div v-else-if="!d.emus.length" class="muted small">No emulator with saves on this device yet. Set one up in Settings → Emulators, play a game once, and its folder shows here.</div>
        <section v-for="e in d?.emus || []" :key="e.emu" class="sl-emu">
          <div class="sl-emu-top">
            <EmuIcon :id="e.emu" :size="30" />
            <b>{{ e.name }}</b>
            <span v-if="!e.synced" class="status">Not Synced</span>
          </div>
          <!-- each place: in use, picked by you, or an old copy -->
          <div v-for="p in e.places" :key="p.loc + p.place" class="sl-place" :class="p.loc">
            <div class="sl-place-top">
              <span class="sl-tag" :class="tagOf(p).k">{{ tagOf(p).t }}</span>
              <span class="muted small">{{ countText(p) }}</span>
            </div>
            <b class="mono">{{ short(p.place) }}</b>
            <span class="muted small">{{ whyText(p, e) }}</span>
            <div class="row sl-row-acts">
              <button v-if="p.loc === 'old' && p.saves" class="btn small" data-focus @click="move(e, p)"><Icon name="mdiFolderMoveOutline" :size="18" />Move Into Use</button>
              <button v-if="p.saves" class="btn small" data-focus @click="list(e, p)"><Icon name="mdiFormatListBulleted" :size="18" />Saves</button>
              <button v-if="p.exists" class="btn small" data-focus @click="openFolder(p.place)"><Icon name="mdiFolderOpenOutline" :size="18" />Open Folder</button>
              <button v-if="p.why === 'added'" class="btn small" data-focus @click="forget(e, p)"><Icon name="mdiFolderRemoveOutline" :size="18" />Stop Using</button>
            </div>
          </div>
          <!-- what Search for Saves found away from the usual places -->
          <div v-for="f in e.found" :key="'f' + f.place" class="sl-place found">
            <div class="sl-place-top">
              <span class="sl-tag found">Found Elsewhere</span>
              <span class="muted small">{{ f.saves === 1 ? '1 save' : f.saves + ' saves' }}{{ f.newest ? ' · newest ' + ago(f.newest) : '' }}</span>
            </div>
            <b class="mono">{{ short(f.place) }}</b>
            <span class="muted small">Not synced. Use This Folder if {{ e.name }} really keeps its saves here, or Move Into Use to bring them to the folder it uses now.</span>
            <div class="row sl-row-acts">
              <button class="btn small" data-focus @click="use(e, f)"><Icon name="mdiFolderCheckOutline" :size="18" />Use This Folder</button>
              <button class="btn small" data-focus @click="move(e, f, true)"><Icon name="mdiFolderMoveOutline" :size="18" />Move Into Use</button>
              <button class="btn small" data-focus @click="list(e, f)"><Icon name="mdiFormatListBulleted" :size="18" />Saves</button>
              <button class="btn small" data-focus @click="openFolder(f.place)"><Icon name="mdiFolderOpenOutline" :size="18" />Open Folder</button>
            </div>
          </div>
        </section>
      </div>
      <div class="row sl-foot"><span class="muted small">B to close</span><button class="btn" data-focus @click="closeModal(null)">Close</button></div>
    </div>
  </div>
</template>

<script setup>
// Where Your Saves Are (0.9.59, the save locator; owner: "search all layouts to find accurate saves … build a system
// around this"). saves:locations lists, per emulator, the places it keeps saves (in use from its own settings, old
// copies it no longer reads, folders you picked) and what Search for Saves found elsewhere. Moving and picking are
// yours to do; nothing here syncs an old or found copy on its own.
import { computed, onMounted, onBeforeUnmount, ref, nextTick } from 'vue';
import { pushLayer, focusFirst } from '../nav.js';
import { store, call, closeModal, toast, ago, confirm, choose } from '../store.js';
import Icon from './Icon.vue';
import EmuIcon from './EmuIcon.vue';

const el = ref(null), d = ref(null), err = ref(''), searching = ref(false), prog = ref(null);
const short = (p) => String(p || '').replace(store.info?.home || '\u0000', '~');
const TAG = { use: { t: 'In Use', k: 'use' }, added: { t: 'Picked by You', k: 'use' }, old: { t: 'Old Copy', k: 'old' } };
const tagOf = (p) => (p.why === 'added' ? TAG.added : TAG[p.loc] || TAG.use);
const countText = (p) => (p.saves ? `${p.saves === 1 ? '1 save' : p.saves + ' saves'}${p.newest ? ' · newest ' + ago(p.newest) : ''}` : p.exists ? 'No saves yet' : 'Not made yet');
function whyText(p, e) {
  const n = e.name;
  if (p.why === 'added') return 'You picked this folder. Cartridge reads and syncs it like the emulator’s own.';
  if (p.why === 'setting') return `From ${n}’s own settings.`;
  if (p.why === 'portable') return `A portable ${n}: its own user folder.`;
  if (p.why === 'older') return `Where older ${n} builds kept saves. ${n} doesn’t read it any more.`;
  if (p.why === 'unused') return `${n}’s usual folder. Not read any more: a setting in ${n} moved its saves.`;
  return p.loc === 'use' ? `Where ${n} keeps saves.` : `${n} doesn’t read this folder any more.`;
}
const searchNote = computed(() => {
  if (searching.value) return prog.value ? `${(prog.value.dirs || 0).toLocaleString()} folders looked at${prog.value.found ? ` · ${prog.value.found} found` : ''}` : 'Starting';
  const s = d.value?.search;
  if (!s) return 'Looks through your home folder and your other drives for save folders not in the usual places.';
  return `Last searched ${ago(s.at)} · ${(s.dirs || 0).toLocaleString()} folders${s.done ? '' : ' (stopped at the time limit)'}`;
});

async function load() {
  try { d.value = await call('saves:locations'); searching.value = !!d.value?.searching || searching.value; } catch (e) { err.value = e.message; }
}
async function search() {
  searching.value = true; prog.value = null;
  try {
    const r = await call('saves:search');
    toast(r.found ? `Found ${r.saves === 1 ? '1 save' : r.saves + ' saves'} in ${r.found === 1 ? '1 other place' : r.found + ' other places'}` : 'No saves away from the usual places', r.found ? 'ok' : 'info', 3500, 'mdiFolderSearchOutline');
  } catch (e) { toast(e.message, 'error', 5000); }
  searching.value = false; await load();
}
async function openFolder(p) { try { await call('fs:openFolder', { path: p }); } catch (e) { toast(e.message, 'error', 4000); } }
// single modal slot: a question replaces this sheet, which then opens itself again
function reopen(outer) { store.modal = { type: 'savelocations', props: {}, resolve: outer }; }
async function move(e, p, found = false) {
  const outer = store.modal.resolve;
  const yes = await confirm('Move These Saves Into Use?', `Each save here goes into the folder ${e.name} uses now. When the save already there is newer, it stays and nothing moves. The one a save replaces is backed up first, and the copy here is kept, renamed, never deleted. Close ${e.name} first.`, 'Move');
  if (yes) {
    try {
      const r = await call('saves:moveCopy', found ? { emu: e.emu, base: p.base, at: p.at } : { emu: e.emu, place: p.place });
      const parts = [r.moved ? `${r.moved} moved` : '', r.newer ? `${r.newer} kept (newer in use)` : '', r.unplaced ? `${r.unplaced} with no folder in use yet` : ''].filter(Boolean);
      toast(r.errors?.length ? r.errors[0] : parts.join(' · ') || 'Nothing to move', r.errors?.length ? 'error' : 'ok', 4500, 'mdiFolderMoveOutline');
    } catch (x) { toast(x.message, 'error', 6000); }
  }
  reopen(outer);
}
async function use(e, f) {
  const outer = store.modal.resolve;
  const yes = await confirm('Use This Folder?', `Cartridge reads ${e.name} saves from ${short(f.place)} from now on and syncs them, and saves from your other devices for ${e.name} go here too. Only do this if ${e.name} really uses this folder.`, 'Use This Folder');
  if (yes) { try { await call('saves:useFolder', { emu: e.emu, base: f.base, at: f.at }); toast('Folder in use', 'ok', 2500, 'mdiFolderCheckOutline'); } catch (x) { toast(x.message, 'error', 5000); } }
  reopen(outer);
}
async function forget(e, p) {
  try { await call('saves:forgetFolder', { emu: e.emu, place: p.place }); toast('No longer used', 'ok', 2200); } catch (x) { toast(x.message, 'error', 5000); }
  await load();
}
async function list(e, p) {
  const outer = store.modal.resolve;
  await choose({ sheet: true, title: `${e.name} · ${p.saves === 1 ? '1 save' : p.saves + ' saves'}`, message: short(p.place), options: (p.list || []).map((s, i) => ({ label: s.label || s.path.split('/').pop(), sub: [s.sub, s.keys?.serial || s.keys?.switch || '', s.at ? ago(s.at) : ''].filter(Boolean).join(' · '), value: String(i), icon: 'mdiContentSaveOutline', raw: true })) });
  reopen(outer);
}
let layer, off = null;
onMounted(async () => {
  layer = pushLayer(el.value, { back: () => closeModal(null), start: () => closeModal(null), x() {}, y() {}, select() {}, lb() {}, rb() {}, lt() {}, rt() {} });
  off = window.cart.on('save-search', (m) => { if (m.state === 'run') { searching.value = true; prog.value = m; } else { searching.value = false; prog.value = null; load(); } });
  await nextTick(); focusFirst(el.value, '[data-autofocus]');
  load();
});
onBeforeUnmount(() => { layer?.pop(); off?.(); });
</script>

<style scoped>
.sl { width: min(760px, 94vw); max-height: 90vh; display: flex; flex-direction: column; gap: var(--s-3); overflow: hidden; }
.sl-head { flex: none; display: flex; flex-direction: column; gap: 6px; }
.sl-head h2 { margin: 0; font-size: var(--t-xl); line-height: 1.15; }
.small { font-size: var(--t-sm); margin: 0; line-height: 1.45; }
.sl-acts { flex: none; gap: var(--s-3); align-items: center; flex-wrap: wrap; }
.sl-note { flex: 1; min-width: 14em; overflow-wrap: anywhere; }
.sl-body { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--s-3); padding: 4px; margin: -4px; }
.sl-wait { padding: var(--s-3) 0; }
.sl-emu { display: flex; flex-direction: column; gap: var(--s-2); flex: none; }
.sl-emu-top { display: flex; align-items: center; gap: var(--s-3); font-family: var(--display); font-size: var(--t-md); margin-top: var(--s-2); }
.sl-emu-top b { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.sl-place { display: flex; flex-direction: column; gap: 6px; padding: var(--s-3); border-radius: var(--r-lg); background: var(--s2); flex: none; }
.sl-place-top { display: flex; align-items: center; gap: var(--s-2); flex-wrap: wrap; }
.sl-place .mono { font-family: ui-monospace, monospace; font-size: var(--t-xs); font-weight: 500; overflow-wrap: anywhere; }
.sl-tag { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 99px; font-size: var(--t-xs); font-weight: 700; background: color-mix(in srgb, var(--text) 10%, transparent); }
.sl-tag.use { background: color-mix(in srgb, var(--green) 22%, transparent); color: var(--green-l, var(--green)); }
.sl-tag.old, .sl-tag.found { background: color-mix(in srgb, var(--gold, #e7b84a) 22%, transparent); color: var(--gold, #e7b84a); }
.sl-row-acts { gap: var(--s-2); flex-wrap: wrap; margin-top: 2px; }
.sl-foot { flex: none; justify-content: space-between; align-items: center; }
/* Glass: places are hairline glass on the sheet; Plain keeps solid cards with its edge and top light */
:global(body.theme-light .sl-tag.old), :global(body.theme-light .sl-tag.found) { color: #7a5200; }
:global(body.elements-glass .sl-place) { background: rgba(255, 255, 255, 0.035); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07); }
:global(body.elements-glass.theme-light .sl-place) { background: rgba(255, 255, 255, 0.5); box-shadow: inset 0 0 0 1px rgba(30, 30, 45, 0.08); }
:global(body.style-plain:not(.theme-light):not(.theme-oled) .sl-place) { box-shadow: var(--pl-top), var(--pl-edge); }
</style>
