'use strict';
// Recomps (0.9.65, owner: "ReComps are the main focus of this right now"): native PC ports of console games, made by
// static recompilation, decompilation or a rebuild from scratch (Zelda 64: Recompiled, Ship of Harkinian, Unleashed
// Recompiled). Each needs the player's own copy of the game, never an emulator.
//
// The catalogue (electron/recomps.json) was built from PCGamingWiki's "List of unofficial ports" (the owner's saved
// page, every link checked; its status notes ignored as the owner asked), with the projects behind entries that had
// no link found on GitHub. A copy is fetched from Cartridge's repository once a day so new entries arrive without an
// app update, and PCGamingWiki's page is read too: projects new there are added silently, marked found.
//
// What Cartridge does with one: download its build (Linux first, Windows through Proton only when there is no Linux
// build, never Android, macOS or ARM), put it in <Emulation>/recomp/<console>/<name>, hand it the game file the way
// it takes one (place, path or its own picker), check that file is the version it needs, and add it to Steam as its
// own shortcut in a "Recomps" collection. Updates are never automatic: saves are backed up first, the release it
// replaces is kept beside it (forkVersions.js) for Roll Back, and saves are checked afterwards.
//
// The pure parts (matching, picking a build, the wiki parser, save paths, hashes) are exported for
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

// ---------------------------------------------------------------- PCGamingWiki
// sections of the list as console keys (the page's own headings)
const WIKI_SECTIONS = [[/^arcade$/i, 'arcade'], [/nintendo entertainment system|famicom$/i, 'nes'], [/super nintendo/i, 'snes'], [/nintendo 64/i, 'n64'], [/game boy advance/i, 'gba'], [/game boy/i, 'gbc'], [/gamecube/i, 'gamecube'], [/nintendo ds/i, 'nds'], [/wii/i, 'wii'], [/genesis|mega drive/i, 'genesis'], [/playstation 4/i, 'ps4'], [/playstation 2/i, 'ps2'], [/^playstation$/i, 'psx'], [/xbox 360/i, 'xbox360']];
// the page's wikitext (action=raw) as rows: { console, game, port, links } for the console sections only
function parseWikitext(text) {
  const rows = [];
  let con = null;
  for (const block of String(text || '').split(/\n(?=={2,}|\|-)/)) {
    const h = /^={2,}\s*(.*?)\s*={2,}/.exec(block);
    if (h) { const name = h[1].replace(/\[\[|\]\]|'''?/g, '').trim(); const hit = WIKI_SECTIONS.find(([re]) => re.test(name)); con = hit ? hit[1] : /^(windows|dos|pc-98|mac|phone|engines|references|multiplatform|nintendo|sega|sony|microsoft)$/i.test(name) ? (/^(nintendo|sega|sony|microsoft|multiplatform)$/i.test(name) ? con : null) : con; continue; }
    if (!con || !/^\|-/.test(block)) continue;
    const cells = block.replace(/^\|-[^\n]*\n?/, '').split(/\n\||\|\|/).map((c) => c.replace(/^\|/, '').trim()).filter((c, i) => c || i);
    if (cells.length < 2) continue;
    const text2 = (c) => String(c || '').replace(/\{\{[^}]*\}\}/g, '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/\[(https?:\S+)\s+([^\]]*)\]/g, '$2').replace(/<[^>]+>/g, '').replace(/'''?/g, '').trim();
    const links = [...String(cells[1]).matchAll(/https?:\/\/[^\s\]|}]+/g)].map((m) => m[0]);
    rows.push({ console: con, game: text2(cells[0]), port: text2(cells[1]), links });
  }
  return rows.filter((r) => r.game && r.port);
}
// a GitHub or GitLab project named in a link -> "github:owner/name"
function repoFromLink(u) {
  const m = /^https?:\/\/(?:www\.)?(github|gitlab)\.com\/([\w.-]+)\/([\w.-]+)/i.exec(String(u || ''));
  if (!m || /^(topics|orgs|search|sponsors|users|explore|groups)$/i.test(m[2])) return null;
  return `${m[1].toLowerCase()}:${m[2]}/${m[3].replace(/\.git$/i, '')}`;
}
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
async function checkGame(e, file) {
  const need = e?.needs;
  if (!need) return { ok: true };
  const st = await fsp.stat(file).catch(() => null);
  if (!st) return { ok: false, why: 'That file isn’t there any more.' };
  if (need.files === 'folder' && !st.isDirectory()) return { ok: false, why: `${e.name} needs the game as a folder: ${need.what}` };
  if (need.files !== 'folder' && st.isDirectory()) return { ok: false, why: `${e.name} needs a file, not a folder: ${need.what}` };
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

function createRecomps(ctx) {
  const { dataDir, log = () => {} } = ctx;
  const F = (n) => path.join(dataDir, n);
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
  const writeJson = (f, v) => { try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 1)); fs.renameSync(f + '.tmp', f); } catch (e) { log('recomps: write', path.basename(f), e.message); } };
  const SHIPPED = ctx.shipped || path.join(__dirname, 'recomps.json'); // ctx.shipped: tests
  let installs = readJson(F('recomp-installs.json'), {});
  let latest = readJson(F('recomp-latest.json'), {});
  const saveInstalls = () => writeJson(F('recomp-installs.json'), installs);
  let cat = null;
  // the catalogue: the copy from Cartridge's repository when it's newer than the one shipped, then entries found on
  // PCGamingWiki since, then recomps you added from a link. Same id or same project: the earlier source wins.
  function catalogue() {
    if (cat) return cat;
    const shipped = readJson(SHIPPED, { entries: [] }), fetched = readJson(F('recomps.json'), null);
    const base = fetched && String(fetched.updated || '') > String(shipped.updated || '') ? fetched : shipped;
    const out = [], ids = new Set(), repos = new Set();
    const add = (e, from) => {
      if (!e?.id || ids.has(e.id) || (e.repo && repos.has(e.repo.toLowerCase()))) return;
      ids.add(e.id); if (e.repo) repos.add(e.repo.toLowerCase());
      out.push({ ...e, from });
    };
    for (const e of base.entries || []) add(e, 'list');
    for (const e of readJson(F('recomps-found.json'), [])) add(e, 'found');
    for (const e of readJson(F('recomps-mine.json'), [])) add(e, 'link');
    cat = { updated: base.updated || '', entries: out };
    return cat;
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
    if (!e?.needs) return true;
    if (e.done) { const d = expandPath(e.done, rec.dir); return !!d && exists(d); }
    return !!rec.setupDone;
  }
  // everything the screens show, in one go
  function list({ roms = [] } = {}) {
    const out = [];
    for (const e of catalogue().entries) {
      const rec = installs[e.id] || null;
      const lt = latest[e.id] || null;
      out.push({
        id: e.id, name: e.name, games: e.games, origin: e.origin, from: e.from, repo: e.repo || null, description: e.description || '', url: projectUrl(e), site: e.site || null,
        builds: e.builds, needs: e.needs || null, setup: e.setup || { how: 'none' }, done: e.done || null, saves: e.saves || [], achievements: e.achievements || null, license: e.license || null,
        roms: matchRoms(e, roms),
        installed: rec ? { tag: rec.tag, kind: rec.kind, dir: rec.dir, program: rec.program, channel: rec.channel || 'stable', at: rec.at, game: rec.game || null, ready: readyOf(e, rec), here: exists(rec.program), appid: rec.appid || null } : null,
        latest: lt && { tag: lt.tag, date: lt.date, kind: lt.kind, at: lt.at, none: lt.none || null },
        update: !!(rec && lt?.tag && rec.tag && lt.tag !== rec.tag && !lt.none),
      });
    }
    return { updated: catalogue().updated, consoles: CONSOLES, entries: out };
  }
  // the newest release this device can use (remembered for the screens; a check is reused for 6 hours)
  async function check(id, { force = false, channel } = {}) {
    const e = byId(id);
    if (!e) throw new Error('That recomp isn’t in the list.');
    const ch = channel || installs[id]?.channel || 'stable';
    const old = latest[id];
    if (!force && old && old.channel === ch && Date.now() - old.at < 6 * 3600e3) return old;
    if (!repoOf(e.repo)) { latest[id] = { at: Date.now(), channel: ch, none: e.builds === 'site' ? 'site' : 'source' }; writeJson(F('recomp-latest.json'), latest); return latest[id]; }
    const rel = await releaseOf(e, { pre: ch === 'pre', fetchImpl: ctx.fetchImpl });
    const b = rel && pickBuild(rel.assets, e);
    latest[id] = b ? { tag: rel.tag, date: rel.date, kind: b.kind, name: b.asset.name, url: b.asset.url, size: b.asset.size || 0, at: Date.now(), channel: ch } : { at: Date.now(), channel: ch, none: rel ? 'nobuild' : 'norelease', tag: rel?.tag || null };
    writeJson(F('recomp-latest.json'), latest);
    return latest[id];
  }
  // ---- saves: backed up before an update or removal, checked after (owner: updates must never lose saves)
  function backupSaves(id, why) {
    const e = byId(id), rec = installs[id];
    const dirs = saveDirs(e, rec).filter(exists);
    if (!dirs.length) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-'), to = path.join(dataDir, 'recomp-backups', id, stamp);
    const meta = { id, why, at: Date.now(), tag: rec?.tag || null, items: [] };
    dirs.forEach((d, i) => { const dst = path.join(to, `${i}-${path.basename(d)}`); fs.cpSync(d, dst, { recursive: true, dereference: false }); meta.items.push({ from: d, copy: dst, files: countFiles(dst) }); });
    fs.writeFileSync(path.join(to, 'backup.json'), JSON.stringify(meta, null, 1));
    // ten backups per recomp are kept, the oldest go
    const all = (() => { try { return fs.readdirSync(path.dirname(to)).sort(); } catch { return []; } })();
    for (const old of all.slice(0, Math.max(0, all.length - 10))) fs.rmSync(path.join(path.dirname(to), old), { recursive: true, force: true });
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
    return (() => { try { return fs.readdirSync(d); } catch { return []; } })().sort().reverse().map((n) => { const m = readJson(path.join(d, n, 'backup.json'), null); return m && { stamp: n, at: m.at, why: m.why, tag: m.tag, places: m.items.length }; }).filter(Boolean);
  }
  // ---- install or update: download, unpack, keep the release it replaces, put the new one where the old one is
  async function install(id, { channel, onProgress = () => {}, signal } = {}) {
    const e = byId(id);
    if (!e) throw new Error('That recomp isn’t in the list.');
    if (!repoOf(e.repo)) throw new Error(e.builds === 'site' ? `${e.name} is downloaded from its own site, not GitHub. Open its page.` : `${e.name} doesn’t publish builds: it has to be built from its source.`);
    const prev = installs[id] || null;
    if (prev && exists(prev.program) && ctx.isRunning(prev.flatpak || prev.program)) throw new Error(`Close ${e.name} first.`);
    const ch = channel || prev?.channel || 'stable';
    onProgress({ step: 'check', pct: null });
    const rel = await releaseOf(e, { pre: ch === 'pre', fetchImpl: ctx.fetchImpl });
    if (!rel) throw new Error(`${e.name} has no releases yet.`);
    const b = pickBuild(rel.assets, e);
    if (!b) throw new Error(`${e.name}’s newest release has no Linux or Windows build (Android, macOS and source code can’t run here).`);
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
    let program, files, kind = b.kind, tmpNow = tmp;
    try {
      let got = 0;
      await ctx.download(b.asset.url, tmp, (n) => { got += n; onProgress({ step: 'download', pct: b.asset.size ? Math.min(99, Math.floor((got / b.asset.size) * 100)) : null, got }); }, signal);
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
        return { tag: rel.tag, kind: 'flatpak', program: '/usr/bin/flatpak', dir: dest, updated: !!prev, programMoved: false, restored: checkSaves(meta).restored, backedUp: !!meta };
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
    installs[id] = { ...(prev || {}), id, repo: e.repo, dir: dest, program, kind, tag: rel.tag, date: rel.date, files, channel: ch, at: Date.now(), asset: b.asset.name };
    saveInstalls();
    // 0.9.66 (agreed plan): after an update the new release is started once before Steam's shortcut follows it. One that
    // can't start at all (missing libraries, a crash in the first seconds) goes back to the release that worked
    if (prev && prev.tag && kind === 'linux' && ctx.trialRun) {
      onProgress({ step: 'trial', pct: null });
      const t = await ctx.trialRun({ program, args: prev.args || '', cwd: path.dirname(program), ready: readyOf(e, prev) }).catch((er) => ({ failed: true, why: er.message }));
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
    return { tag: rel.tag, kind, program, dir: dest, updated: !!prev, programMoved: !!(prev && prev.program !== program), started: prev && kind === 'linux' && ctx.trialRun ? true : undefined, restored: saves.restored, backedUp: !!meta };
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
    const how = e.setup?.how || 'none';
    rec.game = { file, at: Date.now(), checked: chk.ok, how };
    let note = '', args = null;
    if (how === 'place' && e.setup?.place) {
      const want = expandPath(e.setup.place, rec.dir);
      const target = /\/$/.test(e.setup.place) || (exists(want) && fs.statSync(want).isDirectory()) ? path.join(want, path.basename(file)) : want;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (exists(target) || fs.lstatSync(target, { throwIfNoEntry: false })) {
        const same = (() => { try { return fs.realpathSync(target) === fs.realpathSync(file); } catch { return false; } })();
        if (!same) return { ok: false, why: `${target.replace(os.homedir(), '~')} is already there. Cartridge leaves it as it is.` };
      } else fs.symlinkSync(file, target);
      rec.game.placed = target;
      note = `Linked as ${target.replace(os.homedir(), '~')}.`;
    } else if (how === 'path' && e.setup?.arg) {
      args = e.setup.arg.replace(/\{FILE\}/g, rec.kind === 'windows' ? `"Z:${file}"` : `"${file}"`);
      rec.args = args;
      note = 'Cartridge starts it with your game.';
    } else if (how === 'picker') {
      note = rec.kind === 'windows' ? `When it asks for the game, paste this: Z:${file.replace(/\//g, '\\')}` : `When it asks for the game, pick: ${file}`;
    }
    if (how !== 'picker') rec.setupDone = true;
    saveInstalls();
    log('recomp game set', id, how, chk.ok ? 'checked' : 'used anyway');
    return { ok: true, how, note, args, checked: chk.ok, path: rec.kind === 'windows' ? 'Z:' + file.replace(/\//g, '\\') : file };
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
      const doneAt = e.done ? expandPath(e.done, rec.dir) : null;
      // the folders it builds into: its own, and the done file's folder when that is elsewhere (~/.config/<Name>)
      const dirs = [rec.dir, ...(doneAt && !doneAt.startsWith(rec.dir + path.sep) ? [path.dirname(doneAt)] : [])];
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
  // ---- the daily refresh (silent): the catalogue from Cartridge's repository, then PCGamingWiki's page for projects
  // the catalogue doesn't have yet, then the newest release of each installed recomp
  async function refresh({ playing = () => false } = {}) {
    const res = { catalogue: false, found: 0, checked: 0 };
    const f = ctx.fetchImpl || require('./webFetch');
    try {
      const r = await f(ctx.catalogueUrl, { headers: { 'User-Agent': 'Cartridge' }, signal: AbortSignal.timeout(20000) });
      if (r.ok) { const j = await r.json(); if (Array.isArray(j?.entries) && String(j.updated || '') > String(catalogue().updated || '')) { writeJson(F('recomps.json'), j); cat = null; res.catalogue = true; } }
    } catch (e) { log('recomps: catalogue refresh', e.message); }
    if (playing()) return res;
    try {
      const r = await f('https://www.pcgamingwiki.com/w/index.php?title=List_of_unofficial_ports&action=raw', { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Cartridge' }, signal: AbortSignal.timeout(25000) });
      if (r.ok) res.found = await addFound(parseWikitext(await r.text()));
    } catch (e) { log('recomps: PCGamingWiki', e.message); }
    for (const id of Object.keys(installs)) {
      if (playing()) break;
      try { await check(id, { force: true }); res.checked++; } catch (e) { log('recomps: check', id, e.message); }
    }
    ensureFolders();
    return res;
  }
  // rows from the wiki that name a project the catalogue lacks: added quietly, marked found. A row without a project
  // link is looked up on GitHub only when one well-starred, non-fork project names the port (no guesses).
  async function addFound(rows, { search = ctx.search } = {}) {
    const known = new Set(catalogue().entries.flatMap((e) => [e.repo?.toLowerCase(), ...(e.games || []).map((g) => g.console + ':' + norm(e.name))]).filter(Boolean));
    const found = readJson(F('recomps-found.json'), []);
    let n = 0, looked = 0;
    for (const row of rows) {
      let repo = row.links.map(repoFromLink).find(Boolean);
      if (!repo && search && looked < 5 && row.port.length > 3) {
        looked++;
        const hits = await search(`${row.port}`).catch(() => []);
        const ok = hits.filter((h) => !h.fork && h.stars >= 25 && norm(h.repo.split('/')[1]).replace(/ /g, '').includes(norm(row.port).replace(/ /g, '').slice(0, 10)));
        if (ok.length === 1 || (ok.length > 1 && ok[0].stars >= ok[1].stars * 4)) repo = 'github:' + ok[0].repo;
      }
      if (!repo || known.has(repo.toLowerCase()) || known.has(row.console + ':' + norm(row.port))) continue;
      known.add(repo.toLowerCase());
      found.push({ id: 'found-' + slugId(repo.split(':')[1].replace('/', '-')), name: row.port, games: [{ title: row.game.replace(/\s*\([^)]*\)\s*$/, ''), console: row.console }], origin: 'recomp', repo, builds: 'linux', needs: null, setup: { how: 'picker' }, saves: [], description: '', auto: true, at: Date.now() });
      n++;
    }
    if (n) { writeJson(F('recomps-found.json'), found); cat = null; log('recomps: found', n, 'new on PCGamingWiki'); }
    return n;
  }
  const record = (id) => installs[id] || null;
  const reload = () => { cat = null; installs = readJson(F('recomp-installs.json'), {}); };
  return { catalogue, byId, details, ready, watchSetup, list, check, install, versions, useVersion, dropVersion, remove, setChannel, setGame, markDone, setAppid, addLink, refresh, addFound, ensureFolders, backups, backupSaves, checkSaves, record, saveDirs: (id) => saveDirs(byId(id), installs[id]), homeDir, reload };
}

module.exports = { savePaths, readmePicture, plainNotes, guessFromText, CONSOLES, SLUGS, consoleOfSlug, norm, titleKeys, matchRoms, pickBuild, repoOf, projectUrl, releaseOf, expandPath, saveDirs, parseWikitext, repoFromLink, slugId, hashFile, checkGame, createRecomps };
