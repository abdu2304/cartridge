// A fake RomM for the end-to-end run (0.9.71, test/e2e/run.js): enough of RomM's API for Cartridge to sign in, sync a
// library, show covers and download games with checksums. Grown from the session scratch mocks used since 0.6.1.
// Usage: node test/e2e/mockRomm.js [port] (or require it: start({ port, games }) -> { port, close, served }).
const http = require('http');
const crypto = require('crypto');

const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
// a small BMP cover, different per game
function bmp(w, h, seed) {
  const row = w * 3 + ((4 - (w * 3) % 4) % 4), size = 54 + row * h, b = Buffer.alloc(size);
  b.write('BM'); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14); b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(row * h, 34);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = 54 + y * row + x * 3; b[o] = (x * 2 + seed * 37) & 255; b[o + 1] = (y + seed * 91) & 255; b[o + 2] = ((x ^ y) + seed * 13) & 255; }
  return b;
}
// a zip with its files stored (0.9.74: the unpacking checks), crc32 by table so any Node runs it
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(entries) {
  const parts = [], dir = []; let off = 0;
  for (const [name, data] of entries) {
    const n = Buffer.from(name), c = crc32(data), h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(c, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    parts.push(h, n, data);
    const d = Buffer.alloc(46); d.writeUInt32LE(0x02014b50, 0); d.writeUInt16LE(20, 4); d.writeUInt16LE(20, 6); d.writeUInt32LE(c, 16); d.writeUInt32LE(data.length, 20); d.writeUInt32LE(data.length, 24); d.writeUInt16LE(n.length, 28); d.writeUInt32LE(off, 42);
    dir.push(d, n); off += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(dir), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}
// a PS4 param.sfo with string fields (TITLE_ID, TITLE, APP_VER), as saves.sfo reads it
function sfo(fields) {
  const keys = Object.keys(fields); let kt = Buffer.alloc(0), dt = Buffer.alloc(0); const ents = [];
  for (const k of keys) { const v = Buffer.from(fields[k] + '\0'); ents.push({ ko: kt.length, len: v.length, off: dt.length }); kt = Buffer.concat([kt, Buffer.from(k + '\0')]); dt = Buffer.concat([dt, v]); }
  const h = Buffer.alloc(20); h.writeUInt32BE(0x00505346, 0); h.writeUInt32LE(0x101, 4); const ktOff = 20 + 16 * keys.length; h.writeUInt32LE(ktOff, 8); h.writeUInt32LE(ktOff + kt.length, 12); h.writeUInt32LE(keys.length, 16);
  const idx = Buffer.concat(ents.map((e) => { const b = Buffer.alloc(16); b.writeUInt16LE(e.ko, 0); b.writeUInt16LE(0x0204, 2); b.writeUInt32LE(e.len, 4); b.writeUInt32LE(e.len, 8); b.writeUInt32LE(e.off, 12); return b; }));
  return Buffer.concat([h, idx, kt, dt]);
}
const PLATS = [[1, 'snes', 'Super Nintendo'], [2, 'psx', 'PlayStation'], [3, 'n64', 'Nintendo 64'], [4, 'ps2', 'PlayStation 2']];

function library(games = 120, extra = {}) {
  const F = {}, ROMS = [];
  const file = (id, dir, name, data, opts = {}) => { F[id] = { name, data, ...opts }; const rec = opts.recorded || data; return { id, file_name: name, full_path: `${dir}/${name}`, file_size_bytes: rec.length, md5_hash: md5(rec), sha1_hash: null, crc_hash: null }; };
  const rom = (id, [pid, slug, disp], name, files, multi) => ({ id, name, fs_name: multi ? name : files[0].file_name, fs_name_no_ext: name, platform_id: pid, platform_slug: slug, platform_fs_slug: slug, platform_display_name: disp, fs_size_bytes: files.reduce((s, f) => s + f.file_size_bytes, 0), full_path: `${slug}/${multi ? name : files[0].file_name}`, has_simple_single_file: !multi, has_nested_single_file: false, files, summary: `${name} is a test game.`, regions: ['USA'], genres: ['Action'], created_at: new Date(Date.now() - id * 3600e3).toISOString(), metadatum: {}, merged_screenshots: [], path_cover_small: `/assets/cov/${id}.bmp`, path_cover_large: `/assets/cov/${id}.bmp` });
  // the ones the run downloads: a good file, one whose RomM hash is stale, a two-file disc game
  ROMS.push(rom(1, PLATS[0], 'Good Game', [file(101, 'snes', 'Good Game.sfc', Buffer.alloc(200000, 'a'))]));
  ROMS.push(rom(2, PLATS[0], 'Stale Game', [file(102, 'snes', 'Stale Game.sfc', Buffer.alloc(200000, 'b'), { recorded: Buffer.alloc(200000, 'B') })]));
  ROMS.push(rom(3, PLATS[1], 'Disc Game', [file(103, 'psx/Disc Game', 'Disc Game.cue', Buffer.from('FILE "Disc Game.bin" BINARY\n')), file(104, 'psx/Disc Game', 'Disc Game.bin', Buffer.alloc(300000, 'd'))], true));
  for (let i = 0; i < games; i++) { const p = PLATS[i % PLATS.length]; ROMS.push(rom(1000 + i, p, `Test Game ${i}`, [file(5000 + i, p[1], `Test Game ${i}.bin`, Buffer.alloc(1000, i & 255))])); }
  // extra.ps4: [{ name, id }] PS4 games as RomM keeps them (a zip named with the title ID), for the playtest rig
  const pl = [...PLATS];
  if (extra.ps4?.length) { const P = [5, 'ps4', 'PlayStation 4']; pl.push(P); extra.ps4.forEach((g, i) => ROMS.push(rom(900 + i, P, g.name, [file(9000 + i, 'ps4', `${g.name} [${g.id}].zip`, Buffer.alloc(2000, i))]))); }
  // extra.games: [{ id, plat: [id, slug, name], name, dir, files: [[name, Buffer]] }]: several files = a folder game
  for (const g of extra.games || []) {
    if (!pl.some((x) => x[0] === g.plat[0])) pl.push(g.plat);
    const multi = g.files.length > 1 || !!g.dir;
    ROMS.push(rom(g.id, g.plat, g.name, g.files.map(([n, d], k) => file(g.id * 10 + k, multi ? `${g.plat[1]}/${g.dir || g.name}` : g.plat[1], n, d)), multi));
  }
  const plats = pl.map(([id, slug, name]) => ({ id, slug, fs_slug: slug, name, display_name: name, rom_count: ROMS.filter((r) => r.platform_id === id).length }));
  return { F, ROMS, plats };
}

function start({ port = 0, games = 120, extra = {} } = {}) {
  const { F, ROMS, plats } = library(games, extra);
  const served = {}, covers = {}, cols = [], saves = [], ctl = {}; let savesN = 0;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), p = u.pathname;
    const json = (o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    let m;
    if (p === '/api/heartbeat') return json({ SYSTEM: { VERSION: '4.4.0' }, METADATA_SOURCES: {} });
    // 0.9.79: extra.openapi = the API description an older RomM would give (no description served otherwise)
    if (p === '/openapi.json' && ctl.openapi) return json(ctl.openapi);
    if (p === '/api/users/me') return json({ id: 1, username: 'tester' });
    if (p === '/api/platforms') return json(plats);
    if (p === '/api/roms') { const pid = Number(u.searchParams.get('platform_ids')); const items = ROMS.filter((r) => !pid || r.platform_id === pid); return json({ items, total: items.length }); }
    // saves (0.9.78): RomM's save API as Cartridge Save Sync uses it; uploads kept in memory, same slot and game replaced
    if (p === '/api/saves' && req.method === 'GET') { const rid = u.searchParams.get('rom_id'), slot = u.searchParams.get('slot'); return json(saves.filter((x) => (!rid || x.rom_id === Number(rid)) && (!slot || x.slot === slot)).map(({ data, ...x }) => x)); }
    if (p === '/api/saves' && req.method === 'POST') {
      const chunks = []; req.on('data', (d) => chunks.push(d)); req.on('end', () => {
        const body = Buffer.concat(chunks), ct = req.headers['content-type'] || '', bd = '--' + (/boundary=(.*)$/.exec(ct) || [])[1];
        const start = body.indexOf('\r\n\r\n') + 4, end = body.lastIndexOf('\r\n' + bd);
        const name = (/filename="([^"]*)"/.exec(body.subarray(0, start).toString('latin1')) || [])[1] || 'save.zip';
        const data = body.subarray(start, end), q = u.searchParams, rid = Number(q.get('rom_id')), slot = q.get('slot');
        const old = saves.find((x) => x.rom_id === rid && x.slot === slot);
        if (old && q.get('overwrite') !== 'true' && old.content_hash !== q.get('content_hash')) return json({ detail: 'conflict' }, 409);
        if (old) saves.splice(saves.indexOf(old), 1);
        const sv = { id: 700 + savesN++, rom_id: rid, slot, emulator: q.get('emulator'), file_name: name, file_size_bytes: data.length, content_hash: q.get('content_hash'), updated_at: new Date().toISOString(), created_at: new Date().toISOString(), data };
        saves.push(sv); const { data: _d, ...out } = sv; json(out);
      }); return;
    }
    if ((m = p.match(/^\/api\/saves\/(\d+)\/content$/))) { const sv = saves.find((x) => x.id === Number(m[1])); if (!sv) return json({}, 404); res.writeHead(200, { 'Content-Length': sv.data.length }); return res.end(sv.data); }
    if ((m = p.match(/^\/api\/saves\/(\d+)\/downloaded$/))) return json({ ok: true });
    // collections made and changed (favourites, 0.9.76): kept in memory, answered as RomM does
    if (p === '/api/collections' && req.method === 'POST') { const name = (u.searchParams.get('is_favorite') === 'true' && 'Favourites') || 'Made in Cartridge'; const c = { id: 500 + cols.length, name, description: '', rom_ids: [], is_favorite: u.searchParams.get('is_favorite') === 'true', user_id: 1 }; cols.push(c); return json(c); }
    if ((m = p.match(/^\/api\/collections\/(\d+)$/)) && req.method === 'PUT') { const c = cols.find((x) => x.id === Number(m[1])); let body = ''; req.on('data', (d) => (body += d)); req.on('end', () => { const ids = /name="rom_ids"\r?\n\r?\n(\[[^\]]*\])/.exec(body); if (c && ids) c.rom_ids = JSON.parse(ids[1]); json(c || {}, c ? 200 : 404); }); return; }
    if ((m = p.match(/^\/api\/roms\/(\d+)\/props$/)) && req.method === 'PUT') return json({ status: null, backlogged: false, now_playing: false, hidden: false });
    if (p === '/api/collections' && req.method === 'GET') return json(cols);
    if (/^\/api\/(collections|collections\/smart|collections\/virtual|firmware|saves|states|devices|play-sessions)$/.test(p)) return json([]);
    if ((m = p.match(/^\/assets\/cov\/(\d+)\.bmp$/))) { const b = covers[m[1]] ||= bmp(120, 160, Number(m[1])); res.writeHead(200, { 'content-type': 'image/bmp', 'content-length': b.length }); return res.end(b); }
    if ((m = p.match(/^\/api\/roms\/(\d+)\/notes/))) return json([]);
    if ((m = p.match(/^\/api\/roms\/(\d+)\/files\/content\//))) {
      // Cartridge asks by file id (/api/roms/<file id>/files/content/<name>), as RomM 4 serves it
      const f = F[m[1]]; if (!f) return json({}, 404);
      served[m[1]] = (served[m[1]] || 0) + 1;
      res.writeHead(200, { 'Content-Length': f.data.length }); return res.end(f.data);
    }
    if ((m = p.match(/^\/api\/roms\/(\d+)$/))) { const r = ROMS.find((x) => x.id === Number(m[1])); return r ? json(r) : json({}, 404); }
    json({ detail: 'not found' }, 404);
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({ port: server.address().port, served, saves, ctl, roms: ROMS, close: () => new Promise((d) => server.close(d)) })));
}
if (require.main === module) start({ port: Number(process.argv[2] || 8089) }).then((s) => console.log('fake RomM on', s.port));
module.exports = { start, zip, sfo };
