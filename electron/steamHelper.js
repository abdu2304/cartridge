// Cartridge's Steam helper. Runs as its own process (Node mode of the Cartridge binary) so it
// keeps going when Steam closes, which in Game Mode also closes Cartridge.
//   1. asks Steam to close and waits for it
//   2. writes the prepared shortcuts, compatibility tools and collections (with backups)
//   3. starts Steam again (Game Mode restarts it by itself)
// Usage: steamHelper.js <job.json>. Progress and the result go to <job>.status.json and a log.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const jobFile = process.argv[2];
const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
const statusFile = jobFile.replace(/\.json$/, '') + '.status.json';
const logFile = job.logFile || jobFile.replace(/\.json$/, '') + '.log';
const log = (...a) => { try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${a.join(' ')}\n`); } catch {} };
const status = (o) => { try { fs.writeFileSync(statusFile, JSON.stringify({ ...o, at: Date.now(), job: job.id })); } catch {} };

// ---------- binary VDF (same format as Cartridge's own reader/writer)
function parseVdf(buf) {
  let i = 0;
  const cstr = () => { const e = buf.indexOf(0, i); const s = buf.toString('utf8', i, e); i = e + 1; return s; };
  const map = () => {
    const obj = {};
    for (;;) {
      const t = buf[i++];
      if (t === 0x08 || t === undefined) return obj;
      const k = cstr();
      if (t === 0x00) obj[k] = map();
      else if (t === 0x01) obj[k] = cstr();
      else if (t === 0x02) { obj[k] = buf.readUInt32LE(i); i += 4; }
      else if (t === 0x07) { obj[k] = buf.readBigUInt64LE(i); i += 8; }
      else throw new Error('Unknown VDF type ' + t);
    }
  };
  return map();
}
function writeVdf(obj) {
  const parts = [];
  const str = (s) => parts.push(Buffer.from(String(s) + '\0', 'utf8'));
  const walk = (o) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && typeof v !== 'bigint') { parts.push(Buffer.from([0x00])); str(k); walk(v); parts.push(Buffer.from([0x08])); }
      else if (typeof v === 'number') { parts.push(Buffer.from([0x02])); str(k); const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); parts.push(b); }
      else if (typeof v === 'bigint') { parts.push(Buffer.from([0x07])); str(k); const b = Buffer.alloc(8); b.writeBigUInt64LE(v); parts.push(b); }
      else { parts.push(Buffer.from([0x01])); str(k); str(v ?? ''); }
    }
  };
  walk(obj);
  parts.push(Buffer.from([0x08]));
  return Buffer.concat(parts);
}
const deserialize = (o) => JSON.parse(JSON.stringify(o), (k, v) => (v && typeof v === 'object' && v.__big !== undefined ? BigInt(v.__big) : v));

// ---------- Steam process
// 0.9.88: only this user's Steam for this home counts (as steamArt.oursSteam; this file runs on its own, so it's
// repeated here): another user's Steam never closes for us. HOME inside ours still counts (Snap); unsure = ours.
function oursSteam(pid) {
  try { if (typeof process.getuid === 'function' && fs.statSync(`/proc/${pid}`).uid !== process.getuid()) return false; } catch {}
  let home = null; try { home = /(?:^|\0)HOME=([^\0]*)/.exec(fs.readFileSync(`/proc/${pid}/environ`, 'utf8'))?.[1] || null; } catch {}
  if (!home) return true;
  const real = (p) => { const rest = []; let d = path.resolve(p); for (;;) { try { return path.join(fs.realpathSync(d), ...rest); } catch { const up = path.dirname(d); if (up === d) return path.resolve(p); rest.unshift(path.basename(d)); d = up; } } };
  const mine = real(require('os').homedir()), its = real(home);
  return its === mine || its.startsWith(mine + path.sep);
}
function steamRunning() {
  const me = String(process.pid);
  try {
    for (const pid of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(pid) || pid === me) continue;
      let comm = '';
      try { comm = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim(); } catch { continue; }
      if ((comm === 'steam' || comm === 'steamwebhelper') && oursSteam(pid)) return true;
      try { const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')[0]; if (/(ubuntu12_32|ubuntu12_64)\/steam(webhelper)?$|\/steam\.sh$/.test(cmd) && oursSteam(pid)) return true; } catch {}
    }
  } catch {}
  return false;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function closeSteam() {
  if (!steamRunning()) return true;
  log('asking Steam to close');
  const tries = job.flatpakSteam ? [['flatpak', ['run', 'com.valvesoftware.Steam', '-shutdown']]] : [];
  tries.push(['steam', ['-shutdown']]);
  for (const [cmd, args] of tries) { try { spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref(); } catch {} }
  // Game Mode starts Steam again the moment it exits, so look often and write straight away:
  // the new Steam reads shortcuts.vdf a few seconds after it starts
  const gm = !!job.gamescope, step = gm ? 100 : 500;
  for (let i = 0; i < 45000 / step; i++) { await sleep(step); if (!steamRunning()) { if (!gm) await sleep(1500); return true; } }
  log('Steam did not close in 45 s');
  return false;
}
function startSteam() {
  if (steamRunning()) return;
  log('starting Steam');
  try {
    if (job.flatpakSteam) spawn('flatpak', ['run', 'com.valvesoftware.Steam'], { detached: true, stdio: 'ignore' }).unref();
    else spawn('steam', [], { detached: true, stdio: 'ignore' }).unref();
  } catch (e) { log('could not start Steam', e.message); }
}

// ---------- writes
function backup(file) {
  if (!fs.existsSync(file)) return null;
  const dir = job.backupDir;
  fs.mkdirSync(dir, { recursive: true });
  const b = path.join(dir, `${path.basename(file)}.${job.stamp}`);
  // never replace a backup: a second run of the same job would save the already-changed file over it
  if (fs.existsSync(b)) return b;
  fs.copyFileSync(file, b);
  return b;
}
function writeShortcuts() {
  const f = job.shortcutsFile;
  let data = { shortcuts: {} };
  if (fs.existsSync(f)) data = parseVdf(fs.readFileSync(f));
  const list = data.shortcuts || data.Shortcuts || (data.shortcuts = {});
  const entries = Object.values(list);
  const remove = new Set((job.remove || []).map((x) => x >>> 0));
  let kept = entries.filter((e) => !remove.has((e.appid ?? e.AppID ?? 0) >>> 0));
  for (const add of job.add || []) {
    const e = deserialize(add.entry);
    const id = e.appid >>> 0;
    const at = kept.findIndex((x) => ((x.appid ?? 0) >>> 0) === id);
    if (at >= 0) kept[at] = { ...kept[at], ...e }; else kept.push(e);
  }
  const out = {};
  kept.forEach((e, i) => { out[String(i)] = e; });
  const key = data.Shortcuts && !data.shortcuts ? 'Shortcuts' : 'shortcuts';
  const buf = writeVdf({ [key]: out });
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', buf);
  fs.renameSync(f + '.tmp', f);
  // read it back to be sure it parses
  const check = parseVdf(fs.readFileSync(f));
  const n = Object.keys(check[key] || {}).length;
  if (n !== kept.length) throw new Error(`shortcuts check failed (${n} vs ${kept.length})`);
  log('shortcuts written', kept.length, 'entries,', (job.add || []).length, 'added/updated,', remove.size, 'removed');
}
// Windows-only emulators need Proton: Steam keeps that choice in config/config.vdf (text VDF)
function writeCompat() {
  const list = (job.add || []).filter((a) => a.proton);
  if (!list.length || !job.configFile || !fs.existsSync(job.configFile)) return;
  let t = fs.readFileSync(job.configFile, 'utf8');
  const blockStart = t.search(/"CompatToolMapping"\s*\{/);
  if (blockStart < 0) { log('config.vdf has no CompatToolMapping block, skipping Proton'); return; }
  const open = t.indexOf('{', blockStart) + 1;
  let add = '';
  for (const a of list) {
    const id = String(a.entry.appid >>> 0);
    if (new RegExp(`"${id}"\\s*\\{`).test(t)) continue;
    add += `\n\t\t\t\t\t"${id}"\n\t\t\t\t\t{\n\t\t\t\t\t\t"name"\t\t"${a.proton}"\n\t\t\t\t\t\t"config"\t\t""\n\t\t\t\t\t\t"priority"\t\t"250"\n\t\t\t\t\t}`;
  }
  if (!add) return;
  t = t.slice(0, open) + add + t.slice(open);
  fs.writeFileSync(job.configFile, t);
  log('Proton set for', list.length, 'shortcut(s)');
}
// Collections live in Steam's cloud storage file: [[key, {key, timestamp, value, version, ...}], ...]
function writeCollections() {
  const want = job.collections || {}; // name -> [appids]
  const rename = job.rename || {}; // collection id -> new name (0.9.24: Cartridge's console names)
  if ((!Object.keys(want).length && !Object.keys(rename).length) || !job.cloudFile) return;
  let arr = [];
  if (fs.existsSync(job.cloudFile)) arr = JSON.parse(fs.readFileSync(job.cloudFile, 'utf8'));
  // 0.9.34: Steam keeps local changes not yet in its cloud in <file>.modified.json, and they win when Steam loads.
  // A collection deleted there counts as deleted here; one changed there gets the same change, or ours would be lost.
  const modFile = job.cloudFile.replace(/\.json$/, '.modified.json');
  let mod = null; try { mod = JSON.parse(fs.readFileSync(modFile, 'utf8')); } catch {}
  const modRow = (k) => (Array.isArray(mod) ? mod.find(([mk]) => mk === k) : null);
  const gone = (k) => !!modRow(k)?.[1]?.is_deleted;
  arr = arr.map((r) => { const m = modRow(r[0]); return m && !m[1].is_deleted && m[1].value ? [r[0], { ...r[1], ...m[1] }] : r; });
  const now = Math.floor(Date.now() / 1000);
  for (const [id, name] of Object.entries(rename)) {
    const row = arr.find(([k, v]) => k === `user-collections.${id}` && !v.is_deleted && !gone(k) && v.value);
    if (!row) continue;
    const v = JSON.parse(row[1].value);
    v.name = name;
    row[1].value = JSON.stringify(v);
    row[1].timestamp = now;
    row[1].version = String((parseInt(row[1].version, 10) || 0) + 1);
  }
  for (const [name, ids] of Object.entries(want)) {
    let row = arr.find(([k, v]) => k.startsWith('user-collections.') && !v.is_deleted && !gone(k) && v.value && (() => { try { return JSON.parse(v.value).name === name; } catch { return false; } })());
    if (!row) {
      const id = 'uc-' + Math.random().toString(36).slice(2, 14);
      row = [`user-collections.${id}`, { key: `user-collections.${id}`, timestamp: now, value: JSON.stringify({ id, name, added: [], removed: [] }), version: '1', conflictResolutionMethod: 'custom', strMethodId: 'union-collections' }];
      arr.push(row);
    }
    const v = JSON.parse(row[1].value);
    v.added = [...new Set([...(v.added || []), ...ids.map((x) => x >>> 0)])];
    v.removed = (v.removed || []).filter((x) => !ids.includes(x >>> 0));
    row[1].value = JSON.stringify(v);
    row[1].timestamp = now;
    row[1].version = String((parseInt(row[1].version, 10) || 0) + 1);
  }
  fs.mkdirSync(path.dirname(job.cloudFile), { recursive: true });
  fs.writeFileSync(job.cloudFile, JSON.stringify(arr));
  if (Array.isArray(mod)) {
    let changed = false;
    for (const r of arr) { const m = modRow(r[0]); if (m && !m[1].is_deleted && m[1].value !== r[1].value) { m[1] = { ...m[1], value: r[1].value, timestamp: r[1].timestamp, version: r[1].version }; changed = true; } }
    if (changed) fs.writeFileSync(modFile, JSON.stringify(mod));
  }
  log('collections written', [...Object.keys(want), ...Object.values(rename)].join(', '));
}

// One run per job. Cartridge starts the helper as a user service and, if that stays silent for 5 s,
// directly as well, so a slow service start could otherwise run the same job twice.
const lockFile = jobFile + '.' + job.stamp + '.lock';
// The lock is kept after the job ends (each job has its own stamp), so a late second copy stops too.
try { fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' }); } catch { log('job', job.id, 'already ran, this copy stops'); process.exit(0); }
try { for (const f of fs.readdirSync(path.dirname(jobFile))) { const p = path.join(path.dirname(jobFile), f); if (f.endsWith('.lock') && Date.now() - fs.statSync(p).mtimeMs > 7 * 864e5) fs.rmSync(p, { force: true }); } } catch {}

(async () => {
  log('=== job', job.id, (job.add || []).length, 'to add,', (job.remove || []).length, 'to remove');
  status({ state: 'closing' });
  const wasRunning = steamRunning();
  try {
    if (!(await closeSteam())) { status({ state: 'error', error: 'Steam did not close. Close it yourself and try again.' }); return; }
    if (job.onlyRestart) { status({ state: 'done', restarted: true }); return; }
    status({ state: 'writing' });
    if (job.restore) {
      // put back an earlier shortcuts file (Undo); the current one is kept as an undo backup
      parseVdf(fs.readFileSync(job.restore)); // must parse before it replaces anything
      backup(job.shortcutsFile);
      fs.copyFileSync(job.restore, job.shortcutsFile + '.tmp');
      fs.renameSync(job.shortcutsFile + '.tmp', job.shortcutsFile);
      fs.renameSync(job.restore, job.restore.replace(/(shortcuts\.vdf\.)/, '$1used-'));
      log('restored', path.basename(job.restore));
      status({ state: 'done', restored: true });
      return;
    }
    for (const f of [job.shortcutsFile, job.cloudFile, job.configFile]) if (f) backup(f);
    writeShortcuts();
    try { writeCompat(); } catch (e) { log('Proton step failed', e.message); }
    try { writeCollections(); } catch (e) { log('collections step failed', e.message); }
    status({ state: 'done', added: (job.add || []).length, removed: (job.remove || []).length });
  } catch (e) {
    log('failed', e.stack || e.message);
    status({ state: 'error', error: e.message });
  } finally {
    if (job.restart !== false && (wasRunning || job.onlyRestart)) {
      // Game Mode brings Steam back by itself; give it a moment, then start it if it didn't
      await sleep(job.gamescope ? 12000 : 1500);
      startSteam();
    }
    log('=== end');
  }
})();
