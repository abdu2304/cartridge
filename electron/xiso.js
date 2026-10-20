// Xbox disc images (XDVDFS, "XISO"), read and unpacked (0.9.91, PC playtest: JSRF Unleashed plays from the game's
// folder and unpacks an .iso only with extract-xiso, which few systems have; 7-Zip doesn't read the format).
// The volume descriptor is at sector 32 of the game partition: "MICROSOFT*XBOX*MEDIA", the root directory's sector
// and size. A directory is a binary tree of entries: left and right subtree offsets (in 4-byte units, 0xFFFF none),
// the entry's sector and size, its attributes (0x10 a folder) and its name, each entry padded to 4 bytes.
// A redump of a whole disc holds a video partition first: the game partition is found by its descriptor.
const fs = require('fs');
const path = require('path');

const SECTOR = 2048, MAGIC = 'MICROSOFT*XBOX*MEDIA';
// game partition offsets: a trimmed XISO, then the XGD1, XGD2 and XGD3 layouts of a full disc image
const BASES = [0, 0x18300000, 0xfd90000, 0x2080000];

async function readAt(fd, pos, len) {
  const b = Buffer.alloc(len);
  const { bytesRead } = await fd.read(b, 0, len, pos);
  return b.subarray(0, bytesRead);
}
async function baseOf(fd) {
  for (const base of BASES) { const h = await readAt(fd, base + 32 * SECTOR, 20); if (h.toString('latin1') === MAGIC) return base; }
  return -1;
}
// every file and folder: { rel, dir, pos, size }
async function list(file) {
  const fd = await fs.promises.open(file, 'r');
  try {
    const base = await baseOf(fd);
    if (base < 0) throw new Error('That isn’t an Xbox disc image (no XDVDFS volume in it).');
    const vd = await readAt(fd, base + 32 * SECTOR, 28);
    const out = [], seen = new Set();
    async function dir(sector, size, rel) {
      if (!size || seen.has(sector)) return;
      seen.add(sector);
      const buf = await readAt(fd, base + sector * SECTOR, size);
      const walk = async (off) => {
        if (off * 4 + 14 > buf.length) return;
        const o = off * 4, left = buf.readUInt16LE(o), right = buf.readUInt16LE(o + 2);
        const start = buf.readUInt32LE(o + 4), len = buf.readUInt32LE(o + 8), attr = buf[o + 12], nl = buf[o + 13];
        if (left === 0xffff && right === 0xffff && start === 0xffffffff) return; // padding
        const name = buf.subarray(o + 14, o + 14 + nl).toString('latin1');
        if (left && left !== 0xffff) await walk(left);
        if (name && !/[/\\]|^\.\.?$/.test(name)) {
          const r = rel ? rel + '/' + name : name;
          if (attr & 0x10) { out.push({ rel: r, dir: true }); await dir(start, len, r); }
          else out.push({ rel: r, dir: false, pos: base + start * SECTOR, size: len });
        }
        if (right && right !== 0xffff) await walk(right);
      };
      await walk(0);
    }
    await dir(vd.readUInt32LE(20), vd.readUInt32LE(24), '');
    return out;
  } finally { await fd.close(); }
}
// unpacked into dest (made fresh), files streamed in 4 MB blocks; onProgress(bytes done, bytes in all)
// keep: folders of the old unpacked copy carried into the new one (JSRF Unleashed keeps its saves in the game's UDATA)
async function unpack(file, dest, { onProgress = () => {}, signal, keep = [] } = {}) {
  const items = await list(file), total = items.reduce((n, x) => n + (x.size || 0), 0);
  const part = dest + '.part';
  await fs.promises.rm(part, { recursive: true, force: true });
  await fs.promises.mkdir(part, { recursive: true });
  const fd = await fs.promises.open(file, 'r');
  let done = 0;
  try {
    for (const x of items) {
      if (signal?.aborted) throw new Error('Stopped.');
      const to = path.join(part, x.rel);
      if (x.dir) { await fs.promises.mkdir(to, { recursive: true }); continue; }
      await fs.promises.mkdir(path.dirname(to), { recursive: true });
      const out = await fs.promises.open(to, 'w');
      try {
        const buf = Buffer.alloc(Math.min(4 << 20, Math.max(1, x.size)));
        for (let off = 0; off < x.size;) {
          const n = Math.min(buf.length, x.size - off);
          const { bytesRead } = await fd.read(buf, 0, n, x.pos + off);
          if (!bytesRead) throw new Error(`The disc image ends inside ${x.rel}: it may be cut short.`);
          await out.write(buf, 0, bytesRead);
          off += bytesRead; done += bytesRead;
          onProgress(done, total);
        }
      } finally { await out.close(); }
    }
  } finally { await fd.close(); }
  for (const k of keep) {
    const from = path.join(dest, k), to = path.join(part, k);
    if (!fs.existsSync(from) || /[/\\]|^\.\.?$/.test(k)) continue;
    await fs.promises.rm(to, { recursive: true, force: true });
    await fs.promises.rename(from, to);
  }
  await fs.promises.rm(dest, { recursive: true, force: true });
  await fs.promises.rename(part, dest);
  return { files: items.filter((x) => !x.dir).length, bytes: total };
}
module.exports = { list, unpack, baseOf };
