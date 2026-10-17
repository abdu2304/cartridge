// The fork list (0.9.71): shipped in electron/forks.json, replaced by a newer copy from the repository; a broken copy
// never empties it.
const test = require('node:test');
const assert = require('node:assert');
const E = require('../electron/emulators');
const shipped = require('../electron/forks.json');

test('forks.json is well formed and every entry names a known emulator', () => {
  assert.ok(Number.isInteger(shipped.rev) && shipped.rev >= 1);
  for (const f of shipped.forks) { assert.ok(E.EMU[f.of], f.of); assert.ok(f.name && new RegExp(f.match, 'i')); }
  assert.strictEqual(E.forkOf('dolphin', 'PrimeHack-x86_64.AppImage'), 'PrimeHack');
});
test('a newer list replaces the old one; an empty or broken one is ignored', () => {
  assert.strictEqual(E.setForks({ forks: [] }), false);
  assert.strictEqual(E.setForks({ forks: [{ of: 'dolphin' }] }), false);
  assert.strictEqual(E.forkOf('dolphin', 'slippi'), 'Slippi Dolphin');
  assert.strictEqual(E.setForks({ rev: 2, forks: [{ of: 'ppsspp', match: 'ppsspp[-_ ]?gold', name: 'PPSSPP Gold' }] }), true);
  assert.strictEqual(E.forkOf('ppsspp', 'PPSSPP-Gold.AppImage'), 'PPSSPP Gold');
  assert.strictEqual(E.forkOf('dolphin', 'slippi'), null);
  E.setForks(shipped);
});
