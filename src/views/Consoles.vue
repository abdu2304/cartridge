<template>
  <div class="view" data-scroll ref="el">
    <header class="lib-head">
      <div>
        <div class="eyebrow">Library</div>
        <h1 class="big">Consoles</h1>
        <div class="stats">
          <div><b>{{ plats.length }}</b><span>{{ plats.length === 1 ? 'Console' : 'Consoles' }}</span></div><i />
          <div><b>{{ total }}</b><span>{{ total === 1 ? 'Game' : 'Games' }}</span></div><i />
          <div><b class="ondev">{{ installedCount }}</b><span>On this device</span></div><i />
          <div class="sync"><b v-if="syncing" class="row" style="gap: 6px"><Icon name="mdiSync" :size="16" class="spin" />{{ store.sync.label }}</b><b v-else>{{ ago(store.lib?.syncedAt) }}</b><span>Last sync</span></div>
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
useView({ x: () => resync() }, [{ b: 'A', label: 'Open console' }, { b: 'X', label: 'Resync' }, { b: 'Y', label: 'Search' }, { b: 'LT+RT', label: 'Tabs' }]);
onMounted(async () => { await nextTick(); ensureFocus(el.value.querySelector('.sys-grid') || el.value); });
watch(() => store.libVersion, async () => { await nextTick(); ensureFocus(el.value); });
</script>

<style scoped>
.lib-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin: 18px 0 26px; }
.big { font-size: 44px; font-weight: 700; letter-spacing: -0.02em; margin: 4px 0 14px; }
/* big numbers with small labels, split by hairlines */
.stats { display: flex; align-items: stretch; gap: 22px; }
.stats > div { display: flex; flex-direction: column; gap: 4px; }
.stats b { font-family: var(--display); font-size: 30px; font-weight: 700; line-height: 1; letter-spacing: -0.01em; }
.stats .ondev { color: #b9f6ca; }
.stats .sync b { font-family: var(--font); font-size: 17px; font-weight: 500; padding-top: 7px; line-height: 23px; }
.stats span { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255, 255, 255, 0.5); font-weight: 600; }
.stats i { width: 1px; background: rgba(255, 255, 255, 0.14); }
.sys-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 18px; }
.sys-grid :deep(.systile) { width: auto; height: 168px; }
</style>
