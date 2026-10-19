'use strict';
// What runs a Windows build outside Steam (0.9.70, Cartridge Verified). 0.9.86: a Proton is started inside the Steam
// runtime its own toolmanifest.vdf asks for (require_tool_appid: Proton 10 sniper 1628350, Proton 11, Experimental and
// Hotfix SteamLinuxRuntime_4 4183110), as Steam starts it; nothing is downloaded and no network is needed. umu-launcher
// only when no Proton has its runtime installed, and then only with a Proton whose runtime umu knows (Bazzite's umu
// 1.2.9 knows sniper and soldier, so Proton 11 failed "Failed to match ... with a container runtime" on every Windows
// port). Else that Proton by itself. Tested in test/recipes.test.js with fake Steam folders.
const fs = require('fs');
const path = require('path');
const os = require('os');

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const kids = (d) => { try { return fs.readdirSync(d); } catch { return []; } };
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
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
// the runtime a Proton asks for; none in the manifest = sniper, as Proton 8 to 10 use
const needs = (dir) => (/"require_tool_appid"\s+"(\d+)"/.exec(read(path.join(dir, 'toolmanifest.vdf'))) || [])[1] || '1628350';
function protons(roots, home) {
  const out = [];
  for (const root of roots) {
    for (const base of [path.join(root, 'steamapps/common'), path.join(root, 'compatibilitytools.d')]) {
      for (const n of kids(base)) if (isFile(path.join(base, n, 'proton'))) out.push({ name: n, dir: path.join(base, n), root });
    }
  }
  for (const n of kids(path.join(home, '.steam/root/compatibilitytools.d'))) { const d = path.join(home, '.steam/root/compatibilitytools.d', n); if (isFile(path.join(d, 'proton'))) out.push({ name: n, dir: d, root: roots[0] || '' }); }
  const seen = new Set();
  return out.filter((p) => { let r = p.dir; try { r = fs.realpathSync(p.dir); } catch {} if (seen.has(r)) return false; seen.add(r); return true; })
    .map((p) => ({ ...p, appid: needs(p.dir) })).sort((a, b) => cmp(rank(a.name), rank(b.name)));
}
// Steam's runtimes by app ID: the library's appmanifest names its folder; the usual names when it doesn't
const RUNTIME_DIRS = { 1628350: 'SteamLinuxRuntime_sniper', 1391110: 'SteamLinuxRuntime_soldier', 4183110: 'SteamLinuxRuntime_4' };
function runtimeDir(roots, appid) {
  for (const root of roots) {
    const name = (/"installdir"\s+"([^"]+)"/.exec(read(path.join(root, 'steamapps', `appmanifest_${appid}.acf`))) || [])[1] || RUNTIME_DIRS[appid];
    const d = name && path.join(root, 'steamapps/common', name);
    if (d && isFile(path.join(d, '_v2-entry-point'))) return d;
  }
  return null;
}
// the runtimes this umu can match a Proton with (umu/__init__.py __runtime_versions__); sniper and soldier when unread
function umuRuntimes(umu, home, system = true) {
  const libs = [path.join(home, '.local/lib'), ...(system ? ['/usr/lib', '/usr/local/lib'] : [])].flatMap((l) => kids(l).filter((n) => /^python3/.test(n)).map((n) => path.join(l, n, 'site-packages/umu/__init__.py')));
  for (const f of [...libs, path.join(path.dirname(umu), '../lib/umu/__init__.py')]) {
    const ids = [...read(f).matchAll(/"(\d{6,8})"/g)].map((m) => m[1]);
    if (ids.length) return new Set(ids);
  }
  return new Set(['1628350', '1391110']);
}
// system: false leaves out /usr (tests on a machine that has umu)
function find({ home = os.homedir(), roots = [], env = process.env, system = true } = {}) {
  const dirs = [...String(env.PATH || '').split(':'), path.join(home, '.local/bin'), ...(system ? ['/usr/bin', '/usr/local/bin'] : [])].filter(Boolean);
  const umu = dirs.map((d) => path.join(d, 'umu-run')).find(isFile) || null;
  const all = protons(roots, home), list = [...all.filter((p) => rank(p.name)[0] > 0), ...all.filter((p) => rank(p.name)[0] === 0)];
  for (const p of list) {
    const runtime = runtimeDir(roots, p.appid);
    if (runtime) return { kind: 'runtime', proton: p.dir, runtime, steam: p.root, name: p.name };
  }
  if (umu) {
    const known = umuRuntimes(umu, home, system), p = list.find((x) => known.has(x.appid));
    return { kind: 'umu', umu, proton: p?.dir || null, name: p?.name || 'UMU-Proton' };
  }
  if (!list.length) return null;
  return { kind: 'proton', proton: list[0].dir, steam: list[0].root, name: list[0].name };
}

module.exports = { find, protons, rank, runtimeDir, umuRuntimes };
