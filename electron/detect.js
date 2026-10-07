// Finding emulators wherever they are and telling which one each is, without running anything
// (0.9 Setup). An AppImage is found by its first bytes (ELF with "AI" and a type byte at offset 8),
// so its name and folder don't matter. Which emulator it is comes from inside it: the .desktop file
// and AppStream data every AppImage carries in its squashfs, and the .upd_info section naming
// where it updates from. Files are only read.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { EMU } = require('./emulators');

// ---------------------------------------------------------------- small file helpers
function readAt(fd, pos, len) {
  const b = Buffer.alloc(len);
  const n = fs.readSync(fd, b, 0, len, pos);
  return n === len ? b : b.subarray(0, n);
}
const u64 = (b, o) => Number(b.readBigUInt64LE(o));

// 0 = not an AppImage, 1 or 2 = AppImage type
function appImageType(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const b = readAt(fd, 0, 11);
    if (b.length < 11 || b.readUInt32BE(0) !== 0x7f454c46) return 0;
    return b[8] === 0x41 && b[9] === 0x49 && (b[10] === 1 || b[10] === 2) ? b[10] : 0;
  } catch { return 0; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
}
function isElf(file) {
  let fd;
  try { fd = fs.openSync(file, 'r'); const b = readAt(fd, 0, 4); return b.length === 4 && b.readUInt32BE(0) === 0x7f454c46; } catch { return false; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
}

// ---------------------------------------------------------------- ELF: where the payload starts, named sections
function elfInfo(fd) {
  const h = readAt(fd, 0, 64);
  const is64 = h[4] === 2;
  const shoff = is64 ? u64(h, 0x28) : h.readUInt32LE(0x20);
  const shentsize = h.readUInt16LE(is64 ? 0x3a : 0x2e), shnum = h.readUInt16LE(is64 ? 0x3c : 0x30), shstrndx = h.readUInt16LE(is64 ? 0x3e : 0x32);
  const end = shoff + shentsize * shnum; // the AppImage runtime puts the file system right after this
  const sections = {};
  if (shnum && shnum < 200 && shentsize >= (is64 ? 64 : 40)) {
    const table = readAt(fd, shoff, shentsize * shnum);
    const sh = (i) => { const o = i * shentsize; return is64 ? { name: table.readUInt32LE(o), off: u64(table, o + 0x18), size: u64(table, o + 0x20) } : { name: table.readUInt32LE(o), off: table.readUInt32LE(o + 0x10), size: table.readUInt32LE(o + 0x14) }; };
    const str = sh(shstrndx);
    const names = str.size < 65536 ? readAt(fd, str.off, str.size) : Buffer.alloc(0);
    for (let i = 0; i < shnum; i++) {
      const s = sh(i);
      const e = names.indexOf(0, s.name);
      const n = names.toString('latin1', s.name, e < 0 ? undefined : e);
      if (n) sections[n] = s;
    }
  }
  return { end, sections };
}
function sectionText(fd, s, max = 4096) {
  if (!s || !s.size) return '';
  return readAt(fd, s.off, Math.min(s.size, max)).toString('utf8').replace(/\0+/g, '').trim();
}

// ---------------------------------------------------------------- squashfs (read only, just enough to read small files)
const COMP = { 1: 'gzip', 2: 'lzma', 3: 'lzo', 4: 'xz', 5: 'lz4', 6: 'zstd' };
function decompress(buf, comp) {
  switch (comp) {
    case 1: return zlib.inflateSync(buf);
    case 6: if (zlib.zstdDecompressSync) return zlib.zstdDecompressSync(buf); break;
    // xz and lzma: the system's xz (on every distro, SteamOS included)
    case 4: return execFileSync('xz', ['-dc'], { input: buf, maxBuffer: 64 << 20, timeout: 8000 });
    case 2: return execFileSync('xz', ['-dc', '--format=lzma'], { input: buf, maxBuffer: 64 << 20, timeout: 8000 });
  }
  throw new Error(`${COMP[comp] || 'unknown'} compression is not supported`);
}
function squashfs(fd, base) {
  const sb = readAt(fd, base, 96);
  if (sb.length < 96 || sb.readUInt32LE(0) !== 0x73717368) return null;
  const S = { blockSize: sb.readUInt32LE(12), comp: sb.readUInt16LE(20), root: sb.readBigUInt64LE(32), inodes: u64(sb, 64), dirs: u64(sb, 72), frags: u64(sb, 80), major: sb.readUInt16LE(28) };
  if (S.major !== 4) return null;
  const metaCache = new Map();
  // one metadata block (at most 8 KiB once unpacked): { data, next }
  function meta(pos) {
    if (metaCache.has(pos)) return metaCache.get(pos);
    const h = readAt(fd, base + pos, 2).readUInt16LE(0);
    const len = h & 0x7fff;
    const raw = readAt(fd, base + pos + 2, len);
    const m = { data: h & 0x8000 ? raw : decompress(raw, S.comp), next: pos + 2 + len };
    metaCache.set(pos, m);
    return m;
  }
  // len bytes from a metadata table, starting at (block, offset) relative to the table
  function metaRead(table, block, offset, len) {
    const parts = []; let got = 0, pos = table + block;
    while (got < len + offset) {
      const m = meta(pos);
      parts.push(m.data); got += m.data.length; pos = m.next;
      if (parts.length > 4096) throw new Error('metadata too long');
    }
    return Buffer.concat(parts).subarray(offset, offset + len);
  }
  function inode(ref) {
    const block = Number(ref >> 16n), off = Number(ref & 0xffffn);
    const h = metaRead(S.inodes, block, off, 64);
    const type = h.readUInt16LE(0);
    if (type === 1) return { type: 'dir', start: h.readUInt32LE(16), size: h.readUInt16LE(24), off: h.readUInt16LE(26) };
    if (type === 8) return { type: 'dir', size: h.readUInt32LE(20), start: h.readUInt32LE(24), off: h.readUInt16LE(34) };
    if (type === 2 || type === 9) {
      const ext = type === 9;
      const f = ext ? { blocks: u64(h, 16), size: u64(h, 24), frag: h.readUInt32LE(44), fragOff: h.readUInt32LE(48), head: 56 } : { blocks: h.readUInt32LE(16), frag: h.readUInt32LE(20), fragOff: h.readUInt32LE(24), size: h.readUInt32LE(28), head: 32 };
      const n = f.frag === 0xffffffff ? Math.ceil(f.size / S.blockSize) : Math.floor(f.size / S.blockSize);
      const sizes = metaRead(S.inodes, block, off + f.head, n * 4);
      return { type: 'file', ...f, sizes: Array.from({ length: n }, (_, i) => sizes.readUInt32LE(i * 4)) };
    }
    if (type === 3 || type === 10) { const len = h.readUInt32LE(20); return { type: 'link', target: metaRead(S.inodes, block, off + 24, len).toString('utf8') }; }
    return { type: 'other' };
  }
  function list(dir) {
    const size = dir.size - 3; // the listing's size counts "." and ".."
    if (size <= 0) return [];
    if (size > 4 << 20) throw new Error('directory too big');
    const b = metaRead(S.dirs, dir.start, dir.off, size);
    const out = []; let p = 0;
    while (p + 12 <= b.length) {
      const count = b.readUInt32LE(p) + 1, start = b.readUInt32LE(p + 4); p += 12;
      for (let i = 0; i < count && p + 8 <= b.length; i++) {
        const off = b.readUInt16LE(p), nlen = b.readUInt16LE(p + 6) + 1;
        out.push({ name: b.toString('utf8', p + 8, p + 8 + nlen), ref: (BigInt(start) << 16n) | BigInt(off) });
        p += 8 + nlen;
      }
    }
    return out;
  }
  // head: only the first bytes (0.9.47: a program's needed glibc versions sit near its start)
  function readFile(f, max = 512 * 1024, head = 0) {
    if (f.size > max && !head) throw new Error('file too big');
    const parts = []; let pos = f.blocks, got = 0;
    for (const s of f.sizes) {
      if (head && got >= head) return Buffer.concat(parts);
      const len = s & 0xffffff;
      if (!len) { parts.push(Buffer.alloc(S.blockSize)); continue; }
      const raw = readAt(fd, base + pos, len);
      parts.push(s & 0x1000000 ? raw : decompress(raw, S.comp));
      pos += len; got += S.blockSize;
    }
    if (f.frag !== 0xffffffff) {
      // the fragment table: raw u64 pointers to metadata blocks of 16-byte entries
      const ptr = u64(readAt(fd, base + S.frags + Math.floor(f.frag / 512) * 8, 8), 0);
      const m = metaReadAbs(ptr, (f.frag % 512) * 16, 16);
      const fstart = u64(m, 0), fsize = m.readUInt32LE(8);
      const raw = readAt(fd, base + fstart, fsize & 0xffffff);
      const block = fsize & 0x1000000 ? raw : decompress(raw, S.comp);
      parts.push(block.subarray(f.fragOff, f.fragOff + (f.size % S.blockSize)));
    }
    return Buffer.concat(parts).subarray(0, f.size);
  }
  function metaReadAbs(pos, offset, len) { return metaRead(0, pos, offset, len); }
  const rootDir = () => inode(S.root);
  // follow a path from the root (symlinks inside the image too, a few hops)
  function lookup(p, hops = 0) {
    let node = rootDir(); const parts = p.split('/').filter(Boolean); const seen = [];
    for (let i = 0; i < parts.length; i++) {
      if (node.type !== 'dir') return null;
      const hit = list(node).find((e) => e.name === parts[i]);
      if (!hit) return null;
      node = inode(hit.ref);
      if (node.type === 'link') {
        if (hops > 4) return null;
        const t = node.target.startsWith('/') ? node.target : [...seen, node.target].join('/');
        const rest = parts.slice(i + 1).join('/');
        return lookup(path.posix.normalize(t + (rest ? '/' + rest : '')), hops + 1);
      }
      seen.push(parts[i]);
    }
    return node;
  }
  return { comp: COMP[S.comp] || String(S.comp), rootList: () => list(rootDir()), lookup, readFile, list };
}

// ---------------------------------------------------------------- what an AppImage says about itself
function parseDesktop(text) {
  const out = {}; let inMain = false;
  for (const line of String(text).split(/\r?\n/)) {
    if (/^\[/.test(line)) { inMain = /^\[Desktop Entry\]/.test(line); continue; }
    if (!inMain) continue;
    const m = line.match(/^([A-Za-z0-9-]+)=(.*)$/);
    if (m && !(m[1] in out)) out[m[1]] = m[2].trim();
  }
  return { name: out.Name || '', exec: out.Exec || '', icon: out.Icon || '', version: out['X-AppImage-Version'] || '', categories: out.Categories || '' };
}
function parseAppStream(xml) {
  const t = String(xml);
  const id = (t.match(/<id[^>]*>\s*([^<]+?)\s*<\/id>/) || [])[1] || '';
  const name = (t.match(/<name(?![^>]*xml:lang)[^>]*>\s*([^<]+?)\s*<\/name>/) || [])[1] || '';
  const version = (t.match(/<release[^>]*version="([^"]+)"/) || [])[1] || '';
  return { id: id.replace(/\.desktop$/, ''), name, version };
}
// First word of Exec= without the path or field codes: "shadps4 %f" -> shadps4
const execName = (exec) => path.basename(String(exec || '').trim().replace(/^"([^"]*)".*$/, '$1').split(/\s+/)[0] || '');

// Everything readable from inside an AppImage: { type, fs, comp, desktop, desktopFile, appstream, upd, error }
function readAppImage(file) {
  const out = { type: appImageType(file), fs: null };
  if (!out.type) return out;
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const elf = elfInfo(fd);
    out.upd = sectionText(fd, elf.sections['.upd_info']);
    // the payload: squashfs (type 2), right after the ELF; newer runtimes may pad a little
    let base = elf.end, magic = readAt(fd, base, 8);
    if (magic.toString('latin1', 0, 4) !== 'hsqs' && !/^DWARFS/.test(magic.toString('latin1'))) {
      const win = readAt(fd, elf.end, 1 << 20); const i = win.indexOf('hsqs'); const j = win.indexOf('DWARFS');
      if (i >= 0 && (j < 0 || i < j)) base = elf.end + i; else if (j >= 0) base = elf.end + j;
      magic = readAt(fd, base, 8);
    }
    if (/^DWARFS/.test(magic.toString('latin1'))) { out.fs = 'dwarfs'; return out; } // can't be read here: name and .upd_info only
    if (out.type === 1) { out.fs = 'iso9660'; return out; }
    const sq = squashfs(fd, base);
    if (!sq) return out;
    out.fs = 'squashfs'; out.comp = sq.comp;
    const root = sq.rootList();
    const desk = root.find((e) => /\.desktop$/i.test(e.name));
    if (desk) {
      out.desktopFile = desk.name.replace(/\.desktop$/i, '');
      const n = sq.lookup(desk.name);
      if (n?.type === 'file') out.desktop = parseDesktop(sq.readFile(n).toString('utf8'));
    }
    for (const dir of ['usr/share/metainfo', 'usr/share/appdata']) {
      const d = sq.lookup(dir);
      if (d?.type !== 'dir') continue;
      const x = sq.list(d).find((e) => /\.xml$/i.test(e.name));
      if (!x) continue;
      const n = sq.lookup(dir + '/' + x.name);
      if (n?.type === 'file') { out.appstream = parseAppStream(sq.readFile(n).toString('utf8')); break; }
    }
  } catch (e) { out.error = e.message; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
  return out;
}

// ---------------------------------------------------------------- which emulator is it
// RetroArch isn't in EMU (it runs cores); it's recognised the same way
const RA = { label: 'RetroArch', fp: ['org.libretro.RetroArch'], bin: ['retroarch'], app: /retroarch/i };
const KNOWN = () => ({ ...EMU, retroarch: RA });
const lc = (s) => String(s || '').toLowerCase();
// Emulators that take the same arguments: a close guess inside a family still launches
const FAMILY = { eden: 'yuzu', citron: 'yuzu', yuzu: 'yuzu' };
// conf: 3 certain (its own id or program name inside it), 2 high, 1 a guess to confirm, 0 unknown
function identify({ desktop, desktopFile, appstream, upd, fileName, exec } = {}) {
  const scores = [];
  for (const [id, e] of Object.entries(KNOWN())) {
    let s = 0; const why = [];
    const ids = (e.fp || []).map(lc);
    if (appstream?.id && ids.includes(lc(appstream.id))) { s = 3; why.push('its app id'); }
    if (desktopFile && ids.includes(lc(desktopFile))) { s = 3; why.push('its app id'); }
    const ex = execName(desktop?.exec || exec);
    if (ex && (e.bin || []).map(lc).includes(lc(ex))) { s = Math.max(s, 3); why.push('its program name'); }
    const nm = lc(desktop?.name || appstream?.name);
    if (nm && (nm === lc(e.label) || nm.startsWith(lc(e.label) + ' '))) { s = Math.max(s, 3); why.push('its name'); }
    if (s < 2 && nm && e.app?.test(nm)) { s = 2; why.push('its name'); }
    if (s < 2 && desktopFile && e.app?.test(desktopFile)) { s = 2; why.push('its app id'); }
    if (s < 2 && upd && e.app?.test(upd)) { s = 2; why.push('where it updates from'); }
    if (s < 1 && fileName && e.app?.test(fileName)) { s = 1; why.push('its file name'); }
    if (s) scores.push({ id, conf: s, why: [...new Set(why)] });
  }
  scores.sort((a, b) => b.conf - a.conf || b.why.length - a.why.length);
  if (!scores.length) return { id: null, conf: 0 };
  const [best, next] = scores;
  // two different emulators equally sure: ask (unless they're one family)
  const sameFamily = next && FAMILY[best.id] && FAMILY[best.id] === FAMILY[next.id];
  if (next && next.conf === best.conf && next.why.length === best.why.length && !sameFamily) return { id: best.id, conf: 1, why: best.why, also: next.id };
  return { id: best.id, conf: best.conf, why: best.why };
}
// A plain program (not an AppImage): its file name, else a known name inside it (a guess to confirm)
function identifyProgram(file, { strings = true } = {}) {
  const base = path.basename(file);
  for (const [id, e] of Object.entries(KNOWN())) if ((e.bin || []).some((b) => b === base)) return { id, conf: 2, why: ['its program name'] };
  const byName = identify({ fileName: base });
  if (byName.id) return byName;
  if (!strings) return { id: null, conf: 0 };
  // labels long and distinctive enough to find inside a program (case matters)
  const marks = Object.entries(KNOWN()).filter(([, e]) => e.label.length >= 5 && !/\s/.test(e.label)).map(([id, e]) => [id, Buffer.from(e.label)]);
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size, CH = 4 << 20, MAX = Math.min(size, 48 << 20);
    const hits = {};
    for (let pos = 0; pos < MAX; pos += CH - 64) {
      const b = readAt(fd, pos, Math.min(CH, MAX - pos));
      for (const [id, m] of marks) { let i = -1; while ((i = b.indexOf(m, i + 1)) >= 0) { hits[id] = (hits[id] || 0) + 1; if (hits[id] > 50) break; } }
    }
    const top = Object.entries(hits).sort((a, b) => b[1] - a[1]);
    // an emulator names itself many times (window titles, logs, config paths); a passing mention in
    // another program (a browser's list of GPUs) doesn't count
    if (top.length && top[0][1] >= 12 && (!top[1] || top[0][1] >= top[1][1] * 3)) return { id: top[0][0], conf: 1, why: ['a name inside the program'] };
  } catch {} finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
  return { id: null, conf: 0 };
}

// ---------------------------------------------------------------- where to look
const SKIP_EXT = /\.(png|jpe?g|gif|webp|svg|ico|bmp|mp[34]|mkv|avi|mov|webm|flac|ogg|wav|opus|m4a|txt|md|pdf|json|xml|ya?ml|ini|cfg|conf|log|html?|css|js|ts|py|c|h|cpp|rs|go|java|iso|chd|cso|zso|rvz|wbfs|wia|gcz|nsp|xci|nsz|xcz|3ds|cia|cci|z64|n64|v64|sfc|smc|nes|gba|gbc|gb|nds|bin|cue|img|pbp|m3u|gdi|cdi|vpk|pkg|rpx|wud|wux|zip|7z|rar|tar|gz|xz|zst|bz2|sav|srm|state\d*|sfo|dll|so(\.\d+)*|a|o|db|sqlite|dat|lst|vdf|acf|csv|psd|kra|blend|ttf|otf|woff2?|deb|rpm|flatpak|flatpakref|torrent|part|partial|crdownload)$/i;
const SKIP_DIR = new Set(['node_modules', '.git', '.svn', '.hg', 'steamapps', 'compatdata', 'shadercache', 'Trash', '.Trash', 'cache', 'Cache', 'caches', '__pycache__', 'venv', '.venv', 'site-packages', 'target', 'build-cache', 'proc', 'sys', 'lost+found']);
// hidden folders are skipped except these (inside home)
const HIDDEN_OK = new Set(['.local', '.bin', '.apps', '.appimages', '.AppImages', '.emulators']);
const SKIP_UNDER_LOCAL = new Set(['share/Steam', 'share/Trash', 'share/flatpak', 'share/containers', 'share/baloo', 'share/akonadi', 'share/recently-used.xbel', 'share/gvfs-metadata', 'share/lutris/runners/wine', 'share/bottles', 'share/umu', 'share/Steam.old', 'state', 'lib']);

// Walk folders for programs, AppImages and unpacked AppImages. Budgeted: gives up quietly after
// maxDirs folders or ms milliseconds. skip: real paths not to enter (ROM folders, Steam libraries).
async function walk(roots, { maxDepth = 7, ms = 20000, maxDirs = 60000, skip = [], onProgress } = {}) {
  const t0 = Date.now(), seen = new Set(), found = [], skipReal = new Set(skip.map((p) => { try { return fs.realpathSync(p); } catch { return p; } }));
  let dirs = 0, stopped = false;
  // roots in the order given (home first): the stack pops from the end, so they go on reversed. 0.9.43: it was the
  // other way round, and a big /opt (GitHub's runners keep their tool cache there) used the whole budget before home
  const stack = roots.filter(Boolean).map((r) => ({ d: r.dir || r, depth: 0, home: r.home || null })).reverse();
  while (stack.length) {
    if (Date.now() - t0 > ms || dirs > maxDirs) { stopped = true; break; }
    const { d, depth, home } = stack.pop();
    let st; try { st = await fs.promises.stat(d); } catch { continue; }
    const key = st.dev + ':' + st.ino; if (seen.has(key)) continue; seen.add(key);
    let real = d; try { real = await fs.promises.realpath(d); } catch {}
    if (skipReal.has(real)) continue;
    let ents; try { ents = await fs.promises.readdir(d, { withFileTypes: true }); } catch { continue; }
    dirs++;
    if (onProgress && dirs % 400 === 0) onProgress({ dirs, found: found.length, dir: d });
    // an unpacked AppImage: AppRun and a .desktop file side by side
    if (ents.some((e) => e.name === 'AppRun') && ents.some((e) => /\.desktop$/i.test(e.name))) { found.push({ path: path.join(d, 'AppRun'), kind: 'unpacked', dir: d }); continue; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory() || (e.isSymbolicLink() && await isDirP(p))) {
        if (depth >= maxDepth || SKIP_DIR.has(e.name)) continue;
        if (e.name.startsWith('.') && !(home && d === home && HIDDEN_OK.has(e.name)) && !(home && path.relative(home, d).startsWith('.local'))) continue;
        if (home) { const rel = path.relative(path.join(home, '.local'), p); if (!rel.startsWith('..') && SKIP_UNDER_LOCAL.has(rel)) continue; }
        stack.push({ d: p, depth: depth + 1, home });
        continue;
      }
      if (!(e.isFile() || e.isSymbolicLink()) || SKIP_EXT.test(e.name)) continue;
      let fst; try { fst = await fs.promises.stat(p); } catch { continue; }
      if (!fst.isFile() || fst.size < 1.5 * 1024 * 1024) continue; // emulators are big; this skips scripts and small tools
      const exec = !!(fst.mode & 0o111);
      if (!exec && !/\.appimage$/i.test(e.name)) continue; // AppImages that lost their run permission still count
      found.push({ path: p, kind: 'file', size: fst.size, mtime: fst.mtimeMs, ino: fst.dev + ':' + fst.ino, exec });
    }
  }
  return { found, dirs, stopped, ms: Date.now() - t0 };
}
async function isDirP(p) { try { return (await fs.promises.stat(p)).isDirectory(); } catch { return false; } }

// .desktop files in the app menus: Exec= often points at an AppImage wherever it lives (Gear Lever,
// AppImageLauncher, hand-made menu entries), on any drive
function menuEntries(home) {
  const dirs = [path.join(home, '.local/share/applications'), '/usr/share/applications', '/usr/local/share/applications'];
  const out = [];
  for (const d of dirs) {
    let names = []; try { names = fs.readdirSync(d); } catch { continue; }
    for (const n of names) {
      if (!/\.desktop$/i.test(n)) continue;
      let t = ''; try { t = fs.readFileSync(path.join(d, n), 'utf8'); } catch { continue; }
      const de = parseDesktop(t);
      const exe = String(de.exec).trim().match(/^"([^"]+)"|^(\S+)/);
      const p = exe && (exe[1] || exe[2]);
      if (p && p.startsWith('/') && !/^\/usr\/bin\/flatpak$/.test(p)) out.push({ path: p, desktop: de, menu: path.join(d, n) });
    }
  }
  return out;
}

// Steam ROM Manager's saved setup, when there is one: [{ title, exe, args, romDir }]
function srmConfigs(home) {
  const files = [path.join(home, '.config/steam-rom-manager/userData/userConfigurations.json'), path.join(home, '.var/app/com.steamgriddb.steam-rom-manager/config/steam-rom-manager/userData/userConfigurations.json')];
  const out = [];
  for (const f of files) {
    let list; try { list = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    for (const c of Array.isArray(list) ? list : []) {
      if (!c || c.disabled || !c.executable?.path || /\$\{/.test(c.executable.path)) continue;
      if (c.parserType && !/glob/i.test(c.parserType)) continue; // store launchers (Epic, GOG...) aren't emulators
      out.push({ title: c.configTitle || '', exe: c.executable.path, args: String(c.executableArgs || ''), romDir: c.romDirectory || '', file: f });
    }
  }
  return out;
}

// More places programs live than the PATH Steam gives us: Snap, Nix, Homebrew, user Flatpak exports,
// and the PATH a login shell would have
// The login shell's PATH (owner, after 0.9.54: a few seconds after start Cartridge stopped responding, Steam dimmed
// it, and the controls were gone): asking for it held Electron's main thread up to 3 s. It's asked in the background
// now; until it answers the list goes without it (loginPathKnown says when it's complete).
let loginPath = null, loginAsk = null;
function warmLoginPath() {
  if (loginAsk) return loginAsk;
  const sh = process.env.SHELL && /\/(bash|zsh|sh|dash|ksh)$/.test(process.env.SHELL) ? process.env.SHELL : '/bin/bash';
  loginAsk = new Promise((res) => require('child_process').execFile(sh, ['-lc', 'printf %s "$PATH"'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }, (e, out) => { loginPath = e ? '' : String(out || ''); res(loginPath); }));
  return loginAsk;
}
const loginPathKnown = () => loginPath != null;
function extraBinDirs(home) {
  const dirs = ['/snap/bin', path.join(home, '.nix-profile/bin'), '/run/current-system/sw/bin', '/nix/var/nix/profiles/default/bin', '/home/linuxbrew/.linuxbrew/bin', path.join(home, '.linuxbrew/bin'), path.join(home, '.local/share/flatpak/exports/bin'), path.join(home, 'bin'), '/opt/bin'];
  if (loginPath == null) warmLoginPath(); else dirs.push(...loginPath.split(':'));
  return [...new Set(dirs.filter((d) => d && d.startsWith('/') && !d.includes('/tmp/.mount_')))];
}

// Installed Flatpak apps, read from Flatpak's own folders (after 0.9.54): `flatpak list` held the main thread for
// as long as it took (seconds on a Deck), which made Steam dim Cartridge as not responding. An app is installed when
// <installation>/app/<id>/current/active exists, in the user and system installations and any extra ones named in
// /etc/flatpak/installations.d. null when no installation folder exists (the caller can ask `flatpak` then).
function flatpakApps(home = require('os').homedir()) {
  const bases = [process.env.FLATPAK_USER_DIR || path.join(home, '.local/share/flatpak'), '/var/lib/flatpak'];
  try { for (const f of fs.readdirSync('/etc/flatpak/installations.d')) { const m = /^Path=(.+)$/m.exec(fs.readFileSync(path.join('/etc/flatpak/installations.d', f), 'utf8')); if (m) bases.push(m[1].trim()); } } catch {}
  const roots = bases.map((b) => path.join(b, 'app')).filter((d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
  if (!roots.length) return null;
  const ids = new Set();
  for (const r of roots) { let names = []; try { names = fs.readdirSync(r); } catch {} for (const n of names) if (fs.existsSync(path.join(r, n, 'current/active'))) ids.add(n); }
  return [...ids];
}

// ---------------------------------------------------------------- checks before a shortcut is made
// Older AppImage runtimes load libfuse.so.2 (dynamically linked: a PT_INTERP header); the newer static
// runtime doesn't need it. true = needs FUSE 2 and it isn't installed.
function missingFuse2(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const h = readAt(fd, 0, 64);
    if (h[4] !== 2) return false;
    const phoff = u64(h, 0x20), phentsize = h.readUInt16LE(0x36), phnum = h.readUInt16LE(0x38);
    const ph = readAt(fd, phoff, phentsize * phnum);
    let dynamic = false;
    for (let i = 0; i < phnum; i++) if (ph.readUInt32LE(i * phentsize) === 3) dynamic = true;
    if (!dynamic) return false;
  } catch { return false; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
  const libs = ['/usr/lib', '/usr/lib64', '/lib', '/lib64', '/usr/lib/x86_64-linux-gnu', '/lib/x86_64-linux-gnu', '/usr/lib/aarch64-linux-gnu'];
  return !libs.some((d) => { try { return fs.readdirSync(d).some((n) => /^libfuse\.so\.2/.test(n)); } catch { return false; } });
}

// Can this Flatpak app open that folder? Reads its permissions and any overrides (never changes them).
// { ok, known, why }: known is false when the permissions couldn't be read.
function flatpakCanSee(id, target, home = require('os').homedir()) {
  const realp = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
  const tgt = realp(target);
  const metas = [path.join(home, '.local/share/flatpak/app', id, 'current/active/metadata'), path.join('/var/lib/flatpak/app', id, 'current/active/metadata')];
  const overrides = [path.join('/var/lib/flatpak/overrides', 'global'), path.join('/var/lib/flatpak/overrides', id), path.join(home, '.local/share/flatpak/overrides', 'global'), path.join(home, '.local/share/flatpak/overrides', id)];
  const fsList = []; let known = false;
  for (const f of [metas.find((m) => fs.existsSync(m)), ...overrides].filter(Boolean)) {
    let t = ''; try { t = fs.readFileSync(f, 'utf8'); } catch { continue; }
    known = true;
    const ctx = t.split(/\n(?=\[)/).find((s) => /^\[Context\]/.test(s)) || '';
    const m = ctx.match(/^filesystems=(.*)$/m);
    if (m) for (const x of m[1].split(';').map((s) => s.trim()).filter(Boolean)) {
      if (x.startsWith('!')) { const i = fsList.indexOf(x.slice(1).replace(/:(ro|rw|create)$/, '')); if (i >= 0) fsList.splice(i, 1); } else fsList.push(x.replace(/:(ro|rw|create)$/, ''));
    }
  }
  if (!known) return { ok: true, known: false };
  const xdg = (name, def) => { try { const m = fs.readFileSync(path.join(home, '.config/user-dirs.dirs'), 'utf8').match(new RegExp(`^XDG_${name}_DIR="([^"]+)"`, 'm')); if (m) return m[1].replace('$HOME', home); } catch {} return path.join(home, def); };
  const XDG = { 'xdg-documents': xdg('DOCUMENTS', 'Documents'), 'xdg-download': xdg('DOWNLOAD', 'Downloads'), 'xdg-music': xdg('MUSIC', 'Music'), 'xdg-pictures': xdg('PICTURES', 'Pictures'), 'xdg-videos': xdg('VIDEOS', 'Videos'), 'xdg-desktop': xdg('DESKTOP', 'Desktop') };
  const dirs = [];
  for (const x of fsList) {
    if (x === 'host' || x === 'host-all') { dirs.push('/'); continue; }
    if (x === 'home') { dirs.push(home); continue; }
    const [base, ...rest] = x.split('/');
    if (XDG[base]) { dirs.push(path.join(XDG[base], ...rest)); continue; }
    if (x.startsWith('~/')) { dirs.push(path.join(home, x.slice(2))); continue; }
    if (x.startsWith('/')) dirs.push(x);
  }
  const hit = dirs.find((d) => { const r = realp(d).replace(/\/+$/, '') + '/'; return r === '//' || (tgt + '/').startsWith(r); });
  return { ok: !!hit, known: true, why: hit ? `allowed through ${hit}` : 'no permission for that folder', fix: `flatpak override --user --filesystem="${tgt}" ${id}` };
}

// ---------------------------------------------------------------- reading what each found file is
// For each candidate from walk()/menuEntries(): which emulator it is, with its version. Files that
// haven't changed since the last scan (same size and date) keep what was read then.
function identifyAll(cands, prevList = [], onProgress, log) {
  const prev = new Map(prevList.map((x) => [x.path, x]));
  const realp = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
  const ls = (p) => { try { return fs.readdirSync(p); } catch { return []; } };
  const real = realp;
  const items = [], seen = new Set();
  let strings = 0;
  for (const [i, cd] of cands.entries()) {
    if (i % 20 === 0) { onProgress?.(i); }
    const rp = real(cd.path);
    if (seen.has(rp)) continue;
    seen.add(rp);
    let st; try { st = fs.statSync(rp); } catch { continue; }
    const old = prev.get(cd.path);
    if (old && old.size === st.size && old.mtime === st.mtimeMs && cd.kind !== 'menu') { items.push(old); continue; }
    const it = { path: cd.path, size: st.size, mtime: st.mtimeMs, exec: !!(st.mode & 0o111) };
    try {
      if (cd.kind === 'unpacked') {
        const dn = ls(cd.dir).find((n) => /\.desktop$/i.test(n));
        const de = dn ? parseDesktop(fs.readFileSync(path.join(cd.dir, dn), 'utf8')) : null;
        Object.assign(it, { kind: 'unpacked', name: de?.name || '' }, identify({ desktop: de, desktopFile: dn && dn.replace(/\.desktop$/i, ''), fileName: path.basename(cd.dir) }));
      } else if (appImageType(rp)) {
        const info = readAppImage(rp);
        let idn = identify({ ...info, fileName: path.basename(rp) });
        // nothing readable inside (DwarFS, an unusual compression): the name is all there is, as before 0.9
        if (idn.conf === 1 && !info.desktop && !info.appstream && idn.why?.every((w) => w === 'its file name')) idn = { ...idn, conf: 2 };
        const version = info.appstream?.version || info.desktop?.version || (path.basename(rp).match(/(\d+\.\d+(?:\.\d+)?)/) || [])[1] || '';
        Object.assign(it, { kind: 'appimage', fs: info.fs, comp: info.comp, name: info.desktop?.name || info.appstream?.name || '', version, upd: info.upd || '', readError: info.error || '' }, idn);
      } else if (isElf(rp)) {
        const idn = cd.kind === 'menu' ? identify({ desktop: cd.desktop, fileName: path.basename(rp) }) : identifyProgram(rp, { strings: st.size > 5e6 && strings++ < 40 });
        if (!idn.id) continue;
        Object.assign(it, { kind: 'program' }, idn, { conf: Math.min(idn.conf, cd.kind === 'menu' ? 2 : idn.conf) });
      } else if (cd.kind === 'menu') { // a launcher script someone put in the app menu
        const idn = identify({ desktop: cd.desktop, fileName: path.basename(rp) });
        if (!idn.id) continue;
        Object.assign(it, { kind: 'script' }, idn, { conf: Math.min(idn.conf, 2) });
      } else continue;
    } catch (e) { log?.('scan: could not read', cd.path, e.message); continue; }
    if (!it.id && it.kind !== 'appimage') continue; // unknown AppImages stay listed, so you can say what they are
    items.push(it);
  }
  return items;
}
// The same in a worker thread; inline if a worker can't start
function identifyInWorker(cands, prevList, onProgress, log) {
  return new Promise((resolve) => {
    let w;
    const inline = () => resolve(identifyAll(cands, prevList, onProgress, log));
    try { w = new (require('worker_threads').Worker)(path.join(__dirname, 'detectWorker.js'), { workerData: { cands, prevList } }); } catch (e) { log?.('scan worker', e.message); return inline(); }
    let done = false;
    w.on('message', (m) => { if (m.progress != null) onProgress?.(m.progress); else if (m.log) log?.(...m.log); else if (m.items) { done = true; resolve(m.items); } });
    w.on('error', (e) => { log?.('scan worker failed, reading here', e.message); if (!done) { done = true; inline(); } });
    w.on('exit', () => { if (!done) { done = true; inline(); } });
  });
}

// one file from inside an AppImage (PCSX2's patches.zip lives in its usr/bin/resources), or null
function readAppImageFile(file, inner, max = 64 << 20, head = 0) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    let base = elfInfo(fd).end;
    if (readAt(fd, base, 4).toString('latin1') !== 'hsqs') { const i = readAt(fd, base, 1 << 20).indexOf('hsqs'); if (i < 0) return null; base += i; } // a little padding
    const fsys = squashfs(fd, base);
    const node = fsys && fsys.lookup(inner);
    return node && node.type === 'file' ? fsys.readFile(node, max, head) : null;
  } catch { return null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
}

// the newest glibc a program asks for (0.9.47, owner: "Vita3K doesn't open at all"): Vita3K's builds moved to Ubuntu
// 26.04 on 3 Oct 2026 and need glibc 2.43, which SteamOS and Bazzite don't have yet, so it died before any window.
// Read from the program itself (an AppImage's main program inside its squashfs), so nothing runs to find out.
const glibcCache = new Map();
function glibcNeeded(file) {
  let st; try { st = fs.statSync(file); } catch { return null; }
  const key = file + ':' + st.size + ':' + st.mtimeMs;
  if (glibcCache.has(key)) return glibcCache.get(key);
  let buf = null;
  try {
    if (appImageType(file)) {
      const a = readAppImage(file), exe = execName(a.desktop?.exec || '') || a.desktopFile || '';
      for (const inner of [exe && 'usr/bin/' + exe, 'AppRun.wrapped', exe && 'usr/bin/' + exe.toLowerCase()].filter(Boolean)) { buf = readAppImageFile(file, inner, 256 << 20, 4 << 20); if (buf && isElfBuf(buf)) break; buf = null; }
    } else if (isElf(file)) { const fd = fs.openSync(file, 'r'); try { buf = Buffer.alloc(Math.min(st.size, 4 << 20)); fs.readSync(fd, buf, 0, buf.length, 0); } finally { fs.closeSync(fd); } }
  } catch {}
  let best = null;
  if (buf) for (const m of buf.toString('latin1').matchAll(/GLIBC_2\.(\d+)(?:\.(\d+))?/g)) { const v = [2, +m[1], +(m[2] || 0)]; if (!best || cmpV(v, best) > 0) best = v; }
  const out = best ? best.slice(0, best[2] ? 3 : 2).join('.') : null;
  glibcCache.set(key, out);
  return out;
}
const isElfBuf = (b) => b.length > 4 && b[0] === 0x7f && b.toString('latin1', 1, 4) === 'ELF';
const cmpV = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
function systemGlibc() {
  try { const v = process.report?.getReport?.()?.header?.glibcVersionRuntime; if (v) return v; } catch {}
  try { const m = /(\d+\.\d+)\s*$/m.exec(require('child_process').execFileSync('ldd', ['--version'], { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }).split('\n')[0]); return m ? m[1] : null; } catch { return null; }
}
// { need, have } when the program wants a newer glibc than this system has, else null
function glibcProblem(file) {
  const need = glibcNeeded(file), have = systemGlibc();
  if (!need || !have) return null;
  return cmpV(need.split('.').map(Number), have.split('.').map(Number)) > 0 ? { need, have } : null;
}
module.exports = { flatpakApps, warmLoginPath, loginPathKnown, glibcNeeded, glibcProblem, systemGlibc, readAppImageFile, identifyAll, identifyInWorker, missingFuse2, flatpakCanSee, appImageType, isElf, readAppImage, parseDesktop, parseAppStream, identify, identifyProgram, walk, menuEntries, srmConfigs, extraBinDirs, execName, FAMILY, KNOWN };
