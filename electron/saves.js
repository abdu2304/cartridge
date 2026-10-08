'use strict';
// Saves on this device (0.9.29, The Syncthing Update; owner: "find and link the saves found on the device and
// know what saves this game is for"). Read only: nothing here writes, moves or deletes a file.
// Each emulator keeps saves its own way; the layouts below are from each emulator's source (Eden
// savedata_factory.cpp, LibHac's save indexer for Ryujinx, RPCS3/PPSSPP PARAM.SFO folders, Vita3K ux0,
// shadPS4 user/savedata, Dolphin GC/Wii folders, Cemu mlc01, Azahar sdmc, Xenia content, RetroArch).
// No Electron imports so it can be tested on its own (test/saves.test.js).
const fs = require('fs');
const path = require('path');
const os = require('os');

// a folder's entries; a link counts as what it points at (0.9.59, owner: saves moved to a microSD and linked back were
// never found: readdir's types call a link "not a folder"). Every walk here has a fixed depth, so a link that points
// back into its own folder can't run away.
const ls = (d) => {
  let list; try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return []; }
  return list.map((e) => {
    if (!e.isSymbolicLink()) return e;
    let st = null; try { st = fs.statSync(path.join(d, e.name)); } catch {}
    return { name: e.name, isDirectory: () => !!st?.isDirectory(), isFile: () => !!st?.isFile(), isSymbolicLink: () => true };
  });
};
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };

// size, newest change and file count of a save folder (bounded: a save is small, a runaway folder isn't walked)
function sizeOf(p, budget = { n: 4000 }) {
  let size = 0, at = 0, files = 0, conflicts = 0; // conflicts: copies Syncthing kept when two devices changed the same file
  const walk = (d, depth) => {
    for (const e of ls(d)) {
      if (budget.n-- <= 0) return;
      const f = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 8) walk(f, depth + 1); continue; }
      if (e.name.includes('.sync-conflict-')) conflicts++;
      try { const st = fs.statSync(f); size += st.size; files++; if (st.mtimeMs > at) at = st.mtimeMs; } catch {}
    }
  };
  try { const st = fs.statSync(p); if (st.isFile()) return { size: st.size, at: st.mtimeMs, files: 1, conflicts: 0 }; } catch { return { size: 0, at: 0, files: 0, conflicts: 0 }; }
  walk(p, 0);
  return { size, at, files, conflicts };
}

// PARAM.SFO (PS3, PSP, Vita, PS4): the save's own title
function sfo(file) {
  const out = {};
  let buf; try { buf = fs.readFileSync(file); } catch { return out; }
  try {
    if (buf.readUInt32BE(0) !== 0x00505346) return out;
    const keys = buf.readUInt32LE(8), data = buf.readUInt32LE(12), n = Math.min(buf.readUInt32LE(16), 64);
    for (let i = 0; i < n; i++) {
      const e = 20 + i * 16;
      const ko = buf.readUInt16LE(e), fmt = buf.readUInt16LE(e + 2), len = buf.readUInt32LE(e + 4), off = buf.readUInt32LE(e + 12);
      const k = buf.toString('latin1', keys + ko, buf.indexOf(0, keys + ko));
      // a string ends at its first NUL; bytes after it, or ones that aren't UTF-8, are another field's (0.9.57: a PSP
      // title read "Size Matters™��ENTR")
      out[k] = fmt === 0x0404 ? buf.readUInt32LE(data + off) : buf.toString('utf8', data + off, data + off + len).split('\0')[0].replace(/\uFFFD[\s\S]*$/, '').trim();
    }
  } catch {}
  return out;
}

// Game serials written inside a memory card (PS1 .mcd, PS2 .ps2): each game's save folder is named after
// its serial, as plain text in the card's directory ("BASLUS-21050..."). Found by pattern, no card parsing.
function cardSerials(file, max = 16 << 20) {
  let buf; try { const st = fs.statSync(file); if (st.size > max) return []; buf = fs.readFileSync(file); } catch { return []; }
  const out = new Set(), s = buf.toString('latin1');
  for (const m of s.matchAll(/B([AEIS])([A-Z]{4})-(\d{5})/g)) out.add(m[2] + m[3]);
  return [...out];
}

// Ryujinx keeps saves by save ID; the save index (LibHac's KeyValueArchive "IMKV") says whose they are.
// Entry: "IMEN", key size, value size, key (SaveDataAttribute: program ID u64 first), value (save ID u64 first).
function ryujinxIndex(file) {
  const out = new Map();
  let b; try { b = fs.readFileSync(file); } catch { return out; }
  if (b.toString('latin1', 0, 4) !== 'IMKV') return out;
  const n = b.readUInt32LE(8);
  let o = 12;
  for (let i = 0; i < n && o + 12 <= b.length; i++) {
    if (b.toString('latin1', o, o + 4) !== 'IMEN') break;
    const ks = b.readUInt32LE(o + 4), vs = b.readUInt32LE(o + 8), k = o + 12, v = k + ks;
    if (v + vs > b.length) break;
    const program = b.readBigUInt64LE(k), save = b.readBigUInt64LE(v);
    out.set(save.toString(16).padStart(16, '0').toUpperCase(), program.toString(16).padStart(16, '0').toUpperCase());
    o = v + vs;
  }
  return out;
}

// where each emulator keeps its data, relative to home, per install kind (EmuDeck installs use the same)
const DATA = {
  eden: ['.local/share/eden', '.var/app/dev.eden_emu.eden/data/eden'],
  citron: ['.local/share/citron', '.var/app/org.citron_emu.citron/data/citron'],
  yuzu: ['.local/share/yuzu', '.var/app/org.yuzu_emu.yuzu/data/yuzu'],
  sudachi: ['.local/share/sudachi', '.var/app/org.sudachi_emu.sudachi/data/sudachi'],
  suyu: ['.local/share/suyu'],
  torzu: ['.local/share/torzu'],
  ryujinx: ['.config/Ryujinx', '.var/app/io.github.ryubing.Ryujinx/config/Ryujinx', '.var/app/org.ryujinx.Ryujinx/config/Ryujinx'],
  rpcs3: ['.config/rpcs3', '.var/app/net.rpcs3.RPCS3/config/rpcs3'],
  ppsspp: ['.config/ppsspp', '.var/app/org.ppsspp.PPSSPP/config/ppsspp'],
  vita3k: ['.local/share/Vita3K/Vita3K', '.var/app/org.vita3k.Vita3K/data/Vita3K/Vita3K'],
  shadps4: ['.local/share/shadPS4', '.var/app/net.shadps4.shadPS4/data/shadPS4'],
  pcsx2: ['.config/PCSX2', '.var/app/net.pcsx2.PCSX2/config/PCSX2'],
  duckstation: ['.local/share/duckstation', '.var/app/org.duckstation.DuckStation/data/duckstation'],
  dolphin: ['.local/share/dolphin-emu', '.var/app/org.DolphinEmu.dolphin-emu/data/dolphin-emu'],
  cemu: ['.local/share/Cemu', '.var/app/info.cemu.Cemu/data/Cemu'],
  azahar: ['.local/share/azahar-emu', '.var/app/org.azahar_emu.Azahar/data/azahar-emu', '.local/share/citra-emu', '.var/app/org.citra_emu.citra/data/citra-emu'],
  xenia: ['.local/share/Xenia', 'Documents/Xenia'],
  retroarch: ['.config/retroarch', '.var/app/org.libretro.RetroArch/config/retroarch'],
};
const NAMES = { eden: 'Eden', citron: 'Citron', yuzu: 'yuzu', sudachi: 'Sudachi', suyu: 'suyu', torzu: 'torzu', ryujinx: 'Ryujinx', rpcs3: 'RPCS3', ppsspp: 'PPSSPP', vita3k: 'Vita3K', shadps4: 'shadPS4', pcsx2: 'PCSX2', duckstation: 'DuckStation', dolphin: 'Dolphin', cemu: 'Cemu', azahar: 'Azahar', xenia: 'Xenia', retroarch: 'RetroArch' };
const SWITCH = ['eden', 'citron', 'yuzu', 'sudachi', 'suyu', 'torzu'];
const hex = (n, w) => /^[0-9A-F]+$/i.test(n) && n.length === w;

// one emulator data folder -> its saves: { emu, kind, path, label, keys: { switch, serial, title, gc, n3ds, wiiu, x360, name }, shared, serials }
// ---- The save locator (0.9.59, owner: "search all layouts to find accurate saves … build a system around this").
// Each emulator's rule card: where it keeps saves now, read from its own settings the way the emulator reads them,
// and the places it used before or would use without the setting. A place is
//   { loc: 'use' | 'old', why, at: { <role>: folder } }
// 'use' is where the emulator reads saves today: only these are synced and only these receive saves. 'old' is a
// place it no longer reads (an older layout, or the default after a setting moved saves): shown, never synced on
// its own. why: default | setting (the emulator's own setting) | portable | older (a layout older builds used) |
// unused (the default, no longer read because a setting moved saves) | added (a folder you picked).
const uniq = (a) => [...new Set(a.filter(Boolean))];
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
// the settings folders for one data folder: itself (portable), its config/ (Eden portable), the XDG config twin
// (~/.local/share/x -> ~/.config/x) and a Flatpak's (…/data/x -> …/config/x)
const cfgDirs = (base) => uniq([base, path.join(base, 'config'), base.includes('/.local/share/') ? base.replace('/.local/share/', '/.config/') : '', /\/data\/[^/]+$/.test(base) ? base.replace(/\/data\/([^/]+)$/, '/config/$1') : '']);
const firstText = (dirs, rel) => { for (const d of dirs) { const t = readText(path.join(d, rel)); if (t) return t; } return ''; };
// key = value in an ini or simple toml [section] (Qt writes the section as "Data%20Storage")
function iniGet(text, section, key) {
  let cur = '';
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim(), h = /^\[(.+)\]$/.exec(line);
    if (h) { cur = h[1].replace(/%20/g, ' ').toLowerCase(); continue; }
    if (cur !== section.toLowerCase()) continue;
    const m = /^([^=]+?)\s*=\s*(.*)$/.exec(line);
    if (m && m[1] === key) return m[2].trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim();
  }
  return '';
}
// a setting's path: ~ expanded, relative ones from the emulator's folder (as PCSX2 and DuckStation read them)
const abs = (p, root) => { p = String(p || '').trim().replace(/^~(?=\/|$)/, os.homedir()); if (!p) return ''; return path.isAbsolute(p) ? path.normalize(p) : root ? path.join(root, p) : ''; };
const same = (a, b) => { try { return fs.realpathSync(a) === fs.realpathSync(b); } catch { return path.resolve(a) === path.resolve(b); } };
// a setting that moves one folder: the setting's folder in use and the default as an old place, else the default
function moved(setting, def, role) {
  if (!setting || same(setting, def)) return [{ loc: 'use', why: 'default', at: { [role]: def } }];
  return [{ loc: 'use', why: 'setting', at: { [role]: setting } }, { loc: 'old', why: 'unused', at: { [role]: def } }];
}
const PS4_ID = /^(CUSA|PCJS|PLJM|PCAS|PCKS|PCJM|PLAS|PLES)\d{5}$/;
// shadPS4 (path_util.cpp, save_instance.cpp, user_manager.cpp, emulator_settings.cpp). Builds from 0.16 keep saves in
// <home>/<user ID>/savedata/<CUSA…>, <home> being home_dir in config.json or <user folder>/home; builds up to 0.15 used
// <user folder>/savedata/<user ID>/<CUSA…>, moved by saveDataPath under [GUI] in config.toml. A new build moves the
// old folder over on first start (and may leave a link behind). The user folder is the program's working folder's
// user/ when there is one (portable), else ~/.local/share/shadPS4 (a Flatpak: its own data folder).
function shadUserDir(base) { return [base, path.join(base, 'user')].find((d) => exists(path.join(d, 'config.json')) || exists(path.join(d, 'config.toml'))) || base; }
const homeSaves = (home) => ls(home).filter((u) => u.isDirectory()).map((u) => path.join(home, u.name, 'savedata')).filter(isDir);
function shadWhere(base) {
  const user = shadUserDir(base), json = readText(path.join(user, 'config.json')), toml = readText(path.join(user, 'config.toml'));
  const homeSet = abs((/"home_dir"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(json) || [])[1]?.replace(/\\(.)/g, '$1'));
  const saveSet = abs(iniGet(toml, 'GUI', 'saveDataPath'));
  const why = user !== base ? 'portable' : 'default';
  const home = homeSet || path.join(user, 'home'), oldRoot = saveSet || path.join(user, 'savedata');
  const fresh = homeSaves(home), older = [oldRoot, ...(saveSet ? [path.join(user, 'savedata')] : [])].filter(isDir);
  if (json) { // a current build
    const out = [{ loc: 'use', why: homeSet ? 'setting' : why, at: { savedata: fresh.length ? fresh : [path.join(home, '1000/savedata')] } }];
    if (homeSet && !same(homeSet, path.join(user, 'home'))) { const d = homeSaves(path.join(user, 'home')); if (d.length) out.push({ loc: 'old', why: 'unused', at: { savedata: d } }); }
    if (older.length) out.push({ loc: 'old', why: 'older', at: { savedata: older } });
    return out;
  }
  if (toml) { // an older build
    const out = [{ loc: 'use', why: saveSet ? 'setting' : why, at: { savedata: [oldRoot] } }];
    if (saveSet && isDir(path.join(user, 'savedata')) && !same(saveSet, path.join(user, 'savedata'))) out.push({ loc: 'old', why: 'unused', at: { savedata: [path.join(user, 'savedata')] } });
    return out;
  }
  // never started, or settings Cartridge can't see: every layout counts
  return [{ loc: 'use', why, at: { savedata: uniq([...fresh, ...[path.join(user, 'savedata')].filter(isDir)]) } }];
}
const GC_REGIONS = ['USA', 'EUR', 'JAP', 'DEV'];
const WHERE = {
  // Eden and the yuzu family (frontend_common/config.cpp ReadDataStorageValues): save_directory, else nand_directory,
  // else <data>/nand; saves under <that>/user/save. qt-config.ini in the config folder (portable: user/config/)
  switch(base) {
    const ini = firstText(cfgDirs(base), 'qt-config.ini');
    const set = abs(iniGet(ini, 'Data Storage', 'save_directory')) || abs(iniGet(ini, 'Data Storage', 'nand_directory'));
    return moved(set, path.join(base, 'nand'), 'nand');
  },
  // RPCS3 (Emu/vfs_config.h): config/vfs.yml "/dev_hdd0/", where $(EmulatorDir) is its own entry, else RPCS3's folder
  rpcs3(base) {
    const y = readText(path.join(base, 'config/vfs.yml'));
    const get = (k) => { const m = new RegExp('^' + k.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + ':\\s*(.*)$', 'm').exec(y); return m ? m[1].trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1') : ''; };
    let emuDir = abs(get('$(EmulatorDir)')) || base; emuDir = emuDir.replace(/\/?$/, '/');
    const hdd = (get('/dev_hdd0/') || '$(EmulatorDir)dev_hdd0/').replace('$(EmulatorDir)', emuDir).replace(/\/+$/, '');
    return moved(abs(hdd), path.join(base, 'dev_hdd0'), 'hdd0');
  },
  // Vita3K (config.yml pref-path): the folder holding ux0
  vita3k(base) {
    const y = firstText(uniq([...cfgDirs(base), ...cfgDirs(path.dirname(base))]), 'config.yml');
    const pref = abs(((/^pref-path:\s*(.*)$/m.exec(y) || [])[1] || '').trim().replace(/^['"](.*)['"]$/, '$1'));
    return moved(pref && isDir(path.join(pref, 'ux0')) ? pref : '', base, 'pref');
  },
  shadps4: shadWhere,
  // PCSX2 (Pcsx2Config.cpp EmuFolders): inis/PCSX2.ini [Folders] MemoryCards, relative to its folder
  pcsx2: (base) => moved(abs(iniGet(readText(path.join(base, 'inis/PCSX2.ini')), 'Folders', 'MemoryCards'), base), path.join(base, 'memcards'), 'memcards'),
  // DuckStation (settings.cpp EmuFolders): settings.ini [MemoryCards] Directory
  duckstation: (base) => moved(abs(iniGet(readText(path.join(base, 'settings.ini')), 'MemoryCards', 'Directory'), base), path.join(base, 'memcards'), 'memcards'),
  // Dolphin (Config/MainSettings.cpp): [General] NANDRootPath moves Wii saves; [Core] GCIFolderAPath/BPath are card
  // folders named for a region ("…/USA", any region swapped for the game's) and MemcardAPath/BPath card files, both
  // as well as the GC folder. Dolphin.ini sits in its config folder (portable: Config/)
  dolphin(base) {
    const ini = firstText([...cfgDirs(base), path.join(base, 'Config')], 'Dolphin.ini');
    const nand = abs(iniGet(ini, 'General', 'NANDRootPath'));
    const gci = uniq(['GCIFolderAPath', 'GCIFolderBPath'].map((k) => abs(iniGet(ini, 'Core', k)))).flatMap((p) => {
      const root = GC_REGIONS.includes(path.basename(p)) ? path.dirname(p) : p;
      return GC_REGIONS.map((r) => path.join(root, r)).filter(isDir);
    });
    const cards = uniq(['MemcardAPath', 'MemcardBPath'].map((k) => abs(iniGet(ini, 'Core', k)))).filter((f) => exists(f) && !f.startsWith(path.join(base, 'GC') + '/'));
    const wiiDef = path.join(base, 'Wii'), useWii = nand && !same(nand, wiiDef) ? nand : wiiDef;
    const out = [{ loc: 'use', why: useWii !== wiiDef || gci.length || cards.length ? 'setting' : 'default', at: { gc: path.join(base, 'GC'), gci, cards, wii: useWii } }];
    if (useWii !== wiiDef) out.push({ loc: 'old', why: 'unused', at: { gc: null, wii: wiiDef } });
    return out;
  },
  // Cemu (config/CemuConfig.cpp): settings.xml <mlc_path>, else mlc01 in its folder
  cemu(base) {
    const x = firstText(cfgDirs(base), 'settings.xml');
    const m = ((/<mlc_path>([^<]*)<\/mlc_path>/.exec(x) || [])[1] || '').trim().replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"');
    return moved(abs(m), path.join(base, 'mlc01'), 'mlc');
  },
  // Azahar and Citra (citra_qt configuration/config.cpp ReadDataStorageValues): sdmc_directory, only with
  // use_custom_storage=true
  azahar(base) {
    const ini = firstText(cfgDirs(base), 'qt-config.ini');
    const on = /^true$/i.test(iniGet(ini, 'Data Storage', 'use_custom_storage'));
    return moved(on ? abs(iniGet(ini, 'Data Storage', 'sdmc_directory')) : '', path.join(base, 'sdmc'), 'sdmc');
  },
};
const whereOf = (emu) => (SWITCH.includes(emu) ? WHERE.switch : WHERE[emu]) || (() => [{ loc: 'use', why: 'default', at: {} }]);
// the folder a place is about (for lists): its first named folder, else the emulator's folder
const placeDir = (at, base) => { for (const v of Object.values(at || {})) { if (typeof v === 'string' && v) return v; if (Array.isArray(v) && v[0]) return v[0]; } return base; };
// shadPS4's save folders in use under one of its folders (Syncthing, Linked Folders and Save Sync's placing use it)
const shadSaveDirs = (base) => uniq(shadWhere(base).filter((w) => w.loc === 'use').flatMap((w) => w.at.savedata || [])).filter(isDir);
const shadSaveDir = (base) => shadWhere(base).find((w) => w.loc === 'use')?.at.savedata?.[0] || path.join(base, 'home/1000/savedata');
const SCAN = {
  // nand/user/save/0000000000000000/<user ID>/<title ID>/ and the newer account/<uuid>/<title ID>/0 layout
  switch(base, emu, at = {}) {
    const out = [], root = path.join(at.nand || path.join(base, 'nand'), 'user/save');
    // Eden's game list cache (qt_common/game_list/worker.cpp): <cache>/game_list/<TITLE ID>.appname.txt holds
    // the game's name, so a save can be named even without the game's keys (data and cache folders sit side by side)
    const cache = base.includes('/.local/share/') ? base.replace('/.local/share/', '/.cache/') : base.replace(/\/data\/([^/]+)$/, '/cache/$1');
    const nameOf = (id) => readText(path.join(cache, 'game_list', id.toUpperCase() + '.appname.txt')).split('\n')[0].trim();
    for (const u of ls(path.join(root, '0000000000000000'))) if (u.isDirectory()) for (const t of ls(path.join(root, '0000000000000000', u.name))) {
      if (t.isDirectory() && hex(t.name, 16) && t.name !== '0000000000000000') { const n = nameOf(t.name); out.push({ emu, kind: 'save', path: path.join(root, '0000000000000000', u.name, t.name), label: n, keys: { switch: t.name.toUpperCase(), title: n } }); }
    }
    for (const u of ls(path.join(root, 'account'))) if (u.isDirectory()) for (const t of ls(path.join(root, 'account', u.name))) {
      if (t.isDirectory() && hex(t.name, 16)) { const n = nameOf(t.name); out.push({ emu, kind: 'save', path: path.join(root, 'account', u.name, t.name), label: n, keys: { switch: t.name.toUpperCase(), title: n } }); }
    }
    return out;
  },
  ryujinx(base) {
    const out = [], idx = ryujinxIndex(path.join(base, 'bis/system/save/8000000000000000/0/imkvdb.arc'));
    for (const s of ls(path.join(base, 'bis/user/save'))) {
      if (!s.isDirectory() || !hex(s.name, 16)) continue;
      const program = idx.get(s.name.toUpperCase());
      if (program && /^0100/.test(program)) out.push({ emu: 'ryujinx', kind: 'save', path: path.join(base, 'bis/user/save', s.name), keys: { switch: program } });
      else if (!program) out.push({ emu: 'ryujinx', kind: 'save', path: path.join(base, 'bis/user/save', s.name), keys: {}, label: `Save ${s.name}` });
    }
    return out;
  },
  // dev_hdd0/home/<user>/savedata/<SERIAL><suffix>/PARAM.SFO
  rpcs3(base, at = {}) {
    const out = [], hdd = at.hdd0 || path.join(base, 'dev_hdd0');
    for (const u of ls(path.join(hdd, 'home'))) if (u.isDirectory()) {
      const sd = path.join(hdd, 'home', u.name, 'savedata');
      for (const s of ls(sd)) if (s.isDirectory() && /^[A-Z]{4}\d{5}/.test(s.name)) {
        const p = sfo(path.join(sd, s.name, 'PARAM.SFO'));
        // sub: what this save is (0.9.57, owner: two saves of one game at very different sizes): games keep progress and
        // system data or settings in separate saves, each saying so in its SUB_TITLE
        out.push({ emu: 'rpcs3', kind: 'save', path: path.join(sd, s.name), label: p.TITLE || '', sub: p.SUB_TITLE || String(p.DETAIL || '').split('\n')[0] || '', keys: { serial: s.name.slice(0, 9), title: p.TITLE || '' } });
      }
    }
    return out;
  },
  ppsspp(base) {
    const out = [], sd = path.join(base, 'PSP/SAVEDATA');
    for (const s of ls(sd)) if (s.isDirectory() && /^[A-Z]{4}\d{5}/.test(s.name)) {
      const p = sfo(path.join(sd, s.name, 'PARAM.SFO'));
      out.push({ emu: 'ppsspp', kind: 'save', path: path.join(sd, s.name), label: p.TITLE || '', sub: p.SAVEDATA_TITLE || '', keys: { serial: s.name.slice(0, 9), title: p.TITLE || '' } });
    }
    return out;
  },
  // ux0/user/00/savedata/<title ID>
  vita3k(base, at = {}) {
    const out = [], sd = path.join(at.pref || base, 'ux0/user/00/savedata');
    for (const s of ls(sd)) if (s.isDirectory() && /^[A-Z]{4}\d{5}$/.test(s.name)) out.push({ emu: 'vita3k', kind: 'save', path: path.join(sd, s.name), keys: { serial: s.name } });
    return out;
  },
  // 0.9.57 (owner: "that's not shadPS4's save folder"; read from shadPS4's save_instance.cpp and path_util.cpp): saves
  // live in <home>/<user ID>/savedata/<CUSA…>/<slot>, <home> being its home_dir setting or <its folder>/home. Older
  // builds: <its folder>/savedata/<user>/<CUSA…> or savedata/<CUSA…>; a portable copy keeps its folder in user/.
  shadps4(base, at = null) {
    const out = [], seen = new Set(), PS4 = PS4_ID;
    const add = (p, id) => { if (seen.has(p)) return; seen.add(p); const t = [p, ...ls(p).filter((x) => x.isDirectory()).map((x) => path.join(p, x.name))].map((d) => sfo(path.join(d, 'sce_sys/param.sfo')).TITLE).find(Boolean); /* each save slot folder has its own param.sfo */ out.push({ emu: 'shadps4', kind: 'save', path: p, label: t || '', keys: { serial: id, title: t || '' } }); };
    for (const sd of at?.savedata || shadSaveDirs(base)) for (const a of ls(sd)) if (a.isDirectory()) {
      if (PS4.test(a.name)) { add(path.join(sd, a.name), a.name); continue; }
      for (const b of ls(path.join(sd, a.name))) if (b.isDirectory() && PS4.test(b.name)) add(path.join(sd, a.name, b.name), b.name);
    }
    return out;
  },

  // memcards/*.ps2: one card holds many games (or a folder card per game)
  pcsx2(base, at = {}) {
    const out = [], md = at.memcards || path.join(base, 'memcards');
    for (const c of ls(md)) {
      const p = path.join(md, c.name);
      if (c.isDirectory() && /\.ps2$/i.test(c.name)) { // folder memory card: a folder per game
        const serials = ls(p).filter((x) => x.isDirectory()).map((x) => (/B[AEIS]([A-Z]{4})-(\d{5})/.exec(x.name) || []).slice(1).join('')).filter(Boolean);
        out.push({ emu: 'pcsx2', kind: 'card', path: p, label: c.name, keys: {}, shared: true, serials: [...new Set(serials)] });
      } else if (/\.ps2$/i.test(c.name)) out.push({ emu: 'pcsx2', kind: 'card', path: p, label: c.name, keys: {}, shared: true, serials: cardSerials(p) });
    }
    return out;
  },
  // memcards/<title or serial>_1.mcd (per game by default) or shared_card_1.mcd
  duckstation(base, at = {}) {
    const out = [], md = at.memcards || path.join(base, 'memcards');
    for (const c of ls(md)) if (c.isFile() && /\.mcd$/i.test(c.name)) {
      const p = path.join(md, c.name), stem = c.name.replace(/_\d+\.mcd$/i, '').replace(/\.mcd$/i, '');
      const shared = /^shared_card/i.test(stem);
      const serial = (/^([A-Z]{4})[-_]?(\d{5})$/i.exec(stem) || []).slice(1).join('').toUpperCase();
      out.push({ emu: 'duckstation', kind: 'card', path: p, label: c.name, keys: shared ? {} : serial ? { serial } : { name: stem }, shared, serials: cardSerials(p) });
    }
    return out;
  },
  // GC/<region>/Card A|B/*.gci (GCI folders, "01-GALE-…") or MemoryCardA.*.raw (shared), Wii/title/00010000/<ID4 hex>/data
  // region: the card's region folder, part of a save's key on every device (custom GCI folders are named for it)
  dolphin(base, at = {}) {
    const out = [], gc = at.gc === undefined ? path.join(base, 'GC') : at.gc;
    const gciIn = (p, region) => { for (const g of ls(p)) { const m = /^[0-9A-Z]{2}-([0-9A-Z]{4})-/i.exec(g.name); if (g.isFile() && m) out.push({ emu: 'dolphin', kind: 'save', path: path.join(p, g.name), label: g.name, region, keys: { gc: m[1].toUpperCase() } }); } };
    const card = (p, region) => out.push({ emu: 'dolphin', kind: 'card', path: p, label: path.basename(p), region, keys: {}, shared: true, serials: [] });
    if (gc) for (const r of ls(gc)) if (r.isDirectory()) {
      for (const c of ls(path.join(gc, r.name))) {
        const p = path.join(gc, r.name, c.name);
        if (c.isDirectory()) gciIn(p, r.name);
        else if (/\.raw$/i.test(c.name)) card(p, r.name);
      }
    }
    for (const d of at.gci || []) gciIn(d, path.basename(d));
    for (const f of at.cards || []) card(f, (/\.(USA|EUR|JAP|DEV)\.raw$/i.exec(f) || [])[1]?.toUpperCase() || path.basename(path.dirname(f)));
    const wt = at.wii === null ? '' : path.join(at.wii || path.join(base, 'Wii'), 'title/00010000'); // null: this place has no Wii folder
    for (const t of ls(wt)) if (t.isDirectory() && hex(t.name, 8) && isDir(path.join(wt, t.name, 'data'))) {
      const id4 = Buffer.from(t.name, 'hex').toString('latin1');
      if (/^[0-9A-Z]{4}$/.test(id4)) out.push({ emu: 'dolphin', kind: 'save', path: path.join(wt, t.name, 'data'), keys: { gc: id4 } });
    }
    return out;
  },
  // mlc01/usr/save/00050000/<title ID low>/ ; the name from mlc01/usr/title/…/meta/meta.xml when installed
  cemu(base, at = {}) {
    const mlc = at.mlc || path.join(base, 'mlc01'), out = [], sd = path.join(mlc, 'usr/save/00050000');
    for (const t of ls(sd)) if (t.isDirectory() && hex(t.name, 8)) {
      const meta = readText(path.join(mlc, 'usr/title/00050000', t.name, 'meta/meta.xml'));
      const name = (/<longname_en[^>]*>([^<]+)</.exec(meta) || [])[1] || '';
      out.push({ emu: 'cemu', kind: 'save', path: path.join(sd, t.name), label: name.replace(/\s+/g, ' ').trim(), keys: { wiiu: ('00050000' + t.name).toUpperCase(), title: name } });
    }
    return out;
  },
  // sdmc/Nintendo 3DS/<id0>/<id1>/title/00040000/<title ID low>/data
  azahar(base, at = {}) {
    const out = [], n = path.join(at.sdmc || path.join(base, 'sdmc'), 'Nintendo 3DS');
    for (const a of ls(n)) if (a.isDirectory()) for (const b of ls(path.join(n, a.name))) if (b.isDirectory()) {
      const td = path.join(n, a.name, b.name, 'title/00040000');
      for (const t of ls(td)) if (t.isDirectory() && hex(t.name, 8) && isDir(path.join(td, t.name, 'data'))) out.push({ emu: 'azahar', kind: 'save', path: path.join(td, t.name, 'data'), keys: { n3ds: ('00040000' + t.name).toUpperCase() } });
    }
    return out;
  },
  // content/<profile>/<title ID>/00000001 (saved games)
  xenia(base) {
    const out = [], cd = path.join(base, 'content');
    for (const p of ls(cd)) if (p.isDirectory()) for (const t of ls(path.join(cd, p.name))) {
      if (t.isDirectory() && hex(t.name, 8) && isDir(path.join(cd, p.name, t.name, '00000001'))) out.push({ emu: 'xenia', kind: 'save', path: path.join(cd, p.name, t.name, '00000001'), keys: { x360: t.name.toUpperCase() } });
    }
    return out;
  },
  // savefile_directory from retroarch.cfg (default: saves/ in its folder); files named after the game file
  retroarch(base) {
    const out = [], cfg = readText(path.join(base, 'retroarch.cfg'));
    let sd = (/^\s*savefile_directory\s*=\s*"([^"]*)"/m.exec(cfg) || [])[1] || '';
    sd = sd.replace(/^~(?=\/|$)/, os.homedir()).replace(/^:(?=\/|$)/, base);
    if (!sd || sd === 'default') sd = path.join(base, 'saves');
    const walk = (d, depth) => {
      for (const e of ls(d)) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (depth < 2) walk(p, depth + 1); continue; }
        // a PS1 memory card kept as a save (0.9.57: "SwanStation.srm" is SwanStation's card, named after the core when
        // it's shared between games): the games on it, read from the card like PCSX2's and DuckStation's
        if (/\.(srm|sav|mcd|mcr|eep|sra|fla|mpk|rtc|dsv)$/i.test(e.name)) { let ser = []; try { if (fs.statSync(p).size === 131072) ser = cardSerials(p); } catch {} out.push({ emu: 'retroarch', kind: 'save', path: p, label: e.name, keys: { name: e.name.replace(/\.[^.]+$/, '') }, ...(ser.length ? { serials: ser, sub: 'PS1 memory card' } : {}) }); }
      }
    };
    walk(sd, 0);
    return out;
  },
};
const scannerOf = (emu) => (SWITCH.includes(emu) ? (b, at) => SCAN.switch(b, emu, at) : SCAN[emu]);

// every save on this device, each with where it was found: loc 'use' | 'old', why (see the save locator), place (the
// folder the rule card names). extra: { [emu]: [more data folders] } (portable installs, Vita3K's storage);
// extraAt: { [emu]: [{ base, at }] } folders you picked (Use This Folder), in use. The same save reached two ways (a
// link and its folder) is listed once, in use when either way is.
function scan({ home = os.homedir(), extra = {}, extraAt = {}, withSize = true, oldToo = true } = {}) {
  const out = [], seenBase = new Set(), bySave = new Map();
  const add = (emu, list, base, w) => {
    for (const s of list) {
      if (/\.cartridge-(moved|new|old|kept)\b/.test(s.path)) continue; // a moved copy, or Cartridge's own half-written one
      let real = s.path; try { real = fs.realpathSync(s.path); } catch {}
      const k = emu + '\0' + real, prev = bySave.get(k);
      const meta = { loc: w.loc, why: w.why, place: placeDir(w.at, base) };
      if (prev) { if (prev.loc === 'old' && w.loc === 'use') Object.assign(prev, meta, { base, path: s.path }); continue; }
      const item = { ...s, emuName: NAMES[emu] || emu, base, ...meta, ...(withSize ? sizeOf(s.path) : {}) };
      bySave.set(k, item); out.push(item);
    }
  };
  for (const emu of Object.keys(DATA)) {
    for (const at of extraAt[emu] || []) { let list = []; try { list = scannerOf(emu)(at.base || placeDir(at.at, ''), at.at) || []; } catch {} add(emu, list, at.base || placeDir(at.at, ''), { loc: 'use', why: 'added', at: at.at }); }
    const dirs = [...DATA[emu].map((d) => path.join(home, d)), ...(extra[emu] || [])];
    for (const d of dirs) {
      let real; try { real = fs.realpathSync(d); } catch { continue; }
      if (seenBase.has(emu + real)) continue; // EmuDeck links and the plain folder are the same folder
      seenBase.add(emu + real);
      let places = []; try { places = whereOf(emu)(d); } catch { places = [{ loc: 'use', why: 'default', at: {} }]; }
      for (const w of places) {
        if (w.loc === 'old' && !oldToo) continue;
        let list = []; try { list = scannerOf(emu)(d, w.at) || []; } catch {}
        add(emu, list, d, w);
      }
    }
  }
  return out;
}
// one emulator's places on this device, for the locator's list: [{ base, loc, why, place, at }]
function places(emu, { home = os.homedir(), extra = {} } = {}) {
  const out = [], seen = new Set();
  for (const d of [...(DATA[emu] || []).map((x) => path.join(home, x)), ...(extra[emu] || [])]) {
    let real; try { real = fs.realpathSync(d); } catch { continue; }
    if (seen.has(real)) continue; seen.add(real);
    let ws = []; try { ws = whereOf(emu)(d); } catch {}
    for (const w of ws) out.push({ base: d, loc: w.loc, why: w.why, place: placeDir(w.at, d), at: w.at });
  }
  return out;
}

// games: [{ id, name, ids: [serials, title IDs], discIds: [GC/Wii 6 or 4 characters, 3DS title ID] }]
// -> each save gets romIds (a shared card gets every game it holds)
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/\s*[([].*$/, '').replace(/[^a-z0-9]+/g, '');
const idNorm = (s) => String(s || '').toUpperCase().replace(/[-_.\s]/g, '');
// opts.nameOf: a code's game name from the emulators' databases (titleDb.js, 0.9.57), so a save or a memory card
// entry of a game that isn't on this device still finds it in the library by name
// 0.9.59 (owner: PS4 saves not matched): when nothing else matched, a title that is the start of exactly one game's
// title on the save's own console ("Bloodborne" and "Bloodborne: The Old Hunters Edition", or the other way round),
// at least 6 letters; two or more games that fit match none (no guessing). The save is marked loose.
const EMU_CONSOLE = { shadps4: /^ps4$/, rpcs3: /^ps3$/, ppsspp: /^psp$/, vita3k: /^(psvita|vita)$/, pcsx2: /^ps2$/, duckstation: /^(psx|ps1|ps)$/, dolphin: /^(ngc|gc|gamecube|wii)$/, cemu: /^wiiu$/, azahar: /^(3ds|n3ds|new-nintendo-3ds)$/, xenia: /^xbox-?360$/, ...Object.fromEntries(['eden', 'citron', 'yuzu', 'sudachi', 'suyu', 'torzu', 'ryujinx'].map((e) => [e, /^switch$/])) };
function looseMatch(title, emu, games) {
  const re = EMU_CONSOLE[emu], t = norm(title);
  if (!re || t.length < 6) return null;
  const ids = new Set();
  for (const g of games) { if (!re.test(g.slug || '')) continue; const n = norm(g.name); if (n.length >= 6 && (n.startsWith(t) || t.startsWith(n))) ids.add(g.id); }
  return ids.size === 1 ? [...ids][0] : null;
}
// The games a save that matched nothing is probably for (0.9.60, owner: Not Matched split into "not in my library" and "in
// my library but not synced"): games on the save's own console whose name starts the save's title (or the other way
// round) or shares most of its words. Up to 3, best first; shown as "Probably …" for you to confirm, never used on their own.
const WORD_STOP = new Set(['the', 'of', 'and', 'a', 'an', 'edition', 'version', 'game', 'usa', 'europe', 'japan']);
const wordsOf = (x) => new Set(String(x || '').toLowerCase().replace(/&/g, ' and ').replace(/\s*[([].*?[)\]]/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 1 && !WORD_STOP.has(w)));
function likely(save, games, { nameOf = null } = {}) {
  const k = save.keys || {}, re = EMU_CONSOLE[save.emu];
  const titles = [k.title, k.name, save.codeName, nameOf && k.serial ? nameOf(k.serial) : null].filter((t) => t && norm(t).length >= 4);
  if (!titles.length) return [];
  const best = new Map();
  for (const g of games) {
    if (re && g.slug && !re.test(g.slug)) continue;
    const gn = norm(g.name), gw = wordsOf(g.name);
    if (gn.length < 4) continue;
    for (const t of titles) {
      const tn = norm(t), tw = wordsOf(t);
      let score = 0;
      if (gn === tn) score = 1;
      else if (gn.startsWith(tn) || tn.startsWith(gn)) score = 0.8;
      else { const both = [...tw].filter((w) => gw.has(w)).length, all = new Set([...tw, ...gw]).size; if (tw.size >= 2 && both >= 2) score = both / all; }
      if (score >= 0.5 && score > (best.get(g.id) || 0)) best.set(g.id, score);
    }
  }
  return [...best.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
}
function match(saves, games, { nameOf = null } = {}) {
  const byId = new Map(), byGc = new Map(), byName = new Map();
  // a title: the game of that name on the save's own console (0.9.59: a PS4 save named "Bloodborne" went to a PS3 game
  // of the same name); a game whose console isn't known still counts; emulators of many consoles take the first
  const named_ = (t, emu) => { const l = byName.get(norm(t)); if (!l) return undefined; const re = EMU_CONSOLE[emu]; const g = re ? l.find((x) => re.test(x.slug || '')) || l.find((x) => !x.slug) : l[0]; return g?.id; };
  for (const g of games) {
    for (const s of g.ids || []) if (s) { const u = idNorm(s); byId.set(u, g.id); if (/^0100[0-9A-F]{12}$/.test(u) && !byId.has(u.slice(0, 13) + '000')) byId.set(u.slice(0, 13) + '000', g.id); } // a Switch update's file still names its base game
    for (const s of g.discIds || []) if (s) { const u = idNorm(s); byId.set(u, g.id); if (u.length === 6) byGc.set(u.slice(0, 4), g.id); if (u.length === 4) byGc.set(u, g.id); }
    // 0.9.60: a GameCube or Wii ID read from the game or its file name counts like a disc ID (Dolphin names saves by the
    // first 4 characters; a game in a folder, or named "[RSBE01]", never matched)
    if (!g.slug || /^(ngc|gc|gamecube|wii)$/i.test(g.slug)) for (const s of g.ids || []) { const u = idNorm(s); if (/^[A-Z0-9]{6}$/.test(u) && /^[A-Z]/.test(u) && !byGc.has(u.slice(0, 4))) byGc.set(u.slice(0, 4), g.id); }
    const k = norm(g.name); if (k.length >= 3) { if (!byName.has(k)) byName.set(k, []); byName.get(k).push(g); }
  }
  // a Switch save is the base game's: updates (…800) and add-ons map back (the last three digits cleared)
  const sw = (id) => { const u = idNorm(id); return byId.get(u) ?? byId.get(u.slice(0, 13) + '000'); };
  for (const s of saves) {
    const k = s.keys || {}, ids = new Set();
    let id = null;
    if (k.switch) id = sw(k.switch);
    if (id == null && k.serial) id = byId.get(idNorm(k.serial));
    if (id == null && k.gc) id = byGc.get(idNorm(k.gc)) ?? byId.get(idNorm(k.gc));
    if (id == null && k.n3ds) id = byId.get(idNorm(k.n3ds));
    if (id == null && k.wiiu) id = byId.get(idNorm(k.wiiu));
    if (id == null && k.x360) id = byId.get(idNorm(k.x360));
    if (id == null && (k.title || k.name)) id = named_(k.title || k.name, s.emu);
    const named = nameOf && k.serial ? nameOf(k.serial) : null;
    if (named) s.codeName = named;
    if (id == null && named) id = named_(named, s.emu);
    if (id == null && (k.title || named)) { id = looseMatch(k.title || named, s.emu, games); if (id != null) s.loose = true; }
    if (id != null) ids.add(id);
    for (const ser of s.serials || []) { let g = byId.get(idNorm(ser)); if (g == null && nameOf) { const n = nameOf(ser); if (n) g = named_(n, s.emu); } if (g != null) ids.add(g); }
    s.romIds = [...ids];
  }
  return saves;
}

// ---- What Cartridge shares in Syncthing when this device is the main one (0.9.29): one folder per console's
// saves, pointing at the emulator's real save folder (Syncthing never follows links). The folder ID is the
// same on every device and the path is each device's own, so Eden on one device and Citron on another share
// Switch saves. Ryujinx is left out: its saves are named by an index that differs per device.
const retroarchSaves = (base) => { const cfg = readText(path.join(base, 'retroarch.cfg')); let d = (/^\s*savefile_directory\s*=\s*"([^"]*)"/m.exec(cfg) || [])[1] || ''; d = d.replace(/^~(?=\/|$)/, os.homedir()).replace(/^:(?=\/|$)/, base); return !d || d === 'default' ? path.join(base, 'saves') : d; };
// 0.9.59: each folder from the save locator's place in use (a setting that moves saves moves Syncthing's folder too)
const useAt = (emu, d) => { try { return whereOf(emu)(d).find((w) => w.loc === 'use')?.at || {}; } catch { return {}; } };
const swSave = (emu) => (d) => path.join(useAt(emu, d).nand || path.join(d, 'nand'), 'user/save');
// [folder ID suffix, label, path inside the emulator's folder (Linked Folders links it), where it is now (a setting may move it)]
const SYNC = {
  eden: [['switch', 'Switch Saves', 'nand/user/save', swSave('eden')]], citron: [['switch', 'Switch Saves', 'nand/user/save', swSave('citron')]], yuzu: [['switch', 'Switch Saves', 'nand/user/save', swSave('yuzu')]],
  sudachi: [['switch', 'Switch Saves', 'nand/user/save', swSave('sudachi')]], suyu: [['switch', 'Switch Saves', 'nand/user/save', swSave('suyu')]], torzu: [['switch', 'Switch Saves', 'nand/user/save', swSave('torzu')]],
  rpcs3: [['ps3', 'PS3 Saves', 'dev_hdd0/home/00000001/savedata', (d) => path.join(useAt('rpcs3', d).hdd0 || path.join(d, 'dev_hdd0'), 'home/00000001/savedata')]],
  ppsspp: [['psp', 'PSP Saves', 'PSP/SAVEDATA']],
  vita3k: [['vita', 'Vita Saves', 'ux0/user/00/savedata', (d) => path.join(useAt('vita3k', d).pref || d, 'ux0/user/00/savedata')]],
  shadps4: [['ps4', 'PS4 Saves', shadSaveDir]],
  pcsx2: [['ps2', 'PS2 Memory Cards', 'memcards', (d) => useAt('pcsx2', d).memcards || path.join(d, 'memcards')]],
  duckstation: [['ps1', 'PS1 Memory Cards', 'memcards', (d) => useAt('duckstation', d).memcards || path.join(d, 'memcards')]],
  dolphin: [['gc', 'GameCube Saves', 'GC'], ['wii', 'Wii Saves', 'Wii/title/00010000', (d) => path.join(useAt('dolphin', d).wii || path.join(d, 'Wii'), 'title/00010000')]],
  cemu: [['wiiu', 'Wii U Saves', 'mlc01/usr/save', (d) => path.join(useAt('cemu', d).mlc || path.join(d, 'mlc01'), 'usr/save')]],
  azahar: [['3ds', '3DS Saves', 'sdmc/Nintendo 3DS', (d) => path.join(useAt('azahar', d).sdmc || path.join(d, 'sdmc'), 'Nintendo 3DS')]],
  xenia: [['x360', 'Xbox 360 Saves', 'content']],
  retroarch: [['retroarch', 'RetroArch Saves', retroarchSaves]],
};
const SYNC_PREFIX = 'cartridge-saves-';
// -> [{ id, label, emu, emuName, path, exists, at }]: per folder ID the copy on this device with the newest
// saves (an emulator that's installed but never played still gets its folder, so saves can arrive)
function syncRoots({ home = os.homedir(), extra = {} } = {}) {
  const best = new Map(), seen = new Set();
  for (const emu of Object.keys(SYNC)) {
    for (const d of [...(DATA[emu] || []).map((x) => path.join(home, x)), ...(extra[emu] || [])]) {
      let real; try { real = fs.realpathSync(d); } catch { continue; }
      if (seen.has(emu + real)) continue;
      seen.add(emu + real);
      for (const [suffix, label, rel, now] of SYNC[emu]) {
        const p = now ? now(d) : typeof rel === 'function' ? rel(d) : path.join(d, rel);
        let at = 0, exists = false; try { at = fs.statSync(p).mtimeMs; exists = true; } catch {}
        const id = SYNC_PREFIX + suffix, cur = best.get(id);
        if (!cur || (exists && !cur.exists) || (exists === cur.exists && at > cur.at)) best.set(id, { id, label, emu, emuName: NAMES[emu] || emu, path: p, exists, at });
      }
    }
  }
  return [...best.values()];
}

module.exports = { likely, WHERE, whereOf, places, placeDir, iniGet, cfgDirs, ls, PS4_ID, scan, match, syncRoots, SYNC, SYNC_PREFIX, sfo, cardSerials, ryujinxIndex, sizeOf, DATA, NAMES, SCAN, shadSaveDirs, shadSaveDir };
