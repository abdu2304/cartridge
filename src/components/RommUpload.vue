<template>
  <div class="up">
    <div class="subh"><Icon name="mdiCloudUploadOutline" :size="20" />Upload to RomM</div>
    <p class="muted small" style="margin: 0">Games in your console folders that RomM doesn't have yet. Uploading copies them to your server, so every device can download them. Nothing on this device changes.</p>
    <div v-if="!files" class="muted small"><Icon name="mdiSync" :size="16" class="spin" /> Looking through your console folders…</div>
    <template v-else>
      <div v-if="!files.length" class="up-empty glass"><Icon name="mdiCloudCheckOutline" :size="28" /><div><b>Nothing to upload</b><div class="muted small">Every game in your console folders is already in RomM.</div></div></div>
      <template v-else>
        <div class="row wrap" style="gap: 10px">
          <span class="muted small">{{ files.length }} file{{ files.length === 1 ? '' : 's' }} · {{ bytes(files.reduce((s, f) => s + f.size, 0)) }}</span>
          <div class="spacer" />
          <button class="btn small" data-focus :disabled="!waiting.length" @click="uploadAll"><Icon name="mdiCloudUploadOutline" :size="18" />{{ waiting.length ? `Upload all ${waiting.length}` : 'Upload all' }}</button>
        </div>
        <section v-for="g in groups" :key="g.platformId" class="up-sec">
          <div class="up-con"><PIcon :p="{ slug: g.slug, fs_slug: g.fs_slug }" :size="24" /><b>{{ g.platform }}</b><span class="muted small">{{ g.items.length }}</span></div>
          <button v-for="f in g.items" :key="f.path" class="up-row" data-focus :data-key="'up-' + f.path" @click="act(f)">
            <Icon :name="icon(f)" :size="20" class="up-ic" :class="state(f)" />
            <div class="up-mid">
              <b>{{ f.name }}</b>
              <span class="muted">{{ bytes(f.size) }}<template v-if="st[f.path]?.state === 'error'"> · {{ st[f.path].error }}</template><template v-else-if="st[f.path]?.state === 'done'"> · Uploaded. Scan in RomM to add it to your library.</template></span>
              <div v-if="st[f.path]?.state === 'uploading'" class="bar live"><i :style="{ width: (st[f.path].pct || 0) + '%' }" /></div>
            </div>
            <span class="up-act">{{ label(f) }}</span>
          </button>
        </section>
        <div v-if="doneCount" class="row" style="gap: 10px">
          <span class="muted small">{{ doneCount }} uploaded. RomM adds them to your library after a scan.</span>
          <button v-if="store.config.server.auth === 'password'" class="btn small" data-focus @click="scanServer"><Icon name="mdiRadar" :size="18" />Scan server now</button>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
// Settings → RomM → Upload: files in the console folders that RomM doesn't list, sent to the server
// (RomM's chunked upload, or the older single request). Scanning afterwards is RomM's job.
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue';
import { call, bytes, toast, store, scanServer } from '../store.js';
import Icon from './Icon.vue';
import PIcon from './PIcon.vue';

const files = ref(null);
const st = reactive({}); // path -> { pct, state, error }
const groups = computed(() => {
  const by = new Map();
  for (const f of files.value || []) { if (!by.has(f.platformId)) by.set(f.platformId, { platformId: f.platformId, platform: f.platform, slug: f.slug, fs_slug: f.fs_slug, items: [] }); by.get(f.platformId).items.push(f); }
  return [...by.values()];
});
const state = (f) => st[f.path]?.state || 'ready';
const waiting = computed(() => (files.value || []).filter((f) => ['ready', 'error', 'cancelled'].includes(state(f))));
const doneCount = computed(() => (files.value || []).filter((f) => state(f) === 'done').length);
const icon = (f) => ({ uploading: 'mdiCloudUploadOutline', done: 'mdiCheckCircle', error: 'mdiAlertCircleOutline' })[state(f)] || 'mdiFileOutline';
const label = (f) => { const s = state(f); return s === 'uploading' ? `${st[f.path]?.pct || 0}% · Cancel` : s === 'done' ? 'Done' : s === 'error' ? 'Retry' : 'Upload'; };
async function start(f) {
  st[f.path] = { pct: 0, state: 'uploading' };
  try { await call('upload:start', { path: f.path, platformId: f.platformId }); } catch (e) { st[f.path] = { state: 'error', error: e.message }; }
}
async function act(f) {
  const s = state(f);
  if (s === 'uploading') { await call('upload:cancel', { path: f.path }); return; }
  if (s === 'done') return;
  await start(f);
}
// one at a time, so a big library doesn't flood the server
async function uploadAll() {
  for (const f of waiting.value) {
    await start(f);
    while (state(f) === 'uploading') await new Promise((r) => setTimeout(r, 400));
    if (state(f) === 'error' && /sign-in/i.test(st[f.path].error || '')) { toast(st[f.path].error, 'error', 7000); break; }
  }
}
const off = window.cart.on('upload', (u) => { st[u.path] = { pct: u.pct, state: u.state, error: u.error }; });
onBeforeUnmount(() => { try { off?.(); } catch {} });
onMounted(async () => {
  try {
    const r = await call('upload:list');
    for (const a of r.active || []) st[a.path] = { pct: a.pct, state: a.state, error: a.error };
    files.value = r.files;
  } catch (e) { toast(e.message, 'error'); files.value = []; }
});
</script>

<style scoped>
.up { display: flex; flex-direction: column; gap: 14px; }
.subh { display: flex; align-items: center; gap: 10px; font-family: var(--display); font-size: 19px; font-weight: 700; margin-top: 4px; }
.small { font-size: 12.5px; }
.wrap { flex-wrap: wrap; }
.spacer { flex: 1; }
.up-empty { display: flex; align-items: center; gap: 14px; padding: 16px 18px; color: var(--green-l); }
.up-empty b { color: var(--text); }
.up-sec { display: flex; flex-direction: column; gap: 6px; }
.up-con { display: flex; align-items: center; gap: 10px; margin: 6px 0 2px; font-family: var(--display); }
.up-row { display: flex; align-items: center; gap: 14px; padding: 9px 14px; border-radius: 9px; background: rgba(255, 255, 255, 0.045); text-align: left; min-width: 0; }
.up-row:focus { background: rgba(var(--primary-rgb), 0.2); }
.up-ic { color: var(--muted); flex: none; }
.up-ic.done { color: var(--green-l); }
.up-ic.error { color: var(--red); }
.up-ic.uploading { color: var(--primary-l); }
.up-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.up-mid b { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.up-mid span { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.up-act { flex: none; font-size: 13px; font-weight: 600; color: var(--primary-t); }
</style>
