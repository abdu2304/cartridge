'use strict';
// Cartridge Installer (0.9.24, owner: saves and textures reachable from the Emulation folder, as EmuDeck
// lays it out). Emulation/saves/<emulator>/<kind> and Emulation/storage/<emulator>/<kind> are links to
// the emulator's own folders. Nothing is moved, copied or made inside the emulator's folders: a link
// can point at a folder the emulator only makes on its first run. A link or folder already there stays.
const fs = require('fs');
const path = require('path');

// per emulator: its data folder for each install kind (relative to home), then saves/storage folders inside
const DATA = {
  pcsx2: { app: '.config/PCSX2', fp: '.var/app/net.pcsx2.PCSX2/config/PCSX2', saves: { saves: 'memcards', states: 'sstates' }, storage: { textures: 'textures', cheats: 'cheats' } },
  duckstation: { app: '.local/share/duckstation', fp: '.var/app/org.duckstation.DuckStation/data/duckstation', saves: { saves: 'memcards', states: 'savestates' }, storage: { textures: 'textures' } },
  dolphin: { app: '.local/share/dolphin-emu', fp: '.var/app/org.DolphinEmu.dolphin-emu/data/dolphin-emu', saves: { GC: 'GC', Wii: 'Wii', states: 'StateSaves' }, storage: { textures: 'Load/Textures', mods: 'Load/GraphicMods' } },
  primehack: { app: '.local/share/primehack', fp: '.var/app/io.github.shiiion.primehack/data/dolphin-emu', saves: { GC: 'GC', Wii: 'Wii', states: 'StateSaves' }, storage: { textures: 'Load/Textures' } },
  ppsspp: { app: '.config/ppsspp', fp: '.var/app/org.ppsspp.PPSSPP/config/ppsspp', saves: { saves: 'PSP/SAVEDATA', states: 'PSP/PPSSPP_STATE' }, storage: { textures: 'PSP/TEXTURES' } },
  rpcs3: { app: '.config/rpcs3', fp: '.var/app/net.rpcs3.RPCS3/config/rpcs3', saves: { saves: 'dev_hdd0/home/00000001/savedata' }, storage: { games: 'dev_hdd0/game' } },
  shadps4: { app: '.local/share/shadPS4', saves: { saves: 'home' }, storage: { mods: 'mods' } }, // 0.9.57: saves are in home/<user ID>/savedata (shadPS4's save_instance.cpp)
  vita3k: { app: '.local/share/Vita3K/Vita3K', saves: { saves: 'ux0/user/00/savedata' }, storage: { games: 'ux0/app' } },
  cemu: { app: '.local/share/Cemu', fp: '.var/app/info.cemu.Cemu/data/Cemu', saves: { saves: 'mlc01/usr/save' }, storage: { graphicPacks: 'graphicPacks' } },
  eden: { app: '.local/share/eden', fp: '.var/app/dev.eden_emu.eden/data/eden', saves: { saves: 'nand/user/save' }, storage: { mods: 'load', nand: 'nand' } },
  ryujinx: { app: '.config/Ryujinx', fp: '.var/app/io.github.ryubing.Ryujinx/config/Ryujinx', saves: { saves: 'bis/user/save' }, storage: { mods: 'mods' } },
  azahar: { app: '.local/share/azahar-emu', fp: '.var/app/org.azahar_emu.Azahar/data/azahar-emu', saves: { saves: 'sdmc', states: 'states' }, storage: { textures: 'load/textures', mods: 'load/mods' } },
  melonds: { app: '.config/melonDS', fp: '.var/app/net.kuribo64.melonDS/config/melonDS', saves: {}, storage: {} },
  xemu: { app: '.local/share/xemu/xemu', fp: '.var/app/app.xemu.xemu/data/xemu/xemu', saves: {}, storage: {} },
  mgba: { app: '.config/mgba', fp: '.var/app/io.mgba.mGBA/config/mgba', saves: {}, storage: {} },
  flycast: { app: '.local/share/flycast', fp: '.var/app/org.flycast.Flycast/data/flycast', saves: { saves: '' }, storage: { textures: 'textures' } },
};

// [{ link, target }] for one emulator; kind 'flatpak' uses its Flatpak's folders
function plan(id, { root, home, kind } = {}) {
  const d = DATA[id];
  if (!d || !root || !home) return [];
  const base = path.join(home, (kind === 'flatpak' && d.fp) || d.app);
  const out = [];
  for (const [area, map] of [['saves', d.saves], ['storage', d.storage]]) for (const [name, rel] of Object.entries(map || {})) out.push({ link: path.join(root, area, id, name), target: rel ? path.join(base, rel) : base });
  return out;
}
// makes the links that aren't there; returns how many were made
function make(id, opts) {
  let n = 0;
  for (const { link, target } of plan(id, opts)) {
    try { fs.lstatSync(link); continue; } catch {} // anything already there is left alone
    try { fs.mkdirSync(path.dirname(link), { recursive: true }); fs.symlinkSync(target, link); n++; } catch {}
  }
  return n;
}

module.exports = { DATA, plan, make };
