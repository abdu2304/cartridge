// Builds electron/chtIndex.json.gz (0.9.71): every cheat file in libretro-database's cht/ folder, by system, so Cartridge
// can match a game to its .cht files without asking GitHub's API (60 asks an hour without an account). Run it now and
// then: node tools/cheats/index.js [a checkout of libretro/libretro-database]. With no checkout it clones one, blobless.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
let dir = process.argv[2];
if (!dir) { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lrdb-')); execFileSync('git', ['clone', '-q', '--depth', '1', '--filter=blob:none', '--no-checkout', 'https://github.com/libretro/libretro-database', dir], { stdio: 'inherit' }); }
const rev = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const out = { rev, systems: {} };
for (const f of execFileSync('git', ['-C', dir, 'ls-tree', '-r', '--name-only', 'HEAD', 'cht/'], { encoding: 'utf8', maxBuffer: 64e6 }).split('\n')) {
  const m = /^cht\/([^/]+)\/(.+)\.cht$/.exec(f);
  if (m) (out.systems[m[1]] ||= []).push(m[2]);
}
const file = path.join(__dirname, '../../electron/chtIndex.json.gz');
fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(out), { level: 9 }));
console.log(`${Object.values(out.systems).flat().length} cheat files in ${Object.keys(out.systems).length} systems, libretro-database ${rev.slice(0, 7)}: ${path.relative(process.cwd(), file)}`);
