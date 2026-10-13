<template>
  <div class="view tg" data-scroll ref="el">
    <div v-if="!g && !error" class="center" style="height: 60vh"><div class="spinner" /></div>
    <div v-else-if="error" class="empty">{{ error }}</div>
    <template v-else>
      <header class="tg-head">
        <GameIcon :title="g.code ? '' : g.title" :rom-id="g.romId" :fallback="g.icon || (rom ? cover(rom) : '')" :size="150" :grade="g.kind === 'trophy' ? 'P' : null" />
        <div class="tg-info">
          <div class="eyebrow tg-eyebrow"><ConsoleMark :slug="SLUG[g.src]" :label="g.platform" /><template v-if="g.remoteOnly"> · from another device</template></div>
          <GameLogo :logo="store.config.ui.logos !== false && !g.code ? gameLogo : null" :name="g.title" cls="tg-title" :area="15000" :max-w="440" :max-h="100" />
          <div class="bar tg-bar"><i :style="{ width: pct + '%' }" /></div>
          <div class="tg-prog">
            <template v-if="g.kind === 'gamerscore'"><span><b>{{ l.score }}</b> / {{ l.possible }} Gamerscore · {{ l.earned }} of {{ l.total }} achievements</span></template>
            <template v-else>
              <span><b>{{ l.earned }}</b> of {{ l.total }} trophies · {{ pct }}%</span>
              <span v-for="k in ['P', 'G', 'S', 'B']" :key="k" class="tg-gc"><Grade :g="k" :size="18" />{{ l.grades[k] }} / {{ totals[k] }}</span>
            </template>
          </div>
          <p v-if="g.code" class="muted small tg-code">Cartridge only knows this game's trophy code ({{ g.code }}): the game was deleted before Cartridge could read its name. Link it to the game in your library to show its name.</p>
          <div class="row" style="gap: 10px; margin-top: 6px">
            <button v-if="g.code" class="btn primary" data-focus @click="linkGame"><Icon name="mdiLinkVariant" />Link to a game</button>
            <button v-if="g.romId" class="btn primary" data-focus @click="go('game', { romId: g.romId })"><Icon name="mdiGamepadVariantOutline" />Open in library</button>
            <button class="btn icon-btn" data-focus @click="more"><Icon name="mdiDotsHorizontal" :size="22" /><span>More</span></button>
            <div class="seg">
              <button v-for="f in filters" :key="f.v" data-focus :class="{ on: filter === f.v }" @click="filter = f.v">{{ f.l }}</button>
            </div>
          </div>
        </div>
      </header>
      <div v-if="!shown.length" class="muted" style="padding: 20px 0">Nothing here with this filter.</div>
      <div class="tg-list">
        <div v-for="t in shown" :key="t.id" class="tg-t glass" :class="{ locked: !t.unlocked }" data-focus tabindex="0">
          <div class="tg-ticon"><img v-if="t.icon && (t.unlocked || !t.hidden)" :src="t.icon" loading="lazy" /><Grade v-else :g="t.grade" :size="34" /></div>
          <div class="tg-body">
            <div class="tg-t-title"><Grade :g="t.grade" :size="16" />{{ t.hidden && !t.unlocked ? 'Hidden trophy' : t.name }}</div>
            <div class="tg-t-desc">{{ t.hidden && !t.unlocked ? 'Keep playing to find out.' : t.desc }}</div>
            <div class="tg-t-meta">
              <span v-if="t.grade" :class="'gr-' + t.grade">{{ GRADE[t.grade] }}</span>
              <span v-if="t.points" class="pts">{{ t.points }} G</span>
              <span v-if="t.unlocked">Unlocked {{ t.time ? new Date(t.time).toLocaleDateString() : '' }}</span>
              <span v-else>Locked</span>
              <span v-if="t.unlocked && t.device && t.device !== device" class="dev"><Icon name="mdiDevices" :size="13" />on {{ t.device }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { store, call, go, cover, img, setBg, romById, GRADE, iconKey, iconChanged, choose, openModal, toast, logoOf, allRoms } from '../store.js';
import { useView } from '../useView.js';
import { focusFirst } from '../nav.js';
import Icon from '../components/Icon.vue';
import Grade from '../components/Grade.vue';
import GameIcon from '../components/GameIcon.vue';
import GameLogo from '../components/GameLogo.vue';
import ConsoleMark from '../components/ConsoleMark.vue';

// One game's trophies (or Xbox 360 achievements), from this device and any other synced device
const props = defineProps({ tkey: String });
const el = ref(null);
const g = ref(null);
const error = ref('');
const device = ref('');
const filter = ref('all');
const filters = [{ v: 'all', l: 'All' }, { v: 'unlocked', l: 'Unlocked' }, { v: 'locked', l: 'Locked' }];
const l = computed(() => g.value?.light || {});
const pct = computed(() => (l.value.total ? Math.round((l.value.earned / l.value.total) * 100) : 0));
const rom = computed(() => romById(g.value?.romId));
const SLUG = { rpcs3: 'ps3', shadps4: 'ps4', xenia: 'xbox360', vita3k: 'psvita', kytyps5: 'ps5', recomp: null };
const hash = (t) => { let h = 5381; for (const c of String(t)) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h.toString(36); };
const gameLogo = computed(() => (!g.value ? null : rom.value ? logoOf(rom.value) : logoOf({ id: 'tro' + hash(g.value.title), name: g.value.title.replace(/[™®©]/g, '') })));
const totals = computed(() => { const o = { P: 0, G: 0, S: 0, B: 0 }; for (const t of g.value?.trophies || []) if (o[t.grade] !== undefined) o[t.grade]++; return o; });
const order = { P: 0, G: 1, S: 2, B: 3 };
const shown = computed(() => {
  let list = [...(g.value?.trophies || [])].sort((a, b) => (b.unlocked - a.unlocked) || (a.unlocked ? (b.time || 0) - (a.time || 0) : (order[a.grade] ?? 9) - (order[b.grade] ?? 9) || a.id - b.id));
  if (filter.value === 'unlocked') list = list.filter((t) => t.unlocked);
  if (filter.value === 'locked') list = list.filter((t) => !t.unlocked);
  return list;
});
async function load() {
  try {
    g.value = await call('trophies:game', { key: props.tkey });
    if (!g.value) { error.value = 'This game has no trophy data any more.'; return; }
    device.value = (await call('trophies:overview')).device;
    const r = rom.value;
    if (r) setBg(r.shot ? { src: img(r.shot) } : { src: cover(r, true), blur: true });
    else if (g.value.icon) setBg({ src: g.value.icon, blur: true });
  } catch (e) { error.value = e.message; }
}
watch(() => store.trophyVer, load);
// More: change or reset the game's icon (SteamGridDB)
// trophies Cartridge can't name: pick the library game they belong to (its name is used from then on)
async function linkGame() {
  const slug = SLUG[g.value.src];
  const roms = allRoms().filter((r) => r.platform_slug === slug || r.platform_fs_slug === slug).sort((a, b) => a.name.localeCompare(b.name));
  if (!roms.length) return toast(`No ${g.value.platform} games in your library to link to.`, 'info', 4000);
  const id = await choose({ sheet: true, title: 'Link to a Game', message: `${l.value.total} trophies${g.value.code ? ` · ${g.value.code}` : ''}`, options: roms.map((r) => ({ label: r.name, value: r.id, selected: r.id === g.value.romId, raw: true })) });
  if (!id) return;
  try { await call('trophies:link', { key: g.value.key, romId: id }); toast('Linked', 'ok', 2000, 'mdiLinkVariant'); await load(); } catch (e) { toast(e.message, 'error', 4000); }
}
async function more() {
  const key = iconKey(g.value?.romId, g.value?.title);
  // 0.9.28 (owner): Go to Game Page first; an unlinked game picks its library game, then goes there
  const opts = [{ label: 'Go to Game Page', sub: g.value?.romId ? '' : 'Pick the game in your library first', value: 'lib', icon: 'mdiGamepadVariantOutline' }, { label: 'Change icon', sub: 'SteamGridDB', value: 'icon', icon: 'mdiImageEditOutline' }, { label: 'Reset icon', sub: 'Back to the automatic pick', value: 'reset', icon: 'mdiRestore' }];
  opts.push({ label: g.value?.romId ? 'Link to another game' : 'Link to a game', sub: 'The game in your library these trophies belong to', value: 'link', icon: 'mdiLinkVariant' });
  const hid = (store.config.trophies?.hidden || []).includes(g.value.key);
  opts.push(hid ? { label: 'Unhide', sub: 'Counts in your trophies, gamerscore and latest unlocks again', value: 'unhide', icon: 'mdiEyeOutline' } : { label: 'Hide', sub: 'Leaves your totals and latest unlocks. Settings → Achievements brings it back', value: 'hide', icon: 'mdiEyeOffOutline' });
  const v = await choose({ title: g.value.title, options: opts });
  if (v === 'hide' || v === 'unhide') {
    const list = await call('trophies:hide', { key: g.value.key, hidden: v === 'hide' });
    store.config.trophies = { ...(store.config.trophies || {}), hidden: list };
    toast(v === 'hide' ? 'Hidden. Settings → Achievements → Hidden Games brings it back.' : 'Counts in your totals again', 'ok', 3000, v === 'hide' ? 'mdiEyeOffOutline' : 'mdiEyeOutline');
    return;
  }
  if (v === 'lib') { if (!g.value.romId) await linkGame(); if (g.value?.romId) go('game', { romId: g.value.romId }); return; }
  if (v === 'link') { await linkGame(); return; }
  if (v === 'reset') { await call('icon:reset', { key }); iconChanged(key); toast('Icon reset', 'ok', 2000, 'mdiRestore'); return; }
  if (v !== 'icon') return;
  if (!store.config.sgdbKey) { toast('Add a SteamGridDB API key in Settings → Look & Feel first', 'error', 4500); return; }
  const url = await openModal('art', { kind: 'icon', romName: rom.value?.name || g.value.title.replace(/[™®©]/g, '') });
  if (!url) return;
  await call('icon:set', { key, url });
  iconChanged(key);
  toast('Icon updated', 'ok', 2000, 'mdiCheck');
}
useView({ x: () => { const i = filters.findIndex((f) => f.v === filter.value); filter.value = filters[(i + 1) % filters.length].v; }, y: more },
  [{ b: 'X', label: 'Filter' }, { b: 'Y', label: 'More' }, { b: 'B', label: 'Back' }]);
onMounted(async () => { await load(); focusFirst(el.value); });
</script>

<style scoped>
.tg { padding-top: 18px; }
.tg-head { display: flex; gap: 24px; align-items: flex-start; margin: 6px 0 26px; }
.tg-icon-unused { width: 240px; aspect-ratio: 16 / 9; border-radius: var(--r-md); flex: none; overflow: hidden; display: grid; place-items: center; background: rgba(0, 0, 0, 0.3); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
.tg-icon img { width: 100%; height: 100%; object-fit: contain; }
.tg-icon img.cov { object-fit: cover; }
.tg-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.tg-title { font-size: var(--t-2xl); }
.tg-code { margin: 4px 0 0; max-width: 640px; }
.tg-eyebrow { font-size: var(--t-md); letter-spacing: 0; }
.tg-bar { height: 8px; max-width: 560px; }
.tg-bar i { background: linear-gradient(90deg, #7fa8ff, #cfe0ff); }
.tg-prog { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; font-size: var(--t-sm); color: var(--text-2, #d4d8e2); } /* 0.9.60: was a fixed light grey, white on white in Light */
.tg-gc { display: inline-flex; gap: 5px; align-items: center; }
.tg-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 12px; padding-bottom: 40px; }
.tg-t { display: flex; gap: 14px; padding: 12px 14px; border-radius: var(--r-md); outline: none; transition: transform var(--spring-snappy-d) var(--spring-snappy); }
.tg-t:focus { transform: scale(1.02); }
.tg-t.locked { opacity: 0.7; }
.tg-t.locked .tg-ticon img { filter: grayscale(1) brightness(0.7); }
.tg-ticon { width: 64px; height: 64px; border-radius: var(--r-md); flex: none; overflow: hidden; display: grid; place-items: center; background: rgba(0, 0, 0, 0.3); }
.tg-ticon img { width: 100%; height: 100%; object-fit: cover; }
.tg-body { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.tg-ticon { border-radius: var(--r-md); }
.tg-t-title { font-family: var(--display); font-weight: 600; font-size: var(--t-md); display: flex; gap: 6px; align-items: center; }
.tg-t-desc { font-size: var(--t-xs); color: var(--text-2, #c3c9d4); }
.tg-t-meta { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; font-size: var(--t-xs); color: var(--muted); }
.tg-t-meta .pts { color: var(--score, #9be38a); font-weight: 600; }
.gr-P { color: #cfe0ff; } .gr-G { color: #ffd978; } .gr-S { color: #dfe4ea; } .gr-B { color: #e8a878; }
/* Light (0.9.60, owner's photo: "Gold" was pale yellow on white): the same metals, dark enough to read */
:global(body.theme-light .gr-P) { color: #2f4f8f; } :global(body.theme-light .gr-G) { color: #7a5600; } :global(body.theme-light .gr-S) { color: #4f5661; } :global(body.theme-light .gr-B) { color: #8a4a1c; }
.dev { display: inline-flex; gap: 4px; align-items: center; color: #9cc3ff; }
@media (max-width: 1100px) { .tg-icon { width: 180px; } }
</style>
