// The save locator (0.9.59): every layout and setting each emulator uses for saves, read from a fake home. Each case
// is one way a real device keeps saves (EmuDeck, Flatpak, a setting that moves them, a folder moved to a microSD and
// linked back, an older build's layout); the place in use must be found and named 'use', the rest 'old'.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../electron/saves');
const SS = require('../electron/saveSync');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cart-locate-'));
let n = 0;
const fresh = () => { const h = path.join(root, 'h' + n++); fs.mkdirSync(h, { recursive: true }); return h; };
const mk = (p) => { fs.mkdirSync(p, { recursive: true }); return p; };
const put = (f, data = 'x') => { mk(path.dirname(f)); fs.writeFileSync(f, data); return f; };
const ps4Save = (dir) => put(path.join(dir, 'SPRJ0005/data.bin'));
const found = (home, emu) => S.scan({ home, withSize: false }).filter((s) => s.emu === emu);
const where = (list) => list.map((s) => `${s.loc}:${s.why}`).sort().join(' ');

test('shadPS4: current build, older build, links, both settings, Flatpak', () => {
  let h = fresh(), b = path.join(h, '.local/share/shadPS4');
  // current build (config.json), saves in home/1000/savedata, an older copy left in savedata/1
  put(path.join(b, 'config.json'), '{}'); ps4Save(path.join(b, 'home/1000/savedata/CUSA00900')); ps4Save(path.join(b, 'savedata/1/CUSA00001'));
  let l = found(h, 'shadps4');
  assert.deepStrictEqual(l.map((s) => s.keys.serial + ':' + s.loc).sort(), ['CUSA00001:old', 'CUSA00900:use']);
  assert.strictEqual(l.find((s) => s.loc === 'old').why, 'older');

  // updated: savedata/1 left as a link to the new folder = one save, in use
  h = fresh(); b = path.join(h, '.local/share/shadPS4');
  put(path.join(b, 'config.json'), '{}'); ps4Save(path.join(b, 'home/1000/savedata/CUSA00900'));
  mk(path.join(b, 'savedata')); fs.symlinkSync(path.join(b, 'home/1000/savedata'), path.join(b, 'savedata/1'));
  assert.strictEqual(where(found(h, 'shadps4')), 'use:default');

  // home/1000 moved to a microSD and linked back
  h = fresh(); b = path.join(h, '.local/share/shadPS4');
  put(path.join(b, 'config.json'), '{}'); ps4Save(path.join(h, 'sd/u1000/savedata/CUSA00900'));
  mk(path.join(b, 'home')); fs.symlinkSync(path.join(h, 'sd/u1000'), path.join(b, 'home/1000'));
  assert.strictEqual(where(found(h, 'shadps4')), 'use:default');

  // one game's save folder is a link
  h = fresh(); b = path.join(h, '.local/share/shadPS4');
  put(path.join(b, 'config.json'), '{}'); ps4Save(path.join(h, 'sd/CUSA00900')); mk(path.join(b, 'home/1000/savedata'));
  fs.symlinkSync(path.join(h, 'sd/CUSA00900'), path.join(b, 'home/1000/savedata/CUSA00900'));
  assert.strictEqual(found(h, 'shadps4').length, 1);

  // home_dir moves the PS4 home; the default home is then an old place
  h = fresh(); b = path.join(h, '.local/share/shadPS4');
  put(path.join(b, 'config.json'), JSON.stringify({ General: { home_dir: path.join(h, 'ps4home') } }));
  ps4Save(path.join(h, 'ps4home/1000/savedata/CUSA00900')); ps4Save(path.join(b, 'home/1000/savedata/CUSA00002'));
  assert.strictEqual(where(found(h, 'shadps4')), 'old:unused use:setting');

  // an older build (config.toml) with saveDataPath elsewhere
  h = fresh(); b = path.join(h, '.local/share/shadPS4');
  put(path.join(b, 'config.toml'), `[GUI]\nsaveDataPath = "${path.join(h, 'ps4saves')}"\n`);
  ps4Save(path.join(h, 'ps4saves/1/CUSA00900'));
  assert.strictEqual(where(found(h, 'shadps4')), 'use:setting');

  // an older build with its default folder
  h = fresh(); b = path.join(h, '.local/share/shadPS4');
  put(path.join(b, 'config.toml'), '[GUI]\n'); ps4Save(path.join(b, 'savedata/1/CUSA00900'));
  assert.strictEqual(where(found(h, 'shadps4')), 'use:default');

  // Flatpak, never started (no settings): every layout counts
  h = fresh(); ps4Save(path.join(h, '.var/app/net.shadps4.shadPS4/data/shadPS4/home/1000/savedata/CUSA00900'));
  assert.strictEqual(where(found(h, 'shadps4')), 'use:default');
});

test('shadPS4 placing: current build to home/<user>/savedata, older build to savedata/<user>', () => {
  let h = fresh(), b = path.join(h, '.local/share/shadPS4');
  put(path.join(b, 'config.json'), '{}'); mk(path.join(b, 'home/1000/savedata'));
  assert.strictEqual(SS.placeFor('shadps4', 'ps4:CUSA00900', { home: h }), path.join(b, 'home/1000/savedata/CUSA00900'));
  h = fresh(); b = path.join(h, '.local/share/shadPS4');
  put(path.join(b, 'config.toml'), '[GUI]\n'); mk(path.join(b, 'savedata'));
  assert.strictEqual(SS.placeFor('shadps4', 'ps4:CUSA00900', { home: h }), path.join(b, 'savedata/1/CUSA00900'));
});

test('Eden: save_directory, then nand_directory, then nand; Qt section names', () => {
  const tid = '0100F2C0115B6000';
  let h = fresh();
  put(path.join(h, '.config/eden/qt-config.ini'), `[Data%20Storage]\nnand_directory\\default=false\nnand_directory=${path.join(h, 'sd/nand')}\n`);
  mk(path.join(h, 'sd/nand/user/save/0000000000000000/AAAA', tid)); mk(path.join(h, '.local/share/eden/nand/user/save/0000000000000000/AAAA', '0100000000010000'));
  let l = found(h, 'eden');
  assert.deepStrictEqual(l.map((s) => s.keys.switch + ':' + s.loc).sort(), ['0100000000010000:old', tid + ':use']);
  assert.strictEqual(SS.placeFor('eden', 'switch:' + tid, { home: h }), path.join(h, 'sd/nand/user/save/0000000000000000/AAAA', tid));
  // save_directory wins over nand_directory
  h = fresh();
  put(path.join(h, '.config/eden/qt-config.ini'), `[Data%20Storage]\nnand_directory=${path.join(h, 'a')}\nsave_directory=${path.join(h, 'b')}\n`);
  mk(path.join(h, 'b/user/save/0000000000000000/AAAA', tid)); mk(path.join(h, '.local/share/eden'));
  assert.strictEqual(found(h, 'eden')[0].why, 'setting');
  // Flatpak keeps its settings in its own config folder
  h = fresh();
  put(path.join(h, '.var/app/dev.eden_emu.eden/config/eden/qt-config.ini'), `[Data%20Storage]\nnand_directory=${path.join(h, 'x')}\n`);
  mk(path.join(h, 'x/user/save/0000000000000000/AAAA', tid)); mk(path.join(h, '.var/app/dev.eden_emu.eden/data/eden'));
  assert.strictEqual(found(h, 'eden')[0].loc, 'use');
});

test('RPCS3 vfs.yml, PCSX2 and DuckStation memory card folders, Cemu mlc_path, Azahar custom storage, Vita3K pref-path', () => {
  // RPCS3: dev_hdd0 moved, with $(EmulatorDir)
  let h = fresh(), b = path.join(h, '.config/rpcs3');
  put(path.join(b, 'config/vfs.yml'), `$(EmulatorDir): "${path.join(h, 'ps3')}/"\n/dev_hdd0/: $(EmulatorDir)hdd0/\n`);
  mk(path.join(h, 'ps3/hdd0/home/00000001/savedata/BLUS30001'));
  assert.strictEqual(where(found(h, 'rpcs3')), 'use:setting');
  assert.strictEqual(SS.placeFor('rpcs3', 'ps3:BLUS30002', { home: h }), path.join(h, 'ps3/hdd0/home/00000001/savedata/BLUS30002'));

  // PCSX2: a relative and an absolute MemoryCards folder
  h = fresh(); b = path.join(h, '.config/PCSX2');
  put(path.join(b, 'inis/PCSX2.ini'), '[Folders]\nMemoryCards = cards\n'); put(path.join(b, 'cards/Mcd001.ps2'));
  assert.strictEqual(found(h, 'pcsx2')[0].path, path.join(b, 'cards/Mcd001.ps2'));
  h = fresh(); b = path.join(h, '.config/PCSX2');
  put(path.join(b, 'inis/PCSX2.ini'), `[Folders]\nMemoryCards = ${path.join(h, 'Emulation/saves/pcsx2/saves')}\n`); put(path.join(h, 'Emulation/saves/pcsx2/saves/Mcd001.ps2')); put(path.join(b, 'memcards/Mcd001.ps2'), 'old');
  assert.strictEqual(where(found(h, 'pcsx2')), 'old:unused use:setting');
  assert.strictEqual(SS.placeFor('pcsx2', 'ps2card:Mcd002.ps2', { home: h }), path.join(h, 'Emulation/saves/pcsx2/saves/Mcd002.ps2'));

  // DuckStation: [MemoryCards] Directory
  h = fresh(); b = path.join(h, '.local/share/duckstation');
  put(path.join(b, 'settings.ini'), `[MemoryCards]\nDirectory = ${path.join(h, 'mc')}\n`); put(path.join(h, 'mc/SLUS-00594_1.mcd'));
  assert.strictEqual(found(h, 'duckstation')[0].keys.serial, 'SLUS00594');

  // Cemu: mlc_path in settings.xml
  h = fresh();
  put(path.join(h, '.config/Cemu/settings.xml'), `<?xml version="1.0"?>\n<content>\n<mlc_path>${path.join(h, 'sd/mlc01')}</mlc_path>\n</content>\n`);
  mk(path.join(h, 'sd/mlc01/usr/save/00050000/101c9500')); mk(path.join(h, '.local/share/Cemu'));
  assert.strictEqual(where(found(h, 'cemu')), 'use:setting');

  // Azahar: sdmc_directory only counts with use_custom_storage=true
  h = fresh();
  const n3 = (d) => mk(path.join(d, 'Nintendo 3DS/id0/id1/title/00040000/00030700/data'));
  put(path.join(h, '.config/azahar-emu/qt-config.ini'), `[Data%20Storage]\nuse_custom_storage=false\nsdmc_directory=${path.join(h, 'sd')}\n`);
  n3(path.join(h, 'sd')); n3(path.join(h, '.local/share/azahar-emu/sdmc'));
  assert.strictEqual(found(h, 'azahar')[0].path.startsWith(path.join(h, '.local/share/azahar-emu')), true);
  fs.writeFileSync(path.join(h, '.config/azahar-emu/qt-config.ini'), `[Data%20Storage]\nuse_custom_storage=true\nsdmc_directory=${path.join(h, 'sd')}/\n`);
  assert.strictEqual(where(found(h, 'azahar')), 'old:unused use:setting');

  // Vita3K: pref-path in its config folder
  h = fresh();
  put(path.join(h, '.config/Vita3K/config.yml'), `pref-path: ${path.join(h, 'vfs')}/\n`);
  mk(path.join(h, 'vfs/ux0/user/00/savedata/PCSE00001')); mk(path.join(h, '.local/share/Vita3K/Vita3K'));
  assert.strictEqual(where(found(h, 'vita3k')), 'use:setting');
});

test('Dolphin: NANDRootPath moves Wii saves; GCI folders and card files from settings keep their region', () => {
  const h = fresh(), b = path.join(h, '.local/share/dolphin-emu');
  put(path.join(h, '.config/dolphin-emu/Dolphin.ini'), `[General]\nNANDRootPath = ${path.join(h, 'nand')}\n[Core]\nGCIFolderAPath = ${path.join(h, 'gci/USA')}\nMemcardBPath = ${path.join(h, 'cards/MemoryCardB.EUR.raw')}\n`);
  mk(path.join(h, 'nand/title/00010000/52534245/data')); mk(path.join(b, 'Wii/title/00010000/52534245/data'));
  put(path.join(h, 'gci/USA/01-GALE-SuperSmashBros0110290334.gci')); put(path.join(h, 'cards/MemoryCardB.EUR.raw'));
  const l = found(h, 'dolphin');
  const gci = l.find((s) => s.path.endsWith('.gci')), card = l.find((s) => s.kind === 'card'), wii = l.filter((s) => s.keys.gc === 'RSBE');
  assert.strictEqual(SS.shape(gci).key, 'gc:USA/01-GALE-SuperSmashBros0110290334.gci');
  assert.strictEqual(SS.shape(card).key, 'gccard:EUR/MemoryCardB.EUR.raw');
  assert.deepStrictEqual(wii.map((s) => s.loc).sort(), ['old', 'use']);
  assert.strictEqual(SS.placeFor('dolphin', 'gc:USA/01-GMSE-x.gci', { home: h }), path.join(h, 'gci/USA/01-GMSE-x.gci'));
});

test('Save Sync syncs only saves in use, keeps the newest of two copies, and writes through links', () => {
  // an old shadPS4 copy is never a unit; two copies in use (AppImage and Flatpak PCSX2): the newer one wins
  const h = fresh(), b = path.join(h, '.local/share/shadPS4');
  put(path.join(b, 'config.json'), '{}'); ps4Save(path.join(b, 'home/1000/savedata/CUSA00900')); ps4Save(path.join(b, 'savedata/1/CUSA00001'));
  const older = put(path.join(h, '.config/PCSX2/memcards/Mcd001.ps2'), 'a'), newer = put(path.join(h, '.var/app/net.pcsx2.PCSX2/config/PCSX2/memcards/Mcd001.ps2'), 'b');
  fs.utimesSync(older, new Date(2020, 1, 1), new Date(2020, 1, 1));
  const us = SS.units({ home: h });
  assert.deepStrictEqual(us.filter((u) => u.emu === 'shadps4').map((u) => u.key), ['ps4:CUSA00900']);
  const card = us.find((u) => u.key === 'ps2card:Mcd001.ps2');
  assert.strictEqual(card.path, newer);
  assert.strictEqual(card.others[0].path, older);

  // a save folder that is a link to another drive: written there, the link stays
  const real = path.join(h, 'sd/CUSA00900'); ps4Save(real);
  const link = path.join(h, 'link/CUSA00900'); mk(path.dirname(link)); fs.symlinkSync(real, link);
  SS.writeUnit({ key: 'ps4:CUSA00900', kind: 'dir', path: link }, [['SPRJ0005/', null], ['SPRJ0005/data.bin', Buffer.from('new')]], link, path.join(h, 'backups'));
  assert.ok(fs.lstatSync(link).isSymbolicLink());
  assert.strictEqual(fs.readFileSync(path.join(real, 'SPRJ0005/data.bin'), 'utf8'), 'new');
});

test('ini reading: Qt sections, quotes, keys with a default flag beside them', () => {
  const t = '[Data%20Storage]\nnand_directory\\default=false\nnand_directory="/a b/c"\n[Other]\nnand_directory=/no\n';
  assert.strictEqual(S.iniGet(t, 'Data Storage', 'nand_directory'), '/a b/c');
  assert.strictEqual(S.iniGet(t, 'Missing', 'x'), '');
});

test('Search for Saves: finds save folders of every kind away from the usual places, skips known ones and Cartridge\'s own', async () => {
  const SR = require('../electron/saveSearch');
  const h = fresh();
  ps4Save(path.join(h, 'Games/shadPS4-portable/user/home/1000/savedata/CUSA00900'));
  mk(path.join(h, 'Old/yuzu/nand/user/save/0000000000000000/AAAA/0100F2C0115B6000'));
  mk(path.join(h, 'Backup/rpcs3/dev_hdd0/home/00000001/savedata/BLUS30001'));
  put(path.join(h, 'Cards/Mcd001.ps2')); put(path.join(h, 'Cards/old.mcd'));
  mk(path.join(h, 'Wii U/mlc01/usr/save/00050000/101c9500'));
  mk(path.join(h, 'x/ux0/user/00/savedata/PCSE00001'));
  mk(path.join(h, 'node_modules/y/ux0/user/00/savedata/PCSE00002')); // never walked
  ps4Save(path.join(h, 'Cartridge/savedata/CUSA00009')); // Cartridge's own folder: skipped
  const known = new Set([fs.realpathSync(path.join(h, 'x/ux0/user/00/savedata/PCSE00001'))]);
  const r = await SR.search({ roots: [h], known, skip: [path.join(h, 'Cartridge')] });
  assert.strictEqual(r.done, true);
  assert.deepStrictEqual(r.found.map((x) => x.emu).sort(), ['cemu', 'duckstation', 'pcsx2', 'rpcs3', 'shadps4', 'yuzu']);
  assert.strictEqual(r.found.find((x) => x.emu === 'shadps4').list[0].keys.serial, 'CUSA00900');
  // the time limit stops it and says so
  const cut = await SR.search({ roots: [h], budget: { dirs: 3 } });
  assert.strictEqual(cut.done, false);
});

test('Move: old copies go into the place in use, a newer copy in use is kept, nothing is deleted', () => {
  const h = fresh(), b = path.join(h, '.local/share/shadPS4');
  put(path.join(b, 'config.json'), '{}');
  put(path.join(b, 'savedata/1/CUSA00001/SPRJ0005/data.bin'), 'old only');
  put(path.join(b, 'savedata/1/CUSA00002/SPRJ0005/data.bin'), 'older');
  const inUse = put(path.join(b, 'home/1000/savedata/CUSA00002/SPRJ0005/data.bin'), 'newer');
  fs.utimesSync(path.join(b, 'savedata/1/CUSA00002/SPRJ0005/data.bin'), new Date(2020, 1, 1), new Date(2020, 1, 1));
  const old = S.scan({ home: h, withSize: false }).filter((s) => s.loc === 'old');
  const r = SS.moveInto(old, { home: h, backupsRoot: path.join(h, 'backups') });
  assert.deepStrictEqual(r.map((x) => x.key + ':' + x.result).sort(), ['ps4:CUSA00001:moved', 'ps4:CUSA00002:newer']);
  assert.strictEqual(fs.readFileSync(path.join(b, 'home/1000/savedata/CUSA00001/SPRJ0005/data.bin'), 'utf8'), 'old only');
  assert.strictEqual(fs.readFileSync(inUse, 'utf8'), 'newer');
  assert.ok(fs.existsSync(path.join(b, 'savedata/1/CUSA00001.cartridge-moved/SPRJ0005/data.bin'))); // kept, renamed
  assert.deepStrictEqual(S.scan({ home: h, withSize: false }).filter((s) => s.loc === 'old').map((s) => s.keys.serial), ['CUSA00002']);
});

// a PARAM.SFO with the given string fields, laid out as Sony's format
function sfoBuf(fields) {
  const ents = Object.entries(fields);
  let keys = Buffer.alloc(0), data = Buffer.alloc(0);
  const idx = ents.map(([k, v]) => { const ko = keys.length; keys = Buffer.concat([keys, Buffer.from(k + '\0')]); const val = Buffer.alloc(64); val.write(v); const off = data.length; data = Buffer.concat([data, val]); return { ko, len: v.length + 1, off }; });
  const head = 20 + ents.length * 16, h = Buffer.alloc(head);
  h.writeUInt32BE(0x00505346, 0); h.writeUInt32LE(0x101, 4); h.writeUInt32LE(head, 8); h.writeUInt32LE(head + keys.length, 12); h.writeUInt32LE(ents.length, 16);
  idx.forEach((e, i) => { const o = 20 + i * 16; h.writeUInt16LE(e.ko, o); h.writeUInt16LE(0x0204, o + 2); h.writeUInt32LE(e.len, o + 4); h.writeUInt32LE(64, o + 8); h.writeUInt32LE(e.off, o + 12); });
  return Buffer.concat([h, keys, data]);
}

test('PS4 games read their title ID: a folder game (or the folder inside it) and a .pkg header', () => {
  const G = require('../electron/gameId');
  const h = fresh();
  put(path.join(h, 'Bloodborne/sce_sys/param.sfo'), sfoBuf({ TITLE_ID: 'CUSA00900', TITLE: 'Bloodborne' }));
  assert.deepStrictEqual(G.ps4Ids(path.join(h, 'Bloodborne')), ['CUSA00900']);
  put(path.join(h, 'Wrap/CUSA03173/sce_sys/param.sfo'), sfoBuf({ CONTENT_ID: 'UP9000-CUSA03173_00-BLOODBORNE0000EU' }));
  assert.deepStrictEqual(G.ps4Ids(path.join(h, 'Wrap')), ['CUSA03173']);
  const pkg = Buffer.alloc(0x100); pkg.writeUInt32BE(0x7F434E54, 0); pkg.write('EP9000-CUSA00207_00-BLOODBORNE0000EU', 0x40, 'latin1');
  put(path.join(h, 'game.pkg'), pkg);
  assert.deepStrictEqual(G.ps4Ids(path.join(h, 'game.pkg')), ['CUSA00207']);
  put(path.join(h, 'bad.pkg'), Buffer.alloc(0x100));
  assert.deepStrictEqual(G.ps4Ids(path.join(h, 'bad.pkg')), []);
});

test('Saves match by name on their own console only, and only when one game fits', () => {
  const games = [
    { id: 1, name: 'Bloodborne: The Old Hunters Edition', slug: 'ps4', ids: [] },
    { id: 2, name: 'Bloodborne', slug: 'ps3', ids: [] }, // another console: never
    { id: 3, name: 'Dark Souls II', slug: 'ps4', ids: [] }, { id: 4, name: 'Dark Souls III', slug: 'ps4', ids: [] },
  ];
  const saves = [
    { emu: 'shadps4', keys: { serial: 'CUSA00900', title: 'Bloodborne' } },
    { emu: 'shadps4', keys: { serial: 'CUSA01234', title: 'Dark Souls' } }, // two games fit: none
  ];
  S.match(saves, games);
  assert.deepStrictEqual(saves[0].romIds, [1]);
  assert.strictEqual(saves[0].loose, true);
  assert.deepStrictEqual(saves[1].romIds, []);
});
