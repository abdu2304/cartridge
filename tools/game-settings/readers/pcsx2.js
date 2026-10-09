// PCSX2's per-game settings: VMManager.cpp UpdateGameSettingsLayer puts gamesettings/<SERIAL>_<CRC>.ini as a layer
// over PCSX2.ini, so every key LoadCoreSettings reads (Pcsx2Config.cpp LoadSave) can be set per game. Names, help,
// defaults and choices come from the Qt pages its per-game window shows (SettingsWindow.cpp: Emulation, Game Fixes,
// Graphics, On-Screen Display, Audio, Advanced, Debug): SettingWidgetBinder calls, registerWidgetHelp and the .ui
// combo items. Keys PCSX2 reads but no page shows come from Pcsx2Config.cpp (Advanced). Docs: docs/game-settings/pcsx2.md
const fs = require('fs');
const path = require('path');
const RAW = 'https://raw.githubusercontent.com/PCSX2/pcsx2/master/';
const PAGES = { EmulationSettingsWidget: 'Emulation', GameFixSettingsWidget: 'Game Fixes', GraphicsSettingsWidget: 'Graphics', OSDSettingsWidget: 'On-Screen Display', AudioSettingsWidget: 'Audio', AdvancedSettingsWidget: 'Advanced', DebugSettingsWidget: 'Advanced' };
const UIS = ['EmulationSettingsWidget', 'GameFixSettingsWidget', 'GraphicsSettingsHeader', 'GraphicsDisplaySettingsTab', 'GraphicsHardwareRenderingSettingsTab', 'GraphicsSoftwareRenderingSettingsTab',
  'GraphicsHardwareFixesSettingsTab', 'GraphicsUpscalingFixesSettingsTab', 'GraphicsTextureReplacementSettingsTab', 'GraphicsPostProcessingSettingsTab', 'GraphicsMediaCaptureSettingsTab',
  'GraphicsAdvancedSettingsTab', 'OSDSettingsWidget', 'AudioSettingsWidget', 'AudioExpansionSettingsDialog', 'AudioStretchSettingsDialog', 'AdvancedSettingsWidget',
  'DebugGSSettingsTab', 'DebugLoggingSettingsTab', 'DebugUserInterfaceSettingsTab'];
const FILES = ['pcsx2/Config.h', 'pcsx2/Pcsx2Config.cpp', 'pcsx2/Host/AudioStream.cpp', 'pcsx2/Host/AudioStream.h', 'pcsx2/Host/AudioStreamTypes.h', 'common/FPControl.h',
  ...Object.keys(PAGES).map((p) => `pcsx2-qt/Settings/${p}.cpp`), ...UIS.map((u) => `pcsx2-qt/Settings/${u}.ui`)];

// "a, f(b, c), {d, e}" split at top-level commas (strings kept whole)
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
// the text inside the parentheses that open at i
function inParens(t, i) { let d = 0; for (let j = i; j < t.length; j++) { if (t[j] === '(') d++; else if (t[j] === ')' && --d === 0) return t.slice(i + 1, j); } return ''; }
// drops `if (!dialog()->isPerGameSettings()) { ... }` (not shown per game) and Windows/macOS/dev-build blocks
function perGameOnly(t) {
  t = t.replace(/\/\/[^\n]*/g, '');
  let out = '', i = 0;
  const re = /if \(!dialog\(\)->isPerGameSettings\(\)\)\s*\{/g; let m;
  while ((m = re.exec(t))) { out += t.slice(i, m.index); let d = 0, j = m.index + m[0].length - 1; for (; j < t.length; j++) { if (t[j] === '{') d++; else if (t[j] === '}' && --d === 0) break; } i = j + 1; re.lastIndex = i; }
  out += t.slice(i);
  const lines = []; let skip = 0;
  for (const l of out.split('\n')) {
    if (/^\s*#if/.test(l)) { skip = skip ? skip + 1 : /_WIN32|__APPLE__|PCSX2_DEVBUILD|ENABLE_VULKAN_DEBUG/.test(l) && !/ifndef/.test(l) ? 1 : 0; continue; }
    if (/^\s*#else/.test(l)) { if (skip === 1) skip = 0; continue; }
    if (/^\s*#endif/.test(l)) { if (skip) skip--; continue; }
    if (!skip) lines.push(l);
  }
  return lines.join('\n');
}
const unq = (s) => (/^tr\("/.test(s) ? s.slice(4, -2) : /^"/.test(s) ? s.slice(1, -1) : s).replace(/\\"/g, '"').replace(/\\n/g, ' ');

function read(dir) {
  const src = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } };
  const cfgH = src('pcsx2/Config.h'), cfgC = src('pcsx2/Pcsx2Config.cpp'), audio = src('pcsx2/Host/AudioStream.cpp') + src('pcsx2/Host/AudioStream.h');
  const audioT = src('pcsx2/Host/AudioStreamTypes.h') + src('common/FPControl.h');
  const pages = Object.keys(PAGES).map((p) => src(`pcsx2-qt/Settings/${p}.cpp`)).join('\n');
  const all = cfgH + cfgC + audio + audioT;
  // ---- enums (Config.h, AudioStream.h) and name arrays
  const enums = {};
  for (const m of all.replace(/\/\/[^\n]*/g, '').matchAll(/enum class (\w+)\s*(?::\s*\w+)?\s*\{([^}]*)\}/g)) {
    let n = -1; const vals = [];
    for (const e of m[2].split(',').map((x) => x.trim()).filter(Boolean)) { if (/^#/.test(e)) continue; const [name, v] = e.split('=').map((x) => x.trim()); n = v != null && /^-?\d+$/.test(v) ? Number(v) : n + 1; vals.push({ name, n }); }
    enums[m[1]] = vals;
  }
  const arrays = {};
  // TRANSLATE_NOOP("Context", "Name") entries: the last string is the name
  for (const m of all.matchAll(/(\w+)(?:\[[^\]]*\])?\s*=\s*\{([^{}]*)\};/g)) { const v = splitTop(m[2]).map((e) => [...e.matchAll(/"((?:[^"\\]|\\.)*)"/g)].pop()).filter(Boolean).map((x) => x[1]); if (v.length) arrays[m[1]] = v; }
  // a C++ default: number, bool, string, Enum::Member (its value), a named constant (looked up), static_cast<..>(...)
  const value = (expr, depth = 0) => {
    if (expr == null || depth > 4) return null;
    let e = expr.trim().replace(/^static_cast<[^>]+>\((.*)\)$/, '$1').replace(/^\((.*)\)$/, '$1').trim();
    if (/^(true|false)$/.test(e)) return e;
    if (/^-?\d+(\.\d+)?f?$/.test(e)) return String(Number(e.replace(/f$/, '')));
    if (/^"/.test(e)) return e.slice(1, -1);
    const em = /(\w+)::(\w+)$/.exec(e);
    if (em && enums[em[1]]) { const v = enums[em[1]].find((x) => x.name === em[2]); return v ? { enumType: em[1], name: v.name, n: v.n } : null; }
    const name = (/(\w+)$/.exec(e) || [])[1]; if (!name) return null;
    const c = new RegExp(`\\b${name}\\s*=\\s*([^;,{}]+);`).exec(cfgH + audio + audioT + pages);
    return c ? value(c[1], depth + 1) : null;
  };
  const asNum = (v) => (v && typeof v === 'object' ? String(v.n) : v);

  // ---- .ui: widget -> text, combo items
  const ui = UIS.map((u) => src(`pcsx2-qt/Settings/${u}.ui`)).join('\n');
  const uiOf = (name) => {
    const i = ui.indexOf(`name="${name}"`); if (i < 0) return {};
    const start = ui.lastIndexOf('<widget', i); const cls = (/class="(\w+)"/.exec(ui.slice(start, i + 1)) || [])[1];
    let body = ui.slice(i); const next = body.indexOf('<widget', 1); const end = body.indexOf('</widget>');
    body = body.slice(0, next > 0 && next < end ? next : end);
    const text = (/<property name="(?:text|title)">\s*<string[^>]*>([^<]*)</.exec(body) || [])[1];
    const items = [...body.matchAll(/<item>\s*<property name="text">\s*<string[^>]*>([^<]*)</g)].map((x) => x[1]);
    return { cls, text: text && text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'), items: items.map((x) => x.replace(/&amp;/g, '&')) };
  };

  const out = {}; // "Section|Key" -> entry
  for (const [page, tab] of Object.entries(PAGES)) {
    const t = perGameOnly(src(`pcsx2-qt/Settings/${page}.cpp`));
    // registerWidgetHelp(widget, tr("Name"), tr("Default"), tr("Help"))
    const help = {};
    for (const m of t.matchAll(/registerWidgetHelp\(/g)) {
      const a = splitTop(inParens(t, m.index + m[0].length - 1));
      const w = (/(\w+)$/.exec(a[0] || '') || [])[1];
      if (w && /^tr\(/.test(a[1] || '')) help[w] = { l: unq(a[1]), desc: /^tr\(/.test(a[3] || '') ? unq(a[3].replace(/"\s*\n?\s*"/g, '')) : undefined };
    }
    for (const m of t.matchAll(/SettingWidgetBinder::(BindWidgetTo(Bool|Int|Float|Enum|String|Normalized)Setting|BindWidgetAndLabelToIntSetting)\(/g)) {
      let a = splitTop(inParens(t, m.index + m[0].length - 1));
      const kind = m[2] || 'Int';
      if (m[1] === 'BindWidgetAndLabelToIntSetting') a = [a[0], a[1], ...a.slice(4)];
      const w = (/(\w+)$/.exec(a[1] || '') || [])[1];
      const sec = unq(a[2] || ''), key = unq(a[3] || '');
      if (!sec || !key || /^\w+$/.test(a[2])) continue; // a section held in a variable
      const u = uiOf(w), h = help[w] || {};
      const e = { s: sec, k: key, l: h.l || (u.text || '').replace(/:$/, '') || null, desc: h.desc, tab, w };
      if (kind === 'Bool') { e.t = 'bool'; e.d = value(a[4]) || 'false'; e.o = [['true', 'On'], ['false', 'Off']]; }
      else if (kind === 'Int') {
        const d = value(a[4]); e.d = asNum(d); const off = a[5] ? Number(asNum(value(a[5]))) || 0 : 0;
        if (u.items && u.items.length && u.cls === 'QComboBox') { e.t = 'enum'; e.o = u.items.map((x, i) => [String(i + off), x]); } else e.t = 'int';
      } else if (kind === 'Float' || kind === 'Normalized') { e.t = 'float'; e.d = asNum(value(kind === 'Normalized' ? a[5] : a[4])); }
      else if (kind === 'String') { e.t = 'text'; e.d = value(a[4]); if (typeof e.d !== 'string') e.d = e.d == null ? '' : null; if (u.items && u.items.length) { e.t = 'enum'; e.o = u.items.map((x) => [x, x]); } }
      else if (kind === 'Enum') {
        // (names[], default) | (parse fn, name fn, default) | (display names, names, default, context)
        let names = null, display = u.items && u.items.length ? u.items : null, def = null;
        const nm = (x) => (/(\w+)$/.exec(x || '') || [])[1];
        if (/^&/.test(a[4] || '')) {
          const fn = nm(a[5]); const body = new RegExp(`${fn}\\([^)]*\\)\\s*\\{[^}]*?(s_\\w+)\\[`).exec(all);
          names = body && arrays[body[1]]; const dn = body && arrays[body[1].replace(/_names$/, '_display_names')]; if (dn) display = dn; def = a[6];
        } else if (a.length >= 8 || (a[5] && /Names|names/.test(a[5]) && a[6])) { names = arrays[nm(a[5])]; display = arrays[nm(a[4])] || display; def = a[6]; }
        else { names = arrays[nm(a[4])]; def = a[5]; }
        if (!names) continue;
        e.t = 'enum'; e.o = names.map((x, i) => [x, (display && display[i]) || x]);
        const dv = value(def); e.d = dv && typeof dv === 'object' ? names[dv.n] ?? null : typeof dv === 'string' ? dv : null;
        if (def && /\[/.test(def)) { const ix = value(/\[(.*)\]$/.exec(def)[1]); e.d = ix && typeof ix === 'object' ? names[ix.n] : e.d; }
      }
      const id = sec + '|' + key; if (!out[id]) out[id] = e;
    }
  }

  // ---- set by hand in the pages (not through a binder)
  const gfx = perGameOnly(src('pcsx2-qt/Settings/GraphicsSettingsWidget.cpp'));
  const rinfo = [...((/s_renderer_info\[\] = \{([\s\S]*?)\n\};/.exec(gfx) || [])[1] || '').matchAll(/"([^"]+)"\),\s*GSRendererType::(\w+)/g)];
  const rv = (n) => (enums.GSRendererType || []).find((x) => x.name === n);
  out['EmuCore/GS|Renderer'] = { s: 'EmuCore/GS', k: 'Renderer', t: 'enum', d: String(rv('Auto') ? rv('Auto').n : -1), o: rinfo.filter((m) => rv(m[2])).map((m) => [String(rv(m[2]).n), m[1]]), l: 'Renderer', desc: 'Selects the graphics renderer.', tab: 'Graphics' };
  const ups = [...((/templates\[\] = \{([\s\S]*?)\n\t\};/.exec(gfx) || [])[1] || '').matchAll(/"([^"]+)"\),\s*([\d.]+)f/g)];
  out['EmuCore/GS|upscale_multiplier'] = { s: 'EmuCore/GS', k: 'upscale_multiplier', t: 'enum', d: '1', o: ups.map((m) => [String(Number(m[2])), m[1]]), l: 'Internal Resolution', tab: 'Graphics' };
  const emu = src('pcsx2-qt/Settings/EmulationSettingsWidget.cpp');
  const ee = uiOf('eeCycleRate'); const minEE = Number(value('MINIMUM_EE_CYCLE_RATE')) || -3;
  out['EmuCore/Speedhacks|EECycleRate'] = { s: 'EmuCore/Speedhacks', k: 'EECycleRate', t: 'enum', d: '0', o: (ee.items || []).map((x, i) => [String(minEE + i), x]), l: 'EE Cycle Rate', tab: 'Emulation' };
  const speeds = ((/speeds\[\] = \{([^}]*)\}/.exec(emu) || [])[1] || '').split(',').map((x) => Number(x)).filter((x) => x);
  const speedO = [...speeds.map((p) => [String(p / 100), `${p}%`]), ['0', 'Unlimited']];
  for (const m of emu.matchAll(/initializeSpeedCombo\(m_ui\.(\w+), "(\w+)", "(\w+)", ([\d.]+)f\)/g)) {
    out[m[2] + '|' + m[3]] = { s: m[2], k: m[3], t: 'enum', d: String(Number(m[4])), o: speedO, l: (help(emu, m[1]) || { normalSpeed: 'Normal Speed', fastForwardSpeed: 'Fast-Forward Speed', slowMotionSpeed: 'Slow-Motion Speed' }[m[1]]), tab: 'Emulation' };
  }

  // ---- everything else LoadCoreSettings reads (Pcsx2Config.cpp), in the sections a game can set
  const seen = new Set(Object.keys(out).map((x) => x.toLowerCase())); // PCSX2's ini keys don't care about case (CSimpleIniA)
  const pagesLow = pages.toLowerCase();
  const decl = (v) => { const m = new RegExp(`\\b([\\w:<>]+)\\s+${v}\\s*(?::\\s*\\d+)?\\s*(?:=\\s*([^;]+))?;`).exec(cfgH); return m ? { type: m[1], init: m[2] } : {}; };
  let sec = null;
  for (const line of cfgC.split('\n')) {
    const sm = /SettingsWrapSection\("([^"]+)"\)/.exec(line); if (sm) { sec = sm[1]; continue; }
    if (/^}/.test(line)) { sec = null; continue; }
    const m = /SettingsWrap(BitBool|BitBoolEx|Bitfield|BitfieldEx|Entry|EntryEx|EnumEx|IntEnumEx|ParsedEnum)\(([\w\[\]]+)(?:,\s*"([^"]+)")?(?:,\s*(\w+))?/.exec(line);
    if (!m || !sec) continue;
    const [, kind, varName, keyName, namesArr] = m;
    const key = keyName || varName; const id = sec + '|' + key;
    if (seen.has(id.toLowerCase()) || pagesLow.includes(`"${key.toLowerCase()}"`)) continue; seen.add(id.toLowerCase()); // a page that names it but not per game: global only
    const d0 = decl(varName.replace(/\[.*$/, ''));
    const ctor = new RegExp(`\\b${varName.replace(/[[\]]/g, '\\$&')}\\s*=\\s*(true|false|-?[\\d.]+f?)\\s*;`).exec(cfgC);
    let e = { s: sec, k: key, l: null, tab: 'Advanced', adv: true };
    if (/BitBool/.test(kind) || d0.type === 'bool') { e.t = 'bool'; e.d = ctor ? ctor[1] : d0.init ? value(d0.init) : null; e.o = [['true', 'On'], ['false', 'Off']]; }
    else if (kind === 'EnumEx' && arrays[namesArr]) { e.t = 'enum'; e.o = arrays[namesArr].map((x) => [x, x]); const dv = value(d0.init); e.d = dv && typeof dv === 'object' ? arrays[namesArr][dv.n] : null; }
    else if (/^(float|double)$/.test(d0.type)) { e.t = 'float'; e.d = asNum(value(d0.init)) ?? (ctor ? String(Number(ctor[1].replace(/f$/, ''))) : null); }
    else if (/string/.test(d0.type || '')) { e.t = 'text'; e.d = d0.init ? value(d0.init) : ''; }
    else { e.t = 'int'; const dv = d0.init ? value(d0.init) : ctor ? ctor[1] : null; e.d = asNum(dv); }
    if (e.d && typeof e.d === 'object') e.d = null;
    out[id] = e;
  }
  const res = Object.values(out).filter(keep).map(finish);
  const n = {}; for (const x of res) n[x.s + '|' + x.l] = (n[x.s + '|' + x.l] || 0) + 1;
  for (const x of res) if (n[x.s + '|' + x.l] > 1) x.l = `${x.l} (${human(x.k)})`; // EE and IOP both say "Enable Recompiler"
  return res;
}
function help(t, w) { const m = new RegExp(`registerWidgetHelp\\(m_ui\\.${w},\\s*tr\\("([^"]+)"`).exec(t); return m && m[1]; }

// left out: paths and folders, devices, network, accounts, IPC, logging and debugger tooling, the PCSX2 window
const DROP_SEC = /^(Filenames|Folders|MemoryCards|DEV9|USB|Pad|Achievements|Debugger|SPU2\/Debug|EmuCore\/TraceLog|EmuCore\/Profiler|InputSources|Hotkeys|UI|GameList|Logging)(\/|$)/;
const DROP_KEY = /EnableFastBoot|Directory|Dir$|Path$|Filename|DiscPath|InputProfileName|PINE|Discord|InhibitScreensaver|^Adapter$|FullscreenMode|ExclusiveFullscreenControl|^Backend$|^DriverName$|^DeviceName$|BlockDump|GzipIsoIndexTemplate|UseDebugDevice|^Rtc|ManuallySetRealTimeClock|UseSystemLocaleFormat|WarnAboutUnsafeSettings|CdvdVerboseReads|CdvdDumpBlocks|EnableRecordingTools|SynchronousMTGS|SaveStateOnShutdown|UseSavestateSelector|HostFs|OutputMuted|^(StandardVolume|FastForwardVolume)$|ScreenshotFormat|ScreenshotSize|ScreenshotQuality|OrganizeScreenshotsByGame|OrganizeVideoCaptureByGame/i;
const keep = (x) => !DROP_SEC.test(x.s) && !DROP_KEY.test(x.k);
const human = (k) => { const w = String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim(); return w[0].toUpperCase() + w.slice(1); };
const ADV = /Dump|Debug|Log|Capture|Video|Audio(Bitrate|Codec)|Overlay|Trace|Profil|Mtvu|EnableThreadPinning|Precache|ManualUserHacks|Skipdraw|UserHacks|^(Recompiler|Enable(EE|IOP|VU0|VU1|FastmemPS2))/i;
function finish(x) {
  const o = { s: x.s, k: x.k, t: x.t, d: x.d, o: x.o, min: x.min, max: x.max, l: (x.l || human(x.k)).replace(/:$/, '').trim(), desc: x.desc && x.desc.split(/(?<=\.)\s/)[0].trim(), tab: x.tab };
  const adv = x.adv || o.tab === 'Advanced' || ADV.test(x.k) || /Capture|Video|Debug/.test(x.s);
  if (adv) { o.tab = 'Advanced'; o.adv = true; }
  if (o.t === 'bool' && o.d && !/^(true|false)$/.test(o.d)) o.d = null;
  for (const k of Object.keys(o)) if (o[k] === undefined || (k === 'o' && !o.o)) delete o[k];
  return o;
}

module.exports = { id: 'pcsx2', versions: { git: 'https://github.com/PCSX2/pcsx2', tags: /^v\d+\.\d+\.\d+$/ }, /* 0.9.63: its last releases too (gen.js) */ files: FILES.map((f) => ({ url: RAW + f, as: f })), read };
