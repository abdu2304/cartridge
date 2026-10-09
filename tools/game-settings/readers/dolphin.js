// Dolphin's per-game settings (0.9.61): Config/GraphicsSettings.cpp and MainSettings.cpp (every Info<> a game's
// GameSettings/<ID6>.ini can set, sections as ConfigLoaders/GameConfigLoader.cpp names them) and the enum headers.
// Docs: docs/game-settings/dolphin.md
const fs = require('fs');
const path = require('path');
const RAW = 'https://raw.githubusercontent.com/dolphin-emu/dolphin/master/Source/Core/';
let src;
// ---- Dolphin: const Info<T> NAME{{System::GFX|Main, "Section", "Key"}, default};
// GameConfigLoader.cpp: in a game's INI, GFX Settings is [Video_Settings] and so on; other sections are "GFX.<Section>"
function read(dir) {
  src = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
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

const TAB = { Video_Settings: 'Graphics', Video_Hardware: 'Graphics', Video_Enhancements: 'Enhancements', Video_Hacks: 'Hacks', Core: 'Core', DSP: 'Audio', Video_Stereoscopy: 'Stereo 3D', 'GFX.ColorCorrection': 'Colour' };
const ADV = /Log|Debug|Dump|Validation|Wireframe|Overlay|Show|Statistic|Profile|Fifo|Graphics?Mods|EnableMods|Texture(Dump|Load)|Cache(Hires)?Textures|BackendMultithreading|CommandBuffer|PerfQueries|ShaderCompilerThreads|Precompiler|MMU|PauseOnPanic|FloatExceptions|DivByZero|DisableICache|AccurateNaNs|AccurateFmadds|FPRF|LowDCBZ|TimingVariance|MaxFallback|JIT|Fastmem|PageTable|LargeEntryPoints|AccurateCPUCache|SyncGpu(Max|Min)|SyncOnSkipIdle|MEM[12]Size|ARAMExpansion|EnableSaveStates|SuggestedAspect|WidescreenHeuristic|MaxInternalResolution|ArbitraryMipmap|ManuallyUpload|VertexLoader|PreferVS|CPUCull|CustomAspect/;
const sortTabs = (order, list) => list.sort((a, b) => order.indexOf(a.tab) - order.indexOf(b.tab));
module.exports = {
  id: 'dolphin',
  files: [['Core/Config/GraphicsSettings.cpp', 'GraphicsSettings.cpp'], ['Core/Config/MainSettings.cpp', 'MainSettings.cpp'], ['VideoCommon/VideoConfig.h', 'VideoConfig.h'], ['Core/PowerPC/PowerPC.h', 'PowerPC.h']].map(([p, as]) => ({ url: RAW + p, as })),
  // in the order the tabs show (Array sort is stable, so each tab keeps the source's order)
  read: (dir) => sortTabs(['Graphics', 'Enhancements', 'Hacks', 'Core', 'Audio', 'Stereo 3D', 'Colour', 'Advanced'], read(dir).map((x) => ({ ...x, o: x.t === 'bool' ? [['True', 'On'], ['False', 'Off']] : x.o, tab: ADV.test(x.k) ? 'Advanced' : TAB[x.s] || x.s, adv: ADV.test(x.k) || undefined }))),
};
