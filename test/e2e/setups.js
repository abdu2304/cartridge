// Every emulator setup (0.9.76, owner: "Vita3K's menu didn't open again... test every setup"): the real app in a fake home
// laid out as AppImages only, Flatpaks only, EmuDeck, and nothing installed. In each, every emulator Get Emulators
// counts as installed must have its own row in the emulator list and its card must open its sheet (never "already on
// this device"), Settings → Emulators must show no script error, and Steam's overview must answer.
//   npx vite build && xvfb-run -a node test/e2e/setups.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron } = require('playwright-core');
const mock = require('./mockRomm');
const G = require('../../electron/emuGet');
const { EMU } = require('../../electron/emulators');

const ROOT = path.join(__dirname, '../..');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const put = (f, data, mode) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); if (mode) fs.chmodSync(f, mode); return f; };
// an ELF marked as an AppImage (type 2 at byte 8), enough for Cartridge's checks; it never runs
const appImage = () => { const b = Buffer.alloc(8192); b.write('\x7fELF', 0, 'latin1'); b[4] = 2; b[5] = 1; b[6] = 1; b.write('AI', 8, 'latin1'); b[10] = 2; return b; };
const flatpak = (home, id) => put(path.join(home, '.local/share/flatpak/app', id, 'current/active/metadata'), `[Application]\nname=${id}\n`);
const emus = () => G.CATALOG.flatMap((c) => c.emus.map((e) => ({ ...e, key: c.key })));

const SETUPS = {
  // every emulator Get Emulators installs, as it installs them: AppImages in ~/Applications, folder builds in their folder
  appimages: (home) => {
    for (const e of emus()) {
      if (e.how === 'flatpak') continue;
      if (e.dirBuild || e.binary) { const d = path.join(home, 'Applications', EMU[e.id]?.dir?.[0] || EMU[e.id]?.label || e.id); put(path.join(d, (EMU[e.id]?.bin || [e.id])[0]), appImage(), 0o755); continue; }
      put(path.join(home, 'Applications', e.name || `${e.id}.AppImage`), appImage(), 0o755);
    }
  },
  flatpaks: (home) => { for (const e of emus()) for (const id of [e.fp, ...(EMU[e.id]?.fp || [])].filter(Boolean).slice(0, 1)) flatpak(home, id); flatpak(home, 'org.libretro.RetroArch'); },
  // EmuDeck: launchers in Emulation/tools/launchers, AppImages in ~/Applications, Vita3K in its own folder, the rest Flatpaks
  emudeck: (home) => {
    const L = path.join(home, 'Emulation/tools/launchers');
    for (const e of emus()) {
      const E = EMU[e.id]; if (!E?.scripts?.length) continue;
      if (e.id === 'vita3k') { const p = put(path.join(home, 'Applications/Vita3K/Vita3K'), appImage(), 0o755); put(path.join(L, 'vita3k.sh'), `#!/bin/bash\n"${p}" -Fr "$@"\n`, 0o755); continue; }
      if (e.how === 'appimage' && e.name) { const p = put(path.join(home, 'Applications', e.name), appImage(), 0o755); put(path.join(L, E.scripts[0]), `#!/bin/bash\n"${p}" "$@"\n`, 0o755); continue; }
      const fp = e.fp || E.fp?.[0]; if (!fp) continue;
      flatpak(home, fp); put(path.join(L, E.scripts[0]), `#!/bin/bash\n/usr/bin/flatpak run ${fp} "$@"\n`, 0o755);
    }
    flatpak(home, 'org.libretro.RetroArch'); put(path.join(L, 'retroarch.sh'), '#!/bin/bash\n/usr/bin/flatpak run org.libretro.RetroArch "$@"\n', 0o755);
    put(path.join(home, 'emudeck/settings.sh'), `emulationPath=${home}/Emulation\nromsPath=${home}/Emulation/roms\n`);
  },
  none: () => {},
};

(async () => {
  const srv = await mock.start({ games: 30 });
  for (const [name, make] of Object.entries(process.argv[2] ? { [process.argv[2]]: SETUPS[process.argv[2]] } : SETUPS)) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), `cart-setup-${name}-`));
    const data = path.join(home, '.config/Cartridge'), roms = path.join(home, 'Emulation/roms');
    fs.mkdirSync(data, { recursive: true }); fs.mkdirSync(roms, { recursive: true });
    fs.writeFileSync(path.join(data, 'config.json'), JSON.stringify({
      configured: true, welcomed: 1, setupDone: true, configVersion: 3, romsRoot: roms,
      server: { localUrl: `http://127.0.0.1:${srv.port}`, mode: 'local', auth: 'password', username: 'tester', password: 'pw' },
      ui: { toured: true, startTips: true, setupNotice: 1, welcomeNotice: 1, gameModeAsked: 1, sounds: false, idle: '0' },
    }));
    make(home);
    const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local/share'), CARTRIDGE_MULTI: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' };
    const app = await _electron.launch({ executablePath: require('electron'), args: [ROOT, '--no-sandbox'], env, timeout: 60000 });
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const call = (ch, arg) => page.evaluate(([c, a]) => window.cart.call(c, a).then((r) => (r && 'ok' in r ? (r.ok ? r.data : { error: r.error }) : r)), [ch, arg]);
    try {
      await page.waitForSelector('.tabs [data-tab]', { timeout: 30000 });
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
    await app.close().catch(() => {});
    fs.rmSync(home, { recursive: true, force: true });
  }
  await srv.close();
  const bad = results.filter((r) => !r.ok).length;
  console.log(`== setups: ${results.length - bad} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
