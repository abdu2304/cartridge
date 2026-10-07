// Saves on this device (0.9.29): each emulator's layout read from a fake home, then matched to games
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../electron/saves');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cart-saves-'));
const put = (rel, data = 'x') => { const f = path.join(home, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
// a PARAM.SFO with one TITLE string, laid out as Sony's format
function sfo(title) {
  const key = Buffer.from('TITLE\0\0\0'), val = Buffer.alloc(64); val.write(title);
  const h = Buffer.alloc(20 + 16);
  h.writeUInt32BE(0x00505346, 0); h.writeUInt32LE(0x101, 4); h.writeUInt32LE(36, 8); h.writeUInt32LE(36 + key.length, 12); h.writeUInt32LE(1, 16);
  h.writeUInt16LE(0, 20); h.writeUInt16LE(0x0204, 22); h.writeUInt32LE(title.length + 1, 24); h.writeUInt32LE(64, 28); h.writeUInt32LE(0, 32);
  return Buffer.concat([h, key, val]);
}
// Ryujinx's save index: IMKV, one IMEN entry (program ID -> save ID)
function imkv(program, save) {
  const k = Buffer.alloc(0x40), v = Buffer.alloc(0x40); k.writeBigUInt64LE(BigInt('0x' + program)); v.writeBigUInt64LE(BigInt('0x' + save));
  const head = Buffer.alloc(12); head.write('IMKV'); head.writeUInt32LE(1, 8);
  const e = Buffer.alloc(12); e.write('IMEN'); e.writeUInt32LE(0x40, 4); e.writeUInt32LE(0x40, 8);
  return Buffer.concat([head, e, k, v]);
}

put('.local/share/eden/nand/user/save/0000000000000000/AABBCCDDEEFF00112233445566778899/0100F2C0115B6000/save.dat', 'zelda');
put('.local/share/eden/nand/user/save/0000000000000000/AABBCCDDEEFF00112233445566778899/0000000000000000/x', 'system');
put('.cache/eden/game_list/0100F2C0115B6000.appname.txt', 'The Legend of Zelda: Tears of the Kingdom\n');
put('.config/Ryujinx/bis/system/save/8000000000000000/0/imkvdb.arc', imkv('01006A800016E000', '0000000000000005'));
put('.config/Ryujinx/bis/user/save/0000000000000005/0/data.bin', 'smash');
put('.config/rpcs3/dev_hdd0/home/00000001/savedata/BLUS30001-SAVE00/PARAM.SFO', sfo('Resistance'));
put('.config/rpcs3/dev_hdd0/home/00000001/savedata/BLUS30001-SAVE00/DATA.sync-conflict-20261004-101010-ZZZZZZZ.BIN');
put('.config/ppsspp/PSP/SAVEDATA/ULUS10041DATA/PARAM.SFO', sfo('Lumines'));
put('.local/share/Vita3K/Vita3K/ux0/user/00/savedata/PCSE00120/sdslot.dat');
// shadPS4 (0.9.57, from its save_instance.cpp): <its folder>/home/<user ID>/savedata/<serial>/<slot>; the old
// savedata/<user>/<serial> layout is still read
put('.local/share/shadPS4/home/1000/savedata/CUSA00900/SAVEDATA00/sce_sys/param.sfo', sfo('Bloodborne'));
put('.local/share/shadPS4/savedata/1/CUSA03173/SAVEDATA00/sce_sys/param.sfo', sfo('Bloodborne Old'));
const card = Buffer.alloc(8192); card.write('BASLUS-21050', 1024, 'latin1'); card.write('BESLES-50330', 4096, 'latin1');
put('.config/PCSX2/memcards/Mcd001.ps2', card);
put('.local/share/duckstation/memcards/SCUS-94163_1.mcd');
put('.local/share/duckstation/memcards/shared_card_1.mcd');
put('.local/share/dolphin-emu/GC/USA/Card A/01-GALE-SuperSmashBros0110.gci');
put('.local/share/dolphin-emu/Wii/title/00010000/52534245/data/save.bin'); // "RSBE"
put('.local/share/Cemu/mlc01/usr/save/00050000/101c9400/user/80000001/save.dat');
put('.local/share/Cemu/mlc01/usr/title/00050000/101c9400/meta/meta.xml', '<menu><longname_en type="string">The Legend of Zelda\nBreath of the Wild</longname_en></menu>');
put('.local/share/azahar-emu/sdmc/Nintendo 3DS/aaaa/bbbb/title/00040000/00055d00/data/00000001/main');
put('.local/share/Xenia/content/E030000012345678/4D5307E6/00000001/save.bin');
put('.config/retroarch/retroarch.cfg', 'savefile_directory = "default"\n');
put('.config/retroarch/saves/Super Mario World (USA).srm');

const saves = S.scan({ home });
const by = (emu) => saves.filter((s) => s.emu === emu);

test('Switch saves are read by title ID folder, system saves left out', () => {
  assert.deepStrictEqual(by('eden').map((s) => s.keys.switch), ['0100F2C0115B6000']);
  assert.strictEqual(by('eden')[0].size, 5);
  assert.strictEqual(by('eden')[0].label, 'The Legend of Zelda: Tears of the Kingdom'); // from Eden's game list cache
});
test('Ryujinx saves are named through its save index', () => {
  assert.deepStrictEqual(by('ryujinx').map((s) => s.keys.switch), ['01006A800016E000']);
});
test('PS3 and PSP saves give their serial and the title from PARAM.SFO', () => {
  assert.deepStrictEqual(by('rpcs3').map((s) => [s.keys.serial, s.label]), [['BLUS30001', 'Resistance']]);
  assert.strictEqual(by('rpcs3')[0].conflicts, 1); // a copy Syncthing kept when two devices changed it
  assert.deepStrictEqual(by('ppsspp').map((s) => [s.keys.serial, s.label]), [['ULUS10041', 'Lumines']]);
});
test('Vita, PS4, Cemu, Azahar and Xenia saves by title ID', () => {
  assert.deepStrictEqual(by('vita3k').map((s) => s.keys.serial), ['PCSE00120']);
  assert.deepStrictEqual(by('shadps4').map((s) => [s.keys.serial, s.label]), [['CUSA00900', 'Bloodborne'], ['CUSA03173', 'Bloodborne Old']]);
  assert.deepStrictEqual(by('cemu').map((s) => [s.keys.wiiu, s.label]), [['00050000101C9400', 'The Legend of Zelda Breath of the Wild']]);
  assert.deepStrictEqual(by('azahar').map((s) => s.keys.n3ds), ['0004000000055D00']);
  assert.deepStrictEqual(by('xenia').map((s) => s.keys.x360), ['4D5307E6']);
});
test('memory cards list the games saved on them', () => {
  assert.deepStrictEqual(by('pcsx2')[0].serials.sort(), ['SLES50330', 'SLUS21050']);
  assert.ok(by('pcsx2')[0].shared);
  const ds = by('duckstation');
  assert.deepStrictEqual(ds.find((s) => /SCUS/.test(s.label)).keys, { serial: 'SCUS94163' });
  assert.ok(ds.find((s) => /shared/.test(s.label)).shared);
});
test('Dolphin GCI files and Wii saves by game ID', () => {
  assert.deepStrictEqual(by('dolphin').map((s) => s.keys.gc).sort(), ['GALE', 'RSBE']);
});
test('RetroArch saves by game file name', () => {
  assert.deepStrictEqual(by('retroarch').map((s) => s.keys.name), ['Super Mario World (USA)']);
});
test('saves are matched to library games, cards to every game on them', () => {
  const games = [
    { id: 1, name: 'Zelda: Tears of the Kingdom', ids: ['0100F2C0115B6000'] },
    { id: 2, name: 'Smash Ultimate', ids: ['01006A800016E800'] }, // an update's ID: the save is the base game's
    { id: 3, name: 'Resistance', ids: ['BLUS-30001'] },
    { id: 4, name: 'Ratchet', ids: ['SLUS21050'] },
    { id: 5, name: 'Smash Melee', ids: [], discIds: ['GALE01'] },
    { id: 6, name: 'Super Mario World', ids: [] },
    { id: 7, name: 'Bloodborne', ids: [] },
  ];
  const m = S.match(saves, games);
  const ids = (emu) => m.filter((s) => s.emu === emu).flatMap((s) => s.romIds);
  assert.deepStrictEqual(ids('eden'), [1]);
  assert.deepStrictEqual(ids('ryujinx'), [2]);
  assert.deepStrictEqual(ids('rpcs3'), [3]);
  assert.deepStrictEqual(ids('pcsx2'), [4]);
  assert.deepStrictEqual(ids('dolphin'), [5]);
  assert.deepStrictEqual(ids('retroarch'), [6]);
  assert.deepStrictEqual(ids('shadps4'), [7]); // by its SFO title when the serial isn't known
});
test('nothing outside the save folders is touched', () => {
  const before = fs.readFileSync(path.join(home, '.config/PCSX2/memcards/Mcd001.ps2'));
  S.scan({ home });
  assert.ok(before.equals(fs.readFileSync(path.join(home, '.config/PCSX2/memcards/Mcd001.ps2'))));
});
