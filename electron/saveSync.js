'use strict';
// Cartridge Save Sync (0.9.51): your saves kept on your own RomM server and brought to every device you play on.
// Not Syncthing (that is the other choice in Saves and Sync; a device uses one or the other, never both).
//
// The engine, in the order a save goes through it:
// 1. Units: what one save is. Built from the saves scanner (saves.js knows each emulator's layout) plus RetroArch
//    save states per core. Three shapes: a folder per game (Switch, PS3, PSP, Vita, PS4, Wii, Wii U, 3DS, Xbox 360),
//    a file per game (RetroArch, DuckStation per-game cards, Dolphin .gci), and a whole memory card (PCSX2, shared
//    DuckStation and Dolphin cards), kept whole on the console's carrier game (owner: "do the whole card").
//    Switch saves are Eden's only (owner: no Ryujinx, no other forks for now).
// 2. Key and place: each unit has a key that is the same on every device (the user folder in the path left out:
//    Eden's user ID differs per install) and a place: where it goes on this device when it isn't here yet.
// 3. Hash: RomM's own content hash, worked out from the files without zipping (md5 of the sorted "name:md5" lines of
//    the archive's entries, backend handler/filesystem/assets_handler.py), so the two sides compare directly.
// 4. Decide: this device's save, RomM's newest version in the unit's slot, and the version both last agreed on
//    (the ledger) give up, down, nothing, or a conflict. A conflict is never settled by guessing: you choose.
// 5. Move: upload as a zip into the unit's slot (RomM keeps versions); download into a temporary folder, check its
//    hash, back the old save up (save-backups, 10 per save), then swap it in. Never while the emulator runs.
// No Electron imports, so it is tested on its own (test/saveSync.test.js) with a fake RomM.
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');
const S = require('./saves');

const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const ls = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };

// ---------------------------------------------------------------- 1. units
// where the console's games live in RomM terms, for the carrier of a whole card
const CONSOLE = { eden: 'switch', rpcs3: 'ps3', ppsspp: 'psp', vita3k: 'psvita', shadps4: 'ps4', pcsx2: 'ps2', duckstation: 'psx', dolphin: 'ngc', cemu: 'wiiu', azahar: '3ds', xenia: 'xbox360', retroarch: null };
const SUPPORTED = Object.keys(CONSOLE);
const LABEL = { eden: 'Eden', rpcs3: 'RPCS3', ppsspp: 'PPSSPP', vita3k: 'Vita3K', shadps4: 'shadPS4', pcsx2: 'PCSX2', duckstation: 'DuckStation', dolphin: 'Dolphin', cemu: 'Cemu', azahar: 'Azahar', xenia: 'Xenia', retroarch: 'RetroArch' };

// one scanned save -> { key, kind: dir|file, layout, keyPart } or null (not synced)
function shape(s) {
  const p = s.path, b = path.basename(p);
  switch (s.emu) {
    case 'eden': { const m = /nand\/user\/save\/(0000000000000000\/[^/]+|account\/[^/]+)\/([0-9A-Fa-f]{16})$/.exec(p); return m ? { key: 'switch:' + m[2].toUpperCase(), kind: 'dir' } : null; }
    case 'rpcs3': return { key: 'ps3:' + b, kind: 'dir' };
    case 'ppsspp': return { key: 'psp:' + b, kind: 'dir' };
    case 'vita3k': return { key: 'vita:' + b, kind: 'dir' };
    case 'shadps4': return { key: 'ps4:' + b, kind: 'dir' };
    case 'pcsx2': return { key: 'ps2card:' + b, kind: isDir(p) ? 'dir' : 'file', card: true };
    case 'duckstation': return { key: 'ps1card:' + b, kind: 'file', card: !!s.shared };
    case 'dolphin':
      if (s.kind === 'card') return { key: 'gccard:' + path.basename(path.dirname(p)) + '/' + b, kind: 'file', card: true };
      if (/\/Wii\/title\/00010000\/[0-9a-f]{8}\/data$/i.test(p)) return { key: 'wii:' + path.basename(path.dirname(p)).toLowerCase(), kind: 'dir' };
      return { key: 'gc:' + path.basename(path.dirname(path.dirname(p))) + '/' + b, kind: 'file' };
    case 'cemu': return { key: 'wiiu:' + b.toLowerCase(), kind: 'dir' };
    case 'azahar': return { key: '3ds:' + path.basename(path.dirname(p)).toLowerCase(), kind: 'dir' };
    case 'xenia': return { key: 'x360:' + path.basename(path.dirname(p)).toUpperCase(), kind: 'dir' };
    case 'retroarch': return { key: 'ra:' + (s.rel || b), kind: 'file' };
    default: return null;
  }
}

// RetroArch: the saves folder relative path (sort by core keeps a folder per core) and its save states per core
function retroarchDirs(base) {
  let cfg = ''; try { cfg = fs.readFileSync(path.join(base, 'retroarch.cfg'), 'utf8'); } catch {}
  const dir = (k, def) => { let d = (new RegExp(`^\\s*${k}\\s*=\\s*"([^"]*)"`, 'm').exec(cfg) || [])[1] || ''; d = d.replace(/^~(?=\/|$)/, os.homedir()).replace(/^:(?=\/|$)/, base); return !d || d === 'default' ? path.join(base, def) : d; };
  return { saves: dir('savefile_directory', 'saves'), states: dir('savestate_directory', 'states') };
}
// states/<core>/<game>.state, .state1…, .state.auto, and their .png pictures: one unit per game per core
function retroarchStates(base) {
  const { states } = retroarchDirs(base), groups = new Map();
  const add = (dir, rel) => {
    for (const e of ls(dir)) {
      if (!e.isFile()) continue;
      const m = /^(.*?)\.state(\d+|\.auto)?(\.png)?$/i.exec(e.name);
      if (!m) continue;
      const k = (rel ? rel + '/' : '') + m[1];
      if (!groups.has(k)) groups.set(k, { name: m[1], rel, dir, files: [] });
      groups.get(k).files.push(e.name);
    }
  };
  add(states, '');
  for (const c of ls(states)) if (c.isDirectory()) add(path.join(states, c.name), c.name);
  return [...groups.entries()].map(([k, g]) => ({ emu: 'retroarch', kind: 'files', key: 'rastate:' + k, dir: g.dir, files: g.files.sort(), label: g.name + (g.rel ? ` (${g.rel})` : ''), keys: { name: g.name }, base, statesRoot: states }));
}

// every unit on this device, matched to a library game. games: [{ id, name, platform, ids, discIds }]
// carriers: { [consoleSlug]: romId } (the console's oldest game holds a whole memory card)
function units({ home = os.homedir(), extra = {}, games = [], carriers = {} } = {}) {
  const scanned = S.scan({ home, extra, withSize: false }).filter((s) => SUPPORTED.includes(s.emu));
  for (const s of scanned) if (s.emu === 'retroarch') { const { saves } = retroarchDirs(s.base); s.rel = path.relative(saves, s.path); }
  const ra = [...new Set(scanned.filter((s) => s.emu === 'retroarch').map((s) => s.base))];
  for (const emu of ['retroarch']) for (const d of S.DATA[emu]) { const b = path.join(home, d); if (isDir(b) && !ra.includes(b)) ra.push(b); }
  const states = ra.flatMap(retroarchStates);
  S.match(scanned, games); S.match(states, games);
  const out = [], seen = new Set();
  for (const s of scanned) {
    const sh = shape(s); if (!sh) continue;
    const romId = sh.card ? carriers[CONSOLE[s.emu]] ?? s.romIds?.[0] ?? null : s.romIds?.[0] ?? null;
    const u = { key: sh.key, emu: s.emu, kind: sh.kind, path: s.path, base: s.base, label: s.label || '', romId, card: !!sh.card, slot: slotOf(s.emu, sh.key, sh.kind) };
    if (romId == null) u.why = whyUnmatched(s, sh);
    if (seen.has(u.key)) continue; // the same save found twice (an EmuDeck link and the folder it points at)
    seen.add(u.key); out.push(u);
  }
  for (const s of states) {
    if (seen.has(s.key)) continue; seen.add(s.key);
    const romId = s.romIds?.[0] ?? null;
    out.push({ key: s.key, emu: 'retroarch', kind: 'files', path: s.dir, files: s.files, base: s.base, label: s.label, romId, card: false, slot: slotOf('retroarch', s.key, 'files'), states: true, ...(romId == null ? { why: whyUnmatched(s, {}) } : {}) });
  }
  return out;
}
// why a save matched no game (0.9.56, owner: "which games didn't match, why, and what's the fix"): what Cartridge
// read from the save and so what to do about it. code: card (a memory card, but no game of its console in the
// library to keep it with), id (an ID that no game in the library carries), name (matched by name only, and no game
// is called that), none (nothing readable). The words are made in the UI from these.
function whyUnmatched(s, sh = {}) {
  const k = s.keys || {}, con = CONSOLE[s.emu] || null;
  if (sh.card) return { code: 'card', console: con };
  const id = k.switch || k.serial || k.gc || k.n3ds || k.wiiu || k.x360 || (s.serials || [])[0] || '';
  if (id) return { code: 'id', id: String(id).toUpperCase(), title: k.title || '', console: con };
  const name = k.title || k.name || '';
  if (name) return { code: 'name', name, console: con };
  return { code: 'none', console: con };
}
// RomM's slot for a unit: names the save so every device finds the same one (255 characters at most)
const slotOf = (emu, key, kind) => `cartridge:${emu}:${kind}:${key}`.slice(0, 255);

// ---------------------------------------------------------------- 2. place on this device
// where a unit goes here when this device doesn't have it yet; null when it can't be placed safely (the emulator
// hasn't made its folders yet: run it once)
function placeFor(emu, key, { home = os.homedir(), extra = {} } = {}) {
  const bases = [...(extra[emu] || []), ...(S.DATA[emu] || []).map((d) => path.join(home, d))].filter(isDir);
  const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  const firstDir = (d) => ls(d).filter((e) => e.isDirectory()).map((e) => path.join(d, e.name))[0] || null;
  for (const b of bases) {
    switch (kind) {
      case 'switch': { const u = firstDir(path.join(b, 'nand/user/save/0000000000000000')); if (u) return path.join(u, id); break; }
      case 'ps3': { const u = path.join(b, 'dev_hdd0/home/00000001/savedata'); if (isDir(path.dirname(u))) return path.join(u, id); break; }
      case 'psp': if (isDir(path.join(b, 'PSP'))) return path.join(b, 'PSP/SAVEDATA', id); break;
      case 'vita': if (isDir(path.join(b, 'ux0'))) return path.join(b, 'ux0/user/00/savedata', id); break;
      // 0.9.57: shadPS4's <home>/<user ID>/savedata (saves.shadSaveDir), the older layouts as they are found
      case 'ps4': { const sd = S.shadSaveDirs(b)[0]; if (!sd) break; if (/[\/]home[\/][^\/]+[\/]savedata$/.test(sd)) return path.join(sd, id); const u = ls(sd).find((e) => e.isDirectory() && !/^(CUSA|PCJS|PLJM|PCAS|PCKS)\d{5}$/.test(e.name)); if (u) return path.join(sd, u.name, id); break; }
      case 'ps2card': case 'ps1card': if (isDir(path.join(b, 'memcards'))) return path.join(b, 'memcards', id); break;
      case 'gccard': case 'gc': { const [region, file] = id.split('/'); if (isDir(path.join(b, 'GC', region))) return kind === 'gc' ? path.join(b, 'GC', region, 'Card A', file) : path.join(b, 'GC', region, file); break; }
      case 'wii': if (isDir(path.join(b, 'Wii/title'))) return path.join(b, 'Wii/title/00010000', id, 'data'); break;
      case 'wiiu': if (isDir(path.join(b, 'mlc01/usr'))) return path.join(b, 'mlc01/usr/save/00050000', id); break;
      case '3ds': { const n = path.join(b, 'sdmc/Nintendo 3DS'), a = firstDir(n), c = a && firstDir(a); if (c) return path.join(c, 'title/00040000', id, 'data'); break; }
      case 'x360': { const p = firstDir(path.join(b, 'content')); if (p) return path.join(p, id, '00000001'); break; }
      case 'ra': { const { saves } = retroarchDirs(b); if (isDir(saves)) return path.join(saves, id); break; }
      case 'rastate': { const { states } = retroarchDirs(b); const rel = id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : ''; if (isDir(states)) return path.join(states, rel); break; }
    }
  }
  return null;
}

// ---------------------------------------------------------------- 3. files and RomM's hash
// the unit's files as [name inside the archive, path on disk]; folders keep their layout, dir entries end in "/"
function entriesOf(u) {
  if (u.kind === 'file') return exists(u.path) ? [[path.basename(u.path), u.path]] : [];
  if (u.kind === 'files') return (u.files || []).map((f) => [f, path.join(u.path, f)]).filter(([, p]) => exists(p));
  const out = [];
  const walk = (d, rel, depth) => {
    for (const e of ls(d).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name), r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { out.push([r + '/', null]); if (depth < 12) walk(p, r, depth + 1); }
      else if (e.isFile()) out.push([r, p]);
    }
  };
  if (isDir(u.path)) walk(u.path, '', 0);
  return out;
}
// RomM's content hash of the archive these entries make (directories don't count, as there)
function hashEntries(entries, read = (p) => fs.readFileSync(p)) {
  const lines = entries.filter(([n]) => !n.endsWith('/')).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([n, p]) => `${n}:${md5(read(p))}`);
  return lines.length ? md5(lines.join('\n')) : null;
}
const hashUnit = (u) => hashEntries(entriesOf(u));
// newest change in a unit (to look again only at saves that changed)
function changedAt(u) { let t = 0; for (const [, p] of entriesOf(u)) if (p) { try { t = Math.max(t, fs.statSync(p).mtimeMs); } catch {} } return t; }

// ---------------------------------------------------------------- a small zip writer and reader
function zip(entries, read = (p) => fs.readFileSync(p)) {
  const parts = [], central = []; let off = 0;
  for (const [name, p] of entries) {
    const nameBuf = Buffer.from(name, 'utf8'), data = p ? read(p) : Buffer.alloc(0), dir = name.endsWith('/');
    const comp = dir ? data : zlib.deflateRawSync(data), method = dir ? 0 : 8, crc = zlib.crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(method, 8); h.writeUInt32LE(0, 10); h.writeUInt32LE(crc >>> 0, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nameBuf.length, 26); h.writeUInt16LE(0, 28);
    parts.push(h, nameBuf, comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(method, 10); c.writeUInt32LE(0, 12); c.writeUInt32LE(crc >>> 0, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nameBuf.length, 28); c.writeUInt32LE(dir ? 0x10 : 0, 38); c.writeUInt32LE(off, 42);
    central.push(c, nameBuf);
    off += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}
// -> [[name, Buffer|null]] (null for a folder); refuses names that leave the archive's own folder
function unzip(buf) {
  const out = [];
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('The save from RomM isn’t a zip file.');
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16);
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('The save from RomM is damaged.');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    if (name.startsWith('/') || name.split('/').includes('..')) throw new Error('The save from RomM has an unsafe file name.');
    const ds = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28), raw = buf.slice(ds, ds + csize);
    out.push([name, name.endsWith('/') ? null : method === 8 ? zlib.inflateRawSync(raw) : raw]);
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
const hashArchive = (files) => hashEntries(files.map(([n, b]) => [n, b]), (b) => b);

// ---------------------------------------------------------------- 4. decide
// local: this device's hash (null: no save here); remote: { id, hash } of RomM's newest in the slot (null: none);
// base: the ledger's last agreed { hash, remoteHash } (null: never synced on this device)
function decide(local, remote, base) {
  if (!local && !remote) return 'none';
  if (local && !remote) return 'up';
  if (!local && remote) return 'down';
  if (local === remote.hash) return 'same';
  if (!base) return 'conflict'; // both have one and they differ, and this device never synced it: you choose
  const mine = local !== base.hash, theirs = remote.hash !== base.remoteHash;
  if (mine && !theirs) return 'up';
  if (!mine && theirs) return 'down';
  return 'conflict';
}

// ---------------------------------------------------------------- 5. move
// writes a downloaded archive in place: into a folder beside the save, checked, the old save backed up, then swapped
function backup(u, backupsRoot, keep = 10) {
  const ents = entriesOf(u); if (!ents.length) return null;
  const dir = path.join(backupsRoot, u.key.replace(/[^\w.-]+/g, '_'), new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'save.zip'), zip(ents));
  fs.writeFileSync(path.join(dir, 'where.json'), JSON.stringify({ key: u.key, path: u.path, kind: u.kind, files: u.files }));
  const all = ls(path.dirname(dir)).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep))) fs.rmSync(path.join(path.dirname(dir), old), { recursive: true, force: true });
  return dir;
}
function writeUnit(u, files, target, backupsRoot) {
  const kept = backup({ ...u, path: target, files: u.kind === 'files' ? files.filter(([, b]) => b).map(([n]) => n) : u.files }, backupsRoot);
  if (u.kind === 'dir') {
    const tmp = target + '.cartridge-new', old = target + '.cartridge-old';
    fs.rmSync(tmp, { recursive: true, force: true });
    for (const [n, b] of files) { const p = path.join(tmp, n); if (b == null) fs.mkdirSync(p, { recursive: true }); else { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b); } }
    fs.mkdirSync(tmp, { recursive: true });
    if (exists(target)) fs.renameSync(target, old);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(tmp, target);
    fs.rmSync(old, { recursive: true, force: true }); // it's in the backup
  } else {
    const dir = u.kind === 'file' ? path.dirname(target) : target;
    fs.mkdirSync(dir, { recursive: true });
    for (const [n, b] of files) {
      if (b == null) continue;
      const p = u.kind === 'file' ? target : path.join(dir, n), tmp = p + '.cartridge-new';
      fs.writeFileSync(tmp, b); fs.renameSync(tmp, p);
    }
  }
  return kept;
}

// is the emulator running? (never write its saves under it). procs: lines of /proc/*/cmdline
const RUN_MARK = { eden: /\beden\b/i, rpcs3: /rpcs3/i, ppsspp: /ppsspp/i, vita3k: /vita3k/i, shadps4: /shadps4/i, pcsx2: /pcsx2/i, duckstation: /duckstation/i, dolphin: /dolphin-emu|DolphinEmu/i, cemu: /\bcemu\b/i, azahar: /azahar|citra/i, xenia: /xenia/i, retroarch: /retroarch/i };
function running(emu, procs = null) {
  const re = RUN_MARK[emu]; if (!re) return false;
  const list = procs || (() => { const o = []; for (const d of ls('/proc')) if (/^\d+$/.test(d.name)) { try { o.push(fs.readFileSync(`/proc/${d.name}/cmdline`, 'utf8').replace(/\0/g, ' ')); } catch {} } return o; })();
  return list.some((c) => re.test(c) && !/cartridge|electron/i.test(c.split(' ')[0]));
}

// ---------------------------------------------------------------- the sync itself
// rpc: { list(romId, slot) -> [{ id, content_hash, updated_at }], upload(u, buf, name, { overwrite }) -> { id, content_hash },
//        download(id) -> Buffer, confirm(id, hash) } (RomM, through main.js)
// ledger: { get(key), set(key, v) }; opts: { home, extra, backupsRoot, procs, choice: 'mine'|'theirs' for a conflict,
//        dry: only say what would happen }
async function syncUnit(u, rpc, ledger, opts = {}) {
  if (u.romId == null) return { key: u.key, result: 'unmatched' };
  const remotes = (await rpc.list(u.romId, u.slot)) || [];
  const newest = remotes.slice().sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0] || null;
  const remote = newest ? { id: newest.id, hash: newest.content_hash } : null;
  const target = u.path || placeFor(u.emu, u.key, opts);
  const local = u.path ? hashUnit(u) : null;
  const base = ledger.get(u.key) || null;
  let what = decide(local, remote, base);
  if (what === 'conflict' && opts.choice) what = opts.choice === 'mine' ? 'up' : 'down';
  if (opts.dry || what === 'none') return { key: u.key, result: what };
  if (what === 'same') { ledger.set(u.key, { hash: local, remoteId: remote.id, remoteHash: remote.hash, at: Date.now() }); return { key: u.key, result: 'same' }; }
  if (what === 'conflict') return { key: u.key, result: 'conflict', local, remote };
  if ((what === 'down' || what === 'up') && running(u.emu, opts.procs)) return { key: u.key, result: 'busy' };
  if (what === 'up') {
    const ents = entriesOf(u), buf = zip(ents);
    const name = (u.key.replace(/^[^:]+:/, '').replace(/[^\w.-]+/g, '_') || 'save') + '.zip';
    const r = await rpc.upload(u, buf, name, { overwrite: !!opts.choice, hash: local });
    if (r?.conflict) return { key: u.key, result: 'conflict', local, remote };
    ledger.set(u.key, { hash: local, remoteId: r?.id ?? null, remoteHash: r?.content_hash || local, at: Date.now() });
    return { key: u.key, result: 'up' };
  }
  // down
  if (!target) return { key: u.key, result: 'unplaced' };
  const buf = await rpc.download(remote.id);
  const files = unzip(buf);
  const got = hashArchive(files);
  if (remote.hash && got !== remote.hash) return { key: u.key, result: 'damaged' }; // never write a save that doesn't match what RomM says it is
  writeUnit({ ...u, path: target }, files, target, opts.backupsRoot);
  const now = hashUnit({ ...u, path: target, files: u.kind === 'files' ? files.filter(([, b]) => b).map(([n]) => n) : u.files });
  await rpc.confirm?.(remote.id, now);
  ledger.set(u.key, { hash: now, remoteId: remote.id, remoteHash: remote.hash, at: Date.now() });
  return { key: u.key, result: 'down' };
}

// an older version from RomM, put back: downloaded and checked like any other, then uploaded as the newest, so every
// device gets it next (owner: guard rails; the save it replaces is backed up first)
async function restore(u, save, rpc, ledger, opts = {}) {
  if (running(u.emu, opts.procs)) return { key: u.key, result: 'busy' };
  const target = u.path || placeFor(u.emu, u.key, opts);
  if (!target) return { key: u.key, result: 'unplaced' };
  const files = unzip(await rpc.download(save.id));
  if (save.content_hash && hashArchive(files) !== save.content_hash) return { key: u.key, result: 'damaged' };
  writeUnit({ ...u, path: target }, files, target, opts.backupsRoot);
  const now = { ...u, path: target, files: u.kind === 'files' ? files.filter(([, b]) => b).map(([n]) => n) : u.files };
  const local = hashUnit(now), r = await rpc.upload({ ...u, path: target }, zip(entriesOf(now)), path.basename(save.file_name || 'save.zip').replace(/ \[[\d_-]+\]/, ''), { overwrite: true, hash: local });
  ledger.set(u.key, { hash: local, remoteId: r?.id ?? null, remoteHash: r?.content_hash || local, at: Date.now() });
  return { key: u.key, result: 'restored' };
}

// RomM's saves API (backend/endpoints/saves.py): base() -> the server, headers() -> sign-in headers, devId: this
// device in RomM (its sync records and the 409 on a slot another device saved since)
function rommRpc({ base, headers, devId = null, fetchImpl = fetch }) {
  const dq = devId ? { device_id: devId } : {};
  const go = async (pathname, query, init = {}) => {
    const url = new URL((await base()) + pathname);
    for (const [k, v] of Object.entries(query || {})) if (v != null) url.searchParams.set(k, String(v));
    const r = await fetchImpl(url, { ...init, headers: { ...headers(), ...(init.headers || {}) }, signal: AbortSignal.timeout(180000) });
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error('RomM didn’t let Cartridge read or write saves. Sign in with your password, or pair again so Cartridge can ask for save access.'), { code: 'auth' });
    return r;
  };
  return {
    list: async (romId, slot) => { const r = await go('/api/saves', { rom_id: romId, slot, ...dq }); if (!r.ok) throw new Error(`RomM error ${r.status} listing saves`); return r.json(); },
    upload: async (u, buf, name, { overwrite, hash } = {}) => {
      const fd = new FormData(); fd.append('saveFile', new Blob([buf], { type: 'application/zip' }), name);
      const r = await go('/api/saves', { rom_id: u.romId, emulator: u.emu, slot: u.slot, autocleanup: 'true', autocleanup_limit: 10, content_hash: hash, overwrite: overwrite ? 'true' : null, ...dq }, { method: 'POST', body: fd });
      if (r.status === 409) return { conflict: true };
      if (!r.ok) throw new Error(`RomM error ${r.status} saving ${name}`);
      return r.json();
    },
    download: async (id) => { const r = await go(`/api/saves/${id}/content`, dq); if (!r.ok) throw new Error(`RomM error ${r.status} downloading a save`); return Buffer.from(await r.arrayBuffer()); },
    confirm: async (id, hash) => { if (devId) await go(`/api/saves/${id}/downloaded`, {}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: devId, content_hash: hash }) }).catch(() => {}); },
  };
}

// units RomM has that this device doesn't (from another device), so they can be brought here: remote saves whose
// slot is ours and whose key isn't among the local units
function remoteOnly(remotes, localKeys) {
  const out = new Map();
  for (const r of remotes || []) {
    const m = /^cartridge:([^:]+):(dir|file|files):(.+)$/.exec(r.slot || '');
    if (!m || localKeys.has(m[3]) || !SUPPORTED.includes(m[1])) continue;
    const cur = out.get(m[3]);
    if (!cur || String(r.updated_at) > String(cur.updated_at)) out.set(m[3], { key: m[3], emu: m[1], kind: m[2], romId: r.rom_id, slot: r.slot, path: null, files: [], remote: true, updated_at: r.updated_at });
  }
  return [...out.values()];
}

module.exports = { rommRpc, restore, units, shape, slotOf, placeFor, entriesOf, hashEntries, hashUnit, hashArchive, changedAt, zip, unzip, decide, backup, writeUnit, running, syncUnit, remoteOnly, retroarchStates, retroarchDirs, whyUnmatched, CONSOLE, LABEL, SUPPORTED };
