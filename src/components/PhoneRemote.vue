<template>
  <!-- Phone Remote (0.9.94, owner's pick): turn it on, scan the code, and the phone browses the library, starts
       downloads, follows them, and steers Cartridge like a controller. Shared dialog, row and button styles, so Plain
       and Glass each keep their own look. -->
  <div class="scrim" ref="el" @click.self="closeModal(null)">
    <div class="dialog pr" role="dialog" aria-labelledby="pr-title">
      <div class="pr-head">
        <span class="pr-mark" :class="{ on: st.on }"><Icon name="mdiCellphoneLink" :size="28" /></span>
        <div style="min-width: 0">
          <div class="eyebrow">Settings · Controls</div>
          <h2 id="pr-title">Phone Remote</h2>
          <p class="muted small">Your phone as a remote: browse your games, start downloads and follow them, show a game on this screen, and move around Cartridge with a D-pad and buttons. Only phones on your home network can open it.</p>
        </div>
      </div>
      <div v-if="st.on && qr" class="pr-on">
        <img class="pr-qr" :src="qr" alt="QR code with Phone Remote's address" />
        <div class="pr-text">
          <span class="status" :class="st.phones ? 'ok' : 'none'"><Icon :name="st.phones ? 'mdiCheck' : 'mdiCellphone'" :size="14" />{{ st.phones ? `${st.phones} ${st.phones === 1 ? 'phone' : 'phones'} connected` : 'Waiting for a phone' }}</span>
          <p class="small">Scan the code with your phone's camera. Save the page to your home screen to open it again: the address stays the same until you make a new one.</p>
          <code class="pr-url">{{ st.urls[0] }}</code>
          <p v-if="st.urls.length > 1" class="muted small">Also at {{ st.urls.slice(1).join(', ') }}</p>
          <p class="muted small">It stays on until you turn it off, and turns itself off after 3 hours with no phone.</p>
        </div>
      </div>
      <p v-else-if="st.on && !st.urls.length" class="pr-why small">This device isn’t on a network your phone can reach. Connect it to your home Wi-Fi or a cable, then turn Phone Remote on again.</p>
      <p v-else-if="why" class="pr-why small">{{ why }}</p>
      <div class="row pr-foot">
        <button v-if="!st.on" class="btn primary" data-focus :disabled="busy" @click="start"><Icon name="mdiPower" :size="18" />Turn On</button>
        <template v-else>
          <button class="btn" data-focus :disabled="busy" @click="stop"><Icon name="mdiPower" :size="18" />Turn Off</button>
          <button class="btn" data-focus :disabled="busy" @click="renew"><Icon name="mdiRefresh" :size="18" />New Address</button>
        </template>
        <button class="btn" data-focus @click="closeModal(null)">Done</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { pushLayer, focusFirst } from '../nav.js';
import { call, closeModal, confirm, toast, openModal } from '../store.js';
import Icon from './Icon.vue';

const el = ref(null), st = ref({ on: false, urls: [], phones: 0 }), qr = ref(''), busy = ref(false), why = ref('');
async function show(s) {
  st.value = s || { on: false, urls: [], phones: 0 };
  if (st.value.on && st.value.urls.length) {
    const QRCode = (await import('qrcode')).default;
    qr.value = await QRCode.toDataURL(st.value.urls[0], { margin: 1, width: 360 });
  } else qr.value = '';
}
async function run(fn) { busy.value = true; why.value = ''; try { await show(await fn()); } catch (e) { why.value = e.message; } busy.value = false; focusFirst(el.value); }
const start = () => run(() => call('remote:start'));
const stop = () => run(() => call('remote:stop'));
async function renew() {
  // the confirm takes the single modal slot: this pop-up reopens itself after (as FolderPicker does)
  const ok = await confirm('Make a New Address?', 'The address your phone saved stops working, and the new code has to be scanned again. Use it if someone you don’t want has the address.', 'New Address');
  openModal('phoneremote', {});
  if (ok) { await call('remote:newAddress').catch((e) => toast(e.message, 'error', 5000)); toast('New address made. Scan the new code.', 'ok', 3000, 'mdiRefresh'); }
}
let layer, off;
onMounted(async () => {
  const none = () => {};
  layer = pushLayer(el.value, { back: () => closeModal(null), start: () => closeModal(null), lb: none, rb: none, x: none, y: none, select: none, lt: none, rt: none });
  off = window.cart.on('remote-changed', (s) => show(s));
  await show(await call('remote:status').catch(() => null));
  focusFirst(el.value);
});
onBeforeUnmount(() => { layer?.pop(); off?.(); });
</script>

<style scoped>
.pr { width: min(720px, 94vw); max-height: 88vh; display: flex; flex-direction: column; gap: var(--s-4); overflow-y: auto; }
.pr-head { display: flex; gap: var(--s-4); align-items: flex-start; }
.pr-head h2 { margin: 2px 0 6px; font-size: var(--t-xl); line-height: 1.15; }
.pr-head p { margin: 0; line-height: 1.45; }
.pr-mark { flex: none; display: grid; place-items: center; width: 48px; height: 48px; border-radius: var(--r-md); background: var(--s3); color: var(--muted); }
.pr-mark.on { background: rgba(63, 185, 80, 0.16); color: var(--green-l); }
.pr-on { display: flex; gap: var(--s-5); align-items: center; flex-wrap: wrap; }
.pr-qr { flex: none; width: clamp(180px, 26vw, 260px); height: auto; aspect-ratio: 1; border-radius: var(--r-md); background: #fff; padding: 6px; }
.pr-text { flex: 1 1 260px; min-width: 0; display: flex; flex-direction: column; gap: var(--s-2); align-items: flex-start; }
.pr-text p { margin: 0; line-height: 1.45; overflow-wrap: anywhere; max-width: 100%; } /* an address has no spaces to break at */
.pr-url { font-size: var(--t-sm); overflow-wrap: anywhere; padding: 6px 10px; border-radius: var(--r-sm); background: var(--s2); max-width: 100%; }
.pr-why { margin: 0; padding: var(--s-3) var(--s-4); border-radius: var(--r-md); background: var(--s2); line-height: 1.45; }
.pr-foot { justify-content: flex-end; gap: var(--s-2); flex-wrap: wrap; }
</style>
