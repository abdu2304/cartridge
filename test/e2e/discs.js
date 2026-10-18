// Small game images for the sweeps (0.9.84): only the parts Cartridge reads to tell a game's ID, made by hand.
// ISO 9660 (PS1/PS2/PSP discs, folders one level deep), a GameCube header, a Dreamcast IP.BIN, an Xbox Live Arcade
// package (STFS), a 3DS cartridge dump (NCSD with one NCCH).
const S = 2048;
// files: { 'SYSTEM.CNF': Buffer, 'PSP_GAME/PARAM.SFO': Buffer }
function iso(files) {
  const dirs = { '': [] }, data = [];
  for (const [p, b] of Object.entries(files)) { const [d, n] = p.includes('/') ? p.split('/') : ['', p]; if (d && !dirs[d]) { dirs[d] = []; dirs[''].push({ dir: d }); } dirs[d].push({ name: n, b }); }
  const order = Object.keys(dirs), at = {}; let lba = 18;
  for (const d of order) at['/' + d] = lba++;
  for (const d of order) for (const e of dirs[d]) if (e.b) { e.lba = lba; lba += Math.max(1, Math.ceil(e.b.length / S)); data.push(e); }
  const b = Buffer.alloc(lba * S);
  const rec = (o, l, size, dir, name) => { const nb = Buffer.from(name, 'latin1'); const len = 33 + nb.length + (nb.length % 2 ? 0 : 1); b[o] = len; b.writeUInt32LE(l, o + 2); b.writeUInt32BE(l, o + 6); b.writeUInt32LE(size, o + 10); b.writeUInt32BE(size, o + 14); b[o + 25] = dir ? 2 : 0; b[o + 32] = nb.length; nb.copy(b, o + 33); return len; };
  const pvd = 16 * S; b[pvd] = 1; b.write('CD001', pvd + 1, 'latin1'); b[pvd + 6] = 1; rec(pvd + 156, at['/'], S, true, '\0');
  b[17 * S] = 255; b.write('CD001', 17 * S + 1, 'latin1');
  for (const d of order) {
    let o = at['/' + d] * S; o += rec(o, at['/' + d], S, true, '\0'); o += rec(o, at['/'], S, true, '\x01');
    for (const e of dirs[d]) o += e.dir ? rec(o, at['/' + e.dir], S, true, e.dir) : rec(o, e.lba, e.b.length, false, e.name + ';1');
  }
  for (const e of data) e.b.copy(b, e.lba * S);
  return b;
}
// a program whose words don't XOR to 0 (PCSX2's CRC; 0 reads as none)
const ELF = Buffer.from(Array.from({ length: 4096 }, (_, i) => Math.imul(i, 2654435761) >>> 24));
const gcm = (id) => { const b = Buffer.alloc(0x440); b.write(id, 0, 'latin1'); b.writeUInt32BE(0xc2339f3d, 0x1c); b.write('Test Disc', 0x20, 'latin1'); return b; };
const dcImg = (id) => { const b = Buffer.alloc(S * 16); b.write('SEGA SEGAKATANA SEGA ENTERPRISES', 0, 'latin1'); b.write(id.padEnd(10), 0x40, 'latin1'); return b; };
const stfs = (id) => { const b = Buffer.alloc(0x1000); b.write('LIVE', 0, 'latin1'); b.writeUInt32BE(parseInt(id, 16), 0x360); return b; };
const n3ds = (id) => { const b = Buffer.alloc(0x1000); b.write('NCSD', 0x100, 'latin1'); b.writeUInt32LE(1, 0x120); b.write('NCCH', 0x300, 'latin1'); b.writeBigUInt64LE(BigInt('0x' + id), 0x318); return b; };
module.exports = { iso, ELF, gcm, dcImg, stfs, n3ds };
