'use strict';
// Recomps and Cartridge Verified ports in the main process (0.9.71: moved out of main.js unchanged, the first part of
// splitting it by area). The engine is electron/recomps.js; this is its wiring: the IPC handlers (recomps:*), starting a
// port, its Steam shortcuts, Save Sync units for recomp saves and achievements. main.js passes what it shares in `m`
// (functions, and getters for state that changes), read when used, never copied at start.
const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = function recompsIpc(m) {
  // main.js's functions, called through m so one defined later in main.js is found when used
  const log = (...a) => m.log(...a), broadcast = (...a) => m.broadcast(...a), bgJob = (...a) => m.bgJob(...a), webFetch = (...a) => m.webFetch(...a), isGamescope = (...a) => m.isGamescope(...a), emulationFolders = (...a) => m.emulationFolders(...a), refocus = (...a) => m.refocus(...a), romName = (...a) => m.romName(...a), isDir = (...a) => m.isDir(...a), unpackTo = (...a) => m.unpackTo(...a), toTrash = (...a) => m.toTrash(...a), romIndexMain = (...a) => m.romIndexMain(...a), progRunning = (...a) => m.progRunning(...a), downloadTo = (...a) => m.downloadTo(...a);
  let recompsEng = null;
  // 0.9.67 (agreed plan 7.1 #10): the recomp's own building on its first starts, as a background job with a measured bar:
  // bytes written in its folders, against the finished size when the catalogue knows it; done when its done file appears
  // a Linux recomp started from its own folder, with the arguments given (0.9.68: one place for Open and a one-off
  // setup run; Open used to leave out the catalogue's own arguments, PGR4's GPU options and WiiCompiled's launch-base)
  function startRecomp(id, rec, args) {
    const env = require('./childEnv').clean();
    const runLog = path.join(m.USER_DATA, 'emulator-runs', `recomp-${id}.log`);
    let fd = 'ignore'; try { fs.mkdirSync(path.dirname(runLog), { recursive: true }); fd = fs.openSync(runLog, 'w'); } catch {}
    const extra = (args || '').match(/"[^"]*"|\S+/g)?.map((a) => a.replace(/^"(.*)"$/, '$1')) || [];
    const p = require('child_process').spawn(rec.program, extra, { cwd: path.dirname(rec.program), env, detached: true, stdio: ['ignore', fd, fd] });
    if (typeof fd === 'number') try { fs.closeSync(fd); } catch {}
    return new Promise((ok, bad) => {
      p.once('error', (er) => bad(new Error(er.code === 'EACCES' ? 'It isn’t allowed to run (its file isn’t executable).' : `It didn’t start: ${er.message}`)));
      p.once('spawn', () => { log('recomp opened', id, args ? 'with arguments' : ''); m.childRun(p, 'recomp ' + id); p.unref(); ok({ via: 'direct' }); });
    });
  }
  async function recompSetupWatch(id) {
    const R = recomps(), e = R.byId(id), key = 'recompsetup:' + id;
    if (!e || R.ready(id)) return;
    let started = false;
    const mb = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`);
    try {
      const r = await R.watchSetup(id, { onProgress: (m) => { if (!started) { started = true; bgJob(key, { key, kind: 'Recomp Setup', title: e.name, icon: 'mdiCogOutline', state: 'run', pct: null, text: '', error: '' }); } bgJob(key, { pct: m.pct, text: `${mb(m.got)} written` }); } });
      if (!started) return;
      if (r.done) { bgJob(key, { state: 'done', pct: 100, text: 'Set up' }); broadcast('recomp-ready', { id }); }
      else bgJob(key, { state: 'error', error: r.timeout ? 'Still not set up after 45 minutes. Open it again to carry on.' : `${e.name} closed before it finished setting up. Open it again to carry on.` });
    } catch (er) { log('recomp setup watch', id, er.message); if (started) bgJob(key, { state: 'error', error: er.message }); }
  }
  function recomps() {
    if (recompsEng) return recompsEng;
    const D = require('./detect');
    recompsEng = require('./recomps').createRecomps({
      dataDir: m.USER_DATA, log,
      fetchImpl: webFetch,
      download: async (url, dest, onBytes, signal) => { const it = { abort: new AbortController() }; signal?.addEventListener?.('abort', () => it.abort.abort()); await downloadTo(url, dest, it, onBytes, { plain: true }); },
      unpackTo: (archive, dir) => unpackTo(archive, dir),
      appImageType: (f) => D.appImageType(f), isElf: (f) => D.isElf(f),
      isRunning: (f) => progRunning(f),
      playing: () => !!(m.gameFocus.away || m.runOn),
      trash: (p) => toTrash(p),
      // 0.9.66: the new release of an update started once, for a few seconds, then closed. It fails only when it can't
      // run at all here: missing libraries (127/126, "error while loading shared libraries"), a crash signal, or (once
      // set up) a non-zero exit straight away. Never during a game.
      // argv/env (0.9.71): a Windows build through Proton, the runner's command and its environment
      trialRun: ({ program, args, argv, env: more, cwd, ready }) => new Promise((resolve) => {
        if (m.gameFocus.away || m.runOn) return resolve({ skipped: 'playing' });
        const env = require('./childEnv').clean(more || {});
        const extra = argv || (args || '').match(/"[^"]*"|\S+/g)?.map((a) => a.replace(/^"(.*)"$/, '$1')) || [];
        let out = '', done = false, p;
        // 0.9.90 (PC playtest: inFAMOUS's update said "Close inFAMOUS Second Son first."): the answer waits until the
        // trial has really closed, or the set up right after it found the program still running
        const end = (r) => {
          if (done) return; done = true; clearTimeout(t);
          try { process.kill(-p.pid, 'SIGTERM'); } catch {}
          setTimeout(() => { try { process.kill(-p.pid, 'SIGKILL'); } catch {} }, 1500);
          if (isGamescope()) { broadcast('background', { away: false }); refocus(); }
          log('recomp trial', program, JSON.stringify(r));
          const t0 = Date.now(), gone = () => (!progRunning(program) || Date.now() - t0 > 3000 ? resolve(r) : setTimeout(gone, 150));
          gone();
        };
        try { p = require('child_process').spawn(program, extra, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return resolve({ failed: true, why: e.message }); }
        if (isGamescope()) broadcast('background', { away: true });
        const keep = (b) => { out = (out + b).slice(-4000); };
        p.stdout.on('data', keep); p.stderr.on('data', keep);
        p.once('error', (e) => end({ failed: true, why: e.code === 'EACCES' ? 'It isn’t allowed to run (its file isn’t executable).' : e.message }));
        p.once('exit', (code, sig) => {
          const lib = /error while loading shared libraries: ([^:\s]+)/.exec(out);
          if (lib) return end({ failed: true, why: `It needs ${lib[1]}, which this system doesn’t have.` });
          if (code === 126 || code === 127) return end({ failed: true, why: 'This system can’t run it.' });
          if (/^SIG(SEGV|ABRT|ILL|BUS|FPE)$/.test(sig || '')) return end({ failed: true, why: `It crashed as it started (${sig}).` });
          if (ready && code) return end({ failed: true, why: `It closed straight away (exit ${code}).` });
          end({ ok: true, exited: code });
        });
        const t = setTimeout(() => end({ ok: true, ran: true }), 6000);
      }),
      // a Flatpak bundle installed for this user (flatpak install --bundle); its app ID from the bundle's name
      flatpakBundle: (file) => new Promise((ok, bad) => {
        const appId = path.basename(file).replace(/\.flatpak$/i, '');
        if (!/^[A-Za-z][\w-]*(\.[\w-]+){2,}$/.test(appId)) return bad(new Error('The Flatpak in the release has an unexpected name.'));
        require('child_process').execFile('flatpak', ['install', '--user', '--noninteractive', '-y', '--bundle', file], { timeout: 15 * 60e3, env: { ...process.env, LD_PRELOAD: '', LD_LIBRARY_PATH: '' } }, (er, out, err) => (er ? bad(new Error(`Flatpak couldn’t install it: ${String(err || er.message).trim().split('\n').pop()}`)) : ok(appId)));
      }),
      flatpakRemove: (appId) => new Promise((ok) => require('child_process').execFile('flatpak', ['uninstall', '--user', '--noninteractive', '-y', appId], { timeout: 5 * 60e3 }, () => ok())),
      search: (q2) => require('./github').search(q2),
      recompRoot: () => path.join(emulationFolders()[0] || path.join(os.homedir(), 'Emulation'), 'recomp'),
      recompRoots: () => emulationFolders().map((d) => path.join(d, 'recomp')),
      // Cartridge Verified (0.9.70): newer recipes from the repository, the Proton runner for Windows builds, and the
      // port's own installer or Proton's wineboot run and waited for (off the main thread: spawned, never execSync)
      recipesUrl: 'https://raw.githubusercontent.com/abdu2304/cartridge/main/electron/recipes/index.json',
      runner: () => require('./protonRunner').find({ roots: (() => { try { return m.steamMgr.steamRoots(); } catch { return []; } })() }),
      runProgram: (cmd, args, { cwd, env: extra = {}, timeoutMs = 10 * 60e3, signal } = {}) => new Promise((ok, bad) => {
        const env = require('./childEnv').clean(extra);
        let tail = '';
        const p = require('child_process').spawn(cmd, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
        const keep = (b) => { tail = (tail + b).slice(-3000); };
        p.stdout.on('data', keep); p.stderr.on('data', keep);
        const t = setTimeout(() => { try { process.kill(-p.pid, 'SIGTERM'); } catch {} bad(new Error('It took too long and was stopped.')); }, timeoutMs);
        // stopped from outside (0.9.81: an installer that stopped writing): the whole process group, then the reason
        signal?.addEventListener?.('abort', () => { clearTimeout(t); try { process.kill(-p.pid, 'SIGTERM'); } catch {} setTimeout(() => { try { process.kill(-p.pid, 'SIGKILL'); } catch {} }, 3000); bad(new Error('stopped')); });
        p.once('error', (e) => { clearTimeout(t); bad(new Error(e.code === 'EACCES' ? 'It isn’t allowed to run.' : e.message)); });
        // 0.9.86: a signal is named, and a failure carries the whole tail for the log (the last line alone said little)
        p.once('exit', (code, sig) => { clearTimeout(t); log('verified run', path.basename(cmd), args[0] || '', 'exit', code ?? sig); if (code === 0) return ok(tail); const er = new Error(tail.trim().split('\n').pop() || `It stopped (${code ?? sig}).`); er.tail = tail; bad(er); });
      }),
    });
    return recompsEng;
  }
  // Save Sync's units plus each installed recomp's save folders (0.9.65, owner: "Save Sync covers recomps"): one unit per
  // folder the catalogue names, slot cartridge:recomp:dir:<id>, filed under the game in your library (a recomp whose
  // game isn't in the library has nowhere in RomM to keep its saves, so it shows as not matched)
  function ssUnits(opts) {
    const out = require('./saveSync').units(opts);
    try {
      const R = recomps(), RC = require('./recomps'), roms = libraryRoms();
      for (const e of R.catalogue().entries) {
        const rec = R.record(e.id);
        if (!rec || !(e.saves?.length || e.from === 'verified' || rec.syncSaves?.length)) continue; // 0.9.80: link recomps' ticked folders
        const romIds = RC.matchRoms(e, roms);
        R.saveDirs(e.id).filter((d) => path.resolve(d) !== path.resolve(rec.dir)).forEach((d, i) => {
          const key = i ? `${e.id}-${i}` : e.id;
          // a folder, or one save file (zelda3's saves/zelda3.srm): by what's there, else by the name having an ending
          const kind = isDir(d) ? 'dir' : fs.existsSync(d) || path.extname(d) ? 'file' : 'dir';
          out.push({ key, emu: 'recomp', kind, path: d, base: rec.dir, label: e.name, sub: '', romId: romIds[0] ?? null, romIds, card: false, slot: require('./saveSync').slotOf('recomp', key, kind), prog: rec.flatpak || rec.program, recomp: e.id });
        });
      }
    } catch (er) { log('recomp save units', er.message); }
    return out;
  }
  // 0.9.80: what's running, read without holding the main thread (each /proc/<pid>/cmdline asked in turn)
  async function runningAny(files) {
    const fsp = fs.promises, want = files.flatMap((f) => { let r = f; try { r = fs.realpathSync(f); } catch {} return [...new Set([f, r])]; });
    let pids = []; try { pids = (await fsp.readdir('/proc')).filter((d) => /^\d+$/.test(d)); } catch { return new Set(); }
    const hit = new Set();
    for (let i = 0; i < pids.length; i += 64) {
      const got = await Promise.all(pids.slice(i, i + 64).map((d) => fsp.readFile(`/proc/${d}/cmdline`, 'utf8').catch(() => '')));
      for (const c of got) for (const f of want) if (c && c.includes(f)) hit.add(f);
    }
    return new Set(files.filter((f) => hit.has(f) || [...hit].some((h) => { try { return fs.realpathSync(f) === h; } catch { return false; } })));
  }
  // a recomp that isn't set up yet, started from its Steam shortcut: the setup watch starts as if Open was pressed
  async function watchFromSteam() {
    const R = recomps(), wait = R.pendingSetup();
    if (!wait.length) return 0;
    const on = await runningAny(wait.map((w) => w.program));
    let n = 0;
    for (const w of wait) if (on.has(w.program)) { recompSetupWatch(w.id); n++; }
    return n;
  }
  // installed recomps handed to the trophy reader (0.9.65): the ones that record achievements show in Achievements
  let recompTroSig = '[]';
  function recompTrophies() {
    try {
      const R = recomps(), items = [];
      const RC = require('./recipes');
      // Cartridge Verified ports name their trophy files in the recipe (0.9.71); their templates are filled in here
      const achOf = (e, rec) => { if (!e.recipe) return e.achievements && typeof e.achievements === 'object' ? e.achievements : null; try { const b = RC.chooseBuild(e.recipe, { pick: rec.build, runner: true }); return RC.achievementsOf(e.recipe, b, rec, RC.varsFor(e.recipe, b, rec)); } catch { return null; } };
      for (const e of R.catalogue().entries) { const rec = R.record(e.id); if (rec?.dir) items.push({ id: e.id, name: e.name, game: e.games?.[0]?.title || e.name, program: rec.program, dir: rec.dir, flatpak: rec.flatpak || null, ach: achOf(e, rec) }); }
      require('./trophies').setRecomps(items);
      // 0.9.68: the trophy service started knowing no recomps; it reads every trophy file again (on the main thread)
      // only when the installed recomps changed, not 25 s after every start
      const sig = JSON.stringify(items);
      if (sig === recompTroSig) return;
      recompTroSig = sig;
      m.trophySvc.redetect?.()?.catch?.(() => {});
    } catch (er) { log('recomp achievements', er.message); }
  }
  // the library's games as one list, made once per library (recomp matching indexes it by identity)
  let libRomsMemo = { roms: null, list: [] };
  const libraryRoms = () => { const r = m.library?.roms || null; if (libRomsMemo.roms !== r) libRomsMemo = { roms: r, list: r ? Object.values(r).flat() : [] }; return libRomsMemo.list; };
  let recompRun = null;
  // a recomp's Steam shortcut: its program, its folder as Start In, its arguments; art from the game when it's in the library
  // ---- Cartridge Verified (0.9.70)
  // your copies of a verified game: the library's matching games, on this device or not, with where they are
  // an installed port's Steam shortcut (its first start's for a port with several), or queued (game page More, 0.9.86)
  function steamOf(e) {
    if (!e.installed) return e;
    const sc = portShortcut(e.id, e.starts);
    e.installed.steam = sc ? sc.appid : null; e.installed.steamQueued = !sc && !!m.steamMgr.recompQueued?.(e.id);
    e.installed.oldStarts = oldStartShortcuts(e.id, e.starts).length; // shortcuts per game from before 0.9.89
    return e;
  }
  // 0.9.89 (owner: "it makes 3 shortcuts for each game ... make it just one"): a port with several games (Uncharted's
  // three) has one Steam shortcut, to .cartridge/play.sh, which starts the game picked last in Cartridge (written to
  // .cartridge/start when you press Play), else the first. Before, each game had its own shortcut (<id>:<start>).
  const oldStartShortcuts = (id, starts) => ((starts || []).length > 1 ? starts.map((st) => { try { return m.steamMgr.recompShortcut(`${id}:${st.id}`); } catch { return null; } }).filter(Boolean) : []);
  function portShortcut(id, starts) { try { return m.steamMgr.recompShortcut(id) || oldStartShortcuts(id, starts)[0] || null; } catch { return null; } }
  function launcherOf(rec) {
    if (rec.starts.length < 2) return rec.starts[0].script;
    const dir = path.dirname(rec.starts[0].script), file = path.join(dir, 'play.sh');
    const body = ['#!/bin/sh', '# Cartridge\'s one Steam start for this port: the game picked last in Cartridge (start), else the first', 'd="$(dirname "$0")"', 's="$(cat "$d/start" 2>/dev/null)"', `[ -n "$s" ] && [ -f "$d/play-$s.sh" ] || s=${rec.starts[0].id}`, 'exec /bin/sh "$d/play-$s.sh" "$@"', ''].join('\n');
    let now = ''; try { now = fs.readFileSync(file, 'utf8'); } catch {}
    if (now !== body) fs.writeFileSync(file, body, { mode: 0o755 });
    return file;
  }
  const pickStart = (rec, sid) => { if (rec.starts.length > 1) try { fs.writeFileSync(path.join(path.dirname(rec.starts[0].script), 'start'), String(sid)); } catch (er) { log('port start pick', er.message); } };
  // its frame generation (0.9.89, port More → Steam): only what you picked for this port, never the console default
  const fgKey = (id) => `recomp:${id}`;
  function fgFor(id) {
    const v = (m.config.steam?.frameGen?.games || {})[fgKey(id)];
    if (v !== 'lsfg' && v !== 'mako') return null;
    return require('./frameGen').detect()[v] || null;
  }
  // the shortcut a port has, put right: one per port, the old per-game ones out (owner's three Uncharted shortcuts)
  async function oneShortcut(id) {
    const R = recomps(), rec = R.record(id);
    if (!rec?.starts || rec.starts.length < 2) return false;
    const old = oldStartShortcuts(id, rec.starts);
    if (!old.length) return false;
    if (!m.steamMgr.recompShortcut(id)) m.steamMgr.queueAdd(verifiedShortcutSpecs(id).map((sp) => ({ recomp: sp })));
    m.steamMgr.queueRemove(old.map((x) => x.appid));
    log('port shortcuts made one', id, old.length);
    return true;
  }
  let oneDone = false;
  function oneShortcutsSoon() {
    if (oneDone) return; oneDone = true;
    setTimeout(async () => {
      let any = false;
      for (const e of recomps().list({ roms: [] }).entries) if (e.from === 'verified' && e.installed) try { any = (await oneShortcut(e.id)) || any; } catch (er) { log('port shortcuts', e.id, er.message); }
      if (any) m.steamMgr.applySoon();
    }, 20000);
  }
  function verifiedCopies(id) {
    const R = recomps(), e = R.byId(id);
    if (!e) return [];
    const RS = require('./recomps');
    const lib = RS.matchRoms(e, libraryRoms()).map((rid) => { const where = m.installedMap[rid] || null; return { romId: rid, name: romName(rid), path: where, here: !!(where && fs.existsSync(where)) }; });
    return lib.concat(dumpsHere(e, lib));
  }
  // 0.9.86: dumps of the game in the console's folders on every drive that aren't a library copy (put there by hand,
  // or from before RomM), read from their param.sfo (main's sfoIndex, cached by folder date)
  function dumpsHere(e, lib) {
    const con = e.recipe?.game?.console;
    if (!/^ps[45]$/.test(con || '')) return [];
    const real = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
    const known = new Set(lib.filter((c) => c.path).map((c) => real(c.path)));
    const dirs = new Set([...(m.library?.platforms || []).filter((p) => require('./recomps').consoleOfSlug(p.slug) === con).flatMap((p) => { try { return m.platformDirs(p); } catch { return []; } }),
      ...emulationFolders().map((r) => path.join(r, 'roms', con))].map(real));
    const found = [];
    for (const d of dirs) {
      let names = []; try { names = fs.readdirSync(d); } catch { continue; }
      for (const x of m.sfoIndex(d, names)) found.push({ path: path.join(d, x.entry, x.rel || ''), id: x.id, title: x.title });
    }
    return require('./recomps').matchDumps(e, found).filter((x) => !known.has(real(x.path))).map((x) => ({ romId: null, name: x.title.replace(/[™®]/g, ''), path: x.path, here: true, found: true }));
  }
  // folders that may hold an update for a game: beside it, inside it (one level) and the library's other PS4 copies
  function updateCandidates(dir) {
    const out = new Set(), kids = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((x) => x.isDirectory() || x.isSymbolicLink()).map((x) => path.join(d, x.name)); } catch { return []; } };
    for (const d of [...kids(path.dirname(dir)), ...kids(dir)]) out.add(d);
    for (const r of libraryRoms()) if (/^ps4/i.test(r.platform_slug || '') && m.installedMap[r.id]) { out.add(m.installedMap[r.id]); for (const d of kids(m.installedMap[r.id])) out.add(d); }
    return [...out].slice(0, 600);
  }
  // 0.9.90 (PC playtest: inFAMOUS opened and closed at once, "Missing: eboot.bin"): the copy a port was set up with
  // moved (downloaded again from RomM under a new folder name, a drive renamed, a dump moved by hand), and its start
  // script still named the old folder. Before a start, at start-up and after a download, a port whose copy is gone is
  // set up again with a copy that is here: the library's, else a dump in the console's folders.
  const healing = new Map();
  function healGame(id) {
    if (healing.has(id)) return healing.get(id);
    const job = (async () => {
      const R = recomps(), rec = R.record(id), e = R.byId(id);
      // the port itself not here (its drive unplugged): nothing to set up
      if (e?.from !== 'verified' || !rec?.game?.path || !rec.program || !fs.existsSync(rec.program)) return false;
      const src = rec.game.source || rec.game.path;
      const has = (d) => { try { return fs.statSync(d).isFile() || (e.recipe.game.has || []).slice(0, 1).every((f) => fs.existsSync(path.join(d, f))); } catch { return false; } };
      if (fs.existsSync(src) && has(rec.game.path)) return false;
      for (const c of verifiedCopies(id).filter((x) => x.here && x.path)) {
        if (path.resolve(c.path) === path.resolve(src)) continue;
        try {
          const r = await R.setVerifiedGame(id, c.path, { candidates: updateCandidates(c.path) });
          if (r.ok) { log('verified copy moved, set up again', id, src, '->', c.path); return true; }
          log('verified copy moved, not this one', id, c.path, r.why || '');
        } catch (er) { log('verified copy moved, set up failed', id, er.message); }
      }
      log('verified copy moved and none found', id, src);
      return false;
    })().finally(() => healing.delete(id));
    healing.set(id, job);
    return job;
  }
  async function healGames() {
    const R = recomps();
    for (const e of R.catalogue().entries) if (e.from === 'verified' && R.record(e.id)?.game?.path) await healGame(e.id).catch(() => {});
  }
  // a verified game started: its start script (one per game for Uncharted), the window stepping aside in Game Mode
  async function openVerified(id, start) {
    await healGame(id);
    const R = recomps(), rec = R.record(id), e = R.byId(id);
    if (!rec) throw new Error('Install it first.');
    if (!R.ready(id)) throw new Error(rec.game?.path ? `${e.name} isn’t set up yet. Press Set Up.` : `Pick your copy of ${e.recipe.game.title} first.`);
    const st = rec.starts.find((x) => x.id === start) || rec.starts[0];
    // 0.9.88 (owner: Uncharted saw no controller): pads that Steam Input holds (a Steam Controller always, any pad on
    // the desktop) reach only games Steam started; a port Cartridge spawned itself got Steam's desktop mouse and
    // keyboard. With its shortcut in Steam and Steam running, it starts through Steam, as console games do.
    pickStart(rec, st.id); // its one Steam shortcut starts the game picked here (0.9.89)
    const sc = m.steamMgr.recompShortcut(id) || m.steamMgr.recompShortcut(`${id}:${st.id}`);
    if (sc && require('./steamArt').steamRunning()) {
      try {
        const r = await m.steamMgr.runAppid(sc.appid);
        log('verified opened', id, st.id, 'through steam', r.via);
        m.watchGameRun(require('./recomps').matchRoms(e, libraryRoms())[0] ?? null, { needles: [st.script] });
        // 0.9.89 (owner: Bloodborne doesn't start): Steam can take the request and start nothing (a shortcut left
        // from before, Steam busy). When the start script isn't running 25 s later, it starts directly instead
        // 0.9.90 (PC playtest: inFAMOUS, started by Steam and closed at once, was started a second time): looked for
        // every 2 s, so a start that ended quickly still counts as Steam's
        const t0 = Date.now(), look = async () => {
          if (await scriptRuns(st.script)) return;
          if (Date.now() - t0 < 25000) return setTimeout(look, 2000);
          log('verified through steam: nothing started after 25 s, starting directly', id, st.id);
          spawnStart(id, rec, st).catch((er) => log('verified direct', id, er.message));
        };
        setTimeout(look, 2000);
        return { via: 'steam', start: st.id };
      } catch (er) { log('verified through steam failed', id, er.message); }
    }
    return spawnStart(id, rec, st);
  }
  // a start script running anywhere (Steam's launch or ours): its path in a process's command line
  async function scriptRuns(script) {
    let ids = []; try { ids = (await fs.promises.readdir('/proc')).filter((d) => /^\d+$/.test(d)); } catch { return true; }
    for (let i = 0; i < ids.length; i += 64) {
      const got = await Promise.all(ids.slice(i, i + 64).map((d) => fs.promises.readFile(`/proc/${d}/cmdline`, 'utf8').catch(() => '')));
      if (got.some((c) => c.includes(script) || c.includes(path.join(path.dirname(script), 'play.sh')))) return true;
    }
    return false;
  }
  function spawnStart(id, rec, st) {
    const runLog = path.join(m.USER_DATA, 'emulator-runs', `verified-${id}.log`);
    let fd = 'ignore'; try { fs.mkdirSync(path.dirname(runLog), { recursive: true }); fd = fs.openSync(runLog, 'w'); } catch {}
    const env = require('./childEnv').clean();
    const p = require('child_process').spawn('/bin/sh', [st.script], { cwd: rec.dir, env, detached: true, stdio: ['ignore', fd, fd] });
    if (typeof fd === 'number') try { fs.closeSync(fd); } catch {}
    return new Promise((ok, bad) => {
      p.once('error', (er) => bad(new Error(`It didn’t start: ${er.message}`)));
      p.once('spawn', () => { log('verified opened', id, st.id); m.childRun(p, 'port ' + id); p.unref(); ok({ via: 'script', start: st.id }); });
    });
  }
  // its one Steam shortcut (0.9.89; one per game before): the start script as the program (Proton, settings and the
  // right game are in it), art from your copy in the library, frame generation when picked for it
  function verifiedShortcutSpecs(id) {
    const R = recomps(), e = R.byId(id), rec = R.record(id);
    if (!e || !rec?.starts?.length) throw new Error('Set it up first.');
    const romIds = require('./recomps').matchRoms(e, libraryRoms());
    return [{ id, name: e.name, exe: launcherOf(rec), start: rec.dir, args: '', game: e.recipe.game.title, artRomId: romIds[0] ?? null, fg: fgFor(id) }];
  }
  function recompShortcutSpec(id) {
    const R = recomps(), e = R.byId(id), rec = R.record(id);
    if (!e || !rec) throw new Error('Install it first.');
    const romIds = require('./recomps').matchRoms(e, libraryRoms());
    return { id, name: e.name, exe: rec.program, start: path.dirname(rec.program), args: R.launchArgs(id), game: e.games?.[0]?.title || e.name, artRomId: romIds[0] ?? null, fg: fgFor(id) };
  }

  const handlers = {
  // ---- recomps (0.9.65)
  'recomps:list': () => { oneShortcutsSoon(); const R = recomps(), l = R.list({ roms: libraryRoms() }); for (const e of l.entries) steamOf(e); return { ...l, folder: path.join(emulationFolders()[0] || path.join(os.homedir(), 'Emulation'), 'recomp'), running: recompRun?.id || null }; },
  // the recomps of one library game (game page More, 0.9.65)
  'recomps:forRom': ({ romId }) => { const rom = romIndexMain().get(Number(romId)); if (!rom) return []; return recomps().list({ roms: [rom] }).entries.filter((e) => e.roms.includes(rom.id)).map((e) => ({ id: e.id, name: e.name, installed: steamOf(e).installed, from: e.from, state: e.state || null })); },
  'recomps:check': ({ id, force }) => recomps().check(id, { force }),
  // 0.9.66: the project's stars, newest version, release notes and first README picture (read once a day)
  'recomps:details': ({ id, fresh }) => recomps().details(id, { fresh }),
  // 0.9.66: what a link is for, guessed from its project's name and description against your library; you confirm
  'recomps:guess': async ({ link }) => {
    const C = require('./customEmu'), gh = C.repoOf(link);
    const gl = !gh && /^(?:https?:\/\/)?(?:www\.)?gitlab\.com\/([\w.-]+)\/([\w.-]+)/i.exec(String(link || ''));
    if (!gh && !gl) return null;
    const repo = gh || `${gl[1]}/${gl[2].replace(/\.git$/i, '')}`;
    const H = { headers: { 'User-Agent': 'Cartridge', Accept: 'application/json' }, signal: AbortSignal.timeout(12000) };
    const j = await webFetch(gh ? `https://api.github.com/repos/${repo}` : `https://gitlab.com/api/v4/projects/${encodeURIComponent(repo)}`, H).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const R = require('./recomps');
    const g = R.guessFromText(`${repo.split('/')[1]} ${j?.description || ''} ${(j?.topics || j?.tag_list || []).join(' ')}`, libraryRoms(), R.CONSOLES);
    return { ...g, description: j?.description || '' };
  },
  'recomps:install': async ({ id, channel, build }) => {
    if (recompRun) throw new Error(`${recomps().byId(recompRun.id)?.name || 'Another recomp'} is downloading. Wait for it to finish.`);
    const ac = new AbortController(); recompRun = { id, ac };
    try {
      const r = await recomps().install(id, { channel, build, signal: ac.signal, onProgress: (m) => broadcast('recomp-progress', { id, ...m }) });
      recompTrophies();
      // an update that moved its program: the Steam shortcut follows in place when Steam can be reached
      if (r.programMoved) { try { const sp = recompShortcutSpec(id); await m.steamMgr.recompRepoint(id, { exe: sp.exe, start: sp.start, lo: sp.args }); } catch (e) { log('recomp shortcut repoint', e.message); } }
      return r;
    } finally { recompRun = null; }
  },
  'recomps:cancel': () => { recompRun?.ac.abort(); return true; },
  'recomps:versions': ({ id }) => recomps().versions(id),
  'recomps:useVersion': ({ id, tag }) => recomps().useVersion(id, tag),
  'recomps:dropVersion': ({ id, tag }) => recomps().dropVersion(id, tag),
  'recomps:channel': ({ id, channel }) => recomps().setChannel(id, channel),
  'recomps:backups': ({ id }) => recomps().backups(id),
  'recomps:restore': ({ id, stamp }) => recomps().restoreBackup(id, stamp), // 0.9.69
  'recomps:remove': async ({ id, steam }) => {
    // a verified game can have one shortcut per start (Uncharted's three games): their keys, before the record goes
    const keys = [id, ...(recomps().record(id)?.starts || []).map((st) => `${id}:${st.id}`)];
    const r = await recomps().remove(id);
    recompTrophies();
    // its Steam shortcut goes too when asked (owner's rule for removals: say what happens, nothing silent)
    const scs = steam ? keys.map((k) => m.steamMgr.recompShortcut(k)).filter(Boolean) : [];
    const sc = scs[0] || null;
    if (sc) { m.steamMgr.queueRemove(scs.map((x) => x.appid)); if (await m.steamMgr.liveNow()) await m.steamMgr.apply({ restart: false }).catch((e) => log('recomp steam remove', e.message)); }
    return { ...r, steamRemoved: !!sc };
  },
  // the player's copy for it: from the library when it's on this device (the file inside a game folder that has the
  // right ending), else picked by hand
  'recomps:gameFiles': ({ id }) => {
    const R = recomps(), e = R.byId(id);
    if (!e) return [];
    const ext = (e.needs?.ext || []).map((x) => String(x).toLowerCase()), out = [];
    for (const rid of require('./recomps').matchRoms(e, libraryRoms())) {
      const where = m.installedMap[rid];
      if (!where) continue;
      let file = where;
      if (isDir(where) && e.needs?.files !== 'folder') {
        const inside = require('./forkVersions').filesOf(where).filter((r2) => !ext.length || ext.includes(path.extname(r2).slice(1).toLowerCase()));
        if (!inside.length) continue;
        file = path.join(where, inside.sort((a, b) => a.split('/').length - b.split('/').length)[0]);
      }
      out.push({ romId: rid, name: romName(rid), file });
    }
    return out;
  },
  // 0.9.69 (agreed plan 7.1 #9): your library's copies checked before installing, so a wrong version is said before a
  // download. Only when the catalogue lists file types or hashes; [] when there's nothing to check against
  'recomps:checkCopies': async ({ id }) => {
    const R = recomps(), e = R.byId(id), M = require('./recomps');
    if (!e?.needs || !(e.needs.ext?.length || e.needs.md5?.length || e.needs.sha1?.length)) return [];
    const out = [];
    for (const g of handlers['recomps:gameFiles']({ id }).slice(0, 4)) { const c = await M.checkGame(e, g.file).catch((er) => ({ ok: false, why: er.message })); out.push({ name: g.name, file: g.file, ok: !!c.ok, why: c.why || '' }); }
    return out;
  },
  'recomps:setGame': async ({ id, file, force }) => {
    const R = recomps(), r = await R.setGame(id, file, { force });
    // a one-off setup command (Doom64EX's -wadgen, WiiCompiled's install): run now, watched until its done file is there
    if (r.ok && r.run) {
      const rec = R.record(id);
      if (rec.kind === 'windows') { r.note = 'Start it once through Steam to finish setting up.'; return r; }
      await startRecomp(id, rec, r.run);
      setTimeout(() => recompSetupWatch(id), 4000);
    }
    return r;
  },
  'recomps:done': ({ id }) => recomps().markDone(id),
  // 0.9.80: the save folders a link recomp's Save Sync takes, ticked by you from what Cartridge found (or one you pick)
  'recomps:saveChoices': ({ id }) => recomps().saveChoices(id),
  'recomps:setSyncSaves': ({ id, dirs }) => { const r = recomps().setSyncSaves(id, dirs); log('recomp save folders', id, r.chosen.length); return r; },
  // 0.9.80: builds only from GitHub Actions: their run page in Cartridge's own window (signed in to GitHub there, kept
  // in its own session); the artifact downloaded there installs as the update, then the window closes
  'recomps:ciGet': ({ id }) => new Promise((resolve, reject) => {
    const R = recomps(), e = R.byId(id), lt = R.list().entries.find((x) => x.id === id)?.latest;
    if (!e || !lt?.ci?.url) return reject(new Error('Check for updates first.'));
    const { BrowserWindow, session } = require('electron');
    const ses = session.fromPartition('persist:github');
    const bw = new BrowserWindow({ parent: m.win, width: 1280, height: 800, fullscreen: !!m.win?.isFullScreen(), autoHideMenuBar: true, backgroundColor: '#111', title: `${e.name}: GitHub build`, webPreferences: { session: ses, sandbox: true, contextIsolation: true } });
    bw.webContents.setWindowOpenHandler(({ url: u }) => { if (/^https:\/\//i.test(u)) bw.loadURL(u); return { action: 'deny' }; });
    bw.webContents.on('before-input-event', (_e, i) => { if (i.type === 'keyDown' && i.key === 'Escape') bw.close(); });
    let took = false;
    const onDl = (_e, item) => {
      const fname = item.getFilename() || 'build.zip';
      if (!/\.zip$/i.test(fname)) { item.cancel(); broadcast('toast', { text: 'GitHub’s builds come as .zip files: pick the build’s own download.', kind: 'error' }); return; }
      took = true;
      const file = path.join(m.USER_DATA, 'recomp-downloads', `${id}-${Date.now()}.zip`); fs.mkdirSync(path.dirname(file), { recursive: true });
      item.setSavePath(file);
      const key = 'recomp:' + id;
      bgJob(key, { key, state: 'run', kind: 'Recomp', title: e.name, icon: 'mdiDownload', pct: null, text: 'Downloading from GitHub' });
      setTimeout(() => { try { if (!bw.isDestroyed()) bw.close(); } catch {} }, 150);
      item.on('updated', () => { const t = item.getTotalBytes(); bgJob(key, { pct: t ? Math.floor((item.getReceivedBytes() / t) * 100) : null }); });
      item.once('done', async (_ev, state) => {
        ses.removeListener('will-download', onDl);
        if (state !== 'completed') { bgJob(key, { state: 'error', error: 'The download stopped.' }); fs.rmSync(file, { force: true }); return resolve({ cancelled: true }); }
        try {
          bgJob(key, { pct: null, text: 'Installing' });
          const r = await R.install(id, { local: { file, name: fname, tag: lt.tag, date: lt.date, kind: lt.kind }, onProgress: (x) => broadcast('recomp-progress', { id, ...x }) });
          recompTrophies();
          if (r.programMoved) { try { const sp = recompShortcutSpec(id); await m.steamMgr.recompRepoint(id, { exe: sp.exe, start: sp.start, lo: sp.args }); } catch (er) { log('recomp shortcut repoint', er.message); } }
          bgJob(key, { state: 'done', pct: 100, text: r.rolledBack ? 'Didn’t start: the earlier one is back' : 'Installed' });
          broadcast('recomp-installed', { id, ...r });
          resolve(r);
        } catch (er) { bgJob(key, { state: 'error', error: er.message }); reject(er); }
        finally { fs.rmSync(file, { force: true }); }
      });
    };
    ses.on('will-download', onDl);
    bw.on('closed', () => { refocus(); if (!took) { ses.removeListener('will-download', onDl); resolve({ closed: true }); } });
    bw.loadURL(lt.ci.url);
  }),
  // Add to Steam: queued and applied straight away when Steam can be changed while it runs; otherwise it waits for
  // Apply in Settings → Steam (Steam restarts for that), and the screen says so
  'recomps:steam': async ({ id }) => {
    if (recomps().byId(id)?.from === 'verified') {
      const specs = verifiedShortcutSpecs(id);
      m.steamMgr.queueAdd(specs.map((sp) => ({ recomp: sp })));
      const old = oldStartShortcuts(id, recomps().record(id)?.starts); if (old.length) m.steamMgr.queueRemove(old.map((x) => x.appid));
      if (await m.steamMgr.liveNow()) { await m.steamMgr.apply({ restart: false }); const sc = m.steamMgr.recompShortcut(specs[0].id); return { added: true, appid: sc?.appid || null, count: specs.length }; }
      return { queued: true, count: specs.length };
    }
    const spec = recompShortcutSpec(id);
    m.steamMgr.queueAdd([{ recomp: spec }]);
    if (await m.steamMgr.liveNow()) {
      await m.steamMgr.apply({ restart: false });
      const sc = m.steamMgr.recompShortcut(id);
      if (sc) recomps().setAppid(id, sc.appid);
      return { added: true, appid: sc?.appid || null };
    }
    return { queued: true };
  },
  // port More → Steam (0.9.89, owner): its shortcut out of Steam, into collections, and its frame generation
  'recomps:steamRemove': async ({ id }) => {
    const R = recomps(), scs = [m.steamMgr.recompShortcut(id), ...oldStartShortcuts(id, R.record(id)?.starts)].filter(Boolean);
    if (!scs.length) return { removed: false };
    m.steamMgr.queueRemove(scs.map((x) => x.appid));
    if (await m.steamMgr.liveNow()) { await m.steamMgr.apply({ restart: false }); return { removed: true }; }
    return { queued: true };
  },
  'recomps:steamCollections': async ({ id, names }) => {
    const sc = portShortcut(id, recomps().record(id)?.starts);
    if (!sc) throw new Error('Add the port to Steam first.');
    return m.steamMgr.addAppidToCollections(sc.appid, names || []);
  },
  'recomps:frameGen': ({ id }) => {
    const found = require('./frameGen').detect();
    return { found: { lsfg: !!found.lsfg, mako: !!found.mako }, own: (m.config.steam?.frameGen?.games || {})[fgKey(id)] || null, inSteam: !!portShortcut(id, recomps().record(id)?.starts), last: (m.config.steam?.lastCollections || {}).recomp || null };
  },
  'recomps:setFrameGen': async ({ id, value }) => {
    const conf = ((m.config.steam ||= {}).frameGen ||= {}), games = (conf.games ||= {});
    if (value === 'lsfg' || value === 'mako') games[fgKey(id)] = value; else delete games[fgKey(id)];
    m.saveConfig();
    const R = recomps(), spec = R.byId(id)?.from === 'verified' ? verifiedShortcutSpecs(id)[0] : recompShortcutSpec(id);
    const r = await m.steamMgr.recompUpdate(spec);
    if (r.queued) m.steamMgr.applySoon();
    return r;
  },
  // open it: a Linux build directly (its folder as the working folder), a Windows build through its Steam shortcut so
  // Proton uses the same prefix as play (owner: Windows setup must run through Proton)
  'recomps:open': async ({ id, start }) => {
    const R = recomps(), rec = R.record(id), e = R.byId(id);
    if (e?.from === 'verified') return openVerified(id, start);
    if (!rec || !fs.existsSync(rec.program)) throw new Error('Install it first.');
    // 0.9.67: a recomp that isn't set up yet builds its own files on this start: watched as a background job
    if (!R.ready(id)) setTimeout(() => recompSetupWatch(id), 4000);
    if (rec.kind === 'windows') {
      const sc = m.steamMgr.recompShortcut(id);
      if (!sc) throw new Error(`${e.name} is a Windows build, so it runs through Proton: add it to Steam first, then open it.`);
      return m.steamMgr.runAppid(sc.appid);
    }
    return startRecomp(id, rec, R.launchArgs(id));
  },
  'recomps:refresh': () => recomps().refresh({ playing: () => !!(m.gameFocus.away || m.runOn) }),
  // from a link (not in the list): what it is first, then added with the console and game you say
  // Check It for a recomp link (0.9.69, agreed plan 7.1 #16): the project, its newest release and the build Cartridge
  // would take, before anything is added or downloaded
  'recomps:preview': async ({ link }) => {
    const C = require('./customEmu'), R = require('./recomps'), gh = C.repoOf(link);
    const gl = !gh && /^(?:https?:\/\/)?(?:www\.)?gitlab\.com\/([\w.-]+)\/([\w.-]+)/i.exec(String(link || ''));
    if (!gh && !gl) throw new Error('That isn’t a GitHub or GitLab project link. It looks like github.com/owner/project.');
    const repo = gh ? 'github:' + gh : `gitlab:${gl[1]}/${gl[2].replace(/\.git$/i, '')}`, path2 = repo.split(':')[1];
    const H = { headers: { 'User-Agent': 'Cartridge', Accept: 'application/json' }, signal: AbortSignal.timeout(15000) };
    const [rel, info] = await Promise.all([
      R.releaseOf({ repo }, { fetchImpl: webFetch }).catch((e) => ({ error: e.message })),
      webFetch(gh ? `https://api.github.com/repos/${path2}` : `https://gitlab.com/api/v4/projects/${encodeURIComponent(path2)}`, H).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const b = rel && !rel.error ? R.pickBuild(rel.assets, {}) : null;
    return { repo, tag: rel?.tag || null, date: rel?.date || null, error: rel?.error || null, file: b?.asset?.name || null, size: b?.asset?.size || 0, kind: b?.kind || null, stars: info ? info.stargazers_count ?? info.star_count ?? null : null, description: info?.description || '', fork: !!(info?.fork || info?.forked_from_project), known: !!recomps().catalogue().entries.find((e) => e.repo?.toLowerCase() === repo.toLowerCase()) };
  },
  'recomps:addLink': async ({ link, console: con, title, description }) => {
    const C = require('./customEmu'), gh = C.repoOf(link);
    const gl = !gh && /^(?:https?:\/\/)?(?:www\.)?gitlab\.com\/([\w.-]+)\/([\w.-]+)/i.exec(String(link || ''));
    const repo = gh ? 'github:' + gh : gl ? `gitlab:${gl[1]}/${gl[2].replace(/\.git$/i, '')}` : null;
    if (!repo) throw new Error('That isn’t a GitHub or GitLab project link.');
    const r = recomps().addLink({ repo, console: con, title, name: repo.split('/').pop(), description: String(description || '').slice(0, 300) });
    return r;
  },
  'recomps:folders': () => ({ made: recomps().ensureFolders(), roots: emulationFolders().map((d) => path.join(d, 'recomp')) }),
  // ---- Cartridge Verified (0.9.70): your copy from the library (or a folder you pick), checked and set up; the
  // port's settings in Cartridge; Proton found for Windows builds
  'recomps:copies': ({ id }) => verifiedCopies(id),
  // update: a folder you picked for the update it needs (0.9.72 playtest: inFAMOUS said "pick the game again" with
  // nothing to pick the update with); it's tried before the folders beside the game
  'recomps:prepare': async ({ id, dir, update }) => {
    const R = recomps(), e = R.byId(id);
    if (e?.from !== 'verified') throw new Error('That isn’t a Cartridge Verified game.');
    let use = dir;
    if (!use) {
      const copies = verifiedCopies(id).filter((c) => c.here);
      if (!copies.length) return { ok: false, noCopy: true, why: `${e.recipe.game.title} isn’t on this device yet. Download it from your library first.` };
      use = copies[0].path;
    }
    const r = await R.setVerifiedGame(id, use, { candidates: [...(update ? [update] : []), ...updateCandidates(use)], onProgress: (m) => broadcast('recomp-prep', { id, ...m }) });
    recompTrophies();
    // set up with Steam's automatic adding on: its shortcuts go in too, as a downloaded game's do (0.9.72 playtest)
    if (r.ok && !r.notInstalled && m.config.steam?.autoAdd) {
      try {
        const specs = verifiedShortcutSpecs(id);
        if (!specs.some((sp) => m.steamMgr.recompShortcut(sp.id))) { m.steamMgr.queueAdd(specs.map((sp) => ({ recomp: sp }))); m.steamMgr.applySoon(); r.steamQueued = specs.length; }
      } catch (er) { log('verified auto steam', id, er.message); }
    }
    return { ...r, dir: use };
  },
  'recomps:settings': ({ id }) => recomps().settings(id),
  'recomps:setSettings': async ({ id, changes }) => { const d = await recomps().setSettings(id, changes); log('verified settings', id, (changes || []).map((x) => `${x.id}=${x.value}`).join(' ')); return d; },
  'recomps:runner': () => { const r = require('./protonRunner').find({ roots: (() => { try { return m.steamMgr.steamRoots(); } catch { return []; } })() }); return r ? { kind: r.kind, name: r.name } : null; },
  };
  return { handlers, recomps, ssUnits, recompTrophies, watchFromSteam, healGames };
};
