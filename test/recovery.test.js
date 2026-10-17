// Recovery (0.9.71): safe start after two unfinished starts, backups, export without secrets, import keeping this
// device's own things.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const R = require('../electron/recovery');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cart-rec-'));
test('two starts in a row that never finished give a safe start; a good start resets it', () => {
  const dir = tmp(); let t = 1e12; const r = R.createRecovery({ dir, now: () => t, version: '0.9.71' });
  assert.deepStrictEqual(r.start(), { safe: false, unclean: 0 });
  t += 1000; assert.deepStrictEqual(r.start(), { safe: false, unclean: 1 }); // the first never finished
  t += 1000; assert.deepStrictEqual(r.start(), { safe: true, unclean: 2 });
  r.ok(); t += 1000; assert.deepStrictEqual(r.start(), { safe: false, unclean: 0 });
  assert.strictEqual(r.closes().length, 2);
  assert.strictEqual(r.safeUi({ style: 'glass', theme: 'oled' }).style, 'plain');
  assert.strictEqual(r.safeUi({ theme: 'oled' }).theme, 'oled'); // colours stay
});
test('backups: one a day, before updates, ten kept, read back checked', () => {
  const dir = tmp(); let t = 1e12; const r = R.createRecovery({ dir, now: () => t });
  const cfg = path.join(dir, 'config.json'); fs.writeFileSync(cfg, JSON.stringify({ ui: { theme: 'light' } }));
  assert.ok(r.backup(cfg, 'daily')); assert.strictEqual(r.backup(cfg, 'daily'), null);
  for (let i = 0; i < 12; i++) { t += 61000; r.backup(cfg, 'update'); }
  const l = r.backupList(); assert.strictEqual(l.length, 10); assert.strictEqual(l[0].why, 'update');
  assert.strictEqual(r.backupRead(l[0].name).ui.theme, 'light');
  assert.throws(() => r.backupRead('../config.json'));
});
test('export leaves out sign-in details; import keeps them and this device’s own things', () => {
  const cfg = { server: { localUrl: 'http://romm', username: 'u', password: 'p', token: 't' }, sgdbKey: 'k', ra: { user: 'a', key: 'x' }, romsRoot: '/a', ui: { theme: 'oled' } };
  const ex = R.exportOf(cfg, '0.9.71');
  assert.strictEqual(ex.settings.server.password, undefined); assert.strictEqual(ex.settings.server.token, undefined);
  assert.strictEqual(ex.settings.sgdbKey, undefined); assert.strictEqual(ex.settings.ra.key, undefined);
  assert.strictEqual(ex.settings.ui.theme, 'oled');
  const here = { server: { localUrl: 'http://other', password: 'mine' }, romsRoot: '/here', ui: { theme: 'light', style: 'glass' } };
  const next = R.importInto(here, ex);
  assert.strictEqual(next.server.password, 'mine'); assert.strictEqual(next.romsRoot, '/here');
  assert.strictEqual(next.ui.theme, 'oled'); assert.strictEqual(next.ui.style, 'glass');
  assert.throws(() => R.importInto(here, { ui: {} }));
});
