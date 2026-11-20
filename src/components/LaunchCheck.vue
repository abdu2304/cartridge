<template>
  <!-- Launch Check (0.9.93, owner's pick): what would stop this game starting, found before Play, worst first, each line
       with the one press that fixes it. Built from the shared dialog, row and pill styles, so Plain and Glass each keep
       their own look. Resolves 'play', a fix (src/launchFix.js runs it), or null (B). -->
  <div class="scrim" ref="el" @click.self="closeModal(null)">
    <div class="dialog lc" role="dialog" aria-labelledby="lc-title">
      <div class="lc-head">
        <span class="lc-mark" :class="r.clear ? 'ok' : 'bad'"><Icon :name="r.clear ? 'mdiCheckCircleOutline' : 'mdiAlertCircleOutline'" :size="30" /></span>
        <div style="min-width: 0">
          <div class="eyebrow">Launch Check</div>
          <h2 id="lc-title">{{ name }}</h2>
          <p class="muted small">{{ summary }}</p>
        </div>
      </div>
      <div class="lc-list" data-scroll>
        <component :is="x.fix ? 'button' : 'div'" v-for="(x, i) in r.items" :key="x.id + i" class="lrow lc-row" :class="[x.level, { still: !x.fix }]" :data-focus="x.fix ? '' : null" @click="x.fix && closeModal(x.fix)">
          <Icon :name="ICON[x.level]" :size="22" class="lc-ic" />
          <span class="l-mid"><b>{{ x.text }}</b></span>
          <span v-if="x.fix" class="l-end"><span class="status" :class="x.level">{{ x.fix.label }}</span></span>
        </component>
      </div>
      <div class="row lc-foot">
        <button class="btn" :class="{ primary: r.clear }" data-focus @click="closeModal('play')"><Icon name="mdiPlay" :size="18" />{{ r.clear ? 'Play' : 'Play Anyway' }}</button>
        <button class="btn" data-focus @click="closeModal(null)">Cancel</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { pushLayer, focusFirst } from '../nav.js';
import { closeModal } from '../store.js';
import Icon from './Icon.vue';

const props = defineProps({ name: { type: String, default: '' }, port: { type: Boolean, default: false }, result: { type: Object, default: () => ({ clear: true, items: [] }) } });
const ICON = { bad: 'mdiCloseCircleOutline', warn: 'mdiAlertOutline', ok: 'mdiCheckCircleOutline' };
const r = computed(() => props.result || { clear: true, items: [] });
const summary = computed(() => {
  const b = r.value.bad || 0, w = r.value.warn || 0;
  if (!b) return w ? `Nothing will stop it starting. ${w === 1 ? 'One thing' : `${w} things`} to know about below.` : 'Nothing is in its way.';
  return `${b === 1 ? 'One thing' : `${b} things`} will stop it starting. Press one to fix it, or play anyway.`;
});
const el = ref(null);
let layer;
onMounted(() => {
  const none = () => {};
  layer = pushLayer(el.value, { back: () => closeModal(null), start: () => closeModal(null), lb: none, rb: none, x: none, y: none, select: none, lt: none, rt: none });
  focusFirst(el.value);
});
onBeforeUnmount(() => layer?.pop());
</script>

<style scoped>
.lc { width: min(640px, 94vw); max-height: 88vh; display: flex; flex-direction: column; gap: var(--s-4); }
.lc-head { display: flex; gap: var(--s-4); align-items: flex-start; }
.lc-head h2 { margin: 2px 0 6px; font-size: var(--t-xl); line-height: 1.15; overflow-wrap: anywhere; }
.lc-head p { margin: 0; line-height: 1.45; }
.lc-mark { flex: none; display: grid; place-items: center; width: 48px; height: 48px; border-radius: var(--r-md); }
.lc-mark.ok { background: rgba(63, 185, 80, 0.16); color: var(--green-l); }
.lc-mark.bad { background: rgba(255, 107, 97, 0.16); color: #ffa39c; }
.lc-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding: 4px; }
.lc-list > * { flex: none; }
.lc-row { align-items: flex-start; }
.lc-row .l-mid b { font-weight: 500; line-height: 1.4; }
.lc-row .l-end { align-self: center; }
.lc-row.still:hover { background: var(--s1); } /* a line with nothing to press doesn't light up */
.lc-ic { flex: none; margin-top: 1px; }
.lc-row.bad .lc-ic { color: #ffa39c; }
.lc-row.warn .lc-ic { color: #ffd978; }
.lc-row.ok .lc-ic { color: var(--green-l); }
.lc-row:focus-visible .lc-ic, :global(.pad-mode .lc-row:focus .lc-ic) { color: var(--on-focus); }
.lc-foot { justify-content: flex-end; gap: var(--s-2); flex-wrap: wrap; }
/* Light: the softer pill colours read on a bright panel */
:global(body.theme-light .lc-mark.bad), :global(body.theme-light .lc-row.bad .lc-ic) { color: #c4302b; }
:global(body.theme-light .lc-mark.ok), :global(body.theme-light .lc-row.ok .lc-ic) { color: #1f7a33; }
:global(body.theme-light .lc-row.warn .lc-ic) { color: #a8750a; }
</style>
