<template>
  <div class="view" data-scroll ref="el">
    <div class="eyebrow" style="margin-top: 14px">Search</div>
    <h1 class="s-title">{{ q ? `Results for “${q}”` : 'Search your library' }}</h1>
    <p v-if="!q" class="muted s-tip">Type in the search box at the top with any keyboard. In Game Mode, press <b>Steam + X</b> for the Steam keyboard.</p>
    <div v-else-if="!results.length && !portHits.length" class="empty">Nothing matches “{{ q }}”.</div>
    <template v-else>
      <!-- 0.9.86 (owner's brief: a port is its own thing, also in search): installed PC ports, with the Steam mark, opening their game page as the port -->
      <template v-if="portHits.length">
        <div class="shelf-title">PC Ports<span class="count">{{ portHits.length }}</span></div>
        <div class="game-grid" style="padding-top: var(--s-5)"><GameCard v-for="h in portHits" :key="'port-' + h.e.id" :rom="h.rom" show-platform port @open="go('game', { romId: h.rom.id, port: h.e.id })" @focused="(r) => setBg(backdropOf(r))" /></div>
      </template>
      <div v-if="results.length" class="shelf-title">Games<span class="count">{{ results.length }}{{ results.length === LIMIT ? '+' : '' }}</span></div>
      <div class="game-grid" style="padding-top: var(--s-5)"><GameCard v-for="r in results" :key="r.id" :rom="r" show-platform @open="(r) => go('game', { romId: r.id })" @focused="(r) => setBg(backdropOf(r))" /></div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { store, go, allRoms, download, setBg, backdropOf, romById, visible, call } from '../store.js';
import { useView } from '../useView.js';

import GameCard from '../components/GameCard.vue';

const LIMIT = 150;
const el = ref(null);
const q = computed(() => (store.lastSearch || '').trim());
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const results = computed(() => {
  const t = norm(q.value);
  if (!t) return [];
  const words = t.split(' ');
  const scored = [];
  for (const r of allRoms()) {
    if (!visible(r)) continue; // hidden in RomM
    const hay = norm(r.name) + ' ' + norm(r.fs_name) + ' ' + norm(r.platform_display_name);
    if (!words.every((w) => hay.includes(w))) continue;
    const n = norm(r.name);
    scored.push([n === t ? 0 : n.startsWith(t) ? 1 : n.includes(t) ? 2 : 3, r]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, LIMIT).map((x) => x[1]);
});

// installed ports whose name or game matches (all of them for "pc port"); each shown as the library game it's for
const ports = ref([]);
call('recomps:list').then((l) => { ports.value = (l?.entries || []).filter((e) => e.installed && e.roms?.length); }).catch(() => {});
const portHits = computed(() => {
  const t = norm(q.value);
  if (!t) return [];
  const words = t.split(' ');
  return ports.value.map((e) => ({ e, rom: romById(e.roms[0]) })).filter((h) => h.rom && words.every((w) => `${norm(h.e.name)} ${norm(h.rom.name)} pc port ports`.includes(w)));
});

useView(
  {
    // Y is left to App.vue's search handler, which opens the built-in keyboard in Game Mode
    x: () => {
      const key = document.activeElement?.dataset?.key || '';
      const r = key.startsWith('rom-') && romById(key.slice(4));
      if (r && !store.installed[r.id]) download(r);
    },
  },
  [{ b: 'A', label: 'Open' }, { b: 'X', label: 'Download' }, { b: 'Y', label: 'Search' }, { b: 'B', label: 'Back' }],
);

</script>

<style scoped>
.s-title { font-family: var(--display); font-size: var(--t-2xl); margin: 4px 0 10px; }
.s-tip { font-size: var(--t-md); }
</style>
