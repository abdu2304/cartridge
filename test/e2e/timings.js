// How long each page's data takes (0.9.92): the handlers pages call when they open, timed in the real app in each
// setup, with a Steam that has 300 shortcuts and a 2,000-game library. Anything over its budget fails. Run twice per
// handler: the first (cold) and the second (warm) are both printed.
//   npx vite build && xvfb-run -a node test/e2e/timings.js
const fs = require('fs');
const path = require('path');
const mock = require('./mockRomm');
const { SETUPS, launch } = require('./homes');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BUDGET = Number(process.env.E2E_SLOW_MS || 1500); // one handler, warm
// what Settings → Emulators, PC Ports, Steam, Saves, the game page and Start ask for when they open
const CALLS = [['steam:overview'], ['steam:status'], ['recomps:list'], ['emuup:list', { cached: true }], ['emuget:list'], ['issues:list'], ['online:list'], ['bios:status'], ['cee:emulators'],
  ['saves:locations'], ['savesync:status'], ['steam:frameGen'], ['steam:played'], ['play:stats'], ['play:week'], ['storage:overview'], ['roots:list'], ['jobs:list'], ['dl:list'], ['steam:colReview'], ['links:list']];
// a binary shortcuts.vdf with n entries (as Steam writes it), so the Steam manager has something real to read
function shortcuts(n) {
  const parts = [], str = (s) => parts.push(Buffer.from(String(s) + '\0'));
  const walk = (o) => { for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object') { parts.push(Buffer.from([0])); str(k); walk(v); parts.push(Buffer.from([8])); } else if (typeof v === 'number') { parts.push(Buffer.from([2])); str(k); const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); parts.push(b); } else { parts.push(Buffer.from([1])); str(k); str(v ?? ''); } } };
  const sc = {}; for (let i = 0; i < n; i++) sc[i] = { appid: 3000000000 + i, AppName: `Some Game ${i}`, Exe: '"/usr/bin/true"', StartDir: '"/usr/bin"', icon: '', ShortcutPath: '', LaunchOptions: `-f "/games/Some Game ${i}.chd"`, IsHidden: 0, AllowDesktopConfig: 1, AllowOverlay: 1, OpenVR: 0, Devkit: 0, DevkitGameID: '', DevkitOverrideAppID: 0, LastPlayTime: 0, FlatpakAppID: '', tags: { 0: 'Games' } };
  walk({ shortcuts: sc }); parts.push(Buffer.from([8]));
  return Buffer.concat(parts);
}
(async () => {
  const srv = await mock.start({ games: Number(process.env.E2E_GAMES || 2000) });
  let bad = 0;
  for (const name of process.argv[2] ? [process.argv[2]] : Object.keys(SETUPS)) {
    const { call, page, errors, close } = await launch(name, srv, { steam: true, prep: (home) => fs.writeFileSync((fs.mkdirSync(path.join(home, '.local/share/Steam/userdata/39734273/config'), { recursive: true }), path.join(home, '.local/share/Steam/userdata/39734273/config/shortcuts.vdf')), shortcuts(300)) });
    try {
      await wait(6000); // the library and the first scans
      for (const [ch, arg] of CALLS) {
        const t = [];
        for (let i = 0; i < 2; i++) { const t0 = Date.now(); const r = await call(ch, arg).catch((e) => ({ error: e.message })); t.push(Date.now() - t0); if (r?.error && i === 0) console.log(`     ${name}: ${ch} answered an error: ${String(r.error).slice(0, 120)}`); }
        const slow = t[1] > BUDGET;
        if (slow) bad++;
        console.log(`${slow ? 'FAIL' : 'ok  '} ${name}: ${ch} · ${t[0]} ms, then ${t[1]} ms`);
      }
      // the main thread's longest stall while all that ran (perf:sample)
      const p = await call('perf:sample').catch(() => null);
      if (p?.stallMs != null) console.log(`     ${name}: longest main-thread stall ${Math.round(p.stallMs)} ms`);
      if (errors.length) { bad++; console.log(`FAIL ${name}: script errors · ${errors.slice(0, 3).join(' | ')}`); }
    } finally { await close(); }
  }
  srv.close?.();
  console.log(`== timings: ${bad ? bad + ' over budget' : 'all within ' + BUDGET + ' ms'}`);
  process.exit(bad ? 1 : 0);
})();
