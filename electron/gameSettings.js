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
    { id: 'General.show_fps_counter', tab: 'System', label: 'FPS counter', ...B('true', 'false'), json: 'bool' },
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
function iniPut(text, sec, key, value) {
  const lines = String(text || '').split(/\r?\n/);
  let cur = null, secAt = -1, keyAt = -1, endAt = -1;
  lines.forEach((raw, n) => {
    const l = raw.trim(), m = /^\[(.+)\]$/.exec(l);
    if (m) { if (cur === sec) endAt = n; cur = m[1]; if (cur === sec) { secAt = n; endAt = -1; } return; }
    if (cur === sec) { const i = l.indexOf('='); if (i > 0 && l.slice(0, i).trim() === key) keyAt = n; }
  });
  if (value === undefined) { if (keyAt >= 0) lines.splice(keyAt, 1); return lines.join('\n'); }
  const line = `${key} = ${value}`;
  if (keyAt >= 0) lines[keyAt] = line;
  else if (secAt >= 0) { let at = endAt >= 0 ? endAt : lines.length; while (at > secAt + 1 && !lines[at - 1].trim()) at--; lines.splice(at, 0, line); }
  else { while (lines.length && !lines[lines.length - 1].trim()) lines.pop(); if (lines.length) lines.push(''); lines.push(`[${sec}]`, line); }
  return lines.join('\n').replace(/\n*$/, '\n');
}
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };

// ---- RPCS3's YAML (two levels: "Video:" then "  Renderer: Vulkan")
function ymlGet(text, sec, key) {
  try { const y = require('js-yaml').load(String(text || ''), { schema: require('js-yaml').FAILSAFE_SCHEMA }) || {}; const v = y[sec]?.[key]; return v == null ? undefined : String(v); } catch { return undefined; }
}
function ymlPut(text, sec, key, value) {
  const Y = require('js-yaml');
  let y = {}; try { y = Y.load(String(text || ''), { schema: Y.FAILSAFE_SCHEMA }) || {}; } catch { y = {}; }
  if (value === undefined) { if (y[sec]) { delete y[sec][key]; if (!Object.keys(y[sec]).length) delete y[sec]; } }
  else (y[sec] ||= {})[key] = value;
  return Y.dump(y, { lineWidth: -1 }).replace(/'(true|false|\d+)'/g, '$1');
}

// where a game's file is, and the emulator's own settings to show beside it
// ctx: { emu, serial, crc, rpcs3Root, pcsx2: { gamesettings, root }, duckRoot, dolphin: { user, config }, ppsspp: { root, ini }, shadUser }
function files(ctx) {
  const e = ctx.emu;
  if (e === 'rpcs3') return { file: path.join(ctx.rpcs3Root, 'config', 'custom_configs', `config_${ctx.serial}.yml`), base: [path.join(ctx.rpcs3Root, 'config', 'config.yml'), path.join(ctx.rpcs3Root, 'config.yml')], kind: 'yml' };
  if (e === 'pcsx2') return { file: path.join(ctx.pcsx2.gamesettings, ctx.serial ? `${ctx.serial}_${ctx.crc}.ini` : `${ctx.crc}.ini`), base: [path.join(ctx.pcsx2.root, 'inis', 'PCSX2.ini')], kind: 'ini' };
  if (e === 'duckstation') return { file: path.join(ctx.duckRoot, 'gamesettings', `${ctx.serial}.ini`), base: [path.join(ctx.duckRoot, 'settings.ini')], kind: 'ini' };
  if (e === 'dolphin') return { file: path.join(ctx.dolphin.user, 'GameSettings', `${ctx.serial}.ini`), base: [path.join(ctx.dolphin.config, 'GFX.ini'), path.join(ctx.dolphin.config, 'Dolphin.ini')], kind: 'ini', dolphin: true };
  if (e === 'ppsspp') return { file: path.join(ctx.ppsspp.root, 'PSP', 'SYSTEM', `${ctx.serial}_ppsspp.ini`), base: [ctx.ppsspp.ini], kind: 'ini', copyBase: true };
  if (e === 'shadps4') return { file: path.join(ctx.shadUser, 'custom_configs', `${ctx.serial}.json`), base: [path.join(ctx.shadUser, 'config.json')], kind: 'json' };
  return null;
}
// Dolphin's game sections live under other names in its main files
const DOLPHIN_BASE = { Video_Settings: 'Settings', Video_Enhancements: 'Enhancements', Video_Hacks: 'Hacks', Video_Hardware: 'Hardware', Video_Stereoscopy: 'Stereoscopy', 'GFX.ColorCorrection': 'ColorCorrection', Core: 'Core', DSP: 'DSP' };
function getIn(kind, text, sec, key) {
  if (text == null) return undefined;
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
const TABS = {
  ppsspp: { Graphics: 'Graphics', CPU: 'CPU', Sound: 'Audio', Control: 'Controls', SystemParam: 'System', General: 'General' },
  dolphin: { Video_Settings: 'Graphics', Video_Hardware: 'Graphics', Video_Enhancements: 'Enhancements', Video_Hacks: 'Hacks', Core: 'Core', DSP: 'Audio', Video_Stereoscopy: 'Stereo 3D', 'GFX.ColorCorrection': 'Colour' },
};
const ENUM_NAMES = { ForceWide: 'Force 16:9', ForceStandard: 'Force 4:3', CustomStretch: 'Custom (Stretch)', JIT64: 'JIT', SMPTE_NTSCM: 'NTSC-M', SYSTEMJ_NTSCJ: 'NTSC-J', EBU_PAL: 'PAL' };
const nice = (k) => human(String(k).replace(/^[ibfsu](?=[A-Z])/, '').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2'));
function dbItems(emu, known) {
  const list = db()[emu]; if (!list) return null;
  const seen = new Set(known), out = [], order = Object.keys(TABS[emu]);
  const rank = (x) => { const i = order.indexOf(x.s); return i < 0 ? 99 : i; };
  for (const x of [...list].sort((a, b) => rank(a) - rank(b))) {
    const id = x.s + '.' + x.k;
    if (seen.has(id)) continue;
    seen.add(id);
    const it = { id, tab: TABS[emu][x.s] || x.s, label: x.l || nice(x.k), def: x.d, more: true };
    if (x.t === 'bool') Object.assign(it, B('True', 'False'));
    else if (x.t === 'enum' || x.t === 'choice') it.options = x.o.map(([v, l]) => [v, ENUM_NAMES[l] || (x.t === 'enum' && /^[A-Z][A-Za-z0-9]*$/.test(l) ? nice(l) : l)]);
    else if (x.t === 'int') Object.assign(it, { options: [], num: { min: -2147483648, max: 2147483647 } });
    else if (x.t === 'float') Object.assign(it, { options: [], num: { min: -1e9, max: 1e9, decimals: true } });
    else Object.assign(it, { options: [], type: 'text' });
    out.push(it);
  }
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
  const S = SCHEMA[ctx.emu], defs = Object.fromEntries((db()[ctx.emu] || []).map((x) => [x.s + '.' + x.k, x.d]));
  return [...S.items.map((it) => (defs[it.id] != null && it.def == null ? { ...it, def: defs[it.id] } : it)), ...moreItems(ctx, F, S.items.map((x) => x.id))];
};
// what the screen shows: each setting with the game's value (or none) and the emulator's own
function describe(ctx) {
  const S = SCHEMA[ctx.emu], F = files(ctx);
  if (!S || !F) return null;
  const own = read(F.file);
  const bases = F.base.map(read);
  const items = itemsOf(ctx, F).map((it) => {
    const [sec, key] = split(it.id);
    const game = own != null && !(F.copyBase && !ownMarked(ctx, F.file, it.id)) ? getIn(F.kind, own, sec, key) : undefined;
    let base;
    for (const t of bases) { base = getIn(F.kind, t, F.dolphin ? DOLPHIN_BASE[sec] || sec : sec, key); if (base !== undefined) break; }
    if (base === undefined && it.def != null) base = it.def; // not in its file: the emulator's own default
    const opts = it.type === 'bool' ? [[it.on, 'On'], [it.off, 'Off']] : (it.options || []).map((o) => (Array.isArray(o) ? o : [o, o]));
    return { id: it.id, tab: it.tab || TABS[ctx.emu]?.[sec] || (/^(Video|EmuCore\/GS|GPU|Graphics|Video_\w+)$/.test(sec) ? 'Graphics' : 'System'), label: it.label, sub: it.sub || '', options: opts.map(([v, l]) => ({ value: v, label: l })), game: game ?? null, base: base ?? null, type: it.type || 'choice', num: it.num || null, group: it.group || null };
  });
  // tabs in the emulator's order (TABS), the picked settings first in each
  const order = TABS[ctx.emu] ? [...new Set(Object.values(TABS[ctx.emu]))] : null;
  if (order) { const r = (x) => { const i = order.indexOf(x.tab); return i < 0 ? 99 : i; }; items.sort((a, b) => r(a) - r(b)); }
  return { emu: ctx.emu, name: S.name, file: F.file, exists: own != null, items };
}
// PPSSPP's game file is a full copy, so only the keys Cartridge set count as "this game's" (the rest
// came from your normal settings when the file was made); records in game-settings.json
let recsFile = null;
const recs = () => { try { return JSON.parse(fs.readFileSync(recsFile, 'utf8')); } catch { return {}; } };
const saveRecs = (r) => { if (recsFile) { fs.mkdirSync(path.dirname(recsFile), { recursive: true }); fs.writeFileSync(recsFile, JSON.stringify(r, null, 1)); } };
function ownMarked(ctx, file, id) { const r = recs()[file]; return !r || !r.copied || (r.keys || []).includes(id); }
// changes: [{ id, value }] (value null = back to the emulator's own)
function apply(ctx, changes) {
  const S = SCHEMA[ctx.emu], F = files(ctx);
  if (!S || !F) throw new Error('Cartridge can’t change this emulator’s per-game settings.');
  let text = read(F.file);
  const r = recs(), rec = r[F.file] || { created: text == null, keys: [] };
  if (text == null) {
    text = F.copyBase && F.base[0] ? read(F.base[0]) || '' : F.kind === 'json' ? '{}' : '';
    rec.copied = !!(F.copyBase && text);
  }
  const all = itemsOf(ctx, F);
  for (const c of changes) {
    const it = all.find((x) => x.id === c.id);
    if (!it) continue;
    const [sec, key] = split(it.id);
    let value = c.value == null ? undefined : String(c.value);
    // a typed number (0.9.29): any value in the emulator's own range
    const typed = it.num && value !== undefined && /^-?\d+(\.\d+)?$/.test(value) && (it.num.decimals || !value.includes('.')) && Number(value) >= it.num.min && Number(value) <= it.num.max;
    if (it.type === 'text' && value !== undefined) value = value.replace(/[\r\n]+/g, ' ').trim();
    if (value !== undefined && it.type !== 'bool' && it.type !== 'text' && !typed && !(it.options || []).some((o) => String(Array.isArray(o) ? o[0] : o) === value)) throw new Error(it.num ? `${it.label}: a number from ${it.num.min} to ${it.num.max}.` : `${it.label}: that value isn’t one Cartridge offers.`);
    if (value !== undefined && it.type === 'bool' && value !== it.on && value !== it.off) throw new Error(`${it.label}: on or off only.`);
    if (F.copyBase && value === undefined && rec.copied) { // PPSSPP: back to your normal setting's value
      const b = F.base[0] && getIn('ini', read(F.base[0]), sec, key);
      value = b;
    }
    if (F.kind === 'yml') text = ymlPut(text, sec, key, value);
    else if (F.kind === 'json') { let j = {}; try { j = JSON.parse(text || '{}'); } catch {} if (value === undefined) { if (j[sec]) { delete j[sec][key]; if (!Object.keys(j[sec]).length) delete j[sec]; } } else (j[sec] ||= {})[key] = it.json === 'bool' ? value === 'true' : it.json === 'int' || it.json === 'num' ? Number(value) : value; text = JSON.stringify(j, null, 4); }
    else text = iniPut(text, sec, key, value);
    rec.keys = c.value == null ? rec.keys.filter((k) => k !== it.id) : [...new Set([...rec.keys, it.id])];
  }
  // a file Cartridge made that holds nothing of yours any more goes away again
  const empty = F.kind === 'json' ? (() => { try { return !Object.keys(JSON.parse(text)).length; } catch { return false; } })() : F.kind === 'yml' ? !String(text).replace(/\{\}\s*/g, '').trim() : !String(text).split(/\r?\n/).some((l) => l.includes('='));
  fs.mkdirSync(path.dirname(F.file), { recursive: true });
  if (rec.created && (!rec.keys.length && (empty || rec.copied))) { fs.rmSync(F.file, { force: true }); delete r[F.file]; }
  else { const tmp = F.file + '.cartridge-new'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, F.file); r[F.file] = rec; }
  saveRecs(r);
  return describe(ctx);
}
module.exports = { SCHEMA, describe, apply, files, iniGet, iniPut, ymlPut, ymlGet, setRecsFile: (f) => { recsFile = f; } };
