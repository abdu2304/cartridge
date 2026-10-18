<template>
  <div class="view" data-scroll ref="el">
    <div v-if="!d" class="center"><div class="spinner" /></div>
    <template v-else>
      <header class="sm-head">
        <div>
          <div class="eyebrow">Steam</div>
          <h1 class="big">Frame Generation</h1>
          <div class="muted" style="font-size: 13.5px; max-width: 640px">lsfg-vk or MAKO for the games Cartridge added to Steam: all of them, a console or one game. It goes at the start of Launch options, after settings like vblank_mode=0. Changes reach Steam when you press Update.</div>
        </div>
        <button class="btn primary" data-focus :disabled="steam.busy || busy" @click="update"><Icon name="mdiUpdate" />Update shortcuts</button>
      </header>

      <div class="fg-tools">
        <div v-for="t in TOOLS" :key="t.v" class="fg-tool">
          <b>{{ t.l }}</b>
          <span class="status" :class="d.found[t.v] ? 'ok' : 'warn'"><Icon v-if="d.found[t.v]" name="mdiCheck" :size="14" />{{ d.found[t.v] ? 'Installed' : 'Not found' }}</span>
          <span class="muted small mono">{{ d.found[t.v] ? short(d.found[t.v]) : t.how }}</span>
        </div>
      </div>
      <p v-if="!d.found.lsfg && !d.found.mako" class="muted">Neither is installed. Both are set up through Decky Loader plugins (Decky LSFG-VK or MAKO Decky) and need Lossless Scaling from Steam.</p>

      <div class="subh">All games</div>
      <div class="seg"><button v-for="o in opts" :key="o.v" data-focus :class="{ on: (d.conf.default || 'off') === o.v }" :disabled="o.v !== 'off' && !d.found[o.v]" @click="set('default', null, o.v)">{{ o.l }}</button></div>

      <template v-if="d.consoles.length">
        <div class="subh">By console</div>
        <div class="sg-list">
          <button v-for="c in d.consoles" :key="c.key" class="sc-row" data-focus @click="pick('console', c.key, c.platform, c.own)">
            <div class="sc-mid"><b>{{ c.platform }}</b><span class="muted">{{ c.inSteam }} in Steam</span></div>
            <span class="sc-act">{{ c.own ? NAME[c.own] : 'Same as all games' }}</span>
          </button>
        </div>
      </template>

      <template v-for="g in groups" :key="g.key">
        <div class="subh">{{ g.name }}</div>
        <div class="sg-list">
          <button v-for="x in g.items" :key="x.romId" class="sc-row" data-focus @click="pick('game', x.romId, x.name, x.own)">
            <div class="sc-thumb"><img v-if="coverOf(x)" :src="coverOf(x)" loading="lazy" /></div>
            <div class="sc-mid"><b>{{ x.name }}</b><span class="muted">{{ x.own ? 'Set for this game' : 'Follows its console' }}</span></div>
            <span class="sc-act" :class="{ on: x.uses !== 'off' }">{{ NAME[x.uses] }}</span>
          </button>
        </div>
      </template>
      <p v-if="!d.games.length" class="muted">No games Cartridge added to Steam yet.</p>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { store, call, toast, choose, romById, cover } from '../store.js';
import { steam, applyChanges, vitaFgOk, isVita } from '../steam.js';
import { useView } from '../useView.js';
import { ensureFocus } from '../nav.js';
import Icon from '../components/Icon.vue';

// Settings → Steam → Frame Generation (0.9.17): lsfg-vk or MAKO per game, console or all games
const el = ref(null), d = ref(null), busy = ref(false);
const TOOLS = [{ v: 'lsfg', l: 'lsfg-vk', how: 'Decky LSFG-VK' }, { v: 'mako', l: 'MAKO', how: 'MAKO Decky' }];
const NAME = { off: 'Off', lsfg: 'lsfg-vk', mako: 'MAKO' };
const opts = [{ v: 'off', l: 'Off' }, { v: 'lsfg', l: 'lsfg-vk' }, { v: 'mako', l: 'MAKO' }];
const short = (p) => String(p).replace(store.info?.home || '\0', '~');
const coverOf = (x) => { const r = romById(x.romId); return r ? cover(r) : ''; };
const groups = computed(() => {
  const by = new Map();
  for (const x of d.value?.games || []) {
    if (!by.has(x.console)) by.set(x.console, { key: x.console, name: d.value.consoles.find((c) => c.key === x.console)?.platform || x.console, items: [] });
    by.get(x.console).items.push(x);
  }
  for (const g of by.values()) g.items.sort((a, b) => a.name.localeCompare(b.name));
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
});
async function load() { try { d.value = await call('steam:frameGen'); } catch (e) { toast(e.message, 'error'); d.value = { found: {}, conf: {}, games: [], consoles: [] }; } }
async function set(scope, id, value) {
  if (value && value !== 'off' && !d.value.found[value]) return toast(`${NAME[value]} isn’t installed on this device.`, 'info', 3500);
  if (scope === 'default' && !(await vitaFgOk(value, (d.value.consoles || []).some((c) => isVita(c.key)) && !(d.value.conf.consoles || {}).psvita))) return;
  try { await call('steam:setFrameGen', { scope, id, value }); await load(); } catch (e) { toast(e.message, 'error'); }
}
async function pick(scope, id, title, own) {
  const options = [
    { label: scope === 'game' ? 'Follow its console' : 'Same as all games', value: 'inherit', icon: 'mdiArrowUp', selected: !own },
    ...opts.map((o) => ({ label: o.l, value: o.v, icon: o.v === 'off' ? 'mdiClose' : 'mdiAnimationPlay', selected: own === o.v, sub: o.v !== 'off' && !d.value.found[o.v] ? 'Not installed' : '' })),
  ];
  const v = await choose({ sheet: true, title, options });
  if (!v) return;
  // 0.9.80: Vita games get a word first (steam.js vitaFgOk): its console, one of its games, or all games while there are Vita games
  const vita = scope === 'console' ? isVita(id) : scope === 'game' ? isVita((d.value.games || []).find((x) => x.romId === id)?.console) : (d.value.consoles || []).some((c) => isVita(c.key));
  if (!(await vitaFgOk(v, vita))) return;
  await set(scope, id, v === 'inherit' ? null : v);
}
// each console with games in Steam, the way its Update button does it (changed in place when it can)
async function update() {
  busy.value = true;
  let fixed = 0, queued = 0;
  try {
    for (const c of d.value.consoles) {
      const r = await call('steam:refresh', { key: c.key }).catch((e) => { toast(e.message, 'error'); return null; });
      if (!r?.count) continue;
      fixed += r.fixed || 0; queued += r.count - (r.fixed || 0);
    }
    if (queued) { steam.queue = await call('steam:overview').then((o) => o.queue).catch(() => steam.queue); await applyChanges(); }
    else toast(fixed ? `Updated ${fixed} shortcut${fixed === 1 ? '' : 's'} in Steam` : 'Every shortcut is up to date', 'ok', 2500, 'mdiCheck');
  } finally { busy.value = false; load(); }
}
useView({ x: update }, [{ b: 'A', label: 'Change' }, { b: 'X', label: 'Update' }, { b: 'B', label: 'Back' }]);
onMounted(async () => { await load(); await nextTick(); ensureFocus(el.value); });
</script>

<style scoped>
.sm-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin: 18px 0 22px; }
.big { font-size: var(--t-2xl); font-weight: 700; margin: 6px 0 8px; }
.fg-tools { display: flex; gap: var(--s-3); flex-wrap: wrap; margin-bottom: var(--s-4); }
.fg-tool { flex: 1 1 260px; display: flex; flex-direction: column; gap: 6px; padding: var(--s-3) var(--s-4); border-radius: var(--r-md); background: var(--s1); }
.fg-tool .status { align-self: flex-start; }
.mono { font-family: ui-monospace, monospace; word-break: break-all; }
.small { font-size: var(--t-sm); }
.sg-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: var(--s-4); }
.sc-row { display: flex; align-items: center; gap: 16px; padding: 8px 16px; border-radius: var(--r-md); background: rgba(16, 19, 28, 0.6); border: 1px solid var(--line); text-align: left; min-width: 0; flex: none; }
.sc-row:focus { border-color: var(--primary-l); }
.sc-thumb { width: 40px; height: 54px; border-radius: var(--r-sm); overflow: hidden; background: #1a1e2a; flex: none; }
.sc-thumb img { width: 100%; height: 100%; object-fit: cover; }
.sc-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.sc-mid b { font-weight: 500;  overflow-wrap: anywhere; }
.sc-mid span { font-size: var(--t-xs); }
.sc-act { width: 160px; text-align: right; color: var(--muted); font-size: var(--t-sm); flex: none; }
.sc-act.on { color: inherit; font-weight: 600; }
</style>
