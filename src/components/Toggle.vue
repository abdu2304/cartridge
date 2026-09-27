<template>
  <button class="toggle" :class="{ on: modelValue }" data-focus @click="$emit('update:modelValue', !modelValue)">
    <div><div>{{ label }}</div><div v-if="desc" class="desc">{{ desc }}</div></div>
    <span class="sw" />
  </button>
</template>
<script setup>
defineProps({ modelValue: Boolean, label: String, desc: String });
defineEmits(['update:modelValue']);
</script>
