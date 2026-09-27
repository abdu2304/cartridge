<template>
  <div class="view" data-scroll ref="el">
    <button class="searchbar glass" data-focus data-autofocus @click="ask">
      <Icon name="mdiMagnify" :size="28" />
      <span v-if="q" class="qv">{{ q }}</span><span v-else class="muted">Search every system…</span>
      <span style="margin-left: auto" class="row muted" ><Btn b="Y" />Type</span>
    </button>
    <div v-if="q && !results.length" class="empty">Nothing matches “{{ q }}”.</div>
    <template v-else-if="results.length">
      <div class="shelf-title">Results<span class="count">{{ results.length }}{{ results.length === LIMIT ? '+' : '' }}</span></div>
      <div class="game-grid" style="padding-top: 10px"><GameCard v-for="r in results" :key="r.id" :rom="r" show-platform @open="(r) => go('game', { romId: r.id })" @focused="(r) => setBg(backdropOf(r))" /></div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, nextTick } from 'vue';
import { store, askText, go, allRoms, download, setBg, backdropOf, romById } from '../store.js';
import { useView } from '../useView.js';
import { focusFirst } from '../nav.js';
import Icon from '../components/Icon.vue';
import Btn from '../components/Btn.vue';
import GameCard from '../components/GameCard.vue';

const LIMIT = 150;
const el = ref(null);
const q = ref(store.lastSearch || '');
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const results = computed(() => {
  const t = norm(q.value);
  if (!t) return [];
  const words = t.split(' ');
  const scored = [];
  for (const r of allRoms()) {
    const hay = norm(r.name) + ' ' + norm(r.fs_name) + ' ' + norm(r.platform_display_name);
    if (!words.every((w) => hay.includes(w))) continue;
    const n = norm(r.name);
    scored.push([n === t ? 0 : n.startsWith(t) ? 1 : n.includes(t) ? 2 : 3, r]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, LIMIT).map((x) => x[1]);
});

useView(
  {
    y: () => ask(),
    x: () => {
      const key = document.activeElement?.dataset?.key || '';
      const r = key.startsWith('rom-') && romById(key.slice(4));
      if (r && !store.installed[r.id]) download(r);
    },
  },
  [{ b: 'A', label: 'Open' }, { b: 'X', label: 'Download' }, { b: 'Y', label: 'Search' }, { b: 'B', label: 'Back' }],
);

async function ask() {
  const v = await askText({ title: 'Search your library', value: q.value, placeholder: 'Game or system name' });
  if (v === null || v === undefined) return;
  q.value = v.trim();
  store.lastSearch = q.value;
  await nextTick();
  if (results.value.length) focusFirst(el.value, '.card');
}
onMounted(() => { if (!q.value) ask(); });
</script>

<style scoped>
.searchbar { width: 100%; display: flex; align-items: center; gap: 16px; height: 68px; padding: 0 24px; border-radius: 18px; font-size: 20px; margin: 16px 0 26px; }
.qv { font-family: var(--display); font-weight: 500; }
</style>
