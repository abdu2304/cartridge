// MAME's per-game settings: every core option (src/emu/emuopts.cpp), OSD option (src/osd/modules/lib/osdobj_common.cpp)
// and SDL option (src/osd/sdl/sdlopts.cpp) can be set in an ini; src/frontend/mame/mameopts.cpp reads mame.ini, then
// vertical/horizont.ini, <screen type>.ini, source/<driver source>.ini, grandparent, parent and finally <system>.ini
// (the game's own). Names from the #defines in emuopts.h, osdobj_common.h and sdlopts.h. Docs: docs/game-settings/mame.md
const fs = require('fs');
const path = require('path');
const RAW = 'https://raw.githubusercontent.com/mamedev/mame/master/src/';
// option list headers -> tabs
const TAB = [
  [/STATE\/PLAYBACK|CORE MISC/, 'General'], [/PERFORMANCE/, 'Performance'],
  [/RENDER|ARTWORK|OSD VIDEO|PER-WINDOW|FULL SCREEN|ACCELERATED|OpenGL|BGFX|SDL VIDEO/, 'Video'],
  [/ROTATION|CORE SCREEN/, 'Screen'], [/VECTOR/, 'Vector'], [/SOUND/, 'Audio'], [/INPUT/, 'Input'], [/DEBUGGING/, 'Advanced'],
];
// what a Linux SDL build compiles
const DEFINED = new Set(['OSD_SDL', 'SDLMAME_X11', 'SDLMAME_UNIX', 'USE_OPENGL']);
const truth = (l) => {
  let m = /^\s*#\s*ifdef\s+(\w+)/.exec(l); if (m) return DEFINED.has(m[1]);
  m = /^\s*#\s*ifndef\s+(\w+)/.exec(l); if (m) return !DEFINED.has(m[1]);
  const c = l.replace(/^\s*#\s*(el)?if\s*/, '').trim();
  if (/^\(?USE_OPENGL\)?$/.test(c) || /^!\s*defined\(OSD_WINDOWS\)\s*&&\s*!\s*defined\(SDLMAME_WIN32\)$/.test(c) || c === 'defined(OSD_SDL)') return true;
  return false;
};
function compiled(text) {
  const out = [], st = [];
  for (const line of text.split('\n')) {
    if (/^\s*#\s*if/.test(line)) { const v = truth(line); st.push({ on: v, taken: v }); continue; }
    if (/^\s*#\s*elif/.test(line)) { const f = st.at(-1); if (f) { const v = !f.taken && truth(line); f.on = v; f.taken ||= v; } continue; }
    if (/^\s*#\s*else/.test(line)) { const f = st.at(-1); if (f) { f.on = !f.taken; f.taken = true; } continue; }
    if (/^\s*#\s*endif/.test(line)) { st.pop(); continue; }
    if (st.every((f) => f.on)) out.push(line);
  }
  return out.join('\n');
}
// Not offered per game: paths and files, window and UI, devices and providers, networking, recording, scripting, HTTP
const DROP = /^(readconfig|writeconfig|state|playback|record|exit_after_playback|snapname|snapsize|snapview|snapbilinear|statename|burnin|seconds_to_run|fallback_artwork|override_artwork|artwork_font|ctrlr|joystick_map|ui_active|debugscript|uifont|ui|ui_mouse|confirm_quit|language|rtc|comm_\w+|autoboot_\w+|console|plugins?|noplugin|http\w*|uimodekey|background_input|debugger\w*|watchdog|bench|window|maximize|screen\d?|numscreens|glsl_shader_\w+|gl_pbo|gl_vbo|gl_notexturerect|midiprovider|networkprovider|bgfx_debug|attach_window|useallheads|keymap|enable_touch|sixaxis|audiodriver|videodriver|renderdriver|gl_lib|\w+provider|aspect\d|resolution\d|view\d)$/;
const ADV = /^(verbose|log|oslog|debug|debuglog|update_in_pause|drc\w*|numprocessors|sdlvideofps|gl_forcepow2texture|scalemode|steadykey|multikeyboard|multimouse)$/;
const DEVICE = [['none', 'None'], ['keyboard', 'Keyboard'], ['mouse', 'Mouse'], ['lightgun', 'Lightgun'], ['joystick', 'Joystick']];
// choices the option text lists or the OSD modules register on Linux (sdlopts.h SDLOPTVAL_*, sound modules)
const CHOICES = {
  video: [['auto', 'Automatic'], ['opengl', 'OpenGL'], ['bgfx', 'BGFX'], ['accel', 'SDL Accelerated'], ['soft', 'Software'], ['none', 'None']],
  sound: [['auto', 'Automatic'], ['sdl', 'SDL'], ['pipewire', 'PipeWire'], ['pulse', 'PulseAudio'], ['portaudio', 'PortAudio'], ['none', 'None']],
  bgfx_backend: [['auto', 'Automatic'], ['opengl', 'OpenGL'], ['vulkan', 'Vulkan'], ['gles', 'OpenGL ES']],
  gl_glsl_filter: [['0', 'Plain'], ['1', 'Bilinear'], ['2', 'Bicubic']],
  scalemode: [['none', 'None'], ['hwblit', 'hwblit'], ['hwbest', 'hwbest'], ['yv12', 'yv12'], ['yuy2', 'yuy2'], ['yv12x2', 'yv12x2'], ['yuy2x2', 'yuy2x2']],
};
const LABELS = { natural: 'Natural Keyboard', ror: 'Rotate Right', rol: 'Rotate Left', autoror: 'Auto Rotate Right', autorol: 'Auto Rotate Left', flipx: 'Flip X', flipy: 'Flip Y', drc: 'DRC', drc_rwx: 'DRC RWX', drc_use_c: 'DRC Use C', drc_log_uml: 'DRC Log UML', drc_log_native: 'DRC Log Native', nvram_save: 'Save NVRAM', gl_glsl: 'OpenGL GLSL', gl_glsl_filter: 'OpenGL GLSL Filter', gl_forcepow2texture: 'OpenGL Power of Two Textures', bgfx_backend: 'BGFX Backend', bgfx_vectorcrt: 'BGFX Vector CRT', bgfx_screen_chains: 'BGFX Screen Chains', bgfx_shadow_mask: 'BGFX Shadow Mask', bgfx_lut: 'BGFX LUT', intscalex: 'Integer Scale X', intscaley: 'Integer Scale Y', unevenstretchx: 'Uneven Stretch X', unevenstretchy: 'Uneven Stretch Y', autostretchxy: 'Auto Stretch XY', intoverscan: 'Integer Overscan', sdlvideofps: 'SDL Video FPS', waitvsync: 'Wait for VSync', syncrefresh: 'Sync to Refresh', coin_lockout: 'Coin Lockout', samplerate: 'Sample Rate', bios: 'BIOS', oslog: 'OS Log', keepaspect: 'Keep Aspect', unevenstretch: 'Uneven Stretch', autoframeskip: 'Auto Frameskip', refreshspeed: 'Refresh Speed', lowlatency: 'Low Latency', debuglog: 'Debug Log', skip_gameinfo: 'Skip Game Info', switchres: 'Switch Resolution', centerh: 'Centre Horizontally', centerv: 'Centre Vertically', scalemode: 'Scale Mode', numprocessors: 'Number of Processors', multikeyboard: 'Multiple Keyboards', multimouse: 'Multiple Mice', steadykey: 'Steady Key', adstick_device: 'Analog Stick Device', autosave: 'Auto Save State', cheat: 'Cheats', samples: 'External Samples' };
const human = (k) => LABELS[k] || k.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

function read(dir) {
  const src = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const defs = {};
  for (const f of ['emuopts.h', 'osdobj_common.h', 'sdlopts.h']) for (const m of src(f).matchAll(/#define\s+(\w+)\s+"([^"]*)"/g)) defs[m[1]] ??= m[2];
  const out = [], seen = new Set();
  for (const f of ['emuopts.cpp', 'osdobj_common.cpp', 'sdlopts.cpp']) {
    let tab = null;
    for (const line of compiled(src(f)).split('\n')) {
      // { NAME ";alias(min-max)", "default", core_options::option_type::TYPE, "description" },
      const m = /^\s*\{\s*(\w+)\s*((?:"[^"]*"\s*)*),\s*("[^"]*"|\w+)\s*,\s*core_options::option_type::(\w+)\s*,\s*"((?:[^"\\]|\\.)*)"/.exec(line);
      if (!m) continue;
      const [, ref, extra, def0, type, desc] = m;
      if (type === 'HEADER') { tab = (TAB.find(([rx]) => rx.test(desc)) || [, null])[1]; continue; }
      if (!tab || ref === 'nullptr' || !/^(BOOLEAN|INTEGER|FLOAT|STRING)$/.test(type)) continue;
      const spec = (defs[ref] ?? '') + [...extra.matchAll(/"([^"]*)"/g)].map((x) => x[1]).join('');
      const name = spec.split(/[;(]/)[0];
      if (!name || DROP.test(name) || seen.has(name)) continue;
      seen.add(name);
      const range = /\((-?[\d.]+)-(-?[\d.]+)\)/.exec(spec);
      const d = def0.startsWith('"') ? def0.slice(1, -1) : defs[def0] ?? null;
      const t = { BOOLEAN: 'bool', INTEGER: 'int', FLOAT: 'float', STRING: 'text' }[type];
      const e = { s: '', k: name, t, d, l: human(name), desc: desc.trim().replace(/: $/, ''), tab };
      if (t === 'bool') e.o = [['1', 'On'], ['0', 'Off']];
      if (range && (t === 'int' || t === 'float')) { e.min = Number(range[1]); e.max = Number(range[2]); }
      if (/_device$/.test(name)) { e.t = 'enum'; e.o = DEVICE; }
      if (CHOICES[name]) { e.t = 'enum'; e.o = CHOICES[name]; }
      if (ADV.test(name)) { e.adv = true; e.tab = 'Advanced'; }
      out.push(e);
    }
  }
  return out;
}
module.exports = {
  id: 'mame', versions: { git: 'https://github.com/mamedev/mame', tags: /^mame0\d{3}$/ }, /* 0.9.63: its last releases too (gen.js) */
  files: [
    { url: RAW + 'emu/emuopts.cpp', as: 'emuopts.cpp' }, { url: RAW + 'emu/emuopts.h', as: 'emuopts.h' },
    { url: RAW + 'osd/modules/lib/osdobj_common.cpp', as: 'osdobj_common.cpp' }, { url: RAW + 'osd/modules/lib/osdobj_common.h', as: 'osdobj_common.h' },
    { url: RAW + 'osd/sdl/sdlopts.cpp', as: 'sdlopts.cpp' }, { url: RAW + 'osd/sdl/sdlopts.h', as: 'sdlopts.h' },
    { url: RAW + 'frontend/mame/mameopts.cpp', as: 'mameopts.cpp' },
  ],
  read,
};
