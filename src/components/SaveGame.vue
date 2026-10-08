<template>
  <div class="scrim" ref="el" @click.self="closeModal(null)">
    <div class="dialog sg">
      <!-- the game: its cover, name and console, and where its saves stand right now -->
      <div class="sg-head">
        <div class="sg-amb" aria-hidden="true"><img v-if="art" :src="art" alt="" /></div>
        <div class="sg-cover"><img v-if="art" :src="art" alt="" /><Icon v-else name="mdiGamepadVariantOutline" :size="34" /></div>
        <div class="sg-who">
          <div class="eyebrow">Cartridge Save Sync</div>
          <h2>{{ rom?.name || name || 'This Game' }}</h2>
          <div class="sg-con"><PIcon v-if="rom" :p="{ slug: rom.platform_slug, fs_slug: rom.platform_fs_slug, id: rom.platform_id }" :size="20" /><span>{{ con }}</span></div>
          <span class="sg-state" :class="state.k"><Icon :name="state.icon" :size="16" />{{ state.t }}</span>
        </div>
      </div>
      <div class="row sg-acts">
        <button v-if="rom" class="btn primary" data-focus data-autofocus @click="toGame"><Icon name="mdiGamepadVariantOutline" />Go to Game Page</button>
        <button class="btn" data-focus :disabled="busy || !d?.on" @click="syncNow"><Icon name="mdiSync" :class="{ spin: busy }" />{{ busy ? 'Syncing…' : 'Sync This Game' }}</button>
      </div>

      <div class="sg-body" data-scroll>
        <div v-if="!d" class="muted sg-wait">{{ err || 'Reading its saves…' }}</div>
        <template v-else>
          <!-- each save of it on this device -->
          <div class="sg-title">On This Device</div>
          <div v-if="!d.saves.length" class="muted small">No save of this game on this device yet. Play it once and it shows here.</div>
          <div v-for="s in d.saves" :key="s.key" class="sg-save">
            <div class="sg-save-top">
              <EmuIcon :id="s.emu" :size="28" />
              <div class="sg-save-who">
                <b>{{ s.emuName }}</b>
                <span class="muted small">{{ kindText(s) }}</span>
              </div>
              <span class="status" :class="s.synced ? 'ok' : ''">{{ s.synced ? 'Synced ' + ago(s.synced) : 'Not synced yet' }}</span>
            </div>
            <div class="sg-facts">
              <div><span>Size</span><b>{{ bytes(s.size || 0) }}{{ s.files > 1 ? ` · ${s.files} files` : '' }}</b></div>
              <div><span>Last Changed</span><b>{{ s.at ? ago(s.at) : 'Unknown' }}</b></div>
              <div><span>In RomM</span><b>{{ s.inRomm ? 'Yes' : 'Not yet' }}</b></div>
              <div><span>Backups Here</span><b>{{ s.backups || 'None' }}</b></div>
            </div>
            <!-- 0.9.59: how it was matched when only its name fitted, and older copies of it that aren't synced -->
            <p v-if="s.loose" class="muted small">Matched by name: the save’s own title is the start of this game’s name, and no other game on this console fits.</p>
            <p v-for="o in s.others || []" :key="o.path" class="muted small sg-other">An older copy in {{ o.emuName }} isn’t synced: <span class="mono">{{ short(o.path) }}</span></p>
            <button class="sg-path lrow" data-focus @click="copy(s.path)">
              <Icon name="mdiFolderOutline" :size="20" />
              <div class="l-mid"><span class="l-sub">Where It Is</span><b class="mono">{{ short(s.path) }}</b></div>
              <span class="muted small">Copy</span>
            </button>
            <div class="row sg-row-acts">
              <button class="btn small" data-focus @click="openFolder(s.kind === 'file' ? dirOf(s.path) : s.path)"><Icon name="mdiFolderOpenOutline" :size="18" />Open Folder</button>
              <button v-if="s.backupsDir" class="btn small" data-focus @click="openFolder(s.backupsDir)"><Icon name="mdiArchiveOutline" :size="18" />Backups</button>
            </div>
          </div>

          <!-- what happened, newest first -->
          <div class="sg-title">Sync History</div>
          <div v-if="!history.length" class="muted small">Nothing has moved yet. Each time a save goes up to RomM or comes down to this device, it shows here.</div>
          <ol v-else class="sg-tl">
            <li v-for="(h, i) in history" :key="i" class="sg-ev" :class="h.result" data-focus tabindex="0">
              <span class="sg-dot"><Icon :name="EV[h.result]?.icon || 'mdiCircleSmall'" :size="16" /></span>
              <div class="sg-ev-mid"><b>{{ EV[h.result]?.t || h.result }}</b><span class="muted small">{{ whyText(h) }}{{ d.saves.length > 1 ? ' · ' + h.emuName : '' }}</span></div>
              <span class="muted small sg-when">{{ when(h.at) }}</span>
            </li>
          </ol>

          <!-- the versions RomM keeps -->
          <div class="sg-title">In RomM</div>
          <div v-if="!d.on" class="muted small">Cartridge Save Sync is off on this device.</div>
          <div v-else-if="d.versions == null" class="muted small">RomM couldn’t be reached, so its versions can’t be listed right now.</div>
          <div v-else-if="!d.versions.length" class="muted small">No version of this game’s saves in RomM yet.</div>
          <div v-else class="stack">
            <button v-for="(v, i) in d.versions" :key="v.id" class="lrow" data-focus @click="restore(v, i)">
              <Icon :name="i === 0 ? 'mdiCloudCheckOutline' : 'mdiHistory'" :size="22" />
              <div class="l-mid"><b>{{ i === 0 ? 'Newest' : when(Date.parse(v.at)) }}</b><span class="l-sub">{{ v.emuName }}{{ v.device ? ' · from ' + v.device : '' }}{{ v.size ? ' · ' + bytes(v.size) : '' }}</span></div>
              <span v-if="i" class="muted small">Put Back</span>
            </button>
          </div>
        </template>
      </div>
      <div class="row sg-foot"><span class="muted small">B to close</span><button class="btn" data-focus @click="closeModal(null)">Close</button></div>
    </div>
  </div>
</template>

<script setup>
// A game's saves in Cartridge Save Sync (0.9.57, owner: pressing a game shows the game, its poster, where its save is
// and more, with a button to its game page). One call (savesync:game) gathers every save of it on this device, where
// each is, its size and last change, when it last synced, its history, the backups kept here and RomM's versions.
import { computed, onMounted, onBeforeUnmount, ref, nextTick } from 'vue';
import { pushLayer, focusFirst } from '../nav.js';
import { store, call, closeModal, toast, bytes, ago, romById, cover, consoleName, confirm } from '../store.js';
import Icon from './Icon.vue';
import PIcon from './PIcon.vue';
import EmuIcon from './EmuIcon.vue';

const props = defineProps({ romId: Number, name: String });
const el = ref(null), d = ref(null), err = ref(''), busy = ref(false);
const rom = computed(() => romById(props.romId));
const art = computed(() => (rom.value ? cover(rom.value) : ''));
const con = computed(() => (rom.value ? consoleName({ romId: props.romId, slug: rom.value.platform_slug, fallback: rom.value.platform_display_name }) : ''));
const short = (p) => String(p || '').replace(store.info?.home || '\u0000', '~');
const dirOf = (p) => String(p).replace(/\/[^/]*$/, '');
const when = (t) => (t ? (Date.now() - t < 7 * 86400e3 ? ago(t) : new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })) : '');
const kindText = (s) => (s.sub ? `${s.sub} · ${s.folder}` : s.card ? `Memory card${s.shared > 1 ? `, shared by ${s.shared} games` : ''}` : s.states ? 'Save states' : s.label && s.label !== rom.value?.name ? s.label : s.kind === 'dir' ? 'Save folder' : 'Save file');
const EV = {
  up: { t: 'Sent to RomM', icon: 'mdiCloudUploadOutline' },
  down: { t: 'Brought to This Device', icon: 'mdiCloudDownloadOutline' },
  conflict: { t: 'Changed on Two Devices', icon: 'mdiCallSplit' },
  restored: { t: 'Older Version Put Back', icon: 'mdiHistory' },
  error: { t: 'Couldn’t Sync', icon: 'mdiAlertCircleOutline' },
  unplaced: { t: 'Couldn’t Be Put in Place', icon: 'mdiFolderAlertOutline' },
  damaged: { t: 'Download Didn’t Match RomM’s Check', icon: 'mdiAlertCircleOutline' },
};
const WHY = { before: 'Before you played', after: 'After you played', run: 'Sync Now', reconnected: 'When RomM was back in reach', resolve: 'You chose which save to keep', restore: 'From RomM’s older versions', scheduled: 'On its own' };
const whyText = (h) => (h.error ? h.error : h.result === 'unplaced' ? (h.place === 'noemu' ? 'No emulator for it is set up here' : 'The emulator hasn’t made its save folder yet: open it and save once') : WHY[h.why] || 'On its own') + (h.choice ? (h.choice === 'mine' ? ' · this device’s' : ' · RomM’s') : '');
const history = computed(() => (d.value?.saves || []).flatMap((s) => (s.history || []).map((h) => ({ ...h, emuName: s.emuName }))).sort((a, b) => b.at - a.at).slice(0, 30));
const state = computed(() => {
  const x = d.value;
  if (!x) return { k: '', icon: 'mdiSync', t: 'Checking' };
  if (!x.on) return { k: 'off', icon: 'mdiCloudOffOutline', t: 'Save Sync Is Off' };
  if (x.conflicts?.length) return { k: 'warn', icon: 'mdiCallSplit', t: 'Choose Which Save to Keep' };
  if (x.held) return { k: 'warn', icon: 'mdiCloudClockOutline', t: 'Waiting for Your Server' };
  if (!x.saves.length) return { k: '', icon: 'mdiContentSaveOutline', t: 'No Save Here Yet' };
  if (x.saves.every((s) => s.synced && (!s.at || s.at <= s.synced + 2000))) return { k: 'ok', icon: 'mdiCloudCheckOutline', t: 'In Sync' };
  return { k: 'warn', icon: 'mdiCloudUploadOutline', t: 'Changed Since the Last Sync' };
});

async function load() {
  try { d.value = await call('savesync:game', { romId: props.romId }); } catch (e) { err.value = e.message; }
}
async function syncNow() {
  busy.value = true;
  try { const r = await call('savesync:run', { romId: props.romId }); if (r?.offline) toast('RomM couldn’t be reached. The save stays here and goes up later.', 'info', 4500, 'mdiCloudOffOutline'); else toast('Synced', 'ok', 2000, 'mdiCloudCheckOutline'); }
  catch (e) { toast(e.message, 'error', 5000); }
  busy.value = false;
  await load();
}
async function copy(p) { await call('clip:write', { text: p }); toast('Location copied', 'ok', 1800, 'mdiContentCopy'); }
async function openFolder(p) { try { await call('fs:openFolder', { path: p }); } catch (e) { toast(e.message, 'error', 4000); } }
// single modal slot: the question replaces this sheet, which opens itself again afterwards
async function restore(v, i) {
  if (!i) return;
  const outer = store.modal.resolve;
  const yes = await confirm('Put This Version Back?', `The ${v.emuName} save from ${when(Date.parse(v.at))}${v.device ? ' (' + v.device + ')' : ''} replaces the one on this device. The current one is backed up first. Close ${v.emuName} before you do this.`, 'Put It Back');
  if (yes) { try { await call('savesync:restore', { id: v.id, romId: props.romId }); toast('Put back', 'ok', 2200, 'mdiHistory'); } catch (e) { toast(e.message, 'error', 6000); } }
  store.modal = { type: 'savegame', props: { romId: props.romId, name: props.name }, resolve: outer }; // back, for whoever opened it
}
const toGame = () => closeModal('game');
let layer;
onMounted(async () => {
  layer = pushLayer(el.value, { back: () => closeModal(null), start: () => closeModal(null), x() {}, y() {}, select() {}, lb() {}, rb() {}, lt() {}, rt() {} });
  await nextTick(); focusFirst(el.value, '[data-autofocus]');
  load();
});
onBeforeUnmount(() => layer?.pop());
</script>

<style scoped>
.sg { width: min(720px, 94vw); max-height: 90vh; display: flex; flex-direction: column; gap: var(--s-3); overflow: hidden; }
.sg-head { flex: none; position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--s-4); align-items: center; padding: var(--s-3); margin: calc(-1 * var(--s-2)) calc(-1 * var(--s-2)) 0; border-radius: var(--r-lg); overflow: hidden; isolation: isolate; }
/* the game's cover, blurred, behind its header */
.sg-amb { position: absolute; inset: -40px; z-index: -1; opacity: 0.4; pointer-events: none; }
.sg-amb img { width: 100%; height: 100%; object-fit: cover; filter: blur(40px) saturate(1.3); }
.sg-cover { width: 96px; aspect-ratio: 3 / 4; border-radius: var(--r-md); overflow: hidden; display: grid; place-items: center; background: var(--s2); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45); }
.sg-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sg-who { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.sg-who h2 { margin: 0; font-size: var(--t-xl); line-height: 1.15; overflow-wrap: anywhere; }
.sg-con { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: var(--t-sm); }
.sg-state { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 99px; font-size: var(--t-xs); font-weight: 700; background: color-mix(in srgb, var(--text) 10%, transparent); }
.sg-state.ok { background: color-mix(in srgb, var(--green) 22%, transparent); color: var(--green-l, var(--green)); }
.sg-state.warn { background: color-mix(in srgb, var(--gold, #e7b84a) 22%, transparent); color: var(--gold, #e7b84a); }
.sg-acts { flex: none; gap: var(--s-2); flex-wrap: wrap; }
.sg-body { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--s-3); padding: 4px; margin: -4px; }
.sg-wait { padding: var(--s-3) 0; }
.sg-title { font-family: var(--display); font-weight: 700; font-size: var(--t-md); margin-top: var(--s-2); }
.sg-save { display: flex; flex-direction: column; gap: var(--s-3); padding: var(--s-3); border-radius: var(--r-lg); background: var(--s2); flex: none; }
.sg-save-top { display: flex; align-items: center; gap: var(--s-3); }
.sg-save-who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.sg-save-who .small { overflow-wrap: anywhere; }
.sg-facts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--s-2); }
.sg-facts > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sg-facts span { font-size: var(--t-xs); color: var(--muted); }
.sg-facts b { font-size: var(--t-sm); overflow-wrap: anywhere; }
.sg-other .mono { overflow-wrap: anywhere; font-size: var(--t-xs); }
.sg-path .mono { font-size: var(--t-xs); overflow-wrap: anywhere; font-weight: 500; }
.sg-row-acts { gap: var(--s-2); flex-wrap: wrap; }
/* the history: a line down the left with a dot per event */
.sg-tl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; flex: none; }
.sg-ev { position: relative; display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: var(--s-3); align-items: center; padding: 8px 10px 8px 4px; border-radius: var(--r-md); }
.sg-ev::before { content: ''; position: absolute; left: 17px; top: 0; bottom: 0; width: 2px; background: color-mix(in srgb, var(--text) 12%, transparent); }
.sg-ev:first-child::before { top: 50%; }
.sg-ev:last-child::before { bottom: 50%; }
.sg-dot { position: relative; z-index: 1; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: var(--s3); color: var(--text); }
.sg-ev.up .sg-dot, .sg-ev.down .sg-dot, .sg-ev.restored .sg-dot { background: color-mix(in srgb, var(--green) 30%, var(--s2)); }
.sg-ev.conflict .sg-dot, .sg-ev.error .sg-dot, .sg-ev.unplaced .sg-dot, .sg-ev.damaged .sg-dot { background: color-mix(in srgb, var(--gold, #e7b84a) 30%, var(--s2)); }
.sg-ev-mid { min-width: 0; display: flex; flex-direction: column; }
.sg-ev-mid .small { overflow-wrap: anywhere; }
.sg-when { white-space: nowrap; }
.sg-ev:focus { background: var(--focus); color: var(--on-focus); }
.sg-ev:focus :is(.muted, .sg-when) { color: var(--on-focus-dim); }
.sg-foot { flex: none; justify-content: space-between; align-items: center; }
@media (max-width: 700px) { .sg-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); } .sg-cover { width: 72px; } }
/* Glass: the save cards are hairline glass on the sheet; Plain keeps solid cards with its edge and top light */
:global(body.elements-glass .sg-save) { background: rgba(255, 255, 255, 0.035); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07); }
:global(body.elements-glass.theme-light .sg-save) { background: rgba(255, 255, 255, 0.5); box-shadow: inset 0 0 0 1px rgba(30, 30, 45, 0.08); }
:global(body.style-plain:not(.theme-light):not(.theme-oled) .sg-save) { box-shadow: var(--pl-top), var(--pl-edge); }
:global(body.theme-light .sg-amb) { opacity: 0.28; }
</style>
