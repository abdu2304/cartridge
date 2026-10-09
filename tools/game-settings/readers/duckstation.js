// DuckStation's per-game settings: System::UpdateGameSettingsLayer (core/system.cpp) puts gamesettings/<SERIAL>.ini
// as a layer over settings.ini, and Settings::Load (core/settings.cpp) reads every setting through it. Names, help,
// defaults and choices come from the Big Picture settings pages a game's own settings show
// (core/fullscreenui_settings.cpp per_game_pages: Console, Emulation, Graphics, Audio, Advanced; blocks behind
// `if (!game_settings)` are global only); enum spellings from settings.cpp's s_*_names arrays. Keys Settings::Load
// reads that no page shows are added from settings.cpp (Advanced). Docs: docs/game-settings/duckstation.md
const fs = require('fs');
const path = require('path');
const RAW = 'https://raw.githubusercontent.com/stenzek/duckstation/master/src/';
const FILES = ['core/fullscreenui_settings.cpp', 'core/settings.cpp', 'core/settings.h', 'core/types.h', 'core/system.cpp', 'util/core_audio_stream.cpp', 'util/core_audio_stream.h'];
const PAGES = { DrawConsoleSettingsPage: 'System', DrawEmulationSettingsPage: 'Emulation', DrawGraphicsSettingsPage: 'Graphics', DrawAudioSettingsPage: 'Audio', DrawAdvancedSettingsPage: 'Advanced' };
// headings inside a page that get their own tab
const HEADING_TAB = { 'CPU Emulation': 'CPU', 'PGXP (Precision Geometry Transform Pipeline)': 'PGXP', 'Advanced Display Options': 'Advanced', 'Advanced Rendering Options': 'Advanced', Capture: 'Advanced', 'Texture Replacements': 'Advanced', 'Logging Settings': 'Advanced', 'Debugging Settings': 'Advanced', 'Device Settings': 'Graphics', 'Backend Settings': 'Audio' };

function splitTop(s) {
  const out = []; let depth = 0, cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && s[i - 1] !== '\\') q = !q;
    if (!q && '({['.includes(ch)) depth++;
    if (!q && ')}]'.includes(ch)) depth--;
    if (!q && ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function inParens(t, i) { let d = 0; for (let j = i; j < t.length; j++) { if (t[j] === '(') d++; else if (t[j] === ')' && --d === 0) return t.slice(i + 1, j); } return ''; }
// Linux build: drop Windows, macOS and Android blocks
function linuxOnly(t) {
  const out = []; const stack = [];
  for (const l of t.split('\n')) {
    const s = l.trim();
    if (/^#if/.test(s)) { const off = /_WIN32|__APPLE__|__ANDROID__|ANDROID|_MSC_VER/.test(s) && !/__linux__|ifndef/.test(s) && !/!defined/.test(s); stack.push(off); continue; }
    if (/^#elif/.test(s)) { if (stack.length) stack[stack.length - 1] = false; continue; }
    if (/^#else/.test(s)) { if (stack.length) stack[stack.length - 1] = !stack[stack.length - 1]; continue; }
    if (/^#endif/.test(s)) { stack.pop(); continue; }
    if (!stack.some(Boolean) && !/^\/\//.test(s)) out.push(l);
  }
  return out.join('\n');
}
// drops `if (!game_settings) { ... }` / `if (!game_settings) stmt;` (only shown in the global settings)
function perGameOnly(t) {
  let out = '', i = 0; const re = /if \(!game_settings\)\s*/g; let m;
  while ((m = re.exec(t))) {
    out += t.slice(i, m.index); let j = m.index + m[0].length;
    if (t[j] === '{') { let d = 0; for (; j < t.length; j++) { if (t[j] === '{') d++; else if (t[j] === '}' && --d === 0) break; } j++; }
    else { let d = 0; for (; j < t.length; j++) { if (t[j] === '(') d++; else if (t[j] === ')') d--; else if (t[j] === ';' && d === 0) break; } j++; }
    i = j; re.lastIndex = j;
  }
  return out + t.slice(i);
}
const str = (e) => { const s = [...String(e || '').matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]); return s.length ? s.join('') : null; };
// FSUI_ICONVSTR(icon, "Title") / FSUI_VSTR("a" "b") / TRANSLATE_NOOP("Ctx", "Text") / TRANSLATE_DISAMBIG_NOOP("Ctx", "Text", "Dis")
const text = (e) => { if (/^TRANSLATE_(DISAMBIG_)?NOOP/.test(e)) return [...e.matchAll(/"((?:[^"\\]|\\.)*)"/g)][1]?.[1] ?? null; return str(e); };

function read(dir) {
  const src = (f) => { try { return linuxOnly(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return ''; } };
  const ui = src('core/fullscreenui_settings.cpp'), types = src('core/types.h');
  const audC = src('util/core_audio_stream.cpp'), audH = src('util/core_audio_stream.h');
  const setC = src('core/settings.cpp') + '\n' + audC, setH = src('core/settings.h') + '\n' + audH;
  const enums = {};
  for (const m of (types + setH).replace(/\/\/[^\n]*/g, '').matchAll(/enum class (\w+)\s*(?::\s*\w+)?\s*\{([^}]*)\}/g)) {
    let n = -1; const v = [];
    for (const e of m[2].split(',').map((x) => x.trim()).filter(Boolean)) { const [name, val] = e.split('=').map((x) => x.trim()); n = val != null && /^-?\d+$/.test(val) ? Number(val) : n + 1; v.push({ name, n }); }
    enums[m[1]] = v;
  }
  const arrays = {};
  for (const m of (setC + ui).matchAll(/std::array\s*(?:<[^>]*>)?\s*(\w+)\s*=\s*\{([\s\S]*?)\};/g)) {
    const items = splitTop(m[2].replace(/\/\/[^\n]*/g, ''));
    arrays[m[1]] = items.map((e) => (/^-?\d+(\.\d+)?f?$/.test(e) ? String(Number(e.replace(/f$/, ''))) : text(e))).filter((x) => x != null);
  }
  const value = (expr, depth = 0) => {
    if (expr == null || depth > 4) return null;
    const e = expr.trim().replace(/^static_cast<[^>]+>\((.*)\)$/, '$1');
    if (/^(true|false)$/.test(e)) return e;
    if (/^-?\d+(\.\d+)?f?u?$/.test(e)) return String(Number(e.replace(/[fu]$/, '')));
    if (/^"/.test(e)) return str(e);
    const em = /(\w+)::(\w+)$/.exec(e);
    if (em && enums[em[1]]) { const v = enums[em[1]].find((x) => x.name === em[2]); return v ? { type: em[1], n: v.n } : null; }
    const name = (/(\w+)$/.exec(e) || [])[1]; if (!name) return null;
    const c = new RegExp(`\\b${name}\\s*=\\s*([^;,{}]+)[;,}]`).exec(setH + ui);
    return c ? value(c[1], depth + 1) : null;
  };
  // Settings::GetXName -> its s_..._names array (enum index -> spelling); GetXDisplayName -> the display names
  const arrOf = (fn) => { const m = new RegExp(`\\w+::${fn}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`).exec(setC); const a = m && /(s_\w+)\s*\[/.exec(m[1]); return a ? arrays[a[1]] : null; };

  const out = {};
  const pagesRaw = {};
  for (const [fn, pageTab] of Object.entries(PAGES)) {
    const start = ui.indexOf(`void FullscreenUI::${fn}(`); if (start < 0) continue;
    const end = ui.indexOf('\nvoid FullscreenUI::', start + 10);
    pagesRaw[fn] = ui.slice(start, end);
    const t = perGameOnly(pagesRaw[fn]);
    const heads = [...t.matchAll(/MenuHeading\(FSUI_VSTR\("([^"]+)"\)/g)].map((m) => [m.index, m[1]]);
    for (const m of t.matchAll(/\bDraw(Toggle|Enum|IntList|IntRange|IntSpinBox|FloatRange|FloatSpinBox|SpeedSelector|StringList|IntRect)Setting\(/g)) {
      const a = splitTop(inParens(t, m.index + m[0].length - 1));
      if (a[0] !== 'bsi' && !/bsi/.test(a[0])) continue;
      const head = (heads.filter(([i]) => i < m.index).pop() || [])[1];
      const tab = HEADING_TAB[head] || pageTab;
      const l = text(a[1]), desc = text(a[2]);
      const base = { l, desc, tab, head };
      const add = (sec, key, e) => { if (!sec || !key) return; const id = sec + '|' + key; if (!out[id]) out[id] = { s: sec, k: key, ...base, ...e }; };
      const sec = str(a[3]), key = str(a[4]);
      switch (m[1]) {
        case 'Toggle': add(sec, key, { t: 'bool', d: value(a[5]), o: [['true', 'On'], ['false', 'Off']] }); break;
        case 'Enum': {
          const names = arrOf((/(\w+)$/.exec(a[7]) || [])[1]), disp = arrOf((/(\w+)$/.exec(a[8]) || [])[1]);
          const dv = value(a[5]);
          if (names) add(sec, key, { t: 'enum', d: dv && typeof dv === 'object' ? names[dv.n] ?? null : dv, o: names.map((x, i) => [x, (disp && disp[i]) || x]) });
          else add(sec, key, { t: 'text', d: null });
          break;
        }
        case 'IntList': {
          const opts = arrays[(/(\w+)$/.exec(a[6]) || [])[1]];
          const vals = a[8] && arrays[(/(\w+)$/.exec(a[8]) || [])[1]];
          const off = a[8] && /^-?\d+$/.test(a[8]) ? Number(a[8]) : 0;
          add(sec, key, opts ? { t: 'enum', d: value(a[5]), o: opts.map((x, i) => [vals ? vals[i] : String(i + off), x]) } : { t: 'int', d: value(a[5]) });
          break;
        }
        case 'IntRange': case 'IntSpinBox': add(sec, key, { t: 'int', d: value(a[5]), min: num(value(a[6])), max: num(value(a[7])) }); break;
        case 'FloatRange': case 'FloatSpinBox': add(sec, key, { t: 'float', d: value(a[5]), min: num(value(a[6])), max: num(value(a[7])) }); break;
        case 'SpeedSelector': add(sec, key, { t: 'float', d: value(a[5]), desc: (desc || '') + (desc ? ' ' : '') + '1 is 100%, 0 is unlimited.' }); break;
        case 'StringList': {
          const opts = arrays[(/(\w+)$/.exec(a[6]) || [])[1]], vals = arrays[(/(\w+)$/.exec(a[7]) || [])[1]];
          add(sec, key, opts && vals ? { t: 'enum', d: value(a[5]), o: vals.map((v, i) => [v, opts[i] || v]) } : { t: 'text', d: value(a[5]) });
          break;
        }
        case 'IntRect': for (let i = 0; i < 4; i++) add(sec, str(a[4 + i * 2]), { t: 'int', d: value(a[5 + i * 2]), min: num(value(a[12])), max: num(value(a[13])), l: `${l} (${['Left', 'Top', 'Right', 'Bottom'][i]})` }); break;
      }
    }
  }

  // ---- what Settings::Load reads that no per-game page shows (and no global-only block names)
  const load = (/void Settings::Load\(const SettingsInterface& si[\s\S]*?\n\}/.exec(setC) || [''])[0] + ((/void Settings::LoadPGXPSettings[\s\S]*?\n\}/.exec(setC) || [''])[0])
    + ((/::Load\(const SettingsInterface& si, const char\* section\)[\s\S]*?\n\}/.exec(audC) || [''])[0]).replace(/\(section,/g, '("Audio",');
  const named = ui.toLowerCase();
  // every si.GetXValue("Section", "Key", default) call, its arguments read whole
  const calls = [...load.matchAll(/si\.Get(Bool|Int|UInt|Float|StringView|String|TinyString|SmallString)Value\(/g)].map((m) => {
    const a = splitTop(inParens(load, m.index + m[0].length - 1));
    return { kind: m[1], sec: str(a[0]), key: str(a[1]), def: a[2] ?? (m[1] === 'Bool' ? 'false' : /Int|Float/.test(m[1]) ? '0' : null) };
  }).filter((c) => c.sec && c.key);
  for (const { kind, sec, key, def } of calls) {
    const id = sec + '|' + key;
    if (out[id] || named.includes(`"${key.toLowerCase()}"`)) continue;
    let e = { s: sec, k: key, l: null, tab: 'Advanced', adv: true };
    if (kind === 'Bool') { e.t = 'bool'; e.d = value(def); e.o = [['true', 'On'], ['false', 'Off']]; }
    else if (kind === 'Float') { e.t = 'float'; e.d = value(def); }
    else if (/Int/.test(kind)) { e.t = 'int'; e.d = value(def); }
    else {
      // Settings::GetXName(DEFAULT_...) as the default: an enum spelled by its names array
      const g = /Settings::(Get\w+Name)\((?:Settings::)?(\w+)\)/.exec(def || '') || /(Get\w+Name)\((?:Settings::)?(\w+)\)/.exec(def || '');
      const names = g && arrOf(g[1]); const disp = g && arrOf(g[1].replace(/Name$/, 'DisplayName'));
      if (names) { const dv = value(g[2]); e.t = 'enum'; e.o = names.map((x, i) => [x, (disp && disp[i]) || x]); e.d = dv && typeof dv === 'object' ? names[dv.n] ?? null : null; }
      else { e.t = 'text'; e.d = value(def); }
    }
    out[id] = e;
  }
  // a page's default that isn't a plain value (PGXPVertexCache passes another setting): Settings::Load's own
  for (const x of Object.values(out)) if (x.d == null || typeof x.d === 'object') {
    const m = calls.find((c) => c.sec === x.s && c.key === x.k);
    const v = m && value(m.def); x.d = v && typeof v === 'object' ? (x.o && x.t === 'enum' ? null : String(v.n)) : v;
    if (x.d && typeof x.d === 'object') x.d = null;
  }
  return Object.values(out).filter(keep).map(finish);
}
const num = (v) => (v != null && typeof v !== 'object' && !Number.isNaN(Number(v)) ? Number(v) : undefined);

// left out: paths, devices, accounts, controllers, memory card files, the DuckStation window
const DROP_SEC = /^(BIOS|Cheevos|ControllerPorts|Pad\d|MemoryCards|PCDrv|PIO|SIO|Hotkeys|InputSources|Logging|UI|GameList|Folders|BorderOverlay|PostProcessing|InternalPostProcessing)$/;
const DROP_KEY = /^(InhibitScreensaver|PauseOnFocusLoss|PauseOnControllerDisconnection|DisableBackgroundInput|ConfirmPowerOff|LoadDevicesFromSaveStates|ApplyGameSettings|EnableDiscordPresence|SaveStateOnExit|Adapter|Backend|Driver|OutputDevice|ExclusiveFullscreenControl|FullscreenMode|Fullscreen.*|StartFullscreen|StartPaused|UseSeparateConfigForDiscSet)$|Path$|Directory$|Dir$|Device$|DumpDirectory|MediaCapture|Screenshot|GDBServer/i;
const keep = (x) => !DROP_SEC.test(x.s) && !DROP_KEY.test(x.k) && !(x.s === 'GPU' && x.k === 'Adapter');
const human = (k) => { const w = String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim(); return w[0].toUpperCase() + w.slice(1); };
const ADV = /Debug|Log|Dump|Show(VRAM|GPUState|CDROM|SPU|Timers|MDEC|DMA)|Recompiler(MemoryExceptions|BlockLinking|ICache)|FastmemMode|UseThread|Threaded/;
function finish(x) {
  const o = { s: x.s, k: x.k, t: x.t, d: x.d ?? null, o: x.o, min: x.min, max: x.max, l: (x.l || human(x.k)).trim(), desc: x.desc && x.desc.split(/(?<=\.)\s/)[0].trim(), tab: x.tab };
  const adv = x.adv || o.tab === 'Advanced' || ADV.test(x.k) || /^(Debug|CDROM)$/.test(x.s) && o.tab === 'Advanced';
  if (adv) { o.tab = 'Advanced'; o.adv = true; }
  // texture packs: Cartridge installs them, so turning them on per game belongs with Graphics
  if (x.s === 'TextureReplacements' && /^(EnableTextureReplacements|EnableVRAMWriteReplacements|PreloadTextures)$/.test(x.k)) { o.tab = 'Graphics'; delete o.adv; }
  if (o.t === 'bool' && o.d != null && !/^(true|false)$/.test(o.d)) o.d = null;
  for (const k of Object.keys(o)) if (o[k] === undefined || (k === 'o' && !o.o)) delete o[k];
  return o;
}

module.exports = { id: 'duckstation', files: FILES.map((f) => ({ url: RAW + f, as: f })), read };
