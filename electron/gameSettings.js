// Per-game emulator settings from Cartridge (0.9.23, owner: edit a game's settings from its page, the
// way the emulator's own per-game settings work). Each emulator keeps a per-game file layered over its
// normal settings; Cartridge writes only that file, only the keys you change, and "Emulator's own" takes
// a key out again. Formats and keys read from each emulator's source:
// - RPCS3: config/custom_configs/config_<SERIAL>.yml, applied over its config.yml (Emu/System.cpp);
//   keys from Emu/system_config.h, values as system_config_types.cpp names them
// - PCSX2: gamesettings/<SERIAL>_<CRC>.ini (VMManager::GetGameSettingsPath), layered over PCSX2.ini;
//   keys from Pcsx2Config.cpp ([EmuCore/GS] Renderer, upscale_multiplier; [EmuCore] ...)
// - DuckStation: <data>/gamesettings/<SERIAL>.ini (System::GetGameSettingsPath); keys from settings.cpp
// - Dolphin: <user>/GameSettings/<ID6>.ini; sections Video_Settings/Video_Enhancements/Core map onto
//   GFX.ini/Dolphin.ini (ConfigLoaders/GameConfigLoader.cpp); keys from Config/GraphicsSettings.cpp
// - PPSSPP: PSP/SYSTEM/<GAMEID>_ppsspp.ini (Util/PathUtil.cpp GetGameConfigFilePath); a game file is a
//   full copy of the settings (PPSSPP makes it that way), so a new one starts as a copy of ppsspp.ini
// - shadPS4: <user>/custom_configs/<SERIAL>.json, group "GPU" overrides (core/emulator_settings.cpp)
const fs = require('fs');
const path = require('path');

const B = (on, off) => ({ type: 'bool', on, off });
const SCHEMA = {
  rpcs3: { name: 'RPCS3', items: [
    { id: 'Video.Renderer', label: 'Renderer', options: ['Vulkan', 'OpenGL'] },
    { id: 'Video.Resolution Scale', label: 'Resolution', options: [['100', '720p (native)'], ['150', '1080p'], ['200', '1440p'], ['300', '4K']] },
    { id: 'Video.Frame limit', label: 'Frame limit', options: ['Auto', 'Off', '30', '60', 'PS3 Native'] },
    { id: 'Video.Shader Mode', label: 'Shaders', options: [['Async Recompiler with Shader Interpreter', 'Async with interpreter'], ['Async Recompiler (multi-threaded)', 'Async'], ['Legacy Recompiler (single-threaded)', 'Legacy']] },
    { id: 'Video.Anisotropic Filter Override', label: 'Anisotropic filtering', options: [['0', 'Auto'], '2', '4', '8', '16'] },
    { id: 'Video.Write Color Buffers', label: 'Write color buffers', sub: 'Fixes some games’ effects, slower', ...B('true', 'false') },
    { id: 'Video.Strict Rendering Mode', label: 'Strict rendering', sub: 'More accurate, slower', ...B('true', 'false') },
    { id: 'Core.SPU Block Size', label: 'SPU block size', options: ['Safe', 'Mega', 'Giga'] },
    { id: 'Core.Preferred SPU Threads', label: 'Preferred SPU threads', options: [['0', 'Auto'], '1', '2', '3', '4', '5', '6'] },
  ] },
  pcsx2: { name: 'PCSX2', items: [
    { id: 'EmuCore/GS.Renderer', label: 'Renderer', options: [['-1', 'Automatic'], ['14', 'Vulkan'], ['12', 'OpenGL'], ['13', 'Software']] },
    { id: 'EmuCore/GS.upscale_multiplier', label: 'Resolution', options: [['1', 'Native'], ['2', '2x (720p)'], ['3', '3x (1080p)'], ['4', '4x (1440p)'], ['6', '6x (4K)']] },
    { id: 'EmuCore.EnableWideScreenPatches', label: 'Widescreen patches', ...B('true', 'false') },
    { id: 'EmuCore.EnableNoInterlacingPatches', label: 'No-interlacing patches', ...B('true', 'false') },
    { id: 'EmuCore/Speedhacks.EECycleRate', label: 'EE cycle rate', sub: 'Underclock or overclock the PS2’s CPU', options: [['-3', '50%'], ['-2', '60%'], ['-1', '75%'], ['0', '100%'], ['1', '130%'], ['2', '180%'], ['3', '300%']] },
    { id: 'EmuCore/Speedhacks.EECycleSkip', label: 'EE cycle skip', options: [['0', 'Off'], ['1', 'Mild'], ['2', 'Moderate'], ['3', 'Maximum']] },
  ] },
  duckstation: { name: 'DuckStation', items: [
    { id: 'GPU.Renderer', label: 'Renderer', options: ['Automatic', 'Vulkan', 'OpenGL', 'Software'] },
    { id: 'GPU.ResolutionScale', label: 'Resolution', options: [['1', 'Native'], ['3', '3x (720p)'], ['4', '4x (1080p)'], ['6', '6x (1440p)'], ['9', '9x (4K)']] },
    { id: 'GPU.TextureFilter', label: 'Texture filtering', options: ['Nearest', 'Bilinear', 'JINC2', 'xBR'] },
    { id: 'GPU.WidescreenHack', label: 'Widescreen', ...B('true', 'false') },
    { id: 'GPU.PGXPEnable', label: 'PGXP geometry correction', sub: 'Less wobbly 3D', ...B('true', 'false') },
  ] },
  dolphin: { name: 'Dolphin', items: [
    { id: 'Video_Settings.InternalResolution', label: 'Resolution', options: [['1', 'Native'], ['2', '2x (720p)'], ['3', '3x (1080p)'], ['4', '4x (1440p)'], ['6', '6x (4K)']] },
    { id: 'Video_Settings.AspectRatio', label: 'Aspect ratio', options: [['0', 'Auto'], ['1', 'Force 16:9'], ['2', 'Force 4:3'], ['3', 'Stretch']] },
    { id: 'Video_Settings.wideScreenHack', label: 'Widescreen hack', ...B('True', 'False') },
    { id: 'Video_Enhancements.MaxAnisotropy', label: 'Anisotropic filtering', options: [['0', '1x'], ['1', '2x'], ['2', '4x'], ['3', '8x'], ['4', '16x']] },
    { id: 'Core.CPUThread', label: 'Dual core', sub: 'Faster; turn off if the game is unstable', ...B('True', 'False') },
  ] },
  ppsspp: { name: 'PPSSPP', items: [
    { id: 'Graphics.InternalResolution', label: 'Resolution', options: [['0', 'Auto'], ['1', 'Native'], ['2', '2x'], ['3', '3x (720p)'], ['4', '4x (1080p)'], ['6', '6x (1440p)'], ['8', '8x (4K)']] },
    { id: 'Graphics.FrameSkip', label: 'Frame skip', options: [['0', 'Off'], '1', '2', '3'] },
    { id: 'Graphics.AnisotropyLevel', label: 'Anisotropic filtering', options: [['0', 'Off'], ['1', '2x'], ['2', '4x'], ['3', '8x'], ['4', '16x']] },
    { id: 'Graphics.TexScalingLevel', label: 'Texture upscaling', options: [['1', 'Off'], ['2', '2x'], ['3', '3x'], ['4', '4x'], ['5', '5x']] },
  ] },
  // shadPS4 (0.9.24, owner: advanced options too, in tabs): every key from core/emulator_settings.h, groups
  // GPU, Vulkan and General as its per-game JSON has them (ApplyGroupOverrides)
  shadps4: { name: 'shadPS4', items: [
    { id: 'GPU.readbacks_mode', tab: 'Graphics', label: 'GPU readbacks', sub: 'Some games need them; slower', options: [['0', 'Off'], ['1', 'Relaxed'], ['2', 'Precise']], json: 'int' },
    { id: 'GPU.fsr_enabled', tab: 'Graphics', label: 'FSR upscaling', ...B('true', 'false'), json: 'bool' },
    { id: 'GPU.rcas_enabled', tab: 'Graphics', label: 'RCAS sharpening', ...B('true', 'false'), json: 'bool' },
    { id: 'GPU.rcas_attenuation', tab: 'Graphics', label: 'Sharpening strength', sub: 'Lower is sharper', options: [['0', 'Strongest'], ['250', 'Normal'], ['500', 'Softer'], ['1000', 'Softest']], json: 'int', num: { min: 0, max: 3000 } },
    { id: 'GPU.vblank_frequency', tab: 'Graphics', label: 'VBlank frequency', sub: 'Game speed; 60 is normal', options: [['60', '60 Hz'], ['120', '120 Hz'], ['30', '30 Hz']], json: 'int', num: { min: 10, max: 480, unit: 'Hz' } },
    // 0.9.29 (owner: the settings shadPS4 takes as a number, typed in): window_width/height are per-game overrides
    { id: 'GPU.window_width', tab: 'Graphics', label: 'Window width', sub: 'Pixels', options: [['1280', '1280'], ['1920', '1920'], ['2560', '2560'], ['3840', '3840']], json: 'int', num: { min: 320, max: 7680, unit: 'px' } },
    { id: 'GPU.window_height', tab: 'Graphics', label: 'Window height', sub: 'Pixels', options: [['720', '720'], ['800', '800'], ['1080', '1080'], ['1440', '1440'], ['2160', '2160']], json: 'int', num: { min: 240, max: 4320, unit: 'px' } },
    { id: 'GPU.present_mode', tab: 'Graphics', label: 'Presentation', sub: 'Mailbox is smooth, FIFO is vsync, Immediate tears', options: ['Mailbox', 'Fifo', 'Immediate'] },
    { id: 'GPU.hdr_allowed', tab: 'Graphics', label: 'HDR', ...B('true', 'false'), json: 'bool' },
    { id: 'GPU.copy_gpu_buffers', tab: 'Advanced', label: 'Copy GPU buffers', sub: 'Fixes some games, slower', ...B('true', 'false'), json: 'bool' },
    { id: 'GPU.readback_linear_images_enabled', tab: 'Advanced', label: 'Readback linear images', sub: 'For games with broken effects', ...B('true', 'false'), json: 'bool' },
    { id: 'GPU.direct_memory_access_enabled', tab: 'Advanced', label: 'Direct memory access', sub: 'Needed by a few games', ...B('true', 'false'), json: 'bool' },
    { id: 'GPU.patch_shaders', tab: 'Advanced', label: 'Patch shaders', ...B('true', 'false'), json: 'bool' },
    { id: 'GPU.inline_fetch_shader', tab: 'Advanced', label: 'Inline fetch shader', ...B('true', 'false'), json: 'bool' },
    { id: 'Vulkan.pipeline_cache_enabled', tab: 'Advanced', label: 'Pipeline cache', sub: 'Less stutter after the first run', ...B('true', 'false'), json: 'bool' },
    { id: 'General.neo_mode', tab: 'System', label: 'PS4 Pro mode', sub: 'Games that support the Pro look better, and need more', ...B('true', 'false'), json: 'bool' },
    { id: 'General.dev_kit_mode', tab: 'System', label: 'Dev kit mode', sub: 'More memory; for games that run out', ...B('true', 'false'), json: 'bool' },
    { id: 'General.extra_dmem_in_mbytes', tab: 'System', label: 'Extra memory', options: [['0', 'None'], ['512', '512 MB'], ['1024', '1 GB'], ['2048', '2 GB']], json: 'int', num: { min: 0, max: 16384, unit: 'MB' } },
    { id: 'General.extra_fmem_in_mbytes', tab: 'System', label: 'Extra flexible memory', options: [['0', 'None'], ['256', '256 MB'], ['512', '512 MB']], json: 'int', num: { min: 0, max: 4096, unit: 'MB' } },
    { id: 'General.volume_slider', tab: 'System', label: 'Volume', options: [['100', '100%'], ['75', '75%'], ['50', '50%'], ['25', '25%']], json: 'int', num: { min: 0, max: 100, unit: '%' } },
    { id: 'General.trophy_notification_duration', tab: 'System', label: 'Trophy pop-up time', sub: 'Seconds', options: [['6', '6 s'], ['3', '3 s'], ['10', '10 s']], json: 'num', num: { min: 1, max: 30, unit: 's', decimals: true } },
    { id: 'General.trophy_popup_disabled', tab: 'System', label: 'Hide trophy pop-ups', ...B('true', 'false'), json: 'bool' },
  ] },
};
const split = (id) => { const i = id.lastIndexOf('.'); return [id.slice(0, i), id.slice(i + 1)]; };

// ---- ini files (PCSX2, DuckStation, Dolphin, PPSSPP)
function iniGet(text, sec, key) {
  let cur = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const l = raw.trim(), m = /^\[(.+)\]$/.exec(l);
    if (m) { cur = m[1]; continue; }
    if (cur !== sec) continue;
    const i = l.indexOf('=');
    if (i > 0 && l.slice(0, i).trim() === key) return l.slice(i + 1).trim();
  }
  return undefined;
}
// set or remove one key in one section, keeping everything else as it was
function iniPut(text, sec, key, value, sep = ' = ') {
  const lines = String(text || '').split(/\r?\n/);
  let cur = null, secAt = -1, keyAt = -1, endAt = -1;
  lines.forEach((raw, n) => {
    const l = raw.trim(), m = /^\[(.+)\]$/.exec(l);
    if (m) { if (cur === sec) endAt = n; cur = m[1]; if (cur === sec) { secAt = n; endAt = -1; } return; }
    if (cur === sec) { const i = l.indexOf('='); if (i > 0 && l.slice(0, i).trim() === key) keyAt = n; }
  });
  if (value === undefined) { if (keyAt >= 0) lines.splice(keyAt, 1); return lines.join('\n'); }
  const line = `${key}${sep}${value}`;
  if (keyAt >= 0) lines[keyAt] = line;
  else if (secAt >= 0) { let at = endAt >= 0 ? endAt : lines.length; while (at > secAt + 1 && !lines[at - 1].trim()) at--; lines.splice(at, 0, line); }
  else { while (lines.length && !lines[lines.length - 1].trim()) lines.pop(); if (lines.length) lines.push(''); lines.push(`[${sec}]`, line); }
  return lines.join('\n').replace(/\n*$/, '\n');
}
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
// ---- Xenia (0.9.62; docs/game-settings/xenia.md): config/<TITLE ID>.config.toml, overrides only, the same tables
// and keys as xenia-canary.config.toml ([GPU], nested [GPU.Debug]); strings quoted, inline comments ignored
const tomlVal = (v) => { v = String(v).trim(); if (/^"/.test(v)) { const m = /^"((?:[^"\\]|\\.)*)"/.exec(v); return m ? m[1].replace(/\\(["\\])/g, '$1') : v; } return v.replace(/\s+#.*$/, '').trim(); };
function tomlGet(text, sec, key) { const v = iniGet(text, sec, key); return v === undefined ? undefined : tomlVal(v); }
// ---- Vita3K (0.9.62; docs/game-settings/vita3k.md): config/config_<TITLE ID>.xml is a whole copy of the settings
// (a missing attribute reads as false or 0), so Cartridge writes every attribute, in Vita3K's own order, from
// config.yml (each attribute's key there: VITA_BASE), and "Vita3K's own" puts config.yml's value back
const VITA_XML = [['core', ['modules-mode']], ['cpu', ['cpu-opt']], ['gpu', ['backend-renderer', 'gpu-idx', 'high-accuracy', 'resolution-multiplier', 'disable-surface-sync', 'screen-filter', 'memory-mapping', 'v-sync', 'anisotropic-filtering', 'async-pipeline-compilation', 'import-textures', 'export-textures', 'export-as-png', 'fps-hack', 'shader-cache', 'spirv-shader', 'texture-cache']], ['audio', ['audio-backend', 'audio-volume', 'enable-ngs']], ['system', ['pstv-mode', 'sys-button', 'sys-lang', 'sys-date-format', 'sys-time-format']], ['emulator', ['file-loading-delay', 'stretch-the-display-area', 'fullscreen-hd-res-pixel-perfect']], ['debug', ['log-active-shaders', 'log-uniforms', 'color-surface-debug', 'validation-layer']], ['network', ['psn-signed-in']]];
const VITA_BASE = { 'enable-ngs': 'ngs-enable', 'stretch-the-display-area': 'stretch_the_display_area', 'fullscreen-hd-res-pixel-perfect': 'fullscreen_hd_res_pixel_perfect' };
const VITA_DEF = { 'modules-mode': '0', 'cpu-opt': 'true', 'backend-renderer': 'Vulkan', 'gpu-idx': '0', 'high-accuracy': 'false', 'resolution-multiplier': '1', 'disable-surface-sync': 'true', 'screen-filter': 'Bilinear', 'memory-mapping': 'double-buffer', 'v-sync': 'true', 'anisotropic-filtering': '1', 'async-pipeline-compilation': 'true', 'import-textures': 'false', 'export-textures': 'false', 'export-as-png': 'true', 'fps-hack': 'false', 'shader-cache': 'true', 'spirv-shader': 'false', 'texture-cache': 'true', 'audio-backend': 'SDL', 'audio-volume': '100', 'enable-ngs': 'true', 'pstv-mode': 'false', 'sys-button': '1', 'sys-lang': '1', 'sys-date-format': '2', 'sys-time-format': '0', 'file-loading-delay': '0', 'stretch-the-display-area': 'false', 'fullscreen-hd-res-pixel-perfect': 'false', 'log-active-shaders': 'false', 'log-uniforms': 'false', 'color-surface-debug': 'false', 'validation-layer': 'true', 'psn-signed-in': 'false' };
const xmlEsc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const xmlUnesc = (v) => String(v).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function vitaYml(text) { try { return require('js-yaml').load(String(text || '')) || {}; } catch { return {}; } }
function vitaBaseGet(text, sec, key) {
  const y = vitaYml(text), v = y[VITA_BASE[key] || key];
  if (v == null || typeof v === 'object') return undefined;
  if (key === 'psn-signed-in') return Number(v) ? 'true' : 'false'; // an int in config.yml, true/false in the XML
  return String(v);
}
function vitaGet(text, sec, key) {
  const el = new RegExp(`<${sec}\\b([^>]*?)/?>`).exec(String(text || ''));
  const m = el && new RegExp(`\\s${key.replace(/-/g, '\\-')}="([^"]*)"`).exec(el[1]);
  return m ? xmlUnesc(m[1]) : undefined;
}
function vitaPut(text, sec, key, value) {
  return String(text).replace(new RegExp(`<${sec}\\b([^>]*?)(/?)>`), (all, attrs, close) => {
    const re = new RegExp(`(\\s${key.replace(/-/g, '\\-')}=")[^"]*(")`);
    return `<${sec}${re.test(attrs) ? attrs.replace(re, `$1${xmlEsc(value)}$2`) : `${attrs} ${key}="${xmlEsc(value)}"`}${close}>`;
  });
}
// the whole file as save_custom_config writes it, from config.yml (lists: lle-modules, ime-langs)
function vitaBuild(ymlText) {
  const y = vitaYml(ymlText), val = (k) => { const v = vitaBaseGet(ymlText, '', k); return v === undefined ? VITA_DEF[k] : v; };
  const list = (k, tag, dflt) => { const a = Array.isArray(y[k]) ? y[k] : dflt; return a.length ? `\n\t\t<${k}>\n${a.map((x) => `\t\t\t<${tag}>${xmlEsc(x)}</${tag}>`).join('\n')}\n\t\t</${k}>\n\t` : `\n\t\t<${k} />\n\t`; };
  const attrs = (keys) => keys.map((k) => ` ${k}="${xmlEsc(val(k))}"`).join('');
  const out = ['<?xml version="1.0" encoding="utf-8"?>', '<config>'];
  for (const [el, keys] of VITA_XML) {
    if (el === 'core') out.push(`\t<core${attrs(keys)}>${list('lle-modules', 'module', [])}</core>`);
    else if (el === 'system') out.push(`\t<system${attrs(keys)}>${list('ime-langs', 'lang', [4])}</system>`);
    else out.push(`\t<${el}${attrs(keys)} />`);
  }
  out.push('</config>', '');
  return out.join('\n');
}
// ---- Cemu (0.9.62; docs/game-settings/cemu.md): gameProfiles/<title id>.ini; a new one starts from the profile Cemu
// ships for the game (Cemu reads only one of the two), and the graphics API's global value is in settings.xml
function cemuXmlGet(text, sec, key) { const m = new RegExp(`<${sec}>[\\s\\S]*?<${key}>([^<]*)</${key}>`).exec(String(text || '')); return m ? m[1].trim() : undefined; }
// ---- Flycast, MAME, Supermodel, Ryujinx, RetroArch (0.9.62; docs/game-settings/<emu>.md). get(text, sec, key, base, F)
// reads the game's value (base: the global one), put(...) sets or removes it; fresh(baseText) is a new whole copy.
// Flycast and Supermodel keep every game in their one main file: only the game's section is touched, never deleted.
const lineKV = (re) => (text, key) => { for (const raw of String(text || '').split(/\r?\n/)) { const m = re(key).exec(raw); if (m) return m[1]; } return undefined; };
const escRe = (k) => String(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// MAME: "name value", # comments, values may be quoted
const mameGet = lineKV((k) => new RegExp(`^\\s*${escRe(k)}\\s+("[^"]*"|\\S+)`));
function mamePut(text, key, value) {
  const lines = String(text || '').split(/\r?\n/), at = lines.findIndex((l) => new RegExp(`^\\s*${escRe(key)}(\\s|$)`).test(l));
  if (value === undefined) { if (at >= 0) lines.splice(at, 1); }
  else { const v = /\s/.test(value) ? `"${value}"` : value, line = `${key.padEnd(25)} ${v}`; if (at >= 0) lines[at] = line; else { while (lines.length && !lines[lines.length - 1].trim()) lines.pop(); lines.push(line); } }
  return lines.join('\n').replace(/\n*$/, '\n');
}
// RetroArch: key = "value" (overrides .cfg and core options .opt)
const raGet = lineKV((k) => new RegExp(`^\\s*${escRe(k)}\\s*=\\s*"?([^"\\r\\n]*)"?\\s*$`));
function raPut(text, key, value) {
  const lines = String(text || '').split(/\r?\n/), at = lines.findIndex((l) => new RegExp(`^\\s*${escRe(key)}\\s*=`).test(l));
  if (value === undefined) { if (at >= 0) lines.splice(at, 1); }
  else { const line = `${key} = "${value}"`; if (at >= 0) lines[at] = line; else { while (lines.length && !lines[lines.length - 1].trim()) lines.pop(); lines.push(line); } }
  return lines.join('\n').replace(/^\n+/, '').replace(/\n*$/, '\n');
}
// Supermodel: "[ name ]" headers (spaces ignored, "[ a, b ]" names several games), key = value
function smFind(lines, name) { const want = name.toLowerCase(); let cur = null, start = -1, end = lines.length; for (let i = 0; i < lines.length; i++) { const m = /^\s*\[([^\]]*)\]/.exec(lines[i]); if (m) { if (start >= 0) { end = i; break; } cur = m[1].split(',').map((x) => x.trim().toLowerCase()); if (cur.includes(want)) start = i; } } return start < 0 ? null : [start, end]; }
function smGet(text, sec, key) { const lines = String(text || '').split(/\r?\n/), r = smFind(lines, sec); if (!r) return undefined; for (let i = r[0] + 1; i < r[1]; i++) { const m = new RegExp(`^\\s*${escRe(key)}\\s*=\\s*(.*?)\\s*$`).exec(lines[i]); if (m) return m[1].replace(/^"(.*)"$/, '$1'); } return undefined; }
function smPut(text, sec, key, value) {
  const lines = String(text || '').split(/\r?\n/); let r = smFind(lines, sec);
  if (!r) { if (value === undefined) return text; while (lines.length && !lines[lines.length - 1].trim()) lines.pop(); lines.push('', `[ ${sec} ]`); r = [lines.length - 1, lines.length]; }
  let at = -1; for (let i = r[0] + 1; i < r[1]; i++) if (new RegExp(`^\\s*${escRe(key)}\\s*=`).test(lines[i])) at = i;
  if (value === undefined) { if (at >= 0) lines.splice(at, 1); }
  else if (at >= 0) lines[at] = `${key} = ${value}`;
  else { let i = r[1]; while (i > r[0] + 1 && !lines[i - 1].trim()) i--; lines.splice(i, 0, `${key} = ${value}`); }
  return lines.join('\n').replace(/\n*$/, '\n');
}
// Ryujinx: games/<id>/Config.json is a whole Config.json; values keep the type the global file gives them
function ryuJson(text) { try { return JSON.parse(text || '{}') || {}; } catch { return {}; } }
const FMT = {
  flycast: { get: (t, sec, key, base, F) => (base ? iniGet(t, sec, key) : iniGet(t, F.gameSec, key)), put: (t, sec, key, v, it, F) => iniPut(t, F.gameSec, key, v) },
  mame: { get: (t, sec, key) => { const v = mameGet(t, key); return v == null ? v : v.replace(/^"(.*)"$/, '$1'); }, put: (t, sec, key, v) => mamePut(t, key, v) },
  supermodel: { get: (t, sec, key, base, F) => smGet(t, base ? sec : F.gameSec, key), put: (t, sec, key, v, it, F) => smPut(t, F.gameSec, key, v) },
  ryujinx: {
    get: (t, sec, key) => { const v = ryuJson(t)[key]; return v == null || typeof v === 'object' ? undefined : String(v); },
    put: (t, sec, key, v, it, F) => { const j = ryuJson(t), was = ryuJson(read(F.base[0]))[key] ?? j[key]; if (v === undefined) delete j[key]; else j[key] = typeof was === 'boolean' || it.type === 'bool' ? v === 'true' : typeof was === 'number' ? Number(v) : v; return JSON.stringify(j, null, 2) + '\n'; },
    fresh: (baseText) => (ryuJson(baseText) && baseText ? baseText : '{}'),
  },
  racfg: { get: (t, sec, key) => raGet(t, key), put: (t, sec, key, v) => raPut(t, key, v) },
};
// ---- Eden and Azahar (0.9.62; docs/game-settings/eden.md, azahar.md): custom/<TITLE ID>.ini, each setting with a
// "\use_global" flag. The game's value counts only with use_global=false (and, Eden, no "\default=true", which makes
// it use the default instead). Eden writes three lines (use_global, default=false, the value), Azahar two; back to
// the emulator's own is use_global=true with the value removed. Both write key=value with no spaces.
const unq = (v) => (v == null ? v : String(v).replace(/^"(.*)"$/, '$1'));
function qtGet(text, sec, key, base) {
  if (text == null) return undefined;
  if (base) { if (iniGet(text, sec, key + '\\default') === 'true') return undefined; return unq(iniGet(text, sec, key)); } // global file: \default=true means the built-in default
  if (iniGet(text, sec, key + '\\use_global') !== 'false' || iniGet(text, sec, key + '\\default') === 'true') return undefined;
  return unq(iniGet(text, sec, key));
}
function qtPut(text, sec, key, value, eden) {
  if (value === undefined) { text = iniPut(text, sec, key, undefined); text = iniPut(text, sec, key + '\\default', undefined); return iniPut(text, sec, key + '\\use_global', 'true', '='); }
  text = iniPut(text, sec, key + '\\use_global', 'false', '=');
  text = eden ? iniPut(text, sec, key + '\\default', 'false', '=') : iniPut(text, sec, key + '\\default', undefined);
  return iniPut(text, sec, key, value, '=');
}

// ---- RPCS3's YAML ("Video:" then "  Renderer: Vulkan"; 0.9.62: deeper sections like "Video/Vulkan" are a path)
const ymlPath = (sec) => String(sec).split('/');
function ymlGet(text, sec, key) {
  try { let o = require('js-yaml').load(String(text || ''), { schema: require('js-yaml').FAILSAFE_SCHEMA }) || {}; for (const p of ymlPath(sec)) o = o?.[p]; const v = o?.[key]; return v == null || typeof v === 'object' ? undefined : String(v); } catch { return undefined; }
}
function ymlPut(text, sec, key, value) {
  const Y = require('js-yaml');
  let y = {}; try { y = Y.load(String(text || ''), { schema: Y.FAILSAFE_SCHEMA }) || {}; } catch { y = {}; }
  const parts = ymlPath(sec);
  if (value === undefined) {
    const chain = [y]; for (const p of parts) chain.push(chain[chain.length - 1]?.[p]);
    if (chain[chain.length - 1]) delete chain[chain.length - 1][key];
    for (let i = parts.length; i > 0; i--) if (chain[i] && !Object.keys(chain[i]).length) delete chain[i - 1][parts[i - 1]]; // empty sections go too
  } else { let o = y; for (const p of parts) o = (o[p] && typeof o[p] === 'object' ? o[p] : (o[p] = {})); o[key] = value; }
  return Y.dump(y, { lineWidth: -1 }).replace(/'(true|false|\d+)'/g, '$1');
}

// emulators with no hand-picked list show everything from their source (0.9.62)
const NAMES = { eden: 'Eden', citron: 'Citron', yuzu: 'yuzu', sudachi: 'Sudachi', azahar: 'Azahar', citra: 'Citra', lime3ds: 'Lime3DS', cemu: 'Cemu', vita3k: 'Vita3K', xenia: 'Xenia', flycast: 'Flycast', mame: 'MAME', supermodel: 'Supermodel', retroarch: 'RetroArch', ryujinx: 'Ryujinx' };
const schemaOf = (ctx) => SCHEMA[ctx.emu] || { name: ctx.name || NAMES[ctx.emu] || ctx.emu, items: [] };
// where a game's file is, and the emulator's own settings to show beside it
// ctx: { emu, serial, crc, rpcs3Root, pcsx2: { gamesettings, root }, duckRoot, dolphin: { user, config }, ppsspp: { root, ini }, shadUser }
function files(ctx) {
  const e = ctx.emu;
  if (e === 'rpcs3') return { file: path.join(ctx.rpcs3Root, 'config', 'custom_configs', `config_${ctx.serial}.yml`), base: [path.join(ctx.rpcs3Root, 'config', 'config.yml'), path.join(ctx.rpcs3Root, 'config.yml')], kind: 'yml' };
  if (e === 'pcsx2') return { file: path.join(ctx.pcsx2.gamesettings, ctx.serial ? `${ctx.serial}_${ctx.crc}.ini` : `${ctx.crc}.ini`), base: [path.join(ctx.pcsx2.root, 'inis', 'PCSX2.ini')], kind: 'ini' };
  if (e === 'duckstation') return { file: path.join(ctx.duckRoot, 'gamesettings', `${ctx.serial}.ini`), base: [path.join(ctx.duckRoot, 'settings.ini')], kind: 'ini' };
  if (e === 'dolphin') return { file: path.join(ctx.dolphin.user, 'GameSettings', `${ctx.serial}.ini`), base: [path.join(ctx.dolphin.config, 'GFX.ini'), path.join(ctx.dolphin.config, 'Dolphin.ini')], kind: 'ini', dolphin: true };
  if (e === 'ppsspp') return { file: path.join(ctx.ppsspp.root, 'PSP', 'SYSTEM', `${ctx.serial}_ppsspp.ini`), base: [ctx.ppsspp.ini], kind: 'ini', copyBase: true };
  // Eden and Azahar (0.9.62): ctx.cfgDir is the config folder holding qt-config.ini (portable user/config, Flatpak or XDG)
  if (e === 'eden') return { file: path.join(ctx.cfgDir, 'custom', `${ctx.serial}.ini`), base: [path.join(ctx.cfgDir, 'qt-config.ini')], kind: 'qt-eden' };
  if (e === 'azahar') return { file: path.join(ctx.cfgDir, 'custom', `${ctx.serial}.ini`), base: [path.join(ctx.cfgDir, 'qt-config.ini')], kind: 'qt' };
  // Cemu, Vita3K, Xenia (0.9.62): ctx.cfgDir is Cemu's/Vita3K's config folder, Xenia's storage root
  if (e === 'cemu') return { file: path.join(ctx.cfgDir, 'gameProfiles', `${String(ctx.serial).toLowerCase()}.ini`), base: [path.join(ctx.cfgDir, 'settings.xml')], kind: 'cemu', seed: ctx.dataDir ? path.join(ctx.dataDir, 'gameProfiles', 'default', `${String(ctx.serial).toLowerCase()}.ini`) : null };
  if (e === 'vita3k') return { file: path.join(ctx.cfgDir, 'config', `config_${ctx.serial}.xml`), base: [path.join(ctx.cfgDir, 'config.yml')], kind: 'vita3k', copyBase: true };
  if (e === 'xenia') return { file: path.join(ctx.cfgDir, 'config', `${ctx.serial}.config.toml`), base: [path.join(ctx.cfgDir, 'xenia-canary.config.toml'), path.join(ctx.cfgDir, 'xenia.config.toml')], kind: 'toml' };
  // Flycast and Supermodel: the game's section inside their one settings file (ctx.cfgFile); MAME: <ini dir>/<rom>.ini;
  // Ryujinx: games/<base title id, lower case>/Config.json, a whole copy; RetroArch: the game's override (.cfg) and core
  // options (.opt) in config/<core name>/, over the core's own and then the global ones
  if (e === 'flycast') return { file: ctx.cfgFile, base: [ctx.cfgFile], kind: 'flycast', gameSec: ctx.serial, shared: true };
  if (e === 'supermodel') return { file: ctx.cfgFile, base: [ctx.cfgFile], kind: 'supermodel', gameSec: ctx.serial, shared: true };
  if (e === 'mame') return { file: path.join(ctx.iniDir, `${ctx.serial}.ini`), base: [ctx.mameIni], kind: 'mame' };
  if (e === 'ryujinx') return { file: path.join(ctx.cfgDir, 'games', String(ctx.serial).toLowerCase(), 'Config.json'), base: [path.join(ctx.cfgDir, 'Config.json')], kind: 'ryujinx', full: true };
  if (e === 'retroarch') return { file: path.join(ctx.cfgDir, 'config', ctx.coreName, `${ctx.serial}.cfg`), base: [path.join(ctx.cfgDir, 'config', ctx.coreName, `${ctx.coreName}.cfg`), path.join(ctx.cfgDir, 'retroarch.cfg')], kind: 'racfg' };
  if (e === 'racore') { const c = db().retroarchCores?.[ctx.core]; return c && { file: path.join(ctx.cfgDir, 'config', ctx.coreName, `${ctx.serial}.opt`), base: [path.join(ctx.cfgDir, 'config', ctx.coreName, `${ctx.coreName}.opt`), ctx.coreOptions || path.join(ctx.cfgDir, 'retroarch-core-options.cfg')], kind: 'racfg', list: c.entries.map((x) => ({ ...x, tab: x.tab === 'Core Options' ? ctx.coreName : x.tab })) }; }
  if (e === 'shadps4') return { file: path.join(ctx.shadUser, 'custom_configs', `${ctx.serial}.json`), base: [path.join(ctx.shadUser, 'config.json')], kind: 'json' };
  return null;
}
// Dolphin's game sections live under other names in its main files
const DOLPHIN_BASE = { Video_Settings: 'Settings', Video_Enhancements: 'Enhancements', Video_Hacks: 'Hacks', Video_Hardware: 'Hardware', Video_Stereoscopy: 'Stereoscopy', 'GFX.ColorCorrection': 'ColorCorrection', Core: 'Core', DSP: 'DSP' };
function getIn(kind, text, sec, key, base, F) {
  if (text == null) return undefined;
  if (FMT[kind]) return FMT[kind].get(text, sec, key, base, F || {});
  if (kind === 'qt' || kind === 'qt-eden') return qtGet(text, sec, key, base);
  if (kind === 'toml') return tomlGet(text, sec, key);
  if (kind === 'vita3k') return base ? vitaBaseGet(text, sec, key) : vitaGet(text, sec, key);
  if (kind === 'cemu') return base ? cemuXmlGet(text, sec, key) : iniGet(text, sec, key);
  if (kind === 'yml') return ymlGet(text, sec, key);
  if (kind === 'json') { try { const v = JSON.parse(text)?.[sec]?.[key]; return v == null ? undefined : String(v); } catch { return undefined; } }
  return iniGet(text, sec, key);
}
// ---- every other setting (0.9.46, owner: "a setting that takes a typed value isn't there, place every setting,
// advanced or not"): besides the picked ones above, every key the emulator's own settings file has in the sections
// its per-game file can override, typed from the value it holds now (on/off, a number, or text)
const ALL = {
  rpcs3: /^(Core|Video|Audio|System|Savestate|Miscellaneous)$/, // custom_configs take the whole config.yml (two levels here)
  pcsx2: /^(EmuCore(\/.*)?|SPU2\/.*)$/,
  duckstation: /^(CPU|GPU|Display|Audio|Console|Hacks|PGXP|TextureReplacements)$/,
  // ppsspp and dolphin: emuSettingsDb.json (0.9.61)
  shadps4: /^(GPU|Vulkan|General)$/, // ApplyGroupOverrides
};
const DOLPHIN_GAME = Object.fromEntries(Object.entries(DOLPHIN_BASE).map(([g, b]) => [b, g]));
// the keys and values of a settings file, as [section, key, value]
function entriesOf(kind, text) {
  const out = [];
  if (text == null) return out;
  if (kind === 'ini') { let cur = null; for (const raw of String(text).split(/\r?\n/)) { const l = raw.trim(), m = /^\[(.+)\]$/.exec(l); if (m) { cur = m[1]; continue; } const i = l.indexOf('='); if (cur && i > 0 && !l.startsWith('#') && !l.startsWith(';')) out.push([cur, l.slice(0, i).trim(), l.slice(i + 1).trim()]); } }
  else if (kind === 'yml') { try { const y = require('js-yaml').load(String(text), { schema: require('js-yaml').FAILSAFE_SCHEMA }) || {}; for (const [sec, o] of Object.entries(y)) if (o && typeof o === 'object' && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) if (v == null || typeof v !== 'object') out.push([sec, k, v == null ? '' : String(v)]); } catch {} }
  else if (kind === 'json') { try { const j = JSON.parse(text) || {}; for (const [sec, o] of Object.entries(j)) if (o && typeof o === 'object' && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) if (v == null || typeof v !== 'object') out.push([sec, k, v == null ? '' : String(v)]); } catch {} }
  return out;
}
// "extra_dmem_in_mbytes" -> "Extra dmem in mbytes", "ResolutionScale" -> "Resolution scale"
const human = (k) => { const w = String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim(); return w ? w[0].toUpperCase() + w.slice(1) : k; };
// PPSSPP and Dolphin (0.9.61, owner: PPSSPP's list was wrong and stacked in one tab, Dolphin's missed most settings):
// every setting each takes in a game's file, from its source (tools/game-settings/gen.js -> emuSettingsDb.json), one
// tab per section, with the emulator's own default when its main file doesn't hold the key (Dolphin keeps only changes)
let DB = null;
const db = () => (DB ||= (() => { try { return require('./emuSettingsDb.json'); } catch { return {}; } })());
const ENUM_NAMES = { ForceWide: 'Force 16:9', ForceStandard: 'Force 4:3', CustomStretch: 'Custom (Stretch)', JIT64: 'JIT', SMPTE_NTSCM: 'NTSC-M', SYSTEMJ_NTSCJ: 'NTSC-J', EBU_PAL: 'PAL' };
const nice = (k) => human(String(k).replace(/^[ibfsu](?=[A-Z])/, '').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2'));
// 0.9.62 (owner: "across the board"): every emulator's entries carry their tab (adv: the emulator's advanced, debug
// and logging settings, all in one Advanced tab at the end), a range when its source gives one, and its description
const tabOf = (x) => (x.adv ? 'Advanced' : x.tab || x.s || 'Settings');
// one order for every emulator's tabs: what people change most first, tabs not named here after them in the source's
// order, Advanced last
const PREF = ['Graphics', 'Video', 'Display', 'Advanced Graphics', 'Enhancements', 'Hacks', 'Layout', 'Latency', 'Frame Throttle', 'CPU', 'Core', 'Performance', 'System', 'Audio', 'Sound', 'Controls', 'Input', 'Rewind', 'General', 'Applets', 'Network'];
function ordered(tabs) { const t = [...new Set(tabs)].filter((x) => x !== 'Advanced'); const r = (x) => { const i = PREF.indexOf(x); return i < 0 ? 50 + t.indexOf(x) : i; }; return [...t.sort((a, b) => r(a) - r(b)), 'Advanced']; }
const tabOrder = (emu) => ordered((db()[emu] || []).map(tabOf));
const INT = { min: -2147483648, max: 2147483647 };
function itemOf(x) {
  const it = { id: x.s + '.' + x.k, sec: x.s, key: x.k, tab: tabOf(x), label: x.l || nice(x.k), def: x.d, desc: x.desc || '', more: true, ...(x.base ? { base: x.base } : {}), ...(x.str ? { str: true } : {}) };
  const range = (dec) => ({ min: Number.isFinite(x.min) ? x.min : dec ? -1e9 : INT.min, max: Number.isFinite(x.max) ? x.max : dec ? 1e9 : INT.max, ...(dec ? { decimals: true } : {}), ...(x.unit ? { unit: x.unit } : {}) });
  if (x.t === 'bool') { const o = x.o && x.o.length === 2 ? x.o : [['True', 'On'], ['False', 'Off']]; Object.assign(it, B(o[0][0], o[1][0])); }
  else if (x.t === 'enum' || x.t === 'choice') { it.options = (x.o || []).map(([v, l]) => [v, ENUM_NAMES[l] || (x.t === 'enum' && /^[A-Z][A-Za-z0-9]*$/.test(l) ? nice(l) : l)]); if (/^-?\d+$/.test(String(x.o?.[0]?.[0] ?? 'x')) && x.typeable) it.num = range(false); }
  else if (x.t === 'int') Object.assign(it, { options: [], num: range(false) });
  else if (x.t === 'float') Object.assign(it, { options: [], num: range(true) });
  else Object.assign(it, { options: [], type: 'text' });
  return it;
}
function dbItems(emu, known, list = db()[emu]) {
  if (!list) return null;
  const seen = new Set(known), out = [];
  for (const x of list) { const id = x.s + '.' + x.k; if (seen.has(id)) continue; seen.add(id); out.push(itemOf(x)); }
  return out;
}
function moreItems(ctx, F, known) {
  const fromDb = dbItems(ctx.emu, known);
  if (fromDb) return fromDb;
  const rx = ALL[ctx.emu]; if (!rx) return [];
  const seen = new Set(known), out = [];
  for (const f of F.base) {
    for (const [s0, key, v] of entriesOf(F.kind, read(f))) {
      const sec = F.dolphin ? DOLPHIN_GAME[s0] || s0 : s0;
      if (!rx.test(sec) || key.includes('.') || seen.has(sec + '.' + key)) continue;
      seen.add(sec + '.' + key);
      const it = { id: sec + '.' + key, tab: 'All Settings', group: sec, label: human(key), sub: key, more: true };
      if (/^(true|false)$/i.test(v)) Object.assign(it, B(v[0] === 'T' ? 'True' : 'true', v[0] === 'T' ? 'False' : 'false'), { json: 'bool' });
      else if (/^-?\d+$/.test(v)) Object.assign(it, { options: [], json: 'int', num: { min: -2147483648, max: 2147483647 } });
      else if (/^-?\d*\.\d+$/.test(v)) Object.assign(it, { options: [], json: 'num', num: { min: -1e9, max: 1e9, decimals: true } });
      else Object.assign(it, { options: [], type: 'text' });
      out.push(it);
    }
  }
  return out;
}
const itemsOf = (ctx, F) => {
  const S = schemaOf(ctx), list = (F.list || db()[ctx.emu] || []).filter((x) => !x.os || x.os === (ctx.os || 'linux')); // Xenia: Windows-only settings only for its Windows build
  const byId = Object.fromEntries(list.map((x) => [x.s + '.' + x.k, x]));
  // a hand-picked setting keeps its own name and choices, and takes the rest (tab, default, range, description) from the source
  const picked = S.items.map((it) => { const x = byId[it.id]; if (!x) return it; const f = itemOf(x); return { ...f, ...it, tab: it.tab || f.tab, def: it.def ?? f.def, desc: it.desc || f.desc, num: it.num || (it.options?.length ? null : f.num) }; });
  return [...picked, ...(list.length ? dbItems(ctx.emu, S.items.map((x) => x.id), list) : moreItems(ctx, F, S.items.map((x) => x.id)))];
};
// what the screen shows: each setting with the game's value (or none) and the emulator's own
function describeOne(ctx) {
  const S = schemaOf(ctx), F = files(ctx);
  if (!S || !F) return null;
  const own = read(F.file) ?? (F.seed ? read(F.seed) : null); // Cemu: its shipped profile is what applies until you make your own
  const bases = F.base.map(read);
  const items = itemsOf(ctx, F).map((it) => {
    const [sec, key] = it.sec != null ? [it.sec, it.key] : split(it.id);
    const game = own != null && !(F.copyBase && !ownMarked(ctx, F.file, it.id)) ? getIn(F.kind, own, sec, key, false, F) : undefined;
    let base;
    const [bSec, bKey] = it.base && it.base.includes('|') ? it.base.split('|') : it.base && F.kind === 'cemu' ? it.base.split('.') : [F.dolphin ? DOLPHIN_BASE[sec] || sec : sec, key];
    for (const t of bases) { base = F.kind === 'cemu' && !it.base ? undefined : getIn(F.kind, t, bSec, bKey, true, F); if (base !== undefined) break; }
    if (base === undefined && it.def != null) base = it.def; // not in its file: the emulator's own default
    const opts = it.type === 'bool' ? [[it.on, 'On'], [it.off, 'Off']] : (it.options || []).map((o) => (Array.isArray(o) ? o : [o, o]));
    return { id: it.id, tab: it.tab || (/^(Video|EmuCore\/GS|GPU|Graphics|Video_\w+)$/.test(sec) ? 'Graphics' : 'System'), label: it.label, sub: it.sub || '', desc: it.desc || '', options: opts.map(([v, l]) => ({ value: v, label: l })), game: game ?? null, base: base ?? null, type: it.type || 'choice', num: it.num || null, group: it.group || null };
  });
  // tabs in the emulator's own order with Advanced last (0.9.62), the hand-picked settings first in each
  const order = F.list ? ordered(F.list.map(tabOf)) : db()[ctx.emu] ? tabOrder(ctx.emu) : null;
  if (order) { const r = (x) => { const i = order.indexOf(x.tab); return i < 0 ? 98 : i; }; items.sort((a, b) => r(a) - r(b)); }
  return { emu: ctx.emu, name: S.name, file: F.file, exists: own != null, items };
}
// PPSSPP's game file is a full copy, so only the keys Cartridge set count as "this game's" (the rest
// came from your normal settings when the file was made); records in game-settings.json
let recsFile = null;
const recs = () => { try { return JSON.parse(fs.readFileSync(recsFile, 'utf8')); } catch { return {}; } };
const saveRecs = (r) => { if (recsFile) { fs.mkdirSync(path.dirname(recsFile), { recursive: true }); fs.writeFileSync(recsFile, JSON.stringify(r, null, 1)); } };
function ownMarked(ctx, file, id) { const r = recs()[file]; return !r || !r.copied || (r.keys || []).includes(id); }
// changes: [{ id, value }] (value null = back to the emulator's own)
function applyOne(ctx, changes) {
  const S = schemaOf(ctx), F = files(ctx);
  if (!S || !F) throw new Error('Cartridge can’t change this emulator’s per-game settings.');
  let text = read(F.file);
  const r = recs(), rec = r[F.file] || { created: text == null, keys: [] };
  if (text == null) {
    // Vita3K: the whole file from config.yml; Cemu: the profile it ships for the game, when there is one
    text = F.full && FMT[F.kind]?.fresh ? FMT[F.kind].fresh(read(F.base[0]), F) : F.kind === 'vita3k' ? vitaBuild(read(F.base[0])) : F.seed && read(F.seed) != null ? read(F.seed) : F.copyBase && F.base[0] ? read(F.base[0]) || '' : F.kind === 'json' ? '{}' : '';
    rec.copied = !!((F.copyBase || F.full || F.kind === 'vita3k' || F.seed) && text);
  }
  const all = itemsOf(ctx, F);
  for (const c of changes) {
    const it = all.find((x) => x.id === c.id);
    if (!it) continue;
    const [sec, key] = it.sec != null ? [it.sec, it.key] : split(it.id);
    let value = c.value == null ? undefined : String(c.value);
    // a typed number (0.9.29): any value in the emulator's own range
    const typed = it.num && value !== undefined && /^-?\d+(\.\d+)?$/.test(value) && (it.num.decimals || !value.includes('.')) && Number(value) >= it.num.min && Number(value) <= it.num.max;
    if (it.type === 'text' && value !== undefined) value = value.replace(/[\r\n]+/g, ' ').trim();
    if (value !== undefined && it.type !== 'bool' && it.type !== 'text' && !typed && !(it.options || []).some((o) => String(Array.isArray(o) ? o[0] : o) === value)) throw new Error(it.num ? `${it.label}: ${Math.abs(it.num.min) >= 1e6 && Math.abs(it.num.max) >= 1e6 ? (it.num.decimals ? 'a number' : 'a whole number') : Math.abs(it.num.max) >= 1e6 ? `a ${it.num.decimals ? '' : 'whole '}number from ${it.num.min} up` : `a ${it.num.decimals ? '' : 'whole '}number from ${it.num.min} to ${it.num.max}`}.` : `${it.label}: that value isn’t one Cartridge offers.`);
    if (value !== undefined && it.type === 'bool' && value !== it.on && value !== it.off) throw new Error(`${it.label}: on or off only.`);
    // a whole copy (PPSSPP made by Cartridge, Vita3K always: a missing attribute reads as off): back to your normal value
    if (value === undefined && ((F.copyBase && rec.copied) || F.kind === 'vita3k' || F.full)) {
      let b; for (const f of F.base) { b = getIn(F.kind === 'vita3k' || FMT[F.kind] ? F.kind : 'ini', read(f), sec, key, true, F); if (b !== undefined) break; }
      value = b ?? it.def ?? undefined;
    }
    if (FMT[F.kind]) { text = FMT[F.kind].put(text, sec, key, value, it, F); rec.keys = c.value == null ? rec.keys.filter((k) => k !== it.id) : [...new Set([...rec.keys, it.id])]; continue; }
    if ((F.kind === 'qt-eden') && value !== undefined && it.num?.decimals) value = Number(value).toFixed(6); // Eden writes floats as fmt "{:f}"
    if (F.kind === 'qt' || F.kind === 'qt-eden') text = qtPut(text, sec, key, value, F.kind === 'qt-eden');
    else if (F.kind === 'toml') text = iniPut(text, sec, key, value === undefined ? undefined : it.str || it.type === 'text' ? JSON.stringify(String(value)) : value);
    else if (F.kind === 'vita3k') text = value === undefined ? text : vitaPut(text, sec, key, value);
    else if (F.kind === 'yml') text = ymlPut(text, sec, key, value);
    else if (F.kind === 'json') { let j = {}; try { j = JSON.parse(text || '{}'); } catch {} if (value === undefined) { if (j[sec]) { delete j[sec][key]; if (!Object.keys(j[sec]).length) delete j[sec]; } } else (j[sec] ||= {})[key] = it.json === 'bool' || it.type === 'bool' ? value === 'true' : it.json === 'int' || it.json === 'num' || it.num ? Number(value) : value; text = JSON.stringify(j, null, 4); }
    else text = iniPut(text, sec, key, value);
    rec.keys = c.value == null ? rec.keys.filter((k) => k !== it.id) : [...new Set([...rec.keys, it.id])];
  }
  // a file Cartridge made that holds nothing of yours any more goes away again
  const empty = F.kind === 'json' ? (() => { try { return !Object.keys(JSON.parse(text)).length; } catch { return false; } })() : F.kind === 'yml' ? !String(text).replace(/\{\}\s*/g, '').trim() : F.kind === 'ryujinx' ? false : F.kind === 'racfg' || F.kind === 'mame' ? !String(text).trim() : /^qt/.test(F.kind) ? !/\\use_global=false/.test(String(text)) : !String(text).split(/\r?\n/).some((l) => l.includes('='));
  fs.mkdirSync(path.dirname(F.file), { recursive: true });
  if (rec.created && !F.shared && (!rec.keys.length && (empty || rec.copied))) { fs.rmSync(F.file, { force: true }); delete r[F.file]; }
  else { const tmp = F.file + '.cartridge-new'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, F.file); r[F.file] = rec; }
  saveRecs(r);
  return describe(ctx);
}
// RetroArch (0.9.62): the override and the core's own options together; the core's in tabs named after its categories,
// grouped under the core's name where they'd share a tab with RetroArch's
function describe(ctx) {
  const a = describeOne(ctx);
  if (!a || ctx.emu !== 'retroarch' || !ctx.core) return a;
  const b = files({ ...ctx, emu: 'racore' }) ? describeOne({ ...ctx, emu: 'racore', name: 'RetroArch' }) : null;
  if (!b) return a;
  const items = [...a.items, ...b.items.map((x) => ({ ...x, group: ctx.coreName }))];
  return { ...a, core: ctx.coreName, items: [...items.filter((x) => x.tab !== 'Advanced'), ...items.filter((x) => x.tab === 'Advanced')] };
}
function apply(ctx, changes) {
  if (ctx.emu !== 'retroarch' || !ctx.core || !files({ ...ctx, emu: 'racore' })) return applyOne(ctx, changes);
  const coreIds = new Set(itemsOf({ ...ctx, emu: 'racore' }, files({ ...ctx, emu: 'racore' })).map((x) => x.id));
  const mine = changes.filter((c) => !coreIds.has(c.id)), theirs = changes.filter((c) => coreIds.has(c.id));
  if (mine.length) applyOne(ctx, mine);
  if (theirs.length) applyOne({ ...ctx, emu: 'racore' }, theirs);
  return describe(ctx);
}
module.exports = { SCHEMA, describe, apply, files, iniGet, iniPut, ymlPut, ymlGet, setRecsFile: (f) => { recsFile = f; } };
