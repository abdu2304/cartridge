'use strict';
// Search for Saves (0.9.59, owner: "search all layouts to find accurate saves … mine might be elsewhere"). The save
// locator (saves.js) knows where each emulator keeps saves from its own settings; this is the last resort for what
// it can't know: a portable copy in a folder of its own, a save folder copied to another drive, an old install. It
// walks your home and your other drives looking for the shape of each emulator's save folders, and lists what holds
// saves the locator didn't already find. Found saves are only listed: you pick a folder (Use This Folder, or Move
// into the one in use), Cartridge never syncs them on its own.
//
// Async with a time and folder budget, yielding as it goes: a walk of a big drive must never hold Electron's main
// thread (0.9.55: a blocking call made gamescope dim the window). No Electron imports: tested on its own.
const fs = require('fs');
const path = require('path');
const os = require('os');
const S = require('./saves');

const SWITCH = /\b(eden|citron|yuzu|sudachi|suyu|torzu)\b/i;
// folders never walked: caches, build trees, Steam's game and Proton folders, Trash, Cartridge's own backups
const SKIP = new Set(['.cache', '.git', '.npm', '.cargo', '.rustup', '.gradle', '.m2', 'node_modules', '.thumbnails', 'Trash', '.Trash', 'shadercache', 'compatdata', 'steamapps', '.nv', '.mozilla', 'snap', 'proc', 'sys', 'lost+found', '__pycache__', 'site-packages', '.ccache']);
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const has = (d, n) => isDir(path.join(d, n));

// a folder's name and shape -> [{ emu, base, at }] it could be (more than one: Dolphin's GC and Wii side by side)
function shapeOf(dir, names) {
  const n = path.basename(dir), up = path.basename(path.dirname(dir)), out = [];
  if (n === 'save' && up === 'user' && (names.has('0000000000000000') || names.has('account'))) {
    const nand = path.dirname(path.dirname(dir)), emu = ((SWITCH.exec(dir) || [])[1] || 'eden').toLowerCase();
    out.push({ emu, base: path.dirname(nand), at: { nand } });
  }
  if (n === 'dev_hdd0' && names.has('home')) out.push({ emu: 'rpcs3', base: path.dirname(dir), at: { hdd0: dir } });
  if (n === 'SAVEDATA' && up === 'PSP') out.push({ emu: 'ppsspp', base: path.dirname(path.dirname(dir)), at: {} });
  if (n === 'ux0' && has(dir, 'user/00/savedata')) out.push({ emu: 'vita3k', base: path.dirname(dir), at: { pref: path.dirname(dir) } });
  if (n === 'savedata' && [...names].some((x) => S.PS4_ID.test(x) || (/^\d+$/.test(x) && S.ls(path.join(dir, x)).some((e) => e.isDirectory() && S.PS4_ID.test(e.name))))) out.push({ emu: 'shadps4', base: dir, at: { savedata: [dir] } });
  if ([...names].some((x) => /\.ps2$/i.test(x))) out.push({ emu: 'pcsx2', base: dir, at: { memcards: dir } });
  if ([...names].some((x) => /\.mc[dr]$/i.test(x))) out.push({ emu: 'duckstation', base: dir, at: { memcards: dir } });
  if (n === 'GC' && ['USA', 'EUR', 'JAP'].some((r) => names.has(r))) out.push({ emu: 'dolphin', base: path.dirname(dir), at: { gc: dir, wii: null } });
  if (n === 'Wii' && has(dir, 'title/00010000')) out.push({ emu: 'dolphin', base: path.dirname(dir), at: { gc: null, wii: dir } });
  if (n === 'mlc01' && has(dir, 'usr/save')) out.push({ emu: 'cemu', base: path.dirname(dir), at: { mlc: dir } });
  if (n === 'sdmc' && names.has('Nintendo 3DS')) out.push({ emu: 'azahar', base: path.dirname(dir), at: { sdmc: dir } });
  return out;
}

const real = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
// the saves one found place holds (the emulator's own scanner, so they read exactly as the locator's do)
function savesAt(hit) {
  const fn = SWITCH.test(hit.emu) ? (b, at) => S.SCAN.switch(b, hit.emu, at) : S.SCAN[hit.emu];
  try { return ((fn && fn(hit.base, hit.at)) || []).filter((x) => !/\.cartridge-(moved|new|old|kept)\b/.test(x.path)); } catch { return []; }
}

// roots: where to walk (home first); known: real paths of saves already found (skipped); skip: more folders never
// walked; budget: { ms, dirs }; onProgress({ dirs, found }). -> { found: [{ emu, emuName, base, at, place, saves,
// newest, list }], dirs, ms, done (false: the budget ran out first) }
async function search({ roots = [os.homedir()], known = new Set(), skip = [], budget = {}, onProgress = () => {}, maxDepth = 10, stop = () => false } = {}) {
  const t0 = Date.now(), ms = budget.ms ?? 45000, maxDirs = budget.dirs ?? 250000;
  const skipReal = new Set(skip.map(real)), seen = new Set(), found = [], hitSeen = new Set();
  let dirs = 0, done = true;
  // 0.9.63 (owner's log: saves found twice): the same folder can be mounted at two paths (Bazzite mounts the system
  // drive again under /run/media/system/...), so folders and saves are told apart by the disk's own file number
  const idOf = async (p) => { try { const st = await fs.promises.stat(p); return st.dev + ':' + st.ino; } catch { return null; } };
  const seenIds = new Set(), knownIds = new Set((await Promise.all([...known].map(idOf))).filter(Boolean));
  const stack = [...new Set(roots.filter(isDir).map(real))].reverse().map((d) => [d, 0]);
  while (stack.length) {
    if (Date.now() - t0 > ms || dirs >= maxDirs || (dirs % 50 === 0 && stop())) { done = false; break; } // 0.9.63: a game starting stops it (the disk is the game's)
    const [dir, depth] = stack.pop();
    if (seen.has(dir) || skipReal.has(dir)) continue;
    const id = await idOf(dir);
    if (id && seenIds.has(id)) continue;
    seen.add(dir); if (id) seenIds.add(id); dirs++;
    let ents; try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { continue; }
    const names = new Set(ents.map((e) => e.name));
    for (const hit of shapeOf(dir, names)) {
      const key = hit.emu + '\0' + JSON.stringify(hit.at);
      if (hitSeen.has(key)) continue; hitSeen.add(key);
      const list = [];
      for (const s of savesAt(hit)) if (!known.has(real(s.path)) && !knownIds.has(await idOf(s.path))) list.push(s);
      if (!list.length) continue;
      let newest = 0; for (const s of list) { try { newest = Math.max(newest, fs.statSync(s.path).mtimeMs); } catch {} }
      found.push({ emu: hit.emu, emuName: S.NAMES[hit.emu] || hit.emu, base: hit.base, at: hit.at, place: S.placeDir(hit.at, hit.base), saves: list.length, newest, list: list.slice(0, 40).map((s) => ({ label: s.label || path.basename(s.path), path: s.path, keys: s.keys || {} })) });
    }
    if (depth < maxDepth) for (const e of ents) if (e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith('.cartridge') && !e.name.endsWith('.cartridge-moved')) stack.push([path.join(dir, e.name), depth + 1]);
    if (dirs % 250 === 0) { onProgress({ dirs, found: found.length }); await new Promise((r) => setImmediate(r)); }
  }
  return { found, dirs, ms: Date.now() - t0, done };
}

// the drives to look on besides home: removable and mounted drives (SteamOS and Bazzite mount a microSD under
// /run/media), plus any game drives Cartridge knows
function driveRoots(extra = []) {
  const out = [];
  const kids = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() || e.isSymbolicLink()).map((e) => path.join(d, e.name)); } catch { return []; } };
  out.push(...kids('/run/media'), ...kids('/media'));
  out.push(...kids('/mnt'));
  for (const r of extra) out.push(r);
  return [...new Set(out.filter(isDir).map(real))];
}

module.exports = { search, shapeOf, driveRoots, SKIP };
