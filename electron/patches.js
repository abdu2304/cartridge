'use strict';
const webFetch = require('./webFetch');
// Emulator patches (0.9.3 D7, owner's option 1). The patches themselves are the emulator's own
// (RPCS3 downloads its patch.yml); Cartridge lists the ones for a game and turns them on or off in
// the emulator's own patch settings, so they stay on exactly as if ticked in the emulator. It only
// ever turns off what it turned on itself (recorded in Cartridge's patches.json); patches you turned
// on in the emulator are shown as on and left alone. Every other entry in the file is kept.
const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');

const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
// Everything as text (FAILSAFE): RPCS3's app version keys like 01.00 must not turn into numbers
// json: true lets a key appear twice (the later wins), as yaml-cpp, which RPCS3 uses, reads it (0.9.19:
// a duplicate key in RPCS3's patch list made js-yaml throw, so no patches showed at all)
const load = (t) => yaml.load(t, { schema: yaml.FAILSAFE_SCHEMA, json: true }) || {};
const dump = (o) => yaml.dump(o, { schema: yaml.FAILSAFE_SCHEMA, lineWidth: -1, noRefs: true });
const readYaml = (f) => { try { const o = load(fs.readFileSync(f, 'utf8')); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
// A patch file read for listing only: js-yaml first, else a forgiving reader of the parts Cartridge needs
// (hash > description > Games > title > serial > versions, Author, Notes, Group), so one line RPCS3's own
// yaml-cpp accepts but js-yaml doesn't never hides the whole list
function readPatchFile(f) {
  let text; try { text = fs.readFileSync(f, 'utf8'); } catch { return {}; }
  try { const o = load(text); if (o && typeof o === 'object') return o; } catch {}
  return loosePatchYaml(text);
}
function loosePatchYaml(text) {
  const unq = (v) => { v = String(v).trim(); const m = /^"((?:[^"\\]|\\.)*)"$|^'((?:[^']|'')*)'$/.exec(v); return m ? (m[1] !== undefined ? m[1].replace(/\\"/g, '"') : m[2].replace(/''/g, "'")) : v; };
  const flow = (v) => v.replace(/^\[|\]$/g, '').split(',').map((x) => unq(x)).filter((x) => x !== '');
  const KEY = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^:]+?)\s*:(?:\s+(.*))?$/;
  const root = {}, st = [{ indent: -1, node: root }];
  let block = null; // indent of a | or > block scalar being skipped
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const indent = raw.length - raw.trimStart().length, line = raw.trim();
    if (block !== null) { if (indent > block) continue; block = null; }
    const item = line === '-' || line.startsWith('- ');
    // a "- item" at the same indent as its key's list stays in that list
    while (st.length > 1 && indent <= st[st.length - 1].indent && !(item && Array.isArray(st[st.length - 1].node) && indent === st[st.length - 1].indent)) st.pop();
    const top = st[st.length - 1];
    if (item) {
      if (!Array.isArray(top.node) && top.parent && !Object.keys(top.node).length) { top.parent[top.key] = []; top.node = top.parent[top.key]; top.indent = indent; }
      if (Array.isArray(top.node)) top.node.push(unq(line.slice(1).trim()));
      continue;
    }
    const m = KEY.exec(line);
    if (!m || Array.isArray(top.node)) continue;
    const key = unq(m[1]); let val = (m[2] || '').replace(/\s+#.*$/, '').trim();
    if (/^&\S+$/.test(val)) val = ''; // an anchor on a map: the map follows
    if (/^[|>][-+]?$/.test(val)) { top.node[key] = ''; block = indent; continue; }
    if (!val) { const child = {}; top.node[key] = child; st.push({ indent, node: child, key, parent: top.node }); continue; }
    top.node[key] = val.startsWith('[') ? flow(val) : unq(val);
  }
  return root;
}

// PARAM.SFO (PS3, PS4, Vita): header "\0PSF", key table and data table offsets, then entries
// { key offset u16, format u16, length u32, max u32, data offset u32 }. Returns { KEY: value }.
function parseSfo(buf) {
  const out = {};
  try {
    if (buf.readUInt32BE(0) !== 0x00505346) return out;
    const keys = buf.readUInt32LE(8), data = buf.readUInt32LE(12), n = buf.readUInt32LE(16);
    for (let i = 0; i < n; i++) {
      const e = 20 + i * 16;
      const ko = buf.readUInt16LE(e), fmt = buf.readUInt16LE(e + 2), len = buf.readUInt32LE(e + 4), off = buf.readUInt32LE(e + 12);
      const k = buf.toString('latin1', keys + ko, buf.indexOf(0, keys + ko));
      out[k] = fmt === 0x0404 ? buf.readUInt32LE(data + off) : buf.toString('utf8', data + off, data + off + len).replace(/\0+$/, '');
    }
  } catch {}
  return out;
}
const sfoAt = (f) => { try { return parseSfo(fs.readFileSync(f)); } catch { return {}; } };

// ---------------------------------------------------------------- RPCS3
// fs::get_config_dir(): ~/.config/rpcs3 (or the Flatpak's). patches/ holds patch.yml (RPCS3's
// download), imported_patch.yml and <serial>_patch.yml; the switches are config/patch_config.yml
// (older RPCS3: patch_config.yml next to patches/). bin_patch.cpp, patch_engine.
// 0.9.63 (owner: Infamous's settings did nothing): where RPCS3 keeps its settings. fs::get_config_dir(true) adds a
// "config/" folder only on Windows (Utilities/File.cpp); on Linux config.yml, custom_configs/ and patch_config.yml sit
// in the root itself (~/.config/rpcs3, the Flatpak's, or portable/). Cartridge wrote custom_configs and patch_config.yml
// under config/ when they didn't exist yet, where Linux RPCS3 never reads them. A root laid out the Windows way
// (config/config.yml and no config.yml beside it: RPCS3 for Windows) keeps config/.
function rpcs3CfgDir(root) { return !exists(path.join(root, 'config.yml')) && exists(path.join(root, 'config', 'config.yml')) ? path.join(root, 'config') : root; }
function rpcs3Dirs(home = os.homedir()) {
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return [path.join(xdg, 'rpcs3'), path.join(home, '.var/app/net.rpcs3.RPCS3/config/rpcs3')]
    .filter((d) => exists(path.join(d, 'patches')) || exists(path.join(d, 'config')) || exists(path.join(d, 'config.yml')))
    .map((root) => ({ root, cfg: rpcs3CfgDir(root), patches: path.join(root, 'patches'), config: path.join(rpcs3CfgDir(root), 'patch_config.yml') }));
}
// Files an earlier Cartridge put under config/ on Linux, moved to where RPCS3 reads them: per-game settings
// (custom_configs/config_<SERIAL>.yml) only when RPCS3 has none for that game (yours are never replaced), and the
// patch switches merged into patch_config.yml (RPCS3's own switches win where both set one). Returns what moved,
// as [from, to], so the records that name the old paths can follow.
function rpcs3Relocate(dir) {
  const moved = [];
  if (dir.cfg !== dir.root) return moved;
  const oldDir = path.join(dir.root, 'config', 'custom_configs'), newDir = path.join(dir.cfg, 'custom_configs');
  for (const n of (() => { try { return fs.readdirSync(oldDir); } catch { return []; } })()) {
    if (!/^config_.+\.yml$/.test(n)) continue;
    const from = path.join(oldDir, n), to = path.join(newDir, n);
    if (exists(to)) continue; // RPCS3's own settings for the game: left as they are, ours stay where they were
    try { load(fs.readFileSync(from, 'utf8')); } catch { continue; } // only a file RPCS3 can read
    fs.mkdirSync(newDir, { recursive: true }); fs.copyFileSync(from, to); fs.rmSync(from); moved.push([from, to]);
  }
  const oldPc = path.join(dir.root, 'config', 'patch_config.yml'), newPc = path.join(dir.cfg, 'patch_config.yml');
  if (exists(oldPc)) {
    const merge = (a, b) => { for (const [k, v] of Object.entries(b)) { if (v && typeof v === 'object' && a[k] && typeof a[k] === 'object') merge(a[k], v); else if (!(k in a)) a[k] = v; } return a; };
    const mineCfg = readYaml(oldPc), theirs = exists(newPc) ? readYaml(newPc) : {};
    if (exists(newPc) && !exists(newPc + '.cartridge-backup')) fs.copyFileSync(newPc, newPc + '.cartridge-backup');
    fs.writeFileSync(newPc + '.tmp', dump(merge(theirs, mineCfg))); fs.renameSync(newPc + '.tmp', newPc);
    fs.renameSync(oldPc, oldPc + '.cartridge-moved'); moved.push([oldPc, newPc]);
  }
  return moved;
}
// The game's serial and app version (APP_VER): an installed update in dev_hdd0 wins over the disc
function ps3Version(gameDir, hdds, serial) {
  for (const h of hdds) { const s = sfoAt(path.join(h, 'game', serial, 'PARAM.SFO')); if (s.APP_VER) return s.APP_VER; }
  for (const f of [path.join(gameDir || '', 'PS3_GAME', 'PARAM.SFO'), path.join(gameDir || '', 'PARAM.SFO')]) { const s = sfoAt(f); if (s.APP_VER) return s.APP_VER; }
  // a disc image (or a folder holding one): PS3_GAME/PARAM.SFO inside the ISO (0.9.16)
  try { if (fs.statSync(gameDir).isDirectory()) { const iso = fs.readdirSync(gameDir).find((n) => /\.iso$/i.test(n)); if (iso) gameDir = path.join(gameDir, iso); } } catch {}
  if (/\.iso$/i.test(gameDir || '')) { const b = isoFile(gameDir, ['PS3_GAME', 'PARAM.SFO']); const v = b && parseSfo(b).APP_VER; if (v) return v; }
  return null;
}
// Patches for one game: [{ key, hash, description, title, serial, version, author, notes, group, on, by }]
// by: 'cartridge' when Cartridge turned it on, 'emulator' when turned on in RPCS3, null when off.
function rpcs3List(dir, serial, appVer, mine = {}) {
  const files = ['patch.yml', 'imported_patch.yml', `${serial}_patch.yml`].map((f) => path.join(dir.patches, f)).filter(exists);
  const cfg = readYaml(dir.config);
  const out = [], seen = new Set();
  for (const f of files) {
    const doc = readPatchFile(f);
    for (const [hash, descs] of Object.entries(doc)) {
      if (hash === 'Version' || hash === 'Anchors' || !descs || typeof descs !== 'object') continue;
      for (const [description, p] of Object.entries(descs)) {
        const games = p?.Games;
        if (!games || typeof games !== 'object') continue;
        for (const [title, serials] of Object.entries(games)) {
          const vers = serials?.[serial];
          if (!Array.isArray(vers)) continue;
          // this game's version, else All; with the version unknown, the one version it lists. 0.9.21
          // (owner: Uncharted 3 at 1.19 listed every version's patches): when the copy's version is
          // known, patches for other versions are left out, unless one is already on (so it can be
          // turned off). With the version unknown, they're listed, saying which version they're for.
          let version = vers.includes(appVer) ? appVer : vers.includes('All') ? 'All' : !appVer && vers.length === 1 ? vers[0] : null;
          let other = null;
          if (!version) { version = [...vers].sort((x, y) => String(y).localeCompare(String(x), undefined, { numeric: true }))[0]; if (!version) continue; other = vers; }
          const key = [hash, description, title, serial, version].join('\u0001');
          if (seen.has(key)) continue;
          seen.add(key);
          const node = cfg?.[hash]?.[description]?.[title]?.[serial]?.[version];
          const on = node === 'true' || !!(node && typeof node === 'object' && node.Enabled === 'true');
          if (other && appVer && !on) continue;
          const note = other ? `For game version ${other.join(', ')}${appVer ? ` (this copy is ${appVer}: install the game's update in RPCS3 for it to apply)` : ''}.` : '';
          out.push({ key, hash, description, title, serial, version, author: p.Author || '', notes: [note, typeof p.Notes === 'string' ? p.Notes : ''].filter(Boolean).join(' '), group: p.Group || '', on, other: !!other, by: on ? (mine[key] ? 'cartridge' : 'emulator') : null });
        }
      }
    }
  }
  const exact = new Set(out.filter((x) => !x.other).map((x) => [x.hash, x.description, x.title].join('\u0001')));
  return out.filter((x) => !x.other || !exact.has([x.hash, x.description, x.title].join('\u0001'))).sort((a, b) => a.other - b.other || a.description.localeCompare(b.description));
}
// RPCS3's own patch download (rpcs3qt/patch_manager_dialog.cpp): GET rpcs3.net/compatibility?patch&api=v1
// &v=<patch engine 1.2>[&sha256=<current file>]; JSON return_code 0 new, 1 up to date, <0 error; version
// must be 1.2 and sha256 must match the patch text; RPCS3 keeps the old file as patch.yml.old.
const RPCS3_PATCH_ENGINE = '1.2';
async function rpcs3DownloadPatches(patchesDir, { fetchImpl = webFetch, base = 'https://rpcs3.net' } = {}) {
  const file = path.join(patchesDir, 'patch.yml');
  let url = `${base}/compatibility?patch&api=v1&v=${RPCS3_PATCH_ENGINE}`;
  try { url += '&sha256=' + require('crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex'); } catch {}
  const r = await fetchImpl(url);
  if (!r.ok) throw new Error(`rpcs3.net answered ${r.status}`);
  const j = await r.json();
  if (j.return_code === 1) return { updated: false };
  if (j.return_code !== 0) throw new Error(`rpcs3.net: no patches (code ${j.return_code})`);
  if (j.version !== RPCS3_PATCH_ENGINE || typeof j.patch !== 'string' || !j.patch) throw new Error('rpcs3.net sent a patch list for another RPCS3 version');
  if (String(j.sha256 || '').toLowerCase() !== require('crypto').createHash('sha256').update(j.patch).digest('hex')) throw new Error('The downloaded patch list failed its checksum');
  // RPCS3 validates with its own loader (yaml-cpp); here the forgiving reader must find a Version 1.2 file
  { const o = (() => { try { return load(j.patch); } catch { return loosePatchYaml(j.patch); } })(); if (o.Version !== RPCS3_PATCH_ENGINE) throw new Error('The downloaded patch list isn’t one RPCS3 1.2 reads'); }
  fs.mkdirSync(patchesDir, { recursive: true });
  if (exists(file)) fs.renameSync(file, file + '.old');
  fs.writeFileSync(file, j.patch);
  return { updated: true };
}
// Turn patches on (Enabled: true) or off in patch_config.yml. Off only for ones Cartridge turned on.
// Everything else in the file is written back as it was. Returns the new { key: true } record.
function rpcs3Set(dir, changes, mine = {}) {
  const cfg = readYaml(dir.config);
  const rec = { ...mine };
  for (const c of changes) {
    const k = c.key;
    const path5 = [c.hash, c.description, c.title, c.serial, c.version];
    if (c.on) {
      let o = cfg;
      for (const p of path5.slice(0, 4)) { if (!o[p] || typeof o[p] !== 'object') o[p] = {}; o = o[p]; }
      const cur = o[c.version];
      o[c.version] = cur && typeof cur === 'object' ? { ...cur, Enabled: 'true' } : { Enabled: 'true' };
      rec[k] = true;
    } else if (rec[k]) {
      const chain = [cfg]; let o = cfg;
      for (const p of path5.slice(0, 4)) { o = o?.[p]; chain.push(o); }
      const node = o?.[c.version];
      if (node && typeof node === 'object') { delete node.Enabled; if (!Object.keys(node).length) delete o[c.version]; } else if (o) delete o[c.version];
      for (let i = 4; i > 0; i--) if (chain[i] && !Object.keys(chain[i]).length) delete chain[i - 1][path5[i - 1]]; // drop what is now empty
      delete rec[k];
    }
  }
  fs.mkdirSync(path.dirname(dir.config), { recursive: true });
  if (exists(dir.config) && !exists(dir.config + '.cartridge-backup')) fs.copyFileSync(dir.config, dir.config + '.cartridge-backup'); // the file as it was before Cartridge first touched it
  const tmp = dir.config + '.tmp';
  fs.writeFileSync(tmp, dump(cfg));
  fs.renameSync(tmp, dir.config);
  return rec;
}

// ---------------------------------------------------------------- shadPS4
// shadPS4's user folder (common/path_util.cpp: ~/.local/share/shadPS4, or $XDG_DATA_HOME) holds
// patches/<repository>/files.json ({ "<file>.xml": [serials] }) and the XML files. A patch is a
// <Metadata Name AppVer Author Note isEnabled> element; the launcher shows those whose AppVer is the
// game's version, or "mask" (any version), and turns one on by writing isEnabled="true"
// (qt_gui/cheats_patches.cpp, common/memory_patcher.cpp). Only that attribute is changed here.
function shadDirs(home = os.homedir()) {
  const data = process.env.XDG_DATA_HOME || path.join(home, '.local/share');
  return [...new Set([path.join(data, 'shadPS4'), path.join(home, '.local/share/shadPS4')])].filter((d) => exists(path.join(d, 'patches')));
}
// a PS4 game's version: an update folder next to it (Game-UPDATE, Game-patch) wins over the game
function ps4Version(gameDir) {
  for (const d of [`${gameDir}-UPDATE`, `${gameDir}-patch`, gameDir]) { const s = sfoAt(path.join(d, 'sce_sys', 'param.sfo')); if (s.APP_VER) return s.APP_VER; }
  return null;
}
const unXml = (v) => String(v).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attrsOf = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]));
function shadFiles(userDir, serial) {
  const out = [];
  const pd = path.join(userDir, 'patches');
  let repos = []; try { repos = fs.readdirSync(pd, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch {}
  for (const repo of repos) {
    let map = {}; try { map = JSON.parse(fs.readFileSync(path.join(pd, repo, 'files.json'), 'utf8')); } catch { continue; }
    const file = Object.keys(map).find((f) => Array.isArray(map[f]) && map[f].includes(serial));
    if (file && exists(path.join(pd, repo, file))) out.push({ repo, file, full: path.join(pd, repo, file) });
  }
  return out;
}
function shadList(userDir, serial, version, mine = {}) {
  const out = [];
  for (const f of shadFiles(userDir, serial)) {
    let xml = ''; try { xml = fs.readFileSync(f.full, 'utf8'); } catch { continue; }
    for (const m of xml.matchAll(/<Metadata\b([^>]*?)\/?>/g)) {
      const a = attrsOf(m[1]);
      if (!(a.AppVer === version || a.AppVer === 'mask')) continue;
      const key = ['shadps4', f.repo, f.file, a.Name, a.AppVer].join('\u0001');
      const on = a.isEnabled === 'true';
      out.push({ key, repo: f.repo, file: f.file, name: a.Name, appVer: a.AppVer, description: unXml(a.Name || ''), version: a.AppVer === 'mask' ? 'All' : a.AppVer, author: unXml(a.Author || ''), notes: unXml(a.Note || ''), group: f.repo, section: /goldhen/i.test(f.repo) ? 'GoldHEN' : 'shadPS4', on, by: on ? (mine[key] ? 'cartridge' : 'emulator') : null });
    }
  }
  return out.sort((a, b) => a.description.localeCompare(b.description));
}
// shadPS4's two patch lists, downloaded the way its launcher's Download Patches does (0.9.23, owner: both
// lists, shadPS4's and GoldHEN's; read from shadps4-qtlauncher qt_gui/cheats_patches.cpp downloadPatches
// and createFilesJson): every .xml of the repository's folder into patches/<repo>/, then files.json
// maps each file to the game IDs in its <ID> elements. Listing: GitHub's contents API, else the folder's
// page; files from raw.githubusercontent.com. Nothing else in shadPS4's folder is touched.
const SHAD_REPOS = {
  shadPS4: { api: 'https://api.github.com/repos/shadps4-emu/ps4_cheats/contents/PATCHES', page: 'https://github.com/shadps4-emu/ps4_cheats/tree/main/PATCHES', raw: 'https://raw.githubusercontent.com/shadps4-emu/ps4_cheats/main/PATCHES/' },
  GoldHEN: { api: 'https://api.github.com/repos/illusion0001/PS4-PS5-Game-Patch/contents/patches/xml', page: 'https://github.com/illusion0001/PS4-PS5-Game-Patch/tree/main/patches/xml', raw: 'https://raw.githubusercontent.com/illusion0001/PS4-PS5-Game-Patch/main/patches/xml/' },
};
async function shadRepoFiles(repo, fetchImpl) {
  const R = SHAD_REPOS[repo];
  const r = await fetchImpl(R.api, { headers: { 'User-Agent': 'Cartridge', Accept: 'application/vnd.github.v3+json' }, signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (r && r.ok) { const j = await r.json(); if (Array.isArray(j)) return j.filter((x) => /\.xml$/i.test(x.name)).map((x) => ({ name: x.name, url: x.download_url || R.raw + encodeURIComponent(x.name) })); }
  const p = await fetchImpl(R.page, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Cartridge' }, signal: AbortSignal.timeout(20000) });
  if (!p.ok) throw new Error(`GitHub answered ${p.status}`);
  const names = [...new Set([...(await p.text()).matchAll(/"name":"([^"]+\.xml)"/g)].map((m) => m[1]))];
  if (!names.length) throw new Error('GitHub didn’t list the patch files.');
  return names.map((n) => ({ name: n, url: R.raw + encodeURIComponent(n) }));
}
async function shadDownloadPatches(userDir, repo, { fetchImpl = require('./webFetch') } = {}) {
  const dir = path.join(userDir, 'patches', repo);
  fs.mkdirSync(dir, { recursive: true });
  const files = await shadRepoFiles(repo, fetchImpl);
  let i = 0, ok = 0;
  const one = async () => {
    for (let f; (f = files[i++]);) {
      if (path.basename(f.name) !== f.name) continue;
      try { const r = await fetchImpl(f.url, { signal: AbortSignal.timeout(30000) }); if (!r.ok) continue; const t = await r.text(); if (!/<Metadata\b/.test(t)) continue; fs.writeFileSync(path.join(dir, f.name), t); ok++; } catch {}
    }
  };
  await Promise.all(Array.from({ length: 8 }, one));
  // files.json: { "<file>.xml": ["CUSA00001", ...] }, from each file's <ID> elements (createFilesJson)
  const map = {};
  for (const n of fs.readdirSync(dir).filter((x) => /\.xml$/i.test(x))) {
    let t = ''; try { t = fs.readFileSync(path.join(dir, n), 'utf8'); } catch { continue; }
    map[n] = [...new Set([...t.matchAll(/<ID>\s*([^<\s]+)\s*<\/ID>/g)].map((m) => m[1]))];
  }
  fs.writeFileSync(path.join(dir, 'files.json'), JSON.stringify(map, null, 4));
  return { files: ok };
}
// sets isEnabled on the matching <Metadata> tags; the rest of each file stays byte for byte
function shadSet(userDir, changes, mine = {}) {
  const rec = { ...mine };
  const byFile = new Map();
  for (const c of changes) { if (!c.on && !rec[c.key]) continue; const f = path.join(userDir, 'patches', c.repo, c.file); (byFile.get(f) || byFile.set(f, []).get(f)).push(c); }
  for (const [f, list] of byFile) {
    let xml = fs.readFileSync(f, 'utf8');
    xml = xml.replace(/<Metadata\b([^>]*?)(\/?)>/g, (whole, body, slash) => {
      const a = attrsOf(body);
      const c = list.find((x) => x.name === a.Name && x.appVer === a.AppVer);
      if (!c) return whole;
      const val = c.on ? 'true' : 'false';
      const nb = /\bisEnabled\s*=\s*"[^"]*"/.test(body) ? body.replace(/\bisEnabled\s*=\s*"[^"]*"/, `isEnabled="${val}"`) : `${body.replace(/\s*$/, '')} isEnabled="${val}"`;
      return `<Metadata${nb}${slash}>`;
    });
    if (!exists(f + '.cartridge-backup')) fs.copyFileSync(f, f + '.cartridge-backup');
    fs.writeFileSync(f + '.tmp', xml); fs.renameSync(f + '.tmp', f);
    for (const c of list) { if (c.on) rec[c.key] = true; else delete rec[c.key]; }
  }
  return rec;
}

// ---------------------------------------------------------------- PCSX2 (PS2)
// From PCSX2's source (pcsx2/Patch.cpp, GameList.cpp, VMManager.cpp, Pcsx2Config.cpp):
// - a game's patches are <SERIAL>_<CRC>.pnach (or <CRC>.pnach) in its own patches.zip (resources
//   folder of the install, inside the AppImage too) and in the user's patches folder;
// - [Name] starts a patch, author= and description= (else comment=) describe it;
// - which are on: the game's own settings file gamesettings/<SERIAL>_<CRC>.ini, section [Patches],
//   one "Enable = <Name>" line each;
// - serial and CRC come from PCSX2's game list cache (cache/gamelist.cache, version 34: per game
//   path, serial, title, title_sort, title_en as u32-length strings, type u8, region u8, size u64,
//   modified u64, crc u32, rating u8, little-endian). So the game must be in PCSX2's game list.
// Data folder: $XDG_CONFIG_HOME/PCSX2, ~/.config/PCSX2, the Flatpak's; folders from inis/PCSX2.ini.
function pcsx2Dirs(home = os.homedir(), first = []) {
  const roots = [...first, process.env.XDG_CONFIG_HOME && path.join(process.env.XDG_CONFIG_HOME, 'PCSX2'), path.join(home, '.config/PCSX2'), path.join(home, '.var/app/net.pcsx2.PCSX2/config/PCSX2')].filter(Boolean);
  const out = [];
  for (const root of [...new Set(roots)]) {
    if (!exists(path.join(root, 'inis'))) continue;
    let ini = ''; try { ini = fs.readFileSync(path.join(root, 'inis', 'PCSX2.ini'), 'utf8'); } catch {}
    const folders = iniSection(ini, 'Folders');
    const at = (k, def) => { const v = (folders.find((x) => x[0] === k) || [])[1] || def; return path.isAbsolute(v) ? v : path.join(root, v); };
    out.push({ root, cache: at('Cache', 'cache'), patches: at('Patches', 'patches'), gamesettings: at('GameSettings', 'gamesettings'), flatpak: root.includes('/.var/app/') });
  }
  return out;
}
// [Section] key = value pairs, in order, repeated keys kept
function iniSection(text, name) {
  const out = []; let inside = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (/^\[.*\]$/.test(line)) { inside = line.slice(1, -1).trim() === name; continue; }
    if (!inside || !line || /^[;#]/.test(line)) continue;
    const i = line.indexOf('=');
    if (i > 0) out.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
  return out;
}
function pcsx2GameList(cacheDir) {
  const out = [];
  let b; try { b = fs.readFileSync(path.join(cacheDir, 'gamelist.cache')); } catch { return out; }
  if (b.length < 8 || b.readUInt32LE(0) !== 0x45434c47 || b.readUInt32LE(4) !== 34) return out;
  let p = 8;
  const str = () => { const n = b.readUInt32LE(p); p += 4; if (n > 1 << 20 || p + n > b.length) throw new Error('bad'); const v = b.toString('utf8', p, p + n); p += n; return v; };
  try {
    while (p < b.length) {
      const file = str(), serial = str(); str(); str(); str();
      p += 2 + 8 + 8; const crc = b.readUInt32LE(p); p += 4 + 1;
      out.push({ path: file, serial, crc });
    }
  } catch {}
  return out;
}
// serial and CRC for a game file Cartridge knows, by its real path (or, failing that, its name)
function pcsx2Game(dir, file) {
  const list = pcsx2GameList(dir.cache);
  const real = (f) => { try { return fs.realpathSync(f); } catch { return f; } };
  // 0.9.63 (owner: PCSX2's game settings took long to open): the path as written first, then only same-named entries
  // are resolved (every entry of a big game list was looked up on disk, each time)
  const want = real(file), base = path.basename(file), named = list.filter((g) => path.basename(g.path) === base);
  const hit = list.find((g) => g.path === file || g.path === want) || named.find((g) => real(g.path) === want) || named[0];
  return hit && hit.crc ? { serial: hit.serial, crc: hit.crc } : null;
}
// One file from a plain ISO9660 image (a PS3 disc's PS3_GAME/PARAM.SFO), or null
// any image discImage can open: ISO, raw .bin/.cue, CHD, CSO/ZSO, GCZ (0.9.17)
function isoFile(file, parts, max = 1 << 20) {
  const img = require('./discImage').open(file); if (!img) return null;
  const read = img.read;
  try {
    const pvd = read(16 * 2048, 2048);
    if (pvd[0] !== 1 || pvd.toString('latin1', 1, 6) !== 'CD001') return null;
    const rec = (b, o) => ({ lba: b.readUInt32LE(o + 2), size: b.readUInt32LE(o + 10), dir: !!(b[o + 25] & 2), name: b.toString('latin1', o + 33, o + 33 + b[o + 32]) });
    let d = rec(pvd, 156);
    for (const [i, p] of parts.entries()) {
      const b = read(d.lba * 2048, Math.min(d.size, 1 << 20)); let hit = null;
      for (let o = 0; o < b.length && !hit;) { const len = b[o]; if (!len) { o = (Math.floor(o / 2048) + 1) * 2048; continue; } const e = rec(b, o); if (e.name.replace(/;\d+$/, '').toUpperCase() === p.toUpperCase()) hit = e; o += len; }
      if (!hit || (i < parts.length - 1 && !hit.dir)) return null;
      d = hit;
    }
    return d.size <= max ? read(d.lba * 2048, d.size) : null;
  } catch { return null; } finally { img.close(); }
}
// A PS2 ISO's serial and CRC the way PCSX2 works them out itself (0.9.3 L; CDVD.cpp GetPS2ElfName,
// Elfheader.cpp GetCRC): SYSTEM.CNF's BOOT2 names the game's program ("cdrom0:\SLUS_213.86;1"),
// the serial is that name with "." removed and "_" as "-", the CRC is every 32-bit word of the
// program XORed together. Any image discImage opens (CHD and CSO since 0.9.17).
function ps2IsoInfo(file) {
  const img = require('./discImage').open(file); if (!img) return null; // CHD and CSO too (0.9.17)
  const read = img.read;
  try {
    const pvd = read(16 * 2048, 2048);
    if (pvd[0] !== 1 || pvd.toString('latin1', 1, 6) !== 'CD001') return null;
    const rec = (b, o) => ({ lba: b.readUInt32LE(o + 2), size: b.readUInt32LE(o + 10), dir: !!(b[o + 25] & 2), name: b.toString('latin1', o + 33, o + 33 + b[o + 32]) });
    const list = (d) => {
      const b = read(d.lba * 2048, Math.min(d.size, 1 << 20)); const out = [];
      for (let o = 0; o < b.length;) { const len = b[o]; if (!len) { o = (Math.floor(o / 2048) + 1) * 2048; continue; } out.push(rec(b, o)); o += len; }
      return out;
    };
    const find = (parts) => { let d = rec(pvd, 156); for (const [i, p] of parts.entries()) { const hit = list(d).find((e) => e.name.replace(/;\d+$/, '').toUpperCase() === p.toUpperCase()); if (!hit || (i < parts.length - 1 && !hit.dir)) return null; d = hit; } return d; };
    const cnf = find(['SYSTEM.CNF']);
    if (!cnf || cnf.size > 4096) return null;
    const m = /BOOT2\s*=\s*cdrom0?:\\?([^\r\n;]+)/i.exec(read(cnf.lba * 2048, cnf.size).toString('latin1'));
    if (!m) return null;
    const parts = m[1].split(/[\\/]/).filter(Boolean);
    const elf = find(parts);
    if (!elf || elf.size > 64 << 20) return null;
    const data = read(elf.lba * 2048, elf.size);
    let crc = 0;
    for (let i = 0; i + 4 <= data.length; i += 4) crc = (crc ^ data.readUInt32LE(i)) >>> 0;
    const name = parts[parts.length - 1];
    const serial = /^[A-Z]{4}[_-]\d{3}\.\d{2}/i.test(name) ? name.replace(/\./g, '').replace(/_/g, '-').toUpperCase() : '';
    return { serial, crc };
  } catch { return null; } finally { img.close(); }
}
const crcHex = (crc) => (crc >>> 0).toString(16).toUpperCase().padStart(8, '0');
// patches.zip from the PCSX2 that is installed: AppImage (read from inside it), Flatpak, distro package
function pcsx2ZipSources(home = os.homedir(), appImages = []) {
  const files = [];
  for (const base of ['/var/lib/flatpak', path.join(home, '.local/share/flatpak')]) for (const sub of ['files/bin/resources', 'files/share/PCSX2/resources']) files.push(path.join(base, 'app/net.pcsx2.PCSX2/current/active', sub, 'patches.zip'));
  files.push('/usr/share/PCSX2/resources/patches.zip', '/usr/share/pcsx2/resources/patches.zip', '/usr/lib/pcsx2/resources/patches.zip', '/usr/bin/resources/patches.zip', '/opt/pcsx2/resources/patches.zip');
  return { files: files.filter(exists), appImages };
}
function pcsx2ZipBuffer(src, readAppImageFile) {
  for (const f of src.files) { try { return fs.readFileSync(f); } catch {} }
  for (const a of src.appImages) { const b = readAppImageFile && readAppImageFile(a, 'usr/bin/resources/patches.zip'); if (b) return b; }
  return null;
}
function zipEntryText(buf, names) {
  const yauzl = require('yauzl');
  return new Promise((resolve) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err) return resolve(null);
      let done = false;
      zip.on('entry', (e) => {
        if (!names.includes(e.fileName)) return zip.readEntry();
        zip.openReadStream(e, (er, st) => {
          if (er) return resolve(null);
          const parts = []; st.on('data', (c) => parts.push(c)); st.on('end', () => { done = true; zip.close(); resolve(Buffer.concat(parts).toString('utf8')); });
        });
      });
      zip.on('end', () => { if (!done) resolve(null); });
      zip.readEntry();
    });
  });
}
// the patches in a .pnach text: [Name] blocks with their author and description
function pnachList(text) {
  const out = []; let cur = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    if (line.length > 2 && line[0] === '[' && line.endsWith(']')) { cur = { name: line.slice(1, -1), author: '', description: '' }; if (!out.some((x) => x.name === cur.name)) out.push(cur); continue; }
    const i = line.indexOf('=');
    if (!cur || i < 0) continue;
    const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
    if (k === 'author') cur.author = v;
    else if (k === 'description') cur.description = v;
    else if (k === 'comment' && !cur.description) cur.description = v;
  }
  return out;
}
async function pcsx2List(dir, game, zipBuf, mine = {}) {
  const names = [...(game.serial ? [`${game.serial}_${crcHex(game.crc)}.pnach`] : []), `${crcHex(game.crc)}.pnach`];
  const texts = [];
  for (const n of names) { try { texts.push(fs.readFileSync(path.join(dir.patches, n), 'utf8')); } catch {} }
  if (zipBuf) { const t = await zipEntryText(zipBuf, names); if (t) texts.push(t); }
  const enabled = new Set(iniSection(readIni(dir, game), 'Patches').filter(([k]) => k === 'Enable').map(([, v]) => v));
  const seen = new Set(), out = [];
  for (const p of texts.flatMap(pnachList)) {
    if (seen.has(p.name)) continue; // the first one loaded wins, as in PCSX2
    seen.add(p.name);
    const key = ['pcsx2', game.serial, crcHex(game.crc), p.name].join('\u0001');
    const on = enabled.has(p.name);
    out.push({ key, name: p.name, description: p.name, notes: p.description, author: p.author, version: 'All', on, by: on ? (mine[key] ? 'cartridge' : 'emulator') : null });
  }
  return out.sort((a, b) => a.description.localeCompare(b.description));
}
const gameIni = (dir, game) => path.join(dir.gamesettings, `${game.serial ? game.serial.replace(/[\\/:*?"<>|]/g, '_') + '_' : ''}${crcHex(game.crc)}.ini`);
function readIni(dir, game) { try { return fs.readFileSync(gameIni(dir, game), 'utf8'); } catch { return ''; } }
// adds or removes only "Enable = <name>" lines for the patches picked; the rest of the file stays as it is
function pcsx2Set(dir, game, changes, mine = {}) {
  const rec = { ...mine };
  const todo = changes.filter((c) => c.on || rec[c.key]);
  if (!todo.length) return rec;
  const f = gameIni(dir, game);
  let text = readIni(dir, game);
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  let lines = text ? text.split(/\r?\n/) : [];
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  let start = lines.findIndex((l) => l.trim() === '[Patches]');
  for (const c of todo) {
    const isLine = (l) => { const m = /^\s*Enable\s*=\s*(.*?)\s*$/.exec(l); return m && m[1] === c.name; };
    if (c.on) {
      if (start < 0) { if (lines.length) lines.push(''); lines.push('[Patches]'); start = lines.length - 1; }
      let end = start + 1; while (end < lines.length && !/^\s*\[/.test(lines[end])) end++;
      if (!lines.slice(start + 1, end).some(isLine)) { let at = end; while (at > start + 1 && !lines[at - 1].trim()) at--; lines.splice(at, 0, `Enable = ${c.name}`); }
      rec[c.key] = true;
    } else {
      if (start >= 0) { let end = start + 1; while (end < lines.length && !/^\s*\[/.test(lines[end])) end++; for (let i = end - 1; i > start; i--) if (isLine(lines[i])) lines.splice(i, 1); }
      delete rec[c.key];
    }
  }
  fs.mkdirSync(path.dirname(f), { recursive: true });
  if (exists(f) && !exists(f + '.cartridge-backup')) fs.copyFileSync(f, f + '.cartridge-backup');
  fs.writeFileSync(f + '.tmp', lines.join(nl) + nl); fs.renameSync(f + '.tmp', f);
  return rec;
}

// ---------------------------------------------------------------- RPCS3 settings from its database
// RPCS3 keeps per-game settings that work, published at api.rpcs3.net/config/?api=v1 as
// { return_code, games: { <SERIAL>: { config: "<yml>" } } } and cached in GuiConfigs/config_database.dat
// (rpcs3qt/config_database.cpp). "Create Custom Configuration From Database Settings" lays that over
// the global settings as config/custom_configs/config_<SERIAL>.yml (Emu/system_utils.cpp). Cartridge
// writes the same file when a PS3 game arrives (0.9.3 L), only when the game has none yet; mine
// records the ones it wrote, the only ones it may remove.
function rpcs3DbFromText(text, serial) {
  let j; try { j = JSON.parse(text); } catch { return null; }
  const c = j && j.games && j.games[serial] && j.games[serial].config;
  return typeof c === 'string' && c.trim() ? c : null;
}
function rpcs3CustomPath(dir, serial) { return path.join(dir.cfg || rpcs3CfgDir(dir.root), 'custom_configs', `config_${serial}.yml`); }
function rpcs3DbCached(dir) { try { return fs.readFileSync(path.join(dir.root, 'GuiConfigs', 'config_database.dat'), 'utf8'); } catch { return null; } }
// returns 'written', 'exists' (the game has its own settings already) or 'none' (not in the database)
function rpcs3ApplyDb(dir, serial, dbText, mine = {}) {
  if (!/^[A-Z]{4}\d{5}$/.test(serial || '')) return { result: 'none', mine };
  const f = rpcs3CustomPath(dir, serial);
  if (exists(f)) return { result: 'exists', mine };
  const cfg = rpcs3DbFromText(dbText, serial);
  if (!cfg) return { result: 'none', mine };
  load(cfg); // must be valid YAML, as RPCS3 checks before using it
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', cfg.endsWith('\n') ? cfg : cfg + '\n'); fs.renameSync(f + '.tmp', f);
  return { result: 'written', mine: { ...mine, [serial]: { at: Date.now(), file: f } } };
}

// RPCS3's own config.yml checked (0.9.63, owner: "Failed to load global config ... illegal map value" at line 277).
// Older EmuDeck scripts set the resolution with a line edit that could join two lines: "Write Depth Buffer:
// falseResolution Scale: = 150". Today's EmuDeck removes that text with sed 's|Resolution Scale: = [0-9]*$||'; the
// Repair does the same, and only that. -> null (reads fine) or { file, line, text, known }
function rpcs3ConfigCheck(dir) {
  const f = path.join(dir.cfg || rpcs3CfgDir(dir.root), 'config.yml');
  let text; try { text = fs.readFileSync(f, 'utf8'); } catch { return null; }
  try { yaml.load(text, { schema: yaml.FAILSAFE_SCHEMA }); return null; } catch (e) {
    const lines = text.split('\n'), bad = lines.findIndex((l) => /Resolution Scale: = \d*\s*$/.test(l));
    const at = bad >= 0 ? bad : Math.max(0, (e.mark?.line ?? 0));
    return { file: f, line: at + 1, text: (lines[at] || '').trim().slice(0, 120), known: bad >= 0 };
  }
}
// the known damage only: a backup first, the text EmuDeck itself removes, then the file must read cleanly, else the
// backup goes back and nothing changed. -> { ok, backup } or throws with why
function rpcs3ConfigRepair(dir) {
  const c = rpcs3ConfigCheck(dir);
  if (!c) return { ok: true, already: true };
  if (!c.known) throw new Error(`RPCS3's settings file has a problem Cartridge doesn't know how to repair safely (line ${c.line}: ${c.text}). Open it in a text editor, or let RPCS3 make a new one by renaming it.`);
  const before = fs.readFileSync(c.file, 'utf8');
  const backup = c.file + '.cartridge-backup-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  fs.copyFileSync(c.file, backup);
  const after = before.split('\n').map((l) => l.replace(/Resolution Scale: = [0-9]*\s*$/, '')).join('\n');
  try { yaml.load(after, { schema: yaml.FAILSAFE_SCHEMA }); } catch (e) { throw new Error(`The repair didn't make the file readable (${String(e.reason || e.message).slice(0, 80)}), so nothing was changed.`); }
  fs.writeFileSync(c.file + '.tmp', after); fs.renameSync(c.file + '.tmp', c.file);
  if (rpcs3ConfigCheck(dir)) { fs.copyFileSync(backup, c.file); throw new Error('The repaired file still didn’t read cleanly, so the original was put back.'); }
  return { ok: true, backup };
}
module.exports = { rpcs3ConfigCheck, rpcs3ConfigRepair, rpcs3CfgDir, rpcs3Relocate, loosePatchYaml, readPatchFile, rpcs3DownloadPatches, isoFile, rpcs3DbFromText, rpcs3CustomPath, rpcs3DbCached, rpcs3ApplyDb, parseSfo, sfoAt, rpcs3Dirs, ps3Version, rpcs3List, rpcs3Set, shadDirs, ps4Version, shadList, shadSet, shadDownloadPatches, SHAD_REPOS, load, dump, pcsx2Dirs, pcsx2GameList, pcsx2Game, ps2IsoInfo, pcsx2ZipSources, pcsx2ZipBuffer, pnachList, pcsx2List, pcsx2Set, crcHex };
