'use strict';
// CIDE, the Cartridge ID Engine (0.9.51, owner: "we're able to identify games by their ID and serial for all
// emulators, it took a lot of work: make an engine and a concrete system for all emulators so Cartridge understands
// the logic, and make sure it doesn't break anything when it comes to detection").
//
// Every console names its games by an ID of its own: PlayStation serials (SLUS-20062, BLUS30443, ULUS10041,
// PCSA00001, CUSA00001, PPSA01234), Nintendo title IDs (Switch 0100…, 3DS 0004…, Wii U 00050000…), GameCube and Wii
// game IDs (GALE01), Xbox 360 title IDs (4D5307E6). Saves, trophies, patches, add-ons, Syncthing folders and Steam
// shortcuts all find their game by one of these. CIDE is the one place that knows, for each console:
// - KINDS: what its ID looks like, how it's written in file and folder names, and its family rules (a Switch update
//   or add-on ID maps back to its base game);
// - CONSOLES: which kinds a console uses, the readers that get the ID out of the game itself (a disc header, a
//   PARAM.SFO, an NCA header), and the consoles that have no ID at all (cartridge consoles: matched by file name and
//   title instead), with the reason written down;
// - parse / classify / base / same: the rules, in one place.
// It changes no detection: name parsing is the same function as before (syncthing.serialsIn), the readers are the
// same functions in the same modules, and gameId.js (which library game) and saves.js (which save) keep their
// matching. test/cide.test.js pins all of it: the parse gives the same IDs as before on real file names, every
// console has its ID kinds or a written reason, and every reader named here exists where it says.
// No Electron imports.

const { serialsIn } = require('./syncthing');

const up = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ---------------------------------------------------------------- the kinds of ID
// re: a whole normalised ID (upper case, no separators); written: how it appears in names; base: its game's own ID
const KINDS = {
  ps1: { label: 'PlayStation serial', re: /^(S[CL][EUPAK][SMD]|PAPX|PBPX|PCPX|SLPS|SLPM|SCPS)\d{5}$/, written: 'SLUS-00594, SCUS_944.26' },
  ps2: { label: 'PlayStation 2 serial', re: /^(S[CL][EUPAK][SMD]|SLPS|SLPM|SCPS|SCAJ|SLKA|PBPX)\d{5}$/, written: 'SLUS-20062, SCES_502.94' },
  ps3: { label: 'PS3 serial', re: /^(B[LC][UEJAKH]S|NP[UEJAHK][ABZ])\d{5}$/, written: 'BLUS30443, NPUB30025' },
  psp: { label: 'PSP serial', re: /^(U[LC][UEJAKH][SM]|NP[UEJAH][GHJZ])\d{5}$/, written: 'ULUS10041, NPUH10091' },
  vita: { label: 'PS Vita title ID', re: /^PCS[A-H]\d{5}$/, written: 'PCSA00001' },
  ps4: { label: 'PS4 title ID', re: /^(CUSA|PCJS|PLJM|PCAS|PCKS)\d{5}$/, written: 'CUSA00001' },
  ps5: { label: 'PS5 title ID', re: /^PPSA\d{5}$/, written: 'PPSA01234' },
  switch: { label: 'Switch title ID', re: /^0100[0-9A-F]{12}$/, written: '0100F2C0115B6000', base: (id) => (BigInt('0x' + id) & ~0x1FFFn).toString(16).toUpperCase().padStart(16, '0') }, // updates (…800) and add-ons (…1xxx) map to their game
  n3ds: { label: '3DS title ID', re: /^0004[0-9A-F]{12}$/, written: '0004000000055D00' },
  wiiu: { label: 'Wii U title ID', re: /^0005000[0-9A-F]{9}$/, written: '0005000010101C00' },
  gcwii: { label: 'GameCube or Wii game ID', re: /^[A-Z0-9]{4}([0-9A-Z]{2})?$/, written: 'GALE01 (or its first four, GALE)' },
  x360: { label: 'Xbox 360 title ID', re: /^[0-9A-F]{8}$/, written: '4D5307E6' },
};
const PS = ['ps1', 'ps2'];

// ---------------------------------------------------------------- per console
// kinds: what it's known by; read: the readers that take it from the game itself, as "module.function" (main.js ones
// say so); none: why a console has no ID (matched by file name and title instead)
const NO_ID = 'Cartridges and most discs of this console carry no ID Cartridge reads: games are matched by file name and title (RetroArch names saves after the file).';
const CONSOLES = {
  psx: { kinds: ['ps1'], read: ['addons.psxSerial (SYSTEM.CNF BOOT line)', 'saves.cardSerials (memory cards)'] },
  ps2: { kinds: ['ps2'], read: ['patches.ps2IsoInfo (SYSTEM.CNF BOOT2 and the ELF CRC; CHD through discImage)', 'saves.cardSerials (memory cards)'] },
  ps3: { kinds: ['ps3'], read: ['main.ps3Serial (PS3_GAME/PARAM.SFO, RPCS3 games.yml)', 'saves.sfo (save folders)'] },
  psp: { kinds: ['psp'], read: ['main.ppssppPatchState (UMD_DATA.BIN / PARAM.SFO through PPSSPP)', 'saves.sfo (save folders)'] },
  psvita: { kinds: ['vita'], read: ['pkgInstall installs.json (the title ID an install recorded)', 'trophies (trophy folders)'] },
  ps4: { kinds: ['ps4'], read: ['saves.sfo (sce_sys/param.sfo)', 'trophies.readTrp (trophy files)'] },
  ps5: { kinds: ['ps5'], read: ['trophies (KytyPS5 sets)'] },
  switch: { kinds: ['switch'], read: ['addons.switchTitleId (NCA headers with your keys)', 'switchNca.read (CNMT and NACP)'] },
  '3ds': { kinds: ['n3ds'], read: ['addons.n3dsTitleId (NCSD/NCCH headers)', 'addons.ciaTitleId (CIA)'] },
  wiiu: { kinds: ['wiiu'], read: ['cemuPacks.titleIds (Cemu’s game list and meta.xml)'] },
  gc: { kinds: ['gcwii'], read: ['cheats.gcWiiId (ISO, GCM, RVZ, WIA, WBFS, CISO headers)'] },
  n3ds: { kinds: ['n3ds'], read: ['addons.n3dsTitleId (NCSD/NCCH headers)', 'addons.ciaTitleId (CIA)'] },
  ngc: { kinds: ['gcwii'], read: ['cheats.gcWiiId (ISO, GCM, RVZ, WIA, WBFS, CISO headers)'] },
  wii: { kinds: ['gcwii'], read: ['cheats.gcWiiId (ISO, GCM, RVZ, WIA, WBFS, CISO headers)'] },
  xbox360: { kinds: ['x360'], read: ['trophies (Xenia’s GPD files)', 'titleNames (x360db)'] },
};
// consoles that are matched by name only (no ID kind): listed so a new console has to be thought about (the test)
const BY_NAME = ['nes', 'snes', 'n64', 'gb', 'gbc', 'gba', 'nds', 'genesis', 'megadrive', 'mastersystem', 'gamegear', 'segacd', 'sega32x', 'saturn', 'dreamcast', 'pce', 'pcfx', 'ngp', 'ngpc', 'wonderswan', 'wonderswancolor', 'lynx', 'jaguar', 'atari2600', 'atari5200', 'atari7800', 'virtualboy', 'neogeo', 'arcade', 'mame', 'fbneo', 'model3', 'naomi', 'atomiswave', 'xbox', 'msx', 'msx2', 'c64', 'amiga', 'zxspectrum', 'zx81', 'amstradcpc', 'dos', 'scummvm', 'colecovision', 'intellivision', 'vectrex', 'odyssey2', 'pokemini', 'supervision', 'arduboy', 'gameandwatch', 'megaduck', 'pico', 'pico8', 'tic80', 'n64dd', '3do', 'cdi', 'pc88', 'pc98', 'x68000', 'fmtowns', 'ngage', 'android', 'windows', 'ports', 'satellaview', 'sufami', 'channelf', 'videopac', 'fds', 'sg1000', 'sgb', 'gbz80', 'easyrpg', 'openbor', 'solarus', 'love', 'lutro', 'cps1', 'cps2', 'cps3', 'neogeocd', 'ps2-hdd', 'amigacd32', 'atari800', 'atarijaguar', 'atarijaguarcd', 'atarilynx', 'atarist', 'famicom', 'naomi2', 'pcengine', 'pcenginecd', 'sfc', 'sg-1000', 'ns2'];

// ---------------------------------------------------------------- the rules
// every ID written in a text (file names, folder names, titles): the same parse Cartridge has always used
const parse = (text) => [...serialsIn(text)];
// which kinds an ID can be (a PlayStation serial like SLUS-xxxxx is PS1 or PS2: the console decides)
function kindsOf(id, consoleHint = null) {
  const u = up(id), hits = Object.keys(KINDS).filter((k) => KINDS[k].re.test(u));
  if (consoleHint && CONSOLES[consoleHint]) { const want = hits.filter((k) => CONSOLES[consoleHint].kinds.includes(k)); if (want.length) return want; }
  // a bare 8-hex or 4-6 letter ID is only an Xbox 360 or GameCube ID when nothing better fits
  const strong = hits.filter((k) => !['x360', 'gcwii'].includes(k));
  return strong.length ? strong : hits;
}
// the base game's ID (a Switch update or add-on belongs to its game); others are their own base
function base(id, kind = null) { const u = up(id), k = kind || kindsOf(u)[0]; return KINDS[k]?.base ? KINDS[k].base(u) : u; }
// two IDs name the same game
const same = (a, b) => { const x = up(a), y = up(b); return !!x && (x === y || base(x) === base(y)); };
// the console of an ID when its kind settles it (PS1 or PS2 serials don't, alone)
function consoleOf(id) {
  const ks = kindsOf(id).filter((k) => !PS.includes(k) || kindsOf(id).every((x) => PS.includes(x)));
  const cs = Object.keys(CONSOLES).filter((c) => CONSOLES[c].kinds.some((k) => ks.includes(k)));
  return cs.length === 1 ? cs[0] : null;
}
// ---------------------------------------------------------------- Steam's rules (0.9.52)
// The Steam manager reads IDs to start a game by its ID (RPCS3 by serial, Vita3K by title ID, shadPS4 by CUSA) and
// to tell whether a game already has a shortcut. Its rules are looser than KINDS on purpose (a PS3 shortcut accepts
// any 4 letters + 5 digits, as RPCS3 itself does), and every shortcut ever made came from them: so they live here
// exactly as they were, by name, and steamManager calls these. test/cideSteam.test.js runs the old inline rules and
// these side by side over a large corpus and the whole shortcut plan, and fails on any difference.
const STEAM = {
  nameSerial: /\b([A-Z]{4})-?(\d{5})\b/, // "BLUS30443" or "BLUS-30443" in a name (serialOf)
  plainSerial: /\b([A-Z]{4}\d{5})\b/, // a serial written whole in a name (gameSerial)
  anySerial: /[A-Z]{4}\d{5}/, // inside PARAM.SFO, and the part of a launch argument {SERIAL} replaces
  ps3Disc: /(BL|BC|NP)(US|ES|JS|AS|KS|UB|EB|JM|JB|HB|UA|EA|JA|HA|KA|UJ|UZ)\d{5}/, // near the start of a PS3 ISO
  vitaName: /\b(PCS[A-Z]\d{5})\b/, vitaAny: /PCS[A-Z]\d{5}/, vitaId: /^PCS[A-Z]\d{5}$/,
  ps4Name: /\b(CUSA|PPSA)\d{5}\b/i, ps4Any: /(CUSA|PPSA)\d{5}/, ps4Arg: /^(CUSA|PPSA)\d{5}$/,
  rpcs3Arg: /%RPCS3_GAMEID%:[A-Z]{4}\d{5}/, rpcs3Id: /%RPCS3_GAMEID%:([A-Z]{4}\d{5})/, ps4InLaunch: /(?:^|\s)["']?((?:CUSA|PPSA)\d{5})\b/,
};
const steam = {
  RE: STEAM,
  nameSerial: (text) => { const m = String(text).match(STEAM.nameSerial); return m ? m[1] + m[2] : null; },
  plainSerial: (text) => (String(text).match(STEAM.plainSerial) || [])[1] || null,
  anySerial: (text) => (String(text).match(STEAM.anySerial) || [])[0] || null,
  ps3Disc: (text) => (String(text).match(STEAM.ps3Disc) || [])[0] || null,
  vitaName: (text) => (String(text).match(STEAM.vitaName) || [])[1] || null,
  vitaAny: (text) => (String(text).match(STEAM.vitaAny) || [])[0] || null,
  isVitaId: (id) => STEAM.vitaId.test(id),
  ps4Name: (text) => String(text).match(STEAM.ps4Name)?.[0]?.toUpperCase() || null,
  ps4Any: (text) => (String(text).match(STEAM.ps4Any) || [])[0] || null,
  isPs4Arg: (v) => STEAM.ps4Arg.test(v),
  isRpcs3Arg: (v) => STEAM.rpcs3Arg.test(v),
  // the serial a shortcut's launch options start a game by (RPCS3 game ID, else a PS4 title ID)
  launchSerial: (lo) => (String(lo).match(STEAM.rpcs3Id) || String(lo).match(STEAM.ps4InLaunch) || [])[1] || null,
  toPlaceholder: (raw) => String(raw).replace(STEAM.anySerial, '{SERIAL}'),
};

// what Cartridge knows about a console's IDs (Settings and the tests read this)
function console_(key) {
  if (CONSOLES[key]) return { key, kinds: CONSOLES[key].kinds.map((k) => ({ kind: k, ...KINDS[k], re: String(KINDS[k].re) })), read: CONSOLES[key].read, byName: false };
  if (BY_NAME.includes(key)) return { key, kinds: [], read: [], byName: true, why: NO_ID };
  return null;
}
const map = (keys) => keys.map((k) => console_(k) || { key: k, unknown: true });

module.exports = { KINDS, CONSOLES, BY_NAME, NO_ID, parse, kindsOf, base, same, consoleOf, console: console_, map, up, steam };
