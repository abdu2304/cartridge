<template>
  <div class="scrim" ref="el" @click.self="closeModal(null)">
    <div class="dialog" style="min-width: 460px">
      <h2 v-if="title">{{ title }}</h2>
      <p v-if="message" class="muted" style="margin: 0; line-height: 1.5; white-space: pre-line">{{ message }}</p>
      <div class="menu-list" data-scroll>
        <template v-for="(o, i) in options" :key="i">
          <div v-if="o.heading" class="menu-h">{{ o.heading }}</div>
          <button
            class="menu-item" :class="{ danger: o.danger, selected: o.selected }"
            data-focus :data-autofocus="(o.selected || (i === 0 && !anySelected)) ? '' : undefined" @click="closeModal(o.value)"
          >
            <Icon v-if="o.icon" :name="o.icon" />
            <span>{{ o.label }}</span>
            <span v-if="o.sub" class="sub">{{ o.sub }}</span>
            <Icon v-if="o.selected" name="mdiCheck" style="margin-left: 8px; color: var(--primary-l)" />
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { pushLayer, focusFirst } from '../nav.js';
import { closeModal } from '../store.js';
import Icon from './Icon.vue';

const props = defineProps({ title: String, message: String, options: { type: Array, default: () => [] } });
const anySelected = computed(() => props.options.some((o) => o.selected));
const el = ref(null);
let layer;
onMounted(() => {
  layer = pushLayer(el.value, { back: () => closeModal(null), lb() {}, rb() {}, x() {}, y() {}, select() {}, start() {}, lt() {}, rt() {} });
  focusFirst(el.value);
});
onBeforeUnmount(() => layer.pop());
</script>

<style scoped>
.menu-h { flex: none; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700; color: var(--muted); padding: 10px 12px 2px; }
</style>
