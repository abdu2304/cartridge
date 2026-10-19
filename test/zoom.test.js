'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Z = require('../electron/zoom');

test('interface size: automatic by the window, a picked size never below 1280x800 to lay out in', () => {
  assert.strictEqual(Z.zoomFor(1280, 800, 'auto'), 1); // Steam Deck
  assert.strictEqual(Z.zoomFor(1920, 1080), 1); // Ally
  assert.strictEqual(Z.zoomFor(3840, 2160, 'auto'), 2); // 4K TV in Game Mode
  assert.ok(Z.zoomFor(1000, 700, 'auto') < 1); // a small desktop window zooms out
  assert.strictEqual(Z.zoomFor(3840, 2160, '2.5'), 2.5); // the owner's 4K pick: 1536x864, fine
  assert.strictEqual(Z.zoomFor(2560, 1440, '2.5'), 1.8); // the same pick in a KDE-at-150% desktop: 1422x800, not 1024x576
  assert.strictEqual(Z.zoomFor(1280, 800, '1.5'), 1); // a Deck never goes below its own size
  assert.strictEqual(Z.zoomFor(1920, 1080, '0.75'), 0.75); // smaller picks are kept
  const z = Z.zoomFor(2560, 1440, '3');
  assert.ok(2560 / z >= 1280 && 1440 / z >= 800);
});
