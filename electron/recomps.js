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
// library games this recomp is for: same console family, same title
function matchRoms(entry, roms) {
  const out = [];
  for (const g of entry.games || []) {
    const keys = new Set(titleKeys(g.title).concat((g.also || []).flatMap(titleKeys)));
    for (const r of roms || []) {
      if (consoleOfSlug(r.platform_slug) !== g.console && !(g.console === 'gbc' && consoleOfSlug(r.platform_slug) === 'gb')) continue;
      if (titleKeys(r.name).some((k) => keys.has(k))) out.push(r.id);
    }
  }
  return [...new Set(out)];
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
function saveDirs(e, rec, home) {
  return [...new Set((e?.saves || []).map((p) => expandPath(p, rec?.dir, home)).filter(Boolean))];
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

// ---------------------------------------------------------------- the engine
function createRecomps(ctx) {
  const { dataDir, log = () => {} } = ctx;
  const F = (n) => path.join(dataDir, n);
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
  const writeJson = (f, v) => { try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 1)); fs.renameSync(f + '.tmp', f); } catch (e) { log('recomps: write', path.basename(f), e.message); } };
  const SHIPPED = path.join(__dirname, 'recomps.json');
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
        id: e.id, name: e.name, games: e.games, origin: e.origin, from: e.from, description: e.description || '', url: projectUrl(e), site: e.site || null,
        builds: e.builds, needs: e.needs || null, setup: e.setup || { how: 'none' }, saves: e.saves || [], achievements: e.achievements || null, license: e.license || null,
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
    if (prev && exists(prev.program) && ctx.isRunning(prev.program)) throw new Error(`Close ${e.name} first.`);
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
    const tmp = path.join(path.dirname(dest), `.${path.basename(dest)}.cartridge-dl`);
    const out = dest + '.cartridge-new';
    const FV = require('./forkVersions'), store = FV.storeOf(path.dirname(dest), path.basename(dest));
    let program, files, kind = b.kind;
    try {
      let got = 0;
      await ctx.download(b.asset.url, tmp, (n) => { got += n; onProgress({ step: 'download', pct: b.asset.size ? Math.min(99, Math.floor((got / b.asset.size) * 100)) : null, got }); }, signal);
      onProgress({ step: 'unpack', pct: null });
      fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
      const nm = b.asset.name;
      if (/\.appimage$/i.test(nm)) { fs.copyFileSync(tmp, path.join(out, `${folderName(e).replace(/\s+/g, '')}.AppImage`)); }
      else if (/\.exe$/i.test(nm)) { fs.copyFileSync(tmp, path.join(out, `${folderName(e).replace(/\s+/g, '')}.exe`)); kind = 'windows'; }
      else await ctx.unpackTo(tmp, out, nm);
      // one folder around everything is taken off, as most releases are packed
      const top = fs.readdirSync(out);
      const inner = top.length === 1 && fs.statSync(path.join(out, top[0])).isDirectory() ? path.join(out, top[0]) : out;
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
    } finally { fs.rmSync(tmp, { force: true }); fs.rmSync(out, { recursive: true, force: true }); }
    const saves = checkSaves(meta);
    installs[id] = { ...(prev || {}), id, repo: e.repo, dir: dest, program, kind, tag: rel.tag, date: rel.date, files, channel: ch, at: Date.now(), asset: b.asset.name };
    saveInstalls();
    latest[id] = { tag: rel.tag, date: rel.date, kind, name: b.asset.name, at: Date.now(), channel: ch }; writeJson(F('recomp-latest.json'), latest);
    log('recomp', prev ? 'updated' : 'installed', id, rel.tag, kind, program);
    return { tag: rel.tag, kind, program, dir: dest, updated: !!prev, programMoved: !!(prev && prev.program !== program), restored: saves.restored, backedUp: !!meta };
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
    if (exists(rec.program) && ctx.isRunning(rec.program)) throw new Error(`Close ${byId(id)?.name || 'it'} first.`);
    const meta = backupSaves(id, 'remove');
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
  return { catalogue, byId, list, check, install, versions, useVersion, dropVersion, remove, setChannel, setGame, markDone, setAppid, addLink, refresh, addFound, ensureFolders, backups, backupSaves, checkSaves, record, saveDirs: (id) => saveDirs(byId(id), installs[id]), homeDir, reload };
}

module.exports = { CONSOLES, SLUGS, consoleOfSlug, norm, titleKeys, matchRoms, pickBuild, repoOf, projectUrl, releaseOf, expandPath, saveDirs, parseWikitext, repoFromLink, slugId, hashFile, checkGame, createRecomps };
