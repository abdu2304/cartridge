// Syncthing, first look (0.9.19, owner: preliminary work; the full feature is planned for 1.0). Read only:
// Cartridge finds the user's own Syncthing (program, Flatpak or its config alone), reads its config.xml
// for the GUI address and API key, and asks its REST API (rest/system/status, rest/config/folders,
// rest/db/completion, rest/system/connections) which folders it syncs, with whom, and how far along.
// It changes nothing in Syncthing and touches no saves. Which synced folders hold emulator saves is
// a guess from their paths, shown as such.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const HOME = os.homedir();
const XDG_STATE = process.env.XDG_STATE_HOME || path.join(HOME, '.local/state');
const XDG_CONFIG = process.env.XDG_CONFIG_HOME || path.join(HOME, '.config');
// where each kind of install keeps config.xml (Syncthing 1.27+ moved it to the state folder)
const FLATPAKS = ['com.github.zocker_160.SyncThingy', 'me.kozec.syncthingtk', 'io.github.martchus.syncthingtray'];
function configFiles(home = HOME) {
  const out = [path.join(XDG_STATE, 'syncthing/config.xml'), path.join(XDG_CONFIG, 'syncthing/config.xml'), path.join(home, '.local/state/syncthing/config.xml'), path.join(home, '.config/syncthing/config.xml')];
  for (const id of FLATPAKS) out.push(path.join(home, '.var/app', id, 'config/syncthing/config.xml'), path.join(home, '.var/app', id, 'data/syncthing/config.xml'), path.join(home, '.var/app', id, '.local/state/syncthing/config.xml'));
  return [...new Set(out)];
}
const attr = (tag, name) => { const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag); return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : ''; };
const inner = (xml, tag) => { const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml); return m ? m[1] : ''; };
// config.xml -> { gui: { address, apikey, tls }, folders: [{ id, label, path }], devices: [{ id, name }] }
function parseConfig(xml) {
  const gui = (/<gui\b[^>]*>[\s\S]*?<\/gui>/.exec(xml) || [''])[0];
  const out = { gui: { address: inner(gui, 'address') || '127.0.0.1:8384', apikey: inner(gui, 'apikey'), tls: /tls="true"/.test(gui.split('>')[0]) }, folders: [], devices: [] };
  for (const m of xml.matchAll(/<folder\b[^>]*>/g)) out.folders.push({ id: attr(m[0], 'id'), label: attr(m[0], 'label'), path: attr(m[0], 'path').replace(/^~(?=\/)/, HOME) });
  for (const m of xml.matchAll(/<device\b[^>]*>/g)) { const id = attr(m[0], 'id'); if (id && !out.devices.some((d) => d.id === id)) out.devices.push({ id, name: attr(m[0], 'name') }); }
  return out;
}
const onPath = (bin) => { try { execFileSync('sh', ['-c', `command -v ${bin}`], { stdio: 'ignore' }); return true; } catch { return false; } };
const flatpakApps = () => require('./detect').flatpakApps() || (() => { try { return execFileSync('flatpak', ['list', '--app', '--columns=application'], { encoding: 'utf8', timeout: 8000 }).split('\n').map((s) => s.trim()).filter(Boolean); } catch { return []; } })(); // folders first: `flatpak list` froze the app
// which emulator a synced folder's path points at, by the folder names emulators keep saves in
const SAVE_HINTS = [[/retroarch/i, 'RetroArch'], [/pcsx2/i, 'PCSX2'], [/duckstation/i, 'DuckStation'], [/rpcs3/i, 'RPCS3'], [/dolphin/i, 'Dolphin'], [/ppsspp|\/PSP\b/i, 'PPSSPP'], [/vita3k/i, 'Vita3K'], [/shadps4/i, 'shadPS4'], [/cemu/i, 'Cemu'], [/(eden|yuzu|citron|sudachi|ryujinx)/i, 'Switch'], [/(azahar|citra|lime3ds)/i, 'Azahar'], [/melonds/i, 'melonDS'], [/xemu/i, 'xemu'], [/xenia/i, 'Xenia'], [/emulation\/saves|\/saves?\b/i, 'Saves']];
const saveHint = (p) => (SAVE_HINTS.find(([re]) => re.test(p)) || [])[1] || null;

function find(home = HOME) {
  const file = configFiles(home).find((f) => fs.existsSync(f));
  const fps = flatpakApps().filter((id) => FLATPAKS.includes(id));
  return { installed: !!(file || fps.length || onPath('syncthing')), flatpak: fps[0] || null, program: onPath('syncthing'), config: file || null };
}
// 0.9.24 (owner: "Syncthing refused the key in its settings file"): more than one settings file can be on a
// device (an old ~/.config one beside the ~/.local/state one Syncthing 1.27+ uses, a Flatpak's), and the first
// found wasn't always the running one. Each file's address and key, and a key you pasted, are tried until
// Syncthing accepts one; that one is used from then on.
let pasted = '', picked = null;
const setLocalKey = (k) => { k = String(k || '').trim(); if (k !== pasted) { pasted = k; picked = null; } };
async function pick(home = HOME, fetchImpl = fetch) {
  if (picked && fs.existsSync(picked.file)) return picked;
  const tries = [];
  for (const file of configFiles(home).filter((f) => fs.existsSync(f))) {
    let cfg; try { cfg = parseConfig(fs.readFileSync(file, 'utf8')); } catch { continue; }
    const base = `${cfg.gui.tls ? 'https' : 'http'}://${cfg.gui.address.replace(/^0\.0\.0\.0/, '127.0.0.1')}`;
    for (const key of [cfg.gui.apikey, pasted].filter(Boolean)) tries.push({ file, cfg, base, key });
  }
  let refused = false;
  for (const t of tries) {
    try { const r = await fetchImpl(t.base + '/rest/system/ping', { headers: { 'X-API-Key': t.key }, signal: AbortSignal.timeout(2500) }); if (r.ok) return (picked = t); if (r.status === 401 || r.status === 403) refused = true; } catch {}
  }
  return tries[0] ? { ...tries[0], refused } : null;
}
// what Cartridge can say about it now; never throws (the page shows what's missing instead)
async function status({ fetchImpl = fetch, home = HOME } = {}) {
  const f = find(home);
  if (!f.config) return { ...f, running: false, why: f.installed ? 'Syncthing is installed but hasn’t been started yet (its settings file isn’t there).' : 'Syncthing isn’t installed.' };
  const pk = await pick(home, fetchImpl);
  if (!pk) return { ...f, running: false, why: 'Syncthing’s settings couldn’t be read.' };
  const cfg = pk.cfg, base = pk.base;
  f.config = pk.file;
  const H = { 'X-API-Key': pk.key };
  const get = async (p) => { const r = await fetchImpl(base + p, { headers: H, signal: AbortSignal.timeout(4000) }); if (!r.ok) throw new Error(`Syncthing answered ${r.status}`); return r.json(); };
  const folders = cfg.folders.map((x) => ({ ...x, saves: saveHint(x.path) }));
  try {
    const sys = await get('/rest/system/status');
    const conns = await get('/rest/system/connections').catch(() => ({ connections: {} }));
    for (const x of folders) { try { const c = await get(`/rest/db/completion?folder=${encodeURIComponent(x.id)}`); x.done = Math.round(c.completion ?? 100); } catch {} }
    const me = sys.myID || '';
    const seen = await get('/rest/stats/device').catch(() => ({}));
    const devices = cfg.devices.filter((d) => d.id !== me).map((d) => ({ name: d.name || d.id.slice(0, 7), online: !!conns.connections?.[d.id]?.connected, seen: Date.parse(seen?.[d.id]?.lastSeen) || 0 }));
    folders.sort((a, b) => !!b.saves - !!a.saves); // saves first: that's what the Sync tab is for
    return { ...f, running: true, address: base, me: me.slice(0, 7), uptime: sys.uptime || 0, folders, devices };
  } catch (e) {
    return { ...f, running: false, folders, devices: cfg.devices.map((d) => ({ name: d.name || d.id.slice(0, 7), online: false })), why: /401|403/.test(e.message) ? 'Syncthing refused the key in its settings files. Paste its API key (Syncthing → Actions → Settings → General) to use it.' : 'Syncthing isn’t running right now.', needsKey: /401|403/.test(e.message) };
  }
}
// what's inside one synced folder, newest first (0.9.21, owner: a Sync tab that shows saves, view only).
// Syncthing's own index (rest/db/browse) is read, never the files; nothing is opened, copied or changed.
function flatten(tree, base = '', out = []) {
  // a folder at the depth asked for comes back empty: kept as an entry, its name still names the game (0.9.28)
  if (Array.isArray(tree)) { for (const e of tree) { const p = base ? base + '/' + e.name : e.name; if (e.type === 'FILE_INFO_TYPE_DIRECTORY' || e.children) { if (e.children?.length) flatten(e.children, p, out); else out.push({ path: p + '/', size: 0, at: Date.parse(e.modTime) || 0, dir: true }); } else out.push({ path: p, size: e.size || 0, at: Date.parse(e.modTime) || 0 }); } return out; }
  for (const [name, v] of Object.entries(tree || {})) { const p = base ? base + '/' + name : name; if (Array.isArray(v)) out.push({ path: p, at: Date.parse(v[0]) || 0, size: v[1] || 0 }); else if (v && Object.keys(v).length) flatten(v, p, out); else out.push({ path: p + '/', size: 0, at: 0, dir: true }); }
  return out;
}
async function browse(folder, { fetchImpl = fetch, home = HOME, limit = 40, server: srv = null } = {}) {
  // 0.9.29: the main server's folders too (owner: open PSP textures on the main server like on this device)
  let a;
  if (srv) a = api(srv.address, srv.apikey, fetchImpl, 8000);
  else { const l = await localApi(home, fetchImpl); a = api(l.base, l.key, fetchImpl, 8000); }
  const conf = await a.get(`/rest/config/folders/${encodeURIComponent(folder)}`).catch(() => ({}));
  const fpath = String(conf.path || ''), label = conf.label || folder;
  const files = flatten(await a.get(`/rest/db/browse?folder=${encodeURIComponent(folder)}&levels=6`)).filter((x) => !/(^|\/)\.st(folder|ignore|versions)/.test(x.path));
  let last = null; try { const st = await a.get('/rest/stats/folder'); last = st?.[folder]?.lastFile || null; } catch {}
  files.sort((x, y) => y.at - x.at);
  // textures or saves, from the folder's path and name as well as the file's (a "GameCube Textures" folder is textures)
  for (const f of files) f.kind = KIND_LABEL[kindOf(fpath + '/' + label + '/' + f.path)];
  const texFolder = !!textureHint(fpath + '/' + label);
  return { id: folder, label, path: fpath, textures: texFolder, total: files.length, size: files.reduce((n, x) => n + x.size, 0), files: files.slice(0, limit), last: last?.filename ? { path: last.filename, at: Date.parse(last.at) || 0, deleted: !!last.deleted } : null };
}

// ---- 0.9.23 (owner: a proper Syncthing integration, a main server, which games have saves and textures synced)
// Still read only for files: Cartridge asks Syncthing's REST API and never opens, copies or changes a synced
// file. The one thing it asks Syncthing to do is rescan a folder (POST rest/db/scan), as Syncthing's own button does.
async function localApi(home = HOME, fetchImpl = fetch) {
  const pk = await pick(home, fetchImpl);
  if (!pk) throw new Error('Syncthing isn’t set up on this device.');
  return { cfg: pk.cfg, base: pk.base, key: pk.key };
}
function api(base, key, fetchImpl = fetch, ms = 6000) {
  base = String(base || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) base = 'http://' + base;
  const call = async (p, opts = {}) => {
    let r;
    try { r = await fetchImpl(base + p, { ...opts, headers: { 'X-API-Key': key, ...(opts.headers || {}) }, signal: AbortSignal.timeout(ms) }); }
    catch (e) { throw new Error(/cert|self.signed|SSL|TLS/i.test(String(e.cause?.code || e.cause?.message || e.message)) ? 'Its HTTPS certificate isn’t trusted. Use its http:// address on your network instead.' : 'It didn’t answer at that address.'); }
    if (r.status === 401 || r.status === 403) throw new Error('It refused the API key.');
    if (!r.ok) throw new Error(`Syncthing answered ${r.status}.`);
    return (r.headers.get('content-type') || '').includes('json') ? r.json() : r.text();
  };
  const send = (method) => (p, body) => call(p, body ? { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : { method });
  return { base, get: (p) => call(p), post: send('POST'), put: send('PUT'), patch: send('PATCH') };
}
// everything about one Syncthing (this device's, or the main server): who it is, its devices, its folders
async function overview(a) {
  const [sys, ver, conf, conns, seen] = await Promise.all([a.get('/rest/system/status'), a.get('/rest/system/version').catch(() => ({})), a.get('/rest/config'), a.get('/rest/system/connections').catch(() => ({ connections: {} })), a.get('/rest/stats/device').catch(() => ({}))]);
  const me = sys.myID || '';
  const devices = (conf.devices || []).filter((d) => d.deviceID !== me).map((d) => {
    const c = conns.connections?.[d.deviceID] || {};
    return { id: d.deviceID, name: d.name || d.deviceID.slice(0, 7), online: !!c.connected, address: c.connected ? c.address || '' : '', client: c.clientVersion || '', seen: Date.parse(seen?.[d.deviceID]?.lastSeen) || 0, paused: !!(d.paused || c.paused) };
  });
  const folders = await Promise.all((conf.folders || []).map(async (x) => {
    const out = { id: x.id, label: x.label || x.id, path: String(x.path || '').replace(/^~(?=\/)/, HOME), paused: !!x.paused, type: x.type, devices: (x.devices || []).map((d) => d.deviceID).filter((id) => id !== me).length };
    out.saves = saveHint(out.path); out.textures = textureHint(out.path);
    try { const c = await a.get(`/rest/db/completion?folder=${encodeURIComponent(x.id)}`); out.done = Math.round(c.completion ?? 100); } catch {}
    return out;
  }));
  folders.sort((x, y) => (!!y.saves - !!x.saves) || (!!y.textures - !!x.textures));
  return { address: a.base, me, short: me.slice(0, 7), version: ver.version || '', os: [ver.os, ver.arch].filter(Boolean).join(' '), uptime: sys.uptime || 0, devices, folders, name: (conf.devices || []).find((d) => d.deviceID === me)?.name || '' };
}
const TEX_HINT = /textures?|graphicmods|hires|load\/|texture.?pack/i;
const textureHint = (p) => (TEX_HINT.test(p) ? 'Textures' : null);
// what a synced file is, from its folder and name (0.9.32, owner: tabs for saves, textures, patches, updates):
// textures, patches (cheats, Gecko, .pnach, IPS), game updates and DLC, mods, else a save
const KINDS = [['textures', TEX_HINT], ['patches', /patch(es)?\b|cheats?\b|gecko|\.pnach$|\.(ips|bps|ups)$|patch\.yml/i], ['updates', /\bupdates?\b|\bdlc\b|\[v\d{5,}\]|\[upd\]|\.pkg$/i], ['mods', /\bmods?\b|graphicpacks|\/contents\/[0-9a-f]{16}\b|atmosphere\//i]];
const kindOf = (p) => (KINDS.find(([, re]) => re.test(p)) || ['saves'])[0];
const KIND_LABEL = { saves: 'Save', textures: 'Textures', patches: 'Patch', updates: 'Update', mods: 'Mod' };
async function local({ fetchImpl = fetch, home = HOME } = {}) {
  const l = await localApi(home, fetchImpl);
  return overview(api(l.base, l.key, fetchImpl));
}
async function server({ address, apikey }, { fetchImpl = fetch } = {}) {
  if (!address || !apikey) throw new Error('Add the main server’s address and API key first.');
  return overview(api(address, apikey, fetchImpl, 8000));
}
async function rescan(folder, { fetchImpl = fetch, home = HOME } = {}) {
  const l = await localApi(home, fetchImpl);
  await api(l.base, l.key, fetchImpl).post(`/rest/db/scan?folder=${encodeURIComponent(folder)}`);
  return true;
}
// 0.9.24 (owner: Syncthing in the welcome, pick the folder it syncs). Folders to offer: the emulation saves
// folder when there is one (EmuDeck, ES-DE layout), and Syncthing's own default, ~/Sync.
function suggest(home = HOME, extra = []) {
  const out = [];
  for (const d of [...extra, path.join(home, 'Emulation', 'saves')]) if (d && fs.existsSync(d) && !out.some((o) => o.path === d)) out.push({ path: d, label: 'Emulation saves', sub: 'Your emulators\u2019 saves, in your Emulation folder' });
  out.push({ path: path.join(home, 'Sync'), label: 'Sync', sub: 'Syncthing\u2019s own default folder' });
  return out;
}
// Shares one folder in this device's Syncthing (the only config change Cartridge makes, and only when asked).
// A folder already shared at that path is left as it is.
async function addFolder({ dir, label }, { fetchImpl = fetch, home = HOME } = {}) {
  const l = await localApi(home, fetchImpl);
  const a = api(l.base, l.key, fetchImpl);
  const have = await a.get('/rest/config/folders');
  const same = (have || []).find((f) => path.resolve(String(f.path || '').replace(/^~(?=\/)/, home)) === path.resolve(dir));
  if (same) return { id: same.id, existed: true };
  fs.mkdirSync(dir, { recursive: true });
  const id = 'cartridge-' + Math.random().toString(36).slice(2, 7);
  await a.post('/rest/config/folders', { id, label: label || path.basename(dir), path: dir, type: 'sendreceive' });
  return { id, existed: false };
}
// Which games have saves or textures synced (smart search). Every synced folder's index is read from
// Syncthing (rest/db/browse), and each file path is matched to games by serial or title ID (PS1/PS2/PSP,
// PS3, PS4, Vita, Switch, GameCube/Wii) or by name: the whole name, or one of 8+ letters inside a folder or file
// name, so "Sonic" isn't taken for "Sonic Heroes".
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
const SERIAL_RE = /\b([A-Z]{4})[-_. ]?(\d{3})\.?(\d{2})\b|\b(CUSA|PPSA|PCS[A-Z])[-_]?(\d{5})\b|\b(0100[0-9A-F]{12}|0004[0-9A-F]{12})\b/gi; // 0.9.28: 3DS title IDs (0004…) too
function serialsIn(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(SERIAL_RE)) out.add(m[6] ? m[6].toUpperCase() : m[4] ? (m[4] + m[5]).toUpperCase() : (m[1] + m[2] + m[3]).toUpperCase());
  return out;
}
// games: [{ id, name, ids: [serial or title id...] }] -> { [id]: { saves: [{ folder, files, at }], textures: [...] } }
function matchGames(games, folders) {
  const byId = new Map(), byName = [], byExact = new Map();
  for (const g of games) {
    for (const s of g.ids || []) if (s) byId.set(String(s).toUpperCase().replace(/[-_.]/g, ''), g.id);
    for (const s of g.discIds || []) { byExact.set(s.toUpperCase(), g.id); if (s.length === 6) byExact.set(s.slice(0, 3).toUpperCase(), g.id); }
    const k = norm(g.name.replace(/\s*[([].*$/, ''));
    if (k.length >= 5) byName.push([k, g.id]);
  }
  byName.sort((a, b) => b[0].length - a[0].length); // the longer name wins ("Sonic 2" over "Sonic")
  const out = {};
  const add = (gid, kind, folder, f) => {
    const g = (out[gid] ||= { saves: [], textures: [], patches: [], updates: [], mods: [] });
    let e = g[kind].find((x) => x.folder === folder.id);
    if (!e) g[kind].push((e = { folder: folder.id, label: folder.label, files: 0, size: 0, at: 0 }));
    e.files++; e.size += f.size || 0; if (f.at > e.at) e.at = f.at;
  };
  for (const folder of folders) for (const f of folder.files || []) {
    const kind = kindOf(folder.path + '/' + f.path);
    let gid = null;
    for (const s of serialsIn(f.path)) { if (byId.has(s)) { gid = byId.get(s); break; } }
    // a folder named exactly after a game's ID (Dolphin's GALE01 or GAL texture folders, 0.9.28)
    if (gid == null) for (const seg of f.path.split('/')) { const u = seg.toUpperCase(); if (byExact.has(u)) { gid = byExact.get(u); break; } }
    if (gid == null) { const parts = f.path.split('/').map((p) => norm(p.replace(/\.[^.]+$/, ''))); for (const [k, id] of byName) { if (parts.some((p) => p === k || (k.length >= 8 && p.includes(k)))) { gid = id; break; } } }
    if (gid != null) add(gid, kind, folder, f);
  }
  return out;
}
// 0.9.28 (owner: only a few games showed from the main server): this device's folders and the main server's
// (when one is set), each read up to its own limit (one huge texture folder used to use up a shared limit and
// hide every folder after it); texture folders only as deep as their game folders, saves deeper.
async function gamesSynced(games, { fetchImpl = fetch, home = HOME, cap = 40000, server: srv = null } = {}) {
  const sources = [];
  try { const l = await localApi(home, fetchImpl); sources.push(api(l.base, l.key, fetchImpl, 20000)); } catch (e) { if (!srv) throw e; }
  if (srv?.address && srv?.apikey) sources.push(api(srv.address, srv.apikey, fetchImpl, 20000));
  const folders = [], seen = new Set();
  let n = 0;
  for (const a of sources) {
    let conf = []; try { conf = await a.get('/rest/config/folders'); } catch { continue; }
    for (const x of conf) {
      if (seen.has(x.id)) continue; // the same folder shared on both: read once
      seen.add(x.id);
      const tex = !!textureHint(String(x.path || '') + '/' + (x.label || ''));
      let files = []; try { files = flatten(await a.get(`/rest/db/browse?folder=${encodeURIComponent(x.id)}&levels=${tex ? 4 : 14}`)).filter((f) => !/(^|\/)\.st(folder|ignore|versions)/.test(f.path)); } catch {}
      n += files.length;
      folders.push({ id: x.id, label: x.label || x.id, path: String(x.path || ''), files: files.slice(0, cap) });
    }
  }
  return { games: matchGames(games, folders), folders: folders.length, files: n };
}
// ---- Cartridge's save sync (0.9.29, The Syncthing Update). Only on a Syncthing nobody has set up yet (no other
// devices, no folders but its empty default), or one Cartridge set up: an existing setup is never changed.
// Main device: one folder per console's saves at the emulator's real save folder (saves.syncRoots), ID
// cartridge-saves-<console>, kept in step both ways, with staggered versioning (30 days) so a replaced save
// can always be restored. Other devices pair with it (it introduces them to each other) and take the folders
// at their own emulators' paths, receive only until the user says two-way. Docs: rest/config, cluster-pending-*,
// folder-versions-*, users/versioning, users/introducer, users/foldertypes.
const PREFIX = 'cartridge-saves-';
const DEVICE_RE = /^[A-Z2-7]{7}(-[A-Z2-7]{7}){7}$/;
async function localA(fetchImpl = fetch, home = HOME) { const l = await localApi(home, fetchImpl); return api(l.base, l.key, fetchImpl, 10000); }
function isBlank(conf, me) {
  const devs = (conf.devices || []).filter((d) => d.deviceID !== me);
  const folders = (conf.folders || []).filter((f) => !String(f.id).startsWith(PREFIX));
  return !devs.length && folders.every((f) => f.id === 'default');
}
async function saveSync({ fetchImpl = fetch, home = HOME } = {}) {
  const a = await localA(fetchImpl, home);
  const [sys, conf] = await Promise.all([a.get('/rest/system/status'), a.get('/rest/config')]);
  const me = sys.myID || '';
  const pd = await a.get('/rest/cluster/pending/devices').catch(() => ({}));
  const pf = await a.get('/rest/cluster/pending/folders').catch(() => ({}));
  const names = new Map((conf.devices || []).map((d) => [d.deviceID, d.name || d.deviceID.slice(0, 7)]));
  const ours = (conf.folders || []).filter((f) => String(f.id).startsWith(PREFIX));
  const done = {}; for (const f of ours) { try { done[f.id] = Math.round((await a.get(`/rest/db/completion?folder=${encodeURIComponent(f.id)}`)).completion ?? 100); } catch {} }
  return {
    me, name: names.get(me) || '', blank: isBlank(conf, me),
    devices: (conf.devices || []).filter((d) => d.deviceID !== me).map((d) => ({ id: d.deviceID, name: d.name || d.deviceID.slice(0, 7), introducer: !!d.introducer })),
    folders: ours.map((f) => ({ id: f.id, label: f.label, path: f.path, type: f.type, paused: !!f.paused, devices: (f.devices || []).map((d) => d.deviceID).filter((d) => d !== me).map((d) => names.get(d) || d.slice(0, 7)), done: done[f.id] })),
    pendingDevices: Object.entries(pd || {}).map(([id, v]) => ({ id, name: v.name || id.slice(0, 7), address: v.address || '', time: v.time })),
    pendingFolders: Object.entries(pf || {}).filter(([id]) => id.startsWith(PREFIX)).map(([id, v]) => ({ id, label: Object.values(v.offeredBy || {})[0]?.label || id, from: Object.keys(v.offeredBy || {}) })),
  };
}
const folderBody = async (a, { id, label, path: p, type, devices }) => {
  const def = await a.get('/rest/config/defaults/folder').catch(() => ({}));
  return { ...def, id, label, path: p, type, devices, fsWatcherEnabled: true, rescanIntervalS: 3600, maxConflicts: 10, versioning: { ...(def.versioning || {}), type: 'staggered', params: { maxAge: String(30 * 86400), cleanInterval: '3600' }, cleanupIntervalS: 3600 } };
};
// roots: saves.syncRoots(); only allowed on a blank Syncthing or one already made main by Cartridge (mine)
async function makeMain(roots, { mine = false, fetchImpl = fetch, home = HOME } = {}) {
  const a = await localA(fetchImpl, home);
  const [sys, conf] = await Promise.all([a.get('/rest/system/status'), a.get('/rest/config')]);
  const me = sys.myID;
  if (!mine && !isBlank(conf, me)) throw new Error('This Syncthing is already set up with other devices or folders, so Cartridge leaves it as it is.');
  const others = (conf.devices || []).filter((d) => d.deviceID !== me).map((d) => ({ deviceID: d.deviceID }));
  const made = [];
  for (const r of roots) {
    if ((conf.folders || []).some((f) => f.id === r.id)) continue;
    try { fs.mkdirSync(r.path, { recursive: true }); } catch {}
    await a.post('/rest/config/folders', await folderBody(a, { id: r.id, label: r.label, path: r.path, type: 'sendreceive', devices: [{ deviceID: me }, ...others] }));
    made.push(r.id);
  }
  return { me, made };
}
// add a device: on the main device it gets every Cartridge folder; joining, the main device is the introducer
async function addDevice({ id, name, introducer = false }, { fetchImpl = fetch, home = HOME } = {}) {
  id = String(id || '').trim().toUpperCase();
  if (!DEVICE_RE.test(id)) throw new Error('That isn’t a Syncthing device ID (eight groups of seven letters and digits).');
  const a = await localA(fetchImpl, home);
  const conf = await a.get('/rest/config');
  if (!(conf.devices || []).some((d) => d.deviceID === id)) {
    const def = await a.get('/rest/config/defaults/device').catch(() => ({}));
    await a.post('/rest/config/devices', { ...def, deviceID: id, name: name || id.slice(0, 7), introducer: !!introducer, autoAcceptFolders: false });
  }
  for (const f of (conf.folders || []).filter((x) => String(x.id).startsWith(PREFIX))) {
    if ((f.devices || []).some((d) => d.deviceID === id)) continue;
    await a.put(`/rest/config/folders/${encodeURIComponent(f.id)}`, { ...f, devices: [...(f.devices || []), { deviceID: id }] });
  }
  return true;
}
// a joining device takes the main device's folders at its own emulators' save folders, receive only at first
async function acceptFolders(roots, { fetchImpl = fetch, home = HOME } = {}) {
  const a = await localA(fetchImpl, home);
  const [sys, pf] = await Promise.all([a.get('/rest/system/status'), a.get('/rest/cluster/pending/folders').catch(() => ({}))]);
  const out = { added: [], missing: [] };
  for (const [id, v] of Object.entries(pf || {})) {
    if (!id.startsWith(PREFIX)) continue;
    const r = roots.find((x) => x.id === id);
    if (!r) { out.missing.push(id); continue; }
    try { fs.mkdirSync(r.path, { recursive: true }); } catch {}
    const from = Object.keys(v.offeredBy || {}).map((d) => ({ deviceID: d }));
    await a.post('/rest/config/folders', await folderBody(a, { id, label: r.label, path: r.path, type: 'receiveonly', devices: [{ deviceID: sys.myID }, ...from] }));
    out.added.push(id);
  }
  return out;
}
async function setType(id, type, { fetchImpl = fetch, home = HOME } = {}) {
  if (!String(id).startsWith(PREFIX)) throw new Error('Cartridge only changes its own save folders.');
  const a = await localA(fetchImpl, home);
  await a.patch(`/rest/config/folders/${encodeURIComponent(id)}`, { type });
  return true;
}
const versions = async (id, { fetchImpl = fetch, home = HOME } = {}) => (await localA(fetchImpl, home)).get(`/rest/folder/versions?folder=${encodeURIComponent(id)}`);
async function restore(id, files, { fetchImpl = fetch, home = HOME } = {}) {
  if (!String(id).startsWith(PREFIX)) throw new Error('Cartridge only restores in its own save folders.');
  return (await localA(fetchImpl, home)).post(`/rest/folder/versions?folder=${encodeURIComponent(id)}`, files);
}

module.exports = { saveSync, makeMain, addDevice, acceptFolders, setType, versions, restore, isBlank, PREFIX, DEVICE_RE, suggest, addFolder, FLATPAKS, setLocalKey, pick, find, status, browse, flatten, parseConfig, configFiles, saveHint, textureHint, kindOf, KIND_LABEL, local, server, rescan, gamesSynced, matchGames, serialsIn, norm };
