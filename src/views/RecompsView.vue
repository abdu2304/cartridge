<template>
  <div class="view" data-scroll ref="el">
    <!-- PC Ports (0.9.85, owner: "laid out like other consoles"): the ports you have, as game cards with your library's
         covers; each opens its game's own page, where Play starts the port. Getting, updating and setting them up live
         in Settings → Emulators → PC Ports. -->
    <header class="lib-head">
      <div>
        <div class="eyebrow">Steam</div>
        <h1 class="big">PC Ports</h1>
        <div v-if="data" class="stats">
          <div><b>{{ mine.length }}</b><span>{{ mine.length === 1 ? 'Port' : 'Ports' }}</span></div><i />
          <div><b class="ondev">{{ ready }}</b><span>Ready to play</span></div>
        </div>
      </div>
      <div class="row">
        <button class="btn" data-focus @click="toSettings"><Icon name="mdiCogOutline" />Get and Manage</button>
      </div>
    </header>
    <div v-if="!data" class="center"><div class="spinner" />Reading your ports…</div>
    <div v-else-if="!mine.length" class="pp-empty">
      <p>No PC ports installed yet. A PC port is a console game rebuilt to run natively on PC, using your own copy of the game.</p>
      <button class="btn primary" data-focus data-autofocus @click="toSettings"><Icon name="mdiDownload" />Get PC Ports</button>
    </div>
    <div v-else class="game-grid">
      <template v-for="e in mine" :key="e.id">
        <GameCard v-if="romOf(e)" :rom="romOf(e)" :show-platform="true" :port="true" :extra="stateOf(e)" @open="open(e)" @focused="focus(e)" />
        <!-- a port from a link that matches no game in your library: its project's own picture -->
        <button v-else class="card" data-focus :data-key="'port-' + e.id" @click="open(e)">
          <div class="art"><img v-if="pics[e.id]" :src="pics[e.id]" alt="" /><div v-else class="ph"><span class="ph-t">{{ e.name }}</span></div></div>
          <div class="title">{{ e.name }}</div>
          <div class="sub extra">{{ stateOf(e) }}</div>
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { store, call, go, romById, img, setBg, backdropOf, bgJob, openModal, playtimeText } from '../store.js';
import { useView } from '../useView.js';
import { ensureFocus } from '../nav.js';
import Icon from '../components/Icon.vue';
import GameCard from '../components/GameCard.vue';

const el = ref(null), data = ref(null), pics = ref({});
async function load() {
  data.value = await call('recomps:list').catch(() => ({ entries: [] }));
  for (const e of mine.value) if (!romOf(e) && !(e.id in pics.value)) { pics.value[e.id] = ''; call('recomps:details', { id: e.id }).then((d) => { if (d?.picture) pics.value[e.id] = img(d.picture, 360); }).catch(() => {}); }
  await nextTick(); ensureFocus(el.value);
}
// installed only (owner's pick): newest played first, then A to Z
const last = (e) => store.play[romOf(e)?.id]?.last || 0;
const mine = computed(() => (data.value?.entries || []).filter((e) => e.installed).sort((a, b) => last(b) - last(a) || a.name.localeCompare(b.name)));
const ready = computed(() => mine.value.filter((e) => (e.from === 'verified' ? e.state === 'play' || e.state === 'update' : e.installed?.ready)).length);
const romOf = (e) => (e.roms?.length ? romById(e.roms[0]) : null);
function stateOf(e) {
  const job = bgJob('recomp:' + e.id) || bgJob('recompprep:' + e.id);
  if (job) return job.pct != null ? `${job.pct}%` : job.text || 'Working';
  const r = romOf(e), mins = r ? store.play[r.id]?.min || 0 : 0;
  if (e.from === 'verified') return { play: mins ? playtimeText(mins) + ' played' : 'Ready', update: 'Update Out', setup: 'Needs Setting Up', game: 'Needs Your Copy', broken: 'Needs Repair' }[e.state] || 'Installed';
  // 0.9.88 (owner): a copy installed from a link says so, or it reads as a second copy of the verified one
  if (!e.installed?.here) return 'From a Link · Missing';
  return 'From a Link · ' + (e.installed.ready ? (mins ? playtimeText(mins) + ' played' : 'Ready') : 'Needs Setting Up');
}
function focus(e) { const r = romOf(e); if (r) setBg(backdropOf(r)); }
// its game's page, with the port as the way to play; no game to show: the port's own sheet
async function open(e) {
  const r = romOf(e);
  if (r) return go('game', { romId: r.id, port: e.id });
  await openModal(e.from === 'verified' ? 'verified' : 'recomp', { id: e.id });
  load();
}
function toSettings() {
  store.settingsSection = 'emu';
  store.settingsSpot = { sec: 'emu', page: 'recomps', text: '' };
  go('settings');
}
useView({ x: () => toSettings() }, [{ b: 'A', label: 'Open' }, { b: 'X', label: 'Get and Manage' }, { b: 'B', label: 'Back' }]);
onMounted(load);
</script>

<style scoped>
.lib-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin: 18px 0 26px; }
.big { font-size: var(--t-2xl); font-weight: 700; letter-spacing: -0.02em; margin: 4px 0 14px; }
.stats { display: flex; align-items: stretch; gap: 22px; }
.stats > div { display: flex; flex-direction: column; gap: 4px; }
.stats b { font-family: var(--display); font-size: var(--t-xl); font-weight: 700; line-height: 1; letter-spacing: -0.01em; }
.stats .ondev { color: var(--ondev, #b9f6ca); }
.stats span { font-size: var(--t-xs); color: var(--faint, rgba(255, 255, 255, 0.5)); font-weight: 600; }
.stats i { width: 1px; background: var(--line-2, rgba(255, 255, 255, 0.14)); }
.pp-empty { display: flex; flex-direction: column; align-items: flex-start; gap: var(--s-3); max-width: 60ch; }
.pp-empty p { margin: 0; color: var(--muted); }
</style>
