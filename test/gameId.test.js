// The game identity engine (0.9.48): IDs from names and from the game itself, cached by file version, and the
// matching order every feature now shares (ID, then the same title, then one title that starts the other).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { createIdentity, norm } = require('../electron/gameId');

function setup(extractCalls) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gid-'));
  const iso = path.join(dir, 'Some Game.iso'); fs.writeFileSync(iso, 'x');
  const roms = [
    { id: 30, name: "Demon's Souls", fs_name: "Demon's Souls (USA).pkg", platform_slug: 'ps3' },
    { id: 12, name: "Demon's Souls", fs_name: "Demon's Souls (Europe).iso", platform_slug: 'ps3' },
    { id: 40, name: 'Some Game', fs_name: 'Some Game.iso', platform_slug: 'ps3' },
    { id: 50, name: 'Ratchet & Clank', fs_name: 'Ratchet and Clank [BCUS98137].iso', platform_slug: 'ps3' },
    { id: 60, name: 'Ratchet & Clank', fs_name: 'Ratchet [SCUS97199].iso', platform_slug: 'ps2' },
  ];
  const where = { 40: iso };
  const id = createIdentity({ file: path.join(dir, 'ids.json'), roms: () => roms, whereOf: (x) => where[x] || '', extract: (r, w) => { extractCalls.push(w); return r.id === 40 ? ['bles-00001'] : []; } });
  return { id, iso, dir };
}

test('serials in names and IDs read from the game both count', () => {
  const calls = [], { id } = setup(calls);
  assert.deepStrictEqual(id.findRom({ ids: ['BCUS98137'], slugs: ['ps3'] }), { id: 50, by: 'id' });
  assert.deepStrictEqual(id.findRom({ ids: ['BLES00001'] }), { id: 40, by: 'id' }); // read from the file, normalised
});

test('a game is read once per file version', () => {
  const calls = [], { id, iso } = setup(calls);
  id.idsOf({ id: 40, name: 'Some Game', platform_slug: 'ps3' });
  id.bump(); id.idsOf({ id: 40, name: 'Some Game', platform_slug: 'ps3' });
  assert.strictEqual(calls.length, 1);
  fs.writeFileSync(iso, 'xx'); id.bump(); id.idsOf({ id: 40, name: 'Some Game', platform_slug: 'ps3' });
  assert.strictEqual(calls.length, 2);
});

test('same title gives the oldest copy, and consoles are kept apart', () => {
  const { id } = setup([]);
  assert.deepStrictEqual(id.findRom({ title: "Demon's Souls™ Trophies", slugs: ['ps3'] }), { id: 12, by: 'name' });
  assert.deepStrictEqual(id.findRom({ ids: ['SCUS97199'], slugs: ['ps3'] }), null);
  assert.deepStrictEqual(id.findRom({ title: 'Ratchet and Clank', slugs: ['ps2'] }), { id: 60, by: 'name' });
  assert.strictEqual(id.findRom({ title: 'Nothing Like It' }), null);
});

test('one normalisation for titles', () => {
  assert.strictEqual(norm('The Legend of Zelda™ (USA) [!]'), 'legend of zelda');
  assert.strictEqual(norm('Ratchet & Clank'), norm('Ratchet and Clank'));
});

test('lazy identity (0.9.60): a game not read yet answers its name IDs at once and is read in the background; ready() waits for all', async () => {
  const fs2 = require('fs'), os2 = require('os'), path2 = require('path');
  const { createIdentity } = require('../electron/gameId');
  const dir = fs2.mkdtempSync(path2.join(os2.tmpdir(), 'cart-lazy-'));
  const files = [1, 2, 3].map((i) => { const f = path2.join(dir, `g${i}.iso`); fs2.writeFileSync(f, 'x' + i); return f; });
  const roms = files.map((f, i) => ({ id: i + 1, name: 'Game ' + (i + 1), fs_name: path2.basename(f) }));
  let reads = 0;
  const idn = createIdentity({ roms: () => roms, whereOf: (id) => files[id - 1], extract: (r) => { reads++; return ['SLUS2000' + r.id]; }, lazy: true, gap: 1 });
  assert.deepStrictEqual(idn.fileIds(roms[0], files[0]), []); // not read on the spot
  assert.strictEqual(reads, 0);
  await idn.ready();
  assert.strictEqual(reads, 3);
  assert.deepStrictEqual(idn.fileIds(roms[0], files[0]), ['SLUS20001']);
  assert.strictEqual(idn.findRom({ ids: ['SLUS20003'] }).id, 3);
  // paused while a game runs
  let busy = true, reads2 = 0;
  const f4 = path2.join(dir, 'g4.iso'); fs2.writeFileSync(f4, 'x4');
  const idn2 = createIdentity({ roms: () => [{ id: 4, name: 'Four' }], whereOf: () => f4, extract: () => { reads2++; return ['X']; }, lazy: true, gap: 1, busy: () => busy });
  idn2.fileIds({ id: 4 }, f4);
  await new Promise((r) => setTimeout(r, 30));
  assert.strictEqual(reads2, 0);
  busy = false; // the game ended: it carries on (within its 5 s wait)
  await idn2.ready();
  assert.strictEqual(reads2, 1);
});
