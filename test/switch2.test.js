'use strict';
// Switch 2 (0.9.92; 0.9.98, owner: the folder is "ns2", Lichii is its emulator, Triforce the Ocarina of Time port)
const test = require('node:test');
const assert = require('node:assert');
const MAP = require('../electron/platformMap');
const { ESDE, CATALOG } = require('../electron/emuGet');
const E = require('../electron/emulators');
const C = require('../electron/cee');
const R = require('../electron/recipes');

test('RomM\'s Switch 2 slugs download into ns2, never into switch (and not 0.9.92\'s switch2)', () => {
  for (const s of ['switch-2', 'switch2', 'switch_2', 'nintendo-switch-2', 'ns2']) assert.deepStrictEqual(MAP[s], ['ns2']);
  assert.deepStrictEqual(MAP.switch, ['switch']);
});

test('the Emulation folder Cartridge makes has ns2 next to switch', () => {
  assert.ok(ESDE.includes('ns2') && ESDE.includes('switch') && !ESDE.includes('switch2'));
});

test('Lichii plays Switch 2 first, and Switch only after Eden and the rest', () => {
  assert.deepStrictEqual(E.emulatorsFor('ns2'), ['lichii']);
  const sw = E.emulatorsFor('switch');
  assert.ok(sw.indexOf('lichii') > sw.indexOf('eden'), sw.join(','));
  assert.match(E.EMU.lichii.args, /-g "\{ROM\}"/);
  const get = CATALOG.find((c) => c.key === 'ns2');
  assert.ok(get && get.emus[0].id === 'lichii' && get.emus[0].repo === 'zortos293/Lichii' && get.emus[0].asset.test('lichii-linux-x86_64-pgo.AppImage') && !get.emus[0].asset.test('lichii-linux-aarch64-pgo.AppImage'));
  const ns2 = C.coverage().find((c) => c.key === 'ns2');
  assert.ok(ns2?.playable, JSON.stringify(ns2));
});

test('Triforce takes a .nup or its romfs and exefs folder, builds into its own folder, and starts from there', () => {
  const r = require('../electron/recipes/triforce.json');
  assert.deepStrictEqual(R.validate(r), []);
  assert.strictEqual(r.game.console, 'ns2');
  const b = r.builds[0];
  assert.ok(new RegExp(b.asset).test('Triforce-v0.3.7-linux.1-x86_64.AppImage'));
  assert.deepStrictEqual(b.args, ['--play', '{dir}/game']);
  assert.ok(b.prepare.cmd.includes('--cli') && b.prepare.cmd.includes('{gamePosix}') && b.prepare.done === '{dir}/game/image.bin');
  const fs = require('fs'), os = require('os'), path = require('path');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-'));
  try {
    fs.mkdirSync(path.join(d, 'romfs')); fs.mkdirSync(path.join(d, 'exefs'));
    assert.strictEqual(R.checkGame(r, d).folder, d); // the unpacked folder as it is
    fs.writeFileSync(path.join(d, 'oot.nup'), 'x');
    assert.strictEqual(R.checkGame(r, path.join(d, 'oot.nup')).file, path.join(d, 'oot.nup'));
    const e = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-'));
    assert.strictEqual(R.checkGame(r, e).ok, false); // neither: says what it needs
    fs.rmSync(e, { recursive: true });
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
