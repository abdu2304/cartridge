<template>
  <button class="systile" data-focus :data-key="'sys-' + p.id" @click="$emit('open', p)" @focus="$emit('focused', p)" :style="tileStyle">
    <!-- the controller picture sits in its own clipped layer: while the tile is zoomed on focus it
         otherwise slips past the rounded corners (software rendering) -->
    <div class="sys-clip"><div class="glyph"><PIcon :p="p" :size="150" /></div></div>
    <div class="sys-top">
      <img v-if="logo && !logoFail" class="sys-logo" :src="logo" :alt="p.display_name" @error="logoFail = true" />
      <template v-else>
        <div class="ico"><PIcon :p="p" :size="40" /></div>
      </template>
    </div>
    <div>
      <div v-if="!logo || logoFail" class="nm">{{ p.display_name }}</div>
      <div v-if="meta" class="fam">{{ meta }}</div>
      <div class="ct">{{ p.rom_count }} {{ p.rom_count === 1 ? 'game' : 'games' }}<template v-if="onDevice"> · <span class="ondev">{{ onDevice }} on device</span></template></div>
    </div>
  </button>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { store, romsOf, call } from '../store.js';
import { consoleColors } from '../consoleColors.js';
import PIcon from './PIcon.vue';
const props = defineProps({ p: Object });
defineEmits(['open', 'focused']);
const meta = computed(() => [props.p.family_name, props.p.generation ? `Gen ${props.p.generation}` : '', props.p.category].filter(Boolean).slice(0, 2).join(' · '));
const onDevice = computed(() => romsOf(props.p.id).filter((r) => store.installed[r.id]).length);

// Console logo (white wordmark), cached by the main process; falls back to the name
const cache = (globalThis.__sysLogos ||= new Map());
const logo = ref(cache.get(props.p.slug) || '');
const logoFail = ref(false);
watch(() => props.p.slug, load, { immediate: true });
function load() {
  const k = props.p.slug;
  if (cache.has(k)) { logo.value = cache.get(k); return; }
  call('syslogo:get', { slug: props.p.slug, fs_slug: props.p.fs_slug }).then((u) => { cache.set(k, u || ''); logo.value = u || ''; }).catch(() => cache.set(k, ''));
}

// The console's own colours as --sys-a / --sys-b (styles.css builds the tile from them). Consoles
// without a known pair get a colour from their name, so each keeps the same one.
const tileStyle = computed(() => {
  const c = consoleColors(props.p);
  if (c) return { '--sys-a': c[0], '--sys-b': c[1] };
  let h = 0; for (const ch of props.p.slug) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const hue = 200 + (h % 140);
  return { '--sys-a': `hsl(${hue} 45% 42%)`, '--sys-b': `hsl(${(hue + 30) % 360} 40% 22%)` };
});
</script>
<style>
.systile .sys-top { height: 44px; display: flex; align-items: center; position: relative; z-index: 1; }
.systile .sys-top + div { position: relative; z-index: 1; }
.systile .sys-logo { max-height: 34px; max-width: 170px; object-fit: contain; object-position: left center; filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.45)); transition: transform 0.3s var(--ease); transform-origin: left center; }
.systile:focus .sys-logo { transform: scale(1.06); }
.systile .ondev { color: #b9f6ca; }
.systile .sys-clip { position: absolute; inset: 0; border-radius: inherit; overflow: hidden; clip-path: inset(0 round 16px); pointer-events: none; }
</style>
