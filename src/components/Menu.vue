<template>
  <div class="scrim" :class="{ 'sheet-scrim': isSheet }" ref="el" @click.self="closeModal(null)">
    <div class="dialog" :class="{ sheet: isSheet }" :style="isSheet ? null : 'min-width: 460px'">
      <h2 v-if="title">{{ title }}</h2>
      <p v-if="message" class="muted" style="margin: 0; line-height: 1.5; white-space: pre-line">{{ message }}</p>
      <!-- the shared sheet (0.9.3 K, G4 B): one bottom sheet for secondary things, its groups as tabs (LB/RB) -->
      <div v-if="tabs" class="sheet-tabs"><Btn b="LB" /><div class="seg strip"><button v-for="(t, i) in tabs" :key="t.label" tabindex="-1" :class="{ on: i === cur }" @click="setTab(i)">{{ titleCase(t.label) }}</button></div><Btn b="RB" /></div>
      <div class="menu-list" data-scroll ref="listEl" :key="cur">
        <template v-for="(o, i) in list" :key="i">
          <div v-if="o.heading" class="menu-h">{{ o.heading }}</div>
          <button
            class="menu-item" :class="{ danger: o.danger, selected: o.selected }"
            data-focus data-expand :data-autofocus="(o.selected || (i === 0 && !anySelected)) ? '' : undefined" @click="closeModal(o.value)"
          >
            <img v-if="o.img" :src="o.img" class="menu-img" alt="" />
            <Icon v-else-if="o.icon" :name="o.icon" />
            <span>{{ o.raw ? o.label : titleCase(o.label) }}</span>
            <span v-if="o.sub" class="sub">{{ o.sub }}</span>
            <span v-if="o.selected" class="tick-ok" title="Chosen"><Icon name="mdiCheck" :size="14" /></span>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, nextTick } from 'vue';
import { pushLayer, focusFirst } from '../nav.js';
import { closeModal, titleCase } from '../store.js';
import { sfx } from '../sfx.js';
import Icon from './Icon.vue';
import Btn from './Btn.vue';

// options: one list. tabs: [{ label, options }] shows them as a bottom sheet with tabs; tab picks
// the one it opens on. sheet: a bottom sheet without tabs.
const props = defineProps({ title: String, message: String, options: { type: Array, default: () => [] }, tabs: Array, tab: { type: Number, default: 0 }, sheet: Boolean });
const isSheet = computed(() => props.sheet || !!props.tabs);
const cur = ref(Math.min(props.tab, (props.tabs?.length || 1) - 1));
const list = computed(() => (props.tabs ? props.tabs[cur.value]?.options || [] : props.options));
const anySelected = computed(() => list.value.some((o) => o.selected));
const el = ref(null), listEl = ref(null);
async function setTab(i) {
  if (!props.tabs || i === cur.value) return;
  cur.value = i; sfx.tab();
  await nextTick(); focusFirst(listEl.value);
}
const step = (d) => props.tabs && setTab((cur.value + d + props.tabs.length) % props.tabs.length);
let layer;
onMounted(() => {
  layer = pushLayer(el.value, { back: () => closeModal(null), lb: () => step(-1), rb: () => step(1), x() {}, y() {}, select() {}, start() {}, lt() {}, rt() {} });
  focusFirst(el.value);
});
onBeforeUnmount(() => layer.pop());
</script>

<style scoped>
.menu-img { width: 96px; aspect-ratio: 16 / 9; border-radius: var(--r-sm); object-fit: cover; flex: none; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08); }
.menu-h { flex: none; font-size: var(--t-xs); font-weight: 700; color: var(--muted); padding: 10px 12px 2px; }
.sheet-scrim { place-items: end center; }
.dialog.sheet { width: min(960px, calc(100vw - 32px)); max-width: none; min-width: 0; max-height: 72vh; border-radius: var(--r-lg) var(--r-lg) 0 0; animation: sheet-up var(--d-med, 0.24s) var(--ease); }
.sheet-tabs { display: flex; align-items: center; gap: var(--s-2); min-width: 0; max-width: 100%; }
@keyframes sheet-up { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
</style>
