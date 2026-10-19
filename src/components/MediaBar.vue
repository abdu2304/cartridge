<template>
  <div class="media" :class="{ empty: !shown, still }">
    <img v-for="(l, i) in layers" :key="i" v-ambient="l.on ? { kind: 'drift', period: 90, delay: 1100 } : null" :src="l.src || undefined" :class="{ on: l.on, blur: l.blur }" decoding="async" alt="" />
  </div>
</template>
<script>
// what the header showed last (0.9.49, owner: going back to Home the media bar flickered for a moment, then settled):
// a page that comes back with the same picture shows it at once, with its scrim, instead of building up from empty
const last = { src: '', blur: false };
</script>
<script setup>
import { reactive, ref, watch } from 'vue';
import { vAmbient } from '../ambient.js'; // the slow drift after it settles (0.9.86: a few steps a second, ambient.js)
// Two stacked images; the next one is decoded off-screen first, then swapped in with a short fade.
// 0.9.23 bug sweep: the layer fading out kept its own picture (it was overwritten mid-fade, so there was
// no crossfade), a picture that fails to load clears the old game's instead of leaving it up, and the
// blurred-cover fallback ({ src, blur }) is shown blurred.
const props = defineProps({ src: [String, Object] });
const want = typeof props.src === 'string' ? props.src : props.src?.src || '';
const again = !!want && want === last.src;
const layers = reactive([{ src: again ? last.src : '', on: again, blur: again && last.blur }, { src: '', on: false, blur: false }]);
const shown = ref(again ? last.src : '');
const still = ref(again); // the picture that was already up: no fade or settle the first time
let idx = 0, token = 0;
watch(() => props.src, async (v) => {
  const my = ++token;
  const src = typeof v === 'string' ? v : v?.src || '', blur = typeof v === 'object' && !!v?.blur;
  const off = () => { layers.forEach((l) => (l.on = false)); shown.value = ''; };
  if (!src) return off();
  if (layers[idx].src === src && layers[idx].on) { layers[idx].blur = blur; return; }
  // 0.9.29 (owner: choppy on handhelds): holding a direction passes a game every 40 to 70 ms; only the one
  // focus rests on is decoded and faded in (the passed ones were replaced before their fade ended anyway)
  if (shown.value) { await new Promise((r) => setTimeout(r, 90)); if (my !== token) return; }
  const im = new Image();
  im.src = src;
  try { await im.decode(); } catch { if (my === token) off(); return; }
  if (my !== token) return; // user already moved on
  const next = 1 - idx;
  layers[next].src = src; layers[next].blur = blur;
  layers[next].on = true;
  layers[idx].on = false;
  idx = next;
  shown.value = src; still.value = false;
  last.src = src; last.blur = blur;
}, { immediate: true });
</script>
<style scoped>
/* 0.9: the hero art runs the full width of the screen; a scrim on the left and at the bottom keeps the
   title readable and fades it into the page (no mask: cheaper without the GPU, same look). 0.9.3 K: also
   a short fade at the top, so no edge shows under the top bar */
.media { position: absolute; inset: 0; pointer-events: none; overflow: hidden; background: var(--s0); }
/* 0.9.49 (owner's photo: a hard line between the screen's edge and the header picture, beside the first card): the
   header faded into a flat page colour, and where the animated background or the theme's vignette isn't that colour,
   its bottom edge showed. Now the header itself fades out at the bottom, into whatever is behind it. */
.media { background: transparent; -webkit-mask-image: linear-gradient(0deg, transparent 0%, #000 38%); mask-image: linear-gradient(0deg, transparent 0%, #000 38%); }
.media::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, color-mix(in srgb, var(--s0) 70%, transparent) 0%, transparent 9%), linear-gradient(90deg, var(--s0) 0%, color-mix(in srgb, var(--s0) 78%, transparent) 24%, color-mix(in srgb, var(--s0) 18%, transparent) 56%, transparent 100%), linear-gradient(0deg, var(--s0) 0%, color-mix(in srgb, var(--s0) 55%, transparent) 30%, transparent 62%); }
/* 0.9.49 (owner: with the Dock at the bottom, no dark fade at the top): the top fade is only there for a top bar */
:global(body:not(.bar-top) .media::after) { background: linear-gradient(90deg, var(--s0) 0%, color-mix(in srgb, var(--s0) 78%, transparent) 24%, color-mix(in srgb, var(--s0) 18%, transparent) 56%, transparent 100%), linear-gradient(0deg, var(--s0) 0%, color-mix(in srgb, var(--s0) 55%, transparent) 30%, transparent 62%); }
.media.empty { background: transparent; }
.media.still img { transition: none; animation: none; }
.media.empty::after { display: none; }
.media img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 30%; opacity: 0; transition: opacity var(--d-med) var(--ease-out); }
/* 0.9.37 (owner: game backgrounds not a still, subtle, never jarring): after it settles, the picture drifts and
   zooms very slowly (60 s each way, a few percent), on its own layer so it's the compositor's work. Only with the
   GPU: without it an endless animation keeps the CPU busy, so there it stays still; never while Cartridge is behind
   a game (body.away pauses all animation) or with reduced motion. */
.media img.on { opacity: 1; animation: media-settle var(--move-slow) both; transform-origin: 62% 38%; }
/* the drift (0.9.49: a pan only, no zoom; 0.8% each way over 90 s) is v-ambient's since 0.9.86: as a CSS loop it had
   Chromium draw every frame, most of a core on a 4K TV at 120 Hz */
:global(body.light-fx .media img.on) { animation: media-settle var(--move-slow) both; }
/* 0.9.19: each new picture settles in from slightly closer, once (a weighted arrival, not a loop) */
@keyframes media-settle { from { transform: scale(1.055) translateX(0.8%); } to { transform: scale(1.03) translateX(0.8%); } } /* 0.9.23: calmer, it changes with every game you pass */
:global(body.motion-reduce .media img.on) { animation: none; }
/* a cover standing in for a missing hero: blurred and dimmed, never a stretched sharp cover */
/* 0.9.29: each picture on its own layer, so the fade is the compositor's work; without it the whole
   header (picture and scrims) was repainted on every frame of every fade, the biggest cost on Home
   without the GPU (measured: about a fifth of the CPU per focus move) */
.media img { will-change: opacity; }
/* without the GPU each frame of the fade recomposites the header: a shorter one (measured: a third less
   CPU per focus move on Home). The GPU keeps the full fade. */
:global(body.light-fx .media img) { transition-duration: var(--d-fast); }
.media img.blur { filter: blur(28px) saturate(1.2) brightness(0.7); inset: -40px; width: calc(100% + 80px); height: calc(100% + 80px); }
.media img.blur.on { animation: none; } /* a blur redrawn every frame of the settle costs too much without the GPU */
:global(body.light-fx .media img.blur) { filter: saturate(1.1) brightness(0.55); }
</style>
