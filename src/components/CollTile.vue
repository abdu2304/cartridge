<template>
  <button class="coll" data-focus :data-key="'col-' + c.id" @click="$emit('open', c)" @focus="$emit('focused', c)">
    <div class="mosaic" :class="'n' + arts.length">
      <img v-for="(a, i) in arts" :key="i" :src="a" loading="lazy" />
      <div v-if="!arts.length" class="ph"><Icon :name="c.favorite ? 'mdiStar' : 'mdiBookmarkMultipleOutline'" :size="40" /></div>
    </div>
    <div class="cap">
      <Icon v-if="c.favorite" name="mdiStar" :size="15" style="color: var(--gold)" />
      <Icon v-else-if="c.smart" name="mdiAutoFix" :size="15" style="color: #cfc4ff" />
      <span class="nm">{{ c.name }}</span><span class="muted">{{ c.rom_ids.length }}</span>
    </div>
  </button>
</template>
<script setup>
import { computed } from 'vue';
import { img, cover, romById } from '../store.js';
import Icon from './Icon.vue';
const props = defineProps({ c: Object });
defineEmits(['open', 'focused']);
const arts = computed(() => {
  if (props.c.covers?.length) return props.c.covers.slice(0, 4).map(img);
  const fromRoms = props.c.rom_ids.slice(0, 12).map((id) => romById(id)).filter((r) => r && (r.path_cover_small || r.url_cover)).slice(0, 4).map((r) => cover(r));
  if (fromRoms.length) return fromRoms;
  return props.c.cover ? [img(props.c.cover)] : [];
});
</script>
<style scoped>
.coll { flex: none; width: 250px; display: flex; flex-direction: column; gap: 10px; border-radius: 16px; }
.coll:focus { box-shadow: none !important; }
.mosaic { height: 150px; border-radius: 16px; overflow: hidden; display: grid; gap: 2px; background: #151924; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45); transition: transform 0.22s var(--ease), box-shadow 0.22s; }
.mosaic.n1 { grid-template-columns: 1fr; } .mosaic.n2 { grid-template-columns: 1fr 1fr; } .mosaic.n3 { grid-template-columns: 1fr 1fr 1fr; } .mosaic.n4 { grid-template-columns: repeat(4, 1fr); }
.mosaic img { width: 100%; height: 100%; object-fit: cover; }
.mosaic .ph { display: grid; place-items: center; color: #cfc4ff; background: linear-gradient(145deg, #2a2346, #12141d); }
.coll:focus .mosaic { transform: translateY(-5px) scale(1.04); box-shadow: var(--ring); }
.cap { display: flex; align-items: center; gap: 8px; font-size: 14px; padding: 0 4px; }
.cap .nm { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
