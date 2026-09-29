<template>
  <div class="ct glass">
    <div class="ct-top">
      <Icon name="mdiGamepadVariantOutline" :size="22" />
      <div style="min-width: 0">
        <b>Controller test</b>
        <div class="muted small ct-id">{{ pad ? pad.id : 'No controller seen yet. Press any button.' }}</div>
      </div>
    </div>
    <template v-if="pad">
      <div class="ct-btns">
        <span v-for="b in buttons" :key="b.i" class="ct-b" :class="{ on: b.on }">{{ b.l }}</span>
      </div>
      <div class="ct-bars">
        <div v-for="t in triggers" :key="t.l"><span>{{ t.l }}</span><i><em :style="{ width: t.v * 100 + '%' }" /></i><small>{{ t.v.toFixed(2) }}</small></div>
        <div v-for="a in sticks" :key="a.l"><span>{{ a.l }}</span><i class="mid"><em :style="{ left: (Math.min(a.v, 0) + 1) * 50 + '%', width: Math.abs(a.v) * 50 + '%' }" /></i><small>{{ a.v.toFixed(2) }}</small></div>
      </div>
      <div class="muted small">Mapping: {{ pad.mapping || 'not standard' }} · {{ pad.buttons.length }} buttons · {{ pad.axes.length }} axes</div>
    </template>
    <div class="muted small">Last touch or click came as: <b>{{ pointer || 'nothing yet' }}</b></div>
  </div>
</template>

<script setup>
// Settings → About: live button, trigger and stick values, and how touches arrive (a real touch,
// or a mouse click as Game Mode sometimes sends them). For checking controllers and touch on a device.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { padLive, lastPointer } from '../nav.js';
import Icon from './Icon.vue';

const NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start', 'L3', 'R3', 'Up', 'Down', 'Left', 'Right', 'Guide'];
const snap = ref(null);
const pointer = ref('');
let raf = 0;
const tick = () => {
  const p = padLive.pads[0];
  snap.value = p ? { id: p.id, mapping: p.mapping, buttons: p.buttons.map((b) => ({ pressed: b.pressed, value: b.value })), axes: [...p.axes] } : null;
  pointer.value = { touch: 'a real touch', pen: 'a pen', mouse: 'mouse (touches in Game Mode can arrive this way)' }[lastPointer.type] || '';
  raf = requestAnimationFrame(tick);
};
onMounted(() => { raf = requestAnimationFrame(tick); });
onBeforeUnmount(() => cancelAnimationFrame(raf));
const pad = computed(() => snap.value);
const buttons = computed(() => (pad.value?.buttons || []).map((b, i) => ({ i, l: NAMES[i] || String(i), on: b.pressed || b.value > 0.5 })));
const triggers = computed(() => { const b = pad.value?.buttons || []; return [{ l: 'LT', v: b[6]?.value || 0 }, { l: 'RT', v: b[7]?.value || 0 }]; });
const sticks = computed(() => (pad.value?.axes || []).slice(0, 4).map((v, i) => ({ l: ['Left X', 'Left Y', 'Right X', 'Right Y'][i], v })));
</script>

<style scoped>
.ct { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
.ct-top { display: flex; align-items: center; gap: 12px; }
.ct-top b { font-family: var(--display); font-size: 16px; }
.ct-id { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60vw; }
.small { font-size: 12.5px; }
.ct-btns { display: flex; flex-wrap: wrap; gap: 6px; }
.ct-b { padding: 4px 9px; border-radius: 7px; background: rgba(255, 255, 255, 0.06); font-size: 12px; font-weight: 600; color: var(--muted); min-width: 30px; text-align: center; }
.ct-b.on { background: var(--primary); color: #fff; }
.ct-bars { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px 18px; }
.ct-bars > div { display: grid; grid-template-columns: 58px 1fr 40px; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
.ct-bars i { position: relative; height: 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
.ct-bars em { position: absolute; left: 0; top: 0; bottom: 0; background: var(--primary-l); border-radius: 4px; }
.ct-bars i.mid::after { content: ''; position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: rgba(255, 255, 255, 0.3); }
.ct-bars small { text-align: right; font-variant-numeric: tabular-nums; }
</style>
