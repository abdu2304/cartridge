// Focus audit (0.9.47): every kind of focusable thing on every main page, each Settings section, the game page and
// its More sheet is focused the way a controller does (pad mode, transitions off), and the pixels around it are
// compared before and after. Under 4% changed (and less than a 1.2 px ring's worth) means the focus can't be seen: the bug the owner kept finding
// (a Light or OLED rule beating the focus ring, a chosen state that looks like focus, a ring clipped away).
// Usage: node tools/ui-audit/focus.js [theme] [style]   (no arguments: all six looks)
const { PNG } = require('pngjs');
const { open, TABS, LOOKS } = require('./harness.js');
async function run(theme, style) {
  const { browser, page: p, errors } = await open({ theme, style });
  const bad = [];
  const audit = async (label, scope = 'main.main') => {
    await p.waitForTimeout(700);
    const items = await p.evaluate((scope) => {
      document.body.classList.add('pad-mode'); document.body.classList.remove('touch-mode', 'mouse-mode');
      if (!document.getElementById('nox')) { const st = document.createElement('style'); st.id = 'nox'; st.textContent = '*, *::before, *::after { transform: none !important; scale: none !important; translate: none !important; transition: none !important; animation: none !important; }'; document.head.appendChild(st); }
      const per = {}, out = [];
      document.querySelectorAll('[data-px]').forEach((e) => delete e.dataset.px); // indexes from the page underneath
      [...document.querySelectorAll(scope + ' [data-focus]:not([disabled])')].forEach((e, i) => { e.dataset.px = i; const b = e.getBoundingClientRect(); if (!b.width || !b.height || b.top < 0 || b.bottom > innerHeight - 90 || b.left < 0 || b.right > innerWidth) return; const k = (e.className.toString().split(' ').filter((c) => !/^(on|active|sel|glass)$/.test(c))[0] || e.tagName); per[k] = (per[k] || 0) + 1; if (per[k] <= 2) out.push([i, k, (e.textContent || '').trim().slice(0, 22)]); });
      return out;
    }, scope);
    for (const [i, k, txt] of items) {
      const box = await p.evaluate((i) => { const el = document.querySelector(`[data-px="${i}"]`); let park = document.getElementById('ax-park'); if (!park) { park = document.createElement('button'); park.id = 'ax-park'; park.style.cssText = 'position:fixed;left:-200px;top:0'; } (el.closest('.dialog, .pane, main') || document.body).appendChild(park); park.focus(); /* not blur(): nav.js puts focus back when it falls to the page */ const b = document.querySelector(`[data-px="${i}"]`).getBoundingClientRect(); return { x: Math.max(0, b.x - 8), y: Math.max(0, b.y - 8), width: Math.min(innerWidth - Math.max(0, b.x - 8), b.width + 16), height: Math.min(innerHeight - Math.max(0, b.y - 8), b.height + 16) }; }, i);
      await p.waitForTimeout(260);
      const a = PNG.sync.read(await p.screenshot({ clip: box, animations: 'disabled' }));
      await p.evaluate((i) => document.querySelector(`[data-px="${i}"]`).focus({ preventScroll: true }), i);
      await p.waitForTimeout(420);
      const b = PNG.sync.read(await p.screenshot({ clip: box, animations: 'disabled' }));
      let changed = 0; const n = Math.min(a.data.length, b.data.length) / 4;
      for (let j = 0; j < n; j++) if (Math.max(Math.abs(a.data[j * 4] - b.data[j * 4]), Math.abs(a.data[j * 4 + 1] - b.data[j * 4 + 1]), Math.abs(a.data[j * 4 + 2] - b.data[j * 4 + 2])) > 70) changed++;
      // visible: 4% of the box changed, or a ring at least 1.2 px wide all the way round (big tiles have thin rings)
      if (changed / n < 0.04 && changed < 1.2 * 2 * (box.width + box.height)) bad.push(`${label} | ${k} "${txt}" ${((changed / n) * 100).toFixed(1)}%`);
    }
  };
  for (const t of TABS) { await p.click(`[data-tab="${t}"]`).catch(() => {}); await p.waitForTimeout(600); await audit(t); }
  await p.click('[data-tab="settings"]'); await p.waitForTimeout(600);
  for (const k of await p.evaluate(() => [...document.querySelectorAll('[data-key^="sec-"]')].map((e) => e.dataset.key))) { await p.evaluate(() => document.querySelector(".hub-back")?.click()); await p.waitForTimeout(200); await p.click(`[data-key="${k}"]`).catch(() => {}); await audit('settings ' + k, '.pane'); }
  await p.click('[data-tab="library"]'); await p.waitForTimeout(800); await p.locator('.card').first().click(); await p.waitForTimeout(1200); await audit('game page');
  await p.keyboard.press('y'); await p.waitForTimeout(1200); await audit('More sheet', '.dialog');
  await browser.close();
  return { bad, errors };
}
module.exports = run;
if (require.main === module) (async () => {
  const looks = process.argv[2] ? [[process.argv[2], process.argv[3] || 'plain']] : LOOKS;
  let total = 0;
  for (const [th, st] of looks) { const { bad, errors } = await run(th, st); total += bad.length; console.log(`== ${th} ${st}: ${bad.length} hard to see${errors.length ? `, ${errors.length} page errors` : ''}`); for (const x of bad) console.log('  ' + x); for (const e of errors) console.log('  ERROR ' + e); }
  process.exitCode = total ? 1 : 0;
})();
