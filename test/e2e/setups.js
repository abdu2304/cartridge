// Every emulator setup (0.9.76, owner: "Vita3K's menu didn't open again... test every setup"): the real app in a fake home
// laid out as AppImages only, Flatpaks only, EmuDeck, and nothing installed. In each, every emulator Get Emulators
// counts as installed must have its own row in the emulator list and its card must open its sheet (never "already on
// this device"), Settings → Emulators must show no script error, and Steam's overview must answer.
//   npx vite build && xvfb-run -a node test/e2e/setups.js
const mock = require('./mockRomm');
const { SETUPS, launch } = require('./homes');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = await mock.start({ games: 30 });
  for (const name of process.argv[2] ? [process.argv[2]] : Object.keys(SETUPS)) {
    const { page, call, errors, close } = await launch(name, srv);
    try {
      await wait(2500);
      const rows = await call('emuget:list');
      const have = (rows?.rows || rows || []).flatMap?.((c) => c.emus.filter((e) => e.installed).map((e) => e.id)) || [];
      const ups = await call('emuup:list', { fresh: true });
      const upIds = new Set((Array.isArray(ups) ? ups : []).filter((u) => !u.fork).map((u) => u.id));
      const uniq = [...new Set(have)];
      const missing = uniq.filter((id) => !upIds.has(id));
      check(`${name}: every installed emulator has its row`, !missing.length, `${uniq.length} installed${missing.length ? ' · no row: ' + missing.join(', ') : ''}`);
      if (name === 'none') check('none: nothing counted as installed', !uniq.length, uniq.join(', '));
      // the cards: each installed one opens its sheet
      await page.click('[data-tab="settings"]'); await wait(800);
      const tl = Date.now(); await page.click('[data-key="sec-emu"]');
      // the list is ready when the "Looking at what's installed" line goes
      await page.waitForFunction(() => document.querySelector('.eg-emu') && !/Looking at what/.test(document.querySelector('.pane')?.innerText || ''), null, { timeout: 30000 }).catch(() => {});
      const listMs = Date.now() - tl; await wait(300);
      check(`${name}: Emulators page lists them within 8 s`, listMs < 8000, `${listMs} ms`);
      const cards = await page.$$('.eg-emu.have');
      let opened = 0; const dead = [];
      for (let i = 0; i < cards.length; i++) {
        const c = (await page.$$('.eg-emu.have'))[i]; if (!c) break;
        const label = (await c.innerText()).split('\n')[0].trim();
        await c.click(); await wait(700);
        const sheet = await page.evaluate(() => !!document.querySelector('.scrim .dialog, .scrim .menu, .scrim .sheet'));
        const toast = await page.evaluate(() => [...document.querySelectorAll('.toast-msg')].map((t) => t.innerText).join(' | '));
        if (sheet) opened++; else dead.push(`${label}${toast ? ' (' + toast + ')' : ''}`);
        await page.keyboard.press('Escape'); await wait(400);
        await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
      }
      check(`${name}: every installed emulator's card opens its sheet`, !dead.length, `${opened} of ${cards.length}${dead.length ? ' · didn’t open: ' + dead.join('; ') : ''}`);
      const ov = await call('steam:overview');
      check(`${name}: Steam overview answers`, ov && !ov.error, ov?.error || '');
      check(`${name}: no script errors`, !errors.length, errors.slice(0, 3).join(' | '));
    } catch (e) { check(`${name}: run finished`, false, e.message); }
    await close();
  }
  await srv.close();
  const bad = results.filter((r) => !r.ok).length;
  console.log(`== setups: ${results.length - bad} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
