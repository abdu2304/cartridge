// Steam shortcuts: the folder shadPS4 starts in (0.9.3 A10, L): the same as its own shortcuts.
// folder in the folder they start in, else ~/.local/share/shadPS4. Each case runs in its own process
// so HOME is read fresh. Run with: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cartridge-steam-'));
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

// the Start in a shadPS4 shortcut gets, for a home built from a list of folders
function startFor(name, dirs) {
  const H = path.join(TMP, name);
  for (const d of ['Documents/Apps', ...dirs]) fs.mkdirSync(path.join(H, d), { recursive: true });
  const code = `
    const sm = require(${JSON.stringify(path.join(ROOT, 'electron/steamManager.js'))})({ USER_DATA: ${JSON.stringify(H + '/cfg')}, log() {}, PLATFORM_MAP: {}, getConfig: () => ({}), saveConfig() {}, broadcast() {},
      emulationRoots: () => [], getLibrary: () => null, installed: () => ({}), romById: () => null, isGamescope: () => false, artFor: () => ({}), MARKED: 'm', markedPath: () => null });
    const apps = ${JSON.stringify(path.join(H, 'Documents/Apps'))};
    console.log(sm._startOf({ exe: apps + '/shadPS4QtLauncher-qt.AppImage', start: apps }).replace(${JSON.stringify(H)}, '~'));`;
  fs.mkdirSync(H + '/cfg', { recursive: true });
  return execFileSync(process.execPath, ['-e', code], { env: { ...process.env, HOME: H, XDG_DATA_HOME: '' }, encoding: 'utf8' }).trim().split('\n').pop();
}

test('like shadPS4\'s own shortcuts: a Start in that never exists (theirs is the gone AppImage mount)', () => {
  assert.strictEqual(startFor('plain', ['.local/share/shadPS4', '.local/share/shadPS4QtLauncher']), '/tmp/.mount_shadPS4/usr/bin');
  assert.strictEqual(startFor('fresh', []), '/tmp/.mount_shadPS4/usr/bin');
  assert.strictEqual(startFor('stray', ['Documents/Apps/user', '.local/share/shadPS4']), '/tmp/.mount_shadPS4/usr/bin');
});
test('a portable install (its user folder is the only shadPS4 data) keeps starting there', () => {
  assert.strictEqual(startFor('portable', ['Documents/Apps/user']), '~/Documents/Apps');
});

// 0.9.3 D: a PS3 game Cartridge installed into RPCS3 starts by its serial, never a path in RPCS3's storage
test('a PS3 game installed in RPCS3 starts by serial; any other emulator keeps the path', () => {
  const H = path.join(TMP, 'ps3');
  fs.mkdirSync(H + '/cfg', { recursive: true });
  const code = `
    const sm = require(${JSON.stringify(path.join(ROOT, 'electron/steamManager.js'))})({ USER_DATA: ${JSON.stringify(H + '/cfg')}, log() {}, PLATFORM_MAP: {}, getConfig: () => ({}), saveConfig() {}, broadcast() {},
      emulationRoots: () => [], getLibrary: () => null, installed: () => ({}), romById: () => null, isGamescope: () => false, artFor: () => ({}), MARKED: 'm', markedPath: () => null,
      installRecord: (id) => (id === 5 ? { emu: 'rpcs3', serial: 'BLUS30001', dir: '/x/dev_hdd0/game/BLUS30001', created: true } : null) });
    const rom = { id: 5, platform_slug: 'ps3', fs_name: 'Game' };
    console.log(JSON.stringify([
      sm._buildLaunch(rom, '/roms/ps3/Game', { exe: '/usr/bin/flatpak', args: 'run net.rpcs3.RPCS3 --no-gui "{ROM}"', kind: 'path' }).args,
      sm._buildLaunch(rom, '/roms/ps3/Game', { exe: '/x/rpcs3.sh', args: '--no-gui "%RPCS3_GAMEID%:{SERIAL}"', kind: 'serial' }).args,
      sm._buildLaunch({ ...rom, id: 6 }, '/roms/ps3/Other.iso', { exe: '/x/rpcs3.sh', args: '--no-gui "{ROM}"', kind: 'path' }).args,
    ]));`;
  const out = JSON.parse(execFileSync(process.execPath, ['-e', code], { env: { ...process.env, HOME: H }, encoding: 'utf8' }).trim().split('\n').pop());
  assert.deepStrictEqual(out, ['run net.rpcs3.RPCS3 --no-gui "%RPCS3_GAMEID%:BLUS30001"', '--no-gui "%RPCS3_GAMEID%:BLUS30001"', '--no-gui "/roms/ps3/Other.iso"']);
});

test('a PS3 game that came as .pkg can only be added to Steam once installed in RPCS3', () => {
  const H = path.join(TMP, 'ps3pkg');
  const dl = path.join(H, 'roms/ps3/Game');
  fs.mkdirSync(dl, { recursive: true }); fs.mkdirSync(H + '/cfg', { recursive: true });
  const b = Buffer.alloc(0x100); b.writeUInt32BE(0x7f504b47, 0); b.writeUInt16BE(1, 6); b.write('UP0001-NPUA80523_00-GAME000000000000', 0x30, 'latin1');
  fs.writeFileSync(path.join(dl, 'Game.pkg'), b);
  const code = `
    const sm = require(${JSON.stringify(path.join(ROOT, 'electron/steamManager.js'))})({ USER_DATA: ${JSON.stringify(H + '/cfg')}, log() {}, PLATFORM_MAP: {}, getConfig: () => ({}), saveConfig() {}, broadcast() {},
      emulationRoots: () => [], getLibrary: () => null, installed: () => ({}), romById: () => null, isGamescope: () => false, artFor: () => ({}), MARKED: 'm', markedPath: () => null, installRecord: () => null });
    const r = sm._buildLaunch({ id: 7, platform_slug: 'ps3', fs_name: 'Game' }, ${JSON.stringify(dl)}, { exe: '/x/rpcs3.sh', args: '--no-gui "{ROM}"', kind: 'path' });
    console.log(JSON.stringify(r.missing || null));`;
  const out = JSON.parse(execFileSync(process.execPath, ['-e', code], { env: { ...process.env, HOME: H }, encoding: 'utf8' }).trim().split('\n').pop());
  assert.match(out, /Install it in RPCS3 first/);
});

// 0.9.16: a Vita game installed in Vita3K before Cartridge (no title ID in its name or files) is
// found by the title in its param.sfo, in any of Vita3K's folders (here EmuDeck's storage)
test('a Vita game already in Vita3K starts by its title ID, matched by name', () => {
  const H = path.join(TMP, 'vita');
  const app = path.join(H, 'Emulation/storage/Vita3K/ux0/app/PCSB00245/sce_sys');
  fs.mkdirSync(app, { recursive: true }); fs.mkdirSync(H + '/cfg', { recursive: true }); fs.mkdirSync(H + '/roms/psvita/Persona', { recursive: true });
  // a minimal param.sfo: one TITLE entry
  const key = Buffer.from('TITLE\0'), val = Buffer.from('Persona 4 Golden\0');
  const hdr = Buffer.alloc(0x14 + 0x10); hdr.write('\0PSF', 0, 'latin1'); hdr.writeUInt32LE(0x101, 4);
  hdr.writeUInt32LE(0x14 + 0x10, 8); hdr.writeUInt32LE(0x14 + 0x10 + 8, 12); hdr.writeUInt32LE(1, 16);
  hdr.writeUInt16LE(0, 0x14); hdr.writeUInt16LE(0x0204, 0x16); hdr.writeUInt32LE(val.length, 0x18); hdr.writeUInt32LE(val.length, 0x1c); hdr.writeUInt32LE(0, 0x20);
  fs.writeFileSync(path.join(app, 'param.sfo'), Buffer.concat([hdr, key, Buffer.alloc(8 - key.length), val]));
  const code = `
    const sm = require(${JSON.stringify(path.join(ROOT, 'electron/steamManager.js'))})({ USER_DATA: ${JSON.stringify(H + '/cfg')}, log() {}, PLATFORM_MAP: {}, getConfig: () => ({}), saveConfig() {}, broadcast() {},
      emulationRoots: () => [${JSON.stringify(path.join(H, 'Emulation'))}], getLibrary: () => null, installed: () => ({}), romById: () => null, isGamescope: () => false, artFor: () => ({}), MARKED: 'm', markedPath: () => null, installRecord: () => null });
    const t = { exe: '/x/Vita3K', args: '-F -r {SERIAL}', kind: 'vitaid' };
    console.log(JSON.stringify([sm._buildLaunch({ id: 9, name: 'Persona 4 Golden', fs_name: 'Persona' }, ${JSON.stringify(H + '/roms/psvita/Persona')}, t).args, sm._buildLaunch({ id: 10, name: 'Gravity Rush', fs_name: 'GR' }, ${JSON.stringify(H + '/roms/psvita/Persona')}, t).missing || null]));`;
  const out = JSON.parse(execFileSync(process.execPath, ['-e', code], { env: { ...process.env, HOME: H, XDG_DATA_HOME: '' }, encoding: 'utf8' }).trim().split('\n').pop());
  assert.strictEqual(out[0], '-F -r PCSB00245');
  assert.match(out[1], /Install this game/);
});

// 0.9.3 K (K2): Flatpak Steam starts emulators outside its sandbox through flatpak-spawn --host
test('Flatpak Steam: shortcuts go through flatpak-spawn --host with folder, env and wrappers', () => {
  const H = path.join(TMP, 'fpsteam');
  const ud = path.join(H, '.var/app/com.valvesoftware.Steam/data/Steam/userdata/123/config');
  fs.mkdirSync(ud, { recursive: true }); fs.mkdirSync(H + '/cfg', { recursive: true });
  const code = `
    const sm = require(${JSON.stringify(path.join(ROOT, 'electron/steamManager.js'))})({ USER_DATA: ${JSON.stringify(H + '/cfg')}, log() {}, PLATFORM_MAP: {}, getConfig: () => ({}), saveConfig() {}, broadcast() {},
      emulationRoots: () => [], getLibrary: () => null, installed: () => ({}), romById: () => null, isGamescope: () => false, artFor: () => ({}), MARKED: 'm', markedPath: () => null });
    console.log(JSON.stringify([sm._hostLaunch('/home/u/Apps/Cemu.AppImage', '-f -g "/roms/wiiu/Game.rpx"', '/home/u/Apps', ['vblank_mode=0', 'gamemoderun', '%command%']), sm.flatpakSteamAccess()]));`;
  const out = JSON.parse(execFileSync(process.execPath, ['-e', code], { env: { ...process.env, HOME: H }, encoding: 'utf8' }).trim().split('\n').pop());
  assert.deepStrictEqual(out[0], { target: '"/usr/bin/flatpak-spawn"', launch: '--host --directory="/home/u/Apps" --env=vblank_mode=0 gamemoderun "/home/u/Apps/Cemu.AppImage" -f -g "/roms/wiiu/Game.rpx"' });
  assert.strictEqual(out[1], 'needed');
});

test('Flatpak Steam: a flatpak-spawn shortcut reads back as the emulator, its folder and options', () => {
  const H = path.join(TMP, 'fpread');
  const cfg = path.join(H, '.var/app/com.valvesoftware.Steam/data/Steam/userdata/123/config');
  fs.mkdirSync(cfg, { recursive: true }); fs.mkdirSync(H + '/cfg', { recursive: true });
  const { writeVdf } = require('../electron/steamArt.js');
  fs.writeFileSync(path.join(cfg, 'shortcuts.vdf'), writeVdf({ shortcuts: { 0: { appid: 1, AppName: 'Game', Exe: '"/usr/bin/flatpak-spawn"', StartDir: '"/home/u"', LaunchOptions: '--host --directory="/home/u/Apps" --env=vblank_mode=0 gamemoderun "/home/u/Apps/Cemu.AppImage" -f -g "/roms/wiiu/Game.rpx"' } } }));
  const code = `
    const sm = require(${JSON.stringify(path.join(ROOT, 'electron/steamManager.js'))})({ USER_DATA: ${JSON.stringify(H + '/cfg')}, log() {}, PLATFORM_MAP: {}, getConfig: () => ({}), saveConfig() {}, broadcast() {},
      emulationRoots: () => [], getLibrary: () => null, installed: () => ({}), romById: () => null, isGamescope: () => false, artFor: () => ({}), MARKED: 'm', markedPath: () => null });
    const sc = sm._readShortcuts();
    console.log(JSON.stringify(sc.map((x) => [x.exe, x.start, x.lo, x.host])));`;
  const out = JSON.parse(execFileSync(process.execPath, ['-e', code], { env: { ...process.env, HOME: H }, encoding: 'utf8' }).trim().split('\n').pop());
  assert.deepStrictEqual(out, [['/home/u/Apps/Cemu.AppImage', '/home/u/Apps', 'vblank_mode=0 gamemoderun %command% -f -g "/roms/wiiu/Game.rpx"', true]]);
});

// J13: Shortcut health finds a shortcut whose emulator moved and offers the copy that is there now
test('Shortcut health: emulator moved, and the fix points at the one installed now', () => {
  // its own temp folder: a path with "cartridge" in it reads as Cartridge's own shortcut
  const H = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-health-'));
  test.after(() => fs.rmSync(H, { recursive: true, force: true }));
  const cfg = path.join(H, '.local/share/Steam/userdata/123/config');
  for (const d of [cfg, H + '/cfg', H + '/Applications', H + '/roms/ps2']) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(H, 'Applications/pcsx2-v2.2.0-linux-appimage-x64-Qt.AppImage'), '');
  fs.writeFileSync(path.join(H, 'roms/ps2/Game.iso'), '');
  const { writeVdf } = require('../electron/steamArt.js');
  fs.writeFileSync(path.join(cfg, 'shortcuts.vdf'), writeVdf({ shortcuts: { 0: { appid: 7, AppName: 'Game', Exe: `"${H}/Old/pcsx2-v1.7.0.AppImage"`, StartDir: `"${H}/Old"`, LaunchOptions: `-batch -fullscreen "${H}/roms/ps2/Game.iso"` } } }));
  const code = `
    const sm = require(${JSON.stringify(path.join(ROOT, 'electron/steamManager.js'))})({ USER_DATA: ${JSON.stringify(H + '/cfg')}, log() {}, PLATFORM_MAP: { ps2: ['ps2'] }, getConfig: () => ({}), saveConfig() {}, broadcast() {},
      emulationRoots: () => [], getLibrary: () => null, installed: () => ({}), romById: () => null, isGamescope: () => false, artFor: () => ({}), MARKED: 'm', markedPath: () => null });
    const h = sm.health();
    console.log(JSON.stringify(h.problems.map((p) => [p.name, p.issues.map((i) => [i.kind, i.fix && i.fix.to])])));`;
  const out = JSON.parse(execFileSync(process.execPath, ['-e', code], { env: { ...process.env, HOME: H, XDG_DATA_HOME: '' }, encoding: 'utf8' }).trim().split('\n').pop());
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0][1][0][0], 'emulator');
  assert.match(out[0][1][0][1] || '', /pcsx2-v2\.2\.0/);
});

// 0.9.17: frame generation goes first in Launch options, after environment variables, before the one %command%
test('frame generation: lsfg-vk or MAKO per game, console or all, placed before %command%', () => {
  const H = path.join(TMP, 'fg');
  fs.mkdirSync(H + '/cfg', { recursive: true }); fs.mkdirSync(H + '/.local/bin', { recursive: true });
  fs.writeFileSync(H + '/lsfg', '#!/bin/sh\nexec "$@"\n', { mode: 0o755 });
  fs.writeFileSync(H + '/.local/bin/mako-run', '#!/bin/sh\nexec "$@"\n', { mode: 0o755 });
  const conf = { steam: { frameGen: { default: 'lsfg', consoles: { gc: 'mako' }, games: { 7: 'off' } } } };
  const code = `
    const sm = require(${JSON.stringify(path.join(ROOT, 'electron/steamManager.js'))})({ USER_DATA: ${JSON.stringify(H + '/cfg')}, log() {}, PLATFORM_MAP: {}, getConfig: () => (${JSON.stringify(conf)}), saveConfig() {}, broadcast() {},
      emulationRoots: () => [], getLibrary: () => null, installed: () => ({}), romById: () => null, isGamescope: () => false, artFor: () => ({}), MARKED: 'm', markedPath: () => null });
    const dol = { exe: '/apps/Dolphin.AppImage', pre: ['vblank_mode=0'], command: true, args: '-b -e "{ROM}"' };
    const pcsx = { exe: '/apps/pcsx2.AppImage', pre: [], command: true, args: '-fullscreen "{ROM}"' };
    const go = (t, romId, key) => { const w = sm._withFg(t, romId, key); return sm._launchFor(w, [...w.pre, '%command%', 'X'].join(' '), 'X').launch; };
    console.log(JSON.stringify([go(dol, 1, 'gc'), go(pcsx, 2, 'ps2'), go(pcsx, 7, 'ps2')]));`;
  const out = JSON.parse(execFileSync(process.execPath, ['-e', code], { env: { ...process.env, HOME: H }, encoding: 'utf8' }).trim().split('\n').pop());
  assert.deepStrictEqual(out, [`vblank_mode=0 "${H}/.local/bin/mako-run" %command% X`, `"${H}/lsfg" %command% X`, 'X']);
});

test('shadPS4 version per game: the Qt launcher gets -e <version> instead of -d', () => {
  const H = path.join(TMP, 'shadver');
  const ver = path.join(H, '.local/share/shadPS4QtLauncher/versions/v0.17/Shadps4-sdl.AppImage');
  fs.mkdirSync(path.dirname(ver), { recursive: true }); fs.writeFileSync(ver, ''); fs.mkdirSync(H + '/cfg', { recursive: true });
  fs.writeFileSync(path.join(H, '.local/share/shadPS4QtLauncher/versions.json'), JSON.stringify([{ name: 'v0.17.0', path: ver, codename: 'x', type: 0 }, { name: 'gone', path: '/nope' }]));
  const conf = { steam: { shadVersions: { 5: ver } } };
  const code = `
    const sm = require(${JSON.stringify(path.join(ROOT, 'electron/steamManager.js'))})({ USER_DATA: ${JSON.stringify(H + '/cfg')}, log() {}, PLATFORM_MAP: {}, getConfig: () => (${JSON.stringify(conf)}), saveConfig() {}, broadcast() {},
      emulationRoots: () => [], getLibrary: () => null, installed: () => ({}), romById: () => null, isGamescope: () => false, artFor: () => ({}), MARKED: 'm', markedPath: () => null });
    const t = { exe: '/apps/shadPS4QtLauncher-qt.AppImage', pre: [], command: true, args: '-d -g "{ROM}"' };
    console.log(JSON.stringify([sm.shadVersions().map((v) => v.name), sm._withShadVersion(t, 5, 'ps4').args, sm._withShadVersion(t, 6, 'ps4').args]));`;
  const out = JSON.parse(execFileSync(process.execPath, ['-e', code], { env: { ...process.env, HOME: H, XDG_DATA_HOME: '' }, encoding: 'utf8' }).trim().split('\n').pop());
  assert.deepStrictEqual(out, [['v0.17.0'], `-e "${ver}" -g "{ROM}"`, '-d -g "{ROM}"']);
});

test('multi-disc games get a playlist in their folder, in disc order', () => {
  const H = path.join(TMP, 'md');
  const g = path.join(H, 'roms/psx/Final Fantasy VII');
  fs.mkdirSync(g, { recursive: true }); fs.mkdirSync(H + '/cfg', { recursive: true });
  for (const n of ['Final Fantasy VII (Disc 2).cue', 'Final Fantasy VII (Disc 2).bin', 'Final Fantasy VII (Disc 1).cue', 'Final Fantasy VII (Disc 1).bin', 'Final Fantasy VII (Disc 3).cue']) fs.writeFileSync(path.join(g, n), '');
  const one = path.join(H, 'roms/psx/Single'); fs.mkdirSync(one, { recursive: true }); fs.writeFileSync(path.join(one, 'Single.cue'), '');
  const code = `
    const sm = require(${JSON.stringify(path.join(ROOT, 'electron/steamManager.js'))})({ USER_DATA: ${JSON.stringify(H + '/cfg')}, log() {}, PLATFORM_MAP: {}, getConfig: () => ({}), saveConfig() {}, broadcast() {},
      emulationRoots: () => [], getLibrary: () => null, installed: () => ({}), romById: () => null, isGamescope: () => false, artFor: () => ({}), MARKED: 'm', markedPath: () => null });
    console.log(JSON.stringify([sm._multiDisc(${JSON.stringify(g)}, 'psx'), sm._multiDisc(${JSON.stringify(one)}, 'psx')]));`;
  const out = JSON.parse(execFileSync(process.execPath, ['-e', code], { env: { ...process.env, HOME: H }, encoding: 'utf8' }).trim().split('\n').pop());
  assert.strictEqual(out[0], path.join(g, 'Final Fantasy VII.m3u'));
  assert.strictEqual(fs.readFileSync(out[0], 'utf8'), 'Final Fantasy VII (Disc 1).cue\nFinal Fantasy VII (Disc 2).cue\nFinal Fantasy VII (Disc 3).cue\n');
  assert.strictEqual(out[1], null);
});

// 0.9.32 (owner: Vita3K deleted twice, still "already on this device"): EmuDeck's launcher stays after the
// program is gone, so it only counts while what it starts is there
test('an EmuDeck launcher counts only while its emulator is there', () => {
  const H = path.join(TMP, 'vita-gone');
  fs.mkdirSync(H + '/cfg', { recursive: true });
  fs.mkdirSync(H + '/Emulation/tools/launchers', { recursive: true });
  fs.mkdirSync(H + '/Applications/Vita3K', { recursive: true });
  fs.writeFileSync(H + '/Emulation/tools/launchers/vita3k.sh', '#!/bin/bash\nemuName="Vita3K"\nemufolder="$HOME/Applications/Vita3K"\n"${emufolder}/${emuName}" -Fr "$@"\n');
  fs.writeFileSync(H + '/Applications/Vita3K/Vita3K', '#!/bin/sh\n'); fs.chmodSync(H + '/Applications/Vita3K/Vita3K', 0o755);
  const run = () => execFileSync(process.execPath, ['-e', `
    const sm = require(${JSON.stringify(path.join(ROOT, 'electron/steamManager.js'))})({ USER_DATA: ${JSON.stringify(H + '/cfg')}, log() {}, PLATFORM_MAP: {}, getConfig: () => ({}), saveConfig() {}, broadcast() {},
      emulationRoots: () => [${JSON.stringify(H + '/Emulation')}], getLibrary: () => null, installed: () => ({}), romById: () => null, isGamescope: () => false, artFor: () => ({}), MARKED: 'm', markedPath: () => null });
    console.log(JSON.stringify((sm.candidatesFor('psvita') || []).map((c) => /vita3k\.sh/.test(c.sub) ? 'emudeck' : c.sub)));`], { env: { ...process.env, HOME: H, XDG_DATA_HOME: '', PATH: '/usr/bin:/bin' }, encoding: 'utf8' }).trim().split('\n').pop();
  assert.ok(JSON.parse(run()).includes('emudeck'));
  fs.rmSync(H + '/Applications/Vita3K', { recursive: true, force: true }); // what Cartridge's Delete does
  assert.ok(!JSON.parse(run()).includes('emudeck'));
});

// 0.9.32 (owner: a collection deleted in Steam still showed): Steam's local changes file wins over the main one
test('collections deleted or renamed in Steam\'s .modified.json are read that way', () => {
  const H = path.join(TMP, 'cols');
  const S = H + '/.local/share/Steam', C = S + '/userdata/42/config/cloudstorage';
  fs.mkdirSync(C, { recursive: true }); fs.mkdirSync(S + '/config', { recursive: true }); fs.mkdirSync(H + '/cfg', { recursive: true });
  fs.writeFileSync(S + '/config/loginusers.vdf', '"users"\n{\n\t"76561197960265770"\n\t{\n\t\t"MostRecent"\t\t"1"\n\t}\n}\n');
  const row = (id, name, more = {}) => [`user-collections.${id}`, { key: `user-collections.${id}`, value: JSON.stringify({ id, name, added: [1, 2] }), ...more }];
  fs.writeFileSync(C + '/cloud-storage-namespace-1.json', JSON.stringify([row('a', 'PS3 Games'), row('b', 'Old Stuff'), row('c', 'Favs')]));
  fs.writeFileSync(C + '/cloud-storage-namespace-1.modified.json', JSON.stringify([[`user-collections.b`, { key: 'user-collections.b', is_deleted: true }], row('c', 'Favourites')]));
  const code = `
    const sm = require(${JSON.stringify(path.join(ROOT, 'electron/steamManager.js'))})({ USER_DATA: ${JSON.stringify(H + '/cfg')}, log() {}, PLATFORM_MAP: {}, getConfig: () => ({}), saveConfig() {}, broadcast() {},
      emulationRoots: () => [], getLibrary: () => null, installed: () => ({}), romById: () => null, isGamescope: () => false, artFor: () => ({}), MARKED: 'm', markedPath: () => null });
    console.log(JSON.stringify(sm.collections().map((c) => c.name)));`;
  const out = execFileSync(process.execPath, ['-e', code], { env: { ...process.env, HOME: H, XDG_DATA_HOME: '' }, encoding: 'utf8' }).trim().split('\n').pop();
  assert.deepStrictEqual(JSON.parse(out), ['Favourites', 'PS3 Games']);
});

// 0.9.34 (owner: an old PS3 collection deleted, Cartridge's "Sony PlayStation 3" made, the games already in Steam
// had to be added by hand): a console collection is compared with what Steam holds, for every game of the console
// in Steam (shortcuts you made too), never with what Cartridge remembers adding
test('console collections: games already in Steam count, Cartridge\'s memory of a deleted collection doesn\'t', () => {
  const H = path.join(TMP, 'concol');
  const S = H + '/.local/share/Steam', C = S + '/userdata/42/config';
  fs.mkdirSync(C + '/cloudstorage', { recursive: true }); fs.mkdirSync(S + '/config', { recursive: true }); fs.mkdirSync(H + '/cfg', { recursive: true }); fs.mkdirSync(H + '/roms/ps3', { recursive: true });
  fs.writeFileSync(S + '/config/loginusers.vdf', '"users"\n{\n\t"76561197960265770"\n\t{\n\t\t"MostRecent"\t\t"1"\n\t}\n}\n');
  for (const n of ['A Game', 'B Game', 'C Game']) fs.mkdirSync(`${H}/roms/ps3/${n}`, { recursive: true });
  const A = require(path.join(ROOT, 'electron/steamArt.js'));
  fs.writeFileSync(C + '/shortcuts.vdf', A.writeVdf({ shortcuts: {
    0: { appid: 101, AppName: 'A Game', Exe: '"/bin/rpcs3"', StartDir: '"/bin"', LaunchOptions: `--no-gui "${H}/roms/ps3/A Game"` },
    1: { appid: 102, AppName: 'B Game', Exe: '"/bin/rpcs3"', StartDir: '"/bin"', LaunchOptions: `--no-gui "${H}/roms/ps3/B Game"` },
    2: { appid: 103, AppName: 'C Game', Exe: '"/bin/rpcs3"', StartDir: '"/bin"', LaunchOptions: `--no-gui "${H}/roms/ps3/C Game"` },
  } }));
  const row = (id, name, added) => [`user-collections.${id}`, { key: `user-collections.${id}`, value: JSON.stringify({ id, name, added }) }];
  fs.writeFileSync(C + '/cloudstorage/cloud-storage-namespace-1.json', JSON.stringify([row('a', 'Sony PlayStation 3', [101])]));
  // Cartridge added C Game and remembers putting it in the old "PlayStation 3" collection, which is gone
  fs.writeFileSync(H + '/cfg/steam-games.json', JSON.stringify({ 103: { romId: 3, name: 'C Game', console: 'ps3', collections: ['PlayStation 3', 'Sony PlayStation 3'], account: '42' } }));
  const code = `
    const lib = { platforms: [{ id: 1, slug: 'ps3', fs_slug: 'ps3', name: 'PlayStation 3', display_name: 'PlayStation 3' }], roms: { 1: [1, 2, 3].map((i) => ({ id: i, name: ['A', 'B', 'C'][i - 1] + ' Game', fs_name: ['A', 'B', 'C'][i - 1] + ' Game', platform_id: 1, platform_slug: 'ps3' })) } };
    const inst = { 1: ${JSON.stringify(H + '/roms/ps3/A Game')}, 2: ${JSON.stringify(H + '/roms/ps3/B Game')}, 3: ${JSON.stringify(H + '/roms/ps3/C Game')} };
    // you once kept the old "PlayStation 3" for PS3, then deleted it in Steam
    const conf = { steam: { collectionNames: { ps3: 'PlayStation 3' } } };
    const sm = require(${JSON.stringify(path.join(ROOT, 'electron/steamManager.js'))})({ USER_DATA: ${JSON.stringify(H + '/cfg')}, log() {}, PLATFORM_MAP: {}, getConfig: () => conf, saveConfig() {}, broadcast() {},
      emulationRoots: () => [], getLibrary: () => lib, installed: () => inst, romById: () => null, isGamescope: () => false, artFor: () => ({}), MARKED: 'm', markedPath: () => null });
    (async () => {
      const c = await sm.consoleCollection('ps3');
      const r = await sm.fillCollections({ auto: true });
      const verify = await sm.verifyCollections();
      conf.steam.consoleCollections = true;
      const verifyOn = (await sm.verifyCollections()).map((m) => m.appid + ':' + m.collection).sort();
      console.log(JSON.stringify({ name: c.name, games: c.games.map((g) => g.appid + ':' + g.in), r, verify, verifyOn, kept: conf.steam.collectionNames }));
    })();`;
  const out = JSON.parse(execFileSync(process.execPath, ['-e', code], { env: { ...process.env, HOME: H, XDG_DATA_HOME: '', CARTRIDGE_CEF_PORT: '' }, encoding: 'utf8' }).trim().split('\n').pop());
  assert.strictEqual(out.name, 'Sony PlayStation 3');
  assert.deepStrictEqual(out.games, ['102:false', '103:false', '101:true']);
  assert.deepStrictEqual(out.r, { count: 0, waiting: 2 }); // Steam's interface isn't reachable here: by itself it waits, never restarts Steam
  assert.deepStrictEqual(out.kept, {}); // the deleted collection you'd kept is forgotten, so it's never made again
  assert.deepStrictEqual(out.verify, []); // and isn't reported as dropped by Steam (0.9.36: nothing from Cartridge's memory)
  // with console collections on, the Issues check names what's really missing from the console's collection
  assert.deepStrictEqual(out.verifyOn, ['102:Sony PlayStation 3', '103:Sony PlayStation 3']);
});

test('shadPS4 launcher default version is set only when none is, keeping the rest of qt_ui.ini', () => {
  const SV = require(path.join(ROOT, 'electron/shadVersions.js'));
  const H = path.join(TMP, 'sv'), d = path.join(H, '.local/share/shadPS4QtLauncher');
  const save = process.env.XDG_DATA_HOME; delete process.env.XDG_DATA_HOME;
  try {
    assert.strictEqual(SV.setDefaultIfNone('/v/a/Shadps4-sdl.AppImage', H), true);
    assert.strictEqual(SV.settings(H).selected, '/v/a/Shadps4-sdl.AppImage');
    assert.strictEqual(SV.setDefaultIfNone('/v/b/Shadps4-sdl.AppImage', H), false);
    fs.writeFileSync(path.join(d, 'qt_ui.ini'), '[General]\ntheme=1\n\n[version_manager]\nversionPath=/vp\n');
    SV.setDefaultIfNone('/vp/x/Shadps4-sdl.AppImage', H);
    const ini = fs.readFileSync(path.join(d, 'qt_ui.ini'), 'utf8');
    assert.match(ini, /theme=1/); assert.strictEqual(SV.settings(H).versionPath, '/vp'); assert.strictEqual(SV.settings(H).selected, '/vp/x/Shadps4-sdl.AppImage');
  } finally { if (save !== undefined) process.env.XDG_DATA_HOME = save; }
});

// 0.9.58 (owner: Vita3K's sheet wouldn't open in Emulators, only "already on this device"): EmuDeck keeps Vita3K's
// AppImage as ~/Applications/Vita3K/Vita3K, no extension, in its own folder; it is listed as an installed AppImage
test('EmuDeck\'s Vita3K (an AppImage named Vita3K in its own folder) is an installed emulator', () => {
  const H = path.join(TMP, 'vita');
  fs.mkdirSync(H + '/cfg', { recursive: true });
  const f = path.join(H, 'Applications/Vita3K/Vita3K');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const h = Buffer.alloc(4096); h.writeUInt32BE(0x7f454c46, 0); h[4] = 2; h[5] = 1; h[6] = 1; h.write('AI', 8, 'latin1'); h[10] = 2;
  fs.writeFileSync(f, h); fs.chmodSync(f, 0o755);
  const code = `
    const sm = require(${JSON.stringify(path.join(ROOT, 'electron/steamManager.js'))})({ USER_DATA: ${JSON.stringify(H + '/cfg')}, log() {}, PLATFORM_MAP: {}, getConfig: () => ({}), saveConfig() {}, broadcast() {},
      emulationRoots: () => [], getLibrary: () => null, installed: () => ({}), romById: () => null, isGamescope: () => false, artFor: () => ({}), MARKED: 'm', markedPath: () => null });
    console.log(JSON.stringify(sm.installedEmulators().filter((e) => e.id === 'vita3k').map((e) => [e.kind, e.path.replace(${JSON.stringify(H)}, '~')])));`;
  const out = execFileSync(process.execPath, ['-e', code], { env: { ...process.env, HOME: H, XDG_DATA_HOME: '' }, encoding: 'utf8' }).trim().split('\n').pop();
  assert.deepStrictEqual(JSON.parse(out), [['appimage', '~/Applications/Vita3K/Vita3K']]);
});
