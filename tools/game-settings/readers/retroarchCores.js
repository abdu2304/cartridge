// RetroArch core options per game (0.9.62): <config>/config/<core name>/<game>.opt, key = "value" lines (runloop.c
// game-specific options). Each core's options come from its own source: v2 definitions (retro_core_option_v2_definition:
// key, desc, desc_categorized, info, info_categorized, category, values {value, label}, default) with categories as tabs,
// v1 ({key, desc, info, values, default}) or the old retro_variable form ({"key", "Label; a|b|c"}, first value the
// default). The folder name is the core's library_name, which the libretro .info file gives as "corename".
// Docs: docs/game-settings/retroarch.md
const fs = require('fs');
const path = require('path');
const URLS = {
 "snes9x": "https://raw.githubusercontent.com/libretro/snes9x/master/libretro/libretro_core_options.h",
 "mgba": "https://raw.githubusercontent.com/libretro/mgba/master/src/platform/libretro/libretro_core_options.h",
 "gearboy": "https://raw.githubusercontent.com/drhelius/Gearboy/master/platforms/libretro/libretro_core_options.h",
 "genesis_plus_gx": "https://raw.githubusercontent.com/libretro/Genesis-Plus-GX/master/libretro/libretro_core_options.h",
 "swanstation": "https://raw.githubusercontent.com/libretro/swanstation/master/src/libretro/libretro_core_options.h",
 "mednafen_psx_hw": "https://raw.githubusercontent.com/libretro/beetle-psx-libretro/master/libretro_core_options.h",
 "mednafen_psx": "https://raw.githubusercontent.com/libretro/beetle-psx-libretro/master/libretro_core_options.h",
 "mupen64plus_next": "https://raw.githubusercontent.com/libretro/mupen64plus-libretro-nx/master/libretro/libretro_core_options.h",
 "parallel_n64": "https://raw.githubusercontent.com/libretro/parallel-n64/master/libretro/libretro_core_options.h",
 "melonds": "https://raw.githubusercontent.com/libretro/melonDS/master/src/libretro/libretro_core_options.h",
 "handy": "https://raw.githubusercontent.com/libretro/libretro-handy/master/libretro/libretro_core_options.h",
 "mednafen_pce_fast": "https://raw.githubusercontent.com/libretro/beetle-pce-fast-libretro/master/libretro_core_options.h",
 "mednafen_pce": "https://raw.githubusercontent.com/libretro/beetle-pce-libretro/master/libretro_core_options.h",
 "mednafen_saturn": "https://raw.githubusercontent.com/libretro/beetle-saturn-libretro/master/libretro_core_options.h",
 "opera": "https://raw.githubusercontent.com/libretro/opera-libretro/master/libretro_core_options.h",
 "nestopia": "https://raw.githubusercontent.com/libretro/nestopia/master/libretro/libretro_core_options.h",
 "quicknes": "https://raw.githubusercontent.com/libretro/QuickNES_Core/master/libretro/libretro_core_options.h",
 "mednafen_ngp": "https://raw.githubusercontent.com/libretro/beetle-ngp-libretro/master/libretro_core_options.h",
 "mednafen_wswan": "https://raw.githubusercontent.com/libretro/beetle-wswan-libretro/master/libretro_core_options.h",
 "mednafen_vb": "https://raw.githubusercontent.com/libretro/beetle-vb-libretro/master/libretro_core_options.h",
 "mednafen_lynx": "https://raw.githubusercontent.com/libretro/beetle-lynx-libretro/master/libretro_core_options.h",
 "mednafen_pcfx": "https://raw.githubusercontent.com/libretro/beetle-pcfx-libretro/master/libretro_core_options.h",
 "gpsp": "https://raw.githubusercontent.com/libretro/gpsp/master/libretro/libretro_core_options.h",
 "vbam": "https://raw.githubusercontent.com/libretro/vbam-libretro/master/src/libretro/libretro_core_options.h",
 "vba_next": "https://raw.githubusercontent.com/libretro/vba-next/master/libretro/libretro_core_options.h",
 "atari800": "https://raw.githubusercontent.com/libretro/libretro-atari800/master/libretro/libretro_core_options.h",
 "virtualjaguar": "https://raw.githubusercontent.com/libretro/virtualjaguar-libretro/master/libretro_core_options.h",
 "gearsystem": "https://raw.githubusercontent.com/drhelius/Gearsystem/master/platforms/libretro/libretro_core_options.h",
 "gearcoleco": "https://raw.githubusercontent.com/drhelius/Gearcoleco/master/platforms/libretro/libretro_core_options.h",
 "bluemsx": "https://raw.githubusercontent.com/libretro/blueMSX-libretro/master/libretro_core_options.h",
 "hatari": "https://raw.githubusercontent.com/libretro/hatari/master/libretro/libretro_core_options.h",
 "ppsspp": "https://raw.githubusercontent.com/hrydgard/ppsspp/master/libretro/libretro_core_options.h",
 "flycast": "https://raw.githubusercontent.com/flyinghead/flycast/master/shell/libretro/libretro_core_options.h",
 "pokemini": "https://raw.githubusercontent.com/libretro/PokeMini/master/libretro/libretro_core_options.h",
 "freeintv": "https://raw.githubusercontent.com/libretro/FreeIntv/master/src/libretro_core_options.h",
 "vecx": "https://raw.githubusercontent.com/libretro/libretro-vecx/master/libretro_core_options.h",
 "px68k": "https://raw.githubusercontent.com/libretro/px68k-libretro/master/libretro_core_options.h",
 "o2em": "https://raw.githubusercontent.com/libretro/libretro-o2em/master/libretro_core_options.h",
 "mesen": "https://raw.githubusercontent.com/libretro/Mesen/master/Libretro/libretro_core_options.h",
 "gambatte": "https://raw.githubusercontent.com/libretro/gambatte-libretro/master/libgambatte/libretro/libretro_core_options.h",
 "sameboy": "https://raw.githubusercontent.com/libretro/SameBoy/buildbot/libretro/libretro_core_options.h",
 "picodrive": "https://raw.githubusercontent.com/libretro/picodrive/master/platform/libretro/libretro_core_options.h",
 "pcsx_rearmed": "https://raw.githubusercontent.com/libretro/pcsx_rearmed/master/frontend/libretro_core_options.h",
 "desmume": "https://raw.githubusercontent.com/libretro/desmume/master/desmume/src/frontend/libretro/libretro_core_options.h",
 "fbneo": "https://raw.githubusercontent.com/libretro/FBNeo/master/src/burner/libretro/libretro.cpp",
 "mame2003_plus": "https://raw.githubusercontent.com/libretro/mame2003-plus-libretro/master/src/mame2003/core_options.c",
 "prosystem": "https://raw.githubusercontent.com/libretro/prosystem-libretro/master/core/libretro_core_options.h",
 "puae": "https://raw.githubusercontent.com/libretro/libretro-uae/master/libretro/libretro-core.c",
 "vice_x64": "https://raw.githubusercontent.com/libretro/vice-libretro/master/libretro/libretro-core.c",
 "fceumm": "https://raw.githubusercontent.com/libretro/libretro-fceumm/master/src/drivers/libretro/libretro_core_options.h",
 "np2kai": "https://raw.githubusercontent.com/AZO234/NP2kai/wx_alpha/sdl/libretro/libretro_core_options.h",
 "citra": "https://raw.githubusercontent.com/libretro/citra/master/src/citra_libretro/citra_libretro.cpp",
 "kronos": "https://raw.githubusercontent.com/FCare/Kronos/extui-align/yabause/src/libretro/libretro_core_options.h",
 "yabasanshiro": "https://raw.githubusercontent.com/libretro/yabause/master/yabause/src/libretro/libretro_core_options.h",
 "potator": "https://raw.githubusercontent.com/libretro/potator/master/platform/libretro/libretro_core_options.h",
 "quasi88": "https://raw.githubusercontent.com/libretro/quasi88-libretro/master/src/LIBRETRO/libretro_core_options.h",
 "bsnes_hd_beta": "https://raw.githubusercontent.com/DerKoun/bsnes-hd/master/bsnes/target-libretro/libretro_core_options.h",
 "bsnes": "https://raw.githubusercontent.com/libretro/bsnes/master/bsnes/target-libretro/libretro.cpp",
 "mesen-s": "https://raw.githubusercontent.com/libretro/Mesen-S/master/Libretro/libretro.cpp",
 "cap32": "https://raw.githubusercontent.com/libretro/libretro-cap32/master/libretro/libretro-core.c",
 "fuse": "https://raw.githubusercontent.com/libretro/fuse-libretro/master/src/libretro.c",
 "neocd": "https://raw.githubusercontent.com/libretro/neocd_libretro/master/src/libretro.cpp",
 "tgbdual": "https://raw.githubusercontent.com/libretro/tgbdual-libretro/master/libretro/libretro.cpp",
 "melondsds": "https://raw.githubusercontent.com/JesseTG/melonds-ds/main/src/libretro/libretro.cpp",
 "crocods": "https://raw.githubusercontent.com/libretro/libretro-crocods/master/libretro.c",
 "fmsx": "https://raw.githubusercontent.com/libretro/fmsx-libretro/master/libretro.c",
 "81": "https://raw.githubusercontent.com/libretro/81-libretro/master/src/libretro.cpp",
 "gw": "https://raw.githubusercontent.com/libretro/gw-libretro/master/src/libretro.c",
 "arduous": "https://raw.githubusercontent.com/libretro/arduous/main/src/libretro/libretro.cpp",
 "mednafen_snes": "https://raw.githubusercontent.com/libretro/beetle-bsnes-libretro/master/libretro.cpp",
 "sameduck": "https://raw.githubusercontent.com/LIJI32/SameBoy/master/libretro/libretro_core_options.inc"
};

// C initialisers: strings (adjacent ones joined), identifiers, numbers, braces
// keys built from a prefix the source doesn't define itself: Flycast's is in libretro_core_option_defines.h,
// Mupen64Plus-Next's is set by its Makefile (-DCORE_NAME)
const PREFIX = { flycast: { CORE_OPTION_NAME: 'reicast' }, mupen64plus_next: { CORE_NAME: 'mupen64plus' } };
function tokens(src, defsSrc = src, extra = {}) {
  const defs = { ...extra }; for (const m of String(defsSrc).matchAll(/^\s*#define\s+(\w+)\s+"([^"]*)"\s*$/gm)) defs[m[1]] ??= m[2]; // CORE_NAME "-cpu" style keys
  const t = String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ').replace(/^\s*#.*$/gm, ' ');
  const out = []; let i = 0;
  while (i < t.length) {
    const c = t[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"') { let s = ''; i++; while (i < t.length && t[i] !== '"') { if (t[i] === '\\') { s += t[i + 1] === 'n' ? '\n' : t[i + 1]; i += 2; } else s += t[i++]; } i++; if (out.length && out[out.length - 1].s != null && out[out.length - 1].join) out[out.length - 1].s += s; else out.push({ s, join: true }); continue; }
    if ('{},'.includes(c)) { out.push({ p: c }); i++; continue; }
    const m = /^[A-Za-z0-9_.:+\-()]+/.exec(t.slice(i));
    if (m) { i += m[0].length; if (defs[m[0]] != null) { const last = out[out.length - 1]; if (last && last.s != null && last.join) last.s += defs[m[0]]; else out.push({ s: defs[m[0]], join: true }); } else out.push({ id: m[0] }); continue; }
    out.push({ p: c }); i++;
  }
  return out.map((x) => (x.s != null ? { s: x.s } : x));
}
function tree(toks, at) { const arr = []; let i = at + 1; while (i < toks.length && toks[i].p !== '}') { const x = toks[i]; if (x.p === '{') { const [sub, j] = tree(toks, i); arr.push(sub); i = j + 1; } else { if (x.p !== ',') arr.push(x.s != null ? x.s : x.id === 'NULL' ? null : x.id); i++; } } return [arr, i]; }
function arrayAfter(src, re, extra) { const m = re.exec(src); if (!m) return null; const toks = tokens(src.slice(m.index + m[0].length), src, extra); const k = toks.findIndex((x) => x.p === '{'); return k < 0 ? null : tree(toks, k)[0]; }
const human = (s) => String(s || '').replace(/_/g, ' ').trim();
function read1(src, extra = {}) {
  const cats = {}; const ca = arrayAfter(src, /retro_core_option_v2_category\s+option_cats_us\s*\[\s*\]\s*=/, extra);
  for (const c of ca || []) if (Array.isArray(c) && typeof c[0] === 'string') cats[c[0]] = c[1];
  let defs = arrayAfter(src, /retro_core_option_v2_definition\s+option_defs_us\s*\[\s*\]\s*=/, extra), v2 = true;
  if (!defs) { defs = arrayAfter(src, /retro_core_option_definition\s+option_defs_us\s*\[\s*\]\s*=/, extra); v2 = false; }
  if (!defs) { defs = arrayAfter(src, /retro_core_option_v2_definition\s+option_defs\s*\[\s*\]\s*=/, extra); v2 = true; } // built into option_defs_us at run time (FCEUmm)
  const out = [], seen = new Set();
  const add = (k, l, desc, tab, vals, d) => {
    if (!k || seen.has(k) || !vals.length) return; seen.add(k);
    const o = vals.map(([v, lab]) => [v, lab || v]);
    const isBool = o.length === 2 && o.every(([v]) => /^(enabled|disabled)$/.test(v));
    out.push({ s: '', k, t: 'enum', o: isBool ? [['enabled', 'On'], ['disabled', 'Off']] : o, d: d ?? o[0][0], l: l || k, ...(desc ? { desc } : {}), tab: tab || 'Core Options', ...(isBool ? { t: 'bool' } : {}) });
  };
  if (defs) {
    for (const e of defs) {
      if (!Array.isArray(e) || typeof e[0] !== 'string') continue;
      const vals = Array.isArray(v2 ? e[6] : e[3]) ? (v2 ? e[6] : e[3]) : [], d = v2 ? e[7] : e[4];
      add(e[0], v2 ? e[2] || e[1] : e[1], (v2 ? e[3] : e[2]) || '', v2 && e[5] && cats[e[5]] ? cats[e[5]] : '', vals.filter((x) => Array.isArray(x) && typeof x[0] === 'string').map((x) => [x[0], x[1]]), typeof d === 'string' ? d : null);
    }
  }
  if (!out.length) for (const m of String(src).matchAll(/\{\s*"([a-z0-9][a-z0-9_\-]*)"\s*,\s*"([^";]{2,80});\s*([^"]+)"\s*\}/gi)) add(m[1], m[2].trim(), '', '', m[3].split('|').map((v) => [v.trim(), v.trim()]), m[3].split('|')[0].trim());
  return out;
}
module.exports = {
  id: 'retroarchCores',
  files: Object.entries(URLS).flatMap(([k, u]) => [{ url: u, as: k + '.h' }, { url: `https://raw.githubusercontent.com/libretro/libretro-core-info/master/${k}_libretro.info`, as: k + '.info' }]),
  read(dir) {
    const out = {};
    for (const k of Object.keys(URLS)) {
      let src = '', info = ''; try { src = fs.readFileSync(path.join(dir, k + '.h'), 'utf8'); } catch {} try { info = fs.readFileSync(path.join(dir, k + '.info'), 'utf8'); } catch {}
      const name = (/^\s*corename\s*=\s*"([^"]+)"/m.exec(info) || [])[1];
      const entries = read1(src, PREFIX[k]);
      if (name && entries.length) out[k] = { name, entries };
    }
    return out;
  },
};
