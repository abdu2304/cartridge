// The whole app pressed through (0.9.76, owner: "test absolutely everything, every nook and cranny, every setup"): in
// each fake home (homes.js) every tab, every Settings section and its pages, and a game page for every console with its
// More sheet and each of its tabs. On every page each button that only opens or shows something is pressed (never
// one that deletes, installs, signs out or changes Steam), any pop-up it opens is closed again with B. Recorded: script
// errors, error messages shown, buttons that did nothing visible, and pop-ups B didn't close. Report in .ui-audit/crawl.json.
//   npx vite build && xvfb-run -a node test/e2e/crawl.js [setup]
const fs = require('fs');
const path = require('path');
const mock = require('./mockRomm');
const { SETUPS, launch } = require('./homes');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// buttons a crawl never presses: they change things on the device, in Steam or in RomM, or leave the app
const RISKY = /delete|remove|uninstall|sign (out|in)|reset|forget|quit|restart|power|sleep|clear|stop|leave|turn (on|off)|install|update|download|get (all|emulators)|apply|move|repair|unlink|link|restore|put (it )?back|roll ?back|replace|upload|add to steam|refresh|rescan|sync now|play|open|start|launch|pair|connect|scan|fix|make|create|use this|switch|mark|hide|rename|edit|set up|import|export|send|report|test|merge|search|keyboard|join|accept|share|copy|paste|welcome|tour|graphics|safe/i;
// games on every console a game page behaves differently for
const P = (id, slug, name) => [id, slug, name];
const CONSOLES = [P(5, 'ps4', 'PlayStation 4'), P(6, 'ps3', 'PlayStation 3'), P(7, 'switch', 'Nintendo Switch'), P(8, 'psp', 'PlayStation Portable'), P(9, 'psvita', 'PlayStation Vita'), P(10, 'ngc', 'GameCube'), P(11, 'wii', 'Wii'), P(12, 'wiiu', 'Wii U'), P(13, '3ds', 'Nintendo 3DS'), P(14, 'xbox360', 'Xbox 360'), P(15, 'gba', 'Game Boy Advance'), P(16, 'dc', 'Dreamcast')];
const EXT = { ps4: 'zip', ps3: 'iso', switch: 'nsp', psp: 'iso', psvita: 'vpk', ngc: 'iso', wii: 'iso', wiiu: 'wua', '3ds': '3ds', xbox360: 'iso', gba: 'gba', dc: 'chd' };
const GAMES = CONSOLES.map((p, i) => ({ id: 800 + i, plat: p, name: `${p[2]} Game`, files: [[`${p[2]} Game.${EXT[p[1]]}`, Buffer.alloc(3000, i)]] }));

async function crawlHere(t, where, out, scope = 'main.main, .pane') {
  const { page } = t;
  const seen = new Set();
  for (let pass = 0; pass < 80; pass++) {
    const next = await page.evaluate(([sc, done, risky]) => {
      const box = document.querySelector(sc.split(',').map((s) => s.trim()).find((s) => document.querySelector(s)) || 'body');
      const re = new RegExp(risky, 'i');
      for (const b of box.querySelectorAll('button, [role=button], .lrow, .toggle')) {
        if (!b.offsetParent || b.disabled || b.closest('.scrim, .tabs, .rail, .hintbar') || /swatch|font|bg-pick|look/i.test(b.className + ' ' + (b.parentElement?.className || ''))) continue;
        const label = (b.getAttribute('aria-label') || b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70);
        const key = (b.dataset.key || '') + '|' + label;
        if (!label || done.includes(key) || re.test(label) || b.classList.contains('toggle') || b.closest('.seg')) continue;
        b.setAttribute('data-crawl', key);
        return key;
      }
      return null;
    }, [scope, [...seen], RISKY.source]);
    if (!next) break;
    seen.add(next);
    const before = await page.evaluate(() => ({ route: window.__cartStore.route?.name + JSON.stringify({ ...(window.__cartStore.route?.params || {}) }), look: document.body.className + document.documentElement.getAttribute('style'), modal: !!document.querySelector('.scrim'), toasts: document.querySelectorAll('.toast').length, html: document.querySelector('main.main')?.innerHTML.length || 0 }));
    await page.click(`[data-crawl="${next.replace(/"/g, '\\"')}"]`, { timeout: 2000 }).catch(() => {});
    await wait(650);
    const after = await page.evaluate(() => ({ route: window.__cartStore.route?.name + JSON.stringify({ ...(window.__cartStore.route?.params || {}) }), look: document.body.className + document.documentElement.getAttribute('style'), modal: !!document.querySelector('.scrim'), toasts: [...document.querySelectorAll('.toast')].map((x) => ({ kind: x.className, msg: x.innerText })), html: document.querySelector('main.main')?.innerHTML.length || 0, title: document.querySelector('.scrim .dialog h2, .scrim .dialog h3, .scrim .menu-title, .scrim .dialog b')?.innerText || '' }));
    const errs = after.toasts.filter((x) => /error/.test(x.kind));
    for (const e of errs) out.push({ where, button: next.split('|')[1], kind: 'error message', detail: e.msg });
    if (after.modal) {
      for (let i = 0; i < 4 && (await page.evaluate(() => !!document.querySelector('.scrim'))); i++) { await page.keyboard.press('Escape'); await wait(350); }
      if (await page.evaluate(() => !!document.querySelector('.scrim'))) { out.push({ where, button: next.split('|')[1], kind: 'B didn’t close it', detail: after.title }); await page.evaluate(() => window.__cartStore.closeModal(null)); await wait(300); }
    } else if (after.route !== before.route) {
      // a page opened: back where we were
      await page.keyboard.press('Escape'); await wait(700);
      const now = await page.evaluate(() => window.__cartStore.route?.name + JSON.stringify({ ...(window.__cartStore.route?.params || {}) }));
      if (now !== before.route) { out.push({ where, button: next.split('|')[1], kind: 'B didn’t come back', detail: `${after.route} → ${now}`.slice(0, 120) }); return; }
    } else if (!errs.length && after.toasts.length === before.toasts && after.html === before.html && after.look === before.look) {
      out.push({ where, button: next.split('|')[1], kind: 'nothing happened', detail: '' });
    }
    await page.evaluate(() => document.querySelectorAll('.toast').forEach((x) => x.remove()));
  }
}

(async () => {
  const srv = await mock.start({ games: 30, extra: { games: GAMES } });
  const report = {}; const visited = [];
  for (const name of process.argv[2] ? [process.argv[2]] : Object.keys(SETUPS)) {
    const out = [];
    const t = await launch(name, srv);
    const { page, call, errors } = t;
    const consoleErr = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/404|net::ERR|Failed to load resource/.test(m.text())) consoleErr.push(m.text().slice(0, 200)); });
    try {
      await wait(3000);
      // a game per console downloaded, so game pages show their on-device side too
      for (const g of GAMES.slice(0, 6)) await call('dl:add', { romId: g.id });
      await wait(6000);
      for (const tab of ['start', 'home', 'library', 'consoles', 'achievements', 'downloads']) {
        await page.click(`[data-tab="${tab}"]`).catch(() => {}); await wait(1200);
        await crawlHere(t, tab, out);
        await page.click(`[data-tab="${tab}"]`).catch(() => {});
      }
      await page.click('[data-tab="settings"]'); await wait(800);
      const secs = await page.evaluate(() => [...document.querySelectorAll('[data-key^="sec-"]')].map((e) => e.dataset.key));
      for (const k of secs) {
        await page.click(`[data-key="${k}"]`).catch(() => {}); await wait(1500);
        const pages = await page.evaluate(() => [...document.querySelectorAll('.pane .lookpages .seg button')].map((b) => b.dataset.key).filter(Boolean));
        for (const pg of pages.length ? pages : [null]) {
          if (pg) { await page.click(`[data-key="${pg}"]`).catch(() => {}); await wait(1500); }
          await crawlHere(t, `settings ${k}${pg ? ' ' + pg : ''}`, out, '.pane');
          await page.click('[data-tab="settings"]').catch(() => {}); await page.click(`[data-key="${k}"]`).catch(() => {}); await wait(300);
        }
      }
      // every emulator's sheet, and one level in: Folders and Online Play open their own screens
      await page.click('[data-tab="settings"]').catch(() => {}); await page.click('[data-key="sec-emu"]').catch(() => {}); await wait(600); await page.click('[data-key="emup-emus"]').catch(() => {});
      await page.waitForFunction(() => document.querySelector('.eg-emu') && !/Looking at what/.test(document.querySelector('.pane')?.innerText || ''), null, { timeout: 30000 }).catch(() => {});
      const nEmu = await page.evaluate(() => document.querySelectorAll('.eg-emu.have').length);
      for (let i = 0; i < nEmu; i++) {
        await page.evaluate((n) => document.querySelectorAll('.eg-emu.have')[n]?.click(), i); await wait(900);
        const label = await page.evaluate(() => document.querySelector('.scrim .dialog h2, .scrim h2')?.innerText || '');
        const opts = await page.evaluate(() => [...document.querySelectorAll('.scrim .menu-item')].map((x) => x.innerText.split('\n')[0].trim()));
        visited.push(`emulator ${label}: ${opts.join(', ')}`);
        for (const o of opts.filter((x) => /^(folders|forks|versions)/i.test(x))) {
          if (!(await page.evaluate(() => !!document.querySelector('.scrim .menu-item')))) { await page.evaluate((n) => document.querySelectorAll('.eg-emu.have')[n]?.click(), i); await wait(900); }
          await page.evaluate((lb) => [...document.querySelectorAll('.scrim .menu-item')].find((x) => x.innerText.split('\n')[0].trim() === lb)?.click(), o); await wait(1500);
          const st = await page.evaluate(() => ({ modal: !!document.querySelector('.scrim'), errs: [...document.querySelectorAll('.toast.error')].map((x) => x.innerText), said: !!document.querySelector('.toast:not(.error)'), text: (document.querySelector('.scrim .dialog')?.innerText || '').slice(0, 100) }));
          for (const e of st.errs) out.push({ where: `emulator ${label}`, button: o, kind: 'error message', detail: e });
          if (!st.modal && !st.errs.length) out.push({ where: `emulator ${label}`, button: o, kind: 'nothing happened', detail: '' });
          for (let k = 0; k < 4 && (await page.evaluate(() => !!document.querySelector('.scrim'))); k++) { await page.keyboard.press('Escape'); await wait(350); }
          await page.evaluate(() => document.querySelectorAll('.toast').forEach((x) => x.remove()));
        }
        for (let k = 0; k < 4 && (await page.evaluate(() => !!document.querySelector('.scrim'))); k++) { await page.keyboard.press('Escape'); await wait(300); }
      }
      // a game page per console, its More sheet and every tab in it
            for (const g of GAMES) {
        await page.evaluate((id) => window.__cartStore.go('game', { romId: id }), g.id); await wait(1500);
        await crawlHere(t, `game ${g.plat[1]}`, out);
        const more = await page.$('button[title="More options"]');
        if (more) {
          await more.click(); await wait(800);
          const tabs = await page.evaluate(() => [...document.querySelectorAll('.scrim .seg button')].map((b) => b.innerText.trim()));
          for (let i = 0; i < Math.max(1, tabs.length); i++) {
            if (tabs.length) { await page.evaluate((n) => [...document.querySelectorAll('.scrim .seg button')][n]?.click(), i); await wait(400); }
            const opts = await page.evaluate(() => [...document.querySelectorAll('.scrim .menu-item')].map((x) => x.innerText.split('\n')[0].trim()));
            if (!opts.length) out.push({ where: `game ${g.plat[1]} More`, button: tabs[i] || 'More', kind: 'empty tab', detail: '' });
            visited.push(`game ${g.plat[1]} More ${tabs[i] || ''}: ${opts.length} options`);
            // one level in: every option that only opens something, More reopened on this tab each time
            for (const o of opts) {
              if (RISKY.test(o) && !/^(game settings|add-ons|about|saves|timeline|texture packs|cheats|patches|its games|go to)/i.test(o)) continue;
              if (!(await page.evaluate(() => !!document.querySelector('.scrim .menu-item')))) { await page.click('button[title="More options"]').catch(() => {}); await wait(600); if (tabs.length) { await page.evaluate((n) => [...document.querySelectorAll('.scrim .seg button')][n]?.click(), i); await wait(300); } }
              const r0 = await page.evaluate(() => window.__cartStore.route?.name);
              await page.evaluate((label) => [...document.querySelectorAll('.scrim .menu-item')].find((x) => x.innerText.split('\n')[0].trim() === label)?.click(), o); await wait(1300);
              const st = await page.evaluate(() => ({ modal: !!document.querySelector('.scrim'), route: window.__cartStore.route?.name, errs: [...document.querySelectorAll('.toast.error')].map((x) => x.innerText), text: (document.querySelector('.scrim .dialog')?.innerText || '').slice(0, 120) }));
              for (const e of st.errs) out.push({ where: `game ${g.plat[1]} More`, button: o, kind: 'error message', detail: e });
              // a message that it worked counts (0.9.84: Add to Favourites only says so)
              if (!st.modal && st.route === r0 && !st.errs.length && !st.said) out.push({ where: `game ${g.plat[1]} More`, button: o, kind: 'nothing happened', detail: '' });
              if (/Reading…|Loading/.test(st.text)) { await wait(4000); const still = await page.evaluate(() => /Reading…|Loading/.test(document.querySelector('.scrim .dialog')?.innerText || '')); if (still) out.push({ where: `game ${g.plat[1]} More`, button: o, kind: 'still loading after 5 s', detail: st.text }); }
              for (let k = 0; k < 4 && (await page.evaluate(() => !!document.querySelector('.scrim'))); k++) { await page.keyboard.press('Escape'); await wait(350); }
              if (st.route !== r0) { await page.keyboard.press('Escape'); await wait(600); }
              await page.evaluate(() => document.querySelectorAll('.toast').forEach((x) => x.remove()));
              if ((await page.evaluate(() => window.__cartStore.route?.name)) !== 'game') { await page.evaluate((id) => window.__cartStore.go('game', { romId: id }), g.id); await wait(1200); }
            }
            if (!(await page.evaluate(() => !!document.querySelector('.scrim .menu-item')))) { await page.click('button[title="More options"]').catch(() => {}); await wait(600); }
          }
          for (let i = 0; i < 4 && (await page.evaluate(() => !!document.querySelector('.scrim'))); i++) { await page.keyboard.press('Escape'); await wait(300); }
        }
        await page.keyboard.press('Escape'); await wait(400);
      }
    } catch (e) { out.push({ where: 'run', kind: 'crashed', detail: e.message }); }
    for (const e of errors) out.push({ where: 'page', kind: 'script error', detail: e });
    for (const e of [...new Set(consoleErr)]) out.push({ where: 'console', kind: 'console error', detail: e });
    report[name] = out; if (process.env.VISITED) console.log(visited.splice(0).join('\n'));
    console.log(`\n== ${name}: ${out.length} things to look at`);
    for (const o of out) console.log(`  ${o.kind} · ${o.where}${o.button ? ' · ' + o.button : ''}${o.detail ? ' · ' + o.detail.slice(0, 160) : ''}`);
    await t.close();
  }
  await srv.close();
  try { fs.mkdirSync(path.join(__dirname, '../../.ui-audit'), { recursive: true }); fs.writeFileSync(path.join(__dirname, '../../.ui-audit/crawl.json'), JSON.stringify(report, null, 1)); } catch {}
  const n = Object.values(report).reduce((s, x) => s + x.length, 0);
  console.log(`== crawl: ${n} things to look at`);
  process.exit(0);
})();
