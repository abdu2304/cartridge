<template>
  <button class="coll" :class="{ wide }" data-focus :data-key="'col-' + c.id" @click="$emit('open', c)" @focus="$emit('focused', c)">
    <!-- wide: a game's artwork behind, covers fanned on the right, the icon or series logo on the left -->
    <div v-if="wide" class="art">
      <img v-if="bg" class="bg" :class="{ blur: bg.blur }" :src="bg.src" loading="lazy" decoding="async" @error="fail(bg.src)" />
      <div class="shade" />
      <div class="lead">
        <GameLogo v-if="c.series && logo" :logo="logo" :name="c.name" cls="lead-t" :area="9000" :max-w="170" :max-h="70" />
        <div v-else class="badge"><Icon :name="c.favorite ? 'mdiStar' : c.smart ? 'mdiAutoFix' : c.icon || 'mdiBookmarkMultipleOutline'" :size="30" /></div>
      </div>
      <div class="fan"><img v-for="(a, i) in fan" :key="a" :src="a" :style="{ '--i': i, '--n': fan.length }" loading="lazy" decoding="async" @error="fail(a)" /></div>
    </div>
    <div v-else class="mosaic" :class="'n' + arts.length">
      <img v-for="a in arts" :key="a" :src="a" loading="lazy" decoding="async" @error="fail(a)" />
      <div v-if="!arts.length" class="ph"><Icon :name="c.favorite ? 'mdiStar' : c.icon || 'mdiBookmarkMultipleOutline'" :size="40" /></div>
    </div>
    <div class="cap">
      <Icon v-if="c.favorite" name="mdiStar" :size="15" style="color: var(--gold)" />
      <Icon v-else-if="c.smart" name="mdiAutoFix" :size="15" style="color: var(--primary-t)" />
      <Icon v-else-if="c.icon" :name="c.icon" :size="15" style="color: var(--primary-t)" />
      <span class="nm">{{ c.name }}</span><span class="muted">{{ new Set(c.rom_ids).size }}</span>
    </div>
  </button>
</template>
<script setup>
import { computed, reactive } from 'vue';
import { img, cover, romById, store, logoOf } from '../store.js';
import Icon from './Icon.vue';
import GameLogo from './GameLogo.vue';
const props = defineProps({ c: Object, wide: Boolean });
defineEmits(['open', 'focused']);
const roms = computed(() => props.c.rom_ids.slice(0, 24).map((id) => romById(id)).filter(Boolean));
// 0.9.60 (owner: collections took long to show and Favorites had empty cards): every picture at the size it's drawn, the
// library's own covers first (RomM's collection covers can point at pictures that are gone), and a picture that fails is
// left out instead of leaving an empty card
const bad = reactive(new Set());
const fail = (src) => bad.add(src);
const arts = computed(() => {
  const fromRoms = roms.value.filter((r) => r.path_cover_small || r.url_cover).map((r) => cover(r));
  const theirs = (props.c.covers || []).map((p) => img(p, 360));
  const list = [...new Set([...fromRoms, ...theirs, ...(props.c.cover ? [img(props.c.cover, 360)] : [])])].filter((a) => !bad.has(a));
  return list.slice(0, 4);
});
const fan = computed(() => arts.value.slice(0, 3));
// background: your chosen background for a game, else a screenshot, else a blurred cover
const bg = computed(() => {
  const list = props.c.series ? [...roms.value].reverse() : roms.value; // series: the newest game
  const withHero = list.find((r) => store.art?.[r.id]?.hero);
  const sized = (p) => img(p, 720); // the wide card is 330 px: 720 is sharp on the TV too
  if (withHero && !bad.has(sized(store.art[withHero.id].hero))) return { src: sized(store.art[withHero.id].hero) };
  const withShot = list.find((r) => r.shot && !bad.has(sized(r.shot)));
  if (withShot) return { src: sized(withShot.shot) };
  return arts.value[0] ? { src: arts.value[0], blur: true } : null;
});
// series: the first game's logo usually carries the series name
const logo = computed(() => (props.c.series && store.config.ui.logos !== false && roms.value[0] ? logoOf(roms.value[0]) : null));
</script>
<style scoped>
.coll { flex: none; width: 250px; display: flex; flex-direction: column; gap: 10px; border-radius: var(--r-md); }
.coll.wide { width: 330px; }
.coll:focus { box-shadow: none !important; }
.mosaic, .art { height: 150px; border-radius: var(--r-md); overflow: hidden; background: #151924; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45); transition: transform var(--spring-d) var(--spring), box-shadow var(--tint); }
.art { position: relative; height: 180px; }
.mosaic { display: grid; gap: 2px; }
.mosaic.n1 { grid-template-columns: 1fr; } .mosaic.n2 { grid-template-columns: 1fr 1fr; } .mosaic.n3 { grid-template-columns: 1fr 1fr 1fr; } .mosaic.n4 { grid-template-columns: repeat(4, 1fr); }
.mosaic img { width: 100%; height: 100%; object-fit: cover; }
.mosaic .ph { display: grid; place-items: center; color: var(--primary-t); background: linear-gradient(145deg, #2a2346, #12141d); }
.art .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.art .bg.blur { filter: blur(18px) saturate(1.3) brightness(0.8); transform: scale(1.2); }
.art .shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(8, 8, 16, 0.82) 0%, rgba(8, 8, 16, 0.35) 55%, rgba(8, 8, 16, 0.55) 100%); }
.lead { position: absolute; left: 18px; top: 0; bottom: 0; display: flex; align-items: center; max-width: 52%; }
.badge { width: 58px; height: 58px; border-radius: var(--r-lg); display: grid; place-items: center; color: #fff; background: var(--chip-bg, rgba(46, 48, 56, 0.96)); backdrop-filter: var(--chip-blur, none); box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35); } /* see-through only in Glass (0.9.48, styles.css sets the tokens) */
.lead :deep(.lead-t) { font-family: var(--display); font-weight: 700; font-size: var(--t-lg); line-height: 1.1; text-shadow: 0 3px 14px rgba(0, 0, 0, 0.6); }
.fan { position: absolute; right: 16px; bottom: 16px; top: 16px; width: 150px; }
.fan img { position: absolute; right: calc(var(--i) * 34px); bottom: 0; height: 100%; aspect-ratio: 2 / 3; object-fit: cover; border-radius: var(--r-sm); box-shadow: 0 8px 22px rgba(0, 0, 0, 0.6); transform: rotate(calc((var(--i) - (var(--n) - 1) / 2) * -5deg)); z-index: calc(10 - var(--i)); }
body.light-fx .badge { backdrop-filter: none; }
.coll:focus .mosaic, .coll:focus .art { transform: translateY(-5px) scale(1.04); box-shadow: var(--ring); }
.cap { display: flex; align-items: center; gap: 8px; font-size: var(--t-sm); padding: 0 4px; }
.cap .nm { font-weight: 500;  overflow-wrap: anywhere; }
</style>
