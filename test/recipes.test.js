// Cartridge Verified (0.9.70): the recipes, the files and start scripts written from them, your copy checked (and an
// update laid over it), the Proton runner found, and the engine installing, setting up and changing settings
// against a fake release. The five real releases were also run end to end in the session (not in the repo).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const RC = require('../electron/recipes');
const PR = require('../electron/protonRunner');
const R = require('../electron/recomps');
const { sfo } = require('../electron/saves');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cart-vf-'));
// a param.sfo with text fields
function sfoBytes(fields) {
  const keys = Object.keys(fields); let kt = Buffer.alloc(0), dt = Buffer.alloc(0); const ents = [];
  for (const k of keys) { const v = Buffer.from(fields[k] + '\0'); ents.push({ ko: kt.length, len: v.length, off: dt.length }); kt = Buffer.concat([kt, Buffer.from(k + '\0')]); dt = Buffer.concat([dt, v]); }
  const head = Buffer.alloc(20), ktOff = 20 + 16 * keys.length;
  head.writeUInt32BE(0x00505346, 0); head.writeUInt32LE(0x101, 4); head.writeUInt32LE(ktOff, 8); head.writeUInt32LE(ktOff + kt.length, 12); head.writeUInt32LE(keys.length, 16);
  const idx = Buffer.concat(ents.map((e) => { const b = Buffer.alloc(16); b.writeUInt16LE(e.ko, 0); b.writeUInt16LE(0x0204, 2); b.writeUInt32LE(e.len, 4); b.writeUInt32LE(e.len, 8); b.writeUInt32LE(e.off, 12); return b; }));
  return Buffer.concat([head, idx, kt, dt]);
}
function dump(dir, id, ver, files = []) {
  for (const f of ['eboot.bin', ...files]) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), `${f} ${ver}`); }
  fs.mkdirSync(path.join(dir, 'sce_sys'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sce_sys/param.sfo'), sfoBytes({ TITLE_ID: id, APP_VER: ver, TITLE: id }));
}
const recipe = (id) => RC.load().find((r) => r.id === id);

test('every shipped recipe passes its checks, and index.json holds exactly them', () => {
  const list = RC.load({ log: (...a) => assert.fail(a.join(' ')) });
  // every file in the folder loads (one that fails validate() fails the log above); 0.9.91: no fixed list, ports are added often
  const files = fs.readdirSync(RC.SHIPPED).filter((n) => n.endsWith('.json') && n !== 'index.json').map((n) => n.replace(/\.json$/, '')).sort();
  assert.deepStrictEqual(list.map((r) => r.id).sort(), files);
  assert.ok(files.length >= 5);
  for (const r of list) {
    assert.ok(r.verified?.on && r.verified?.release, `${r.id} says when it was checked`);
    for (const s of r.settings) {
      assert.ok(s.label && s.tab, `${r.id}.${s.id}`);
      if (s.at[0] === 'app') assert.ok(r.builds.some((b) => b.files?.app), `${r.id}.${s.id} has a settings.json to go in`);
      if (s.at[0] === 'ini') assert.ok(r.builds.some((b) => b.files?.ini), `${r.id}.${s.id} has an ini to go in`);
      if (s.at[0] === 'list') assert.ok(r.builds.some((b) => b.files?.list), `${r.id}.${s.id} has a list file to go in`);
    }
  }
  const index = JSON.parse(fs.readFileSync(path.join(RC.SHIPPED, 'index.json'), 'utf8'));
  assert.deepStrictEqual(index.map((r) => r.id).sort(), list.map((r) => r.id).sort(), 'run node tools/recipes/index.js');
  for (const r of index) assert.deepStrictEqual(r, list.find((x) => x.id === r.id), `index.json is out of date for ${r.id}: run node tools/recipes/index.js`);
  // a broken recipe is left out, a newer one (rev) replaces the shipped one
  const bad = { ...list[0], id: 'Bad Id' };
  assert.ok(RC.validate(bad).includes('id'));
  const newer = { ...recipe('iss'), rev: 9, name: 'inFAMOUS Second Son (newer)' };
  assert.strictEqual(RC.load({ fetched: [newer, bad], log: () => {} }).find((r) => r.id === 'iss').name, 'inFAMOUS Second Son (newer)');
});

test('the build: Linux first, Windows only with a Proton runner, yours when picked', () => {
  const g = recipe('gow3'), bb = recipe('bloodborne');
  assert.strictEqual(RC.chooseBuild(g, {}).os, 'linux');
  assert.strictEqual(RC.chooseBuild(g, { pick: 'windows' }).os, 'linux', 'no runner: the Linux build');
  assert.strictEqual(RC.chooseBuild(g, { pick: 'windows', runner: {} }).os, 'windows');
  assert.strictEqual(RC.chooseBuild(bb, {}), null);
  assert.strictEqual(RC.chooseBuild(bb, { runner: {} }).os, 'windows');
});

test('Bloodborne: settings.json for the prefix (game folder as a Windows path), bbport.ini keys, typed values', () => {
  const r = recipe('bloodborne'), b = r.builds[0], rec = { dir: '/E/recomp/ps4/Bloodborne', program: '/E/recomp/ps4/Bloodborne/Bloodborne.exe', game: { path: '/home/me/Games/Bloodborne' } };
  const ini = '# bbport settings\nupscaler=fsr3\nsome_other=7\n';
  const out = RC.render(r, b, rec, RC.effective(r, b, { fps_mode: '60', cheat_no_death: true, sharpness: '0.8', fullscreen: true }), { read: (p) => (p.endsWith('bbport.ini') ? ini : null), home: '/home/me', env: {} });
  const iniOut = out.files.find((f) => f.path.endsWith('bbport.ini')).text;
  assert.match(iniOut, /^# bbport settings$/m); assert.match(iniOut, /^some_other=7$/m, 'other keys kept');
  assert.match(iniOut, /^upscaler=fsr4$/m, 'the port\'s default when you left it');
  assert.match(iniOut, /^cheat_no_death=1$/m); assert.match(iniOut, /^sharpness=0.8$/m); assert.match(iniOut, /^effect_dof=1$/m);
  const app = JSON.parse(out.files.find((f) => f.path.endsWith('settings-main.json')).text);
  assert.strictEqual(app.game_dir, 'Z:\\home\\me\\Games\\Bloodborne');
  assert.deepStrictEqual([app.fps_mode, app.fullscreen, app.hdr, app.check_updates], ['60', true, false, false]);
  assert.strictEqual(out.starts.length, 1);
  assert.strictEqual(out.starts[0].copy.to, '/E/recomp/ps4/Bloodborne/.cartridge/proton/pfx/drive_c/users/steamuser/AppData/Roaming/bbport-launcher/settings.json');
  // what you chose in its own launcher before is read back
  const back = RC.readBack(r, b, rec, { read: (p) => (p.endsWith('bbport.ini') ? ini : p.endsWith('settings.json') ? JSON.stringify({ fps_mode: '30', fullscreen: true }) : null), home: '/home/me', env: {} });
  assert.deepStrictEqual(back, { upscaler: 'fsr3', fps_mode: '30', fullscreen: true });
});

test('Uncharted: one start per game, each with its own "start"; P.T.: sectioned pt.ini with quoted text', () => {
  const u = recipe('uncharted'), rec = { dir: '/E/U', program: '/E/U/Uncharted.exe', game: { path: '/g/U' } };
  const out = RC.render(u, u.builds[0], rec, RC.effective(u, u.builds[0]), { home: '/h', env: {} });
  assert.deepStrictEqual(out.starts.map((s) => [s.id, path.basename(s.script)]), [['u1', 'play-u1.sh'], ['u2', 'play-u2.sh'], ['u3', 'play-u3.sh']]);
  assert.deepStrictEqual(out.files.filter((f) => /settings-u\d/.test(f.path)).map((f) => JSON.parse(f.text).start), ['u1', 'u2', 'u3']);
  const p = recipe('pt'), prec = { dir: '/E/P', program: '/E/P/game/pt', game: { path: '/g/P' } };
  const po = RC.render(p, p.builds[0], prec, RC.effective(p, p.builds[0], { voice_key: 'J', fullscreen: '1' }), { read: () => '; P.T. port settings.\n\n[display]\nwidth = 1920\nfullscreen = 0\n', home: '/h', env: {} });
  const text = po.files[0].text;
  assert.strictEqual(po.files[0].path, '/E/P/game/data/pt.ini');
  assert.match(text, /^width = 1920$/m); assert.match(text, /^fullscreen = 1$/m); assert.match(text, /^\[voice\]\nkey = "J"$/m);
  assert.deepStrictEqual(RC.readBack(p, p.builds[0], prec, { read: () => text, home: '/h', env: {} }), { voice_key: 'J', fullscreen: '1' });
});

test('start scripts: Linux directly; Windows through umu, Steam\'s runtime or Proton; quoting holds', () => {
  const g = recipe('gow3'), bb = recipe('bloodborne');
  const rec = { dir: "/E/it's here", program: "/E/it's here/God.AppImage", game: { path: '/g' } };
  const o = RC.render(g, g.builds[0], rec, RC.effective(g, g.builds[0]), { home: '/h', env: {} });
  const sh = RC.script(g, g.builds[0], rec, o.starts[0], null, o.vars);
  assert.match(sh, /^'\/E\/it'\\''s here\/God\.AppImage' '--play' "\$@" 2>&1 \| tee -a '\/E\/it'\\''s here\/\.cartridge\/output\.log'$/m); // 0.9.71: its output kept for trophies
  assert.match(sh, /^mkdir -p '\/h\/\.config\/gow3-launcher' && cp -f /m);
  const wrec = { dir: '/E/B', program: '/E/B/Bloodborne.exe', game: { path: '/g' } }, wo = RC.render(bb, bb.builds[0], wrec, RC.effective(bb, bb.builds[0]), { home: '/h', env: {} });
  const umu = RC.script(bb, bb.builds[0], wrec, wo.starts[0], { kind: 'umu', umu: '/usr/bin/umu-run', proton: '/s/Proton 10.0' }, wo.vars);
  assert.match(umu, /^export WINEPREFIX='\/E\/B\/\.cartridge\/proton\/pfx' GAMEID=0 STORE=none$/m);
  assert.match(umu, /^'\/usr\/bin\/umu-run' '\/E\/B\/Bloodborne\.exe' '--play' "\$@" 2>&1 \| tee -a /m);
  const sn = RC.script(bb, bb.builds[0], wrec, wo.starts[0], { kind: 'runtime', proton: '/s/P', runtime: '/s/SLR', steam: '/s' }, wo.vars);
  assert.match(sn, /^'\/s\/SLR\/_v2-entry-point' --verb=waitforexitandrun -- '\/s\/P\/proton' waitforexitandrun '\/E\/B\/Bloodborne\.exe' '--play' "\$@" 2>&1 \| tee -a /m);
  assert.match(sn, /^export STEAM_COMPAT_DATA_PATH='\/E\/B\/\.cartridge\/proton' STEAM_COMPAT_CLIENT_INSTALL_PATH='\/s'$/m);
  assert.throws(() => RC.script(bb, bb.builds[0], wrec, wo.starts[0], null, wo.vars), /Proton/);
  // the script really runs: its copy line puts settings.json in place
  const d = tmp(), r2 = { dir: d, program: path.join(d, 'God.AppImage'), game: { path: '/g' } };
  fs.writeFileSync(r2.program, '#!/bin/sh\necho "started $1"\n'); fs.chmodSync(r2.program, 0o755);
  const o2 = RC.render(g, g.builds[0], r2, RC.effective(g, g.builds[0]), { home: d, env: {} });
  for (const f of o2.files) { fs.mkdirSync(path.dirname(f.path), { recursive: true }); fs.writeFileSync(f.path, f.text); }
  const s2 = path.join(d, 'play.sh'); fs.writeFileSync(s2, RC.script(g, g.builds[0], r2, o2.starts[0], null, o2.vars));
  assert.strictEqual(execFileSync('/bin/sh', [s2]).toString().trim(), 'started --play');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(d, '.config/gow3-launcher/settings.json'), 'utf8')).game_dir, '/g');
});

test('your copy: files, title ID and version checked; inFAMOUS\'s update found beside it and laid over it as links', () => {
  const iss = recipe('iss'), d = tmp();
  const base = path.join(d, 'inFAMOUS'), upd = path.join(d, 'CUSA00223-patch'), other = path.join(d, 'Other');
  dump(base, 'CUSA00223', '01.00', ['sce_module/libc.prx', 'sce_module/libSceFios2.prx', 'data/a.dat']);
  dump(upd, 'CUSA00223', '01.07', ['data/a.dat']);
  dump(other, 'CUSA99999', '09.99');
  const c = RC.checkGame(iss, base, { sfo });
  assert.deepStrictEqual([c.ok, c.needsUpdate, c.id], [false, '01.07', 'CUSA00223']);
  const u = RC.findUpdate(iss, base, [base, upd, other], { sfo });
  assert.deepStrictEqual(u, { dir: upd, version: '01.07' });
  const plan = RC.viewPlan(base, upd, { list: (x) => require('../electron/forkVersions').filesOf(x) });
  assert.strictEqual(plan.find((l) => l.rel === 'eboot.bin').from, path.join(upd, 'eboot.bin'));
  assert.strictEqual(plan.find((l) => l.rel === 'sce_module/libc.prx').from, path.join(base, 'sce_module/libc.prx'));
  // a missing module, another game, a PKG where a folder is needed
  const bb = recipe('bloodborne'), half = path.join(d, 'half'); dump(half, 'CUSA03173', '01.00');
  const g = RC.checkGame(recipe('gow3'), half, { sfo });
  assert.ok(g.problems.includes('sce_module/libc.prx isn’t in it.'));
  const v = RC.checkGame(bb, half, { sfo });
  assert.ok(v.ok && v.notes.some((n) => /1\.09/.test(n)), 'Bloodborne 1.00 runs, with a note about 1.09');
  fs.writeFileSync(path.join(d, 'g.pkg'), 'x');
  assert.match(RC.checkGame(bb, path.join(d, 'g.pkg'), { sfo }).problems[0], /dump folder/);
  assert.ok(RC.checkGame(recipe('pt'), path.join(d, 'g.pkg'), { sfo }).ok, 'P.T. takes a fake PKG');
});

test('the Proton runner: each Proton in the runtime it asks for, umu only with a Proton it knows, else none', () => {
  const home = tmp(), steam = path.join(home, '.local/share/Steam');
  const mk = (rel, appid) => { fs.mkdirSync(path.join(steam, rel), { recursive: true }); fs.writeFileSync(path.join(steam, rel, 'proton'), ''); if (appid) fs.writeFileSync(path.join(steam, rel, 'toolmanifest.vdf'), `"manifest"\n{\n  "require_tool_appid" "${appid}"\n}\n`); };
  const rt = (name, appid) => { fs.mkdirSync(path.join(steam, 'steamapps/common', name), { recursive: true }); fs.writeFileSync(path.join(steam, 'steamapps/common', name, '_v2-entry-point'), ''); if (appid) fs.writeFileSync(path.join(steam, 'steamapps', `appmanifest_${appid}.acf`), `"AppState"\n{\n\t"installdir"\t\t"${name}"\n}\n`); };
  assert.strictEqual(PR.find({ home, roots: [steam], env: { PATH: '' }, system: false }), null);
  mk('steamapps/common/Proton 9.0'); mk('steamapps/common/Proton 10.0', '1628350'); mk('steamapps/common/Proton 11.0', '4183110'); mk('steamapps/common/Proton - Experimental', '4183110'); mk('compatibilitytools.d/GE-Proton10-4', '1628350');
  let r = PR.find({ home, roots: [steam], env: { PATH: '' }, system: false });
  assert.deepStrictEqual([r.kind, r.name], ['proton', 'Proton 11.0']);
  // only sniper installed: Proton 11 can't run in it, so Proton 10 does
  rt('SteamLinuxRuntime_sniper');
  r = PR.find({ home, roots: [steam], env: { PATH: '' }, system: false });
  assert.deepStrictEqual([r.kind, r.name, r.runtime, r.steam], ['runtime', 'Proton 10.0', path.join(steam, 'steamapps/common/SteamLinuxRuntime_sniper'), steam]);
  // runtime 4 found by its appmanifest: Proton 11 in it, even with umu installed
  fs.mkdirSync(path.join(home, '.local/bin'), { recursive: true }); fs.writeFileSync(path.join(home, '.local/bin/umu-run'), '');
  rt('SteamLinuxRuntime_4', '4183110');
  r = PR.find({ home, roots: [steam], env: { PATH: '' }, system: false });
  assert.deepStrictEqual([r.kind, r.name, path.basename(r.runtime)], ['runtime', 'Proton 11.0', 'SteamLinuxRuntime_4']);
  // no runtime at all: umu, with the newest Proton whose runtime it knows (the owner's PC: umu 1.2.9 and Proton 11)
  fs.rmSync(path.join(steam, 'steamapps/common/SteamLinuxRuntime_4'), { recursive: true }); fs.rmSync(path.join(steam, 'steamapps/common/SteamLinuxRuntime_sniper'), { recursive: true });
  r = PR.find({ home, roots: [steam], env: { PATH: '' }, system: false });
  assert.deepStrictEqual([r.kind, r.name], ['umu', 'Proton 10.0']);
  const lib = path.join(home, '.local/lib/python3.14/site-packages/umu'); fs.mkdirSync(lib, { recursive: true });
  fs.writeFileSync(path.join(lib, '__init__.py'), '__runtime_versions__ = (\n    ("steamrt4", "steamrt4", "4183110"),\n    ("sniper", "steamrt3", "1628350"),\n)\n');
  r = PR.find({ home, roots: [steam], env: { PATH: '' }, system: false });
  assert.deepStrictEqual([r.kind, r.name], ['umu', 'Proton 11.0'], 'a newer umu that knows runtime 4 takes Proton 11');
  fs.writeFileSync(path.join(lib, '__init__.py'), '("soldier", "steamrt2", "1391110"),');
  r = PR.find({ home, roots: [steam], env: { PATH: '' }, system: false });
  assert.deepStrictEqual([r.kind, r.proton], ['umu', null], 'no Proton umu can match: umu brings its own');
});

test('Steam\'s own launch never reaches what Cartridge starts', () => {
  const CE = require('../electron/childEnv');
  const env = CE.clean({ STEAM_COMPAT_DATA_PATH: '/p' }, { HOME: '/h', LD_PRELOAD: 'x.so', APPIMAGE: '/a', SteamGameId: '1', STEAM_COMPAT_DATA_PATH: '/steam', STEAM_COMPAT_TOOL_PATHS: '/t', PRESSURE_VESSEL_RUNTIME: 'r', STEAM_RUNTIME_LIBRARY_PATH: 'l' });
  assert.deepStrictEqual(env, { HOME: '/h', SteamGameId: '1', DISABLE_AUTO_UPDATES: '1', STEAM_COMPAT_DATA_PATH: '/p' });
  const sh = path.join(tmp(), 'u.sh');
  fs.writeFileSync(sh, `${CE.SHELL_UNSET}\nenv | grep -cE '^(STEAM_COMPAT_|PRESSURE_VESSEL_|STEAM_RUNTIME|LD_LIBRARY_PATH)' || true\necho "$SteamGameId"\n`);
  const out = require('child_process').execFileSync('/bin/sh', [sh], { env: { PATH: process.env.PATH, STEAM_COMPAT_APP_ID: '7', PRESSURE_VESSEL_X: '1', STEAM_RUNTIME: '1', LD_LIBRARY_PATH: '/l', SteamGameId: '9' } }).toString().trim().split('\n');
  assert.deepStrictEqual(out, ['0', '9']);
});

test('the engine: a verified game installed from its release, set up with your copy, its settings changed', async () => {
  const d = tmp(), data = path.join(d, 'data'), emu = path.join(d, 'Emulation'), home = path.join(d, 'home');
  fs.mkdirSync(data); fs.mkdirSync(home);
  // a recipe of the bbport kind with a Linux build: a tar.gz holding a program that prints its settings
  const rdir = path.join(d, 'recipes'); fs.mkdirSync(rdir);
  const rcp = { schema: 1, id: 'demo', name: 'Demo Port', repo: 'github:o/demo', game: { console: 'ps4', title: 'Demo', ids: ['CUSA00001'], kind: 'folder', has: ['eboot.bin'] }, verified: { on: '2026-10-17', release: 'v1' },
    builds: [{ os: 'linux', asset: '^demo-linux\\.tar\\.gz$', program: 'demo', args: ['--play'], files: { app: { path: '{config}/demo/settings.json', format: 'json' }, ini: { path: '{dir}/demo.ini', format: 'flat' } } }],
    app: { game_dir: '{game}' }, saves: ['{dir}/user'],
    settings: [{ id: 'fps', tab: 'Display', label: 'Frame rate', type: 'choice', def: '60', options: [['30', '30'], ['60', '60']], at: ['app', 'fps'] }, { id: 'aa', tab: 'Graphics', label: 'Anti-aliasing', type: 'bool', def: true, at: ['ini', 'aa'] }] };
  fs.writeFileSync(path.join(rdir, 'demo.json'), JSON.stringify(rcp));
  const pkg = path.join(d, 'pkg'); fs.mkdirSync(path.join(pkg, 'demo-linux'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'demo-linux/demo'), '#!/bin/sh\necho "play $1"\n'); fs.chmodSync(path.join(pkg, 'demo-linux/demo'), 0o755);
  execFileSync('tar', ['-czf', path.join(d, 'demo-linux.tar.gz'), '-C', pkg, 'demo-linux']);
  const rel = [{ tag_name: 'v1', published_at: '2026-10-17', prerelease: false, draft: false, assets: [{ name: 'demo-linux.tar.gz', browser_download_url: 'file://' + path.join(d, 'demo-linux.tar.gz'), size: 1 }, { name: 'demo-windows.zip', browser_download_url: 'x', size: 1 }] }];
  const fetchImpl = async (url) => ({ ok: true, status: 200, json: async () => (url.includes('/latest') ? rel[0] : rel) });
  const prevHome = process.env.XDG_CONFIG_HOME; process.env.XDG_CONFIG_HOME = path.join(home, '.config');
  try {
    const eng = R.createRecomps({ dataDir: data, recipesDir: rdir, fetchImpl, log: () => {},
      download: async (url, dest, onBytes) => { fs.copyFileSync(url.replace('file://', ''), dest); onBytes(1); },
      unpackTo: async (a, out) => execFileSync('tar', ['-xf', a, '-C', out]), isElf: (f) => path.basename(f) === 'demo', isRunning: () => false,
      recompRoot: () => path.join(emu, 'recomp'), recompRoots: () => [path.join(emu, 'recomp')] });
    assert.strictEqual(eng.list().entries.find((e) => e.id === 'demo').state, 'get');
    const r1 = await eng.install('demo');
    assert.deepStrictEqual([r1.tag, r1.build, path.basename(r1.program)], ['v1', 'linux', 'demo']);
    assert.strictEqual(eng.list().entries.find((e) => e.id === 'demo').state, 'game', 'installed, your copy not picked yet');
    const copy = path.join(d, 'games/Demo'); dump(copy, 'CUSA00001', '01.00');
    const g = await eng.setVerifiedGame('demo', copy);
    assert.ok(g.ok && g.ready, JSON.stringify(g));
    const rec = eng.record('demo'), l = eng.list().entries.find((e) => e.id === 'demo');
    assert.deepStrictEqual([l.state, l.settingsCount, l.changed], ['play', 2, 0]);
    assert.strictEqual(execFileSync('/bin/sh', [rec.starts[0].script]).toString().trim(), 'play --play');
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(home, '.config/demo/settings.json'), 'utf8')).game_dir, copy);
    assert.match(fs.readFileSync(path.join(rec.dir, 'demo.ini'), 'utf8'), /^aa=1$/m);
    // a setting changed: the files follow at once; one back to the port's own isn't kept as yours
    const s = await eng.setSettings('demo', [{ id: 'fps', value: '30' }, { id: 'aa', value: false }]);
    assert.deepStrictEqual(s.items.map((x) => [x.id, x.game]), [['fps', '30'], ['aa', false]]);
    assert.match(fs.readFileSync(path.join(rec.dir, 'demo.ini'), 'utf8'), /^aa=0$/m);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(rec.dir, '.cartridge/settings-main.json'), 'utf8')).fps, '30');
    await eng.setSettings('demo', [{ id: 'fps', value: '60' }]);
    assert.deepStrictEqual(eng.record('demo').settings, { aa: false });
    await assert.rejects(eng.setSettings('demo', [{ id: 'fps', value: '144' }]), /isn’t one of its choices/);
    assert.deepStrictEqual(eng.saveDirs('demo'), [path.join(rec.dir, 'user')]);
    // a copy that isn't the game is refused with what's missing
    const wrong = path.join(d, 'games/Wrong'); fs.mkdirSync(wrong, { recursive: true });
    const w = await eng.setVerifiedGame('demo', wrong);
    assert.match(w.why, /eboot\.bin isn’t in it/);
  } finally { if (prevHome === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = prevHome; }
});

test('the engine: a port with its own installer (P.T.) runs it with your copy into game/, and again for an update', async () => {
  const d = tmp(), data = path.join(d, 'data'), emu = path.join(d, 'Emulation'); fs.mkdirSync(data);
  // the installer stands in for P.T.'s: --install <copy> <destination> <result>, refusing a folder holding anything else
  const setup = path.join(d, 'Setup-linux');
  fs.writeFileSync(setup, '#!/bin/sh\n[ "$1" = --install ] || exit 2\nif [ -d "$3" ] && [ ! -f "$3/pt" ] && [ -n "$(ls -A "$3")" ]; then echo "This folder holds something else." > "$4"; exit 1; fi\nmkdir -p "$3/data" && printf "#!/bin/sh\\necho pt\\n" > "$3/pt" && chmod +x "$3/pt"\nif [ -f "$3/.done" ]; then echo "PASS updated" > "$4"; else touch "$3/.done"; printf "PASS installed\\nnote: it is the US release\\n" > "$4"; fi\n');
  fs.chmodSync(setup, 0o755);
  const rel = [{ tag_name: 'v1.0.5', published_at: '2026-10-17', prerelease: false, draft: false, assets: [{ name: 'P.T.PC.Port.Setup-linux', browser_download_url: 'file://' + setup, size: 1 }] }];
  const runs = [];
  const eng = R.createRecomps({ dataDir: data, fetchImpl: async (url) => ({ ok: true, json: async () => (url.includes('/latest') ? rel[0] : rel) }), log: () => {},
    download: async (url, dest) => fs.copyFileSync(url.replace('file://', ''), dest), isRunning: () => false,
    recompRoot: () => path.join(emu, 'recomp'), recompRoots: () => [path.join(emu, 'recomp')],
    runProgram: (cmd, args, o) => { runs.push(args[0]); return new Promise((ok, bad) => require('child_process').execFile(cmd, args, { cwd: o.cwd }, (e) => (e ? bad(e) : ok('')))); } });
  const i = await eng.install('pt');
  assert.deepStrictEqual([i.tag, i.build], ['v1.0.5', 'linux']);
  assert.strictEqual(eng.list().entries.find((e) => e.id === 'pt').state, 'game');
  const copy = path.join(d, 'P.T. dump'); fs.mkdirSync(copy);
  for (const f of ['eboot.bin', 'chunk1.psarc', 'texture.qar']) fs.writeFileSync(path.join(copy, f), f);
  const g = await eng.setVerifiedGame('pt', copy);
  assert.ok(g.ok && g.ready, JSON.stringify(g));
  const rec = eng.record('pt');
  assert.strictEqual(rec.program, path.join(rec.dir, 'game/pt'));
  assert.deepStrictEqual(rec.installNotes, ['it is the US release']);
  assert.strictEqual(execFileSync('/bin/sh', [rec.starts[0].script]).toString().trim(), 'pt');
  assert.ok(fs.existsSync(path.join(rec.dir, 'game/data/pt.ini')));
  // a settings change doesn't run the installer again; another copy does
  await eng.setSettings('pt', [{ id: 'vsync', value: false }]);
  assert.strictEqual(runs.length, 1);
  assert.match(fs.readFileSync(path.join(rec.dir, 'game/data/pt.ini'), 'utf8'), /^vsync=0$/m);
  const copy2 = path.join(d, 'Another dump'); fs.mkdirSync(copy2);
  for (const f of ['chunk1.psarc', 'texture.qar']) fs.writeFileSync(path.join(copy2, f), f);
  await eng.setVerifiedGame('pt', copy2);
  assert.strictEqual(runs.length, 2);
});

test('verified ports’ trophies (0.9.71): output kept by the start script, unlocks read from both forms', () => {
  const RA = require('../electron/recompAchievements');
  const RC = require('../electron/recipes');
  assert.deepStrictEqual(RA.readPs4Unlocks('3 1760000000\nnoise\nRuntime: trophy 14 unlocked\n'), [{ id: 3, time: 1760000000000 }, { id: 14, time: null }]);
  const bb = RC.load().find((r) => r.id === 'bloodborne');
  assert.strictEqual(bb.achievements.list.length, 40);
  const rec = { dir: '/g/Bloodborne', program: '/g/Bloodborne/Bloodborne.exe', game: { path: '/roms/bb' } };
  const b = RC.chooseBuild(bb, { runner: true });
  const a = RC.achievementsOf(bb, b, rec, RC.varsFor(bb, b, rec, { home: '/h', env: {} }));
  assert.deepStrictEqual(a.files, ['/g/Bloodborne/user/trophies.log', '/g/Bloodborne/.cartridge/output.log']);
  const sh = RC.script(bb, b, rec, { id: 'main', name: 'Bloodborne' }, { kind: 'proton', proton: '/p', steam: '/s' }, { prefix: '/g/Bloodborne/.cartridge/proton' });
  assert.match(sh, /2>&1 \| tee -a '\/g\/Bloodborne\/\.cartridge\/output\.log'$/m);
  assert.doesNotMatch(sh, /^exec /m);
  // a recipe without achievements keeps exec
  const pt = RC.load().find((r) => r.id === 'pt'), pb = RC.chooseBuild(pt, {});
  assert.match(RC.script(pt, pb, { dir: '/g/pt', program: '/g/pt/game/pt' }, { id: 'main', name: 'P.T.' }, null, {}), /^exec /m);
  // the trophy list of Bloodborne with two unlocks
  const g = RA.gameOf({ id: 'bloodborne', name: 'Bloodborne' }, { format: 'ps4', files: ['x'], list: bb.achievements.list }, () => Buffer.from('1 1760000000\nRuntime: trophy 14 unlocked\n'));
  assert.strictEqual(g.trophies.length, 40);
  assert.deepStrictEqual(g.trophies.filter((t) => t.unlocked).map((t) => [t.id, t.grade]), [[1, 'G'], [14, 'B']]);
});

test('downloads are checked against GitHub’s SHA-256 (0.9.71)', async () => {
  const R = require('../electron/recomps');
  const d = fs.mkdtempSync(path.join(require('os').tmpdir(), 'dig-')), f = path.join(d, 'a.zip');
  fs.writeFileSync(f, 'hello');
  await R.checkDigest(f, 'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  await R.checkDigest(f, null); // older releases have none
  await assert.rejects(R.checkDigest(f, 'sha256:' + '0'.repeat(64)), /checksum/);
  assert.ok(!fs.existsSync(f)); // a bad file is thrown away
  const G = require('../electron/github');
  assert.ok(typeof G.release === 'function');
});

test('a draft from draft.js never loads: TODO fields and the todo list are refused', () => {
  const ok = JSON.parse(fs.readFileSync(path.join(__dirname, '../electron/recipes/pt.json'), 'utf8'));
  const draft = { ...ok, by: 'TODO: who made it', game: { ...ok.game, title: 'TODO' }, todo: ['fill in'] };
  const bad = RC.validate(draft);
  assert.ok(bad.includes('todo list still there') && bad.includes('by is TODO') && bad.includes('game.title is TODO'), bad.join(', '));
  assert.deepStrictEqual(RC.validate(ok), []);
});

test('a Windows update is started once through the runner, in the port’s own prefix', () => {
  const pre = '/g/bb/.cartridge/proton';
  const u = RC.runCommand({ kind: 'umu', umu: '/usr/bin/umu-run', proton: '/s/GE-Proton9' }, '/g/bb/game.exe', ['-x'], pre);
  assert.deepStrictEqual([u.cmd, u.args, u.env.WINEPREFIX, u.env.PROTONPATH], ['/usr/bin/umu-run', ['/g/bb/game.exe', '-x'], pre + '/pfx', '/s/GE-Proton9']);
  const s = RC.runCommand({ kind: 'sniper', proton: '/s/Proton', sniper: '/s/sniper', steam: '/s' }, '/g/bb/game.exe', [], pre);
  assert.deepStrictEqual([s.cmd, s.args], ['/s/sniper/_v2-entry-point', ['--verb=run', '--', '/s/Proton/proton', 'run', '/g/bb/game.exe']]);
  assert.strictEqual(s.env.STEAM_COMPAT_DATA_PATH, pre);
});

test('0.9.79: a copy outside the tested versions says so; P.T. finds its files as the port does', () => {
  const d = tmp(), gw = recipe('gow3'), pt = recipe('pt');
  const a = path.join(d, 'gow-a'); dump(a, 'CUSA01623', '01.02', gw.game.has);
  assert.ok(RC.checkGame(gw, a, { sfo }).notes.every((n) => !/tested with versions/.test(n)), 'a tested version has no note');
  const b = path.join(d, 'gow-b'); dump(b, 'CUSA01623', '01.03', gw.game.has);
  const cb = RC.checkGame(gw, b, { sfo });
  assert.ok(cb.ok && cb.notes.includes('It’s version 01.03; the port was tested with versions 01.00 and 01.02.'), JSON.stringify(cb));
  // P.T.: beside eboot.bin (the owner's dump), or in a folder up to two down (first_run.cpp FindGameFolder)
  const top = path.join(d, 'pt-top'); dump(top, 'CUSA01127', '01.00', ['chunk1.psarc', 'texture.qar']);
  assert.ok(RC.checkGame(pt, top, { sfo }).ok);
  const deep = path.join(d, 'pt-deep'); fs.mkdirSync(path.join(deep, 'dumps/CUSA01127'), { recursive: true });
  for (const f of ['chunk1.psarc', 'texture.qar']) fs.writeFileSync(path.join(deep, 'dumps/CUSA01127', f), f);
  assert.ok(RC.checkGame(pt, deep, { sfo }).ok);
  const none = path.join(d, 'pt-none'); dump(none, 'CUSA01127', '01.00', ['chunk1.psarc']);
  const cn = RC.checkGame(pt, none, { sfo });
  assert.ok(!cn.ok && cn.problems.includes('chunk1.psarc and texture.qar aren’t in it or the folders inside it.'), JSON.stringify(cn));
  assert.ok(RC.validate({ ...gw, game: { ...gw.game, tested: ['1.0'] } }).includes('game tested'));
  assert.ok(RC.validate({ ...pt, game: { ...pt.game, find: { files: ['../x'] } } }).includes('game find'));
});

test('0.9.81: P.T.’s installer shows what it has copied, and one that writes nothing is stopped with the reason', async () => {
  const mk = (runProgram) => {
    const d = tmp(), data = path.join(d, 'data'), emu = path.join(d, 'Emulation'); fs.mkdirSync(data);
    const setup = path.join(d, 'Setup-linux'); fs.writeFileSync(setup, '#!/bin/sh\n'); fs.chmodSync(setup, 0o755);
    const rel = [{ tag_name: 'v1.0.5', published_at: '2026-10-17', prerelease: false, draft: false, assets: [{ name: 'P.T.PC.Port.Setup-linux', browser_download_url: 'file://' + setup, size: 1 }] }];
    const eng = R.createRecomps({ dataDir: data, fetchImpl: async (url) => ({ ok: true, json: async () => (url.includes('/latest') ? rel[0] : rel) }), log: () => {},
      download: async (url, dest) => fs.copyFileSync(url.replace('file://', ''), dest), isRunning: () => false, stallMs: 300, tickMs: 40,
      recompRoot: () => path.join(emu, 'recomp'), recompRoots: () => [path.join(emu, 'recomp')], runProgram });
    const copy = path.join(d, 'P.T.'); fs.mkdirSync(copy);
    fs.writeFileSync(path.join(copy, 'eboot.bin'), 'e'); fs.writeFileSync(path.join(copy, 'chunk1.psarc'), Buffer.alloc(4000)); fs.writeFileSync(path.join(copy, 'texture.qar'), Buffer.alloc(1000));
    return { eng, copy };
  };
  // writes nothing, never ends: stopped once nothing has been written for stallMs
  let killed = false;
  const a = mk((cmd, args, o) => new Promise((ok, bad) => o.signal?.addEventListener('abort', () => { killed = true; bad(new Error('stopped')); })));
  await a.eng.install('pt');
  await assert.rejects(a.eng.setVerifiedGame('pt', a.copy), /wrote nothing for/);
  assert.ok(killed, 'the installer was stopped');
  // copies the game in steps, then passes: each step shows, measured against the files it copies (5000 bytes)
  const seen = [];
  const b = mk(async (cmd, args) => {
    const dest = args[2]; fs.mkdirSync(dest, { recursive: true });
    for (let i = 1; i <= 3; i++) { fs.writeFileSync(path.join(dest, `part${i}`), Buffer.alloc(1500)); await new Promise((r) => setTimeout(r, 120)); }
    fs.writeFileSync(path.join(dest, 'pt'), '#!/bin/sh\n'); fs.writeFileSync(args[3], 'PASS installed\n');
  });
  await b.eng.install('pt');
  const r = await b.eng.setVerifiedGame('pt', b.copy, { onProgress: (m) => seen.push(m) });
  assert.ok(r.ok, JSON.stringify(r));
  const inst = seen.filter((m) => m.step === 'installer' && m.got);
  assert.ok(inst.length >= 2 && inst.every((m) => m.want === 5000 && m.pct <= 99), JSON.stringify(inst));
  assert.deepStrictEqual([seen[0].step, seen.at(-1).step], ['check', 'write']);
});

test('0.9.83: a Windows port on a drive that can’t hold links (exFAT, NTFS) gets its Proton prefix on the internal drive', async () => {
  const d = tmp(), data = path.join(d, 'data'), emu = path.join(d, 'Expansion', 'Emulation'), home = path.join(d, 'home');
  fs.mkdirSync(data); fs.mkdirSync(home);
  const rdir = path.join(d, 'recipes'); fs.mkdirSync(rdir);
  const rcp = { schema: 1, id: 'wport', name: 'Win Port', repo: 'github:o/wport', game: { console: 'ps4', title: 'Win', ids: ['CUSA00002'], kind: 'folder', has: ['eboot.bin'] }, verified: { on: '2026-10-18', release: 'v1' },
    builds: [{ os: 'windows', asset: '^wport\\.tar\\.gz$', program: 'Port.exe', args: [], files: {} }], settings: [] };
  fs.writeFileSync(path.join(rdir, 'wport.json'), JSON.stringify(rcp));
  const pkg = path.join(d, 'pkg', 'wport'); fs.mkdirSync(pkg, { recursive: true }); fs.writeFileSync(path.join(pkg, 'Port.exe'), 'MZ');
  execFileSync('tar', ['-czf', path.join(d, 'wport.tar.gz'), '-C', path.join(d, 'pkg'), 'wport']);
  const rel = [{ tag_name: 'v1', published_at: '2026-10-18', prerelease: false, draft: false, assets: [{ name: 'wport.tar.gz', browser_download_url: 'file://' + path.join(d, 'wport.tar.gz'), size: 1 }] }];
  const made = [];
  const eng = R.createRecomps({ dataDir: data, recipesDir: rdir, log: () => {}, prefixRoot: path.join(home, '.local/share/cartridge/proton'),
    fetchImpl: async (url) => ({ ok: true, status: 200, json: async () => (url.includes('/latest') ? rel[0] : rel) }),
    download: async (url, dest) => fs.copyFileSync(url.replace('file://', ''), dest), unpackTo: async (a, out) => execFileSync('tar', ['-xf', a, '-C', out]),
    isElf: () => false, isRunning: () => false, recompRoot: () => path.join(emu, 'recomp'), recompRoots: () => [path.join(emu, 'recomp')],
    runner: async () => ({ kind: 'umu', umu: '/usr/bin/umu-run', proton: '/p/Proton 11.0', name: 'Proton 11.0' }),
    runProgram: async (cmd, args, o) => { made.push(o.env.WINEPREFIX); fs.mkdirSync(path.join(o.env.WINEPREFIX, 'drive_c'), { recursive: true }); return ''; } });
  await eng.install('wport');
  const copy = path.join(d, 'games', 'Win'); fs.mkdirSync(path.join(copy, 'sce_sys'), { recursive: true }); fs.writeFileSync(path.join(copy, 'eboot.bin'), 'e');
  const real = fs.symlinkSync;
  fs.symlinkSync = () => { const e = new Error('EPERM: operation not permitted, symlink'); e.code = 'EPERM'; throw e; }; // what exFAT answers
  try { const r = await eng.setVerifiedGame('wport', copy); assert.ok(r.ok, JSON.stringify(r)); }
  finally { fs.symlinkSync = real; }
  const rec = eng.record('wport');
  assert.strictEqual(rec.prefix, path.join(home, '.local/share/cartridge/proton', 'wport'));
  assert.deepStrictEqual(made, [path.join(rec.prefix, 'pfx')], 'Proton made it there, not beside the install');
  assert.match(fs.readFileSync(rec.starts[0].script, 'utf8'), new RegExp(rec.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the start script uses it');
});

test('Uncharted’s FPS counter goes to bbport.ini, where its game reads it (its launcher’s --play never passes it on) (0.9.88)', () => {
  const r = require('../electron/recipes/uncharted.json');
  assert.deepStrictEqual(r.settings.find((s) => s.id === 'show_fps').at, ['ini', 'show_fps']);
});

// 0.9.90 (owner: a port update that adds or removes settings is reflected in Cartridge's Game Settings)
test('settingsNow: keys the port writes that the recipe lacks show under More; ones it stopped writing go', () => {
  const r = { name: 'X', app: { game_dir: '{game}' }, known: { app: ['a', 'b', 'game_dir', 'nested', 'oldKey'], ini: ['cheat_c', 'loops'] }, settings: [
    { id: 'a', tab: 'Display', label: 'A', type: 'bool', def: true, at: ['app', 'a'] },
    { id: 'b', tab: 'Display', label: 'B', type: 'number', def: 1, at: ['app', 'b'] },
    { id: 'c', tab: 'Game', label: 'C', type: 'bool', def: false, at: ['ini', 'cheat_c'] },
  ] };
  const build = { os: 'linux', program: 'p', files: { app: { path: '{dir}/s.json', format: 'json' }, ini: { path: '{dir}/g.ini', format: 'flat' } } };
  const files = { '/i/s.json': JSON.stringify({ a: true, b: 2, game_dir: '/g', newMode: 'fast', nested: { x: 1 } }), '/i/g.ini': 'cheat_c=0\nloops=7\nnew_toggle=true\nfps_cap=120\nvolume=1\n' };
  const rec = { dir: '/i', tag: 'v2', game: { path: '/g' } };
  const read = (p) => files[p] ?? null;
  const ids = (l) => l.map((s) => s.id);
  let l = RC.settingsNow(r, build, rec, { read });
  assert.deepStrictEqual(ids(l), ['a', 'b', 'c', 'x.app.newMode', 'x.ini.new_toggle', 'x.ini.fps_cap', 'x.ini.volume']); // loops was there when verified
  assert.deepStrictEqual(RC.settingsNow({ ...r, known: undefined }, build, rec, { read }).filter((s) => s.found), [], 'a recipe without known shows no extras');
  const extra = Object.fromEntries(l.filter((s) => s.found).map((s) => [s.id, s]));
  assert.strictEqual(extra['x.app.newMode'].type, 'text'); assert.strictEqual(extra['x.app.newMode'].label, 'New mode');
  assert.strictEqual(extra['x.ini.new_toggle'].type, 'bool'); assert.strictEqual(extra['x.ini.fps_cap'].type, 'number'); assert.strictEqual(extra['x.ini.volume'].type, 'number', '1 is a number, not on');
  // written back by render with the rest
  const out = RC.render(r, build, rec, RC.effective(r, build, { 'x.ini.new_toggle': false }, l), { read, sets: l });
  assert.match(out.files.find((f) => f.path === '/i/g.ini').text, /new_toggle=false/);
  // the port, updated, no longer writes b: hidden for that release only
  l = RC.settingsNow(r, build, { ...rec, portKeys: { tag: 'v2', app: ['a', 'game_dir'], ini: ['cheat_c'] } }, { read });
  assert.ok(!ids(l).includes('b') && ids(l).includes('a') && ids(l).includes('c'));
  assert.ok(ids(RC.settingsNow(r, build, { ...rec, portKeys: { tag: 'v1', app: ['a'], ini: [] } }, { read })).includes('b'), 'another release: nothing hidden');
  // a port that writes only what you changed (under half the recipe's keys) hides nothing
  assert.ok(ids(RC.settingsNow(r, build, { ...rec, portKeys: { tag: 'v2', app: ['zzz'], ini: [] } }, { read })).includes('b'));
});

// 0.9.91: the ports beyond PS4 dumps
test('a file of lines: toggles and choices are their lines, other lines stay', () => {
  const r = { name: 'X', settings: [
    { id: 'fps', tab: 'A', label: 'FPS', type: 'choice', def: '', at: ['list'], options: [['', '30'], ['60 FPS with deltatime', '60']] },
    { id: 'blur', tab: 'A', label: 'Blur', type: 'bool', def: false, at: ['list', 'Disable blur'] },
  ] };
  const build = { os: 'windows', program: 'x.exe', files: { list: { path: '{dir}/p.txt', format: 'lines' } } };
  const rec = { dir: '/i', game: { path: '/g' } };
  const out = RC.render(r, build, rec, { fps: '60 FPS with deltatime', blur: false }, { read: () => 'Someone else\nDisable blur\n' });
  assert.strictEqual(out.files[0].text, 'Someone else\n60 FPS with deltatime\n');
  assert.deepStrictEqual(RC.readBack(r, build, rec, { read: () => 'Disable blur\n60 FPS with deltatime\n' }), { fps: '60 FPS with deltatime', blur: true });
});

test('sparse files: only what you changed is written, a setting put back is taken out', () => {
  const r = { name: 'X', settings: [
    { id: 'fps', tab: 'A', label: 'FPS', type: 'number', def: 20, at: ['app', ['CVars', 'gSettings', 'FPS']] },
    { id: 'tts', tab: 'A', label: 'TTS', type: 'bool', def: false, int: true, at: ['app', ['CVars', 'gSettings', 'TTS']] },
    { id: 'res', tab: 'A', label: 'Res', type: 'choice', def: '1', at: ['ini', 'resScale'], options: [['1', '1x'], ['2', '2x']] },
  ] };
  const build = { os: 'linux', program: 'p', files: { app: { path: '{dir}/s.json', format: 'json', nested: true, sparse: true }, ini: { path: '{dir}/s.ini', format: 'flat', sparse: true } } };
  const rec = { dir: '/i', game: { path: '/g' } };
  const read = (p) => (p.endsWith('.json') ? JSON.stringify({ CVars: { gSettings: { FPS: 60, Controllers: { a: 1 } } } }) : 'resScale=2\nother=1\n');
  const out = RC.render(r, build, rec, RC.effective(r, build, { tts: true }), { read, saved: { tts: true } });
  const json = JSON.parse(out.files.find((f) => f.path.endsWith('settings-main.json')).text);
  assert.deepStrictEqual(json.CVars.gSettings, { Controllers: { a: 1 }, TTS: 1 }, 'FPS taken out (back to default), TTS as 1, mappings kept');
  assert.strictEqual(out.files.find((f) => f.path.endsWith('s.ini')).text, 'other=1\n');
});

test('the start script: first-start arguments, settings from the environment, a program the setup made', () => {
  const r = { name: 'X', settings: [{ id: 'full', tab: 'A', label: 'Full', type: 'bool', def: false, at: ['env', 'RECOMP_FULLSCREEN'] }] };
  const build = { os: 'linux', program: 'setup', run: 'game/launch', args: ['{gamePosix}'], first: { unless: '{dir}/made.o2r', args: ['--rom', '{gamePosix}'] } };
  const rec = { dir: '/i', game: { path: '/g/rom.z64' } };
  const on = RC.render(r, build, rec, { full: true }), off = RC.render(r, build, rec, { full: false });
  const s = RC.script(r, build, rec, on.starts[0], null, on.vars);
  assert.match(s, /export RECOMP_FULLSCREEN='1'/);
  assert.match(s, /\[ -e '\/i\/made\.o2r' \] \|\| set -- '--rom' '\/g\/rom\.z64' "\$@"/);
  assert.match(s, /exec '\/i\/game\/launch' '\/g\/rom\.z64' "\$@"/);
  assert.doesNotMatch(RC.script(r, build, rec, off.starts[0], null, off.vars), /RECOMP_FULLSCREEN/);
});

test('a game that is one file: picked from its folder by ending, checked by SHA-1 when the recipe lists copies', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cart-file-'));
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'x'); fs.writeFileSync(path.join(dir, 'game.z64'), 'rom');
  const sha = require('crypto').createHash('sha1').update('rom').digest('hex');
  const r = (extra) => ({ name: 'P', game: { kind: 'file', ext: ['.z64'], ...extra } });
  assert.strictEqual(RC.checkGame(r({}), dir).file, path.join(dir, 'game.z64'));
  assert.strictEqual(RC.checkGame(r({ sha1: [sha] }), path.join(dir, 'game.z64')).ok, true);
  assert.strictEqual(RC.checkGame(r({ sha1: ['0'.repeat(40)] }), path.join(dir, 'game.z64')).ok, false);
  assert.strictEqual(RC.checkGame(r({ sha1: ['0'.repeat(40)], soft: true }), path.join(dir, 'game.z64')).ok, true, 'soft: a note only');
  assert.strictEqual(RC.checkGame(r({}), path.join(dir, 'notes.txt')).ok, false);
  // an unpacked Xbox disc folder is used as it is
  fs.writeFileSync(path.join(dir, 'default.xbe'), 'x');
  assert.strictEqual(RC.checkGame({ name: 'J', game: { kind: 'file', ext: ['.iso'], unpack: 'xiso', has: ['default.xbe'] } }, dir).folder, dir);
});

test('an Xbox disc image (XDVDFS) is listed and unpacked', async () => {
  const X = require('../electron/xiso');
  const S = 2048, img = Buffer.alloc(S * 40);
  img.write('MICROSOFT*XBOX*MEDIA', 32 * S, 'latin1');
  const ent = (name, sector, size, attr, right = 0) => { const b = Buffer.alloc((14 + name.length + 3) & ~3, 0xff); b.writeUInt16LE(0, 0); b.writeUInt16LE(right, 2); b.writeUInt32LE(sector, 4); b.writeUInt32LE(size, 8); b[12] = attr; b[13] = name.length; b.write(name, 14, 'latin1'); return b; };
  const e1 = ent('default.xbe', 36, 4, 0x20); e1.writeUInt16LE(e1.length / 4, 2);
  const root = Buffer.concat([e1, ent('Media', 37, S, 0x10)]);
  root.copy(img, 34 * S); img.write('XBE!', 36 * S, 'latin1');
  ent('a.bin', 38, 3, 0x20).copy(img, 37 * S); img.write('abc', 38 * S, 'latin1');
  img.writeUInt32LE(34, 32 * S + 20); img.writeUInt32LE(root.length, 32 * S + 24);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cart-xiso-')), iso = path.join(dir, 'g.iso');
  fs.writeFileSync(iso, img);
  assert.deepStrictEqual((await X.list(iso)).map((x) => x.rel), ['default.xbe', 'Media', 'Media/a.bin']);
  const dest = path.join(dir, 'out');
  fs.mkdirSync(path.join(dest, 'UDATA'), { recursive: true }); fs.writeFileSync(path.join(dest, 'UDATA/save'), 'mine');
  await X.unpack(iso, dest, { keep: ['UDATA'] });
  assert.strictEqual(fs.readFileSync(path.join(dest, 'Media/a.bin'), 'utf8'), 'abc');
  assert.strictEqual(fs.readFileSync(path.join(dest, 'UDATA/save'), 'utf8'), 'mine', 'saves kept through unpacking again');
  fs.writeFileSync(iso, Buffer.alloc(S * 40));
  await assert.rejects(X.list(iso), /isn’t an Xbox disc image/);
});

test('programs Cartridge starts keep AppImage self-updaters quiet (Cartridge updates emulators itself)', () => {
  const CE = require('../electron/childEnv');
  assert.strictEqual(CE.clean({}, { PATH: '/bin' }).DISABLE_AUTO_UPDATES, '1');
  assert.strictEqual(CE.clean({ DISABLE_AUTO_UPDATES: '0' }, {}).DISABLE_AUTO_UPDATES, '0', 'a caller can still ask for it');
});
