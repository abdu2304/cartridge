<template>
  <div class="view" data-scroll ref="el">
    <div v-if="!ov" class="center"><div class="spinner" /></div>
    <template v-else>
      <header class="sm-head">
        <div>
          <div class="eyebrow">Steam</div>
          <h1 class="big">{{ list.length ? `${list.length} game${list.length === 1 ? '' : 's'} not in Steam` : 'Every game is in Steam' }}</h1>
          <div class="muted" style="font-size: 13.5px">Downloaded games that have no Steam shortcut yet. Add them one by one with A, or all at once.</div>
        </div>
        <button class="btn primary" data-focus :disabled="!ready.length || steam.busy" @click="addAll"><Icon name="mdiPlaylistPlus" />{{ ready.length ? `Add all ${ready.length}` : 'Nothing to add' }}</button>
      </header>
      <section v-for="g in groups" :key="g.key" class="sm-sec">
        <div class="sm-con"><PIcon :p="g.p" :size="28" /><b>{{ g.name }}</b><span class="count">{{ g.items.length }}</span><span v-if="!g.canAdd" class="chip none">No emulator found</span></div>
        <div class="sg-list">
          <button v-for="x in g.items" :key="x.romId" class="sc-row" data-focus :data-key="'sm-' + x.romId" @click="act(x, g)">
            <div class="sc-thumb"><img v-if="coverOf(x)" :src="coverOf(x)" loading="lazy" /></div>
            <div class="sc-mid"><b>{{ x.name }}</b><span class="muted">{{ why(x, g) }}</span></div>
            <span class="sc-act"><Btn b="A" />{{ x.queued === 'add' ? 'Apply' : !g.canAdd ? 'Set up' : !x.file ? 'Open game' : x.blocked ? 'Why' : 'Add' }}</span>
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch, nextTick } from 'vue';
import { call, toast, go, romById, cover } from '../store.js';
import { steam, applyChanges, addGame, addGames } from '../steam.js';
import { useView } from '../useView.js';
import { ensureFocus } from '../nav.js';
import Icon from '../components/Icon.vue';
import Btn from '../components/Btn.vue';
import PIcon from '../components/PIcon.vue';

// Settings → Steam → "N missing": every downloaded game with no Steam shortcut, by console
const el = ref(null);
const ov = ref(null);
const list = computed(() => (ov.value?.games || []).filter((g) => !g.inSteam));
const groups = computed(() => {
  const by = new Map();
  for (const g of list.value) {
    if (!by.has(g.console)) {
      const c = ov.value.consoles.find((x) => x.key === g.console);
      const r = romById(g.romId);
      by.set(g.console, { key: g.console, name: c?.platform || g.platform, canAdd: !!c?.template, p: r ? { slug: r.platform_slug, fs_slug: r.platform_fs_slug } : { slug: g.console }, items: [] });
    }
    by.get(g.console).items.push(g);
  }
  for (const g of by.values()) g.items.sort((a, b) => a.name.localeCompare(b.name));
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
});
const ready = computed(() => groups.value.filter((g) => g.canAdd).flatMap((g) => g.items.filter((x) => x.file && !x.blocked && x.queued !== 'add')));
const coverOf = (g) => { const r = romById(g.romId); return r ? cover(r) : ''; };
function why(x, g) {
  if (x.queued === 'add') return 'Waiting to be added';
  if (!g.canAdd) return 'No emulator found for this console. Open it in Settings → Steam to set one.';
  if (!x.file) return 'Needs its game folder set on the game page';
  if (x.blocked) return x.blocked;
  return 'Not in Steam';
}
async function load() {
  try { ov.value = await call('steam:overview'); steam.queue = ov.value.queue; } catch (e) { toast(e.message, 'error'); ov.value = { games: [], consoles: [] }; }
}
watch(() => steam.queue.total, () => { if (!steam.busy) load(); });
watch(() => steam.busy, (b) => { if (!b) load(); });
async function act(x, g) {
  if (x.queued === 'add') { if (await applyChanges()) load(); return; }
  if (!g.canAdd) return go('steam-console', { ckey: g.key });
  if (!x.file) return go('game', { romId: x.romId });
  if (x.blocked) return toast(x.blocked);
  const rom = romById(x.romId);
  if (rom) await addGame(rom);
  load();
}
async function addAll() {
  const roms = ready.value.map((x) => romById(x.romId)).filter(Boolean);
  if (roms.length && (await addGames(roms))) load();
}
useView({ x: () => { if (ready.value.length) addAll(); } }, [{ b: 'A', label: 'Add' }, { b: 'X', label: 'Add all' }, { b: 'B', label: 'Back' }]);
onMounted(async () => { await load(); await nextTick(); ensureFocus(el.value); });
</script>

<style scoped>
.sm-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin: 18px 0 22px; }
.big { font-size: 34px; font-weight: 700; margin: 6px 0 8px; }
.sm-sec { margin-bottom: 26px; }
.sm-con { display: flex; align-items: center; gap: 12px; margin: 0 0 14px; font-family: var(--display); font-size: 18px; }
.sm-con .count { color: var(--muted); font-size: 13px; }
.sg-list { display: flex; flex-direction: column; gap: 8px; }
.sc-row { display: flex; align-items: center; gap: 16px; padding: 8px 16px; border-radius: 10px; background: rgba(16, 19, 28, 0.6); border: 1px solid var(--line); text-align: left; min-width: 0; }
.sc-row:focus { border-color: var(--primary-l); }
.sc-thumb { width: 40px; height: 54px; border-radius: 6px; overflow: hidden; background: #1a1e2a; flex: none; }
.sc-thumb img { width: 100%; height: 100%; object-fit: cover; }
.sc-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.sc-mid b { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sc-mid span { font-size: 12px; }
.sc-act { display: flex; align-items: center; gap: 8px; width: 120px; justify-content: flex-end; color: var(--muted); font-size: 12.5px; flex: none; }
.chip.none { background: rgba(245, 197, 66, 0.18); color: #ffd978; font-size: 11.5px; }
</style>
