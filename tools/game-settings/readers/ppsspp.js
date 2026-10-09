// PPSSPP's per-game settings (0.9.61): Core/Config.cpp (only CfgFlag::PER_GAME settings are read from a game's
// PSP/SYSTEM/<ID>_ppsspp.ini) and UI/GameSettingsScreen.cpp (names and choices). Docs: docs/game-settings/ppsspp.md
const fs = require('fs');
const path = require('path');
const RAW = 'https://raw.githubusercontent.com/hrydgard/ppsspp/master/';
let src;
// ---- PPSSPP: ConfigSetting("Key", SETTING(g_Config, bMember), default, CfgFlag::PER_GAME ...)
// (g_sectionMeta: the array each one is in is its ini section)
function read(dir) {
  src = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const t = src('Config.cpp');
  const SECTIONS = { generalSettings: 'General', cpuSettings: 'CPU', graphicsSettings: 'Graphics', soundSettings: 'Sound', controlSettings: 'Control', systemParamSettings: 'SystemParam' };
  const out = [];
  let sec = null, skip = 0;
  for (const line of t.split('\n')) {
    const a = /static const ConfigSetting (\w+)\[\]/.exec(line);
    if (a) { sec = SECTIONS[a[1]] || null; continue; }
    if (/^\s*};/.test(line)) { sec = null; continue; }
    // settings only built for other systems (Android, iOS, Windows) aren't in a Linux PPSSPP
    if (/^\s*#if/.test(line)) { skip = skip ? skip + 1 : /ANDROID|IOS|_WIN32|UWP|__APPLE__|MACOS|OPENXR|_MSC_VER/.test(line) ? 1 : 0; continue; }
    if (/^\s*#endif/.test(line)) { if (skip) skip--; continue; }
    if (/^\s*#else/.test(line)) { if (skip === 1) skip = 0; continue; }
    if (!sec || skip || !line.includes('PER_GAME')) continue;
    const m = /ConfigSetting\("([^"]+)",\s*SETTING\(g_Config,\s*(\w+)\),\s*([^,]+?),/.exec(line);
    if (!m) continue;
    const [, key, member, def0] = m;
    const type = { b: 'bool', i: 'int', f: 'float', s: 'text', u: 'int' }[member[0]] || 'text';
    let def = def0.trim();
    def = /^&/.test(def) ? null : type === 'bool' ? (def === 'true' ? 'True' : 'False') : def.replace(/f$/, '').replace(/\.$/, '').replace(/^"|"$/g, '');
    def = def != null && type !== 'bool' && type !== 'text' && !/^-?[\d.]+$/.test(def) ? null : def; // a value worked out at run time
    out.push({ s: sec, k: key, t: type, d: def, m: member });
  }
  // the settings screen: CheckBox(&g_Config.bX, gr->T("Name")), PopupMultiChoice(&g_Config.iX, gr->T("Name"), choices, first, ...)
  let ui = ''; try { ui = src('GameSettingsScreen.cpp'); } catch {}
  const arrays = {};
  for (const m of ui.matchAll(/static const char \*(\w+)\[\] = \{([^}]*)\}/g)) if (!arrays[m[1]]) arrays[m[1]] = [...m[2].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
  const names = {};
  for (const m of ui.matchAll(/&g_Config\.(\w+),\s*\w+->T\("([^"]+)"(?:,\s*"([^"]*)")?\)(?:,\s*(\w+),\s*(-?\d+),\s*ARRAY_SIZE)?/g)) {
    if (names[m[1]]) continue; // T("key", "English"): the second string is its name
    names[m[1]] = { l: m[3] || m[2], o: m[4] && arrays[m[4]] ? arrays[m[4]].map((x, i) => [String(Number(m[5]) + i), x]) : null };
  }
  for (const x of out) { const n = names[x.m]; if (n) { x.l = n.l; if (n.o && x.t === 'int') { x.t = 'enum'; x.o = n.o; } } if (x.t === 'bool' && x.d && !/^(True|False)$/.test(x.d)) x.d = /^(true|1)$/i.test(x.d) ? 'True' : 'False'; delete x.m; }
  return out;
}

// tabs: PPSSPP's sections, with logging, debugging and developer settings in Advanced
const TAB = { Graphics: 'Graphics', CPU: 'CPU', Sound: 'Audio', Control: 'Controls', SystemParam: 'System', General: 'General' };
const ADV = /Log|Debug|Jit|Dump|Flags|HLE|Breakpoint|Validation|Shader(Chain|Cache)|StatusFlags|CwCheat|ScrollPosition|Snapshot|Fps|Frame(Rate2?|Profiler)|IOTiming|SoftwareRenderer(Jit)?$|DisableDithering|ReplacementTextureLoadSpeed|SaveNewTextures|IgnoreTextureFilenames/;
const sortTabs = (order, list) => list.sort((a, b) => order.indexOf(a.tab) - order.indexOf(b.tab));
module.exports = {
  id: 'ppsspp',
  files: [{ url: RAW + 'Core/Config.cpp', as: 'Config.cpp' }, { url: RAW + 'UI/GameSettingsScreen.cpp', as: 'GameSettingsScreen.cpp' }],
  // in the order the tabs show (Array sort is stable, so each tab keeps the source's order)
  read: (dir) => sortTabs(['Graphics', 'CPU', 'Audio', 'Controls', 'System', 'General', 'Advanced'], read(dir).map((x) => ({ ...x, o: x.t === 'bool' ? [['True', 'On'], ['False', 'Off']] : x.o, tab: ADV.test(x.k) ? 'Advanced' : TAB[x.s] || x.s, adv: ADV.test(x.k) || undefined }))),
};
