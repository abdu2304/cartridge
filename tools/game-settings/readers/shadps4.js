// shadPS4's per-game settings: core/emulator_settings.cpp EmulatorSettingsImpl::Load(serial) reads
// custom_configs/<SERIAL>.json and, for each group (General, Network, Log, Debug, Input, Audio, GPU, Vulkan),
// ApplyGroupOverrides takes only the keys that group's GetOverrideableFields() lists (emulator_settings.h; types and
// defaults from its Setting<T> members). Names, help and choices come from the Qt launcher's settings dialog
// (shadps4-qtlauncher qt_gui/settings_dialog.cpp: Set<Name>(ui->widget) in UpdateSettings, the help text in
// updateNoteTextEdit, combo items in settings_dialog.ui, its tabs). Docs: docs/game-settings/shadps4.md
const fs = require('fs');
const path = require('path');
const CORE = 'https://raw.githubusercontent.com/shadps4-emu/shadPS4/main/src/';
const QT = 'https://raw.githubusercontent.com/shadps4-emu/shadps4-qtlauncher/main/src/qt_gui/';
const FILES = [{ url: CORE + 'core/emulator_settings.h', as: 'core/emulator_settings.h' }, { url: CORE + 'core/emulator_settings.cpp', as: 'core/emulator_settings.cpp' },
  { url: QT + 'settings_dialog.cpp', as: 'qt/settings_dialog.cpp' }, { url: QT + 'settings_dialog.ui', as: 'qt/settings_dialog.ui' }];

function read(dir) {
  const src = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } };
  const h = src('core/emulator_settings.h'), c = src('core/emulator_settings.cpp'), dlg = src('qt/settings_dialog.cpp'), ui = src('qt/settings_dialog.ui');
  // enums for defaults like GpuReadbacksMode::Disabled / HideCursorState::Idle
  const enumVal = {}, enumsByType = {};
  for (const m of h.replace(/\/\/[^\n]*/g, '').matchAll(/enum (?:class )?(\w+)\s*(?::\s*\w+)?\s*\{([^}]*)\}/g)) {
    let n = -1; enumsByType[m[1]] = []; for (const e of m[2].split(',').map((x) => x.trim()).filter(Boolean)) { const [name, v] = e.split('=').map((x) => x.trim()); n = v != null && /^-?\d+$/.test(v) ? Number(v) : n + 1; enumVal[name] = n; enumVal[`${m[1]}::${name}`] = { n, type: m[1] }; enumsByType[m[1]].push([String(n), name]); enumVal[name] = { n, type: m[1] }; }
  }
  // group member -> JSON section, as Load(serial) applies them
  const sectionOf = {}; for (const m of c.matchAll(/ApplyGroupOverrides\((m_\w+), gj\.at\("(\w+)"\)/g)) sectionOf[m[1]] = m[2];
  const structOf = {}; for (const m of h.matchAll(/(\w+Settings) (m_\w+)\{\};/g)) structOf[m[1]] = m[2];
  const out = [];
  for (const m of h.matchAll(/struct (\w+Settings) \{([\s\S]*?)\n\};/g)) {
    const sec = sectionOf[structOf[m[1]]]; if (!sec) continue;
    const members = {};
    for (const s of m[2].matchAll(/Setting<([\w:<> ]+)>\s+(\w+)\s*(?:\{([^}]*)\})?;/g)) members[s[2]] = { type: s[1].trim(), init: (s[3] || '').trim() };
    const over = (/GetOverrideableFields\(\) const \{([\s\S]*?)\n    \}/.exec(m[2]) || [])[1] || '';
    for (const o of over.matchAll(/make_override<\w+>\(\s*"(\w+)",\s*&\w+::(\w+)\)/g)) {
      const mem = members[o[2]] || {}; const t = mem.type || '';
      const e = { s: sec, k: o[1], member: o[2], group: structOf[m[1]] };
      const init = mem.init.replace(/'/g, '').replace(/_MB$/, '');
      if (t === 'bool') { e.t = 'bool'; e.d = init || 'false'; e.o = [['true', 'On'], ['false', 'Off']]; }
      else if (/^(int|u32|s32|u64|s64|unsigned long long|long)$/.test(t)) { e.t = 'int'; const ev = enumVal[init]; e.d = init === '' ? '0' : /^-?\d+$/.test(init) ? init : ev ? String(ev.n) : null; if (ev) e.enumType = ev.type; if (/_MB$/.test(mem.init)) e.d = String(Number(init) * 1024 * 1024); }
      else if (/^(double|float)$/.test(t)) { e.t = 'float'; e.d = init ? String(Number(init.replace(/f$/, ''))) : '0'; }
      else { e.t = 'text'; e.d = /^"/.test(init) ? init.slice(1, -1) : init === '' ? '' : null; }
      out.push(e);
    }
  }
  // ---- the Qt launcher: Set<Name>(...ui->widget...) -> widget; SETTING_FORWARD(group, Name, field) -> field
  const setterField = {};
  for (const m of h.matchAll(/SETTING_FORWARD(?:_BOOL)?\((m_\w+),\s*(\w+),\s*(\w+)\)/g)) setterField[m[2]] = m[1] + '.' + m[3];
  for (const m of h.matchAll(/void Set(\w+)\([^)]*\)\s*\{[^}]*?(m_\w+)\.(\w+)\.set\(/g)) setterField[m[1]] = setterField[m[1]] || m[2] + '.' + m[3];
  const upd = (/void SettingsDialog::UpdateSettings\(bool is_specific\) \{([\s\S]*?)\n\}/.exec(dlg) || [])[1] || '';
  const widgetOf = {}, mapOf = {};
  for (const m of upd.matchAll(/EmulatorSettings\.Set(\w+)\(([\s\S]*?)\);/g)) {
    const f = setterField[m[1]]; if (!f || widgetOf[f]) continue;
    const w = /ui->(\w+)/.exec(m[2]); if (w) widgetOf[f] = w[1];
    const map = /(\w+Map)\.value\(/.exec(m[2]); if (map) mapOf[f] = map[1];
  }
  const help = {}; // widget -> [label, desc]
  for (const m of dlg.matchAll(/elementName == "(\w+)"\) \{\s*text = tr\("((?:[^"\\]|\\.)*)"\);/g)) { const [l, ...rest] = m[2].split(/:\\{1,2}n/); help[m[1]] = [l.trim(), rest.join(' ').split(/\\{1,2}n/)[0].replace(/\\"/g, '"').trim()]; }
  const maps = {}; for (const m of dlg.matchAll(/(\w+Map) = \{([\s\S]*?)\};/g)) maps[m[1]] = [...m[2].matchAll(/\{tr\("([^"]+)"\),\s*"([^"]+)"\}/g)].map((x) => [x[2], x[1]]);
  const langNames = [...((/languageNames = \{([\s\S]*?)\};/.exec(dlg) || [])[1] || '').matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  const langIdx = ((/languageIndexes = \{([^}]*)\}/.exec(dlg) || [])[1] || '').split(',').map((x) => x.trim()).filter(Boolean);
  // .ui: tab of a widget (pages carry <attribute name="title">), its text, its combo items
  const lines = ui.split('\n'); const tabs = [];
  for (let i = 0; i < lines.length; i++) if (/<attribute name="title">/.test(lines[i])) { const t = /<string>([^<]*)</.exec(lines[i + 1] || ''); if (t) tabs.push([i, t[1]]); }
  const at = (w) => lines.findIndex((l) => /<widget /.test(l) && l.includes(`name="${w}"`));
  const uiOf = (w) => {
    const i = at(w); if (i < 0) return {};
    const tab = (tabs.filter(([l]) => l < i).pop() || [])[1];
    let text = null; const items = [];
    for (let j = i + 1; j < lines.length && !/<widget /.test(lines[j]) && !/<\/widget>/.test(lines[j]); j++) {
      if (!text && /<property name="(text|title)">/.test(lines[j])) text = (/<string[^>]*>([^<]*)</.exec(lines[j + 1]) || [])[1];
      if (/<item>/.test(lines[j])) { const s = /<string[^>]*>([^<]*)</.exec(lines[j + 2] || ''); if (s) items.push(s[1]); }
    }
    let group = null; for (let j = i - 1; j >= 0 && j > i - 15; j--) { if (/class="QGroupBox"/.test(lines[j])) { for (let k = j + 1; k < i; k++) if (/<property name="title">/.test(lines[k])) { group = (/<string[^>]*>([^<]*)</.exec(lines[k + 1]) || [])[1]; break; } break; } }
    return { tab, text: /ComboBox|SpinBox|Slider|LineEdit/.test(w) ? group : text, items };
  };
  const added = {}; for (const m of dlg.matchAll(/ui->(\w+)->addItem\(tr\("([^"]+)"\)\)/g)) (added[m[1]] = added[m[1]] || []).push(m[2]);
  // Set<Name>("literal") in UpdateSettings (radio buttons): those literals are the choices
  const literals = {}; for (const m of upd.matchAll(/EmulatorSettings\.Set(\w+)\("([^"]+)"/g)) { const f = setterField[m[1]]; if (f) (literals[f] = literals[f] || []).push(m[2]); }
  const res = [];
  for (const e of out) {
    const f = `${e.group}.${e.member}`; const w = widgetOf[f]; const u = w ? uiOf(w) : {};
    const hk = w && (help[w] ? w : Object.keys(help).find((k) => k.replace(/(CheckBox|ComboBox|GroupBox|SpinBox|Slider|LineEdit)$/i, '') === w.replace(/(CheckBox|ComboBox|GroupBox|SpinBox|Slider|LineEdit)$/i, '')));
    const [hl, hd] = hk ? help[hk] : [];
    let o = e.o;
    if (mapOf[f] && maps[mapOf[f]]) { e.t = 'enum'; o = maps[mapOf[f]]; }
    else if (literals[f]) { e.t = 'enum'; o = literals[f].map((v) => [v, v[0].toUpperCase() + v.slice(1)]); }
    else if (e.k === 'console_language' && langNames.length === langIdx.length) { e.t = 'enum'; o = langIdx.map((v, i) => [v, langNames[i]]).sort((a, b) => a[1].localeCompare(b[1])); }
    else if (e.t === 'int' && /ComboBox/.test(w || '') && ((u.items && u.items.length > 1) || added[w])) { e.t = 'enum'; o = ((u.items && u.items.length > 1) ? u.items : added[w]).map((x, i) => [String(i), x]); }
    else if (e.t === 'int' && e.enumType && enumsByType[e.enumType]) {
      // no dialog choice: the enum's own names, common prefix off (HrtfAuto -> Auto)
      const names = enumsByType[e.enumType]; const pre = (/^[A-Z][a-z]+(?=[A-Z])/.exec(names[0][1]) || [''])[0];
      e.t = 'enum'; o = names.map(([v, n]) => [v, (names.every(([, x]) => x.startsWith(pre)) ? n.slice(pre.length) : n).replace(/([a-z0-9])([A-Z])/g, '$1 $2')]);
    }
    res.push({ s: e.s, k: e.k, t: e.t, d: e.d, o, l: hl || (u.text || '').replace(/:$/, '') || null, desc: hd || undefined, uiTab: u.tab });
  }
  return res.filter(keep).map(finish);
}

// left out: devices, servers and accounts, window and cursor, Windows-only logging
const DROP = /^(Network\.(shadnet_server|shadnet_webapi_server|signaling_info|p2p_port|enable_upnp|shad_net_enabled|disable_https)|Audio\.(audio_backend|\w+_device)|Input\.(cursor_state|cursor_hide_timeout|camera_id|background_controller_input|default_controller_id)|GPU\.(full_screen|full_screen_mode)|Vulkan\.gpu_id|Log\.type)$/;
const keep = (x) => !DROP.test(`${x.s}.${x.k}`);
const human = (k) => { const w = String(k).replace(/_/g, ' ').replace(/\b(fsr|rcas|hdr|gpu|dmem|fmem|vk|upnp|ime|usb|id|mb|hrtf)\b/gi, (x) => x.toUpperCase()).replace(/\bopenal\b/i, 'OpenAL').replace(/\bin mbytes\b/i, '(MB)').trim(); return w[0].toUpperCase() + w.slice(1); };
const SEC_TAB = { General: 'General', Network: 'General', Input: 'Input', Audio: 'Audio', GPU: 'Graphics', Vulkan: 'Advanced', Debug: 'Advanced', Log: 'Advanced' };
const UI_TAB = { General: 'General', Frontend: 'General', User: 'General', Graphics: 'Graphics', Input: 'Input', Log: 'Advanced', Debug: 'Advanced', Experimental: 'Experimental' };
function finish(x) {
  let tab = (x.uiTab && UI_TAB[x.uiTab]) || SEC_TAB[x.s] || 'Advanced';
  if (/^(volume_slider|openal_hrtf|openal_output_mode)$/.test(x.k)) tab = 'Audio';
  const adv = tab === 'Advanced' || /dump|shader_collect|patch_shaders|null_gpu|userfaultfd|inline_fetch_shader|markers|validation|renderdoc|crash_diagnostic/.test(x.k);
  const o = { s: x.s, k: x.k, t: x.t, d: x.d, o: x.o, l: x.l || human(x.k), desc: x.desc && x.desc.split(/(?<=\.)\s/)[0].trim(), tab: adv ? 'Advanced' : tab, adv: adv || undefined };
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

module.exports = { id: 'shadps4', versions: { git: 'https://github.com/shadps4-emu/shadPS4', tags: /^v\.\d+\.\d+\.\d+$/ }, /* 0.9.63: its last releases too (gen.js) */ files: FILES, read };
