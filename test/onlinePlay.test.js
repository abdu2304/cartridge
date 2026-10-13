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
