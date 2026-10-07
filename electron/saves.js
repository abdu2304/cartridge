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

const ls = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } };
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
      out[k] = fmt === 0x0404 ? buf.readUInt32LE(data + off) : buf.toString('utf8', data + off, data + off + len).replace(/\0+$/, '');
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
// shadPS4's save folders under one of its folders (0.9.57): every <home>/<user ID>/savedata first (current builds),
// then the older savedata/ and a portable copy's user/savedata. Each holds <CUSA…> folders or <user>/<CUSA…>.
function shadHome(base) {
  for (const f of [path.join(base, 'config.json'), path.join(base, 'user/config.json')]) {
    const m = /"home_dir"\s*:\s*"([^"]+)"/.exec(readText(f));
    if (m && path.isAbsolute(m[1])) return m[1];
  }
  return null;
}
function shadSaveDirs(base) {
  const homes = [shadHome(base), path.join(base, 'home'), path.join(base, 'user/home')].filter(Boolean);
  const out = [];
  for (const h of homes) for (const u of ls(h)) if (u.isDirectory()) out.push(path.join(h, u.name, 'savedata'));
  out.push(path.join(base, 'savedata'), path.join(base, 'user/savedata'));
  return [...new Set(out)].filter((d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
}
// where shadPS4 keeps its saves on this device now: the first current-style folder, else the old one
const shadSaveDir = (base) => shadSaveDirs(base).find((d) => /[\/]home[\/][^\/]+[\/]savedata$/.test(d)) || shadSaveDirs(base)[0] || path.join(base, 'home/1000/savedata');
const SCAN = {
  // nand/user/save/0000000000000000/<user ID>/<title ID>/ and the newer account/<uuid>/<title ID>/0 layout
  switch(base, emu) {
    const out = [], root = path.join(base, 'nand/user/save');
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
  rpcs3(base) {
    const out = [];
    for (const u of ls(path.join(base, 'dev_hdd0/home'))) if (u.isDirectory()) {
      const sd = path.join(base, 'dev_hdd0/home', u.name, 'savedata');
      for (const s of ls(sd)) if (s.isDirectory() && /^[A-Z]{4}\d{5}/.test(s.name)) {
        const p = sfo(path.join(sd, s.name, 'PARAM.SFO'));
        out.push({ emu: 'rpcs3', kind: 'save', path: path.join(sd, s.name), label: p.TITLE || '', keys: { serial: s.name.slice(0, 9), title: p.TITLE || '' } });
      }
    }
    return out;
  },
  ppsspp(base) {
    const out = [], sd = path.join(base, 'PSP/SAVEDATA');
    for (const s of ls(sd)) if (s.isDirectory() && /^[A-Z]{4}\d{5}/.test(s.name)) {
      const p = sfo(path.join(sd, s.name, 'PARAM.SFO'));
      out.push({ emu: 'ppsspp', kind: 'save', path: path.join(sd, s.name), label: p.TITLE || '', keys: { serial: s.name.slice(0, 9), title: p.TITLE || '' } });
    }
    return out;
  },
  // ux0/user/00/savedata/<title ID>
  vita3k(base) {
    const out = [], sd = path.join(base, 'ux0/user/00/savedata');
    for (const s of ls(sd)) if (s.isDirectory() && /^[A-Z]{4}\d{5}$/.test(s.name)) out.push({ emu: 'vita3k', kind: 'save', path: path.join(sd, s.name), keys: { serial: s.name } });
    return out;
  },
  // 0.9.57 (owner: "that's not shadPS4's save folder"; read from shadPS4's save_instance.cpp and path_util.cpp): saves
  // live in <home>/<user ID>/savedata/<CUSA…>/<slot>, <home> being its home_dir setting or <its folder>/home. Older
  // builds: <its folder>/savedata/<user>/<CUSA…> or savedata/<CUSA…>; a portable copy keeps its folder in user/.
  shadps4(base) {
    const out = [], seen = new Set(), PS4 = /^(CUSA|PCJS|PLJM|PCAS|PCKS)\d{5}$/;
    const add = (p, id) => { if (seen.has(p)) return; seen.add(p); const t = [p, ...ls(p).filter((x) => x.isDirectory()).map((x) => path.join(p, x.name))].map((d) => sfo(path.join(d, 'sce_sys/param.sfo')).TITLE).find(Boolean); /* each save slot folder has its own param.sfo */ out.push({ emu: 'shadps4', kind: 'save', path: p, label: t || '', keys: { serial: id, title: t || '' } }); };
    for (const sd of shadSaveDirs(base)) for (const a of ls(sd)) if (a.isDirectory()) {
      if (PS4.test(a.name)) { add(path.join(sd, a.name), a.name); continue; }
      for (const b of ls(path.join(sd, a.name))) if (b.isDirectory() && PS4.test(b.name)) add(path.join(sd, a.name, b.name), b.name);
    }
    return out;
  },

  // memcards/*.ps2: one card holds many games (or a folder card per game)
  pcsx2(base) {
    const out = [], md = path.join(base, 'memcards');
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
  duckstation(base) {
    const out = [], md = path.join(base, 'memcards');
    for (const c of ls(md)) if (c.isFile() && /\.mcd$/i.test(c.name)) {
      const p = path.join(md, c.name), stem = c.name.replace(/_\d+\.mcd$/i, '').replace(/\.mcd$/i, '');
      const shared = /^shared_card/i.test(stem);
      const serial = (/^([A-Z]{4})[-_]?(\d{5})$/i.exec(stem) || []).slice(1).join('').toUpperCase();
      out.push({ emu: 'duckstation', kind: 'card', path: p, label: c.name, keys: shared ? {} : serial ? { serial } : { name: stem }, shared, serials: cardSerials(p) });
    }
    return out;
  },
  // GC/<region>/Card A|B/*.gci (GCI folders, "01-GALE-…") or MemoryCardA.*.raw (shared), Wii/title/00010000/<ID4 hex>/data
  dolphin(base) {
    const out = [];
    for (const r of ls(path.join(base, 'GC'))) if (r.isDirectory()) {
      for (const c of ls(path.join(base, 'GC', r.name))) {
        const p = path.join(base, 'GC', r.name, c.name);
        if (c.isDirectory()) for (const g of ls(p)) { const m = /^[0-9A-Z]{2}-([0-9A-Z]{4})-/i.exec(g.name); if (g.isFile() && m) out.push({ emu: 'dolphin', kind: 'save', path: path.join(p, g.name), label: g.name, keys: { gc: m[1].toUpperCase() } }); }
        else if (/\.raw$/i.test(c.name)) out.push({ emu: 'dolphin', kind: 'card', path: p, label: c.name, keys: {}, shared: true, serials: [] });
      }
    }
    const wt = path.join(base, 'Wii/title/00010000');
    for (const t of ls(wt)) if (t.isDirectory() && hex(t.name, 8) && isDir(path.join(wt, t.name, 'data'))) {
      const id4 = Buffer.from(t.name, 'hex').toString('latin1');
      if (/^[0-9A-Z]{4}$/.test(id4)) out.push({ emu: 'dolphin', kind: 'save', path: path.join(wt, t.name, 'data'), keys: { gc: id4 } });
    }
    return out;
  },
  // mlc01/usr/save/00050000/<title ID low>/ ; the name from mlc01/usr/title/…/meta/meta.xml when installed
  cemu(base) {
    const out = [], sd = path.join(base, 'mlc01/usr/save/00050000');
    for (const t of ls(sd)) if (t.isDirectory() && hex(t.name, 8)) {
      const meta = readText(path.join(base, 'mlc01/usr/title/00050000', t.name, 'meta/meta.xml'));
      const name = (/<longname_en[^>]*>([^<]+)</.exec(meta) || [])[1] || '';
      out.push({ emu: 'cemu', kind: 'save', path: path.join(sd, t.name), label: name.replace(/\s+/g, ' ').trim(), keys: { wiiu: ('00050000' + t.name).toUpperCase(), title: name } });
    }
    return out;
  },
  // sdmc/Nintendo 3DS/<id0>/<id1>/title/00040000/<title ID low>/data
  azahar(base) {
    const out = [], n = path.join(base, 'sdmc/Nintendo 3DS');
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
        if (/\.(srm|sav|mcd|mcr|eep|sra|fla|mpk|rtc|dsv)$/i.test(e.name)) out.push({ emu: 'retroarch', kind: 'save', path: p, label: e.name, keys: { name: e.name.replace(/\.[^.]+$/, '') } });
      }
    };
    walk(sd, 0);
    return out;
  },
};
const scannerOf = (emu) => (SWITCH.includes(emu) ? (b) => SCAN.switch(b, emu) : SCAN[emu]);

// every save on this device. extra: { [emu]: [more data folders] } (portable installs, custom folders)
function scan({ home = os.homedir(), extra = {}, withSize = true } = {}) {
  const out = [], seen = new Set();
  for (const emu of Object.keys(DATA)) {
    const dirs = [...DATA[emu].map((d) => path.join(home, d)), ...(extra[emu] || [])];
    for (const d of dirs) {
      let real; try { real = fs.realpathSync(d); } catch { continue; }
      if (seen.has(emu + real)) continue; // EmuDeck links and the plain folder are the same folder
      seen.add(emu + real);
      let list = []; try { list = scannerOf(emu)(d) || []; } catch {}
      for (const s of list) out.push({ ...s, emuName: NAMES[emu] || emu, base: d, ...(withSize ? sizeOf(s.path) : {}) });
    }
  }
  return out;
}

// games: [{ id, name, ids: [serials, title IDs], discIds: [GC/Wii 6 or 4 characters, 3DS title ID] }]
// -> each save gets romIds (a shared card gets every game it holds)
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/\s*[([].*$/, '').replace(/[^a-z0-9]+/g, '');
const idNorm = (s) => String(s || '').toUpperCase().replace(/[-_.\s]/g, '');
function match(saves, games) {
  const byId = new Map(), byGc = new Map(), byName = new Map();
  for (const g of games) {
    for (const s of g.ids || []) if (s) { const u = idNorm(s); byId.set(u, g.id); if (/^0100[0-9A-F]{12}$/.test(u) && !byId.has(u.slice(0, 13) + '000')) byId.set(u.slice(0, 13) + '000', g.id); } // a Switch update's file still names its base game
    for (const s of g.discIds || []) if (s) { const u = idNorm(s); byId.set(u, g.id); if (u.length === 6) byGc.set(u.slice(0, 4), g.id); if (u.length === 4) byGc.set(u, g.id); }
    const k = norm(g.name); if (k.length >= 3 && !byName.has(k)) byName.set(k, g.id);
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
    if (id == null && (k.title || k.name)) id = byName.get(norm(k.title || k.name));
    if (id != null) ids.add(id);
    for (const ser of s.serials || []) { const g = byId.get(idNorm(ser)); if (g != null) ids.add(g); }
    s.romIds = [...ids];
  }
  return saves;
}

// ---- What Cartridge shares in Syncthing when this device is the main one (0.9.29): one folder per console's
// saves, pointing at the emulator's real save folder (Syncthing never follows links). The folder ID is the
// same on every device and the path is each device's own, so Eden on one device and Citron on another share
// Switch saves. Ryujinx is left out: its saves are named by an index that differs per device.
const retroarchSaves = (base) => { const cfg = readText(path.join(base, 'retroarch.cfg')); let d = (/^\s*savefile_directory\s*=\s*"([^"]*)"/m.exec(cfg) || [])[1] || ''; d = d.replace(/^~(?=\/|$)/, os.homedir()).replace(/^:(?=\/|$)/, base); return !d || d === 'default' ? path.join(base, 'saves') : d; };
const SYNC = {
  eden: [['switch', 'Switch Saves', 'nand/user/save']], citron: [['switch', 'Switch Saves', 'nand/user/save']], yuzu: [['switch', 'Switch Saves', 'nand/user/save']],
  sudachi: [['switch', 'Switch Saves', 'nand/user/save']], suyu: [['switch', 'Switch Saves', 'nand/user/save']], torzu: [['switch', 'Switch Saves', 'nand/user/save']],
  rpcs3: [['ps3', 'PS3 Saves', 'dev_hdd0/home/00000001/savedata']],
  ppsspp: [['psp', 'PSP Saves', 'PSP/SAVEDATA']],
  vita3k: [['vita', 'Vita Saves', 'ux0/user/00/savedata']],
  shadps4: [['ps4', 'PS4 Saves', shadSaveDir]],
  pcsx2: [['ps2', 'PS2 Memory Cards', 'memcards']],
  duckstation: [['ps1', 'PS1 Memory Cards', 'memcards']],
  dolphin: [['gc', 'GameCube Saves', 'GC'], ['wii', 'Wii Saves', 'Wii/title/00010000']],
  cemu: [['wiiu', 'Wii U Saves', 'mlc01/usr/save']],
  azahar: [['3ds', '3DS Saves', 'sdmc/Nintendo 3DS']],
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
      for (const [suffix, label, rel] of SYNC[emu]) {
        const p = typeof rel === 'function' ? rel(d) : path.join(d, rel);
        let at = 0, exists = false; try { at = fs.statSync(p).mtimeMs; exists = true; } catch {}
        const id = SYNC_PREFIX + suffix, cur = best.get(id);
        if (!cur || (exists && !cur.exists) || (exists === cur.exists && at > cur.at)) best.set(id, { id, label, emu, emuName: NAMES[emu] || emu, path: p, exists, at });
      }
    }
  }
  return [...best.values()];
}

module.exports = { scan, match, syncRoots, SYNC, SYNC_PREFIX, sfo, cardSerials, ryujinxIndex, sizeOf, DATA, NAMES, SCAN, shadSaveDirs, shadSaveDir };
