// CEE, the Cartridge Emulator Engine (0.9.49, owner: "it's supposed to be for all supported systems... you should know
// this is an AppImage, this is a launcher, it's a Flatpak, these are the launch options, this is an EmuDeck install...
// it should also host all the links and download pages for all of Cartridge's supported emulators").
// One answer to "what can Cartridge do with this emulator, and with this console":
// - emulator(id): how it can be installed (EmuDeck launcher, AppImage, Flatpak, distro package, folder build, Windows
//   build through Proton, RetroDECK), its launch line for each (emulators.js EMU, argsFor), the consoles it runs, its
//   website and download page (LINKS), where its updates come from (emuUpdates REPOS), whether Get Emulators offers
//   it, and everything emuProfiles knows (saves, folders, links, settings, mods, patches).
// - consoleSupport(key): the emulators and RetroArch cores that play a console, or why none can.
// - coverage(): every console RomM can send (platformMap.js), each with its way to play.
// The rules are tested (test/cee.test.js): nothing is offered to download that can't be launched, every console has
// a way to play or a written reason, every emulator has its links. So a gap fails the build instead of reaching you.
const E = require('./emulators');
const P = require('./emuProfiles');

// the project's own pages: site, and where its builds are published (what "Open Its Releases Page" opens)
const GH = (r) => `https://github.com/${r}`;
const FH = (id) => `https://flathub.org/apps/${id}`;
const LINKS = {
  pcsx2: { site: 'https://pcsx2.net', downloads: 'https://pcsx2.net/downloads' },
  duckstation: { site: 'https://www.duckstation.org', downloads: GH('stenzek/duckstation/releases') },
  dolphin: { site: 'https://dolphin-emu.org', downloads: 'https://dolphin-emu.org/download/' },
  primehack: { site: GH('shiiion/dolphin'), downloads: FH('io.github.shiiion.primehack') },
  cemu: { site: 'https://cemu.info', downloads: GH('cemu-project/Cemu/releases') },
  eden: { site: 'https://eden-emu.dev', downloads: 'https://git.eden-emu.dev/eden-emu/eden/releases' },
  citron: { site: 'https://citron-emu.org', downloads: 'https://git.citron-emu.org/Citron/Emulator/releases' },
  yuzu: { site: 'https://yuzu-mirror.github.io', downloads: FH('org.yuzu_emu.yuzu') },
  ryujinx: { site: 'https://ryujinx.app', downloads: 'https://git.ryujinx.app/Ryubing/Stable/releases' },
  rpcs3: { site: 'https://rpcs3.net', downloads: 'https://rpcs3.net/download' },
  shadps4: { site: 'https://shadps4.net', downloads: GH('shadps4-emu/shadps4-qtlauncher/releases') },
  sharpemu: { site: GH('sharpemu/sharpemu'), downloads: GH('sharpemu/sharpemu/releases') },
  kytyps5: { site: GH('KytyPS5/KytyPS5'), downloads: GH('KytyPS5/KytyPS5/releases') },
  ppsspp: { site: 'https://www.ppsspp.org', downloads: 'https://www.ppsspp.org/download/' },
  vita3k: { site: 'https://vita3k.org', downloads: GH('Vita3K/Vita3K/releases') },
  azahar: { site: 'https://azahar-emu.org', downloads: GH('azahar-emu/azahar/releases') },
  melonds: { site: 'https://melonds.kuribo64.net', downloads: 'https://melonds.kuribo64.net/downloads.php' },
  desmume: { site: 'https://desmume.org', downloads: FH('org.desmume.DeSmuME') },
  xemu: { site: 'https://xemu.app', downloads: 'https://xemu.app/docs/download/' },
  xenia: { site: 'https://xenia.jp', downloads: GH('xenia-canary/xenia-canary-releases/releases') },
  xeniaedge: { site: GH('has207/xenia-edge'), downloads: GH('has207/xenia-edge/releases') },
  mgba: { site: 'https://mgba.io', downloads: 'https://mgba.io/downloads.html' },
  rmg: { site: GH('Rosalie241/RMG'), downloads: GH('Rosalie241/RMG/releases') },
  simple64: { site: 'https://simple64.github.io', downloads: GH('simple64/simple64/releases') },
  parallel: { site: 'https://parallel-launcher.ca', downloads: 'https://parallel-launcher.ca/download' },
  mupen64plus: { site: 'https://mupen64plus.org', downloads: GH('mupen64plus/mupen64plus-core/releases') },
  ares: { site: 'https://ares-emu.net', downloads: 'https://ares-emu.net/download' },
  flycast: { site: 'https://github.com/flyinghead/flycast', downloads: FH('org.flycast.Flycast') },
  bsnes: { site: GH('bsnes-emu/bsnes'), downloads: GH('bsnes-emu/bsnes/releases') },
  snes9x: { site: 'https://www.snes9x.com', downloads: GH('snes9xgit/snes9x/releases') },
  mesen: { site: 'https://www.mesen.ca', downloads: GH('SourMesen/Mesen2/releases') },
  nestopia: { site: 'http://0ldsk00l.ca/nestopia/', downloads: FH('ca._0ldsk00l.Nestopia') },
  stella: { site: 'https://stella-emu.github.io', downloads: 'https://stella-emu.github.io/downloads.html' },
  ymir: { site: GH('StrikerX3/Ymir'), downloads: GH('StrikerX3/Ymir/releases') },
  kronos: { site: GH('FCare/Kronos'), downloads: GH('FCare/Kronos/releases') },
  bigpemu: { site: 'https://www.richwhitehouse.com/jaguar/', downloads: 'https://www.richwhitehouse.com/jaguar/index.php?content=download' },
  supermodel: { site: 'https://www.supermodel3.com', downloads: FH('com.supermodel3.Supermodel') },
  mame: { site: 'https://www.mamedev.org', downloads: FH('org.mamedev.MAME') },
  scummvm: { site: 'https://www.scummvm.org', downloads: 'https://www.scummvm.org/downloads/' },
  play: { site: 'https://purei.org', downloads: 'https://purei.org/downloads.php' },
  retroarch: { site: 'https://www.retroarch.com', downloads: 'https://www.retroarch.com/?page=platforms' },
};

// consoles RomM can send that no emulator on Linux plays well enough to offer, and why
const UNSUPPORTED = {
  android: 'Android apps aren’t emulated by Cartridge (Waydroid runs them as apps)',
  windows: 'PC games run through Steam and Proton, not an emulator',
  switch2: 'No Switch 2 emulator plays games yet; Cartridge keeps its games in their own folder until one does',
  ngage: 'EKA2L1 needs each game installed into it first; Cartridge can’t start N-Gage games by file yet',
};

// install kinds an emulator can be found as, in the order candidates() lists them
function installKinds(id) {
  const e = E.EMU[id];
  if (!e) return id === 'retroarch' ? ['emudeck', 'flatpak', 'appimage', 'native', 'steam'] : [];
  return [e.scripts?.length && 'emudeck', e.app && 'appimage', e.fp?.length && 'flatpak', e.dir?.length && 'folder', e.bin?.length && 'native', e.win && 'windows'].filter(Boolean);
}
function emulator(id) {
  const e = E.EMU[id], prof = P.profile(id), rep = require('./emuUpdates').REPOS[id];
  const kinds = installKinds(id);
  return {
    ...prof, label: e?.label || prof.label, consoles: e?.for || [], kinds,
    launch: e ? { args: e.args, by: Object.fromEntries(kinds.map((k) => [k, E.argsFor(id, (e.for || [])[0], k)])), pre: e.pre || [], kind: e.kind || null, forkOf: e.forkOf || null } : null,
    links: LINKS[id] || LINKS[P.FAMILY[id]] || null,
    updateFrom: rep ? [...(rep.first === 'forge' ? (rep.forge || []).map(([h, r]) => `${h}/${r}`) : []), rep.repo && `github.com/${rep.repo}`, ...(rep.first !== 'forge' ? (rep.forge || []).map(([h, r]) => `${h}/${r}`) : [])].filter(Boolean) : e?.fp?.length ? ['Flathub'] : [],
  };
}
function consoleSupport(key) {
  const emus = E.emulatorsFor(key), cores = E.CORES[key] || [];
  return { key, emulators: emus, cores, retroarchFirst: E.RA_FIRST.has(key), playable: !!(emus.length || cores.length), why: emus.length || cores.length ? null : UNSUPPORTED[key] || null };
}
// every console key RomM's platforms map to (the first folder name of each)
function consoleKeys() { return [...new Set(Object.values(require('./platformMap')).map((a) => a[0]))].sort(); }
const coverage = () => consoleKeys().map(consoleSupport);
const emulators = () => [...new Set([...Object.keys(E.EMU), ...P.known()])].sort().map(emulator);

module.exports = { emulator, emulators, consoleSupport, coverage, consoleKeys, installKinds, LINKS, UNSUPPORTED };
