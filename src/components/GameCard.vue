<template>
  <button class="card" data-focus :data-key="'rom-' + rom.id" @click="$emit('open', rom)" @focus="onFocus">
    <div class="art">
      <img v-if="src && !failed" :src="src" loading="lazy" decoding="async" @error="failed = true" />
      <div v-else class="ph">{{ rom.name }}<small>{{ rom.platform_display_name }}</small></div>
      <div class="shine" />
      <span v-if="fresh && !installed" class="chip new badge-new">NEW</span>
      <div v-if="installed" class="badge-dl"><Icon name="mdiCheckBold" :size="15" /></div>
      <div v-else-if="dl && dl.status === 'queued'" class="queued">Queued</div>
      <div v-if="dl && dl.status === 'downloading'" class="prog"><i :style="{ width: pct + '%' }" /></div>
    </div>
    <div v-if="!hideTitle" class="title">{{ rom.name }}</div>
    <div v-if="showPlatform" class="sub">{{ rom.platform_display_name }}</div>
  </button>
</template>
<script setup>
import { computed, ref } from 'vue';
import { store, cover, downloadFor, isNew } from '../store.js';
import Icon from './Icon.vue';
const props = defineProps({ rom: Object, showPlatform: Boolean, hideTitle: Boolean });
const emit = defineEmits(['open', 'focused']);
const failed = ref(false);
const src = computed(() => cover(props.rom));
const installed = computed(() => !!store.installed[props.rom.id]);
const fresh = computed(() => isNew(props.rom));
const dl = computed(() => { const d = downloadFor(props.rom.id); return d && ['queued', 'downloading'].includes(d.status) ? d : null; });
const pct = computed(() => (dl.value?.total ? Math.floor((dl.value.received / dl.value.total) * 100) : 0));
function onFocus() { emit('focused', props.rom); }
</script>
