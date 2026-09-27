<template>
  <button class="systile" data-focus :data-key="'sys-' + p.id" @click="$emit('open', p)" @focus="$emit('focused', p)" :style="{ background: tint }">
    <div class="glyph"><PIcon :p="p" :size="150" /></div>
    <div class="ico"><PIcon :p="p" :size="44" /></div>
    <div>
      <div v-if="meta" class="fam">{{ meta }}</div>
      <div class="nm">{{ p.display_name }}</div>
      <div class="ct">{{ p.rom_count }} games<template v-if="onDevice"> · <span style="color: var(--green-l)">{{ onDevice }} on device</span></template></div>
    </div>
  </button>
</template>
<script setup>
import { computed } from 'vue';
import { store, romsOf } from '../store.js';
import PIcon from './PIcon.vue';
const props = defineProps({ p: Object });
defineEmits(['open', 'focused']);
const meta = computed(() => [props.p.family_name, props.p.generation ? `Gen ${props.p.generation}` : '', props.p.category].filter(Boolean).slice(0, 2).join(' · '));
const onDevice = computed(() => romsOf(props.p.id).filter((r) => store.installed[r.id]).length);
// Stable hue per system so the shelf feels colourful but on-brand
const tint = computed(() => {
  let h = 0; for (const c of props.p.slug) h = (h * 31 + c.charCodeAt(0)) % 360;
  const hue = 230 + (h % 90); // violet..magenta band
  return `linear-gradient(145deg, hsla(${hue}, 45%, 30%, .92), rgba(14,16,24,.94) 70%)`;
});
</script>
