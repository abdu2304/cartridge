// Add-ons into every emulator's own layout (0.9.84, sweep round 8): a game per console, each emulator's folders as it
// leaves them after a first start (Flatpak), then a texture pack or mod per emulator installed the way Install a
// Download does it. Each must land where that emulator loads it from (modRules.js RULES, with its source), an archive
// that doesn't fit must be refused with nothing written, and Remove must take back exactly what was put there.
//   npx vite build && xvfb-run -a node test/e2e/addons.js
const fs = require('fs');
const path = require('path');
const mock = require('./mockRomm');
const { launch, put } = require('./homes');
const { iso, ELF, gcm, n3ds } = require('./discs');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a40000000049454e44ae426082', 'hex');
const V = '.var/app';
const CFG = {
  [`${V}/net.pcsx2.PCSX2/config/PCSX2/inis/PCSX2.ini`]: '[UI]\nSettingsVersion = 1\n[EmuCore/GS]\nLoadTextureReplacements = false\n',
  [`${V}/org.duckstation.DuckStation/data/duckstation/settings.ini`]: '[Main]\nSettingsVersion = 3\n[TextureReplacements]\nEnableTextureReplacements = false\n',
  [`${V}/org.DolphinEmu.dolphin-emu/config/dolphin-emu/Dolphin.ini`]: '[General]\nISOPaths = 0\n',
  [`${V}/org.DolphinEmu.dolphin-emu/config/dolphin-emu/GFX.ini`]: '[Settings]\nHiresTextures = False\n',
  [`${V}/org.ppsspp.PPSSPP/config/ppsspp/PSP/SYSTEM/ppsspp.ini`]: '[General]\nFirstRun = False\n',
  [`${V}/org.azahar_emu.Azahar/config/azahar-emu/qt-config.ini`]: '[Utility]\ncustom_textures\\default=true\ncustom_textures=false\n',
  [`${V}/dev.eden_emu.eden/config/eden/qt-config.ini`]: '[Renderer]\nbackend=1\n',
  [`${V}/io.github.ryubing.Ryujinx/config/Ryujinx/Config.json`]: '{"version":67}',
  [`${V}/info.cemu.Cemu/config/Cemu/settings.xml`]: '<?xml version="1.0" encoding="UTF-8"?>\n<content>\n</content>\n',
  [`${V}/net.shadps4.shadPS4/data/shadPS4/config.json`]: '{"General":{}}',
};
const GAMES = [
  { id: 801, plat: [42, 'ps2', 'PlayStation 2'], name: 'Sky Odyssey', files: [['Sky Odyssey.iso', iso({ 'SYSTEM.CNF': Buffer.from('BOOT2 = cdrom0:\\SLUS_200.62;1\r\n'), 'SLUS_200.62': ELF })]] },
  { id: 802, plat: [41, 'psx', 'PlayStation'], name: 'Pocket Racer', files: [['Pocket Racer.iso', iso({ 'SYSTEM.CNF': Buffer.from('BOOT = cdrom:\\SLUS_005.94;1\r\n'), 'SLUS_005.94': ELF })]] },
  { id: 803, plat: [44, 'ngc', 'Nintendo GameCube'], name: 'Island Kart', files: [['Island Kart.iso', gcm('GKTE01')]] },
  { id: 804, plat: [43, 'psp', 'PlayStation Portable'], name: 'Pocket Saga', files: [['Pocket Saga.iso', iso({ 'PSP_GAME/PARAM.SFO': mock.sfo({ DISC_ID: 'ULUS10500', TITLE: 'Pocket Saga' }) })]] },
  { id: 805, plat: [46, '3ds', 'Nintendo 3DS'], name: 'Pocket Garden', files: [['Pocket Garden.3ds', n3ds('0004000000030800')]] },
  { id: 806, plat: [45, 'switch', 'Nintendo Switch'], name: 'Mountain Trail', files: [['Mountain Trail [0100A00000010000][v0].nsp', Buffer.alloc(4096, 5)]] },
  { id: 807, plat: [47, 'wiiu', 'Wii U'], name: 'Tennis Open', files: [['Tennis Open.wua', fs.readFileSync(path.join(__dirname, '../fixtures/mario-tennis.wua'))]] },
  { id: 808, plat: [52, 'ps4', 'PlayStation 4'], name: 'Night Walk', dir: 'Night Walk', files: [['sce_sys/param.sfo', mock.sfo({ TITLE_ID: 'CUSA00001', TITLE: 'Night Walk', CATEGORY: 'gd', APP_VER: '01.00' })], ['eboot.bin', ELF], ['dvdroot_ps4/data.bin', Buffer.alloc(64, 1)]] },
];
const P = {
  pcsx2: `${V}/net.pcsx2.PCSX2/config/PCSX2`, duck: `${V}/org.duckstation.DuckStation/data/duckstation`, dolphin: `${V}/org.DolphinEmu.dolphin-emu/data/dolphin-emu`,
  ppsspp: `${V}/org.ppsspp.PPSSPP/config/ppsspp`, azahar: `${V}/org.azahar_emu.Azahar/data/azahar-emu`, eden: `${V}/dev.eden_emu.eden/data/eden`,
  ryu: `${V}/io.github.ryubing.Ryujinx/config/Ryujinx`, cemu: `${V}/info.cemu.Cemu/data/Cemu`,
};
// [game, emulator, pack name, kind, archive entries, files it must give (relative to the home or, for "@roms/", the roms folder), texture switch file + key now on]
const CASES = [
  [801, 'pcsx2', 'Sky HD', 'tex', [['replacements/sky.png', PNG]], [`${P.pcsx2}/textures/SLUS-20062/replacements/sky.png`], [`${P.pcsx2}/inis/PCSX2.ini`, /LoadTextureReplacements\s*=\s*true/]],
  [801, 'pcsx2', 'Sky 60 FPS', 'mods', [['SLUS-20062_ABCD1234.pnach', Buffer.from('patch=1,EE,00100000,word,00000000\n')]], [`${P.pcsx2}/patches/SLUS-20062_ABCD1234.pnach`]],
  [802, 'duckstation', 'Racer HD', 'tex', [['replacements/car.png', PNG]], [`${P.duck}/textures/SLUS-00594/replacements/car.png`], [`${P.duck}/settings.ini`, /EnableTextureReplacements\s*=\s*true/]],
  [803, 'dolphin', 'Kart HD', 'tex', [['GKTE01/tex1_64x64_abc.png', PNG]], [`${P.dolphin}/Load/Textures/GKTE01/tex1_64x64_abc.png`], [`${V}/org.DolphinEmu.dolphin-emu/config/dolphin-emu/GFX.ini`, /HiresTextures\s*=\s*True/]],
  [804, 'ppsspp', 'Saga HD', 'tex', [['textures.ini', Buffer.from('[options]\nversion = 1\n')], ['a.png', PNG]], [`${P.ppsspp}/PSP/TEXTURES/ULUS10500/textures.ini`, `${P.ppsspp}/PSP/TEXTURES/ULUS10500/a.png`]],
  [805, 'azahar', 'Garden HD', 'tex', [['tex1_32x32_ff.png', PNG]], [`${P.azahar}/load/textures/0004000000030800/tex1_32x32_ff.png`], [`${V}/org.azahar_emu.Azahar/config/azahar-emu/qt-config.ini`, /custom_textures=true/]],
  [805, 'azahar', 'Garden Mod', 'mods', [['romfs/data/a.bin', Buffer.alloc(32, 2)]], [`${P.azahar}/load/mods/0004000000030800/romfs/data/a.bin`]],
  [806, 'eden', 'Trail Mod', 'mods', [['romfs/data/a.bin', Buffer.alloc(32, 3)]], [`${P.eden}/load/0100A00000010000/*/romfs/data/a.bin`]],
  [806, 'ryujinx', 'Trail Mod', 'mods', [['romfs/data/a.bin', Buffer.alloc(32, 4)]], [`${P.ryu}/mods/contents/0100a00000010000/*/romfs/data/a.bin`]],
  [807, 'cemu', 'Tennis 60', 'mods', [['Tennis60/rules.txt', Buffer.from('[Definition]\ntitleIds = 00050000101C9400\nname = 60 FPS\nversion = 6\n')]], [`${P.cemu}/graphicPacks/*/rules.txt`]],
  [808, 'shadps4', 'Walk Mod', 'mods', [['dvdroot_ps4/data.bin', Buffer.alloc(64, 9)]], ['@roms/ps4/Night Walk-mods/dvdroot_ps4/data.bin']],
];
// files under a pattern with * for one folder level
const globOne = (p) => { const i = p.indexOf('*'); if (i < 0) return fs.existsSync(p) ? [p] : []; const dir = p.slice(0, i - 1), rest = p.slice(i + 2); let kids = []; try { kids = fs.readdirSync(dir); } catch {} return kids.flatMap((k) => globOne(path.join(dir, k, rest))); };
const walk = (d) => { const out = []; const go = (x) => { let e; try { e = fs.readdirSync(x, { withFileTypes: true }); } catch { return; } for (const k of e) { const p = path.join(x, k.name); if (k.isDirectory()) go(p); else out.push(p); } }; go(d); return out; };

(async () => {
  const srv = await mock.start({ games: 0, extra: { games: GAMES } });
  const t = await launch('flatpaks', srv);
  const { errors, home, roms, data } = t;
  const call = (ch, a) => t.call(ch, a).catch((e) => ({ error: String(e.message).split('\n')[0].replace(/^.*?Error: /, '') }));
  const where = (f) => (f.startsWith('@roms/') ? path.join(roms, f.slice(6)) : path.join(home, f));
  const snapshot = () => walk(home).filter((f) => !f.startsWith(data + path.sep) && !f.includes(`${path.sep}Downloads${path.sep}`));
  try {
    for (const [f, s] of Object.entries(CFG)) put(path.join(home, f), s);
    for (const g of GAMES) for (const [n, d] of g.files) put(path.join(roms, g.plat[1], g.dir ? path.join(g.dir, n) : n), d);
    await wait(2500);
    await call('library:sync'); await call('installed:rescan'); await wait(1500);
    for (const [i, [romId, emu, name, kind, entries, want, tex]] of CASES.entries()) {
      const label = `${emu} · ${name}`;
      const list = await call('addons:forGame', { romId });
      const e = (Array.isArray(list) ? list : []).find((x) => x.id === emu);
      if (!e) { check(`${label}: ${emu} offered for the game`, false, JSON.stringify(list).slice(0, 200)); continue; }
      check(`${label}: knows the game's folder`, !!e.folder, e.folder ? path.relative(home, e.folder) : 'no ID read');
      if (!e.folder) continue;
      // first an archive that doesn't fit this emulator: refused, nothing written
      const junk = put(path.join(home, 'Downloads', `junk-${i}.zip`), mock.zip([['readme.txt', Buffer.from('hello')]]));
      const before = snapshot();
      const r0 = await call('addons:install', { romId, emuRoot: e.emuRoot, pack: { source: 'local', id: 'junk' + i, name: 'Junk', kind, file: junk } });
      const after0 = snapshot().filter((f) => !before.includes(f));
      check(`${label}: an archive that doesn't fit is refused, nothing written`, r0?.error && !after0.length, r0?.error ? `${r0.error.slice(0, 90)}${after0.length ? ' · wrote ' + after0.map((f) => path.relative(home, f)).join(', ') : ''}` : 'installed');
      // then the real one
      const file = put(path.join(home, 'Downloads', `pack-${i}.zip`), mock.zip(entries));
      const pre = snapshot();
      const r = await call('addons:install', { romId, emuRoot: e.emuRoot, pack: { source: 'local', id: 'p' + i, name, kind, file } });
      if (r?.error) { check(`${label}: installed`, false, r.error); continue; }
      const got = want.map((w) => [w, globOne(where(w))]);
      check(`${label}: where ${emu} loads it`, got.every(([, f]) => f.length === 1), got.map(([w, f]) => `${w.replace(/^\.var\/app\//, '')}${f.length === 1 ? '' : ' MISSING'}`).join(' | '));
      const added = snapshot().filter((f) => !pre.includes(f));
      const extra = added.filter((f) => !got.some(([, g]) => g.includes(f)) && !(tex && f === path.join(home, tex[0])));
      check(`${label}: nothing else written`, !extra.length, extra.map((f) => path.relative(home, f)).join(' | '));
      if (tex) check(`${label}: textures turned on in ${path.basename(tex[0])}`, tex[1].test(fs.readFileSync(path.join(home, tex[0]), 'utf8')) && r.autoOn !== false, `autoOn ${r.autoOn}`);
      // Remove takes back what it put there and nothing else
      const recs = await call('addons:installed');
      const rec = (Array.isArray(recs) ? recs : []).find((x) => x.id === 'p' + i && x.romId === romId);
      if (!rec) { check(`${label}: recorded`, false); continue; }
      const rm = await call('addons:remove', { key: rec.key });
      const left = got.flatMap(([, f]) => f).filter((f) => fs.existsSync(f));
      const gone = pre.filter((f) => !fs.existsSync(f) && !f.startsWith(path.join(home, 'Downloads')));
      check(`${label}: Remove took it back`, !rm?.error && !left.length && !gone.length, rm?.error || [...left.map((f) => 'left ' + path.relative(home, f)), ...gone.map((f) => 'deleted ' + path.relative(home, f))].join(' | '));
    }
    check('the game folders were never touched', GAMES.every((g) => g.files.every(([n, d]) => { try { return fs.readFileSync(path.join(roms, g.plat[1], g.dir ? path.join(g.dir, n) : n)).equals(d); } catch { return false; } })));
    check('no script errors', !errors.length, errors.slice(0, 3).join(' | '));
  } catch (e) { check('run finished', false, e.stack); }
  await t.close(); await srv.close();
  const bad = results.filter((x) => !x.ok).length;
  console.log(`== add-ons: ${results.length - bad} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
