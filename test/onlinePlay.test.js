// Online Play (0.9.66): the pure SHA3 RPCN needs, the one-key writers for each settings format, and the engine:
// a feature turned on writes only its own settings (backed up first), never while the emulator runs, and an update
// that resets them gets them back.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const S = require('../electron/sha3');
const F = require('../electron/onlineFormats');
const { createOnline } = require('../electron/onlinePlay');

test('SHA3-256, HMAC and PBKDF2 match Node’s own', () => {
  for (const m of ['', 'abc', 'x'.repeat(135), 'y'.repeat(136), 'z'.repeat(400)]) assert.strictEqual(S.sha3_256(m).toString('hex'), crypto.createHash('sha3-256').update(m).digest('hex'));
  assert.strictEqual(S.hmac('k'.repeat(200), 'data').toString('hex'), crypto.createHmac('sha3-256', 'k'.repeat(200)).update('data').digest('hex'));
  assert.strictEqual(S.pbkdf2('pw', 'No matter where you go, everybody\'s connected.', 500, 32).toString('hex'), crypto.pbkdf2Sync('pw', 'No matter where you go, everybody\'s connected.', 500, 32, 'sha3-256').toString('hex'));
});

test('writers change one key and keep the rest', () => {
  const ini = '; comment\n[Network]\nEnableWlan = False\nPortOffset = 10000\n\n[SystemParam]\nNickName = PPSSPP\n';
  const out = F.iniSet(ini, ['Network', 'EnableWlan'], 'True');
  assert.strictEqual(out, ini.replace('EnableWlan = False', 'EnableWlan = True'));
  assert.strictEqual(F.iniGet(F.iniSet(ini, ['Network', 'proAdhocServer'], 'socom.cc'), ['Network', 'proAdhocServer']), 'socom.cc');
  assert.match(F.iniSet('[Multiplayer]\nnickname=a\n', ['Multiplayer', 'nickname'], 'b', { qt: true }), /nickname=b\nnickname\\default=false/);
  const yml = 'Core:\n  PPU Decoder: Recompiler (LLVM)\nNet:\n  Internet enabled: Disconnected\n  IP address: 0.0.0.0\nMisc:\n  x: 1\n';
  const y2 = F.yamlSet(F.yamlSet(yml, ['Net', 'Internet enabled'], 'Connected'), ['Net', 'PSN status'], 'RPCN');
  assert.deepStrictEqual([F.yamlGet(y2, ['Net', 'Internet enabled']), F.yamlGet(y2, ['Net', 'PSN status']), F.yamlGet(y2, ['Misc', 'x'])], ['Connected', 'RPCN', '1']);
  assert.strictEqual(F.cfgGet(F.cfgSet('a = "1"\nnetplay_nickname = ""\n', ['netplay_nickname'], 'me'), ['netplay_nickname']), 'me');
  assert.deepStrictEqual(JSON.parse(F.jsonSet('{"General":{"a":1}}', ['General', 'shad_net_enabled'], true)), { General: { a: 1, shad_net_enabled: true } });
  const xml = '<content>\n\t<Account>\n\t\t<PersistentId>80000001</PersistentId>\n\t</Account>\n</content>\n';
  assert.strictEqual(F.xmlSet(xml, ['content', 'Account', 'ActiveService'], '1'), '<content>\n\t<Account>\n\t\t<PersistentId>80000001</PersistentId>\n\t\t<ActiveService>1</ActiveService>\n\t</Account>\n</content>\n');
  assert.throws(() => F.jsonSet('{broken', ['a'], 1), /damaged/);
});

test('PPSSPP: nickname first, then on; never while running; an update that resets it gets it back', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cart-op-')), data = path.join(home, 'data');
  const ini = path.join(home, '.config/ppsspp/PSP/SYSTEM/ppsspp.ini');
  fs.mkdirSync(path.dirname(ini), { recursive: true }); fs.mkdirSync(data);
  fs.writeFileSync(ini, '[Network]\nEnableWlan = False\n\n[SystemParam]\nNickName = PPSSPP\n');
  let running = false;
  const eng = createOnline({ home, dataDir: data, installed: () => ['ppsspp'], running: () => running });
  const k = () => eng.list().emus[0].kinds[0];
  assert.strictEqual(k().on, false);
  await assert.rejects(() => eng.set('ppsspp', 'network', true), /Nickname/);
  await assert.rejects(() => eng.field('ppsspp', 'network', 'nick', 'PPSSPP'), /other than PPSSPP/);
  await eng.field('ppsspp', 'network', 'nick', 'Player1');
  await eng.set('ppsspp', 'network', true);
  assert.strictEqual(k().on, true);
  assert.match(fs.readFileSync(ini, 'utf8'), /EnableWlan = True[\s\S]*NickName = Player1/);
  assert.strictEqual(fs.readdirSync(path.join(data, 'online-backups', 'ppsspp')).length, 1, 'the file before was kept');
  running = true;
  await assert.rejects(() => eng.set('ppsspp', 'network', false), /Close PPSSPP/);
  running = false;
  // an update wrote a fresh file: back on, nickname back
  fs.writeFileSync(ini, '[Network]\nEnableWlan = False\n\n[SystemParam]\n');
  const r = eng.recheck('ppsspp');
  assert.ok(r.fixed >= 2);
  assert.match(fs.readFileSync(ini, 'utf8'), /EnableWlan = True[\s\S]*NickName = Player1/);
  // the file gone after an update: reported, nothing guessed
  fs.rmSync(ini);
  assert.match(eng.recheck('ppsspp').issues[0].text, /isn’t where it was/);
});

test('Eden writes Qt’s \\default pairs; Ryujinx a number; Dolphin its ini; Azahar only reports', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cart-op-')), data = path.join(home, 'data');
  const put = (rel, text) => { const f = path.join(home, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
  fs.mkdirSync(data);
  const eden = put('.config/eden/qt-config.ini', '[Services]\nairplane_mode\\default=true\nairplane_mode=true\n\n[UI]\nfoo=1\n');
  const ryu = put('.config/Ryujinx/Config.json', '{\n  "version": 73,\n  "multiplayer_mode": 0,\n  "ldn_server": ""\n}\n');
  const dol = put('.config/dolphin-emu/Dolphin.ini', '[Core]\nCPUCore = 1\n');
  put('.config/azahar-emu/qt-config.ini', '[UI]\n');
  put('.local/share/azahar-emu/sysdata/otp.bin', 'x');
  const eng = createOnline({ home, dataDir: data, installed: () => [], running: () => false, log: () => {} });
  const kind = (emu, id) => eng.list().emus.find((e) => e.emu === emu).kinds.find((k) => k.id === id);
  // Eden: nickname first; airplane mode off with its \default pair, read as on only then
  await assert.rejects(() => eng.set('eden', 'rooms', true), /Nickname/);
  await eng.field('eden', 'rooms', 'nick', 'Player1');
  await eng.set('eden', 'rooms', true);
  const et = fs.readFileSync(eden, 'utf8');
  assert.match(et, /airplane_mode\\default=false/); assert.match(et, /airplane_mode=false/); assert.match(et, /Multiplayer\\nickname=Player1\nMultiplayer\\nickname\\default=false/);
  assert.strictEqual(kind('eden', 'rooms').on, true);
  // Ryujinx: multiplayer_mode as a number, passphrase checked
  await eng.set('ryujinx', 'ldn', true);
  assert.strictEqual(JSON.parse(fs.readFileSync(ryu, 'utf8')).multiplayer_mode, 1);
  await assert.rejects(() => eng.field('ryujinx', 'ldn', 'pass', 'secret'), /Ryujinx-/);
  await eng.field('ryujinx', 'ldn', 'pass', 'Ryujinx-0a1b2c3d');
  assert.strictEqual(kind('ryujinx', 'ldn').on, true);
  // Dolphin: sections added in its own spacing
  await eng.set('dolphin', 'bba', true); await eng.set('dolphin', 'netplay', true);
  assert.match(fs.readFileSync(dol, 'utf8'), /\[Core\]\nCPUCore = 1\nSerialPort1 = 12[\s\S]*\[NetPlay\]\nTraversalChoice = traversal/);
  // Azahar: no switch, Pretendo files reported
  const pre = kind('azahar', 'pretendo');
  assert.strictEqual(pre.info, true); assert.strictEqual(pre.ready, false); assert.match(pre.note, /SecureInfo_A/); assert.doesNotMatch(pre.note, /otp\.bin/);
  await assert.rejects(() => eng.set('azahar', 'pretendo', true), /Unknown/);
});
