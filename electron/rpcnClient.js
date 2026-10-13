'use strict';
// RPCN account requests (0.9.66, owner: make accounts in Cartridge). Written from RPCS3's own client
// (RPCS3/rpcs3 ce10778: rpcs3/Emu/NP/rpcn_client.cpp, rpcn_types.h): TLS to the host in rpcn.yml (port 31313 unless
// "host:port"), certificate not checked (rpcn_client.cpp:1021 sets SSL_VERIFY_NONE, so RPCS3 never checked it either);
// the server first sends a ServerInfo packet with its protocol version (32 expected, :263, :729-735). Every packet has
// a 15-byte header (:2989-3001): type u8 (0 request, 1 reply, 3 server info), command u16, size u32 (header included),
// id u64, all little endian. Create (command 2, :1321) sends npid, password, online name, avatar URL and email, each
// ending in a NUL; the password is the derived hash RPCS3 stores (rpcn_settings_dialog.cpp:303, :540), never the typed
// one. SendToken (command 4, :1355) asks for the token email again. The reply's first byte is the error (rpcn_types.h).
// Tested in test/onlinePlay.test.js against a fake server.
const PROTOCOL = 32, HEADER = 15, CMD = { Create: 2, SendToken: 4 }, PORT = 31313;
const AVATAR = 'https://rpcs3.net/cdn/netplay/DefaultAvatar.png';
const ERRORS = {
  1: 'RPCN didn’t understand the request.', 2: 'RPCN refused the request.', 3: 'RPCN didn’t accept what was typed.', 4: 'Too soon: wait a minute and try again.',
  5: 'RPCN couldn’t sign in.', 7: 'RPCN doesn’t know that username.', 8: 'That password is wrong.', 9: 'That token is wrong.',
  10: 'RPCN couldn’t make the account. Try again later.', 11: 'That username is taken. Pick another.', 12: 'RPCN doesn’t accept email addresses from that provider. Use another.',
  13: 'An account with that email already exists.', 23: 'RPCN refused the request.', 24: 'RPCN’s database failed. Try again later.', 25: 'RPCN couldn’t send the email. Try again later.', 26: 'RPCN doesn’t know that account.',
};
const cstr = (s) => Buffer.concat([Buffer.from(String(s), 'utf8'), Buffer.from([0])]);
function packet(cmd, id, data) {
  const h = Buffer.alloc(HEADER);
  h.writeUInt8(0, 0); h.writeUInt16LE(cmd, 1); h.writeUInt32LE(HEADER + data.length, 3); h.writeBigUInt64LE(BigInt(id), 7);
  return Buffer.concat([h, data]);
}
function hostOf(h) { const [host, port] = String(h || 'np.rpcs3.net').trim().split(':'); return { host, port: port ? Number(port) : PORT }; }
// one request on its own connection: wait for the server's version, send, read the reply with the same id
function request(hostText, cmd, data, { connect, timeout = 20000 } = {}) {
  const { host, port } = hostOf(hostText);
  const open = connect || ((o, cb) => require('tls').connect({ ...o, servername: o.host, rejectUnauthorized: false }, cb));
  return new Promise((resolve, reject) => {
    const id = 0x100000001; // RPCS3's first id for requests it handles itself (rpcn_client.h:428)
    let buf = Buffer.alloc(0), sent = false, done = false;
    const end = (err, v) => { if (done) return; done = true; clearTimeout(t); try { sock.destroy(); } catch {} err ? reject(err) : resolve(v); };
    const t = setTimeout(() => end(new Error('RPCN didn’t answer. Check your connection and try again.')), timeout);
    const sock = open({ host, port }, () => {});
    sock.on('error', (e) => end(new Error(/ENOTFOUND|EAI_AGAIN/.test(e.code || '') ? 'RPCN’s server couldn’t be found. Check your connection.' : `Couldn’t reach RPCN (${e.code || e.message}).`)));
    sock.on('close', () => end(new Error('RPCN closed the connection.')));
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= HEADER) {
        const size = buf.readUInt32LE(3);
        if (size < HEADER) return end(new Error('RPCN sent something Cartridge doesn’t understand.'));
        if (buf.length < size) return;
        const type = buf.readUInt8(0), pid = buf.readBigUInt64LE(7), body = buf.subarray(HEADER, size);
        buf = buf.subarray(size);
        if (type === 3) {
          const v = body.length === 4 ? body.readUInt32LE(0) : -1;
          if (v !== PROTOCOL) return end(new Error(`RPCN speaks a newer version (${v}) than Cartridge knows (${PROTOCOL}). Make the account in RPCS3 this time.`));
          if (!sent) { sent = true; sock.write(packet(cmd, id, data)); }
        } else if (type === 1 && pid === BigInt(id)) {
          const err = body.length ? body.readUInt8(0) : 1;
          return end(null, { error: err });
        }
      }
    });
  });
}
const why = (n) => ERRORS[n] || `RPCN answered with error ${n}.`;
async function create({ host, npid, hash, email, connect, timeout }) {
  const r = await request(host, CMD.Create, Buffer.concat([cstr(npid), cstr(hash), cstr(npid), cstr(AVATAR), cstr(email)]), { connect, timeout });
  if (r.error) throw new Error(why(r.error));
  return { ok: true };
}
async function sendToken({ host, npid, hash, connect, timeout }) {
  const r = await request(host, CMD.SendToken, Buffer.concat([cstr(npid), cstr(hash)]), { connect, timeout });
  if (r.error) throw new Error(why(r.error));
  return { ok: true };
}
module.exports = { create, sendToken, packet, hostOf, PROTOCOL, HEADER };
