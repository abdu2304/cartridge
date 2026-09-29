<template>
  <div class="view game" data-scroll ref="el">
    <div v-if="!base" class="center"><div class="spinner" /></div>
    <template v-else>
      <section class="g-banner">
        <img v-if="banner.src" class="g-banner-img" :class="{ blur: banner.blur }" :src="banner.src" @error="bannerFail = true" />
        <div class="g-banner-shade" />
        <div class="g-banner-logo"><GameLogo :logo="store.config.ui.logos !== false ? logoOf(base) : null" :name="base.name" cls="g-title" :area="40000" :max-w="560" :max-h="150" /></div>
      </section>
      <section class="g-hero">
        <div class="g-info">
          <div class="eyebrow row" style="gap: 8px"><PIcon :p="{ slug: base.platform_slug, fs_slug: base.platform_fs_slug }" :size="18" />{{ base.platform_display_name }}</div>
          <div class="g-meta">
            <span v-if="isNew(base)" class="chip new">NEW</span>
            <span v-if="yr">{{ yr }}</span>
            <span v-if="dev">{{ dev }}</span>
            <span v-if="genres">{{ genres }}</span>
            <span v-if="base.rating" class="row" style="gap: 4px; color: var(--gold)"><Icon name="mdiStar" :size="16" />{{ rating(base.rating) }}</span>
            <span v-if="fav" class="chip primary"><Icon name="mdiHeart" :size="14" />Favourite</span>
            <span v-if="statusText" class="chip"><Icon name="mdiProgressCheck" :size="14" />{{ statusText }}</span>
            <span v-if="cached?.user?.hidden" class="chip"><Icon name="mdiEyeOffOutline" :size="14" />Hidden</span>
            <span v-if="play" class="chip" :title="play.src ? 'From ' + play.src : ''"><Icon name="mdiClockOutline" :size="14" />{{ play.min ? playtimeText(play.min) + ' played' : 'Played' }}<template v-if="play.last"> · {{ ago(play.last) }}</template><template v-if="play.remote && play.device"> on {{ play.device }}</template></span>
          </div>

          <!-- HowLongToBeat: its logo comes from your RomM server (RomM ships it), so none is kept here -->
          <div v-if="beat" class="beat glass">
            <div class="beat-brand">
              <img v-if="!hltbLogoFail" :src="img('/assets/scrappers/hltb.png')" alt="HowLongToBeat" @error="hltbLogoFail = true" />
              <span v-else class="beat-word">HowLong<b>ToBeat</b></span>
            </div>
            <div v-for="t in beatRows" :key="t.k" class="beat-t">
              <b>{{ t.h }}<small>h</small></b>
              <span>{{ t.l }}</span>
              <i><em :style="{ width: t.w + '%' }" /></i>
            </div>
          </div>

          <div class="g-actions">
            <template v-if="dl && dl.status === 'downloading'">
              <div class="dlbox glass">
                <div class="row" style="justify-content: space-between; font-size: 13px">
                  <b>Downloading</b><span class="muted">{{ pct }}% · {{ bytes(dl.speed) }}/s</span>
                </div>
                <div class="bar live"><i :style="{ width: pct + '%' }" /></div>
                <div class="muted mono" style="font-size: 11.5px">{{ dl.currentFile || bytes(dl.received) + ' of ' + bytes(dl.total) }}</div>
              </div>
              <button class="btn danger" data-focus data-autofocus @click="call('dl:cancel', dl.id)"><Icon name="mdiPause" />Pause</button>
            </template>
            <template v-else-if="dl && dl.status === 'queued'">
              <button class="btn xl" data-focus data-autofocus disabled><Icon name="mdiClockOutline" />Queued</button>
              <button class="btn danger" data-focus @click="call('dl:cancel', dl.id)"><Icon name="mdiClose" />Cancel</button>
            </template>
            <template v-else-if="installedPath && marked">
              <button class="btn ok xl" data-focus data-autofocus @click="toast('You marked this game as installed', 'info', 3000, 'mdiCheckCircle')"><Icon name="mdiCheckCircle" />Marked as installed</button>
              <button class="btn" data-focus @click="dlNow"><Icon name="mdiDownload" />Download</button>
              <button class="btn" data-focus @click="setMark(false)"><Icon name="mdiCheckboxBlankOffOutline" />Unmark</button>
            </template>
            <template v-else-if="installedPath">
              <button class="btn ok xl" data-focus data-autofocus @click="toast(installedPath, 'info', 4000, 'mdiFolder')"><Icon name="mdiCheckCircle" />Ready to play</button>
              <button class="btn" data-focus @click="redownload"><Icon name="mdiRefresh" />Re-download</button>
              <button class="btn danger" data-focus @click="remove"><Icon name="mdiDeleteOutline" />Delete</button>
            </template>
            <template v-else>
              <button class="btn primary xl" data-focus data-autofocus @click="dlNow"><Icon name="mdiDownload" :size="22" />{{ dl?.status === 'cancelled' ? 'Resume' : 'Download' }} · {{ bytes(base.fs_size_bytes) }}</button>
            </template>
            <button class="btn icon-btn" data-focus title="More options" @click="more"><Icon name="mdiDotsHorizontal" :size="22" /><span>More</span></button>
          </div>
          <div v-if="dl && dl.status === 'error'" class="chip red" style="align-self: flex-start">Last attempt failed: {{ dl.error }}</div>
          <div class="dest"><Icon name="mdiFolderArrowDownOutline" :size="16" /><span class="mono">{{ marked ? 'Marked as installed by you' : installedPath || target?.path || 'No folder set for this system' }}</span><span v-if="space" class="muted">· {{ bytes(space.free) }} free</span></div>
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
          <template v-if="ra">
            <div class="shelf-title" style="margin-top: 22px"><Icon name="mdiTrophyOutline" :size="20" />Achievements<span class="count">{{ ra.earned }} / {{ ra.total }}</span></div>
            <div class="ra-sum">
              <div class="bar ra-sum-bar"><i :style="{ width: (ra.total ? Math.round((ra.earned / ra.total) * 100) : 0) + '%' }" /></div>
              <span class="muted small">{{ ra.total ? Math.round((ra.earned / ra.total) * 100) : 0 }}% complete<template v-if="ra.earnedHc"> · {{ ra.earnedHc }} hardcore</template><template v-if="ra.award === 'mastered'"> · Mastered</template></span>
              <button class="btn small" data-focus @click="go('ra-game', { gameId: ra.gameId })"><Icon name="mdiTrophyVariantOutline" :size="18" />See all</button>
            </div>
            <div class="shelf ra-badges" data-hscroll>
              <button v-for="a in raBadges" :key="a.id" class="ra-b" :class="{ locked: !a.earned && !a.earnedHc }" data-focus :title="a.title" @click="go('ra-game', { gameId: ra.gameId })" @focus="raFocus = a">
                <img :src="img(a.badge)" loading="lazy" />
              </button>
            </div>
            <div v-if="raFocus" class="ra-focus"><b>{{ raFocus.title }}</b> · {{ raFocus.points }} pts<template v-if="!raFocus.earned && !raFocus.earnedHc"> · Locked</template><div class="muted">{{ raFocus.desc }}</div></div>
          </template>
          <template v-if="tro">
            <div class="shelf-title" style="margin-top: 22px"><Grade :g="tro.kind === 'gamerscore' ? null : 'G'" :size="20" />{{ tro.kind === 'gamerscore' ? 'Achievements' : 'Trophies' }}<span class="count">{{ tro.light.earned }} / {{ tro.light.total }}</span></div>
            <div class="ra-sum">
              <div class="bar ra-sum-bar tro-bar"><i :style="{ width: (tro.light.total ? Math.round((tro.light.earned / tro.light.total) * 100) : 0) + '%' }" /></div>
              <span class="muted small tro-grades">
                <template v-if="tro.kind === 'gamerscore'">{{ tro.light.score }} / {{ tro.light.possible }} G</template>
                <template v-else><template v-for="k in ['P', 'G', 'S', 'B']" :key="k"><span v-if="tro.light.grades[k]"><Grade :g="k" :size="14" />{{ tro.light.grades[k] }}</span></template>{{ tro.light.total ? Math.round((tro.light.earned / tro.light.total) * 100) : 0 }}% complete</template>
                <template v-if="tro.light.devices.length > 1"> · {{ tro.light.devices.length }} devices</template>
              </span>
              <button class="btn small" data-focus @click="go('trophy-game', { tkey: tro.key })"><Icon name="mdiTrophyVariantOutline" :size="18" />See all</button>
            </div>
            <div class="shelf ra-badges" data-hscroll>
              <button v-for="t in troBadges" :key="t.id" class="ra-b" :class="{ locked: !t.unlocked }" data-focus @click="go('trophy-game', { tkey: tro.key })" @focus="troFocus = t">
                <img v-if="t.icon && (t.unlocked || !t.hidden)" :src="t.icon" loading="lazy" /><span v-else class="tro-ph"><Grade :g="t.grade" :size="30" /></span>
              </button>
            </div>
            <div v-if="troFocus" class="ra-focus"><Grade :g="troFocus.grade" :size="14" /> <b>{{ troFocus.hidden && !troFocus.unlocked ? 'Hidden trophy' : troFocus.name }}</b><template v-if="troFocus.points"> · {{ troFocus.points }} G</template><template v-if="!troFocus.unlocked"> · Locked</template><template v-else-if="troFocus.time"> · {{ new Date(troFocus.time).toLocaleDateString() }}</template><div class="muted">{{ troFocus.hidden && !troFocus.unlocked ? '' : troFocus.desc }}</div></div>
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
          <template v-for="row in related" :key="row.id">
            <div class="shelf-title" style="margin-top: 16px"><Icon :name="row.icon" :size="20" />{{ row.title }}<span class="count">{{ row.items.length }}</span></div>
            <div class="shelf rel" data-hscroll>
              <GameCard v-for="r in row.items" :key="r.id" :rom="r" :show-platform="true" @open="(r) => go('game', { romId: r.id })" />
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
import { addGame, removeGame, applyChanges } from '../steam.js';
import { computed, onMounted, ref, nextTick, watch } from 'vue';
import { store, call, img, go, cover, bytes, year, rating, toast, confirm, download, downloadFor, romById, platformById, isNew, setBg, logoOf, resetLogos, artFor, choose, openModal, allRoms, visible, isFavourite, addToCollection, playOf, playtimeText, ago, loadPlay, askText, saveConfig } from '../store.js';
import { useView } from '../useView.js';
import { ensureFocus, focusFirst } from '../nav.js';
import Icon from '../components/Icon.vue';
import Btn from '../components/Btn.vue';
import PIcon from '../components/PIcon.vue';
import GameLogo from '../components/GameLogo.vue';
import Grade from '../components/Grade.vue';
import GameCard from '../components/GameCard.vue';

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
    y: () => more(),
  },
  [{ b: 'A', label: 'Select' }, { b: 'X', label: 'Download' }, { b: 'Y', label: 'More' }, { b: 'B', label: 'Back' }],
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
// PS4 / PS5: games come as zips you extract yourself, so let the user mark them as installed
const folderSystem = computed(() => ['ps4', 'ps5'].includes(base.value?.platform_slug) || ['ps4', 'ps5'].includes(base.value?.platform_fs_slug));
const marked = computed(() => installedPath.value === '(marked as installed)');
async function setMark(on) {
  try {
    await call('roms:mark', { romId: Number(props.romId), on });
    toast(on ? 'Marked as installed' : 'Mark removed', 'ok', 2200, on ? 'mdiCheckCircle' : 'mdiCheckboxBlankOffOutline');
  } catch (e) { toast(e.message, 'error'); }
}
// RetroAchievements for this game (only for consoles RA supports, and only when signed in)
const ra = ref(null);
const raFocus = ref(null);
const raBadges = computed(() => {
  const l = ra.value?.achievements || [];
  return [...l.filter((a) => a.earned || a.earnedHc), ...l.filter((a) => !a.earned && !a.earnedHc)];
});
async function loadRa() {
  if (!store.config.ra?.user || store.config.ui.raOnGames === false || !base.value) return;
  try {
    const b = base.value;
    const gameId = await call('ra:forRom', { ra_id: b.ra_id || detail.value?.ra_id || null, name: b.name, slug: b.platform_slug, fs_slug: b.platform_fs_slug });
    if (gameId) ra.value = await call('ra:game', { gameId });
  } catch {}
}
// Emulator trophies (PS3 / PS4 / Xbox 360 / Vita), read on this device and synced through RomM
const TROPHY_SLUGS = ['ps3', 'ps4', 'xbox360', 'psvita'];
const trophySystem = computed(() => TROPHY_SLUGS.includes(base.value?.platform_slug) || TROPHY_SLUGS.includes(base.value?.platform_fs_slug));
const tro = ref(null);
const troFocus = ref(null);
const troBadges = computed(() => { const l = tro.value?.trophies || []; return [...l.filter((t) => t.unlocked).sort((a, b) => (b.time || 0) - (a.time || 0)), ...l.filter((t) => !t.unlocked)]; });
async function loadTrophies() {
  if (!trophySystem.value || store.config.ui.trophyOnGames === false) { tro.value = null; return; }
  try { tro.value = await call('trophies:forRom', { romId: Number(props.romId) }); } catch { tro.value = null; }
}
watch(() => store.trophyVer, loadTrophies);
async function linkTrophies() {
  const list = await call('trophies:linkable', { slug: base.value.platform_slug, fs_slug: base.value.platform_fs_slug }).catch(() => []);
  if (!list.length) { toast('No trophy data for this console yet. Check Settings → Achievements.', 'info', 4500, 'mdiTrophyOutline'); return; }
  const opts = list.map((g) => ({ label: g.title, sub: `${g.earned}/${g.total} · ${g.short}${g.romId && g.romId !== Number(props.romId) ? ' · linked to another game' : ''}`, value: g.key, icon: 'mdiTrophyOutline', selected: tro.value?.key === g.key }));
  if (tro.value) opts.push({ label: 'Unlink', sub: 'Show no trophies on this game', value: '__none', icon: 'mdiLinkOff' });
  const v = await choose({ title: 'Link trophies to ' + base.value.name, options: opts });
  if (!v) return;
  if (v === '__none') await call('trophies:link', { key: tro.value.key, romId: null });
  else await call('trophies:link', { key: v, romId: Number(props.romId) });
  await loadTrophies();
  toast(v === '__none' ? 'Trophies unlinked' : 'Trophies linked', 'ok', 2200, 'mdiLink');
}
// Header banner: your chosen background, else the first screenshot, else the cover (blurred)
const bannerFail = ref(false);
const banner = computed(() => {
  if (!base.value) return {};
  const h = artFor(props.romId).hero;
  if (h) return { src: img(h) };
  const shot = !bannerFail.value && (detail.value?.merged_screenshots?.[0] || cached.value?.shot);
  if (shot) return { src: img(shot) };
  return { src: cover(base.value, true), blur: true };
});
// HowLongToBeat: RomM's own times when it has them, else Cartridge asks HLTB (cached)
const hltbLive = ref(null);
const halfHours = (sec) => (sec > 0 ? Math.round((sec / 3600) * 2) / 2 : null);
const beat = computed(() => {
  const h = detail.value?.hltb_metadata;
  const fromRomm = h && (h.main_story || h.main_plus_extra || h.completionist) ? { main: halfHours(h.main_story), extra: halfHours(h.main_plus_extra), full: halfHours(h.completionist) } : null;
  return fromRomm || hltbLive.value;
});
const hltbLogoFail = ref(false);
const play = computed(() => playOf(Number(props.romId)));

// ---------------- 0.8: timeline, edit details, theme from this game
async function openTimeline() {
  const id = Number(props.romId);
  const t = await call('rom:timeline', { romId: id }).catch(() => ({}));
  const ev = [];
  const add = (time, icon, label, sub) => { if (time && time > 0) ev.push({ t: time, icon, label, sub }); };
  add(t.created, 'mdiServerOutline', 'Added to RomM');
  if (t.firstSeen && Math.abs(t.firstSeen - (t.created || 0)) > 36e5) add(t.firstSeen, 'mdiSync', 'First synced to Cartridge');
  add(t.downloaded, 'mdiDownloadOutline', 'Downloaded', bytes(base.value.fs_size_bytes));
  add(t.steam, 'mdiSteam', 'Added to Steam');
  const unlocks = [
    ...(tro.value?.trophies || []).filter((x) => x.unlocked && x.time).map((x) => ({ t: x.time, n: x.name })),
    ...(ra.value?.achievements || []).filter((x) => x.earned || x.earnedHc).map((x) => ({ t: Date.parse(String(x.earnedHc || x.earned).replace(' ', 'T') + 'Z') || 0, n: x.title })),
  ].filter((x) => x.t).sort((a, b) => a.t - b.t);
  if (unlocks.length) add(unlocks[0].t, 'mdiTrophyOutline', 'First trophy', unlocks[0].n);
  if (unlocks.length > 1) add(unlocks[unlocks.length - 1].t, 'mdiTrophyOutline', 'Latest trophy', unlocks[unlocks.length - 1].n);
  const p = t.play || play.value;
  if (p?.last) add(p.last, 'mdiPlayOutline', 'Last played', p.min ? `${playtimeText(p.min)} in total${p.src ? ' · from ' + p.src : ''}` : '');
  ev.sort((a, b) => a.t - b.t);
  const got = (tro.value?.trophies || []).filter((x) => x.unlocked).length + (ra.value?.earned || 0);
  const all = (tro.value?.trophies || []).length + (ra.value?.total || 0);
  const stats = [
    { l: 'Played', v: p?.min ? playtimeText(p.min) : 'None yet' },
    ...(all ? [{ l: 'Trophies', v: `${got} / ${all}` }] : []),
    ...(statusText.value ? [{ l: 'Status', v: statusText.value }] : []),
  ];
  await openModal('timeline', { name: base.value.name, cover: coverSrc.value, stats, events: ev });
}
// Edit what RomM knows about the game, one field at a time (controller friendly), then save
async function editDetails() {
  const draft = { name: base.value.name, summary: detail.value?.summary ?? base.value.summary ?? '', cover: '' };
  const mine = artFor(props.romId)?.grid || '';
  for (;;) {
    const v = await choose({ title: 'Edit details', message: 'Saved to RomM, for every device', options: [
      { label: 'Name', sub: draft.name, value: 'name', icon: 'mdiFormatTitle' },
      { label: 'Description', sub: (draft.summary || 'None').slice(0, 90) + (draft.summary.length > 90 ? '…' : ''), value: 'summary', icon: 'mdiTextBoxOutline' },
      ...(mine ? [{ label: draft.cover ? 'Cover: your SteamGridDB cover' : 'Cover: keep RomM\'s', sub: draft.cover ? 'Press to keep RomM\'s instead' : 'Press to use the cover you picked here', value: 'cover', icon: 'mdiImageOutline' }] : []),
      { label: 'Save to RomM', value: 'save', icon: 'mdiContentSave', primary: true },
      { label: 'Cancel', value: 'cancel', icon: 'mdiClose' },
    ] });
    if (!v || v === 'cancel') return;
    if (v === 'name') { const n = await askText({ title: 'Name', value: draft.name, mode: 'game' }); if (n && n.trim()) draft.name = n.trim(); }
    if (v === 'summary') { const n = await askText({ title: 'Description', value: draft.summary }); if (n != null) draft.summary = n.trim(); }
    if (v === 'cover') draft.cover = draft.cover ? '' : mine;
    if (v === 'save') {
      try {
        await call('rom:edit', { romId: Number(props.romId), name: draft.name, summary: draft.summary, coverUrl: draft.cover || undefined });
        detail.value = await call('api:get', { path: `/api/roms/${props.romId}` }).catch(() => detail.value);
        toast('Saved to RomM', 'ok', 2400, 'mdiContentSave');
      } catch (e) { toast(e.message, 'error', 7000); }
      return;
    }
  }
}
// The cover's strongest colour (skipping greys, near black and near white) as a custom theme
async function coverColour(src) {
  const im = new Image(); im.crossOrigin = 'anonymous';
  await new Promise((ok, bad) => { im.onload = ok; im.onerror = bad; im.src = src; });
  const w = 48, h = Math.max(1, Math.round((im.naturalHeight / im.naturalWidth) * 48) || 72);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  const bins = Array.from({ length: 24 }, () => ({ wt: 0, r: 0, g: 0, b: 0 }));
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dd = mx - mn;
    if (dd < 0.12 || l < 0.12 || l > 0.9) continue;
    const sat = dd / (1 - Math.abs(2 * l - 1));
    let hue = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
    hue = (hue * 60 + 360) % 360;
    const bin = bins[Math.floor(hue / 15)], wt = sat * sat * (1 - Math.abs(l - 0.5));
    bin.wt += wt; bin.r += d[i] * wt; bin.g += d[i + 1] * wt; bin.b += d[i + 2] * wt;
  }
  const best = bins.reduce((a, b) => (b.wt > a.wt ? b : a));
  if (best.wt < 1) return null;
  let [r, g, b] = [best.r / best.wt, best.g / best.wt, best.b / best.wt];
  // keep it bright enough to read as an accent
  const mx = Math.max(r, g, b); if (mx < 170) { const k = 170 / mx; r *= k; g *= k; b *= k; }
  return '#' + [r, g, b].map((v) => Math.round(Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
async function themeFromGame() {
  let hex = null;
  try { hex = await coverColour(coverSrc.value); } catch {}
  if (!hex) { toast("This cover has no strong colour to use", 'info', 3500); return; }
  const ui = store.config.ui;
  const keep = ui.gameTheme ? { theme: ui.gameTheme.theme, customColor: ui.gameTheme.customColor } : { theme: ui.theme, customColor: ui.customColor || '' };
  await saveConfig({ ui: { theme: 'custom', customColor: hex, gameTheme: { ...keep, name: base.value.name } } });
  toast(`Theme from ${base.value.name}. More → Back to your own theme undoes it.`, 'ok', 4500, 'mdiPaletteOutline');
}
// the three times with a bar each, against the longest
const beatRows = computed(() => {
  const b = beat.value; if (!b) return [];
  const rows = [['main', 'Main story', b.main], ['extra', 'Main + extras', b.extra], ['full', 'Completionist', b.full]].filter((r) => r[2]);
  const max = Math.max(...rows.map((r) => r[2]));
  return rows.map(([k, l, h]) => ({ k, l, h: String(h).replace(/\.5$/, '½'), w: Math.max(6, Math.round((h / max) * 100)) }));
});
async function loadHltb() {
  if (beat.value || !base.value) return;
  const y = base.value.year ? new Date(base.value.year).getUTCFullYear() : null;
  hltbLive.value = await call('hltb:lookup', { name: base.value.name, year: y }).catch(() => null);
}

// Your RomM status for this game: favourite, play status, hidden
const fav = computed(() => isFavourite(Number(props.romId)));
const STATUSES = [
  { v: 'playing', l: 'Playing now', data: { now_playing: true, backlogged: false }, icon: 'mdiPlayCircleOutline' },
  { v: 'backlog', l: 'Backlog', data: { backlogged: true, now_playing: false }, icon: 'mdiBookClockOutline' },
  { v: 'finished', l: 'Finished', data: { status: 'finished', now_playing: false, backlogged: false }, icon: 'mdiFlagCheckered' },
  { v: 'completed_100', l: 'Completed 100%', data: { status: 'completed_100', now_playing: false, backlogged: false }, icon: 'mdiTrophyOutline' },
  { v: 'retired', l: 'Gave up', data: { status: 'retired', now_playing: false, backlogged: false }, icon: 'mdiFlagOutline' },
  { v: 'never_playing', l: 'Not for me', data: { status: 'never_playing', now_playing: false, backlogged: false }, icon: 'mdiCancel' },
];
const statusOf = (u) => (!u ? '' : u.playing ? 'playing' : u.backlog ? 'backlog' : u.status === 'incomplete' ? 'playing' : u.status || '');
const statusText = computed(() => STATUSES.find((x) => x.v === statusOf(cached.value?.user))?.l || '');
async function setUser(data, msg) {
  try { await call('rom:user', { romId: Number(props.romId), data }); toast(msg, 'ok', 2200, 'mdiCheck'); } catch (e) { toast(e.message, 'error', 6000); }
}
async function pickStatus() {
  const cur = statusOf(cached.value?.user);
  const v = await choose({ title: 'Play status', options: [...STATUSES.map((x) => ({ label: x.l, value: x.v, icon: x.icon, selected: x.v === cur })), ...(cur ? [{ label: 'Clear status', value: '__clear', icon: 'mdiClose' }] : [])] });
  if (!v) return;
  if (v === '__clear') return setUser({ status: null, now_playing: false, backlogged: false }, 'Status cleared');
  const s = STATUSES.find((x) => x.v === v);
  await setUser(s.data, `Marked as ${s.l.toLowerCase()}`);
}
// Rows under the summary: other games in the same series, and IGDB's similar games you have
const related = computed(() => {
  const me = cached.value;
  if (!me) return [];
  const roms = allRoms().filter((r) => visible(r) && r.id !== me.id);
  const out = [];
  const series = me.series?.[0];
  if (series) {
    const l = roms.filter((r) => r.series?.includes(series) && r.name !== me.name).sort((a, b) => (a.year || 9e15) - (b.year || 9e15));
    if (l.length) out.push({ id: 'series', title: 'More in this series', icon: 'mdiBookshelf', items: l.slice(0, 30) });
  }
  const sim = new Set(me.similar || []);
  if (sim.size) {
    const seen = new Set(out[0]?.items.map((r) => r.id));
    const l = roms.filter((r) => r.igdb_id && sim.has(r.igdb_id) && !seen.has(r.id));
    if (l.length) out.push({ id: 'similar', title: 'Similar games', icon: 'mdiShapeOutline', items: l.slice(0, 30) });
  }
  return out;
});

// More options: custom artwork from SteamGridDB, plus handy extras
let steamInfo = null;
async function more() {
  const has = artFor(props.romId);
  const u = cached.value?.user;
  const opts = [
    { label: fav.value ? 'Remove from favourites' : 'Add to favourites', sub: 'Saved in RomM', value: 'fav', icon: fav.value ? 'mdiHeartOff' : 'mdiHeartOutline' },
    { label: 'Play status', sub: statusText.value || 'None', value: 'status', icon: 'mdiProgressCheck' },
    { label: 'Add to a collection', sub: 'Yours in RomM, or a new one', value: 'col', icon: 'mdiBookmarkPlusOutline' },
    { label: u?.hidden ? 'Unhide game' : 'Hide game', sub: u?.hidden ? 'Show it in lists again' : 'Keep it out of Home, Library and Search', value: 'hide', icon: u?.hidden ? 'mdiEyeOutline' : 'mdiEyeOffOutline' },
    { label: 'Change metadata', sub: 'Cover, logo and background from SteamGridDB', value: 'art', icon: 'mdiImageEditOutline' },
    { label: 'Edit details', sub: 'Name, description and cover, saved to RomM', value: 'edit', icon: 'mdiPencilOutline' },
    { label: 'Timeline', sub: 'Added, downloaded, played, trophies', value: 'timeline', icon: 'mdiTimelineClockOutline' },
    ...(coverSrc.value ? [{ label: 'Theme from this game', sub: 'Cartridge takes its colours from the cover', value: 'theme', icon: 'mdiPaletteOutline' }] : []),
    ...(store.config.ui.gameTheme ? [{ label: 'Back to your own theme', sub: store.config.ui.gameTheme.name ? `Now using ${store.config.ui.gameTheme.name}` : '', value: 'untheme', icon: 'mdiUndoVariant' }] : []),
  ];
  if (folderSystem.value) {
    if (marked.value) opts.push({ label: 'Unmark as installed', sub: 'Only removes the mark, no files are touched', value: 'unmark', icon: 'mdiCheckboxBlankOffOutline' });
    else if (!installedPath.value) opts.push({ label: 'Mark as installed', sub: 'For games you extracted yourself', value: 'mark', icon: 'mdiCheckboxMarkedCircleOutline' });
  }
  if (trophySystem.value) opts.push({ label: tro.value ? 'Change linked trophies' : 'Link to trophies', sub: 'Pick which emulator trophy set belongs to this game', value: 'trophies', icon: 'mdiLinkVariant' });
  if (installedPath.value) {
    const st = await call('steam:forRom', { romId: Number(props.romId) }).catch(() => null);
    if (st?.steam) {
      if (st.queued === 'add') opts.push({ label: 'Waiting to be added to Steam', sub: 'Apply from Settings → Steam', value: 'steamapply', icon: 'mdiSteam' });
      else if (st.inSteam) opts.push({ label: 'Remove from Steam', sub: st.ours ? 'Only the shortcut, not the game' : 'Added outside Cartridge', value: 'steamrm', icon: 'mdiSteam' });
      else opts.push({ label: 'Add to Steam', sub: 'Launches with your emulator setup', value: 'steamadd', icon: 'mdiSteam' });
      steamInfo = st;
    }
  }
  opts.push({ label: 'Refresh details from RomM', value: 'refresh', icon: 'mdiRefresh' });
  if (installedPath.value) opts.push({ label: 'Show file location', value: 'path', icon: 'mdiFolderOutline' });
  let v = await choose({ title: base.value.name, options: opts });
  if (!v) return;
  // artwork choices in their own list, so More stays short
  if (v === 'art') {
    v = await choose({ title: 'Change metadata', message: base.value.name, options: [
      { label: 'Change cover', sub: 'SteamGridDB', value: 'grid', icon: 'mdiImageEditOutline' },
      { label: 'Change logo', sub: 'SteamGridDB', value: 'logo', icon: 'mdiFormatTitle' },
      { label: 'Change background', sub: 'SteamGridDB', value: 'hero', icon: 'mdiPanoramaVariantOutline' },
      ...(Object.keys(has).length ? [{ label: 'Reset artwork', sub: 'Back to RomM and automatic logo', value: 'reset', icon: 'mdiRestore' }] : []),
    ] });
    if (!v) return;
  }
  if (v === 'fav') {
    const on = !fav.value;
    try { await call('fav:set', { romId: Number(props.romId), on }); toast(on ? 'Added to favourites' : 'Removed from favourites', 'ok', 2200, 'mdiHeartOutline'); } catch (e) { toast(e.message, 'error', 6000); }
    return;
  }
  if (v === 'status') { await pickStatus(); return; }
  if (v === 'timeline') { await openTimeline(); return; }
  if (v === 'edit') { await editDetails(); return; }
  if (v === 'theme') { await themeFromGame(); return; }
  if (v === 'untheme') { const g = store.config.ui.gameTheme; await saveConfig({ ui: { theme: g.theme || 'purple', customColor: g.customColor || '', gameTheme: null } }); toast('Your own theme is back', 'ok', 2200, 'mdiUndoVariant'); return; }
  if (v === 'col') { await addToCollection([Number(props.romId)]); return; }
  if (v === 'hide') { await setUser({ hidden: !u?.hidden }, u?.hidden ? 'Shown in lists again' : 'Hidden from lists. Find it again with Library → Filters → Show hidden games.'); return; }
  if (v === 'steamadd') { await addGame({ ...base.value, id: Number(props.romId) }); return; }
  if (v === 'steamrm') {
    if (!steamInfo.ours && !(await confirm('Remove from Steam?', 'Cartridge did not add this shortcut. Remove it anyway?', 'Remove', true))) return;
    await removeGame(base.value, steamInfo.appid); return;
  }
  if (v === 'steamapply') { await applyChanges(); return; }
  if (v === 'mark' || v === 'unmark') { await setMark(v === 'mark'); return; }
  if (v === 'trophies') { await linkTrophies(); return; }
  if (v === 'path') { toast(installedPath.value, 'info', 5000, 'mdiFolder'); return; }
  if (v === 'refresh') { try { detail.value = await call('api:get', { path: `/api/roms/${props.romId}` }); resetLogos(props.romId); toast('Details refreshed', 'ok', 2000, 'mdiRefresh'); } catch (e) { toast(e.message, 'error'); } return; }
  if (v === 'reset') { store.art = { ...store.art }; delete store.art[props.romId]; await call('art:reset', { id: props.romId }); resetLogos(props.romId); toast('Artwork reset', 'ok', 2000, 'mdiRestore'); return; }
  if (!store.config.sgdbKey) { toast('Add a SteamGridDB API key in Settings → Look & feel first', 'error', 4500); return; }
  const url = await openModal('art', { kind: v, romName: base.value.name });
  if (!url) return;
  const o = await call('art:set', { id: props.romId, kind: v, url });
  store.art = { ...store.art, [props.romId]: o };
  if (v === 'logo') resetLogos(props.romId);
  if (v === 'hero') setBg({ src: img(url) });
  toast({ grid: 'Cover', logo: 'Logo', hero: 'Background' }[v] + ' updated', 'ok', 2000, 'mdiCheck');
}
function goVersion(id) { store.route = { ...store.route, params: { romId: id } }; }

watch([installedPath, () => dl.value?.status], async () => { await nextTick(); ensureFocus(el.value); });
onMounted(async () => {
  const hero = artFor(props.romId).hero;
  if (hero) setBg({ src: img(hero) });
  else if (cached.value) setBg(cached.value.shot ? { src: img(cached.value.shot) } : { src: cover(cached.value, true), blur: true });
  await nextTick();
  focusFirst(el.value);
  try {
    detail.value = await call('api:get', { path: `/api/roms/${props.romId}` });
    if (!hero && detail.value.merged_screenshots?.[0]) setBg({ src: img(detail.value.merged_screenshots[0]) });
  } catch (e) { if (!cached.value) toast(e.message, 'error'); }
  loadRa();
  loadTrophies();
  loadHltb();
  const p = platformById(base.value?.platform_id);
  if (p) call('fs:space', p.target?.path).then((s) => (space.value = s));
  await nextTick();
  ensureFocus(el.value);
});
</script>

<style scoped>
.game { padding: 0 0 50px; }
.g-banner { position: relative; margin: 18px 56px 0; height: clamp(190px, 34vh, 360px); border-radius: 16px; overflow: hidden; background: #141824; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.07); }
.g-banner-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.g-banner-img.blur { filter: blur(24px) saturate(1.3) brightness(0.8); transform: scale(1.15); }
.g-banner-shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(8, 8, 16, 0.78) 0%, rgba(8, 8, 16, 0.35) 45%, transparent 75%), linear-gradient(0deg, rgba(8, 8, 16, 0.7), transparent 55%); }
.g-banner-logo { position: absolute; left: 32px; bottom: 26px; right: 330px; display: flex; align-items: flex-end; }
.g-hero { position: relative; display: flex; align-items: flex-start; justify-content: space-between; gap: 40px; padding: 22px 56px 24px; }
.g-info { display: flex; flex-direction: column; gap: 16px; max-width: 760px; min-width: 0; }
.g-title { font-size: clamp(38px, 5vw, 68px); font-weight: 800; line-height: 1; letter-spacing: -0.025em; text-shadow: 0 8px 40px rgba(0, 0, 0, 0.55); }
.g-meta { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; font-size: 15px; color: #d4d8e2; }
.g-actions { display: flex; align-items: center; gap: 12px; margin-top: 10px; flex-wrap: wrap; }
.dlbox { width: 380px; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
.dest { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); max-width: 700px; white-space: nowrap; min-width: 0; }
.dest .mono { min-width: 0; }
.g-cover { flex: none; width: 250px; margin-top: -190px; margin-right: 26px; z-index: 2; aspect-ratio: 2/3; border-radius: 10px; overflow: hidden; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08); transform: perspective(1000px) rotateY(-8deg); background: #161a25; }
.g-cover img { width: 100%; height: 100%; object-fit: cover; }
.noart { height: 100%; display: grid; place-items: center; padding: 20px; text-align: center; font-family: var(--display); font-size: 20px; }
.g-body { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 40px; padding: 16px 56px; background: linear-gradient(180deg, transparent, rgba(var(--tint-rgb), 0.45) 140px); }
.col { min-width: 0; }
.summary { margin: 0; line-height: 1.7; color: #cdd2dc; font-size: 15px; white-space: pre-line; max-width: 820px; }
.shots { padding: 18px 20px 18px 56px; margin: -8px 0 0 -56px; scroll-padding: 0 56px; }
.shot { flex: none; width: 340px; aspect-ratio: 16/9; border-radius: 8px; overflow: hidden; background: #161a25; transition: transform 0.2s var(--ease), box-shadow 0.2s; }
.shot img { width: 100%; height: 100%; object-fit: cover; }
.shot:focus { transform: scale(1.04); }
/* HowLongToBeat card: logo, then each time as a big number with a bar against the longest */
.beat { display: flex; align-items: stretch; gap: 0; align-self: flex-start; padding: 12px 6px 12px 16px; border-radius: 14px; max-width: 100%; }
.beat-brand { display: flex; align-items: center; padding-right: 16px; margin-right: 4px; border-right: 1px solid var(--line); }
.beat-brand img { height: 30px; width: auto; max-width: 120px; object-fit: contain; }
.beat-word { font-family: var(--display); font-size: 14px; font-weight: 600; letter-spacing: -0.01em; color: var(--text); }
.beat-word b { color: #5aa5ff; font-weight: 700; }
.beat-t { display: flex; flex-direction: column; justify-content: center; gap: 3px; min-width: 104px; padding: 0 14px; }
.beat-t + .beat-t { border-left: 1px solid var(--line); }
.beat-t b { font-family: var(--display); font-size: 22px; font-weight: 700; line-height: 1; color: var(--text); }
.beat-t b small { font-size: 13px; font-weight: 600; margin-left: 2px; color: var(--muted); }
.beat-t span { font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600; color: var(--muted); white-space: nowrap; }
.beat-t i { display: block; height: 3px; border-radius: 3px; background: rgba(255, 255, 255, 0.08); overflow: hidden; margin-top: 3px; }
.beat-t em { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg, #3d8bff, #7fc0ff); }
.rel { padding: 18px 20px 18px 56px; margin: -8px 0 0 -56px; scroll-padding: 0 56px; }
.facts { width: 250px; padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; align-self: start; box-sizing: border-box; }
.icon-btn span { font-size: 14px; }
.fact { display: flex; flex-direction: column; gap: 3px; word-break: break-word; }
.fact span { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.fact b { font-weight: 400; font-size: 13.5px; }
.viewer { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.94); z-index: 40; display: grid; place-items: center; animation: fade 0.2s; }
.viewer img { max-width: 94vw; max-height: 84vh; border-radius: 7px; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.7); }
.vhint { position: absolute; bottom: 26px; display: flex; gap: 8px; align-items: center; color: var(--muted); font-size: 13px; }
@media (max-width: 1100px) { .g-body { grid-template-columns: minmax(0, 1fr) 200px; gap: 28px; } .g-cover, .facts { width: 200px; } .g-cover { margin-top: -150px; } .g-banner-logo { right: 270px; } }
.ra-sum { display: flex; align-items: center; gap: 14px; margin: -2px 0 4px; }
.ra-sum-bar { flex: 0 1 320px; height: 7px; }
.ra-sum-bar i { background: linear-gradient(90deg, #f5c542, #ffdf80); }
.small { font-size: 13px; }
.ra-badges { gap: 10px; padding: 12px 20px 12px 56px; margin: 0 0 0 -56px; }
.ra-b { flex: none; width: 60px; height: 60px; border-radius: 8px; overflow: hidden; transition: transform 0.14s ease-out; box-shadow: 0 6px 14px rgba(0, 0, 0, 0.4); }
.ra-b img { width: 100%; height: 100%; display: block; }
.ra-b.locked { opacity: 0.55; }
.ra-b:focus { transform: scale(1.12); }
.tro-bar i { background: linear-gradient(90deg, #7fa8ff, #cfe0ff); }
.tro-grades { display: inline-flex; gap: 10px; align-items: center; }
.tro-grades span { display: inline-flex; gap: 3px; align-items: center; }
.tro-ph { width: 100%; height: 100%; display: grid; place-items: center; background: rgba(0, 0, 0, 0.35); }
.ra-focus { font-size: 13px; margin: 2px 0 6px; max-width: 760px; }
</style>
