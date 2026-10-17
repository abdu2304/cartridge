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
  const plats = pl.map(([id, slug, name]) => ({ id, slug, fs_slug: slug, name, display_name: name, rom_count: ROMS.filter((r) => r.platform_id === id).length }));
  return { F, ROMS, plats };
}

function start({ port = 0, games = 120, extra = {} } = {}) {
  const { F, ROMS, plats } = library(games, extra);
  const served = {}, covers = {};
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), p = u.pathname;
    const json = (o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    let m;
    if (p === '/api/heartbeat') return json({ SYSTEM: { VERSION: '4.4.0' }, METADATA_SOURCES: {} });
    if (p === '/api/users/me') return json({ id: 1, username: 'tester' });
    if (p === '/api/platforms') return json(plats);
    if (p === '/api/roms') { const pid = Number(u.searchParams.get('platform_ids')); const items = ROMS.filter((r) => !pid || r.platform_id === pid); return json({ items, total: items.length }); }
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
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({ port: server.address().port, served, roms: ROMS, close: () => new Promise((d) => server.close(d)) })));
}
if (require.main === module) start({ port: Number(process.argv[2] || 8089) }).then((s) => console.log('fake RomM on', s.port));
module.exports = { start };
