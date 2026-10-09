// RPCS3's per-game settings: Emu/system_config.h (every cfg node a custom config can set; System.cpp BootGame loads
// config/custom_configs/config_<SERIAL>.yml over config.yml with g_cfg.from_string), value spellings from the
// fmt_class_string switches (system_config_types.cpp, cellSysutil.cpp), names, choices and tooltips from the Qt
// settings dialog (emu_settings_type.cpp maps a setting to its node, settings_dialog.cpp to its widget,
// settings_dialog.ui has the text and the tab, emu_settings.cpp GetLocalizedSetting the choice names, tooltips.h).
// Docs: docs/game-settings/rpcs3.md
const fs = require('fs');
const path = require('path');
const RAW = 'https://raw.githubusercontent.com/RPCS3/rpcs3/master/rpcs3/';
const FILES = ['Emu/system_config.h', 'Emu/system_config_types.h', 'Emu/system_config_types.cpp', 'Emu/Cell/Modules/cellSysutil.h', 'Emu/Cell/Modules/cellSysutil.cpp',
  'rpcs3qt/emu_settings_type.cpp', 'rpcs3qt/emu_settings.cpp', 'rpcs3qt/settings_dialog.cpp', 'rpcs3qt/settings_dialog.ui', 'rpcs3qt/tooltips.h'];

// enum class X { a, b = 3, ... } (blocks for Windows and macOS left out), and CELL_* style enums with values
function enumsOf(text) {
  const out = {};
  text = text.replace(/\/\/.*$/gm, '');
  for (const m of text.matchAll(/enum(?:\s+class)?\s+(\w+)\s*(?::\s*[\w ]+)?\s*\{([^}]*)\}/g)) {
    let n = -1, skip = 0; const vals = [];
    for (const raw of m[2].split('\n')) {
      const l = raw.replace(/\/\/.*$/, '').trim();
      if (/^#if/.test(l)) { skip = skip ? skip + 1 : /_WIN32|__APPLE__|ANDROID|_MSC_VER/.test(l) ? 1 : 0; continue; }
      if (/^#endif/.test(l)) { if (skip) skip--; continue; }
      if (/^#else/.test(l)) { if (skip === 1) skip = 0; continue; }
      for (const e0 of l.split(',')) {
        const e = e0.trim(); if (!e || /^#/.test(e)) continue;
        const [name, v] = e.split('=').map((x) => x.trim());
        n = v != null && /^-?(0x)?[\da-f]+$/i.test(v) ? Number(v) : n + 1;
        if (!skip) vals.push({ name, n });
      }
    }
    out[m[1]] = vals;
  }
  return out;
}
// fmt_class_string<T>::format: case T::a: return "Spelling";
function spellingsOf(text) {
  const out = {};
  for (const m of text.matchAll(/fmt_class_string<(\w+)>::format[\s\S]*?\n}\n/g)) {
    const map = {};
    for (const c of m[0].matchAll(/case (?:\w+::)?(\w+):\s*return "([^"]*)";/g)) map[c[1]] = c[2];
    out[m[1]] = map;
  }
  return out;
}

function read(dir) {
  const src = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } };
  const cfgH = src('Emu/system_config.h');
  const enums = { ...enumsOf(src('Emu/Cell/Modules/cellSysutil.h')), ...enumsOf(src('Emu/system_config_types.h')) };
  const spell = { ...spellingsOf(src('Emu/Cell/Modules/cellSysutil.cpp')), ...spellingsOf(src('Emu/system_config_types.cpp')) };
  // ---- the cfg tree: struct node_x : cfg::node { node_x(...) : cfg::node(_this, "Name") {} ... } member{ this };
  const out = [];
  const stack = []; let pendingStruct = false, skip = 0;
  const aliases = { fifo_setting: 'cfg::_enum<rsx_fifo_mode>' };
  for (const raw of cfgH.split('\n')) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (/^#if/.test(line)) { skip = skip ? skip + 1 : /_WIN32|__APPLE__|ANDROID/.test(line) && !/linux/.test(line) ? 1 : 0; continue; }
    if (/^#else/.test(line)) { if (skip === 1) skip = 0; else if (!skip && stack.length) skip = -1; continue; } // first branch is Linux
    if (/^#endif/.test(line)) { if (skip > 0) skip--; else if (skip === -1) skip = 0; continue; }
    if (skip) continue;
    if (/^struct \w+ : cfg::node$/.test(line)) { pendingStruct = true; stack.push({ name: null, member: null }); continue; }
    const nm = /cfg::node\(_this, "([^"]+)"\)/.exec(line);
    if (nm && stack.length) { stack[stack.length - 1].name = nm[1]; continue; }
    const close = /^}\s*(\w+)\s*\{\s*this\s*\};/.exec(line);
    if (close && stack.length) { stack.pop(); continue; }
    const m = /^((?:cfg::\w+(?:\s*<[^>]*>)?)|fifo_setting)\s+(\w+)\s*\{\s*this,\s*"([^"]+)"\s*(?:,\s*(.*?))?\}\s*;/.exec(line);
    if (!m || !stack.length) continue;
    let [, kind, member, key, rest] = m;
    kind = (aliases[kind] || kind).replace(/\s+/g, '');
    const parts = rest ? splitTop(rest) : [];
    const named = stack.filter((x) => x.name), def0 = parts[0], s = named.map((x) => x.name).join('/'), mpath = [...named.map((x) => closerOf(cfgH, x.name)), member].join('.');
    let e = { s, k: key, mpath };
    const range = /<\s*(-?[^,>]+),\s*([^>]+)>/.exec(kind);
    const num = (x) => { try { return Number(Function(`return (${x.replace(/'/g, '').replace(/LL/g, '')})`)()); } catch { return null; } };
    if (/^cfg::_bool/.test(kind)) { e.t = 'bool'; e.d = def0 === 'true' ? 'true' : 'false'; e.o = [['true', 'On'], ['false', 'Off']]; }
    else if (/^cfg::(_int|uint)</.test(kind) || /^cfg::uint64$/.test(kind)) {
      // static_cast<u32>(audio_format_flag::lpcm_2_48khz): the enum member's value
      const ev = /(\w+)::(\w+)\)$/.exec(def0 || ''); const em = ev && (enums[ev[1]] || []).find((v) => v.name === ev[2]);
      e.t = 'int'; e.d = def0 == null ? '0' : em ? String(em.n) : num(def0) != null && !Number.isNaN(num(def0)) ? String(num(def0)) : null; if (range) { e.min = num(range[1]); e.max = num(range[2]); } if (kind === 'cfg::uint64' && def0 === '0xffffffffffffffff') e.d = '18446744073709551615'; }
    else if (/^cfg::_float</.test(kind)) { e.t = 'float'; e.d = def0 == null ? '0' : String(num(def0)); if (range) { e.min = num(range[1]); e.max = num(range[2]); } }
    else if (/^cfg::_enum</.test(kind)) {
      const type = /<(\w+)>/.exec(kind)[1]; const vals = enums[type] || []; const sp = spell[type] || {};
      e.t = 'enum'; e.type = type;
      e.o = vals.filter((v) => sp[v.name] != null).map((v) => [sp[v.name], sp[v.name], v]);
      const dm = /::(\w+)$/.exec(def0 || '') || /\{\s*(\d+)\s*\}/.exec(def0 || '');
      const dv = dm && (vals.find((v) => v.name === dm[1]) || vals.find((v) => String(v.n) === dm[1]));
      e.d = dv ? sp[dv.name] ?? null : e.o[0]?.[0] ?? null;
    }
    else if (/^cfg::string$/.test(kind)) { e.t = 'text'; e.d = def0 && /^"/.test(def0) ? def0.replace(/^"|"$/g, '') : def0 == null ? '' : null; }
    else continue; // set_entry, node_map_entry, uint128, log: lists and maps, not single values
    out.push(e);
  }
  // ---- names from the dialog: emu_settings_type::X -> node; settings_dialog.cpp X -> widget; settings_dialog.ui widget -> text, tab
  const loc = {};
  for (const m of src('rpcs3qt/emu_settings_type.cpp').matchAll(/emu_settings_type::(\w+),\s*get_cfg_location\(local_cfg\.([\w.]+)\)/g)) loc[m[2]] = m[1];
  const dlg = src('rpcs3qt/settings_dialog.cpp');
  const widgets = {}; // type -> { w, gb, tip }
  for (const m of dlg.matchAll(/Enhance(CheckBox|ComboBox|Slider)\(emu_settings_type::(\w+),\s*ui->(\w+)(?:,\s*([^;]*))?\);/g)) {
    const args = m[4] ? splitTop(m[4]) : [];
    const tip = (/tooltips\.settings\.(\w+)/.exec(args[0] || '') || [])[1];
    const gb = m[1] === 'ComboBox' ? (/ui->(\w+)/.exec(args[1] || '') || [])[1] : m[1] === 'Slider' ? (/ui->(\w+)/.exec(args[0] || '') || [])[1] : null;
    const lbl = m[1] === 'Slider' ? (/tr\("([^"%:]+)/.exec(args[1] || '') || [])[1] : null;
    widgets[m[2]] = widgets[m[2]] || { w: m[3], gb, tip, lbl };
  }
  for (const m of dlg.matchAll(/m_emu_settings->Enhance\w+\(ui->(\w+),\s*emu_settings_type::(\w+)/g)) widgets[m[2]] = widgets[m[2]] || { w: m[1] };
  for (const m of dlg.matchAll(/m_emu_settings->EnhanceRadioButton\((\w+),\s*emu_settings_type::(\w+)\)/g)) {
    // the button group's buttons sit in one group box: take the first button added to it
    const b = new RegExp(m[1] + '->addButton\\(ui->(\\w+)').exec(dlg);
    widgets[m[2]] = widgets[m[2]] || { w: b && b[1], radio: true };
  }
  for (const m of dlg.matchAll(/SubscribeTooltip\(ui->(\w+),\s*tooltips\.settings\.(\w+)\)/g)) for (const x of Object.values(widgets)) if (x && !x.tip && (x.w === m[1] || x.gb === m[1])) x.tip = m[2];
  const tips = {};
  for (const m of src('rpcs3qt/tooltips.h').matchAll(/const QString (\w+)\s*=\s*tr\("((?:[^"\\]|\\.)*)"/g)) tips[m[1]] = m[2].replace(/\\"/g, '"');
  const ui = src('rpcs3qt/settings_dialog.ui'); const uiLines = ui.split('\n');
  const tabs = []; // [line, title]
  for (let i = 0; i < uiLines.length; i++) if (/<attribute name="title">/.test(uiLines[i])) { const t = /<string>([^<]*)</.exec(uiLines[i + 1] || ''); if (t && /name="\w+Tab"/.test(uiLines[i - 1] || '')) tabs.push([i, t[1]]); }
  const tabAt = (line) => { let t = null; for (const [l, n] of tabs) if (l <= line) t = n; return t; };
  const widgetAt = (name) => uiLines.findIndex((l) => l.includes(`name="${name}"`) && /<widget /.test(l));
  const textOf = (name, prop) => {
    const i = widgetAt(name); if (i < 0) return null;
    for (let j = i + 1; j < Math.min(uiLines.length, i + 40); j++) {
      if (/<widget /.test(uiLines[j])) break;
      if (new RegExp(`<property name="${prop}">`).test(uiLines[j])) { const s = /<string[^>]*>([^<]*)</.exec(uiLines[j + 1]); return s ? s[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : null; }
    }
    return null;
  };
  // ---- choice names: GetLocalizedSetting, case emu_settings_type::X: switch (static_cast<T>(index)) { case T::a: return tr("Name"
  const local = {};
  const es = src('rpcs3qt/emu_settings.cpp');
  const body = es.slice(es.indexOf('QString emu_settings::GetLocalizedSetting'));
  for (const m of body.matchAll(/case emu_settings_type::(\w+):\s*switch \(static_cast<(\w+)>\(index\)\)\s*\{([\s\S]*?)\n\t\t\}/g)) {
    local[m[1]] = {};
    for (const c of m[3].matchAll(/case (?:\w+::)?(\w+):\s*return tr\("([^"]*)"/g)) local[m[1]][c[1]] = c[2];
  }
  const res = [];
  for (const e of out) {
    const type = loc[e.mpath];
    const w = type && widgets[type];
    const line = w && w.w ? widgetAt(w.w) : -1;
    let l = w ? (w.lbl || (w.gb && textOf(w.gb, 'title')) || (w.w && !w.radio && textOf(w.w, 'text')) || null) : null;
    if (w && w.radio && w.w) { const gl = uiLines.slice(0, widgetAt(w.w)).reverse().findIndex((x) => /<widget class="QGroupBox"/.test(x)); if (gl >= 0) { const g = /name="(\w+)"/.exec(uiLines[widgetAt(w.w) - 1 - gl]); l = g && textOf(g[1], 'title'); } }
    if (l) l = l.replace(/:\s*$/, '').replace(/&(?=\w)/, '').trim();
    if (!l || l.length < 3) l = e.k;
    if (e.t === 'enum') e.o = e.o.map(([v, lab, x]) => [v, (type && local[type] && local[type][x.name]) || lab]);
    const tip = w && !w.radio && w.tip && tips[w.tip]; // a radio group's tooltip is its first button's
    const desc = tip ? tip.split(/\\n/)[0].split(/(?<=\.)\s/)[0].trim() : undefined;
    const uiTab = line >= 0 ? tabAt(line) : null;
    const x = { s: e.s, k: e.k, t: e.t, d: e.d, o: e.o, min: e.min, max: e.max, l, desc, uiTab };
    if (keep(x)) res.push(x);
  }
  const seen = {};
  for (const x of res) { const id = x.s + '|' + x.l; seen[id] = (seen[id] || 0) + 1; }
  for (const x of res) if (seen[x.s + '|' + x.l] > 1) x.l = x.k;
  return res.map(tabOf);
}
// splits "a, b{c, d}, e(f, g)" at top-level commas
function splitTop(s) {
  const out = []; let depth = 0, cur = '', q = false;
  for (const ch of s) {
    if (ch === '"' ) q = !q;
    if (!q && '({<['.includes(ch)) depth++;
    if (!q && ')}>]'.includes(ch)) depth--;
    if (!q && ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
// the member name of a struct: the "} name{ this };" at its own indentation
function closerOf(text, name) {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.includes(`cfg::node(_this, "${name}")`));
  const ind = (/^\t*/.exec(lines[i - 2] || '') || [''])[0].length; // "struct x : cfg::node" is two lines up ("{" between)
  for (let j = i; j < lines.length; j++) { const m = new RegExp(`^\\t{${ind}}}\\s*(\\w+)\\s*\\{\\s*this\\s*\\};`).exec(lines[j]); if (m) return m[1]; }
  return name;
}

// left out: paths, devices, network and identity, window and UI, lists (Linux paths, the GUI)
const DROP_SEC = /^(VFS|Input\/Output|Net|Video\/Native UI|Video\/Shader Loading Dialog|Video\/Custom Anaglyph Matrices)$/;
const DROP_KEY = /^(Adapter|Exclusive Fullscreen Mode|Audio Device|Microphone Devices|Microphone Type|Music Handler|System Name|Console PSID|HDD Model Name|HDD Serial Number|Keyboard Type|Use LLVM CPU|Font|Window Title Format|GDB Server|Automatically start games after boot|Exit RPCS3 when process finishes|Pause emulation on RPCS3 focus loss|Start games in fullscreen mode|Start Big Picture Mode on boot|Prevent display sleep while running games|Use recursive scan|Silence All Logs|Enable GameMode)$|hint|popups/i;
const keep = (x) => !DROP_SEC.test(x.s) && !DROP_KEY.test(x.k);
// tabs: the dialog's own tab for the widget, else by section; Advanced and Debug are advanced
const UI_TAB = { CPU: 'CPU', GPU: 'Graphics', Audio: 'Audio', System: 'System', Emulator: 'Emulator', Advanced: 'Advanced', Debug: 'Advanced', 'I/O': 'System', Network: 'System', GUI: 'Emulator' };
const SEC_TAB = { Core: 'CPU', Video: 'Graphics', 'Video/Vulkan': 'Graphics', 'Video/Performance Overlay': 'Overlay', Audio: 'Audio', System: 'System', Savestate: 'Emulator', Miscellaneous: 'Emulator' };
const ADV = /Debug|Log|Profiler|Dump|Renderdoc|Performance Report|External Debugger|LLVM Lower|LLVM Upper|Inspection Mode|Program Analyser|Debug overlay/i;
function tabOf(x) {
  let tab = (x.uiTab && UI_TAB[x.uiTab]) || SEC_TAB[x.s] || 'Advanced';
  if (x.s === 'Video/Performance Overlay') tab = 'Overlay';
  const adv = tab === 'Advanced' || ADV.test(x.k) || (!x.uiTab && x.s !== 'Video/Performance Overlay' && !/^(System|Savestate|Audio)$/.test(x.s));
  const o = { ...x, tab: adv ? 'Advanced' : tab, adv: adv || undefined };
  delete o.uiTab;
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

module.exports = { id: 'rpcs3', files: FILES.map((f) => ({ url: RAW + f, as: f })), read };
