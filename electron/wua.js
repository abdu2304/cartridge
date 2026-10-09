// The title IDs in a Cemu .wua file (0.9.63, owner: Mario Tennis Ultra Smash's Game Settings said "Cartridge couldn't
// read this game's title ID"). A .wua is a ZArchive (github.com/Exzap/ZArchive, zarchivecommon.h, zarchivereader.cpp):
// a 144-byte footer at the end, all big-endian: six (offset, size) sections (compressed data, offset records, names,
// file tree, meta directory, meta data), a 32-byte hash, total size, version 0x61bf3a01, magic 0x169f52d6. The file
// tree is 16-byte entries (name offset with the top bit set for a file, then a directory's first child and count);
// entry 0 is the root. Cemu writes each title as a root folder named "<title ID>_v<version>" (its WUA converter), so
// the IDs are read from the names alone, nothing is unpacked.
const fs = require('fs');

const MAGIC = 0x169f52d6, VERSION = 0x61bf3a01, FOOTER = 16 * 6 + 32 + 8 + 4 + 4;
function readAt(fd, pos, len) { const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, pos); return b; }
const big = (b, o) => Number(b.readBigUInt64BE(o));
function nameAt(names, off) {
  if (off === 0x7fffffff || off >= names.length) return '';
  let len = names[off] & 0x7f;
  if (names[off] & 0x80) { len |= names[off + 1] << 7; off += 2; } else off += 1;
  return off + len <= names.length ? names.toString('utf8', off, off + len) : '';
}
// -> [{ id: '00050000101C9500', version: 0 }] for each title folder, [] when it isn't a .wua
function titles(file) {
  let fd; try { fd = fs.openSync(file, 'r'); } catch { return []; }
  try {
    const size = fs.fstatSync(fd).size; if (size < FOOTER) return [];
    const f = readAt(fd, size - FOOTER, FOOTER);
    if (f.readUInt32BE(FOOTER - 4) !== MAGIC || f.readUInt32BE(FOOTER - 8) !== VERSION) return [];
    const [nOff, nSize, tOff, tSize] = [big(f, 32), big(f, 40), big(f, 48), big(f, 56)];
    if (nOff + nSize > size || tOff + tSize > size || tSize < 16 || nSize > 64 << 20 || tSize > 64 << 20) return [];
    const names = readAt(fd, nOff, nSize), tree = readAt(fd, tOff, Math.min(tSize, 16 * 4096));
    const root = tree.readUInt32BE(0);
    if (root & 0x80000000) return [];
    const start = tree.readUInt32BE(4), count = tree.readUInt32BE(8), out = [];
    for (let i = start; i < start + count && (i + 1) * 16 <= tree.length; i++) {
      const w = tree.readUInt32BE(i * 16); if (w & 0x80000000) continue; // a file at the top: not a title
      const m = /^([0-9a-f]{16})_v(\d+)$/i.exec(nameAt(names, w & 0x7fffffff));
      if (m) out.push({ id: m[1].toUpperCase(), version: Number(m[2]) });
    }
    return out;
  } catch { return []; } finally { fs.closeSync(fd); }
}
module.exports = { titles, nameAt };
