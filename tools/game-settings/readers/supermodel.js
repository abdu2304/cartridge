// Supermodel's per-game settings: Src/OSD/SDL/Main.cpp DefaultConfig() (every setting, its default, its group =
// the config GUI's tab in Src/OSD/SDL/Gui.cpp, min/max and allowed values) and Help() (descriptions through the
// command-line option table). Supermodel.ini: [ Global ] then [ <romset> ] sections merged over it (Main.cpp
// MergeINISections). Docs: docs/game-settings/supermodel.md
const fs = require('fs');
const path = require('path');
const RAW = 'https://raw.githubusercontent.com/trzy/Supermodel/master/Src/';
// DefaultConfig() groups -> tabs (Gui.cpp: Core, Video, Audio = "Sound", Networking, Misc, ForceFeedback, Sensitivity)
const TAB = { Core: 'Core', Legacy3D: 'Video', Video: 'Video', Sound: 'Audio', Network: 'Network', Misc: 'Advanced', ForceFeedback: 'Force Feedback', Sensitivity: 'Sensitivity' };
// Not offered per game: files, window placement, the input system and mappings (Input group), ports and addresses,
// Outputs (README: "Can only be set in the 'Global' section"), logging
const DROP = /^(GameXMLFile|InitStateFile|VertexShader|FragmentShader|FullScreen|BorderlessWindow|WindowXPosition|WindowYPosition|InputSystem|PortIn|PortOut|AddressOut|Outputs\w*|LogOutput|LogLevel)$/;
const ADV = /^(DumpMemory|DumpTextures|ShowFrameRate|MultiTexture|LegacySoundDSP)$/;
const LABELS = { PowerPCFrequency: 'PowerPC Frequency (MHz)', GPUMultiThreaded: 'GPU Multi-threaded', MultiThreaded: 'Multi-threaded', New3DEngine: 'New 3D Engine', XResolution: 'Width', YResolution: 'Height', CRTcolors: 'CRT Colours', UpscaleMode: '2D Upscale Mode', WideScreen: 'Widescreen', WideBackground: 'Wide Background', VSync: 'VSync', NbSoundChannels: 'Sound Channels', SoundFreq: 'Sound Frequency (Hz)', EmulateDSB: 'Digital Sound Board (Music)', EmulateSound: 'Sound Board (Effects)', LegacySoundDSP: 'Legacy SCSP Engine', NoWhiteFlash: 'No White Flash', SimulateNet: 'Simulate Net Board', Network: 'Net Board', SDLConstForceMax: 'Constant Force Max', SDLSelfCenterMax: 'Self Centre Max', SDLFrictionMax: 'Friction Max', SDLVibrateMax: 'Vibration Max', SDLConstForceThreshold: 'Constant Force Threshold', InputMouseXDeadZone: 'Mouse X Dead Zone', InputMouseYDeadZone: 'Mouse Y Dead Zone', InputMouseZDeadZone: 'Mouse Z Dead Zone', BalanceLeftRight: 'Balance Left/Right', BalanceFrontRear: 'Balance Front/Rear', EmulateSound: 'Sound Board (Effects)' };
// labels for the allowed values (Help(): "-crosshairs=<n> 0=none, 1=P1 only, 2=P2 only, 3=P1 & P2" and so on)
const NAMES = {
  Crosshairs: { 0: 'None', 1: 'Player 1', 2: 'Player 2', 3: 'Players 1 and 2' },
  NbSoundChannels: { 1: 'Mono', 2: 'Stereo', 4: 'Quad' },
  CrosshairStyle: { vector: 'Vector', bmp: 'Bitmap' },
  // README.txt -crtcolors and -upscalemode
  CRTcolors: { 0: 'None', 1: 'ARI/D93 (Japanese games)', 2: 'PVM_20M2U/D93', 3: 'BT601_525/D93', 4: 'BT601_525/D65 (US games)', 5: 'BT601_625/D65 (European games)' },
  UpscaleMode: { 0: 'None (sharp pixels)', 1: 'Biquintic', 2: 'Bilinear', 3: 'Bicubic' },
};
const human = (k) => LABELS[k] || k.replace(/^Input/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
function compiled(text) {
  const out = [], st = [];
  for (const line of text.split('\n')) {
    let m;
    if ((m = /^\s*#\s*ifdef\s+(\w+)/.exec(line))) { st.push({ on: false, taken: false }); continue; } // SUPERMODEL_WIN32 / _OSX
    if ((m = /^\s*#\s*ifndef\s+(\w+)/.exec(line))) { st.push({ on: true, taken: true }); continue; }
    if (/^\s*#\s*if\b/.test(line)) { st.push({ on: false, taken: false }); continue; }
    if (/^\s*#\s*else/.test(line)) { const f = st.at(-1); if (f) { f.on = !f.taken; f.taken = true; } continue; }
    if (/^\s*#\s*endif/.test(line)) { st.pop(); continue; }
    if (st.every((f) => f.on)) out.push(line);
  }
  return out.join('\n');
}
const num = (v) => String(Number(String(v).trim().replace(/[uUfF]$/, '').replace(/\.$/, '')));

function read(dir) {
  const src = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const main = compiled(src('Main.cpp'));
  const defs = {};
  for (const m of src('InputSystem.h').matchAll(/#define\s+(DEFAULT_\w+)\s+(-?\d+)/g)) defs[m[1]] = m[2];
  // Help(): "-option ... text" and its continuation lines; option -> key from the two command-line tables
  const help = {};
  let cur = null;
  for (const m of main.matchAll(/puts\("(.*)"\);/g)) {
    const h = /^ {2}(-[\w-]+)(?:=<[^>]*>|,<[^>]*>)*\s{2,}(.*)$/.exec(m[1]);
    if (h) { cur = h[1]; help[cur] = h[2].trim(); continue; }
    const c = /^ {20,}(\S.*)$/.exec(m[1]);
    if (c && cur) help[cur] += ' ' + c[1].trim(); else cur = null;
  }
  const keyHelp = {};
  for (const m of main.matchAll(/\{\s*"(-[\w-]+)",\s*(?:\{\s*)?"(\w+)"(?:,\s*(true|false)\s*\})?\s*\}/g)) {
    if (!help[m[1]]) continue;
    (keyHelp[m[2]] ||= []).push(m[3] === 'false' ? '' : help[m[1]]);
  }
  for (const k in keyHelp) keyHelp[k] = keyHelp[k].filter(Boolean)[0] || null;
  Object.assign(keyHelp, { XResolution: help['-res'], YResolution: help['-res'], Supersampling: help['-ss'], UpscaleMode: help['-upscalemode'], CRTcolors: help['-crtcolors'], RefreshRate: help['-true-hz'] && 'Refresh rate in Hz; the real Model 3 runs at 57.524.', BalanceFrontRear: help['-balance'], Balance: null, MultiThreaded: help['-no-threads'] && 'Run emulation on several threads (off: everything in one thread).', Throttle: help['-no-throttle'] && 'Lock the frame rate (off: run as fast as possible).', EmulateSound: help['-no-sound'] && 'Emulate the sound board (sound effects).', EmulateDSB: help['-no-dsb'] && 'Emulate the Digital Sound Board (MPEG music).' });

  const body = /Util::Config::Node DefaultConfig\(\)\s*\{([\s\S]*?)\n\}/.exec(main)[1];
  const out = [], seen = new Set();
  // config.Set[<T>]("Key", default, "Group"[, min, max[, { choices }]]);
  for (const m of body.matchAll(/config\.Set(?:<([\w: ]+)>)?\("(\w+)",\s*([^,]+?),\s*"(\w+)"\s*(?:,\s*([^,]+?)\s*,\s*([^,]+?)\s*)?(?:,\s*\{([^}]*)\})?\s*\);/g)) {
    const [, tp, key, def0, group, min, max, list] = m;
    if (seen.has(key) || DROP.test(key) || group === 'Input') continue;
    seen.add(key);
    let d = defs[def0.trim()] ?? def0.trim().replace(/^int\((.*)\)$/, '$1').replace(/^unsigned\((.*)\)$/, '$1');
    let t;
    if (tp === 'bool' || /^(true|false)$/.test(d)) { t = 'bool'; d = d === 'true' ? '1' : '0'; }
    else if (tp === 'std::string' || /^"/.test(d)) { t = 'text'; d = d.replace(/^"|"$/g, ''); }
    else if (/[.fF]/.test(d) && !/^\d+u$/.test(d)) { t = 'float'; d = num(d); }
    else { t = 'int'; d = num(d); }
    const e = { s: '', k: key, t, d, base: 'Global|' + key, l: human(key), desc: keyHelp[key] || undefined, tab: TAB[group] || group };
    if (t === 'bool') e.o = [['1', 'On'], ['0', 'Off']];
    const lo = min && !/^""$/.test(min) ? Number(min.replace(/[uUfF]$/, '')) : null, hi = max && !/^""$/.test(max) ? Number(max.replace(/[uUfF]$/, '')) : null;
    if ((t === 'int' || t === 'float') && lo != null && hi != null && !(lo === 0 && hi === 0)) { e.min = lo; e.max = hi; }
    const vals = list ? [...list.matchAll(/"([^"]*)"|(-?[\d.]+)[fF]?/g)].map((x) => x[1] ?? num(x[2])) : null;
    if (vals && vals.length && t !== 'float') { e.t = 'enum'; e.o = vals.map((v) => [v, (NAMES[key] || {})[v] || v]); }
    else if (vals && vals.length) e.desc = (e.desc ? e.desc + ' ' : '') + 'Usual values: ' + vals.join(', ') + '.';
    if (key === 'PowerPCFrequency') e.desc = (e.desc || '') + ' 0 = the game\'s own (varies by board stepping).';
    if (ADV.test(key)) { e.adv = true; e.tab = 'Advanced'; }
    for (const x of Object.keys(e)) if (e[x] === undefined) delete e[x];
    out.push(e);
  }
  return out;
}
module.exports = {
  id: 'supermodel',
  files: [{ url: RAW + 'OSD/SDL/Main.cpp', as: 'Main.cpp' }, { url: RAW + 'Inputs/InputSystem.h', as: 'InputSystem.h' }, { url: RAW + 'OSD/SDL/Gui.cpp', as: 'Gui.cpp' }, { url: RAW + 'Util/ConfigBuilders.cpp', as: 'ConfigBuilders.cpp' }],
  read,
};
