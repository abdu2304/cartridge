// Emulator profiles (0.9.48): every table names only emulators Cartridge knows, and what each emulator has is pinned
// here. Adding an emulator, or dropping one of its facts from a table, fails this test until the line below is
// updated on purpose. Columns: launch saves savesSync folders links settings mods patches updates get
// ('y' yes, '-' no, 'own' its own entry, another id = shared with that family member).
const test = require('node:test');
const assert = require('node:assert');
const P = require('../electron/emuProfiles');
const E = require('../electron/emulators');

const EXPECT = {
  "ares": 'y - - - - - - - - y',
  "azahar": 'y own own own own - azahar - own y',
  "bigpemu": 'y - - - - - - - - -',
  "bsnes": 'y - - - - - - - - -',
  "cemu": 'y own own own own - cemu own own y',
  "citron": 'y own own yuzu - - switch - own -',
  "desmume": 'y - - - - - - - - -',
  "dolphin": 'y own own own own own dolphin own - y',
  "duckstation": 'y own own own own own duckstation - own y',
  "eden": 'y own own yuzu own - switch - own y',
  "lichii": 'y own yuzu yuzu - - switch - own y', // 0.9.98: Switch 2 (an Eden fork)
  "flycast": 'y - - - own - - - own y',
  "kronos": 'y - - - - - - - - -',
  "kytyps5": 'y - - - - - - - own y',
  "mame": 'y - - - - - - - - y',
  "melonds": 'y - - - own - - - - y',
  "mesen": 'y - - - - - - - - -',
  "mgba": 'y - - - own - - - own y',
  "mupen64plus": 'y - - - - - - - - -',
  "nestopia": 'y - - - - - - - - -',
  "parallel": 'y - - - - - - - - -',
  "pcsx2": 'y own own own own own pcsx2 own own y',
  "play": 'y - - - - - - - - -',
  "ppsspp": 'y own own own own own ppsspp own own y',
  "primehack": 'y dolphin dolphin dolphin own dolphin - dolphin - y',
  "retroarch": '- own own - - - - - - y',
  "rmg": 'y - - - - - - - - y',
  "rpcs3": 'y own own own own own - own own y',
  "ryujinx": 'y own - own own - switch - own y',
  "scummvm": 'y - - - - - - - - y',
  "shadps4": 'y own own own own own shadps4 own own y',
  "sharpemu": 'y - - - - - - - own y',
  "simple64": 'y - - - - - - - - -',
  "snes9x": 'y - - - - - - - - -',
  "stella": 'y - - - - - - - - -',
  "sudachi": '- own own yuzu - - switch - - -',
  "supermodel": 'y - - - - - - - - y',
  "suyu": '- own own yuzu - - switch - - -',
  "torzu": '- own own yuzu - - switch - - -',
  "vita3k": 'y own own own own - - - own y',
  "xemu": 'y - - - own - - - own y',
  "xenia": 'y own own - - - - - own y',
  "xenia-win": '- xenia xenia - - - - - own -',
  "xeniaedge": 'y xenia xenia - - - - - own y',
  "ymir": 'y - - - - - - - - -',
  "yuzu": 'y own own own - - switch - - -',
};
// emulators that appear in a table without a launch entry of their own, on purpose
const NO_LAUNCH = { retroarch: 'cores, launched per core', sudachi: 'yuzu fork, saves only', suyu: 'yuzu fork, saves only', torzu: 'yuzu fork, saves only', 'xenia-win': 'Windows build through Proton' };

test('every emulator any table names is known', () => {
  for (const id of P.known()) assert.ok(E.EMU[id] || NO_LAUNCH[id], `${id} is in a table but Cartridge can't launch it and it isn't listed in NO_LAUNCH`);
});

test('each emulator has exactly the facts it had (update EXPECT on purpose)', () => {
  const K = ['launch', 'saves', 'savesSync', 'folders', 'links', 'settings', 'mods', 'patches', 'updates', 'get'];
  const got = Object.fromEntries(P.all().map((x) => [x.id, K.map((k) => (x[k] === true ? 'y' : x[k] === false || x[k] == null ? '-' : x[k])).join(' ')]));
  assert.deepStrictEqual(got, EXPECT);
});

test('mod layouts', () => {
  assert.strictEqual(P.modKind('eden'), 'switch');
  assert.strictEqual(P.modKind('pcsx2', 'ps2'), 'ps2');
  assert.strictEqual(P.modKind('rpcs3'), 'plain');
});
