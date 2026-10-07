// Emulator updates from Cartridge (0.9.16; owner asked: check versions, update from one place).
// Owner-approved exception to "never downloads emulators": only an emulator the user already has,
// only when they press Update, and only from that emulator's own release channel:
// - Flatpak: `flatpak remote-ls --updates` / `flatpak update -y <id>`, user or system install as found
// - AppImage: the newest release on the emulator's own GitHub, written over the old file at the same
//   path (so Steam shortcuts keep working); the old copy stays until the new one is in place
// EmuDeck's script launchers update through EmuDeck; RetroArch cores through RetroArch.
const fs = require('fs');
const webFetch = require('./webFetch');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

// emulator -> its GitHub releases and the Linux AppImage in them (x86_64)
const REPOS = {
  pcsx2: { repo: 'PCSX2/pcsx2', asset: /linux.*appimage.*x64.*\.AppImage$|x64.*\.AppImage$/i, pre: true },
  duckstation: { repo: 'stenzek/duckstation', tag: 'latest', asset: /^DuckStation-x64\.AppImage$/i },
  rpcs3: { repo: 'RPCS3/rpcs3-binaries-linux', asset: /linux64\.AppImage$/i },
  // 0.9.23 (owner: "the Vita3K update bricked it"): Vita3K's Linux zip build is now a Qt6 program that
  // needs Qt6 from the system (libQt6Widgets, Multimedia, Svg...), which SteamOS and Bazzite don't have,
  // so writing it over a copy left Vita3K unable to start. Vita3K only updates from its AppImage, which
  // carries its own Qt. EmuDeck installs exactly that, renamed to ~/Applications/Vita3K/Vita3K
  // (emuDeckVita3K.sh), so the AppImage may go over a plain program there (overProgram).
  // PS5 (0.9.37): whole folders as .tar.gz, laid over ~/Applications/<dir> (layFolder)
  sharpemu: { repo: 'sharpemu/sharpemu', asset: /linux-x64\.tar\.gz$/i, pre: true, dirBuild: { dir: 'SharpEmu', program: 'SharpEmu' } },
  kytyps5: { repo: 'KytyPS5/KytyPS5', asset: /Linux-x86_64\.tar\.gz$/i, pre: true, dirBuild: { dir: 'KytyPS5', program: 'kyty_emulator' } },
  // fallback (0.9.47): Vita3K's builds from 3 Oct 2026 are made on Ubuntu 26.04 and need glibc 2.43; build 4111 is the
  // last one made on 24.04 (glibc 2.39), used where the newest can't start (SteamOS, Bazzite, most distros today)
  vita3k: { repo: 'Vita3K/Vita3K', tag: 'continuous', asset: /^Vita3K-x86_64\.AppImage$/i, overProgram: true, fallback: { url: 'https://github.com/Vita3K/Vita3K-builds/releases/download/4111/Vita3K-x86_64.AppImage', version: 'build 4111', name: 'Vita3K-x86_64.AppImage' } },
  azahar: { repo: 'azahar-emu/azahar', asset: /\.AppImage$/i },
  cemu: { repo: 'cemu-project/Cemu', asset: /x86_64\.AppImage$/i },
  xemu: { repo: 'xemu-project/xemu', asset: /x86_64\.AppImage$/i },
  ppsspp: { repo: 'hrydgard/ppsspp', asset: /x86_64\.AppImage$/i },
  // 0.9.17: the rest Cartridge can update itself (owner: no "updates through its own app")
  // 0.9.19: file names checked against the projects' own install scripts (EmuDeck reads the same releases):
  // shadPS4's launcher ships a linux-qt .zip with the AppImage inside; Eden and Ryujinx publish on their
  // own Forgejo servers first (git.eden-emu.org, git.ryujinx.app), GitHub second
  // 0.9.37 (owner's photo: "No Linux build in shadps4-qtlauncher's newest release"): every launcher build is published
  // as a pre-release (its build.yml), so GitHub's "latest" skipped them all and found an old release without Linux
  shadps4: { repo: 'shadps4-emu/shadps4-qtlauncher', asset: /linux-qt.*\.zip$|qt.?launcher.*\.AppImage$/i, zipped: /\.AppImage$/i, pre: true, preOnly: true },
  // 0.9.21 (owner: "couldn't check"): Eden's server is git.eden-emu.dev; .org kept as the older name
  eden: { repo: 'eden-emulator/Releases', asset: /(amd64|x86_64|x64|steamdeck|rog).*\.AppImage$|linux.*\.AppImage$/i, forge: [['https://git.eden-emu.dev', 'eden-emu/eden'], ['https://git.eden-emu.org', 'eden-emu/eden']], first: 'forge' },
  // 0.9.49 (owner: "Citron has no update source? look for it"): Citron publishes on its own Forgejo (git.citron-emu.org,
  // Citron/Emulator; the old lower-case path kept), and its Linux AppImages are rebuilt on GitHub by pkgforge-dev,
  // where EmuDeck's emuDeckCitron.sh takes them. Forgejo first, as for Eden and Ryujinx.
  citron: { repo: 'pkgforge-dev/Citron-AppImage', asset: /(x86_64|amd64|x64).*\.AppImage$|\.AppImage$/i, forge: [['https://git.citron-emu.org', 'Citron/Emulator'], ['https://git.citron-emu.org', 'citron/emulator']], first: 'forge' },
  ryujinx: { repo: 'Ryubing/Stable-Releases', asset: /x64.*\.AppImage$/i, forge: [['https://git.ryujinx.app', 'Ryubing/Stable'], ['https://git.ryujinx.app', 'ryubing/ryujinx']], first: 'forge' },
  flycast: { repo: 'flyinghead/flycast', asset: /x86_64\.AppImage$/i },
  mgba: { repo: 'mgba-emu/mgba', asset: /x64\.AppImage$|x86_64\.AppImage$/i },
  xeniaedge: { repo: 'has207/xenia-edge', asset: /\.AppImage$/i },
  // Xenia Canary (0.9.21, owner: "updates in the app", make it updatable): its builds are the release
  // files of xenia-canary-releases; the Linux one is a .tar.gz with the program inside, the Windows one
  // (run through Proton, as EmuDeck does) a .zip with xenia_canary.exe. Only that one file is replaced.
  xenia: { repo: 'xenia-canary/xenia-canary-releases', asset: /linux.*\.(tar\.gz|zip)$|\.AppImage$/i, zipped: /^xenia_canary(\.AppImage)?$|\.AppImage$/i },
  'xenia-win': { repo: 'xenia-canary/xenia-canary-releases', asset: /windows.*\.zip$/i, zipped: /^xenia_canary\.exe$/i },
};
// what kind of copy a file is (0.9.21): an AppImage, a folder build (the program with its data/ and lang/
// beside it, as the zip builds unpack; also one an older Cartridge wrote an AppImage over), or a plain program
function installKind(file) {
  if (!file || /\.exe$/i.test(file)) return 'other';
  // the file itself decides first (0.9.23): an AppImage stays an AppImage even with an older zip build's
  // data/ and lang/ left beside it (EmuDeck now puts Vita3K's AppImage there as "Vita3K")
  if (require('./detect').appImageType(file)) return 'appimage';
  const dir = path.dirname(file), here = (n) => { try { return fs.statSync(path.join(dir, n)).isDirectory(); } catch { return false; } };
  if (Object.values(REPOS).some((r) => r.dirBuild && r.dirBuild.program === path.basename(file))) return 'folder'; // SharpEmu, KytyPS5
  if (here('data') && (here('lang') || here('translations') || here('shaders-builtin'))) return 'folder';
  return 'program';
}
// the system libraries a program needs and can't find (ldd's "not found"), e.g. a Qt6 build on SteamOS:
// such a copy can't start, so its update is offered as a repair. Never for AppImages (they carry theirs).
function missingLibs(file) {
  try {
    if (!file || /\.exe$/i.test(file) || require('./detect').appImageType(file)) return [];
    const out = require('child_process').execFileSync('ldd', [file], { env: plainEnv(), timeout: 8000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    // 0.9.49: a library that is there but the wrong version (Qt_6.10 not found) stops a program just the same
    return [...out.matchAll(/^\s*(\S+)\s*=>\s*not found/gm)].map((m) => m[1]).concat([...new Set([...out.matchAll(/version [`']([^']+)' not found/g)].map((m) => m[1]))]);
  } catch { return []; }
}
// the same without holding the app (0.9.56): ldd can take seconds on a big program, and the emulator list asked it of
// every installed copy one after another on Electron's main thread, which Game Mode reads as Cartridge not responding
function missingLibsAsync(file) {
  return new Promise((resolve) => {
    try { if (!file || /\.exe$/i.test(file) || require('./detect').appImageType(file)) return resolve([]); } catch { return resolve([]); }
    require('child_process').execFile('ldd', [file], { env: plainEnv(), timeout: 8000, encoding: 'utf8' }, (e, out) => {
      out = String(out || '');
      resolve([...out.matchAll(/^\s*(\S+)\s*=>\s*not found/gm)].map((m) => m[1]).concat([...new Set([...out.matchAll(/version [`']([^']+)' not found/g)].map((m) => m[1]))]));
    });
  });
}
// which release source a copy uses: Xenia Edge's AppImage has its own; a Windows build its own files
const specFor = (id, file = '') => (id === 'xenia' && /edge/i.test(path.basename(file)) ? REPOS.xeniaedge : id === 'xenia' && /\.exe$/i.test(file) ? REPOS['xenia-win'] : REPOS[id]);

function plainEnv() { const env = { ...process.env }; for (const k of ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'APPDIR', 'APPIMAGE', 'ARGV0', 'OWD']) delete env[k]; return env; }
const run = (cmd, args, timeout = 60000) => new Promise((resolve, reject) => execFile(cmd, args, { env: plainEnv(), timeout, maxBuffer: 8 << 20 }, (e, out, err) => (e ? reject(new Error(String(err || e.message).trim().split('\n').pop())) : resolve(String(out)))));

// version text from a tag or file name: v2.3.120 -> 2.3.120
// 0.9.37: a build number after the version counts (RPCS3's 0.0.38-18166 is newer than 0.0.38-18101: every
// RPCS3 build shares 0.0.38, so updates were never seen); it becomes the last part, 0.0.38.18166
const verOf = (s) => { const m = String(s || '').match(/(\d+(?:\.\d+){1,3})(?:-(\d{4,})(?!\d|-\d{2}-))?/); return m ? m[1] + (m[2] ? '.' + m[2] : '') : ''; };
const cmpVer = (a, b) => { const x = verOf(a).split('.').map(Number), y = verOf(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };

// Flatpak: which of these app ids have an update, per installation
async function flatpakUpdates(ids) {
  const out = {};
  for (const where of ['--user', '--system']) {
    let t = ''; try { t = await run('flatpak', ['remote-ls', where, '--updates', '--app', '--columns=application,version']); } catch { continue; }
    for (const line of t.split('\n')) { const [id, version] = line.trim().split(/\t+|\s{2,}/); if (ids.includes(id)) out[id] = { version: version || '', where }; }
  }
  return out;
}
// 0.9.23 (owner: Flatpak updates take far longer than AppImages): --no-related skips the app's locale
// and debug extensions, which flatpak otherwise refreshes with every update; the runtime the new version
// needs still comes along. Progress is read from flatpak's own output and passed on.
function flatpakUpdate(id, where, onLine = () => {}, extra = []) {
  return new Promise((resolve, reject) => {
    const p = require('child_process').spawn('flatpak', [extra.includes('install') ? 'install' : 'update', where || '--user', '-y', '--noninteractive', '--no-related', ...extra.filter((x) => x !== 'install'), ...(extra.includes('install') ? ['flathub'] : []), id], { env: plainEnv() });
    let tail = '';
    const t = setTimeout(() => { try { p.kill(); } catch {} }, 30 * 60e3);
    const take = (d) => { const s = String(d); tail = (tail + s).slice(-2000); for (const l of s.split(/[\r\n]+/)) { const m = /(\d{1,3})%/.exec(l); if (m || /Updating|Installing|Downloading/i.test(l)) onLine({ pct: m ? Math.min(100, Number(m[1])) : null, text: l.trim().slice(0, 120) }); } };
    p.stdout.on('data', take); p.stderr.on('data', take);
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('exit', (code) => { clearTimeout(t); code === 0 ? resolve(true) : reject(new Error(tail.trim().split('\n').pop() || 'Flatpak couldn’t update it.')); });
  });
}
const flatpakRemove = (id, where) => run('flatpak', ['uninstall', where || '--user', '-y', '--noninteractive', id], 10 * 60e3);

// GitHub: the newest release's AppImage for one emulator (cached by the caller)
// a Forgejo/Gitea server's newest release (the same shape GitHub's API gives)
async function forgeRelease(host, repo, fetchImpl = require('./webFetch'), pre = false) {
  const r = await fetchImpl(`${host}/api/v1/repos/${repo}/releases?limit=5`, { headers: { 'User-Agent': 'Cartridge', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${new URL(host).host} answered ${r.status}`);
  const j = (await r.json()).find((x) => !x.draft && (pre || !x.prerelease)) || null;
  return j && { tag: j.tag_name, date: j.published_at || j.created_at || '', assets: (j.assets || []).map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size || 0 })) };
}
// several builds in one release (Eden: amd64, Steam Deck...): the one whose name shares most words with the copy you have
const words = (n) => new Set(String(n).toLowerCase().replace(/\d+(\.\d+)*/g, ' ').split(/[^a-z]+/).filter((w) => w.length > 1));
function pickAsset(assets, re, file) {
  const ok = (assets || []).filter((a) => re.test(a.name) && !/arm|aarch64/i.test(a.name));
  if (!file || ok.length < 2) return ok[0];
  const mine = words(path.basename(file));
  return [...ok].sort((a, b) => [...words(b.name)].filter((w) => mine.has(w)).length - [...words(a.name)].filter((w) => mine.has(w)).length)[0];
}
// Release channels (0.9.23, owner: show whether a copy follows stable releases or pre-releases/nightlies,
// and let it switch): 'stable' (the newest release that isn't a pre-release), 'pre' (the newest of any,
// pre-releases included), 'rolling' (projects with one moving build, like Vita3K's "continuous": no choice).
// Unless the user picked one, a copy keeps the channel Cartridge always used for it (the spec's).
const CHANNEL_REPOS = { ryujinx: { pre: { repo: 'Ryubing/Canary-Releases', forge: [['https://git.ryujinx.app', 'Ryubing/Canary']] } } };
function channelsOf(id, file = '') {
  const r = specFor(id, file);
  if (!r) return { def: null, options: [] };
  if (r.tag) return { def: 'rolling', options: ['rolling'] };
  if (r.preOnly) return { def: 'pre', options: ['pre'] }; // only ever pre-releases (shadPS4's launcher): no stable to pick
  return { def: r.pre ? 'pre' : 'stable', options: ['stable', 'pre'] };
}
function withChannel(r, id, channel) {
  if (!r || !channel || r.tag || r.preOnly || channel === 'rolling') return r;
  const extra = CHANNEL_REPOS[id]?.[channel];
  return { ...r, ...(extra || {}), pre: channel === 'pre' };
}
async function latestRelease(id, { fetchImpl, spec, file, channel } = {}) {
  let r = spec?.repo ? spec : withChannel(specFor(id, file), id, channel);
  // the same kind of build as the copy you have: a folder build from its zip, never an AppImage over a program
  if (r && !spec?.repo && file && !/\.exe$/i.test(file)) { const k = installKind(file); if (k === 'folder') r = r.dirBuild ? r : r.folder ? { ...r, asset: r.folder, zipped: null, wholeFolder: true } : r.overProgram ? r : null; else if (k === 'program' && !r.zipped && !r.overProgram) r = null; }
  if (!r) return null;
  // each source in turn (0.9.19): GitHub (its API, else its release pages when the API limit answers 403,
  // github.js) and the project's own Forgejo server; the first with a matching file wins
  const gh = () => require('./github').release(r.repo, { tag: r.tag, pre: r.pre, fetchImpl });
  const forges = (r.forge || []).map(([host, repo]) => () => forgeRelease(host, repo, fetchImpl, !!r.pre));
  const tries = r.first === 'forge' ? [...forges, gh] : [gh, ...forges];
  let lastErr = null;
  for (const t of tries) {
    let rel = null; try { rel = await t(); } catch (e) { lastErr = e; continue; }
    const asset = pickAsset(rel?.assets, r.asset, file);
    if (asset) return { id, fallback: r.fallback || null, version: verOf(rel.tag) || verOf(asset.name), tag: rel.tag, name: asset.name, url: asset.url, size: asset.size, date: asset.date || rel.date, folder: !!r.wholeFolder, dirBuild: r.dirBuild || null, zipped: r.wholeFolder || r.dirBuild ? null : /\.(zip|tar\.gz|tgz)$/i.test(asset.name) ? r.zipped || /\.AppImage$/i : null };
  }
  if (lastErr) throw lastErr; // every source refused: say why
  return null;
}
// the AppImage inside a downloaded .zip (shadPS4's launcher ships one), written to dest
async function appImageFromZip(zipFile, dest, want = /\.AppImage$/i) {
  const yauzl = require('yauzl');
  await new Promise((resolve, reject) => yauzl.open(zipFile, { lazyEntries: true }, (err, z) => {
    if (err) return reject(err);
    let found = false;
    z.on('entry', (e) => {
      if (found || !want.test(e.fileName.split('/').pop())) return z.readEntry();
      found = true;
      z.openReadStream(e, (er, st) => { if (er) return reject(er); const ws = fs.createWriteStream(dest); st.on('error', reject); ws.on('error', reject); ws.on('finish', () => { z.close(); resolve(); }); st.pipe(ws); });
    });
    z.on('end', () => { if (!found) reject(new Error('There was no AppImage in the download.')); });
    z.on('error', reject);
    z.readEntry();
  }));
  fs.chmodSync(dest, 0o755);
}
// the program inside a downloaded .tar.gz (Xenia Canary's Linux build), through the system's tar
async function fileFromTar(tarFile, dest, want) {
  const dir = dest + '.d';
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  try {
    await run('tar', ['-xzf', tarFile, '-C', dir], 10 * 60e3);
    const all = []; const walk = (d) => { for (const n of fs.readdirSync(d)) { const f = path.join(d, n); if (fs.statSync(f).isDirectory()) walk(f); else all.push(f); } };
    walk(dir);
    const hit = all.find((f) => want.test(path.basename(f)));
    if (!hit) throw new Error('The program wasn’t in the download.');
    fs.copyFileSync(hit, dest); fs.chmodSync(dest, 0o755);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
// is the release newer than this AppImage? by version when both have one, else by date
// the version an emulator itself says it is, when it has run since its file last changed (0.9.37): RPCS3 writes
// "RPCS3 v0.0.38-18166-77d2d1b4 Alpha" at the top of its log
function ranVersion(id, file, home = os.homedir()) {
  if (id !== 'rpcs3') return '';
  const cfg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  for (const log of [path.join(cfg, 'rpcs3', 'RPCS3.log'), path.join(path.dirname(file), 'config', 'RPCS3.log')]) {
    try {
      const st = fs.statSync(log), fst = fs.statSync(file);
      if (st.mtimeMs < fst.mtimeMs) continue; // older than the AppImage: says nothing about this copy
      const fd = fs.openSync(log, 'r'), b = Buffer.alloc(4096); const n = fs.readSync(fd, b, 0, 4096, 0); fs.closeSync(fd);
      const m = /RPCS3 v(\d+\.\d+\.\d+-\d+)/.exec(b.toString('utf8', 0, n));
      if (m) return m[1];
    } catch {}
  }
  return '';
}
function isNewer(rel, have) {
  if (!rel) return false;
  const a = verOf(rel.version), b = verOf(have.version);
  if (a && b) {
    // compared as far as both go; one with a build number and one without are told apart by date (below)
    const x = a.split('.').map(Number), y = b.split('.').map(Number), n = Math.min(x.length, y.length);
    for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i] > y[i];
    if (x.length === y.length) return false;
  }
  const mt = (() => { try { return fs.statSync(have.path).mtimeMs; } catch { return 0; } })();
  return !!rel.date && Date.parse(rel.date) > mt + 3600e3;
}
// the new AppImage in place of the old one (same path); the old copy back on any failure
// The file keeps its name and place (owner, 0.9.19: an update must never rename an AppImage, or
// launch options and shortcuts pointing at it break); Cartridge records the new version itself.
async function replaceAppImage(file, rel, download) {
  if (rel.dirBuild) { const z = path.dirname(file) + '.cartridge-dl'; try { await download(rel.url, z); if (rel.size && fs.statSync(z).size !== rel.size) throw new Error('The download was incomplete. Try again.'); await layFolder(z, path.dirname(file), rel.name); } finally { fs.rmSync(z, { force: true }); } fs.chmodSync(file, 0o755); return true; }
  if (rel.folder) return replaceFolder(file, rel, download);
  const tmp = file + '.cartridge-new', old = file + '.cartridge-old';
  if (rel.zipped) { const z = file + '.cartridge-zip'; try { await download(rel.url, z); if (rel.size && fs.statSync(z).size !== rel.size) throw new Error('The download was incomplete. Try again.'); if (/\.(tar\.gz|tgz)$/i.test(rel.name || rel.url)) await fileFromTar(z, tmp, rel.zipped); else await appImageFromZip(z, tmp, rel.zipped); } finally { fs.rmSync(z, { force: true }); } }
  else await download(rel.url, tmp);
  if (!rel.zipped && rel.size && fs.statSync(tmp).size !== rel.size) { fs.rmSync(tmp, { force: true }); throw new Error('The download was incomplete. Try again.'); }
  // 0.9.23: never put something that can't start in place of a working copy: an AppImage must be one
  // (not a web page or a cut-off file), any other program at least a Linux program
  if (!looksRunnable(tmp, rel)) { fs.rmSync(tmp, { force: true }); throw new Error('What came down wasn’t a working program, so your copy was left as it was. Try again later.'); }
  await fitGlibc(tmp, rel, download, 'your copy was left as it was');
  await require('./emuStart').ensureStarts(rel.id, tmp, rel, download, 'your copy was left as it was'); // 0.9.49
  fs.chmodSync(tmp, 0o755);
  fs.renameSync(file, old);
  try { fs.renameSync(tmp, file); } catch (e) { fs.renameSync(old, file); throw e; }
  fs.rmSync(old, { force: true });
  return true;
}

// a build that asks for a newer glibc than this system has can't start at all (0.9.47: Vita3K "doesn't even open").
// Its known older build goes in instead (REPOS[id].fallback), else nothing is put in place and the reason is said.
async function fitGlibc(tmp, rel, download, kept = 'nothing was changed') {
  const D = require('./detect');
  const p = D.glibcProblem(tmp);
  if (!p) return rel;
  fs.rmSync(tmp, { force: true });
  const fb = rel.fallback || REPOS[rel.id]?.fallback;
  if (fb) {
    await download(fb.url, tmp);
    if (looksRunnable(tmp, { name: fb.name }) && !D.glibcProblem(tmp)) { Object.assign(rel, { version: fb.version, fellBack: p }); return rel; }
    fs.rmSync(tmp, { force: true });
  }
  throw new Error(`This build needs a newer Linux than this one (glibc ${p.need}; this system has ${p.have}), so it couldn't start here, and ${kept}.`);
}
function looksRunnable(file, rel) {
  const D = require('./detect');
  if (/\.AppImage$/i.test(rel?.name || '')) return !!D.appImageType(file);
  if (/\.exe/i.test(String(rel?.zipped || ''))) { try { const b = Buffer.alloc(2); const fd = fs.openSync(file, 'r'); fs.readSync(fd, b, 0, 2, 0); fs.closeSync(fd); return b.toString('latin1') === 'MZ'; } catch { return false; } }
  return !!D.isElf(file);
}
// a folder build (0.9.21): the zip unpacked over the program's folder, every file at its place, the
// program's own file name kept; a single top folder in the zip is stripped; the old program back on failure
// a release that is a whole folder (0.9.37: SharpEmu, KytyPS5, a .tar.gz of the program and its libraries):
// unpacked beside, one folder around everything taken off, then laid over the folder, so what the emulator keeps
// there (SharpEmu's user/) stays. Files in the archive never land outside the folder (tar refuses ../ paths).
async function layFolder(archive, dir, name = '') {
  const tmp = dir + '.cartridge-new.d';
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  try {
    if (/\.zip$/i.test(name)) throw new Error('This build is a .zip; only .tar.gz folder builds are unpacked here.');
    await new Promise((ok, bad) => execFile('tar', ['-xzf', archive, '-C', tmp, '--no-same-owner'], { timeout: 600000 }, (e, so, se) => (e ? bad(new Error(`It couldn't be unpacked: ${String(se || e.message).trim().split('\n').pop()}`)) : ok())));
    const top = fs.readdirSync(tmp), one = top.length === 1 && fs.statSync(path.join(tmp, top[0])).isDirectory();
    fs.mkdirSync(dir, { recursive: true });
    fs.cpSync(one ? path.join(tmp, top[0]) : tmp, dir, { recursive: true, force: true });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
async function replaceFolder(file, rel, download) {
  const dir = path.dirname(file), z = file + '.cartridge-zip', old = file + '.cartridge-old';
  await download(rel.url, z);
  try {
    if (rel.size && fs.statSync(z).size !== rel.size) throw new Error('The download was incomplete. Try again.');
    const yauzl = require('yauzl');
    const entries = await new Promise((ok, bad) => yauzl.open(z, { lazyEntries: true, autoClose: false }, (e, zip) => { if (e) return bad(e); const l = []; zip.on('entry', (x) => { l.push(x); zip.readEntry(); }); zip.on('end', () => ok({ zip, l })); zip.on('error', bad); zip.readEntry(); }));
    const names = entries.l.map((e) => e.fileName.replace(/\\/g, '/'));
    const tops = new Set(names.map((n) => n.split('/')[0]));
    const strip = tops.size === 1 && names.every((n) => n.includes('/')) ? [...tops][0] + '/' : '';
    const prog = names.map((n) => n.slice(strip.length)).find((n) => n && !n.includes('/') && /^vita3k$/i.test(n)) || path.basename(file);
    fs.copyFileSync(file, old);
    try {
      for (const e of entries.l) {
        const rel2 = e.fileName.replace(/\\/g, '/').slice(strip.length);
        if (!rel2 || rel2.endsWith('/')) continue;
        const dest = rel2 === prog ? file : path.join(dir, rel2);
        if (!path.resolve(dest).startsWith(path.resolve(dir) + path.sep)) continue; // never outside the folder
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        await new Promise((ok, bad) => entries.zip.openReadStream(e, (er, st) => { if (er) return bad(er); const t = dest + '.cartridge-new', ws = fs.createWriteStream(t); st.on('error', bad); ws.on('error', bad); ws.on('finish', () => { try { fs.renameSync(t, dest); ok(); } catch (x) { bad(x); } }); st.pipe(ws); }));
        const mode = (e.externalFileAttributes >>> 16) & 0o777;
        if (rel2 === prog || mode & 0o111) fs.chmodSync(dest, 0o755);
      }
    } catch (err) { try { fs.copyFileSync(old, file); fs.chmodSync(file, 0o755); } catch {} throw err; }
    finally { try { entries.zip.close(); } catch {} }
    fs.rmSync(old, { force: true });
  } finally { fs.rmSync(z, { force: true }); }
  return true;
}

module.exports = { fitGlibc, layFolder, ranVersion, channelsOf, withChannel, flatpakRemove, installKind, missingLibs, missingLibsAsync, looksRunnable, replaceFolder, specFor, pickAsset, fileFromTar, forgeRelease, appImageFromZip, REPOS, verOf, cmpVer, flatpakUpdates, flatpakUpdate, latestRelease, isNewer, replaceAppImage };
