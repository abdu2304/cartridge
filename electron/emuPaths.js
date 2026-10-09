// An emulator's own folders (0.9.24, owner: open an emulator in Settings and see where its games, DLC,
// updates, saves and textures live, open them, and move them somewhere else, written back to the emulator).
// Read and written in each emulator's own settings file, in its own format, only the line for that folder:
// PCSX2 and DuckStation (ini, [Folders] and friends, game folders as repeated RecursivePaths), Dolphin
// (Dolphin.ini [General] LoadPath/NANDRootPath..., ISOPath0..N + ISOPaths), yuzu family and Azahar
// (qt-config.ini [Data%20Storage] x and x\default=false), Ryujinx (Config.json game_dirs), Cemu
// (settings.xml mlc_path), RPCS3 (vfs.yml, $(EmulatorDir) relative), shadPS4 (config.toml [GUI]), Vita3K
// (config.yml pref-path). Changing a folder never moves files: what's there stays, and the screen says so.
const fs = require('fs');
const os = require('os');
const path = require('path');

const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- ini: values of a key in a section (several when the key repeats), and setting one in place
function iniAll(text, sec, key) {
  const out = []; let cur = '';
  for (const raw of String(text || '').split(/\r?\n/)) {
    const l = raw.trim(), m = /^\[(.+)\]$/.exec(l);
    if (m) { cur = m[1]; continue; }
    if (cur !== sec) continue;
    const i = l.indexOf('=');
    if (i > 0 && l.slice(0, i).trim() === key) out.push(l.slice(i + 1).trim().replace(/^"(.*)"$/, '$1'));
  }
  return out;
}
const iniOne = (t, s, k) => iniAll(t, s, k)[0];
// every line of the key in the section replaced by these values (in order), or added at the section's end
function iniSet(text, sec, key, values) {
  const lines = String(text || '').split('\n'), out = [];
  let cur = '', placed = false, sawSec = false;
  const put = () => { if (!placed) { for (const v of values) out.push(`${key} = ${v}`); placed = true; } };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim(), m = /^\[(.+)\]$/.exec(l);
    if (m) { if (cur === sec) put(); cur = m[1]; if (cur === sec) sawSec = true; out.push(lines[i]); continue; }
    const j = l.indexOf('=');
    if (cur === sec && j > 0 && l.slice(0, j).trim() === key) { put(); continue; }
    out.push(lines[i]);
  }
  if (cur === sec) { while (out.length && out[out.length - 1].trim() === '') out.pop(); put(); out.push(''); }
  if (!sawSec) { if (out.length && out[out.length - 1].trim() !== '') out.push(''); out.push(`[${sec}]`); put(); out.push(''); }
  return out.join('\n');
}
// Qt's ini (yuzu family, Azahar): "key=value" with no spaces, and a "key\default=false" beside it
function qtSet(text, sec, key, value) {
  let t = iniSet(text, sec, key, [value]).replace(new RegExp(`^${esc(key)} = `, 'm'), `${key}=`);
  t = iniSet(t, sec, `${key}\\default`, ['false']).replace(new RegExp(`^${esc(key)}\\\\default = `, 'm'), `${key}\\default=`);
  return t;
}
// ---- one "key: value" line (RPCS3's vfs.yml, Vita3K's config.yml) and one TOML "key = value"
const ymlLine = (text, key) => { const m = new RegExp(`^${esc(key)}:\\s*(.*)$`, 'm').exec(text || ''); return m ? m[1].trim().replace(/^"(.*)"$/, '$1') : undefined; };
const ymlLineSet = (text, key, v) => (new RegExp(`^${esc(key)}:.*$`, 'm').test(text || '') ? text.replace(new RegExp(`^${esc(key)}:.*$`, 'm'), `${key}: ${v}`) : `${(text || '').replace(/\n*$/, '\n')}${key}: ${v}\n`);
function tomlGet(text, sec, key) {
  let cur = '';
  for (const raw of String(text || '').split(/\r?\n/)) {
    const l = raw.trim(), m = /^\[(.+)\]$/.exec(l);
    if (m) { cur = m[1]; continue; }
    if (cur !== sec) continue;
    const r = new RegExp(`^${esc(key)}\\s*=\\s*(.*)$`).exec(l);
    if (!r) continue;
    const v = r[1].trim();
    if (v.startsWith('[')) { try { return JSON.parse(v.replace(/'/g, '"')); } catch { return [...v.matchAll(/"([^"]*)"/g)].map((x) => x[1]); } }
    return v.replace(/^"(.*)"$/, '$1');
  }
  return undefined;
}
function tomlSet(text, sec, key, value) {
  const v = Array.isArray(value) ? `[${value.map((x) => JSON.stringify(x)).join(', ')}]` : JSON.stringify(value);
  const lines = String(text || '').split('\n'); let cur = '', done = false, secAt = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim(), m = /^\[(.+)\]$/.exec(l);
    if (m) { if (cur === sec && !done) { lines.splice(i, 0, `${key} = ${v}`); done = true; break; } cur = m[1]; if (cur === sec) secAt = i; continue; }
    if (cur === sec && new RegExp(`^${esc(key)}\\s*=`).test(l)) { lines[i] = `${key} = ${v}`; done = true; break; }
  }
  if (!done) { if (secAt >= 0) lines.push(`${key} = ${v}`); else lines.push('', `[${sec}]`, `${key} = ${v}`); }
  return lines.join('\n');
}

// The folders each emulator has: [id, label, what's kept there]
const ROWS = {
  pcsx2: [['Folders.Bios', 'BIOS', 'PS2 BIOS files'], ['Folders.MemoryCards', 'Memory Cards', 'Your saves'], ['Folders.Savestates', 'Save States'], ['Folders.Textures', 'Textures', 'Texture packs, by game serial'], ['Folders.Cheats', 'Cheats and Patches'], ['Folders.Snapshots', 'Screenshots'], ['GameList.RecursivePaths', 'Game Folders', 'Where PCSX2 looks for games', 'list']],
  duckstation: [['BIOS.SearchDirectory', 'BIOS', 'PS1 BIOS files'], ['MemoryCards.Directory', 'Memory Cards', 'Your saves'], ['Folders.SaveStates', 'Save States'], ['Folders.Textures', 'Textures', 'Texture packs, by game serial'], ['Folders.Cheats', 'Cheats'], ['Folders.Covers', 'Covers'], ['GameList.RecursivePaths', 'Game Folders', 'Where DuckStation looks for games', 'list']],
  dolphin: [['General.ISOPath', 'Game Folders', 'Where Dolphin looks for games', 'isolist'], ['General.LoadPath', 'Load', 'Texture packs, graphics mods and Riivolution'], ['General.NANDRootPath', 'Wii NAND', 'Wii saves, channels and installed WAD games'], ['General.WiiSDCardPath', 'Wii SD Card'], ['General.DumpPath', 'Dumps'], ['General.ResourcePackPath', 'Resource Packs']],
  yuzu: [['Data%20Storage.nand_directory', 'NAND', 'Installed updates, DLC and saves'], ['Data%20Storage.sdmc_directory', 'SD Card'], ['Data%20Storage.load_directory', 'Mods (load)', 'Mods and texture packs, by title ID'], ['Data%20Storage.dump_directory', 'Dumps']],
  azahar: [['Data%20Storage.nand_directory', 'NAND', 'System files and saves'], ['Data%20Storage.sdmc_directory', 'SD Card', 'Installed games, updates and DLC']],
  ryujinx: [['game_dirs', 'Game Folders', 'Where Ryujinx looks for games', 'jsonlist']],
  cemu: [['mlc_path', 'MLC', 'Installed games, updates and DLC, and saves']],
  rpcs3: [['/dev_hdd0/', 'Internal Drive (dev_hdd0)', 'Installed games, updates, DLC, saves and trophies'], ['/dev_hdd1/', 'Cache Drive (dev_hdd1)'], ['/dev_usb000/', 'USB Drive (dev_usb000)'], ['/games/', 'Disc Games (games)', 'Where RPCS3 keeps games it copied']],
  shadps4: [['GUI.installDirs', 'Game Folders', 'Where shadPS4 looks for games', 'tomllist'], ['GUI.addonInstallDir', 'DLC', 'Where shadPS4 keeps DLC (addcont)']],
  vita3k: [['pref-path', 'Storage (ux0)', 'Installed games, updates, DLC and saves']],
  // 0.9.49 (owner: "make PPSSPP's folders changeable"): on Linux PPSSPP's memory stick is always $XDG_CONFIG_HOME/ppsspp
  // (UI/NativeApp.cpp; memstick_dir.txt is read on Android and UWP only), so there is no setting to write. Its PSP folder
  // is copied to the new place (never over a file), the old one kept beside as PSP.cartridge-kept, and a link put where
  // PPSSPP looks. Nothing is deleted.
  ppsspp: [['PSP', 'Memory Stick (PSP)', 'Saves, save states, textures and cheats']],
};
const NAMES = { pcsx2: 'PCSX2', duckstation: 'DuckStation', dolphin: 'Dolphin', yuzu: 'Yuzu', eden: 'Eden', citron: 'Citron', azahar: 'Azahar', citra: 'Citra', ryujinx: 'Ryujinx', cemu: 'Cemu', rpcs3: 'RPCS3', shadps4: 'shadPS4', vita3k: 'Vita3K', ppsspp: 'PPSSPP' };

// where each one's settings file is, from what's on this device (the same places add-ons look)
function locate(id, home = os.homedir()) {
  const env = process.env, cfg = env.XDG_CONFIG_HOME || path.join(home, '.config'), data = env.XDG_DATA_HOME || path.join(home, '.local/share');
  const kind = /^(eden|citron|yuzu)$/.test(id) ? 'yuzu' : id === 'citra' ? 'azahar' : id;
  if (['pcsx2', 'duckstation', 'dolphin', 'yuzu', 'azahar', 'ryujinx', 'cemu'].includes(kind)) {
    const e = require('./addons').emulators(home).find((x) => x.id === id || (kind === 'yuzu' && /^(eden|citron|yuzu)$/.test(x.id) && x.id === id) || (kind === 'azahar' && /^(azahar|citra)$/.test(x.id) && x.id === id));
    if (!e) return null;
    return { id, kind, file: e.settings, root: e.root, cfgDir: path.dirname(e.settings) };
  }
  if (kind === 'rpcs3') {
    const d = require('./patches').rpcs3Dirs(home)[0]; if (!d) return null;
    const f = [path.join(d.cfg, 'vfs.yml'), path.join(d.root, 'config', 'vfs.yml'), path.join(d.root, 'vfs.yml')].find(exists) || path.join(d.cfg, 'vfs.yml'); // 0.9.63: beside config.yml (config/ only on Windows)
    return { id, kind, file: f, root: d.root, emuDir: d.root + '/' };
  }
  if (kind === 'shadps4') {
    const dirs = [path.join(data, 'shadPS4'), path.join(home, '.local/share/shadPS4'), path.join(home, '.var/app/net.shadps4.shadPS4/data/shadPS4')];
    const d = dirs.find((x) => exists(path.join(x, 'config.toml'))); return d ? { id, kind, file: path.join(d, 'config.toml'), root: d } : null;
  }
  if (kind === 'ppsspp') {
    const roots = [path.join(cfg, 'ppsspp'), path.join(home, '.var/app/org.ppsspp.PPSSPP/config/ppsspp')];
    const r = roots.find((x) => exists(path.join(x, 'PSP'))) || roots.find(isDir);
    return r ? { id, kind, file: path.join(r, 'PSP', 'SYSTEM', 'ppsspp.ini'), root: r, flatpak: r.includes('/.var/app/') } : null;
  }
  if (kind === 'vita3k') {
    const f = [path.join(cfg, 'Vita3K', 'config.yml'), path.join(home, '.var/app/info.vita3k.Vita3K/config/Vita3K/config.yml')].find(exists);
    return f ? { id, kind, file: f, root: path.dirname(f), dflt: path.join(data, 'Vita3K', 'Vita3K') } : null;
  }
  return null;
}
const split = (rid) => { const i = rid.indexOf('.'); return [rid.slice(0, i), rid.slice(i + 1)]; };
// a value as a real folder: RPCS3's $(EmulatorDir), relative paths under the emulator's folder, ~
function resolve(loc, v) {
  if (!v) return '';
  let p = String(v).replace(/\$\(EmulatorDir\)/g, loc.emuDir || (loc.root + '/')).replace(/^~(?=\/|$)/, os.homedir());
  if (!path.isAbsolute(p)) p = path.join(loc.root, p);
  return p.replace(/\/+$/, '') || '/';
}
// what's set, per folder: [{ id, label, sub, value, path, here, list }]
function describe(id, home) {
  const loc = locate(id, home);
  if (!loc) return { id, name: NAMES[id] || id, why: `${NAMES[id] || id}'s settings weren't found on this device. Open it once, then come back.` };
  if (loc.kind === 'ppsspp') {
    const psp = path.join(loc.root, 'PSP'); let link = null; try { if (fs.lstatSync(psp).isSymbolicLink()) link = fs.realpathSync(psp); } catch {}
    return { id, name: NAMES[id], file: loc.file, items: [{ id: 'PSP', label: 'Memory Stick (PSP)', sub: 'Saves, save states, textures and cheats. PPSSPP always looks here, so Cartridge moves the folder and leaves a link.', list: false, value: link || '', path: link || psp, here: isDir(link || psp), dflt: !link, moves: true }] };
  }
  const text = read(loc.file) || '';
  let json = null; if (loc.kind === 'ryujinx') { try { json = JSON.parse(text); } catch {} }
  const items = (ROWS[loc.kind] || []).map(([rid, label, sub, list]) => {
    let value;
    if (loc.kind === 'rpcs3' || loc.kind === 'vita3k') value = ymlLine(text, rid);
    else if (loc.kind === 'cemu') value = (new RegExp(`<${rid}>([^<]*)</${rid}>`).exec(text) || [])[1];
    else if (loc.kind === 'ryujinx') value = json?.[rid];
    else if (loc.kind === 'shadps4') { const [s, k] = split(rid); value = tomlGet(text, s, k); }
    else {
      const [s, k] = split(rid);
      if (list === 'isolist') { const n = Number(iniOne(text, s, 'ISOPaths') || 0); value = Array.from({ length: n }, (_, i) => iniOne(text, s, `ISOPath${i}`)).filter(Boolean); }
      else if (list) value = iniAll(text, s, k);
      else value = iniOne(text, s, k);
    }
    if (loc.kind === 'vita3k' && !value) value = loc.dflt;
    const vals = list ? (Array.isArray(value) ? value : value ? [value] : []) : null;
    const p = list ? '' : resolve(loc, value);
    return { id: rid, label, sub: sub || '', list: !!list, value: list ? vals : value || '', path: p, paths: list ? vals.map((x) => resolve(loc, x)) : undefined, here: list ? true : !p || isDir(p), dflt: !value };
  });
  return { id, name: NAMES[id] || id, file: loc.file, items };
}
// set one folder (or a list's folders); null puts a single folder back to the emulator's default
function setPath(id, rid, value, home) {
  const loc = locate(id, home);
  if (!loc) throw new Error(`${NAMES[id] || id}'s settings weren't found on this device.`);
  const row = (ROWS[loc.kind] || []).find((r) => r[0] === rid);
  if (!row) throw new Error('Cartridge can’t change that folder.');
  const list = row[3];
  if (loc.kind === 'ppsspp') { movePsp(loc, value); return describe(id, home); }
  let text = read(loc.file);
  if (text == null && !['vita3k', 'rpcs3'].includes(loc.kind)) throw new Error(`${NAMES[id] || id}'s settings file couldn't be read.`);
  text = text || '';
  const vals = list ? (Array.isArray(value) ? value : []).filter(Boolean) : value;
  if (loc.kind === 'rpcs3') {
    const v = value ? (value.endsWith('/') ? value : value + '/') : `$(EmulatorDir)${rid.replace(/^\/|\/$/g, '')}/`;
    text = ymlLineSet(text, rid, v);
  } else if (loc.kind === 'vita3k') text = ymlLineSet(text, rid, value || loc.dflt);
  else if (loc.kind === 'cemu') {
    const v = String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    text = new RegExp(`<${rid}>[^<]*</${rid}>`).test(text) ? text.replace(new RegExp(`<${rid}>[^<]*</${rid}>`), `<${rid}>${v}</${rid}>`) : text.replace(/<content>/, `<content>\n    <${rid}>${v}</${rid}>`);
  } else if (loc.kind === 'ryujinx') { const j = JSON.parse(text); j[rid] = vals; text = JSON.stringify(j, null, 2); }
  else if (loc.kind === 'shadps4') { const [s, k] = split(rid); text = tomlSet(text, s, k, list ? vals : value || ''); }
  else {
    const [s, k] = split(rid);
    if (list === 'isolist') {
      const old = Number(iniOne(text, s, 'ISOPaths') || 0);
      for (let i = 0; i < Math.max(old, vals.length); i++) text = iniSet(text, s, `ISOPath${i}`, i < vals.length ? [vals[i]] : []);
      text = iniSet(text, s, 'ISOPaths', [String(vals.length)]);
    } else if (list) text = iniSet(text, s, k, vals);
    else if (loc.kind === 'yuzu' || loc.kind === 'azahar') {
      text = value ? qtSet(text, s, k, value.endsWith('/') ? value : value + '/') : iniSet(iniSet(text, s, k, []), s, `${k}\\default`, ['true']).replace(/^(\S+\\default) = /m, '$1=');
      if (loc.kind === 'azahar' && value) text = qtSet(text, s, 'use_custom_storage', 'true');
    } else text = iniSet(text, s, k, value ? [value] : []);
  }
  fs.mkdirSync(path.dirname(loc.file), { recursive: true });
  const bak = loc.file + '.cartridge-bak';
  if (exists(loc.file) && !exists(bak)) fs.copyFileSync(loc.file, bak); // the first change keeps the original beside it
  const tmp = loc.file + '.cartridge-new';
  fs.writeFileSync(tmp, text); fs.renameSync(tmp, loc.file);
  if (!list && value) fs.mkdirSync(resolve(loc, value), { recursive: true });
  return describe(id, home);
}
// PPSSPP's PSP folder to `to` (null: back where PPSSPP keeps it). Files are copied, never over one; the old folder stays.
function movePsp(loc, to) {
  const psp = path.join(loc.root, 'PSP'), kept = psp + '.cartridge-kept';
  let link = null; try { if (fs.lstatSync(psp).isSymbolicLink()) link = fs.readlinkSync(psp); } catch {}
  const from = link ? path.resolve(loc.root, link) : psp;
  if (to) {
    to = path.resolve(String(to).replace(/^~(?=\/|$)/, os.homedir()));
    const rp = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
    if (rp(to) === rp(from)) return;
    if ((rp(to) + '/').startsWith(rp(loc.root) + '/') || (rp(from) + '/').startsWith(rp(to) + '/')) throw new Error('Pick a folder outside PPSSPP’s own folder.');
    fs.mkdirSync(to, { recursive: true });
    if (isDir(from)) fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: false, preserveTimestamps: true });
    const count = (d) => { let n = 0; for (const e of fs.readdirSync(d, { withFileTypes: true })) n += e.isDirectory() ? count(path.join(d, e.name)) : 1; return n; };
    if (isDir(from) && count(to) < count(from)) throw new Error('Not every file could be copied, so nothing was changed. Check the drive has room.');
    if (link) fs.unlinkSync(psp); else if (exists(psp)) { if (exists(kept)) throw new Error(`${kept} is already there. Move it away first.`); fs.renameSync(psp, kept); }
    fs.symlinkSync(to, psp);
  } else {
    if (!link) return;
    fs.unlinkSync(psp); fs.mkdirSync(psp, { recursive: true });
    if (isDir(from)) fs.cpSync(from, psp, { recursive: true, force: false, errorOnExist: false, preserveTimestamps: true }); // the moved folder stays too
  }
}
const supported = () => Object.keys(NAMES);
module.exports = { ROWS, NAMES, locate, describe, setPath, supported, iniAll, iniSet, qtSet, tomlGet, tomlSet, ymlLine, ymlLineSet };
