// Launch Check (0.9.93, owner's pick): what could stop a game starting, found before Play. In the real app, in every
// setup: a game per console downloaded from the fake RomM is checked before it's in Steam (it says so, with Add to
// Steam), after (nothing in its way where an emulator is there; where none is, it says so with Get an Emulator), and
// with its file gone (Download It Again). Each check must answer quickly.
//   npx vite build && xvfb-run -a node test/e2e/launchcheck.js [setup]
const fs = require('fs');
const mock = require('./mockRomm');
const { SETUPS, launch } = require('./homes');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const G = (id, slug, disp, file) => ({ id, plat: [100 + id - 600, slug, disp], name: `${disp} Test`, files: [[file.replace('%', `${disp} Test`), Buffer.alloc(4000, id & 255)]] });
const GAMES = [G(600, 'snes', 'SNES', '%.sfc'), G(603, 'psx', 'PS1', '%.chd'), G(604, 'ps2', 'PS2', '%.iso'), G(605, 'psp', 'PSP', '%.iso'), G(607, 'ngc', 'GameCube', '%.iso'),
  G(609, 'wiiu', 'Wii U', '%.wua'), G(610, 'switch', 'Switch', '%.nsp'), G(611, '3ds', '3DS', '%.3ds'), G(613, 'dc', 'Dreamcast', '%.chd')];
const sum = (r) => r?.error ? 'ERROR ' + r.error : (r?.items || []).filter((x) => x.level !== 'ok').map((x) => `${x.id}:${x.level}${x.fix ? '>' + x.fix.id : ''}`).join(',') || 'clear';

(async () => {
  const srv = await mock.start({ games: 10, extra: { games: GAMES } });
  for (const name of process.argv[2] ? [process.argv[2]] : Object.keys(SETUPS)) {
    const t = await launch(name, srv, { steam: true });
    const { call, errors } = t;
    try {
      await wait(3000);
      for (const g of GAMES) await call('dl:add', { romId: g.id });
      const done = async () => { const l = await call('dl:list'); return GAMES.every((g) => (l || []).find?.((d) => d.romId === g.id)?.status === 'done'); };
      for (let i = 0; i < 60 && !(await done()); i++) await wait(1000);
      check(`${name}: games downloaded`, await done());
      // before Steam: every game says it isn't in Steam yet, with Add to Steam
      const before = {}; let slow = 0;
      for (const g of GAMES) { const t0 = Date.now(); before[g.id] = await call('launch:check', { romId: g.id }); slow = Math.max(slow, Date.now() - t0); }
      check(`${name}: before Steam, each game says it isn't in Steam, with Add to Steam`, GAMES.every((g) => before[g.id]?.items?.some((x) => x.id === 'steam' && x.level === 'bad' && x.fix?.id === 'steam-add')), GAMES.map((g) => `${g.plat[1]}=${sum(before[g.id])}`).join(' '));
      check(`${name}: its files are found`, GAMES.every((g) => before[g.id]?.items?.some((x) => x.id === 'files' && x.level === 'ok')));
      check(`${name}: each check is quick`, slow < 1500, `slowest ${slow} ms`);
      await call('steam:queueAdd', GAMES.map((g) => ({ romId: g.id })));
      const ap = await call('steam:apply', { restart: false }).catch((e) => ({ error: e.message }));
      // with no emulator anywhere nothing can be added, and Apply says why instead
      if (name === 'none') check('none: Apply adds nothing and says why', !!ap?.error && /No emulator found/.test(ap.error), String(ap?.error).slice(0, 80));
      else check(`${name}: Apply`, ap && !ap.error, ap?.error || `${ap?.added ?? '?'} added`);
      await wait(2500);
      // after: a game with an emulator here is clear to start; one without says so, with a way to get one
      const after = {};
      for (const g of GAMES) after[g.id] = await call('launch:check', { romId: g.id });
      const wrong = GAMES.filter((g) => {
        const r = after[g.id]; if (!r) return true;
        const noEmu = r.items.some((x) => x.id === 'emu' && x.level === 'bad');
        if (noEmu) return !r.items.find((x) => x.id === 'emu' && x.level === 'bad').fix; // a missing emulator always has a way forward
        return r.items.some((x) => x.id === 'steam' && x.level === 'bad'); // with one, it's in Steam now
      });
      check(`${name}: after Apply, games with an emulator are in Steam; without one they say what to do`, !wrong.length, GAMES.map((g) => `${g.plat[1]}=${sum(after[g.id])}`).join(' '));
      if (name === 'none') check('none: no emulator anywhere is said for every game', GAMES.every((g) => after[g.id]?.items?.some((x) => x.id === 'emu' && x.level === 'bad' && x.fix?.id === 'emu-page')));
      // the real Play button: something in the way opens Launch Check instead of starting; B leaves without starting
      const gp = GAMES.find((g) => after[g.id] && !after[g.id].clear) || null;
      if (gp) {
        const { page } = t;
        await page.evaluate((id) => window.__cartStore.go('game', { romId: id }), gp.id); await wait(1800);
        await page.click('button.btn.primary.ok.xl').catch(() => {}); await wait(1500);
        const shown = await page.evaluate(() => ({ lc: !!document.querySelector('.dialog.lc'), rows: document.querySelectorAll('.dialog.lc .lc-row').length, focus: document.activeElement?.classList.contains('lc-row') || document.activeElement?.classList.contains('btn'), starting: !!window.__cartStore.starting }));
        check(`${name}: Play on ${gp.plat[1]} opens Launch Check, focused, and doesn't start the game`, shown.lc && shown.rows > 0 && shown.focus && !shown.starting, JSON.stringify(shown));
        await page.keyboard.press('Escape'); await wait(700);
        const gone = await page.evaluate(() => ({ lc: !!document.querySelector('.dialog.lc'), starting: !!window.__cartStore.starting }));
        check(`${name}: B closes it and nothing starts`, !gone.lc && !gone.starting, JSON.stringify(gone));
      }
      // nothing in the way (warnings only): Play goes straight on, with no Launch Check in between
      const gc = GAMES.find((g) => after[g.id]?.clear) || null;
      if (gc) {
        const { page } = t;
        await page.evaluate(() => window.__cartStore.closeModal(null)).catch(() => {});
        await page.evaluate((id) => window.__cartStore.go('game', { romId: id }), gc.id); await wait(1800);
        // the starting screen showing at all is the start (the fake home's Steam isn't running, so it can fail at once after)
        await page.evaluate(() => { window.__gs = false; new MutationObserver(() => { if (document.querySelector('.gs-scrim')) window.__gs = true; }).observe(document.body, { childList: true, subtree: true }); });
        await page.click('button.btn.primary.ok.xl').catch(() => {}); await wait(1500);
        const st = await page.evaluate(() => ({ lc: !!document.querySelector('.dialog.lc'), starting: window.__gs, toast: [...document.querySelectorAll('.toast')].map((x) => x.innerText).join(' | ').slice(0, 120) }));
        check(`${name}: Play on ${gc.plat[1]} (nothing in the way) starts with no Launch Check`, !st.lc && st.starting, JSON.stringify(st));
        await page.keyboard.press('Escape'); await wait(500);
      }
      // a game whose file went missing
      const g0 = GAMES[0], file = (await call('dl:list')).find((d) => d.romId === g0.id)?.path;
      const inst = await call('installed:get').catch(() => null);
      const where = file || (inst && inst[g0.id]);
      if (where && fs.existsSync(where)) {
        fs.rmSync(where, { recursive: true, force: true });
        const gone = await call('launch:check', { romId: g0.id });
        check(`${name}: a game whose file is gone says so, with Download It Again`, gone?.items?.[0]?.id === 'files' && gone.items[0].level === 'bad' && gone.items[0].fix?.id === 'redownload', sum(gone));
      } else check(`${name}: found the game's file to take away`, false, String(where));
      check(`${name}: no script errors`, !errors.length, errors.slice(0, 3).join(' | '));
    } catch (e) { check(`${name}: run finished`, false, e.message); }
    await t.close();
  }
  await srv.close();
  const bad = results.filter((r) => !r.ok).length;
  console.log(`== launch check: ${results.length - bad} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
