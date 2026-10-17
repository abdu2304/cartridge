'use strict';
// What runs a Windows build outside Steam (0.9.70, Cartridge Verified): umu-launcher when it's installed (Bazzite
// ships it; Heroic and Lutris use it), else the newest Proton Steam has, started inside Steam's own runtime
// (SteamLinuxRuntime_sniper, as Steam starts Proton), else that Proton by itself. Nothing is downloaded here.
// Tested in test/recipes.test.js with fake Steam folders.
const fs = require('fs');
const path = require('path');
const os = require('os');

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const kids = (d) => { try { return fs.readdirSync(d); } catch { return []; } };
// Proton 10.0 before 9.0 before Experimental before a GE build (the newest of each); anything else last
function rank(name) {
  const m = /^Proton (\d+)(?:\.(\d+))?$/i.exec(name);
  if (m) return [3, Number(m[1]), Number(m[2] || 0)];
  if (/^Proton - Experimental$/i.test(name)) return [2, 0, 0];
  const ge = /^GE-Proton(\d+)-(\d+)$/i.exec(name);
  if (ge) return [1, Number(ge[1]), Number(ge[2])];
  return [0, 0, 0];
}
const cmp = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return b[i] - a[i]; return 0; };
function protons(roots, home) {
  const out = [];
  for (const root of roots) {
    for (const base of [path.join(root, 'steamapps/common'), path.join(root, 'compatibilitytools.d')]) {
      for (const n of kids(base)) if (isFile(path.join(base, n, 'proton'))) out.push({ name: n, dir: path.join(base, n), root });
    }
  }
  for (const n of kids(path.join(home, '.steam/root/compatibilitytools.d'))) { const d = path.join(home, '.steam/root/compatibilitytools.d', n); if (isFile(path.join(d, 'proton'))) out.push({ name: n, dir: d, root: roots[0] || '' }); }
  const seen = new Set();
  return out.filter((p) => { let r = p.dir; try { r = fs.realpathSync(p.dir); } catch {} if (seen.has(r)) return false; seen.add(r); return true; }).sort((a, b) => cmp(rank(a.name), rank(b.name)));
}
function find({ home = os.homedir(), roots = [], env = process.env } = {}) {
  const dirs = [...String(env.PATH || '').split(':'), path.join(home, '.local/bin'), '/usr/bin', '/usr/local/bin'].filter(Boolean);
  const umu = dirs.map((d) => path.join(d, 'umu-run')).find(isFile) || null;
  const list = protons(roots, home), best = list.find((p) => rank(p.name)[0] > 0) || list[0] || null;
  if (umu) return { kind: 'umu', umu, proton: best?.dir || null, name: best?.name || 'UMU-Proton' };
  if (!best) return null;
  const sniper = roots.map((r) => path.join(r, 'steamapps/common/SteamLinuxRuntime_sniper')).find((d) => isFile(path.join(d, '_v2-entry-point'))) || null;
  return { kind: sniper ? 'sniper' : 'proton', proton: best.dir, sniper, steam: best.root, name: best.name };
}

module.exports = { find, protons, rank };
