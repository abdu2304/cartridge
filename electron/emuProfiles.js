// Emulator profiles (0.9.48). Everything Cartridge knows about one emulator, in one place. The facts still live in the
// tables that use them (moving them would risk the launchers for no gain), and this module is the single view over
// them, plus the few rules that were written inline in main.js:
//   launch   emulators.js EMU (sources, consoles, arguments)         saves    saves.js SCAN / DATA / SYNC
//   folders  emuPaths.js ROWS (paths you can change)                  links    esdeLinks.js DATA (Emulation/saves links)
//   settings gameSettings.js SCHEMA (per-game settings)               mods     MOD_KIND here (how add-ons install)
//   patches  PATCHES here (the emulators main.js's EMU_PATCH serves)  updates  emuUpdates.js REPOS
//   get      emuGet.js CATALOG (Get Emulators)
// A fork (Eden, Citron, PrimeHack...) can share its family's facts: FAMILY says whose. test/emuProfiles.test.js
// checks every table only names emulators Cartridge knows, and pins what each emulator has, so adding an emulator
// or removing a fact from one table shows up as a failing test instead of "works on one setup, not another".
const E = require('./emulators');

// forks and builds that use another emulator's folders and formats
const FAMILY = { eden: 'yuzu', lichii: 'yuzu', citron: 'yuzu', sudachi: 'yuzu', suyu: 'yuzu', torzu: 'yuzu', primehack: 'dolphin', xeniaedge: 'xenia', 'xenia-win': 'xenia', citra: 'azahar' };
const SWITCH = /^(eden|lichii|citron|yuzu|ryujinx)$/;
// how an add-on for this emulator is laid out (addonInstall.plan's kinds): the rule book in modRules.js (0.9.52);
// 'plain' = no rule, and Cartridge then installs nothing
function modKind(id, source) { return require('./modRules').kindOf(id, source) || 'plain'; }
// the emulators whose patches and cheats Cartridge lists and turns on (main.js EMU_PATCH)
const PATCHES = ['rpcs3', 'shadps4', 'dolphin', 'ppsspp', 'cemu', 'pcsx2'];

function tables() {
  return {
    launch: E.EMU,
    savesScan: require('./saves').SCAN, savesData: require('./saves').DATA, savesSync: require('./saves').SYNC,
    folders: require('./emuPaths').ROWS, links: require('./esdeLinks').DATA, settings: require('./gameSettings').SCHEMA,
    updates: require('./emuUpdates').REPOS, catalog: require('./emuGet').CATALOG,
  };
}
const inCatalog = (cat, id) => cat.some((c) => (c.emus || []).some((e) => e.id === id));
// profile(id): what Cartridge can do with this emulator, and where each fact comes from (own, or its family's)
function profile(id) {
  const t = tables(), fam = FAMILY[id] || null;
  const own = (tbl) => (tbl[id] ? 'own' : fam && tbl[fam] ? fam : null);
  return {
    id, family: fam, label: t.launch[id]?.label || t.launch[fam]?.label || id,
    consoles: t.launch[id]?.for || [], launch: !!t.launch[id],
    saves: own(t.savesData), savesScan: !!(t.savesScan[id] || (SWITCH.test(id) && t.savesScan.switch)), savesSync: own(t.savesSync),
    folders: own(t.folders), links: own(t.links), settings: own(t.settings),
    mods: modKind(id) !== 'plain' ? modKind(id) : null, patches: PATCHES.includes(id) ? 'own' : fam && PATCHES.includes(fam) ? fam : null,
    updates: own(t.updates), get: inCatalog(t.catalog, id),
  };
}
// every emulator any table mentions
function known() {
  const t = tables(), ids = new Set(Object.keys(t.launch));
  for (const k of ['savesData', 'savesSync', 'folders', 'links', 'settings', 'updates']) for (const id of Object.keys(t[k])) ids.add(id);
  for (const c of t.catalog) for (const e of c.emus || []) ids.add(e.id);
  return [...ids].sort();
}
const all = () => known().map(profile);
module.exports = { profile, all, known, modKind, FAMILY, PATCHES };
