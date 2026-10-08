// Builds electron/emuSettingsDb.json: every setting PPSSPP and Dolphin take in a game's own settings file, with its
// type and default, read from the emulators' source (0.9.61, owner: PPSSPP's per-game list was wrong and Dolphin's
// missing most settings). The old list came from the main settings file, which held keys PPSSPP ignores per game
// (only CfgFlag::PER_GAME ones count) and lacked most of Dolphin's (its files keep only what differs from default).
// Usage: node tools/game-settings/gen.js <folder with the source files below>
//   PPSSPP:  Core/Config.cpp, UI/GameSettingsScreen.cpp (its names and choices for each setting)
//   Dolphin: Source/Core/Core/Config/GraphicsSettings.cpp, MainSettings.cpp, Source/Core/VideoCommon/VideoConfig.h,
//            Source/Core/Core/PowerPC/PowerPC.h
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/game-settings/gen.js <source folder>'); process.exit(1); }
const src = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

// ---- PPSSPP: ConfigSetting("Key", SETTING(g_Config, bMember), default, CfgFlag::PER_GAME ...)
// (g_sectionMeta: the array each one is in is its ini section)
function ppsspp() {
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

// ---- Dolphin: const Info<T> NAME{{System::GFX|Main, "Section", "Key"}, default};
// GameConfigLoader.cpp: in a game's INI, GFX Settings is [Video_Settings] and so on; other sections are "GFX.<Section>"
function dolphin() {
  const enums = {};
  for (const f of ['VideoConfig.h', 'PowerPC.h']) {
    for (const m of src(f).matchAll(/enum class (\w+)(?:\s*:\s*\w+)?\s*\{([^}]*)\}/g)) {
      let n = -1; const vals = [];
      for (const raw of m[2].split(',')) {
        const e = raw.replace(/\/\/.*$/gm, '').trim(); if (!e) continue;
        const [name, v] = e.split('=').map((x) => x.trim());
        n = v != null && /^-?\d+$/.test(v) ? Number(v) : n + 1;
        if (!/ARM64/.test(name)) vals.push([String(n), name]); // Cartridge runs on x86-64 only
      }
      enums[m[1]] = vals;
    }
  }
  const GAME_SEC = { 'GFX.Settings': 'Video_Settings', 'GFX.Enhancements': 'Video_Enhancements', 'GFX.Hacks': 'Video_Hacks', 'GFX.Stereoscopy': 'Video_Stereoscopy', 'GFX.Hardware': 'Video_Hardware', 'GFX.ColorCorrection': 'GFX.ColorCorrection', 'Main.Core': 'Core', 'Main.DSP': 'DSP' };
  // not a per-game thing (folders, devices, network, debugging) or not a plain value
  const NOT = /^MTL|WiiLink|^GBA|RealWiiRemote|WiiKeyboard|WiiSDCard|RTC|Path|Folder|Dir$|File|Serial|Netplay|BBA|MAC|Slot|SerialPort|Debug|Dump|Log|Breakpoint|GDB|USB|Bluetooth|Wiimote|Override|Overlay|Movie|Fifo|Profile|Adapter|Region|Language|SIDevice|AGP|SlippiReplay/i;
  const out = [];
  for (const f of ['GraphicsSettings.cpp', 'MainSettings.cpp']) {
    for (const m of src(f).matchAll(/const Info<([^>]+)>\s+(\w+)\s*\{\s*\{\s*System::(\w+),\s*"([^"]+)",\s*"([^"]+)"\s*\}\s*,\s*([^;]*?)\};/g)) {
      const [, T, , sys, section, key, def0] = m;
      const s = GAME_SEC[sys + '.' + section];
      if (!s || (NOT.test(key) && key !== 'GFXBackend')) continue;
      const def = def0.replace(/\s+/g, ' ').trim();
      const en = enums[T.replace(/^.*::/, '')];
      if (T === 'bool') out.push({ s, k: key, t: 'bool', d: def === 'true' ? 'True' : 'False' });
      else if (/^(int|u32|s32|float)$/.test(T)) out.push({ s, k: key, t: T === 'float' ? 'float' : 'int', d: /^-?[\d.]+f?$/.test(def) ? def.replace(/f$/, '').replace(/\.$/, '') : null });
      else if (en) { const dv = /::(\w+)$/.exec(def)?.[1]; out.push({ s, k: key, t: 'enum', o: en, d: en.find((e) => e[1] === dv)?.[0] ?? null }); }
      else if (key === 'GFXBackend') out.push({ s, k: key, t: 'choice', o: [['Vulkan', 'Vulkan'], ['OGL', 'OpenGL'], ['Software Renderer', 'Software'], ['Null', 'Null']], d: null });
    }
  }
  return out;
}

const db = { note: 'Generated by tools/game-settings/gen.js from the emulators\' source. Do not edit by hand.', ppsspp: ppsspp(), dolphin: dolphin() };
fs.writeFileSync(path.join(__dirname, '../../electron/emuSettingsDb.json'), JSON.stringify(db, null, 0).replace(/\},\{/g, '},\n{') + '\n');
console.log('ppsspp', db.ppsspp.length, 'dolphin', db.dolphin.length);
