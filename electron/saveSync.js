'use strict';
// Cartridge Save Sync (0.9.51): your saves kept on your own RomM server and brought to every device you play on.
// Not Syncthing (that is the other choice in Saves and Sync; a device uses one or the other, never both).
//
// The engine, in the order a save goes through it:
// 1. Units: what one save is. Built from the saves scanner (saves.js knows each emulator's layout) plus RetroArch
//    save states per core. Three shapes: a folder per game (Switch, PS3, PSP, Vita, PS4, Wii, Wii U, 3DS, Xbox 360),
//    a file per game (RetroArch, DuckStation per-game cards, Dolphin .gci), and a whole memory card (PCSX2, shared
//    DuckStation and Dolphin cards), kept whole on the console's carrier game (owner: "do the whole card").
//    Switch saves: Eden and the yuzu family (0.9.58; Ryujinx keeps saves by a per-device index, so not Ryujinx).
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
// 0.9.58: the Eden/yuzu family keep Switch saves the same way (nand/user/save/<user>/<title ID>), so all of them sync
const SWITCH_FAMILY = ['eden', 'citron', 'yuzu', 'sudachi', 'suyu', 'torzu'];
const CONSOLE = { eden: 'switch', citron: 'switch', yuzu: 'switch', sudachi: 'switch', suyu: 'switch', torzu: 'switch', rpcs3: 'ps3', ppsspp: 'psp', vita3k: 'psvita', shadps4: 'ps4', pcsx2: 'ps2', duckstation: 'psx', dolphin: 'ngc', cemu: 'wiiu', azahar: '3ds', xenia: 'xbox360', retroarch: null };
const SUPPORTED = Object.keys(CONSOLE);
const LABEL = { eden: 'Eden', citron: 'Citron', yuzu: 'yuzu', sudachi: 'Sudachi', suyu: 'suyu', torzu: 'torzu', rpcs3: 'RPCS3', ppsspp: 'PPSSPP', vita3k: 'Vita3K', shadps4: 'shadPS4', pcsx2: 'PCSX2', duckstation: 'DuckStation', dolphin: 'Dolphin', cemu: 'Cemu', azahar: 'Azahar', xenia: 'Xenia', retroarch: 'RetroArch' };
// One slot per game per console (0.9.58, owner: "fix this as a top priority, I don't want mistakes"): a save's slot in
// RomM was named after the emulator ("cartridge:eden:…"), so Eden on one device and Citron (or any renamed build) on
// another never met. The slot now names the console family; slots written the old way are still read (FAMILY maps
// both an emulator and a family to the family), so nothing already in RomM is lost.
const FAMILY = { eden: 'switch', citron: 'switch', yuzu: 'switch', sudachi: 'switch', suyu: 'switch', torzu: 'switch', switch: 'switch', rpcs3: 'ps3', ps3: 'ps3', ppsspp: 'psp', psp: 'psp', vita3k: 'vita', vita: 'vita', shadps4: 'ps4', ps4: 'ps4', pcsx2: 'ps2', ps2: 'ps2', duckstation: 'ps1', ps1: 'ps1', dolphin: 'gc', gc: 'gc', cemu: 'wiiu', wiiu: 'wiiu', azahar: '3ds', '3ds': '3ds', xenia: 'x360', x360: 'x360', retroarch: 'retroarch' };
const familyOf = (x) => FAMILY[x] || x;
const MEMBERS = (fam) => SUPPORTED.filter((e) => familyOf(e) === fam);
const FAMILY_LABEL = { switch: 'Switch', ps3: 'RPCS3', psp: 'PPSSPP', vita: 'Vita3K', ps4: 'shadPS4', ps2: 'PCSX2', ps1: 'DuckStation', gc: 'Dolphin', wiiu: 'Cemu', '3ds': 'Azahar', x360: 'Xenia', retroarch: 'RetroArch' };
const labelOf = (x) => LABEL[x] || FAMILY_LABEL[x] || x;
// The RomM consoles each family's saves belong to (0.9.60, owner: "you have not accounted for games that are on multiple
// platforms"). A game can be in the library on several consoles under one name (Ratchet & Clank: Size Matters on PSP
// and PS2); a save is only ever filed under, matched to or shown for a game of its own console. RetroArch plays many
// consoles: any game fits.
const FAMILY_SLUGS = { switch: /^switch$/, ps3: /^ps3$/, psp: /^psp$/, vita: /^(psvita|vita)$/, ps4: /^ps4$/, ps2: /^ps2$/, ps1: /^(psx|ps1|ps)$/, gc: /^(ngc|gc|gamecube|wii)$/, wiiu: /^wiiu$/, '3ds': /^(3ds|n3ds|new-nintendo-3ds)$/, x360: /^xbox-?360$/ };
// does a game with these RomM slugs fit a save of this emulator or family? unknown slugs fit (nothing to go on)
function fitsConsole(emuOrFamily, slugs) {
  const re = FAMILY_SLUGS[familyOf(emuOrFamily)]; if (!re) return true;
  const list = [].concat(slugs || []).filter(Boolean);
  return !list.length || list.some((x) => re.test(String(x).toLowerCase()));
}
// opts.slugsOf(romId) -> the game's RomM slugs, or null when it isn't in the library
const fitsRom = (emu, romId, opts) => romId != null && (!opts?.slugsOf || fitsConsole(emu, opts.slugsOf(romId)));
// "cartridge:<family or emulator>:<kind>:<key>" -> { family, kind, key } (null: not one of Cartridge's)
function parseSlot(slot) { const m = /^cartridge:([^:]+):(dir|file|files):(.+)$/.exec(slot || ''); return m ? { family: familyOf(m[1]), kind: m[2], key: m[3] } : null; }
// RomM's saves for this unit: the same key in the same console family, under any game and any slot spelling
const remotesFor = (all, u) => (all || []).filter((r) => { const p = parseSlot(r.slot); return p && p.key === u.key && p.family === familyOf(u.emu); });

// one scanned save -> { key, kind: dir|file, layout, keyPart } or null (not synced)
function shape(s) {
  const p = s.path, b = path.basename(p);
  switch (s.emu) {
    case 'eden': case 'citron': case 'yuzu': case 'sudachi': case 'suyu': case 'torzu': { const m = /nand\/user\/save\/(0000000000000000\/[^/]+|account\/[^/]+)\/([0-9A-Fa-f]{16})$/.exec(p); return m ? { key: 'switch:' + m[2].toUpperCase(), kind: 'dir' } : null; }
    case 'rpcs3': return { key: 'ps3:' + b, kind: 'dir' };
    case 'ppsspp': return { key: 'psp:' + b, kind: 'dir' };
    case 'vita3k': return { key: 'vita:' + b, kind: 'dir' };
    case 'shadps4': return { key: 'ps4:' + b, kind: 'dir' };
    case 'pcsx2': return { key: 'ps2card:' + b, kind: isDir(p) ? 'dir' : 'file', card: true };
    case 'duckstation': return { key: 'ps1card:' + b, kind: 'file', card: !!s.shared };
    case 'dolphin':
      // region: the card's region folder (0.9.59: read by the scanner, as custom GCI folders hold one region each)
      if (s.kind === 'card') return { key: 'gccard:' + (s.region || path.basename(path.dirname(p))) + '/' + b, kind: 'file', card: true };
      if (/\/title\/00010000\/[0-9a-f]{8}\/data$/i.test(p)) return { key: 'wii:' + path.basename(path.dirname(p)).toLowerCase(), kind: 'dir' };
      return { key: 'gc:' + (s.region || path.basename(path.dirname(path.dirname(p)))) + '/' + b, kind: 'file' };
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
// 0.9.59: only saves where the emulator reads them now (the save locator's 'use'); old copies are listed, not synced.
// Two copies of one save in use (a Flatpak and an AppImage of one emulator): the newest is synced, the others are
// named on it (others) so you can see why.
// matches: { [key]: romId } saves you matched by hand (0.9.60, "Probably …" confirmed), used when they fit the console
function units({ home = os.homedir(), extra = {}, extraAt = {}, games = [], carriers = {}, nameOf = null, matches = {} } = {}) {
  const scanned = S.scan({ home, extra, extraAt, withSize: false, oldToo: false }).filter((s) => SUPPORTED.includes(s.emu) && s.loc === 'use');
  for (const s of scanned) if (s.emu === 'retroarch') { const { saves } = retroarchDirs(s.base); s.rel = path.relative(saves, s.path); }
  const ra = [...new Set(scanned.filter((s) => s.emu === 'retroarch').map((s) => s.base))];
  for (const emu of ['retroarch']) for (const d of S.DATA[emu]) { const b = path.join(home, d); if (isDir(b) && !ra.includes(b)) ra.push(b); }
  const states = ra.flatMap(retroarchStates);
  S.match(scanned, games, { nameOf }); S.match(states, games, { nameOf });
  const out = [], seen = new Set();
  for (const s of scanned) {
    const sh = shape(s); if (!sh) continue;
    const romId = sh.card ? carriers[CONSOLE[s.emu]] ?? s.romIds?.[0] ?? null : s.romIds?.[0] ?? null;
    const u = { key: sh.key, emu: s.emu, kind: sh.kind, path: s.path, base: s.base, label: s.label || '', sub: s.sub || '', romId, romIds: s.romIds || [], card: !!sh.card, slot: slotOf(s.emu, sh.key, sh.kind), ...(s.loose ? { loose: true } : {}) }; // romIds: every game on a card (0.9.57, the game sheet)
    const mine = matches[sh.key];
    if (mine != null && !sh.card && games.some((g) => g.id === mine && fitsConsole(s.emu, g.slug))) { u.romId = mine; u.romIds = [mine]; u.byHand = true; }
    if (u.romId == null) { u.why = whyUnmatched(s, sh); if (!sh.card) u.likely = S.likely(s, games, { nameOf }); }
    const twin = out.find((x) => x.key === u.key && !x.states);
    if (twin) { // another copy of the same save: keep the newest
      const a = changedAt(twin), b = changedAt(u);
      const [keep, other] = b > a ? [u, twin] : [twin, u];
      keep.others = [...(twin.others || []), { path: other.path, emu: other.emu, at: Math.min(a, b) }];
      if (keep === u) out[out.indexOf(twin)] = u;
      continue;
    }
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
  if (id) return { code: 'id', id: String(id).toUpperCase(), title: k.title || s.codeName || '', console: con }; // codeName: from the emulators' game databases (0.9.57)
  const name = k.title || k.name || '';
  if (name) return { code: 'name', name, console: con };
  return { code: 'none', console: con };
}
// RomM's slot for a unit: names the save so every device finds the same one (255 characters at most)
const slotOf = (emu, key, kind) => `cartridge:${familyOf(emu)}:${kind}:${key}`.slice(0, 255);

// ---------------------------------------------------------------- 2. place on this device
// where a unit goes here when this device doesn't have it yet; null when it can't be placed safely (the emulator
// hasn't made its folders yet: run it once)
// 0.9.59: from the save locator's places in use (the emulator's own settings), folders you picked first
function placeFor(emu, key, { home = os.homedir(), extra = {}, extraAt = {} } = {}) {
  const bases = [...(extra[emu] || []), ...(S.DATA[emu] || []).map((d) => path.join(home, d))].filter(isDir);
  const spots = [...(extraAt[emu] || []).map((x) => ({ b: x.base || S.placeDir(x.at, ''), at: x.at || {} })), ...bases.flatMap((b) => { let ws = []; try { ws = S.whereOf(emu)(b); } catch {} return ws.filter((w) => w.loc === 'use').map((w) => ({ b, at: w.at || {} })); })];
  const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  const firstDir = (d) => S.ls(d).filter((e) => e.isDirectory()).map((e) => path.join(d, e.name))[0] || null;
  for (const { b, at } of spots) {
    switch (kind) {
      case 'switch': { const u = firstDir(path.join(at.nand || path.join(b, 'nand'), 'user/save/0000000000000000')); if (u) return path.join(u, id); break; }
      case 'ps3': { const hdd = at.hdd0 || path.join(b, 'dev_hdd0'); if (isDir(path.join(hdd, 'home/00000001'))) return path.join(hdd, 'home/00000001/savedata', id); break; }
      case 'psp': if (isDir(path.join(b, 'PSP'))) return path.join(b, 'PSP/SAVEDATA', id); break;
      case 'vita': { const pref = at.pref || b; if (isDir(path.join(pref, 'ux0'))) return path.join(pref, 'ux0/user/00/savedata', id); break; }
      // shadPS4: <home>/<user ID>/savedata on current builds; older builds' savedata/<user ID>
      case 'ps4': {
        const sd = (at.savedata || S.shadSaveDirs(b))[0]; if (!sd) break;
        if (/[\/]home[\/][^\/]+[\/]savedata$/.test(sd)) { if (isDir(path.dirname(sd))) return path.join(sd, id); break; }
        if (!isDir(sd)) break;
        const u = S.ls(sd).find((e) => e.isDirectory() && !S.PS4_ID.test(e.name));
        return path.join(sd, u ? u.name : '1', id);
      }
      case 'ps2card': case 'ps1card': { const md = at.memcards || path.join(b, 'memcards'); if (isDir(md)) return path.join(md, id); break; }
      case 'gccard': case 'gc': {
        const [region, file] = id.split('/');
        const own = kind === 'gc' && (at.gci || []).find((d) => path.basename(d) === region);
        if (own) return path.join(own, file);
        const gc = at.gc === undefined ? path.join(b, 'GC') : at.gc;
        if (gc && isDir(path.join(gc, region))) return kind === 'gc' ? path.join(gc, region, 'Card A', file) : path.join(gc, region, file);
        break;
      }
      case 'wii': { const w = at.wii || path.join(b, 'Wii'); if (isDir(path.join(w, 'title'))) return path.join(w, 'title/00010000', id, 'data'); break; }
      case 'wiiu': { const mlc = at.mlc || path.join(b, 'mlc01'); if (isDir(path.join(mlc, 'usr'))) return path.join(mlc, 'usr/save/00050000', id); break; }
      case '3ds': { const n = path.join(at.sdmc || path.join(b, 'sdmc'), 'Nintendo 3DS'), a = firstDir(n), c = a && firstDir(a); if (c) return path.join(c, 'title/00040000', id, 'data'); break; }
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
  // a save reached through a link (a folder moved to another drive and linked back) is written where it really is,
  // so the link stays and the save doesn't land on this drive instead (0.9.59)
  try { target = fs.realpathSync(target); } catch { try { target = path.join(fs.realpathSync(path.dirname(target)), path.basename(target)); } catch {} }
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
const SW_RUN = /\b(eden|citron|yuzu|sudachi|suyu|torzu)\b/i; // any of the family: Linked Folders can give them one save folder
const RUN_MARK = { eden: SW_RUN, citron: SW_RUN, yuzu: SW_RUN, sudachi: SW_RUN, suyu: SW_RUN, torzu: SW_RUN, rpcs3: /rpcs3/i, ppsspp: /ppsspp/i, vita3k: /vita3k/i, shadps4: /shadps4/i, pcsx2: /pcsx2/i, duckstation: /duckstation/i, dolphin: /dolphin-emu|DolphinEmu/i, cemu: /\bcemu\b/i, azahar: /azahar|citra/i, xenia: /xenia/i, retroarch: /retroarch/i };
// 0.9.58: judged by the program actually running, never by text anywhere in a command line. Matching "eden" anywhere
// counted a file manager, an editor, a shell or a script naming a path with "eden" in it as Eden being open, and that
// save was skipped as "busy" every time. A process counts when its program (argv[0]) is the emulator (an AppImage, its
// program inside the AppImage's mount, a distro package), or when it's flatpak/bwrap running the emulator's app ID.
// procs (tests): command lines as strings (split at spaces) or arrays of arguments.
const WRAPPERS = /^(flatpak|bwrap|flatpak-spawn|wine|wine64|wine-preloader|wine64-preloader|proton)$/i; // what runs an emulator for it (Flatpaks, Windows builds through Proton)
function running(emu, procs = null) {
  const re = RUN_MARK[emu]; if (!re) return false;
  const list = procs ? procs.map((c) => (Array.isArray(c) ? c : String(c).split(' '))) : (() => { const o = []; for (const d of ls('/proc')) if (/^\d+$/.test(d.name)) { try { o.push(fs.readFileSync(`/proc/${d.name}/cmdline`, 'utf8').split('\0').filter(Boolean)); } catch {} } return o; })();
  return list.some((argv) => {
    const prog = path.basename(argv[0] || '');
    if (/cartridge|electron/i.test(prog)) return false;
    const is = (x) => re.test(x) || re.test(x.replace(/[-_.]/g, ' '));
    if (is(prog)) return true;
    // flatpak run org.x.Emu / bwrap … / wine xenia_canary.exe: the app ID or the program it starts
    return WRAPPERS.test(prog) && argv.slice(1).some((a) => !a.startsWith('-') && is(path.basename(a)));
  });
}

// ---------------------------------------------------------------- the sync itself
// rpc: { list(romId, slot) -> [{ id, content_hash, updated_at }], upload(u, buf, name, { overwrite }) -> { id, content_hash },
//        download(id) -> Buffer, confirm(id, hash) } (RomM, through main.js)
// ledger: { get(key), set(key, v) }; opts: { home, extra, backupsRoot, procs, choice: 'mine'|'theirs' for a conflict,
//        dry: only say what would happen }
// opts.remotes: every one of Cartridge's saves in RomM, read once per sync (0.9.58). A save is found by its key and
// console family under any game: the two devices may have matched the game to different RomM entries (a game and its
// update file), and looking only under this device's entry made each device keep its own copy, never meeting.
const ts = (v) => (typeof v === 'number' ? v : Date.parse(v) || 0);
async function remotesOf(u, rpc, opts) {
  if (opts.remotes) return remotesFor(opts.remotes, u);
  return remotesFor(rpc.listAll ? await rpc.listAll() : await rpc.list(u.romId, u.slot), u);
}
// is an emulator of this unit's family set up here? (why a save from another device can't be put in place)
const hasEmu = (emu, { home = os.homedir(), extra = {}, extraAt = {} } = {}) => (extraAt[emu] || []).length > 0 || [...(extra[emu] || []), ...(S.DATA[emu] || []).map((d) => path.join(home, d))].some(isDir);
async function syncUnit(u, rpc, ledger, opts = {}) {
  if (u.romId == null && !u.remote) return { key: u.key, result: 'unmatched' };
  const remotes = await remotesOf(u, rpc, opts);
  const newest = remotes.slice().sort((a, b) => ts(b.updated_at) - ts(a.updated_at) || (b.id || 0) - (a.id || 0))[0] || null;
  const remote = newest ? { id: newest.id, hash: newest.content_hash, romId: newest.rom_id ?? null, emulator: newest.emulator || null } : null;
  // 0.9.60: the RomM entry this save lives under, only when that game is on the save's console; a save filed under a
  // game of another console (matched by name before 0.9.59) is filed again under this device's game of the right one
  const home = remote && fitsRom(u.emu, remote.romId, opts) ? remote.romId : u.romId;
  const misfiled = !!remote && remote.romId != null && home !== remote.romId && u.romId != null && fitsRom(u.emu, u.romId, opts);
  const target = u.path || placeFor(u.emu, u.key, opts);
  const local = u.path ? hashUnit(u) : null;
  const base = ledger.get(u.key) || null;
  let what = decide(local, remote, base);
  if (what === 'conflict' && opts.choice) what = opts.choice === 'mine' ? 'up' : 'down';
  if (opts.dry || what === 'none') return { key: u.key, result: what };
  if (what === 'same' && misfiled && local) { // the same save, under the wrong game: put it under the right one too (nothing deleted in RomM)
    const r = await rpc.upload({ ...u, romId: home }, zip(entriesOf(u)), (u.key.replace(/^[^:]+:/, '').replace(/[^\w.-]+/g, '_') || 'save') + '.zip', { overwrite: true, hash: local });
    ledger.set(u.key, { hash: local, remoteId: r?.id ?? null, remoteHash: r?.content_hash || local, at: Date.now() });
    return { key: u.key, result: 'refiled', from: remote.romId, to: home };
  }
  if (what === 'same') { ledger.set(u.key, { hash: local, remoteId: remote.id, remoteHash: remote.hash, at: Date.now() }); return { key: u.key, result: 'same' }; }
  if (what === 'conflict') return { key: u.key, result: 'conflict', local, remote };
  if ((what === 'down' || what === 'up') && running(u.emu, opts.procs)) return { key: u.key, result: 'busy' };
  if (what === 'up') {
    const ents = entriesOf(u), buf = zip(ents);
    const name = (u.key.replace(/^[^:]+:/, '').replace(/[^\w.-]+/g, '_') || 'save') + '.zip';
    // into the RomM entry that already holds this save, so every device's copies stay together (0.9.58)
    const r = await rpc.upload({ ...u, romId: home ?? u.romId }, buf, name, { overwrite: !!opts.choice || misfiled, hash: local });
    if (r?.conflict) return { key: u.key, result: 'conflict', local, remote };
    ledger.set(u.key, { hash: local, remoteId: r?.id ?? null, remoteHash: r?.content_hash || local, at: Date.now() });
    return { key: u.key, result: 'up' };
  }
  // down
  if (!target) return { key: u.key, result: 'unplaced', why: hasEmu(u.emu, opts) ? 'nofolder' : 'noemu' };
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
  if (!target) return { key: u.key, result: 'unplaced', why: hasEmu(u.emu, opts) ? 'nofolder' : 'noemu' };
  const files = unzip(await rpc.download(save.id));
  if (save.content_hash && hashArchive(files) !== save.content_hash) return { key: u.key, result: 'damaged' };
  writeUnit({ ...u, path: target }, files, target, opts.backupsRoot);
  const now = { ...u, path: target, files: u.kind === 'files' ? files.filter(([, b]) => b).map(([n]) => n) : u.files };
  const local = hashUnit(now), r = await rpc.upload({ ...u, path: target, romId: save.rom_id ?? u.romId }, zip(entriesOf(now)), path.basename(save.file_name || 'save.zip').replace(/ \[[\d_-]+\]/, ''), { overwrite: true, hash: local });
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
    list: async (romId, slot) => { const r = await go('/api/saves', { rom_id: romId, slot, ...dq }); if (!r.ok) throw new Error(`RomM error ${r.status} listing saves`); const j = await r.json(); return Array.isArray(j) ? j : j?.items || []; },
    // every save of Cartridge's under every game (0.9.58: saves are found by key, not by this device's RomM entry)
    listAll: async () => { const r = await go('/api/saves', { ...dq }); if (!r.ok) throw new Error(`RomM error ${r.status} listing saves`); const j = await r.json(); return (Array.isArray(j) ? j : j?.items || []).filter((x) => parseSlot(x.slot)); },
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

// Move saves from an old place (or one the search found) into the place the emulator uses now (0.9.59, Where Your
// Saves Are → Move). For each save: the copy in use is kept when it's newer (nothing to move), else it's backed up and
// the old copy is written in its place, checked by hash, and the old copy is renamed "<name>.cartridge-moved" so it no
// longer shows as a second copy. Nothing is deleted. Never while the emulator is open.
// saves: scanned saves ({ emu, kind, path, region… }); opts as placeFor plus backupsRoot, procs
function moveInto(saves, opts = {}) {
  const out = [];
  for (const s of saves) {
    const sh = shape(s);
    if (!sh || sh.kind === 'files') { out.push({ path: s.path, result: 'skipped' }); continue; }
    if (running(s.emu, opts.procs)) { out.push({ path: s.path, key: sh.key, result: 'busy' }); continue; }
    const target = placeFor(s.emu, sh.key, opts);
    if (!target) { out.push({ path: s.path, key: sh.key, result: 'unplaced' }); continue; }
    let realS = s.path, realT = target; try { realS = fs.realpathSync(s.path); } catch {} try { realT = fs.realpathSync(target); } catch {}
    if (realS === realT) { out.push({ path: s.path, key: sh.key, result: 'same' }); continue; }
    const from = { key: sh.key, kind: sh.kind, path: s.path }, to = { key: sh.key, kind: sh.kind, path: target };
    if (exists(target) && changedAt(to) >= changedAt(from)) { out.push({ path: s.path, key: sh.key, target, result: 'newer' }); continue; }
    const files = entriesOf(from).map(([n, p]) => [n, p ? fs.readFileSync(p) : null]);
    const want = hashUnit(from);
    writeUnit(to, files, target, opts.backupsRoot);
    if (hashUnit(to) !== want) { out.push({ path: s.path, key: sh.key, target, result: 'error', error: 'The copy didn’t match the original.' }); continue; }
    try { fs.renameSync(s.path, s.path + '.cartridge-moved'); } catch {}
    out.push({ path: s.path, key: sh.key, target, result: 'moved' });
  }
  return out;
}

// units RomM has that this device doesn't (from another device), so they can be brought here: remote saves whose
// slot is ours and whose key isn't among the local units
function remoteOnly(remotes, localKeys, opts = {}) {
  const out = new Map();
  for (const r of remotes || []) {
    const p = parseSlot(r.slot);
    if (!p || localKeys.has(p.key)) continue;
    // 0.9.58: the slot names a console family; the save goes to this device's emulator of that family (the one set up
    // here, Eden first for Switch), else the family's first, which then says it isn't set up
    const members = MEMBERS(p.family);
    if (!members.length) continue;
    const emu = members.find((e) => hasEmu(e, opts)) || members[0];
    const cur = out.get(p.key);
    if (!cur || ts(r.updated_at) > ts(cur.updated_at)) out.set(p.key, { key: p.key, emu, kind: p.kind, romId: fitsRom(emu, r.rom_id, opts) ? r.rom_id : cur?.romId ?? null, slot: slotOf(emu, p.key, p.kind), path: null, files: [], remote: true, updated_at: r.updated_at });
    else if (cur.romId == null && fitsRom(emu, r.rom_id, opts)) cur.romId = r.rom_id;
  }
  return [...out.values()];
}

module.exports = { FAMILY_SLUGS, fitsConsole, fitsRom, moveInto, FAMILY, familyOf, parseSlot, remotesFor, SWITCH_FAMILY, labelOf, rommRpc, restore, units, shape, slotOf, placeFor, entriesOf, hashEntries, hashUnit, hashArchive, changedAt, zip, unzip, decide, backup, writeUnit, running, syncUnit, remoteOnly, retroarchStates, retroarchDirs, whyUnmatched, CONSOLE, LABEL, SUPPORTED };
