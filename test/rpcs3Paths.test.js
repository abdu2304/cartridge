// RPCS3's settings on Linux (0.9.63, owner: Infamous's game settings did nothing, and "Failed to load global config ...
// illegal map value" at line 277): custom_configs/, patch_config.yml and vfs.yml sit beside config.yml (config/ only on
// Windows, Utilities/File.cpp get_config_dir), files an earlier Cartridge put in config/ move across without replacing
// RPCS3's own, and the known EmuDeck damage is repaired with a backup.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('../electron/patches');
const GS = require('../electron/gameSettings');

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cart-rp-')));
const put = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); return p; };

test('per-game settings go beside config.yml on Linux, and in config/ only for a Windows layout', () => {
  const lin = tmp(); put(lin, 'config.yml', 'Video:\n  Renderer: Vulkan\n');
  assert.strictEqual(GS.files({ emu: 'rpcs3', serial: 'BCUS98119', rpcs3Root: lin }).file, path.join(lin, 'custom_configs', 'config_BCUS98119.yml'));
  assert.strictEqual(P.rpcs3CustomPath({ root: lin }, 'BCUS98119'), path.join(lin, 'custom_configs', 'config_BCUS98119.yml'));
  const win = tmp(); put(win, 'config/config.yml', 'Video:\n  Renderer: Vulkan\n');
  assert.strictEqual(GS.files({ emu: 'rpcs3', serial: 'BCUS98119', rpcs3Root: win }).file, path.join(win, 'config', 'custom_configs', 'config_BCUS98119.yml'));
});

test('files left in config/ move to where RPCS3 reads them; RPCS3’s own are never replaced; patch switches merge', () => {
  const r = tmp(); put(r, 'config.yml', 'Video:\n  Renderer: Vulkan\n');
  put(r, 'config/custom_configs/config_BCUS98119.yml', 'Video:\n  Resolution Scale: 200\n');
  put(r, 'config/custom_configs/config_BLUS30443.yml', 'Video:\n  Resolution Scale: 300\n');
  put(r, 'custom_configs/config_BLUS30443.yml', 'Video:\n  Resolution Scale: 100\n'); // RPCS3's own
  put(r, 'config/patch_config.yml', 'h1:\n  Mine:\n    Game:\n      BCUS98119:\n        "01.00":\n          Enabled: true\n');
  put(r, 'patch_config.yml', 'h2:\n  Theirs:\n    Game:\n      BLUS30443:\n        "01.00":\n          Enabled: true\n');
  const d = P.rpcs3Dirs(path.dirname(path.dirname(r))).find((x) => x.root === r) || { root: r, cfg: P.rpcs3CfgDir(r) };
  const moved = P.rpcs3Relocate(d);
  assert.ok(fs.existsSync(path.join(r, 'custom_configs/config_BCUS98119.yml')));
  assert.ok(!fs.existsSync(path.join(r, 'config/custom_configs/config_BCUS98119.yml')));
  assert.match(fs.readFileSync(path.join(r, 'custom_configs/config_BLUS30443.yml'), 'utf8'), /100/); // kept
  assert.ok(fs.existsSync(path.join(r, 'config/custom_configs/config_BLUS30443.yml'))); // ours stays where it was
  const pc = P.load(fs.readFileSync(path.join(r, 'patch_config.yml'), 'utf8'));
  assert.ok(pc.h1 && pc.h2);
  assert.ok(fs.existsSync(path.join(r, 'patch_config.yml.cartridge-backup')));
  assert.strictEqual(moved.length, 2);
  assert.deepStrictEqual(P.rpcs3Relocate(d), []); // nothing twice
});

test('the EmuDeck leftover is found and repaired with a backup; other damage is never touched', () => {
  const r = tmp();
  const good = 'Video:\n  Renderer: Vulkan\n  Resolution Scale: 150\n  Vulkan:\n    Adapter: AMD\n  Write Color Buffers: false\n';
  put(r, 'config.yml', good + '  Write Depth Buffer: falseResolution Scale: = 150\nAudio:\n  Renderer: Cubeb\n');
  const d = { root: r, cfg: r };
  const c = P.rpcs3ConfigCheck(d);
  assert.ok(c && c.known); assert.strictEqual(c.line, 7);
  const res = P.rpcs3ConfigRepair(d);
  assert.ok(res.ok && fs.existsSync(res.backup));
  assert.strictEqual(P.rpcs3ConfigCheck(d), null);
  assert.match(fs.readFileSync(path.join(r, 'config.yml'), 'utf8'), /  Write Depth Buffer: false\nAudio:/);
  assert.match(fs.readFileSync(res.backup, 'utf8'), /falseResolution Scale: = 150/);
  // unknown damage: reported, never changed
  const o = tmp(); put(o, 'config.yml', 'Video:\n  Renderer: [Vulkan\n'); const before = fs.readFileSync(path.join(o, 'config.yml'), 'utf8');
  assert.ok(P.rpcs3ConfigCheck({ root: o, cfg: o }) && !P.rpcs3ConfigCheck({ root: o, cfg: o }).known);
  assert.throws(() => P.rpcs3ConfigRepair({ root: o, cfg: o }));
  assert.strictEqual(fs.readFileSync(path.join(o, 'config.yml'), 'utf8'), before);
});
