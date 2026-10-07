<template>
  <div class="eg">
    <!-- Cartridge Installer (0.9.24, owner: feel like an installer): where, what, installing, done -->
    <div v-if="flow" class="eg-steps">
      <template v-for="(t, i) in STEP_NAMES" :key="t"><span v-if="i || !fresh || fresh.fresh" class="eg-step" :class="{ on: stepAt === i, past: stepAt > i }"><i>{{ stepAt > i ? '✓' : fresh && !fresh.fresh ? i : i + 1 }}</i>{{ t }}</span></template>
    </div>
    <!-- 1: where emulators live (the welcome, or when no Emulation folder was made yet) -->
    <template v-if="phase === 'where'">
      <div class="eg-intro"><b>Where should your emulators live?</b><span class="muted">Cartridge makes an Emulation folder there, laid out like ES-DE and EmuDeck: roms (a folder per console), bios, saves and storage.</span></div>
      <div v-if="!drives" class="muted small"><Icon name="mdiSync" :size="16" class="spin" /> Looking at your drives…</div>
      <div v-else class="eg-drives">
        <button v-for="d in drives" :key="d.path" class="eg-drive" data-focus :class="{ busy: busy === d.path }" :aria-busy="busy === d.path" :disabled="d.emulation && store.config.emulationRoot !== d.path + '/Emulation'" @click="pickDrive(d)">
          <Icon :name="d.internal ? 'mdiHarddisk' : 'mdiSd'" :size="34" />
          <b>{{ d.label }}</b>
          <span class="muted small mono">{{ short(d.path) }}/Emulation</span>
          <span v-if="d.total" class="eg-space"><i :style="{ width: Math.round(((d.total - d.free) / d.total) * 100) + '%' }" /></span>
          <span class="muted small">{{ d.total ? `${bytes(d.free)} free of ${bytes(d.total)}` : '' }}{{ d.emulation ? ' · already has an Emulation folder, left as it is' : '' }}</span>
        </button>
      </div>
    </template>

    <!-- 2 (installer): tick the emulators to install; the first of each console without one is ticked -->
    <template v-else-if="phase === 'pick'">
      <div class="eg-bar">
        <div class="eg-sum"><b>{{ picked.length ? `${picked.length} to install` : 'Pick emulators' }}</b><span class="muted small">AppImages go in {{ short(store.config.emuDir) || '~/Applications' }}, where EmuDeck keeps them. Flatpaks install for your user.<template v-if="fresh && !fresh.fresh">{{ ' ' + existingNote }}</template></span></div>
        <button v-if="fresh?.fresh" class="btn" data-focus @click="phase = 'where'; loadDrives(false)"><Icon name="mdiArrowLeft" :size="18" />Location</button>
        <button class="btn primary" data-focus :disabled="!picked.length" @click="install"><Icon name="mdiDownload" :size="18" />Install {{ picked.length || '' }}</button>
      </div>
      <div v-if="fpNote" class="eg-fp small"><Icon name="mdiPackageVariant" :size="18" />{{ fpNote }}</div>
      <div v-if="!list" class="muted small"><Icon name="mdiSync" :size="16" class="spin" /> Looking at what's installed…</div>
      <div v-else v-masonry class="eg-grid" data-columns>
        <section v-for="c in list" :key="c.key" class="eg-con">
          <div class="eg-head"><PIcon v-if="SLUG[c.key]" :p="{ slug: SLUG[c.key], fs_slug: SLUG[c.key] }" :size="30" /><Icon v-else name="mdiGamepadSquareOutline" :size="28" /><b>{{ c.name }}</b></div>
          <button v-for="e in c.emus" :key="c.key + e.id" class="eg-emu" :class="{ have: e.installed }" data-focus @click="togglePick(c, e)">
            <EmuIcon :id="e.id" :size="34" fallback="mdiGamepadVariantOutline" />
            <span class="eg-mid"><b>{{ e.label }}</b><span class="muted small">{{ e.from }}</span></span>
            <span v-if="e.installed" class="status ok"><Icon name="mdiCheck" :size="14" />Installed</span>
            <span v-else class="eg-tick" :class="{ on: picks.has(c.key + '|' + e.id) }"><Icon v-if="picks.has(c.key + '|' + e.id)" name="mdiCheck" :size="18" /></span>
          </button>
        </section>
      </div>
    </template>

    <!-- 3 (installer): one row per emulator with its own bar, in the background order -->
    <template v-else-if="phase === 'install' || phase === 'done'">
      <div class="eg-bar">
        <div class="eg-sum"><b>{{ phase === 'done' ? (failed.length ? `${doneJobs.length - failed.length} of ${doneJobs.length} installed` : 'All installed') : `Installing ${Math.min(doneJobs.length + 1, jobs.length)} of ${jobs.length}` }}</b><span class="muted small">{{ phase === 'done' ? doneNote : 'You can keep using Cartridge: installs carry on in the background.' }}</span></div>
        <button v-if="phase === 'done'" class="btn" data-focus @click="phase = 'pick'; load()"><Icon name="mdiPlus" :size="18" />Install More</button>
      </div>
      <div class="eg-jobs">
        <div v-for="j in jobs" :key="j.key + j.id" class="eg-emu eg-job" data-focus tabindex="0">
          <EmuIcon :id="j.id" :size="34" fallback="mdiGamepadVariantOutline" />
          <span class="eg-mid"><b>{{ j.label }}</b><span class="muted small">{{ jobNote(j) }}</span></span>
          <span v-if="j.s?.state === 'done'" class="status ok"><Icon name="mdiCheck" :size="14" />Installed</span>
          <span v-else-if="j.s?.state === 'error'" class="status warn">Didn’t install</span>
          <span v-else-if="j.s?.state === 'run'" class="status">{{ j.s.pct != null ? j.s.pct + '%' : 'Starting' }}</span>
          <span v-else class="status">Waiting</span>
          <i v-if="j.s?.state === 'run'" class="eg-bar-fill" :class="{ live: j.s.pct == null }" :style="{ width: (j.s.pct ?? 100) + '%' }" />
        </div>
      </div>
    </template>

    <!-- every console's emulators (Settings → Emulators: updates and installs in one list) -->
    <template v-else>
      <div class="eg-bar">
        <div class="eg-sum"><b>{{ haveCount }} of {{ allCount }}</b><span class="muted small">emulators on this device{{ store.config.emuDir ? ' · new ones go in ' + short(store.config.emuDir) : '' }}</span></div>
        <span v-if="running" class="eg-now"><Icon name="mdiArrowDownCircle" :size="16" />{{ runningName }} {{ running.pct != null ? running.pct + '%' : '' }}<template v-if="waiting"> · {{ waiting }} waiting</template></span>
        <!-- 0.9.56 (owner: an Update All box beside the others): the summary on its own line, the actions as one even row -->
        <div class="eg-acts" :class="{ four: updates && !flow }">
          <button class="btn small" data-focus :disabled="!missingFirst.length" @click="getAll"><Icon name="mdiDownloadMultiple" :size="18" />{{ missingFirst.length ? `Download All (${missingFirst.length})` : 'Everything Is Here' }}</button>
          <button v-if="!flow" class="btn small" data-focus @click="phase = 'where'; loadDrives()"><Icon name="mdiFolderMove" :size="18" />Where They Go</button>
          <button v-if="updates" class="btn small" data-focus :disabled="upBusy" @click="loadUps(true)"><Icon name="mdiRefresh" :size="18" :class="{ spin: upBusy }" />{{ upBusy ? 'Checking…' : 'Check for Updates' }}</button>
          <button v-if="updates" class="btn small" :class="{ primary: upCount && !upRun }" data-focus :disabled="!upCount || !!upRun" @click="updateAll"><Icon name="mdiUpdate" :size="18" :class="{ spin: !!upRun && allRun }" />{{ allRun ? `Updating ${allRun.done + 1} of ${allRun.of}` : upCount ? `Update All (${upCount})` : 'All Up to Date' }}</button>
        </div>
      </div>
      <div v-if="fpNote" class="eg-fp small"><Icon name="mdiPackageVariant" :size="18" />{{ fpNote }}</div>
      <div v-if="!list" class="muted small"><Icon name="mdiSync" :size="16" class="spin" /> Looking at what's installed…</div>
      <div v-else v-masonry class="eg-grid" data-columns>
        <section v-for="c in list" :key="c.key" class="eg-con">
          <div class="eg-head"><PIcon v-if="SLUG[c.key]" :p="{ slug: SLUG[c.key], fs_slug: SLUG[c.key] }" :size="30" /><Icon v-else name="mdiGamepadSquareOutline" :size="28" /><b>{{ c.name }}</b></div>
          <button v-for="e in c.emus" :key="c.key + e.id" class="eg-emu" :class="{ have: e.installed, busy: stateOf(c, e)?.state === 'run' }" data-focus @click="get(c, e)">
            <EmuIcon :id="e.id" :size="34" fallback="mdiGamepadVariantOutline" />
            <span class="eg-mid"><b>{{ e.label }}</b><span class="muted small">{{ e.from }}<template v-if="e.installed && upOf(e.id)?.channel && CH[upOf(e.id).channel]"> · {{ CH[upOf(e.id).channel] }}</template></span></span>
            <span v-if="e.installed && upRun && upOf(e.id) && upRun === (upOf(e.id).path || upOf(e.id).fp)" class="status"><Icon name="mdiArrowDownCircle" :size="14" />{{ upPct != null ? upPct + '%' : 'Updating' }}</span>
            <span v-else-if="e.installed && upOf(e.id)?.broken" class="status bad"><Icon name="mdiWrench" :size="14" />Repair</span>
            <span v-else-if="e.installed && upOf(e.id)?.update" class="status warn"><Icon name="mdiUpdate" :size="14" />Update · {{ shortVer(upOf(e.id).update) }}</span>
            <span v-else-if="e.installed" class="status ok"><Icon name="mdiCheck" :size="14" />{{ updates && ups && upOf(e.id) && !upOf(e.id).noSource && !upOf(e.id).error ? 'Up to date' : 'Installed' }}</span>
            <span v-else-if="stateOf(c, e)?.state === 'run'" class="status"><Icon name="mdiArrowDownCircle" :size="14" />{{ stateOf(c, e).pct != null ? stateOf(c, e).pct + '%' : 'Starting' }}</span>
            <span v-else-if="stateOf(c, e)?.state === 'wait'" class="status">Waiting</span>
            <span v-else-if="stateOf(c, e)?.state === 'error'" class="status warn" :title="stateOf(c, e).error">Try again</span>
            <span v-else class="eg-get"><Icon name="mdiDownload" :size="18" /></span>
            <i v-if="stateOf(c, e)?.state === 'run'" class="eg-bar-fill" :class="{ live: stateOf(c, e).pct == null }" :style="{ width: (stateOf(c, e).pct ?? 100) + '%' }" />
            <i v-else-if="e.installed && upRun && upOf(e.id) && upRun === (upOf(e.id).path || upOf(e.id).fp)" class="eg-bar-fill" :class="{ live: upPct == null }" :style="{ width: (upPct ?? 100) + '%' }" />
          </button>
        </section>
        <!-- emulators you have that the list above doesn't offer (forks aside): their updates too -->
        <section v-if="updates && others.length" class="eg-con">
          <div class="eg-head"><Icon name="mdiGamepadVariantOutline" :size="28" /><b>Also on this device</b></div>
          <button v-for="u in others" :key="u.path || u.fp" class="eg-emu have" data-focus @click="manage(u)">
            <EmuIcon :id="u.id" :size="34" fallback="mdiGamepadVariantOutline" />
            <span class="eg-mid"><b>{{ u.label }}</b><span class="muted small">{{ u.version ? 'Version ' + u.version : u.kind === 'flatpak' ? 'Flatpak' : u.kind === 'windows' ? 'Windows build' : '' }}</span></span>
            <span v-if="upRun === (u.path || u.fp)" class="status"><Icon name="mdiArrowDownCircle" :size="14" />{{ upPct != null ? upPct + '%' : 'Updating' }}</span>
            <span v-else-if="u.broken" class="status bad"><Icon name="mdiWrench" :size="14" />Repair</span>
            <span v-else-if="u.update" class="status warn"><Icon name="mdiUpdate" :size="14" />Update · {{ shortVer(u.update) }}</span>
            <span v-else class="status ok"><Icon name="mdiCheck" :size="14" />{{ u.noSource || u.error ? 'Installed' : 'Up to date' }}</span>
            <i v-if="upRun === (u.path || u.fp)" class="eg-bar-fill" :class="{ live: upPct == null }" :style="{ width: (upPct ?? 100) + '%' }" />
          </button>
        </section>
        <!-- From a GitHub link (0.9.24, owner): the last card; any project's AppImage, set up as a fork or for a console -->
        <section v-if="updates" class="eg-con eg-gh" :class="{ open: gh.open }">
          <button v-if="!gh.open" class="eg-emu" data-focus @click="gh.open = true">
            <Icon name="mdiGithub" :size="34" />
            <span class="eg-mid"><b>From a GitHub Link</b><span class="muted small">A fork or another emulator: paste its GitHub link</span></span>
            <Icon name="mdiPlus" :size="22" />
          </button>
          <template v-else>
            <div class="eg-head"><Icon name="mdiGithub" :size="28" /><b>From a GitHub Link</b></div>
            <TextField v-model="gh.link" label="GitHub link" placeholder="github.com/owner/project" icon="mdiLink" />
            <div class="seg"><button data-focus :class="{ on: gh.as === 'fork' }" @click="gh.as = 'fork'">A Fork Of</button><button data-focus :class="{ on: gh.as === 'console' }" @click="gh.as = 'console'">For a Console</button></div>
            <div class="eg-chips">
              <template v-if="gh.as === 'fork'"><button v-for="x in forkTargets" :key="x.id" class="eg-chip" data-focus :class="{ on: gh.of === x.id }" @click="gh.of = x.id">{{ x.label }}</button></template>
              <template v-else><button v-for="c in list || []" :key="c.key" class="eg-chip" data-focus :class="{ on: gh.key === c.key }" @click="gh.key = c.key">{{ c.name }}</button></template>
            </div>
            <p class="muted small" style="margin: 0">{{ gh.as === 'fork' ? 'It starts games the way the emulator it comes from does, and shows as that emulator’s fork when you pick emulators for a console.' : 'It becomes that console’s emulator for new Steam shortcuts. If Cartridge doesn’t know it, games are given to it as a file path.' }} The newest Linux AppImage from its releases goes in {{ short(store.config.emuDir) || '~/Applications' }}; a Linux .zip or .tar is unpacked into its own folder there, and you pick its program if there’s more than one.</p>
            <div v-if="gh.busy" class="eg-ghbar"><i :class="{ live: gh.pct == null }" :style="{ width: (gh.pct ?? 100) + '%' }" /></div>
            <div class="row" style="gap: 10px; justify-content: flex-end">
              <button class="btn" data-focus :disabled="gh.busy" @click="gh.open = false">Cancel</button>
              <button class="btn primary" data-focus :disabled="gh.busy || !gh.link || (gh.as === 'fork' ? !gh.of : !gh.key)" @click="installLink"><Icon name="mdiDownload" />{{ gh.busy ? (gh.pct != null ? gh.pct + '%' : 'Downloading…') : 'Install' }}</button>
            </div>
          </template>
        </section>
      </div>
      <p class="muted small">Each comes from the emulator's own releases: its AppImage from GitHub, or its Flatpak from Flathub. Downloads keep going in the background while you use Cartridge.</p>
    </template>
  </div>
</template>

<script setup>
// Get emulators (0.9.17, owner: a sleek page, every console's emulators, downloads in the background,
// Download all; first where they live, as an ES-DE style Emulation folder on the drive you pick).
// Used by the welcome (flow) and Settings → Emulators → Get Emulators.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { store, call, toast, bytes, confirm, choose, openModal, bgJob, askText } from '../store.js';
import { focusFirst } from '../nav.js';
import Icon from './Icon.vue';
import EmuIcon from './EmuIcon.vue';
import PIcon from './PIcon.vue';
import TextField from './TextField.vue';

const props = defineProps({ flow: Boolean, updates: Boolean });
const emit = defineEmits(['done', 'phase']);
// 0.9.21 (owner: merge Get Emulators and the emulators' updates): in Settings each installed emulator also
// says whether it's up to date, and picking one with an update installs it (same channels as before)
const ups = ref(null), upBusy = ref(false), upRun = ref(''), upPct = ref(null);
const upCount = computed(() => (ups.value || []).filter((u) => u.update).length);
const upOf = (id) => { const l = (ups.value || []).filter((u) => u.id === id); return l.find((u) => u.update) || l[0] || null; };
const others = computed(() => { const known = new Set(all.value.map((x) => x.e.id)); return (ups.value || []).filter((u) => !known.has(u.id)); });
// 0.9.37 (owner: slow to open, not live): what was known shows at once, then every emulator is checked again
let upSeq = 0;
async function loadUps(fresh = false) {
  if (!props.updates) return;
  const n = ++upSeq; upBusy.value = true;
  if (!ups.value) { const c = await call('emuup:list', { cached: true }).catch(() => null); if (n === upSeq && c && !ups.value) ups.value = c; }
  const r = await call('emuup:list', { fresh }).catch((e) => { toast(e.message, 'error'); return null; });
  if (n !== upSeq) return;
  if (r) ups.value = r; else ups.value ||= [];
  upBusy.value = false;
}
async function runUpdate(u, force = false) {
  if (upRun.value) return toast('One update at a time: wait for this one to finish.', 'info', 3000);
  if (!force && !u.update) return toast(u.error ? `Couldn’t check for updates: ${u.error}` : u.noSource ? `${u.label} updates from inside ${u.label}.` : `${u.label} is up to date.`, 'info', 3500);
  const to = (u.update || u.latest)?.version || (u.update || u.latest)?.tag || 'the newest';
  const what = u.broken ? `Repair ${u.label}?` : force ? `Download ${u.label} again?` : `Update ${u.label}?`;
  const why = u.broken ? `This copy can’t start: it needs ${u.broken.slice(0, 2).join(', ')}, which this system doesn’t have. Cartridge puts the ${to} build in its place, at the same path, so your Steam shortcuts keep working.` : `${u.version || 'This copy'} → ${to}. Close ${u.label} first.`;
  if (!(await confirm(what, why, u.broken ? 'Repair' : force ? 'Download Again' : 'Update'))) return;
  upRun.value = u.path || u.fp; upPct.value = null;
  try { await call('emuup:run', { id: u.id, kind: u.kind, fp: u.fp, where: u.where, path: u.path, force: force || !!u.broken }); toast(u.broken ? `${u.label} is repaired` : `${u.label} is up to date`, 'ok', 3000, 'mdiUpdate'); } catch (err) { toast(err.message, 'error', 6000); }
  upRun.value = ''; await loadUps(true);
}
// Update All (0.9.56, owner): every emulator with an update ready, one after another, after one question. A failure
// doesn't stop the rest; what couldn't be updated is said at the end. Repairs (a copy that can't start) stay one by one.
const allRun = ref(null);
async function updateAll() {
  if (upRun.value) return toast('One update at a time: wait for this one to finish.', 'info', 3000);
  const list = (ups.value || []).filter((u) => u.update && !u.broken);
  if (!list.length) return;
  const names = list.map((u) => `${u.label}: ${u.version || 'this copy'} → ${shortVer(u.update)}`).join('\n');
  if (!(await confirm(`Update ${list.length} Emulator${list.length === 1 ? '' : 's'}?`, `${names}\n\nOne after another, each at the same path, so your Steam shortcuts keep working. Close them first.`, 'Update All'))) return;
  const bad = [];
  for (const [i, u] of list.entries()) {
    allRun.value = { done: i, of: list.length };
    upRun.value = u.path || u.fp; upPct.value = null;
    try { await call('emuup:run', { id: u.id, kind: u.kind, fp: u.fp, where: u.where, path: u.path, force: false }); }
    catch (err) { bad.push(`${u.label}: ${err.message}`); }
  }
  allRun.value = null; upRun.value = '';
  const ok = list.length - bad.length;
  toast(bad.length ? `${ok} updated · ${bad.length} couldn’t be: ${bad[0]}` : `${ok} emulator${ok === 1 ? '' : 's'} updated`, bad.length ? 'error' : 'ok', bad.length ? 8000 : 3500, 'mdiUpdate');
  await loadUps(true);
}
// 0.9.23 (owner: delete and download emulators again, stable or pre-release, shadPS4's versions):
// an installed emulator opens one sheet with everything you can do to it
const CH = { stable: 'Stable releases', pre: 'Pre-releases', rolling: 'Rolling build', flathub: '' };
// 0.9.38 (owner's photo): shadPS4's launcher tags are "shadPS4QtLauncher-2026-10-05-<commit>", one long word that the
// pill (never wrapped) made wider than the row, squeezing the name to a letter a line. The pill shows the part that
// tells builds apart: a date, else the version number, else the start of the tag
function shortVer(up) {
  const v = String(up?.version || up?.tag || '');
  const m = /\d{4}-\d{2}-\d{2}/.exec(v) || /\d+(?:\.\d+)+(?:[-.]\d+)?/.exec(v);
  return m ? m[0] : v.slice(0, 16) || 'new';
}
const PATH_IDS = new Set(['pcsx2', 'duckstation', 'dolphin', 'eden', 'citron', 'yuzu', 'azahar', 'citra', 'ryujinx', 'cemu', 'rpcs3', 'shadps4', 'vita3k', 'ppsspp']);
async function manage(u) {
  if (!u) return;
  const ch = u.channels || [];
  const opts = [
    // 0.9.25 (owner): start the emulator itself, for its own settings
    ...(u.kind !== 'windows' && !u.broken ? [{ label: 'Open', sub: `Start ${u.label} on its own, for its own settings`, value: 'open', icon: 'mdiOpenInApp' }] : []),
    ...(u.broken ? [{ label: 'Repair', sub: 'It can’t start on this system', value: 'repair', icon: 'mdiWrench' }] : u.update ? [{ label: 'Update', sub: `${u.version || 'This copy'} → ${u.update.version || u.update.tag || 'newest'}`, value: 'update', icon: 'mdiUpdate' }] : []),
    ...(u.kind === 'flatpak' || u.latest ? [{ label: 'Download Again', sub: u.kind === 'flatpak' ? 'Reinstall from Flathub' : `The newest ${CH[u.channel] ? CH[u.channel].toLowerCase().replace(/s$/, '') : 'build'}`, value: 'again', icon: 'mdiDownload' }] : []),
    ...(ch.length > 1 ? ch.map((c) => ({ heading: c === ch[0] ? 'Updates Follow' : undefined, label: CH[c], sub: c === 'pre' ? 'Nightlies and test builds' : 'Releases the project calls finished', value: 'ch:' + c, icon: c === 'pre' ? 'mdiFlask' : 'mdiCheckDecagram', selected: u.channel === c })) : []),
    // the emulator's own folders: games, installed content, saves, textures (0.9.24)
    ...(PATH_IDS.has(u.id) ? [{ label: 'Folders', sub: 'Where it keeps games, installed content and saves', value: 'folders', icon: 'mdiFolderCogOutline' }] : []),
    // 0.9.33 (owner): a fork plays with the saves of the emulator it comes from, through Linked Folders
    ...(u.forkOf ? [{ label: 'Share Saves With the Original', sub: 'Link its save folder in Linked Folders', value: 'links', icon: 'mdiLinkVariant' }] : []),
    ...(u.id === 'shadps4' ? [{ label: 'Versions', sub: 'Which games use which, and more to add', value: 'versions', icon: 'mdiLayersTriple' }] : []),
    ...(u.page ? [{ label: 'Open Its Download Page', value: 'page', icon: 'mdiOpenInNew' }] : []),
    ...(u.site && u.site !== u.page ? [{ label: 'Open Its Website', value: 'site', icon: 'mdiWeb' }] : []),
    { label: 'Delete', sub: u.kind === 'flatpak' ? 'Uninstall the Flatpak' : 'Your saves and settings stay', value: 'delete', icon: 'mdiDeleteOutline', danger: true },
  ];
  const v = await choose({ title: u.label, message: [u.version ? 'Version ' + u.version : '', CH[u.channel] || (u.kind === 'flatpak' ? 'Flatpak from Flathub' : ''), u.path ? short(u.path) : ''].filter(Boolean).join(' · '), options: opts, sheet: true });
  if (!v) return;
  if (v === 'open') { try { await call('emuget:open', { id: u.id, kind: u.kind, fp: u.fp, path: u.path }); toast(`${u.label} is opening`, 'ok', 2500, 'mdiOpenInApp'); } catch (err) { toast(err.message, 'error', 6000); } return; }
  if (v === 'repair' || v === 'update') return runUpdate(u);
  if (v === 'again') return runUpdate(u, true);
  if (v.startsWith('ch:')) { await call('emuup:setChannel', { id: u.id, channel: v.slice(3) }); toast(`${u.label} follows ${CH[v.slice(3)].toLowerCase()} now`, 'ok', 3000); return loadUps(true); }
  if (v === 'versions') return openModal('shadversions', {});
  if (v === 'links') { store.emuPageWant = 'links'; return; }
  if (v === 'folders') return openModal('emupaths', { id: u.id, name: u.label });
  if (v === 'page') return window.open(u.page);
  if (v === 'site') return window.open(u.site);
  if (v === 'delete') {
    if (!(await confirm(`Delete ${u.label}?`, `${u.kind === 'flatpak' ? 'Its Flatpak is uninstalled.' : 'The program is deleted.'} Saves and settings stay. Steam shortcuts that used it will show up in Shortcut health.`, 'Delete', true))) return;
    try { await call('emuget:remove', { id: u.id, kind: u.kind, fp: u.fp, where: u.where, path: u.path }); toast(`${u.label} was deleted`, 'ok', 3000, 'mdiDeleteOutline'); } catch (err) { toast(err.message, 'error', 6000); }
    await load(); await loadUps();
  }
}
// From a GitHub link (0.9.24)
const gh = ref({ open: false, link: '', as: 'fork', of: '', key: '', busy: false, pct: null });
const forkTargets = computed(() => uniq.value.map((x) => ({ id: x.e.id, label: x.e.label })).filter((x) => x.id !== 'retroarch'));
async function installLink() {
  const g = gh.value;
  g.busy = true; g.pct = null; ghCalling = true;
  const off = window.cart.on('emuget-custom', (m) => { g.pct = m.pct; });
  try {
    let r = await call('emuget:custom', { link: g.link.trim(), as: g.as, of: g.of, key: g.key });
    // 0.9.32: a release that came as an archive, with more than one program in it: you say which is the emulator
    if (r.pick) {
      g.pct = null;
      const f = await choose({ title: `Which one is ${r.name}?`, message: `Unpacked into ${short(r.folder)}. Pick the program that starts the emulator.`, raw: true, options: r.pick.map((p) => ({ label: p.rel.split('/').pop(), sub: `${p.rel.includes('/') ? p.rel.replace(/\/[^/]+$/, '') + ' · ' : ''}${p.appimage ? 'AppImage' : 'Program'} · ${bytes(p.size)}`, value: p.path, icon: p.appimage ? 'mdiPackageVariant' : 'mdiApplicationOutline' })) });
      if (!f) { toast(`${r.name} stays unpacked in ${short(r.folder)}. Install it again to pick its program.`, 'info', 6000); g.busy = false; ghCalling = false; off?.(); return; }
      r = await call('emuget:customPick', { file: f });
    }
    const what = g.as === 'fork' ? `as a fork of ${forkTargets.value.find((x) => x.id === g.of)?.label}: pick it on a console’s page` : `for ${(list.value || []).find((c) => c.key === g.key)?.name}`;
    toast(`${r.name} ${r.tag} is in ${short(r.folder || r.path.replace(/\/[^/]+$/, ''))}, set up ${what}`, 'ok', 7000, 'mdiGithub');
    gh.value = { open: false, link: '', as: 'fork', of: '', key: '', busy: false, pct: null };
    await load(); await loadUps(true);
  } catch (e) { toast(e.message, 'error', 7000); g.busy = false; }
  ghCalling = false;
  off?.();
}
const SLUG = { psx: 'psx', ps2: 'ps2', ps3: 'ps3', ps4: 'ps4', ps5: 'ps5', psp: 'psp', psvita: 'psvita', gc: 'ngc', wiiu: 'wiiu', switch: 'switch', n3ds: '3ds', nds: 'nds', gba: 'gba', n64: 'n64', xbox: 'xbox', dreamcast: 'dc', xbox360: 'xbox360', saturn: 'saturn', arcade: 'arcade' };
const phase = ref(props.flow ? (store.config.emuDir ? 'pick' : 'where') : 'list');
// 0.9.37 (owner: after Location it skipped to the welcome's next step): the welcome shows its own Continue only
// once installing has started, and focus stays in here while a step loads
watch(phase, (v) => emit('phase', v), { immediate: true });
// the installer's steps and what was ticked (0.9.24)
const STEP_NAMES = ['Location', 'Emulators', 'Installing', 'Done'];
const stepAt = computed(() => ({ where: 0, pick: 1, install: 2, done: 3 })[phase.value] ?? 1);
const picks = ref(new Set()), jobKeys = ref([]);
const picked = computed(() => [...picks.value]);
function togglePick(c, e) {
  if (e.installed) return toast(`${e.label} is already on this device.`, 'info', 2500);
  const k = c.key + '|' + e.id, n = new Set(picks.value);
  if (n.has(k)) n.delete(k); else n.add(k);
  picks.value = n;
}
// Flatpak missing (0.9.37): said before installing, and installed first in the background when it can be
const fp = ref({ has: true });
const fpPicked = computed(() => picked.value.some((k) => { const [key, id] = k.split('|'); return all.value.find((y) => y.c.key === key && y.e.id === id)?.e.how === 'flatpak'; }));
const fpNote = computed(() => (fp.value.has || !fpPicked.value ? '' : fp.value.can ? 'Flatpak isn’t on this system. Cartridge installs it first (your password is asked once); the others go in meanwhile.' : `Flatpak isn’t on this system, so the Flatpak ones can’t go in. ${fp.value.why}`));
// PS5 emulators are early (0.9.37): ticked only when the library has PS5 games
const hasPs5 = () => !!store.lib?.platforms.some((p) => [p.slug, p.fs_slug].includes('ps5') && p.rom_count > 0);
function preselect() { picks.value = new Set((list.value || []).filter((c) => !c.emus.some((e) => e.installed) && (c.key !== 'ps5' || hasPs5())).map((c) => c.key + '|' + c.emus[0].id)); }
const jobs = computed(() => jobKeys.value.map((k) => { const [key, id] = k.split('|'); const x = all.value.find((y) => y.c.key === key && y.e.id === id); return { key, id, label: x?.e.label || id, s: q.value.filter((y) => y.key === key && y.id === id).pop() }; }));
const doneJobs = computed(() => jobs.value.filter((j) => /done|error/.test(j.s?.state || '')));
const failed = computed(() => jobs.value.filter((j) => j.s?.state === 'error'));
const linked = computed(() => jobs.value.reduce((n, j) => n + (j.s?.links || 0), 0));
const doneNote = computed(() => [linked.value ? `Saves and textures are linked in ${short(store.config.emulationRoot)}/saves and storage` : '', 'Steam shortcuts use them from now on'].filter(Boolean).join('. ') + '.');
const jobNote = (j) => j.s?.state === 'error' ? j.s.error || 'Try again later' : j.s?.state === 'done' ? [short(j.s.where), j.s.note, j.s.relinked ? `${j.s.relinked} Steam shortcut${j.s.relinked === 1 ? '' : 's'} fixed` : ''].filter(Boolean).join(' · ') : '';
// 0.9.38 (owner: Cartridge hung installing Flatpak): when a Flatpak is wanted and Flatpak isn't on the system,
// the device password is asked here, in Cartridge, and handed to the install once (never saved)
const isFlatpakItem = (it) => (list.value || []).find((c) => c.key === it.key)?.emus.find((e) => e.id === it.id)?.how === 'flatpak';
async function queue(items) {
  let password;
  if (!fp.value.has && fp.value.can && items.some(isFlatpakItem)) {
    password = await askText({ title: 'Your device password, to install Flatpak', placeholder: 'Used once, never saved', password: true });
    if (password == null) items = items.filter((it) => !isFlatpakItem(it));
    if (!items.length) return q.value;
  }
  return call('emuget:queue', { items, password }).catch((err) => { toast(err.message, 'error'); return q.value; });
}
async function install() {
  const items = picked.value.map((k) => { const [key, id] = k.split('|'); return { key, id }; });
  jobKeys.value = picked.value; picks.value = new Set(); phase.value = 'install';
  q.value = await queue(items);
  await nextTick(); focusFirst(document.querySelector('.eg'), '.eg-job');
}
watch(() => doneJobs.value.length, (n) => { if (phase.value === 'install' && jobs.value.length && n === jobs.value.length) phase.value = 'done'; });
const drives = ref(null), list = ref(null), q = ref([]), busy = ref(false);
const el = ref(null);
const short = (p) => String(p || '').replace(store.info?.home || '\0', '~');
const all = computed(() => (list.value || []).flatMap((c) => c.emus.map((e) => ({ c, e }))));
const uniq = computed(() => [...new Map(all.value.map((x) => [x.e.id, x])).values()]);
const allCount = computed(() => uniq.value.length);
const haveCount = computed(() => uniq.value.filter((x) => x.e.installed).length);
const stateOf = (c, e) => q.value.filter((x) => x.key === c.key && x.id === e.id).pop();
// Download all: the first emulator of each console that has none yet
const missingFirst = computed(() => (list.value || []).filter((c) => !c.emus.some((e) => e.installed)).map((c) => c.emus[0]).filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i));
const running = computed(() => q.value.find((x) => x.state === 'run'));
const waiting = computed(() => q.value.filter((x) => x.state === 'wait').length);
const runningName = computed(() => all.value.find((x) => x.c.key === running.value?.key && x.e.id === running.value?.id)?.e.label || '');

// 0.9.24 (owner): the Emulation folder and links are only for a fresh setup. With EmuDeck, RetroDECK or any
// emulator already here, Location is skipped and nothing but the new emulators is added.
const fresh = ref(null);
const existingNote = computed(() => `Your ${fresh.value?.emudeck ? 'EmuDeck' : fresh.value?.retrodeck ? 'RetroDECK' : 'emulator'} setup stays as it is: no folders or links are made.`);
async function loadDrives(auto = true) {
  if (props.flow) fresh.value ||= await call('emuget:fresh').catch(() => ({ fresh: false }));
  if (props.flow && !fresh.value.fresh && !fresh.value.emudeck) { await call('emuget:useExisting').catch(() => {}); store.config = await call('config:get'); phase.value = 'pick'; await load(); await nextTick(); focusIn(); return; }
  // EmuDeck found: use its folders and say so, instead of asking for a drive (0.9.24)
  const ed = auto && (await call('emuget:emudeck').catch(() => null));
  if (ed) { try { await call('emuget:useEmuDeck'); store.config = await call('config:get'); toast(`Using EmuDeck’s setup in ${short(ed.root)}: new emulators go beside its own`, 'ok', 4500, 'mdiCheck'); phase.value = props.flow ? 'pick' : 'list'; await load(); return; } catch {} }
  drives.value = await call('emuget:drives').catch(() => []);
  if (props.flow) { await nextTick(); focusFirst(document.querySelector('.eg'), '.eg-drive:not([disabled])'); }
}
// the installer's main button, else its first choice: never the welcome's buttons around it
function focusIn() { const r = document.querySelector('.eg'); if (r) focusFirst(r, r.querySelector('.eg-bar .btn.primary:not([disabled])') ? '.eg-bar .btn.primary:not([disabled])' : '[data-focus]:not([disabled])'); }
async function load() { call('emuget:flatpak').then((r) => (fp.value = r)).catch(() => {}); list.value = await call('emuget:list').catch(() => []); q.value = await call('emuget:state').catch(() => []); if (phase.value === 'pick' && !picks.value.size) preselect(); }
async function pickDrive(d) {
  if (busy.value) return; // a second A while the folder is made (the button stays focused, not disabled)
  busy.value = d.path;
  try { const r = await call('emuget:prepare', { base: d.path }); store.config = await call('config:get'); toast(`Made ${short(r.root)}`, 'ok', 3000, 'mdiFolderPlus'); phase.value = props.flow ? 'pick' : 'list'; await load(); await nextTick(); focusIn(); }
  catch (e) { toast(e.message, 'error', 5000); }
  busy.value = false;
}
async function get(c, e) {
  // 0.9.38 (owner: shadPS4 and SharpEmu said "already on this device" instead of opening their sheet): the
  // update list is read again when it doesn't have the emulator yet (installed moments ago)
  if (e.installed) {
    let u = props.updates && upOf(e.id);
    if (!u && props.updates) { await loadUps(); u = upOf(e.id); }
    return u ? manage(u) : toast(`${e.label} is already on this device.`, 'info', 2500);
  }
  const s = stateOf(c, e);
  if (s && /wait|run/.test(s.state)) return toast(s.state === 'run' ? 'Downloading now. You can keep going.' : 'It’s in the queue.', 'info', 2500);
  q.value = await queue([{ key: c.key, id: e.id }]);
}
async function getAll() {
  if (!missingFirst.value.length) return;
  const items = (list.value || []).filter((c) => !c.emus.some((e) => e.installed)).map((c) => ({ key: c.key, id: c.emus[0].id }));
  q.value = await queue(items);
  toast(`${items.length} emulator${items.length === 1 ? '' : 's'} downloading in the background`, 'ok', 3000, 'mdiDownloadMultiple');
}
// 0.9.32 (owner: leaving shouldn't cancel): an update or a GitHub install started earlier is still running
// in the background (Downloads lists it); this screen shows it again, and lets go when it ends
let ghCalling = false;
watch(() => bgJob('emu:'), (j) => { if (j) { upRun.value = j.key.slice(4); upPct.value = j.pct ?? null; } else if (upRun.value) { upRun.value = ''; loadUps(true); } }, { immediate: true });
watch(() => bgJob('custom:'), (j) => { if (j) { gh.value.open = true; gh.value.busy = true; gh.value.pct = j.pct ?? null; } else if (gh.value.busy && !ghCalling) { gh.value.busy = false; load(); loadUps(true); } }, { immediate: true });
let off = null, offP = null, offU = null, lastDone = 0;
const told = new Set();
// masonry (0.9.47, owner: a console with one emulator shouldn't take a row as tall as one with three): same
// column widths, each card as tall as what's in it, the next card moves up under it. Order stays left to right
// (grid placement), only each card's row span is measured: 4px rows, span = its height plus the gap.
const vMasonry = {
  mounted(grid) {
    const fit = () => {
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
      for (const c of grid.children) { c.style.gridRowEnd = ''; const h = c.getBoundingClientRect().height; c.style.gridRowEnd = 'span ' + Math.max(1, Math.ceil((h + gap) / 4)); }
    };
    let raf = 0; const soon = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; fit(); }); };
    const ro = new ResizeObserver(soon), watchAll = () => { ro.disconnect(); ro.observe(grid); for (const c of grid.children) ro.observe(c); soon(); };
    const mo = new MutationObserver(watchAll); mo.observe(grid, { childList: true });
    watchAll(); grid._masonry = { ro, mo };
  },
  unmounted(grid) { grid._masonry?.ro.disconnect(); grid._masonry?.mo.disconnect(); },
};
onMounted(async () => {
  off = window.cart.on('emuget-state', (s) => {
    q.value = s;
    const done = s.filter((x) => x.state === 'done' || x.state === 'error').length;
    if (done !== lastDone) {
      // say where it went, and how many Steam shortcuts now point at it (0.9.24)
      if (done > lastDone && !props.flow) for (const x of s.filter((y) => y.state === 'done' && y.where && !told.has(y.key + y.id))) { told.add(x.key + x.id); toast(`Installed to ${String(x.where).replace(store.info?.home || '\0', '~')}${x.relinked ? ` · ${x.relinked} Steam shortcut${x.relinked === 1 ? '' : 's'} now use it` : ''}`, 'ok', 6000, 'mdiCheck'); }
      lastDone = done; load(); loadUps(); // 0.9.38: a fresh install gets its sheet (it had no update entry yet)
    }
  });
  offP = window.cart.on('emuget-progress', (m) => { const x = q.value.find((y) => y.key === m.key && y.id === m.id && y.state === 'run'); if (x && m.pct != null) x.pct = m.pct; });
  offU = window.cart.on('emu-update', (m) => { if (m.path === upRun.value && m.pct != null) upPct.value = m.pct; });
  q.value = (await call('emuget:state').catch(() => null)) || q.value; // installs queued earlier carry on
  loadUps(); // at the same time as the list (0.9.37)
  if (phase.value === 'where') await loadDrives(); else { if (props.flow) fresh.value = await call('emuget:fresh').catch(() => ({ fresh: false })); await load(); }
});
onBeforeUnmount(() => { off?.(); offP?.(); offU?.(); });
defineExpose({ load });
</script>

<style scoped>
.eg { display: flex; flex-direction: column; gap: var(--s-4); text-align: left; }
.small { font-size: var(--t-sm); }
.mono { font-family: ui-monospace, monospace; word-break: break-all; }
.eg-steps { display: flex; gap: var(--s-2); flex-wrap: wrap; justify-content: center; }
.eg-step { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px 6px 6px; border-radius: 999px; background: var(--s1); color: var(--muted); font-size: var(--t-sm); }
.eg-step i { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-weight: 700; font-size: var(--t-xs); background: var(--s2); }
.eg-step.on { color: var(--text); background: var(--s2); }
.eg-step.on i { background: var(--focus); color: var(--on-focus); }
.eg-step.past i { background: rgba(87, 211, 100, 0.25); color: #8fe39a; }
.eg-tick { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; border: 2px solid rgba(255, 255, 255, 0.28); flex: none; }
.eg-tick.on { background: currentColor; border-color: currentColor; }
.eg-tick.on :deep(svg) { color: #0b0d12; }
.eg-emu:focus .eg-tick { border-color: rgba(0, 0, 0, 0.35); }
.eg-emu:focus .eg-tick.on :deep(svg) { color: var(--focus); }
.eg-jobs { display: flex; flex-direction: column; gap: 6px; }
.eg-gh.open { grid-column: 1 / -1; gap: var(--s-3); }
.eg-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.eg-chip { padding: 8px 14px; border-radius: 999px; border: 0; background: var(--s2); color: inherit; font: inherit; font-size: var(--t-sm); }
.eg-chip.on { background: var(--sel); color: var(--on-sel); }
.eg-chip:focus { background: var(--focus); color: var(--on-focus); outline: none; }
.eg-ghbar { height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.12); overflow: hidden; }
.eg-ghbar i { display: block; height: 100%; background: currentColor; transition: width var(--progress); }
.eg-ghbar i.live { animation: egLive var(--loop-pulse) infinite; transform-origin: left; }
.eg-intro { display: flex; flex-direction: column; gap: 6px; text-align: center; }
.eg-intro b { font-size: var(--t-lg); }
.eg-drives { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--s-3); }
.eg-drive { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: var(--s-4); border-radius: var(--r-lg); background: var(--s2); color: inherit; border: 0; text-align: left; transition: transform var(--d-1, 0.12s), background var(--d-1, 0.12s); }
.eg-drive b { font-size: var(--t-md); }
.eg-fp { display: flex; gap: var(--s-2); align-items: flex-start; padding: 10px 12px; border-radius: var(--r-md); background: var(--s2); color: var(--muted); }
.eg-drive.busy { cursor: progress; animation: eg-wait var(--loop-pulse) infinite alternate; }
@keyframes eg-wait { to { opacity: 0.72; } }
.eg-drive:focus { background: var(--focus); color: var(--on-focus); outline: none; transform: translateY(-2px); }
.eg-drive:focus .muted { color: var(--on-focus-dim); }
.eg-space { width: 100%; height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.12); overflow: hidden; }
.eg-space i { display: block; height: 100%; background: currentColor; opacity: 0.7; }
.eg-bar { display: flex; align-items: center; gap: var(--s-3); flex-wrap: wrap; }
.eg-acts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-2); flex: 1 1 100%; }
.eg-acts.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.eg-acts > .btn { justify-content: center; min-width: 0; white-space: normal; text-align: center; }
@media (max-width: 1100px) { .eg-acts.four { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.eg-sum { display: flex; flex-direction: column; flex: 1; min-width: 200px; }
.eg-sum b { font-size: var(--t-xl); font-family: var(--display); }
.eg-now { display: inline-flex; align-items: center; gap: 6px; font-size: var(--t-sm); color: var(--muted); }
.eg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--s-3); }
.eg-grid[class] { grid-auto-rows: 4px; row-gap: 0; align-items: start; }
.eg-con { display: flex; flex-direction: column; gap: 6px; padding: var(--s-3); border-radius: var(--r-lg); background: var(--s1); }
.eg-head { display: flex; align-items: center; gap: 10px; padding: 2px 4px 6px; }
.eg-head b { font-family: var(--display); font-size: var(--t-md);  overflow-wrap: anywhere; }
.eg-emu { position: relative; overflow: hidden; display: flex; align-items: center; gap: var(--s-3); padding: 10px 12px; border-radius: var(--r-md); background: var(--s2); color: inherit; border: 0; text-align: left; font: inherit; flex: none; }
.eg-emu:focus { background: var(--focus); color: var(--on-focus); outline: none; }
.eg-emu:focus .muted { color: var(--on-focus-dim); }
.eg-emu > .status { flex: none; max-width: 55%; overflow: hidden; } /* 0.9.38: a long pill never takes the name's room */
.eg-mid { flex: 1; min-width: 8em; display: flex; flex-direction: column; gap: 2px; }
.eg-mid b {  overflow-wrap: anywhere; }
.eg-mid .small {  overflow-wrap: anywhere; }
.eg-get { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: rgba(255, 255, 255, 0.08); flex: none; }
.eg-emu:focus .eg-get { background: rgba(0, 0, 0, 0.1); }
.eg-bar-fill { position: absolute; left: 0; bottom: 0; height: 3px; background: currentColor; transition: width var(--progress); }
.eg-bar-fill.live { animation: egLive var(--loop-pulse) infinite; transform-origin: left; }
@keyframes egLive { 0% { transform: scaleX(0.05); opacity: 0.4; } 50% { transform: scaleX(0.6); opacity: 0.9; } 100% { transform: scaleX(1); opacity: 0.2; } }
</style>
