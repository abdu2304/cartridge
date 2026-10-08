<template>
  <div class="scrim" ref="el" @click.self="closeModal(null)">
    <!-- 0.9.49 (owner: the colour picker should feel much more premium): a live preview of Cartridge in the colour on
         one side, the colour itself on the other as three sliders (hue, vividness, brightness) that work with the D-pad,
         touch and mouse, then suggested colours. Same result as before: one colour the whole theme is built from. -->
    <div class="dialog cp">
      <div class="cp-head">
        <h2>{{ title || 'Custom Colour' }}</h2>
        <p class="muted cp-note">{{ note || 'Cartridge builds the whole theme from it: highlights, buttons and the background.' }}</p>
      </div>
      <div class="cp-body">
        <div class="cp-prev" :style="{ background: `radial-gradient(120% 90% at 20% 0%, ${t.grad[0]}, transparent 55%), linear-gradient(160deg, ${t.grad[1]}, ${t.grad[3]} 55%, ${t.grad[4]})` }" aria-hidden="true">
          <div class="pv-card" :style="{ background: `linear-gradient(145deg, ${t.accent[1]}, ${t.accent[2]})` }"><i /></div>
          <div class="pv-lines"><b /><span /><span class="short" /></div>
          <div class="pv-row">
            <span class="pv-btn" :style="{ background: t.accent[0], color: ink }">Play</span>
            <span class="pv-tog" :style="{ background: t.accent[0] }"><i /></span>
          </div>
          <div class="pv-dock"><span class="pv-tab" :style="{ background: t.accent[0], color: ink }" /><span /><span /><span /><span /></div>
          <span class="pv-hex">{{ cur.toUpperCase() }}</span>
        </div>
        <div class="cp-side">
          <div v-for="s in SLIDERS" :key="s.k" class="cp-sl">
            <div class="cp-sl-top"><span>{{ s.label }}</span><b>{{ s.show(hsv[s.k]) }}</b></div>
            <div class="cp-track" role="slider" tabindex="0" data-focus data-nodrag :aria-label="s.label" :aria-valuenow="Math.round(hsv[s.k])" :aria-valuemin="s.min" :aria-valuemax="s.max" :data-k="s.k"
              :style="{ background: trackOf(s.k) }" @pointerdown="grab($event, s)">
              <i class="cp-knob" :style="{ left: ((hsv[s.k] - s.min) / (s.max - s.min)) * 100 + '%', background: cur }" />
            </div>
          </div>
          <div class="cp-sub">Suggested</div>
          <div class="cp-grid">
            <button v-for="c in SUGGESTED" :key="c" class="cp-sw" data-focus :class="{ on: c === cur }" :style="{ background: c }" :aria-label="c" @click="set(c)" @dblclick="closeModal(c)" />
            <label class="cp-sw cp-any" title="Any colour"><input type="color" :value="cur" @input="(e) => set(e.target.value)" /><Icon name="mdiEyedropperVariant" :size="16" /></label>
          </div>
        </div>
      </div>
      <div class="cp-act">
        <span class="muted cp-hint">Left and right change the slider you are on</span>
        <div class="spacer" />
        <button v-if="allowReset" class="btn" data-focus @click="closeModal('__theme')"><Icon name="mdiRestore" />Use Theme</button>
        <button class="btn" data-focus @click="closeModal(null)">Cancel</button>
        <button class="btn primary" data-focus @click="closeModal(cur)"><Icon name="mdiCheck" />Use Colour</button>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue';
import { pushLayer, focusFirst } from '../nav.js';
import { closeModal } from '../store.js';
import { themeFrom, hsl, rgb2hsl, hex2rgb } from '../themes.js';
import Icon from './Icon.vue';

const props = defineProps({ value: String, title: String, note: String, allowReset: Boolean });
const el = ref(null);
const start = /^#[0-9a-f]{6}$/i.test(props.value || '') ? props.value.toLowerCase() : '#8b74e8';
// a white or grey start (Cartridge's own theme is white) gives no hue to work from: start from a real colour instead
const [h0, s0, l0] = rgb2hsl(...hex2rgb(start)), grey = s0 < 0.08;
// hue in degrees, vividness (saturation) and brightness (lightness) in percent, kept inside the sliders' ranges
const hsv = reactive({ h: grey ? 258 : Math.round(h0), s: grey ? 72 : Math.round(s0 * 100), l: grey ? 58 : Math.max(20, Math.min(92, Math.round(l0 * 100))) });
const cur = computed(() => hsl(hsv.h, hsv.s / 100, hsv.l / 100));
const t = computed(() => themeFrom(cur.value));
// text on the accent: dark on a light colour, white on a dark one
const ink = computed(() => { const [r, g, b] = hex2rgb(t.value.accent[0]); return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? '#141418' : '#fff'; });
const SLIDERS = [
  { k: 'h', label: 'Hue', min: 0, max: 359, step: 6, show: (v) => `${Math.round(v)}°` },
  { k: 's', label: 'Vividness', min: 0, max: 100, step: 4, show: (v) => `${Math.round(v)}%` },
  { k: 'l', label: 'Brightness', min: 20, max: 92, step: 3, show: (v) => `${Math.round(v)}%` },
];
const trackOf = (k) => k === 'h'
  ? `linear-gradient(90deg, ${[0, 60, 120, 180, 240, 300, 360].map((d) => hsl(d, Math.max(0.35, hsv.s / 100), 0.55)).join(', ')})`
  : k === 's' ? `linear-gradient(90deg, ${hsl(hsv.h, 0, hsv.l / 100)}, ${hsl(hsv.h, 1, hsv.l / 100)})`
  : `linear-gradient(90deg, ${hsl(hsv.h, hsv.s / 100, 0.2)}, ${hsl(hsv.h, hsv.s / 100, 0.52)}, ${hsl(hsv.h, hsv.s / 100, 0.85)})`;
// a curated set: twelve hues at a rich and a soft shade, then neutrals
const SUGGESTED = [...[0, 18, 36, 50, 95, 145, 172, 195, 212, 232, 262, 292, 322, 345].map((h) => hsl(h, 0.72, 0.58)), ...[0, 36, 145, 212, 262, 322].map((h) => hsl(h, 0.42, 0.72)), '#e6e8ee', '#9aa3b2', '#5a6273'];
function set(hex) { const [h, s, l] = rgb2hsl(...hex2rgb(hex)); hsv.h = Math.round(h); hsv.s = Math.round(s * 100); hsv.l = Math.max(20, Math.min(92, Math.round(l * 100))); }
const clamp = (s, v) => Math.max(s.min, Math.min(s.max, v));
function grab(e, s) {
  const track = e.currentTarget, r = track.getBoundingClientRect();
  const to = (x) => { hsv[s.k] = Math.round(clamp(s, s.min + ((x - r.left) / r.width) * (s.max - s.min))); };
  to(e.clientX); track.setPointerCapture?.(e.pointerId);
  const mv = (ev) => to(ev.clientX), up = () => { track.removeEventListener('pointermove', mv); track.removeEventListener('pointerup', up); track.removeEventListener('pointercancel', up); };
  track.addEventListener('pointermove', mv); track.addEventListener('pointerup', up); track.addEventListener('pointercancel', up);
}
// the D-pad changes the focused slider (hue wraps round); anywhere else it moves as usual
function nudge(dir) {
  const k = document.activeElement?.dataset?.k, s = SLIDERS.find((x) => x.k === k);
  if (!s) return false;
  hsv[k] = k === 'h' ? (hsv.h + dir * s.step + 360) % 360 : clamp(s, hsv[k] + dir * s.step);
}
let layer;
onMounted(() => {
  layer = pushLayer(el.value, { back: () => closeModal(null), start: () => closeModal(cur.value), left: () => nudge(-1), right: () => nudge(1), lb() {}, rb() {}, x() {}, y() {}, select() {}, lt() {}, rt() {} });
  focusFirst(el.value, '.cp-track');
});
onBeforeUnmount(() => layer?.pop());
</script>
<style scoped>
.cp { width: min(920px, 94vw); gap: var(--s-4); }
.cp-head { display: flex; flex-direction: column; gap: 4px; }
.cp-note { margin: 0; font-size: var(--t-sm); }
.cp-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: var(--s-5); align-items: start; }
@media (max-width: 900px) { .cp-body { grid-template-columns: minmax(0, 1fr); } .cp-prev { min-height: 200px; } }

/* the preview: a small Cartridge in the colour */
.cp-prev { position: relative; min-height: 290px; height: 100%; border-radius: var(--r-lg); overflow: hidden; padding: var(--s-4); display: flex; flex-direction: column; gap: 12px; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.12); transition: background var(--tint); }
.pv-card { width: 34%; aspect-ratio: 3 / 4; border-radius: 10px; box-shadow: 0 0 0 2px #fff, 0 12px 26px -10px rgba(0, 0, 0, 0.6); position: relative; overflow: hidden; }
.pv-card i { position: absolute; inset: 0; background: linear-gradient(170deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0) 45%); }
.pv-lines { display: flex; flex-direction: column; gap: 6px; }
.pv-lines b, .pv-lines span { display: block; height: 9px; border-radius: 5px; background: rgba(255, 255, 255, 0.85); width: 62%; }
.pv-lines span { height: 6px; background: rgba(255, 255, 255, 0.4); width: 80%; }
.pv-lines span.short { width: 48%; }
.pv-row { display: flex; align-items: center; gap: 12px; }
.pv-btn { padding: 6px 16px; border-radius: 999px; font-size: var(--t-xs); font-weight: 700; box-shadow: 0 6px 16px -6px rgba(0, 0, 0, 0.5); }
.pv-tog { width: 38px; height: 22px; border-radius: 11px; position: relative; }
.pv-tog i { position: absolute; top: 3px; right: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; }
.pv-dock { margin-top: auto; align-self: center; display: flex; gap: 8px; padding: 6px; border-radius: 999px; background: rgba(8, 9, 12, 0.55); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1); }
.pv-dock span { width: 20px; height: 20px; border-radius: 50%; background: rgba(255, 255, 255, 0.25); }
.pv-dock .pv-tab { width: 46px; border-radius: 10px; }
.pv-hex { position: absolute; top: var(--s-3); right: var(--s-3); font-family: ui-monospace, monospace; font-size: var(--t-xs); font-weight: 600; padding: 3px 8px; border-radius: 6px; background: rgba(0, 0, 0, 0.35); color: #fff; }

/* the sliders */
.cp-side { display: flex; flex-direction: column; gap: var(--s-3); min-width: 0; }
.cp-sl { display: flex; flex-direction: column; gap: 8px; }
.cp-sl-top { display: flex; justify-content: space-between; font-size: var(--t-sm); font-weight: 600; }
.cp-sl-top b { font-variant-numeric: tabular-nums; color: var(--muted); font-weight: 600; }
.cp-track { position: relative; height: 30px; border-radius: 15px; cursor: pointer; touch-action: none; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12), inset 0 2px 4px rgba(0, 0, 0, 0.25); outline: none; }
.cp-knob { position: absolute; top: 50%; width: 26px; height: 26px; border-radius: 50%; translate: -50% -50%; box-shadow: 0 0 0 3px #fff, 0 3px 10px rgba(0, 0, 0, 0.45); transition: scale var(--spring-snappy-d) var(--spring-snappy); pointer-events: none; }
.cp-track:focus-visible, .pad-mode .cp-track:focus { box-shadow: 0 0 0 3px var(--s1), 0 0 0 5px var(--focus-solid, var(--focus)); }
.cp-track:focus .cp-knob { scale: 1.15; }
.cp-sub { font-size: var(--t-sm); font-weight: 600; margin-top: var(--s-1); }
.cp-grid { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 8px; }
.cp-sw { aspect-ratio: 1; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18); transition: transform var(--spring-snappy-d) var(--spring-snappy); display: grid; place-items: center; }
.cp-sw:focus-visible, .pad-mode .cp-sw:focus { transform: scale(1.12); box-shadow: 0 0 0 3px var(--s1), 0 0 0 5px var(--focus-solid, var(--focus)); z-index: 1; }
.cp-sw.on { box-shadow: 0 0 0 2px var(--s1), 0 0 0 4px var(--text); }
.cp-any { position: relative; cursor: pointer; background: conic-gradient(from 90deg, #f55, #fd5, #5f8, #5df, #85f, #f5c, #f55); color: #fff; }
.cp-any input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.cp-act { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.cp-act .spacer { flex: 1; }
.cp-hint { display: inline-flex; align-items: center; gap: 8px; font-size: var(--t-xs); }
body:not(.pad-mode) .cp-hint { display: none; }
@media (prefers-reduced-motion: reduce) { .cp-prev { transition: none; } }
</style>
