'use strict';
// SHA3-256, HMAC-SHA3-256 and PBKDF2 over it (0.9.66, Online Play). Electron's crypto (BoringSSL) has no SHA3, and
// RPCS3 stores the RPCN password as PBKDF2-SHA3-256 of what you type (rpcn_settings_dialog.cpp derive_password).
// Keccak-f[1600] on 32-bit halves (no BigInt: 200,000 rounds of PBKDF2 would take minutes). Checked against Node's
// own sha3-256 in test/onlinePlay.test.js. Pure and synchronous: callers run the slow PBKDF2 in a worker.
const RC = [[0, 1], [0, 0x8082], [0x80000000, 0x808a], [0x80000000, 0x80008000], [0, 0x808b], [0, 0x80000001], [0x80000000, 0x80008081], [0x80000000, 0x8009], [0, 0x8a], [0, 0x88], [0, 0x80008009], [0, 0x8000000a], [0, 0x8000808b], [0x80000000, 0x8b], [0x80000000, 0x8089], [0x80000000, 0x8003], [0x80000000, 0x8002], [0x80000000, 0x80], [0, 0x800a], [0x80000000, 0x8000000a], [0x80000000, 0x80008081], [0x80000000, 0x8080], [0, 0x80000001], [0x80000000, 0x80008008]];
const R = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
function keccakF(hi, lo) {
  const ch = new Int32Array(5), cl = new Int32Array(5), bh = new Int32Array(25), bl = new Int32Array(25);
  for (let round = 0; round < 24; round++) {
    for (let x = 0; x < 5; x++) { ch[x] = hi[x] ^ hi[x + 5] ^ hi[x + 10] ^ hi[x + 15] ^ hi[x + 20]; cl[x] = lo[x] ^ lo[x + 5] ^ lo[x + 10] ^ lo[x + 15] ^ lo[x + 20]; }
    for (let x = 0; x < 5; x++) {
      const p = (x + 4) % 5, n = (x + 1) % 5;
      const dh = ch[p] ^ ((ch[n] << 1) | (cl[n] >>> 31)), dl = cl[p] ^ ((cl[n] << 1) | (ch[n] >>> 31));
      for (let y = 0; y < 25; y += 5) { hi[x + y] ^= dh; lo[x + y] ^= dl; }
    }
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
      const i = x + 5 * y, r = R[i], j = y + 5 * ((2 * x + 3 * y) % 5);
      let h = hi[i], l = lo[i];
      if (r >= 32) { const t = h; h = l; l = t; }
      const s = r % 32;
      if (s) { const nh = (h << s) | (l >>> (32 - s)), nl = (l << s) | (h >>> (32 - s)); h = nh; l = nl; }
      bh[j] = h; bl[j] = l;
    }
    for (let y = 0; y < 25; y += 5) for (let x = 0; x < 5; x++) {
      hi[x + y] = bh[x + y] ^ (~bh[((x + 1) % 5) + y] & bh[((x + 2) % 5) + y]);
      lo[x + y] = bl[x + y] ^ (~bl[((x + 1) % 5) + y] & bl[((x + 2) % 5) + y]);
    }
    hi[0] ^= RC[round][0]; lo[0] ^= RC[round][1];
  }
}
const RATE = 136;
function sha3_256(data) {
  const msg = Buffer.from(data);
  const hi = new Int32Array(25), lo = new Int32Array(25);
  const padLen = RATE - (msg.length % RATE);
  const buf = Buffer.alloc(msg.length + padLen);
  msg.copy(buf); buf[msg.length] ^= 0x06; buf[buf.length - 1] ^= 0x80;
  for (let off = 0; off < buf.length; off += RATE) {
    for (let i = 0; i < RATE / 8; i++) { lo[i] ^= buf.readInt32LE(off + i * 8); hi[i] ^= buf.readInt32LE(off + i * 8 + 4); }
    keccakF(hi, lo);
  }
  const out = Buffer.alloc(32);
  for (let i = 0; i < 4; i++) { out.writeInt32LE(lo[i], i * 8); out.writeInt32LE(hi[i], i * 8 + 4); }
  return out;
}
function hmac(key, data) {
  let k = Buffer.from(key);
  if (k.length > RATE) k = sha3_256(k);
  const pad = Buffer.alloc(RATE); k.copy(pad);
  const ipad = Buffer.alloc(RATE), opad = Buffer.alloc(RATE);
  for (let i = 0; i < RATE; i++) { ipad[i] = pad[i] ^ 0x36; opad[i] = pad[i] ^ 0x5c; }
  return sha3_256(Buffer.concat([opad, sha3_256(Buffer.concat([ipad, Buffer.from(data)]))]));
}
// the state after absorbing one full block (the key's inner or outer pad): reused for every round, so each HMAC of
// a 32-byte value is two permutations instead of four
function absorbed(block) { const hi = new Int32Array(25), lo = new Int32Array(25); for (let i = 0; i < RATE / 8; i++) { lo[i] ^= block.readInt32LE(i * 8); hi[i] ^= block.readInt32LE(i * 8 + 4); } keccakF(hi, lo); return [hi, lo]; }
function finish32(state, msg) { // sha3 of (absorbed block || msg), msg 32 bytes
  const hi = Int32Array.from(state[0]), lo = Int32Array.from(state[1]), b = Buffer.alloc(RATE);
  msg.copy(b); b[32] ^= 0x06; b[RATE - 1] ^= 0x80;
  for (let i = 0; i < RATE / 8; i++) { lo[i] ^= b.readInt32LE(i * 8); hi[i] ^= b.readInt32LE(i * 8 + 4); }
  keccakF(hi, lo);
  const out = Buffer.alloc(32); for (let i = 0; i < 4; i++) { out.writeInt32LE(lo[i], i * 8); out.writeInt32LE(hi[i], i * 8 + 4); } return out;
}
function pbkdf2(password, salt, iterations, length) {
  let k = Buffer.from(password); if (k.length > RATE) k = sha3_256(k);
  const pad = Buffer.alloc(RATE); k.copy(pad);
  const ip = Buffer.alloc(RATE), op = Buffer.alloc(RATE);
  for (let i = 0; i < RATE; i++) { ip[i] = pad[i] ^ 0x36; op[i] = pad[i] ^ 0x5c; }
  const IS = absorbed(ip), OS = absorbed(op);
  const out = Buffer.alloc(length);
  for (let block = 1, off = 0; off < length; block++, off += 32) {
    const b = Buffer.alloc(4); b.writeUInt32BE(block);
    let u = hmac(password, Buffer.concat([Buffer.from(salt), b]));
    const t = Buffer.from(u);
    for (let i = 1; i < iterations; i++) { u = finish32(OS, finish32(IS, u)); for (let j = 0; j < 32; j++) t[j] ^= u[j]; }
    t.copy(out, off, 0, Math.min(32, length - off));
  }
  return out;
}
module.exports = { sha3_256, hmac, pbkdf2 };
