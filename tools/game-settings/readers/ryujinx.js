// Ryujinx (Ryubing) per-game settings: a game with its own configuration has a FULL copy of Config.json at
// <data>/games/<base title ID, x16>/Config.json (Program.GetDirGameUserConfig, MainWindowViewModel.InitializeUserConfig),
// loaded instead of the global one. Keys are ConfigurationFileFormat's properties in snake_case (JsonHelper
// SnakeCaseNamingPolicy); defaults from ConfigurationState.LoadDefault through ToFileFormat; enums with
// JsonStringEnumConverter are written by name, the others (VSyncMode, MemoryConfiguration) as numbers.
// Docs: docs/game-settings/ryujinx.md
const fs = require('fs');
const path = require('path');
// upstream is git.ryujinx.app (ryubing/ryujinx); this GitHub mirror is reachable where the forge isn't
const RAW = 'https://raw.githubusercontent.com/Leuconoe/Ryubing/master/src/';
const ENUMS = {
  AntiAliasing: 'Ryujinx.Common/Configuration/AntiAliasing.cs', AspectRatio: 'Ryujinx.Common/Configuration/AspectRatioExtensions.cs',
  BackendThreading: 'Ryujinx.Common/Configuration/BackendThreading.cs', GraphicsBackend: 'Ryujinx.Common/Configuration/GraphicsBackend.cs',
  MemoryManagerMode: 'Ryujinx.Common/Configuration/MemoryManagerMode.cs', ScalingFilter: 'Ryujinx.Common/Configuration/ScalingFilter.cs',
  VSyncMode: 'Ryujinx.Common/Configuration/VSyncMode.cs', AudioBackend: 'Ryujinx/Systems/Configuration/AudioBackend.cs',
  Language: 'Ryujinx/Systems/Configuration/System/Language.cs', Region: 'Ryujinx/Systems/Configuration/System/Region.cs',
  MemoryConfiguration: 'Ryujinx.HLE/MemoryConfiguration.cs',
};
const flat = (p) => p.replace(/\//g, '_');
// the settings window's pages (UI/Views/Settings): what a game may sensibly change; no paths, devices, UI, accounts
const TAB = {
  System: ['SystemLanguage', 'SystemRegion', 'SystemTimeOffset', 'MatchSystemTime', 'DockedMode', 'DramSize', 'IgnoreApplet', 'SkipUserProfiles', 'IgnoreMissingServices', 'EnableFsIntegrityChecks', 'FsGlobalAccessLogMode'],
  CPU: ['EnablePtc', 'EnableLowPowerPtc', 'TickScalar', 'MemoryManagerMode'],
  Graphics: ['GraphicsBackend', 'BackendThreading', 'ResScale', 'ResScaleCustom', 'MaxAnisotropy', 'AspectRatio', 'AntiAliasing', 'ScalingFilter', 'ScalingFilterLevel', 'VSyncMode', 'EnableCustomVSyncInterval', 'CustomVSyncInterval', 'EnableShaderCache', 'EnableTextureRecompression', 'EnableMacroHLE', 'EnableColorSpacePassthrough'],
  Audio: ['AudioBackend', 'AudioVolume'],
  Network: ['EnableInternetAccess'],
  Input: ['UseInputGlobalConfig', 'EnableKeyboard', 'EnableMouse'],
  Advanced: ['EnableFileLog', 'LoggingEnableDebug', 'LoggingEnableStub', 'LoggingEnableInfo', 'LoggingEnableWarn', 'LoggingEnableError', 'LoggingEnableTrace', 'LoggingEnableGuest', 'LoggingEnableFsAccessLog', 'LoggingEnableNetLog'],
};
const ADV = /^(IgnoreMissingServices|EnableFsIntegrityChecks|FsGlobalAccessLogMode|TickScalar|EnableFileLog|Logging\w+)$/;
const LABELS = { ResScale: 'Resolution Scale', ResScaleCustom: 'Custom Resolution Scale', MaxAnisotropy: 'Anisotropic Filtering', EnablePtc: 'PPTC Cache', EnableLowPowerPtc: 'Low-power PPTC', DramSize: 'DRAM Size', DockedMode: 'Docked Mode', EnableMacroHLE: 'Macro HLE', VSyncMode: 'VSync', EnableFsIntegrityChecks: 'FS Integrity Checks', IgnoreApplet: 'Ignore Controller Applet', UseInputGlobalConfig: 'Use Global Input Settings', EnableColorSpacePassthrough: 'Colour Space Passthrough', SystemTimeOffset: 'System Time Offset (seconds)', EnableCustomVSyncInterval: 'Custom VSync Interval', CustomVSyncInterval: 'Custom VSync Interval (Hz)', FsGlobalAccessLogMode: 'FS Global Access Log Mode', AudioVolume: 'Volume' };
const CHOICES = {
  ResScale: [['-1', 'Custom'], ['1', 'Native (720p/1080p)'], ['2', '2x'], ['3', '3x'], ['4', '4x']],
  MaxAnisotropy: [['-1', 'Auto'], ['2', '2x'], ['4', '4x'], ['8', '8x'], ['16', '16x']],
};
const snake = (n) => { let o = ''; for (let i = 0; i < n.length; i++) { const c = n[i]; if (/[A-Z]/.test(c)) { if (!(i === 0 || /[A-Z]/.test(n[i - 1]))) o += '_'; o += c.toLowerCase(); } else o += c; } return o; };
const human = (k) => LABELS[k] || (/^LoggingEnable/.test(k) ? 'Log: ' + k.slice(13).replace(/([a-z0-9])([A-Z])/g, '$1 $2') : null) || k.replace(/^(Enable|Logging|System)(?=[A-Z])/, (m) => (m === 'Logging' ? 'Log ' : '')).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

function read(dir) {
  const src = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  // enum members (value, name) and whether JSON writes them by name
  const enums = {};
  for (const [name, file] of Object.entries(ENUMS)) {
    let t; try { t = src(flat(file)); } catch { continue; }
    const m = new RegExp('enum ' + name + '\\s*(?::\\s*\\w+)?\\s*\\{([^}]*)\\}').exec(t); if (!m) continue;
    let n = -1; const vals = [];
    for (const raw of m[1].replace(/\/\/.*$/gm, '').replace(/\[[^\]]*\]/g, '').split(',')) {
      const e = raw.trim(); if (!e) continue;
      const [k, v] = e.split('=').map((x) => x.trim());
      n = v != null && /^-?\d+$/.test(v) ? Number(v) : n + 1;
      vals.push([n, k]);
    }
    enums[name] = { vals, byName: new RegExp('JsonStringEnumConverter<' + name + '>').test(t) };
  }
  // properties: /// <summary> text </summary> public Type Name { get; set; }
  const ff = src('ConfigurationFileFormat.cs');
  const props = {};
  for (const m of ff.matchAll(/<summary>([\s\S]*?)<\/summary>\s*public\s+([\w<>\[\]]+)\s+(\w+)\s*\{\s*get;\s*set;\s*\}/g)) props[m[3]] = { type: m[2], desc: m[1].replace(/\/\/\//g, '').replace(/\s+/g, ' ').trim() };
  // defaults: ToFileFormat (Prop = Section.Member) and LoadDefault (Section.Member.Value = expr;)
  const st = src('ConfigurationState.cs');
  const toFile = {};
  for (const m of st.matchAll(/^\s*(\w+)\s*=\s*([\w.]+?)(?:\.Value)?,\s*$/gm)) toFile[m[1]] = m[2];
  const defs = {};
  const ld = /public void LoadDefault\(\)\s*\{([\s\S]*?)\n {8}\}/.exec(st)?.[1] || '';
  for (const m of ld.matchAll(/^\s*([\w.]+)\.Value\s*=\s*([^;]+);/gm)) defs[m[1]] = m[2].trim();
  let model = ''; try { model = src('ConfigurationState.Model.cs'); } catch {}
  const out = [];
  for (const [tab, keys] of Object.entries(TAB)) for (const key of keys) {
    const p = props[key]; if (!p) continue;
    const e = { s: '', k: snake(key), l: human(key), desc: p.desc, tab: ADV.test(key) ? 'Advanced' : tab };
    const en = enums[p.type];
    const expr = defs[toFile[key]];
    // not set in LoadDefault: a new ReactiveObject<T>() holds C#'s default (false, 0)
    const unset = !expr && /new ReactiveObject<\w+>\(\)/.test(model) && new RegExp('\\b' + (toFile[key] || '').split('.').pop() + ' = new ReactiveObject<\\w+>\\(\\)').test(model);
    if (p.type === 'bool') { e.t = 'bool'; e.o = [['true', 'On'], ['false', 'Off']]; e.d = /^(true|false)$/.test(expr) ? expr : unset ? 'false' : null; }
    else if (en) {
      // AudioToolbox is macOS only; MemoryConfiguration4GiB -> 4 GiB
      e.t = 'enum'; e.o = en.vals.filter(([, k]) => k !== 'AudioToolbox').map(([n, k]) => [en.byName ? k : String(n), k.replace(/^MemoryConfiguration(\d+)GiB(.*)$/, (_, g, r) => g + ' GiB' + (r ? ' (' + r.replace(/Dev$/, ' dev') + ')' : ''))]);
      const dn = /^\w+\.(\w+)$/.exec(expr || '')?.[1];
      const hit = en.vals.find(([, k]) => k === dn);
      e.d = hit ? (en.byName ? hit[1] : String(hit[0])) : null;
    } else if (/^(int|long|float|double)$/.test(p.type)) {
      e.t = /float|double/.test(p.type) ? 'float' : 'int';
      e.d = expr && /^-?[\d.]+f?$/.test(expr) ? String(Number(expr.replace(/f$/, ''))) : unset ? '0' : null;
    } else continue; // strings, lists and objects: paths, devices, input mappings
    if (CHOICES[key]) { e.t = 'enum'; e.o = CHOICES[key]; }
    if (key === 'ScalingFilterLevel') { e.min = 0; e.max = 100; }
    if (key === 'AudioVolume') { e.min = 0; e.max = 1; }
    if (ADV.test(key)) e.adv = true;
    out.push(e);
  }
  return out;
}
module.exports = {
  id: 'ryujinx',
  files: [
    { url: RAW + 'Ryujinx/Systems/Configuration/ConfigurationFileFormat.cs', as: 'ConfigurationFileFormat.cs' },
    { url: RAW + 'Ryujinx/Systems/Configuration/ConfigurationState.cs', as: 'ConfigurationState.cs' },
    { url: RAW + 'Ryujinx/Systems/Configuration/ConfigurationState.Model.cs', as: 'ConfigurationState.Model.cs' },
    ...Object.values(ENUMS).map((f) => ({ url: RAW + f, as: flat(f) })),
  ],
  read,
};
