// Console and maker logos (0.9.49, owner: "save the logos as a design system"): the sizes and marks the owner signed
// off are pinned here, so a change to one shows up as a failing test instead of a surprise on screen. Rules:
// docs/logos.md. Change a value only when the owner asks, and update EXPECT with it.
const test = require('node:test');
const assert = require('node:assert');

let O, M;
test.before(async () => { O = await import('../src/consoleOptical.js'); M = await import('../src/makers.js'); });

// optical sizes the owner approved (0.9.21, 0.9.42 Switch, 0.9.47 PlayStation)
const EXPECT = { steam: 1.45, psx: 1.6, playstation: 1.6, switch: 1.7, gc: 1.45, ngc: 1.45, wii: 1.3, wiiu: 1.3, nes: 1.35, snes: 1.2, n64: 1.15, gba: 1.35, dreamcast: 1.45, dc: 1.45, saturn: 1.2, genesis: 1.3, xbox: 1.05, xbox360: 1.1 };

test('optical sizes stay as approved', () => {
  for (const [k, v] of Object.entries(EXPECT)) assert.strictEqual(O.OPTICAL[k], v, `${k} should be ${v}`);
});
test('no logo is drawn smaller than its box or past 1.8 times', () => {
  for (const [k, v] of Object.entries(O.OPTICAL)) assert.ok(v >= 1 && v <= 1.8, `${k} is ${v}`);
  assert.strictEqual(O.opticalOf('', 'unknown-console'), 1);
  assert.strictEqual(O.opticalOf('romimg://x/?sys=switch', 'nes'), 1.7); // the logo's own key wins
});
test('every maker mark is complete', () => {
  for (const [k, m] of Object.entries(M.MAKERS)) {
    assert.ok(m.name, `${k} has a name`);
    assert.match(m.vb, /^[\d.\- ]+$/, `${k} has a viewBox`);
    assert.ok(m.d || (m.paths && m.paths.length), `${k} has its drawing`);
  }
  // Sega's full wordmark (0.9.21: one path of five drew an S), Nintendo's pill
  assert.ok(M.MAKERS.sega.paths.length >= 5);
  assert.strictEqual(M.MAKERS.nintendo.tall, true);
});
test('Sony marks: SONY on PS1, PS2, PS3 and PSP, not on PS4 and PS5', () => {
  const S = require('../electron/sonyArt.js');
  const fix = S.FIX;
  for (const k of ['psx', 'ps2', 'ps3', 'psp']) assert.ok(Array.isArray(fix[k].sony), `${k} has SONY`);
  for (const k of ['ps4', 'ps5']) assert.strictEqual(fix[k].sony, null, `${k} has no SONY`);
});
