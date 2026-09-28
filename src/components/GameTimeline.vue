<template>
  <div class="scrim" ref="el" @click.self="closeModal(null)">
    <div class="dialog tl">
      <div class="tl-head">
        <img v-if="cover" :src="cover" class="tl-cover" />
        <div style="min-width: 0">
          <div class="eyebrow">Timeline</div>
          <h2>{{ name }}</h2>
          <div class="tl-stats">
            <div v-for="s in stats" :key="s.l"><b>{{ s.v }}</b><span>{{ s.l }}</span></div>
          </div>
        </div>
      </div>
      <div class="tl-list" data-scroll>
        <div v-if="!events.length" class="muted" style="padding: 12px 4px">Nothing yet. Download it, play it, or add it to Steam and it shows up here.</div>
        <div v-for="(e, i) in events" :key="i" class="tl-e" data-focus tabindex="0">
          <div class="tl-dot"><Icon :name="e.icon" :size="16" /></div>
          <div class="tl-body">
            <div class="tl-when">{{ when(e.t) }}</div>
            <div class="tl-what">{{ e.label }}</div>
            <div v-if="e.sub" class="tl-sub">{{ e.sub }}</div>
          </div>
        </div>
      </div>
      <div class="row" style="justify-content: flex-end"><button class="btn" data-focus data-autofocus @click="closeModal(null)">Close</button></div>
    </div>
  </div>
</template>

<script setup>
// A game's story on this device and in RomM: added, downloaded, into Steam, first and latest
// trophies, last played. Opened from the game page's More menu.
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { pushLayer, focusFirst } from '../nav.js';
import { closeModal } from '../store.js';
import Icon from './Icon.vue';

defineProps({ name: String, cover: String, stats: { type: Array, default: () => [] }, events: { type: Array, default: () => [] } });
const when = (t) => {
  const d = new Date(t), now = new Date();
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
  return `${date} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};
const el = ref(null);
let layer;
onMounted(() => {
  layer = pushLayer(el.value, { back: () => closeModal(null), start: () => closeModal(null), lb() {}, rb() {}, x() {}, y() {}, select() {}, lt() {}, rt() {} });
  focusFirst(el.value, '[data-autofocus]') || focusFirst(el.value);
});
onBeforeUnmount(() => layer?.pop());
</script>

<style scoped>
.tl { width: min(720px, 94vw); max-height: 88vh; display: flex; flex-direction: column; }
.tl-head { display: flex; gap: 18px; align-items: center; }
.tl-head h2 { margin: 2px 0 10px; font-size: 24px; line-height: 1.15; }
.tl-cover { width: 76px; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 8px; box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45); flex: none; }
.tl-stats { display: flex; gap: 22px; }
.tl-stats > div { display: flex; flex-direction: column; gap: 2px; }
.tl-stats b { font-family: var(--display); font-size: 20px; font-weight: 700; line-height: 1; }
.tl-stats span { font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.tl-list { position: relative; overflow-y: auto; min-height: 0; flex: 1; padding: 4px 4px 4px 2px; display: flex; flex-direction: column; }
/* the line the dots sit on */
.tl-list::before { content: ''; position: absolute; left: 17px; top: 18px; bottom: 18px; width: 2px; background: linear-gradient(180deg, rgba(var(--primary-rgb), 0.6), rgba(var(--primary-rgb), 0.12)); }
.tl-e { flex: none; position: relative; display: flex; gap: 14px; padding: 8px 10px 8px 0; border-radius: 10px; outline: none; }
.tl-e:focus { background: rgba(255, 255, 255, 0.05); box-shadow: var(--ring); }
.tl-dot { flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--primary) 30%, #12141d); border: 2px solid rgba(var(--primary-rgb), 0.7); color: #fff; z-index: 1; }
.tl-body { display: flex; flex-direction: column; gap: 2px; padding-top: 1px; min-width: 0; }
.tl-when { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--primary-t); font-weight: 700; }
.tl-what { font-family: var(--display); font-size: 16px; font-weight: 600; }
.tl-sub { font-size: 13px; color: var(--muted); }
</style>
