// PS4 updates beside their game as "<game>-UPDATE", the way shadPS4 reads them (0.9.79)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { arrange } = require('../electron/ps4Layout');
const { sfo } = require('../electron/saves');

function sfoBytes(fields) {
  const keys = Object.keys(fields); let kt = Buffer.alloc(0), dt = Buffer.alloc(0); const ents = [];
  for (const k of keys) { const v = Buffer.from(fields[k] + '\0'); ents.push({ ko: kt.length, len: v.length, off: dt.length }); kt = Buffer.concat([kt, Buffer.from(k + '\0')]); dt = Buffer.concat([dt, v]); }
  const head = Buffer.alloc(20), ktOff = 20 + 16 * keys.length;
  head.writeUInt32BE(0x00505346, 0); head.writeUInt32LE(0x101, 4); head.writeUInt32LE(ktOff, 8); head.writeUInt32LE(ktOff + kt.length, 12); head.writeUInt32LE(keys.length, 16);
  const idx = Buffer.concat(ents.map((e) => { const b = Buffer.alloc(16); b.writeUInt16LE(e.ko, 0); b.writeUInt16LE(0x0204, 2); b.writeUInt32LE(e.len, 4); b.writeUInt32LE(e.len, 8); b.writeUInt32LE(e.off, 12); return b; }));
  return Buffer.concat([head, idx, kt, dt]);
}
const dump = (dir, cat, ver, id = 'CUSA00223') => { fs.mkdirSync(path.join(dir, 'sce_sys'), { recursive: true }); fs.writeFileSync(path.join(dir, 'eboot.bin'), cat + ver); fs.writeFileSync(path.join(dir, 'sce_sys/param.sfo'), sfoBytes({ TITLE_ID: id, CATEGORY: cat, APP_VER: ver, TITLE: 'Game' })); };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cart-ps4l-'));

test('a game and its update unpacked side by side: the update becomes <game>-UPDATE', () => {
  const d = tmp();
  dump(path.join(d, 'inFAMOUS Second Son'), 'gd', '01.00');
  dump(path.join(d, 'inFAMOUS Second Son Update 1.07'), 'gp', '01.07');
  const m = arrange(d, { sfo });
  assert.strictEqual(m.length, 1);
  assert.deepStrictEqual(fs.readdirSync(d).sort(), ['inFAMOUS Second Son', 'inFAMOUS Second Son-UPDATE']);
  assert.strictEqual(fs.readFileSync(path.join(d, 'inFAMOUS Second Son-UPDATE/eboot.bin'), 'utf8'), 'gp01.07');
});

test('the newest of several updates, one folder down, its empty folder gone; a second run changes nothing', () => {
  const d = tmp();
  dump(path.join(d, 'Game/CUSA00223-app'), 'gd', '01.00');
  dump(path.join(d, 'Patch 1.05/CUSA00223-patch'), 'gp', '01.05');
  dump(path.join(d, 'Patch 1.07/CUSA00223-patch'), 'gp', '01.07');
  arrange(d, { sfo });
  assert.ok(fs.existsSync(path.join(d, 'Game/CUSA00223-app-UPDATE/eboot.bin')));
  assert.strictEqual(fs.readFileSync(path.join(d, 'Game/CUSA00223-app-UPDATE/eboot.bin'), 'utf8'), 'gp01.07');
  assert.ok(!fs.existsSync(path.join(d, 'Patch 1.07')), 'its empty folder went');
  assert.ok(fs.existsSync(path.join(d, 'Patch 1.05/CUSA00223-patch')), 'the older one is left alone');
  assert.deepStrictEqual(arrange(d, { sfo }), []);
});

test('never over an -UPDATE already there, never another game\'s update, nothing without an update', () => {
  const d = tmp();
  dump(path.join(d, 'A'), 'gd', '01.00'); dump(path.join(d, 'A-UPDATE'), 'gp', '01.02'); dump(path.join(d, 'A new patch'), 'gp', '01.09');
  dump(path.join(d, 'B'), 'gd', '01.00', 'CUSA09999');
  dump(path.join(d, 'C'), 'gd', '01.00', 'CUSA07777');
  assert.deepStrictEqual(arrange(d, { sfo }), []);
  assert.ok(fs.existsSync(path.join(d, 'A new patch')));
});
