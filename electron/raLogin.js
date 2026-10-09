// Signs the installed emulators in to RetroAchievements, the way each one does it itself after its
// own login: the password goes to RetroAchievements once for a token and is never kept; only the
// token and username are written, into the exact keys and files each emulator reads (from source):
// - PCSX2: inis/PCSX2.ini [Achievements] Enabled, Username, LoginTimestamp; the token in
//   inis/secrets.ini [Achievements] Token (a Token left in PCSX2.ini would be moved over it, so it goes).
// - DuckStation: settings.ini [Cheevos] Enabled, Username, LoginTimestamp, Token encrypted as
//   EncryptLoginToken: key = SHA256(/etc/machine-id + username) then 100 more SHA256 rounds,
//   AES-128-CBC with key[0..16], IV key[16..32], zero padding, base64.
// - Dolphin: RetroAchievements.ini [Achievements] Enabled, Username, ApiToken.
// - PPSSPP: PSP/SYSTEM/ppsspp.ini [Achievements] AchievementsEnable, AchievementsUserName; the token
//   alone in ppsspp_retroachievements.dat next to it.
// - RetroArch: retroarch.cfg cheevos_enable, cheevos_username, cheevos_token, cheevos_password "".
// Only emulators that have been opened once (their settings exist) are offered; nothing is created
// for an emulator that isn't set up.
const fs = require('fs');
const webFetch = require('./webFetch');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

// Where each emulator keeps its settings (standard install, Flatpak, Steam RetroArch)
function targets(home = os.homedir(), { steamRoots = [], env = process.env } = {}) {
  const cfg = env.XDG_CONFIG_HOME || path.join(home, '.config');
  const data = env.XDG_DATA_HOME || path.join(home, '.local/share');
  const v = (id, ...p) => path.join(home, '.var/app', id, ...p);
  const out = [];
  const add = (t) => { if (!out.some((o) => o.main === t.main)) out.push(t); };
  for (const root of [path.join(cfg, 'PCSX2'), path.join(home, '.config/PCSX2'), v('net.pcsx2.PCSX2', 'config/PCSX2')]) {
    const main = path.join(root, 'inis', 'PCSX2.ini');
    if (exists(main)) add({ id: 'pcsx2', name: 'PCSX2', main, files: [main, path.join(root, 'inis', 'secrets.ini')], flatpak: root.includes('/.var/app/') });
  }
  for (const root of [path.join(data, 'duckstation'), path.join(home, '.local/share/duckstation'), v('org.duckstation.DuckStation', 'data/duckstation')]) {
    const main = path.join(root, 'settings.ini');
    if (exists(main)) add({ id: 'duckstation', name: 'DuckStation', main, files: [main], flatpak: root.includes('/.var/app/') });
  }
  for (const root of [path.join(cfg, 'dolphin-emu'), path.join(home, '.config/dolphin-emu'), v('org.DolphinEmu.dolphin-emu', 'config/dolphin-emu')]) {
    const main = path.join(root, 'RetroAchievements.ini');
    if (exists(path.join(root, 'Dolphin.ini'))) add({ id: 'dolphin', name: 'Dolphin', main, files: [main], flatpak: root.includes('/.var/app/') });
  }
  for (const root of [path.join(cfg, 'ppsspp'), path.join(home, '.config/ppsspp'), v('org.ppsspp.PPSSPP', 'config/ppsspp')]) {
    const main = path.join(root, 'PSP', 'SYSTEM', 'ppsspp.ini');
    if (exists(main)) add({ id: 'ppsspp', name: 'PPSSPP', main, files: [main, path.join(root, 'PSP', 'SYSTEM', 'ppsspp_retroachievements.dat')], flatpak: root.includes('/.var/app/') });
  }
  for (const root of [path.join(cfg, 'retroarch'), path.join(home, '.config/retroarch'), v('org.libretro.RetroArch', 'config/retroarch'), ...steamRoots.map((r) => path.join(r, 'steamapps/common/RetroArch'))]) {
    const main = path.join(root, 'retroarch.cfg');
    if (exists(main)) add({ id: 'retroarch', name: 'RetroArch', main, files: [main], flatpak: root.includes('/.var/app/') });
  }
  for (const t of out) t.user = signedInAs(t);
  return out;
}

// [Section] key = value: replace keys in place, add missing ones at the end of the section
function iniSet(text, section, pairs, remove = []) {
  const nl = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = text ? text.split(/\r?\n/) : [];
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  let start = lines.findIndex((l) => l.trim() === `[${section}]`);
  if (start < 0) { if (lines.length) lines.push(''); lines.push(`[${section}]`); start = lines.length - 1; }
  let end = start + 1;
  while (end < lines.length && !/^\s*\[.*\]\s*$/.test(lines[end])) end++;
  const keyOf = (l) => { const i = l.indexOf('='); return i > 0 && !/^\s*[;#]/.test(l) ? l.slice(0, i).trim() : null; };
  const left = new Map(Object.entries(pairs));
  for (let i = end - 1; i > start; i--) {
    const k = keyOf(lines[i]);
    if (k && remove.includes(k)) { lines.splice(i, 1); end--; }
    else if (k && left.has(k)) { lines[i] = `${k} = ${left.get(k)}`; left.delete(k); }
  }
  let at = end; while (at - 1 > start && lines[at - 1].trim() === '') at--;
  lines.splice(at, 0, ...[...left].map(([k, val]) => `${k} = ${val}`));
  return lines.join(nl) + nl;
}
const iniGet = (text, section, key) => {
  let inside = false;
  for (const l of String(text).split(/\r?\n/)) {
    const t = l.trim();
    if (/^\[.*\]$/.test(t)) { inside = t === `[${section}]`; continue; }
    const i = t.indexOf('=');
    if (inside && i > 0 && t.slice(0, i).trim() === key) return t.slice(i + 1).trim();
  }
  return '';
};
// retroarch.cfg: key = "value" lines
function cfgSet(text, pairs) {
  const nl = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = text ? text.split(/\r?\n/) : [];
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const left = new Map(Object.entries(pairs));
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*([\w.]+)\s*=/);
    if (m && left.has(m[1])) { lines[i] = `${m[1]} = "${left.get(m[1])}"`; left.delete(m[1]); }
  }
  for (const [k, val] of left) lines.push(`${k} = "${val}"`);
  return lines.join(nl) + nl;
}
const cfgGet = (text, key) => (String(text).match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, 'm')) || [])[1] || '';

function signedInAs(t) {
  const text = read(t.main);
  if (t.id === 'pcsx2') return iniGet(text, 'Achievements', 'Username');
  if (t.id === 'duckstation') return iniGet(text, 'Cheevos', 'Username');
  if (t.id === 'dolphin') return iniGet(text, 'Achievements', 'Username');
  if (t.id === 'ppsspp') return iniGet(text, 'Achievements', 'AchievementsUserName');
  if (t.id === 'retroarch') return cfgGet(text, 'cheevos_username');
  return '';
}

// DuckStation's EncryptLoginToken (machine key left out in portable mode, as DuckStation does)
function duckToken(token, user, machineId = '') {
  let key = crypto.createHash('sha256').update(Buffer.concat([Buffer.from(machineId), Buffer.from(user)])).digest();
  for (let i = 0; i < 100; i++) key = crypto.createHash('sha256').update(key).digest();
  const data = Buffer.alloc(Math.ceil(Buffer.byteLength(token) / 16) * 16);
  data.write(token);
  const c = crypto.createCipheriv('aes-128-cbc', key.subarray(0, 16), key.subarray(16, 32));
  c.setAutoPadding(false);
  return Buffer.concat([c.update(data), c.final()]).toString('base64');
}
function duckDecrypt(enc, user, machineId = '') {
  let key = crypto.createHash('sha256').update(Buffer.concat([Buffer.from(machineId), Buffer.from(user)])).digest();
  for (let i = 0; i < 100; i++) key = crypto.createHash('sha256').update(key).digest();
  const d = crypto.createDecipheriv('aes-128-cbc', key.subarray(0, 16), key.subarray(16, 32));
  d.setAutoPadding(false);
  const b = Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]);
  const z = b.indexOf(0);
  return b.subarray(0, z < 0 ? b.length : z).toString();
}

// Writes one emulator's login. Files are replaced whole through a temp file (no half-written ini).
function writeOne(t, { user, token, now = Math.floor(Date.now() / 1000), machineId = '' }) {
  const put = (p, text) => { const tmp = p + '.cartridge-tmp'; fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(tmp, text); fs.renameSync(tmp, p); };
  if (t.id === 'pcsx2') {
    put(t.files[1], iniSet(read(t.files[1]), 'Achievements', { Token: token }));
    put(t.main, iniSet(read(t.main), 'Achievements', { Enabled: 'true', Username: user, LoginTimestamp: String(now) }, ['Token']));
  } else if (t.id === 'duckstation') {
    put(t.main, iniSet(read(t.main), 'Cheevos', { Enabled: 'true', Username: user, Token: duckToken(token, user, machineId), LoginTimestamp: String(now) }));
  } else if (t.id === 'dolphin') {
    put(t.main, iniSet(read(t.main), 'Achievements', { Enabled: 'True', Username: user, ApiToken: token }));
  } else if (t.id === 'ppsspp') {
    put(t.files[1], token);
    put(t.main, iniSet(read(t.main), 'Achievements', { AchievementsEnable: 'True', AchievementsUserName: user }));
  } else if (t.id === 'retroarch') {
    put(t.main, cfgSet(read(t.main), { cheevos_enable: 'true', cheevos_username: user, cheevos_token: token, cheevos_password: '' }));
  }
}

// Emulators running now would write their settings back over ours when they close
// 0.9.62: every emulator whose files Cartridge writes (game settings, patches) is refused while it runs: it saves its
// settings when it quits, over the change (Eden and Azahar rewrite a game's file when the game starts, Flycast and
// Supermodel their whole main file)
const PROC = { pcsx2: /pcsx2/i, duckstation: /duckstation/i, dolphin: /dolphin-emu/i, ppsspp: /ppsspp/i, retroarch: /retroarch/i, azahar: /azahar/i, citra: /citra/i, rpcs3: /rpcs3/i, shadps4: /shadps4/i, eden: /^eden/i, cemu: /^cemu/i, vita3k: /vita3k/i, xenia: /xenia/i, flycast: /flycast/i, mame: /^mame/i, supermodel: /^supermodel/i, ryujinx: /ryujinx/i };
function running(procDir = '/proc') {
  const out = new Set();
  let ids = []; try { ids = fs.readdirSync(procDir).filter((d) => /^\d+$/.test(d)); } catch { return out; }
  for (const id of ids) {
    const cmd = read(path.join(procDir, id, 'cmdline')).split('\0')[0] || '';
    const base = path.basename(cmd);
    for (const [emu, re] of Object.entries(PROC)) if (re.test(base)) out.add(emu);
  }
  return out;
}

// RetroAchievements' own login (what rcheevos sends): the token comes back, the password goes nowhere else
// RetroAchievements turns away requests with no proper User-Agent (0.9.16: the sign-in failed with
// Node's default one), so it says who it is, as emulators do.
async function login(user, password, { fetchImpl = webFetch, host = 'https://retroachievements.org', ua = 'Cartridge' } = {}) {
  const body = new URLSearchParams({ r: 'login2', u: user, p: password });
  const r = await fetchImpl(`${host}/dorequest.php`, { method: 'POST', body: body.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': ua, Accept: 'application/json' } });
  let j = {}; try { j = await r.json(); } catch {}
  if (!j.Success || !j.Token) throw new Error(j.Error ? `RetroAchievements: ${j.Error}` : (r.status === 401 ? 'Wrong username or password' : `RetroAchievements answered ${r.status}`));
  return { user: j.User || user, token: j.Token };
}

function apply(list, auth, opts = {}) {
  const busy = opts.running || running();
  return list.map((t) => {
    if (busy.has(t.id)) return { id: t.id, name: t.name, ok: false, error: `Close ${t.name} first` };
    try { writeOne(t, { ...auth, machineId: t.id === 'duckstation' && opts.machineId == null ? read('/etc/machine-id') : opts.machineId || '' }); return { id: t.id, name: t.name, ok: true }; }
    catch (e) { return { id: t.id, name: t.name, ok: false, error: e.message }; }
  });
}

module.exports = { targets, apply, login, running, writeOne, iniSet, cfgSet, duckToken, duckDecrypt };
