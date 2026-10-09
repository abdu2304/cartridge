// Vita3K's per-game settings: config/src/settings.cpp (load_custom_config/save_custom_config: <config path>/config/
// config_<TITLE ID>.xml, one XML element per group, settings as attributes), config/include/config/config.h (each
// setting's config.yml key and default: `base`, `d`) and the Qt settings dialog (gui-qt/src/settings_dialog.cpp +
// .ui + settings_dialog_tooltips.cpp: names, tips, tabs, choices). Docs: docs/game-settings/vita3k.md
// A game file is a full copy: an attribute missing from a present element reads as false/0, so Cartridge writes every
// attribute, the ones it doesn't change taken from config.yml (`base`).
const fs = require('fs');
const path = require('path');
const RAW = 'https://raw.githubusercontent.com/Vita3K/Vita3K/master/vita3k/';
const SKIP = new Set(['gpu_idx', 'custom_driver_name', 'lle_modules', 'ime_langs']); // a device; Android; lists (docs)
const TAB = { Debug: 'Advanced' };
const nice = (k) => k.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());

function read(dir) {
  const src = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const st = src('settings.cpp'), cfg = src('config.h'), dlg = src('settings_dialog.cpp'), ui = src('settings_dialog.ui'), tips = src('settings_dialog_tooltips.cpp');
  // ---- load_custom_config: out.<member> = <element>.attribute("<attr>").as_<type>(<default>)
  let body = st.slice(st.indexOf('bool load_custom_config'), st.indexOf('bool save_custom_config'));
  body = body.replace(/#ifdef __ANDROID__[\s\S]*?#endif/g, '');
  const vars = {};
  for (const m of body.matchAll(/const auto (\w+) = config_child\.child\("([\w-]+)"\)/g)) vars[m[1]] = m[2];
  const rows = [];
  for (const m of body.matchAll(/out\.(\w+) = (?:(\w+)|config_child\.child\("([\w-]+)"\))\.attribute\("([\w-]+)"\)\.as_(\w+)\(([^)]*)\)/g)) {
    const [, member, v, inl, attr, as] = m;
    rows.push({ member, s: inl || vars[v], k: attr, as });
  }
  // element order as save_custom_config writes them
  const save = st.slice(st.indexOf('bool save_custom_config'), st.indexOf('bool delete_custom_config'));
  const order = [...save.matchAll(/append_child\("([\w-]+)"\)/g)].map((x) => x[1]);
  // ---- config.h: code(type, "yaml-key", default, member)
  const yml = {};
  for (const m of cfg.matchAll(/code\(([^,]+(?:<[^>]*>)?), "([\w-]+)", (.+?), (\w+)\)\s*\\/g)) yml[m[4]] = { type: m[1].trim(), key: m[2], def: m[3].trim() };
  // ---- the dialog: current.<member> = m_ui-><widget>; { m_ui-><widget>, tr("Label"), m_tooltips-><tip> }
  const widget = {};
  for (const m of dlg.matchAll(/current\.(\w+) = [^;]*?m_ui->(\w+)/g)) widget[m[1]] ||= m[2];
  widget.modules_mode ||= 'rb_modules_automatic';
  const desc = {};
  for (const m of dlg.matchAll(/\{ m_ui->(\w+), tr\("([^"]*)"\), m_tooltips->(\w+) \}/g)) desc[m[1]] ||= { l: m[2], tip: m[3] };
  const tipText = {};
  for (const m of tips.matchAll(/,\s*(\w+)\(tr\(((?:\s*"(?:[^"\\]|\\.)*")+)/g)) tipText[m[1]] = [...m[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]).join('').split('\\n')[0].replace(/\\"/g, '"');
  // the .ui: which tab each widget is on
  const tabOf = {}; let tab = '';
  for (const m of ui.matchAll(/<widget class="\w+" name="(\w+)"|<attribute name="title">\s*<string>([^<]*)</g)) { if (m[2] != null) tab = m[2]; else tabOf[m[1]] = tab; }
  // combo items the dialog adds: m_ui->W->addItem(QStringLiteral("x")) / addItems({ tr("a"), ... })
  const allItems = (w) => {
    const out = [];
    for (const m of dlg.matchAll(new RegExp(`m_ui->${w}->addItems?\\(`, 'g'))) {
      const many = dlg[m.index + m[0].length - 2] === 's', end = dlg.indexOf(many ? '});' : ';', m.index);
      out.push(...[...dlg.slice(m.index, end).matchAll(/(?:tr|QStringLiteral)\("([^"]*)"\)/g)].map((x) => x[1]));
    }
    return out;
  };
  // value spaces the dialog builds in code (each read from settings_dialog.cpp where it can be)
  const OPT = {
    backend_renderer: () => ({ t: 'enum', o: allItems('backend_renderer_box').map((x) => [x, x]) }),
    high_accuracy: () => ({ t: 'enum', o: [['false', allItems('renderer_accuracy_box')[0] || 'Standard'], ['true', allItems('renderer_accuracy_box')[1] || 'High']] }),
    screen_filter: () => { const v = [...dlg.matchAll(/screen_filter_box->addItems\(\{([^}]*)\}/g)].map((m) => [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1])); const all = v.sort((a, b) => b.length - a.length)[0] || []; return { t: 'enum', o: all.map((x) => [x, x === 'FSR' ? 'FSR (Vulkan only)' : x]) }; },
    memory_mapping: () => ({ t: 'enum', o: [...dlg.matchAll(/\{ "([^"]+)", "([\w-]+)", static_cast<int>\(MappingMethod::\w+\) \}/g)].map((x) => [x[2], x[1]]) }),
    resolution_multiplier: () => { const mn = /resolution_upscale->setMinimum\((\d+)\)/.exec(dlg), mx = /resolution_upscale->setMaximum\((\d+)\)/.exec(dlg); return { t: 'float', min: mn ? Number(mn[1]) / 4 : 0.5, max: mx ? Number(mx[1]) / 4 : 8, step: 0.25 }; }, // slider value / 4
    anisotropic_filtering: () => { const mx = /anisotropic_filter->setMaximum\((\d+)\)/.exec(dlg); const n = mx ? Number(mx[1]) : 4; return { t: 'enum', o: Array.from({ length: n + 1 }, (_, i) => [String(1 << i), (1 << i) + 'x']) }; }, // 1 << slider
    export_as_png: () => { const f = allItems('texture_export_format'); return { t: 'enum', l: 'Texture Exporting Format', o: [['true', f[0] || 'PNG'], ['false', f[1] || 'DDS']] }; },
    audio_backend: () => ({ t: 'enum', o: allItems('audio_backend_box').map((x) => [x, x]) }),
    audio_volume: () => { const w = /name="audio_volume"[\s\S]*?minimum">\s*<number>(\d+)[\s\S]*?maximum">\s*<number>(\d+)/.exec(ui); return { t: 'int', min: w ? Number(w[1]) : 0, max: w ? Number(w[2]) : 200 }; },
    file_loading_delay: () => { const mn = /file_loading_delay->setMinimum\((\d+)\)/.exec(dlg), mx = /file_loading_delay->setMaximum\((\d+)\)/.exec(dlg); return { t: 'int', min: mn ? Number(mn[1]) : 0, max: mx ? Number(mx[1]) : 30 }; },
    sys_button: () => ({ t: 'enum', o: [['1', 'Cross'], ['0', 'Circle']] }), // enter_button_cross->isChecked() ? 1 : 0
    sys_lang: () => ({ t: 'enum', o: allItems('sys_lang_box').map((x, i) => [String(i), x]) }),
    sys_date_format: () => ({ t: 'enum', o: allItems('sys_date_format_box').map((x, i) => [String(i), x]) }),
    sys_time_format: () => ({ t: 'enum', o: allItems('sys_time_format_box').map((x, i) => [String(i), x]) }),
    modules_mode: () => { // enum ModulesMode { AUTOMATIC, AUTO_MANUAL, MANUAL } and the radio buttons' names
      const e = /enum ModulesMode \{([^}]*)\}/.exec(cfg)[1].split(',').map((x) => x.trim()).filter(Boolean);
      const lab = { AUTOMATIC: desc.rb_modules_automatic?.l, AUTO_MANUAL: desc.rb_modules_auto_manual?.l, MANUAL: desc.rb_modules_manual?.l };
      return { t: 'enum', l: 'Modules Mode', o: e.map((x, i) => [String(i), lab[x] || nice(x.toLowerCase())]), desc: tipText.modules_automatic };
    },
  };
  // C++ defaults as the XML spells them (pugixml: bools true/false, floats %.9g)
  const spellDef = (y, t) => {
    if (!y) return null; let d = y.def;
    const en = /SCE_SYSTEM_PARAM_(?:ENTER_BUTTON_CROSS|LANG_ENGLISH_US|DATE_FORMAT_MMDDYYYY|TIME_FORMAT_12HOUR)|ModulesMode::AUTOMATIC/.exec(d);
    if (en) return { SCE_SYSTEM_PARAM_ENTER_BUTTON_CROSS: '1', SCE_SYSTEM_PARAM_LANG_ENGLISH_US: '1', SCE_SYSTEM_PARAM_DATE_FORMAT_MMDDYYYY: '2', SCE_SYSTEM_PARAM_TIME_FORMAT_12HOUR: '0', 'ModulesMode::AUTOMATIC': '0' }[en[0]];
    d = d.replace(/^"|"$/g, '');
    if (t === 'bool' || /^(true|false)$/.test(d)) return /^(true|1)$/.test(d) ? 'true' : 'false';
    if (t === 'float') return String(Number(d.replace(/f$/, '')));
    return /^-?[\d.]+$/.test(d) || y.type === 'std::string' ? d : null;
  };
  const out = [];
  for (const r of rows) {
    if (SKIP.has(r.member)) continue;
    const y = yml[r.member], w = widget[r.member], dsc = w && desc[w];
    let e = { t: { bool: 'bool', int: 'int', float: 'float', string: 'text' }[r.as] || 'text' };
    if (OPT[r.member]) e = { ...e, ...OPT[r.member]() };
    if (e.t === 'bool') e.o = [['true', 'On'], ['false', 'Off']];
    const t = (w && tabOf[w]) || nice(r.s);
    out.push({
      s: r.s, k: r.k, t: e.t, d: spellDef(y, r.as === 'bool' ? 'bool' : e.t),
      ...(e.o ? { o: e.o } : {}), ...(e.min != null ? { min: e.min, max: e.max } : {}), ...(e.step ? { step: e.step } : {}),
      l: e.l || (dsc && dsc.l) || nice(r.k), desc: e.desc || (dsc && tipText[dsc.tip]) || undefined,
      tab: TAB[t] || t, ...(TAB[t] === 'Advanced' ? { adv: true } : {}),
      base: y ? y.key : null, order: order.indexOf(r.s),
    });
  }
  // psn-signed-in: config.yml keeps it as an int (code(int, ...)); the game file writes a bool
  return out.sort((a, b) => a.order - b.order).map(({ order, ...x }) => x);
}

module.exports = {
  id: 'vita3k',
  files: [
    { url: RAW + 'config/src/settings.cpp', as: 'settings.cpp' },
    { url: RAW + 'config/include/config/config.h', as: 'config.h' },
    { url: RAW + 'config/include/config/state.h', as: 'state.h' },
    { url: RAW + 'gui-qt/src/settings_dialog.cpp', as: 'settings_dialog.cpp' },
    { url: RAW + 'gui-qt/src/settings_dialog.ui', as: 'settings_dialog.ui' },
    { url: RAW + 'gui-qt/src/settings_dialog_tooltips.cpp', as: 'settings_dialog_tooltips.cpp' },
  ],
  read,
};
