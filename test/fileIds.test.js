// IDs read from games' files in a worker thread (0.9.68, owner: the app dimmed about 30 s after start and the
// controller went): the worker gives what reading in place gives, a broken worker falls back to reading in place,
// and the identity engine reads queued games through the async reader.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const F = require('../electron/fileIds');
const { createIdentity } = require('../electron/gameId');
const DISC = path.join(__dirname, 'fixtures/disc');

test('the worker reads the same IDs as reading in place (PS2 CHD, CSO, GameCube, PS3 folder, PSP name)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fid-'));
  const ps3 = path.join(dir, 'Game'); fs.mkdirSync(path.join(ps3, 'PS3_GAME'), { recursive: true });
  fs.writeFileSync(path.join(ps3, 'PS3_GAME', 'PARAM.SFO'), 'junk TITLE_ID BLUS30443 junk');
  const psp = path.join(dir, 'Some Game [ULUS-10041].iso'); fs.writeFileSync(psp, 'x');
  const jobs = [
    { slugs: 'ps2 ps2', where: path.join(DISC, 'ps2-zstd.chd') },
    { slugs: 'ps2 ps2', where: path.join(DISC, 'ps2-lzma.chd') },
    { slugs: 'ps2 ps2', where: path.join(DISC, 'ps2.cso') },
    { slugs: 'ngc ngc', where: path.join(DISC, 'gc.gcz') },
    { slugs: 'ps3 ps3', where: ps3 },
    { slugs: 'psp psp', where: psp, fsName: path.basename(psp) },
    { kind: 'ps3serial', where: ps3 },
  ];
  const r = F.createReader({ idleMs: 50 });
  for (const j of jobs) {
    const here = F.read(j).filter(Boolean);
    assert.deepStrictEqual(await r.readIds(j), here, j.where);
  }
  assert.ok(F.read(jobs[0]).filter(Boolean).length, 'the PS2 CHD gives a serial');
  r.stop();
});

test('a worker that cannot start reads in place instead', async () => {
  const W = require('worker_threads'), real = W.Worker;
  W.Worker = function () { throw new Error('no workers here'); };
  const logs = [];
  try {
    const r = F.createReader({ log: (...a) => logs.push(a.join(' ')) });
    const j = { slugs: 'ps2', where: path.join(DISC, 'ps2-zstd.chd') };
    assert.deepStrictEqual(await r.readIds(j), F.read(j).filter(Boolean));
    assert.ok(logs.some((l) => /no workers here/.test(l)));
  } finally { W.Worker = real; }
});

test('queued games are read through extractAsync, never the sync reader, and cached', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fid-'));
  const iso = path.join(dir, 'A.iso'); fs.writeFileSync(iso, 'x');
  const roms = [{ id: 1, name: 'A', fs_name: 'A.iso', platform_slug: 'ps2' }];
  let sync = 0, asyncN = 0;
  const id = createIdentity({ file: path.join(dir, 'ids.json'), roms: () => roms, whereOf: () => iso, lazy: true, gap: 0,
    extract: () => { sync++; return ['SLUS00001']; },
    extractAsync: async () => { asyncN++; return ['slus-00002']; } });
  assert.deepStrictEqual(id.fileIds(roms[0], iso), []); // queued, not read in the caller's turn
  await id.ready();
  assert.deepStrictEqual(id.fileIds(roms[0], iso), ['SLUS00002']);
  assert.strictEqual(sync, 0); assert.strictEqual(asyncN, 1);
  await id.ready(); assert.strictEqual(asyncN, 1); // read once per file version
});
