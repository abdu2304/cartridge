<template>
  <div class="ss">
    <div v-if="!ov" class="muted small"><Icon name="mdiSync" :size="16" class="spin" /> Looking at Steam…</div>
    <template v-else>
      <div v-if="ov.steam.error" class="ss-warn glass"><Icon name="mdiAlertOutline" :size="20" />{{ ov.steam.error }}</div>
      <template v-else>
        <div class="ss-pages"><Btn b="LB" /><div class="seg"><button v-for="pg in PAGES" :key="pg.v" data-focus :data-key="'ssp-' + pg.v" :class="{ on: page === pg.v }" @click="setPage(pg.v)">{{ pg.l }}</button></div><Btn b="RB" /></div>
        <template v-if="page === 'ports'">
          <!-- 0.9.79 (owner: yes to PC ports in Settings → Steam): every installed port, its shortcut, A opens its sheet -->
          <div class="sc-head">
            <div class="sc-head-t">
              <b>PC Ports</b>
              <span class="muted small">Ports go into Steam as their own shortcuts, one per game, in the Recomps collection.</span>
            </div>
            <button class="btn" data-focus data-key="ports-all" :disabled="!portsOut.length || portsBusy" @click="addPorts"><Icon name="mdiSteam" />{{ portsOut.length ? `Add ${portsOut.length} to Steam` : 'All in Steam' }}</button>
          </div>
          <div v-if="!ports" class="muted small"><Icon name="mdiSync" :size="16" class="spin" /> Looking at your ports…</div>
          <div v-else-if="!ports.length" class="muted small">No PC ports installed yet. Get them from Consoles → Recomps, or a game’s More.</div>
          <template v-else>
            <button v-for="p in ports" :key="p.id" class="lrow sc-row" data-focus :data-key="'port-' + p.id" @click="openPort(p)">
              <span class="l-mid"><b>{{ p.name }}</b><span class="l-sub">{{ portSub(p) }}</span></span>
              <span class="l-end"><span class="status" :class="p.installed.steam ? 'ok' : p.installed.steamQueued ? '' : 'warn'">{{ p.installed.steam ? 'In Steam' : p.installed.steamQueued ? 'Waiting' : 'Not in Steam' }}</span></span>
            </button>
          </template>
        </template>
        <template v-if="page === 'cols'">
          <!-- 0.9.32 (owner: redesign it from the start, with a refresh): one row per console, the Steam collection its
               games go into; A changes it. Read from Steam itself when it's reachable. -->
          <div class="sc-head">
            <div class="sc-head-t">
              <b>Console Collections</b>
              <span class="muted small">{{ !review ? 'Reading your Steam collections…' : review.error ? '' : `${review.source === 'live' ? 'Read from Steam' : 'Read from Steam\'s files'} ${ago(review.at)}` }}</span>
            </div>
            <button class="btn" data-focus :disabled="loadingCols" @click="loadReview(true)"><Icon name="mdiRefresh" :class="{ spin: loadingCols }" />Refresh</button>
          </div>
          <div v-if="review?.error" class="ss-warn glass"><Icon name="mdiAlertOutline" :size="20" />{{ review.error }}</div>
          <template v-else-if="review">
            <div v-if="!rows.length" class="muted small">No consoles in your library yet.</div>
            <button v-for="r in rows" :key="r.key" class="lrow sc-row" data-focus :data-key="'col-' + r.key" @click="pickFor(r)">
              <span class="l-mid"><b>{{ r.title }}</b><span class="l-sub">{{ r.sub }}</span></span>
              <span class="l-end"><span class="status" :class="r.tone">{{ r.state }}</span></span>
            </button>
            <Toggle :model-value="!!sc.consoleCollections" label="Put new games in their console's collection" desc="Games Cartridge adds to Steam go into the collection shown above for their console. Collections you made yourself are never renamed unless you pick that." @update:model-value="setConsoleCols" />
            <div v-if="otherCols.length" class="sc-other">
              <div class="muted small">Your other collections, left as they are</div>
              <div class="sc-chips"><span v-for="c in otherCols" :key="c.id" class="chip">{{ c.name }} · {{ c.count }}</span></div>
            </div>
          </template>
        </template>
        <template v-else>
        <div class="card-s glass">
          <div class="kv"><span>Steam account</span><span>{{ ov.steam.account }}<span v-if="ov.steam.accounts.length > 1" class="muted small"> · the one that signed in last ({{ ov.steam.accounts.length }} on this device)</span></span></div>
          <div class="kv"><span>Steam</span><span>{{ ov.steam.running ? 'Running' : 'Closed' }}{{ ov.steam.flatpak ? ' · Flatpak' : '' }}</span></div>
          <div class="kv"><span>Live changes</span><span>{{ liveTxt }}<button v-if="live && !live.flag" class="btn small" data-focus style="margin-left: 12px" @click="enableLive"><Icon name="mdiFlash" :size="16" />Turn on</button></span></div>
          <div class="kv"><span>Your games</span><span>{{ inSteam }} of {{ ov.games.length }} downloaded games are in Steam · {{ ov.ours }} added by Cartridge</span></div>
        </div>

        <div v-if="steam.queue.total" class="ss-queue">
          <Icon name="mdiSteam" :size="22" />
          <div class="ss-q-t"><b>{{ steam.queue.total }} change{{ steam.queue.total === 1 ? '' : 's' }} waiting</b><small>{{ [steam.queue.add && `${steam.queue.add} to add`, steam.queue.remove && `${steam.queue.remove} to remove`].filter(Boolean).join(', ') }}. Steam restarts to take {{ steam.queue.total === 1 ? 'it' : 'them' }}.</small></div>
          <button class="btn primary" data-focus :disabled="steam.busy" @click="apply"><Icon name="mdiCheck" />Apply</button>
          <button class="btn" data-focus @click="clearQueue"><Icon name="mdiClose" />Clear</button>
        </div>

        <div class="row wrap">
          <button class="btn primary" data-focus :disabled="!notIn" @click="go('steam-missing')"><Icon name="mdiFormatListChecks" />{{ notIn ? `${notIn} missing from Steam` : 'Every game is in Steam' }}</button>
          <button class="btn" data-focus :disabled="steam.busy || !ov.ours" @click="refreshArt"><Icon name="mdiImageRefreshOutline" />Refresh artwork</button>
          <button class="btn" data-focus @click="restartSteam"><Icon name="mdiRestart" />Restart Steam</button>
        </div>
        <!-- Emulator setup and Shortcut health live in Settings → Emulators (0.9.3) -->
        <div class="subh"><Icon name="mdiGamepadVariantOutline" :size="20" />Emulators</div>
        <p class="muted small" style="margin-top: -8px">Pick a console to see its games in Steam and how they start. Each console uses one emulator found on this device: EmuDeck's first, then RetroDECK (when there is no EmuDeck), then AppImages, Flatpaks and installed programs. The way your own Steam shortcuts start games is offered as another choice for each console.</p>
        <div class="ss-emus">
          <button v-for="c in ov.consoles" :key="c.key" class="ss-emu" data-focus :data-key="'emu-' + c.key" @click="go('steam-console', { ckey: c.key })">
            <div class="ss-e-logo"><PIcon :p="platOf(c)" :size="44" /></div>
            <div class="ss-e-mid">
              <b>{{ c.platform }}</b>
              <span class="muted small">{{ c.games }} game{{ c.games === 1 ? '' : 's' }} · {{ c.inSteam }} in Steam</span>
              <div class="row" style="gap: 6px; margin-top: 2px">
                <span class="chip" :class="c.template ? 'how-' + c.template.how : 'none'">{{ c.template ? HOW[c.template.how] : 'Not set' }}</span>
                <span v-if="c.mode === 'script'" class="chip">Script</span>
              </div>
            </div>
            <Icon name="mdiChevronRight" :size="22" class="muted" />
          </button>
        </div>

        <div class="subh"><Icon name="mdiAnimationPlay" :size="20" />Frame Generation</div>
        <div class="ss-emus">
          <button class="ss-emu" data-focus data-key="framegen" @click="go('frame-gen')">
            <div class="ss-e-logo"><Icon name="mdiAnimationPlay" :size="36" /></div>
            <div class="ss-e-mid"><b>Frame Generation</b><span class="muted small">lsfg-vk or MAKO, for all games, a console or one game</span></div>
            <Icon name="mdiChevronRight" :size="22" class="muted" />
          </button>
        </div>

        <div class="subh"><Icon name="mdiTuneVariant" :size="20" />Options</div>
        <Toggle :model-value="sc.preview !== false" label="Show what changes first" desc="See every Target, Start in and Launch options before Steam is touched" @update:model-value="(v) => setC({ preview: v })" />
        <Toggle :model-value="!!sc.autoAdd" label="Add games after they download" desc="Queues each finished download for Steam, using that console's last collections" @update:model-value="(v) => setC({ autoAdd: v })" />
        <Toggle :model-value="!!sc.autoRemove" label="Remove games from Steam when you delete them" desc="Only shortcuts Cartridge added" @update:model-value="(v) => setC({ autoRemove: v })" />
        <div class="row"><span class="lbl">Console in names</span><div class="seg"><button v-for="m in nameOpts" :key="m.v" data-focus :class="{ on: (sc.consoleInName || 'clash') === m.v }" @click="setC({ consoleInName: m.v })">{{ m.l }}</button></div></div>
        <p class="muted small" style="margin-top: -6px">"Only on clashes" adds the console, like "God of War (PS2)", when two games share a name.</p>

        <div class="subh"><Icon name="mdiHistory" :size="20" />Undo &amp; Clean Up</div>
        <div class="row wrap">
          <button class="btn" data-focus :disabled="!ov.backups" @click="undo"><Icon name="mdiUndo" />Undo last change</button>
          <button class="btn" data-focus :disabled="!ov.ours" @click="removeAll"><Icon name="mdiDeleteSweepOutline" />Remove everything Cartridge added</button>
          <button v-if="missingCols.length" class="btn" data-focus @click="fixCols"><Icon name="mdiFolderSyncOutline" />Put {{ missingCols.length }} back in collections</button>
        </div>
        <p class="muted small">Steam's shortcuts file is backed up before every change ({{ ov.backups }} kept). Undo puts the one from before the last change back.</p>
        <p v-if="ov.last?.state === 'error'" class="muted small ss-err">Last change failed: {{ ov.last.error }}</p>
        </template>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { store, call, confirm, toast, go, romById, choose, ago, openModal } from '../store.js';
import { steam, applyChanges, restartSteam } from '../steam.js';
import Icon from './Icon.vue';
import Toggle from './Toggle.vue';
import PIcon from './PIcon.vue';
import Btn from './Btn.vue';

// 0.9.32 (owner: the page flashed, then the rest loaded): the last overview is shown at once on every visit
// after the first, and the fresh one replaces it when Steam has been read again
const ov = ref(store.steamOv || null);
const emit = defineEmits(['ready']);
// Pages (0.9.24, owner: a Collections tab in the Steam section); LB/RB through Settings' step()
const PAGES = [{ v: 'games', l: 'Games' }, { v: 'cols', l: 'Collections' }, { v: 'ports', l: 'PC Ports' }];
const page = ref('games');
function setPage(v) { page.value = v; if (v === 'cols' && !loadingCols.value) loadReview(); if (v === 'ports') loadPorts(); }
// PC ports (0.9.79): the installed ones from recomps:list, with their Steam shortcut state
const ports = ref(null), portsBusy = ref(false);
const portsOut = computed(() => (ports.value || []).filter((p) => !p.installed.steam && !p.installed.steamQueued));
async function loadPorts() { try { ports.value = ((await call('recomps:list'))?.entries || []).filter((e) => e.installed); } catch { ports.value = []; } }
const portSub = (p) => [p.from === 'verified' ? 'Cartridge Verified' : p.from === 'link' ? 'From a GitHub link' : 'Installed by an earlier Cartridge', p.starts?.length > 1 ? `${p.starts.length} games` : '', p.installed.steamQueued ? 'Apply on the Games page to put it in Steam' : ''].filter(Boolean).join(' · ');
async function openPort(p) { await openModal(p.from === 'verified' ? 'verified' : 'recomp', { id: p.id }); loadPorts(); }
async function addPorts() {
  portsBusy.value = true;
  let added = 0, queued = 0;
  try {
    for (const p of portsOut.value) { const r = await call('recomps:steam', { id: p.id }); if (r?.added) added++; else if (r?.queued) queued++; }
    steam.queue = await call('steam:overview').then((o) => o.queue).catch(() => steam.queue);
    toast(queued ? `${queued} waiting for Apply on the Games page (Steam restarts)` : `${added} added to Steam`, 'ok', 3500, 'mdiSteam');
  } catch (e) { toast(e.message, 'error', 6000); }
  portsBusy.value = false; loadPorts();
}
function step(d) { const i = PAGES.findIndex((p) => p.v === page.value); setPage(PAGES[(i + d + PAGES.length) % PAGES.length].v); }
defineExpose({ step });
// Collections (0.9.32 redesign): one row per console in the library with the Steam collection its games go into
// (steamCollections.js matches yours to consoles); A offers Cartridge's name, keeping yours, or another of yours
const review = ref(null), loadingCols = ref(false);
let autoFilled = false;
const otherCols = computed(() => (review.value?.list || []).filter((c) => c.action === 'other'));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const rows = computed(() => (review.value?.consoles || []).map((c) => {
  const mine = (review.value.list || []).filter((x) => x.key === c.key);
  const used = mine.find((x) => x.name === c.name) || null;
  const suggest = !c.exists ? mine.filter((x) => x.action !== 'other').sort((a, b) => b.count - a.count)[0] || null : null;
  const title = c.full || c.name;
  const gap = c.missing ? ` · ${c.missing} of its games in Steam not in it` : '';
  if (c.exists) return { ...c, title, mine, sub: `${c.name === title ? 'Cartridge’s name' : `Yours: “${c.name}”`} · ${plural(c.count, 'game')}${gap}`, state: c.missing ? `${c.missing} Missing` : used?.pending ? 'Renamed' : 'In Steam', tone: c.missing ? 'warn' : 'ok' };
  if (suggest) return { ...c, title, mine, suggest, sub: `Your “${suggest.name}” (${plural(suggest.count, 'game')}) looks like this console’s · A to use it or rename it`, state: 'Choose', tone: 'warn' };
  return { ...c, title, mine, sub: c.games ? `${plural(c.games, 'game')} in Steam, not in a collection yet · A to add them as “${c.name}”` : `Made in Steam when its first game is added, as “${c.name}”`, state: c.games ? `${c.games} Missing` : 'Not Yet', tone: c.games ? 'warn' : '' };
}));
async function loadReview(asked) {
  loadingCols.value = true;
  try { review.value = await call('steam:colReview'); if (asked) toast('Collections read again', 'ok', 1800, 'mdiRefresh'); } catch (e) { review.value = { error: e.message }; }
  // 0.9.34 (owner: "it should be smarter than that"): with console collections on and Steam reachable, games already
  // in Steam go into their console's collection by themselves (once per visit; nothing restarts)
  if (!autoFilled && sc.value.consoleCollections && review.value?.source === 'live' && (review.value.consoles || []).some((c) => c.missing)) {
    autoFilled = true;
    try { const r = await call('steam:fillCollections', {}); if (r.count) { toast(`${r.count} game${r.count === 1 ? '' : 's'} put in ${r.count === 1 ? 'its' : 'their'} console collection`, 'ok', 3500, 'mdiSteam'); review.value = await call('steam:colReview'); } } catch {}
  }
  loadingCols.value = false;
}
let colT = null;
watch(page, (v) => { clearInterval(colT); if (v === 'cols') colT = setInterval(() => loadReview(), 15000); });
const offAuto = window.cart.on('steam-auto', () => { if (page.value === 'cols') loadReview(); });
onBeforeUnmount(() => { clearInterval(colT); offAuto?.(); });
// A on a console: the collection its games go into
async function pickFor(r) {
  const yours = (review.value.list || []).filter((x) => x.name !== r.name);
  const own = r.mine.filter((x) => x.name !== r.name);
  const v = await choose({ title: r.title, message: r.exists ? `Its games go into “${r.name}” in Steam.` : 'Pick the collection its games go into.', options: [
    ...(r.games ? [{ label: 'Its Games', sub: r.missing ? `${r.missing} of its games in Steam aren’t in “${r.name}”: see them and add them` : `All ${r.games} of its games in Steam are in it`, value: 'games', icon: 'mdiViewList' }] : []),
    ...own.map((x) => ({ label: `Use “${x.name}”`, sub: `Yours, ${plural(x.count, 'game')}, kept as it is`, value: 'keep:' + x.id, icon: 'mdiBookmarkCheckOutline', raw: true })),
    ...own.filter(() => !r.exists).map((x) => ({ label: `Rename “${x.name}” to “${r.full || r.name}”`, sub: 'Its games stay in it', value: 'ren:' + x.id, icon: 'mdiRenameOutline', raw: true })),
    ...(r.kept ? [{ label: `Use Cartridge’s name, “${r.full}”`, sub: 'Made in Steam when the next game is added', value: 'default', icon: 'mdiRestore', raw: true }] : []),
    ...(yours.length ? [{ label: 'Use Another of Your Collections', sub: 'Any collection you made in Steam', value: 'other', icon: 'mdiBookmarkMultipleOutline' }] : []),
  ] });
  if (!v) return;
  if (v === 'games') { await openModal('consolecol', { ckey: r.key, title: r.name }); return loadReview(); }
  let keep = [], renames = [];
  if (v.startsWith('keep:')) { const x = own.find((y) => 'keep:' + y.id === v); keep = [{ key: r.key, name: x.name }]; }
  else if (v.startsWith('ren:')) { const x = own.find((y) => 'ren:' + y.id === v); renames = [{ id: x.id, from: x.name, to: r.full || r.name, key: r.key }]; }
  else if (v === 'default') renames = [];
  else if (v === 'other') {
    const id = await choose({ title: `Collection for ${r.title}`, options: yours.map((x) => ({ label: x.name, sub: plural(x.count, 'game'), value: x.id, icon: 'mdiBookmarkOutline', raw: true })) });
    const x = yours.find((y) => y.id === id);
    if (!x) return;
    keep = [{ key: r.key, name: x.name }];
  }
  try {
    const res = await call('steam:colApply', { renames, keep, reset: v === 'default' ? [r.key] : [] });
    store.config.steam = { ...sc.value, collectionsIntegrated: true };
    toast(renames.length ? (res.live ? 'Renamed in Steam' : 'Renamed when Steam restarts') : `${r.title} uses “${keep[0]?.name || r.full}”`, 'ok', 3000, 'mdiSteam');
  } catch (e) { toast(e.message, 'error'); }
  loadReview();
}
const missingCols = ref([]);
const sc = computed(() => store.config.steam || {});
const HOW = { learned: 'From your shortcuts', yours: 'Set by you', emudeck: 'EmuDeck', appimage: 'AppImage', flatpak: 'Flatpak', native: 'Installed program', retrodeck: 'RetroDECK', windows: 'Windows build (Proton)' };
const nameOpts = [{ v: 'clash', l: 'Only on clashes' }, { v: 'always', l: 'Always' }];
const inSteam = computed(() => ov.value?.games.filter((g) => g.inSteam).length || 0);
const notIn = computed(() => (ov.value?.games.length || 0) - inSteam.value);
async function load() {
  try { ov.value = await call('steam:overview'); steam.queue = ov.value.queue; store.steamOv = ov.value; } catch (e) { ov.value = { steam: { error: e.message }, games: [], consoles: [] }; }
  emit('ready');
  call('steam:verify').then((m) => (missingCols.value = m || [])).catch(() => {});
}
watch(() => steam.queue.total, () => { if (ov.value && !steam.busy) load(); });
watch(() => steam.busy, (b) => { if (!b && ov.value) load(); });
// Live changes: Steam's own interface is reachable (Decky Loader turns this on), so games are added
// while Steam runs. Without it Steam has to close, which Game Mode makes unreliable.
const live = ref(null);
const liveTxt = computed(() => !live.value ? '…' : live.value.on ? 'On. Games go straight into Steam, no restart.' : live.value.flag ? 'Turned on. Restart Steam once to use it.' : 'Off. Steam restarts for every change.');
async function loadLive() { live.value = await call('steam:liveInfo').catch(() => ({ on: false, flag: false })); }
async function enableLive() {
  if (!(await confirm('Turn on live Steam changes?', "Cartridge adds a small file to Steam's folder that opens Steam's interface to apps on this device only, the same thing Decky Loader does. Steam then takes new games without closing. Restart Steam once afterwards (Steam menu → Power → Restart Steam).", 'Turn on'))) return;
  try { await call('steam:liveEnable'); toast('Live changes turned on. Restart Steam once to use them.', 'ok', 5000, 'mdiSteam'); } catch (e) { toast(e.message, 'error'); }
  loadLive();
}
// New artwork for every game Cartridge put in Steam, in the style you pick
async function refreshArt() {
  const v = await choose({ title: 'Refresh artwork', message: `For the ${ov.value.ours} game${ov.value.ours === 1 ? '' : 's'} Cartridge added to Steam`, options: [
    { label: 'Your Cartridge artwork', sub: 'Covers and backgrounds you picked, else RomM\'s', value: 'mine', icon: 'mdiImageOutline' },
    { label: 'SteamGridDB · most popular', sub: 'The top rated art for each game', value: 'top', icon: 'mdiStarOutline' },
    { label: 'SteamGridDB · clean', sub: 'Covers without logos', value: 'no_logo', icon: 'mdiImageFilterCenterFocus' },
    { label: 'SteamGridDB · alternate', sub: 'Fan-made takes on the box art', value: 'alternate', icon: 'mdiPaletteOutline' },
    { label: 'SteamGridDB · blurred', sub: 'Soft, blurred art', value: 'blurred', icon: 'mdiBlur' },
    { label: 'SteamGridDB · material', sub: 'Flat, minimal art', value: 'material', icon: 'mdiShapeOutline' },
  ] });
  if (!v) return;
  steam.busy = true;
  try {
    const r = await call('steam:refreshArt', { style: v === 'mine' ? undefined : v });
    if (!r.count) toast('No games from Cartridge in Steam yet', 'info', 3000);
    else if (r.live) toast(`New artwork for ${r.count} game${r.count === 1 ? '' : 's'} is in Steam`, 'ok', 3500, 'mdiImageRefreshOutline');
    else if (await confirm('Artwork ready', `New artwork for ${r.count} game${r.count === 1 ? '' : 's'} is saved. Steam shows it after a restart.`, 'Restart Steam')) restartSteam();
  } catch (e) { toast(e.message, 'error', 6000); }
  steam.busy = false; steam.progress = null;
}
async function setC(patch) { store.config.steam = await call('steam:setConfig', patch); }
// turning console collections on: offer to sort the games already in Steam too
async function setConsoleCols(v) {
  if (v && !review.value?.integrated) {
    const keep = rows.value.filter((r) => r.suggest).map((r) => ({ key: r.key, name: r.suggest.name }));
    try { await call('steam:colApply', { renames: [], keep }); } catch {}
  }
  await setC({ consoleCollections: v });
  if (!v || !inSteam.value) return;
  if (!(await confirm('Sort the games already in Steam?', 'Puts each console’s games that are in Steam (Cartridge’s and your own shortcuts) into its collection now.', 'Sort them'))) return;
  try {
    const r = await call('steam:consoleCollections');
    toast(r.count ? (r.live ? `${plural(r.count, 'game')} sorted into console collections` : `${plural(r.count, 'game')} will be sorted when Steam restarts`) : 'They were already in their console collections', 'ok', 4000, 'mdiSteam');
  } catch (e) { toast(e.message, 'error'); }
}
async function apply() { if (await applyChanges()) load(); }
async function clearQueue() { steam.queue = await call('steam:queueClear'); load(); }
// console logo: RomM's icon for the platform of any of its games
const platOf = (c) => { const r = (ov.value?.games || []).filter((g) => g.console === c.key).map((g) => romById(g.romId)).find(Boolean); return r ? { slug: r.platform_slug, fs_slug: r.platform_fs_slug } : { slug: c.key }; };
async function undo() {
  if (!(await confirm('Undo the last Steam change?', 'Steam closes for a moment and its shortcuts go back to how they were before the last change.', 'Undo'))) return;
  try { await call('steam:undo'); toast('Steam is closing to undo the change.', 'info', 5000, 'mdiSteam'); } catch (e) { toast(e.message, 'error'); }
}
async function removeAll() {
  if (!(await confirm(`Remove ${plural(ov.value.ours, 'game')} from Steam?`, 'Only shortcuts Cartridge added. Your other shortcuts and your game files stay as they are.', 'Remove', true))) return;
  steam.queue = await call('steam:removeAll');
  await apply();
}
async function fixCols() {
  try { await call('steam:fixCollections'); toast('Steam is closing to fix the collections.', 'info', 5000, 'mdiSteam'); } catch (e) { toast(e.message, 'error'); }
}
onMounted(() => { if (ov.value) emit('ready'); load(); loadLive(); });
</script>
<style scoped>
.ss { display: flex; flex-direction: column; gap: 16px; }
.ss-pages { display: flex; align-items: center; gap: var(--s-2); }
.ss-pages > * { flex: none; }
.ss-warn { display: flex; align-items: center; gap: 12px; padding: 16px 18px; color: #ffd978; }
.ss-queue { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: var(--r-md); background: rgba(var(--primary-rgb), 0.2); border: 1px solid rgba(var(--primary-l-rgb), 0.5); }
.ss-q-t { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.ss-q-t small { color: var(--muted); font-size: var(--t-xs); }
.ss-emus { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; padding: 4px; margin: -4px; }
.ss-emu { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: var(--r-md); background: var(--s2); text-align: left; min-width: 0; }
.ss-emu:focus { background: var(--focus); color: var(--on-focus); box-shadow: none; border-color: transparent; }
.ss-emu:focus .muted { color: var(--on-focus-dim); }
.ss-e-logo { width: 60px; height: 60px; border-radius: var(--r-md); display: grid; place-items: center; background: rgba(255, 255, 255, 0.06); flex: none; }
.ss-e-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ss-e-mid b { font-size: var(--t-md);  overflow-wrap: anywhere; }
.chip.how-learned { background: rgba(80, 200, 120, 0.18); color: #9be8b4; }
.chip.how-yours { background: rgba(var(--primary-rgb), 0.25); }
.chip.none { background: rgba(245, 197, 66, 0.18); color: #ffd978; }
.ss-err { color: #ffaaaa; }
.card-s { padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; }
.kv { display: flex; gap: 16px; font-size: var(--t-sm); min-width: 0; }
.kv > span:first-child { width: 130px; color: var(--muted); flex: none; }
.subh { display: flex; align-items: center; gap: 10px; font-family: var(--display); font-size: var(--t-lg); font-weight: 700; margin-top: 4px; }
.lbl { width: 130px; color: var(--muted); font-size: var(--t-sm); flex: none; }
.small { font-size: var(--t-xs); }
.sc-head { display: flex; align-items: center; gap: var(--s-3); }
.sc-head-t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sc-head-t b { font-family: var(--display); font-size: var(--t-lg); }
.sc-row { width: 100%; text-align: left; }
.status.warn { background: rgba(245, 197, 66, 0.18); color: #ffd978; }
.sc-other { display: flex; flex-direction: column; gap: var(--s-2); margin-top: var(--s-2); }
.sc-chips { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.wrap { flex-wrap: wrap; }
</style>
