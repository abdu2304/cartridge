// Install progress (0.9.60): what a package unpacks to, from its header, against how much the game's folder has grown
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('../electron/pkgInstall');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cart-prog-'));
const pkg = (size) => { const b = Buffer.alloc(0x100); b.writeUInt32BE(0x7f504b47, 0); b.writeBigUInt64BE(BigInt(size), 0x28); const f = path.join(tmp, 'g' + size + '.pkg'); fs.writeFileSync(f, b); return f; };

test('a package says how much it unpacks; anything else unreadable counts as unknown', async () => {
  assert.strictEqual(await P.pkgDataSize(pkg(123456789)), 123456789);
  const junk = path.join(tmp, 'junk.pkg'); fs.writeFileSync(junk, 'not a package');
  assert.strictEqual(await P.pkgDataSize(junk), 0);
  assert.strictEqual(await P.unpackedSize([pkg(1000), pkg(2000)]), 3000);
});

test('progress follows the folder growing, never past 99, and stops when told', async () => {
  const dir = path.join(tmp, 'game/BLUS30001');
  const seen = [];
  const stop = P.growth({ dirs: [dir], total: 1000, onPct: (n) => seen.push(n), every: 30 });
  await new Promise((r) => setTimeout(r, 50));
  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'a'), Buffer.alloc(500));
  await new Promise((r) => setTimeout(r, 80));
  fs.writeFileSync(path.join(dir, 'b'), Buffer.alloc(700));
  await new Promise((r) => setTimeout(r, 80));
  stop();
  const n = seen.length;
  await new Promise((r) => setTimeout(r, 80));
  assert.strictEqual(seen.length, n);
  assert.ok(seen.includes(50), JSON.stringify(seen));
  assert.strictEqual(Math.max(...seen), 99);
});

test('a reinstall over the same files gives no number rather than a wrong one', async () => {
  const dir = path.join(tmp, 'game/BLUS30002'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'a'), Buffer.alloc(1000));
  const seen = [];
  const stop = P.growth({ dirs: [dir], total: 1000, onPct: (n) => seen.push(n), every: 20 });
  await new Promise((r) => setTimeout(r, 80)); stop();
  assert.deepStrictEqual(seen, []);
});
