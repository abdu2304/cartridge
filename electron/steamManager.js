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
const CS = require('./cide').steam; // every ID rule Steam uses lives in CIDE (0.9.52), unchanged
const { parseVdf, shortcutId, steamRunning } = require('./steamArt');
const frameGen = require('./frameGen');
const SC = require('./steamCollections');
const ES = require('./emuStart');

const HOME = os.homedir();
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const ls = (p) => { try { return fs.readdirSync(p); } catch { return []; } };
const real = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const unq = (s) => String(s || '').trim().replace(/^"(.*)"$/, '$1');
const q = (s) => `"${s}"`;
// inside a running AppImage's temporary mount: gone once that app closes or the device restarts
const isTempMount = (p) => /^\/tmp\/\.mount_/.test(String(p || ''));

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
// the Steam account in use is Flatpak Steam's (set by environment(); 0.9.3 K, K2)
let FLATPAK_STEAM = false;
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
  FLATPAK_STEAM = !!accounts[0].flatpak;
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
    // Flatpak Steam shortcuts made by Cartridge (0.9.3 K): flatpak-spawn --host [--directory= --env=]
    // [wrappers] "exe" args. Read as the program on the system, so health and learning see it.
    let start = unq(e.StartDir || ''), host = false;
    if (/(^|\/)flatpak-spawn$/.test(exe)) {
      const lt = tokenize(lo);
      if (lt[0]?.val === '--host') {
        let i = 1;
        const pre = [];
        for (; i < lt.length && /^--/.test(lt[i].val); i++) { const m = /^--(directory|env)=(.*)$/.exec(lt[i].val); if (m?.[1] === 'directory') start = m[2]; else if (m) pre.push(m[2]); }
        while (i < lt.length - 1 && !/^\//.test(lt[i].val)) pre.push(lt[i++].raw);
        if (lt[i]) { exe = lt[i].val; lo = [...pre, ...(pre.length ? ['%command%'] : []), ...lt.slice(i + 1).map((t) => t.raw)].join(' '); host = true; }
      }
    }
    return { appid: (e.appid ?? 0) >>> 0, name: e.AppName || e.appname || '', exe, exeRaw, start, lo, loRaw: e.LaunchOptions || '', last: e.LastPlayTime || 0, host };
  });
}
// Steam's text VDF (localconfig.vdf): { key: value | { ... } }
function parseTextVdf(t) {
  const re = /"((?:[^"\\]|\\.)*)"|([{}])/g;
  const root = {}, stack = [root];
  let key = null, m;
  while ((m = re.exec(t))) {
    if (m[2] === '{') { const o = {}; stack[stack.length - 1][key ?? ''] = o; stack.push(o); key = null; }
    else if (m[2] === '}') { if (stack.length > 1) stack.pop(); key = null; }
    else if (key === null) key = m[1];
    else { stack[stack.length - 1][key] = m[1].replace(/\\(.)/g, '$1'); key = null; }
  }
  return root;
}
// Steam's own default compatibility tool (0.9.64, owner: "use Steam's Proton"): Settings → Compatibility → "Run other
// titles with", kept in config.vdf as CompatToolMapping "0" { "name" }. Empty when it was never set.
function steamDefaultProton(acc) {
  let t; try { t = fs.readFileSync(files(acc).config, 'utf8'); } catch { return ''; }
  const v = parseTextVdf(t), find = (o, k) => (o && typeof o === 'object' ? (Object.keys(o).find((x) => x.toLowerCase() === k.toLowerCase()) ?? null) : null);
  let o = v; for (const k of ['InstallConfigStore', 'Software', 'Valve', 'Steam', 'CompatToolMapping', '0']) { const key = find(o, k); if (key == null) return ''; o = o[key]; }
  return typeof o?.name === 'string' ? o.name : '';
}
// Play time Steam keeps per app, shortcuts included: appid -> { min, last (ms) }. Shortcuts show
// up under their 32-bit id, or as the long game id ((appid << 32) | 0x02000000) in some versions.
function readPlaytime(acc) {
  let t; try { t = fs.readFileSync(path.join(acc.root, 'userdata', acc.id, 'config', 'localconfig.vdf'), 'utf8'); } catch { return {}; }
  const v = parseTextVdf(t);
  const lower = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, x]) => [k.toLowerCase(), x]));
  const apps = lower(lower(lower(lower(lower(v).userlocalconfigstore).software).valve).steam).apps || {};
  const out = {};
  for (const [id, a] of Object.entries(apps)) {
    if (!a || typeof a !== 'object') continue;
    const min = Number(a.Playtime ?? a.playtime ?? 0), last = Number(a.LastPlayed ?? a.lastplayed ?? 0);
    if (!min && !last) continue;
    let key = id;
    if (id.length > 12) { try { key = String(Number(BigInt(id) >> 32n) >>> 0); } catch {} } // long game id
    else if (Number(id) < 0) key = String(Number(id) >>> 0);
    const prev = out[key];
    out[key] = { min: Math.max(prev?.min || 0, min), last: Math.max(prev?.last || 0, last * 1000) };
  }
  return out;
}
// Collections the user made (dynamic, filter-based ones can't hold chosen games)
// 0.9.32 (owner: a collection deleted in Steam still showed): Steam keeps its local changes, deletions too, in
// cloud-storage-namespace-1.modified.json until they reach its cloud; those entries win over the main file's
function cloudRows(file) {
  const rows = new Map();
  for (const f of [file, file.replace(/\.json$/, '.modified.json')]) {
    let arr; try { arr = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    const list = Array.isArray(arr) ? arr : Object.entries(arr || {});
    for (const [k, v] of list) if (k && v) rows.set(k, v);
  }
  return rows;
}
function readCollections(acc) {
  try {
    const out = [];
    for (const [k, v] of cloudRows(files(acc).cloud)) {
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
const FRAMEGEN = /(^|\/)\.?(mako-run|lsfg(-vk)?|lsfg-vk-.*|framegen)$/i;
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
  // Removed live: Steam drops the shortcut at once but saves shortcuts.vdf later, so until then the
  // file still lists it and the game kept showing "Remove from Steam" (A7). appid -> when removed.
  const LIVE_GONE_FILE = path.join(USER_DATA, 'steam-live-removed.json');
  const liveGone = (() => { try { return JSON.parse(fs.readFileSync(LIVE_GONE_FILE, 'utf8')); } catch { return {}; } })();
  const saveLiveGone = () => { try { fs.writeFileSync(LIVE_GONE_FILE, JSON.stringify(liveGone)); } catch {} };
  function shortcutsOf(acc) {
    const all = readShortcuts(acc);
    let changed = false;
    for (const id of Object.keys(liveGone)) if (!all.some((s) => s.appid === Number(id) >>> 0) || Date.now() - liveGone[id] > 7 * 864e5) { delete liveGone[id]; changed = true; }
    if (changed) saveLiveGone();
    return all.filter((s) => !liveGone[s.appid]);
  }
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
    gi = args.findIndex((t) => CS.isRpcs3Arg(t.val));
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
      gi = args.findIndex((t) => CS.isPs4Arg(t.val));
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
    const placeholder = kind === 'serial' || kind === 'titleid' ? CS.toPlaceholder(args[gi].raw) : args[gi].raw.replace(args[gi].val, zp + '{ROM}');
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
      if (!exists(l.template.exe) || isTempMount(l.template.exe)) continue; // the emulator moved or was removed: never copy a broken setup (Shortcut health lists these)
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
    flatpaks = require('./detect').flatpakApps(HOME); // from Flatpak's folders: `flatpak list` froze the app for seconds
    if (!flatpaks) try { flatpaks = execFileSync('flatpak', ['list', '--app', '--columns=application'], { encoding: 'utf8', timeout: 8000 }).split('\n').map((s) => s.trim()).filter(Boolean); } catch { flatpaks = []; }
    return flatpaks;
  }
  // ---------------------------------------------------------------- 0.9: emulators found anywhere (Setup)
  // The scan walks home (and /opt, /usr/local, other drives when asked) for AppImages and programs,
  // wherever they are and whatever they're called, and reads which emulator each one is. Kept in
  // emulators-found.json; a file is only looked at again when its size or date changes.
  const detect = require('./detect');
  const FOUND_FILE = path.join(USER_DATA, 'emulators-found.json');
  let found = (() => { try { return JSON.parse(fs.readFileSync(FOUND_FILE, 'utf8')); } catch { return null; } })();
  const mtime = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
  const scanned = (p) => found?.items.find((x) => x.path === p || real(x.path) === real(p)) || null;
  // copies of one emulator the scan found: sure ones, and ones you confirmed in Setup
  function foundFor(id) {
    const ok = cfg().confirmed || {};
    return (found?.items || []).filter((x) => (ok[x.path] ? ok[x.path] === id : x.id === id && x.conf >= 2) && exists(x.path));
  }
  // every emulator copy that could be updated (0.9.16): AppImages the scan is sure of, and Flatpaks
  function installedEmulators() {
    const out = [];
    for (const x of found?.items || []) if (x.kind === 'appimage' && x.id && x.conf >= 2 && exists(x.path) && !/\/\.mount_|cartridge/i.test(x.path)) out.push({ id: x.id, label: labelOf(x.id), kind: 'appimage', path: x.path, version: x.version || '' });
    // folder builds (0.9.21): the program with its data folder beside it, as Vita3K's zip (EmuDeck's
    // ~/Applications/Vita3K/Vita3K) unpacks; found by the scan, or in its own folder under ~/Applications
    const U = require('./emuUpdates'), seen = new Set(out.map((x) => x.path));
    // 0.9.58 (owner: Vita3K's sheet wouldn't open, only "already on this device"): EmuDeck keeps Vita3K's AppImage as
    // ~/Applications/Vita3K/Vita3K (no extension, in its own folder); an AppImage there is listed as one, not skipped
    const addFolder = (id, p, version = '') => { if (seen.has(p) || !exists(p)) return; const k = U.installKind(p); if (k === 'folder' || k === 'appimage') { seen.add(p); out.push({ id, label: labelOf(id), kind: k, path: p, version }); } };
    for (const x of found?.items || []) if (x.kind === 'program' && x.id && x.conf >= 2 && !/\/\.mount_|cartridge/i.test(x.path)) addFolder(x.id, x.path, x.version || '');
    for (const [id, e] of Object.entries(EMU)) for (const d of APP_DIRS()) for (const b of e.bin || []) addFolder(id, path.join(d, e.label || id, b));
    for (const [id, e] of Object.entries(EMU)) for (const n of e.dir || []) for (const d of APP_DIRS()) for (const b of e.bin || []) addFolder(id, path.join(d, n, b));
    const fps = flatpakApps();
    for (const [id, e] of Object.entries(EMU)) for (const fp of e.fp || []) if (fps.includes(fp)) out.push({ id, label: labelOf(id), kind: 'flatpak', fp });
    // Windows builds run through Proton (Xenia Canary's xenia_canary.exe, EmuDeck keeps it in roms/xbox360):
    // updatable from their own releases too (0.9.21)
    for (const [id, e] of Object.entries(EMU)) {
      if (!e.win) continue;
      const dirs = [...APP_DIRS(), ...ctx.emulationRoots().flatMap((r) => (e.for || []).map((k) => path.join(r, 'roms', k)))];
      const exe = dirs.flatMap((d) => [d, ...ls(d).map((n) => path.join(d, n)).filter(isDir)]).flatMap((d) => ls(d).filter((n) => e.win.test(n)).map((n) => path.join(d, n)))[0];
      if (exe) out.push({ id, label: `${labelOf(id)} (Windows)`, kind: 'windows', path: exe, version: '' });
    }
    return out;
  }
  // An EmuDeck launcher counts only while what it starts is there (0.9.32, owner: Vita3K deleted twice and
  // still "already on this device"): its script stays in tools/launchers after the program is gone.
  // EmuDeck's scripts name the folder (emufolder="$HOME/Applications/Vita3K") and the program (emuName,
  // an AppImage path) or run a Flatpak; a script Cartridge can't read is trusted as before.
  function scriptRuns(script, e) {
    let t = ''; try { t = fs.readFileSync(script, 'utf8'); } catch { return true; }
    const home = (x) => x.replace(/\$\{?HOME\}?|^~(?=\/)/g, HOME);
    if (/flatpak\s+run/.test(t)) { const fps = flatpakApps(); const ids = [...t.matchAll(/flatpak\s+run\s+(?:-\S+\s+)*([\w.-]+\.[\w.-]+)/g)].map((m) => m[1]); if (ids.length) return ids.some((x) => fps.includes(x)); }
    const folder = (/^\s*emufolder=["']?([^"'\n]+)["']?/m.exec(t) || [])[1], name = (/^\s*emuName=["']?([^"'\n]+)["']?/m.exec(t) || [])[1];
    const paths = [...t.matchAll(/["']?((?:\$\{?HOME\}?|~)\/[^"'\s]+\.AppImage)["']?/gi)].map((m) => home(m[1])).filter((x) => !x.includes('*') && !x.includes('$'));
    if (paths.length) return paths.some((x) => exists(x));
    if (folder && !folder.includes('$(')) {
      const dir = home(folder);
      if (!isDir(dir)) return false;
      const names = ls(dir), want = [name, e.label, ...(e.bin || [])].filter(Boolean).map((x) => x.toLowerCase());
      return names.some((n) => want.some((w) => n.toLowerCase().startsWith(w)) || (e.app && e.app.test(n)));
    }
    return true;
  }
  let scanning = null;
  function scanEmulators({ drives = false } = {}) {
    if (scanning) return scanning;
    scanning = (async () => {
      const prev = new Map((found?.items || []).map((x) => [x.path, x]));
      const c = ctx.getConfig();
      const skip = [c.romsRoot, ...steamRoots(), ...ctx.emulationRoots().flatMap((r) => ['roms', 'saves', 'storage', 'bios', 'tools/downloaded_media', 'ES-DE'].map((s) => path.join(r, s)))].filter(Boolean);
      const roots = [{ dir: HOME, home: HOME }, '/opt', '/usr/local/bin', '/usr/local/games', '/usr/local/share/games'];
      if (drives) for (const b of ['/run/media', '/media', '/mnt']) for (const n of ls(b)) { const d = path.join(b, n); roots.push(d); if (b !== '/mnt') for (const m of ls(d)) roots.push(path.join(d, m)); }
      const prog = (o) => ctx.broadcast('setup-progress', o);
      prog({ step: 'looking', dirs: 0 });
      const w = await detect.walk(roots, { skip, ms: drives ? 45000 : 25000, onProgress: (p) => prog({ step: 'looking', dirs: p.dirs, dir: p.dir.replace(HOME, '~') }) });
      const cands = [...w.found, ...detect.menuEntries(HOME).map((m) => ({ path: m.path, kind: 'menu', desktop: m.desktop }))];
      // reading inside each file happens off the main thread, so the screen never freezes
      prog({ step: 'reading', done: 0, total: cands.length });
      const items = await detect.identifyInWorker(cands, [...prev.values()], (d) => prog({ step: 'reading', done: d, total: cands.length }), log);
      found = { at: Date.now(), items, srm: detect.srmConfigs(HOME), dirs: w.dirs, stopped: w.stopped, ms: w.ms, drives };
      try { fs.writeFileSync(FOUND_FILE, JSON.stringify(found)); } catch {}
      flatpaks = null; extraBins = null;
      prog(null);
      return found;
    })().finally(() => { scanning = null; });
    return scanning;
  }
  // what emulators exist and how each starts: electron/emulators.js (only installed ones are offered)
  const { EMU, CORES, RA_FIRST, emulatorsFor, argsFor, coreName, DISC_FIRST, GAME_EXT, DIR_GAMES, forkOf, realName } = require('./emulators');
  let extraBins = null; // Snap, Nix, Homebrew, a login shell's PATH (looked up once)
  // kept only once the login shell has answered (it's asked in the background, never waited for)
  const binsNow = () => { const d = detect.extraBinDirs(HOME); if (detect.loginPathKnown()) extraBins = d; return d; };
  const BIN_DIRS = () => [...new Set([...(process.env.PATH || '').split(':'), '/usr/bin', '/usr/local/bin', '/usr/games', '/app/bin', path.join(HOME, '.local/bin'), '/var/lib/flatpak/exports/bin', ...(extraBins || binsNow())].filter((d) => d && d.startsWith('/') && !d.includes('/tmp/.mount_')))];
  const findBin = (names) => { for (const d of BIN_DIRS()) for (const n of names || []) { const f = path.join(d, n); if (exists(f) && !isDir(f)) return f; } return null; };
  const kindOf = (key) => (key === 'ps4' ? 'eboot' : key === 'wiiu' ? 'rpx' : 'path');
  // Every emulator for this console that is installed here: [{ id, label, t }]. Each copy is listed
  // (someone can have both the Flatpak and an AppImage); the first copy keeps the plain id.
  function candidates(key) {
    const L = launchersDirs(), out = [];
    // An EmuDeck launcher is often a wrapper: dolphin-emu.sh runs the Dolphin Flatpak, pcsx2-qt.sh the
    // AppImage in ~/Applications. Then that copy is the same install and is not listed again.
    const wraps = (script) => { let t = ''; try { t = fs.readFileSync(script, 'utf8'); } catch {} return { flatpak: /flatpak/i.test(t), appimage: /\.AppImage/i.test(t), text: t }; };
    const emuApps = [path.join(HOME, 'Applications'), path.join(real(HOME), 'Applications')];
    const forkMarks = cfg().forks || {}; // path -> { of, name }: copies you said are a fork (Setup)
    const forksOut = [];
    for (const id of emulatorsFor(key)) {
      const e = EMU[id], found = [];
      // name: what is really installed (a Citra install isn't "Azahar": 0.9.3)
      const mk = (exe, start, src, from, args, version, name) => found.push({ t: { exe, start, pre: e.pre || [], command: true, args: args || argsFor(id, key, src, version), kind: e.kind || kindOf(key), how: src, from }, src, name: name || e.label });
      let wrap = { flatpak: false, appimage: false, text: '' };
      for (const d of L) for (const sc of e.scripts || []) if (exists(path.join(d, sc)) && !found.length && scriptRuns(path.join(d, sc), e)) { mk(path.join(d, sc), d, 'emudeck', `EmuDeck ${e.label}`, null, null, realName(id, sc)); wrap = wraps(path.join(d, sc)); }
      // One AppImage: the newest copy, found by name in the usual folders or by what's inside it
      // anywhere (Setup's scan). A file whose insides say it's another emulator is skipped.
      const apps = [];
      if (e.app) for (const d of APP_DIRS()) {
        if (wrap.appimage && emuApps.includes(d)) continue;
        for (const n of ls(d)) if (e.app.test(n) && /\.appimage$/i.test(n)) { const s = scanned(path.join(d, n)); if (!s || !s.id || s.id === id || s.conf < 2) apps.push(path.join(d, n)); }
      }
      for (const x of foundFor(id)) if (x.kind === 'appimage' && !(wrap.appimage && (emuApps.includes(path.dirname(x.path)) || wrap.text.includes(path.basename(x.path))))) apps.push(x.path);
      for (const [p, f] of Object.entries(forkMarks)) if (f.of === id && exists(p) && (/\.appimage$/i.test(p) || detect.appImageType(p))) apps.push(p);
      const all = [...new Map(apps.map((p) => [real(p), p])).values()];
      const ver = (p) => scanned(p)?.version || (path.basename(p).match(/(\d+\.\d+(?:\.\d+)?)/) || [])[1];
      // forks (GR2, BB Launcher, PrimeHack…) are listed on their own and never picked by default
      // (0.9.3, C3/C4; GR2 was taken for shadPS4 itself: A8)
      const forkName = (p) => forkMarks[p]?.name || forkOf(id, path.basename(p) + ' ' + (scanned(p)?.name || ''));
      // shadPS4's Qt launcher keeps emulator cores in its versions folder: those are the launcher's to
      // start, never a shortcut's Target (0.9.3 L+: Setup's scan found them and they won over the launcher)
      const managed = (p) => /shadPS4QtLauncher[\\/]+versions[\\/]|[\\/]launcher[\\/]+versions[\\/]/i.test(p);
      const uniq = all.filter((p) => !forkName(p) && !managed(p));
      for (const p of all.filter(forkName)) forksOut.push({ id: `${id}@fork:${path.basename(p)}`.slice(0, 120), label: `${forkName(p)} · fork of ${e.label}`, fork: true, t: { exe: p, start: path.dirname(p), pre: e.pre || [], command: true, args: /qtlauncher/i.test(p) && e.qtArgs ? e.qtArgs : argsFor(id, key, 'appimage', ver(p)), kind: e.kind || kindOf(key), how: 'appimage', from: path.basename(p) } });
      // shadPS4: the Qt launcher AppImage whenever there is one (owner: Target is the launcher, "-d -g",
      // like shadPS4's own shortcuts); other emulators: the newest copy that isn't a launcher
      const newest = (l) => [...l].sort((a, b) => mtime(b) - mtime(a))[0];
      const hit = e.qtArgs ? newest(uniq.filter((p) => /qtlauncher/i.test(p))) || newest(uniq) : newest(uniq.filter((p) => !/qtlauncher/i.test(p))) || uniq[0];
      // its version (read from inside it by Setup, else the file name) picks arguments that changed over time
      if (hit) mk(hit, path.dirname(hit), 'appimage', path.basename(hit), /qtlauncher/i.test(hit) && e.qtArgs ? e.qtArgs : null, ver(hit), realName(id, path.basename(hit) + ' ' + (scanned(hit)?.name || '')));
      // a Windows build, started through Proton (Steam's compatibility tool): Xenia Canary (K1). EmuDeck
      // keeps it in roms/xbox360; its xenia.sh already runs it, so then it isn't listed twice.
      if (e.win && !new RegExp(e.win.source.replace(/^\^|\$$/g, ''), 'i').test(wrap.text)) {
        const dirs = [...APP_DIRS(), ...ctx.emulationRoots().flatMap((r) => (e.for || []).map((k) => path.join(r, 'roms', k)))];
        const exe = dirs.flatMap((d) => [d, ...ls(d).map((n) => path.join(d, n)).filter(isDir)]).flatMap((d) => ls(d).filter((n) => e.win.test(n)).map((n) => path.join(d, n)))[0];
        if (exe) mk(exe, path.dirname(exe), 'windows', path.basename(exe), null, null, `${e.label} (Windows)`);
      }
      const fp = (e.fp || []).find((x) => flatpakApps().includes(x));
      if (fp && !wrap.flatpak) mk('/usr/bin/flatpak', '/usr/bin', 'flatpak', fp, `run ${fp} ${argsFor(id, key, 'flatpak')}`, null, realName(id, fp));
      // folder builds in their own folder in ~/Applications (0.9.37: SharpEmu, KytyPS5)
      for (const n of e.dir || []) { const p = APP_DIRS().flatMap((d) => (e.bin || []).map((b) => path.join(d, n, b))).find(exists); if (p) { mk(p, path.dirname(p), 'folder', `${n}/${path.basename(p)}`, null, null, e.label); break; } }
      const bin = findBin(e.bin) || foundFor(id).find((x) => x.kind === 'program' || x.kind === 'unpacked' || x.kind === 'script')?.path;
      if (bin && !/flatpak\/exports/.test(bin)) mk(bin, path.dirname(bin), 'native', bin, null, null, realName(id, bin));
      const SRC = { emudeck: 'EmuDeck', appimage: 'AppImage', flatpak: 'Flatpak', native: 'Installed', windows: 'Windows build', folder: 'Folder' };
      // an emulator that is itself a fork (PrimeHack) is listed with the forks, never the default
      if (e.forkOf) { found.forEach((f, i) => forksOut.push({ id: i ? `${id}@${f.src}` : id, label: `${f.name} · fork of ${EMU[e.forkOf]?.label || e.forkOf}${found.length > 1 ? ' · ' + SRC[f.src] : ''}`, fork: true, t: f.t })); continue; }
      // 0.9.49 (owner: Vita3K doesn't open): a copy known not to start goes after one that does, so the default (the
      // plain id: Steam shortcuts, installs) is a copy that works. Unknown copies are checked in the background.
      if (ES.has(id) && found.length > 1) {
        const bad = (f) => { const p = f.src === 'emudeck' ? ES.scriptProgram(f.t.exe, HOME) : f.src === 'flatpak' ? null : f.t.exe; if (!p) return 0; const r = ES.cached(id, p); if (!r) { ES.check(id, p).catch(() => {}); return 0; } return r.ok ? 0 : 1; };
        found.sort((a, b) => bad(a) - bad(b));
      }
      found.forEach((f, i) => out.push({ id: i ? `${id}@${f.src}` : id, label: found.length > 1 ? `${f.name} · ${SRC[f.src]}` : f.name, t: f.t }));
    }
    // RetroDECK, for people who use it instead of EmuDeck (0.9.3, C5): it starts the game with the
    // emulator it has set for that console (RetroDECK's run_game: -s <system> <game>, ES-DE names).
    // Consoles whose games are folders are left out: RetroDECK reads a folder as "Game/Game".
    const retrodeck = !L.length && flatpakApps().includes('net.retrodeck.retrodeck') && !DIR_GAMES.has(key)
      ? [{ id: 'retrodeck', label: 'RetroDECK', t: { exe: '/usr/bin/flatpak', start: '/usr/bin', pre: [], command: true, args: `run net.retrodeck.retrodeck -s ${key} "{ROM}"`, kind: 'path', how: 'retrodeck', from: 'RetroDECK' } }] : [];
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
    const raApps = [...APP_DIRS().flatMap((d) => ls(d).filter((n) => /^retroarch.*\.appimage$/i.test(n)).map((n) => path.join(d, n))), ...foundFor('retroarch').filter((x) => x.kind === 'appimage').map((x) => x.path)];
    const raApp = [...new Map(raApps.map((p) => [real(p), p])).values()].sort((a, b) => mtime(b) - mtime(a))[0];
    if (raApp) sources.push({ src: 'AppImage', exe: raApp, start: path.dirname(raApp), pre: '', dirs: [raApp + '.home/.config/retroarch/cores', ...nativeCores], from: path.basename(raApp) });
    const raBin = findBin(['retroarch']) || foundFor('retroarch').find((x) => x.kind === 'program' || x.kind === 'unpacked')?.path;
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
    // Steam ROM Manager's saved setups aren't offered as a choice any more (0.9.3, C6): the
    // emulators they point at are found anyway. They still count in the setup report.
    // EmuDeck's own first, then RetroDECK, then the rest; forks last (C4, C5)
    return [...retrodeck, ...(RA_FIRST.has(key) ? [...ras, ...out] : [...out, ...ras]), ...forksOut];
  }
  // SRM parsers whose ROM folder (or title) is this console, with SRM's variables turned into ours
  function srmFor(key) {
    const out = [];
    for (const c of found?.srm || []) {
      const folder = path.basename(String(c.romDir).replace(/\/+$/, ''));
      const k = folder ? consoleKey(folderSlug(folder)) : null;
      if (k !== key) continue;
      let args = c.args.replace(/\$\{filePath\}/g, '{ROM}').replace(/\$\{fileDir\}/g, '{DIR}').replace(/\$\{fileName\}/g, '{NAME}');
      if (/\$\{/.test(args) || !/\{ROM\}|\{DIR\}|\{NAME\}/.test(args) || !exists(c.exe)) continue; // something we can't fill in
      out.push({ ...c, args });
    }
    return out;
  }
  function findTemplate(key) { return candidates(key)[0]?.t || null; }
  // ---------------------------------------------------------------- per-game details
  const pkgSeen = new Map();
  const hasPs3Pkg = (file) => { if (!file) return false; if (!pkgSeen.has(file)) { let n = 0; try { n = require('./pkgInstall').packagesIn(file).pkgs.length; } catch {} pkgSeen.set(file, n > 0); } return pkgSeen.get(file); };
  const isRpcs3 = (t) => /rpcs3/i.test(`${t?.exe || ''} ${t?.args || ''}`);
  // How Cartridge runs RPCS3 (or Vita3K) to install a package: the PS3 setup's own RPCS3 (EmuDeck's launcher,
  // the Flatpak, an AppImage or a program), with what goes before RPCS3's own options
  // (`run net.rpcs3.RPCS3` for the Flatpak). Null when no RPCS3 is set up.
  function emuCommand(key, re) {
    let t = templateFor(key);
    if (!re.test(`${t?.exe || ''} ${t?.args || ''}`)) t = candidates(key).find((c) => !c.fork && re.test(`${c.t.exe} ${c.t.args}`))?.t;
    if (!t) return null;
    const toks = tokenize(t.args || '').map((x) => x.val);
    const i = toks.findIndex((v) => /^-|\{|%/.test(v));
    return { exe: t.exe, args: i < 0 ? toks : toks.slice(0, i), from: t.from };
  }
  // Can Flatpak Steam start programs outside its sandbox? It needs --talk-name=org.freedesktop.Flatpak,
  // from its own metadata or a user/system override.
  function flatpakSteamAccess() {
    if (!environment().account?.flatpak) return null;
    const files = ['/var/lib/flatpak/app/com.valvesoftware.Steam/current/active/metadata', path.join(HOME, '.local/share/flatpak/app/com.valvesoftware.Steam/current/active/metadata'), '/var/lib/flatpak/overrides/com.valvesoftware.Steam', path.join(HOME, '.local/share/flatpak/overrides/com.valvesoftware.Steam')];
    return files.some((f) => /^\s*org\.freedesktop\.Flatpak\s*=\s*talk/m.test(readText(f) || '')) ? 'ok' : 'needed';
  }
  // every AppImage of an emulator that was found (PCSX2's patches.zip is read from inside it)
  const appImagesFor = (key, re) => [...new Set([...candidates(key).map((c) => c.t.exe), ...APP_DIRS().flatMap((d) => ls(d).map((n) => path.join(d, n)))].filter((f) => /\.appimage$/i.test(f) && re.test(path.basename(f)) && exists(f)))];
  const rpcs3Command = () => emuCommand('ps3', /rpcs3/i);
  // Installing into Vita3K needs Vita3K itself, never EmuDeck's vita3k.sh: that script always runs
  // "Vita3K -Fr <arguments>", so "--pkg ..." or a .vpk became the game to boot and nothing installed
  // (0.9.3 L). EmuDeck keeps the real program at <Applications>/Vita3K/Vita3K (an AppImage without
  // the extension; EmuDeck's emuDeckVita3K.sh).
  function vita3kCommand() {
    const works = (exe) => ES.cached('vita3k', exe)?.ok !== false; // 0.9.49: never a copy known not to start
    const direct = candidates('psvita').find((c) => !c.fork && /vita3k/i.test(c.t.exe) && c.t.how !== 'emudeck' && works(c.t.exe));
    if (direct) return { exe: direct.t.exe, args: [], from: direct.t.from };
    const own = [...new Set([HOME, real(HOME)])]
      .flatMap((h) => [path.join(h, 'Applications/Vita3K/Vita3K'), path.join(h, 'Applications/Vita3K/Vita3K.AppImage')]).find((p) => exists(p) && works(p));
    return own ? { exe: own, args: [], from: 'EmuDeck Vita3K' } : null;
  }
  function serialOf(rom, p) {
    const tag = String(rom.fs_name || '') + ' ' + String(rom.name || '') + ' ' + path.basename(p || '');
    const named = CS.nameSerial(tag); // "BLUS30443" or "BLUS-30443" in a name
    if (named) return named;
    // a folder game: PS3_GAME/PARAM.SFO holds the serial
    // (also one folder down: a download folder holding the game folder)
    const sfos = [path.join(p, 'PS3_GAME', 'PARAM.SFO'), path.join(p, 'PARAM.SFO'), path.join(p, 'sce_sys', 'param.sfo')];
    if (isDir(p)) for (const n of ls(p)) if (isDir(path.join(p, n))) sfos.push(path.join(p, n, 'PS3_GAME', 'PARAM.SFO'), path.join(p, n, 'sce_sys', 'param.sfo'));
    for (const f of sfos) {
      try { const s = CS.anySerial(fs.readFileSync(f).toString('latin1')); if (s) return s; } catch {}
    }
    // an ISO inside a folder
    if (isDir(p)) { const iso = ls(p).find((n) => /\.iso$/i.test(n)); if (iso) p = path.join(p, iso); }
    // a disc image: look for the serial near the start of the ISO (PS3_DISC.SFB / PARAM.SFO)
    try {
      const fd = fs.openSync(p, 'r'); const b = Buffer.alloc(1024 * 1024);
      fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd);
      const s = CS.ps3Disc(b.toString('latin1')); // NPUA, NPEB and the rest too (0.9.15)
      if (s) return s;
    } catch {}
    return null;
  }
  // Vita title ID (PCSE00000): from the name, else from the start of the .pkg/.vpk (its content ID)
  function vitaTitleId(rom, file) {
    const named = CS.vitaName(String(rom.fs_name || '') + ' ' + String(rom.name || '') + ' ' + path.basename(file || ''));
    if (named) return named;
    try {
      const f = isDir(file) ? path.join(file, ls(file).find((n) => /\.(pkg|vpk)$/i.test(n)) || '') : file;
      const fd = fs.openSync(f, 'r'); const b = Buffer.alloc(256 * 1024); fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd);
      const s = CS.vitaAny(b.toString('latin1')); if (s) return s;
    } catch {}
    return null;
  }
  // Vita3K keeps installed games in <pref>/ux0/app/<title ID>; the same folders the installer uses
  const vitaPrefsAll = () => require('./pkgInstall').vitaPrefs(HOME, ctx.emulationRoots());
  function vitaInstalled(id) { return vitaPrefsAll().some((p) => isDir(path.join(p, 'ux0/app', id))); }
  // games installed in Vita3K before Cartridge (or with no .pkg on this device): matched by the
  // title in their param.sfo, so they start by title ID like any other (0.9.16)
  function vitaByName(rom) {
    const want = nameKeyOf(rom.name), sfo = require('./patches').sfoAt;
    if (!want) return null;
    for (const p of vitaPrefsAll()) for (const id of ls(path.join(p, 'ux0/app'))) {
      if (!CS.isVitaId(id)) continue;
      const t = nameKeyOf(sfo(path.join(p, 'ux0/app', id, 'sce_sys', 'param.sfo')).TITLE);
      if (t && (t === want || t.replace(/ /g, '') === want.replace(/ /g, ''))) return id;
    }
    return null;
  }
  const nameKeyOf = (n) => String(n || '').toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/[™®©]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  function rpcs3Knows(serial) {
    for (const f of [path.join(HOME, '.config/rpcs3/games.yml'), path.join(HOME, '.var/app/net.rpcs3.RPCS3/config/rpcs3/games.yml')]) {
      try { if (new RegExp(`^${serial}\\s*:`, 'm').test(fs.readFileSync(f, 'utf8'))) return true; } catch {}
    }
    return false;
  }
  function ps4TitleId(dir) {
    for (const f of [path.join(dir, 'sce_sys', 'param.sfo')]) {
      try { const m = CS.ps4Any(fs.readFileSync(f).toString('latin1')); if (m) return m; } catch {}
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
    // a PS3 game Cartridge installed into RPCS3 from its .pkg (0.9.3 D): started by its serial, so
    // the path inside RPCS3's storage (which can be moved) never goes into the shortcut
    const inst = ctx.installRecord?.(rom.id);
    if (inst?.emu === 'rpcs3' && isRpcs3(t)) return t.kind === 'serial' ? { SERIAL: inst.serial } : { ROM: `%RPCS3_GAMEID%:${inst.serial}` };
    if (inst?.emu === 'vita3k' && t.kind === 'vitaid') return { SERIAL: inst.serial };
    // a PS3 game that came as .pkg starts only once installed in RPCS3 (game page: Install in RPCS3)
    if (!inst && isRpcs3(t) && hasPs3Pkg(file)) return { missing: 'Install it in RPCS3 first: open the game and press Install in RPCS3.' };
    if (t.kind === 'serial') {
      const serial = serialOf(rom, file);
      if (serial && rpcs3Knows(serial)) return { SERIAL: serial };
      // RPCS3 doesn't know this game yet: launch it by path instead
      const target = isDir(file) ? (findEboot(file) || file) : file;
      return { ROM: styled(target, t), fallback: 'path' };
    }
    if (t.kind === 'titleid') {
      const id = CS.ps4Name(String(rom.fs_name || '') + ' ' + path.basename(file) + ' ' + (rom.name || '')) || ps4TitleId(file);
      if (id) return { SERIAL: id };
      const e = findEboot(file);
      return { ROM: styled(e || file, t), fallback: 'path' };
    }
    if (t.kind === 'vitaid') { // installed in Vita3K? then by title ID; otherwise it can't start yet
      const id = vitaTitleId(rom, file);
      if (id && vitaInstalled(id)) return { SERIAL: id };
      const named = vitaByName(rom);
      if (named) return { SERIAL: named };
      const how = 'in Vita3K first (File → Install .pkg or .vpk), then add it to Steam.';
      return { missing: id ? `Install ${id} ${how}` : `Install this game ${how}` };
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
    if (isDir(file) && !DIR_GAMES.has(key)) {
      const m3u = M3U_EMU.test(`${t.exe} ${t.args} ${t.emu || ''}`) ? multiDisc(file, key) : null;
      if (m3u) return { ROM: styled(m3u, t) };
      const f = playableFile(file, key); if (f) return { ROM: styled(f, t) };
    }
    return { ROM: styled(file, t) };
  }
  // Multi-disc games (0.9.17): discs named "(Disc 1)", "Disc 2", "CD3"... with no playlist get one,
  // <folder>.m3u in the game's folder listing them in order (Cartridge's own file; never replaced),
  // so Steam starts disc 1 and the emulator can switch discs. Only emulators that read .m3u.
  const M3U_EMU = /duckstation|pcsx2|dolphin|retroarch|flycast|mednafen|kronos|yaba|\.so\b|-L\s/i;
  const DISC_EXT = { psx: ['cue', 'chd', 'ccd', 'iso', 'pbp'], ps2: ['chd', 'iso', 'cso', 'zso'], gc: ['rvz', 'iso', 'gcm', 'ciso', 'gcz'], wii: ['rvz', 'wbfs', 'iso'], saturn: ['cue', 'chd', 'ccd'], segacd: ['cue', 'chd'], dreamcast: ['gdi', 'chd', 'cdi'], pcfx: ['cue', 'chd'], tg16: ['cue', 'chd'], '3do': ['cue', 'chd', 'iso'] };
  const discNo = (n) => { const m = /[\s._(\[-](?:disc|disk|cd)[\s._-]*(\d{1,2})\b/i.exec(n); return m ? Number(m[1]) : 0; };
  function multiDisc(dir, key) {
    const own = ls(dir).find((n) => /\.m3u$/i.test(n));
    if (own) return path.join(dir, own);
    for (const e of DISC_EXT[key] || []) {
      const discs = ls(dir).filter((n) => path.extname(n).slice(1).toLowerCase() === e && discNo(n) && !isDir(path.join(dir, n)));
      const nums = new Set(discs.map(discNo));
      if (discs.length < 2 || nums.size !== discs.length) continue;
      discs.sort((a, b) => discNo(a) - discNo(b));
      const f = path.join(dir, `${path.basename(dir).replace(/[\\/]/g, '_')}.m3u`);
      try { fs.writeFileSync(f, discs.join('\n') + '\n', { flag: 'wx' }); } catch (err) { if (err.code !== 'EEXIST') return null; }
      return f;
    }
    return null;
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
    const size = (f) => { try { return fs.statSync(f).size; } catch { return 0; } }; // a broken link in the folder must not stop the whole plan
    return files.filter((f) => !junk.test(f)).sort((a, b) => size(b) - size(a))[0] || null;
  }

  // ---------------------------------------------------------------- templates for every console
  let learned = {}, learnedAt = 0;
  function refreshLearned() {
    const env = environment();
    if (!env.account) { learned = {}; return env; }
    try { learned = learnAll(shortcutsOf(env.account)); } catch (e) { log('steam learn failed', e.message); learned = {}; }
    learnedAt = Date.now();
    return env;
  }
  function templateFor(key) {
    const own = cfg().templates?.[key];
    if (own && own.exe) return { ...own, how: 'yours' };
    if (Date.now() - learnedAt > 60000) refreshLearned();
    // an emulator picked on the console page
    const pick = (cfg().emus || {})[key];
    if (pick === 'learned' && learned[key]) return { ...learned[key], emu: 'learned' };
    if (pick && pick !== 'learned') { const c = candidates(key).find((x) => x.id === pick); if (c) return { ...c.t, emu: c.id }; }
    // the standard emulator for the console; a setup copied from your own Steam shortcuts is a second
    // choice (0.9.3, C5), used by default only when nothing else is installed
    const c = candidates(key).find((x) => !x.fork);
    if (c) return { ...c.t, emu: c.id };
    return learned[key] ? { ...learned[key], emu: 'learned' } : null;
  }
  // A game can use another emulator than its console (picked on the game page): cfg().gameEmus[romId]
  function templateForGame(romId, key) { return withFg(withShadVersion(baseTemplateForGame(romId, key), romId, key), romId, key); }
  // shadPS4 version per game (0.9.17, owner: some games need 0.17, some 0.18): the Qt launcher keeps
  // its versions in <XDG_DATA_HOME or ~/.local/share>/shadPS4QtLauncher/versions.json ([{ name, path,
  // codename, date, type }]) and takes -e <name|path> (its main.cpp) where -d means the default one
  function shadVersions() {
    const dir = path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share'), 'shadPS4QtLauncher');
    let list = []; try { list = JSON.parse(fs.readFileSync(path.join(dir, 'versions.json'), 'utf8')); } catch {}
    return (Array.isArray(list) ? list : []).filter((v) => v && v.path && exists(v.path)).map((v) => ({ name: String(v.name || path.basename(v.path)), path: v.path, codename: v.codename || '', date: v.date || '' }));
  }
  function withShadVersion(t, romId, key) {
    const want = (cfg().shadVersions || {})[romId];
    if (!t || key !== 'ps4' || !want || !/qtlauncher/i.test(t.exe || '') || !exists(want)) return t;
    const args = /(^|\s)-d(?=\s)/.test(t.args) ? t.args.replace(/(^|\s)-d(?=\s)/, `$1-e ${q(want)}`) : /(^|\s)-e\s+("[^"]*"|\S+)/.test(t.args) ? t.args.replace(/(^|\s)-e\s+("[^"]*"|\S+)/, `$1-e ${q(want)}`) : `-e ${q(want)} ${t.args}`;
    return { ...t, args, shadVersion: want };
  }
  function baseTemplateForGame(romId, key) {
    const own = (cfg().gameTemplates || {})[romId];
    if (own && own.exe) return { ...own, how: 'yours', perGame: true };
    const pick = (cfg().gameEmus || {})[romId];
    if (pick) { const c = candidates(key).find((x) => x.id === pick); if (c) return { ...c.t, emu: c.id, perGame: true }; }
    return templateFor(key);
  }
  // frame generation (0.9.17): the wrapper picked for this game, kept on the template as fg
  function withFg(t, romId, key) {
    if (!t || /\.exe$/i.test(t.exe || '')) return t;
    const w = frameGen.wrapperFor(cfg().frameGen, romId, key, frameGen.detect());
    return w ? { ...t, fg: w } : t;
  }
  // shadPS4 (owner's finding, A10): its own Steam shortcuts always start; Cartridge's, with the same
  // Target and Launch options, often showed a black screen and closed. The one difference is Start in.
  // The Qt launcher writes StartDir = QFileInfo(QCoreApplication::applicationFilePath()).absolutePath()
  // (qtlauncher create_steam_shortcut.cpp), which for an AppImage is its temporary mount
  // (/tmp/.mount_XXXX/usr/bin). That folder is gone as soon as the launcher closes, so every launch from
  // Steam starts with a Start in that doesn't exist, and Steam starts the program without entering it.
  // Cartridge does exactly the same (0.9.3 L): a mount-style folder that never exists. A portable install
  // (a "user" folder next to the AppImage is its only shadPS4 data) keeps starting there.
  const SHAD_START = '/tmp/.mount_shadPS4/usr/bin';
  // StartDir as written to Steam: quoted, except shadPS4's, which shadPS4 itself writes unquoted
  const startField = (s) => (s === SHAD_START ? s : q(s));
  function startOf(t) {
    if (!t || !/shadps4/i.test(t.exe || '') || !t.start || !/\.appimage$/i.test(t.exe)) return t?.start;
    const data = process.env.XDG_DATA_HOME || path.join(HOME, '.local/share');
    const portable = exists(path.join(t.start, 'user'));
    if (portable && !isDir(path.join(data, 'shadPS4')) && !isDir(path.join(HOME, '.local/share/shadPS4'))) return t.start;
    return SHAD_START;
  }
  // what a shortcut was made with, to spot ones made before the console's setup changed
  // v2: arguments written into Target like Steam ROM Manager (0.7.11)
  // v3: the emulator in Target, its arguments in Launch options again (0.8.2)
  // (shadPS4 also by its start folder, so shortcuts made in the wrong one show Update: 0.9.3; on
  // Flatpak Steam also 'host', so ones made before flatpak-spawn show Update: 0.9.3 K)
  const sigOf = (t, mode) => (t ? ['v3', mode || 'direct', t.exe, (t.pre || []).join(' '), t.args, ...(/shadps4/i.test(t.exe || '') ? [startOf(t)] : []), ...(FLATPAK_STEAM ? ['host'] : []), ...(t.fg ? ['fg:' + t.fg] : [])].join('|') : '');
  // Target is the emulator alone; Launch options hold its arguments and the game. Steam adds Launch
  // options after Target for shortcuts, so no "%command%" in front (a lone or leading %command% kept
  // games from starting). Only when something must run first (vblank_mode=0, an env var) is it
  // "<that> %command% <arguments>".
  // Flatpak Steam (0.9.3 K, K2): shortcuts run inside Steam's sandbox, where the emulators (and
  // flatpak itself) can't be started. flatpak-spawn --host (inside every Flatpak) starts them on the
  // system instead: their folder with --directory, environment variables with --env, wrappers
  // (gamemoderun, mangohud) in front. Steam's Flatpak needs to be allowed to talk to Flatpak for it
  // (flatpakSteamAccess, offered in Settings → Emulators → Issues).
  const HOST_SPAWN = '/usr/bin/flatpak-spawn';
  const hostLaunch = (exe, args, start, pre = []) => ({ target: q(HOST_SPAWN), launch: ['--host', start && start !== SHAD_START ? `--directory=${q(start)}` : '', ...pre.filter((x) => /^\w+=/.test(x)).map((x) => `--env=${x}`), ...pre.filter((x) => !/^\w+=/.test(x) && x !== '%command%'), q(exe), args].filter(Boolean).join(' ') });
  // A frame generation wrapper (t.fg) goes first, after environment variables, then the one %command%
  const launchFor = (t, lo, args) => {
    if (FLATPAK_STEAM && !/\.exe$/i.test(t.exe)) return hostLaunch(t.exe, args, startOf(t), [...(t.pre || []), ...(t.fg ? [q(t.fg)] : [])]);
    if (t.fg) return { target: q(t.exe), launch: [...(t.pre || []).filter((x) => x !== '%command%'), q(t.fg), '%command%', args].filter(Boolean).join(' ') };
    return { target: q(t.exe), launch: (t.pre || []).length ? lo : args };
  };
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
    let s = CS.plainSerial(String(g.rom.fs_name + ' ' + (g.file ? path.basename(g.file) : '')));
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
      const serial = CS.launchSerial(sc.lo);
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
    const scs = env.account ? shortcutsOf(env.account) : [];
    const find = inSteamIndex(scs);
    const tFor = {};
    const games = installedGames().map((g) => {
      const sc = find(g) || liveHit(g);
      const ours = sc && reg[sc.appid];
      const queued = queue.add.some((a) => a.romId === g.rom.id) ? 'add' : sc && queue.remove.includes(sc.appid) ? 'remove' : null;
      // a game that can't be added yet (Vita: not installed in Vita3K) says why
      const t = sc || !g.file ? null : ((cfg().gameEmus || {})[g.rom.id] || (cfg().gameTemplates || {})[g.rom.id]) ? templateForGame(g.rom.id, g.key) : (tFor[g.key] !== undefined ? tFor[g.key] : (tFor[g.key] = templateFor(g.key)));
      const blocked = t && (t.kind === 'vitaid' || isRpcs3(t)) ? gameRef(g.rom, g.file, t).missing || null : null;
      // ours with arguments in Target but "%command%" in Launch options (Steam's own default): won't start
      const badLo = !!(ours && !ours.inPlace && sc.exeRaw && tokenize(sc.exeRaw).length > 1 && ours.mode !== 'script'); // arguments in Target (0.7.11 to 0.8.1): Update moves them back
      return { romId: g.rom.id, name: g.rom.name, console: g.key, platform: g.platform.display_name, inSteam: !!sc, ours: !!ours, appid: sc?.appid || null, queued, file: g.file, blocked, badLo };
    });
    const keys = [...new Set(games.map((g) => g.console))];
    const consoles = keys.map((k) => {
      const t = templateFor(k);
      const ps = games.filter((g) => g.console === k);
      return { key: k, label: SHORT[k] || ps[0]?.platform || k, platform: ps[0]?.platform || k, games: ps.length, inSteam: ps.filter((g) => g.inSteam).length, template: t ? { exe: t.exe, start: startOf(t), lo: [...(t.pre || []), ...(t.command ? ['%command%'] : []), t.args].join(' '), how: t.how, from: t.from, kind: t.kind,
        // exactly what goes in Steam (see plan): arguments in Target unless something wraps the command
        ...launchFor(t, [...(t.pre || []), ...(t.command ? ['%command%'] : []), t.args].join(' '), t.args) } : null, mode: (cfg().modes || {})[k] || 'direct',
        // installed emulators to pick from, and which one new shortcuts use
        emus: az([...(learned[k] ? [{ id: 'learned', label: 'From your Steam shortcuts', sub: learned[k].from }] : []), ...candidates(k).map((c) => ({ id: c.id, label: c.label, sub: c.t.from, fork: !!c.fork }))]),
        emu: t?.how === 'yours' ? 'yours' : t?.emu || null,
        own: ps.filter((g) => g.inSteam && !g.ours && g.appid && g.file).length, // added some other way: Take over offers them (C7)
        outdated: t ? ps.filter((g) => g.inSteam && g.ours && (g.badLo || reg[g.appid]?.sig !== sigOf(templateForGame(g.romId, k), (cfg().modes || {})[k]))).length : 0 };
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
    const find = inSteamIndex(shortcutsOf(env.account));
    const out = {};
    for (const g of installedGames()) { const sc = find(g); if (sc?.last) out[g.rom.id] = sc.last * 1000; }
    return out;
  }

  // Play time and last played for downloaded games that are in Steam: romId -> { min, last }
  function playtime() {
    const env = environment();
    if (!env.account) return {};
    const scs = shortcutsOf(env.account);
    const find = inSteamIndex(scs);
    const pt = readPlaytime(env.account);
    const out = {};
    for (const g of installedGames()) {
      const sc = find(g) || liveHit(g);
      if (!sc) continue;
      const p = pt[String(sc.appid >>> 0)] || {};
      const last = Math.max(p.last || 0, (sc.last || 0) * 1000);
      if (p.min || last) out[g.rom.id] = { min: p.min || 0, last, src: 'Steam' };
    }
    return out;
  }
  // One game: is it in Steam, and would Cartridge know how to add it?
  // a game already in Steam into collections (game page → More → Steam, 0.9.16). Needs Steam's
  // instant changes, which edit collections the way Steam's own library does.
  async function addRomToCollections(romId, names) {
    const f = forRom(romId), env = environment();
    if (!f.inSteam || !f.appid) throw new Error('Add the game to Steam first.');
    if (!env.account || !(await live.available(env.account.root))) throw new Error('Collections can be changed while Steam runs once instant Steam changes are on (Settings → Steam).');
    await live.addToCollections(f.appid, names);
    const c = cfg(); c.lastCollections ||= {}; c.lastCollections[f.console] = names; ctx.saveConfig();
    return true;
  }
  function forRom(romId) {
    const env = environment();
    const g = installedGames().find((x) => x.rom.id === romId);
    const out = { steam: !!env.account, installed: !!g, console: g?.key || consoleOfRom(romId), needsFolder: !!g && !g.file, inSteam: false, ours: false, appid: null, queued: null };
    if (!env.account || !g) return out;
    const sc = inSteamIndex(shortcutsOf(env.account))(g) || liveHit(g);
    out.inSteam = !!sc; out.ours = !!(sc && reg[sc.appid]); out.appid = sc?.appid || null;
    out.queued = queue.add.some((a) => a.romId === romId) ? 'add' : sc && queue.remove.includes(sc.appid) ? 'remove' : null;
    out.lastCollections = (cfg().lastCollections || {})[out.console] || null;
    return out;
  }
  // ---------------------------------------------------------------- queue
  // Ready to play (0.9.21, owner: start the Steam shortcut Cartridge made, straight from Cartridge):
  // Steam's own way when its live connection is on, else steam://rungameid (a shortcut's 64-bit game id)
  async function play(romId) {
    const f = forRom(romId);
    if (!f.inSteam || !f.appid) throw new Error('Add it to Steam first (More → Steam).');
    const gameId = ((BigInt(f.appid >>> 0) << 32n) | 0x02000000n).toString(), env = environment();
    if (env.account && (await live.available(env.account.root).catch(() => false))) { try { await live.runGame(gameId); return { via: 'steam' }; } catch (e) { log('live run failed', e.message); } }
    const e2 = { ...process.env }; for (const k of ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'APPDIR', 'APPIMAGE']) delete e2[k];
    const url = `steam://rungameid/${gameId}`;
    const { spawn } = require('child_process');
    const tryRun = (cmd, args) => new Promise((ok) => { try { const p = spawn(cmd, args, { detached: true, stdio: 'ignore', env: e2 }); p.on('error', () => ok(false)); p.on('spawn', () => { p.unref(); ok(true); }); } catch { ok(false); } });
    if (await tryRun('xdg-open', [url])) return { via: 'url' };
    if (await tryRun('steam', [url])) return { via: 'url' };
    if (await tryRun('flatpak', ['run', 'com.valvesoftware.Steam', url])) return { via: 'url' };
    throw new Error('Steam couldn’t be asked to start it.');
  }
  // Steam back to its running app after a game (0.9.34, main.js steamFront); only with Steam's interface reachable
  async function frontRunning(appid) {
    const env = environment();
    if (!env.account || !(await live.available(env.account.root).catch(() => false))) return { skipped: 'steam interface not reachable' };
    return live.frontRunning(appid);
  }
  function queueInfo() { return { add: queue.add.length, remove: queue.remove.length, total: queue.add.length + queue.remove.length }; }
  function queueAdd(items) { // [{ romId, collections? }] or [{ recomp: {...} }] (0.9.65)
    const keyOf = (x) => (x.recomp ? 'r:' + x.recomp.id : x.romId);
    for (const it of items) {
      queue.remove = queue.remove.filter((a) => (it.recomp ? reg[a]?.recomp !== it.recomp.id : !reg[a]?.recomp && reg[a]?.romId !== it.romId));
      const i = queue.add.findIndex((a) => keyOf(a) === keyOf(it));
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
    const scs = shortcutsOf(env.account);
    const names = new Set(scs.map((s) => s.name.toLowerCase()));
    const byRom = new Map(installedGames().map((g) => [g.rom.id, g]));
    const entries = [], skipped = [];
    const nameCount = {};
    for (const a of queue.add) { const g = byRom.get(a.romId); if (g) nameCount[g.rom.name.toLowerCase()] = (nameCount[g.rom.name.toLowerCase()] || 0) + 1; }
    for (const a of queue.add) {
      // a recomp (0.9.65): its own program, never an emulator; its own shortcut beside the emulated game's, only in
      // the Recomps collection (owner: "two shortcuts, kept separate")
      if (a.recomp) {
        const r = a.recomp;
        if (!exists(r.exe)) { skipped.push({ name: r.name, why: 'The recomp isn’t installed any more.' }); continue; }
        const win = /\.exe$/i.test(r.exe);
        let target = q(r.exe), launch = r.args || '';
        if (FLATPAK_STEAM && !win) ({ target, launch } = hostLaunch(r.exe, launch, r.start));
        const appid = shortcutId(target, r.name);
        entries.push({ recomp: r.id, romId: null, artRomId: r.artRomId || null, game: r.game || r.name, console: 'recomp', sig: ['recomp', r.exe, launch].join('|'), name: r.name, exe: r.exe, target, start: r.start || path.dirname(r.exe), lo: launch, directLo: launch, directExe: r.exe, directStart: r.start, appid, how: 'recomp', from: r.name, fallback: null, emu: null,
          proton: win ? (cfg().proton || steamDefaultProton(env.account) || 'proton_experimental') : null, collections: ['Recomps'] });
        continue;
      }
      const g = byRom.get(a.romId);
      if (!g) { skipped.push({ romId: a.romId, why: 'not on this device any more' }); continue; }
      if (!g.file) { skipped.push({ romId: a.romId, name: g.rom.name, why: 'Cartridge does not know where this game\'s folder is. Open the game and use Add to Steam to pick it.' }); continue; }
      const t = a.template ? withFg(a.template, g.rom.id, g.key) : templateForGame(g.rom.id, g.key);
      if (!t) { skipped.push({ romId: a.romId, name: g.rom.name, why: `No emulator found for ${SHORT[g.key] || g.platform.display_name}. Set one in Settings → Steam → Emulators.` }); continue; }
      const mode = (cfg().modes || {})[g.key] || 'direct';
      let name = g.rom.name.replace(/\s+/g, ' ').trim();
      const always = cfg().consoleInName === 'always';
      if (always || nameCount[name.toLowerCase()] > 1 || (names.has(name.toLowerCase()) && !find(scs, g))) name = `${name} (${SHORT[g.key] || g.platform.display_name})`;
      const { lo, args, fallback, missing } = buildLaunch(g.rom, g.file, t);
      if (missing) { skipped.push({ romId: a.romId, name: g.rom.name, why: missing }); continue; }
      let exe = t.exe, start = startOf(t), { target, launch } = launchFor(t, lo, args);
      if (mode === 'script') { exe = scriptPath(); start = path.dirname(scriptPath()); launch = String(g.rom.id); target = q(exe); if (FLATPAK_STEAM) ({ target, launch } = hostLaunch(exe, launch, start)); }
      const appid = shortcutId(target, name);
      entries.push({
        romId: g.rom.id, console: g.key, sig: sigOf(t, mode), name, exe, target, start, lo: launch, directLo: lo, directExe: t.exe, directStart: startOf(t), appid, how: t.how, from: t.from, fallback, emu: t.emu || null,
        proton: /\.exe$/i.test(t.exe) ? (cfg().proton || steamDefaultProton(env.account) || 'proton_experimental') : null, // yours, else Steam's own default (0.9.64)
        // 0.9: console collections on: also the Steam collection named after its console. Only
        // Steam's own collections: Cartridge (RomM) collections are never copied into Steam.
        collections: [...new Set([...(a.collections || []), ...(cfg().consoleCollections ? [colName(g)] : [])])],
      });
    }
    const removing = queue.remove.map((id) => ({ appid: id, name: reg[id]?.name || scs.find((s) => s.appid === id)?.name || String(id) }));
    return { account: env.account, entries, skipped, removing };
    function find(list, g) { return inSteamIndex(list)(g); }
  }
  function preview() {
    const p = plan();
    return { account: p.account.name, entries: p.entries.map((e) => ({ romId: e.romId, name: e.name, target: e.target, start: startField(e.start), lo: e.lo, how: e.how, from: e.from, fallback: e.fallback, collections: e.collections, proton: e.proton })), skipped: p.skipped, removing: p.removing };
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
      const t = g && templateForGame(g.rom.id, g.key);
      if (!g || !t) { lines.push(`  ${r.romId}) ${ai ? `exec ${sh(ai)} --game ${r.romId}` : 'exit 1'} ;;`); continue; }
      const { lo } = buildLaunch(g.rom, g.file, t);
      const cmd = lo.replace('%command%', sh(t.exe));
      lines.push(`  ${r.romId}) [ -e ${sh(g.file)} ] || ${ai ? `exec ${sh(ai)} --game ${r.romId}` : 'exit 1'}; cd ${sh(startOf(t))}; ${t.command ? cmd : `${sh(t.exe)} ${cmd}`}; exit $? ;;`);
    }
    lines.push(`  *) ${ai ? `exec ${sh(ai)} --game "$1"` : 'exit 1'} ;;`, 'esac', '');
    try { fs.writeFileSync(scriptPath(), lines.join('\n'), { mode: 0o755 }); } catch (e) { log('play.sh write failed', e.message); }
  }

  // ---------------------------------------------------------------- artwork
  // style: undefined = Cartridge's artwork (yours, RomM's), 'top' = SteamGridDB's most popular,
  // or one of SteamGridDB's styles (alternate, blurred, no_logo, material)
  async function writeArt(e, grid, style) {
    fs.mkdirSync(grid, { recursive: true });
    // a recomp (0.9.65): the game's own art when it's in the library, else SteamGridDB by the game's name
    const rom = ctx.romById(e.romId ?? e.artRomId) || (e.recomp ? { name: e.game || e.name } : null);
    const out = {};
    const put = async (name, getter) => {
      const f = path.join(grid, name);
      try { const buf = await getter(); if (buf) { fs.writeFileSync(f, buf); out[name] = true; } } catch (err) { log('steam art', name, err.message); }
    };
    const art = (e.romId ?? e.artRomId) != null ? ctx.artFor(e.romId ?? e.artRomId) || {} : {};
    const sg = style ? (style === 'top' ? undefined : style) : undefined;
    const cover = art.grid || rom?.path_cover_large || rom?.path_cover_small || rom?.url_cover;
    const hero = art.hero || rom?.shot || null;
    const fromSgdb = async (kind, fallback) => (await ctx.sgdbImage(rom?.name, kind, sg).catch(() => null)) || (fallback ? ctx.fetchImage(fallback) : null);
    await put(`${e.appid}p.png`, async () => (style ? fromSgdb('grid', cover) : cover ? ctx.fetchImage(cover) : ctx.sgdbImage(rom?.name, 'grid')));
    // Cartridge's own art first (0.9.16): yours, then the sharp background Cartridge shows, then RomM's
    const sharp = !style && !art.hero ? await ctx.sharpHeroPng?.(rom).catch(() => null) : null;
    await put(`${e.appid}_hero.png`, async () => (style ? fromSgdb('hero', hero) : art.hero ? ctx.fetchImage(art.hero) : sharp || (hero ? ctx.fetchImage(hero) : ctx.sgdbImage(rom?.name, 'hero'))));
    await put(`${e.appid}.png`, async () => { // wide banner: SteamGridDB's, else cut from the background
      const w = await ctx.sgdbImage(rom?.name, 'wide', sg).catch(() => null);
      if (w) return w;
      const src = sharp || (hero ? await ctx.fetchImage(hero) : null);
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

  // Refresh the artwork of every shortcut Cartridge added: new files in Steam's grid folder, and
  // straight into the running Steam when it can be reached (else Steam shows them after a restart)
  async function refreshArt(style) {
    const env = environment();
    if (!env.account) throw new Error('Steam was not found on this device.');
    if (style && !ctx.getConfig().sgdbKey) throw new Error('Add a SteamGridDB API key in Settings → Look & feel first.');
    const have = new Set(shortcutsOf(env.account).map((x) => x.appid >>> 0));
    const ours = Object.entries(reg).filter(([id, r]) => (r.romId || r.recomp) && (have.has(Number(id) >>> 0) || r.live));
    if (!ours.length) return { count: 0 };
    const grid = files(env.account).grid;
    const liveOn = await live.available(env.account.root).catch(() => false);
    let n = 0;
    for (const [id, r] of ours) {
      const appid = Number(id) >>> 0;
      ctx.broadcast('steam-progress', { step: 'art', done: n, total: ours.length, name: r.name });
      await writeArt({ appid, romId: r.romId, recomp: r.recomp, artRomId: r.artRomId, game: r.game, name: r.name }, grid, style);
      if (liveOn) await live.setArtwork(appid, { dir: grid, id: appid }).catch((e) => log('steam live art refresh', e.message));
      n++;
    }
    ctx.broadcast('steam-progress', null);
    return { count: n, live: liveOn };
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
      entry: { appid: e.appid >>> 0, AppName: e.name, Exe: e.target, StartDir: startField(e.start), icon: exists(path.join(f.grid, `${e.appid}_icon.png`)) ? path.join(f.grid, `${e.appid}_icon.png`) : '', ShortcutPath: '', LaunchOptions: e.lo, IsHidden: 0, AllowDesktopConfig: 1, AllowOverlay: 1, OpenVR: 0, Devkit: 0, DevkitGameID: '', DevkitOverrideAppID: 0, LastPlayTime: 0, FlatpakAppID: '', tags: {} },
    }));
    const removeIds = p.removing.map((r) => r.appid >>> 0);
    for (const id of removeIds) if (reg[id]) for (const n of [`${id}p.png`, `${id}.png`, `${id}_hero.png`, `${id}_logo.png`, `${id}_icon.png`]) { try { fs.rmSync(path.join(f.grid, n), { force: true }); } catch {} }
    // our registry first, so the launch script knows the games before Steam starts them
    for (const e of p.entries) reg[e.appid] = e.recomp
      ? { romId: null, recomp: e.recomp, artRomId: e.artRomId, game: e.game, name: e.name, console: 'recomp', exe: e.exe, sig: e.sig, mode: 'direct', at: Date.now(), account: p.account.id, collections: e.collections }
      : { romId: e.romId, name: e.name, console: e.console, exe: e.exe, emu: e.emu, emuExe: e.directExe, sig: e.sig, mode: (cfg().modes || {})[e.console] || 'direct', at: Date.now(), account: p.account.id, collections: e.collections };
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
      const id = await live.addShortcut({ name: e.name, exe: e.target, start: startField(e.start), lo: e.lo, art: { dir: f.grid, id: e.appid }, proton: e.proton, collections: e.collections });
      if (id !== (e.appid >>> 0)) {
        reg[id] = reg[e.appid]; delete reg[e.appid];
        // Steam stored its own copy of the artwork: drop ours, named after the old id
        for (const n of [`${e.appid}p.png`, `${e.appid}.png`, `${e.appid}_hero.png`, `${e.appid}_logo.png`, `${e.appid}_icon.png`]) { try { fs.rmSync(path.join(f.grid, n), { force: true }); } catch {} }
      }
      reg[id].live = true; // Steam may save its shortcuts file a while later: count it as in Steam now
      added++;
      saveReg();
    }
    for (const id of removeIds) { await live.removeShortcut(id); liveGone[id >>> 0] = Date.now(); }
    saveLiveGone();
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
  async function fixCollections() {
    const env = environment();
    if (!env.account) throw new Error('Steam was not found.');
    const miss = (await verifyCollections()) || [];
    if (!miss.length) return { fixed: 0 };
    const collections = {};
    for (const m of miss) (collections[m.collection] ||= []).push(Number(m.appid) >>> 0);
    for (const m of miss) if (reg[m.appid]) reg[m.appid].collections = [...new Set([...(reg[m.appid].collections || []), m.collection])];
    saveReg();
    // with Steam's interface reachable, straight in (no restart)
    if (await live.available(env.account.root).catch(() => false)) {
      let done = 0;
      for (const [name, ids] of Object.entries(collections)) for (const id of ids) if (await live.addToCollections(id, [name]).catch(() => false)) done++;
      return { fixed: done, live: true };
    }
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
  // Games missing from their Steam collections (Settings → Emulators → Issues). 0.9.36 (owner's photo: "129 games are
  // missing from PlayStation 4, ..., Nintendo DS - melonDS (Standalone)" with a Put Them Back that would make old
  // collections again): it no longer trusts what Cartridge remembers. Console collections are compared with what Steam
  // really holds, for every game of the console in Steam, and only with console collections on (the same rule as
  // filling them); any other collection only while it's still in Steam. Old names (yours, Steam ROM Manager's) are left.
  // 0.9.44 (owner: "72 games aren't in their Steam collection" while they were): live first, as fill and fix do. Games
  // put in a collection live are in Steam's memory long before its collections file is written, so the file alone
  // reported them missing
  async function verifyCollections() {
    const env = environment();
    if (!env.account) return null;
    const { list: cols } = await colsNow(env);
    const plats = libraryPlatforms(), byName = new Map(cols.map((c) => [c.name, c]));
    const out = new Map();
    for (const [appid, r] of Object.entries(reg)) for (const n of r.collections || []) {
      if (SC.consoleOf(n, plats)) continue; // a console's collection: below
      const col = byName.get(n);
      if (col && !inCol(col).has(Number(appid) >>> 0)) out.set(appid + '|' + n, { appid, name: r.name, collection: n });
    }
    if (cfg().consoleCollections) for (const { g, appid } of gamesInSteam(env)) {
      const name = colName(g), col = byName.get(name);
      if (inCol(col).has(appid)) continue;
      if (!col && cols.some((c) => SC.consoleOf(c.name, plats) === g.key)) continue; // yours, not reviewed yet: the review decides
      out.set(appid + '|' + name, { appid, name: g.rom.name, collection: name, console: g.key });
    }
    return [...out.values()];
  }
  // Test one console's launch setup: does the Target exist and run?
  // Shown once after Cartridge starts: how the last Steam change went, and any collections
  // Steam dropped (Steam Cloud can replace the local collections file)
  async function startupReport() {
    const last = lastStatus();
    const c = cfg();
    let report = null;
    if (last && last.job && c.seenJob !== last.job + ':' + last.state && ['done', 'error'].includes(last.state)) {
      report = last;
      c.seenJob = last.job + ':' + last.state; ctx.saveConfig();
    }
    let missing = [];
    try { if (Object.keys(reg).length) missing = (await verifyCollections()) || []; } catch {}
    try { reconcile(last); } catch (e) { log('steam reconcile', e.message); }
    return { last: report, missing };
  }
  // 0.9.19 (HANDOFF F4): apply() writes the registry before the helper finishes (play.sh needs it), so
  // a failed apply left games counted as added. At start, with no helper job still running, games of
  // this account that aren't in shortcuts.vdf leave the registry. Live adds get a day for Steam to save.
  function reconcile(last) {
    if (last && !['done', 'error'].includes(last.state)) return 0; // a helper job is still running
    const env = environment();
    if (!env.account || !fs.existsSync(files(env.account).shortcuts)) return 0;
    const have = new Set(readShortcuts(env.account).map((sc) => String(sc.appid >>> 0)));
    let dropped = 0;
    for (const [id, r] of Object.entries(reg)) {
      if (r.account && r.account !== env.account.id) continue;
      if (have.has(String(Number(id) >>> 0))) continue;
      if (r.live && Date.now() - (r.at || 0) < 864e5) continue;
      delete reg[id]; dropped++;
    }
    if (dropped) { saveReg(); log('steam registry: dropped', dropped, 'games not in shortcuts.vdf'); }
    return dropped;
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
    if (!/\.exe$/i.test(t.exe)) try { fs.accessSync(t.exe, fs.constants.X_OK); } catch { return { ok: false, error: `Target is not executable: ${t.exe}` }; }
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
  function onDownloaded(romId) { if (cfg().autoAdd) { queueAdd([{ romId, collections: (cfg().lastCollections || {})[consoleOfRom(romId)] || [] }]); applySoon(); return true; } return false; }
  // 0.9.24 (owner: with auto add on, no trip to Settings → Steam → Apply): when Steam can be changed while it
  // runs, the queue is applied right away (a few seconds after the last download, so several go in together).
  // Without that, Steam has to close first, so it waits for you as before.
  let applyT = null;
  function applySoon() {
    clearTimeout(applyT);
    applyT = setTimeout(async () => {
      try {
        const env = environment();
        if (!env.account || !(await live.available(env.account.root).catch(() => false))) return;
        await apply({ restart: false }); ctx.broadcast('steam-auto', { action: 'applied' }); log('auto add applied live');
      } catch (e) { log('auto apply', e.message); }
    }, 4000);
  }
  function onDeleted(romId) {
    if (!cfg().autoRemove) return false;
    const ids = Object.entries(reg).filter(([, r]) => r.romId === romId).map(([id]) => Number(id));
    if (ids.length) queueRemove(ids);
    return ids.length > 0;
  }
  function consoleOfRom(romId) { const r = ctx.romById(romId); return r ? keyOf(r.platform_slug, r.platform_fs_slug) : null; }

  // ---------------------------------------------------------------- 0.9: Setup, checks and shortcut health
  // Checks before a console's games go into Steam, all read only: is the emulator there and runnable,
  // does a sandboxed (Flatpak) one have access to the games, is the RetroArch core there, the BIOS.
  function romDirOf(key) {
    const lib = ctx.getLibrary();
    const g = installedGames().find((x) => x.key === key && x.file);
    if (g) return path.dirname(real(g.file));
    const c = ctx.getConfig();
    const pl = (lib?.platforms || []).find((p) => keyOf(p.slug, p.fs_slug) === key);
    return pl && c.romsRoot ? path.join(c.romsRoot, pl.fs_slug || pl.slug) : c.romsRoot || '';
  }
  function preflight(key, t) {
    const out = [];
    const add = (level, text, extra) => out.push({ level, text, ...extra });
    if (!t) { add('bad', 'No emulator found for this console. Pick one, or Browse to it.'); return out; }
    const fpId = t.exe === '/usr/bin/flatpak' ? (String(t.args).match(/run\s+(\S+)/) || [])[1] : null;
    if (fpId) {
      if (!flatpakApps().includes(fpId)) add('bad', `The Flatpak ${fpId} isn't installed any more.`);
      const dir = romDirOf(key);
      if (dir && exists(dir)) { const a = detect.flatpakCanSee(fpId, dir); if (a.known && !a.ok) add('bad', 'This Flatpak emulator has no access to your games folder, so games won’t open.', { fix: a.fix, copy: a.fix, allow: { id: fpId, dir: real(dir) } }); }
    } else if (!exists(t.exe)) add('bad', `The emulator isn't at ${t.exe.replace(HOME, '~')} any more.`, { relink: true });
    else {
      if (!/\.exe$/i.test(t.exe)) try { fs.accessSync(t.exe, fs.constants.X_OK); } catch { add('bad', `${path.basename(t.exe)} isn't allowed to run. Right-click it, Properties, and allow running it as a program (or run: chmod +x on it).`, { copy: `chmod +x "${t.exe}"` }); }
      if (detect.appImageType(t.exe) && detect.missingFuse2(t.exe)) add('warn', 'This AppImage may need FUSE 2 (libfuse2), which isn’t installed. If it won’t start, install libfuse2, or tell Steam to unpack it by adding APPIMAGE_EXTRACT_AND_RUN=1 before %command%.');
    }
    const core = (String(t.args).match(/-L\s+("?)([^"\s]+)\1/) || [])[2];
    if (core && core.includes('/') && !exists(core)) add('bad', `The RetroArch core ${path.basename(core)} is missing. Install it in RetroArch: Main Menu, Online Updater, Core Downloader.`);
    const b = require('./bios').status(key, { roots: ctx.emulationRoots(), steamRoots: steamRoots(), extra: [ctx.getConfig().biosPath] });
    if (b && !b.ok) add(b.optional ? 'tip' : 'warn', `${b.label} not found${b.look ? ` (it usually goes in ${b.look.replace(HOME, '~')})` : ''}.${b.hint ? ' ' + b.hint : ''}`, { bios: true });
    if (b && b.ok) add('ok', `${b.label} found.`, { bios: true });
    return out;
  }
  // Everything Setup shows: per console, what was found and which one is used, plus the checks
  function setupOverview() {
    refreshLearned();
    const lib = ctx.getLibrary();
    const keys = new Map();
    for (const p of lib?.platforms || []) { const k = keyOf(p.slug, p.fs_slug); if (!keys.has(k)) keys.set(k, { key: k, label: SHORT[k] || p.display_name, platform: p.display_name, slug: p.slug, fs_slug: p.fs_slug, pid: p.id, games: 0 }); keys.get(k).games += (lib.roms[p.id] || []).length; }
    const consoles = [...keys.values()].map((c) => {
      const cands = candidates(c.key);
      const t = templateFor(c.key);
      const emus = az([...(learned[c.key] ? [{ id: 'learned', label: 'From your Steam shortcuts', sub: learned[c.key].from, how: 'learned' }] : []), ...cands.map((x) => ({ id: x.id, label: x.label, sub: shortPath(x.t.how === 'flatpak' ? x.t.from : x.t.exe), how: x.t.how, path: x.t.how === 'appimage' ? x.t.exe : null, fork: !!x.fork }))]);
      // copies the scan wasn't sure about: you say whether they're this console's emulator
      const ids = new Set([...emulatorsFor(c.key), ...(CORES[c.key] ? ['retroarch'] : [])]);
      const ok = cfg().confirmed || {};
      const unsure = (found?.items || []).filter((x) => x.id && ids.has(x.id) && x.conf < 2 && !ok[x.path] && exists(x.path)).map((x) => ({ path: x.path, short: shortPath(x.path), id: x.id, label: labelOf(x.id), why: x.why || [] }));
      return { ...c, emus, emu: t?.how === 'yours' ? 'yours' : t?.emu || null, using: t ? { exe: shortPath(t.exe), how: t.how, from: t.from, rawExe: t.exe, start: t.start, lo: [...(t.pre || []), ...((t.pre || []).length ? ['%command%'] : []), t.args].join(' ') } : null, checks: preflight(c.key, t), unsure };
    }).sort((a, b) => a.platform.localeCompare(b.platform));
    const ok = cfg().confirmed || {};
    const unknown = (found?.items || []).filter((x) => x.kind === 'appimage' && !x.id && !ok[x.path] && exists(x.path)).map((x) => ({ path: x.path, short: shortPath(x.path), name: x.name || '', fs: x.fs, version: x.version }));
    const env = environment();
    return {
      scanned: found ? { at: found.at, dirs: found.dirs, stopped: found.stopped, drives: found.drives, count: found.items.filter((x) => x.id).length } : null,
      consoles, unknown, srm: (found?.srm || []).length,
      retrodeck: flatpakApps().includes('net.retrodeck.retrodeck') || isDir(path.join(HOME, 'retrodeck')),
      emudeck: launchersDirs().length > 0,
      steam: env.installed ? { account: env.account?.name || null, flatpak: !!env.account?.flatpak } : null,
      known: Object.entries(detect.KNOWN()).map(([id, e]) => ({ id, label: e.label, for: e.for || [] })),
    };
  }
  const az = (l) => [...l.filter((e) => e.id === 'learned'), ...l.filter((e) => e.id !== 'learned').sort((a, b) => a.label.localeCompare(b.label))];
  const shortPath = (p) => String(p || '').replace(HOME, '~');
  const labelOf = (id) => (id === 'retroarch' ? 'RetroArch' : EMU[id]?.label || id);
  // "This file is <emulator>" (or 'none'): from Setup's questions and from Browse
  function confirm(file, id) { const c = cfg(); c.confirmed ||= {}; if (id) c.confirmed[file] = id; else delete c.confirmed[file]; if (c.forks) delete c.forks[file]; ctx.saveConfig(); return true; }
  // "It's a fork of <emulator>" (Setup, 0.9.3 C3): started with that emulator's options, listed as the fork
  function markFork(file, of, name) {
    if (!EMU[of]) throw new Error('Unknown emulator');
    const c = cfg(); c.confirmed ||= {}; c.forks ||= {};
    c.confirmed[file] = of; c.forks[file] = { of, name: String(name || path.basename(file)).replace(/\.appimage$/i, '').slice(0, 60) };
    ctx.saveConfig(); return true;
  }
  // Browse: a file you picked for a console. Known emulator: its arguments. Otherwise the arguments
  // of the emulator you say it behaves like, or your own. Saved as the console's own setup.
  function useFile(key, file, { as, args } = {}) {
    if (!exists(file)) throw new Error('That file is not there.');
    let id = as;
    if (!id && !args) {
      const info = detect.appImageType(file) ? detect.readAppImage(file) : null;
      const idn = info ? detect.identify({ ...info, fileName: path.basename(file) }) : detect.identifyProgram(file, { strings: false });
      if (!idn.id || (idn.id !== 'retroarch' && !emulatorsFor(key).includes(idn.id))) return { needs: 'which', guess: idn.id || null, label: idn.id ? labelOf(idn.id) : null };
      id = idn.id;
    }
    if (id === 'retroarch') {
      const core = (CORES[key] || [])[0];
      if (!core) throw new Error('RetroArch has no core Cartridge knows for this console.');
      args = args || `-L ${core}_libretro.so "{ROM}"`;
    }
    const tArgs = args || argsFor(id, key, detect.appImageType(file) ? 'appimage' : 'native');
    if (id) confirm(file, id);
    const c = cfg(); c.templates ||= {};
    c.templates[key] = { exe: file, start: path.dirname(file), pre: [], command: true, args: tArgs, kind: (EMU[id] || {}).kind || kindOf(key), from: `Picked by you: ${path.basename(file)}` };
    if (c.emus) delete c.emus[key];
    ctx.saveConfig();
    return { ok: true, template: templateFor(key) };
  }
  // the emulator a shortcut used, from what Cartridge noted when adding it, else its file name
  function emuIdOf(exe, r) {
    if (r?.emu && !/^(learned|yours|srm:)/.test(r.emu)) return r.emu.split('@')[0].replace(/^ra:.*/, 'retroarch');
    const s = scanned(exe); if (s?.id) return s.id;
    const base = path.basename(String(exe));
    if (/retroarch/i.test(base)) return 'retroarch';
    return Object.keys(EMU).find((id) => EMU[id].app?.test(base) || (EMU[id].scripts || []).includes(base) || (EMU[id].bin || []).includes(base)) || null;
  }
  // where that emulator is now (same kind of install first), or null
  function replacementFor(id, oldExe, key) {
    if (!id) return null;
    const cs = candidates(key).filter((c) => (id === 'retroarch' ? c.id.startsWith('ra:') : c.id.split('@')[0] === id) && exists(c.t.exe) && real(c.t.exe) !== real(oldExe));
    const ai = /\.appimage$/i.test(oldExe) || detect.appImageType(oldExe) === 2;
    return (cs.find((c) => (c.t.how === 'appimage') === ai) || cs[0])?.t || null;
  }
  // Shortcut health: shortcuts in Steam that would fail when started, and what can fix each
  function health() {
    const env = refreshLearned();
    if (!env.account) return { steam: false, problems: [] };
    const scs = shortcutsOf(env.account);
    const byRom = new Map(installedGames().map((g) => [g.rom.id, g]));
    const problems = [];
    for (const sc of scs) {
      if (/cartridge/i.test(sc.name + ' ' + sc.exe) && !reg[sc.appid]) continue; // Cartridge itself
      const r = reg[sc.appid];
      let l = null; try { l = learnOne(sc); } catch {}
      if (!r && !l) continue; // not a game shortcut Cartridge understands (Steam games, other apps)
      // a recomp's shortcut (0.9.65): only whether its program is still there
      if (r?.recomp) {
        if (!exists(sc.exe)) problems.push({ appid: sc.appid, name: sc.name, ours: true, console: 'recomp', exe: shortPath(sc.exe), issues: [{ kind: 'game', text: `The recomp isn’t at ${shortPath(sc.exe)} any more.`, fix: { label: 'Remove from Steam' } }] });
        continue;
      }
      const key = r?.console || l?.console;
      const p = { appid: sc.appid, name: sc.name, ours: !!r, console: key, exe: shortPath(sc.exe), issues: [] };
      const fpId = sc.exe === '/usr/bin/flatpak' || /(^|\/)flatpak$/.test(sc.exe) ? (tokenize(sc.lo + ' ' + (sc.exeRaw || '')).map((t) => t.val).join(' ').match(/run\s+(?:--\S+\s+)*(\S+)/) || [])[1] : null;
      if (fpId && !flatpakApps().includes(fpId)) p.issues.push({ kind: 'flatpak', text: `The Flatpak ${fpId} isn't installed.` });
      else if (!fpId && (!exists(sc.exe) || isTempMount(sc.exe))) {
        const id = emuIdOf(sc.exe, r);
        const to = key ? replacementFor(id, sc.exe, key) : null;
        p.issues.push({ kind: 'emulator', text: isTempMount(sc.exe) ? 'It points inside an AppImage\'s temporary folder, which is gone after a restart.' : `The emulator isn't at ${shortPath(sc.exe)} any more.`, fix: to ? { to: shortPath(to.exe), label: `Point it at ${path.basename(to.exe)}` } : null });
      }
      if (r) {
        const g = byRom.get(r.romId);
        if (!g) p.issues.push({ kind: 'game', text: 'The game isn’t on this device any more.', fix: { label: 'Remove from Steam' } });
        else if (g.file && !exists(g.file)) p.issues.push({ kind: 'game', text: 'The game’s files are gone.', fix: { label: 'Remove from Steam' } });
      } else if (l?.template?.sample && l.template.sample.startsWith('/') && !exists(l.template.sample) && (!l.template.romRoot || isDir(l.template.romRoot))) {
        // a shortcut you (or an emulator, like shadPS4) made for a game that's gone: offer to remove it
        // (0.9.3 L). Never while its drive isn't there (an SD card out): the ROMs folder must exist.
        p.issues.push({ kind: 'game', text: `The game file isn't at ${shortPath(l.template.sample)} any more.`, fix: { label: 'Remove from Steam' } });
      }
      const core = (sc.lo.match(/-L\s+("?)([^"\s]+)\1/) || [])[2];
      if (core && core.includes('/') && !exists(core)) p.issues.push({ kind: 'core', text: `The RetroArch core ${path.basename(core)} is missing. Install it in RetroArch's Online Updater.` });
      if (r && !p.issues.length && key) {
        const t = templateForGame(r.romId, key);
        if (t && (r.sig !== sigOf(t, (cfg().modes || {})[key]))) p.issues.push({ kind: 'outdated', text: 'Made with an older setup for this console.', fix: { label: 'Update' } });
      }
      if (p.issues.length) problems.push(p);
    }
    return { steam: true, problems, checked: scs.length };
  }
  // Fix what health() found for these shortcuts. Emulator moved: point the shortcut at where it is
  // now, in place when Steam can be reached (same appid, play time, artwork), else Cartridge's own
  // are re-added. Game gone: Cartridge's own are removed. Outdated: same as Update on the console.
  async function healthFix(appids) {
    const env = environment();
    if (!env.account) throw new Error('Steam was not found.');
    const want = new Set(appids.map((x) => x >>> 0));
    const h = health().problems.filter((p) => want.has(p.appid >>> 0));
    const scs = shortcutsOf(env.account);
    const liveOn = await live.available(env.account.root).catch(() => false);
    let fixed = 0, queued = 0; const left = [];
    const refreshKeys = new Set();
    for (const p of h) {
      const sc = scs.find((x) => x.appid === p.appid);
      for (const is of p.issues) {
        if (is.kind === 'emulator' && is.fix && sc) {
          const r = reg[sc.appid];
          const to = replacementFor(emuIdOf(sc.exe, r), sc.exe, p.console);
          if (!to) { left.push(p.name); continue; }
          if (liveOn) {
            // same arguments, new program: Target (and its arguments when SRM put them there) and Start in
            const exeRaw = sc.exeRaw && tokenize(sc.exeRaw).length > 1 ? `${q(to.exe)} ${tokenize(sc.exeRaw).slice(1).map((t) => t.raw).join(' ')}` : q(to.exe);
            try { if ((await live.updateShortcut(sc.appid, { exe: exeRaw, start: q(to.start), lo: sc.loRaw })) === 'ok') { if (r) Object.assign(r, { exe: to.exe, emuExe: to.exe, inPlace: Date.now() }); fixed++; continue; } } catch (e) { log('health relink', e.message); }
          }
          if (r) { refreshKeys.add(p.console); r.sig = 'moved'; queued++; } else left.push(p.name);
        } else if (is.kind === 'game' && is.fix) { queueRemove([p.appid]); queued++; } // only when you pick it in Shortcut health
        else if (is.kind === 'outdated') { refreshKeys.add(p.console); }
      }
    }
    saveReg();
    for (const k of refreshKeys) { const r = await api.refresh(k); queued += r.count || 0; }
    return { fixed, queued, left, live: liveOn };
  }
  // Emulators Cartridge's shortcuts use that aren't where they were (checked on start: a few stats)
  function movedEmulators() {
    const gone = new Map();
    for (const r of Object.values(reg)) if (r.emuExe && (!exists(r.emuExe) || isTempMount(r.emuExe)) && r.emuExe !== '/usr/bin/flatpak') gone.set(r.emuExe, (gone.get(r.emuExe) || 0) + 1);
    for (const [k, t] of Object.entries(cfg().templates || {})) if (t?.exe && !exists(t.exe)) gone.set(t.exe, gone.get(t.exe) || 0);
    return [...gone.entries()].map(([exe, n]) => ({ exe: shortPath(exe), shortcuts: n }));
  }
  // Console collections turned on: put the games Cartridge already added into the Steam collection
  // named after their console (live when Steam can be reached, else the helper next time Steam closes)
  // Console collections from what Steam really holds (0.9.34, owner: "I deleted my old PS3 collection, Cartridge made
  // Sony PlayStation 3, and I had to add the games already in Steam by hand"). Before, a game counted as done once
  // Cartridge had put it in any collection of that name (reg[].collections, never checked against Steam), and only
  // games Cartridge added were looked at. Now every downloaded game of the console that has a shortcut in Steam
  // (Cartridge's, Steam ROM Manager's, EmuDeck's or your own) is compared with the collection's real contents.
  // Collections you deleted are forgotten (0.9.34): a name you kept for a console, and the names Cartridge remembers
  // putting a game in, when no collection of that name is in Steam any more. Without this, the start-up check called
  // a collection you deleted "dropped by Steam" and its Fix made it again, and a kept name made it again too. A
  // console's current collection is kept (Steam Cloud can still drop that one). Only from a list that was read.
  function pruneStale(list, trusted) {
    if (!list.length && !trusted) return;
    const names = new Set(list.map((c) => c.name)), c = cfg();
    let changed = false;
    for (const [k, n] of Object.entries(c.collectionNames || {})) if (!names.has(n)) { delete c.collectionNames[k]; changed = true; log('kept collection gone from steam, forgotten:', n); }
    if (changed) ctx.saveConfig();
    const current = new Set(installedGames().map((g) => colName(g)));
    let rc = false;
    for (const r of Object.values(reg)) if (r.collections?.length) { const keep = r.collections.filter((n) => names.has(n) || current.has(n)); if (keep.length !== r.collections.length) { r.collections = keep; rc = true; } }
    if (rc) saveReg();
  }
  async function colsNow(env) {
    let out = null;
    if (await live.available(env.account.root).catch(() => false)) { const l = await live.listCollections().catch(() => null); if (l) out = { list: l, live: true }; }
    out ||= { list: readCollections(env.account), live: false };
    pruneStale(out.list, out.live);
    return out;
  }
  function gamesInSteam(env) {
    const idx = inSteamIndex(shortcutsOf(env.account)), out = [];
    for (const g of installedGames()) { const sc = idx(g) || liveHit(g); if (sc) out.push({ g, appid: Number(sc.appid) >>> 0 }); }
    return out;
  }
  const inCol = (col) => new Set((col?.added || []).map((x) => Number(x) >>> 0));
  // one console: its collection and each of its games in Steam, in it or not
  async function consoleCollection(key) {
    const env = environment();
    if (!env.account) throw new Error('Steam was not found.');
    const { list, live: isLive } = await colsNow(env);
    const games = gamesInSteam(env).filter((x) => x.g.key === key);
    const plat = libraryPlatforms().find((p) => p.key === key);
    const name = games.length ? colName(games[0].g) : SC.nameFor(key, plat?.name || key, cfg().collectionNames);
    const col = list.find((c) => c.name === name), have = inCol(col);
    return { key, name, exists: !!col, live: isLive, games: games.map(({ g, appid }) => ({ romId: g.rom.id, name: g.rom.name, appid, in: have.has(appid), ours: !!reg[appid] })).sort((a, b) => Number(a.in) - Number(b.in) || a.name.localeCompare(b.name)) };
  }
  // puts games in their console's collection: all missing ones, or only some consoles / appids. auto: never restarts
  // Steam (only with its interface reachable), for the check Cartridge runs by itself
  async function fillCollections({ keys = null, appids = null, auto = false } = {}) {
    const env = environment();
    if (!env.account) throw new Error('Steam was not found.');
    const { list, live: isLive } = await colsNow(env);
    const collections = {}, plats = libraryPlatforms();
    for (const { g, appid } of gamesInSteam(env)) {
      if (keys && !keys.includes(g.key)) continue;
      if (appids && !appids.map((x) => Number(x) >>> 0).includes(appid)) continue;
      const name = colName(g), col = list.find((c) => c.name === name);
      if (inCol(col).has(appid)) continue;
      // by itself it never makes a console collection next to one of yours for that console ("SNES" before it's
      // reviewed): that's the review's choice (Use yours, or Rename)
      if (auto && !col && list.some((c) => SC.consoleOf(c.name, plats) === g.key)) continue;
      (collections[name] ||= []).push(appid);
    }
    const n = Object.values(collections).flat().length;
    if (!n) return { count: 0 };
    if (auto && !isLive) return { count: 0, waiting: n };
    for (const [name, ids] of Object.entries(collections)) for (const id of ids) if (reg[id]) reg[id].collections = [...new Set([...(reg[id].collections || []), name])];
    saveReg();
    log('console collections', auto ? '(by itself)' : '', Object.entries(collections).map(([k, v]) => `${k}: ${v.length}`).join(', '));
    if (isLive) {
      let done = 0;
      for (const [name, ids] of Object.entries(collections)) for (const id of ids) if (await live.addToCollections(id, [name]).catch((e) => { log('steam live console collection', e.message); return false; })) done++;
      return { count: done, live: true };
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    runHelper('last', { id: stamp, stamp, add: [], remove: [], collections, restart: true, gamescope: !!ctx.isGamescope(), flatpakSteam: !!env.account.flatpak, shortcutsFile: files(env.account).shortcuts, cloudFile: files(env.account).cloud, backupDir: BACKUP_DIR, logFile: path.join(USER_DATA, 'steam-apply.log') });
    return { count: n, steamWillRestart: steamRunning() };
  }
  const syncConsoleCollections = () => fillCollections();
  // ---------------------------------------------------------------- collections review (0.9.24)
  // A console's Steam collection: the name the user kept in the review, else RomM's (Cartridge's) name
  // 0.9.27: maker then console ("Sony PlayStation 3"); a collection already in Steam under RomM's plain name
  // ("PlayStation 3", from before) keeps being used until it's renamed in the review, so no second one appears
  let colCache = { at: 0, names: new Set() };
  const steamColNames = () => {
    if (Date.now() - colCache.at > 2000) { const env = environment(); colCache = { at: Date.now(), names: new Set(env.account ? readCollections(env.account).map((c) => c.name) : []) }; }
    return colCache.names;
  };
  const colName = (g) => {
    const want = SC.nameFor(g.key, g.platform.display_name, cfg().collectionNames), plain = g.platform.display_name;
    if (want !== plain && !cfg().collectionNames?.[g.key]) { const have = steamColNames(); if (!have.has(want) && have.has(plain)) return plain; }
    return want;
  };
  function libraryPlatforms() {
    const seen = new Map();
    for (const p of ctx.getLibrary()?.platforms || []) { const key = keyOf(p.slug, p.fs_slug); if (!seen.has(key)) seen.set(key, { key, name: SC.fullName(key, p.display_name || p.name), plain: p.display_name || p.name }); }
    return [...seen.values()];
  }
  // The user's collections, each matched to a console with the name Cartridge would give it
  // 0.9.29 (owner: renamed collections came back as "Rename", consoles without a collection yet weren't shown, counts
  // stayed at 0): renames Steam hasn't written to its file yet are shown as done (pendingRenames, dropped once the
  // file has them), and every console in the library is listed with the collection its games go into and how
  // many of its games are in Steam (the file's count, else the shortcuts Cartridge added there)
  // 0.9.32 (owner: redesign, a deleted collection still showed): read from Steam itself when its interface is
  // reachable (what Steam shows now), else from its files with the local changes; `source` says which
  async function collectionsReview() {
    const env = environment();
    if (!env.account) throw new Error('Steam was not found.');
    const c = cfg(), pending = c.pendingRenames || {};
    let cols = null, source = 'file';
    if (await live.available(env.account.root).catch(() => false)) { cols = await live.listCollections().catch((e) => { log('steam live collections', e.message); return null; }); if (cols) source = 'live'; }
    if (!cols) cols = readCollections(env.account);
    for (const col of cols) { if (pending[col.id] && col.name === pending[col.id]) delete pending[col.id]; else if (pending[col.id]) { col.was = col.name; col.name = pending[col.id]; } }
    for (const id of Object.keys(pending)) if (!cols.some((x) => x.id === id)) delete pending[id];
    // a kept collection that's gone from Steam: its console goes back to Cartridge's name
    if (cols.length || source === 'live') for (const [k, n] of Object.entries(c.collectionNames || {})) if (!cols.some((x) => x.name === n)) { delete c.collectionNames[k]; ctx.saveConfig(); }
    const plats = libraryPlatforms(), inSteam = gamesInSteam(env);
    const consoles = plats.map((p) => {
      // the same rule as colName: RomM's plain name ("PlayStation") stays in use while it's there and Cartridge's isn't
      let name = SC.nameFor(p.key, p.name, c.collectionNames);
      if (!c.collectionNames?.[p.key] && !cols.some((x) => x.name === name) && p.plain && cols.some((x) => x.name === p.plain)) name = p.plain;
      const col = cols.find((x) => x.name === name);
      const mine = inSteam.filter((x) => x.g.key === p.key), have = inCol(col);
      return { key: p.key, name, full: p.name, kept: !!c.collectionNames?.[p.key], exists: !!col, id: col?.id || null, count: col ? col.added.length : 0, games: mine.length, missing: mine.filter((x) => !have.has(x.appid)).length };
    }).sort((a, b) => a.name.localeCompare(b.name));
    return { list: SC.analyse(cols, plats).map((x) => ({ ...x, pending: !!cols.find((y) => y.id === x.id)?.was })), consoles, source, at: Date.now(), integrated: !!c.collectionsIntegrated, kept: c.collectionNames || {} };
  }
  // renames: [{ id, from, to, key }]; keep: [{ key, name }] (collections left as they are, still used for that console)
  // reset: [key] (0.9.32): back to Cartridge's name for that console
  async function collectionsApply({ renames = [], keep = [], reset = [] } = {}) {
    const env = environment();
    if (!env.account) throw new Error('Steam was not found.');
    const c = cfg();
    c.collectionNames ||= {};
    for (const k of keep) if (k.key && k.name) c.collectionNames[k.key] = k.name;
    for (const k of reset) delete c.collectionNames[k];
    for (const r of renames) delete c.collectionNames[r.key];
    // games Cartridge put in a renamed collection follow it (verifyCollections compares names)
    const swap = Object.fromEntries(renames.map((r) => [r.from, r.to]));
    const fix = (list) => (list || []).map((n) => swap[n] || n);
    for (const r of Object.values(reg)) if (r.collections) r.collections = fix(r.collections);
    for (const k of Object.keys(c.lastCollections || {})) c.lastCollections[k] = fix(c.lastCollections[k]);
    c.collectionsIntegrated = true;
    ctx.saveConfig(); saveReg();
    if (!renames.length) return { count: 0 };
    c.pendingRenames ||= {};
    for (const r of renames) c.pendingRenames[r.id] = r.to; // shown as done until Steam's file says so
    ctx.saveConfig();
    const left = {};
    if (await live.available(env.account.root).catch(() => false)) {
      for (const r of renames) { const ok = await live.renameCollection(r.id, r.to).catch((e) => { log('steam live rename collection', e.message); return false; }); if (!ok) left[r.id] = r.to; }
      if (!Object.keys(left).length) return { count: renames.length, live: true };
    } else for (const r of renames) left[r.id] = r.to;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    runHelper('last', { id: stamp, stamp, add: [], remove: [], rename: left, restart: true, gamescope: !!ctx.isGamescope(), flatpakSteam: !!env.account.flatpak, shortcutsFile: files(env.account).shortcuts, cloudFile: files(env.account).cloud, backupDir: BACKUP_DIR, logFile: path.join(USER_DATA, 'steam-apply.log') });
    return { count: renames.length, steamWillRestart: steamRunning() };
  }
  // every fork found on this device (0.9.33, Linked Folders): [{ of, name, exe, how }]
  function forksAll() {
    const seen = new Map(), keys = new Set(Object.values(EMU).flatMap((e) => e.for || []));
    for (const k of keys) for (const c of candidates(k)) if (c.fork && c.t?.exe && !seen.has(c.t.exe)) {
      const id = String(c.id).split('@')[0];
      seen.set(c.t.exe, { of: EMU[id]?.forkOf || id, name: String(c.label).split(' · ')[0], exe: c.t.exe, how: c.t.how });
    }
    return [...seen.values()];
  }
  // A plain-text summary for bug reports: what was found and chosen, with personal details taken out
  function setupReport() {
    const o = setupOverview();
    const scrub = (s) => String(s || '').replace(new RegExp(HOME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '~').replace(/\/(home|var\/home|Users)\/[^/\s"]+/g, '/$1/USER').replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, 'x.x.x.x').replace(/https?:\/\/[^\s"]+/g, 'URL');
    const lines = [`Cartridge ${ctx.version || ''} setup report`, `System: ${scrub(ctx.osInfo || process.platform)}`, `Steam: ${o.steam ? (o.steam.flatpak ? 'Flatpak' : 'installed') + (o.steam.account ? ', signed in' : ', no account') : 'not found'}`,
      `EmuDeck: ${o.emudeck ? 'yes' : 'no'} · RetroDECK: ${o.retrodeck ? 'yes' : 'no'} · Steam ROM Manager setups: ${o.srm}`,
      `Scan: ${o.scanned ? `${o.scanned.count} emulators in ${o.scanned.dirs} folders${o.scanned.stopped ? ' (stopped early)' : ''}${o.scanned.drives ? ', other drives included' : ''}` : 'not run'}`, ''];
    for (const c of o.consoles) {
      lines.push(`${c.platform} (${c.key}), ${c.games} games`);
      lines.push(`  using: ${c.using ? `${scrub(c.using.exe)} [${c.using.how}]` : 'nothing found'}`);
      for (const e of c.emus) lines.push(`  found: ${e.label} ${scrub(e.sub)}`);
      for (const u of c.unsure) lines.push(`  unsure: ${scrub(u.short)} looks like ${u.label}`);
      for (const k of c.checks) if (k.level !== 'ok') lines.push(`  ${k.level}: ${scrub(k.text)}`);
    }
    if (o.unknown.length) { lines.push('', 'AppImages it could not name:'); for (const u of o.unknown) lines.push(`  ${scrub(u.short)} (${u.fs || 'unreadable'})`); }
    return lines.join('\n');
  }

  writeScript();
  // recomps (0.9.65): the shortcut Cartridge made for one (its appid as Steam has it now, live adds included), and
  // starting any shortcut by appid (a Windows recomp's setup runs through Proton, so through Steam)
  function recompShortcut(id) {
    const env = environment(), have = env.account ? new Set(shortcutsOf(env.account).map((x) => x.appid >>> 0)) : new Set();
    const hit = Object.entries(reg).find(([a, r]) => r.recomp === id && (have.has(Number(a) >>> 0) || r.live));
    return hit ? { appid: Number(hit[0]) >>> 0, name: hit[1].name, exe: hit[1].exe } : null;
  }
  async function runAppid(appid) {
    const gameId = ((BigInt(appid >>> 0) << 32n) | 0x02000000n).toString(), env = environment();
    if (env.account && (await live.available(env.account.root).catch(() => false))) { try { await live.runGame(gameId); return { via: 'steam' }; } catch (e) { log('live run failed', e.message); } }
    const e2 = { ...process.env }; for (const k of ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'APPDIR', 'APPIMAGE']) delete e2[k];
    const url = `steam://rungameid/${gameId}`;
    const tryRun = (cmd, args) => new Promise((ok) => { try { const pr = spawn(cmd, args, { detached: true, stdio: 'ignore', env: e2 }); pr.on('error', () => ok(false)); pr.on('spawn', () => { pr.unref(); ok(true); }); } catch { ok(false); } });
    for (const [c, a] of [['xdg-open', [url]], ['steam', [url]], ['flatpak', ['run', 'com.valvesoftware.Steam', url]]]) if (await tryRun(c, a)) return { via: 'url' };
    throw new Error('Steam couldn’t be asked to start it.');
  }
  // a recomp's shortcut moved in place (an update put its program somewhere new): same appid, so play time stays
  async function recompRepoint(id, { exe, start, lo }) {
    const sc = recompShortcut(id);
    if (!sc) return false;
    const env = environment();
    if (env.account && (await live.available(env.account.root).catch(() => false))) { await live.updateShortcut(sc.appid, { exe: q(exe), start: q(start), lo: lo || '' }); reg[sc.appid].exe = exe; saveReg(); return true; }
    return false;
  }
  const liveNow = async () => { const env = environment(); return !!(env.account && (await live.available(env.account.root).catch(() => false))); };
  const api = {
    recompShortcut, runAppid, recompRepoint, liveNow, applySoon,
    overview, preview, apply, undo, restartSteam, removeAllOurs, queueAdd, queueRemove, queueClear, queueInfo, test, setTemplate, setMode, verifyCollections,
    collections: () => { const env = environment(); return env.account ? readCollections(env.account) : []; },
    // live changes: is Steam's interface reachable, and turning on its local debugging port
    // pick the emulator new shortcuts use for a console (clears a hand-edited setup for it)
    setEmu: (key, id) => { const c = cfg(); c.emus ||= {}; if (id) c.emus[key] = id; else delete c.emus[key]; if (c.templates?.[key]) delete c.templates[key]; ctx.saveConfig(); return true; },
    // re-add this console's games Cartridge put in Steam, so they use the current emulator setup
    refresh: async (key) => {
      const mode0 = (cfg().modes || {})[key];
      const tOf = (romId) => templateForGame(romId, key), sigFor = (romId) => sigOf(tOf(romId), mode0);
      const t = templateFor(key);
      let games = overview().games.filter((g) => g.console === key && g.inSteam && g.ours && g.file && g.appid && (g.badLo || reg[g.appid]?.sig !== sigFor(g.romId)));
      // With Steam reachable, each shortcut is changed in place: same appid, so its play time,
      // collections and artwork stay. Otherwise (or if that fails) it's removed and added again.
      const env = environment();
      const mode = (cfg().modes || {})[key] || 'direct';
      if (games.length && t && mode !== 'script' && env.account && await live.available(env.account.root)) {
        const byRom = new Map(installedGames().map((x) => [x.rom.id, x]));
        let fixed = 0;
        for (const g of games) {
          const ig = byRom.get(g.romId);
          if (!ig?.file) continue;
          const tg = tOf(g.romId);
          const b = buildLaunch(ig.rom, ig.file, tg);
          if (b.missing) continue;
          const { target, launch } = launchFor(tg, b.lo, b.args);
          try {
            if ((await live.updateShortcut(g.appid, { exe: target, start: startField(startOf(tg)), lo: launch })) === 'ok') {
              Object.assign(reg[g.appid], { sig: sigFor(g.romId), exe: tg.exe, emu: tg.emu || null, emuExe: tg.exe, mode, inPlace: Date.now() }); delete reg[g.appid].loFixed; fixed++; // Steam saves its file later
            }
          } catch (e) { log('steam live update', e.message); }
        }
        saveReg();
        games = games.filter((g) => reg[g.appid]?.sig !== sigFor(g.romId)); // anything not changed in place is re-added
        if (!games.length) return { count: fixed, fixed };
      }
      if (!games.length) return { count: 0 };
      queueAdd(games.map((g) => ({ romId: g.romId, collections: reg[g.appid]?.collections || [] })));
      queueRemove(games.map((g) => g.appid)); // after queueAdd, which drops pending removals of the same game
      return { count: games.length };
    },
    // one game's shortcut to its current setup (after "Emulator for this game"), leaving the rest of
    // its console alone: in place when Steam can be reached, else queued to be re-added
    refreshGame: async (romId, { force = false } = {}) => {
      const g = overview().games.find((x) => x.romId === romId && x.inSteam && x.ours && x.file && x.appid);
      if (!g) return { count: 0 };
      const t = templateForGame(romId, g.console), mode = (cfg().modes || {})[g.console] || 'direct', sig = sigOf(t, mode);
      if (!t || (reg[g.appid]?.sig === sig && !g.badLo && !force)) return { count: 0 };
      const env = environment();
      const ig = installedGames().find((x) => x.rom.id === romId);
      if (mode !== 'script' && ig?.file && env.account && await live.available(env.account.root)) {
        const b = buildLaunch(ig.rom, ig.file, t);
        if (!b.missing) {
          const { target, launch } = launchFor(t, b.lo, b.args);
          try {
            if ((await live.updateShortcut(g.appid, { exe: target, start: startField(startOf(t)), lo: launch })) === 'ok') { Object.assign(reg[g.appid], { sig, exe: t.exe, emu: t.emu || null, emuExe: t.exe, mode, inPlace: Date.now() }); saveReg(); return { count: 1, fixed: 1 }; }
          } catch (e) { log('steam live update', e.message); }
        }
      }
      queueAdd([{ romId, collections: reg[g.appid]?.collections || [] }]);
      queueRemove([g.appid]);
      return { count: 1 };
    },
    // 0.9.3 C7: this console's games you added to Steam yourself (or another tool did) start the way
    // Cartridge starts the rest. Steam reachable: changed in place (same appid, so play time,
    // collections and artwork stay) and registered as Cartridge's. Otherwise removed and added again.
    takeOver: async (key) => {
      const t = templateFor(key);
      if (!t) throw new Error('Pick an emulator for this console first.');
      let games = overview().games.filter((g) => g.console === key && g.inSteam && !g.ours && g.file && g.appid);
      if (!games.length) return { count: 0 };
      const env = environment();
      const mode = (cfg().modes || {})[key] || 'direct';
      let fixed = 0;
      if (mode !== 'script' && env.account && await live.available(env.account.root)) {
        const byRom = new Map(installedGames().map((x) => [x.rom.id, x]));
        for (const g of games) {
          const ig = byRom.get(g.romId), tg = templateForGame(g.romId, key);
          if (!ig?.file || !tg) continue;
          const b = buildLaunch(ig.rom, ig.file, tg);
          if (b.missing) continue;
          const { target, launch } = launchFor(tg, b.lo, b.args);
          try {
            if ((await live.updateShortcut(g.appid, { exe: target, start: startField(startOf(tg)), lo: launch })) === 'ok') {
              reg[g.appid] = { romId: g.romId, name: g.name, console: key, exe: tg.exe, emu: tg.emu || null, emuExe: tg.exe, sig: sigOf(tg, mode), mode, at: Date.now(), account: env.account.id, collections: [], inPlace: Date.now(), takenOver: true };
              fixed++;
            }
          } catch (e) { log('steam take over', e.message); }
        }
        saveReg();
        games = games.filter((g) => !reg[g.appid]);
        if (!games.length) return { count: fixed, fixed };
      }
      queueAdd(games.map((g) => ({ romId: g.romId, collections: (cfg().lastCollections || {})[key] || [] })));
      queueRemove(games.map((g) => g.appid));
      return { count: games.length + fixed, fixed, queued: games.length };
    },
    liveInfo: async () => { const env = environment(); if (!env.account) return { on: false, flag: false }; return { on: await live.available(env.account.root), flag: live.flagOn(env.account.root) }; },
    liveEnable: () => { const env = environment(); if (!env.account) throw new Error('Steam was not found.'); fs.writeFileSync(path.join(env.account.root, live.FLAG), ''); return true; },
    installedEmulators, addRomToCollections, onDownloaded, onDeleted, lastStatus, writeScript, startupReport, forRom, fixCollections, played, playtime, steamRoots, refreshArt,
    play, scanEmulators, rpcs3Command, vita3kCommand, setupOverview, confirm, markFork, useFile, health, healthFix, movedEmulators, setupReport, syncConsoleCollections, fillCollections, consoleCollection, collectionsReview, collectionsApply, forksAll, frontRunning, preflight: (key) => preflight(key, templateFor(key)),
    candidatesFor: (key) => az(candidates(key).map((c) => ({ id: c.id, label: c.label, sub: shortPath(c.t.how === 'flatpak' ? c.t.from : c.t.exe), fork: !!c.fork }))),
    // one game's own Target, Start in and Launch options (console page, 0.9.15); null goes back
    setGameTemplate: (romId, t) => { const c = cfg(); c.gameTemplates ||= {}; if (t) c.gameTemplates[romId] = parseTemplate(t); else delete c.gameTemplates[romId]; ctx.saveConfig(); return true; },
    gameTemplate: (romId, key) => { const t = templateForGame(romId, key); return t ? { exe: t.exe, start: startOf(t), lo: [...(t.pre || []), ...(t.command ? ['%command%'] : []), t.args].join(' '), how: t.how, own: !!(cfg().gameTemplates || {})[romId] } : null; },
    setGameEmu: (romId, id) => { const c = cfg(); c.gameEmus ||= {}; if (id) c.gameEmus[romId] = id; else delete c.gameEmus[romId]; ctx.saveConfig(); return true; },
    gameEmu: (romId) => (cfg().gameEmus || {})[romId] || null,
    addedAt: (romId) => Math.min(...Object.values(reg).filter((r) => r.romId === romId && r.at).map((r) => r.at), Infinity),
    // exposed for tests
    _learnOne: learnOne, _tokenize: tokenize, _buildLaunch: buildLaunch, _inSteamIndex: inSteamIndex, _gameSerial: gameSerial, _vitaTitleId: vitaTitleId, _gameRef: gameRef, _learnAll: learnAll, _readShortcuts: () => { const e = environment(); return e.account ? readShortcuts(e.account) : []; }, _candidates: candidates, appImagesFor, serialOf, flatpakSteamAccess, _hostLaunch: hostLaunch, _launchFor: launchFor, _withFg: withFg, _withShadVersion: withShadVersion, shadVersions, _multiDisc: multiDisc, _startOf: startOf, _templateFor: templateFor, _templateForGame: templateForGame,
  };
  return api;
};
