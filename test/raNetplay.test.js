// RetroArch netplay (0.9.80): the game's own command with --host or --connect put before the core
const test = require('node:test');
const assert = require('node:assert');
const N = require('../electron/raNetplay');

test('host and join lines keep the shortcut’s command and put the flags before -L', () => {
  const fp = { exe: '/usr/bin/flatpak', args: 'run org.libretro.RetroArch -L snes9x_libretro.so "/r/snes/Save Quest.sfc"', pre: [] };
  assert.strictEqual(N.commandLine(fp, 'host'), `exec '/usr/bin/flatpak' run org.libretro.RetroArch --host -L snes9x_libretro.so "/r/snes/Save Quest.sfc"`);
  const sh = { exe: '/h/Emulation/tools/launchers/retroarch.sh', args: '-L /cores/genesis_plus_gx_libretro.so "/r/md/g.md"', pre: ['vblank_mode=0', 'gamemoderun'] };
  assert.strictEqual(N.commandLine(sh, 'join', { host: "203.0.113.7", port: 55436 }), `vblank_mode=0 exec '/h/Emulation/tools/launchers/retroarch.sh' --connect '203.0.113.7' --port 55436 -L /cores/genesis_plus_gx_libretro.so "/r/md/g.md"`);
  assert.ok(N.isRetroArch(fp) && N.isRetroArch(sh) && !N.isRetroArch({ exe: '/a/PCSX2.AppImage', args: '-fullscreen "/r/g.iso"' }));
});

test('join addresses are checked', () => {
  assert.deepStrictEqual(N.checkJoin('203.0.113.7', ''), { host: '203.0.113.7', port: 55435 });
  assert.deepStrictEqual(N.checkJoin('friend.example.org', '1234'), { host: 'friend.example.org', port: 1234 });
  assert.match(N.checkJoin('', '').why, /address/);
  assert.match(N.checkJoin('a b', '').why, /isn’t an address/);
  assert.match(N.checkJoin("x'; rm -rf ~", '').why, /isn’t an address/);
  assert.match(N.checkJoin('1.2.3.4', '70000').why, /port/);
});
