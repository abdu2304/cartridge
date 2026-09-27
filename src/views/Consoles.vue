<template>
  <div class="view" data-scroll ref="el">
    <header class="lib-head">
      <div>
        <div class="eyebrow">Consoles</div>
        <h1 class="big">{{ plats.length }} consoles · {{ total }} games</h1>
        <div class="muted row" style="gap: 10px; font-size: 13.5px">
          <span>{{ installedCount }} on this device</span><span>·</span>
          <span v-if="syncing" class="row" style="gap: 6px"><Icon name="mdiSync" :size="15" class="spin" />{{ store.sync.label }}</span>
          <span v-else>Synced {{ ago(store.lib?.syncedAt) }}</span>
        </div>
      </div>
      <div class="row">
        <button class="btn" data-focus :disabled="syncing" @click="resync()"><Icon name="mdiSync" />Resync</button>
        <button class="btn" data-focus :disabled="syncing" @click="scanServer()"><Icon name="mdiRadar" />Scan server</button>
      </div>
    </header>
    <div v-if="!store.lib" class="center"><div class="spinner" />Waiting for the first sync…</div>
    <div v-else class="sys-grid">
      <SysTile v-for="p in plats" :key="p.id" :p="p" @open="(p) => go('platform', { platformId: p.id })" @focused="focusSys" />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, nextTick, watch } from 'vue';
import { store, go, visiblePlatforms, allRoms, romsOf, resync, scanServer, ago, setBg, backdropOf } from '../store.js';
import { useView } from '../useView.js';
import { ensureFocus } from '../nav.js';
import Icon from '../components/Icon.vue';
import SysTile from '../components/SysTile.vue';

const el = ref(null);
const plats = computed(() => (store.libVersion, visiblePlatforms()));
const total = computed(() => allRoms().length);
const installedCount = computed(() => Object.keys(store.installed).length);
const syncing = computed(() => ['running', 'scanning'].includes(store.sync.state));
function focusSys(p) {
  const r = romsOf(p.id).find((x) => x.shot) || romsOf(p.id).find((x) => x.path_cover_large);
  setBg(backdropOf(r));
}
useView({ x: () => resync() }, [{ b: 'A', label: 'Open console' }, { b: 'X', label: 'Resync' }, { b: 'Y', label: 'Search' }, { b: 'LB', label: '/ RB  Tabs' }]);
onMounted(async () => { await nextTick(); ensureFocus(el.value.querySelector('.sys-grid') || el.value); });
watch(() => store.libVersion, async () => { await nextTick(); ensureFocus(el.value); });
</script>

<style scoped>
.lib-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin: 18px 0 26px; }
.big { font-size: 36px; font-weight: 700; margin: 6px 0 8px; }
.sys-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 18px; }
.sys-grid :deep(.systile) { width: auto; height: 168px; }
</style>
