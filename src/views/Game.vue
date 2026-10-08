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

          <div class="g-actions" data-top>
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
              <button class="btn primary ok xl" data-focus data-autofocus @click="toast('You marked this game as installed', 'info', 3000, 'mdiCheckCircle')"><Icon name="mdiCheckCircle" />Marked as installed</button>
              <button class="btn" data-focus @click="dlNow"><Icon name="mdiDownload" />Download</button>
              <button class="btn" data-focus @click="setMark(false)"><Icon name="mdiCheckboxBlankOffOutline" />Unmark</button>
            </template>
            <template v-else-if="installedPath">
              <button v-if="pkgBusy" class="btn xl" data-focus data-autofocus @click="cancelPkg"><Icon name="mdiLoading" class="spin" :size="22" />{{ pkgProg?.opens ? `Close ${emuName} to finish` : `Installing in ${emuName}` }}{{ pkgProg?.of > 1 ? ` · ${pkgProg.step} of ${pkgProg.of}` : '' }}</button>
              <button v-else-if="needsInstall" class="btn primary xl" data-focus data-autofocus @click="installPkg"><Icon name="mdiPackageDown" :size="22" />Install in {{ emuName }}</button>
              <button v-else-if="pkg?.licenceMissing?.length" class="btn primary xl" data-focus data-autofocus @click="addLicence"><Icon name="mdiKeyOutline" :size="22" />Get licence (.rap)</button>
              <button v-else class="btn primary ok xl" data-focus data-autofocus @click="playNow"><Icon name="mdiCheckCircle" />Ready to play</button>
              <!-- Re-download and Delete live in More → Options (owner, 0.9.16); the ring shows while deleting -->
              <button v-if="deleting != null" class="btn danger icon-btn" data-focus disabled><Ring :pct="deleting" :size="22" /><span>Deleting</span></button>
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
              <GameCard v-for="r in row.items" :key="r.id" :rom="r" :show-platform="true" :extra="row.why?.get(r.id) || ''" @open="(r) => go('game', { romId: r.id })" />
            </div>
          </template>
        </div>
        <aside class="facts glass">
          <!-- critic score and age rating as badges (0.9.3 F8); each hidden when RomM has nothing -->
          <div v-if="score || age" class="badges">
            <div v-if="score" class="score" :class="score.tone" :title="score.from"><b>{{ score.v }}</b><span>{{ score.label }}</span></div>
            <img v-if="age?.img && !ageFail" class="age-img" :src="age.img" :alt="age.text" @error="ageFail = true" />
            <div v-else-if="age" class="age" :class="age.kind">{{ age.text }}</div>
          </div>
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
import { similarTo } from '../recs.js';
import { addGame, removeGame, applyChanges, pickEmulator, pickCollections, pickFrameGen } from '../steam.js';
import { computed, onMounted, onBeforeUnmount, ref, nextTick, watch } from 'vue';
import { store, heroArt, call, img, go, cover, bytes, year, rating, toast, confirm, download, downloadFor, romById, platformById, isNew, setBg, logoOf, resetLogos, artFor, choose, openModal, allRoms, visible, isFavourite, addToCollection, playOf, playtimeText, ago, loadPlay, askText, saveConfig, backdropOf, wantSharp, bgJob, playGame, saveSyncOn } from '../store.js';
import { pinToStart } from '../startTiles.js';
import { useView } from '../useView.js';
import { ensureFocus, focusFirst } from '../nav.js';
import Icon from '../components/Icon.vue';
import Btn from '../components/Btn.vue';
import PIcon from '../components/PIcon.vue';
import GameLogo from '../components/GameLogo.vue';
import Grade from '../components/Grade.vue';
import GameCard from '../components/GameCard.vue';
import Ring from '../components/Ring.vue';

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
  return { ...c, ...d, name: d.name || d.fs_name_no_ext, year: md.first_release_date, rating: md.average_rating, genres: md.genres || [], developer: [md, d.igdb_metadata, d.ss_metadata, d.launchbox_metadata, d.moby_metadata].map((b) => b?.developers?.find?.((x) => typeof x === 'string' && x.trim())).find(Boolean) || md.companies?.[0] || '' /* developers first: companies' first can be the publisher (0.9.3 L) */, shot: d.merged_screenshots?.[0] || c?.shot };
});
const coverSrc = computed(() => base.value && cover(base.value, true));
const shots = computed(() => detail.value?.merged_screenshots || (cached.value?.shot ? [cached.value.shot] : []));
const summary = computed(() => detail.value?.summary || cached.value?.summary || '');
const target = computed(() => platformById(base.value?.platform_id)?.target);
const installedPath = computed(() => store.installed[props.romId]);
const deleting = computed(() => store.deleting[props.romId] ?? null);
const dl = computed(() => downloadFor(props.romId));
const pct = computed(() => (dl.value?.total ? Math.floor((dl.value.received / dl.value.total) * 100) : 0));
const md = computed(() => detail.value?.metadatum || {});
const yr = computed(() => year(base.value?.year));
const dev = computed(() => base.value?.developer);
const genres = computed(() => (base.value?.genres || []).slice(0, 3).join(' · '));
// Score: IGDB's critic score, else RomM's combined rating (ScreenScraper, MobyGames, LaunchBox), on 100
const score = computed(() => {
  const ig = detail.value?.igdb_metadata || {};
  const pick = [[ig.aggregated_rating, 'Critics', 'IGDB critic score'], [md.value.average_rating, 'Rating', 'RomM rating from its metadata sources']].find(([v]) => Number(v) > 0);
  if (!pick) return null;
  let v = Number(pick[0]); if (v <= 10) v *= 10;
  v = Math.round(v);
  return { v, label: pick[1], from: pick[2], tone: v >= 75 ? 'good' : v >= 50 ? 'mid' : 'low' };
});
// Age rating: RomM's rating image (IGDB), else a badge drawn from the text (PEGI 16, ESRB M)
const ageFail = ref(false);
const age = computed(() => {
  const list = detail.value?.igdb_metadata?.age_ratings || [];
  const withImg = list.find((a) => a?.rating_cover_url);
  const text = (withImg?.rating ? `${withImg.category || ''} ${withImg.rating}` : md.value.age_ratings?.[0] || list[0]?.rating || '').toString().trim();
  if (!text && !withImg) return null;
  return { img: withImg?.rating_cover_url ? img(withImg.rating_cover_url) : null, text, kind: /pegi/i.test(text) ? 'pegi' : /esrb/i.test(text) ? 'esrb' : '' };
});
const facts = computed(() => {
  const r = base.value, m = md.value, out = [];
  if (m.publishers?.length) out.push({ k: 'Publisher', v: m.publishers.slice(0, 2).join(', ') });
  if (m.developers?.length) out.push({ k: 'Developer', v: m.developers.slice(0, 2).join(', ') });
  if (m.franchises?.length) out.push({ k: 'Franchise', v: m.franchises[0] });
  if (m.game_modes?.length) out.push({ k: 'Modes', v: m.game_modes.join(', ') });
  if (m.player_count) out.push({ k: 'Players', v: m.player_count });
  if (m.age_ratings?.length && !age.value) out.push({ k: 'Rating', v: m.age_ratings.slice(0, 2).join(', ') });
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
  const rec = pkg.value?.installed;
  let alsoEmu = false;
  if (rec?.created && store.installed[props.romId] === rec.dir) {
    // only the copy in RPCS3 is left (the download was deleted after installing)
    if (!(await confirm(`Delete ${base.value.name} from ${emuName.value}?`, `Removes the game Cartridge installed in ${emuName.value}:\n${rec.serial} · ${rec.dir}\n\n${rec.emu === 'vita3k' ? 'Saves, DLC and licences stay.' : 'Updates and DLC installed into it go with it. Saves, trophies and licences stay.'} It stays on your RomM server.`, 'Delete', true))) return;
  } else if (rec?.created) {
    const v = await choose({ title: `Delete ${base.value.name}?`, message: `The download is on this device, and Cartridge installed the game in ${emuName.value} (${rec.serial}).`, options: [
      { label: 'Delete the download only', sub: installedPath.value, value: 'dl', icon: 'mdiDeleteOutline' },
      { label: `Delete the download and the game in ${emuName.value}`, sub: `${rec.dir} · ${rec.emu === 'vita3k' ? 'saves, DLC and licences stay' : 'updates and DLC go with it; saves, trophies and licences stay'}`, value: 'both', icon: 'mdiDeleteForeverOutline', danger: true },
    ] });
    if (!v) return;
    alsoEmu = v === 'both';
  } else if (!(await confirm(`Delete ${base.value.name}?`, `Removes it from this device:\n${installedPath.value}\n\nIt stays on your RomM server.`, 'Delete', true))) return;
  try { await call('roms:delete', { romId: props.romId, path: installedPath.value, alsoEmu }); toast('Deleted from this device', 'ok', 2400, 'mdiDeleteOutline'); loadPkg(); } catch (e) { toast(e.message, 'error', 7000); }
}
// PS3 games that come as .pkg (0.9.3 D): installed through RPCS3 when you press Install. What's in
// the download, whether Cartridge installed it, and the install's progress.
const pkg = ref(null);
const pkgProg = ref(null);
const pkgBusy = computed(() => pkgProg.value?.state === 'running' || pkg.value?.running || !!bgJob('pkg:' + props.romId)); // 0.9.32: still installing from before
const needsInstall = computed(() => pkg.value?.pkgs > 0 && !pkg.value.installed);
const emuName = computed(() => pkg.value?.emuName || 'RPCS3');
async function loadPkg() { pkg.value = installedPath.value ? await call('pkg:check', { romId: Number(props.romId) }).catch(() => null) : null; }
watch(installedPath, loadPkg);
const offPkg = window.cart.on('pkg-progress', (p) => { if (p.romId === Number(props.romId)) pkgProg.value = p; });
onBeforeUnmount(() => { try { offPkg?.(); } catch {} });
async function installPkg() {
  const p = pkg.value, emu = emuName.value;
  if (!p?.cmd) return toast(`${emu} wasn’t found. Set it up in Settings → Emulators.`, 'error', 6000);
  let zrif;
  if (p.emu === 'vita3k') {
    if (p.needsZrif) {
      toast('This Vita .pkg needs its licence key (zRIF). Put it in a .txt file next to the game to skip this next time.', 'info', 8000, 'mdiKeyOutline');
      zrif = await askText({ title: 'zRIF key (starts with KO5i)', placeholder: 'KO5ifR1dQd3...' });
      if (!zrif) return;
    }
    const how = p.opens ? 'Vita3K opens and starts the game once it is installed. Close Vita3K to finish.' : 'Vita3K installs it into its own storage, without opening its window.';
    if (!(await confirm('Install in Vita3K?', `${how}\n\n${p.cmd} · ${p.titleIds[0]}`, 'Install'))) return;
  } else {
    // PSN games need their licence (.rap) next to the .pkg: found in the download or in RomM, and
    // nothing is installed without it
    const what = [`${p.pkgs} package${p.pkgs === 1 ? '' : 's'}`, p.updates ? `${p.updates} update${p.updates === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ');
    const lic = p.needsLicence?.length ? `Licence: ${p.needsLicence.map((l) => l.contentId + '.rap').join(', ')} isn't in the download, so Cartridge looks for it in RomM. If it isn't there, nothing is installed.`
      : p.licences ? `Licence: found (${p.licences} .rap file${p.licences === 1 ? '' : 's'}), installed with it.` : 'Licence: this game doesn\'t need one, or RPCS3 already has it.';
    if (!(await confirm('Install in RPCS3?', `RPCS3 (${p.cmd}) installs ${what} into its own storage, without opening its window. Big games take a few minutes.\n\nPS3 games from the store need their licence file (.rap) next to the .pkg.\n${lic}`, 'Install'))) return;
  }
  pkgProg.value = { state: 'running', step: 0, of: 0, opens: p.opens };
  try {
    const r = await call('pkg:install', { romId: Number(props.romId), zrif });
    if (r.licenceMissing?.[0]?.vita) toast(`${base.value.name} is installed in Vita3K, but it has no licence, so it won't start. Install it from its .pkg with its zRIF key instead.`, 'error', 9000, 'mdiKeyOutline');
    else if (r.licenceMissing?.length) toast(`${base.value.name} is installed in ${emu}, but RPCS3 didn't take its licence (${r.licenceMissing[0].contentId}.rap), so it won't start yet.`, 'error', 9000, 'mdiKeyOutline');
    else toast(`${base.value.name} is installed in ${emu} (${r.serial})`, 'ok', 4000, 'mdiCheckCircle');
    await loadPkg();
    if (r.created && (await confirm('Delete the downloaded package?', `It isn't needed to play any more: the game is in ${emu} now.\n${installedPath.value}`, 'Delete', true))) {
      try { await call('pkg:dropDownload', { romId: Number(props.romId) }); toast('Package deleted', 'ok', 2400, 'mdiDeleteOutline'); } catch (e) { toast(e.message, 'error'); }
    }
  } catch (e) { toast(e.message, 'error', 8000); }
  pkgProg.value = null;
  loadPkg();
}
// a licence for a game already installed in RPCS3 without one: found in its download or in RomM
async function addLicence() {
  try { await call('pkg:addLicence', { romId: Number(props.romId) }); toast('Licence added. The game can start now.', 'ok', 3500, 'mdiKeyOutline'); } catch (e) { toast(e.message, 'error', 9000); }
  loadPkg();
}
async function cancelPkg() {
  if (await confirm('Stop installing?', `${emuName.value} is closed now. What it was installing may be left half done; install again to finish it.`, 'Stop', true)) call('pkg:cancel');
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
// Header banner: your chosen background, else SteamGridDB's sharpest (0.9.3 K), else the first
// screenshot, else the cover (blurred)
const bannerFail = ref(false);
const banner = computed(() => {
  if (!base.value) return {};
  const h = artFor(props.romId).hero;
  if (h) return { src: img(h) };
  // SteamGridDB's hero only (0.9.21): nothing until it's known, RomM's screenshot only without a key
  const a = heroArt(base.value);
  if (a || store.config?.sgdbKey) return a || {};
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
  // similar games: IGDB's list when the server has it, else genres, studio and the rest (recs.js)
  const seen = new Set(out[0]?.items.map((r) => r.id));
  const sim = similarTo(me, roms.filter((r) => !seen.has(r.id)), { skipSeries: true });
  if (sim.length) out.push({ id: 'similar', title: 'Similar games', icon: 'mdiShapeOutline', items: sim.map((x) => x.rom), why: new Map(sim.map((x) => [x.rom.id, x.why])) });
  return out;
});

// 0.9: one game can start with another emulator than its console (a game that runs better elsewhere)
async function pickGameEmu() {
  const romId = Number(props.romId);
  const ge = await call('steam:gameEmu', { romId });
  const list = await call('steam:gameEmuOptions', { key: ge.key });
  if (!list.length) return toast('No other emulator for this console was found. Run Emulator setup in Settings → Emulators.', 'info', 5000);
  const v = await pickEmulator({ title: 'Emulator for this game', message: base.value.name, list, current: ge.current, first: [{ label: 'Same as its console', value: '__console', selected: !ge.current, icon: 'mdiArrowULeftTop' }] });
  if (!v) return;
  await call('steam:setGameEmu', { romId, id: v === '__console' ? null : v });
  const st = await call('steam:forRom', { romId }).catch(() => null);
  if (st?.inSteam && st.ours && st.console) {
    const r = await call('steam:refreshGame', { romId }).catch(() => null); // only this game's shortcut
    if (r?.count && !r.fixed) await applyChanges();
    toast(r?.fixed ? 'Its Steam shortcut now uses it' : 'Saved. Its Steam shortcut is being updated.', 'ok', 3000, 'mdiGamepadVariantOutline');
  } else toast('Saved. Used when it goes into Steam.', 'ok', 2600, 'mdiGamepadVariantOutline');
}

// More options: custom artwork from SteamGridDB, plus handy extras
let steamInfo = null;
// Syncthing's older versions of one save (0.9.29): grouped by when they were replaced; restoring puts that
// version back through Syncthing (its own versioning), the only time Cartridge asks for a save to change
// Cartridge Save Sync for this game (0.9.51): sync now, or put an older version back (it becomes the newest everywhere;
// the save it replaces is kept here first)
async function cloudSaves() {
  const id = Number(props.romId);
  let list = []; try { list = await call('savesync:versions', { romId: id }); } catch (e) { toast(e.message, 'error', 5000); return; }
  const fmt = (t) => { try { return new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch { return t; } };
  const v = await choose({ title: 'Saves in RomM', message: list.length ? 'The newest of each save is what your devices get. Pick an older one to put it back.' : 'No saves of this game in RomM yet. They go there after you play.', options: [{ label: 'Sync Now', sub: 'Check this game’s saves with RomM', value: 'sync', icon: 'mdiSync' }, ...list.map((x, i) => ({ label: `${x.emuName} · ${fmt(x.at)}`, sub: `${i === list.findIndex((y) => y.key === x.key) ? 'Newest' : 'Older version'} · ${bytes(x.size || 0)}${x.device ? ' · from ' + x.device : ''}`, value: 'v' + x.id, icon: 'mdiHistory', raw: true }))] });
  if (!v) return;
  if (v === 'sync') {
    try { const r = await call('savesync:run', { romId: id }); const c = r?.counts || {}; toast(r?.offline ? 'RomM couldn’t be reached' : c.conflict ? 'A save changed on two devices: choose in Settings → Saves and Sync' : c.down ? 'The newest save is here' : c.up ? 'Saved to RomM' : 'Up to date', r?.offline || c.conflict ? 'error' : 'ok', 4000, 'mdiCloudSyncOutline'); } catch (e) { toast(e.message, 'error', 5000); }
    return;
  }
  const x = list.find((y) => 'v' + y.id === v);
  if (!(await confirm('Put This Version Back?', `${x.emuName}'s save from ${fmt(x.at)} becomes the newest on every device. The save on this device now is kept as an older version first.`, 'Put It Back'))) return;
  try { await call('savesync:restore', { id: x.id, romId: id }); toast('That version is back', 'ok', 3000, 'mdiHistory'); } catch (e) { toast(e.message, 'error', 6000); }
}
async function olderVersions(x) {
  let all = {};
  try { all = (await call('syncsaves:versions', { id: x.synced.id })) || {}; } catch (e) { toast(e.message, 'error', 5000); return; }
  const rel = x.path.slice(x.synced.path.replace(/\/$/, '').length + 1);
  const mine = Object.entries(all).filter(([f]) => !rel || f === rel || f.startsWith(rel + '/'));
  const times = new Map();
  for (const [f, vs] of mine) for (const v of vs) { const t = times.get(v.versionTime) || { at: Date.parse(v.versionTime), files: {} }; t.files[f] = v.versionTime; times.set(v.versionTime, t); }
  const opts = [...times.values()].sort((a, b) => b.at - a.at).map((t) => ({ label: new Date(t.at).toLocaleString(), sub: `${Object.keys(t.files).length} ${Object.keys(t.files).length === 1 ? 'file' : 'files'} · replaced ${ago(t.at)}`, value: t.at, icon: 'mdiHistory', raw: true }));
  if (!opts.length) { toast('No older versions of this save yet', 'info', 3000, 'mdiHistory'); return; }
  const at = await choose({ title: 'Older Versions', message: 'The save as it was before another device replaced it.', options: opts });
  const t = [...times.values()].find((y) => y.at === at);
  if (!t) return;
  if (!(await confirm('Put this version back?', 'Close the emulator first. The save it replaces is kept as an older version too, so this can be undone.', 'Restore'))) return;
  try { const r = await call('syncsaves:restore', { id: x.synced.id, files: t.files }); const errs = Object.keys(r || {}).length; toast(errs ? `${errs} files couldn't be restored` : 'Restored', errs ? 'error' : 'ok', 3500, 'mdiHistory'); } catch (e) { toast(e.message, 'error', 5000); }
}
async function more() {
  const has = artFor(props.romId);
  const u = cached.value?.user;
  // grouped (0.9.3): the everyday things first, the rest on their own tabs
  const play = [], steam = [], details = [
    { label: 'Change cover', sub: 'SteamGridDB', value: 'grid', icon: 'mdiImageEditOutline' },
    { label: 'Change logo', sub: 'SteamGridDB', value: 'logo', icon: 'mdiFormatTitle' },
    { label: 'Change background', sub: 'SteamGridDB', value: 'hero', icon: 'mdiPanoramaVariantOutline' },
    ...(Object.keys(has).length ? [{ label: 'Reset artwork', sub: 'Back to RomM and automatic logo', value: 'reset', icon: 'mdiRestore' }] : []),
    { label: 'Edit details', sub: 'Name, description and cover, saved to RomM', value: 'edit', icon: 'mdiPencilOutline' },
    { label: 'Refresh details from RomM', value: 'refresh', icon: 'mdiRefresh' },
    ...(coverSrc.value ? [{ label: 'Theme from this game', sub: 'Cartridge takes its colours from the cover', value: 'theme', icon: 'mdiPaletteOutline' }] : []),
    ...(store.config.ui.gameTheme ? [{ label: 'Back to your own theme', sub: store.config.ui.gameTheme.name ? `Now using ${store.config.ui.gameTheme.name}` : '', value: 'untheme', icon: 'mdiUndoVariant' }] : []),
  ];
  if (installedPath.value) {
    const st = await call('steam:forRom', { romId: Number(props.romId) }).catch(() => null);
    if (st?.steam) {
      if (st.queued === 'add') steam.push({ label: 'Waiting to be added to Steam', sub: 'Apply from Settings → Steam', value: 'steamapply', icon: 'mdiSteam' });
      else if (st.inSteam) {
        steam.push({ label: 'Add to a Steam collection', sub: st.lastCollections?.length ? `Last time: ${st.lastCollections.join(', ')}` : 'One of yours, or a new one', value: 'steamcol', icon: 'mdiBookmarkPlusOutline' });
        steam.push({ label: 'Remove from Steam', sub: st.ours ? 'Only the shortcut, not the game' : 'Added outside Cartridge', value: 'steamrm', icon: 'mdiSteam' });
        // 0.9.28 (owner: frame generation from the game's own menu)
        steam.push({ label: 'Frame Generation', sub: 'lsfg-vk or mako-run for this game', value: 'framegen', icon: 'mdiAnimationPlay' });
      } else steam.push({ label: 'Add to Steam', sub: 'Launches with your emulator setup', value: 'steamadd', icon: 'mdiSteam' });
      const ge = await call('steam:gameEmu', { romId: Number(props.romId) }).catch(() => null);
      play.push({ label: 'Emulator for this game', sub: ge?.current ? 'Its own pick' : 'Same as its console', value: 'gameemu', icon: 'mdiGamepadVariantOutline' });
      // 0.9.23 (owner: change the launch version for any game from its own page)
      if (/ps4/i.test(`${base.value?.platform_slug} ${base.value?.platform_fs_slug}`)) {
        const sv = await call('steam:shadVersions', { romId: Number(props.romId) }).catch(() => null);
        // and which version really ran last, from shadPS4's own log (0.9.24, owner: how can I be sure?)
        const lastRun = sv?.last?.version ? ` · last ran on v${sv.last.version}${sv.last.at ? ', ' + ago(sv.last.at) : ''}` : '';
        play.push({ label: 'shadPS4 version', sub: (sv?.current ? (sv.list.find((x) => x.path === sv.current)?.name || 'Its own pick') : 'shadPS4’s default') + lastRun, value: 'shadver', icon: 'mdiLayersTriple' });
      }
      steamInfo = st;
    }
  }
  if (pkg.value?.pkgs && pkg.value.installed && !pkgBusy.value) play.push({ label: `Install again in ${emuName.value}`, sub: pkg.value.emu === 'vita3k' ? 'Installs the downloaded file over it' : 'For updates or DLC added to this game', value: 'pkg', icon: 'mdiPackageDown' });
  if (folderSystem.value) {
    if (marked.value) play.push({ label: 'Unmark as installed', sub: 'Only removes the mark, no files are touched', value: 'unmark', icon: 'mdiCheckboxBlankOffOutline' });
    else if (!installedPath.value) play.push({ label: 'Mark as installed', sub: 'For games you extracted yourself', value: 'mark', icon: 'mdiCheckboxMarkedCircleOutline' });
  }
  if (trophySystem.value) play.push({ label: tro.value ? 'Change linked trophies' : 'Link to trophies', sub: 'Pick which emulator trophy set belongs to this game', value: 'trophies', icon: 'mdiLinkVariant' });
  const slugs = `${base.value?.platform_slug} ${base.value?.platform_fs_slug}`;
  const pe = /ps3/i.test(slugs) ? 'RPCS3' : /ps4/i.test(slugs) ? 'shadPS4' : /\bps2\b/i.test(slugs) ? 'PCSX2' : /\b(ngc|gamecube|gc|wii)\b/i.test(slugs) ? 'Dolphin' : /\bpsp\b/i.test(slugs) ? 'PPSSPP' : null;
  // PS3 game updates are a tab in Add-ons (0.9.29, owner: no second place for them)
  // 0.9.23 (owner: edit a game's emulator settings from Cartridge)
  if (installedPath.value && !marked.value && (pe || /\bpsx\b/i.test(slugs))) play.push({ label: 'Game settings', sub: `${pe || 'DuckStation'}’s settings for this game only`, value: 'gamesettings', icon: 'mdiTune' });
  // patches and cheats are in Game Add-ons (0.9.24, owner: no separate row for them here)
  // 0.9.28 (owner: PS4 patches had gone from here): PS3 and PS4 too; Game Add-ons shows only the tabs the console has
  // 0.9.52: cartridge consoles too, for ROM hacks (and Nexus Mods on the mods engine's other sources)
  const HACKS = /\b(nes|famicom|snes|sfam|n64|gb|gbc|gba|nds|genesis-slash-megadrive|sms|gamegear|turbografx16--1)\b/i;
  if (installedPath.value && !marked.value && (/\b(ps2|ps3|ps4|psx|ngc|gamecube|gc|wii|psp|3ds|n3ds|switch|wiiu)\b/i.test(slugs) || HACKS.test(slugs))) play.push({ label: 'Add-ons', value: 'textures', icon: 'mdiPuzzleOutline',
    sub: HACKS.test(slugs) ? 'ROM hacks and mods' : /ps4/i.test(slugs) ? 'Patches from shadPS4 and GoldHEN' : /ps3/i.test(slugs) ? 'Patches and game updates' : /\bps2\b/i.test(slugs) ? 'Texture packs and patches' : /\bpsp\b/i.test(slugs) ? 'Mods and cheats' : 'Mods, packs and patches, and what’s installed' });
  // 0.9.29 (The Syncthing Update): this game's saves on this device, found by the save's own ID
  const sv = await Promise.race([call('saves:forRom', { romId: Number(props.romId) }).catch(() => []), new Promise((r) => setTimeout(() => r(null), 1500))]);
  if (saveSyncOn()) play.push({ label: 'Saves in RomM', sub: 'Cartridge Save Sync: sync now, or put an older version back', value: 'cloudsaves', icon: 'mdiCloudSyncOutline' }); // 0.9.51
  if (sv?.length) play.push({ label: 'Saves on This Device', sub: `${sv.length} ${sv.length === 1 ? 'save' : 'saves'} · ${sv.some((x) => x.synced) ? 'synced with Syncthing' : 'not synced'} · changed ${ago(Math.max(...sv.map((x) => x.at || 0)))}`, value: 'saves', icon: 'mdiContentSaveOutline' });
  if (installedPath.value) play.push({ label: 'Show file location', value: 'path', icon: 'mdiFolderOutline' });
  const top = [
    { label: fav.value ? 'Remove from favourites' : 'Add to favourites', sub: 'Saved in RomM', value: 'fav', icon: fav.value ? 'mdiHeartOff' : 'mdiHeartOutline' },
    { label: 'Play status', sub: statusText.value || 'None', value: 'status', icon: 'mdiProgressCheck' },
    { label: 'Add to a collection', sub: 'Yours in RomM, or a new one', value: 'col', icon: 'mdiBookmarkPlusOutline' },
    { label: 'Timeline', sub: 'Added, downloaded, played, trophies', value: 'timeline', icon: 'mdiTimelineClockOutline' },
    { label: 'Pin to Start', sub: 'A tile of its own on Start', value: 'pin', icon: 'mdiPinOutline' },
    // 0.9.38 (owner): About belongs with the game, last, under Pin to Start (it was in Options)
    { label: 'About', sub: 'Console, ID, version, and what’s installed for it', value: 'about', icon: 'mdiInformationOutline' },
  ];
  if (detail.value?.path_manual) details.unshift({ label: 'Manual', sub: 'The game’s manual from RomM', value: 'manual', icon: 'mdiBookOpenPageVariantOutline' });
  // Options (0.9.16): hide, re-download and delete, out of the header
  const options = [
    { label: u?.hidden ? 'Unhide game' : 'Hide game', sub: u?.hidden ? 'Show it in lists again' : 'Keep it out of Home, Library and Search', value: 'hide', icon: u?.hidden ? 'mdiEyeOutline' : 'mdiEyeOffOutline' },
    ...(installedPath.value && !marked.value ? [
      { label: 'Re-download', sub: 'The copy on this device is replaced', value: 'redownload', icon: 'mdiRefresh' },
      { label: 'Delete from this device', sub: 'Stays on your RomM server', value: 'delete', icon: 'mdiDeleteOutline', danger: true },
    ] : []),
  ];
  // one sheet, its groups as tabs (0.9.3 K, G4 B): LB/RB move between them. Steam and Emulator are
  // separate tabs since 0.9.16, plus Options.
  const v = await choose({ title: base.value.name, tabs: [{ label: 'Game', options: top }, ...(steam.length ? [{ label: 'Steam', options: steam }] : []), ...(play.length ? [{ label: 'Emulator', options: play }] : []), { label: 'Details and Artwork', options: details }, { label: 'Options', options }] });
  if (!v) return;
  if (v === 'pin') return pinToStart({ type: 'game', romId: props.romId });
  if (v === 'fav') {
    const on = !fav.value;
    try { await call('fav:set', { romId: Number(props.romId), on }); toast(on ? 'Added to favourites' : 'Removed from favourites', 'ok', 2200, 'mdiHeartOutline'); } catch (e) { toast(e.message, 'error', 6000); }
    return;
  }
  if (v === 'status') { await pickStatus(); return; }
  if (v === 'timeline') { await openTimeline(); return; }
  if (v === 'about') { openModal('gameabout', { romId: Number(props.romId), name: base.value.name, cover: coverSrc.value || '' }); return; }
  if (v === 'manual') { openModal('manual', { romId: Number(props.romId), name: base.value.name }); return; }
  if (v === 'edit') { await editDetails(); return; }
  if (v === 'theme') { await themeFromGame(); return; }
  if (v === 'untheme') { const g = store.config.ui.gameTheme; await saveConfig({ ui: { theme: g.theme || 'cartridge', customColor: g.customColor || '', gameTheme: null } }); toast('Your own theme is back', 'ok', 2200, 'mdiUndoVariant'); return; }
  if (v === 'col') { await addToCollection([Number(props.romId)]); return; }
  if (v === 'hide') { await setUser({ hidden: !u?.hidden }, u?.hidden ? 'Shown in lists again' : 'Hidden from lists. Find it again with Library → Filters → Show hidden games.'); return; }
  if (v === 'steamadd') { await addGame({ ...base.value, id: Number(props.romId) }); return; }
  if (v === 'steamrm') {
    if (!steamInfo.ours && !(await confirm('Remove from Steam?', 'Cartridge did not add this shortcut. Remove it anyway?', 'Remove', true))) return;
    await removeGame(base.value, steamInfo.appid); return;
  }
  if (v === 'steamapply') { await applyChanges(); return; }
  if (v === 'gameemu') { await pickGameEmu(); return; }
  if (v === 'gamesettings') { openModal('gamesettings', { romId: Number(props.romId), name: base.value.name }); return; }
  if (v === 'shadver') {
    const sv = await call('steam:shadVersions', { romId: Number(props.romId) }).catch(() => null);
    const p = await choose({ sheet: true, title: 'shadPS4 version', message: base.value.name + (sv?.last?.version ? `\nThe last game shadPS4 ran${sv.last.serial ? ' (' + sv.last.serial + ')' : ''} started on v${sv.last.version}, ${ago(sv.last.at)}. Its log says so after every start.` : ''), options: [
      { label: 'shadPS4’s default', sub: 'The version picked in shadPS4’s launcher', value: '__default', icon: 'mdiArrowULeftTop', selected: !sv?.current },
      ...(sv?.list || []).map((x) => ({ label: x.name, sub: [x.codename, x.date].filter(Boolean).join(' · '), value: x.path, icon: 'mdiSourceBranch', selected: sv.current === x.path, raw: true })),
      { label: 'Add Versions', sub: 'Download older or newer shadPS4 builds', value: '__add', icon: 'mdiDownload' },
    ] });
    if (!p) return;
    if (p === '__add') { openModal('shadversions', {}); return; }
    await call('steam:setShadVersion', { romId: Number(props.romId), path: p === '__default' ? null : p });
    await call('steam:refreshGame', { romId: Number(props.romId) }).catch(() => {});
    toast(p === '__default' ? 'It uses shadPS4’s default now' : `It starts with ${sv.list.find((x) => x.path === p)?.name} now`, 'ok', 2800);
    return;
  }
  if (v === 'mark' || v === 'unmark') { await setMark(v === 'mark'); return; }
  if (v === 'trophies') { await linkTrophies(); return; }
  if (v === 'path') { toast(installedPath.value, 'info', 5000, 'mdiFolder'); return; }
  if (v === 'cloudsaves') return cloudSaves();
  if (v === 'saves') {
    const list = sv || [];
    const p = await choose({ title: 'Saves on This Device', message: saveSyncOn() ? 'Cartridge Save Sync keeps these in step with RomM. A to copy where one is.' : 'Read only: Cartridge never changes a save. A to copy where it is.', options: list.map((x) => ({ label: x.emuName + (x.shared ? ' · Memory Card' : ''), sub: `${bytes(x.size || 0)} · changed ${ago(x.at)} · ${x.synced ? 'synced in ' + x.synced.label : 'not synced'}${x.conflicts ? ` · ${x.conflicts} conflict ${x.conflicts === 1 ? 'copy' : 'copies'} from two devices` : ''}`, value: x.path, icon: x.synced ? 'mdiSync' : 'mdiContentSaveOutline', raw: true })) });
    const x = list.find((y) => y.path === p);
    if (!x) return;
    // a save in one of Cartridge's synced folders can go back to an older version Syncthing kept (0.9.29)
    const what = x.synced?.ours ? await choose({ title: x.emuName, options: [{ label: 'Older Versions', sub: 'Kept by Syncthing for 30 days when another device replaced it', value: 'old', icon: 'mdiHistory' }, { label: 'Copy Location', value: 'copy', icon: 'mdiContentCopy' }] }) : 'copy';
    if (what === 'copy') { try { await call('clip:write', { text: p }); toast('Location copied', 'ok', 2200, 'mdiContentCopy'); } catch (e) { toast(e.message, 'error'); } }
    if (what === 'old') await olderVersions(x);
    return;
  }
  if (v === 'pkg') { await installPkg(); return; }
  if (v === 'patches') { await openModal('gameaddons', { romId: Number(props.romId), name: base.value.name, tab: 'patches' }); return; }
  if (v === 'redownload') { await redownload(); return; }
  if (v === 'ps3check') {
    toast('Checking Sony’s update list…', 'info', 2500, 'mdiPackageUp');
    const up = await call('ps3up:game', { romId: Number(props.romId), fresh: true }).catch((e) => ({ error: e.message }));
    if (up?.error) return toast(up.error, 'error', 5000);
    if (!up?.todo?.length) return toast(`Up to date${up?.have ? ' · version ' + up.have : ''}`, 'ok', 3000, 'mdiCheck');
    if (!(await confirm('Install the game updates?', `${up.todo.length} update${up.todo.length === 1 ? '' : 's'} from Sony (${bytes(up.size)}), up to version ${up.todo[up.todo.length - 1].version}. They install into RPCS3 in order.`, 'Install'))) return;
  }
  if (v === 'ps3up' || v === 'ps3check') {
    toast('Downloading the updates from Sony, then installing them in RPCS3…', 'info', 4000, 'mdiPackageUp');
    try { const r = await call('ps3up:install', { romId: Number(props.romId) }); toast(`Updated${r.version ? ' to ' + r.version : ''}`, 'ok', 3500, 'mdiPackageUp'); } catch (e) { toast(e.message, 'error', 6000); }
    return;
  }
  if (v === 'delete') { await remove(); return; }
  if (v === 'framegen') return pickFrameGen(Number(props.romId));
  if (v === 'steamcol') {
    const names = await pickCollections(steamInfo.console, steamInfo.lastCollections, true);
    if (!names?.length) return;
    try { await call('steam:addToCollections', { romId: Number(props.romId), names }); toast(`Added to ${names.join(', ')}`, 'ok', 3000, 'mdiSteam'); } catch (e) { toast(e.message, 'error', 6000); }
    return;
  }
  if (v === 'textures') { const sl = `${base.value.platform_slug} ${base.value.platform_fs_slug}`; await openModal('gameaddons', { romId: Number(props.romId), name: base.value.name, tab: /ps3|ps4/i.test(sl) ? 'patches' : /\bps2\b/i.test(sl) ? 'tex' : 'mods' }); return; }
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
// Ready to play (0.9.21, owner: it did nothing): starts the game's Steam shortcut; not in Steam yet: offers to add it
async function playNow() {
  try { await playGame(Number(props.romId)); toast('Starting through Steam…', 'info', 2500, 'mdiPlay'); }
  catch (e) {
    if (/Add it to Steam/.test(e.message) && (await confirm('Add to Steam to play?', 'Cartridge starts games through their Steam shortcut, so they launch with your emulator setup.', 'Add to Steam'))) return addGame({ ...base.value, id: Number(props.romId) });
    toast(e.message, 'error', 5000);
  }
}
function goVersion(id) { store.route = { ...store.route, params: { romId: id } }; }

watch([installedPath, () => dl.value?.status], async () => { await nextTick(); ensureFocus(el.value); });
onMounted(async () => {
  const hero = artFor(props.romId).hero;
  if (hero) setBg({ src: img(hero) });
  else if (cached.value) setBg(backdropOf(cached.value));
  if (!hero && cached.value) wantSharp(cached.value);
  await nextTick();
  focusFirst(el.value);
  try {
    detail.value = await call('api:get', { path: `/api/roms/${props.romId}` });
    if (!hero && !store.config?.sgdbKey && !store.sharp[props.romId] && detail.value.merged_screenshots?.[0]) setBg({ src: img(detail.value.merged_screenshots[0]) });
  } catch (e) { if (!cached.value) toast(e.message, 'error'); }
  loadRa();
  loadPkg();
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
.g-banner { position: relative; margin: 0; height: clamp(260px, 52vh, 680px); overflow: hidden; }
/* 0.9.15: the art fades out itself (a mask), so it blends into whatever is behind the page (theme,
   animated background, wallpaper) instead of into a flat colour with a visible band */
.g-banner-img { -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 14%, #000 50%, transparent 100%); mask-image: linear-gradient(180deg, transparent 0%, #000 14%, #000 50%, transparent 100%); } /* full width: the art leads (0.9) */
.g-banner-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.g-banner-img.blur { filter: blur(24px) saturate(1.3) brightness(0.8); transform: scale(1.15); }
.g-banner-shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0.2) 45%, transparent 75%); } /* only for the logo's contrast */
.g-banner-shade { -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 14%, #000 50%, transparent 100%); mask-image: linear-gradient(180deg, transparent 0%, #000 14%, #000 50%, transparent 100%); }
/* 0.9.49 (owner: a dark band at the top of the art with the Dock at the bottom): the art fades in at the top only
   under a top bar; otherwise it runs to the screen's edge */
:global(body:not(.bar-top) .g-banner-img), :global(body:not(.bar-top) .g-banner-shade) { -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 50%, transparent 100%); mask-image: linear-gradient(180deg, #000 0%, #000 50%, transparent 100%); }
.g-banner-logo { position: absolute; left: var(--s-7); bottom: var(--s-5); right: 360px; display: flex; align-items: flex-end; }
.g-hero { position: relative; display: flex; align-items: flex-start; justify-content: space-between; gap: 40px; padding: var(--s-4) var(--s-7) var(--s-5); }
.g-info { display: flex; flex-direction: column; gap: var(--s-4); max-width: 860px; min-width: 0; }
.g-title { font-family: var(--display); font-stretch: var(--display-stretch); font-size: clamp(var(--t-2xl), 5vw, 72px); font-weight: 800; line-height: 1; letter-spacing: -0.02em; }
.g-meta { display: flex; align-items: center; gap: var(--s-4); flex-wrap: wrap; font-size: var(--t-md); font-weight: 500; color: var(--text); }
/* one row (0.9.3): the second buttons are a little tighter, and icon-only on narrow windows */
.g-actions { display: flex; align-items: center; gap: var(--s-3); margin-top: var(--s-2); flex-wrap: nowrap; }
.g-actions .btn:not(.xl) { padding: 0 var(--s-4); flex-shrink: 0; }
@media (max-width: 1100px) { .g-actions .icon-btn span { display: none; } }
.dlbox { width: 380px; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
.dest { display: flex; align-items: center; gap: 8px; font-size: var(--t-xs); color: var(--muted); max-width: 700px; white-space: nowrap; min-width: 0; }
.dest .mono { min-width: 0; }
.g-cover { flex: none; width: 250px; margin-top: -200px; z-index: 2; aspect-ratio: 2/3; border-radius: var(--r-md); overflow: hidden; box-shadow: var(--shadow-pop); background: var(--s2); }
.g-cover img { width: 100%; height: 100%; object-fit: cover; }
.noart { height: 100%; display: grid; place-items: center; padding: 20px; text-align: center; font-family: var(--display); font-size: var(--t-lg); }
.g-body { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 40px; padding: var(--s-4) var(--s-7); }
.col { min-width: 0; }
.summary { margin: 0; line-height: 1.65; color: var(--muted); font-size: var(--t-md); white-space: pre-line; max-width: 820px; }
.shots { padding: 18px 20px 18px var(--s-7); margin: -8px 0 0 calc(-1 * var(--s-7)); scroll-padding: 0 var(--s-7); }
.shot { flex: none; width: 340px; aspect-ratio: 16/9; border-radius: var(--r-md); overflow: hidden; background: var(--s2); transition: transform var(--d-fast) var(--ease); }
.shot img { width: 100%; height: 100%; object-fit: cover; }
.shot:focus { transform: scale(1.04); }
/* HowLongToBeat card: logo, then each time as a big number with a bar against the longest */
.beat { display: flex; align-items: stretch; gap: 0; align-self: flex-start; padding: 12px 6px 12px 16px; border-radius: var(--r-md); max-width: 100%; }
.beat-brand { display: flex; align-items: center; padding-right: 16px; margin-right: 4px; border-right: 1px solid rgba(255, 255, 255, 0.08); }
.beat-brand img { height: 30px; width: auto; max-width: 120px; object-fit: contain; }
.beat-word { font-family: var(--display); font-size: var(--t-sm); font-weight: 600; letter-spacing: -0.01em; color: var(--text); }
.beat-word b { color: #5aa5ff; font-weight: 700; }
.beat-t { display: flex; flex-direction: column; justify-content: center; gap: 3px; min-width: 104px; padding: 0 14px; }
.beat-t + .beat-t { border-left: 1px solid rgba(255, 255, 255, 0.08); }
.beat-t b { font-family: var(--display); font-size: var(--t-lg); font-weight: 700; line-height: 1; color: var(--text); }
.beat-t b small { font-size: var(--t-sm); font-weight: 600; margin-left: 2px; color: var(--muted); }
.beat-t span { font-size: var(--t-xs); font-weight: 600; color: var(--muted); white-space: nowrap; }
.beat-t i { display: block; height: 3px; border-radius: 3px; background: var(--s3); overflow: hidden; margin-top: 3px; }
.beat-t em { display: block; height: 100%; border-radius: 3px; background: #4d95ff; }
.rel { padding: 18px 20px 18px var(--s-7); margin: -8px 0 0 calc(-1 * var(--s-7)); scroll-padding: 0 var(--s-7); }
.badges { display: flex; align-items: center; gap: var(--s-3); padding-bottom: var(--s-2); }
.score { width: 52px; height: 52px; border-radius: var(--r-md); display: flex; flex-direction: column; align-items: center; justify-content: center; color: #0c0d10; flex: none; }
.score b { font-family: var(--display); font-size: var(--t-lg); line-height: 1; }
.score span { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.8; }
.score.good { background: #66cc33; } .score.mid { background: #ffcc33; } .score.low { background: #ff6874; }
.age-img { height: 52px; width: auto; max-width: 90px; object-fit: contain; border-radius: 4px; }
.age { min-width: 52px; height: 52px; padding: 0 8px; border-radius: var(--r-md); border: 2px solid currentColor; display: grid; place-items: center; font-family: var(--display); font-weight: 800; font-size: var(--t-sm); text-align: center; line-height: 1.1; box-sizing: border-box; }
.age.pegi { background: #fff; color: #111; border-color: #111; }
.age.esrb { background: #111; color: #fff; border-color: #fff; }
.facts { width: 250px; padding: var(--s-4); display: flex; flex-direction: column; gap: var(--s-3); align-self: start; box-sizing: border-box; }
.icon-btn span { font-size: var(--t-sm); }
.fact { display: flex; flex-direction: column; gap: 2px; word-break: break-word; }
.fact span { font-size: var(--t-xs); color: var(--muted); font-weight: 600; }
.fact b { font-weight: 500; font-size: var(--t-sm); }
.viewer { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.94); z-index: 40; display: grid; place-items: center; animation: fade var(--fade-in); }
.viewer img { max-width: 94vw; max-height: 84vh; border-radius: var(--r-sm); box-shadow: 0 30px 80px rgba(0, 0, 0, 0.7); }
.vhint { position: absolute; bottom: 26px; display: flex; gap: 8px; align-items: center; color: var(--muted); font-size: var(--t-sm); }
@media (max-width: 1100px) { .g-body { grid-template-columns: minmax(0, 1fr) 200px; gap: 28px; } .g-cover, .facts { width: 200px; } .g-cover { margin-top: -150px; } .g-banner-logo { right: 270px; } }
@media (max-width: 1400px) { .g-hero, .g-body { padding-left: 36px; padding-right: 36px; } .g-banner-logo { left: 36px; } .shots, .rel, .ra-badges { padding-left: 36px; margin-left: -36px; scroll-padding: 0 36px; } }
.ra-sum { display: flex; align-items: center; gap: 14px; margin: -2px 0 4px; }
.ra-sum-bar { flex: 0 1 320px; height: 7px; }
.ra-sum-bar i { background: linear-gradient(90deg, #f5c542, #ffdf80); }
.small { font-size: var(--t-sm); }
.ra-badges { gap: 10px; padding: 12px 20px 12px var(--s-7); margin: 0 0 0 calc(-1 * var(--s-7)); }
.ra-b { flex: none; width: 60px; height: 60px; border-radius: var(--r-md); overflow: hidden; transition: transform var(--spring-snappy-d) var(--spring-snappy); box-shadow: 0 6px 14px rgba(0, 0, 0, 0.4); }
.ra-b img { width: 100%; height: 100%; display: block; }
.ra-b.locked { opacity: 0.55; }
.ra-b:focus { transform: scale(1.12); }
.tro-bar i { background: linear-gradient(90deg, #7fa8ff, #cfe0ff); }
.tro-grades { display: inline-flex; gap: 10px; align-items: center; }
.tro-grades span { display: inline-flex; gap: 3px; align-items: center; }
.tro-ph { width: 100%; height: 100%; display: grid; place-items: center; background: rgba(0, 0, 0, 0.35); }
.ra-focus { font-size: var(--t-sm); margin: 2px 0 6px; max-width: 760px; }
</style>
