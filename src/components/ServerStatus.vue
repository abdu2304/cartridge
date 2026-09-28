<template>
  <div class="ss glass">
    <div class="ss-top">
      <div class="ss-dot" :class="h ? (h.ok ? 'ok' : 'bad') : ''" />
      <div style="min-width: 0">
        <b>Your RomM server</b>
        <div class="muted small mono" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ h?.base || store.connection.base || 'Not connected' }}</div>
      </div>
      <div class="spacer" />
      <button class="btn small" data-focus :disabled="busy" @click="load"><Icon name="mdiRefresh" :size="18" :class="{ spin: busy }" />Check again</button>
    </div>
    <div v-if="h" class="ss-grid">
      <div><span>Status</span><b :class="h.ok ? 'good' : 'badt'">{{ h.ok ? 'Online' : h.error ? `Can't reach it (${h.error})` : 'Not answering' }}</b></div>
      <div v-if="h.route"><span>Connected over</span><b>{{ h.route === 'local' ? 'Your home network (LAN)' : 'The internet (tunnel)' }}</b></div>
      <div v-if="h.ms != null"><span>Response time</span><b>{{ h.ms }} ms<small>{{ h.ms < 120 ? ' · fast' : h.ms < 500 ? ' · fine' : ' · slow' }}</small></b></div>
      <div v-if="h.version"><span>RomM version</span><b>{{ h.version }}</b></div>
      <template v-if="h.stats">
        <div><span>Consoles</span><b>{{ h.stats.platforms }}</b></div>
        <div><span>Games</span><b>{{ h.stats.roms }}</b></div>
        <div v-if="h.stats.bytes"><span>Library size</span><b>{{ bytes(h.stats.bytes) }}</b></div>
        <div v-if="h.stats.saves != null"><span>Saves and states</span><b>{{ h.stats.saves }} · {{ h.stats.states }}</b></div>
      </template>
      <div v-if="h.rescan"><span>Automatic scan</span><b>On</b></div>
      <div v-if="h.sources?.length" class="wide"><span>Metadata from</span><b class="srcs">{{ h.sources.map(nice).join(', ') }}</b></div>
    </div>
  </div>
</template>

<script setup>
// Settings → About: is the server there, how quickly it answers, and what it holds
import { onMounted, ref } from 'vue';
import { call, store, bytes } from '../store.js';
import Icon from './Icon.vue';

const h = ref(null);
const busy = ref(false);
const NAMES = { IGDB: 'IGDB', SS: 'ScreenScraper', MOBY: 'MobyGames', RA: 'RetroAchievements', LAUNCHBOX: 'LaunchBox', HASHEOUS: 'Hasheous', STEAMGRIDDB: 'SteamGridDB', SGDB: 'SteamGridDB', TGDB: 'TheGamesDB', HLTB: 'HowLongToBeat', FLASHPOINT: 'Flashpoint', PLAYMATCH: 'Playmatch', LIBRETRO: 'Libretro', STEAM: 'Steam' };
const nice = (k) => NAMES[k] || k.charAt(0) + k.slice(1).toLowerCase().replace(/_/g, ' ');
async function load() {
  busy.value = true;
  try { h.value = await call('server:health'); } catch (e) { h.value = { ok: false, error: e.message }; }
  busy.value = false;
}
onMounted(load);
</script>

<style scoped>
.ss { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
.ss-top { display: flex; align-items: center; gap: 14px; }
.ss-top b { font-family: var(--display); font-size: 17px; }
.small { font-size: 12.5px; }
.spacer { flex: 1; }
.ss-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--dim); flex: none; }
.ss-dot.ok { background: #7fe3a6; box-shadow: 0 0 0 4px rgba(127, 227, 166, 0.18); }
.ss-dot.bad { background: var(--red); box-shadow: 0 0 0 4px rgba(255, 90, 90, 0.18); }
.ss-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px 20px; }
.ss-grid > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ss-grid .wide { grid-column: 1 / -1; }
.ss-grid span { font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.ss-grid b { font-size: 15px; font-weight: 600; }
.ss-grid b small { font-weight: 500; color: var(--muted); font-size: 12.5px; }
.ss-grid .good { color: #b9f6ca; }
.ss-grid .badt { color: #ffc0c0; }
.srcs { font-weight: 500 !important; font-size: 13.5px !important; line-height: 1.5; }
</style>
