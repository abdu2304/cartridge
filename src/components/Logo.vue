<template>
  <svg :width="size" :height="size" viewBox="0 0 48 48" aria-hidden="true">
    <defs>
      <linearGradient id="cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b3a4ff" /><stop offset=".55" stop-color="#8b74e8" /><stop offset="1" stop-color="#e1a38d" /></linearGradient>
    </defs>
    <path d="M9 4h22l8 8v30a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="url(#cg)" />
    <rect x="12" y="11" width="21" height="16" rx="2.5" fill="#0d0f18" opacity=".82" />
    <path d="M16 22l4-6 3 4 2-2.5 4 4.5z" fill="#a18fff" />
    <circle cx="27.5" cy="15" r="1.8" fill="#e1a38d" />
    <g fill="#0d0f18" opacity=".55"><rect x="12" y="33" width="3" height="8" rx="1" /><rect x="17" y="33" width="3" height="8" rx="1" /><rect x="22" y="33" width="3" height="8" rx="1" /><rect x="27" y="33" width="3" height="8" rx="1" /><rect x="32" y="33" width="3" height="8" rx="1" /></g>
  </svg>
</template>
<script setup>
defineProps({ size: { type: Number, default: 30 } });
</script>
