<template>
  <div class="view" data-scroll ref="el">
    <header class="dl-head">
      <div>
        <div class="eyebrow">Downloads</div>
        <h1 class="big">{{ active.length ? `${active.length} in progress` : 'All caught up' }}</h1>
        <div class="muted" style="font-size: 13.5px" v-if="active.length">{{ bytes(remaining) }} left · {{ bytes(speed) }}/s</div>
      </div>
      <div class="row" style="gap: 10px">
        <button v-if="active.length" class="btn small" data-focus @click="call('dl:pauseAll')"><Icon name="mdiPause" :size="18" />Pause all</button>
        <button v-else-if="paused.length" class="btn small" data-focus @click="call('dl:resumeAll')"><Icon name="mdiPlay" :size="18" />Resume all · {{ paused.length }}</button>
        <button class="btn small" data-focus :disabled="!anyDone" @click="clearDone"><Icon name="mdiBroom" :size="18" />Clear History</button>
      </div>
    </header>

    <!-- add-ons downloading and unpacking (0.9.24, owner: texture packs show here too) -->
    <section v-if="addonJobs.length" class="dl-addons">
      <div class="sec-title">Add-ons</div>
      <!-- 0.9.28 (owner): like a game download: the game's cover and logo, what it is, and the bar through unpacking -->
      <div v-for="a in addonJobs" :key="a.key" class="now-card glass dl-addon" data-focus tabindex="0">
        <div class="now-art"><img v-if="romById(a.romId)" :src="cover(romById(a.romId))" alt="" /><Icon v-else name="mdiPuzzleOutline" :size="40" /></div>
        <div class="now-body">
          <div class="eyebrow">{{ /texture/i.test(a.name + ' ' + (a.category || '')) ? 'Texture Pack' : 'Add-on' }}{{ a.emu ? ' · ' + a.emu : '' }}</div>
          <GameLogo v-if="romById(a.romId)" :logo="logoOf(romById(a.romId))" :name="a.game" cls="dl-addon-game" :area="9000" :max-w="320" :max-h="56" />
          <b class="dl-addon-name">{{ a.name }}</b>
          <span class="muted small">{{ addonText(a) }}</span>
          <span v-if="a.state === 'download' || a.state === 'install'" class="bar" style="margin-top: 6px"><i :style="{ width: (a.pct || 2) + '%' }" /></span>
        </div>
        <Icon class="dl-addon-state" :name="a.state === 'done' ? 'mdiCheckCircle' : a.state === 'error' ? 'mdiAlertCircleOutline' : 'mdiPuzzleOutline'" :size="26" />
      </div>
    </section>

    <!-- 0.9.32 (owner: leaving a menu shouldn't cancel anything): emulator updates and installs, game updates,
         shadPS4 versions, BIOS: they carry on here while you go elsewhere -->
    <section v-if="bgList.length" class="dl-addons">
      <div class="sec-title">In the Background</div>
      <div v-for="j in bgList" :key="j.key" class="now-card glass dl-addon dl-bg" data-focus tabindex="0">
        <div class="now-art" :class="{ 'is-emu': j.emu && !(j.romId && romById(j.romId)) }"><img v-if="j.romId && romById(j.romId)" :src="cover(romById(j.romId))" alt="" /><EmuIcon v-else-if="j.emu" :id="j.emu" :size="72" :fallback="j.icon || 'mdiDownload'" /><Icon v-else :name="j.icon || 'mdiDownload'" :size="40" /></div>
        <div class="now-body">
          <div class="eyebrow">{{ j.kind }}</div>
          <b class="dl-addon-name">{{ j.title }}</b>
          <span class="muted small">{{ j.state === 'done' ? 'Done' : j.state === 'error' ? j.error || 'It failed' : (j.text || 'Downloading') + (j.pct != null ? ' · ' + j.pct + '%' : '') }}</span>
          <span v-if="j.state === 'run'" class="bar" :class="{ live: j.pct == null }" style="margin-top: 6px"><i :style="{ width: (j.pct ?? 100) + '%' }" /></span>
        </div>
        <Icon class="dl-addon-state" :name="j.state === 'done' ? 'mdiCheckCircle' : j.state === 'error' ? 'mdiAlertCircleOutline' : j.icon || 'mdiDownload'" :size="26" />
      </div>
    </section>

    <div v-if="!store.downloads.length && !addonJobs.length && !bgList.length" class="empty-dl">
      <div class="dl-hero">
        <div class="dl-fan"><img v-for="(c, i) in fan" :key="i" :src="c" :style="{ '--i': i - (fan.length - 1) / 2 }" @error="$event.target.style.display = 'none'" /></div>
        <div class="dl-badge"><div class="dl-badge-in"><Icon name="mdiTrayArrowDown" :size="46" class="dl-arrow" /></div></div>
      </div>
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
          <div class="bar big-bar live"><i :style="{ width: pct(d) + '%' }" /></div>
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
      <div class="list">
        <div v-for="(d, i) in queued" :key="d.id" class="q-row">
          <DlRow :d="d" action="Cancel" @act="act" />
          <button class="btn small q-mv" data-focus :disabled="i === 0" aria-label="Move up" @click="call('dl:move', { id: d.id, dir: -1 })"><Icon name="mdiArrowUp" :size="18" /></button>
          <button class="btn small q-mv" data-focus :disabled="i === queued.length - 1" aria-label="Move down" @click="call('dl:move', { id: d.id, dir: 1 })"><Icon name="mdiArrowDown" :size="18" /></button>
        </div>
      </div>
    </section>
    <section v-if="finished.length">
      <div class="shelf-title"><Icon name="mdiHistory" :size="20" />History<span class="count">{{ finished.length }}</span></div>
      <div class="list"><DlRow v-for="d in finished" :key="d.id" :d="d" :action="d.status === 'done' ? (d.notice === 'pkg' ? `Install in ${d.installIn || 'RPCS3'}` : 'View game') : 'Resume'" @act="act" /></div>
    </section>
  </div>
</template>

<script setup>
// add-on jobs, newest first
const addonText = (a) => (a.state === 'download' ? `Downloading ${a.pct != null ? a.pct + '%' : ''}${a.total ? ' of ' + bytes(a.total) : ''}` : a.state === 'join' ? 'Joining the parts' : a.state === 'install' ? `Unpacking ${a.pct || 0}%` : a.state === 'done' ? 'Installed' : a.state === 'error' ? a.error || 'It failed' : 'Starting');
import { computed, h } from 'vue';
import { store, call, img, bytes, go, tab, setBg, romById, backdropOf, allRoms, cover, logoOf } from '../store.js';
import { useView } from '../useView.js';
import Icon from '../components/Icon.vue';
import Btn from '../components/Btn.vue';
import GameLogo from '../components/GameLogo.vue';
import EmuIcon from '../components/EmuIcon.vue';
const addonJobs = computed(() => Object.values(store.addonJobs || {}).sort((a, b) => b.at - a.at));
const bgList = computed(() => Object.values(store.bgJobs || {}).sort((a, b) => b.at - a.at));

// three of your games fanned behind the empty-state badge
const fan = (() => { const l = allRoms().filter((r) => r.path_cover_small || r.url_cover); for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l.slice(0, 3).map((r) => cover(r)); })();
const current = computed(() => store.downloads.filter((d) => d.status === 'downloading'));
const queued = computed(() => store.downloads.filter((d) => d.status === 'queued'));
const paused = computed(() => store.downloads.filter((d) => d.status === 'cancelled'));
const active = computed(() => [...current.value, ...queued.value]);
const finished = computed(() => store.downloads.filter((d) => !['downloading', 'queued'].includes(d.status)).sort((a, b) => b.addedAt - a.addedAt));
const remaining = computed(() => active.value.reduce((s, d) => s + Math.max(0, (d.total || 0) - (d.received || 0)), 0));
const speed = computed(() => current.value.reduce((s, d) => s + (d.speed || 0), 0));
// 0.9.57 (owner: X cleared game downloads only): one clear for everything finished, games, add-ons and background jobs
const ended = (s) => s === 'done' || s === 'error';
const anyDone = computed(() => finished.value.length || addonJobs.value.some((a) => ended(a.state)) || bgList.value.some((j) => ended(j.state)));
function clearDone() {
  for (const [k, a] of Object.entries(store.addonJobs || {})) if (ended(a.state)) delete store.addonJobs[k];
  for (const [k, j] of Object.entries(store.bgJobs || {})) if (ended(j.state)) delete store.bgJobs[k];
  call('dl:clear');
}
useView({ x: clearDone }, [{ b: 'A', label: 'Pause / Resume' }, { b: 'X', label: 'Clear History' }, { b: 'LT+RT', label: 'Tabs' }]);

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
      h('span', { class: 'muted' }, d.status === 'error' ? d.error : d.status === 'done' ? (d.notice === 'pkg' ? `Install it in ${d.installIn || 'RPCS3'} from the game page` : d.path) : `${d.platformName} · ${bytes(d.total)}${d.received && d.status !== 'done' ? ` · ${pct(d)}% saved` : ''}`),
    ]),
    h('span', { class: ['st', d.status] }, LABEL[d.status]),
    h('span', { class: 'act' }, [h(Btn, { b: 'A' }), props.action]),
  ]);
};
DlRow.props = ['d', 'action'];
DlRow.emits = ['act'];
</script>

<style scoped>
.dl-bg .now-art, .dl-addon .now-art { display: grid; place-items: center; color: var(--muted); }
/* an emulator's own icon instead of an empty poster (0.9.57): a square tile, the icon contained */
.dl-bg .now-art.is-emu { aspect-ratio: 1; align-self: center; }
.dl-bg .now-art.is-emu .emu-icon { object-fit: contain; border-radius: 12px; }
.dl-head { display: flex; align-items: flex-end; justify-content: space-between; margin: 18px 0 24px; }
.big { font-size: var(--t-2xl); font-weight: 700; margin: 6px 0 6px; }
.empty-dl { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 60px 0; text-align: center; }
.empty-dl p { display: flex; gap: 6px; align-items: center; margin: 0; }
.dl-hero { position: relative; width: 300px; height: 190px; display: grid; place-items: center; margin-bottom: 6px; }
.dl-fan { position: absolute; inset: 0; display: grid; place-items: center; }
.dl-fan img { position: absolute; width: 104px; aspect-ratio: 2 / 3; object-fit: cover; border-radius: var(--r-md); box-shadow: 0 14px 34px rgba(0, 0, 0, 0.6); opacity: 0.55; filter: saturate(0.8);
  transform: translateX(calc(var(--i) * 78px)) translateY(calc(var(--i) * var(--i) * 10px)) rotate(calc(var(--i) * 12deg)); }
.dl-badge { position: relative; width: 112px; height: 112px; border-radius: 50%; background: var(--s2); box-shadow: var(--shadow-pop); }
.dl-badge-in { width: 100%; height: 100%; border-radius: 50%; display: grid; place-items: center; color: var(--text); }
.ring-empty { width: 110px; height: 110px; border-radius: 50%; display: grid; place-items: center; background: var(--s2); color: var(--text); }
.now { display: flex; flex-direction: column; gap: 14px; margin-bottom: 28px; }
.now-card { display: flex; align-items: center; gap: 24px; padding: 18px 22px; width: 100%; }
.dl-addon { margin-bottom: 10px; }
.dl-addon .now-art { width: 84px; }
.dl-addon :deep(.dl-addon-game) { margin: 2px 0; font-family: var(--display); font-weight: 800; font-size: var(--t-lg); }
.dl-addon-name { font-size: var(--t-md); }
.dl-addon-state { margin-left: auto; flex: none; opacity: 0.8; }
.now-art { width: 120px; aspect-ratio: 2/3; border-radius: var(--r-md); overflow: hidden; background: #1a1e2a; flex: none; box-shadow: 0 14px 34px rgba(0, 0, 0, 0.55); }
.now-art img { width: 100%; height: 100%; object-fit: cover; }
.now-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.now-body h2 { font-size: var(--t-xl);  overflow-wrap: anywhere; }
.big-bar { height: 12px; border-radius: var(--r-sm); }
.stats { gap: 20px; color: var(--muted); font-size: var(--t-sm); }
.pct { font-family: var(--display); font-weight: 700; font-size: var(--t-xl); }
.now-act { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: var(--t-sm); }
.q-row { display: flex; align-items: center; gap: 8px; }
.q-mv { flex: none; }
.list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 26px; }
:deep(.dl-row) { display: flex; align-items: center; gap: 16px; padding: 10px 16px; border-radius: var(--r-md); background: rgba(16, 19, 28, 0.6); border: 1px solid var(--line); width: 100%; }
:deep(.dl-row .thumb) { width: 44px; height: 58px; border-radius: var(--r-md); overflow: hidden; background: #1a1e2a; flex: none; }
:deep(.dl-row .thumb img) { width: 100%; height: 100%; object-fit: cover; }
:deep(.dl-row .mid) { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
:deep(.dl-row .mid b) { font-weight: 500; }
:deep(.dl-row .mid span) { font-size: var(--t-xs);  overflow-wrap: anywhere; }
:deep(.dl-row .st) { font-size: var(--t-xs); font-weight: 600; color: var(--muted); width: 70px; text-align: right; }
:deep(.dl-row .st.done) { color: var(--green-l); }
:deep(.dl-row .st.error) { color: #ffa39c; }
:deep(.dl-row .st.cancelled) { color: var(--gold); }
:deep(.dl-row .act) { display: flex; align-items: center; gap: 8px; width: 130px; justify-content: flex-end; color: var(--muted); font-size: var(--t-xs); }
</style>
