<template>
  <div class="li">
    <TextField :model-value="modelValue" label="GitHub link" placeholder="github.com/owner/project" icon="mdiLink" @update:model-value="(v) => emit('update:modelValue', v)" />
    <div class="li-ways">
      <button class="btn small" :class="{ primary: way === 'search' }" data-focus @click="toggle('search')"><Icon name="mdiMagnify" :size="18" />Search GitHub</button>
      <button class="btn small" :class="{ primary: way === 'phone' }" data-focus @click="toggle('phone')"><Icon name="mdiCellphoneArrowDown" :size="18" />Send From Your Phone</button>
    </div>
    <!-- a few words instead of a whole link (0.9.64, owner: typing links on a controller is a pain) -->
    <template v-if="way === 'search'">
      <div class="li-q"><TextField v-model="q" label="Search" placeholder="shadps4 gr2" icon="mdiMagnify" /><button class="btn small" data-focus :disabled="busy || !q.trim()" @click="search"><Icon :name="busy ? 'mdiSync' : 'mdiMagnify'" :class="{ spin: busy }" :size="18" />Search</button></div>
      <div v-if="why" class="muted small">{{ why }}</div>
      <div v-if="found.length" class="li-list" data-scroll>
        <button v-for="r in found" :key="r.repo" class="lrow" :class="{ on: modelValue === 'https://github.com/' + r.repo }" data-focus @click="emit('update:modelValue', 'https://github.com/' + r.repo); way = ''">
          <Icon name="mdiGithub" :size="22" />
          <span class="l-mid"><b>{{ r.repo }}</b><span class="l-sub">{{ [r.description, r.updated ? 'Updated ' + new Date(r.updated).toLocaleDateString() : '', r.fork ? 'A fork' : ''].filter(Boolean).join(' · ') }}</span></span>
          <span class="l-end"><span class="status"><Icon name="mdiStarOutline" :size="14" />{{ r.stars }}</span></span>
        </button>
      </div>
    </template>
    <!-- the phone sends it over your home network (electron/phoneLink.js): nothing leaves it -->
    <div v-if="way === 'phone'" class="li-phone">
      <img v-if="qr" :src="qr" alt="" class="li-qr" />
      <div class="li-pmid">
        <b>Scan this with your phone</b>
        <span class="muted small">On the same Wi-Fi as this device. Paste the link on the page that opens and press Send: it appears here. The page closes after one link or ten minutes.</span>
        <span v-if="urls.length" class="muted small mono">{{ urls[0] }}</span>
        <span v-if="phoneWhy" class="muted small">{{ phoneWhy }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
// Where a GitHub link comes from (0.9.64): typed or pasted, found by a search, or sent from your phone by a QR code.
// Inline, not a pop-up, so the on-screen keyboard (itself a pop-up) still works in it.
import { onBeforeUnmount, ref } from 'vue';
import { call, toast } from '../store.js';
import Icon from './Icon.vue';
import TextField from './TextField.vue';

const props = defineProps({ modelValue: String });
const emit = defineEmits(['update:modelValue']);
const way = ref(''), q = ref(''), found = ref([]), busy = ref(false), why = ref('');
const qr = ref(''), urls = ref([]), phoneWhy = ref('');
let off = null;
async function search() {
  if (!q.value.trim()) return;
  busy.value = true; why.value = '';
  try { found.value = await call('github:search', { q: q.value }); if (!found.value.length) why.value = 'Nothing found. Try other words, or the project’s owner and name.'; }
  catch (e) { why.value = e.message; found.value = []; }
  busy.value = false;
}
async function openPhone() {
  phoneWhy.value = ''; qr.value = ''; urls.value = [];
  try {
    const r = await call('phone:open', { title: 'Paste the GitHub link and press Send.' });
    urls.value = r.urls;
    if (!r.urls.length) { phoneWhy.value = 'This device isn’t on a network your phone can reach.'; return; }
    const QRCode = (await import('qrcode')).default;
    qr.value = await QRCode.toDataURL(r.urls[0], { margin: 1, width: 360 });
    off?.(); off = window.cart.on('phone-text', (m) => { emit('update:modelValue', String(m.text || '').split(/\s+/).find((w) => /github\.com\//i.test(w)) || m.text); toast('Link received from your phone', 'ok', 2500, 'mdiCellphoneCheck'); way.value = ''; off?.(); off = null; });
  } catch (e) { phoneWhy.value = e.message; }
}
function toggle(w) {
  if (way.value === 'phone') { call('phone:close').catch(() => {}); off?.(); off = null; }
  way.value = way.value === w ? '' : w;
  if (way.value === 'phone') openPhone();
}
onBeforeUnmount(() => { if (way.value === 'phone') call('phone:close').catch(() => {}); off?.(); });
</script>

<style scoped>
.li { display: flex; flex-direction: column; gap: var(--s-2); }
.li-ways { display: flex; gap: var(--s-2); flex-wrap: wrap; }
.li-q { display: flex; gap: var(--s-2); align-items: flex-end; }
.li-q > :first-child { flex: 1; min-width: 0; }
.li-list { display: flex; flex-direction: column; gap: 4px; max-height: 320px; overflow-y: auto; padding: 2px; }
.li-list .lrow { flex: none; }
.li-list .l-mid b { overflow-wrap: anywhere; }
.li-phone { display: flex; gap: var(--s-3); align-items: center; }
.li-qr { width: 160px; height: 160px; border-radius: var(--r-sm); background: #fff; flex: none; image-rendering: pixelated; }
.li-pmid { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.li-pmid .mono { overflow-wrap: anywhere; }
</style>
