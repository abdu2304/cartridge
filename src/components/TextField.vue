<template>
  <div class="field">
    <label v-if="label">{{ label }}</label>
    <button class="box" data-focus :data-key="fkey" @click="edit">
      <Icon v-if="icon" :name="icon" :size="18" style="color: var(--muted)" />
      <span v-if="modelValue" class="val">{{ password ? '•'.repeat(Math.min(modelValue.length, 16)) : modelValue }}</span>
      <span v-else class="ph">{{ placeholder }}</span>
      <Icon name="mdiPencil" :size="16" style="margin-left: auto; color: var(--dim)" />
    </button>
  </div>
</template>
<script setup>
import { askText } from '../store.js';
import Icon from './Icon.vue';
const props = defineProps({ modelValue: String, label: String, placeholder: String, password: Boolean, mode: String, icon: String, fkey: String });
const emit = defineEmits(['update:modelValue']);
async function edit() {
  const v = await askText({ title: props.label || props.placeholder, value: props.modelValue || '', placeholder: props.placeholder, password: props.password, mode: props.mode });
  if (v !== null && v !== undefined) emit('update:modelValue', v.trim());
}
</script>
