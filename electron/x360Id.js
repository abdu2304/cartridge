// An Xbox 360 game's title ID (0.9.62, for Xenia's per-game settings, config/<TITLE ID>.config.toml), read from the
// game the way Xenia gets it (the executable's execution info):
// - a disc image: the XDVDFS volume ("MICROSOFT*XBOX*MEDIA" at sector 32 of the game partition, which starts at 0 for
//   extracted images or at one of the XGD offsets for full dumps), default.xex found by walking the directory tree
//   (each entry: left and right subtree offsets in dwords, start sector, size, attributes, name length, name)
// - a loose default.xex (extracted game folder)
// - an STFS package (Games on Demand, XBLA: "CON ", "LIVE", "PIRS"): the title ID at 0x360 of its header
// XEX2: "XEX2", flags, PE offset, reserved, security offset, optional header count, then (key, value) pairs, all
// big-endian; execution info is key 0x00040006 and its title ID is the fourth word.
const fs = require('fs');
const path = require('path');

const SECTOR = 2048;
const PARTITIONS = [0, 0xfd90000, 0x2080000, 0x18300000]; // extracted, XGD2, XGD3, XGD1
const hex = (n) => (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
const ok = (id) => /^[0-9A-F]{8}$/.test(id) && id !== '00000000' && id !== 'FFFFFFFF';

function readAt(fd, pos, len) { const b = Buffer.alloc(len); const n = fs.readSync(fd, b, 0, len, pos); return n === len ? b : b.subarray(0, n); }

function xexTitle(buf) {
  if (buf.length < 24 || buf.toString('latin1', 0, 4) !== 'XEX2') return null;
  const count = buf.readUInt32BE(20);
  for (let i = 0; i < count && 24 + i * 8 + 8 <= buf.length; i++) {
    const key = buf.readUInt32BE(24 + i * 8), val = buf.readUInt32BE(28 + i * 8);
    if (key === 0x00040006 && val + 16 <= buf.length) { const id = hex(buf.readUInt32BE(val + 12)); return ok(id) ? id : null; }
  }
  return null;
}

function fromIso(fd, size) {
  for (const base of PARTITIONS) {
    if (base + 33 * SECTOR > size) continue;
    const vd = readAt(fd, base + 32 * SECTOR, 28);
    if (vd.toString('latin1', 0, 20) !== 'MICROSOFT*XBOX*MEDIA') continue;
    const rootSector = vd.readUInt32LE(20), rootSize = vd.readUInt32LE(24);
    if (!rootSize || rootSize > 16 * 1024 * 1024) continue;
    const dir = readAt(fd, base + rootSector * SECTOR, rootSize);
    const stack = [0], seen = new Set();
    while (stack.length) {
      const off = stack.pop();
      if (seen.has(off) || off + 14 > dir.length) continue;
      seen.add(off);
      const left = dir.readUInt16LE(off), right = dir.readUInt16LE(off + 2);
      if (left === 0xffff && right === 0xffff) continue; // padding
      const start = dir.readUInt32LE(off + 4), len = dir.readUInt32LE(off + 8), nameLen = dir[off + 13];
      const name = dir.toString('latin1', off + 14, off + 14 + nameLen);
      if (name.toLowerCase() === 'default.xex') return xexTitle(readAt(fd, base + start * SECTOR, Math.min(len, 64 * 1024)));
      if (left && left !== 0xffff) stack.push(left * 4);
      if (right && right !== 0xffff) stack.push(right * 4);
    }
  }
  return null;
}

// file: an .iso/.xiso, a default.xex, a game folder, or an STFS package
function titleId(file) {
  try {
    let st = fs.statSync(file);
    if (st.isDirectory()) {
      const names = fs.readdirSync(file);
      const xex = names.find((n) => n.toLowerCase() === 'default.xex');
      if (xex) return titleId(path.join(file, xex));
      // Games on Demand: <title ID>/00007000/<package>, or the package itself in the folder
      const tid = names.find((n) => /^[0-9A-F]{8}$/i.test(n) && fs.statSync(path.join(file, n)).isDirectory());
      if (tid && ok(tid.toUpperCase())) return tid.toUpperCase();
      const big = names.map((n) => path.join(file, n)).filter((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } }).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
      return big ? titleId(big) : null;
    }
    const fd = fs.openSync(file, 'r');
    try {
      const head = readAt(fd, 0, 0x400);
      const magic = head.toString('latin1', 0, 4);
      if (magic === 'XEX2') return xexTitle(readAt(fd, 0, Math.min(st.size, 64 * 1024)));
      if (/^(CON |LIVE|PIRS)$/.test(magic) && head.length >= 0x364) { const id = hex(head.readUInt32BE(0x360)); return ok(id) ? id : null; }
      return fromIso(fd, st.size);
    } finally { fs.closeSync(fd); }
  } catch { return null; }
}

module.exports = { titleId, xexTitle };
