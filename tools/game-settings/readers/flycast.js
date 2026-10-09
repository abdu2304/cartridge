// Flycast's per-game settings: core/cfg/option.cpp (every Option<T> is per game unless declared Option<T, false>;
// option.h load()/save(): a game's value is [<game ID>] "<section>.<name>", the global one [<section>] "<name>",
// section "config" unless given) and the settings screens in core/ui (names, help, choices, slider ranges).
// Docs: docs/game-settings/flycast.md
const fs = require('fs');
const path = require('path');
const RAW = 'https://raw.githubusercontent.com/flyinghead/flycast/master/core/';
const UI = ['settings.cpp', 'settings_general.cpp', 'settings_video.cpp', 'settings_audio.cpp', 'settings_controls.cpp', 'settings_network.cpp'];
// tab = Flycast's own settings tab (which ui/settings_*.cpp shows it)
const TAB_OF = { 'settings.cpp': 'Advanced', 'settings_general.cpp': 'General', 'settings_video.cpp': 'Video', 'settings_audio.cpp': 'Audio', 'settings_controls.cpp': 'Controls', 'settings_network.cpp': 'Network' };
// what a Linux x86-64 desktop build compiles (#if branches)
const DEFINED = new Set(['USE_OPENGL', 'USE_VULKAN', 'GDB_SERVER']);
const truth = (line) => {
  let m = /^\s*#\s*ifdef\s+(\w+)/.exec(line); if (m) return DEFINED.has(m[1]);
  m = /^\s*#\s*ifndef\s+(\w+)/.exec(line); if (m) return !DEFINED.has(m[1]);
  const c = line.replace(/^\s*#\s*(el)?if\s*/, '');
  if (/HOST_CPU\s*==\s*CPU_ARM/.test(c)) return false;
  if (/^!\s*defined\s*\(\s*(LIBRETRO|TARGET_IPHONE|__ANDROID__)\s*\)\s*$/.test(c)) return true;
  if (/FEAT_SHREC\s*!=\s*DYNAREC_NONE/.test(c)) return true;
  return false; // __ANDROID__, __APPLE__, TARGET_UWP, _WIN32, VIDEO_ROUTING, USE_OMX, USE_LUA, LIBRETRO...
};
// keep only lines a Linux build compiles
function compiled(text) {
  const out = [], st = []; // frames: { on, taken, parent }
  const on = () => st.every((f) => f.on);
  for (const line of text.split('\n')) {
    if (/^\s*#\s*if/.test(line)) { const v = truth(line); st.push({ on: v, taken: v }); continue; }
    if (/^\s*#\s*elif/.test(line)) { const f = st[st.length - 1]; if (f) { const v = !f.taken && truth(line); f.on = v; f.taken ||= v; } continue; }
    if (/^\s*#\s*else/.test(line)) { const f = st[st.length - 1]; if (f) { f.on = !f.taken; f.taken = true; } continue; }
    if (/^\s*#\s*endif/.test(line)) { st.pop(); continue; }
    if (on()) out.push(line);
  }
  return out.join('\n');
}
// C++ default -> emu.cfg spelling (ini.h set(): bool yes/no, ints std::to_string, floats ostream precision 7)
const UNITS = { _KB: 1024, _MB: 1024 ** 2, _GB: 1024 ** 3 };
function spell(type, v) {
  if (v == null) return type === 'bool' ? 'no' : type === 'text' ? '' : '0';
  v = v.trim();
  if (type === 'bool') return v === 'true' ? 'yes' : v === 'false' ? 'no' : null;
  if (type === 'text') return /^"(.*)"$/.exec(v)?.[1] ?? null;
  const u = /^(\d+)(_KB|_MB|_GB)$/.exec(v); if (u) return String(Number(u[1]) * UNITS[u[2]]);
  if (/^-?[\d.]+f?$/.test(v)) return String(Number(v.replace(/f$/, '')));
  return null; // worked out at run time (an enum or a function)
}
// a C string made of literals, maybe T("...") and split over lines
const strOf = (s) => (s ? [...s.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]).join('').replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\s+/g, ' ').trim() : null);

function read(dir) {
  const src = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const opts = {};
  const T = { bool: 'bool', int: 'int', int64_t: 'int', float: 'float', 'std::string': 'text', MapleDeviceType: 'int' };
  const code = compiled(src('option.cpp'));
  // Option<bool> X("name", def, "section");  OptionString X(...);  Option<int>("name", ...) inside arrays
  const rx = /(Option<([\w:]+(?:<[^>]*>)?)\s*(,\s*false)?>|OptionString)\s*(\w+)?\s*\(\s*"([^"]+)"\s*(?:,\s*([^,()]+(?:\([^)]*\))?))?\s*(?:,\s*"([^"]+)")?\s*\)/g;
  for (const m of code.matchAll(rx)) {
    const [, , tp, notPerGame, v, name, def, sec] = m;
    if (notPerGame || /vector/.test(tp || '')) continue;
    const type = m[1] === 'OptionString' ? 'text' : T[tp] || 'int';
    const id = v || name;
    opts[id] = { v: id, sec: sec || 'config', name, t: type, d: spell(type, def) };
  }
  // the two option classes declared in option.h: AudioVolumeOption ("aica.Volume") and RendererOption ("pvr.rend")
  const h = compiled(src('option.h'));
  const av = /AudioVolumeOption\(\)\s*:\s*Option<int>\("([^"]+)",\s*(\d+)\)/.exec(h);
  if (av) opts.AudioVolume = { v: 'AudioVolume', sec: 'config', name: av[1], t: 'int', d: av[2] };
  if (/RendererOption\(\)\s*:\s*Option<RenderType>\("pvr\.rend"/.test(h)) opts.RendererType = { v: 'RendererType', sec: 'config', name: 'pvr.rend', t: 'enum', d: String(enumVal(src('types.h'), 'OpenGL')) };

  // the settings screens
  for (const f of UI) {
    let t; try { t = compiled(src(f)); } catch { continue; }
    const arrays = {};
    for (const m of t.matchAll(/const char \*(\w+)\[\]\s*=\s*\{([^}]*)\}/g)) arrays[m[1]] = [...m[2].matchAll(/(?:T\()?"([^"]*)"|translateCtx\("[^"]*",\s*"([^"]*)"\)/g)].map((x) => x[1] ?? x[2]);
    const call = /Option(Checkbox|Slider|ArrowButtons|ComboBox|RadioButton)\(\s*(?:T\()?"([^"]+)"\)?,\s*config::(\w+)((?:[^;]|\n)*?)\);/g;
    for (const m of t.matchAll(call)) {
      const [, kind, label, v, rest] = m;
      const o = opts[v]; if (!o) continue;
      o.tab ||= TAB_OF[f];
      if (kind === 'RadioButton') {
        const r = /^\s*,\s*([\w-]+)\s*(?:,((?:.|\n)*))?$/.exec(rest);
        (o.radio ||= []).push([r[1], label, strOf(r[2])]);
        continue;
      }
      o.l ||= label;
      const parts = rest.replace(/^\s*,/, '');
      if (kind === 'Slider' || kind === 'ArrowButtons') {
        const r = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*(?:,((?:.|\n)*))?$/.exec(parts);
        if (r) { o.min = Number(r[1]); o.max = Number(r[2]); o.desc ||= strOf((r[3] || '').split(/,\s*"%/)[0]); }
      } else if (kind === 'ComboBox') {
        const r = /^\s*(\w+)\s*,\s*[^,]+,((?:.|\n)*)$/.exec(parts) || /^\s*(\w+)\s*,\s*[^,]+$/.exec(parts);
        if (r && arrays[r[1]]) { o.t = 'enum'; o.o = arrays[r[1]].map((x, i) => [String(i), x]); o.desc ||= strOf(r[2]); }
      } else o.desc ||= strOf(parts);
    }
  }
  // controls drawn by hand in the screens (not Option* helpers); values as the screen writes them
  const H = HAND(src);
  const out = [];
  for (const o of Object.values(opts)) {
    if (DROP.test(o.v)) continue;
    const e = { s: o.sec, k: o.sec + '.' + o.name, t: o.t, d: o.d, base: o.sec + '|' + o.name, l: o.l, desc: o.desc || undefined, tab: o.tab, min: o.min, max: o.max, o: o.o };
    if (o.radio) {
      if (o.t === 'bool') { e.l = o.radio.map((r) => r[1]).join(' or '); e.o = o.radio.map(([val, l]) => [val === 'true' ? 'yes' : 'no', l]); e.t = 'enum'; }
      else { e.t = 'enum'; e.o = o.radio.map(([val, l]) => [val, l]); }
      e.desc = o.radio.map((r) => r[1] + ': ' + (r[2] || '')).join(' ');
    }
    Object.assign(e, H[o.v] || {});
    if (e.t === 'bool') e.o = [['yes', 'On'], ['no', 'Off']];
    if (!e.l) e.l = o.name.replace(/^\w+\./, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    if (!e.tab) e.tab = TAB_GUESS(o);
    if (ADV.test(o.v) || ADV.test(o.name)) { e.adv = true; e.tab = 'Advanced'; }
    for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
    out.push(e);
  }
  return out;
}
function enumVal(types, name) { const m = new RegExp('enum class RenderType\\s*\\{[^}]*\\b' + name + '\\s*=\\s*(\\d+)').exec(types); return m ? Number(m[1]) : 0; }
// Not offered per game: paths, devices and ports, accounts and servers, UI, Android/virtual gamepad, the per-game VMU
// switch itself, debugger hooks
const DROP = /^(UILanguage|AudioBackend|AutoLatency|LogServer|DNS|NetworkServer|LocalPort|ISPUsername|Achievements(UserName|Token|HostUrl)|EnableAchievements|AchievementsHardcoreMode|VirtualGamepad\w*|MapleMainDevices|MapleExpansionDevices|NetworkExpansionDevices|PerGameVmu|UsePhysicalVmuMemory|CustomGpuDriver|FramePacing|GDB\w*|SerialPTY|OpenGlChecks|CrosshairColor|NaomiSatellite|MultiboardSlaves|NetworkEnable|ActAsServer|GGPOEnable|EmulateBBA|EnableUPnP|BattleCableEnable|UseDCNet|NetworkOutput)$|^rend\.CrossHairColor|^device/;
const ADV = /^(SerialConsole|Profiler\w*|Dump\w*Textures|DumpTextures|ShowFPS|ExtraDepthScale|MaxFilteredTextureSize|TranslucentPolygonDepthMask|UseMipmaps|MaxThreads|FastGDRomLoad|TextureUpscale|RenderToTextureBuffer|NativeDepthInterpolation|FixUpscaleBleedingEdge|DelayFrameSwapping)$|^(rend\.CrossHairColor|Debug\.|Profiler\.)/;
const TAB_GUESS = (o) => (/^(rend|pvr|ta)\./.test(o.name) ? 'Video' : /^aica\./.test(o.name) || o.sec === 'audio' ? 'Audio' : o.sec === 'network' ? 'Network' : o.sec === 'input' ? 'Controls' : /^Dreamcast\./.test(o.name) ? 'General' : 'Advanced');
// settings_video.cpp / settings_general.cpp / settings_audio.cpp draw these with ImGui directly
function HAND() {
  return {
    RendererType: { l: 'Graphics API and Transparent Sorting', t: 'enum', tab: 'Video', o: [['0', 'OpenGL'], ['3', 'OpenGL (Per Pixel)'], ['4', 'Vulkan'], ['5', 'Vulkan (Per Pixel)']], desc: 'Per Pixel sorting is slower but accurate. Per Triangle or Per Strip is chosen with Per Strip Sorting.' },
    PerStripSorting: { l: 'Per Strip Sorting', tab: 'Video', desc: 'With a non Per Pixel renderer: sort transparent polygons per strip (faster) instead of per triangle.' },
    RenderResolution: { l: 'Internal Resolution', t: 'enum', tab: 'Video', o: [0.5, 1, 1.5, 2, 2.5, 3, 4, 4.5, 5, 6, 7, 8, 9].map((s) => [String(s * 480), `${s * 640}x${s * 480} (${s === 0.5 ? 'Half' : s === 1 ? 'Native' : 'x' + s})`]), desc: 'Internal render resolution. Higher is better, but more demanding on the GPU.' },
    AnisotropicFiltering: { l: 'Anisotropic Filtering', t: 'enum', tab: 'Video', o: [['1', 'Disabled'], ['2', '2x'], ['4', '4x'], ['8', '8x'], ['16', '16x']], desc: 'Sharper textures at oblique angles; only mipmapped textures.' },
    PixelBufferSize: { l: 'Pixel Buffer Size', t: 'enum', tab: 'Video', o: [['536870912', '512 MB'], ['1073741824', '1 GB'], ['2147483648', '2 GB'], ['4294967296', '4 GB']], desc: 'Per Pixel renderers: may need to be increased when upscaling by a large factor.' },
    TextureFiltering: { l: 'Texture Filtering' },
    AutoSkipFrame: { l: 'Automatic Frame Skipping' },
    Cable: { l: 'Cable', t: 'enum', tab: 'General', o: [['0', 'VGA'], ['2', 'RGB Component'], ['3', 'TV Composite']], desc: 'Video connection type (1 also means VGA).' },
    DynarecEnabled: { l: 'CPU Mode' },
    Region: { t: 'enum', o: [['0', 'Japan'], ['1', 'USA'], ['2', 'Europe'], ['3', 'Default']], desc: 'BIOS region. Arcade games: 0 Japan, 1 USA, 2 Export, 3 Korea.' },
    AudioBufferSize: { l: 'Latency (samples)', tab: 'Audio', min: 529, max: 22579, desc: 'Maximum audio latency in samples at 44100 Hz (the screen shows 12 to 512 ms).' },
    AutoLoadState: { l: 'Automatic State: Load' },
    AutoSaveState: { l: 'Automatic State: Save' },
    TextureUpscale: { l: 'Texture Upscaling (xBRZ)', min: 1, max: 6 },
    SkipFrame: { l: 'Frame Skipping' },
    WidescreenGameHacks: { tab: 'Video' },
  };
}
module.exports = {
  id: 'flycast',
  files: [{ url: RAW + 'cfg/option.cpp', as: 'option.cpp' }, { url: RAW + 'cfg/option.h', as: 'option.h' }, { url: RAW + 'types.h', as: 'types.h' },
    ...UI.map((f) => ({ url: RAW + 'ui/' + f, as: f }))],
  read,
};
