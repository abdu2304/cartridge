// Controller playtest (0.9.70): the app played with the controller's buttons only (D-pad = arrows, A = Enter, B =
// Escape, LT/RT = Page Up/Down, LB/RB = Q/E, X, Y, Start = M), as several kinds of player. After every press it
// notes where focus is and reports what a player would trip over:
//   lost      focus fell to the page itself (nothing highlighted)
//   hidden    the highlighted thing is off screen or under the Dock
//   island    an element no D-pad direction leaves (a dead end)
//   trapped   B pressed six times and still not back on a main page
//   noclose   B on an open pop-up didn't close it
//   tabs      LT/RT didn't visit every tab
//   error     a script error on the page
// Usage: npx vite build && node tools/ui-audit/playtest.js   (writes .ui-audit/playtest.json too)
const fs = require('fs');
const path = require('path');
const { open } = require('./harness.js');

const WHERE = () => {
  const a = document.activeElement, m = document.querySelector('.scrim .dialog');
  const route = window.__cartStore?.route?.name || '';
  if (!a || a === document.body || a === document.documentElement) return { lost: true, route, modal: !!m };
  const r = a.getBoundingClientRect(), dock = document.querySelector('.tabs')?.getBoundingClientRect();
  const off = r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth;
  const under = !m && dock && !a.closest('.tabs, .topbar, header') && r.top > dock.top - 4 && r.left < dock.right && r.right > dock.left;
  const id = a.dataset.key || (a.className && String(a.className).split(' ')[0]) || a.tagName.toLowerCase();
  return { id: `${id}|${(a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 30)}`, route, modal: !!m, off, under, x: Math.round(r.left), y: Math.round(r.top) };
};

async function run() {
  const { browser, page: p, errors } = await open({ width: 1280, height: 800 });
  await p.addStyleTag({ content: '*, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; }' }).catch(() => {});
  await p.waitForTimeout(1500);
  const found = [], seen = new Set();
  const note = (kind, who, where, what) => { const k = `${kind}|${where}|${what}`; if (seen.has(k)) return; seen.add(k); found.push({ kind, who, where, what }); };
  const trail = [];
  const press = async (k, wait = 160) => { await p.keyboard.press(k); await p.waitForTimeout(wait); const w = await p.evaluate(WHERE); trail.push(`${k}>${w.route}${w.modal ? '+pop' : ''}:${w.id || 'LOST'}`); return w; };
  const check = (who, w, after) => {
    if (w.lost) note('lost', who, w.route + (w.modal ? ' (pop-up)' : ''), 'after ' + after);
    else if (w.off) note('hidden', who, w.route, `${w.id} is off screen after ${after}`);
    else if (w.under) note('hidden', who, w.route, `${w.id} sits under the Dock after ${after}`);
  };
  const home = async () => { for (let i = 0; i < 6; i++) { const w = await p.evaluate(WHERE); if (!w.modal && ['start', 'home', 'library', 'consoles', 'achievements', 'downloads', 'settings'].includes(w.route)) return true; await press('Escape', 250); } return false; };
  // walk: every direction from where we are, a few steps, looking for dead ends
  const walk = async (who, steps = 40) => {
    const dirs = ['ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowRight', 'ArrowDown'];
    for (let i = 0; i < steps; i++) {
      const before = await p.evaluate(WHERE), k = dirs[i % dirs.length];
      const w = await press(k); check(who, w, k);
      if (!before.lost && w.id === before.id) {
        const moves = [];
        for (const d of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) { const x = await press(d, 120); moves.push(x.id !== before.id); if (x.id !== before.id) break; }
        if (!moves.some(Boolean)) note('island', who, before.route + (before.modal ? ' (pop-up)' : ''), `${before.id}: no direction leaves it`);
      }
    }
  };

  // 1. the first-timer: every tab with LT/RT, then the same tabs back
  {
    const who = 'first-timer', routes = new Set();
    for (let i = 0; i < 8; i++) { const w = await press('PageDown', 450); routes.add(w.route); check(who, w, 'RT'); }
    for (const t of ['start', 'home', 'library', 'consoles', 'achievements', 'downloads', 'settings']) if (![...routes].includes(t)) note('tabs', who, t, 'RT never reached this tab');
  }
  // 2. the browser: Library and Consoles, open games, More, back out
  {
    const who = 'browser';
    for (const tab of ['library', 'consoles', 'home']) {
      await p.click(`[data-tab="${tab}"]`).catch(() => {}); await p.waitForTimeout(500);
      await press('ArrowDown'); await walk(who, 24);
      const w = await press('Enter', 700); check(who, w, 'A on ' + tab);
      if (w.route === 'game') {
        await walk(who, 16);
        await press('y', 500); const m = await p.evaluate(WHERE);
        if (m.modal) { await walk(who, 12); const c = await press('Escape', 400); if (c.modal) note('noclose', who, 'game More', 'B left the More sheet open'); }
      }
      if (!(await home())) note('trapped', who, w.route, 'B six times did not get back to a main page');
    }
  }
  // 3. the tinkerer: every Settings section, its pages with LB/RB, rows opened and closed
  {
    const who = 'tinkerer';
    await p.click('[data-tab="settings"]').catch(() => {}); await p.waitForTimeout(500);
    const secs = await p.evaluate(() => [...document.querySelectorAll('[data-key^="sec-"]')].map((e) => e.dataset.key));
    for (const s of secs) {
      await p.evaluate(() => document.querySelector(".hub-back")?.click()); await p.waitForTimeout(200);
      await p.click(`[data-key="${s}"]`).catch(() => {}); await p.waitForTimeout(300);
      await press('ArrowRight'); await walk(who, 20);
      for (const k of ['e', 'e', 'q']) { const w = await press(k, 300); check(who, w, (k === 'e' ? 'RB' : 'LB') + ' in ' + s); }
      const w = await press('Enter', 500); check(who, w, 'A in ' + s);
      if (w.modal) { await walk(who, 8); const c = await press('Escape', 400); if (c.modal) note('noclose', who, s, 'B left a pop-up open'); }
      const b = await press('Escape', 300); check(who, b, 'B in ' + s);
    }
    if (!(await home())) note('trapped', who, 'settings', 'B did not get back');
  }
  // 4. the arranger: Start, hold A, move a tile, size it, leave
  {
    const who = 'arranger';
    await p.click('[data-tab="start"]').catch(() => {}); await p.waitForTimeout(500);
    await press('ArrowDown');
    await p.keyboard.down('Enter'); await p.waitForTimeout(650); await p.keyboard.up('Enter'); await p.waitForTimeout(400);
    const editing = await p.evaluate(() => !!document.querySelector('.start.editing'));
    if (!editing) note('island', who, 'start', 'holding A did not start arranging');
    for (const k of ['Enter', 'ArrowRight', 'ArrowDown', 'Enter', 'x', 'ArrowRight', 'Escape', 'Escape']) { const w = await press(k, 260); check(who, w, k + ' while arranging'); }
    if (await p.evaluate(() => !!document.querySelector('.start.editing'))) note('trapped', who, 'start', 'B twice did not leave arranging');
  }
  // 5. the port player: Consoles → Steam card → Recomps, a verified game's sheet, its settings, back out
  {
    const who = 'port player';
    await p.click('[data-tab="consoles"]').catch(() => {}); await p.waitForTimeout(500);
    await p.click('[data-key="sys-steam"]').catch(() => {}); await p.waitForTimeout(700);
    await walk(who, 16);
    await p.evaluate(() => { window.__cartStore?.openModal?.('verified', { id: 'uncharted' }); }); await p.waitForTimeout(600);
    let w = await p.evaluate(WHERE); check(who, w, 'opening a verified sheet');
    await walk(who, 12);
    w = await press('Escape', 400); if (w.modal) note('noclose', who, 'verified sheet', 'B left it open');
    await p.evaluate(() => { window.__cartStore?.openModal?.('gamesettings', { recomp: 'uncharted', name: 'Uncharted' }); }); await p.waitForTimeout(600);
    await walk(who, 10); for (const k of ['e', 'q']) check(who, await press(k, 300), k === 'e' ? 'RB in port settings' : 'LB in port settings');
    w = await press('Escape', 400); if (w.modal) note('noclose', who, 'port settings', 'B left it open');
    if (!(await home())) note('trapped', who, 'recomps', 'B did not get back');
  }
  for (const e of errors) note('error', 'any', '', e);
  if (process.env.TRAIL) fs.writeFileSync(process.env.TRAIL, trail.join('\n'));
  await browser.close();
  return found;
}
if (require.main === module) run().then((f) => {
  for (const x of f) console.log(`${x.kind.padEnd(8)} ${x.who.padEnd(12)} ${x.where} | ${x.what}`);
  console.log(`== playtest: ${f.length} thing${f.length === 1 ? '' : 's'} to look at`);
  try { fs.mkdirSync(path.join(__dirname, '../../.ui-audit'), { recursive: true }); fs.writeFileSync(path.join(__dirname, '../../.ui-audit/playtest.json'), JSON.stringify(f, null, 1)); } catch {}
  process.exitCode = f.length ? 1 : 0;
});
module.exports = { run };
