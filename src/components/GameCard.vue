<template>
  <button class="card" :class="{ picked: selected }" data-focus :data-key="'rom-' + rom.id" @click="$emit('open', rom)" @focus="onFocus">
    <div class="art">
      <img v-if="src && !failed" :ref="seen" :src="src" :class="{ wait: !shown }" loading="lazy" decoding="async" @load="shown = true" @error="failed = true" />
      <!-- no cover: the name is said once, under the card (0.9.71 playtest); on cards without that line it stays here -->
      <div v-else class="ph"><span v-if="hideTitle" class="ph-t">{{ rom.name }}</span><small>{{ rom.platform_display_name }}</small></div>
      <div class="shine" />
      <span v-if="fresh && !installed" class="chip new badge-new">NEW</span>
      <div v-if="installed" class="badge-dl"><Icon name="mdiCheckBold" :size="15" /></div>
      <div v-else-if="dl && dl.status === 'queued'" class="queued">Queued</div>
      <div v-if="selected !== null" class="pick"><Icon :name="selected ? 'mdiCheckboxMarked' : 'mdiCheckboxBlankOutline'" :size="24" /></div>
      <div v-if="dl && dl.status === 'downloading'" class="prog"><i :style="{ width: pct + '%' }" /></div>
      <div v-if="del != null" class="deleting"><Ring :pct="del" /><span>Deleting</span></div>
    </div>
    <div v-if="!hideTitle" class="title">{{ rom.name }}</div>
    <div v-if="showPlatform" class="sub"><ConsoleMark :slug="rom.platform_slug" :label="rom.platform_display_name" /></div>
    <!-- its own line, wrapping inside the card's width, never cut short (0.9.3 F7: device names) -->
    <div v-if="extra && device" class="sub extra"><span class="dev-pill"><Icon name="mdiDevices" :size="12" />{{ extra.replace(/^on /, '') }}</span></div>
    <div v-else-if="extra" class="sub extra">{{ extra }}</div>
  </button>
</template>
<script setup>
import { computed, ref } from 'vue';
import { store, cover, downloadFor, isNew } from '../store.js';
import Icon from './Icon.vue';
import Ring from './Ring.vue';
import ConsoleMark from './ConsoleMark.vue';
// device: extra is where it was played ("on Steam Deck"), shown as a quiet pill (0.9.16)
const props = defineProps({ rom: Object, showPlatform: Boolean, extra: String, device: Boolean, hideTitle: Boolean, selected: { type: Boolean, default: null } });
const emit = defineEmits(['open', 'focused']);
const failed = ref(false);
// covers that arrive late fade in instead of popping; ones already loaded show at once (0.9.17, fluidity)
const shown = ref(true);
const seen = (el) => { if (el && !el.complete && el.dataset.w !== el.src) { el.dataset.w = el.src; shown.value = false; } };
const src = computed(() => cover(props.rom));
const installed = computed(() => !!store.installed[props.rom.id]);
const fresh = computed(() => isNew(props.rom));
const dl = computed(() => { const d = downloadFor(props.rom.id); return d && ['queued', 'downloading'].includes(d.status) ? d : null; });
const pct = computed(() => (dl.value?.total ? Math.floor((dl.value.received / dl.value.total) * 100) : 0));
const del = computed(() => store.deleting[props.rom.id] ?? null);
function onFocus() { emit('focused', props.rom); }
</script>
<style scoped>
.art img { transition: opacity var(--d-med) var(--ease); }
.art img.wait { opacity: 0; }
/* deleting: the cover dims and a ring fills as the files go (0.9.3) */
.deleting { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--s-2); background: rgba(6, 7, 11, 0.72); color: #fff; font-size: var(--t-xs); font-weight: 600; animation: fade var(--d-med); }
</style>
