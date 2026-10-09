// Per-game emulator settings (0.9.23): only the per-game file, only the keys changed, layered formats
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const G = require('../electron/gameSettings');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-'));
G.setRecsFile(path.join(TMP, 'game-settings.json'));

test('PCSX2: a game file is made with just the changed keys, and goes away when they go back', () => {
  const root = path.join(TMP, 'PCSX2');
  fs.mkdirSync(path.join(root, 'inis'), { recursive: true });
  fs.writeFileSync(path.join(root, 'inis/PCSX2.ini'), '[EmuCore/GS]\nupscale_multiplier = 2\nRenderer = 14\n');
  const ctx = { emu: 'pcsx2', serial: 'SLUS-21287', crc: '9C712FF0', pcsx2: { root, gamesettings: path.join(root, 'gamesettings') } };
  let d = G.describe(ctx);
  assert.strictEqual(d.items.find((x) => x.id === 'EmuCore/GS.upscale_multiplier').base, '2');
  d = G.apply(ctx, [{ id: 'EmuCore/GS.upscale_multiplier', value: '4' }, { id: 'EmuCore.EnableWideScreenPatches', value: 'true' }]);
  const f = path.join(root, 'gamesettings/SLUS-21287_9C712FF0.ini');
  assert.strictEqual(fs.readFileSync(f, 'utf8'), '[EmuCore/GS]\nupscale_multiplier = 4\n\n[EmuCore]\nEnableWideScreenPatches = true\n');
  assert.strictEqual(d.items.find((x) => x.id === 'EmuCore/GS.upscale_multiplier').game, '4');
  assert.throws(() => G.apply(ctx, [{ id: 'EmuCore/GS.upscale_multiplier', value: '99' }]), /isn’t one/);
  G.apply(ctx, [{ id: 'EmuCore/GS.upscale_multiplier', value: null }, { id: 'EmuCore.EnableWideScreenPatches', value: null }]);
  assert.ok(!fs.existsSync(f)); // Cartridge made it, nothing of yours left in it
});

test('a game file that was already there keeps everything else', () => {
  const root = path.join(TMP, 'duck');
  fs.mkdirSync(path.join(root, 'gamesettings'), { recursive: true });
  const f = path.join(root, 'gamesettings/SCUS-94900.ini');
  fs.writeFileSync(f, '[Main]\nEmulationSpeed = 2\n\n[GPU]\nResolutionScale = 2\n');
  const ctx = { emu: 'duckstation', serial: 'SCUS-94900', duckRoot: root };
  G.apply(ctx, [{ id: 'GPU.ResolutionScale', value: '4' }, { id: 'GPU.WidescreenHack', value: 'true' }]);
  assert.strictEqual(fs.readFileSync(f, 'utf8'), '[Main]\nEmulationSpeed = 2\n\n[GPU]\nResolutionScale = 4\nWidescreenHack = true\n');
  G.apply(ctx, [{ id: 'GPU.ResolutionScale', value: null }, { id: 'GPU.WidescreenHack', value: null }]);
  assert.strictEqual(fs.readFileSync(f, 'utf8'), '[Main]\nEmulationSpeed = 2\n\n[GPU]\n'); // yours stays
});

test('RPCS3 YAML and shadPS4 JSON, Dolphin reads its base under its own section names', () => {
  const r = path.join(TMP, 'rpcs3');
  fs.mkdirSync(path.join(r, 'config'), { recursive: true });
  fs.writeFileSync(path.join(r, 'config/config.yml'), 'Video:\n  Renderer: Vulkan\n  Resolution Scale: 150\n');
  const ctx = { emu: 'rpcs3', serial: 'BLUS30443', rpcs3Root: r };
  assert.strictEqual(G.describe(ctx).items.find((x) => x.id === 'Video.Resolution Scale').base, '150');
  G.apply(ctx, [{ id: 'Video.Resolution Scale', value: '300' }, { id: 'Video.Write Color Buffers', value: 'true' }]);
  assert.strictEqual(fs.readFileSync(path.join(r, 'config/custom_configs/config_BLUS30443.yml'), 'utf8'), 'Video:\n  Resolution Scale: 300\n  Write Color Buffers: true\n');
  const s = path.join(TMP, 'shad');
  G.apply({ emu: 'shadps4', serial: 'CUSA00900', shadUser: s }, [{ id: 'GPU.readbacks_mode', value: '1' }, { id: 'GPU.fsr_enabled', value: 'false' }]);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(s, 'custom_configs/CUSA00900.json'), 'utf8')), { GPU: { readbacks_mode: 1, fsr_enabled: false } });
  // typed numbers (0.9.29): any value in shadPS4's range, decimals only where it takes them
  G.apply({ emu: 'shadps4', serial: 'CUSA00900', shadUser: s }, [{ id: 'GPU.vblank_frequency', value: '75' }, { id: 'General.trophy_notification_duration', value: '2.5' }]);
  const j = JSON.parse(fs.readFileSync(path.join(s, 'custom_configs/CUSA00900.json'), 'utf8'));
  assert.strictEqual(j.GPU.vblank_frequency, 75);
  assert.strictEqual(j.General.trophy_notification_duration, 2.5);
  assert.throws(() => G.apply({ emu: 'shadps4', serial: 'CUSA00900', shadUser: s }, [{ id: 'GPU.vblank_frequency', value: '9999' }]), /10 to 480/);
  assert.throws(() => G.apply({ emu: 'shadps4', serial: 'CUSA00900', shadUser: s }, [{ id: 'GPU.window_width', value: '1280.5' }]), /320 to 7680/);
  const u = path.join(TMP, 'dol'), c = path.join(TMP, 'dolcfg');
  fs.mkdirSync(c, { recursive: true }); fs.writeFileSync(path.join(c, 'GFX.ini'), '[Settings]\nInternalResolution = 3\n');
  const dctx = { emu: 'dolphin', serial: 'GZLE01', dolphin: { user: u, config: c } };
  assert.strictEqual(G.describe(dctx).items.find((x) => x.id === 'Video_Settings.InternalResolution').base, '3');
});

test('every setting in the emulator’s own file is listed, typed from its value (0.9.46)', () => {
  const user = path.join(TMP, 'shad');
  fs.mkdirSync(path.join(user, 'custom_configs'), { recursive: true });
  fs.writeFileSync(path.join(user, 'config.json'), JSON.stringify({ General: { extraDmemInMbytes: 0, logFilter: '', isPSNSignedIn: false }, GPU: { scale: 1.5 }, Input: { cursorState: 1 } }));
  const ctx = { emu: 'shadps4', serial: 'CUSA00001', shadUser: user };
  const d = G.describe(ctx);
  const by = (id) => d.items.find((x) => x.id === id);
  assert.ok(by('General.extraDmemInMbytes').num && by('General.extraDmemInMbytes').tab === 'All Settings');
  assert.strictEqual(by('General.logFilter').type, 'text');
  assert.ok(by('GPU.scale').num.decimals);
  assert.ok(!by('Input.cursorState')); // a section the per-game file can't override
  G.apply(ctx, [{ id: 'General.extraDmemInMbytes', value: '3000' }, { id: 'General.logFilter', value: 'Core:Info\n' }]);
  const j = JSON.parse(fs.readFileSync(path.join(user, 'custom_configs/CUSA00001.json'), 'utf8'));
  assert.strictEqual(j.General.extraDmemInMbytes, 3000);
  assert.strictEqual(j.General.logFilter, 'Core:Info');
  assert.throws(() => G.apply(ctx, [{ id: 'General.extraDmemInMbytes', value: 'lots' }]));
});

// 0.9.61 (owner: PPSSPP's per-game list was wrong and in one stack, Dolphin's missed most settings): both come from
// the emulators' source (emuSettingsDb.json), split into tabs, with the emulator's default when its file is silent
test('PPSSPP lists only its per-game settings, in tabs, with its own names and choices', () => {
  const root = path.join(TMP, 'psp61');
  fs.mkdirSync(path.join(root, 'PSP/SYSTEM'), { recursive: true });
  fs.writeFileSync(path.join(root, 'PSP/SYSTEM/ppsspp.ini'), '[Graphics]\nGraphicsBackend = 3 (VULKAN)\nInternalResolution = 2\n');
  const d = G.describe({ emu: 'ppsspp', serial: 'ULUS10001', ppsspp: { root, ini: path.join(root, 'PSP/SYSTEM/ppsspp.ini') } });
  const by = (id) => d.items.find((x) => x.id === id);
  assert.ok(!by('Graphics.GraphicsBackend')); // not a per-game setting in PPSSPP (CfgFlag::DEFAULT)
  assert.deepStrictEqual([...new Set(d.items.map((x) => x.tab))], ['Graphics', 'CPU', 'Audio', 'Controls', 'System', 'General', 'Advanced']); // Advanced last (0.9.62)
  assert.ok(!d.items.some((x) => x.tab === 'All Settings'));
  const sb = by('Graphics.SplineBezierQuality');
  assert.strictEqual(sb.label, 'Spline/Bezier curves quality');
  assert.deepStrictEqual(sb.options.map((o) => o.label), ['Low', 'Medium', 'High']);
  assert.strictEqual(sb.base, '2'); // PPSSPP's default when its file doesn't say
  assert.strictEqual(by('Graphics.TextureFiltering').options[0].value, '1'); // the list starts at 1 in PPSSPP
});

test('Dolphin lists every per-game setting, with defaults from its source', () => {
  const user = path.join(TMP, 'dol61');
  fs.mkdirSync(path.join(user, 'Config'), { recursive: true });
  fs.writeFileSync(path.join(user, 'Config/GFX.ini'), '[Settings]\nInternalResolution = 3\n');
  const ctx = { emu: 'dolphin', serial: 'GALE01', dolphin: { user, config: path.join(user, 'Config') } };
  const d = G.describe(ctx);
  const by = (id) => d.items.find((x) => x.id === id);
  assert.ok(d.items.length > 120);
  assert.strictEqual(by('Video_Hacks.EFBAccessEnable').base, 'False'); // not in GFX.ini: Dolphin's default
  assert.strictEqual(by('Video_Settings.AspectRatio').base, '0'); // a picked row shows the default too
  assert.ok(by('Core.CPUCore').options.every((o) => !/ARM/.test(o.label)));
  assert.ok(!d.items.some((x) => /Path|WiiLink/.test(x.id)));
  G.apply(ctx, [{ id: 'Video_Hacks.EFBAccessEnable', value: 'True' }, { id: 'DSP.EnableJIT', value: 'False' }]);
  const t = fs.readFileSync(path.join(user, 'GameSettings/GALE01.ini'), 'utf8');
  assert.match(t, /\[Video_Hacks\][^[]*EFBAccessEnable = True/);
  assert.match(t, /\[DSP\][^[]*EnableJIT = False/);
});
