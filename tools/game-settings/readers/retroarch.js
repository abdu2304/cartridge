// RetroArch's per-game overrides: <config dir>/config/<core library_name>/<content name>.cfg, key = "value" lines
// (configuration.c config_load_override: core, then content folder, then game file, each laid over retroarch.cfg and
// the whole config read again). Read from a release tag (master is moving to settings/settings_def_*.h, same keys):
// configuration.c (SETTING_* tables: key, type, default macro), config.def.h (defaults), intl/msg_hash_lbl.h (key ->
// menu enum), intl/msg_hash_us.h (names and descriptions), menu/menu_setting.c (ranges and the menu's choice names).
// Only settings that make sense for one game (no paths, drivers, accounts, menu looks or binds). Docs: docs/game-settings/retroarch.md
const fs = require('fs');
const path = require('path');
const TAG = 'v1.22.2';
const RAW = `https://raw.githubusercontent.com/libretro/RetroArch/${TAG}/`;

// what Cartridge offers per game, tab by tab ('!' = advanced). Order is the order shown.
const PICK = {
  Video: 'aspect_ratio_index video_scale_integer video_scale_integer_scaling video_smooth video_crop_overscan video_shader_enable video_rotation video_allow_rotate'
    + ' !video_scale_integer_axis !video_aspect_ratio !custom_viewport_width !custom_viewport_height !custom_viewport_x !custom_viewport_y'
    + ' !video_viewport_bias_x !video_viewport_bias_y !screen_orientation !video_ctx_scaling !video_threaded',
  Sync: 'video_vsync video_swap_interval video_adaptive_vsync video_hard_sync video_hard_sync_frames !video_max_swapchain_images !video_black_frame_insertion !video_bfi_dark_frames !video_shader_subframes !video_scan_subframes !video_refresh_rate',
  Latency: 'run_ahead_enabled run_ahead_frames run_ahead_secondary_instance preemptive_frames_enable video_frame_delay video_frame_delay_auto input_poll_type_behavior !run_ahead_hide_warnings !input_block_timeout',
  'Frame Throttle': 'vrr_runloop_enable fastforward_ratio fastforward_frameskip slowmotion_ratio',
  Rewind: 'rewind_enable rewind_granularity !rewind_buffer_size !rewind_buffer_size_step',
  Audio: 'audio_volume audio_mute_enable audio_sync audio_fastforward_mute audio_fastforward_speedup audio_rewind_mute !audio_enable !audio_latency !audio_rate_control_delta !audio_max_timing_skew !audio_resampler_quality !audio_out_rate',
  Saves: 'savestate_auto_save savestate_auto_load autosave_interval block_sram_overwrite !savestate_auto_index !savestate_max_keep',
  Input: '!input_analog_deadzone !input_analog_sensitivity',
};

// settings whose menu entry isn't found from the config table: the menu enum they're shown under. The three run-ahead
// keys are one menu row, Run-Ahead (Off / Single Instance / Second Instance / Preemptive Frames), in menu_setting.c.
const ENUM_OF = {
  run_ahead_enabled: 'RUNAHEAD_MODE', run_ahead_secondary_instance: 'RUNAHEAD_MODE_SECOND_INSTANCE', preemptive_frames_enable: 'RUNAHEAD_MODE_PREEMPTIVE_FRAMES',
  custom_viewport_x: 'VIDEO_VIEWPORT_CUSTOM_X', custom_viewport_y: 'VIDEO_VIEWPORT_CUSTOM_Y', custom_viewport_width: 'VIDEO_VIEWPORT_CUSTOM_WIDTH', custom_viewport_height: 'VIDEO_VIEWPORT_CUSTOM_HEIGHT',
  audio_mute_enable: 'AUDIO_MUTE', video_threaded: 'VIDEO_THREADED', audio_rate_control_delta: 'AUDIO_RATE_CONTROL_DELTA',
};

// a Linux desktop build: platform macros are off, HAVE_* features on
const OFF = /^(ANDROID|IOS|_WIN32|_WIN64|_XBOX\w*|__APPLE__|__MACH__|OSX|__PS3__|__PSL1GHT__|__CELLOS_LV2__|PSP|VITA|SN_TARGET_PSP2|_3DS|GEKKO|HW_RVL|WIIU|SWITCH|HAVE_LIBNX|ORBIS|PS2|EMSCRIPTEN|DINGUX\w*|RETROFW|MIYOO|WEBOS|RARCH_CONSOLE|RARCH_MOBILE|__WINRT__|_MSC_VER|HAVE_ODROIDGO2|__QNX__|__HAIKU__|DJGPP|TARGET_OS_\w+|HAVE_COCOA\w*|HAVE_METAL|HAVE_D3D\w*|XENON|HAVE_STEAM|__WIN32__|_WIN32_WINNT|HAVE_RPI|ANDROID_\w+|HAVE_CG|HAVE_DYLIB_NONE)$/;
function cond(expr) {
  const js = expr.replace(/\/\*.*?\*\/|\/\/.*$/g, '').replace(/defined\s*\(?\s*(\w+)\s*\)?/g, (_, n) => (OFF.test(n) ? '0' : '1'))
    .replace(/\b[A-Za-z_]\w*\b/g, (n) => (OFF.test(n) ? '0' : '0'));
  try { return !!Function(`return (${js})`)(); } catch { return false; }
}
// #define NAME value, with #if/#ifdef/#elif/#else followed for a Linux build
function defines(text, into = {}) {
  const stack = []; // { on, taken, parent }
  const live = () => stack.every((s) => s.on);
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    let m;
    if ((m = /^#\s*ifdef\s+(\w+)/.exec(line))) { const on = !OFF.test(m[1]); stack.push({ on, taken: on }); continue; }
    if ((m = /^#\s*ifndef\s+(\w+)/.exec(line))) { const on = OFF.test(m[1]) || !(m[1] in into); stack.push({ on, taken: on }); continue; }
    if ((m = /^#\s*if\s+(.*)/.exec(line))) { const on = cond(m[1]); stack.push({ on, taken: on }); continue; }
    if ((m = /^#\s*elif\s+(.*)/.exec(line))) { const s = stack[stack.length - 1]; if (s) { s.on = !s.taken && cond(m[1]); s.taken ||= s.on; } continue; }
    if (/^#\s*else/.test(line)) { const s = stack[stack.length - 1]; if (s) { s.on = !s.taken; s.taken = true; } continue; }
    if (/^#\s*endif/.test(line)) { stack.pop(); continue; }
    if (!live()) continue;
    if ((m = /^#\s*define\s+(\w+)\s+(.+?)\s*(\/\*.*|\/\/.*)?$/.exec(line))) into[m[1]] = m[2];
  }
  return into;
}
// enum { A = 0, B, C } -> { A: 0, B: 1, C: 2 }
function enums(text, into = {}) {
  for (const m of text.matchAll(/enum\s*\w*\s*\{([^}]*)\}/g)) {
    let n = -1;
    for (const part of m[1].replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').split(',')) {
      const e = /^\s*(\w+)\s*(?:=\s*([^,]+))?\s*$/.exec(part);
      if (!e) continue;
      n = e[2] != null ? (/^-?\d+$/.test(e[2].trim()) ? Number(e[2]) : e[2].trim() in into ? into[e[2].trim()] : n + 1) : n + 1;
      into[e[1]] = n;
    }
  }
  return into;
}
// MSG_HASH(NAME, "text" "more") -> { NAME: 'textmore' }
function msgs(text) {
  const out = {};
  for (const m of text.matchAll(/MSG_HASH\(\s*(\w+)\s*,\s*((?:"(?:[^"\\]|\\.)*"\s*)+)\)/g)) {
    if (m[1] in out) continue;
    out[m[1]] = [...m[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]).join('').replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\s+/g, ' ').trim();
  }
  return out;
}

function read(dir) {
  const src = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const conf = src('configuration.c');
  const defs = defines(src('config.def.h'));
  const E = {};
  for (const f of ['video_defines.h', 'audio_resampler.h', 'menu_defines.h']) { try { enums(src(f), E); } catch {} }
  for (const f of ['runahead.h', 'retroarch_types.h', 'runloop.h']) { try { defines(src(f), defs); } catch {} }
  const lbl = msgs(src('msg_hash_lbl.h')); // MENU_ENUM_LABEL_X -> key
  const us = msgs(src('msg_hash_us.h'));
  const enumOfKey = {};
  for (const [k, v] of Object.entries(lbl)) if (k.startsWith('MENU_ENUM_LABEL_') && !(v in enumOfKey)) enumOfKey[v] = k.slice(16);
  // a macro or expression -> number/bool, or null when it's worked out at run time
  const value = (x, depth = 0) => {
    x = String(x).trim().replace(/\/\*.*?\*\//g, '').trim();
    if (depth > 8) return null;
    if (/^(true|false)$/.test(x)) return x === 'true';
    if (x in E) return E[x];
    if (x in defs) return value(defs[x], depth + 1);
    const js = x.replace(/\b(\d+(?:\.\d*)?)[fFuUlL]+\b/g, '$1').replace(/\b[A-Za-z_]\w*\b/g, (n) => (n in E ? E[n] : n in defs ? `(${value(defs[n], depth + 1)})` : 'NaN'));
    if (!/^[\d\s.()+\-*/<>|&?:eNa]+$/.test(js)) return null;
    try { const v = Function(`return (${js})`)(); return Number.isFinite(v) ? v : null; } catch { return null; }
  };
  // the config tables
  const settings = {};
  for (const m of conf.matchAll(/SETTING_(BOOL|INT|UINT|FLOAT|SIZE)\(\s*"(\w+)"\s*,\s*([^,]+?)\s*,\s*(true|false)\s*,\s*([^,]+?)\s*,/g)) {
    const [, kind, key, ptr, defOn, def] = m;
    const member = (/settings->([\w.]+)/.exec(ptr) || [])[1] || null; // some point through audio_get_bool_ptr() and the like
    if (settings[key]) continue;
    settings[key] = { kind, member, def: defOn === 'true' ? def : null };
  }
  // the menu: CONFIG_<kind>(list, list_info, &settings->x.member, MENU_ENUM_LABEL_X, ...) then its range and choice names
  const menu = src('menu_setting.c');
  const blocks = {};
  const starts = [...menu.matchAll(/CONFIG_(?:BOOL|INT|UINT|FLOAT|SIZE)\(\s*list,\s*list_info,\s*&settings->([\w.]+)\s*,\s*MENU_ENUM_LABEL_(\w+)/g)];
  starts.forEach((m, i) => {
    if (blocks[m[1]]) return;
    const body = menu.slice(m.index, starts[i + 1] ? starts[i + 1].index : m.index + 3000);
    const r = /menu_settings_list_current_add_range\(\s*list,\s*list_info,\s*([^,]+),\s*([^,]+),/.exec(body);
    const rep = /get_string_representation\s*=\s*&?\s*(\w+)/.exec(body);
    const off = /offset_by\s*=\s*(-?\d+)/.exec(body);
    blocks[m[1]] = { label: m[2], min: r ? value(r[1]) : null, max: r ? value(r[2]) : null, rep: rep && rep[1], off: off ? Number(off[1]) : 0 };
  });
  // choice names from a representation function: case NAME: ... msg_hash_to_str(X) or "literal"
  const choices = (fn) => {
    const at = menu.search(new RegExp(`static\\s+\\w+\\s+${fn}\\s*\\(`));
    if (at < 0) return null;
    const body = menu.slice(at, menu.indexOf('\n}', at));
    const out = [];
    for (const c of body.split(/\bcase\s+/).slice(1)) {
      const n = /^(\w+)\s*:/.exec(c); if (!n) continue;
      const v = /^\d+$/.test(n[1]) ? Number(n[1]) : E[n[1]];
      const t = /msg_hash_to_str\(\s*(\w+)\s*\)/.exec(c) || /strlcpy\(\s*s\s*,\s*"([^"]+)"/.exec(c);
      if (v == null || !t) continue;
      out.push([String(v), us[t[1]] || t[1]]);
    }
    return out.length ? out.sort((a, b) => a[0] - b[0]) : null;
  };
  // aspect_ratio_index names: aspectratio_lut in gfx/video_driver.c, the last five named at run time from these labels
  let aspect = null;
  try {
    const lut = /aspectratio_lut\[ASPECT_RATIO_END\]\s*=\s*\{([\s\S]*?)\n\};/.exec(src('video_driver.c'))[1];
    const names = [...lut.matchAll(/\{[^"]*"([^"]*)"\s*\}/g)].map((x) => x[1]);
    const late = { ASPECT_RATIO_CONFIG: 'VIDEO_ASPECT_RATIO_CONFIG', ASPECT_RATIO_SQUARE: 'VIDEO_ASPECT_RATIO_SQUARE_PIXEL', ASPECT_RATIO_CORE: 'VIDEO_ASPECT_RATIO_CORE_PROVIDED', ASPECT_RATIO_CUSTOM: 'VIDEO_ASPECT_RATIO_CUSTOM', ASPECT_RATIO_FULL: 'VIDEO_ASPECT_RATIO_FULL' };
    for (const [e, l] of Object.entries(late)) names[E[e]] = (us['MENU_ENUM_LABEL_VALUE_' + l] || l).replace(/\s*\(%u:%u\)|\s*\(%[^)]*\)/, '');
    aspect = names.map((n, i) => [String(i), n]).filter((x) => x[1]);
  } catch {}

  const out = [];
  for (const [tab, list] of Object.entries(PICK)) {
    for (const w of list.split(/\s+/)) {
      const adv = w.startsWith('!'), key = w.replace(/^!/, '');
      const s = settings[key];
      if (!s) { console.error('retroarch: no setting', key); continue; }
      const b = blocks[s.member] || {};
      const en = ENUM_OF[key] || b.label || enumOfKey[key];
      const t0 = s.kind === 'BOOL' ? 'bool' : s.kind === 'FLOAT' ? 'float' : 'int';
      let d = s.def != null ? value(s.def) : null;
      const e = { s: '', k: key, t: t0, d: null };
      let o = key === 'aspect_ratio_index' ? aspect : b.rep ? choices(b.rep) : null;
      if (o && b.min != null && b.max != null) o = o.filter(([v]) => v >= b.min && v <= b.max);
      if (t0 === 'bool') { e.o = [['true', 'On'], ['false', 'Off']]; if (d != null) e.d = d ? 'true' : 'false'; }
      else if (o && o.length > 1) { e.t = 'enum'; e.o = o; if (d != null) e.d = String(d); }
      else {
        if (d != null) e.d = t0 === 'float' ? Number(d).toFixed(6) : String(Math.round(d));
        // a range of 0..0 (or max under min) means no limit the menu enforces
        if (b.min != null && !(b.min === 0 && b.max === 0)) e.min = b.min;
        if (b.max != null && b.max > b.min) e.max = b.max;
      }
      e.l = us['MENU_ENUM_LABEL_VALUE_' + en] || key;
      const desc = us['MENU_ENUM_SUBLABEL_' + en];
      if (desc) e.desc = desc;
      e.tab = adv ? 'Advanced' : tab;
      if (adv) e.adv = true;
      out.push(e);
    }
  }
  return out;
}

module.exports = {
  id: 'retroarch',
  files: [
    ['configuration.c'], ['config.def.h'], ['intl/msg_hash_lbl.h'], ['intl/msg_hash_us.h'], ['menu/menu_setting.c'], ['menu/menu_defines.h'],
    ['gfx/video_driver.c'], ['gfx/video_defines.h'], ['libretro-common/include/audio/audio_resampler.h'], ['runahead.h'], ['retroarch_types.h'], ['runloop.h'],
  ].map(([f]) => ({ url: RAW + f, as: path.basename(f) })),
  read,
};
