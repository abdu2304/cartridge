<template>
  <div class="sm">
    <div class="subh"><Icon name="mdiHarddisk" :size="20" />Storage Manager</div>
    <div v-if="!ov" class="muted small"><Icon name="mdiSync" :size="16" class="spin" /> Measuring games…</div>
    <template v-else>
      <div v-if="ov.drives.length > 1" class="seg sm-drives">
        <button v-for="d in ov.drives" :key="d.mount" data-focus :class="{ on: drive === d.mount }" @click="pick(d.mount)">{{ d.label }}</button>
      </div>
      <div v-if="cur" class="sm-card glass">
        <div class="sm-top"><b>{{ cur.label }}</b><span class="muted small mono">{{ cur.mount }}</span><div class="spacer" /><span>{{ bytes(cur.free) }} free of {{ bytes(cur.total) }}</span></div>
        <div class="sm-bar">
          <i class="g" :style="{ width: pct(cur.games) + '%' }" />
          <i class="o" :style="{ width: pct(other) + '%' }" />
        </div>
        <div v-if="cur.consoles?.length" class="sm-cons"><Icon name="mdiFolderDownloadOutline" :size="15" />Downloads here: {{ cur.consoles.slice().sort().join(', ') }}</div>
        <div class="sm-legend">
          <span><i class="dot-g" />Games from Cartridge · {{ bytes(cur.games) }}</span>
          <span><i class="dot-o" />Everything else · {{ bytes(other) }}</span>
          <span><i class="dot-f" />Free · {{ bytes(cur.free) }}</span>
        </div>
      </div>

      <div class="row wrap sm-tools">
        <div class="seg"><button v-for="s in sorts" :key="s.v" data-focus :class="{ on: sort === s.v }" @click="sort = s.v">{{ s.l }}</button></div>
        <div class="spacer" />
        <button class="btn small" data-focus :disabled="!list.length" @click="suggest"><Icon name="mdiBroom" :size="18" />Free up space</button>
        <button v-if="picked.size" class="btn small" data-focus @click="picked = new Set()"><Icon name="mdiClose" :size="18" />Clear selection</button>
        <button class="btn small danger" data-focus :disabled="!picked.size || busy" @click="remove"><Icon name="mdiDeleteOutline" :size="18" />{{ picked.size ? `Delete ${picked.size} · ${bytes(pickedSize)}` : 'Delete' }}</button>
      </div>

      <div v-if="!list.length" class="muted small">No games from Cartridge on this drive.</div>
      <div class="sm-list">
        <button v-for="g in list" :key="g.romId" class="sm-row" :class="{ on: picked.has(g.romId) }" data-focus :data-key="'st-' + g.romId" @click="toggle(g)">
          <Icon :name="picked.has(g.romId) ? 'mdiCheckboxMarked' : 'mdiCheckboxBlankOutline'" :size="22" class="sm-ck" />
          <div class="sm-thumb"><img v-if="g.cover" :src="img(g.cover)" loading="lazy" /></div>
          <div class="sm-mid"><b>{{ g.name }}</b><span class="muted">{{ g.platform }}<template v-if="g.at"> · added {{ ago(g.at) }}</template> · {{ lastOf(g) ? 'played ' + ago(lastOf(g)) : 'not played yet' }}</span></div>
          <span class="sm-size">{{ bytes(g.size) }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { call, img, bytes, ago, confirm, toast, store, loadPlay, romById } from '../store.js';
import Icon from './Icon.vue';

// Settings → Storage: one drive at a time, like Steam's storage manager. A picks games, Delete removes
// them from this device (they stay on the RomM server).
const ov = ref(null);
const drive = ref('');
const sort = ref('size');
const sorts = [{ v: 'size', l: 'Size' }, { v: 'name', l: 'Name' }, { v: 'added', l: 'Recently added' }];
const picked = ref(new Set());
const busy = ref(false);
const cur = computed(() => ov.value?.drives.find((d) => d.mount === drive.value) || ov.value?.drives[0] || null);
const other = computed(() => (cur.value ? Math.max(0, cur.value.total - cur.value.free - cur.value.games) : 0));
const pct = (n) => (cur.value?.total ? Math.min(100, (n / cur.value.total) * 100) : 0);
const list = computed(() => {
  const g = (ov.value?.games || []).filter((x) => x.drive === cur.value?.mount);
  if (sort.value === 'name') return [...g].sort((a, b) => a.name.localeCompare(b.name));
  if (sort.value === 'added') return [...g].sort((a, b) => b.at - a.at);
  return [...g].sort((a, b) => b.size - a.size);
});
const pickedSize = computed(() => (ov.value?.games || []).filter((g) => picked.value.has(g.romId)).reduce((s, g) => s + g.size, 0));
function pick(m) { drive.value = m; picked.value = new Set(); }
function toggle(g) { const s = new Set(picked.value); s.has(g.romId) ? s.delete(g.romId) : s.add(g.romId); picked.value = s; }
// Free up space: picks games on this drive not played for two months (or never, and downloaded over
// a month ago), biggest first. Nothing is deleted until you press Delete.
const lastOf = (g) => Math.max(store.play[g.romId]?.last || 0, romById(g.romId)?.user?.played || 0);
function suggest() {
  const now = Date.now(), MONTH = 30 * 864e5;
  const pick = list.value.filter((g) => { const l = lastOf(g); return l ? now - l > 2 * MONTH : g.at && now - g.at > MONTH; }).sort((a, b) => b.size - a.size);
  if (!pick.length) { toast("Everything here was played recently. Nothing to suggest.", 'info', 3500, 'mdiBroom'); return; }
  picked.value = new Set(pick.map((g) => g.romId));
  sort.value = 'size';
  toast(`Picked ${pick.length} game${pick.length === 1 ? '' : 's'} you haven't played in a while · ${bytes(pick.reduce((s, g) => s + g.size, 0))}. Check the list, then press Delete.`, 'info', 6000, 'mdiBroom');
}
async function load() {
  loadPlay();
  try { ov.value = await call('storage:overview'); if (!ov.value.drives.some((d) => d.mount === drive.value)) drive.value = ov.value.drives[0]?.mount || ''; }
  catch (e) { toast(e.message, 'error'); ov.value = { drives: [], games: [] }; }
}
async function remove() {
  const games = ov.value.games.filter((g) => picked.value.has(g.romId));
  const names = games.slice(0, 6).map((g) => `${g.name}  ·  ${bytes(g.size)}`).join('\n') + (games.length > 6 ? `\n…and ${games.length - 6} more` : '');
  if (!(await confirm(`Delete ${games.length} game${games.length === 1 ? '' : 's'}?`, `Frees ${bytes(pickedSize.value)} on this device:\n${names}\n\nThey stay on your RomM server.`, 'Delete', true))) return;
  busy.value = true;
  let n = 0;
  for (const g of games) { try { await call('roms:delete', { romId: g.romId, path: g.path }); n++; } catch (e) { toast(`${g.name}: ${e.message}`, 'error', 4000); } }
  busy.value = false;
  picked.value = new Set();
  toast(`Deleted ${n} game${n === 1 ? '' : 's'} from this device`, 'ok', 2600, 'mdiDeleteOutline');
  load();
}
onMounted(load);
</script>

<style scoped>
.sm { display: flex; flex-direction: column; gap: 14px; }
.subh { display: flex; align-items: center; gap: 10px; font-family: var(--display); font-size: var(--t-lg); font-weight: 700; margin-top: 4px; }
.small { font-size: var(--t-xs); }
.wrap { flex-wrap: wrap; }
.spacer { flex: 1; }
.sm-drives { align-self: flex-start; }
.sm-card { padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; }
.sm-top { display: flex; align-items: baseline; gap: 12px; font-size: var(--t-sm); min-width: 0; }
.sm-top b { font-size: var(--t-md); }
.sm-bar { display: flex; height: 14px; border-radius: var(--r-sm); overflow: hidden; background: rgba(255, 255, 255, 0.08); }
.sm-bar i { display: block; height: 100%; }
.sm-bar .g, .dot-g { background: var(--bar, var(--grad)); }
.sm-bar .o, .dot-o { background: rgba(255, 255, 255, 0.28); }
.dot-f { background: rgba(255, 255, 255, 0.08); box-shadow: inset 0 0 0 1px var(--line-2); }
.sm-cons { display: flex; align-items: center; gap: 7px; font-size: var(--t-xs); color: var(--muted); }
.sm-legend { display: flex; gap: 18px; flex-wrap: wrap; font-size: var(--t-xs); color: var(--muted); }
.sm-legend span { display: inline-flex; align-items: center; gap: 7px; }
.sm-legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.sm-list { display: flex; flex-direction: column; gap: 6px; }
.sm-row { display: flex; align-items: center; gap: 14px; padding: 8px 14px; border-radius: var(--r-md); background: var(--s2); border: 1px solid transparent; text-align: left; min-width: 0; }
.sm-row:focus { background: var(--focus); color: var(--on-focus); box-shadow: none; }
.sm-row:focus .muted { color: var(--on-focus-dim); }
.sm-row.on:not(:focus) { background: var(--sel-bg); box-shadow: var(--sel-ring); color: var(--on-sel); }
.sm-row.on:not(:focus) :is(.muted, small) { color: var(--on-sel-dim); }
.sm-ck { color: var(--muted); }
.sm-row.on .sm-ck { color: var(--text); }
.sm-row.on:focus .sm-ck { color: var(--on-focus); }
.sm-thumb { width: 34px; height: 46px; border-radius: 5px; overflow: hidden; background: #1a1e2a; flex: none; }
.sm-thumb img { width: 100%; height: 100%; object-fit: cover; }
.sm-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.sm-mid b { font-weight: 500;  overflow-wrap: anywhere; }
.sm-mid span { font-size: var(--t-xs);  overflow-wrap: anywhere; }
.sm-size { font-family: var(--display); font-weight: 600; font-size: var(--t-sm); flex: none; }
</style>
