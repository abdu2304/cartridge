// Recomps (0.9.65): matching the player's games, picking a build (Linux first, Windows only without one, never
// anything else), PCGamingWiki's wikitext, save places, the game check (hashes, N64 byte orders), and the engine's
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

test('PCGamingWiki wikitext: console sections only, links read, PC sections left out', () => {
  const wt = [
    '== Nintendo ==', '=== Nintendo 64 ===', '{| class="wikitable"', '! Game !! Port name', '|-',
    "| ''Mega Man 64'' || [https://github.com/MegaMan64Recomp/MegaMan64Recompiled Mega Man 64 Recompiled] || Recompilation",
    '|-', '| [[Banjo-Kazooie]]', '| [https://github.com/BanjoRecomp/BanjoRecomp BanjoRecomp]', '| Recompilation', '|}',
    '=== Game Boy Advance ===', '{|', '|-', '| Sonic Advance 2 || [https://github.com/SAT-R/sa2 sa2] || Decompilation', '|}',
    '== Microsoft ==', '=== Windows ===', '{|', '|-', '| Carmageddon || [https://github.com/dethrace-labs/dethrace dethrace]', '|}',
    '=== Xbox 360 ===', '{|', '|-', '| Sonic Unleashed || [https://github.com/hedge-dev/UnleashedRecomp Unleashed Recompiled]', '|}',
  ].join('\n');
  const rows = R.parseWikitext(wt);
  assert.deepStrictEqual(rows.map((r) => [r.console, r.game, r.port]), [['n64', 'Mega Man 64', 'Mega Man 64 Recompiled'], ['n64', 'Banjo-Kazooie', 'BanjoRecomp'], ['gba', 'Sonic Advance 2', 'sa2'], ['xbox360', 'Sonic Unleashed', 'Unleashed Recompiled']]);
  assert.strictEqual(R.repoFromLink(rows[0].links[0]), 'github:MegaMan64Recomp/MegaMan64Recompiled');
  assert.strictEqual(R.repoFromLink('https://gitlab.com/sonicdcer/Starfox64Recomp/-/releases/'), 'gitlab:sonicdcer/Starfox64Recomp');
  assert.strictEqual(R.repoFromLink('https://github.com/topics/decompilation'), null);
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
function fakeWorld(entries) {
  const d = tmp(), data = path.join(d, 'data'), emu = path.join(d, 'Emulation'), home = path.join(d, 'home'), files = path.join(d, 'srv');
  for (const x of [data, emu, home, files]) fs.mkdirSync(x, { recursive: true });
  fs.writeFileSync(path.join(d, 'shipped.json'), JSON.stringify({ updated: '2026-10-09', entries }));
  const releases = [];
  const fetchImpl = async (url) => {
    if (/api\.github\.com\/repos\/.*\/releases/.test(url)) return { ok: true, status: 200, json: async () => releases };
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
  // a release with a Linux tar.gz holding Game/<program> and a data file
  const publish = (tag, text) => {
    const src = path.join(files, tag, 'Game'); fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, 'Game'), '#!/bin/sh\n' + text); fs.writeFileSync(path.join(src, 'assets.dat'), text);
    const tar = path.join(files, tag, 'Game-Linux-x64.tar.gz');
    execFileSync('tar', ['-czf', tar, '-C', path.join(files, tag), 'Game']);
    releases.unshift({ tag_name: tag, published_at: '2026-10-0' + releases.length, prerelease: false, draft: false, assets: [{ name: 'Game-Linux-x64.tar.gz', browser_download_url: 'file://' + tar, size: fs.statSync(tar).size }] });
  };
  const trashed = [];
  const eng = R.createRecomps({
    dataDir: data, shipped: path.join(d, 'shipped.json'), fetchImpl,
    download: async (url, dest, onBytes) => { const b = fs.readFileSync(url.replace('file://', '')); fs.writeFileSync(dest, b); onBytes(b.length); },
    unpackTo: async (a, out) => execFileSync('tar', ['-xf', a, '-C', out]),
    isElf: (f) => path.basename(f) === 'Game', isRunning: () => false,
    trash: async (p) => { trashed.push(p); fs.rmSync(p, { recursive: true, force: true }); },
    recompRoot: () => path.join(emu, 'recomp'), recompRoots: () => [path.join(emu, 'recomp')],
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
  const placed = { id: 'p', name: 'Placed', games: [{ title: 'P', console: 'gba' }], repo: 'github:o/p', builds: 'linux', program: 'Game', needs: { what: 'P (USA)', ext: ['gba'], md5: [md5] }, setup: { how: 'place', place: 'baserom.gba' }, done: 'baserom.gba' };
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

test('the daily refresh adds projects new on PCGamingWiki, quietly, once', async () => {
  const w = fakeWorld([{ id: 'u', name: 'Unleashed Recompiled', games: [{ title: 'Sonic Unleashed', console: 'xbox360' }], repo: 'github:hedge-dev/UnleashedRecomp' }]);
  const rows = R.parseWikitext(['=== Xbox 360 ===', '{|', '|-', '| Sonic Unleashed || [https://github.com/hedge-dev/UnleashedRecomp x]', '|-', '| Skate 3 || [https://github.com/mchughalex/skate3recomp Skate 3 Recomp]', '|}'].join('\n'));
  assert.strictEqual(await w.eng.addFound(rows, { search: null }), 1);
  assert.strictEqual(await w.eng.addFound(rows, { search: null }), 0);
  const e = w.eng.catalogue().entries.find((x) => x.repo === 'github:mchughalex/skate3recomp');
  assert.deepStrictEqual([e.from, e.auto, e.games[0].console], ['found', true, 'xbox360']);
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
