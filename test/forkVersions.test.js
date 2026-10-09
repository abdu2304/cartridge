// Fork and GitHub-link emulator versions (0.9.64): the copy in use never moves, only a release's own files do, and a
// portable user/ folder beside them is never touched.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const V = require('../electron/forkVersions');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cart-fv-'));
const put = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('a folder fork: releases switch, its user folder stays', () => {
  const emu = tmp(), base = path.join(emu, 'GR2fork'), store = V.storeOf(emu, 'GR2fork');
  put(base, 'shadps4', 'v1 program'); put(base, 'lib/libx.so', 'v1 lib'); put(base, 'user/savedata/save.bin', 'my save');
  // an update: v1's files kept, v2 laid in
  const v1 = ['shadps4', 'lib/libx.so'];
  assert.strictEqual(V.keep({ base, files: v1, store, tag: 'v1' }), 2);
  put(base, 'shadps4', 'v2 program'); put(base, 'lib/libx.so', 'v2 lib'); put(base, 'lib/new.so', 'v2 only');
  assert.deepStrictEqual(V.list(store).map((x) => x.tag), ['v1']);
  // back to v1, then forward again
  V.swap({ base, store, current: 'v2', files: ['shadps4', 'lib/libx.so', 'lib/new.so'], to: 'v1' });
  assert.strictEqual(read(base, 'shadps4'), 'v1 program');
  assert.ok(!fs.existsSync(path.join(base, 'lib/new.so')));
  assert.strictEqual(read(base, 'user/savedata/save.bin'), 'my save');
  assert.deepStrictEqual(V.list(store).map((x) => x.tag), ['v2']);
  V.swap({ base, store, current: 'v1', files: v1, to: 'v2' });
  assert.strictEqual(read(base, 'lib/new.so'), 'v2 only');
  assert.strictEqual(read(base, 'user/savedata/save.bin'), 'my save');
  assert.throws(() => V.swap({ base, store, current: 'v2', files: v1, to: 'v9' }), /isn’t kept/);
  assert.ok(V.drop(store, 'v1'));
  assert.deepStrictEqual(V.list(store), []);
});

test('an AppImage fork: the same file name stays in place', () => {
  const emu = tmp(), store = V.storeOf(emu, 'Citron');
  put(emu, 'citron.AppImage', 'old');
  V.keep({ base: emu, files: ['citron.AppImage'], store, tag: '0.7' });
  put(emu, 'citron.AppImage', 'new');
  V.swap({ base: emu, store, current: '0.8', files: ['citron.AppImage'], to: '0.7' });
  assert.strictEqual(read(emu, 'citron.AppImage'), 'old');
  assert.deepStrictEqual(V.list(store).map((x) => x.tag), ['0.8']);
});

test('nothing outside the folder moves', () => {
  const emu = tmp(), base = path.join(emu, 'x'), store = V.storeOf(emu, 'x');
  put(emu, 'outside.txt', 'keep'); put(base, 'p', 'p');
  V.keep({ base, files: ['../outside.txt', 'p'], store, tag: 't' });
  assert.ok(fs.existsSync(path.join(emu, 'outside.txt')));
});
