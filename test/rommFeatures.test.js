// RomM features judged from its /openapi.json (0.9.79): an endpoint that isn't there switches its feature off.
const test = require('node:test');
const assert = require('node:assert');
const { fromOpenApi } = require('../electron/rommFeatures');

const op = (...params) => ({ parameters: params.map((name) => ({ name, in: 'query' })) });
// the paths as RomM's current routers declare them (endpoints/*.py with the /api prefix from main.py)
const NOW = { paths: {
  '/api/collections': { get: {} , post: {} },
  '/api/saves': { get: op('rom_id'), post: op('rom_id', 'emulator', 'slot', 'device_id', 'content_hash', 'overwrite') },
  '/api/play-sessions': { get: {}, post: {} },
  '/api/devices': { get: {}, post: {} },
  '/api/roms/{id}/notes': { get: {}, post: {} },
  '/api/auth/device/init': { post: {} },
  '/api/roms/upload/start': { post: {} },
} };

test('a current RomM has everything', () => {
  const f = fromOpenApi(NOW);
  assert.equal(f.known, true);
  assert.deepEqual(f.off, []);
});

test('no description keeps everything on', () => {
  for (const d of [null, {}, { paths: null }, 'x']) { const f = fromOpenApi(d); assert.equal(f.known, false); assert.ok(Object.values(f.on).every(Boolean)); }
});

test('an older RomM: saves without slots, no play sessions, no notes, no QR, old upload', () => {
  const f = fromOpenApi({ paths: { '/api/collections/': { get: {} }, '/api/saves': { post: op('rom_id', 'emulator') }, '/api/roms': { post: {} }, '/api/roms/{rom_id}': { get: {} } } });
  assert.equal(f.on.collections, true); // trailing slash and parameter names don't matter
  assert.equal(f.on.saves, false);
  assert.equal(f.on.playSessions, false);
  assert.equal(f.on.notes, false);
  assert.equal(f.on.qr, false);
  assert.equal(f.on.upload, true); // the older one-request upload still works
  assert.deepEqual(f.off, ['Cartridge Save Sync', 'Play Time From Other Devices', 'Trophy Sync', 'Sign In With a QR Code']);
});

test('0.9.86: RomM 5.3 (no content_hash upload parameter, the hash in what it lists) keeps Save Sync on', () => {
  const f = fromOpenApi({ paths: { '/api/saves': { post: op('rom_id', 'emulator', 'slot', 'device_id', 'session_id', 'overwrite', 'autocleanup', 'autocleanup_limit') } } });
  assert.equal(f.on.saves, true);
});
