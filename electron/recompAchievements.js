'use strict';
// Achievements recomps record themselves (0.9.65, owner: "achievements are read where a recomp records them").
// Read only, like emulator trophies. Two formats, each read as its project's own source writes it:
//   hedge   (Unleashed Recompiled, Marathon Recompiled: user/achievement_data.h): "ACH " signature, version, checksum,
//           reserved (16 bytes), then packed records of 16 bytes: uint16 ID, time_t (int64) unlock time, 6 reserved.
//           ID 0 is an empty record. The names live in the player's own game files, so only IDs and times are known.
//           File: <user>/save/<file>, user = ~/.config/<dir> when ~/.config exists, else ~/.<dir> (user/paths.cpp).
//   rexglue (the ReXGlue SDK most Xbox 360 recomps are built with: system/achievement_manager.cpp): unlocks in
//           <XDG_DATA_HOME or ~/.local/share>/<app>/achievements/<TITLEID>.toml as [unlocked.<id>] filetime = N
//           (Windows FILETIME), names in the achievements.toml the recomp ships ([[achievements]] id, label,
//           description, gamerscore).
//   ps4     (Cartridge Verified PS4 ports, 0.9.71): see readPs4Unlocks.
// Tested in test/recomps.test.js.
const fs = require('fs');
const path = require('path');
const os = require('os');

const FILETIME_EPOCH = 11644473600000; // ms between 1601-01-01 and 1970-01-01
function readHedge(buf) {
  if (!buf || buf.length < 16 || buf.toString('latin1', 0, 4) !== 'ACH ') return null;
  const out = [];
  for (let o = 16; o + 16 <= buf.length; o += 16) {
    const id = buf.readUInt16LE(o);
    if (!id) continue;
    const t = Number(buf.readBigInt64LE(o + 2));
    out.push({ id, time: t > 0 ? t * 1000 : null });
  }
  return out;
}
function readRexUnlocks(text) {
  const out = [], t = String(text || '');
  for (const m of t.matchAll(/^\s*\[\s*unlocked\s*\.\s*"?(\d+)"?\s*\]\s*\r?\n\s*filetime\s*=\s*(\d+)/gm)) {
    const ft = Number(m[2]);
    out.push({ id: Number(m[1]), time: ft > 0 ? Math.round(ft / 10000 - FILETIME_EPOCH) : null });
  }
  // the older form, before filetimes: unlocked = [1, 2, 3]
  const arr = /^\s*unlocked\s*=\s*\[([^\]]*)\]/m.exec(t);
  if (arr) for (const n of arr[1].split(',').map((x) => Number(x.trim())).filter(Boolean)) if (!out.some((x) => x.id === n)) out.push({ id: n, time: null });
  return out;
}
// the PS4 ports' unlocks (0.9.71): "<id> <unix time>" lines (Bloodborne's trophies.log) and "Runtime: trophy <id>
// unlocked" (every port's output, kept by Cartridge's start script; no time there)
function readPs4Unlocks(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/^(\d{1,3})\s+(\d{9,11})\s*$|Runtime: trophy (\d{1,3}) unlocked/gm)) {
    if (m[1] != null) out.push({ id: Number(m[1]), time: Number(m[2]) * 1000 });
    else out.push({ id: Number(m[3]), time: null });
  }
  return out;
}
// achievements.toml: each [[achievements]] block's own keys (the language subtables after it are left out)
function readRexMeta(text) {
  const out = [];
  for (const block of String(text || '').split(/^\s*\[\[achievements\]\]\s*$/m).slice(1)) {
    const own = block.split(/^\s*\[/m)[0];
    const get = (k) => { const m = new RegExp(`^\\s*${k}\\s*=\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|(-?\\d+))`, 'm').exec(own); return m ? (m[1] != null ? m[1].replace(/\\(.)/g, '$1') : Number(m[2])) : null; };
    const id = get('id');
    if (id == null) continue;
    out.push({ id: Number(id), name: get('label') || `Achievement ${id}`, desc: get('description') || '', score: get('gamerscore') || 0 });
  }
  return out;
}
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const ls = (d) => { try { return fs.readdirSync(d); } catch { return []; } };
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
// achievements.toml a recomp ships: in its folder or a few levels down
function findMeta(dir, depth = 3) {
  const f = path.join(dir, 'achievements.toml');
  if (fs.existsSync(f)) return f;
  if (depth <= 0) return null;
  for (const n of ls(dir)) { const d = path.join(dir, n); if (isDir(d) && !n.startsWith('.')) { const r = findMeta(d, depth - 1); if (r) return r; } }
  return null;
}
// where one installed recomp keeps its unlocks: { format, files, meta } or null.
// it: { id, name, program, dir, ach: { format, user, file } from the catalogue }
function locate(it, { home = os.homedir(), env = process.env } = {}) {
  const ach = it.ach || {};
  // 0.9.71, Cartridge Verified PS4 ports: the recipe names the files (recipes.achievementsOf), names come from the
  // recipe's list or the player's own copy (its trophy file, decrypted when a shadPS4 trophy key is set up)
  if (ach.format === 'ps4') return { format: 'ps4', files: (ach.files || []).filter((f) => fs.existsSync(f)), list: ach.list || null, game: ach.game || null, always: true };
  if (ach.format === 'hedge' && ach.user && ach.file) {
    const portable = fs.existsSync(path.join(it.dir, 'portable.txt')) ? [path.join(it.dir, 'save', ach.file)] : [];
    // a Flatpak build (Unleashed's Linux release) keeps it inside its own sandbox folder
    const fpk = it.flatpak ? [path.join(home, '.var/app', it.flatpak, 'config', ach.user, 'save', ach.file), path.join(home, '.var/app', it.flatpak, '.' + ach.user, 'save', ach.file)] : [];
    const files = [...portable, ...fpk, path.join(home, '.config', ach.user, 'save', ach.file), path.join(home, '.' + ach.user, 'save', ach.file)].filter((f) => fs.existsSync(f));
    return files.length ? { format: 'hedge', files: files.slice(0, 1), meta: null } : null;
  }
  // ReXGlue: its achievements.toml beside the program marks it; the unlock folder is named after the app
  const meta = ach.format === 'rexglue' || !ach.format ? findMeta(it.dir) : null;
  if (!meta) return null;
  const data = env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  const want = [ach.user, it.name, path.basename(it.program || '', path.extname(it.program || ''))].filter(Boolean).map(norm);
  const apps = ach.user ? [ach.user] : ls(data).filter((n) => want.some((w) => w && (norm(n) === w || norm(n).includes(w) || w.includes(norm(n)))) && norm(n).length > 3);
  const files = [];
  const take = (d) => { for (const f of ls(d)) if (/^[0-9A-F]{8}\.toml$/i.test(f)) files.push(path.join(d, f)); };
  for (const a of apps) take(path.join(data, a, 'achievements'));
  // projects that keep profiles (re:Blue: profiles/<name>/achievements/<TITLEID>.toml), beside the program or in its own folder
  for (const base of [it.dir, ...(ach.user ? [path.join(home, '.config', ach.user), path.join(data, ach.user)] : [])]) for (const p of ls(path.join(base || '', 'profiles'))) take(path.join(base, 'profiles', p, 'achievements'));
  return { format: 'rexglue', files, meta };
}
// one recomp's achievements as a trophy-source game (trophies.js): every one the recomp lists, unlocked or not;
// for hedge, only the unlocked ones (their names are in the game's files)
function gameOf(it, where, read = (f) => fs.readFileSync(f)) {
  if (!where) return null;
  const got = new Map();
  for (const f of where.files) {
    let list = null;
    try { list = where.format === 'hedge' ? readHedge(read(f)) : where.format === 'ps4' ? readPs4Unlocks(read(f).toString('utf8')) : readRexUnlocks(read(f).toString('utf8')); } catch {}
    for (const u of list || []) { const p = got.get(u.id); if (!p || (u.time && (!p.time || u.time < p.time))) got.set(u.id, u); }
  }
  let defs = [];
  if (where.meta) { try { defs = readRexMeta(read(where.meta).toString('utf8')); } catch {} }
  if (where.format === 'ps4') {
    let own = null;
    try { own = where.game ? require('./trophies').portTrophyDefs(where.game) : null; } catch {}
    if (own?.length) defs = own;
    else if (where.list) defs = where.list.map(([id, name, desc, grade]) => ({ id, name, desc, grade, score: 0 }));
  }
  if (!defs.length) defs = [...got.keys()].sort((a, b) => a - b).map((id) => ({ id, name: `${where.format === 'ps4' ? 'Trophy' : 'Achievement'} ${id}`, desc: '', score: 0 }));
  if (!defs.length) return null;
  return {
    src: 'recomp', set: 'recomp-' + it.id, title: it.game || it.name, titleId: it.id, icon: '', recomp: it.id,
    trophies: defs.map((d) => ({ id: d.id, name: d.name, desc: d.desc, grade: d.grade || null, points: d.score || 0, hidden: false, icon: d.icon || '', unlocked: got.has(d.id), time: got.get(d.id)?.time || null })),
    files: where.files,
  };
}
module.exports = { readPs4Unlocks, readHedge, readRexUnlocks, readRexMeta, findMeta, locate, gameOf, FILETIME_EPOCH };
