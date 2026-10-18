// Fake homes for the end-to-end sweeps (0.9.76): emulators laid out the four ways people have them (AppImages only,
// Flatpaks only, EmuDeck, nothing installed), and the real app started in one against the fake RomM.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron } = require('playwright-core');
const G = require('../../electron/emuGet');
const { EMU } = require('../../electron/emulators');

const ROOT = path.join(__dirname, '../..');
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

async function launch(name, srv, opts = {}) {
  const { config = {}, args = [] } = opts;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `cart-${name}-`));
  const data = path.join(home, '.config/Cartridge'), roms = path.join(home, 'Emulation/roms');
  fs.mkdirSync(data, { recursive: true }); fs.mkdirSync(roms, { recursive: true });
  fs.writeFileSync(path.join(data, 'config.json'), JSON.stringify({
    configured: true, welcomed: 1, setupDone: true, configVersion: 3, romsRoot: roms,
    server: { localUrl: `http://127.0.0.1:${srv.port}`, mode: 'local', auth: 'password', username: 'tester', password: 'pw' },
    ...config, ui: { toured: true, startTips: true, setupNotice: 1, welcomeNotice: 1, gameModeAsked: 1, sounds: false, idle: '0', ...(config.ui || {}) },
  }));
  SETUPS[name](home);
  if (opts.prep) opts.prep(home); // 0.9.84: files that must be there before the app starts (forks, saves)
  // a Steam install with one account (closed), so shortcuts can be written: the same as a Deck's in Desktop Mode
  if (opts.steam) {
    const steam = path.join(home, '.local/share/Steam');
    put(path.join(steam, 'config/loginusers.vdf'), '"users"\n{\n\t"76561198000000001"\n\t{\n\t\t"AccountName"\t\t"player"\n\t\t"PersonaName"\t\t"Player"\n\t\t"MostRecent"\t\t"1"\n\t}\n}\n');
    put(path.join(steam, 'userdata/39734273/config/localconfig.vdf'), '"UserLocalConfigStore"\n{\n}\n');
    fs.mkdirSync(path.join(steam, 'userdata/39734273/config/grid'), { recursive: true });
  }
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local/share'), CARTRIDGE_MULTI: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' };
  const app = await _electron.launch({ executablePath: require('electron'), args: [ROOT, '--no-sandbox', ...args], env, timeout: 60000 });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const call = (ch, arg) => page.evaluate(([c, a]) => window.cart.call(c, a).then((r) => (r && typeof r === 'object' && 'ok' in r ? (r.ok ? r.data : { error: r.error }) : r)), [ch, arg]);
  await page.waitForSelector('.tabs [data-tab]', { timeout: 30000 });
  return { app, page, call, errors, home, roms, data, close: async () => { await app.close().catch(() => {}); fs.rmSync(home, { recursive: true, force: true }); } };
}

module.exports = { SETUPS, launch, put, appImage };
