// Adding games to Steam: pick collections, queue, preview, apply
import { reactive } from 'vue';
import { store, call, choose, confirm, toast, openModal, pickFolder } from './store.js';

export const steam = reactive({ queue: { add: 0, remove: 0, total: 0 }, busy: false, progress: null });
window.cart.on('steam-queue', (q) => { steam.queue = q; });
// Apply progress for the top bar: artwork per game, then waiting for Steam to close and write
window.cart.on('steam-progress', (p) => { if (steam.busy) steam.progress = p; });
export function steamProgressLabel(p) {
  if (!p) return '';
  return p.step === 'art' ? `Steam artwork ${p.done + 1}/${p.total}` : 'Waiting for Steam…';
}
window.cart.on('steam-auto', (e) => {
  if (e.action === 'applied') return toast('Added to Steam', 'ok', 3000, 'mdiSteam');
  // with Steam reachable live it's applied in a moment by itself (0.9.24); otherwise Steam has to close first
  toast(e.action === 'add' ? `${e.name || 'Game'} goes into Steam: at once when Steam can be changed live, else Apply in Settings → Steam.` : 'Removed game is waiting to come off Steam. Apply from Settings → Steam.', 'info', 4500, 'mdiSteam');
});
// An emulator list with the forks behind one "Forks" entry that opens their own page (0.9.15):
// returns the picked id, or null. first: entries above the list (for example "Same as its console").
export async function pickEmulator({ title, message, list, current, first = [] }) {
  const icon = (e) => (e.id === 'learned' ? 'mdiSteam' : String(e.id).startsWith('ra:') ? 'mdiAlphaRBoxOutline' : 'mdiGamepadVariantOutline');
  const main = list.filter((e) => !e.fork), forks = list.filter((e) => e.fork);
  for (;;) {
    const v = await choose({ sheet: true, title, message, options: [...first, ...main.map((e) => ({ label: e.label, sub: e.sub, value: e.id, icon: icon(e), selected: e.id === current, raw: true })),
      ...(forks.length ? [{ label: `Forks (${forks.length})`, sub: forks.map((f) => f.label.split(' · ')[0]).join(', '), value: '__forks', icon: 'mdiSourceFork', selected: forks.some((f) => f.id === current) }] : [])] });
    if (v !== '__forks') return v || null;
    const f = await choose({ sheet: true, title: 'Forks', message: title, options: forks.map((e) => ({ label: e.label, sub: e.sub, value: e.id, icon: 'mdiSourceFork', selected: e.id === current, raw: true })) });
    if (f) return f; // B: back to the first list
  }
}
export const scfg = () => store.config?.steam || {};

// Which Steam collections? Remembers the last choice per console.
export async function pickCollections(consoleKey, preset, many = false) {
  const list = await call('steam:collections').catch(() => []);
  return openModal('steam-collections', { collections: list.map((c) => c.name), selected: preset || (scfg().lastCollections || {})[consoleKey] || [], many });
}

export async function addGame(rom) {
  let info = await call('steam:forRom', { romId: rom.id });
  if (!info.steam) { toast('Steam was not found, or no account has signed in yet.', 'error', 5000); return; }
  if (info.needsFolder) {
    const dir = await pickFolder({ title: `Where is ${rom.name}?`, subtitle: 'Pick the extracted game folder (the one with eboot.bin)', start: store.config.romsRoot || store.info.home });
    if (!dir) return;
    try { await call('steam:setPath', { romId: rom.id, path: dir }); } catch (e) { toast(e.message, 'error'); return; }
    info = await call('steam:forRom', { romId: rom.id });
  }
  const cols = await pickCollections(info.console, info.lastCollections);
  if (cols === null || cols === undefined) return;
  await call('steam:queueAdd', [{ romId: rom.id, collections: cols }]);
  await afterQueue(`${rom.name} is ready to add`);
}
// Select many (Library): installed games only, one collections pick for all of them
export async function addGames(roms) {
  const env = await call('steam:forRom', { romId: roms[0]?.id }).catch(() => null);
  if (!env?.steam) { toast('Steam was not found, or no account has signed in yet.', 'error', 5000); return false; }
  const ready = [];
  let skipped = 0;
  for (const r of roms) {
    const info = await call('steam:forRom', { romId: r.id }).catch(() => null);
    if (info?.installed && !info.needsFolder && !info.inSteam && !info.queued) ready.push(r); else skipped++;
  }
  if (!ready.length) { toast('None of these can be added: download them first (PS3 and PS4 games need their folder set on the game page).', 'info', 5000, 'mdiSteam'); return false; }
  const cols = await pickCollections(null, [], true);
  if (cols === null || cols === undefined) return false;
  await call('steam:queueAdd', ready.map((r) => ({ romId: r.id, collections: cols })));
  if (skipped) toast(`${skipped} skipped: not downloaded, already in Steam, or needs its folder set`, 'info', 4000, 'mdiSteam');
  await afterQueue(`${ready.length} game${ready.length === 1 ? '' : 's'} ready to add`);
  return true;
}
export async function removeGame(rom, appid) {
  await call('steam:queueRemove', [appid]);
  await afterQueue(`${rom.name} will be removed from Steam`);
}
async function afterQueue(what) {
  steam.queue = await call('steam:overview').then((o) => o.queue).catch(() => steam.queue);
  const n = steam.queue.total;
  const liveOn = (await call('steam:liveInfo').catch(() => null))?.on;
  // Steam takes it while it runs: nothing to wait for, so no "Apply now or later?" question (A7)
  if (liveOn) { await applyChanges(); return; }
  const v = await choose({
    title: what, message: `Steam has to close for a moment to take ${n > 1 ? `these ${n} changes` : 'the change'}. Cartridge closes too if Steam started it${store.info.gamescope ? ' and Game Mode brings Steam back' : ''}.`,
    options: [
      { label: 'Apply now', sub: 'Steam restarts', value: 'now', icon: 'mdiSteam' },
      { label: 'Later', sub: 'Keep it waiting, apply from Settings → Steam', value: 'later', icon: 'mdiClockOutline' },
    ],
  });
  if (v === 'now') await applyChanges();
  else toast(`${n} Steam change${n === 1 ? '' : 's'} waiting. Apply from Settings → Steam.`, 'info', 3500, 'mdiSteam');
}
export async function applyChanges() {
  if (steam.busy) return false;
  try {
    if (scfg().preview !== false) {
      const pv = await call('steam:preview');
      if (!pv.entries.length && !pv.removing.length) { toast(pv.skipped.length ? pv.skipped[0].why : 'Nothing to change', 'info', 5000); return false; }
      const ok = await openModal('steam-preview', pv);
      if (!ok) return false;
    }
    steam.busy = true;
    steam.progress = { step: 'art', done: 0, total: 1 };
    const t0 = Date.now();
    const r = await call('steam:apply', { restart: true });
    // wait for the helper to finish writing (Steam may take a while to close)
    if (r.steamWillRestart) toast('Steam is closing to take the changes and will open again.', 'info', 6000, 'mdiSteam');
    let done = false;
    for (let i = 0; i < 90 && !done; i++) {
      const st = await call('steam:last').catch(() => null);
      if (st && st.at >= t0 && ['done', 'error'].includes(st.state)) { if (st.state === 'error') throw new Error(st.error); done = true; break; }
      await new Promise((ok) => setTimeout(ok, 1000));
    }
    if (done) call('steam:report').catch(() => {}); // seen here, so it isn't reported again next start
    if (done) toast(`Done. ${r.added ? `${r.added} game${r.added === 1 ? '' : 's'} added` : ''}${r.added && r.removed ? ', ' : ''}${r.removed ? `${r.removed} removed` : ''}.`, 'ok', 5000, 'mdiSteam');
    else toast('Still waiting for Steam to close. The change finishes by itself once it does.', 'info', 6000, 'mdiSteam');
    return true;
  } catch (e) { toast(e.message, 'error', 6000); return false; }
  finally { steam.busy = false; steam.progress = null; }
}
export async function restartSteam() {
  if (!(await confirm('Restart Steam?', 'Anything open in Steam closes, including Cartridge if Steam started it.', 'Restart Steam'))) return;
  await call('steam:restart'); toast('Restarting Steam…', 'info', 3000, 'mdiSteam');
}
// once after start: how the last change went
export async function steamReport() {
  try {
    const r = await call('steam:report');
    if (r.last?.state === 'done' && (r.last.added || r.last.removed)) toast(`Steam updated: ${r.last.added ? `${r.last.added} added` : ''}${r.last.added && r.last.removed ? ', ' : ''}${r.last.removed ? `${r.last.removed} removed` : ''}.`, 'ok', 4500, 'mdiSteam');
    else if (r.last?.state === 'done' && r.last.restored) toast('Steam shortcuts are back to how they were.', 'ok', 4000, 'mdiSteam');
    else if (r.last?.state === 'error') toast('Steam changes failed: ' + r.last.error, 'error', 7000);
    // games missing from their collections: Settings → Emulators → Issues (0.9.3), no pop-up
  } catch {}
}

// Frame generation for one game (0.9.28, owner: couldn't find it): from the game's More → Steam, or its Game
// Settings. Says why when it can't apply instead of leaving the option out.
const FGL = { lsfg: 'Lossless Scaling (lsfg-vk)', mako: 'mako-run', off: 'Off' };
// 0.9.80 (owner: build the warning): a Vita game froze on the owner's Deck with frame generation on (Unit 13: picture
// and controls stopped, sound went on, Steam's button dead, when the game's settings opened). Not proven to be frame
// generation, so it's said plainly before it's turned on for Vita games, never refused.
export const isVita = (key) => /^(psvita|vita)$/i.test(String(key || ''));
export async function vitaFgOk(value, vita) {
  if (!vita || !['lsfg', 'mako'].includes(value)) return true;
  return confirm('Frame Generation With Vita Games', 'A Vita game froze on a Steam Deck with frame generation on: the picture and the controls stopped while the sound carried on, and the Steam button did nothing. It may not have been frame generation, but if a Vita game freezes like that, turn frame generation off for it here.', 'Turn It On');
}
export async function frameGenFor(romId) {
  const r = await call('steam:frameGen').catch(() => null);
  if (!r) return { why: 'Steam wasn’t found.' };
  if (!r.found?.lsfg && !r.found?.mako) return { why: 'Frame generation needs lsfg-vk or mako-run on this device (Settings → Steam → Frame Generation).' };
  const g = r.games.find((x) => x.romId === Number(romId));
  if (!g) return { why: 'Add this game to Steam with Cartridge first: frame generation goes in its Steam shortcut.' };
  return { found: r.found, own: g.own, uses: g.uses, console: g.console, consoleOwn: !!(r.conf.consoles || {})[g.console] };
}
export async function pickFrameGen(romId, f = null) {
  f ||= await frameGenFor(romId);
  if (f.why) { toast(f.why, 'info', 6000, 'mdiAnimationPlay'); return false; }
  const v = await choose({ title: 'Frame Generation', message: 'For this game only. Its Steam shortcut is updated at once.', sheet: true, options: [
    { label: 'Follow the Default', sub: `Now ${FGL[f.uses] || 'Off'}`, value: '__base', icon: 'mdiArrowULeftTop', selected: !f.own },
    ...(f.found.lsfg ? [{ label: FGL.lsfg, value: 'lsfg', selected: f.own === 'lsfg', raw: true }] : []),
    ...(f.found.mako ? [{ label: FGL.mako, value: 'mako', selected: f.own === 'mako', raw: true }] : []),
    { label: 'Off', value: 'off', icon: 'mdiClose', selected: f.own === 'off' },
  ] });
  if (!v) return false;
  if (!(await vitaFgOk(v, isVita(f.console)))) return false;
  try { await call('steam:setFrameGen', { scope: 'game', id: Number(romId), value: v === '__base' ? null : v }); toast('Saved. Its Steam shortcut is being updated.', 'ok', 2800, 'mdiAnimationPlay'); return true; }
  catch (e) { toast(e.message, 'error', 5000); return false; }
}
