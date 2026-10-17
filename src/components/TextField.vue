<template>
  <div class="field">
    <label v-if="label">{{ label }}</label>
    <div class="box input-box" @click="inp?.focus()">
      <Icon v-if="icon" :name="icon" :size="18" style="color: var(--muted)" />
      <input ref="inp" class="tf-input" data-focus :data-key="fkey" :value="modelValue" :readonly="osk" :type="password && !reveal ? 'password' : 'text'" :inputmode="mode === 'url' ? 'url' : 'text'" :placeholder="placeholder" autocomplete="off" autocapitalize="off" spellcheck="false" @click="openOsk" @input="(e) => emit('update:modelValue', e.target.value)" @change="(e) => emit('update:modelValue', e.target.value.trim())" />
      <button v-if="password" type="button" class="tf-reveal" tabindex="-1" :aria-label="reveal ? 'Hide' : 'Show'" @click.stop="reveal = !reveal"><Icon :name="reveal ? 'mdiEyeOff' : 'mdiEye'" :size="18" /></button>
      <button type="button" class="tf-paste" data-focus title="Paste" @click.stop="paste"><Icon name="mdiContentPaste" :size="17" /><span>Paste</span></button>
    </div>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import { builtinKb, askText, call, toast } from '../store.js';
// A real text input. Type with any keyboard, the Steam keyboard (Steam + X), or the built-in
// on-screen keyboard (Auto in Game Mode). Paste fills it from the clipboard, handy for API keys.
const props = defineProps({ modelValue: String, label: String, placeholder: String, password: Boolean, mode: String, icon: String, fkey: String });
const emit = defineEmits(['update:modelValue']);
const inp = ref(null);
const reveal = ref(false);
const osk = computed(() => builtinKb());
async function openOsk() {
  if (!osk.value) return;
  const v = await askText({ title: props.label || props.placeholder || 'Enter text', value: props.modelValue || '', placeholder: props.placeholder, password: props.password, mode: props.mode });
  if (v != null) emit('update:modelValue', v.trim());
  inp.value?.focus({ preventScroll: true });
}
async function paste() {
  try {
    const t = await call('clip:read');
    if (!t) { toast('The clipboard is empty', 'info', 2000, 'mdiContentPaste'); return; }
    emit('update:modelValue', t.trim());
  } catch {}
}
</script>
<style>
.input-box { cursor: text; }
.input-box:focus-within { border-color: var(--primary-l); box-shadow: var(--ring); }
.tf-input { flex: 1; min-width: 0; height: 48px; font: inherit; color: var(--text); background: none; border: 0; outline: none; padding: 0; }
.tf-input:focus { box-shadow: none !important; }
.tf-input::placeholder { color: var(--dim); }
.tf-reveal { background: none; border: 0; color: var(--muted); padding: 4px; margin-left: auto; }
.tf-paste { display: inline-flex; align-items: center; gap: 5px; flex: none; height: 32px; padding: 0 10px; border-radius: var(--r-md); background: var(--s2); color: var(--muted); font-size: var(--t-xs); }
.tf-paste:focus { box-shadow: var(--ring); color: var(--text); }
</style>
