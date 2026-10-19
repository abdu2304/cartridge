<template>
  <!-- The Steam card in Consoles (0.9.65, owner): Steam's logo where a console's goes, Valve where Sony or Sega goes,
       Steam's colours, the Steam Controller as its picture, Cartridge's own font. It holds PC ports (0.9.85: named so,
       laid out like a console). Same build as SysTile, so Plain, Glass, Light and OLED treat it the same way. -->
  <button class="systile steamtile" data-focus data-key="sys-steam" :style="{ '--sys-a': '#1a9fff', '--sys-b': '#1b2a63' }" @click="$emit('open')" @focus="$emit('focused')">
    <div class="sys-clip"><div class="glyph wide"><svg viewBox="0 0 300 200" role="img" aria-label="Steam Controller">
      <!-- 0.9.68 (owner: "looks like shit and not like others"): drawn filled and lit like RomM's console pictures, a white
           Steam Controller with shaded grips, two round trackpads, stick, face buttons and the Steam button -->
      <defs>
        <linearGradient id="stc-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" /><stop offset="0.55" stop-color="#e9edf2" /><stop offset="1" stop-color="#b9c1cc" /></linearGradient>
        <linearGradient id="stc-edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.9" /><stop offset="1" stop-color="#8d96a3" stop-opacity="0.6" /></linearGradient>
        <radialGradient id="stc-pad" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="#d6dbe2" /><stop offset="0.7" stop-color="#b3bbc6" /><stop offset="1" stop-color="#959eab" /></radialGradient>
        <radialGradient id="stc-btn" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#5b6370" /><stop offset="1" stop-color="#262a31" /></radialGradient>
        <radialGradient id="stc-shade" cx="0.5" cy="0.15" r="0.9"><stop offset="0.55" stop-color="#000" stop-opacity="0" /><stop offset="1" stop-color="#1c2b4a" stop-opacity="0.35" /></radialGradient>
      </defs>
      <path d="M58 58C64 40 86 32 110 34h80c24-2 46 6 52 24l22 92c6 26-12 42-32 36-12-4-20-14-28-26l-14-20h-80l-14 20c-8 12-16 22-28 26-20 6-38-10-32-36z" fill="url(#stc-body)" />
      <path d="M58 58C64 40 86 32 110 34h80c24-2 46 6 52 24l22 92c6 26-12 42-32 36-12-4-20-14-28-26l-14-20h-80l-14 20c-8 12-16 22-28 26-20 6-38-10-32-36z" fill="url(#stc-shade)" stroke="url(#stc-edge)" stroke-width="2" />
      <circle cx="104" cy="82" r="33" fill="#8c95a2" opacity="0.5" />
      <circle cx="104" cy="81" r="30" fill="url(#stc-pad)" />
      <circle cx="104" cy="81" r="19" fill="none" stroke="#a2abb7" stroke-width="1.2" />
      <path d="M104 70v22M93 81h22" stroke="#9aa3af" stroke-width="3" stroke-linecap="round" />
      <circle cx="196" cy="82" r="33" fill="#8c95a2" opacity="0.5" />
      <circle cx="196" cy="81" r="30" fill="url(#stc-pad)" />
      <circle cx="196" cy="81" r="19" fill="none" stroke="#a2abb7" stroke-width="1.2" />
      <circle cx="120" cy="122" r="14" fill="#a6aeba" />
      <circle cx="120" cy="121" r="11" fill="url(#stc-btn)" />
      <circle cx="120" cy="121" r="5.5" fill="#3a404a" stroke="#6b7380" stroke-width="1" />
      <g fill="url(#stc-btn)"><circle cx="181" cy="108" r="6" /><circle cx="171" cy="118" r="6" /><circle cx="191" cy="118" r="6" /><circle cx="181" cy="128" r="6" /></g>
      <g fill="#ffffff" opacity="0.35"><circle cx="179.3" cy="106.3" r="1.8" /><circle cx="169.3" cy="116.3" r="1.8" /><circle cx="189.3" cy="116.3" r="1.8" /><circle cx="179.3" cy="126.3" r="1.8" /></g>
      <path d="M134 60l-7 5 7 5zM166 60l7 5-7 5z" fill="#6b7380" />
      <circle cx="150" cy="65" r="10" fill="#2c323b" />
      <circle cx="150" cy="65" r="7.5" fill="none" stroke="#66c0f4" stroke-width="1.6" />
      <circle cx="152.5" cy="62.5" r="2.4" fill="#66c0f4" />
      <circle cx="146.5" cy="68.5" r="1.6" fill="#66c0f4" />
    </svg></div></div>
    <div class="sys-top steam-top">
      <svg class="steam-mark" viewBox="0 0 24 24" aria-hidden="true"><path :d="STEAM" /></svg>
      <span class="steam-word">Steam</span>
    </div>
    <div>
      <div class="fam"><svg class="maker" viewBox="0 8.579 24 6.842" aria-label="Valve" role="img"><path :d="VALVE" /></svg><span>·</span><span>PC Ports</span></div>
      <div class="ct"><template v-if="count">{{ count }} {{ count === 1 ? 'port' : 'ports' }}<template v-if="ready"> · <span class="ondev">{{ ready }} ready</span></template></template><template v-else>None installed yet</template></div>
    </div>
  </button>
</template>
<script setup>
// Steam and Valve marks: Simple Icons (CC0 1.0, simpleicons.org), as makers.js uses
defineProps({ count: { type: Number, default: 0 }, ready: { type: Number, default: 0 } }); // installed ports, and how many are ready (0.9.85)
defineEmits(['open', 'focused']);
import { STEAM } from '../steamLogo.js';
const VALVE = 'M0 8.579v6.842h24V8.58zm1.8 1.415h.793l.776 3.044.76-3.044h.836l-1.227 4.029H3zm5.488 0h1.084l1.145 4.034h-.814l-.27-1.007H7.228s-.21.81-.254.99c-.242.017-.83 0-.83 0zm4.184 0h.792v3.352h1.69v.677h-2.482zm3.45 0h.816l.776 3.005.754-3.005h.815l-1.222 4.034h-.716zm4.828 0h1.69v.522h-1.084v.584h.99v.523h-.99v.6h1.084v.523h-1.69zm-11.902.68l-.426 1.702h.89z';
</script>
<style>
.steamtile .steam-top { gap: 10px; }
.steamtile .steam-mark { height: 30px; width: 30px; fill: #fff; flex: none; }
.steamtile .steam-word { font-family: var(--display); font-weight: 700; font-stretch: var(--display-stretch); font-size: var(--t-lg); line-height: 1; letter-spacing: 0.01em; }
.steamtile .glyph svg { width: 100%; height: 100%; }
.steamtile .maker { height: 1.05em; }
</style>
