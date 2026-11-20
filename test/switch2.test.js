'use strict';
// Switch 2 (0.9.92, owner): its own console folder, made with the others and found again by the local library
const test = require('node:test');
const assert = require('node:assert');
const MAP = require('../electron/platformMap');
const { ESDE } = require('../electron/emuGet');

test('RomM\'s Switch 2 slugs download into switch2, never into switch', () => {
  for (const s of ['switch-2', 'switch2', 'switch_2']) assert.deepStrictEqual(MAP[s], ['switch2']);
  assert.deepStrictEqual(MAP.switch, ['switch']);
});

test('the Emulation folder Cartridge makes has a switch2 folder next to switch', () => {
  assert.ok(ESDE.includes('switch2'));
  assert.ok(ESDE.includes('switch'));
});
