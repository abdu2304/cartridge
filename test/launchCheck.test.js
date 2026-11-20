// Launch Check (0.9.92): facts about a game or a port -> what the screen shows, worst first, each with its one fix
const test = require('node:test');
const assert = require('node:assert');
const L = require('../electron/launchCheck');

const fine = { name: 'Okami', console: 'PS2', home: '/home/p', file: '/home/p/Emulation/roms/ps2/Okami.chd', fileThere: true, emu: { label: 'PCSX2' },
  pre: [{ level: 'ok', text: 'PS2 BIOS found.', bios: true }], start: { ok: true }, missing: null, steam: { there: true, inSteam: true, ours: true } };
const ids = (r, level) => r.items.filter((x) => x.level === level).map((x) => x.id);

test('a game with nothing wrong passes, every check listed as fine', () => {
  const r = L.game(fine);
  assert.deepStrictEqual([r.ok, r.bad, r.warn], [true, 0, 0]);
  assert.deepStrictEqual(ids(r, 'ok'), ['files', 'bios', 'emu', 'steam']);
});
test('files gone, no emulator, not in Steam: each a problem with its own fix, worst first', () => {
  const r = L.game({ ...fine, fileThere: false, emu: null, pre: [], steam: { there: true, inSteam: false } });
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.items.map((x) => [x.id, x.level, x.fix?.id]), [['files', 'bad', 'redownload'], ['emu', 'bad', 'emu-page'], ['steam', 'bad', 'steam-add']]);
  assert.match(r.items[0].text, /~\/Emulation\/roms\/ps2\/Okami\.chd/); // the home folder is never spelled out
});
test('a Flatpak emulator without access to the games folder: Allow Access with what it needs', () => {
  const r = L.game({ ...fine, pre: [{ level: 'bad', text: 'This Flatpak emulator has no access to your games folder, so games won’t open.', allow: { id: 'net.pcsx2.PCSX2', dir: '/run/media/sd/roms/ps2' } }] });
  assert.deepStrictEqual(r.items[0].fix, { id: 'flatpak-allow', label: 'Allow Access', app: 'net.pcsx2.PCSX2', dir: '/run/media/sd/roms/ps2' });
  assert.ok(!r.items.some((x) => x.id === 'emu' && x.level === 'ok'));
});
test('an emulator that can\'t start, a file not allowed to run, a missing required BIOS', () => {
  const r = L.game({ ...fine, start: { ok: false, reason: 'it needs glibc 2.43' }, pre: [{ level: 'bad', text: 'x isn’t allowed to run.', copy: 'chmod +x "/a/x"' }, { level: 'warn', text: 'PS2 BIOS not found.', bios: true }, { level: 'tip', text: 'optional', bios: true }] });
  assert.deepStrictEqual(r.items.map((x) => [x.id, x.level, x.fix?.id]), [['emu', 'bad', 'copy'], ['emu-start', 'bad', 'emu-page'], ['bios', 'warn', 'bios'], ['files', 'ok', undefined], ['steam', 'ok', undefined]]);
  assert.match(r.items[1].text, /PCSX2 can’t start on this device: it needs glibc 2\.43\./);
});
test('a PS3 package not installed yet, a shortcut waiting, an outdated one, one pointing at a gone emulator', () => {
  assert.deepStrictEqual(L.game({ ...fine, missing: 'Install it in RPCS3 first.', pkg: 'RPCS3' }).items[0], { id: 'install', level: 'bad', text: 'Install it in RPCS3 first.', fix: { id: 'pkg-install', label: 'Install It in RPCS3' } });
  assert.strictEqual(L.game({ ...fine, steam: { there: true, inSteam: false, queued: 'add' } }).items[0].fix.id, 'steam-apply');
  const old = L.game({ ...fine, steam: { there: true, inSteam: true, ours: true, outdated: true } });
  assert.deepStrictEqual([old.ok, old.warn, old.items[0].fix.id], [true, 1, 'steam-refresh']);
  assert.strictEqual(L.game({ ...fine, steam: { there: true, inSteam: true, ours: true, exeGone: true } }).items[0].fix.id, 'steam-refresh');
  assert.strictEqual(L.game({ ...fine, steam: { there: true, inSteam: true, ours: false, exeGone: true } }).items[0].fix.id, 'emu-page'); // your own shortcut is never rewritten
  assert.strictEqual(L.game({ ...fine, steam: { there: false } }).items[0].fix, undefined);
});

const port = { name: 'Bloodborne', game: 'Bloodborne', home: '/home/p', installed: true, verified: true, programThere: true, copy: '/home/p/Emulation/roms/ps4/CUSA00900', copyThere: true, ready: true, windows: true, runner: 'Proton 11.0', prefixThere: true, scriptsThere: true, steam: { inSteam: true } };
test('a port that is ready passes; out of Steam is a note, not a stop', () => {
  assert.deepStrictEqual([L.port(port).ok, L.port(port).warn], [true, 0]);
  const r = L.port({ ...port, steam: { inSteam: false } });
  assert.deepStrictEqual([r.ok, r.warn, r.items[0].fix.id], [true, 1, 'port-steam']);
  assert.strictEqual(L.port({ ...port, steam: { inSteam: false, queued: true } }).items[0].fix, undefined);
});
test('a port: not installed, no copy, copy on an unplugged drive, no Proton, no prefix, not set up', () => {
  assert.deepStrictEqual(L.port({ ...port, installed: false }).items.map((x) => x.fix.id), ['port-sheet']);
  assert.strictEqual(L.port({ ...port, copy: null }).items[0].id, 'copy');
  assert.match(L.port({ ...port, copyThere: false }).items[0].text, /~\/Emulation\/roms\/ps4\/CUSA00900/);
  const noProton = L.port({ ...port, runner: null });
  assert.deepStrictEqual([noProton.ok, noProton.items[0].id, noProton.items[0].fix], [false, 'proton', undefined]);
  assert.deepStrictEqual(L.port({ ...port, prefixThere: false }).items.filter((x) => x.level === 'bad').map((x) => [x.id, x.fix.id]), [['prefix', 'port-setup']]); // one line, not "prefix" and "not set up"
  assert.deepStrictEqual(L.port({ ...port, ready: false }).items.filter((x) => x.level === 'bad').map((x) => x.id), ['setup']);
  assert.strictEqual(L.port({ ...port, windows: false, runner: null }).ok, true); // a Linux build needs no Proton
  const link = L.port({ name: 'Zelda 64', installed: true, verified: false, programThere: true, ready: false, steam: { inSteam: true } });
  assert.deepStrictEqual([link.ok, link.warn], [true, 1]); // a link port sets itself up on its first start
});
