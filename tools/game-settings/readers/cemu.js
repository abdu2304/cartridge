// Cemu's per-game settings: Cafe/GameProfile/GameProfile.cpp (GameProfile::Load reads <config>/gameProfiles/<title ID>.ini,
// section by section; Save writes it), config/CemuConfig.h (how each enum is written) and
// gui/wxgui/GameProfileWindow.cpp (Cemu's own names and tips). Docs: docs/game-settings/cemu.md
const fs = require('fs');
const path = require('path');
const RAW = 'https://raw.githubusercontent.com/cemu-project/Cemu/main/src/';
// read by Load but used by nothing (so a game file can't change them): disableAudio (IsAudioDisabled is never called),
// precompiledShaders (ActiveSettings::GetPrecompiledShadersOption always returns Auto). Metal options are macOS only.
const UNUSED = new Set(['disableAudio', 'precompiledShaders']);
// what each key is in the game profile window (member -> wx control), and the global setting it falls back to
const UI = { loadSharedLibraries: 'm_load_libs', startWithPadView: 'm_start_with_padview', cpuMode: 'm_cpu_mode', threadQuantum: 'm_thread_quantum', graphics_api: 'm_graphic_api', accurateShaderMul: 'm_shader_mul_accuracy', controller: 'm_controller_profile' };
const BASE = { graphics_api: 'Graphic.api' }; // settings.xml <content><Graphic><api> (0 OpenGL, 1 Vulkan)
const TAB = { General: 'General', CPU: 'CPU', Graphics: 'Graphics', Controller: 'Controls' };
const ADV = /^(loadSharedLibraries|threadQuantum|accurateShaderMul)$/; // the window marks these "EXPERT OPTION"

function read(dir) {
  const src = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const prof = src('GameProfile.cpp'), cfg = src('CemuConfig.h'), win = src('GameProfileWindow.cpp');
  const load = prof.slice(prof.indexOf('bool GameProfile::Load'), prof.indexOf('void GameProfile::Save'));
  const save = prof.slice(prof.indexOf('void GameProfile::Save'), prof.indexOf('void GameProfile::ResetOptional'));
  const noMetal = (t) => t.replace(/#ifdef ENABLE_METAL[\s\S]*?#endif/g, '');
  // fmt::formatter<Enum> cases: how Save spells each value
  const spell = (en) => {
    const m = new RegExp(`formatter<${en}>[\\s\\S]*?switch[\\s\\S]*?\\}`).exec(cfg); if (!m) throw new Error('no formatter for ' + en);
    return [...m[0].matchAll(/case \w+::(\w+): name = "([^"]*)"/g)].map((x) => ({ id: x[1], v: x[2] }));
  };
  // wx strings: _("text") in the window; tips after "EXPERT OPTION\n"
  const tip = (ctl) => { const m = new RegExp(ctl + '->SetToolTip\\(_\\("([^"]*)"').exec(win); return m ? m[1].replace(/^EXPERT OPTION\\n/, '').replace(/\\n\\nRecommended: .*$/, '').replace(/\\n/g, ' ') : null; };
  const label = (ctl) => {
    const cb = new RegExp(ctl + ' = new wxCheckBox\\([^,]+, wxID_ANY, _\\("([^"]*)"').exec(win); if (cb) return cb[1];
    const at = win.indexOf(ctl + ' = new wxChoice'); if (at < 0) return null;
    const before = [...win.slice(0, at).matchAll(/new wxStaticText\([^,]+, wxID_ANY, _\("([^"]*)"\)/g)]; return before.length ? before[before.length - 1][1] : null;
  };
  const out = [];
  for (const blk of noMetal(load).split(/GetCurrentSectionName\(\), "/).slice(1)) {
    const sec = blk.slice(0, blk.indexOf('"'));
    for (const m of blk.matchAll(/gameProfile_load(BooleanOption2|IntegerOption|EnumOption)\(&?iniParser, "(\w+)", &?(\w+)(?:, (-?\w+), (\w+)(?:, (\w+))?)?\)/g)) {
      const [, kind, k, member] = m; if (UNUSED.has(k) || out.some((x) => x.k === k)) continue; // cpuMode is read twice (legacy names)
      if (!save.includes(`(${k})`) && !save.includes(`(${k},`)) continue; // Save doesn't keep it
      const ctl = UI[k], e = { s: sec, k, l: (ctl && label(ctl)) || null, desc: (ctl && tip(ctl)) || null };
      if (kind === 'BooleanOption2') Object.assign(e, { t: 'bool', o: [['true', 'On'], ['false', 'Off']] });
      else if (kind === 'IntegerOption') { const n = [m[4], m[5], m[6]].filter(Boolean).map((v) => Number(v.replace(/U$/, ''))); Object.assign(e, { t: 'int', min: n[n.length - 2], max: n[n.length - 1] }); }
      else Object.assign(e, { t: 'enum', en: member });
      out.push(e);
    }
  }
  const by = Object.fromEntries(out.map((x) => [x.k, x]));
  const H = src('GameProfile.h');
  // threadQuantum: integer range from Load, choices from the window's list; default kThreadQuantumDefault
  if (by.threadQuantum) {
    const q = /quantum_values\[\] = \{([^}]*)\}/.exec(win); const def = /kThreadQuantumDefault = (\d+)/.exec(H)[1];
    Object.assign(by.threadQuantum, { t: 'enum', d: def, o: [...q[1].matchAll(/"(\d+)"/g)].map((x) => [x[1], x[1] + ' cycles']), min: undefined, max: undefined });
  }
  // graphics_api: the window offers "", OpenGL, Vulkan; Load takes 0..1 (GraphicAPI kOpenGL = 0, kVulkan); unset = settings.xml
  if (by.graphics_api) Object.assign(by.graphics_api, { t: 'enum', d: null, o: [['0', 'OpenGL'], ['1', 'Vulkan']], min: undefined, max: undefined });
  if (by.cpuMode) { // Multi-core recompiler etc.; DualcoreRecompiler is deprecated (Load maps it to multi-core)
    const names = /cpu_modes\[\] = \{([^}]*)\}/.exec(win)[1].match(/_\("([^"]*)"\)/g).map((x) => x.slice(3, -2));
    const vals = spell('CPUMode').filter((x) => x.id !== 'DualcoreRecompiler');
    Object.assign(by.cpuMode, { l: 'CPU mode', d: 'Auto', o: vals.map((x, i) => [x.v, names[i] || x.v]) });
  }
  if (by.accurateShaderMul) { // AccurateShaderMulOption True/False written as true/false; default True
    const v = spell('AccurateShaderMulOption'); Object.assign(by.accurateShaderMul, { t: 'bool', d: 'true', o: [[v.find((x) => x.id === 'True').v, 'On'], [v.find((x) => x.id === 'False').v, 'Off']] });
  }
  if (by.loadSharedLibraries) by.loadSharedLibraries.d = 'true'; // ShouldLoadSharedLibraries().value_or(true)
  if (by.startWithPadView) by.startWithPadView.d = 'false';
  // [Controller] controller1..8: a profile name from <config>/controllerProfiles (Load reads controller{i + 1})
  if (/FindOption\(fmt::format\("controller\{\}"/.test(load)) {
    for (let i = 1; i <= 8; i++) out.push({ s: 'Controller', k: 'controller' + i, t: 'text', d: null, l: 'Controller ' + i, desc: tip('m_controller_profile\\[i\\]') || 'Forces a given controller profile' });
  }
  return out.map((x) => {
    const r = { s: x.s, k: x.k, t: x.t, d: x.d ?? null };
    if (x.o) r.o = x.o; if (x.min != null) r.min = x.min; if (x.max != null) r.max = x.max;
    r.l = x.l || x.k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
    if (x.desc) r.desc = x.desc;
    r.tab = ADV.test(x.k) ? 'Advanced' : TAB[x.s] || x.s; if (ADV.test(x.k)) r.adv = true;
    if (BASE[x.k]) r.base = BASE[x.k];
    return r;
  });
}

module.exports = {
  id: 'cemu',
  files: [
    { url: RAW + 'Cafe/GameProfile/GameProfile.cpp', as: 'GameProfile.cpp' },
    { url: RAW + 'Cafe/GameProfile/GameProfile.h', as: 'GameProfile.h' },
    { url: RAW + 'config/CemuConfig.h', as: 'CemuConfig.h' },
    { url: RAW + 'gui/wxgui/GameProfileWindow.cpp', as: 'GameProfileWindow.cpp' },
  ],
  read,
};
