const { app, BrowserWindow, ipcMain, protocol, powerSaveBlocker, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const PLATFORM_MAP = require('./platformMap');

// Note: never add 'no-sandbox' here. Appending it at runtime (after Chromium has
// started its zygote) makes renderers crash with "/dev/shm ... No such process".
// The AppImage launcher already passes --no-sandbox when user namespaces are missing.
app.commandLine.appendSwitch('enable-features', 'OverlayScrollbar');
app.setName('Cartridge');

protocol.registerSchemesAsPrivileged([
  { scheme: 'romimg', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const USER_DATA = app.getPath('userData');
const CONFIG_FILE = path.join(USER_DATA, 'config.json');
const MANIFEST_FILE = path.join(USER_DATA, 'installed.json');
const IMG_CACHE = path.join(USER_DATA, 'imgcache');

// ---------------------------------------------------------------- config
const DEFAULT_CONFIG = {
  server: {
    localUrl: '',
    remoteUrl: '',
    mode: 'auto', // auto | local | remote
    auth: 'password', // password | token
    username: '',
    password: '',
    token: '',
    cfClientId: '',
    cfClientSecret: '',
  },
  romsRoot: '',
  biosPath: '',
  paths: {},
  downloads: { concurrency: 2, esdeM3uFolders: true, flattenSingleFile: true },
  ui: { gridSize: 'md', hideEmpty: true, sounds: true, bgStyle: 'waves', theme: 'purple', mediaBar: true, logos: true, pointer: 'auto', scale: 'auto', keyboard: 'auto',
    customColor: '', surface: 'glass', text: 'normal', font: 'outfit', cardShape: 'rounded', density: 'normal', cardTitles: true,
    motion: 'normal', effects: 'auto', soundPack: 'soft', volume: 'medium', wallpaper: '', wallDim: 'medium',
    colors: { highlight: '', buttons: '', bars: '', background: '' } },
  sync: { onLaunch: true, everyMinutes: 60 },
  sgdbKey: '', // optional SteamGridDB API key for game logos
  ra: { user: '', key: '' }, // RetroAchievements username + web API key
  trophies: { sources: {}, sync: true, popups: true, device: '' }, // PS3/PS4/Xbox 360/Vita trophies from emulators
  graphics: 'auto', // auto (GPU, falls back on failure) | software
  configVersion: 2,
  configured: false,
};

function deepMerge(base, extra) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') out[k] = deepMerge(base[k], v);
    else out[k] = v;
  }
  return out;
}

const LIBRARY_FILE = path.join(USER_DATA, 'library.json');
// Carry settings over from the RomDeck preview build
if (!fs.existsSync(CONFIG_FILE)) {
  const old = path.join(app.getPath('appData'), 'RomDeck');
  for (const f of ['config.json', 'installed.json']) {
    try { fs.mkdirSync(USER_DATA, { recursive: true }); fs.copyFileSync(path.join(old, f), path.join(USER_DATA, f)); } catch {}
  }
}
let config = loadJson(CONFIG_FILE, {});
const rawVersion = config.configVersion || 1;
config = deepMerge(DEFAULT_CONFIG, config);
if (rawVersion < 2) {
  // 0.1.1/0.1.2 saved 'software' as a default, not a user choice: move everyone to Auto (GPU)
  if (config.graphics !== 'hardware') config.graphics = 'auto';
  if (config.graphics === 'hardware') config.graphics = 'auto';
  config.configVersion = 2;
  try { fs.mkdirSync(USER_DATA, { recursive: true }); fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 }); } catch {}
}

// ---------------------------------------------------------------- graphics
// Chromium's GPU path shows a blank grey window on some Linux handhelds (AMD + KDE
// Wayland on Bazzite in particular). Software rendering is plenty for this UI and
// works everywhere, so it's the default; hardware acceleration is opt-in in Settings.
const LOG_FILE = path.join(USER_DATA, 'cartridge.log');
function log(...a) {
  try { fs.mkdirSync(USER_DATA, { recursive: true }); fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${a.join(' ')}\n`); } catch {}
}
try { if (fs.statSync(LOG_FILE).size > 512 * 1024) fs.renameSync(LOG_FILE, LOG_FILE + '.old'); } catch {}
// ---------------------------------------------------------------- one Cartridge at a time
// A second launch (Steam, the desktop icon, a game shortcut with --game) hands over to the
// running one. If that one stopped answering (a hung start used to need a Steam restart), it is
// ended and this launch carries on.
const argGame = (argv = process.argv) => { const i = argv.indexOf('--game'); const v = i >= 0 ? Number(argv[i + 1]) : NaN; return Number.isFinite(v) ? v : null; };
const BEAT_FILE = path.join(USER_DATA, 'running.json');
let startGame = argGame();
if (!process.env.CARTRIDGE_SMOKE && !process.env.CARTRIDGE_MULTI) {
  if (!app.requestSingleInstanceLock({ game: startGame })) {
    let beat = null;
    try { beat = JSON.parse(fs.readFileSync(BEAT_FILE, 'utf8')); } catch {}
    const alive = beat && Date.now() - beat.t < 20000;
    if (alive) { log('already running (pid ' + beat.pid + '), handing over'); app.exit(0); }
    else {
      if (beat?.pid) { try { process.kill(beat.pid, 'SIGKILL'); log('ended a Cartridge that stopped answering, pid', beat.pid); } catch {} }
      try { fs.rmSync(path.join(USER_DATA, 'SingletonLock'), { force: true }); } catch {}
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 700);
      app.relaunch({ execPath: process.env.APPIMAGE || process.execPath, args: process.argv.slice(1) });
      app.exit(0);
    }
  } else {
    const beatNow = () => { try { fs.writeFileSync(BEAT_FILE, JSON.stringify({ pid: process.pid, t: Date.now() })); } catch {} };
    beatNow(); setInterval(beatNow, 5000).unref?.();
    app.on('second-instance', (_e, argv, _cwd, data) => {
      if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
      const g = data?.game ?? argGame(argv);
      if (g) broadcast('open-game', g);
    });
    app.on('will-quit', () => { try { fs.rmSync(BEAT_FILE, { force: true }); } catch {} });
  }
}
function isGamescope() {
  const e = process.env;
  const de = ((e.XDG_CURRENT_DESKTOP || '') + ' ' + (e.XDG_SESSION_DESKTOP || '') + ' ' + (e.DESKTOP_SESSION || '')).toLowerCase();
  return !!(e.GAMESCOPE_WAYLAND_DISPLAY || e.SteamGamepadUI || e.SteamOS === '1' && !e.KDE_FULL_SESSION || de.includes('gamescope'));
}
// Game Mode (gamescope) always renders in software: the GPU path gives a blank or missing
// window there, and 0.1.2 proved software is reliable in Game Mode. Desktop Mode uses the GPU.
const inGamescope = isGamescope();
// Launched from Steam (Desktop or Game Mode): Steam injects its overlay into every process,
// and the overlay hooking Chromium's GPU process leaves a hung, windowless app stuck on
// "Running". 0.1.2 used software rendering everywhere and launched fine from Steam, so do that.
function launchedBySteam() {
  const e = process.env;
  return !!(e.CARTRIDGE_FROM_STEAM || e.SteamGameId || e.SteamAppId || e.SteamClientLaunch || e.SteamOverlayGameId || /gameoverlayrenderer/.test(e.LD_PRELOAD || ''));
}
const fromSteam = launchedBySteam();
// Biggest connected display, read from the kernel before Chromium starts (the screen API only
// works after startup, too late to pick a renderer). A 4K TV is far too many pixels to draw in
// software, so big screens get the GPU even under Steam; handheld-size screens keep the
// software path that is proven to launch there.
function biggestDisplay() {
  let best = { w: 0, h: 0 };
  try {
    for (const d of fs.readdirSync('/sys/class/drm')) {
      if (!/^card\d+-/.test(d)) continue;
      try {
        if (fs.readFileSync(`/sys/class/drm/${d}/status`, 'utf8').trim() !== 'connected') continue;
        const m = fs.readFileSync(`/sys/class/drm/${d}/modes`, 'utf8').split('\n')[0].match(/(\d+)x(\d+)/);
        if (m && +m[1] * +m[2] > best.w * best.h) best = { w: +m[1], h: +m[2] };
      } catch {}
    }
  } catch {}
  return best;
}
const display = biggestDisplay();
const bigScreen = display.w >= 2560 || display.h >= 1440 || process.env.CARTRIDGE_BIG === '1';
const forceSoftware = ((inGamescope || fromSteam) && !bigScreen) || process.argv.includes('--disable-gpu') || process.env.CARTRIDGE_SAFE_GPU === '1';
const useGpu = !forceSoftware && config.graphics !== 'software';
const startedAt = Date.now();
if (!useGpu) app.disableHardwareAcceleration();
log('start', app.getVersion(), 'gpu=' + (useGpu ? 'hardware' : 'software'), 'session=' + (process.env.XDG_SESSION_TYPE || '?'), 'desktop=' + (process.env.XDG_CURRENT_DESKTOP || '?'), 'appimage=' + (process.env.APPIMAGE || 'no'), 'display=' + (display.w ? display.w + 'x' + display.h : '?'), 'gamescope=' + inGamescope, 'steam=' + fromSteam, 'overlay=' + /gameoverlayrenderer/.test(process.env.LD_PRELOAD || ''), 'wl=' + (process.env.WAYLAND_DISPLAY || '-'), 'x=' + (process.env.DISPLAY || '-'), 'gs=' + (process.env.GAMESCOPE_WAYLAND_DISPLAY || '-'));
// Steam launches Cartridge through this script instead of the AppImage directly.
// Steam adds its overlay (LD_PRELOAD) and its runtime libraries (LD_LIBRARY_PATH) to every
// game, and Chromium can die during its sandbox setup under Steam before any app code runs.
// The script drops both, starts without the Chromium sandbox, and writes everything to
// steam-launch.log so a failed launch always leaves a trace.
const STEAM_LAUNCHER = path.join(USER_DATA, 'steam-launch.sh');
function writeSteamLauncher() {
  const ai = process.env.APPIMAGE;
  if (!ai) return null;
  const q = (v) => "'" + String(v).replace(/'/g, "'\\''") + "'";
  const body = `#!/bin/bash
# Written by Cartridge. Steam's shortcut runs this; it is rewritten on every start.
LOG=${q(path.join(USER_DATA, 'steam-launch.log'))}
{
  echo "=== $(date -Is) launched by Steam"
  env | grep -E '^(LD_PRELOAD|LD_LIBRARY_PATH|SteamGameId|SteamAppId|SteamGamepadUI|XDG_SESSION_TYPE|XDG_CURRENT_DESKTOP|DISPLAY|WAYLAND_DISPLAY|GAMESCOPE_WAYLAND_DISPLAY)=' | cut -c1-300
} > "$LOG" 2>&1
unset LD_PRELOAD LD_LIBRARY_PATH
export CARTRIDGE_FROM_STEAM=1
exec ${q(ai)} --no-sandbox "$@" >> "$LOG" 2>&1
`;
  fs.mkdirSync(USER_DATA, { recursive: true });
  fs.writeFileSync(STEAM_LAUNCHER, body, { mode: 0o755 });
  fs.chmodSync(STEAM_LAUNCHER, 0o755);
  return STEAM_LAUNCHER;
}
// keep the script pointing at wherever this AppImage lives now
if (process.env.APPIMAGE && fs.existsSync(STEAM_LAUNCHER)) { try { writeSteamLauncher(); } catch {} }

function relaunch() {
  const args = process.argv.slice(1).filter((a) => !a.startsWith('--disable-gpu'));
  if (process.env.APPIMAGE) app.relaunch({ execPath: process.env.APPIMAGE, args });
  else app.relaunch({ args });
  app.exit(0);
}
let manifest = loadJson(MANIFEST_FILE, {}); // romId -> { path, platformSlug, name, at }

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJson(file, data, pretty = true) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, pretty ? 2 : 0), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
const saveConfig = () => saveJson(CONFIG_FILE, config);
const saveManifest = () => saveJson(MANIFEST_FILE, manifest);

// ---------------------------------------------------------------- server / api
const trimUrl = (u) => (u || '').trim().replace(/\/+$/, '');
let activeBase = null;

function authHeaders(srv = config.server) {
  const h = { Accept: 'application/json', 'User-Agent': 'Cartridge/1.0' };
  if (srv.auth === 'token' && srv.token) h.Authorization = `Bearer ${srv.token.trim()}`;
  else if (srv.username) h.Authorization = 'Basic ' + Buffer.from(`${srv.username}:${srv.password}`).toString('base64');
  if (srv.cfClientId && srv.cfClientSecret) {
    h['CF-Access-Client-Id'] = srv.cfClientId.trim();
    h['CF-Access-Client-Secret'] = srv.cfClientSecret.trim();
  }
  return h;
}

async function probe(base, srv = config.server, timeout = 2500) {
  if (!base) return null;
  try {
    const r = await fetch(`${base}/api/heartbeat`, { headers: authHeaders(srv), signal: AbortSignal.timeout(timeout), redirect: 'manual' });
    if (r.status >= 300 && r.status < 400) return { ok: false, error: 'Redirected (Cloudflare Access login?). Add a service token in Advanced.' };
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json().catch(() => null);
    if (!j) return { ok: false, error: 'Not a RomM server (bad response)' };
    return { ok: true, version: j?.SYSTEM?.VERSION || j?.VERSION || 'unknown' };
  } catch (e) {
    return { ok: false, error: e.name === 'TimeoutError' ? 'Timed out' : (e.cause?.code || e.message) };
  }
}

async function resolveBase(force = false) {
  if (activeBase && !force) return activeBase;
  const s = config.server;
  const local = trimUrl(s.localUrl), remote = trimUrl(s.remoteUrl);
  if (s.mode === 'local') activeBase = local;
  else if (s.mode === 'remote') activeBase = remote;
  else {
    const l = local ? await probe(local, s, 1500) : null;
    activeBase = l?.ok ? local : (remote || local);
  }
  broadcast('connection', { base: activeBase, route: activeBase === trimUrl(s.localUrl) ? 'local' : 'remote' });
  return activeBase;
}

async function api(pathname, { query, method = 'GET', body, retry = true, srv, base } = {}) {
  const b = base || (await resolveBase());
  if (!b) throw new Error('No server configured');
  const url = new URL(b + pathname);
  for (const [k, v] of Object.entries(query || {})) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else url.searchParams.set(k, v);
  }
  const headers = authHeaders(srv);
  if (body) headers['Content-Type'] = 'application/json';
  let r;
  try {
    r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  } catch (e) {
    if (retry && !base && config.server.mode === 'auto') {
      await resolveBase(true);
      return api(pathname, { query, method, body, retry: false, srv });
    }
    throw new Error(`Cannot reach server (${e.cause?.code || e.message})`);
  }
  if (r.status === 401 || r.status === 403) throw new Error('Authentication failed. Check your credentials.');
  if (!r.ok) throw new Error(`Server error ${r.status} on ${pathname}`);
  return r.json();
}

// ---------------------------------------------------------------- path detection
function expandHome(p) {
  if (!p) return p;
  return p.replace(/^~(?=$|\/)/, os.homedir()).replace(/\$HOME|\$\{HOME\}/g, os.homedir());
}
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

function readEmuDeckSettings() {
  const file = path.join(os.homedir(), '.config/EmuDeck/settings.sh');
  const out = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?(romsPath|emulationPath|biosPath|toolsPath)=["']?([^"'\n]*)["']?/);
      if (m) out[m[1]] = expandHome(m[2].trim());
    }
  } catch {}
  return out;
}

function readEsdeRomDir() {
  const files = [
    path.join(os.homedir(), 'ES-DE/settings/es_settings.xml'),
    path.join(os.homedir(), '.emulationstation/es_settings.xml'),
    path.join(os.homedir(), '.var/app/org.es_de.frontend/ES-DE/settings/es_settings.xml'),
  ];
  for (const f of files) {
    try {
      const m = fs.readFileSync(f, 'utf8').match(/name="ROMDirectory"\s+value="([^"]*)"/);
      if (m && m[1]) return { file: f, dir: expandHome(m[1].replace('%ROMPATH%', '')) };
    } catch {}
  }
  return null;
}

function scanMounts() {
  const found = [];
  const roots = [`/run/media/${os.userInfo().username}`, '/run/media', '/media', '/mnt', os.homedir()];
  const tryDir = (p) => {
    for (const cand of [path.join(p, 'Emulation/roms'), path.join(p, 'roms')]) {
      if (isDir(cand) && !found.includes(cand)) found.push(cand);
    }
  };
  for (const r of roots) {
    tryDir(r);
    let lvl1 = [];
    try { lvl1 = fs.readdirSync(r, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')); } catch {}
    for (const d of lvl1) {
      const p1 = path.join(r, d.name);
      tryDir(p1);
      let lvl2 = [];
      try { lvl2 = fs.readdirSync(p1, { withFileTypes: true }).filter((x) => x.isDirectory() && !x.name.startsWith('.')); } catch {}
      for (const d2 of lvl2.slice(0, 40)) tryDir(path.join(p1, d2.name));
    }
  }
  return found.filter((p) => !p.includes('/.'));
}

function detectRoots() {
  const out = [];
  const add = (p, source) => {
    if (!p) return;
    const norm = path.resolve(p);
    if (!out.find((o) => o.path === norm)) out.push({ path: norm, source, exists: isDir(norm) });
  };
  const emu = readEmuDeckSettings();
  if (emu.romsPath) add(emu.romsPath, 'EmuDeck settings');
  else if (emu.emulationPath) add(path.join(emu.emulationPath, 'roms'), 'EmuDeck settings');
  const esde = readEsdeRomDir();
  if (esde) add(esde.dir, 'ES-DE settings');
  for (const p of scanMounts()) add(p, 'Found on disk');
  let bios = null;
  if (emu.biosPath) bios = emu.biosPath;
  else if (emu.emulationPath) bios = path.join(emu.emulationPath, 'bios');
  else {
    const r = out.find((o) => o.exists);
    if (r) { const b = path.join(path.dirname(r.path), 'bios'); if (isDir(b)) bios = b; }
  }
  return { roots: out, bios };
}

function listDirNames(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() || d.isSymbolicLink()).map((d) => d.name); } catch { return []; }
}

function platformPath(p) {
  // p: { slug, fs_slug }
  const override = config.paths[p.slug];
  if (override) return { path: override, source: 'custom', exists: isDir(override) };
  const root = config.romsRoot;
  if (!root) return { path: '', source: 'none', exists: false };
  const cands = [...(PLATFORM_MAP[p.slug] || []), ...(p.fs_slug ? [p.fs_slug] : []), p.slug].filter(Boolean);
  const existing = listDirNames(root);
  const lower = new Map(existing.map((n) => [n.toLowerCase(), n]));
  for (const c of cands) {
    const hit = lower.get(c.toLowerCase());
    if (hit) return { path: path.join(root, hit), source: 'auto', exists: true };
  }
  return { path: path.join(root, cands[0]), source: 'auto', exists: false };
}

// ---------------------------------------------------------------- installed detection
function candidatesFor(rom) {
  const names = [rom.fs_name, `${rom.fs_name}.m3u`];
  const files = rom.files || [];
  if (files.length === 1) names.push(files[0].file_name);
  return names.filter(Boolean);
}

// PS4 / PS5 games live on RomM as zips but are played from an extracted folder, so the zip
// never shows up on disk. They are matched by folder name (zip name without .zip) or by the
// PlayStation title ID (CUSA12345 / PPSA12345), and can also be marked by hand.
const FOLDER_SYSTEMS = new Set(['ps4', 'ps5']);
const isFolderSystem = (r) => FOLDER_SYSTEMS.has(r.platform_slug) || FOLDER_SYSTEMS.has(r.platform_fs_slug);
const MARKS_FILE = path.join(USER_DATA, 'marked.json');
const marks = loadJson(MARKS_FILE, {}); // romId -> { at }
function saveMarks() { try { fs.writeFileSync(MARKS_FILE, JSON.stringify(marks, null, 1)); } catch {} }
const titleId = (s) => (String(s || '').match(/\b(CUSA|PPSA)\d{5}\b/i) || [])[0]?.toUpperCase() || '';
function installedState(roms, platform) {
  const dir = platformPath(platform).path;
  let entries = new Set();
  if (dir) { try { entries = new Set(fs.readdirSync(dir)); } catch {} }
  const out = {};
  let ids = null;
  for (const rom of roms) {
    const m = manifest[rom.id];
    if (m && fs.existsSync(m.path)) { out[rom.id] = m.path; continue; }
    const hit = candidatesFor(rom).find((n) => entries.has(n));
    if (hit) { out[rom.id] = path.join(dir, hit); continue; }
    if (isFolderSystem(rom) && dir) {
      const stem = String(rom.fs_name || '').replace(/\.(zip|7z|rar)$/i, '');
      if (stem && entries.has(stem)) { out[rom.id] = path.join(dir, stem); continue; }
      const tid = titleId(rom.fs_name) || titleId(rom.name);
      if (tid) {
        ids ||= new Map([...entries].map((e) => [titleId(e), e]).filter(([k]) => k));
        if (ids.has(tid)) { out[rom.id] = path.join(dir, ids.get(tid)); continue; }
      }
    }
    if (marks[rom.id]) out[rom.id] = MARKED;
  }
  return out;
}
const MARKED = '(marked as installed)';

// ---------------------------------------------------------------- library cache + sync
// The whole library is mirrored locally (Argosy-style): instant startup, offline browsing,
// and a "Resync" that pulls whatever changed on the server.
let library = loadJson(LIBRARY_FILE, null); // { platforms, roms: {pid: [...]}, firstSeen: {id: ts}, syncedAt, base }
let syncing = null;
let installedMap = {};
let playSyncAt = 0; // last play-session sync with RomM (0: do it on the next request)

// Transparent game logo from RomM (ScreenScraper "logo" media, or an ES-DE gamelist marquee)
function logoPath(r) {
  const p = r.ss_metadata?.logo_path || r.gamelist_metadata?.marquee_path || null;
  if (!p) return null;
  return /^(https?:)?\/\//.test(p) || p.startsWith('/assets/') ? p : '/assets/romm/resources/' + p.replace(/^\//, '');
}
function slimRom(r) {
  const md = r.metadatum || {};
  return {
    id: r.id, name: r.name || r.fs_name_no_ext, fs_name: r.fs_name, fs_name_no_ext: r.fs_name_no_ext,
    platform_id: r.platform_id, platform_slug: r.platform_slug, platform_fs_slug: r.platform_fs_slug,
    platform_display_name: r.platform_display_name, fs_size_bytes: r.fs_size_bytes,
    path_cover_small: r.path_cover_small, path_cover_large: r.path_cover_large, url_cover: r.url_cover,
    shot: (r.merged_screenshots || [])[0] || null,
    logo: logoPath(r),
    ra_id: r.ra_id || null,
    has_notes: !!(r.has_notes || r.all_user_notes?.length || r.rom_user?.note_raw_markdown),
    summary: (r.summary || '').slice(0, 400),
    regions: r.regions || [], files: (r.files || []).map((f) => ({ file_name: f.file_name })),
    year: md.first_release_date || null, genres: (md.genres || []).slice(0, 3),
    developer: (md.developers?.[0] || md.companies?.[0] || ''), rating: md.average_rating || null,
    created_at: r.created_at, has_file_on_disk: r.has_file_on_disk !== false,
    // 0.7: series, modes, popularity and length for the automatic collections and filters
    igdb_id: r.igdb_id || null, series: [...new Set(md.franchises || [])].slice(0, 3), modes: md.game_modes || [], players: md.player_count || '',
    votes: r.igdb_metadata?.total_rating_count || 0, hours: hltbHours(r.hltb_metadata?.main_story),
    similar: (r.igdb_metadata?.similar_games || []).slice(0, 12).map((g) => g.id),
    user: userOf(r.rom_user),
  };
}
// HowLongToBeat keeps times in seconds
const hltbHours = (v) => (v > 0 ? Math.round((v > 1000 ? v / 3600 : v) * 10) / 10 : null);
// the signed-in user's own fields for a game in RomM (play status, backlog, playing now, hidden)
function userOf(u) {
  if (!u) return null;
  const o = { status: u.status || null, backlog: !!u.backlogged, playing: !!u.now_playing, hidden: !!u.hidden, played: u.last_played ? Date.parse(u.last_played) || null : null };
  return o.status || o.backlog || o.playing || o.hidden || o.played ? o : null;
}

function publicLibrary() {
  if (!library) return null;
  return {
    platforms: library.platforms.map((p) => ({ ...p, target: platformPath(p) })),
    roms: library.roms,
    firstSeen: library.firstSeen,
    syncedAt: library.syncedAt,
    lastNew: library.lastNew || [],
    collections: library.collections || [],
  };
}

function computeInstalled() {
  const out = {};
  if (!library) return out;
  for (const p of library.platforms) Object.assign(out, installedState(library.roms[p.id] || [], p));
  installedMap = out;
  playSyncAt = 0; // play time can be matched to games now: sync again
  broadcast('installed', out);
  return out;
}

async function syncLibrary() {
  if (syncing) return syncing;
  syncing = (async () => {
    const started = Date.now();
    try {
      broadcast('sync', { state: 'running', label: 'Connecting…', done: 0, total: 0 });
      const platforms = (await api('/api/platforms')).map((p) => ({
        id: p.id, slug: p.slug, fs_slug: p.fs_slug, name: p.name, display_name: p.display_name || p.custom_name || p.name,
        rom_count: p.rom_count || 0, category: p.category || null, family_name: p.family_name || null, generation: p.generation || null,
        size: p.fs_size_bytes || 0, url_logo: p.url_logo || null,
      }));
      const withGames = platforms.filter((p) => p.rom_count > 0);
      const roms = {};
      let i = 0;
      for (const p of withGames) {
        broadcast('sync', { state: 'running', label: p.display_name, done: i, total: withGames.length });
        const list = [];
        for (let offset = 0; ; ) {
          const page = await api('/api/roms', {
            query: {
              platform_ids: p.id, platform_id: p.id, limit: 500, offset, order_by: 'name', order_dir: 'asc',
              with_char_index: false, with_filter_values: false, with_rom_id_index: false, with_files: true,
            },
          });
          const items = Array.isArray(page) ? page : page.items || [];
          list.push(...items.map(slimRom));
          offset += items.length;
          if (Array.isArray(page) || items.length < 500 || offset >= (page.total ?? 0)) break;
        }
        roms[p.id] = list;
        i++;
      }
      const prevSeen = library?.firstSeen || {};
      const firstSync = !library;
      const firstSeen = {};
      const lastNew = [];
      for (const list of Object.values(roms)) {
        for (const r of list) {
          if (prevSeen[r.id]) firstSeen[r.id] = prevSeen[r.id];
          else { firstSeen[r.id] = firstSync ? 1 : started; if (!firstSync) lastNew.push(r.id); }
        }
      }
      const prevCount = library ? Object.values(library.roms).reduce((s, l) => s + l.length, 0) : 0;
      const count = Object.values(roms).reduce((s, l) => s + l.length, 0);
      broadcast('sync', { state: 'running', label: 'Collections', done: withGames.length, total: withGames.length + 1 });
      const collections = [];
      const me = await api('/api/users/me').then((u) => u.id).catch(() => null);
      for (const [kind, ep] of [['user', '/api/collections'], ['smart', '/api/collections/smart']]) {
        try {
          for (const c of await api(ep)) {
            const ids = [...(c.rom_ids || [])];
            // your own collections show even while empty (you just made one in Cartridge)
            const mine = kind === 'user' && (me == null || c.user_id == null || c.user_id === me);
            if (!ids.length && !mine) continue;
            collections.push({ id: `${kind}-${c.id}`, rid: c.id, mine, name: c.name, description: c.description || '', rom_ids: ids, favorite: !!c.is_favorite, smart: kind === 'smart',
              covers: (c.path_covers_small || []).slice(0, 4), cover: c.path_cover_large || c.url_cover || null });
          }
        } catch {}
      }
      collections.sort((a, b) => (b.favorite - a.favorite) || a.name.localeCompare(b.name));
      library = { platforms, roms, firstSeen, syncedAt: Date.now(), base: activeBase, lastNew, collections };
      saveJson(LIBRARY_FILE, library, false);
      computeInstalled();
      const result = { state: 'done', added: lastNew.length, removed: Math.max(0, prevCount + lastNew.length - count), total: count, firstSync };
      broadcast('library', publicLibrary());
      broadcast('sync', result);
      return result;
    } catch (e) {
      broadcast('sync', { state: 'error', error: e.message });
      throw e;
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

// ---------------------------------------------------------------- collections, favourites, play status (0.7)
// Your own collections live in RomM, so every device and RomM's web page see the same ones. RomM
// takes collection changes as form fields, with the games as a JSON list.
async function apiForm(pathname, { method = 'POST', query, fields = {} } = {}) {
  const b = await resolveBase();
  const url = new URL(b + pathname);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) fd.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  const headers = authHeaders();
  const r = await fetch(url, { method, headers, body: fd, signal: AbortSignal.timeout(30000) });
  if (r.status === 401 || r.status === 403) throw new Error("Your RomM sign-in can't change collections. Sign in with your password, or pair again so Cartridge can ask for collection access.");
  if (!r.ok) throw new Error(`RomM error ${r.status} on ${pathname}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}
function saveLib() { saveJson(LIBRARY_FILE, library, false); broadcast('library', publicLibrary()); }
function colById(rid) { return library?.collections?.find((c) => c.rid === rid && !c.smart) || null; }
async function setColRoms(c, ids) {
  const out = await apiForm(`/api/collections/${c.rid}`, { method: 'PUT', fields: { rom_ids: JSON.stringify([...new Set(ids)]), name: c.name } });
  c.rom_ids = out?.rom_ids ? [...out.rom_ids] : [...new Set(ids)];
  saveLib();
  return c;
}
async function newCollection(name, favorite = false) {
  const out = await apiForm('/api/collections', { query: favorite ? { is_favorite: 'true' } : {}, fields: { name, description: favorite ? '' : 'Made in Cartridge' } });
  if (!out?.id) throw new Error('RomM did not create the collection');
  const c = { id: `user-${out.id}`, rid: out.id, mine: true, name: out.name || name, description: out.description || '', rom_ids: [], favorite, smart: false, covers: [], cover: null };
  library.collections = [...(library.collections || []), c].sort((a, b) => (b.favorite - a.favorite) || a.name.localeCompare(b.name));
  saveLib();
  return c;
}
const colHandlers = {
  'col:create': async ({ name, romIds }) => { const c = await newCollection(String(name).trim().slice(0, 80)); return romIds?.length ? setColRoms(c, romIds) : c; },
  'col:add': async ({ rid, romIds }) => { const c = colById(rid); if (!c) throw new Error('Collection not found'); return setColRoms(c, [...c.rom_ids, ...romIds]); },
  'col:remove': async ({ rid, romIds }) => { const c = colById(rid); if (!c) throw new Error('Collection not found'); const drop = new Set(romIds); return setColRoms(c, c.rom_ids.filter((x) => !drop.has(x))); },
  'col:rename': async ({ rid, name }) => { const c = colById(rid); if (!c) throw new Error('Collection not found'); c.name = String(name).trim().slice(0, 80); return setColRoms(c, c.rom_ids); },
  'col:delete': async ({ rid }) => {
    const b = await resolveBase();
    const r = await fetch(`${b}/api/collections/${rid}`, { method: 'DELETE', headers: authHeaders(), signal: AbortSignal.timeout(20000) });
    if (!r.ok && r.status !== 404) throw new Error(r.status === 401 || r.status === 403 ? "Your RomM sign-in can't change collections" : `RomM error ${r.status}`);
    library.collections = library.collections.filter((c) => c.rid !== rid || c.smart); saveLib(); return true;
  },
  // Favourites are RomM's own favourite collection (made on first use)
  'fav:set': async ({ romId, on }) => {
    let c = library?.collections?.find((x) => x.favorite && !x.smart && x.mine);
    if (!c) { if (!on) return false; c = await newCollection('Favourites', true); }
    await setColRoms(c, on ? [...c.rom_ids, romId] : c.rom_ids.filter((x) => x !== romId));
    return on;
  },
  // Play status, backlog, playing now and hidden: RomM's per-user fields for a game
  'rom:user': async ({ romId, data }) => {
    const b = await resolveBase();
    // newer RomM reads the fields at the top level, older RomM under "data": send both
    const r = await fetch(`${b}/api/roms/${romId}/props`, { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, data }), signal: AbortSignal.timeout(20000) });
    if (r.status === 401 || r.status === 403) throw new Error("Your RomM sign-in can't change play status. Sign in with your password or pair again.");
    if (!r.ok) throw new Error(`RomM error ${r.status}`);
    const u = await r.json().catch(() => null);
    const rom = library && Object.values(library.roms).flat().find((x) => x.id === romId);
    if (rom) { rom.user = userOf(u || { ...rom.user, status: data.status ?? rom.user?.status, backlogged: data.backlogged ?? rom.user?.backlog, now_playing: data.now_playing ?? rom.user?.playing, hidden: data.hidden ?? rom.user?.hidden }); saveLib(); }
    return rom?.user || null;
  },
};

// Ask RomM to scan its folders for new files (needs a password login: scans use a web session)
const SCAN_SOURCES = {
  igdb: 'IGDB_API_ENABLED', ss: 'SS_API_ENABLED', moby: 'MOBY_API_ENABLED', ra: 'RA_API_ENABLED',
  launchbox: 'LAUNCHBOX_API_ENABLED', hasheous: 'HASHEOUS_API_ENABLED', playmatch: 'PLAYMATCH_API_ENABLED',
  flashpoint: 'FLASHPOINT_API_ENABLED', hltb: 'HLTB_API_ENABLED', sgdb: 'STEAMGRIDDB_API_ENABLED',
  libretro: 'LIBRETRO_API_ENABLED', steam: 'STEAM_API_ENABLED',
};
async function scanServer() {
  const s = config.server;
  if (s.auth !== 'password' || !s.username) throw new Error('Server scans need username & password sign-in');
  const base = await resolveBase();
  const hb = await fetch(`${base}/api/heartbeat`, { headers: authHeaders() }).then((r) => r.json());
  const flags = hb.METADATA_SOURCES || {};
  const apis = Object.entries(SCAN_SOURCES).filter(([, f]) => flags[f]).map(([k]) => k).concat('gamelist');
  const login = await fetch(`${base}/api/login`, { method: 'POST', headers: authHeaders(), redirect: 'manual' });
  if (!login.ok) throw new Error(`Login for scan failed (HTTP ${login.status})`);
  const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  const { io } = require('socket.io-client');
  const extraHeaders = { Cookie: cookie };
  if (s.cfClientId && s.cfClientSecret) { extraHeaders['CF-Access-Client-Id'] = s.cfClientId; extraHeaders['CF-Access-Client-Secret'] = s.cfClientSecret; }
  return new Promise((resolve, reject) => {
    const sock = io(base, { path: '/ws/socket.io', transports: ['websocket'], extraHeaders, reconnection: false, timeout: 15000 });
    let lastPlatform = '';
    const finish = (fn, v) => { clearTimeout(t); sock.close(); fn(v); };
    const t = setTimeout(() => finish(reject, new Error('Scan timed out')), 4 * 3600e3);
    sock.on('connect', () => {
      broadcast('sync', { state: 'scanning', label: 'Scanning server…' });
      sock.emit('scan', { platforms: [], type: 'quick', apis });
    });
    sock.on('connect_error', (e) => finish(reject, new Error('Could not open scan connection: ' + e.message)));
    sock.on('scan:scanning_platform', (p) => { lastPlatform = p?.display_name || p?.name || ''; broadcast('sync', { state: 'scanning', label: `Scanning ${lastPlatform}` }); });
    sock.on('scan:scanning_rom', (r) => broadcast('sync', { state: 'scanning', label: `Scanning ${lastPlatform}: ${r?.name || r?.fs_name || ''}` }));
    sock.on('scan:done', (stats) => finish(resolve, stats || {}));
    sock.on('scan:done_ko', (msg) => finish(reject, new Error(typeof msg === 'string' ? msg : 'Scan failed')));
  });
}

// ---------------------------------------------------------------- image protocol (auth + disk cache)
async function handleImage(request) {
  const u = new URL(request.url);
  const sl = u.searchParams.get('sys');
  if (sl && u.searchParams.get('png')) {
    try { return new Response(await fsp.readFile(path.join(__dirname, '../build/syslogos', path.basename(sl) + '.png')), { headers: { 'Content-Type': 'image/png' } }); } catch { return new Response('nf', { status: 404 }); }
  }
  if (sl) {
    try { return new Response(await fsp.readFile(path.join(SYSLOGO_DIR, path.basename(sl) + '.svg')), { headers: { 'Content-Type': 'image/svg+xml' } }); } catch { return new Response('nf', { status: 404 }); }
  }
  if (u.searchParams.get('wp')) {
    const f = fs.readdirSync(USER_DATA).find((n) => /^wallpaper\.(png|jpe?g|webp)$/i.test(n));
    if (!f) return new Response('nf', { status: 404 });
    const type = { '.png': 'image/png', '.webp': 'image/webp' }[path.extname(f).toLowerCase()] || 'image/jpeg';
    return new Response(await fsp.readFile(path.join(USER_DATA, f)), { headers: { 'Content-Type': type } });
  }
  const tr = u.searchParams.get('tr');
  if (tr) {
    const p = trophySvc.iconPath(tr);
    try { return new Response(await fsp.readFile(p), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' } }); } catch { return new Response('nf', { status: 404 }); }
  }
  const lf = u.searchParams.get('f');
  if (lf) {
    try { return new Response(await fsp.readFile(path.join(LOGO_DIR, path.basename(lf))), { headers: { 'Content-Type': 'image/png' } }); } catch { return new Response('nf', { status: 404 }); }
  }
  const target = u.searchParams.get('u');
  if (!target) return new Response('bad', { status: 400 });
  const key = crypto.createHash('sha1').update(target).digest('hex');
  const file = path.join(IMG_CACHE, key);
  try {
    const buf = await fsp.readFile(file);
    const type = (await fsp.readFile(file + '.type', 'utf8').catch(() => '')) || 'image/jpeg';
    return new Response(buf, { headers: { 'Content-Type': type, 'Cache-Control': 'max-age=31536000' } });
  } catch {}
  try {
    let url, headers = {};
    if (/^https?:\/\//.test(target)) url = target.replace(/^\/\//, 'https://');
    else { url = (await resolveBase()) + (target.startsWith('/') ? '' : '/') + target; headers = authHeaders(); delete headers.Accept; }
    if (url.startsWith('//')) url = 'https:' + url;
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return new Response('nf', { status: 404 });
    const buf = Buffer.from(await r.arrayBuffer());
    const type = r.headers.get('content-type') || 'image/jpeg';
    fsp.mkdir(IMG_CACHE, { recursive: true }).then(() => Promise.all([fsp.writeFile(file, buf), fsp.writeFile(file + '.type', type)])).catch(() => {});
    return new Response(buf, { headers: { 'Content-Type': type } });
  } catch {
    return new Response('err', { status: 502 });
  }
}

// ---------------------------------------------------------------- logos + custom artwork
// Logos come from (in order) a logo the user picked, RomM's own logo, or SteamGridDB (free key).
// Every logo is prepared here: transparent padding trimmed so sizes can be evened out on screen,
// and near-black logos detected so a white version is picked (or the black one drawn white).
const LOGO_FILE = path.join(USER_DATA, 'logos.json');
const LOGO_DIR = path.join(USER_DATA, 'logos');
const ART_FILE = path.join(USER_DATA, 'artwork.json');
const LOGO_VERSION = 2;
const logoCache = loadJson(LOGO_FILE, {}); // romId -> { v, file, w, h, dark, src, t }
const artOverrides = loadJson(ART_FILE, {}); // romId -> { grid, logo, hero }
let logoSaveT = null;
function saveLogoCache() { clearTimeout(logoSaveT); logoSaveT = setTimeout(() => { try { fs.writeFileSync(LOGO_FILE, JSON.stringify(logoCache)); } catch {} }, 500); }
function saveArt() { try { fs.writeFileSync(ART_FILE, JSON.stringify(artOverrides, null, 1)); } catch {} }
const logoInflight = new Map();
let logoChain = Promise.resolve();
const SGDB_BASE = () => process.env.CARTRIDGE_SGDB_BASE || 'https://www.steamgriddb.com/api/v2';
async function sgdb(pathname) {
  const r = await fetch(SGDB_BASE() + pathname, { headers: { Authorization: 'Bearer ' + config.sgdbKey }, signal: AbortSignal.timeout(12000) });
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('SteamGridDB rejected the API key'), { auth: true });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return j && j.success ? j.data : null;
}
function cleanName(n) { return String(n || '').replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').replace(/\s+/g, ' ').trim(); }
// SteamGridDB's search returns loose matches first sometimes ("skate: recompiled" for Skate 3), so
// rank the results: exact name first, extra words (remaster, demo, mod…) down, verified and a
// matching release year up.
const sgNorm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[™®©]/g, '')
  .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').replace(/^the\s+|,\s*the\b/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
const SG_EXTRA = /\b(recompiled|remaster(ed)?|remake|demo|beta|prototype|mod|hack|fan|port|reloaded|redux|online|collection|definitive|hd|trilogy|bundle|dlc|soundtrack|pack|edition)\b/;
function sgScore(q, g, year, i) {
  const a = sgNorm(q), b = sgNorm(g.name);
  let s = 0;
  if (a === b) s = 100;
  else if (b.startsWith(a + ' ') || a.startsWith(b + ' ')) s = 60 - 6 * Math.abs(b.split(' ').length - a.split(' ').length);
  else { const A = new Set(a.split(' ')), B = new Set(b.split(' ')); const inter = [...A].filter((x) => B.has(x)).length; s = (50 * inter) / new Set([...A, ...B]).size; }
  const extra = b.replace(a, '');
  if (SG_EXTRA.test(extra) && !SG_EXTRA.test(a)) s -= 40;
  if (g.verified) s += 8;
  if (year && g.release_date) s -= Math.min(15, Math.abs(new Date(g.release_date * 1000).getFullYear() - year) * 3);
  return s - i * 0.5; // SteamGridDB's own order breaks ties
}
async function sgdbGames(name, year) {
  const tries = [...new Set([cleanName(name), cleanName(name).split(/:| - /)[0].trim()])].filter((x) => x.length > 1);
  for (const term of tries) {
    const games = await sgdb('/search/autocomplete/' + encodeURIComponent(term));
    if (games && games.length) {
      const ranked = games.map((g, i) => ({ g, s: sgScore(name, g, year, i) })).sort((x, y) => y.s - x.s).map((x) => x.g);
      return ranked.slice(0, 6).map((g) => ({ id: g.id, name: g.name, year: g.release_date ? new Date(g.release_date * 1000).getFullYear() : null }));
    }
  }
  return [];
}
const logoRank = (l) => (l.style === 'official' ? 0 : l.style === 'white' ? 1 : l.style === 'custom' ? 2 : 3) + (l.mime === 'image/png' ? 0 : 0.5);

async function fetchImage(src) {
  let url = src, headers = {};
  if (!/^https?:\/\//.test(src)) { url = (await resolveBase()) + (src.startsWith('/') ? '' : '/') + src; headers = authHeaders(); delete headers.Accept; }
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}
// Trim transparent edges, measure brightness, save a PNG. Returns null if it isn't a usable image.
function prepareLogo(buf, key) {
  const { nativeImage } = require('electron');
  let im = nativeImage.createFromBuffer(buf);
  if (im.isEmpty()) return null;
  let { width: W, height: H } = im.getSize();
  if (W > 900) { im = im.resize({ width: 900, quality: 'best' }); ({ width: W, height: H } = im.getSize()); }
  const px = im.toBitmap(); // BGRA
  let x0 = W, y0 = H, x1 = -1, y1 = -1, lum = 0, sat = 0, wsum = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, a = px[i + 3];
      if (a < 24) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      const b = px[i], g = px[i + 1], r = px[i + 2], w = a / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      lum += w * (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      sat += w * (mx ? (mx - mn) / mx : 0);
      wsum += w;
    }
  }
  if (x1 < 0 || x1 - x0 < 8 || y1 - y0 < 4) return null;
  const crop = im.crop({ x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 });
  fs.mkdirSync(LOGO_DIR, { recursive: true });
  const file = `${key}.png`;
  fs.writeFileSync(path.join(LOGO_DIR, file), crop.toPNG());
  const L = wsum ? lum / wsum : 1, S = wsum ? sat / wsum : 1;
  return { file, w: x1 - x0 + 1, h: y1 - y0 + 1, dark: L < 0.22 && S < 0.35, lum: +L.toFixed(3) };
}
async function logoFromSgdb(id, name) {
  const games = await sgdbGames(name);
  for (const g of games.slice(0, 2)) {
    const logos = await sgdb(`/logos/game/${g.id}?types=static&nsfw=false&humor=false`);
    if (!logos || !logos.length) continue;
    const list = [...logos].sort((a, b) => logoRank(a) - logoRank(b) || (b.score || 0) - (a.score || 0)).slice(0, 5);
    let firstDark = null;
    for (const [i, l] of list.entries()) {
      try {
        const got = prepareLogo(await fetchImage(l.url), `${id}-s${i}`);
        if (!got) continue;
        if (!got.dark) return { ...got, src: l.url };
        firstDark ||= { ...got, src: l.url };
      } catch {}
    }
    if (firstDark) return firstDark; // only black versions exist: the app draws it white
  }
  return null;
}
function logoPublic(c) { return c && c.file ? { url: 'romimg://img/?f=' + encodeURIComponent(c.file) + '&t=' + c.t, w: c.w, h: c.h, dark: c.dark } : null; }
async function logoFor({ id, name, romm }) {
  if (!id) return null;
  const pick = artOverrides[id]?.logo || '';
  const c = logoCache[id];
  const want = pick ? 'pick:' + pick : romm ? 'romm:' + romm : 'sgdb';
  if (c && c.v === LOGO_VERSION && c.want === want && (c.file || Date.now() - c.t < 3 * 864e5)) return logoPublic(c);
  if (want === 'sgdb' && !config.sgdbKey) return null;
  if (logoInflight.has(id)) return logoInflight.get(id);
  const job = (logoChain = logoChain.then(async () => {
    let got = null;
    try {
      if (pick) got = prepareLogo(await fetchImage(pick), `${id}-p`);
      else if (romm) { try { got = prepareLogo(await fetchImage(romm), `${id}-r`); } catch {} }
      if (!got && !pick && config.sgdbKey) got = await logoFromSgdb(id, name);
    } catch (e) { log('logo', name, e.message); if (e.auth) throw e; }
    logoCache[id] = { v: LOGO_VERSION, want, t: Date.now(), ...(got || {}) }; saveLogoCache();
    return logoPublic(logoCache[id]);
  }));
  logoChain = job.catch(() => {});
  logoInflight.set(id, job);
  try { return await job; } finally { logoInflight.delete(id); }
}
// ---------------------------------------------------------------- RetroAchievements
// Web API (retroachievements.org/API) with the user's username + web API key.
// Docs: github.com/RetroAchievements/api-docs. Results are cached briefly (and on disk, so the
// tab still shows something offline).
const RA_BASE = () => process.env.CARTRIDGE_RA_BASE || 'https://retroachievements.org';
const RA_MEDIA = () => process.env.CARTRIDGE_RA_MEDIA || 'https://media.retroachievements.org';
const RA_CACHE_FILE = path.join(USER_DATA, 'retroachievements.json');
const raCache = loadJson(RA_CACHE_FILE, {});
const raMem = new Map();
async function raApi(name, params = {}, auth = config.ra) {
  if (!auth?.user || !auth?.key) throw new Error('Sign in to RetroAchievements first');
  const q = new URLSearchParams({ y: auth.key, u: auth.user, ...params });
  const r = await fetch(`${RA_BASE()}/API/API_${name}.php?${q}`, { headers: { 'User-Agent': `Cartridge/${app.getVersion()}` }, signal: AbortSignal.timeout(15000) });
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('RetroAchievements rejected the username or web API key'), { auth: true });
  if (r.status === 429) throw new Error('RetroAchievements is rate limiting, try again in a minute');
  if (!r.ok) throw new Error('RetroAchievements error ' + r.status);
  const j = await r.json();
  if (j && typeof j === 'object' && !Array.isArray(j) && (j.error || j.Error)) throw Object.assign(new Error(String(j.error || j.Error)), { auth: /key|user|auth/i.test(String(j.error || j.Error)) });
  return j;
}
const raMedia = (p) => (!p ? '' : /^https?:/.test(p) ? p : RA_MEDIA() + (p.startsWith('/') ? '' : '/') + p);
const raBadge = (b, locked) => (b ? `${RA_MEDIA()}/Badge/${b}${locked ? '_lock' : ''}.png` : '');
async function raCached(key, ttl, fn) {
  const m = raMem.get(key);
  if (m && Date.now() - m.t < ttl) return m.v;
  try {
    const v = await fn();
    raMem.set(key, { t: Date.now(), v });
    raCache[key] = { t: Date.now(), v };
    try { fs.writeFileSync(RA_CACHE_FILE, JSON.stringify(raCache)); } catch {}
    return v;
  } catch (e) {
    if (!e.auth && raCache[key]) return { ...raCache[key].v, offline: true };
    throw e;
  }
}
// Links a RetroAchievements game to a library ROM: RomM's ra_id first, then an exact title
// match among ROMs on consoles RetroAchievements supports (only when the title is unique).
function raRomIndex() {
  const byId = new Map(), byTitle = new Map();
  for (const r of library ? Object.values(library.roms).flat() : []) {
    if (r.ra_id) byId.set(Number(r.ra_id), r.id);
    if (RA_CONSOLES[r.platform_slug] ?? RA_CONSOLES[r.platform_fs_slug]) {
      const k = raNorm(r.name);
      byTitle.set(k, byTitle.has(k) ? null : r.id);
    }
  }
  return { get: (gameId, title) => byId.get(Number(gameId)) || (title ? byTitle.get(raNorm(title)) : null) || null };
}
// RetroAchievements system IDs for the consoles it supports (RomM slug -> RA console ID).
// Consoles missing here (PS3, PS4, PS5, Vita, Switch, 3DS, Xbox...) have no RetroAchievements.
const RA_CONSOLES = {
  'genesis-slash-megadrive': 1, genesis: 1, megadrive: 1, n64: 2, snes: 3, sfam: 3, gb: 4, gba: 5, gbc: 6, nes: 7, famicom: 7,
  tg16: 8, 'pc-engine': 8, pcengine: 8, segacd: 9, sega32: 10, 'sega-32x': 10, sms: 11, psx: 12, lynx: 13, ngp: 14, ngpc: 14,
  gamegear: 15, ngc: 16, jaguar: 17, nds: 18, ps2: 21, 'pokemon-mini': 24, atari2600: 25, arcade: 27, virtualboy: 28, msx: 29,
  sg1000: 33, saturn: 39, dc: 40, psp: 41, '3do': 43, colecovision: 44, intellivision: 45, vectrex: 46, atari7800: 51,
  wonderswan: 53, 'wonderswan-color': 53, 'neo-geo-cd': 56, 'turbografx-cd': 76, 'pc-engine-cd': 76, 'nintendo-dsi': 78,
};
const raNorm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').replace(/^the\s+|,\s*the\b/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
async function raGameList(consoleId) {
  const key = 'list:' + consoleId;
  const c = raCache[key];
  if (c && Date.now() - c.t < 7 * 864e5) return c.v;
  const list = await raApi('GetGameList', { i: consoleId, f: 1 });
  const v = (Array.isArray(list) ? list : []).map((g) => [raNorm(g.Title), g.ID]);
  raCache[key] = { t: Date.now(), v };
  try { fs.writeFileSync(RA_CACHE_FILE, JSON.stringify(raCache)); } catch {}
  return v;
}
async function raForRom({ ra_id, name, slug, fs_slug }) {
  if (!config.ra?.user || !config.ra?.key) return null;
  const consoleId = RA_CONSOLES[slug] ?? RA_CONSOLES[fs_slug];
  if (!consoleId) return null; // no RetroAchievements for this console
  if (ra_id) return Number(ra_id);
  const n = raNorm(name);
  if (!n) return null;
  const list = await raGameList(consoleId);
  const exact = list.find(([t]) => t === n);
  if (exact) return exact[1];
  const base = raNorm(String(name).split(/:| - /)[0]);
  const partial = list.filter(([t]) => t === base || t.startsWith(n + ' ') || n.startsWith(t + ' '));
  return partial.length === 1 ? partial[0][1] : null;
}
async function raOverview({ force } = {}) {
  if (force) raMem.clear();
  return raCached('overview:' + config.ra.user, 120000, async () => {
    const [profile, recent, played] = await Promise.all([
      raApi('GetUserProfile'),
      raApi('GetUserRecentAchievements', { m: 60 * 24 * 30 }).catch(() => []),
      raApi('GetUserRecentlyPlayedGames', { c: 30 }).catch(() => []),
    ]);
    const idx = raRomIndex();
    return {
      user: profile.User || config.ra.user,
      avatar: raMedia(profile.UserPic),
      points: profile.TotalPoints || 0,
      softPoints: profile.TotalSoftcorePoints || 0,
      truePoints: profile.TotalTruePoints || 0,
      presence: profile.RichPresenceMsg || '',
      memberSince: profile.MemberSince || '',
      recent: (Array.isArray(recent) ? recent : []).map((a) => ({
        id: a.AchievementID, title: a.Title, desc: a.Description, points: a.Points, date: a.Date, hardcore: !!a.HardcoreMode,
        badge: raMedia(a.BadgeURL) || raBadge(a.BadgeName), game: a.GameTitle, gameId: a.GameID, console: a.ConsoleName, gameIcon: raMedia(a.GameIcon), romId: idx.get(a.GameID, a.GameTitle),
      })),
      played: (Array.isArray(played) ? played : []).map((g) => ({
        gameId: g.GameID, title: g.Title, console: g.ConsoleName, icon: raMedia(g.ImageIcon), boxart: raMedia(g.ImageBoxArt), lastPlayed: g.LastPlayed,
        total: g.NumPossibleAchievements ?? g.AchievementsTotal ?? 0, earned: g.NumAchieved || 0, earnedHc: g.NumAchievedHardcore || 0,
        score: g.ScoreAchieved || 0, possible: g.PossibleScore || 0, romId: idx.get(g.GameID, g.Title),
      })),
    };
  });
}
async function raGame({ gameId, force }) {
  if (force) raMem.delete(`game:${config.ra.user}:${gameId}`);
  return raCached(`game:${config.ra.user}:${gameId}`, 120000, async () => {
    const g = await raApi('GetGameInfoAndUserProgress', { g: gameId, a: 1 });
    const list = Object.values(g.Achievements || {}).map((a) => ({
      id: a.ID, title: a.Title, desc: a.Description, points: a.Points, type: a.type || null, order: a.DisplayOrder || 0,
      earned: a.DateEarned || null, earnedHc: a.DateEarnedHardcore || null, rarity: g.NumDistinctPlayers ? Math.round((a.NumAwarded / g.NumDistinctPlayers) * 1000) / 10 : null,
      badge: raBadge(a.BadgeName, !(a.DateEarned || a.DateEarnedHardcore)),
    })).sort((a, b) => a.order - b.order || a.id - b.id);
    return {
      gameId: g.ID, title: g.Title, console: g.ConsoleName, icon: raMedia(g.ImageIcon), boxart: raMedia(g.ImageBoxArt), ingame: raMedia(g.ImageIngame),
      total: g.NumAchievements || list.length, earned: g.NumAwardedToUser || 0, earnedHc: g.NumAwardedToUserHardcore || 0,
      completion: g.UserCompletion || '', award: g.HighestAwardKind || null, achievements: list, romId: raRomIndex().get(g.ID, g.Title),
    };
  });
}

// Console logos: white SVG wordmarks from the open-source Art Book Next theme for ES-DE
// (github.com/anthonycaccese/art-book-next-es-de), fetched on first use and cached. Logos are
// trademarks of their owners. Anything missing falls back to the console's name.
const SYSLOGO_DIR = path.join(USER_DATA, 'syslogos');
const SYSLOGO_BASE = 'https://raw.githubusercontent.com/anthonycaccese/art-book-next-es-de/main/_inc/systems/logos/';
const sysLogoInflight = new Map();
async function sysLogo({ slug, fs_slug }) {
  const names = [...new Set([...(PLATFORM_MAP[slug] || []), ...(PLATFORM_MAP[fs_slug] || []), fs_slug, slug].filter(Boolean))].filter((n) => /^[a-z0-9_-]+$/i.test(n));
  const key = names[0];
  if (!key) return null;
  // bundled logos (PS5: the wordmark without the PlayStation symbol)
  for (const n of [slug, fs_slug]) if (n && fs.existsSync(path.join(__dirname, '../build/syslogos', n + '.png'))) return 'romimg://img/?sys=' + encodeURIComponent(n) + '&png=1';
  const file = path.join(SYSLOGO_DIR, key + '.svg'), miss = file + '.none';
  if (fs.existsSync(file)) return 'romimg://img/?sys=' + encodeURIComponent(key);
  try { if (Date.now() - fs.statSync(miss).mtimeMs < 7 * 864e5) return null; } catch {}
  if (sysLogoInflight.has(key)) return sysLogoInflight.get(key);
  const job = (async () => {
    for (const n of names) {
      try {
        const r = await fetch(SYSLOGO_BASE + n + '.svg', { signal: AbortSignal.timeout(10000) });
        if (!r.ok) continue;
        const svg = await r.text();
        if (!/<svg[\s>]/i.test(svg)) continue;
        fs.mkdirSync(SYSLOGO_DIR, { recursive: true });
        fs.writeFileSync(file, svg);
        return 'romimg://img/?sys=' + encodeURIComponent(key);
      } catch {}
    }
    try { fs.mkdirSync(SYSLOGO_DIR, { recursive: true }); fs.writeFileSync(miss, ''); } catch {}
    return null;
  })();
  sysLogoInflight.set(key, job);
  try { return await job; } finally { sysLogoInflight.delete(key); }
}

// Fetch all: prepare logos for the whole library in the background, reporting progress.
let fetchAll = null; // { done, total, found, stop }
async function fetchAllLogos() {
  if (fetchAll) return { running: true };
  const roms = library ? Object.values(library.roms).flat() : [];
  fetchAll = { done: 0, total: roms.length, found: 0, stop: false };
  const report = (state) => broadcast('logos-progress', { state, done: fetchAll.done, total: fetchAll.total, found: fetchAll.found });
  report('running');
  let last = 0;
  try {
    for (const r of roms) {
      if (fetchAll.stop) break;
      const romm = r.logo || '';
      try { if (await logoFor({ id: r.id, name: r.name, romm })) fetchAll.found++; } catch (e) { if (e.auth) { report('error'); throw e; } }
      fetchAll.done++;
      if (Date.now() - last > 250) { last = Date.now(); report('running'); }
    }
    report(fetchAll.stop ? 'stopped' : 'done');
    return { done: fetchAll.done, found: fetchAll.found };
  } finally { fetchAll = null; }
}

// Artwork picker: SteamGridDB images of one kind for a game (by name, or a chosen SGDB game id)
// Square game icons from SteamGridDB (used for trophy games). Cached; null when there is none.
const ICON_FILE = path.join(USER_DATA, 'gameicons2.json'); // v2: square icons only
const iconCache = loadJson(ICON_FILE, {});
const iconInflight = new Map();
// A full rounded-square icon: square, big enough, and no see-through corners (older round
// icons have transparent corners, which look wrong in a square tile)
function iconOpaque(buf) {
  const { nativeImage } = require('electron');
  const im = nativeImage.createFromBuffer(buf);
  const { width: w, height: h } = im.getSize();
  if (!w || !h || w < 96 || Math.abs(w - h) > Math.max(w, h) * 0.08) return false;
  const bmp = im.toBitmap(); // BGRA
  const a = (x, y) => bmp[(y * w + x) * 4 + 3];
  const m = Math.max(1, Math.round(w * 0.04)), n = Math.round(h * 0.04);
  return [[m, n], [w - 1 - m, n], [m, h - 1 - n], [w - 1 - m, h - 1 - n]].every(([x, y]) => a(x, y) > 200);
}
async function pickIcon(gid) {
  const icons = (await sgdb(`/icons/game/${gid}?types=static&nsfw=false&humor=false`)) || [];
  const cands = icons.filter((i) => i.mime === 'image/png' || /\.png($|\?)/i.test(i.url || ''))
    .sort((a, b) => (Math.abs(a.width - a.height) - Math.abs(b.width - b.height)) || (b.width - a.width) || ((b.score || 0) - (a.score || 0)))
    .slice(0, 8);
  for (const c of cands) {
    try { if (iconOpaque(await fetchImage(c.url))) return c.url; } catch {}
  }
  return null;
}
async function gameIcon({ key, name, year }) {
  if (!config.sgdbKey || !name) return null;
  const k = String(key || name);
  const c = iconCache[k];
  if (c && (c.custom || c.url || Date.now() - c.t < 7 * 864e5)) return c.url || null;
  if (iconInflight.has(k)) return iconInflight.get(k);
  const job = (async () => {
    let url = null;
    try {
      const games = await sgdbGames(String(name).replace(/[™®©]/g, '').replace(/\s+trophies$/i, ''), year);
      if (games[0]) {
        for (const g of games.slice(0, 2)) {
          url = await pickIcon(g.id);
          if (url) break;
        }
      }
    } catch (e) { return null; } // offline or rejected key: try again next time
    iconCache[k] = { url, t: Date.now() };
    try { fs.writeFileSync(ICON_FILE, JSON.stringify(iconCache)); } catch {}
    return url;
  })();
  iconInflight.set(k, job);
  try { return await job; } finally { iconInflight.delete(k); }
}
async function sgdbArt({ name, kind, gameId }) {
  if (!config.sgdbKey) throw new Error('Add a SteamGridDB API key in Settings → Look & feel first.');
  const games = await sgdbGames(name);
  const gid = gameId || games[0]?.id;
  if (!gid) return { games, gameId: null, images: [] };
  const ep = kind === 'grid' ? `/grids/game/${gid}?dimensions=600x900,342x482,660x930&types=static&nsfw=false&humor=false`
    : kind === 'hero' ? `/heroes/game/${gid}?types=static&nsfw=false&humor=false`
    : kind === 'icon' ? `/icons/game/${gid}?types=static&nsfw=false&humor=false&mimes=image/png`
    : `/logos/game/${gid}?types=static&nsfw=false&humor=false`;
  const imgs = (await sgdb(ep)) || [];
  // backgrounds: sharpest first, so the top picks look right on a TV
  const sorted = kind === 'logo' ? [...imgs].sort((a, b) => logoRank(a) - logoRank(b) || (b.score || 0) - (a.score || 0))
    : kind === 'hero' ? [...imgs].sort((a, b) => ((b.width || 0) >= 1920) - ((a.width || 0) >= 1920) || (b.width || 0) - (a.width || 0) || (b.score || 0) - (a.score || 0))
    : [...imgs].sort((a, b) => (b.score || 0) - (a.score || 0));
  return { games, gameId: gid, images: sorted.slice(0, 40).map((i) => ({ url: i.url, thumb: i.thumb || i.url, w: i.width, h: i.height, style: i.style })) };
}
async function setArt({ id, kind, url }) {
  const o = artOverrides[id] || (artOverrides[id] = {});
  if (url) o[kind] = url; else delete o[kind];
  if (!Object.keys(o).length) delete artOverrides[id];
  saveArt();
  if (kind === 'logo') delete logoCache[id];
  return artOverrides[id] || {};
}

// ---------------------------------------------------------------- downloads
const queue = []; // items
let nextId = 1;
let psbId = null;

function publicItem(it) {
  const { abort, ...rest } = it;
  return rest;
}
function emitQueue() { broadcast('downloads', queue.map(publicItem)); }
let emitTimer = null;
function emitQueueThrottled() {
  if (emitTimer) return;
  emitTimer = setTimeout(() => { emitTimer = null; emitQueue(); }, 250);
}

function updatePowerBlock() {
  const active = queue.some((q) => q.status === 'downloading' || q.status === 'queued');
  if (active && psbId === null) psbId = powerSaveBlocker.start('prevent-app-suspension');
  if (!active && psbId !== null) { powerSaveBlocker.stop(psbId); psbId = null; }
}

const DISC_EXT = new Set(['chd', 'cue', 'gdi', 'cdi', 'ccd', 'mds', 'iso', 'pbp', 'cso', 'rvz', 'wbfs']);
const DESCRIPTOR = new Set(['cue', 'gdi', 'ccd', 'mds']);

function enqueue(job) {
  const existing = queue.find((q) => q.romId === job.romId && ['queued', 'downloading'].includes(q.status));
  if (existing) return existing.id;
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].romId === job.romId) queue.splice(i, 1);
  const it = { id: nextId++, status: 'queued', received: 0, total: job.size || 0, speed: 0, error: null, addedAt: Date.now(), ...job };
  queue.push(it);
  emitQueue();
  pump();
  return it.id;
}

function pump() {
  const running = queue.filter((q) => q.status === 'downloading' || q.running).length;
  const free = Math.max(1, config.downloads.concurrency || 1) - running;
  queue.filter((q) => q.status === 'queued' && !q.running).slice(0, Math.max(0, free)).forEach((it) => runJob(it));
  updatePowerBlock();
}

// Speed limit (Settings → Downloads), shared by every download running at once
let rateNext = 0; // when the bytes sent so far would have finished at the limit
async function rateWait(n) {
  const lim = (config.downloads.limitMBs || 0) * 1048576;
  if (!lim) return;
  const now = Date.now();
  rateNext = Math.max(rateNext, now) + (n / lim) * 1000;
  if (rateNext - now > 5) await new Promise((r) => setTimeout(r, rateNext - now));
}

async function downloadTo(url, dest, it, onBytes) {
  const part = dest + '.part';
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  let start = 0;
  try { start = (await fsp.stat(part)).size; } catch {}
  const headers = authHeaders();
  delete headers.Accept;
  if (start > 0) headers.Range = `bytes=${start}-`;
  const r = await fetch(url, { headers, signal: it.abort.signal });
  if (r.status === 416) { start = 0; await fsp.rm(part, { force: true }); return downloadTo(url, dest, it, onBytes); }
  if (!r.ok) throw new Error(r.status === 404 ? 'File not found on server' : `HTTP ${r.status}`);
  const resumed = r.status === 206 && start > 0;
  if (resumed) onBytes(start);
  const ws = fs.createWriteStream(part, { flags: resumed ? 'a' : 'w' });
  const body = Readable.fromWeb(r.body);
  await pipeline(body, async function* (src) { for await (const chunk of src) { await rateWait(chunk.length); onBytes(chunk.length); yield chunk; } }, ws);
  await fsp.rename(part, dest);
}

// Checksums: RomM keeps a size, md5 and sha1 for every file. Archives (zip, 7z, rar) are hashed by
// their unpacked contents and CHDs by their own embedded hash, so those only get the size check.
// Consoles RomM doesn't hash (PS4, Switch...) have no hashes and also only get the size check.
const HASH_BY_CONTENTS = new Set(['zip', '7z', 'rar', 'chd']);
async function checkFile(file, f, it) {
  if (!f) return null;
  const st = await fsp.stat(file).catch(() => null);
  if (!st) return { why: 'missing', got: 'missing' };
  if (f.file_size_bytes && st.size !== f.file_size_bytes) return { why: 'size', got: 'size:' + st.size };
  const want = f.md5_hash ? ['md5', f.md5_hash] : f.sha1_hash ? ['sha1', f.sha1_hash] : null;
  if (!want || HASH_BY_CONTENTS.has(path.extname(file).slice(1).toLowerCase())) return null;
  it.currentFile = 'Checking ' + path.basename(file);
  emitQueueThrottled();
  const h = crypto.createHash(want[0]);
  for await (const chunk of fs.createReadStream(file, { highWaterMark: 1 << 20 })) {
    if (it.abort.signal.aborted) throw new Error('aborted');
    h.update(chunk);
  }
  const got = h.digest('hex');
  return got === String(want[1]).toLowerCase() ? null : { why: 'hash', got };
}
// Damaged files are deleted, so Retry downloads them again instead of skipping them as complete.
// If the retry brings exactly the same file, the server has it that way and RomM's checksum is out
// of date (the file changed after RomM scanned it): keep it and say so instead of failing forever.
const lastBad = new Map(); // file -> what the previous attempt got
async function checkFiles(pairs, it) {
  const bad = [];
  for (const [file, f] of pairs) {
    const r = await checkFile(file, f, it);
    if (!r) { lastBad.delete(file); continue; }
    if (r.why !== 'missing' && lastBad.get(file) === r.got) { lastBad.delete(file); it.notice = 'stale'; log('download kept, RomM checksum out of date', path.basename(file)); continue; }
    lastBad.set(file, r.got);
    bad.push([file, r.why]);
  }
  it.currentFile = null;
  if (!bad.length) return;
  for (const [file] of bad) await fsp.rm(file, { force: true }).catch(() => {});
  log('download damaged', bad.map(([f, w]) => path.basename(f) + ':' + w).join(', '));
  throw new Error(`Damaged download: ${path.basename(bad[0][0])}${bad.length > 1 ? ` and ${bad.length - 1} more` : ''} didn't match RomM's checksum. Retry to download again.`);
}

// PS4/PS5 zips: unpacked into <console folder>/<zip name>/, which is also how installed games are
// recognised. When everything in the zip sits in one folder, its contents go straight in (no
// folder inside a folder). Unpacking goes to a ".partial" folder first, and the zip is deleted
// only once every file is out. yauzl reads zip64, which games over 4 GB need.
function openZip(file) { return new Promise((ok, bad) => require('yauzl').open(file, { lazyEntries: true, autoClose: false }, (e, z) => (e ? bad(e) : ok(z)))); }
function zipEntries(z) {
  return new Promise((ok, bad) => {
    const list = [];
    z.on('entry', (e) => { list.push(e); z.readEntry(); });
    z.on('end', () => ok(list));
    z.on('error', bad);
    z.readEntry();
  });
}
async function unzipGame(zipPath, target, it) {
  const dest = path.join(target, path.basename(zipPath).replace(/\.zip$/i, ''));
  const tmp = dest + '.partial';
  const z = await openZip(zipPath);
  try {
    const entries = await zipEntries(z);
    const names = entries.map((e) => e.fileName).filter((n) => !/^__MACOSX\//.test(n));
    const tops = new Set(names.map((n) => n.split('/')[0]));
    const strip = tops.size === 1 && names.every((n) => n.includes('/')) ? [...tops][0] + '/' : '';
    const total = entries.reduce((s, e) => s + (e.uncompressedSize || 0), 0);
    const free = await fsp.statfs(target).then((st) => st.bavail * st.bsize).catch(() => Infinity);
    if (total > free) throw new Error(`Not enough space to unpack: it needs ${Math.ceil(total / 1e9)} GB and the drive has ${Math.floor(free / 1e9)} GB free. The zip is kept, so free up space and press Retry.`);
    await fsp.rm(tmp, { recursive: true, force: true });
    await fsp.mkdir(tmp, { recursive: true });
    let done = 0, lastPct = -1;
    for (const e of entries) {
      if (it.abort.signal.aborted) throw new Error('aborted');
      if (/^__MACOSX\//.test(e.fileName)) continue;
      const rel = strip && e.fileName.startsWith(strip) ? e.fileName.slice(strip.length) : e.fileName;
      if (!rel) continue;
      const out = path.join(tmp, rel);
      if (!path.resolve(out).startsWith(path.resolve(tmp) + path.sep)) throw new Error('Unsafe file path in zip');
      if (/\/$/.test(e.fileName)) { await fsp.mkdir(out, { recursive: true }); continue; }
      await fsp.mkdir(path.dirname(out), { recursive: true });
      const rs = await new Promise((ok, bad) => z.openReadStream(e, (err, s) => (err ? bad(err) : ok(s))));
      rs.on('data', (c) => {
        done += c.length;
        const pct = total ? Math.floor((done / total) * 100) : 0;
        if (pct !== lastPct) { lastPct = pct; it.currentFile = `Extracting ${pct}%`; emitQueueThrottled(); }
      });
      await pipeline(rs, fs.createWriteStream(out), { signal: it.abort.signal });
    }
  } catch (e) {
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
    throw e;
  } finally { z.close(); }
  await fsp.rm(dest, { recursive: true, force: true });
  await fsp.rename(tmp, dest);
  await fsp.rm(zipPath, { force: true });
  it.currentFile = null;
  log('unpacked', path.basename(zipPath));
  return dest;
}

async function runJob(it) {
  it.status = 'downloading';
  it.running = true; // until this run has fully stopped: Resume must not start a second run on the same files
  const ac = (it.abort = new AbortController());
  it.error = null;
  it.notice = null;
  emitQueue();
  const base = await resolveBase();
  let lastT = Date.now(), lastB = 0;
  try {
    const rom = await api(`/api/roms/${it.romId}`);
    const target = platformPath({ slug: rom.platform_slug, fs_slug: rom.platform_fs_slug }).path;
    if (!target) throw new Error('No folder set for this platform. Set it in Settings.');
    await fsp.mkdir(target, { recursive: true });
    const files = (rom.files || []).slice().sort((a, b) => a.full_path.localeCompare(b.full_path));
    const romPrefix = rom.full_path + '/';
    it.total = files.reduce((s, f) => s + (f.file_size_bytes || 0), 0) || rom.fs_size_bytes || 0;
    it.received = 0;

    // Resume: count bytes of files already completed
    const onBytes = (n) => {
      it.received += n;
      const now = Date.now();
      if (now - lastT >= 1000) { it.speed = (it.received - lastB) / ((now - lastT) / 1000); lastT = now; lastB = it.received; }
      emitQueueThrottled();
    };

    let finalPath;
    const single = files.length <= 1 && (rom.has_simple_single_file || (config.downloads.flattenSingleFile && rom.has_nested_single_file) || files.length === 0);
    if (single) {
      const fname = files[0]?.file_name || rom.fs_name;
      finalPath = path.join(target, fname);
      const url = files[0]
        ? `${base}/api/roms/${files[0].id}/files/content/${encodeURIComponent(fname)}`
        : `${base}/api/roms/${rom.id}/content/${encodeURIComponent(fname)}`;
      // already here and complete (a retry after unpacking failed): don't download it again
      const have = await fsp.stat(finalPath).catch(() => null);
      if (have && files[0]?.file_size_bytes && have.size === files[0].file_size_bytes) onBytes(have.size);
      else {
        try { await downloadTo(url, finalPath, it, onBytes); }
        catch (e) {
          if (!files[0] || !/not found|404/.test(e.message)) throw e;
          await downloadTo(`${base}/api/roms/${rom.id}/content/${encodeURIComponent(fname)}`, finalPath, it, onBytes);
        }
      }
      await checkFiles([[finalPath, files[0]]], it);
      // PS4 and PS5 games come as zips and are played from a folder: unpack, then drop the zip
      if (isFolderSystem(rom) && /\.zip$/i.test(finalPath)) finalPath = await unzipGame(finalPath, target, it);
    } else {
      // Multi-file: mirror the server folder, one file at a time (resumable)
      const folder = path.join(target, rom.fs_name);
      for (const f of files) {
        if (it.abort.signal.aborted) throw new Error('aborted');
        const rel = f.full_path.startsWith(romPrefix) ? f.full_path.slice(romPrefix.length) : f.file_name;
        const dest = path.join(folder, rel);
        if (!dest.startsWith(folder)) throw new Error('Unsafe file path from server');
        const st = await fsp.stat(dest).catch(() => null);
        if (st && st.size === f.file_size_bytes) { onBytes(st.size); continue; }
        it.currentFile = rel;
        await downloadTo(`${base}/api/roms/${f.id}/files/content/${encodeURIComponent(f.file_name)}`, dest, it, onBytes);
      }
      it.currentFile = null;
      await checkFiles(files.map((f) => [path.join(folder, f.full_path.startsWith(romPrefix) ? f.full_path.slice(romPrefix.length) : f.file_name), f]), it);
      finalPath = folder;
      // Multi-disc: generate an .m3u if the server has none
      const exts = files.map((f) => (f.file_name.split('.').pop() || '').toLowerCase());
      const hasM3u = exts.includes('m3u');
      const hasDescriptor = exts.some((e) => DESCRIPTOR.has(e));
      const discs = files.filter((f) => {
        const e = (f.file_name.split('.').pop() || '').toLowerCase();
        if (e === 'm3u') return false;
        return hasDescriptor ? DESCRIPTOR.has(e) || e === 'chd' : DISC_EXT.has(e);
      });
      let m3uName = null;
      if (hasM3u) m3uName = files.find((f) => f.file_name.toLowerCase().endsWith('.m3u')).file_name;
      else if (discs.length >= 2) {
        m3uName = `${rom.fs_name}.m3u`;
        const lines = discs.map((f) => (f.full_path.startsWith(romPrefix) ? f.full_path.slice(romPrefix.length) : f.file_name));
        await fsp.writeFile(path.join(folder, m3uName), lines.join('\n') + '\n');
      }
      // ES-DE "directory as file": Game.m3u/ containing Game.m3u
      if (m3uName && config.downloads.esdeM3uFolders && !rom.fs_name.toLowerCase().endsWith('.m3u')) {
        const dirName = `${rom.fs_name}.m3u`;
        if (m3uName !== dirName) await fsp.rename(path.join(folder, m3uName), path.join(folder, dirName));
        const newFolder = path.join(target, dirName);
        await fsp.rm(newFolder, { recursive: true, force: true });
        await fsp.rename(folder, newFolder);
        finalPath = newFolder;
      }
    }
    it.status = 'done';
    it.received = it.total;
    it.path = finalPath;
    manifest[rom.id] = { path: finalPath, platformSlug: rom.platform_slug, name: rom.name || rom.fs_name, at: Date.now() };
    saveManifest();
    installedMap[rom.id] = finalPath;
    broadcast('installed-changed', { romId: rom.id, path: finalPath });
    try { if (steamMgr.onDownloaded(rom.id)) broadcast('steam-auto', { romId: rom.id, name: rom.name, action: 'add' }); } catch (e) { log('steam auto add', e.message); }
  } catch (e) {
    // stopped on purpose: keep a status set since (paused, or queued again by Resume)
    if (ac.signal.aborted) { if (!['paused', 'queued'].includes(it.status)) it.status = 'cancelled'; }
    else { it.status = 'error'; it.error = e.message; }
  }
  it.running = false;
  it.speed = 0;
  emitQueue();
  pump();
}

async function downloadBios(platformId, slug) {
  const list = await api('/api/firmware', { query: { platform_id: platformId } });
  const base = await resolveBase();
  let dir = config.biosPath;
  if (!dir) throw new Error('Set a BIOS folder in Settings first.');
  await fsp.mkdir(dir, { recursive: true });
  const done = [];
  for (const f of list) {
    const dest = path.join(dir, f.file_name);
    if (fs.existsSync(dest)) { done.push({ name: f.file_name, skipped: true }); continue; }
    const fake = { abort: new AbortController() };
    await downloadTo(`${base}/api/firmware/${f.id}/content/${encodeURIComponent(f.file_name)}`, dest, fake, () => {});
    done.push({ name: f.file_name });
  }
  return { count: list.length, files: done, dir };
}

// ---------------------------------------------------------------- storage manager
// Like Steam's: each drive with what Cartridge's games use, what else uses it and what is free, and
// every game on this device by size. Sizes are measured on disk (folders walked) and cached by mtime.
const sizeCache = new Map(); // path -> { m, size }
async function sizeOnDisk(p) {
  const st = await fsp.stat(p).catch(() => null);
  if (!st) return 0;
  if (!st.isDirectory()) return st.size;
  const c = sizeCache.get(p);
  if (c && c.m === st.mtimeMs) return c.size;
  let size = 0;
  const walk = async (d, depth) => {
    for (const e of await fsp.readdir(d, { withFileTypes: true }).catch(() => [])) {
      const q = path.join(d, e.name);
      if (e.isDirectory() && depth < 12) await walk(q, depth + 1);
      else if (e.isFile()) size += (await fsp.stat(q).catch(() => ({ size: 0 }))).size;
    }
  };
  await walk(p, 0);
  sizeCache.set(p, { m: st.mtimeMs, size });
  return size;
}
function mounts() {
  try {
    return fs.readFileSync('/proc/mounts', 'utf8').split('\n').map((l) => l.split(' ')[1]).filter(Boolean)
      .map((m) => m.replace(/\\040/g, ' ')).sort((a, b) => b.length - a.length);
  } catch { return ['/']; }
}
function driveOf(p, list) {
  let real; try { real = fs.realpathSync(p); } catch { real = p; }
  const mount = list.find((m) => real === m || real.startsWith(m.endsWith('/') ? m : m + '/')) || '/';
  const name = path.basename(mount);
  const internal = mount === '/' || /^\/(home|var|var\/home|sysroot)$/.test(mount);
  return { mount, label: internal ? 'This device' : name || mount };
}
async function storageOverview() {
  const list = mounts();
  const drives = new Map();
  const addDrive = async (p) => {
    if (!p) return null;
    let d = p; while (d && !isDir(d)) { const up = path.dirname(d); if (up === d) break; d = up; }
    const dv = driveOf(d || '/', list);
    if (!drives.has(dv.mount)) {
      let free = 0, total = 0;
      try { const st = await fsp.statfs(dv.mount); free = st.bavail * st.bsize; total = st.blocks * st.bsize; } catch {}
      drives.set(dv.mount, { ...dv, free, total, games: 0, count: 0, consoles: [] });
    }
    return drives.get(dv.mount);
  };
  await addDrive(config.romsRoot);
  // every drive a console downloads to (custom console folders can sit on other drives)
  for (const p of library?.platforms || []) {
    if (!(library.roms[p.id] || []).length) continue;
    const t = platformPath(p).path;
    const dv = t && (await addDrive(t));
    if (dv && !dv.consoles.includes(p.display_name)) dv.consoles.push(p.display_name);
  }
  const roms = new Map(library ? Object.values(library.roms).flat().map((r) => [r.id, r]) : []);
  const games = [];
  for (const [id, p] of Object.entries(installedMap)) {
    if (!p || p === MARKED) continue;
    const r = roms.get(Number(id));
    const dv = await addDrive(p);
    const size = await sizeOnDisk(p);
    dv.games += size; dv.count++;
    games.push({ romId: Number(id), name: r?.name || path.basename(p), platform: r?.platform_display_name || '', cover: r ? r.path_cover_small || r.url_cover || null : null, path: p, size, at: manifest[id]?.at || 0, drive: dv.mount });
  }
  return { drives: [...drives.values()].sort((a, b) => ((b.label === 'This device') - (a.label === 'This device')) || b.total - a.total), games };
}

// ---------------------------------------------------------------- self-update (GitHub Releases)
let updateState = { state: 'idle' };
let autoUpdater = null;
function setupUpdater() {
  if (!app.isPackaged || !process.env.APPIMAGE) return; // only the real AppImage can replace itself
  try { ({ autoUpdater } = require('electron-updater')); } catch { return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  const set = (s) => { updateState = s; broadcast('update', { ...s, supported: true }); };
  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => set({ state: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => set({ ...updateState, state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-not-available', () => set({ state: 'current', version: app.getVersion() }));
  autoUpdater.on('update-downloaded', (i) => set({ state: 'ready', version: i.version }));
  autoUpdater.on('error', (e) => set({ state: 'error', error: String(e?.message || e).slice(0, 200) }));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 8000);
  setInterval(check, 6 * 3600e3);
}

// ---------------------------------------------------------------- controller detection
// Steam Input shows apps a virtual Xbox 360 pad (Valve 28de:11ff). The real controllers are still
// listed by Linux, so read those to draw the right button icons.
const PADS = [
  [/^054c:/, 'playstation', 'PlayStation controller'],
  [/^057e:/, 'nintendo', 'Nintendo controller'],
  [/^28de:1205$/, 'steam', 'Steam Deck'],
  [/^28de:(1102|1142|1101)$/, 'steam', 'Steam Controller'],
  [/^28de:/, 'steam', 'Steam controller'],
  [/^045e:/, 'xbox', 'Xbox controller'],
  [/^0b05:/, 'xbox', 'ROG Ally'],
  [/^17ef:/, 'xbox', 'Legion Go'],
  [/^2dc8:/, 'xbox', '8BitDo controller'],
];
function detectPad() {
  let txt = '';
  try { txt = fs.readFileSync('/proc/bus/input/devices', 'utf8'); } catch { return null; }
  const found = [];
  for (const block of txt.split(/\n\s*\n/)) {
    const I = block.match(/^I: Bus=(\w+) Vendor=(\w+) Product=(\w+)/m);
    const N = block.match(/^N: Name="([^"]*)"/m);
    const H = block.match(/^H: Handlers=(.*)$/m);
    if (!I || !H || !/\bjs\d+/.test(H[1])) continue; // controllers only
    const id = `${I[2]}:${I[3]}`.toLowerCase();
    if (id === '28de:11ff' || /virtual|x-box 360 pad \d/i.test(N?.[1] || '') && id.startsWith('28de')) continue; // Steam Input's virtual pad
    const ev = Number((H[1].match(/event(\d+)/) || [])[1] || 0);
    const hit = PADS.find(([re]) => re.test(id));
    const builtin = /^(28de:1205|0b05:|17ef:)/.test(id) || I[1] === '0019';
    found.push({ id, name: N?.[1] || '', kind: hit ? hit[1] : 'xbox', label: hit ? hit[2] : N?.[1] || 'Controller', bus: I[1], ev, builtin });
  }
  if (!found.length) return { kind: null, devices: [] };
  // a controller you plugged in or paired wins over the handheld's own; newest first
  found.sort((a, b) => (a.builtin - b.builtin) || (b.ev - a.ev));
  return { kind: found[0].kind, name: found[0].name || found[0].label, devices: found };
}

// ---------------------------------------------------------------- window + ipc
let win;

function broadcast(ch, data) { if (win && !win.isDestroyed()) win.webContents.send(ch, data); }

// Interface size. The UI is laid out for 1920x1080 (what the Ally shows in Game Mode). Bigger
// windows, like a 4K TV, zoom in by the same ratio so text and art keep their size on screen.
// Smaller windows (Steam Deck 1280x800) stay at 100%, which is what they were designed around.
function autoZoom() {
  if (!win || win.isDestroyed()) return 1;
  const [w, h] = win.getContentSize();
  const z = Math.min(w / 1920, h / 1080);
  return Math.max(1, Math.min(3, Math.round(z * 20) / 20));
}
function currentZoom() {
  const s = config.ui.scale;
  return !s || s === 'auto' ? autoZoom() : Math.max(0.75, Math.min(3, Number(s) || 1));
}
let zoomT = null;
function applyZoom() {
  if (!win || win.isDestroyed()) return;
  const z = currentZoom();
  if (Math.abs(win.webContents.getZoomFactor() - z) > 0.001) win.webContents.setZoomFactor(z);
}
function createWindow() {
  const fullscreen = isGamescope() || process.argv.includes('--fullscreen');
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 600,
    fullscreen,
    backgroundColor: '#0D1117',
    autoHideMenuBar: true,
    title: 'Cartridge',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.setMenuBarVisibility(false);
  if (process.env.VITE_DEV) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '../dist/index.html'));
  win.webContents.on('render-process-gone', (_e, d) => log('renderer gone', d.reason, d.exitCode));
  // CI launch check: exit 0 only if the UI actually rendered
  if (process.env.CARTRIDGE_SMOKE) {
    const fail = (why) => { console.error('SMOKE FAIL: ' + why); app.exit(1); };
    const t = setTimeout(() => fail('timeout'), 30000);
    win.webContents.on('render-process-gone', (_e, d) => fail('renderer ' + d.reason));
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      try {
        const text = await win.webContents.executeJavaScript('document.body.innerText');
        clearTimeout(t);
        if (/Cartridge/.test(text)) { console.log('SMOKE OK: ' + text.replace(/\s+/g, ' ').slice(0, 80)); app.exit(0); }
        else fail('empty UI');
      } catch (e) { fail(e.message); }
    }, 3000));
  }
  win.webContents.once('did-finish-load', () => log('ui loaded', Date.now() - startedAt + 'ms', 'window=' + win.getContentSize().join('x'), 'zoom=' + currentZoom()));
  win.webContents.on('did-finish-load', applyZoom);
  win.on('resize', () => { clearTimeout(zoomT); zoomT = setTimeout(applyZoom, 150); });
  win.on('enter-full-screen', () => setTimeout(applyZoom, 200));
  win.on('leave-full-screen', () => setTimeout(applyZoom, 200));
  win.webContents.on('did-fail-load', (_e, code, desc, url) => log('load failed', code, desc, url));
  win.webContents.on('console-message', (e) => { const m = e.message ?? e; if ((e.level === 'error' || e.level === 3) && typeof m === 'string') log('console', m.slice(0, 300)); });
  win.on('unresponsive', () => log('window unresponsive'));
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

const trophySvc = require('./trophyService')({
  USER_DATA, api, broadcast: (c, d) => broadcast(c, d), log, loadJson,
  getConfig: () => config, saveConfig: () => saveConfig(), getLibrary: () => library,
});
// ---------------------------------------------------------------- Steam ROM manager
function coverCrop(buf, W, H) {
  const { nativeImage } = require('electron');
  const im = nativeImage.createFromBuffer(buf);
  if (im.isEmpty()) return null;
  const { width: w, height: h } = im.getSize();
  const s = Math.max(W / w, H / h);
  const rw = Math.round(w * s), rh = Math.round(h * s);
  const r = im.resize({ width: rw, height: rh, quality: 'best' });
  return r.crop({ x: Math.max(0, Math.floor((rw - W) / 2)), y: Math.max(0, Math.floor((rh - H) / 3)), width: W, height: H }).toPNG();
}
function asPng(buf) {
  if (!buf) return null;
  const { nativeImage } = require('electron');
  const im = nativeImage.createFromBuffer(buf);
  return im.isEmpty() ? null : im.toPNG();
}
async function sgdbImage(name, kind, style) {
  if (!config.sgdbKey || !name) return null;
  const g = (await sgdbGames(name))[0];
  if (!g) return null;
  // style: SteamGridDB's own styles (alternate, blurred, white_logo, no_logo, material); heroes know alternate, blurred and material
  const st = style && (kind !== 'hero' || ['alternate', 'blurred', 'material'].includes(style)) ? `&styles=${style}` : '';
  const ep = kind === 'grid' ? `/grids/game/${g.id}?dimensions=600x900&types=static&nsfw=false&humor=false${st}`
    : kind === 'wide' ? `/grids/game/${g.id}?dimensions=920x430,460x215&types=static&nsfw=false&humor=false${st}`
    : `/heroes/game/${g.id}?dimensions=3840x1240,1920x620&types=static&nsfw=false&humor=false${st}`;
  let list = (await sgdb(ep)) || [];
  // backgrounds: the full-size ones first (small ones look soft on a TV), then by votes; only when
  // none come in those sizes, any big enough one
  if (kind === 'hero' && !list.length) list = ((await sgdb(`/heroes/game/${g.id}?types=static&nsfw=false&humor=false${st}`)) || []).filter((x) => !x.width || x.width >= 1600);
  list.sort((a, b) => (kind === 'hero' ? (b.width || 0) - (a.width || 0) : 0) || (b.score || 0) - (a.score || 0));
  // only take images of the right shape (a portrait cover is no use as a wide banner)
  const fits = (w, h) => (kind === 'grid' ? h > w : kind === 'wide' ? w > h * 1.6 : w > h * 1.4);
  for (const i of list.filter((x) => !x.width || fits(x.width, x.height)).slice(0, 3)) {
    try {
      const { nativeImage } = require('electron');
      const im = nativeImage.createFromBuffer(await fetchImage(i.url));
      const { width: w, height: h } = im.getSize();
      if (!im.isEmpty() && fits(w, h)) return im.toPNG();
    } catch {}
  }
  return null;
}
const romIndexMain = () => { const m = new Map(); for (const list of Object.values(library?.roms || {})) for (const r of list) m.set(r.id, r); return m; };
const hltbSvc = require('./hltb')({ file: path.join(USER_DATA, 'hltb.json'), log });
const steamMgr = require('./steamManager')({
  USER_DATA, log, PLATFORM_MAP, getConfig: () => config, saveConfig: () => saveConfig(), broadcast: (c, d) => broadcast(c, d), getLibrary: () => library,
  installed: () => installedMap, MARKED, markedPath: (r) => marks[r.id]?.path || null,
  romById: (id) => romIndexMain().get(id) || null,
  artFor: (id) => artOverrides[id] || null,
  fetchImage: async (src) => asPng(await fetchImage(src)),
  sgdbImage, cropTo: coverCrop,
  // the square icon Cartridge shows for the game (SteamGridDB), as PNG bytes, or null
  gameIconPng: async (rom) => { if (!rom) return null; const u = await gameIcon({ key: 'rom-' + rom.id, name: rom.name, year: rom.year ? new Date(rom.year > 1e11 ? rom.year : rom.year * 1000).getFullYear() : null }).catch(() => null); return u ? asPng(await fetchImage(u)) : null; },
  logoFile: async (rom) => { if (!rom) return null; await logoFor({ id: rom.id, name: rom.name, romm: rom.logo }).catch(() => null); const c = logoCache[rom.id]; return c?.file ? path.join(LOGO_DIR, c.file) : null; },
  emulationRoots: () => { const emu = readEmuDeckSettings(); return require('./trophies').emulationRoots([emu.emulationPath, config.romsRoot && path.dirname(config.romsRoot)].filter(Boolean)); },
  isGamescope,
});
// ---------------------------------------------------------------- 0.8: play time, server status, edits, uploads
// RetroArch's runtime logs (playlists/logs/<core>/<game>.lrtl, when "Save runtime log" is on):
// { runtime: "H:MM:SS", last_played: "YYYY-MM-DD HH:MM:SS" } keyed by the game's file name
function retroarchRuntime() {
  const home = os.homedir();
  const cfgDirs = [path.join(home, '.config/retroarch'), path.join(home, '.var/app/org.libretro.RetroArch/config/retroarch')];
  for (const r of steamMgr.steamRoots?.() || []) cfgDirs.push(path.join(r, 'steamapps/common/RetroArch'));
  const out = new Map();
  for (const d of cfgDirs) {
    let plDir = path.join(d, 'playlists');
    try { const m = fs.readFileSync(path.join(d, 'retroarch.cfg'), 'utf8').match(/^playlist_directory\s*=\s*"([^"]+)"/m); if (m && m[1] && m[1] !== 'default') plDir = expandHome(m[1].replace(/^:\//, d + '/')); } catch {}
    const walk = (dir, depth) => {
      let list = []; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of list) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) { if (depth < 2) walk(f, depth + 1); continue; }
        if (!/\.lrtl$/i.test(e.name)) continue;
        try {
          const j = JSON.parse(fs.readFileSync(f, 'utf8'));
          const [h, mi, se] = String(j.runtime || '0:0:0').split(':').map(Number);
          const min = Math.round((h || 0) * 60 + (mi || 0) + (se || 0) / 60);
          const last = j.last_played ? new Date(String(j.last_played).replace(' ', 'T')).getTime() || 0 : 0;
          const k = e.name.replace(/\.lrtl$/i, '').toLowerCase();
          const prev = out.get(k);
          out.set(k, { min: (prev?.min || 0) + min, last: Math.max(prev?.last || 0, last) });
        } catch {}
      }
    };
    walk(path.join(plDir, 'logs'), 0);
  }
  return out;
}
// romId -> { min, last, src }: Steam's play time for games in Steam, plus RetroArch's own logs
function playStats() {
  let steam = {};
  try { steam = steamMgr.playtime(); } catch (e) { log('play time from Steam failed', e.message); }
  const ra = retroarchRuntime();
  const out = { ...steam };
  if (ra.size) {
    for (const [id, p] of Object.entries(installedMap)) {
      if (!p || p === MARKED) continue;
      const names = [path.basename(p).replace(/\.[^.]+$/, '')];
      if (isDir(p)) { try { for (const n of fs.readdirSync(p)) names.push(n.replace(/\.[^.]+$/, '')); } catch {} }
      const hit = names.map((n) => ra.get(n.toLowerCase())).find(Boolean);
      if (!hit) continue;
      const cur = out[id] || { min: 0, last: 0 };
      // a game started both ways: Steam counts the whole session, RetroArch too, so take the larger
      out[id] = { min: Math.max(cur.min, hit.min), last: Math.max(cur.last, hit.last), src: cur.src ? `${cur.src} and RetroArch` : 'RetroArch' };
    }
  }
  return out;
}
// ---------------- recently played across devices (RomM play sessions)
// When Steam's play time for a game goes up, that time goes to RomM as a play session from this
// device. Sessions from your other devices come back, with the device's name, so Recently played
// shows games wherever they were played. Older RomM (no play sessions) only gets "last played".
const PLAY_SYNC_FILE = path.join(USER_DATA, 'play-sync.json');
const playSync = loadJson(PLAY_SYNC_FILE, { sent: {}, last: {} }); // romId -> minutes / last played already sent
let remotePlay = {}, playSyncing = null;
const deviceName = () => (config.trophies?.device || '').trim() || os.hostname();
async function rommFetch(pathname, opts = {}) {
  const b = await resolveBase();
  return fetch(b + pathname, { ...opts, headers: { ...authHeaders(), ...(opts.body && typeof opts.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) }, signal: AbortSignal.timeout(20000) });
}
// This device in RomM: registered once (a QR pairing token already belongs to a device)
async function rommDevice() {
  const d = config.rommDevice || {};
  if (d.id) return d.id;
  if (d.none && Date.now() - d.none < 864e5) return null;
  try {
    const r = await rommFetch('/api/devices', { method: 'POST', body: JSON.stringify({ name: deviceName(), platform: 'linux', client: 'Cartridge', client_version: app.getVersion(), hostname: os.hostname(), allow_existing: true }) });
    if (!r.ok) { config.rommDevice = { none: Date.now() }; saveConfig(); return null; }
    const j = await r.json();
    config.rommDevice = { id: j.device_id }; saveConfig();
    return j.device_id;
  } catch { return null; }
}
async function renameDevice(name) {
  const id = await rommDevice();
  if (id) await rommFetch(`/api/devices/${id}`, { method: 'PUT', body: JSON.stringify({ name: name || deviceName() }) }).catch(() => {});
  playSyncAt = 0;
  return true;
}
async function syncPlay() {
  if (playSyncing) return playSyncing;
  playSyncing = (async () => {
    const local = (() => { try { return steamMgr.playtime(); } catch { return {}; } })();
    const devId = await rommDevice();
    // send what's new since last time
    const sessions = [];
    for (const [id, p] of Object.entries(local)) {
      const before = playSync.sent[id] || 0, add = (p.min || 0) - before;
      if (add > 0 && p.last) sessions.push({ id, rom_id: Number(id), start_time: new Date(p.last - add * 60000).toISOString(), end_time: new Date(p.last).toISOString(), duration_ms: add * 60000, min: p.min });
    }
    let supported = true;
    if (sessions.length) {
      for (let i = 0; i < sessions.length; i += 100) {
        const batch = sessions.slice(i, i + 100);
        const r = await rommFetch('/api/play-sessions', { method: 'POST', body: JSON.stringify({ ...(devId ? { device_id: devId } : {}), sessions: batch.map(({ rom_id, start_time, end_time, duration_ms }) => ({ rom_id, start_time, end_time, duration_ms })) }) }).catch(() => null);
        if (r && (r.status === 404 || r.status === 405)) { supported = false; break; }
        if (r?.ok) for (const x of batch) playSync.sent[x.id] = x.min;
      }
    }
    // older RomM: at least "last played" for games played in the last day
    if (!supported) {
      for (const [id, p] of Object.entries(local)) {
        if (!p.last || p.last <= (playSync.last[id] || 0) || Date.now() - p.last > 864e5) continue;
        const r = await rommFetch(`/api/roms/${id}/props?update_last_played=true`, { method: 'PUT', body: JSON.stringify({ data: {} }) }).catch(() => null);
        if (r?.ok) { playSync.last[id] = p.last; playSync.sent[id] = p.min || 0; }
      }
    }
    saveJson(PLAY_SYNC_FILE, playSync, false);
    // read everyone's sessions back: device names, then sessions (a device token only sees its own
    // unless asked per device)
    const out = {};
    if (supported) {
      const devs = await rommFetch('/api/devices').then((r) => (r.ok ? r.json() : [])).catch(() => []);
      const names = new Map((Array.isArray(devs) ? devs : []).map((d) => [d.id, d.name || d.hostname || 'Another device']));
      const lists = [await rommFetch('/api/play-sessions?limit=200').then((r) => (r.ok ? r.json() : [])).catch(() => [])];
      for (const id of names.keys()) if (id !== devId) lists.push(await rommFetch(`/api/play-sessions?limit=100&device_id=${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : [])).catch(() => []));
      const seen = new Set();
      for (const s of lists.flat()) {
        if (!s?.rom_id || seen.has(s.id)) continue; seen.add(s.id);
        const end = Date.parse(s.end_time) || 0, mine = devId ? s.device_id === devId : false;
        const o = out[s.rom_id] || (out[s.rom_id] = { last: 0, device: null, mine: false, min: 0 });
        o.min += Math.round((s.duration_ms || 0) / 60000);
        if (end > o.last) { o.last = end; o.mine = mine; o.device = mine ? deviceName() : names.get(s.device_id) || 'Another device'; }
      }
    }
    remotePlay = out; playSyncAt = Date.now();
    return out;
  })().catch((e) => { log('play sync failed', e.message); return remotePlay; }).finally(() => { playSyncing = null; });
  return playSyncing;
}
// The server at a glance (Settings → About): reachable, how fast, its version and what it holds
async function serverHealth() {
  const base = await resolveBase().catch(() => null);
  const out = { base, route: base && base === trimUrl(config.server.localUrl) ? 'local' : base ? 'remote' : null, ok: false };
  if (!base) return out;
  const t0 = Date.now();
  try {
    const r = await fetch(`${base}/api/heartbeat`, { headers: authHeaders(), signal: AbortSignal.timeout(8000) });
    out.ms = Date.now() - t0;
    out.ok = r.ok;
    const hb = r.ok ? await r.json().catch(() => ({})) : {};
    out.version = hb.SYSTEM?.VERSION || hb.VERSION || null;
    out.sources = Object.entries(hb.METADATA_SOURCES || {}).filter(([k, v]) => v === true && /_API_ENABLED$/.test(k)).map(([k]) => k.replace(/_API_ENABLED$/, ''));
    out.rescan = hb.TASKS?.ENABLE_SCHEDULED_RESCAN ? hb.TASKS.SCHEDULED_RESCAN_CRON || true : false;
  } catch (e) { out.error = e.cause?.code || e.message; return out; }
  try { const st = await api('/api/stats'); out.stats = { platforms: st.PLATFORMS, roms: st.ROMS, saves: st.SAVES, states: st.STATES, screenshots: st.SCREENSHOTS, bytes: st.TOTAL_FILESIZE_BYTES }; } catch {}
  return out;
}
const DENIED_WRITE = "Your RomM sign-in can't change games. Sign in with your password, or pair again with the QR code so Cartridge can ask for that.";
// Edit a game's details in RomM (name, description, cover), then refresh it in the library
async function editRom({ romId, name, summary, coverUrl, coverFile }) {
  const b = await resolveBase();
  const fd = new FormData();
  if (name != null) fd.append('name', name);
  if (summary != null) fd.append('summary', summary);
  if (coverUrl) fd.append('url_cover', coverUrl);
  if (coverFile) { const buf = await fsp.readFile(coverFile); fd.append('artwork', new Blob([buf]), path.basename(coverFile)); }
  const r = await fetch(`${b}/api/roms/${romId}`, { method: 'PUT', headers: authHeaders(), body: fd, signal: AbortSignal.timeout(60000) });
  if (r.status === 401 || r.status === 403) throw new Error(DENIED_WRITE);
  if (!r.ok) throw new Error(`RomM could not save it (error ${r.status})`);
  const full = await api(`/api/roms/${romId}`);
  const slim = slimRom(full);
  for (const [pid, list] of Object.entries(library?.roms || {})) {
    const i = list.findIndex((x) => x.id === romId);
    if (i >= 0) { library.roms[pid][i] = { ...list[i], ...slim }; break; }
  }
  saveLib();
  return slim;
}
// Files in your console folders that RomM doesn't have (to upload): not a known game, not ours
const UPLOAD_SKIP = /\.(partial|part|tmp|m3u|txt|nfo|jpe?g|png|webp|gif|pdf|srm|sav|state\d*|auto|cfg|ini|xml|dat|db|json|log|lpl|md5|sha1|sfv|DS_Store)$/i;
function uploadCandidates() {
  if (!library) return [];
  const known = new Set(Object.values(installedMap).filter((p) => p && p !== MARKED).map((p) => path.resolve(p)));
  const out = [];
  for (const p of library.platforms) {
    const dir = platformPath(p).path;
    if (!dir || !isDir(dir)) continue;
    const names = new Set((library.roms[p.id] || []).flatMap((r) => [r.fs_name, ...(r.files || []).map((f) => f.file_name)]).filter(Boolean));
    let list = []; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of list) {
      if (!e.isFile() || e.name.startsWith('.') || UPLOAD_SKIP.test(e.name) || names.has(e.name)) continue;
      const f = path.join(dir, e.name);
      if (known.has(path.resolve(f))) continue;
      let size = 0; try { size = fs.statSync(f).size; } catch {}
      if (size < 1024) continue;
      out.push({ platformId: p.id, platform: p.display_name, slug: p.slug, fs_slug: p.fs_slug, name: e.name, path: f, size });
    }
  }
  return out.sort((a, b) => a.platform.localeCompare(b.platform) || a.name.localeCompare(b.name));
}
// Upload one file to RomM: chunked (RomM 4) or, on older servers, one multipart request
const uploads = new Map(); // path -> { pct, state, error, abort }
async function uploadFile({ path: f, platformId }) {
  if (uploads.get(f)?.state === 'uploading') return uploads.get(f);
  const st = { path: f, pct: 0, state: 'uploading', error: null, abort: new AbortController() };
  uploads.set(f, st);
  const put = (o) => { Object.assign(st, o); broadcast('upload', { path: f, pct: st.pct, state: st.state, error: st.error }); };
  put({});
  (async () => {
    const b = await resolveBase();
    const size = (await fsp.stat(f)).size, name = path.basename(f);
    const CH = 16 * 1024 * 1024, total = Math.max(1, Math.ceil(size / CH));
    const h = { ...authHeaders(), 'x-upload-platform': String(platformId), 'x-upload-filename': name, 'x-upload-total-size': String(size), 'x-upload-total-chunks': String(size ? total : 0) };
    const start = await fetch(`${b}/api/roms/upload/start`, { method: 'POST', headers: h, signal: st.abort.signal });
    if (start.status === 401 || start.status === 403) throw new Error(DENIED_WRITE);
    if (start.status === 404 || start.status === 405) {
      // older RomM: POST /api/roms with the file as a form part named after it
      const buf = await fsp.readFile(f);
      const fd = new FormData(); fd.append(name, new Blob([buf]), name);
      const r = await fetch(`${b}/api/roms`, { method: 'POST', headers: { ...authHeaders(), 'x-upload-platform': String(platformId), 'x-upload-filename': name }, body: fd, signal: st.abort.signal });
      if (r.status === 401 || r.status === 403) throw new Error(DENIED_WRITE);
      if (!r.ok) throw new Error(`RomM refused the upload (error ${r.status})`);
      return;
    }
    if (!start.ok) { const d = await start.json().catch(() => ({})); throw new Error(d.detail || `RomM refused the upload (error ${start.status})`); }
    const { upload_id: id } = await start.json();
    const fh = await fsp.open(f, 'r');
    try {
      for (let i = 0; i < total && size; i++) {
        const len = Math.min(CH, size - i * CH), buf = Buffer.alloc(len);
        await fh.read(buf, 0, len, i * CH);
        const r = await fetch(`${b}/api/roms/upload/${id}`, { method: 'PUT', headers: { ...authHeaders(), 'x-chunk-index': String(i), 'Content-Type': 'application/octet-stream' }, body: buf, signal: st.abort.signal });
        if (!r.ok) throw new Error(`Upload stopped at part ${i + 1} of ${total} (error ${r.status})`);
        put({ pct: Math.round(((i + 1) / total) * 100) });
      }
    } finally { await fh.close(); }
    const done = await fetch(`${b}/api/roms/upload/${id}/complete`, { method: 'POST', headers: authHeaders(), signal: st.abort.signal });
    if (!done.ok) { const d = await done.json().catch(() => ({})); throw new Error(d.detail || `RomM could not finish the upload (error ${done.status})`); }
  })().then(() => put({ pct: 100, state: 'done' }), (e) => put({ state: st.abort.signal.aborted ? 'cancelled' : 'error', error: st.abort.signal.aborted ? null : e.message }));
  return { path: f, state: 'uploading' };
}
const handlers08 = {
  // local play time plus where each game was last played (this device or another one in RomM)
  'play:stats': async () => {
    if (Date.now() - playSyncAt > 10 * 60e3 && config.configured) { const p = syncPlay(); if (!playSyncAt) await Promise.race([p, new Promise((r) => setTimeout(r, 4000))]); }
    const out = playStats(), me = deviceName();
    for (const [id, p] of Object.entries(out)) p.device = me;
    for (const [id, r] of Object.entries(remotePlay)) {
      const cur = out[id];
      if (!cur) out[id] = { min: 0, last: r.last, device: r.device, remote: !r.mine };
      else if (r.last > (cur.last || 0) + 60e3 && !r.mine) Object.assign(cur, { last: r.last, device: r.device, remote: true });
    }
    return out;
  },
  'play:device': ({ name }) => renameDevice(name),
  // dates for a game's timeline (the game page adds trophies and achievements it already has)
  'rom:timeline': ({ romId }) => {
    const r = romIndexMain().get(romId);
    const st = steamMgr.addedAt(romId);
    return { created: r?.created_at ? Date.parse(r.created_at) || null : null, firstSeen: library?.firstSeen?.[romId] > 1 ? library.firstSeen[romId] : null, downloaded: manifest[romId]?.at || null, steam: Number.isFinite(st) ? st : null, play: playStats()[romId] || null };
  },
  'server:health': () => serverHealth(),
  'rom:edit': (o) => editRom(o),
  'upload:list': () => ({ files: uploadCandidates(), active: [...uploads.values()].map(({ path: p, pct, state, error }) => ({ path: p, pct, state, error })) }),
  'upload:start': (o) => uploadFile(o),
  'upload:cancel': ({ path: f }) => { uploads.get(f)?.abort.abort(); return true; },
};
const handlers = {
  ...trophySvc.handlers,
  ...colHandlers,
  ...handlers08,
  'config:get': () => config,
  'wallpaper:set': async ({ file }) => {
    const ext = path.extname(file || '').toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) throw new Error('Pick a PNG, JPG or WebP image');
    const st = await fsp.stat(file);
    if (st.size > 40 * 1024 * 1024) throw new Error('That image is too big (over 40 MB)');
    for (const f of fs.readdirSync(USER_DATA)) if (/^wallpaper\./.test(f)) try { fs.rmSync(path.join(USER_DATA, f)); } catch {}
    await fsp.copyFile(file, path.join(USER_DATA, 'wallpaper' + ext));
    config.ui.wallpaper = String(Date.now()); config.ui.bgStyle = 'wallpaper'; saveConfig();
    return config;
  },
  'wallpaper:clear': () => { for (const f of fs.readdirSync(USER_DATA)) if (/^wallpaper\./.test(f)) try { fs.rmSync(path.join(USER_DATA, f)); } catch {} config.ui.wallpaper = ''; saveConfig(); return config; },
  'clip:read': async () => String((await require('electron').clipboard.readText()) || '').trim().slice(0, 4000),
  'logo:get': (r) => logoFor(r),
  'ra:signin': async ({ user, key }) => {
    const p = await raApi('GetUserProfile', {}, { user: user.trim(), key: key.trim() });
    if (!p || !p.User) throw new Error('RetroAchievements did not recognise that account');
    config.ra = { user: p.User, key: key.trim() }; saveConfig(); raMem.clear();
    return { user: p.User };
  },
  'ra:signout': () => { config.ra = { user: '', key: '' }; saveConfig(); raMem.clear(); return true; },
  'ra:overview': (o) => raOverview(o),
  'ra:game': (o) => raGame(o),
  'ra:forRom': (o) => raForRom(o),
  'ra:supported': ({ slug, fs_slug }) => !!(RA_CONSOLES[slug] ?? RA_CONSOLES[fs_slug]),
  'syslogo:get': (p) => sysLogo(p),
  'icon:get': (p) => gameIcon(p),
  'pad:detect': () => detectPad(),
  'icon:set': ({ key, url }) => { iconCache[String(key)] = { url, t: Date.now(), custom: true }; try { fs.writeFileSync(ICON_FILE, JSON.stringify(iconCache)); } catch {} return url; },
  'icon:reset': ({ key }) => { delete iconCache[String(key)]; try { fs.writeFileSync(ICON_FILE, JSON.stringify(iconCache)); } catch {} return true; },
  'logo:fetchAll': () => fetchAllLogos(),
  'logo:stopAll': () => { if (fetchAll) fetchAll.stop = true; return true; },
  'art:all': () => artOverrides,
  'art:search': (q) => sgdbArt(q),
  'art:set': (q) => setArt(q),
  'art:reset': ({ id }) => { delete artOverrides[id]; delete logoCache[id]; saveArt(); saveLogoCache(); return {}; },
  'logo:test': async ({ key }) => {
    const r = await fetch(SGDB_BASE() + '/search/autocomplete/zelda', { headers: { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(12000) });
    return { ok: r.ok, status: r.status };
  },
  'config:set': (patch) => {
    config = deepMerge(config, patch); saveConfig();
    if (patch.server) activeBase = null;
    if (patch.ui && 'scale' in patch.ui) applyZoom();
    if ('sgdbKey' in patch) { for (const k of Object.keys(logoCache)) if (!logoCache[k].file) delete logoCache[k]; saveLogoCache(); }
    if ('romsRoot' in patch && library) { broadcast('library', publicLibrary()); computeInstalled(); }
    return config;
  },
  'config:setPath': ({ slug, path: p }) => {
    if (p) config.paths[slug] = p; else delete config.paths[slug];
    saveConfig();
    if (library) { broadcast('library', publicLibrary()); computeInstalled(); }
    return config;
  },
  'library:get': () => publicLibrary(),
  'library:reset': () => { library = null; installedMap = {}; try { fs.rmSync(LIBRARY_FILE); } catch {} broadcast('library', null); return true; },
  'library:sync': () => syncLibrary(),
  'library:scan': async () => { const stats = await scanServer(); const res = await syncLibrary(); return { stats, ...res }; },
  'installed:get': () => installedMap,
  'installed:rescan': () => computeInstalled(),
  'server:test': async (srv) => {
    const s = deepMerge(config.server, srv || {});
    const res = {};
    for (const key of ['localUrl', 'remoteUrl']) {
      const b = trimUrl(s[key]);
      if (!b) continue;
      const hb = await probe(b, s);
      if (hb.ok) {
        try { const me = await api('/api/users/me', { base: b, srv: s, retry: false }); hb.user = me.username; }
        catch (e) { hb.ok = false; hb.error = e.message; }
      }
      res[key] = hb;
    }
    return res;
  },
  'server:pair': async ({ base, code }) => {
    const b = trimUrl(base);
    const r = await fetch(`${b}/api/client-tokens/exchange`, {
      method: 'POST', headers: { ...authHeaders({ ...config.server, auth: 'none', username: '' }), 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }), signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(r.status === 404 ? 'Invalid or expired pairing code' : `Pairing failed (HTTP ${r.status})`);
    const j = await r.json();
    return j.raw_token;
  },
  // QR pairing: RomM's device sign-in (/api/auth/device, newer RomM). Cartridge asks for a short
  // code, shows it as a QR code linking to RomM's /pair/device page, and polls until it's approved
  // on the phone. Older RomM has no such endpoint: the UI falls back to a typed pairing code.
  'server:qrStart': async ({ base, link }) => {
    const b = trimUrl(base);
    if (!config.deviceId) { config.deviceId = crypto.randomUUID(); saveConfig(); }
    const r = await fetch(`${b}/api/auth/device/init`, {
      method: 'POST', headers: { ...authHeaders({ ...config.server, auth: 'none', username: '' }), 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ client_device_identifier: config.deviceId, name: `Cartridge on ${os.hostname()}`.slice(0, 255), client: 'Cartridge', platform: 'linux', client_version: app.getVersion(),
        requested_scopes: ['me.read', 'roms.read', 'roms.user.read', 'roms.user.write', 'platforms.read', 'assets.read', 'firmware.read', 'collections.read', 'collections.write', 'roms.write', 'devices.read', 'devices.write'] }),
    });
    if (r.status === 404 || r.status === 405) throw new Error('This RomM version has no QR pairing. Use a pairing code instead.');
    if (r.status === 429) throw new Error('RomM is limiting pairing requests. Try again in a minute.');
    if (!r.ok) throw new Error(`QR pairing failed (HTTP ${r.status})`);
    const j = await r.json();
    return { userCode: j.user_code, deviceCode: j.device_code, interval: j.interval || 5, expiresIn: j.expires_in || 600, url: trimUrl(link || base) + j.verification_path_complete };
  },
  'server:qrPoll': async ({ base, deviceCode }) => {
    const r = await fetch(`${trimUrl(base)}/api/auth/device/token`, {
      method: 'POST', headers: { ...authHeaders({ ...config.server, auth: 'none', username: '' }), 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ device_code: deviceCode }),
    });
    if (r.ok) return { token: (await r.json()).access_token };
    const detail = (await r.json().catch(() => ({}))).detail || '';
    if (detail === 'authorization_pending' || detail === 'slow_down' || r.status === 429) return { pending: true, slow: detail === 'slow_down' };
    if (detail === 'access_denied') throw new Error('Pairing was declined in RomM');
    if (detail === 'expired_token') throw new Error('The QR code expired. Start again.');
    throw new Error(`Pairing failed (HTTP ${r.status})`);
  },
  'server:reconnect': async () => ({ base: await resolveBase(true) }),
  'server:status': async () => ({ base: await resolveBase(), route: activeBase === trimUrl(config.server.localUrl) ? 'local' : 'remote' }),
  'api:get': ({ path: p, query }) => api(p, { query }),
  'platforms:list': async () => {
    const list = await api('/api/platforms');
    return list.map((p) => ({ ...p, target: platformPath(p) }));
  },
  'platforms:supported': async () => {
    let list = [];
    try { list = await api('/api/platforms/supported'); } catch {}
    return list.map((p) => ({ ...p, target: platformPath(p) }));
  },
  'platforms:paths': (list) => Object.fromEntries(list.map((p) => [p.slug, platformPath(p)])),
  'roms:installed': ({ roms, platform }) => installedState(roms, platform),
  'roms:mark': ({ romId, on }) => {
    if (on) marks[romId] = { at: Date.now() }; else delete marks[romId];
    saveMarks();
    computeInstalled();
    return Object.keys(marks);
  },
  'roms:marks': () => Object.keys(marks),
  'roms:delete': async ({ romId, path: p }) => {
    let target = p || manifest[romId]?.path;
    // a hand-made mark has no files of its own: only remove the mark, never touch folders
    if (target === MARKED || (marks[romId] && !manifest[romId] && (!target || target === MARKED))) {
      delete marks[romId]; saveMarks(); computeInstalled(); try { steamMgr.onDeleted(romId); } catch {} return true;
    }
    if (!target) throw new Error('Nothing to delete');
    // never delete a whole console folder or the ROMs root
    const roots = new Set([config.romsRoot, ...(library?.platforms || []).map((pl) => platformPath(pl).path)].filter(Boolean).map((x) => path.resolve(x)));
    if (roots.has(path.resolve(target))) throw new Error('Refusing to delete a whole console folder');
    await fsp.rm(target, { recursive: true, force: true });
    delete manifest[romId];
    saveManifest();
    delete installedMap[romId];
    broadcast('installed-changed', { romId, path: null });
    try { if (steamMgr.onDeleted(romId)) broadcast('steam-auto', { romId, action: 'remove' }); } catch (e) { log('steam auto remove', e.message); }
    return true;
  },
  'dl:add': (job) => enqueue(job),
  'dl:list': () => queue.map(publicItem),
  'dl:cancel': (id) => {
    const it = queue.find((q) => q.id === id);
    if (!it) return;
    if (it.status === 'downloading') { it.status = 'cancelled'; it.abort?.abort(); }
    else if (it.status === 'queued') it.status = 'cancelled';
    emitQueue(); pump();
  },
  'dl:retry': (id) => { const it = queue.find((q) => q.id === id); if (it) { it.status = 'queued'; it.error = null; emitQueue(); pump(); } },
  // Queue controls: move a waiting game up or down, pause or resume everything
  'dl:move': ({ id, dir }) => {
    const waiting = queue.filter((q) => q.status === 'queued');
    const i = waiting.findIndex((q) => q.id === id), other = waiting[i + dir];
    if (i < 0 || !other) return false;
    const a = queue.indexOf(waiting[i]), b = queue.indexOf(other);
    [queue[a], queue[b]] = [queue[b], queue[a]];
    emitQueue(); return true;
  },
  'dl:pauseAll': () => {
    for (const it of queue) if (it.status === 'downloading' || it.status === 'queued') { const was = it.status; it.status = 'cancelled'; if (was === 'downloading') it.abort?.abort(); }
    emitQueue(); pump();
  },
  'dl:resumeAll': () => { for (const it of queue) if (it.status === 'cancelled') { it.status = 'queued'; it.error = null; } emitQueue(); pump(); },
  'dl:clear': () => { for (let i = queue.length - 1; i >= 0; i--) if (!['queued', 'downloading'].includes(queue[i].status)) queue.splice(i, 1); emitQueue(); },
  'bios:download': ({ platformId, slug }) => downloadBios(platformId, slug),
  'bios:list': ({ platformId }) => api('/api/firmware', { query: { platform_id: platformId } }),
  'fs:detect': () => detectRoots(),
  'fs:list': async (arg) => {
    const o = typeof arg === 'object' && arg ? arg : { dir: arg };
    const d = expandHome(o.dir || os.homedir());
    const entries = await fsp.readdir(d, { withFileTypes: true }).catch(() => []);
    const isD = (e) => e.isDirectory() || (e.isSymbolicLink() && isDir(path.join(d, e.name)));
    const dirs = entries.filter((e) => isD(e) && (o.hidden ? !['.', '..', '.cache', '.Trash-1000'].includes(e.name) : !e.name.startsWith('.'))).map((e) => e.name).sort((a, b) => a.localeCompare(b));
    const exts = Array.isArray(o.files) ? o.files.map((x) => '.' + String(x).toLowerCase()) : null;
    const files = exts ? entries.filter((e) => !isD(e) && !e.name.startsWith('.') && exts.includes(path.extname(e.name).toLowerCase())).map((e) => e.name).sort((a, b) => a.localeCompare(b)) : undefined;
    return { path: path.resolve(d), parent: path.dirname(path.resolve(d)), dirs, files };
  },
  'fs:mkdir': async (dir) => { await fsp.mkdir(dir, { recursive: true }); return true; },
  'storage:overview': () => storageOverview(),
  'fs:space': async (dir) => {
    let d = dir;
    while (d && !isDir(d)) { const up = path.dirname(d); if (up === d) break; d = up; }
    try { const s = await fsp.statfs(d || '/'); return { free: s.bavail * s.bsize, total: s.blocks * s.bsize }; } catch { return null; }
  },
  'fs:places': (o) => {
    const u = os.userInfo().username;
    const extra = o?.hidden ? [{ label: 'Flatpak apps', path: path.join(os.homedir(), '.var', 'app') }, { label: '.config', path: path.join(os.homedir(), '.config') }, { label: '.local/share', path: path.join(os.homedir(), '.local', 'share') }] : [];
    return [
      { label: 'Home', path: os.homedir() },
      ...extra,
      { label: 'External drives', path: isDir(`/run/media/${u}`) ? `/run/media/${u}` : '/run/media' },
      { label: 'Emulation (home)', path: path.join(os.homedir(), 'Emulation') },
      { label: 'Root', path: '/' },
    ].filter((p) => isDir(p.path));
  },
  'steam:add': async ({ restartSteam } = {}) => {
    if (isGamescope()) throw new Error('Switch to Desktop Mode to add Cartridge to Steam (Steam has to restart).');
    if (!process.env.APPIMAGE) throw new Error('This only works from the AppImage build.');
    const launcher = writeSteamLauncher();
    const r = await require('./steamArt').addToSteam({ exe: launcher, artDir: path.join(__dirname, '../steam-art'), restartSteam });
    log('steam add', JSON.stringify(r));
    return r;
  },
  'steam:status': () => ({ running: require('./steamArt').steamRunning(), gamescope: isGamescope(), appimage: !!process.env.APPIMAGE }),
  'steam:applyArt': () => {
    const res = require('./steamArt').applySteamArt(path.join(__dirname, '../steam-art'));
    if (!res.length) throw new Error('Add Cartridge to Steam first (Add a Non-Steam Game), then try again.');
    return res;
  },
  'steam:overview': () => steamMgr.overview(),
  'steam:preview': () => steamMgr.preview(),
  'steam:apply': (o) => steamMgr.apply(o || {}),
  'steam:undo': () => steamMgr.undo(),
  'steam:restart': () => steamMgr.restartSteam(),
  'steam:liveInfo': () => steamMgr.liveInfo(),
  'steam:setEmu': ({ key, id }) => steamMgr.setEmu(key, id),
  'steam:refresh': ({ key }) => steamMgr.refresh(key),
  'steam:refreshArt': ({ style }) => steamMgr.refreshArt(style),
  'steam:liveEnable': () => steamMgr.liveEnable(),
  'steam:queueAdd': (items) => steamMgr.queueAdd(items),
  'steam:queueRemove': (ids) => steamMgr.queueRemove(ids),
  'steam:queueClear': () => steamMgr.queueClear(),
  'steam:removeAll': () => steamMgr.removeAllOurs(),
  'steam:collections': () => steamMgr.collections(),
  'steam:test': ({ key }) => steamMgr.test(key),
  'steam:testTemplate': ({ key, template }) => steamMgr.test(key, template),
  'steam:setTemplate': ({ key, template }) => steamMgr.setTemplate(key, template),
  'steam:setMode': ({ key, mode }) => steamMgr.setMode(key, mode),
  'steam:verify': () => steamMgr.verifyCollections(),
  'steam:fixCollections': () => steamMgr.fixCollections(),
  'steam:report': () => steamMgr.startupReport(),
  'steam:last': () => steamMgr.lastStatus(),
  'steam:forRom': ({ romId }) => steamMgr.forRom(Number(romId)),
  // HowLongToBeat times when RomM has none: name plus release year, cached in hltb.json
  'hltb:lookup': ({ name, year }) => hltbSvc.forGame({ name: String(name || ''), year: Number(year) || null }),
  'steam:played': () => { try { return steamMgr.played(); } catch { return {}; } },
  'steam:setConfig': (patch) => { config.steam = { ...(config.steam || {}), ...patch }; saveConfig(); return config.steam; },
  'steam:setPath': ({ romId, path: p }) => { if (!isDir(p) && !fs.existsSync(p)) throw new Error('That folder does not exist'); marks[romId] = { ...(marks[romId] || { at: Date.now() }), path: p }; saveMarks(); return true; },
  'app:startGame': () => { const g = startGame; startGame = null; return g; },
  'update:get': () => ({ ...updateState, current: app.getVersion(), supported: !!autoUpdater }),
  'update:check': async () => { if (!autoUpdater) throw new Error('Updates work in the AppImage build only'); await autoUpdater.checkForUpdates(); return updateState; },
  'update:install': () => { if (updateState.state === 'ready') autoUpdater.quitAndInstall(true, true); },
  'app:info': () => ({ version: app.getVersion(), gamescope: isGamescope(), userData: USER_DATA, gpu: useGpu, home: os.homedir(), hostname: os.hostname() }),
  'app:scale': () => { const [w, h] = win.getContentSize(); return { auto: autoZoom(), current: currentZoom(), w, h, display }; },
  'app:quit': () => app.quit(),
  'app:screenshot': async () => {
    const dir = path.join(app.getPath('pictures'), 'Cartridge');
    await fsp.mkdir(dir, { recursive: true });
    const imgShot = await win.webContents.capturePage();
    const file = path.join(dir, `cartridge-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`);
    await fsp.writeFile(file, imgShot.toPNG());
    return file;
  },
  'app:relaunch': () => relaunch(),
  'app:graphics': () => ({ mode: useGpu ? 'hardware' : 'software', setting: config.graphics, status: app.getGPUFeatureStatus?.() }),
  'app:fullscreen': () => win.setFullScreen(!win.isFullScreen()),
  'app:clearCache': async () => { await fsp.rm(IMG_CACHE, { recursive: true, force: true }); return true; },
};

for (const [ch, fn] of Object.entries(handlers)) {
  ipcMain.handle(ch, async (_e, arg) => {
    try { return { ok: true, data: await fn(arg) }; }
    catch (e) { return { ok: false, error: e.message || String(e) }; }
  });
}

app.whenReady().then(() => {
  // readable by the page's canvas too (Theme from this game reads a cover's colours)
  protocol.handle('romimg', async (req) => { const r = await handleImage(req); try { r.headers.set('Access-Control-Allow-Origin', '*'); } catch {} return r; });
  createWindow();
  if (library) computeInstalled();
  win.webContents.once('did-finish-load', () => {
    if (config.configured && (config.sync.onLaunch || !library)) syncLibrary().catch(() => {});
    setTimeout(() => trophySvc.start().catch((e) => log('trophies failed', e.message)), 1500);
  });
  setInterval(() => {
    const every = (config.sync.everyMinutes || 0) * 60e3;
    if (config.configured && every && library && Date.now() - library.syncedAt > every) syncLibrary().catch(() => {});
  }, 60e3);
  win.on('focus', () => { if (library) computeInstalled(); });
  setupUpdater();
  // Safety net if the display could not be read up front: a big window drawn in software is
  // unusably slow, so restart once with the GPU. A user or crash-chosen "software" is respected.
  setTimeout(() => {
    if (useGpu || config.graphics === 'software' || process.env.CARTRIDGE_BIG === '1' || process.argv.includes('--disable-gpu')) return;
    const [w, h] = win.getContentSize();
    if (w >= 2500 || h >= 1400) { log('big window in software mode', w + 'x' + h, 'restarting with the GPU'); process.env.CARTRIDGE_BIG = '1'; relaunch(); }
  }, 2500);
});
app.on('child-process-gone', (_e, d) => {
  log('child gone', d.type, d.reason, d.exitCode);
  // If the GPU dies early, remember it and restart without the GPU so the window is never blank
  if (d.type === 'GPU' && useGpu && d.reason !== 'clean-exit' && Date.now() - startedAt < 20000) {
    config.graphics = 'software';
    try { saveConfig(); } catch {}
    log('gpu failed at startup, relaunching in software mode');
    relaunch();
  }
});
app.on('window-all-closed', () => app.quit());
