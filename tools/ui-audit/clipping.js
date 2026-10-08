// Clipping audit (0.9.49, owner: "always look for things that are clipping"): text that its box cuts off. Every line
// of text on a page is measured against the nearest box around it that hides what overflows (overflow hidden or clip);
// a line that box cuts through (part shown, part not) is reported. Scrolling boxes are skipped (what's past their edge
// is reachable), and so are single-line texts that end in an ellipsis on purpose and Start's page overview (scaled
// pictures of pages). Runs every main page, each Settings section and the game page at 1280x800 and 1920x1080, then
// every Start widget at the common sizes.
// Usage: node tools/ui-audit/clipping.js   (exits 1 when anything is cut)
const { open, TABS } = require('./harness.js');

const SCAN = () => {
  const out = [];
  const hides = (s) => /hidden|clip/.test(s.overflowX) || /hidden|clip/.test(s.overflowY);
  const scrolls = (s) => /auto|scroll/.test(s.overflowX) || /auto|scroll/.test(s.overflowY);
  const clipper = (el) => { for (let a = el; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (scrolls(s)) return null; if (hides(s)) return a; } return null; };
  const path = (el) => { const p = []; for (let a = el; a && a !== document.body && p.length < 4; a = a.parentElement) p.unshift(a.tagName.toLowerCase() + (a.classList[0] ? '.' + a.classList[0] : '')); return p.join(' > '); };
  // 0.9.60: an open pop-up is scanned instead of the page under it (pop-ups were never looked at)
  const root = document.querySelector('.scrim .dialog') || document.querySelector('main.main') || document.body;
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const text = n.textContent.trim();
    if (text.length < 2) continue;
    const el = n.parentElement;
    if (!el || !el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) || el.closest('.st-ov, [aria-hidden="true"], .morph-fly')) continue;
    const es = getComputedStyle(el);
    if (es.textOverflow === 'ellipsis' && es.whiteSpace === 'nowrap') continue;
    // the text's own box (with a parent's transform) is what the eye sees
    const c = clipper(el); if (!c) continue;
    const cr = c.getBoundingClientRect(), cs = getComputedStyle(c);
    const box = { l: cr.left + parseFloat(cs.borderLeftWidth), t: cr.top + parseFloat(cs.borderTopWidth), r: cr.right - parseFloat(cs.borderRightWidth), b: cr.bottom - parseFloat(cs.borderBottomWidth) };
    if (cr.width < 4 || cr.height < 4) continue;
    // a text cut to whole lines on purpose (-webkit-line-clamp, with its ellipsis): its own box must fit, the hidden
    // lines don't count
    const clampEl = el.closest('*') && [el, el.parentElement].find((x) => x && getComputedStyle(x).webkitLineClamp !== 'none');
    const range = document.createRange(); range.selectNodeContents(n);
    const lines = clampEl ? [clampEl.getBoundingClientRect()] : [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
    const shown = lines.filter((r) => r.bottom > box.t && r.top < box.b && r.right > box.l && r.left < box.r);
    if (!shown.length) continue; // wholly outside: a hidden slide or a rolled-away row, not a cut
    // a line's box is the font's full height; the part past the letters (about a tenth of the size above and below) can
    // go under an edge without cutting anything you see
    const fs = parseFloat(es.fontSize) || 16, tol = Math.max(1.5, fs * 0.1);
    const cut = lines.some((r) => (r.top < box.b - 1 && r.bottom > box.b + tol) || (r.bottom > box.t + 1 && r.top < box.t - tol) || (r.left < box.r - 1 && r.right > box.r + 1.5) || (r.right > box.l + 1 && r.left < box.l - 1.5)) || shown.length < lines.length;
    if (cut) out.push(`${path(el)} | "${text.slice(0, 50)}"`);
  }
  // 0.9.60 (owner's photo: two texts drawn over each other): lines of different texts that overlap, which no clipping box
  // catches. Text over a picture or inside a scrolled-away part is skipped; a few px of touching is allowed.
  const lines = [];
  const tw2 = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = tw2.nextNode(); n; n = tw2.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent.trim() || !el || !el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) || el.closest('.st-ov, [aria-hidden="true"], .morph-fly, .sr-only')) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    for (const b of r.getClientRects()) if (b.width > 2 && b.height > 2) lines.push({ el, b, t: n.textContent.trim().slice(0, 40) });
  }
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const A = lines[i], B = lines[j];
    if (A.el === B.el || A.el.contains(B.el) || B.el.contains(A.el)) continue;
    const w = Math.min(A.b.right, B.b.right) - Math.max(A.b.left, B.b.left), h = Math.min(A.b.bottom, B.b.bottom) - Math.max(A.b.top, B.b.top);
    if (w > 4 && h > Math.min(A.b.height, B.b.height) * 0.4) out.push(`overlap: ${path(A.el)} "${A.t}" with ${path(B.el)} "${B.t}"`);
  }
  return [...new Set(out)];
};

async function pages(width, height) {
  const { browser, page: p, errors } = await open({ width, height, long: true });
  await p.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' }).catch(() => {});
  const bad = new Set();
  const scan = async (label) => { await p.waitForTimeout(600); for (const x of await p.evaluate(SCAN)) bad.add(`${width}x${height} ${label} | ${x}`); };
  for (const t of TABS) { await p.click(`[data-tab="${t}"]`).catch(() => {}); await scan(t); }
  await p.click('[data-tab="settings"]').catch(() => {}); await p.waitForTimeout(600);
  for (const k of await p.evaluate(() => [...document.querySelectorAll('[data-key^="sec-"]')].map((e) => e.dataset.key))) { await p.click(`[data-key="${k}"]`).catch(() => {}); await scan('settings ' + k); }
  await p.click('[data-tab="library"]').catch(() => {}); await p.waitForTimeout(800); await p.locator('.card').first().click().catch(() => {}); await scan('game page');
  // 0.9.60: the pages and pop-ups the audits never visited (owner's photos: a trophy page, the keyboard's suggestions)
  await p.click('[data-tab="achievements"]').catch(() => {}); await p.waitForTimeout(700); await p.locator('.aa-row, .aa-card, [data-key^="ach-"]').first().click().catch(() => {}); await scan('trophy game page');
  await p.click('[data-tab="consoles"]').catch(() => {}); await p.waitForTimeout(500);
  await p.evaluate(() => { window.__cartStore?.openModal?.('keyboard', { title: 'Search games', value: 'Ratchet & Clank: Size Matters', mode: 'game' }); }).catch(() => {}); await scan('keyboard with suggestions');
  await p.keyboard.press('Escape').catch(() => {});
  for (const [type, props] of [['savelocations', {}], ['folderview', { path: '/home/u/.config/PCSX2/memcards' }]]) { await p.evaluate(([t, pr]) => { window.__cartStore?.openModal?.(t, pr); }, [type, props]).catch(() => {}); await scan('pop-up ' + type); await p.evaluate(() => window.__cartStore?.closeModal?.(null)).catch(() => {}); }
  await browser.close();
  return { bad: [...bad], errors };
}
// every widget at the sizes people use, laid out on Start's 8 by 4 board
async function widgets(width, height) {
  const types = ['continue', 'clock', 'storage', 'week', 'consoles', 'fresh', 'recent', 'trophies', 'downloads', 'favs', 'recs', 'surprise', 'game', 'console', 'stats', 'daily', 'cgames', 'cstats', 'emulator', 'spotlight', 'media', 'shelf'];
  const sizes = [[2, 1], [2, 2], [4, 1], [4, 2], [3, 1], [1, 1]];
  const extra = (type) => ({ platformId: 1, romId: 1, console: type === 'trophies' ? undefined : 'ps2', emu: 'pcsx2' });
  const bad = new Set(), errors = [];
  for (const [w, h] of sizes) {
    const per = Math.floor(8 / w) * Math.floor(4 / h);
    for (let i = 0; i < types.length; i += per) {
      const tiles = types.slice(i, i + per).map((type, j) => ({ id: type + j, type, w, h, x: (j % Math.floor(8 / w)) * w, y: Math.floor(j / Math.floor(8 / w)) * h, ...extra(type) }));
      const { browser, page: p, errors: e } = await open({ width, height, long: true, ui: { start: { tiles } } });
      await p.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' }).catch(() => {});
      await p.waitForTimeout(900);
      for (const x of await p.evaluate(SCAN)) bad.add(`${width}x${height} widget ${w}x${h} | ${x}`);
      errors.push(...e);
      await browser.close();
    }
  }
  return { bad: [...bad], errors };
}
module.exports = { pages, widgets, SCAN };
if (require.main === module) (async () => {
  let n = 0;
  for (const [w, h] of [[1280, 800], [1920, 1080]]) {
    for (const r of [await pages(w, h), await widgets(w, h)]) { n += r.bad.length; for (const x of r.bad) console.log('CUT  ' + x); for (const e of r.errors.slice(0, 5)) console.log('ERROR ' + e); }
  }
  console.log(`== ${n} cut text${n === 1 ? '' : 's'}`);
  process.exitCode = n ? 1 : 0;
})();
