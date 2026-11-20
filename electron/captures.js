'use strict';
// Captures (0.9.95, owner's pick from the "make it OP" list): every screenshot and clip your games made, in one
// gallery, matched to the game where it can be. Read only: Cartridge never moves, renames or deletes a capture.
// Where they come from:
//   - Steam: <Steam>/userdata/<account>/760/remote/<appid>/screenshots (the Steam button, the Deck's ... + R1). A
//     shortcut's appid is Cartridge's own record of which game or port it starts (steamManager.captureSteam).
//   - Emulators: their screenshot and recording folders, found by name (screenshots, snaps, ScreenShots, records...)
//     a level or two under each emulator's own folders, native and Flatpak, and under EmuDeck's Emulation/storage.
//     Found by name rather than listed one by one, so another version or fork that moves its folder is still found.
// A capture is matched to a game by its Steam shortcut, else by its file or folder name against the library's names
// (the longest name in it wins, dates and numbers taken off first). Tested in test/captures.test.js.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const CAP_DIR = /^(screenshots?|snaps|snapshots|screenshot|captures?|records|recordings|videos)$/i;
const IMG = /\.(png|jpe?g|webp|bmp)$/i, VID = /\.(mp4|webm|mkv|mov)$/i;

// each emulator's own folders (native, then Flatpak); a capture folder is looked for one or two levels under these
function emulatorRoots(home) {
  const H = (...p) => path.join(home, ...p), F = (id, ...p) => path.join(home, '.var/app', id, ...p);
  return [
    ['RetroArch', [H('.config/retroarch'), F('org.libretro.RetroArch', 'config/retroarch')]],
    ['PCSX2', [H('.config/PCSX2'), F('net.pcsx2.PCSX2', 'config/PCSX2')]],
    ['DuckStation', [H('.local/share/duckstation'), F('org.duckstation.DuckStation', 'config/duckstation'), F('org.duckstation.DuckStation', 'data/duckstation')]],
    ['PPSSPP', [H('.config/ppsspp/PSP'), F('org.ppsspp.PPSSPP', 'config/ppsspp/PSP')]],
    ['Dolphin', [H('.local/share/dolphin-emu'), F('org.DolphinEmu.dolphin-emu', 'data/dolphin-emu')]],
    ['RPCS3', [H('.config/rpcs3'), F('net.rpcs3.RPCS3', 'config/rpcs3')]],
    ['Cemu', [H('.local/share/Cemu'), F('info.cemu.Cemu', 'data/Cemu')]],
    ['Eden', [H('.local/share/eden'), F('dev.eden_emu.eden', 'data/eden')]],
    ['Citron', [H('.local/share/citron'), F('org.citron_emu.citron', 'data/citron')]],
    ['Yuzu', ['yuzu', 'sudachi', 'suyu', 'torzu'].map((n) => H('.local/share', n))],
    ['Ryujinx', [H('.config/Ryujinx'), F('io.github.ryubing.Ryujinx', 'config/Ryujinx'), F('org.ryujinx.Ryujinx', 'config/Ryujinx')]],
    ['Azahar', [H('.local/share/azahar-emu'), H('.local/share/citra-emu'), H('.local/share/lime3ds-emu'), F('org.azahar_emu.Azahar', 'data/azahar-emu')]],
    ['Flycast', [H('.local/share/flycast'), F('org.flycast.Flycast', 'data/flycast')]],
    ['xemu', [H('.local/share/xemu/xemu'), F('app.xemu.xemu', 'data/xemu/xemu')]],
    ['Vita3K', [H('.local/share/Vita3K/Vita3K'), F('org.vita3k.Vita3K', 'data/Vita3K/Vita3K')]],
    ['shadPS4', [H('.local/share/shadPS4'), F('net.shadps4.shadPS4', 'data/shadPS4')]],
  ];
}
const isDir = async (p) => (await fsp.stat(p).catch(() => null))?.isDirectory() || false;
const ls = async (p) => fsp.readdir(p, { withFileTypes: true }).catch(() => []);

// -> [{ dir, label }]: capture folders under each emulator root (to depth 2) and under Emulation/storage/<emu> (depth 2)
async function captureDirs({ home, emulationRoots = [] }) {
  const out = [], seen = new Set();
  const add = async (dir, label) => { const r = await fsp.realpath(dir).catch(() => null); if (r && !seen.has(r)) { seen.add(r); out.push({ dir: r, label }); } };
  const under = async (root, label, depth) => {
    for (const e of await ls(root)) {
      if (!e.isDirectory() && !e.isSymbolicLink()) continue;
      const p = path.join(root, e.name);
      if (CAP_DIR.test(e.name)) { if (await isDir(p)) await add(p, label); }
      else if (depth > 1 && !/^(cache|shadercache|shaders?|logs?|nand|sdmc|dev_hdd0|games?|roms?|bios|saves?|states?|memcards|textures|load|dump|mods)$/i.test(e.name)) await under(p, label, depth - 1);
    }
  };
  for (const [label, roots] of emulatorRoots(home)) for (const r of roots) if (await isDir(r)) await under(r, label, 2);
  for (const er of emulationRoots) {
    const st = path.join(er, 'storage');
    for (const e of await ls(st)) if (e.isDirectory() || e.isSymbolicLink()) await under(path.join(st, e.name), labelOf(e.name), 2);
  }
  return out;
}
const LABELS = { retroarch: 'RetroArch', pcsx2: 'PCSX2', duckstation: 'DuckStation', ppsspp: 'PPSSPP', dolphin: 'Dolphin', rpcs3: 'RPCS3', cemu: 'Cemu', eden: 'Eden', yuzu: 'Yuzu', ryujinx: 'Ryujinx', azahar: 'Azahar', citra: 'Azahar', flycast: 'Flycast', xemu: 'xemu', vita3k: 'Vita3K', shadps4: 'shadPS4' };
const labelOf = (n) => LABELS[String(n).toLowerCase()] || n;

// names for matching: lower case, accents and punctuation gone, "the" kept (it can be all a short name has)
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
// a capture's own name without what the emulator added: dates, times, counters, "screenshot", the extension
function capName(file) {
  return norm(path.basename(file).replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/\b(19|20)\d{2}[-_. ]?\d{2}[-_. ]?\d{2}\b.*$/, ' ') // a date and anything after it
    .replace(/\b\d{6}[-_]\d{6}\b.*$/, ' ') // RetroArch's 241120-101500
    .replace(/[-_ ]\d{1,5}$/, ' ').replace(/^screenshot[-_ ]*/i, ' '));
}
// roms: [{ id, name }] -> (text) => romId | null; the longest library name found whole inside the text
function matcher(roms) {
  const list = roms.map((r) => ({ id: r.id, n: norm(r.name).replace(/\b(usa|europe|japan|world|en|fr|de|es|it|rev \d+|v\d[\d.]*)\b/g, ' ').replace(/\s+/g, ' ').trim() })).filter((r) => r.n.length >= 3).sort((a, b) => b.n.length - a.n.length);
  return (text) => {
    const t = ' ' + norm(text) + ' ';
    if (t.trim().length < 3) return null;
    for (const r of list) if (t.includes(' ' + r.n + ' ')) return r.id;
    return null;
  };
}
const idOf = (p) => crypto.createHash('sha1').update(p).digest('hex').slice(0, 20);

// -> [{ id, path, kind, at, size, source, romId, title }], newest first, at most `limit`
async function scan({ home, emulationRoots = [], steam = { dirs: [], apps: {} }, roms = [], limit = 4000 }) {
  const match = matcher(roms), items = [];
  const push = async (p, source, romId, title) => {
    const kind = IMG.test(p) ? 'image' : VID.test(p) ? 'video' : null;
    if (!kind) return;
    const st = await fsp.stat(p).catch(() => null);
    if (!st?.isFile() || st.size < 512) return;
    items.push({ id: idOf(p), path: p, kind, at: st.mtimeMs, size: st.size, source, romId: romId ?? null, title: title || '' });
  };
  // Steam: only shortcuts Cartridge knows (its games and ports), each under its own appid
  for (const remote of steam.dirs || []) {
    for (const e of await ls(remote)) {
      const app = steam.apps?.[e.name];
      if (!app) continue;
      const dir = path.join(remote, e.name, 'screenshots');
      for (const f of await ls(dir)) if (f.isFile()) await push(path.join(dir, f.name), 'Steam', app.romId, app.name);
    }
  }
  for (const { dir, label } of await captureDirs({ home, emulationRoots })) {
    const walk = async (d, depth, hint) => {
      for (const e of await ls(d)) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (depth > 0 && !/^thumbnails?$/i.test(e.name)) await walk(p, depth - 1, e.name); continue; }
        if (!e.isFile()) continue;
        const own = capName(e.name);
        const romId = match(own) ?? (hint ? match(hint) : null);
        await push(p, label, romId, romId == null ? (hint && !/^[0-9A-F]{4,}$/i.test(hint) ? hint : '') : '');
      }
    };
    await walk(dir, 2, null);
  }
  items.sort((a, b) => b.at - a.at);
  return items.slice(0, limit);
}

module.exports = { scan, captureDirs, emulatorRoots, matcher, capName, norm, IMG, VID };
