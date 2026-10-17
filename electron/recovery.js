'use strict';
// Recovery (0.9.71): what a launcher does when it can't trust itself.
// 1. Safe start: a marker is written at every start and marked clean once the window has shown the UI for 15 s (or on
//    a normal quit). Two starts in a row that never got there means Cartridge keeps closing on its own, so the next one
//    opens with safe looks (Plain, still background, light effects, Cartridge's own motion) held in memory only;
//    the person chooses to keep them or go back. Nothing is written over their settings.
// 2. Settings backups: config.json is copied to settings-backups/ once a day and before every update installs, ten
//    kept; one can be put back from Settings → Help and About.
// 3. Export and import: settings to a file to move to another device, without sign-in details (passwords, tokens,
//    keys), which stay where they are on import.
// 4. Unexpected closes (renderer or GPU gone, unclean starts) are remembered (last 10) for Report a Problem.
// Pure file work, no Electron; tested in test/recovery.test.js.
const fs = require('fs');
const path = require('path');

const SAFE = { style: 'plain', elements: 'plain', surface: 'solid', bgStyle: 'solid', effects: 'light', motionEngine: 'cae', perfOverlay: false, gameTheme: null };
const KEEP = 10;
const SECRET = /pass(word)?|token|secret|apikey|api_key|key$|sgdbKey|nexusKey|cookie|zrif/i;

function createRecovery({ dir, now = () => Date.now(), version = '' }) {
  const marker = path.join(dir, 'start-marker.json');
  const events = path.join(dir, 'unexpected-closes.json');
  const backups = path.join(dir, 'settings-backups');
  const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
  const write = (f, v) => { try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 1)); fs.renameSync(f + '.tmp', f); } catch {} };

  // at start: was the last start clean? returns { safe, unclean }
  function start() {
    const m = read(marker, null);
    const unclean = m && !m.ok ? (m.unclean || 0) + 1 : 0;
    if (m && !m.ok) note('closed before it finished starting', m.version);
    write(marker, { at: now(), version, ok: false, unclean });
    return { safe: unclean >= 2, unclean };
  }
  // the UI showed and stayed up (or a normal quit)
  function ok() { const m = read(marker, {}); if (m.ok) return; write(marker, { ...m, ok: true, unclean: 0 }); }
  function note(what, v = version) {
    const list = read(events, []);
    list.unshift({ at: now(), what: String(what).slice(0, 120), version: v || version });
    write(events, list.slice(0, KEEP));
  }
  const closes = () => read(events, []);

  // the settings safe start shows, laid over the person's own
  const safeUi = (ui) => ({ ...ui, ...SAFE });

  // ---- backups
  const stamp = (t) => new Date(t).toISOString().slice(0, 19).replace(/[:T]/g, '-');
  function backup(configFile, why = 'daily') {
    if (!fs.existsSync(configFile)) return null;
    const list = backupList();
    if (why === 'daily' && list[0] && now() - list[0].at < 20 * 3600e3) return null; // one a day is plenty
    fs.mkdirSync(backups, { recursive: true });
    const name = `config-${stamp(now())}-${why.replace(/[^a-z]/gi, '')}.json`;
    fs.copyFileSync(configFile, path.join(backups, name));
    for (const old of backupList().slice(KEEP)) fs.rmSync(path.join(backups, old.name), { force: true });
    return name;
  }
  function backupList() {
    let names = [];
    try { names = fs.readdirSync(backups).filter((n) => /^config-.*\.json$/.test(n)); } catch {}
    // the time is in the name (written by this clock), not the file's date
    return names.map((n) => { const m = /^config-(\d{4})-(\d\d)-(\d\d)-(\d\d)-(\d\d)-(\d\d)/.exec(n); const at = m ? Date.UTC(m[1], m[2] - 1, m[3], m[4], m[5], m[6]) : 0; return { name: n, at, why: (/-([a-z]+)\.json$/i.exec(n) || [])[1] || '' }; }).sort((a, b) => b.at - a.at);
  }
  // a backup's settings, checked to be a real config (never a half-written file)
  function backupRead(name) {
    if (!/^config-[\w-]+\.json$/.test(name)) throw new Error('That isn’t one of Cartridge’s backups.');
    const v = read(path.join(backups, name), null);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('That backup can’t be read.');
    return v;
  }

  return { start, ok, note, closes, safeUi, backup, backupList, backupRead, marker, SAFE };
}

// settings without sign-in details, for export
function strip(v, depth = 0) {
  if (depth > 8 || v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => strip(x, depth + 1));
  const out = {};
  for (const [k, x] of Object.entries(v)) if (!SECRET.test(k)) out[k] = strip(x, depth + 1);
  return out;
}
// an imported file laid over the current settings: secrets and this device's own things (drives, paths found here,
// the device id) stay as they are
const LOCAL = ['deviceId', 'romsRoot', 'extraRoots', 'downloadRoot', 'emuDir', 'emulationRoot', 'biosDir', 'rommLocal', 'customEmus', 'saveFolders', 'updateHold', 'updateSwitched', 'configVersion'];
function importInto(current, incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming) || !incoming.cartridgeSettings) throw new Error('That file isn’t a Cartridge settings export.');
  const src = strip(incoming.settings || {});
  for (const k of LOCAL) delete src[k];
  const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a?.[k] && typeof a[k] === 'object' ? merge(a[k], v) : v; return o; };
  return merge(current, src);
}
const exportOf = (config, version) => ({ cartridgeSettings: 1, version, at: new Date().toISOString(), settings: strip(config) });

module.exports = { createRecovery, strip, importInto, exportOf, SAFE, LOCAL };
