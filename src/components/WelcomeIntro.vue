<template>
  <!-- The opening (0.9.52, owner: "a really nice animation of welcome to Cartridge", on CAE, not jarring). Once, on a new
       install and when the welcome starts over. The mark draws itself, fills, the light behind it blooms, "Welcome to"
       and the name rise letter by letter, then everything lifts away to the first card. Any press skips it. -->
  <div class="wi" ref="root" @pointerdown="$emit('done')">
    <div class="wi-bloom" />
    <div class="wi-lock">
      <svg class="wi-mark" :viewBox="MARK.viewBox" aria-hidden="true">
        <path class="wi-draw" pathLength="1" :d="MARK.d" />
        <path class="wi-fill" fill-rule="evenodd" :d="MARK.d" />
      </svg>
      <div class="wi-eyebrow">Welcome to</div>
      <div class="wi-name" aria-label="Cartridge"><span v-for="(c, i) in 'Cartridge'" :key="i" :style="{ '--i': i }">{{ c }}</span></div>
    </div>
  </div>
</template>
<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { MARK } from '../brand.js';
import { gsap, EASE } from '../gsapEngine.js';
const emit = defineEmits(['done']);
const root = ref(null);
let tl = null;
// the opening as one GSAP timeline (0.9.88: GSAP is the engine; CAE's order and timings)
function play() {
  if (!root.value) return emit('done');
  const q = (s) => root.value.querySelectorAll(s);
  tl = gsap.timeline({ onComplete: () => emit('done') })
    .fromTo(q('.wi-draw'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut' }, 0)
    .fromTo(q('.wi-bloom'), { opacity: 0, scale: 0.55 }, { opacity: 0.55, scale: 1, duration: 1.4, ease: 'power2.out' }, 0.2)
    .fromTo(q('.wi-mark'), { scale: 0.92 }, { scale: 1, duration: 0.5, ease: EASE }, 0.5)
    .fromTo(q('.wi-fill'), { opacity: 0 }, { opacity: 1, duration: 0.42 }, 0.62)
    .fromTo(q('.wi-eyebrow'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: EASE }, 0.9)
    .fromTo(q('.wi-name span'), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, ease: EASE, stagger: 0.035 }, 1.1)
    .to(q('.wi-lock'), { y: -24, scale: 0.97, opacity: 0, duration: 0.5, ease: EASE }, 2.35)
    .to(q('.wi-bloom'), { opacity: 0, duration: 0.42 }, 2.35);
  // reduced motion: the same steps, over at once (the CSS rule that cut animations short doesn't reach GSAP)
  if (document.body.classList.contains('motion-reduce') || matchMedia('(prefers-reduced-motion: reduce)').matches) tl.timeScale(10);
}
onMounted(play);
onBeforeUnmount(() => tl?.kill());
</script>
<style scoped>
/* the start states; the GSAP timeline above moves them (CAE's timings, docs/cae.md): only transform and opacity, and
   the outline's dash, the one drawn line */
.wi { position: absolute; inset: 0; z-index: 5; display: grid; place-items: center; overflow: hidden; background: radial-gradient(70% 60% at 50% 46%, #15171c 0%, #08090c 70%); }
.wi-bloom { position: absolute; left: 50%; top: 44%; width: 720px; height: 720px; margin: -360px 0 0 -360px; border-radius: 50%; background: radial-gradient(closest-side, rgba(239, 75, 35, 0.42), rgba(239, 75, 35, 0.12) 45%, transparent 72%); opacity: 0; transform: scale(0.55); }
.wi-lock { position: relative; display: flex; flex-direction: column; align-items: center; }
.wi-mark { width: 128px; height: 128px; overflow: visible; transform: scale(0.92); }
.wi-draw { fill: none; stroke: var(--brand, #EF4B23); stroke-width: 1.2; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1; }
.wi-fill { fill: var(--brand, #EF4B23); opacity: 0; }
.wi-eyebrow { margin-top: 30px; font: 600 var(--t-md, 18px) / 1 var(--body, Inter, sans-serif); letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255, 255, 255, 0.6); opacity: 0; transform: translateY(10px); }
.wi-name { display: flex; margin-top: 10px; font: 800 clamp(48px, 8vw, 96px) / 1 var(--display, Archivo, sans-serif); font-stretch: 100%; letter-spacing: -0.03em; color: #f4f3ef; }
.wi-name span { display: inline-block; opacity: 0; transform: translateY(18px); }
</style>
