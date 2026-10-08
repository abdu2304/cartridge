<template>
  <div class="scrim" ref="el">
    <form class="dialog prompt" @submit.prevent="done">
      <h2>{{ title }}</h2>
      <div class="prompt-field">
        <input ref="inp" v-model="text" class="prompt-input" data-focus :type="password && !reveal ? 'password' : 'text'" :inputmode="mode === 'url' ? 'url' : 'text'" :placeholder="placeholder" autocomplete="off" autocapitalize="off" spellcheck="false" />
        <button v-if="password" type="button" class="reveal" data-focus @click="reveal = !reveal"><Icon :name="reveal ? 'mdiEyeOff' : 'mdiEye'" :size="20" /></button>
        <button type="button" class="btn small" data-focus style="margin-left: 8px" @click="paste"><Icon name="mdiContentPaste" :size="17" />Paste</button>
      </div>
      <!-- your game names as you type (0.9.61, as on Cartridge's keyboard): A on one fills it in -->
      <div v-if="mode === 'game'" class="prompt-sugg">
        <button v-for="g in suggestions" :key="g.kind + g.v" type="button" class="btn small sg" :class="g.kind" data-focus @click="pick(g)"><Icon v-if="g.kind === 'title'" name="mdiGamepadVariantOutline" :size="15" /><span>{{ g.v }}</span></button>
        <span v-if="!suggestions.length" class="sg-empty">Game names show up here as you type</span>
      </div>
      <p class="prompt-tip"><Icon name="mdiKeyboardOutline" :size="16" />Type with any keyboard. In Game Mode, press <b>Steam + X</b> for the Steam keyboard.</p>
      <div class="prompt-actions">
        <button type="button" class="btn" data-focus @click="closeModal(null)"><Icon name="mdiClose" :size="18" />Cancel</button>
        <button type="submit" class="btn primary" data-focus><Icon name="mdiCheck" :size="18" />Done</button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, nextTick } from 'vue';
import { pushLayer } from '../nav.js';
import { store, closeModal, call } from '../store.js';
import Icon from './Icon.vue';
import { suggest, applySuggestion } from '../gameSuggest.js';

// Plain text prompt. Typing comes from a real keyboard or the Steam keyboard (opened for you in Game Mode since 0.9.17).
const props = defineProps({
  title: { type: String, default: 'Enter text' },
  value: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  password: Boolean,
  mode: { type: String, default: 'text' },
});
const el = ref(null);
const inp = ref(null);
const text = ref(props.value || '');
const reveal = ref(false);
function done() { closeModal(text.value); }
const suggestions = computed(() => (props.mode === 'game' ? suggest(text.value, { titles: 5, words: 3 }) : []));
function pick(g) { text.value = applySuggestion(text.value, g); inp.value?.focus(); }
async function paste() { try { const t = await call('clip:read'); if (t) text.value = t.trim(); } catch {} inp.value?.focus(); }

let layer;
onMounted(async () => {
  layer = pushLayer(el.value, {
    back: () => closeModal(null),
    start: done,
    accept: (a) => (a === inp.value ? done() : false),
    lb: () => {}, rb: () => {}, lt: () => {}, rt: () => {}, select: () => {}, x: () => {}, y: () => {},
  });
  await nextTick();
  inp.value?.focus();
  // 0.9.17: in Game Mode with Steam's keyboard picked, Steam's keyboard comes up by itself (no Steam + X)
  if (store.info?.gamescope) call('steam:keyboard').catch(() => {});
  inp.value?.select();
});
onBeforeUnmount(() => layer?.pop?.());
</script>

<style>
.dialog.prompt { width: min(620px, 92vw); display: flex; flex-direction: column; gap: 14px; }
.prompt-field { position: relative; display: flex; align-items: center; }
.prompt-input { width: 100%; font: inherit; font-size: var(--t-lg); color: var(--text); background: var(--s2); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: var(--r-md); padding: 14px 16px; outline: none; }
.prompt-input:focus { border-color: var(--primary-l); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 45%, transparent); }
.prompt-field .reveal { position: absolute; right: 96px; background: none; border: 0; color: var(--muted); padding: 8px; border-radius: var(--r-sm); }
.prompt-tip { margin: 0; color: var(--muted); font-size: var(--t-sm); display: flex; align-items: center; gap: 8px; }
.prompt-sugg { display: flex; flex-wrap: wrap; gap: 8px; min-height: 40px; align-items: center; }
.prompt-sugg .sg { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; text-align: left; }
.prompt-sugg .sg span { overflow-wrap: anywhere; }
.prompt-sugg .sg-empty { color: var(--dim); font-size: var(--t-sm); padding-left: 4px; }
.prompt-actions { display: flex; justify-content: flex-end; gap: 10px; }
</style>
