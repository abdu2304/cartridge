<template>
  <div class="view ra-g" data-scroll ref="el">
    <div v-if="!g && !error" class="center" style="height: 60vh"><div class="spinner" /></div>
    <div v-else-if="error" class="empty">{{ error }}</div>
    <template v-else>
      <header class="rg-head">
        <GameIcon class="rg-icon" :title="g.title" :rom-id="g.romId || undefined" :fallback="img(g.icon)" :size="120" :grade="null" />
        <div class="rg-info">
          <div class="eyebrow">{{ g.console }}<template v-if="g.offline"> · offline</template></div>
          <h1 class="rg-title">{{ g.title }}</h1>
          <div class="bar rg-bar"><i :style="{ width: pct + '%' }" /></div>
          <div class="rg-prog">
            <span><b>{{ g.earned }}</b> of {{ g.total }} achievements · {{ pct }}%</span>
            <span v-if="g.earnedHc">{{ g.earnedHc }} in hardcore</span>
            <span v-if="award" class="chip gold"><Icon name="mdiCrown" :size="14" />{{ award }}</span>
          </div>
          <div class="row" style="gap: 10px; margin-top: 6px">
            <button v-if="g.romId" class="btn primary" data-focus @click="go('game', { romId: g.romId })"><Icon name="mdiGamepadVariantOutline" />Open in library</button>
            <button class="btn icon-btn" data-focus @click="more"><Icon name="mdiDotsHorizontal" :size="22" /><span>More</span></button>
            <div class="seg">
              <button v-for="f in filters" :key="f.v" data-focus :class="{ on: filter === f.v }" @click="filter = f.v">{{ f.l }}</button>
            </div>
          </div>
        </div>
      </header>
      <div v-if="!shown.length" class="muted" style="padding: 20px 0">{{ g.total ? 'Nothing here with this filter.' : 'This game has no achievements yet.' }}</div>
      <div class="rg-list">
        <div v-for="a in shown" :key="a.id" class="rg-ach glass" :class="{ locked: !a.earned && !a.earnedHc }" data-focus tabindex="0">
          <img class="rg-badge" :src="img(a.badge)" loading="lazy" />
          <div class="rg-a-body">
            <div class="rg-a-title">{{ a.title }}<span v-if="a.type" class="rg-type">{{ typeLabel(a.type) }}</span></div>
            <div class="rg-a-desc">{{ a.desc }}</div>
            <div class="rg-a-meta">
              <span class="pts">{{ a.points }} pts</span>
              <span v-if="a.earnedHc" class="chip hc">HARDCORE</span>
              <span v-if="a.earned || a.earnedHc">Unlocked {{ day(a.earnedHc || a.earned) }}</span>
              <span v-else>Locked</span>
              <span v-if="a.rarity != null">{{ a.rarity }}% of players</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { call, img, go, setBg, choose, store, iconKey, iconChanged, openModal, toast } from '../store.js';
import GameIcon from '../components/GameIcon.vue';
import { useView } from '../useView.js';
import { focusFirst } from '../nav.js';
import Icon from '../components/Icon.vue';

// One game's RetroAchievements: progress plus every achievement, unlocked or locked.
const props = defineProps({ gameId: [Number, String] });
const el = ref(null);
const g = ref(null);
const error = ref('');
const filter = ref('all');
const filters = [{ v: 'all', l: 'All' }, { v: 'unlocked', l: 'Unlocked' }, { v: 'locked', l: 'Locked' }];
const pct = computed(() => (g.value?.total ? Math.round((g.value.earned / g.value.total) * 100) : 0));
const award = computed(() => ({ mastered: 'Mastered', completed: 'Completed', 'beaten-hardcore': 'Beaten (hardcore)', 'beaten-softcore': 'Beaten' }[g.value?.award] || ''));
const shown = computed(() => {
  const list = g.value?.achievements || [];
  if (filter.value === 'unlocked') return list.filter((a) => a.earned || a.earnedHc);
  if (filter.value === 'locked') return list.filter((a) => !a.earned && !a.earnedHc);
  return list;
});
const typeLabel = (t) => ({ progression: 'Progression', win_condition: 'Win condition', missable: 'Missable' }[t] || t);
const day = (d) => { const t = new Date(String(d).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(d) ? '' : 'Z')); return isNaN(t) ? d : t.toLocaleDateString(); };

async function load(force = false) {
  error.value = '';
  try { g.value = await call('ra:game', { gameId: props.gameId, force }); if (!g.value) throw new Error('RetroAchievements didn’t answer. Try again.'); if (g.value.ingame || g.value.boxart) setBg({ src: img(g.value.ingame || g.value.boxart), blur: !g.value.ingame }); }
  catch (e) { error.value = e.message; }
}
// 0.9.28 (owner): More starts with Go to Game Page; a game not matched to the library searches for it
function toGame() {
  if (g.value?.romId) return go('game', { romId: g.value.romId });
  store.lastSearch = String(g.value?.title || '').replace(/[™®©]/g, '').replace(/\s*[\[(|~].*$/, '').trim();
  go('search');
}
async function more() {
  if (!g.value) return;
  const v = await choose({ title: g.value.title, options: [
    { label: 'Go to Game Page', sub: g.value.romId ? '' : 'Searches your library for it', value: 'game', icon: 'mdiGamepadVariantOutline' },
    // 0.9.57 (owner: as trophies and gamerscore have it): the icon this game shows on Achievements and here
    { label: 'Change Icon', sub: 'SteamGridDB', value: 'icon', icon: 'mdiImageEditOutline' },
    { label: 'Reset Icon', sub: 'Back to RetroAchievements’ own', value: 'reset', icon: 'mdiRestore' },
    { label: 'Refresh', sub: 'Reads it again from RetroAchievements', value: 'refresh', icon: 'mdiRefresh' },
  ] });
  const key = iconKey(g.value.romId, g.value.title);
  if (v === 'game') toGame();
  else if (v === 'refresh') load(true);
  else if (v === 'reset') { await call('icon:reset', { key }); iconChanged(key); toast('Icon reset', 'ok', 2000, 'mdiRestore'); }
  else if (v === 'icon') {
    if (!store.config.sgdbKey) return toast('Add a SteamGridDB API key in Settings → Look & Feel first', 'error', 4500);
    const url = await openModal('art', { kind: 'icon', romName: String(g.value.title || '').replace(/[™®©]/g, '').replace(/\s*[\[(|~].*$/, '').trim() });
    if (!url) return;
    await call('icon:set', { key, url }); iconChanged(key); toast('Icon updated', 'ok', 2000, 'mdiCheck');
  }
}
useView({ x: () => { const i = filters.findIndex((f) => f.v === filter.value); filter.value = filters[(i + 1) % filters.length].v; }, y: more },
  [{ b: 'X', label: 'Filter' }, { b: 'Y', label: 'More' }, { b: 'B', label: 'Back' }]);
onMounted(async () => { await load(); focusFirst(el.value); });
</script>

<style scoped>
.ra-g { padding-top: 18px; }
.rg-head { display: flex; gap: 24px; align-items: flex-start; margin: 6px 0 26px; }
.rg-icon { width: 120px; height: 120px; border-radius: var(--r-lg); object-fit: cover; flex: none; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
.rg-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.rg-title { font-size: var(--t-2xl); }
.rg-bar { height: 8px; max-width: 560px; }
.rg-bar i { background: linear-gradient(90deg, #f5c542, #ffdf80); }
.rg-prog { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; font-size: var(--t-sm); color: #d4d8e2; }
.chip.gold { background: rgba(245, 197, 66, 0.18); color: #ffd978; display: inline-flex; gap: 5px; align-items: center; }
.chip.hc { font-size: var(--t-xs); padding: 2px 6px; background: rgba(255, 90, 90, 0.18); color: #ff9b9b; }
.rg-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 12px; padding-bottom: 40px; }
.rg-ach { display: flex; gap: 14px; padding: 12px 14px; border-radius: var(--r-md); outline: none; transition: transform var(--spring-snappy-d) var(--spring-snappy); }
.rg-ach:focus { transform: scale(1.02); }
.rg-ach.locked { opacity: 0.72; }
.rg-badge { width: 64px; height: 64px; border-radius: var(--r-md); flex: none; }
.rg-a-body { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.rg-a-title { font-family: var(--display); font-weight: 600; font-size: var(--t-md); display: flex; gap: 8px; align-items: center; }
.rg-type { font-family: var(--body); font-weight: 500; font-size: var(--t-xs); color: var(--muted); border: 1px solid var(--line-2); border-radius: 4px; padding: 1px 5px; }
.rg-a-desc { font-size: var(--t-xs); color: var(--text-2, #c3c9d4); }
.rg-a-meta { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; font-size: var(--t-xs); color: var(--muted); }
.rg-a-meta .pts { color: var(--gold); font-weight: 600; }
</style>
