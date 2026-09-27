<template>
  <div class="view game" data-scroll ref="el">
    <div v-if="!base" class="center"><div class="spinner" /></div>
    <template v-else>
      <section class="g-hero">
        <div class="g-info">
          <div class="eyebrow row" style="gap: 8px"><PIcon :p="{ slug: base.platform_slug, fs_slug: base.platform_fs_slug }" :size="18" />{{ base.platform_display_name }}</div>
          <h1 class="g-title">{{ base.name }}</h1>
          <div class="g-meta">
            <span v-if="isNew(base)" class="chip new">NEW</span>
            <span v-if="yr">{{ yr }}</span>
            <span v-if="dev">{{ dev }}</span>
            <span v-if="genres">{{ genres }}</span>
            <span v-if="base.rating" class="row" style="gap: 4px; color: var(--gold)"><Icon name="mdiStar" :size="16" />{{ rating(base.rating) }}</span>
          </div>

          <div class="g-actions">
            <template v-if="dl && dl.status === 'downloading'">
              <div class="dlbox glass">
                <div class="row" style="justify-content: space-between; font-size: 13px">
                  <b>Downloading</b><span class="muted">{{ pct }}% · {{ bytes(dl.speed) }}/s</span>
                </div>
                <div class="bar"><i :style="{ width: pct + '%' }" /></div>
                <div class="muted mono" style="font-size: 11.5px">{{ dl.currentFile || bytes(dl.received) + ' of ' + bytes(dl.total) }}</div>
              </div>
              <button class="btn danger" data-focus data-autofocus @click="call('dl:cancel', dl.id)"><Icon name="mdiPause" />Pause</button>
            </template>
            <template v-else-if="dl && dl.status === 'queued'">
              <button class="btn xl" data-focus data-autofocus disabled><Icon name="mdiClockOutline" />Queued</button>
              <button class="btn danger" data-focus @click="call('dl:cancel', dl.id)"><Icon name="mdiClose" />Cancel</button>
            </template>
            <template v-else-if="installedPath">
              <button class="btn ok xl" data-focus data-autofocus @click="toast(installedPath, 'info', 4000, 'mdiFolder')"><Icon name="mdiCheckCircle" />Ready to play</button>
              <button class="btn" data-focus @click="redownload"><Icon name="mdiRefresh" />Re-download</button>
              <button class="btn danger" data-focus @click="remove"><Icon name="mdiDeleteOutline" />Delete</button>
            </template>
            <template v-else>
              <button class="btn primary xl" data-focus data-autofocus @click="dlNow"><Icon name="mdiDownload" :size="22" />{{ dl?.status === 'cancelled' ? 'Resume' : 'Download' }} · {{ bytes(base.fs_size_bytes) }}</button>
            </template>
          </div>
          <div v-if="dl && dl.status === 'error'" class="chip red" style="align-self: flex-start">Last attempt failed: {{ dl.error }}</div>
          <div class="dest"><Icon name="mdiFolderArrowDownOutline" :size="16" /><span class="mono">{{ installedPath || target?.path || 'No folder set for this system' }}</span><span v-if="space" class="muted">· {{ bytes(space.free) }} free</span></div>
        </div>
        <div class="g-cover">
          <img v-if="coverSrc && !coverFail" :src="coverSrc" @error="coverFail = true" />
          <div v-else class="noart">{{ base.name }}</div>
        </div>
      </section>

      <section class="g-body">
        <div class="col">
          <template v-if="summary">
            <div class="shelf-title"><Icon name="mdiTextBoxOutline" :size="20" />About</div>
            <p class="summary">{{ summary }}</p>
          </template>
          <template v-if="shots.length">
            <div class="shelf-title" style="margin-top: 22px"><Icon name="mdiImageMultipleOutline" :size="20" />Screenshots</div>
            <div class="shelf shots" data-hscroll>
              <button v-for="(s, i) in shots" :key="s" class="shot" data-focus @click="viewer = i"><img :src="img(s)" loading="lazy" /></button>
            </div>
          </template>
          <template v-if="detail?.sibling_roms?.length">
            <div class="shelf-title" style="margin-top: 16px"><Icon name="mdiLayersOutline" :size="20" />Other versions</div>
            <div class="row" style="flex-wrap: wrap; gap: 10px">
              <button v-for="s in detail.sibling_roms" :key="s.id" class="btn small" data-focus @click="goVersion(s.id)">{{ s.fs_name_no_ext }}</button>
            </div>
          </template>
        </div>
        <aside class="facts glass">
          <div v-for="f in facts" :key="f.k" class="fact"><span>{{ f.k }}</span><b>{{ f.v }}</b></div>
        </aside>
      </section>
    </template>

    <div v-if="viewer !== null" class="viewer" @click="viewer = null">
      <img :src="img(shots[viewer])" />
      <div class="vhint"><Btn b="LB" /><Btn b="RB" />{{ viewer + 1 }} / {{ shots.length }}<Btn b="B" style="margin-left: 12px" />Close</div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, nextTick, watch } from 'vue';
import { store, call, img, cover, bytes, year, rating, toast, confirm, download, downloadFor, romById, platformById, isNew, setBg } from '../store.js';
import { useView } from '../useView.js';
import { ensureFocus, focusFirst } from '../nav.js';
import Icon from '../components/Icon.vue';
import Btn from '../components/Btn.vue';
import PIcon from '../components/PIcon.vue';

const props = defineProps({ romId: Number });
const el = ref(null);
const detail = ref(null);
const coverFail = ref(false);
const viewer = ref(null);
const space = ref(null);

const cached = computed(() => romById(props.romId));
// Merge: cached (instant, offline) + detail (full metadata)
const base = computed(() => {
  const c = cached.value, d = detail.value;
  if (!c && !d) return null;
  if (!d) return c;
  const md = d.metadatum || {};
  return { ...c, ...d, name: d.name || d.fs_name_no_ext, year: md.first_release_date, rating: md.average_rating, genres: md.genres || [], developer: md.developers?.[0] || md.companies?.[0] || '', shot: d.merged_screenshots?.[0] || c?.shot };
});
const coverSrc = computed(() => base.value && cover(base.value, true));
const shots = computed(() => detail.value?.merged_screenshots || (cached.value?.shot ? [cached.value.shot] : []));
const summary = computed(() => detail.value?.summary || cached.value?.summary || '');
const target = computed(() => platformById(base.value?.platform_id)?.target);
const installedPath = computed(() => store.installed[props.romId]);
const dl = computed(() => downloadFor(props.romId));
const pct = computed(() => (dl.value?.total ? Math.floor((dl.value.received / dl.value.total) * 100) : 0));
const md = computed(() => detail.value?.metadatum || {});
const yr = computed(() => year(base.value?.year));
const dev = computed(() => base.value?.developer);
const genres = computed(() => (base.value?.genres || []).slice(0, 3).join(' · '));
const facts = computed(() => {
  const r = base.value, m = md.value, out = [];
  if (m.publishers?.length) out.push({ k: 'Publisher', v: m.publishers.slice(0, 2).join(', ') });
  if (m.developers?.length) out.push({ k: 'Developer', v: m.developers.slice(0, 2).join(', ') });
  if (m.franchises?.length) out.push({ k: 'Franchise', v: m.franchises[0] });
  if (m.game_modes?.length) out.push({ k: 'Modes', v: m.game_modes.join(', ') });
  if (m.player_count) out.push({ k: 'Players', v: m.player_count });
  if (m.age_ratings?.length) out.push({ k: 'Rating', v: m.age_ratings.slice(0, 2).join(', ') });
  if (r.regions?.length) out.push({ k: 'Region', v: r.regions.join(', ') });
  if (detail.value?.languages?.length) out.push({ k: 'Languages', v: detail.value.languages.join(', ') });
  out.push({ k: 'File', v: r.fs_name });
  out.push({ k: 'Size', v: bytes(r.fs_size_bytes) });
  if (detail.value?.files?.length > 1) out.push({ k: 'Files', v: `${detail.value.files.length} files` });
  if (detail.value?.crc_hash) out.push({ k: 'CRC32', v: detail.value.crc_hash.toUpperCase() });
  return out;
});

useView(
  {
    back: () => { if (viewer.value !== null) { viewer.value = null; return; } return false; },
    lb: () => { if (viewer.value !== null) viewer.value = (viewer.value - 1 + shots.value.length) % shots.value.length; },
    rb: () => { if (viewer.value !== null) viewer.value = (viewer.value + 1) % shots.value.length; },
    x: () => { if (!installedPath.value && !['queued', 'downloading'].includes(dl.value?.status)) dlNow(); },
  },
  [{ b: 'A', label: 'Select' }, { b: 'X', label: 'Download' }, { b: 'B', label: 'Back' }],
);

async function dlNow() { await download(base.value); }
async function redownload() {
  if (!(await confirm('Re-download this game?', 'The copy on this device will be replaced.', 'Re-download'))) return;
  await call('roms:delete', { romId: props.romId, path: installedPath.value }).catch(() => {});
  dlNow();
}
async function remove() {
  if (!(await confirm(`Delete ${base.value.name}?`, `Removes it from this device:\n${installedPath.value}\n\nIt stays on your RomM server.`, 'Delete', true))) return;
  try { await call('roms:delete', { romId: props.romId, path: installedPath.value }); toast('Deleted from this device', 'ok', 2400, 'mdiDeleteOutline'); } catch (e) { toast(e.message, 'error'); }
}
function goVersion(id) { store.route = { ...store.route, params: { romId: id } }; }

watch([installedPath, () => dl.value?.status], async () => { await nextTick(); ensureFocus(el.value); });
onMounted(async () => {
  if (cached.value) setBg(cached.value.shot ? { src: img(cached.value.shot) } : { src: cover(cached.value, true), blur: true });
  await nextTick();
  focusFirst(el.value);
  try {
    detail.value = await call('api:get', { path: `/api/roms/${props.romId}` });
    if (detail.value.merged_screenshots?.[0]) setBg({ src: img(detail.value.merged_screenshots[0]) });
  } catch (e) { if (!cached.value) toast(e.message, 'error'); }
  const p = platformById(base.value?.platform_id);
  if (p) call('fs:space', p.target?.path).then((s) => (space.value = s));
  await nextTick();
  ensureFocus(el.value);
});
</script>

<style scoped>
.game { padding: 0 0 50px; }
.g-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 40px; min-height: 64%; padding: 30px 56px 30px; }
.g-info { display: flex; flex-direction: column; gap: 16px; max-width: 760px; min-width: 0; }
.g-title { font-size: clamp(38px, 5vw, 68px); font-weight: 800; line-height: 1; letter-spacing: -0.025em; text-shadow: 0 8px 40px rgba(0, 0, 0, 0.55); }
.g-meta { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; font-size: 15px; color: #d4d8e2; }
.g-actions { display: flex; align-items: center; gap: 12px; margin-top: 10px; flex-wrap: wrap; }
.dlbox { width: 380px; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
.dest { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); max-width: 700px; white-space: nowrap; min-width: 0; }
.dest .mono { min-width: 0; }
.g-cover { flex: none; width: 250px; aspect-ratio: 3/4; border-radius: 16px; overflow: hidden; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08); transform: perspective(1000px) rotateY(-8deg); background: #161a25; }
.g-cover img { width: 100%; height: 100%; object-fit: cover; }
.noart { height: 100%; display: grid; place-items: center; padding: 20px; text-align: center; font-family: var(--display); font-size: 20px; }
.g-body { display: grid; grid-template-columns: 1fr 320px; gap: 30px; padding: 16px 56px; background: linear-gradient(180deg, transparent, rgba(22, 8, 46, 0.45) 140px); }
.col { min-width: 0; }
.summary { margin: 0; line-height: 1.7; color: #cdd2dc; font-size: 15px; white-space: pre-line; max-width: 820px; }
.shots { padding: 18px 56px; margin: -8px -56px 0; }
.shot { flex: none; width: 340px; aspect-ratio: 16/9; border-radius: 12px; overflow: hidden; background: #161a25; transition: transform 0.2s var(--ease), box-shadow 0.2s; }
.shot img { width: 100%; height: 100%; object-fit: cover; }
.shot:focus { transform: scale(1.04); }
.facts { padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; align-self: start; }
.fact { display: flex; flex-direction: column; gap: 3px; word-break: break-word; }
.fact span { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.fact b { font-weight: 400; font-size: 13.5px; }
.viewer { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.94); z-index: 40; display: grid; place-items: center; animation: fade 0.2s; }
.viewer img { max-width: 94vw; max-height: 84vh; border-radius: 10px; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.7); }
.vhint { position: absolute; bottom: 26px; display: flex; gap: 8px; align-items: center; color: var(--muted); font-size: 13px; }
@media (max-width: 1100px) { .g-body { grid-template-columns: 1fr; } .g-cover { width: 200px; } }
</style>
