<template>
  <div class="view" data-scroll ref="el">
    <header class="dl-head">
      <div>
        <div class="eyebrow">Downloads</div>
        <h1 class="big">{{ active.length ? `${active.length} in progress` : 'All caught up' }}</h1>
        <div class="muted" style="font-size: 13.5px" v-if="active.length">{{ bytes(remaining) }} left · {{ bytes(speed) }}/s</div>
      </div>
      <button class="btn small" data-focus :disabled="!finished.length" @click="call('dl:clear')"><Icon name="mdiBroom" :size="18" />Clear history</button>
    </header>

    <div v-if="!store.downloads.length" class="empty-dl">
      <div class="ring-empty"><Icon name="mdiTrayArrowDown" :size="44" /></div>
      <h2>Nothing downloading</h2>
      <p class="muted">Highlight any game and press <Btn b="X" /> to pull it from your server.</p>
      <button class="btn primary" data-focus @click="tab('library')"><Icon name="mdiViewGridOutline" />Browse library</button>
    </div>

    <section v-if="current.length" class="now">
      <button v-for="d in current" :key="d.id" class="now-card glass" data-focus :data-key="'dl-' + d.id" @click="act(d)" @focus="bgFor(d)">
        <div class="now-art"><img v-if="d.cover" :src="img(d.cover)" /></div>
        <div class="now-body">
          <div class="eyebrow">{{ d.platformName }}</div>
          <h2>{{ d.name }}</h2>
          <div class="bar big-bar"><i :style="{ width: pct(d) + '%' }" /></div>
          <div class="row stats">
            <span class="pct grad-text">{{ pct(d) }}%</span>
            <span>{{ bytes(d.received) }} / {{ bytes(d.total) }}</span>
            <span>{{ bytes(d.speed) }}/s</span>
            <span>{{ eta(d) }}</span>
          </div>
          <div v-if="d.currentFile" class="muted mono" style="font-size: 12px">{{ d.currentFile }}</div>
        </div>
        <div class="now-act"><Btn b="A" />Pause</div>
      </button>
    </section>

    <section v-if="queued.length">
      <div class="shelf-title"><Icon name="mdiClockOutline" :size="20" />Up next<span class="count">{{ queued.length }}</span></div>
      <div class="list"><DlRow v-for="d in queued" :key="d.id" :d="d" action="Cancel" @act="act" /></div>
    </section>
    <section v-if="finished.length">
      <div class="shelf-title"><Icon name="mdiHistory" :size="20" />History<span class="count">{{ finished.length }}</span></div>
      <div class="list"><DlRow v-for="d in finished" :key="d.id" :d="d" :action="d.status === 'done' ? 'View game' : 'Resume'" @act="act" /></div>
    </section>
  </div>
</template>

<script setup>
import { computed, h } from 'vue';
import { store, call, img, bytes, go, tab, setBg, romById, backdropOf } from '../store.js';
import { useView } from '../useView.js';
import Icon from '../components/Icon.vue';
import Btn from '../components/Btn.vue';

const current = computed(() => store.downloads.filter((d) => d.status === 'downloading'));
const queued = computed(() => store.downloads.filter((d) => d.status === 'queued'));
const active = computed(() => [...current.value, ...queued.value]);
const finished = computed(() => store.downloads.filter((d) => !['downloading', 'queued'].includes(d.status)).sort((a, b) => b.addedAt - a.addedAt));
const remaining = computed(() => active.value.reduce((s, d) => s + Math.max(0, (d.total || 0) - (d.received || 0)), 0));
const speed = computed(() => current.value.reduce((s, d) => s + (d.speed || 0), 0));
useView({ x: () => call('dl:clear') }, [{ b: 'A', label: 'Pause / Resume' }, { b: 'X', label: 'Clear history' }, { b: 'LB', label: '/ RB  Tabs' }]);

const pct = (d) => (d.total ? Math.min(100, Math.floor((d.received / d.total) * 100)) : 0);
function eta(d) {
  if (!d.speed) return 'Starting…';
  const s = Math.round((d.total - d.received) / d.speed);
  if (s < 60) return `${s}s left`;
  if (s < 3600) return `${Math.round(s / 60)} min left`;
  return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m left`;
}
function bgFor(d) { setBg(backdropOf(romById(d.romId))); }
function act(d) {
  if (d.status === 'downloading' || d.status === 'queued') call('dl:cancel', d.id);
  else if (d.status === 'done') go('game', { romId: d.romId });
  else call('dl:retry', d.id);
}

const LABEL = { done: 'Ready', error: 'Failed', cancelled: 'Paused', queued: 'Queued' };
const DlRow = (props, { emit }) => {
  const d = props.d;
  return h('button', { class: 'dl-row', 'data-focus': '', 'data-key': 'dl-' + d.id, onClick: () => emit('act', d), onFocus: () => bgFor(d) }, [
    h('div', { class: 'thumb' }, d.cover ? [h('img', { src: img(d.cover) })] : []),
    h('div', { class: 'mid' }, [
      h('b', d.name),
      h('span', { class: 'muted' }, d.status === 'error' ? d.error : d.status === 'done' ? d.path : `${d.platformName} · ${bytes(d.total)}${d.received && d.status !== 'done' ? ` · ${pct(d)}% saved` : ''}`),
    ]),
    h('span', { class: ['st', d.status] }, LABEL[d.status]),
    h('span', { class: 'act' }, [h(Btn, { b: 'A' }), props.action]),
  ]);
};
DlRow.props = ['d', 'action'];
DlRow.emits = ['act'];
</script>

<style scoped>
.dl-head { display: flex; align-items: flex-end; justify-content: space-between; margin: 18px 0 24px; }
.big { font-size: 36px; font-weight: 700; margin: 6px 0 6px; }
.empty-dl { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 60px 0; text-align: center; }
.empty-dl p { display: flex; gap: 6px; align-items: center; margin: 0; }
.ring-empty { width: 110px; height: 110px; border-radius: 50%; display: grid; place-items: center; background: radial-gradient(circle, rgba(139, 116, 232, 0.25), transparent 70%); border: 1px solid rgba(161, 143, 255, 0.35); color: #cfc4ff; }
.now { display: flex; flex-direction: column; gap: 14px; margin-bottom: 28px; }
.now-card { display: flex; align-items: center; gap: 24px; padding: 18px 22px; width: 100%; }
.now-art { width: 120px; aspect-ratio: 3/4; border-radius: 12px; overflow: hidden; background: #1a1e2a; flex: none; box-shadow: 0 14px 34px rgba(0, 0, 0, 0.55); }
.now-art img { width: 100%; height: 100%; object-fit: cover; }
.now-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.now-body h2 { font-size: 26px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.big-bar { height: 12px; border-radius: 6px; }
.stats { gap: 20px; color: var(--muted); font-size: 13.5px; }
.pct { font-family: var(--display); font-weight: 700; font-size: 26px; }
.now-act { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; }
.list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 26px; }
:deep(.dl-row) { display: flex; align-items: center; gap: 16px; padding: 10px 16px; border-radius: 14px; background: rgba(16, 19, 28, 0.6); border: 1px solid var(--line); width: 100%; }
:deep(.dl-row .thumb) { width: 44px; height: 58px; border-radius: 8px; overflow: hidden; background: #1a1e2a; flex: none; }
:deep(.dl-row .thumb img) { width: 100%; height: 100%; object-fit: cover; }
:deep(.dl-row .mid) { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
:deep(.dl-row .mid b) { font-weight: 500; }
:deep(.dl-row .mid span) { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
:deep(.dl-row .st) { font-size: 12px; font-weight: 600; color: var(--muted); width: 70px; text-align: right; }
:deep(.dl-row .st.done) { color: var(--green-l); }
:deep(.dl-row .st.error) { color: #ffa39c; }
:deep(.dl-row .st.cancelled) { color: var(--gold); }
:deep(.dl-row .act) { display: flex; align-items: center; gap: 8px; width: 130px; justify-content: flex-end; color: var(--muted); font-size: 12.5px; }
</style>
