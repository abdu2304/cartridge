// Phone Remote (0.9.94, owner's pick): the real app with the page opened as a phone opens it. The library and a cover,
// a download started from the phone and followed, the phone's buttons moving Cartridge (RT changes the tab, B goes
// back), Show on TV opening the game, off means off, and left on it comes back on the same address after a restart.
//   npx vite build && xvfb-run -a node test/e2e/phoneremote.js
const fs = require('fs');
const path = require('path');
const mock = require('./mockRomm');
const { launch } = require('./homes');

const results = [];
const check = (name, ok, detail = '') => { results.push({ ok: !!ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const GAMES = [{ id: 900, plat: [300, 'snes', 'SNES'], name: 'Phone Pick', files: [['Phone Pick.sfc', Buffer.alloc(3000, 9)]] }];

(async () => {
  const srv = await mock.start({ games: 12, extra: { games: GAMES } });
  let keep = null;
  const t = await launch('none', srv);
  try {
    await wait(2500);
    const st = await t.call('remote:start');
    check('it turns on', st?.on === true, JSON.stringify(st).slice(0, 160));
    keep = JSON.parse(fs.readFileSync(path.join(t.data, 'config.json'), 'utf8')).phoneRemote;
    check('its address is kept in the config', !!(keep?.secret && keep?.port && keep.on), JSON.stringify({ port: keep?.port, on: keep?.on }));
    const base = `http://127.0.0.1:${keep.port}/${keep.secret}`;
    const page = await fetch(base);
    check('the phone page opens', page.status === 200 && /Phone Remote/.test(await page.text()));
    check('a wrong address is refused', (await fetch(`http://127.0.0.1:${keep.port}/nope`)).status === 404);
    const lib = await (await fetch(base + '/api/games')).json();
    check('the library is there', lib.total >= 13 && lib.list.length > 0, `${lib.total} games, first ${lib.list[0]?.name}`);
    const found = await (await fetch(base + '/api/games?q=phone%20pick')).json();
    check('search finds a game by its words', found.total === 1 && found.list[0].id === 900, JSON.stringify(found.list.map((g) => g.name)));
    const cv = await fetch(base + '/api/cover/' + lib.list[0].id);
    check('a cover answers (a picture or not found, never an error)', [200, 404].includes(cv.status), `${cv.status} ${cv.headers.get('content-type')}`);
    const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    check('Download from the phone', (await post('/api/download', { romId: 900 })).status === 200);
    let dl = null;
    for (let i = 0; i < 20 && dl?.status !== 'done'; i++) { await wait(500); dl = (await (await fetch(base + '/api/downloads')).json()).find((d) => d.romId === 900); }
    check('the phone follows it to done', dl?.status === 'done', JSON.stringify(dl));
    const again = await post('/api/download', { romId: 900 });
    check('a game already here isn’t downloaded again', again.status === 500 && /already/.test((await again.json()).error), String(again.status));
    // the buttons
    const route = () => t.page.evaluate(() => window.__cartStore.route?.name);
    const r0 = await route();
    await post('/api/pad', { a: 'rt' }); await wait(800);
    const r1 = await route();
    check('RT on the phone moves to the next tab', r1 && r1 !== r0, `${r0} → ${r1}`);
    await post('/api/show', { romId: 900 }); await wait(1200);
    const g = await t.page.evaluate(() => ({ name: window.__cartStore.route?.name, id: window.__cartStore.route?.params?.romId }));
    check('Show on TV opens the game', g.name === 'game' && Number(g.id) === 900, JSON.stringify(g));
    await post('/api/pad', { a: 'back' }); await wait(800);
    check('B on the phone goes back', (await route()) !== 'game', await route());
    check('the pad mode is on (focus rings show)', await t.page.evaluate(() => document.body.classList.contains('pad-mode')));
    const status = await t.call('remote:status');
    check('Cartridge counts the phone', status.phones === 1, JSON.stringify(status).slice(0, 120));
    // the Settings row and the pop-up
    await t.page.evaluate(() => { window.__cartStore.openModal('phoneremote', {}); }); await wait(1200);
    // a device with a home-network address shows the code; one without (this CI container: 192.0.2.x) says why
    if (status.urls.length) check('the pop-up shows the code and the address', await t.page.evaluate(() => !!document.querySelector('.pr-qr') && /\/[0-9a-f]{32}$/.test(document.querySelector('.pr-url')?.textContent || '')));
    else check('with no home network, the pop-up says so instead of a code', await t.page.evaluate(() => !document.querySelector('.pr-qr') && /isn’t on a network your phone can reach/.test(document.querySelector('.pr-why')?.textContent || '')));
    await t.page.screenshot({ path: '.ui-audit/phoneremote.png' }).catch(() => {});
    await t.page.evaluate(() => window.__cartStore.closeModal(null));
    await t.call('remote:stop');
    const gone = await fetch(base).then((r) => r.status, () => 'closed');
    check('off means off', gone === 'closed', String(gone));
    check('no script errors', !t.errors.length, t.errors.slice(0, 3).join(' | '));
  } catch (e) { check('run finished', false, e.message); }
  await t.close();
  // left on: comes back on by itself, on the same address
  if (keep) {
    const t2 = await launch('none', srv, { config: { phoneRemote: { ...keep, on: true } } });
    try {
      await wait(6500);
      const st = await t2.call('remote:status');
      const back = await fetch(`http://127.0.0.1:${keep.port}/${keep.secret}`).then((r) => r.status, () => 'closed');
      check('left on, it is back on after a restart at the same address', st?.on && back === 200, `${JSON.stringify(st).slice(0, 80)} ${back}`);
    } catch (e) { check('restart run finished', false, e.message); }
    await t2.close();
  }
  await srv.close();
  const bad = results.filter((r) => !r.ok).length;
  console.log(`== phone remote: ${results.length - bad} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
