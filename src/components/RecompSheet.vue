<template>
  <div class="scrim" ref="el" @click.self="closeModal(null)">
    <div class="dialog rcs">
      <div v-if="!e" class="muted small"><Icon name="mdiSync" :size="16" class="spin" /> Reading…</div>
      <template v-else>
        <div class="rcs-head">
          <img v-if="art" class="rcs-cover" :src="art" alt="" />
          <div class="rcs-title">
            <div class="eyebrow">Recomp · {{ consoleName }}</div>
            <h2>{{ e.name }}</h2>
            <p class="muted small">{{ e.games.map((g) => g.title).join(', ') }}{{ e.license ? ' · ' + e.license : '' }}</p>
          </div>
        </div>
        <p v-if="e.description || det?.description" class="rcs-desc">{{ e.description || det.description }}</p>
        <!-- 0.9.66 (agreed plan): the project's own page at a glance: its first README picture, stars, newest version, notes -->
        <img v-if="det?.picture && !picBad" class="rcs-pic" :src="det.picture" alt="" @error="picBad = true" />
        <div v-if="det && (det.stars != null || det.tag)" class="rcs-proj small muted">
          <span v-if="det.stars != null"><Icon name="mdiStarOutline" :size="16" /> {{ det.stars.toLocaleString() }}</span>
          <span v-if="det.tag"><Icon name="mdiTagOutline" :size="16" /> {{ det.tag }}{{ det.date ? ' · ' + new Date(det.date).toLocaleDateString() : '' }}</span>
        </div>
        <details v-if="det?.notes" class="rcs-notes small"><summary data-focus tabindex="0">Release Notes · {{ det.tag }}</summary><p>{{ det.notes }}</p></details>
        <div class="rcs-facts small">
          <div><b>Needs</b><span>{{ e.needs ? e.needs.what : 'Nothing more: it plays once it’s installed.' }}</span></div>
          <div v-if="e.needs"><b>Setup</b><span>{{ HOW[e.setup?.how] || HOW.picker }}</span></div>
          <div><b>Build</b><span>{{ buildText }}</span></div>
          <div v-if="e.installed"><b>Here</b><span class="mono">{{ short(e.installed.dir) }}</span></div>
          <div v-if="e.installed?.game"><b>Your Copy</b><span class="mono">{{ short(e.installed.game.file) }}{{ e.installed.game.checked === false ? ' (used anyway)' : '' }}</span></div>
          <div v-if="e.saves?.length"><b>Saves</b><span>Backed up before every update and removal, then checked.</span></div>
        </div>
        <!-- 0.9.67: checking your copy, then the recomp building its own files on its first start, with how much it has written -->
        <div v-if="setupJob" class="rcs-job small"><Icon name="mdiCogOutline" :size="16" class="spin" />{{ setupJob.key.startsWith('recompset:') ? 'Checking your copy' : 'Setting itself up' }}{{ setupJob.text ? ' · ' + setupJob.text : '' }}{{ setupJob.pct != null ? ` · ${setupJob.pct}%` : '' }}<span class="up-bar"><i :style="{ width: (setupJob.pct || 4) + '%' }" /></span></div>
        <div v-else-if="setupErr" class="rcs-why small"><Icon name="mdiAlertCircleOutline" :size="18" />{{ setupErr.error }}</div>
        <div v-if="job" class="rcs-job small"><Icon name="mdiSync" :size="16" class="spin" />{{ job.text || 'Working' }}{{ job.pct != null ? ` · ${job.pct}%` : '' }}<span class="up-bar"><i :style="{ width: (job.pct || 4) + '%' }" /></span></div>
        <div v-if="why" class="rcs-why small"><Icon name="mdiAlertCircleOutline" :size="18" />{{ why }}</div>
        <div class="rcs-acts" data-scroll>
          <template v-if="!e.installed">
            <button v-if="canGet" class="lrow" data-focus data-key="rc-install" :disabled="!!job" @click="install"><Icon name="mdiDownload" :size="24" /><span class="l-mid"><b>Install</b><span class="l-sub">{{ latestText }}</span></span></button>
          </template>
          <template v-else>
            <button v-if="e.update" class="lrow" data-focus data-key="rc-update" :disabled="!!job" @click="install"><Icon name="mdiUpdate" :size="24" /><span class="l-mid"><b>Update to {{ e.latest.tag }}</b><span class="l-sub">Your saves are backed up first, and this version is kept so you can go back</span></span></button>
            <button v-if="e.needs" class="lrow" data-focus data-key="rc-game" @click="setUp"><Icon name="mdiGamepadVariantOutline" :size="24" /><span class="l-mid"><b>{{ e.installed.ready ? 'Change Your Copy' : 'Set Up With Your Game' }}</b><span class="l-sub">{{ e.installed.game ? short(e.installed.game.file) : 'Not set yet' }}</span></span><span v-if="!e.installed.ready" class="l-end"><span class="status warn">Needed</span></span></button>
            <button v-if="e.installed.ready && e.setup?.how === 'picker' && !e.done" class="lrow" data-focus @click="markDone"><Icon name="mdiCheckCircleOutline" :size="24" /><span class="l-mid"><b>It’s Set Up</b><span class="l-sub">Press once it has your game</span></span></button>
            <button class="lrow" data-focus data-key="rc-steam" :disabled="!!e.installed.steam" @click="toSteam"><Icon name="mdiSteam" :size="24" /><span class="l-mid"><b>{{ e.installed.steam ? 'In Steam' : 'Add to Steam' }}</b><span class="l-sub">{{ e.installed.steam ? 'In your Recomps collection' : 'Its own shortcut, in a Recomps collection, apart from the emulated game' }}</span></span></button>
            <button class="lrow" data-focus data-key="rc-open" @click="openIt"><Icon name="mdiPlay" :size="24" /><span class="l-mid"><b>{{ e.installed.kind === 'windows' ? 'Open Through Steam' : 'Open' }}</b><span class="l-sub">{{ e.installed.kind === 'windows' ? 'A Windows build: Proton runs it, as it will in play' : 'Start it here' }}</span></span></button>
            <button v-if="!e.update" class="lrow" data-focus :disabled="checking" @click="check"><Icon name="mdiRefresh" :size="24" :class="{ spin: checking }" /><span class="l-mid"><b>Check for Updates</b><span class="l-sub">{{ e.installed.tag }}{{ e.latest?.at ? ' · checked ' + ago(e.latest.at) : '' }}</span></span></button>
            <button class="lrow" data-focus @click="channel"><Icon name="mdiSourceBranch" :size="24" /><span class="l-mid"><b>Updates: {{ e.installed.channel === 'pre' ? 'Pre-releases' : 'Stable' }}</b><span class="l-sub">Which releases it updates to. Never automatic.</span></span></button>
            <button v-if="kept.length" class="lrow" data-focus @click="versions"><Icon name="mdiHistory" :size="24" /><span class="l-mid"><b>Roll Back</b><span class="l-sub">{{ kept.length }} earlier {{ kept.length === 1 ? 'version' : 'versions' }} kept</span></span></button>
            <button class="lrow" data-focus @click="remove"><Icon name="mdiDeleteOutline" :size="24" /><span class="l-mid"><b>Remove</b><span class="l-sub">Saves backed up first, the folder goes to the Trash</span></span></button>
          </template>
          <button v-if="e.url || e.site" class="lrow" data-focus @click="openPage"><Icon name="mdiOpenInNew" :size="24" /><span class="l-mid"><b>{{ e.builds === 'none' ? 'Build It Yourself' : e.builds === 'site' ? 'Open Its Site' : 'Project Page' }}</b><span class="l-sub">{{ e.builds === 'none' ? 'It doesn’t publish builds: its page says how to build it' : e.url || e.site }}</span></span></button>
        </div>
        <div class="row" style="justify-content: flex-end"><button class="btn" data-focus @click="closeModal(null)">Close</button></div>
      </template>
    </div>
  </div>
</template>

<script setup>
// One recomp (0.9.65): what it is and needs, then everything to do with it. Nested pop-ups (the picker, the folder
// browser, confirmations) save this sheet's resolve and reopen it, as the single pop-up slot needs.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { store, call, toast, closeModal, openModal, choose, confirm, romById, cover, bgJob, ago, pickFolder } from '../store.js';
import { pushLayer, focusFirst } from '../nav.js';
import Icon from './Icon.vue';

const props = defineProps({ id: String });
const el = ref(null), e = ref(null), det = ref(null), picBad = ref(false), kept = ref([]), why = ref(''), checking = ref(false), consoles = ref({});
const HOW = { place: 'Cartridge links your copy where it looks for it (nothing is copied).', path: 'Cartridge starts it with your copy.', picker: 'It asks for your copy itself the first time; Cartridge shows you the exact path to give it.', none: 'Nothing to set up.' };
const short = (p) => String(p || '').replace(store.info?.home || '\0', '~');
const job = computed(() => bgJob('recomp:' + props.id));
const setupJob = computed(() => bgJob('recompset:' + props.id) || bgJob('recompsetup:' + props.id));
const setupErr = computed(() => Object.values(store.bgJobs || {}).find((j) => j.key === 'recompsetup:' + props.id && j.state === 'error') || null);
const consoleName = computed(() => consoles.value[e.value?.games?.[0]?.console] || '');
const art = computed(() => { const r = e.value?.roms?.length && romById(e.value.roms[0]); return r ? cover(r) : ''; });
const canGet = computed(() => !!(e.value && e.value.repo && !['none', 'site'].includes(e.value.builds)));
const buildText = computed(() => {
  const x = e.value;
  if (x.installed) return `${x.installed.tag} · ${x.installed.kind === 'windows' ? 'Windows build, through Proton' : 'Linux build'}`;
  if (x.builds === 'none') return 'No builds published: it has to be built from its source.';
  if (x.builds === 'site') return 'Downloaded from its own site.';
  return x.builds === 'windows' ? 'Windows build, run through Proton (it has no Linux build).' : 'Linux build first, Windows through Proton only if there’s none.';
});
const latestText = computed(() => {
  const l = e.value?.latest;
  if (!l) return 'Checking its newest release…';
  if (l.none === 'nobuild') return 'Its newest release has no Linux or Windows build';
  if (l.none) return 'No releases yet';
  return `${l.tag} · ${l.kind === 'windows' ? 'Windows build, through Proton' : 'Linux build'}`;
});
let resolveOuter = null;
const reopen = () => { store.modal = { type: 'recomp', props: { id: props.id }, resolve: resolveOuter }; };
async function load() {
  const l = await call('recomps:list').catch(() => null);
  consoles.value = l?.consoles || {};
  e.value = l?.entries.find((x) => x.id === props.id) || null;
  if (e.value?.installed) kept.value = (await call('recomps:versions', { id: props.id }).catch(() => ({ kept: [] }))).kept;
  if (e.value && !e.value.installed && !e.value.latest && canGet.value) call('recomps:check', { id: props.id }).then(load).catch((er) => (why.value = er.message));
  if (e.value?.repo && !det.value) call('recomps:details', { id: props.id }).then((d) => { det.value = d; }).catch(() => {});
}
let off = null, layer = null;
onMounted(async () => {
  resolveOuter = store.modal?.resolve;
  layer = pushLayer(el.value, { back: () => closeModal(null), start: () => closeModal(null), lb() {}, rb() {}, y() {}, select() {}, lt() {}, rt() {} });
  off = window.cart.on('bg-job', (j) => { if (['recomp:', 'recompsetup:'].some((k) => j?.key === k + props.id) && j.state !== 'run') load(); });
  await load(); await nextTick(); if (el.value) focusFirst(el.value);
});
onBeforeUnmount(() => { off?.(); layer?.pop(); });

async function install() {
  why.value = '';
  try {
    const r = await call('recomps:install', { id: props.id });
    // 0.9.66: the new release is started once; one that can't run here goes back to the one that worked
    if (r.rolledBack) { why.value = `${r.newTag} couldn’t start here (${r.why}), so ${e.value.name} went back to ${r.tag}. Your saves are as they were.`; toast(`${r.newTag} couldn’t start, kept ${r.tag}`, 'error', 6000); }
    else if (r.rollBackFailed) why.value = `${r.tag} couldn’t start here (${r.why}), and going back failed: ${r.rollBackFailed}. Use Roll Back.`;
    else toast(r.already ? 'Already the newest' : r.updated ? `Updated to ${r.tag}${r.started ? ', started once to check' : ''}${r.restored ? ', saves put back' : ''}` : `${e.value.name} is installed`, 'ok', 3000, 'mdiCheck');
  } catch (er) { why.value = er.message; }
  load();
}
async function check() {
  checking.value = true; why.value = '';
  try { const l = await call('recomps:check', { id: props.id, force: true }); if (l.none === 'nobuild') why.value = 'Its newest release has no Linux or Windows build.'; }
  catch (er) { why.value = er.message; }
  checking.value = false; load();
}
// your copy: from your library when it's on this device, else picked by hand; checked before it's used
async function setUp() {
  why.value = '';
  const lib = await call('recomps:gameFiles', { id: props.id }).catch(() => []);
  const v = await choose({ title: 'Which Copy?', message: e.value.needs?.what || '', options: [...lib.map((g) => ({ label: g.name, sub: short(g.file), value: g.file, icon: 'mdiGamepadVariant', raw: true })), { label: 'Pick a File', sub: 'Anywhere on this device', value: '__pick', icon: 'mdiFolderOpenOutline' }] });
  let file = v;
  if (v === '__pick') file = await pickFolder({ title: 'Your Copy of the Game', subtitle: e.value.needs?.what || '', start: store.info?.home, hidden: true, files: e.value.needs?.ext?.length ? e.value.needs.ext : '*' });
  reopen();
  if (!file) return;
  let r = await call('recomps:setGame', { id: props.id, file }).catch((er) => ({ ok: false, why: er.message }));
  if (!r.ok && r.wrong) {
    const ok = await confirm('Not the Version It Needs', `${r.why}\n\nIt may not start, or may not work properly.`, 'Use It Anyway', true);
    reopen();
    if (ok) r = await call('recomps:setGame', { id: props.id, file, force: true }).catch((er) => ({ ok: false, why: er.message }));
  }
  if (!r.ok) { why.value = r.why; return load(); }
  if (r.how === 'picker') {
    const go = await confirm('Give It Your Game', `${r.note}\n\nOpen it now? When it has your game, come back and press It’s Set Up.`, e.value.installed.kind === 'windows' ? 'Open Through Steam' : 'Open');
    reopen();
    if (go) await openIt();
  } else toast(r.note || 'Set up', 'ok', 3000, 'mdiCheck');
  load();
}
async function markDone() { await call('recomps:done', { id: props.id }); load(); }
async function toSteam() {
  why.value = '';
  try {
    const r = await call('recomps:steam', { id: props.id });
    if (r.added) toast('Added to Steam, in Recomps', 'ok', 2500, 'mdiSteam');
    else toast('Queued: Settings → Steam → Apply adds it (Steam restarts)', 'info', 4500, 'mdiSteam');
  } catch (er) { why.value = er.message; }
  load();
}
async function openIt() { why.value = ''; try { await call('recomps:open', { id: props.id }); } catch (er) { why.value = er.message; } }
async function channel() {
  const v = await choose({ title: 'Which Releases?', options: [{ label: 'Stable', sub: 'Its normal releases', value: 'stable' }, { label: 'Pre-releases', sub: 'Test builds as they come out', value: 'pre' }] });
  reopen();
  if (v) { await call('recomps:channel', { id: props.id, channel: v }); load(); }
}
async function versions() {
  const v = await choose({ title: 'Roll Back', message: `In use: ${e.value.installed.tag}. Saves are backed up before switching.`, options: kept.value.map((k) => ({ label: k.tag, sub: `Kept ${ago(k.at)}`, value: k.tag, icon: 'mdiHistory', raw: true })) });
  reopen();
  if (!v) return;
  try { await call('recomps:useVersion', { id: props.id, tag: v }); toast(`Now on ${v}`, 'ok', 2500, 'mdiCheck'); } catch (er) { why.value = er.message; }
  load();
}
async function remove() {
  const v = await choose({ title: `Remove ${e.value.name}?`, message: 'Its saves are backed up first, and its folder goes to the Trash.', options: [{ label: 'Remove', value: 'keep', icon: 'mdiDeleteOutline' }, ...(e.value.installed.steam ? [{ label: 'Remove, and Its Steam Shortcut', value: 'steam', icon: 'mdiSteam' }] : [])] });
  reopen();
  if (!v) return;
  try { await call('recomps:remove', { id: props.id, steam: v === 'steam' }); toast('Removed', 'ok', 2000, 'mdiCheck'); } catch (er) { why.value = er.message; }
  load();
}
function openPage() { window.open(e.value.url || e.value.site, '_blank'); }
</script>

<style scoped>
.rcs { width: min(760px, 94vw); max-height: 90vh; display: flex; flex-direction: column; gap: var(--s-3); }
.rcs-head { display: flex; gap: var(--s-3); align-items: center; }
.rcs-cover { width: 72px; height: 96px; object-fit: cover; border-radius: var(--r-sm); flex: none; }
.rcs-title { min-width: 0; }
.rcs-title h2 { margin: 2px 0 4px; font-size: var(--t-xl); line-height: 1.15; overflow-wrap: anywhere; }
.rcs-title p { margin: 0; overflow-wrap: anywhere; }
.rcs-desc { margin: 0; overflow-wrap: anywhere; }
.rcs-pic { display: block; max-width: 100%; max-height: 220px; object-fit: contain; border-radius: var(--r-md); align-self: flex-start; }
.rcs-proj { display: flex; flex-wrap: wrap; gap: 4px var(--s-3); }
.rcs-proj span { display: inline-flex; align-items: center; gap: 4px; }
.rcs-notes summary { cursor: pointer; font-weight: 600; border-radius: var(--r-sm); padding: 4px 6px; margin-left: -6px; width: max-content; max-width: 100%; }
.rcs-notes p { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.rcs-facts { display: grid; grid-template-columns: max-content 1fr; gap: 6px var(--s-3); }
.rcs-facts > div { display: contents; }
.rcs-facts b { color: var(--muted); font-weight: 600; }
.rcs-facts span { overflow-wrap: anywhere; }
.rcs-job { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rcs-bar { flex: 1 1 120px; height: 6px; border-radius: 3px; background: var(--s3); overflow: hidden; }
.rcs-bar > i { display: block; height: 100%; background: var(--text); transition: width var(--progress); }
.rcs-why { display: flex; gap: 8px; align-items: flex-start; color: var(--danger-t, #ffa39c); overflow-wrap: anywhere; }
.rcs-acts { display: flex; flex-direction: column; gap: 4px; overflow-y: auto; min-height: 0; padding: 2px; }
.rcs-acts .lrow { flex: none; }
</style>
