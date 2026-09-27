<template>
  <svg class="icon" :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true"><path :d="d" fill="currentColor" /></svg>
</template>
<script setup>
import * as mdi from '@mdi/js';
import { computed } from 'vue';
const props = defineProps({ name: String, size: { type: [Number, String], default: 20 } });
const d = computed(() => mdi[props.name] || mdi.mdiHelpCircleOutline);
</script>
