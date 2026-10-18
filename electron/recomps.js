'use strict';
// Recomps (0.9.65, owner: "ReComps are the main focus of this right now"): native PC ports of console games, made by
// static recompilation, decompilation or a rebuild from scratch (Zelda 64: Recompiled, Ship of Harkinian, Unleashed
// Recompiled). Each needs the player's own copy of the game, never an emulator.
//
// Since 0.9.70 (owner: a curated list, "Cartridge Verified") the list is the recipes in electron/recipes/ (one per
// game, docs/recipes.md), read once a day from Cartridge's repository so new ports arrive without an app update.
// Verified ports are installed, given the player's copy, configured and started by Cartridge (recipes.js); recomps
// added from a GitHub link and ones kept from the old catalogue are Unverified and set themselves up.
//
// What Cartridge does with one: download its build (Linux first, Windows through Proton only when there is no Linux
// build, never Android, macOS or ARM), put it in <Emulation>/recomp/<console>/<name>, hand it the game file the way
// it takes one (place, path or its own picker), check that file is the version it needs, and add it to Steam as its
// own shortcut in a "Recomps" collection. Updates are never automatic: saves are backed up first, the release it
// replaces is kept beside it (forkVersions.js) for Roll Back, and saves are checked afterwards.
//
// The pure parts (matching, picking a build, save paths, hashes) are exported for
// test/recomps.test.js; the engine takes its outside world through ctx.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');

// console folder keys (ES-DE names, as roms/) and the names shown for them
const CONSOLES = { arcade: 'Arcade', nes: 'NES', snes: 'SNES', n64: 'Nintendo 64', gb: 'Game Boy', gbc: 'Game Boy Color', gba: 'Game Boy Advance', gamecube: 'GameCube', nds: 'Nintendo DS', wii: 'Wii', genesis: 'Genesis', psx: 'PlayStation', ps2: 'PlayStation 2', ps4: 'PlayStation 4', xbox360: 'Xbox 360' };
// RomM platform slugs of each, for finding the player's copy in their library
const SLUGS = { arcade: /^(arcade|mame|model3|naomi|cps\d?|neogeo)$/, nes: /^(nes|famicom|fds)$/, snes: /^(snes|sfam)$/, n64: /^n64$/, gb: /^gb$/, gbc: /^gbc?$/, gba: /^gba$/, gamecube: /^(ngc|gc|gamecube)$/, nds: /^nds$/, wii: /^wii$/, genesis: /^(genesis.*|megadrive|md)$/, psx: /^(psx|ps1|ps|playstation)$/, ps2: /^ps2$/, ps4: /^ps4.*$/, xbox360: /^(xbox360|x360)$/ };
const consoleOfSlug = (slug) => Object.keys(SLUGS).find((k) => SLUGS[k].test(String(slug || '').toLowerCase())) || null;

// ---------------------------------------------------------------- names
// a title as words to compare: lower case, & = and, no marks or punctuation, "the" at the front dropped
function norm(t) {
  return String(t || '').toLowerCase().replace(/[™®©]/g, '').replace(/&/g, ' and ').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/^the /, '').trim();
}
// the forms of a title a library might use: whole, without a bracketed part, and with "The" moved ("Legend of Zelda, The")
function titleKeys(title) {
  const t = String(title || '');
  const out = new Set([norm(t), norm(t.replace(/\s*[([].*?[)\]]\s*/g, ' ')), norm(t.replace(/^(.*), the\b/i, 'the $1'))]);
  out.delete('');
  return [...out];
}
// the library's titles by console, indexed once per library (a big library times every recomp is too much work to
// redo for each one): Map "<console>|<title key>" -> rom ids
const INDEX = new WeakMap();
function indexOf(roms) {
  let ix = INDEX.get(roms);
  if (ix) return ix;
  ix = new Map();
  for (const r of roms || []) {
    const con = consoleOfSlug(r.platform_slug);
    if (!con) continue;
    for (const k of titleKeys(r.name)) { const key = con + '|' + k; const l = ix.get(key); if (l) l.push(r.id); else ix.set(key, [r.id]); }
  }
  if (roms && typeof roms === 'object') INDEX.set(roms, ix);
  return ix;
}
// library games this recomp is for: same console family, same title
function matchRoms(entry, roms) {
  const ix = indexOf(roms || []), out = new Set();
  for (const g of entry.games || []) {
    const cons = g.console === 'gbc' ? ['gbc', 'gb'] : [g.console];
    for (const k of titleKeys(g.title).concat((g.also || []).flatMap(titleKeys))) for (const c of cons) for (const id of ix.get(c + '|' + k) || []) out.add(id);
  }
  return [...out];
}

// ---------------------------------------------------------------- builds
const NOT_FILE = /\.(sha\d*|md5|sig|asc|zsync|txt|json|pdb|dbg)$/i;
const rx = (s) => { try { return s ? new RegExp(s, 'i') : null; } catch { return null; } };
// the release file to install: its Linux build first, else its Windows build (run through Proton), nothing else.
// The catalogue's own pattern for a project wins; otherwise the same rules as an emulator from a link (0.9.64).
function pickBuild(assets, e = {}) {
  const C = require('./customEmu'), list = (assets || []).filter((a) => !NOT_FILE.test(a.name));
  const lr = rx(e.linuxAsset), wr = rx(e.windowsAsset);
  // a Cartridge Verified recipe (0.9.70) names its file exactly: that file or none, never a guess
  if (e.strict) { const a = lr ? list.find((x) => lr.test(x.name)) : wr ? list.find((x) => wr.test(x.name)) : null; return a ? { asset: a, kind: lr ? 'linux' : 'windows' } : null; }
  if (e.builds !== 'windows') {
    const a = (lr && list.find((x) => lr.test(x.name))) || C.pickAsset(list) || (!lr && C.pickArchive(list));
    if (a) return { asset: a, kind: 'linux' };
  }
  const w = (wr && list.find((x) => wr.test(x.name))) || C.pickWindows(list);
  return w ? { asset: w, kind: 'windows' } : null;
}
// "github:owner/name" | "gitlab:owner/name" -> { host, repo }
function repoOf(s) {
  const m = /^(github|gitlab):([\w.-]+\/[\w.-]+)$/.exec(String(s || ''));
  return m ? { host: m[1], repo: m[2] } : null;
}
function projectUrl(e) {
  const r = repoOf(e?.repo);
  return r ? `https://${r.host}.com/${r.repo}` : e?.site || null;
}
// a project's releases: GitHub (github.js, its API else its pages) or GitLab's API. want(assets) picks the newest
// release that has a build this device can use (a project whose newest build failed for Linux still gives its last)
async function releaseOf(e, { pre = false, fetchImpl } = {}) {
  const r = repoOf(e.repo);
  if (!r) return null;
  const want = (assets) => !!pickBuild(assets, e);
  if (r.host === 'github') return require('./github').release(r.repo, { pre, want, ...(fetchImpl ? { fetchImpl } : {}) });
  const f = fetchImpl || require('./webFetch');
  const res = await f(`https://gitlab.com/api/v4/projects/${encodeURIComponent(r.repo)}/releases?per_page=10`, { headers: { 'User-Agent': 'Cartridge' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`GitLab answered ${res.status}.`);
  const all = (await res.json()).filter((x) => !x.upcoming_release).map((x) => ({ tag: x.tag_name, date: x.released_at || x.created_at || '', pre: /(pre|beta|alpha|rc|nightly)/i.test(x.tag_name), assets: (x.assets?.links || []).map((l) => ({ name: l.name || l.url.split('/').pop(), url: l.direct_asset_url || l.url, size: 0 })) }));
  const ok = all.filter((x) => pre || !x.pre);
  return ok.find((x) => want(x.assets)) || ok[0] || null;
}

// 0.9.80 (agreed plan 7.1 #13): a project that publishes its builds only from GitHub Actions (openmbu has Linux builds
// only as artifacts): the newest artifact that hasn't expired, from GitHub's public API (main or master first).
// Downloading an artifact needs a signed-in GitHub account, so Cartridge opens the run's page in its own window and
// installs what you download there (installFrom).
const CI_LINUX = /linux|appimage|ubuntu|steam.?deck/i, CI_WIN = /win(dows)?(32|64)?([-_ ]?(x64|x86_64|amd64))?(\b|_)|msvc|mingw/i, CI_NOT = /\b(arm|arm64|aarch64|android|mac|macos|osx|darwin|ios|debug|symbols|pdb)\b/i;
async function ciBuildOf(e, { fetchImpl } = {}) {
  const r = repoOf(e.repo);
  if (!r || r.host !== 'github') return null;
  const f = fetchImpl || require('./webFetch');
  const res = await f(`https://api.github.com/repos/${r.repo}/actions/artifacts?per_page=50`, { headers: { 'User-Agent': 'Cartridge', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) return null;
  const all = ((await res.json())?.artifacts || []).filter((a) => a && !a.expired && !CI_NOT.test(a.name));
  const main = (a) => (/^(main|master|trunk)$/.test(a.workflow_run?.head_branch || '') ? 1 : 0);
  const pick = (re) => all.filter((a) => re.test(a.name)).sort((a, b) => main(b) - main(a) || String(b.created_at).localeCompare(String(a.created_at)))[0];
  const lin = e.builds !== 'windows' ? pick(CI_LINUX) : null, a = lin || pick(CI_WIN);
  if (!a) return null;
  const run = a.workflow_run?.id || null, at = String(a.created_at || '');
  return { tag: `build ${at.slice(0, 16).replace('T', ' ')}`, date: at, kind: lin ? 'linux' : 'windows', name: a.name, size: a.size_in_bytes || 0, ci: { id: a.id, run, url: run ? `https://github.com/${r.repo}/actions/runs/${run}` : `https://github.com/${r.repo}/actions` } };
}

// ---------------------------------------------------------------- saves
// a save place from the catalogue on this device: ~ is home, $XDG_* the usual folders, a plain path is inside the
// recomp's own folder
function expandPath(p, dir, home = os.homedir()) {
  let s = String(p || '').trim();
  if (!s) return null;
  const xdg = { XDG_DATA_HOME: process.env.XDG_DATA_HOME || path.join(home, '.local/share'), XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || path.join(home, '.config') };
  s = s.replace(/^\$(XDG_DATA_HOME|XDG_CONFIG_HOME)\b/, (_, k) => xdg[k]).replace(/^~(?=\/|$)/, home);
  if (path.isAbsolute(s)) return path.normalize(s);
  return dir ? path.join(dir, s) : null;
}
// 0.9.67: the catalogue's save notes are often sentences ("pokeemerald.sav in the working directory", "Documents/svr07
// inside the Proton prefix", "~/.local/share/X/storage/ (persistent data) and ~/.local/share/X/savestates/"). Before,
// a whole sentence was taken as a path, so backups found nothing and Save Sync could make a folder named like it.
// Now only real paths are read out of a note:
//  - every ~/ or $XDG_ path in it;
//  - a leading file or folder name followed by nothing, "(", "in", "beside", "relative", "and", ";" or "," (relative
//    to the recomp's folder, its working directory); a second name after "and" too;
//  - Windows notes (Documents/, %APPDATA%, %LOCALAPPDATA%, "inside the Proton prefix") inside the Steam shortcut's own
//    Proton prefix (compatdata/<appid>), only for Windows builds that are in Steam;
//  - names with placeholders (<n>, <game>, *) give their folder, or nothing.
// A Flatpak recomp's ~/.config and ~/.local/share are its sandbox's (~/.var/app/<id>/config, /data).
const STEAM_ROOTS = (home) => [path.join(home, '.local/share/Steam'), path.join(home, '.steam/steam'), path.join(home, '.var/app/com.valvesoftware.Steam/.local/share/Steam')];
function protonUser(rec, home) {
  if (!rec?.appid) return null;
  for (const r of STEAM_ROOTS(home)) { const d = path.join(r, 'steamapps/compatdata', String(rec.appid), 'pfx/drive_c/users/steamuser'); try { if (fs.statSync(d).isDirectory()) return d; } catch {} }
  return null;
}
const placeholder = (t) => /[<>*]/.test(t);
function savePaths(note, rec, home = os.homedir()) {
  const dir = rec?.dir, out = [];
  let s = String(note || '').trim();
  if (/^<install folder>/i.test(s)) { if (!dir) return out; s = s.replace(/^<install folder>/i, '').replace(/\s+\(.*$|;.*$/, '').replace(/^\/+/, ''); return s ? [path.join(dir, s)] : out; } // re:Blue: <install folder>/profiles/default
  if (!s) return out;
  const add = (p) => { if (p) out.push(p); };
  const winNote = /inside the Proton prefix|%(LOCAL)?APPDATA%|^Documents[\\/]/i.test(s);
  if (winNote) {
    if (rec?.kind !== 'windows') { /* a Linux build: only the Linux paths in the note count (below) */ }
    else {
      const user = protonUser(rec, home);
      const m = /(Documents|%LOCALAPPDATA%|%APPDATA%)[\\/]([^();]+?)(?=\s+inside|\s*\(|\s+on Windows|;|$)/i.exec(s);
      if (user && m) add(path.join(user, { documents: 'Documents', '%localappdata%': 'AppData/Local', '%appdata%': 'AppData/Roaming' }[m[1].toLowerCase()], ...m[2].trim().split(/[\\/]+/)));
      return out;
    }
  }
  // ~/ and $XDG_ paths anywhere in the note
  for (const m of s.matchAll(/(?:^|[\s(;,])((?:~|\$XDG_(?:DATA|CONFIG)_HOME)\/[^\s;,()]*)/g)) { const t = m[1].replace(/[.:]$/, ''); if (!placeholder(t)) add(expandPath(t, dir, home)); }  // a placeholder in a home path (OpenGOAL/<game>) would widen it to other games' folders: left out
  // a leading relative name, and a second one after "and"
  const lead = /^([\w.\-\/<>*]+)(?:\s+and\s+(?:the other\s+)?([\w.\-\/<>*]+))?(?=$|\s*\(|\s+in\b|\s+beside\b|\s+relative\b|\s+and\b|\s*[;,])/.exec(s);
  if (lead && !/^(~|\$|\/)/.test(lead[1])) for (const t of [lead[1], lead[2]].filter(Boolean)) {
    const u = placeholder(t) ? (t.includes('/') ? t.replace(/\/[^/]*[<>*][^/]*$/, '') : null) : t;
    if (u && dir) add(path.join(dir, u.replace(/\/$/, '')));
  }
  return out;
}
function sandboxed(p, rec, home) {
  if (!rec?.flatpak) return p;
  const app = path.join(home, '.var/app', rec.flatpak);
  return p.replace(path.join(home, '.config') + path.sep, path.join(app, 'config') + path.sep).replace(path.join(home, '.local/share') + path.sep, path.join(app, 'data') + path.sep);
}
function saveDirs(e, rec, home = os.homedir()) {
  return [...new Set((e?.saves || []).flatMap((p) => savePaths(p, rec, home)).map((p) => sandboxed(path.normalize(p).replace(/(.)\/+$/, '$1'), rec, home)))];
}

// 0.9.69 (agreed plan 7.1 #13): a recomp from a link or found automatically has no save notes. Its backups take what
// it wrote beside itself (anything at its folder's top that isn't one of its release's own files) and the folders
// in ~/.config and ~/.local/share named after it (its program, project or name). Backups only: Save Sync stays with
// the catalogue's known save places, so nothing guessed is ever uploaded.
const squash = (t) => String(t || '').toLowerCase().replace(/\.(appimage|exe|x86_64)$/i, '').replace(/[^a-z0-9]/g, '');
function guessSaves(e, rec, home = os.homedir()) {
  if (!rec?.dir) return [];
  const out = [], own = new Set((rec.files || []).map((f) => String(f).split('/')[0]));
  if (own.size) for (const n of (() => { try { return fs.readdirSync(rec.dir); } catch { return []; } })()) if (!own.has(n) && !n.startsWith('.')) out.push(path.join(rec.dir, n));
  const names = new Set([rec.program && path.basename(rec.program), e?.repo && e.repo.split('/').pop(), e?.name].map(squash).filter((x) => x.length >= 3));
  for (const base of [path.join(home, '.config'), path.join(home, '.local/share')]) for (const n of (() => { try { return fs.readdirSync(base); } catch { return []; } })()) if (names.has(squash(n))) out.push(path.join(base, n));
  // nothing big: a game's own files (an extracted disc, an ISO) put beside it would be copied on every update
  const small = (p) => { let n = 0, left = 20000; const walk = (x) => { if (--left < 0 || n > SAVE_CAP) return; let st; try { st = fs.lstatSync(x); } catch { return; } if (st.isDirectory()) { for (const c of (() => { try { return fs.readdirSync(x); } catch { return []; } })()) walk(path.join(x, c)); } else n += st.size; }; walk(p); return left >= 0 && n <= SAVE_CAP; };
  return [...new Set(out)].filter(small).slice(0, 20);
}
const SAVE_CAP = 256 * 1024 * 1024;

const slugId = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'recomp';

// ---------------------------------------------------------------- hashes (in a worker: a disc image can be gigabytes)
// md5 and sha1 of a file, and for an N64 ROM in byte-swapped (.v64) or little-endian (.n64) order, of its big-endian
// (.z64) form too, which is what projects list
const HASH_WORKER = `
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs'), crypto = require('crypto');
const f = workerData.file;
const md5 = crypto.createHash('md5'), sha1 = crypto.createHash('sha1');
let zm = null, zs = null, order = null, first = true;
const s = fs.createReadStream(f, { highWaterMark: 1 << 20 });
s.on('data', (b) => {
  md5.update(b); sha1.update(b);
  if (first) { first = false; if (workerData.n64 && b.length >= 4) { const h = b.readUInt32BE(0); order = h === 0x37804012 ? 'v64' : h === 0x40123780 ? 'n64' : null; if (order) { zm = crypto.createHash('md5'); zs = crypto.createHash('sha1'); } } }
  if (order) { const c = Buffer.from(b); if (order === 'v64') c.swap16(); else c.swap32(); zm.update(c); zs.update(c); }
});
s.on('end', () => parentPort.postMessage({ md5: md5.digest('hex'), sha1: sha1.digest('hex'), z64md5: zm ? zm.digest('hex') : null, z64sha1: zs ? zs.digest('hex') : null, order }));
s.on('error', (e) => parentPort.postMessage({ error: e.message }));
`;
function hashFile(file, { n64 = false } = {}) {
  return new Promise((ok, bad) => {
    const { Worker } = require('worker_threads');
    const w = new Worker(HASH_WORKER, { eval: true, workerData: { file, n64 } });
    w.once('message', (m) => { w.terminate(); m.error ? bad(new Error(m.error)) : ok(m); });
    w.once('error', bad);
  });
}
// does this file fit what the recomp needs? -> { ok, why, warn }
// the game put into an argument template: quoted once, Z: once for Windows builds, whether or not the template
// already quotes it ("{FILE}", "Z:{FILE}" gave ""/path"" and "Z:"Z:/path"" before 0.9.68)
function fileArg(tpl, file, win) {
  return String(tpl).replace(/"?(Z:)?\{FILE\}"?/g, (m, z) => `"${z || win ? 'Z:' : ''}${file}"`);
}
// the catalogue's own launch arguments as one command line: a string as written, or a list (Half-Life: Decay's
// ["-game", "decay"], which `${}` turned into "-game,decay")
function argString(a) {
  return Array.isArray(a) ? a.map((x) => (/[\s"]/.test(String(x)) ? `"${String(x).replace(/"/g, '')}"` : String(x))).join(' ') : String(a || '').trim();
}
// a setup template written with the program's name first ("doom64ex -wadgen {FILE}"): the name comes off, as the
// program is started by its path (0.9.65 to 0.9.67 passed the name to it as its first argument)
function setupTpl(e) {
  const t = String(e?.setup?.arg || '').trim(), first = t.split(/\s+/)[0] || '', prog = path.basename(String(e?.program || ''));
  return prog && first.toLowerCase() === prog.toLowerCase() ? t.slice(first.length).trim() : t;
}
// the files a .cue or .m3u names beside it (a disc image's tracks, a multi-disc list), which go wherever it goes
function companions(file) {
  if (!/\.(cue|m3u)$/i.test(file)) return [];
  let txt = ''; try { txt = fs.readFileSync(file, 'utf8').slice(0, 64 * 1024); } catch { return []; }
  const names = /\.cue$/i.test(file) ? [...txt.matchAll(/^\s*FILE\s+"?([^"\r\n]+?)"?\s+\w+\s*$/gim)].map((m) => m[1]) : txt.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  return [...new Set(names.map((n) => path.join(path.dirname(file), n)))].filter((p) => p !== file && fs.existsSync(p));
}
// where your copy goes for a "place" recomp (0.9.68). Read from the catalogue's setup.to, written as paths; never from
// setup.place, which is the research note in words (0.9.65 to 0.9.67 linked your copy under a file named like the
// sentence: Ship of Harkinian got "the ROM in the same folder as soh.appimage ..." beside it and never found it).
//   to.file   where a picked file goes: "x/" is a folder (the file keeps its name), anything else is the exact name
//   to.dir    the folder a picked folder's contents go into (made when missing)
//   to.names  names for the disc files, in order (REDRIVER2 reads install/Driver2CD1.bin and Driver2CD2.bin)
// Relative paths are beside the program (its working folder), ~/ and $XDG_ paths in your home. A .cue or .m3u
// brings the files it names. Returns { links: [{ from, to }] } or { why }.
function placePlan(e, rec, file, isDir) {
  const to = e?.setup?.to;
  if (!to) return { why: `Cartridge doesn’t know where ${e?.name || 'it'} looks for your copy. ${e?.setup?.place ? 'Its notes say: ' + e.setup.place : ''}`.trim() };
  const base = rec.flatpak ? rec.dir : path.dirname(rec.program);
  const at = (p) => expandPath(String(p).replace(/\/+$/, '') || '.', base);
  const want = (n) => !e.needs?.ext?.length || e.needs.ext.map((x) => String(x).toLowerCase()).includes(path.extname(n).slice(1).toLowerCase());
  const sorted = (dir) => { try { return fs.readdirSync(dir).filter((n) => !n.startsWith('.')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); } catch { return []; } };
  let links;
  if (isDir) {
    if (!to.dir) return { why: `${e.name} takes a file here, not a folder: ${e.needs?.what || ''}`.trim() };
    const into = at(to.dir);
    const ents = to.names ? sorted(file).filter(want).slice(0, to.names.length) : sorted(file);
    if (!ents.length) return { why: 'That folder is empty.' };
    links = ents.map((n, i) => ({ from: path.join(file, n), to: path.join(into, to.names ? to.names[i] : n) }));
  } else {
    if (!to.file) return { why: `${e.name} needs the game as a folder: ${e.needs?.what || ''}`.trim() };
    const folder = /\/$/.test(to.file), dest = at(to.file);
    if (to.names) {
      // the disc files beside the one picked (same ending), disc 1 first
      const ext = path.extname(file).toLowerCase(), all = sorted(path.dirname(file)).filter((n) => path.extname(n).toLowerCase() === ext).slice(0, to.names.length);
      const into = folder ? dest : path.dirname(dest);
      links = all.map((n, i) => ({ from: path.join(path.dirname(file), n), to: path.join(into, to.names[i]) }));
    } else {
      const main = folder ? path.join(dest, path.basename(file)) : dest;
      links = [{ from: file, to: main }, ...companions(file).map((f) => ({ from: f, to: path.join(path.dirname(main), path.basename(f)) }))];
    }
  }
  return { links };
}
async function checkGame(e, file) {
  const need = e?.needs;
  if (!need) return { ok: true };
  const st = await fsp.stat(file).catch(() => null);
  if (!st) return { ok: false, why: 'That file isn’t there any more.' };
  // a place recomp's own rule says which it takes (0.9.68: AC6 takes its .iso or an assets/ folder)
  const to = e.setup?.how === 'place' ? e.setup.to : null;
  const takesDir = to ? !!to.dir : need.files === 'folder', takesFile = to ? !!to.file : need.files !== 'folder';
  if (!takesFile && !st.isDirectory()) return { ok: false, why: `${e.name} needs the game as a folder: ${need.what}` };
  if (!takesDir && st.isDirectory()) return { ok: false, why: `${e.name} needs a file, not a folder: ${need.what}` };
  if (st.isDirectory()) return { ok: true };
  const ext = path.extname(file).slice(1).toLowerCase();
  if (need.ext?.length && !need.ext.map((x) => String(x).toLowerCase()).includes(ext)) {
    return { ok: false, why: `${e.name} needs ${need.ext.map((x) => '.' + x).join(', ')}${/^(zip|7z|rar)$/.test(ext) ? ' (unpacked)' : ''}. Yours is .${ext || 'a file without an extension'}. It needs: ${need.what}` };
  }
  const md5 = (need.md5 || []).map((h) => String(h).toLowerCase()), sha1 = (need.sha1 || []).map((h) => String(h).toLowerCase());
  if (!md5.length && !sha1.length) return { ok: true };
  const h = await hashFile(file, { n64: (e.games || []).some((g) => g.console === 'n64') });
  const hit = md5.includes(h.md5) || sha1.includes(h.sha1) || (h.z64md5 && md5.includes(h.z64md5)) || (h.z64sha1 && sha1.includes(h.z64sha1));
  return hit ? { ok: true, hash: h } : { ok: false, hash: h, wrong: true, why: `Your copy isn’t the version ${e.name} needs. It needs: ${need.what}. Yours doesn’t match any version the project lists.` };
}

// a download's kind from its first bytes (GitLab release links can have no file ending: sonicdcer's ports)
function sniff(file) {
  let b = Buffer.alloc(12);
  try { const fd = fs.openSync(file, 'r'); fs.readSync(fd, b, 0, 12, 0); fs.closeSync(fd); } catch { return null; }
  if (b.readUInt32LE(0) === 0x04034b50) return '.zip';
  if (b[0] === 0x1f && b[1] === 0x8b) return '.tar.gz';
  if (b.toString('latin1', 0, 6) === '7z\xbc\xaf\x27\x1c') return '.7z';
  if (b[0] === 0xfd && b.toString('latin1', 1, 5) === '7zXZ') return '.tar.xz';
  if (b[0] === 0x28 && b[1] === 0xb5 && b[2] === 0x2f && b[3] === 0xfd) return '.tar.zst';
  if (b[0] === 0x7f && b.toString('latin1', 1, 4) === 'ELF') return b[8] === 0x41 && b[9] === 0x49 ? '.AppImage' : '.elf'; // AppImages carry "AI" at byte 8
  if (b[0] === 0x4d && b[1] === 0x5a) return '.exe';
  return null;
}
const ARCHIVE_END = /\.(zip|7z|rar|tar(\.(gz|xz|zst|bz2))?|tgz|txz)$/i;

// ---------------------------------------------------------------- the engine

// ---------------------------------------------------------------- project details (0.9.66, agreed plan: the project's
// stars, newest version, its release notes and the first picture of its README on the recomp's page)
// the first picture a README shows: markdown ![](x) or <img src="x">, made absolute against the README's own folder;
// badges (shields.io and the like, .svg) are skipped
function readmePicture(md, base) {
  const re = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|<img[^>]*?\ssrc\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(String(md || '')))) {
    const u = (m[1] || m[2] || '').trim();
    if (!u || /shields\.io|badge|badgen|img\.shields|actions\/workflows|\.svg(\?|$)|discord(app)?\.com\/api|ko-fi|paypal|patreon/i.test(u)) continue;
    try { const abs = new URL(u, base).href; if (/^https:\/\//.test(abs)) return abs.replace(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\//, 'https://raw.githubusercontent.com/$1/'); } catch {}
  }
  return null;
}
// release notes as plain text: markdown marks taken off, links to their words, at most ~900 characters
function plainNotes(md) {
  let t = String(md || '').replace(/\r/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^#{1,6}\s*/gm, '').replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/(\*\*|__|`{1,3})/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length > 900) t = t.slice(0, 900).replace(/\s+\S*$/, '') + ' …';
  return t;
}
// a link's own words for its console and game (0.9.66, agreed plan: Cartridge guesses, the person confirms): console
// names and their short forms in the project's name and description, then the library game whose title it holds
const CON_WORDS = [
  ['n64', /\b(n64|nintendo 64|ultra ?64)\b/i], ['snes', /\b(snes|super nintendo|super famicom|sfc)\b/i], ['nes', /\b(nes|famicom)\b/i],
  ['gb', /\bgame ?boy(?! (color|colour|advance))\b|\bgb\b/i], ['gbc', /\b(gbc|game ?boy colou?r)\b/i], ['gba', /\b(gba|game ?boy advance)\b/i],
  ['nds', /\b(nds|nintendo ds)\b/i], ['3ds', /\b3ds\b/i], ['gamecube', /\b(gamecube|gcn|ngc)\b/i], ['wii', /\bwii(?! ?u)\b/i], ['wiiu', /\bwii ?u\b/i], ['switch', /\b(nintendo switch|switch)\b/i],
  ['psx', /\b(ps1|psx|playstation 1|playstation one)\b/i], ['ps2', /\b(ps2|playstation 2)\b/i], ['ps3', /\b(ps3|playstation 3)\b/i], ['ps4', /\b(ps4|playstation 4)\b/i], ['psp', /\bpsp\b/i], ['psvita', /\b(vita|psvita)\b/i],
  ['xbox', /\bxbox(?! ?360| one| series)\b/i], ['xbox360', /\b(xbox ?360|x360)\b/i], ['genesis', /\b(genesis|mega ?drive)\b/i], ['dc', /\bdreamcast\b/i], ['saturn', /\bsaturn\b/i], ['arcade', /\barcade\b/i],
];
function guessFromText(text, roms = [], consoles = {}) {
  const t = String(text || '').replace(/[-_.]+/g, ' ');
  let con = null;
  for (const [k, re] of CON_WORDS) if (consoles[k] && re.test(t)) { con = k; break; }
  // the game: the longest library title whose words all appear, on that console when one was found
  const words = new Set(norm(t).split(' ').filter(Boolean));
  let best = null;
  for (const r of roms) {
    const slug = consoleOfSlug(r.platform_slug || r.slug || '');
    if (con && slug && slug !== con) continue;
    // the whole title, or its part after a colon or dash ("Majora's Mask" of "The Legend of Zelda: Majora's Mask"):
    // a part counts with two words or more, or one word of six letters or more
    const parts = [r.name || '', ...String(r.name || '').split(/\s*[:\-–]\s+/).slice(1)];
    for (const part of parts) {
      const key = norm(part).split(' ').filter((w) => w.length > 1);
      if (!key.length || (key.length < 2 && key[0].length < 6) || !key.every((w) => words.has(w))) continue;
      const len = key.join(' ').length;
      if (!best || len > best.len) best = { title: r.name, console: slug || null, len, romId: r.id };
    }
  }
  return { console: con || best?.console || null, title: best?.title || null, romId: best?.romId || null };
}

// a downloaded release file checked against GitHub's SHA-256 of it (0.9.71; GitHub lists one for every release file
// since 2025, older releases have none and pass), read as a stream so the main thread never waits on a big file
async function checkDigest(file, digest) {
  if (!digest) return;
  const want = String(digest).replace(/^sha256:/, '');
  const h = require('crypto').createHash('sha256');
  await new Promise((ok, bad) => fs.createReadStream(file).on('data', (c) => h.update(c)).on('end', ok).on('error', bad));
  if (h.digest('hex') !== want) { fs.rmSync(file, { force: true }); throw new Error('The download didn’t match the checksum GitHub gives for it, so it was thrown away. Try again; if it happens again, the release itself may be broken.'); }
}
function createRecomps(ctx) {
  const { dataDir, log = () => {} } = ctx;
  const F = (n) => path.join(dataDir, n);
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
  const writeJson = (f, v) => { try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 1)); fs.renameSync(f + '.tmp', f); } catch (e) { log('recomps: write', path.basename(f), e.message); } };
  const RC = require('./recipes');
  let installs = readJson(F('recomp-installs.json'), {});
  let latest = readJson(F('recomp-latest.json'), {});
  const saveInstalls = () => writeJson(F('recomp-installs.json'), installs);
  let cat = null;
  // the catalogue (0.9.70, owner: "remove all the games and make them Cartridge verified"): the verified recipes
  // (electron/recipes, a newer copy of any of them from Cartridge's repository), then recomps you added from a link.
  // ctx.shipped is a plain list for the tests. A recomp installed from the old list (0.9.65 to 0.9.69) stays, as one
  // from a link: Unverified, set up as it was.
  function catalogue() {
    if (cat) return cat;
    const out = [], ids = new Set(), repos = new Set();
    const add = (e, from) => {
      if (!e?.id || ids.has(e.id) || (e.repo && repos.has(e.repo.toLowerCase()))) return;
      ids.add(e.id); if (e.repo) repos.add(e.repo.toLowerCase());
      // a place with no rule Cartridge can follow (a patcher, a mod folder inside another game): you put it in place
      // yourself, then press It's Set Up (0.9.68)
      let setup = e.setup?.how === 'place' && !e.setup.to ? { ...e.setup, how: 'manual' } : e.setup, needs = e.needs;
      // 0.9.69: a recomp from a link: nothing says what it needs, so it's set up when you say so (open it, follow its
      // own steps, It's Set Up), never counted as ready the moment it's installed
      if ((from === 'link' || from === 'found') && !needs) { needs = { what: `Your own copy of ${e.games?.[0]?.title || 'the game'}, if it asks for one. Open it and follow its own steps.`, files: 'any' }; setup = { how: 'picker' }; }
      out.push({ ...e, setup, needs, from });
    };
    for (const r of RC.load({ dir: ctx.recipesDir, fetched: readJson(F('recipes-fetched.json'), []), log })) add(verifiedEntry(r), 'verified');
    if (ctx.shipped) for (const e of readJson(ctx.shipped, { entries: [] }).entries || []) add(e, 'list');
    for (const e of readJson(F('recomps-mine.json'), [])) add(e, 'link');
    // installed from the old list: kept as from a link, under the name of its folder
    for (const [id, rec] of Object.entries(installs)) {
      if (ids.has(id) || !rec?.dir) continue;
      const name = path.basename(rec.dir), con = path.basename(path.dirname(rec.dir));
      add({ id, name, games: [{ title: name, console: CONSOLES[con] ? con : 'other' }], origin: 'recomp', repo: rec.repo || null, builds: rec.kind === 'windows' ? 'windows' : 'linux', needs: null, setup: { how: 'none' }, saves: [], kept: true }, 'kept');
    }
    cat = { updated: '', entries: out };
    return cat;
  }
  // a recipe as a catalogue entry: everything the screens and the engine read, the recipe itself beside it
  function verifiedEntry(r) {
    return { id: r.id, name: r.name, games: [{ console: r.game.console, title: r.game.title, also: r.game.also || [] }], origin: 'port', repo: r.repo, description: r.about || '', by: r.by || '', license: r.licence || null, verified: r.verified || null, recipe: r, needs: { what: r.game.why || `Your own copy of ${r.game.title}.`, files: 'folder' }, setup: { how: 'verified' }, saves: [] };
  }
  const byId = (id) => catalogue().entries.find((e) => e.id === id) || null;
  const folderName = (e) => String(e.name || e.id).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || e.id;
  // where recomps live: <Emulation>/recomp/<console>/<name> on the main Emulation folder
  function homeDir(e) {
    const root = ctx.recompRoot();
    return path.join(root, e.games?.[0]?.console || 'other', folderName(e));
  }
  // recomp/<console> in every Emulation folder (owner: "added to every emulation folder"), for consoles in the catalogue
  function ensureFolders() {
    const keys = new Set(catalogue().entries.flatMap((e) => (e.games || []).map((g) => g.console)).filter((k) => CONSOLES[k]));
    let made = 0;
    for (const root of ctx.recompRoots()) for (const k of keys) { const d = path.join(root, k); if (!fs.existsSync(d)) { try { fs.mkdirSync(d, { recursive: true }); made++; } catch {} } }
    return made;
  }
  const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
  // installed and set up? A recomp that names a file made by its setup is ready once that file is there
  function readyOf(e, rec) {
    if (!rec || !exists(rec.program)) return false;
    // verified: its copy picked and checked, and every start script written
    if (e?.from === 'verified') return !!(rec.game?.path && rec.starts?.length && rec.starts.every((st) => exists(st.script)));
    if (!e?.needs) return true;
    if (e.done) return doneAt(e, rec).some(exists);
    return !!rec.setupDone;
  }
  // the done file: a relative one is beside the program (its working folder, where Ship of Harkinian writes oot.o2r)
  // or in the install folder; 0.9.67 looked only in the install folder, which isn't the program's for nested builds
  function doneAt(e, rec) {
    if (!e?.done || !rec) return [];
    if (/^(~|\$XDG_|\/)/.test(e.done)) return [expandPath(e.done, rec.dir)].filter(Boolean);
    return [...new Set([...(rec.flatpak ? [] : [path.join(path.dirname(rec.program), e.done)]), path.join(rec.dir, e.done)])];
  }
  // what it's started with: the catalogue's own arguments, then the game when its setup passes it every time
  function launchArgs(id) {
    const e = byId(id), rec = installs[id];
    return [argString(e?.args), rec?.args || ''].filter(Boolean).join(' ');
  }
  // 0.9.65 to 0.9.67 placed your copy under a link named like the catalogue's note, and kept a one-off setup command
  // (WiiCompiled's "install --game", Doom64EX's "-wadgen") as the launch arguments. Put right once per install: the
  // old link goes (only a link to your copy), your copy is placed where the rule says, the setup command comes off.
  let repaired = false;
  function repairOld() {
    if (repaired) return; repaired = true;
    let changed = false;
    for (const [id, rec] of Object.entries(installs)) {
      const e = byId(id);
      if (!e || !rec?.game) continue;
      if (e.setup?.how === 'path' && e.done && rec.args) { delete rec.args; changed = true; log('recomp setup arguments taken off', id); }
      if (rec.game.how !== 'place' || rec.game.links || !rec.game.placed) continue;
      try {
        const st = fs.lstatSync(rec.game.placed, { throwIfNoEntry: false });
        if (st?.isSymbolicLink() && path.resolve(path.dirname(rec.game.placed), fs.readlinkSync(rec.game.placed)) === path.resolve(rec.game.file)) fs.unlinkSync(rec.game.placed);
      } catch {}
      delete rec.game.placed; rec.setupDone = false; changed = true;
      if (e.setup?.to && exists(rec.game.file)) {
        const r = linkCopy(e, rec, rec.game.file);
        if (r.ok) { rec.game.links = r.links; rec.setupDone = true; log('recomp copy placed again', id, r.links.length); }
        else log('recomp copy not placed again', id, r.why);
      }
    }
    if (changed) saveInstalls();
  }
  // links your copy (and the files it names) where the rule says: never over a file, only links Cartridge made go
  function linkCopy(e, rec, file) {
    let isDir = false; try { isDir = fs.statSync(file).isDirectory(); } catch { return { ok: false, why: 'That file isn’t there any more.' }; }
    const plan = placePlan(e, rec, file, isDir);
    if (plan.why) return { ok: false, why: plan.why };
    for (const l of plan.links) {
      const st = fs.lstatSync(l.to, { throwIfNoEntry: false });
      if (!st) continue;
      const same = (() => { try { return fs.realpathSync(l.to) === fs.realpathSync(l.from); } catch { return false; } })();
      if (!same) return { ok: false, why: `${l.to.replace(os.homedir(), '~')} is already there. Cartridge leaves it as it is.` };
    }
    for (const l of plan.links) {
      if (fs.lstatSync(l.to, { throwIfNoEntry: false })) continue;
      fs.mkdirSync(path.dirname(l.to), { recursive: true });
      fs.symlinkSync(l.from, l.to);
    }
    return { ok: true, links: plan.links.map((l) => l.to) };
  }
  // the links made for your previous copy, before another is placed (only links to that copy)
  function unlinkCopy(rec) {
    for (const t of rec.game?.links || []) {
      try { const st = fs.lstatSync(t, { throwIfNoEntry: false }); if (st?.isSymbolicLink()) fs.unlinkSync(t); } catch {}
    }
  }
  // everything the screens show, in one go
  function list({ roms = [] } = {}) {
    repairOld();
    const out = [];
    for (const e of catalogue().entries) {
      const rec = installs[e.id] || null;
      const lt = latest[e.id] || null;
      out.push({
        id: e.id, name: e.name, games: e.games, origin: e.origin, from: e.from, repo: e.repo || null, description: e.description || '', url: projectUrl(e), site: e.site || null,
        builds: e.builds, needs: e.needs || null, setup: e.setup || { how: 'none' }, done: e.done || null, saves: e.saves || [], achievements: e.achievements || null, license: e.license || null,
        roms: matchRoms(e, roms),
        installed: rec ? { tag: rec.tag, kind: rec.kind, dir: rec.dir, program: rec.program, channel: rec.channel || 'stable', at: rec.at, game: rec.game || null, ready: readyOf(e, rec), here: exists(rec.program), appid: rec.appid || null } : null,
        latest: lt && { tag: lt.tag, date: lt.date, kind: lt.kind, at: lt.at, none: lt.none || null, ci: lt.ci || null },
        syncSaves: rec?.syncSaves || [],
        update: !!(rec && lt?.tag && rec.tag && lt.tag !== rec.tag && !lt.none),
        ...(e.from === 'verified' ? verifiedInfo(e, rec, lt) : {}),
      });
    }
    return { updated: catalogue().updated, consoles: CONSOLES, entries: out };
  }
  // what the screens show for a verified game: who made it, when Cartridge checked it, its builds, your copy, and the
  // one state that decides the main button: get, game (pick your copy), setup, play, update, broken
  function verifiedInfo(e, rec, lt) {
    const r = e.recipe, build = buildOf(e, rec);
    const here = !!rec && (exists(rec.program) || !!rec.installer);
    const ready = readyOf(e, rec);
    const state = !rec ? 'get' : !here ? 'broken' : !rec.game?.path ? 'game' : !ready ? 'setup' : rec.tag && lt?.tag && lt.tag !== rec.tag && !lt.none ? 'update' : 'play';
    return {
      verified: r.verified || null, by: r.by || '', about: r.about || '', licence: r.licence || null,
      builds: r.builds.map((b) => ({ os: b.os, note: b.note || '' })), build: rec?.build || null, buildNote: build?.note || '',
      wants: { title: r.game.title, ids: r.game.ids || [], version: r.game.version || null, why: r.game.why || '', pkg: r.game.kind === 'folder-or-pkg' },
      copy: rec?.game || null, starts: (rec?.starts || []).map((st) => ({ id: st.id, name: st.name, sub: st.sub })), plays: (r.play || []).map((p) => ({ id: p.id, name: p.name, sub: p.sub || '' })),
      settingsCount: RC.settingsFor(r, build || RC.chooseBuild(r, { runner: true })).length, changed: Object.keys(rec?.settings || {}).length,
      runner: rec?.runner || null, installNotes: rec?.installNotes || [], state,
    };
  }
  // the newest release this device can use (remembered for the screens; a check is reused for 6 hours)
  async function check(id, { force = false, channel } = {}) {
    const e = byId(id);
    if (!e) throw new Error('That recomp isn’t in the list.');
    const ch = channel || installs[id]?.channel || 'stable';
    if (e.from === 'verified') return checkVerified(e, ch, force);
    const old = latest[id];
    if (!force && old && old.channel === ch && Date.now() - old.at < 6 * 3600e3) return old;
    if (!repoOf(e.repo)) { latest[id] = { at: Date.now(), channel: ch, none: e.builds === 'site' ? 'site' : 'source' }; writeJson(F('recomp-latest.json'), latest); return latest[id]; }
    const rel = await releaseOf(e, { pre: ch === 'pre', fetchImpl: ctx.fetchImpl });
    const b = rel && pickBuild(rel.assets, e);
    // no usable release: builds published only by GitHub Actions count as its updates (0.9.80)
    const ci = !b ? await ciBuildOf(e, { fetchImpl: ctx.fetchImpl }).catch(() => null) : null;
    latest[id] = b ? { tag: rel.tag, date: rel.date, kind: b.kind, name: b.asset.name, url: b.asset.url, size: b.asset.size || 0, at: Date.now(), channel: ch } : ci ? { ...ci, at: Date.now(), channel: ch } : { at: Date.now(), channel: ch, none: rel ? 'nobuild' : 'norelease', tag: rel?.tag || null };
    writeJson(F('recomp-latest.json'), latest);
    return latest[id];
  }
  async function checkVerified(e, ch, force) {
    const old = latest[e.id];
    if (!force && old && Date.now() - old.at < 6 * 3600e3) return old;
    const eUse = verifiedCheckEntry(e, installs[e.id]);
    const rel = await releaseOf(eUse, { fetchImpl: ctx.fetchImpl });
    const b = rel && pickBuild(rel.assets, eUse);
    latest[e.id] = b ? { tag: rel.tag, date: rel.date, kind: b.kind, name: b.asset.name, url: b.asset.url, size: b.asset.size || 0, at: Date.now(), channel: ch } : { at: Date.now(), channel: ch, none: rel ? 'nobuild' : 'norelease', tag: rel?.tag || null };
    writeJson(F('recomp-latest.json'), latest);
    return latest[e.id];
  }
  // ---- saves: backed up before an update or removal, checked after (owner: updates must never lose saves)
  function backupSaves(id, why, { keep } = {}) {
    const e = byId(id), rec = installs[id];
    const dirs = (e?.from === 'verified' ? verifiedSaves(e, rec) : e?.saves?.length ? saveDirs(e, rec) : ['link', 'found', 'kept'].includes(e?.from) ? guessSaves(e, rec) : []).filter(exists); // 0.9.69: guessed for link recomps
    if (!dirs.length) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-'), to = path.join(dataDir, 'recomp-backups', id, stamp);
    const meta = { id, why, at: Date.now(), tag: rec?.tag || null, items: [] };
    dirs.forEach((d, i) => { const dst = path.join(to, `${i}-${path.basename(d)}`); fs.cpSync(d, dst, { recursive: true, dereference: false }); meta.items.push({ from: d, copy: dst, files: countFiles(dst) }); });
    fs.writeFileSync(path.join(to, 'backup.json'), JSON.stringify(meta, null, 1));
    // ten backups per recomp are kept, the oldest go
    const all = (() => { try { return fs.readdirSync(path.dirname(to)).sort(); } catch { return []; } })();
    for (const old of all.slice(0, Math.max(0, all.length - 10))) if (old !== keep) fs.rmSync(path.join(path.dirname(to), old), { recursive: true, force: true }); // keep: the one being restored (0.9.69)
    log('recomp saves backed up', id, why, meta.items.length, 'place(s)');
    return meta;
  }
  function countFiles(d) { let n = 0; const walk = (x) => { for (const ent of (() => { try { return fs.readdirSync(x, { withFileTypes: true }); } catch { return []; } })()) { if (ent.isDirectory()) walk(path.join(x, ent.name)); else n++; } }; try { if (fs.statSync(d).isDirectory()) walk(d); else n = 1; } catch {} return n; }
  // after an update: every save place still there with at least as many files; anything missing is copied back from
  // the backup (never over a file that's there)
  function checkSaves(meta) {
    if (!meta) return { ok: true, restored: 0 };
    let restored = 0;
    for (const it of meta.items) {
      if (countFiles(it.from) >= it.files) continue;
      fs.mkdirSync(path.dirname(it.from), { recursive: true });
      fs.cpSync(it.copy, it.from, { recursive: true, force: false, errorOnExist: false });
      restored++;
      log('recomp saves put back after an update', it.from);
    }
    return { ok: true, restored };
  }
  function backups(id) {
    const d = path.join(dataDir, 'recomp-backups', id);
    return (() => { try { return fs.readdirSync(d); } catch { return []; } })().sort().reverse().map((n) => { const m = readJson(path.join(d, n, 'backup.json'), null); return m && { stamp: n, at: m.at, why: m.why, tag: m.tag, places: m.items.length, files: m.items.reduce((a, it) => a + (it.files || 0), 0) }; }).filter(Boolean);
  }
  // a backup put back (0.9.69): never while the recomp runs; the saves there now are backed up first, so a restore can
  // itself be undone. Files in the backup replace the same files; files made since are left where they are.
  function restoreBackup(id, stamp) {
    const rec = installs[id], e = byId(id);
    if (!/^[\w-]+$/.test(String(stamp || ''))) throw new Error('That backup isn’t there.');
    const d = path.join(dataDir, 'recomp-backups', id, stamp), meta = readJson(path.join(d, 'backup.json'), null);
    if (!meta?.items?.length) throw new Error('That backup isn’t there.');
    if (rec && exists(rec.program) && ctx.isRunning(rec.flatpak || rec.program)) throw new Error(`Close ${e?.name || 'it'} first.`);
    const before = backupSaves(id, 'before restore', { keep: stamp });
    let files = 0;
    for (const it of meta.items) {
      if (!exists(it.copy)) continue;
      fs.mkdirSync(path.dirname(it.from), { recursive: true });
      fs.cpSync(it.copy, it.from, { recursive: true, force: true });
      files += countFiles(it.copy);
    }
    log('recomp saves restored', id, stamp, files, 'file(s)');
    return { files, places: meta.items.length, savedFirst: !!before };
  }
  // ---- install or update: download, unpack, keep the release it replaces, put the new one where the old one is
  async function install(id, { channel, onProgress = () => {}, signal, build: pickOs, _e, local } = {}) {
    const e0 = byId(id);
    if (!e0) throw new Error('That recomp isn’t in the list.');
    if (e0.from === 'verified' && !_e) return installVerified(e0, { channel, onProgress, signal, pickOs });
    const e = _e || e0;
    if (!repoOf(e.repo)) throw new Error(e.builds === 'site' ? `${e.name} is downloaded from its own site, not GitHub. Open its page.` : `${e.name} doesn’t publish builds: it has to be built from its source.`);
    const prev = installs[id] || null;
    if (prev && exists(prev.program) && ctx.isRunning(prev.flatpak || prev.program)) throw new Error(`Close ${e.name} first.`);
    const ch = channel || prev?.channel || 'stable';
    onProgress({ step: 'check', pct: null });
    // 0.9.80: `local` is a build downloaded from its GitHub Actions page ({ file, name, tag, date, kind })
    const rel = local ? { tag: local.tag, date: local.date || '' } : await releaseOf(e, { pre: ch === 'pre', fetchImpl: ctx.fetchImpl });
    const b = local ? { asset: { name: local.name || path.basename(local.file), size: 0 }, kind: local.kind || (e.builds === 'windows' ? 'windows' : 'linux') } : rel && pickBuild(rel.assets, e);
    if (!b) {
      // builds only from GitHub Actions: the screen opens the run's page, where a signed-in download comes back to installFrom
      const ci = await ciBuildOf(e, { fetchImpl: ctx.fetchImpl }).catch(() => null);
      if (ci) { latest[id] = { ...ci, at: Date.now(), channel: ch }; writeJson(F('recomp-latest.json'), latest); if (prev?.tag === ci.tag && exists(prev.program)) return { already: true, tag: ci.tag }; return { ci: ci.ci, tag: ci.tag, name: ci.name, kind: ci.kind }; }
      if (!rel) throw new Error(`${e.name} has no releases yet.`);
      throw new Error(`${e.name}’s newest release has no Linux or Windows build (Android, macOS and source code can’t run here).`);
    }
    if (prev && prev.tag === rel.tag && exists(prev.program)) return { already: true, tag: rel.tag };
    const dest = prev?.dir || homeDir(e);
    if (!prev && fs.existsSync(dest) && fs.readdirSync(dest).length) throw new Error(`${dest.replace(os.homedir(), '~')} already has something in it. Cartridge leaves it as it is.`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const meta = prev ? backupSaves(id, 'update') : null;
    // the download keeps the release file's own ending: how it's unpacked goes by it (.tar.gz through tar, .zip, .7z)
    const ext = (/\.(tar\.(gz|xz|zst|bz2)|[a-z0-9]{1,8})$/i.exec(b.asset.name) || ['.bin'])[0];
    const tmp = path.join(path.dirname(dest), `.${path.basename(dest)}.cartridge-dl${ext}`);
    const out = dest + '.cartridge-new';
    const FV = require('./forkVersions'), store = FV.storeOf(path.dirname(dest), path.basename(dest));
    let program, files, kind = b.kind, tmpNow = tmp, setupWas = null;
    try {
      let got = 0;
      if (local) fs.copyFileSync(local.file, tmp);
      else await ctx.download(b.asset.url, tmp, (n) => { got += n; onProgress({ step: 'download', pct: b.asset.size ? Math.min(99, Math.floor((got / b.asset.size) * 100)) : null, got }); }, signal);
      await checkDigest(tmp, b.asset.digest);
      onProgress({ step: 'unpack', pct: null });
      fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
      // the name says what it is; without an ending, its first bytes do
      let nm = b.asset.name;
      if (!(ARCHIVE_END.test(nm) || /\.(appimage|exe)$/i.test(nm))) {
        const k = sniff(tmp);
        if (k) { const t2 = tmp.replace(/\.[^./]*$/, '') + k; fs.renameSync(tmp, t2); tmpNow = t2; nm += k; }
      }
      if (/\.appimage$/i.test(nm)) { fs.copyFileSync(tmpNow, path.join(out, `${folderName(e).replace(/\s+/g, '')}.AppImage`)); }
      else if (/\.elf$/i.test(nm)) { fs.copyFileSync(tmpNow, path.join(out, folderName(e).replace(/\s+/g, ''))); } // a lone Linux program
      else if (/\.exe$/i.test(nm)) { fs.copyFileSync(tmpNow, path.join(out, `${folderName(e).replace(/\s+/g, '')}.exe`)); kind = 'windows'; }
      else await ctx.unpackTo(tmpNow, out, nm);
      // one folder around everything is taken off, as most releases are packed; an archive alone inside the archive
      // (sonicdcer's zips hold a .tar.gz) is unpacked in its place
      let inner = out;
      for (let i = 0; i < 3; i++) {
        const top = fs.readdirSync(inner);
        if (top.length !== 1) break;
        const one = path.join(inner, top[0]);
        if (fs.statSync(one).isDirectory()) { inner = one; continue; }
        if (!ARCHIVE_END.test(one)) break;
        const deeper = path.join(out, '.inner' + i);
        fs.mkdirSync(deeper, { recursive: true });
        await ctx.unpackTo(one, deeper, top[0]);
        fs.rmSync(one, { force: true });
        inner = deeper;
      }
      // a Flatpak bundle (Unleashed Recompiled's Linux release): installed for this user and started through flatpak
      const bundle = /\.flatpak$/i.test(nm) ? tmpNow : FV.filesOf(inner).map((r) => path.join(inner, r)).find((r) => /\.flatpak$/i.test(r));
      if (bundle) {
        if (!ctx.flatpakBundle) throw new Error('Flatpak isn’t available here, and this recomp’s Linux release is a Flatpak.');
        const appId = await ctx.flatpakBundle(bundle);
        fs.mkdirSync(dest, { recursive: true });
        installs[id] = { ...(prev || {}), id, repo: e.repo, dir: dest, program: '/usr/bin/flatpak', args: `run ${appId}`, flatpak: appId, kind: 'flatpak', tag: rel.tag, date: rel.date, files: [], channel: ch, at: Date.now(), asset: b.asset.name };
        saveInstalls();
        latest[id] = { tag: rel.tag, date: rel.date, kind: 'flatpak', name: b.asset.name, at: Date.now(), channel: ch }; writeJson(F('recomp-latest.json'), latest);
        log('recomp', prev ? 'updated' : 'installed', id, rel.tag, 'flatpak', appId);
        // 0.9.69: an update is started once here too; Flatpak keeps no earlier version for Cartridge to go back to, so a
        // start that fails is said plainly (its own data is untouched)
        let t = null;
        if (prev?.tag && ctx.trialRun) { onProgress({ step: 'trial', pct: null }); t = await ctx.trialRun({ program: '/usr/bin/flatpak', args: `run ${appId}`, cwd: dest, ready: readyOf(e, prev) }).catch((er) => ({ failed: true, why: er.message })); }
        return { tag: rel.tag, kind: 'flatpak', program: '/usr/bin/flatpak', dir: dest, updated: !!prev, programMoved: false, restored: checkSaves(meta).restored, backedUp: !!meta, ...(t ? (t.failed ? { started: false, why: t.why } : { started: true }) : {}) };
      }
      // a Linux archive with no Linux program but a Windows one inside is a Windows build after all
      const C = require('./customEmu');
      const entries = FV.filesOf(inner).map((rel2) => { const p = path.join(inner, rel2); let size = 0; try { size = fs.statSync(p).size; } catch {} return { rel: rel2, path: p, size, appimage: /\.appimage$/i.test(rel2) || !!ctx.appImageType?.(p), elf: !!ctx.isElf?.(p) }; });
      const named = e.program && entries.find((f) => f.rel.split('/').pop().toLowerCase() === String(e.program).split('/').pop().toLowerCase());
      let pick = named || (kind === 'linux' ? C.programsIn(entries)[0] : null);
      if (!pick) { const w = C.windowsProgramsIn(entries)[0]; if (w) { pick = w; kind = 'windows'; } }
      if (!pick) throw new Error(`The release was unpacked, but there’s no ${kind === 'windows' ? 'Windows program' : 'AppImage or Linux program'} in it.`);
      if (kind === 'linux' && /\.exe$/i.test(pick.rel)) kind = 'windows';
      files = FV.filesOf(inner);
      // 0.9.80 (agreed plan 7.1 #13): what its setup or the game made beside it (top-level names that aren't the old
      // release's own) and whether its done file was there, so the update can say when it needs setting up again. A
      // new release file with the same name as one of those never goes over it: yours stays, the release's goes beside
      // it as .cartridge-release (and is what the next update keeps aside, never yours)
      if (prev && e.needs && fs.existsSync(dest)) {
        const oldTop = new Set((prev.files || []).map((r) => String(r).split('/')[0])), newTop = new Set(files.map((r) => r.split('/')[0]));
        const made = oldTop.size ? fs.readdirSync(dest).filter((n) => !n.startsWith('.') && !oldTop.has(n)) : [];
        setupWas = { done: doneAt(e, prev).some(exists), clashed: made.filter((n) => newTop.has(n) && n !== pick.rel.split('/')[0] && !exists(path.join(inner, `${n}.cartridge-release`))) };
        for (const n of setupWas.clashed) fs.renameSync(path.join(inner, n), path.join(inner, `${n}.cartridge-release`));
        if (setupWas.clashed.length) files = FV.filesOf(inner);
      }
      // an update: the release in use is kept aside first (its own files only: saves and settings stay)
      if (prev && fs.existsSync(dest)) {
        FV.keep({ base: dest, files: prev.files || files.filter((r) => fs.existsSync(path.join(dest, r))), store, tag: prev.tag || 'as found' });
        // the last two kept, as agreed with the owner
        for (const old of FV.list(store).slice(2)) FV.drop(store, old.tag);
      }
      fs.mkdirSync(dest, { recursive: true });
      fs.cpSync(inner, dest, { recursive: true, force: true });
      program = path.join(dest, pick.rel);
      if (kind === 'linux') { for (const f of entries) if (f.elf || f.appimage || f.path === pick.path) { try { fs.chmodSync(path.join(dest, f.rel), 0o755); } catch {} } }
    } finally { fs.rmSync(tmp, { force: true }); fs.rmSync(tmpNow, { force: true }); fs.rmSync(out, { recursive: true, force: true }); }
    const saves = checkSaves(meta);
    installs[id] = { ...(prev || {}), id, repo: e.repo, dir: dest, program, kind, tag: rel.tag, date: rel.date, files, channel: ch, at: Date.now(), asset: b.asset.name, ...(local ? { ci: true } : {}) };
    // set up again? Its done file went with the update, or the release brought files where its setup had made them
    let setupAgain = null, kept = null;
    if (setupWas?.done && !doneAt(e, installs[id]).some(exists)) {
      installs[id].setupDone = false;
      setupAgain = 'The update took away what its setup had made. Open it and set it up again.';
      log('recomp needs setting up again', id);
    }
    if (setupWas?.clashed.length) { kept = `The new release has its own ${setupWas.clashed.slice(0, 3).join(', ')}. Yours stayed in place; the release’s ${setupWas.clashed.length === 1 ? 'is' : 'are'} beside ${setupWas.clashed.length === 1 ? 'it' : 'them'}, ending .cartridge-release. If it misbehaves, set it up again.`; log('recomp update kept yours', id, setupWas.clashed.join(', ')); }
    saveInstalls();
    // 0.9.66 (agreed plan): after an update the new release is started once before Steam's shortcut follows it. One that
    // can't start at all (missing libraries, a crash in the first seconds) goes back to the release that worked
    // 0.9.71: Windows builds too, through the Proton runner, when the port already has its own prefix (a verified port's
    // .cartridge/proton): an update never makes a new prefix just to try a start
    // 0.9.80 (agreed plan 7.1 #13): a Windows build with no prefix of its own gets one, made once with wineboot, so its
    // updates are tried too (Steam keeps its own prefix for playing; this one is only for the trial start)
    let winTrial = prev && prev.tag && kind === 'windows' && ctx.trialRun && ctx.runner ? await ctx.runner().catch(() => null) : null;
    if (winTrial && !exists(path.join(RC.prefixOf({ dir: dest }), 'pfx'))) {
      if (!ctx.runProgram || ctx.playing?.()) winTrial = null;
      else {
        onProgress({ step: 'prefix', pct: null });
        try { const c = RC.prefixCommand(winTrial, { prefix: RC.prefixOf({ dir: dest }) }); fs.mkdirSync(RC.prefixOf({ dir: dest }), { recursive: true }); await ctx.runProgram(c.cmd, c.args, { cwd: dest, env: c.env, timeoutMs: 5 * 60e3 }); }
        catch (er) { log('recomp prefix for the trial start', id, er.message); winTrial = null; }
        if (winTrial && !exists(path.join(RC.prefixOf({ dir: dest }), 'pfx'))) winTrial = null;
      }
    }
    if (prev && prev.tag && ((kind === 'linux' && ctx.trialRun) || winTrial)) {
      onProgress({ step: 'trial', pct: null });
      const argList = (launchArgs(id) || '').match(/"[^"]*"|\S+/g)?.map((a) => a.replace(/^"(.*)"$/, '$1')) || [];
      const run = winTrial ? RC.runCommand(winTrial, program, argList, RC.prefixOf({ dir: dest })) : null;
      const t = await ctx.trialRun(run ? { program: run.cmd, argv: run.args, env: run.env, cwd: path.dirname(program), ready: readyOf(e, prev) } : { program, args: launchArgs(id), cwd: path.dirname(program), ready: readyOf(e, prev) }).catch((er) => ({ failed: true, why: er.message }));
      if (t?.failed) {
        log('recomp update did not start, back to', prev.tag, id, t.why);
        try {
          useVersion(id, prev.tag);
          if (exists(prev.program)) { installs[id].program = prev.program; saveInstalls(); }
        } catch (er) { log('recomp roll back after a failed start', id, er.message); return { tag: rel.tag, kind, program, dir: dest, updated: true, started: false, why: t.why, rollBackFailed: er.message, restored: saves.restored, backedUp: !!meta }; }
        latest[id] = { tag: rel.tag, date: rel.date, kind, name: b.asset.name, at: Date.now(), channel: ch, failed: t.why }; writeJson(F('recomp-latest.json'), latest);
        return { tag: prev.tag, newTag: rel.tag, kind, program: installs[id].program, dir: dest, updated: false, rolledBack: true, why: t.why, restored: saves.restored, backedUp: !!meta };
      }
    }
    latest[id] = { tag: rel.tag, date: rel.date, kind, name: b.asset.name, at: Date.now(), channel: ch }; writeJson(F('recomp-latest.json'), latest);
    log('recomp', prev ? 'updated' : 'installed', id, rel.tag, kind, program);
    return { tag: rel.tag, kind, program, dir: dest, updated: !!prev, programMoved: !!(prev && prev.program !== program), started: prev && ((kind === 'linux' && ctx.trialRun) || winTrial) ? true : undefined, restored: saves.restored, backedUp: !!meta, ...(setupAgain ? { setupAgain } : {}), ...(kept ? { kept } : {}) };
  }
  function versions(id) {
    const rec = installs[id];
    if (!rec) return { current: null, kept: [] };
    const FV = require('./forkVersions');
    return { current: rec.tag, kept: FV.list(FV.storeOf(path.dirname(rec.dir), path.basename(rec.dir))) };
  }
  // Roll Back (or forward): the kept release in, the one in use kept aside; saves backed up and checked as for updates
  function useVersion(id, tag) {
    const rec = installs[id];
    if (!rec) throw new Error('That recomp isn’t installed.');
    if (rec.kind === 'flatpak') throw new Error('A Flatpak recomp keeps no earlier versions here: Flatpak updates it.');
    if (ctx.isRunning(rec.program)) throw new Error(`Close ${byId(id)?.name || 'it'} first.`);
    const FV = require('./forkVersions'), store = FV.storeOf(path.dirname(rec.dir), path.basename(rec.dir));
    const meta = backupSaves(id, 'switch version');
    const placed = FV.swap({ base: rec.dir, store, current: rec.tag || 'as found', files: rec.files || [], to: tag });
    rec.files = placed; rec.tag = tag; rec.at = Date.now();
    if (!exists(rec.program)) { const same = placed.find((r) => path.basename(r) === path.basename(rec.program)); if (same) rec.program = path.join(rec.dir, same); }
    if (rec.kind === 'linux') try { fs.chmodSync(rec.program, 0o755); } catch {}
    saveInstalls();
    checkSaves(meta);
    log('recomp version switched', id, tag);
    return { tag };
  }
  function dropVersion(id, tag) {
    const rec = installs[id];
    if (!rec || tag === rec.tag) throw new Error('That version is the one in use.');
    const FV = require('./forkVersions');
    return FV.drop(FV.storeOf(path.dirname(rec.dir), path.basename(rec.dir)), tag);
  }
  // remove: saves backed up, then the folder to the Trash (never deleted outright)
  async function remove(id) {
    const rec = installs[id];
    if (!rec) throw new Error('That recomp isn’t installed.');
    if (exists(rec.program) && ctx.isRunning(rec.flatpak || rec.program)) throw new Error(`Close ${byId(id)?.name || 'it'} first.`);
    const meta = backupSaves(id, 'remove');
    if (rec.flatpak) await ctx.flatpakRemove?.(rec.flatpak).catch((er) => log('recomp flatpak remove', er.message)); // its own data stays, as Flatpak keeps it
    if (fs.existsSync(rec.dir)) await ctx.trash(rec.dir);
    const FV = require('./forkVersions'), store = FV.storeOf(path.dirname(rec.dir), path.basename(rec.dir));
    if (fs.existsSync(store)) await ctx.trash(store).catch(() => {});
    delete installs[id]; saveInstalls();
    log('recomp removed', id);
    return { backedUp: !!meta, appid: rec.appid || null };
  }
  function setChannel(id, channel) {
    const rec = installs[id];
    if (rec) { rec.channel = channel === 'pre' ? 'pre' : 'stable'; saveInstalls(); }
    delete latest[id];
    return true;
  }
  // ---- handing it your game: checked first, then placed, passed by path, or opened in its own picker
  async function setGame(id, file, { force = false } = {}) {
    const e = byId(id), rec = installs[id];
    if (!e || !rec) throw new Error('Install it first.');
    const chk = await checkGame(e, file);
    if (!chk.ok && !(force && chk.wrong)) return { ok: false, why: chk.why, wrong: !!chk.wrong };
    const how = e.setup?.how || 'none', prev = rec.game || null;
    rec.game = { file, at: Date.now(), checked: chk.ok, how };
    let note = '', args = null, run = null;
    if (how === 'place') {
      // the previous copy's links go first (a new copy usually takes the same name); it comes back if this one can't
      unlinkCopy({ game: prev });
      const r = linkCopy(e, rec, file);
      if (!r.ok) {
        rec.game = prev;
        if (prev?.links && exists(prev.file)) { const back = linkCopy(e, rec, prev.file); if (back.ok) prev.links = back.links; }
        saveInstalls();
        return { ok: false, why: r.why };
      }
      rec.game.links = r.links;
      note = r.links.length === 1 ? `Linked as ${r.links[0].replace(os.homedir(), '~')}.` : `Linked ${r.links.length} files in ${path.dirname(r.links[0]).replace(os.homedir(), '~')}.`;
    } else if (how === 'path' && e.setup?.arg) {
      args = fileArg(setupTpl(e), file, rec.kind === 'windows');
      // with a done file the command is a one-off setup run (Doom64EX makes its WAD, WiiCompiled installs the game),
      // started now; without one the game is passed every time it starts
      if (e.done) { run = args; args = null; delete rec.args; note = 'It sets itself up with your game now.'; }
      else { rec.args = args; note = 'Cartridge starts it with your game.'; }
    } else if (how === 'picker') {
      note = rec.kind === 'windows' ? `When it asks for the game, paste this: Z:${file.replace(/\//g, '\\')}` : `When it asks for the game, pick: ${file}`;
    }
    if (how === 'place' || (how === 'path' && !run)) rec.setupDone = true;
    saveInstalls();
    log('recomp game set', id, how, chk.ok ? 'checked' : 'used anyway');
    return { ok: true, how, note, args, run, checked: chk.ok, path: rec.kind === 'windows' ? 'Z:' + file.replace(/\//g, '\\') : file };
  }
  function markDone(id) { const rec = installs[id]; if (!rec) return false; rec.setupDone = true; saveInstalls(); return true; }
  function setAppid(id, appid) { const rec = installs[id]; if (rec) { rec.appid = appid >>> 0; saveInstalls(); } }

  // ---- the project's own page details, read once a day (recomp-details.json); a failure leaves the page as it was
  let detailsCache = readJson(F('recomp-details.json'), {});
  async function details(id, { fresh = false } = {}) {
    const e = byId(id), r = repoOf(e?.repo);
    if (!r) return null;
    const had = detailsCache[id];
    if (had && !fresh && Date.now() - had.at < 24 * 3600e3) return had;
    const f = ctx.fetchImpl || require('./webFetch'), H = { 'User-Agent': 'Cartridge', Accept: 'application/json' };
    const getJson = async (u) => { const res = await f(u, { headers: H, signal: AbortSignal.timeout(15000) }).catch(() => null); return res && res.ok ? res.json().catch(() => null) : null; };
    const getText = async (u) => { const res = await f(u, { headers: { 'User-Agent': 'Cartridge' }, signal: AbortSignal.timeout(15000) }).catch(() => null); return res && res.ok ? res.text().catch(() => null) : null; };
    const out = { at: Date.now(), stars: null, description: null, tag: null, date: null, notes: null, picture: null, url: projectUrl(e) };
    if (r.host === 'github') {
      const [repo, rel, readme] = await Promise.all([
        getJson(`https://api.github.com/repos/${r.repo}`),
        getJson(`https://api.github.com/repos/${r.repo}/releases?per_page=5`),
        getText(`https://raw.githubusercontent.com/${r.repo}/HEAD/README.md`),
      ]);
      if (repo) { out.stars = repo.stargazers_count ?? null; out.description = repo.description || null; }
      const pick = Array.isArray(rel) ? rel.find((x) => !x.draft && !x.prerelease) || rel.find((x) => !x.draft) : null;
      if (pick) { out.tag = pick.tag_name; out.date = pick.published_at || null; out.notes = plainNotes(pick.body) || null; }
      if (readme) out.picture = readmePicture(readme, `https://raw.githubusercontent.com/${r.repo}/HEAD/`);
    } else {
      const enc = encodeURIComponent(r.repo);
      const [repo, rel, readme] = await Promise.all([
        getJson(`https://gitlab.com/api/v4/projects/${enc}`),
        getJson(`https://gitlab.com/api/v4/projects/${enc}/releases?per_page=5`),
        getText(`https://gitlab.com/${r.repo}/-/raw/HEAD/README.md`),
      ]);
      if (repo) { out.stars = repo.star_count ?? null; out.description = repo.description || null; }
      const pick = Array.isArray(rel) ? rel.find((x) => !x.upcoming_release) : null;
      if (pick) { out.tag = pick.tag_name; out.date = pick.released_at || null; out.notes = plainNotes(pick.description) || null; }
      if (readme) out.picture = readmePicture(readme, `https://gitlab.com/${r.repo}/-/raw/HEAD/`);
    }
    // nothing answered (offline, rate limit): what was known before stays
    if (out.stars == null && !out.tag && !out.picture && !out.description) return had || null;
    detailsCache[id] = out; writeJson(F('recomp-details.json'), detailsCache);
    return out;
  }

  // ---- setup progress (0.9.67, agreed plan 7.1 #10): while a recomp builds its own files from your copy on its first
  // starts (Ship of Harkinian making its .o2r, a picker recomp copying your ROM in), Cartridge measures the bytes written
  // in its folders against the finished size when the catalogue knows it (`doneSize`), and marks it set up when the
  // catalogue's done file appears. Never more than one watch per recomp; it ends when the recomp closes.
  const watching = new Set();
  async function bytesIn(dirs, budget = { n: 60000 }) {
    let total = 0;
    const walk = async (d) => {
      let ents; try { ents = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
      for (const ent of ents) {
        if (--budget.n < 0) return;
        if (ent.name === '.cartridge-versions') continue;
        const p = path.join(d, ent.name);
        if (ent.isDirectory()) await walk(p);
        else if (ent.isFile()) { try { total += (await fs.promises.stat(p)).size; } catch {} }
      }
    };
    for (const d of dirs) await walk(d);
    return total;
  }
  function ready(id) { const e = byId(id); return readyOf(e, installs[id]); }
  async function watchSetup(id, { onProgress = () => {}, every = 1000, limitMs = 45 * 60e3, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    const e = byId(id), rec = installs[id];
    // only with a done file to wait for: without one (33 entries) nothing can say when it's finished, and the person
    // presses Done instead
    if (!e || !rec || !e.done || readyOf(e, rec) || watching.has(id)) return { watched: false };
    watching.add(id);
    try {
      // the folders it builds into: its own, and the done file's folder when that is elsewhere (~/.config/<Name>)
      const dirs = [...new Set([rec.dir, ...doneAt(e, rec).filter((d) => !d.startsWith(rec.dir + path.sep)).map((d) => path.dirname(d))])];
      const base = await bytesIn(dirs), start = Date.now();
      let gone = 0;
      for (;;) {
        await sleep(every);
        if (readyOf(e, installs[id])) { if (installs[id]) { installs[id].setupDone = true; saveInstalls(); } log('recomp set up', id); return { watched: true, done: true }; }
        const got = Math.max(0, (await bytesIn(dirs)) - base);
        onProgress({ step: 'build', got, pct: e.doneSize ? Math.min(99, Math.floor((got / e.doneSize) * 100)) : null });
        // closed before its files were made (it asked for something, or the copy didn't fit): the watch ends quietly
        gone = ctx.isRunning(rec.flatpak || rec.program) ? 0 : gone + 1;
        if (gone >= 3) return { watched: true, done: false, closed: true, got };
        if (Date.now() - start > limitMs) return { watched: true, done: false, timeout: true, got };
      }
    } finally { watching.delete(id); }
  }
  // ---- from a link (not in the catalogue): the same GitHub card as emulators; console and game said by the user
  function addLink({ repo, console: con, title, name, description }) {
    if (!/^(github|gitlab):[\w.-]+\/[\w.-]+$/.test(repo || '')) throw new Error('That isn’t a GitHub project link.');
    if (!CONSOLES[con]) throw new Error('Pick the console the game is from.');
    const mine = readJson(F('recomps-mine.json'), []);
    const known = catalogue().entries.find((e) => e.repo?.toLowerCase() === repo.toLowerCase());
    if (known) return { id: known.id, known: true };
    const id = 'link-' + slugId(repo.split(':')[1].replace('/', '-'));
    mine.push({ id, name: name || repo.split('/').pop(), games: [{ title: title || name || repo.split('/').pop(), console: con }], origin: 'recomp', repo, builds: 'linux', needs: null, setup: { how: 'picker' }, saves: [], description: description || '', link: true, at: Date.now() });
    writeJson(F('recomps-mine.json'), mine); cat = null;
    return { id, known: false };
  }
  // ---- the daily refresh (silent): newer recipes from Cartridge's repository, then the newest release of each
  // installed recomp (0.9.70: PCGamingWiki is no longer searched; the list is curated)
  async function refresh({ playing = () => false } = {}) {
    const res = { recipes: 0, checked: 0 };
    try { res.recipes = await refreshRecipes(); } catch (e) { log('recomps: recipes refresh', e.message); }
    for (const id of Object.keys(installs)) {
      if (playing()) break;
      try { await check(id, { force: true }); res.checked++; } catch (e) { log('recomps: check', id, e.message); }
    }
    ensureFolders();
    return res;
  }
  // ================================================================ Cartridge Verified (0.9.70)
  // the build to use (yours, else Linux, else Windows through Proton), what Proton runner there is, and the recipe's
  // files and start scripts written from your settings. Every step says what it needs in plain words.
  const recipeOf = (e) => (e?.from === 'verified' ? e.recipe : null);
  const buildOf = (e, rec) => recipeOf(e)?.builds.find((b) => b.os === rec?.build) || null;
  const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
  function writeFileSafe(p, text, mode) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p + '.cartridge-tmp', text);
    if (mode) fs.chmodSync(p + '.cartridge-tmp', mode);
    fs.renameSync(p + '.cartridge-tmp', p);
  }
  async function installVerified(e, { channel, onProgress = () => {}, signal, pickOs } = {}) {
    const r = e.recipe, prev = installs[e.id] || null;
    const runner = ctx.runner ? await ctx.runner() : null;
    const build = RC.chooseBuild(r, { pick: pickOs || prev?.build, runner });
    if (!build) throw new Error(`${r.name}’s port is a Windows build, and there’s no Proton here to run it. Installing Steam brings Proton (or install umu-launcher), then try again.`);
    // the port's own installer (P.T.): downloaded and kept; it runs with your copy in the game step
    if (build.installer) {
      const eUse = { ...e, builds: 'linux', linuxAsset: build.asset, strict: true };
      onProgress({ step: 'check', pct: null });
      const rel = await releaseOf(eUse, { fetchImpl: ctx.fetchImpl });
      const b = rel && pickBuild(rel.assets, eUse);
      if (!b) throw new Error(`${r.name}’s newest release doesn’t have its Linux installer under the name Cartridge’s recipe knows. The recipe needs an update: tell Cartridge’s author.`);
      if (prev?.tag === rel.tag && exists(prev.installer)) return { already: true, tag: rel.tag };
      const dest = prev?.dir || homeDir(e), setup = path.join(dest, '.cartridge', 'setup-' + String(rel.tag).replace(/[^\w.-]+/g, '_'));
      fs.mkdirSync(path.dirname(setup), { recursive: true });
      let got = 0;
      await ctx.download(b.asset.url, setup + '.part', (n) => { got += n; onProgress({ step: 'download', pct: b.asset.size ? Math.min(99, Math.floor((got / b.asset.size) * 100)) : null, got }); }, signal);
      try { await checkDigest(setup + '.part', b.asset.digest); } catch (er) { fs.rmSync(setup + '.part', { force: true }); throw er; }
      fs.renameSync(setup + '.part', setup); fs.chmodSync(setup, 0o755);
      if (prev?.installer && prev.installer !== setup) fs.rmSync(prev.installer, { force: true });
      installs[e.id] = { ...(prev || {}), id: e.id, repo: e.repo, dir: dest, program: path.join(dest, build.program), kind: 'linux', build: build.os, installer: setup, installedTag: prev?.installedTag || null, tag: rel.tag, date: rel.date, files: [], channel: 'stable', at: Date.now(), asset: b.asset.name };
      saveInstalls();
      latest[e.id] = { tag: rel.tag, date: rel.date, kind: 'linux', name: b.asset.name, at: Date.now(), channel: 'stable' }; writeJson(F('recomp-latest.json'), latest);
      log('verified installer downloaded', e.id, rel.tag);
      const out = { tag: rel.tag, kind: 'linux', build: build.os, dir: dest, updated: !!prev };
      if (installs[e.id].game?.path) Object.assign(out, await configure(e.id, { onProgress }));
      return out;
    }
    const eUse = { ...e, builds: build.os, linuxAsset: build.os === 'linux' ? build.asset : null, windowsAsset: build.os === 'windows' ? build.asset : null, program: build.program, strict: true };
    const res = await install(e.id, { channel, onProgress, signal, _e: eUse });
    if (installs[e.id]) { installs[e.id].build = build.os; saveInstalls(); }
    if (installs[e.id]?.game?.path) Object.assign(res, await configure(e.id, { onProgress }));
    return { ...res, build: build.os };
  }
  // the update check for a verified recipe uses its own file for the build in use
  function verifiedCheckEntry(e, rec) {
    const b = RC.chooseBuild(e.recipe, { pick: rec?.build, runner: true });
    return b ? { ...e, builds: b.os, linuxAsset: b.os === 'linux' ? b.asset : null, windowsAsset: b.os === 'windows' ? b.asset : null, strict: true } : e;
  }
  // your copy for it: checked (the files it needs, its title ID and version); an update it needs is laid over it as
  // links when the update is on this device; then everything is written
  async function setVerifiedGame(id, dir, { candidates = [], onProgress = () => {} } = {}) {
    const e = byId(id), r = recipeOf(e), rec = installs[id];
    if (!r) throw new Error('That isn’t a Cartridge Verified game.');
    const sfo = require('./saves').sfo;
    onProgress({ step: 'check' });
    const chk = RC.checkGame(r, dir, { sfo });
    let use = dir, update = null;
    if (!chk.ok && chk.needsUpdate) {
      const u = RC.findUpdate(r, dir, candidates, { sfo });
      if (!u || RC.verCmp(u.version, chk.needsUpdate) < 0) return { ok: false, problems: chk.problems, needsUpdate: chk.needsUpdate, why: `${r.name} needs update ${chk.needsUpdate}. ${u ? `The update on this device is ${u.version}.` : 'Pick the update’s folder (its dump, with sce_sys inside), or put it beside the game.'}` };
      if (!rec) return { ok: false, why: 'Install it first.' };
      onProgress({ step: 'view' });
      use = await buildView(rec, dir, u.dir);
      update = u;
      const again = RC.checkGame(r, use, { sfo });
      if (!again.ok) return { ok: false, problems: again.problems, why: again.problems.join(' ') };
      chk.notes.push(`Update ${u.version} is laid over it (links, nothing copied).`);
    } else if (!chk.ok) return { ok: false, problems: chk.problems, why: chk.problems.join(' ') };
    if (!rec) return { ok: true, check: chk, notInstalled: true };
    rec.game = { path: use, source: dir, update: update?.dir || null, id: chk.id || null, version: update?.version || chk.version || null, notes: chk.notes, at: Date.now() };
    saveInstalls();
    const done = await configure(id, { onProgress });
    return { ok: true, notes: chk.notes, ...done };
  }
  // base and update as one folder of links, inside the install (rebuilt when either changes)
  async function buildView(rec, base, update) {
    const view = path.join(rec.dir, '.cartridge', 'game');
    fs.rmSync(view, { recursive: true, force: true });
    const FV = require('./forkVersions');
    let n = 0;
    for (const l of RC.viewPlan(base, update, { list: (d) => FV.filesOf(d) })) {
      const to = path.join(view, l.rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.symlinkSync(l.from, to);
      if (++n % 500 === 0) await new Promise((ok) => setImmediate(ok));
    }
    log('verified game view', rec.id, n, 'files');
    return view;
  }
  // everything written from the recipe and your settings: the port's installer when it has one, Cartridge's Proton
  // prefix for a Windows build, the port's settings files and the start scripts
  async function configure(id, { onProgress = () => {} } = {}) {
    const e = byId(id), r = recipeOf(e), rec = installs[id];
    if (!r || !rec) throw new Error('Install it first.');
    const build = buildOf(e, rec);
    if (!build) throw new Error(`${r.name}’s recipe has no ${rec.build || ''} build any more. Install it again.`);
    if (!rec.game?.path) return { ready: false, needsGame: true };
    if (ctx.isRunning(rec.program)) throw new Error(`Close ${r.name} first.`);
    const runner = build.os === 'windows' ? (ctx.runner ? await ctx.runner() : null) : null;
    if (build.os === 'windows' && !runner) throw new Error(`${r.name}’s port is a Windows build, and there’s no Proton here to run it.`);
    const vars = RC.varsFor(r, build, rec);
    // the installer, with your copy (again after an update of the installer, or for another copy)
    if (build.installer && (rec.installedTag !== rec.tag || rec.installedFrom !== rec.game.path || !exists(rec.program))) {
      onProgress({ step: 'installer', pct: null });
      fs.mkdirSync(rec.dir, { recursive: true });
      try { fs.rmSync(vars.result, { force: true }); } catch {}
      const args = build.installer.map((a) => RC.expand(a, { ...vars, game: rec.game.path }));
      // 0.9.81 (owner's photo: P.T. "stuck on an endless Working"): its installer prints nothing while it copies your
      // game, so what it writes into the install folder is measured every 2 s and shown, against the size of the files
      // it copies when the recipe names them; one that writes nothing for 5 minutes is stopped and says so
      const fsz = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };
      const from = r.game.find ? RC.findDir(rec.game.path, r.game.find) : null;
      const want = from ? r.game.find.files.reduce((n, f) => n + fsz(path.join(from, f)), 0) : 0;
      const stallMs = ctx.stallMs || 5 * 60e3, ac = new AbortController();
      const base = await bytesIn([rec.dir]);
      let last = -1, still = Date.now(), looking = false, firstAt = 0;
      const t0 = Date.now();
      onProgress({ step: 'installer', got: 0, pct: want ? 0 : null });
      const tick = setInterval(async () => {
        if (looking) return; looking = true;
        try {
          const got = Math.max(0, (await bytesIn([rec.dir])) - base);
          if (got !== last) {
            last = got; still = Date.now(); if (got && !firstAt) firstAt = Date.now();
            // 0.9.82 (owner: why so slow): its speed and the time left, from the copying so far
            const rate = firstAt && Date.now() - firstAt > 1500 ? got / ((Date.now() - firstAt) / 1000) : 0;
            onProgress({ step: 'installer', got, want, rate, left: want && rate ? Math.max(0, Math.round((want - got) / rate)) : null, pct: want ? Math.min(99, Math.floor((got / want) * 100)) : null });
          }
          else if (Date.now() - still > stallMs) ac.abort();
        } finally { looking = false; }
      }, ctx.tickMs || 2000);
      try {
        await ctx.runProgram(rec.installer, args, { cwd: rec.dir, timeoutMs: 40 * 60e3, signal: ac.signal });
        // where the time went: its own checks before the first byte, then the copy and its speed; both folders on one
        // drive means every byte is read and written on the same card
        const secs = (Date.now() - t0) / 1000, wrote = Math.max(0, (await bytesIn([rec.dir])) - base), dev = (p) => { try { return fs.statSync(p).dev; } catch { return -1; } };
        log('verified installer done', id, `${Math.round(secs)} s`, `first write after ${firstAt ? Math.round((firstAt - t0) / 1000) : '?'} s`, `${Math.round(wrote / 1e6)} MB`, firstAt ? `${(wrote / 1e6 / Math.max(1, (Date.now() - firstAt) / 1000)).toFixed(1)} MB/s` : '', dev(rec.game.path) === dev(rec.dir) ? 'same drive as the game' : 'another drive than the game');
      }
      catch (er) {
        if (ac.signal.aborted) { log('verified installer stalled', id, last); throw new Error(`${r.name}’s installer wrote nothing for ${Math.round(stallMs / 60000)} minutes, so Cartridge stopped it. Press Set Up to try again. If it stops again, send Cartridge’s log (Settings → Help and About → Report a Problem).`); }
        throw er;
      } finally { clearInterval(tick); }
      const res = readText(vars.result) || '';
      if (!/^PASS\b/.test(res)) throw new Error(`${r.name}’s installer didn’t finish: ${(res.split('\n').find((l) => l.trim()) || 'it gave no answer').slice(0, 200)}`);
      rec.installedTag = rec.tag; rec.installedFrom = rec.game.path; rec.installNotes = res.split('\n').filter((l) => /^note:/.test(l)).map((l) => l.slice(5).trim());
      saveInstalls();
    }
    // a Windows build: Cartridge's own Proton prefix, made by Proton itself before settings go into it
    if (build.os === 'windows' && !exists(path.join(vars.prefix, 'pfx', 'drive_c'))) {
      onProgress({ step: 'prefix', pct: null });
      fs.mkdirSync(vars.prefix, { recursive: true });
      const c = RC.prefixCommand(runner, vars);
      await ctx.runProgram(c.cmd, c.args, { env: c.env, cwd: rec.dir, timeoutMs: 5 * 60e3 }).catch((er) => log('verified prefix', id, er.message));
      if (!exists(path.join(vars.prefix, 'pfx', 'drive_c'))) throw new Error(`Proton couldn’t make ${r.name}’s Windows folder (its prefix). Start a Windows game in Steam once, then try again.`);
    }
    onProgress({ step: 'write' });
    // the first time: what you chose in the port's own launcher before is kept
    if (!rec.settings) { rec.settings = RC.readBack(r, build, rec, { read: readText }); saveInstalls(); }
    const out = RC.render(r, build, rec, RC.effective(r, build, rec.settings), { read: readText });
    for (const f of out.files) writeFileSafe(f.path, f.text);
    rec.starts = out.starts.map((st) => { writeFileSafe(st.script, RC.script(r, build, rec, st, runner, out.vars), 0o755); return { id: st.id, name: st.name, sub: st.sub, script: st.script }; });
    rec.runner = runner ? runner.kind : null;
    saveInstalls();
    log('verified set up', id, build.os, rec.starts.length, 'start(s)', runner ? runner.kind : '');
    return { ready: readyOf(e, rec), starts: rec.starts.length, runner: rec.runner };
  }
  // the settings as Game Settings shows them: yours where you changed one, else the port's own
  function settings(id) {
    const e = byId(id), r = recipeOf(e), rec = installs[id];
    if (!r) throw new Error('That isn’t a Cartridge Verified game.');
    const build = buildOf(e, rec) || RC.chooseBuild(r, { runner: true });
    const mine = rec?.settings || {};
    return {
      name: r.name, version: rec?.tag || null, port: true,
      items: RC.settingsFor(r, build).map((s) => ({ id: s.id, label: s.label, tab: s.tab, desc: s.desc || '', type: s.type === 'text' ? 'text' : s.type, num: s.type === 'number' ? s.num || { min: -1e9, max: 1e9 } : null, options: s.type === 'bool' ? [{ value: true, label: 'On' }, { value: false, label: 'Off' }] : (s.options || []).map(([v, l]) => ({ value: v, label: l })), base: s.def, game: mine[s.id] != null ? mine[s.id] : null })),
    };
  }
  async function setSettings(id, changes = []) {
    const e = byId(id), r = recipeOf(e), rec = installs[id];
    if (!r || !rec) throw new Error('Install it first.');
    const build = buildOf(e, rec);
    const by = new Map(RC.settingsFor(r, build).map((s) => [s.id, s]));
    const next = { ...(rec.settings || {}) };
    for (const c of changes) {
      const s = by.get(c.id);
      if (!s) continue;
      let v = c.value;
      if (s.type === 'bool' && v != null) v = v === true || v === 'true';
      if (s.type === 'number' && v != null && typeof s.def === 'number') v = Number(v);
      const bad = RC.check(s, v);
      if (bad) throw new Error(bad);
      if (v == null || String(v) === String(s.def)) delete next[c.id]; else next[c.id] = v;
    }
    rec.settings = next; saveInstalls();
    if (rec.game?.path) await configure(id);
    return settings(id);
  }
  // a verified game's save folders on this device (the recipe's, per build)
  function verifiedSaves(e, rec) {
    const r = recipeOf(e), build = buildOf(e, rec);
    if (!r || !rec || !build) return [];
    const list = Array.isArray(r.saves) ? r.saves : r.saves?.[build.os] || [];
    const v = RC.varsFor(r, build, rec);
    return list.map((t) => RC.expand(t, v));
  }
  // the newer recipes in Cartridge's repository (the owner adds and fixes them there): kept when they pass the checks
  async function refreshRecipes() {
    const f = ctx.fetchImpl || require('./webFetch');
    if (!ctx.recipesUrl) return 0;
    const r = await f(ctx.recipesUrl, { headers: { 'User-Agent': 'Cartridge' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`The recipes answered ${r.status}.`);
    const j = await r.json();
    const ok = (Array.isArray(j) ? j : []).filter((x) => !RC.validate(x).length);
    writeJson(F('recipes-fetched.json'), ok); cat = null;
    return ok.length;
  }
  // 0.9.80 (agreed plan 7.1 #13, owner: build it): a recomp from a link has no known save places, so Save Sync takes
  // only the folders you tick, from what Cartridge found (guessSaves) or one you pick in your home folder. Never its
  // whole install folder, your home or a system folder: nothing guessed is uploaded without your say.
  function saveChoices(id) {
    const e = byId(id), rec = installs[id];
    if (!e || !rec) return { found: [], chosen: [] };
    const chosen = (rec.syncSaves || []).filter(exists);
    return { found: [...new Set([...guessSaves(e, rec), ...chosen])].map((p) => ({ path: p, chosen: chosen.includes(p) })), chosen };
  }
  function setSyncSaves(id, dirs, home = os.homedir()) {
    const rec = installs[id], e = byId(id);
    if (!rec || !e) throw new Error('That recomp isn’t installed.');
    if (e.from === 'verified' || e.saves?.length) throw new Error('This one’s saves are known already.');
    const ok = [...new Set((dirs || []).map((d) => path.resolve(String(d))))].filter((d) => {
      if (!exists(d)) return false;
      if ([home, rec.dir, '/', path.join(home, '.config'), path.join(home, '.local/share')].some((x) => path.resolve(x) === d)) return false;
      return d.startsWith(home + path.sep) || d.startsWith(path.resolve(rec.dir) + path.sep);
    });
    rec.syncSaves = ok; saveInstalls();
    return saveChoices(id);
  }
  // installed, not set up yet, with a done file to wait for: what a start from Steam should be watched for (0.9.80)
  const pendingSetup = () => catalogue().entries.filter((e) => e.done && installs[e.id] && !readyOf(e, installs[e.id])).map((e) => ({ id: e.id, program: installs[e.id].flatpak || installs[e.id].program }));
  const record = (id) => installs[id] || null;
  const reload = () => { cat = null; repaired = false; installs = readJson(F('recomp-installs.json'), {}); };
  return { catalogue, byId, details, ready, watchSetup, launchArgs, restoreBackup, list, check, install, versions, useVersion, dropVersion, remove, setChannel, setGame, markDone, setAppid, addLink, refresh, ensureFolders, backups, backupSaves, checkSaves, record, saveDirs: (id) => { const e = byId(id); return e?.from === 'verified' ? verifiedSaves(e, installs[id]) : e?.saves?.length ? saveDirs(e, installs[id]) : (installs[id]?.syncSaves || []).filter(exists); }, saveChoices, setSyncSaves, pendingSetup, homeDir, reload, setVerifiedGame, configure, settings, setSettings, refreshRecipes };
}

module.exports = { ciBuildOf, checkDigest, guessSaves, fileArg, argString, setupTpl, companions, placePlan, savePaths, readmePicture, plainNotes, guessFromText, CONSOLES, SLUGS, consoleOfSlug, norm, titleKeys, matchRoms, pickBuild, repoOf, projectUrl, releaseOf, expandPath, saveDirs, slugId, hashFile, checkGame, createRecomps };
