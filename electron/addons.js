// Add-ons, the parts that can be checked (0.9.15, owner: "build what I can check"): where each
// emulator looks for texture packs, read from its own settings file (keys checked in its source),
// whether it has custom textures turned on, and the folder for one game. Read only: Cartridge
// never changes an emulator's settings; it only says how to turn textures on.
// - PCSX2: PCSX2.ini [Folders] Textures (default "textures" in its data folder), <serial>/replacements;
//   on: [EmuCore/GS] LoadTextureReplacements (default off).
// - DuckStation: settings.ini [Folders] Textures (default "textures"), <serial>/replacements;
//   on: [TextureReplacements] EnableTextureReplacements (default off).
// - Dolphin: Dolphin.ini [General] LoadPath (empty: Load in its user folder), Textures/<game ID>;
//   on: GFX.ini [Settings] HiresTextures (default off).
// - PPSSPP: the memory stick's PSP/TEXTURES/<game ID>; on: ppsspp.ini [Graphics] ReplaceTextures (default on).
// - Azahar (and Citra): load/textures/<title ID> in its data folder; on: qt-config.ini [Utility] custom_textures.
const fs = require('fs');
const path = require('path');
const os = require('os');

const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
function iniGet(text, section, key) {
  let inside = false;
  for (const l of String(text).split(/\r?\n/)) {
    const t = l.trim();
    if (/^\[.*\]$/.test(t)) { inside = t === `[${section}]`; continue; }
    const i = t.indexOf('=');
    if (inside && i > 0 && t.slice(0, i).trim() === key) return t.slice(i + 1).trim();
  }
  return null;
}
const truthy = (v, def) => (v == null || v === '' ? def : /^(true|1|yes)$/i.test(v));
const under = (root, v, def) => { const p = v || def; return path.isAbsolute(p) ? p : path.join(root, p); };

function emulators(home = os.homedir(), env = process.env) {
  const cfg = env.XDG_CONFIG_HOME || path.join(home, '.config');
  const data = env.XDG_DATA_HOME || path.join(home, '.local/share');
  const v = (id, ...p) => path.join(home, '.var/app', id, ...p);
  const out = [];
  const add = (e) => { if (!out.some((o) => o.root === e.root)) out.push(e); };
  for (const root of [path.join(cfg, 'PCSX2'), v('net.pcsx2.PCSX2', 'config/PCSX2')]) {
    const ini = path.join(root, 'inis', 'PCSX2.ini'); if (!exists(ini)) continue;
    const t = read(ini);
    add({ id: 'pcsx2', name: 'PCSX2', for: ['ps2'], root, settings: ini, textures: under(root, iniGet(t, 'Folders', 'Textures'), 'textures'), per: '{serial}/replacements', on: truthy(iniGet(t, 'EmuCore/GS', 'LoadTextureReplacements'), false), how: 'In PCSX2: Settings → Graphics → Texture Replacement → Load Textures.' });
  }
  for (const root of [path.join(data, 'duckstation'), v('org.duckstation.DuckStation', 'data/duckstation')]) {
    const ini = path.join(root, 'settings.ini'); if (!exists(ini)) continue;
    const t = read(ini);
    add({ id: 'duckstation', name: 'DuckStation', for: ['psx'], root, settings: ini, textures: under(root, iniGet(t, 'Folders', 'Textures'), 'textures'), per: '{serial}/replacements', on: truthy(iniGet(t, 'TextureReplacements', 'EnableTextureReplacements'), false), how: 'In DuckStation: Settings → Enhancements → Texture Replacement → Enable Texture Replacements.' });
  }
  for (const root of [path.join(cfg, 'dolphin-emu'), v('org.DolphinEmu.dolphin-emu', 'config/dolphin-emu')]) {
    const ini = path.join(root, 'Dolphin.ini'); if (!exists(ini)) continue;
    // Dolphin's user folder: config and data are split on Linux; Load lives with the data
    const dataRoot = root.includes('/.var/app/') ? root.replace(/config\/dolphin-emu$/, 'data/dolphin-emu') : path.join(data, 'dolphin-emu');
    const load = iniGet(read(ini), 'General', 'LoadPath');
    add({ id: 'dolphin', name: 'Dolphin', for: ['ngc', 'gamecube', 'wii'], root, settings: ini, textures: path.join(load || path.join(dataRoot, 'Load'), 'Textures'), per: '{gameId}', on: truthy(iniGet(read(path.join(root, 'GFX.ini')), 'Settings', 'HiresTextures'), false), how: 'In Dolphin: Graphics → Advanced → Load Custom Textures.' });
  }
  for (const root of [path.join(cfg, 'ppsspp'), v('org.ppsspp.PPSSPP', 'config/ppsspp')]) {
    const ini = path.join(root, 'PSP', 'SYSTEM', 'ppsspp.ini'); if (!exists(ini)) continue;
    add({ id: 'ppsspp', name: 'PPSSPP', for: ['psp'], root, settings: ini, textures: path.join(root, 'PSP', 'TEXTURES'), per: '{gameId}', on: truthy(iniGet(read(ini), 'Graphics', 'ReplaceTextures'), true), how: 'PPSSPP replaces textures by default (its Replace textures setting).' });
  }
  for (const [c, d] of [[path.join(cfg, 'azahar-emu'), path.join(data, 'azahar-emu')], [v('org.azahar_emu.Azahar', 'config/azahar-emu'), v('org.azahar_emu.Azahar', 'data/azahar-emu')], [path.join(cfg, 'citra-emu'), path.join(data, 'citra-emu')]]) {
    const ini = path.join(c, 'qt-config.ini'); if (!exists(ini)) continue;
    add({ id: c.includes('citra') ? 'citra' : 'azahar', name: c.includes('citra') ? 'Citra' : 'Azahar', for: ['3ds', 'n3ds'], root: d, settings: ini, textures: path.join(d, 'load', 'textures'), per: '{titleId}', on: truthy(iniGet(read(ini), 'Utility', 'custom_textures'), false), how: 'In Azahar\'s graphics settings, turn on Use Custom Textures.' });
  }
  // Switch (0.9.16): yuzu and its forks load mods from load/<TITLE ID> ([Data%20Storage] load_directory
  // in qt-config.ini, default "load" in the data folder); Ryujinx from mods/contents/<title id>
  for (const [id, name, dirName, fp] of [['eden', 'Eden', 'eden', 'dev.eden_emu.eden'], ['lichii', 'Lichii', 'lichii', null], ['citron', 'Citron', 'citron', 'org.citron_emu.citron'], ['yuzu', 'Yuzu', 'yuzu', 'org.yuzu_emu.yuzu'], ['yuzu', 'Sudachi', 'sudachi', 'org.sudachi_emu.sudachi'], ['yuzu', 'suyu', 'suyu', null]]) {
    for (const [c, d] of [[path.join(cfg, dirName), path.join(data, dirName)], ...(fp ? [[v(fp, 'config', dirName), v(fp, 'data', dirName)]] : [])]) {
      const ini = path.join(c, 'qt-config.ini'); if (!exists(ini)) continue;
      add({ id, name, for: ['switch'], root: d, settings: ini, textures: under(d, iniGet(read(ini), 'Data%20Storage', 'load_directory'), 'load'), per: '{switchId}', on: true, mods: true, how: `${name} loads every mod in the game's folder; turn single ones off in its game properties (Add-Ons).` });
    }
  }
  for (const c of [path.join(cfg, 'Ryujinx'), v('io.github.ryubing.Ryujinx', 'config/Ryujinx'), v('org.ryujinx.Ryujinx', 'config/Ryujinx')]) {
    if (!exists(path.join(c, 'Config.json'))) continue;
    add({ id: 'ryujinx', name: 'Ryujinx', for: ['switch'], root: c, settings: path.join(c, 'Config.json'), textures: path.join(c, 'mods', 'contents'), per: '{switchIdLower}', on: true, mods: true, how: 'Ryujinx loads every mod in the game\'s folder; turn single ones off in Manage Mods.' });
  }
  // Wii U: Cemu's graphic packs (all in one folder; each pack names its games in rules.txt)
  for (const [c, d] of [[path.join(cfg, 'Cemu'), path.join(data, 'Cemu')], [v('info.cemu.Cemu', 'config/Cemu'), v('info.cemu.Cemu', 'data/Cemu')]]) {
    if (!exists(path.join(c, 'settings.xml')) && !exists(path.join(d, 'graphicPacks'))) continue;
    add({ id: 'cemu', name: 'Cemu', for: ['wiiu'], root: d, settings: path.join(c, 'settings.xml'), textures: path.join(d, 'graphicPacks'), per: '', on: true, mods: true, how: 'In Cemu: Options → Graphic packs, then tick the pack.' });
  }
  for (const e of out) e.flatpak = e.root.includes('/.var/app/');
  return out;
}

// Game IDs the emulators name texture folders by
// GameCube/Wii: in cheats.js (ISO, GCM, RVZ, WIA, WBFS, CISO)
const gcWiiId = (file) => require('./cheats').gcWiiId(file);
// 3DS cartridge dump (NCSD: .3ds/.cci): partition 0's NCCH program ID, as Azahar names the folder
function n3dsTitleId(file) {
  try {
    const fd = fs.openSync(file, 'r'); const h = Buffer.alloc(0x200); fs.readSync(fd, h, 0, 0x200, 0);
    if (h.toString('latin1', 0x100, 0x104) !== 'NCSD') { fs.closeSync(fd); return null; }
    const off = h.readUInt32LE(0x120) * 0x200;
    const n = Buffer.alloc(0x200); fs.readSync(fd, n, 0, 0x200, off); fs.closeSync(fd);
    if (n.toString('latin1', 0x100, 0x104) !== 'NCCH') return null;
    return n.readBigUInt64LE(0x118).toString(16).toUpperCase().padStart(16, '0');
  } catch { return null; }
}
// PS1 serial as DuckStation names it (SLUS-00594), from SYSTEM.CNF's BOOT line: plain 2048-byte
// images, raw 2352-byte .bin (a .cue reads its first .bin), CHD (discImage) and PBP (its PARAM.SFO).
function psxSerial(file) {
  if (/\.pbp$/i.test(file)) { const id = require('./discImage').pbpDiscId(file); return id ? id.replace(/^([A-Z]{4})-?(\d{5})$/, '$1-$2') : null; }
  const cnf = require('./patches').isoFile(file, ['SYSTEM.CNF'], 4096); // .bin/.cue, CHD and ISO (discImage)
  const m = cnf && /BOOT\s*=\s*cdrom:\\?([A-Z]{4})[_-](\d{3})\.(\d{2})/i.exec(cnf.toString('latin1'));
  return m ? `${m[1].toUpperCase()}-${m[2]}${m[3]}` : null;
}
// 3DS .cia: the title ID in its TMD (after the header, certificates and ticket, each 64-byte aligned)
function ciaTitleId(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const h = Buffer.alloc(0x20); fs.readSync(fd, h, 0, 0x20, 0);
    const al = (x) => Math.ceil(x / 64) * 64;
    const tmd = al(al(al(h.readUInt32LE(0)) + h.readUInt32LE(8)) + h.readUInt32LE(0xc));
    const t = Buffer.alloc(4); fs.readSync(fd, t, 0, 4, tmd);
    const sig = { 0x10000: 0x23c, 0x10001: 0x13c, 0x10002: 0x7c, 0x10003: 0x23c, 0x10004: 0x13c, 0x10005: 0x7c }[t.readUInt32BE(0)];
    if (!sig) return null;
    const id = Buffer.alloc(8); fs.readSync(fd, id, 0, 8, tmd + 4 + sig + 0x4c);
    return id.readBigUInt64BE(0).toString(16).toUpperCase().padStart(16, '0');
  } catch { return null; } finally { if (fd != null) try { fs.closeSync(fd); } catch {} }
}
// Switch title ID: the ticket's name in an .nsp (rights ID = title ID + key generation), else one
// in the file name; an update's ID (…800) folds to its game's (…000), where mods go
// 0.9.19: .xci too, and .nsp files without a ticket: the title ID is in each NCA's header, which is
// encrypted with the console's header_key (AES-128-XTS, 0x200-byte sectors numbered big-endian, as
// hactool reads it). That key is in the user's prod.keys, which their Switch emulator already has.
function pfsEntries(fd, base) { // PFS0 (nsp) or HFS0 (xci partitions): [{ name, offset, size }]
  const h = Buffer.alloc(16); fs.readSync(fd, h, 0, 16, base);
  const magic = h.toString('latin1', 0, 4), n = h.readUInt32LE(4), strLen = h.readUInt32LE(8);
  const es = magic === 'PFS0' ? 0x18 : magic === 'HFS0' ? 0x40 : 0;
  if (!es || n > 4096 || strLen > 1 << 20) return [];
  const t = Buffer.alloc(n * es + strLen); fs.readSync(fd, t, 0, t.length, base + 16);
  const data = base + 16 + n * es + strLen, out = [];
  for (let i = 0; i < n; i++) {
    const e = i * es, off = Number(t.readBigUInt64LE(e)), size = Number(t.readBigUInt64LE(e + 8)), no = t.readUInt32LE(e + 16);
    out.push({ name: t.toString('latin1', n * es + no, t.indexOf(0, n * es + no)), offset: data + off, size });
  }
  return out;
}
// 0.9.23 (owner: Switch game IDs still not read): a key that wasn't found is looked for again next time
// (it used to be remembered as missing for good), and every place the Switch emulators keep prod.keys is
// searched, as yuzu and its forks read it (common/fs/path_util, core/crypto/key_manager: <data>/keys),
// Ryujinx (<config>/system) and hactool (~/.switch), plus the folders the caller knows (Cartridge's BIOS)
let extraRoots = []; // emulation folders Cartridge knows (config.emulationRoot), set by main
const setKeyRoots = (l) => { extraRoots = (l || []).filter(Boolean); keyTable = null; };
function keyDirs(home = os.homedir(), env = process.env) {
  const cfg = env.XDG_CONFIG_HOME || path.join(home, '.config'), data = env.XDG_DATA_HOME || path.join(home, '.local/share');
  const v = (id, ...p) => path.join(home, '.var/app', id, ...p);
  const out = [];
  for (const n of ['eden', 'lichii', 'citron', 'yuzu', 'sudachi', 'suyu', 'torzu']) out.push(path.join(data, n, 'keys'), path.join(cfg, n, 'keys'));
  for (const [id, n] of [['dev.eden_emu.eden', 'eden'], ['org.citron_emu.citron', 'citron'], ['org.yuzu_emu.yuzu', 'yuzu'], ['org.sudachi_emu.sudachi', 'sudachi']]) out.push(v(id, 'data', n, 'keys'));
  out.push(path.join(cfg, 'Ryujinx/system'), v('io.github.ryubing.Ryujinx', 'config/Ryujinx/system'), v('org.ryujinx.Ryujinx', 'config/Ryujinx/system'), path.join(home, '.switch'));
  // 0.9.29 (owner: "Eden finds the IDs of any format"): every place a keys file lives, as Eden's path_util.cpp
  // looks (portable user/keys beside the program, legacy yuzu-family folders above) plus EmuDeck's and
  // RetroDECK's BIOS folders, where people put prod.keys for their emulators to pick up
  for (const r of [path.join(home, 'Emulation'), ...extraRoots]) for (const n of ['bios/keys', 'bios/switch/keys', 'bios/yuzu/keys', 'bios/eden/keys', 'bios/citron/keys', 'bios/switch', 'bios']) out.push(path.join(r, n));
  out.push(path.join(home, 'retrodeck/bios/switch/keys'), path.join(home, 'retrodeck/bios/switch'), path.join(home, 'Applications/user/keys'));
  for (const d of [path.join(home, 'Applications'), path.join(home, 'Emulation/tools')]) { try { for (const n of fs.readdirSync(d)) out.push(path.join(d, n, 'user/keys')); } catch {} }
  return out;
}
// 0.9.30: prod.keys (and title.keys beside it, for NSPs without a ticket) as one table, from the first folder
// that has prod.keys; read again when the folders change. Reading itself is in switchNca.js, as Eden does it.
let keyTable = null;
function switchKeys(dirs = []) {
  if (keyTable) return keyTable;
  const S = require('./switchNca');
  for (const d of [...dirs, ...keyDirs()]) {
    let prod; try { prod = fs.readFileSync(path.join(d, 'prod.keys'), 'utf8'); } catch { continue; }
    const k = S.parseKeys(prod);
    if (!k.header_key) continue;
    for (const t of ['title.keys_autogenerated', 'title.keys']) { try { Object.assign(k, S.parseKeys(fs.readFileSync(path.join(d, t), 'utf8'))); } catch {} } // Eden keeps installed games' tickets in the first
    return (keyTable = k);
  }
  return null;
}
// What a Switch file holds, like Eden's game list: [{ titleId, base, type, version, display, name }]
function switchInfo(files, dirs = []) {
  const k = switchKeys(dirs);
  return k ? require('./switchNca').summary([].concat(files).filter((f) => /\.(nsp|nsz|xci|xcz)$/i.test(f)), k) : null;
}
// an update installed into a yuzu-family emulator's NAND (Eden's Install Files), newest first
function switchNandUpdate(base, dirs = []) {
  const k = switchKeys(dirs);
  if (!k || !base) return null;
  const reg = require('./bios').switchNandDirs().map((d) => d.replace(/system([\\/]Contents[\\/]registered)$/, 'user$1'));
  for (const n of ['eden', 'citron', 'yuzu', 'sudachi', 'suyu', 'torzu']) reg.push(path.join(os.homedir(), 'Emulation/storage', n, 'nand/user/Contents/registered'));
  reg.push(path.join(os.homedir(), 'Applications/user/nand/user/Contents/registered'));
  try { return require('./switchNca').nandUpdate([...new Set(reg)], base, k); } catch { return null; }
}
function switchTitleId(file, dirs = []) {
  let id = null;
  try { id = switchInfo(file, dirs)?.titleId || null; } catch {}
  // without keys: the ticket's name in an .nsp (rights ID = title ID + key generation), else one in the file name
  if (!id) {
    let fd;
    try { fd = fs.openSync(file, 'r'); id = (pfsEntries(fd, 0).map((e) => e.name).join(' ').match(/\b(01[0-9a-f]{14})[0-9a-f]{16}\.tik\b/i) || [])[1] || null; } catch {} finally { if (fd != null) try { fs.closeSync(fd); } catch {} }
  }
  id = (id || (path.basename(file).match(/\b(01[0-9A-F]{14})\b/i) || [])[1] || '').toUpperCase();
  if (!id) return null;
  return (BigInt('0x' + id) & ~0x1FFFn).toString(16).toUpperCase().padStart(16, '0'); // an update's or DLC's ID names its game
}
const fill = (per, ids) => per.replace(/\{(\w+)\}/g, (_, k) => ids[k] || '');

// One game: the folder in each emulator that can run it, with whether textures are on
function forGame(platformSlug, ids, list) {
  return list.filter((e) => e.for.includes(platformSlug)).map((e) => {
    const need = (e.per.match(/\{(\w+)\}/) || [])[1];
    const known = !need || !!ids[need];
    return { id: e.id, name: e.name, flatpak: e.flatpak, on: e.on, mods: !!e.mods, how: e.how, emuRoot: e.root, root: e.textures, folder: known ? path.join(e.textures, fill(e.per, ids)) : null, has: known && exists(path.join(e.textures, fill(e.per, ids))) };
  });
}

// Turn custom textures on (or back off) in the emulator's own settings (0.9.16, owner asked; the one
// setting Cartridge changes for texture packs). Only while the emulator is closed: it writes its
// settings back when it quits. Each key as the emulator itself writes it.
const TEX_KEY = {
  pcsx2: { file: (e) => e.settings, sec: 'EmuCore/GS', key: 'LoadTextureReplacements', on: 'true', off: 'false' },
  duckstation: { file: (e) => e.settings, sec: 'TextureReplacements', key: 'EnableTextureReplacements', on: 'true', off: 'false' },
  dolphin: { file: (e) => path.join(e.root, 'GFX.ini'), sec: 'Settings', key: 'HiresTextures', on: 'True', off: 'False' },
  ppsspp: { file: (e) => e.settings, sec: 'Graphics', key: 'ReplaceTextures', on: 'True', off: 'False' },
  // Qt keeps "<name>\default": while it says true, the value is ignored, so it goes false too
  azahar: { file: (e) => e.settings, sec: 'Utility', key: 'custom_textures', on: 'true', off: 'false', qt: true },
  citra: { file: (e) => e.settings, sec: 'Utility', key: 'custom_textures', on: 'true', off: 'false', qt: true },
};
function setTextures(e, on) {
  const k = TEX_KEY[e.id];
  if (!k) throw new Error(`${e.name} can't be switched from Cartridge.`);
  const { iniSet } = require('./raLogin');
  const f = k.file(e);
  let text = ''; try { text = fs.readFileSync(f, 'utf8'); } catch {}
  const pairs = { [k.key]: on ? k.on : k.off, ...(k.qt ? { [`${k.key}\\default`]: 'false' } : {}) };
  const tmp = f + '.cartridge-tmp';
  let out = iniSet(text, k.sec, pairs);
  if (k.qt) out = out.replace(new RegExp(`^(${k.key}(?:\\\\default)?) = `, 'gm'), '$1='); // Qt's own key=value, no spaces
  fs.writeFileSync(tmp, out); fs.renameSync(tmp, f);
  return true;
}

module.exports = { emulators, forGame, gcWiiId, n3dsTitleId, psxSerial, ciaTitleId, switchTitleId, switchInfo, switchKeys, switchNandUpdate, setKeyRoots, keyDirs, pfsEntries, iniGet, setTextures, TEX_KEY };
