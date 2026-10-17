// Cheat databases (0.9.71): RetroArch's game file from the libretro database (the path RetroArch's own cheat_manager.c
// loads, cheats kept field for field, apply_cheats_after_load turned on) and Switch cheats from switch-cheats-db in the
// mod folder Eden reads (patch_manager.cpp: <load>/<TID>/<mod>/cheats/<build ID>.txt). No network: fetch is faked.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const RC = require('../electron/raCheats');
const SC = require('../electron/switchCheats');

const CHT = 'cheats = 2\n\ncheat0_desc = "Infinite Lives"\ncheat0_code = "7E0DBE63"\ncheat0_enable = false\n\ncheat1_desc = "Moon Jump"\ncheat1_code = "7E007D00+7E007DFF"\ncheat1_enable = false\ncheat1_handler = 1\n';
const fakeFetch = (map) => async (url) => { const k = Object.keys(map).find((x) => url.includes(x)); return k ? { ok: true, status: 200, text: async () => map[k], json: async () => JSON.parse(map[k]) } : { ok: false, status: 404 }; };

test('libretro: the index matches a game by its file name, then by title; systems by RomM slug', () => {
  const idx = { systems: { 'Nintendo - Super Nintendo Entertainment System': ['Super Mario World (USA)', 'Super Mario World (USA) (Game Genie)', 'Super Mario World 2 - Yoshi\'s Island (USA)', 'Zelda'] } };
  assert.strictEqual(RC.systemOf(['snes']), 'Nintendo - Super Nintendo Entertainment System');
  assert.strictEqual(RC.systemOf(['genesis-slash-megadrive']), 'Sega - Mega Drive - Genesis');
  assert.strictEqual(RC.systemOf(['switch']), null);
  assert.deepStrictEqual(RC.filesFor('Nintendo - Super Nintendo Entertainment System', ['Super Mario World (USA).sfc'], idx), ['Super Mario World (USA)', 'Super Mario World (USA) (Game Genie)']);
  // the shipped index is real and readable
  assert.ok(RC.filesFor('Nintendo - Super Nintendo Entertainment System', ['Super Mario World (USA).sfc']).includes('Super Mario World (USA)'));
});

test('libretro: picked cheats go to <cheats>/<core>/<game>.cht, whole, and RetroArch is told to apply them', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'racht-'));
  const cfgFile = path.join(home, 'retroarch.cfg'); fs.writeFileSync(cfgFile, 'video_driver = "vulkan"\ncheat_database_path = ":/cheats"\n');
  assert.strictEqual(RC.cheatDir(home, fs.readFileSync(cfgFile, 'utf8')), path.join(home, 'cheats'));
  assert.strictEqual(RC.cheatDir(home, 'cheat_database_path = "default"'), path.join(home, 'cheats'));
  const dir = { cheats: path.join(home, 'cheats'), coreName: 'Snes9x', content: 'Super Mario World (USA)', system: 'Nintendo - Super Nintendo Entertainment System', files: ['Super Mario World (USA)'] };
  const opts = { fetchImpl: fakeFetch({ 'Super%20Mario%20World%20(USA).cht': CHT }), cacheDir: path.join(home, 'cache') };
  const all = await RC.list(dir, {}, opts);
  assert.deepStrictEqual(all.map((c) => [c.name, c.on]), [['Infinite Lives', false], ['Moon Jump', false]]);
  const mine = RC.set(dir, all, [{ key: all[1].key, on: true }], {});
  const f = path.join(home, 'cheats', 'Snes9x', 'Super Mario World (USA).cht');
  const back = RC.parse(fs.readFileSync(f, 'utf8'));
  assert.deepStrictEqual(back, [{ desc: 'Moon Jump', code: '7E007D00+7E007DFF', enable: 'true', handler: '1' }]);
  assert.ok(mine[all[1].key]);
  assert.strictEqual(RC.ensureApply(cfgFile), true);
  assert.match(fs.readFileSync(cfgFile, 'utf8'), /^apply_cheats_after_load = "true"$/m);
  assert.strictEqual(RC.ensureApply(cfgFile), false);
  // listed as on, then off again: the file Cartridge made goes
  const again = await RC.list(dir, mine, opts);
  assert.strictEqual(again.find((c) => c.name === 'Moon Jump').by, 'cartridge');
  RC.set(dir, again, [{ key: all[1].key, on: false }], mine);
  assert.ok(!fs.existsSync(f));
  // a cheat you put there yourself is kept when Cartridge's is turned off
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, RC.build([{ desc: 'Mine', code: '7E000000', enable: 'true' }]));
  const withMine = await RC.list(dir, {}, opts);
  const m2 = RC.set(dir, withMine, [{ key: withMine.find((c) => c.name === 'Infinite Lives').key, on: true }], {});
  RC.set(dir, await RC.list(dir, m2, opts), [{ key: withMine.find((c) => c.name === 'Infinite Lives').key, on: false }], m2);
  assert.deepStrictEqual(RC.parse(fs.readFileSync(f, 'utf8')).map((c) => c.desc), ['Mine']);
});

test('Switch: chosen cheats written per build ID into one mod folder, gone when none are on', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nxcht-'));
  const tid = '01007EF00011E000', mods = path.join(home, 'load', tid);
  const db = { '16A91992BBA71201': { '[Infinite Health]': '[Infinite Health]\n580F0000 025ce340\n', '[Infinite Rupees]': '[Infinite Rupees]\n04000000 01234567 0000270F\n' }, 'ABCDEF0123456789': { '[Infinite Health]': '[Infinite Health]\n580F0000 99999999\n' } };
  const got = await SC.download(tid, { fetchImpl: fakeFetch({ [`${tid}.json`]: JSON.stringify(db) }), cacheDir: path.join(home, 'cache') });
  assert.deepStrictEqual(got, db);
  const rows = SC.list(mods, tid, db);
  assert.deepStrictEqual(rows.map((r) => [r.name, r.version]), [['Infinite Health', '2 versions'], ['Infinite Rupees', 'One version']]);
  const mine = SC.set(mods, tid, db, [{ key: rows[0].key, on: true }], {});
  const cdir = path.join(mods, 'Cartridge Cheats', 'cheats');
  assert.deepStrictEqual(fs.readdirSync(cdir).sort(), ['16A91992BBA71201.txt', 'ABCDEF0123456789.txt']);
  assert.strictEqual(fs.readFileSync(path.join(cdir, 'ABCDEF0123456789.txt'), 'utf8'), '[Infinite Health]\n580F0000 99999999\n');
  assert.ok(SC.list(mods, tid, db, mine)[0].on);
  SC.set(mods, tid, db, [{ key: rows[0].key, on: false }], mine);
  assert.ok(!fs.existsSync(path.join(mods, 'Cartridge Cheats')));
  // an unknown game: an empty answer, remembered
  assert.deepStrictEqual(await SC.download('0100000000001000', { fetchImpl: fakeFetch({}), cacheDir: path.join(home, 'cache') }), {});
});
