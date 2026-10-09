// Shared harness for the UI audits (0.9.47): loads the built UI (dist/) in Chromium with window.cart stubbed by
// fake data, so every page can be opened without Electron, a RomM server or a controller. Not shipped.
const path = require('path');
const { execSync } = require('child_process');
function playwright() {
  try { return require('playwright'); } catch {}
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
// covers and screenshots as small SVG data URIs, so no files are needed
const svg = (w, h, hue, label) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,45%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360},60%,20%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="55%" font-size="${w / 8}" text-anchor="middle" fill="#fff" font-family="sans-serif">${label}</text></svg>`);
const PL = [['ps2', 'PlayStation 2', 'PlayStation', 20], ['snes', 'Super Nintendo', 'Nintendo', 10], ['switch', 'Nintendo Switch', 'Nintendo', 3], ['ngc', 'Nintendo GameCube', 'Nintendo', 3], ['nes', 'Nintendo Entertainment System', 'Nintendo', 3], ['ps3', 'PlayStation 3', 'PlayStation', 3], ['dc', 'Dreamcast', 'Sega', 3], ['psx', 'PlayStation', 'PlayStation', 3], ['xbox360', 'Xbox 360', 'Xbox', 3], ['genesis', 'Sega Genesis', 'Sega', 3]];
function data() {
  const plats = PL.map(([slug, name, fam, n], i) => ({ id: i + 1, slug, fs_slug: slug, name, display_name: name, family_name: fam, rom_count: n, target: { path: '/roms/' + slug, exists: true } }));
  const roms = {}; let id = 1;
  for (const p of plats) { roms[p.id] = []; for (let i = 0; i < p.rom_count; i++, id++) roms[p.id].push({ id, name: `Test Game ${id}`, fs_name: `g${id}.iso`, platform_id: p.id, platform_slug: p.slug, platform_display_name: p.display_name, fs_size_bytes: 4e9, regions: [], genres: ['Action'], developer: 'Studio', files: [], created_at: '2026-09-' + String(10 + (i % 15)).padStart(2, '0'), summary: 'A game.', shot: svg(640, 360, (id * 37) % 360, 'Shot ' + id), path_cover_small: svg(300, 400, (id * 37) % 360, 'G' + id), path_cover_large: svg(300, 400, (id * 37) % 360, 'G' + id) }); }
  const installed = Object.fromEntries(Object.values(roms).flat().slice(0, 22).map((r) => [r.id, '/roms/x/' + r.fs_name]));
  return { plats, roms, installed };
}
function stub(ui, extra = {}, lib = null, answers = {}) {
  return `(() => {
  const D = ${JSON.stringify(lib || data())};
  const cfg = ${JSON.stringify({ configured: true, welcomed: 1, setupDone: true, server: { localUrl: 'http://x', mode: 'auto', auth: 'password', username: 'u' }, romsRoot: '/roms', downloads: { concurrency: 2 }, sync: { onLaunch: false, everyMinutes: 0 }, ui: { font: 'cartridge', sounds: false, toured: true, startTips: true, logos: false, mediaBar: true, idle: '0', ...ui }, ra: { user: 'player', key: 'k' }, trophies: {}, steam: {}, ...extra })};
  const now = Date.now();
  const H = {
    'config:get': cfg, 'app:info': { version: '0.0.0', gamescope: false, gpu: true, home: '/home/u' },
    'library:get': { platforms: D.plats, roms: D.roms, firstSeen: {}, syncedAt: now, lastNew: [], collections: [] },
    'installed:get': D.installed, 'dl:list': [], 'update:get': { state: 'idle' }, 'art:all': {}, 'steam:played': {},
    'play:stats': { 3: { min: 67, last: now - 26 * 60e3 }, 5: { min: 300, last: now - 2 * 86400e3 }, 22: { min: 600, last: now - 9 * 86400e3 } },
    'play:week': [0, 1, 2, 3, 4, 5, 6].map((i) => ({ day: 'd' + i, dow: i, min: [24, 0, 48, 95, 0, 12, 67][i] })),
    'issues:list': [{ kind: 'moved', text: '2 Steam shortcuts point at an emulator that is not there any more', sub: 'Usually an update renamed it', fix: 'health' }],
    'trophies:sources': [], 'trophies:overview': { anySource: true, summary: { P: 1, G: 3, S: 10, B: 40, trophies: 54, games: 2, gamerscore: 450, gamerscoreMax: 1000 }, sources: [], recent: [{ key: 'k1', id: 1, name: 'Into the Jungle', desc: 'Survive the first day', grade: 'B', time: now - 3600e3, game: 'Tokyo Jungle', src: 'rpcs3', short: 'PS3' }], games: [{ key: 'k1', title: 'Tokyo Jungle', src: 'rpcs3', short: 'PS3', kind: 'trophy', last: now - 3600e3, earned: 12, total: 40, grades: { P: 0, G: 1, S: 3, B: 8 } }, { key: 'k2', title: 'Halo 3', src: 'xenia', short: 'X360', kind: 'gamerscore', last: now - 86400e3, earned: 20, total: 49, score: 450, possible: 1000, grades: {} }] },
    'ra:overview': { user: 'player', points: 1234, recent: [{ id: 9, date: new Date(now - 1800e3).toISOString(), title: 'First Blood', desc: 'Defeat the first boss', points: 10, hardcore: true, game: 'Super Metroid', console: 'SNES', gameId: 5 }], played: [{ gameId: 5, title: 'Super Metroid', console: 'SNES', lastPlayed: new Date(now - 1800e3).toISOString(), earned: 20, total: 48, score: 200, possible: 500 }] },
    'app:scale': { auto: 1, current: 1, w: 1280, h: 800, display: {} },
    'steam:overview': { steam: { error: 'Steam was not found on this device.' }, games: [], consoles: [] }, 'steam:liveInfo': { on: false },
    'welcome:state': { emudeck: false, retrodeck: false, steam: true, live: { on: false, flag: false }, gamescope: false, appimage: true, inSteam: false, host: 'deck', device: 'Steam Deck' },
    'fs:space': { free: 5e11, total: 1e12 }, 'storage:overview': { drives: [], games: [] }, 'upload:list': { files: [] },
    'server:status': { base: 'http://x', route: 'local' }, 'pad:detect': { kind: 'xbox', devices: [] },
    // pop-ups the audits open (0.9.60): Where Your Saves Are and the folder sheet, with long real-world paths
    'saves:locations': { search: { at: now - 86400e3, done: true, dirs: 182340 }, searching: false, emus: [{ emu: 'shadps4', name: 'shadPS4', synced: true, places: [{ loc: 'use', why: 'default', place: '/home/u/.local/share/shadPS4/home/1000/savedata', saves: 14, newest: now - 600e3, exists: true, list: [] }, { loc: 'old', why: 'older', place: '/home/u/.local/share/shadPS4/savedata', saves: 2, newest: now - 90 * 86400e3, exists: true, list: [] }], found: [{ emu: 'vita3k', base: '/run/media/system/bazzite-deck_fedora/var/home/u/.local/share/Vita3K/Vita3K', at: {}, place: '/run/media/system/bazzite-deck_fedora/var/home/u/.local/share/Vita3K/Vita3K/ux0/user/00/savedata', saves: 1, newest: now - 100 * 86400e3, list: [] }] }] },
    // recomps (0.9.65): an installed one with an update, a long Windows-only name, one to build yourself
    'recomps:list': { updated: '2026-10-09', folder: '/home/u/Emulation/recomp', consoles: { n64: 'Nintendo 64', xbox360: 'Xbox 360', snes: 'SNES' }, entries: [
      { id: 'zelda64recomp', name: 'Zelda 64: Recompiled', games: [{ title: "The Legend of Zelda: Majora's Mask", console: 'n64' }], origin: 'recomp', from: 'list', repo: 'github:Zelda64Recomp/Zelda64Recomp', url: 'https://github.com/Zelda64Recomp/Zelda64Recomp', description: 'A static recompilation of Majora’s Mask for PC, with widescreen, high frame rates and mod support.', builds: 'linux', needs: { what: 'The US version of Majora’s Mask as a .z64 ROM (an unmodified dump)', ext: ['z64', 'n64', 'v64'] }, setup: { how: 'picker' }, saves: ['~/.config/Zelda64Recompiled/saves'], roms: [], installed: { tag: 'v1.2.0', kind: 'linux', dir: '/home/u/Emulation/recomp/n64/Zelda 64 Recompiled with a much longer folder name than usual', program: '/home/u/Emulation/recomp/n64/Zelda 64 Recompiled/Zelda64Recompiled', channel: 'stable', ready: false, here: true, appid: null, steam: null, game: null }, latest: { tag: 'v1.2.1', kind: 'linux', at: now }, update: true },
      { id: 'svr07', name: 'SVR07-Recomp: WWE SmackDown vs. Raw 2007 Recompiled for PC with Extras', games: [{ title: 'WWE SmackDown vs. Raw 2007', console: 'xbox360' }], origin: 'recomp', from: 'found', repo: 'github:HollywoodAkeem/SVR07-Recomp', url: 'https://github.com/HollywoodAkeem/SVR07-Recomp', description: '', builds: 'windows', needs: null, setup: { how: 'none' }, saves: [], roms: [], installed: null, latest: null, update: false },
      { id: 'sm', name: 'sm', games: [{ title: 'Super Metroid', console: 'snes' }], origin: 'reimplementation', from: 'list', repo: 'github:snesrev/sm', url: 'https://github.com/snesrev/sm', builds: 'none', needs: { what: 'Super Metroid (USA)' }, setup: { how: 'place', place: 'sm.smc' }, saves: [], roms: [], installed: null, latest: null, update: false },
    ] },
    'recomps:versions': { current: 'v1.2.0', kept: [{ tag: 'v1.1.1', at: now - 9 * 86400e3, size: 1 }] }, 'recomps:forRom': [],
    'fs:look': { path: '/home/u/.config/PCSX2/memcards', parent: '/home/u/.config/PCSX2', more: false, entries: [{ name: 'Mcd001.ps2', dir: false, size: 8650752, at: now - 3600e3 }, { name: 'Ratchet and Clank - Size Matters (USA) (En,Fr,De,Es,It) shared memory card.ps2', dir: false, size: 8650752, at: now - 86400e3 }, { name: 'folders', dir: true, size: 0, at: now }] },
  };
  Object.assign(H, ${JSON.stringify(answers)}); // 0.9.52: a run's own answers (the README pictures' real library)
  const merge = (t, x) => { for (const [k, v] of Object.entries(x || {})) { if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object') merge(t[k], v); else t[k] = v; } return t; };
  window.cart = { call: async (ch, a) => { if (ch === 'config:set') { merge(cfg, a); return JSON.parse(JSON.stringify(cfg)); } return ch in H ? JSON.parse(JSON.stringify(H[ch])) : null; }, on: () => () => {} };
})();`;
}
// open the built UI with a look: { theme, style } (style 'plain' | 'glass')
// dist: another build to load (the visual check opens the last release's build too); freeze: a fixed clock and no motion
// extra: top-level settings over the stub's (welcomed: null opens the welcome as on a new install, 0.9.52)
async function open({ theme = 'cartridge', style = 'plain', bg = 'ribbons', width = 1280, height = 800, dist = '', freeze = false, ui = {}, long = false, touch = false, extra = {}, lib = null, answers = {}, routes = null, init = null } = {}) {
  const { chromium } = playwright();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (freeze) await page.clock.setFixedTime(new Date('2026-01-15T10:30:00'));
  // long: real-world text lengths (long game names, long trophy names and descriptions), for the clipping audit
  if (long) await page.addInitScript(() => {
    const L = (t, n) => `${t} ${'and the Second One Is Also Free When You Find It '.repeat(n)}`.trim();
    const grow = (ch, d) => {
      if (!d || typeof d !== 'object') return d;
      if (ch === 'library:get') for (const list of Object.values(d.roms || {})) for (const r of list) r.name = L(r.name, r.id % 3);
      if (ch === 'trophies:overview') { for (const t of d.recent || []) { t.name = L(t.name, 1); t.desc = L(t.desc || 'Was pretty good', 2); t.game = L(t.game, 1); } for (const g of d.games || []) g.title = L(g.title, 1); }
      // 0.9.60 (owner's photo: a long game path ran under the free space on the game page): long install paths
      if (ch === 'installed:get') for (const k of Object.keys(d)) if (typeof d[k] === 'string') d[k] = '/run/media/player/Expansion Drive/EmuDeck/Emulation/roms/ps2/' + 'Ratchet and Clank - Size Matters (USA) (En,Fr,De,Es,It) [Disc 1 of 1] '.repeat(2) + 'game.chd';
      if (ch === 'ra:overview') { for (const a of d.recent || []) { a.title = L(a.title, 1); a.desc = L(a.desc, 2); a.game = L(a.game, 1); } for (const g of d.played || []) g.title = L(g.title, 1); }
      return d;
    };
    const wrap = () => { const c = window.cart; if (!c || c.__long) return; const call = c.call; c.call = async (ch, a) => grow(ch, await call(ch, a)); c.__long = true; };
    Object.defineProperty(window, 'cart', { configurable: true, set(v) { Object.defineProperty(window, 'cart', { value: v, writable: true, configurable: true }); wrap(); }, get() { return undefined; } });
  });
  // routes: { 'https://host/**': (route) => ... } answers picture requests from disk (README pictures)
  if (routes) for (const [glob, fn] of Object.entries(routes)) await page.route(glob, fn);
  if (init) await page.addInitScript(init); // a run's own page script, before the app starts
  await page.addInitScript(stub({ theme, style, elements: style, surface: style === 'glass' ? 'glass' : 'solid', bgStyle: bg, ...ui }, extra, lib, answers));
  if (freeze) await page.addInitScript(() => { addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }'; document.head.appendChild(st); }); });
  await page.goto('file://' + path.resolve(dist || path.join(__dirname, '../../dist'), 'index.html'));
  await page.waitForTimeout(2500);
  page.setDefaultTimeout(4000);
  return { browser, page, errors };
}
const TABS = ['start', 'home', 'library', 'consoles', 'achievements', 'downloads'];
const LOOKS = [['cartridge', 'plain'], ['cartridge', 'glass'], ['light', 'plain'], ['light', 'glass'], ['oled', 'plain'], ['oled', 'glass']];
module.exports = { open, TABS, LOOKS };
