// IDs read from a game's own files (0.9.68), with nothing from main's state, so they can be read in a worker
// thread (idWorker.js). Before, the game identity engine read them on Electron's main thread a game at a time; one
// Switch NSP (NCA headers decrypted) or one PS2 CHD (hunks decompressed) could hold it for seconds, and in Game Mode
// Steam dims a window that stops answering (owner: "after about 30 seconds the app dims", then no controller).
// read({ slugs, where, fsName, name, emulationRoot }) gives what main.js gameFileIds gave, less what needs main's own
// records (installed PS3 serials, RPCS3's games.yml), which main adds before and after.
const fs = require('fs');
const path = require('path');
const CS = require('./cide').steam;

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const ls = (p) => { try { return fs.readdirSync(p); } catch { return []; } };

// the game's own file: the biggest one in its folder
function mainFile(where) {
  if (!where) return '';
  try { if (fs.statSync(where).isDirectory()) return fs.readdirSync(where).map((n) => path.join(where, n)).filter((f) => fs.statSync(f).isFile()).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0] || ''; } catch { return ''; }
  return where;
}
// a PS3 game's serial from its name, PARAM.SFO (also one folder down) or the start of its ISO
// (moved here unchanged from steamManager's serialOf, which now calls it)
function ps3SerialOf(rom, p) {
  const tag = String(rom.fs_name || '') + ' ' + String(rom.name || '') + ' ' + path.basename(p || '');
  const named = CS.nameSerial(tag); // "BLUS30443" or "BLUS-30443" in a name
  if (named) return named;
  const sfos = [path.join(p, 'PS3_GAME', 'PARAM.SFO'), path.join(p, 'PARAM.SFO'), path.join(p, 'sce_sys', 'param.sfo')];
  if (isDir(p)) for (const n of ls(p)) if (isDir(path.join(p, n))) sfos.push(path.join(p, n, 'PS3_GAME', 'PARAM.SFO'), path.join(p, n, 'sce_sys', 'param.sfo'));
  for (const f of sfos) {
    try { const s = CS.anySerial(fs.readFileSync(f).toString('latin1')); if (s) return s; } catch {}
  }
  if (isDir(p)) { const iso = ls(p).find((n) => /\.iso$/i.test(n)); if (iso) p = path.join(p, iso); }
  try {
    const fd = fs.openSync(p, 'r'); const b = Buffer.alloc(1024 * 1024);
    fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd);
    const s = CS.ps3Disc(b.toString('latin1')); // NPUA, NPEB and the rest too (0.9.15)
    if (s) return s;
  } catch {}
  return null;
}
// a PS3 game's serial from its files (main.js ps3Serial checks its install records first and RPCS3's games.yml after)
function ps3FileSerial(rom, where) {
  const P = require('./patches');
  for (const f of [path.join(where || '', 'PS3_GAME', 'PARAM.SFO'), path.join(where || '', 'PARAM.SFO')]) { const s = P.sfoAt(f).TITLE_ID; if (s) return s; }
  try { const s = ps3SerialOf(rom || {}, where || ''); if (s) return s; } catch {}
  const files = (() => { try { return fs.statSync(where).isDirectory() ? fs.readdirSync(where).map((n) => path.join(where, n)) : [where]; } catch { return []; } })();
  for (const f of files.filter((x) => /\.(iso|chd)$/i.test(x))) { const b = P.isoFile(f, ['PS3_GAME', 'PARAM.SFO']); const id = b && P.parseSfo(b).TITLE_ID; if (id) return id; }
  for (const f of files.filter((x) => /\.pkg$/i.test(x))) { const i = require('./pkgInstall').pkgInfo(f); if (i?.titleId && /^[A-Z]{4}\d{5}$/.test(i.titleId)) return i.titleId; }
  const deep = (d, n) => { for (const e of (() => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } })()) {
    if (!e.isDirectory()) continue;
    const p = path.join(d, e.name), s = P.sfoAt(path.join(p, 'PS3_GAME', 'PARAM.SFO')).TITLE_ID;
    if (s) return s;
    if (n > 1) { const r = deep(p, n - 1); if (r) return r; }
  } return null; };
  return where ? deep(where, 2) : null;
}
// a PSP game's ID (ULUS10041): from its ISO's PARAM.SFO or its EBOOT.PBP, else its names
function pspSerial(rom, file) {
  const P = require('./patches');
  let id = /\.(iso|cso|zso|chd)$/i.test(file) ? (() => { const b = P.isoFile(file, ['PSP_GAME', 'PARAM.SFO']); return b ? P.parseSfo(b).DISC_ID : null; })() : /\.pbp$/i.test(file) ? require('./discImage').pbpDiscId(file) : null;
  return id || (`${rom?.fs_name || ''} ${rom?.name || ''} ${path.basename(file)}`.match(/\b([A-Z]{4})-?(\d{5})\b/) || []).slice(1).join('') || null;
}
function read({ slugs = '', where, fsName = '', name = '', emulationRoot = '', kind }) {
  if (kind === 'ps3serial') return [ps3SerialOf({ fs_name: fsName, name }, where)]; // Steam matching's serial (steamManager gameSerial)
  const file = mainFile(where), A = require('./addons'), rom = { fs_name: fsName, name };
  if (/\bswitch\b/i.test(slugs) && file) { A.setKeyRoots([emulationRoot].filter(Boolean)); return [A.switchTitleId(file)]; }
  if (/\bps4\b/i.test(slugs)) return require('./gameId').ps4Ids(where);
  if (/ps3/i.test(slugs)) return [ps3FileSerial(rom, where)];
  if (/\bpsx\b/i.test(slugs) && file) return [A.psxSerial(file)];
  if (/\bpsp\b/i.test(slugs) && file) return [pspSerial(rom, file)];
  if (/\bps2\b/i.test(slugs) && /\.(iso|chd|cso|zso)$/i.test(file)) return [require('./patches').ps2IsoInfo(file)?.serial];
  if (/\b(ngc|gc|gamecube|wii)\b/i.test(slugs) && /\.(iso|gcm|rvz|wia|wbfs|ciso|gcz)$/i.test(file)) return [require('./cheats').gcWiiId(file)];
  if (/\b(3ds|n3ds)\b/i.test(slugs) && /\.(3ds|cci|cia|cxi)$/i.test(file)) return [A.n3dsTitleId(file)];
  return [];
}

// one worker for every read, started on first use and ended after a minute with nothing to do; reads go in order.
// If a worker can't start or dies, the read is done here (the old way) so nothing is lost.
function createReader({ log, idleMs = 60000 } = {}) {
  let w = null, n = 0, idleT = null, broken = false;
  const waiting = new Map();
  const here = (job) => { try { return Promise.resolve(read(job)); } catch (e) { return Promise.reject(e); } };
  const stop = () => { const x = w; w = null; try { x?.terminate(); } catch {} };
  const fail = (why) => { log?.('id reader worker', why); broken = true; stop(); for (const [, p] of waiting) here(p.job).then(p.ok, p.no); waiting.clear(); };
  function start() {
    w = new (require('worker_threads').Worker)(path.join(__dirname, 'idWorker.js'));
    w.unref?.();
    w.on('message', (m) => { const p = waiting.get(m.n); if (!p) return; waiting.delete(m.n); m.error ? p.no(new Error(m.error)) : p.ok(m.ids); idle(); });
    w.on('error', (e) => fail(e.message));
    w.on('exit', (c) => { if (w && waiting.size) fail('ended (' + c + ')'); w = null; });
  }
  const idle = () => { clearTimeout(idleT); if (!waiting.size) { idleT = setTimeout(stop, idleMs); idleT.unref?.(); } };
  function readIds(job) {
    if (broken) return here(job);
    clearTimeout(idleT);
    try { if (!w) start(); } catch (e) { fail(e.message); return here(job); }
    const id = ++n;
    return new Promise((ok, no) => { waiting.set(id, { ok, no, job }); w.postMessage({ n: id, job }); });
  }
  return { readIds, stop };
}

module.exports = { read, mainFile, ps3SerialOf, ps3FileSerial, pspSerial, createReader };
