// Emulator patches (0.9.3 D7): RPCS3's patch list for a game, and turning patches on and off in
// its patch_config.yml without touching anything else in it.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('../electron/patches.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cart-patch-'));
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

// a PARAM.SFO with text entries
function sfo(entries) {
  const keys = Object.keys(entries);
  const kt = Buffer.from(keys.map((k) => k + '\0').join(''), 'latin1');
  const vals = keys.map((k) => Buffer.from(entries[k] + '\0', 'utf8'));
  const head = Buffer.alloc(20 + keys.length * 16);
  head.writeUInt32BE(0x00505346, 0); head.writeUInt32LE(0x101, 4);
  head.writeUInt32LE(head.length, 8); head.writeUInt32LE(head.length + kt.length, 12); head.writeUInt32LE(keys.length, 16);
  let ko = 0, vo = 0;
  keys.forEach((k, i) => { const e = 20 + i * 16; head.writeUInt16LE(ko, e); head.writeUInt16LE(0x0204, e + 2); head.writeUInt32LE(vals[i].length, e + 4); head.writeUInt32LE(vals[i].length, e + 8); head.writeUInt32LE(vo, e + 12); ko += k.length + 1; vo += vals[i].length; });
  return Buffer.concat([head, kt, ...vals]);
}

const PATCH_YML = `Version: 1.2

PPU-aaaa1111:
  "60 FPS":
    Games:
      "Tokyo Jungle":
        NPUA80523: [ 01.00, 01.01 ]
    Author: someone
    Notes: Needs a fast CPU
    Patch Version: 1.0
    Patch:
      - [ be32, 0x10, 0x60000000 ]
  "Disable blur":
    Games:
      "Tokyo Jungle":
        NPUA80523: [ All ]
    Patch Version: 1.0
    Patch:
      - [ be32, 0x20, 0x60000000 ]
PPU-bbbb2222:
  "Other game patch":
    Games:
      "Other":
        BLUS30001: [ 01.00 ]
    Patch:
      - [ be32, 0x30, 0x0 ]
`;
// what the user already had: a patch for another game, turned on in RPCS3
const USER_CFG = `PPU-bbbb2222:
  Other game patch:
    Other:
      BLUS30001:
        01.00:
          Enabled: true
`;

function setup(name) {
  const root = path.join(TMP, name, '.config/rpcs3');
  // RPCS3 on Linux: config.yml and patch_config.yml in the root (config/ is Windows only, 0.9.63)
  fs.mkdirSync(path.join(root, 'patches'), { recursive: true });
  fs.writeFileSync(path.join(root, 'patches/patch.yml'), PATCH_YML);
  fs.writeFileSync(path.join(root, 'config.yml'), 'Video:\n  Renderer: Vulkan\n');
  fs.writeFileSync(path.join(root, 'patch_config.yml'), USER_CFG);
  const old = process.env.XDG_CONFIG_HOME; delete process.env.XDG_CONFIG_HOME;
  try { return P.rpcs3Dirs(path.join(TMP, name))[0]; } finally { if (old !== undefined) process.env.XDG_CONFIG_HOME = old; }
}

test('reads PARAM.SFO entries', () => {
  assert.deepStrictEqual(P.parseSfo(sfo({ APP_VER: '01.01', TITLE_ID: 'NPUA80523' })), { APP_VER: '01.01', TITLE_ID: 'NPUA80523' });
});

test('an installed update decides the game version', () => {
  const hdd = path.join(TMP, 'ver/dev_hdd0');
  fs.mkdirSync(path.join(hdd, 'game/NPUA80523'), { recursive: true });
  fs.writeFileSync(path.join(hdd, 'game/NPUA80523/PARAM.SFO'), sfo({ APP_VER: '01.01', TITLE_ID: 'NPUA80523' }));
  assert.strictEqual(P.ps3Version(path.join(TMP, 'ver/disc'), [hdd], 'NPUA80523'), '01.01');
});

test('lists this game and version only; versions stay text (01.00, not 1)', () => {
  const d = setup('list');
  const l = P.rpcs3List(d, 'NPUA80523', '01.01');
  assert.deepStrictEqual(l.map((p) => [p.description, p.version, p.on]), [['60 FPS', '01.01', false], ['Disable blur', 'All', false]]);
  assert.strictEqual(l[0].notes, 'Needs a fast CPU');
  // 0.9.21: with the copy's version known, patches for other versions are left out
  const v2 = P.rpcs3List(d, 'NPUA80523', '02.00');
  assert.deepStrictEqual(v2.map((p) => [p.description, p.other]), [['Disable blur', false]]);
  // version unknown: every version's patches, saying which version each is for
  const any = P.rpcs3List(d, 'NPUA80523', '');
  assert.ok(any.some((p) => p.description === '60 FPS'));
});

test('RPCS3\'s patch download: checksum checked, old file kept as patch.yml.old', async () => {
  const dir = path.join(TMP, 'dl/patches'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'patch.yml'), 'Version: 1.2\n');
  const text = PATCH_YML, sha = require('crypto').createHash('sha256').update(text).digest('hex').toUpperCase();
  let asked = '';
  const ok = async (url) => { asked = url; return { ok: true, json: async () => ({ return_code: 0, version: '1.2', sha256: sha, patch: text }) }; };
  assert.deepStrictEqual(await P.rpcs3DownloadPatches(dir, { fetchImpl: ok }), { updated: true });
  assert.match(asked, /^https:\/\/rpcs3\.net\/compatibility\?patch&api=v1&v=1\.2&sha256=[0-9a-f]{64}$/);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'patch.yml'), 'utf8'), text);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'patch.yml.old'), 'utf8'), 'Version: 1.2\n');
  const bad = async () => ({ ok: true, json: async () => ({ return_code: 0, version: '1.2', sha256: 'x', patch: text }) });
  await assert.rejects(P.rpcs3DownloadPatches(dir, { fetchImpl: bad }), /checksum/);
  const same = async () => ({ ok: true, json: async () => ({ return_code: 1 }) });
  assert.deepStrictEqual(await P.rpcs3DownloadPatches(dir, { fetchImpl: same }), { updated: false });
});

test('turning on and off writes RPCS3\'s own format and keeps the user\'s entries exactly', () => {
  const d = setup('set');
  const [fps] = P.rpcs3List(d, 'NPUA80523', '01.00');
  let mine = P.rpcs3Set(d, [{ ...fps, on: true }], {});
  const cfg = P.load(fs.readFileSync(d.config, 'utf8'));
  assert.strictEqual(cfg['PPU-aaaa1111']['60 FPS']['Tokyo Jungle'].NPUA80523['01.00'].Enabled, 'true');
  assert.strictEqual(cfg['PPU-bbbb2222']['Other game patch'].Other.BLUS30001['01.00'].Enabled, 'true');
  assert.match(fs.readFileSync(d.config, 'utf8'), /01\.00/); // still 01.00 for RPCS3
  assert.strictEqual(P.rpcs3List(d, 'NPUA80523', '01.00', mine)[0].by, 'cartridge');
  assert.ok(fs.existsSync(d.config + '.cartridge-backup'));
  mine = P.rpcs3Set(d, [{ ...fps, on: false }], mine);
  assert.deepStrictEqual(P.load(fs.readFileSync(d.config, 'utf8')), P.load(USER_CFG));
  assert.deepStrictEqual(mine, {});
});

test('a patch turned on in RPCS3 is never turned off by Cartridge', () => {
  const d = setup('theirs');
  const [other] = P.rpcs3List(d, 'BLUS30001', '01.00');
  assert.strictEqual(other.by, 'emulator');
  P.rpcs3Set(d, [{ ...other, on: false }], {});
  assert.strictEqual(P.rpcs3List(d, 'BLUS30001', '01.00')[0].on, true);
});

// ---------------------------------------------------------------- shadPS4
const SHAD_XML = `<?xml version="1.0" encoding="utf-8"?>
<Patch>
  <TitleID><ID>CUSA00001</ID></TitleID>
  <Metadata Title="Game" Name="60 FPS" Note="Unlocks the frame rate" Author="someone" PatchVer="1.0" AppVer="01.00" AppElf="eboot.bin">
    <PatchList><Line Type="bytes32" Address="0x10" Value="0x1"/></PatchList>
  </Metadata>
  <Metadata Title="Game" Name="60 FPS" Note="" Author="someone" PatchVer="1.0" AppVer="01.02" AppElf="eboot.bin" isEnabled="true">
    <PatchList><Line Type="bytes32" Address="0x20" Value="0x1"/></PatchList>
  </Metadata>
  <Metadata Title="Game" Name="Skip intro &amp; logos" Note="" Author="other" PatchVer="1.0" AppVer="mask" AppElf="eboot.bin">
    <PatchList><Line Type="mask" Address="aa bb" Value="cc"/></PatchList>
  </Metadata>
</Patch>
`;
function shadSetup(name) {
  const H = path.join(TMP, name);
  const repo = path.join(H, '.local/share/shadPS4/patches/shadPS4');
  fs.mkdirSync(repo, { recursive: true });
  fs.writeFileSync(path.join(repo, 'files.json'), JSON.stringify({ 'Game.xml': ['CUSA00001'] }));
  fs.writeFileSync(path.join(repo, 'Game.xml'), SHAD_XML);
  const old = process.env.XDG_DATA_HOME; delete process.env.XDG_DATA_HOME;
  try { return { dir: P.shadDirs(H)[0], xml: path.join(repo, 'Game.xml') }; } finally { if (old !== undefined) process.env.XDG_DATA_HOME = old; }
}

test('shadPS4: this version and "any version" patches, from files.json', () => {
  const { dir } = shadSetup('shad-list');
  assert.deepStrictEqual(P.shadList(dir, 'CUSA00001', '01.00').map((p) => [p.description, p.version, p.on]), [['60 FPS', '01.00', false], ['Skip intro & logos', 'All', false]]);
  assert.deepStrictEqual(P.shadList(dir, 'CUSA00001', '01.02').map((p) => [p.description, p.on, p.by]), [['60 FPS', true, 'emulator'], ['Skip intro & logos', false, null]]);
  assert.deepStrictEqual(P.shadList(dir, 'CUSA99999', '01.00'), []);
});

test('shadPS4: only isEnabled changes, and only on the patch picked', () => {
  const { dir, xml } = shadSetup('shad-set');
  const [fps, skip] = P.shadList(dir, 'CUSA00001', '01.00');
  let mine = P.shadSet(dir, [{ ...fps, on: true }, { ...skip, on: true }], {});
  const after = fs.readFileSync(xml, 'utf8');
  assert.strictEqual(after.replace(/ isEnabled="true"/g, '').replace('AppVer="01.02" AppElf="eboot.bin"', 'AppVer="01.02" AppElf="eboot.bin" isEnabled="true"'), SHAD_XML);
  assert.deepStrictEqual(P.shadList(dir, 'CUSA00001', '01.00', mine).map((p) => [p.on, p.by]), [[true, 'cartridge'], [true, 'cartridge']]);
  mine = P.shadSet(dir, [{ ...fps, on: false }, { ...skip, on: false }], mine);
  assert.strictEqual(fs.readFileSync(xml, 'utf8').replace(/ isEnabled="false"/g, ''), SHAD_XML);
  // the one the user turned on in shadPS4 can't be turned off from here
  const [theirs] = P.shadList(dir, 'CUSA00001', '01.02');
  P.shadSet(dir, [{ ...theirs, on: false }], mine);
  assert.strictEqual(P.shadList(dir, 'CUSA00001', '01.02')[0].on, true);
});

// ---------------------------------------------------------------- PCSX2 (0.9.3 K)
function gamelistCache(entries) {
  const parts = [Buffer.from([0x47, 0x4c, 0x43, 0x45]), Buffer.alloc(4)];
  parts[1].writeUInt32LE(34);
  const s = (v) => { const b = Buffer.from(v, 'utf8'); const n = Buffer.alloc(4); n.writeUInt32LE(b.length); return Buffer.concat([n, b]); };
  for (const e of entries) {
    const tail = Buffer.alloc(2 + 8 + 8 + 4 + 1); tail.writeUInt32LE(e.crc, 18);
    parts.push(s(e.path), s(e.serial), s('Title'), s('title'), s('Title'), tail);
  }
  return Buffer.concat(parts);
}
function pcsx2Setup(name, ini) {
  const H = path.join(TMP, name), root = path.join(H, '.config/PCSX2');
  for (const d of ['inis', 'cache', 'patches', 'gamesettings']) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, 'inis/PCSX2.ini'), '[Folders]\nCache = cache\nPatches = patches\n');
  const rom = path.join(H, 'roms/ps2/Game.chd'); fs.mkdirSync(path.dirname(rom), { recursive: true }); fs.writeFileSync(rom, '');
  fs.writeFileSync(path.join(root, 'cache/gamelist.cache'), gamelistCache([{ path: path.join(H, 'roms/ps2/Other.iso'), serial: 'SLUS-00001', crc: 0x11111111 }, { path: rom, serial: 'SLUS-21386', crc: 0xABCD1234 }]));
  fs.writeFileSync(path.join(root, 'patches/SLUS-21386_ABCD1234.pnach'), 'gametitle=Game\n\n[Widescreen 16:9]\nauthor=someone\ndescription=Wider\npatch=1,EE,00100000,word,00000000\n\n[60 FPS]\ncomment=Smoother // note\npatch=1,EE,00200000,word,00000000\n');
  if (ini != null) fs.writeFileSync(path.join(root, 'gamesettings/SLUS-21386_ABCD1234.ini'), ini);
  const old = process.env.XDG_CONFIG_HOME; delete process.env.XDG_CONFIG_HOME;
  try { return { dir: P.pcsx2Dirs(H)[0], rom, ini: path.join(root, 'gamesettings/SLUS-21386_ABCD1234.ini') }; } finally { if (old !== undefined) process.env.XDG_CONFIG_HOME = old; }
}

test('PCSX2: serial and CRC from its game list, patches from the pnach', async () => {
  const { dir, rom } = pcsx2Setup('p2-list');
  const game = P.pcsx2Game(dir, rom);
  assert.deepStrictEqual(game, { serial: 'SLUS-21386', crc: 0xABCD1234 });
  const l = await P.pcsx2List(dir, game, null, {});
  assert.deepStrictEqual(l.map((p) => [p.description, p.notes, p.author, p.on]), [['60 FPS', 'Smoother', '', false], ['Widescreen 16:9', 'Wider', 'someone', false]]);
});

test('PCSX2: only its own Enable lines are added and removed; the rest of the game ini stays', async () => {
  const USER = '[EmuCore/GS]\nupscale_multiplier = 3\n\n[Patches]\nEnable = Their Patch\n';
  const { dir, rom, ini } = pcsx2Setup('p2-set', USER);
  const game = P.pcsx2Game(dir, rom);
  const [fps] = await P.pcsx2List(dir, game, null, {});
  let mine = P.pcsx2Set(dir, game, [{ ...fps, on: true }], {});
  assert.strictEqual(fs.readFileSync(ini, 'utf8'), '[EmuCore/GS]\nupscale_multiplier = 3\n\n[Patches]\nEnable = Their Patch\nEnable = 60 FPS\n');
  assert.strictEqual((await P.pcsx2List(dir, game, null, mine)).find((p) => p.name === '60 FPS').by, 'cartridge');
  mine = P.pcsx2Set(dir, game, [{ ...fps, on: false }], mine);
  assert.strictEqual(fs.readFileSync(ini, 'utf8'), USER);
  assert.deepStrictEqual(mine, {});
});

test('PCSX2: a game without settings gets a new file with just the patch', async () => {
  const { dir, rom, ini } = pcsx2Setup('p2-new');
  const game = P.pcsx2Game(dir, rom);
  const l = await P.pcsx2List(dir, game, null, {});
  P.pcsx2Set(dir, game, [{ ...l[1], on: true }], {});
  assert.strictEqual(fs.readFileSync(ini, 'utf8'), '[Patches]\nEnable = Widescreen 16:9\n');
});

// ---------------------------------------------------------------- RPCS3 database settings (0.9.3 L)
test('RPCS3 database: writes the game\'s settings once, never over its own', () => {
  const root = path.join(TMP, 'rpcs3db');
  fs.mkdirSync(root, { recursive: true });
  const dir = { root };
  const DB = JSON.stringify({ return_code: 0, games: { BLUS30443: { config: 'Core:\n  SPU Block Size: Mega\n' } } });
  const a = P.rpcs3ApplyDb(dir, 'BLUS30443', DB, {});
  assert.strictEqual(a.result, 'written');
  assert.strictEqual(fs.readFileSync(path.join(root, 'custom_configs/config_BLUS30443.yml'), 'utf8'), 'Core:\n  SPU Block Size: Mega\n');
  assert.ok(a.mine.BLUS30443);
  assert.strictEqual(P.rpcs3ApplyDb(dir, 'BLUS30443', DB, a.mine).result, 'exists');
  assert.strictEqual(P.rpcs3ApplyDb(dir, 'BCUS98137', DB, {}).result, 'none');
});

// PS2 ISO read like PCSX2 does (0.9.3 L): no game list needed
function ps2Iso(file, elf) {
  const S = 2048, img = Buffer.alloc(S * 24);
  const rec = (name, lba, size, dir) => { const n = Buffer.from(name, 'latin1'); const len = 33 + n.length + ((33 + n.length) % 2); const b = Buffer.alloc(len); b[0] = len; b.writeUInt32LE(lba, 2); b.writeUInt32LE(size, 10); b[25] = dir ? 2 : 0; b[32] = n.length; n.copy(b, 33); return b; };
  const pvd = img.subarray(16 * S); pvd[0] = 1; pvd.write('CD001', 1, 'latin1');
  rec('\0', 20, S, true).copy(pvd, 156);
  const cnf = Buffer.from('BOOT2 = cdrom0:\\SLUS_213.86;1\r\nVER = 1.00\r\nVMODE = NTSC\r\n', 'latin1');
  Buffer.concat([rec('\0', 20, S, true), rec('\x01', 20, S, true), rec('SYSTEM.CNF;1', 21, cnf.length), rec('SLUS_213.86;1', 22, elf.length)]).copy(img, 20 * S);
  cnf.copy(img, 21 * S); elf.copy(img, 22 * S);
  fs.writeFileSync(file, img);
}
test('PCSX2: a PS2 ISO gives its serial and CRC without PCSX2\'s game list', () => {
  const elf = Buffer.alloc(16); elf.writeUInt32LE(0x7f454c46, 0); elf.writeUInt32LE(0x11111111, 4); elf.writeUInt32LE(0x0000ffff, 8); elf.writeUInt32LE(0x12340000, 12);
  const f = path.join(TMP, 'game.iso'); ps2Iso(f, elf);
  const crc = (0x7f454c46 ^ 0x11111111 ^ 0x0000ffff ^ 0x12340000) >>> 0;
  assert.deepStrictEqual(P.ps2IsoInfo(f), { serial: 'SLUS-21386', crc });
  assert.strictEqual(P.ps2IsoInfo(path.join(TMP, 'nope.iso')), null);
});

test('a file inside a folder of an ISO (PS3_GAME/PARAM.SFO)', () => {
  const S = 2048, img = Buffer.alloc(S * 24);
  const rec = (name, lba, size, dir) => { const n = Buffer.from(name, 'latin1'); const len = 33 + n.length + ((33 + n.length) % 2); const b = Buffer.alloc(len); b[0] = len; b.writeUInt32LE(lba, 2); b.writeUInt32LE(size, 10); b[25] = dir ? 2 : 0; b[32] = n.length; n.copy(b, 33); return b; };
  const pvd = img.subarray(16 * S); pvd[0] = 1; pvd.write('CD001', 1, 'latin1'); rec('\0', 20, S, true).copy(pvd, 156);
  const param = sfo({ TITLE_ID: 'NPUA80523', APP_VER: '01.00' });
  Buffer.concat([rec('\0', 20, S, true), rec('\x01', 20, S, true), rec('PS3_GAME', 21, S, true)]).copy(img, 20 * S);
  Buffer.concat([rec('\0', 21, S, true), rec('\x01', 20, S, true), rec('PARAM.SFO;1', 22, param.length)]).copy(img, 21 * S);
  param.copy(img, 22 * S);
  const f = path.join(TMP, 'ps3.iso'); fs.writeFileSync(f, img);
  assert.strictEqual(P.parseSfo(P.isoFile(f, ['PS3_GAME', 'PARAM.SFO'])).TITLE_ID, 'NPUA80523');
});

test('PS3 updates: Sony\'s list read in version order, only newer ones to install', async () => {
  const U = require('../electron/ps3Updates.js');
  const xml = `<?xml version="1.0"?><titlepatch status="alive" titleid="BCUS98123"><tag name="BCUS98123_T5"><package version="01.06" size="200" sha1sum="aa" url="http://b0.ww.np.dl.playstation.net/x/UP9000-BCUS98123_00-A0106-V0100-PE.pkg" ps3_system_ver="03.5000"/><package version="01.01" size="100" sha1sum="bb" url="http://b0.ww.np.dl.playstation.net/x/UP9000-BCUS98123_00-A0101-V0100-PE.pkg" ps3_system_ver="03.4100"><paramsfo><TITLE>Uncharted 2</TITLE></paramsfo></package></tag></titlepatch>`;
  const l = U.parseList(xml);
  assert.strictEqual(l.title, 'Uncharted 2');
  assert.deepStrictEqual(l.packages.map((p) => p.version), ['01.01', '01.06']);
  assert.deepStrictEqual(U.newer(l.packages, '01.01').map((p) => p.version), ['01.06']);
  assert.deepStrictEqual(U.newer(l.packages, '01.06'), []);
  let asked = '';
  assert.deepStrictEqual((await U.updatesFor('BCUS98123', { get: async (u) => { asked = u; return ''; } })).packages, []);
  assert.strictEqual(asked, 'http://a0.ww.np.dl.playstation.net/tpl/np/BCUS98123/BCUS98123-ver.xml');
});
