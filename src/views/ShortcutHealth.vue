<template>
  <div class="view" data-scroll ref="el">
    <header class="page-head">
      <div style="min-width: 0">
        <div class="eyebrow">Settings · Emulators</div>
        <h1>{{ !h ? 'Shortcut health' : h.problems.length ? `${h.problems.length} shortcut${h.problems.length === 1 ? '' : 's'} would fail` : 'Every shortcut looks fine' }}</h1>
        <div class="lead">{{ !h ? 'Checking your Steam shortcuts…' : !h.steam ? 'Steam was not found on this device.' : `Checked ${h.checked} Steam shortcuts: emulators that moved, games that are gone, missing RetroArch cores, and ones made with an older setup.` }}</div>
      </div>
      <div class="row" style="flex: none">
        <button class="btn" data-focus :disabled="busy" @click="load"><Icon name="mdiRefresh" :class="{ spin: busy && !h }" />Check again</button>
        <button v-if="fixable.length" class="btn primary" data-focus :disabled="busy" @click="fix(fixable.map((p) => p.appid))"><Icon name="mdiAutoFix" />Fix {{ fixable.length }}</button>
      </div>
    </header>
    <div v-if="!h" class="center"><div class="spinner" /></div>
    <div v-else-if="!h.problems.length && h.steam" class="empty-ok glass"><Icon name="mdiCheckCircle" :size="32" /><div><b>Nothing to fix</b><div class="muted">Every game shortcut points at an emulator and a game that are there.</div></div></div>
    <div v-else class="stack">
      <template v-for="p in h.problems" :key="p.appid">
        <button class="lrow" data-focus :data-key="'h-' + p.appid" @click="act(p)">
          <Icon :name="icon(p)" :size="24" :style="{ color: canFix(p) ? '#ffd978' : '#ffa39c' }" />
          <div class="l-mid">
            <b>{{ p.name }}</b>
            <span class="l-sub">{{ p.issues.map((i) => i.text).join(' ') }}</span>
          </div>
          <span class="l-end"><span v-if="!p.ours" class="status none">Not added by Cartridge</span><Btn b="A" />{{ label(p) }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, nextTick } from 'vue';
import { call, toast, confirm } from '../store.js';
import { applyChanges, steam } from '../steam.js';
import { useView } from '../useView.js';
import { ensureFocus } from '../nav.js';
import Icon from '../components/Icon.vue';
import Btn from '../components/Btn.vue';

// Settings → Steam → Shortcut health: shortcuts that would fail when started, with one press to fix
// what can be fixed (an emulator that moved is pointed at where it is now; Cartridge's own shortcuts
// for games that are gone are removed; old setups are updated).
const el = ref(null);
const h = ref(null);
const busy = ref(false);
const canFix = (p) => p.issues.some((i) => i.fix);
const fixable = computed(() => (h.value?.problems || []).filter(canFix));
const icon = (p) => ({ emulator: 'mdiLinkVariantOff', game: 'mdiFileHidden', duplicate: 'mdiContentDuplicate', core: 'mdiPuzzleRemoveOutline', flatpak: 'mdiPackageVariantRemove', outdated: 'mdiUpdate' })[p.issues[0]?.kind] || 'mdiAlertCircleOutline';
const label = (p) => p.issues.find((i) => i.fix)?.fix.label || 'How to fix';
async function load() {
  busy.value = true; h.value = null;
  try { h.value = await call('steam:health'); } catch (e) { toast(e.message, 'error'); h.value = { steam: false, problems: [], checked: 0 }; }
  busy.value = false;
  await nextTick(); ensureFocus(el.value);
}
async function fix(appids) {
  busy.value = true;
  try {
    const r = await call('steam:healthFix', { appids });
    if (r.fixed) toast(`${r.fixed} shortcut${r.fixed === 1 ? '' : 's'} fixed in Steam`, 'ok', 3500, 'mdiAutoFix');
    if (r.left?.length) toast(`Couldn't fix ${r.left.length} while Steam can't be reached: ${r.left.slice(0, 3).join(', ')}`, 'info', 6000);
    if (r.queued && !steam.busy) await applyChanges();
  } catch (e) { toast(e.message, 'error'); }
  busy.value = false;
  load();
}
async function act(p) {
  const fixes = p.issues.filter((i) => i.fix);
  // more than one fix for this shortcut (say the emulator moved and the game is gone): say what happens first
  if (fixes.length > 1 && !(await confirm(p.name, fixes.map((i) => `${i.text}\n→ ${i.fix.label}`).join('\n\n'), 'Do both'))) return;
  if (fixes.length) return fix([p.appid]);
  const i = p.issues[0];
  const tip = i.kind === 'emulator' ? 'Cartridge couldn’t find that emulator anywhere. Run Setup to find it, or pick another one for this console.' : i.kind === 'core' ? 'Open RetroArch, then Main Menu → Online Updater → Core Downloader, and install it.' : i.kind === 'flatpak' ? 'Install it again from your software centre, or pick another emulator in Setup.' : 'Open the shortcut in Steam (Properties) to fix it by hand.';
  await confirm(p.name, `${p.issues.map((x) => x.text).join('\n')}\n\n${tip}`, 'OK');
}
useView({ x: () => fixable.value.length && fix(fixable.value.map((p) => p.appid)) }, [{ b: 'A', label: 'Fix' }, { b: 'X', label: 'Fix all' }, { b: 'B', label: 'Back' }]);
onMounted(load);
</script>

<style scoped>
.empty-ok { display: flex; align-items: center; gap: var(--s-4); padding: var(--s-5); color: var(--green-l); }
.empty-ok b { color: var(--text); font-size: var(--t-lg); }
</style>
