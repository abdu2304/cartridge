// Azahar's per-game settings (3DS; Citra's format, also Lime3DS and Citra): src/common/settings.h (SwitchableSetting,
// keys = member names via setting_keys.h.in), src/citra_qt/configuration/config.cpp (QtConfig::ReadValues: with
// global false only ReadGlobalSetting outside `if (global)` is read from a game's custom/<TITLE ID>.ini, groups are
// the ini sections), and the per-game dialog's tabs (configure_<tab>.cpp + .ui: names, choices, tooltips).
// Docs: docs/game-settings/azahar.md
const fs = require('fs');
const path = require('path');
const RAW = 'https://raw.githubusercontent.com/azahar-emu/azahar/master/src/';
const TABS = ['general', 'system', 'enhancements', 'layout', 'graphics', 'audio', 'debug']; // ConfigurePerGame's tabs
const TAB = { general: 'General', system: 'System', enhancements: 'Enhancements', layout: 'Layout', graphics: 'Graphics', audio: 'Audio', debug: 'Advanced' };
const DEFINED = new Set(['ENABLE_OPENGL', 'ENABLE_VULKAN', 'ENABLE_SOFTWARE_RENDERER', '__linux__', '__unix__']); // a Linux desktop build

function cpp(text) {
  const out = []; const stack = [];
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
function block(t, i, open = '{', close = '}') {
  let depth = 0, str = false;
  for (let j = i; j < t.length; j++) {
    const c = t[j];
    if (str) { if (c === '\\') j++; else if (c === '"') str = false; continue; }
    if (c === '"') str = true; else if (c === open) depth++; else if (c === close && --depth === 0) return t.slice(i + 1, j);
  }
  return '';
}
function args(s) {
  const parts = []; let depth = 0, cur = '';
  for (const c of s) {
    if ('({<['.includes(c)) depth++;
    if (')}>]'.includes(c)) depth--;
    if (c === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}
const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); // rich-text tooltips are HTML
// a Qt Designer .ui: every widget with its class, own text/tooltip, combo items, range, and the QLabel just before it
function uiWidgets(xml) {
  const w = {}; const re = /<widget class="(\w+)" name="(\w+)"\s*\/?>|<\/widget>/g; const stack = []; let m; let lastLabel = null;
  while ((m = re.exec(xml))) {
    if (m[0] === '</widget>') { const x = stack.pop(); if (x) x.end = m.index; continue; }
    const x = { cls: m[1], name: m[2], start: m.index + m[0].length, label: lastLabel };
    if (!m[0].endsWith('/>')) stack.push(x);
    w[x.name] = x;
    if (x.cls === 'QLabel') lastLabel = x;
  }
  for (const x of Object.values(w)) {
    const all = xml.slice(x.start, x.end || x.start);
    const body = all.replace(/<widget[\s\S]*<\/widget>/g, ''); // without its children
    const prop = (n) => { const p = new RegExp(`<property name="${n}">\\s*<string[^>]*>([\\s\\S]*?)</string>`).exec(body); return p ? unxml(p[1]) : null; };
    x.text = prop('text'); x.tip = prop('toolTip');
    x.items = [...all.matchAll(/<item>\s*<property name="text">\s*<string[^>]*>([\s\S]*?)<\/string>/g)].map((i) => unxml(i[1]));
    for (const n of ['minimum', 'maximum']) { const p = new RegExp(`<property name="${n}">\\s*<(?:number|double)>([-\\d.]+)<`).exec(body); if (p) x[n] = Number(p[1]); }
  }
  return w;
}
// set from code, not a widget the dialog binds: the label above the shader list (configure_enhancements.ui shader_label)
const NAMES = { pp_shader_name: { l: 'Post-Processing Shader', tab: 'Enhancements' }, anaglyph_shader_name: { l: 'Anaglyph Shader', tab: 'Enhancements' },
  volume: { l: 'Volume', tab: 'Audio', desc: '0 to 1 (the slider shows 0 to 100%).' } }; // configure_audio.ui volume_slider, set through a lambda

function read(dir) {
  const src = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const st = cpp(src('settings.h'));
  const enums = {};
  for (const m of st.matchAll(/enum class (\w+)(?:\s*:\s*\w+)?\s*\{([^}]*)\}/g)) {
    let n = -1; enums[m[1]] = m[2].replace(/\/\/.*$/gm, '').split(',').map((x) => x.trim()).filter(Boolean)
      .map((e) => { const [name, v] = e.split('=').map((y) => y.trim()); n = v != null ? Number(v) : n + 1; return [name, n]; });
  }
  // SwitchableSetting<Type[, ranged]> member{default, [min, max,] Keys::key}
  const decl = {};
  for (const m of st.matchAll(/SwitchableSetting<\s*([\w:<>]+?)\s*(?:,\s*(true|false))?\s*>\s+(\w+)\s*\{/g)) {
    const a = args(block(st, m.index + m[0].length - 1));
    decl[m[3]] = { type: m[1], a, key: a[a.length - 1].replace(/^Keys::/, '') };
  }
  const consts = {}; for (const m of st.matchAll(/constexpr\s+\w+\s+(\w+)\s*=\s*(-?\d+)\s*;/g)) consts[m[1]] = m[2];
  // config.cpp: which Read*Values run for a game, each one's group, its ReadGlobalSetting outside `if (global) {}`
  const cfg = cpp(src('config.cpp'));
  const body = (fn) => { const i = cfg.indexOf(`void QtConfig::${fn}() {`); return i < 0 ? '' : block(cfg, cfg.indexOf('{', i)); };
  const noGlobal = (t) => { let s = t; let i; while ((i = s.search(/if \(global\) \{/)) >= 0) { const o = s.indexOf('{', i); s = s.slice(0, i) + s.slice(o + block(s, o).length + 2); } return s; };
  const perGame = [];
  const walk = (fn, group) => {
    const t = noGlobal(body(fn));
    const g = (/beginGroup\(QStringLiteral\("([^"]+)"\)\)/.exec(t) || [])[1];
    const sec = g ? (group ? group + '/' + g : g) : group;
    for (const m of t.matchAll(/ReadGlobalSetting\((\w+)::values\.(\w+)\)|(Read\w+Values)\(\);/g)) {
      if (m[3]) walk(m[3], sec); else perGame.push({ ns: m[1], member: m[2], sec });
    }
  };
  for (const m of noGlobal(body('ReadValues')).matchAll(/(Read\w+Values)\(\);/g)) walk(m[1], '');
  // the per-game tabs: the widget each setting is tied to (a "Use global" combo is the per-game switch, not the setting)
  const where = {};
  const PAIRS = [
    [/ApplyPerGameSetting\(\s*&Settings::values\.(\w+),\s*ui->(\w+)/g, 1, 2],
    [/SetPerGameSetting\(\s*ui->(\w+),\s*&Settings::values\.(\w+)/g, 2, 1],
    [/SetColored(?:Tristate|ComboBox)\(\s*ui->(\w+),[^;]*?Settings::values\.(\w+)/g, 2, 1],
    [/ui->(\w+)->set(?:Checked|Value|CurrentIndex)\([^;]*?Settings::values\.(\w+)\.GetValue\(\)/g, 2, 1],
  ];
  for (const tab of TABS) {
    let c, w;
    try { c = src(`configure_${tab}.cpp`); w = uiWidgets(src(`configure_${tab}.ui`)); } catch { continue; }
    for (const [re, si, wi] of PAIRS) for (const m of c.matchAll(re)) {
      const wid = w[m[wi]]; if (!wid || where[m[si]] || /^Use global/.test(wid.items[0] || '')) continue;
      where[m[si]] = { tab, wid };
    }
  }
  const out = [];
  for (const { ns, member, sec } of perGame) {
    const d = decl[member]; if (ns !== 'Settings' || !d) continue; // UISettings here is screenshot_path, a path
    if (member === 'render_3d_which_display') continue; // Android only ("on android, which displays to render stereo mode to")
    if (/^std::vector/.test(d.type)) continue; // layouts_to_cycle: a QStringList, not one value
    const [section, ...grp] = sec.split('/');
    const e = { s: section, k: [...grp, d.key].join('\\'), member }; // QSettings writes a nested group into the key
    const def = d.a[0];
    if (d.type === 'bool') { e.t = 'bool'; e.d = def; e.o = [['true', 'On'], ['false', 'Off']]; }
    else if (d.type === 'std::string') { e.t = 'text'; e.d = def.replace(/^"|"$/g, ''); }
    else if (/^(float|double)$/.test(d.type)) { e.t = 'float'; e.d = String(Number(def.replace(/f$/, ''))); } // QVariant(double): 100, 0.5
    else if (enums[d.type]) {
      e.t = 'enum'; const vals = enums[d.type]; const dv = vals.find(([n]) => n === def.split('::').pop());
      e.d = dv ? String(dv[1]) : null; e.o = vals.map(([n, v]) => [String(v), n]);
    } else { e.t = 'int'; e.d = /^-?\d+$/.test(def) ? def : consts[def] || null; }
    if (d.a.length === 4 && e.t !== 'enum') { e.min = Number(d.a[1].replace(/f$/, '')); e.max = Number(d.a[2].replace(/f$/, '')); }
    const at = where[member];
    if (at) {
      const x = at.wid; e.tab = TAB[at.tab];
      e.l = /^Q(CheckBox|RadioButton)$/.test(x.cls) ? x.text : x.label && x.label.text;
      e.desc = x.tip || (x.label && x.label.tip) || undefined;
      // combo items are the choices: index = value (setCurrentIndex(static_cast<int>(value))); Region is index - 1
      if (x.cls === 'QComboBox' && x.items.length && (e.t === 'enum' || e.t === 'int')) {
        const off = member === 'region_value' ? -1 : 0;
        const vals = e.t === 'enum' ? e.o.map(([v]) => Number(v)) : x.items.map((_, i) => i + off);
        e.t = 'enum'; e.o = vals.filter((v) => x.items[v - off] != null).map((v) => [String(v), x.items[v - off]]); delete e.min; delete e.max;
      }
      if (e.min == null && x.minimum != null && !/Slider/.test(x.cls)) { e.min = x.minimum; e.max = x.maximum; }
    } else if (NAMES[member]) Object.assign(e, NAMES[member]);
    else { e.tab = 'Advanced'; e.l = member.replace(/^bg_/, 'background_').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()); }
    if (e.tab === 'Advanced') e.adv = true;
    if (e.l) e.l = e.l.replace(/:$/, '');
    if (e.desc && e.l && e.desc.startsWith(e.l + ' ')) e.desc = e.desc.slice(e.l.length + 1); // rich-text tips repeat the name in bold
    if (e.desc) e.desc = e.desc.split(/(?<=\.)\s/)[0]; // a short tooltip: its first sentence
    out.push(e);
  }
  return out;
}
const SRC = ['common/settings.h', 'citra_qt/configuration/config.cpp', ...TABS.flatMap((t) => [`citra_qt/configuration/configure_${t}.cpp`, `citra_qt/configuration/configure_${t}.ui`])];
module.exports = {
  id: 'azahar',
  versions: { git: 'https://github.com/azahar-emu/azahar', tags: /^\d{4}(\.\d+)*$/ }, // 0.9.63: its last releases too (gen.js)
  files: SRC.map((f) => ({ url: RAW + f, as: path.basename(f) })),
  read: (dir) => read(dir).map(({ member, ...x }) => x),
  _ui: uiWidgets,
};
