// Xenia Canary's game patches (0.9.63): the format of github.com/xenia-canary/game-patches as Xenia reads it
// (src/xenia/patcher/patch_db.cc). Checked by hand against all 501 files there (1740 patches, every one with is_enabled);
// the files here are made up in the same shape (the repository carries no licence to copy them).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const X = require('../electron/xeniaPatches');

const FILE = `title_name = "Made Up Game" # TU1
title_id = "4D5307E6" # MS-2022
hash = "56209C4732826FCF" # default.xex

[[patch]]
    name = "Unlock FPS"
    desc = "See the note about framerate patches."
    author = "someone"
    is_enabled = false

    [[patch.be32]]
        address = 0x8250fa48
        value = 0x60000000

[[patch]]
    name = "Disable Motion Blur"
    author = "someone"
    is_enabled = true

    [[patch.be32]]
        address = 0x823ee130
        value = 0x39600000
`;
const root = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cart-xp-')); fs.mkdirSync(path.join(d, 'patches')); return d; };

test('a patch file reads like Xenia reads it, title update files named apart', () => {
  const p = X.parse(FILE);
  assert.strictEqual(p.head.title_id, '4D5307E6');
  assert.deepStrictEqual(p.patches.map((x) => [x.name, x.on, x.author]), [['Unlock FPS', false, 'someone'], ['Disable Motion Blur', true, 'someone']]);
  assert.strictEqual(X.variantOf('4D5307E6 - Made Up Game (TU1).patch.toml'), 'Title Update 1');
  assert.strictEqual(X.variantOf('4D5307E6 - Made Up Game.patch.toml'), 'Base Game');
});

test('turning patches on and off changes only is_enabled; one turned on in Xenia is never turned off', () => {
  const d = root(), f = '4D5307E6 - Made Up Game (TU1).patch.toml';
  fs.writeFileSync(path.join(d, 'patches', f), FILE);
  fs.writeFileSync(path.join(d, 'patches', 'notes.txt'), 'not a patch');
  const l = X.list(d, '4d5307e6');
  assert.strictEqual(l.length, 2);
  assert.strictEqual(l.find((x) => x.name === 'Disable Motion Blur').by, 'emulator');
  let mine = X.set(d, [{ ...l[0], on: true }], {});
  assert.match(fs.readFileSync(path.join(d, 'patches', f), 'utf8'), /name = "Unlock FPS"[\s\S]*?is_enabled = true/);
  mine = X.set(d, [{ ...l[1], on: false }], mine); // Xenia's own: stays on
  assert.strictEqual(X.list(d, '4D5307E6', mine).find((x) => x.name === 'Disable Motion Blur').on, true);
  mine = X.set(d, [{ ...l[0], on: false }], mine);
  assert.strictEqual(fs.readFileSync(path.join(d, 'patches', f), 'utf8'), FILE);
  assert.deepStrictEqual(mine, {});
});

test('downloads only lay patch files, never over yours, and keep which patches were on', () => {
  const d = root(), f = '4D5307E6 - Made Up Game.patch.toml';
  let r = X.install(d, [[`game-patches-main/patches/${f}`, Buffer.from(FILE)], ['game-patches-main/README.md', Buffer.from('x')], ['../evil.patch.toml', Buffer.from('x')]]);
  assert.deepStrictEqual(Object.keys(r.written), [f]);
  assert.ok(!fs.existsSync(path.join(d, 'patches', 'README.md')));
  X.set(d, [{ key: 'k', file: f, name: 'Unlock FPS', on: true }], {});
  r = X.install(d, [[f, Buffer.from(FILE.replace('someone', 'someone else'))]], r.written); // an update to the file
  const now = fs.readFileSync(path.join(d, 'patches', f), 'utf8');
  assert.match(now, /someone else/); assert.match(now, /name = "Unlock FPS"[\s\S]*?is_enabled = true/);
  const mineFile = '4D5307E6 - Mine.patch.toml'; fs.writeFileSync(path.join(d, 'patches', mineFile), 'mine');
  X.install(d, [[mineFile, Buffer.from(FILE)]], r.written);
  assert.strictEqual(fs.readFileSync(path.join(d, 'patches', mineFile), 'utf8'), 'mine');
});

test('apply_patches is turned back on only when it was off', () => {
  const c = path.join(root(), 'xenia-canary.config.toml');
  fs.writeFileSync(c, '[General]\napply_patches = false # Enables custom patching\n');
  assert.strictEqual(X.ensureOn(c), true);
  assert.match(fs.readFileSync(c, 'utf8'), /apply_patches = true # Enables/);
  assert.strictEqual(X.ensureOn(c), false);
});
