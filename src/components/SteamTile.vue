<template>
  <!-- The Steam card in Consoles (0.9.65, owner): Steam's logo where a console's goes, Valve where Sony or Sega goes,
       Steam's colours, the Steam Controller as its picture, Cartridge's own font. It holds recomps, grouped inside by
       the console each game came from. Same build as SysTile, so Plain, Glass, Light and OLED treat it the same way. -->
  <button class="systile steamtile" data-focus data-key="sys-steam" :style="{ '--sys-a': '#2a475e', '--sys-b': '#171a21' }" @click="$emit('open')" @focus="$emit('focused')">
    <div class="sys-clip"><div class="glyph wide"><svg viewBox="0 0 300 200" role="img" aria-label="Steam Controller">
      <defs>
        <linearGradient id="stc-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a5260" /><stop offset="1" stop-color="#1c2027" /></linearGradient>
        <radialGradient id="stc-pad" cx="0.45" cy="0.4" r="0.7"><stop offset="0" stop-color="#2b3039" /><stop offset="1" stop-color="#0d0f13" /></radialGradient>
      </defs>
      <path d="M44 74C42 44 70 30 104 32h92c34-2 62 12 60 42l10 70c4 34-24 48-46 30l-28-24h-84l-28 24c-22 18-50 4-46-30z" fill="url(#stc-body)" stroke="#646c7a" stroke-width="2" />
      <circle cx="98" cy="86" r="34" fill="url(#stc-pad)" stroke="#5a616d" stroke-width="2" />
      <circle cx="202" cy="86" r="34" fill="url(#stc-pad)" stroke="#5a616d" stroke-width="2" />
      <circle cx="98" cy="86" r="16" fill="none" stroke="#3a404b" stroke-width="1.5" />
      <circle cx="202" cy="86" r="16" fill="none" stroke="#3a404b" stroke-width="1.5" />
      <circle cx="122" cy="134" r="14" fill="#171a20" stroke="#5a616d" stroke-width="2" />
      <circle cx="122" cy="134" r="8" fill="#2a2f38" />
      <g fill="#2f3540" stroke="#6d7584" stroke-width="1.2"><circle cx="186" cy="124" r="6" /><circle cx="174" cy="136" r="6" /><circle cx="198" cy="136" r="6" /><circle cx="186" cy="148" r="6" /></g>
      <circle cx="150" cy="60" r="10" fill="#151820" stroke="#66c0f4" stroke-width="2" />
      <circle cx="150" cy="60" r="3.5" fill="#66c0f4" />
    </svg></div></div>
    <div class="sys-top steam-top">
      <svg class="steam-mark" viewBox="0 0 24 24" aria-hidden="true"><path :d="STEAM" /></svg>
      <span class="steam-word">Steam</span>
    </div>
    <div>
      <div class="fam"><svg class="maker" viewBox="0 8.579 24 6.842" aria-label="Valve" role="img"><path :d="VALVE" /></svg><span>·</span><span>Recomps</span></div>
      <div class="ct">{{ count }} {{ count === 1 ? 'recomp' : 'recomps' }}<template v-if="installed"> · <span class="ondev">{{ installed }} installed</span></template></div>
    </div>
  </button>
</template>
<script setup>
// Steam and Valve marks: Simple Icons (CC0 1.0, simpleicons.org), as makers.js uses
defineProps({ count: { type: Number, default: 0 }, installed: { type: Number, default: 0 } });
defineEmits(['open', 'focused']);
const STEAM = 'M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z';
const VALVE = 'M0 8.579v6.842h24V8.58zm1.8 1.415h.793l.776 3.044.76-3.044h.836l-1.227 4.029H3zm5.488 0h1.084l1.145 4.034h-.814l-.27-1.007H7.228s-.21.81-.254.99c-.242.017-.83 0-.83 0zm4.184 0h.792v3.352h1.69v.677h-2.482zm3.45 0h.816l.776 3.005.754-3.005h.815l-1.222 4.034h-.716zm4.828 0h1.69v.522h-1.084v.584h.99v.523h-.99v.6h1.084v.523h-1.69zm-11.902.68l-.426 1.702h.89z';
</script>
<style>
.steamtile .steam-top { gap: 10px; }
.steamtile .steam-mark { height: 30px; width: 30px; fill: #fff; flex: none; }
.steamtile .steam-word { font-family: var(--display); font-weight: 700; font-stretch: var(--display-stretch); font-size: var(--t-lg); line-height: 1; letter-spacing: 0.01em; }
.steamtile .glyph svg { width: 100%; height: 100%; }
.steamtile .maker { height: 1.05em; }
</style>
