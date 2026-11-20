// A library from the games already on this device, for using Cartridge without RomM (0.9.17, owner:
// RomM is strongly recommended but not required). Each console folder in the games folder (ES-DE names,
// as platformMap.js lists them) becomes a console, each game file or folder in it a game. No covers,
// details, collections, trophy sync or play-session sync: those come from RomM.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PLATFORM_MAP = require('./platformMap');

const NAMES = {
  psx: 'PlayStation', ps2: 'PlayStation 2', ps3: 'PlayStation 3', ps4: 'PlayStation 4', psp: 'PlayStation Portable', psvita: 'PlayStation Vita',
  ngc: 'GameCube', wii: 'Wii', wiiu: 'Wii U', switch: 'Nintendo Switch', ns2: 'Nintendo Switch 2', 'switch-2': 'Nintendo Switch 2', '3ds': 'Nintendo 3DS', n3ds: 'Nintendo 3DS', nds: 'Nintendo DS', gba: 'Game Boy Advance',
  gbc: 'Game Boy Color', gb: 'Game Boy', snes: 'Super Nintendo', nes: 'NES', n64: 'Nintendo 64', genesis: 'Mega Drive', 'genesis-slash-megadrive': 'Mega Drive',
  sms: 'Master System', gamegear: 'Game Gear', segacd: 'Sega CD', saturn: 'Saturn', dc: 'Dreamcast', xbox: 'Xbox', xbox360: 'Xbox 360', arcade: 'Arcade',
  'turbografx16--1': 'PC Engine', neogeoaes: 'Neo Geo', atari2600: 'Atari 2600', '3do': '3DO',
};
const SKIP_DIR = /^(bios|saves?|states?|media|images|videos|manuals|downloaded_media|\..*)$/i;
const SKIP_FILE = /\.(txt|nfo|xml|jpe?g|png|gif|pdf|md|sav|srm|state\d*|dat|sfv|md5|sha1|json|db|ini|cfg|log|bak|partial|part)$/i;
const id = (s) => -(parseInt(crypto.createHash('sha1').update(s).digest('hex').slice(0, 8), 16) % 1e9) - 1; // negative: never a RomM id
// "Final Fantasy VII (USA) (Disc 1).cue" -> "Final Fantasy VII"
const clean = (n) => n.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/\.m3u$/i, '').replace(/[_]+/g, ' ').replace(/\s*[[(][^\])]*[\])]/g, '').replace(/\s{2,}/g, ' ').trim() || n;

function slugFor(folder) {
  const f = folder.toLowerCase();
  if (PLATFORM_MAP[f]?.includes(f)) return f; // the folder is RomM's own slug (psx, ps2...)
  for (const [slug, names] of Object.entries(PLATFORM_MAP)) if (names[0] === f) return slug;
  for (const [slug, names] of Object.entries(PLATFORM_MAP)) if (names.includes(f)) return slug;
  return f;
}
function build(root) {
  const platforms = [], roms = {};
  let dirs = []; try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && !SKIP_DIR.test(d.name)); } catch {}
  for (const d of dirs) {
    const dir = path.join(root, d.name);
    let items = []; try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    const games = items.filter((x) => !x.name.startsWith('.') && (x.isDirectory() ? !SKIP_DIR.test(x.name) : !SKIP_FILE.test(x.name)));
    // a disc set: "Game (Disc 1).cue" ... are one game when a playlist names them; .bin next to .cue too
    const names = new Set(games.map((g) => g.name));
    const hidden = new Set();
    for (const g of games) {
      if (/\.cue$/i.test(g.name)) for (const x of games) if (/\.bin$/i.test(x.name) && x.name.startsWith(g.name.replace(/\.cue$/i, ''))) hidden.add(x.name);
      if (/\.m3u$/i.test(g.name)) { try { for (const l of fs.readFileSync(path.join(dir, g.name), 'utf8').split('\n')) if (names.has(l.trim())) hidden.add(l.trim()); } catch {} }
    }
    const list = games.filter((g) => !hidden.has(g.name));
    if (!list.length) continue;
    const slug = slugFor(d.name), pid = id('platform:' + slug);
    platforms.push({ id: pid, slug, fs_slug: d.name, name: NAMES[slug] || d.name, display_name: NAMES[slug] || d.name.toUpperCase(), rom_count: list.length, local: true });
    roms[pid] = list.map((g) => {
      let size = 0; try { size = g.isDirectory() ? 0 : fs.statSync(path.join(dir, g.name)).size; } catch {}
      return { id: id(`rom:${slug}/${g.name}`), name: clean(g.name), fs_name: g.name, platform_id: pid, platform_slug: slug, platform_fs_slug: d.name, platform_display_name: NAMES[slug] || d.name, fs_size_bytes: size, files: [], regions: [], genres: [], local: true };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }
  platforms.sort((a, b) => a.display_name.localeCompare(b.display_name));
  return { platforms, roms };
}
module.exports = { build, clean, slugFor };
