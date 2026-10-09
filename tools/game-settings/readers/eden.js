// Eden's per-game settings (Switch; yuzu's format, also Citron and yuzu): src/common/settings.h (only SwitchableSetting
// is read from a game's custom/<TITLE ID>.ini, frontend_common/config.cpp ReadSettingGeneric), sections from
// TranslateCategory (common/settings.cpp), enums from settings_enums.h, names and choices from the Qt
// shared_translation.cpp. Docs: docs/game-settings/eden.md
const fs = require('fs');
const path = require('path');
const RAW = 'https://git.eden-emu.dev/eden-emu/eden/raw/branch/master/src/';

// the preprocessor for a Linux x86-64 desktop build (no NCE: that is arm64 only)
const DEFINED = new Set(['__linux__', '__unix__', 'ARCHITECTURE_x86_64', 'HAS_OPENGL']);
function cpp(text) {
  const out = []; const stack = []; // each: { on, taken, parent }
  const live = () => stack.every((s) => s.on);
  const test = (expr) => {
    const js = expr.replace(/\/\/.*$/, '').replace(/defined\s*\(\s*(\w+)\s*\)|defined\s+(\w+)/g, (_, a, b) => (DEFINED.has(a || b) ? '1' : '0'))
      .replace(/\b[A-Za-z_]\w*\b/g, (w) => (DEFINED.has(w) ? '1' : '0'));
    try { return !!Function(`return (${js})`)(); } catch { return false; }
  };
  for (const line of text.split('\n')) {
    const m = /^\s*#\s*(ifdef|ifndef|if|elif|else|endif)\b(.*)$/.exec(line);
    if (!m) { if (live()) out.push(line); continue; }
    const [, d, rest] = m;
    if (d === 'ifdef' || d === 'ifndef' || d === 'if') {
      const v = d === 'ifdef' ? DEFINED.has(rest.trim()) : d === 'ifndef' ? !DEFINED.has(rest.trim()) : test(rest);
      stack.push({ on: v, taken: v });
    } else if (d === 'elif') { const s = stack[stack.length - 1]; s.on = !s.taken && test(rest); s.taken = s.taken || s.on; }
    else if (d === 'else') { const s = stack[stack.length - 1]; s.on = !s.taken; s.taken = true; }
    else stack.pop();
  }
  return out.join('\n');
}
// top-level comma split of a C++ argument list
function args(s) {
  const out = []; let depth = 0, cur = '', str = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (str) { cur += c; if (c === '\\') { cur += s[++i]; } else if (c === '"') str = false; continue; }
    if (c === '"') { str = true; cur += c; continue; }
    if ('({<['.includes(c)) depth++;
    if (')}>]'.includes(c)) depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
// "a" "b" -> ab (C string literal concatenation)
const lit = (s) => [...s.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join('').replace(/\\n/g, '\n').replace(/\\(["'\\])/g, '$1');
// a call's text from its opening bracket, balanced
function block(t, i, open = '{', close = '}') {
  let depth = 0, str = false;
  for (let j = i; j < t.length; j++) {
    const c = t[j];
    if (str) { if (c === '\\') j++; else if (c === '"') str = false; continue; }
    if (c === '"') str = true; else if (c === open) depth++; else if (c === close && --depth === 0) return t.slice(i + 1, j);
  }
  return '';
}

// ini section per category (TranslateCategory), and which categories a game's file is read for (Config::ReadValues
// with global false: Debugging only program_args/debug_knobs, Network inside [Services])
const SECTION = { Audio: 'Audio', UiAudio: 'Audio', Core: 'Core', Cpu: 'Cpu', CpuDebug: 'Cpu', CpuUnsafe: 'Cpu',
  Renderer: 'Renderer', RendererAdvanced: 'Renderer', RendererHacks: 'Renderer', RendererExtensions: 'Renderer', RendererDebug: 'Renderer',
  System: 'System', SystemAudio: 'System', Network: 'Services', LibraryApplet: 'LibraryApplet', Controls: 'Controls', Debugging: 'Debugging' };
// tabs: Eden's per-game dialog (System, CPU, Graphics, Adv. Graphics, GPU Extensions, Audio, Applets), debug in Advanced
const TAB = { Audio: 'Audio', UiAudio: 'Audio', SystemAudio: 'Audio', Core: 'System', System: 'System', Network: 'System', Controls: 'System',
  Cpu: 'CPU', CpuUnsafe: 'CPU', Renderer: 'Graphics', RendererAdvanced: 'Advanced Graphics', RendererHacks: 'Advanced Graphics',
  RendererExtensions: 'Advanced Graphics', LibraryApplet: 'Applets', CpuDebug: 'Advanced', RendererDebug: 'Advanced', Debugging: 'Advanced' };
const ADV = new Set(['CpuDebug', 'RendererDebug', 'Debugging']);
// not for a game's file: paths, devices picked at run time, program arguments
// cpu_backend and nce_*: NCE is arm64 only, so an x86-64 build has Dynarmic alone
const SKIP = /^(output_device|input_device|program_args|vulkan_device|selected_gpu|network_interface|cpu_backend|nce_\w+)$/;
// VSync isn't in shared_translation (the graphics page names the present modes: TranslateVSyncMode, Vulkan wording)
const VSYNC = [['0', 'Immediate (VSync Off)'], ['1', 'Mailbox (Recommended)'], ['2', 'FIFO (VSync On)'], ['3', 'FIFO Relaxed']];

function read(dir, opts = {}) {
  const src = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  // enums: ENUM(Name, A, B, ...) are numbered from 0; written as numbers (Setting::ToString)
  const enums = {};
  const et = cpp(src('settings_enums.h'));
  for (const m of et.matchAll(/^ENUM\((\w+),([^;)]*)\)/gm)) enums[m[1]] = m[2].split(',').map((x) => x.trim()).filter(Boolean);
  for (const m of et.matchAll(/enum class (\w+)\s*:\s*u32\s*\{([^}]*)\}/g)) if (!enums[m[1]]) enums[m[1]] = m[2].split(',').map((x) => x.trim()).filter(Boolean);
  // names and tooltips by member, choices by enum
  const tt = cpp(src('shared_translation.cpp'));
  const names = {};
  for (const m of tt.matchAll(/INSERT\(/g)) {
    const a = args(block(tt, m.index + 6, '(', ')'));
    if (a[0] !== 'Settings') continue;
    names[a[1]] = { l: lit(a[2] || ''), desc: lit(a[3] || '') };
  }
  const choices = {};
  const ci = tt.indexOf('ComboboxEnumeration');
  for (const m of tt.slice(ci).matchAll(/EnumMetadata<Settings::(\w+)>::Index\(\),/g)) {
    const at = ci + m.index + m[0].length; const body = block(tt, tt.indexOf('{', at));
    choices[m[1]] = [...body.matchAll(/(?:PAIR\(\s*\w+,\s*(\w+),|static_cast<u32>\(Settings::\w+::(\w+)\),)\s*tr\(((?:\s*"(?:[^"\\]|\\.)*")+)/g)]
      .map((x) => [x[1] || x[2], lit(x[3]).replace(/\s*\(%1\)/, '')]);
  }
  // SwitchableSetting<Type[, ranged]> member{linkage, default, [min, max,] "label", Category::X, spec, save, ...};
  const st = cpp(src('settings.h'));
  const out = [];
  for (const m of st.matchAll(/SwitchableSetting<\s*([\w:<>]+?)\s*(?:,\s*(true|false))?\s*>\s+(\w+)\s*\{/g)) {
    const [, type, , member] = m;
    const a = args(block(st, m.index + m[0].length - 1));
    const li = a.findIndex((x) => /^"/.test(x));
    const cat = (a[li + 1] || '').replace('Category::', '');
    if (a[li + 3] === 'false') continue; // save_ false: never in a config file
    const key = lit(a[li]);
    if (!SECTION[cat] || SKIP.test(key)) continue;
    if (cat === 'Debugging' && !/^(debug_knobs)$/.test(key)) continue; // a game's file reads only these two there
    const e = { s: SECTION[cat], k: key, cat, member };
    const def = a[1];
    if (type === 'bool') { e.t = 'bool'; e.d = def; }
    else if (type === 'std::string') { e.t = 'text'; e.d = lit(def); }
    else if (type === 'float') { e.t = 'float'; e.d = /^-?[\d.]+f?$/.test(def) ? Number(def.replace(/f$/, '')).toFixed(6) : null; }
    else if (enums[type]) {
      e.t = 'enum'; const vals = enums[type];
      const di = vals.indexOf(def.split('::').pop()); e.d = di >= 0 ? String(di) : null;
      const lab = Object.fromEntries(choices[type] || []);
      e.o = vals.map((v, i) => [String(i), lab[v] || v.replace(/_/g, ' ')]).filter(([, , ], i) => !choices[type] || lab[vals[i]]);
    } else {
      e.t = 'int'; e.d = /^-?\d+$/.test(def) ? def : null;
      if (li === 4 && /^-?\d+$/.test(a[2]) && /^-?\d+$/.test(a[3])) { e.min = Number(a[2]); e.max = Number(a[3]); }
    }
    if (e.t === 'bool') e.o = [['true', 'On'], ['false', 'Off']];
    if (type === 'VSyncMode') e.o = VSYNC;
    const n = names[member];
    if (n && n.l.trim()) e.l = n.l.replace(/:$/, '').replace(/&/g, ''); else e.l = null;
    if (n && n.desc) e.desc = n.desc.split('\n')[0]; // the first line: a short tooltip
    out.push(e);
  }
  return out;
}
// a setting with no name in the UI is shown as part of another (use_speed_limit beside speed_limit) or not at all;
// keep the paired ones, named from their key
const fromKey = (k) => k.replace(/_index$/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
// shown nowhere in the desktop UI or debug only: Advanced
const HIDDEN_ADV = /^(bg_(red|green|blue)|post_shader_(chain|preset)|frame_gen_dump_flow|debug_knobs|disable_buffer_reorder)$/;
module.exports = {
  id: 'eden',
  versions: { git: 'https://git.eden-emu.dev/eden-emu/eden', tags: /^v\d+\.\d+\.\d+$/ }, // 0.9.63: its last releases too (gen.js)
  files: [
    { url: RAW + 'common/settings.h', as: 'settings.h' },
    { url: RAW + 'common/settings_enums.h', as: 'settings_enums.h' },
    { url: RAW + 'qt_common/config/shared_translation.cpp', as: 'shared_translation.cpp' },
  ],
  read: (dir) => read(dir).map(({ cat, member, ...x }) => ({ ...x, l: x.l || fromKey(x.k), tab: ADV.has(cat) || HIDDEN_ADV.test(x.k) ? 'Advanced' : TAB[cat] || 'System', adv: ADV.has(cat) || HIDDEN_ADV.test(x.k) || undefined })),
  _cpp: cpp, _args: args, _lit: lit, _block: block, _raw: read,
};
