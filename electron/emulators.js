// Every emulator Cartridge knows how to start, for its own reference. Only the ones found on the
// device are ever offered. Sources: EmuDeck's Steam ROM Manager parsers (EmuDeck/configs/
// steam-rom-manager) and Steam ROM Manager's own presets (SteamGridDB/steam-rom-manager files/
// presets), which are what people's working shortcuts use.
//
// Each standalone emulator: label, EmuDeck launcher scripts, AppImage file name pattern, Flatpak ids,
// program names (distro packages), launch args ({ROM} the game, {DIR} its folder, {NAME} the file
// name without extension), args per console where they differ, and the consoles it runs.
// Consoles use Cartridge's keys (platformMap.js).
const EMU = {
  pcsx2: { label: 'PCSX2', scripts: ['pcsx2-qt.sh', 'pcsx2.sh'], app: /pcsx2/i, fp: ['net.pcsx2.PCSX2'], bin: ['pcsx2-qt', 'pcsx2'], args: '-batch -fullscreen -nogui "{ROM}"', for: ['ps2'] },
  duckstation: { label: 'DuckStation', scripts: ['duckstation.sh'], app: /duckstation/i, fp: ['org.duckstation.DuckStation'], bin: ['duckstation-qt', 'duckstation'], args: '-batch -fullscreen -nogui "{ROM}"', for: ['psx'] },
  dolphin: { label: 'Dolphin', scripts: ['dolphin-emu.sh'], app: /dolphin/i, fp: ['org.DolphinEmu.dolphin-emu'], bin: ['dolphin-emu'], args: '-b -e "{ROM}"', for: ['gc', 'wii'] },
  cemu: { label: 'Cemu', scripts: ['cemu.sh'], app: /cemu/i, fp: ['info.cemu.Cemu'], bin: ['cemu', 'Cemu'], args: '-f -g "{ROM}"', for: ['wiiu'] },
  eden: { label: 'Eden', scripts: ['eden.sh'], app: /eden/i, fp: ['dev.eden_emu.eden'], bin: ['eden'], args: '-f -g "{ROM}"', for: ['switch'] },
  citron: { label: 'Citron', scripts: ['citron.sh'], app: /citron/i, fp: ['org.citron_emu.citron'], bin: ['citron'], args: '-f -g "{ROM}"', for: ['switch'] },
  yuzu: { label: 'Yuzu', scripts: ['yuzu.sh', 'suyu.sh'], app: /(yuzu|sudachi|suyu)/i, fp: ['org.yuzu_emu.yuzu', 'org.sudachi_emu.sudachi'], bin: ['yuzu', 'sudachi', 'suyu'], args: '-f -g "{ROM}"', for: ['switch'] },
  ryujinx: { label: 'Ryujinx', scripts: ['ryujinx.sh'], app: /ryujinx/i, fp: ['io.github.ryubing.Ryujinx', 'org.ryujinx.Ryujinx'], bin: ['Ryujinx', 'ryujinx'], args: '--fullscreen "{ROM}"', for: ['switch'] },
  rpcs3: { label: 'RPCS3', scripts: ['rpcs3.sh'], app: /rpcs3/i, fp: ['net.rpcs3.RPCS3'], bin: ['rpcs3'], args: '--no-gui "{ROM}"', for: ['ps3'] },
  shadps4: { label: 'shadPS4', scripts: ['shadps4.sh'], app: /shadps4/i, fp: ['net.shadps4.shadPS4'], bin: ['shadps4'], args: '-g "{ROM}"', qtArgs: '-d -g "{ROM}"', for: ['ps4'] },
  ppsspp: { label: 'PPSSPP', scripts: ['ppsspp.sh'], app: /ppsspp/i, fp: ['org.ppsspp.PPSSPP'], bin: ['PPSSPPSDL', 'ppsspp', 'PPSSPPQt'], args: '-f -g "{ROM}"', for: ['psp'] },
  azahar: { label: 'Azahar', scripts: ['azahar.sh', 'lime3ds.sh', 'citra.sh'], app: /(azahar|lime3ds|citra)/i, fp: ['org.azahar_emu.Azahar', 'io.github.lime3ds.Lime3DS', 'org.citra_emu.citra'], bin: ['azahar', 'azahar-qt', 'lime3ds', 'lime3ds-gui', 'citra-qt'], args: '"{ROM}"', for: ['n3ds'] },
  melonds: { label: 'melonDS', scripts: ['melonds.sh'], app: /melonds/i, fp: ['net.kuribo64.melonDS'], bin: ['melonDS', 'melonds'], args: '"{ROM}" -f', for: ['nds'] },
  // xemu only loads a game given as -dvd_path; EmuDeck's launcher is xemu-emu.sh
  xemu: { label: 'xemu', scripts: ['xemu-emu.sh', 'xemu.sh'], app: /xemu/i, fp: ['app.xemu.xemu'], bin: ['xemu'], args: '-full-screen -dvd_path "{ROM}"', for: ['xbox'] },
  // Xenia runs under Proton inside EmuDeck's launcher, so the game needs a Windows path (Z: is /)
  xenia: { label: 'Xenia', scripts: ['xenia.sh'], args: '"Z:{ROM}"', for: ['xbox360'] },
  // Vita games run once installed in Vita3K (from their .pkg/.vpk), started by title ID like EmuDeck does
  vita3k: { label: 'Vita3K', scripts: ['vita3k.sh'], app: /vita3k/i, fp: [], bin: ['Vita3K', 'vita3k'], args: '-F -r {SERIAL}', kind: 'vitaid', for: ['psvita'] },
  mgba: { label: 'mGBA', scripts: ['mgba.sh'], app: /mgba/i, fp: ['io.mgba.mGBA'], bin: ['mgba-qt', 'mgba'], args: '-f "{ROM}"', for: ['gb', 'gbc', 'gba'] },
  rmg: { label: "Rosalie's Mupen GUI", scripts: ['rosaliesmupengui.sh'], app: /(^rmg|rosalie)/i, fp: ['com.github.Rosalie241.RMG'], bin: ['RMG'], args: '--fullscreen --nogui --quit-after-emulation "{ROM}"', for: ['n64'] },
  simple64: { label: 'simple64', app: /simple64/i, fp: ['io.github.simple64.simple64'], bin: ['simple64-gui'], args: '"{ROM}"', for: ['n64'] },
  parallel: { label: 'Parallel Launcher', fp: ['ca.parallel_launcher.ParallelLauncher'], bin: ['parallel-launcher'], args: '"{ROM}"', for: ['n64'] },
  flycast: { label: 'Flycast', scripts: ['flycast.sh'], app: /flycast/i, fp: ['org.flycast.Flycast'], bin: ['flycast'], args: '"{ROM}"', argsBy: { flatpak: '-config window:fullscreen=yes "{ROM}"', native: '-config window:fullscreen=yes "{ROM}"', appimage: '-config window:fullscreen=yes "{ROM}"' }, for: ['dreamcast', 'naomi', 'naomi2', 'atomiswave'] },
  bsnes: { label: 'bsnes', app: /^bsnes/i, fp: ['dev.bsnes.bsnes'], bin: ['bsnes'], args: '--fullscreen "{ROM}"', for: ['snes'] },
  nestopia: { label: 'Nestopia UE', fp: ['ca._0ldsk00l.Nestopia'], bin: ['nestopia'], args: '-f "{ROM}"', for: ['nes', 'fds'] },
  stella: { label: 'Stella', fp: ['io.github.stella_emu.Stella'], bin: ['stella'], args: '-fullscreen 1 "{ROM}"', for: ['atari2600'] },
  ymir: { label: 'Ymir', app: /ymir/i, fp: ['io.github.strikerx3.ymir'], bin: ['ymir'], args: '-d "{ROM}"', for: ['saturn'] },
  bigpemu: { label: 'BigPEmu', scripts: ['bigpemu.sh'], args: '"{ROM}"', for: ['atarijaguar', 'atarijaguarcd'] },
  // MAME runs a set by name from its folder
  mame: { label: 'MAME', scripts: ['mame.sh'], fp: ['org.mamedev.MAME'], bin: ['mame'], args: '-rompath "{DIR}" "{NAME}"', for: ['arcade', 'cps1', 'cps2', 'cps3', 'neogeo'] },
  scummvm: { label: 'ScummVM', scripts: ['scummvm.sh'], fp: ['org.scummvm.ScummVM'], bin: ['scummvm'], args: '--path="{ROM}" --auto-detect', for: ['scummvm'] },
  // ares runs many systems, told which with --system
  ares: {
    label: 'ares', scripts: ['ares-emu.sh'], fp: ['dev.ares.ares'], bin: ['ares'], args: '--fullscreen "{ROM}"',
    system: { atari2600: 'Atari 2600', wonderswan: 'WonderSwan', wonderswancolor: 'WonderSwan Color', colecovision: 'ColecoVision', msx: 'MSX', msx2: 'MSX2', pcenginecd: 'PC Engine CD', pcengine: 'PC Engine', n64: 'Nintendo 64', n64dd: 'Nintendo 64DD', fds: 'Famicom Disk System', gba: 'Game Boy Advance', gbc: 'Game Boy Color', gb: 'Game Boy', nes: 'Famicom', snes: 'Super Famicom', sega32x: 'Mega 32X', segacd: 'Mega CD', gamegear: 'Game Gear', genesis: 'Mega Drive', megadrive: 'Mega Drive', mastersystem: 'Master System', 'sg-1000': 'SG-1000', zxspectrum: 'ZX Spectrum', ngp: 'Neo Geo Pocket', ngpc: 'Neo Geo Pocket Color' },
  },
};
EMU.ares.for = Object.keys(EMU.ares.system);

// RetroArch cores per console, best first (EmuDeck's defaults lead)
const CORES = {
  nes: ['mesen', 'fceumm', 'nestopia', 'quicknes'], fds: ['mesen', 'fceumm', 'nestopia'], famicom: ['mesen', 'fceumm', 'nestopia'],
  snes: ['snes9x', 'bsnes', 'bsnes_hd_beta', 'mesen-s', 'bsnes2014_accuracy', 'bsnes_mercury_accuracy', 'mednafen_snes'], sfc: ['snes9x', 'bsnes', 'mesen-s'],
  gb: ['gambatte', 'sameboy', 'mgba', 'gearboy', 'tgbdual', 'mesen-s'], gbc: ['gambatte', 'sameboy', 'mgba', 'gearboy', 'tgbdual'], gba: ['mgba', 'vba_next', 'vbam', 'gpsp', 'mednafen_gba'],
  n64: ['mupen64plus_next', 'parallel_n64'], nds: ['melondsds', 'melonds', 'desmume'], n3ds: ['citra'], virtualboy: ['mednafen_vb'], pokemini: ['pokemini'],
  gc: ['dolphin'], wii: ['dolphin'],
  genesis: ['genesis_plus_gx', 'picodrive'], megadrive: ['genesis_plus_gx', 'picodrive'], mastersystem: ['genesis_plus_gx', 'gearsystem', 'picodrive'], gamegear: ['genesis_plus_gx', 'gearsystem'],
  segacd: ['genesis_plus_gx', 'picodrive'], sega32x: ['picodrive'], 'sg-1000': ['gearsystem', 'bluemsx', 'genesis_plus_gx'], saturn: ['mednafen_saturn', 'kronos', 'yabasanshiro', 'yabause'],
  dreamcast: ['flycast'], naomi: ['flycast'], naomi2: ['flycast'], atomiswave: ['flycast'],
  psx: ['swanstation', 'mednafen_psx_hw', 'mednafen_psx', 'pcsx_rearmed'], ps2: ['pcsx2', 'play'], psp: ['ppsspp'],
  pcengine: ['mednafen_pce_fast', 'mednafen_pce'], pcenginecd: ['mednafen_pce_fast', 'mednafen_pce'], pcfx: ['mednafen_pcfx'], pc88: ['quasi88'], pc98: ['np2kai', 'nekop2'],
  arcade: ['fbneo', 'mame', 'mame2003_plus'], neogeo: ['fbneo'], cps1: ['fbneo'], cps2: ['fbneo'], cps3: ['fbneo'], neogeocd: ['neocd'],
  atari2600: ['stella'], atari5200: ['atari800'], atari7800: ['prosystem'], atari800: ['atari800'], atarijaguar: ['virtualjaguar'], atarilynx: ['handy', 'mednafen_lynx'], atarist: ['hatari'],
  ngp: ['mednafen_ngp'], ngpc: ['mednafen_ngp'], wonderswan: ['mednafen_wswan'], wonderswancolor: ['mednafen_wswan'],
  colecovision: ['gearcoleco', 'bluemsx'], intellivision: ['freeintv'], vectrex: ['vecx'], '3do': ['opera'],
  amiga: ['puae', 'puae2021'], amigacd32: ['puae'], amstradcpc: ['cap32', 'crocods'], c64: ['vice_x64'], msx: ['bluemsx', 'fmsx'], msx2: ['bluemsx', 'fmsx'], x68000: ['px68k'], zxspectrum: ['fuse'],
  dos: ['dosbox_pure'], scummvm: ['scummvm'], pico8: ['retro8'], tic80: ['tic80'],
};
const CORE_NAMES = {
  mesen: 'Mesen', fceumm: 'FCEUmm', nestopia: 'Nestopia', quicknes: 'QuickNES', snes9x: 'Snes9x', bsnes: 'bsnes', bsnes_hd_beta: 'bsnes-hd', 'mesen-s': 'Mesen-S', bsnes2014_accuracy: 'bsnes 2014', bsnes_mercury_accuracy: 'bsnes-mercury', mednafen_snes: 'Beetle bsnes',
  gambatte: 'Gambatte', sameboy: 'SameBoy', mgba: 'mGBA', gearboy: 'Gearboy', tgbdual: 'TGB Dual', vba_next: 'VBA Next', vbam: 'VBA-M', gpsp: 'gpSP', mednafen_gba: 'Beetle GBA',
  mupen64plus_next: 'Mupen64Plus-Next', parallel_n64: 'ParaLLEl N64', melondsds: 'melonDS DS', melonds: 'melonDS', desmume: 'DeSmuME', citra: 'Citra', mednafen_vb: 'Beetle VB', pokemini: 'PokeMini', dolphin: 'Dolphin',
  genesis_plus_gx: 'Genesis Plus GX', picodrive: 'PicoDrive', gearsystem: 'Gearsystem', bluemsx: 'blueMSX', mednafen_saturn: 'Beetle Saturn', kronos: 'Kronos', yabasanshiro: 'YabaSanshiro', yabause: 'Yabause', flycast: 'Flycast',
  swanstation: 'SwanStation', mednafen_psx_hw: 'Beetle PSX HW', mednafen_psx: 'Beetle PSX', pcsx_rearmed: 'PCSX ReARMed', pcsx2: 'LRPS2', play: 'Play!', ppsspp: 'PPSSPP',
  mednafen_pce_fast: 'Beetle PCE Fast', mednafen_pce: 'Beetle PCE', mednafen_pcfx: 'Beetle PC-FX', quasi88: 'QUASI88', np2kai: 'Neko Project II Kai', nekop2: 'Neko Project II',
  fbneo: 'FBNeo', mame: 'MAME', mame2003_plus: 'MAME 2003-Plus', neocd: 'NeoCD', stella: 'Stella', atari800: 'Atari800', prosystem: 'ProSystem', virtualjaguar: 'Virtual Jaguar', handy: 'Handy', mednafen_lynx: 'Beetle Lynx', hatari: 'Hatari',
  mednafen_ngp: 'Beetle NeoPop', mednafen_wswan: 'Beetle Cygne', gearcoleco: 'Gearcoleco', freeintv: 'FreeIntv', vecx: 'vecx', opera: 'Opera',
  puae: 'PUAE', puae2021: 'PUAE 2021', cap32: 'Caprice32', crocods: 'CrocoDS', vice_x64: 'VICE', fmsx: 'fMSX', px68k: 'PX68k', fuse: 'Fuse', dosbox_pure: 'DOSBox Pure', scummvm: 'ScummVM', retro8: 'Retro8', tic80: 'TIC-80',
};
// consoles EmuDeck plays in RetroArch unless you pick a standalone emulator
const RA_FIRST = new Set(['nes', 'fds', 'famicom', 'snes', 'sfc', 'gb', 'gbc', 'gba', 'n64', 'virtualboy', 'pokemini', 'genesis', 'megadrive', 'mastersystem', 'gamegear', 'segacd', 'sega32x', 'sg-1000', 'saturn', 'dreamcast',
  'pcengine', 'pcenginecd', 'pcfx', 'pc88', 'pc98', 'arcade', 'neogeo', 'cps1', 'cps2', 'cps3', 'neogeocd', 'atari2600', 'atari5200', 'atari7800', 'atari800', 'atarijaguar', 'atarilynx', 'atarist', 'ngp', 'ngpc',
  'wonderswan', 'wonderswancolor', 'colecovision', 'intellivision', 'vectrex', '3do', 'amiga', 'amigacd32', 'amstradcpc', 'c64', 'msx', 'msx2', 'x68000', 'zxspectrum', 'pico8', 'tic80']);

// When RomM keeps a game as several files, Cartridge downloads it into a folder. Emulators need the
// game file inside it, like Steam ROM Manager's file patterns pick (EmuDeck's parsers): a playlist or
// disc descriptor first, then these extensions in order. Consoles in DIR_GAMES take the folder itself.
const DISC_FIRST = ['m3u', 'cue', 'gdi', 'cdi', 'ccd', 'mds', 'chd'];
const GAME_EXT = {
  psx: ['pbp', 'iso', 'img', 'ecm', 'bin'], ps2: ['iso', 'cso', 'zso', 'bin', 'gz'], psp: ['iso', 'cso', 'pbp', 'elf'],
  xbox: ['iso', 'xiso'], xbox360: ['iso', 'xex', 'zar'], gc: ['rvz', 'iso', 'gcm', 'gcz', 'ciso', 'wbfs'], wii: ['rvz', 'wbfs', 'iso', 'wia', 'gcz'],
  switch: ['xci', 'nsp', 'nsz', 'xcz'], n3ds: ['3ds', 'cci', 'cia', 'cxi', 'app', 'zcci'], nds: ['nds', 'dsi', 'zip', '7z'],
  nes: ['nes', 'fds', 'unf', 'unif', 'zip', '7z'], fds: ['fds', 'zip'], famicom: ['nes', 'fds', 'zip'], snes: ['sfc', 'smc', 'fig', 'swc', 'bs', 'zip', '7z'], sfc: ['sfc', 'smc', 'zip'],
  gb: ['gb', 'zip', '7z'], gbc: ['gbc', 'gb', 'zip', '7z'], gba: ['gba', 'zip', '7z'], n64: ['z64', 'n64', 'v64', 'ndd', 'zip', '7z'], virtualboy: ['vb', 'zip'],
  genesis: ['md', 'gen', 'smd', 'bin', 'zip', '7z'], megadrive: ['md', 'gen', 'smd', 'bin', 'zip', '7z'], mastersystem: ['sms', 'zip'], gamegear: ['gg', 'zip'], sega32x: ['32x', 'zip'], 'sg-1000': ['sg', 'zip'],
  segacd: ['iso', 'bin', 'zip'], saturn: ['iso', 'bin', 'zip'], dreamcast: ['iso', 'bin', 'zip'], naomi: ['zip', 'dat', 'lst'], atomiswave: ['zip', 'bin'],
  pcengine: ['pce', 'zip'], pcenginecd: ['iso', 'bin'], ngp: ['ngp', 'zip'], ngpc: ['ngc', 'ngp', 'zip'], wonderswan: ['ws', 'zip'], wonderswancolor: ['wsc', 'ws', 'zip'],
  atari2600: ['a26', 'bin', 'zip'], atari7800: ['a78', 'zip'], atarilynx: ['lnx', 'zip'], atarijaguar: ['j64', 'jag', 'zip'], arcade: ['zip', '7z'], neogeo: ['zip', '7z'],
};
const DIR_GAMES = new Set(['ps3', 'ps4', 'ps5', 'wiiu', 'psvita', 'scummvm', 'dos', 'windows']);

// console -> standalone emulator ids, in the order above (first is preferred)
function emulatorsFor(key) { return Object.keys(EMU).filter((id) => EMU[id].for.includes(key)); }
// the launch args for one emulator, console and install kind
function argsFor(id, key, src) {
  const e = EMU[id];
  if (e.system?.[key]) return `--fullscreen --system "${e.system[key]}" "{ROM}"`;
  return e.argsBy?.[src] || e.args;
}
const coreName = (c) => CORE_NAMES[c] || c.replace(/_/g, ' ');

module.exports = { EMU, CORES, RA_FIRST, emulatorsFor, argsFor, coreName, DISC_FIRST, GAME_EXT, DIR_GAMES };
