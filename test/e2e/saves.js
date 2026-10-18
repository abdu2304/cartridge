// Saves across two devices (0.9.78, sweep round 6): device one has a RetroArch save and a PPSSPP save in their own
// Flatpak folders; Cartridge finds them, matches them to their games and Save Sync sends them to RomM. Device two, a
// fresh home with the same games downloaded and no saves, turns Save Sync on and gets both back, byte for byte.
//   npx vite build && xvfb-run -a node test/e2e/saves.js
const fs = require('fs');
const path = require('path');
const mock = require('./mockRomm');
const { launch, put } = require('./homes');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const GAMES = [
  { id: 620, plat: [1, 'snes', 'Super Nintendo'], name: 'Save Quest', files: [['Save Quest.sfc', Buffer.alloc(4000, 1)]] },
  { id: 621, plat: [30, 'psp', 'PlayStation Portable'], name: 'Pocket Saga', files: [['Pocket Saga.iso', Buffer.alloc(4000, 2)]] },
];
const RA = '.var/app/org.libretro.RetroArch/config/retroarch';
const PSP = '.var/app/org.ppsspp.PPSSPP/config/ppsspp';
const SRM = Buffer.from(Array.from({ length: 8192 }, (_, i) => (i * 7) & 255));
const DATA = Buffer.from(Array.from({ length: 3000 }, (_, i) => (i * 13) & 255));
const FILES = { srm: `${RA}/saves/Save Quest.srm`, sfo: `${PSP}/PSP/SAVEDATA/ULUS10500DATA00/PARAM.SFO`, bin: `${PSP}/PSP/SAVEDATA/ULUS10500DATA00/DATA.BIN` };
const SFO = mock.sfo({ TITLE: 'Pocket Saga', SAVEDATA_DIRECTORY: 'ULUS10500DATA00', SAVEDATA_TITLE: 'Chapter 1' });
// the emulators as each leaves its folder after a first start
const setup = (home) => { put(path.join(home, RA, 'retroarch.cfg'), 'savefile_directory = "default"\n'); put(path.join(home, PSP, 'PSP/SYSTEM/ppsspp.ini'), '[General]\nFirstRun = False\n'); };

async function device(srv, label, withSaves) {
  const t = await launch('flatpaks', srv);
  const call = (ch, a) => t.call(ch, a).catch((e) => ({ error: String(e.message).split('\n')[0].replace(/^.*?Error: /, '') }));
  setup(t.home);
  if (withSaves) { put(path.join(t.home, FILES.srm), SRM); put(path.join(t.home, FILES.sfo), SFO); put(path.join(t.home, FILES.bin), DATA); }
  await wait(2500);
  for (const g of GAMES) await call('dl:add', { romId: g.id });
  for (let i = 0; i < 30; i++) { const l = await call('dl:list'); if (GAMES.every((g) => (l || []).find?.((d) => d.romId === g.id)?.status === 'done')) break; await wait(1000); }
  return { t, call };
}
const doneSync = async (call) => { for (let i = 0; i < 60; i++) { const s = await call('savesync:status'); if (!s.busy && s.last) return s; await wait(1000); } return call('savesync:status'); };

(async () => {
  const srv = await mock.start({ games: 5, extra: { games: GAMES } });
  // device one
  let { t, call } = await device(srv, 'one', true);
  try {
    const l = await call('saves:list', { fresh: true });
    const items = (l?.items || l?.saves || l || []);
    const flat = Array.isArray(items) ? items : Object.values(items).flat();
    const ra = flat.find((x) => /Save Quest/.test(JSON.stringify(x)) && /retroarch/i.test(x.emu || x.emulator || ''));
    const pp = flat.find((x) => /ULUS10500/.test(JSON.stringify(x)));
    check('device one: RetroArch save found and matched', ra && (ra.romId === 620 || ra.rom?.id === 620 || (ra.romIds || []).includes(620)), ra ? JSON.stringify({ romId: ra.romId, name: ra.name }) : 'not found');
    check('device one: PPSSPP save found and matched', pp && (pp.romId === 621 || pp.rom?.id === 621 || (pp.romIds || []).includes(621)), pp ? JSON.stringify({ romId: pp.romId, name: pp.name }) : 'not found');
    await call('savesync:set', { on: true });
    const st = await doneSync(call);
    check('device one: Save Sync sent both to RomM', srv.saves.filter((x) => [620, 621].includes(x.rom_id)).length === 2, `${srv.saves.length} in RomM · ${JSON.stringify(st.last?.counts || st.last?.sent || '').slice(0, 120)}`);
    check('device one: no script errors', !t.errors.length, t.errors.slice(0, 3).join(' | '));
  } catch (e) { check('device one finished', false, e.message); }
  await t.close();
  // device two
  ({ t, call } = await device(srv, 'two', false));
  try {
    await call('savesync:set', { on: true });
    await doneSync(call);
    const got = (f) => { try { return fs.readFileSync(path.join(t.home, f)); } catch { return null; } };
    check('device two: RetroArch save brought here, same bytes', got(FILES.srm)?.equals(SRM), got(FILES.srm) ? `${got(FILES.srm).length} bytes` : 'missing');
    check('device two: PPSSPP save brought here, same bytes', got(FILES.bin)?.equals(DATA) && got(FILES.sfo)?.equals(SFO), got(FILES.bin) ? 'present' : 'missing');
    check('device two: no script errors', !t.errors.length, t.errors.slice(0, 3).join(' | '));
  } catch (e) { check('device two finished', false, e.message); }
  await t.close();
  await srv.close();
  const bad = results.filter((r) => !r.ok).length;
  console.log(`== saves: ${results.length - bad} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
