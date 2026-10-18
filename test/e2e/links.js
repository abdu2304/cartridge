// Linked Folders with forks (0.9.84, sweep round 9): a Dolphin fork Cartridge knows by itself (PrimeHack) and a
// shadPS4 fork you mark yourself, each with saves of its own next to the original's. Cartridge must suggest each
// pair, link them keeping the fork's saves (copied into the original's folder with Merge, the fork's folder set
// aside), and Unlink must put the fork's own folder back exactly as it was. The original's saves are never lost.
//   npx vite build && xvfb-run -a node test/e2e/links.js
const fs = require('fs');
const path = require('path');
const mock = require('./mockRomm');
const { launch, put, appImage } = require('./homes');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SAVE = (n) => Buffer.from(Array.from({ length: 2048 }, (_, i) => (i * n) & 255));
// [fork, the program, how it's a fork, the fork's save, the original's save, the pair's two folders]
const CASES = [
  { name: 'PrimeHack', of: 'dolphin', exe: 'Applications/PrimeHack.AppImage', fork: '.local/share/PrimeHack/GC/USA/Card A/01-GM8E-MetroidPrime.gci', orig: '.local/share/dolphin-emu/GC/USA/Card A/01-GKTE-IslandKart.gci', from: '.local/share/PrimeHack/GC', to: '.local/share/dolphin-emu/GC', label: 'GameCube Saves' },
  { name: 'shadPS4 BB', of: 'shadps4', mark: true, exe: 'Applications/shadps4-bb.AppImage', fork: '.local/share/shadps4-bb/home/1000/savedata/CUSA03173/SPRJ0005/sdata', orig: '.local/share/shadPS4/home/1000/savedata/CUSA00001/SAVE0001/sdata', from: '.local/share/shadps4-bb/home', to: '.local/share/shadPS4/home', label: 'PS4 Saves' },
];
const isLink = (p) => { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } };

(async () => {
  const srv = await mock.start({ games: 3 });
  const t = await launch('none', srv, { prep: (home) => {
    for (const [i, c] of CASES.entries()) { put(path.join(home, c.exe), appImage(), 0o755); put(path.join(home, c.fork), SAVE(i + 3)); put(path.join(home, c.orig), SAVE(i + 7)); }
    put(path.join(home, '.config/dolphin-emu/Dolphin.ini'), '[General]\nISOPaths = 0\n');
  } });
  const { errors, home } = t;
  const call = (ch, a) => t.call(ch, a).catch((e) => ({ error: String(e.message).split('\n')[0].replace(/^.*?Error: /, '') }));
  const H = (p) => path.join(home, p);
  try {
    await wait(3000);
    await call('setup:rescan').catch(() => {});
    for (const c of CASES.filter((x) => x.mark)) { const r = await call('setup:fork', { path: H(c.exe), of: c.of, name: c.name }); if (r?.error) check(`${c.name}: marked as a fork`, false, r.error); }
    await wait(1000);
    let l = await call('links:list');
    for (const c of CASES) {
      const s = (l?.suggestions || []).find((x) => x.exe === H(c.exe) && x.label === c.label);
      check(`${c.name}: suggested (${c.label})`, s && s.from === H(c.from) && s.to === H(c.to) && s.state === 'folder', s ? `${path.relative(home, s.from || '')} → ${path.relative(home, s.to || '')} (${s.state})` : (l?.suggestions || []).map((x) => `${x.fork}:${x.label}:${x.state}`).join(' ') || JSON.stringify(l).slice(0, 160));
      if (!s?.from || !s?.to) continue;
      const chk = await call('links:check', { from: s.from, to: s.to });
      check(`${c.name}: the pair can be linked`, !chk?.why, chk?.why || '');
      const r = await call('links:make', { from: s.from, to: s.to, label: s.label, fork: s.fork, of: s.of, merge: true, main: 'original' });
      check(`${c.name}: linked`, !r?.error && isLink(H(c.from)) && fs.realpathSync(H(c.from)) === fs.realpathSync(H(c.to)), r?.error || '');
      const forkSave = path.join(H(c.to), path.relative(c.from, c.fork));
      check(`${c.name}: the fork's save copied in, same bytes`, fs.existsSync(forkSave) && fs.readFileSync(forkSave).equals(SAVE(CASES.indexOf(c) + 3)), path.relative(home, forkSave));
      check(`${c.name}: the original's save untouched`, fs.readFileSync(H(c.orig)).equals(SAVE(CASES.indexOf(c) + 7)));
      check(`${c.name}: the fork's own folder kept aside`, r?.kept && fs.existsSync(r.kept) && fs.existsSync(path.join(r.kept, path.relative(c.from, c.fork))), r?.kept ? path.relative(home, r.kept) : 'not kept');
      check(`${c.name}: the fork sees its save through the link`, fs.existsSync(H(c.fork)));
    }
    l = await call('links:list');
    check('linked pairs are no longer suggested', !CASES.some((c) => (l?.suggestions || []).some((x) => x.exe === H(c.exe) && x.label === c.label)));
    check('links listed as linked', (l?.links || []).length === CASES.length && l.links.every((x) => x.state === 'linked'), (l?.links || []).map((x) => x.state).join(' '));
    // a second Find and Link does nothing more
    const again = await call('links:auto', { dry: true });
    check('Find and Link has nothing left to do', Array.isArray(again) && !again.some((x) => CASES.some((c) => x.from === H(c.from))), JSON.stringify(again).slice(0, 160));
    for (const lk of l?.links || []) {
      const c = CASES.find((x) => H(x.from) === lk.from);
      const r = await call('links:remove', { id: lk.id });
      check(`${c?.name || lk.from}: unlinked, the fork's own folder back`, !r?.error && !isLink(lk.from) && fs.existsSync(H(c.fork)) && fs.readFileSync(H(c.fork)).equals(SAVE(CASES.indexOf(c) + 3)), r?.error || '');
      check(`${c?.name || lk.from}: the original keeps everything`, fs.existsSync(H(c.orig)) && fs.existsSync(path.join(H(c.to), path.relative(c.from, c.fork))));
    }
    // a link onto a folder that isn't in home or on a drive is refused
    const out = await call('links:check', { from: H(CASES[0].from), to: '/etc' });
    check('a folder outside home is refused', !!out?.why, out?.why || 'allowed');
    check('no script errors', !errors.length, errors.slice(0, 3).join(' | '));
  } catch (e) { check('run finished', false, e.stack); }
  await t.close(); await srv.close();
  const bad = results.filter((x) => !x.ok).length;
  console.log(`== links: ${results.length - bad} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
