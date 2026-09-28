<template>
  <div class="ss">
    <div v-if="!ov" class="muted small"><Icon name="mdiSync" :size="16" class="spin" /> Looking at Steam…</div>
    <template v-else>
      <div v-if="ov.steam.error" class="ss-warn glass"><Icon name="mdiAlertOutline" :size="20" />{{ ov.steam.error }}</div>
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
          <button class="btn" data-focus @click="restartSteam"><Icon name="mdiRestart" />Restart Steam</button>
        </div>

        <div class="subh"><Icon name="mdiGamepadVariantOutline" :size="20" />Emulators</div>
        <p class="muted small" style="margin-top: -8px">Pick a console to see its games in Steam and how they start. Cartridge copies Target, Start in and Launch options from shortcuts you already have (Steam ROM Manager, EmuDeck or your own), minus frame generation wrappers. Consoles with no shortcut yet use the emulator it finds: EmuDeck, then AppImages, then Flatpaks.</p>
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

        <div class="subh"><Icon name="mdiTuneVariant" :size="20" />Options</div>
        <Toggle :model-value="sc.preview !== false" label="Show what changes first" desc="See every Target, Start in and Launch options before Steam is touched" @update:model-value="(v) => setC({ preview: v })" />
        <Toggle :model-value="!!sc.autoAdd" label="Add games after they download" desc="Queues each finished download for Steam, using that console's last collections" @update:model-value="(v) => setC({ autoAdd: v })" />
        <Toggle :model-value="!!sc.autoRemove" label="Remove games from Steam when you delete them" desc="Only shortcuts Cartridge added" @update:model-value="(v) => setC({ autoRemove: v })" />
        <div class="row"><span class="lbl">Console in names</span><div class="seg"><button v-for="m in nameOpts" :key="m.v" data-focus :class="{ on: (sc.consoleInName || 'clash') === m.v }" @click="setC({ consoleInName: m.v })">{{ m.l }}</button></div></div>
        <p class="muted small" style="margin-top: -6px">"Only on clashes" adds the console, like "God of War (PS2)", when two games share a name.</p>

        <div class="subh"><Icon name="mdiHistory" :size="20" />Undo &amp; clean up</div>
        <div class="row wrap">
          <button class="btn" data-focus :disabled="!ov.backups" @click="undo"><Icon name="mdiUndo" />Undo last change</button>
          <button class="btn" data-focus :disabled="!ov.ours" @click="removeAll"><Icon name="mdiDeleteSweepOutline" />Remove everything Cartridge added</button>
          <button v-if="missingCols.length" class="btn" data-focus @click="fixCols"><Icon name="mdiFolderSyncOutline" />Put {{ missingCols.length }} back in collections</button>
        </div>
        <p class="muted small">Steam's shortcuts file is backed up before every change ({{ ov.backups }} kept). Undo puts the one from before the last change back.</p>
        <p v-if="ov.last?.state === 'error'" class="muted small ss-err">Last change failed: {{ ov.last.error }}</p>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { store, call, confirm, toast, go, romById } from '../store.js';
import { steam, applyChanges, restartSteam } from '../steam.js';
import Icon from './Icon.vue';
import Toggle from './Toggle.vue';
import PIcon from './PIcon.vue';

const ov = ref(null);
const missingCols = ref([]);
const sc = computed(() => store.config.steam || {});
const HOW = { learned: 'From your shortcuts', yours: 'Set by you', emudeck: 'EmuDeck', appimage: 'AppImage', flatpak: 'Flatpak', native: 'Installed program' };
const nameOpts = [{ v: 'clash', l: 'Only on clashes' }, { v: 'always', l: 'Always' }];
const inSteam = computed(() => ov.value?.games.filter((g) => g.inSteam).length || 0);
const notIn = computed(() => (ov.value?.games.length || 0) - inSteam.value);
async function load() {
  try { ov.value = await call('steam:overview'); steam.queue = ov.value.queue; } catch (e) { ov.value = { steam: { error: e.message }, games: [], consoles: [] }; }
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
async function setC(patch) { store.config.steam = await call('steam:setConfig', patch); }
async function apply() { if (await applyChanges()) load(); }
async function clearQueue() { steam.queue = await call('steam:queueClear'); load(); }
// console logo: RomM's icon for the platform of any of its games
const platOf = (c) => { const r = (ov.value?.games || []).filter((g) => g.console === c.key).map((g) => romById(g.romId)).find(Boolean); return r ? { slug: r.platform_slug, fs_slug: r.platform_fs_slug } : { slug: c.key }; };
async function undo() {
  if (!(await confirm('Undo the last Steam change?', 'Steam closes for a moment and its shortcuts go back to how they were before the last change.', 'Undo'))) return;
  try { await call('steam:undo'); toast('Steam is closing to undo the change.', 'info', 5000, 'mdiSteam'); } catch (e) { toast(e.message, 'error'); }
}
async function removeAll() {
  if (!(await confirm(`Remove ${ov.value.ours} games from Steam?`, 'Only shortcuts Cartridge added. Your other shortcuts and your game files stay as they are.', 'Remove', true))) return;
  steam.queue = await call('steam:removeAll');
  await apply();
}
async function fixCols() {
  try { await call('steam:fixCollections'); toast('Steam is closing to fix the collections.', 'info', 5000, 'mdiSteam'); } catch (e) { toast(e.message, 'error'); }
}
onMounted(() => { load(); loadLive(); });
</script>
<style scoped>
.ss { display: flex; flex-direction: column; gap: 16px; }
.ss-warn { display: flex; align-items: center; gap: 12px; padding: 16px 18px; color: #ffd978; }
.ss-queue { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 12px; background: rgba(var(--primary-rgb), 0.2); border: 1px solid rgba(var(--primary-l-rgb), 0.5); }
.ss-q-t { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.ss-q-t small { color: var(--muted); font-size: 12.5px; }
.ss-emus { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; padding: 4px; margin: -4px; }
.ss-emu { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 12px; background: rgba(255, 255, 255, 0.045); border: 1px solid var(--line); text-align: left; min-width: 0; }
.ss-emu:focus { border-color: var(--primary-l); background: rgba(var(--primary-rgb), 0.16); }
.ss-e-logo { width: 60px; height: 60px; border-radius: 12px; display: grid; place-items: center; background: rgba(255, 255, 255, 0.06); flex: none; }
.ss-e-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ss-e-mid b { font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chip.how-learned { background: rgba(80, 200, 120, 0.18); color: #9be8b4; }
.chip.how-yours { background: rgba(var(--primary-rgb), 0.25); }
.chip.none { background: rgba(245, 197, 66, 0.18); color: #ffd978; }
.ss-err { color: #ffaaaa; }
.card-s { padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; }
.kv { display: flex; gap: 16px; font-size: 14px; min-width: 0; }
.kv > span:first-child { width: 130px; color: var(--muted); flex: none; }
.subh { display: flex; align-items: center; gap: 10px; font-family: var(--display); font-size: 19px; font-weight: 700; margin-top: 4px; }
.lbl { width: 130px; color: var(--muted); font-size: 13.5px; flex: none; }
.small { font-size: 12.5px; }
.wrap { flex-wrap: wrap; }
</style>
