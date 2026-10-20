// Recipe install test (0.9.71): every Cartridge Verified recipe installed for real, the way a user's Cartridge does it
// (electron/recomps.js with the real download from GitHub), then given a made-up dump of the game shaped like the real
// one, then configured: the port's settings files rendered, its start scripts written, a setting changed and read
// back. Proton is not run (a fake runner); Linux programs are checked for being programs and for missing libraries
// (reported, not failed: a CI runner lacks a Deck's Vulkan). Run nightly by .github/workflows/recipes-check.yml after
// check.js; by hand: GITHUB_TOKEN=... node tools/recipes/install-test.js [id ...]
// Grown from the session scratch test that set up all five ports with their real releases (0.9.70).
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const ROOT = path.join(__dirname, '../..');
const R = require(path.join(ROOT, 'electron/recomps.js'));
const RC = require(path.join(ROOT, 'electron/recipes.js'));
const want = process.argv.slice(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cart-recipes-'));
const home = path.join(root, 'home'), data = path.join(root, 'data'), emu = path.join(home, 'Emulation');
fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(data);
Object.assign(process.env, { HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local/share') });

const headers = { 'user-agent': 'cartridge-recipes-test', ...(process.env.GITHUB_TOKEN ? { authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {}) };
let fetchImpl = (url, o = {}) => fetch(url, { ...o, headers: { ...headers, ...(o.headers || {}) } });
// RECIPES_ASSETS=<folder of release files>: no network, every recipe's release is made from the files there (local runs)
if (process.env.RECIPES_ASSETS) {
  const dir = process.env.RECIPES_ASSETS, files = fs.readdirSync(dir);
  fetchImpl = async (url) => {
    const r = RC.load().find((x) => url.includes('/repos/' + x.repo.replace(/^github:/, '') + '/'));
    const assets = r ? files.filter((f) => r.builds.some((b) => new RegExp(b.asset, 'i').test(f))).map((f) => ({ name: f, browser_download_url: 'file://' + path.join(dir, f), size: fs.statSync(path.join(dir, f)).size })) : [];
    const rel = [{ tag_name: r?.verified?.release || 'v1', published_at: '2026-10-17T00:00:00Z', prerelease: false, draft: false, assets }];
    return { ok: true, status: 200, json: async () => (url.includes('/latest') ? rel[0] : rel), text: async () => JSON.stringify(rel) };
  };
}
async function download(url, dest, onBytes = () => {}) {
  if (url.startsWith('file://')) { fs.copyFileSync(url.slice(7), dest); return onBytes(fs.statSync(dest).size); }
  const r = await fetch(url, { headers: /api\.github\.com/.test(url) ? headers : { 'user-agent': headers['user-agent'] }, redirect: 'follow' });
  if (!r.ok) throw new Error(`download answered ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(dest));
  onBytes(fs.statSync(dest).size);
}
async function unpackTo(archive, dir) {
  fs.mkdirSync(dir, { recursive: true });
  if (/\.(tar\.gz|tgz|tar\.xz|tar)$/i.test(archive)) cp.execFileSync('tar', ['-xf', archive, '-C', dir]);
  else {
    // zip and 7z the way the app unpacks them (main.js unpackTo: addonInstall.openArchive; Windows zips with
    // backslashes in their names come out as folders)
    const { list, close } = await require(path.join(ROOT, 'electron/addonInstall')).openArchive(archive, path.join(root, 'unz-' + Date.now()));
    try {
      for (const e of list) {
        const out = path.resolve(dir, e.rel); if (!out.startsWith(path.resolve(dir) + path.sep)) continue;
        fs.mkdirSync(path.dirname(out), { recursive: true });
        await pipeline(await e.read(), fs.createWriteStream(out));
      }
    } finally { try { close?.(); } catch {} }
  }
}
const head = (f, n = 4) => { try { const b = Buffer.alloc(n); const fd = fs.openSync(f, 'r'); fs.readSync(fd, b, 0, n, 0); fs.closeSync(fd); return b; } catch { return Buffer.alloc(0); } };
const isElf = (f) => head(f).toString('latin1') === '\x7fELF';

// a made-up PS4 dump shaped like the real one: param.sfo with the title ID and version, eboot, the files it must have
function sfo(fields) {
  const keys = Object.keys(fields); let kt = Buffer.alloc(0), dt = Buffer.alloc(0); const ents = [];
  for (const k of keys) { const v = Buffer.from(fields[k] + '\0'); ents.push({ ko: kt.length, len: v.length, off: dt.length }); kt = Buffer.concat([kt, Buffer.from(k + '\0')]); dt = Buffer.concat([dt, v]); }
  const h = Buffer.alloc(20); h.writeUInt32BE(0x00505346, 0); h.writeUInt32LE(0x101, 4); const ktOff = 20 + 16 * keys.length; h.writeUInt32LE(ktOff, 8); h.writeUInt32LE(ktOff + kt.length, 12); h.writeUInt32LE(keys.length, 16);
  const idx = Buffer.concat(ents.map((e) => { const b = Buffer.alloc(16); b.writeUInt16LE(e.ko, 0); b.writeUInt16LE(0x0204, 2); b.writeUInt32LE(e.len, 4); b.writeUInt32LE(e.len, 8); b.writeUInt32LE(e.off, 12); return b; }));
  return Buffer.concat([h, idx, kt, dt]);
}
function dump(dir, id, ver, files = []) {
  fs.mkdirSync(path.join(dir, 'sce_sys'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'eboot.bin'), 'eboot ' + ver);
  fs.writeFileSync(path.join(dir, 'sce_sys/param.sfo'), sfo({ TITLE_ID: id, APP_VER: ver, TITLE: id }));
  for (const f of files) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); if (!fs.existsSync(path.join(dir, f))) fs.writeFileSync(path.join(dir, f), f + ' ' + ver); }
}
// ports whose own installer reads the game's data: the few bytes it checks (P.T.'s installer, its source)
// a made-up Xbox disc image (XDVDFS): the volume descriptor at sector 32, a root folder with default.xbe and Media/
function xiso(file, names) {
  const S = 2048, img = Buffer.alloc(S * 40);
  img.write('MICROSOFT*XBOX*MEDIA', 32 * S, 'latin1');
  const entry = (name, sector, size, attr) => { const b = Buffer.alloc((14 + name.length + 3) & ~3, 0xff); b.writeUInt16LE(0, 0); b.writeUInt16LE(0, 2); b.writeUInt32LE(sector, 4); b.writeUInt32LE(size, 8); b[12] = attr; b[13] = name.length; b.write(name, 14, 'latin1'); return b; };
  // the root: default.xbe, its right subtree Media (offsets in 4-byte units)
  const e1 = entry('default.xbe', 36, 4, 0x20), e2 = entry('Media', 37, S, 0x10);
  e1.writeUInt16LE(e1.length / 4, 2);
  const root = Buffer.concat([e1, e2]);
  root.copy(img, 34 * S); img.write('XBE!', 36 * S, 'latin1');
  entry('song.xwb', 38, 3, 0x20).copy(img, 37 * S); img.write('mus', 38 * S, 'latin1');
  img.writeUInt32LE(34, 32 * S + 20); img.writeUInt32LE(root.length, 32 * S + 24);
  fs.writeFileSync(file, img);
}
const SHAPES = {
  jsrf: (dir) => { for (const n of fs.readdirSync(dir)) fs.rmSync(path.join(dir, n)); xiso(path.join(dir, 'jsrf.iso')); },
  pt: (dir) => {
    const a = path.join(dir, 'CUSA01127-app'); fs.mkdirSync(a, { recursive: true });
    fs.writeFileSync(path.join(a, 'chunk1.psarc'), Buffer.concat([Buffer.from('PSAR'), Buffer.alloc(60)]));
    const q = Buffer.alloc(0x40); q[0x40 - 0x24 + 0x16] = 0x61; q[0x40 - 0x24 + 0x17] = 0x71; fs.writeFileSync(path.join(a, 'texture.qar'), q);
    fs.writeFileSync(path.join(a, 'pathid_list_ps4.bin'), '/Assets/sh/level/pt14_hallway/' + 'x'.repeat(40));
  },
};

const report = [];
const ok = (id, what, good, detail = '') => { report.push({ id, what, good: !!good, detail }); console.log(`${good ? 'ok  ' : 'FAIL'} ${id}: ${what}${detail ? ' · ' + detail : ''}`); };

(async () => {
  const eng = R.createRecomps({
    dataDir: data, log: () => {}, fetchImpl, download, unpackTo, isElf,
    // a Flatpak bundle (Unleashed's Linux release) is named, not installed: the runner is no place to install apps
    flatpakBundle: async (file) => path.basename(file).replace(/\.flatpak$/i, ''),
    isRunning: () => false, trash: async (p) => fs.rmSync(p, { recursive: true, force: true }),
    recompRoot: () => path.join(emu, 'recomp'), recompRoots: () => [path.join(emu, 'recomp')],
    runner: () => ({ kind: 'runtime', proton: '/steam/steamapps/common/Proton 10.0', runtime: '/steam/steamapps/common/SteamLinuxRuntime_sniper', steam: '/steam', name: 'Proton 10.0' }),
    runProgram: async (cmd, args, o) => {
      // a port's own build step (Wind Waker HD's setup.py) can't build from a made-up copy: it is stood in for,
      // leaving the file it would leave (it runs for real when a port is set up on a device)
      if (o.prepareDone) { fs.mkdirSync(path.dirname(o.prepareDone), { recursive: true }); fs.writeFileSync(o.prepareDone, '#!/bin/sh\n', { mode: 0o755 }); return ''; }
      if (/wineboot/.test(args.join(' '))) { fs.mkdirSync(path.join(o.env.STEAM_COMPAT_DATA_PATH, 'pfx/drive_c/users/steamuser'), { recursive: true }); return ''; }
      return new Promise((done, bad) => cp.execFile(cmd, args, { cwd: o.cwd, timeout: o.timeoutMs || 600000, env: o.env }, (e, out, err) => (e ? bad(new Error(String(err || e.message).slice(0, 400))) : done(out))));
    },
  });
  const games = path.join(home, 'Emulation/roms/ps4');
  for (const r of RC.load()) {
    if (want.length && !want.includes(r.id)) continue;
    try {
      const t = Date.now();
      const inst = await eng.install(r.id);
      ok(r.id, 'installs its newest release', inst && (inst.tag || inst.already), `${inst.tag || ''} ${inst.build || ''} in ${Math.round((Date.now() - t) / 1000)} s`);
      const rec = eng.record(r.id);
      const build = RC.chooseBuild(r, { pick: rec.build, runner: true });
      if (!build.installer) {
        const prog = rec.program, there = fs.existsSync(prog);
        ok(r.id, 'its program is where the recipe says', there, path.relative(rec.dir, prog));
        if (there && build.os === 'windows') ok(r.id, 'the Windows program is a Windows program', head(prog, 2).toString('latin1') === 'MZ');
        if (there && build.os === 'linux') {
          ok(r.id, 'the Linux program is a program', isElf(prog) || /\.AppImage$/i.test(prog) || head(prog, 2).toString('latin1') === '#!');
          if (isElf(prog) && !/\.AppImage$/i.test(prog)) { const missing = (cp.spawnSync('ldd', [prog], { encoding: 'utf8' }).stdout || '').split('\n').filter((l) => /not found/.test(l)).map((l) => l.trim().split(' ')[0]); if (missing.length) console.log(`     ${r.id}: libraries this runner lacks (fine on a Deck if Vulkan or SDL): ${missing.join(', ')}`); }
        }
      } else ok(r.id, 'its installer is a Linux program', isElf(rec.installer));
      // the game: base version, or 1.00 with the update beside it when the recipe lays an update over
      const g = r.game, dir = path.join(games, r.id), v = g.version?.want || '01.00';
      // 0.9.91: a ROM or disc image (a made-up file with the right ending: a recipe that checks SHA-1 strictly gets
      // one from SHAPES), or nothing for a port that needs no game files
      if (g.kind === 'file') { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${r.id}${g.ext[0]}`), 'game'); }
      else if (g.kind !== 'none') dump(dir, g.ids[0], g.version?.update ? '01.00' : v, g.has || []);
      SHAPES[r.id]?.(dir);
      const cands = [];
      if (g.version?.update) { const u = path.join(games, r.id + '-update'); dump(u, g.ids[0], v, (g.has || []).filter((f) => !/sce_module/.test(f))); cands.push(u); }
      const set = await eng.setVerifiedGame(r.id, dir, { candidates: cands });
      ok(r.id, 'takes a copy shaped like the real one', set.ok, set.ok ? (set.notes || []).join(' ') : set.why);
      const after = eng.record(r.id);
      const starts = after.starts || [];
      ok(r.id, 'writes its start scripts', starts.length && starts.every((s) => fs.existsSync(s.script)), `${starts.length} start${starts.length === 1 ? '' : 's'}`);
      // a setting changed through Cartridge reaches the port's own file
      const st = await eng.settings(r.id);
      const item = (st.items || []).find((i) => i.type === 'choice' && (i.options || []).length > 1) || (st.items || []).find((i) => i.type === 'bool');
      if (item) {
        const value = item.type === 'bool' ? !(item.game ?? item.base) : item.options.find((o) => o.value !== (item.game ?? item.base))?.value;
        await eng.setSettings(r.id, [{ id: item.id, value }]);
        const back = (await eng.settings(r.id)).items.find((i) => i.id === item.id);
        ok(r.id, 'a setting changed in Cartridge reads back', String(back.game) === String(value), `${item.id} = ${value}`);
      }
      // a port that finishes in its own setup window (r.setup) waits there, Cartridge's part done
      ok(r.id, r.setup ? 'waits for its own setup window' : 'shows as ready to play', eng.list().entries.find((e) => e.id === r.id)?.state === (r.setup ? 'finish' : 'play'));
    } catch (e) { ok(r.id, 'set up', false, e.message.slice(0, 300)); }
  }
  const bad = report.filter((x) => !x.good);
  if (process.env.RECIPES_REPORT && bad.length) fs.appendFileSync(process.env.RECIPES_REPORT, bad.map((x) => `- ${x.id}: ${x.what} failed${x.detail ? ` (${x.detail})` : ''}`).join('\n') + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report.map((x) => `- ${x.good ? '✓' : '✗'} ${x.id}: ${x.what}${x.detail ? ` (${x.detail})` : ''}`).join('\n') + '\n');
  fs.rmSync(root, { recursive: true, force: true });
  console.log(`== recipes: ${report.length - bad.length} passed, ${bad.length} failed`);
  process.exitCode = bad.length ? 1 : 0;
})();
