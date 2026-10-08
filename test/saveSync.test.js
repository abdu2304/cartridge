// Cartridge Save Sync (0.9.51): units found in fake homes, RomM's hash, the decision table, and two devices syncing
// through a fake RomM that behaves like backend/endpoints/saves.py (slots with versions, content hash, 409 when
// another device saved since this device's last sync).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const SS = require('../electron/saveSync');

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cart-ss-')));
const put = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); return p; };
const SWITCH_ID = '0100F2C0115B6000';

// a device with Eden (its own user ID), RPCS3, a PCSX2 card and RetroArch saves and states
function device(user, o = {}) {
  const h = tmp();
  if (!o.empty) {
    put(h, `.local/share/eden/nand/user/save/0000000000000000/${user}/${SWITCH_ID}/save.bin`, o.sw || 'zelda 1');
    put(h, '.config/rpcs3/dev_hdd0/home/00000001/savedata/BLUS30443-SAVE/PARAM.SFO', 'x');
    put(h, '.config/rpcs3/dev_hdd0/home/00000001/savedata/BLUS30443-SAVE/DATA.BIN', o.ps3 || 'demons 1');
    put(h, '.config/PCSX2/memcards/Mcd001.ps2', o.card || 'card 1');
    put(h, '.config/retroarch/retroarch.cfg', '');
    put(h, '.config/retroarch/saves/Super Metroid (USA).srm', 'srm 1');
    put(h, '.config/retroarch/states/Snes9x/Super Metroid (USA).state', 'state 1');
    put(h, '.config/retroarch/states/Snes9x/Super Metroid (USA).state1', 'state 2');
  } else {
    fs.mkdirSync(path.join(h, `.local/share/eden/nand/user/save/0000000000000000/${user}`), { recursive: true });
    fs.mkdirSync(path.join(h, '.config/rpcs3/dev_hdd0/home/00000001'), { recursive: true });
    fs.mkdirSync(path.join(h, '.config/PCSX2/memcards'), { recursive: true });
    put(h, '.config/retroarch/retroarch.cfg', '');
    fs.mkdirSync(path.join(h, '.config/retroarch/saves'), { recursive: true });
    fs.mkdirSync(path.join(h, '.config/retroarch/states'), { recursive: true });
  }
  return h;
}
const GAMES = [
  { id: 1, name: 'The Legend of Zelda', ids: [SWITCH_ID] },
  { id: 2, name: "Demon's Souls", ids: ['BLUS30443'] },
  { id: 3, name: 'Super Metroid (USA)', ids: [] },
  { id: 9, name: 'Ico', ids: ['SCUS97113'] },
];
const CARRIERS = { ps2: 9 };

// RomM: saves by (rom, slot), newest wins; per-device sync records like device_save_sync
function fakeRomm() {
  const saves = [], syncs = new Map(); let id = 0, clock = 1000;
  const hashOf = (buf) => SS.hashArchive(SS.unzip(buf));
  const rpcFor = (dev) => ({
    list: async (romId, slot) => saves.filter((s) => s.rom_id === romId && s.slot === slot),
    listAll: async () => saves.slice(),
    upload: async (u, buf, name, { overwrite } = {}) => {
      const slotSaves = saves.filter((s) => s.rom_id === u.romId && s.slot === u.slot).sort((a, b) => b.updated_at - a.updated_at);
      const latest = slotSaves[0], sync = latest && syncs.get(dev + ':' + latest.id);
      if (latest && !overwrite && (!sync || sync < latest.updated_at)) return { conflict: true }; // 409
      const s = { id: ++id, rom_id: u.romId, slot: u.slot, emulator: u.emu, buf, content_hash: hashOf(buf), updated_at: ++clock, file_name: name };
      saves.push(s); syncs.set(dev + ':' + s.id, s.updated_at);
      return s;
    },
    download: async (sid) => { const s = saves.find((x) => x.id === sid); syncs.set(dev + ':' + sid, s.updated_at); return s.buf; },
    confirm: async () => {},
  });
  return { saves, rpcFor };
}
const ledger = () => { const m = new Map(); return { get: (k) => m.get(k), set: (k, v) => m.set(k, v), m }; };

test('units: every kind found, keyed without the device\'s own user folder, cards on the carrier', () => {
  const h = device('AAAA1111');
  const us = SS.units({ home: h, games: GAMES, carriers: CARRIERS });
  const by = Object.fromEntries(us.map((u) => [u.key, u]));
  assert.strictEqual(by['switch:' + SWITCH_ID].romId, 1);
  assert.strictEqual(by['switch:' + SWITCH_ID].kind, 'dir');
  assert.strictEqual(by['ps3:BLUS30443-SAVE'].romId, 2);
  assert.strictEqual(by['ps2card:Mcd001.ps2'].romId, 9); // the whole card, on the console's carrier game
  assert.strictEqual(by['ra:Super Metroid (USA).srm'].romId, 3);
  const st = by['rastate:Snes9x/Super Metroid (USA)'];
  assert.deepStrictEqual(st.files, ['Super Metroid (USA).state', 'Super Metroid (USA).state1']);
  assert.strictEqual(st.romId, 3);
  assert.match(by['switch:' + SWITCH_ID].slot, /^cartridge:switch:dir:switch:/); // 0.9.58: the console family, not the emulator
});

test('the Eden family for Switch saves, never Ryujinx', () => {
  const h = device('AAAA1111');
  put(h, `.local/share/citron/nand/user/save/0000000000000000/X/${'0100000000010000'}/a.bin`, 'c');
  put(h, '.config/Ryujinx/bis/user/save/0000000000000001/0/a.bin', 'r');
  const us = SS.units({ home: h, games: GAMES });
  assert.ok(us.some((u) => u.emu === 'citron' && u.slot.startsWith('cartridge:switch:dir:')));
  assert.ok(!us.some((u) => u.emu === 'ryujinx'));
});

test('hash: the same as RomM\'s for the zip Cartridge uploads', () => {
  const h = device('AAAA1111');
  const u = SS.units({ home: h, games: GAMES }).find((x) => x.key.startsWith('ps3:'));
  const buf = SS.zip(SS.entriesOf(u));
  assert.strictEqual(SS.hashArchive(SS.unzip(buf)), SS.hashUnit(u));
  // RomM's own code (handler/filesystem/assets_handler.py hash_zip_contents), run in Python when it's there
  let py = null; try { execFileSync('python3', ['-c', 'pass']); py = 'python3'; } catch {}
  if (!py) return;
  const f = path.join(h, 'up.zip'); fs.writeFileSync(f, buf);
  const romm = execFileSync(py, ['-c', `
import hashlib, zipfile, sys
zf = zipfile.ZipFile(sys.argv[1])
lines = []
for name in sorted(zf.namelist()):
    if not name.endswith('/'):
        lines.append(name + ':' + hashlib.md5(zf.read(name)).hexdigest())
print(hashlib.md5('\\n'.join(lines).encode()).hexdigest())`, f]).toString().trim();
  assert.strictEqual(romm, SS.hashUnit(u));
});

test('decide: up, down, same, and a conflict is never guessed', () => {
  const r = (hash) => ({ id: 1, hash });
  assert.strictEqual(SS.decide(null, null, null), 'none');
  assert.strictEqual(SS.decide('a', null, null), 'up');
  assert.strictEqual(SS.decide(null, r('a'), null), 'down');
  assert.strictEqual(SS.decide('a', r('a'), null), 'same');
  assert.strictEqual(SS.decide('a', r('b'), null), 'conflict'); // first sync here, both differ
  assert.strictEqual(SS.decide('b', r('a'), { hash: 'a', remoteHash: 'a' }), 'up');
  assert.strictEqual(SS.decide('a', r('b'), { hash: 'a', remoteHash: 'a' }), 'down');
  assert.strictEqual(SS.decide('c', r('b'), { hash: 'a', remoteHash: 'a' }), 'conflict');
});

test('two devices through RomM: up, brought over, changed, back, and a conflict', async () => {
  const romm = fakeRomm();
  const A = device('AAAA1111'), B = device('BBBB2222', { empty: true });
  const la = ledger(), lb = ledger(), bk = tmp(), opts = (home) => ({ home, backupsRoot: bk, procs: [] });
  // A uploads everything it has
  for (const u of SS.units({ home: A, games: GAMES, carriers: CARRIERS })) assert.strictEqual((await SS.syncUnit(u, romm.rpcFor('A'), la, opts(A))).result, 'up');
  // B has none of them: they come from RomM into B's own folders (B's Eden user, not A's)
  const keysB = new Set(SS.units({ home: B, games: GAMES }).map((u) => u.key));
  const remote = SS.remoteOnly(romm.saves, keysB);
  assert.strictEqual(remote.length, 5);
  for (const u of remote) assert.strictEqual((await SS.syncUnit(u, romm.rpcFor('B'), lb, opts(B))).result, 'down', u.key);
  assert.strictEqual(fs.readFileSync(path.join(B, `.local/share/eden/nand/user/save/0000000000000000/BBBB2222/${SWITCH_ID}/save.bin`), 'utf8'), 'zelda 1');
  assert.strictEqual(fs.readFileSync(path.join(B, '.config/retroarch/states/Snes9x/Super Metroid (USA).state1'), 'utf8'), 'state 2');
  // B plays and saves: up; A, unchanged, takes it down (and keeps a backup of its old save)
  put(B, '.config/rpcs3/dev_hdd0/home/00000001/savedata/BLUS30443-SAVE/DATA.BIN', 'demons 2');
  const ub = SS.units({ home: B, games: GAMES }).find((u) => u.key === 'ps3:BLUS30443-SAVE');
  assert.strictEqual((await SS.syncUnit(ub, romm.rpcFor('B'), lb, opts(B))).result, 'up');
  const ua = SS.units({ home: A, games: GAMES }).find((u) => u.key === 'ps3:BLUS30443-SAVE');
  assert.strictEqual((await SS.syncUnit(ua, romm.rpcFor('A'), la, opts(A))).result, 'down');
  assert.strictEqual(fs.readFileSync(path.join(A, '.config/rpcs3/dev_hdd0/home/00000001/savedata/BLUS30443-SAVE/DATA.BIN'), 'utf8'), 'demons 2');
  assert.ok(fs.readdirSync(bk).some((d) => d.startsWith('ps3_BLUS30443-SAVE')));
  // both change before syncing: a conflict, nothing written; then the person picks theirs
  put(A, '.config/PCSX2/memcards/Mcd001.ps2', 'card A');
  put(B, '.config/PCSX2/memcards/Mcd001.ps2', 'card B');
  const cb = SS.units({ home: B, games: GAMES, carriers: CARRIERS }).find((u) => u.key === 'ps2card:Mcd001.ps2');
  assert.strictEqual((await SS.syncUnit(cb, romm.rpcFor('B'), lb, opts(B))).result, 'up');
  const ca = SS.units({ home: A, games: GAMES, carriers: CARRIERS }).find((u) => u.key === 'ps2card:Mcd001.ps2');
  assert.strictEqual((await SS.syncUnit(ca, romm.rpcFor('A'), la, opts(A))).result, 'conflict');
  assert.strictEqual(fs.readFileSync(path.join(A, '.config/PCSX2/memcards/Mcd001.ps2'), 'utf8'), 'card A');
  assert.strictEqual((await SS.syncUnit(ca, romm.rpcFor('A'), la, { ...opts(A), choice: 'theirs' })).result, 'down');
  assert.strictEqual(fs.readFileSync(path.join(A, '.config/PCSX2/memcards/Mcd001.ps2'), 'utf8'), 'card B');
});

test('guard rails: never under a running emulator, never a damaged download, unmatched saves stay put', async () => {
  const romm = fakeRomm();
  const A = device('AAAA1111'), bk = tmp(), l = ledger();
  const u = SS.units({ home: A, games: GAMES }).find((x) => x.key.startsWith('ps3:'));
  assert.strictEqual((await SS.syncUnit(u, romm.rpcFor('A'), l, { home: A, backupsRoot: bk, procs: ['/usr/bin/rpcs3 --no-gui game'] })).result, 'busy');
  assert.strictEqual((await SS.syncUnit({ ...u, romId: null }, romm.rpcFor('A'), l, { home: A, backupsRoot: bk, procs: [] })).result, 'unmatched');
  // RomM answers with bytes that don't match its own hash: nothing is written
  await SS.syncUnit(u, romm.rpcFor('A'), l, { home: A, backupsRoot: bk, procs: [] });
  const B = device('BBBB2222', { empty: true });
  const bad = { ...romm.rpcFor('B'), download: async () => SS.zip([['DATA.BIN', null]].slice(0, 0).concat([['x.bin', path.join(A, '.config/retroarch/retroarch.cfg')]])) };
  const rem = SS.remoteOnly(romm.saves, new Set())[0];
  assert.strictEqual((await SS.syncUnit(rem, bad, ledger(), { home: B, backupsRoot: bk, procs: [] })).result, 'damaged');
  assert.ok(!fs.existsSync(path.join(B, '.config/rpcs3/dev_hdd0/home/00000001/savedata/BLUS30443-SAVE')));
});

test('zip: refuses names that leave the save\'s folder', () => {
  const buf = SS.zip([['ok.bin', __filename]]);
  const evil = Buffer.from(buf.toString('latin1').replace(/ok\.bin/g, '../x.b'), 'latin1');
  assert.throws(() => SS.unzip(evil), /unsafe/);
});

// RomM's API over HTTP: the same requests Cartridge sends (multipart saveFile, slot, device_id, content_hash), answered
// like backend/endpoints/saves.py (hash of the zip's contents, 409 for a slot another device saved since)
test('the RomM client against a fake RomM server', async () => {
  const http = require('http');
  const saves = [], syncs = new Map(); let id = 0, clock = 0;
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x'), q = Object.fromEntries(url.searchParams), body = [];
    for await (const c of req) body.push(c);
    const buf = Buffer.concat(body), send = (code, o) => { res.writeHead(code, { 'Content-Type': o instanceof Buffer ? 'application/octet-stream' : 'application/json' }); res.end(o instanceof Buffer ? o : JSON.stringify(o)); };
    if (req.headers.authorization !== 'Bearer t') return send(403, {});
    if (req.method === 'GET' && url.pathname === '/api/saves') return send(200, saves.filter((s) => (!q.rom_id || s.rom_id === Number(q.rom_id)) && (!q.slot || s.slot === q.slot)).map(({ bytes, ...s }) => s));
    if (req.method === 'POST' && url.pathname === '/api/saves') {
      const form = await new Request('http://x', { method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body: buf }).formData();
      const file = Buffer.from(await form.get('saveFile').arrayBuffer());
      const latest = saves.filter((s) => s.rom_id === Number(q.rom_id) && s.slot === q.slot).sort((a, b) => b.updated_at - a.updated_at)[0];
      if (latest && q.overwrite !== 'true' && (syncs.get(q.device_id + ':' + latest.id) || 0) < latest.updated_at) return send(409, { detail: 'Slot has a newer save since your last sync' });
      const s = { id: ++id, rom_id: Number(q.rom_id), slot: q.slot, emulator: q.emulator, file_name: form.get('saveFile').name, content_hash: SS.hashArchive(SS.unzip(file)), updated_at: ++clock, bytes: file };
      saves.push(s); syncs.set(q.device_id + ':' + s.id, s.updated_at);
      const { bytes, ...out } = s; return send(200, out);
    }
    const m = /^\/api\/saves\/(\d+)\/(content|downloaded)$/.exec(url.pathname);
    if (m && m[2] === 'content') { const s = saves.find((x) => x.id === Number(m[1])); syncs.set(q.device_id + ':' + s.id, s.updated_at); return send(200, s.bytes); }
    if (m && m[2] === 'downloaded') return send(200, {});
    send(404, {});
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const base = async () => `http://127.0.0.1:${srv.address().port}`;
  try {
    const A = device('AAAA1111'), B = device('BBBB2222', { empty: true }), bk = tmp();
    const ra = SS.rommRpc({ base, headers: () => ({ Authorization: 'Bearer t' }), devId: 'devA' });
    const rb = SS.rommRpc({ base, headers: () => ({ Authorization: 'Bearer t' }), devId: 'devB' });
    const la = ledger(), lb = ledger();
    const u = SS.units({ home: A, games: GAMES }).find((x) => x.key === 'switch:' + SWITCH_ID);
    assert.strictEqual((await SS.syncUnit(u, ra, la, { home: A, backupsRoot: bk, procs: [] })).result, 'up');
    assert.strictEqual(saves[0].file_name, SWITCH_ID + '.zip');
    assert.strictEqual(saves[0].content_hash, SS.hashUnit(u)); // RomM's hash of what was sent = Cartridge's
    const rem = SS.remoteOnly(saves, new Set())[0];
    assert.strictEqual((await SS.syncUnit(rem, rb, lb, { home: B, backupsRoot: bk, procs: [] })).result, 'down');
    // B changes it; A changed it too without syncing: RomM's 409 comes back as a conflict, nothing overwritten
    put(B, `.local/share/eden/nand/user/save/0000000000000000/BBBB2222/${SWITCH_ID}/save.bin`, 'zelda B');
    const ub = SS.units({ home: B, games: GAMES }).find((x) => x.key === 'switch:' + SWITCH_ID);
    assert.strictEqual((await SS.syncUnit(ub, rb, lb, { home: B, backupsRoot: bk, procs: [] })).result, 'up');
    put(A, `.local/share/eden/nand/user/save/0000000000000000/AAAA1111/${SWITCH_ID}/save.bin`, 'zelda A');
    const ua = SS.units({ home: A, games: GAMES }).find((x) => x.key === 'switch:' + SWITCH_ID);
    assert.strictEqual((await SS.syncUnit(ua, ra, { get: () => null, set() {} }, { home: A, backupsRoot: bk, procs: [] })).result, 'conflict');
    // without the ledger's word, RomM itself refuses the upload (409): still a conflict, still nothing lost
    assert.deepStrictEqual(await ra.upload(ua, SS.zip(SS.entriesOf(ua)), 'x.zip', {}), { conflict: true });
    // a wrong sign-in is said plainly
    const bad = SS.rommRpc({ base, headers: () => ({ Authorization: 'Bearer nope' }), devId: 'devA' });
    await assert.rejects(bad.list(1, 'x'), /sign in/i);
  } finally { srv.close(); }
});

// 0.9.56 (owner: "which games didn't match, why, and what's the fix"): every unmatched save says what was read from it
test('an unmatched save says why: a memory card, an ID not in the library, a name, or nothing', () => {
  const SS = require('../electron/saveSync');
  assert.deepStrictEqual(SS.whyUnmatched({ emu: 'pcsx2', keys: {} }, { card: true }), { code: 'card', console: 'ps2' });
  assert.deepStrictEqual(SS.whyUnmatched({ emu: 'rpcs3', keys: { serial: 'blus30443', title: 'Demon’s Souls' } }), { code: 'id', id: 'BLUS30443', title: 'Demon’s Souls', console: 'ps3' });
  assert.deepStrictEqual(SS.whyUnmatched({ emu: 'retroarch', keys: { name: 'Super Metroid (USA)' } }), { code: 'name', name: 'Super Metroid (USA)', console: null });
  assert.deepStrictEqual(SS.whyUnmatched({ emu: 'dolphin', keys: {} }), { code: 'none', console: 'ngc' });
});

// 0.9.58 (owner: Zelda's save found on the Bazzite PC never reached the ROG Ally, both with Eden): saves meet by key and
// console, whatever the emulator is called and whichever RomM entry each device matched the game to
test('two devices meet: different RomM entries for the same game, Eden and Citron, saves from before 0.9.58', async () => {
  const romm = fakeRomm(), bk = tmp(), opts = (home, extra = {}) => ({ home, backupsRoot: bk, procs: [], ...extra });
  const GA = [{ id: 1, name: 'The Legend of Zelda', ids: [SWITCH_ID] }], GB = [{ id: 11, name: 'The Legend of Zelda [Update]', ids: [SWITCH_ID] }];
  // A: Eden, Zelda as RomM entry 1
  const A = tmp(); put(A, `.local/share/eden/nand/user/save/0000000000000000/AAAA/${SWITCH_ID}/save.bin`, 'zelda A');
  const la = ledger();
  const ua = SS.units({ home: A, games: GA }).find((u) => u.key === 'switch:' + SWITCH_ID);
  assert.strictEqual((await SS.syncUnit(ua, romm.rpcFor('A'), la, opts(A))).result, 'up');
  // B: Citron with no Zelda save yet, Zelda as RomM entry 11: it comes down into Citron's own user folder
  const B = tmp(); fs.mkdirSync(path.join(B, '.local/share/citron/nand/user/save/0000000000000000/BBBB'), { recursive: true });
  const lb = ledger();
  const rem = SS.remoteOnly(romm.saves, new Set(SS.units({ home: B, games: GB }).map((u) => u.key)), { home: B });
  assert.strictEqual(rem.length, 1); assert.strictEqual(rem[0].emu, 'citron');
  assert.strictEqual((await SS.syncUnit(rem[0], romm.rpcFor('B'), lb, opts(B, { remotes: romm.saves }))).result, 'down');
  assert.strictEqual(fs.readFileSync(path.join(B, `.local/share/citron/nand/user/save/0000000000000000/BBBB/${SWITCH_ID}/save.bin`), 'utf8'), 'zelda A');
  // B plays: its upload goes into entry 1 (where the save already is), and A brings it down
  put(B, `.local/share/citron/nand/user/save/0000000000000000/BBBB/${SWITCH_ID}/save.bin`, 'zelda B');
  const ub = SS.units({ home: B, games: GB }).find((u) => u.key === 'switch:' + SWITCH_ID);
  assert.strictEqual(ub.romId, 11);
  assert.strictEqual((await SS.syncUnit(ub, romm.rpcFor('B'), lb, opts(B, { remotes: romm.saves }))).result, 'up');
  assert.strictEqual(romm.saves[romm.saves.length - 1].rom_id, 1, 'kept with the copy already in RomM');
  assert.strictEqual((await SS.syncUnit(ua, romm.rpcFor('A'), la, opts(A, { remotes: romm.saves }))).result, 'down');
  assert.strictEqual(fs.readFileSync(path.join(A, `.local/share/eden/nand/user/save/0000000000000000/AAAA/${SWITCH_ID}/save.bin`), 'utf8'), 'zelda B');
  // a device that had its own save before ever syncing: a question, never two separate copies
  const C = tmp(); put(C, `.local/share/eden/nand/user/save/0000000000000000/CCCC/${SWITCH_ID}/save.bin`, 'zelda C');
  const uc = SS.units({ home: C, games: GB }).find((u) => u.key === 'switch:' + SWITCH_ID);
  assert.strictEqual((await SS.syncUnit(uc, romm.rpcFor('C'), ledger(), opts(C, { remotes: romm.saves }))).result, 'conflict');
});

test('saves written before 0.9.58 (slot named after the emulator) are still found', async () => {
  const romm = fakeRomm(), bk = tmp();
  const A = tmp(); put(A, `.local/share/eden/nand/user/save/0000000000000000/AAAA/${SWITCH_ID}/save.bin`, 'old zelda');
  const ua = SS.units({ home: A, games: GAMES }).find((u) => u.key === 'switch:' + SWITCH_ID);
  await romm.rpcFor('A').upload({ ...ua, slot: `cartridge:eden:dir:switch:${SWITCH_ID}` }, SS.zip(SS.entriesOf(ua)), 'x.zip', {});
  const B = tmp(); fs.mkdirSync(path.join(B, '.local/share/eden/nand/user/save/0000000000000000/BBBB'), { recursive: true });
  const rem = SS.remoteOnly(romm.saves, new Set(), { home: B });
  assert.strictEqual(rem.length, 1);
  assert.strictEqual(rem[0].slot, `cartridge:switch:dir:switch:${SWITCH_ID}`);
  assert.strictEqual((await SS.syncUnit(rem[0], romm.rpcFor('B'), ledger(), { home: B, backupsRoot: bk, procs: [], remotes: romm.saves })).result, 'down');
  assert.strictEqual(SS.parseSlot('cartridge:eden:dir:switch:X').family, 'switch');
  assert.strictEqual(SS.parseSlot('cartridge:switch:dir:switch:X').family, 'switch');
});

test('a save that can\'t be put in place says why: no emulator, or no user folder yet', async () => {
  const romm = fakeRomm(), bk = tmp();
  const A = tmp(); put(A, `.local/share/eden/nand/user/save/0000000000000000/AAAA/${SWITCH_ID}/save.bin`, 'z');
  const ua = SS.units({ home: A, games: GAMES }).find((u) => u.key === 'switch:' + SWITCH_ID);
  await SS.syncUnit(ua, romm.rpcFor('A'), ledger(), { home: A, backupsRoot: bk, procs: [] });
  const none = tmp();
  const r1 = await SS.syncUnit(SS.remoteOnly(romm.saves, new Set(), { home: none })[0], romm.rpcFor('B'), ledger(), { home: none, backupsRoot: bk, procs: [], remotes: romm.saves });
  assert.deepStrictEqual([r1.result, r1.why], ['unplaced', 'noemu']);
  const fresh = tmp(); fs.mkdirSync(path.join(fresh, '.local/share/eden/nand/user/save'), { recursive: true });
  const r2 = await SS.syncUnit(SS.remoteOnly(romm.saves, new Set(), { home: fresh })[0], romm.rpcFor('B'), ledger(), { home: fresh, backupsRoot: bk, procs: [], remotes: romm.saves });
  assert.deepStrictEqual([r2.result, r2.why], ['unplaced', 'nofolder']);
});
