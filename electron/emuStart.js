// Does an emulator really start? (0.9.49, owner: "Vita3K genuinely doesn't open, nothing happens").
// Before, Cartridge only asked ldd whether a program's libraries were there. That misses a program whose libraries are
// there but too old or too new: EmuDeck's Vita3K is the Qt 6 build from Vita3K's Linux zip, and on Bazzite (KDE ships
// Qt 6) every library resolves, then the program dies on a missing Qt symbol version before any window. The same for a
// build made for a newer glibc than the system has, a broken download, or a setting the emulator can't read.
// So an emulator that can say so is run once, without a window, and asked for its version. Vita3K (main.cpp,
// config/src/config.cpp): QApplication, init_paths and init_config all run before --version is answered, so a library,
// Qt platform, path or config.yml problem shows here exactly as it would on a real start, and no window opens.
// Results are kept per file version (path, size, time), so a copy is checked once until it changes.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const CHECKS = {
  // its AppImage carries only Qt's xcb plugin (no offscreen), and --version opens no window, so the real display is
  // tried first; offscreen is for a copy that has it, when there's no display at all
  vita3k: { args: ['--version'], ok: /vita3k/i, envs: [{}, { QT_QPA_PLATFORM: 'offscreen' }] },
};
const has = (id) => !!CHECKS[String(id || '').split('@')[0]];

function plainEnv(extra = {}) {
  const env = { ...process.env };
  for (const k of ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'APPDIR', 'APPIMAGE', 'ARGV0', 'OWD', 'QT_PLUGIN_PATH', 'QT_QPA_PLATFORM_PLUGIN_PATH']) delete env[k];
  // 0.9.91 (PC playtest: "Allow Vita3K.AppImage to check for updates?" in a kdialog after the check): AppImages made
  // with pkgforge's tools (Vita3K's since October 2026) carry a self-updater hook that asks from the second start on, in
  // the background; Cartridge updates emulators itself, and DISABLE_AUTO_UPDATES is the hook's own switch
  return { ...env, DISABLE_AUTO_UPDATES: '1', ...extra };
}

// what went wrong, in a few plain words, from what the program printed
function reasonOf(text, code, signal) {
  const t = String(text || '');
  let m;
  if ((m = /error while loading shared libraries: ([^:\s]+)/.exec(t))) return `${m[1]} is missing on this system`;
  if ((m = /version [`']?(GLIBC_[\d.]+)[`']? not found/.exec(t))) return `it needs ${m[1].replace('_', ' ')}, newer than this system has`;
  if ((m = /version [`']?(Qt_[\d.]+(?:_PRIVATE_API)?)[`']? not found/.exec(t))) return `it needs ${m[1].replace(/_/g, ' ').replace(' PRIVATE API', '')} from the system, which has another version`;
  if ((m = /version [`']?([\w.]+)[`']? not found \(required by ([^)]+)\)/.exec(t))) return `${path.basename(m[2])} needs ${m[1]}, which this system doesn't have`;
  if (/Could not (?:load|find) the Qt platform plugin/i.test(t)) return 'its Qt display plugin couldn’t load';
  if (/fuse|libfuse/i.test(t) && /AppImage/i.test(t)) return 'AppImages can’t run here (FUSE 2 is missing)';
  if (/Permission denied/i.test(t)) return 'it isn’t allowed to run (its file isn’t executable, or its drive doesn’t allow programs)';
  if ((m = /filesystem error: ([^\n]+)/i.exec(t))) return `a folder it uses is broken: ${m[1].slice(0, 140)}`;
  if ((m = /Config file can't be loaded: ([^\n]+)/i.exec(t))) return `its settings file can’t be read: ${m[1].slice(0, 120)}`;
  if (signal) return `it crashed (${signal})`;
  const last = t.split('\n').map((l) => l.replace(/^\s*\[[^\]]*\]\s*(\|\w\|\s*)?(\[[^\]]*\]:\s*)?/, '').trim()).filter(Boolean).pop();
  return last ? last.slice(0, 160) : `it closed straight away (code ${code})`;
}

const memo = new Map();
const keyOf = (file) => { try { const st = fs.statSync(file); return `${fs.realpathSync(file)}:${st.size}:${Math.round(st.mtimeMs)}`; } catch { return null; } };

// { ok, reason, version } or null when this emulator can't be asked (or the file isn't a program Cartridge can run)
function check(id, file, { timeout = 30000 } = {}) {
  const c = CHECKS[String(id || '').split('@')[0]];
  if (!c || !file || /\.(sh|exe)$/i.test(file)) return Promise.resolve(null);
  const key = keyOf(file);
  if (!key) return Promise.resolve(null);
  if (memo.has(key)) return Promise.resolve(memo.get(key));
  const display = !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  const envs = (c.envs || [{}]).filter((x) => display || x.QT_QPA_PLATFORM);
  const once = (extra) => new Promise((resolve) => {
    execFile(file, c.args, { cwd: path.dirname(file), env: plainEnv(extra), timeout, maxBuffer: 4 << 20 }, (e, out, err) => {
      const text = `${out || ''}\n${err || ''}`;
      const ok = !e && c.ok.test(String(out || ''));
      resolve(ok
        ? { ok: true, version: (String(out).match(/v?(\d+\.\d+[\w.\-]*(?:\s+\d{3,})?)/) || [])[1] || null }
        : { ok: false, platform: /Qt platform plugin/i.test(text), reason: e?.killed ? 'it didn’t answer within 30 seconds' : e?.code === 'EACCES' ? reasonOf('Permission denied') : e?.code === 'ENOENT' ? 'the file isn’t there' : reasonOf(text, e?.code, e?.signal), detail: text.trim().split('\n').slice(-12).join('\n') });
    });
  });
  return (async () => {
    let r = null;
    for (const x of envs.length ? envs : [{}]) { r = await once(x); if (r.ok || !r.platform) break; } // only a missing Qt display plugin is worth another way
    if (!display && r.platform) return null; // no screen to start on: can't tell, never called broken
    delete r.platform;
    memo.set(key, r);
    return r;
  })();
}
// the last answer for this file, without running anything (null: never checked or can't be)
const cached = (id, file) => (has(id) && file ? memo.get(keyOf(file)) || null : null);
const forget = (file) => { for (const k of [...memo.keys()]) if (k.startsWith((() => { try { return fs.realpathSync(file); } catch { return file; } })() + ':')) memo.delete(k); };

// An EmuDeck launcher runs the real program (vita3k.sh runs ~/Applications/Vita3K/Vita3K): that program is what to check.
function scriptProgram(script, home = require('os').homedir()) {
  let t = ''; try { t = fs.readFileSync(script, 'utf8'); } catch { return null; }
  const h = (x) => x.replace(/\$\{?HOME\}?|^~(?=\/)/g, home);
  const folder = (/^\s*emufolder=["']?([^"'\n]+)["']?/m.exec(t) || [])[1];
  const cands = [...t.matchAll(/["']?((?:\$\{?HOME\}?|~|\/)[^"'\s;|&]*?\/[^"'\s;|&]+)["']?/g)].map((m) => h(m[1])).filter((x) => !/[*$]/.test(x) && !/\.(sh|log|ini|yml|cfg)$/i.test(x));
  if (folder && !folder.includes('$(')) for (const n of ['Vita3K', 'Vita3K.AppImage']) cands.push(path.join(h(folder), n));
  return cands.find((x) => { try { const st = fs.statSync(x); return st.isFile() && (st.mode & 0o111); } catch { return false; } }) || null;
}

// After a download is in place at `file` (still its temporary name): it must start, else the emulator's known older
// build goes in instead (rel.fallback), else nothing is put in place and the reason is said.
async function ensureStarts(id, file, rel, download, kept = 'nothing was changed') {
  if (!has(id)) return rel;
  try { fs.chmodSync(file, 0o755); } catch {}
  const r = await check(id, file);
  if (!r || r.ok) return rel;
  const fb = rel?.fallback || require('./emuUpdates').REPOS[id]?.fallback;
  if (fb && !rel.fellBack) {
    fs.rmSync(file, { force: true });
    await download(fb.url, file);
    try { fs.chmodSync(file, 0o755); } catch {}
    const r2 = await check(id, file);
    if (!r2 || r2.ok) return Object.assign(rel, { version: fb.version, fellBack: { reason: r.reason } });
    fs.rmSync(file, { force: true });
    throw new Error(`Neither the newest build nor build ${fb.version.replace(/^build\s*/, '')} starts on this system (${r2.reason}), so ${kept}.`);
  }
  fs.rmSync(file, { force: true });
  throw new Error(`The download doesn’t start on this system (${r.reason}), so ${kept}.`);
}

module.exports = { CHECKS, has, check, cached, forget, reasonOf, scriptProgram, ensureStarts, plainEnv };
