// Motion bench (0.9.70; one engine since 0.9.88, GSAP): the moves GSAP runs, with the CPU slowed 4x (a handheld under
// load). Each move runs 12 times, frames are timed in the page (requestAnimationFrame gaps), and the report
// gives frames over 20 ms and the slowest frame. Moves: a game card flying to its page (morph) and back, and Start's
// tiles reflowing while arranging (a tile moved one cell with the D-pad).
// Usage: npx vite build && node tools/ui-audit/motionBench.js
const { open } = require('./harness.js');

const TIMER = () => { window.__gaps = []; let last = performance.now(); const loop = (t) => { window.__gaps.push(t - last); last = t; if (window.__benchOn) requestAnimationFrame(loop); }; window.__benchOn = true; requestAnimationFrame(loop); };
const STOP = () => { window.__benchOn = false; const g = window.__gaps.slice(1); return { n: g.length, slow: g.filter((x) => x > 20).length, worst: Math.round(Math.max(0, ...g)) }; };

async function bench() {
  const { browser, page: p } = await open({ ui: { start: { tiles: [{ id: 'a', type: 'clock', x: 0, y: 0, w: 2, h: 1 }, { id: 'b', type: 'storage', x: 2, y: 0, w: 2, h: 1 }, { id: 'c', type: 'week', x: 4, y: 0, w: 4, h: 1 }, { id: 'd', type: 'recent', x: 0, y: 1, w: 4, h: 2 }, { id: 'e', type: 'fresh', x: 4, y: 1, w: 4, h: 2 }] } } });
  const cdp = await p.context().newCDPSession(p);
  await p.waitForTimeout(1500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.BENCH_RATE || 4) });
  const out = { morph: [], arrange: [] };
  for (let i = 0; i < 12; i++) {
    await p.click('[data-tab="library"]').catch(() => {}); await p.waitForTimeout(700);
    await p.evaluate(TIMER);
    await p.locator('.card').nth(i % 5).click().catch(() => {}); await p.waitForTimeout(900);
    await p.keyboard.press('Escape'); await p.waitForTimeout(900);
    out.morph.push(await p.evaluate(STOP));
  }
  await p.click('[data-tab="start"]').catch(() => {}); await p.waitForTimeout(800);
  await p.evaluate(() => { const t = document.querySelector('[data-key="tile-a"]'); t?.focus(); });
  await p.evaluate(() => window.dispatchEvent(new CustomEvent('cart-hold')));
  await p.keyboard.down('Enter'); await p.waitForTimeout(600); await p.keyboard.up('Enter'); await p.waitForTimeout(500);
  for (let i = 0; i < 12; i++) {
    await p.evaluate(TIMER);
    await p.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight'); await p.waitForTimeout(700);
    out.arrange.push(await p.evaluate(STOP));
  }
  const arranging = await p.evaluate(() => !!document.querySelector('.start.editing'));
  await browser.close();
  const sum = (l) => ({ frames: l.reduce((a, x) => a + x.n, 0), slow: l.reduce((a, x) => a + x.slow, 0), worst: Math.max(...l.map((x) => x.worst)) });
  return { morph: sum(out.morph), arrange: sum(out.arrange), arranging };
}
(async () => {
  { const r = await bench(); console.log(`morph: ${r.morph.slow} of ${r.morph.frames} frames over 20 ms, slowest ${r.morph.worst} ms · arrange${r.arranging ? '' : ' (not arranging!)'}: ${r.arrange.slow} of ${r.arrange.frames}, slowest ${r.arrange.worst} ms`); }
})();
