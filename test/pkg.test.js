// PS3 packages through RPCS3 (0.9.3 D): reading PKG headers, install order, installing with a
// stand-in RPCS3, and the checks that guard deleting a game from RPCS3's storage.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('../electron/pkgInstall.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cart-pkg-'));
// a PKG header as RPCS3 reads it: magic, platform, metadata (content type, flags), content ID
function fakePkg(file, { contentId, platform = 1, type = 5, patch = false }) {
  const b = Buffer.alloc(0x100);
  b.writeUInt32BE(0x7f504b47, 0); b.writeUInt16BE(0x8000, 4); b.writeUInt16BE(platform, 6);
  b.writeUInt32BE(0xc0, 8); b.writeUInt32BE(2, 12);
  b.write(contentId, 0x30, 'latin1');
  b.writeUInt32BE(2, 0xc0); b.writeUInt32BE(4, 0xc4); b.writeUInt32BE(type, 0xc8);
  b.writeUInt32BE(3, 0xcc); b.writeUInt32BE(4, 0xd0); b.writeUInt32BE(patch ? 0x10 : 0x2, 0xd4);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, b);
}
const sfo = (dir, serial) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'PARAM.SFO'), Buffer.from(`\0PSF\x01\x01\0\0TITLE_ID\0${serial}\0`, 'latin1')); };

test('reads the title ID, content type and patch flag from a PKG header', () => {
  const f = path.join(TMP, 'h/game.pkg');
  fakePkg(f, { contentId: 'UP9000-BCUS98137_00-0000000000000001' });
  const i = P.pkgInfo(f);
  assert.strictEqual(i.titleId, 'BCUS98137');
  assert.strictEqual(i.contentType, 5);
  assert.strictEqual(i.patch, false);
  fs.writeFileSync(path.join(TMP, 'h/not.pkg'), 'hello');
  assert.strictEqual(P.pkgInfo(path.join(TMP, 'h/not.pkg')), null);
});

test('install order: licences, the game, DLC, then updates oldest first; Vita packages left out', () => {
  const d = path.join(TMP, 'order');
  fakePkg(path.join(d, 'Game-A0102-V0105.pkg'), { contentId: 'UP0001-BLUS30001_00-GAMEUPDATE000000', type: 4, patch: true });
  fakePkg(path.join(d, 'Game-A0101-V0102.pkg'), { contentId: 'UP0001-BLUS30001_00-GAMEUPDATE000000', type: 4, patch: true });
  fakePkg(path.join(d, 'Game.pkg'), { contentId: 'UP0001-BLUS30001_00-GAME000000000000' });
  fakePkg(path.join(d, 'dlc/Extra.pkg'), { contentId: 'UP0001-BLUS30001_00-DLC0000000000000', type: 4 });
  fakePkg(path.join(d, 'vita.pkg'), { contentId: 'UP0001-PCSE00001_00-0000000000000000', platform: 2 });
  fs.writeFileSync(path.join(d, 'UP0001-BLUS30001_00-GAME.rap'), 'x');
  const r = P.packagesIn(d);
  assert.deepStrictEqual(r.order.map((f) => path.relative(d, f)), ['UP0001-BLUS30001_00-GAME.rap', 'Game.pkg', 'dlc/Extra.pkg', 'Game-A0101-V0102.pkg', 'Game-A0102-V0105.pkg']);
  assert.deepStrictEqual(r.titleIds, ['BLUS30001']);
});

test('installs through a stand-in RPCS3 and reads back what it made', async () => {
  const hdd = path.join(TMP, 'rpcs3/dev_hdd0');
  fs.mkdirSync(path.join(hdd, 'game/BLES00001'), { recursive: true }); // another game already there
  const pkg = path.join(TMP, 'roms/ps3/Game/Game.pkg');
  fakePkg(pkg, { contentId: 'UP0001-BLUS30001_00-GAME000000000000' });
  // stands in for RPCS3: makes the game folder named in the package and writes the arguments it got
  const exe = path.join(TMP, 'fake-rpcs3');
  fs.writeFileSync(exe, `#!/bin/sh\necho "$@" >> "${TMP}/args"\nmkdir -p "${hdd}/game/BLUS30001"\nprintf '\\0PSF TITLE_ID BLUS30001' > "${hdd}/game/BLUS30001/PARAM.SFO"\n`);
  fs.chmodSync(exe, 0o755);
  const p = P.packagesIn(path.dirname(pkg));
  const steps = [];
  const out = await P.install({ cmd: { exe, args: ['run', 'x'] }, hdds: [hdd], files: p.order, titleIds: p.titleIds, onStep: (s) => steps.push(s.step) });
  assert.deepStrictEqual(out.map((g) => [g.serial, g.created]), [['BLUS30001', true]]);
  assert.strictEqual(fs.readFileSync(path.join(TMP, 'args'), 'utf8').trim(), `run x --headless --installpkg ${pkg}`);
  assert.deepStrictEqual(steps, [1]);
});

test('finds RPCS3 storage through its vfs.yml, wherever it was moved', () => {
  const H = path.join(TMP, 'home');
  const moved = path.join(TMP, 'elsewhere/dev_hdd0');
  fs.mkdirSync(path.join(moved, 'game'), { recursive: true });
  fs.mkdirSync(path.join(H, '.config/rpcs3/config'), { recursive: true });
  fs.writeFileSync(path.join(H, '.config/rpcs3/config/vfs.yml'), `$(EmulatorDir): ""\n/dev_hdd0/: ${moved}/\n`);
  const old = process.env.XDG_CONFIG_HOME; delete process.env.XDG_CONFIG_HOME;
  try { assert.deepStrictEqual(P.rpcs3Hdds(H, []).map((h) => path.resolve(h)), [path.resolve(moved)]); }
  finally { if (old !== undefined) process.env.XDG_CONFIG_HOME = old; }
});

test('delete from RPCS3 refuses anything that is not exactly the game Cartridge installed', () => {
  const hdd = path.join(TMP, 'del/dev_hdd0');
  const game = path.join(hdd, 'game');
  sfo(path.join(game, 'BLUS30001'), 'BLUS30001');
  const ok = { emu: 'rpcs3', serial: 'BLUS30001', dir: path.join(game, 'BLUS30001'), created: true };
  assert.strictEqual(P.safeToRemove(ok, [hdd]).ok, true);
  // installed by the user in RPCS3, or only an update Cartridge installed: never
  assert.strictEqual(P.safeToRemove({ ...ok, created: false }, [hdd]).ok, false);
  // another game with a similar serial
  sfo(path.join(game, 'BLUS30001X'), 'BLUS30001');
  assert.strictEqual(P.safeToRemove({ ...ok, dir: path.join(game, 'BLUS30001X') }, [hdd]).ok, false);
  // a link in the game folder pointing elsewhere
  const outside = path.join(TMP, 'del/outside/BLUS30002'); sfo(outside, 'BLUS30002');
  fs.symlinkSync(outside, path.join(game, 'BLUS30002'));
  assert.strictEqual(P.safeToRemove({ ...ok, serial: 'BLUS30002', dir: path.join(game, 'BLUS30002') }, [hdd]).ok, false);
  // missing or wrong PARAM.SFO
  fs.mkdirSync(path.join(game, 'BLUS30003'));
  assert.strictEqual(P.safeToRemove({ ...ok, serial: 'BLUS30003', dir: path.join(game, 'BLUS30003') }, [hdd]).ok, false);
  sfo(path.join(game, 'BLUS30004'), 'BLUS39999');
  assert.strictEqual(P.safeToRemove({ ...ok, serial: 'BLUS30004', dir: path.join(game, 'BLUS30004') }, [hdd]).ok, false);
  // the game folder itself, or a folder outside RPCS3's storage
  assert.strictEqual(P.safeToRemove({ ...ok, dir: game }, [hdd]).ok, false);
  const stray = path.join(TMP, 'del/other/BLUS30001'); sfo(stray, 'BLUS30001');
  assert.strictEqual(P.safeToRemove({ ...ok, dir: stray }, [hdd]).ok, false);
});

// ---------------------------------------------------------------- Vita through Vita3K
// a .vpk is a zip: one stored (uncompressed) entry is enough for Cartridge to read its title ID
function crc32(b) { let c, crc = 0xffffffff; for (const x of b) { c = (crc ^ x) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function fakeVpk(file, entries) {
  const locals = [], centrals = []; let off = 0;
  for (const [name, data] of Object.entries(entries)) {
    const n = Buffer.from(name), d = Buffer.from(data, 'latin1'), crc = crc32(d);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(10, 4); l.writeUInt32LE(crc, 14); l.writeUInt32LE(d.length, 18); l.writeUInt32LE(d.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(10, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(d.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    locals.push(l, n, d); centrals.push(c, n); off += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(centrals), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Object.keys(entries).length, 8); e.writeUInt16LE(Object.keys(entries).length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([...locals, cd, e]));
}
const vitaSfo = (dir, id) => { fs.mkdirSync(path.join(dir, 'sce_sys'), { recursive: true }); fs.writeFileSync(path.join(dir, 'sce_sys/param.sfo'), Buffer.from(`\0PSF TITLE_ID\0${id}\0`, 'latin1')); };

test('Vita: title ID from a .vpk, a .pkg with its zRIF from a text file next to it', async () => {
  const v = path.join(TMP, 'vita/vpk/Game.vpk');
  fakeVpk(v, { 'eboot.bin': 'x', 'sce_sys/param.sfo': '\0PSF TITLE_ID\0PCSE00123\0' });
  assert.deepStrictEqual(await P.vitaContent(path.dirname(v)), { kind: 'vpk', file: v, titleId: 'PCSE00123', zrif: null });
  const d = path.join(TMP, 'vita/pkg');
  fakePkg(path.join(d, 'Game.pkg'), { contentId: 'EP0001-PCSB00456_00-0000000000000000', platform: 2, type: 0x15 });
  fs.writeFileSync(path.join(d, 'key.txt'), 'zRIF: KO5ifR1dQd3iMmBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==\n');
  const c = await P.vitaContent(d);
  assert.strictEqual(c.kind, 'pkg'); assert.strictEqual(c.titleId, 'PCSB00456'); assert.match(c.zrif, /^KO5ifR1dQd3/);
  // a PS3 package is not a Vita game
  assert.strictEqual(await P.vitaContent(path.join(TMP, 'roms/ps3/Game')), null);
});

test('Vita: installs a .pkg through a stand-in Vita3K with --pkg and --zrif', async () => {
  const pref = path.join(TMP, 'vita3k-pref');
  fs.mkdirSync(path.join(pref, 'ux0/app'), { recursive: true });
  const exe = path.join(TMP, 'fake-vita3k');
  fs.writeFileSync(exe, `#!/bin/sh\necho "$@" > "${TMP}/vargs"\nmkdir -p "${pref}/ux0/app/PCSB00456/sce_sys"\nprintf '\\0PSF TITLE_ID PCSB00456' > "${pref}/ux0/app/PCSB00456/sce_sys/param.sfo"\n`);
  fs.chmodSync(exe, 0o755);
  const item = await P.vitaContent(path.join(TMP, 'vita/pkg'));
  const out = await P.installVita({ cmd: { exe, args: [] }, prefs: [pref], item });
  assert.deepStrictEqual(out.map((g) => [g.serial, g.created]), [['PCSB00456', true]]);
  // 0.9.57: relative to the file's folder (Vita3K drops arguments starting with a slash)
  assert.strictEqual(fs.readFileSync(path.join(TMP, 'vargs'), 'utf8').trim(), `--pkg ./${path.basename(item.file)} --zrif ${item.zrif}`);
});

test('Vita: delete refuses anything that is not exactly the game Cartridge installed', () => {
  const pref = path.join(TMP, 'vdel');
  const app = path.join(pref, 'ux0/app');
  vitaSfo(path.join(app, 'PCSE00001'), 'PCSE00001');
  const ok = { emu: 'vita3k', serial: 'PCSE00001', dir: path.join(app, 'PCSE00001'), created: true };
  assert.strictEqual(P.safeToRemove(ok, [pref]).ok, true);
  assert.strictEqual(P.safeToRemove({ ...ok, created: false }, [pref]).ok, false);
  assert.strictEqual(P.safeToRemove({ ...ok, emu: 'rpcs3' }, [pref]).ok, false); // checked against the wrong emulator's rules
  vitaSfo(path.join(app, 'PCSE00002'), 'PCSE00009');
  assert.strictEqual(P.safeToRemove({ ...ok, serial: 'PCSE00002', dir: path.join(app, 'PCSE00002') }, [pref]).ok, false);
  const outside = path.join(TMP, 'vdel-out/PCSE00003'); vitaSfo(outside, 'PCSE00003');
  fs.symlinkSync(outside, path.join(app, 'PCSE00003'));
  assert.strictEqual(P.safeToRemove({ ...ok, serial: 'PCSE00003', dir: path.join(app, 'PCSE00003') }, [pref]).ok, false);
  // savedata, or the app folder itself, never
  vitaSfo(path.join(pref, 'ux0/user/00/savedata/PCSE00001'), 'PCSE00001');
  assert.strictEqual(P.safeToRemove({ ...ok, dir: path.join(pref, 'ux0/user/00/savedata/PCSE00001') }, [pref]).ok, false);
  assert.strictEqual(P.safeToRemove({ ...ok, dir: app }, [pref]).ok, false);
});

// ---------------------------------------------------------------- licences (Failed to decrypt content)
function psnPkg(file, contentId, drm = 2) {
  fakePkg(file, { contentId });
  const b = fs.readFileSync(file);
  b.writeUInt32BE(3, 12); // three metadata packets: DRM type first
  const meta = Buffer.alloc(36);
  meta.writeUInt32BE(1, 0); meta.writeUInt32BE(4, 4); meta.writeUInt32BE(drm, 8);
  b.copy(meta, 12, 0xc0, 0xc0 + 24);
  meta.copy(b, 0xc0);
  fs.writeFileSync(file, b);
}
const CID = 'UP0001-NPUA80523_00-GAME000000000000';

test('licences: right name, wrong name renamed, missing, or already in RPCS3', () => {
  const hdd = path.join(TMP, 'lic/dev_hdd0'); fs.mkdirSync(path.join(hdd, 'game'), { recursive: true });
  const d = path.join(TMP, 'lic/dl');
  psnPkg(path.join(d, 'Game.pkg'), CID);
  assert.strictEqual(P.packagesIn(d).pkgs[0].needsRap, true);
  assert.deepStrictEqual(P.licencePlan(P.packagesIn(d), [hdd]).map((l) => l.from), ['missing']);
  fs.writeFileSync(path.join(d, 'licence.rap'), Buffer.alloc(16, 1));
  const plan = P.licencePlan(P.packagesIn(d), [hdd]);
  assert.deepStrictEqual(plan.map((l) => l.from), ['renamed']);
  const staged = P.stageLicences(plan, path.join(TMP, 'lic/tmp'));
  assert.deepStrictEqual(staged.map((f) => path.basename(f)), [CID + '.rap']);
  fs.renameSync(path.join(d, 'licence.rap'), path.join(d, CID + '.rap'));
  assert.deepStrictEqual(P.licencePlan(P.packagesIn(d), [hdd]).map((l) => l.from), ['download']);
  fs.rmSync(path.join(d, CID + '.rap'));
  fs.mkdirSync(path.join(hdd, 'home/00000001/exdata'), { recursive: true });
  fs.writeFileSync(path.join(hdd, 'home/00000001/exdata', CID + '.rap'), Buffer.alloc(16, 1));
  assert.deepStrictEqual(P.licencePlan(P.packagesIn(d), [hdd]).map((l) => l.from), ['rpcs3']);
  // a free game needs none
  psnPkg(path.join(TMP, 'lic/free/Game.pkg'), 'UP0001-NPUA80524_00-GAME000000000000', 3);
  assert.deepStrictEqual(P.licencePlan(P.packagesIn(path.join(TMP, 'lic/free')), [hdd]), []);
});

test('an installed PSN game: content ID and licence need from its EBOOT.BIN', () => {
  const g = path.join(TMP, 'npd/NPUA80523/USRDIR'); fs.mkdirSync(g, { recursive: true });
  const b = Buffer.alloc(0x200); b.write('SCE\0', 0, 'latin1');
  b.write('NPD\0', 0x80, 'latin1'); b.writeInt32BE(3, 0x84); b.writeInt32BE(2, 0x88); b.writeInt32BE(0, 0x8c); b.write(CID, 0x90, 'latin1');
  fs.writeFileSync(path.join(g, 'EBOOT.BIN'), b);
  assert.deepStrictEqual(P.npdOf(path.dirname(g)), { contentId: CID, needsRap: true });
});

test('Vita: an install with no licence is reported, not called ready', async () => {
  const pref = path.join(TMP, 'vlic');
  fs.mkdirSync(path.join(pref, 'ux0/app'), { recursive: true });
  const exe = path.join(TMP, 'fake-vita3k-nolic');
  fs.writeFileSync(exe, `#!/bin/sh\nmkdir -p "${pref}/ux0/app/PCSE00123/sce_sys"\nprintf '\\0PSF TITLE_ID PCSE00123' > "${pref}/ux0/app/PCSE00123/sce_sys/param.sfo"\n`);
  fs.chmodSync(exe, 0o755);
  // 0.9.19: a .vpk Cartridge can't read fully (here a stand-in param.sfo) still goes through Vita3K
  const item = await P.vitaContent(path.join(TMP, 'vita/vpk'));
  let out = await P.installVita({ cmd: { exe, args: [] }, prefs: [pref], item });
  assert.strictEqual(out[0].licenced, false);
  fs.mkdirSync(path.join(pref, 'ux0/app/PCSE00123/sce_sys/package'), { recursive: true });
  fs.writeFileSync(path.join(pref, 'ux0/app/PCSE00123/sce_sys/package/work.bin'), 'x');
  out = await P.installVita({ cmd: { exe, args: [] }, prefs: [pref], item });
  assert.strictEqual(out[0].licenced, true);
});
