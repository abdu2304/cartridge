<template>
  <div class="view" :data-scroll="welcome ? null : ''" ref="el"><!-- inside the welcome its card scrolls -->
    <header class="page-head">
      <div style="min-width: 0">
        <div class="eyebrow">{{ first || welcome ? 'Setup' : 'Settings · Emulators' }}</div>
        <h1>{{ welcome ? 'Your system' : 'Emulators' }}</h1>
        <div class="lead">
          <template v-if="scanning">Looking through your folders for emulators…</template>
          <template v-else-if="ov?.scanned">Found {{ ov.scanned.count }} emulator{{ ov.scanned.count === 1 ? '' : 's' }} on this device. Games you add to Steam start with the one picked for their console.</template>
          <template v-else>Cartridge looks for emulators wherever they are: EmuDeck, Flatpaks, AppImages in any folder (even renamed), and installed programs.</template>
        </div>
      </div>
      <div class="row" style="flex: none">
        <button class="btn" data-focus :disabled="scanning" @click="scan()"><Icon name="mdiRadar" :class="{ spin: scanning }" />{{ ov?.scanned ? 'Scan again' : 'Scan' }}</button>
        <button class="btn" data-focus @click="more"><Icon name="mdiDotsHorizontal" />More</button>
        <button v-if="first || welcome" class="btn primary" data-focus :disabled="scanning" @click="finish"><Icon name="mdiCheck" />{{ welcome ? 'Continue' : 'Done' }}</button>
      </div>
    </header>

    <div v-if="scanning" class="scan glass">
      <div class="spinner" />
      <div class="l-mid">
        <b>{{ prog?.step === 'reading' ? `Reading what's inside ${prog.total} programs` : `${(prog?.dirs || 0).toLocaleString()} folders so far` }}</b>
        <span class="muted mono">{{ prog?.dir || ' ' }}</span>
      </div>
    </div>

    <template v-if="ov">
      <div v-if="facts.length" class="facts">
        <span v-for="f in facts" :key="f.t" class="status" :class="f.k"><Icon :name="f.i" :size="14" />{{ f.t }}</span>
      </div>

      <!-- 0.9.17: set the emulators up from here: BIOS and firmware from RomM into each emulator, game folders in their lists -->
      <div class="sec-title">Set up your emulators</div>
      <div class="stack">
        <button class="lrow" data-focus :disabled="!!prepBusy" @click="allBios">
          <Icon name="mdiChip" :size="24" />
          <div class="l-mid"><b>Get BIOS and firmware from RomM</b><span class="l-sub">{{ prepBusy === 'bios' ? 'Working… firmware for PS3 and Vita takes a minute' : 'Every console’s files from your RomM server, copied into each emulator that reads them (never over a file), PS3 and Vita firmware installed, Switch keys and firmware put in place' }}</span></div>
          <span v-if="prepBusy === 'bios'" class="status"><Icon name="mdiSync" :size="14" class="spin" />Working</span>
        </button>
        <button class="lrow" data-focus :disabled="!!prepBusy" @click="gameFolders">
          <Icon name="mdiFolderPlusOutline" :size="24" />
          <div class="l-mid"><b>Add your game folders to emulators</b><span class="l-sub">Your console folders added to PCSX2’s, DuckStation’s and Dolphin’s game lists. Close them first.</span></div>
        </button>
      </div>

      <template v-if="ov.unknown.length">
        <div class="sec-title">AppImages to name<span class="count">{{ ov.unknown.length }}</span></div>
        <div class="muted small-lead">Cartridge couldn't read which program these are. Say what each one is and it's used like any other.</div>
        <div class="stack">
          <button v-for="u in ov.unknown" :key="u.path" class="lrow" data-focus :data-key="'u-' + u.path" @click="nameIt(u)">
            <Icon name="mdiHelpCircleOutline" :size="24" />
            <div class="l-mid"><b>{{ u.name || base(u.path) }}</b><span class="l-sub mono">{{ u.short }}</span></div>
            <span class="l-end"><Btn b="A" />Which one?</span>
          </button>
        </div>
      </template>

      <div class="sec-title">Consoles<span class="count">{{ ov.consoles.length }}</span></div>
      <div class="stack">
        <template v-for="c in consoles" :key="c.key">
          <button class="lrow con" data-focus :data-key="'c-' + c.key" @click="open(c)">
            <PIcon :p="{ slug: c.slug, fs_slug: c.fs_slug }" :size="32" />
            <div class="l-mid">
              <b>{{ c.platform }}</b>
              <span class="l-sub">{{ usingText(c) }}</span>
            </div>
            <span class="status" :class="state(c).k"><Icon v-if="state(c).k === 'ok'" name="mdiCheck" :size="14" />{{ state(c).t }}</span>
          </button>
          <div v-for="u in c.unsure" :key="u.path" class="ask">
            <span>Is <b class="mono">{{ u.short }}</b> {{ u.label }}?</span>
            <button class="btn small" data-focus @click="confirmIt(u.path, u.id)"><Icon name="mdiCheck" :size="18" />Yes</button>
            <button class="btn small" data-focus @click="confirmIt(u.path, 'none')"><Icon name="mdiClose" :size="18" />No</button>
          </div>
          <div v-for="k in (c.using ? c.checks : []).filter((x) => x.level === 'bad' || x.level === 'warn')" :key="k.text" class="check" :class="k.level">
            <Icon :name="k.level === 'bad' ? 'mdiAlertCircle' : 'mdiAlert'" :size="18" /><span>{{ k.text }}</span>
            <button v-if="k.allow" class="btn small" data-focus @click="allowFlatpak(k.allow)"><Icon name="mdiFolderKeyOutline" :size="16" />Allow access</button>
            <button v-if="k.copy" class="btn small" data-focus @click="copy(k.copy)"><Icon name="mdiContentCopy" :size="16" />Copy the command</button>
            <button v-if="k.bios && bios[c.key]" class="btn small" data-focus @click="getBios(c)"><Icon name="mdiChip" :size="16" />Get {{ bios[c.key] }} from RomM</button>
          </div>
        </template>
      </div>
    </template>
    <div v-else-if="!scanning" class="center"><div class="spinner" /></div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, nextTick } from 'vue';
import { call, toast, go, choose, confirm, askText, pickFolder, store, romsOf, visiblePlatforms, saveConfig, openTour } from '../store.js';
import { addGame } from '../steam.js';
import { useView } from '../useView.js';
import { ensureFocus } from '../nav.js';
import Icon from '../components/Icon.vue';
import Btn from '../components/Btn.vue';
import PIcon from '../components/PIcon.vue';

// Setup → Emulators (first launch, and Settings → Steam): what was found for each console, which
// one Steam shortcuts use, and anything that would stop a game starting. Everything here only reads
// the emulators; picking one changes Cartridge's own settings.
const props = defineProps({ first: Boolean, welcome: Boolean });
const emit = defineEmits(['done', 'back']);
const el = ref(null);
const ov = ref(null);
const scanning = ref(false);
const prog = ref(null);
const base = (p) => String(p).split('/').pop();
const off = window.cart.on('setup-progress', (p) => { prog.value = p; });
onBeforeUnmount(() => { try { off?.(); } catch {} });

const facts = computed(() => {
  const o = ov.value, out = [];
  if (!o) return out;
  if (o.emudeck) out.push({ t: 'EmuDeck', k: 'ok', i: 'mdiCheck' });
  if (o.retrodeck) out.push({ t: 'RetroDECK found: pick an emulator per console for Steam', k: 'warn', i: 'mdiInformationOutline' });
  if (o.srm) out.push({ t: `Steam ROM Manager: ${o.srm} setup${o.srm === 1 ? '' : 's'}`, k: 'ok', i: 'mdiCheck' });
  if (!o.steam) out.push({ t: 'Steam not found', k: 'bad', i: 'mdiAlertCircle' });
  else if (o.steam.flatpak) out.push({ t: 'Steam is a Flatpak: it may not start emulators outside it', k: 'warn', i: 'mdiAlert' });
  if (o.scanned?.stopped) out.push({ t: 'The scan stopped early: Browse for anything missing', k: 'warn', i: 'mdiAlert' });
  return out;
});
// consoles still to sort out first, finished ones (Ready) below them, A to Z within each (0.9.3 C2)
const consoles = computed(() => {
  const l = ov.value?.consoles || [];
  return [...l.filter((c) => state(c).k !== 'ok'), ...l.filter((c) => state(c).k === 'ok')];
});
const emuLabel = (c) => c.emus.find((e) => e.id === c.emu)?.label || (c.emu === 'yours' ? 'Set by you' : '');
function usingText(c) {
  if (!c.using) return c.emus.length ? 'Pick an emulator' : 'No emulator found';
  return `${emuLabel(c) || c.using.from || 'Emulator'} · ${c.using.exe}`;
}
function state(c) {
  if (!c.using) return { k: 'none', t: 'Not found' };
  if (c.checks.some((x) => x.level === 'bad')) return { k: 'bad', t: 'Needs attention' };
  if (c.unsure.length) return { k: 'warn', t: 'Check' };
  if (c.checks.some((x) => x.level === 'warn')) return { k: 'warn', t: 'Check' };
  return { k: 'ok', t: 'Ready' };
}
async function load() {
  try { ov.value = await call('setup:overview'); } catch (e) { toast(e.message, 'error'); return; }
  // BIOS files your RomM server holds, for consoles missing theirs
  for (const c of ov.value.consoles) {
    if (!c.pid || !c.checks.some((k) => k.bios && k.level !== 'ok')) continue;
    call('bios:list', { platformId: c.pid }).then((l) => { if (l?.length) bios.value = { ...bios.value, [c.key]: `${l.length} file${l.length === 1 ? '' : 's'}` }; }).catch(() => {});
  }
}
const bios = ref({});
const prepBusy = ref('');
async function allBios() {
  prepBusy.value = 'bios';
  try {
    const r = await call('bios:all');
    const ok = r.filter((x) => !x.error), bad = r.filter((x) => x.error);
    toast(!r.length ? 'Your RomM server has no BIOS or firmware files.' : `${ok.length} console${ok.length === 1 ? '' : 's'} done${ok.some((x) => x.placed) ? `, ${ok.reduce((n, x) => n + (x.placed || 0), 0)} files copied into emulators` : ''}${bad.length ? `. Not done: ${bad.map((x) => `${x.name} (${x.error})`).join(', ')}` : ''}`, bad.length ? 'info' : 'ok', 8000, 'mdiChip');
    await load();
  } catch (e) { toast(e.message, 'error', 6000); }
  prepBusy.value = '';
}
async function gameFolders() {
  prepBusy.value = 'folders';
  try {
    const r = await call('setup:gameFolders');
    const added = r.filter((x) => x.added.length), skipped = r.filter((x) => x.skipped);
    toast(!r.length ? 'None of PCSX2, DuckStation or Dolphin is set up here yet.' : `${added.length ? 'Added to ' + added.map((x) => x.name).join(', ') : 'Every folder was already there'}${skipped.length ? `. Close ${skipped.map((x) => x.name).join(', ')} and try again for ${skipped.length === 1 ? 'it' : 'them'}.` : ''}`, skipped.length ? 'info' : 'ok', 6000, 'mdiFolderPlusOutline');
  } catch (e) { toast(e.message, 'error', 6000); }
  prepBusy.value = '';
}
// into your BIOS folder (Settings → Library), where EmuDeck and RetroArch setups look. Nothing is
// copied into an emulator's own folders.
async function getBios(c) {
  toast(/^(ps3|psvita)$/.test(c.slug) ? 'Getting the firmware and installing it. This takes a minute.' : 'Getting the BIOS files…', 'info', 4000, 'mdiChip');
  try { const r = await call('bios:download', { platformId: c.pid, slug: c.slug }); toast(r.installed ? `Firmware installed in ${r.emu === 'rpcs3' ? 'RPCS3' : 'Vita3K'}` : `${r.files.filter((f) => !f.skipped).length} BIOS file${r.count === 1 ? '' : 's'} saved in ${r.dir}`, 'ok', 5000, 'mdiChip'); await load(); }
  catch (e) { toast(e.message, 'error', 6000); }
}
async function scan(drives) {
  if (scanning.value) return;
  scanning.value = true; prog.value = null;
  try { ov.value = await call('setup:scan', { drives: !!drives }); toast(`Found ${ov.value.scanned?.count || 0} emulators`, 'ok', 2600, 'mdiRadar'); }
  catch (e) { toast(e.message, 'error'); }
  scanning.value = false;
  await nextTick(); ensureFocus(el.value);
}
async function more() {
  const v = await choose({ title: 'Emulators', options: [
    { label: 'Scan other drives too', sub: 'SD cards and other disks, slower', value: 'drives', icon: 'mdiHarddisk' },
    { label: 'Copy setup report', sub: 'For a bug report: personal details taken out', value: 'report', icon: 'mdiClipboardTextOutline' },
    ...(props.welcome ? [] : [{ label: 'Shortcut health', sub: 'Steam shortcuts that would fail', value: 'health', icon: 'mdiStethoscope' }]),
  ] });
  if (v === 'drives') scan(true);
  if (v === 'report') { const t = await call('setup:report'); await copy(t, 'Setup report copied'); }
  if (v === 'health') go('steam-health');
}
async function allowFlatpak(a) {
  if (!(await confirm('Allow access?', `Lets ${a.id} open files in\n${a.dir}\n\nOnly this Flatpak's permissions change (the same as running flatpak override). You can undo it in Flatseal or with flatpak override --reset.`, 'Allow'))) return;
  try { await call('setup:flatpakAllow', a); toast('Access allowed', 'ok', 2400); await load(); } catch (e) { toast(e.message, 'error', 6000); }
}
async function copy(text, msg = 'Copied') { try { await call('clip:write', { text }); toast(msg, 'ok', 2400, 'mdiContentCopy'); } catch (e) { toast(e.message, 'error'); } }
async function confirmIt(path, id) { await call('setup:confirm', { path, id }); await load(); }
const emuList = () => ov.value.known.filter((k) => k.for.length || k.id === 'retroarch').sort((a, b) => a.label.localeCompare(b.label)).map((k) => ({ label: k.label, value: k.id }));
// "Which one?": not an emulator, a fork of one (started with that one's options, shown by its own
// name), or an emulator. B on a later step goes back a step (0.9.3 C3).
async function nameIt(u) {
  for (;;) {
    const kind = await choose({ title: 'Which One?', message: u.short, options: [
      { label: 'Not an Emulator', value: 'none', icon: 'mdiClose' },
      { label: "It's a Fork", sub: 'A version of an emulator under another name, like BB Launcher for shadPS4', value: 'fork', icon: 'mdiSourceFork' },
      { label: "It's an Emulator", value: 'emu', icon: 'mdiGamepadVariantOutline' },
    ] });
    if (!kind) return;
    if (kind === 'none') { await confirmIt(u.path, 'none'); return toast('Left out', 'ok', 2000); }
    if (kind === 'emu') {
      const v = await choose({ title: "It's an Emulator", message: u.short, options: emuList() });
      if (!v) continue;
      await confirmIt(u.path, v); return toast('Noted', 'ok', 2000);
    }
    if (await forkIt(u.path, null, u.name || base(u.path))) return;
  }
}
// a fork: which emulator it comes from (skipped when known), then its name. False when backed out.
async function forkIt(file, of, name) {
  for (;;) {
    const id = of || await choose({ title: 'A Fork of Which Emulator?', message: base(file), options: emuList() });
    if (!id) return false;
    const n = await askText({ title: 'Name of the Fork', value: String(name).replace(/\.appimage$/i, ''), placeholder: 'BB Launcher' });
    if (n === null || n === undefined) { if (of) return false; continue; }
    try { await call('setup:fork', { path: file, of: id, name: n.trim() || base(file) }); toast('Noted as a fork', 'ok', 2000); await load(); return true; }
    catch (e) { toast(e.message, 'error'); return false; }
  }
}
// one console: pick an emulator, Browse to one, or add one game to try it
async function open(c) {
  const opts = [
    ...c.emus.filter((e) => !e.fork).map((e) => ({ label: e.label, sub: e.sub, value: 'emu:' + e.id, selected: c.emu === e.id, icon: 'mdiGamepadVariantOutline' })),
    ...(c.emus.some((e) => e.fork) ? [{ label: `Forks (${c.emus.filter((e) => e.fork).length})`, sub: c.emus.filter((e) => e.fork).map((e) => e.label.split(' · ')[0]).join(', '), value: 'forks', selected: c.emus.some((e) => e.fork && e.id === c.emu), icon: 'mdiSourceFork' }] : []),
    ...(c.emu === 'yours' ? [{ label: 'Set by you', sub: c.using?.exe, value: 'noop', selected: true, icon: 'mdiPencil' }] : []),
    { label: 'Browse to an emulator…', sub: 'Any file, any folder', value: 'browse', icon: 'mdiFolderSearchOutline' },
    ...(c.emus.some((e) => e.path && !e.fork) ? [{ label: 'One of these is a fork…', sub: 'Show it by its own name, used only when picked', value: 'fork', icon: 'mdiSourceFork' }] : []),
    ...(props.welcome ? [] : [{ label: 'Test with one game', sub: 'Adds one downloaded game to Steam to try it', value: 'test', icon: 'mdiPlayCircleOutline' }]),
    ...(c.using ? [{ label: 'Type your own launch options', sub: c.using.lo, value: 'lo', icon: 'mdiConsoleLine' }] : []),
    ...(props.welcome ? [] : [{ label: 'More options for this console', value: 'console', icon: 'mdiTune' }]),
  ];
  const v = await choose({ title: c.platform, message: c.checks.filter((k) => k.level !== 'bad' && k.level !== 'warn').map((k) => k.text).join('\n') || undefined, options: opts });
  if (!v || v === 'noop') return;
  if (v === 'forks') {
    const f = await choose({ sheet: true, title: 'Forks', message: c.platform, options: c.emus.filter((e) => e.fork).map((e) => ({ label: e.label, sub: e.sub, value: e.id, selected: c.emu === e.id, icon: 'mdiSourceFork', raw: true })) });
    if (!f) return open(c); // B: back to the console's list
    await call('steam:setEmu', { key: c.key, id: f }); await load(); return;
  }
  if (v.startsWith('emu:')) { await call('steam:setEmu', { key: c.key, id: v.slice(4) }); await load(); return; }
  if (v === 'console') return go('steam-console', { ckey: c.key });
  if (v === 'fork') {
    const e = await choose({ title: 'Which One Is a Fork?', options: c.emus.filter((x) => x.path && !x.fork).map((x) => ({ label: x.label, sub: x.sub, value: x })) });
    if (e) await forkIt(e.path, e.id.split('@')[0], base(e.path));
    return;
  }
  if (v === 'test') return testOne(c);
  if (v === 'lo') return ownLaunch(c);
  if (v === 'browse') {
    const file = await pickFolder({ title: `Emulator for ${c.platform}`, subtitle: 'Pick the program, AppImage or launcher script', start: store.info.home, files: '*', hidden: true });
    if (!file) return;
    let r = await call('setup:use', { key: c.key, file }).catch((e) => { toast(e.message, 'error'); return null; });
    if (r?.needs === 'which') {
      const id = await choose({ title: 'Which emulator is it?', message: r.guess ? `It looks like ${r.label}, which doesn't run ${c.platform} games.` : 'Cartridge couldn’t tell. Pick the one it behaves like: its launch options are used.', options: [
        ...ov.value.known.filter((k) => k.for.includes(c.key) || (k.id === 'retroarch')).map((k) => ({ label: k.label, value: k.id })),
      ] });
      if (!id) return;
      r = await call('setup:use', { key: c.key, file, as: id }).catch((e) => { toast(e.message, 'error'); return null; });
    }
    if (r?.ok) { toast(`${c.platform} games will use ${base(file)}`, 'ok', 3000); await load(); }
  }
}
// a downloaded game of this console that isn't in Steam yet goes in; then what to do with it
async function testOne(c) {
  const pl = visiblePlatforms().filter((p) => [p.slug, p.fs_slug].some((s) => s === c.slug || s === c.fs_slug));
  let rom = null;
  for (const r of pl.flatMap((p) => romsOf(p.id)).filter((r) => store.installed[r.id])) {
    const st = await call('steam:forRom', { romId: r.id }).catch(() => null);
    if (st && !st.inSteam && !st.queued && !st.needsFolder) { rom = r; break; }
  }
  if (!rom) return toast(`Download a ${c.platform} game that isn't in Steam yet, then test with it.`, 'info', 5000);
  await addGame(rom);
  const st = await call('steam:forRom', { romId: rom.id }).catch(() => null);
  if (!st?.inSteam && !st?.queued) return;
  await confirm(`Now start ${rom.name} in Steam`, `Find it in your Steam library and press Play.\n\nIf it doesn't start: open Shortcut health (More on this page), pick another emulator for ${c.platform}, or type your own launch options for it here.`, 'OK');
}
// your own arguments for this console's emulator ({ROM} is the game); things that must run first go before %command%
async function ownLaunch(c) {
  const lo = await askText({ title: `Launch options for ${c.platform}`, value: c.using.lo, placeholder: '-fullscreen "{ROM}"' });
  if (lo === null || lo === undefined) return;
  if (!/\{ROM\}|\{SERIAL\}|\{DIR\}|\{NAME\}/.test(lo)) return toast('Put {ROM} where the game goes', 'error', 4000);
  try { await call('steam:setTemplate', { key: c.key, template: { exe: c.using.rawExe, start: c.using.start, lo } }); toast(`${c.platform} games will start with your launch options`, 'ok', 3000); await load(); }
  catch (e) { toast(e.message, 'error'); }
}
async function finish() {
  await call('setup:done'); store.config.setupDone = Date.now();
  if (props.welcome) return emit('done'); // the welcome goes on and shows the tour at its end
  go('home');
  // then the few controls worth knowing, once
  if (!store.config.ui.toured) { await openTour(); saveConfig({ ui: { toured: true } }); }
}

useView({ x: () => scan(), y: () => more(), ...(props.first || props.welcome ? { start: () => finish() } : {}), ...(props.welcome ? { back: () => emit('back') } : {}) }, () => [{ b: 'A', label: 'Open' }, { b: 'X', label: 'Scan again' }, { b: 'Y', label: 'More' }, ...(props.first || props.welcome ? [{ b: 'START', label: 'Done' }] : [{ b: 'B', label: 'Back' }])]);
onMounted(async () => {
  await load();
  // first time here (or never scanned): look now
  if (!ov.value?.scanned) scan(); else { await nextTick(); ensureFocus(el.value); }
});
</script>

<style scoped>
.scan { display: flex; align-items: center; gap: var(--s-4); padding: var(--s-4) var(--s-5); margin-bottom: var(--s-4); }
.scan .l-mid { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.scan .mono { max-width: 70vw; }
.facts { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.small-lead { font-size: var(--t-sm); margin: -4px 0 var(--s-3); }
.ask, .check { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-2) var(--s-4) var(--s-2) 64px; font-size: var(--t-sm); flex-wrap: wrap; }
.ask .mono { font-size: var(--t-sm); }
.check.bad { color: #ffa39c; }
.check.warn { color: #ffd978; }
.check span { flex: 1 1 320px; min-width: 0; }
</style>
