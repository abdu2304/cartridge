'use strict';
// Where an emulator keeps its settings for a game's launch template g ({ exe, args, start }): beside the program when
// it's portable, the Flatpak's folder when it runs as one, else the usual XDG folder. Moved out of main.js in 0.9.86 to
// be tested (test/emuCfg.test.js).
const fs = require('fs');
const path = require('path');
const os = require('os');

function emuCfgDir(id, g) {
  const home = os.homedir(), xc = process.env.XDG_CONFIG_HOME || path.join(home, '.config'), xd = process.env.XDG_DATA_HOME || path.join(home, '.local/share');
  const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
  const near = [g.start, g.exe && path.dirname(g.exe)].filter(Boolean), fp = (app, sub) => path.join(home, '.var/app', app, sub);
  // 0.9.86 (PC playtest: RetroArch's game settings "weren't found" behind EmuDeck's retroarch.sh, which runs the
  // Flatpak): a launcher script that runs the Flatpak counts like the Flatpak itself, and when only the Flatpak's
  // folder exists, that's the one
  let script = ''; try { if (/\.sh$/.test(g.exe || '') && fs.statSync(g.exe).size < 65536) script = fs.readFileSync(g.exe, 'utf8'); } catch {}
  const pick = (portable, flat, normal) => {
    const own = near.map(portable).find(isDir);
    if (own) return own;
    if (!flat || !isDir(fp(...flat))) return normal;
    const viaFlatpak = String(g.args || '').includes(flat[0]) || /flatpak/.test(g.exe || '') || script.includes(flat[0]);
    return viaFlatpak || !isDir(normal) ? fp(...flat) : normal;
  };
  if (id === 'eden') return pick((d) => path.join(d, 'user', 'config'), ['dev.eden_emu.eden', 'config/eden'], path.join(xc, 'eden'));
  if (id === 'azahar') return pick((d) => path.join(d, 'user', 'config'), ['org.azahar_emu.Azahar', 'config/azahar-emu'], path.join(xc, 'azahar-emu'));
  if (id === 'cemu') return pick((d) => path.join(d, 'portable'), ['info.cemu.Cemu', 'config/Cemu'], path.join(xc, 'Cemu'));
  if (id === 'vita3k') return pick((d) => path.join(d, 'portable'), null, path.join(xc, 'Vita3K'));
  if (id === 'ryujinx') return pick((d) => path.join(d, 'portable'), ['io.github.ryubing.Ryujinx', 'config/Ryujinx'], path.join(xc, 'Ryujinx'));
  if (id === 'retroarch') return near.find((d) => fs.existsSync(path.join(d, 'retroarch.cfg'))) || pick(() => '', ['org.libretro.RetroArch', 'config/retroarch'], path.join(xc, 'retroarch'));
  if (id === 'xenia') { // the Windows build is portable by default; the Linux one with portable.txt beside it
    const dir = g.exe && path.dirname(g.exe);
    if (dir && (/\.exe$/i.test(g.exe) || fs.existsSync(path.join(dir, 'portable.txt')))) return dir;
    return path.join(xd, 'Xenia');
  }
  return '';
}

module.exports = { emuCfgDir };
