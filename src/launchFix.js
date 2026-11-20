// Launch Check (0.9.93, owner's pick): before Play, what could stop a game or a PC port from starting
// (electron/launchCheck.js finds it). Nothing in the way: Play goes on as before, with no extra step. Something that
// would stop it: LaunchCheck.vue lists it worst first, each line with the one press that fixes it, and Play Anyway.
// A fix runs the same action the rest of the app uses for it, then the check runs again and shows (clear: Play).
import { store, call, romById, openModal, toast, confirm, go, download } from './store.js';
import { addGame, applyChanges } from './steam.js';

const check = (what) => (what.port ? call('recomps:launchCheck', { id: what.port }) : call('launch:check', { romId: what.romId }));

// true: start it; false: don't (B, or a fix that took you somewhere else). always: shown even with nothing in the
// way (the game's More → Launch Check), where a check that can't run says so instead of starting anything
export async function launchGate(what, { always = false } = {}) {
  let r;
  try { r = await check(what); } catch (e) { if (always) toast(e.message, 'error', 5000); return !always; } // a check that can't run never stops a game
  if (r?.clear !== false && !always) return true;
  if (what.port) what = { ...what, verified: r.verified };
  for (let round = 0; round < 6; round++) {
    const v = await openModal('launchcheck', { name: what.name || romById(what.romId)?.name || 'This game', port: !!what.port, result: r });
    if (v === 'play') return true;
    if (!v) return false;
    const stay = await runFix(v, what).catch((e) => { toast(e.message, 'error', 6000); return true; });
    if (!stay) return false;
    try { r = await check(what); } catch { return true; }
  }
  return false;
}

// a fix from LaunchCheck.vue; true: check again here, false: it took you somewhere (a page, a sheet)
export async function runFix(fix, what) {
  const rom = what.romId != null ? romById(what.romId) : null;
  switch (fix.id) {
    case 'download': case 'redownload':
      if (rom) await download(rom); return false;
    case 'steam-add':
      if (rom) await addGame(rom); return true;
    case 'steam-apply':
      await applyChanges(); return true;
    case 'steam-refresh': {
      const r = await call('steam:refreshGame', { romId: Number(what.romId) });
      if (r?.count && !r.fixed) await applyChanges();
      return true;
    }
    case 'flatpak-allow':
      if (!(await confirm('Allow Access?', `Lets ${fix.app} open files in\n${fix.dir}\n\nOnly this Flatpak's permissions change (the same as running flatpak override). You can undo it in Flatseal or with flatpak override --reset.`, 'Allow'))) return true;
      await call('setup:flatpakAllow', { id: fix.app, dir: fix.dir }); toast('Access allowed', 'ok', 2400); return true;
    case 'bios': {
      if (!rom) return true;
      const r = await call('bios:download', { platformId: rom.platform_id, slug: rom.platform_slug });
      const n = (r?.files || []).filter((f) => !f.skipped).length;
      toast(r?.installed ? 'Firmware installed' : n ? `BIOS · ${n} downloaded from RomM` : 'RomM has no BIOS files for this console', n || r?.installed ? 'ok' : 'info', 3400, 'mdiChip');
      return true;
    }
    case 'pkg-install':
      go('game', { romId: Number(what.romId) }); toast(`Press Install in ${fix.label.replace(/^Install It in /, '')} on its page`, 'info', 4000); return false;
    case 'emu-page':
      store.settingsSection = 'emu'; store.settingsDirect = true; go('settings'); return false;
    case 'copy':
      await call('clip:write', { text: fix.text }); toast('Copied. Paste it in a terminal.', 'ok', 3000, 'mdiContentCopy'); return true;
    case 'port-sheet': case 'port-setup':
      openModal(what.verified === false ? 'recomp' : 'verified', { id: what.port }); return false;
    case 'port-steam': {
      const r = await call('recomps:steam', { id: what.port });
      toast(r?.added ? 'Added to Steam, in Recomps' : 'Queued: Settings → Steam → Apply adds it (Steam restarts)', r?.added ? 'ok' : 'info', 4000, 'mdiSteam');
      return true;
    }
    default: return true;
  }
}
