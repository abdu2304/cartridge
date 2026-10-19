<template>
  <svg v-if="slug === 'steam'" class="cmark cmark-steam" viewBox="0 0 24 24" role="img" :aria-label="label || 'Steam'" :style="{ '--opt': opticalOf('', 'steam') }"><title>{{ label || 'Steam' }}</title><path :d="STEAM" /></svg>
  <img v-else-if="url && !bad" class="cmark" :src="url" :alt="label" :title="label" :style="optical" @error="bad = true" />
  <span v-else class="cmark-t">{{ label }}</span>
</template>
<script setup>
import { ref, watch, computed } from 'vue';
import { call } from '../store.js';
import { opticalOf } from '../consoleOptical.js';
import { STEAM } from '../steamLogo.js';
// A console's white wordmark, sized to the text around it (cap height), or its short name
const props = defineProps({ slug: String, label: String });
const cache = (globalThis.__sysLogos ||= new Map());
const url = ref('');
const optical = computed(() => {
  const f = opticalOf(url.value, props.slug);
  return f === 1 ? null : { '--opt': f }; // 0.9.42: a factor on the height the page asks for (--cm-h), not a fixed one
});
const bad = ref(false);
watch(() => props.slug, (k) => {
  bad.value = false;
  if (!k || k === 'steam') { url.value = ''; return; }
  if (cache.has(k)) { url.value = cache.get(k); return; }
  call('syslogo:get', { slug: k, fs_slug: k }).then((u) => { cache.set(k, u || ''); url.value = u || ''; }).catch(() => cache.set(k, ''));
}, { immediate: true });
</script>
<style>
/* a page sizes the mark with --cm-h; the optical factor (--opt) scales on top, the margins keep the line height */
.cmark { display: inline-block; height: calc(var(--cm-h, 0.8em) * var(--opt, 1)); margin-block: calc(var(--cm-h, 0.8em) * (1 - var(--opt, 1)) / 2); width: auto; vertical-align: middle; filter: brightness(0) invert(1); opacity: 0.92; }
.cmark-t { font-weight: 700; }
.cmark-steam { aspect-ratio: 1; fill: #000; } /* inverted to white with the wordmarks (filter above) */
</style>
