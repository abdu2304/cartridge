// EmuDeck's settings.sh read as sh would (0.9.90: an Emulation folder on a drive lost its last folder, and recomp/
// and bios/ were made beside it)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../electron/shellValue');
const T = require('../electron/trophies');

test('a quoted part and an unquoted tail are one value', () => {
  const v = S.read([
    'emulationPath="/run/media/u/Drive Name"/Emulation',
    'romsPath="/run/media/u/Drive Name"/Emulation/roms',
    "biosPath='/x'/Emulation/bios # a comment",
    'toolsPath=/home/u/Emulation/tools',
    'other="ignored"',
  ].join('\n'), ['emulationPath', 'romsPath', 'biosPath', 'toolsPath']);
  assert.deepStrictEqual(v, { emulationPath: '/run/media/u/Drive Name/Emulation', romsPath: '/run/media/u/Drive Name/Emulation/roms', biosPath: '/x/Emulation/bios', toolsPath: '/home/u/Emulation/tools' });
});

test('fully quoted, export, escapes, and the last assignment wins', () => {
  const v = S.read('export emulationPath="/a b/Emulation"\nemulationPath=/c\\ d/Emulation\n', ['emulationPath']);
  assert.strictEqual(v.emulationPath, '/c d/Emulation');
  assert.strictEqual(S.read('emulationPath="/home/u/Emulation"', ['emulationPath']).emulationPath, '/home/u/Emulation');
});

test('a folder passed as an Emulation root counts only with roms/ in it', () => {
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'cart-roots-'));
  const drive = path.join(h, 'EmuDeck'), real = path.join(drive, 'Emulation');
  fs.mkdirSync(path.join(real, 'roms'), { recursive: true });
  const roots = T.emulationRoots([drive]);
  assert.ok(roots.includes(real), 'Emulation inside the passed folder');
  assert.ok(!roots.includes(drive), 'the drive folder itself is not a root');
});
