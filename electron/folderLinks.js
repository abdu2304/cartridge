'use strict';
// Linked Folders (0.9.33, owner: "a fork of shadPS4 should play my games with the same saves"): a fork's save
// folder becomes a link to the original emulator's, so both use one set of saves. Nothing is deleted: a folder
// the fork already had is renamed to <name>.cartridge-kept and put back when the link is removed. Only links
// Cartridge made (recorded by the caller) are ever removed.
const fs = require('fs');
const path = require('path');
const os = require('os');

const KEPT = '.cartridge-kept';
const lst = (p) => { try { return fs.lstatSync(p); } catch { return null; } };
// through links (0.9.56, owner: "it says the folder to share doesn't exist, I'm sure it exists"): EmuDeck makes an
// emulator's save folder a link into Emulation/saves, and lstat calls that a link, not a folder. Whether a folder is
// there is asked through links; only what's at the fork's place (ours to replace) is looked at without following.
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const entries = (p) => { try { return fs.readdirSync(p).filter((n) => !n.startsWith('.')); } catch { return []; } };

// A fork's own data folder, found the way forks keep theirs: portable (beside the program: shadPS4's user/,
// yuzu's user/, Dolphin's User/ or portable/), else a folder named after it under ~/.local/share or ~/.config
function forkBases(exe, home = os.homedir()) {
  const dir = path.dirname(exe), out = [];
  for (const d of [dir, path.join(dir, 'user'), path.join(dir, 'User'), path.join(dir, 'portable')]) out.push({ base: d, how: 'portable' });
  const stem = path.basename(exe).replace(/\.(appimage|exe|sh)$/i, '');
  const names = new Set([stem, stem.replace(/[-_. ]?(v?\d+(\.\d+)+.*|x86_64.*|linux.*|qt.*)$/i, ''), stem.replace(/[-_. ]+/g, '')].filter((n) => n && n.length > 2));
  for (const n of names) for (const r of ['.local/share', '.config']) out.push({ base: path.join(home, r, n), how: 'own' });
  return out;
}
// The fork's base whose layout matches: the save folder's parent (e.g. user/ for user/savedata) exists there
function findForkBase(exe, rel, home) {
  const top = String(rel).split('/')[0];
  return forkBases(exe, home).find((b) => top && isDir(path.join(b.base, top))) || null;
}

// what's at a link's place now
function status(from, to) {
  const s = lst(from);
  if (!s) return { state: 'missing' };
  if (s.isSymbolicLink()) {
    let t = ''; try { t = fs.readlinkSync(from); } catch {}
    return real(from) === real(to) ? { state: 'linked' } : { state: 'other-link', target: path.resolve(path.dirname(from), t) };
  }
  if (!s.isDirectory()) return { state: 'file' };
  if (real(from) === real(to)) return { state: 'same' }; // already one folder (the fork uses the original's)
  const n = entries(from).length;
  return { state: n ? 'folder' : 'empty', count: n };
}

// places a link may be made: inside home or on another drive, never home or a drive itself, never inside each other
function check(from, to, home = os.homedir()) {
  const ok = (p) => { const r = real(p); return [home, real(home), '/run/media', '/media', '/mnt'].some((b) => r.startsWith(b + '/')) && r !== home && r !== real(home); };
  if (!path.isAbsolute(from) || !path.isAbsolute(to)) return 'Pick both folders.';
  if (!ok(from) || !ok(path.dirname(to)) || !ok(to)) return 'Only folders inside your home folder or on another drive can be linked.';
  const a = real(from), b = real(to);
  if (a === b) return 'Those are the same folder.';
  if (b.startsWith(a + '/') || a.startsWith(b + '/')) return 'One folder is inside the other.';
  if (!isDir(to)) return `The folder to share isn’t there: ${to}`;
  return '';
}

// from becomes a link to to. -> { kept } (the fork's own folder, set aside) or throws
function link(from, to, home) {
  const st = status(from, to);
  if (st.state === 'linked') return { kept: null, already: true };
  const why = check(from, to, home);
  if (why) throw new Error(why);
  if (st.state === 'same') throw new Error('It already uses that folder: nothing to link.');
  if (st.state === 'other-link') throw new Error(`It’s already a link to ${st.target}. Remove that link first.`);
  if (st.state === 'file') throw new Error('There’s a file where the folder should be.');
  let kept = null;
  if (st.state === 'folder' || st.state === 'empty') {
    kept = from + KEPT;
    if (lst(kept)) throw new Error(`${path.basename(kept)} is already there from an earlier link. Move it first.`);
    fs.renameSync(from, kept);
  } else fs.mkdirSync(path.dirname(from), { recursive: true });
  try { fs.symlinkSync(real(to), from, 'dir'); }
  catch (e) { if (kept) fs.renameSync(kept, from); throw e; }
  return { kept };
}
// removes a link Cartridge made and puts the fork's own folder back (an empty one when it had none)
function unlink(rec) {
  const s = lst(rec.from);
  if (s && !s.isSymbolicLink()) throw new Error('That’s a folder now, not Cartridge’s link: it’s left as it is.');
  if (s) fs.unlinkSync(rec.from);
  if (rec.kept && lst(rec.kept)) fs.renameSync(rec.kept, rec.from);
  else fs.mkdirSync(rec.from, { recursive: true });
  return true;
}

// Smart linking (0.9.37, owner: find the saves and link them by itself): before a fork's folder is set aside, the
// games it has saves for that the original hasn't are copied across, so nothing goes missing behind the link.
// Copies only: never over a file, never deletes. A game's folder (a serial, a title ID) is copied whole or not at
// all, so one game's save is never a mix of both emulators' files.
const GAME_DIR = /^([A-Z]{4}\d{5}|[A-Z]{4}-?\d{5}|CUSA\d{5}|PPSA\d{5}|NP[A-Z]{2}\d{5}|[0-9A-Fa-f]{16}|[0-9A-Fa-f]{8})([_-].*)?$/;
const isGame = (n) => GAME_DIR.test(n) && !/^0+$/.test(n); // Switch's 0000000000000000 save-type folder isn't a game
function mergeInto(from, to, depth = 0) {
  const out = { copied: [], skipped: [] };
  if (depth > 6 || !lst(from)?.isDirectory() || lst(from).isSymbolicLink()) return out;
  fs.mkdirSync(to, { recursive: true });
  for (const n of entries(from)) {
    const a = path.join(from, n), b = path.join(to, n), sa = lst(a), sb = lst(b);
    if (!sa || sa.isSymbolicLink()) continue;
    if (!sb) { fs.cpSync(a, b, { recursive: true, errorOnExist: false, force: false, preserveTimestamps: true }); out.copied.push(n); continue; }
    if (sa.isDirectory() && isDir(b) && !isGame(n)) { const r = mergeInto(a, b, depth + 1); out.copied.push(...r.copied.map((x) => n + '/' + x)); out.skipped.push(...r.skipped.map((x) => n + '/' + x)); continue; }
    out.skipped.push(n); // both have it: the original's stays
  }
  return out;
}
// a fork's save folder when its usual places don't have it: looked for under the fork's own folder, a few levels down
function searchForkFolder(exe, rel, maxDepth = 3) {
  const parts = String(rel).split('/'), last = parts.slice(-2).join('/');
  const root = path.dirname(exe), seen = new Set();
  const walk = (d, n) => {
    if (n > maxDepth || seen.has(d)) return null; seen.add(d);
    const hit = path.join(d, rel);
    if (isDir(hit)) return hit;
    if (parts.length > 1 && path.basename(d) === parts[parts.length - 2] && isDir(path.join(d, parts[parts.length - 1]))) return path.join(d, parts[parts.length - 1]);
    for (const c of entries(d)) { const p = path.join(d, c); if (lst(p)?.isDirectory() && !/^(lib|plugins|translations|shaders|cache|log)s?$/i.test(c)) { const r = walk(p, n + 1); if (r) return r; } }
    return null;
  };
  return last ? walk(root, 0) : null;
}

// what a save folder holds, for choosing which one both should use (0.9.56): how many entries (games, mostly) and when
// anything in it last changed, two levels down, through links, at most 3000 entries looked at
function summary(dir) {
  if (!isDir(dir)) return { there: false, count: 0, newest: 0 };
  const top = entries(dir);
  let newest = 0, seen = 0;
  const look = (p, d) => {
    if (seen++ > 3000) return;
    let st; try { st = fs.statSync(p); } catch { return; }
    if (st.mtimeMs > newest) newest = st.mtimeMs;
    if (d < 2 && st.isDirectory()) for (const n of entries(p)) look(path.join(p, n), d + 1);
  };
  for (const n of top) look(path.join(dir, n), 1);
  return { there: true, count: top.length, newest: Math.round(newest), link: !!lst(dir)?.isSymbolicLink() };
}

module.exports = { KEPT, forkBases, findForkBase, status, check, link, unlink, mergeInto, searchForkFolder, summary, GAME_DIR };
