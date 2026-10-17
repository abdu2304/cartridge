// Settings, row by row (0.9.71, handover Part 9 item 19): every section and every page in it (its tab row, LB/RB) is
// opened and each row read for what a person would see as broken or unclear: undefined/null/NaN/[object] in text, a
// value left empty beside its label, a switch or row with a label and nothing saying what it does, a button with no
// words. Prints each finding with where it is; exits 1 when there is broken text.
// Usage: npx vite build && node tools/ui-audit/rows.js
const { open } = require('./harness.js');

const SCAN = () => {
  const root = document.querySelector('.pane') || document.body;
  const vis = (el) => el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true });
  const txt = (el) => (el.innerText || '').replace(/\s+/g, ' ').trim();
  const out = { broken: [], empty: [], unclear: [] };
  for (const el of root.querySelectorAll('*')) {
    if (!vis(el) || el.children.length) continue;
    const t = txt(el);
    if (/\b(undefined|null|NaN)\b|\[object /.test(t)) out.broken.push(t.slice(0, 90));
  }
  for (const kv of root.querySelectorAll('.kv')) if (vis(kv) && kv.children.length >= 2 && !txt(kv.children[1])) out.empty.push(txt(kv.children[0]));
  for (const row of root.querySelectorAll('.toggle, .row')) {
    if (!vis(row)) continue;
    const label = row.querySelector('.lbl, .t-label, b');
    if (label && txt(row) === txt(label) && !row.querySelector('button, .seg, input, select')) out.unclear.push(txt(label));
  }
  for (const b of root.querySelectorAll('button')) if (vis(b) && !txt(b) && !b.getAttribute('aria-label') && !b.getAttribute('title')) out.unclear.push('a button with no words: ' + (b.className || 'button'));
  return out;
};

(async () => {
  const { browser, page: p } = await open({ width: 1280, height: 800 });
  await p.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' }).catch(() => {});
  const res = { broken: new Set(), empty: new Set(), unclear: new Set() };
  await p.click('[data-tab="settings"]').catch(() => {}); await p.waitForTimeout(600);
  const secs = await p.evaluate(() => [...document.querySelectorAll('[data-key^="sec-"]')].map((e) => e.dataset.key));
  let pages = 0;
  for (const k of secs) {
    await p.evaluate(() => document.querySelector('.hub-back')?.click()); await p.waitForTimeout(200);
    await p.click(`[data-key="${k}"]`).catch(() => {}); await p.waitForTimeout(500);
    // its pages: the first tab row in the pane (LB/RB), each pressed in turn
    const tabs = await p.evaluate(() => [...(document.querySelector('.pane .lookpages .seg, .pane .seg.strip')?.querySelectorAll('button') || [])].map((b, i) => i));
    for (const i of tabs.length ? tabs : [-1]) {
      if (i >= 0) { await p.evaluate((n) => document.querySelector('.pane .lookpages .seg, .pane .seg.strip')?.querySelectorAll('button')[n]?.click(), i); await p.waitForTimeout(450); }
      const where = `${k}${i >= 0 ? ' page ' + (i + 1) : ''}`;
      const r = await p.evaluate(SCAN); pages++;
      for (const key of Object.keys(res)) for (const x of r[key]) res[key].add(`${where} | ${x}`);
    }
  }
  await browser.close();
  console.log(`== Settings rows: ${secs.length} sections, ${pages} pages`);
  for (const [k, label] of [['broken', 'Broken text'], ['empty', 'Values left empty'], ['unclear', 'Rows that say nothing more than their name']]) { console.log(`-- ${label}: ${res[k].size}`); for (const x of res[k]) console.log('   ' + x); }
  process.exit(res.broken.size ? 1 : 0);
})();
