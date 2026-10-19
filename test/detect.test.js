// Emulator detection against fake homes: EmuDeck, Flatpak only, distro packages, AppImages in the
// usual folder, AppImages anywhere and renamed, and nothing installed. Run with: npm test
// Each setup runs in its own process so HOME and PATH are read fresh. Nothing outside a temp folder
// is touched. The .sqfs fixtures were made with mksquashfs (gzip, xz, uncompressed).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cartridge-detect-'));
process.env.FLATPAK_SYSTEM_DIR = path.join(TMP, 'no-system-flatpak'); // the PC's own Flatpaks stay out (children inherit it)
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

// A minimal AppImage: an ELF header stamped "AI" type 2, a .upd_info section, then the squashfs.
// Padded (sparse) past the scan's minimum size, as real AppImages are.
function fakeAppImage(file, sqfs, upd = '') {
  const strtab = Buffer.from('\0.shstrtab\0.upd_info\0', 'latin1');
  const updBuf = Buffer.alloc(64); updBuf.write(upd);
  const shoff = 64 + strtab.length + updBuf.length;
  const h = Buffer.alloc(64);
  h.writeUInt32BE(0x7f454c46, 0); h[4] = 2; h[5] = 1; h[6] = 1; h.write('AI', 8, 'latin1'); h[10] = 2;
  h.writeBigUInt64LE(BigInt(shoff), 0x28); h.writeUInt16LE(64, 0x3a); h.writeUInt16LE(3, 0x3c); h.writeUInt16LE(1, 0x3e);
  const sh = Buffer.alloc(64 * 3);
  const sec = (i, name, off, size) => { sh.writeUInt32LE(name, i * 64); sh.writeBigUInt64LE(BigInt(off), i * 64 + 0x18); sh.writeBigUInt64LE(BigInt(size), i * 64 + 0x20); };
  sec(1, 1, 64, strtab.length); sec(2, 11, 64 + strtab.length, updBuf.length);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([h, strtab, updBuf, sh, fs.readFileSync(path.join(FIX, sqfs))]));
  fs.truncateSync(file, 2 * 1024 * 1024);
  fs.chmodSync(file, 0o755);
}

const detect = require(path.join(ROOT, 'electron/detect.js'));

test('reads the name card inside an AppImage (gzip, xz, uncompressed)', () => {
  for (const [sq, id] of [['shadps4-gzip.sqfs', 'shadps4'], ['eden-xz.sqfs', 'eden'], ['shadps4-raw.sqfs', 'shadps4']]) {
    const f = path.join(TMP, 'read', 'renamed thing');
    fakeAppImage(f, sq, 'gh-releases-zsync|someone|something|latest|x.zsync');
    assert.strictEqual(detect.appImageType(f), 2);
    const info = detect.readAppImage(f);
    assert.strictEqual(info.fs, 'squashfs', sq);
    assert.ok(info.desktop?.name, sq + ' has a desktop name');
    assert.match(info.upd, /gh-releases-zsync/);
    const idn = detect.identify({ ...info, fileName: 'renamed thing' });
    assert.strictEqual(idn.id, id, sq);
    assert.strictEqual(idn.conf, 3, sq);
  }
});

test('the file name alone is only a guess', () => {
  assert.deepStrictEqual(detect.identify({ fileName: 'pcsx2-v2.2.0.AppImage' }).id, 'pcsx2');
  assert.strictEqual(detect.identify({ fileName: 'pcsx2-v2.2.0.AppImage' }).conf, 1);
  assert.strictEqual(detect.identify({ fileName: 'my game backup.AppImage' }).id, null);
});

test('yuzu family forks count as one family', () => {
  const r = detect.identify({ desktop: { name: 'Eden', exec: 'eden %f' } });
  assert.strictEqual(r.id, 'eden');
  assert.strictEqual(detect.FAMILY.eden, detect.FAMILY.yuzu);
});

test('flatpak permissions: overrides and home', () => {
  const H = path.join(TMP, 'fp');
  const games = path.join(H, 'Games/roms');
  fs.mkdirSync(games, { recursive: true });
  const meta = path.join(H, '.local/share/flatpak/app/org.x.Emu/current/active');
  fs.mkdirSync(meta, { recursive: true });
  fs.writeFileSync(path.join(meta, 'metadata'), '[Application]\nname=org.x.Emu\n\n[Context]\nfilesystems=xdg-documents;\n');
  assert.strictEqual(detect.flatpakCanSee('org.x.Emu', games, H).ok, false);
  fs.mkdirSync(path.join(H, '.local/share/flatpak/overrides'), { recursive: true });
  fs.writeFileSync(path.join(H, '.local/share/flatpak/overrides/org.x.Emu'), '[Context]\nfilesystems=~/Games:ro;\n');
  assert.strictEqual(detect.flatpakCanSee('org.x.Emu', games, H).ok, true);
  assert.strictEqual(detect.flatpakCanSee('org.not.installed', games, H).known, false);
});

// ---------------------------------------------------------------- whole setups, through the Steam manager
function setup(name, build) {
  const H = path.join(TMP, 'home-' + name);
  fs.mkdirSync(H + '/bin', { recursive: true });
  const w = (f, body = '#!/bin/sh\n') => { fs.mkdirSync(path.dirname(H + f), { recursive: true }); fs.writeFileSync(H + f, body); fs.chmodSync(H + f, 0o755); };
  const flatpaks = [];
  const core = (dir, c) => { fs.mkdirSync(H + dir, { recursive: true }); fs.writeFileSync(`${H}${dir}/${c}_libretro.so`, ''); };
  build({ w, flatpaks, H, core, app: (f, sq) => fakeAppImage(H + f, sq) });
  w('/bin/flatpak', `#!/bin/sh\n[ "$1" = list ] && printf '%s\\n' ${flatpaks.map((f) => `'${f}'`).join(' ')}\n`);
  return H;
}
// candidates per console, as "label => exe args" with the home shown as ~ (after a scan when asked)
function candidates(H, keys, { scan = false, confirmed = {}, forks = {} } = {}) {
  const code = `
    const m = require(${JSON.stringify(path.join(ROOT, 'electron/steamManager.js'))});
    const cfg = { steam: { confirmed: ${JSON.stringify(confirmed)}, forks: ${JSON.stringify(forks)} } };
    const sm = m({ USER_DATA: ${JSON.stringify(H + '/.config/Cartridge')}, log() {}, PLATFORM_MAP: require(${JSON.stringify(path.join(ROOT, 'electron/platformMap'))}), getConfig: () => cfg, saveConfig() {}, broadcast() {},
      emulationRoots: () => [${JSON.stringify(H + '/Emulation')}].filter((d) => require('fs').existsSync(d)), getLibrary: () => null, installed: () => ({}), romById: () => null, isGamescope: () => false, artFor: () => ({}), MARKED: 'm', markedPath: () => null });
    (async () => {
      ${scan ? 'await sm.scanEmulators();' : ''}
      const o = {}; for (const k of ${JSON.stringify(keys)}) o[k] = sm._candidates(k).map((c) => c.label + ' => ' + c.t.exe.replace(${JSON.stringify(H)}, '~') + ' ' + c.t.args.replace(${JSON.stringify(H)}, '~'));
      console.log(JSON.stringify(o));
    })();`;
  fs.mkdirSync(H + '/.config/Cartridge', { recursive: true });
  const out = execFileSync(process.execPath, ['-e', code], { env: { ...process.env, HOME: H, SHELL: '/bin/false', PATH: `${H}/bin:${H}/.local/bin:/usr/bin:/bin` }, encoding: 'utf8' });
  return JSON.parse(out.trim().split('\n').pop());
}

test('EmuDeck: its launchers, and the copies they run are not listed twice', () => {
  const H = setup('emudeck', ({ w, flatpaks, core }) => {
    w('/Emulation/tools/launchers/retroarch.sh', '#!/bin/bash\n/usr/bin/flatpak run org.libretro.RetroArch "$@"\n');
    w('/Emulation/tools/launchers/pcsx2-qt.sh', '#!/bin/bash\n"$HOME/Applications/pcsx2-Qt.AppImage" "$@"\n');
    w('/Emulation/tools/launchers/xemu-emu.sh', '#!/bin/bash\n/usr/bin/flatpak run app.xemu.xemu "$@"\n');
    w('/Emulation/tools/launchers/eden.sh', '#!/bin/bash\n"$HOME/Applications/eden.AppImage" "$@"\n');
    w('/Applications/pcsx2-Qt.AppImage'); w('/Applications/eden.AppImage'); // 0.9.32: a launcher counts only while what it starts is there
    flatpaks.push('org.libretro.RetroArch', 'app.xemu.xemu');
    core('/.var/app/org.libretro.RetroArch/config/retroarch/cores', 'snes9x');
  });
  const c = candidates(H, ['snes', 'ps2', 'xbox', 'switch']);
  assert.match(c.snes[0], /retroarch\.sh -L snes9x_libretro\.so "\{ROM\}"/);
  assert.strictEqual(c.snes.length, 1);
  assert.match(c.ps2[0], /pcsx2-qt\.sh -batch/);
  assert.strictEqual(c.ps2.length, 1);
  assert.match(c.xbox[0], /xemu-emu\.sh -full-screen -dvd_path/);
  assert.match(c.switch[0], /eden\.sh -f -g/);
});

test('Flatpak only', () => {
  const H = setup('flatpak', ({ flatpaks, core }) => {
    flatpaks.push('org.libretro.RetroArch', 'net.pcsx2.PCSX2', 'io.github.ryubing.Ryujinx');
    core('/.var/app/org.libretro.RetroArch/config/retroarch/cores', 'snes9x');
  });
  const c = candidates(H, ['snes', 'ps2', 'switch', 'gc']);
  assert.ok(c.snes[0].includes('/usr/bin/flatpak run org.libretro.RetroArch -L snes9x_libretro.so "{ROM}"'));
  assert.match(c.ps2[0], /flatpak run net\.pcsx2\.PCSX2 -batch -fullscreen -nogui/);
  assert.match(c.switch[0], /run io\.github\.ryubing\.Ryujinx --fullscreen/);
  assert.strictEqual(c.gc.length, 0);
});

test('distro packages: programs on PATH and system cores', () => {
  const H = setup('native', ({ w, core }) => {
    for (const b of ['retroarch', 'dolphin-emu', 'PPSSPPSDL']) w('/.local/bin/' + b);
    core('/.config/retroarch/cores', 'mupen64plus_next');
  });
  const c = candidates(H, ['n64', 'gc', 'psp']);
  assert.match(c.n64[0], /retroarch -L ".*mupen64plus_next_libretro\.so" "\{ROM\}"/);
  assert.match(c.gc[0], /dolphin-emu -b -e/);
  assert.match(c.psp[0], /PPSSPPSDL --fullscreen "\{ROM\}"/);
});

test('AppImages in the usual folder, by name', () => {
  const H = setup('appimage', ({ w }) => {
    for (const a of ['pcsx2-v2.2.0-linux-appimage-x64-Qt.AppImage', 'Cemu-2.6-x86_64.AppImage']) w('/Applications/' + a);
  });
  const c = candidates(H, ['ps2', 'wiiu']);
  assert.match(c.ps2[0], /pcsx2-v2\.2\.0.*AppImage -batch/);
  assert.match(c.wiiu[0], /Cemu-2\.6.*AppImage -f -g/);
});

test('AppImages anywhere and renamed: found by what is inside them', () => {
  const H = setup('anywhere', ({ app }) => {
    app('/Documents/stuff/deeper/ps4', 'shadps4-gzip.sqfs'); // no extension, odd folder
    app('/Games/switch emulator', 'eden-xz.sqfs');
    app('/Downloads/pcsx2.AppImage', 'eden-xz.sqfs'); // named like PCSX2, but it's Eden inside
  });
  const before = candidates(H, ['ps4']);
  assert.strictEqual(before.ps4.length, 0, 'not found without a scan');
  const c = candidates(H, ['ps4', 'switch', 'ps2'], { scan: true });
  assert.match(c.ps4[0], /Documents\/stuff\/deeper\/ps4 -g "\{ROM\}"/);
  assert.match(c.switch[0], /(switch emulator|pcsx2\.AppImage) -f -g/);
  assert.strictEqual(c.ps2.length, 0, 'a file named pcsx2 that is really Eden is not offered for PS2');
});

test('nothing installed', () => {
  const H = setup('empty', () => {});
  const c = candidates(H, ['snes', 'ps2', 'switch'], { scan: true });
  assert.deepStrictEqual([c.snes.length, c.ps2.length, c.switch.length], [0, 0, 0]);
});

test('Steam ROM Manager setups are not offered, the emulator is (0.9.3 C6)', () => {
  const H = setup('srm', ({ w }) => {
    w('/Applications/DuckStation-x64.AppImage');
    fs.mkdirSync(path.join(TMP, 'home-srm/.config/steam-rom-manager/userData'), { recursive: true });
    fs.writeFileSync(path.join(TMP, 'home-srm/.config/steam-rom-manager/userData/userConfigurations.json'), JSON.stringify([
      { parserType: 'Glob', configTitle: 'Sony PlayStation - DuckStation', executable: { path: path.join(TMP, 'home-srm/Applications/DuckStation-x64.AppImage') }, executableArgs: '-batch -fullscreen "${filePath}"', romDirectory: '/somewhere/roms/psx' },
      { parserType: 'Epic', configTitle: 'Epic', executable: { path: '/x' } },
    ]));
  });
  const c = candidates(H, ['psx'], { scan: true });
  assert.ok(!c.psx.some((x) => /Steam ROM Manager/.test(x)), c.psx.join('\n'));
  assert.ok(c.psx.some((x) => /DuckStation-x64\.AppImage/.test(x)), c.psx.join('\n'));
});

test('forks are listed by their own name, last, and never picked by default (0.9.3 C3/C4)', () => {
  const H = setup('forks', ({ w }) => {
    w('/Applications/shadPS4-v0.9.0.AppImage');
    w('/Applications/shadPS4-GR2-build.AppImage'); // known fork, by name
    w('/Applications/Dolphin-x86_64.AppImage');
    w('/Applications/MyDolphinBuild.AppImage'); // marked a fork by you
  });
  const c = candidates(H, ['ps4', 'gc'], { forks: { [H + '/Applications/MyDolphinBuild.AppImage']: { of: 'dolphin', name: 'My Build' } } });
  assert.match(c.ps4[0], /^shadPS4 => .*shadPS4-v0\.9\.0\.AppImage/, c.ps4.join('\n'));
  assert.match(c.ps4[c.ps4.length - 1], /^shadPS4 GR2 · fork of shadPS4 => .*GR2-build/, c.ps4.join('\n'));
  assert.match(c.gc[0], /^Dolphin => .*Dolphin-x86_64\.AppImage -b -e/, c.gc.join('\n'));
  assert.match(c.gc[c.gc.length - 1], /^My Build · fork of Dolphin => .*MyDolphinBuild\.AppImage -b -e/, c.gc.join('\n'));
});

test('what is installed is shown by its real name (a Citra install is not "Azahar")', () => {
  const H = setup('realname', ({ w }) => { w('/Applications/citra-qt.AppImage'); w('/Applications/sudachi.AppImage'); });
  const c = candidates(H, ['n3ds', 'switch']);
  assert.match(c.n3ds[0], /^Citra => /, c.n3ds.join('\n'));
  assert.ok(c.switch.some((x) => /^Sudachi => /.test(x)), c.switch.join('\n'));
});

test('RetroDECK only without EmuDeck, first, and not for consoles whose games are folders (0.9.3 C5)', () => {
  const H = setup('retrodeck', ({ flatpaks, w }) => { flatpaks.push('net.retrodeck.retrodeck'); w('/Applications/pcsx2-Qt.AppImage'); });
  const c = candidates(H, ['ps2', 'ps3']);
  assert.match(c.ps2[0], /^RetroDECK => \/usr\/bin\/flatpak run net\.retrodeck\.retrodeck -s ps2 "\{ROM\}"/, c.ps2.join('\n'));
  assert.ok(c.ps2.some((x) => /pcsx2-Qt\.AppImage/.test(x)));
  assert.ok(!c.ps3.some((x) => /RetroDECK/.test(x)));
  const E = setup('retrodeck-emudeck', ({ flatpaks, w }) => { flatpaks.push('net.retrodeck.retrodeck'); w('/Emulation/tools/launchers/pcsx2-qt.sh'); });
  assert.ok(!candidates(E, ['ps2']).ps2.some((x) => /RetroDECK/.test(x)));
});

test('0.9.3 B emulators: the exact launch line of each (read from their own source)', () => {
  const H = setup('more', ({ w, flatpaks }) => {
    for (const b of ['desmume', 'mupen64plus', 'snes9x-gtk', 'kronos']) w('/bin/' + b);
    w('/Applications/Mesen.AppImage');
    w('/Applications/Play!-abc123-x86_64.AppImage');
    w('/Applications/xenia_edge_linux.AppImage');
    w('/Applications/xenia_canary/xenia_canary.exe');
    flatpaks.push('io.github.shiiion.primehack');
  });
  const c = candidates(H, ['nds', 'n64', 'snes', 'nes', 'ps2', 'saturn', 'gc', 'xbox360']);
  const line = (k, re) => assert.ok(c[k].some((x) => re.test(x)), k + ':\n' + c[k].join('\n'));
  line('nds', /^DeSmuME => ~\/bin\/desmume "\{ROM\}"$/);
  line('n64', /^Mupen64Plus => ~\/bin\/mupen64plus --fullscreen "\{ROM\}"$/);
  line('snes', /^Snes9x => ~\/bin\/snes9x-gtk "\{ROM\}"$/);
  line('snes', /^Mesen => ~\/Applications\/Mesen\.AppImage --fullscreen "\{ROM\}"$/);
  line('nes', /^Mesen => .*Mesen\.AppImage --fullscreen "\{ROM\}"$/);
  line('ps2', /^Play! => ~\/Applications\/Play!-abc123-x86_64\.AppImage --fullscreen --disc "\{ROM\}"$/);
  line('saturn', /^Kronos => ~\/bin\/kronos -a -f -i "\{ROM\}"$/);
  line('xbox360', /^Xenia Edge => ~\/Applications\/xenia_edge_linux\.AppImage --fullscreen=true "\{ROM\}"$/);
  // 0.9.3 K (K1): Xenia Canary's Windows build, through Proton
  line('xbox360', /^Xenia \(Windows\) => ~\/Applications\/xenia_canary\/xenia_canary\.exe --fullscreen=true "Z:\{ROM\}"$/);
  // PrimeHack is a Dolphin fork: listed as one, last, never the default
  assert.match(c.gc[c.gc.length - 1], /^PrimeHack · fork of Dolphin => \/usr\/bin\/flatpak run io\.github\.shiiion\.primehack -b -e "\{ROM\}"$/, c.gc.join('\n'));
});

test('arguments by version, and what EmuDeck puts first', () => {
  const E = require(path.join(ROOT, 'electron/emulators.js'));
  assert.strictEqual(E.argsFor('pcsx2', 'ps2', 'appimage', '1.6.0'), '--nogui --fullscreen "{ROM}"');
  assert.strictEqual(E.argsFor('pcsx2', 'ps2', 'appimage', '2.2.0'), '-batch -fullscreen -nogui "{ROM}"');
  assert.strictEqual(E.argsFor('pcsx2', 'ps2', 'appimage'), '-batch -fullscreen -nogui "{ROM}"'); // version unknown: today's flags
  assert.deepStrictEqual(E.EMU.eden.pre, ['vblank_mode=0']);
});

test('emulator for one game beats the console pick; a pick that is gone falls back', () => {
  const H = setup('pergame', ({ w, flatpaks }) => {
    w('/Applications/pcsx2-v2.2.0-linux-appimage-x64-Qt.AppImage');
    flatpaks.push('net.pcsx2.PCSX2');
  });
  const code = (gameEmus) => `
    const m = require(${JSON.stringify(path.join(ROOT, 'electron/steamManager.js'))});
    const cfg = { steam: { emus: { ps2: 'pcsx2@flatpak' }, gameEmus: ${JSON.stringify(gameEmus)} } };
    const sm = m({ USER_DATA: ${JSON.stringify(H + '/.config/Cartridge')}, log() {}, PLATFORM_MAP: require(${JSON.stringify(path.join(ROOT, 'electron/platformMap'))}), getConfig: () => cfg, saveConfig() {}, broadcast() {},
      emulationRoots: () => [], getLibrary: () => null, installed: () => ({}), romById: () => null, isGamescope: () => false, artFor: () => ({}), MARKED: 'm', markedPath: () => null });
    console.log(JSON.stringify([sm._templateFor('ps2').emu, sm._templateForGame(5, 'ps2').emu, sm._templateForGame(6, 'ps2').emu]));`;
  const run = (g) => JSON.parse(execFileSync(process.execPath, ['-e', code(g)], { env: { ...process.env, HOME: H, SHELL: '/bin/false', PATH: `${H}/bin:/usr/bin:/bin` }, encoding: 'utf8' }).trim().split('\n').pop());
  assert.deepStrictEqual(run({ 5: 'pcsx2' }), ['pcsx2@flatpak', 'pcsx2', 'pcsx2@flatpak']);
  assert.deepStrictEqual(run({ 5: 'gone-emulator' }), ['pcsx2@flatpak', 'pcsx2@flatpak', 'pcsx2@flatpak']);
});

// 0.9.3 L: EmuDeck's vita3k.sh always adds "-Fr", so it gets the title ID alone; installs use Vita3K itself
test('Vita3K through EmuDeck: title ID only; installs never go through the script', () => {
  const E = require(path.join(ROOT, 'electron/emulators.js'));
  assert.strictEqual(E.argsFor('vita3k', 'psvita', 'emudeck'), '{SERIAL}');
  assert.strictEqual(E.argsFor('vita3k', 'psvita', 'appimage'), '-F -r {SERIAL}');
  const H = setup('vita-emudeck', ({ w }) => { w('/Emulation/tools/launchers/vita3k.sh'); w('/Applications/Vita3K/Vita3K'); });
  const code = `
    const sm = require(${JSON.stringify(path.join(ROOT, 'electron/steamManager.js'))})({ USER_DATA: ${JSON.stringify(H + '/cfg')}, log() {}, PLATFORM_MAP: {}, getConfig: () => ({}), saveConfig() {}, broadcast() {},
      emulationRoots: () => [${JSON.stringify(H + '/Emulation')}], getLibrary: () => null, installed: () => ({}), romById: () => null, isGamescope: () => false, artFor: () => ({}), MARKED: 'm', markedPath: () => null });
    console.log(JSON.stringify(sm.vita3kCommand()));`;
  require('fs').mkdirSync(H + '/cfg', { recursive: true });
  const out = JSON.parse(require('child_process').execFileSync(process.execPath, ['-e', code], { env: { ...process.env, HOME: H }, encoding: 'utf8' }).trim().split('\n').pop());
  assert.strictEqual(out.exe, H + '/Applications/Vita3K/Vita3K');
});

// 0.9.15: shadPS4's Target is the Qt launcher with "-d -g", never a core from the launcher's versions folder
test('shadPS4: the Qt launcher AppImage wins over bare core AppImages', () => {
  const H = setup('shad-launcher', ({ w }) => {
    w('/Documents/Apps/shadPS4QtLauncher-qt.AppImage');
    w('/Applications/Shadps4-sdl.AppImage');
  });
  const c = candidates(H, ['ps4']);
  assert.match(c.ps4[0], /^shadPS4 => ~\/Documents\/Apps\/shadPS4QtLauncher-qt\.AppImage -d -g "\{ROM\}"$/, c.ps4.join('\n'));
});
