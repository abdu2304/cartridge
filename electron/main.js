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
// touch screens (0.9.26): the touch event API on, whatever Chromium guessed about the screen at start
app.commandLine.appendSwitch('touch-events', 'enabled');
app.setName('Cartridge');

protocol.registerSchemesAsPrivileged([
  { scheme: 'romimg', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const USER_DATA = app.getPath('userData');
const CONFIG_FILE = path.join(USER_DATA, 'config.json');
const MANIFEST_FILE = path.join(USER_DATA, 'installed.json');
const IMG_CACHE = path.join(USER_DATA, 'imgcache');
const LIB_ART = path.join(USER_DATA, 'imgcache-library'); // every game's cover, small, for browsing away from the server (0.9.52)

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
  ui: { gridSize: 'md', hideEmpty: true, sounds: true, bgStyle: 'solid', theme: 'cartridge', mediaBar: true, logos: true, pointer: 'auto', scale: 'auto', keyboard: 'auto',
    customColor: '', surface: 'solid', text: 'normal', font: 'cartridge', cardShape: 'rounded', density: 'normal', cardTitles: true,
    motion: 'normal', effects: 'auto', soundPack: 'soft', volume: 'medium', wallpaper: '', wallDim: 'medium',
    colors: { highlight: '', buttons: '', bars: '', background: '' } },
  sync: { onLaunch: true, everyMinutes: 60 },
  sgdbKey: '', // optional SteamGridDB API key for game logos
  nexusKey: '', // optional Nexus Mods personal API key (0.9.52): only Premium members' one-press downloads use it
  ra: { user: '', key: '' }, // RetroAchievements username + web API key
  trophies: { sources: {}, sync: true, popups: true, device: '' }, // PS3/PS4/Xbox 360/Vita trophies from emulators
  graphics: 'auto', // auto (GPU, falls back on failure) | software
  configVersion: 3,
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
const freshConfig = !fs.existsSync(CONFIG_FILE);
let config = loadJson(CONFIG_FILE, {});
const rawVersion = freshConfig ? DEFAULT_CONFIG.configVersion : config.configVersion || 1; // a new install starts on today's defaults
config = deepMerge(DEFAULT_CONFIG, config);
// 0.9.41 (owner): OLED Black left Background for the OLED colour; whoever had it keeps a black page that way
if (config.ui?.surface === 'oled') { config.ui.surface = 'solid'; if (!config.ui.theme || config.ui.theme === 'cartridge') config.ui.theme = 'oled'; }
if (rawVersion < 2) {
  // 0.1.1/0.1.2 saved 'software' as a default, not a user choice: move everyone to Auto (GPU)
  config.graphics = 'auto'; // whatever 0.1.x saved (HANDOFF B8: the two old lines did exactly this)
  config.configVersion = 2;
  try { fs.mkdirSync(USER_DATA, { recursive: true }); fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 }); } catch {}
}
if (rawVersion < 3 && config.configured) {
  // 0.9's new look: settings still at the old defaults (saved as values, not choices) move to it;
  // anything someone picked stays. Existing users have set up already, so Setup isn't forced on them.
  const u = config.ui, was = { theme: 'purple', surface: 'glass', font: 'outfit', bgStyle: 'waves' }, now = { theme: 'cartridge', surface: 'solid', font: 'cartridge', bgStyle: 'solid' };
  for (const k of Object.keys(was)) if (u[k] === was[k]) u[k] = now[k];
  if (!config.setupDone) config.setupDone = 'before 0.9'; // Setup is in Settings → Steam for them
  config.configVersion = 3;
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 }); } catch {}
}

// ---------------------------------------------------------------- log
// (How Cartridge picks GPU or software rendering is further down: isGamescope, launchedBySteam,
// biggestDisplay and forceSoftware. In short: software in Game Mode or under Steam on small
// screens, the GPU on big screens and on the desktop, with a fallback if the GPU fails.)
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
// In Game Mode the window keeps its focus while Steam's menu (Home) is in front, and the controller is
// read straight from the device, so presses still reached Cartridge (0.9.3 L). gamescope says which
// app is in front in the root window's GAMESCOPE_FOCUSED_APP; Steam gives a shortcut it starts its id
// in SteamGameId (the app id in the top 32 bits). When another app is in front, the UI stops reading
// the pad (event 'background'). Without xprop or those ids nothing changes.
// 0.9.29 (owner: after a game started from Cartridge closes, the controller does nothing until the screen is
// tapped): Chromium only hands the page gamepad input while its document has focus. One focus call right as
// gamescope switches back can land before the window is really in front, so it's asked again over a few
// seconds (blur first, so the focus is a change Chromium acts on) until the page says it has focus. Logged,
// so a device report shows which step worked.
function refocus() {
  let n = 0;
  const step = async () => {
    if (!win || win.isDestroyed() || gameFocus.away) return;
    try { if (!win.isVisible()) win.showInactive(); if (n > 1) win.blur(); win.focus(); win.webContents.focus(); } catch {}
    let has = false; try { has = await win.webContents.executeJavaScript('document.hasFocus()'); } catch {}
    if (has) { if (n) log('back in front, focused after try', n + 1); return; }
    if (++n < 6) setTimeout(step, [150, 400, 800, 1500, 2500][n - 1]);
    else log('back in front, the page still has no focus after 6 tries');
  };
  setTimeout(step, 0); // after the caller has noted that the game is gone (gameFocus.away)
}
// The game Cartridge asked Steam to start (0.9.29): found by its file in a running process's command line
// (every emulator is given the game's path, or its folder), then watched until it ends. When it does,
// Cartridge comes back to the front with the pad working (nav.js gameEnded), in Game Mode and on the desktop.
let runT = null, runOn = false;
const runActive = () => runOn;
// background jobs Cartridge runs by itself (0.9.48): a game in front (Game Mode) or one started from Cartridge counts as playing
const scheduler = require('./scheduler').createScheduler({ playing: () => !!(gameFocus.away || runOn), file: path.join(USER_DATA, 'scheduler.json'), log });
function watchGameRun(romId) {
  clearInterval(runT);
  gameFocus.gameApp = null; gameFocus.endedAt = 0;
  const where = installedMap[romId];
  if (!where || where === MARKED) return;
  const r = romIndexMain().get(romId) || {};
  // RPCS3 and Vita3K start installed games by serial, not by file
  let serial = ''; try { serial = /ps3/i.test(`${r.platform_slug} ${r.platform_fs_slug}`) ? ps3Serial(romId, where) || '' : installs[romId]?.serial || ''; } catch {}
  const needles = [...new Set([where, mainFile(where)].filter(Boolean).map((p) => path.basename(p)).concat(serial ? [serial] : []))].filter((n) => n.length > 3);
  const running = () => {
    for (const d of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(d) || Number(d) === process.pid) continue;
      let c = ''; try { c = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8'); } catch { continue; }
      if (needles.some((n) => c.includes(n)) && !/\bcartridge\b|electron/i.test(c.split('\0')[0])) return true;
    }
    return false;
  };
  let seen = false, started = Date.now(), seenAt = 0, asked = false;
  const vita = /psvita|vita/i.test(`${r.platform_slug} ${r.platform_fs_slug}`);
  broadcast('game-run', { state: 'starting', romId });
  runT = setInterval(() => {
    let on = false; try { on = running(); } catch {}
    if (on && !seen) { seen = true; seenAt = Date.now(); runOn = true; log('game running', romId); }
    // 0.9.49 (owner: Vita3K "doesn't launch, nothing happens"): a Vita game that never shows, or closes within 15 s,
    // gets Vita3K's own reason (its log, or the title not being in its storage) instead of silence
    if (vita && !asked && ((!on && !seen && Date.now() - started > 20000) || (!on && seen && Date.now() - seenAt < 15000))) { asked = true; vitaQuickExit(romId, serial); }
    if (!on && !seen && Date.now() - started > 180000) { clearInterval(runT); return; } // never seen: give up after 3 min
    if (!on && seen) {
      clearInterval(runT); runOn = false; gameFocus.endedAt = Date.now(); log('game ended', romId);
      broadcast('game-run', { state: 'ended', romId });
      saveSyncAfter(romId); // Cartridge Save Sync (0.9.51)
      bringBack();
      if (isGamescope()) setTimeout(steamFront, 1500);
    }
  }, 2000);
}
// why Vita3K didn't stay open for a game: not in the storage this copy of Vita3K uses (its -r then refuses the title and
// quits before any window: config.cpp IsMember check), else the last error in its log, else its start check
async function vitaQuickExit(romId, serial) {
  try {
    const P = require('./pkgInstall'), cmd = steamMgr.vita3kCommand?.();
    const fsPaths = P.vita3kFsPaths(cmd?.exe);
    let why = '';
    if (serial && fsPaths.length && !fsPaths.some((d) => fs.existsSync(path.join(d, 'ux0/app', serial)))) why = `${serial} isn’t installed in the storage this Vita3K uses (${fsPaths[0]}). Install the game again from its page.`;
    if (!why) why = P.vita3kWhy(P.vita3kLogTail(cmd?.exe));
    if (!why && cmd?.exe) { const c = await require('./emuStart').check('vita3k', cmd.exe); if (c && !c.ok) why = `Vita3K can’t start: ${c.reason}. Repair it in Settings → Emulators.`; }
    log('vita game closed straight away', romId, serial || '', cmd?.exe || 'no vita3k', why || 'no reason found');
    broadcast('toast', { text: why ? `Vita3K closed: ${why}` : 'Vita3K closed straight away without saying why. Report a Problem in About sends its log.', kind: 'error', icon: 'mdiAlertCircleOutline' });
  } catch (e) { log('vita quick exit check', e.message); }
}
// Game Mode, 1.5 s after our game ended (0.9.34): when gamescope still doesn't name Cartridge as the app in front,
// Steam is asked to go back to its running app the way its own Resume does (only with Steam's interface reachable,
// as for live changes). Steam hands the controller to the app it has in front, so this is what gives the pad back.
function steamFront() {
  require('child_process').execFile('xprop', ['-root', 'GAMESCOPE_FOCUSED_APP'], { timeout: 1500 }, async (err, out) => {
    const app = (/=\s*(\d+)/.exec(String(out || '')) || [])[1] || '?';
    const gid = process.env.SteamGameId || process.env.STEAM_GAME_ID || '';
    let mine = ''; try { mine = String(BigInt(gid) > 0xffffffffn ? BigInt(gid) >> 32n : BigInt(gid)); } catch {}
    if (!mine || app === mine) { log('after the game, gamescope focus', app, app === mine ? 'is cartridge' : ''); return; }
    try { log('after the game, gamescope focus', app, 'not cartridge (' + mine + '): asking steam', JSON.stringify(await steamMgr.frontRunning(Number(mine)))); }
    catch (e) { log('after the game, steam not asked:', e.message); }
  });
}
// back in front after a game: in Game Mode gamescope decides (refocus asks until the page has focus); on the
// desktop a window manager may refuse a plain focus, so the window is lifted above the rest for a moment
function bringBack() {
  if (!win || win.isDestroyed()) return;
  if (!isGamescope()) { try { if (win.isMinimized()) win.restore(); win.show(); win.setAlwaysOnTop(true); win.moveTop(); win.focus(); setTimeout(() => { try { win.setAlwaysOnTop(false); } catch {} }, 600); } catch {} }
  refocus();
}
function watchGamescopeFocus() {
  const gid = process.env.SteamGameId || process.env.STEAM_GAME_ID || '';
  if (!isGamescope() || !/^\d+$/.test(gid)) return;
  let mine = BigInt(gid); if (mine > 0xffffffffn) mine >>= 32n;
  let last = null, busy = false, seen = new Set(), first = true, hiddenFor = 0, tick = false, scanning = false;
  gameFocus.watched = true;
  // CAE governor (0.9.47, owner: no CPU taken from the game): every 600 ms while Cartridge is in front, every 1.5 s
  // while another app is (xprop is a process start each round, the Steam launch scan reads every process's command line)
  const round = () => {
    if (busy) return; busy = true;
    require('child_process').execFile('xprop', ['-root', 'GAMESCOPE_FOCUSED_APP'], { timeout: 1500 }, (err, out) => {
      busy = false;
      const m = /=\s*(\d+)/.exec(String(out || ''));
      if (err || !m) return;
      let away = BigInt(m[1]) !== mine && m[1] !== '0';
      // 0.9.34 (owner: after a game started from Cartridge closes, the pad is seen but does nothing): while our game
      // runs, the app gamescope focuses is noted; once it has ended, gamescope can keep naming that closed game as
      // focused while Cartridge is what's on screen, which kept the pad switched off here. Its id no longer counts as away.
      if (away && m[1] !== '769' && runActive()) gameFocus.gameApp = m[1];
      if (gameFocus.endedAt && m[1] !== gameFocus.gameApp) { gameFocus.endedAt = 0; gameFocus.gameApp = null; } // focus moved on: back to normal
      if (away && gameFocus.endedAt && m[1] === gameFocus.gameApp) away = false;
      if (m[1] !== gameFocus.lastApp) { log('gamescope focus', m[1], away ? '(away)' : '(cartridge)'); gameFocus.lastApp = m[1]; }
      if (away !== last) {
        last = away; broadcast('background', { away });
        // back in front after a game (0.9.24, owner: controls dead after closing a game): the window came back
        // without focus (showInactive), and the page only reads the pad while focused
        if (!away && win && !win.isDestroyed()) refocus();
        if (!away) saveSyncBack(); // back from a game started anywhere (Steam too): its saves go to RomM (0.9.51)
      }
      gameFocus.away = away && m[1] !== '769'; if (gameFocus.away) gameFocus.otherAt = Date.now(); // 769 is Steam's own menu, where Exit game for Cartridge is
      // F11: a game Steam just started has no window yet, so gamescope shows the one it has (ours).
      // Stay unmapped until the game holds focus (769 is Steam's own UI) or 45 s pass, then come back behind it.
      if (hiddenFor && ((away && m[1] !== '769') || Date.now() - hiddenFor > 45000)) { hiddenFor = 0; try { win?.showInactive(); } catch {} }
    });
    if ((tick = !tick) || scanning) return; // the process scan every other round is quick enough
    scanning = true;
    steamLaunches(gid, mine).then((now) => {
      scanning = false;
      const fresh = [...now].some((p) => !seen.has(p));
      if (now.size) gameFocus.otherAt = Date.now();
      // the other game ended: come back now rather than waiting out the 45 s
      if (seen.size && !now.size && hiddenFor) { hiddenFor = 0; log('the other game ended, showing again'); try { win?.showInactive(); } catch {} }
      seen = now;
      if (fresh && first) { first = false; return; }
      first = false;
      if (fresh) { gameFocus.endedAt = 0; gameFocus.gameApp = null; } // a new game (even the same one again) is away as usual
      if (fresh && win && !win.isDestroyed() && win.isVisible()) { log('steam started another game, stepping aside'); hiddenFor = Date.now(); win.hide(); }
    }, () => { scanning = false; });
  };
  (function loop() { round(); setTimeout(loop, gameFocus.away ? 1500 : 600); })();
}
// Game Mode, another app in front or just closed (0.9.23, owner: closing a game started from Steam closed
// Cartridge too). Steam ends a game by signalling its launch session, and on the way back Cartridge got
// one as well. A signal in that moment is logged and ignored; a second one within 10 s still quits.
// flatpak override in the background (after 0.9.54): run synchronously it held the whole app while Flatpak worked,
// up to 15 s, and Steam dimmed Cartridge as not responding
const flatpakAsync = (args) => new Promise((res, rej) => require('child_process').execFile('flatpak', args, { timeout: 15000 }, (e) => (e ? rej(e) : res())));
const gameFocus = { watched: false, away: false, otherAt: 0, ignoredAt: 0, gameApp: null, endedAt: 0, lastApp: null };
function ignoreSignal(sig) {
  if (!gameFocus.watched || sig === 'SIGINT') return false;
  const now = Date.now();
  if (now - gameFocus.ignoredAt < 10000) return false;
  if (!gameFocus.away && now - gameFocus.otherAt > 8000) return false;
  gameFocus.ignoredAt = now;
  log('got', sig, 'while another app was in front or just closed, staying open');
  return true;
}
// pids of Steam's launch wrappers (reaper SteamLaunch AppId=N) for any app but ours. Read without
// blocking (0.9.16): the main thread also runs Cartridge's own work, which must never wait on this.
async function steamLaunches(gid, mine) {
  const out = new Set();
  let ids = []; try { ids = (await fsp.readdir('/proc')).filter((d) => /^\d+$/.test(d)); } catch { return out; }
  await Promise.all(ids.map(async (id) => {
    let c = ''; try { c = await fsp.readFile(`/proc/${id}/cmdline`, 'utf8'); } catch { return; }
    if (!c.includes('SteamLaunch')) return;
    const a = /AppId=(\d+)/.exec(c);
    if (a && a[1] !== gid && a[1] !== String(mine)) out.add(id);
  }));
  return out;
}
// What this machine is, for the default device name ("Sam's Steam Deck"); DMI product names
function deviceKind() {
  let n = ''; try { n = fs.readFileSync('/sys/devices/virtual/dmi/id/product_name', 'utf8').trim(); } catch {}
  if (/^(Jupiter|Galileo)$/i.test(n)) return 'Steam Deck';
  if (/ROG Ally/i.test(n)) return 'ROG Ally';
  if (/^83E1$|Legion Go/i.test(n)) return 'Legion Go';
  if (/^Claw\b/i.test(n)) return 'MSI Claw';
  return '';
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
const autoSoftware = (inGamescope || fromSteam) && !bigScreen;
// 'gpu' (0.9.29, owner: "choppy on my ROG Ally"): the user's own choice to use the GPU where Auto keeps
// software (Game Mode on handheld-size screens). Auto is unchanged. Game Mode on big screens already runs
// the GPU, so it works there; a trial that isn't confirmed within GPU_TRIAL_MS goes back to Auto by itself.
// 0.9.41 (owner: "every handheld has a GPU; GPU Always fixed all the sluggishness"): always the GPU, the setting is
// gone. Software only for one launch after the GPU process died at start-up (relaunched with --disable-gpu, never saved).
const forceSoftware = process.argv.includes('--disable-gpu') || process.env.CARTRIDGE_SAFE_GPU === '1';
const useGpu = !forceSoftware;
const gpuTrial = false;
const GPU_TRIAL_MS = 25000;
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
// Games Cartridge installed into an emulator's own storage (0.9.3 D: PS3 .pkg through RPCS3):
// romId -> { emu, serial, dir, created, at, files }. Only these can be deleted from there.
const INSTALLS_FILE = path.join(USER_DATA, 'installs.json');
let installs = loadJson(INSTALLS_FILE, {});
const saveInstalls = () => saveJson(INSTALLS_FILE, installs);

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

// 0.9.49 (owner: "Detected ROM folders, I don't know what that means"; the list showed one folder twice, under /media and
// /run/media, and EmuDeck's entry pointed at the drive itself): a found folder is the games folder on it (a drive or an
// Emulation folder becomes its roms folder), the same real folder is listed once, and each says which drive it's on and
// how many consoles and games it holds, so the choice is plain.
const KNOWN_DIRS = new Set(Object.values(PLATFORM_MAP).flat().map((x) => x.toLowerCase()));
function romsFolderStats(dir) {
  let consoles = 0, games = 0;
  for (const n of listDirNames(dir)) {
    if (!KNOWN_DIRS.has(n.toLowerCase())) continue;
    let k = 0; try { k = fs.readdirSync(path.join(dir, n)).filter((f) => !f.startsWith('.') && !/^(media|metadata\.txt|systeminfo\.txt)$/i.test(f)).length; } catch {}
    consoles++; games += k;
  }
  return { consoles, games };
}
function detectRoots() {
  const out = [];
  const real = (x) => { try { return fs.realpathSync(x); } catch { return path.resolve(x); } };
  const list = mounts();
  const add = (p, source) => {
    if (!p) return;
    let norm = path.resolve(p);
    // a drive or an Emulation folder: the games folder in it
    if (romsFolderStats(norm).consoles < 2) for (const sub of ['roms', 'Emulation/roms']) if (isDir(path.join(norm, sub)) && romsFolderStats(path.join(norm, sub)).consoles >= 2) { norm = path.join(norm, sub); break; }
    const r = real(norm);
    const had = out.find((o) => o.real === r);
    if (had) { if (!had.source.includes(source)) had.source += ` · ${source}`; return; }
    const dv = isDir(norm) ? driveOf(norm, list) : null;
    out.push({ path: norm, real: r, source, exists: isDir(norm), drive: dv ? (dv.label === 'This device' ? 'Main Drive' : dv.label) : '', ...romsFolderStats(norm) });
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
  return { roots: out.filter((o) => o.exists), bios };
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

// Games on more than one drive (0.9.38, owner: "if you can add the paths to the emulators in the background, and
// it doesn't clutter the app"; plan: docs/plan-multidrive.md). config.extraRoots holds more ROMs folders, each an
// ES-DE style roms folder on another drive. A console's games can be in any of them: found in all, and a new
// download goes where there's the most free space (or to the folder picked in Storage). A drive that's
// unplugged is simply skipped until it's back; nothing is forgotten or moved.
const extraRoots = () => (config.extraRoots || []).map((r) => r.path).filter(Boolean);
function rootFolder(root, p) {
  const cands = [...(PLATFORM_MAP[p.slug] || []), ...(p.fs_slug ? [p.fs_slug] : []), p.slug].filter(Boolean);
  const lower = new Map(listDirNames(root).map((n) => [n.toLowerCase(), n]));
  for (const c of cands) { const hit = lower.get(c.toLowerCase()); if (hit) return path.join(root, hit); }
  return path.join(root, cands[0]);
}
// every folder this console's games can be in: its own (or the one you picked), then each extra drive's
function platformDirs(p) {
  const main = platformPath(p).path;
  return [main, ...extraRoots().filter((r) => isDir(r)).map((r) => rootFolder(r, p))].filter(Boolean);
}
// where a new download goes: the folder picked in Storage, else the drive with the most free space
// root: a games folder picked for this one download (0.9.49, Always Ask), else the one picked in Storage
function downloadDir(p, need = 0, root = null) {
  const main = platformPath(p).path;
  const roots = extraRoots().filter((r) => isDir(r));
  if (!roots.length || config.paths[p.slug]) return main; // one drive, or a folder you set for this console
  const opts = [main, ...roots.map((r) => rootFolder(r, p))].filter(Boolean);
  const want = root || (config.downloadRoot && config.downloadRoot !== 'most' ? config.downloadRoot : null);
  // the main games folder (config.romsRoot) holds main, which may sit under another path than romsRoot's (a console
  // folder set by name), so the main root picks main itself
  const pick = want ? (path.resolve(want) === path.resolve(config.romsRoot || '') ? main : opts.find((d) => path.resolve(d).startsWith(path.resolve(want) + path.sep))) : null;
  if (pick) return pick;
  const free = (d) => { let x = d; while (x && !isDir(x)) { const up = path.dirname(x); if (up === x) break; x = up; } try { const st = fs.statfsSync(x || '/'); return st.bavail * st.bsize; } catch { return 0; } };
  const ranked = opts.map((d) => ({ d, f: free(d) })).sort((a, b) => b.f - a.f);
  return (ranked.find((x) => x.f > need + 2e9) || ranked[0]).d;
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
  // 0.9.38: the console's folder on every drive (platformDirs), the first match wins
  const dirs = platformDirs(platform).map((dir) => { let entries = new Set(); try { entries = new Set(fs.readdirSync(dir)); } catch {} return { dir, entries, ids: null }; }).filter((x) => x.entries.size);
  const out = {};
  for (const rom of roms) {
    const m = manifest[rom.id];
    if (m && fs.existsSync(m.path)) { out[rom.id] = m.path; continue; }
    let found = null;
    for (const D of dirs) {
      const hit = candidatesFor(rom).find((n) => D.entries.has(n));
      if (hit) { found = path.join(D.dir, hit); break; }
      if (isFolderSystem(rom)) {
        const stem = String(rom.fs_name || '').replace(/\.(zip|7z|rar)$/i, '');
        if (stem && D.entries.has(stem)) { found = path.join(D.dir, stem); break; }
        const tid = titleId(rom.fs_name) || titleId(rom.name);
        if (tid) {
          D.ids ||= new Map([...D.entries].map((e) => [titleId(e), e]).filter(([k]) => k));
          if (D.ids.has(tid)) { found = path.join(D.dir, D.ids.get(tid)); break; }
        }
      }
    }
    if (found) { out[rom.id] = found; continue; }
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
// what Cartridge keeps of a RomM game (electron/romm.js, tested against several RomM versions)
const { slimRom, userOf, rommTooOld, ROMM_MIN } = require('./romm');

function publicLibrary() {
  if (!library) return null;
  return {
    platforms: library.platforms.map((p) => ({ ...p, target: platformPath(p) })),
    roms: library.roms,
    firstSeen: library.firstSeen,
    syncedAt: library.syncedAt,
    lastNew: library.lastNew || [],
    collections: library.collections || [],
    local: !!library.local,
  };
}

function computeInstalled() {
  const out = {};
  if (!library) return out;
  for (const p of library.platforms) Object.assign(out, installedState(library.roms[p.id] || [], p));
  installedMap = out;
  try { identity.bump(); } catch {} // the game identity index follows what's on the device (defined further down)
  playSyncAt = 0; // play time can be matched to games now: sync again
  broadcast('installed', out);
  return out;
}

async function syncLibrary() {
  if (syncing) return syncing;
  syncing = (async () => {
    const started = Date.now();
    // without RomM (0.9.17): the games already in the console folders
    if (config.localOnly) {
      try {
        const { platforms, roms } = require('./localLibrary').build(config.romsRoot);
        const prevSeen = library?.firstSeen || {}, firstSeen = {};
        for (const list of Object.values(roms)) for (const r of list) firstSeen[r.id] = prevSeen[r.id] || 1;
        library = { platforms, roms, firstSeen, syncedAt: Date.now(), base: null, lastNew: [], collections: [], local: true };
        saveJson(LIBRARY_FILE, library, false);
        computeInstalled();
        const total = Object.values(roms).reduce((n, l) => n + l.length, 0);
        broadcast('library', publicLibrary()); broadcast('sync', { state: 'done', added: 0, removed: 0, total, local: true });
        return { state: 'done', total, local: true };
      } finally { syncing = null; }
    }
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
// The image pipeline (0.9.48): a picture is kept at the size it's shown, not the size it was made. With ?w= (covers ask
// for their card size) and for every sharp hero (asked at this screen's width), a copy is shrunk once and kept beside
// the original (<file>.w<width>), so the interface decodes a 360 px cover instead of a 600 px one, and a 1280 px
// banner instead of a 3840 px one on a handheld. Only ever smaller; GIFs and SVGs (animation, drawings) untouched;
// anything nativeImage can't read is served as it was.
async function sizedImage(buf, type, w, file, jpeg = false) {
  if (!w || !buf || !/jpe?g|png|webp/i.test(type || '')) return null;
  const out = file + '.w' + w;
  try { const b = await fsp.readFile(out); return { buf: b, type: (await fsp.readFile(out + '.type', 'utf8').catch(() => '')) || 'image/jpeg' }; } catch {}
  try {
    const { nativeImage } = require('electron');
    const im = nativeImage.createFromBuffer(buf);
    if (im.isEmpty() || im.getSize().width <= w * 1.15) return null; // already about that size
    const small = im.resize({ width: w, quality: 'better' });
    const png = !jpeg && /png/i.test(type), b = png ? small.toPNG() : small.toJPEG(88), t = png ? 'image/png' : 'image/jpeg';
    fsp.writeFile(out, b).then(() => fsp.writeFile(out + '.type', t)).catch(() => {});
    return { buf: b, type: t };
  } catch { return null; }
}
async function trimImageCache(limit) {
  let names = []; try { names = await fsp.readdir(IMG_CACHE); } catch { return; }
  const files = [];
  for (const n of names) { try { const st = await fsp.stat(path.join(IMG_CACHE, n)); files.push({ n, size: st.size, t: st.mtimeMs }); } catch {} }
  let total = files.reduce((a, f) => a + f.size, 0);
  if (total <= limit) return;
  files.sort((a, b) => a.t - b.t);
  let gone = 0;
  for (const f of files) { if (total <= limit * 0.8) break; try { await fsp.unlink(path.join(IMG_CACHE, f.n)); total -= f.size; gone++; } catch {} }
  log('image cache trimmed', gone, 'files, now', Math.round(total / 1048576), 'MB');
}
// the width a full-screen picture needs on this screen, in steps so a resize doesn't make a new copy every time
function screenWidth() {
  try { const d = screen.getPrimaryDisplay(); return Math.min(3840, Math.max(1280, Math.ceil((d.size.width * (d.scaleFactor || 1)) / 640) * 640)); } catch { return 1920; }
}
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
    try { return new Response(await fsp.readFile(p), { headers: { 'Content-Type': /\.svg$/i.test(p) ? 'image/svg+xml' : 'image/png', 'Cache-Control': 'max-age=86400' } }); } catch { return new Response('nf', { status: 404 }); }
  }
  const wh = u.searchParams.get('wh');
  if (wh) {
    let body = ''; try { body = await fsp.readFile(path.join(USER_DATA, 'start-widgets', path.basename(wh).replace(/[^\w-]/g, '') + '.html'), 'utf8'); } catch { return new Response('nf', { status: 404 }); }
    const base = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>html,body{margin:0;height:100%;color:#fff;font-family:Inter,system-ui,sans-serif;background:transparent;overflow:hidden}</style>';
    return new Response(base + body, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  const sti = u.searchParams.get('st');
  if (sti) {
    const f = path.join(USER_DATA, 'start-images', path.basename(sti));
    const type = { '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' }[path.extname(f).toLowerCase()] || 'image/jpeg';
    try { return new Response(await fsp.readFile(f), { headers: { 'Content-Type': type, 'Cache-Control': 'max-age=31536000' } }); } catch { return new Response('nf', { status: 404 }); }
  }
  const hz = u.searchParams.get('hz');
  if (hz) {
    try {
      const f = path.join(HERO_DIR, path.basename(hz)), b = await fsp.readFile(f);
      const sz = await sizedImage(b, 'image/png', Number(u.searchParams.get('w')) || screenWidth(), f, true); // heroes are opaque: JPEG
      return new Response(sz ? sz.buf : b, { headers: { 'Content-Type': sz ? sz.type : 'image/png', 'Cache-Control': 'max-age=31536000' } });
    } catch { return new Response('nf', { status: 404 }); }
  }
  const lf = u.searchParams.get('f');
  if (lf) {
    try { return new Response(await fsp.readFile(path.join(LOGO_DIR, path.basename(lf))), { headers: { 'Content-Type': 'image/png' } }); } catch { return new Response('nf', { status: 404 }); }
  }
  const target = u.searchParams.get('u');
  if (!target) return new Response('bad', { status: 400 });
  const key = crypto.createHash('sha1').update(target).digest('hex');
  const file = path.join(IMG_CACHE, key);
  // RomM's Sony controllers carry its parody marks ("ROMMY"): Sony's own wordmark and logo go in (0.9.31)
  const sony = require('./sonyArt'), sonySlug = sony.isSonyArt(target), mark = (b) => (sonySlug ? sony.fix(sonySlug, b) : b);
  const want = Math.min(2000, Number(u.searchParams.get('w')) || 0);
  try {
    const buf = mark(await fsp.readFile(file));
    const type = (await fsp.readFile(file + '.type', 'utf8').catch(() => '')) || 'image/jpeg';
    const sz = !sonySlug && want ? await sizedImage(buf, type, want, file) : null;
    return new Response(sz ? sz.buf : buf, { headers: { 'Content-Type': sz ? sz.type : type, 'Cache-Control': 'max-age=31536000' } });
  } catch {}
  // away from the server (0.9.52): the small copy libraryArt() kept serves a card at once, and stands in for any size
  // when RomM can't be reached
  const libFile = path.join(LIB_ART, key + '.jpg');
  const fromLib = async () => { try { return new Response(await fsp.readFile(libFile), { headers: { 'Content-Type': 'image/jpeg' } }); } catch { return null; } };
  if (want && want <= LIB_ART_W * 1.15 && !sonySlug) { const r = await fromLib(); if (r) return r; }
  try {
    let url, headers = {};
    if (/^https?:\/\//.test(target)) url = target.replace(/^\/\//, 'https://');
    else { url = (await resolveBase()) + (target.startsWith('/') ? '' : '/') + target; headers = authHeaders(); delete headers.Accept; }
    if (url.startsWith('//')) url = 'https:' + url;
    // outside sites through webFetch (Electron's network, as the rest of Cartridge: sites behind Cloudflare refuse Node's)
    const r = /^https?:\/\//.test(target) ? await webFetch(url, { headers: { 'User-Agent': 'Cartridge (https://github.com/abdu2304/cartridge)' }, signal: AbortSignal.timeout(20000) }) : await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return (await fromLib()) || new Response('nf', { status: 404 });
    const buf = Buffer.from(await r.arrayBuffer());
    const type = r.headers.get('content-type') || 'image/jpeg';
    await fsp.mkdir(IMG_CACHE, { recursive: true }).then(() => Promise.all([fsp.writeFile(file, buf), fsp.writeFile(file + '.type', type)])).catch(() => {});
    const sz = !sonySlug && want ? await sizedImage(buf, type, want, file) : null;
    return new Response(sz ? sz.buf : mark(buf), { headers: { 'Content-Type': sz ? sz.type : type } });
  } catch {
    return (await fromLib()) || new Response('err', { status: 502 });
  }
}
// Every game's cover kept small (0.9.52, owner: a RomM at home with no tunnel; away, the library should still look
// whole, without taking much room). Once the library is synced and RomM answers, each cover is fetched once, shrunk
// to a 360 px JPEG (about 25 KB, so 2,000 games is about 50 MB) and kept apart from the picture cache, which trims
// itself. Covers of games that left the library are dropped. The budget stops it at 250 MB on very big libraries.
const LIB_ART_W = 360, LIB_ART_MAX = 250 * 1048576;
async function libraryArt() {
  if (!library || library.local || !config.configured) return;
  const want = new Map();
  for (const list of Object.values(library.roms || {})) for (const r of list) { const p = r.path_cover_small || r.path_cover_large || r.url_cover; if (p) want.set(crypto.createHash('sha1').update(p).digest('hex'), p); }
  await fsp.mkdir(LIB_ART, { recursive: true });
  let have = []; try { have = await fsp.readdir(LIB_ART); } catch {}
  let total = 0;
  for (const n of have) { const k = n.replace(/\.jpg$/, ''); if (!want.has(k)) await fsp.unlink(path.join(LIB_ART, n)).catch(() => {}); else { total += (await fsp.stat(path.join(LIB_ART, n)).catch(() => ({ size: 0 }))).size; want.delete(k); } }
  if (!want.size) return;
  let base; try { base = await resolveBase(); } catch { return; }
  if (!base || !(await probe(base, config.server, 4000).catch(() => null))?.ok) return; // not reachable: next time
  const { nativeImage } = require('electron');
  let made = 0;
  for (const [k, p] of want) {
    if (total > LIB_ART_MAX || gameFocus.away || runOn) break; // a game started: stop, carry on next time
    try {
      let url, headers = {};
      if (/^https?:\/\//.test(p)) url = p; else { url = base + (p.startsWith('/') ? '' : '/') + p; headers = authHeaders(); delete headers.Accept; }
      const r = /^https?:\/\//.test(p) ? await webFetch(url, { signal: AbortSignal.timeout(20000) }) : await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
      if (!r.ok) continue;
      const im = nativeImage.createFromBuffer(Buffer.from(await r.arrayBuffer()));
      if (im.isEmpty()) continue;
      const b = (im.getSize().width > LIB_ART_W ? im.resize({ width: LIB_ART_W, quality: 'better' }) : im).toJPEG(82);
      await fsp.writeFile(path.join(LIB_ART, k + '.jpg'), b);
      total += b.length; made++;
    } catch {}
    await new Promise((ok) => setTimeout(ok, 120)); // gentle on the server and the device
  }
  if (made) log('library art: kept', made, 'covers,', Math.round(total / 1048576), 'MB in all');
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
  const r = await webFetch(SGDB_BASE() + pathname, { headers: { Authorization: 'Bearer ' + config.sgdbKey }, signal: AbortSignal.timeout(12000) });
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
  const r = await webFetch(`${RA_BASE()}/API/API_${name}.php?${q}`, { headers: { 'User-Agent': `Cartridge/${app.getVersion()}` }, signal: AbortSignal.timeout(15000) });
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
      // the picture keeps its address when it changes, and images are cached by address: ask again every
      // few hours, and at once on Refresh (0.9.3 L)
      avatar: profile.UserPic ? `${raMedia(profile.UserPic)}${raMedia(profile.UserPic).includes('?') ? '&' : '?'}v=${force ? Date.now() : Math.floor(Date.now() / 216e5)}` : '',
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
        const r = await webFetch(SYSLOGO_BASE + n + '.svg', { signal: AbortSignal.timeout(10000) });
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

// one image into the image cache (the same file handleImage serves), unless it's there already
async function prefetchImage(target) {
  const file = path.join(IMG_CACHE, crypto.createHash('sha1').update(target).digest('hex'));
  if (fs.existsSync(file)) return;
  let url = target, headers = {};
  if (!/^https?:\/\//.test(target)) { url = (await resolveBase()) + (target.startsWith('/') ? '' : '/') + target; headers = authHeaders(); delete headers.Accept; }
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!r.ok) return;
  const buf = Buffer.from(await r.arrayBuffer());
  await fsp.mkdir(IMG_CACHE, { recursive: true });
  await Promise.all([fsp.writeFile(file, buf), fsp.writeFile(file + '.type', r.headers.get('content-type') || 'image/jpeg')]);
}
// Fetch all: prepare logos and the rest of the art for the whole library in the background, reporting progress.
let fetchAll = null; // { done, total, found, stop }
async function fetchAllLogos(kinds = null) {
  if (fetchAll) return { running: true };
  // 0.9.24 Look & Feel → Metadata: everything, or only logos, heroes (backgrounds) or covers and screenshots
  const want = (k) => !kinds || kinds.includes(k);
  const roms = library ? Object.values(library.roms).flat() : [];
  fetchAll = { done: 0, total: roms.length, found: 0, stop: false };
  const report = (state) => broadcast('logos-progress', { state, done: fetchAll.done, total: fetchAll.total, found: fetchAll.found });
  report('running');
  let last = 0;
  try {
    for (const r of roms) {
      if (fetchAll.stop) break;
      const romm = r.logo || '';
      if (want('logos')) try { if (await logoFor({ id: r.id, name: r.name, romm })) fetchAll.found++; } catch (e) { if (e.auth) { report('error'); throw e; } }
      // 0.9.15, Fetch all metadata: the rest of each game's art too, so nothing loads while you browse:
      // its sharpest background (SteamGridDB, with a key), cover and first screenshot into the image cache
      if (want('heroes')) await sharpHero({ id: r.id, name: r.name }).catch(() => {});
      if (want('covers')) for (const t of [r.path_cover_large || r.url_cover, r.shot]) if (t) await prefetchImage(t).catch(() => {});
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
// The sharpest background for headers and the idle screen (0.9.3 K, F2/F3): SteamGridDB's hero at
// 3840 wide, else 1920 (sgdbImage), saved once per game. RomM's screenshot stays the fallback. A game
// without one is asked again after a week.
const HERO_DIR = path.join(USER_DATA, 'heroes');
const HERO_FILE = path.join(USER_DATA, 'heroes.json');
let heroCache = {};
try { heroCache = JSON.parse(fs.readFileSync(HERO_FILE, 'utf8')); } catch {}
const heroInflight = new Map();
async function sharpHero({ id, name, aspect }) {
  if (!id || !name) return null;
  const c = heroCache[id];
  if (c?.file && fs.existsSync(path.join(HERO_DIR, c.file))) return 'romimg://img/?hz=' + encodeURIComponent(c.file);
  if (!config.sgdbKey || (c && !c.file && Date.now() - c.t < 7 * 864e5)) return null;
  if (heroInflight.has(id)) return heroInflight.get(id);
  const job = (async () => {
    let png = null;
    try { png = await sgdbImage(String(name).replace(/[™®©]/g, ''), 'hero', undefined, Number(aspect) || 0); } catch { return null; } // offline: try again later
    const file = png ? `${String(id).replace(/[^\w-]/g, '')}.png` : null;
    if (png) { await fsp.mkdir(HERO_DIR, { recursive: true }); await fsp.writeFile(path.join(HERO_DIR, file), png); }
    heroCache[id] = { file, t: Date.now() };
    fsp.writeFile(HERO_FILE, JSON.stringify(heroCache)).catch(() => {});
    return file ? 'romimg://img/?hz=' + encodeURIComponent(file) : null;
  })();
  heroInflight.set(id, job);
  try { return await job; } finally { heroInflight.delete(id); }
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
  const { abort, dlw, dlwIdle, dlJob, ...rest } = it; // the worker and its timer never go to the screen
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

async function restoreBackup(it) {
  const orig = it.backup.replace(/\.cartridge-old$/, '');
  try {
    await fsp.rm(orig, { recursive: true, force: true });
    await fsp.rm(orig + '.partial', { recursive: true, force: true }).catch(() => {});
    await fsp.rename(it.backup, orig);
    it.backup = null;
    log('re-download stopped, old copy back', path.basename(orig));
    computeInstalled();
  } catch (e) { log('restore after re-download failed', e.message); }
}
// Re-download a damaged game: its copy is moved aside (same drive, so it's instant), a fresh one is
// downloaded, and the old copy is deleted only once the new one has passed its checks
async function redownload(romId) {
  const target = manifest[romId]?.path || installedMap[romId];
  if (!target || target === MARKED) throw new Error('This game has no downloaded copy.');
  const roots = new Set([config.romsRoot, ...extraRoots(), ...(library?.platforms || []).flatMap((pl) => platformDirs(pl))].filter(Boolean).map((x) => path.resolve(x)));
  if (roots.has(path.resolve(target))) throw new Error('Refusing to move a whole console folder');
  const r = romIndexMain().get(romId);
  if (!r) throw new Error('Game not found');
  const backup = target.replace(/\/+$/, '') + '.cartridge-old';
  await fsp.rm(backup, { recursive: true, force: true }).catch(() => {});
  if (fs.existsSync(target)) await fsp.rename(target, backup);
  return enqueue({ romId, name: r.name, platformSlug: r.platform_slug, platformName: r.platform_display_name, size: r.fs_size_bytes, cover: r.path_cover_small || r.url_cover, backup: fs.existsSync(backup) ? backup : null, redo: true });
}
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

// 0.9.16: each file downloads in a worker thread (dlWorker.js) so nothing else in Cartridge can slow it
// (owner: 70 MB/s fell to 7). The speed limit is shared between the downloads running at once.
let dlWorkersOk = true;
// opts.plain: a download that isn't from RomM (PS3 updates from Sony): RomM's sign-in never goes along
async function downloadTo(url, dest, it, onBytes, opts = {}) {
  if (!dlWorkersOk) return downloadHere(url, dest, it, onBytes, opts);
  const part = dest + '.part';
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  let start = 0;
  try { start = (await fsp.stat(part)).size; } catch {}
  const headers = opts.plain ? {} : authHeaders();
  delete headers.Accept;
  const lim = (config.downloads.limitMBs || 0) * 1048576;
  const running = Math.max(1, queue.filter((q) => q.status === 'downloading').length);
  // one worker per download item, reused for each of its files (0.9.21: a new thread and connection per
  // file made folder games of thousands of files crawl); it ends 3 s after its last file
  clearTimeout(it.dlwIdle);
  let w = it.dlw;
  if (!w) {
    try { w = it.dlw = new (require('worker_threads').Worker)(path.join(__dirname, 'dlWorker.js')); }
    catch (e) { log('download worker could not start, downloading here', e.message); dlWorkersOk = false; return downloadHere(url, dest, it, onBytes, opts); }
    w.on('exit', () => { if (it.dlw === w) it.dlw = null; });
  }
  const job = (it.dlJob = (it.dlJob || 0) + 1);
  const r = await new Promise((resolve, reject) => {
    const onAbort = () => { try { w.postMessage('abort'); } catch {} setTimeout(() => { if (!settled) w.terminate(); }, 500); };
    it.abort.signal.addEventListener('abort', onAbort, { once: true });
    let settled = false;
    const end = (fn, v) => { if (settled) return; settled = true; it.abort.signal.removeEventListener('abort', onAbort); w.off('message', onMsg); w.off('error', onErr); w.off('exit', onExit); fn(v); };
    const onMsg = (m) => {
      if (m.job !== job) return;
      if (m.type === 'start') { if (m.resumed) onBytes(start); }
      else if (m.type === 'bytes') onBytes(m.n);
      else if (m.type === 'restart') end(resolve, 'restart');
      else if (m.type === 'done') { if (m.bytes > 64 << 20) log('downloaded', path.basename(dest), Math.round(m.bytes / 1048576) + ' MB at', (m.bytes / 1048576 / Math.max(0.001, m.ms / 1000)).toFixed(1) + ' MB/s'); end(resolve, 'done'); }
      else if (m.type === 'error') end(reject, Object.assign(new Error(m.message), m.message === 'aborted' ? { name: 'AbortError' } : {}));
    };
    const onErr = (e) => end(reject, e);
    const onExit = () => end(reject, Object.assign(new Error(it.abort.signal.aborted ? 'aborted' : 'Download stopped'), it.abort.signal.aborted ? { name: 'AbortError' } : {}));
    w.on('message', onMsg); w.on('error', onErr); w.on('exit', onExit);
    w.postMessage({ type: 'job', job, url, headers, part, start, limit: lim ? Math.floor(lim / running) : 0 });
  });
  if (it.dlw === w) it.dlwIdle = setTimeout(() => { if (it.dlw === w) { it.dlw = null; w.terminate(); } }, 3000);
  if (r === 'restart') { await fsp.rm(part, { force: true }); return downloadTo(url, dest, it, onBytes, opts); }
  await fsp.rename(part, dest);
}
// the old way, on the main thread: only when a worker can't start
async function downloadHere(url, dest, it, onBytes, opts = {}) {
  const part = dest + '.part';
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  let start = 0;
  try { start = (await fsp.stat(part)).size; } catch {}
  const headers = opts.plain ? {} : authHeaders();
  delete headers.Accept;
  if (start > 0) headers.Range = `bytes=${start}-`;
  const r = await fetch(url, { headers, signal: it.abort.signal });
  if (r.status === 416) { start = 0; await fsp.rm(part, { force: true }); return downloadHere(url, dest, it, onBytes, opts); }
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
    const target = downloadDir({ slug: rom.platform_slug, fs_slug: rom.platform_fs_slug }, rom.fs_size_bytes || 0, it.root || null); // 0.9.38: any drive; 0.9.49: the one asked for
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
    // a PS3 game as .pkg: Downloads offers to install it in RPCS3 (nothing installs until pressed)
    try { if (pkgInst.packagesIn(finalPath).pkgs.length) { it.notice = 'pkg'; it.installIn = 'RPCS3'; } else if (/psvita/i.test(`${rom.platform_slug} ${rom.platform_fs_slug}`) && (await pkgInst.vitaContent(finalPath))) { it.notice = 'pkg'; it.installIn = 'Vita3K'; } } catch {}
    it.status = 'done';
    it.received = it.total;
    it.path = finalPath;
    manifest[rom.id] = { path: finalPath, platformSlug: rom.platform_slug, name: rom.name || rom.fs_name, at: Date.now() };
    saveManifest();
    installedMap[rom.id] = finalPath;
    broadcast('installed-changed', { romId: rom.id, path: finalPath });
    // a re-download (library check): the new copy is in, so the old one kept aside goes
    if (it.backup) { await fsp.rm(it.backup, { recursive: true, force: true }).catch(() => {}); it.backup = null; }
    // a re-download is the same game as before: Steam already has it, so no automatic add
    if (!it.redo && it.notice !== 'pkg') rpcs3Settings(rom.id);
    if (!it.redo && it.notice !== 'pkg') try { if (steamMgr.onDownloaded(rom.id)) broadcast('steam-auto', { romId: rom.id, name: rom.name, action: 'add' }); } catch (e) { log('steam auto add', e.message); }
    autoBios(rom.platform_id, rom.platform_slug); // in the background, never holds the download up
  } catch (e) {
    // stopped on purpose: keep a status set since (paused, or queued again by Resume)
    if (ac.signal.aborted) { if (!['paused', 'queued'].includes(it.status)) it.status = 'cancelled'; }
    // 0.9.52: away from a RomM with no tunnel the library still shows; say so plainly instead of a network code
    else { it.status = 'error'; it.error = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|fetch failed|ERR_(NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION_|ADDRESS_UNREACHABLE)/.test(String(e.message)) ? 'Your RomM server can’t be reached from here. Games already on this device still play; try again when you’re back on its network.' : e.message; }
    // a re-download that didn't finish: the old copy goes back, so the game is never left missing
    if (it.backup && ['error', 'cancelled'].includes(it.status)) await restoreBackup(it);
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
  // 0.9.17: no BIOS folder yet: EmuDeck's (where its emulators look), else one of Cartridge's own
  if (!dir) {
    const emu = readEmuDeckSettings();
    dir = emu.emulationPath && fs.existsSync(path.join(emu.emulationPath, 'bios')) ? path.join(emu.emulationPath, 'bios') : path.join(USER_DATA, 'bios');
    config.biosPath = dir; saveConfig();
  }
  await fsp.mkdir(dir, { recursive: true });
  const done = [];
  for (const f of list) {
    const dest = path.join(dir, f.file_name);
    if (fs.existsSync(dest)) { done.push({ name: f.file_name, skipped: true }); continue; }
    const fake = { abort: new AbortController() };
    await downloadTo(`${base}/api/firmware/${f.id}/content/${encodeURIComponent(f.file_name)}`, dest, fake, () => {});
    done.push({ name: f.file_name });
  }
  // PS3 and Vita firmware does nothing in a folder: the emulator installs it (0.9.16)
  const emu = /^ps3$/i.test(slug) ? 'rpcs3' : /^(psvita|vita)$/i.test(slug) ? 'vita3k' : null;
  let installed = 0;
  if (emu) {
    const cmd = emu === 'rpcs3' ? steamMgr.rpcs3Command() : steamMgr.vita3kCommand();
    // 0.9.37 (owner: BIOS comes before the emulators in the welcome): kept in the BIOS folder and installed by
    // biosSetup() as soon as the emulator is installed, instead of failing here
    if (!cmd) { log('firmware kept for later', emu, dir); return { count: list.length, files: done, dir, installed: 0, emu, placed: 0, pending: true }; }
    for (const f of list.filter((x) => /\.pup$/i.test(x.file_name)).sort((a, b) => /font/i.test(a.file_name) - /font/i.test(b.file_name))) {
      await pkgInst.installFirmware({ emu, cmd, file: path.join(dir, f.file_name) });
      installed++;
      log('firmware installed', emu, f.file_name);
    }
  }
  // 0.9.17: copied into each emulator set up here that reads it from its own folder (never over a file)
  const key = { dc: 'dreamcast', 'sega-cd': 'segacd', megacd: 'segacd', 'pc-engine-cd': 'pcenginecd', 'turbografx-cd': 'pcenginecd', vita: 'psvita' }[slug] || slug;
  const placed = require('./bios').place(key, dir, { roots: emuRootsAll(), steamRoots: steamMgr.steamRoots?.() || [] });
  if (key === 'switch') placed.push(...(await switchFirmware(list.filter((f) => /\.zip$/i.test(f.file_name)).map((f) => path.join(dir, f.file_name)))));
  if (placed.length) log('bios placed', key, placed.length);
  return { count: list.length, files: done, dir, installed, emu, placed: placed.length };
}
// 0.9.38 (owner: "BIOS and firmware set up automatically? I don't think so, check the code"): it only came from
// RomM when Get Them from RomM was pressed. Now a finished download for a console whose BIOS or firmware isn't in
// place yet fetches that console's files from RomM by itself (once per console each run), then puts them in place
const autoBiosTried = new Set();
const BIOS_KEY = (slug) => ({ dc: 'dreamcast', 'sega-cd': 'segacd', megacd: 'segacd', 'pc-engine-cd': 'pcenginecd', 'turbografx-cd': 'pcenginecd', vita: 'psvita' })[slug] || slug;
async function autoBios(platformId, slug) {
  try {
    const B = require('./bios'), key = BIOS_KEY(slug);
    if (!platformId || platformId < 0 || autoBiosTried.has(platformId) || !B.KEYS().includes(key)) return;
    const st = B.status(key, { roots: emuRootsAll(), steamRoots: steamMgr.steamRoots?.() || [], extra: [] });
    if (!st || st.ok || st.optional) return;
    autoBiosTried.add(platformId);
    const r = await downloadBios(platformId, slug);
    if (!r.count) return log('bios: RomM has none for', slug);
    const b = await biosSetup({ install: true });
    const now = b.list.find((x) => x.key === key);
    log('bios auto', slug, `${r.count} from RomM`, now?.ok ? 'in place' : now?.why || '');
    if (now?.ok) broadcast('toast', { text: `${now.label} set up from your RomM server`, kind: 'ok', icon: 'mdiChip' });
  } catch (e) { log('bios auto', slug, e.message); }
}
// BIOS and firmware put in place by themselves (0.9.37, owner: "after the emulators are downloaded, Cartridge puts
// the BIOS and firmware where each emulator reads it, or installs it"). From the BIOS folder(s) (yours, EmuDeck's or
// Cartridge's, and each Emulation root's bios/): copied into every set-up emulator that reads files (never over a
// file), PS3 and Vita firmware installed through RPCS3/Vita3K when they don't have it, Switch keys and firmware into
// the yuzu family's keys and NAND. install: false only copies (the quick pass at start).
let biosRun = null;
// "in place" means where emulators read it: their own folders, RetroArch's system folder and each Emulation root's
// bios/ (EmuDeck points its emulators there); Cartridge's BIOS folder alone doesn't count
async function biosSetup({ install = true } = {}) {
  if (biosRun) return biosRun;
  biosRun = (async () => {
    const B = require('./bios'), roots = emuRootsAll(), steamRoots = steamMgr.steamRoots?.() || [];
    const dirs = [...new Set([config.biosPath, ...roots.map((r) => path.join(r, 'bios'))].filter((d) => d && isDir(d)))];
    const filesIn = (re) => dirs.flatMap((d) => { try { return fs.readdirSync(d).filter((n) => re.test(n)).map((n) => path.join(d, n)); } catch { return []; } });
    const out = [];
    for (const key of B.KEYS()) {
      const opts = { roots, steamRoots, extra: [] };
      const before = B.status(key, opts);
      let copied = 0, installed = 0, why = '';
      if (key === 'ps3' || key === 'psvita') {
        const pups = filesIn(key === 'ps3' ? /^PS3UPDAT\.PUP$/i : /^(PSVUPDAT|PSP2UPDAT)\.PUP$/i).sort((a, b) => /PSP2/i.test(a) - /PSP2/i.test(b));
        if (!before.ok && pups.length) {
          const emu = key === 'ps3' ? 'rpcs3' : 'vita3k', cmd = emu === 'rpcs3' ? steamMgr.rpcs3Command() : steamMgr.vita3kCommand();
          if (!cmd) why = `${emu === 'rpcs3' ? 'RPCS3' : 'Vita3K'} isn’t set up yet: the firmware installs as soon as it is`;
          else if (!install) why = 'Ready to install';
          else for (const f of pups) { try { await pkgInst.installFirmware({ emu, cmd, file: f }); installed++; log('firmware installed', emu, path.basename(f)); } catch (e) { why = e.message; log('firmware not installed', emu, e.message); } }
        } else if (!before.ok) why = 'Not in your BIOS folder: get it from RomM';
      } else {
        for (const d of dirs) copied += B.place(key, d, { roots, steamRoots }).length;
        if (key === 'switch') copied += (await switchFirmware(filesIn(/\.zip$/i).filter((f) => !/^(neogeo|pgm|naomi|awbios|hod2bios|skns|stvbios|cpzn\d|taitofx1|coh\d+)\.zip$/i.test(path.basename(f))))).length; // a zip with .nca files in it
      }
      const after = B.status(key, opts);
      out.push({ key, label: after.label, ok: after.ok, optional: after.optional, where: after.where, look: after.look, names: after.names || [], hint: after.hint, copied, installed, why: after.ok ? '' : why || (after.optional ? '' : 'Not found in your BIOS folder') });
    }
    const did = out.reduce((n, x) => n + x.copied + x.installed, 0);
    if (did) log('bios setup', out.filter((x) => x.copied || x.installed).map((x) => `${x.key}: ${x.copied} copied${x.installed ? ', firmware installed' : ''}`).join('; '));
    return { list: out, did, dirs };
  })();
  try { return await biosRun; } finally { biosRun = null; }
}
// Switch firmware from RomM (a zip of .nca files) into each yuzu-family emulator that has none yet
async function switchFirmware(zips) {
  const out = [];
  for (const nand of require('./bios').switchNandDirs()) {
    if (fs.existsSync(nand) && fs.readdirSync(nand).some((n) => /\.nca$/i.test(n))) continue;
    for (const zf of zips) {
      const z = await openZip(zf).catch(() => null); if (!z) continue;
      try {
        const ncas = (await zipEntries(z)).filter((e) => /\.nca$/i.test(e.fileName) && !/\/$/.test(e.fileName));
        if (!ncas.length) continue;
        await fsp.mkdir(nand, { recursive: true });
        for (const e of ncas) {
          const to = path.join(nand, path.basename(e.fileName));
          if (fs.existsSync(to)) continue;
          const rs = await new Promise((ok, bad) => z.openReadStream(e, (err, st) => (err ? bad(err) : ok(st))));
          await new Promise((ok, bad) => { const ws = fs.createWriteStream(to, { flags: 'wx' }); rs.on('error', bad); ws.on('error', bad); ws.on('finish', ok); rs.pipe(ws); });
          out.push(to);
        }
        log('switch firmware', nand, ncas.length);
        break;
      } finally { z.close(); }
    }
  }
  return out;
}

// A game deleted file by file, so its card can show real progress (0.9.3). Links are removed, never
// followed. Big folder games (PS3, PS4, Switch) take a while; a single file is near instant.
async function removeWithProgress(target, romId) {
  const files = [];
  const walk = async (p) => {
    const st = await fsp.lstat(p).catch(() => null);
    if (!st) return;
    if (st.isDirectory()) { for (const n of await fsp.readdir(p).catch(() => [])) await walk(path.join(p, n)); }
    else files.push([p, st.size]);
  };
  await walk(target);
  const total = files.reduce((s, [, n]) => s + n, 0) || 1;
  let done = 0, last = 0;
  broadcast('delete-progress', { romId, pct: 0 });
  for (const [f, n] of files) {
    await fsp.rm(f, { force: true });
    done += n;
    if (Date.now() - last > 100) { last = Date.now(); broadcast('delete-progress', { romId, pct: Math.round((done / total) * 100) }); }
  }
  await fsp.rm(target, { recursive: true, force: true });
  broadcast('delete-progress', { romId, pct: 100 });
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
  for (const r of extraRoots()) if (isDir(r)) await addDrive(r); // 0.9.38: games folders on other drives
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
// ---------------------------------------------------------------- 0.9.3 D: PS3 packages through RPCS3
const pkgInst = require('./pkgInstall');
let pkgRun = null; // one install at a time: { romId, ac }
const emuRootsAll = () => { try { const emu = readEmuDeckSettings(); return require('./trophies').emulationRoots([emu.emulationPath, config.romsRoot && path.dirname(config.romsRoot)].filter(Boolean)); } catch { return []; } };
const rpcs3Hdds = () => pkgInst.rpcs3Hdds(os.homedir(), emuRootsAll());
const emuRoots = (emu) => (emu === 'vita3k' ? pkgInst.vitaPrefs(os.homedir(), emuRootsAll()) : rpcs3Hdds());
// licences an installed RPCS3 game still lacks: [{ contentId }]. From what was recorded at install
// time, else read from the game's EBOOT.BIN (games installed before this was recorded)
function installedLicences(rec) {
  const hdds = rpcs3Hdds();
  let need = rec.needs;
  if (!need) { const n = pkgInst.npdOf(rec.dir); need = n?.needsRap ? [n.contentId] : []; }
  return need.filter((cid) => !pkgInst.exdataHas(hdds, cid)).map((contentId) => ({ contentId }));
}
// .rap licences for a game from RomM: among the game's own files, or a RomM entry named after its
// content ID or title ID. Downloaded into dir; returns { contentId: file }.
async function rapsFromRomm(romId, need, dir) {
  const out = {};
  if (!need.length) return out;
  const base = await resolveBase();
  const cands = [];
  try { for (const f of (await api(`/api/roms/${romId}`)).files || []) if (/\.rap$/i.test(f.file_name)) cands.push({ name: f.file_name, own: true, url: `${base}/api/roms/${f.id}/files/content/${encodeURIComponent(f.file_name)}` }); } catch {}
  for (const pl of library?.platforms || []) for (const r of library.roms[pl.id] || []) {
    const n = String(r.fs_name || '').toUpperCase();
    if (n.endsWith('.RAP') && need.some((x) => n.includes(x.contentId.toUpperCase()) || n.includes(x.titleId || '~'))) cands.push({ name: r.fs_name, url: `${base}/api/roms/${r.id}/content/${encodeURIComponent(r.fs_name)}` });
  }
  const own = cands.filter((c) => c.own);
  for (const x of need) {
    const c = cands.find((k) => k.name.toUpperCase().includes(x.contentId.toUpperCase())) || cands.find((k) => x.titleId && k.name.toUpperCase().includes(x.titleId)) || (need.length === 1 && own.length === 1 ? own[0] : null);
    if (!c) continue;
    const dest = path.join(dir, 'romm', `${x.contentId}.rap`);
    try { await downloadTo(c.url, dest, { abort: new AbortController() }, () => {}); if (fs.statSync(dest).size === 16) out[x.contentId] = dest; } catch (e) { log('rap from RomM', e.message); }
  }
  return out;
}
// ---------------------------------------------------------------- PS3 game updates (0.9.16)
const PS3UP_FILE = path.join(USER_DATA, 'ps3-updates.json');
const ps3upCache = loadJson(PS3UP_FILE, {}); // serial -> { t, title, packages }
let ps3upRun = null;
async function ps3UpdateInfo(romId, { fresh = false } = {}) {
  const where = installedMap[romId];
  if (!where || where === MARKED) return null;
  const serial = ps3Serial(romId, where);
  if (!serial) return null;
  const have = patchesMod.ps3Version(installs[romId]?.dir || where, rpcs3Hdds(), serial);
  let c = ps3upCache[serial];
  if (fresh || !c || Date.now() - c.t > 12 * 3600e3) {
    try { c = ps3upCache[serial] = { t: Date.now(), ...(await require('./ps3Updates').updatesFor(serial)) }; saveJson(PS3UP_FILE, ps3upCache); }
    catch (e) { log('ps3 updates', serial, e.message); if (!c) return { romId, serial, have, error: e.message, todo: [] }; }
  }
  const todo = require('./ps3Updates').newer(c.packages || [], have);
  return { romId, serial, have, latest: (c.packages || []).slice(-1)[0]?.version || null, todo, size: todo.reduce((n, p) => n + p.size, 0) };
}
async function ps3InstallUpdates(romId) {
  if (ps3upRun || pkgRun) throw new Error('Another install is running. Wait for it to finish.');
  const info = await ps3UpdateInfo(romId, { fresh: true });
  if (!info?.todo?.length) return { count: 0 };
  const cmd = steamMgr.rpcs3Command();
  if (!cmd) throw new Error('RPCS3 wasn’t found. Set it up in Settings → Emulators.');
  const hdds = rpcs3Hdds();
  if (!hdds.length) throw new Error('RPCS3’s storage wasn’t found. Open RPCS3 once, then try again.');
  const dir = path.join(os.tmpdir(), `cartridge-ps3up-${process.pid}-${Date.now()}`);
  ps3upRun = { romId, ac: new AbortController() };
  const send = (o) => broadcast('ps3-update', { romId, ...o });
  try {
    const files = [];
    const total = info.size;
    let got = 0;
    for (const [i, pk] of info.todo.entries()) {
      const dest = path.join(dir, path.basename(new URL(pk.url).pathname) || `update-${pk.version}.pkg`);
      send({ state: 'downloading', step: i + 1, of: info.todo.length, version: pk.version, pct: total ? Math.round((got / total) * 100) : 0 });
      const onB = (n) => { got += n; send({ state: 'downloading', step: i + 1, of: info.todo.length, version: pk.version, pct: total ? Math.round((got / total) * 100) : 0 }); };
      // Sony's package servers answer plain HTTP with 403 for some: the same file over HTTPS then (0.9.17)
      try { await downloadTo(pk.url, dest, { abort: ps3upRun.ac }, onB, { plain: true }); }
      catch (e) { if (e.status !== 403 && !/HTTP 403/.test(e.message)) throw e; await downloadTo(pk.url.replace(/^http:/, 'https:'), dest, { abort: ps3upRun.ac }, onB, { plain: true }); }
      if (pk.size && fs.statSync(dest).size !== pk.size) throw new Error(`Update ${pk.version} didn’t download completely. Try again.`);
      files.push(dest);
    }
    send({ state: 'installing' });
    await pkgInst.install({ cmd, hdds, files, titleIds: [info.serial], signal: ps3upRun.ac.signal, onStep: (st) => send({ state: 'installing', ...st }) });
    const now = patchesMod.ps3Version(installs[romId]?.dir || installedMap[romId], hdds, info.serial);
    log('ps3 updates installed', info.serial, info.have, '->', now);
    send({ state: 'done', version: now });
    return { count: files.length, version: now };
  } catch (e) { send({ state: 'error', error: e.message }); throw e; }
  finally { ps3upRun = null; fs.rmSync(dir, { recursive: true, force: true }); }
}
async function installPkg(romId, zrif) {
  if (pkgRun) throw new Error('Another game is being installed. Wait for it to finish.');
  const m = manifest[romId];
  if (!m?.path) throw new Error('Download the game first.');
  if (!pkgInst.packagesIn(m.path).pkgs.length) return installVitaGame(romId, zrif);
  const cmd = steamMgr.rpcs3Command();
  if (!cmd) throw new Error('RPCS3 wasn’t found. Set it up in Settings → Emulators.');
  const hdds = rpcs3Hdds();
  if (!hdds.length) throw new Error('RPCS3’s storage wasn’t found. Open RPCS3 once (it creates its folders), then try again.');
  const p = pkgInst.packagesIn(m.path);
  if (!p.pkgs.length) throw new Error('There’s no PS3 package in this game’s files.');
  // licences first, each under the name RPCS3 looks for (from the download, else from RomM); no
  // install without them: the game couldn't start ("Failed to decrypt content")
  const tmp = path.join(os.tmpdir(), `cartridge-rap-${process.pid}-${Date.now()}`);
  let plan = pkgInst.licencePlan(p, hdds);
  const fromRomm = await rapsFromRomm(romId, plan.filter((l) => l.from === 'missing'), tmp);
  if (Object.keys(fromRomm).length) plan = pkgInst.licencePlan(p, hdds, fromRomm);
  const lost = plan.filter((l) => l.from === 'missing');
  if (lost.length) { fs.rmSync(tmp, { recursive: true, force: true }); throw new Error(`RAP file not found: ${lost[0].contentId}.rap. RPCS3 needs it next to the .pkg to install this game. Add it to the game in RomM, then install again.`); }
  const files = [...pkgInst.stageLicences(plan, path.join(tmp, 'staged')), ...p.licences.filter((f) => /\.edat$/i.test(f)), ...p.pkgs.map((x) => x.file)];
  pkgRun = { romId, ac: new AbortController() };
  const send = (o) => broadcast('pkg-progress', { romId, ...o });
  try {
    send({ state: 'running', step: 0, of: files.length });
    const got = await pkgInst.install({ cmd, hdds, files, titleIds: p.titleIds, signal: pkgRun.ac.signal, onStep: (s) => send({ state: 'running', ...s }) }).finally(() => fs.rmSync(tmp, { recursive: true, force: true }));
    const main = got.find((g) => g.created) || got.find((g) => g.touched) || got[0];
    if (!main || !(main.created || main.touched)) throw new Error('RPCS3 didn’t install it. Open RPCS3 and install the .pkg there (File → Install Packages) to see why.');
    const prev = installs[romId];
    installs[romId] = { emu: 'rpcs3', serial: main.serial, dir: main.dir, created: !!(main.created || (prev?.created && prev.serial === main.serial)), at: Date.now(), files: files.map((f) => path.basename(f)), needs: plan.map((l) => l.contentId) };
    saveInstalls();
    const licenceMissing = installedLicences(installs[romId]);
    log('rpcs3 install', main.serial, main.created ? 'new' : 'updated', files.length, 'files', licenceMissing.length ? 'licence missing' : '');
    send({ state: 'done', serial: main.serial });
    afterInstall(romId);
    return { ...installs[romId], updates: p.pkgs.filter((x) => x.patch).length, licenceMissing };
  } catch (e) { send({ state: 'error', error: e.message }); throw e; }
  finally { pkgRun = null; }
}

// Once installed, its Steam shortcut can start it: one Cartridge added is updated to start it from
// the emulator; otherwise it's added when Add automatically is on (it was held back at download)
// RPCS3's database settings for a PS3 game that just arrived (0.9.3 L, patches.js rpcs3ApplyDb).
// RPCS3's own cached database first, else the same address it downloads from (kept a week here).
const RPCS3_DB_FILE = path.join(USER_DATA, 'rpcs3-config-db.json'), RPCS3_CFG_FILE = path.join(USER_DATA, 'rpcs3-configs.json');
let rpcs3Cfgs = (() => { try { return JSON.parse(fs.readFileSync(RPCS3_CFG_FILE, 'utf8')); } catch { return {}; } })();
async function rpcs3DbText(dir) {
  const own = patchesMod.rpcs3DbCached(dir);
  if (own) return own;
  try { const st = fs.statSync(RPCS3_DB_FILE); if (Date.now() - st.mtimeMs < 7 * 864e5) return fs.readFileSync(RPCS3_DB_FILE, 'utf8'); } catch {}
  const r = await webFetch('https://api.rpcs3.net/config/?api=v1', { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`RPCS3 database: HTTP ${r.status}`);
  const t = await r.text();
  await fsp.writeFile(RPCS3_DB_FILE, t).catch(() => {});
  return t;
}
async function rpcs3Settings(romId) {
  const r = romIndexMain().get(Number(romId));
  if (!/ps3/i.test(`${r?.platform_slug} ${r?.platform_fs_slug}`) || config.steam?.rpcs3Db === false) return null;
  const dir = patchesMod.rpcs3Dirs()[0];
  const serial = ps3Serial(romId, installedMap[romId]);
  if (!dir || !serial) return null;
  try {
    const { result, mine } = patchesMod.rpcs3ApplyDb(dir, serial, await rpcs3DbText(dir), rpcs3Cfgs);
    if (result === 'written') { rpcs3Cfgs = mine; saveJson(RPCS3_CFG_FILE, rpcs3Cfgs); log('rpcs3 database settings', serial); broadcast('toast', { text: `${r.name}: RPCS3's recommended settings are set for this game`, kind: 'ok', icon: 'mdiTuneVariant' }); }
    return result;
  } catch (e) { log('rpcs3 database settings', e.message); return null; }
}
function afterInstall(romId) {
  rpcs3Settings(romId);
  try {
    const st = steamMgr.forRom(romId);
    if (st.inSteam && st.ours) steamMgr.refreshGame(romId, { force: true }).then((r) => { if (r?.count && !r.fixed) broadcast('steam-auto', { romId, action: 'add' }); }).catch((e) => log('steam after install', e.message));
    else if (!st.inSteam && steamMgr.onDownloaded(romId)) broadcast('steam-auto', { romId, action: 'add' });
  } catch (e) { log('steam after install', e.message); }
}
// ---------------------------------------------------------------- 0.9.3 D7: emulator patches
// The emulator's own patch list for a game, switched on in the emulator's own patch settings.
// patches.json: the ones Cartridge turned on (only those can it turn off), per emulator.
const patchesMod = require('./patches');
const cheatsMod = require('./cheats');
const webFetch = require('./webFetch'); // outside services through Chromium's network stack (0.9.17: 403s)
// add-ons Cartridge installed (0.9.17): { key: { dest, files, ... } }; Remove deletes only those files
// The web and mods engines (0.9.52): one place for outside services, one shape for every mod source (web.js, modEngine.js)
let webEngine = null, modEngine = null;
const webEng = () => (webEngine ||= require('./web').createWeb({ cacheDir: path.join(USER_DATA, 'web-cache'), log }));
const modsEng = () => (modEngine ||= require('./modEngine').createModEngine({ web: webEng(), key: (n) => (n === 'nexus' ? String(config.nexusKey || '').trim() || null : null), cacheFile: path.join(USER_DATA, 'addons-ps2-catalog.json'), log }));
// a library game as the mods engine sees it: its name and Cartridge's console folder name (RomM's slug mapped)
const modGame = (rom) => ({ name: rom.name || rom.fs_name || '', slug: (PLATFORM_MAP[rom.platform_slug] || PLATFORM_MAP[rom.platform_fs_slug] || [rom.platform_slug])[0], romId: rom.id });
// how a ROM hack can be used for a game: RetroArch patches games as it loads them (a patch beside the game, named like
// it), so with RetroArch nothing is written into the game; otherwise a patched copy is made beside the original
function hackModes(rom) {
  const file = installedMap[rom.id];
  if (!file || file === MARKED) return { here: false };
  let t = null; try { t = steamMgr.gameTemplate(rom.id, modGame(rom).slug); } catch {}
  const ra = !!t && (/retroarch/i.test(t.exe || '') || /(^|\s)-L\s/.test(t.lo || ''));
  return { here: true, retroarch: ra, file: path.basename(file), dir: fs.existsSync(file) && fs.statSync(file).isDirectory() };
}
const hackCache = new Map(); // ROM hack downloads read by hacks:prepare, kept 30 minutes for hacks:apply
const ADDONS_FILE = path.join(USER_DATA, 'addons-installed.json');
let addonBrowser = null;
let addonRun = null, addonCache = null, emuGetRun = null;
const emuGetQ = [];
// shadPS4's Qt launcher with a version to run (0.9.37): the newest release when it has none, made the default if none is
async function shadDefaultVersion() {
  const SV = require('./shadVersions');
  let have = SV.installed().filter((v) => v.here);
  if (!have.length) {
    const rel = (await SV.available()).find((r) => !r.prerelease) || (await SV.available())[0];
    if (!rel) throw new Error('shadPS4’s GitHub has no Linux release');
    const z = path.join(os.tmpdir(), `cartridge-shadps4-${Date.now()}.zip`);
    try { await downloadTo(rel.asset.url, z, { abort: new AbortController() }, () => {}, { plain: true }); have = [await SV.addRelease(rel, z)]; }
    finally { fs.rmSync(z, { force: true }); }
    log('shadPS4 version added after install', have[0].name);
  }
  SV.setDefaultIfNone(have[have.length - 1].path);
  return have[have.length - 1].name;
}
// into the Trash (0.9.37): the desktop's own, else the freedesktop Trash in ~/.local/share/Trash by hand (Game Mode
// has no gio); a folder on another drive than home is refused rather than copied across
async function toTrash(p) {
  try { await shell.trashItem(p); return; } catch (e) { log('trashItem', e.message); }
  const T = path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share'), 'Trash');
  fs.mkdirSync(path.join(T, 'files'), { recursive: true }); fs.mkdirSync(path.join(T, 'info'), { recursive: true });
  let name = path.basename(p), n = 1;
  while (fs.existsSync(path.join(T, 'files', name)) || fs.existsSync(path.join(T, 'info', name + '.trashinfo'))) name = `${path.basename(p)}.${++n}`;
  fs.writeFileSync(path.join(T, 'info', name + '.trashinfo'), `[Trash Info]\nPath=${encodeURI(p)}\nDeletionDate=${new Date().toISOString().slice(0, 19)}\n`);
  try { fs.renameSync(p, path.join(T, 'files', name)); }
  catch (e) { fs.rmSync(path.join(T, 'info', name + '.trashinfo'), { force: true }); throw new Error(e.code === 'EXDEV' ? 'That folder is on another drive, so it can’t go to the Trash. Delete it from a file manager.' : e.message); }
}
let flatpakPass = null; // the device password for one Flatpak install, from the Emulators page (never saved)
async function pumpEmuGet() {
  // a Flatpak wanted and no Flatpak here (0.9.37): it's installed first, once, while the AppImages carry on
  const G = require('./emuGet');
  const fpWanted = emuGetQ.some((q) => q.state === 'wait' && G.CATALOG.find((c) => c.key === q.key)?.emus.find((e) => e.id === q.id)?.how === 'flatpak');
  if (fpWanted && !G.hasFlatpak() && !flatpakJob) {
    flatpakJob = true; bgJob('flatpak:install', { state: 'run', pct: null, kind: 'Install', title: 'Flatpak', icon: 'mdiPackageVariant', text: 'Installing Flatpak', error: '' });
    const pass = flatpakPass; flatpakPass = null; // used once, never kept (0.9.38)
    G.ensureFlatpak((l) => bgJob('flatpak:install', { text: l }), pass).then(() => { bgJob('flatpak:install', { state: 'done', pct: 100, text: 'Flatpak and Flathub are ready' }); log('flatpak installed'); })
      .catch((e) => { bgJob('flatpak:install', { state: 'error', error: e.message }); log('flatpak install', e.message); flatpakFailed = e.message; })
      .finally(() => { flatpakJob = null; pumpEmuGet(); });
  }
  if (emuGetRun || !emuGetQ.some((q) => q.state === 'wait')) return;
  // Flatpak still going in: the AppImages first, the Flatpaks once it's there (or each fails with its reason)
  const isFp = (x) => G.CATALOG.find((c) => c.key === x.key)?.emus.find((e) => e.id === x.id)?.how === 'flatpak';
  const q = emuGetQ.find((x) => x.state === 'wait' && !(flatpakJob && isFp(x)));
  if (!q) return;
  if (flatpakFailed && isFp(q) && !G.hasFlatpak()) { q.state = 'error'; q.error = flatpakFailed; broadcast('emuget-state', emuGetQ); return pumpEmuGet(); }
  q.state = 'run'; broadcast('emuget-state', emuGetQ);
  const off = (m) => { if (m.key === q.key && m.id === q.id && m.pct != null) { q.pct = m.pct; broadcast('emuget-state', emuGetQ); } };
  emuGetListeners.add(off);
  try { const r = await handlers['emuget:install']({ key: q.key, id: q.id }); q.state = 'done'; q.where = r?.path || r?.fp || ''; q.relinked = r?.relinked || 0; q.links = r?.links || 0; q.note = r?.note || (r?.shadVersion ? `With shadPS4 ${r.shadVersion} as its default` : ''); }
  catch (e) { q.state = 'error'; q.error = e.message; }
  emuGetListeners.delete(off);
  broadcast('emuget-state', emuGetQ);
  pumpEmuGet();
}
const emuGetListeners = new Set();
let flatpakJob = null, flatpakFailed = '';
const addonRecs = () => (addonCache ||= loadJson(ADDONS_FILE, {}));
const PATCHES_FILE = path.join(USER_DATA, 'patches.json');
const LINKS_FILE = path.join(USER_DATA, 'folder-links.json');
let patchMine = loadJson(PATCHES_FILE, {});
// a PS3 game's serial: from its install record, its PARAM.SFO, else its name
function ps3Serial(romId, where) {
  if (installs[romId]?.serial) return installs[romId].serial;
  for (const f of [path.join(where || '', 'PS3_GAME', 'PARAM.SFO'), path.join(where || '', 'PARAM.SFO')]) { const s = patchesMod.sfoAt(f).TITLE_ID; if (s) return s; }
  const r = romIndexMain().get(Number(romId));
  // disc games too (0.9.3 L): a folder with the game folder inside, an ISO (PS3_DISC.SFB), "BLUS-30443" names
  try { const s = steamMgr.serialOf(r || {}, where || ''); if (s) return s; } catch {}
  // 0.9.15: an ISO read properly (PS3_GAME/PARAM.SFO anywhere in the image, any serial prefix),
  // and a downloaded .pkg not installed yet (its content ID)
  const files = (() => { try { return fs.statSync(where).isDirectory() ? fs.readdirSync(where).map((n) => path.join(where, n)) : [where]; } catch { return []; } })();
  for (const f of files.filter((x) => /\.(iso|chd)$/i.test(x))) { const b = patchesMod.isoFile(f, ['PS3_GAME', 'PARAM.SFO']); const id = b && patchesMod.parseSfo(b).TITLE_ID; if (id) return id; }
  for (const f of files.filter((x) => /\.pkg$/i.test(x))) { const i = pkgInst.pkgInfo(f); if (i?.titleId && /^[A-Z]{4}\d{5}$/.test(i.titleId)) return i.titleId; }
  // 0.9.18: the game folder one or two levels down ("Game/Game [BLUS30443]/PS3_GAME"), then RPCS3's
  // own game list (config/games.yml: "BLUS30443: /path/to/game/"), which knows every game it has booted
  const deep = (d, n) => { for (const e of (() => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } })()) {
    if (!e.isDirectory()) continue;
    const p = path.join(d, e.name), s = patchesMod.sfoAt(path.join(p, 'PS3_GAME', 'PARAM.SFO')).TITLE_ID;
    if (s) return s;
    if (n > 1) { const r = deep(p, n - 1); if (r) return r; }
  } return null; };
  if (where) { const s = deep(where, 2); if (s) return s; }
  const want = where && (() => { try { return fs.realpathSync(where); } catch { return where; } })().replace(/\/+$/, '');
  for (const d of patchesMod.rpcs3Dirs()) {
    let text = ''; try { text = fs.readFileSync(path.join(d.root, 'games.yml'), 'utf8'); } catch { continue; }
    for (const m of text.matchAll(/^([A-Z]{4}\d{5})\s*:\s*"?([^"\n]+?)"?\s*$/gm)) {
      const g = (() => { try { return fs.realpathSync(m[2]); } catch { return m[2]; } })().replace(/\/+$/, '');
      if (want && (g === want || g.startsWith(want + '/') || want.startsWith(g + '/'))) return m[1];
    }
  }
  return null;
}
// The emulator copy a game really starts with (its own pick, else its console's), so its patches go
// to that copy's own folders (0.9.15): a fork's portable "user" folder, a Flatpak's sandbox folder,
// a portable PCSX2. Returns the folder list to try first, or [] to use the usual places.
function patchHome(romId, emu) {
  let t = null;
  try { const key = steamMgr.forRom(Number(romId)).console; t = key ? steamMgr._templateForGame(Number(romId), key) : null; } catch {}
  if (!t?.exe) return { pick: null };
  const exe = t.exe, dir = path.dirname(exe), flat = (t.args || '').match(/run\s+(?:--\S+\s+)*(\S+)/)?.[1] || '';
  const home = os.homedir();
  if (emu === 'shadps4') {
    if (fs.existsSync(path.join(dir, 'user', 'patches'))) return { pick: exe, shad: [path.join(dir, 'user')] }; // portable copy or fork
    return { pick: exe };
  }
  if (emu === 'rpcs3') return { pick: exe, rpcs3Home: /net\.rpcs3\.RPCS3/.test(flat) ? path.join(home, '.var/app/net.rpcs3.RPCS3/config/rpcs3') : null };
  if (emu === 'pcsx2') {
    if (fs.existsSync(path.join(dir, 'portable.ini')) || fs.existsSync(path.join(dir, 'portable.txt'))) return { pick: exe, pcsx2Root: dir };
    return { pick: exe, pcsx2Root: /net\.pcsx2\.PCSX2/.test(flat) ? path.join(home, '.var/app/net.pcsx2.PCSX2/config/PCSX2') : null };
  }
  if (emu === 'dolphin' || emu === 'ppsspp') return { pick: exe, flatpak: /DolphinEmu|ppsspp/i.test(flat) };
  return { pick: exe };
}
// the game's own file: the biggest one in its folder
function mainFile(where) {
  if (!where || where === MARKED) return '';
  try { if (fs.statSync(where).isDirectory()) return fs.readdirSync(where).map((n) => path.join(where, n)).filter((f) => fs.statSync(f).isFile()).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0] || ''; } catch { return ''; }
  return where;
}
// GameCube and Wii through Dolphin, PSP through PPSSPP (0.9.16): codes listed in cheats.js
function dolphinPatchState(romId) {
  const file = mainFile(installedMap[romId]);
  if (!file) return { emu: 'dolphin', why: 'Download the game first.' };
  const id = cheatsMod.gcWiiId(file);
  if (!id) return { emu: 'dolphin', why: 'Cartridge couldn’t read this game’s ID from its disc image (ISO, GCM, RVZ, WIA, WBFS and CISO can be read).' };
  const ph = patchHome(romId, 'dolphin'), dirs = cheatsMod.dolphinDirs();
  // 0.9.21 (owner: codes on in Dolphin didn't show as on): the user folder that holds this game's
  // settings wins (EmuDeck's launcher hides whether it's the Flatpak), then the copy the game uses
  const has = (d) => cheatsMod.dolphinUserFiles(d, id).some((n) => fs.existsSync(path.join(d.user, 'GameSettings', n)));
  const dir = dirs.find(has) || (ph.pick && dirs.find((d) => d.flatpak === !!ph.flatpak)) || dirs[0];
  if (!dir) return { emu: 'dolphin', serial: id, why: 'Dolphin’s settings weren’t found on this device. Open Dolphin once, then come back.' };
  return { emu: 'dolphin', serial: id, version: '', dir };
}
function ppssppPatchState(romId, r) {
  const where = installedMap[romId], file = mainFile(where);
  if (!file) return { emu: 'ppsspp', why: 'Download the game first.' };
  let id = /\.(iso|cso|zso|chd)$/i.test(file) ? (() => { const b = patchesMod.isoFile(file, ['PSP_GAME', 'PARAM.SFO']); return b ? patchesMod.parseSfo(b).DISC_ID : null; })() : /\.pbp$/i.test(file) ? require('./discImage').pbpDiscId(file) : null;
  id = id || (`${r?.fs_name || ''} ${r?.name || ''} ${path.basename(file)}`.match(/\b([A-Z]{4})-?(\d{5})\b/) || []).slice(1).join('') || null;
  if (!id) return { emu: 'ppsspp', why: 'Cartridge couldn’t find this game’s ID (ULUS10041 and so on) in its name or its ISO.' };
  const ph = patchHome(romId, 'ppsspp'), dirs = cheatsMod.ppssppDirs();
  const dir = (ph.pick && dirs.find((d) => d.flatpak === !!ph.flatpak)) || dirs[0];
  if (!dir) return { emu: 'ppsspp', serial: id, why: 'PPSSPP’s settings weren’t found on this device. Open PPSSPP once, then come back.' };
  return { emu: 'ppsspp', serial: id, version: '', dir, title: r?.name || '' };
}
// every game with what Syncthing's files can be matched by: its name, serials and title IDs in its file names
function syncGameList() {
  const S = require('./syncthing');
  return [...romIndexMain().values()].map((r) => {
    const where = installedMap[r.id];
    const ids = require('./cide').parse([r.fs_name, ...(r.files || []).map((f) => f.file_name), where && where !== MARKED ? path.basename(where) : ''].join(' '));
    // 0.9.28: disc IDs read from the game itself, for folders named after them (Dolphin's GALE01, Azahar's title IDs);
    // read through the game identity engine since 0.9.48 (same readers, one cache)
    const discIds = where && where !== MARKED && /\.(iso|gcm|rvz|wia|wbfs|ciso|gcz|3ds|cci|cia|cxi)$/i.test(where) ? identity.fileIds(r, where) : [];
    return { id: r.id, name: r.name || '', ids, discIds };
  });
}
// ---- Saves on this device (0.9.29, The Syncthing Update): electron/saves.js finds them, this matches them
// to the library with every ID Cartridge can read from the game itself. Since 0.9.48 the reading and its cache live in
// the game identity engine (electron/gameId.js), shared with trophies and Syncthing
function gameFileIds(r, where) {
  const file = mainFile(where), slugs = `${r.platform_slug} ${r.platform_fs_slug}`, A = require('./addons');
  if (/\bswitch\b/i.test(slugs) && file) { A.setKeyRoots([config.emulationRoot]); return [A.switchTitleId(file)]; }
  if (/ps3/i.test(slugs)) return [ps3Serial(r.id, where)];
  if (/\bpsx\b/i.test(slugs) && file) return [A.psxSerial(file)];
  if (/\bpsp\b/i.test(slugs) && file) return [ppssppPatchState(r.id, r)?.serial];
  if (/\bps2\b/i.test(slugs) && /\.(iso|chd|cso|zso)$/i.test(file)) return [patchesMod.ps2IsoInfo(file)?.serial];
  if (/\b(ngc|gc|gamecube|wii)\b/i.test(slugs) && /\.(iso|gcm|rvz|wia|wbfs|ciso|gcz)$/i.test(file)) return [cheatsMod.gcWiiId(file)];
  if (/\b(3ds|n3ds)\b/i.test(slugs) && /\.(3ds|cci|cia|cxi)$/i.test(file)) return [A.n3dsTitleId(file)];
  return [];
}
const identity = require('./gameId').createIdentity({
  file: path.join(USER_DATA, 'game-ids.json'),
  roms: () => [...romIndexMain().values()],
  whereOf: (id) => { const w = installedMap[id]; return w && w !== MARKED ? w : ''; },
  extract: gameFileIds,
  log,
});
const saveIdsOf = (r, where) => identity.fileIds(r, where);
function savesGameList() {
  return syncGameList().map((g) => {
    const r = romIndexMain().get(g.id), where = installedMap[g.id];
    return where && where !== MARKED && r ? { ...g, ids: [...g.ids, ...saveIdsOf(r, where)] } : g;
  });
}
let savesCache = null;
// emulator data folders Cartridge knows beyond the usual places: portable shadPS4 builds (user/ beside them), Vita3K's storage
function saveExtras() {
  const extra = {};
  try { for (const v of require('./shadVersions').installed()) if (v.path) (extra.shadps4 ||= []).push(path.dirname(v.path)); } catch {}
  try { const exe = steamMgr.vita3kCommand?.()?.exe; for (const d of pkgInst.vita3kFsPaths(exe)) (extra.vita3k ||= []).push(d); } catch {}
  return extra;
}
// a joined device takes the main device's save folders as they're offered (0.9.29)
let joinT = null;
function watchJoin() {
  clearInterval(joinT);
  if (config.syncthing?.role !== 'member') return;
  const tick = async () => {
    try { const r = await require('./syncthing').acceptFolders(require('./saves').syncRoots({ extra: saveExtras() })); if (r.added.length) { log('syncthing: took save folders', r.added.join(' ')); savesCache = null; broadcast('syncsaves', r); } } catch {}
  };
  tick(); joinT = setInterval(tick, 30000);
}
async function savesList(fresh) {
  if (!fresh && savesCache && Date.now() - savesCache.at < 30000) return savesCache.list;
  const S = require('./saves');
  const list = S.match(S.scan({ extra: saveExtras() }), savesGameList());
  // games that keep their save beside the game file (melonDS, mGBA and other emulators' default)
  for (const [id, where] of Object.entries(installedMap)) {
    if (!where || where === MARKED) continue;
    const file = mainFile(where); if (!file) continue;
    const stem = file.replace(/\.[^./]+$/, '');
    for (const ext of ['.sav', '.srm', '.dsv']) { try { const st = fs.statSync(stem + ext); list.push({ emu: 'beside', emuName: 'Beside the game', kind: 'save', path: stem + ext, keys: {}, romIds: [Number(id)], size: st.size, at: st.mtimeMs, files: 1 }); } catch {} }
  }
  // which saves Syncthing already keeps in step (a save folder inside one of its folders)
  try {
    const l = await require('./syncthing').local();
    const synced = (l?.folders || []).map((f) => ({ path: (f.path || '').replace(/^~(?=\/)/, os.homedir()), label: f.label || f.id, id: f.id })).filter((f) => f.path);
    for (const s of list) { const f = synced.find((x) => s.path === x.path || s.path.startsWith(x.path.replace(/\/$/, '') + '/') || x.path.startsWith(s.path + '/')); if (f) s.synced = { id: f.id, label: f.label, path: f.path, ours: f.id.startsWith('cartridge-saves-') }; }
  } catch {}
  savesCache = { at: Date.now(), list };
  return list;
}
// ---- Cartridge Save Sync (0.9.51): saves on your RomM, brought to every device (electron/saveSync.js does the work,
// this gives it the library, RomM and the timing). A device uses this or Syncthing for saves, never both (owner).
const SAVESYNC_FILE = path.join(USER_DATA, 'save-sync.json'), SAVE_BACKUPS = path.join(USER_DATA, 'save-backups');
let ssData = loadJson(SAVESYNC_FILE, { ledger: {}, last: null });
let ssSaveT = null;
const ssLedger = { get: (k) => ssData.ledger[k], set: (k, v) => { ssData.ledger[k] = v; clearTimeout(ssSaveT); ssSaveT = setTimeout(() => saveJson(SAVESYNC_FILE, ssData, false), 500); } };
const syncthingSaves = () => !!config.syncthing?.role; // Cartridge set Syncthing up for saves (main or joined)
const saveSyncOn = () => config.saveSync === 'cartridge' && !syncthingSaves() && config.configured && !config.localOnly;
// RomM's console slugs for each emulator's console, for the carrier game of a whole memory card
const SS_CONSOLES = { switch: ['switch'], ps3: ['ps3'], psp: ['psp'], psvita: ['psvita', 'vita'], ps4: ['ps4'], ps2: ['ps2'], psx: ['psx', 'ps1', 'ps'], ngc: ['ngc', 'gc', 'gamecube'], wiiu: ['wiiu'], '3ds': ['3ds', 'n3ds'], xbox360: ['xbox360'] };
const ssConsoleOf = (r) => Object.keys(SS_CONSOLES).find((c) => SS_CONSOLES[c].includes(r?.platform_slug) || SS_CONSOLES[c].includes(r?.platform_fs_slug)) || null;
function ssCarriers() {
  const out = {};
  for (const r of romIndexMain().values()) { const c = ssConsoleOf(r); if (c && (out[c] == null || r.id < out[c])) out[c] = r.id; }
  return out;
}
// the library for matching: every ID read from the game, plus the game's file name (RetroArch names saves after it)
function ssGames() {
  const list = savesGameList();
  for (const r of romIndexMain().values()) { const stem = String(r.fs_name || '').replace(/\.[^.]+$/, ''); if (stem) list.push({ id: r.id, name: stem, ids: [], discIds: [] }); }
  return list;
}
// RomM's saves API (electron/saveSync.js rommRpc, tested against a fake RomM server)
const ssRpc = (devId) => require('./saveSync').rommRpc({ base: resolveBase, headers: authHeaders, devId });
// a game's saves: its own, plus the whole memory card of its console
const ssFor = (u, romId) => { if (romId == null) return true; if (u.romId === romId) return true; const r = romIndexMain().get(romId); return u.card && require('./saveSync').CONSOLE[u.emu] === ssConsoleOf(r); };
let ssBusy = null;
async function saveSyncRun({ romId = null, key = null, choice = null, dry = false, why = 'run' } = {}) {
  if (!saveSyncOn()) return { off: true, syncthing: syncthingSaves() };
  if (ssBusy) return ssBusy; // one sync at a time; a second ask shares the running one
  ssBusy = (async () => {
    const SS = require('./saveSync'), extra = saveExtras();
    romId = romId == null ? null : Number(romId);
    const local = SS.units({ extra, games: ssGames(), carriers: ssCarriers() });
    let remotes = [];
    try { remotes = await (await ssRpcList(romId)); } catch (e) { log('save sync: RomM unreachable', e.message); if (why !== 'before' && !dry) ssHold(romId); return { offline: true, error: e.message, held: ssData.held || null }; }
    const devId = await rommDevice(), rpc = ssRpc(devId);
    const todo = [...local, ...SS.remoteOnly(remotes, new Set(local.map((u) => u.key)))].filter((u) => ssFor(u, romId) && (!key || u.key === key));
    const results = [];
    broadcast('savesync', { state: 'run', done: 0, of: todo.length, why, romId });
    for (const [i, u] of todo.entries()) {
      let r;
      try { r = await SS.syncUnit(u, rpc, ssLedger, { extra, backupsRoot: SAVE_BACKUPS, choice: key ? choice : null, dry }); } catch (e) { r = { key: u.key, result: e.code === 'auth' ? 'auth' : 'error', error: e.message }; }
      results.push({ ...r, label: u.label || u.key, emu: u.emu, emuName: SS.LABEL[u.emu] || u.emu, romId: u.romId, card: u.card, states: !!u.states, why: u.why || null });
      if (!['none', 'same', 'unmatched'].includes(r.result)) log('save sync:', u.key, r.result, r.error || '');
      broadcast('savesync', { state: 'run', done: i + 1, of: todo.length, why, romId });
      if (r.result === 'auth') break;
    }
    // 0.9.57 (owner: a game's sheet with its sync history): what moved, per save, the last 30 times
    if (!dry) for (const r of results) if (['up', 'down', 'conflict', 'error'].includes(r.result)) ssNote(r.key, { result: r.result, why, error: r.error || undefined, choice: key ? choice : undefined });
    const counts = {}; for (const r of results) counts[r.result] = (counts[r.result] || 0) + 1;
    // 0.9.56 (owner: each count opens the saves behind it): what each save did in the last whole sync, at most 600
    const items = results.filter((r) => ['up', 'down', 'same', 'unmatched'].includes(r.result)).slice(0, 600).map((r) => ({ key: r.key, label: r.label, emu: r.emu, emuName: r.emuName, romId: r.romId, card: r.card, states: r.states, result: r.result, why: r.why }));
    if (romId == null && !dry) { ssData.last = { at: Date.now(), counts, items, conflicts: results.filter((r) => r.result === 'conflict').map((r) => ({ key: r.key, label: r.label, emuName: r.emuName, romId: r.romId })) }; saveJson(SAVESYNC_FILE, ssData, false); }
    broadcast('savesync', { state: 'done', counts, why, romId });
    return { results, counts };
  })().finally(() => { ssBusy = null; });
  return ssBusy;
}
// a save's sync history (save-sync.json history[key]: newest first, 30 at most)
function ssNote(key, e) {
  const h = (ssData.history ||= {});
  h[key] = [{ at: Date.now(), ...e }, ...(h[key] || [])].slice(0, 30);
  clearTimeout(ssSaveT); ssSaveT = setTimeout(() => saveJson(SAVESYNC_FILE, ssData, false), 500);
}
// Away from the server (0.9.52, owner: a RomM at home with no tunnel, played on a handheld away). Nothing special
// is needed to keep a save: the emulator keeps writing it on this device, played again or not. What Cartridge adds is
// the hold: the games played while RomM couldn't be reached are noted (save-sync.json held), RomM is checked every
// minute while something is held (never while a game runs), and the moment it answers they go up. The ledger then
// decides as always: changed only here = up, changed on another device too = a conflict you settle (never guessed).
let ssHoldT = null;
function ssHold(romId) {
  const h = ssData.held || { since: Date.now(), romIds: [], all: false };
  if (romId == null) h.all = true; else if (!h.romIds.includes(romId)) h.romIds.push(romId);
  h.at = Date.now(); ssData.held = h; saveJson(SAVESYNC_FILE, ssData, false);
  broadcast('savesync', { state: 'held', held: h });
  ssWatchBack();
}
function ssWatchBack() {
  if (ssHoldT || !ssData.held) return;
  ssHoldT = setInterval(async () => {
    if (!ssData.held || !saveSyncOn()) { clearInterval(ssHoldT); ssHoldT = null; return; }
    if (gameFocus.away || runOn) return; // a game is in front: wait, it may be writing its save
    let ok = false;
    try { const b = await resolveBase(true); ok = !!b && !!(await probe(b, config.server, 4000))?.ok; } catch {}
    if (!ok) return;
    const held = ssData.held;
    const r = await saveSyncRun({ why: 'reconnected' }).catch(() => null);
    if (!r || r.offline) return;
    if (ssData.held === held) delete ssData.held;
    saveJson(SAVESYNC_FILE, ssData, false);
    log('save sync: server back, held saves synced', JSON.stringify(r.counts || {}));
    broadcast('savesync', { state: 'released', counts: r.counts || {}, held });
    clearInterval(ssHoldT); ssHoldT = null;
  }, 60000);
}
// every save of ours in RomM (or one game's): what other devices put there
async function ssRpcList(romId) {
  // one game: its saves and its console's carrier game (where the whole memory card is)
  const ids = romId == null ? [null] : [...new Set([romId, ssCarriers()[ssConsoleOf(romIndexMain().get(romId))]].filter((x) => x != null))];
  const all = [];
  for (const id of ids) all.push(...((await api('/api/saves', { query: id == null ? {} : { rom_id: id } })) || []));
  return all.filter((s) => String(s.slot || '').startsWith('cartridge:'));
}
// after a game: its saves go up a few seconds after it closes (emulators write on exit)
function saveSyncAfter(romId) { if (saveSyncOn()) setTimeout(() => saveSyncRun({ romId, why: 'after' }).catch(() => {}), 4000); }
let ssBackAt = 0;
function saveSyncBack() { if (saveSyncOn() && Date.now() - ssBackAt > 120000) { ssBackAt = Date.now(); setTimeout(() => saveSyncRun({ why: 'back' }).catch(() => {}), 6000); } }

function patchState(romId) {
  const r = romIndexMain().get(Number(romId));
  const slugs = `${r?.platform_slug} ${r?.platform_fs_slug}`;
  if (/\b(ngc|gamecube|gc|wii)\b/i.test(slugs)) return dolphinPatchState(romId);
  if (/\bpsp\b/i.test(slugs)) return ppssppPatchState(romId, r);
  if (/ps4/i.test(`${r?.platform_slug} ${r?.platform_fs_slug}`)) return ps4PatchState(romId, r);
  if (/\bwiiu\b/i.test(slugs)) { // Cemu's graphic packs (0.9.24)
    const e = require('./addons').emulators().find((x) => x.id === 'cemu');
    if (!e) return { emu: 'cemu', why: 'Cemu’s settings weren’t found on this device. Open Cemu once, then come back.' };
    const where = installedMap[romId];
    const ids = require('./cemuPacks').titleIds(where && where !== MARKED ? where : '', path.dirname(e.settings), r?.name);
    return { emu: 'cemu', serial: ids[0] || r?.name, dir: { root: e.root, settings: e.settings }, ids, title: r?.name };
  }
  if (/^ps2$/i.test(r?.platform_slug || '') || /^ps2$/i.test(r?.platform_fs_slug || '')) return ps2PatchState(romId);
  if (!/ps3/i.test(`${r?.platform_slug} ${r?.platform_fs_slug}`)) return { emu: null };
  const where = installedMap[romId];
  if (!where) return { emu: 'rpcs3', why: 'Download the game first.' };
  const serial = ps3Serial(romId, where);
  if (!serial) return { emu: 'rpcs3', why: 'Cartridge couldn’t find this game’s serial (BLUS12345 and so on) in its name or its files.' };
  const ph = patchHome(romId, 'rpcs3');
  const dirs = patchesMod.rpcs3Dirs();
  const dir = (ph.rpcs3Home && dirs.find((d) => d.root === ph.rpcs3Home)) || (ph.rpcs3Home === null ? dirs.find((d) => !d.root.includes('/.var/app/')) : null) || dirs[0];
  if (!dir || !fs.existsSync(path.join(dir.patches, 'patch.yml'))) return { emu: 'rpcs3', serial, why: 'RPCS3’s patch list isn’t on this device yet. In RPCS3: Manage → Game Patches → Download latest patches. Then come back.' };
  const version = patchesMod.ps3Version(installs[romId]?.dir || where, rpcs3Hdds(), serial);
  return { emu: 'rpcs3', serial, version, dir };
}
// RPCS3's patch list, fetched the way RPCS3's "Download latest patches" does when it's missing or a
// week old (owner, 0.9.16: show the patches RPCS3 has even if it was never asked to download them)
async function freshRpcs3Patches(romId, force = false) {
  const r = romIndexMain().get(Number(romId));
  if (!/ps3/i.test(`${r?.platform_slug} ${r?.platform_fs_slug}`)) return;
  const ph = patchHome(romId, 'rpcs3'), dirs = patchesMod.rpcs3Dirs();
  const dir = (ph.rpcs3Home && dirs.find((d) => d.root === ph.rpcs3Home)) || (ph.rpcs3Home === null ? dirs.find((d) => !d.root.includes('/.var/app/')) : null) || dirs[0];
  if (!dir) return;
  let age = Infinity; try { age = Date.now() - fs.statSync(path.join(dir.patches, 'patch.yml')).mtimeMs; } catch {}
  if (age < 7 * 864e5 && !force) return;
  try { const res = await patchesMod.rpcs3DownloadPatches(dir.patches); log('rpcs3 patches', res.updated ? 'downloaded' : 'up to date', dir.patches); if (!res.updated) fs.utimesSync(path.join(dir.patches, 'patch.yml'), new Date(), new Date()); if (force) return { updated: !!res.updated }; }
  catch (e) { log('rpcs3 patches download failed:', e.message); if (force) throw new Error(`RPCS3’s patch list couldn’t be downloaded (${e.message}).`); return `RPCS3’s patch list couldn’t be downloaded (${e.message}).`; }
}
// A Switch game's version from its files' names (0.9.23): dumps carry [v<number>] (the title version,
// 65536 per update) in their names; the highest one in the game's folder is what's installed
// 0.9.30 (owner: "Eden reads its version, Cartridge can't"): read from the files like Eden does (switchNca.js:
// the update's CNMT version and the version string in its control.nacp), cached per file size and time; the
// names are only the fallback when prod.keys isn't found
const switchInfoCache = new Map(), switchNandCache = new Map();
function switchVersionOf(where, keyDirs = []) {
  if (!where) return null;
  let names = [path.basename(where)], files = [where];
  try { if (fs.statSync(where).isDirectory()) { names = fs.readdirSync(where); files = names.map((n) => path.join(where, n)); } } catch {}
  try {
    const sig = files.map((f) => { try { const st = fs.statSync(f); return `${f}:${st.size}:${st.mtimeMs}`; } catch { return ''; } }).join('|');
    if (!switchInfoCache.has(sig)) { const A = require('./addons'); A.setKeyRoots([config.emulationRoot]); switchInfoCache.set(sig, A.switchInfo(files, keyDirs)); }
    const i = switchInfoCache.get(sig);
    // an update installed into Eden's NAND counts when it's newer than the files (Eden lists both the same way)
    const id = i?.titleId || require('./addons').switchTitleId(mainFile(where) || where, keyDirs);
    let nand = null;
    if (id) { const c = switchNandCache.get(id); if (c && Date.now() - c.at < 60000) nand = c.v; else { nand = require('./addons').switchNandUpdate(id, keyDirs); switchNandCache.set(id, { at: Date.now(), v: nand }); } }
    if (nand && (!i || i.version == null || nand.version > i.version)) return { number: nand.version, update: Math.floor(nand.version / 65536), display: nand.display || null, text: nand.versionText, titleId: id, name: i?.name || '', dlc: i?.dlc || 0, read: true, installed: 'nand' };
    if (i && (i.version != null || i.display)) return { number: i.version, update: i.update != null ? Math.floor(i.update / 65536) : null, display: i.display || null, text: i.versionText || null, titleId: i.titleId, name: i.name || '', dlc: i.dlc || 0, read: true };
  } catch (e) { log('switch version read failed:', e.message); }
  const vs = names.map((n) => (/\[v(\d{5,10})\]/i.exec(n) || /\bv(\d{5,10})\b/i.exec(n) || [])[1]).filter(Boolean).map(Number);
  const disp = names.map((n) => (/\b(?:v|ver\.?\s*)(\d+\.\d+(?:\.\d+)?)\b/i.exec(n) || [])[1]).filter(Boolean).sort().pop();
  if (!vs.length && !disp) return null;
  const n = vs.length ? Math.max(...vs) : null;
  return { number: n, update: n != null ? Math.floor(n / 65536) : null, display: disp || null };
}
// Which emulator file a game's settings live in (0.9.23): the same copy its patches use
function gameSettingsCtx(romId) {
  require('./gameSettings').setRecsFile(path.join(USER_DATA, 'game-settings.json'));
  const r = romIndexMain().get(romId), slugs = `${r?.platform_slug} ${r?.platform_fs_slug}`;
  const where = installedMap[romId];
  if (!r) return { why: 'That game isn’t in the library.' };
  if (!where || where === MARKED) return { why: 'Download the game first.' };
  if (/ps3/i.test(slugs)) {
    const serial = ps3Serial(romId, where), ph = patchHome(romId, 'rpcs3'), dirs = patchesMod.rpcs3Dirs();
    const dir = (ph.rpcs3Home && dirs.find((d) => d.root === ph.rpcs3Home)) || dirs[0];
    if (!serial) return { emu: 'rpcs3', why: 'Cartridge couldn’t find this game’s serial.' };
    if (!dir) return { emu: 'rpcs3', why: 'RPCS3’s settings weren’t found on this device. Open RPCS3 once, then come back.' };
    return { emu: 'rpcs3', serial, rpcs3Root: dir.root };
  }
  if (/\bpsx\b/i.test(slugs)) {
    const e = require('./addons').emulators().find((x) => x.id === 'duckstation');
    if (!e) return { emu: 'duckstation', why: 'Per-game settings for PS1 games are DuckStation’s, and its settings weren’t found here.' };
    const serial = require('./addons').psxSerial(mainFile(where));
    return serial ? { emu: 'duckstation', serial, duckRoot: e.root } : { emu: 'duckstation', why: 'Cartridge couldn’t read this game’s serial.' };
  }
  const st = patchState(romId);
  if (!st.emu || st.why && !st.dir) return { emu: st.emu, why: st.why || 'Cartridge can’t change this emulator’s per-game settings.' };
  if (st.emu === 'pcsx2') return { emu: 'pcsx2', serial: st.serial, crc: st.version, pcsx2: st.dir };
  if (st.emu === 'dolphin') return { emu: 'dolphin', serial: st.serial, dolphin: st.dir };
  if (st.emu === 'ppsspp') return { emu: 'ppsspp', serial: st.serial, ppsspp: st.dir };
  if (st.emu === 'shadps4') return { emu: 'shadps4', serial: st.serial, shadUser: st.dir };
  return { emu: st.emu, why: 'Cartridge can’t change this emulator’s per-game settings yet.' };
}
// Cemu's community graphic packs, fetched like Cemu's own download (cemuPacks.downloadCommunity), weekly
async function freshCemuPacks(romId, force = false) {
  const st = patchState(romId);
  if (st.emu !== 'cemu' || !st.dir?.root) return '';
  try {
    const r = await require('./cemuPacks').downloadCommunity(st.dir.root, { fetchImpl: (...a) => webFetch(...a), unzip: unzipTo, force, release: () => require('./github').release('cemu-project/cemu_graphic_packs') });
    if (r.updated) log('cemu graphic packs downloaded', r.version);
    if (force) return { version: r.version, updated: r.updated };
    return '';
  } catch (e) { log('cemu graphic packs download failed:', e.message); if (force) throw new Error('Cemu\'s graphic packs couldn\'t be downloaded: ' + e.message); return fs.existsSync(path.join(st.dir.root, 'graphicPacks')) ? '' : 'Cemu\'s graphic packs couldn\'t be downloaded: ' + e.message; }
}
// An emulator installed from a GitHub link, set up once its program is known (0.9.24, 0.9.32 for folders)
let customPending = null;
async function finishCustom({ repo, file, folder, as, of, key, tag, name }) {
  let setup;
  if (as === 'fork') { steamMgr.markFork(file, of, name); setup = 'fork'; }
  else { setup = steamMgr.useFile(key, file); if (setup?.needs) setup = steamMgr.useFile(key, file, { args: '"{ROM}"' }); setup = 'console'; }
  config.customEmus = [...(config.customEmus || []).filter((x) => x.repo !== repo && x.path !== file), { repo, path: file, folder: folder || null, as, of: as === 'fork' ? of : null, key: as === 'console' ? key : null, tag, at: Date.now() }];
  saveConfig();
  try { await steamMgr.scanEmulators(); } catch {}
  log('emulator from a link', repo, tag, file, setup);
  return { path: file, tag, name, setup, folder: folder || null };
}
// any archive into a folder: zip (no size cap here: AppImages are big), tar.* through tar, 7z/rar through bsdtar or 7-Zip
async function unpackTo(archive, dir) {
  fs.mkdirSync(dir, { recursive: true });
  if (/\.(tar\.(gz|xz|zst|bz2)|tgz|txz)$/i.test(archive)) {
    await new Promise((ok, bad) => require('child_process').execFile('tar', ['-xf', archive, '-C', dir], { timeout: 30 * 60e3 }, (e) => (e ? bad(new Error('The release couldn’t be unpacked.')) : ok())));
    return;
  }
  const { list, close } = await require('./addonInstall').openArchive(archive, path.join(os.tmpdir(), 'cartridge-unz-' + Date.now()));
  try {
    for (const e of list) {
      const out = path.resolve(dir, e.rel);
      if (!out.startsWith(path.resolve(dir) + path.sep)) continue; // nothing outside the folder
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await new Promise(async (ok, bad) => { try { const rs = await e.read(); const ws = fs.createWriteStream(out); rs.pipe(ws); ws.on('finish', ok); ws.on('error', bad); rs.on('error', bad); } catch (er) { bad(er); } });
    }
  } finally { try { close?.(); } catch {} }
}
// AppImages and Linux programs in an unpacked folder, four levels down at most
function programsInFolder(dir) {
  const D = require('./detect'), files = [];
  const walk = (d, depth) => { for (const n of (() => { try { return fs.readdirSync(d); } catch { return []; } })()) { const f = path.join(d, n); let st; try { st = fs.lstatSync(f); } catch { continue; } if (st.isSymbolicLink()) continue; if (st.isDirectory()) { if (depth < 4) walk(f, depth + 1); continue; } const appimage = !!D.appImageType(f); files.push({ path: f, rel: path.relative(dir, f).split(path.sep).join('/'), size: st.size, appimage, elf: appimage || !!D.isElf(f) }); } };
  walk(dir, 0);
  return require('./customEmu').programsIn(files);
}
// a zip unpacked into a folder, no entry outside it (yauzl)
async function unzipTo(zip, dir) {
  const { list, close } = await require('./addonInstall').openArchive(zip, path.join(os.tmpdir(), 'cartridge-unz-' + Date.now()));
  try {
    for (const e of list) {
      const out = path.resolve(dir, e.rel);
      if (!out.startsWith(path.resolve(dir) + path.sep) || e.size > 128 * 1024 * 1024) continue; // like Cemu: no ../, nothing huge
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await new Promise(async (ok, bad) => { try { const rs = await e.read(); const ws = fs.createWriteStream(out); rs.pipe(ws); ws.on('finish', ok); ws.on('error', bad); rs.on('error', bad); } catch (er) { bad(er); } });
    }
  } finally { try { close?.(); } catch {} }
}
// shadPS4's two patch lists, fetched like its launcher's Download Patches when missing or a week old (0.9.23)
async function freshShadPatches(romId, force = false) {
  const r = romIndexMain().get(Number(romId));
  if (!/ps4/i.test(`${r?.platform_slug} ${r?.platform_fs_slug}`)) return;
  const st = ps4PatchState(Number(romId), r);
  if (!st.dir) return;
  const errs = [];
  let got = 0;
  for (const repo of Object.keys(patchesMod.SHAD_REPOS)) {
    let age = Infinity; try { age = Date.now() - fs.statSync(path.join(st.dir, 'patches', repo, 'files.json')).mtimeMs; } catch {}
    if (age < 7 * 864e5 && !force) continue;
    try { const res = await patchesMod.shadDownloadPatches(st.dir, repo); log('shadps4 patches', repo, res.files, 'files'); got += res.files || 0; }
    catch (e) { log('shadps4 patches download failed', repo, e.message); errs.push(`${repo === 'shadPS4' ? 'shadPS4’s' : 'GoldHEN’s'} patch list couldn’t be downloaded (${e.message}).`); }
  }
  if (force) { if (errs.length && !got) throw new Error(errs.join(' ')); return { files: got, partly: errs.join(' ') }; }
  return errs.join(' ') || undefined;
}
// PS4 games (a folder with sce_sys/param.sfo) and shadPS4's patch repositories
function ps4PatchState(romId, r) {
  const where = installedMap[romId];
  if (!where || where === MARKED) return { emu: 'shadps4', why: 'Download the game first.' };
  const sfo = patchesMod.sfoAt(path.join(where, 'sce_sys', 'param.sfo'));
  const serial = sfo.TITLE_ID || (`${r?.fs_name || ''} ${r?.name || ''} ${path.basename(where)}`.match(/\b((?:CUSA|PPSA)\d{5})\b/i) || [])[1]?.toUpperCase() || null;
  if (!serial) return { emu: 'shadps4', why: 'Cartridge couldn’t read this game’s serial (CUSA12345).' };
  const ph = patchHome(romId, 'shadps4');
  // 0.9.23: shadPS4's user folder even before it has patches (Cartridge downloads them, freshShadPatches)
  const shadUser = path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share'), 'shadPS4');
  const dir = (ph.shad || []).find((d) => fs.existsSync(path.join(d, 'patches'))) || patchesMod.shadDirs()[0] || (ph.shad || []).find((d) => fs.existsSync(d)) || (fs.existsSync(shadUser) ? shadUser : null);
  if (!dir) return { emu: 'shadps4', serial, why: 'shadPS4 hasn’t been started on this device yet, so it has no folder for patches. Start it once, then come back.' };
  return { emu: 'shadps4', serial, version: patchesMod.ps4Version(where), dir };
}
// PS2 games: PCSX2 must have the game in its game list (that is where the serial and CRC come from)
function ps2PatchState(romId) {
  const where = installedMap[romId];
  if (!where || where === MARKED) return { emu: 'pcsx2', why: 'Download the game first.' };
  const ph = patchHome(romId, 'pcsx2');
  const all = patchesMod.pcsx2Dirs(os.homedir(), ph.pcsx2Root ? [ph.pcsx2Root] : []);
  const dir = (ph.pcsx2Root && all.find((d) => d.root === ph.pcsx2Root)) || all[0];
  if (!dir) return { emu: 'pcsx2', why: 'PCSX2’s settings weren’t found on this device. Open PCSX2 once, then come back.' };
  let file = where;
  try { if (fs.statSync(where).isDirectory()) file = fs.readdirSync(where).map((n) => path.join(where, n)).filter((f) => /\.(iso|chd|cso|zso|gz|bin|cue|elf)$/i.test(f)).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0] || where; } catch {}
  // PCSX2's game list first; else Cartridge reads the disc itself (ISO since 0.9.3 L, CHD/CSO/ZSO since 0.9.17)
  const readable = /\.(iso|chd|cso|zso)$/i.test(file);
  const game = patchesMod.pcsx2Game(dir, file) || (readable ? patchesMod.ps2IsoInfo(file) : null);
  if (!game || !game.crc) return { emu: 'pcsx2', why: readable ? 'Cartridge couldn’t read this disc image.' : 'Cartridge can’t read this kind of file, so its details come from PCSX2: add your PS2 folder in PCSX2 (Settings → Game List) once, let it scan, then come back.' };
  return { emu: 'pcsx2', serial: game.serial || '', version: patchesMod.crcHex(game.crc), dir, game };
}
const notRunning = (id, name) => { if (require('./raLogin').running().has(id)) throw new Error(`Close ${name} first: it saves its settings when it quits, over this change.`); };
const EMU_PATCH = {
  rpcs3: { name: 'RPCS3', list: (st, mine) => patchesMod.rpcs3List(st.dir, st.serial, st.version, mine), set: (st, todo, mine) => patchesMod.rpcs3Set(st.dir, todo, mine) },
  shadps4: { name: 'shadPS4', list: (st, mine) => patchesMod.shadList(st.dir, st.serial, st.version, mine), set: (st, todo, mine) => patchesMod.shadSet(st.dir, todo, mine) },
  // Dolphin and PPSSPP save their settings when they quit, so nothing is written while they run
  dolphin: { name: 'Dolphin', list: async (st, mine) => cheatsMod.dolphinList(st.dir, st.serial, cheatsMod.dolphinSysText(cheatsMod.dolphinSys(st.dir.flatpak), st.serial, st.dir.flatpak ? [] : steamMgr.appImagesFor('gc', /dolphin/i), require('./detect').readAppImageFile), mine, await cheatsMod.geckoDownload(st.serial, { cacheDir: path.join(USER_DATA, 'gecko-codes') })), set: (st, todo, mine) => { notRunning('dolphin', 'Dolphin'); return cheatsMod.dolphinSet(st.dir, st.serial, todo, mine); } },
  ppsspp: { name: 'PPSSPP', list: (st, mine) => cheatsMod.ppssppList(st.dir, st.serial, mine), set: (st, todo, mine) => { notRunning('ppsspp', 'PPSSPP'); return cheatsMod.ppssppSet(st.dir, st.serial, todo, mine, st.title); } },
  // Wii U: Cemu's graphic packs; turned on with each category's default preset, as Cemu does
  cemu: { name: 'Cemu', list: (st, mine) => require('./cemuPacks').list({ root: st.dir.root, settings: st.dir.settings, titleIds: st.ids, name: st.title }, mine), set: (st, todo, mine) => { notRunning('cemu', 'Cemu'); const C = require('./cemuPacks'); const all = C.list({ root: st.dir.root, settings: st.dir.settings, titleIds: st.ids, name: st.title }, mine); C.set({ settings: st.dir.settings }, todo.map((t) => { const p = all.find((x) => x.key === t.key); return { ...t, presets: Object.fromEntries(Object.entries(p?.presets || {}).map(([k, v]) => [k, (t.want && v.includes(t.want[k]) ? t.want[k] : null) || p.chosen[k] || v[0]])) }; }), mine); return mine; } },
  pcsx2: { name: 'PCSX2', list: (st, mine) => patchesMod.pcsx2List(st.dir, st.game, patchesMod.pcsx2ZipBuffer(patchesMod.pcsx2ZipSources(os.homedir(), steamMgr.appImagesFor('ps2', /pcsx2/i)), require('./detect').readAppImageFile), mine), set: (st, todo, mine) => patchesMod.pcsx2Set(st.dir, st.game, todo, mine) },
};
// D2: a Vita game through Vita3K (.pkg with its zRIF installs with no window; a .vpk or .zip
// opens Vita3K, which starts the game once installed: the install finishes when it closes)
async function installVitaGame(romId, zrif) {
  const m = manifest[romId];
  const item = await pkgInst.vitaContent(m.path);
  if (!item) throw new Error('There’s no Vita package (.pkg, .vpk or .zip) in this game’s files.');
  const key = String(zrif || item.zrif || '').trim();
  if (item.kind === 'pkg' && !/^KO5i[0-9A-Za-z+/=]{40,}$/.test(key)) throw new Error('This .pkg needs its zRIF key (it starts with KO5i).');
  const cmd = steamMgr.vita3kCommand();
  if (!cmd) throw new Error('Vita3K wasn’t found. Set it up in Settings → Emulators.');
  // Vita3K's own storage first (0.9.21), then any other ux0 found (installVita puts them in order)
  const prefs = emuRoots('vita3k');
  if (!prefs.length && !pkgInst.vita3kFsPaths(cmd.exe).length) throw new Error('Vita3K’s storage wasn’t found. Open Vita3K once and finish its setup (firmware included), then try again.');
  pkgRun = { romId, ac: new AbortController() };
  const send = (o) => broadcast('pkg-progress', { romId, ...o });
  try {
    send({ state: 'running', step: 0, of: 1, opens: false });
    const got = await pkgInst.installVita({ cmd, prefs, item, zrif: key, signal: pkgRun.ac.signal, onStep: (s) => send({ state: 'running', ...s }) });
    const g = got[0];
    if (!g) throw new Error('Vita3K didn’t install it. Its own message is in Cartridge’s log (Settings → About → Report a problem).');
    const prev = installs[romId];
    installs[romId] = { emu: 'vita3k', serial: g.serial, dir: g.dir, created: !!(g.created || (prev?.created && prev.serial === g.serial)), at: Date.now(), files: [path.basename(item.file)] };
    saveInstalls();
    log('vita3k install', g.serial, g.created ? 'new' : 'again');
    send({ state: 'done', serial: g.serial });
    afterInstall(romId);
    // without a licence Vita3K can't start it: say so instead of "installed"
    return { ...installs[romId], updates: 0, licenceMissing: g.licenced ? [] : [{ contentId: g.serial, vita: true }] };
  } catch (e) { log('vita3k install failed', e.message, e.detail ? '\n' + e.detail : ''); send({ state: 'error', error: e.message }); throw e; }
  finally { pkgRun = null; }
}

let autoUpdater = null;
// The name shown for a version: 0.9.3 is finished in parts named "0.9.3 B", "0.9.3 C"... while the
// number underneath keeps going up (0.9.4, 0.9.5...), as updates only install a higher number.
// Here from package.json "versionName", a release's from its title ("Cartridge 0.9.3 B").
let VERSION_NAME = null;
try { VERSION_NAME = require('../package.json').versionName || null; } catch {}
const versionName = () => VERSION_NAME || app.getVersion();
const nameOf = (i) => String(i?.releaseName || '').replace(/^Cartridge\s+/i, '').trim() || i?.version;
function setupUpdater() {
  if (!app.isPackaged || !process.env.APPIMAGE) return; // only the real AppImage can replace itself
  try { ({ autoUpdater } = require('electron-updater')); } catch { return; }
  autoUpdater.autoDownload = !config.updateHold; // after a roll back, no automatic update until the user asks (0.9.17)
  autoUpdater.autoInstallOnAppQuit = true;
  const set = (s) => { updateState = s; broadcast('update', { ...s, supported: true }); };
  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => set({ state: 'downloading', version: nameOf(i), percent: 0 }));
  autoUpdater.on('download-progress', (p) => set({ ...updateState, state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-not-available', () => set({ state: 'current', version: versionName() }));
  autoUpdater.on('update-downloaded', (i) => set({ state: 'ready', version: nameOf(i) }));
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

let broadcast = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); }; // wrapped by the background jobs (0.9.32)

// Interface size. The UI is laid out for 1920x1080 (what the Ally shows in Game Mode). Bigger
// windows, like a 4K TV, zoom in by the same ratio so text and art keep their size on screen.
// Smaller windows (Steam Deck 1280x800) stay at 100%, which is what they were designed around.
function autoZoom() {
  if (!win || win.isDestroyed()) return 1;
  const [w, h] = win.getContentSize();
  // 0.9.17 (owner: clipped in a Desktop Mode window): smaller than the Deck's 1280x800, it zooms out to fit
  if (w < 1280 || h < 800) return Math.max(0.6, Math.round(Math.min(w / 1280, h / 800) * 20) / 20);
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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
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
  // console collections kept whole by themselves (0.9.34): 30 s after start, and again every 10 minutes, games of a
  // console that are in Steam but not in its collection are put in, only with Steam's interface reachable (no restart)
  const colsAuto = () => { if (!config.steam?.consoleCollections) return; steamMgr.fillCollections({ auto: true }).then((r) => { if (r.count) broadcast('toast', { text: `${r.count} game${r.count === 1 ? '' : 's'} added to ${r.count === 1 ? 'its' : 'their'} console collection in Steam`, kind: 'ok', icon: 'mdiSteam' }); }).catch((e) => log('console collections by itself:', e.message)); };
  // 0.9.48: on the scheduler (electron/scheduler.js), so both wait while a game runs and run once it has ended
  if (!globalThis.__colsAuto) {
    globalThis.__colsAuto = true;
    if (ssData.held) ssWatchBack(); // saves held from last time go up once RomM answers (0.9.52)
    scheduler.add('save-sync', { every: 30 * 60000, firstAfter: 40000, deferWhilePlaying: true, run: () => saveSyncRun({ why: 'scheduled' }) }); // 0.9.51
    scheduler.add('steam-collections', { every: 600000, firstAfter: 30000, deferWhilePlaying: true, run: async () => colsAuto() });
    scheduler.add('bios-check', { once: true, firstAfter: 45000, deferWhilePlaying: true, run: () => biosSetup({ install: true }).catch(() => {}) }); // 0.9.38: firmware too, when an emulator lacks it
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

const trophySvc = require('./trophyService')({ busy: () => !!(gameFocus.away || runOn),
  USER_DATA, api, broadcast: (c, d) => broadcast(c, d), log, loadJson,
  getConfig: () => config, saveConfig: () => saveConfig(), getLibrary: () => library,
  codeName: (src, code) => require('./titleNames').nameFor(src, code),
  findRom: (q) => identity.findRom(q),
});
require('./titleNames').setup({ dir: USER_DATA, fetchImpl: (...a) => webFetch(...a) });
// PS5 trophy names come from each game's own trophy package (0.9.37, KytyPS5): the downloaded PS5 game folders
require('./trophies').setPs5Games(() => { const out = []; const idx = romIndexMain(); for (const [id, p] of Object.entries(installedMap)) { const r = idx.get(Number(id)); if (r && [r.platform_slug, r.platform_fs_slug].includes('ps5') && isDir(p)) out.push(p); } return out; });
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
async function sgdbImage(name, kind, style, aspect = 0) {
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
  // 0.9.23 (owner: backgrounds cut off at the edges): among the sharp ones (1600+ wide), the hero whose shape
  // is closest to the space it fills, so the least is cropped away; then the sharpest and best voted
  if (kind === 'hero' && aspect > 0) {
    const off = (x) => (x.width && x.height ? Math.abs(Math.log((x.width / x.height) / aspect)) : 1);
    list.sort((a, b) => ((b.width || 0) >= 1600) - ((a.width || 0) >= 1600) || Math.round((off(a) - off(b)) * 10) || (b.width || 0) - (a.width || 0) || (b.score || 0) - (a.score || 0));
  }
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
  // the sharp background Cartridge itself shows for a game (0.9.16: Steam gets the same one)
  sharpHeroPng: async (rom) => { const u = rom && await sharpHero({ id: rom.id, name: rom.name }).catch(() => null); const f = u && decodeURIComponent(u.split('hz=')[1] || ''); return f ? fsp.readFile(path.join(HERO_DIR, path.basename(f))).catch(() => null) : null; },
  sgdbImage, cropTo: coverCrop,
  // the square icon Cartridge shows for the game (SteamGridDB), as PNG bytes, or null
  gameIconPng: async (rom) => { if (!rom) return null; const u = await gameIcon({ key: 'rom-' + rom.id, name: rom.name, year: rom.year ? new Date(rom.year > 1e11 ? rom.year : rom.year * 1000).getFullYear() : null }).catch(() => null); return u ? asPng(await fetchImage(u)) : null; },
  logoFile: async (rom) => { if (!rom) return null; await logoFor({ id: rom.id, name: rom.name, romm: rom.logo }).catch(() => null); const c = logoCache[rom.id]; return c?.file ? path.join(LOGO_DIR, c.file) : null; },
  emulationRoots: () => { const emu = readEmuDeckSettings(); return require('./trophies').emulationRoots([emu.emulationPath, config.romsRoot && path.dirname(config.romsRoot)].filter(Boolean)); },
  installRecord: (id) => installs[id] || null,
  isGamescope, version: app.getVersion(), osInfo: (() => { try { return (fs.readFileSync('/etc/os-release', 'utf8').match(/^PRETTY_NAME="?([^"\n]+)/m) || [])[1] || os.release(); } catch { return os.release(); } })(),
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
// ---------------- play time by day (0.9.19, Start's This week tile). Steam and RetroArch only keep a
// total per game, so each time the totals are read, what they grew by since the last read is added to
// the day the game was last played. Kept for 60 days in play-days.json; the first read only notes totals.
const PLAY_DAYS_FILE = path.join(USER_DATA, 'play-days.json');
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function notePlayDays(stats) {
  const f = loadJson(PLAY_DAYS_FILE, null), first = !f;
  const st = f || { snap: {}, days: {} };
  let changed = first;
  for (const [id, p] of Object.entries(stats)) {
    const was = st.snap[id] || 0, now = p.min || 0;
    if (now > was && !first && was) { const k = dayKey(p.last || Date.now()); st.days[k] = (st.days[k] || 0) + (now - was); changed = true; }
    else if (now > was && !first && !was && p.last && Date.now() - p.last < 7 * 864e5) { const k = dayKey(p.last); st.days[k] = (st.days[k] || 0) + now; changed = true; } // a new game this week: all its time is recent
    if (now !== was) { st.snap[id] = now; changed = true; }
  }
  const cut = dayKey(Date.now() - 60 * 864e5);
  for (const k of Object.keys(st.days)) if (k < cut) { delete st.days[k]; changed = true; }
  if (changed) saveJson(PLAY_DAYS_FILE, st);
}
function playWeek() {
  const st = loadJson(PLAY_DAYS_FILE, { days: {} }), out = [];
  for (let i = 6; i >= 0; i--) { const t = Date.now() - i * 864e5; out.push({ day: dayKey(t), dow: new Date(t).getDay(), min: Math.round(st.days?.[dayKey(t)] || 0) }); }
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
const gifSearch = (term, page) => require('./gifSearch').search(term, page);
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
    try { notePlayDays(out); } catch (e) { log('play days', e.message); }
    for (const [id, p] of Object.entries(out)) p.device = me;
    for (const [id, r] of Object.entries(remotePlay)) {
      const cur = out[id];
      if (!cur) out[id] = { min: 0, last: r.last, device: r.device, remote: !r.mine };
      else if (r.last > (cur.last || 0) + 60e3 && !r.mine) Object.assign(cur, { last: r.last, device: r.device, remote: true });
    }
    return out;
  },
  'play:device': ({ name }) => renameDevice(name),
  'play:week': () => playWeek(),
  // Syncthing, first look (0.9.19): read only, what it syncs and with whom
  'sync:status': () => { const S = require('./syncthing'); if (config.syncthing?.localKey) S.setLocalKey(config.syncthing.localKey); return S.status(); },
  // each file says which game it belongs to, when Cartridge can tell (0.9.24, owner: smart, not just a list)
  'sync:browse': async (arg) => {
    const folder = typeof arg === 'string' ? arg : arg?.id, onServer = typeof arg === 'object' && !!arg?.server;
    const S = require('./syncthing'), b = await S.browse(folder, { server: onServer ? config.syncthing?.server || null : null });
    try {
      const games = syncGameList(), names = new Map(games.map((g) => [g.id, g.name]));
      // each file matched on its own, so it carries its game's name; the folder's real path and name decide textures or saves
      for (const f of b.files) { const one = S.matchGames(games, [{ id: folder, label: b.label, path: b.path + '/' + b.label, files: [f] }]); const gid = Object.keys(one)[0]; if (gid) { f.game = names.get(Number(gid)) || ''; f.romId = Number(gid); f.kind = S.KIND_LABEL[Object.keys(one[gid]).find((k) => one[gid][k].length)] || 'Save'; } }
    } catch {}
    return b;
  },
  // 0.9.23 Syncthing page: this device in full, the main server (config.syncthing.server), games with synced files
  'sync:local': () => require('./syncthing').local(),
  // The Syncthing Update (0.9.29): this device as the main one (only on a blank Syncthing), pairing, joining
  'syncsaves:state': async () => {
    const S = require('./syncthing');
    let st = null, error = null; try { st = await S.saveSync(); } catch (e) { error = e.message; }
    return { ...(st || {}), error, role: config.syncthing?.role || '', mainId: config.syncthing?.mainId || '', roots: require('./saves').syncRoots({ extra: saveExtras() }) };
  },
  'syncsaves:makeMain': async () => {
    const roots = require('./saves').syncRoots({ extra: saveExtras() });
    const r = await require('./syncthing').makeMain(roots, { mine: config.syncthing?.role === 'main' });
    config.syncthing = { ...(config.syncthing || {}), role: 'main', mainId: '' }; saveConfig(); savesCache = null;
    log('syncthing: main device, save folders', r.made.join(' ') || 'none new');
    return r;
  },
  'syncsaves:addDevice': async ({ id, name }) => { if (config.syncthing?.role !== 'main') throw new Error('Make this device the main one first.'); await require('./syncthing').addDevice({ id, name }); return true; },
  'syncsaves:join': async ({ id, name }) => {
    const S = require('./syncthing'), st = await S.saveSync();
    if (!st.blank && config.syncthing?.role !== 'member') throw new Error('This Syncthing is already set up with other devices or folders, so Cartridge leaves it as it is.');
    await S.addDevice({ id, name: name || 'Main device', introducer: true });
    config.syncthing = { ...(config.syncthing || {}), role: 'member', mainId: String(id).trim().toUpperCase() }; saveConfig();
    watchJoin();
    return true;
  },
  'syncsaves:twoWay': async ({ id }) => { await require('./syncthing').setType(id, 'sendreceive'); return true; },
  'syncsaves:versions': ({ id }) => require('./syncthing').versions(id),
  'syncsaves:restore': ({ id, files }) => { log('syncthing: restore', id, Object.keys(files || {}).join(' ')); savesCache = null; return require('./syncthing').restore(id, files); },
  // every save on this device with the game it belongs to (0.9.29); read only
  'saves:list': ({ fresh } = {}) => savesList(fresh),
  // Cartridge Save Sync (0.9.51)
  'savesync:status': () => ({ mode: config.saveSync || null, on: saveSyncOn(), syncthing: syncthingSaves(), busy: !!ssBusy, last: ssData.last, saved: Object.keys(ssData.ledger).length, backups: SAVE_BACKUPS, held: ssData.held ? { ...ssData.held, games: ssData.held.romIds.map((id) => romIndexMain().get(id)?.name).filter(Boolean) } : null }),
  'savesync:set': ({ on } = {}) => {
    if (on && syncthingSaves()) throw new Error('This device syncs saves with Syncthing. Stop using Syncthing for saves first: a device uses one or the other.');
    config.saveSync = on ? 'cartridge' : null; saveConfig();
    if (on) setTimeout(() => saveSyncRun({ why: 'on' }).catch(() => {}), 1500);
    return handlers['savesync:status']();
  },
  // Syncthing stops being this device's way to sync saves: Cartridge stops managing it; Syncthing itself and its
  // folders are left as they are (remove the folders in Syncthing if you don't want them any more)
  'savesync:leaveSyncthing': () => { config.syncthing = { ...(config.syncthing || {}), role: null, mainId: null }; saveConfig(); clearInterval(joinT); return handlers['savesync:status'](); },
  'savesync:run': (o = {}) => saveSyncRun(o),
  // Cartridge Cloud Sync before a game starts: this game's saves checked against RomM, the newest brought here
  'savesync:before': ({ romId }) => saveSyncRun({ romId: Number(romId), why: 'before' }),
  'savesync:resolve': ({ key, choice, romId }) => saveSyncRun({ key, choice: choice === 'mine' ? 'mine' : 'theirs', romId: romId == null ? null : Number(romId), why: 'resolve' }),
  // A game's saves in one place (0.9.57, owner: pressing a game in Cartridge Save Sync shows the game, where its save
  // is and more): every save of it on this device (a memory card counts for each game on it), where it is, how big,
  // when it last changed and last synced, its history, backups kept here, and the versions in RomM
  'savesync:game': async ({ romId }) => {
    romId = Number(romId);
    const SS = require('./saveSync'), extra = saveExtras();
    const all = SS.units({ extra, games: ssGames(), carriers: ssCarriers() });
    const mine = all.filter((u) => u.romId === romId || (u.romIds || []).includes(romId));
    const statOf = (u) => {
      try {
        const st = fs.statSync(u.path);
        if (!st.isDirectory()) return { size: st.size, at: st.mtimeMs, files: 1 };
        if (u.kind === 'files') { let size = 0, at = 0; for (const f of u.files || []) { try { const x = fs.statSync(path.join(u.path, f)); size += x.size; at = Math.max(at, x.mtimeMs); } catch {} } return { size, at, files: (u.files || []).length }; }
        const z = require('./saves').sizeOf(u.path); return { size: z.size, at: z.at, files: z.files };
      } catch { return { size: 0, at: 0, files: 0 }; }
    };
    const backupsOf = (key) => { try { return fs.readdirSync(path.join(SAVE_BACKUPS, key.replace(/[^\w.-]+/g, '_'))).sort().reverse(); } catch { return []; } };
    const saves = mine.map((u) => {
      const led = ssData.ledger[u.key] || null, b = backupsOf(u.key);
      return { key: u.key, label: u.label || '', emu: u.emu, emuName: SS.LABEL[u.emu] || u.emu, kind: u.kind, path: u.path, card: u.card, states: !!u.states, shared: u.card ? (u.romIds || []).length : 0, ...statOf(u),
        synced: led?.at || null, inRomm: !!led?.remoteId, history: (ssData.history?.[u.key] || []).slice(0, 30), backups: b.length, backupsDir: b.length ? path.join(SAVE_BACKUPS, u.key.replace(/[^\w.-]+/g, '_')) : null };
    });
    let versions = null;
    if (saveSyncOn()) { try { versions = await Promise.race([handlers['savesync:versions']({ romId }), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 6000))]); } catch { versions = null; } }
    const conflicts = (ssData.last?.conflicts || []).filter((c) => Number(c.romId) === romId);
    return { romId, on: saveSyncOn(), saves, versions, conflicts, held: !!ssData.held?.romIds?.includes(romId), last: ssData.last?.at || null };
  },
  // older versions of a game's saves in RomM, and putting one back
  'savesync:versions': async ({ romId }) => {
    const SS = require('./saveSync');
    return (await ssRpcList(Number(romId))).map((x) => { const m = /^cartridge:([^:]+):(dir|file|files):(.+)$/.exec(x.slot) || []; return { id: x.id, key: m[3], emu: m[1], emuName: SS.LABEL[m[1]] || m[1], at: x.updated_at, size: x.file_size_bytes, device: x.device_syncs?.find((d) => d.device_id === x.origin_device_id)?.device_name || '' }; }).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  },
  'savesync:restore': async ({ id, romId }) => {
    if (!saveSyncOn()) throw new Error('Cartridge Save Sync is off.');
    const SS = require('./saveSync'), extra = saveExtras();
    const saves = await ssRpcList(Number(romId)), save = saves.find((x) => x.id === Number(id));
    if (!save) throw new Error('That version isn’t in RomM any more.');
    const local = SS.units({ extra, games: ssGames(), carriers: ssCarriers() });
    const u = local.find((x) => x.slot === save.slot) || SS.remoteOnly([save], new Set())[0];
    const r = await SS.restore(u, save, ssRpc(await rommDevice()), ssLedger, { extra, backupsRoot: SAVE_BACKUPS });
    if (r.result === 'busy') throw new Error(`Close ${SS.LABEL[u.emu] || u.emu} first: Cartridge never changes saves while the emulator is open.`);
    if (r.result === 'unplaced') throw new Error(`${SS.LABEL[u.emu] || u.emu} hasn’t made its save folders on this device yet. Open it once, then try again.`);
    if (r.result === 'damaged') throw new Error('That version didn’t match RomM’s check, so nothing was changed.');
    log('save sync: restored', u.key, 'version', id);
    ssNote(u.key, { result: 'restored', why: 'restore', version: save.updated_at || null });
    return r;
  },
  'saves:forRom': async ({ romId }) => (await savesList()).filter((s) => (s.romIds || []).includes(Number(romId))),
  'sync:server': () => require('./syncthing').server(config.syncthing?.server || {}),
  'sync:setServer': async (srv) => {
    if (srv && srv.address) await require('./syncthing').server(srv); // only saved once it answers
    config.syncthing = { ...(config.syncthing || {}), server: srv && srv.address ? { address: String(srv.address).trim(), apikey: String(srv.apikey || '').trim() } : null };
    saveConfig(); return true;
  },
  'sync:rescan': (folder) => require('./syncthing').rescan(folder),
  'sync:setKey': async ({ key }) => { const S = require('./syncthing'); S.setLocalKey(key); const st = await S.status(); if (!st.running) { S.setLocalKey(config.syncthing?.localKey || ''); throw new Error(st.why || 'Syncthing didn’t accept that key.'); } config.syncthing = { ...(config.syncthing || {}), localKey: String(key || '').trim() }; saveConfig(); return st; },
  // Welcome → Syncthing (0.9.24): folders to offer, share one, or install Syncthing (SyncThingy from Flathub, user scope)
  'sync:suggest': () => require('./syncthing').suggest(os.homedir(), config.romsRoot ? [path.join(path.dirname(config.romsRoot), 'saves')] : []),
  'sync:addFolder': async ({ dir, label }) => { const r = await require('./syncthing').addFolder({ dir, label }); config.syncthing = { ...(config.syncthing || {}), folder: dir }; saveConfig(); return r; },
  'sync:install': async () => {
    const fp = require('./syncthing').FLATPAKS[0];
    await require('./emuGet').getFlatpak(fp, (pct) => broadcast('sync-install', { pct }));
    // started once so Syncthing makes its settings file and API key; SyncThingy keeps it running in the tray
    try { const p = require('child_process').spawn('flatpak', ['run', fp], { detached: true, stdio: 'ignore' }); p.unref(); } catch {}
    const S = require('./syncthing');
    for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 1000)); const st = await S.status().catch(() => null); if (st?.running) return st; }
    return S.status();
  },
  // Syncthing in Game Mode (0.9.28, owner: it only synced on the desktop): a systemd user service runs it in both
  // modes. The installed program, else SyncThingy's own syncthing through Flatpak. Nothing needs a password.
  'sync:service': async ({ enable = true } = {}) => {
    const unit = path.join(os.homedir(), '.config/systemd/user/cartridge-syncthing.service');
    const sh = (args) => new Promise((res) => require('child_process').execFile('systemctl', ['--user', ...args], { timeout: 20000 }, (e, out) => res({ ok: !e, out: String(out || '') })));
    if (!enable) { await sh(['disable', '--now', 'cartridge-syncthing.service']); fs.rmSync(unit, { force: true }); await sh(['daemon-reload']); return { on: false }; }
    const S = require('./syncthing'), f = S.find();
    let exec = null;
    if (f.program) exec = 'syncthing --no-browser --no-restart';
    else if (f.flatpak) exec = `/usr/bin/flatpak run --command=syncthing ${f.flatpak} --no-browser --no-restart`;
    if (!exec) throw new Error('Syncthing isn’t installed on this device.');
    fs.mkdirSync(path.dirname(unit), { recursive: true });
    fs.writeFileSync(unit, `[Unit]\nDescription=Syncthing, kept running by Cartridge (Game Mode and desktop)\nAfter=network-online.target\n\n[Service]\nExecStart=${exec}\nRestart=on-failure\nRestartSec=30\n\n[Install]\nWantedBy=default.target\n`);
    await sh(['daemon-reload']);
    const r = await sh(['enable', '--now', 'cartridge-syncthing.service']);
    if (!r.ok) throw new Error('The service didn’t start. Syncthing may already be running another way, which is fine.');
    log('syncthing service on', exec);
    return { on: true };
  },
  'sync:serviceState': async () => ({ on: fs.existsSync(path.join(os.homedir(), '.config/systemd/user/cartridge-syncthing.service')) }),
  'sync:games': async () => require('./syncthing').gamesSynced(syncGameList(), { server: config.syncthing?.server || null }),
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
// ---------------------------------------------------------------- 0.9: library check and repair
// Every downloaded game checked against RomM's own record, the way a finished download is: sizes,
// and md5/sha1 where RomM hashes the file itself (not zip/7z/rar/chd). Only reads: nothing is deleted
// here; a damaged game is re-downloaded when you choose to.
let verifyRun = null;
async function verifyLibrary() {
  if (verifyRun) return verifyRun.promise;
  const ac = new AbortController();
  const it = { abort: ac, currentFile: null };
  verifyRun = { ac, promise: (async () => {
    const ids = Object.keys(installedMap).map(Number).filter((id) => installedMap[id] && installedMap[id] !== MARKED);
    const byId = romIndexMain();
    const out = { checked: 0, damaged: [], skipped: 0 };
    for (const [i, id] of ids.entries()) {
      if (ac.signal.aborted) break;
      const lr = byId.get(id);
      broadcast('verify-progress', { done: i, total: ids.length, name: lr?.name || '' });
      let rom;
      try { rom = await api(`/api/roms/${id}`); } catch { out.skipped++; continue; }
      const where = installedMap[id];
      if (manifest[id]?.installedIn) { out.skipped++; continue; } // installed into RPCS3: RomM has the .pkg, not this folder
      const files = (rom.files || []).slice();
      const st = await fsp.stat(where).catch(() => null);
      if (!st) { out.damaged.push({ romId: id, name: rom.name, why: 'Its files are gone' }); continue; }
      // PS4/PS5 games unpacked from a zip can't be compared with the zip RomM has
      if (isFolderSystem(rom) && files.length === 1 && /\.zip$/i.test(files[0].file_name) && st.isDirectory()) { out.skipped++; continue; }
      const prefix = rom.full_path + '/';
      const pairs = st.isDirectory() ? files.map((f) => [path.join(where, f.full_path.startsWith(prefix) ? f.full_path.slice(prefix.length) : f.file_name), f]) : [[where, files[0]]];
      const bad = [];
      for (const [file, f] of pairs) {
        try { const r = await checkFile(file, f, it); if (r) bad.push([path.basename(file), r.why]); } catch (e) { if (ac.signal.aborted) break; }
      }
      out.checked++;
      if (bad.length) out.damaged.push({ romId: id, name: rom.name, why: bad[0][1] === 'missing' ? `${bad[0][0]} is missing` : `${bad[0][0]} doesn't match RomM's record`, files: bad.length });
    }
    broadcast('verify-progress', null);
    out.cancelled = ac.signal.aborted;
    return out;
  })().finally(() => { verifyRun = null; }) };
  return verifyRun.promise;
}

// ---------------------------------------------------------------- 0.9: Setup, shortcut health, per-game emulator
const handlers09 = {
  'setup:overview': () => steamMgr.setupOverview(),
  'setup:scan': async ({ drives } = {}) => { await steamMgr.scanEmulators({ drives: !!drives }); return steamMgr.setupOverview(); },
  'setup:confirm': ({ path: f, id }) => steamMgr.confirm(f, id),
  'setup:fork': ({ path: f, of, name }) => steamMgr.markFork(f, of, name),
  'setup:use': ({ key, file, as, args }) => steamMgr.useFile(key, file, { as, args }),
  'setup:report': () => steamMgr.setupReport(),
  // give a Flatpak emulator your games folder (asked first in Setup): only its Flatpak permissions change
  'setup:flatpakAllow': async ({ id, dir }) => {
    if (!/^[A-Za-z0-9_.-]+$/.test(String(id || '')) || !path.isAbsolute(String(dir || ''))) throw new Error('Not a Flatpak app or folder');
    await flatpakAsync(['override', '--user', `--filesystem=${dir}`, id]);
    return true;
  },
  // Flatpak Steam may start programs outside its sandbox (flatpak-spawn --host): 0.9.3 K, K2
  'setup:steamFlatpakAllow': async () => {
    await flatpakAsync(['override', '--user', '--talk-name=org.freedesktop.Flatpak', 'com.valvesoftware.Steam']);
    return true;
  },
  'setup:done': () => { config.setupDone = Date.now(); saveConfig(); return true; },
  // a game's manual (PDF) from RomM, kept in manuals/ so it opens offline next time
  'rom:manual': async ({ romId }) => {
    const dir = path.join(USER_DATA, 'manuals'), f = path.join(dir, `${Number(romId)}.pdf`);
    if (fs.existsSync(f)) return fs.readFileSync(f);
    const rom = await api(`/api/roms/${Number(romId)}`);
    if (!rom.path_manual) throw new Error('RomM has no manual for this game.');
    const base = await resolveBase();
    const r = await fetch(`${base}/assets/romm/resources/${String(rom.path_manual).split('/').map(encodeURIComponent).join('/')}`, { headers: authHeaders() });
    if (!r.ok) throw new Error(`RomM could not send the manual (error ${r.status})`);
    const buf = Buffer.from(await r.arrayBuffer());
    await fsp.mkdir(dir, { recursive: true });
    fs.writeFileSync(f, buf);
    return buf;
  },
  'library:verify': () => verifyLibrary(),
  'library:redownload': ({ romId }) => redownload(Number(romId)),
  'library:verifyCancel': () => { verifyRun?.ac.abort(); return true; },
  'steam:health': () => steamMgr.health(),
  'steam:consoleCollections': () => steamMgr.syncConsoleCollections(),
  // one console's collection with every game of it in Steam (0.9.34), and adding the ones not in it
  'steam:consoleCollection': ({ key }) => steamMgr.consoleCollection(String(key)),
  'steam:fillCollections': ({ keys, appids } = {}) => steamMgr.fillCollections({ keys: keys || null, appids: appids || null }),
  'steam:colReview': () => steamMgr.collectionsReview(),
  'steam:colApply': (a) => steamMgr.collectionsApply(a),
  'steam:healthFix': ({ appids }) => steamMgr.healthFix(appids || []),
  'steam:moved': () => steamMgr.movedEmulators(),
  'steam:gameEmu': ({ romId }) => ({ current: steamMgr.gameEmu(romId), key: steamMgr.forRom(romId).console }),
  'steam:gameEmuOptions': ({ key }) => steamMgr.candidatesFor(key),
  'steam:setGameEmu': ({ romId, id }) => steamMgr.setGameEmu(romId, id),
  'steam:gameTemplate': ({ romId }) => steamMgr.gameTemplate(romId, steamMgr.forRom(romId).console),
  'steam:setGameTemplate': ({ romId, template }) => steamMgr.setGameTemplate(romId, template),
  'steam:refreshGame': ({ romId }) => steamMgr.refreshGame(romId),
  // shadPS4 version per game (0.9.17): the Qt launcher's versions, and this game's pick
  'steam:shadVersions': ({ romId }) => {
    let last = null;
    if ((config.steam || {}).shadProof) { noteShadRun(); const r = loadJson(SHAD_RUNS_FILE, []); last = r.find((x) => x.romId === Number(romId)) || null; } // this game's own last run (0.9.29)
    return { list: steamMgr.shadVersions(), current: ((config.steam || {}).shadVersions || {})[romId] || null, last };
  },
  'shadv:runs': () => { noteShadRun(); return loadJson(SHAD_RUNS_FILE, []); },
  'steam:setShadVersion': ({ romId, path: p }) => { const m = ((config.steam ||= {}).shadVersions ||= {}); if (p) m[romId] = p; else delete m[romId]; saveConfig(); return true; },
  // frame generation (0.9.17): what's installed, the picks, and Cartridge's games in Steam with theirs
  'steam:frameGen': () => {
    const fg = require('./frameGen'), conf = (config.steam ||= {}).frameGen || {};
    const ov = steamMgr.overview();
    const games = ov.games.filter((g) => g.inSteam && g.ours).map((g) => ({ romId: g.romId, name: g.name, console: g.console, own: (conf.games || {})[g.romId] || null, uses: fg.choiceFor(conf, g.romId, g.console) }));
    return { found: fg.detect(), conf, games, consoles: ov.consoles.filter((c) => c.inSteam).map((c) => ({ key: c.key, platform: c.platform, inSteam: c.inSteam, own: (conf.consoles || {})[c.key] || null })) };
  },
  // { scope: 'default' | 'console' | 'game', id, value: 'lsfg' | 'mako' | 'off' | null (follow the level above) }
  'steam:setFrameGen': ({ scope, id, value }) => {
    const conf = ((config.steam ||= {}).frameGen ||= {});
    const v = ['lsfg', 'mako', 'off'].includes(value) ? value : null;
    if (scope === 'default') conf.default = v || 'off';
    else { const m = (conf[scope === 'console' ? 'consoles' : 'games'] ||= {}); if (v) m[id] = v; else delete m[id]; }
    saveConfig();
    // 0.9.24 (owner): the Steam shortcuts follow at once, no Update on the console page needed
    (async () => {
      try {
        if (scope === 'game') await steamMgr.refreshGame(Number(id));
        else for (const k of scope === 'console' ? [id] : steamMgr.overview().consoles.filter((c) => c.inSteam).map((c) => c.key)) await steamMgr.refresh(k);
        broadcast('steam-changed', { frameGen: true });
      } catch (e) { log('frame gen refresh', e.message); }
    })();
    return conf;
  },
  // 0.9.3: everything waiting for you, in one list (Settings → Emulators) instead of start-up pop-ups
  'issues:list': async () => {
    const out = [];
    const add = (kind, text, sub, fix) => out.push({ kind, text, sub: sub || '', fix });
    try {
      const v = config.configured ? (await probe(await resolveBase(), config.server, 4000))?.version : null;
      if (v && rommTooOld(v)) add('romm', `RomM ${v} is older than Cartridge supports (${ROMM_MIN.join('.')} or newer)`, 'Games still sync, but collections, play status and uploads may not work. Update RomM on your server.', 'romm');
    } catch {}
    try {
      const miss = (await steamMgr.verifyCollections()) || [];
      if (miss.length) { const names = [...new Set(miss.map((m) => m.collection))]; add('collections', `${miss.length} game${miss.length === 1 ? ' isn’t' : 's aren’t'} in ${names.length === 1 ? 'its' : 'their'} Steam collection${names.length === 1 ? '' : 's'}: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`, miss.some((m) => m.console) ? 'Games in Steam that aren’t in their console’s collection yet' : 'Steam Cloud may have replaced your Steam collections', 'collections'); out[out.length - 1].items = miss.map((m) => ({ name: m.name, collection: m.collection })); }
    } catch {}
    try {
      const h = steamMgr.health();
      const by = (k) => h.problems.filter((p) => p.issues.some((i) => i.kind === k)).length;
      const n = { emulator: by('emulator'), game: by('game'), core: by('core'), flatpak: by('flatpak') };
      if (n.emulator) add('moved', `${n.emulator} Steam shortcut${n.emulator === 1 ? ' points' : 's point'} at an emulator that isn't there any more`, 'Usually an update renamed it, or it moved', 'health');
      if (n.game) add('game', `${n.game} Steam shortcut${n.game === 1 ? ' is' : 's are'} for a game that's gone from this device`, '', 'health');
      if (n.core + n.flatpak) add('core', `${n.core + n.flatpak} Steam shortcut${n.core + n.flatpak === 1 ? ' needs' : 's need'} a missing RetroArch core or Flatpak`, '', 'health');
    } catch (e) { log('issues: health', e.message); }
    try { if (steamMgr.flatpakSteamAccess() === 'needed') add('fpsteam', 'Flatpak Steam needs permission to start your emulators', 'Its games run in a sandbox. Allow it to start programs on your system (flatpak override). Restart Steam afterwards.', 'fpsteam'); } catch {}
    try {
      for (const m of steamMgr.movedEmulators().filter((x) => !x.shortcuts)) add('setup', `Your launch setup points at ${m.exe}, which isn't there any more`, '', 'setup');
      for (const c of steamMgr.setupOverview().consoles) for (const k of c.checks) if (k.bios && k.level === 'warn') add('bios', `${c.platform}: ${k.text}`, '', 'setup');
    } catch (e) { log('issues: setup', e.message); }
    return out;
  },
};
const handlers = {
  ...trophySvc.handlers,
  ...handlers09,
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
  // Start's picture tiles (0.9.23, owner: custom images and GIFs): copied into Cartridge's folder, so the
  // tile keeps working if the original moves; served as romimg://img/?st=<name>
  'start:image': async ({ file }) => {
    const ext = path.extname(file || '').toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'].includes(ext)) throw new Error('Pick a PNG, JPG, WebP, AVIF or GIF image');
    const st = await fsp.stat(file);
    if (st.size > 40 * 1024 * 1024) throw new Error('That image is too big (over 40 MB)');
    const name = Date.now().toString(36) + ext;
    await fsp.mkdir(path.join(USER_DATA, 'start-images'), { recursive: true });
    await fsp.copyFile(file, path.join(USER_DATA, 'start-images', name));
    return 'romimg://img/?st=' + encodeURIComponent(name);
  },
  // Search pictures for a picture widget (0.9.28, owner: find a 4K wallpaper or a GIF without leaving Cartridge).
  // Wallhaven's open API (safe-for-work only, at least 3840x2160) for pictures, Openverse (openly licensed,
  // GIFs only, the largest first) for moving ones. Neither needs an account or a key.
  'start:search': async ({ q, kind = 'image', page = 1 }) => {
    const wf = require('./webFetch'), term = String(q || '').trim().slice(0, 80);
    if (!term) return [];
    if (kind === 'gif') return gifSearch(term, page);
    const r = await wf(`https://wallhaven.cc/api/v1/search?q=${encodeURIComponent(term)}&categories=111&purity=100&atleast=3840x2160&sorting=relevance&page=${page}`, { headers: { 'User-Agent': 'Cartridge' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Wallhaven answered ${r.status}`);
    const j = await r.json();
    return (j.data || []).map((x) => ({ url: x.path, thumb: x.thumbs?.large || x.thumbs?.original || x.path, w: x.dimension_x || 0, h: x.dimension_y || 0, by: '', license: '' }));
  },
  // a picked search result, kept like a picture from this device
  'start:imageUrl': async ({ url }) => {
    if (!/^https:\/\//.test(String(url || ''))) throw new Error('That picture can’t be fetched');
    const ext = (path.extname(new URL(url).pathname).toLowerCase().match(/^\.(png|jpe?g|webp|gif|avif)$/) || ['.jpg'])[0];
    const name = Date.now().toString(36) + ext;
    await fsp.mkdir(path.join(USER_DATA, 'start-images'), { recursive: true });
    const r = await require('./webFetch')(url, { headers: { 'User-Agent': 'Cartridge' }, signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`The picture didn’t download (${r.status})`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 40 * 1024 * 1024) throw new Error('That picture is too big (over 40 MB)');
    await fsp.writeFile(path.join(USER_DATA, 'start-images', name), buf);
    return 'romimg://img/?st=' + encodeURIComponent(name);
  },
  // Start's own widgets (0.9.23, owner: custom HTML widgets): the page is kept as a file and shown in a
  // sandboxed frame (no access to Cartridge, its own blank origin), served as romimg://img/?wh=<id>
  'start:html': ({ id, html }) => {
    const name = String(id || '').replace(/[^\w-]/g, '');
    if (!name) throw new Error('No widget id');
    fs.mkdirSync(path.join(USER_DATA, 'start-widgets'), { recursive: true });
    const f = path.join(USER_DATA, 'start-widgets', name + '.html');
    if (html == null) { try { fs.rmSync(f); } catch {} return null; }
    fs.writeFileSync(f, String(html).slice(0, 512 * 1024));
    return 'romimg://img/?wh=' + name + '&v=' + Date.now().toString(36);
  },
  'start:htmlGet': ({ id }) => { try { return fs.readFileSync(path.join(USER_DATA, 'start-widgets', String(id || '').replace(/[^\w-]/g, '') + '.html'), 'utf8'); } catch { return ''; } },
  'start:imageRemove': ({ url }) => { const m = /[?&]st=([^&]+)/.exec(url || ''); if (m) try { fs.rmSync(path.join(USER_DATA, 'start-images', path.basename(decodeURIComponent(m[1])))); } catch {} return true; },
  'wallpaper:clear': () => { for (const f of fs.readdirSync(USER_DATA)) if (/^wallpaper\./.test(f)) try { fs.rmSync(path.join(USER_DATA, f)); } catch {} config.ui.wallpaper = ''; saveConfig(); return config; },
  // an emulator's own folders (0.9.24): see, open and change them, written to the emulator's settings
  'emupaths:get': ({ id }) => require('./emuPaths').describe(id),
  'emupaths:set': ({ id, rid, value }) => {
    const P = require('./emuPaths');
    notRunning(id, P.NAMES[id] || id);
    const d = P.setPath(id, rid, value);
    log('emulator folder', id, rid, Array.isArray(value) ? value.join(', ') : value || '(default)');
    // PPSSPP's Flatpak follows the link only when it may see where it points (0.9.49)
    if (id === 'ppsspp' && value && P.locate('ppsspp')?.flatpak) flatpakAsync(['override', '--user', `--filesystem=${value}`, 'org.ppsspp.PPSSPP']).catch((e) => { log('ppsspp flatpak access', e.message); });
    return d;
  },
  'fs:openFolder': async ({ path: p }) => { if (!p || !isDir(p)) throw new Error('That folder isn’t there yet.'); const err = await require('electron').shell.openPath(p); if (err) throw new Error(err); return true; },
  'clip:write': ({ text }) => { require('electron').clipboard.writeText(String(text || '')); return true; },
  'clip:read': async () => String((await require('electron').clipboard.readText()) || '').trim().slice(0, 4000),
  'logo:get': (r) => logoFor(r),
  'ra:signin': async ({ user, key }) => {
    let p;
    try { p = await raApi('GetUserProfile', {}, { user: user.trim(), key: key.trim() }); }
    catch (e) { log('ra: sign-in failed:', e.message); throw e; }
    if (!p || !p.User) { log('ra: sign-in got no profile', JSON.stringify(p).slice(0, 200)); throw new Error('RetroAchievements did not recognise that account. Check the username and the web API key (retroachievements.org → Settings → Authentication).'); }
    config.ra = { user: p.User, key: key.trim() }; saveConfig(); raMem.clear();
    return { user: p.User };
  },
  // Emulator sign-in (F14): list first, then the password goes to RetroAchievements once for a token
  'ra:emuTargets': () => require('./raLogin').targets(os.homedir(), { steamRoots: steamMgr.steamRoots?.() || [] }).map((t) => ({ id: t.id, name: t.name, user: t.user, flatpak: t.flatpak, files: t.files.map((f) => f.replace(os.homedir(), '~')) })),
  'ra:emuSignin': async ({ user, password, ids }) => {
    const ra = require('./raLogin');
    let auth;
    try { auth = await ra.login(String(user || '').trim(), String(password || ''), { ua: `Cartridge/${app.getVersion()} (Linux)` }); }
    catch (e) { log('ra: emulator sign-in failed:', e.message); throw e; }
    const list = ra.targets(os.homedir(), { steamRoots: steamMgr.steamRoots?.() || [] }).filter((t) => !ids || ids.includes(t.id));
    const res = ra.apply(list, auth);
    log('ra: emulators signed in', res.map((r) => `${r.name}:${r.ok ? 'ok' : r.error}`).join(' '));
    return res;
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
  'logo:fetchAll': (o) => fetchAllLogos(o?.kinds || null),
  'logo:stopAll': () => { if (fetchAll) fetchAll.stop = true; return true; },
  'art:all': () => artOverrides,
  'art:sharpHero': (a) => sharpHero(a || {}),
  // every hero already on disk (and every game SteamGridDB has none for, this week), asked once at start, so
  // those show at once instead of each waiting its turn in the queue (0.9.23, owner: Home's hero loads instantly)
  'art:sharpKnown': () => {
    const out = {};
    for (const [id, c] of Object.entries(heroCache)) {
      if (c?.file) { if (fs.existsSync(path.join(HERO_DIR, c.file))) out[id] = 'romimg://img/?hz=' + encodeURIComponent(c.file); }
      else if (c && Date.now() - c.t < 7 * 864e5) out[id] = null;
    }
    return out;
  },
  'art:search': (q) => sgdbArt(q),
  'art:set': (q) => setArt(q),
  'art:reset': ({ id }) => { delete artOverrides[id]; delete logoCache[id]; saveArt(); saveLogoCache(); return {}; },
  'logo:test': async ({ key }) => {
    const r = await webFetch(SGDB_BASE() + '/search/autocomplete/zelda', { headers: { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(12000) });
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
  // Quick Menu's one Refresh Library (0.9.3 G3): RomM scans its folders when the sign-in may ask it
  // to, then Cartridge resyncs; without that right it only resyncs
  'library:refresh': async () => {
    let scanned = false;
    try { await scanServer(); scanned = true; } catch (e) { log('refresh: scan skipped', e.message); }
    const res = await syncLibrary();
    return { scanned, ...res };
  },
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
        requested_scopes: ['me.read', 'roms.read', 'roms.user.read', 'roms.user.write', 'platforms.read', 'assets.read', 'assets.write', 'firmware.read', 'collections.read', 'collections.write', 'roms.write', 'devices.read', 'devices.write'] }),
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
  'roms:delete': async ({ romId, path: p, alsoEmu }) => {
    let target = p || manifest[romId]?.path;
    // a hand-made mark has no files of its own: only remove the mark, never touch folders
    if (target === MARKED || (marks[romId] && !manifest[romId] && (!target || target === MARKED))) {
      delete marks[romId]; saveMarks(); computeInstalled(); try { steamMgr.onDeleted(romId); } catch {} return true;
    }
    if (!target) throw new Error('Nothing to delete');
    // a game living in RPCS3's storage (its .pkg already gone), or its download plus the RPCS3
    // copy when asked: only through every check in pkgInstall.safeToRemove (plan D3)
    const inEmu = !!manifest[romId]?.installedIn;
    if (inEmu || alsoEmu) {
      const rec = installs[romId], emu = rec?.emu === 'vita3k' ? 'Vita3K' : 'RPCS3';
      const ok = pkgInst.safeToRemove(rec, emuRoots(rec?.emu));
      if (!ok.ok) throw new Error(`Cartridge won't delete this from ${emu}: ${ok.why} Delete it in ${emu} instead.`);
      await removeWithProgress(ok.dir, romId);
      delete installs[romId]; saveInstalls();
      if (inEmu) target = null;
    }
    if (target) {
      // never delete a whole console folder or the ROMs root
      const roots = new Set([config.romsRoot, ...extraRoots(), ...(library?.platforms || []).flatMap((pl) => platformDirs(pl))].filter(Boolean).map((x) => path.resolve(x)));
      if (roots.has(path.resolve(target))) throw new Error('Refusing to delete a whole console folder');
      await removeWithProgress(target, romId);
    }
    delete manifest[romId];
    saveManifest();
    delete installedMap[romId];
    broadcast('installed-changed', { romId, path: null });
    try { if (steamMgr.onDeleted(romId)) broadcast('steam-auto', { romId, action: 'remove' }); } catch (e) { log('steam auto remove', e.message); }
    return true;
  },
  // 0.9.3 D: PS3 packages installed through RPCS3
  // emu: 'rpcs3' or 'vita3k'; emuName for the UI; cmd: the emulator found, or null
  'pkg:check': async ({ romId }) => {
    const m = manifest[romId];
    let rec = installs[romId] || null;
    const running = pkgRun?.romId === romId;
    const lic = rec?.emu === 'rpcs3' ? installedLicences(rec) : [];
    if (!m?.path || m.installedIn) return { pkgs: 0, installed: rec, emu: rec?.emu || null, emuName: rec?.emu === 'vita3k' ? 'Vita3K' : 'RPCS3', running, licenceMissing: lic };
    const r = pkgInst.packagesIn(m.path);
    // installed in the emulator before Cartridge (or by hand): adopt it, so it's managed without a
    // reinstall (0.9.15). created: false, so Cartridge never deletes it from the emulator's storage.
    const adopt = (emu, serial, dir) => { if (!rec && serial && dir) { rec = installs[romId] = { emu, serial, dir, created: false, adopted: true, at: Date.now(), files: [] }; saveInstalls(); afterInstall(romId); } };
    if (r.pkgs.length && !rec) { const id = r.titleIds?.[0]; const hit = id && rpcs3Hdds().map((h) => path.join(h, 'game', id)).find((d) => patchesMod.sfoAt(path.join(d, 'PARAM.SFO')).TITLE_ID === id); adopt('rpcs3', id, hit); }
    if (r.pkgs.length) {
      const cmd = steamMgr.rpcs3Command();
      const plan = pkgInst.licencePlan(r, rpcs3Hdds());
      return { emu: 'rpcs3', emuName: 'RPCS3', pkgs: r.pkgs.length, updates: r.pkgs.filter((x) => x.patch).length, licences: plan.filter((l) => l.from !== 'missing' && l.from !== 'rpcs3').length, titleIds: r.titleIds, installed: rec, cmd: cmd ? cmd.from || path.basename(cmd.exe) : null, running,
        needsLicence: rec ? [] : plan.filter((l) => l.from === 'missing').map((l) => ({ contentId: l.contentId, titleId: l.titleId })), licenceMissing: lic };
    }
    const v = await pkgInst.vitaContent(m.path).catch(() => null);
    if (v && !rec && v.titleId) { const hit = emuRoots('vita3k').map((p) => path.join(p, 'ux0/app', v.titleId)).find((d) => fs.existsSync(path.join(d, 'sce_sys', 'param.sfo'))); adopt('vita3k', v.titleId, hit); }
    if (v) {
      const cmd = steamMgr.vita3kCommand();
      return { emu: 'vita3k', emuName: 'Vita3K', pkgs: 1, kind: v.kind, titleIds: [v.titleId], needsZrif: v.kind === 'pkg' && !v.zrif, opens: false, installed: rec, cmd: cmd ? cmd.from || path.basename(cmd.exe) : null, running };
    }
    return { pkgs: 0, installed: rec, running };
  },
  'pkg:install': ({ romId, zrif }) => installPkg(romId, zrif),
  // the licence (.rap) for a game already installed in RPCS3 without one: found in its download or
  // in RomM, handed to RPCS3 under its right name
  'pkg:addLicence': async ({ romId }) => {
    const rec = installs[romId];
    if (rec?.emu !== 'rpcs3') throw new Error('This game isn’t installed in RPCS3 by Cartridge.');
    const need = installedLicences(rec);
    if (!need.length) return { ok: true };
    const cmd = steamMgr.rpcs3Command();
    if (!cmd) throw new Error('RPCS3 wasn’t found. Set it up in Settings → Emulators.');
    const tmp = path.join(os.tmpdir(), `cartridge-rap-${process.pid}-${Date.now()}`);
    try {
      const m = manifest[romId];
      const local = m?.path && !m.installedIn ? pkgInst.packagesIn(m.path).licences.filter((f) => /\.rap$/i.test(f)) : [];
      const named = (cid) => local.find((f) => path.basename(f).toUpperCase() === cid.toUpperCase() + '.RAP') || (need.length === 1 && local.length === 1 ? local[0] : null);
      const picked = Object.fromEntries(need.map((n) => [n.contentId, named(n.contentId)]).filter(([, f]) => f));
      Object.assign(picked, await rapsFromRomm(romId, need.filter((n) => !picked[n.contentId]), tmp));
      const lost = need.filter((n) => !picked[n.contentId]);
      if (lost.length) throw new Error(`RAP file not found: ${lost[0].contentId}.rap. Add it to this game in RomM, next to its .pkg.`);
      const files = pkgInst.stageLicences(need.map((n) => ({ contentId: n.contentId, from: 'picked', file: picked[n.contentId] })), path.join(tmp, 'staged'));
      await pkgInst.install({ cmd, hdds: rpcs3Hdds(), files, titleIds: [] });
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    if (installedLicences(rec).length) throw new Error('RPCS3 didn’t take the licence. Check it is the one for this game.');
    log('rpcs3 licence added', need.map((n) => n.contentId).join(' '));
    return { ok: true };
  },
  'pkg:cancel': () => { pkgRun?.ac.abort(); return true; },
  // after installing: the downloaded .pkg isn't needed to play. The game then lives in RPCS3.
  'pkg:dropDownload': async ({ romId }) => {
    const m = manifest[romId], rec = installs[romId];
    if (!m?.path || m.installedIn || !rec?.created) throw new Error('Cartridge didn’t install this game in an emulator.');
    const roots = new Set([config.romsRoot, ...extraRoots(), ...(library?.platforms || []).flatMap((pl) => platformDirs(pl))].filter(Boolean).map((x) => path.resolve(x)));
    if (roots.has(path.resolve(m.path))) throw new Error('Refusing to delete a whole console folder');
    await removeWithProgress(m.path, romId);
    manifest[romId] = { ...m, path: rec.dir, installedIn: rec.emu, download: m.path };
    saveManifest();
    installedMap[romId] = rec.dir;
    broadcast('installed-changed', { romId, path: rec.dir });
    return true;
  },
  // an emulator's own icon from where it's installed (0.9.16), served by token like trophy icons
  'emu:icon': async ({ id }) => {
    const { EMU } = require('./emulators');
    const base = String(id || '').split('@')[0].replace(/^ra:.*/, 'retroarch');
    const I = require('./emuIcons'), cacheDir = path.join(USER_DATA, 'emu-icons');
    let apps = []; try { apps = steamMgr.appImagesFor(EMU[base]?.for?.[0] || base, EMU[base]?.app || /^$/).filter((f) => !/_old|\.old|previous/i.test(path.basename(f))); } catch {}
    const f = I.iconFor(base, EMU[base], { appImages: apps, cacheDir, readAppImageFile: require('./detect').readAppImageFile }) || (await I.webIcon(base, cacheDir));
    return f ? require('./trophies').registerIcon(f) : '';
  },
  // Add-ons (0.9.15, checkable part): texture folders and their on/off, read from each emulator
  'addons:emulators': () => { const mine = loadJson(path.join(USER_DATA, 'texture-settings.json'), {}); return require('./addons').emulators().map((e) => ({ ...e, mine: !!mine[e.root] })); },
  'addons:gameIds': ({ romId }) => { let ids = {}; handlers['addons:forGame']({ romId, out: (x) => { ids = x; } }); return ids; },
  'addons:forGame': ({ romId, out }) => {
    const A = require('./addons'), rom = romIndexMain().get(Number(romId));
    if (!rom) return [];
    const slug = rom.platform_slug, ids = {};
    const where = installedMap[rom.id];
    let file = where && where !== MARKED ? where : '';
    try { if (file && fs.statSync(file).isDirectory()) file = fs.readdirSync(file).map((n) => path.join(file, n)).filter((f) => fs.statSync(f).isFile()).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0] || ''; } catch { file = ''; }
    if (slug === 'ps2') ids.serial = ps2PatchState(rom.id).serial || '';
    if (/\.(iso|gcm|rvz|wia|wbfs|ciso|gcz)$/i.test(file) && ['ngc', 'gamecube', 'wii'].includes(slug)) ids.gameId = A.gcWiiId(file);
    if (/\.(iso|cso|zso|chd)$/i.test(file) && slug === 'psp') { const b = patchesMod.isoFile(file, ['PSP_GAME', 'PARAM.SFO']); ids.gameId = b ? patchesMod.parseSfo(b).DISC_ID : null; }
    if (/\.pbp$/i.test(file) && slug === 'psp') ids.gameId = require('./discImage').pbpDiscId(file);
    if (/\.(3ds|cci)$/i.test(file)) ids.titleId = A.n3dsTitleId(file);
    if (/\.cia$/i.test(file)) ids.titleId = A.ciaTitleId(file);
    if (slug === 'psx' && /\.(bin|img|iso|cue|chd|pbp)$/i.test(file)) ids.serial = A.psxSerial(file);
    if (slug === 'switch') {
      const k = require('./bios').status('switch', { roots: emuRootsAll() });
      let id = A.switchTitleId(file, k?.ok ? [path.dirname(k.where)] : []);
      // 0.9.24 (owner: many IDs still unread): dumps are named with their title ID ([0100...]); a game's base ID
      // ends in 000, its update in 800, its DLC in 1xxx, so the base one is taken from any of them
      if (!id) {
        let names = [path.basename(where || ''), path.basename(file || '')];
        try { if (fs.statSync(where).isDirectory()) names = names.concat(fs.readdirSync(where)); } catch {}
        const all = names.map((n) => (/\b(01[0-9A-Fa-f]{14})\b/.exec(n) || [])[1]).filter(Boolean).map((x) => x.toUpperCase());
        const base = all[0];
        if (base) id = (BigInt('0x' + base) & ~0x1FFFn).toString(16).toUpperCase().padStart(16, '0'); // update (x800) and DLC (+0x1000) share the base's high bits
      }
      if (id) { ids.switchId = id; ids.switchIdLower = id.toLowerCase(); }
    }
    if (slug === 'switch') { const k = require('./bios').status('switch', { roots: emuRootsAll() }); const v = switchVersionOf(where && where !== MARKED ? where : '', k?.ok ? [path.dirname(k.where)] : []); if (v) { ids.version = v; if (!ids.switchId && v.titleId) { ids.switchId = v.titleId; ids.switchIdLower = v.titleId.toLowerCase(); } } }
    if (typeof out === 'function') out(ids);
    const R = require('./modRules');
    const list = A.forGame(slug, ids, A.emulators()).map((x) => { const r = R.RULES[R.kindOf(x.id)]; return r ? { ...x, rule: { what: r.what, needs: r.needs, on: r.on } } : x; }); // 0.9.52: what it takes, shown in the sheet
    // 0.9.38 (owner: mods for shadPS4): shadPS4 lays <game folder>-mods over the game (read only, above -UPDATE), so a
    // mod goes beside the game and never into it; the game folder is the one holding eboot.bin
    if (slug === 'ps4' && where && where !== MARKED) {
      let g = where;
      try { if (!fs.existsSync(path.join(g, 'eboot.bin'))) g = fs.readdirSync(where).map((n) => path.join(where, n)).find((d) => fs.existsSync(path.join(d, 'eboot.bin'))) || ''; } catch { g = ''; }
      if (g) list.push({ id: 'shadps4', name: 'shadPS4', on: true, mods: true, rule: (({ what, needs, on }) => ({ what, needs, on }))(R.RULES.shadps4), emuRoot: 'shadps4:' + g, root: path.dirname(g), folder: g + '-mods', has: fs.existsSync(g + '-mods'), game: g });
    }
    return list;
  },
  // custom textures on in the emulator (0.9.16); off only where Cartridge turned them on
  'addons:setTextures': ({ root, on }) => {
    const A = require('./addons'), e = A.emulators().find((x) => x.root === root);
    if (!e) throw new Error('That emulator wasn’t found.');
    const file = path.join(USER_DATA, 'texture-settings.json'), mine = loadJson(file, {});
    if (!on && !mine[root]) throw new Error(`Custom textures were turned on in ${e.name} itself: turn them off there.`);
    if (require('./raLogin').running().has(e.id)) throw new Error(`Close ${e.name} first: it saves its settings when it quits, over this change.`);
    A.setTextures(e, !!on);
    if (on) mine[root] = { id: e.id, at: Date.now() }; else delete mine[root];
    saveJson(file, mine);
    log('textures', e.id, on ? 'on' : 'off');
    return { ...e, on: !!on, mine: !!on };
  },
  // the game's texture folder, made empty so a pack can be dropped in (only inside that emulator's textures folder)
  'addons:makeFolder': ({ romId, emu }) => {
    const hit = handlers['addons:forGame']({ romId }).find((x) => x.id === emu);
    if (!hit?.folder || !path.resolve(hit.folder).startsWith(path.resolve(hit.root) + path.sep)) throw new Error('No folder for this game.');
    fs.mkdirSync(hit.folder, { recursive: true });
    return hit.folder;
  },
  // Add-on downloads (0.9.17): what can be installed for a game, from where, and what Cartridge put in
  // 0.9.52: every source is a provider of the mods engine (modEngine.js); sources lists the game's (EmuCoreX, GameBanana,
  // Nexus Mods, ROM hacks) and source picks one; the PS2 catalog and GameBanana keep their own path below, unchanged
  // as: a shorter name the game is known by on that site, picked from a suggestion (0.9.56, owner: "Nexus Mods has no
  // game called Bloodborne Game of the Year Edition, but it has Bloodborne"); mods still install by this game's rules
  'addons:available': async ({ romId, sort = 'downloads', source = '', as = '' }) => {
    const rom = romIndexMain().get(Number(romId));
    if (!rom) return { emus: [], packs: [], installed: [] };
    const emus = handlers['addons:forGame']({ romId });
    const installed = Object.entries(addonRecs()).filter(([, r]) => r.romId === rom.id).map(([key, r]) => ({ key, ...r, files: undefined, count: r.files.length }));
    const out = { emus, installed, packs: [], source: null, error: '', featured: [], sources: modsEng().sourcesFor({ ...modGame(rom), mods: emus.some((e) => require('./modRules').takesMods(e.id)) }) };
    if (source === 'nexus' || source === 'rh') {
      if (source === 'nexus' && !emus.some((e) => require('./modRules').takesMods(e.id))) return { ...out, source, error: 'None of the emulators for this console on this device take mods Cartridge knows how to install.' };
      const r = await modsEng().list(source, { ...modGame(rom), as: as || '' }, { sort });
      return { ...out, source, packs: r.items, error: r.error || '', suggest: r.suggest || null, as: as || '', modGame: r.game || null, hackMode: source === 'rh' ? hackModes(rom) : null };
    }
    // 0.9.23: hand-picked texture packs from their creators' pages (Dolphin by game ID)
    // featured texture packs: GameCube by game ID, and HenrikoMagnifico's GameCube, Wii and 3DS packs by ID or name (0.9.24)
    try {
      if (/^(ngc|gamecube|gc|wii|n3ds|3ds)$/i.test(rom.platform_slug)) {
        const S = require('./addonSources');
        const gid = /^(ngc|gamecube|gc|wii)$/i.test(rom.platform_slug) ? handlers['addons:gameIds']({ romId }).gameId : '';
        const live = await S.henrikoCatalog({ cacheFile: path.join(USER_DATA, 'addons-henriko.json') }).catch(() => []);
        out.featured = S.featuredFor({ gameId: gid, name: rom.name, slug: rom.platform_slug }, live);
      }
    } catch {}
    try { if (rom.platform_slug === 'switch') out.version = handlers['addons:gameIds']({ romId }).version || null; } catch {}
    const S = require('./addonSources');
    try {
      if (rom.platform_slug === 'ps2') {
        out.source = 'ps2';
        const serial = emus.some((e) => e.id === 'pcsx2') ? ps2PatchState(rom.id).serial : '';
        if (!emus.some((e) => e.id === 'pcsx2')) out.error = 'PCSX2’s settings weren’t found on this device. Open PCSX2 once, then come back.';
        else if (!serial) out.error = 'Cartridge couldn’t read this game’s serial, which the packs are matched by.';
        else out.packs = S.ps2For(await S.ps2Catalog({ cacheFile: path.join(USER_DATA, 'addons-ps2-catalog.json') }), serial).map((p) => ({ ...p, serial }));
        // 0.9.18: GameBanana's PS2 texture packs and mods too, after the catalog's (put in the same folder)
        if (serial) { try { const g = await S.gbGame(rom.name); if (g) { out.gbGame = g; out.packs.push(...(await S.gbMods(g.id, { sort }))); } } catch {} }
      } else if (emus.length) {
        out.source = 'gb';
        const g = await S.gbGame(as || rom.name);
        out.as = as || '';
        if (!g) {
          out.error = `GameBanana has no game called “${as || rom.name}”.`;
          if (!as) for (const n of S.shorterTitles(rom.name)) { const h = await S.gbGame(n).catch(() => null); if (h) { out.suggest = { as: n, name: h.name }; break; } }
        } else { out.gbGame = g; out.packs = await S.gbMods(g.id, { sort }); }
      }
    } catch (e) { out.error = e.message; }
    return out;
  },
  'addons:gbFiles': ({ modId }) => require('./addonSources').gbFiles(modId),
  // one add-on in full from any source (0.9.52): files, text, pictures (AddonDetail)
  'addons:detail': ({ source, item }) => modsEng().detail(source, item),
  // the Nexus Mods key in Settings: who it belongs to and whether downloads are one press (Premium)
  'nexus:check': async ({ key }) => { const k = String(key || '').trim(); if (!k) return null; return modsEng().get('nexus').account(k); },
  // ROM hacks (0.9.52): the hack's download read for its patches (IPS, UPS, BPS; xdelta and PPF named but not applied)
  'hacks:prepare': async ({ romId, item }) => {
    const rom = romIndexMain().get(Number(romId));
    if (!rom) throw new Error('That game isn’t in the library.');
    const d = await modsEng().detail('rh', item);
    const f = d.files[0];
    if (!f) throw new Error('Romhacking.net has no download for this hack.');
    const buf = await webEng().buffer(f.url, { headers: { Accept: '*/*' }, timeout: 120000 });
    const P = require('./romPatch'), patches = [];
    const isZip = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
    const take = (name, data) => { const kind = P.kindOf(name, data); if (kind) patches.push({ name, kind, supported: P.SOFT.has(kind), size: data.length, data }); };
    if (isZip) {
      await new Promise((ok, bad) => require('yauzl').fromBuffer(buf, { lazyEntries: true }, (e, z) => {
        if (e) return bad(new Error('The hack’s download couldn’t be opened.'));
        z.on('entry', (en) => {
          if (/\/$/.test(en.fileName) || !/\.(ips|ups|bps|xdelta|vcdiff|ppf|aps)$/i.test(en.fileName) || en.uncompressedSize > 256 << 20) return z.readEntry();
          z.openReadStream(en, (er, st) => { if (er) return z.readEntry(); const parts = []; st.on('data', (c) => parts.push(c)); st.on('end', () => { take(en.fileName, Buffer.concat(parts)); z.readEntry(); }); });
        });
        z.on('end', ok); z.on('error', bad); z.readEntry();
      }));
    } else take(f.name.replace(/\.zip$/i, ''), buf);
    if (!patches.length) throw new Error('No patch file was found in this hack’s download.');
    const id = `rh-${item.id}-${Date.now()}`;
    hackCache.set(id, { item, patches, at: Date.now() });
    for (const [k, v] of hackCache) if (Date.now() - v.at > 30 * 60e3) hackCache.delete(k);
    return { id, romInfo: d.romInfo || '', modes: hackModes(rom), patches: patches.map(({ name, kind, supported, size }, i) => ({ i, name, kind, supported, size })) };
  },
  // use one patch: 'soft' puts it beside the game for RetroArch (the game file is never written), 'copy' writes a
  // patched copy beside the original (never over a file). Both are recorded like add-ons, so Delete removes them.
  'hacks:apply': async ({ romId, id, index = 0, mode }) => {
    const rom = romIndexMain().get(Number(romId)), prep = hackCache.get(id);
    if (!rom || !prep) throw new Error('Open the hack again: its download expired.');
    const pt = prep.patches[index], P = require('./romPatch');
    if (!pt?.supported) throw new Error(`${P.KIND[pt?.kind] || 'This'} patches need a separate tool; Cartridge uses IPS, UPS and BPS.`);
    let file = installedMap[rom.id];
    if (!file || file === MARKED) throw new Error('Download the game first: the hack is applied to your copy.');
    if (fs.statSync(file).isDirectory()) throw new Error('This game is a folder; ROM hacks are for single-file games.');
    const dir = path.dirname(file), recs = addonRecs(), key = `rh:${prep.item.id}:${rom.id}:${mode}`;
    if (recs[key]) throw new Error('This hack is already in use for this game.');
    let made;
    if (mode === 'soft') {
      if (!hackModes(rom).retroarch) throw new Error('Only RetroArch patches games as it loads them. Make a patched copy instead.');
      made = P.softName(file, pt.kind);
      // one hack at a time: RetroArch reads the patch named like the game
      if (fs.existsSync(made)) throw new Error('A patch for this game is already beside it. Delete it first (Installed above).');
      fs.writeFileSync(made, pt.data, { flag: 'wx' });
    } else {
      let rom0 = null, ext = path.extname(file);
      if (/\.zip$/i.test(file)) { // the ROM inside a zip: its biggest file
        rom0 = await new Promise((ok, bad) => require('yauzl').open(file, { lazyEntries: true }, (e, z) => { if (e) return bad(e); let best = null; z.on('entry', (en) => { if (!/\/$/.test(en.fileName) && (!best || en.uncompressedSize > best.uncompressedSize)) best = en; z.readEntry(); }); z.on('end', () => { if (!best) return bad(new Error('The game’s zip is empty.')); ext = path.extname(best.fileName); z.openReadStream(best, (er, st) => { if (er) return bad(er); const parts = []; st.on('data', (c) => parts.push(c)); st.on('end', () => ok(Buffer.concat(parts))); }); }); z.readEntry(); }));
      } else rom0 = fs.readFileSync(file);
      const out = P.apply(rom0, pt.data, pt.name);
      const label = String(prep.item.name || 'Hack').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80);
      made = path.join(dir, `${path.basename(file).replace(/\.[^.]+$/, '')} [${label}]${ext}`);
      fs.writeFileSync(made, out, { flag: 'wx' });
    }
    recs[key] = { source: 'rh', id: prep.item.id, name: prep.item.name, category: 'ROM Hack', romId: rom.id, game: rom.name, emu: mode === 'soft' ? 'retroarch' : 'copy', emuName: mode === 'soft' ? 'RetroArch' : 'Patched copy', emuRoot: dir, dest: dir, alt: {}, files: [path.basename(made)], bytes: fs.statSync(made).size, at: Date.now(), from: prep.item.url, mode };
    saveJson(ADDONS_FILE, recs);
    log('rom hack', mode, prep.item.id, 'for', rom.id);
    return { file: made, mode };
  },
  'addons:gbMod': ({ modId }) => require('./addonSources').gbMod(modId),
  // { romId, emuRoot (the emulator copy), pack (from addons:available), file (GameBanana only) }
  'addons:install': async ({ romId, emuRoot, pack, file }) => {
    if (addonRun) throw new Error('Another add-on is being installed. Wait for it to finish.');
    const rom = romIndexMain().get(Number(romId));
    const e = handlers['addons:forGame']({ romId }).find((x) => x.emuRoot === emuRoot);
    if (!rom || !e) throw new Error('That emulator wasn’t found.');
    if (!e.folder) throw new Error(`Cartridge couldn’t read this game’s ID, so it doesn’t know which ${e.name} folder it goes in.`);
    if (require('./raLogin').running().has(e.id)) throw new Error(`Close ${e.name} first.`);
    // 0.9.52: Nexus Mods gives Premium members the file; for anyone else its page opens in Cartridge's window, where
    // the download (after Nexus's own sign-in) is caught and installed like any other (addons:browse)
    if (pack.source === 'nexus') {
      const d = await modsEng().download('nexus', pack, file);
      if (d.page) { handlers['addons:browse']({ url: d.page, romId, emuRoot, kind: 'mods', name: pack.name }); return { page: true }; }
      file = { ...file, url: d.url };
    }
    // each emulator's own layout (addonInstall.plan, 0.9.18); PCSX2 and DuckStation: the game folder is
    // textures/<SERIAL>, the pack brings replacements/ (e.folder ends in it)
    const kind = require('./emuProfiles').modKind(e.id, pack.source); // 0.9.48: the emulator's profile says how its add-ons are laid out
    if (kind === 'plain') throw new Error(require('./modRules').refusal(null)); // 0.9.52: no rule, nothing unpacked anywhere
    const dest = /\/replacements$/.test(e.folder) ? path.dirname(e.folder) : e.folder;
    const key = `${pack.source}:${pack.id}${file ? ':' + file.id : ''}:${rom.id}:${e.emuRoot}`;
    if (addonRecs()[key]) throw new Error('This add-on is already installed.');
    const dir = path.join(USER_DATA, 'addon-downloads'), base = path.join(dir, String(key).replace(/[^\w.-]+/g, '_'));
    // 0.9.23: a pack you downloaded yourself (any site) installs from its file, the same way
    const local = pack.source === 'local';
    if (local && !(pack.file && fs.existsSync(pack.file) && /\.(zip|7z|rar)$/i.test(pack.file))) throw new Error('Pick a .zip, .7z or .rar file.');
    // the emulator's other folders a mod may need: PCSX2's patches, Dolphin's GraphicMods (beside Textures)
    const alt = { patches: e.id === 'pcsx2' ? path.join(e.emuRoot, 'patches') : null, graphicmods: e.id === 'dolphin' ? path.join(path.dirname(e.root), 'GraphicMods') : null,
      // Azahar/Citra mods (0.9.37): load/mods/<title ID>, beside load/textures
      mods3ds: /^(azahar|citra)$/.test(e.id) && e.folder ? path.join(path.dirname(path.dirname(e.folder)), 'mods', path.basename(e.folder)) : null };
    const urls = local ? [] : pack.source === 'ps2' ? (pack.parts ? pack.parts.map((x) => ({ ...x })) : [{ url: pack.url, size: pack.size, sha256: pack.sha256 }]) : [{ url: file.url, size: file.size, md5: file.md5 }];
    const total = urls.reduce((s, u) => s + (u.size || 0), 0);
    const free = await fsp.statfs(fs.existsSync(dest) ? dest : e.root).then((st) => st.bavail * st.bsize).catch(() => Infinity);
    if (total * 2 > free) throw new Error(`Not enough space: this add-on needs about ${Math.ceil((total * 2) / 1e9)} GB while it installs.`);
    addonRun = { key, abort: new AbortController() };
    const send = (o) => broadcast('addon-progress', { romId: rom.id, key, name: pack.name, game: rom.name, emu: e.name, ...o }); // also listed on the Downloads page (0.9.24)
    const A = require('./addonInstall');
    let got = 0, last = 0;
    const files = [];
    try {
      for (const [i, u] of urls.entries()) {
        const f = urls.length > 1 ? `${base}.part${i + 1}` : base + (pack.source === 'ps2' ? '.zip' : path.extname(file.name || '.zip'));
        await downloadTo(u.url, f, addonRun, (n) => { got += n; const now = Date.now(); if (now - last > 400) { last = now; send({ state: 'download', pct: total ? Math.min(99, Math.floor((got / total) * 100)) : null, got, total }); } }, { plain: true });
        if (u.sha256 && (await A.sha256(f)) !== u.sha256) throw new Error('The download is damaged (its checksum doesn’t match). Try again.');
        if (u.md5 && (await A.sha256(f, 'md5')) !== u.md5) throw new Error('The download is damaged (its checksum doesn’t match). Try again.');
        files.push(f);
      }
      let archive = local ? pack.file : files[0];
      if (files.length > 1) { archive = base + '.zip'; send({ state: 'join' }); await A.join(files, archive); if ((await A.sha256(archive)) !== pack.sha256) throw new Error('The joined download is damaged. Try again.'); }
      send({ state: 'install', pct: 0 });
      const r = await A.install(archive, dest, kind, { id: kind === 'switch' ? '' : path.basename(dest), name: pack.name, tops: e.game ? fs.readdirSync(e.game) : [], alt, tmpBase: base, signal: addonRun.abort.signal, onFile: (n, of) => { const now = Date.now(); if (now - last > 400) { last = now; send({ state: 'install', pct: Math.floor((n / of) * 100) }); } } });
      const recs = addonRecs();
      recs[key] = { source: pack.source, id: pack.id, fileId: file?.id || null, name: pack.name, category: pack.category || (local && pack.kind === 'tex' ? 'Textures' : ''), romId: rom.id, game: rom.name, emu: e.id, emuName: e.name, emuRoot: e.emuRoot, dest, alt, files: r.files, bytes: r.bytes, at: Date.now(), from: pack.sourceUrl || pack.url || (local ? pack.file : '') };
      saveJson(ADDONS_FILE, recs);
      log('add-on installed', key, r.files.length, 'files');
      send({ state: 'done' });
      // 0.9.23 (owner: Cartridge sets it up itself): a texture pack needs the emulator's custom textures
      // on; Cartridge turns them on (and remembers it did, so it alone may turn them off again)
      const isTex = kind !== 'switch' && kind !== 'cemu' && !r.files.every((f) => f.startsWith('@'));
      let autoOn = false;
      if (isTex && e.on === false && require('./addons').TEX_KEY[e.id]) { try { handlers['addons:setTextures']({ root: e.emuRoot, on: true }); autoOn = true; } catch (er) { log('textures not turned on:', er.message); } }
      return { key, files: r.files.length, bytes: r.bytes, textures: isTex && e.on === false && !autoOn, autoOn, patches: r.files.some((f) => f.startsWith('@patches/')), graphicMods: r.files.some((f) => f.startsWith('@graphicmods/')) };
    } catch (err) { send({ state: 'error', error: err.message }); throw err; }
    finally { addonRun = null; for (const f of [...files, base + '.zip']) fs.rmSync(f, { force: true }); fs.rmSync(base + '.zip.unpacked', { recursive: true, force: true }); fs.rmSync(base + '.unpacked', { recursive: true, force: true }); }
  },
  'addons:cancel': () => { addonRun?.abort.abort(); return true; },
  // 0.9.32 (owner: a download clicked on a mod's website did nothing): the page opens in a Cartridge
  // window; a .zip/.7z/.rar it downloads is caught, shown in Downloads, then installed for this game
  // the same way as Install a Download. The file is deleted after it installs.
  'addons:browse': ({ url, romId, emuRoot, kind, name }) => {
    if (!/^https:\/\//i.test(String(url || ''))) throw new Error('That page can’t be opened.');
    if (addonBrowser && !addonBrowser.isDestroyed()) addonBrowser.close();
    const { session } = require('electron');
    const ses = session.fromPartition('persist:addons');
    const bw = new BrowserWindow({ parent: win, width: 1280, height: 800, fullscreen: !!win?.isFullScreen(), autoHideMenuBar: true, backgroundColor: '#111', title: name || 'Add-on', webPreferences: { session: ses, sandbox: true, contextIsolation: true } });
    addonBrowser = bw;
    bw.ctx = { romId, emuRoot, kind: kind || 'tex', name };
    // links that open a new tab stay in this window; Escape or the floating button closes it
    bw.webContents.setWindowOpenHandler(({ url: u }) => { if (/^https?:\/\//i.test(u)) bw.loadURL(u); return { action: 'deny' }; });
    bw.webContents.on('before-input-event', (_e, i) => { if (i.type === 'keyDown' && i.key === 'Escape') bw.close(); });
    bw.webContents.on('did-finish-load', () => bw.webContents.executeJavaScript(`(() => { if (document.getElementById('cart-back')) return; const b = document.createElement('button'); b.id = 'cart-back'; b.textContent = 'Back to Cartridge'; b.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;padding:12px 20px;border-radius:999px;border:0;background:#fff;color:#111;font:600 16px system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.4);cursor:pointer'; b.onclick = () => window.close(); document.body.appendChild(b); })()`).catch(() => {}));
    if (!ses.cartridgeHooked) {
      ses.cartridgeHooked = true;
      ses.on('will-download', (_e, item) => {
        const ctx = addonBrowser && !addonBrowser.isDestroyed() ? addonBrowser.ctx : null;
        const fname = item.getFilename() || 'addon.zip';
        if (!ctx || !/\.(zip|7z|rar)$/i.test(fname)) { item.cancel(); broadcast('toast', { text: ctx ? 'Cartridge installs .zip, .7z and .rar add-ons only.' : 'Open the page from the game’s Add-ons to install from it.', kind: 'error' }); return; }
        const dir = path.join(USER_DATA, 'addon-downloads'); fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `web-${Date.now()}-${fname.replace(/[^\w.-]+/g, '_')}`);
        item.setSavePath(file);
        const key = 'web:' + file;
        bgJob(key, { key, state: 'run', kind: 'Add-on Download', title: fname, romId: Number(ctx.romId), icon: 'mdiDownload', pct: null, text: '' });
        broadcast('toast', { text: `Downloading ${fname}: it installs by itself when it’s done`, kind: 'info', icon: 'mdiDownload' });
        // 0.9.37 (owner: "it didn't take me back, so I downloaded it four times"): the page closes at once and
        // Cartridge opens Downloads, where the file shows downloading and then installing (the download carries on)
        setTimeout(() => { try { if (addonBrowser && !addonBrowser.isDestroyed()) addonBrowser.close(); } catch {} broadcast('nav', { tab: 'downloads', closeModal: true }); }, 150);
        item.on('updated', () => { const t = item.getTotalBytes(); bgJob(key, { pct: t ? Math.floor((item.getReceivedBytes() / t) * 100) : null }); });
        item.once('done', async (_ev, state) => {
          if (state !== 'completed') { bgJob(key, { state: 'error', error: state === 'cancelled' ? 'Cancelled.' : 'The download stopped.' }); fs.rmSync(file, { force: true }); return; }
          bgJob(key, { state: 'done', pct: 100 });
          const base = fname.replace(/\.(zip|7z|rar)$/i, '');
          try {
            const r = await handlers['addons:install']({ romId: ctx.romId, emuRoot: ctx.emuRoot, pack: { source: 'local', id: `${base}-${Date.now()}`, name: base, file, kind: ctx.kind, authors: [], sourceUrl: item.getURL() } });
            broadcast('toast', { text: `${base} is installed`, kind: 'ok', icon: 'mdiCheck' }); broadcast('addon-installed', { romId: Number(ctx.romId), name: base, ...r });
          } catch (er) { broadcast('toast', { text: er.message || String(er), kind: 'error' }); }
          finally { fs.rmSync(file, { force: true }); }
        });
      });
    }
    bw.loadURL(url);
    bw.on('closed', () => { if (addonBrowser === bw) addonBrowser = null; refocus(); });
    return true;
  },
  // 0.9.19 (owner: a green check when a game already has a texture pack, and whether Cartridge put it
  // there): for each game asked about, the emulators whose folder for it holds files, and whether
  // those files are all ones Cartridge installed
  'addons:present': async ({ romIds = [] } = {}) => {
    const recs = Object.values(addonRecs()), out = {};
    const count = (d, cap = 200) => { let n = 0; const walk = (x, depth) => { for (const e of (() => { try { return fs.readdirSync(x, { withFileTypes: true }); } catch { return []; } })()) { if (n >= cap) return; if (e.isDirectory()) { if (depth < 6) walk(path.join(x, e.name), depth + 1); } else n++; } }; walk(d, 0); return n; };
    for (const id of romIds.slice(0, 400)) {
      let emus = []; try { emus = handlers['addons:forGame']({ romId: id }); } catch {}
      const found = [];
      for (const e of emus) {
        if (!e.folder || path.resolve(e.folder) === path.resolve(e.root) || !e.has) continue; // Cemu's shared graphicPacks folder isn't one game's
        const files = e.has ? count(e.folder) : 0;
        if (!files) continue;
        const mine = recs.filter((r) => r.romId === Number(id) && r.emuRoot === e.emuRoot).reduce((n, r) => n + r.files.length, 0);
        found.push({ emu: e.id, name: e.name, files, by: mine >= files ? 'cartridge' : mine ? 'both' : 'other', on: e.on, mods: e.mods });
      }
      if (found.length) out[id] = found;
      await new Promise((r) => setImmediate(r)); // a long list never holds up the window
    }
    return out;
  },
  // Delete what's in a game's add-on folder (0.9.37, owner: delete installed mods and texture packs), Cartridge's
  // or not: the game's own folder (never the emulator's shared one) goes to the Trash, so it can be put back
  'addons:clear': async ({ romId, emu }) => {
    const e = (handlers['addons:forGame']({ romId }) || []).find((x) => x.id === emu);
    if (!e?.folder || !e.has) throw new Error('There’s nothing in its folder.');
    if (path.resolve(e.folder) === path.resolve(e.root) || path.resolve(e.folder) === path.resolve(e.emuRoot || '/')) throw new Error('That folder is shared by every game, so it’s left as it is.');
    if (require('./raLogin').running().has(e.id)) throw new Error(`Close ${e.name} first.`);
    await toTrash(e.folder);
    const recs = addonRecs(); for (const [k, r] of Object.entries(recs)) if (r.romId === Number(romId) && r.emuRoot === e.emuRoot) delete recs[k];
    saveJson(ADDONS_FILE, recs);
    log('add-on folder to Trash', e.folder);
    return { folder: e.folder };
  },
  'addons:installed': () => Object.entries(addonRecs()).map(([key, r]) => ({ key, ...r, files: undefined, count: r.files.length })),
  'addons:remove': async ({ key }) => {
    const recs = addonRecs(), r = recs[key];
    if (!r) throw new Error('Cartridge didn’t install that add-on.');
    if (require('./raLogin').running().has(r.emu)) throw new Error(`Close ${r.emuName} first.`);
    await require('./addonInstall').removeFiles(r.dest, r.files, r.alt || {});
    delete recs[key]; saveJson(ADDONS_FILE, recs);
    log('add-on removed', key);
    return true;
  },
  // Pick your own emulators (0.9.17): by console, what's here, and a download for what isn't
  'emuget:list': () => {
    const G = require('./emuGet'), have = steamMgr.installedEmulators();
    const isHere = (e, key) => {
      if (e.id === 'retroarch') return ['snes', 'psx', 'genesis'].some((k) => (steamMgr.candidatesFor(k) || []).some((c) => /^ra:/.test(c.id)));
      if (have.some((x) => x.id === e.id)) return true;
      const ck = { retro: 'snes', gc: 'gc' }[key] || key;
      return (steamMgr.candidatesFor(ck) || []).some((c) => c.id.split('@')[0] === e.id);
    };
    return G.CATALOG.map((c) => ({ key: c.key, name: c.name, emus: c.emus.map((e) => ({ id: e.id, label: require('./emulators').EMU[e.id]?.label || { retroarch: 'RetroArch', supermodel: 'Supermodel' }[e.id] || e.id, how: e.how, from: e.how === 'flatpak' ? 'Flatpak from Flathub' : `${e.binary || e.dirBuild ? 'Linux build' : 'AppImage'} from ${e.repo.split('/')[0]}${e.fp ? ', else its Flatpak' : ''}`, installed: isHere(e, c.key) })) }));
  },
  // where emulators live (0.9.17): this device and every mounted drive, with free space
  'emuget:drives': async () => {
    const u = os.userInfo().username, out = [{ path: os.homedir(), label: 'This device', internal: true }];
    for (const b of [`/run/media/${u}`, '/run/media', '/media', `/media/${u}`, '/mnt']) for (const n of (() => { try { return fs.readdirSync(b); } catch { return []; } })()) {
      const d = path.join(b, n);
      if (!isDir(d) || n === u || out.some((x) => x.path === d)) continue;
      try { fs.accessSync(d, fs.constants.W_OK); } catch { continue; }
      out.push({ path: d, label: n, internal: false });
    }
    for (const d of out) { try { const st = await fsp.statfs(d.path); d.free = st.bavail * st.bsize; d.total = st.blocks * st.bsize; } catch {} d.emulation = isDir(path.join(d.path, 'Emulation')); }
    return out;
  },
  // EmuDeck already set up (0.9.24, owner: then don't ask for a drive, install beside EmuDeck's): its Emulation
  // folder for games and BIOS, and ~/Applications for AppImages, where EmuDeck keeps its own
  'emuget:emudeck': () => { const e = readEmuDeckSettings(); return e.emulationPath && isDir(e.emulationPath) ? { root: e.emulationPath, roms: e.romsPath || path.join(e.emulationPath, 'roms'), bios: e.biosPath || path.join(e.emulationPath, 'bios'), apps: path.join(os.homedir(), 'Applications') } : null; },
  'emuget:useEmuDeck': () => {
    const e = handlers['emuget:emudeck'](); if (!e) throw new Error('EmuDeck’s setup wasn’t found.');
    config.romsRoot ||= e.roms; config.biosPath ||= e.bios; config.emuDir = e.apps; config.emulationFresh = false;
    saveConfig(); require('./emuGet').setAppsDir(config.emuDir);
    if (library) { broadcast('library', publicLibrary()); computeInstalled(); }
    return e;
  },
  // Cartridge Installer (0.9.24, owner: the folders and links only for a fresh setup, so nothing already
  // set up is touched): fresh = no EmuDeck, no RetroDECK and no emulator found on this device
  'emuget:fresh': () => {
    const h = os.homedir(), ex = (p) => fs.existsSync(path.join(h, p));
    const emudeck = ex('.config/EmuDeck/settings.sh') || ex('emudeck'), retrodeck = ex('.var/app/net.retrodeck.retrodeck') || ex('retrodeck');
    // anything installed counts: programs found by the scan, and the installer's own list (launcher scripts, Flatpaks)
    let emulators = 0; try { emulators = steamMgr.installedEmulators().length; } catch {}
    try { emulators += handlers['emuget:list']().reduce((n, c) => n + c.emus.filter((e) => e.installed).length, 0); } catch {}
    // the Emulation folder the installer made earlier is Cartridge's own setup: later installs carry on with it
    const own = !!(config.emulationFresh && config.emulationRoot && isDir(config.emulationRoot));
    return { fresh: own || (!emudeck && !retrodeck && !emulators), own, emudeck, retrodeck, emulators };
  },
  // not fresh: new emulators only, next to the ones there (~/Applications), no folders or links made
  'emuget:useExisting': () => { config.emuDir ||= path.join(os.homedir(), 'Applications'); config.emulationFresh = false; saveConfig(); require('./emuGet').setAppsDir(config.emuDir); return { emuDir: config.emuDir }; },
  // an ES-DE style Emulation folder there: roms/<console>, bios, saves, storage (fresh setups only)
  'emuget:prepare': ({ base }) => {
    if (!base || !isDir(base)) throw new Error('That drive isn’t there.');
    if (!handlers['emuget:fresh']().fresh) throw new Error('Emulators are already set up on this device, so Cartridge leaves their folders as they are.');
    if (isDir(path.join(base, 'Emulation')) && path.join(base, 'Emulation') !== config.emulationRoot) throw new Error('That drive already has an Emulation folder. Cartridge leaves it as it is.');
    const root = path.join(base, 'Emulation'), G = require('./emuGet');
    // 0.9.24 (Cartridge Installer, owner: like EmuDeck): saves and storage beside roms and bios, AppImages in
    // ~/Applications where EmuDeck keeps them (on any drive the Emulation folder is on)
    for (const d of [...G.ESDE.map((c) => path.join(root, 'roms', c)), path.join(root, 'bios'), path.join(root, 'saves'), path.join(root, 'storage')]) fs.mkdirSync(d, { recursive: true });
    config.romsRoot = path.join(root, 'roms'); config.biosPath ||= path.join(root, 'bios'); config.emuDir = path.join(os.homedir(), 'Applications'); config.emulationRoot = root; config.emulationFresh = true;
    saveConfig(); G.setAppsDir(config.emuDir);
    if (library) { broadcast('library', publicLibrary()); computeInstalled(); }
    log('emulation folder made', root);
    return { root, romsRoot: config.romsRoot, biosPath: config.biosPath, emuDir: config.emuDir };
  },
  // background queue: Download all, or one at a time, while the page stays usable
  'emuget:queue': ({ items, password } = {}) => { if (password != null) { flatpakPass = String(password); flatpakFailed = ''; } for (const it of items || []) if (!emuGetQ.some((q) => q.key === it.key && q.id === it.id && /wait|run/.test(q.state))) emuGetQ.push({ key: it.key, id: it.id, state: 'wait', pct: null }); pumpEmuGet(); return emuGetQ; },
  'emuget:state': () => emuGetQ,
  // is Flatpak here, and if not, can Cartridge install it (0.9.37)
  'emuget:flatpak': () => { const G = require('./emuGet'); if (G.hasFlatpak()) return { has: true }; const p = G.flatpakPlan(); return { has: false, can: !!p?.cmd, why: p?.why || '' }; },
  'emuget:install': async ({ key, id }) => {
    if (emuGetRun) throw new Error('Another emulator is downloading. Wait for it to finish.');
    const G = require('./emuGet');
    G.setAppsDir(config.emuDir);
    const e = G.CATALOG.find((c) => c.key === key)?.emus.find((x) => x.id === id);
    if (!e) throw new Error('That emulator isn’t in the list.');
    emuGetRun = { abort: new AbortController() };
    const send = (o) => { broadcast('emuget-progress', { key, id, ...o }); for (const f of emuGetListeners) f({ key, id, ...o }); };
    try {
      let r;
      if (e.how === 'flatpak') r = await G.getFlatpak(e.fp, (pct) => send({ pct }));
      else {
        let got = 0, total = 0, last = 0;
        try { r = await G.getAppImage(e, (url, dest, size) => { got = 0; total = size || 0; return downloadTo(url, dest, emuGetRun, (n) => { got += n; const now = Date.now(); if (now - last > 400) { last = now; send({ pct: total ? Math.min(99, Math.floor((got / total) * 100)) : null }); } }, { plain: true }); }); }
        catch (err) {
          // 0.9.19: no AppImage to be had (its server refused, or the release has none): its Flatpak instead
          if (!e.fp || emuGetRun.abort.signal.aborted || !G.hasFlatpak()) throw err;
          log('emulator AppImage failed, trying Flatpak', id, err.message);
          r = await G.getFlatpak(e.fp, (pct) => send({ pct }));
        }
      }
      log('emulator downloaded', id, r.path || r.fp, r.fellBack ? `(the newest can't start here: ${r.fellBack.reason || 'glibc'}; ${r.version})` : '');
      if (r.fellBack) { config.emuGlibcHold = { ...(config.emuGlibcHold || {}), [id]: { t: Date.now(), have: require('./detect').systemGlibc() } }; saveConfig(); r.note ||= `The newest build can’t start on this system, so ${r.version} went in instead`; }
      // 0.9.37 (owner: fix the shadPS4 install): the Qt launcher comes with no shadPS4 in it, so games had nothing
      // to start with; the newest release goes in beside it as the launcher's default, as its own Versions does
      if (id === 'shadps4') { try { send({ pct: 99, text: 'Adding shadPS4 itself' }); r.shadVersion = await shadDefaultVersion(); } catch (e2) { log('shadPS4 version after install', e2.message); r.note = `shadPS4’s launcher is in, but its newest version couldn’t be added (${e2.message}). Add one in Versions.`; } }
      send({ pct: 100, done: true });
      // its saves and storage linked into the Emulation folder (esdeLinks.js: links only, nothing moved)
      if (config.emulationFresh && config.emulationRoot && isDir(config.emulationRoot)) { try { r.links = require('./esdeLinks').make(id, { root: config.emulationRoot, home: os.homedir(), kind: r.fp ? 'flatpak' : 'appimage' }); } catch {} }
      // 0.9.24 (owner: deleted and installed again, it should say where and fix its launch options): scan,
      // then point every Steam shortcut whose emulator went missing at the new copy
      r.relinked = 0;
      try {
        await steamMgr.scanEmulators();
        const moved = (steamMgr.health().problems || []).filter((p) => p.issues.some((x) => x.kind === 'emulator' && x.fix));
        if (moved.length) { const f = await steamMgr.healthFix(moved.map((p) => p.appid)); r.relinked = (f.fixed || 0) + (f.queued || 0); log('relinked after install', id, r.relinked); }
      } catch (e2) { log('relink after install', e2.message); }
      // its BIOS or firmware, if it's in the BIOS folder, goes in now (0.9.37)
      biosSetup({ install: true }).then((b) => { const done = b.list.filter((x) => x.copied || x.installed); if (done.length) broadcast('toast', { text: `BIOS and firmware put in place: ${done.map((x) => x.label).join(', ')}`, kind: 'ok', icon: 'mdiChip' }); }).catch((e) => log('bios setup after install:', e.message));
      return r;
    } catch (err) { send({ error: err.message }); throw err; }
    finally { emuGetRun = null; }
  },
  // From a GitHub link (0.9.24): the project's newest Linux AppImage into the emulators folder, then set
  // up as a fork of an emulator Cartridge knows, or for a console. Recorded in config.customEmus.
  'emuget:custom': async ({ link, as, of, key }) => {
    const C = require('./customEmu'), repo = C.repoOf(link);
    if (!repo) throw new Error('That isn’t a GitHub project link. It looks like github.com/owner/project.');
    if (as === 'fork' && !require('./emulators').EMU[of]) throw new Error('Pick the emulator it’s a fork of.');
    if (as === 'console' && !key) throw new Error('Pick the console it’s for.');
    if (emuGetRun) throw new Error('Another emulator is downloading. Wait for it to finish.');
    const rel = await require('./github').release(repo).catch((e) => { throw new Error(`GitHub: ${e.message}`); });
    if (!rel) throw new Error('That project has no releases on GitHub.');
    const asset = C.pickAsset(rel.assets), archive = !asset && C.pickArchive(rel.assets);
    if (!asset && !archive) throw new Error('Its newest release has no Linux AppImage or Linux archive to install.');
    const dir = config.emuDir || path.join(os.homedir(), 'Applications');
    const prev = (config.customEmus || []).find((x) => x.repo === repo);
    // an AppImage goes in as one file; an archive (0.9.32, owner: GR2 fork as a Linux .zip) unpacks into its own folder there
    const dest = asset ? path.join(dir, C.fileName(repo, asset)) : path.join(dir, repo.split('/')[1].replace(/[^\w.-]+/g, ''));
    const mine = (config.customEmus || []).find((x) => x.path === dest || x.folder === dest);
    if (fs.existsSync(dest) && !mine) throw new Error(`${path.basename(dest)} is already in ${dir.replace(os.homedir(), '~')}. Cartridge leaves it as it is.`);
    fs.mkdirSync(dir, { recursive: true });
    const src = asset || archive, tmp = path.join(dir, `.${path.basename(dest)}.cartridge-new${asset ? '' : path.extname(archive.name) || '.zip'}`);
    emuGetRun = { abort: new AbortController() };
    try {
      let got = 0, last = 0;
      await downloadTo(src.url, tmp, emuGetRun, (n) => { got += n; const now = Date.now(); if (now - last > 400) { last = now; broadcast('emuget-custom', { pct: src.size ? Math.min(99, Math.floor((got / src.size) * 100)) : null }); } }, { plain: true });
      if (asset) {
        if (!require('./emuUpdates').looksRunnable(tmp, asset.name)) throw new Error('What came down wasn’t a working AppImage.');
        fs.chmodSync(tmp, 0o755); fs.renameSync(tmp, dest);
      } else {
        broadcast('emuget-custom', { pct: null });
        const out = dest + '.cartridge-new';
        fs.rmSync(out, { recursive: true, force: true });
        await unpackTo(tmp, out);
        // one folder around everything is taken off, as the emulators' own zips are packed
        const top = fs.readdirSync(out);
        const inner = top.length === 1 && isDir(path.join(out, top[0])) ? path.join(out, top[0]) : out;
        // an update lays the new files over the folder, so anything the emulator keeps there (portable user data) stays
        fs.mkdirSync(dest, { recursive: true });
        fs.cpSync(inner, dest, { recursive: true, force: true });
        fs.rmSync(out, { recursive: true, force: true });
      }
    } finally { fs.rmSync(tmp, { force: true }); emuGetRun = null; }
    const name = repo.split('/')[1];
    if (asset) return finishCustom({ repo, file: dest, folder: null, as, of, key, tag: rel.tag, name });
    // which program in the folder is the emulator: the one used before, the only one, or the user picks
    const progs = programsInFolder(dest);
    if (!progs.length) throw new Error(`${name} was unpacked into ${dest.replace(os.homedir(), '~')}, but there’s no AppImage or Linux program in it.`);
    for (const p of progs) { try { fs.chmodSync(p.path, 0o755); } catch {} } // zips don't keep the run bit
    const again = prev?.folder === dest && prev.path && progs.find((p) => p.path === prev.path);
    if (again || progs.length === 1) return finishCustom({ repo, file: (again || progs[0]).path, folder: dest, as, of, key, tag: rel.tag, name });
    customPending = { repo, folder: dest, as, of, key, tag: rel.tag, name, files: progs.map((p) => p.path) };
    return { pick: progs.map((p) => ({ path: p.path, rel: p.rel, size: p.size, appimage: p.appimage })), folder: dest, name, tag: rel.tag };
  },
  // the program the user picked in an unpacked release (0.9.32)
  'emuget:customPick': ({ file }) => {
    const p = customPending;
    if (!p || !p.files.includes(file)) throw new Error('Pick one of the programs from that release.');
    customPending = null;
    return finishCustom({ ...p, file });
  },
  'emuget:cancel': () => { emuGetRun?.abort.abort(); return true; },
  // emulator updates (0.9.16): each installed copy, its version and whether a newer one is out
  // 0.9.37 (owner: slow to open, and RPCS3 said it had an update while Cartridge said up to date): cached answers
  // at once ({ cached }), then every check at the same time; a check is reused for 10 minutes, not 6 hours
  'emuup:list': async ({ fresh, cached } = {}) => {
    const t0 = Date.now(), TTL = 10 * 60e3;
    const U = require('./emuUpdates'), { FORKS } = require('./emulators');
    const file = path.join(USER_DATA, 'emulator-releases.json'), cache = loadJson(file, {});
    // 0.9.17: the main copies only: not forks, not old copies (RPCS3's *_old, "previous"), not the
    // versions shadPS4's launcher keeps for itself; and the version an update put in (the file name keeps the old one)
    // 0.9.38: shadPS4's launcher installs as Shadps4-qt.AppImage, so only its SDL core copies are left out
    const isFork = (e) => (FORKS[e.id] || []).some(([re]) => re.test(path.basename(e.path || e.fp || '')));
    const list = steamMgr.installedEmulators().filter((e) => !(e.path && (/_old\b|\.old\b|previous|\.cartridge-(old|new)/i.test(path.basename(e.path)) || /shadPS4QtLauncher\/versions|\/versions\//i.test(e.path))) && !isFork(e) && !(e.id === 'shadps4' && e.path && /sdl/i.test(path.basename(e.path))))
      .map((e) => { const st = e.path && (() => { try { return fs.statSync(e.path); } catch { return null; } })(); const got = (cache.installed || {})[e.path]; const ran = e.path && U.ranVersion(e.id, e.path); /* the version that really runs, where the emulator says it (RPCS3's log, 0.9.37) */ return ran ? { ...e, version: ran } : got && st && got.size === st.size ? { ...e, version: got.version } : e; });
    const fpIds = list.filter((e) => e.kind === 'flatpak').map((e) => e.fp);
    const fpWant = !cached && fpIds.length && (fresh || !cache.fp || Date.now() - cache.fp.t > TTL);
    const fpRun = fpWant ? U.flatpakUpdates(fpIds).then((d) => (cache.fp = { t: Date.now(), d }).d).catch(() => cache.fp?.d || {}) : Promise.resolve(cache.fp?.d || {});
    const jobs = [];
    const out = [];
    // emulators and forks installed from a GitHub link (0.9.28, owner: update them from the same place): their own
    // project's releases, never the emulator they're a fork of; listed even when the scan doesn't know them
    const customs = (config.customEmus || []).filter((x) => x.path && fs.existsSync(x.path));
    for (const x of customs) if (!list.some((e) => e.path === x.path)) list.push({ id: x.of || 'custom', label: x.repo.split('/')[1], kind: 'appimage', path: x.path });
    for (const e of list) {
      const custom = customs.find((x) => x.path === e.path);
      if (custom) {
        const ck = 'gh:' + custom.repo; let c = cache[ck];
        if (!cached && (fresh || !c || Date.now() - c.t > TTL)) jobs.push(require('./github').release(custom.repo).then((r) => { cache[ck] = { t: Date.now(), tag: r?.tag || null }; }).catch((err) => { cache[ck] = { t: c?.t || 0, tag: c?.tag || null, error: err.message }; }));
        out.push(() => { const c = cache[ck]; return ({ ...e, label: custom.repo.split('/')[1], version: custom.tag, custom: { repo: custom.repo }, forkOf: custom.as === 'fork' ? custom.of : null, update: c?.tag && c.tag !== custom.tag ? { version: c.tag, tag: c.tag } : null, latest: c?.tag ? { version: c.tag } : null, error: c?.error || null, channel: null, channels: [], page: `https://github.com/${custom.repo}/releases` }); });
        continue;
      }
      if (e.kind === 'flatpak') { out.push((fp) => ({ ...e, update: fp[e.fp] ? { version: fp[e.fp].version } : null, where: fp[e.fp]?.where, channel: 'flathub', channels: [] })); continue; }
      const ch = U.channelsOf(e.id, e.path), channel = ((config.emuChannels || {})[e.id]) || ch.def;
      // 0.9.21: the release source follows the copy (Xenia Edge, Xenia's Windows build, Eden's variants)
      // a plain program (not an AppImage, not a folder build Cartridge can update) is never overwritten (0.9.21)
      const kind = e.kind === 'appimage' || e.kind === 'folder' ? U.installKind(e.path) : null, base = U.specFor(e.id, e.path);
      const spec = kind === 'folder' ? (base?.folder || base?.overProgram || base?.dirBuild ? base : null) : kind === 'program' && !base?.zipped && !base?.overProgram ? null : base;
      // 0.9.23: a copy that can't start (system libraries missing, e.g. Vita3K's Qt6 zip build on SteamOS)
      // is offered its update as a repair, newer or not
      const broken = kind === 'program' || kind === 'folder' ? await U.missingLibsAsync(e.path) : [];
      // 0.9.47: an AppImage (or program) built for a newer glibc than this system has can't start: a repair too
      const gp = e.kind !== 'flatpak' && e.path && !/\.exe$/i.test(e.path) ? require('./detect').glibcProblem(e.path) : null;
      if (gp) broken.push(`glibc ${gp.need} (this system has ${gp.have})`);
      // 0.9.49 (owner: "Vita3K genuinely doesn't open"): an emulator that can say whether it starts is asked (emuStart),
      // since a copy whose libraries are all there can still die at once (EmuDeck's Qt 6 Vita3K on a system with another Qt 6)
      const ES = require('./emuStart'), prog = e.path && /\.sh$/i.test(e.path) ? ES.scriptProgram(e.path) : e.path;
      if (prog && ES.has(e.id) && !gp && cached) { const r = ES.cached(e.id, prog); if (r && !r.ok) broken.push(r.reason); }
      else if (prog && ES.has(e.id) && !gp) jobs.push(ES.check(e.id, prog).then((r) => { if (r && !r.ok) { broken.push(r.reason); log('emulator start check', e.id, prog, r.reason, r.detail ? '| ' + r.detail.replace(/\n/g, ' | ').slice(0, 600) : ''); } }));
      const hold = config.emuGlibcHold?.[e.id], held = hold && !gp && Date.now() - hold.t < 14 * 864e5 && hold.have === require('./detect').systemGlibc();
      const ck = e.id + ':' + path.basename(e.path || '') + (kind === 'folder' ? ':folder' : '') + ':' + (channel || '');
      const c0 = cache[ck];
      if (spec && !cached && (fresh || broken.length || ES.has(e.id) || !c0 || Date.now() - c0.t > TTL)) jobs.push(U.latestRelease(e.id, { file: e.path, channel }).then((rel) => { cache[ck] = { t: Date.now(), rel }; }).catch((err) => { cache[ck] = { t: c0?.t || 0, rel: c0?.rel || null, error: err.message }; }));
      out.push(() => { const c = cache[ck]; return ({ ...e, build: kind, broken: broken.length ? broken : null, update: c?.rel && (broken.length || (!held && U.isNewer(c.rel, e))) ? c.rel : null, latest: c?.rel || null, error: c?.error || null, noSource: !spec, channel, channels: spec ? ch.options : [], page: spec?.repo ? `https://github.com/${spec.repo}/releases` : null }); });
    }
    await Promise.all(jobs);
    const fpd = await fpRun;
    // every emulator's own website and download page come from CEE (0.9.49), Flatpaks and forks included
    const CL = require('./cee').LINKS, FAM = require('./emuProfiles').FAMILY;
    const res = out.map((f) => f(fpd)).map((x) => { const id = String(x.id || '').split('@')[0], l = CL[id] || CL[FAM[id]]; return x.custom || !l ? x : { ...x, page: l.downloads || x.page, site: l.site }; });
    if (!cached) log('emulator updates checked', `${res.length} in ${Date.now() - t0} ms, ${jobs.length} asked`);
    if (cached) return res;
    saveJson(file, cache);
    return res;
  },
  // force (0.9.23): Download again, the newest of its channel even when it's the same version
  'emuup:run': async ({ id, kind, fp, where, path: file, force }) => {
    const U = require('./emuUpdates');
    if (require('./raLogin').running().has(String(id).split('@')[0])) throw new Error('Close the emulator first.');
    // from a GitHub link: its own project's newest release, set up the same way again (0.9.28)
    const custom = (config.customEmus || []).find((x) => x.path === file);
    if (custom) { const r = await handlers['emuget:custom']({ link: custom.repo, as: custom.as, of: custom.of, key: custom.key }); log('emulator from a link updated', custom.repo, r.tag); return true; }
    if (kind === 'flatpak') {
      broadcast('emu-update', { path: fp, state: 'downloading', pct: null });
      await U.flatpakUpdate(fp, where, (m) => broadcast('emu-update', { path: fp, state: 'downloading', pct: m.pct, text: m.text }), force ? ['install', '--reinstall'] : []);
      log('emulator updated (flatpak)', fp, force ? '(reinstalled)' : ''); broadcast('emu-update', { path: fp, state: 'done' }); return true;
    }
    const own = steamMgr.installedEmulators().find((e) => (e.kind === 'appimage' || e.kind === 'folder' || e.kind === 'windows') && e.path === file);
    if (!own) throw new Error('That emulator wasn’t found.');
    const rel = await U.latestRelease(own.id, { file, channel: (config.emuChannels || {})[own.id] });
    if (!rel) throw new Error('No newer AppImage was found for it.');
    broadcast('emu-update', { path: file, state: 'downloading', pct: 0 });
    let got = 0;
    await U.replaceAppImage(file, rel, (url, dest) => downloadTo(url, dest, { abort: new AbortController() }, (n) => { got += n; broadcast('emu-update', { path: file, state: 'downloading', pct: rel.size ? Math.round((got / rel.size) * 100) : null }); }, { plain: true }));
    log('emulator updated (appimage)', own.id, own.version, '->', rel.version || rel.tag, rel.fellBack ? `(the newest can't start here: ${rel.fellBack.reason || `it needs glibc ${rel.fellBack.need}, this has ${rel.fellBack.have}`})` : '');
    // 0.9.47: the newest build can't start here: its update isn't offered again for two weeks (it would come down and be refused)
    // 0.9.49: the same when it came down and didn't start (emuStart)
    if (rel.fellBack) { config.emuGlibcHold = { ...(config.emuGlibcHold || {}), [own.id]: { t: Date.now(), have: rel.fellBack.have || require('./detect').systemGlibc() } }; saveConfig(); }
    else if (config.emuGlibcHold?.[own.id]) { delete config.emuGlibcHold[own.id]; saveConfig(); }
    const cf = path.join(USER_DATA, 'emulator-releases.json'), cache = loadJson(cf, {});
    try { (cache.installed ||= {})[file] = { version: rel.version || rel.tag, size: fs.statSync(file).size, at: Date.now() }; saveJson(cf, cache); } catch {}
    broadcast('emu-update', { path: file, state: 'done' });
    try { steamMgr.scanEmulators?.(); } catch {}
    return { version: rel.version || rel.tag };
  },
  // Per-game emulator settings (0.9.23, electron/gameSettings.js): the emulator this game uses and its
  // per-game file; only written while that emulator is closed (it saves its settings when it quits)
  // 0.9.32 (owner: an About for every game): what Cartridge knows about one game, read only and from this
  // device (no downloads): its console, file, IDs, version, and what is installed or turned on for it
  'game:about': async ({ romId }) => {
    const r = romIndexMain().get(Number(romId));
    if (!r) throw new Error('That game isn’t in the library.');
    const where = installedMap[r.id], here = where && where !== MARKED ? where : '';
    const out = { name: r.name, console: r.platform_display_name || r.platform_slug, slug: r.platform_slug, rommId: r.id > 0 ? r.id : null, file: r.fs_name || '', size: r.fs_size_bytes || 0, regions: r.regions || [], where: here, marked: where === MARKED, ids: [], version: '', addons: [], other: [], patches: [], settings: [], install: null, steam: null };
    const id = (label, value) => { if (value && !out.ids.some((x) => x.value === value)) out.ids.push({ label, value: String(value) }); };
    const step = () => new Promise((res) => setImmediate(res)); // long reads never hold up the window
    let ids = {};
    if (here) { try { handlers['addons:forGame']({ romId: r.id, out: (x) => { ids = x; } }); } catch {} }
    id('Serial', ids.serial); id('Game ID', ids.gameId); id('Title ID', ids.titleId || ids.switchId);
    const v = ids.version;
    if (v) out.version = [v.display || v.text, v.update ? `update ${v.update}` : '', v.number != null && !v.display ? `v${v.number}` : ''].filter(Boolean).join(' · ');
    await step();
    let st = {};
    if (here) { try { st = patchState(r.id) || {}; } catch {} }
    id(/ps3|ps4/i.test(r.platform_slug) ? 'Serial' : 'ID', st.serial !== r.name ? st.serial : '');
    if (!out.version && st.version) out.version = String(st.version);
    if (/ps3/i.test(r.platform_slug) && here) { const s = ps3Serial(r.id, here); id('Serial', s); }
    if (installs[r.id]) out.install = { emu: emuLabel(installs[r.id].emu), at: installs[r.id].at || null };
    // add-ons Cartridge put in, and files in the game's folders it didn't
    out.addons = Object.values(addonRecs()).filter((x) => x.romId === r.id).map((x) => ({ name: x.name, kind: x.category || (x.source === 'ps2' ? 'Textures' : 'Mod'), emu: x.emuName, files: x.files.length, at: x.at }));
    if (here) { try { out.other = ((await handlers['addons:present']({ romIds: [r.id] }))[r.id] || []).filter((x) => x.by !== 'cartridge').map((x) => ({ emu: x.name, files: x.files })); } catch {} }
    await step();
    // patches and cheats turned on, from the emulator's own files (Cartridge's or yours)
    const E = EMU_PATCH[st.emu];
    if (st.dir && E) { try { out.patchEmu = E.name; out.patches = (await E.list(st, patchMine[st.emu] || {})).filter((x) => x.on).map((x) => ({ name: x.name || x.description, by: x.by === 'emulator' ? 'you' : 'cartridge', section: x.section || '' })); } catch {} }
    // this game's own emulator settings
    if (here) { try { const d = handlers['gamesettings:get']({ romId: r.id }); if (d?.items) { out.settingsEmu = d.name; out.settings = d.items.filter((x) => x.game != null).map((x) => ({ label: x.label, value: x.options.find((o) => String(o.value) === String(x.game))?.label || String(x.game) })); } } catch {} }
    try { const s = steamMgr.forRom(r.id); if (s?.steam) out.steam = { inSteam: !!s.inSteam, queued: s.queued || null }; } catch {}
    return out;
  },
  // Linked Folders (0.9.33, owner): a fork's save folders linked to the emulator it's a fork of. Suggestions from
  // the forks found, plus links you made yourself; folder-links.json records Cartridge's, the only ones it removes.
  'links:list': () => {
    const L = require('./folderLinks'), SV = require('./saves'), home = os.homedir();
    const recs = loadJson(LINKS_FILE, []);
    const baseOf = (id, rel) => { const roots = (SV.DATA[id] || []).map((r) => path.join(home, r)).filter((d) => fs.existsSync(d)); return roots.find((d) => fs.existsSync(path.join(d, rel))) || roots[0] || null; };
    const suggestions = [];
    let forks = []; try { forks = steamMgr.forksAll(); } catch (e) { log('links forks', e.message); }
    for (const f of forks) {
      if (f.how === 'flatpak') continue;
      for (let [, label, rel] of SV.SYNC[f.of] || []) {
        // 0.9.57: shadPS4 keeps saves in home/<user ID>/savedata, so its forks share the whole home folder (older
        // builds: savedata/), whichever the original has
        if (f.of === 'shadps4') rel = ['home', 'savedata'].find((x) => baseOf('shadps4', x) && fs.existsSync(path.join(baseOf('shadps4', x), x))) || 'home';
        if (typeof rel !== 'string') continue;
        const donor = baseOf(f.of, rel), fb = L.findForkBase(f.exe, rel, home);
        // 0.9.37: not in its usual places: looked for under the fork's own folder
        const deep = !fb && L.searchForkFolder(f.exe, rel);
        const to = donor ? path.join(donor, rel) : null, from = fb ? path.join(fb.base, rel) : deep || null;
        const st = from && to ? L.status(from, to) : { state: !to ? 'no-donor' : 'no-folder' };
        if (recs.some((r) => r.from === from || (to && r.from === to))) continue; // already one of yours (either way round, 0.9.56)
        // 0.9.56: what each folder holds, so you choose which one both use (the fork's, or the original's)
        suggestions.push({ fork: f.name, exe: f.exe, of: f.of, ofName: SV.NAMES[f.of] || f.of, label, rel, from, to, how: fb?.how || null, fromInfo: from ? L.summary(from) : null, toInfo: to ? L.summary(to) : null, ...st });
      }
    }
    const links = recs.map((r) => ({ ...r, ...L.status(r.from, r.to) }));
    return { suggestions, links, home };
  },
  // Find and Link Saves (0.9.37, owner: detect the saves and link them by itself, keep the manual way): every fork
  // ready to link gets its games the original lacks copied across (copies only), then the link
  'links:auto': ({ dry } = {}) => {
    const L = require('./folderLinks'), list = handlers['links:list']().suggestions.filter((s) => s.from && s.to && ['folder', 'empty', 'missing'].includes(s.state));
    if (dry) return list.map((s) => ({ fork: s.fork, ofName: s.ofName, label: s.label, from: s.from, to: s.to, state: s.state }));
    const out = [];
    for (const s of list) {
      try {
        const m = s.state === 'folder' ? L.mergeInto(s.from, s.to) : { copied: [], skipped: [] };
        const r = handlers['links:make']({ from: s.from, to: s.to, label: s.label, fork: s.fork, of: s.of });
        out.push({ fork: s.fork, ofName: s.ofName, label: s.label, copied: m.copied.length, kept: r.kept });
        log('links auto', s.from, '->', s.to, `${m.copied.length} copied, ${m.skipped.length} already there`);
      } catch (e) { out.push({ fork: s.fork, ofName: s.ofName, label: s.label, error: e.message }); log('links auto failed', s.from, e.message); }
    }
    return out;
  },
  'links:check': ({ from, to }) => { const L = require('./folderLinks'); return { why: L.check(from, to), ...L.status(from, to), fromInfo: L.summary(from), toInfo: L.summary(to) }; },
  // merge: copy the games only the folder being replaced has into the one both will use first (copies only, never over)
  // main: 'fork' when the original emulator takes the fork's folder (0.9.56, owner: ask which is the main folder)
  'links:make': ({ from, to, label, fork, of, merge, main }) => {
    const L = require('./folderLinks');
    let copied = 0;
    if (merge && L.status(from, to).state === 'folder') { const m = L.mergeInto(from, to); copied = m.copied.length; log('links merge', from, '->', to, `${m.copied.length} copied, ${m.skipped.length} already there`); }
    const r = L.link(from, to);
    r.copied = copied;
    const recs = loadJson(LINKS_FILE, []).filter((x) => x.from !== from);
    if (!r.already) recs.push({ id: Date.now().toString(36), from, to, kept: r.kept, label: String(label || '').slice(0, 80), fork: fork || '', of: of || '', main: main === 'fork' ? 'fork' : '', at: Date.now() });
    saveJson(LINKS_FILE, recs);
    log('folder linked', from, '->', to, r.kept ? '(kept aside)' : '');
    return r;
  },
  'links:remove': ({ id }) => {
    const recs = loadJson(LINKS_FILE, []), rec = recs.find((x) => x.id === id);
    if (!rec) throw new Error('Cartridge didn’t make that link.');
    require('./folderLinks').unlink(rec);
    saveJson(LINKS_FILE, recs.filter((x) => x.id !== id));
    log('folder unlinked', rec.from);
    return true;
  },
  'gamesettings:get': ({ romId }) => { const c = gameSettingsCtx(Number(romId)); return c.why ? { why: c.why, emu: c.emu } : require('./gameSettings').describe(c); },
  'gamesettings:set': ({ romId, changes }) => {
    const c = gameSettingsCtx(Number(romId));
    if (c.why) throw new Error(c.why);
    const names = { rpcs3: 'RPCS3', pcsx2: 'PCSX2', duckstation: 'DuckStation', dolphin: 'Dolphin', ppsspp: 'PPSSPP', shadps4: 'shadPS4' };
    notRunning(c.emu, names[c.emu]);
    const d = require('./gameSettings').apply(c, changes || []);
    log('game settings', c.emu, c.serial, (changes || []).map((x) => `${x.id}=${x.value}`).join(' '));
    return d;
  },
  // shadPS4 versions (0.9.23): installed ones, which games use each, and shadPS4's releases to add
  'shadv:list': async ({ online } = {}) => {
    const SV = require('./shadVersions'), mine = (config.steam || {}).shadVersions || {};
    const idx = romIndexMain();
    const games = Object.entries(mine).map(([id, p]) => ({ romId: Number(id), name: idx.get(Number(id))?.name || `Game ${id}`, path: p }));
    const list = SV.installed().map((v) => ({ ...v, games: games.filter((g) => g.path === v.path) }));
    let avail = null, error = null;
    if (online) { try { avail = await SV.available(); } catch (e) { error = e.message; } }
    return { list, available: avail, error, folder: SV.settings().versionPath, defaultGames: [...idx.values()].filter((r) => /^ps4$/i.test(r.platform_slug || '') && installedMap[r.id] && installedMap[r.id] !== MARKED && !mine[r.id]).length };
  },
  'shadv:install': async ({ tag }) => {
    const SV = require('./shadVersions');
    const rel = (await SV.available()).find((r) => r.tag === tag);
    if (!rel) throw new Error('That release isn’t on shadPS4’s GitHub any more.');
    const z = path.join(os.tmpdir(), `cartridge-shadps4-${Date.now()}.zip`);
    let got = 0;
    try {
      await downloadTo(rel.asset.url, z, { abort: new AbortController() }, (n) => { got += n; broadcast('shadv-progress', { tag, pct: rel.asset.size ? Math.round((got / rel.asset.size) * 100) : null }); }, { plain: true });
      const v = await SV.addRelease(rel, z);
      log('shadPS4 version added', v.name, v.path);
      return v;
    } finally { fs.rmSync(z, { force: true }); broadcast('shadv-progress', { tag, done: true }); }
  },
  'shadv:remove': ({ name }) => {
    const SV = require('./shadVersions'), v = SV.installed().find((x) => x.name === name);
    const users = Object.entries((config.steam || {}).shadVersions || {}).filter(([, p]) => v && p === v.path);
    SV.remove(name);
    if (users.length) { for (const [id] of users) delete config.steam.shadVersions[id]; saveConfig(); }
    return { games: users.length };
  },
  // 0.9.23 (owner: show stable or pre-release, and switch): the channel an emulator's updates follow
  'emuup:setChannel': ({ id, channel }) => { (config.emuChannels ||= {})[id] = channel; saveConfig(); return true; },
  // 0.9.23 (owner: delete emulators from Cartridge): a Flatpak through flatpak uninstall; an AppImage or
  // program file is deleted; a folder build's folder only when nothing of the user's lives in it (a
  // portable/ or user/ folder means saves and settings, so then only the program goes). EmuDeck's own
  // launcher scripts are EmuDeck's to remove. Steam shortcuts that used it show up in Shortcut health.
  // Open an emulator on its own (0.9.25, owner: from Settings → Emulators → Emulators), for its own settings.
  // Started without the AppImage's library paths, like games. In Game Mode it opens inside Cartridge's
  // window group (same SteamGameId), so the pad is paused until it closes, then the window takes focus back.
  'emuget:open': ({ id, kind, fp, path: file }) => new Promise((resolve, reject) => {
    let cmd, args = [], cwd = os.homedir();
    if (kind === 'windows') return reject(new Error('Windows builds start through Proton: open it from its Steam shortcut.'));
    if (kind === 'flatpak') { if (!fp) return reject(new Error('That Flatpak wasn’t found.')); cmd = 'flatpak'; args = ['run', fp]; }
    else { if (!file || !fs.existsSync(file)) return reject(new Error('That emulator isn’t there any more.')); cmd = file; cwd = path.dirname(file); }
    const env = { ...process.env };
    for (const k of ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'APPDIR', 'APPIMAGE', 'ARGV0', 'OWD']) delete env[k];
    // 0.9.49 (owner: Vita3K "doesn't open, nothing happens"): what it prints goes to a log, and one that closes within
    // 12 s with an error says why instead of nothing
    const runLog = path.join(USER_DATA, 'emulator-runs', `${String(id || 'emulator').replace(/[^\w.@-]/g, '_')}.log`);
    let fd = 'ignore'; try { fs.mkdirSync(path.dirname(runLog), { recursive: true }); fd = fs.openSync(runLog, 'w'); } catch {}
    const p = require('child_process').spawn(cmd, args, { cwd, env, detached: true, stdio: ['ignore', fd, fd] });
    if (typeof fd === 'number') try { fs.closeSync(fd); } catch {}
    const t0 = Date.now();
    p.once('exit', (code, signal) => {
      if (Date.now() - t0 > 12000 || (!code && !signal)) return;
      let text = ''; try { text = fs.readFileSync(runLog, 'utf8').slice(-8000); } catch {}
      if (/vita3k/i.test(String(id))) text += '\n' + require('./pkgInstall').vita3kLogTail(file);
      const why = require('./emuStart').reasonOf(text, code, signal);
      log('emulator closed straight away', id || '', fp || file, code, signal || '', why);
      broadcast('toast', { text: `${emuLabel(String(id || '').split('@')[0]) || 'The emulator'} closed straight away: ${why}`, kind: 'error', icon: 'mdiAlertCircleOutline' });
    });
    p.once('error', (e) => reject(new Error(e.code === 'EACCES' ? 'It isn’t allowed to run (its file isn’t executable).' : `It didn’t start: ${e.message}`)));
    p.once('spawn', () => {
      log('emulator opened', id || '', fp || file);
      if (isGamescope()) {
        broadcast('background', { away: true });
        p.once('exit', () => { broadcast('background', { away: false }); refocus(); });
      }
      p.unref();
      resolve(true);
    });
  }),
  'emuget:remove': async ({ id, kind, fp, where, path: file }) => {
    const U = require('./emuUpdates');
    if (require('./raLogin').running().has(String(id).split('@')[0])) throw new Error('Close the emulator first.');
    if (kind === 'flatpak') { await U.flatpakRemove(fp, where); log('emulator removed (flatpak)', fp); try { steamMgr.scanEmulators?.(); } catch {} return true; }
    const own = steamMgr.installedEmulators().find((e) => e.path === file);
    if (!own || !file) throw new Error('That emulator wasn’t found.');
    if (/\.sh$/i.test(file)) throw new Error('This one is EmuDeck’s launcher: remove the emulator from EmuDeck.');
    const dir = path.dirname(file), home = os.homedir();
    const keep = ['portable', 'user', 'config', 'content', 'storage', 'saves'].some((n) => fs.existsSync(path.join(dir, n)));
    const folderOk = own.kind === 'folder' && !keep && dir !== home && !/^(Applications|Emulation|Desktop|Downloads|bin)$/i.test(path.basename(dir)) && path.resolve(dir).startsWith(path.resolve(home) + path.sep);
    if (folderOk) fs.rmSync(dir, { recursive: true, force: true }); else fs.rmSync(file, { force: true });
    log('emulator removed', id, folderOk ? dir : file);
    const cf = path.join(USER_DATA, 'emulator-releases.json'), cache = loadJson(cf, {});
    if (cache.installed) { delete cache.installed[file]; saveJson(cf, cache); }
    try { steamMgr.scanEmulators?.(); } catch {}
    return { removed: folderOk ? dir : file };
  },
  // PS3 game updates (0.9.16): every installed PS3 game with a newer update, or one game
  'ps3up:list': async ({ fresh } = {}) => {
    const ps3 = [...romIndexMain().values()].filter((r) => /^ps3$/i.test(r.platform_slug || r.platform_fs_slug || '') && installedMap[r.id] && installedMap[r.id] !== MARKED);
    const out = [];
    for (const r of ps3) { const i = await ps3UpdateInfo(r.id, { fresh }).catch(() => null); if (i) out.push({ ...i, name: r.name }); }
    return out;
  },
  'ps3up:game': ({ romId, fresh }) => ps3UpdateInfo(Number(romId), { fresh: !!fresh }),
  'ps3up:install': ({ romId }) => ps3InstallUpdates(Number(romId)),
  'ps3up:cancel': () => { ps3upRun?.ac.abort(); return true; },
  // Cemu's own "Download latest community graphic packs" (0.9.32): now, whatever the week says
  'cemu:packsDownload': ({ romId }) => freshCemuPacks(Number(romId), true),
  // 0.9.33 (owner: Cemu has Download Latest, so should shadPS4 and RPCS3): each emulator's own patch sources, now
  // (RPCS3's patch API like its Download latest patches; shadPS4's and GoldHEN's repositories like its patch manager)
  'patches:download': async ({ romId }) => {
    const r = romIndexMain().get(Number(romId)), slugs = `${r?.platform_slug} ${r?.platform_fs_slug}`;
    if (/ps3/i.test(slugs)) { const x = await freshRpcs3Patches(Number(romId), true); if (!x) throw new Error('RPCS3’s folder wasn’t found on this device. Start RPCS3 once, then try again.'); return { emu: 'RPCS3', ...x }; }
    if (/ps4/i.test(slugs)) { const x = await freshShadPatches(Number(romId), true); if (!x) throw new Error('shadPS4’s folder wasn’t found on this device. Start shadPS4 once, then try again.'); return { emu: 'shadPS4', ...x }; }
    if (/\bwiiu\b/i.test(slugs)) return { emu: 'Cemu', ...(await freshCemuPacks(Number(romId), true)) };
    throw new Error('No patch download for this console.');
  },
  'patches:list': async ({ romId }) => {
    const dlErr = (await freshRpcs3Patches(romId)) || (await freshShadPatches(romId)) || (await freshCemuPacks(romId));
    const st = patchState(romId), E = EMU_PATCH[st.emu];
    if (!st.dir || !E) return { emu: st.emu, emuName: E?.name || '', serial: st.serial, why: [st.why, dlErr].filter(Boolean).join(' '), list: [] };
    if (st.emu === 'ppsspp') { try { const r = await cheatsMod.ppssppDownloadDb(st.dir); if (r.updated) log('ppsspp cheat.db downloaded', r.url); } catch (e) { log('ppsspp cheat.db download failed:', e.message); } }
    const list = await E.list(st, patchMine[st.emu] || {});
    const why = dlErr && !list.length ? dlErr : st.emu === 'ppsspp' && !fs.existsSync(path.join(st.dir.cheats, 'cheat.db')) ? 'PPSSPP has no cheats for this game here. They come from cheat.db: put it in PSP/Cheats in PPSSPP’s folder (or add codes in PPSSPP’s Cheats), then come back.' : '';
    // Cemu (0.9.37): which title ID it matched by, and packs for this game that only list other regions
    let other = null;
    if (st.emu === 'cemu') { try { other = require('./cemuPacks').otherRegions({ root: st.dir.root, titleIds: st.ids, name: st.title }); } catch {} log('cemu packs', st.title, 'ids', (st.ids || []).join(',') || 'none', 'packs', list.length, other && Object.keys(other).length ? 'other regions ' + JSON.stringify(other) : ''); }
    return { emu: st.emu, emuName: E.name, serial: st.serial, version: st.version, why, list, other, ids: st.emu === 'cemu' ? st.ids || [] : undefined };
  },
  // changes: [{ key, on }]. Patches turned on in RPCS3 itself are never turned off here.
  'patches:apply': async ({ romId, changes }) => {
    const st = patchState(romId), E = EMU_PATCH[st.emu];
    if (!st.dir || !E) throw new Error(st.why || 'No patches for this game.');
    const list = await E.list(st, patchMine[st.emu] || {});
    const byKey = new Map(list.map((p) => [p.key, p]));
    const todo = (changes || []).map((c) => {
      const p = byKey.get(c.key);
      const presetsChanged = !!(p && c.on && c.presets && p.presets) && JSON.stringify(Object.fromEntries(Object.keys(p.presets).map((k) => [k, p.chosen?.[k] || p.presets[k][0]]))) !== JSON.stringify(Object.fromEntries(Object.keys(p.presets).map((k) => [k, c.presets[k] || p.chosen?.[k] || p.presets[k][0]])));
      if (!p || ((p.on === !!c.on && !presetsChanged) || (p.by === 'emulator' && !c.on))) return null; // unchanged, or not Cartridge's to turn off
      return { ...p, on: !!c.on, ...(c.presets ? { want: c.presets } : {}) }; // want: a pack's choices (Cemu presets, 0.9.28)
    }).filter(Boolean);
    patchMine[st.emu] = E.set(st, todo, patchMine[st.emu] || {});
    saveJson(PATCHES_FILE, patchMine);
    log(st.emu + ' patches', st.serial, todo.map((c) => (c.on ? '+' : '-') + c.description).join(', '));
    return { count: todo.length };
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
  // 0.9.57 (owner: "clear downloads means clear"): finished background jobs (emulator updates, add-ons, installs) go too
  'dl:clear': () => {
    for (let i = queue.length - 1; i >= 0; i--) if (!['queued', 'downloading'].includes(queue[i].status)) queue.splice(i, 1);
    emitQueue();
    for (const [k, j] of bgJobs) if (j.state === 'done' || j.state === 'error') { bgJobs.delete(k); jobSent.delete(k); broadcast('bg-job', { key: k, gone: true }); }
  },
  'bios:download': ({ platformId, slug }) => downloadBios(platformId, slug),
  'bios:setup': (o) => biosSetup(o || {}),
  // each console in the library that needs BIOS or firmware, and whether it's where its emulators read it (0.9.37)
  'bios:status': () => {
    const B = require('./bios'), opts = { roots: emuRootsAll(), steamRoots: steamMgr.steamRoots?.() || [], extra: [] };
    const KEY = { ps: 'psx', psx: 'psx', ps2: 'ps2', ps3: 'ps3', psvita: 'psvita', vita: 'psvita', switch: 'switch', segacd: 'segacd', 'sega-cd': 'segacd', megacd: 'segacd', saturn: 'saturn', dc: 'dreamcast', dreamcast: 'dreamcast', 'pc-engine-cd': 'pcenginecd', pcenginecd: 'pcenginecd', 'turbografx-cd': 'pcenginecd', neogeo: 'neogeo', 'neo-geo': 'neogeo', xbox: 'xbox', nds: 'nds', gba: 'gba' };
    const out = [];
    for (const p of library?.platforms || []) {
      const key = KEY[p.slug] || KEY[p.fs_slug]; if (!key || out.some((x) => x.key === key)) continue;
      const st = B.status(key, opts); if (st) out.push({ ...st, console: p.display_name || p.name, platformId: p.id, slug: p.slug });
    }
    return { list: out.sort((a, b) => Number(a.ok) - Number(b.ok) || Number(a.optional) - Number(b.optional) || a.console.localeCompare(b.console)), dir: config.biosPath || '' };
  },
  'bios:list': ({ platformId }) => api('/api/firmware', { query: { platform_id: platformId } }),
  // 0.9.17: every console's BIOS and firmware from RomM in one go, then into the emulators
  'bios:all': async () => {
    const out = [];
    for (const p of library?.platforms || []) {
      const list = await api('/api/firmware', { query: { platform_id: p.id } }).catch(() => []);
      if (!list?.length) continue;
      try { const r = await downloadBios(p.id, p.slug); out.push({ name: p.display_name || p.name, files: r.count, placed: r.placed, installed: r.installed, pending: r.pending }); }
      catch (e) { out.push({ name: p.display_name || p.name, error: e.message }); }
    }
    // then everything into place, for emulators that weren't there when a console's files came (0.9.37)
    try { const b = await biosSetup({ install: true }); for (const x of out) x.after = b.did; } catch (e) { log('bios setup after download:', e.message); }
    return out;
  },
  // 0.9.17: your console folders added to the emulators' game lists (PCSX2, DuckStation, Dolphin)
  'setup:gameFolders': () => {
    const folders = {};
    // 0.9.38: the console's folder on every drive
    for (const p of library?.platforms || []) { const k = { ngc: 'gc', gamecube: 'gc' }[p.slug] || p.slug; for (const d of platformDirs(p)) if (fs.existsSync(d)) (folders[k] ||= []).push(d); }
    const running = require('./raLogin').running();
    const r = require('./emuFolders').addGameDirs(folders, { running });
    // 0.9.38: Ryujinx (Config.json game_dirs) and shadPS4 (config.toml [GUI] installDirs) through emuPaths, only adding
    for (const [id, name, key, rid] of [['ryujinx', 'Ryujinx', 'switch', 'game_dirs'], ['shadps4', 'shadPS4', 'ps4', 'GUI.installDirs']]) {
      const want = [].concat(folders[key] || []); if (!want.length) continue;
      try {
        const P = require('./emuPaths'), d = P.describe(id); const row = d.items?.find((x) => x.id === rid); if (!row) continue;
        if (running.has(id)) { r.push({ name, file: d.file, skipped: 'running' }); continue; }
        const have = new Set((row.paths || []).map((x) => path.resolve(x))), add = want.filter((x) => !have.has(path.resolve(x)));
        if (add.length) { P.setPath(id, rid, [...row.value, ...add]); r.push({ name, file: d.file, added: add }); }
      } catch (e) { log('game folders', id, e.message); }
    }
    const rec = loadJson(path.join(USER_DATA, 'emu-folders.json'), {});
    for (const t of r) if (t.added?.length) (rec[t.file] ||= []).push(...t.added);
    saveJson(path.join(USER_DATA, 'emu-folders.json'), rec);
    return r.map((t) => ({ name: t.name, flatpak: t.flatpak, added: t.added || [], skipped: t.skipped || null }));
  },
  'fs:detect': () => detectRoots(),
  'fs:list': async (arg) => {
    const o = typeof arg === 'object' && arg ? arg : { dir: arg };
    const d = expandHome(o.dir || os.homedir());
    const entries = await fsp.readdir(d, { withFileTypes: true }).catch(() => []);
    const isD = (e) => e.isDirectory() || (e.isSymbolicLink() && isDir(path.join(d, e.name)));
    const dirs = entries.filter((e) => isD(e) && (o.hidden ? !['.', '..', '.cache', '.Trash-1000'].includes(e.name) : !e.name.startsWith('.'))).map((e) => e.name).sort((a, b) => a.localeCompare(b));
    const exts = Array.isArray(o.files) ? o.files.map((x) => '.' + String(x).toLowerCase()) : null;
    // files: a list of extensions, or '*' for any file (picking an emulator, whatever it's called)
    const files = exts || o.files === '*' ? entries.filter((e) => !isD(e) && !e.name.startsWith('.') && (!exts || exts.includes(path.extname(e.name).toLowerCase()))).map((e) => e.name).sort((a, b) => a.localeCompare(b)) : undefined;
    return { path: path.resolve(d), parent: path.dirname(path.resolve(d)), dirs, files };
  },
  'fs:mkdir': async (dir) => { await fsp.mkdir(dir, { recursive: true }); return true; },
  'storage:overview': () => storageOverview(),
  // the space where a console's next download would go (0.9.38: any drive with a games folder)
  'fs:downloadSpace': async ({ slug, fs_slug, need = 0, root = null } = {}) => { const d = downloadDir({ slug, fs_slug }, need, root); const sp = await handlers['fs:space'](d); return sp && { ...sp, dir: d }; },
  // the games folders: this device's and each extra drive's, with free space (Settings → Storage, 0.9.38)
  'roots:list': async () => {
    // 0.9.49 (owner: "This Device" was the main games folder, which was on the MicroSD, so games went there): each
    // folder is named after the drive it's really on: Main Drive for this device's own disk, else the drive's name
    const list = mounts();
    const one = async (p, main) => { const sp = await handlers['fs:space'](p); const dv = p && isDir(p) ? driveOf(p, list) : null; return { path: p, main, here: isDir(p), free: sp?.free || 0, total: sp?.total || 0, drive: dv ? (dv.label === 'This device' ? 'Main Drive' : dv.label) : path.basename(path.dirname(path.dirname(p || '')) || '') || 'Drive', mount: dv?.mount || '' }; };
    const roots = [await one(config.romsRoot, true), ...(await Promise.all(extraRoots().map((r) => one(r, false))))].filter((r) => r.path);
    // two folders on one drive: the drive's name and the folder's
    for (const r of roots) if (roots.filter((x) => x.drive === r.drive).length > 1) r.drive = `${r.drive} · ${path.basename(path.dirname(r.path)) === 'Emulation' ? path.basename(path.dirname(path.dirname(r.path))) : path.basename(path.dirname(r.path))}`;
    return { roots, to: config.downloadRoot || 'most', ask: !!config.downloads?.askWhere };
  },
  // a drive picked: an ES-DE roms folder made on it (a folder per console in the library), added to every
  // set-up emulator's game list that has one, and opened to Flatpak emulators; never moves or deletes a game
  'roots:add': async ({ dir } = {}) => {
    if (!dir || !isDir(dir)) throw new Error('That folder isn’t there.');
    let root = dir;
    if (!/\/roms\/?$/i.test(dir)) root = isDir(path.join(dir, 'roms')) ? path.join(dir, 'roms') : isDir(path.join(dir, 'Emulation', 'roms')) ? path.join(dir, 'Emulation', 'roms') : path.join(dir, 'Emulation', 'roms');
    const real = (x) => { try { return fs.realpathSync(x); } catch { return path.resolve(x); } };
    const all = [config.romsRoot, ...extraRoots()].filter(Boolean).map(real);
    if (fs.existsSync(root) && all.includes(real(root))) throw new Error('That drive’s games folder is already in the list.');
    fs.mkdirSync(root, { recursive: true });
    for (const p of library?.platforms || []) { if (p.rom_count > 0) { try { fs.mkdirSync(rootFolder(root, p), { recursive: true }); } catch {} } }
    config.extraRoots = [...(config.extraRoots || []), { path: root }]; saveConfig();
    log('games folder added', root);
    const lists = handlers['setup:gameFolders']();
    // Flatpak emulators only see folders they were given: this one is given to each that's installed
    let opened = 0;
    try { for (const e of steamMgr.installedEmulators().filter((x) => x.kind === 'flatpak')) { try { await flatpakAsync(['override', '--user', `--filesystem=${real(root)}`, e.fp]); opened++; } catch {} } } catch {}
    computeInstalled();
    return { root, lists: lists.filter((x) => x.added.length).map((x) => x.name), opened };
  },
  'roots:remove': ({ dir } = {}) => { config.extraRoots = (config.extraRoots || []).filter((r) => r.path !== dir); if (config.downloadRoot === dir) config.downloadRoot = 'most'; saveConfig(); computeInstalled(); return true; },
  'roots:to': ({ to } = {}) => { config.downloadRoot = to || 'most'; saveConfig(); return true; },
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
  'steam:status': () => ({ running: require('./steamArt').steamRunning(), gamescope: isGamescope(), appimage: !!process.env.APPIMAGE, added: !!process.env.CARTRIDGE_FROM_STEAM || require('./steamArt').cartridgeInSteam() }),
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
  'steam:takeOver': ({ key }) => steamMgr.takeOver(key),
  'steam:refreshArt': ({ style }) => steamMgr.refreshArt(style),
  'steam:liveEnable': () => steamMgr.liveEnable(),
  // RomM on this device (0.9.15 section 1): Podman pod from RomM's own compose; secrets in romm-local.env
  'romm:localInfo': async () => {
    const rl = require('./rommLocal'), h = os.homedir();
    // 0.9.49 (owner): the choices are your games folders (the main one, those on other drives, and any found on the
    // device), each with its drive and what's in it; several can be picked. A new folder is the fallback.
    const list = mounts(), real = (x) => { try { return fs.realpathSync(x); } catch { return path.resolve(x); } };
    const folders = [];
    const add = (p, from, main = false) => {
      if (!p || !isDir(p) || folders.some((f) => f.real === real(p))) return;
      const dv = driveOf(p, list);
      folders.push({ path: p, real: real(p), from, main, drive: dv ? (dv.label === 'This device' ? 'Main Drive' : dv.label) : '', ...romsFolderStats(p) });
    };
    add(config.romsRoot, 'Your games folder', true);
    for (const r of extraRoots()) add(r, 'Games on another drive');
    try { for (const r of detectRoots().roots) add(r.path, r.source); } catch {}
    const emu = readEmuDeckSettings();
    if (emu.emulationPath) add(path.join(emu.emulationPath, 'roms'), 'EmuDeck');
    add(path.join(h, 'retrodeck', 'roms'), 'RetroDECK');
    const st = await rl.status();
    const s = config.server || {};
    return { ...st, ready: rl.readiness(), folders, newFolder: path.join(h, 'RomM'), chosen: config.rommLocal?.roms || null,
      linked: !!(config.configured && !config.localOnly && (s.localUrl || s.remoteUrl)), mine: !!config.rommLocal?.port,
      port: config.rommLocal?.port || null, lan: config.rommLocal?.port ? rl.lanUrls(config.rommLocal.port) : [] };
  },
  // Podman made ready from Cartridge (0.9.17); the device password is used once and never kept
  'romm:localPrepare': async ({ password } = {}) => {
    try { return { ok: true, ready: await require('./rommLocal').prepare({ password }, (p) => broadcast('romm-local', p)) }; }
    catch (e) { if (e.code === 'password') return { needPassword: true }; log('podman prepare failed:', e.message); throw e; }
  },
  // which console folders are in more than one picked folder (shown before setup)
  'romm:localPlan': ({ roms } = {}) => ({ conflicts: require('./rommLocal').planMounts((roms || []).filter((p) => isDir(p)), path.join(os.homedir(), '.local/share/cartridge-romm/library')).conflicts }),
  // roms: games folders picked (0.9.49); library: a new folder that will hold roms/<console> (the old way)
  'romm:localSetup': async ({ username, password, library, roms, name, keys }) => {
    const rl = require('./rommLocal');
    const dataDir = path.join(os.homedir(), '.local/share/cartridge-romm');
    roms = (roms || []).filter((p) => isDir(p));
    const r = await rl.setup({ username, password, library, roms, dataDir, keys, name, envFile: path.join(USER_DATA, 'romm-local.env'), port: config.rommLocal?.port }, (p) => broadcast('romm-local', p));
    config.rommLocal = { port: r.port, library: roms.length ? null : library, roms: roms.length ? roms : null, dataDir, name: String(name || '').slice(0, 40), at: Date.now(), boot: r.boot };
    config.server = { ...config.server, localUrl: r.base, remoteUrl: config.server.remoteUrl || '', mode: config.server.remoteUrl ? 'auto' : 'local', auth: 'password', username: r.user, password, token: '' };
    if (!config.romsRoot) config.romsRoot = roms[0] || path.join(library, 'roms');
    // the other picked folders become games folders on other drives, so downloads and the library see them too
    for (const p of roms.slice(1)) if (path.resolve(p) !== path.resolve(config.romsRoot) && !extraRoots().some((x) => path.resolve(x) === path.resolve(p))) config.extraRoots = [...(config.extraRoots || []), { path: p }];
    saveConfig();
    log('romm local: running on port', r.port, 'boot', r.boot, 'folders', roms.length || 1, 'conflicts', r.conflicts?.length || 0);
    return { ...r, lan: rl.lanUrls(r.port), romsRoot: config.romsRoot, folders: roms };
  },
  'romm:localUpdate': ({ keys } = {}) => require('./rommLocal').update({ envFile: path.join(USER_DATA, 'romm-local.env'), library: config.rommLocal?.library, roms: config.rommLocal?.roms, dataDir: config.rommLocal?.dataDir, keys, keysOnly: !!keys }),
  // which metadata keys are set (never the keys themselves)
  'romm:localKeys': () => { const k = require('./rommLocal').keysOf(require('./rommLocal').readEnv(path.join(USER_DATA, 'romm-local.env'))); return { igdb: !!(k.igdbId && k.igdbSecret), ss: !!(k.ssUser && k.ssPass) }; },
  // Welcome's scan (0.9.16): games already in Steam that Cartridge didn't add, per console (C7 take over)
  'setup:steamTheirs': () => {
    let o; try { o = steamMgr.overview(); } catch { return { total: 0, consoles: [] }; }
    const by = {};
    for (const g of o.games || []) if (g.inSteam && !g.ours && g.file && g.appid) by[g.console] = (by[g.console] || 0) + 1;
    return { total: Object.values(by).reduce((a, b) => a + b, 0), consoles: Object.entries(by).map(([key, n]) => ({ key, n })) };
  },
  // Welcome (0.9.15 onboarding): what's already here, and the "Get your emulators" choices
  'welcome:state': async () => {
    const h = os.homedir(), ex = (p) => fs.existsSync(path.join(h, p));
    let live = { on: false, flag: false }; try { live = await steamMgr.liveInfo(); } catch {}
    const steamFound = !!steamMgr.steamRoots?.().length;
    return {
      emudeck: ex('.config/EmuDeck/settings.sh') || ex('emudeck'),
      retrodeck: ex('.var/app/net.retrodeck.retrodeck') || ex('retrodeck'),
      steam: steamFound, live, gamescope: isGamescope(), appimage: !!process.env.APPIMAGE,
      inSteam: !!process.env.CARTRIDGE_FROM_STEAM || require('./steamArt').cartridgeInSteam(), fromSteam: !!process.env.CARTRIDGE_FROM_STEAM,
      host: os.hostname(), device: deviceKind(),
    };
  },
  'welcome:emudeck': () => require('./welcome').getEmuDeck((p) => broadcast('welcome-progress', { what: 'emudeck', ...p })).then((r) => { log('welcome: EmuDeck app downloaded', r.version); return r; }),
  'welcome:flatpak': ({ password } = {}) => require('./welcome').getFlatpak(password).then((r) => { log('welcome: Flatpak installed'); return r; }),
  'welcome:retrodeck': () => require('./welcome').getRetroDeck((p) => broadcast('welcome-progress', { what: 'retrodeck', ...p })).then((r) => { log('welcome: RetroDECK installed'); return r; }),
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
  // the UI's own lines in the log (0.9.34: what the pad did after a game, for device reports)
  'app:log': ({ text }) => { log('[ui]', String(text || '').slice(0, 600)); return true; },
  'steam:play': async ({ romId }) => { const r = await steamMgr.play(Number(romId)); watchGameRun(Number(romId)); return r; },
  'steam:addToCollections': ({ romId, names }) => steamMgr.addRomToCollections(Number(romId), names || []),
  // HowLongToBeat times when RomM has none: name plus release year, cached in hltb.json
  'hltb:lookup': ({ name, year }) => hltbSvc.forGame({ name: String(name || ''), year: Number(year) || null }),
  'steam:played': () => { try { return steamMgr.played(); } catch { return {}; } },
  'steam:setConfig': (patch) => { config.steam = { ...(config.steam || {}), ...patch }; saveConfig(); return config.steam; },
  'steam:setPath': ({ romId, path: p }) => { if (!isDir(p) && !fs.existsSync(p)) throw new Error('That folder does not exist'); marks[romId] = { ...(marks[romId] || { at: Date.now() }), path: p }; saveMarks(); return true; },
  'app:startGame': () => { const g = startGame; startGame = null; return g; },
  // Steam's on-screen keyboard (0.9.17): steam://open/keyboard, which Steam handles in Game Mode as Steam + X does
  'steam:keyboard': () => {
    if (!isGamescope()) return false;
    const env = { ...process.env }; for (const k of ['LD_PRELOAD', 'LD_LIBRARY_PATH']) delete env[k];
    try { require('child_process').spawn('xdg-open', ['steam://open/keyboard?Mode=0'], { detached: true, stdio: 'ignore', env }).on('error', () => {}).unref(); return true; } catch { return false; }
  },
  'update:get': () => ({ ...updateState, current: versionName(), supported: !!autoUpdater }),
  'update:check': async () => { if (!autoUpdater) throw new Error('Updates work in the AppImage build only'); if (config.updateHold) { delete config.updateHold; saveConfig(); autoUpdater.autoDownload = true; } await autoUpdater.checkForUpdates(); return updateState; },
  'update:install': () => { if (updateState.state === 'ready') autoUpdater.quitAndInstall(true, true); },
  // Roll back (0.9.17): Cartridge's earlier releases on GitHub, and one of them in place of this AppImage
  'update:releases': async () => {
    const r = await webFetch('https://api.github.com/repos/abdu2304/cartridge/releases?per_page=20', { headers: { 'User-Agent': 'Cartridge', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (r?.ok) return (await r.json()).filter((x) => !x.draft && (x.assets || []).some((a) => a.name === 'Cartridge-x86_64.AppImage')).map((x) => ({ tag: x.tag_name, name: String(x.name || x.tag_name).replace(/^Cartridge\s+/i, ''), date: x.published_at, current: x.tag_name === 'v' + app.getVersion() }));
    // GitHub's API limit: the releases page instead
    const p = await webFetch('https://github.com/abdu2304/cartridge/releases', { headers: { 'User-Agent': 'Mozilla/5.0 Cartridge' }, signal: AbortSignal.timeout(20000) });
    if (!p.ok) throw new Error(`GitHub answered ${p.status}. Try again in a while.`);
    const tags = [...new Set([...(await p.text()).matchAll(/\/abdu2304\/cartridge\/releases\/tag\/(v[\d.]+)/g)].map((m) => m[1]))];
    return tags.map((t) => ({ tag: t, name: t.slice(1), date: '', current: t === 'v' + app.getVersion() }));
  },
  'update:rollback': async ({ tag }) => {
    const file = process.env.APPIMAGE;
    if (!file || !app.isPackaged) throw new Error('Rolling back works in the AppImage only.');
    if (!/^v\d+(\.\d+){1,3}$/.test(tag || '')) throw new Error('That isn’t a Cartridge release.');
    const tmp = file + '.cartridge-new';
    let got = 0;
    await downloadTo(`https://github.com/abdu2304/cartridge/releases/download/${tag}/Cartridge-x86_64.AppImage`, tmp, { abort: new AbortController() }, (n) => { got += n; broadcast('update', { ...updateState, state: 'rollback', got }); }, { plain: true });
    if (fs.statSync(tmp).size < 50e6) { fs.rmSync(tmp, { force: true }); throw new Error('The download was incomplete. Try again.'); }
    fs.chmodSync(tmp, 0o755); fs.renameSync(tmp, file);
    config.updateHold = tag; saveConfig(); // stays on this version until Check for updates
    log('rolled back to', tag);
    // started again with the same arguments (Steam's launcher passes its own)
    setTimeout(() => { app.relaunch({ execPath: file, args: process.argv.slice(1) }); app.exit(0); }, 600);
    return true;
  },
  'app:info': () => ({ version: versionName(), number: app.getVersion(), gamescope: isGamescope(), userData: USER_DATA, gpu: useGpu, home: os.homedir(), hostname: os.hostname() }),
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
  'app:graphics': () => ({ mode: useGpu ? 'hardware' : 'software', setting: config.graphics, status: app.getGPUFeatureStatus?.(), trial: gpuTrial && !config.gpuKept, auto: autoSoftware ? 'software' : 'gpu' }),
  'app:gpuKeep': ({ keep }) => {
    if (keep) { config.gpuKept = true; saveConfig(); log('gpu trial kept'); return true; }
    config.graphics = 'auto'; config.gpuKept = false; saveConfig(); log('gpu trial declined, back to auto'); relaunch(); return false;
  },
  'app:fullscreen': () => win.setFullScreen(!win.isFullScreen()),
  'app:clearCache': async () => { await fsp.rm(IMG_CACHE, { recursive: true, force: true }); await fsp.rm(HERO_DIR, { recursive: true, force: true }); heroCache = {}; await fsp.rm(HERO_FILE, { force: true }); return true; },
};

// ---- Background jobs (0.9.32, owner: "if I exit the menu it shouldn't cancel, it should move to Downloads").
// Nothing here was ever stopped by leaving a screen: these run in this process. What was missing is a place
// that remembers them: each long task is a job (bg-job events, jobs:list) the Downloads page lists and any
// screen picks up again when it opens. Progress comes from the events each task already sends.
const bgJobs = new Map(), jobSent = new Map();
function bgJob(key, o) {
  const prev = bgJobs.get(key);
  if (!prev && !o.state) return; // progress for a job that isn't one (or has gone)
  const j = { ...(prev || { key, at: Date.now() }), ...o, upd: Date.now() };
  bgJobs.set(key, j);
  // progress at most every 300 ms; starts and ends at once
  const now = Date.now();
  if (o.state || now - (jobSent.get(key) || 0) > 300) { jobSent.set(key, now); broadcast('bg-job', j); }
  if (o.state === 'done' || o.state === 'error') setTimeout(() => { if (bgJobs.get(key)?.upd === j.upd) { bgJobs.delete(key); jobSent.delete(key); broadcast('bg-job', { key, gone: true }); } }, 20000);
}
async function asJob(info, fn) {
  bgJob(info.key, { ...info, state: 'run', pct: null, text: '', error: '' });
  try { const r = await fn(); bgJob(info.key, { state: 'done', pct: 100, text: '' }); return r; }
  catch (e) { bgJob(info.key, { state: 'error', error: e.message || String(e) }); throw e; }
}
const emuLabel = (id) => require('./emulators').EMU[String(id || '').split('@')[0]]?.label || String(id || 'Emulator');
const romName = (id) => romIndexMain().get(Number(id))?.name || 'Game';
let customJob = '';
const JOBS = {
  'emuup:run': (a) => ({ key: 'emu:' + (a.path || a.fp), kind: a.force ? 'Emulator Download' : 'Emulator Update', title: emuLabel(a.id), emu: a.id, icon: 'mdiUpdate' }),
  'emuget:install': (a) => ({ key: `get:${a.key}:${a.id}`, kind: 'Emulator', title: emuLabel(a.id), emu: a.id, icon: 'mdiDownload' }),
  'emuget:custom': (a) => { const repo = require('./customEmu').repoOf(a.link) || String(a.link || ''); customJob = 'custom:' + repo; return { key: customJob, kind: 'Emulator from GitHub', title: repo.split('/').pop() || repo, icon: 'mdiGithub' }; },
  'shadv:install': (a) => ({ key: 'shadv:' + a.tag, kind: 'shadPS4 Version', title: String(a.tag), emu: 'shadps4', icon: 'mdiDownload' }),
  'ps3up:install': (a) => ({ key: 'ps3:' + a.romId, kind: 'Game Update', title: romName(a.romId), romId: Number(a.romId), icon: 'mdiPackageUp' }),
  'pkg:install': (a) => ({ key: 'pkg:' + a.romId, kind: 'Install', title: romName(a.romId), romId: Number(a.romId), icon: 'mdiPackageDown' }),
  'bios:download': (a) => ({ key: 'bios:' + (a.slug || a.platformId), kind: 'BIOS and Firmware', title: String(a.slug || '').toUpperCase(), icon: 'mdiChip' }),
  'sync:install': () => ({ key: 'sync:install', kind: 'Install', title: 'Syncthing', icon: 'mdiSync' }),
};
for (const [ch, info] of Object.entries(JOBS)) {
  const fn = handlers[ch];
  if (fn) handlers[ch] = (a = {}) => { let i; try { i = info(a || {}); } catch { return fn(a); } return asJob(i, () => fn(a)); };
}
// the progress each task already sends, onto its job
const JOB_EVENTS = {
  'emu-update': (m) => ['emu:' + m.path, { pct: m.pct, text: m.text || '' }],
  'emuget-progress': (m) => [`get:${m.key}:${m.id}`, { pct: m.pct }],
  'emuget-custom': (m) => [customJob, { pct: m.pct }],
  'shadv-progress': (m) => ['shadv:' + m.tag, { pct: m.pct }],
  'ps3-update': (m) => ['ps3:' + m.romId, { pct: m.pct, text: m.state === 'installing' ? `Installing ${m.version || ''}`.trim() : m.version ? `Update ${m.version}` : '' }],
  'pkg-progress': (m) => ['pkg:' + m.romId, { pct: m.pct, text: m.text || m.step || '' }],
  'sync-install': (m) => ['sync:install', { pct: m.pct }],
};
const sendRaw = broadcast;
broadcast = (ch, data) => { sendRaw(ch, data); const f = JOB_EVENTS[ch]; if (f && data) { try { const [k, o] = f(data); if (k && bgJobs.has(k)) bgJob(k, Object.fromEntries(Object.entries(o).filter(([, v]) => v != null))); } catch {} } };
handlers['jobs:list'] = () => [...bgJobs.values()];
handlers['emu:profiles'] = () => require('./emuProfiles').all(); // 0.9.48: what Cartridge knows per emulator (diagnostics)
handlers['cide:map'] = () => { const C = require('./cide'); return C.map(require('./cee').consoleKeys()); }; // 0.9.51: each console's ID kinds and readers, or why it has none (diagnostics)
handlers['cee:emulators'] = () => require('./cee').emulators(); // 0.9.49 CEE: every emulator, its install kinds, launch lines, links
handlers['cee:coverage'] = () => require('./cee').coverage(); // every console RomM can send and how it's played
handlers['emu:startCheck'] = ({ id, path: p }) => require('./emuStart').check(id, p);
handlers['scheduler:status'] = () => scheduler.status(); // 0.9.48: the background jobs and whether they wait for a game
// the performance overlay (0.9.48, Settings → About): CPU since the last ask, as a share of one core, and memory, over all of
// Cartridge's processes (Electron's own figures, nothing sent anywhere)
let perfPrev = null;
handlers['perf:sample'] = () => {
  const m = app.getAppMetrics(), t = Date.now();
  const cpu = m.reduce((a, x) => a + (x.cpu?.cumulativeCPUUsage || 0), 0), mem = m.reduce((a, x) => a + (x.memory?.workingSetSize || 0), 0);
  const pct = perfPrev && t > perfPrev.t ? ((cpu - perfPrev.cpu) / ((t - perfPrev.t) / 1000)) * 100 : null;
  perfPrev = { cpu, t };
  return { cpu: pct, memMB: Math.round(mem / 1024), procs: m.length, playing: !!(gameFocus.away || runOn) };
};

for (const [ch, fn] of Object.entries(handlers)) {
  ipcMain.handle(ch, async (_e, arg) => {
    try { return { ok: true, data: await fn(arg) }; }
    catch (e) { return { ok: false, error: e.message || String(e) }; }
  });
}

setTimeout(() => { try { watchJoin(); } catch {} }, 15000);
// shadPS4's Recently Launched (0.9.29, owner): shadPS4 keeps one log that each run replaces, so each run is
// noted here (shad-runs.json, newest first, 50 kept) while "show which version ran a game" is on. Read only.
const SHAD_RUNS_FILE = path.join(USER_DATA, 'shad-runs.json');
function noteShadRun() {
  if (!(config.steam || {}).shadProof) return;
  let last; try { last = require('./shadVersions').lastRun(os.homedir(), emuRootsAll().map((r) => path.join(r, 'storage', 'shadps4'))); } catch { return; }
  if (!last?.at) return;
  const runs = loadJson(SHAD_RUNS_FILE, []);
  if (runs.some((x) => x.at === last.at && x.file === last.file)) return;
  const ps4 = [...romIndexMain().values()].filter((r) => /ps4/i.test(`${r.platform_slug} ${r.platform_fs_slug}`));
  const rom = last.serial ? ps4.find((r) => [r.fs_name, ...(r.files || []).map((f) => f.file_name), installedMap[r.id] && installedMap[r.id] !== MARKED ? installedMap[r.id] : ''].join(' ').toUpperCase().includes(last.serial)) : null;
  runs.unshift({ at: last.at, file: last.file, version: last.version, nightly: !!last.nightly, serial: last.serial || '', romId: rom?.id || null, name: rom?.name || '' });
  saveJson(SHAD_RUNS_FILE, runs.slice(0, 50));
  broadcast('shad-runs', {});
}
setInterval(() => { try { noteShadRun(); } catch {} }, 60000);
// a GPU trial nobody confirmed (a blank window can't be answered) goes back to Auto and restarts
if (gpuTrial) setTimeout(() => { if (config.gpuKept || config.graphics !== 'gpu') return; log('gpu trial not confirmed, back to auto'); config.graphics = 'auto'; saveConfig(); relaunch(); }, GPU_TRIAL_MS);
app.whenReady().then(() => {
  require('./detect').warmLoginPath(); // in the background: emulator lookups use it, and waiting for it froze the app
  // readable by the page's canvas too (Theme from this game reads a cover's colours)
  protocol.handle('romimg', async (req) => { const r = await handleImage(req); try { r.headers.set('Access-Control-Allow-Origin', '*'); } catch {} return r; });
  createWindow();
  if (library) computeInstalled();
  win.webContents.once('did-finish-load', () => {
    if (config.configured && (config.sync.onLaunch || !library)) syncLibrary().catch(() => {});
    setTimeout(() => trophySvc.start().catch((e) => log('trophies failed', e.message)), 1500);
  });
  // image pipeline (0.9.48): the picture cache stays under 1.5 GB; the oldest pictures go first and come back from RomM
  // or SteamGridDB if they're shown again. Looked at once a day, never during a game
  // every game's cover kept small for browsing away from the server (0.9.52), every 6 hours, never during a game
  scheduler.add('library-art', { every: 6 * 3600e3, firstAfter: 3 * 60e3, deferWhilePlaying: true, run: () => libraryArt() });
  scheduler.add('image-cache-trim', { every: 24 * 3600e3, firstAfter: 5 * 60e3, deferWhilePlaying: true, run: () => trimImageCache(1.5 * 1024 ** 3) });
  // the library sync (every hour by default), looked at each minute; it waits while a game runs (0.9.48, owner)
  scheduler.add('library-sync', { every: 60e3, firstAfter: 60e3, deferWhilePlaying: true,
    due: () => { const every = (config.sync.everyMinutes || 0) * 60e3; return !!(config.configured && every && library && Date.now() - library.syncedAt > every); },
    run: () => syncLibrary().catch(() => {}) });
  win.on('focus', () => { if (library) computeInstalled(); });
  watchGamescopeFocus();
  setupUpdater();
  // Safety net if the display could not be read up front: a big window drawn in software is
  // unusably slow, so restart once with the GPU. A user or crash-chosen "software" is respected.
  setTimeout(() => {
    if (useGpu || process.env.CARTRIDGE_BIG === '1' || process.argv.includes('--disable-gpu')) return;
    const [w, h] = win.getContentSize();
    if (w >= 2500 || h >= 1400) { log('big window in software mode', w + 'x' + h, 'restarting with the GPU'); process.env.CARTRIDGE_BIG = '1'; relaunch(); }
  }, 2500);
});
app.on('child-process-gone', (_e, d) => {
  log('child gone', d.type, d.reason, d.exitCode);
  // If the GPU dies early, remember it and restart without the GPU so the window is never blank
  if (d.type === 'GPU' && useGpu && d.reason !== 'clean-exit' && Date.now() - startedAt < 20000) {
    log('gpu failed at startup, relaunching in software mode for this launch');
    const args = process.argv.slice(1).concat('--disable-gpu');
    if (process.env.APPIMAGE) app.relaunch({ execPath: process.env.APPIMAGE, args }); else app.relaunch({ args });
    app.exit(0);
  }
});
app.on('window-all-closed', () => app.quit());
// Quit means gone (0.9.3): Steam counts Cartridge as running until every process it started has
// ended, and one left behind kept SteamOS slow until a restart. Stop the work in flight, then exit
// within 3 s whatever is still pending. The Steam helper runs outside Cartridge and isn't touched.
let quitting = false;
app.on('before-quit', () => {
  if (quitting) return;
  quitting = true;
  log('quit');
  setTimeout(() => app.exit(0), 3000).unref?.();
  try { trophySvc.stop(); } catch {}
  for (const it of queue) try { it.abort?.abort(); } catch {}
  for (const u of uploads.values()) try { u.abort.abort(); } catch {}
  try { verifyRun?.ac.abort(); } catch {}
  if (fetchAll) fetchAll.stop = true;
});
// Steam's Exit game (and a shutdown) ask politely first: treat it like Quit
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { if (ignoreSignal(sig)) return; log('got', sig); app.quit(); setTimeout(() => app.exit(0), 3000).unref?.(); });
