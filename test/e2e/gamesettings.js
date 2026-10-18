// Game settings for every emulator (0.9.84, sweep round 7): a game per console sitting in its folder, each emulator's
// settings file as it leaves it after a first start (Flatpak folders where there is one), then through Cartridge: the
// game's settings listed, one changed and read back from the list and the file, then put back to the emulator's own,
// with every file still readable. A console that can't be changed must say why in a sentence.
//   npx vite build && xvfb-run -a node test/e2e/gamesettings.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const mock = require('./mockRomm');
const { launch, put } = require('./homes');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const { iso, ELF, gcm, dcImg, stfs } = require('./discs');
const pf = (n, d) => [n, d];
// [console, RomM platform, game, files placed in the roms folder, settings files]
const CASES = [
  { key: 'ps3', plat: [40, 'ps3', 'PlayStation 3'], name: 'Rally Cross [BLUS30001]', dir: 'Rally Cross [BLUS30001]', files: [pf('PS3_GAME/PARAM.SFO', mock.sfo({ TITLE_ID: 'BLUS30001', TITLE: 'Rally Cross' }))], emu: 'rpcs3', cfg: { '.var/app/net.rpcs3.RPCS3/config/rpcs3/config.yml': 'Core:\n  PPU Decoder: Recompiler (LLVM)\nVideo:\n  Renderer: Vulkan\n' } },
  { key: 'psx', plat: [41, 'psx', 'PlayStation'], name: 'Pocket Racer', files: [pf('Pocket Racer.iso', iso({ 'SYSTEM.CNF': Buffer.from('BOOT = cdrom:\\SLUS_005.94;1\r\nTCB = 4\r\n'), 'SLUS_005.94': ELF }))], emu: 'duckstation', cfg: { '.var/app/org.duckstation.DuckStation/data/duckstation/settings.ini': '[Main]\nSettingsVersion = 3\n[GPU]\nRenderer = Vulkan\n' } },
  { key: 'ps2', plat: [42, 'ps2', 'PlayStation 2'], name: 'Sky Odyssey', files: [pf('Sky Odyssey.iso', iso({ 'SYSTEM.CNF': Buffer.from('BOOT2 = cdrom0:\\SLUS_200.62;1\r\nVER = 1.00\r\n'), 'SLUS_200.62': ELF }))], emu: 'pcsx2', cfg: { '.var/app/net.pcsx2.PCSX2/config/PCSX2/inis/PCSX2.ini': '[UI]\nSettingsVersion = 1\n[EmuCore/GS]\nRenderer = -1\n' } },
  { key: 'psp', plat: [43, 'psp', 'PlayStation Portable'], name: 'Pocket Saga', files: [pf('Pocket Saga [ULUS10500].iso', Buffer.alloc(4096, 3))], emu: 'ppsspp', cfg: { '.var/app/org.ppsspp.PPSSPP/config/ppsspp/PSP/SYSTEM/ppsspp.ini': '[General]\nFirstRun = False\n[Graphics]\nInternalResolution = 1\n' } },
  { key: 'ngc', plat: [44, 'ngc', 'Nintendo GameCube'], name: 'Island Kart', files: [pf('Island Kart.iso', gcm('GKTE01'))], emu: 'dolphin', cfg: { '.var/app/org.DolphinEmu.dolphin-emu/config/dolphin-emu/Dolphin.ini': '[General]\nISOPaths = 0\n[Core]\nCPUThread = True\n', '.var/app/org.DolphinEmu.dolphin-emu/config/dolphin-emu/GFX.ini': '[Settings]\nInternalResolution = 1\n' } },
  { key: 'switch', plat: [45, 'switch', 'Nintendo Switch'], name: 'Mountain Trail', files: [pf('Mountain Trail [0100A00000010000].nsp', Buffer.alloc(4096, 5))], emu: 'eden', cfg: { '.var/app/dev.eden_emu.eden/config/eden/qt-config.ini': '[Renderer]\nbackend\\default=true\nbackend=1\n[System]\nlanguage_index\\default=true\nlanguage_index=1\n' } },
  { key: '3ds', plat: [46, '3ds', 'Nintendo 3DS'], name: 'Pocket Garden', files: [pf('Pocket Garden [0004000000030800].3ds', Buffer.alloc(4096, 6))], emu: 'azahar', cfg: { '.var/app/org.azahar_emu.Azahar/config/azahar-emu/qt-config.ini': '[Renderer]\ngraphics_api\\default=true\ngraphics_api=1\n' } },
  { key: 'wiiu', plat: [47, 'wiiu', 'Wii U'], name: 'Tennis Open', files: [pf('Tennis Open.wua', fs.readFileSync(path.join(__dirname, '../fixtures/mario-tennis.wua')))], emu: 'cemu', cfg: { '.var/app/info.cemu.Cemu/config/Cemu/settings.xml': '<?xml version="1.0" encoding="UTF-8"?>\n<content>\n  <Graphic>\n    <api>1</api>\n  </Graphic>\n</content>\n' } },
  { key: 'psvita', plat: [48, 'psvita', 'PlayStation Vita'], name: 'Gravity Run', files: [pf('Gravity Run [PCSE00001].vpk', Buffer.alloc(4096, 8))], emu: 'vita3k', cfg: { '.config/Vita3K/config.yml': '---\nbackend-renderer: Vulkan\nresolution-multiplier: 1\n...\n' } },
  { key: 'xbox360', plat: [49, 'xbox360', 'Xbox 360'], name: 'Halo Field', files: [pf('Halo Field', stfs('584111F7'))], emu: 'xenia', cfg: { '.local/share/Xenia/xenia-canary.config.toml': '[GPU]\ngpu = "any"\n[Display]\nfullscreen = false\n' } },
  { key: 'dc', plat: [50, 'dc', 'Dreamcast'], name: 'Crazy Cab', files: [pf('Crazy Cab.iso', dcImg('MK-51035'))], emu: 'flycast', cfg: { '.var/app/org.flycast.Flycast/config/flycast/emu.cfg': '[config]\npvr.rend = 0\nrend.Resolution = 480\n' } },
  { key: 'arcade', plat: [51, 'arcade', 'Arcade'], name: 'Street Brawl', files: [pf('sbrawl.zip', mock.zip([['sbrawl.bin', Buffer.alloc(512, 1)]]))], emu: 'mame', cfg: { '.var/app/org.mamedev.MAME/.mame/mame.ini': 'inipath                   $HOME/.mame;.;ini\nvideo                     auto\n' } },
  { key: 'ps4', plat: [52, 'ps4', 'PlayStation 4'], name: 'Night Walk', dir: 'Night Walk', files: [pf('sce_sys/param.sfo', mock.sfo({ TITLE_ID: 'CUSA00001', TITLE: 'Night Walk', CATEGORY: 'gd', APP_VER: '01.00' })), pf('eboot.bin', ELF)], emu: 'shadps4', cfg: { '.var/app/net.shadps4.shadPS4/data/shadPS4/config.json': '{"General":{"isPSNSignedIn":false},"GPU":{"screenWidth":1280}}' } },
  { key: 'snes', plat: [53, 'snes', 'Super Nintendo'], name: 'Star Quest', files: [pf('Star Quest.sfc', Buffer.alloc(4096, 10))], emu: 'retroarch', cfg: { '.var/app/org.libretro.RetroArch/config/retroarch/retroarch.cfg': 'video_driver = "vulkan"\ncore_options_path = "default"\n', '.var/app/org.libretro.RetroArch/config/retroarch/cores/snes9x_libretro.so': '' } },
];
const GAMES = CASES.map((c, i) => ({ id: 700 + i, plat: c.plat, name: c.name, dir: c.dir, files: c.files }));

const readable = (f) => {
  let text; try { text = fs.readFileSync(f, 'utf8'); } catch { return null; }
  try {
    if (/\.json$/.test(f)) JSON.parse(text);
    else if (/\.ya?ml$/.test(f)) yaml.load(text);
    else if (/\.xml$/.test(f)) { if (!/<\?xml[\s\S]*<\/[A-Za-z]+>\s*$/.test(text)) throw new Error('not closed'); }
    else if (/\.(ini|cfg|toml|opt)$/.test(f)) { if (/\n\s*\[[^\]\n]*$/m.test(text)) throw new Error('broken section header'); }
    return null;
  } catch (e) { return e.message; }
};
// a value that differs from the game's own and the emulator's: another choice, the other side of a switch, a number in range
const another = (it) => {
  const cur = String(it.game ?? it.base ?? '');
  if (it.options?.length >= 2) return it.options.map((o) => String(o.value)).find((v) => v !== cur);
  if (it.num) { const n = it.num.min + (it.num.decimals ? 0.5 : 1); return String(n <= it.num.max ? n : it.num.min); }
  return null;
};
const walk = (d) => { const out = []; const go = (x) => { let e; try { e = fs.readdirSync(x, { withFileTypes: true }); } catch { return; } for (const k of e) { const p = path.join(x, k.name); if (k.isDirectory()) go(p); else out.push(p); } }; go(d); return out; };

(async () => {
  const srv = await mock.start({ games: 0, extra: { games: GAMES } });
  const t = await launch('flatpaks', srv);
  const { errors, home, roms } = t;
  const call = (ch, a) => t.call(ch, a).catch((e) => ({ error: String(e.message).split('\n')[0].replace(/^.*?Error: /, '') }));
  try {
    for (const c of CASES) {
      for (const [f, s] of Object.entries(c.cfg)) put(path.join(home, f), s);
      for (const [n, d] of c.files) put(path.join(roms, c.plat[1], c.dir ? path.join(c.dir, n) : n), d);
    }
    await wait(2500);
    await call('library:sync');
    await call('installed:rescan');
    await wait(1500);
    for (const [i, c] of CASES.entries()) {
      const romId = 700 + i, name = `${c.key} · ${c.emu}`;
      const before = walk(home).filter((f) => !f.includes('/.config/Cartridge/'));
      const d = await call('gamesettings:get', { romId });
      if (d?.why || d?.error) { check(`${name}: settings listed`, false, d.why || d.error); continue; }
      const items = (d?.items || []).filter((x) => !x.locked && x.type !== 'text');
      check(`${name}: settings listed (${d?.name})`, items.length > 0, `${(d?.items || []).length} settings`);
      const it = items.find((x) => another(x) != null);
      if (!it) { check(`${name}: a setting to change`, false); continue; }
      const v = another(it);
      const set = await call('gamesettings:set', { romId, changes: [{ id: it.id, value: v }] });
      const back = (set?.items || []).find((x) => x.id === it.id);
      check(`${name}: ${it.label} = ${v} read back`, !set?.error && String(back?.game) === v, set?.error || `game ${back?.game}`);
      const file = set?.file || d.file;
      check(`${name}: written to ${file ? path.relative(home, file) : '?'}`, file && fs.existsSync(file) && !readable(file), file ? readable(file) || '' : 'no file');
      const again = await call('gamesettings:get', { romId });
      check(`${name}: still set when listed again`, String((again?.items || []).find((x) => x.id === it.id)?.game) === v);
      const reset = await call('gamesettings:set', { romId, changes: [{ id: it.id, value: null }] });
      const r = (reset?.items || []).find((x) => x.id === it.id);
      check(`${name}: back to the emulator's own`, !reset?.error && (r?.game == null || String(r.game) === String(r.base ?? it.base)), reset?.error || `game ${r?.game} base ${r?.base}`);
      const bad = walk(home).filter((f) => !f.includes('/.config/Cartridge/') && !/\.(so|iso|nsp|3ds|wua|vpk|sfc|zip|bin|sfo)$/i.test(f)).map((f) => [f, readable(f)]).filter(([, w]) => w);
      check(`${name}: every settings file still readable`, !bad.length, bad.map(([f, w]) => `${path.relative(home, f)}: ${w}`).join(' | '));
      // nothing left behind but the emulator's own per-game file (if it keeps one) and Cartridge's records
      const left = walk(home).filter((f) => !f.includes('/.config/Cartridge/') && !before.includes(f) && !(file && f === file));
      check(`${name}: nothing else left behind`, !left.some((f) => /\.cartridge-new$/.test(f)), left.map((f) => path.relative(home, f)).join(' | '));
    }
    check('no script errors', !errors.length, errors.slice(0, 3).join(' | '));
  } catch (e) { check('run finished', false, e.stack); }
  await t.close(); await srv.close();
  const bad = results.filter((x) => !x.ok).length;
  console.log(`== game settings: ${results.length - bad} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
