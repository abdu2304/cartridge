// Xenia Canary's game patches (0.9.63, owner: "Xenia patches from github.com/xenia-canary/game-patches, the same
// system as the RPCS3 and shadPS4 patches"). Read from Xenia Canary's source (src/xenia/patcher/patch_db.cc, .h):
// - files in <storage root>/patches/ named "<TITLE ID 8 hex>...patch.toml" (any other name is skipped)
// - each: title_name, title_id, hash (the default.xex hash, one or a list: a patch file applies only to the build of the
//   game with that hash, so a title update has its own file, "(TU1)"), then [[patch]] blocks with name, desc, author,
//   is_enabled and the writes
// - apply_patches (General, default true) turns the whole thing off
// The storage root is beside the program with portable.txt (always for the Windows build), else ~/.local/share/Xenia
// (xenia_main.cc). Cartridge downloads the repository's patches into that folder, only the patch files, and never
// over a file it didn't put there; an update keeps which patches you had on. It changes only is_enabled lines.
const fs = require('fs');
const path = require('path');

const NAME_RE = /^[A-Fa-f0-9]{8}.*\.patch\.toml$/;
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const unq = (v) => { const s = String(v || '').trim(); const m = /^"((?:[^"\\]|\\.)*)"|^'([^']*)'/.exec(s); return m ? (m[1] != null ? m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : m[2]) : s.replace(/\s+#.*$/, ''); };

// the patches in one file: [{ name, desc, author, on, line }] (line: the is_enabled line's index, or the [[patch]] line)
function parse(text) {
  const lines = String(text).split('\n'), out = [], head = {};
  let cur = null, depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^\[\[patch\]\]$/.test(t)) { cur = { name: '', desc: '', author: '', on: false, at: i, line: -1 }; out.push(cur); depth = 1; continue; }
    if (/^\[\[patch\.[^\]]+\]\]$/.test(t)) { depth = 2; continue; }
    const m = /^([A-Za-z_]+)\s*=\s*(.*)$/.exec(t);
    if (!m) continue;
    if (!cur) { head[m[1]] = unq(m[2]); continue; }
    if (depth !== 1) continue;
    if (m[1] === 'name') cur.name = unq(m[2]);
    else if (m[1] === 'desc') cur.desc = unq(m[2]);
    else if (m[1] === 'author') cur.author = unq(m[2]);
    else if (m[1] === 'is_enabled') { cur.on = /^true\b/i.test(m[2].trim()); cur.line = i; }
  }
  return { head, patches: out.filter((p) => p.name) };
}
// which build of the game a file is for, from its name: "4D5307E6 - Halo 3 (TU12).patch.toml" -> "Title Update 12"
function variantOf(file) { const m = /\(([^)]*)\)\.patch\.toml$/i.exec(file); if (!m) return 'Base Game'; const tu = /^TU\s*(\d+)$/i.exec(m[1].trim()); return tu ? `Title Update ${tu[1]}` : m[1].trim(); }

function files(dir, titleId) {
  const want = String(titleId || '').toUpperCase();
  let names = []; try { names = fs.readdirSync(path.join(dir, 'patches')); } catch { return []; }
  return names.filter((n) => NAME_RE.test(n) && n.slice(0, 8).toUpperCase() === want).sort();
}
// -> the PatchesSheet list: { key, name, description, author, notes, version, group, section, on, by }
function list(dir, titleId, mine = {}) {
  const out = [];
  for (const f of files(dir, titleId)) {
    let text; try { text = fs.readFileSync(path.join(dir, 'patches', f), 'utf8'); } catch { continue; }
    const { patches } = parse(text), v = variantOf(f);
    for (const p of patches) {
      const key = ['xenia', f, p.name].join('\u0001');
      out.push({ key, file: f, name: p.name, description: p.name, author: p.author, notes: p.desc, version: v, group: v, section: 'Patches', on: p.on, by: p.on ? (mine[key] ? 'cartridge' : 'emulator') : null });
    }
  }
  return out;
}
// changes: [{ key, file, name, on }] -> mine (what Cartridge turned on, the only ones it turns off)
function set(dir, changes, mine = {}) {
  const rec = { ...mine }, byFile = new Map();
  for (const c of changes) { if (!byFile.has(c.file)) byFile.set(c.file, []); byFile.get(c.file).push(c); }
  for (const [file, cs] of byFile) {
    const f = path.join(dir, 'patches', file);
    if (!NAME_RE.test(file) || path.dirname(f) !== path.join(dir, 'patches')) continue;
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    const { patches } = parse(lines.join('\n'));
    for (const c of cs) {
      const p = patches.find((x) => x.name === c.name); if (!p) continue;
      if (!c.on && !rec[c.key]) continue; // turned on in Xenia or by hand: never turned off here
      const v = c.on ? 'true' : 'false';
      if (p.line >= 0) lines[p.line] = lines[p.line].replace(/(is_enabled\s*=\s*)(true|false)/i, `$1${v}`);
      else { const ind = (/^(\s*)/.exec(lines[p.at + 1] || '') || [])[1] || '    '; lines.splice(p.at + 1, 0, `${ind}is_enabled = ${v}`); for (const q of patches) if (q.at > p.at) { q.at++; if (q.line >= 0) q.line++; } }
      if (c.on) rec[c.key] = true; else delete rec[c.key];
    }
    fs.writeFileSync(f + '.cartridge-new', lines.join('\n')); fs.renameSync(f + '.cartridge-new', f);
  }
  return rec;
}
// apply_patches in Xenia's config (General): turned back on when a patch is turned on, if it was off
function ensureOn(cfgFile) {
  let t; try { t = fs.readFileSync(cfgFile, 'utf8'); } catch { return false; }
  if (!/^\s*apply_patches\s*=\s*false/m.test(t)) return false;
  fs.writeFileSync(cfgFile + '.cartridge-new', t.replace(/^(\s*apply_patches\s*=\s*)false/m, '$1true')); fs.renameSync(cfgFile + '.cartridge-new', cfgFile);
  return true;
}
// lay the downloaded patch files in: entries [[name, Buffer]] (any folder inside the archive; only patch files used).
// written: { <file>: true } the files Cartridge put there. A file you or Xenia's users put there is never replaced; a
// file of Cartridge's keeps the patches you had on.
function install(dir, entries, written = {}) {
  const pd = path.join(dir, 'patches'), rec = { ...written };
  fs.mkdirSync(pd, { recursive: true });
  let added = 0, updated = 0;
  for (const [name, buf] of entries) {
    const base = path.basename(name);
    if (!NAME_RE.test(base) || !buf) continue;
    const f = path.join(pd, base), had = exists(f);
    if (had && !rec[base]) continue;
    let text = buf.toString('utf8');
    if (had) {
      const on = new Set(parse(fs.readFileSync(f, 'utf8')).patches.filter((p) => p.on).map((p) => p.name));
      if (on.size) { const lines = text.split('\n'); for (const p of parse(text).patches) if (on.has(p.name) && p.line >= 0) lines[p.line] = lines[p.line].replace(/(is_enabled\s*=\s*)false/i, '$1true'); text = lines.join('\n'); }
      if (fs.readFileSync(f, 'utf8') === text) continue;
    }
    fs.writeFileSync(f + '.cartridge-new', text); fs.renameSync(f + '.cartridge-new', f);
    rec[base] = true; had ? updated++ : added++;
  }
  return { written: rec, added, updated };
}

module.exports = { parse, variantOf, files, list, set, ensureOn, install, NAME_RE };
