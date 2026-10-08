<template>
  <!-- Cartridge Save Sync (0.9.51): this device's saves kept on your RomM and brought to your other devices -->
  <div class="ssc">
    <div class="ssc-head glass">
      <div class="ssc-mark" :class="{ on: st?.on }"><Icon :name="st?.on ? 'mdiCloudCheckOutline' : 'mdiCloudOffOutline'" :size="30" /></div>
      <div class="ssc-mid">
        <b>{{ st?.on ? 'Cartridge Save Sync is on' : st?.syncthing ? 'This device syncs saves with Syncthing' : 'Cartridge Save Sync is off' }}</b>
        <span class="muted small">{{ sub }}</span>
      </div>
      <button v-if="st?.on" class="btn" data-focus :disabled="busy" @click="run"><Icon name="mdiSync" :class="{ spin: busy }" />{{ busy ? (prog.of ? `Syncing ${prog.done} of ${prog.of}` : 'Syncing…') : 'Sync Now' }}</button>
      <button v-else-if="!st?.syncthing" class="btn primary" data-focus @click="turnOn"><Icon name="mdiCloudSyncOutline" />Turn On</button>
      <button v-else class="btn" data-focus @click="emit('advanced')"><Icon name="mdiTune" />Advanced</button>
    </div>

    <!-- 0.9.52: away from the server, saves stay here and go up the moment RomM answers again -->
    <template v-if="st?.on && st?.held">
      <div class="subh">Waiting for Your Server</div>
      <p class="muted small">RomM couldn’t be reached {{ ago(st.held.since) }}. Keep playing: your saves stay on this device{{ st.held.games?.length ? `, and ${st.held.games.length === 1 ? st.held.games[0] : st.held.games.length + ' games'} go up` : ' and go up' }} as soon as Cartridge can reach RomM again. If another device played the same game meanwhile, you choose which save to keep.</p>
    </template>

    <template v-if="st?.on && conflicts.length">
      <div class="subh">Choose Which Save to Keep</div>
      <p class="muted small">These changed on this device and on another one since they last synced. The one you don't pick stays in RomM as an older version.</p>
      <div class="stack">
        <button v-for="c in conflicts" :key="c.key" class="lrow" data-focus @click="resolve(c)">
          <Icon name="mdiCallSplit" :size="24" />
          <div class="l-mid"><b>{{ c.label || c.key }}</b><span class="l-sub">{{ c.emuName }}</span></div>
          <span class="status warn">Choose</span>
        </button>
      </div>
    </template>

    <template v-if="st?.on && st?.last">
      <div class="subh">Last Sync</div>
      <div class="ssc-counts">
        <!-- 0.9.56 (owner): each count opens the saves behind it; Not Matched says why and what fixes it -->
        <button v-for="k in SHOWN" :key="k.v" class="ssc-count" :class="{ dim: !countOf(k), warn: (k.v === 'unmatched' || k.v === 'attention') && countOf(k) }" data-focus @click="openList(k)"><b>{{ countOf(k) }}</b><span>{{ k.l }}</span><Icon name="mdiChevronRight" :size="16" class="ssc-go" /></button>
      </div>
      <p class="muted small">{{ ago(st.last.at) }}</p>
      <!-- 0.9.57 (owner): every game with a synced save, each opening its own sheet (where its save is, its history) -->
      <template v-if="games.length">
        <div class="subh">Your Games · {{ games.length }}</div>
        <div class="ssc-games">
          <button v-for="g in games" :key="g.id" class="lrow ssc-game" data-focus @click="openGame(g.id)">
            <img v-if="g.art" class="ssc-cov" :src="g.art" loading="lazy" alt="" /><span v-else class="ssc-cov" />
            <div class="l-mid"><b>{{ g.name }}</b><span class="l-sub">{{ g.sub }}</span></div>
            <Icon :name="ICON[g.result] || 'mdiCheck'" :size="20" class="ssc-gi" />
          </button>
        </div>
      </template>
    </template>

    <div class="subh">How It Works</div>
    <div class="ssc-how glass">
      <div><Icon name="mdiPlayCircleOutline" :size="22" /><span><b>Before a game starts</b> Cartridge checks its saves with RomM and brings the newest here, like Steam Cloud. Games started from Steam sync when you come back to Cartridge.</span></div>
      <div><Icon name="mdiCloudUploadOutline" :size="22" /><span><b>After you play</b> your saves go to RomM, and every 30 minutes anything that changed.</span></div>
      <div><Icon name="mdiShieldCheckOutline" :size="22" /><span><b>Safe</b> Cartridge never changes a save while its emulator is open, never guesses when two devices changed the same save, and keeps 10 older versions on this device and 10 in RomM.</span></div>
      <div><Icon name="mdiGamepadVariantOutline" :size="22" /><span><b>Emulators</b> Eden, RPCS3, shadPS4, PCSX2 (whole memory cards), DuckStation, PPSSPP, Vita3K, Dolphin, Cemu, Azahar, Xenia, and RetroArch saves and save states.</span></div>
    </div>
    <p v-if="st?.backups" class="muted small">Older versions on this device: <span class="mono">{{ short(st.backups) }}</span></p>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { store, call, toast, choose, ago, romById, consoleName, go, openModal, cover } from '../store.js';
import Icon from './Icon.vue';

const emit = defineEmits(['advanced']);
const st = ref(null), busy = ref(false), prog = ref({});
const SHOWN = [{ v: 'up', l: 'Sent to RomM' }, { v: 'down', l: 'Brought Here' }, { v: 'same', l: 'Up to Date' }, { v: 'unmatched', l: 'Not Matched' }, { v: 'attention', l: 'Needs Attention' }];
// 0.9.58 (owner: "a lot of discrepancies"): saves that couldn't move this time are counted and explained, never silent
const ATTN = new Set(['unplaced', 'busy', 'damaged', 'error', 'conflict', 'auth']);
const inList = (k, x) => (k.v === 'attention' ? ATTN.has(x.result) : x.result === k.v);
const countOf = (k) => (st.value?.last?.items ? st.value.last.items.filter((x) => inList(k, x)).length : k.v === 'attention' ? [...ATTN].reduce((n, r) => n + (st.value?.last?.counts?.[r] || 0), 0) : st.value?.last?.counts?.[k.v] || 0);
// why a save couldn't move, and what fixes it
function issue(it) {
  const emu = it.emuName || 'The emulator', game = gameOf(it) || 'this game';
  if (it.result === 'unplaced' && it.place === 'noemu') return { short: `No ${emu} set up here`, why: `This save of ${game} is in RomM, from another device, and no ${emu} is set up on this device to put it in.`, fix: `Set up ${emu} here (Settings → Emulators) and open it once, then press Sync Now.` };
  if (it.result === 'unplaced') return { short: `${emu} hasn’t made its save folder yet`, why: `${emu} is here, but it hasn’t made the folder this save goes in yet${/switch/.test(it.key) ? ' (Switch emulators make their user folder the first time a game saves)' : ''}.`, fix: `Open ${emu}, start any game and save once, then press Sync Now. Cartridge never makes an emulator’s folders for it.` };
  if (it.result === 'busy') return { short: `${emu} was open`, why: `${emu} was running, and Cartridge never changes saves while their emulator is open.`, fix: `Close ${emu}, then press Sync Now.` };
  if (it.result === 'damaged') return { short: 'The download didn’t match RomM’s check', why: 'What came from RomM didn’t match the check RomM gave for it, so nothing was written.', fix: 'Press Sync Now to try again. If it keeps happening, the copy in RomM may be damaged: put back an older version from the game’s page.' };
  if (it.result === 'conflict') return { short: 'Changed on two devices', why: 'This save changed here and on another device since they last agreed. Cartridge never guesses which to keep.', fix: 'Choose which to keep in “Choose Which Save to Keep” above.' };
  if (it.result === 'auth') return { short: 'RomM said no', why: it.error || 'RomM didn’t let Cartridge read or write saves.', fix: 'Sign in with your password, or pair again so Cartridge can ask for save access.' };
  return { short: 'Couldn’t sync', why: it.error || 'Something went wrong talking to RomM.', fix: 'Press Sync Now to try again.' };
}
const conflicts = computed(() => st.value?.last?.conflicts || []);
const short = (p) => String(p || '').replace(store.info?.home || '\0', '~');
const sub = computed(() => {
  const s = st.value; if (!s) return '';
  if (s.on && s.held) return 'Away from your server · saves are kept here until it can be reached';
  if (s.on) return s.last ? `Last synced ${ago(s.last.at)} · ${s.saved} saves kept in step` : 'The first sync starts in a moment';
  if (s.syncthing) return 'A device uses Cartridge Save Sync or Syncthing for saves, never both. Change it in Advanced.';
  return 'Keep your saves on your own RomM server and bring them to every device you play on.';
});
async function load() { st.value = await call('savesync:status').catch(() => null); }
async function turnOn() {
  try { st.value = await call('savesync:set', { on: true }); store.config = await call('config:get'); toast('Cartridge Save Sync is on', 'ok', 2500, 'mdiCloudCheckOutline'); } catch (e) { toast(e.message, 'error', 6000); }
}
async function run() {
  busy.value = true;
  try {
    const r = await call('savesync:run', {});
    if (r?.offline) toast('RomM couldn’t be reached. Try again when you’re online.', 'error', 5000);
    else if (r?.results?.some((x) => x.result === 'auth')) toast(r.results.find((x) => x.result === 'auth').error, 'error', 8000);
  } catch (e) { toast(e.message, 'error', 6000); }
  busy.value = false; await load();
}
async function resolve(c) {
  const v = await choose({ title: 'Which Save?', message: `${c.label || 'This save'} (${c.emuName}) changed on this device and on another one.`, options: [{ label: 'Use the One From RomM', sub: 'The save from your other device', value: 'theirs', icon: 'mdiCloudDownloadOutline' }, { label: 'Keep This Device’s', sub: 'It goes to RomM as the newest', value: 'mine', icon: 'mdiCellphoneArrowDown' }] });
  if (!v) return;
  try {
    const r = await call('savesync:resolve', { key: c.key, choice: v, romId: c.romId });
    const res = r?.results?.[0]?.result;
    if (res === 'busy') toast(`Close ${c.emuName} first: saves never change while it's open.`, 'error', 5000);
    else toast(v === 'mine' ? 'This device’s save is the newest in RomM' : 'The save from RomM is here', 'ok', 3000, 'mdiCheck');
    // the conflict is settled: take it off the list
    if (st.value?.last) st.value.last.conflicts = conflicts.value.filter((x) => x.key !== c.key);
  } catch (e) { toast(e.message, 'error', 6000); }
}
// ---- the lists behind the counts (0.9.56)
const ICON = { up: 'mdiCloudUploadOutline', down: 'mdiCloudDownloadOutline', same: 'mdiCheck', unmatched: 'mdiHelpCircleOutline' };
const gameOf = (it) => romById(it.romId)?.name || it.why?.title || '';
// the games behind the last sync's saves, A to Z: a memory card's carrier game is left out unless it has its own save
const games = computed(() => {
  const by = new Map();
  for (const it of st.value?.last?.items || []) {
    if (it.result === 'unmatched') continue;
    // 0.9.58 (owner: "I can't find my PS2 games"): a memory card lists every game saved on it, each under its own name
    const ids = it.card ? (it.romIds || []) : [it.romId];
    for (const id of ids) {
      const r = romById(id); if (!r) continue;
      const g = by.get(r.id) || { id: r.id, name: r.name, art: cover(r), emus: new Set(), result: it.result };
      g.emus.add(it.card ? `${it.emuName} memory card` : it.emuName); if (it.result !== 'same') g.result = it.result;
      by.set(r.id, g);
    }
  }
  return [...by.values()].map((g) => ({ ...g, sub: [consoleName({ romId: g.id, fallback: '' }), [...g.emus].join(', ')].filter(Boolean).join(' · ') })).sort((a, b) => a.name.localeCompare(b.name));
});
async function openGame(romId) { const r = await openModal('savegame', { romId }); if (r === 'game') go('game', { romId }); }
const conName = (slug) => (slug ? consoleName({ slug, fallback: slug.toUpperCase() }) : '');
// a save that matched no game: why, in plain words, and what fixes it
function explain(it) {
  const w = it.why || { code: 'none' }, emu = it.emuName, con = conName(w.console);
  if (w.code === 'card') return { short: `No ${con || 'game of its console'} in your library to keep it with`, why: `This is a whole memory card. Cartridge keeps a memory card in RomM with your oldest ${con || 'game of the same console'}, and your RomM library has none.`, fix: `Add any ${con || 'game of that console'} to RomM (or refresh your library if it’s there already), then press Sync Now.` };
  if (w.code === 'id') return { short: `${w.id} isn’t in your library`, why: `${emu} keeps this save under the game ID ${w.id}${w.title ? ` (${w.title})` : ''}. No game in your library has that ID.`, fix: `If the game is in RomM, download it to this device once: Cartridge reads the ID from the game itself. Or add the ID to its file name in RomM, like “Game Name [${w.id}]”. If it isn’t in RomM, add it and refresh your library. Then press Sync Now.`, id: w.id };
  if (w.code === 'name') return { short: `No game called “${w.name}”`, why: `${emu} names this save “${w.name}”, and no game in your library has that name${it.emu === 'retroarch' ? ' or file name' : ''}.`, fix: it.emu === 'retroarch' ? 'RetroArch names saves after the game’s file. Download the game from RomM to this device and play it there once, or rename the save to the game’s file name in RomM, then press Sync Now.' : 'Rename the game in RomM to match, or download it here so Cartridge can read its ID, then press Sync Now.' };
  return { short: 'Nothing readable to match', why: `Cartridge couldn’t read a game ID or a name from this ${emu} save.`, fix: 'It stays on this device as it is; it just isn’t synced. Nothing to do unless you want it in RomM.' };
}
async function openList(k) {
  const items = (st.value?.last?.items || []).filter((x) => inList(k, x));
  if (!st.value?.last?.items) return toast('Press Sync Now once and the list shows here.', 'info', 3500);
  if (!items.length) return toast(`Nothing ${k.l.toLowerCase()} in the last sync`, 'info', 2500);
  for (;;) {
    const v = await choose({ sheet: true, title: `${k.l} · ${items.length}`, message: k.v === 'unmatched' ? 'Saves on this device that Cartridge couldn’t match to a game in your library, so they stay here and aren’t synced. Press one to see why and what fixes it.' : '', options: items.map((it, i) => ({ label: gameOf(it) || it.label || it.key, sub: `${it.emuName}${it.card ? ' · memory card' : ''}${it.states ? ' · save states' : ''}${k.v === 'unmatched' ? ' · ' + explain(it).short : k.v === 'attention' ? ' · ' + issue(it).short : ''}`, value: String(i), icon: ICON[k.v] || 'mdiAlertCircleOutline', raw: true })) });
    if (v == null) return;
    const it = items[Number(v)];
    // a matched save: its game's sheet (0.9.57, owner): the game, where its save is, its history; Go to Game Page there
    if (k.v === 'attention') {
      const e = issue(it);
      const a = await choose({ title: gameOf(it) || it.label || it.key, message: `Why: ${e.why}\n\nWhat fixes it: ${e.fix}`, options: [{ label: 'Sync Now', sub: 'After the fix', value: 'sync', icon: 'mdiSync' }, ...(romById(it.romId) ? [{ label: 'This Game’s Saves', value: 'sheet', icon: 'mdiContentSaveOutline' }] : []), { label: 'Back to the List', value: 'back', icon: 'mdiArrowLeft' }] });
      if (a === 'sync') return run();
      if (a === 'sheet') { const r = await openModal('savegame', { romId: it.romId }); if (r === 'game') return go('game', { romId: it.romId }); }
      if (a == null) return;
      continue;
    }
    if (k.v !== 'unmatched') { if (!romById(it.romId)) continue; const r = await openModal('savegame', { romId: it.romId }); if (r === 'game') return go('game', { romId: it.romId }); continue; }
    const e = explain(it);
    const a = await choose({ title: gameOf(it) || it.label || it.key, message: `Why: ${e.why}\n\nWhat fixes it: ${e.fix}`, options: [
      ...(e.id ? [{ label: 'Copy the ID', sub: e.id, value: 'copy', icon: 'mdiContentCopy', raw: true }] : []),
      { label: 'Sync Now', sub: 'After the fix', value: 'sync', icon: 'mdiSync' },
      { label: 'Back to the List', value: 'back', icon: 'mdiArrowLeft' },
    ] });
    if (a === 'copy') { await call('clip:write', { text: e.id }); toast('Copied', 'ok', 1800, 'mdiContentCopy'); }
    if (a === 'sync') return run();
    if (a == null) return;
  }
}
let off = null;
// 0.9.58: a sync already running (started before this page opened) shows as running, with how far it is
onMounted(async () => { await load(); if (st.value?.busy) { busy.value = true; prog.value = st.value.prog || {}; } off = window.cart.on('savesync', (p) => { if (p.state === 'run') { busy.value = true; prog.value = p; } else { busy.value = false; prog.value = {}; load(); } }); });
onBeforeUnmount(() => off?.());
defineExpose({ load });

</script>
<style scoped>
.ssc { display: flex; flex-direction: column; gap: var(--s-3); }
.ssc-head { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-4); border-radius: var(--r-lg); flex-wrap: wrap; }
.ssc-mark { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--text) 8%, transparent); color: var(--muted); flex: none; }
.ssc-mark.on { color: var(--green-l, #7ee787); background: rgba(126, 231, 135, 0.12); }
.ssc-mid { flex: 1; min-width: 12em; display: flex; flex-direction: column; gap: 3px; }
.ssc-mid b { font-size: var(--t-md); }
.small { font-size: var(--t-sm); margin: 0; line-height: 1.45; }
.stack { display: flex; flex-direction: column; gap: var(--s-2); }
.ssc-counts { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--s-2); }
.ssc-count { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: var(--s-3); border-radius: var(--r-md); background: var(--s1); text-align: left; }
.ssc-count:focus-visible, .pad-mode .ssc-count:focus { background: var(--focus); color: var(--on-focus); }
.ssc-count:is(:focus-visible, :focus) span, .ssc-count:is(:focus-visible, :focus) .ssc-go { color: var(--on-focus-dim); }
.ssc-go { position: absolute; top: var(--s-3); right: var(--s-2); color: var(--muted); }
.ssc-count.warn b { color: var(--gold); }
.ssc-count b { font-family: var(--display); font-size: var(--t-xl); font-variant-numeric: tabular-nums; }
.ssc-count span { font-size: var(--t-xs); color: var(--muted); }
.ssc-count.dim b { color: var(--muted); }
.ssc-how { display: flex; flex-direction: column; gap: var(--s-3); padding: var(--s-4); border-radius: var(--r-lg); } /* a card (0.9.57, owner: it blended into the page) */
.ssc-how > div { display: flex; gap: var(--s-3); align-items: flex-start; font-size: var(--t-sm); line-height: 1.45; color: var(--muted); }
.ssc-how b { color: var(--text); margin-right: 4px; }
.ssc-how .icon { flex: none; margin-top: 1px; color: var(--text); }
.mono { font-family: ui-monospace, monospace; overflow-wrap: anywhere; }
.ssc-games { display: flex; flex-direction: column; gap: var(--s-2); }
.ssc-game { flex: none; }
.ssc-cov { width: 36px; height: 48px; border-radius: var(--r-sm); object-fit: cover; flex: none; background: var(--s2); }
.ssc-gi { color: var(--muted); flex: none; }
@media (max-width: 1100px) { .ssc-counts { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
