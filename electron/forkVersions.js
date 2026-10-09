// Versions of an emulator or fork installed from a GitHub link (0.9.64, owner: "open forks like emulators and update
// them to different versions, similar to the shadPS4 system"). The copy in use stays where it is, so Steam shortcuts
// and settings keep pointing at the same file; an update moves the release it replaces into a store beside it
// (<emulators folder>/.cartridge-versions/<name>/<tag>/), and switching moves files between the two. Only the files
// that came with a release move (its manifest: the AppImage, or every file the release's archive held): anything the
// emulator made beside them (a portable user/ folder with saves and settings) is never touched. Plain fs, tested in
// test/forkVersions.test.js.
const fs = require('fs');
const path = require('path');

const safe = (s) => String(s || '').replace(/[^\w.@+-]+/g, '_').slice(0, 80) || 'version';
function move(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  try { fs.renameSync(src, dst); } catch (e) { if (e.code !== 'EXDEV') throw e; fs.cpSync(src, dst, { recursive: true }); fs.rmSync(src, { recursive: true, force: true }); }
}
// every file under a folder, as paths relative to it ("lib/libQt6Core.so.6")
function filesOf(root) {
  const out = [];
  const walk = (d, rel) => { for (const e of (() => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } })()) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else out.push(r); } };
  walk(root, '');
  return out.sort();
}
const storeOf = (emuDir, name) => path.join(emuDir, '.cartridge-versions', safe(name));
// the release in use, set aside: its files under base move to <store>/<tag>. -> how many moved
function keep({ base, files, store, tag }) {
  const to = path.join(store, safe(tag));
  if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true }); // the same tag kept again: the newer copy wins
  let n = 0;
  for (const rel of files || []) {
    const src = path.resolve(base, rel);
    if (!src.startsWith(path.resolve(base) + path.sep) || !fs.existsSync(src)) continue;
    move(src, path.join(to, rel)); n++;
  }
  if (n) fs.writeFileSync(path.join(to, '.cartridge-version.json'), JSON.stringify({ tag, files: (files || []).filter((r) => fs.existsSync(path.join(to, r))), at: Date.now() }));
  return n;
}
// a kept release back in use: its files move from <store>/<tag> into base (over what's there). -> its files
function place({ base, store, tag }) {
  const from = path.join(store, safe(tag));
  let meta = null; try { meta = JSON.parse(fs.readFileSync(path.join(from, '.cartridge-version.json'), 'utf8')); } catch {}
  const files = meta?.files || filesOf(from).filter((r) => r !== '.cartridge-version.json');
  for (const rel of files) { const src = path.join(from, rel); if (fs.existsSync(src)) { const dst = path.join(base, rel); fs.rmSync(dst, { force: true }); move(src, dst); } }
  fs.rmSync(from, { recursive: true, force: true });
  return files;
}
// switch: the one in use set aside under its tag, the chosen one put in its place
function swap({ base, store, current, files, to }) {
  if (!fs.existsSync(path.join(store, safe(to)))) throw new Error(`Version ${to} isn’t kept any more.`);
  keep({ base, files, store, tag: current });
  return place({ base, store, tag: to });
}
// kept releases: [{ tag, at, size }] newest first
function list(store) {
  const out = [];
  for (const n of (() => { try { return fs.readdirSync(store); } catch { return []; } })()) {
    let meta = null; try { meta = JSON.parse(fs.readFileSync(path.join(store, n, '.cartridge-version.json'), 'utf8')); } catch {}
    if (!meta) continue;
    let size = 0; for (const r of meta.files || []) { try { size += fs.statSync(path.join(store, n, r)).size; } catch {} }
    out.push({ tag: meta.tag, at: meta.at, size });
  }
  return out.sort((a, b) => b.at - a.at);
}
function drop(store, tag) { const d = path.join(store, safe(tag)); if (!path.resolve(d).startsWith(path.resolve(store) + path.sep)) return false; fs.rmSync(d, { recursive: true, force: true }); return true; }

module.exports = { filesOf, storeOf, keep, place, swap, list, drop, safe };
