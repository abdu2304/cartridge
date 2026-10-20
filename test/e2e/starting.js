// The starting screen (0.9.87, owner: a slow PC port looked broken while it opened). In the real app: it shows with the
// game's name, stays while the game starts, goes when the game comes in front (Cartridge goes quiet), says so when the
// game closes before it opened, and B hides it.
//   npx vite build && xvfb-run -a node test/e2e/starting.js
const mock = require('./mockRomm');
const { launch } = require('./homes');
const results = [];
const check = (name, ok, detail = '') => { results.push({ ok: !!ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const send = (app, ch, data) => app.evaluate(({ BrowserWindow }, [c, d]) => BrowserWindow.getAllWindows()[0].webContents.send(c, d), [ch, data]);

(async () => {
  const srv = await mock.start({ games: 12 });
  const { app, page, errors, close } = await launch('none', srv);
  try {
    await wait(2500);
    const rom = { id: (await page.evaluate(() => window.cart.call('library:get')).catch(() => null))?.data?.roms?.[0]?.id ?? 1 };
    const start = (o) => page.evaluate((x) => window.__cartStore.startingGame(x), o);
    const shown = () => page.evaluate(() => !!document.querySelector('.gs-scrim'));
    await start({ romId: rom?.id ?? null, name: 'Uncharted', port: 'uncharted' });
    await wait(400);
    check('it shows with the name', await shown() && (await page.textContent('.gs-name')) === 'Uncharted');
    check('it says a port prepares with nothing on screen', /PC ports prepare the game before their window shows/.test(await page.textContent('.gs-sub')));
    await page.screenshot({ path: '.ui-audit/starting.png' }).catch(() => {});
    await send(app, 'background', { away: true }); await wait(800);
    check('it goes when the game comes in front', !(await shown()));
    await send(app, 'background', { away: false }); await wait(300);
    await start({ romId: null, name: 'Bloodborne', port: 'bloodborne' });
    await wait(300); await send(app, 'game-run', { state: 'ended', port: 'bloodborne' }); await wait(400);
    check('a game that closes straight away says so', await shown() && /closed before it opened/.test(await page.textContent('.gs-sub')));
    await page.keyboard.press('Escape'); await wait(400);
    check('B closes it', !(await shown()));
    await start({ romId: null, name: 'Chrono Trigger' }); await wait(300);
    await send(app, 'game-run', { state: 'started', romId: 1 }); await wait(300);
    check('a game seen running says its window is near', /It’s running/.test(await page.textContent('.gs-sub')));
    await send(app, 'background', { away: true }); await wait(800);
    check('and goes when it comes in front', !(await shown()));
    check('no script errors', !errors.length, errors.slice(0, 3).join(' | '));
  } finally { await close(); srv.close?.(); }
  const bad = results.filter((r) => !r.ok).length;
  console.log(`== starting: ${results.length - bad} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
