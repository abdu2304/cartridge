'use strict';
// PS3 packages installed through RPCS3 (0.9.3 D1, D3, D6). Cartridge never unpacks a PS3 .pkg
// itself: RPCS3 does (`rpcs3 --headless --installpkg <file>`, rpcs3.cpp: no window, licences
// .rap/.edat copied into exdata). RPCS3 always exits 0, so what was installed is read back from
// its game folder. Games installed this way are recorded (installs.json); only those can ever be
// deleted from RPCS3's storage, and only after every check in safeToRemove passes.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const SERIAL = /^[A-Z]{4}\d{5}$/;
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const ls = (d) => { try { return fs.readdirSync(d); } catch { return []; } };
const real = (p) => { try { return fs.realpathSync(p); } catch { return p; } };

// PKG header (RPCS3 Crypto/unpkg.h): magic 7F 'PKG', platform u16 at 6 (1 PS3, 2 PSP/Vita),
// metadata offset and count u32 at 8 and 12, content ID at 0x30 (UP9000-BCUS98137_00-...). RPCS3
// names the install folder after characters 7 to 15 of it. Metadata packets {id u32, size u32,
// data}: 2 content type (5 a game, 4 game data such as DLC and updates), 3 flags (0x10 a patch).
function pkgInfo(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const h = Buffer.alloc(0x60);
    if (fs.readSync(fd, h, 0, h.length, 0) < h.length || h.readUInt32BE(0) !== 0x7f504b47) return null;
    const platform = h.readUInt16BE(6), metaOff = h.readUInt32BE(8), metaCount = h.readUInt32BE(12);
    const contentId = h.toString('latin1', 0x30, 0x30 + 36).replace(/\0[\s\S]*$/, '');
    const titleId = contentId.slice(7, 16);
    let contentType = null, flags = 0, drm = null;
    if (metaOff && metaCount && metaCount < 64) {
      const m = Buffer.alloc(4096);
      const n = fs.readSync(fd, m, 0, m.length, metaOff);
      for (let i = 0, o = 0; i < metaCount && o + 8 <= n; i++) {
        const id = m.readUInt32BE(o), size = m.readUInt32BE(o + 4);
        if (size === 4 && o + 12 <= n) { if (id === 1) drm = m.readUInt32BE(o + 8); if (id === 2) contentType = m.readUInt32BE(o + 8); if (id === 3) flags = m.readUInt32BE(o + 8); }
        o += 8 + size;
      }
    }
    // DRM type 1 (network) and 2 (local) need a licence: <content ID>.rap in RPCS3's exdata
    return { file, contentId, titleId: SERIAL.test(titleId) ? titleId : null, platform, contentType, patch: !!(flags & 0x10), drm, needsRap: drm === 1 || drm === 2 };
  } catch { return null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
}

// What a downloaded game holds for RPCS3: licences first (a game needing one won't install its
// data right without it), then the game itself, then DLC, then updates oldest first (by name:
// update packages carry their version, A0101-V0102).
function packagesIn(p) {
  const files = [];
  const walk = (d, depth) => { for (const n of ls(d).sort()) { const f = path.join(d, n); if (isDir(f)) { if (depth < 2) walk(f, depth + 1); } else files.push(f); } };
  if (isDir(p)) walk(p, 0); else files.push(p);
  const lic = files.filter((f) => /\.(rap|edat)$/i.test(f));
  const pkgs = files.filter((f) => /\.pkg$/i.test(f)).map(pkgInfo).filter((x) => x && x.platform === 1 && x.titleId);
  const rank = (x) => (x.patch ? 2 : x.contentType === 5 ? 0 : 1);
  pkgs.sort((a, b) => rank(a) - rank(b) || path.basename(a.file).localeCompare(path.basename(b.file), undefined, { numeric: true }));
  return { licences: lic, pkgs, order: [...lic, ...pkgs.map((x) => x.file)], titleIds: [...new Set(pkgs.map((x) => x.titleId))] };
}
// Licences. RPCS3 copies a .rap into exdata under the file's own name and, when booting, looks for
// exactly <content ID>.rap (main_window.cpp InstallFileInExData), so a .rap named anything else is
// as good as none ("Failed to decrypt content"). licencePlan says, for each package that needs
// one, where its licence comes from: already in RPCS3, in the download under its right name, a
// .rap to copy under the right name (the only unmatched one, for the only package missing one,
// or one you picked), or missing.
const exdataHas = (hdds, cid) => hdds.some((h) => ls(path.join(h, 'home')).some((u) => fs.existsSync(path.join(h, 'home', u, 'exdata', cid + '.rap'))));
function licencePlan(p, hdds, picked = {}) {
  const need = [...new Map(p.pkgs.filter((x) => x.needsRap).map((x) => [x.contentId, x])).values()];
  const raps = p.licences.filter((f) => /\.rap$/i.test(f));
  const named = new Map(raps.map((f) => [path.basename(f).replace(/\.rap$/i, '').toUpperCase(), f]));
  const out = need.map((x) => {
    if (picked[x.contentId]) return { contentId: x.contentId, titleId: x.titleId, from: 'picked', file: picked[x.contentId] };
    if (named.has(x.contentId.toUpperCase())) return { contentId: x.contentId, titleId: x.titleId, from: 'download', file: named.get(x.contentId.toUpperCase()) };
    if (exdataHas(hdds, x.contentId)) return { contentId: x.contentId, titleId: x.titleId, from: 'rpcs3' };
    return { contentId: x.contentId, titleId: x.titleId, from: 'missing' };
  });
  const loose = raps.filter((f) => !need.some((x) => x.contentId.toUpperCase() === path.basename(f).replace(/\.rap$/i, '').toUpperCase()));
  const missing = out.filter((x) => x.from === 'missing');
  if (missing.length === 1 && loose.length === 1) Object.assign(missing[0], { from: 'renamed', file: loose[0] });
  return out;
}
// An installed PSN game's content ID and whether it needs a licence, from its EBOOT.BIN's NPD
// header ("NPD\0", version, licence 1 network / 2 local / 3 free, type, content ID at +16)
function npdOf(gameDir) {
  let fd;
  try {
    fd = fs.openSync(path.join(gameDir, 'USRDIR', 'EBOOT.BIN'), 'r');
    const b = Buffer.alloc(8192); const n = fs.readSync(fd, b, 0, b.length, 0);
    const i = b.subarray(0, n).indexOf(Buffer.from('NPD\0', 'latin1'));
    if (i < 0 || i + 0x40 > n) return null;
    const licence = b.readInt32BE(i + 8), contentId = b.toString('latin1', i + 16, i + 16 + 36).replace(/\0[\s\S]*$/, '');
    return /^[A-Z]{2}\d{4}-[A-Z]{4}\d{5}_\d\d-/.test(contentId) ? { contentId, needsRap: licence === 1 || licence === 2 } : null;
  } catch { return null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
}
// .rap files to hand RPCS3, each under its right name (copied into a temporary folder when renamed)
function stageLicences(plan, tmpDir) {
  const files = [];
  for (const l of plan) {
    if (l.from === 'download') files.push(l.file);
    else if (l.from === 'renamed' || l.from === 'picked') {
      fs.mkdirSync(tmpDir, { recursive: true });
      const to = path.join(tmpDir, l.contentId + '.rap');
      fs.copyFileSync(l.file, to);
      files.push(to);
    }
  }
  return files;
}

// RPCS3's dev_hdd0 folders, found the same way as its trophies (trophies.js): its vfs.yml first
// (dev_hdd0 can be moved anywhere), else next to its config; EmuDeck keeps it in storage/rpcs3.
function rpcs3Hdds(home = os.homedir(), emulationRoots = []) {
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  const out = [];
  for (const cd of [path.join(xdg, 'rpcs3'), path.join(home, '.var/app/net.rpcs3.RPCS3/config/rpcs3')]) {
    if (!isDir(cd)) continue;
    let hdd = path.join(cd, 'dev_hdd0');
    for (const vf of [path.join(cd, 'config', 'vfs.yml'), path.join(cd, 'vfs.yml')]) {
      let t = ''; try { t = fs.readFileSync(vf, 'utf8'); } catch { continue; }
      const m = t.match(/^\s*\/dev_hdd0\/\s*:\s*(.+?)\s*$/m);
      if (m) { hdd = m[1].replace(/^["']|["']$/g, '').replace('$(EmulatorDir)', cd + '/'); break; }
    }
    out.push(hdd);
  }
  for (const r of emulationRoots) out.push(path.join(r, 'storage', 'rpcs3', 'dev_hdd0'));
  const seen = new Set();
  return out.filter((h) => isDir(path.join(h, 'game')) && !seen.has(real(h)) && seen.add(real(h)));
}
const gamesIn = (hdds) => new Map(hdds.flatMap((h) => ls(path.join(h, 'game')).map((n) => [path.join(h, 'game', n), n])));
// the serial a game folder's PARAM.SFO says (TITLE_ID), or null
function sfoSerial(dir) {
  try { const m = fs.readFileSync(path.join(dir, 'PARAM.SFO')).toString('latin1').match(/[A-Z]{4}\d{5}/); return m ? m[0] : null; } catch { return null; }
}

// Runs RPCS3 once per file, in order. cmd: { exe, args } (args: what goes before RPCS3's own
// options, `run net.rpcs3.RPCS3` for the Flatpak). onStep({ step, of, file }). Returns the games
// found afterwards: [{ serial, dir, created }].
async function install({ cmd, hdds, files, titleIds, onStep = () => {}, signal }) {
  const before = gamesIn(hdds);
  const env = { ...process.env };
  for (const k of ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'APPDIR', 'APPIMAGE', 'ARGV0', 'OWD']) delete env[k]; // Cartridge's own AppImage, not RPCS3's
  const t0 = Date.now();
  for (const [i, f] of files.entries()) {
    if (signal?.aborted) throw new Error('Cancelled');
    onStep({ step: i + 1, of: files.length, file: path.basename(f) });
    await new Promise((resolve, reject) => {
      const p = spawn(cmd.exe, [...cmd.args, '--headless', '--installpkg', f], { env, stdio: 'ignore' });
      const kill = () => { try { p.kill(); } catch {} };
      const timer = setTimeout(kill, 60 * 60e3);
      signal?.addEventListener('abort', kill, { once: true });
      p.on('error', (e) => { clearTimeout(timer); reject(new Error(`RPCS3 didn't start: ${e.message}`)); });
      p.on('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
  // what is there now for each title ID: created by this install, or updated (PARAM.SFO newer)
  const after = gamesIn(hdds);
  const out = [];
  for (const id of titleIds) {
    const dir = [...after].find(([d, n]) => n === id && sfoSerial(d) === id)?.[0];
    if (!dir) continue;
    const created = ![...before.values()].includes(id);
    let touched = created;
    try { touched ||= fs.statSync(path.join(dir, 'PARAM.SFO')).mtimeMs >= t0 - 2000 || newestIn(dir) >= t0 - 2000; } catch {}
    out.push({ serial: id, dir, created, touched });
  }
  return out;
}
function newestIn(dir) { let t = 0; for (const n of ls(dir)) { try { t = Math.max(t, fs.statSync(path.join(dir, n)).mtimeMs); } catch {} } return t; }

// ---------------------------------------------------------------- Vita through Vita3K (D2)
// Vita3K (main.cpp, config.cpp): `--pkg <file> --zrif <key>` installs with no window and quits;
// a .vpk or .zip given as the game installs it, then opens Vita3K and starts it, so Cartridge
// waits for Vita3K to close. Its own --deleted-id is never used: it deletes saves too.
const VITA_ID = /^PCS[A-Z]\d{5}$/;
// Vita3K's pref path (where ux0 lives): its config.yml "pref-path", else its default, EmuDeck's storage
function vitaPrefs(home = os.homedir(), emulationRoots = []) {
  const out = [];
  for (const c of [path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Vita3K/config.yml'), path.join(home, '.config/Vita3K/config.yml'), path.join(home, '.local/share/Vita3K/Vita3K/config.yml'), path.join(home, 'Applications/Vita3K/config.yml')]) { // the last: older builds kept it next to the program (0.9.21)
    try { const m = fs.readFileSync(c, 'utf8').match(/^pref-path:\s*(.+)$/m); const v = m && m[1].trim().replace(/^['"]|['"]$/g, ''); if (v) out.push(v); } catch {}
  }
  // Vita3K's own defaults (app_init.cpp init_paths): $XDG_DATA_HOME/Vita3K/Vita3K, or a "portable"
  // folder next to its AppImage (portable/fs; EmuDeck's copy lives in ~/Applications/Vita3K)
  if (process.env.XDG_DATA_HOME) out.push(path.join(process.env.XDG_DATA_HOME, 'Vita3K/Vita3K'));
  out.push(path.join(home, '.local/share/Vita3K/Vita3K'), path.join(home, '.local/share/Vita3K'), path.join(home, 'Applications/Vita3K/portable/fs'), ...emulationRoots.map((r) => path.join(r, 'storage/Vita3K')));
  const seen = new Set();
  return out.filter((p) => isDir(path.join(p, 'ux0')) && !seen.has(real(p)) && seen.add(real(p)));
}
// The storage folder this copy of Vita3K uses, worked out the way Vita3K does (0.9.21, owner: Unit 13
// "didn't install"; read from Vita3K app_init.cpp init_paths and config.cpp): a "portable" folder next
// to its AppImage or program wins (portable/fs); else pref-path in its config.yml ($XDG_CONFIG_HOME or
// ~/.config/Vita3K, older builds next to the program); else SDL's pref path, $XDG_DATA_HOME or
// ~/.local/share, then Vita3K/Vita3K. Unlike vitaPrefs, the folder doesn't have to exist yet.
const prefPathIn = (f) => { try { const m = fs.readFileSync(f, 'utf8').match(/^pref-path:\s*(.+)$/m); const v = m && m[1].trim().replace(/^['"]|['"]$/g, ''); return v && path.isAbsolute(v) ? v : null; } catch { return null; } };
function vita3kFsPaths(exe, home = os.homedir()) {
  const out = [], dir = exe ? path.dirname(real(exe)) : null;
  const portable = dir && isDir(path.join(dir, 'portable')) ? path.join(dir, 'portable') : null;
  if (portable) out.push(path.join(portable, 'fs'));
  for (const c of [path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Vita3K/config.yml'), ...(dir ? [path.join(dir, 'config.yml')] : []), ...(portable ? [path.join(portable, 'config.yml')] : [])]) { const v = prefPathIn(c); if (v && !portable) out.push(v); }
  out.push(path.join(process.env.XDG_DATA_HOME || path.join(home, '.local/share'), 'Vita3K/Vita3K'));
  const seen = new Set();
  return out.map((p) => p.replace(/\/+$/, '')).filter((p) => !seen.has(real(p)) && seen.add(real(p)));
}
// Vita3K's log (vita3k.log): next to its config when portable, else $XDG_CACHE_HOME or ~/.cache/Vita3K
function vita3kLogTail(exe, home = os.homedir()) {
  const dir = exe ? path.dirname(real(exe)) : null;
  for (const f of [dir && path.join(dir, 'portable/vita3k.log'), path.join(process.env.XDG_CACHE_HOME || path.join(home, '.cache'), 'Vita3K/vita3k.log'), dir && path.join(dir, 'vita3k.log')].filter(Boolean)) {
    try { const st = fs.statSync(f); if (Date.now() - st.mtimeMs > 10 * 60e3) continue; const fd = fs.openSync(f, 'r'), n = Math.min(st.size, 64 * 1024), b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, st.size - n); fs.closeSync(fd); return b.toString('utf8'); } catch {}
  }
  return '';
}
// the reason Vita3K gave, from its own words: the last error line, without the time and level prefix
const vita3kWhy = (text) => (String(text).match(/^.*(?:\b(?:error|critical)\b|failed|not a supported|Vitamin|Install app before patch|already installed)[^\n]*/gim) || []).map((l) => l.replace(/^\s*\[[^\]]*\]\s*/, '').replace(/^\|\w\|\s*/, '').replace(/^\[[^\]]*\]:\s*/, '').trim()).filter((l) => !/Failed to refresh apps list/i.test(l)).pop() || '';

// the title ID in a Vita game's sce_sys/param.sfo (inside a .vpk/.zip, read with yauzl)
function zipTitleId(file) {
  return new Promise((resolve) => {
    let yauzl; try { yauzl = require('yauzl'); } catch { return resolve(null); }
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err) return resolve(null);
      let done = false;
      const end = (v) => { if (!done) { done = true; try { zip.close(); } catch {} resolve(v); } };
      zip.on('entry', (e) => {
        if (!/(^|\/)sce_sys\/param\.sfo$/i.test(e.fileName) || e.uncompressedSize > 1 << 20) return zip.readEntry();
        zip.openReadStream(e, (er, st) => {
          if (er) return end(null);
          const parts = []; st.on('data', (d) => parts.push(d));
          st.on('end', () => end((Buffer.concat(parts).toString('latin1').match(/PCS[A-Z]\d{5}/) || [])[0] || null));
          st.on('error', () => end(null));
        });
      });
      zip.on('end', () => end(null)); zip.on('error', () => end(null));
      zip.readEntry();
    });
  });
}
// A zRIF (the key a Vita .pkg needs, base64 starting KO5i) from a small text file that came with it
function findZrif(files) {
  for (const f of files.filter((x) => /\.(zrif|txt|tsv|rif64)$/i.test(x))) {
    try { if (fs.statSync(f).size > 256 * 1024) continue; const m = fs.readFileSync(f, 'latin1').match(/KO5i[0-9A-Za-z+/=]{40,}/); if (m) return m[0]; } catch {}
  }
  return null;
}
// What a downloaded Vita game holds: { kind: 'pkg' | 'vpk', file, titleId, zrif }, or null
async function vitaContent(p) {
  const files = [];
  const walk = (d, depth) => { for (const n of ls(d).sort()) { const f = path.join(d, n); if (isDir(f)) { if (depth < 2) walk(f, depth + 1); } else files.push(f); } };
  if (isDir(p)) walk(p, 0); else files.push(p);
  const pkg = files.map((f) => (/\.pkg$/i.test(f) ? pkgInfo(f) : null)).find((x) => x && x.platform === 2 && VITA_ID.test(x.contentId.slice(7, 16)));
  if (pkg) return { kind: 'pkg', file: pkg.file, titleId: pkg.contentId.slice(7, 16), zrif: findZrif(files) };
  for (const f of files.filter((x) => /\.(vpk|zip)$/i.test(x))) { const id = await zipTitleId(f); if (id) return { kind: 'vpk', file: f, titleId: id, zrif: null }; }
  // 0.9.19: a dump already unpacked (a folder with sce_sys/param.sfo), as Vita3K's install_contents takes it
  const sfo = files.find((f) => /(^|\/)sce_sys\/param\.sfo$/i.test(f.split(path.sep).join('/')));
  if (sfo) { const id = vitaSfoId(path.dirname(path.dirname(sfo))); if (id) return { kind: 'dir', file: path.dirname(path.dirname(sfo)), titleId: id, zrif: null }; }
  return null;
}
const appsIn = (prefs) => new Map(prefs.flatMap((p) => ls(path.join(p, 'ux0/app')).map((n) => [path.join(p, 'ux0/app', n), n])));
const vitaSfoId = (dir) => { try { return (fs.readFileSync(path.join(dir, 'sce_sys/param.sfo')).toString('latin1').match(/PCS[A-Z]\d{5}/) || [])[0] || null; } catch { return null; } };
// A Vita game needs its licence to start: work.bin inside the game (NoNpDrm .vpk), or a .rif that
// a .pkg install with its zRIF puts in ux0/license/<title ID>. Homebrew (not PCS...) needs none.
function vitaLicenced(pref, id, dir) {
  if (!VITA_ID.test(id)) return true;
  if (fs.existsSync(path.join(dir, 'sce_sys/package/work.bin'))) return true;
  return ls(path.join(pref, 'ux0/license', id)).some((n) => /\.rif$/i.test(n)) || ls(path.join(pref, 'ux0/license/app', id)).some((n) => /\.rif$/i.test(n));
}
const NO_QT = /Qt platform plugin/i;

// ---- Installing a Vita archive the way Vita3K does (0.9.19, owner: in the background like RPCS3,
// never opening Vita3K). Read from Vita3K's interface.cpp (install_archive, get_archive_contents_path,
// install_archive_content, set_content_path) and io.cpp (copy_path):
// - each "content" is the folder holding sce_sys/param.sfo; a Vitamin dump (sce_module/steroid.suprx)
//   is refused;
// - category gd (game) -> ux0/app/<TITLE_ID>; ac (DLC) -> ux0/addcont/<TITLE_ID>/<CONTENT_ID from char 20>;
//   gp (update) -> ux0/patch/<TITLE_ID>, then merged into ux0/app/<TITLE_ID> (the app must be there first);
// - a retail title (PCS...) with sce_sys/package/ is NoNpDrm: its files are PFS-encrypted and only Vita3K
//   can decrypt them (psvpfsparser with its keys), so those still go through Vita3K, hidden (below).
// Everything else (homebrew, already decrypted dumps) is unpacked here, no Vita3K process at all.
function vitaArchive(file) {
  return new Promise((resolve, reject) => {
    let yauzl; try { yauzl = require('yauzl'); } catch (e) { return reject(e); }
    yauzl.open(file, { lazyEntries: true, autoClose: false }, (err, zip) => {
      if (err) return reject(err);
      const entries = [];
      zip.on('entry', (e) => { entries.push(e); zip.readEntry(); });
      zip.on('end', () => resolve({ zip, entries }));
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}
const readEntry = (zip, e) => new Promise((ok, bad) => zip.openReadStream(e, (er, st) => { if (er) return bad(er); const parts = []; st.on('data', (d) => parts.push(d)); st.on('end', () => ok(Buffer.concat(parts))); st.on('error', bad); }));
// what an archive holds: [{ base, sfo: { TITLE_ID, CATEGORY, CONTENT_ID, TITLE }, encrypted }]
async function vitaArchiveContents(file) {
  const { zip, entries } = await vitaArchive(file);
  try {
    const names = entries.map((e) => e.fileName.replace(/\\/g, '/'));
    if (names.some((n) => n.includes('sce_module/steroid.suprx'))) throw new Error('This is a Vitamin dump, which Vita3K doesn’t support. Use a NoNpDrm dump or a .pkg with its zRIF.');
    const out = [];
    for (const e of entries) {
      const n = e.fileName.replace(/\\/g, '/');
      const m = /^(.*?)sce_sys\/param\.sfo$/i.exec(n);
      if (!m || out.some((c) => c.base === m[1]) || e.uncompressedSize > 1 << 20) continue;
      const buf = await readEntry(zip, e), sfo = require('./patches').parseSfo(buf);
      if (!sfo.TITLE_ID) sfo.TITLE_ID = (buf.toString('latin1').match(/PCS[A-Z]\d{5}/) || [])[0]; // a damaged param.sfo: what Vita3K would see is unsure, so it gets the file
      const enc = names.some((x) => x.startsWith(m[1] + 'sce_sys/package/'));
      out.push({ base: m[1], sfo, encrypted: (enc && /^PCS/.test(sfo.TITLE_ID || '')) || !sfo.CATEGORY });
    }
    return out;
  } finally { try { zip.close(); } catch {} }
}
function vitaDest(pref, sfo) {
  const id = sfo.TITLE_ID, cat = String(sfo.CATEGORY || 'gd');
  if (cat === 'ac') return { dir: path.join(pref, 'ux0/addcont', id, String(sfo.CONTENT_ID || '').slice(20)), cat };
  if (cat.includes('gp')) return { dir: path.join(pref, 'ux0/patch', id), cat };
  return { dir: path.join(pref, 'ux0/app', id), cat };
}
// copies every file under a folder into another (Vita3K copy_directory_contents), overwriting
function mergeInto(src, dst) {
  for (const n of ls(src)) {
    const a = path.join(src, n), b = path.join(dst, n);
    if (isDir(a)) { fs.mkdirSync(b, { recursive: true }); mergeInto(a, b); } else { fs.mkdirSync(dst, { recursive: true }); fs.copyFileSync(a, b); }
  }
}
// unpacks the unencrypted contents of a .vpk/.zip into Vita3K's storage; returns the title IDs installed
async function vitaUnpack(file, pref, contents, { onFile = () => {}, signal } = {}) {
  const { zip, entries } = await vitaArchive(file);
  const done = [];
  try {
    for (const c of contents) {
      const { dir, cat } = vitaDest(pref, c.sfo);
      if (cat.includes('gp') && !ls(path.join(pref, 'ux0/app', c.sfo.TITLE_ID)).length) throw new Error('This is an update: install the game first.');
      const tmp = dir + '.cartridge-new';
      fs.rmSync(tmp, { recursive: true, force: true });
      const mine = entries.filter((e) => e.fileName.replace(/\\/g, '/').startsWith(c.base) && !/\/$/.test(e.fileName));
      let n = 0;
      for (const e of mine) {
        if (signal?.aborted) throw new Error('Stopped.');
        const rel = e.fileName.replace(/\\/g, '/').slice(c.base.length);
        const out = path.join(tmp, rel);
        if (!path.resolve(out).startsWith(path.resolve(tmp) + path.sep)) continue; // never outside the game's folder
        fs.mkdirSync(path.dirname(out), { recursive: true });
        await new Promise((ok, bad) => zip.openReadStream(e, (er, st) => { if (er) return bad(er); const ws = fs.createWriteStream(out); st.on('error', bad); ws.on('error', bad); ws.on('finish', ok); st.pipe(ws); }));
        onFile(++n, mine.length);
      }
      // as Vita3K: an install replaces what was there (create_directories, else remove_all)
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      fs.renameSync(tmp, dir);
      if (cat.includes('gp')) { mergeInto(dir, path.join(pref, 'ux0/app', c.sfo.TITLE_ID)); fs.rmSync(dir, { recursive: true, force: true }); } // copy_path
      done.push(c.sfo.TITLE_ID);
    }
  } finally { try { zip.close(); } catch {} }
  return done;
}

// Qt display plugins tried in turn (0.9.18/0.9.19): offscreen and minimal show nothing; builds without
// them get the normal display, where Vita3K installs before it builds its window and is stopped the
// moment its log says so (vita3k/main.cpp logs "installed successfully" before MainWindow).
const QT_TRIES = ['offscreen', 'minimal', null];

// Runs Vita3K for one game; returns [{ serial, dir, created }] for what is in ux0/app afterwards
async function installVita({ cmd, prefs, item, zrif, onStep = () => {}, signal }) {
  // Vita3K's own storage first: that's where it installs, and where unpacked games must go to be seen
  const seen = new Set();
  prefs = [...vita3kFsPaths(cmd?.exe), ...prefs].filter((p) => !seen.has(real(p)) && seen.add(real(p)));
  const before = appsIn(prefs);
  // 0.9.19: unencrypted archives never start Vita3K
  if (item.kind === 'vpk') {
    const contents = await vitaArchiveContents(item.file);
    if (!contents.length) throw new Error('No Vita game in this file (no sce_sys/param.sfo).');
    if (!contents.some((c) => c.encrypted)) {
      onStep({ step: 1, of: 1, file: path.basename(item.file), opens: false });
      await vitaUnpack(item.file, prefs[0], contents, { signal, onFile: (n, of) => onStep({ step: 1, of: 1, file: path.basename(item.file), opens: false, pct: Math.floor((n / of) * 100) }) });
      const dir = path.join(prefs[0], 'ux0/app', item.titleId);
      if (!isDir(dir)) return [];
      return [{ serial: item.titleId, dir, created: ![...before.values()].includes(item.titleId), licenced: vitaLicenced(prefs[0], item.titleId, dir) }];
    }
  }
  if (item.kind === 'dir' && !fs.existsSync(path.join(item.file, 'sce_sys/package'))) {
    const sfo = require('./patches').sfoAt(path.join(item.file, 'sce_sys/param.sfo'));
    const { dir, cat } = vitaDest(prefs[0], sfo);
    onStep({ step: 1, of: 1, file: path.basename(item.file), opens: false });
    if (cat.includes('gp')) mergeInto(item.file, path.join(prefs[0], 'ux0/app', sfo.TITLE_ID));
    else { fs.rmSync(dir, { recursive: true, force: true }); mergeInto(item.file, dir); }
    const app = path.join(prefs[0], 'ux0/app', item.titleId);
    return isDir(app) ? [{ serial: item.titleId, dir: app, created: ![...before.values()].includes(item.titleId), licenced: vitaLicenced(prefs[0], item.titleId, app) }] : [];
  }
  // 0.9.23 (owner: "Vita3K still doesn't install"; read from Vita3K main.cpp and app/apps_list.cpp):
  // before it installs anything given on its command line, Vita3K builds its games list, and scan_apps()
  // fails when <storage>/ux0/app doesn't exist yet ("Failed to initialize apps list", exit 1). On a fresh
  // Vita3K, or one that only has firmware, that folder isn't there, so nothing ever installed. It is made
  // first, empty, in Vita3K's own storage (the folder Vita3K would make itself on its first game).
  try { fs.mkdirSync(path.join(prefs[0], 'ux0/app'), { recursive: true }); } catch {}
  // a copy that can't start at all (Vita3K's Qt6 zip build on SteamOS, which an older Cartridge update
  // put in place): say so plainly instead of a silent failure
  const libs = await require('./emuUpdates').missingLibsAsync(cmd?.exe); // 0.9.56: without holding the app
  if (libs.length) throw new Error(`Vita3K can’t start on this system (it needs ${libs.slice(0, 2).join(', ')}${libs.length > 2 ? '…' : ''}). Repair it in Settings → Emulators → Vita3K, then try again.`);
  const env = { ...process.env };
  for (const k of ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'APPDIR', 'APPIMAGE', 'ARGV0', 'OWD']) delete env[k];
  const args = item.kind === 'pkg' ? ['--pkg', item.file, '--zrif', zrif || item.zrif] : [item.file];
  onStep({ step: 1, of: 1, file: path.basename(item.file), opens: false });
  let said = '';
  const run = () => new Promise((resolve, reject) => {
    said = '';
    const p = spawn(cmd.exe, [...cmd.args, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const kill = () => { try { p.kill('SIGKILL'); } catch {} };
    const timer = setTimeout(kill, 3 * 60 * 60e3);
    let quiet = null;
    signal?.addEventListener('abort', kill, { once: true });
    const watch = (d) => {
      said = (said + d.toString()).slice(-24000);
      if (item.kind === 'pkg') return; // --pkg quits by itself without a window
      // all contents done (it boots the game next), or something it won't install: stop it now
      if (/will auto-boot|not a supported content|Vitamin dump|Failed to refresh apps list/i.test(said)) return kill();
      // a DLC-only archive has no auto-boot line: stop once it has been quiet after the last install
      if (/installed successfully/i.test(said)) { clearTimeout(quiet); quiet = setTimeout(kill, 1200); }
    };
    p.stdout.on('data', watch); p.stderr.on('data', watch);
    p.on('error', (e) => { clearTimeout(timer); reject(new Error(`Vita3K didn't start: ${e.message}`)); });
    p.on('exit', () => { clearTimeout(timer); clearTimeout(quiet); resolve(); });
  });
  for (const qpa of QT_TRIES) {
    if (qpa) env.QT_QPA_PLATFORM = qpa; else delete env.QT_QPA_PLATFORM;
    await run();
    if (!NO_QT.test(said)) break;
  }
  // where Vita3K really put it: its "Extracting <ux0>/app/<ID>/..." and "Decrypt layer: <ux0>/app/<ID>" lines
  const named = [...said.matchAll(/(?:Extracting|Decrypt layer:)\s+(.+?)[\/\\]ux0[\/\\](?:app|patch|addcont)[\/\\]/g)].map((m) => m[1].trim());
  for (const r of named) if (!prefs.some((p) => real(p) === real(r))) prefs.push(r);
  const dir = [...appsIn(prefs)].find(([d, n]) => n === item.titleId && vitaSfoId(d) === item.titleId)?.[0];
  if (!dir) {
    const said2 = said + '\n' + vita3kLogTail(cmd?.exe);
    const why = vita3kWhy(said2);
    const e = new Error(why ? `Vita3K: ${why.slice(0, 220)}` : new RegExp(`\\[${item.titleId}\\] installed successfully`).test(said2) ? `Vita3K installed it, but not in a folder Cartridge knows (looked in ${prefs.join(', ')}).` : 'Vita3K closed without installing it and didn’t say why.');
    e.detail = said2.slice(-4000);
    throw e;
  }
  const pref = prefs.find((p) => dir.startsWith(path.join(p, 'ux0/app') + path.sep)) || prefs[0];
  return [{ serial: item.titleId, dir, created: ![...before.values()].includes(item.titleId), licenced: vitaLicenced(pref, item.titleId, dir) }];
}

// Deleting a game from an emulator's storage: only one Cartridge installed, and only when all of
// this holds (plan D3): recorded as created by Cartridge; the folder name is a serial and nothing
// else; its real path (links followed) sits directly in the emulator's game folder (RPCS3
// dev_hdd0/game, Vita3K ux0/app); the game's own PARAM.SFO says the same serial. roots: RPCS3's
// dev_hdd0 folders or Vita3K's pref paths. Returns { ok, dir } or { ok: false, why }.
const RULES = {
  rpcs3: { name: 'RPCS3', id: SERIAL, games: (r) => path.join(r, 'game'), serialOf: sfoSerial },
  vita3k: { name: 'Vita3K', id: VITA_ID, games: (r) => path.join(r, 'ux0/app'), serialOf: vitaSfoId },
};
function safeToRemove(rec, roots) {
  const R = RULES[rec?.emu];
  if (!R || !rec.created) return { ok: false, why: `Cartridge didn’t install this game${R ? ' in ' + R.name : ''}.` };
  if (!R.id.test(rec.serial || '') || path.basename(rec.dir || '') !== rec.serial) return { ok: false, why: 'The folder isn’t named after the game’s serial.' };
  let lst; try { lst = fs.lstatSync(rec.dir); } catch { return { ok: false, why: 'The game’s folder is gone.' }; }
  if (lst.isSymbolicLink() || !lst.isDirectory()) return { ok: false, why: 'The game’s folder is a link, not a folder.' };
  const dir = real(rec.dir);
  const games = roots.map((r) => real(R.games(r)));
  if (!games.includes(path.dirname(dir)) || games.includes(dir)) return { ok: false, why: `The folder isn’t inside ${R.name}’s game folder.` };
  if (R.serialOf(dir) !== rec.serial) return { ok: false, why: 'The game’s PARAM.SFO is missing or names another game.' };
  return { ok: true, dir };
}

// Firmware into the emulator (0.9.16; owner: PS3 and Vita firmware from RomM did nothing in a BIOS
// folder). RPCS3 (rpcs3.cpp): `--headless --installfw <PUP>` installs with no window and quits.
// Vita3K (main.cpp): `--firmware <PUP>` installs into its fs folder and quits. Vita firmware and its
// font package are both .PUP files: each is installed the same way.
// RPCS3's own folders on this device (config: dev_flash; cache: RPCS3.log), installed, Flatpak and EmuDeck's portable copy
function rpcs3Dirs(home = os.homedir(), exe = '') {
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, '.config'), cache = process.env.XDG_CACHE_HOME || path.join(home, '.cache');
  const cfg = [path.join(xdg, 'rpcs3'), path.join(home, '.var/app/net.rpcs3.RPCS3/config/rpcs3')];
  const logs = [path.join(cache, 'rpcs3/RPCS3.log'), path.join(home, '.var/app/net.rpcs3.RPCS3/cache/rpcs3/RPCS3.log')];
  if (exe) { const d = path.dirname(exe); cfg.push(path.join(d, 'config')); logs.push(path.join(d, 'config/cache/RPCS3.log'), path.join(d, 'cache/RPCS3.log')); }
  return { cfg, logs };
}
// 0.9.52 (tested with RPCS3 0.0.43 and Sony's 4.93 PUP): RPCS3 installs the firmware in seconds, writes "Successfully
// installed PS3 firmware version X" to its log, and then ends with exit code 143 or keeps running, so its exit code says
// nothing. Success is that log line, or firmware modules written during this run.
function rpcs3FwDone(since, exe) {
  const { cfg, logs } = rpcs3Dirs(os.homedir(), exe);
  for (const f of logs) {
    try { const st = fs.statSync(f); if (st.mtimeMs < since - 2000) continue; const t = fs.readFileSync(f, 'latin1'); const m = t.match(/Successfully installed PS3 firmware version ([\d.]+)/g); if (m) return { version: m.pop().match(/([\d.]+)\.?$/)[1].replace(/\.$/, '') }; } catch {}
  }
  for (const c of cfg) {
    try { const d = path.join(c, 'dev_flash/vsh/module'), l = fs.readdirSync(d); if (l.length > 50 && l.some((n) => fs.statSync(path.join(d, n)).mtimeMs >= since - 2000)) return { version: null }; } catch {}
  }
  return null;
}
async function installFirmware({ emu, cmd, file, signal }) {
  const env = { ...process.env };
  for (const k of ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'APPDIR', 'APPIMAGE', 'ARGV0', 'OWD']) delete env[k];
  if (emu === 'vita3k') env.QT_QPA_PLATFORM = 'offscreen';
  const args = emu === 'rpcs3' ? [...cmd.args, '--headless', '--installfw', file] : [...cmd.args, '--firmware', file];
  let tail = '';
  const run = () => new Promise((resolve, reject) => {
    tail = '';
    const p = spawn(cmd.exe, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const keep = (b) => { tail = (tail + String(b)).slice(-4000); };
    p.stdout.on('data', keep); p.stderr.on('data', keep);
    const kill = () => { try { p.kill(); } catch {} };
    const timer = setTimeout(kill, 20 * 60e3);
    // RPCS3 may stay open after installing: once its log says it's done, it is closed (0.9.52)
    const watch = emu === 'rpcs3' ? setInterval(() => { if ((done = rpcs3FwDone(started, cmd.exe))) setTimeout(kill, 1500); }, 1000) : null;
    signal?.addEventListener('abort', kill, { once: true });
    p.on('error', (e) => { clearTimeout(timer); clearInterval(watch); reject(new Error(`${emu === 'rpcs3' ? 'RPCS3' : 'Vita3K'} didn't start: ${e.message}`)); });
    p.on('exit', (c) => { clearTimeout(timer); clearInterval(watch); resolve(c); });
  });
  const started = Date.now();
  let done = null;
  let code;
  for (const qpa of emu === 'vita3k' ? QT_TRIES : [undefined]) { // as installVita: no window either way (--firmware quits)
    if (qpa) env.QT_QPA_PLATFORM = qpa; else if (qpa === null) delete env.QT_QPA_PLATFORM;
    code = await run();
    if (!NO_QT.test(tail)) break;
  }
  if (emu === 'rpcs3') {
    if (done || (done = rpcs3FwDone(started, cmd.exe))) return true;
    if (signal?.aborted) throw new Error('Cancelled.');
    throw new Error(`RPCS3 couldn't install the firmware: ${(tail.trim().split('\n').filter((l) => /error|fail|cannot|invalid/i.test(l)).pop() || tail.trim().split('\n').pop() || 'exit ' + code).slice(0, 200)}`);
  }
  if (code && code !== 0) throw new Error(`Vita3K couldn't install the firmware: ${(tail.trim().split('\n').pop() || 'exit ' + code).slice(0, 200)}`);
  return true;
}
module.exports = { rpcs3FwDone, rpcs3Dirs, vita3kFsPaths, vita3kWhy, vita3kLogTail, installFirmware, pkgInfo, packagesIn, licencePlan, stageLicences, exdataHas, npdOf, rpcs3Hdds, sfoSerial, install, vitaPrefs, vitaContent, findZrif, installVita, vitaArchiveContents, vitaUnpack, safeToRemove };
