// Linked Folders (0.9.33): a fork's save folder linked to the original's, its own folder kept aside and put back.
// Run with: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('../electron/folderLinks');

const H = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cartridge-links-')));
test.after(() => fs.rmSync(H, { recursive: true, force: true }));
const mk = (p, files = {}) => { fs.mkdirSync(path.join(H, p), { recursive: true }); for (const [n, t] of Object.entries(files)) fs.writeFileSync(path.join(H, p, n), t); };

test('a portable fork is found beside its program, by the save folder\'s top folder', () => {
  mk('Applications/GR2/user/savedata');
  fs.writeFileSync(path.join(H, 'Applications/GR2/shadPS4-GR2.AppImage'), '');
  const b = L.findForkBase(path.join(H, 'Applications/GR2/shadPS4-GR2.AppImage'), 'user/savedata', H);
  assert.deepStrictEqual(b, { base: path.join(H, 'Applications/GR2'), how: 'portable' });
});
test('a fork with its own folder in ~/.local/share is found by its name', () => {
  mk('.local/share/shadPS4-BB/user');
  fs.writeFileSync(path.join(H, 'Applications/shadPS4-BB-v0.5.0-x86_64.AppImage'), '');
  const b = L.findForkBase(path.join(H, 'Applications/shadPS4-BB-v0.5.0-x86_64.AppImage'), 'user/savedata', H);
  assert.deepStrictEqual(b, { base: path.join(H, '.local/share/shadPS4-BB'), how: 'own' });
});
test('linking keeps the fork\'s own saves aside, unlinking puts them back exactly', () => {
  mk('.local/share/shadPS4/user/savedata/CUSA00001', { 'save.dat': 'donor' });
  mk('Applications/GR2/user/savedata/CUSA00002', { 'save.dat': 'fork' });
  const from = path.join(H, 'Applications/GR2/user/savedata'), to = path.join(H, '.local/share/shadPS4/user/savedata');
  assert.strictEqual(L.status(from, to).state, 'folder');
  const r = L.link(from, to, H);
  assert.strictEqual(r.kept, from + '.cartridge-kept');
  assert.ok(fs.lstatSync(from).isSymbolicLink());
  assert.strictEqual(fs.readFileSync(path.join(from, 'CUSA00001/save.dat'), 'utf8'), 'donor');
  assert.strictEqual(L.status(from, to).state, 'linked');
  assert.strictEqual(L.link(from, to, H).already, true);
  L.unlink({ from, to, kept: r.kept });
  assert.ok(!fs.lstatSync(from).isSymbolicLink());
  assert.strictEqual(fs.readFileSync(path.join(from, 'CUSA00002/save.dat'), 'utf8'), 'fork');
  assert.strictEqual(fs.readFileSync(path.join(to, 'CUSA00001/save.dat'), 'utf8'), 'donor');
});
test('a missing fork folder is created as the link; removing it leaves an empty folder', () => {
  mk('.local/share/eden/nand/user/save');
  const from = path.join(H, 'Applications/citron/user/nand/user/save'), to = path.join(H, '.local/share/eden/nand/user/save');
  assert.strictEqual(L.status(from, to).state, 'missing');
  const r = L.link(from, to, H);
  assert.strictEqual(r.kept, null);
  L.unlink({ from, to, kept: null });
  assert.ok(fs.statSync(from).isDirectory());
});
test('refuses home itself, folders inside each other, other links and a folder already set aside', () => {
  const to = path.join(H, '.local/share/shadPS4/user/savedata');
  assert.match(L.check(path.join(H, 'x'), to, '/nowhere'), /home folder/);
  assert.match(L.check(path.join(to, 'sub'), to, H), /inside/);
  mk('other'); mk('linkdir/a');
  fs.symlinkSync(path.join(H, 'other'), path.join(H, 'linkdir/b'));
  assert.throws(() => L.link(path.join(H, 'linkdir/b'), to, H), /already a link/);
  mk('linkdir/a.cartridge-kept');
  assert.throws(() => L.link(path.join(H, 'linkdir/a'), to, H), /already there/);
  assert.ok(fs.statSync(path.join(H, 'linkdir/a')).isDirectory());
  assert.throws(() => L.unlink({ from: path.join(H, 'linkdir/a'), to }), /left as it is/);
});

test('Find and Link Saves copies only the games the original lacks, whole, and finds a fork folder further down', () => {
  const FL = require('../electron/folderLinks');
  const H = fs.mkdtempSync(path.join(os.tmpdir(), 'cartridge-merge-'));
  const fork = path.join(H, 'fork/savedata'), orig = path.join(H, 'orig/savedata');
  for (const [d, f, t] of [[fork, 'CUSA00001/s.dat', 'fork1'], [fork, 'CUSA00002/s.dat', 'fork2'], [fork, 'CUSA00002/extra.dat', 'forkx'], [orig, 'CUSA00002/s.dat', 'orig2']]) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); }
  const r = FL.mergeInto(fork, orig);
  assert.deepStrictEqual(r.copied, ['CUSA00001']);
  assert.deepStrictEqual(r.skipped, ['CUSA00002']);
  assert.strictEqual(fs.readFileSync(path.join(orig, 'CUSA00001/s.dat'), 'utf8'), 'fork1');
  assert.strictEqual(fs.readFileSync(path.join(orig, 'CUSA00002/s.dat'), 'utf8'), 'orig2');
  assert.ok(!fs.existsSync(path.join(orig, 'CUSA00002/extra.dat'))); // never a mix of both
  // Switch: the all-zero save-type folder is gone into, title IDs inside are games
  const sf = path.join(H, 'sf/nand/user/save/0000000000000000/AB12'), so = path.join(H, 'so/nand/user/save/0000000000000000/AB12');
  fs.mkdirSync(path.join(sf, '0100000000010000'), { recursive: true }); fs.writeFileSync(path.join(sf, '0100000000010000/a'), 'x');
  fs.mkdirSync(path.join(so, '01000000000AAAA0'), { recursive: true });
  assert.deepStrictEqual(FL.mergeInto(path.join(H, 'sf/nand/user/save'), path.join(H, 'so/nand/user/save')).copied, ['0000000000000000/AB12/0100000000010000']);
  // the fork's folder a few levels under its program
  const exe = path.join(H, 'apps/GR2/shadPS4-gr2.AppImage');
  fs.mkdirSync(path.join(H, 'apps/GR2/data/portable/user/savedata'), { recursive: true }); fs.writeFileSync(exe, '');
  assert.strictEqual(FL.searchForkFolder(exe, 'user/savedata'), path.join(H, 'apps/GR2/data/portable/user/savedata'));
});

// 0.9.56 (owner: "it says the folder to share doesn't exist, I'm sure it exists"): EmuDeck keeps an emulator's save
// folder as a link into Emulation/saves; the check went by lstat, which calls that a link, not a folder
test('a save folder that is itself a link (EmuDeck) can be shared', () => {
  mk('Emulation/saves/shadps4/savedata/CUSA00003', { 'save.dat': 'x' });
  mk('.var-like/shadPS4/user');
  const to = path.join(H, '.var-like/shadPS4/user/savedata');
  fs.symlinkSync(path.join(H, 'Emulation/saves/shadps4/savedata'), to, 'dir');
  mk('Applications/GR3/user/savedata');
  const from = path.join(H, 'Applications/GR3/user/savedata');
  assert.strictEqual(L.check(from, to, H), '');
  const r = L.link(from, to, H);
  assert.ok(fs.existsSync(path.join(from, 'CUSA00003/save.dat')));
  assert.strictEqual(L.status(from, to).state, 'linked');
  assert.ok(r.kept);
});
test('a folder\'s summary counts its games and when they last changed, through links', () => {
  const s = L.summary(path.join(H, '.var-like/shadPS4/user/savedata'));
  assert.strictEqual(s.there, true);
  assert.strictEqual(s.count, 1);
  assert.ok(s.newest > Date.now() - 60000);
  assert.deepStrictEqual(L.summary(path.join(H, 'nothing-here')), { there: false, count: 0, newest: 0 });
});
