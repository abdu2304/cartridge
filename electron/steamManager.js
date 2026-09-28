// Cartridge's Steam ROM manager: adds downloaded games to Steam as non-Steam shortcuts that launch
// the way your existing shortcuts already do.
//
// How a shortcut is built, per console:
//   1. Learned: copied from shortcuts already in Steam (added by Steam ROM Manager, EmuDeck or by
//      hand). Target, Start In and Launch Options are kept exactly; only the game is swapped.
//      Frame generation wrappers (mako-run, lsfg-vk) are left out.
//   2. Found: for consoles with no shortcut to learn from, the emulator is looked up (EmuDeck
//      launcher, AppImage, Flatpak) and started with its documented options.
//   3. Yours: anything can be edited in Settings → Steam → Emulators.
// Steam is closed before its files are written (it overwrites them on exit otherwise). That is done
// by a small helper process (steamHelper.js) so it survives Steam closing Cartridge in Game Mode.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const { parseVdf, shortcutId, steamRunning } = require('./steamArt');

const HOME = os.homedir();
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const ls = (p) => { try { return fs.readdirSync(p); } catch { return []; } };
const real = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
const unq = (s) => String(s || '').trim().replace(/^"(.*)"$/, '$1');
const q = (s) => `"${s}"`;

// ---------------------------------------------------------------- Steam install + account
function steamRoots() {
  const seen = new Set();
  return [path.join(HOME, '.local/share/Steam'), path.join(HOME, '.steam/steam'), path.join(HOME, '.steam/root'), path.join(HOME, '.var/app/com.valvesoftware.Steam/data/Steam'), path.join(HOME, '.var/app/com.valvesoftware.Steam/.local/share/Steam')]
    .filter((p) => isDir(p))
    .filter((p) => { const r = real(p); if (seen.has(r)) return false; seen.add(r); return true; });
}
// loginusers.vdf (text) names the accounts and marks the most recent one
function loginUsers(root) {
  const t = (() => { try { return fs.readFileSync(path.join(root, 'config', 'loginusers.vdf'), 'utf8'); } catch { return ''; } })();
  const out = {};
  const re = /"(7656\d{13})"\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(t))) {
    const get = (k) => (m[2].match(new RegExp(`"${k}"\\s*"([^"]*)"`, 'i')) || [])[1] || '';
    const id = String(BigInt(m[1]) - 76561197960265728n);
    out[id] = { name: get('PersonaName') || get('AccountName'), mostRecent: get('MostRecent') === '1', ts: Number(get('Timestamp')) || 0 };
  }
  return out;
}
function environment() {
  const roots = steamRoots();
  if (!roots.length) return { installed: false, reason: 'nosteam' };
  const accounts = [];
  for (const root of roots) {
    const names = loginUsers(root);
    for (const id of ls(path.join(root, 'userdata'))) {
      if (!/^\d+$/.test(id) || id === '0') continue;
      const cfg = path.join(root, 'userdata', id, 'config');
      if (!isDir(cfg)) continue;
      accounts.push({ root, id, name: names[id]?.name || id, mostRecent: !!names[id]?.mostRecent, ts: names[id]?.ts || 0, flatpak: root.includes('com.valvesoftware.Steam') });
    }
  }
  if (!accounts.length) return { installed: true, reason: 'noaccount', roots };
  accounts.sort((a, b) => (b.mostRecent - a.mostRecent) || (b.ts - a.ts));
  return { installed: true, accounts, account: accounts[0], running: steamRunning() };
}
const files = (acc) => ({
  shortcuts: path.join(acc.root, 'userdata', acc.id, 'config', 'shortcuts.vdf'),
  grid: path.join(acc.root, 'userdata', acc.id, 'config', 'grid'),
  cloud: path.join(acc.root, 'userdata', acc.id, 'config', 'cloudstorage', 'cloud-storage-namespace-1.json'),
  config: path.join(acc.root, 'config', 'config.vdf'),
});
function readShortcuts(acc) {
  const f = files(acc).shortcuts;
  if (!exists(f)) return [];
  const data = parseVdf(fs.readFileSync(f));
  return Object.values(data.shortcuts || data.Shortcuts || {}).map((e) => {
    const exeRaw = e.Exe || e.exe || '';
    let exe = unq(exeRaw), lo = e.LaunchOptions || '';
    // Steam ROM Manager (EmuDeck's setup) puts the arguments in Target: '"xemu-emu.sh" -full-screen
    // -dvd_path "game.iso"' with empty Launch options. Read it as the exe plus "%command% <args>"
    const toks = tokenize(exeRaw);
    if (toks.length > 1 && /^["']/.test(exeRaw.trim())) {
      exe = toks[0].val;
      const extra = toks.slice(1).map((t) => t.raw).join(' ');
      lo = /%command%/.test(lo) ? lo.replace('%command%', `%command% ${extra}`) : `%command% ${extra}${lo ? ' ' + lo : ''}`;
    }
    return { appid: (e.appid ?? 0) >>> 0, name: e.AppName || e.appname || '', exe, exeRaw, start: unq(e.StartDir || ''), lo, loRaw: e.LaunchOptions || '', last: e.LastPlayTime || 0 };
  });
}
// Collections the user made (dynamic, filter-based ones can't hold chosen games)
function readCollections(acc) {
  try {
    const arr = JSON.parse(fs.readFileSync(files(acc).cloud, 'utf8'));
    const out = [];
    for (const [k, v] of arr) {
      if (!k.startsWith('user-collections.') || v.is_deleted || !v.value) continue;
      try { const c = JSON.parse(v.value); if (c.filterSpec) continue; out.push({ id: c.id, name: c.name, added: c.added || [] }); } catch {}
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  } catch { return []; }
}

// ---------------------------------------------------------------- launch options: tokens
// Split like a shell does, but keep each token's original text (quotes included)
function tokenize(s) {
  const out = [];
  let i = 0;
  s = String(s || '');
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    let start = i, val = '', inq = null;
    while (i < s.length && (inq || !/\s/.test(s[i]))) {
      const ch = s[i];
      if (inq) { if (ch === inq) inq = null; else val += ch; }
      else if (ch === '"' || ch === "'") inq = ch;
      else val += ch;
      i++;
    }
    out.push({ raw: s.slice(start, i), val });
  }
  return out;
}
// Frame generation wrappers are not part of how a game launches: leave them out of new shortcuts
const FRAMEGEN = /(^|\/)(mako-run|lsfg(-vk)?|lsfg-vk-.*|framegen)$/i;
const FRAMEGEN_ENV = /^(LSFG_|ENABLE_LSFG|MAKO_)/i;
function stripFramegen(tokens) {
  return tokens.filter((t) => !FRAMEGEN.test(t.val) && !FRAMEGEN_ENV.test(t.val));
}

// ---------------------------------------------------------------- consoles
const EMU_CONSOLE = [
  [/rpcs3/i, 'ps3'], [/shadps4/i, 'ps4'], [/pcsx2/i, 'ps2'], [/(eden|yuzu|citron|sudachi|ryujinx|suyu)/i, 'switch'],
  [/cemu/i, 'wiiu'], [/xenia/i, 'xbox360'], [/xemu/i, 'xbox'], [/vita3k/i, 'psvita'], [/ppsspp/i, 'psp'],
  [/duckstation/i, 'psx'], [/(azahar|citra|lime3ds)/i, 'n3ds'], [/melonds/i, 'nds'],
];
module.exports = function createSteamManager(ctx) {
  const { USER_DATA, log, PLATFORM_MAP } = ctx;
  const cfg = () => { const c = ctx.getConfig(); c.steam ||= {}; return c.steam; };
  const REG_FILE = path.join(USER_DATA, 'steam-games.json');
  const QUEUE_FILE = path.join(USER_DATA, 'steam-queue.json');
  const JOB_DIR = path.join(USER_DATA, 'steam-jobs');
  const BACKUP_DIR = path.join(USER_DATA, 'steam-backups');
  const reg = (() => { try { return JSON.parse(fs.readFileSync(REG_FILE, 'utf8')); } catch { return {}; } })(); // appid -> { romId, name, console, exe, at }
  let queue = (() => { try { return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')); } catch { return { add: [], remove: [], collections: {} }; } })();
  const GONE_FILE = path.join(USER_DATA, 'steam-games-removed.json'); // so Undo can bring them back as ours
  const gone = (() => { try { return JSON.parse(fs.readFileSync(GONE_FILE, 'utf8')); } catch { return {}; } })();
  const live = require('./steamLive')({ log });
  const saveReg = () => { try { fs.writeFileSync(REG_FILE, JSON.stringify(reg, null, 1)); fs.writeFileSync(GONE_FILE, JSON.stringify(gone)); } catch {} };
  const saveQueue = () => { try { fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue)); } catch {} ctx.broadcast('steam-queue', queueInfo()); };

  // folder name under roms/ -> RomM slug (prefer slugs the library actually has)
  function folderSlug(folder) {
    const f = String(folder || '').toLowerCase();
    const lib = ctx.getLibrary();
    const have = new Set((lib?.platforms || []).flatMap((p) => [p.slug, p.fs_slug]));
    const hits = Object.entries(PLATFORM_MAP).filter(([, names]) => names.includes(f)).map(([slug]) => slug);
    return hits.find((s) => have.has(s)) || hits[0] || f;
  }
  const consoleKey = (slug) => { // group slug aliases (ps/psx, gc/ngc…) under one key
    const names = PLATFORM_MAP[slug];
    return names ? names[0] : slug;
  };
  const keyOf = (slug, fsSlug) => (PLATFORM_MAP[slug] ? consoleKey(slug) : PLATFORM_MAP[fsSlug] ? consoleKey(fsSlug) : (fsSlug || slug));

  // ---------------------------------------------------------------- learning
  // Returns { console, template } for one existing shortcut, or null when no game is referenced.
  function learnOne(sc) {
    const toks = tokenize(sc.lo);
    const ci = toks.findIndex((t) => t.val === '%command%');
    const pre = ci >= 0 ? toks.slice(0, ci) : [];
    const args = ci >= 0 ? toks.slice(ci + 1) : toks;
    let gi = -1, kind = null, folder = null, sub = '', romRoot = '', sample = '';
    // RPCS3's own shortcut format: "%RPCS3_GAMEID%:BLUS30405"
    gi = args.findIndex((t) => /%RPCS3_GAMEID%:[A-Z]{4}\d{5}/.test(t.val));
    if (gi >= 0) { kind = 'serial'; folder = 'ps3'; }
    if (gi < 0) {
      gi = args.findIndex((t) => /\/roms\/[^/]+\//i.test(t.val));
      if (gi >= 0) {
        const v = args[gi].val.replace(/^Z:(?=\/)/i, ''); // Xenia's Windows-style path
        const m = v.match(/^(.*?\/roms\/)([^/]+)\/(.*)$/i); // the first roms/ (Wii U keeps its own roms/ inside)
        folder = m[2]; romRoot = m[1]; sample = v;
        const rest = m[3].split('/');
        sub = rest.length > 1 ? rest.slice(0, -1).join('/') : '';
        kind = /eboot\.bin$/i.test(v) ? 'eboot' : /\.rpx$/i.test(v) ? 'rpx' : 'path';
      }
    }
    if (gi < 0) {
      // a PS4 game started by its title ID ("-g CUSA12345")
      gi = args.findIndex((t) => /^(CUSA|PPSA)\d{5}$/.test(t.val));
      if (gi >= 0) { kind = 'titleid'; folder = 'ps4'; }
    }
    if (gi < 0) {
      // no roms/ folder: a quoted absolute path to an existing file, console from the emulator
      gi = args.findIndex((t) => t.val.startsWith('/') && /\.[a-z0-9]{2,5}$/i.test(t.val));
      const emu = EMU_CONSOLE.find(([re]) => re.test(sc.exe));
      if (gi < 0 || !emu) return null;
      folder = emu[1]; kind = /eboot\.bin$/i.test(args[gi].val) ? 'eboot' : 'path'; sample = args[gi].val;
    }
    const slug = folderSlug(folder);
    const zp = /^Z:\//i.test(args[gi].val) ? args[gi].val.slice(0, 2) : '';
    const placeholder = kind === 'serial' || kind === 'titleid' ? args[gi].raw.replace(/[A-Z]{4}\d{5}/, '{SERIAL}') : args[gi].raw.replace(args[gi].val, zp + '{ROM}');
    const argT = args.map((t, i) => (i === gi ? placeholder : t.raw));
    const preT = stripFramegen(pre).map((t) => t.raw);
    let start = sc.start;
    if (/^\/tmp\/\.mount_/.test(start) || !start) start = path.dirname(sc.exe);
    return {
      console: consoleKey(slug), slug,
      template: { exe: sc.exe, start, pre: preT, command: ci >= 0, args: argT.join(' '), kind, romRoot, sub, sample, from: sc.name, fromId: sc.appid, how: 'learned' },
    };
  }
  let romRoots = [];
  function learnAll(scs) {
    const by = {};
    const roots = new Set();
    for (const sc of scs) {
      if (reg[sc.appid] || /cartridge/i.test(sc.name + ' ' + sc.exe)) continue; // ours: never learn from those
      let l = null;
      try { l = learnOne(sc); } catch {}
      if (!l) continue;
      if (l.template.romRoot) roots.add(l.template.romRoot);
      const key = l.console;
      const sig = [l.template.exe, l.template.pre.join(' '), l.template.args].join('|');
      (by[key] ||= {});
      const e = (by[key][sig] ||= { n: 0, last: 0, t: l.template, slug: l.slug });
      e.n++; e.last = Math.max(e.last, sc.last || 0);
    }
    const out = {};
    for (const [k, sigs] of Object.entries(by)) {
      // the pattern most of that console's shortcuts use; ties go to the most recently played
      const best = Object.values(sigs).sort((a, b) => (b.n - a.n) || (b.last - a.last))[0];
      out[k] = { ...best.t, count: best.n, slug: best.slug };
    }
    romRoots = [...roots];
    return out;
  }

  // ---------------------------------------------------------------- finding emulators
  const APP_DIRS = () => require('./trophies').APP_DIRS();
  function launchersDirs() { return ctx.emulationRoots().map((r) => path.join(r, 'tools', 'launchers')).filter(isDir); }
  let flatpaks = null;
  function flatpakApps() {
    if (flatpaks) return flatpaks;
    try { flatpaks = execFileSync('flatpak', ['list', '--app', '--columns=application'], { encoding: 'utf8', timeout: 8000 }).split('\n').map((s) => s.trim()).filter(Boolean); } catch { flatpaks = []; }
    return flatpaks;
  }
  // what emulators exist and how each starts: electron/emulators.js (only installed ones are offered)
  const { EMU, CORES, RA_FIRST, emulatorsFor, argsFor, coreName, DISC_FIRST, GAME_EXT, DIR_GAMES } = require('./emulators');
  const BIN_DIRS = () => [...new Set([...(process.env.PATH || '').split(':'), '/usr/bin', '/usr/local/bin', '/usr/games', '/app/bin', path.join(HOME, '.local/bin'), '/var/lib/flatpak/exports/bin'].filter((d) => d && d.startsWith('/') && !d.includes('/tmp/.mount_')))];
  const findBin = (names) => { for (const d of BIN_DIRS()) for (const n of names || []) { const f = path.join(d, n); if (exists(f) && !isDir(f)) return f; } return null; };
  const kindOf = (key) => (key === 'ps4' ? 'eboot' : key === 'wiiu' ? 'rpx' : 'path');
  // Every emulator for this console that is installed here: [{ id, label, t }]. Each copy is listed
  // (someone can have both the Flatpak and an AppImage); the first copy keeps the plain id.
  function candidates(key) {
    const L = launchersDirs(), out = [];
    // An EmuDeck launcher is often a wrapper: dolphin-emu.sh runs the Dolphin Flatpak, pcsx2-qt.sh the
    // AppImage in ~/Applications. Then that copy is the same install and is not listed again.
    const wraps = (script) => { let t = ''; try { t = fs.readFileSync(script, 'utf8'); } catch {} return { flatpak: /flatpak/i.test(t), appimage: /\.AppImage/i.test(t) }; };
    const emuApps = [path.join(HOME, 'Applications'), path.join(real(HOME), 'Applications')];
    for (const id of emulatorsFor(key)) {
      const e = EMU[id], found = [];
      const mk = (exe, start, src, from, args) => found.push({ t: { exe, start, pre: [], command: true, args: args || argsFor(id, key, src), kind: e.kind || kindOf(key), how: src, from }, src });
      let wrap = { flatpak: false, appimage: false };
      for (const d of L) for (const sc of e.scripts || []) if (exists(path.join(d, sc)) && !found.length) { mk(path.join(d, sc), d, 'emudeck', `EmuDeck ${e.label}`); wrap = wraps(path.join(d, sc)); }
      if (e.app) {
        for (const d of APP_DIRS()) {
          if (found.some((f) => f.src === 'appimage') || (wrap.appimage && emuApps.includes(d))) continue;
          const apps = ls(d).filter((n) => e.app.test(n) && /\.appimage$/i.test(n));
          const hit = apps.filter((n) => !/qtlauncher/i.test(n)).sort().pop() || apps.sort().pop();
          if (hit) mk(path.join(d, hit), d, 'appimage', hit, /qtlauncher/i.test(hit) && e.qtArgs ? e.qtArgs : null);
        }
      }
      const fp = (e.fp || []).find((x) => flatpakApps().includes(x));
      if (fp && !wrap.flatpak) mk('/usr/bin/flatpak', '/usr/bin', 'flatpak', fp, `run ${fp} ${argsFor(id, key, 'flatpak')}`);
      const bin = findBin(e.bin);
      if (bin && !/flatpak\/exports/.test(bin)) mk(bin, path.dirname(bin), 'native', bin);
      const SRC = { emudeck: 'EmuDeck', appimage: 'AppImage', flatpak: 'Flatpak', native: 'Installed' };
      found.forEach((f, i) => out.push({ id: i ? `${id}@${f.src}` : id, label: found.length > 1 ? `${e.label} · ${SRC[f.src]}` : e.label, t: f.t }));
    }
    // RetroArch, from every place it can be installed, with each core that copy has. The sandboxed
    // (Flatpak, EmuDeck) RetroArch gets the core by name and finds it in its own cores folder: a full
    // path breaks when it sees home under another path (Bazzite: /var/home). Others get the full path.
    const homes = [...new Set([HOME, real(HOME)])];
    const flatCores = homes.map((h) => path.join(h, '.var/app/org.libretro.RetroArch/config/retroarch/cores'));
    const nativeCores = [...homes.map((h) => path.join(h, '.config/retroarch/cores')), '/usr/lib/libretro', '/usr/lib64/libretro', '/usr/lib/x86_64-linux-gnu/libretro', '/usr/local/lib/libretro'];
    const sources = [];
    const raSh = L.map((d) => path.join(d, 'retroarch.sh')).find(exists);
    if (raSh) sources.push({ src: 'EmuDeck', exe: raSh, start: path.dirname(raSh), pre: '', dirs: flatCores, byName: true, from: 'EmuDeck RetroArch' });
    if (flatpakApps().includes('org.libretro.RetroArch') && !(raSh && wraps(raSh).flatpak)) sources.push({ src: 'Flatpak', exe: '/usr/bin/flatpak', start: '/usr/bin', pre: 'run org.libretro.RetroArch ', dirs: flatCores, byName: true, from: 'RetroArch (Flatpak)' });
    for (const d of APP_DIRS()) { const hit = ls(d).filter((n) => /^retroarch.*\.appimage$/i.test(n)).sort().pop(); if (hit) { sources.push({ src: 'AppImage', exe: path.join(d, hit), start: d, pre: '', dirs: [path.join(d, hit + '.home/.config/retroarch/cores'), ...nativeCores], from: hit }); break; } }
    const raBin = findBin(['retroarch']);
    if (raBin && !/flatpak\/exports/.test(raBin)) sources.push({ src: 'Installed', exe: raBin, start: path.dirname(raBin), pre: '', dirs: nativeCores, from: raBin });
    for (const root of steamRoots()) { const d = path.join(root, 'steamapps/common/RetroArch'); if (exists(path.join(d, 'retroarch'))) { sources.push({ src: 'Steam', exe: path.join(d, 'retroarch'), start: d, pre: '', dirs: [path.join(d, 'cores')], from: 'RetroArch on Steam' }); break; } }
    const ras = [];
    sources.forEach((so, si) => {
      for (const c of CORES[key] || []) {
        const file = so.dirs.map((d) => path.join(d, `${c}_libretro.so`)).find(exists);
        if (!file) continue;
        const core = so.byName ? `${c}_libretro.so` : `"${real(file)}"`;
        ras.push({ id: 'ra:' + c + (si ? '@' + so.src.toLowerCase() : ''), label: `RetroArch · ${coreName(c)}${sources.length > 1 ? ' · ' + so.src : ''}`,
          t: { exe: so.exe, start: so.start, pre: [], command: true, args: `${so.pre}-L ${core} "{ROM}"`, kind: 'path', how: so.src === 'EmuDeck' ? 'emudeck' : so.src === 'Flatpak' ? 'flatpak' : so.src === 'AppImage' ? 'appimage' : 'native', from: so.from } });
      }
    });
    return RA_FIRST.has(key) ? [...ras, ...out] : [...out, ...ras];
  }
  function findTemplate(key) { return candidates(key)[0]?.t || null; }
  // ---------------------------------------------------------------- per-game details
  function serialOf(rom, p) {
    const tag = String(rom.fs_name || '') + ' ' + String(rom.name || '');
    const m = tag.match(/\b([A-Z]{4}\d{5})\b/);
    if (m) return m[1];
    // a folder game: PS3_GAME/PARAM.SFO holds the serial
    // (also one folder down: a download folder holding the game folder)
    const sfos = [path.join(p, 'PS3_GAME', 'PARAM.SFO'), path.join(p, 'PARAM.SFO'), path.join(p, 'sce_sys', 'param.sfo')];
    if (isDir(p)) for (const n of ls(p)) if (isDir(path.join(p, n))) sfos.push(path.join(p, n, 'PS3_GAME', 'PARAM.SFO'), path.join(p, n, 'sce_sys', 'param.sfo'));
    for (const f of sfos) {
      try { const b = fs.readFileSync(f); const s = b.toString('latin1').match(/[A-Z]{4}\d{5}/); if (s) return s[0]; } catch {}
    }
    // an ISO inside a folder
    if (isDir(p)) { const iso = ls(p).find((n) => /\.iso$/i.test(n)); if (iso) p = path.join(p, iso); }
    // a disc image: look for the serial near the start of the ISO (PS3_DISC.SFB / PARAM.SFO)
    try {
      const fd = fs.openSync(p, 'r'); const b = Buffer.alloc(1024 * 1024);
      fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd);
      const s = b.toString('latin1').match(/(BL|BC|NP)(US|ES|JS|AS|KS|UB|EB|JM|JB|HB)\d{5}/);
      if (s) return s[0];
    } catch {}
    return null;
  }
  // Vita title ID (PCSE00000): from the name, else from the start of the .pkg/.vpk (its content ID)
  function vitaTitleId(rom, file) {
    const m = (String(rom.fs_name || '') + ' ' + String(rom.name || '') + ' ' + path.basename(file || '')).match(/\b(PCS[A-Z]\d{5})\b/);
    if (m) return m[1];
    try {
      const f = isDir(file) ? path.join(file, ls(file).find((n) => /\.(pkg|vpk)$/i.test(n)) || '') : file;
      const fd = fs.openSync(f, 'r'); const b = Buffer.alloc(256 * 1024); fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd);
      const s = b.toString('latin1').match(/PCS[A-Z]\d{5}/); if (s) return s[0];
    } catch {}
    return null;
  }
  // Vita3K keeps installed games in <pref>/ux0/app/<title ID>
  function vitaInstalled(id) {
    const prefs = [path.join(HOME, '.local/share/Vita3K/Vita3K'), path.join(HOME, '.local/share/Vita3K'), ...ctx.emulationRoots().map((r) => path.join(r, 'storage/Vita3K'))];
    for (const c of [path.join(HOME, '.config/Vita3K/config.yml'), path.join(HOME, '.local/share/Vita3K/Vita3K/config.yml')]) { try { const m = fs.readFileSync(c, 'utf8').match(/^pref-path:\s*(.+)$/m); if (m) prefs.unshift(m[1].trim().replace(/^['"]|['"]$/g, '')); } catch {} }
    return prefs.some((p) => isDir(path.join(p, 'ux0/app', id)));
  }
  function rpcs3Knows(serial) {
    for (const f of [path.join(HOME, '.config/rpcs3/games.yml'), path.join(HOME, '.var/app/net.rpcs3.RPCS3/config/rpcs3/games.yml')]) {
      try { if (new RegExp(`^${serial}\\s*:`, 'm').test(fs.readFileSync(f, 'utf8'))) return true; } catch {}
    }
    return false;
  }
  function ps4TitleId(dir) {
    for (const f of [path.join(dir, 'sce_sys', 'param.sfo')]) {
      try { const m = fs.readFileSync(f).toString('latin1').match(/(CUSA|PPSA)\d{5}/); if (m) return m[0]; } catch {}
    }
    return null;
  }
  function findEboot(dir) {
    const walk = (d, depth) => {
      for (const n of ls(d)) {
        const p = path.join(d, n);
        if (/^eboot\.bin$/i.test(n)) return p;
        if (depth < 3 && isDir(p)) { const r = walk(p, depth + 1); if (r) return r; }
      }
      return null;
    };
    return isDir(dir) ? walk(dir, 0) : null;
  }
  // Write the game's path the way that console's shortcuts write theirs (/run/media vs /media…)
  // (the console's own shortcuts first, then any other shortcut's roms folder on the same drive)
  function styled(file, t) {
    const rf = real(file);
    for (const root of [t.romRoot, ...romRoots].filter(Boolean)) {
      let rr = real(root.replace(/\/+$/, ''));
      if (!rr) continue;
      rr = rr.endsWith('/') ? rr : rr + '/';
      if (rf.startsWith(rr)) return (root.endsWith('/') ? root : root + '/') + rf.slice(rr.length);
    }
    // no shortcut style to follow: the real path, which sandboxed (Flatpak) emulators can always
    // open, unlike a symlinked home such as /home on Bazzite and other image-based systems
    return rf;
  }
  // What goes in place of the game in the launch options
  function gameRef(rom, file, t) {
    if (t.kind === 'serial') {
      const serial = serialOf(rom, file);
      if (serial && rpcs3Knows(serial)) return { SERIAL: serial };
      // RPCS3 doesn't know this game yet: launch it by path instead
      const target = isDir(file) ? (findEboot(file) || file) : file;
      return { ROM: styled(target, t), fallback: 'path' };
    }
    if (t.kind === 'titleid') {
      const id = (String(rom.fs_name || '') + ' ' + path.basename(file) + ' ' + (rom.name || '')).match(/\b(CUSA|PPSA)\d{5}\b/i)?.[0]?.toUpperCase() || ps4TitleId(file);
      if (id) return { SERIAL: id };
      const e = findEboot(file);
      return { ROM: styled(e || file, t), fallback: 'path' };
    }
    if (t.kind === 'vitaid') { // installed in Vita3K? then by title ID; otherwise it can't start yet
      const id = vitaTitleId(rom, file);
      const how = 'in Vita3K first (File → Install .pkg or .vpk), then add it to Steam.';
      return id && vitaInstalled(id) ? { SERIAL: id } : { missing: id ? `Install ${id} ${how}` : `Install this game ${how}` };
    }
    if (t.kind === 'eboot') { const e = findEboot(file); return { ROM: styled(e || file, t) }; }
    if (t.kind === 'rpx' && isDir(file)) { // Wii U game folder: code/<name>.rpx
      const code = path.join(file, 'code');
      const rpx = ls(code).find((n) => /\.rpx$/i.test(n));
      return { ROM: styled(rpx ? path.join(code, rpx) : file, t) };
    }
    // a game kept as a folder: the emulator gets the game file inside (RetroArch, xemu and most
    // others can't open a folder). Consoles that take folders keep it.
    const key = keyOf(rom.platform_slug, rom.platform_fs_slug);
    if (isDir(file) && !DIR_GAMES.has(key)) { const f = playableFile(file, key); if (f) return { ROM: styled(f, t) }; }
    return { ROM: styled(file, t) };
  }
  // the file to start in a game folder: a playlist or disc descriptor, then the console's game
  // extensions in order, else the biggest file. Looks two folders deep.
  function playableFile(dir, key) {
    const files = [];
    const walk = (d, depth) => { for (const n of ls(d)) { const f = path.join(d, n); if (isDir(f)) { if (depth < 2) walk(f, depth + 1); } else files.push(f); } };
    walk(dir, 0);
    if (!files.length) return null;
    const ext = (f) => path.extname(f).slice(1).toLowerCase();
    for (const e of [...DISC_FIRST, ...(GAME_EXT[key] || [])]) {
      const hits = files.filter((f) => ext(f) === e);
      // a playlist named like the folder wins (ES-DE "Game.m3u/Game.m3u"), else the shallowest
      if (hits.length) return hits.sort((a, b) => (path.basename(b, '.' + e) === path.basename(dir).replace(/\.m3u$/i, '')) - (path.basename(a, '.' + e) === path.basename(dir).replace(/\.m3u$/i, '')) || a.split('/').length - b.split('/').length)[0];
    }
    const junk = /\.(txt|nfo|jpe?g|png|pdf|md|sav|srm|state\d*|dat|xml|sfv|md5|sha1)$/i;
    return files.filter((f) => !junk.test(f)).sort((a, b) => (fs.statSync(b).size || 0) - (fs.statSync(a).size || 0))[0] || null;
  }

  // ---------------------------------------------------------------- templates for every console
  let learned = {}, learnedAt = 0;
  function refreshLearned() {
    const env = environment();
    if (!env.account) { learned = {}; return env; }
    try { learned = learnAll(readShortcuts(env.account)); } catch (e) { log('steam learn failed', e.message); learned = {}; }
    learnedAt = Date.now();
    return env;
  }
  function templateFor(key) {
    const own = cfg().templates?.[key];
    if (own && own.exe) return { ...own, how: 'yours' };
    if (Date.now() - learnedAt > 60000) refreshLearned();
    // an emulator picked on the console page
    const pick = (cfg().emus || {})[key];
    if (pick && pick !== 'learned') { const c = candidates(key).find((x) => x.id === pick); if (c) return { ...c.t, emu: c.id }; }
    if (learned[key]) return { ...learned[key], emu: 'learned' };
    const c = candidates(key)[0];
    return c ? { ...c.t, emu: c.id } : null;
  }
  // what a shortcut was made with, to spot ones made before the console's setup changed
  // v2: arguments written into Target like Steam ROM Manager (0.7.11)
  const sigOf = (t, mode) => (t ? ['v2', mode || 'direct', t.exe, (t.pre || []).join(' '), t.args].join('|') : '');
  function buildLaunch(rom, file, t) {
    const ref = gameRef(rom, file, t);
    let args = t.args;
    if (ref.fallback === 'path') args = args.replace(/"?%RPCS3_GAMEID%:\{SERIAL\}"?/, '"{ROM}"').replace(/(^|\s)(["']?)\{SERIAL\}\2(?=\s|$)/, '$1"{ROM}"');
    const romPath = ref.ROM || '';
    args = args.replace(/\{ROM\}/g, romPath).replace(/\{SERIAL\}/g, ref.SERIAL || '')
      .replace(/\{DIR\}/g, romPath ? path.dirname(romPath) : '').replace(/\{NAME\}/g, romPath ? path.basename(romPath).replace(/\.[^.]+$/, '') : ''); // MAME: folder and set name
    const lo = [...(t.pre || []), ...(t.command ? ['%command%'] : []), args].filter(Boolean).join(' ');
    return { lo, args, fallback: ref.fallback, missing: ref.missing };
  }

  // ---------------------------------------------------------------- library view
  const SHORT = { ps2: 'PS2', ps3: 'PS3', ps4: 'PS4', psx: 'PS1', psp: 'PSP', psvita: 'Vita', gc: 'GameCube', wii: 'Wii', wiiu: 'Wii U', switch: 'Switch', n3ds: '3DS', nds: 'DS', n64: 'N64', snes: 'SNES', nes: 'NES', gba: 'GBA', gb: 'Game Boy', gbc: 'GBC', xbox: 'Xbox', xbox360: 'Xbox 360', dreamcast: 'Dreamcast', genesis: 'Genesis', megadrive: 'Mega Drive', saturn: 'Saturn' };
  const normPath = (p) => real(String(p || '')).replace(/\/+$/, '');
  function installedGames() {
    const lib = ctx.getLibrary();
    const inst = ctx.installed();
    const out = [];
    for (const p of lib?.platforms || []) {
      for (const r of lib.roms[p.id] || []) {
        let file = inst[r.id];
        if (!file) continue;
        if (file === ctx.MARKED) file = ctx.markedPath(r) || null;
        out.push({ rom: r, file, platform: p, key: keyOf(p.slug, p.fs_slug) });
      }
    }
    return out;
  }
  // Which downloaded games are already in Steam (ours, or added some other way)
  // names compare on letters and digits only: "Ratchet & Clank : Into the Nexus™" = "Ratchet & Clank: Into the Nexus"
  const nameKey = (n) => String(n || '').toLowerCase().replace(/[™®©]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  // a game's serial (PS3 BLUS30405, PS4 CUSA12345): from its name, else read from the game itself (cached)
  const serialCache = new Map();
  function gameSerial(g) {
    const k = g.rom.id + '|' + g.file;
    if (serialCache.has(k)) return serialCache.get(k);
    let s = (String(g.rom.fs_name + ' ' + (g.file ? path.basename(g.file) : '')).match(/\b([A-Z]{4}\d{5})\b/) || [])[1] || null;
    if (!s && g.file && ['ps3', 'psp', 'psvita'].includes(g.key)) { try { s = serialOf(g.rom, g.file) || null; } catch {} }
    serialCache.set(k, s);
    return s;
  }
  // a game added live whose shortcut Steam hasn't saved to disk yet
  function liveHit(g) {
    const hit = Object.entries(reg).find(([, r]) => r.live && r.romId === g.rom.id);
    return hit ? { appid: Number(hit[0]) >>> 0, name: hit[1].name, exe: hit[1].exe } : null;
  }
  function inSteamIndex(scs) {
    const byPath = new Map(), byName = new Map();
    for (const sc of scs) {
      for (const t of tokenize(sc.lo)) { const v = t.val.replace(/^Z:(?=\/)/i, ''); if (v.startsWith('/')) byPath.set(normPath(v), sc); } // Z: = Xenia under Proton
      const serial = (sc.lo.match(/%RPCS3_GAMEID%:([A-Z]{4}\d{5})/) || sc.lo.match(/(?:^|\s)["']?((?:CUSA|PPSA)\d{5})\b/) || [])[1];
      if (serial) byPath.set('serial:' + serial, sc);
      let con = null;
      try { con = learnOne(sc)?.console || null; } catch {}
      if (!con) { const emu = EMU_CONSOLE.find(([re]) => re.test(sc.exe)); con = emu ? emu[1] : null; }
      const k = nameKey(sc.name);
      (byName.get(k) || byName.set(k, []).get(k)).push({ sc, con });
    }
    return (g) => {
      const f = g.file && normPath(g.file);
      if (f && byPath.has(f)) return byPath.get(f);
      if (f) for (const [k, sc] of byPath) if (k.startsWith(f + '/')) return sc; // eboot inside a game folder
      const serial = gameSerial(g);
      if (serial && byPath.has('serial:' + serial)) return byPath.get('serial:' + serial);
      // same name: only when it's for the same console (or Cartridge can't tell which console)
      const short = SHORT[g.key] || g.platform?.display_name || '';
      const plain = byName.get(nameKey(g.rom.name)) || [];
      const tagged = byName.get(nameKey(`${g.rom.name} (${short})`)) || [];
      const hit = plain.find((x) => x.con === g.key) || tagged.find((x) => x.con === g.key || !x.con);
      if (hit) return hit.sc;
      return null;
    };
  }
  function overview() {
    const env = refreshLearned();
    const scs = env.account ? readShortcuts(env.account) : [];
    const find = inSteamIndex(scs);
    const tFor = {};
    const games = installedGames().map((g) => {
      const sc = find(g) || liveHit(g);
      const ours = sc && reg[sc.appid];
      const queued = queue.add.some((a) => a.romId === g.rom.id) ? 'add' : sc && queue.remove.includes(sc.appid) ? 'remove' : null;
      // a game that can't be added yet (Vita: not installed in Vita3K) says why
      const t = sc || !g.file ? null : (tFor[g.key] !== undefined ? tFor[g.key] : (tFor[g.key] = templateFor(g.key)));
      const blocked = t?.kind === 'vitaid' ? gameRef(g.rom, g.file, t).missing || null : null;
      // ours with arguments in Target but "%command%" in Launch options (Steam's own default): won't start
      const badLo = !!(ours && !ours.loFixed && sc.exeRaw && tokenize(sc.exeRaw).length > 1 && /^\s*%command%\s*$/.test(sc.loRaw || ''));
      return { romId: g.rom.id, name: g.rom.name, console: g.key, platform: g.platform.display_name, inSteam: !!sc, ours: !!ours, appid: sc?.appid || null, queued, file: g.file, blocked, badLo };
    });
    const keys = [...new Set(games.map((g) => g.console))];
    const consoles = keys.map((k) => {
      const t = templateFor(k);
      const ps = games.filter((g) => g.console === k);
      return { key: k, label: SHORT[k] || ps[0]?.platform || k, platform: ps[0]?.platform || k, games: ps.length, inSteam: ps.filter((g) => g.inSteam).length, template: t ? { exe: t.exe, start: t.start, lo: [...(t.pre || []), ...(t.command ? ['%command%'] : []), t.args].join(' '), how: t.how, from: t.from, kind: t.kind,
        // exactly what goes in Steam (see plan): arguments in Target unless something wraps the command
        ...(!(t.pre || []).length && !/%RPCS3_GAMEID%/.test(t.args) ? { target: `${q(t.exe)} ${t.args}`, launch: '' } : { target: q(t.exe), launch: [...(t.pre || []), ...(t.command ? ['%command%'] : []), t.args].join(' ') }) } : null, mode: (cfg().modes || {})[k] || 'direct',
        // installed emulators to pick from, and which one new shortcuts use
        emus: [...(learned[k] ? [{ id: 'learned', label: 'From your Steam shortcuts', sub: learned[k].from }] : []), ...candidates(k).map((c) => ({ id: c.id, label: c.label, sub: c.t.from }))],
        emu: t?.how === 'yours' ? 'yours' : t?.emu || null,
        outdated: t ? ps.filter((g) => g.inSteam && g.ours && (g.badLo || reg[g.appid]?.sig !== sigOf(t, (cfg().modes || {})[k]))).length : 0 };
    }).sort((a, b) => a.platform.localeCompare(b.platform));
    return {
      steam: env.installed ? (env.account ? { account: env.account.name, accounts: env.accounts.map((a) => a.name), running: env.running, flatpak: env.account.flatpak } : { error: 'Steam is installed but no account has signed in yet. Open Steam once, then come back.' }) : { error: 'Steam was not found on this device.' },
      games, consoles, queue: queueInfo(), last: lastStatus(), ours: Object.keys(reg).length,
      collections: env.account ? readCollections(env.account).map((c) => ({ id: c.id, name: c.name })) : [],
      backups: listBackups().length,
    };
  }

  // When each downloaded game was last played from Steam (any shortcut that starts it, whoever
  // added it): Steam writes LastPlayTime into shortcuts.vdf. romId -> ms
  function played() {
    const env = environment();
    if (!env.account) return {};
    const find = inSteamIndex(readShortcuts(env.account));
    const out = {};
    for (const g of installedGames()) { const sc = find(g); if (sc?.last) out[g.rom.id] = sc.last * 1000; }
    return out;
  }

  // One game: is it in Steam, and would Cartridge know how to add it?
  function forRom(romId) {
    const env = environment();
    const g = installedGames().find((x) => x.rom.id === romId);
    const out = { steam: !!env.account, installed: !!g, console: g?.key || consoleOfRom(romId), needsFolder: !!g && !g.file, inSteam: false, ours: false, appid: null, queued: null };
    if (!env.account || !g) return out;
    const sc = inSteamIndex(readShortcuts(env.account))(g) || liveHit(g);
    out.inSteam = !!sc; out.ours = !!(sc && reg[sc.appid]); out.appid = sc?.appid || null;
    out.queued = queue.add.some((a) => a.romId === romId) ? 'add' : sc && queue.remove.includes(sc.appid) ? 'remove' : null;
    out.lastCollections = (cfg().lastCollections || {})[out.console] || null;
    return out;
  }
  // ---------------------------------------------------------------- queue
  function queueInfo() { return { add: queue.add.length, remove: queue.remove.length, total: queue.add.length + queue.remove.length }; }
  function queueAdd(items) { // [{ romId, collections? }]
    for (const it of items) {
      queue.remove = queue.remove.filter((a) => reg[a]?.romId !== it.romId);
      const i = queue.add.findIndex((a) => a.romId === it.romId);
      if (i >= 0) queue.add[i] = it; else queue.add.push(it);
    }
    saveQueue();
    return queueInfo();
  }
  function queueRemove(appids) {
    for (const id of appids) { if (!queue.remove.includes(id >>> 0)) queue.remove.push(id >>> 0); queue.add = queue.add.filter((a) => a.appid !== (id >>> 0)); }
    saveQueue();
    return queueInfo();
  }
  function queueClear() { queue = { add: [], remove: [], collections: {} }; saveQueue(); return queueInfo(); }

  // ---------------------------------------------------------------- plan: what exactly gets written
  function plan() {
    const env = refreshLearned();
    if (!env.account) throw new Error(env.reason === 'nosteam' ? 'Steam was not found on this device.' : 'Open Steam once and sign in, then try again.');
    const scs = readShortcuts(env.account);
    const names = new Set(scs.map((s) => s.name.toLowerCase()));
    const byRom = new Map(installedGames().map((g) => [g.rom.id, g]));
    const entries = [], skipped = [];
    const nameCount = {};
    for (const a of queue.add) { const g = byRom.get(a.romId); if (g) nameCount[g.rom.name.toLowerCase()] = (nameCount[g.rom.name.toLowerCase()] || 0) + 1; }
    for (const a of queue.add) {
      const g = byRom.get(a.romId);
      if (!g) { skipped.push({ romId: a.romId, why: 'not on this device any more' }); continue; }
      if (!g.file) { skipped.push({ romId: a.romId, name: g.rom.name, why: 'Cartridge does not know where this game\'s folder is. Open the game and use Add to Steam to pick it.' }); continue; }
      const t = a.template || templateFor(g.key);
      if (!t) { skipped.push({ romId: a.romId, name: g.rom.name, why: `No emulator found for ${SHORT[g.key] || g.platform.display_name}. Set one in Settings → Steam → Emulators.` }); continue; }
      const mode = (cfg().modes || {})[g.key] || 'direct';
      let name = g.rom.name.replace(/\s+/g, ' ').trim();
      const always = cfg().consoleInName === 'always';
      if (always || nameCount[name.toLowerCase()] > 1 || (names.has(name.toLowerCase()) && !find(scs, g))) name = `${name} (${SHORT[g.key] || g.platform.display_name})`;
      const { lo, args, fallback, missing } = buildLaunch(g.rom, g.file, t);
      if (missing) { skipped.push({ romId: a.romId, name: g.rom.name, why: missing }); continue; }
      let exe = t.exe, start = t.start, launch = lo, target = q(t.exe);
      // Like Steam ROM Manager (EmuDeck's setup): the arguments go in Target and Launch options stay
      // empty. Kept as "%command% ..." only when something must wrap the command (env vars, wrappers)
      // or for RPCS3's %RPCS3_GAMEID% form, which is read from the launch options.
      if (!(t.pre || []).length && !/%RPCS3_GAMEID%/.test(args)) { target = `${q(t.exe)} ${args}`.trim(); launch = ''; }
      if (mode === 'script') { exe = scriptPath(); start = path.dirname(scriptPath()); launch = String(g.rom.id); target = q(exe); }
      const appid = shortcutId(target, name);
      entries.push({
        romId: g.rom.id, console: g.key, sig: sigOf(t, mode), name, exe, target, start, lo: launch, directLo: lo, directExe: t.exe, directStart: t.start, appid, how: t.how, from: t.from, fallback,
        proton: /\.exe$/i.test(t.exe) ? (cfg().proton || 'proton_experimental') : null,
        collections: a.collections || [],
      });
    }
    const removing = queue.remove.map((id) => ({ appid: id, name: reg[id]?.name || scs.find((s) => s.appid === id)?.name || String(id) }));
    return { account: env.account, entries, skipped, removing };
    function find(list, g) { return inSteamIndex(list)(g); }
  }
  function preview() {
    const p = plan();
    return { account: p.account.name, entries: p.entries.map((e) => ({ romId: e.romId, name: e.name, target: e.target, start: q(e.start), lo: e.lo, how: e.how, from: e.from, fallback: e.fallback, collections: e.collections, proton: e.proton })), skipped: p.skipped, removing: p.removing };
  }

  // ---------------------------------------------------------------- launch script (optional mode)
  const scriptPath = () => path.join(USER_DATA, 'play.sh');
  function writeScript() {
    const ai = process.env.APPIMAGE || '';
    const sh = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
    const lines = ['#!/bin/bash', '# Written by Cartridge: launches games added to Steam in "Cartridge script" mode.', '# Rewritten every time Cartridge starts or applies Steam changes.', 'case "$1" in'];
    const byRom = new Map(installedGames().map((g) => [g.rom.id, g]));
    for (const [appid, r] of Object.entries(reg)) {
      if (r.mode !== 'script') continue;
      const g = byRom.get(r.romId);
      const t = g && templateFor(g.key);
      if (!g || !t) { lines.push(`  ${r.romId}) ${ai ? `exec ${sh(ai)} --game ${r.romId}` : 'exit 1'} ;;`); continue; }
      const { lo } = buildLaunch(g.rom, g.file, t);
      const cmd = lo.replace('%command%', sh(t.exe));
      lines.push(`  ${r.romId}) [ -e ${sh(g.file)} ] || ${ai ? `exec ${sh(ai)} --game ${r.romId}` : 'exit 1'}; cd ${sh(t.start)}; ${t.command ? cmd : `${sh(t.exe)} ${cmd}`}; exit $? ;;`);
    }
    lines.push(`  *) ${ai ? `exec ${sh(ai)} --game "$1"` : 'exit 1'} ;;`, 'esac', '');
    try { fs.writeFileSync(scriptPath(), lines.join('\n'), { mode: 0o755 }); } catch (e) { log('play.sh write failed', e.message); }
  }

  // ---------------------------------------------------------------- artwork
  async function writeArt(e, grid) {
    fs.mkdirSync(grid, { recursive: true });
    const rom = ctx.romById(e.romId);
    const out = {};
    const put = async (name, getter) => {
      const f = path.join(grid, name);
      try { const buf = await getter(); if (buf) { fs.writeFileSync(f, buf); out[name] = true; } } catch (err) { log('steam art', name, err.message); }
    };
    const art = ctx.artFor(e.romId) || {};
    const cover = art.grid || rom?.path_cover_large || rom?.path_cover_small || rom?.url_cover;
    const hero = art.hero || rom?.shot || null;
    await put(`${e.appid}p.png`, async () => (cover ? ctx.fetchImage(cover) : ctx.sgdbImage(rom?.name, 'grid')));
    await put(`${e.appid}_hero.png`, async () => (hero ? ctx.fetchImage(hero) : ctx.sgdbImage(rom?.name, 'hero')));
    await put(`${e.appid}.png`, async () => { // wide banner: SteamGridDB's, else cut from the background
      const w = await ctx.sgdbImage(rom?.name, 'wide').catch(() => null);
      if (w) return w;
      const src = hero ? await ctx.fetchImage(hero) : null;
      return src ? ctx.cropTo(src, 920, 430) : null;
    });
    await put(`${e.appid}_logo.png`, async () => { const l = await ctx.logoFile(rom); return l ? fs.readFileSync(l) : null; });
    // the shortcut's icon (library list, recent games): SteamGridDB's square icon, else the cover cut square
    await put(`${e.appid}_icon.png`, async () => {
      const ic = await ctx.gameIconPng(rom).catch(() => null);
      if (ic) return ic;
      const src = cover ? await ctx.fetchImage(cover).catch(() => null) : null;
      return src ? ctx.cropTo(src, 256, 256) : null;
    });
    return out;
  }

  // ---------------------------------------------------------------- apply
  function lastStatus() {
    const f = path.join(JOB_DIR, 'last.status.json');
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
  }
  function listBackups() { return ls(BACKUP_DIR).filter((f) => /^shortcuts\.vdf\.\d/.test(f)).sort().reverse(); }
  async function apply({ restart = true } = {}) {
    const p = plan();
    if (!p.entries.length && !p.removing.length) throw new Error('Nothing to apply');
    const f = files(p.account);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    // artwork can be written while Steam runs (it reads the grid folder when it starts). It comes
    // over the network one game at a time, so report progress: with many games this takes a while
    const prog = (o) => ctx.broadcast('steam-progress', o);
    for (const [i, e] of p.entries.entries()) { prog({ step: 'art', done: i, total: p.entries.length, name: e.name }); await writeArt(e, f.grid); }
    prog({ step: 'steam', done: p.entries.length, total: p.entries.length });
    const collections = {};
    for (const e of p.entries) for (const c of e.collections || []) (collections[c] ||= []).push(e.appid >>> 0);
    const add = p.entries.map((e) => ({
      proton: e.proton,
      entry: { appid: e.appid >>> 0, AppName: e.name, Exe: e.target, StartDir: q(e.start), icon: exists(path.join(f.grid, `${e.appid}_icon.png`)) ? path.join(f.grid, `${e.appid}_icon.png`) : '', ShortcutPath: '', LaunchOptions: e.lo, IsHidden: 0, AllowDesktopConfig: 1, AllowOverlay: 1, OpenVR: 0, Devkit: 0, DevkitGameID: '', DevkitOverrideAppID: 0, LastPlayTime: 0, FlatpakAppID: '', tags: {} },
    }));
    const removeIds = p.removing.map((r) => r.appid >>> 0);
    for (const id of removeIds) if (reg[id]) for (const n of [`${id}p.png`, `${id}.png`, `${id}_hero.png`, `${id}_logo.png`, `${id}_icon.png`]) { try { fs.rmSync(path.join(f.grid, n), { force: true }); } catch {} }
    // our registry first, so the launch script knows the games before Steam starts them
    for (const e of p.entries) reg[e.appid] = { romId: e.romId, name: e.name, console: e.console, exe: e.exe, sig: e.sig, mode: (cfg().modes || {})[e.console] || 'direct', at: Date.now(), account: p.account.id, collections: e.collections };
    for (const id of removeIds) { if (reg[id]) gone[id] = reg[id]; delete reg[id]; }
    saveReg();
    writeScript();
    // Steam's interface reachable (Decky Loader, or live changes turned on): change it while it runs
    if (await live.available(p.account.root)) {
      const res = await applyLive(p, f, removeIds).catch((e) => { log('steam live apply failed, using the helper', e.message); return null; });
      if (res) return finishApply(p, { started: true, live: true, added: res.added, removed: res.removed, steamWillRestart: false });
    }
    runHelper('last', {
      id: stamp, stamp, add, remove: removeIds, collections, restart, gamescope: !!ctx.isGamescope(), flatpakSteam: !!p.account.flatpak,
      shortcutsFile: f.shortcuts, cloudFile: Object.keys(collections).length ? f.cloud : null, configFile: add.some((a) => a.proton) ? f.config : null,
      backupDir: BACKUP_DIR, logFile: path.join(USER_DATA, 'steam-apply.log'),
    });
    log('steam apply started', p.entries.length, 'add,', removeIds.length, 'remove');
    return finishApply(p, { started: true, added: p.entries.length, removed: removeIds.length, steamWillRestart: steamRunning() });
  }
  function finishApply(p, out) {
    const lc = cfg().lastCollections ||= {};
    for (const e of p.entries) lc[e.console] = e.collections || [];
    ctx.saveConfig();
    queue = { add: [], remove: [], collections: queue.collections || {} };
    saveQueue();
    return out;
  }
  // Live: each shortcut is added through Steam itself, which picks the appid, so the registry and
  // artwork move to Steam's id. Removing is one call. Writes the same status file the helper does.
  async function applyLive(p, f, removeIds) {
    const statusFile = path.join(JOB_DIR, 'last.status.json');
    fs.mkdirSync(JOB_DIR, { recursive: true });
    const put = (o) => { try { fs.writeFileSync(statusFile, JSON.stringify({ ...o, at: Date.now(), live: true })); } catch {} };
    put({ state: 'writing' });
    let added = 0;
    for (const e of p.entries) {
      const id = await live.addShortcut({ name: e.name, exe: e.target, start: q(e.start), lo: e.lo, art: { dir: f.grid, id: e.appid }, proton: e.proton, collections: e.collections });
      if (id !== (e.appid >>> 0)) {
        reg[id] = reg[e.appid]; delete reg[e.appid];
        // Steam stored its own copy of the artwork: drop ours, named after the old id
        for (const n of [`${e.appid}p.png`, `${e.appid}.png`, `${e.appid}_hero.png`, `${e.appid}_logo.png`, `${e.appid}_icon.png`]) { try { fs.rmSync(path.join(f.grid, n), { force: true }); } catch {} }
      }
      reg[id].live = true; // Steam may save its shortcuts file a while later: count it as in Steam now
      added++;
      saveReg();
    }
    for (const id of removeIds) await live.removeShortcut(id);
    log('steam live apply', added, 'added,', removeIds.length, 'removed');
    put({ state: 'done', added, removed: removeIds.length });
    return { added, removed: removeIds.length };
  }
  // Put back the shortcuts file from before the last change (Steam has to be closed for it)
  async function undo() {
    const env = environment();
    if (!env.account) throw new Error('Steam was not found.');
    const b = listBackups()[0];
    if (!b) throw new Error('No earlier version to go back to.');
    const restore = path.join(BACKUP_DIR, b);
    const keep = new Set(Object.values(parseVdf(fs.readFileSync(restore)).shortcuts || {}).map((e) => (e.appid ?? 0) >>> 0));
    for (const id of Object.keys(reg)) if (!keep.has(Number(id) >>> 0)) { gone[id] = reg[id]; delete reg[id]; }
    for (const id of Object.keys(gone)) if (keep.has(Number(id) >>> 0)) { reg[id] = gone[id]; delete gone[id]; }
    saveReg();
    runHelper('last', { id: 'undo', stamp: 'undo-' + Date.now(), restore, shortcutsFile: files(env.account).shortcuts, backupDir: BACKUP_DIR, logFile: path.join(USER_DATA, 'steam-apply.log'), restart: true, gamescope: !!ctx.isGamescope(), flatpakSteam: !!env.account.flatpak });
    return { started: true, steamWillRestart: steamRunning() };
  }
  // Every write goes through the helper (copied out of the AppImage, whose mount goes away
  // when Cartridge closes) running as plain Node from Cartridge's own binary
  function runHelper(name, job) {
    fs.mkdirSync(JOB_DIR, { recursive: true });
    const jobFile = path.join(JOB_DIR, name + '.json');
    fs.writeFileSync(jobFile, JSON.stringify(job, (k, v) => (typeof v === 'bigint' ? { __big: String(v) } : v)));
    try { fs.rmSync(path.join(JOB_DIR, name + '.status.json'), { force: true }); } catch {}
    const helper = path.join(JOB_DIR, 'steamHelper.js');
    fs.copyFileSync(path.join(__dirname, 'steamHelper.js'), helper);
    const bin = process.env.APPIMAGE || process.execPath;
    // The AppImage's launcher puts --no-sandbox in front of the arguments on systems without
    // user namespaces, which Node mode rejects. Passing it last stops that (the helper ignores it).
    const argv = [helper, jobFile, '--no-sandbox'];
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
    delete env.LD_PRELOAD;
    // Steam ends everything it started when it closes, Cartridge included. A user service
    // (systemd-run) lives outside Steam, so the helper can finish and start Steam again.
    if (!process.env.CARTRIDGE_NO_SYSTEMD_RUN && hasCmd('systemd-run')) {
      const pass = ['PATH', 'HOME', 'USER', 'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_CURRENT_DESKTOP', 'XDG_SESSION_TYPE', 'XAUTHORITY', 'APPIMAGE_EXTRACT_AND_RUN'].filter((k) => env[k]);
      // KillMode=process: Steam, if the helper starts it, must outlive the helper
      const args = ['--user', '--collect', '--quiet', '-p', 'KillMode=process', '--unit', 'cartridge-steam-' + Date.now(), '--setenv=ELECTRON_RUN_AS_NODE=1', ...pass.map((k) => `--setenv=${k}=${env[k]}`), bin, ...argv];
      try {
        execFileSync('systemd-run', args, { timeout: 8000, stdio: 'ignore' });
        log('steam helper started as a user service', name);
        // if it never reports in (a user service manager that can't run it), start it directly
        const statusFile = jobFile.replace(/\.json$/, '') + '.status.json';
        setTimeout(() => { if (!exists(statusFile)) { log('steam helper service silent, starting it directly'); spawn(bin, argv, { detached: true, stdio: 'ignore', env }).unref(); } }, 5000);
        return;
      } catch (e) { log('systemd-run failed, starting the helper directly', e.message); }
    }
    spawn(bin, argv, { detached: true, stdio: 'ignore', env }).unref();
  }
  function hasCmd(c) { return (process.env.PATH || '/usr/bin:/bin').split(':').some((d) => exists(path.join(d, c))); }
  // Put games back into collections Steam dropped
  function fixCollections() {
    const env = environment();
    if (!env.account) throw new Error('Steam was not found.');
    const miss = verifyCollections() || [];
    if (!miss.length) return { fixed: 0 };
    const collections = {};
    for (const m of miss) (collections[m.collection] ||= []).push(Number(m.appid) >>> 0);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    runHelper('last', { id: stamp, stamp, add: [], remove: [], collections, restart: true, gamescope: !!ctx.isGamescope(), flatpakSteam: !!env.account.flatpak, shortcutsFile: files(env.account).shortcuts, cloudFile: files(env.account).cloud, backupDir: BACKUP_DIR, logFile: path.join(USER_DATA, 'steam-apply.log') });
    return { fixed: miss.length, steamWillRestart: steamRunning() };
  }
  function removeAllOurs() { return queueRemove(Object.keys(reg).map(Number)); }
  async function restartSteam() {
    const env = environment();
    // in Game Mode Steam must restart itself (closing it from outside races Game Mode bringing it back)
    if (env.account && (await live.available(env.account.root))) { try { await live.restart(); log('steam restarted from its interface'); return true; } catch (e) { log('steam live restart failed', e.message); } }
    runHelper('restart', { id: 'restart', stamp: 'restart-' + Date.now(), onlyRestart: true, restart: true, gamescope: !!ctx.isGamescope(), flatpakSteam: !!env.account?.flatpak, backupDir: BACKUP_DIR, logFile: path.join(USER_DATA, 'steam-apply.log') });
    return true;
  }
  // After Steam restarts: were the collections kept? (Steam Cloud can replace the local file)
  function verifyCollections() {
    const env = environment();
    if (!env.account) return null;
    const cols = readCollections(env.account);
    const missing = [];
    for (const [appid, r] of Object.entries(reg)) {
      for (const c of r.collections || []) {
        const col = cols.find((x) => x.name === c);
        if (!col || !col.added.map((x) => x >>> 0).includes(Number(appid) >>> 0)) missing.push({ appid, name: r.name, collection: c });
      }
    }
    return missing;
  }
  // Test one console's launch setup: does the Target exist and run?
  // Shown once after Cartridge starts: how the last Steam change went, and any collections
  // Steam dropped (Steam Cloud can replace the local collections file)
  function startupReport() {
    const last = lastStatus();
    const c = cfg();
    let report = null;
    if (last && last.job && c.seenJob !== last.job + ':' + last.state && ['done', 'error'].includes(last.state)) {
      report = last;
      c.seenJob = last.job + ':' + last.state; ctx.saveConfig();
    }
    let missing = [];
    try { if (Object.keys(reg).length) missing = verifyCollections() || []; } catch {}
    return { last: report, missing };
  }
  function parseTemplate(t) {
    const toks = tokenize(t.lo);
    const ci = toks.findIndex((x) => x.val === '%command%');
    return { exe: unq(t.exe), start: unq(t.start), pre: ci >= 0 ? toks.slice(0, ci).map((x) => x.raw) : [], command: ci >= 0, args: (ci >= 0 ? toks.slice(ci + 1) : toks).map((x) => x.raw).join(' '), kind: /\{SERIAL\}/.test(t.lo) ? (key4(t) === 'ps4' ? 'titleid' : 'serial') : /eboot/i.test(t.lo) ? 'eboot' : 'path', from: 'Set by you' };
    function key4(x) { return /shadps4/i.test(x.exe) ? 'ps4' : 'ps3'; }
  }
  function test(key, given) {
    const t = given ? parseTemplate(given) : templateFor(key);
    if (!t || !t.exe) return { ok: false, error: 'No emulator set for this console' };
    if (t.exe === '/usr/bin/flatpak') { const id = (t.args.match(/run\s+(\S+)/) || [])[1]; return flatpakApps().includes(id) ? { ok: true, note: `Flatpak ${id} is installed` } : { ok: false, error: `Flatpak ${id} is not installed` }; }
    if (!exists(t.exe)) return { ok: false, error: `Target not found: ${t.exe}` };
    try { fs.accessSync(t.exe, fs.constants.X_OK); } catch { return { ok: false, error: `Target is not executable: ${t.exe}` }; }
    const bios = ctx.biosCheck?.(key);
    return { ok: true, note: bios || 'Target found' };
  }
  function setTemplate(key, t) {
    const c = cfg();
    c.templates ||= {};
    if (!t) delete c.templates[key];
    else c.templates[key] = parseTemplate(t);
    ctx.saveConfig();
    return templateFor(key);
  }
  function setMode(key, mode) { const c = cfg(); c.modes ||= {}; c.modes[key] = mode; ctx.saveConfig(); return true; }

  // after a download / delete (when the automatic options are on)
  function onDownloaded(romId) { if (cfg().autoAdd) { queueAdd([{ romId, collections: (cfg().lastCollections || {})[consoleOfRom(romId)] || [] }]); return true; } return false; }
  function onDeleted(romId) {
    if (!cfg().autoRemove) return false;
    const ids = Object.entries(reg).filter(([, r]) => r.romId === romId).map(([id]) => Number(id));
    if (ids.length) queueRemove(ids);
    return ids.length > 0;
  }
  function consoleOfRom(romId) { const r = ctx.romById(romId); return r ? keyOf(r.platform_slug, r.platform_fs_slug) : null; }

  writeScript();
  return {
    overview, preview, apply, undo, restartSteam, removeAllOurs, queueAdd, queueRemove, queueClear, queueInfo, test, setTemplate, setMode, verifyCollections,
    collections: () => { const env = environment(); return env.account ? readCollections(env.account) : []; },
    // live changes: is Steam's interface reachable, and turning on its local debugging port
    // pick the emulator new shortcuts use for a console (clears a hand-edited setup for it)
    setEmu: (key, id) => { const c = cfg(); c.emus ||= {}; if (id) c.emus[key] = id; else delete c.emus[key]; if (c.templates?.[key]) delete c.templates[key]; ctx.saveConfig(); return true; },
    // re-add this console's games Cartridge put in Steam, so they use the current emulator setup
    refresh: async (key) => {
      const t = templateFor(key), sig = sigOf(t, (cfg().modes || {})[key]);
      let games = overview().games.filter((g) => g.console === key && g.inSteam && g.ours && g.file && g.appid && (g.badLo || reg[g.appid]?.sig !== sig));
      // only "%command%" left in Launch options and the setup is current: clear it in place (keeps play time)
      const env = environment();
      const fixable = games.filter((g) => g.badLo && reg[g.appid]?.sig === sig);
      if (fixable.length && env.account && await live.available(env.account.root)) {
        const scs = readShortcuts(env.account);
        let fixed = 0;
        for (const g of fixable) { const sc = scs.find((x) => x.appid === g.appid); if (sc && (await live.settle(g.appid, sc.exeRaw, '')) === 'ok') { reg[g.appid].loFixed = Date.now(); fixed++; } }
        saveReg();
        games = games.filter((g) => !reg[g.appid]?.loFixed); // anything not fixed in place is re-added
        if (!games.length) return { count: fixed, fixed };
      }
      if (!games.length) return { count: 0 };
      queueAdd(games.map((g) => ({ romId: g.romId, collections: reg[g.appid]?.collections || [] })));
      queueRemove(games.map((g) => g.appid)); // after queueAdd, which drops pending removals of the same game
      return { count: games.length };
    },
    liveInfo: async () => { const env = environment(); if (!env.account) return { on: false, flag: false }; return { on: await live.available(env.account.root), flag: live.flagOn(env.account.root) }; },
    liveEnable: () => { const env = environment(); if (!env.account) throw new Error('Steam was not found.'); fs.writeFileSync(path.join(env.account.root, live.FLAG), ''); return true; },
    onDownloaded, onDeleted, lastStatus, writeScript, startupReport, forRom, fixCollections, played,
    // exposed for tests
    _learnOne: learnOne, _tokenize: tokenize, _buildLaunch: buildLaunch, _learnAll: learnAll, _candidates: candidates,
  };
};
