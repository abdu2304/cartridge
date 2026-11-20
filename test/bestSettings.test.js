'use strict';
// Best Settings for This Device (0.9.96): the device is named right, each recommendation is a value the emulator's
// Game Settings offers (so it can never write something the emulator doesn't take), and the screen caps resolution
const test = require('node:test');
const assert = require('node:assert');
const B = require('../electron/bestSettings');
const G = require('../electron/gameSettings');

const dev = (files, dirs, facts) => B.detect({ read: (f) => files[f] ?? null, list: (d) => dirs[d] || [], ...facts });
const DMI = (p, v = '', b = '') => ({ '/sys/class/dmi/id/product_name': p, '/sys/class/dmi/id/sys_vendor': v, '/sys/class/dmi/id/board_name': b });

test('detect: handhelds by name, PCs by their parts', () => {
  assert.deepStrictEqual([dev(DMI('Galileo', 'Valve'), {}, { screenH: 800 }).name, dev(DMI('Galileo', 'Valve'), {}, {}).tier], ['Steam Deck OLED', 'deck']);
  assert.strictEqual(dev(DMI('Jupiter', 'Valve'), {}, {}).name, 'Steam Deck LCD');
  assert.deepStrictEqual([dev(DMI('ROG Ally RC71L_RC71L', 'ASUSTeK'), {}, {}).name, dev(DMI('ROG Ally X RC72LA', 'ASUSTeK'), {}, {}).name], ['ROG Ally', 'ROG Ally X']);
  assert.strictEqual(dev(DMI('83E1', 'LENOVO'), {}, {}).name, 'Legion Go');
  const nv = { ...DMI('System Product Name', 'ASUS'), '/sys/class/drm/card1/device/vendor': '0x10de' };
  const pc = dev(nv, { '/sys/class/drm': ['card1', 'renderD128'], '/sys/class/power_supply': [] }, { cpus: 16, memGB: 32, screenH: 2160 });
  assert.deepStrictEqual([pc.tier, pc.gpus, pc.name], ['desktop', ['NVIDIA'], 'ASUS']); // "System Product Name" is left out
  const lap = dev({ ...DMI('ThinkPad T14', 'LENOVO'), '/sys/class/drm/card0/device/vendor': '0x8086' }, { '/sys/class/drm': ['card0'], '/sys/class/power_supply': ['BAT0', 'AC'] }, { cpus: 8, memGB: 16 });
  assert.deepStrictEqual([lap.tier, lap.name], ['laptop', 'LENOVO ThinkPad T14']);
  assert.strictEqual(dev(DMI('Mini PC'), {}, { cpus: 4, memGB: 4 }).tier, 'low');
});

test('every recommendation is a choice the emulator\'s Game Settings offers', () => {
  for (const tier of Object.keys(B.CAP)) for (const screenH of [720, 800, 1080, 1440, 2160]) for (const emu of Object.keys(G.SCHEMA)) {
    for (const r of B.recommend(emu, { name: 'X', tier, screenH })) {
      const it = G.SCHEMA[emu].items.find((x) => x.id === r.id);
      assert.ok(it, `${emu} ${r.id} isn't in its schema`);
      const values = (it.options || []).map((o) => String(Array.isArray(o) ? o[0] : o));
      assert.ok(values.includes(String(r.value)), `${emu} ${r.id}=${r.value} isn't one of ${values.join(', ')}`);
      assert.ok(r.why && !r.why.includes('—'), r.why);
    }
  }
});

test('resolution: the Deck at 720p, a desktop on a 4K TV at 4K (PS3 at 1440p), never above the screen', () => {
  const res = (emu, tier, screenH) => B.recommend(emu, { name: 'X', tier, screenH }).find((r) => /resol|upscale/i.test(r.id))?.value;
  assert.deepStrictEqual(['pcsx2', 'rpcs3', 'dolphin', 'ppsspp', 'duckstation'].map((e) => res(e, 'deck', 800)), ['2', '100', '2', '3', '3']);
  assert.deepStrictEqual(['pcsx2', 'rpcs3'].map((e) => res(e, 'deck', 2160)), ['2', '100']); // docked to a TV: still the Deck's power
  assert.deepStrictEqual(['pcsx2', 'rpcs3', 'dolphin'].map((e) => res(e, 'desktop', 2160)), ['6', '200', '6']);
  assert.deepStrictEqual(['pcsx2', 'rpcs3'].map((e) => res(e, 'desktop', 1080)), ['3', '150']); // a 1080p monitor: no more than 1080p
  assert.deepStrictEqual(['pcsx2', 'dolphin'].map((e) => res(e, 'handheld', 1200)), ['3', '3']);
  assert.deepStrictEqual(B.recommend('shadps4', { name: 'X', tier: 'deck', screenH: 800 }), []); // nothing it's sure of
});
