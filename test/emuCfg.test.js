'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');

// HOME is read when the module asks os.homedir(), so each case sets it first
function home() {
  const H = fs.mkdtempSync(path.join(os.tmpdir(), 'emucfg-'));
  test.after(() => fs.rmSync(H, { recursive: true, force: true }));
  process.env.HOME = H; delete process.env.XDG_CONFIG_HOME; delete process.env.XDG_DATA_HOME;
  return H;
}
const { emuCfgDir } = require('../electron/emuCfg');

test('0.9.86: a Flatpak behind EmuDeck\'s launcher script keeps its settings in the Flatpak\'s folder', () => {
  const H = home();
  const flat = path.join(H, '.var/app/org.libretro.RetroArch/config/retroarch');
  fs.mkdirSync(flat, { recursive: true });
  fs.mkdirSync(path.join(H, 'Emulation/tools/launchers'), { recursive: true });
  const sh = path.join(H, 'Emulation/tools/launchers/retroarch.sh');
  fs.writeFileSync(sh, '#!/bin/bash\n/usr/bin/flatpak run org.libretro.RetroArch "$@"\n');
  assert.strictEqual(emuCfgDir('retroarch', { exe: sh, args: '-L snes9x_libretro.so "{ROM}"', start: path.dirname(sh) }), flat);
  // a distro RetroArch with its own folder stays on it, even with the Flatpak's folder there
  fs.mkdirSync(path.join(H, '.config/retroarch'), { recursive: true });
  assert.strictEqual(emuCfgDir('retroarch', { exe: '/usr/bin/retroarch', args: '-L x', start: '/usr/bin' }), path.join(H, '.config/retroarch'));
  // only the Flatpak's folder exists: that's the one, whatever starts it
  const H2 = home();
  fs.mkdirSync(path.join(H2, '.var/app/info.cemu.Cemu/config/Cemu'), { recursive: true });
  assert.strictEqual(emuCfgDir('cemu', { exe: '/x/cemu.sh', args: '-g x', start: '/x' }), path.join(H2, '.var/app/info.cemu.Cemu/config/Cemu'));
  // nothing anywhere: the usual folder
  const H3 = home();
  assert.strictEqual(emuCfgDir('eden', { exe: '/x/eden.sh', args: '', start: '/x' }), path.join(H3, '.config/eden'));
});
