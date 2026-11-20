// Captures (0.9.95, owner's pick): the real app with screenshots and a clip in emulators' own folders (native, Flatpak,
// EmuDeck storage). The gallery lists them newest first and matched to their game, the pictures load (by token),
// A opens one big, right steps, a clip plays in a video, the game's More has Captures with only its own, and an
// empty home says how to take one.
//   npx vite build && xvfb-run -a node test/e2e/captures.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const mock = require('./mockRomm');
const { launch } = require('./homes');

const results = [];
const check = (name, ok, detail = '') => { results.push({ ok: !!ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// a real PNG (w x h, one colour), so the picture actually decodes
function png(w, h, rgb) {
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3).map((_, i) => rgb[i % 3])]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
const put = (p, b, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b); fs.utimesSync(p, t / 1000, t / 1000); };
const GAMES = [{ id: 950, plat: [310, 'ps2', 'PlayStation 2'], name: 'Okami', files: [['Okami.iso', Buffer.alloc(3000, 5)]] }, { id: 951, plat: [311, 'snes', 'SNES'], name: 'Chrono Trigger', files: [['Chrono Trigger.sfc', Buffer.alloc(3000, 6)]] }];

(async () => {
  const srv = await mock.start({ games: 6, extra: { games: GAMES } });
  const now = Date.now();
  const t = await launch('none', srv, { prep: (home) => {
    put(path.join(home, '.config/PCSX2/snaps/Okami 2026-11-19 20-00-00.png'), png(320, 180, [200, 60, 40]), now - 60e3);
    put(path.join(home, '.var/app/org.libretro.RetroArch/config/retroarch/screenshots/Chrono Trigger-241120-101500.png'), png(256, 224, [40, 90, 200]), now - 30e3);
    put(path.join(home, 'Emulation/storage/pcsx2/snaps/Okami 2026-11-20 08-00-00.png'), png(320, 180, [60, 160, 60]), now - 10e3);
    put(path.join(home, '.config/retroarch/records/Chrono Trigger clip.mp4'), Buffer.alloc(20000, 1), now - 5e3);
    put(path.join(home, '.config/retroarch/saves/not-a-capture.png'), png(64, 64, [0, 0, 0]), now);
  } });
  try {
    await wait(2500);
    const all = await t.call('captures:list', { fresh: true });
    check('four captures found, newest first, nothing from saves', all.length === 4 && all[0].kind === 'video' && !all.some((c) => /not-a-capture/.test(c.file)), all.map((c) => `${c.file}:${c.game}`).join(' | '));
    check('matched to their games', all.filter((c) => c.romId === 950).length === 2 && all.filter((c) => c.romId === 951).length === 2, all.map((c) => c.romId).join(','));
    check('no paths leave Cartridge beyond the folder shown', all.every((c) => !('path' in c) && /^[0-9a-f]{20}$/.test(c.id)));
    // the gallery
    await t.page.evaluate(() => { window.__cartStore.openModal('captures', {}); }); await wait(1800);
    const g = await t.page.evaluate(() => ({ tiles: document.querySelectorAll('.cap-tile').length, loaded: [...document.querySelectorAll('.cap-tile img')].filter((i) => i.naturalWidth > 0).length, seg: !!document.querySelector('.cap-seg'), focus: document.activeElement?.classList.contains('cap-tile') || document.activeElement?.closest('.cap-seg') != null }));
    check('the gallery shows them, the pictures load, Clips filter is there, focus is inside', g.tiles === 4 && g.loaded >= 3 && g.seg && g.focus, JSON.stringify(g));
    await t.page.screenshot({ path: '.ui-audit/captures.png' }).catch(() => {});
    await t.page.click('.cap-tile:nth-child(2)'); await wait(900);
    const v1 = await t.page.evaluate(() => ({ open: !!document.querySelector('.cap-view'), img: document.querySelector('.cap-stage img')?.naturalWidth || 0, text: document.querySelector('.cap-info b')?.textContent }));
    check('A opens one big', v1.open && v1.img > 0, JSON.stringify(v1));
    await t.page.screenshot({ path: '.ui-audit/captures-view.png' }).catch(() => {});
    await t.page.keyboard.press('ArrowLeft'); await wait(500);
    check('left steps to the clip, which is a video', await t.page.evaluate(() => !!document.querySelector('.cap-stage video[src*="cap="]')));
    await t.page.keyboard.press('Escape'); await wait(500);
    check('B closes the big view and stays in the gallery', await t.page.evaluate(() => !document.querySelector('.cap-view') && !!document.querySelector('.dialog.cap')));
    const segs = await t.page.evaluate(() => [...document.querySelectorAll('.seg.cap-seg button')].map((b) => { const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return `${b.textContent.trim()}@${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)} hit=${hit?.textContent?.trim().slice(0, 12)} on=${b.classList.contains('on')}`; }));
    await t.page.click('.seg.cap-seg button:text-is("Clips")').catch((e) => segs.push('click failed: ' + e.message.split('\n')[0]));
    await wait(500);
    const after = await t.page.evaluate(() => ({ n: document.querySelectorAll('.cap-tile').length, on: document.querySelector('.seg.cap-seg button.on')?.textContent.trim() }));
    check('Clips shows only the clip', after.n === 1, JSON.stringify({ segs, after }));
    await t.page.keyboard.press('Escape'); await wait(500);
    // one game's
    check('a game counts only its own', (await t.call('captures:count', { romId: 950 })) === 2);
    await t.page.evaluate(() => { window.__cartStore.openModal('captures', { romId: 950, name: 'Okami' }); }); await wait(1500);
    check('its gallery shows only its two', (await t.page.evaluate(() => document.querySelectorAll('.cap-tile').length)) === 2);
    await t.page.evaluate(() => window.__cartStore.closeModal(null)); await wait(300);
    check('a picture asked for by a made-up token is refused', await t.page.evaluate(() => fetch('romimg://img/?cap=0123456789abcdef0123').then((r) => r.status === 404, () => true)));
    check('no script errors', !t.errors.length, t.errors.slice(0, 3).join(' | '));
  } catch (e) { check('run finished', false, e.message); }
  await t.close();
  // an empty home: it says how to take one
  const t2 = await launch('none', srv);
  try {
    await wait(2000);
    await t2.page.evaluate(() => { window.__cartStore.openModal('captures', {}); }); await wait(1500);
    check('with none, it says how to take one', /Steam \+ R1/.test(await t2.page.evaluate(() => document.querySelector('.cap-empty')?.textContent || '')));
  } catch (e) { check('empty run finished', false, e.message); }
  await t2.close();
  await srv.close();
  const bad = results.filter((r) => !r.ok).length;
  console.log(`== captures: ${results.length - bad} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
