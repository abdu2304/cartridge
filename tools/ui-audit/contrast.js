// Contrast audit (0.9.47): text whose colour, against the solid colour behind it, is under 2.6:1, on every main page,
// each Settings section, the game page and each tab of its More sheet, plain and focused (pale text on Light, a
// chosen colour that hides a label). Text over pictures or gradients is skipped (it can't be measured this way),
// so a short list is the goal, not an empty one: look at each line before changing anything.
// Usage: node tools/ui-audit/contrast.js [theme] [style]   (no arguments: all six looks)
const { open, TABS, LOOKS } = require('./harness.js');
async function run(theme, style) {
  const { browser, page: p, errors } = await open({ theme, style });
  const bad = new Set();
  const audit = async (label, scope, focusToo = true) => {
    await p.waitForTimeout(700);
    const r = await p.evaluate(async ([scope, focusToo]) => {
      if (!document.getElementById('nox')) { const st = document.createElement('style'); st.id = 'nox'; st.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }'; document.head.appendChild(st); }
      document.body.classList.add('pad-mode'); document.body.classList.remove('touch-mode', 'mouse-mode');
      // rgb()/rgba() are 0-255; color(srgb r g b / a), what color-mix() computes to, is 0-1 (0.9.52: it read as near black)
      const parse = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const k = /^color\(srgb/.test(c) ? 255 : 1; return [+m[0] * k, +m[1] * k, +m[2] * k, m[3] == null ? 1 : +m[3]]; };
      // text drawn over a picture (a cover, art, a canvas) can't be measured against a solid colour: skipped, as the note says
      const overPicture = (el) => { const r = el.getBoundingClientRect(); for (let a = el.parentElement, n = 0; a && n < 6; a = a.parentElement, n++) for (const m of [...a.querySelectorAll('img, canvas, video'), ...[...a.children].filter((c) => /url\(/.test(getComputedStyle(c).backgroundImage))]) { if (el.contains(m)) continue; const q = m.getBoundingClientRect(); if (q.width > 40 && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top) return true; } return false; };
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const bgOf = (el) => { let acc = null; const ink = el.matches?.('.seg.inked > button.on') && el.parentElement.querySelector(':scope > .seg-ink'); if (ink && parse(getComputedStyle(el).backgroundColor)?.[3] === 0) el = ink; /* 0.9.57: a chosen button in a segmented control sits on the sliding pill (.seg-ink), a sibling */ for (let a = el; a; a = a.parentElement) { const s = getComputedStyle(a); if (s.backgroundImage !== 'none') return null; const c = parse(s.backgroundColor); if (c && c[3] > 0) { acc = acc ? [acc[0] * acc[3] + c[0] * (1 - acc[3]), acc[1] * acc[3] + c[1] * (1 - acc[3]), acc[2] * acc[3] + c[2] * (1 - acc[3]), acc[3] + c[3] * (1 - acc[3])] : c; if (acc[3] > 0.92) return acc; } if (s.backdropFilter && s.backdropFilter !== 'none') return null; } const b = parse(getComputedStyle(document.body).backgroundColor); return acc ? [acc[0] * acc[3] + b[0] * (1 - acc[3]), acc[1] * acc[3] + b[1] * (1 - acc[3]), acc[2] * acc[3] + b[2] * (1 - acc[3]), 1] : b; };
      const check = (root, tag) => { const out = []; for (const el of root.querySelectorAll('*')) { if (!el.offsetParent) continue; if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)) continue; const s = getComputedStyle(el); if (+s.opacity < 0.3 || s.visibility === 'hidden') continue; const r = el.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > innerHeight) continue; const bg = bgOf(el); if (!bg || overPicture(el)) continue; const fg = parse(s.color); if (!fg) continue; const f = [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])); const cr = ratio(f, bg); if (cr < 2.6) out.push(`${tag}${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')} "${el.textContent.trim().slice(0, 24)}" ${cr.toFixed(2)}`); } return out; };
      const root = document.querySelector(scope) || document.body;
      let out = check(root, '');
      if (focusToo) { const seen = new Set(); for (const el of root.querySelectorAll('[data-focus]')) { const k = el.className.toString().split(' ')[0]; if (seen.has(k) || !el.offsetParent) continue; seen.add(k); el.focus({ preventScroll: true }); await new Promise((r) => setTimeout(r, 30)); out = out.concat(check(el, 'FOCUSED ')); } document.activeElement?.blur(); }
      return [...new Set(out)];
    }, [scope, focusToo]);
    for (const x of r) bad.add(label + ' | ' + x);
  };
  for (const t of TABS) { await p.click(`[data-tab="${t}"]`).catch(() => {}); await p.waitForTimeout(600); await audit(t, 'main.main'); }
  await audit('dock', '.tabs', false);
  await p.click('[data-tab="settings"]'); await p.waitForTimeout(600);
  for (const k of await p.evaluate(() => [...document.querySelectorAll('[data-key^="sec-"]')].map((e) => e.dataset.key))) { await p.click(`[data-key="${k}"]`).catch(() => {}); await audit('settings ' + k, '.pane'); }
  await p.click('[data-tab="library"]'); await p.waitForTimeout(800); await p.locator('.card').first().click(); await p.waitForTimeout(1200); await audit('game page', 'main.main');
  await p.keyboard.press('y'); await p.waitForTimeout(1200);
  for (let i = 0; i < 5; i++) { await audit('More tab ' + i, '.dialog'); await p.keyboard.press('e'); await p.waitForTimeout(500); }
  // 0.9.60 (owner's photo: pale trophy counts in Light): a game's trophy page and the pop-ups the audits never opened
  await p.evaluate(() => window.__cartStore?.closeModal?.(null)).catch(() => {}); await p.waitForTimeout(400);
  await p.click('[data-tab="achievements"]').catch(() => {}); await p.waitForTimeout(800);
  await p.locator('.aa-row, .aa-card').first().click().catch(() => {}); await p.waitForTimeout(1000); await audit('trophy game page', 'main.main');
  for (const [type, props] of [['savelocations', {}], ['folderview', { path: '/home/u/.config/PCSX2/memcards' }]]) {
    await p.evaluate(([t, pr]) => { window.__cartStore?.openModal?.(t, pr); }, [type, props]).catch(() => {}); await p.waitForTimeout(900);
    await audit('pop-up ' + type, '.dialog');
    await p.evaluate(() => window.__cartStore?.closeModal?.(null)).catch(() => {}); await p.waitForTimeout(400);
  }
  await browser.close();
  return { bad: [...bad], errors };
}
module.exports = run;
if (require.main === module) (async () => {
  const looks = process.argv[2] ? [[process.argv[2], process.argv[3] || 'plain']] : LOOKS;
  for (const [th, st] of looks) { const { bad, errors } = await run(th, st); console.log(`== ${th} ${st}: ${bad.length} low-contrast texts${errors.length ? `, ${errors.length} page errors` : ''}`); for (const x of bad) console.log('  ' + x); for (const e of errors) console.log('  ERROR ' + e); }
})();
