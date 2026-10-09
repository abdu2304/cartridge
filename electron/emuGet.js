// Pick your own emulators (0.9.17, owner: a third choice next to EmuDeck and RetroDECK, also in
// Settings → Emulators). Owner-approved exception to "never downloads emulators": only what the user
// picks, only from the emulator's own GitHub releases (its Linux AppImage, into ~/Applications, where
// EmuDeck keeps them and Cartridge already looks) or, for emulators without an AppImage, its Flathub
// Flatpak installed for this user. Nothing is installed without a press.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const { REPOS, latestRelease } = require('./emuUpdates');

// console -> emulators: EMU ids (emulators.js), with where they come from. 0.9.19: checked against
// EmuDeck's install scripts (the same releases): Flycast, RMG, ares, MAME, Supermodel, ScummVM, Xemu
// come from Flathub as EmuDeck installs them; an AppImage that can't be found falls back to the
// emulator's Flatpak (fp) when it has one. name: the AppImage's file name, kept for good (updates
// replace it in place), the names EmuDeck and ES-DE look for.
const GH = (id, name, extra = {}) => ({ id, how: 'appimage', name, ...REPOS[id], ...extra });
const FP = (id, fp) => ({ id, how: 'flatpak', fp });
const MORE = {
  rmg: { repo: 'Rosalie241/RMG', asset: /x86_64\.AppImage$|\.AppImage$/i },
};
const CATALOG = [
  { key: 'psx', name: 'PlayStation', emus: [GH('duckstation', 'DuckStation.AppImage'), FP('retroarch', 'org.libretro.RetroArch')] },
  { key: 'ps2', name: 'PlayStation 2', emus: [GH('pcsx2', 'pcsx2-Qt.AppImage', { fp: 'net.pcsx2.PCSX2' })] },
  { key: 'ps3', name: 'PlayStation 3', emus: [GH('rpcs3', 'rpcs3.AppImage', { fp: 'net.rpcs3.RPCS3' })] },
  { key: 'ps4', name: 'PlayStation 4', emus: [GH('shadps4', 'Shadps4-qt.AppImage')] },
  { key: 'ps5', name: 'PlayStation 5', emus: [GH('sharpemu', 'SharpEmu'), GH('kytyps5', 'KytyPS5')] },
  { key: 'psp', name: 'PSP', emus: [FP('ppsspp', 'org.ppsspp.PPSSPP')] },
  { key: 'psvita', name: 'PS Vita', emus: [GH('vita3k', 'Vita3K.AppImage')] },
  { key: 'gc', name: 'GameCube and Wii', emus: [FP('dolphin', 'org.DolphinEmu.dolphin-emu'), FP('primehack', 'io.github.shiiion.primehack')] },
  { key: 'wiiu', name: 'Wii U', emus: [GH('cemu', 'Cemu.AppImage', { fp: 'info.cemu.Cemu' })] },
  { key: 'switch', name: 'Switch', emus: [GH('eden', 'Eden.AppImage', { fp: 'dev.eden_emu.eden' }), GH('ryujinx', 'Ryujinx.AppImage', { fp: 'io.github.ryubing.Ryujinx' })] },
  { key: 'n3ds', name: 'Nintendo 3DS', emus: [GH('azahar', 'azahar.AppImage', { fp: 'org.azahar_emu.Azahar' })] },
  { key: 'nds', name: 'Nintendo DS', emus: [FP('melonds', 'net.kuribo64.melonDS')] },
  { key: 'gba', name: 'Game Boy Advance', emus: [GH('mgba', 'mGBA.AppImage', { fp: 'io.mgba.mGBA' })] },
  { key: 'n64', name: 'Nintendo 64', emus: [FP('rmg', 'com.github.Rosalie241.RMG'), FP('ares', 'dev.ares.ares')] },
  { key: 'xbox', name: 'Xbox', emus: [FP('xemu', 'app.xemu.xemu')] },
  // 0.9.21 (owner: Xenia installed but listed as Xenia Edge not installed): Xenia Canary first, Edge as the other
  { key: 'xbox360', name: 'Xbox 360', emus: [GH('xenia', 'xenia_canary', { binary: true }), GH('xeniaedge', 'xenia_edge.AppImage')] },
  { key: 'dreamcast', name: 'Dreamcast', emus: [FP('flycast', 'org.flycast.Flycast')] },
  { key: 'saturn', name: 'Saturn', emus: [FP('ares', 'dev.ares.ares'), FP('retroarch', 'org.libretro.RetroArch')] },
  { key: 'arcade', name: 'Arcade', emus: [FP('mame', 'org.mamedev.MAME'), FP('supermodel', 'com.supermodel3.Supermodel')] },
  { key: 'scummvm', name: 'ScummVM', emus: [FP('scummvm', 'org.scummvm.ScummVM')] },
  { key: 'retro', name: 'Retro consoles (NES to N64, Mega Drive, PC Engine and more)', emus: [FP('retroarch', 'org.libretro.RetroArch'), FP('ares', 'dev.ares.ares')] },
];
let appsDir = null; // set from config: <drive>/Emulation/emulators when the user picked a drive (0.9.17)
// ES-DE's console folder names, for the Emulation folder Cartridge makes on the drive the user picks
const ESDE = ['3do', 'arcade', 'atari2600', 'dreamcast', 'gamecube', 'gb', 'gba', 'gbc', 'genesis', 'mastersystem', 'megacd', 'n3ds', 'n64', 'nds', 'neogeo', 'nes', 'pcengine', 'ps2', 'ps3', 'ps4', 'psp', 'psvita', 'psx', 'saturn', 'segacd', 'snes', 'switch', 'wii', 'wiiu', 'xbox', 'xbox360'];
const APPS = () => appsDir || path.join(os.homedir(), 'Applications');
const setAppsDir = (d) => { appsDir = d || null; };
function plainEnv() { const env = { ...process.env }; for (const k of ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'APPDIR', 'APPIMAGE', 'ARGV0', 'OWD']) delete env[k]; return env; }
const hasFlatpak = () => { try { execFileSync('sh', ['-c', 'command -v flatpak'], { stdio: 'ignore', env: plainEnv() }); return true; } catch { return false; } };

// the newest AppImage of one emulator (GitHub API, as Updates reads it)
async function release(e, opts) {
  const r = await latestRelease(e.id, { ...opts, spec: { repo: e.repo, asset: e.asset, tag: e.tag, pre: e.pre, forge: e.forge, first: e.first, zipped: e.zipped, dirBuild: e.dirBuild } });
  // (Xenia Canary's Linux build is a .tar.gz with the program in it, not an AppImage)
  if (!r) throw new Error(`No Linux build in ${e.repo}'s newest release.`);
  return r;
}
// AppImage into the emulators folder (~/Applications unless a drive was picked) under its lasting name
// (0.9.19: never the release's versioned name, which an update would leave out of date); never over a
// file that's there
async function getAppImage(e, download, opts = {}) {
  const rel = await release(e, opts);
  // a folder build (0.9.37, PS5): unpacked into its own folder there, its program made runnable
  if (e.dirBuild) {
    const U = require('./emuUpdates'), dir = path.join(APPS(), e.dirBuild.dir), prog = path.join(dir, e.dirBuild.program);
    if (fs.existsSync(prog)) return { path: prog, version: rel.version, already: true };
    if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error(`${e.dirBuild.dir} is already in ${APPS()} without its program. Cartridge leaves it as it is.`);
    fs.mkdirSync(APPS(), { recursive: true });
    const z = dir + '.cartridge-dl';
    try {
      // 0.9.63 (owner: KytyPS5 "just says Try again"): a short download is fetched once more by itself, and the message
      // says how much arrived, so the log shows a dropped connection apart from a changed release
      const got = async () => { await download(rel.url, z, rel.size); return fs.statSync(z).size; };
      let n = await got();
      if (rel.size && n !== rel.size) { fs.rmSync(z, { force: true }); n = await got(); }
      if (rel.size && n !== rel.size) throw new Error(`The download stopped early (${(n / 1048576).toFixed(1)} of ${(rel.size / 1048576).toFixed(1)} MB) twice. Check the connection and try again.`);
      await U.layFolder(z, dir, rel.name);
    }
    catch (err) { fs.rmSync(dir, { recursive: true, force: true }); throw err; }
    finally { fs.rmSync(z, { force: true }); }
    if (!fs.existsSync(prog)) { const had = fs.readdirSync(dir).slice(0, 8).join(', '); fs.rmSync(dir, { recursive: true, force: true }); throw new Error(`The download had no ${e.dirBuild.program} in it (it held: ${had || 'nothing'}).`); }
    for (const n of fs.readdirSync(dir)) { const f = path.join(dir, n); try { if (fs.statSync(f).isFile() && U.looksRunnable(f, n) && !/\.(so|dll)(\.|$)/i.test(n)) fs.chmodSync(f, 0o755); } catch {} }
    fs.chmodSync(prog, 0o755);
    if (!U.looksRunnable(prog, e.dirBuild.program)) throw new Error(`${e.dirBuild.program} in the download isn’t a Linux program this device can run.`);
    return { path: prog, version: rel.version };
  }
  const name = String(e.name || rel.name).replace(/[\\/]/g, '_');
  const dest = path.join(APPS(), e.binary || /\.AppImage$/i.test(name) ? name : name + '.AppImage'); // binary: a plain program (Xenia Canary's Linux build)
  if (fs.existsSync(dest)) return { path: dest, version: rel.version, already: true };
  fs.mkdirSync(APPS(), { recursive: true });
  const tmp = dest + '.cartridge-new';
  if (rel.zipped) {
    const z = dest + '.cartridge-zip';
    const U = require('./emuUpdates');
    try { await download(rel.url, z, rel.size); if (/\.(tar\.gz|tgz)$/i.test(rel.name || rel.url)) await U.fileFromTar(z, tmp, rel.zipped); else await U.appImageFromZip(z, tmp, rel.zipped); } finally { fs.rmSync(z, { force: true }); }
  } else {
    await download(rel.url, tmp, rel.size);
    if (rel.size && fs.statSync(tmp).size !== rel.size) { fs.rmSync(tmp, { force: true }); throw new Error('The download was incomplete. Try again.'); }
  }
  // never put a broken download in place (0.9.24): an AppImage must be one, a program a real program
  if (!require('./emuUpdates').looksRunnable(tmp, rel.name || name)) { fs.rmSync(tmp, { force: true }); throw new Error('What came down wasn’t a working program. Try again later.'); }
  const got = { ...rel, id: e.id, fallback: rel.fallback || e.fallback };
  await require('./emuUpdates').fitGlibc(tmp, got, (url, to) => download(url, to), 'nothing was installed'); // 0.9.47
  await require('./emuStart').ensureStarts(e.id, tmp, got, (url, to) => download(url, to), 'nothing was installed'); // 0.9.49: it must really start
  fs.chmodSync(tmp, 0o755); fs.renameSync(tmp, dest);
  return { path: dest, version: got.version, fellBack: got.fellBack || null };
}
// a Flatpak from Flathub for this user (no password); flatpak prints "NN%" as it goes
async function getFlatpak(fp, onProgress = () => {}) {
  if (!hasFlatpak()) await ensureFlatpak();
  return new Promise((resolve, reject) => {
    // 0.9.38: not execFileSync any more: it held Electron's main thread (the whole app) for up to a minute
    const remote = () => new Promise((ok) => { const r = spawn('flatpak', ['remote-add', '--user', '--if-not-exists', 'flathub', 'https://dl.flathub.org/repo/flathub.flatpakrepo'], { stdio: 'ignore', env: plainEnv() }); const t = setTimeout(() => r.kill(), 60000); r.on('error', () => ok()); r.on('close', () => { clearTimeout(t); ok(); }); });
    remote().then(() => {
    const p = spawn('flatpak', ['install', '--user', '-y', '--noninteractive', 'flathub', fp], { env: plainEnv() });
    let tail = '';
    const read = (b) => { const s = String(b); tail = (tail + s).slice(-2000); const all = [...s.matchAll(/(\d{1,3})%/g)]; if (all.length) onProgress(Math.min(100, Number(all[all.length - 1][1]))); };
    p.stdout.on('data', read); p.stderr.on('data', read);
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve({ fp }) : reject(new Error(`It didn't install: ${(tail.trim().split('\n').pop() || 'flatpak failed').slice(0, 200)}`))));
    });
  });
}

// 0.9.37 (owner: if Flatpak isn't there, install it in the background): Flatpak itself is a system package, so
// it goes in through the system's package manager. Image-based systems (rpm-ostree, SteamOS) ship it, so there
// it's only Flathub that can be missing, added for the user.
// 0.9.38 (owner: Cartridge hung installing Flatpak): pkexec waited for the desktop's password window, which
// never shows in Game Mode or on a system without a polkit agent. Now the password is typed in Cartridge
// (like RomM on this device), handed to sudo -S once and never kept, with time limits so nothing waits forever.
const has = (bin) => { try { execFileSync('sh', ['-c', `command -v ${bin}`], { stdio: 'ignore', env: plainEnv() }); return true; } catch { return false; } };
function flatpakPlan() {
  if (hasFlatpak()) return null;
  if (has('rpm-ostree')) return { why: 'This system is image-based: add Flatpak with rpm-ostree install flatpak, then restart.' };
  const PM = [['apt-get', ['apt-get', 'install', '-y', 'flatpak']], ['dnf', ['dnf', 'install', '-y', 'flatpak']], ['zypper', ['zypper', '--non-interactive', 'install', 'flatpak']], ['pacman', ['pacman', '-S', '--noconfirm', '--needed', 'flatpak']], ['eopkg', ['eopkg', '-y', 'install', 'flatpak']], ['xbps-install', ['xbps-install', '-y', 'flatpak']]];
  const pm = PM.find(([b]) => has(b));
  if (!pm) return { why: 'No package manager Cartridge knows was found. Install Flatpak the way your system installs programs.' };
  if (!has('sudo')) return { why: `Install Flatpak with: ${pm[1].join(' ')} (as root)` };
  return { cmd: pm[1], pm: pm[0] };
}
let flatpakRun = null;
const FP_LIMIT = 20 * 60e3, FP_QUIET = 4 * 60e3; // the whole install, and silence from the package manager
function ensureFlatpak(onLine = () => {}, password = null) {
  if (hasFlatpak()) return Promise.resolve({ already: true });
  if (flatpakRun) return flatpakRun;
  const plan = flatpakPlan();
  if (!plan?.cmd) return Promise.reject(new Error(`Flatpak isn't installed. ${plan?.why || ''}`.trim()));
  const by = `Install it with: sudo ${plan.cmd.join(' ')}`;
  if (password == null) return Promise.reject(new Error(`Flatpak isn't installed, and installing it needs your password. ${by}`));
  flatpakRun = new Promise((resolve, reject) => {
    const env = { ...plainEnv(), DEBIAN_FRONTEND: 'noninteractive' };
    const p = spawn('sudo', ['-S', '-k', '-p', '', '--', ...plan.cmd], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    p.stdin.on('error', () => {}); p.stdin.end(String(password) + '\n');
    let tail = '', done = false;
    const stop = (why) => { if (done) return; done = true; try { p.kill('SIGTERM'); } catch {} reject(new Error(`${why} ${by}`)); };
    const whole = setTimeout(() => stop('Installing Flatpak took too long, so Cartridge stopped it.'), FP_LIMIT);
    let quiet = setTimeout(() => stop('The package manager stopped answering (it may be waiting for another install to finish).'), FP_QUIET);
    const read = (b) => { const t = String(b); tail = (tail + t).slice(-1500); clearTimeout(quiet); quiet = setTimeout(() => stop('The package manager stopped answering (it may be waiting for another install to finish).'), FP_QUIET); const l = t.trim().split('\n').pop(); if (l) onLine(l.slice(0, 120)); };
    p.stdout.on('data', read); p.stderr.on('data', read);
    p.on('error', (e) => { clearTimeout(whole); clearTimeout(quiet); if (!done) { done = true; reject(new Error(`Flatpak couldn't be installed: ${e.message}. ${by}`)); } });
    p.on('close', (code) => {
      clearTimeout(whole); clearTimeout(quiet);
      if (done) return; done = true;
      if (code === 0 && hasFlatpak()) return resolve({ installed: true, pm: plan.pm });
      if (/incorrect password|sorry, try again|no password was provided|a password is required/i.test(tail)) return reject(new Error('That password wasn’t right, so Flatpak wasn’t installed. Try again.'));
      if (/not in the sudoers|not allowed to run sudo/i.test(tail)) return reject(new Error(`This account can’t install system programs. ${by}`));
      reject(new Error(`Flatpak couldn't be installed: ${(tail.trim().split('\n').pop() || 'the package manager failed').slice(0, 160)}. ${by}`));
    });
  }).finally(() => { flatpakRun = null; });
  return flatpakRun;
}

module.exports = { CATALOG, MORE, APPS, setAppsDir, ESDE, getAppImage, getFlatpak, release, hasFlatpak, flatpakPlan, ensureFlatpak };
