const { app, BrowserWindow, ipcMain, protocol, powerSaveBlocker, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const PLATFORM_MAP = require('./platformMap');

// AppImages cannot ship a SUID chrome-sandbox, so run without it.
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('enable-features', 'OverlayScrollbar');
app.setName('Cartridge');

protocol.registerSchemesAsPrivileged([
  { scheme: 'romimg', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const USER_DATA = app.getPath('userData');
const CONFIG_FILE = path.join(USER_DATA, 'config.json');
const MANIFEST_FILE = path.join(USER_DATA, 'installed.json');
const IMG_CACHE = path.join(USER_DATA, 'imgcache');

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
  ui: { gridSize: 'md', hideEmpty: true, sounds: true, bgStyle: 'waves' },
  sync: { onLaunch: true, everyMinutes: 60 },
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
let config = loadJson(CONFIG_FILE, {});
config = deepMerge(DEFAULT_CONFIG, config);
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

function detectRoots() {
  const out = [];
  const add = (p, source) => {
    if (!p) return;
    const norm = path.resolve(p);
    if (!out.find((o) => o.path === norm)) out.push({ path: norm, source, exists: isDir(norm) });
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
  return { roots: out, bios };
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

// ---------------------------------------------------------------- installed detection
function candidatesFor(rom) {
  const names = [rom.fs_name, `${rom.fs_name}.m3u`];
  const files = rom.files || [];
  if (files.length === 1) names.push(files[0].file_name);
  return names.filter(Boolean);
}

function installedState(roms, platform) {
  const dir = platformPath(platform).path;
  let entries = new Set();
  if (dir) { try { entries = new Set(fs.readdirSync(dir)); } catch {} }
  const out = {};
  for (const rom of roms) {
    const m = manifest[rom.id];
    if (m && fs.existsSync(m.path)) { out[rom.id] = m.path; continue; }
    const hit = candidatesFor(rom).find((n) => entries.has(n));
    if (hit) out[rom.id] = path.join(dir, hit);
  }
  return out;
}

// ---------------------------------------------------------------- library cache + sync
// The whole library is mirrored locally (Argosy-style): instant startup, offline browsing,
// and a "Resync" that pulls whatever changed on the server.
let library = loadJson(LIBRARY_FILE, null); // { platforms, roms: {pid: [...]}, firstSeen: {id: ts}, syncedAt, base }
let syncing = null;
let installedMap = {};

function slimRom(r) {
  const md = r.metadatum || {};
  return {
    id: r.id, name: r.name || r.fs_name_no_ext, fs_name: r.fs_name, fs_name_no_ext: r.fs_name_no_ext,
    platform_id: r.platform_id, platform_slug: r.platform_slug, platform_fs_slug: r.platform_fs_slug,
    platform_display_name: r.platform_display_name, fs_size_bytes: r.fs_size_bytes,
    path_cover_small: r.path_cover_small, path_cover_large: r.path_cover_large, url_cover: r.url_cover,
    shot: (r.merged_screenshots || [])[0] || null,
    summary: (r.summary || '').slice(0, 400),
    regions: r.regions || [], files: (r.files || []).map((f) => ({ file_name: f.file_name })),
    year: md.first_release_date || null, genres: (md.genres || []).slice(0, 3),
    developer: (md.developers?.[0] || md.companies?.[0] || ''), rating: md.average_rating || null,
    created_at: r.created_at, has_file_on_disk: r.has_file_on_disk !== false,
  };
}

function publicLibrary() {
  if (!library) return null;
  return {
    platforms: library.platforms.map((p) => ({ ...p, target: platformPath(p) })),
    roms: library.roms,
    firstSeen: library.firstSeen,
    syncedAt: library.syncedAt,
    lastNew: library.lastNew || [],
    collections: library.collections || [],
  };
}

function computeInstalled() {
  const out = {};
  if (!library) return out;
  for (const p of library.platforms) Object.assign(out, installedState(library.roms[p.id] || [], p));
  installedMap = out;
  broadcast('installed', out);
  return out;
}

async function syncLibrary() {
  if (syncing) return syncing;
  syncing = (async () => {
    const started = Date.now();
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
      for (const [kind, ep] of [['user', '/api/collections'], ['smart', '/api/collections/smart']]) {
        try {
          for (const c of await api(ep)) {
            const ids = [...(c.rom_ids || [])];
            if (!ids.length) continue;
            collections.push({ id: `${kind}-${c.id}`, name: c.name, description: c.description || '', rom_ids: ids, favorite: !!c.is_favorite, smart: kind === 'smart',
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
async function handleImage(request) {
  const u = new URL(request.url);
  const target = u.searchParams.get('u');
  if (!target) return new Response('bad', { status: 400 });
  const key = crypto.createHash('sha1').update(target).digest('hex');
  const file = path.join(IMG_CACHE, key);
  try {
    const buf = await fsp.readFile(file);
    const type = (await fsp.readFile(file + '.type', 'utf8').catch(() => '')) || 'image/jpeg';
    return new Response(buf, { headers: { 'Content-Type': type, 'Cache-Control': 'max-age=31536000' } });
  } catch {}
  try {
    let url, headers = {};
    if (/^https?:\/\//.test(target)) url = target.replace(/^\/\//, 'https://');
    else { url = (await resolveBase()) + (target.startsWith('/') ? '' : '/') + target; headers = authHeaders(); delete headers.Accept; }
    if (url.startsWith('//')) url = 'https:' + url;
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return new Response('nf', { status: 404 });
    const buf = Buffer.from(await r.arrayBuffer());
    const type = r.headers.get('content-type') || 'image/jpeg';
    fsp.mkdir(IMG_CACHE, { recursive: true }).then(() => Promise.all([fsp.writeFile(file, buf), fsp.writeFile(file + '.type', type)])).catch(() => {});
    return new Response(buf, { headers: { 'Content-Type': type } });
  } catch {
    return new Response('err', { status: 502 });
  }
}

// ---------------------------------------------------------------- downloads
const queue = []; // items
let nextId = 1;
let psbId = null;

function publicItem(it) {
  const { abort, ...rest } = it;
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
  const running = queue.filter((q) => q.status === 'downloading').length;
  const free = Math.max(1, config.downloads.concurrency || 1) - running;
  queue.filter((q) => q.status === 'queued').slice(0, Math.max(0, free)).forEach((it) => runJob(it));
  updatePowerBlock();
}

async function downloadTo(url, dest, it, onBytes) {
  const part = dest + '.part';
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  let start = 0;
  try { start = (await fsp.stat(part)).size; } catch {}
  const headers = authHeaders();
  delete headers.Accept;
  if (start > 0) headers.Range = `bytes=${start}-`;
  const r = await fetch(url, { headers, signal: it.abort.signal });
  if (r.status === 416) { start = 0; await fsp.rm(part, { force: true }); return downloadTo(url, dest, it, onBytes); }
  if (!r.ok) throw new Error(r.status === 404 ? 'File not found on server' : `HTTP ${r.status}`);
  const resumed = r.status === 206 && start > 0;
  if (resumed) onBytes(start);
  const ws = fs.createWriteStream(part, { flags: resumed ? 'a' : 'w' });
  const body = Readable.fromWeb(r.body);
  body.on('data', (chunk) => onBytes(chunk.length));
  await pipeline(body, ws);
  await fsp.rename(part, dest);
}

async function runJob(it) {
  it.status = 'downloading';
  it.abort = new AbortController();
  it.error = null;
  emitQueue();
  const base = await resolveBase();
  let lastT = Date.now(), lastB = 0;
  try {
    const rom = await api(`/api/roms/${it.romId}`);
    const target = platformPath({ slug: rom.platform_slug, fs_slug: rom.platform_fs_slug }).path;
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
      try { await downloadTo(url, finalPath, it, onBytes); }
      catch (e) {
        if (!files[0] || !/not found|404/.test(e.message)) throw e;
        await downloadTo(`${base}/api/roms/${rom.id}/content/${encodeURIComponent(fname)}`, finalPath, it, onBytes);
      }
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
    it.status = 'done';
    it.received = it.total;
    it.path = finalPath;
    manifest[rom.id] = { path: finalPath, platformSlug: rom.platform_slug, name: rom.name || rom.fs_name, at: Date.now() };
    saveManifest();
    installedMap[rom.id] = finalPath;
    broadcast('installed-changed', { romId: rom.id, path: finalPath });
  } catch (e) {
    if (it.abort.signal.aborted) { it.status = it.status === 'paused' ? 'paused' : 'cancelled'; }
    else { it.status = 'error'; it.error = e.message; }
  }
  it.speed = 0;
  emitQueue();
  pump();
}

async function downloadBios(platformId, slug) {
  const list = await api('/api/firmware', { query: { platform_id: platformId } });
  const base = await resolveBase();
  let dir = config.biosPath;
  if (!dir) throw new Error('Set a BIOS folder in Settings first.');
  await fsp.mkdir(dir, { recursive: true });
  const done = [];
  for (const f of list) {
    const dest = path.join(dir, f.file_name);
    if (fs.existsSync(dest)) { done.push({ name: f.file_name, skipped: true }); continue; }
    const fake = { abort: new AbortController() };
    await downloadTo(`${base}/api/firmware/${f.id}/content/${encodeURIComponent(f.file_name)}`, dest, fake, () => {});
    done.push({ name: f.file_name });
  }
  return { count: list.length, files: done, dir };
}

// ---------------------------------------------------------------- self-update (GitHub Releases)
let updateState = { state: 'idle' };
let autoUpdater = null;
function setupUpdater() {
  if (!app.isPackaged || !process.env.APPIMAGE) return; // only the real AppImage can replace itself
  try { ({ autoUpdater } = require('electron-updater')); } catch { return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  const set = (s) => { updateState = s; broadcast('update', s); };
  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => set({ state: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => set({ ...updateState, state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-not-available', () => set({ state: 'current', version: app.getVersion() }));
  autoUpdater.on('update-downloaded', (i) => set({ state: 'ready', version: i.version }));
  autoUpdater.on('error', (e) => set({ state: 'error', error: String(e?.message || e).slice(0, 200) }));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 8000);
  setInterval(check, 6 * 3600e3);
}

// ---------------------------------------------------------------- window + ipc
let win;
const isGamescope = () => !!(process.env.GAMESCOPE_WAYLAND_DISPLAY || process.env.SteamGamepadUI || process.env.SteamDeck === '1' || (process.env.XDG_CURRENT_DESKTOP || '').toLowerCase().includes('gamescope'));

function broadcast(ch, data) { if (win && !win.isDestroyed()) win.webContents.send(ch, data); }

function createWindow() {
  const fullscreen = isGamescope() || process.argv.includes('--fullscreen');
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 600,
    fullscreen,
    backgroundColor: '#0D1117',
    autoHideMenuBar: true,
    title: 'Cartridge',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.setMenuBarVisibility(false);
  if (process.env.VITE_DEV) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '../dist/index.html'));
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

const handlers = {
  'config:get': () => config,
  'config:set': (patch) => {
    config = deepMerge(config, patch); saveConfig();
    if (patch.server) activeBase = null;
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
  'roms:delete': async ({ romId, path: p }) => {
    const target = p || manifest[romId]?.path;
    if (!target) throw new Error('Nothing to delete');
    await fsp.rm(target, { recursive: true, force: true });
    delete manifest[romId];
    saveManifest();
    delete installedMap[romId];
    broadcast('installed-changed', { romId, path: null });
    return true;
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
  'dl:clear': () => { for (let i = queue.length - 1; i >= 0; i--) if (!['queued', 'downloading'].includes(queue[i].status)) queue.splice(i, 1); emitQueue(); },
  'bios:download': ({ platformId, slug }) => downloadBios(platformId, slug),
  'bios:list': ({ platformId }) => api('/api/firmware', { query: { platform_id: platformId } }),
  'fs:detect': () => detectRoots(),
  'fs:list': async (dir) => {
    const d = expandHome(dir || os.homedir());
    const entries = await fsp.readdir(d, { withFileTypes: true }).catch(() => []);
    const dirs = entries.filter((e) => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith('.')).map((e) => e.name).sort((a, b) => a.localeCompare(b));
    return { path: path.resolve(d), parent: path.dirname(path.resolve(d)), dirs };
  },
  'fs:mkdir': async (dir) => { await fsp.mkdir(dir, { recursive: true }); return true; },
  'fs:space': async (dir) => {
    let d = dir;
    while (d && !isDir(d)) { const up = path.dirname(d); if (up === d) break; d = up; }
    try { const s = await fsp.statfs(d || '/'); return { free: s.bavail * s.bsize, total: s.blocks * s.bsize }; } catch { return null; }
  },
  'fs:places': () => {
    const u = os.userInfo().username;
    return [
      { label: 'Home', path: os.homedir() },
      { label: 'External drives', path: isDir(`/run/media/${u}`) ? `/run/media/${u}` : '/run/media' },
      { label: 'Emulation (home)', path: path.join(os.homedir(), 'Emulation') },
      { label: 'Root', path: '/' },
    ].filter((p) => isDir(p.path));
  },
  'steam:applyArt': () => {
    const res = require('./steamArt').applySteamArt(path.join(__dirname, '../steam-art'));
    if (!res.length) throw new Error('Add Cartridge to Steam first (Add a Non-Steam Game), then try again.');
    return res;
  },
  'update:get': () => ({ ...updateState, current: app.getVersion(), supported: !!autoUpdater }),
  'update:check': async () => { if (!autoUpdater) throw new Error('Updates work in the AppImage build only'); await autoUpdater.checkForUpdates(); return updateState; },
  'update:install': () => { if (updateState.state === 'ready') autoUpdater.quitAndInstall(true, true); },
  'app:info': () => ({ version: app.getVersion(), gamescope: isGamescope(), userData: USER_DATA }),
  'app:quit': () => app.quit(),
  'app:fullscreen': () => win.setFullScreen(!win.isFullScreen()),
  'app:clearCache': async () => { await fsp.rm(IMG_CACHE, { recursive: true, force: true }); return true; },
};

for (const [ch, fn] of Object.entries(handlers)) {
  ipcMain.handle(ch, async (_e, arg) => {
    try { return { ok: true, data: await fn(arg) }; }
    catch (e) { return { ok: false, error: e.message || String(e) }; }
  });
}

app.whenReady().then(() => {
  protocol.handle('romimg', handleImage);
  createWindow();
  if (library) computeInstalled();
  win.webContents.once('did-finish-load', () => {
    if (config.configured && (config.sync.onLaunch || !library)) syncLibrary().catch(() => {});
  });
  setInterval(() => {
    const every = (config.sync.everyMinutes || 0) * 60e3;
    if (config.configured && every && library && Date.now() - library.syncedAt > every) syncLibrary().catch(() => {});
  }, 60e3);
  win.on('focus', () => { if (library) computeInstalled(); });
  setupUpdater();
});
app.on('window-all-closed', () => app.quit());
