// The welcome's "Get your emulators" step (0.9.15 onboarding). Owner-approved exception to "never
// downloads emulators": only when the user picks it, Cartridge fetches EmuDeck's official app the way
// EmuDeck's own install.sh does (latest emudeck-electron release, ~/Applications/EmuDeck.AppImage,
// chmod +x, run it), or installs RetroDECK from Flathub for this user. EmuDeck or RetroDECK then
// install the emulators; Cartridge never installs one itself.
const fs = require('fs');
const webFetch = require('./webFetch');
const path = require('path');
const os = require('os');
const { spawn, execFileSync } = require('child_process');

const RETRODECK = 'net.retrodeck.retrodeck';

// a child that isn't ours: none of Cartridge's AppImage or Steam runtime variables
function plainEnv() {
  const env = { ...process.env };
  for (const k of ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'APPDIR', 'APPIMAGE', 'ARGV0', 'OWD', 'CARTRIDGE_FROM_STEAM']) delete env[k];
  return env;
}
function start(cmd, args) {
  const p = spawn(cmd, args, { detached: true, stdio: 'ignore', env: plainEnv(), cwd: os.homedir() });
  p.on('error', () => {});
  p.unref();
}
const has = (bin) => { try { execFileSync('sh', ['-c', `command -v ${bin}`], { stdio: 'ignore' }); return true; } catch { return false; } };

// EmuDeck's install.sh: the release's .AppImage asset (arm64 only on ARM)
function pickAsset(release, arch = process.arch) {
  const all = (release?.assets || []).filter((a) => /\.AppImage$/i.test(a.name || ''));
  const arm = arch === 'arm64';
  return all.find((a) => /arm64/i.test(a.name) === arm) || null;
}

async function getEmuDeck(onProgress = () => {}, { fetchImpl = webFetch, home = os.homedir(), run = true } = {}) {
  // the API, or EmuDeck's release pages when GitHub's API limit answers 403 (0.9.17)
  let rel; try { rel = await require('./github').release('EmuDeck/emudeck-electron', { fetchImpl }); } catch (e) { throw new Error(`${e.message} Or get EmuDeck from emudeck.com.`); }
  const asset = pickAsset({ assets: (rel?.assets || []).map((a) => ({ name: a.name, browser_download_url: a.url, size: a.size })) });
  if (!asset) throw new Error("EmuDeck's latest release has no AppImage for this device.");
  const dir = path.join(home, 'Applications');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, 'EmuDeck.AppImage');
  const part = dest + '.partial';
  const d = await fetchImpl(asset.browser_download_url);
  if (!d.ok || !d.body) throw new Error(`Download failed (${d.status})`);
  const total = Number(d.headers.get('content-length')) || asset.size || 0;
  const out = fs.createWriteStream(part);
  let got = 0;
  try {
    for await (const chunk of d.body) {
      got += chunk.length;
      if (!out.write(chunk)) await new Promise((res) => out.once('drain', res));
      onProgress({ got, total, percent: total ? Math.round((got / total) * 100) : null });
    }
    await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
  } catch (e) { out.destroy(); try { fs.unlinkSync(part); } catch {} throw e; }
  fs.renameSync(part, dest);
  fs.chmodSync(dest, 0o755);
  // EmuDeck's script passes --no-sandbox on Ubuntu (its AppArmor blocks Electron's sandbox)
  const ubuntu = /^ID=("?)ubuntu\1$/m.test((() => { try { return fs.readFileSync('/etc/os-release', 'utf8'); } catch { return ''; } })());
  if (run) start(dest, ubuntu ? ['--no-sandbox'] : []);
  return { path: dest, version: asset.name };
}

// RetroDECK from Flathub, for this user only (no password); flatpak prints "NN%" while it works
function getRetroDeck(onProgress = () => {}, { run = true } = {}) {
  if (!has('flatpak')) return Promise.reject(new Error("Flatpak isn't installed on this system, so RetroDECK can't be installed from here."));
  // 0.9.56: Flathub added without holding the app (it waited up to a minute on Electron's main thread)
  const remote = new Promise((ok) => require('child_process').execFile('flatpak', ['remote-add', '--user', '--if-not-exists', 'flathub', 'https://dl.flathub.org/repo/flathub.flatpakrepo'], { env: plainEnv(), timeout: 60000 }, () => ok()));
  return remote.then(() => new Promise((resolve, reject) => {
    const p = spawn('flatpak', ['install', '--user', '-y', '--noninteractive', 'flathub', RETRODECK], { env: plainEnv() });
    let tail = '';
    const read = (b) => {
      const s = String(b); tail = (tail + s).slice(-2000);
      const all = [...s.matchAll(/(\d{1,3})%/g)];
      if (all.length) onProgress({ percent: Math.min(100, Number(all[all.length - 1][1])) });
    };
    p.stdout.on('data', read); p.stderr.on('data', read);
    p.on('error', (e) => reject(e));
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`RetroDECK didn't install: ${(tail.trim().split('\n').pop() || 'flatpak failed').slice(0, 200)}`));
      if (run) start('flatpak', ['run', RETRODECK]);
      resolve({ id: RETRODECK });
    });
  }));
}

// Flatpak itself, when a system has none (0.9.17, owner: offer it instead of stopping). Image-based
// systems (SteamOS, Bazzite, Fedora Atomic) always ship it; this is for ordinary distros, through their
// own package manager with the device password (sudo, used once), then Flathub added.
function flatpakCommand(osRelease) {
  const id = ` ${(/^ID=("?)([^"\n]*)\1$/m.exec(osRelease) || [])[2] || ''} ${(/^ID_LIKE=("?)([^"\n]*)\1$/m.exec(osRelease) || [])[2] || ''} `;
  if (/ (arch|manjaro|endeavouros|cachyos) /.test(id)) return 'pacman -S --needed --noconfirm flatpak';
  if (/ (debian|ubuntu|linuxmint|pop) /.test(id)) return 'apt-get update && apt-get install -y flatpak';
  if (/ (fedora|rhel|centos|nobara) /.test(id)) return 'dnf install -y flatpak';
  if (/ (opensuse|suse|opensuse-tumbleweed) /.test(id)) return 'zypper --non-interactive install flatpak';
  if (/ (void) /.test(id)) return 'xbps-install -Sy flatpak';
  return null;
}
async function getFlatpak(password) {
  if (has('flatpak')) return true;
  const os_ = (() => { try { return fs.readFileSync('/etc/os-release', 'utf8'); } catch { return ''; } })();
  const cmd = flatpakCommand(os_);
  if (!cmd) throw new Error("Cartridge doesn't know this system's package manager. Install Flatpak with it (flatpak.org/setup), then try again.");
  await require('./rommLocal').sudo(password, `${cmd} && flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo`);
  if (!has('flatpak')) throw new Error("Flatpak didn't install. Try installing it yourself (flatpak.org/setup).");
  return true;
}

module.exports = { getEmuDeck, getRetroDeck, pickAsset, getFlatpak, flatpakCommand, hasFlatpak: () => has('flatpak') };
