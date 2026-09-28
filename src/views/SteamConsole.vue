<template>
  <div class="view" data-scroll ref="el">
    <div v-if="!ov" class="center"><div class="spinner" /></div>
    <div v-else-if="!con" class="center">No downloaded games for this console<button class="btn" data-focus @click="back()">Back</button></div>
    <template v-else>
      <header class="sc-head glass">
        <div class="sc-logo"><PIcon :p="plat" :size="64" /></div>
        <div class="sc-title">
          <div class="eyebrow">Steam · Emulator</div>
          <h1>{{ con.platform }}</h1>
          <div class="muted">{{ con.games }} game{{ con.games === 1 ? '' : 's' }} · {{ con.inSteam }} in Steam</div>
          <div class="row" style="gap: 8px; margin-top: 4px">
            <span class="chip" :class="con.template ? 'how-' + con.template.how : 'none'">{{ con.template ? HOW[con.template.how] : 'No emulator set' }}</span>
            <span class="chip">{{ con.mode === 'script' ? 'Starts through Cartridge' : 'Starts directly' }}</span>
          </div>
        </div>
        <div class="sc-acts">
          <button class="btn primary" data-focus :disabled="!missing.length || !con.template" @click="addAll"><Icon name="mdiPlaylistPlus" />{{ missing.length ? `Add ${missing.length} to Steam` : 'All in Steam' }}</button>
          <button class="btn" data-focus @click="more"><Icon name="mdiDotsHorizontal" />More</button>
        </div>
      </header>

      <section class="sc-lo glass">
        <!-- the emulators installed for this console; new shortcuts use the one picked here -->
        <div class="lo emu-row"><span>Emulator</span>
          <button class="btn small" data-focus :data-key="'emu-pick'" :disabled="!con.emus.length" @click="pickEmu"><Icon name="mdiSwapHorizontal" :size="18" />{{ emuLabel }}</button>
        </div>
        <template v-if="con.template">
          <div class="lo"><span>Target</span><b class="mono">{{ con.template.target || con.template.exe }}</b></div>
          <div v-if="con.template.start" class="lo"><span>Start in</span><b class="mono">{{ con.template.start }}</b></div>
          <div class="lo"><span>Launch options</span><b class="mono">{{ con.template.target ? con.template.launch || '(empty)' : con.template.lo }}</b></div>
          <div v-if="con.template.from && con.template.how !== 'yours'" class="muted small">{{ con.template.how === 'learned' ? 'Copied from your Steam shortcut for ' + con.template.from : 'Found: ' + con.template.from }}</div>
        </template>
        <div v-else class="muted">No emulator found for this console. Press More → Edit to set one.</div>
      </section>

      <div v-if="con.outdated && !steam.queue.total" class="ss-queue">
        <Icon name="mdiUpdate" :size="22" />
        <div class="ss-q-t"><b>{{ con.outdated }} game{{ con.outdated === 1 ? '' : 's' }} in Steam use{{ con.outdated === 1 ? 's' : '' }} an older setup</b><small>Update them to start with the emulator and options above.</small></div>
        <button class="btn primary" data-focus @click="refresh"><Icon name="mdiRefresh" />Update</button>
      </div>
      <div v-if="steam.queue.total" class="ss-queue">
        <Icon name="mdiSteam" :size="22" />
        <div class="ss-q-t"><b>{{ steam.queue.total }} change{{ steam.queue.total === 1 ? '' : 's' }} waiting</b><small>Steam restarts to take {{ steam.queue.total === 1 ? 'it' : 'them' }}.</small></div>
        <button class="btn primary" data-focus :disabled="steam.busy" @click="apply"><Icon name="mdiCheck" />Apply</button>
      </div>

      <div class="shelf-title"><Icon name="mdiGamepadVariantOutline" :size="20" />Games on this device<span class="count">{{ games.length }}</span></div>
      <div class="sg-list">
        <button v-for="g in games" :key="g.romId" class="sc-row" data-focus :data-key="'sg-' + g.romId" @click="act(g)">
          <div class="sc-thumb"><img v-if="coverOf(g)" :src="coverOf(g)" loading="lazy" /></div>
          <div class="sc-mid"><b>{{ g.name }}</b><span class="muted">{{ g.inSteam ? (g.ours ? 'Added by Cartridge' : 'Added outside Cartridge') : g.file ? 'Ready to add' : 'Needs its game folder set' }}</span></div>
          <span class="chip" :class="stateOf(g).cls">{{ stateOf(g).l }}</span>
          <span class="sc-act"><Btn b="A" />{{ stateOf(g).act }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch, nextTick } from 'vue';
import { store, call, choose, confirm, toast, openModal, back, go, romById, cover } from '../store.js';
import { steam, applyChanges, addGame, removeGame, pickCollections } from '../steam.js';
import { useView } from '../useView.js';
import { ensureFocus } from '../nav.js';
import Icon from '../components/Icon.vue';
import Btn from '../components/Btn.vue';
import PIcon from '../components/PIcon.vue';

// Settings → Steam → a console: its games with Add / Remove, and the emulator setup behind More
const props = defineProps({ ckey: String });
const el = ref(null);
const ov = ref(null);
const HOW = { learned: 'From your shortcuts', yours: 'Set by you', emudeck: 'EmuDeck', appimage: 'AppImage', flatpak: 'Flatpak', native: 'Installed program' };
const con = computed(() => ov.value?.consoles.find((c) => c.key === props.ckey) || null);
const games = computed(() => (ov.value?.games || []).filter((g) => g.console === props.ckey).sort((a, b) => a.name.localeCompare(b.name)));
const missing = computed(() => games.value.filter((g) => !g.inSteam && g.file && g.queued !== 'add'));
const plat = computed(() => { const r = games.value.map((g) => romById(g.romId)).find(Boolean); return r ? { slug: r.platform_slug, fs_slug: r.platform_fs_slug } : { slug: props.ckey }; });
const coverOf = (g) => { const r = romById(g.romId); return r ? cover(r) : ''; };
function stateOf(g) {
  if (g.queued === 'add') return { l: 'Waiting to add', cls: 'primary', act: 'Apply' };
  if (g.queued === 'remove') return { l: 'Waiting to remove', cls: 'primary', act: 'Apply' };
  if (g.inSteam) return { l: 'In Steam', cls: 'green', act: 'Remove' };
  return { l: 'Not in Steam', cls: '', act: g.file ? 'Add' : 'Open game' };
}
async function load() {
  try { ov.value = await call('steam:overview'); steam.queue = ov.value.queue; } catch (e) { toast(e.message, 'error'); ov.value = { games: [], consoles: [] }; }
}
watch(() => steam.queue.total, () => { if (!steam.busy) load(); });
watch(() => steam.busy, (b) => { if (!b) load(); });
async function apply() { if (await applyChanges()) load(); }
async function act(g) {
  const rom = romById(g.romId);
  if (g.queued) return apply();
  if (g.inSteam) {
    if (!g.ours && !(await confirm('Remove from Steam?', 'Cartridge did not add this shortcut. Remove it anyway?', 'Remove', true))) return;
    await removeGame(rom || { name: g.name }, g.appid);
  } else if (!g.file) go('game', { romId: g.romId }); // PS3/PS4 folder games: the game page asks where the folder is
  else if (rom) await addGame(rom);
  load();
}
async function addAll() {
  const list = missing.value;
  const cols = await pickCollections(props.ckey, null, list.length > 1);
  if (cols == null) return;
  steam.queue = await call('steam:queueAdd', list.map((g) => ({ romId: g.romId, collections: cols })));
  await apply();
}
const emuLabel = computed(() => {
  const c = con.value;
  if (c.emu === 'yours') return 'Set by you';
  return c.emus.find((e) => e.id === c.emu)?.label || (c.emus.length ? 'Automatic' : 'None installed');
});
async function pickEmu() {
  const c = con.value;
  const v = await choose({
    title: `Emulator for ${c.platform}`, message: 'Installed on this device. New shortcuts start with this one.',
    options: c.emus.map((e) => ({ label: e.label, sub: e.sub, value: e.id, icon: e.id === 'learned' ? 'mdiSteam' : e.id.startsWith('ra:') ? 'mdiAlphaRBoxOutline' : 'mdiGamepadVariantOutline', selected: e.id === c.emu })),
  });
  if (!v || v === c.emu) return;
  await call('steam:setEmu', { key: c.key, id: v });
  toast(`${c.platform} uses ${c.emus.find((e) => e.id === v)?.label}`, 'ok', 2500, 'mdiCheck');
  await load();
}
async function refresh() {
  const r = await call('steam:refresh', { key: props.ckey }).catch((e) => { toast(e.message, 'error'); return null; });
  if (!r?.count) return;
  if (r.fixed === r.count) { toast(`Fixed ${r.fixed} shortcut${r.fixed === 1 ? '' : 's'} in Steam`, 'ok', 2500, 'mdiCheck'); return load(); }
  steam.queue = await call('steam:overview').then((o) => o.queue).catch(() => steam.queue);
  await apply();
}
async function more() {
  const c = con.value;
  const v = await choose({
    title: c.platform, message: c.template ? `${HOW[c.template.how]}${c.template.from ? ' · ' + c.template.from : ''}` : 'No emulator set',
    options: [
      { label: 'Edit Target, Start in and Launch options', value: 'edit', icon: 'mdiPencil' },
      { label: 'Test', sub: 'Checks the Target exists and can run', value: 'test', icon: 'mdiPlayCircleOutline' },
      { label: 'Start games directly', sub: 'Steam runs the emulator itself (recommended)', value: 'direct', icon: 'mdiRocketLaunchOutline', selected: c.mode !== 'script' },
      { label: 'Start games through Cartridge', sub: 'A small script: if the game is gone, Cartridge opens on it', value: 'script', icon: 'mdiScriptTextOutline', selected: c.mode === 'script' },
    ],
  });
  if (v === 'test') { const r = await call('steam:test', { key: c.key }); toast(r.ok ? r.note : r.error, r.ok ? 'ok' : 'error', 4500); return; }
  if (v === 'direct' || v === 'script') { await call('steam:setMode', { key: c.key, mode: v }); toast(v === 'script' ? 'New shortcuts start through Cartridge' : 'New shortcuts start the emulator directly', 'ok', 3000); load(); return; }
  if (v !== 'edit') return;
  const t = c.template || { exe: '', start: '', lo: '%command% "{ROM}"' };
  const r = await openModal('steam-emu', { ckey: c.key, label: c.label, how: t.how, exe: t.exe, start: t.start, lo: t.lo });
  if (r === 'reset') { await call('steam:setTemplate', { key: c.key, template: null }); toast(`${c.label} back to automatic`, 'ok', 2500); }
  else if (r) { await call('steam:setTemplate', { key: c.key, template: r }); toast(`${c.label} saved`, 'ok', 2500); }
  load();
}
useView({ x: () => { if (missing.value.length && con.value?.template) addAll(); }, y: () => more() },
  [{ b: 'A', label: 'Add / Remove' }, { b: 'X', label: 'Add all' }, { b: 'Y', label: 'More' }, { b: 'B', label: 'Back' }]);
onMounted(async () => { await load(); await nextTick(); ensureFocus(el.value); });
</script>

<style scoped>
.sc-head { display: flex; align-items: center; gap: 22px; padding: 20px 24px; margin: 18px 0 14px; }
.sc-logo { width: 88px; height: 88px; border-radius: 16px; display: grid; place-items: center; background: rgba(255, 255, 255, 0.06); flex: none; }
.sc-title { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.sc-title h1 { font-size: 30px; font-weight: 700; margin: 0; }
.sc-acts { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
.sc-lo { padding: 14px 20px; display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
.lo { display: flex; gap: 16px; font-size: 13px; min-width: 0; }
.lo span { width: 120px; flex: none; color: var(--muted); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600; padding-top: 2px; }
.emu-row { align-items: center; }
.lo b { font-weight: 400; min-width: 0; word-break: break-all; }
.small { font-size: 12px; }
.ss-queue { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 12px; background: rgba(var(--primary-rgb), 0.2); border: 1px solid rgba(var(--primary-l-rgb), 0.5); margin-bottom: 18px; }
.ss-q-t { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.ss-q-t small { color: var(--muted); font-size: 12.5px; }
.sg-list { display: flex; flex-direction: column; gap: 8px; margin: 12px 0 40px; }
.sc-row { display: flex; align-items: center; gap: 16px; padding: 8px 16px; border-radius: 10px; background: rgba(16, 19, 28, 0.6); border: 1px solid var(--line); text-align: left; min-width: 0; }
.sc-row:focus { border-color: var(--primary-l); }
.sc-thumb { width: 40px; height: 54px; border-radius: 6px; overflow: hidden; background: #1a1e2a; flex: none; }
.sc-thumb img { width: 100%; height: 100%; object-fit: cover; }
.sc-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.sc-mid b { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sc-mid span { font-size: 12px; }
.sc-act { display: flex; align-items: center; gap: 8px; width: 120px; justify-content: flex-end; color: var(--muted); font-size: 12.5px; flex: none; }
.chip.how-learned { background: rgba(80, 200, 120, 0.18); color: #9be8b4; }
.chip.how-yours { background: rgba(var(--primary-rgb), 0.25); }
.chip.none { background: rgba(245, 197, 66, 0.18); color: #ffd978; }
</style>
