<template>
  <span class="padbtn" :class="'b-' + b.toLowerCase()">{{ b }}</span>
</template>
<script setup>
defineProps({ b: String });
</script>
