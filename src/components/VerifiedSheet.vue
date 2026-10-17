<template>
  <div class="scrim" ref="el" @click.self="closeModal(null)">
    <div class="dialog vs">
      <div v-if="!e" class="muted small"><Icon name="mdiSync" :size="16" class="spin" /> Reading…</div>
      <template v-else>
        <div class="vs-head">
          <img v-if="art" class="vs-cover" :src="art" alt="" />
          <span v-else class="vs-cover vs-none"><Icon name="mdiGamepadVariantOutline" :size="28" /></span>
          <div class="vs-title">
            <div class="eyebrow"><Icon name="mdiCheckDecagramOutline" :size="15" /> Cartridge Verified · PC Port</div>
            <h2>{{ e.name }}</h2>
            <p class="muted small">By {{ e.by }}{{ e.licence ? ' · ' + e.licence : '' }}</p>
          </div>
        </div>
        <p class="vs-about">{{ e.about }}</p>
        <!-- one state, one main button (owner: "sleek and smooth with minimal input"): every step says what it needs -->
        <div class="vs-state" :class="'s-' + e.state">
          <div class="vs-step"><b>{{ step.title }}</b><span class="muted small">{{ step.sub }}</span></div>
          <div v-if="job" class="vs-job small"><Icon name="mdiSync" :size="16" class="spin" />{{ job.text || 'Working' }}{{ job.pct != null ? ` · ${job.pct}%` : '' }}<span class="up-bar"><i :style="{ width: (job.pct || 4) + '%' }" /></span></div>
          <div v-if="why" class="vs-why small"><Icon name="mdiAlertCircleOutline" :size="18" />{{ why }}</div>
          <div class="vs-main">
            <template v-if="e.state === 'play' || e.state === 'update'">
              <button v-for="(s, i) in e.starts" :key="s.id" class="btn" :class="{ primary: i === 0 || e.starts.length > 1 }" data-focus :data-key="'vs-play-' + s.id" :disabled="!!job" @click="play(s.id)"><Icon name="mdiPlay" :size="20" />{{ e.starts.length > 1 ? s.name : 'Play' }}</button>
              <button v-if="e.state === 'update'" class="btn" data-focus data-key="vs-update" :disabled="!!job" @click="install"><Icon name="mdiUpdate" :size="20" />Update to {{ e.latest?.tag }}</button>
            </template>
            <button v-else class="btn primary" data-focus data-key="vs-main" :disabled="!!job || step.off" @click="main"><Icon :name="step.icon" :size="20" />{{ step.button }}</button>
            <button v-if="e.installed" class="btn" data-focus data-key="vs-settings" @click="settings"><Icon name="mdiTune" :size="20" />Settings<span v-if="e.changed" class="count-dot">{{ e.changed }}</span></button>
            <button class="btn" data-focus data-key="vs-more" @click="more"><Icon name="mdiDotsHorizontal" :size="20" />More</button>
          </div>
        </div>
        <div class="vs-facts small">
          <div><b>Needs</b><span>{{ needs }}</span></div>
          <div v-if="e.copy"><b>Your Copy</b><span class="mono">{{ short(e.copy.source) }}{{ e.copy.version ? ' · version ' + e.copy.version : '' }}{{ e.copy.id ? ' · ' + e.copy.id : '' }}</span></div>
          <div v-for="(n, i) in [...(e.copy?.notes || []), ...e.installNotes]" :key="'n' + i"><b>{{ i ? '' : 'Note' }}</b><span>{{ n }}</span></div>
          <div><b>Runs With</b><span>{{ runsWith }}</span></div>
          <div v-if="e.installed"><b>Here</b><span class="mono">{{ short(e.installed.dir) }}</span></div>
          <div><b>Checked</b><span>{{ checked }}</span></div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
// A Cartridge Verified game (0.9.70, owner: "you don't need to add anything else, Cartridge makes the setup sleek").
// The steps are Install (the port, for this system), Your Copy (from your library, downloaded if needed), then Play;
// Settings opens the port's own settings in Cartridge. Nested pop-ups save this sheet's resolve and reopen it.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { store, call, toast, closeModal, choose, confirm, romById, cover, bgJob, ago, pickFolder, openModal, download, plural } from '../store.js';
import { pushLayer, focusFirst } from '../nav.js';
import Icon from './Icon.vue';

const props = defineProps({ id: String });
const el = ref(null), e = ref(null), why = ref(''), copies = ref([]), runner = ref(undefined), kept = ref([]), saveBaks = ref([]);
const short = (p) => String(p || '').replace(store.info?.home || '\0', '~');
const job = computed(() => bgJob('recomp:' + props.id) || bgJob('recompprep:' + props.id) || (copyRom.value ? dlJob.value : null));
const art = computed(() => { const r = e.value?.roms?.length && romById(e.value.roms[0]); return r ? cover(r) : ''; });
const copyRom = computed(() => copies.value[0] || null);
// your copy downloading: the download's own progress
const dlJob = computed(() => { const it = (store.downloads || []).find((d) => copies.value.some((c) => c.romId === d.romId) && ['queued', 'downloading', 'checking', 'unpacking'].includes(d.status)); return it ? { text: 'Downloading your copy', pct: it.total ? Math.floor((it.received / it.total) * 100) : null } : null; });
const needs = computed(() => { const w = e.value.wants; return [`Your own copy of ${w.title}${w.ids.length ? ` (${w.ids.join(', ')})` : ''}, ${w.pkg ? 'as a dump folder from your PS4 or a fake PKG made from it' : 'as a dump folder'}.`, w.version?.why || w.why].filter(Boolean).join(' '); });
const hasLinux = computed(() => e.value.builds.some((b) => b.os === 'linux'));
const runsWith = computed(() => {
  const x = e.value, b = x.build || (hasLinux.value ? 'linux' : 'windows');
  if (b === 'linux') return `Its Linux build.${x.buildNote ? ' ' + x.buildNote : ''}`;
  const r = runner.value;
  if (r === undefined) return 'Its Windows build, through Proton.';
  if (!r) return 'Its Windows build, through Proton, which isn’t installed here. Installing Steam brings it.';
  return `Its Windows build, through ${r.kind === 'umu' ? 'umu-launcher and ' : ''}${r.name}${r.kind === 'sniper' ? ' in Steam’s runtime' : ''}. Cartridge keeps its own Proton folder for it.`;
});
const checked = computed(() => { const v = e.value.verified; if (!v) return ''; const d = new Date(v.on); return `${isNaN(d) ? v.on : d.toLocaleDateString()}, with release ${v.release}. ${v.played ? 'Played through on a device.' : 'Installs and starts are checked; tell Cartridge’s author how it plays.'}`; });
// the one step that's next
const step = computed(() => {
  const x = e.value, here = copyRom.value?.here;
  if (x.state === 'get') {
    const off = !hasLinux.value && runner.value === null;
    return { title: 'Install the Port', sub: off ? 'It’s a Windows build and there’s no Proton here.' : `${x.latest?.tag ? x.latest.tag + ' · ' : ''}${hasLinux.value ? 'Linux build' : 'Windows build, through Proton'}. About a minute.`, button: 'Install', icon: 'mdiDownload', off };
  }
  if (x.state === 'broken') return { title: 'Its Files Are Missing', sub: 'Something removed the port’s program. Installing it again keeps your saves and settings.', button: 'Repair', icon: 'mdiWrenchOutline' };
  if (x.state === 'game') {
    if (here) return { title: 'Set Up With Your Copy', sub: `${copyRom.value.name} from your library, on this device. Cartridge checks it and sets everything up.`, button: 'Set Up', icon: 'mdiCogPlayOutline' };
    if (copyRom.value) return { title: 'Get Your Copy', sub: `${copyRom.value.name} is in your library but not on this device. It downloads, then sets up by itself.`, button: 'Download Your Copy', icon: 'mdiDownload' };
    return { title: 'Your Copy', sub: `${x.wants.title} isn’t in your library. Pick its folder on this device.`, button: 'Pick a Folder', icon: 'mdiFolderOpenOutline' };
  }
  if (x.state === 'setup') return { title: 'Finish Setting Up', sub: 'Your copy is picked; its settings and start still need writing.', button: 'Set Up', icon: 'mdiCogPlayOutline' };
  return x.state === 'update' ? { title: 'An Update Is Out', sub: `${x.installed.tag} now, ${x.latest?.tag} out. Your saves are backed up first and this version is kept.` } : { title: 'Ready to Play', sub: `${x.installed.tag} · ${x.changed ? `${x.changed} of ${x.settingsCount} settings changed` : `${plural(x.settingsCount, 'setting')}, all at the port’s own`}` };
});
let resolveOuter = null, waitCopy = false;
const reopen = () => { if (store.modal?.type !== 'verified') store.modal = { type: 'verified', props: { id: props.id }, resolve: resolveOuter }; };
async function load() {
  const l = await call('recomps:list').catch(() => null);
  e.value = l?.entries.find((x) => x.id === props.id) || null;
  if (!e.value) return;
  copies.value = await call('recomps:copies', { id: props.id }).catch(() => []);
  copies.value.sort((a, b) => b.here - a.here);
  if (e.value.installed) { kept.value = (await call('recomps:versions', { id: props.id }).catch(() => ({ kept: [] }))).kept; saveBaks.value = (await call('recomps:backups', { id: props.id }).catch(() => [])) || []; }
  if (!e.value.latest) call('recomps:check', { id: props.id }).then(load).catch(() => {});
  // your copy finished downloading while waiting: set up straight away
  if (waitCopy && e.value.state === 'game' && copies.value[0]?.here) { waitCopy = false; prepare(); }
}
let off = [], layer = null;
onMounted(async () => {
  resolveOuter = store.modal?.resolve;
  layer = pushLayer(el.value, { back: () => closeModal(null), start: () => closeModal(null), lb() {}, rb() {}, y: () => more(), select() {}, lt() {}, rt() {} });
  off = [window.cart.on('bg-job', (j) => { if (['recomp:', 'recompprep:'].some((k) => j?.key === k + props.id) && j.state !== 'run') load(); }), window.cart.on('installed', () => load())];
  call('recomps:runner').then((r) => (runner.value = r)).catch(() => (runner.value = null));
  await load(); await nextTick(); if (el.value) focusFirst(el.value);
});
onBeforeUnmount(() => { off.forEach((f) => f?.()); layer?.pop(); });

async function main() {
  const s = e.value.state;
  if (s === 'get' || s === 'broken') return install();
  if (s === 'game' && !copyRom.value?.here && copyRom.value) { const rom = romById(copyRom.value.romId); if (rom) { waitCopy = true; await download(rom); reopen(); toast('Downloading your copy. It sets up when it’s here.', 'info', 3500, 'mdiDownload'); } return; }
  if (s === 'game' && !copyRom.value) return pickCopy();
  return prepare();
}
async function install() {
  why.value = '';
  try {
    const r = await call('recomps:install', { id: props.id });
    toast(r.already ? 'Already the newest' : r.updated ? `Updated to ${r.tag}` : `${e.value.name} is installed`, 'ok', 2500, 'mdiCheck');
    await load();
    // straight on: your copy when it's here (owner: minimal input)
    if (e.value.state === 'game' && copyRom.value?.here) await prepare();
  } catch (er) { why.value = er.message; load(); }
}
async function prepare(dir) {
  why.value = '';
  try {
    const r = await call('recomps:prepare', { id: props.id, ...(dir ? { dir } : {}) });
    if (!r.ok) why.value = r.why || (r.problems || []).join(' ');
    else toast(`${e.value.name} is ready`, 'ok', 2500, 'mdiCheck');
  } catch (er) { why.value = er.message; }
  load();
}
async function pickCopy() {
  const dir = await pickFolder({ title: `Your Copy of ${e.value.wants.title}`, subtitle: 'The dump folder: the one holding eboot.bin and sce_sys', start: store.info?.home, hidden: true, ...(e.value.wants.pkg ? { files: ['pkg'] } : {}) });
  reopen();
  if (dir) await prepare(dir);
}
async function play(start) { why.value = ''; try { await call('recomps:open', { id: props.id, start }); } catch (er) { why.value = er.message; } }
function settings() { openModal('gamesettings', { recomp: props.id, name: e.value.name, romId: e.value.roms?.[0] ?? null }).then(() => load()); }
async function more() {
  const x = e.value, inst = x.installed;
  const opts = [
    ...(inst && x.state !== 'get' ? [{ label: x.installed?.steam ? 'In Steam' : 'Add to Steam', sub: x.starts.length > 1 ? `${x.starts.length} shortcuts, one per game, in a Recomps collection` : 'Its own shortcut, in a Recomps collection', value: 'steam', icon: 'mdiSteam', disabled: !x.starts.length || !!x.installed?.steam }] : []),
    ...(inst ? [{ label: 'Use Another Copy', sub: x.copy ? short(x.copy.source) : 'Pick the folder', value: 'copy', icon: 'mdiFolderSwapOutline' }] : []),
    ...(inst && x.builds.length > 1 ? [{ label: `Use the ${x.build === 'linux' ? 'Windows' : 'Linux'} Build`, sub: x.build === 'linux' ? 'Through Proton' : 'Native', value: 'build', icon: 'mdiSwapHorizontal' }] : []),
    ...(inst && !x.update ? [{ label: 'Check for Updates', sub: `${inst.tag}${x.latest?.at ? ' · checked ' + ago(x.latest.at) : ''}`, value: 'check', icon: 'mdiRefresh' }] : []),
    ...(kept.value.length ? [{ label: 'Roll Back', sub: `${kept.value.length} earlier ${kept.value.length === 1 ? 'version' : 'versions'} kept`, value: 'roll', icon: 'mdiHistory' }] : []),
    ...(saveBaks.value.length ? [{ label: 'Save Backups', sub: `${saveBaks.value.length} kept, newest ${ago(saveBaks.value[0].at)}`, value: 'baks', icon: 'mdiContentSaveMoveOutline' }] : []),
    { label: 'Project Page', sub: x.url, value: 'page', icon: 'mdiOpenInNew' },
    ...(inst ? [{ label: 'Remove', sub: 'Saves backed up first, its folder goes to the Trash', value: 'remove', icon: 'mdiDeleteOutline' }] : []),
  ];
  const v = await choose({ title: x.name, sheet: true, options: opts.filter((o) => !o.disabled) });
  reopen();
  if (!v) return;
  why.value = '';
  try {
    if (v === 'steam') { const r = await call('recomps:steam', { id: props.id }); toast(r.added ? 'Added to Steam, in Recomps' : 'Queued: Settings → Steam → Apply adds it (Steam restarts)', r.added ? 'ok' : 'info', 4000, 'mdiSteam'); }
    if (v === 'copy') await pickCopy();
    if (v === 'build') { await call('recomps:install', { id: props.id, build: x.build === 'linux' ? 'windows' : 'linux' }); toast('Switched', 'ok', 2000, 'mdiCheck'); }
    if (v === 'check') await call('recomps:check', { id: props.id, force: true });
    if (v === 'roll') { const t = await choose({ title: 'Roll Back', message: `In use: ${inst.tag}. Saves are backed up before switching.`, options: kept.value.map((k) => ({ label: k.tag, sub: `Kept ${ago(k.at)}`, value: k.tag, icon: 'mdiHistory', raw: true })) }); reopen(); if (t) await call('recomps:useVersion', { id: props.id, tag: t }); }
    if (v === 'baks') { const s = await choose({ title: 'Save Backups', message: 'Pick one to put back. The saves there now are backed up first.', options: saveBaks.value.map((b) => ({ label: new Date(b.at).toLocaleString(), sub: `${b.tag || ''} · ${b.files} ${b.files === 1 ? 'file' : 'files'}`, value: b.stamp, icon: 'mdiContentSaveOutline', raw: true })) }); reopen(); if (s && (await confirm('Put This Backup Back?', 'Its save files replace the ones there now. Files made since stay where they are.', 'Put It Back'))) { reopen(); await call('recomps:restore', { id: props.id, stamp: s }); toast('Put back', 'ok', 2000, 'mdiCheck'); } reopen(); }
    if (v === 'page') window.open(x.url, '_blank');
    if (v === 'remove') { const ok = await confirm(`Remove ${x.name}?`, 'Its saves are backed up first, and its folder goes to the Trash. Your copy of the game isn’t touched.', 'Remove', true); reopen(); if (ok) { await call('recomps:remove', { id: props.id, steam: !!x.installed?.steam }); toast('Removed', 'ok', 2000, 'mdiCheck'); } }
  } catch (er) { why.value = er.message; }
  load();
}
</script>

<style scoped>
.vs { width: min(780px, 94vw); max-height: 90vh; display: flex; flex-direction: column; gap: var(--s-3); overflow-y: auto; }
.vs-head { display: flex; gap: var(--s-3); align-items: center; }
.vs-cover { width: 72px; height: 96px; object-fit: cover; border-radius: var(--r-sm); flex: none; }
.vs-none { display: grid; place-items: center; background: var(--s2); color: var(--muted); }
.vs-title { min-width: 0; }
.vs-title .eyebrow { display: inline-flex; align-items: center; gap: 4px; }
.vs-title h2 { margin: 2px 0 4px; font-size: var(--t-xl); line-height: 1.15; overflow-wrap: anywhere; }
.vs-title p { margin: 0; overflow-wrap: anywhere; }
.vs-about { margin: 0; overflow-wrap: anywhere; line-height: 1.45; }
.vs-state { display: flex; flex-direction: column; gap: var(--s-2); padding: var(--s-3); border-radius: var(--r-md); background: var(--s2); }
.vs-step { display: flex; flex-direction: column; gap: 2px; }
.vs-step b { font-size: var(--t-lg); }
.vs-step span { overflow-wrap: anywhere; }
.vs-main { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.vs-job { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.vs-why { display: flex; gap: 8px; align-items: flex-start; color: var(--danger-t, #ffa39c); overflow-wrap: anywhere; }
.vs-facts { display: grid; grid-template-columns: max-content 1fr; gap: 6px var(--s-3); }
.vs-facts > div { display: contents; }
.vs-facts b { color: var(--muted); font-weight: 600; }
.vs-facts span { overflow-wrap: anywhere; }
</style>
