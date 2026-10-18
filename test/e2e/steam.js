// Every console's games into Steam (0.9.77, sweep round 4): in each emulator setup a game per console is downloaded from
// the fake RomM, added to Steam and applied with Steam closed; shortcuts.vdf is read back and every game must be there
// with a program that exists (or Flatpak/Steam's own) and its own file in what starts it. Consoles with no emulator in a
// setup must say why instead of being added broken.
//   npx vite build && xvfb-run -a node test/e2e/steam.js [setup]
const fs = require('fs');
const path = require('path');
const mock = require('./mockRomm');
const { SETUPS, launch } = require('./homes');
const { parseVdf } = require('../../electron/steamArt');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const G = (id, slug, disp, file, size = 4000) => ({ id, plat: [100 + id - 600, slug, disp], name: `${disp} Test`, files: [[file.replace('%', `${disp} Test`), Buffer.alloc(size, id & 255)]] });
const GAMES = [G(600, 'snes', 'SNES', '%.sfc'), G(601, 'n64', 'N64', '%.z64'), G(602, 'gba', 'GBA', '%.gba'), G(603, 'psx', 'PS1', '%.chd'), G(604, 'ps2', 'PS2', '%.iso'), G(605, 'psp', 'PSP', '%.iso'),
  G(606, 'ps3', 'PS3', '%.iso'), G(607, 'ngc', 'GameCube', '%.iso'), G(608, 'wii', 'Wii', '%.iso'), G(609, 'wiiu', 'Wii U', '%.wua'), G(610, 'switch', 'Switch', '%.nsp'), G(611, '3ds', '3DS', '%.3ds'),
  G(612, 'nds', 'DS', '%.nds'), G(613, 'dc', 'Dreamcast', '%.chd'), G(614, 'xbox', 'Xbox', '%.iso'), G(615, 'xbox360', 'Xbox 360', '%.iso')];

(async () => {
  const srv = await mock.start({ games: 10, extra: { games: GAMES } });
  for (const name of process.argv[2] ? [process.argv[2]] : Object.keys(SETUPS).filter((x) => x !== 'none')) {
    const t = await launch(name, srv, { steam: true });
    const { call, errors, home, roms } = t;
    try {
      await wait(3000);
      for (const g of GAMES) await call('dl:add', { romId: g.id });
      const done = async () => { const l = await call('dl:list'); return GAMES.every((g) => (l || []).find?.((d) => d.romId === g.id)?.status === 'done'); };
      for (let i = 0; i < 60 && !(await done()); i++) await wait(1000);
      check(`${name}: ${GAMES.length} games downloaded`, await done());
      await call('steam:queueAdd', GAMES.map((g) => ({ romId: g.id })));
      const pl = await call('steam:preview');
      const planned = new Set((pl?.entries || []).map((e) => e.romId));
      const skipped = pl?.skipped || [];
      const ap = await call('steam:apply', { restart: false });
      check(`${name}: Apply`, ap && !ap.error, ap?.error || `${ap?.added ?? '?'} added`);
      const vdfFile = path.join(home, '.local/share/Steam/userdata/39734273/config/shortcuts.vdf');
      for (let i = 0; i < 40 && !fs.existsSync(vdfFile); i++) await wait(500);
      await wait(1500);
      const sc = fs.existsSync(vdfFile) ? Object.values(parseVdf(fs.readFileSync(vdfFile)).shortcuts || {}) : [];
      const bad = [], missing = [];
      for (const g of GAMES) {
        if (!planned.has(g.id)) { const why = skipped.find((s) => s.romId === g.id)?.why || 'not planned, no reason given'; missing.push(`${g.plat[1]} (${why})`); continue; }
        const e = sc.find((x) => (x.AppName || x.appname) === g.name);
        if (!e) { bad.push(`${g.plat[1]}: planned but not in shortcuts.vdf`); continue; }
        const exe = String(e.Exe || e.exe || '').replace(/^"|"$/g, '');
        const lo = String(e.LaunchOptions || e.launchoptions || '');
        const exeOk = exe === '/usr/bin/flatpak' || fs.existsSync(exe);
        const file = g.files[0][0];
        const fileOk = (exe + ' ' + lo).includes(file) || (exe + ' ' + lo).includes(path.join(roms, g.plat[1]));
        if (!exeOk || !fileOk) bad.push(`${g.plat[1]}: ${!exeOk ? 'program missing ' + exe.replace(home, '~') : ''}${!fileOk ? ' game not in "' + (exe + ' ' + lo).replace(new RegExp(home, 'g'), '~').slice(0, 140) + '"' : ''}`);
      }
      check(`${name}: every planned game in Steam starts its emulator with its own file`, !bad.length, `${planned.size} in Steam${bad.length ? ' · ' + bad.join(' | ') : ''}`);
      // a console left out must say why (no emulator), never a shortcut that can't start
      check(`${name}: games left out say why`, missing.every((m) => !/no reason/.test(m)), missing.join(' | ') || 'none left out');
      check(`${name}: no script errors`, !errors.length, errors.slice(0, 3).join(' | '));
    } catch (e) { check(`${name}: run finished`, false, e.message); }
    await t.close();
  }
  await srv.close();
  const badN = results.filter((r) => !r.ok).length;
  console.log(`== steam: ${results.length - badN} passed, ${badN} failed`);
  process.exit(badN ? 1 : 0);
})();
