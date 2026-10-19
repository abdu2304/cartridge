<template>
  <div class="sc" :class="['sc-' + phase.k, { small, tiny }]">
    <!-- the scene: sky, sun or moon on its path, stars by night, clouds by day, two lines of hills -->
    <svg class="sc-scene" viewBox="0 0 400 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient :id="uid + 'sky'" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" :stop-color="pal.sky[0]" /><stop offset="0.55" :stop-color="pal.sky[1]" /><stop offset="1" :stop-color="pal.sky[2]" />
        </linearGradient>
        <radialGradient :id="uid + 'glow'"><stop offset="0" :stop-color="pal.glow" stop-opacity="0.55" /><stop offset="1" :stop-color="pal.glow" stop-opacity="0" /></radialGradient>
        <mask :id="uid + 'moon'"><rect width="400" height="200" fill="#fff" /><circle :cx="orb.x + 6" :cy="orb.y - 4" r="11" fill="#000" /></mask>
      </defs>
      <rect width="400" height="200" :fill="`url(#${uid}sky)`" />
      <g v-if="phase.k === 'night'" class="sc-stars"><circle v-for="s in STARS" :key="s.i" :cx="s.x" :cy="s.y" :r="s.r" :style="{ animationDelay: s.d + 's' }" /></g>
      <circle :cx="orb.x" :cy="orb.y" r="60" :fill="`url(#${uid}glow)`" />
      <circle v-if="phase.k !== 'night'" class="sc-sun" :cx="orb.x" :cy="orb.y" r="14" :fill="pal.orb" />
      <circle v-else :cx="orb.x" :cy="orb.y" r="12" :fill="pal.orb" :mask="`url(#${uid}moon)`" />
      <g v-if="phase.k === 'morning' || phase.k === 'afternoon'" class="sc-clouds" fill="#fff">
        <g v-ambient="{ kind: 'cloud', period: 70 }" class="c1"><ellipse cx="80" cy="58" rx="34" ry="9" /><ellipse cx="96" cy="51" rx="18" ry="10" /></g>
        <g v-ambient="{ kind: 'cloud', period: 90, reverse: true }" class="c2"><ellipse cx="270" cy="38" rx="28" ry="7" /><ellipse cx="282" cy="33" rx="14" ry="8" /></g>
      </g>
      <path d="M0,150 C60,118 110,128 160,140 C220,154 260,112 320,118 C360,122 384,134 400,140 L400,200 L0,200 Z" :fill="pal.far" />
      <path d="M0,172 C70,150 120,160 180,170 C240,180 300,150 400,162 L400,200 L0,200 Z" :fill="pal.near" />
    </svg>
    <div class="sc-text">
      <div class="sc-day"><b>{{ phase.name }}</b><span>{{ day }}</span></div>
      <div class="sc-time"><span class="tnum">{{ time }}</span><small v-if="ampm">{{ ampm }}</small></div>
    </div>
  </div>
</template>
<script setup>
// Start's clock (0.9.21, owner: a scene for the time of day, sunrise, afternoon, evening, night, that looks
// beautiful). The location isn't known, so the day runs 6 to 18 and the phases use round hours. Nothing
// here is a picture: the sky, hills, sun, moon, stars and clouds are drawn, so they stay sharp at any size.
import { computed } from 'vue';
import { vAmbient } from '../ambient.js'; // clouds drift at two steps a second (0.9.86)
const props = defineProps({ time: String, ampm: String, day: String, hour: Number, small: Boolean, tiny: Boolean });
const uid = 'sc' + Math.random().toString(36).slice(2, 7);
const PHASES = [
  { k: 'night', name: 'Night', from: 0, sky: ['#060a19', '#0e1736', '#1c2a55'], glow: '#9fb3ff', orb: '#eef1ff', far: '#151d3b', near: '#080b18' },
  { k: 'sunrise', name: 'Sunrise', from: 5, sky: ['#27325e', '#c9787a', '#ffc58e'], glow: '#ffd2a0', orb: '#fff0d6', far: '#6a4a68', near: '#2a1f35' },
  { k: 'morning', name: 'Morning', from: 8, sky: ['#2b67b8', '#6aa6e3', '#b9dcf5'], glow: '#fff6dc', orb: '#fffdf2', far: '#3f6f86', near: '#163044' },
  { k: 'afternoon', name: 'Afternoon', from: 12, sky: ['#1f5aa8', '#5b98da', '#a9d1f1'], glow: '#fff3cf', orb: '#fffbe9', far: '#3a6578', near: '#132a3b' },
  { k: 'evening', name: 'Evening', from: 17, sky: ['#1b2050', '#8b3e6d', '#f39252'], glow: '#ffb070', orb: '#ffd9a8', far: '#572c4e', near: '#1b1325' },
  { k: 'night', name: 'Night', from: 20, sky: ['#060a19', '#0e1736', '#1c2a55'], glow: '#9fb3ff', orb: '#eef1ff', far: '#151d3b', near: '#080b18' },
];
const phase = computed(() => [...PHASES].reverse().find((p) => props.hour >= p.from) || PHASES[0]);
const pal = computed(() => phase.value);
// the sun (6 to 18) or the moon (18 to 6) along an arc over the hills
const orb = computed(() => {
  const h = props.hour, night = h < 6 || h >= 18, p = night ? ((h + 6) % 24) / 12 : (h - 6) / 12;
  return { x: 30 + p * 340, y: 150 - Math.sin(Math.PI * p) * 112 };
});
let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
const STARS = Array.from({ length: 34 }, (_, i) => ({ i, x: rnd() * 400, y: rnd() * 120, r: 0.5 + rnd() * 1.1, d: rnd() * 6 }));
</script>
<style scoped>
.sc { position: absolute; inset: 0; container-type: size; color: #fff; }
.sc-scene { position: absolute; inset: 0; width: 100%; height: 100%; }
.sc-scene stop, .sc-scene path, .sc-scene circle { transition: stop-color var(--fade-ambient), fill var(--fade-ambient), cx var(--fade-ambient), cy var(--fade-ambient); }
.sc-stars circle { fill: #fff; animation: sc-twinkle 5s ease-in-out infinite; }
@keyframes sc-twinkle { 0%, 100% { opacity: 0.9; } 50% { opacity: 0.25; } }
.sc-clouds { opacity: 0.5; }
.sc-clouds .c2 { opacity: 0.7; } /* both drift 24px each way (70 s and 90 s) through v-ambient: an SVG loop repainted the tile every frame */
:global(body.motion-reduce .sc-stars circle), :global(body.motion-reduce .sc-clouds g.c1), :global(body.motion-reduce .sc-clouds g.c2) { animation: none; }
/* without the GPU nothing here moves on its own: a drifting cloud repaints the tile all the time.
   0.9.29: `g.c1`/`g.c2`, as specific as the drift rules; the old `g` lost to them, so the clouds kept
   drifting and Start used about half a CPU core while idle without the GPU */
:global(body.light-fx .sc-stars circle), :global(body.light-fx .sc-clouds g.c1), :global(body.light-fx .sc-clouds g.c2) { animation: none; }
/* words over the scene: the day at the top, the time sitting on the dark hills */
.sc-text { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between; padding: clamp(10px, 9cqh, 22px) clamp(12px, 7cqw, 22px); text-shadow: 0 1px 12px rgba(0, 0, 0, 0.35); }
.sc-day { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 8px; font-size: clamp(11px, 10cqh, 16px); line-height: 1.25; }
.sc-day b { font-weight: 700; }
.sc-day span { opacity: 0.82; font-weight: 500; }
.sc-time { display: flex; align-items: baseline; gap: 6px; font-family: var(--display); line-height: 0.85; }
.sc-time span { font-weight: 300; font-size: clamp(28px, min(46cqh, 26cqw), 150px); letter-spacing: -0.045em; }
.sc-time small { font-weight: 600; font-size: clamp(11px, 10cqh, 22px); opacity: 0.85; letter-spacing: 0.02em; }
@container (max-height: 120px) { .sc-day span { display: none; } }
@container (max-width: 150px) { .sc-day { display: none; } .sc-text { justify-content: flex-end; } .sc-time small { display: none; } }
</style>
