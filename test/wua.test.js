// Cemu .wua title IDs (0.9.63, owner: Mario Tennis Ultra Smash's Game Settings couldn't read its title ID). The
// fixture was packed with ZArchive's own tool (github.com/Exzap/ZArchive) from title folders named the way Cemu's
// converter names them (<title ID>_v<version>).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const W = require('../electron/wua');
const C = require('../electron/cemuPacks');

const FIX = path.join(__dirname, 'fixtures', 'mario-tennis.wua');

test('a .wua gives its titles’ IDs from the folder names, without unpacking', () => {
  assert.deepStrictEqual(W.titles(FIX), [{ id: '00050000101C9500', version: 0 }, { id: '0005000E101C9500', version: 32 }]);
  const notWua = path.join(os.tmpdir(), 'cart-not.wua'); fs.writeFileSync(notWua, Buffer.alloc(400));
  assert.deepStrictEqual(W.titles(notWua), []);
});

test('Cemu packs and game settings find a .wua game’s title ID, the file or its folder', () => {
  assert.ok(C.titleIds(FIX, '', '').includes('00050000101C9500'));
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cart-wua-')); fs.copyFileSync(FIX, path.join(d, 'Mario Tennis Ultra Smash.wua'));
  assert.ok(C.titleIds(d, '', '').includes('00050000101C9500'));
});
