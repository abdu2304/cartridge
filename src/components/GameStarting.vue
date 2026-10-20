<template>
  <!-- A game on its way (0.9.87, owner: the Uncharted port takes a while to open and nothing showed it was starting).
       The game's cover with a light sweeping over it and a running line under its name, until the game is in front.
       B hides it; the game carries on starting either way. -->
  <div class="gs-scrim" :class="st.state" role="status" aria-live="polite">
    <div class="gs-amb" aria-hidden="true"><img v-if="art" :src="art" alt="" /></div>
    <div class="gs">
      <div class="gs-cover" :class="{ none: !art }">
        <img v-if="art" :src="art" alt="" /><Icon v-else name="mdiGamepadVariantOutline" :size="44" />
        <i class="gs-sheen" aria-hidden="true" />
      </div>
      <div class="gs-text">
        <div class="gs-eyebrow">{{ st.state === 'closed' ? 'It Closed' : 'Starting' }}</div>
        <div class="gs-name">{{ st.name }}</div>
        <div class="gs-line" aria-hidden="true"><i /></div>
        <div class="gs-sub">{{ sub }}</div>
      </div>
      <div class="gs-hint"><Btn b="B" /> {{ st.state === 'closed' ? 'Close' : 'Hide' }}</div>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { store, romById, cover } from '../store.js';
import { pushLayer } from '../nav.js';
import Icon from './Icon.vue';
import Btn from './Btn.vue';
const st = computed(() => store.starting || {});
const art = computed(() => { const r = st.value.romId != null && romById(st.value.romId); return r ? cover(r, true) : ''; });
const secs = ref(0);
const sub = computed(() => {
  if (st.value.state === 'closed') return 'It closed before it opened. If it happens again, Settings → Help and About → Report a Problem sends Cartridge’s log.';
  // 0.9.90 (PC playtest: Bloodborne prepares for 35 s with nothing on screen, inFAMOUS for minutes after a new copy, and
  // the owner closed a start that was working): a port says it's preparing and that it should be left to run
  if (st.value.port && secs.value >= 45) return `Still preparing (${secs.value} s). After an update or a new copy of the game, a PC port can take several minutes before its window shows. Leave it running.`;
  if (secs.value >= 45) return `Still on its way (${secs.value} s). Big games can take a few minutes, longer the first time.`;
  if (st.value.state === 'opening') return 'It’s running. Its window shows in a moment.';
  return st.value.port ? 'PC ports prepare the game before their window shows, with nothing on screen for a minute or more. Leave it running.' : 'Getting it ready.';
});
const hide = () => { store.starting = null; };
// how it ends: the game in front (Cartridge goes quiet), or as a last resort after five minutes (ten for a port). In Game Mode a port
// Cartridge started quiets Cartridge the moment it starts (main.js child), before its window shows, so there it waits
// for the port to end instead and stays under it
const ownPort = computed(() => !!(st.value.port && store.info?.gamescope));
let tick, awayT;
watch(() => store.away, (a) => { clearTimeout(awayT); if (a && !ownPort.value) awayT = setTimeout(hide, 400); });
let layer;
onMounted(() => {
  tick = setInterval(() => {
    secs.value = Math.round((Date.now() - (st.value.at || Date.now())) / 1000);
    if (secs.value > (st.value.port ? 600 : 300) && st.value.state !== 'closed') hide(); // a port's first start can pass 5 minutes
  }, 1000);
  const none = () => {};
  layer = pushLayer(document.querySelector('.gs-scrim'), { back: hide, accept: () => { if (st.value.state === 'closed') hide(); }, start: none, select: none, x: none, y: none, lb: none, rb: none, lt: none, rt: none, up: none, down: none, left: none, right: none });
});
onBeforeUnmount(() => { clearInterval(tick); clearTimeout(awayT); layer?.pop(); });
</script>
<style scoped>
.gs-scrim { position: fixed; inset: 0; z-index: 47; display: grid; place-items: center; background: rgba(3, 4, 7, 0.97); animation: fade var(--fade-in); overflow: hidden; }
.gs-amb { position: absolute; inset: -80px; opacity: 0.42; pointer-events: none; }
.gs-amb img { width: 100%; height: 100%; object-fit: cover; filter: blur(56px) saturate(1.35); }
.gs { position: relative; display: flex; flex-direction: column; align-items: center; gap: var(--s-5); width: min(560px, calc(100vw - 32px)); text-align: center; }
/* the cover, breathing slightly, with a soft light passing over it */
.gs-cover { position: relative; width: clamp(150px, 18vw, 240px); aspect-ratio: 3 / 4; border-radius: var(--r-lg); overflow: hidden; display: grid; place-items: center; background: var(--s2); box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55), inset 0 0 0 1px rgba(255, 255, 255, 0.08); animation: gs-breathe 2.8s var(--ease-in-out) infinite; }
.gs-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gs-sheen { position: absolute; inset: 0; background: linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, 0.22) 50%, transparent 65%); transform: translateX(-120%); animation: gs-sweep 2.4s var(--ease-in-out) infinite; pointer-events: none; }
@keyframes gs-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.025); } }
@keyframes gs-sweep { 0% { transform: translateX(-120%); } 60%, 100% { transform: translateX(120%); } }
.gs-text { display: flex; flex-direction: column; align-items: center; gap: var(--s-2); min-width: 0; width: 100%; }
.gs-eyebrow { font-size: var(--t-xs); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.gs-name { font-family: var(--display); font-size: var(--t-xl); font-weight: 700; line-height: 1.2; overflow-wrap: anywhere; }
/* a running line: something is happening, with no made-up percentage */
.gs-line { position: relative; width: min(280px, 70%); height: 3px; border-radius: 2px; overflow: hidden; background: color-mix(in srgb, var(--text) 16%, transparent); margin-top: var(--s-1); }
.gs-line i { position: absolute; top: 0; bottom: 0; width: 38%; border-radius: inherit; background: var(--text); animation: gs-run 2s var(--ease-in-out) infinite; }
@keyframes gs-run { 0% { left: -38%; } 100% { left: 100%; } }
.gs-sub { font-size: var(--t-sm); color: var(--muted); line-height: 1.45; max-width: 46ch; overflow-wrap: anywhere; }
.gs-hint { display: flex; align-items: center; gap: 8px; font-size: var(--t-sm); color: var(--muted); }
.closed .gs-cover, .closed .gs-sheen, .closed .gs-line i { animation: none; }
.closed .gs-sheen { display: none; }
.closed .gs-line i { left: 0; width: 100%; background: var(--red, #ff6b6b); }
/* a port in Game Mode quiets Cartridge (body.away pauses every animation) while this still shows */
:global(body.away .gs-scrim), :global(body.away .gs-scrim *) { animation-play-state: running !important; }
@media (prefers-reduced-motion: reduce) { .gs-cover, .gs-sheen, .gs-line i { animation: none; } .gs-line i { left: 31%; } }
:global(body.motion-reduce .gs-cover), :global(body.motion-reduce .gs-sheen), :global(body.motion-reduce .gs-line i) { animation: none !important; }
:global(body.motion-reduce .gs-line i) { left: 31%; }
/* Light: a bright room, the cover on a soft shadow */
:global(body.theme-light .gs-scrim) { background: rgba(235, 235, 240, 0.97); }
:global(body.theme-light .gs-cover) { box-shadow: 0 22px 50px rgba(20, 20, 40, 0.2), inset 0 0 0 1px rgba(20, 20, 40, 0.08); }
/* Glass: the cover's edge is a glass rim; Plain keeps its solid edge and light from above */
:global(body.elements-glass .gs-cover) { box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5), var(--lg-bevel, inset 0 0 0 1px rgba(255, 255, 255, 0.12)); }
:global(body.style-plain:not(.theme-light):not(.theme-oled) .gs-cover) { box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55), var(--pl-top), var(--pl-edge); }
</style>
