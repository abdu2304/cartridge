'use strict';
// Best Settings for This Device (0.9.96, owner's pick from the "make it OP" list): what this device is, and the
// settings that suit it for each emulator Cartridge can set per game (gameSettings.SCHEMA). Offered in a game's
// Game Settings as one press (Best for This Device): you see what changes, then it's saved like any pick there, and
// "Back to the emulator's own" undoes it. Only renderer, resolution and shader choices, where a device's power decides
// the answer; nothing that changes how a game plays. Every value is one the schema offers (test/bestSettings.test.js).
//
// The device: the firmware's product name (DMI) for the handhelds people play on; else the graphics card's maker
// (/sys/class/drm), the CPU threads and memory, and whether it runs on a battery. The screen it shows on (a 4K TV)
// caps the resolution: more than the screen shows only costs speed.
const fs = require('fs');
const path = require('path');

const HANDHELDS = [
  [/^jupiter$/i, 'Steam Deck LCD', 'deck'],
  [/^galileo$/i, 'Steam Deck OLED', 'deck'],
  [/rc72l/i, 'ROG Ally X', 'handheld'],
  [/rc71l/i, 'ROG Ally', 'handheld'],
  [/^83e1$/i, 'Legion Go', 'handheld'],
  [/^83(l3|n6|q2|q3)$/i, 'Legion Go S', 'handheld'],
  [/claw/i, 'MSI Claw', 'handheld'],
  [/^(onexplayer|aokzoe|ayaneo|gpd win)/i, null, 'handheld'],
];
const VENDOR = { '0x10de': 'NVIDIA', '0x1002': 'AMD', '0x8086': 'Intel' };

// read: (file) => text | null (the device's own files); facts the caller has: { cpus, memGB, screenH }
function detect({ read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } }, list = (d) => { try { return fs.readdirSync(d); } catch { return []; } }, cpus = 4, memGB = 8, screenH = 1080 } = {}) {
  const t = (f) => String(read(f) || '').trim();
  const product = t('/sys/class/dmi/id/product_name'), vendor = t('/sys/class/dmi/id/sys_vendor'), board = t('/sys/class/dmi/id/board_name');
  const gpus = [...new Set(list('/sys/class/drm').filter((n) => /^card\d+$/.test(n)).map((n) => VENDOR[t(path.join('/sys/class/drm', n, 'device/vendor'))]).filter(Boolean))];
  const battery = list('/sys/class/power_supply').some((n) => /^BAT/i.test(n));
  const out = { name: '', tier: 'laptop', gpus, cpus, memGB: Math.round(memGB), screenH, battery };
  for (const [re, name, tier] of HANDHELDS) {
    if (re.test(product) || re.test(board)) { out.name = name || `${vendor} ${product}`.trim(); out.tier = tier; break; }
  }
  if (!out.name) {
    out.name = [vendor, product].filter((x) => x && !/to be filled|system product name|default string/i.test(x)).join(' ') || 'This PC';
    out.tier = cpus <= 4 || memGB < 7.5 ? 'low' : !battery && (gpus.includes('NVIDIA') || (gpus.includes('AMD') && cpus >= 8) || cpus >= 12) ? 'desktop' : battery ? 'laptop' : 'desktop';
  }
  return out;
}

// the highest output each emulator is offered at, by how much power the device has: PS3 is the hardest to run, so it
// stays at 720p everywhere but a desktop
const CAP = {
  deck: { rpcs3: 720, pcsx2: 720, duckstation: 720, dolphin: 720, ppsspp: 720 },
  low: { rpcs3: 720, pcsx2: 720, duckstation: 720, dolphin: 720, ppsspp: 720 },
  handheld: { rpcs3: 720, pcsx2: 1080, duckstation: 1080, dolphin: 1080, ppsspp: 1080 },
  laptop: { rpcs3: 720, pcsx2: 1080, duckstation: 1080, dolphin: 1080, ppsspp: 1080 },
  desktop: { rpcs3: 1440, pcsx2: 2160, duckstation: 2160, dolphin: 2160, ppsspp: 2160 },
};
// each emulator's resolution choice for 720p, 1080p, 1440p and 4K (gameSettings.SCHEMA's own values)
const RES = {
  rpcs3: ['Video.Resolution Scale', { 720: '100', 1080: '150', 1440: '200', 2160: '300' }],
  pcsx2: ['EmuCore/GS.upscale_multiplier', { 720: '2', 1080: '3', 1440: '4', 2160: '6' }],
  duckstation: ['GPU.ResolutionScale', { 720: '3', 1080: '4', 1440: '6', 2160: '9' }],
  dolphin: ['Video_Settings.InternalResolution', { 720: '2', 1080: '3', 1440: '4', 2160: '6' }],
  ppsspp: ['Graphics.InternalResolution', { 720: '3', 1080: '4', 1440: '6', 2160: '8' }],
};
const STEPS = [2160, 1440, 1080, 720];
const P = (h) => (h >= 2160 ? '4K' : h + 'p');

// -> [{ id, value, why }] for one emulator on this device
function recommend(emu, dev) {
  const out = [], cap = CAP[dev.tier]?.[emu];
  if (RES[emu] && cap) {
    const h = STEPS.find((s) => s <= Math.min(cap, Math.max(720, dev.screenH || 720))) || 720;
    const on = /^this pc$/i.test(dev.name) ? 'this PC' : `the ${dev.name}`;
    const why = h < (dev.screenH || 0) && h === cap ? `so ${emuName(emu)} games stay at full speed on ${on}` : `to match the ${P(h)} screen`;
    out.push({ id: RES[emu][0], value: RES[emu][1][h], why });
  }
  // Vulkan where the emulator offers it: the faster and smoother renderer on Linux, on every GPU here
  if (emu === 'rpcs3') out.push({ id: 'Video.Renderer', value: 'Vulkan', why: 'the faster renderer on Linux' });
  if (emu === 'pcsx2') out.push({ id: 'EmuCore/GS.Renderer', value: '14', why: 'the faster renderer on Linux' });
  if (emu === 'duckstation') out.push({ id: 'GPU.Renderer', value: 'Vulkan', why: 'the faster renderer on Linux' });
  // RPCS3 builds shaders as it meets them: with the interpreter the game keeps running instead of stuttering
  if (emu === 'rpcs3') out.push({ id: 'Video.Shader Mode', value: 'Async Recompiler with Shader Interpreter', why: 'less stutter while shaders are built' });
  return out;
}
const emuName = (e) => ({ rpcs3: 'PS3', pcsx2: 'PS2', duckstation: 'PS1', dolphin: 'GameCube and Wii', ppsspp: 'PSP' }[e] || e);
const TIER = { deck: 'a Steam Deck', handheld: 'a handheld PC', laptop: 'a laptop', desktop: 'a desktop PC', low: 'a lower-powered PC' };

module.exports = { detect, recommend, CAP, RES, HANDHELDS, TIER };
