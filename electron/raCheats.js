// RetroArch cheats from the libretro cheat database (0.9.71, handover Part 9 item 17). Read from RetroArch's own source
// (cheat_manager.c, command.c): at every start it loads <cheat_database_path>/<core library_name>/<content name>.cht
// (the game's file name without its extension) and applies the cheats marked enable when apply_cheats_after_load is on.
// Cartridge writes that one file with the cheats you pick, copied whole from libretro-database's cht/<System>/<Game>.cht
// (matched through chtIndex.json.gz, made by tools/cheats/index.js), and turns apply_cheats_after_load on once.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

// RomM's console slugs to libretro-database's system folders (the folder list read from the repository, 17 Oct 2026)
const SYSTEMS = {
  nes: 'Nintendo - Nintendo Entertainment System', famicom: 'Nintendo - Nintendo Entertainment System', fds: 'Nintendo - Family Computer Disk System',
  snes: 'Nintendo - Super Nintendo Entertainment System', sfam: 'Nintendo - Super Nintendo Entertainment System', satellaview: 'Nintendo - Satellaview',
  n64: 'Nintendo - Nintendo 64', gb: 'Nintendo - Game Boy', gbc: 'Nintendo - Game Boy Color', gba: 'Nintendo - Game Boy Advance', nds: 'Nintendo - Nintendo DS',
  virtualboy: 'Nintendo - Virtual Boy', 'genesis-slash-megadrive': 'Sega - Mega Drive - Genesis', genesis: 'Sega - Mega Drive - Genesis', megadrive: 'Sega - Mega Drive - Genesis',
  sms: 'Sega - Master System - Mark III', gamegear: 'Sega - Game Gear', segacd: 'Sega - Mega-CD - Sega CD', sega32: 'Sega - 32X', sega32x: 'Sega - 32X',
  saturn: 'Sega - Saturn', dc: 'Sega - Dreamcast', sg1000: 'Sega - SG-1000', psx: 'Sony - PlayStation', psp: 'Sony - PlayStation Portable',
  'turbografx16--1': 'NEC - PC Engine - TurboGrafx 16', pce: 'NEC - PC Engine - TurboGrafx 16', 'turbografx-cd': 'NEC - PC Engine CD - TurboGrafx-CD', supergrafx: 'NEC - PC Engine SuperGrafx', 'pc-fx': 'NEC - PC-FX',
  atari2600: 'Atari - 2600', atari5200: 'Atari - 5200', atari7800: 'Atari - 7800', lynx: 'Atari - Lynx', jaguar: 'Atari - Jaguar',
  ngp: 'SNK - Neo Geo Pocket', ngpc: 'SNK - Neo Geo Pocket Color', wonderswan: 'Bandai - WonderSwan', 'wonderswan-color': 'Bandai - WonderSwan Color',
  colecovision: 'Coleco - ColecoVision', intellivision: 'Mattel - Intellivision', msx: 'Microsoft - MSX', msx2: 'Microsoft - MSX2',
};
const RAW = 'https://raw.githubusercontent.com/libretro/libretro-database/master/cht/';
let INDEX = null;
const index = () => INDEX || (INDEX = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'chtIndex.json.gz'))).toString('utf8')));
const systemOf = (slugs) => [].concat(slugs).filter(Boolean).map((s) => SYSTEMS[String(s).toLowerCase()]).find(Boolean) || null;
// a title without its tags ("Super Mario World (USA) (Game Genie)" -> "supermarioworld")
const base = (n) => String(n || '').replace(/\s*[([].*$/, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
// the database's files for a game: its own file name first (No-Intro names match exactly), then every file of the same title
function filesFor(system, names, idx = index()) {
  const list = idx.systems?.[system] || [];
  const stems = [].concat(names).filter(Boolean).map((n) => path.basename(String(n)).replace(/\.[^.]+$/, ''));
  const exact = list.filter((f) => stems.includes(f));
  const want = new Set(stems.map(base).filter(Boolean));
  return [...new Set([...exact, ...list.filter((f) => want.has(base(f)))])].slice(0, 12);
}

// .cht text: "cheats = N", then cheat<i>_<field> = value; every field of a cheat kept as written
function parse(text) {
  const by = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^\s*cheat(\d+)_(\w+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    let v = m[3]; if (/^".*"$/.test(v)) v = v.slice(1, -1);
    if (!by.has(+m[1])) by.set(+m[1], {});
    by.get(+m[1])[m[2]] = v;
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([, f]) => f).filter((f) => f.desc != null || f.code != null);
}
const QUOTED = new Set(['desc', 'code']);
function build(cheats) {
  const out = [`cheats = ${cheats.length}`, ''];
  cheats.forEach((c, i) => {
    for (const [k, v] of Object.entries(c)) out.push(`cheat${i}_${k} = ${QUOTED.has(k) || /[\s+]/.test(v) ? `"${v}"` : v}`);
    out.push('');
  });
  return out.join('\n');
}

const cfgGet = (text, key) => { const m = new RegExp(`^\\s*${key}\\s*=\\s*"?([^"\\n]*)"?\\s*$`, 'm').exec(text || ''); return m ? m[1] : null; };
// where RetroArch looks: cheat_database_path ("default" or empty = <config>/cheats, ":" = the config folder, "~" = home)
function cheatDir(cfgDir, cfgText) {
  const v = cfgGet(cfgText, 'cheat_database_path');
  if (!v || v === 'default') return path.join(cfgDir, 'cheats');
  return v.replace(/^:(?=[\\/]|$)/, cfgDir).replace(/^~(?=[\\/]|$)/, os.homedir());
}
const fileOf = (dir) => path.join(dir.cheats, dir.coreName, dir.content + '.cht');
const keyOf = (dir, c) => `ra:${dir.coreName}:${dir.content}:${c.desc}`;

// the database's cheats for the game (each file fetched once a week into the cache) plus what its file already has
async function list(dir, mine = {}, { fetchImpl = fetch, cacheDir } = {}) {
  const have = parse(read(fileOf(dir)));
  const seen = new Set(), out = [];
  const add = (c, src, on) => {
    if (!c.desc || seen.has(c.desc)) return; seen.add(c.desc);
    const key = keyOf(dir, c), shown = unescape(c.desc);
    out.push({ key, name: shown, description: shown, notes: src, version: 'All', on, by: on ? (mine[key] ? 'cartridge' : 'emulator') : null, lines: [c.code || ''], raw: c });
  };
  for (const c of have) add(c, 'In RetroArch', c.enable === 'true');
  for (const f of dir.files || []) {
    const text = await fetchCht(dir.system, f, { fetchImpl, cacheDir });
    const tag = (/\(([^)]*(Genie|Replay|GameShark|Code Breaker|Pro Action|Rumbles)[^)]*)\)/i.exec(f) || [])[1] || 'Cheat';
    for (const c of parse(text)) add(c, tag, false);
  }
  return out.sort((a, b) => Number(b.on) - Number(a.on) || a.description.localeCompare(b.description));
}
async function fetchCht(system, name, { fetchImpl = fetch, cacheDir } = {}) {
  const cache = cacheDir && path.join(cacheDir, (system + '__' + name).replace(/[^\w.-]+/g, '_') + '.cht');
  try { if (cache && Date.now() - fs.statSync(cache).mtimeMs < 7 * 864e5) return fs.readFileSync(cache, 'utf8'); } catch {}
  try {
    const res = await fetchImpl(RAW + encodeURIComponent(system) + '/' + encodeURIComponent(name) + '.cht', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(String(res.status));
    const text = await res.text();
    if (cache) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(cache, text); }
    return text;
  } catch (e) { try { return fs.readFileSync(cache, 'utf8'); } catch { return ''; } }
}
// the database writes some quotes and ampersands as HTML (&quot;): shown plainly, written back as they were
const unescape = (t) => String(t).replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };

// write the game's file: the cheats on (enable = true), in the order shown; a file only Cartridge made goes when empty.
// Cheats already in RetroArch's file that weren't changed here are kept as they are.
function set(dir, all, changes, mine = {}) {
  const rec = { ...mine };
  const f = fileOf(dir);
  const had = parse(read(f));
  const want = new Map(changes.map((c) => [c.key, c.on]));
  const keep = [];
  const seen = new Set();
  for (const c of had) { const k = keyOf(dir, c); seen.add(c.desc); const on = want.has(k) ? want.get(k) : c.enable === 'true'; if (on || !rec[k]) keep.push({ ...c, enable: on ? 'true' : 'false' }); if (!on) delete rec[k]; }
  for (const it of all) { if (!want.get(it.key) || seen.has(it.raw.desc)) continue; keep.push({ ...it.raw, enable: 'true' }); rec[it.key] = true; }
  for (const k of Object.keys(rec)) if (k.startsWith(`ra:${dir.coreName}:${dir.content}:`) && !keep.some((c) => keyOf(dir, c) === k && c.enable === 'true')) delete rec[k];
  if (!keep.length) { if (had.length) fs.rmSync(f, { force: true }); return rec; }
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, build(keep));
  return rec;
}
// apply_cheats_after_load (default false in RetroArch): without it the file loads but nothing is applied
function ensureApply(cfgFile) {
  const text = read(cfgFile);
  if (!text || cfgGet(text, 'apply_cheats_after_load') === 'true') return false;
  const next = /^\s*apply_cheats_after_load\s*=/m.test(text) ? text.replace(/^(\s*apply_cheats_after_load\s*=\s*).*$/m, '$1"true"') : text.replace(/\n?$/, '\napply_cheats_after_load = "true"\n');
  fs.writeFileSync(cfgFile, next);
  return true;
}

module.exports = { SYSTEMS, systemOf, filesFor, parse, build, cheatDir, fileOf, list, set, ensureApply, fetchCht, base };
