// End-to-end run (0.9.71): the real app (Electron, main process and all) in a fake home against the fake RomM
// (mockRomm.js), driven with the controller's keys. Checks the things a broken build would break first, and times
// them against test/e2e/budgets.json. Run by .github/workflows/e2e.yml on every push; locally:
//   npx vite build && xvfb-run -a node test/e2e/run.js
// Needs playwright-core (devDependency) and the Electron binary from npm ci. Writes .ui-audit/e2e.json.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron } = require('playwright-core');
const mock = require('./mockRomm');

const ROOT = path.join(__dirname, '../..');
const BUDGET = JSON.parse(fs.readFileSync(path.join(__dirname, 'budgets.json'), 'utf8'));
const results = [], timings = {};
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 15000, step = 150) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch {} await wait(step); } return null; }

(async () => {
  const srv = await mock.start({ games: Number(process.env.E2E_GAMES || 120) });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cart-e2e-'));
  const data = path.join(home, '.config/Cartridge'), roms = path.join(home, 'Emulation/roms');
  fs.mkdirSync(data, { recursive: true }); fs.mkdirSync(roms, { recursive: true });
  fs.writeFileSync(path.join(data, 'config.json'), JSON.stringify({
    configured: true, welcomed: 1, setupDone: true, configVersion: 3, romsRoot: roms,
    server: { localUrl: `http://127.0.0.1:${srv.port}`, mode: 'local', auth: 'password', username: 'tester', password: 'pw' },
    downloads: { concurrency: 2 }, sync: { onLaunch: true, everyMinutes: 0 },
    ui: { toured: true, startTips: true, setupNotice: 1, welcomeNotice: 1, gameModeAsked: 1, sounds: false, idle: '0' },
  }));
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local/share'), CARTRIDGE_MULTI: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' };
  const t0 = Date.now();
  const app = await _electron.launch({ executablePath: require('electron'), args: [ROOT, '--no-sandbox'], env, timeout: 60000 });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    // 1. starts and shows the Dock
    const shown = await until(() => page.evaluate(() => !!document.querySelector('.tabs [data-tab]')), 30000);
    timings.startup = Date.now() - t0;
    check('starts and shows the Dock', shown, `${timings.startup} ms`);
    // 2. the library syncs from RomM
    await page.click('[data-tab="library"]').catch(() => {});
    const cards = await until(() => page.evaluate(() => document.querySelectorAll('.card').length), 15000);
    check('library synced from RomM and shown', cards > 0, `${cards} cards`);
    // 2b. a big library (E2E_GAMES=20000): opening Library and holding the D-pad down stays smooth
    {
      await page.click('[data-tab="home"]').catch(() => {}); await wait(400);
      let t1 = Date.now(); await page.click('[data-tab="library"]').catch(() => {});
      await until(() => page.evaluate(() => document.querySelectorAll('.card').length), 15000, 30);
      timings.libraryOpen = Date.now() - t1;
      await page.evaluate(() => { window.__gaps = []; let l = performance.now(); const f = (t) => { window.__gaps.push(t - l); l = t; if (window.__gaps.length < 400) requestAnimationFrame(f); }; requestAnimationFrame(f); });
      await page.keyboard.down('ArrowDown'); await wait(2500); await page.keyboard.up('ArrowDown');
      const g = await page.evaluate(() => window.__gaps.slice(1));
      timings.scrollWorstFrame = Math.round(Math.max(...g));
      timings.domCards = await page.evaluate(() => document.querySelectorAll('.card').length);
      check('Library opens and scrolls', timings.libraryOpen > 0, `${timings.libraryOpen} ms to open, slowest frame ${timings.scrollWorstFrame} ms while held, ${timings.domCards} cards drawn`);
      await page.keyboard.press('Home'); await wait(400);
      // one console's whole list (a quarter of the games)
      await page.click('[data-tab="consoles"]').catch(() => {}); await wait(500);
      t1 = Date.now(); await page.click('[data-key="sys-4"]').catch(() => {});
      await until(() => page.evaluate(() => document.querySelectorAll('.card').length), 20000, 30);
      timings.consoleOpen = Date.now() - t1;
      await page.evaluate(() => { window.__gaps = []; let l = performance.now(); const f = (t) => { window.__gaps.push(t - l); l = t; if (window.__gaps.length < 400) requestAnimationFrame(f); }; requestAnimationFrame(f); });
      await page.keyboard.down('ArrowDown'); await wait(2500); await page.keyboard.up('ArrowDown');
      const g2 = await page.evaluate(() => window.__gaps.slice(1));
      timings.consoleWorstFrame = Math.round(Math.max(...g2));
      timings.consoleCards = await page.evaluate(() => document.querySelectorAll('.card').length);
      check('a console page opens and scrolls', timings.consoleOpen > 0, `${timings.consoleOpen} ms to open, slowest frame ${timings.consoleWorstFrame} ms while held, ${timings.consoleCards} cards drawn`);
      await page.click('[data-tab="library"]').catch(() => {}); await wait(500);
    }
    // 3. a game page opens with the controller and comes back
    await page.keyboard.press('ArrowDown'); await wait(300);
    let t = Date.now();
    await page.keyboard.press('Enter');
    const opened = await until(() => page.evaluate(() => !!document.querySelector('.g-actions, .g-cover')), 8000, 50);
    timings.gamePage = Date.now() - t;
    check('A opens a game page', opened, `${timings.gamePage} ms`);
    await page.keyboard.press('Escape');
    const back = await until(() => page.evaluate(() => !document.querySelector('.g-actions') && document.querySelectorAll('.card').length > 0), 8000);
    check('B comes back to the library', back);
    // 4. downloads: a good file, a stale RomM hash, a two-file game
    for (const [id, file] of [[1, 'snes/Good Game.sfc'], [2, 'snes/Stale Game.sfc'], [3, 'psx/Disc Game/Disc Game.bin']]) {
      t = Date.now();
      await page.evaluate(async (romId) => { await window.cart.call('dl:add', { romId }); }, id);
      const st = (romId) => page.evaluate((r) => window.cart.call('dl:list').then((x) => (x.data || x).find?.((d) => d.romId === r)), romId);
      let done = await until(async () => fs.existsSync(path.join(roms, file)) && (await st(id))?.status === 'done', id === 2 ? 4000 : 30000);
      // RomM's hash is stale for this one: the first copy is called damaged and Retry gives the same file, kept
      if (id === 2) { const it = await until(async () => ((await st(id))?.status === 'error' ? await st(id) : null), 15000); if (it) await page.evaluate((i) => window.cart.call('dl:retry', i), it.id); done = await until(async () => { const d = await st(id); return d?.status === 'done' && d.notice === 'stale' && fs.existsSync(path.join(roms, file)); }, 30000); }
      if (!done) console.log('    ', JSON.stringify(await page.evaluate((romId) => window.cart.call('dl:list').then((r) => (r.data || r).filter?.((d) => d.romId === romId)), id)));
      check(`download ${path.basename(file)}`, done, `${Date.now() - t} ms`);
    }
    // 5. every main tab and every Settings section opens without a script error
    for (const tab of ['start', 'home', 'consoles', 'achievements', 'downloads', 'settings']) await page.click(`[data-tab="${tab}"]`).then(() => wait(500)).catch(() => {});
    const secs = await page.evaluate(() => [...document.querySelectorAll('[data-key^="sec-"]')].map((e) => e.dataset.key));
    for (const k of secs) await page.click(`[data-key="${k}"]`).then(() => wait(300)).catch(() => {});
    check('every tab and Settings section opens', secs.length >= 8 && !errors.length, `${secs.length} sections${errors.length ? ' · ' + errors.slice(0, 3).join(' | ') : ''}`);
    // 5b. recomps answer through their own module (0.9.71 split): the five verified ports listed, their settings readable
    const rl = await page.evaluate(() => window.cart.call('recomps:list').then((r) => r.data || r));
    const verified = (rl?.entries || []).filter((e) => e.from === 'verified');
    const st = await page.evaluate(() => window.cart.call('recomps:settings', { id: 'bloodborne' }).then((r) => r.data || r));
    check('Cartridge Verified ports listed with settings', verified.length >= 5 && (st?.items || []).length > 10, `${verified.length} ports, ${(st?.items || []).length} Bloodborne settings`);
    // 6. the update channel switch answers (0.9.71)
    const ch = await page.evaluate(() => window.cart.call('update:get').then((r) => (r.data || r).channel));
    check('update channel is reported', ['stable', 'beta', 'nightly'].includes(ch), ch);
    // 7. a clean start is marked clean (recovery)
    await wait(Math.max(0, 16000 - (Date.now() - t0)));
    const marker = JSON.parse(fs.readFileSync(path.join(data, 'start-marker.json'), 'utf8') || '{}');
    check('start marked clean after the UI showed', marker.ok === true);
  } catch (e) { check('run finished', false, e.message); }
  await app.close().catch(() => {});
  await srv.close();
  // budgets: a slow machine gets twice the room before it fails (CI runners vary)
  for (const [k, ms] of Object.entries(BUDGET)) if (timings[k] != null) check(`budget ${k} under ${ms} ms`, timings[k] <= ms * (process.env.CI ? 2 : 1), `${timings[k]} ms`);
  try { fs.mkdirSync(path.join(ROOT, '.ui-audit'), { recursive: true }); fs.writeFileSync(path.join(ROOT, '.ui-audit/e2e.json'), JSON.stringify({ results, timings }, null, 1)); } catch {}
  const bad = results.filter((r) => !r.ok).length;
  console.log(`== e2e: ${results.length - bad} passed, ${bad} failed`);
  fs.rmSync(home, { recursive: true, force: true });
  process.exit(bad ? 1 : 0);
})();
