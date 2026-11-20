// Best for This Device (0.9.96, owner's pick): in the real app, with the Game Settings e2e's games and emulator files
// (Flatpaks): the five emulators with suggestions say which device this is and offer only values their settings take;
// the button in Game Settings shows them, Use These saves them to the game's own file (still readable), a second
// press says it's already set, and Back to the emulator's own takes them away again.
//   npx vite build && xvfb-run -a node test/e2e/bestsettings.js
const path = require('path');
const mock = require('./mockRomm');
const { launch, put } = require('./homes');
const { CASES, GAMES, readable } = require('./gamesettings');

const results = [];
const check = (name, ok, detail = '') => { results.push({ ok: !!ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const WANT = ['rpcs3', 'duckstation', 'pcsx2', 'ppsspp', 'dolphin'];

(async () => {
  const srv = await mock.start({ games: 0, extra: { games: GAMES } });
  const t = await launch('flatpaks', srv);
  const { home, roms } = t;
  const call = (ch, a) => t.call(ch, a).catch((e) => ({ error: String(e.message).split('\n')[0] }));
  try {
    for (const c of CASES) {
      for (const [f, s] of Object.entries(c.cfg)) put(path.join(home, f), s);
      for (const [n, d] of c.files) put(path.join(roms, c.plat[1], c.dir ? path.join(c.dir, n) : n), d);
    }
    await wait(2500); await call('library:sync'); await call('installed:rescan'); await wait(1500);
    for (const [i, c] of CASES.entries()) {
      if (!WANT.includes(c.emu)) continue;
      const romId = 700 + i, b = await call('gamesettings:best', { romId });
      const d = await call('gamesettings:get', { romId });
      const ok = b?.device?.name && b.changes.length >= 1 && b.changes.every((x) => d.items.find((it) => it.id === x.id)?.options.some((o) => String(o.value) === String(x.value)));
      check(`${c.emu}: suggestions for this device, each a choice its settings offer`, ok, `${b?.device?.name} (${b?.device?.kind}, ${b?.device?.screenH}p): ${(b?.changes || []).map((x) => `${x.label}=${x.valueLabel}`).join(', ')}${b?.error || ''}`);
      await call('gamesettings:set', { romId, changes: b.changes.map((x) => ({ id: x.id, value: x.value })) });
      const after = await call('gamesettings:get', { romId });
      check(`${c.emu}: saved and read back`, b.changes.every((x) => String(after.items.find((it) => it.id === x.id)?.game) === String(x.value)));
      const files = Object.keys(c.cfg).map((f) => path.join(home, f));
      check(`${c.emu}: its files still read`, files.every((f) => !readable(f)), files.map((f) => readable(f)).filter(Boolean).join(' | '));
      const again = await call('gamesettings:best', { romId });
      check(`${c.emu}: a second time, nothing left to change`, again.changes.length === 0, JSON.stringify(again.changes));
      await call('gamesettings:set', { romId, changes: b.changes.map((x) => ({ id: x.id, value: null })) });
      const back = await call('gamesettings:get', { romId });
      check(`${c.emu}: back to the emulator's own`, b.changes.every((x) => back.items.find((it) => it.id === x.id)?.game == null));
    }
    // the button: PS2 in the Game Settings window
    const ps2 = 700 + CASES.findIndex((c) => c.emu === 'pcsx2');
    await t.page.evaluate((id) => { window.__cartStore.openModal('gamesettings', { romId: id, name: 'Sky Odyssey' }); }, ps2); await wait(1800);
    await t.page.click('button[data-key="best"]'); await wait(1200);
    const sheet = await t.page.evaluate(() => ({ title: document.querySelector('.scrim h2, .scrim .menu-title')?.textContent || '', text: document.querySelector('.scrim p.muted')?.textContent || '' }));
    check('the button shows the device and what changes', /^Best for /.test(sheet.title) && /Resolution:/.test(sheet.text) && /undoes it/.test(sheet.text), JSON.stringify(sheet).slice(0, 300));
    await t.page.screenshot({ path: '.ui-audit/bestsettings.png' }).catch(() => {});
    await t.page.click('.scrim .menu-item:has-text("Use These")'); await wait(1500);
    const now = await call('gamesettings:get', { romId: ps2 });
    check('Use These saves them, and Game Settings is open again', now.items.some((x) => x.id === 'EmuCore/GS.upscale_multiplier' && x.game != null) && (await t.page.evaluate(() => !!document.querySelector('.dialog.gs'))));
    check('no script errors', !t.errors.length, t.errors.slice(0, 3).join(' | '));
  } catch (e) { check('run finished', false, e.message); }
  await t.close(); await srv.close();
  const bad = results.filter((r) => !r.ok).length;
  console.log(`== best settings: ${results.length - bad} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
