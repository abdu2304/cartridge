// Per-game settings for every emulator (0.9.62, owner: "across the board"). Each emulator's file is written the way
// its own source reads it (docs/game-settings/<emu>.md); the list of settings comes from its source too
// (tools/game-settings/gen.js -> electron/emuSettingsDb.json).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const G = require('../electron/gameSettings.js');
const DB = require('../electron/emuSettingsDb.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cartridge-gsall-'));
G.setRecsFile(path.join(TMP, 'recs.json'));
const dir = (n) => { const d = path.join(TMP, n); fs.mkdirSync(d, { recursive: true }); return d; };
const by = (d, k) => d.items.find((x) => x.id === k || x.id.endsWith('.' + k));

test('every emulator’s list is usable: keys, types, choices, defaults among the choices, Advanced last', () => {
  for (const [emu, list] of Object.entries(DB)) {
    if (emu === 'note' || emu === 'versions') continue;
    const entries = emu === 'retroarchCores' ? Object.values(list).flatMap((c) => c.entries) : list;
    assert.ok(entries.length > 0, emu);
    for (const x of entries) {
      assert.ok(x.k && x.t && x.l, `${emu} ${x.k}`);
      if (x.t === 'enum' || x.t === 'bool') assert.ok((x.o || []).length, `${emu} ${x.k} has choices`);
    }
  }
  const ids = new Set(DB.ppsspp.map((x) => x.s + '.' + x.k));
  assert.ok(!ids.has('Graphics.GraphicsBackend')); // not a per-game setting in PPSSPP
});

test('Eden: three lines to set a value, use_global back to its own, the base game’s ID', () => {
  const cfg = dir('eden');
  fs.writeFileSync(path.join(cfg, 'qt-config.ini'), '[Renderer]\nuse_vsync\\default=false\nuse_vsync=2\n');
  const ctx = { emu: 'eden', serial: '0100F2C0115B6000', cfgDir: cfg };
  let d = G.describe(ctx);
  assert.strictEqual(by(d, 'use_vsync').base, '2');
  assert.strictEqual(d.items[d.items.length - 1].tab, 'Advanced');
  G.apply(ctx, [{ id: 'Renderer.use_vsync', value: '1' }]);
  const t = fs.readFileSync(path.join(cfg, 'custom', '0100F2C0115B6000.ini'), 'utf8');
  assert.match(t, /use_vsync\\use_global=false/); assert.match(t, /use_vsync\\default=false/); assert.match(t, /use_vsync=1/);
  d = G.apply(ctx, [{ id: 'Renderer.use_vsync', value: null }]);
  assert.strictEqual(by(d, 'use_vsync').game, null);
});

test('Azahar: use_global=false and the value, no default line', () => {
  const cfg = dir('azahar');
  fs.writeFileSync(path.join(cfg, 'qt-config.ini'), '[Renderer]\nuse_vsync=true\n');
  const ctx = { emu: 'azahar', serial: '00040000001B5000', cfgDir: cfg };
  const d = G.describe(ctx), v = by(d, 'use_vsync');
  assert.ok(v, 'use_vsync listed');
  G.apply(ctx, [{ id: v.id, value: 'false' }]);
  const t = fs.readFileSync(path.join(cfg, 'custom', '00040000001B5000.ini'), 'utf8');
  assert.match(t, /use_vsync\\use_global=false/); assert.match(t, /use_vsync=false/); assert.doesNotMatch(t, /\\default/);
});

test('Vita3K: the whole file from config.yml, back to config.yml’s value on reset', () => {
  const cfg = dir('vita3k');
  fs.writeFileSync(path.join(cfg, 'config.yml'), 'resolution-multiplier: 2\nngs-enable: false\npsn-signed-in: 1\nlle-modules: [libfoo]\n');
  const ctx = { emu: 'vita3k', serial: 'PCSE00000', cfgDir: cfg };
  G.apply(ctx, [{ id: 'gpu.resolution-multiplier', value: '1.5' }]);
  const f = path.join(cfg, 'config', 'config_PCSE00000.xml'), t = fs.readFileSync(f, 'utf8');
  assert.match(t, /resolution-multiplier="1.5"/); assert.match(t, /enable-ngs="false"/); assert.match(t, /psn-signed-in="true"/); assert.match(t, /<module>libfoo<\/module>/);
  assert.match(t, /validation-layer="true"/); // every attribute written: a missing one reads as off
  G.apply(ctx, [{ id: 'gpu.resolution-multiplier', value: null }]);
  assert.ok(!fs.existsSync(f)); // Cartridge made it and nothing of yours is left
});

test('Xenia: overrides only, strings quoted, inline comments read past', () => {
  const root = dir('xenia');
  fs.writeFileSync(path.join(root, 'xenia-canary.config.toml'), '[GPU]\ndraw_resolution_scale_x = 1  # scale\nreadback_resolve = "fast"\n');
  const ctx = { emu: 'xenia', serial: '4D5307E6', cfgDir: root };
  const d = G.describe(ctx);
  assert.strictEqual(by(d, 'draw_resolution_scale_x').base, '1');
  G.apply(ctx, [{ id: 'GPU.readback_resolve', value: 'none' }, { id: 'GPU.draw_resolution_scale_x', value: '2' }]);
  const t = fs.readFileSync(path.join(root, 'config', '4D5307E6.config.toml'), 'utf8');
  assert.match(t, /readback_resolve = "none"/); assert.match(t, /draw_resolution_scale_x = 2/);
});

test('Cemu: a new profile starts from the one Cemu ships; the graphics API’s own value from settings.xml', () => {
  const cfg = dir('cemu'), data = dir('cemu-data');
  fs.writeFileSync(path.join(cfg, 'settings.xml'), '<content><Graphic><api>1</api></Graphic></content>');
  fs.mkdirSync(path.join(data, 'gameProfiles', 'default'), { recursive: true });
  fs.writeFileSync(path.join(data, 'gameProfiles', 'default', '00050000101c9500.ini'), '# Zelda\n[CPU]\nthreadQuantum = 60000\n');
  const ctx = { emu: 'cemu', serial: '00050000101C9500', cfgDir: cfg, dataDir: data };
  const d = G.describe(ctx);
  assert.strictEqual(by(d, 'graphics_api').base, '1');
  assert.strictEqual(by(d, 'threadQuantum').game, '60000'); // the shipped profile is what applies today
  G.apply(ctx, [{ id: 'Graphics.graphics_api', value: '0' }]);
  const t = fs.readFileSync(path.join(cfg, 'gameProfiles', '00050000101c9500.ini'), 'utf8');
  assert.match(t, /threadQuantum = 60000/); assert.match(t, /graphics_api = 0/);
});

test('Flycast: only the game’s section of emu.cfg, keys with the option’s section in front', () => {
  const f = path.join(dir('flycast'), 'emu.cfg');
  fs.writeFileSync(f, '[config]\nrend.WideScreen = no\n\n[audio]\nVmuSound = no\n');
  const ctx = { emu: 'flycast', serial: 'MK-51052', cfgFile: f };
  const ws = by(G.describe(ctx), 'rend.WideScreen');
  assert.strictEqual(ws.base, 'no');
  G.apply(ctx, [{ id: ws.id, value: 'yes' }]);
  const t = fs.readFileSync(f, 'utf8');
  assert.match(t, /\[MK-51052\]\nconfig\.rend\.WideScreen = yes/); assert.match(t, /\[config\]\nrend\.WideScreen = no/);
  G.apply(ctx, [{ id: ws.id, value: null }]);
  assert.ok(fs.existsSync(f)); // the main file is never removed
});

test('MAME: <rom>.ini with name value lines', () => {
  const root = dir('mame'); fs.mkdirSync(path.join(root, 'ini'));
  fs.writeFileSync(path.join(root, 'mame.ini'), 'autosave                  0\n');
  const ctx = { emu: 'mame', serial: 'sf2', iniDir: path.join(root, 'ini'), mameIni: path.join(root, 'mame.ini') };
  const a = by(G.describe(ctx), 'autosave');
  assert.strictEqual(a.base, '0');
  G.apply(ctx, [{ id: a.id, value: '1' }]);
  assert.match(fs.readFileSync(path.join(root, 'ini', 'sf2.ini'), 'utf8'), /^autosave\s+1$/m);
});

test('Supermodel: the game’s section, found among several names, over [ Global ]', () => {
  const f = path.join(dir('supermodel'), 'Supermodel.ini');
  fs.writeFileSync(f, '[ Global ]\nMultiThreaded = 1\n\n[ scud, scudp ]\nPowerPCFrequency = 50\n');
  const ctx = { emu: 'supermodel', serial: 'scudp', cfgFile: f };
  const d = G.describe(ctx);
  assert.strictEqual(by(d, 'MultiThreaded').base, '1');
  assert.strictEqual(by(d, 'PowerPCFrequency').game, '50');
  G.apply(ctx, [{ id: by(d, 'MultiThreaded').id, value: '0' }]);
  assert.match(fs.readFileSync(f, 'utf8'), /\[ scud, scudp \]\nPowerPCFrequency = 50\nMultiThreaded = 0/);
});

test('Ryujinx: a whole copy of Config.json, values keeping their type', () => {
  const cfg = dir('ryujinx');
  fs.writeFileSync(path.join(cfg, 'Config.json'), JSON.stringify({ version: 70, res_scale: 1, enable_vsync: true }));
  const ctx = { emu: 'ryujinx', serial: '01007EF00011E000', cfgDir: cfg };
  const rs = by(G.describe(ctx), 'res_scale');
  G.apply(ctx, [{ id: rs.id, value: '2' }]);
  const j = JSON.parse(fs.readFileSync(path.join(cfg, 'games', '01007ef00011e000', 'Config.json'), 'utf8'));
  assert.strictEqual(j.res_scale, 2); assert.strictEqual(j.version, 70); assert.strictEqual(j.enable_vsync, true);
});

test('RetroArch: the game’s override and its core options, each in its own file', () => {
  const cfg = dir('retroarch');
  fs.writeFileSync(path.join(cfg, 'retroarch.cfg'), 'video_scale_integer = "false"\n');
  fs.writeFileSync(path.join(cfg, 'retroarch-core-options.cfg'), 'snes9x_region = "auto"\n');
  const ctx = { emu: 'retroarch', core: 'snes9x', coreName: 'Snes9x', serial: 'Super Metroid (USA)', cfgDir: cfg };
  const d = G.describe(ctx);
  assert.strictEqual(by(d, 'video_scale_integer').base, 'false');
  assert.strictEqual(by(d, 'snes9x_region').base, 'auto');
  assert.strictEqual(d.items[d.items.length - 1].tab, 'Advanced');
  G.apply(ctx, [{ id: by(d, 'video_scale_integer').id, value: 'true' }, { id: by(d, 'snes9x_region').id, value: 'pal' }]);
  assert.match(fs.readFileSync(path.join(cfg, 'config', 'Snes9x', 'Super Metroid (USA).cfg'), 'utf8'), /^video_scale_integer = "true"$/m);
  assert.match(fs.readFileSync(path.join(cfg, 'config', 'Snes9x', 'Super Metroid (USA).opt'), 'utf8'), /^snes9x_region = "pal"$/m);
});

test('a typed number outside the emulator’s own range is refused in plain words', () => {
  const ctx = { emu: 'flycast', serial: 'MK-51052', cfgFile: path.join(TMP, 'flycast', 'emu.cfg') };
  const clock = by(G.describe(ctx), 'Sh4Clock');
  assert.deepStrictEqual([clock.num.min, clock.num.max], [100, 300]);
  assert.throws(() => G.apply(ctx, [{ id: clock.id, value: '999' }]), /from 100 to 300/);
});

test('Xbox 360 title IDs from a disc image, a default.xex and an STFS package', () => {
  const X = require('../electron/x360Id.js');
  const xex = Buffer.alloc(0x200); xex.write('XEX2', 0); xex.writeUInt32BE(1, 20); xex.writeUInt32BE(0x00040006, 24); xex.writeUInt32BE(0x100, 28); xex.writeUInt32BE(0x4d5307e6, 0x100 + 12);
  assert.strictEqual(X.xexTitle(xex), '4D5307E6');
  const folder = dir('x360game'); fs.writeFileSync(path.join(folder, 'default.xex'), xex);
  assert.strictEqual(X.titleId(folder), '4D5307E6');
  // XDVDFS: volume descriptor at sector 32, a root directory with one entry, default.xex at sector 40
  const iso = Buffer.alloc(41 * 2048 + 0x200);
  iso.write('MICROSOFT*XBOX*MEDIA', 32 * 2048, 'latin1'); iso.writeUInt32LE(34, 32 * 2048 + 20); iso.writeUInt32LE(2048, 32 * 2048 + 24);
  const e = 34 * 2048; iso.writeUInt16LE(0, e); iso.writeUInt16LE(0, e + 2); iso.writeUInt32LE(40, e + 4); iso.writeUInt32LE(0x200, e + 8); iso[e + 12] = 0; iso[e + 13] = 11; iso.write('default.xex', e + 14, 'latin1');
  xex.copy(iso, 40 * 2048);
  const isoFile = path.join(TMP, 'game.iso'); fs.writeFileSync(isoFile, iso);
  assert.strictEqual(X.titleId(isoFile), '4D5307E6');
  const con = Buffer.alloc(0x400); con.write('CON ', 0, 'latin1'); con.writeUInt32BE(0x58410a6d, 0x360);
  const conFile = path.join(TMP, 'package'); fs.writeFileSync(conFile, con);
  assert.strictEqual(X.titleId(conFile), '58410A6D');
});

test('each emulator release gets its own choices; an unknown version locks only what differs (0.9.63)', () => {
  const G = require('../electron/gameSettings');
  const db = require('../electron/emuSettingsDb.json');
  const T = db.versions.eden.tags;
  assert.strictEqual(G.pickRelease(T, '0.2.0'), 'v0.2.0');
  assert.strictEqual(G.pickRelease(T, '0.2.1.500'), 'newest');
  assert.strictEqual(G.pickRelease(T, '0.0.1'), null);
  assert.strictEqual(G.pickRelease(T, 'build 2026-10-07'), null);
  // the owner's Eden 0.2.0: three GPU Modes, 1 = Balanced, and nothing that release doesn't have
  const L = G.listFor('eden', '0.2.0');
  assert.deepStrictEqual(L.list.find((x) => x.k === 'gpu_accuracy').o, [['0', 'Fast'], ['1', 'Balanced'], ['2', 'Accurate']]);
  assert.ok(!L.list.some((x) => x.k === 'frame_gen'));
  // unknown: what differs is locked, the rest isn't
  const U = G.listFor('eden', null);
  assert.ok(U.locked.has('Renderer.gpu_accuracy') && !U.locked.has('Renderer.resolution_setup'));
  // every release read has a sane diff: no more than half the settings changed
  for (const [emu, V] of Object.entries(db.versions)) for (const t of V.tags) assert.ok(Object.keys(V.diff[t]).length < db[emu].length / 2, `${emu} ${t}`);
});
