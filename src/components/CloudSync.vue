<template>
  <!-- Cartridge Cloud Sync (0.9.51, owner: like Steam Cloud's sync before a game; 0.9.57, owner: the old ring and cloud
       icon looked bad, redesign it entirely). The game's cover on this device, your RomM server on the other side, and
       the save travelling between them the way it is really going: up to RomM, down to here, or both ways while it
       checks. When it's done the line fills and a tick lands in the middle. -->
  <div class="cs-scrim" :class="st.state">
    <div class="cs-amb" aria-hidden="true"><img v-if="art" :src="art" alt="" /></div>
    <div class="dialog cs" role="status" aria-live="polite">
      <div class="cs-eyebrow">Cartridge Cloud Sync</div>
      <div class="cs-route" :class="[st.state, dir]" aria-hidden="true">
        <!-- this device: the game itself -->
        <div class="cs-end cs-here">
          <div class="cs-cover"><img v-if="art" :src="art" alt="" /><Icon v-else name="mdiGamepadVariantOutline" :size="30" /></div>
          <span class="cs-cap">This Device</span>
        </div>
        <div class="cs-line">
          <i class="cs-rail" /><i class="cs-fill" />
          <i class="cs-pip" /><i class="cs-pip cs-pip2" />
          <span class="cs-knot">
            <svg viewBox="0 0 24 24"><path class="cs-tick" d="M6 12.5l4 4 8-9" pathLength="1" /><path class="cs-cross" d="M8 8l8 8M16 8l-8 8" pathLength="1" /><path class="cs-fork" d="M12 19v-6l-5-6M12 13l5-6" pathLength="1" /></svg>
          </span>
        </div>
        <!-- your server: a small stack of drives, drawn rather than an icon set's cloud -->
        <div class="cs-end cs-there">
          <div class="cs-server">
            <svg viewBox="0 0 40 40"><rect x="7" y="7" width="26" height="8" rx="2.5" /><rect x="7" y="16.5" width="26" height="8" rx="2.5" /><rect x="7" y="26" width="26" height="8" rx="2.5" /><circle class="cs-led" cx="12" cy="11" r="1.4" /><circle class="cs-led" cx="12" cy="20.5" r="1.4" /><circle class="cs-led" cx="12" cy="30" r="1.4" /></svg>
          </div>
          <span class="cs-cap">RomM</span>
        </div>
      </div>
      <div class="cs-text">
        <div class="cs-label">{{ st.label }}</div>
        <div v-if="st.game" class="cs-game">{{ st.game }}</div>
      </div>
      <div v-if="st.of > 1 && st.state === 'check'" class="cs-count">{{ st.done }} of {{ st.of }}</div>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue';
import { store, romById, cover } from '../store.js';
import { pushLayer } from '../nav.js';
import Icon from './Icon.vue';
const st = computed(() => store.cloudSync || {});
const art = computed(() => { const r = st.value.romId && romById(st.value.romId); return r ? cover(r) : ''; });
// which way the save is going: 'down' to this device, 'up' to RomM, else both ways (checking)
const dir = computed(() => st.value.dir || (st.value.state === 'check' ? 'both' : ''));
// while it checks, presses wait (a conflict's question opens over it with its own layer)
let layer;
const none = () => {};
onMounted(() => { layer = pushLayer(document.querySelector('.cs-scrim'), { back: none, accept: none, start: none, select: none, x: none, y: none, lb: none, rb: none, lt: none, rt: none, up: none, down: none, left: none, right: none }); });
onBeforeUnmount(() => layer?.pop());
</script>
<style scoped>
.cs-scrim { position: fixed; inset: 0; z-index: 46; display: grid; place-items: center; background: rgba(3, 4, 7, 0.62); animation: fade var(--fade-in); overflow: hidden; }
/* the game's cover, blurred, as the room the pop-up sits in */
.cs-amb { position: absolute; inset: -60px; opacity: 0.38; pointer-events: none; }
.cs-amb img { width: 100%; height: 100%; object-fit: cover; filter: blur(48px) saturate(1.3); }
.cs { position: relative; width: min(520px, calc(100vw - 32px)); display: flex; flex-direction: column; align-items: center; gap: var(--s-4); padding: var(--s-5) var(--s-5) var(--s-4); text-align: center; }
.cs-eyebrow { font-size: var(--t-xs); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }

.cs-route { width: 100%; display: grid; grid-template-columns: 96px minmax(0, 1fr) 96px; align-items: start; gap: var(--s-2); }
.cs-end { display: grid; grid-template-rows: 96px auto; justify-items: center; align-items: center; gap: 8px; }
.cs-cap { font-size: var(--t-xs); color: var(--muted); font-weight: 600; }
.cs-cover { width: 72px; aspect-ratio: 3 / 4; border-radius: var(--r-md); overflow: hidden; display: grid; place-items: center; background: var(--s2); box-shadow: 0 10px 26px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.08); }
.cs-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cs-server { width: 72px; height: 72px; border-radius: var(--r-lg); display: grid; place-items: center; background: var(--s2); box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.08); }
.cs-server svg { width: 40px; height: 40px; }
.cs-server rect { fill: none; stroke: var(--text); stroke-width: 1.6; opacity: 0.85; }
.cs-led { fill: var(--muted); }
.cs-route.check .cs-led { animation: cs-blink var(--loop-pulse) infinite; }
.cs-route.check .cs-led:nth-of-type(2) { animation-delay: 0.2s; }
.cs-route.check .cs-led:nth-of-type(3) { animation-delay: 0.4s; }
.cs-route.done .cs-led { fill: var(--green); }
@keyframes cs-blink { 0%, 100% { fill: var(--muted); } 50% { fill: var(--green); } }

/* the line between them: a faint rail, a fill that completes when it's done, and the save travelling along it */
.cs-line { position: relative; height: 96px; /* the same height as the pictures' row: the line runs through their middles */ }
.cs-rail, .cs-fill { position: absolute; left: 0; right: 0; top: 50%; height: 2px; margin-top: -1px; border-radius: 1px; }
.cs-rail { background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--text) 26%, transparent) 0 6px, transparent 6px 11px); }
.cs-fill { background: var(--green); transform: scaleX(0); transform-origin: left; transition: transform var(--move-slow); }
.cs-route.up .cs-fill { transform-origin: left; }
.cs-route.down .cs-fill { transform-origin: right; }
.cs-route.done .cs-fill { transform: scaleX(1); }
.cs-pip { position: absolute; top: 50%; left: 0; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: var(--text); box-shadow: 0 0 0 4px color-mix(in srgb, var(--text) 14%, transparent); opacity: 0; }
.cs-route.check .cs-pip { animation: cs-up 2.2s var(--ease-in-out) infinite; opacity: 1; }
.cs-route.check.down .cs-pip { animation-name: cs-down; }
.cs-route.check.both .cs-pip2 { animation-name: cs-down; animation-delay: 1.1s; }
.cs-route.check:not(.both) .cs-pip2 { display: none; }
@keyframes cs-up { 0% { left: 0; opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { left: 100%; opacity: 0; } }
@keyframes cs-down { 0% { left: 100%; opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { left: 0; opacity: 0; } }
/* the knot in the middle: a tick when it's done, a break when RomM is out of reach, a fork for a conflict */
.cs-knot { position: absolute; left: 50%; top: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px; border-radius: 50%; display: grid; place-items: center; background: var(--s1); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--text) 20%, transparent); opacity: 0; transform: scale(0.6); transition: opacity var(--fade-in), transform var(--spring-pop-d, var(--spring-d)) var(--spring-pop, var(--spring)), background var(--tint); }
.cs-knot svg { width: 18px; height: 18px; }
.cs-knot path { fill: none; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1; display: none; }
.cs-route:is(.done, .offline, .error, .conflict) .cs-knot { opacity: 1; transform: none; }
.cs-route.done .cs-knot { background: var(--green); box-shadow: none; }
.cs-route.done .cs-tick { display: block; stroke: #fff; animation: cs-draw var(--fade-slow) 0.12s forwards; }
.cs-route:is(.offline, .error) .cs-cross { display: block; stroke: var(--text); animation: cs-draw var(--fade-slow) forwards; }
.cs-route.conflict .cs-fork { display: block; stroke: var(--gold, #e7b84a); animation: cs-draw var(--fade-slow) forwards; }
.cs-route:is(.offline, .error) .cs-rail { opacity: 0.45; }
@keyframes cs-draw { to { stroke-dashoffset: 0; } }

.cs-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.cs-label { font-family: var(--display); font-size: var(--t-lg); font-weight: 700; line-height: 1.25; overflow-wrap: anywhere; }
.cs-game { font-size: var(--t-sm); color: var(--muted); overflow-wrap: anywhere; }
.cs-count { font-size: var(--t-xs); color: var(--muted); font-variant-numeric: tabular-nums; }

@media (prefers-reduced-motion: reduce) { .cs-route.check .cs-pip, .cs-route.check .cs-led { animation: none; } .cs-route.check .cs-pip:not(.cs-pip2) { left: 50%; opacity: 1; } }
:global(body.motion-reduce .cs-route.check .cs-pip), :global(body.motion-reduce .cs-route.check .cs-led) { animation: none; }
:global(body.motion-reduce .cs-route.check .cs-pip:not(.cs-pip2)) { left: 50%; opacity: 1; }
/* Light: the room is bright, pictures sit on white */
:global(body.theme-light .cs-scrim) { background: rgba(235, 235, 240, 0.6); }
:global(body.theme-light .cs-cover), :global(body.theme-light .cs-server) { box-shadow: 0 10px 24px rgba(20, 20, 40, 0.16), inset 0 0 0 1px rgba(20, 20, 40, 0.08); }
/* Glass: the two ends are hairline glass on the sheet; Plain keeps solid tiles with its edge and top light */
:global(body.elements-glass .cs-server) { background: rgba(255, 255, 255, 0.05); box-shadow: var(--lg-bevel, none), inset 0 0 0 1px rgba(255, 255, 255, 0.1); }
:global(body.elements-glass .cs-knot) { background: var(--lg-ob, var(--s1)); }
:global(body.style-plain:not(.theme-light):not(.theme-oled) .cs-server) { box-shadow: var(--pl-top), var(--pl-edge); }
</style>
