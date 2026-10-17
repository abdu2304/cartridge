// Update channels (0.9.71): which releases each channel sees, names, CI version numbers, and the updater settings.
const test = require('node:test');
const assert = require('node:assert');
const UC = require('../electron/updateChannels');

test('channel of a version or tag', () => {
  assert.strictEqual(UC.channelOf('0.9.70'), 'stable');
  assert.strictEqual(UC.channelOf('v0.9.71-beta.2'), 'beta');
  assert.strictEqual(UC.channelOf('v0.9.71-nightly.20261018.3'), 'nightly');
  assert.strictEqual(UC.channelOf('v0.9.71-test.4'), null);
  assert.ok(UC.validTag('v0.9.71-nightly.20261018.3') && !UC.validTag('0.9.71') && !UC.validTag('v1;rm'));
});
test('names people read', () => {
  assert.strictEqual(UC.nameOf('v0.9.71-beta.2'), '0.9.71 Beta 2');
  assert.strictEqual(UC.nameOf('v0.9.71-nightly.20261018.3'), '0.9.71 Nightly 18 Oct 2026');
  assert.strictEqual(UC.nameOf('v0.9.70', 'Cartridge 0.9.70'), '0.9.70');
});
test('CI version numbers sort above the current release and by date', () => {
  assert.strictEqual(UC.nextVersion('0.9.70', 'beta', 3), '0.9.71-beta.3');
  assert.strictEqual(UC.nextVersion('0.9.70', 'nightly', 7, new Date('2026-10-18T03:00:00Z')), '0.9.71-nightly.20261018.7');
});
test('the version list keeps only real Cartridge releases with an AppImage, by channel', () => {
  const app = [{ name: 'Cartridge-x86_64.AppImage' }];
  const l = UC.list([
    { tag_name: 'v0.9.71-nightly.20261018.7', name: 'Cartridge 0.9.71 Nightly', assets: app, published_at: 'x' },
    { tag_name: 'v0.9.71-beta.1', assets: app }, { tag_name: 'v0.9.70', name: 'Cartridge 0.9.70', assets: app },
    { tag_name: 'v0.9.69', assets: [] }, { tag_name: 'v0.9.68', draft: true, assets: app },
  ], '0.9.70');
  assert.deepStrictEqual(l.map((x) => [x.tag, x.channel, x.current]), [['v0.9.71-nightly.20261018.7', 'nightly', false], ['v0.9.71-beta.1', 'beta', false], ['v0.9.70', 'stable', true]]);
});
test('updater settings per channel', () => {
  // electron-updater's channel setter turns allowDowngrade on: apply must decide it itself
  const mk = () => { const u = { allowPrerelease: false, allowDowngrade: false, _c: null }; Object.defineProperty(u, 'channel', { get() { return this._c; }, set(v) { this._c = v; this.allowDowngrade = true; } }); return u; };
  let u = mk(); UC.apply(u, 'stable'); assert.deepStrictEqual([u.allowPrerelease, u.channel, u.allowDowngrade], [false, null, false]);
  u = mk(); UC.apply(u, 'beta'); assert.deepStrictEqual([u.allowPrerelease, u.channel, u.allowDowngrade], [true, 'beta', false]);
  u = mk(); UC.apply(u, 'nightly', { switched: true }); assert.deepStrictEqual([u.allowPrerelease, u.channel, u.allowDowngrade], [true, 'nightly', true]);
  UC.apply(u, 'stable', { switched: true }); assert.deepStrictEqual([u.allowPrerelease, u.channel, u.allowDowngrade], [false, 'latest', true]);
  u = mk(); UC.apply(u, 'nonsense'); assert.strictEqual(u.allowPrerelease, false);
});
