// Trophies from local emulators (see trophies.js), linked to the RomM library and synced across
// devices through private RomM notes. Nothing here ever writes to an emulator's files.
const fs = require('fs');
const path = require('path');
const os = require('os');
const T = require('./trophies');

const NOTE_TITLE = 'Cartridge trophies';
// 0.9.49 (owner's photo: "Server error 500 on /api/roms/473/notes"): RomM keeps one note per title for each game and user
// (rom_notes unique_rom_user_note_title, RomM migration 0057), and every trophy note was called "Cartridge trophies", so
// a second game kept on one carrier ROM was refused with a 500 and never synced. Each set now has its own title; notes
// under the old title are still read and take the new one when next written.
const titleFor = (set) => `${NOTE_TITLE} ${String(set).replace(/[^A-Za-z0-9_-]+/g, '_')}`;
const isTrophyNote = (n) => n.data.cartridge === 'trophies' && (n.title === NOTE_TITLE || n.title.startsWith(NOTE_TITLE + ' '));
// The trophy names list (0.9.49, owner's idea): one note per console, on that console's carrier ROM, mapping every trophy
// set code (NPWR…, and the game's own ID, CUSA…/PPSA…) to its game's name and library ROM. A device that knows a game
// (installed there, or matched once) adds it; every device reads it on each sync, so a game shows its name everywhere,
// installed or not, for good. Only names are added: a real name never becomes a code.
const NAMES_TITLE = 'Cartridge trophy names';
const NOTE_TAG = 'cartridge-trophies';
const ORDER = ['rpcs3', 'shadps4', 'xenia', 'vita3k', 'kytyps5', 'recomp'];

module.exports = function createTrophyService(ctx) {
  const { USER_DATA, api, broadcast, log, loadJson } = ctx;
  const cfg = () => ctx.getConfig().trophies;
  const LINKS_FILE = path.join(USER_DATA, 'trophy-links.json');
  const REMOTE_FILE = path.join(USER_DATA, 'trophy-remote.json');
  T.setIconCacheDir(path.join(USER_DATA, 'trophyicons'));
  T.setTrpCacheDir(path.join(USER_DATA, 'trophylists')); // shadPS4 lists Cartridge decrypted itself (E6)

  const links = loadJson(LINKS_FILE, {}); // "src:set" -> romId (0 = the user unlinked it)
  const remote = new Map(Object.entries(loadJson(REMOTE_FILE, {}))); // "src:set" -> { romId, noteId, data }
  let games = new Map(); // "src:set" -> local game
  let known = null; // unlock keys seen so far (null until the first read, so startup never pops)
  let scanning = null;
  let syncState = { state: 'idle' };
  let syncT = null, pollT = null, lastPoll = '';
  const saveLinks = () => { try { fs.writeFileSync(LINKS_FILE, JSON.stringify(links)); } catch {} };
  // pictures pulled from other devices: register them so the image protocol can serve them
  for (const r of remote.values()) for (const f of Object.values(r.icons || {})) { try { if (fs.existsSync(f)) T.registerIcon(f); } catch {} }
  const saveRemote = () => { try { fs.writeFileSync(REMOTE_FILE, JSON.stringify(Object.fromEntries(remote))); } catch {} };
  const device = () => (cfg().device || os.hostname() || 'This device').slice(0, 40);
  const keyOf = (g) => `${g.src}:${g.set}`;
  const NAMES_FILE = path.join(USER_DATA, 'trophy-names.json');
  const names = loadJson(NAMES_FILE, {}); // src -> { code -> { title, romId, set } }
  const saveNames = () => { try { fs.writeFileSync(NAMES_FILE, JSON.stringify(names)); } catch {} };
  const nameIn = (src, ...codes) => { const m = names[src] || {}; for (const c of codes) if (c && m[String(c).toUpperCase()]) return m[String(c).toUpperCase()]; return null; };

  // ------------------------------------------------------------ sources
  function srcCfg(id) {
    const c = cfg();
    c.sources ||= {};
    c.sources[id] ||= { enabled: true, dirs: [], custom: [] };
    return c.sources[id];
  }
  function dirsOf(id) {
    const s = srcCfg(id);
    const out = new Map();
    for (const d of s.custom || []) out.set(d, 'chosen');
    for (const f of s.dirs || []) if (!out.has(f.dir)) out.set(f.dir, f.how);
    // the same folder often shows up under several mount paths (/run/media/…, /media/…, symlinks):
    // keep one entry per real folder
    const seen = new Set();
    const res = [];
    for (const [dir, how] of out) {
      let real;
      try { if (!fs.statSync(dir).isDirectory()) continue; real = fs.realpathSync(dir); } catch { continue; }
      const st = fs.statSync(real);
      const key = st.dev + ':' + st.ino;
      if (seen.has(key)) continue;
      seen.add(key);
      res.push({ dir, how });
    }
    return res;
  }
  // Layer 1: each emulator's own config and the usual install locations (fast, every start)
  function detect() {
    for (const id of ORDER) {
      const s = srcCfg(id);
      const found = T.DETECT[id]();
      // keep earlier scan results only while they still hold trophy data; settings-based ones are re-read
      const merged = new Map((s.dirs || []).filter((f) => f.how === 'scan' && T.validate(id, f.dir, false)).map((f) => [f.dir, f.how]));
      for (const f of found) if (!merged.has(f.dir)) merged.set(f.dir, f.how);
      s.dirs = [...merged].map(([dir, how]) => ({ dir, how }));
    }
    ctx.saveConfig();
  }
  // Layer 2: a limited scan for trophy fingerprints
  async function scan(want) {
    if (scanning) return scanning;
    scanning = (async () => {
      const ids = want?.length ? want : ORDER.filter((id) => srcCfg(id).enabled);
      const extra = [ctx.getConfig().romsRoot].filter(Boolean).map((r) => path.dirname(r));
      broadcast('trophies-scan', { state: 'running' });
      const r = await T.scan({ want: ids, extraRoots: extra, budgetMs: 15000, onProgress: (n) => broadcast('trophies-scan', { state: 'running', visited: n }) });
      for (const id of ids) {
        const s = srcCfg(id);
        for (const f of r.found[id] || []) if (!s.dirs.some((x) => x.dir === f.dir)) s.dirs.push(f);
      }
      ctx.saveConfig();
      cfg().scanned = Date.now();
      log('trophy scan', r.visited, 'folders', r.timedOut ? '(time limit)' : '', JSON.stringify(Object.fromEntries(ids.map((i) => [i, (r.found[i] || []).length]))));
      broadcast('trophies-scan', { state: 'done' });
      await refresh();
      return status();
    })();
    try { return await scanning; } finally { scanning = null; }
  }
  // Layer 3: a folder the user picked, checked against the format before it is accepted
  async function choose({ src, dir }) {
    const root = T.validate(src, dir);
    if (!root) throw new Error(`No ${T.SOURCES[src].name} trophy data in that folder`);
    const s = srcCfg(src);
    s.custom = [...new Set([...(s.custom || []), root])];
    s.enabled = true;
    ctx.saveConfig();
    await refresh();
    return status();
  }
  function status() {
    return ORDER.map((id) => {
      const s = srcCfg(id);
      const dirs = dirsOf(id);
      const n = [...games.values()].filter((g) => g.src === id).length;
      // shadPS4 writes nothing until its trophy key is set: say which of the two it is
      let note = '';
      if (id === 'shadps4' && dirs.length && !n) note = dirs.some((d) => T.shadKeyState(d.dir) === 'set') ? 'empty' : 'nokey';
      else if (dirs.length && !n) note = 'empty';
      const found = dirs.map((d) => ({ ...d, watch: T.watchPaths(id, d.dir) }));
      return { ...T.SOURCES[id], enabled: s.enabled !== false, found, custom: s.custom || [], games: n, note, state: s.enabled === false ? 'off' : dirs.length ? 'found' : 'missing' };
    });
  }

  // ------------------------------------------------------------ reading + library links
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[™®©]/g, '')
    .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').replace(/\b(trophies|trophy set|achievements)\b/g, '').replace(/^the\s+|,\s*the\b/g, '')
    .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
  function romsFor(src) {
    const lib = ctx.getLibrary();
    if (!lib) return [];
    const slugs = T.SOURCES[src].slugs;
    return lib.platforms.filter((p) => slugs.includes(p.slug) || slugs.includes(p.fs_slug)).flatMap((p) => lib.roms[p.id] || []);
  }
  function romById(id) {
    const lib = ctx.getLibrary();
    if (!lib || !id) return null;
    for (const list of Object.values(lib.roms)) { const r = list.find((x) => x.id === id); if (r) return r; }
    return null;
  }
  function autoLink(g) {
    const k = keyOf(g);
    if (k in links) return links[k] || null;
    const roms = romsFor(g.src);
    if (!roms.length) return null;
    if (g.titleId) {
      const id = g.titleId.toUpperCase();
      const hits = roms.filter((r) => String(r.fs_name || '').toUpperCase().includes(id));
      if (hits.length) return hits.sort((a, b) => a.id - b.id)[0].id; // 0.9.47: one serial, several copies is still that game
      // 0.9.48: the game identity engine also knows serials read from the downloaded game itself (PARAM.SFO and so on),
      // for ROMs whose names carry no serial
      const f = ctx.findRom?.({ ids: [id], slugs: T.SOURCES[g.src].slugs });
      if (f?.by === 'id') return f.id;
    }
    const n = norm(g.title);
    if (!n) return null;
    const exact = roms.filter((r) => norm(r.name) === n || norm(r.fs_name_no_ext) === n);
    // 0.9.47 (owner: most games never reached the other device): the same game in two regions or two versions matched
    // twice and linked to nothing, so it was never written to RomM. Same name is the same game: the oldest ROM
    if (exact.length) return exact.sort((a, b) => a.id - b.id)[0].id;
    const loose = roms.filter((r) => { const a = norm(r.name); return a && (a.startsWith(n + ' ') || n.startsWith(a + ' ')); });
    return loose.length && new Set(loose.map((r) => norm(r.name))).size === 1 ? loose.sort((a, b) => a.id - b.id)[0].id : null;
  }
  // a game no ROM matches still syncs (0.9.47): its note is kept on one fixed ROM of its console (the oldest), marked
  // carrier, so every device reads it and none links the game to that ROM
  function carrierFor(src) {
    const roms = romsFor(src);
    return roms.length ? roms.reduce((a, b) => (b.id < a.id ? b : a)).id : null;
  }
  async function refresh({ quiet } = {}) {
    const next = new Map();
    for (const id of ORDER) {
      if (srcCfg(id).enabled === false) continue;
      const dirs = dirsOf(id).map((d) => d.dir);
      if (!dirs.length) continue;
      for (const g of T.readSource(id, dirs)) next.set(keyOf(g), g);
    }
    games = next;
    // live pop-ups: anything unlocked since the last read
    const now = new Set();
    for (const g of games.values()) for (const t of g.trophies) if (t.unlocked) now.add(`${keyOf(g)}:${t.id}`);
    if (known && !quiet && cfg().popups !== false) {
      for (const g of games.values()) for (const t of g.trophies) {
        if (t.unlocked && !known.has(`${keyOf(g)}:${t.id}`)) broadcast('trophy-unlocked', { src: g.src, set: g.set, game: g.title, name: t.name, grade: t.grade, points: t.points || 0, icon: t.icon || g.icon });
      }
    }
    const changed = known && [...now].some((k) => !known.has(k));
    known = now;
    lastPoll = await pollSigAsync().catch(() => '');
    broadcast('trophies', { changed: true });
    if (changed || !syncState.at) queueSync(changed ? 3000 : 8000);
  }
  // Polling is a handful of stat calls: each unlock file plus each root folder
  const safeLs = (d) => { try { return fs.readdirSync(d).slice(0, 400); } catch { return []; } };
  // 0.9.63 (owner's log: a ~600 ms stall every minute): the same signature, read without holding the main thread
  // (hundreds of stat calls every 8 s, on an external drive). Folders found once a minute, files stat'd in parallel.
  let dirsAt = 0, dirsMemo = [];
  async function pollSigAsync() {
    const P = fs.promises, st = (f) => P.stat(f).catch(() => null);
    if (Date.now() - dirsAt > 60000) { dirsAt = Date.now(); dirsMemo = ORDER.filter((id) => srcCfg(id).enabled !== false).flatMap((id) => dirsOf(id)); }
    const files = [];
    for (const { dir } of dirsMemo) { files.push(dir); for (const n of await P.readdir(dir).then((x) => x.slice(0, 400), () => [])) files.push(path.join(dir, n)); }
    const parts = (await Promise.all(files.map(st))).map((s) => (s ? s.mtimeMs : null)).filter((x) => x != null);
    for (const s of await Promise.all([...games.values()].flatMap((g) => g.files).map(st))) if (s) parts.push(s.mtimeMs, s.size);
    return parts.join(',');
  }
  let polling = false;
  function startPolling() {
    clearInterval(pollT);
    let n = 0;
    pollT = setInterval(() => {
      // CAE governor (0.9.47): while a game is in front, every 32 s instead of 8 (it stats every trophy file)
      if (ctx.busy?.() && n++ % 4) return;
      if (polling) return;
      polling = true;
      pollSigAsync().then((s) => { if (s !== lastPoll) refresh().catch(() => {}); }).catch(() => {}).finally(() => { polling = false; });
    }, 8000);
  }

  // ------------------------------------------------------------ merged view (local + other devices)
  // A device that only has a code for a game (shadPS4 keeps names with the installed game, so a synced
  // user folder gives NPWR12345_00; Xenia sometimes has no title) takes the name another device wrote
  // to RomM, else the linked library game's (0.9.3 K, E1). Nothing is written into emulator folders.
  const isCode = (t) => !t || /^(NPWR\d{5}_\d{2}|[0-9A-F]{8}|CUSA\d{5}|PPSA\d{5}(_\d{2})?|[A-Z]{4}\d{5}|PCS[A-Z]\d{5})$/i.test(String(t).trim());
  // 0.9.29: then a built-in name for the code (titleNames: Xbox 360 title IDs from x360db)
  const nameOf = (title, remTitle, romId, src, set, titleId) => (!isCode(title) ? title : !isCode(remTitle) ? remTitle : nameIn(src, set, titleId)?.title || romById(romId)?.name || ctx.codeName?.(src, title || remTitle) || title || remTitle || 'Unknown game');
  function merged(k) {
    const loc = games.get(k);
    const rem = remote.get(k)?.data;
    if (!loc && !rem) return null;
    const ric = remote.get(k)?.icons || {};
    const ricon = (id) => { const f = ric[String(id)]; return f && fs.existsSync(f) ? T.registerIcon(f) : ''; };
    const me = device();
    const base = loc
      ? { ...loc, trophies: loc.trophies.map((t) => ({ ...t, device: t.unlocked ? me : null })) }
      : { src: rem.src, set: rem.set, title: rem.title, titleId: rem.titleId || null, icon: ricon('_game'), remoteOnly: true,
        trophies: (rem.list || []).map((t) => ({ id: t.id, name: t.name, desc: t.desc || '', grade: t.grade || null, points: t.points || 0, hidden: false, icon: ricon(t.id), unlocked: false, time: null, device: null })) };
    if (rem?.unlocks) {
      const byId = new Map(base.trophies.map((t) => [String(t.id), t]));
      for (const [id, u] of Object.entries(rem.unlocks)) {
        const t = byId.get(String(id));
        if (!t) continue;
        if (!t.unlocked || (u.t && (!t.time || u.t < t.time))) Object.assign(t, { unlocked: true, time: u.t || t.time, device: u.d || 'Another device' });
      }
    }
    const listed = nameIn(base.src, base.set, base.titleId);
    const romId = k in links ? links[k] || null : remote.get(k)?.romId || (loc ? autoLink(loc) : null) || (listed?.romId && romById(listed.romId) ? listed.romId : null);
    // still only a code (a game deleted before Cartridge learnt its name): say so, keep the code (0.9.16)
    const title = nameOf(base.title, rem?.title, romId, base.src, base.set, base.titleId), unnamed = isCode(title);
    return { ...base, title: unnamed ? `Unnamed ${T.SOURCES[base.src]?.short || ''} game`.replace('  ', ' ') : title, code: unnamed ? title : null, romId: romId || null, key: k };
  }
  function light(g) {
    const earned = g.trophies.filter((t) => t.unlocked);
    const grades = { P: 0, G: 0, S: 0, B: 0 };
    for (const t of earned) if (grades[t.grade] !== undefined) grades[t.grade]++;
    const last = earned.reduce((m, t) => Math.max(m, t.time || 0), 0);
    const rom = romById(g.romId);
    return {
      key: g.key, src: g.src, set: g.set, title: g.title, code: g.code || null, icon: g.icon, romId: g.romId, remoteOnly: !!g.remoteOnly,
      platform: T.SOURCES[g.src].platform, short: T.SOURCES[g.src].short, kind: T.SOURCES[g.src].kind,
      earned: earned.length, total: g.trophies.length, grades,
      score: g.trophies.reduce((s, t) => s + (t.unlocked ? t.points || 0 : 0), 0), possible: g.trophies.reduce((s, t) => s + (t.points || 0), 0),
      last, cover: rom ? rom.path_cover_small || rom.url_cover || null : null,
      devices: [...new Set(earned.map((t) => t.device).filter(Boolean))],
    };
  }
  function allKeys() { return [...new Set([...games.keys(), ...remote.keys()])]; }
  // games you hid (Trophies → a game → More): left out of the totals, gamerscore and latest unlocks
  const hiddenSet = () => new Set(cfg()?.hidden || []);
  function overview() {
    const hidden = hiddenSet();
    const all = allKeys().map(merged).filter(Boolean);
    const list = all.filter((g) => !hidden.has(g.key));
    const summary = { P: 0, G: 0, S: 0, B: 0, trophies: 0, gamerscore: 0, gamerscoreMax: 0, games: list.length, hidden: all.length - list.length };
    const recent = [];
    for (const g of list) {
      for (const t of g.trophies) {
        if (!t.unlocked) continue;
        if (T.SOURCES[g.src].kind === 'gamerscore') summary.gamerscore += t.points || 0;
        else { summary.trophies++; if (summary[t.grade] !== undefined) summary[t.grade]++; }
        recent.push({ key: g.key, game: g.title, gameIcon: g.icon, src: g.src, short: T.SOURCES[g.src].short, id: t.id, name: t.name, desc: t.desc, grade: t.grade, points: t.points || 0, icon: t.icon, time: t.time, device: t.device });
      }
      if (T.SOURCES[g.src].kind === 'gamerscore') summary.gamerscoreMax += g.trophies.reduce((s, t) => s + (t.points || 0), 0);
    }
    recent.sort((a, b) => (b.time || 0) - (a.time || 0));
    const games2 = all.map((g) => ({ ...light(g), hidden: hidden.has(g.key) })).sort((a, b) => (b.last - a.last) || a.title.localeCompare(b.title));
    return { summary, recent: recent.slice(0, 40), games: games2, sources: status(), sync: syncState, device: device(), anySource: status().some((s) => s.state === 'found') || remote.size > 0 };
  }
  function forRom(romId) {
    for (const k of allKeys()) { const g = merged(k); if (g && g.romId === romId) return { ...g, light: light(g), kind: T.SOURCES[g.src].kind, platform: T.SOURCES[g.src].platform }; }
    return null;
  }

  // ------------------------------------------------------------ RomM notes sync
  const parseAny = (s) => { try { const j = JSON.parse(s); return j && typeof j.cartridge === 'string' ? j : null; } catch { return null; } };
  const parse = (s) => { const j = parseAny(s); return j && j.cartridge === 'trophies' ? j : null; };
  const listOf = (r) => (Array.isArray(r) ? r : r?.items || []);
  let meId;
  async function notesAll(romId) {
    if (meId === undefined) { try { meId = (await api('/api/users/me')).id ?? null; } catch { meId = null; } }
    const notes = listOf(await api(`/api/roms/${romId}/notes`, { query: { tags: NOTE_TAG } }));
    return notes.filter((n) => n && String(n.title || '').startsWith('Cartridge troph') && (meId == null || n.user_id == null || n.user_id === meId)).map((n) => ({ id: n.id, title: n.title, data: parseAny(n.content) })).filter((n) => n.data);
  }
  async function notesFor(romId) { return (await notesAll(romId)).filter(isTrophyNote); }

  // ---- trophy pictures: small copies stored as extra private notes, so other devices can show them
  const ICON_REMOTE = path.join(USER_DATA, 'trophyicons', 'remote');
  const safe = (x) => String(x).replace(/[^A-Za-z0-9_-]+/g, '_');
  function packIcons(g) {
    const { nativeImage } = require('electron');
    const pic = (token, w, h) => {
      const f = token && T.iconPath(String(token).split('tr=')[1]);
      if (!f) return null;
      try {
        let im = nativeImage.createFromPath(f);
        if (im.isEmpty()) return null;
        const sz = im.getSize();
        im = h ? im.resize({ width: w, height: h, quality: 'best' }) : im.resize({ width: Math.min(w, sz.width), quality: 'best' });
        return im.toJPEG(82).toString('base64');
      } catch { return null; }
    };
    const all = [];
    const gi = pic(g.icon, 200);
    if (gi) all.push(['_game', gi]);
    for (const t of g.trophies) { const d = pic(t.icon, 64, 64); if (d) all.push([String(t.id), d]); }
    if (!all.length) return [];
    // RomM on MariaDB keeps notes up to 64 KB: split into parts well under that
    const parts = [];
    let cur = {}, size = 0;
    for (const [id, d] of all) {
      if (size + d.length > 44000 && Object.keys(cur).length) { parts.push(cur); cur = {}; size = 0; }
      cur[id] = d; size += d.length + 16;
    }
    parts.push(cur);
    return parts;
  }
  async function pushIcons(g, romId, existing) {
    if (cfg().syncIcons === false || existing.length) return;
    const parts = packIcons(g);
    for (const [i, icons] of parts.entries()) {
      const body = { title: `Cartridge trophy icons ${safe(g.set)} ${i + 1}`, content: JSON.stringify({ cartridge: 'trophy-icons', v: 1, src: g.src, set: g.set, part: i + 1, parts: parts.length, icons }), is_public: false, tags: [NOTE_TAG] };
      await api(`/api/roms/${romId}/notes`, { method: 'POST', body });
    }
    if (parts.length) log('trophy icons uploaded', g.set, parts.length, 'part(s)');
  }
  function unpackIcons(set, iconNotes) {
    const dir = path.join(ICON_REMOTE, safe(set));
    const out = {};
    for (const n of iconNotes) {
      for (const [id, d] of Object.entries(n.data.icons || {})) {
        const f = path.join(dir, safe(id) + '.jpg');
        try { if (!fs.existsSync(f)) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f, Buffer.from(d, 'base64')); } out[id] = f; } catch {}
      }
    }
    return out;
  }
  function noteData(g, prev) {
    const unlocks = { ...(prev?.unlocks || {}) };
    const me = device();
    let changed = !prev;
    for (const t of g.trophies) {
      if (!t.unlocked) continue;
      const u = unlocks[t.id];
      const time = t.time || null;
      if (!u) { unlocks[t.id] = { t: time, d: me }; changed = true; }
      else if (time && (!u.t || time < u.t)) { unlocks[t.id] = { t: time, d: me }; changed = true; }
    }
    const list = g.trophies.map((t) => ({ id: t.id, name: t.name, desc: (t.desc || '').slice(0, 160), grade: t.grade || null, points: t.points || 0 }));
    if (prev && (prev.list || []).length !== list.length) changed = true;
    // a code never replaces a real name another device wrote
    const title = isCode(g.title) && prev?.title && !isCode(prev.title) ? prev.title : g.title;
    if (prev && title !== prev.title) changed = true;
    return { changed, data: { cartridge: 'trophies', v: 1, src: g.src, set: g.set, title, titleId: g.titleId || null, list, unlocks } };
  }
  async function syncOne(g, romId, carrier) {
    const k = keyOf(g);
    const all = await notesAll(romId);
    const notes = all.filter(isTrophyNote);
    const note = notes.find((n) => n.data.src === g.src && n.data.set === g.set);
    try { await pushIcons(g, romId, all.filter((n) => n.data.cartridge === 'trophy-icons' && n.data.set === g.set)); } catch (e) { log('trophy icons upload failed', e.message); }
    let { changed, data } = noteData(g, note?.data);
    if (carrier) data.carrier = true;
    const body = { title: titleFor(g.set), content: JSON.stringify(data), is_public: false, tags: [NOTE_TAG] };
    let noteId = note?.id;
    if (note && note.title !== body.title) changed = true; // an old shared title moves to its own
    // 0.9.47 (owner: "the entire list of games"): written even with nothing unlocked yet, so the game is listed everywhere
    if (changed) {
      if (noteId) await api(`/api/roms/${romId}/notes/${noteId}`, { method: 'PUT', body });
      else { const r = await api(`/api/roms/${romId}/notes`, { method: 'POST', body }); noteId = r?.id; }
    }
    remote.set(k, { romId: carrier ? null : romId, carrierRom: carrier ? romId : null, noteId: noteId || null, data: changed ? data : note?.data || data });
  }
  // every name this device knows, added to the list kept on each console's carrier ROM, and every name there taken in
  function learnNames() {
    let added = 0;
    for (const k of allKeys()) {
      const loc = games.get(k), rem = remote.get(k);
      const g = loc || rem?.data; if (!g) continue;
      const romId = k in links ? links[k] || null : rem?.romId || (loc ? autoLink(loc) : null);
      const title = !isCode(loc?.title) ? loc.title : !isCode(rem?.data?.title) ? rem.data.title : romById(romId)?.name || null;
      if (!title || isCode(title)) continue;
      const m = (names[g.src] ||= {});
      for (const code of [g.set, g.titleId].filter(Boolean).map((c) => String(c).toUpperCase())) {
        const had = m[code];
        if (!had || isCode(had.title) || (!had.romId && romId)) { m[code] = { title, set: g.set, romId: romId || had?.romId || null }; added++; }
      }
    }
    return added;
  }
  async function syncNames(reads) {
    learnNames();
    for (const src of ORDER) {
      const c = carrierFor(src); if (!c) continue;
      const all = reads.get(c) || await notesAll(c).catch(() => []);
      const note = all.find((n) => n.data.cartridge === 'trophy-names' && n.data.src === src);
      const theirs = note?.data?.names || {}, mine = (names[src] ||= {});
      let localNew = false, gotNew = false;
      for (const [code, e] of Object.entries(theirs)) { if (!e?.title || isCode(e.title)) continue; const had = mine[code]; if (!had || isCode(had.title) || (!had.romId && e.romId)) { mine[code] = { ...had, ...e }; gotNew = true; } }
      for (const [code, e] of Object.entries(mine)) { const t = theirs[code]; if (!t || isCode(t.title) || (!t.romId && e.romId)) localNew = true; }
      // a game known here only by its code gets the name in this device's own list of names too (titles.json)
      if (gotNew) for (const e of Object.values(mine)) if (e.set && !isCode(e.title)) T.rememberTitle(e.set, e.title);
      if (localNew && Object.keys(mine).length) {
        const body = { title: `${NAMES_TITLE} ${src}`, content: JSON.stringify({ cartridge: 'trophy-names', v: 1, src, names: mine }), is_public: false, tags: [NOTE_TAG] };
        if (note) await api(`/api/roms/${c}/notes/${note.id}`, { method: 'PUT', body }); else await api(`/api/roms/${c}/notes`, { method: 'POST', body });
        log('trophy names list written', src, Object.keys(mine).length);
      }
    }
    saveNames();
  }
  const NOTED_FILE = path.join(USER_DATA, 'trophy-noted.json');
  const noted = new Set(loadJson(NOTED_FILE, [])); // ROMs seen with trophy notes (any device)
  let lastFull = 0;
  async function sync({ force } = {}) {
    await ctx.idsReady?.(); // 0.9.60: games' IDs are read in the background; linking waits for them instead of guessing
    if (cfg().sync === false) { syncState = { state: 'off' }; return syncState; }
    if (!ctx.getConfig().configured) return syncState;
    syncState = { state: 'running', at: syncState.at };
    broadcast('trophies-sync', syncState);
    let pushed = 0, pulled = 0;
    try {
      // this device's games that are linked to the library
      for (const g of games.values()) {
        const romId = autoLink(g), carrier = romId ? null : carrierFor(g.src);
        if (!romId && !carrier) continue; // no console of its kind in the library at all
        await syncOne(g, romId || carrier, !romId); pushed++;
      }
      // games played only on other devices: ROMs with notes on trophy consoles
      const localRoms = new Set([...games.values()].map(autoLink).filter(Boolean));
      // consoles with a game known here only by its code are read first, so the 80 cover them
      const coded = new Set([...games.values()].filter((g) => isCode(g.title)).map((g) => g.src));
      // 0.9.37 (owner: truly cloud synced, even where the emulator or the game isn't installed): every 30 minutes (and
      // when asked) every game on a trophy console is read, not only the ones the library last said had notes, so a
      // game another device just played shows up without a library refresh; between those, the ones known to have notes
      const full = force || Date.now() - lastFull > 30 * 60e3;
      const carriers = new Set(ORDER.map(carrierFor).filter(Boolean)); // read even when linked here: they hold unmatched games
      const pool = [...ORDER.filter((id) => coded.has(id)), ...ORDER.filter((id) => !coded.has(id))].flatMap((id) => romsFor(id)).filter((r) => !localRoms.has(r.id) || carriers.has(r.id));
      const withNotes = full ? pool : pool.filter((r) => r.has_notes || noted.has(r.id));
      const reads = new Map();
      const read = async (r) => { try { reads.set(r.id, await notesAll(r.id)); } catch (e) { if (/404/.test(e.message)) reads.set(r.id, []); else throw e; } };
      for (let i = 0; i < withNotes.length; i += 6) await Promise.all(withNotes.slice(i, i + 6).map(read));
      if (full) lastFull = Date.now();
      for (const r of withNotes) {
        const all = reads.get(r.id) || [];
        if (all.some((x) => x.data.cartridge === 'trophies')) noted.add(r.id); else noted.delete(r.id);
        for (const n of all.filter(isTrophyNote)) {
          const k = `${n.data.src}:${n.data.set}`;
          if (!T.SOURCES[n.data.src]) continue;
          // 0.9.28: a game this device has only as a code (a PS4 game that isn't installed here, so shadPS4 left
          // NPWR06616_00) takes the name and the library link from the device that wrote the note
          if (games.has(k)) {
            if (!isCode(games.get(k).title) || remote.has(k) && !isCode(remote.get(k).data?.title)) continue;
            if (isCode(n.data.title)) continue;
            T.rememberTitle(n.data.set, n.data.title);
          }
          const icons = cfg().syncIcons === false ? {} : unpackIcons(n.data.set, all.filter((x) => x.data.cartridge === 'trophy-icons' && x.data.set === n.data.set));
          // a game's own ROM wins over the carrier copy (it was unmatched on some device, matched on another)
          if (n.data.carrier && remote.get(k) && !remote.get(k).carrierRom && remote.get(k).romId) continue;
          remote.set(k, { romId: n.data.carrier ? null : r.id, carrierRom: n.data.carrier ? r.id : null, noteId: n.id, data: n.data, icons }); pulled++;
        }
      }
      try { await syncNames(reads); } catch (e) { log('trophy names list', e.message); }
      saveRemote();
      try { fs.writeFileSync(NOTED_FILE, JSON.stringify([...noted])); } catch {}
      syncState = { state: 'ok', at: Date.now(), pushed, pulled, full };
    } catch (e) {
      const msg = /Authentication/.test(e.message) ? 'Your RomM login cannot write notes (needs the roms.user.write permission)'
        : /Server error 404|Server error 405/.test(e.message) ? 'This RomM version has no notes, update RomM to sync trophies' : e.message;
      syncState = { state: 'error', at: Date.now(), error: msg };
      log('trophy sync failed', e.message);
    }
    broadcast('trophies-sync', syncState);
    broadcast('trophies', { changed: true });
    return syncState;
  }
  function queueSync(ms) { clearTimeout(syncT); syncT = setTimeout(() => sync().catch(() => {}), ms); }

  // ------------------------------------------------------------ start + ipc
  async function start() {
    try { detect(); } catch (e) { log('trophy detect failed', e.message); }
    await refresh({ quiet: true });
    // first run: one limited background scan for anything the configs did not reveal
    if (!cfg().scanned && ORDER.some((id) => srcCfg(id).enabled !== false && !dirsOf(id).length)) setTimeout(() => scan().catch(() => {}), 6000);
    startPolling();
  }

  const handlers = {
    'trophies:overview': () => overview(),
    'trophies:game': ({ key }) => { const g = merged(key); return g ? { ...g, light: light(g), platform: T.SOURCES[g.src].platform, kind: T.SOURCES[g.src].kind } : null; },
    'trophies:forRom': ({ romId }) => forRom(romId),
    'trophies:sources': () => status(),
    'trophies:scan': () => scan(),
    'trophies:choose': (o) => choose(o),
    'trophies:removeDir': ({ src, dir }) => {
      const s = srcCfg(src);
      s.custom = (s.custom || []).filter((d) => d !== dir);
      s.dirs = (s.dirs || []).filter((d) => d.dir !== dir);
      ctx.saveConfig();
      return refresh({ quiet: true }).then(status);
    },
    'trophies:toggle': ({ src, enabled }) => { srcCfg(src).enabled = !!enabled; ctx.saveConfig(); return refresh({ quiet: true }).then(status); },
    'trophies:linkable': ({ slug, fs_slug }) => {
      const srcs = ORDER.filter((id) => T.SOURCES[id].slugs.includes(slug) || T.SOURCES[id].slugs.includes(fs_slug));
      return allKeys().map(merged).filter((g) => g && srcs.includes(g.src)).map(light).sort((a, b) => a.title.localeCompare(b.title));
    },
    'trophies:hide': ({ key, hidden }) => {
      const set = hiddenSet();
      if (hidden) set.add(key); else set.delete(key);
      ctx.getConfig().trophies = { ...(cfg() || {}), hidden: [...set] };
      ctx.saveConfig();
      broadcast('trophies', {});
      return [...set];
    },
    'trophies:link': ({ key, romId }) => {
      // one game per ROM: a new link replaces any other game on that ROM
      if (romId) for (const k of allKeys()) { const g = merged(k); if (g && g.romId === romId && k !== key) links[k] = 0; }
      links[key] = romId || 0;
      const r = remote.get(key);
      if (r && romId) r.romId = romId;
      saveLinks();
      queueSync(1500);
      broadcast('trophies', { changed: true });
      return true;
    },
    'trophies:sync': () => sync({ force: true }),
  };
  function stop() { clearInterval(pollT); clearTimeout(syncT); }
  // installed recomps changed (0.9.65): their folders read again
  const redetect = () => { detect(); return refresh(); };
  return { start, stop, handlers, iconPath: T.iconPath, refresh, redetect };
};
