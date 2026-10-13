<template>
  <div class="op">
    <!-- Online Play (0.9.66, owner): every installed emulator that plays online, what it offers, whether it's on, and
         its account or server. Cartridge only changes the few settings each one needs (backed up first, never while it
         runs), and checks them again after every emulator update. -->
    <div v-if="!data" class="muted small"><Icon name="mdiSync" :size="16" class="spin" /> Looking at your emulators…</div>
    <template v-else>
      <div v-if="data.issues?.length" class="op-issues">
        <div v-for="i in data.issues" :key="i.emu + i.kind" class="op-issue small"><Icon name="mdiAlertOutline" :size="18" /><span>{{ i.text }}</span></div>
      </div>
      <div v-if="!data.emus.length" class="muted small op-empty">None of the emulators that play online are on this device yet. Get them in Emulators.</div>
      <section v-for="e in data.emus" :key="e.emu" class="op-emu">
        <div class="con-head"><EmuIcon :id="e.emu" :size="30" fallback="mdiGamepadVariantOutline" /><b>{{ e.label }}</b><span v-if="e.version" class="muted small">{{ e.version }}</span><span v-if="e.running" class="status warn">Open now: close it to change these</span></div>
        <div v-for="k in e.kinds" :key="k.id" class="op-kind">
          <Toggle :model-value="k.on" :label="k.name" :desc="k.what" :disabled="busy || e.running || k.locked" @update:model-value="(v) => turn(e, k, v)" />
          <div v-if="k.on || k.showFields" class="op-fields">
            <button v-for="f in k.fields" :key="f.key" class="lrow" data-focus :disabled="busy || e.running" @click="edit(e, k, f)">
              <Icon :name="f.icon || 'mdiTextBoxOutline'" :size="22" />
              <span class="l-mid"><b>{{ f.label }}</b><span class="l-sub">{{ f.secret ? (f.value ? 'Saved' : 'Not set') : f.value || 'Not set' }}{{ f.note ? ' · ' + f.note : '' }}</span></span>
            </button>
            <button v-for="a in k.actions || []" :key="a.id" class="lrow" data-focus :disabled="busy || e.running" @click="act(e, k, a)">
              <Icon :name="a.icon || 'mdiOpenInNew'" :size="22" />
              <span class="l-mid"><b>{{ a.label }}</b><span v-if="a.sub" class="l-sub">{{ a.sub }}</span></span>
            </button>
          </div>
          <p v-if="k.note" class="muted small op-note">{{ k.note }}</p>
        </div>
      </section>
      <p class="muted small op-foot">Cartridge changes only the settings listed here, keeps a backup of the file first, and never writes while the emulator is open. After an emulator updates, these are checked again and put back if the update reset them.</p>
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { call, toast, choose, askText, confirm } from '../store.js';
import Icon from './Icon.vue';
import Toggle from './Toggle.vue';
import EmuIcon from './EmuIcon.vue';

const data = ref(null), busy = ref(false);
async function load() { data.value = await call('online:list').catch(() => ({ emus: [], issues: [] })); }
onMounted(load);
async function run(fn, done) {
  busy.value = true;
  try { const r = await fn(); if (done) toast(typeof done === 'function' ? done(r) : done, 'ok', 2500, 'mdiCheck'); return r; }
  catch (er) { toast(er.message, 'error'); return null; }
  finally { busy.value = false; load(); }
}
// turning a feature on asks first for anything it can't work without (a nickname, an account)
async function turn(e, k, on) {
  if (on) for (const f of k.fields.filter((x) => x.required && !x.value)) { if (!(await edit(e, k, f, true))) return; }
  await run(() => call('online:set', { emu: e.emu, kind: k.id, on }), on ? `${k.name} is on` : `${k.name} is off`);
}
async function edit(e, k, f, quiet = false) {
  let v;
  if (f.choices?.length) {
    v = await choose({ title: f.label, message: f.help || '', options: [...f.choices.map((c) => ({ label: c.label, sub: c.sub, value: c.value, raw: true })), ...(f.free ? [{ label: 'Type Another', value: '__type', icon: 'mdiKeyboardOutline' }] : [])] });
    if (v === '__type') v = await askText({ title: f.label, value: f.value || '', placeholder: f.placeholder || '' });
  } else v = await askText({ title: f.label, value: f.secret ? '' : f.value || '', placeholder: f.placeholder || '', password: !!f.secret });
  if (typeof v !== 'string' || (!v.trim() && f.required)) return false;
  const r = await run(() => call('online:field', { emu: e.emu, kind: k.id, key: f.key, value: v.trim() }), quiet ? null : `${f.label} saved`);
  return !!r;
}
async function act(e, k, a) {
  if (a.confirm && !(await confirm(a.label, a.confirm, a.label))) return;
  if (a.url) { window.open(a.url, '_blank'); return; }
  await run(() => call('online:action', { emu: e.emu, kind: k.id, action: a.id }), (r) => r?.message || 'Done');
}
</script>

<style scoped>
.op { display: flex; flex-direction: column; gap: var(--s-3); }
.op-emu { display: flex; flex-direction: column; gap: var(--s-2); }
.op-emu .con-head { display: flex; align-items: center; gap: var(--s-2); flex-wrap: wrap; margin-top: var(--s-2); }
.op-kind { display: flex; flex-direction: column; gap: 4px; }
.op-fields { display: flex; flex-direction: column; gap: 4px; padding-left: var(--s-3); }
.op-fields .lrow { flex: none; }
.op-note, .op-foot { margin: 0; overflow-wrap: anywhere; }
.op-issues { display: flex; flex-direction: column; gap: 6px; }
.op-issue { display: flex; gap: 8px; align-items: flex-start; color: var(--gold, #ffd978); overflow-wrap: anywhere; }
.op-empty { padding: var(--s-3) 0; }
</style>
