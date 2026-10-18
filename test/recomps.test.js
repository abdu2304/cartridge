// Recomps (0.9.65): matching the player's games, picking a build (Linux first, Windows only without one, never
// anything else), save places, the game check (hashes, N64 byte orders), and the engine's
// install, update with saves backed up and checked, Roll Back and removal, against a fake release.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const R = require('../electron/recomps');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cart-rc-'));

test('titles match across library spellings, only on the same console', () => {
  const e = { games: [{ title: "The Legend of Zelda: Majora's Mask", console: 'n64' }] };
  const roms = [
    { id: 1, name: "Legend of Zelda, The: Majora's Mask", platform_slug: 'n64' },
    { id: 2, name: "The Legend of Zelda: Majora’s Mask", platform_slug: 'n64' },
    { id: 3, name: "The Legend of Zelda: Majora's Mask 3D", platform_slug: '3ds' },
    { id: 4, name: "The Legend of Zelda: Majora's Mask (USA)", platform_slug: 'n64' },
  ];
  assert.deepStrictEqual(R.matchRoms(e, roms).sort(), [1, 2, 4]); // "Legend of Zelda, The" too, never the 3DS game
  assert.strictEqual(R.norm('Banjo-Kazooie™'), 'banjo kazooie');
  assert.strictEqual(R.consoleOfSlug('ngc'), 'gamecube');
  assert.strictEqual(R.consoleOfSlug('genesis-slash-megadrive'), 'genesis');
});

test('builds: Linux first, Windows only without one, never Android, macOS or ARM', () => {
  const A = (...n) => n.map((name) => ({ name, url: 'u/' + name }));
  assert.strictEqual(R.pickBuild(A('Zelda64Recompiled-Windows.zip', 'Zelda64Recompiled-Linux-x64.zip', 'Zelda64Recompiled-macOS.zip')).asset.name, 'Zelda64Recompiled-Linux-x64.zip');
  assert.strictEqual(R.pickBuild(A('Game-win64.zip', 'Game.AppImage')).asset.name, 'Game.AppImage');
  const w = R.pickBuild(A('Game-Windows-x64.zip', 'Game-android.apk', 'Game-macOS-arm64.zip'));
  assert.deepStrictEqual([w.kind, w.asset.name], ['windows', 'Game-Windows-x64.zip']);
  assert.strictEqual(R.pickBuild(A('Game-android.apk', 'Game-macOS.dmg', 'Source.tar.gz.sha256')), null);
  // the catalogue's own pattern wins, and a project marked Windows-only never gets an unnamed zip taken as Linux
  assert.strictEqual(R.pickBuild(A('a-linux.zip', 'b-linux-x64-portable.zip'), { linuxAsset: 'portable' }).asset.name, 'b-linux-x64-portable.zip');
  assert.strictEqual(R.pickBuild(A('Game.zip', 'Game-Windows.zip'), { builds: 'windows' }).kind, 'windows');
});

test('save places: home, XDG folders and the recomp folder', () => {
  const home = '/home/p';
  assert.strictEqual(R.expandPath('~/.config/Zelda64Recompiled/saves', '/x', home), '/home/p/.config/Zelda64Recompiled/saves');
  assert.strictEqual(R.expandPath('saves', '/games/recomp/n64/Zelda', home), '/games/recomp/n64/Zelda/saves');
  assert.ok(R.expandPath('$XDG_DATA_HOME/Ship', '/x', home).endsWith('/Ship'));
  assert.strictEqual(R.expandPath('', '/x', home), null);
});

test('the game check: extension, listed hashes, and an N64 ROM in another byte order', async () => {
  const d = tmp(), z64 = Buffer.alloc(64);
  z64.writeUInt32BE(0x80371240, 0); for (let i = 4; i < 64; i++) z64[i] = i;
  const md5 = crypto.createHash('md5').update(z64).digest('hex');
  const v64 = Buffer.from(z64); v64.swap16();
  fs.writeFileSync(path.join(d, 'mm.z64'), z64); fs.writeFileSync(path.join(d, 'mm.v64'), v64); fs.writeFileSync(path.join(d, 'other.z64'), Buffer.alloc(64, 1)); fs.writeFileSync(path.join(d, 'mm.zip'), 'x');
  const e = { name: 'Zelda 64: Recompiled', games: [{ title: 'MM', console: 'n64' }], needs: { what: 'The US version of Majora’s Mask', ext: ['z64', 'n64', 'v64'], md5: [md5] } };
  assert.strictEqual((await R.checkGame(e, path.join(d, 'mm.z64'))).ok, true);
  assert.strictEqual((await R.checkGame(e, path.join(d, 'mm.v64'))).ok, true);
  const bad = await R.checkGame(e, path.join(d, 'other.z64'));
  assert.strictEqual(bad.ok, false); assert.ok(bad.wrong); assert.match(bad.why, /isn’t the version/);
  assert.match((await R.checkGame(e, path.join(d, 'mm.zip'))).why, /\(unpacked\)/);
  assert.strictEqual((await R.checkGame({ name: 'x' }, path.join(d, 'mm.zip'))).ok, true);
});

// a fake GitHub: releases listed by its API, files served from a folder
function fakeWorld(entries, extra = {}) {
  const d = tmp(), data = path.join(d, 'data'), emu = path.join(d, 'Emulation'), home = path.join(d, 'home'), files = path.join(d, 'srv');
  for (const x of [data, emu, home, files]) fs.mkdirSync(x, { recursive: true });
  fs.writeFileSync(path.join(d, 'shipped.json'), JSON.stringify({ updated: '2026-10-09', entries }));
  const releases = [];
  const fetchImpl = async (url) => {
    if (/api\.github\.com\/repos\/.*\/releases/.test(url)) return { ok: true, status: 200, json: async () => (/\/nobuild\//.test(url) ? [] : releases) };
    if (/api\.github\.com\/repos\/[^/]+\/[^/]+$/.test(url)) return { ok: true, status: 200, json: async () => ({ fork: /\/a-fork$/.test(url), stargazers_count: 5 }) }; // project info
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
  // a release with a Linux tar.gz holding Game/<program> and a data file
  const publish = (tag, text, pad = 0) => {
    const src = path.join(files, tag, 'Game'); fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, 'Game'), '#!/bin/sh\n' + text + ' '.repeat(pad)); fs.writeFileSync(path.join(src, 'assets.dat'), text); // pad: big enough to be found without a catalogue program name
    const tar = path.join(files, tag, 'Game-Linux-x64.tar.gz');
    execFileSync('tar', ['-czf', tar, '-C', path.join(files, tag), 'Game']);
    releases.unshift({ tag_name: tag, published_at: '2026-10-0' + releases.length, prerelease: false, draft: false, assets: [{ name: 'Game-Linux-x64.tar.gz', browser_download_url: 'file://' + tar, size: fs.statSync(tar).size }] });
  };
  const trashed = [];
  const eng = R.createRecomps({
    dataDir: data, shipped: path.join(d, 'shipped.json'), recipesDir: path.join(d, 'no-recipes'), fetchImpl, // the verified recipes are tested in recipes.test.js
    download: async (url, dest, onBytes) => { const b = fs.readFileSync(url.replace('file://', '')); fs.writeFileSync(dest, b); onBytes(b.length); },
    unpackTo: async (a, out) => execFileSync('tar', ['-xf', a, '-C', out]),
    isElf: (f) => path.basename(f) === 'Game', isRunning: () => false,
    trash: async (p) => { trashed.push(p); fs.rmSync(p, { recursive: true, force: true }); },
    recompRoot: () => path.join(emu, 'recomp'), recompRoots: () => [path.join(emu, 'recomp')],
    ...extra,
  });
  return { d, data, emu, home, publish, eng, trashed };
}

test('install, update with saves kept and checked, Roll Back, remove', async () => {
  const entry = { id: 'game', name: 'Game Recompiled', games: [{ title: 'Game', console: 'n64' }], repo: 'github:o/game', builds: 'linux', program: 'Game', saves: ['saves'], needs: null, setup: { how: 'none' } };
  const w = fakeWorld([entry]);
  assert.strictEqual(w.eng.ensureFolders(), 1);
  assert.ok(fs.existsSync(path.join(w.emu, 'recomp', 'n64')));
  w.publish('v1', 'one');
  const r1 = await w.eng.install('game');
  const dir = path.join(w.emu, 'recomp', 'n64', 'Game Recompiled');
  assert.deepStrictEqual([r1.tag, r1.kind, r1.program], ['v1', 'linux', path.join(dir, 'Game')]);
  assert.ok(fs.statSync(r1.program).mode & 0o100, 'the program can run');
  // the game writes saves beside itself
  fs.mkdirSync(path.join(dir, 'saves')); fs.writeFileSync(path.join(dir, 'saves', 'slot1.sav'), 'my save');
  assert.strictEqual((await w.eng.install('game')).already, true);
  w.publish('v2', 'two');
  const r2 = await w.eng.install('game');
  assert.strictEqual(r2.tag, 'v2'); assert.ok(r2.backedUp);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'assets.dat'), 'utf8'), 'two');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'saves', 'slot1.sav'), 'utf8'), 'my save', 'saves untouched by the update');
  assert.deepStrictEqual(w.eng.versions('game').kept.map((k) => k.tag), ['v1']);
  assert.strictEqual(w.eng.backups('game').length, 1);
  // a save lost some other way is put back by the check
  const meta = w.eng.backupSaves('game', 'test');
  fs.rmSync(path.join(dir, 'saves'), { recursive: true });
  assert.strictEqual(w.eng.checkSaves(meta).restored, 1);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'saves', 'slot1.sav'), 'utf8'), 'my save');
  // Roll Back
  w.eng.useVersion('game', 'v1');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'assets.dat'), 'utf8'), 'one');
  assert.deepStrictEqual(w.eng.versions('game'), { current: 'v1', kept: w.eng.versions('game').kept });
  assert.ok(w.eng.versions('game').kept.some((k) => k.tag === 'v2'));
  const l = w.eng.list({ roms: [{ id: 9, name: 'Game', platform_slug: 'n64' }] }).entries[0];
  assert.deepStrictEqual([l.installed.tag, l.installed.ready, l.roms], ['v1', true, [9]]);
  // remove: saves backed up first, the folder to the Trash
  const rm = await w.eng.remove('game');
  assert.ok(rm.backedUp); assert.ok(w.trashed.includes(dir));
  assert.strictEqual(w.eng.record('game'), null);
});

test('a game placed by link; a wrong copy refused unless used anyway; path setups pass it to the program', async () => {
  const z = Buffer.alloc(32, 7), md5 = crypto.createHash('md5').update(z).digest('hex');
  const placed = { id: 'p', name: 'Placed', games: [{ title: 'P', console: 'gba' }], repo: 'github:o/p', builds: 'linux', program: 'Game', needs: { what: 'P (USA)', ext: ['gba'], md5: [md5] }, setup: { how: 'place', place: 'baserom.gba', to: { file: 'baserom.gba' } }, done: 'baserom.gba' };
  const byPath = { id: 'q', name: 'ByPath', games: [{ title: 'Q', console: 'snes' }], repo: 'github:o/q', builds: 'linux', program: 'Game', needs: { what: 'Q', ext: ['sfc'] }, setup: { how: 'path', arg: '--rom {FILE}' } };
  const w = fakeWorld([placed, byPath]);
  w.publish('v1', 'x');
  await w.eng.install('p'); await w.eng.install('q');
  const good = path.join(w.d, 'p.gba'), wrong = path.join(w.d, 'w.gba'), rom = path.join(w.d, 'q.sfc');
  fs.writeFileSync(good, z); fs.writeFileSync(wrong, Buffer.alloc(32, 1)); fs.writeFileSync(rom, 'q');
  assert.strictEqual(w.eng.list().entries.find((e) => e.id === 'p').installed.ready, false);
  const no = await w.eng.setGame('p', wrong);
  assert.deepStrictEqual([no.ok, no.wrong], [false, true]);
  const yes = await w.eng.setGame('p', good);
  assert.ok(yes.ok);
  const link = path.join(w.emu, 'recomp', 'gba', 'Placed', 'baserom.gba');
  assert.strictEqual(fs.realpathSync(link), fs.realpathSync(good));
  assert.strictEqual(w.eng.list().entries.find((e) => e.id === 'p').installed.ready, true);
  const q = await w.eng.setGame('q', rom);
  assert.strictEqual(q.args, `--rom "${rom}"`);
});

test('Save Sync: a recomp save has its own slot, and is never synced while the recomp runs', () => {
  const SS = require('../electron/saveSync');
  assert.strictEqual(SS.slotOf('recomp', 'zelda64recomp', 'dir'), 'cartridge:recomp:dir:zelda64recomp');
  assert.deepStrictEqual(SS.parseSlot('cartridge:recomp:dir:zelda64recomp'), { family: 'recomp', kind: 'dir', key: 'zelda64recomp' });
  const prog = '/e/recomp/n64/Zelda 64 Recompiled/Zelda64Recompiled';
  assert.strictEqual(SS.progRuns(prog, [[prog]]), true);
  assert.strictEqual(SS.progRuns('/e/recomp/xbox360/Unleashed/UnleashedRecomp.exe', [['/home/p/.steam/steam/steamapps/common/Proton/proton', 'waitforexitandrun', 'Z:\\e\\recomp\\xbox360\\Unleashed\\UnleashedRecomp.exe']]), true);
  assert.strictEqual(SS.progRuns(prog, [['/usr/bin/cat', 'Zelda64Recompiled.log']]), false);
  assert.strictEqual(SS.progRuns(null, [[prog]]), false);
});

test('achievements: Unleashed/Marathon records and ReXGlue unlocks with their names', () => {
  const RA = require('../electron/recompAchievements');
  // hedge format: header, then 16-byte packed records (uint16 ID, int64 time, 6 reserved)
  const b = Buffer.alloc(16 + 16 * 3);
  b.write('ACH ', 0, 'latin1'); b.writeUInt32LE(1, 4);
  b.writeUInt16LE(24, 16); b.writeBigInt64LE(1700000000n, 18);
  b.writeUInt16LE(31, 32); b.writeBigInt64LE(1700000500n, 34);
  assert.deepStrictEqual(RA.readHedge(b), [{ id: 24, time: 1700000000000 }, { id: 31, time: 1700000500000 }]);
  assert.strictEqual(RA.readHedge(Buffer.from('nope')), null);
  // ReXGlue: [unlocked.<id>] filetime = Windows FILETIME
  const ft = (ms) => BigInt(ms + RA.FILETIME_EPOCH) * 10000n;
  const unl = `# Achievement unlock state - managed by ReXGlue runtime\n\n[unlocked.18]\nfiletime = ${ft(1700000000000)}\n\n[unlocked.3]\nfiletime = 0\n`;
  assert.deepStrictEqual(RA.readRexUnlocks(unl), [{ id: 18, time: 1700000000000 }, { id: 3, time: null }]);
  assert.deepStrictEqual(RA.readRexUnlocks('unlocked = [4, 5]').map((x) => x.id), [4, 5]);
  const meta = '[[achievements]]\nid = 18\nlabel = "Wanted Man"\ndescription = "Pull over \\"then\\" drive away."\ngamerscore = 20\n\n  [achievements.German]\n  label = "Gesuchter Mann"\n\n[[achievements]]\nid = 19\nlabel = "Another"\n';
  assert.deepStrictEqual(RA.readRexMeta(meta), [{ id: 18, name: 'Wanted Man', desc: 'Pull over "then" drive away.', score: 20 }, { id: 19, name: 'Another', desc: '', score: 0 }]);
  // located on disk and read as a trophy game
  const d = tmp(), home = path.join(d, 'home'), dir = path.join(d, 'LARecomp');
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true }); fs.writeFileSync(path.join(dir, 'assets', 'achievements.toml'), meta);
  fs.mkdirSync(path.join(home, '.local/share/LARecomp/achievements'), { recursive: true }); fs.writeFileSync(path.join(home, '.local/share/LARecomp/achievements/545407F2.toml'), unl);
  const it = { id: 'la', name: 'LARecomp', game: 'Midnight Club: Los Angeles', program: path.join(dir, 'larecomp'), dir, ach: null };
  const where = RA.locate(it, { home, env: {} });
  assert.strictEqual(where.format, 'rexglue'); assert.strictEqual(where.files.length, 1);
  const g = RA.gameOf(it, where);
  assert.deepStrictEqual([g.src, g.title, g.trophies.length, g.trophies.filter((t) => t.unlocked).map((t) => t.name)], ['recomp', 'Midnight Club: Los Angeles', 2, ['Wanted Man']]);
  // hedge, found under ~/.config/<user>/save
  fs.mkdirSync(path.join(home, '.config/UnleashedRecomp/save'), { recursive: true }); fs.writeFileSync(path.join(home, '.config/UnleashedRecomp/save/ACH-DATA'), b);
  const u = { id: 'unleashed', name: 'Unleashed Recompiled', game: 'Sonic Unleashed', dir: path.join(d, 'U'), ach: { format: 'hedge', user: 'UnleashedRecomp', file: 'ACH-DATA' } };
  fs.mkdirSync(u.dir);
  const gu = RA.gameOf(u, RA.locate(u, { home }));
  assert.deepStrictEqual(gu.trophies.map((t) => [t.id, t.unlocked]), [[24, true], [31, true]]);
});

test('an update is started once; one that can’t start goes back to the release that worked', async () => {
  const entry = { id: 'game', name: 'Game Recompiled', games: [{ title: 'Game', console: 'n64' }], repo: 'github:o/game', builds: 'linux', program: 'Game', saves: [], needs: null, setup: { how: 'none' } };
  const tried = [];
  const w = fakeWorld([entry], { trialRun: async ({ program }) => { const t = fs.readFileSync(program, 'utf8'); tried.push(t); return /broken/.test(t) ? { failed: true, why: 'It needs libfoo.so.1, which this system doesn’t have.' } : { ok: true }; } });
  w.publish('v1', 'one');
  await w.eng.install('game');
  assert.strictEqual(tried.length, 0, 'a first install isn’t started');
  w.publish('v2', 'two');
  assert.strictEqual((await w.eng.install('game')).started, true);
  w.publish('v3', 'broken');
  const r = await w.eng.install('game');
  assert.deepStrictEqual([r.rolledBack, r.tag, r.newTag], [true, 'v2', 'v3']);
  assert.match(r.why, /libfoo/);
  const dir = path.join(w.emu, 'recomp', 'n64', 'Game Recompiled');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'assets.dat'), 'utf8'), 'two', 'the release that worked is back');
  assert.strictEqual(w.eng.versions('game').current, 'v2');
});

test('project details: the first real README picture, plain release notes; a link’s console and game guessed', () => {
  const md = '[![build](https://img.shields.io/x.svg)](ci) <img src="https://example.com/logo.svg"> ![Shot](docs/shot.png "a")';
  assert.strictEqual(R.readmePicture(md, 'https://raw.githubusercontent.com/o/r/HEAD/'), 'https://raw.githubusercontent.com/o/r/HEAD/docs/shot.png');
  assert.strictEqual(R.readmePicture('![x](https://github.com/o/r/blob/main/a.png)', 'https://raw.githubusercontent.com/o/r/HEAD/'), 'https://raw.githubusercontent.com/o/r/main/a.png');
  assert.strictEqual(R.readmePicture('no pictures', 'https://x/'), null);
  assert.strictEqual(R.plainNotes('## What’s new\n- **Fixed** [saves](http://x)\n\n\n\n`code`'), 'What’s new\n• Fixed saves\n\ncode');
  assert.ok(R.plainNotes('a '.repeat(800)).length <= 905);
  const roms = [{ id: 1, name: 'The Legend of Zelda: Majora’s Mask', platform_slug: 'n64' }, { id: 2, name: 'Mask', platform_slug: 'n64' }, { id: 3, name: 'Super Mario World', platform_slug: 'snes' }];
  assert.deepStrictEqual(R.guessFromText('Zelda64Recomp Static recompilation of Majora’s Mask for PC (N64)', roms, R.CONSOLES), { console: 'n64', title: 'The Legend of Zelda: Majora’s Mask', romId: 1 });
  assert.deepStrictEqual(R.guessFromText('smw-pc a port of Super Mario World', roms, R.CONSOLES), { console: 'snes', title: 'Super Mario World', romId: 3 });
  assert.deepStrictEqual(R.guessFromText('a tool', roms, R.CONSOLES), { console: null, title: null, romId: null });
});

test('setup on its first start: bytes written measured against the finished size, done when its done file appears', async () => {
  const entry = { id: 'game', name: 'Game Recompiled', games: [{ title: 'Game', console: 'n64' }], repo: 'github:o/game', builds: 'linux', program: 'Game', saves: [], needs: { what: 'a ROM' }, setup: { how: 'place', place: 'rom.z64' }, done: 'game.o2r', doneSize: 2000 };
  let running = true;
  const w = fakeWorld([entry], { isRunning: () => running });
  w.publish('v1', 'one');
  await w.eng.install('game');
  const dir = path.join(w.emu, 'recomp', 'n64', 'Game Recompiled');
  assert.strictEqual(w.eng.ready('game'), false);
  // the recomp writes its file in pieces, then the finished one
  const steps = [() => fs.writeFileSync(path.join(dir, 'tmp.part'), Buffer.alloc(500)), () => fs.writeFileSync(path.join(dir, 'tmp.part'), Buffer.alloc(1500)), () => { fs.rmSync(path.join(dir, 'tmp.part')); fs.writeFileSync(path.join(dir, 'game.o2r'), Buffer.alloc(2000)); }];
  const seen = [];
  const r = await w.eng.watchSetup('game', { sleep: async () => { steps.shift()?.(); }, onProgress: (m) => seen.push(m) });
  assert.deepStrictEqual(seen.map((m) => [m.got, m.pct]), [[500, 25], [1500, 75]]);
  assert.deepStrictEqual([r.done, w.eng.ready('game')], [true, true]);
  assert.strictEqual((await w.eng.watchSetup('game')).watched, false, 'nothing to watch once set up');
  // closed before it finished: the watch ends after three looks
  fs.rmSync(path.join(dir, 'game.o2r')); running = false;
  const r2 = await w.eng.watchSetup('game', { sleep: async () => {} });
  assert.deepStrictEqual([r2.done, r2.closed], [false, true]);
});

test('no setup watch for a recomp the catalogue gives no done file', async () => {
  const entry = { id: 'nodone', name: 'No Done', games: [{ title: 'X', console: 'n64' }], repo: 'github:o/nodone', builds: 'linux', program: 'Game', saves: [], needs: { what: 'a ROM' }, setup: { how: 'picker' } };
  const w = fakeWorld([entry]);
  w.publish('v1', 'one'); await w.eng.install('nodone');
  assert.strictEqual((await w.eng.watchSetup('nodone', { sleep: async () => {} })).watched, false);
});

test('save notes read as paths: sentences, Proton prefixes, Flatpak sandboxes, placeholders left out', () => {
  const rec = { dir: '/E/x', kind: 'linux' };
  assert.deepStrictEqual(R.savePaths('pokeemerald.sav in the working directory', rec, '/H'), ['/E/x/pokeemerald.sav']);
  assert.deepStrictEqual(R.savePaths('baserom.sav and baserom.sav2 in the working directory', rec, '/H'), ['/E/x/baserom.sav', '/E/x/baserom.sav2']);
  assert.deepStrictEqual(R.savePaths('~/.local/share/Sonic3AIR/storage/ (persistent data) and ~/.local/share/Sonic3AIR/savestates/; uses ./savedata', rec, '/H'), ['/H/.local/share/Sonic3AIR/storage/', '/H/.local/share/Sonic3AIR/savestates/']);
  assert.deepStrictEqual(R.savePaths('GCI files in its memory card folder (exact Linux location not confirmed)', rec, '/H'), []);
  assert.deepStrictEqual(R.savePaths('~/.config/OpenGOAL/<game>/settings', rec, '/H'), [], 'never widened to every game');
  assert.deepStrictEqual(R.savePaths('<install folder>/profiles/default/ (saves); default install folder ~/.config/reblue', rec, '/H'), ['/E/x/profiles/default/']);
  assert.deepStrictEqual(R.savePaths('Documents/svr07 inside the Proton prefix', rec, '/H'), [], 'a Linux build has no Proton prefix');
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'cart-pfx-')), user = path.join(h, '.local/share/Steam/steamapps/compatdata/77/pfx/drive_c/users/steamuser');
  fs.mkdirSync(user, { recursive: true });
  const win = { dir: '/E/x', kind: 'windows', appid: 77 };
  assert.deepStrictEqual(R.savePaths('%LOCALAPPDATA%\\Quest64Recompiled\\saves inside the Proton prefix', win, h), [path.join(user, 'AppData/Local/Quest64Recompiled/saves')]);
  assert.deepStrictEqual(R.savePaths('Documents/ac6recomp inside the Proton prefix (ReXGlue user data folder)', win, h), [path.join(user, 'Documents/ac6recomp')]);
  assert.deepStrictEqual(R.savePaths('Documents/ac6recomp inside the Proton prefix', { ...win, appid: null }, h), [], 'not in Steam yet: no prefix');
  assert.deepStrictEqual(R.saveDirs({ saves: ['~/.config/UnleashedRecomp/save', '~/.local/share/skate3 (x; $XDG_DATA_HOME/skate3)'] }, { dir: '/E/x', flatpak: 'io.x.App' }, '/H'), ['/H/.var/app/io.x.App/config/UnleashedRecomp/save', '/H/.var/app/io.x.App/data/skate3']);
  // every note in the shipped catalogue gives only real paths (no sentence taken as a folder name)
});


test('a game file goes into an argument template quoted once, with Z: once for Windows builds', () => {
  const { fileArg } = require('../electron/recomps');
  assert.strictEqual(fileArg('-rom {FILE}', '/g/a b.nes', false), '-rom "/g/a b.nes"');
  assert.strictEqual(fileArg('--run "{FILE}"', '/g/c.cue', false), '--run "/g/c.cue"');
  assert.strictEqual(fileArg('"Z:{FILE}"', '/g/r.iso', true), '"Z:/g/r.iso"');
  assert.strictEqual(fileArg('--game_data_root "{FILE}"', '/g/d', true), '--game_data_root "Z:/g/d"');
  assert.strictEqual(fileArg('{FILE}', '/g/x', false), '"/g/x"');
});

test('place: a cue brings its tracks, folders go in by content, disc files take their names, old sentence links are put right', async () => {
  const cueE = { id: 'w', name: 'W', games: [{ title: 'W', console: 'psx' }], repo: 'github:o/w', builds: 'linux', program: 'Game', needs: { what: 'W', files: 'disc', ext: ['cue', 'bin'] }, setup: { how: 'place', place: 'words', to: { file: 'diskimages/', dir: 'diskimages' } } };
  const dirE = { id: 'a', name: 'A', games: [{ title: 'A', console: 'xbox360' }], repo: 'github:o/a', builds: 'linux', program: 'Game', needs: { what: 'A', files: 'folder' }, setup: { how: 'place', place: 'assets/ next to it', to: { dir: 'assets' } }, done: 'assets/default.xex' };
  const discE = { id: 'r', name: 'R', games: [{ title: 'R', console: 'psx' }], repo: 'github:o/r', builds: 'linux', program: 'Game', needs: { what: 'R', files: 'several', ext: ['bin'] }, setup: { how: 'place', place: 'install/...', to: { file: 'install/', names: ['CD1.bin', 'CD2.bin'] } } };
  const sohE = { id: 's', name: 'S', games: [{ title: 'S', console: 'n64' }], repo: 'github:o/s', builds: 'linux', program: 'Game', needs: { what: 'S', ext: ['z64'] }, setup: { how: 'place', place: 'the ROM in the same folder as soh.appimage', to: { file: './' } }, done: 'oot.o2r' };
  const handE = { id: 'h', name: 'H', games: [{ title: 'H', console: 'gbc' }], repo: 'github:o/h', builds: 'linux', program: 'Game', needs: { what: 'H', files: 'folder' }, setup: { how: 'place', place: 'the patcher in the root folder' } };
  const w = fakeWorld([cueE, dirE, discE, sohE, handE]);
  w.publish('v1', 'x');
  for (const id of ['w', 'a', 'r', 's', 'h']) await w.eng.install(id);
  const at = (id, ...p) => path.join(w.eng.record(id).dir, ...p);
  // a .cue and the tracks it names
  const g = path.join(w.d, 'g'); fs.mkdirSync(g);
  fs.writeFileSync(path.join(g, 'W.cue'), 'FILE "W (Track 1).bin" BINARY\n  TRACK 01 MODE2/2352\nFILE "W (Track 2).bin" BINARY\n  TRACK 02 AUDIO\n');
  fs.writeFileSync(path.join(g, 'W (Track 1).bin'), '1'); fs.writeFileSync(path.join(g, 'W (Track 2).bin'), '2');
  const r1 = await w.eng.setGame('w', path.join(g, 'W.cue'));
  assert.ok(r1.ok, r1.why);
  assert.deepStrictEqual(fs.readdirSync(at('w', 'diskimages')).sort(), ['W (Track 1).bin', 'W (Track 2).bin', 'W.cue']);
  // a folder's contents into assets/, never over a file that's there
  const gd = path.join(w.d, 'game'); fs.mkdirSync(gd); fs.writeFileSync(path.join(gd, 'default.xex'), 'x');
  const r2 = await w.eng.setGame('a', gd);
  assert.ok(r2.ok, r2.why);
  assert.strictEqual(fs.realpathSync(at('a', 'assets', 'default.xex')), fs.realpathSync(path.join(gd, 'default.xex')));
  assert.strictEqual(w.eng.list().entries.find((e) => e.id === 'a').installed.ready, true);
  assert.strictEqual((await w.eng.setGame('a', path.join(gd, 'default.xex'))).ok, false, 'a file refused where only a folder goes');
  // disc files named as it reads them, disc 1 first
  const dd = path.join(w.d, 'discs'); fs.mkdirSync(dd);
  fs.writeFileSync(path.join(dd, 'Driver 2 (Disc 2).bin'), '2'); fs.writeFileSync(path.join(dd, 'Driver 2 (Disc 1).bin'), '1');
  assert.ok((await w.eng.setGame('r', path.join(dd, 'Driver 2 (Disc 1).bin'))).ok);
  assert.strictEqual(fs.readFileSync(at('r', 'install', 'CD1.bin'), 'utf8'), '1');
  assert.strictEqual(fs.readFileSync(at('r', 'install', 'CD2.bin'), 'utf8'), '2');
  // no rule: set up by hand, with It's Set Up
  const h = w.eng.list().entries.find((e) => e.id === 'h');
  assert.strictEqual(h.setup.how, 'manual');
  assert.strictEqual(h.installed.ready, false);
  w.eng.markDone('h');
  assert.strictEqual(w.eng.list().entries.find((e) => e.id === 'h').installed.ready, true);
  // a 0.9.67 install: the copy linked under a file named like the note is moved to where the rule says
  const rom = path.join(w.d, 'oot.z64'); fs.writeFileSync(rom, 'rom');
  const recs = JSON.parse(fs.readFileSync(path.join(w.data, 'recomp-installs.json'), 'utf8'));
  const bad = at('s', 'the ROM in the same folder as soh.appimage');
  fs.symlinkSync(rom, bad);
  recs.s.game = { file: rom, how: 'place', placed: bad }; recs.s.setupDone = true;
  fs.writeFileSync(path.join(w.data, 'recomp-installs.json'), JSON.stringify(recs));
  w.eng.reload();
  const s = w.eng.list().entries.find((e) => e.id === 's');
  assert.ok(!fs.existsSync(bad) && !fs.lstatSync(bad, { throwIfNoEntry: false }), 'the sentence link is gone');
  assert.strictEqual(fs.realpathSync(at('s', 'oot.z64')), fs.realpathSync(rom));
  assert.strictEqual(s.installed.ready, false, 'not ready until it has made oot.o2r');
  fs.writeFileSync(at('s', 'oot.o2r'), 'o2r');
  assert.strictEqual(w.eng.list().entries.find((e) => e.id === 's').installed.ready, true);
});

test('launch arguments: the catalogue\'s own come first; a one-off setup command runs once and is never kept', async () => {
  assert.strictEqual(R.argString(['-game', 'decay']), '-game decay');
  assert.strictEqual(R.argString(['--root', 'My Games']), '--root "My Games"');
  assert.strictEqual(R.setupTpl({ program: 'doom64ex', setup: { arg: 'doom64ex -wadgen {FILE}' } }), '-wadgen {FILE}');
  assert.strictEqual(R.setupTpl({ program: 'x', setup: { arg: '--rom {FILE}' } }), '--rom {FILE}');
  const once = { id: 'o', name: 'O', games: [{ title: 'O', console: 'wii' }], repo: 'github:o/o', builds: 'linux', program: 'Game', args: ['launch-base'], needs: { what: 'O', ext: ['iso'] }, setup: { how: 'path', arg: 'Game install --game {FILE}' }, done: '~/.local/share/O/state.json' };
  const every = { id: 'e', name: 'E', games: [{ title: 'E', console: 'psx' }], repo: 'github:o/e', builds: 'linux', program: 'Game', args: '--fast', needs: { what: 'E', ext: ['cue'] }, setup: { how: 'path', arg: '-cue "{FILE}"' } };
  const w = fakeWorld([once, every]);
  w.publish('v1', 'x');
  await w.eng.install('o'); await w.eng.install('e');
  const iso = path.join(w.d, 'o.iso'), cue = path.join(w.d, 'e.cue'); fs.writeFileSync(iso, 'i'); fs.writeFileSync(cue, 'c');
  const r = await w.eng.setGame('o', iso);
  assert.strictEqual(r.run, `install --game "${iso}"`);
  assert.strictEqual(w.eng.launchArgs('o'), 'launch-base', 'play starts it the normal way');
  await w.eng.setGame('e', cue);
  assert.strictEqual(w.eng.launchArgs('e'), `--fast -cue "${cue}"`);
});

test('save backups put back: the saves there now backed up first, the backup restored kept even at the limit', async () => {
  const entry = { id: 'b', name: 'B', games: [{ title: 'B', console: 'n64' }], repo: 'github:o/b', builds: 'linux', program: 'Game', saves: ['saves'], needs: null, setup: { how: 'none' } };
  const w = fakeWorld([entry]);
  w.publish('v1', 'x');
  await w.eng.install('b');
  const dir = w.eng.record('b').dir, sav = path.join(dir, 'saves', 'slot.sav');
  fs.mkdirSync(path.dirname(sav)); fs.writeFileSync(sav, 'first');
  w.eng.backupSaves('b', 'update');
  for (let i = 0; i < 9; i++) { fs.writeFileSync(sav, 'later ' + i); await new Promise((r) => setTimeout(r, 2)); w.eng.backupSaves('b', 'update'); }
  const list = w.eng.backups('b');
  assert.strictEqual(list.length, 10);
  const oldest = list[list.length - 1];
  assert.strictEqual(oldest.files, 1);
  fs.writeFileSync(sav, 'now');
  const r = w.eng.restoreBackup('b', oldest.stamp);
  assert.deepStrictEqual([r.files, r.savedFirst], [1, true]);
  assert.strictEqual(fs.readFileSync(sav, 'utf8'), 'first');
  const after = w.eng.backups('b');
  assert.ok(after.some((b) => b.stamp === oldest.stamp), 'the backup put back is kept');
  assert.strictEqual(after[0].why, 'before restore');
  assert.throws(() => w.eng.restoreBackup('b', '../x'), /isn’t there/);
});

test('a recomp from a link: set up when you say so, saves guessed for backups only, nothing big', async () => {
  const w = fakeWorld([]);
  const r = w.eng.addLink({ repo: 'github:o/game', console: 'n64', title: 'Game', name: 'game' });
  w.publish('v1', 'x', 600 * 1024);
  // the fake release's own files: Game and assets.dat
  await w.eng.install(r.id);
  const e = w.eng.list().entries.find((x) => x.id === r.id);
  assert.deepStrictEqual([e.setup.how, !!e.needs, e.installed.ready], ['picker', true, false], 'not ready until It’s Set Up');
  w.eng.markDone(r.id);
  assert.strictEqual(w.eng.list().entries.find((x) => x.id === r.id).installed.ready, true);
  const rec = w.eng.record(r.id);
  fs.mkdirSync(path.join(rec.dir, 'saves')); fs.writeFileSync(path.join(rec.dir, 'saves', 's.sav'), 'mine');
  fs.writeFileSync(path.join(rec.dir, 'config.ini'), 'x=1');
  const big = path.join(rec.dir, 'gamefiles'); fs.mkdirSync(big); fs.writeFileSync(path.join(big, 'disc.iso'), Buffer.alloc(1)); fs.truncateSync(path.join(big, 'disc.iso'), 300 * 1024 * 1024);
  const cfg = path.join(w.home, '.config', 'Game'); fs.mkdirSync(cfg, { recursive: true }); fs.writeFileSync(path.join(cfg, 'save.dat'), 'x');
  const got = R.guessSaves(w.eng.byId(r.id), rec, w.home).map((p) => path.relative(w.d, p)).sort();
  assert.deepStrictEqual(got, [path.relative(w.d, path.join(rec.dir, 'config.ini')), path.relative(w.d, path.join(rec.dir, 'saves')), path.relative(w.d, cfg)].sort());
  assert.deepStrictEqual(w.eng.saveDirs(r.id), [], 'Save Sync never gets guessed folders');
});

test('0.9.80: builds only from GitHub Actions: the newest Linux artifact, installed from the file you download', async () => {
  const arts = { artifacts: [
    { id: 7, name: 'game-macos', expired: false, created_at: '2026-10-17T10:00:00Z', workflow_run: { id: 70, head_branch: 'main' } },
    { id: 8, name: 'game-linux-x64', expired: true, created_at: '2026-10-18T10:00:00Z', workflow_run: { id: 80, head_branch: 'main' } },
    { id: 9, name: 'game-linux-x64', expired: false, created_at: '2026-10-16T09:30:00Z', workflow_run: { id: 90, head_branch: 'main' }, size_in_bytes: 4000 },
    { id: 10, name: 'game-windows', expired: false, created_at: '2026-10-16T12:00:00Z', workflow_run: { id: 91, head_branch: 'main' } },
  ] };
  const ci = await R.ciBuildOf({ repo: 'github:o/openmbu' }, { fetchImpl: async (u) => (/actions\/artifacts/.test(u) ? { ok: true, json: async () => arts } : { ok: false }) });
  assert.deepStrictEqual([ci.tag, ci.kind, ci.name, ci.ci.url], ['build 2026-10-16 09:30', 'linux', 'game-linux-x64', 'https://github.com/o/openmbu/actions/runs/90']);
  assert.strictEqual((await R.ciBuildOf({ repo: 'github:o/x', builds: 'windows' }, { fetchImpl: async () => ({ ok: true, json: async () => arts }) })).kind, 'windows');
  // the engine: no release with a build, so install says where the build is; the file downloaded there installs
  const w = fakeWorld([], { fetchImpl: async (u) => (/actions\/artifacts/.test(u) ? { ok: true, json: async () => arts } : /releases/.test(u) ? { ok: true, json: async () => [] } : { ok: false, status: 404, json: async () => ({}) }) });
  const r = w.eng.addLink({ repo: 'github:o/openmbu', console: 'n64', title: 'Game', name: 'game' });
  const a = await w.eng.install(r.id);
  assert.deepStrictEqual([a.ci.run, a.tag], [90, 'build 2026-10-16 09:30']);
  assert.strictEqual(w.eng.record(r.id), null, 'nothing installed yet');
  const src = path.join(w.d, 'art', 'Game'); fs.mkdirSync(src, { recursive: true }); fs.writeFileSync(path.join(src, 'Game'), '#!/bin/sh\necho hi\n' + ' '.repeat(600 * 1024));
  const tgz = path.join(w.d, 'art', 'game-linux-x64.tar.gz'); execFileSync('tar', ['-czf', tgz, '-C', path.join(w.d, 'art'), 'Game']);
  const done = await w.eng.install(r.id, { local: { file: tgz, name: 'game-linux-x64.tar.gz', tag: a.tag, kind: 'linux' } });
  assert.deepStrictEqual([done.tag, done.kind, path.basename(done.program)], ['build 2026-10-16 09:30', 'linux', 'Game']);
  assert.strictEqual((await w.eng.install(r.id)).already, true, 'the same build isn’t asked for again');
});

test('0.9.80: after an update, set up again when its done file went; files you made never replaced by the release', async () => {
  const entry = { id: 'game', name: 'Game', games: [{ title: 'Game', console: 'n64' }], repo: 'github:o/game', builds: 'linux', program: 'Game', saves: [], needs: { what: 'x', files: 'any' }, setup: { how: 'picker' }, done: 'game.o2r' };
  const w = fakeWorld([entry]);
  w.publish('v1', 'one');
  const r1 = await w.eng.install('game'), dir = path.dirname(r1.program);
  fs.writeFileSync(path.join(dir, 'game.o2r'), 'made by its setup');
  fs.writeFileSync(path.join(dir, 'controls.cfg'), 'mine');
  assert.strictEqual(w.eng.ready('game'), true);
  // v2 brings its own controls.cfg, and its update moves game.o2r away (the done file is gone afterwards)
  w.publish('v2', 'two');
  const v2 = path.join(w.d, 'srv', 'v2', 'Game'); fs.writeFileSync(path.join(v2, 'controls.cfg'), 'default');
  execFileSync('tar', ['-czf', path.join(w.d, 'srv', 'v2', 'Game-Linux-x64.tar.gz'), '-C', path.join(w.d, 'srv', 'v2'), 'Game']);
  fs.rmSync(path.join(dir, 'game.o2r'));
  const r2 = await w.eng.install('game');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'controls.cfg'), 'utf8'), 'mine', 'yours stays in place');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'controls.cfg.cartridge-release'), 'utf8'), 'default');
  assert.match(r2.kept, /controls\.cfg/);
  // the done file had been there before this update only if it existed: here it was removed before, so no ask
  assert.strictEqual(r2.setupAgain, undefined);
  // now with the done file there before an update that loses it
  fs.writeFileSync(path.join(dir, 'game.o2r'), 'made');
  w.publish('v3', 'three');
  const v3 = path.join(w.d, 'srv', 'v3', 'Game'); fs.writeFileSync(path.join(v3, 'game.o2r'), 'stale'); // the release ships one: it's put beside, yours stays
  execFileSync('tar', ['-czf', path.join(w.d, 'srv', 'v3', 'Game-Linux-x64.tar.gz'), '-C', path.join(w.d, 'srv', 'v3'), 'Game']);
  const r3 = await w.eng.install('game');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'game.o2r'), 'utf8'), 'made');
  assert.strictEqual(r3.setupAgain, undefined);
  // the files listed as v3's own are the release's, so the next update keeps them aside, never yours
  assert.ok(w.eng.record('game').files.includes('game.o2r.cartridge-release') && !w.eng.record('game').files.includes('controls.cfg'));
  w.publish('v4', 'four');
  fs.rmSync(path.join(w.d, 'srv', 'v4', 'Game', 'assets.dat'));
  execFileSync('tar', ['-czf', path.join(w.d, 'srv', 'v4', 'Game-Linux-x64.tar.gz'), '-C', path.join(w.d, 'srv', 'v4'), 'Game']);
  // a release that had game.o2r as its own file: the update keeps it aside with the rest, so the done file goes
  const rec = w.eng.record('game'); rec.files = [...rec.files, 'game.o2r'];
  const r4 = await w.eng.install('game');
  assert.match(r4.setupAgain, /set it up again/);
  assert.strictEqual(w.eng.ready('game'), false);
});

test('0.9.80: a link recomp’s Save Sync takes only the folders you tick, never home or its own folder', async () => {
  const w = fakeWorld([]), home0 = process.env.HOME;
  process.env.HOME = w.home;
  try {
    const r = w.eng.addLink({ repo: 'github:o/game', console: 'n64', title: 'Game', name: 'game' });
    w.publish('v1', 'x', 600 * 1024);
    await w.eng.install(r.id);
    const rec = w.eng.record(r.id), cfg = path.join(w.home, '.config', 'Game');
    fs.mkdirSync(cfg, { recursive: true }); fs.mkdirSync(path.join(rec.dir, 'saves'));
    assert.deepStrictEqual(w.eng.saveDirs(r.id), []);
    const c = w.eng.saveChoices(r.id);
    assert.ok(c.found.some((f) => f.path === cfg) && c.found.every((f) => !f.chosen));
    // the emulation folder sits outside this fake home, so a folder inside the recomp's own counts too
    const set = w.eng.setSyncSaves(r.id, [cfg, path.join(rec.dir, 'saves'), w.home, rec.dir, '/etc', path.join(w.home, '.config')]);
    assert.deepStrictEqual(set.chosen.sort(), [cfg, path.join(rec.dir, 'saves')].sort());
    assert.deepStrictEqual(w.eng.saveDirs(r.id).sort(), set.chosen.sort());
    assert.deepStrictEqual(w.eng.list().entries.find((x) => x.id === r.id).syncSaves.sort(), set.chosen.sort());
  } finally { process.env.HOME = home0; }
});

test('0.9.80: pending setups for a start from Steam; a Windows update gets its own prefix for the trial start', async () => {
  const entry = { id: 'soh', name: 'Ship', games: [{ title: 'Ship', console: 'n64' }], repo: 'github:o/soh', builds: 'linux', program: 'Game', saves: [], needs: { what: 'x', files: 'any' }, setup: { how: 'picker' }, done: 'oot.o2r' };
  const runs = [], trials = [];
  const w = fakeWorld([entry], {
    runner: async () => ({ kind: 'proton', proton: '/p/Proton', steam: '/s' }),
    runProgram: async (cmd, args, o) => { runs.push([cmd, ...args]); fs.mkdirSync(path.join(o.env.STEAM_COMPAT_DATA_PATH, 'pfx'), { recursive: true }); return ''; },
    trialRun: async (t) => { trials.push(t); return { ok: true }; },
  });
  w.publish('v1', 'one');
  await w.eng.install('soh');
  assert.deepStrictEqual(w.eng.pendingSetup().map((x) => x.id), ['soh']);
  fs.writeFileSync(path.join(path.dirname(w.eng.record('soh').program), 'oot.o2r'), 'x');
  assert.deepStrictEqual(w.eng.pendingSetup(), []);
  // a Windows link build: the update makes Cartridge's prefix once with wineboot, then starts it through Proton
  const r = w.eng.addLink({ repo: 'github:o/win', console: 'n64', title: 'Win', name: 'win' });
  const pub = (tag) => { const src = path.join(w.d, 'w', tag, 'Win'); fs.mkdirSync(src, { recursive: true }); fs.writeFileSync(path.join(src, 'Win.exe'), 'MZ' + tag); const t = path.join(w.d, 'w', tag, 'Win-windows.tar.gz'); execFileSync('tar', ['-czf', t, '-C', path.join(w.d, 'w', tag), 'Win']); return t; };
  const t1 = pub('w1'), t2 = pub('w2');
  await w.eng.install(r.id, { local: { file: t1, name: 'Win-windows.tar.gz', tag: 'w1', kind: 'windows' } });
  assert.strictEqual(runs.length, 0, 'no prefix for a first install');
  const u = await w.eng.install(r.id, { local: { file: t2, name: 'Win-windows.tar.gz', tag: 'w2', kind: 'windows' } });
  assert.ok(runs.some((c) => c.includes('wineboot')), 'the prefix made with wineboot');
  assert.strictEqual(u.started, true);
  assert.ok(trials.some((t) => /proton$/.test(t.program) && t.argv.includes('run')), 'started through Proton');
});
