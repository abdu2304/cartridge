// Game names from their codes (0.9.57): PCSX2's GameIndex.yaml and DuckStation's gamedb.yaml give a code's name, and
// that name finds the game in the library when the game isn't on this device (saves, memory cards, Syncthing textures)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = require('../electron/titleDb');
const S = require('../electron/saves');
const ST = require('../electron/syncthing');

const YAML = `# PCSX2 Game Database
SCUS-97481:
  name: "God of War II"
  region: "NTSC-U"
  compat: 5
SLPM-66275:
  name: "ゴッド・オブ・ウォー"
  name-en: "God of War (Japan)"
  region: "NTSC-J"
SLUS-20946:
  name: "Grand Theft Auto - San Andreas"
  roundModes:
    eeRoundMode: 0
`;

test('the databases give a code its name (the English one when there is one)', () => {
  const n = T.parse(YAML);
  assert.strictEqual(n.SCUS97481, 'God of War II');
  assert.strictEqual(n.SLPM66275, 'God of War (Japan)');
  assert.strictEqual(n.SLUS20946, 'Grand Theft Auto - San Andreas');
  assert.strictEqual(Object.keys(n).length, 3);
});

test('the emulator’s own copy is read, else downloaded once and kept', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cart-titles-'));
  try {
    const big = Array.from({ length: 150 }, (_, i) => `SLUS-${String(20000 + i).padStart(5, '0')}:\n  name: "Game ${i}"\n`).join('') + YAML;
    let asked = 0;
    const db = T.createTitleDb({ dataDir: dir, home: dir, fetchImpl: async () => { asked++; return { ok: true, text: async () => big }; } });
    await db.ready();
    assert.strictEqual(db.nameOf('SCUS-97481'), 'God of War II');
    assert.strictEqual(db.nameOf('slus20946'), 'Grand Theft Auto - San Andreas');
    assert.strictEqual(asked, 2, 'PS2 and PS1 files, once each');
    const again = T.createTitleDb({ dataDir: dir, home: dir, fetchImpl: async () => { asked++; throw new Error('offline'); } });
    await again.ready();
    assert.strictEqual(again.nameOf('SCUS97481'), 'God of War II', 'kept on disk');
    assert.strictEqual(asked, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a save or a card entry finds its game by the code’s name when the game isn’t downloaded', () => {
  const names = T.parse(YAML), nameOf = (c) => names[T.key(c)] || null;
  const games = [{ id: 1, name: 'God of War II', ids: [] }, { id: 2, name: 'Grand Theft Auto: San Andreas', ids: [] }];
  const saves = [{ emu: 'pcsx2', keys: {}, serials: ['SCUS97481', 'SLUS20946', 'SLUS99999'] }, { emu: 'duckstation', keys: { serial: 'SCUS-97481' } }];
  S.match(saves, games, { nameOf });
  assert.deepStrictEqual(saves[0].romIds.sort(), [1, 2], 'every game on the card');
  assert.deepStrictEqual(saves[1].romIds, [1]);
  assert.strictEqual(saves[1].codeName, 'God of War II');
  assert.deepStrictEqual(S.match([{ keys: { serial: 'SCUS-97481' } }], games)[0].romIds, [], 'without the names nothing matches');
});

test('Syncthing texture folders named by code find their game by name', () => {
  const names = T.parse(YAML), nameOf = (c) => names[T.key(c)] || null;
  const games = [{ id: 7, name: 'Grand Theft Auto: San Andreas', ids: [] }];
  const folders = [{ id: 'tex', label: 'PS2 Textures', path: '/t', files: [{ path: 'SLUS-20946/replacements/a.png', size: 10, at: 1 }] }];
  assert.deepStrictEqual(Object.keys(ST.matchGames(games, folders)), []);
  assert.deepStrictEqual(Object.keys(ST.matchGames(games, folders, { nameOf })), ['7']);
});

test('a save’s title ends at its first NUL (a PSP title read past its end)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cart-sfo-'));
  try {
    const key = Buffer.from('TITLE\0\0\0'), val = Buffer.alloc(64);
    Buffer.concat([Buffer.from('Ratchet & Clank: Size Matters™', 'utf8'), Buffer.from([0, 0xff, 0xfe]), Buffer.from('ENTR')]).copy(val);
    const h = Buffer.alloc(36);
    h.writeUInt32BE(0x00505346, 0); h.writeUInt32LE(0x101, 4); h.writeUInt32LE(36, 8); h.writeUInt32LE(36 + key.length, 12); h.writeUInt32LE(1, 16);
    h.writeUInt16LE(0, 20); h.writeUInt16LE(0x0204, 22); h.writeUInt32LE(64, 24); h.writeUInt32LE(64, 28); h.writeUInt32LE(0, 32);
    fs.writeFileSync(path.join(dir, 'PARAM.SFO'), Buffer.concat([h, key, val]));
    assert.strictEqual(S.sfo(path.join(dir, 'PARAM.SFO')).TITLE, 'Ratchet & Clank: Size Matters™');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
