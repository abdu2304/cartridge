<template>
  <img v-if="i < cands.length" :src="img(cands[i])" @error="i++" :key="cands[i]" :style="{ width: size + 'px', height: size + 'px', objectFit: 'contain' }" />
  <Icon v-else name="mdiGamepadVariantOutline" :size="size" style="color: var(--muted)" />
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { img } from '../store.js';
import Icon from './Icon.vue';
const ALIAS = { 'genesis-slash-megadrive': 'genesis', ps: 'psx', 'turbografx16--1': 'tg16', sfam: 'snes', gc: 'ngc', n3ds: '3ds' };
const props = defineProps({ p: Object, size: { type: Number, default: 32 } });
const i = ref(0);
const cands = computed(() => {
  const names = [...new Set([props.p.slug, props.p.fs_slug, ALIAS[props.p.slug]].filter(Boolean).map((s) => s.toLowerCase()))];
  return [...names.map((n) => `/assets/platforms/${n}.svg`), ...names.map((n) => `/assets/platforms/${n}.ico`)];
});
watch(cands, () => (i.value = 0));
</script>
