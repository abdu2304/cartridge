'use strict';
// The mod rule book (0.9.52, owner: "Cartridge needs to know how each emulator installs them and the correct path, so
// you don't just download the Fugazi"). One entry per layout Cartridge can install, with where it goes, what an archive
// must hold for Cartridge to accept it, what has to be switched on, and how Cartridge knows it is in place. The mods
// engine offers a mod source for a game only when an emulator installed for it has a rule here; anything else is
// refused with the reason instead of being unpacked somewhere and hoped for.
//
// Where the paths come from (each emulator's own source or guide, read for 0.9.16 to 0.9.38):
//   PCSX2       pcsx2/Config.h Folders.Textures, GS/Renderers/HW/GSTextureReplacements.cpp (<serial>/replacements),
//               Patch.cpp (patches/*.pnach listed in the game's Patches)
//   DuckStation core/settings.cpp FolderTextures, gpu_hw_texture_cache.cpp (<serial>/replacements, config.yaml)
//   PPSSPP      Core/TextureReplacer.cpp (PSP/TEXTURES/<game ID>/textures.ini or textures.zip)
//   Dolphin     VideoCommon/HiresTextures.cpp (Load/Textures/<ID6 or ID3>, any depth),
//               VideoCommon/GraphicsModSystem (Load/GraphicMods/<mod>/metadata.json)
//   Azahar      core/file_sys/... custom_tex_manager.cpp (load/textures/<title ID>), layered_fs.cpp (load/mods/<title ID>)
//   Cemu        Cafe/GraphicPack/GraphicPack2.cpp (graphicPacks/<pack>/rules.txt)
//   Eden/yuzu   core/file_sys/patch_manager.cpp (load/<TITLE ID>/<mod>/{exefs,romfs,romfs_ext,cheats})
//   Ryujinx     Ryujinx.HLE/HOS/ModLoader.cs (mods/contents/<title id>/<mod>/{exefs,romfs,cheats})
//   shadPS4     core/file_sys/fs.cpp probe_overlay ("<game folder>-mods", laid over the game read only)
//   RetroArch   no mod folders: ROM hacks only, as a patch beside the game (soft patching, tasks/task_patch.c)
// RPCS3 mods were scrapped (owner, 0.9.52); its patches and game updates have their own pages.
const RULES = {
  ps2: { emu: 'pcsx2', what: 'EmuCoreX texture pack', where: '<PCSX2 textures>/<serial>/replacements/', needs: 'PNG or DDS files in a replacements folder', id: 'serial', on: 'PCSX2: Load Textures (Cartridge turns it on)' },
  pcsx2: { emu: 'pcsx2', what: 'Textures or a .pnach patch', where: '<PCSX2 textures>/<serial>/replacements/, or PCSX2/patches/ for .pnach', needs: 'pictures (PNG, DDS...) or .pnach files', id: 'serial', on: 'PCSX2: Load Textures (Cartridge turns it on); a patch is ticked in the game\'s Patches' },
  duckstation: { emu: 'duckstation', what: 'Textures', where: '<DuckStation textures>/<serial>/replacements/ (+ config.yaml)', needs: 'pictures, or a replacements folder', id: 'serial', on: 'DuckStation: Enable Texture Replacements (Cartridge turns it on)' },
  ppsspp: { emu: 'ppsspp', what: 'Textures', where: 'PSP/TEXTURES/<game ID>/', needs: 'a textures.ini or textures.zip (and its pictures)', id: 'gameId', on: 'PPSSPP: Replace textures (on by default)' },
  dolphin: { emu: 'dolphin', what: 'Textures or a graphics mod', where: 'Load/Textures/<game ID>/, or Load/GraphicMods/<mod>/', needs: 'pictures, or a metadata.json (graphics mod)', id: 'gameId', on: 'Dolphin: Load Custom Textures (Cartridge turns it on); graphics mods in Graphics → Advanced' },
  azahar: { emu: 'azahar', what: 'Textures or a game mod', where: 'load/textures/<title ID>/, or load/mods/<title ID>/', needs: 'pictures, or romfs/exefs/code.ips/exheader.bin', id: 'titleId', on: 'Azahar: Use Custom Textures (Cartridge turns it on); mods load by themselves' },
  citra: { emu: 'citra', what: 'Textures or a game mod', where: 'load/textures/<title ID>/, or load/mods/<title ID>/', needs: 'pictures, or romfs/exefs/code.ips/exheader.bin', id: 'titleId', on: 'Citra: Use Custom Textures (Cartridge turns it on)' },
  cemu: { emu: 'cemu', what: 'Graphic pack', where: 'graphicPacks/<pack>/', needs: 'a rules.txt in each pack', id: '', on: 'Cemu: Options → Graphic packs, tick the pack' },
  switch: { emu: 'eden, citron, yuzu, ryujinx', what: 'Game mod', where: 'Eden and forks: load/<TITLE ID>/<mod>/; Ryujinx: mods/contents/<title id>/<mod>/', needs: 'romfs, romfs_ext, exefs, cheats, exefs_patches, or .ips/.pchtxt patches', id: 'switchId', on: 'loaded by themselves; turn single ones off in the game\'s Add-Ons (Eden) or Manage Mods (Ryujinx)' },
  shadps4: { emu: 'shadps4', what: 'Game mod', where: '<game folder>-mods/ beside the game (the game is never touched)', needs: 'folders named like the game\'s own (dvdroot_ps4, Image0...)', id: '', on: 'loaded by themselves' },
};
// emulator id -> rule (the Switch family shares one)
const SWITCH = /^(eden|lichii|citron|yuzu|sudachi|suyu|torzu|ryujinx)$/;
function kindOf(emuId, source) {
  if (source === 'ps2') return 'ps2';
  if (SWITCH.test(emuId)) return 'switch';
  return RULES[emuId] && emuId !== 'ps2' ? emuId : null;
}
// can this emulator copy take mods from a mod site (GameBanana, Nexus)? (EmuCoreX is PS2 textures only)
const takesMods = (emuId) => !!kindOf(emuId);
// why an archive was refused, in the rule's words
const refusal = (kind) => (RULES[kind] ? `This doesn’t look like a ${RULES[kind].what.toLowerCase()} for this emulator: Cartridge needs ${RULES[kind].needs}, so nothing was installed.` : 'Cartridge doesn’t know where this emulator keeps mods, so nothing was installed.');
module.exports = { RULES, kindOf, takesMods, refusal, SWITCH };
