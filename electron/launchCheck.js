'use strict';
// Launch Check (0.9.92, owner's pick): what could stop a game or a PC port from starting, found before Play instead of
// after a black screen. The facts are gathered where they live (steamManager.launchFacts for a game, recompsIpc's
// portFacts for a port); this file turns them into what the screen shows: one line each, worst first, with the one
// press that fixes it when there is one. Nothing here reads a file or changes anything. Tested in
// test/launchCheck.test.js.
//
// item: { id, level: 'bad' | 'warn' | 'ok', text, fix?: { id, label, ...what the fix needs } }
//   bad  = it won't start (Play asks first); warn = it starts, something may be off; ok = checked and fine
// fix ids (run by src/launchFix.js): steam-add, steam-apply, steam-refresh, flatpak-allow, bios, pkg-install,
//   emu-page, copy, port-sheet, port-setup, redownload

const short = (p, home) => (home && p ? String(p).replace(home, '~') : String(p || ''));
const ORDER = { bad: 0, warn: 1, ok: 2 };
function finish(items) {
  const list = items.filter(Boolean).sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  const n = (l) => list.filter((x) => x.level === l).length;
  return { ok: !n('bad'), bad: n('bad'), warn: n('warn'), items: list };
}

// f: { name, console, home, file, fileThere, emu: { label } | null, pre: preflight items, start: { ok, reason } | null,
//      missing, pkg, steam: { there, inSteam, ours, queued, outdated, exeGone } }
function game(f) {
  const items = [], con = f.console || 'this console';
  // its files
  if (!f.file) items.push({ id: 'folder', level: 'bad', text: 'Cartridge doesn’t know where this game’s folder is.', fix: { id: 'steam-add', label: 'Pick Its Folder' } });
  else if (!f.fileThere) items.push({ id: 'files', level: 'bad', text: `Its files aren’t at ${short(f.file, f.home)} any more. If they’re on another drive, plug it in.`, fix: { id: 'redownload', label: 'Download It Again' } });
  else items.push({ id: 'files', level: 'ok', text: 'Its files are on this device.' });
  // its emulator
  if (!f.emu) items.push({ id: 'emu', level: 'bad', text: `No emulator for ${con} was found on this device.`, fix: { id: 'emu-page', label: 'Get an Emulator' } });
  else {
    let emuBad = false;
    for (const p of f.pre || []) {
      if (p.bios) {
        if (p.level === 'ok') items.push({ id: 'bios', level: 'ok', text: p.text });
        else if (p.level === 'warn') items.push({ id: 'bios', level: 'warn', text: p.text, fix: { id: 'bios', label: 'Get It from RomM' } });
        continue; // an optional BIOS (tip) isn't a launch problem
      }
      if (p.level === 'bad') {
        emuBad = true;
        items.push({ id: 'emu', level: 'bad', text: p.text, fix: p.allow ? { id: 'flatpak-allow', label: 'Allow Access', app: p.allow.id, dir: p.allow.dir } : p.copy ? { id: 'copy', label: 'Copy the Command', text: p.copy } : { id: 'emu-page', label: 'Open Emulators' } });
      } else if (p.level === 'warn') items.push({ id: 'emu-warn', level: 'warn', text: p.text });
    }
    if (f.start && f.start.ok === false) { emuBad = true; items.push({ id: 'emu-start', level: 'bad', text: `${f.emu.label} can’t start on this device: ${f.start.reason || 'it closes at once'}.`, fix: { id: 'emu-page', label: 'Repair It' } }); }
    if (!emuBad) items.push({ id: 'emu', level: 'ok', text: `${f.emu.label} is set up for ${con}.` });
  }
  // what the emulator is given (a PS3 package not installed yet, a Vita game not in Vita3K)
  if (f.missing) items.push({ id: 'install', level: 'bad', text: f.missing, ...(f.pkg ? { fix: { id: 'pkg-install', label: `Install It in ${f.pkg}` } } : {}) });
  // Steam: games start through their Steam shortcut
  const s = f.steam || {};
  if (!s.there) items.push({ id: 'steam', level: 'bad', text: 'Steam wasn’t found on this device. Cartridge starts games through their Steam shortcut.' });
  else if (!s.inSteam) items.push(s.queued === 'add'
    ? { id: 'steam', level: 'bad', text: 'It’s waiting to go into Steam.', fix: { id: 'steam-apply', label: 'Add It Now' } }
    : { id: 'steam', level: 'bad', text: 'It isn’t in Steam yet. Cartridge starts games through their Steam shortcut.', fix: { id: 'steam-add', label: 'Add to Steam' } });
  else if (s.exeGone) items.push({ id: 'steam', level: 'bad', text: 'Its Steam shortcut points at an emulator that isn’t there any more.', fix: s.ours ? { id: 'steam-refresh', label: 'Update Its Shortcut' } : { id: 'emu-page', label: 'Open Emulators' } });
  else if (s.ours && s.outdated) items.push({ id: 'steam', level: 'warn', text: 'Its Steam shortcut is from before its emulator or settings changed.', fix: { id: 'steam-refresh', label: 'Update Its Shortcut' } });
  else items.push({ id: 'steam', level: 'ok', text: s.ours ? 'It’s in Steam.' : 'It’s in Steam, with a shortcut you made.' });
  return finish(items);
}

// f: { name, game, home, installed, verified, programThere, copy, copyThere, ready, windows, runner, prefixThere,
//      scriptsThere, steam: { inSteam, queued } }
function port(f) {
  const items = [];
  if (!f.installed) return finish([{ id: 'port', level: 'bad', text: `${f.name} isn’t installed.`, fix: { id: 'port-sheet', label: 'Install It' } }]);
  if (!f.programThere) items.push({ id: 'program', level: 'bad', text: 'Its program is missing from its folder.', fix: { id: 'port-sheet', label: 'Repair It' } });
  else items.push({ id: 'program', level: 'ok', text: 'The port is installed.' });
  if (f.verified) {
    if (!f.copy) items.push({ id: 'copy', level: 'bad', text: `It needs your copy of ${f.game || 'the game'}.`, fix: { id: 'port-sheet', label: 'Pick Your Copy' } });
    else if (!f.copyThere) items.push({ id: 'copy', level: 'bad', text: `Your copy isn’t at ${short(f.copy, f.home)} any more. If it’s on another drive, plug it in.`, fix: { id: 'port-sheet', label: 'Pick Your Copy' } });
    else items.push({ id: 'copy', level: 'ok', text: `Your copy of ${f.game || 'the game'} is on this device.` });
    if (f.windows) {
      if (!f.runner) items.push({ id: 'proton', level: 'bad', text: 'It’s a Windows build and no Proton was found. Install any Proton in Steam (Library, Tools), then press Play again.' });
      else {
        items.push({ id: 'proton', level: 'ok', text: `${f.runner} runs it.` });
        if (f.copy && f.copyThere && !f.prefixThere) items.push({ id: 'prefix', level: 'bad', text: 'Its Windows folder (the Proton prefix) is missing.', fix: { id: 'port-setup', label: 'Set It Up Again' } });
      }
    }
    if (f.copy && f.copyThere && f.programThere && (!f.ready || !f.scriptsThere) && !items.some((x) => x.id === 'prefix')) items.push({ id: 'setup', level: 'bad', text: 'It isn’t set up yet.', fix: { id: 'port-setup', label: 'Set It Up' } });
  } else if (f.programThere && !f.ready) items.push({ id: 'setup', level: 'warn', text: 'It sets itself up the first time it starts.' });
  const s = f.steam || {};
  // a port starts by itself too; in Steam it gets Steam's controller handling (a Steam Controller, any pad on the desktop)
  if (s.inSteam) items.push({ id: 'steam', level: 'ok', text: 'It’s in Steam.' });
  else if (f.programThere) items.push({ id: 'steam', level: 'warn', text: s.queued ? 'It’s waiting to go into Steam. Until then it starts without Steam’s controller handling.' : 'It isn’t in Steam, so it starts without Steam’s controller handling.', fix: s.queued ? undefined : { id: 'port-steam', label: 'Add to Steam' } });
  return finish(items.map((x) => { if (x.fix === undefined) delete x.fix; return x; }));
}

module.exports = { game, port };
